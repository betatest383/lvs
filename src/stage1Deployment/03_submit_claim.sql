-- ============================================================
-- 03_submit_claim.sql — atomic submission and work-claim
-- UNPROVISIONED DESIGN ARTIFACT.
-- ============================================================
-- Serialization key (Stage 1 default): {environment}:{tenant_id}:{domain}
-- One in-flight 'processing' lease per serialization_key is enforced by
-- the partial unique index sync_requests_one_inflight_per_key
-- (01_schema.sql). claim_sync_request additionally takes a per-key
-- pg_advisory_xact_lock and re-checks eligibility under that lock so two
-- concurrent claimers for the same key cannot both win. The unique index
-- is the committed-state backstop; a unique_violation on the claim UPDATE
-- is caught as defense-in-depth and the claimer tries another key.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- submit_sync_request
--   Parameters (in order):
--     1  p_idempotency_key  text
--     2  p_tenant_id       text
--     3  p_environment     sync_environment
--     4  p_domain          sync_domain
--     5  p_sync_mode       sync_mode
--     6  p_trigger_type   trigger_type
--     7  p_source_event_id text
--     8  p_requested_by    text
--     9  p_window_start    timestamptz
--     10 p_window_end      timestamptz
--     11 p_correlation_id text
--     12 p_payload_json    jsonb
--     13 p_max_attempts    integer
--   Atomic idempotent submission. Uses INSERT ... ON CONFLICT
--   (idempotency_key) DO NOTHING. Never SELECT-then-INSERT.
--   Never executes synchronization processing.
--   Returns: ('accepted', request_id) or ('duplicate', existing_id).
--   Raises exceptions for invalid inputs (gateway maps to 400).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- claim_sync_request(p_worker_id, p_lease_duration_s)
--   Atomic transactional claim using FOR UPDATE SKIP LOCKED plus a
--   per-key advisory transaction lock to serialize the critical
--   section. Re-checks eligibility under the advisory lock so a
--   concurrent claimer for the same key cannot slip through.
--   The partial unique index sync_requests_one_inflight_per_key is
--   the committed-state backstop; a unique_violation on the claim
--   UPDATE is caught and the claimer tries another eligible key.
--   Increments attempt_number exactly once per real claim.
--   Different serialization keys remain independently claimable.
-- ------------------------------------------------------------
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
    -- Pick the next eligible candidate, skipping rows already locked.
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
      RETURN;  -- nothing claimable right now
    END IF;

    -- Serialize the critical section per serialization key.
    PERFORM pg_advisory_xact_lock(hashtext(v_cand_key));

    -- Re-check under lock: row still eligible and still no active lease.
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
      CONTINUE;  -- another worker claimed it; try the next candidate
    END IF;

    -- Claim it. The partial unique index guarantees no second worker can
    -- also mark a same-key row 'processing' in committed state. Under the
    -- advisory lock + recheck this unique_violation is unreachable, but it
    -- is caught as defense-in-depth: on conflict, abandon this candidate
    -- and try another eligible serialization key.
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
        -- Another worker holds the in-flight slot for this key. Release
        -- this candidate (subtransaction rollback) and try another key.
        CONTINUE;
    END;
  END LOOP;
END $$;

COMMIT;