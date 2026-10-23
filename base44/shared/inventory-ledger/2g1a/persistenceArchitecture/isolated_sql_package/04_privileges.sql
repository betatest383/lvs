-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 04_privileges.sql
-- Purpose: Role creation, role hardening, ownership, grants, revokes, default privileges
--
-- Governing Contract SHA-256: 9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7
-- Schema Proposal SHA-256:  559c3c292e2d8970c4c170d3744447654e59bbbcd44d88be661df6e8b474ee8e
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PACKAGE CLASSIFICATION: EXECUTABLE (requires deployment-role prerequisites)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This file contains EXECUTABLE ownership assignments, privilege grants,
-- revokes, and default-privilege controls. It requires the five deployment
-- roles to already exist in the target database.
--
-- Role creation (Section 1) and role attribute hardening (Section 2) are
-- DEPLOYMENT TEMPLATES (commented out) that require CREATEROLE or superuser
-- authority. They are NOT executable by the migration owner alone.
--
-- Sections 3–12 are executable by a superuser or a role with sufficient
-- ownership privileges on the target objects.
--
-- Execution order: after 01_schema_forward.sql, 02_accepted_event_immutability.sql,
-- 03_row_level_security.sql
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE RESOLUTION CLASSIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. ledger_migration_owner — Category A: Resolved from repository convention
--    Evidence: base44/shared/inventory-ledger/stage_2g1a_receipt_validation.sql
--    lines 18-19 (CREATE ROLE), line 37 (ALTER SCHEMA OWNER TO),
--    lines 676-690 (ALTER TABLE OWNER TO)
--
-- 2. ledger_app_user — Category A: Resolved from repository convention
--    Evidence: base44/shared/inventory-ledger/stage_2g1a_receipt_validation.sql
--    lines 24-25 (CREATE ROLE), line 730 (GRANT EXECUTE)
--
-- 3. ledger_readonly — Category A: Resolved from repository convention
--    Evidence: base44/shared/inventory-ledger/stage_2g1a_receipt_validation.sql
--    lines 27-28 (CREATE ROLE), lines 713-719 (GRANT SELECT)
--
-- 4. ledger_trigger_owner — Category B: Package-local logical role
--    Repository precedent uses 'ledger_function_owner'
--    (stage_2g1a_receipt_validation.sql lines 21-22, 693-699) for the same
--    purpose (owning trigger functions with SECURITY DEFINER). The isolated
--    package uses 'ledger_trigger_owner' as a more descriptive name for the
--    specific trigger-function owner role. Creation remains a deployment
--    prerequisite.
--
-- 5. ledger_test_user — Category B: Package-local logical role
--    Repository has 'test_unprivileged' (stage_2g1a_receipt_validation.sql
--    lines 30-31) but serves a different purpose (zero-privilege test role
--    vs. same-DML-as-runtime role). 'ledger_test_user' is a package-local
--    logical role requiring same-DML-as-app_user privileges for integration
--    testing. Creation remains a deployment prerequisite.
--
-- No environment-specific names were invented without evidence. Categories A
-- and B roles use concrete package-controlled names that will be created as
-- deployment prerequisites.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EXACT ROLE ATTRIBUTES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Role                  LOGIN  SUPERUSER CREATEDB CREATEROLE INHERIT BYPASSRLS REPLICATION
-- ───────────────────── ────── ────────── ──────── ─────────── ─────── ────────── ───────────
-- ledger_migration_owner No     No         No       No          Yes     Yes        No
-- ledger_trigger_owner   No     No         No       No          Yes     No         No
-- ledger_app_user        No     No         No       No          Yes     No         No
-- ledger_test_user       No     No         No       No          Yes     No         No
-- ledger_readonly        No     No         No       No          Yes     No         No
--
-- No role has SUPERUSER. No role has CREATEDB. No role has CREATEROLE.
-- No role has REPLICATION. All roles are NOLOGIN.
-- Only ledger_migration_owner has BYPASSRLS (reviewed schema proposal Section 11.2:
-- "BYPASSRLS = Yes, needed to create and manage RLS policies").
-- The older receipt-validation script assigns NO BYPASSRLS; it is superseded by
-- the reviewed schema proposal and serves as naming precedent only.
-- The governing contract (Section 22) gates external database execution separately.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJECT OWNERSHIP MATRIX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Object                                  Owner
-- ─────────────────────────────────────── ──────────────────────
-- SCHEMA ledger                            ledger_migration_owner
-- TABLE ledger.tenants                     ledger_migration_owner
-- TABLE ledger.aggregates                  ledger_migration_owner
-- TABLE ledger.state_revision              ledger_migration_owner
-- TABLE ledger.items                       ledger_migration_owner
-- TABLE ledger.positions                   ledger_migration_owner
-- TABLE ledger.company_ownership           ledger_migration_owner
-- TABLE ledger.transfers_outstanding       ledger_migration_owner
-- TABLE ledger.correction_provenance       ledger_migration_owner
-- TABLE ledger.job_issue_progress           ledger_migration_owner
-- TABLE ledger.accepted_events             ledger_migration_owner
-- TABLE ledger.transaction_cutoff          ledger_migration_owner
-- FUNCTION ledger.prevent_accepted_events_mutation()  ledger_trigger_owner
-- TRIGGER trg_prevent_ae_update (on accepted_events)  follows table owner
-- TRIGGER trg_prevent_ae_delete (on accepted_events)  follows table owner
--
-- Triggers do NOT have independently assignable owners. A trigger is owned
-- by the same role that owns the parent table (ledger_migration_owner).
-- No ALTER TRIGGER ... OWNER TO statements are used (PostgreSQL does not
-- support that syntax).

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE-BY-TABLE PRIVILEGE MATRIX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Table                  app_user         test_user        readonly  trigger_owner  migration_owner
-- ────────────────────── ──────────────── ──────────────── ───────── ────────────── ───────────────
-- tenants                SELECT           SELECT           SELECT    —              ALL (owner)
-- aggregates             SELECT           SELECT           SELECT    —              ALL (owner)
-- state_revision         SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- items                  SELECT           SELECT           SELECT    —              ALL (owner)
-- positions              SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- company_ownership      SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- transfers_outstanding  SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- correction_provenance  SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- job_issue_progress     SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
-- accepted_events        SELECT,INS       SELECT,INS       SELECT    —              ALL (owner)
-- transaction_cutoff     SELECT,INS,UPD   SELECT,INS,UPD   SELECT    —              ALL (owner)
--
-- FUNCTION privilege matrix:
--   prevent_accepted_events_mutation(): NO EXECUTE for any role (PUBLIC or
--   otherwise). Triggers fire automatically — EXECUTE is not needed.
--
-- SCHEMA privilege matrix:
--   ledger_app_user:    USAGE
--   ledger_test_user:   USAGE
--   ledger_readonly:    USAGE
--   ledger_trigger_owner: — (no schema USAGE needed; triggers fire automatically)
--   ledger_migration_owner: ALL (owner)

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: ROLE CREATION (deployment template — requires CREATEROLE or superuser)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These statements require CREATEROLE or superuser authority.
-- They are commented out because the migration owner (NOLOGIN, NO CREATEROLE)
-- cannot execute them. A database administrator must run these separately.
--
-- No passwords or secrets are included. Roles are NOLOGIN — they cannot
-- establish direct database sessions and are used only as object owners
-- and privilege targets.

-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_migration_owner') THEN
--         CREATE ROLE ledger_migration_owner NOLOGIN;
--     END IF;
--     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_trigger_owner') THEN
--         CREATE ROLE ledger_trigger_owner NOLOGIN;
--     END IF;
--     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_app_user') THEN
--         CREATE ROLE ledger_app_user NOLOGIN;
--     END IF;
--     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_test_user') THEN
--         CREATE ROLE ledger_test_user NOLOGIN;
--     END IF;
--     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_readonly') THEN
--         CREATE ROLE ledger_readonly NOLOGIN;
--     END IF;
-- END
-- $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: ROLE ATTRIBUTE HARDENING (deployment template — requires CREATEROLE)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These statements require CREATEROLE or superuser authority.
-- They are commented out because the migration owner cannot execute them.
-- A database administrator must run these separately after role creation.
--
-- All five roles are hardened:
--   NO SUPERUSER, NO CREATEDB, NO CREATEROLE, NO REPLICATION
-- Only ledger_migration_owner has BYPASSRLS (reviewed schema proposal Section 11.2)

-- ALTER ROLE ledger_migration_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
-- ALTER ROLE ledger_trigger_owner   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- ALTER ROLE ledger_app_user        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- ALTER ROLE ledger_test_user       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- ALTER ROLE ledger_readonly        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: SCHEMA OWNERSHIP AND CREATE REVOCATION
-- ═══════════════════════════════════════════════════════════════════════════

ALTER SCHEMA ledger OWNER TO ledger_migration_owner;

-- Prevent unauthorized schema object creation by PUBLIC
REVOKE CREATE ON SCHEMA ledger FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: TABLE OWNERSHIP
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ledger.tenants               OWNER TO ledger_migration_owner;
ALTER TABLE ledger.aggregates            OWNER TO ledger_migration_owner;
ALTER TABLE ledger.state_revision        OWNER TO ledger_migration_owner;
ALTER TABLE ledger.items                 OWNER TO ledger_migration_owner;
ALTER TABLE ledger.positions             OWNER TO ledger_migration_owner;
ALTER TABLE ledger.company_ownership    OWNER TO ledger_migration_owner;
ALTER TABLE ledger.transfers_outstanding OWNER TO ledger_migration_owner;
ALTER TABLE ledger.correction_provenance OWNER TO ledger_migration_owner;
ALTER TABLE ledger.job_issue_progress    OWNER TO ledger_migration_owner;
ALTER TABLE ledger.accepted_events       OWNER TO ledger_migration_owner;
ALTER TABLE ledger.transaction_cutoff    OWNER TO ledger_migration_owner;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: FUNCTION OWNERSHIP
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION ledger.prevent_accepted_events_mutation() OWNER TO ledger_trigger_owner;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: SCHEMA USAGE PRIVILEGES
-- ═══════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA ledger TO ledger_app_user;
GRANT USAGE ON SCHEMA ledger TO ledger_test_user;
GRANT USAGE ON SCHEMA ledger TO ledger_readonly;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: TABLE PRIVILEGES — ledger_app_user (runtime adapter role)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON ledger.tenants TO ledger_app_user;
GRANT SELECT ON ledger.aggregates TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.state_revision TO ledger_app_user;
GRANT SELECT ON ledger.items TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.positions TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.company_ownership TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.transfers_outstanding TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.correction_provenance TO ledger_app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.job_issue_progress TO ledger_app_user;

-- accepted_events: INSERT and SELECT only — NO UPDATE, NO DELETE
GRANT SELECT, INSERT ON ledger.accepted_events TO ledger_app_user;

GRANT SELECT, INSERT, UPDATE ON ledger.transaction_cutoff TO ledger_app_user;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8: TABLE PRIVILEGES — ledger_test_user (same DML as app_user, isolated test DB)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON ledger.tenants TO ledger_test_user;
GRANT SELECT ON ledger.aggregates TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.state_revision TO ledger_test_user;
GRANT SELECT ON ledger.items TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.positions TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.company_ownership TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.transfers_outstanding TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.correction_provenance TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.job_issue_progress TO ledger_test_user;
GRANT SELECT, INSERT ON ledger.accepted_events TO ledger_test_user;
GRANT SELECT, INSERT, UPDATE ON ledger.transaction_cutoff TO ledger_test_user;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9: TABLE PRIVILEGES — ledger_readonly (diagnostic read-only role)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON ledger.tenants TO ledger_readonly;
GRANT SELECT ON ledger.aggregates TO ledger_readonly;
GRANT SELECT ON ledger.state_revision TO ledger_readonly;
GRANT SELECT ON ledger.items TO ledger_readonly;
GRANT SELECT ON ledger.positions TO ledger_readonly;
GRANT SELECT ON ledger.company_ownership TO ledger_readonly;
GRANT SELECT ON ledger.transfers_outstanding TO ledger_readonly;
GRANT SELECT ON ledger.correction_provenance TO ledger_readonly;
GRANT SELECT ON ledger.job_issue_progress TO ledger_readonly;
GRANT SELECT ON ledger.accepted_events TO ledger_readonly;
GRANT SELECT ON ledger.transaction_cutoff TO ledger_readonly;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10: ACCEPTED_EVENTS IMMUTABILITY — EXPLICIT REVOKE
-- Defense-in-depth: deny UPDATE and DELETE at the privilege layer,
-- not relying solely on the immutability trigger.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE UPDATE, DELETE ON ledger.accepted_events FROM ledger_app_user;
REVOKE UPDATE, DELETE ON ledger.accepted_events FROM ledger_test_user;
REVOKE UPDATE, DELETE ON ledger.accepted_events FROM ledger_readonly;
REVOKE UPDATE, DELETE ON ledger.accepted_events FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11: FUNCTION EXECUTE — REVOKE FROM PUBLIC
-- The trigger function fires automatically — no role needs EXECUTE.
-- This REVOKE is also in 02_accepted_event_immutability.sql (executed before ownership
-- transfer, while the migration owner still owns the function).
-- Repeated here for explicit defense-in-depth after ownership transfer.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION ledger.prevent_accepted_events_mutation() FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 12: DEFAULT PRIVILEGES
-- ALTER DEFAULT PRIVILEGES applies to objects subsequently created by the
-- specified role (ledger_migration_owner). It does NOT retroactively change
-- existing objects.
-- ═══════════════════════════════════════════════════════════════════════════

-- Read-only role gets SELECT on future tables created by migration owner
ALTER DEFAULT PRIVILEGES FOR ROLE ledger_migration_owner IN SCHEMA ledger
    GRANT SELECT ON TABLES TO ledger_readonly;

-- No default privileges for ledger_app_user or ledger_test_user —
-- runtime DML privileges must be explicitly granted per table.

-- No default EXECUTE on future functions — PUBLIC has EXECUTE by default,
-- so explicitly revoke it for functions created by migration owner
ALTER DEFAULT PRIVILEGES FOR ROLE ledger_migration_owner IN SCHEMA ledger
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- No default sequence privileges needed (no sequences in schema)

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 13: ACCEPTED-EVENT IMmutABILITY AUTHORITY MODEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Immutability of accepted_events is enforced through multiple distinct layers:
--
-- 1. PRIVICE LAYER (this file):
--    - ledger_app_user has only SELECT and INSERT on accepted_events
--    - ledger_test_user has only SELECT and INSERT on accepted_events
--    - ledger_readonly has only SELECT on accepted_events
--    - PUBLIC has no UPDATE or DELETE (explicit REVOKE)
--    - No role has EXECUTE on the trigger function
--
-- 2. TRIGGER LAYER (02_accepted_event_immutability.sql):
--    - trg_prevent_ae_update: BEFORE UPDATE, FOR EACH ROW
--    - trg_prevent_ae_delete: BEFORE DELETE, FOR EACH ROW
--    - These apply to ALL roles, including the table owner (defense-in-depth)
--
-- 3. OWNERSHIP LAYER:
--    - accepted_events is owned by ledger_migration_owner
--    - The trigger function is owned by ledger_trigger_owner
--    - The runtime role (ledger_app_user) does NOT own the table
--    - The runtime role has NO ALTER privilege (cannot disable triggers)
--
-- correction_provenance is MUTABLE current state (UPSERT-capable) — it receives
-- SELECT, INSERT, UPDATE privileges. It is distinct from immutable
-- accepted_events which receives only SELECT, INSERT.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14: RLS AND BYPASSRLS MODEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four roles have NOBYPASSRLS (set in Section 2 deployment template).
-- ledger_migration_owner has BYPASSRLS = YES (reviewed schema proposal
-- Section 11.2: "BYPASSRLS = Yes, needed to create and manage RLS policies").
-- RLS policies are defined in 03_row_level_security.sql and apply to all roles.
-- FORCE ROW LEVEL SECURITY subjects the table owner (ledger_migration_owner)
-- to RLS policies. However, ledger_migration_owner has BYPASSRLS = YES,
-- so it bypasses RLS regardless of the FORCE setting.
-- PostgreSQL superusers always bypass RLS regardless of the FORCE setting
-- or BYPASSRLS attribute.
--
-- The runtime role (ledger_app_user), test role (ledger_test_user), and
-- read-only role (ledger_readonly) have NOBYPASSRLS and are subject to
-- RLS policies including FORCE ROW LEVEL SECURITY.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14.5: LOGIN VERSUS GROUP-ROLE MODEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- All five roles are NOLOGIN. They cannot establish direct database sessions.
-- A future application connection must assume ledger_app_user through one of:
--
-- A. Direct LOGIN role: A separate LOGIN role is created with credentials,
--    and GRANT ledger_app_user TO <login_role> grants membership. The login
--    role connects and executes SET ROLE ledger_app_user before each
--    transaction. This is the most common PostgreSQL pattern.
--
-- B. SET ROLE through a trusted connection role: A LOGIN role is granted
--    membership in ledger_app_user. The application connects as the LOGIN
--    role and SET ROLEs to ledger_app_user for ledger operations.
--
-- The specific LOGIN identity is UNRESOLVED. It is an additional deployment
-- prerequisite:
--   - No LOGIN role name is invented by this package.
--   - No passwords or credentials are included in this package.
--   - The required membership direction is: LOGIN role → member of ledger_app_user.
--   - The LOGIN role must NOT be a member of ledger_migration_owner.
--   - The LOGIN role must NOT be a member of ledger_trigger_owner.
--   - The LOGIN role must NOT have CREATEROLE, SUPERUSER, or BYPASSRLS.
--   - The logical authorization role (ledger_app_user) is distinct from the
--     physical connection identity (the LOGIN role).
--
-- The same pattern applies to test and diagnostic access:
--   - A separate LOGIN role for test access → member of ledger_test_user.
--   - A separate LOGIN role for diagnostic access → member of ledger_readonly.
--   - Neither may inherit migration-owner or trigger-owner authority.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14.6: REQUIRED EXECUTOR FOR EACH STATEMENT GROUP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PostgreSQL ownership-transfer authority model (exact rules, verified from
-- PostgreSQL 17/18 official documentation):
--
--   ALTER SCHEMA ... OWNER TO new_owner:
--     Executor: superuser, OR (current schema owner AND able to SET ROLE to new_owner)
--     New owner: must have CREATE privilege on the containing DATABASE
--
--   ALTER TABLE ... OWNER TO new_owner:
--     Executor: superuser, OR (current table owner AND able to SET ROLE to new_owner)
--     New owner: must have CREATE privilege on the table's SCHEMA
--
--   ALTER FUNCTION ... OWNER TO new_owner:
--     Executor: superuser, OR (current function owner AND able to SET ROLE to new_owner)
--     New owner: must have CREATE privilege on the function's SCHEMA
--
--   "Able to SET ROLE to new_owner" = executor is a direct or indirect member
--   of new_owner with set_option = true (PostgreSQL 17+).
--
--   CREATEROLE is NOT a substitute for SET ROLE authority. CREATEROLE allows
--   creating new roles, not assuming another role's identity. The SET ROLE /
--   membership requirement is separate from CREATEROLE and cannot be satisfied
--   by CREATEROLE alone.
--
--   Being the current owner ALONE is NOT sufficient. The executor must be BOTH
--   the current owner AND able to SET ROLE to the target. The new owner must
--   ALSO have CREATE on the containing object (database for schema, schema for
--   table/function).
--
-- Section 1 (Role creation):          Requires CREATEROLE or superuser.
-- Section 2 (Role attribute hardening): Requires CREATEROLE or superuser.
--
-- Section 3 (ALTER SCHEMA ledger OWNER TO ledger_migration_owner):
--   Current expected owner: whoever created the schema (likely ledger_migration_owner)
--   Target owner: ledger_migration_owner
--   Executor: current schema owner AND able to SET ROLE to ledger_migration_owner,
--     or superuser
--   New owner CREATE requirement: ledger_migration_owner must have CREATE on
--     the containing DATABASE
--   ledger_migration_owner is NOLOGIN and has no CREATE on the database unless
--     explicitly granted by a DBA. This is UNRESOLVED.
--   If 01_schema_forward.sql was run by ledger_migration_owner, this is a no-op.
--   Unresolved prerequisites: DBA membership in ledger_migration_owner (for SET ROLE);
--     CREATE on database for ledger_migration_owner (or superuser)
--
-- Section 4 (ALTER TABLE ... OWNER TO ledger_migration_owner, all 11 tables):
--   Current expected owner: whoever created the tables (likely ledger_migration_owner)
--   Target owner: ledger_migration_owner
--   Executor: current table owner AND able to SET ROLE to ledger_migration_owner,
--     or superuser
--   New owner CREATE requirement: ledger_migration_owner must have CREATE on
--     the ledger SCHEMA
--   ledger_migration_owner owns the ledger schema (after Section 3), so it
--     implicitly has CREATE on the ledger schema. This requirement is MET
--     if the schema is owned by ledger_migration_owner.
--   If 01_schema_forward.sql was run by ledger_migration_owner, these are no-ops.
--   Unresolved prerequisite: DBA membership in ledger_migration_owner (for SET ROLE)
--
-- Section 5 (ALTER FUNCTION ... OWNER TO ledger_trigger_owner):
--   Current expected owner: ledger_migration_owner (if 02 was run by migration owner)
--   Target owner: ledger_trigger_owner
--   Executor: current function owner AND able to SET ROLE to ledger_trigger_owner,
--     or superuser
--   New owner CREATE requirement: ledger_trigger_owner must have CREATE on
--     the ledger SCHEMA
--   ledger_trigger_owner does NOT have CREATE on the ledger schema.
--     This package does NOT grant CREATE on schema to ledger_trigger_owner.
--     Therefore, a non-superuser executor cannot perform this ownership transfer
--     unless the prerequisites below are met.
--
--   Available execution models (all UNRESOLVED — deployment prerequisite):
--
--   A. Superuser/DBA transfer:
--      A superuser bypasses both SET ROLE and CREATE requirements.
--      The superuser executes ALTER FUNCTION OWNER TO ledger_trigger_owner.
--
--   B. Separately administered deployment executor:
--      A non-superuser executor that can SET ROLE to ledger_trigger_owner
--      (i.e., is a member of ledger_trigger_owner with set_option = true),
--      AND ledger_trigger_owner has been granted CREATE on the ledger schema
--      by a DBA. This WEAKENS the security model — trigger_owner could create
--      new functions in the schema. Requires separate owner approval.
--
--   C. Explicit temporary CREATE grant (NOT IMPLEMENTED — requires owner approval):
--      1. DBA grants CREATE on ledger schema to ledger_trigger_owner
--      2. Authorized executor (member of ledger_trigger_owner) performs
--         ALTER FUNCTION OWNER TO ledger_trigger_owner
--      3. DBA revokes CREATE on ledger schema from ledger_trigger_owner
--      4. Verification confirms CREATE is no longer held by trigger_owner
--      This model is NOT implemented or silently chosen. It requires
--      separate owner approval before use.
--
--   Unresolved prerequisites:
--     - Exact deployment executor identity
--     - SET ROLE membership in ledger_trigger_owner
--     - CREATE on ledger schema for ledger_trigger_owner (or superuser)
--     - Whether superuser execution (Model A) or an owner-approved
--       temporary-grant sequence (Model C) will be used
--
-- Section 6 (Schema GRANT USAGE):    Requires schema owner or superuser.
-- Section 7-9 (Table GRANT):         Requires table owner or superuser.
-- Section 10 (Table REVOKE):         Requires table owner or superuser.
-- Section 11 (Function REVOKE):      Requires function owner or superuser.
--   REVOKE EXECUTE FROM PUBLIC is also executed in 02_accepted_event_immutability.sql
--   BEFORE ownership transfer (while migration owner still owns the function).
-- Section 12 (ALTER DEFAULT PRIVILEGES): Must be executed by the object-creating
--   role (ledger_migration_owner) or a role that is the target of FOR ROLE.
--
-- EXECUTION ORDER FOR FUNCTION PRIVILEGES:
--   1. 02_accepted_event_immutability.sql creates the function (owned by migration owner)
--   2. 02_accepted_event_immutability.sql REVOKE EXECUTE FROM PUBLIC (migration owner
--      still owns the function — succeeds)
--   3. 04_privileges.sql Section 5: ALTER FUNCTION OWNER TO ledger_trigger_owner
--      REQUIRES Model A (superuser), Model B (separate executor + CREATE grant),
--      or Model C (temporary CREATE grant — NOT IMPLEMENTED). UNRESOLVED.
--   4. 04_privileges.sql Section 11: REVOKE EXECUTE FROM PUBLIC (now requires
--      ledger_trigger_owner or superuser — already done in step 2, repeated
--      for defense-in-depth)
--
-- Section 3 requires CREATE on database for ledger_migration_owner (UNRESOLVED).
-- Section 4 is executable if DBA is a member of ledger_migration_owner.
-- Section 5 execution model is UNRESOLVED (Models A, B, or C — see above).
-- The DBA/superuser executor identity is UNRESOLVED — a deployment prerequisite.
-- This file is NOT directly executable without a separately administered DBA.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 15: TENANT-CONTEXT TRUST BOUNDARY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The future persistence adapter will execute:
--   SET LOCAL ledger.tenant_id = :tenant_id
-- within each database transaction.
--
-- PostgreSQL itself does NOT distinguish whether the tenant value came from
-- trusted server context versus an arbitrary SQL statement. A holder of
-- ledger_app_user database credentials could execute SET LOCAL to any UUID.
--
-- Required deployment invariant: Database credentials for ledger_app_user
-- MUST be held exclusively by the trusted adapter process. Untrusted callers
-- MUST be prohibited from direct SQL access and transaction initialization.
-- The trust boundary is enforced at the application credential boundary,
-- NOT within PostgreSQL itself.
--
-- Absence of tenant context (GUC not set) causes current_setting to return
-- NULL, which causes RLS to return no rows (fail-closed). A malformed non-
-- empty UUID value causes the ::uuid cast to raise an error.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 16: TRIGGER-FUNCTION SECURITY MODEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Function: ledger.prevent_accepted_events_mutation()
--   Owner: ledger_trigger_owner
--   SECURITY DEFINER: Yes — executes with owner privileges, not caller
--   search_path: ledger, pg_temp — hardened against search_path injection
--   Language: plpgsql
--   Return type: trigger
--   EXECUTE privilege: None (revoked from PUBLIC, not granted to any role)
--   proacl: Non-NULL after REVOKE EXECUTE FROM PUBLIC (materialized)
--   Owner EXECUTE entry: is_grantable = false (owner implicit grant
--     authority is NOT marked as stored grant option; package does NOT use
--     WITH GRANT OPTION)
--
-- Triggers fire automatically — no role needs EXECUTE on the trigger function.
-- Function EXECUTE does NOT allow a caller to bypass the trigger or directly
-- mutate accepted events. The function raises an exception on any invocation
-- (UPDATE or DELETE), preventing mutation regardless of caller privileges.
--
-- Trigger ownership follows the parent table (ledger.accepted_events),
-- which is owned by ledger_migration_owner. Function ownership alone does
-- NOT permit altering or disabling a trigger on a separately owned table.
-- Only the table owner (ledger_migration_owner) or a superuser can manage
-- triggers on accepted_events.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 17: REQUIRED FUTURE EXECUTION ORDER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Deployment-role prerequisite resolution (Section 1, deployment template)
-- 2. Role attribute hardening (Section 2, deployment template)
-- 3. Schema-forward migration (01_schema_forward.sql)
-- 4. Immutable-trigger installation (02_accepted_event_immutability.sql)
--    - REVOKE EXECUTE FROM PUBLIC succeeds while migration owner owns the function
-- 5. RLS policies (03_row_level_security.sql)
-- 6. Ownership assignments (Sections 3-5 of this file)
--    - ALTER SCHEMA OWNER TO ledger_migration_owner
--    - ALTER TABLE ... OWNER TO ledger_migration_owner (all 11 tables)
--    - ALTER FUNCTION ... OWNER TO ledger_trigger_owner
-- 7. Privilege grants and revokes (Sections 6-11 of this file)
-- 8. Default privileges (Section 12 of this file)
-- 9. Static verification (06_static_verification.sql)
-- 10. Future adapter integration tests (not in this package)
--
-- Ownership changes do not prevent later migration files from completing
-- because ownership is assigned AFTER all schema objects are created and
-- RLS policies are defined. The migration owner owns all objects by
-- creation (if 01-03 are run by the migration owner), so the ALTER TABLE
-- OWNER TO statements are idempotent no-ops in that case. The ALTER FUNCTION
-- OWNER TO statement transfers function ownership to ledger_trigger_owner.

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 04_privileges.sql
-- ═══════════════════════════════════════════════════════════════════════════
