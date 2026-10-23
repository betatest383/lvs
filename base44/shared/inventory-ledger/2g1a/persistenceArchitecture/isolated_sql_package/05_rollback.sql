-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 05_rollback.sql
-- Purpose: Down-migration — drops only objects created by this package
--
-- WARNING: This down-migration drops ALL Stage 2G1-A ledger tables and
-- their data. It is NOT:
--   - a production data restoration procedure
--   - an application rollback procedure
--   - a backup restoration procedure
--   - a disposable local reset (use DROP SCHEMA ledger CASCADE only in
--     disposable development environments with an environment assertion)
--
-- This down-migration:
--   - targets only objects created by this package
--   - uses explicit object names
--   - avoids DROP SCHEMA ... CASCADE
--   - drops in reverse dependency order
--
-- A separate owner authorization is required before executing this file.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: DROP TRIGGERS ON accepted_events
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_prevent_ae_update ON ledger.accepted_events;
DROP TRIGGER IF EXISTS trg_prevent_ae_delete ON ledger.accepted_events;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: DROP RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS rls_state_revision ON ledger.state_revision;
DROP POLICY IF EXISTS rls_aggregates ON ledger.aggregates;
DROP POLICY IF EXISTS rls_items ON ledger.items;
DROP POLICY IF EXISTS rls_positions ON ledger.positions;
DROP POLICY IF EXISTS rls_company_ownership ON ledger.company_ownership;
DROP POLICY IF EXISTS rls_transfers_outstanding ON ledger.transfers_outstanding;
DROP POLICY IF EXISTS rls_correction_provenance ON ledger.correction_provenance;
DROP POLICY IF EXISTS rls_job_issue_progress ON ledger.job_issue_progress;
DROP POLICY IF EXISTS rls_accepted_events ON ledger.accepted_events;
DROP POLICY IF EXISTS rls_transaction_cutoff ON ledger.transaction_cutoff;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: DISABLE RLS (before dropping tables)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ledger.state_revision        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.aggregates            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.items                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.company_ownership    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.transfers_outstanding NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.correction_provenance NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.job_issue_progress    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.transaction_cutoff    NO FORCE ROW LEVEL SECURITY;

ALTER TABLE ledger.state_revision        DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.aggregates            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.items                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions             DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.company_ownership    DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.transfers_outstanding DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.correction_provenance DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.job_issue_progress    DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.transaction_cutoff    DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: DROP TABLES IN REVERSE DEPENDENCY ORDER
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS ledger.transaction_cutoff;
DROP TABLE IF EXISTS ledger.accepted_events;
DROP TABLE IF EXISTS ledger.job_issue_progress;
DROP TABLE IF EXISTS ledger.correction_provenance;
DROP TABLE IF EXISTS ledger.transfers_outstanding;
DROP TABLE IF EXISTS ledger.company_ownership;
DROP TABLE IF EXISTS ledger.positions;
DROP TABLE IF EXISTS ledger.items;
DROP TABLE IF EXISTS ledger.state_revision;
DROP TABLE IF EXISTS ledger.aggregates;
DROP TABLE IF EXISTS ledger.tenants;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: DROP TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ledger.prevent_accepted_events_mutation();

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: DROP SCHEMA (optional)
-- The schema itself is NOT dropped by this down-migration.
-- To drop the schema, use the following ONLY in a disposable development
-- environment with an environment assertion:
--   DROP SCHEMA IF EXISTS ledger;
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 05_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
