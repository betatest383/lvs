-- ============================================================
-- 01_schema.sql — Stage 1 PostgreSQL Sync Queue Foundation
-- UNPROVISIONED DESIGN ARTIFACT. Apply only against an isolated
-- PostgreSQL instance dedicated to Stage 1. Do NOT apply against
-- any production or shared database without separate owner
-- authorization.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Extension dependency
--   gen_random_uuid() is provided by the pgcrypto extension
--   (and by core in PostgreSQL 13+, but the explicit extension
--   guarantees availability on older versions and documents the
--   dependency). If the target instance disallows CREATE EXTENSION
--   for the applying role, the statement fails with a clear
--   "permission denied for extension pgcrypto" error; the
--   infrastructure administrator must grant the role or pre-install
--   the extension before applying this file.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Enumerated types
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Queue table
-- ------------------------------------------------------------
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

  -- Permanent submission idempotency (DB-enforced)
  CONSTRAINT sync_requests_idempotency_key_uniq UNIQUE (idempotency_key),

  -- Attempt validation
  CONSTRAINT sync_requests_attempt_ge_zero   CHECK (attempt_number >= 0),
  CONSTRAINT sync_requests_deferral_ge_zero  CHECK (dependency_deferral_count >= 0),
  CONSTRAINT sync_requests_max_attempts_pos   CHECK (max_attempts > 0),

  -- Window validation
  CONSTRAINT sync_requests_window_order
    CHECK (window_start IS NULL OR window_end IS NULL OR window_start <= window_end),

  -- Processing-state consistency: a 'processing' row must carry a full claim
  CONSTRAINT sync_requests_processing_claim_fields
    CHECK (status <> 'processing'::sync_request_status
           OR (claimed_by IS NOT NULL
               AND claimed_at IS NOT NULL
               AND lease_expires_at IS NOT NULL
               AND processing_heartbeat_at IS NOT NULL)),

  -- Completed / simulation-completed must record completed_at
  CONSTRAINT sync_requests_completed_at_required
    CHECK (status NOT IN (
             'completed'::sync_request_status,
             'simulation_completed'::sync_request_status
           )
           OR completed_at IS NOT NULL),

  -- Dead-letter must record dead_lettered_at
  CONSTRAINT sync_requests_dead_letter_at_required
    CHECK (status <> 'dead_letter'::sync_request_status OR dead_lettered_at IS NOT NULL)
);

-- ------------------------------------------------------------
-- DB-enforced single in-flight lease per serialization key.
-- This is the concurrency authority. It is NOT a worker-side check.
-- A partial unique index allows at most one 'processing' row per
-- serialization_key at any time, committed-state.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX sync_requests_one_inflight_per_key
  ON sync_requests (serialization_key)
  WHERE status = 'processing';

-- updated_at maintenance trigger
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