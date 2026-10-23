-- ============================================================
-- stage1_full_migration.sql
-- Combined Stage 1 migration: files 01 through 06 in exact order.
-- Apply with: psql "$DB" -v ON_ERROR_STOP=1 -f stage1_full_migration.sql
-- Do NOT include 07_rollback.sql here. Rollback is applied separately
-- via 07_rollback.sql.
-- ============================================================


-- ============================================================
-- FILE 01 of 06: 01_schema.sql — Stage 1 PostgreSQL Sync Queue Foundation
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE sync_environment   AS ENUM ('integration', 'production');
CREATE TYPE sync_domain         AS ENUM ('customer', 'job', 'appointment', 'purchase_order', 'transfer', 'inventory');
CREATE TYPE sync_mode          AS ENUM ('incremental', 'backfill', 'on_demand_hydration', 'recovery');
CREATE TYPE trigger_type       AS ENUM ('webhook', 'scheduled', 'manual', 'retry', 'recovery', 'on_demand_hydration');
CREATE TYPE sync_request_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'deferred',
  'failed',
  'dead_letter',
  'cancelled',
  'simulation_completed'
);

CREATE TABLE sync_requests (
  request_id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key             text        NOT NULL,
  tenant_id                   text        NOT NULL,
  environment                 sync_environment NOT NULL,
  domain                      sync_domain NOT NULL,
  serialization_key           text        NOT NULL,
  sync_mode                   sync_mode   NOT NULL,
  trigger_type                trigger_type NOT NULL,
  source_event_id             text,
  requested_at                timestamptz NOT NULL DEFAULT now(),
  requested_by                text,
  window_start                timestamptz,
  window_end                  timestamptz,
  correlation_id              text,
  payload_json                jsonb,
  status                      sync_request_status NOT NULL DEFAULT 'queued',
  visible_at                  timestamptz NOT NULL DEFAULT now(),
  attempt_number              integer     NOT NULL DEFAULT 0,
  dependency_deferral_count   integer     NOT NULL DEFAULT 0,
  max_attempts                integer     NOT NULL DEFAULT 5,
  claimed_by                  text,
  claimed_at                  timestamptz,
  lease_expires_at            timestamptz,
  processing_heartbeat_at     timestamptz,
  completed_at                timestamptz,
  last_error_code             text,
  last_error_message          text,
  dead_lettered_at            timestamptz,
  simulation_result           jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sync_requests_idempotency_key_uniq UNIQUE (idempotency_key),
  CONSTRAINT sync_requests_attempt_ge_zero   CHECK (attempt_number >= 0),
  CONSTRAINT sync_requests_deferral_ge_zero  CHECK (dependency_deferral_count >= 0),
  CONSTRAINT sync_requests_max_attempts_pos   CHECK (max_attempts > 0),
  CONSTRAINT sync_requests_window_order
    CHECK (window_start IS NULL OR window_end IS NULL OR window_start <= window_end),
  CONSTRAINT sync_requests_processing_claim_fields
    CHECK (status <> 'processing'::sync_request_status
           OR (claimed_by IS NOT NULL
               AND claimed_at IS NOT NULL
               AND lease_expires_at IS NOT NULL
               AND processing_heartbeat_at IS NOT NULL)),
  CONSTRAINT sync_requests_completed_at_required
    CHECK (status NOT IN (
             'completed'::sync_request_status,
             'simulation_completed'::sync_request_status
           )
           OR completed_at IS NOT NULL),
  CONSTRAINT sync_requests_dead_letter_at_required
    CHECK (status <> 'dead_letter'::sync_request_status OR dead_lettered_at IS NOT NULL)
);

CREATE UNIQUE INDEX sync_requests_one_inflight_per_key
  ON sync_requests (serialization_key)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION sync_requests_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE TRIGGER sync_requests_touch_updated_at_trg
  BEFORE UPDATE ON sync_requests
  FOR EACH ROW EXECUTE FUNCTION sync_requests_touch_updated_at();

COMMIT;


-- ============================================================
-- FILE 02 of 06: 02_indexes.sql — Stage 1 indexes
-- ============================================================

BEGIN;

CREATE INDEX idx_claimable
  ON sync_requests (visible_at, requested_at)
  WHERE status IN ('queued','deferred');

CREATE INDEX idx_ser_key_status
  ON sync_requests (serialization_key, status);

CREATE INDEX idx_stale_recovery
  ON sync_requests (lease_expires_at)
  WHERE status = 'processing';

CREATE INDEX idx_tenant_domain_status
  ON sync_requests (tenant_id, domain, status);

CREATE INDEX idx_correlation
  ON sync_requests (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX idx_source_event
  ON sync_requests (source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX idx_dead_letter
  ON sync_requests (dead_lettered_at, status)
  WHERE status = 'dead_letter';

COMMIT;


-- ============================================================
-- FILE 03 of 06: 03_submit_claim.sql — atomic submission and work-claim
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION submit_sync_request(
  p_idempotency_key text,
  p_tenant_id      text,
  p_environment    sync_environment,
  p_domain         sync_domain,
  p_sync_mode      sync_mode,
  p_trigger_type   trigger_type,
  p_source_event_id text DEFAULT NULL,
  p_requested_by   text DEFAULT NULL,
  p_window_start   timestamptz DEFAULT NULL,
  p_window_end     timestamptz DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_payload_json   jsonb DEFAULT NULL,
  p_max_attempts   integer DEFAULT 5
) RETURNS TABLE(outcome text, request_id uuid)
LANGUAGE plpgsql AS $$
DECLARE
  v_serialization_key text;
  v_new_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'REJECTED: idempotency_key required' USING ERRCODE = '23502';
  END IF;
  IF p_tenant_id IS NULL OR btrim(p_tenant_id) = '' THEN
    RAISE EXCEPTION 'REJECTED: tenant_id required' USING ERRCODE = '23502';
  END IF;
  IF p_window_start IS NOT NULL AND p_window_end IS NOT NULL AND p_window_start > p_window_end THEN
    RAISE EXCEPTION 'REJECTED: window_start > window_end' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'REJECTED: max_attempts must be > 0' USING ERRCODE = '22023';
  END IF;

  v_serialization_key := p_environment::text || ':' || p_tenant_id || ':' || p_domain::text;

  INSERT INTO sync_requests (
    idempotency_key, tenant_id, environment, domain, serialization_key,
    sync_mode, trigger_type, source_event_id, requested_by,
    window_start, window_end, correlation_id, payload_json, max_attempts
  ) VALUES (
    p_idempotency_key, p_tenant_id, p_environment, p_domain, v_serialization_key,
    p_sync_mode, p_trigger_type, p_source_event_id, p_requested_by,
    p_window_start, p_window_end, p_correlation_id, p_payload_json, p_max_attempts
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING request_id INTO v_new_id;

  IF v_new_id IS NULL THEN
    SELECT sr.request_id INTO v_new_id
    FROM sync_requests sr
    WHERE sr.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'duplicate'::text, v_new_id;
  ELSE
    RETURN QUERY SELECT 'accepted'::text, v_new_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION claim_sync_request(
  p_worker_id        text,
  p_lease_duration_s integer DEFAULT 120
) RETURNS TABLE (
  request_id                uuid,
  idempotency_key           text,
  tenant_id                 text,
  environment               sync_environment,
  domain                    sync_domain,
  serialization_key         text,
  sync_mode                 sync_mode,
  trigger_type              trigger_type,
  source_event_id           text,
  requested_at              timestamptz,
  requested_by              text,
  window_start              timestamptz,
  window_end                timestamptz,
  correlation_id            text,
  payload_json              jsonb,
  attempt_number            integer,
  dependency_deferral_count integer,
  max_attempts              integer
)
LANGUAGE plpgsql AS $$
DECLARE
  v_now           timestamptz := clock_timestamp();
  v_lease_expires timestamptz := clock_timestamp() + make_interval(secs => p_lease_duration_s);
  v_cand_id       uuid;
  v_cand_key      text;
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'REJECTED: worker_id required' USING ERRCODE = '23502';
  END IF;

  LOOP
    SELECT r.request_id, r.serialization_key
      INTO v_cand_id, v_cand_key
    FROM sync_requests r
    WHERE r.status IN ('queued','deferred')
      AND r.visible_at <= v_now
      AND NOT EXISTS (
        SELECT 1 FROM sync_requests a
        WHERE a.serialization_key = r.serialization_key
          AND a.status = 'processing'
          AND a.lease_expires_at > v_now
      )
    ORDER BY r.requested_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_cand_key));

    IF NOT EXISTS (
      SELECT 1 FROM sync_requests r
      WHERE r.request_id = v_cand_id
        AND r.status IN ('queued','deferred')
        AND r.visible_at <= v_now
        AND NOT EXISTS (
          SELECT 1 FROM sync_requests a
          WHERE a.serialization_key = r.serialization_key
            AND a.status = 'processing'
            AND a.lease_expires_at > v_now
        )
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      UPDATE sync_requests
        SET status                  = 'processing',
            claimed_by              = p_worker_id,
            claimed_at              = v_now,
            processing_heartbeat_at = v_now,
            lease_expires_at        = v_lease_expires,
            attempt_number          = attempt_number + 1
      WHERE request_id = v_cand_id;

      RETURN QUERY
        SELECT r.request_id, r.idempotency_key, r.tenant_id, r.environment,
               r.domain, r.serialization_key, r.sync_mode, r.trigger_type,
               r.source_event_id, r.requested_at, r.requested_by,
               r.window_start, r.window_end, r.correlation_id, r.payload_json,
               r.attempt_number, r.dependency_deferral_count, r.max_attempts
        FROM sync_requests r
        WHERE r.request_id = v_cand_id;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;
  END LOOP;
END $$;

COMMIT;


-- ============================================================
-- FILE 04 of 06: 04_heartbeat_complete_retry.sql
-- ============================================================

BEGIN;

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

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'processing' THEN RETURN 'not_processing'; END IF;
  IF v_owner <> p_worker_id THEN RETURN 'ownership_lost'; END IF;
  IF v_lease IS NULL OR v_lease <= clock_timestamp() THEN RETURN 'lease_expired'; END IF;

  UPDATE sync_requests
    SET processing_heartbeat_at = clock_timestamp(),
        lease_expires_at        = clock_timestamp() + make_interval(secs => p_lease_duration_s)
  WHERE request_id = p_request_id
    AND status = 'processing'
    AND claimed_by = p_worker_id;

  RETURN 'renewed';
END $$;

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


-- ============================================================
-- FILE 05 of 06: 05_defer_deadletter_recovery.sql
-- ============================================================

BEGIN;

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


-- ============================================================
-- FILE 06 of 06: 06_observability.sql — metric views (read-only)
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW vq_queue_depth AS
  SELECT tenant_id, domain, status, count(*) AS depth
  FROM sync_requests
  GROUP BY tenant_id, domain, status;

CREATE OR REPLACE VIEW vq_oldest_queued_age AS
  SELECT tenant_id, domain,
         extract(epoch FROM (clock_timestamp() - min(requested_at)))::bigint AS oldest_age_seconds
  FROM sync_requests
  WHERE status IN ('queued','deferred')
  GROUP BY tenant_id, domain;

CREATE OR REPLACE VIEW vq_leases AS
  SELECT serialization_key, request_id, claimed_by, claimed_at,
         lease_expires_at, processing_heartbeat_at,
         (lease_expires_at < clock_timestamp()) AS expired
  FROM sync_requests
  WHERE status = 'processing';

CREATE OR REPLACE VIEW vq_dead_letter_count AS
  SELECT tenant_id, domain, count(*) AS dead_letter_count
  FROM sync_requests
  WHERE status = 'dead_letter'
  GROUP BY tenant_id, domain;

CREATE OR REPLACE VIEW vq_inflight_per_key AS
  SELECT serialization_key, count(*) AS inflight
  FROM sync_requests
  WHERE status = 'processing'
  GROUP BY serialization_key;

COMMIT;