-- ============================================================
-- 02_indexes.sql — Stage 1 indexes
-- UNPROVISIONED DESIGN ARTIFACT.
-- ============================================================
-- Index selection rationale:
--
-- 1. idx_claimable — partial index over claimable rows (queued/deferred
--    and visible). The claim function filters status IN (queued,deferred)
--    AND visible_at <= now(); a partial index on visible_at (plus
--    requested_at for stable FIFO tie-break) keeps the claim scan tiny.
--
-- 2. idx_ser_key_status — supports the "exclude serialization keys that
--    already have an unexpired processing lease" NOT EXISTS check during
--    claim. (serialization_key, status) lets the subquery probe a single
--    key's processing row quickly.
--
-- 3. idx_stale_recovery — partial index over in-flight rows by
--    lease_expires_at, used by recover_stale_sync_requests.
--
-- 4. idx_tenant_domain_status — tenant/domain reporting and observability.
--
-- 5. idx_correlation — correlation-id tracing across related requests.
--
-- 6. idx_source_event — lookup by originating webhook event id.
--
-- 7. idx_dead_letter — dead-letter review and audit.
-- ============================================================

BEGIN;

-- 1. Claimable queue messages
CREATE INDEX idx_claimable
  ON sync_requests (visible_at, requested_at)
  WHERE status IN ('queued','deferred');

-- 2. Serialization-key status check (active-lease exclusion)
CREATE INDEX idx_ser_key_status
  ON sync_requests (serialization_key, status);

-- 3. Stale-worker recovery
CREATE INDEX idx_stale_recovery
  ON sync_requests (lease_expires_at)
  WHERE status = 'processing';

-- 4. Tenant + domain reporting
CREATE INDEX idx_tenant_domain_status
  ON sync_requests (tenant_id, domain, status);

-- 5. Correlation-ID tracing
CREATE INDEX idx_correlation
  ON sync_requests (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- 6. Source-event lookup
CREATE INDEX idx_source_event
  ON sync_requests (source_event_id)
  WHERE source_event_id IS NOT NULL;

-- 7. Dead-letter review
CREATE INDEX idx_dead_letter
  ON sync_requests (dead_lettered_at, status)
  WHERE status = 'dead_letter';

COMMIT;