-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 03_row_level_security.sql
-- Purpose: Row-Level Security enable, force, and policies
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TENANT-CONTEXT TRUST BOUNDARY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The future persistence adapter will execute:
--   SET LOCAL ledger.tenant_id = :tenant_id
-- within each database transaction.
--
-- ACCURATE TRUST MODEL:
--
-- 1. Custom GUC setting: Any role that can execute SQL can call
--    SET LOCAL on a custom GUC variable. PostgreSQL itself does NOT
--    distinguish whether the value came from trusted server context
--    versus an arbitrary SQL statement.
--
-- 2. Credential boundary: A holder of ledger_app_user database credentials
--    could execute SET LOCAL ledger.tenant_id to any arbitrary UUID value
--    and then issue DML against that tenant's rows. The SQL package alone
--    does NOT cryptographically or mechanically validate that the tenant
--    value matches the authenticated application user.
--
-- 3. Required deployment invariant: Database credentials for ledger_app_user
--    MUST be held exclusively by the trusted adapter process. Untrusted
--    callers MUST be prohibited from direct SQL access, from controlling
--    raw SQL statements, and from initiating transactions that set the
--    tenant GUC. The trust boundary is enforced at the application
--    credential boundary, NOT within PostgreSQL itself.
--
-- 4. current_setting behavior:
--    - When the GUC is ABSENT: current_setting('ledger.tenant_id', true)
--      returns NULL. NULL::uuid is NULL. tenant_id = NULL evaluates to
--      NULL (treated as false in USING/WITH CHECK) — no rows visible,
--      no writes permitted. This is fail-closed behavior.
--    - When the GUC is a VALID UUID string: the cast succeeds and the
--      comparison proceeds normally.
--    - When the GUC is a NON-EMPTY INVALID value (not a valid UUID):
--      current_setting returns the string, and the ::uuid cast RAISES
--      AN ERROR (invalid input syntax for type uuid). This does NOT
--      silently return no rows — the statement fails with an error.
--
-- RLS is NOT used as a substitute for referential integrity. It controls
-- row visibility and write gating, not foreign key enforcement.

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE AND FORCE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ledger.state_revision        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.aggregates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.company_ownership    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.transfers_outstanding ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.correction_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.job_issue_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.transaction_cutoff    ENABLE ROW LEVEL SECURITY;

ALTER TABLE ledger.state_revision        FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.aggregates            FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.items                 FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions             FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.company_ownership    FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.transfers_outstanding FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.correction_provenance FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.job_issue_progress    FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events       FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.transaction_cutoff    FORCE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
--
-- Every policy uses FOR ALL with BOTH an explicit USING expression and
-- an explicit WITH CHECK expression. This ensures:
--   - SELECT, UPDATE, DELETE: only rows where tenant_id matches the GUC
--   - INSERT: new row tenant_id must match the GUC (WITH CHECK)
--   - UPDATE: new row tenant_id must match the GUC (WITH CHECK)
--
-- The tenant_context expression is repeated in both clauses for clarity
-- and to avoid relying on implicit WITH CHECK = USING fallback.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY rls_state_revision
    ON ledger.state_revision
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_aggregates
    ON ledger.aggregates
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_items
    ON ledger.items
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_positions
    ON ledger.positions
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_company_ownership
    ON ledger.company_ownership
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_transfers_outstanding
    ON ledger.transfers_outstanding
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_correction_provenance
    ON ledger.correction_provenance
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_job_issue_progress
    ON ledger.job_issue_progress
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_accepted_events
    ON ledger.accepted_events
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

CREATE POLICY rls_transaction_cutoff
    ON ledger.transaction_cutoff
    FOR ALL
    USING (tenant_id = current_setting('ledger.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('ledger.tenant_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- BYPASSRLS AND TABLE OWNERSHIP EFFECTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BYPASSRLS = YES: The role bypasses ALL row-level security policies.
--   - ledger_migration_owner: BYPASSRLS = YES (deployment template, needed
--     to create and manage RLS policies)
--   - PostgreSQL superusers: Always bypass RLS regardless of the setting.
--
-- BYPASSRLS = NO: The role is subject to RLS policies.
--   - ledger_app_user: BYPASSRLS = NO (subject to RLS)
--   - ledger_test_user: BYPASSRLS = NO (subject to RLS)
--   - ledger_readonly: BYPASSRLS = NO (subject to RLS)
--
-- Table ownership and FORCE ROW LEVEL SECURITY:
--   - An ordinary table owner normally bypasses row-level security.
--   - FORCE ROW LEVEL SECURITY causes the table owner to be subject
--     to RLS policies.
--   - PostgreSQL superusers and roles with BYPASSRLS still bypass RLS
--     even when FORCE ROW LEVEL SECURITY is enabled.
--   - The migration owner (ledger_migration_owner) is subject to FORCE
--     RLS unless it is also a superuser or has BYPASSRLS.
--   - The proposed ledger_migration_owner design separately assigns
--     BYPASSRLS = YES, so that role would bypass RLS because of the
--     BYPASSRLS attribute — NOT because it owns the tables.
--   - ledger_app_user MUST NOT own any protected table and MUST NOT
--     have BYPASSRLS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 03_row_level_security.sql
-- ═══════════════════════════════════════════════════════════════════════════
