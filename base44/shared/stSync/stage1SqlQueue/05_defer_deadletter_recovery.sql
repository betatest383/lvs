-- ============================================================
-- 05_defer_deadletter_recovery.sql
-- UNPROVISIONED DESIGN ARTIFACT.
-- ============================================================
-- Ownership rules:
--   defer_sync_request: requires status='processing', claimed_by=worker,
--     lease_expires_at > now(). Returns lease_expired on expired lease.
--   dead_letter_sync_request: for a 'processing' request requires
--     claimed_by=worker AND lease valid. A caller may NOT bypass
--     ownership by supplying a request whose claimed_by is null.
--   System-driven stale recovery uses recover_stale_sync_requests,
--     which performs its own direct status transition and is the only
--     path that reclaims an expired lease.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- defer_sync_request — dependency deferral (NOT a failure).
--   Increments dependency_deferral_count, does NOT consume the
--   normal failure retry budget. Uses a short retry delay.
--   Returns: deferred | lease_expired | ownership_lost | not_processing | not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION defer_sync_request(
  p_request_id         uuid,
  p_worker_id         text,
  p_missing_dependency text,
  p_deferral_delay_s   integer DEFAULT 30
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status sync_request_status;
  v_owner  text;
  v_lease  timestamptz;
BEGIN
  SELECT status, claimed_by, lease_expires_at
    INTO v_status, v_owner, v_lease
  FROM sync_requests WHERE request_id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'processing' THEN RETURN 'not_processing'; END IF;
  IF v_owner <> p_worker_id THEN RETURN 'ownership_lost'; END IF;
  IF v_lease IS NULL OR v_lease <= clock_timestamp() THEN RETURN 'lease_expired'; END IF;

  UPDATE sync_requests
    SET status                     = 'deferred',
        dependency_deferral_count   = dependency_deferral_count + 1,
        claimed_by                  = NULL,
        claimed_at                  = NULL,
        lease_expires_at            = NULL,
        processing_heartbeat_at     = NULL,
        visible_at                  = clock_timestamp() + make_interval(secs => p_deferral_delay_s),
        last_error_code             = 'DEPENDENCY_DEFERRED',
        last_error_message          = left(p_missing_dependency, 2000)
  WHERE request_id = p_request_id;

  RETURN 'deferred';
END $$;

-- ------------------------------------------------------------
-- dead_letter_sync_request — terminal failure handling.
--   Only the current owner of a 'processing' request with a valid
--   lease may dead-letter it. A null claimed_by does NOT authorize
--   the caller. System-driven stale recovery (expired lease) is
--   handled exclusively by recover_stale_sync_requests.
--   Returns: dead_lettered | lease_expired | ownership_lost
--          | not_processing | not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION dead_letter_sync_request(
  p_request_id    uuid,
  p_worker_id     text,
  p_error_code    text,
  p_error_message text
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status sync_request_status;
  v_owner  text;
  v_lease  timestamptz;
BEGIN
  SELECT status, claimed_by, lease_expires_at
    INTO v_status, v_owner, v_lease
  FROM sync_requests WHERE request_id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'processing' THEN RETURN 'not_processing'; END IF;
  IF v_owner IS NULL OR v_owner <> p_worker_id THEN RETURN 'ownership_lost'; END IF;
  IF v_lease IS NULL OR v_lease <= clock_timestamp() THEN RETURN 'lease_expired'; END IF;

  UPDATE sync_requests
    SET status              = 'dead_letter',
        dead_lettered_at     = clock_timestamp(),
        claimed_by           = NULL,
        claimed_at           = NULL,
        lease_expires_at     = NULL,
        processing_heartbeat_at = NULL,
        last_error_code      = p_error_code,
        last_error_message   = left(p_error_message, 2000)
  WHERE request_id = p_request_id
    AND status = 'processing'
    AND claimed_by = p_worker_id;

  RETURN 'dead_lettered';
END $$;

-- ------------------------------------------------------------
-- recover_stale_sync_requests — stale-worker recovery (system path).
--   Finds processing rows whose lease has expired and returns them
--   to an eligible retry state, or dead-letters when attempts are
--   exhausted. Safe under concurrent recovery workers because each
--   row is locked (FOR UPDATE SKIP LOCKED) before the status change.
--   This is the ONLY path that reclaims an expired lease; it performs
--   direct status transitions and does not call dead_letter_sync_request
--   (which requires a valid lease owner).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recover_stale_sync_requests(
  p_recovery_batch_limit integer DEFAULT 100,
  p_immediate_visible     boolean DEFAULT false
) RETURNS TABLE (request_id uuid, serialization_key text, prior_worker text)
LANGUAGE plpgsql AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT request_id, serialization_key, claimed_by, attempt_number, max_attempts
    FROM sync_requests
    WHERE status = 'processing'
      AND lease_expires_at < v_now
    ORDER BY lease_expires_at
    LIMIT p_recovery_batch_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    -- If attempts exhausted, dead-letter directly (system path).
    IF v_rec.attempt_number >= v_rec.max_attempts THEN
      UPDATE sync_requests
        SET status = 'dead_letter',
            dead_lettered_at = v_now,
            claimed_by = NULL, claimed_at = NULL,
            lease_expires_at = NULL, processing_heartbeat_at = NULL,
            last_error_code = 'LEASE_EXPIRED_EXHAUSTED'
      WHERE request_id = v_rec.request_id;
    ELSE
      UPDATE sync_requests
        SET status                  = 'queued',
            claimed_by               = NULL,
            claimed_at               = NULL,
            lease_expires_at          = NULL,
            processing_heartbeat_at  = NULL,
            visible_at               = CASE WHEN p_immediate_visible
                                           THEN v_now
                                           ELSE v_now + make_interval(secs => 10) END,
            last_error_code          = 'LEASE_EXPIRED'
      WHERE request_id = v_rec.request_id;
    END IF;

    RETURN QUERY SELECT v_rec.request_id, v_rec.serialization_key, v_rec.claimed_by;
  END LOOP;

  RETURN;
END $$;

-- ------------------------------------------------------------
-- list_dead_letters — read-only administrative inspection.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_dead_letters(
  p_tenant_id text DEFAULT NULL,
  p_domain    sync_domain DEFAULT NULL,
  p_limit     integer DEFAULT 100
) RETURNS TABLE (
  request_id uuid, idempotency_key text, tenant_id text, domain sync_domain,
  serialization_key text, attempt_number integer, dead_lettered_at timestamptz,
  last_error_code text, last_error_message text
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT r.request_id, r.idempotency_key, r.tenant_id, r.domain,
           r.serialization_key, r.attempt_number, r.dead_lettered_at,
           r.last_error_code, r.last_error_message
    FROM sync_requests r
    WHERE r.status = 'dead_letter'
      AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
      AND (p_domain IS NULL OR r.domain = p_domain)
    ORDER BY r.dead_lettered_at DESC
    LIMIT p_limit;
END $$;

COMMIT;