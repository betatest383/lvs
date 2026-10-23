-- ============================================================
-- 06_observability.sql — metric views (read-only)
-- UNPROVISIONED DESIGN ARTIFACT.
-- ============================================================
-- The worker/gateway emit logs containing request_id, idempotency_key,
-- correlation_id, tenant_id, domain, serialization_key, worker_id,
-- attempt_number, and status transition. These views provide the
-- queue-side rollup metrics. No secrets or payloads are exposed.
-- ============================================================

BEGIN;

-- Queue depth per (tenant, domain, status)
CREATE OR REPLACE VIEW vq_queue_depth AS
  SELECT tenant_id, domain, status, count(*) AS depth
  FROM sync_requests
  GROUP BY tenant_id, domain, status;

-- Oldest claimable queued-message age per domain
CREATE OR REPLACE VIEW vq_oldest_queued_age AS
  SELECT tenant_id, domain,
         extract(epoch FROM (clock_timestamp() - min(requested_at)))::bigint AS oldest_age_seconds
  FROM sync_requests
  WHERE status IN ('queued','deferred')
  GROUP BY tenant_id, domain;

-- Active and expired leases
CREATE OR REPLACE VIEW vq_leases AS
  SELECT serialization_key, request_id, claimed_by, claimed_at,
         lease_expires_at, processing_heartbeat_at,
         (lease_expires_at < clock_timestamp()) AS expired
  FROM sync_requests
  WHERE status = 'processing';

-- Dead-letter count
CREATE OR REPLACE VIEW vq_dead_letter_count AS
  SELECT tenant_id, domain, count(*) AS dead_letter_count
  FROM sync_requests
  WHERE status = 'dead_letter'
  GROUP BY tenant_id, domain;

-- Per-key inflight (must always be 0 or 1)
CREATE OR REPLACE VIEW vq_inflight_per_key AS
  SELECT serialization_key, count(*) AS inflight
  FROM sync_requests
  WHERE status = 'processing'
  GROUP BY serialization_key;

COMMIT;