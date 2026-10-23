-- ============================================================
-- 04_heartbeat_complete_retry.sql
-- UNPROVISIONED DESIGN ARTIFACT.
-- ============================================================
-- Lease model (Stage 1 defaults):
--   heartbeat interval: 30 s
--   lease duration:     120 s
-- Rationale: 4x heartbeat within a lease gives ample margin to detect a
-- stalled worker before lease expiry while keeping DB write volume modest.
-- See VERIFICATION_REPORT.md for final values.
--
-- Ownership-sensitive operations (heartbeat / complete / retry / defer)
-- require ALL of:
--   status          = 'processing'
--   claimed_by      = supplied worker_id
--   lease_expires_at > clock_timestamp()
-- A worker whose lease has expired receives 'lease_expired' and must not
-- renew, complete, retry, or defer. Expired leases are returned to an
-- eligible state only by recover_stale_sync_requests (05 file).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- heartbeat_sync_request
--   Returns: renewed | ownership_lost | lease_expired | not_processing | not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION heartbeat_sync_request(
  p_request_id        uuid,
  p_worker_id         text,
  p_lease_duration_s  integer DEFAULT 120
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status sync_request_status;
  v_owner  text;
  v_lease  timestamptz;
BEGIN
  SELECT status, claimed_by, lease_expires_at
    INTO v_status, v_owner, v_lease
  FROM sync_requests
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_status <> 'processing' THEN
    RETURN 'not_processing';
  END IF;
  IF v_owner <> p_worker_id THEN
    RETURN 'ownership_lost';
  END IF;
  IF v_lease IS NULL OR v_lease <= clock_timestamp() THEN
    RETURN 'lease_expired';
  END IF;

  UPDATE sync_requests
    SET processing_heartbeat_at = clock_timestamp(),
        lease_expires_at        = clock_timestamp() + make_interval(secs => p_lease_duration_s)
  WHERE request_id = p_request_id
    AND status = 'processing'
    AND claimed_by = p_worker_id;

  RETURN 'renewed';
END $$;

-- ------------------------------------------------------------
-- complete_sync_request
--   Stage 1 completion uses status 'simulation_completed' and records
--   a non-writing simulation summary. Only the current lease owner
--   with an unexpired lease may complete.
--   Returns: completed | lease_expired | ownership_lost | not_processing | not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_sync_request(
  p_request_id         uuid,
  p_worker_id          text,
  p_simulation_result  jsonb DEFAULT NULL
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
    SET status            = 'simulation_completed',
        completed_at      = clock_timestamp(),
        simulation_result = p_simulation_result,
        claimed_by         = NULL,
        claimed_at        = NULL,
        lease_expires_at  = NULL,
        processing_heartbeat_at = NULL
  WHERE request_id = p_request_id
    AND status = 'processing'
    AND claimed_by = p_worker_id;

  RETURN 'completed';
END $$;

-- ------------------------------------------------------------
-- retry_sync_request — genuine processing failure backoff.
--   Backoff schedule (configurable): 1, 2, 5, 15, 60 minutes.
--   Clears claim fields, sets status='queued', sets visible_at to
--   the next backoff slot, records the error. Does NOT create a new
--   queue row. If attempt_number >= max_attempts, transitions to
--   dead_letter via dead_letter_sync_request (05 file).
--   Returns: requeued | dead_lettered | lease_expired | ownership_lost
--          | not_processing | not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION retry_sync_request(
  p_request_id    uuid,
  p_worker_id     text,
  p_error_code    text,
  p_error_message text
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_status     sync_request_status;
  v_owner      text;
  v_lease      timestamptz;
  v_attempt    integer;
  v_max        integer;
  v_delay_min  integer;
  v_slots      integer[] := ARRAY[1, 2, 5, 15, 60];
BEGIN
  SELECT status, claimed_by, lease_expires_at, attempt_number, max_attempts
    INTO v_status, v_owner, v_lease, v_attempt, v_max
  FROM sync_requests WHERE request_id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'processing' THEN RETURN 'not_processing'; END IF;
  IF v_owner <> p_worker_id THEN RETURN 'ownership_lost'; END IF;
  IF v_lease IS NULL OR v_lease <= clock_timestamp() THEN RETURN 'lease_expired'; END IF;

  IF v_attempt >= v_max THEN
    -- delegate to dead-letter transition (ownership already verified)
    PERFORM dead_letter_sync_request(p_request_id, p_worker_id, p_error_code, p_error_message);
    RETURN 'dead_lettered';
  END IF;

  v_delay_min := v_slots[LEAST(v_attempt, array_length(v_slots,1))];
  UPDATE sync_requests
    SET status              = 'queued',
        claimed_by          = NULL,
        claimed_at          = NULL,
        lease_expires_at    = NULL,
        processing_heartbeat_at = NULL,
        visible_at          = clock_timestamp() + make_interval(mins => v_delay_min),
        last_error_code     = p_error_code,
        last_error_message  = left(p_error_message, 2000)
  WHERE request_id = p_request_id;

  RETURN 'requeued';
END $$;

COMMIT;