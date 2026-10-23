-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 02_accepted_event_immutability.sql
-- Purpose: Immutability trigger function and triggers on accepted_events
--
-- This trigger function prevents UPDATE and DELETE on ledger.accepted_events.
-- AcceptedEventRecords are immutable audit evidence — only INSERT is permitted.
--
-- Trigger function design:
--   SECURITY DEFINER: Yes — executes with owner privileges, not caller privileges
--   search_path: ledger, pg_temp — hardened against search_path injection
--   Language: plpgsql
--
-- Triggers:
--   trg_prevent_ae_update — BEFORE UPDATE, FOR EACH ROW
--   trg_prevent_ae_delete — BEFORE DELETE, FOR EACH ROW
--
-- REVOKE EXECUTE FROM PUBLIC prevents direct invocation of the trigger function.
-- The runtime role (ledger_app_user) does NOT need EXECUTE — triggers fire
-- automatically on DML operations.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POSTGRESQL TRIGGER OWNERSHIP MODEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PostgreSQL triggers do NOT have independently assignable owners. A trigger
-- is owned by the same role that owns the parent table. PostgreSQL does NOT
-- support assigning a trigger owner independently of the table owner.
--
-- Authority model for trigger management:
--
--   1. Table ownership: The owner of ledger.accepted_events controls
--      trigger management (CREATE TRIGGER, DROP TRIGGER, ALTER TABLE ...
--      DISABLE TRIGGER, ALTER TABLE ... ENABLE TRIGGER).
--
--   2. Trigger function ownership: The trigger function
--      (ledger.prevent_accepted_events_mutation) has its own owner,
--      set via ALTER FUNCTION ... OWNER TO or ALTER ROUTINE ... OWNER TO.
--      Owning the function does NOT grant authority to alter, disable,
--      or drop a trigger on a table owned by another role.
--
--   3. Superuser authority: PostgreSQL superusers can perform all
--      administrative actions regardless of ownership, including disabling
--      triggers, dropping functions, and changing ownership.
--
-- Design ownership (resolved at deployment time):
--   - ledger.accepted_events table owner:        ledger_migration_owner
--   - prevent_accepted_events_mutation() owner:   ledger_trigger_owner
--
-- Who can manage triggers on accepted_events:
--   - ledger_migration_owner (table owner): YES — can ALTER TABLE, DISABLE
--     TRIGGER, DROP TRIGGER, CREATE TRIGGER
--   - ledger_trigger_owner (function owner): NO — owning the function alone
--     does not grant trigger management authority on the table
--   - PostgreSQL superusers: YES — can perform all administrative actions
--   - ledger_app_user: NO — has no ALTER privilege on the table
--   - ledger_test_user: NO — has no ALTER privilege on the table
--   - ledger_readonly: NO — has no ALTER privilege on the table
--   - PUBLIC: NO — has no ALTER privilege on the table
--
-- No ALTER TRIGGER OWNER statements are present in this file because
-- PostgreSQL does not support that syntax.

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ledger.prevent_accepted_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'accepted_events is immutable: UPDATE and DELETE are prohibited (record_id=%)',
        COALESCE(OLD.record_id, NEW.record_id, '<unknown>');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_prevent_ae_update
    BEFORE UPDATE ON ledger.accepted_events
    FOR EACH ROW
    EXECUTE FUNCTION ledger.prevent_accepted_events_mutation();

CREATE TRIGGER trg_prevent_ae_delete
    BEFORE DELETE ON ledger.accepted_events
    FOR EACH ROW
    EXECUTE FUNCTION ledger.prevent_accepted_events_mutation();

-- ═══════════════════════════════════════════════════════════════════════════
-- REVOKE PUBLIC EXECUTE
-- Prevents direct invocation of the trigger function by any role.
-- Triggers fire automatically — EXECUTE is not needed by any role.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION ledger.prevent_accepted_events_mutation() FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION OWNERSHIP (deployment template)
-- The trigger function owner is set via ALTER FUNCTION or ALTER ROUTINE.
-- These require superuser or ownership privileges.
-- Uncomment and replace role names at deployment time.
-- ═══════════════════════════════════════════════════════════════════════════

-- ALTER FUNCTION ledger.prevent_accepted_events_mutation() OWNER TO ledger_trigger_owner;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 02_accepted_event_immutability.sql
-- ═══════════════════════════════════════════════════════════════════════════
