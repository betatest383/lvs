-- ============================================================
-- 07_rollback.sql — remove Stage 1 foundation (idempotent)
-- UNPROVISIONED DESIGN ARTIFACT. Run only after test evidence is
-- retained. Dropping the table removes all synthetic Stage 1 rows.
-- Does not touch any Base44 entity or production sync path.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS submit_sync_request(text,text,sync_environment,sync_domain,sync_mode,trigger_type,text,text,timestamptz,timestamptz,text,jsonb,integer) CASCADE;
DROP FUNCTION IF EXISTS claim_sync_request(text, integer) CASCADE;
DROP FUNCTION IF EXISTS heartbeat_sync_request(uuid, text, integer) CASCADE;
DROP FUNCTION IF EXISTS complete_sync_request(uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS retry_sync_request(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS defer_sync_request(uuid, text, text, integer) CASCADE;
DROP FUNCTION IF EXISTS dead_letter_sync_request(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS recover_stale_sync_requests(integer, boolean) CASCADE;
DROP FUNCTION IF EXISTS list_dead_letters(text, sync_domain, integer) CASCADE;

DROP VIEW IF EXISTS vq_queue_depth CASCADE;
DROP VIEW IF EXISTS vq_oldest_queued_age CASCADE;
DROP VIEW IF EXISTS vq_leases CASCADE;
DROP VIEW IF EXISTS vq_dead_letter_count CASCADE;
DROP VIEW IF EXISTS vq_inflight_per_key CASCADE;

DROP INDEX IF EXISTS idx_claimable;
DROP INDEX IF EXISTS idx_ser_key_status;
DROP INDEX IF EXISTS idx_stale_recovery;
DROP INDEX IF EXISTS idx_tenant_domain_status;
DROP INDEX IF EXISTS idx_correlation;
DROP INDEX IF EXISTS idx_source_event;
DROP INDEX IF EXISTS idx_dead_letter;
DROP INDEX IF EXISTS sync_requests_one_inflight_per_key;

DROP TRIGGER IF EXISTS sync_requests_touch_updated_at_trg ON sync_requests;
DROP FUNCTION IF EXISTS sync_requests_touch_updated_at() CASCADE;

DROP TABLE IF EXISTS sync_requests;

DROP TYPE IF EXISTS sync_request_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS sync_mode;
DROP TYPE IF EXISTS sync_domain;
DROP TYPE IF EXISTS sync_environment;

COMMIT;