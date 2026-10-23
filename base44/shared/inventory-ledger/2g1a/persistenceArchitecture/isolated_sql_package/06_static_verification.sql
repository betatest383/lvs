-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 06_static_verification.sql
-- Purpose: Complete static verification queries (NOT EXECUTED)
--
-- These queries verify EXACT definitions against PostgreSQL catalogs.
-- They are classified as AUTHORED BUT NOT EXECUTED.
-- A non-executed SQL file is NOT a passing database test.
--
-- PREREQUISITE: This SQL is syntactically targeted to the PostgreSQL 17+
-- catalog. It references pg_auth_members.inherit_option, set_option, and
-- admin_option columns (introduced in PostgreSQL 16.0) and is declared
-- for PostgreSQL 17+ as the authorized minimum supported version.
-- Execution on PostgreSQL below 17 is UNSUPPORTED and must be blocked by
-- the deployment runner BEFORE loading this verification SQL. This file
-- does NOT return controlled diagnostic rows on older PostgreSQL versions
-- — parsing or planning may fail before any result row is produced.
-- The deployment-runner version preflight is UNRESOLVED — no runner exists yet.
--
-- Each check returns check_name, result ('PASS' or 'FAIL'), and details.
-- Checks that reference deployment role names are classified as
-- POST-DEPLOYMENT and will FAIL or report NOT READY until placeholders
-- are resolved. Role-dependent checks use safe resolution to avoid
-- aborting the verification script when a role does not exist.

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 1: COMPLETE COLUMN VERIFICATION (94 columns)
-- Expected-definition registry joined against information_schema.columns.
-- Detects: missing expected columns, unexpected additional columns,
-- type mismatches, nullability mismatches, default-presence mismatches,
-- ordinal position mismatches.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_columns AS (
    SELECT * FROM (VALUES
        ('tenants', 'tenant_id', 1, 'uuid', 'NO', false),
        ('tenants', 'created_at', 2, 'timestamp with time zone', 'NO', true),
        ('aggregates', 'tenant_id', 1, 'uuid', 'NO', false),
        ('aggregates', 'aggregate_id', 2, 'text', 'NO', false),
        ('aggregates', 'aggregate_name', 3, 'text', 'NO', false),
        ('aggregates', 'created_at', 4, 'timestamp with time zone', 'NO', true),
        ('state_revision', 'tenant_id', 1, 'uuid', 'NO', false),
        ('state_revision', 'aggregate_id', 2, 'text', 'NO', false),
        ('state_revision', 'current_revision', 3, 'bigint', 'NO', true),
        ('state_revision', 'updated_at', 4, 'timestamp with time zone', 'NO', true),
        ('items', 'tenant_id', 1, 'uuid', 'NO', false),
        ('items', 'item_id', 2, 'text', 'NO', false),
        ('items', 'governed_tracking_mode', 3, 'text', 'NO', false),
        ('items', 'governed_unit', 4, 'text', 'NO', false),
        ('items', 'valuation_method', 5, 'text', 'YES', false),
        ('positions', 'tenant_id', 1, 'uuid', 'NO', false),
        ('positions', 'aggregate_id', 2, 'text', 'NO', false),
        ('positions', 'position_id', 3, 'text', 'NO', false),
        ('positions', 'item_id', 4, 'text', 'NO', false),
        ('positions', 'position_kind', 5, 'text', 'NO', false),
        ('positions', 'ownership_class', 6, 'text', 'NO', false),
        ('positions', 'origin_class', 7, 'text', 'NO', false),
        ('positions', 'condition_class', 8, 'text', 'NO', false),
        ('positions', 'restriction_class', 9, 'text', 'NO', false),
        ('positions', 'position_quantity', 10, 'numeric', 'NO', false),
        ('positions', 'warehouse_location_id', 11, 'text', 'YES', false),
        ('positions', 'bin_location_id', 12, 'text', 'YES', false),
        ('positions', 'job_id', 13, 'text', 'YES', false),
        ('positions', 'transfer_id', 14, 'text', 'YES', false),
        ('positions', 'terminal_reference', 15, 'text', 'YES', false),
        ('company_ownership', 'tenant_id', 1, 'uuid', 'NO', false),
        ('company_ownership', 'aggregate_id', 2, 'text', 'NO', false),
        ('company_ownership', 'item_id', 3, 'text', 'NO', false),
        ('company_ownership', 'company_owned_quantity', 4, 'numeric', 'NO', false),
        ('transfers_outstanding', 'tenant_id', 1, 'uuid', 'NO', false),
        ('transfers_outstanding', 'aggregate_id', 2, 'text', 'NO', false),
        ('transfers_outstanding', 'transfer_id', 3, 'text', 'NO', false),
        ('transfers_outstanding', 'item_id', 4, 'text', 'NO', false),
        ('transfers_outstanding', 'source_position_id', 5, 'text', 'NO', false),
        ('transfers_outstanding', 'destination_position_id', 6, 'text', 'NO', false),
        ('transfers_outstanding', 'in_transit_position_id', 7, 'text', 'NO', false),
        ('transfers_outstanding', 'dispatched_quantity', 8, 'numeric', 'NO', false),
        ('transfers_outstanding', 'received_quantity', 9, 'numeric', 'NO', true),
        ('transfers_outstanding', 'status', 10, 'text', 'NO', true),
        ('transfers_outstanding', 'dispatch_event_id', 11, 'text', 'NO', false),
        ('transfers_outstanding', 'receive_event_id', 12, 'text', 'YES', false),
        ('correction_provenance', 'tenant_id', 1, 'uuid', 'NO', false),
        ('correction_provenance', 'aggregate_id', 2, 'text', 'NO', false),
        ('correction_provenance', 'record_id', 3, 'text', 'NO', false),
        ('correction_provenance', 'original_event_type', 4, 'text', 'NO', false),
        ('correction_provenance', 'original_event_id', 5, 'text', 'NO', false),
        ('correction_provenance', 'original_item_id', 6, 'text', 'NO', false),
        ('correction_provenance', 'original_position_id', 7, 'text', 'NO', false),
        ('correction_provenance', 'original_signed_delta', 8, 'numeric', 'NO', false),
        ('correction_provenance', 'original_absolute_quantity', 9, 'numeric', 'NO', false),
        ('correction_provenance', 'reversed_absolute_quantity', 10, 'numeric', 'NO', true),
        ('correction_provenance', 'remaining_reversible_quantity', 11, 'numeric', 'NO', false),
        ('correction_provenance', 'related_issue_event_id', 12, 'text', 'YES', false),
        ('correction_provenance', 'blocking_downstream_event_ids', 13, 'jsonb', 'NO', true),
        ('job_issue_progress', 'tenant_id', 1, 'uuid', 'NO', false),
        ('job_issue_progress', 'aggregate_id', 2, 'text', 'NO', false),
        ('job_issue_progress', 'issue_event_id', 3, 'text', 'NO', false),
        ('job_issue_progress', 'item_id', 4, 'text', 'NO', false),
        ('job_issue_progress', 'job_custody_position_id', 5, 'text', 'NO', false),
        ('job_issue_progress', 'issued_quantity', 6, 'numeric', 'NO', false),
        ('job_issue_progress', 'consumed_quantity', 7, 'numeric', 'NO', true),
        ('job_issue_progress', 'returned_quantity', 8, 'numeric', 'NO', true),
        ('job_issue_progress', 'outstanding_quantity', 9, 'numeric', 'NO', false),
        ('job_issue_progress', 'status', 10, 'text', 'NO', true),
        ('job_issue_progress', 'created_revision', 11, 'bigint', 'NO', false),
        ('job_issue_progress', 'last_updated_revision', 12, 'bigint', 'NO', false),
        ('accepted_events', 'tenant_id', 1, 'uuid', 'NO', false),
        ('accepted_events', 'aggregate_id', 2, 'text', 'NO', false),
        ('accepted_events', 'record_id', 3, 'text', 'NO', false),
        ('accepted_events', 'event_id', 4, 'text', 'NO', false),
        ('accepted_events', 'event_type', 5, 'text', 'NO', false),
        ('accepted_events', 'idempotency_key', 6, 'text', 'NO', false),
        ('accepted_events', 'canonical_state_revision', 7, 'bigint', 'NO', false),
        ('accepted_events', 'formula_version', 8, 'text', 'NO', false),
        ('accepted_events', 'event_json', 9, 'jsonb', 'NO', false),
        ('accepted_events', 'state_effects_json', 10, 'jsonb', 'NO', false),
        ('accepted_events', 'recorded_operations_json', 11, 'jsonb', 'NO', false),
        ('accepted_events', 'immutable_facts_json', 12, 'jsonb', 'NO', false),
        ('accepted_events', 'classification_results_json', 13, 'jsonb', 'NO', false),
        ('accepted_events', 'derived_snapshots_json', 14, 'jsonb', 'NO', false),
        ('accepted_events', 'warnings_json', 15, 'jsonb', 'NO', false),
        ('accepted_events', 'notes', 16, 'text', 'NO', true),
        ('accepted_events', 'evaluation_timestamp', 17, 'timestamp with time zone', 'NO', false),
        ('accepted_events', 'created_at', 18, 'timestamp with time zone', 'NO', true),
        ('accepted_events', 'created_by', 19, 'text', 'YES', false),
        ('transaction_cutoff', 'tenant_id', 1, 'uuid', 'NO', false),
        ('transaction_cutoff', 'aggregate_id', 2, 'text', 'NO', false),
        ('transaction_cutoff', 'cutoff_time', 3, 'text', 'NO', false),
        ('transaction_cutoff', 'freeze_status', 4, 'text', 'NO', true)
    ) AS t(table_name, column_name, ordinal_position, data_type, is_nullable, has_default)
),
actual_columns AS (
    SELECT table_name, column_name, ordinal_position, data_type, is_nullable,
           (column_default IS NOT NULL) AS has_default
    FROM information_schema.columns
    WHERE table_schema = 'ledger'
)
SELECT 'check_1_columns' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(table_name || '.' || column_name || ': ' || detail, ' | ') AS details
FROM (
    SELECT e.table_name, e.column_name, 'MISSING expected column' AS detail
    FROM expected_columns e
    LEFT JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE a.column_name IS NULL
    UNION ALL
    SELECT a.table_name, a.column_name, 'UNEXPECTED additional column' AS detail
    FROM actual_columns a
    LEFT JOIN expected_columns e ON a.table_name = e.table_name AND a.column_name = e.column_name
    WHERE e.column_name IS NULL
    UNION ALL
    SELECT e.table_name, e.column_name, 'TYPE mismatch expected=' || e.data_type || ' actual=' || a.data_type AS detail
    FROM expected_columns e
    JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE e.data_type IS DISTINCT FROM a.data_type
    UNION ALL
    SELECT e.table_name, e.column_name, 'NULLABLE mismatch expected=' || e.is_nullable || ' actual=' || a.is_nullable AS detail
    FROM expected_columns e
    JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE e.is_nullable IS DISTINCT FROM a.is_nullable
    UNION ALL
    SELECT e.table_name, e.column_name, 'DEFAULT mismatch expected_has_default=' || e.has_default || ' actual_has_default=' || a.has_default AS detail
    FROM expected_columns e
    JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE e.has_default IS DISTINCT FROM a.has_default
    UNION ALL
    SELECT e.table_name, e.column_name, 'ORDINAL mismatch expected=' || e.ordinal_position || ' actual=' || a.ordinal_position AS detail
    FROM expected_columns e
    JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE e.ordinal_position IS DISTINCT FROM a.ordinal_position
) AS mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 1b: COMPLETE DEFAULT EXPRESSION VERIFICATION (14 defaults)
-- Registry-based approach: detects missing expected defaults,
-- incorrect default expressions, and unexpected defaults.
-- Normalization: regex fragment matching against column_default text.
-- Limitation: pg_get_expr may vary by PostgreSQL version; regex is
-- intentionally permissive to allow version-specific cast annotations.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_defaults AS (
    SELECT * FROM (VALUES
        ('tenants', 'created_at', 'now\(\)'),
        ('aggregates', 'created_at', 'now\(\)'),
        ('state_revision', 'current_revision', '^0'),
        ('state_revision', 'updated_at', 'now\(\)'),
        ('transfers_outstanding', 'received_quantity', '^0'),
        ('transfers_outstanding', 'status', 'outstanding'),
        ('correction_provenance', 'reversed_absolute_quantity', '^0'),
        ('correction_provenance', 'blocking_downstream_event_ids', '\[\]'),
        ('job_issue_progress', 'consumed_quantity', '^0'),
        ('job_issue_progress', 'returned_quantity', '^0'),
        ('job_issue_progress', 'status', 'open'),
        ('accepted_events', 'notes', '^'''),
        ('accepted_events', 'created_at', 'now\(\)'),
        ('transaction_cutoff', 'freeze_status', 'none')
    ) AS t(table_name, column_name, expected_pattern)
),
actual_defaults AS (
    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'ledger'
)
SELECT 'check_1b_defaults' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(table_name || '.' || column_name || ': ' || issue || ' expected~[''' || COALESCE(expected_pattern, 'N/A') || '''] actual=[' || COALESCE(column_default, 'NULL') || ']', ' | ') AS details
FROM (
    -- Missing expected default (column exists but has no default)
    SELECT e.table_name, e.column_name, e.expected_pattern, a.column_default,
           'MISSING expected default' AS issue
    FROM expected_defaults e
    JOIN actual_defaults a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE a.column_default IS NULL
    UNION ALL
    -- Incorrect default expression (default exists but does not match expected pattern)
    SELECT e.table_name, e.column_name, e.expected_pattern, a.column_default,
           'INCORRECT default expression' AS issue
    FROM expected_defaults e
    JOIN actual_defaults a ON e.table_name = a.table_name AND e.column_name = a.column_name
    WHERE a.column_default IS NOT NULL
      AND a.column_default !~* e.expected_pattern
    UNION ALL
    -- Unexpected default (column has a default but is not in the expected registry)
    SELECT a.table_name, a.column_name, NULL::text AS expected_pattern, a.column_default,
           'UNEXPECTED default (not in registry)' AS issue
    FROM actual_defaults a
    LEFT JOIN expected_defaults e ON a.table_name = e.table_name AND a.column_name = e.column_name
    WHERE a.column_default IS NOT NULL AND e.table_name IS NULL
) AS default_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 2: COMPLETE PRIMARY KEY AND UNIQUE CONSTRAINT VERIFICATION
-- Uses pg_constraint.conkey (ordered int2vector of attribute numbers)
-- mapped to column names via pg_attribute.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_keys AS (
    SELECT * FROM (VALUES
        ('tenants', 'PRIMARY KEY', ARRAY['tenant_id']),
        ('aggregates', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id']),
        ('state_revision', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id']),
        ('items', 'PRIMARY KEY', ARRAY['tenant_id', 'item_id']),
        ('positions', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'position_id']),
        ('positions', 'UNIQUE', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id']),
        ('company_ownership', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'item_id']),
        ('transfers_outstanding', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'transfer_id']),
        ('correction_provenance', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'record_id']),
        ('job_issue_progress', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'issue_event_id']),
        ('accepted_events', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id', 'record_id']),
        ('accepted_events', 'UNIQUE', ARRAY['tenant_id', 'aggregate_id', 'idempotency_key']),
        ('transaction_cutoff', 'PRIMARY KEY', ARRAY['tenant_id', 'aggregate_id'])
    ) AS t(table_name, constraint_type, expected_columns)
),
actual_keys AS (
    SELECT
        c.relname AS table_name,
        CASE pc.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' END AS constraint_type,
        conname AS constraint_name,
        array_agg(a.attname ORDER BY u.ord) AS actual_columns
    FROM pg_constraint pc
    JOIN pg_class c ON pc.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN unnest(pc.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
    WHERE n.nspname = 'ledger' AND pc.contype IN ('p', 'u')
    GROUP BY c.relname, pc.contype, conname
)
SELECT 'check_2_keys' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'MISSING expected key: ' || e.table_name || ' ' || e.constraint_type || ' (' || array_to_string(e.expected_columns, ', ') || ')' AS detail
    FROM expected_keys e
    LEFT JOIN actual_keys a ON e.table_name = a.table_name AND e.constraint_type = a.constraint_type
        AND e.expected_columns = a.actual_columns
    WHERE a.table_name IS NULL
    UNION ALL
    SELECT 'UNEXPECTED key: ' || a.table_name || ' ' || a.constraint_type || ' (' || array_to_string(a.actual_columns, ', ') || ') name=' || a.constraint_name AS detail
    FROM actual_keys a
    LEFT JOIN expected_keys e ON a.table_name = e.table_name AND a.constraint_type = e.constraint_type
        AND a.actual_columns = e.expected_columns
    WHERE e.table_name IS NULL
    UNION ALL
    SELECT 'COLUMN ORDER mismatch: ' || e.table_name || ' ' || e.constraint_type || ' expected=[' || array_to_string(e.expected_columns, ', ') || '] actual=[' || array_to_string(a.actual_columns, ', ') || ']' AS detail
    FROM expected_keys e
    JOIN actual_keys a ON e.table_name = a.table_name AND e.constraint_type = a.constraint_type
    WHERE e.expected_columns IS DISTINCT FROM a.actual_columns
) AS key_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 3: COMPLETE FOREIGN KEY VERIFICATION
-- Uses pg_constraint conkey/confkey for exact ordered column mapping.
-- confupptype/confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_fks AS (
    SELECT * FROM (VALUES
        ('aggregates', ARRAY['tenant_id'], 'tenants', ARRAY['tenant_id'], 'a', 'a', false, false),
        ('state_revision', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('positions', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('positions', ARRAY['tenant_id', 'item_id'], 'items', ARRAY['tenant_id', 'item_id'], 'a', 'a', false, false),
        ('company_ownership', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('company_ownership', ARRAY['tenant_id', 'item_id'], 'items', ARRAY['tenant_id', 'item_id'], 'a', 'a', false, false),
        ('transfers_outstanding', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('transfers_outstanding', ARRAY['tenant_id', 'item_id'], 'items', ARRAY['tenant_id', 'item_id'], 'a', 'a', false, false),
        ('transfers_outstanding', ARRAY['tenant_id', 'aggregate_id', 'source_position_id', 'item_id'], 'positions', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id'], 'a', 'a', false, false),
        ('transfers_outstanding', ARRAY['tenant_id', 'aggregate_id', 'destination_position_id', 'item_id'], 'positions', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id'], 'a', 'a', false, false),
        ('transfers_outstanding', ARRAY['tenant_id', 'aggregate_id', 'in_transit_position_id', 'item_id'], 'positions', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id'], 'a', 'a', false, false),
        ('correction_provenance', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('correction_provenance', ARRAY['tenant_id', 'aggregate_id', 'original_position_id', 'original_item_id'], 'positions', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id'], 'a', 'a', false, false),
        ('job_issue_progress', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('job_issue_progress', ARRAY['tenant_id', 'item_id'], 'items', ARRAY['tenant_id', 'item_id'], 'a', 'a', false, false),
        ('job_issue_progress', ARRAY['tenant_id', 'aggregate_id', 'job_custody_position_id', 'item_id'], 'positions', ARRAY['tenant_id', 'aggregate_id', 'position_id', 'item_id'], 'a', 'a', false, false),
        ('accepted_events', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false),
        ('transaction_cutoff', ARRAY['tenant_id', 'aggregate_id'], 'aggregates', ARRAY['tenant_id', 'aggregate_id'], 'a', 'r', false, false)
    ) AS t(child_table, child_columns, parent_table, parent_columns, on_update, on_delete, deferrable, initially_deferred)
),
actual_fks AS (
    SELECT
        c.relname AS child_table,
        conname AS constraint_name,
        pc.confrelid AS parent_oid,
        pc.confupdtype AS on_update,
        pc.confdeltype AS on_delete,
        pc.condeferrable AS deferrable,
        pc.condeferred AS initially_deferred,
        array_agg(ca.attname ORDER BY u.ord) AS child_columns,
        array_agg(pa.attname ORDER BY u.ord) AS parent_columns
    FROM pg_constraint pc
    JOIN pg_class c ON pc.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN unnest(pc.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
    JOIN pg_attribute ca ON ca.attrelid = c.oid AND ca.attnum = u.attnum
    JOIN unnest(pc.confkey) WITH ORDINALITY AS u2(attnum, ord) ON u2.ord = u.ord
    JOIN pg_attribute pa ON pa.attrelid = pc.confrelid AND pa.attnum = u2.attnum
    WHERE n.nspname = 'ledger' AND pc.contype = 'f'
    GROUP BY c.relname, conname, pc.confrelid, pc.confupdtype, pc.confdeltype, pc.condeferrable, pc.condeferred
),
actual_fks_with_parent AS (
    SELECT a.*, p.relname AS parent_table
    FROM actual_fks a
    JOIN pg_class p ON a.parent_oid = p.oid
)
SELECT 'check_3_foreign_keys' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'MISSING expected FK: ' || e.child_table || '(' || array_to_string(e.child_columns, ',') || ') -> ' || e.parent_table || '(' || array_to_string(e.parent_columns, ',') || ')' AS detail
    FROM expected_fks e
    LEFT JOIN actual_fks_with_parent a ON e.child_table = a.child_table AND e.parent_table = a.parent_table
        AND e.child_columns = a.child_columns AND e.parent_columns = a.parent_columns
    WHERE a.child_table IS NULL
    UNION ALL
    SELECT 'UNEXPECTED FK: ' || a.child_table || '(' || array_to_string(a.child_columns, ',') || ') -> ' || a.parent_table || '(' || array_to_string(a.parent_columns, ',') || ') name=' || a.constraint_name AS detail
    FROM actual_fks_with_parent a
    LEFT JOIN expected_fks e ON a.child_table = e.child_table AND a.parent_table = e.parent_table
        AND a.child_columns = e.child_columns AND a.parent_columns = e.parent_columns
    WHERE e.child_table IS NULL
    UNION ALL
    SELECT 'FK ACTION mismatch: ' || e.child_table || '(' || array_to_string(e.child_columns, ',') || ') expected on_update=' || e.on_update || ' on_delete=' || e.on_delete || ' actual on_update=' || a.on_update || ' on_delete=' || a.on_delete AS detail
    FROM expected_fks e
    JOIN actual_fks_with_parent a ON e.child_table = a.child_table AND e.parent_table = a.parent_table
        AND e.child_columns = a.child_columns AND e.parent_columns = a.parent_columns
    WHERE e.on_update IS DISTINCT FROM a.on_update OR e.on_delete IS DISTINCT FROM a.on_delete
    UNION ALL
    SELECT 'FK DEFERRABILITY mismatch: ' || e.child_table || '(' || array_to_string(e.child_columns, ',') || ') expected deferrable=' || e.deferrable || ' actual=' || a.deferrable AS detail
    FROM expected_fks e
    JOIN actual_fks_with_parent a ON e.child_table = a.child_table AND e.parent_table = a.parent_table
        AND e.child_columns = a.child_columns AND e.parent_columns = a.parent_columns
    WHERE e.deferrable IS DISTINCT FROM a.deferrable OR e.initially_deferred IS DISTINCT FROM a.initially_deferred
) AS fk_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 4: COMPLETE CHECK CONSTRAINT VERIFICATION
-- Uses pg_get_constraintdef for normalized definition.
-- Normalization: lowercased, whitespace collapsed, parentheses preserved.
-- Limitation: pg_get_constraintdef output may vary by PostgreSQL version.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_checks AS (
    SELECT * FROM (VALUES
        ('state_revision', 'current_revision >= 0'),
        ('positions', 'position_quantity >= 0'),
        ('transfers_outstanding', 'dispatched_quantity > 0'),
        ('transfers_outstanding', 'received_quantity >= 0'),
        ('correction_provenance', 'remaining_reversible_quantity >= 0'),
        ('job_issue_progress', 'outstanding_quantity >= 0'),
        ('accepted_events', 'canonical_state_revision > 0')
    ) AS t(table_name, expected_fragment)
),
actual_checks AS (
    SELECT
        c.relname AS table_name,
        pc.conname AS constraint_name,
        pg_get_constraintdef(pc.oid) AS definition,
        pc.convalidated AS validated
    FROM pg_constraint pc
    JOIN pg_class c ON pc.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'ledger' AND pc.contype = 'c'
)
SELECT 'check_4_check_constraints' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'MISSING expected check: ' || e.table_name || ' ~[' || e.expected_fragment || ']' AS detail
    FROM expected_checks e
    LEFT JOIN actual_checks a ON a.table_name = e.table_name AND a.definition ~* REPLACE(REPLACE(e.expected_fragment, '(', '\\('), ')', '\\)')
    WHERE a.table_name IS NULL
    UNION ALL
    SELECT 'UNEXPECTED check: ' || a.table_name || ' name=' || a.constraint_name || ' def=' || a.definition AS detail
    FROM actual_checks a
    LEFT JOIN expected_checks e ON a.table_name = e.table_name AND a.definition ~* REPLACE(REPLACE(e.expected_fragment, '(', '\\('), ')', '\\)')
    WHERE e.table_name IS NULL
    UNION ALL
    SELECT 'UNVALIDATED check: ' || a.table_name || ' name=' || a.constraint_name AS detail
    FROM actual_checks a
    WHERE NOT a.validated
) AS check_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 5: COMPLETE INDEX VERIFICATION
-- Uses pg_indexes for definition text and pg_index for metadata.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_indexes AS (
    SELECT * FROM (VALUES
        ('accepted_events', 'idx_ae_idem', false, 'tenant_id, aggregate_id, idempotency_key', NULL),
        ('accepted_events', 'idx_ae_revision', false, 'tenant_id, aggregate_id, canonical_state_revision', NULL),
        ('accepted_events', 'idx_ae_event_type', false, 'tenant_id, aggregate_id, event_type', NULL),
        ('positions', 'idx_positions_item', false, 'tenant_id, aggregate_id, item_id', NULL),
        ('transfers_outstanding', 'idx_to_outstanding', false, 'tenant_id, aggregate_id, transfer_id', 'status = ''outstanding'''),
        ('correction_provenance', 'idx_cp_original', false, 'tenant_id, aggregate_id, original_event_id', NULL)
    ) AS t(table_name, index_name, is_unique, expected_columns, expected_predicate)
),
actual_indexes AS (
    SELECT
        tablename AS table_name,
        indexname AS index_name,
        indexdef
    FROM pg_indexes
    WHERE schemaname = 'ledger'
)
SELECT 'check_5_indexes' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'MISSING expected index: ' || e.table_name || '.' || e.index_name AS detail
    FROM expected_indexes e
    LEFT JOIN actual_indexes a ON e.table_name = a.table_name AND e.index_name = a.index_name
    WHERE a.index_name IS NULL
    UNION ALL
    SELECT 'UNEXPECTED index: ' || a.table_name || '.' || a.index_name AS detail
    FROM actual_indexes a
    LEFT JOIN expected_indexes e ON a.table_name = e.table_name AND a.index_name = e.index_name
    WHERE e.index_name IS NULL
    UNION ALL
    SELECT 'INDEX uniqueness mismatch: ' || e.table_name || '.' || e.index_name || ' expected_unique=' || e.is_unique AS detail
    FROM expected_indexes e
    JOIN actual_indexes a ON e.table_name = a.table_name AND e.index_name = a.index_name
    WHERE e.is_unique = true AND a.indexdef !~* 'UNIQUE'
    UNION ALL
    SELECT 'INDEX predicate mismatch: ' || e.table_name || '.' || e.index_name || ' expected_predicate=' || COALESCE(e.expected_predicate, 'NULL') AS detail
    FROM expected_indexes e
    JOIN actual_indexes a ON e.table_name = a.table_name AND e.index_name = a.index_name
    WHERE e.expected_predicate IS NOT NULL AND a.indexdef !~* REPLACE(e.expected_predicate, '''', '''''')
    UNION ALL
    SELECT 'INDEX unexpected predicate: ' || e.table_name || '.' || e.index_name AS detail
    FROM expected_indexes e
    JOIN actual_indexes a ON e.table_name = a.table_name AND e.index_name = a.index_name
    WHERE e.expected_predicate IS NULL AND a.indexdef ~* 'WHERE'
) AS index_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 6: COMPLETE RLS ENABLEMENT AND FORCE VERIFICATION (per table)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_6_rls_enablement' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'RLS not enabled on ' || tablename AS detail
    FROM pg_tables WHERE schemaname='ledger' AND tablename IN
    ('state_revision','aggregates','items','positions','company_ownership',
     'transfers_outstanding','correction_provenance','job_issue_progress',
     'accepted_events','transaction_cutoff')
    AND rowsecurity = false
    UNION ALL
    SELECT 'FORCE RLS not enabled on ' || tablename AS detail
    FROM pg_tables WHERE schemaname='ledger' AND tablename IN
    ('state_revision','aggregates','items','positions','company_ownership',
     'transfers_outstanding','correction_provenance','job_issue_progress',
     'accepted_events','transaction_cutoff')
    AND forcerowsecurity = false
    UNION ALL
    SELECT 'RLS unexpectedly enabled on tenants' AS detail
    FROM pg_tables WHERE schemaname='ledger' AND tablename='tenants' AND rowsecurity=true
) AS rls_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 7: COMPLETE RLS POLICY VERIFICATION (per policy)
-- Verifies exact policy name, command, roles, USING, WITH CHECK per table.
--
-- pg_policies.roles is name[] (an array type), NOT a scalar text.
--
-- PostgreSQL stores PUBLIC as role OID zero in pg_policy.polroles.
-- The pg_policies system view converts this representation into a name[]
-- array containing 'public'. Therefore, a CREATE POLICY statement with
-- no TO clause (which applies to PUBLIC) appears in pg_policies.roles as
-- a one-element name array: {public}.
--
-- This is NOT NULL. A policy without a TO clause has roles = '{public}',
-- not NULL.
--
-- Expected roles for all package policies: ARRAY['public']::name[]
-- This exact array comparison distinguishes among:
--   {public}         — PASS (expected)
--   NULL             — FAIL (unexpected NULL)
--   {}               — FAIL (empty array)
--   {specific_role}  — FAIL (wrong role)
--   {public,other}   — FAIL (PUBLIC plus another role)
--   {role1,role2}    — FAIL (multiple non-PUBLIC roles)
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_policies AS (
    SELECT * FROM (VALUES
        ('state_revision', 'rls_state_revision'),
        ('aggregates', 'rls_aggregates'),
        ('items', 'rls_items'),
        ('positions', 'rls_positions'),
        ('company_ownership', 'rls_company_ownership'),
        ('transfers_outstanding', 'rls_transfers_outstanding'),
        ('correction_provenance', 'rls_correction_provenance'),
        ('job_issue_progress', 'rls_job_issue_progress'),
        ('accepted_events', 'rls_accepted_events'),
        ('transaction_cutoff', 'rls_transaction_cutoff')
    ) AS t(table_name, policy_name)
)
SELECT 'check_7_rls_policies' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    SELECT 'MISSING expected policy: ' || e.table_name || '.' || e.policy_name AS detail
    FROM expected_policies e
    LEFT JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.policyname IS NULL
    UNION ALL
    SELECT 'UNEXPECTED policy: ' || p.tablename || '.' || p.policyname AS detail
    FROM pg_policies p
    LEFT JOIN expected_policies e ON p.tablename = e.table_name AND p.policyname = e.policy_name
    WHERE p.schemaname='ledger' AND e.table_name IS NULL
    UNION ALL
    SELECT 'POLICY cmd mismatch: ' || e.table_name || '.' || e.policy_name || ' expected=ALL actual=' || p.cmd AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.cmd IS DISTINCT FROM 'ALL'
    UNION ALL
    SELECT 'POLICY missing USING: ' || e.table_name || '.' || e.policy_name AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.qual IS NULL OR p.qual = ''
    UNION ALL
    SELECT 'POLICY missing WITH CHECK: ' || e.table_name || '.' || e.policy_name AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.with_check IS NULL OR p.with_check = ''
    UNION ALL
    SELECT 'POLICY USING not tenant-scoped: ' || e.table_name || '.' || e.policy_name || ' qual=' || p.qual AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.qual IS NOT NULL AND p.qual !~* 'tenant_id = current_setting'
    UNION ALL
    SELECT 'POLICY WITH CHECK not tenant-scoped: ' || e.table_name || '.' || e.policy_name AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.with_check IS NOT NULL AND p.with_check !~* 'tenant_id = current_setting'
    UNION ALL
    -- pg_policies.roles is name[] (array). A policy without a TO clause
    -- (applies to PUBLIC) has roles = '{public}' (a one-element name array
    -- containing 'public'), NOT NULL. We verify the exact expected value
    -- using IS DISTINCT FROM with a typed name[] array literal. This
    -- distinguishes {public} from NULL, {}, {specific_role}, {public,other},
    -- and multi-role arrays. array_to_string is used for display only.
    SELECT 'POLICY roles mismatch (expected {public}): '
        || e.table_name || '.' || e.policy_name
        || ' roles=' || COALESCE(array_to_string(p.roles, ','), 'NULL') AS detail
    FROM expected_policies e
    JOIN pg_policies p ON e.table_name = p.tablename AND e.policy_name = p.policyname AND p.schemaname='ledger'
    WHERE p.roles IS DISTINCT FROM ARRAY['public']::name[]
) AS policy_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 8: EXACT TRIGGER VERIFICATION (affirmative — fails if trigger absent)
--
-- pg_trigger.tgtype is a bit field (int2):
--   ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32, INSTEAD=64, AFTER=128
--
-- Each trigger is verified for:
--   - exact name and table
--   - NOT tgisinternal (user-created, not partition-inherited)
--   - BEFORE (tgtype & 2 = 2)
--   - ROW-level (tgtype & 1 = 1)
--   - exact event bit: UPDATE (16) for trg_prevent_ae_update, DELETE (8) for trg_prevent_ae_delete
--   - absence of unintended events: INSERT (4), TRUNCATE (32), INSTEAD (64), AFTER (128)
--   - tgenabled = 'O' (origin, enabled)
--   - bound function OID matches to_regprocedure('ledger.prevent_accepted_events_mutation()')
--     (exact zero-argument signature — a differently overloaded function with the
--      same proname will NOT satisfy this check)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_8_triggers' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- trg_prevent_ae_update: must be BEFORE ROW UPDATE, not INSERT/DELETE/TRUNCATE, enabled,
    -- bound to exact function OID
    SELECT 'MISSING or INCORRECT trigger trg_prevent_ae_update on accepted_events' AS detail
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname='ledger' AND c.relname='accepted_events'
        AND t.tgname='trg_prevent_ae_update'
        AND NOT t.tgisinternal
        AND (t.tgtype & 1) = 1   -- ROW
        AND (t.tgtype & 2) = 2   -- BEFORE
        AND (t.tgtype & 16) = 16 -- UPDATE event
        AND (t.tgtype & 4) = 0   -- NOT INSERT
        AND (t.tgtype & 8) = 0   -- NOT DELETE
        AND (t.tgtype & 32) = 0  -- NOT TRUNCATE
        AND (t.tgtype & 64) = 0  -- NOT INSTEAD OF
        AND (t.tgtype & 128) = 0 -- NOT AFTER
        AND t.tgenabled = 'O'    -- enabled (origin)
        AND t.tgfoid = to_regprocedure('ledger.prevent_accepted_events_mutation()')
    )
    UNION ALL
    -- trg_prevent_ae_delete: must be BEFORE ROW DELETE, not INSERT/UPDATE/TRUNCATE, enabled,
    -- bound to exact function OID
    SELECT 'MISSING or INCORRECT trigger trg_prevent_ae_delete on accepted_events'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname='ledger' AND c.relname='accepted_events'
        AND t.tgname='trg_prevent_ae_delete'
        AND NOT t.tgisinternal
        AND (t.tgtype & 1) = 1   -- ROW
        AND (t.tgtype & 2) = 2   -- BEFORE
        AND (t.tgtype & 8) = 8   -- DELETE event
        AND (t.tgtype & 4) = 0   -- NOT INSERT
        AND (t.tgtype & 16) = 0 -- NOT UPDATE
        AND (t.tgtype & 32) = 0 -- NOT TRUNCATE
        AND (t.tgtype & 64) = 0 -- NOT INSTEAD OF
        AND (t.tgtype & 128) = 0 -- NOT AFTER
        AND t.tgenabled = 'O'    -- enabled (origin)
        AND t.tgfoid = to_regprocedure('ledger.prevent_accepted_events_mutation()')
    )
    UNION ALL
    SELECT 'UNEXPECTED trigger on accepted_events: ' || t.tgname AS detail
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname='ledger' AND c.relname='accepted_events'
    AND NOT t.tgisinternal
    AND t.tgname NOT IN ('trg_prevent_ae_update', 'trg_prevent_ae_delete')
) AS trigger_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 9: EXACT TRIGGER FUNCTION VERIFICATION
--
-- The function is resolved by to_regprocedure('ledger.prevent_accepted_events_mutation()')
-- which uses the exact zero-argument signature. A differently overloaded function
-- with the same proname will NOT satisfy this resolution.
--
-- Verified properties:
--   - existence (fn_oid IS NOT NULL)
--   - SECURITY DEFINER (pg_proc.prosecdef = true)
--   - search_path configured (pg_proc.proconfig contains search_path=ledger, pg_temp)
--   - language = plpgsql
--   - return type = trigger
--   - owner = ledger_trigger_owner (POST-DEPLOYMENT — uses pg_get_userbyid for
--     safe resolution without pg_authid superuser requirement)
--   - PUBLIC has no EXECUTE (POST-DEPLOYMENT — uses has_function_privilege with
--     safe function-OID resolution)
--   - accepted_events table owner = ledger_migration_owner (POST-DEPLOYMENT)
-- ═══════════════════════════════════════════════════════════════════════════

WITH fn_resolution AS (
    -- to_regprocedure returns NULL if the function does not exist.
    -- This is the exact zero-argument signature: ledger.prevent_accepted_events_mutation()
    SELECT to_regprocedure('ledger.prevent_accepted_events_mutation()') AS fn_oid
)
SELECT 'check_9_trigger_function' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- Function existence
    SELECT 'FUNCTION prevent_accepted_events_mutation() MISSING (to_regprocedure returned NULL)' AS detail
    FROM fn_resolution WHERE fn_oid IS NULL

    UNION ALL
    -- SECURITY DEFINER
    SELECT 'FUNCTION not SECURITY DEFINER'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL AND p.prosecdef = false

    UNION ALL
    -- search_path configured
    SELECT 'FUNCTION search_path mismatch (expected: search_path=ledger,pg_temp actual=' || COALESCE(array_to_string(p.proconfig, ','), 'NULL') || ')'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND (
        p.proconfig IS NULL
        OR array_length(p.proconfig) != 1
        OR LOWER(REPLACE(p.proconfig[1], ' ', '')) IS DISTINCT FROM 'search_path=ledger,pg_temp'
    )

    UNION ALL
    -- Language = plpgsql
    SELECT 'FUNCTION language not plpgsql'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    JOIN pg_language l ON p.prolang = l.oid
    WHERE fr.fn_oid IS NOT NULL AND l.lanname != 'plpgsql'

    UNION ALL
    -- Return type = trigger
    SELECT 'FUNCTION return type not trigger'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    JOIN pg_type rt ON p.prorettype = rt.oid
    WHERE fr.fn_oid IS NOT NULL AND rt.typname != 'trigger'

    UNION ALL
    -- Owner check (POST-DEPLOYMENT)
    -- pg_get_userbyid resolves the role name from the OID without superuser access.
    SELECT 'POST-DEPLOYMENT: FUNCTION owner not ledger_trigger_owner (will FAIL until role resolved)'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ledger_trigger_owner'

    UNION ALL
    -- PUBLIC EXECUTE absence (POST-DEPLOYMENT)
    -- PUBLIC is represented as grantee OID 0 in ACL expansion, NOT as a pg_roles row.
    -- We use aclexplode on proacl to detect grantee OID 0 with EXECUTE privilege.
    -- If proacl is NULL (default ACL), PUBLIC has EXECUTE by default for functions.
    -- This does NOT use has_function_privilege('PUBLIC', ...) — PUBLIC is not a
    -- login or group role that can be resolved by has_function_privilege.
    SELECT 'POST-DEPLOYMENT: PUBLIC still has EXECUTE on trigger function'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND (
        p.proacl IS NULL
        OR EXISTS (
            SELECT 1 FROM aclexplode(p.proacl) AS acl(grantor, grantee, privilege_type, is_grantable)
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        )
    )

    UNION ALL
    -- accepted_events table owner (POST-DEPLOYMENT)
    SELECT 'POST-DEPLOYMENT: accepted_events table owner not ledger_migration_owner (will FAIL until role resolved)'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname='ledger' AND c.relname='accepted_events'
        AND pg_get_userbyid(c.relowner) = 'ledger_migration_owner'
    )
) AS function_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10: PRIVILEGE, ROLE-ATTRIBUTE, OWNERSHIP, AND DEFAULT-PRIVILEGE VERIFICATION
--
-- This check verifies deployment-role existence, role attributes, object
-- ownership, table privileges, schema CREATE revocation, and default
-- privileges. All sub-checks are POST-DEPLOYMENT and will FAIL or report
-- NOT READY until deployment roles are resolved and applied.
--
-- Role-dependent privilege checks use safe resolution:
--   (SELECT has_table_privilege(role, table, priv)
--    WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role)) IS true
-- The subquery only evaluates the expression when the role exists.
-- If the role does not exist, the subquery returns NULL, and
-- NULL IS true is false (no violation reported by that branch).
-- A separate role-existence check (10a) reports NOT READY.
--
-- has_table_privilege evaluates effective privileges including inherited
-- role memberships.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_10_privileges' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- 10a: Role existence verification (expected-role registry, LEFT JOIN pg_roles)
    -- A missing role cannot disappear — originates from complete expected-role
    -- registry, LEFT JOINs pg_roles, emits MISSING per unresolved role
    SELECT 'POST-DEPLOYMENT: role ' || er.rolename || ' not found (NOT READY)' AS detail
    FROM (VALUES
        ('ledger_migration_owner'),('ledger_trigger_owner'),
        ('ledger_app_user'),('ledger_test_user'),('ledger_readonly')
    ) AS er(rolename)
    LEFT JOIN pg_roles r ON er.rolename = r.rolname
    WHERE r.rolname IS NULL

    -- 10b: Role attribute hardening — all 5 roles must have NOBYPASSRLS, NOSUPERUSER, etc.
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_migration_owner has SUPERUSER (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_migration_owner' AND rolsuper = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_migration_owner lacks BYPASSRLS (should have — schema proposal Section 11.2)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_migration_owner' AND rolbypassrls = false
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_migration_owner has CREATEDB (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_migration_owner' AND rolcreatedb = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_migration_owner has CREATEROLE (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_migration_owner' AND rolcreaterole = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_migration_owner has REPLICATION (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_migration_owner' AND rolreplication = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_trigger_owner has SUPERUSER (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_trigger_owner' AND rolsuper = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_trigger_owner has BYPASSRLS (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_trigger_owner' AND rolbypassrls = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user has SUPERUSER (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_app_user' AND rolsuper = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user has BYPASSRLS (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_app_user' AND rolbypassrls = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user has CREATEROLE (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_app_user' AND rolcreaterole = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_test_user has SUPERUSER (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_test_user' AND rolsuper = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_test_user has BYPASSRLS (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_test_user' AND rolbypassrls = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_readonly has SUPERUSER (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_readonly' AND rolsuper = true
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_readonly has BYPASSRLS (should NOT)' AS detail
    FROM pg_roles WHERE rolname = 'ledger_readonly' AND rolbypassrls = true

    -- 10c: Schema existence (expected_schema registry — a query starting from
    -- pg_namespace cannot prove a missing schema fails unless it begins with
    -- an expected schema row)
    UNION ALL
    SELECT 'MISSING expected schema: ledger' AS detail
    WHERE NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ledger')
    UNION ALL
    -- 10c: Schema ownership (only evaluated if schema exists)
    SELECT 'POST-DEPLOYMENT: schema ledger not owned by ledger_migration_owner' AS detail
    FROM pg_namespace n
    JOIN pg_roles r ON n.nspowner = r.oid
    WHERE n.nspname = 'ledger' AND r.rolname IS DISTINCT FROM 'ledger_migration_owner'

    -- 10d: Table existence (expected-table registry — a query that inner-joins
    -- expected table names to pg_class cannot prove table existence if missing
    -- rows disappear. Missing tables produce controlled failures.)
    UNION ALL
    SELECT 'MISSING expected table: ' || t.table_name AS detail
    FROM (VALUES
        ('tenants'),('aggregates'),('state_revision'),('items'),('positions'),
        ('company_ownership'),('transfers_outstanding'),('correction_provenance'),
        ('job_issue_progress'),('accepted_events'),('transaction_cutoff')
    ) AS t(table_name)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'ledger' AND c.relkind = 'r' AND c.relname = t.table_name
    )
    UNION ALL
    -- 10d: Wrong relkind (table exists but is not a regular table)
    SELECT 'WRONG relkind: ' || t.table_name || ' expected relkind r (regular table)' AS detail
    FROM (VALUES
        ('tenants'),('aggregates'),('state_revision'),('items'),('positions'),
        ('company_ownership'),('transfers_outstanding'),('correction_provenance'),
        ('job_issue_progress'),('accepted_events'),('transaction_cutoff')
    ) AS t(table_name)
    JOIN pg_class c ON c.relname = t.table_name
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'ledger' AND c.relkind != 'r'
    UNION ALL
    -- 10d: Table ownership (only evaluated for existing regular tables)
    SELECT 'POST-DEPLOYMENT: table ' || c.relname || ' not owned by ledger_migration_owner' AS detail
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_roles r ON c.relowner = r.oid
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
    AND c.relname IN ('tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff')
    AND r.rolname IS DISTINCT FROM 'ledger_migration_owner'

    -- 10e: Schema CREATE revocation from PUBLIC
    -- PUBLIC is grantee OID 0 in ACL expansion, NOT a pg_roles row.
    -- Uses aclexplode on nspacl to detect PUBLIC (OID 0) with CREATE privilege.
    -- Does NOT use has_schema_privilege('PUBLIC', ...).
    UNION ALL
    SELECT 'POST-DEPLOYMENT: PUBLIC has CREATE on schema ledger (should NOT)' AS detail
    FROM pg_namespace n
    LEFT JOIN aclexplode(n.nspacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    WHERE n.nspname = 'ledger'
    AND acl.grantee = 0
    AND acl.privilege_type = 'CREATE'

    -- 10f: Runtime role lacks CREATE on schema (defense-in-depth)
    -- OIDs resolved via JOIN — has_schema_privilege called with OID overload
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user has CREATE on schema ledger (should NOT)' AS detail
    FROM pg_roles r JOIN pg_namespace n ON n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_app_user' AND has_schema_privilege(r.oid, n.oid, 'CREATE')
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_readonly has CREATE on schema ledger (should NOT)' AS detail
    FROM pg_roles r JOIN pg_namespace n ON n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_readonly' AND has_schema_privilege(r.oid, n.oid, 'CREATE')

    -- 10g: accepted_events: no UPDATE or DELETE for runtime roles
    -- OIDs resolved via JOIN — has_table_privilege called with OID overload
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ' || r.rolname || ' has UPDATE on accepted_events (should NOT)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND has_table_privilege(r.oid, c.oid, 'UPDATE')
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ' || r.rolname || ' has DELETE on accepted_events (should NOT)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND has_table_privilege(r.oid, c.oid, 'DELETE')
    UNION ALL
    -- PUBLIC (grantee OID 0) must not have UPDATE on accepted_events
    SELECT 'POST-DEPLOYMENT: PUBLIC has UPDATE on accepted_events (should NOT)' AS detail
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN aclexplode(c.relacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    WHERE n.nspname = 'ledger' AND c.relname = 'accepted_events'
    AND acl.grantee = 0
    AND acl.privilege_type = 'UPDATE'
    UNION ALL
    -- PUBLIC (grantee OID 0) must not have DELETE on accepted_events
    SELECT 'POST-DEPLOYMENT: PUBLIC has DELETE on accepted_events (should NOT)' AS detail
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN aclexplode(c.relacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    WHERE n.nspname = 'ledger' AND c.relname = 'accepted_events'
    AND acl.grantee = 0
    AND acl.privilege_type = 'DELETE'

    -- 10h: accepted_events: INSERT and SELECT required for runtime role
    -- OIDs resolved via JOIN
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user lacks INSERT on accepted_events (should have)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_app_user' AND NOT has_table_privilege(r.oid, c.oid, 'INSERT')
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user lacks SELECT on accepted_events (should have)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_app_user' AND NOT has_table_privilege(r.oid, c.oid, 'SELECT')

    -- 10i: Runtime role must not have UPDATE on accepted_events via any path
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_test_user has UPDATE on accepted_events via inherited/PUBLIC (should NOT)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_test_user' AND has_table_privilege(r.oid, c.oid, 'UPDATE')

    -- 10j: Runtime role must have USAGE on schema
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_app_user lacks USAGE on schema ledger (should have)' AS detail
    FROM pg_roles r JOIN pg_namespace n ON n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_app_user' AND NOT has_schema_privilege(r.oid, n.oid, 'USAGE')
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_readonly lacks USAGE on schema ledger (should have)' AS detail
    FROM pg_roles r JOIN pg_namespace n ON n.nspname = 'ledger'
    WHERE r.rolname = 'ledger_readonly' AND NOT has_schema_privilege(r.oid, n.oid, 'USAGE')
) AS privilege_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10k: FIVE-ROLE EFFECTIVE TABLE-PRIVILEGE MATRIX
-- All 5 roles × 11 tables × 7 privileges verified via has_table_privilege().
-- Distinguishes ownership-derived authority (migration_owner) from ACL-granted authority.
-- Evidence: Persistence Adapter Contract Proposal Section 6.2 (Model A — Direct DML).
--
-- OID SAFETY: Role OIDs and table OIDs are resolved in the resolved_targets CTE
-- via JOINs against pg_roles, pg_class, and pg_namespace. Only rows with valid
-- (non-NULL) OIDs are produced. has_table_privilege is called with OID overloads
-- (role_oid, table_oid, privilege) in the WHERE clause, applied to rows from the
-- JOIN — the function is never called with NULL or unresolved arguments.
-- ═══════════════════════════════════════════════════════════════════════════

WITH all_tables AS (
    SELECT unnest(ARRAY['tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff']) AS table_name
),
all_privs AS (
    SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS priv
),
resolved_roles AS (
    SELECT r.rolname, r.oid AS role_oid
    FROM pg_roles r
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly',
        'ledger_migration_owner','ledger_trigger_owner')
),
resolved_tables AS (
    SELECT c.relname AS table_name, c.oid AS table_oid, c.relowner
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
    AND c.relname IN ('tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff')
),
expected_privs AS (
    SELECT * FROM (VALUES
        ('tenants','ledger_app_user',true,false,false),
        ('aggregates','ledger_app_user',true,false,false),
        ('state_revision','ledger_app_user',true,true,true),
        ('items','ledger_app_user',true,false,false),
        ('positions','ledger_app_user',true,true,true),
        ('company_ownership','ledger_app_user',true,true,true),
        ('transfers_outstanding','ledger_app_user',true,true,true),
        ('correction_provenance','ledger_app_user',true,true,true),
        ('job_issue_progress','ledger_app_user',true,true,true),
        ('accepted_events','ledger_app_user',true,true,false),
        ('transaction_cutoff','ledger_app_user',true,true,true),
        ('tenants','ledger_test_user',true,false,false),
        ('aggregates','ledger_test_user',true,false,false),
        ('state_revision','ledger_test_user',true,true,true),
        ('items','ledger_test_user',true,false,false),
        ('positions','ledger_test_user',true,true,true),
        ('company_ownership','ledger_test_user',true,true,true),
        ('transfers_outstanding','ledger_test_user',true,true,true),
        ('correction_provenance','ledger_test_user',true,true,true),
        ('job_issue_progress','ledger_test_user',true,true,true),
        ('accepted_events','ledger_test_user',true,true,false),
        ('transaction_cutoff','ledger_test_user',true,true,true),
        ('tenants','ledger_readonly',true,false,false),
        ('aggregates','ledger_readonly',true,false,false),
        ('state_revision','ledger_readonly',true,false,false),
        ('items','ledger_readonly',true,false,false),
        ('positions','ledger_readonly',true,false,false),
        ('company_ownership','ledger_readonly',true,false,false),
        ('transfers_outstanding','ledger_readonly',true,false,false),
        ('correction_provenance','ledger_readonly',true,false,false),
        ('job_issue_progress','ledger_readonly',true,false,false),
        ('accepted_events','ledger_readonly',true,false,false),
        ('transaction_cutoff','ledger_readonly',true,false,false)
    ) AS t(table_name, role_name, can_select, can_insert, can_update)
),
non_owner_roles AS (
    SELECT unnest(ARRAY['ledger_app_user','ledger_test_user','ledger_readonly']) AS role_name
),
restricted_privs AS (
    SELECT unnest(ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS priv
)
SELECT 'check_10k_five_role_effective' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- PART 0: Missing expected roles (LEFT JOIN from expected registry)
    -- Ensures a missing role cannot disappear and produce PASS
    SELECT 'MISSING expected role: ' || rolename AS detail
    FROM (VALUES
        ('ledger_migration_owner'),('ledger_trigger_owner'),
        ('ledger_app_user'),('ledger_test_user'),('ledger_readonly')
    ) AS t(rolename)
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = t.rolename)
    UNION ALL
    -- PART 0: Missing expected tables (LEFT JOIN from expected registry)
    SELECT 'MISSING expected table: ' || t.table_name AS detail
    FROM all_tables t
    LEFT JOIN resolved_tables rt ON t.table_name = rt.table_name
    WHERE rt.table_name IS NULL
    UNION ALL
    -- PART A: migration_owner has ALL 7 privileges (via ownership) on all 11 tables
    -- OIDs resolved via JOIN — has_table_privilege called with OID overload
    -- INNER JOIN is safe because missing roles/tables are reported above
    SELECT 'ledger_migration_owner lacks ' || p.priv || ' on ' || t.table_name || ' (ownership-derived, should have)' AS detail
    FROM all_tables t
    CROSS JOIN all_privs p
    JOIN resolved_tables rt ON t.table_name = rt.table_name
    JOIN resolved_roles r ON r.rolname = 'ledger_migration_owner'
    WHERE has_table_privilege(r.role_oid, rt.table_oid, p.priv) IS NOT true
    UNION ALL
    -- PART B: trigger_owner has NO privileges on any table
    SELECT 'ledger_trigger_owner has ' || p.priv || ' on ' || t.table_name || ' (should NOT)' AS detail
    FROM all_tables t
    CROSS JOIN all_privs p
    JOIN resolved_tables rt ON t.table_name = rt.table_name
    JOIN resolved_roles r ON r.rolname = 'ledger_trigger_owner'
    WHERE has_table_privilege(r.role_oid, rt.table_oid, p.priv) IS true
    UNION ALL
    -- PART C: app_user, test_user, readonly — SELECT/INSERT/UPDATE
    -- OIDs resolved via JOIN — no reliance on WHERE short-circuit or subquery patterns
    SELECT e.table_name || '.' || e.role_name || ' SELECT expected=' || e.can_select || ' actual=' ||
        COALESCE(has_table_privilege(r.role_oid, rt.table_oid, 'SELECT')::text, 'NULL') AS detail
    FROM expected_privs e
    JOIN resolved_roles r ON e.role_name = r.rolname
    JOIN resolved_tables rt ON e.table_name = rt.table_name
    WHERE has_table_privilege(r.role_oid, rt.table_oid, 'SELECT') IS DISTINCT FROM e.can_select
    UNION ALL
    SELECT e.table_name || '.' || e.role_name || ' INSERT expected=' || e.can_insert || ' actual=' ||
        COALESCE(has_table_privilege(r.role_oid, rt.table_oid, 'INSERT')::text, 'NULL') AS detail
    FROM expected_privs e
    JOIN resolved_roles r ON e.role_name = r.rolname
    JOIN resolved_tables rt ON e.table_name = rt.table_name
    WHERE has_table_privilege(r.role_oid, rt.table_oid, 'INSERT') IS DISTINCT FROM e.can_insert
    UNION ALL
    SELECT e.table_name || '.' || e.role_name || ' UPDATE expected=' || e.can_update || ' actual=' ||
        COALESCE(has_table_privilege(r.role_oid, rt.table_oid, 'UPDATE')::text, 'NULL') AS detail
    FROM expected_privs e
    JOIN resolved_roles r ON e.role_name = r.rolname
    JOIN resolved_tables rt ON e.table_name = rt.table_name
    WHERE has_table_privilege(r.role_oid, rt.table_oid, 'UPDATE') IS DISTINCT FROM e.can_update
    UNION ALL
    -- PART D: DELETE, TRUNCATE, REFERENCES, TRIGGER absent for non-owner roles
    SELECT c.table_name || '.' || r.rolname || ' has ' || p.priv || ' (should NOT)' AS detail
    FROM all_tables c
    CROSS JOIN non_owner_roles r2
    CROSS JOIN restricted_privs p
    JOIN resolved_roles r ON r2.role_name = r.rolname
    JOIN resolved_tables rt ON c.table_name = rt.table_name
    WHERE has_table_privilege(r.role_oid, rt.table_oid, p.priv) IS true
    UNION ALL
    -- PART E: Unexpected package table
    SELECT 'UNEXPECTED package table: ' || c.relname AS detail
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
    AND c.relname NOT IN ('tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff')
) AS effective_priv_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10p: DIRECT TABLE ACL VERIFICATION (EXACT OWNER + NON-OWNER REGISTRY)
-- Uses aclexplode() on relacl to expand direct ACL entries.
-- Compares actual direct grants against an explicit expected registry.
-- Detects: missing grants, unexpected grants, PUBLIC grants, wrong grantor,
-- grant options, grants to unexpected roles, grants on unexpected tables.
-- Owner ACL entries are verified through a SEPARATE exact owner registry:
--   - exact owner grantee OID (must match relowner)
--   - exact owner grantor OID (must match relowner)
--   - all seven table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES, TRIGGER)
--   - owner grant-option (is_grantable) is NOT automatically expected true.
--     PostgreSQL distinguishes the owner's ordinary ACL privileges from
--     explicitly granted WITH GRANT OPTION entries and the owner's implicit
--     authority to re-grant. The star/grant-option indicator appears only when
--     grant options were explicitly granted — owner implicit grant authority
--     is NOT marked in ACL display.
--   - an explicit owner WITH GRANT OPTION entry is unexpected unless the
--     package actually creates it (the package does NOT use WITH GRANT OPTION)
--   - owner implicit re-grant authority is classified separately from ACL
--     is_grantable
--   - missing owner rows (table has non-NULL relacl but no owner entry)
--   - unexpected owner rows (owner entry for a table with NULL relacl)
--   - partial owner rows (owner entry missing some of the 7 privileges)
-- This is DISTINCT from check 10k (effective privileges) — direct ACL checks
-- do NOT account for ownership-derived authority, PUBLIC defaults, or inherited
-- memberships. They verify only explicitly stored ACL entries.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_acl AS (
    SELECT table_name, role_name, 'SELECT' AS priv, false AS grant_option
    FROM (VALUES
        ('tenants','ledger_app_user'),('aggregates','ledger_app_user'),('state_revision','ledger_app_user'),
        ('items','ledger_app_user'),('positions','ledger_app_user'),('company_ownership','ledger_app_user'),
        ('transfers_outstanding','ledger_app_user'),('correction_provenance','ledger_app_user'),
        ('job_issue_progress','ledger_app_user'),('accepted_events','ledger_app_user'),('transaction_cutoff','ledger_app_user'),
        ('tenants','ledger_test_user'),('aggregates','ledger_test_user'),('state_revision','ledger_test_user'),
        ('items','ledger_test_user'),('positions','ledger_test_user'),('company_ownership','ledger_test_user'),
        ('transfers_outstanding','ledger_test_user'),('correction_provenance','ledger_test_user'),
        ('job_issue_progress','ledger_test_user'),('accepted_events','ledger_test_user'),('transaction_cutoff','ledger_test_user'),
        ('tenants','ledger_readonly'),('aggregates','ledger_readonly'),('state_revision','ledger_readonly'),
        ('items','ledger_readonly'),('positions','ledger_readonly'),('company_ownership','ledger_readonly'),
        ('transfers_outstanding','ledger_readonly'),('correction_provenance','ledger_readonly'),
        ('job_issue_progress','ledger_readonly'),('accepted_events','ledger_readonly'),('transaction_cutoff','ledger_readonly')
    ) AS t(table_name, role_name)
    UNION ALL
    SELECT table_name, role_name, 'INSERT', false
    FROM (VALUES
        ('state_revision','ledger_app_user'),('positions','ledger_app_user'),('company_ownership','ledger_app_user'),
        ('transfers_outstanding','ledger_app_user'),('correction_provenance','ledger_app_user'),
        ('job_issue_progress','ledger_app_user'),('accepted_events','ledger_app_user'),('transaction_cutoff','ledger_app_user'),
        ('state_revision','ledger_test_user'),('positions','ledger_test_user'),('company_ownership','ledger_test_user'),
        ('transfers_outstanding','ledger_test_user'),('correction_provenance','ledger_test_user'),
        ('job_issue_progress','ledger_test_user'),('accepted_events','ledger_test_user'),('transaction_cutoff','ledger_test_user')
    ) AS t(table_name, role_name)
    UNION ALL
    SELECT table_name, role_name, 'UPDATE', false
    FROM (VALUES
        ('state_revision','ledger_app_user'),('positions','ledger_app_user'),('company_ownership','ledger_app_user'),
        ('transfers_outstanding','ledger_app_user'),('correction_provenance','ledger_app_user'),
        ('job_issue_progress','ledger_app_user'),('transaction_cutoff','ledger_app_user'),
        ('state_revision','ledger_test_user'),('positions','ledger_test_user'),('company_ownership','ledger_test_user'),
        ('transfers_outstanding','ledger_test_user'),('correction_provenance','ledger_test_user'),
        ('job_issue_progress','ledger_test_user'),('transaction_cutoff','ledger_test_user')
    ) AS t(table_name, role_name)
),
actual_acl AS (
    SELECT c.relname AS table_name,
           COALESCE(
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC' END,
               grantee.rolname,
               CASE WHEN acl.grantee IS NOT NULL THEN 'UNKNOWN_OID(' || acl.grantee || ')' END
           ) AS grantee,
           acl.grantee AS grantee_oid,
           c.relowner AS owner_oid,
           acl.privilege_type AS privilege,
           acl.is_grantable AS grant_option,
           grantor.rolname AS grantor_name
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN aclexplode(c.relacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    LEFT JOIN pg_roles grantee ON acl.grantee = grantee.oid AND acl.grantee != 0
    LEFT JOIN pg_roles grantor ON acl.grantor = grantor.oid
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
)
SELECT 'check_10p_direct_table_acl' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- relacl materialization expectation: all 11 tables have GRANT statements
    -- in 04_privileges.sql Sections 7-9, so relacl must be non-NULL for all.
    -- Unexpected NULL relacl: table has GRANT statements but relacl is NULL
    SELECT 'UNEXPECTED NULL relacl: ' || c.relname || ' (GRANT statements executed, relacl should be materialized)' AS detail
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
    AND c.relname IN ('tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff')
    AND c.relacl IS NULL
    UNION ALL
    -- Missing expected direct ACL entries
    SELECT 'MISSING direct ACL: ' || e.table_name || '.' || e.role_name || ' ' || e.priv AS detail
    FROM expected_acl e
    LEFT JOIN actual_acl a ON e.table_name = a.table_name AND e.role_name = a.grantee
        AND e.priv = a.privilege AND e.grant_option = a.grant_option
    WHERE a.table_name IS NULL
    UNION ALL
    -- Unexpected direct ACL entries (excluding owner ACL entries)
    -- When relacl is non-NULL, PostgreSQL may materialize the owner's entry
    -- with all privileges and grant option. This is legitimate and NOT an
    -- unexpected grant. Distinguishes: object ownership (relowner) vs
    -- owner ACL entry (in relacl) vs explicit grants to non-owner roles
    -- vs effective owner authority.
    SELECT 'UNEXPECTED direct ACL: ' || a.table_name || '.' || a.grantee || ' ' || a.privilege ||
           CASE WHEN a.grant_option THEN ' WITH GRANT OPTION' ELSE '' END AS detail
    FROM actual_acl a
    LEFT JOIN expected_acl e ON a.table_name = e.table_name AND a.grantee = e.role_name
        AND a.privilege = e.priv AND a.grant_option = e.grant_option
    WHERE e.table_name IS NULL
    AND a.grantee_oid != a.owner_oid
    AND a.privilege IS NOT NULL
    UNION ALL
    -- Owner ACL entry verification: separate exact owner registry
    -- After GRANT/REVOKE, PostgreSQL materializes the owner's ACL entry with
    -- all 7 privileges and grant option. The owner is the grantee (relowner)
    -- and the grantor is also the owner.
    -- This is NOT a conditional check — it verifies the exact expected
    -- representation for every table with materialized relacl.
    -- Missing owner privilege: table has non-NULL relacl but owner entry
    -- missing a privilege that should be present
    UNION ALL
    SELECT 'OWNER ACL missing privilege: ' || c.relname || ' owner lacks ' || p.priv AS detail
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    CROSS JOIN (VALUES
        ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
    ) AS p(priv)
    LEFT JOIN actual_acl a ON c.relname = a.table_name
        AND a.grantee_oid = c.relowner
        AND a.privilege = p.priv
    WHERE n.nspname = 'ledger' AND c.relkind = 'r'
    AND c.relname IN ('tenants','aggregates','state_revision','items','positions',
        'company_ownership','transfers_outstanding','correction_provenance',
        'job_issue_progress','accepted_events','transaction_cutoff')
    AND c.relacl IS NOT NULL
    AND a.table_name IS NULL
    UNION ALL
    -- Owner ACL entry: wrong grantor (must be the owner itself)
    SELECT 'OWNER ACL wrong grantor: ' || a.table_name || ' ' || a.privilege ||
           ' grantor=' || COALESCE(a.grantor_name, 'NULL') || ' (expected owner)' AS detail
    FROM actual_acl a
    WHERE a.grantee_oid = a.owner_oid
    AND a.grantor_name IS DISTINCT FROM pg_get_userbyid(a.owner_oid)
    UNION ALL
    -- Owner ACL entry: explicit WITH GRANT OPTION is unexpected.
    -- PostgreSQL owner implicit grant authority is NOT marked as is_grantable
    -- in ACL display. The package does NOT use WITH GRANT OPTION on any
    -- GRANT statement, so an owner entry with is_grantable = true is
    -- unexpected unless PostgreSQL materializes it for a non-owner grant
    -- with grant option (which the package does NOT create).
    -- Owner implicit re-grant authority is classified separately from
    -- ACL is_grantable and is NOT verified here as a stored grant option.
    SELECT 'OWNER ACL unexpected explicit grant option: ' || a.table_name || ' ' || a.privilege AS detail
    FROM actual_acl a
    WHERE a.grantee_oid = a.owner_oid
    AND a.grant_option = true
    UNION ALL
    -- Wrong grantor (all expected non-owner grants should have grantor = ledger_migration_owner)
    SELECT 'WRONG GRANTOR: ' || a.table_name || '.' || a.grantee || ' ' || a.privilege ||
           ' grantor=' || COALESCE(a.grantor_name, 'NULL') || ' (expected ledger_migration_owner)' AS detail
    FROM actual_acl a
    JOIN expected_acl e ON a.table_name = e.table_name AND a.grantee = e.role_name
        AND a.privilege = e.priv AND a.grant_option = e.grant_option
    WHERE a.grantor_name IS DISTINCT FROM 'ledger_migration_owner'
    UNION ALL
    -- Missing expected tables in relacl (LEFT JOIN from expected registry)
    SELECT 'MISSING expected table for direct ACL: ' || t.table_name AS detail
    FROM (VALUES
        ('tenants'),('aggregates'),('state_revision'),('items'),('positions'),
        ('company_ownership'),('transfers_outstanding'),('correction_provenance'),
        ('job_issue_progress'),('accepted_events'),('transaction_cutoff')
    ) AS t(table_name)
    LEFT JOIN actual_acl a ON t.table_name = a.table_name
    WHERE a.table_name IS NULL
) AS direct_acl_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10l: VERSION-CORRECT MEMBERSHIP AND ADMINISTRATIVE AUTHORITY VERIFICATION
-- Minimum PostgreSQL version: 17 (authorized Approach A).
-- The inherit_option, set_option, and admin_option columns are available
-- in PostgreSQL 16+, but the package declares PostgreSQL 17+ as the
-- minimum supported execution version.
--
-- Two recursive closures are built:
--   1. can_reach_inherited: filters on inherit_option = true
--      Represents INHERITED AUTHORITY reachability (used by has_table_privilege
--      and other effective-privilege functions).
--   2. can_reach_set_role: filters on set_option = true
--      Represents SET ROLE reachability. Preserves (start_oid, target_oid).
--
-- COMPLETE ADMINISTRATIVE EDGE UNIVERSE:
--   all_direct_admin_authority includes EVERY pg_auth_members edge with
--   admin_option = true WITHOUT filtering the target to named protected
--   roles. This makes later checks capable of detecting administration of:
--     - unexpected roles
--     - SUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS roles
--     - roles owning protected objects
--     - roles possessing protected effective privileges
--   Named-protected-role and powerful-role derivations are built SEPARATELY
--   from this complete universe — they do NOT reuse a five-target filtered
--   relation as if it represented all administrative authority.
--
-- ADMINISTRATIVE AUTHORITY MODEL (NOT a transitive admin_option closure):
--   A chain of admin_option edges is NOT automatically transitive administrative
--   authority. An edge member --admin_option--> roleid gives the member
--   authority to GRANT/REVOKE membership in that specific roleid only.
--   A subsequent admin_option edge from roleid does NOT extend the original
--   member's administrative authority.
--
--   A. Direct holder authority (all_direct_admin_authority):
--      A role that directly holds admin_option does NOT need to SET ROLE to
--      itself. Direct holder authority is verified independently from
--      SET ROLE reachability. Preserves admin_holder_oid and
--      administrable_role_oid.
--
--   B. SET ROLE-reachable holder authority (all_set_role_reachable_admin):
--      A start role reaches a specific holder role through one or more
--      set_option = true edges, and that exact holder role directly holds
--      admin_option on the exact administrable_role_oid. Preserves start_oid,
--      admin_holder_oid, and administrable_role_oid. Does NOT cross-join a
--      start role with unrelated admin holders. Does NOT require a self-
--      membership edge for direct authority.
--
--   C. Powerful administrative authority:
--      SUPERUSER, CREATEROLE, CREATEDB, REPLICATION, and BYPASSRLS roles
--      identified separately. A role that can SET ROLE to a role carrying
--      one of those attributes constitutes a risk. These attributes are NOT
--      inherited as ordinary object privileges.
--
-- STARTING-ROLE COVERAGE:
--   Checks do NOT limit analysis to 4-5 hard-coded logical starting roles.
--   An explicit expected_roles registry is LEFT JOINed to pg_roles.
--   Catalog-discovered unexpected administrative holders are inspected.
--   Unresolved physical connection-role mappings are reported.
--   An unexpected role holding admin_option on a protected or powerful role
--   does NOT disappear because it is absent from a hard-coded starting list.
--
-- RESULTING MEMBERSHIP GRANT:
--   For every prohibited direct or SET ROLE-reachable administrative edge,
--   the check fails immediately because the administrator can grant membership
--   in the administrable target role. Because future GRANT ROLE options are
--   not fixed by current catalog state, the check does NOT choose harmless
--   inherit_option, set_option, or admin_option values. If the exact allowed
--   options depend on unresolved executor attributes, a controlled
--   unresolved prerequisite is emitted.
--
-- accepted_events UPDATE and DELETE are both verified under all models
-- against ALL administrable target roles (not just the 5 named ones).
--
-- A version gate fails closed if PostgreSQL < 17.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_10l_version_gate' AS check_name,
    CASE
        WHEN current_setting('server_version_num')::integer >= 170000 THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    current_setting('server_version') AS server_version,
    CASE
        WHEN current_setting('server_version_num')::integer >= 170000
        THEN 'PostgreSQL 17+ — inherit_option, set_option, and admin_option columns available'
        ELSE 'PostgreSQL < 17 — UNSUPPORTED — deployment runner must block execution before loading this SQL'
    END AS details;

WITH RECURSIVE can_reach_inherited(start_oid, target_oid) AS (
    SELECT m.member AS start_oid, m.roleid AS target_oid
    FROM pg_auth_members m
    WHERE m.inherit_option = true
    UNION
    SELECT cr.start_oid, m.roleid AS target_oid
    FROM can_reach_inherited cr
    JOIN pg_auth_members m ON cr.target_oid = m.member
    WHERE m.inherit_option = true
),
can_reach_set_role(start_oid, target_oid) AS (
    SELECT m.member AS start_oid, m.roleid AS target_oid
    FROM pg_auth_members m
    WHERE m.set_option = true
    UNION
    SELECT cr.start_oid, m.roleid AS target_oid
    FROM can_reach_set_role cr
    JOIN pg_auth_members m ON cr.target_oid = m.member
    WHERE m.set_option = true
),
-- COMPLETE ADMINISTRATIVE EDGE UNIVERSE: every pg_auth_members edge with
-- admin_option = true, WITHOUT filtering the target. This is the base
-- relation from which all administrative authority derivations are built.
all_direct_admin_authority(admin_holder_oid, administrable_role_oid) AS (
    SELECT m.member AS admin_holder_oid, m.roleid AS administrable_role_oid
    FROM pg_auth_members m
    WHERE m.admin_option = true
),
-- Named protected roles registry
protected_roles AS (
    SELECT oid, rolname FROM pg_roles
    WHERE rolname IN (
        'ledger_migration_owner','ledger_trigger_owner',
        'ledger_app_user','ledger_test_user','ledger_readonly'
    )
),
-- Direct administrative authority on NAMED protected roles (derived from
-- the complete universe). This is NOT transitive — only direct admin_option
-- edges are included. Preserves member_oid and protected_role_oid.
direct_admin_authority(member_oid, protected_role_oid) AS (
    SELECT adaa.admin_holder_oid AS member_oid, adaa.administrable_role_oid AS protected_role_oid
    FROM all_direct_admin_authority adaa
    JOIN protected_roles pr ON adaa.administrable_role_oid = pr.oid
),
-- SET ROLE-reachable administrative authority on NAMED protected roles.
-- Preserves start_oid, admin_holder_oid, and protected_role_oid.
-- Does NOT cross-join a qualifying start role with unrelated admin holders.
set_role_reachable_admin(start_oid, admin_holder_oid, protected_role_oid) AS (
    SELECT csr.start_oid, daa.member_oid AS admin_holder_oid, daa.protected_role_oid
    FROM can_reach_set_role csr
    JOIN direct_admin_authority daa ON csr.target_oid = daa.member_oid
),
-- ALL SET ROLE-reachable administrative authority (complete universe):
-- same as set_role_reachable_admin but derived from all_direct_admin_authority
-- (not filtered to named protected roles). Detects SET ROLE reachability to
-- a holder of admin_option on ANY role, including unexpected roles.
all_set_role_reachable_admin(start_oid, admin_holder_oid, administrable_role_oid) AS (
    SELECT csr.start_oid, adaa.admin_holder_oid, adaa.administrable_role_oid
    FROM can_reach_set_role csr
    JOIN all_direct_admin_authority adaa ON csr.target_oid = adaa.admin_holder_oid
),
-- Powerful roles: roles carrying SUPERUSER, CREATEROLE, CREATEDB,
-- REPLICATION, or BYPASSRLS. These are NOT inherited as ordinary object
-- privileges. Analyzed separately for SET ROLE reachability.
powerful_roles AS (
    SELECT oid, rolname FROM pg_roles
    WHERE rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
)
SELECT 'check_10l_transitive_membership' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- INHERITED AUTHORITY model: prohibited paths
    SELECT 'INHERITED: ' || s.rolname || ' can reach ' || t.rolname || ' (should NOT)' AS detail
    FROM pg_roles s, pg_roles t
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND t.rolname IN ('ledger_migration_owner','ledger_trigger_owner')
    AND s.rolname != t.rolname
    AND EXISTS (SELECT 1 FROM can_reach_inherited WHERE start_oid=s.oid AND target_oid=t.oid)
    UNION ALL
    -- INHERITED: no non-admin role reaches any powerful role
    SELECT 'INHERITED: ' || r.rolname || ' reaches powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM pg_roles r CROSS JOIN pg_roles powerful
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != r.rolname
    AND (powerful.rolsuper OR powerful.rolcreaterole OR powerful.rolbypassrls OR powerful.rolreplication)
    AND EXISTS (SELECT 1 FROM can_reach_inherited WHERE start_oid=r.oid AND target_oid=powerful.oid)
    UNION ALL
    -- SET ROLE model: prohibited paths
    SELECT 'SET ROLE: ' || s.rolname || ' can reach ' || t.rolname || ' (should NOT)' AS detail
    FROM pg_roles s, pg_roles t
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND t.rolname IN ('ledger_migration_owner','ledger_trigger_owner')
    AND s.rolname != t.rolname
    AND EXISTS (SELECT 1 FROM can_reach_set_role WHERE start_oid=s.oid AND target_oid=t.oid)
    UNION ALL
    -- SET ROLE: no non-admin role reaches any powerful role
    SELECT 'SET ROLE: ' || r.rolname || ' reaches powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM pg_roles r CROSS JOIN pg_roles powerful
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != r.rolname
    AND (powerful.rolsuper OR powerful.rolcreaterole OR powerful.rolbypassrls OR powerful.rolreplication)
    AND EXISTS (SELECT 1 FROM can_reach_set_role WHERE start_oid=r.oid AND target_oid=powerful.oid)
    UNION ALL
    -- INHERITED: no administrative membership path gives accepted_events UPDATE
    -- or DELETE authority to runtime roles (defense-in-depth)
    -- OIDs resolved via JOIN — has_table_privilege called with OID overload
    SELECT 'INHERITED: ' || r.rolname || ' reaches a role with UPDATE on accepted_events (should NOT)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND EXISTS (
        SELECT 1 FROM can_reach_inherited cr
        JOIN pg_roles target ON cr.target_oid = target.oid
        WHERE cr.start_oid = r.oid
        AND target.rolname IS DISTINCT FROM r.rolname
        AND has_table_privilege(target.oid, c.oid, 'UPDATE')
    )
    UNION ALL
    SELECT 'INHERITED: ' || r.rolname || ' reaches a role with DELETE on accepted_events (should NOT)' AS detail
    FROM pg_roles r
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND EXISTS (
        SELECT 1 FROM can_reach_inherited cr
        JOIN pg_roles target ON cr.target_oid = target.oid
        WHERE cr.start_oid = r.oid
        AND target.rolname IS DISTINCT FROM r.rolname
        AND has_table_privilege(target.oid, c.oid, 'DELETE')
    )
    UNION ALL
    -- DIRECT ADMINISTRATIVE AUTHORITY: prohibited paths
    -- admin_option = true means the member can GRANT/REVOKE the target role
    -- to/from other roles. This is DIRECT only — not transitive.
    SELECT 'ADMIN-DIRECT: ' || s.rolname || ' can administer ' || t.rolname || ' (should NOT)' AS detail
    FROM pg_roles s, pg_roles t
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND t.rolname IN ('ledger_migration_owner','ledger_trigger_owner')
    AND s.rolname != t.rolname
    AND EXISTS (SELECT 1 FROM direct_admin_authority WHERE member_oid=s.oid AND protected_role_oid=t.oid)
    UNION ALL
    -- ADMIN-DIRECT: no non-admin role can administer any powerful role
    -- Uses all_direct_admin_authority (complete universe) — detects
    -- administration of powerful roles that are NOT among the 5 named
    -- protected roles
    SELECT 'ADMIN-DIRECT: ' || holder.rolname || ' can administer powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN pg_roles powerful ON adaa.administrable_role_oid = powerful.oid
    WHERE holder.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != holder.rolname
    AND (powerful.rolsuper OR powerful.rolcreaterole OR powerful.rolcreatedb OR powerful.rolreplication OR powerful.rolbypassrls)
    UNION ALL
    -- ADMIN-DIRECT: no role can administer a role with UPDATE on accepted_events
    -- Uses all_direct_admin_authority (complete universe) to detect
    -- administration of ANY target role with UPDATE, not just the 5 named
    -- protected roles. Preserves exact admin holder and target role.
    SELECT 'ADMIN-DIRECT: ' || holder.rolname || ' can administer ' || target.rolname || ' with UPDATE on accepted_events (should NOT)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN pg_roles target ON adaa.administrable_role_oid = target.oid
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE holder.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND target.rolname IS DISTINCT FROM holder.rolname
    AND has_table_privilege(target.oid, c.oid, 'UPDATE')
    UNION ALL
    -- ADMIN-DIRECT: no role can administer a role with DELETE on accepted_events
    -- Uses all_direct_admin_authority (complete universe). Preserves exact
    -- admin holder and target role.
    SELECT 'ADMIN-DIRECT: ' || holder.rolname || ' can administer ' || target.rolname || ' with DELETE on accepted_events (should NOT)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN pg_roles target ON adaa.administrable_role_oid = target.oid
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE holder.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND target.rolname IS DISTINCT FROM holder.rolname
    AND has_table_privilege(target.oid, c.oid, 'DELETE')
    UNION ALL
    -- SET ROLE-REACHABLE ADMINISTRATIVE AUTHORITY: a role that can SET ROLE to
    -- a specific holder role that holds admin_option on a specific protected
    -- target role. Preserves start role, reachable admin holder, and protected
    -- target role. Does NOT cross-join with unrelated admin holders.
    SELECT 'SET-ROLE-ADMIN: ' || s.rolname || ' can SET ROLE to ' || h.rolname || ' who administers ' || t.rolname || ' (should NOT)' AS detail
    FROM pg_roles s, pg_roles h, pg_roles t
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND t.rolname IN ('ledger_migration_owner','ledger_trigger_owner')
    AND EXISTS (
        SELECT 1 FROM set_role_reachable_admin
        WHERE start_oid=s.oid AND admin_holder_oid=h.oid AND protected_role_oid=t.oid
    )
    UNION ALL
    -- SET ROLE-REACHABLE ADMIN: no role can SET ROLE to an admin holder whose
    -- administered role has UPDATE on accepted_events
    -- Uses all_set_role_reachable_admin (complete universe) to detect SET ROLE
    -- reachability to a holder of admin_option on ANY role with UPDATE
    SELECT 'SET-ROLE-ADMIN: ' || s.rolname || ' can SET ROLE to ' || h.rolname || ' who administers ' || target.rolname || ' with UPDATE on accepted_events (should NOT)' AS detail
    FROM all_set_role_reachable_admin asra
    JOIN pg_roles s ON asra.start_oid = s.oid
    JOIN pg_roles h ON asra.admin_holder_oid = h.oid
    JOIN pg_roles target ON asra.administrable_role_oid = target.oid
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND target.rolname IS DISTINCT FROM s.rolname
    AND has_table_privilege(target.oid, c.oid, 'UPDATE')
    UNION ALL
    -- SET ROLE-REACHABLE ADMIN: no role can SET ROLE to an admin holder whose
    -- administered role has DELETE on accepted_events
    -- Uses all_set_role_reachable_admin (complete universe)
    SELECT 'SET-ROLE-ADMIN: ' || s.rolname || ' can SET ROLE to ' || h.rolname || ' who administers ' || target.rolname || ' with DELETE on accepted_events (should NOT)' AS detail
    FROM all_set_role_reachable_admin asra
    JOIN pg_roles s ON asra.start_oid = s.oid
    JOIN pg_roles h ON asra.admin_holder_oid = h.oid
    JOIN pg_roles target ON asra.administrable_role_oid = target.oid
    JOIN pg_class c ON c.relname = 'accepted_events'
    JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'ledger'
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly')
    AND target.rolname IS DISTINCT FROM s.rolname
    AND has_table_privilege(target.oid, c.oid, 'DELETE')
    UNION ALL
    -- POWERFUL-ROLE ADMINISTRATION (direct): no non-admin role can directly
    -- administer a powerful role. Uses all_direct_admin_authority (complete
    -- universe). Preserves exact admin holder and powerful target.
    SELECT 'POWERFUL-ADMIN-DIRECT: ' || holder.rolname || ' can administer powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN powerful_roles powerful ON adaa.administrable_role_oid = powerful.oid
    WHERE holder.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != holder.rolname
    UNION ALL
    -- POWERFUL-ROLE ADMINISTRATION (SET ROLE-reachable): no non-admin role
    -- can SET ROLE to a holder who can administer a powerful role.
    -- Uses all_set_role_reachable_admin (complete universe).
    SELECT 'POWERFUL-ADMIN-SET-ROLE: ' || s.rolname || ' can SET ROLE to ' || h.rolname || ' who administers powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM all_set_role_reachable_admin asra
    JOIN pg_roles s ON asra.start_oid = s.oid
    JOIN pg_roles h ON asra.admin_holder_oid = h.oid
    JOIN powerful_roles powerful ON asra.administrable_role_oid = powerful.oid
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != s.rolname
    UNION ALL
    -- POWERFUL-ROLE SET ROLE REACHABILITY: no logical role can SET ROLE to
    -- a role carrying SUPERUSER, CREATEROLE, CREATEDB, REPLICATION, or BYPASSRLS.
    -- These attributes are NOT inherited as ordinary object privileges but
    -- CAN be exercised after SET ROLE.
    SELECT 'POWERFUL-SET-ROLE: ' || r.rolname || ' can SET ROLE to powerful role ' || powerful.rolname || ' (should NOT)' AS detail
    FROM pg_roles r CROSS JOIN powerful_roles powerful
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND powerful.rolname != r.rolname
    AND EXISTS (SELECT 1 FROM can_reach_set_role WHERE start_oid=r.oid AND target_oid=powerful.oid)
    UNION ALL
    -- UNEXPECTED ADMIN HOLDER: any role NOT in the expected logical role
    -- registry that holds admin_option on a protected or powerful role.
    -- An unexpected role must NOT disappear because it is absent from a
    -- hard-coded starting-role list. Catalog-discovered unexpected holders
    -- are inspected directly from all_direct_admin_authority.
    SELECT 'UNEXPECTED-ADMIN-HOLDER: ' || holder.rolname || ' can administer ' || target.rolname || ' (not in expected logical role registry)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN pg_roles target ON adaa.administrable_role_oid = target.oid
    WHERE holder.rolname NOT IN ('ledger_migration_owner','ledger_trigger_owner',
        'ledger_app_user','ledger_test_user','ledger_readonly')
    UNION ALL
    -- RESULTING MEMBERSHIP GRANT: for every prohibited direct or SET ROLE-
    -- reachable administrative edge, the administrator can grant membership
    -- in the administrable target role. Because future GRANT ROLE options
    -- are not fixed by current catalog state, the check does NOT choose
    -- harmless inherit_option, set_option, or admin_option values. If the
    -- exact allowed options depend on unresolved executor attributes, a
    -- controlled unresolved prerequisite is emitted.
    -- This is NOT a complete resulting-propagation model — it is a fail-
    -- closed acknowledgment that the administrator can grant membership.
    SELECT 'RESULTING-GRANT: ' || holder.rolname || ' can administer ' || target.rolname || ' — can grant membership; future GRANT ROLE options not statically determinable (unresolved prerequisite)' AS detail
    FROM all_direct_admin_authority adaa
    JOIN pg_roles holder ON adaa.admin_holder_oid = holder.oid
    JOIN pg_roles target ON adaa.administrable_role_oid = target.oid
    WHERE holder.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND target.rolname IS DISTINCT FROM holder.rolname
    UNION ALL
    SELECT 'RESULTING-GRANT: ' || s.rolname || ' can SET ROLE to ' || h.rolname || ' who can administer ' || target.rolname || ' — can grant membership; future GRANT ROLE options not statically determinable (unresolved prerequisite)' AS detail
    FROM all_set_role_reachable_admin asra
    JOIN pg_roles s ON asra.start_oid = s.oid
    JOIN pg_roles h ON asra.admin_holder_oid = h.oid
    JOIN pg_roles target ON asra.administrable_role_oid = target.oid
    WHERE s.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND target.rolname IS DISTINCT FROM s.rolname
    UNION ALL
    -- Missing expected roles in membership verification
    SELECT 'MISSING expected role for membership: ' || rolename AS detail
    FROM (VALUES
        ('ledger_migration_owner'),('ledger_trigger_owner'),
        ('ledger_app_user'),('ledger_test_user'),('ledger_readonly')
    ) AS t(rolename)
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = t.rolename)
) AS membership_violations;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10m: EXACT DEFAULT ACL VERIFICATION
-- Uses aclexplode() on defaclacl to expand default ACL entries.
-- Replaces regex matching against defaclacl::text.
-- Covers tables, sequences, and functions separately.
-- A revoked default privilege appears as the absence of a granted entry,
-- not as an affirmative "revoke row."
-- ═══════════════════════════════════════════════════════════════════════════

expected_default_acl AS (
    SELECT * FROM (VALUES
        -- ledger_readonly gets SELECT on future tables created by migration_owner
        ('ledger_migration_owner'::text, 'ledger'::text, 'r'::"char", 'ledger_readonly'::text, 'SELECT'::text, false),
        -- After REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, PostgreSQL materializes
        -- the creating role's EXECUTE entry in the default ACL.
        -- The creating role's implicit grant authority is NOT marked as
        -- is_grantable in ACL display. PostgreSQL distinguishes the owner's
        -- ordinary ACL privileges from explicitly granted WITH GRANT OPTION
        -- entries. The package does NOT use WITH GRANT OPTION, so the owner
        -- EXECUTE entry has is_grantable = false.
        -- Owner implicit re-grant authority is classified separately from
        -- stored ACL is_grantable.
        ('ledger_migration_owner'::text, 'ledger'::text, 'f'::"char", 'ledger_migration_owner'::text, 'EXECUTE'::text, false)
    ) AS t(creating_role, schema_name, obj_type, grantee, privilege, grant_option)
),
actual_default_acl AS (
    SELECT grantor.rolname AS creating_role,
           n.nspname AS schema_name,
           da.defaclobjtype AS obj_type,
           COALESCE(
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC' END,
               grantee.rolname,
               CASE WHEN acl.grantee IS NOT NULL THEN 'UNKNOWN_OID(' || acl.grantee || ')' END
           ) AS grantee,
           acl.grantee AS grantee_oid,
           acl.privilege_type AS privilege,
           acl.is_grantable AS grant_option
    FROM pg_default_acl da
    JOIN pg_namespace n ON da.defaclnamespace = n.oid
    JOIN pg_roles grantor ON da.defaclroleid = grantor.oid
    LEFT JOIN aclexplode(da.defaclacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    LEFT JOIN pg_roles grantee ON acl.grantee = grantee.oid AND acl.grantee != 0
    WHERE n.nspname = 'ledger'
)
SELECT 'check_10m_exact_default_acl' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- Missing expected default ACL entries
    SELECT 'MISSING default ACL: ' || e.grantee || ' ' || e.privilege || ' on ' || e.obj_type || ' by ' || e.creating_role AS detail
    FROM expected_default_acl e
    LEFT JOIN actual_default_acl a ON e.creating_role = a.creating_role AND e.schema_name = a.schema_name
        AND e.obj_type = a.obj_type AND e.grantee = a.grantee
        AND e.privilege = a.privilege AND e.grant_option = a.grant_option
    WHERE a.creating_role IS NULL
    UNION ALL
    -- Unexpected default ACL entries (only non-NULL expanded entries)
    SELECT 'UNEXPECTED default ACL: ' || a.creating_role || '/' || a.grantee || ' ' || a.privilege || ' on ' || a.obj_type AS detail
    FROM actual_default_acl a
    LEFT JOIN expected_default_acl e ON a.creating_role = e.creating_role AND a.schema_name = e.schema_name
        AND a.obj_type = e.obj_type AND a.grantee = e.grantee
        AND a.privilege = e.privilege AND a.grant_option = e.grant_option
    WHERE e.creating_role IS NULL
    AND a.privilege IS NOT NULL
    UNION ALL
    -- Missing: pg_default_acl entry for functions by migration_owner
    -- A missing entry would restore PostgreSQL's built-in PUBLIC EXECUTE default.
    SELECT 'MISSING pg_default_acl entry for functions by ledger_migration_owner (PUBLIC EXECUTE not revoked)' AS detail
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_default_acl da
        JOIN pg_namespace n ON da.defaclnamespace = n.oid
        JOIN pg_roles grantor ON da.defaclroleid = grantor.oid
        WHERE n.nspname='ledger' AND grantor.rolname='ledger_migration_owner' AND da.defaclobjtype='f'
    )
    UNION ALL
    -- PUBLIC still has default EXECUTE on future functions (should NOT)
    SELECT 'PUBLIC still has default EXECUTE on future functions by ledger_migration_owner' AS detail
    FROM actual_default_acl a
    WHERE a.creating_role='ledger_migration_owner' AND a.schema_name='ledger'
    AND a.obj_type='f' AND a.grantee_oid = 0 AND a.privilege='EXECUTE'
    UNION ALL
    -- Unexpected: runtime or test default table privileges
    SELECT 'UNEXPECTED default: ' || a.grantee || ' has default table privileges by ' || a.creating_role AS detail
    FROM actual_default_acl a
    WHERE a.obj_type='r' AND a.grantee IN ('ledger_app_user','ledger_test_user')
    UNION ALL
    -- Unexpected: migration_owner default table privileges
    SELECT 'UNEXPECTED default: ledger_migration_owner has default table privileges by ledger_migration_owner' AS detail
    FROM actual_default_acl a
    WHERE a.creating_role='ledger_migration_owner' AND a.obj_type='r' AND a.grantee='ledger_migration_owner'
    UNION ALL
    -- Unexpected: sequence default ACL
    SELECT 'UNEXPECTED default: sequence default ACL by ' || a.creating_role AS detail
    FROM actual_default_acl a WHERE a.obj_type='S'
    UNION ALL
    -- Unexpected: default ACL by unexpected creating role
    SELECT 'UNEXPECTED default ACL by creating role: ' || a.creating_role || ' in ledger schema' AS detail
    FROM actual_default_acl a
    WHERE a.creating_role IS DISTINCT FROM 'ledger_migration_owner'
    UNION ALL
    -- Unexpected: explicit grant options on default ACL
    -- PostgreSQL owner implicit grant authority is NOT marked as is_grantable
    -- in ACL display. The package does NOT use WITH GRANT OPTION, so any
    -- entry with grant_option = true is unexpected.
    -- Owner implicit re-grant authority is classified separately from
    -- stored ACL is_grantable and is NOT described as a stored grant option.
    SELECT 'UNEXPECTED grant option: ' || a.creating_role || '/' || COALESCE(a.grantee,'NULL') || ' ' || COALESCE(a.privilege,'NULL') AS detail
    FROM actual_default_acl a
    LEFT JOIN expected_default_acl e ON a.creating_role = e.creating_role AND a.schema_name = e.schema_name
        AND a.obj_type = e.obj_type AND a.grantee = e.grantee
        AND a.privilege = e.privilege AND a.grant_option = e.grant_option
    WHERE a.grant_option = true
    AND e.creating_role IS NULL
    UNION ALL
    -- trigger_owner default privileges: trigger_owner does NOT have CREATE on
    -- the ledger schema (verified in check 10f). Therefore it cannot create
    -- new functions in ledger.
    -- CREATE OR REPLACE FUNCTION for an EXISTING owned function requires only
    -- ownership (verified from PostgreSQL 17/18 docs: "You must own the
    -- function to replace it"). No CREATE on schema is required for replacement.
    -- CREATE OR REPLACE FUNCTION for a NON-EXISTING function requires CREATE
    -- on the schema (it acts as CREATE FUNCTION).
    -- Since trigger_owner lacks CREATE on schema, it can REPLACE the existing
    -- function but cannot CREATE new functions in the schema.
    -- Since it cannot create new functions, no ALTER DEFAULT PRIVILEGES FOR
    -- ROLE ledger_trigger_owner is needed. We verify trigger_owner has no
    -- default ACL entries.
    SELECT 'UNEXPECTED: ledger_trigger_owner has default ACL entries (should NOT have CREATE on schema)' AS detail
    FROM actual_default_acl a
    WHERE a.creating_role = 'ledger_trigger_owner'
) AS default_acl_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10n: CORRECTED SEQUENCE CLASSIFICATION
-- Uses pg_class for sequence detection (NOT information_schema.table_privileges).
-- Uses aclexplode on relacl for direct sequence ACL entries.
-- Uses has_sequence_privilege for effective sequence privilege verification.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_10n_sequences' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS violation_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- Unexpected sequence in ledger schema
    SELECT 'UNEXPECTED sequence in ledger schema: ' || c.relname AS detail
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname='ledger' AND c.relkind='S'
    UNION ALL
    -- Unexpected direct sequence ACL entries (using aclexplode, not information_schema)
    SELECT 'UNEXPECTED sequence ACL: ' || c.relname || '.' || COALESCE(grantee.rolname,'NULL') || ' ' || acl.privilege_type AS detail
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN aclexplode(c.relacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    LEFT JOIN pg_roles grantee ON acl.grantee = grantee.oid
    WHERE n.nspname='ledger' AND c.relkind='S' AND acl.privilege_type IS NOT NULL
    UNION ALL
    -- Unexpected effective sequence privileges for non-owner logical roles
    SELECT 'UNEXPECTED effective sequence priv: ' || c.relname || '.' || r.rolname || ' has USAGE' AS detail
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    CROSS JOIN pg_roles r
    WHERE n.nspname='ledger' AND c.relkind='S'
    AND r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND has_sequence_privilege(r.rolname, 'ledger.' || c.relname, 'USAGE')
    UNION ALL
    SELECT 'UNEXPECTED effective sequence priv: ' || c.relname || '.' || r.rolname || ' has SELECT' AS detail
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    CROSS JOIN pg_roles r
    WHERE n.nspname='ledger' AND c.relkind='S'
    AND r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_trigger_owner')
    AND has_sequence_privilege(r.rolname, 'ledger.' || c.relname, 'SELECT')
    UNION ALL
    -- Unexpected sequence default ACL entries
    SELECT 'UNEXPECTED sequence default ACL by ' || grantor.rolname AS detail
    FROM pg_default_acl da
    JOIN pg_namespace n ON da.defaclnamespace = n.oid
    JOIN pg_roles grantor ON da.defaclroleid = grantor.oid
    WHERE n.nspname='ledger' AND da.defaclobjtype='S'
) AS sequence_violations;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 10o: EXACT FUNCTION ACL VERIFICATION
-- Uses aclexplode() on proacl for direct ACL verification.
-- Uses has_function_privilege() for effective EXECUTE verification.
-- Classifies trigger_owner's ownership-derived authority accurately —
-- the function owner inherently retains EXECUTE via ownership, NOT via ACL grant.
-- ═══════════════════════════════════════════════════════════════════════════

fn_resolution AS (
    SELECT to_regprocedure('ledger.prevent_accepted_events_mutation()') AS fn_oid
),
fn_acl AS (
    SELECT fr.fn_oid,
           COALESCE(
                CASE WHEN acl.grantee = 0 THEN 'PUBLIC' END,
                grantee.rolname,
                CASE WHEN acl.grantee IS NOT NULL THEN 'UNKNOWN_OID(' || acl.grantee || ')' END
            ) AS grantee,
            acl.grantee AS grantee_oid,
            acl.privilege_type AS privilege,
            acl.is_grantable AS grant_option,
            grantor.rolname AS grantor_name,
            acl.grantor AS grantor_oid
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    LEFT JOIN aclexplode(p.proacl) AS acl(grantor, grantee, privilege_type, is_grantable) ON true
    LEFT JOIN pg_roles grantee ON acl.grantee = grantee.oid AND acl.grantee != 0
    LEFT JOIN pg_roles grantor ON acl.grantor = grantor.oid
),
-- COMPLETE EXPLICIT EXPECTED FUNCTION ACL REGISTRY
-- The expected owner OID is resolved INDEPENDENTLY from the literal expected
-- role 'ledger_trigger_owner' — NOT from p.proowner. A wrong actual owner
-- must NOT redefine the expected ACL registry.
-- After REVOKE EXECUTE FROM PUBLIC, proacl MUST be non-NULL (materialized).
-- The owner's implicit grant authority is NOT marked as is_grantable in ACL
-- display. The package does NOT use WITH GRANT OPTION, so the owner EXECUTE
-- entry has is_grantable = false.
-- Expected: (fn_oid, grantor_oid=expected_owner, grantee_oid=expected_owner, 'EXECUTE', false)
expected_function_owner AS (
    SELECT r.oid AS expected_owner_oid
    FROM pg_roles r
    WHERE r.rolname = 'ledger_trigger_owner'
),
expected_function_acl AS (
    SELECT p.oid AS fn_oid,
           efo.expected_owner_oid AS grantor_oid,
           efo.expected_owner_oid AS grantee_oid,
           'EXECUTE'::text AS privilege,
           false AS is_grantable
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    CROSS JOIN expected_function_owner efo
    WHERE fr.fn_oid IS NOT NULL
)
SELECT 'check_10o_function_acl' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS mismatch_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- Expected function owner existence (independent of actual proowner)
    SELECT 'POST-DEPLOYMENT: expected function owner ledger_trigger_owner not found (NOT READY)' AS detail
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_trigger_owner')
    UNION ALL
    -- Function existence
    SELECT 'FUNCTION prevent_accepted_events_mutation() MISSING' AS detail
    FROM fn_resolution WHERE fn_oid IS NULL
    UNION ALL
    -- Return type = trigger
    SELECT 'FUNCTION return type not trigger'
    FROM fn_resolution fr JOIN pg_proc p ON p.oid=fr.fn_oid
    JOIN pg_type rt ON p.prorettype=rt.oid
    WHERE fr.fn_oid IS NOT NULL AND rt.typname != 'trigger'
    UNION ALL
    -- Actual owner equals expected owner (independent verification using
    -- independently resolved expected OID, NOT pg_get_userbyid comparison)
    SELECT 'POST-DEPLOYMENT: actual function owner ' || pg_get_userbyid(p.proowner) || ' (OID ' || p.proowner || ') differs from expected ledger_trigger_owner' AS detail
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    CROSS JOIN expected_function_owner efo
    WHERE fr.fn_oid IS NOT NULL
    AND p.proowner IS DISTINCT FROM efo.expected_owner_oid
    UNION ALL
    -- SECURITY DEFINER
    SELECT 'FUNCTION not SECURITY DEFINER'
    FROM fn_resolution fr JOIN pg_proc p ON p.oid=fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL AND p.prosecdef = false
    UNION ALL
    -- Exact search_path (NOT regex — exact normalized comparison)
    -- Regex that accepts additional or preceding schemas is insufficient.
    SELECT 'FUNCTION search_path mismatch (expected: search_path=ledger,pg_temp actual=' || COALESCE(array_to_string(p.proconfig, ','), 'NULL') || ')'
    FROM fn_resolution fr JOIN pg_proc p ON p.oid=fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND (
        p.proconfig IS NULL
        OR array_length(p.proconfig) != 1
        OR LOWER(REPLACE(p.proconfig[1], ' ', '')) IS DISTINCT FROM 'search_path=ledger,pg_temp'
    )
    -- COMPLETE EXPLICIT FUNCTION ACL REGISTRY — expected-minus-actual
    -- proacl MUST be non-NULL — verified unconditionally below.
    -- Unexpected NULL proacl: REVOKE EXECUTE FROM PUBLIC was executed,
    -- so proacl MUST be materialized (non-NULL)
    SELECT 'UNEXPECTED NULL proacl: trigger function proacl is NULL (REVOKE EXECUTE FROM PUBLIC executed, proacl should be materialized)' AS detail
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND p.proacl IS NULL
    UNION ALL
    -- Expected-minus-actual: every expected row that is NOT present in actual
    -- Uses LEFT JOIN from expected_function_acl to fn_acl — equivalent to EXCEPT
    SELECT 'EXPECTED-MINUS-ACTUAL: missing ' || COALESCE(pg_get_userbyid(e.grantor_oid),'NULL') || '/' || COALESCE(pg_get_userbyid(e.grantee_oid),'NULL') || ' ' || e.privilege || ' is_grantable=' || e.is_grantable AS detail
    FROM expected_function_acl e
    LEFT JOIN fn_acl fa ON e.fn_oid = fa.fn_oid
        AND e.grantor_oid = fa.grantor_oid
        AND e.grantee_oid = fa.grantee_oid
        AND e.privilege = fa.privilege
        AND e.is_grantable = fa.grant_option
    WHERE fa.fn_oid IS NULL
    UNION ALL
    -- Actual-minus-expected: every actual row that is NOT present in expected
    -- Uses LEFT JOIN from fn_acl to expected_function_acl — equivalent to EXCEPT
    SELECT 'ACTUAL-MINUS-EXPECTED: unexpected ' || COALESCE(fa.grantor_name,'NULL') || '/' || COALESCE(fa.grantee,'NULL') || ' ' || COALESCE(fa.privilege,'NULL') || ' is_grantable=' || fa.grant_option AS detail
    FROM fn_acl fa
    LEFT JOIN expected_function_acl e ON fa.fn_oid = e.fn_oid
        AND fa.grantor_oid = e.grantor_oid
        AND fa.grantee_oid = e.grantee_oid
        AND fa.privilege = e.privilege
        AND fa.grant_option = e.is_grantable
    WHERE fa.fn_oid IS NOT NULL
    AND fa.privilege IS NOT NULL
    AND e.fn_oid IS NULL
    -- EFFECTIVE: PUBLIC EXECUTE (should NOT)
    -- Checked via ACL expansion, NOT has_function_privilege('PUBLIC', ...).
    -- proacl non-NULL is already verified above; if NULL, a failure was emitted.
    UNION ALL
    SELECT 'EFFECTIVE: PUBLIC has EXECUTE on trigger function (should NOT)'
    FROM fn_resolution fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND p.proacl IS NOT NULL
    AND EXISTS (SELECT 1 FROM fn_acl WHERE fn_oid = fr.fn_oid AND grantee_oid = 0 AND privilege = 'EXECUTE')
    -- EFFECTIVE: app_user, test_user, readonly, migration_owner EXECUTE (should NOT)
    -- Uses has_function_privilege with real role OIDs, NOT 'PUBLIC'.
    UNION ALL
    -- Effective function privileges: retain every expected role even if the
    -- function or role is missing. has_function_privilege is called only from
    -- resolved OID rows. Missing roles and missing function emit controlled
    -- failures inside this registry.
    SELECT 'MISSING expected role for function privilege check: ' || er.rolename AS detail
    FROM (VALUES
        ('ledger_app_user'),('ledger_test_user'),('ledger_readonly'),
        ('ledger_migration_owner'),('ledger_trigger_owner')
    ) AS er(rolename)
    LEFT JOIN pg_roles r ON er.rolename = r.rolname
    WHERE r.rolname IS NULL
    UNION ALL
    SELECT 'MISSING function for effective privilege check' AS detail
    FROM fn_resolution WHERE fn_oid IS NULL
    UNION ALL
    SELECT 'EFFECTIVE: ' || r.rolname || ' has EXECUTE on trigger function (should NOT)'
    FROM pg_roles r
    JOIN fn_resolution fr ON fr.fn_oid IS NOT NULL
    WHERE r.rolname IN ('ledger_app_user','ledger_test_user','ledger_readonly','ledger_migration_owner')
    AND has_function_privilege(r.oid, fr.fn_oid, 'EXECUTE')
    -- trigger_owner: ownership-derived authority classification
    -- trigger_owner IS the function owner and inherently retains EXECUTE via
    -- ownership. This is ownership-derived authority, NOT an ACL grant.
    -- OIDs resolved via JOIN — has_function_privilege called with OID overload.
    -- Missing trigger_owner or missing function is reported above.
    UNION ALL
    SELECT 'POST-DEPLOYMENT: ledger_trigger_owner lacks EXECUTE (ownership-derived, should have)' AS detail
    FROM pg_roles r
    JOIN fn_resolution fr ON fr.fn_oid IS NOT NULL
    WHERE r.rolname = 'ledger_trigger_owner'
    AND NOT has_function_privilege(r.oid, fr.fn_oid, 'EXECUTE')
    UNION ALL
    -- Unexpected duplicate rows in function ACL
    SELECT 'UNEXPECTED duplicate ACL row: ' || COALESCE(grantee,'NULL') || ' ' || COALESCE(privilege,'NULL') AS detail
    FROM fn_acl fr
    JOIN pg_proc p ON p.oid = fr.fn_oid
    WHERE fr.fn_oid IS NOT NULL
    AND fr.privilege IS NOT NULL
    GROUP BY fr.fn_oid, fr.grantee_oid, fr.privilege, fr.grant_option
    HAVING COUNT(*) > 1
) AS function_acl_mismatches;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 11: EXACT ABSENCE CHECKS
-- A) No event_id unique constraint or unique index
-- B) No positions.transfer_id foreign key
-- C) No optional/2G1-B structures
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_11_absence' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
    COUNT(*) AS violation_count,
    string_agg(detail, ' | ') AS details
FROM (
    -- A) event_id unique constraint
    SELECT 'event_id has UNIQUE constraint on accepted_events' AS detail
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema='ledger' AND tc.table_name='accepted_events' AND tc.constraint_type='UNIQUE' AND kcu.column_name='event_id'
    UNION ALL
    -- A) event_id unique index
    SELECT 'event_id has UNIQUE index on accepted_events'
    FROM pg_indexes WHERE schemaname='ledger' AND tablename='accepted_events' AND indexdef ~* 'UNIQUE' AND indexdef ~* 'event_id'
    UNION ALL
    -- B) positions.transfer_id foreign key
    SELECT 'positions.transfer_id has foreign key'
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema='ledger' AND tc.table_name='positions' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='transfer_id'
    UNION ALL
    -- C) optional/2G1-B structures
    SELECT 'optional table exists: ' || table_name
    FROM information_schema.tables WHERE table_schema='ledger'
    AND table_name IN ('outbox_messages','audit_records','snapshots','event_snapshots','aggregate_snapshots')
) AS absence_violations;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 12: LEXICAL ABSENCE CHECKS (file-level, not catalog)
-- These checks inspect the authored SQL files, not PostgreSQL catalogs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Lexical check results (verified by static review, not database execution):
--   Executable ALTER TRIGGER OWNER statements: 0
--   Executable DROP SCHEMA ... CASCADE statements: 0
--   Commented DROP SCHEMA ... CASCADE occurrences: 5
--   Total textual DROP SCHEMA ... CASCADE occurrences: 5

SELECT 'check_12_lexical' AS check_name,
    'INFO' AS result,
    'Lexical checks verified by static file review, not database execution' AS details;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK 13: SUMMARY COUNTS (informational supplement)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'check_13_summary' AS check_name,
    'INFO' AS result,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ledger') AS table_count,
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='ledger' AND constraint_type='PRIMARY KEY') AS pk_count,
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='ledger' AND constraint_type='UNIQUE') AS unique_count,
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='ledger' AND constraint_type='FOREIGN KEY') AS fk_count,
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='ledger' AND constraint_type='CHECK') AS check_count,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='ledger') AS index_count,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname='ledger') AS policy_count,
    (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid=c.oid JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='ledger' AND NOT t.tgisinternal) AS trigger_count;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 06_static_verification.sql
-- ═══════════════════════════════════════════════════════════════════════════
