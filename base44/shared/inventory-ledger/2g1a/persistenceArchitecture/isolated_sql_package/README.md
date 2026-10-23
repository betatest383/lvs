# STAGE 2G1-A ISOLATED SQL PACKAGE

## AUTHORED BUT NOT APPROVED FOR EXECUTION

**DO NOT APPLY TO STAGING OR PRODUCTION**

---

## 1. Package Purpose

This package contains the minimum executable-but-unexecuted PostgreSQL schema for the Stage 2G1-A inventory-ledger aggregate. It defines the physical tables, constraints, indexes, RLS policies, immutability triggers, and privilege model required to persist and reconstruct every Stage 2G1-A DomainState member and immutable AcceptedEventRecords.

This package is a **design artifact only**. No SQL in this package has been executed. Execution requires separate owner authorization.

---

## 2. Governing Input Hashes

| Input | Expected SHA-256 | Verified |
|-------|------------------|----------|
| Governing Contract (`STAGE_2G1A_REPLACEMENT_GOVERNING_CONTRACT_v1.0.0.md`) | `9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7` | Yes |
| Schema Design Proposal (`STAGE_2G1A_ISOLATED_SCHEMA_DESIGN_PROPOSAL.md`) | `559c3c292e2d8970c4c170d3744447654e59bbbcd44d88be661df6e8b474ee8e` | Yes |
| Approved Persistence Architecture (`STAGE_2G1A_PERSISTENCE_CONTRACT_OWNER_APPROVAL.md`) | `8415e86a41d15c8150487aae7dec37af1f3474f464dddf062a6eeac8e66676d5` | Yes |
| Domain Boundary (`publicBoundary.ts`) | `a5794e049b721f6a1d0b4ad815606b455e8e069ba8bef25af0407b07be4bbd31` | Yes |

---

## 3. File Inventory

| File | Purpose |
|------|---------|
| `01_schema_forward.sql` | Schema, extension, 11 tables, constraints, indexes |
| `02_accepted_event_immutability.sql` | Immutability trigger function and triggers on `accepted_events` |
| `03_row_level_security.sql` | Row-Level Security enable, force, and policies |
| `04_privileges.sql` | Role definitions, grants, revokes, default privileges |
| `05_rollback.sql` | Down-migration (drop objects created by this package) |
| `06_static_verification.sql` | Static verification queries (not executed) |

---

## 4. Required Future Execution Order

```
1. Deployment-role prerequisite resolution (04_privileges.sql Section 1, deployment template)
2. Role attribute hardening               (04_privileges.sql Section 2, deployment template)
3. Schema-forward migration               (01_schema_forward.sql)
4. Immutable-trigger installation          (02_accepted_event_immutability.sql)
5. RLS policies                           (03_row_level_security.sql)
6. Ownership assignments                  (04_privileges.sql Sections 3-5)
7. Privilege grants and revokes           (04_privileges.sql Sections 6-11)
8. Default privileges                     (04_privileges.sql Section 12)
9. Static verification                    (06_static_verification.sql)
10. Future adapter integration tests      (not in this package)
```

The down-migration (`05_rollback.sql`) reverses in the opposite order.

The verification (`06_static_verification.sql`) can be run after authorized execution to validate the schema, ownership, privileges, and role attributes.

---

## 5. Package Classification

### Files 01–03: Executable schema DDL

`01_schema_forward.sql`, `02_accepted_event_immutability.sql`, and `03_row_level_security.sql` contain executable PostgreSQL DDL. They do NOT reference unresolved role names. They can be applied to an isolated database after owner authorization. However, they do NOT constitute an execution-ready package because the required ownership and authority model (file 04) remains unresolved.

### File 04: Executable (requires deployment-role prerequisites)

`04_privileges.sql` contains executable ownership assignments, privilege grants, revokes, and default-privilege controls. It requires the five deployment roles to already exist in the target database.

The following statements are DEPLOYMENT TEMPLATES (commented out) and require CREATEROLE or superuser authority:
- CREATE ROLE (Section 1)
- ALTER ROLE ... NOSUPERUSER NOBYPASSRLS etc. (Section 2)

The following statements are EXECUTABLE and require object ownership or superuser authority:
- ALTER SCHEMA ... OWNER TO (Section 3)
- ALTER TABLE ... OWNER TO (Section 4)
- ALTER FUNCTION ... OWNER TO (Section 5)
- GRANT ... ON SCHEMA (Section 6)
- GRANT ... ON TABLE (Sections 7-9)
- REVOKE ... ON TABLE (Section 10)
- REVOKE EXECUTE ON FUNCTION (Section 11)
- ALTER DEFAULT PRIVILEGES (Section 12)

### Role resolution classification

| Role | Classification | Evidence |
|------|---------------|----------|
| `ledger_migration_owner` | A — Resolved from repository convention | `stage_2g1a_receipt_validation.sql` lines 18-19, 37, 676-690 |
| `ledger_app_user` | A — Resolved from repository convention | `stage_2g1a_receipt_validation.sql` lines 24-25, 730 |
| `ledger_readonly` | A — Resolved from repository convention | `stage_2g1a_receipt_validation.sql` lines 27-28, 713-719 |
| `ledger_trigger_owner` | B — Package-local logical role | Repository precedent uses `ledger_function_owner` (lines 21-22, 693-699); package uses descriptive trigger-owner name |
| `ledger_test_user` | B — Package-local logical role | Repository has `test_unprivileged` (lines 30-31) for different purpose (zero-privilege vs. same-DML-as-runtime) |

No environment-specific names were invented without evidence. Categories A and B roles use concrete package-controlled names that will be created as deployment prerequisites.

---

## 6. Intended Authority Model

### Role Attributes

| Role | LOGIN | SUPERUSER | CREATEDB | CREATEROLE | INHERIT | BYPASSRLS | REPLICATION |
|------|-------|-----------|----------|------------|---------|-----------|-------------|
| `ledger_migration_owner` | No | No | No | No | Yes | Yes | No |
| `ledger_trigger_owner` | No | No | No | No | Yes | No | No |
| `ledger_app_user` | No | No | No | No | Yes | No | No |
| `ledger_test_user` | No | No | No | No | Yes | No | No |
| `ledger_readonly` | No | No | No | No | Yes | No | No |

No role has SUPERUSER. No role has CREATEDB. No role has CREATEROLE. No role has REPLICATION. All roles are NOLOGIN. Only `ledger_migration_owner` has BYPASSRLS (reviewed schema proposal Section 11.2).

### BYPASSRLS Reconciliation

- **Reviewed schema proposal** (Section 11.2): assigns `BYPASSRLS = YES` to `ledger_migration_owner` with reason "needed to create and manage RLS policies."
- **Governing contract** (Section 22): gates external database execution separately; does not mention BYPASSRLS.
- **Persistence architecture approval** (Principle 7): requires "migration privileges separated from runtime privileges" and "narrowly privileged runtime role"; does not mention BYPASSRLS.
- **Older receipt-validation script** (`stage_2g1a_receipt_validation.sql`): creates `ledger_migration_owner` with NO BYPASSRLS. This script is superseded by the reviewed schema proposal and serves as naming precedent only. The governing contract (Section 18) adopts it as a "PostgreSQL receipt-validation reference" but does NOT authorize it for execution.
- **Conclusion**: The reviewed schema proposal governs. `BYPASSRLS = YES` is restored for `ledger_migration_owner`. The older script is not authoritative for the privilege model.

### LOGIN Versus Group-Role Model

All five roles are NOLOGIN. A future application connection must assume `ledger_app_user` through a separately administered LOGIN role that is granted membership in `ledger_app_user`. The specific LOGIN identity is UNRESOLVED — an additional deployment prerequisite. No LOGIN role name is invented. No passwords or credentials are included. The LOGIN role must not be a member of `ledger_migration_owner` or `ledger_trigger_owner` and must not have CREATEROLE, SUPERUSER, or BYPASSRLS. The logical authorization role (`ledger_app_user`) is distinct from the physical connection identity (the LOGIN role).

### Privilege Matrix Evidence

The table privilege matrix for `ledger_app_user` is derived from the approved Persistence Adapter Contract Proposal Section 6.2 (Model A — Direct Transactional DML). `ledger_test_user` has the same DML as `ledger_app_user` (schema proposal Section 11.4). `ledger_readonly` has SELECT on all tables (schema proposal Section 11.5). `ledger_trigger_owner` has no table privileges and no EXECUTE (schema proposal Section 11.3). `ledger_migration_owner` owns all objects (schema proposal Section 11.2).

### Sequence Classification

- Existing package sequences: 0 (confirmed from `01_schema_forward.sql` — no SERIAL, IDENTITY, or SEQUENCE declarations)
- Current sequence grants required: 0
- Verification detects unexpected package sequences: Yes
- Verification detects unexpected sequence privileges: Yes

### Object Ownership Matrix

| Object | Owner |
|--------|-------|
| SCHEMA `ledger` | `ledger_migration_owner` |
| All 11 tables | `ledger_migration_owner` |
| FUNCTION `prevent_accepted_events_mutation()` | `ledger_trigger_owner` |
| TRIGGERS on `accepted_events` | Follows table owner (`ledger_migration_owner`) |

### Role Purpose

| Role | Purpose |
|------|---------|
| `ledger_migration_owner` | Owns schema, tables, indexes, policies; creates objects; manages migrations; BYPASSRLS=YES (bypasses RLS despite FORCE) |
| `ledger_trigger_owner` | Owns trigger function only; SECURITY DEFINER execution; no general DML |
| `ledger_app_user` | Runtime adapter; DML on state tables; INSERT-only on `accepted_events`; subject to RLS |
| `ledger_test_user` | Same DML as `ledger_app_user`; isolated test database only; subject to RLS |
| `ledger_readonly` | Diagnostic SELECT-only; subject to RLS |

---

## 7. Objects Created

### Tables (11)

1. `ledger.tenants` — Tenant registry
2. `ledger.aggregates` — Aggregate registry
3. `ledger.state_revision` — Revision and concurrency lock row per aggregate
4. `ledger.items` — Tenant-wide item reference data
5. `ledger.positions` — Inventory positions
6. `ledger.company_ownership` — Company-owned quantity per item per aggregate
7. `ledger.transfers_outstanding` — Transfer lifecycle records
8. `ledger.correction_provenance` — Correction provenance (mutable current state)
9. `ledger.job_issue_progress` — Job material issue tracking
10. `ledger.accepted_events` — Immutable AcceptedEventRecords (append-only)
11. `ledger.transaction_cutoff` — Transaction freeze configuration

### Constraints

- 11 primary keys
- 2 unique constraints (non-PK)
- 18 foreign keys (13 immediate composite + 5 item-consistent immediate composite)
- 7 check constraints

### Indexes (beyond PK/UNIQUE indexes)

- `accepted_events`: idx_ae_idem, idx_ae_revision, idx_ae_event_type
- `positions`: idx_positions_item
- `transfers_outstanding`: idx_to_outstanding (partial)
- `correction_provenance`: idx_cp_original

### RLS

- 10 tables with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- 10 policies (one per table), each with explicit `USING` and `WITH CHECK` expressions

### Triggers

- 2 triggers on `accepted_events` (BEFORE UPDATE, BEFORE DELETE)

### Functions

- 1 trigger function: `ledger.prevent_accepted_events_mutation()`

---

## 8. Objects Intentionally Deferred

| Object | Reason |
|--------|--------|
| `ledger.outbox_messages` | Stage 2G1-A does not produce external publications (Section 15) |
| `ledger.audit_records` | Duplicates `accepted_events` (Section 5.3) |
| Snapshot tables | Pending OD-020 profiling (Section 16.3) |
| PO lifecycle tables | Not in domain model (Section 5.3) |
| Position lifecycle flag columns | Not in domain model (Section 5.3) |
| Stage 2G1-B structures | Out of scope |
| ServiceTitan synchronization tables | Out of scope |

---

## 9. Database-Unprotected Relationships (7)

These references are domain-validated only — no physical foreign key is created:

| # | Child Field | Parent Table | Parent Identifier | Justification |
|---|-------------|--------------|-------------------|---------------|
| 19 | `positions.transfer_id` | `transfers_outstanding` | `transfer_id` | Domain-exact value is NULL; no adapter mutation authorized |
| 20 | `correction_provenance.original_event_id` | `accepted_events` | `event_id` | Parent not unique |
| 21 | `transfers_outstanding.dispatch_event_id` | `accepted_events` | `event_id` | Parent not unique |
| 22 | `transfers_outstanding.receive_event_id` | `accepted_events` | `event_id` | Parent not unique |
| 23 | `correction_provenance` (no physical column) | `accepted_events` | `event_id` | Stored in `recorded_operations_json` |
| 24 | `correction_provenance.blocking_downstream_event_ids` | `accepted_events` | `event_id` | JSONB array; junction table deferred |
| 25 | `correction_provenance.related_issue_event_id` | `job_issue_progress` | `issue_event_id` | Nullable; informational |

---

## 10. Accepted-Event Immutability Security Model

Immutability of `accepted_events` is enforced through multiple, distinct authority layers:

### 10.1 Runtime DML Grants

`ledger_app_user` has only `SELECT` and `INSERT` on `accepted_events`. It has NO `UPDATE` and NO `DELETE` privilege. The same applies to `ledger_test_user` and `ledger_readonly`. `PUBLIC` has no `UPDATE` or `DELETE` either. These grants and explicit revokes are in `04_privileges.sql` Sections 7–10. The privilege layer is the first defense — the trigger layer (10.2) is defense-in-depth.

### 10.2 Trigger Enforcement

Two triggers (`trg_prevent_ae_update`, `trg_prevent_ae_delete`) fire `BEFORE UPDATE` and `BEFORE DELETE` on `accepted_events`. They raise an exception preventing mutation. These triggers apply to ALL roles that attempt DML, including roles that have UPDATE or DELETE grants (defense-in-depth).

### 10.3 Trigger Function Ownership

The trigger function `ledger.prevent_accepted_events_mutation()` is owned by `ledger_trigger_owner` (deployment template). It is `SECURITY DEFINER` with `SET search_path = ledger, pg_temp`. Owning the function does NOT grant authority to alter, disable, or drop a trigger on the table.

### 10.4 Table Ownership

`ledger.accepted_events` is owned by `ledger_migration_owner` (deployment template). The table owner controls trigger management: `CREATE TRIGGER`, `DROP TRIGGER`, `ALTER TABLE ... DISABLE TRIGGER`.

### 10.5 BYPASSRLS Authority

`ledger_migration_owner` has `BYPASSRLS = YES` (reviewed schema proposal Section 11.2). This affects RLS, not trigger enforcement. No runtime role has `BYPASSRLS`. PostgreSQL superusers always bypass RLS regardless of the setting. The older receipt-validation script assigns NO BYPASSRLS but is superseded by the reviewed schema proposal and serves as naming precedent only.

### 10.6 Migration-Owner Authority

`ledger_migration_owner` (table owner) can disable triggers via `ALTER TABLE ledger.accepted_events DISABLE TRIGGER ...`. This is an administrative action requiring table ownership. The runtime role has no ALTER privilege.

### 10.7 Superuser Authority

PostgreSQL superusers can perform all administrative actions regardless of ownership and privileges, including disabling triggers, dropping functions, changing ownership, and bypassing RLS. Superusers remain administrative trust authorities. The immutability design does NOT prevent a superuser from disabling the triggers.

### 10.8 Trigger Management Authority Summary

PostgreSQL triggers do NOT have independently assignable owners. A trigger is owned by the same role that owns the parent table.

Who can manage triggers on `accepted_events`:
- `ledger_migration_owner` (table owner): YES — can ALTER TABLE, DISABLE TRIGGER, DROP TRIGGER, CREATE TRIGGER
- `ledger_trigger_owner` (function owner): NO — owning the function alone does NOT grant trigger management authority on the table
- PostgreSQL superusers: YES — can perform all administrative actions
- `ledger_app_user`: NO — has no ALTER privilege on the table
- `ledger_test_user`: NO — has no ALTER privilege on the table
- `ledger_readonly`: NO — has no ALTER privilege on the table
- `PUBLIC`: NO — has no ALTER privilege on the table

`correction_provenance` is mutable current state (UPSERT-capable) — distinct from immutable `accepted_events`.

---

## 11. Tenant-Context Trust Boundary

The future persistence adapter will execute `SET LOCAL ledger.tenant_id = :tenant_id` within each database transaction.

### 11.1 Custom GUC Setting

Any role that can execute SQL can call `SET LOCAL` on a custom GUC variable. PostgreSQL itself does NOT distinguish whether the value came from trusted server context versus an arbitrary SQL statement.

### 11.2 Credential Boundary

A holder of `ledger_app_user` database credentials could execute `SET LOCAL ledger.tenant_id` to any arbitrary UUID value and then issue DML against that tenant's rows. The SQL package alone does NOT cryptographically or mechanically validate that the tenant value matches the authenticated application user.

### 11.3 Required Deployment Invariant

Database credentials for `ledger_app_user` MUST be held exclusively by the trusted adapter process. Untrusted callers MUST be prohibited from:
- Direct SQL access to the database
- Controlling raw SQL statements
- Initiating transactions that set the tenant GUC

The trust boundary is enforced at the application credential boundary, NOT within PostgreSQL itself.

### 11.4 `current_setting` Behavior

- **GUC absent**: `current_setting('ledger.tenant_id', true)` returns NULL. `NULL::uuid` is NULL. `tenant_id = NULL` evaluates to NULL (treated as false in USING/WITH CHECK) — no rows visible, no writes permitted. This is fail-closed behavior.
- **GUC is a valid UUID string**: The cast succeeds and the comparison proceeds normally.
- **GUC is a non-empty invalid value** (not a valid UUID): `current_setting` returns the string, and the `::uuid` cast RAISES AN ERROR (invalid input syntax for type uuid). This does NOT silently return no rows — the statement fails with an error.

### 11.5 BYPASSRLS and Table Ownership Effects

- An ordinary table owner normally bypasses row-level security.
- `FORCE ROW LEVEL SECURITY` causes the table owner to be subject to RLS policies.
- PostgreSQL superusers and roles with `BYPASSRLS` still bypass RLS even when `FORCE ROW LEVEL SECURITY` is enabled.
- The migration owner (`ledger_migration_owner`) has `BYPASSRLS = YES` (reviewed schema proposal Section 11.2), so it bypasses RLS regardless of FORCE ROW LEVEL SECURITY.
- `ledger_app_user` MUST NOT own any protected table and MUST NOT have `BYPASSRLS`.
- Applies to `ledger_app_user`, `ledger_test_user`, `ledger_readonly`: `BYPASSRLS = NO`, subject to RLS.
- `ledger_migration_owner` has `BYPASSRLS = YES`; all other roles have `BYPASSRLS = NO`.

---

## 12. Concurrency and Idempotency Structures

- `ledger.state_revision` table: one row per aggregate, `(tenant_id, aggregate_id)` as PK.
- `SELECT ... FOR UPDATE` on `state_revision` acquires the aggregate lock.
- `current_revision` is advanced by exactly 1 on each accepted event.
- `UNIQUE (tenant_id, aggregate_id, idempotency_key)` on `accepted_events` is defense-in-depth.
- The domain engine is the primary duplicate detector (returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`).
- No new Stage 2G1-A rejection codes are invented.
- No business-rule evaluation is moved into PostgreSQL.

---

## 13. Rollback Design and Limitations

The down-migration (`05_rollback.sql`) drops only objects created by this package:

- Drops triggers, then tables in reverse dependency order, then the trigger function.
- Uses explicit object names — no executable `DROP SCHEMA ... CASCADE`.
- Does NOT handle production data restoration, application rollback, or backup restoration.
- Is NOT automatically safe for staging or production — separate authorization required.
- Is NOT a disposable local reset — use `DROP SCHEMA ledger CASCADE` only in disposable development environments with an environment assertion.

---

## 14. DROP SCHEMA Reporting

| Category | Count |
|----------|-------|
| Executable `DROP SCHEMA ... CASCADE` statements | 0 |
| Commented or documentation occurrences | 5 |
| Total textual occurrences | 5 |

The 5 textual occurrences are in:
- `05_rollback.sql` line 13 (comment)
- `05_rollback.sql` line 19 (comment)
- `06_static_verification.sql` check_12 lexical summary (3 occurrences in comments)

No executable `DROP SCHEMA ... CASCADE` exists in any package file.

---

## 15. Verification Classification

The static verification queries in `06_static_verification.sql` are **authored but not executed**. They are designed to verify exact definitions via catalog-derived ordered arrays and expected-definition registries:

- Every required table by exact name
- Every column (94 total) by exact table, name, ordinal position, PostgreSQL type, nullability, and default-presence status
- Complete default-expression registry for all 14 columns with defaults, detecting missing expected defaults, incorrect expressions, and unexpected defaults
- Every primary key (11) and unique constraint (2) by exact ordered column array
- Every foreign key (18) by exact child columns, parent table, parent columns, ON UPDATE action, ON DELETE action, deferrability, and validity
- Every check constraint (7) by normalized definition via `pg_get_constraintdef`
- Every index (6) by exact table, name, uniqueness, columns, and predicate
- RLS enable and FORCE status per table (10 tables individually)
- Every RLS policy (10) by exact name, command, roles array, USING expression, and WITH CHECK expression. `pg_policies.roles` is `name[]` — a policy without a TO clause applies to PUBLIC and appears as `{public}` (a one-element name array containing lower-case `public`), verified by exact `IS DISTINCT FROM ARRAY['public']::name[]` comparison that distinguishes `{public}` from NULL, empty array, specific roles, PUBLIC-plus-other, and multi-role arrays
- Trigger verification: affirmative checks that FAIL if trigger is absent, verifying exact `tgtype` event bits (BEFORE ROW UPDATE for update trigger, BEFORE ROW DELETE for delete trigger), absence of unintended INSERT/TRUNCATE/INSTEAD/AFTER events, enabled status, and bound function OID resolved by exact zero-argument signature via `to_regprocedure('ledger.prevent_accepted_events_mutation()')`
- Trigger function: resolved by exact signature via `to_regprocedure`, SECURITY DEFINER via `pg_proc.prosecdef`, search_path, language, return type, owner via `pg_get_userbyid` (post-deployment)
- PUBLIC EXECUTE absence on trigger function via `aclexplode()` on `proacl` checking grantee OID 0 (NOT `has_function_privilege('PUBLIC', ...)`) (post-deployment)
- `accepted_events` table owner via `pg_get_userbyid` (post-deployment)
- Privilege absence via `has_table_privilege` and `has_schema_privilege` OID overloads with role and table OIDs resolved in prior CTEs via JOINs — no WHERE-clause short-circuit or subquery patterns; missing roles or objects produce no rows from the JOIN, preventing function calls with NULL arguments (post-deployment)
- Role attribute hardening: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION for all 5 roles via `pg_roles` catalog (post-deployment)
- Schema ownership: `ledger` schema owned by `ledger_migration_owner` (post-deployment)
- Table ownership: all 11 tables owned by `ledger_migration_owner` (post-deployment)
- Schema CREATE revocation from PUBLIC and runtime roles (post-deployment)
- Default privileges: `ledger_readonly` SELECT on future tables, PUBLIC EXECUTE revoked on future functions (post-deployment)
- Runtime schema USAGE presence (post-deployment)
- Five-role effective table-privilege matrix: 5 roles × 11 tables × 7 privileges via `has_table_privilege` OID overloads from `resolved_roles` and `resolved_tables` CTEs (no subquery short-circuit patterns); LEFT JOIN from expected registry with missing-role and missing-table checks that emit controlled FAIL for unresolved targets; distinguishing ownership-derived authority (migration_owner) from ACL-granted authority (post-deployment, check 10k)
- Direct table ACL verification: `aclexplode()` on `relacl` expands direct ACL entries; PUBLIC identified as grantee OID 0 (not `pg_roles`); exact owner ACL registry covering all 7 table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER), owner grantee OID, owner grantor OID; owner grant-option (is_grantable) is NOT automatically expected true — PostgreSQL owner implicit grant authority is NOT marked in ACL display, and the package does NOT use WITH GRANT OPTION; detects missing owner rows, partial owner rows, unexpected owner rows, unexpected explicit owner grant option, missing non-owner grants, unexpected non-owner grants, PUBLIC grants, wrong grantor, unexpected NULL relacl, and missing expected tables; LEFT JOIN from expected registry ensures missing targets produce controlled FAIL (post-deployment, check 10p)
- Version-correct membership and administrative authority verification: two recursive closures — inherited-authority closure filtering on `inherit_option = true` and SET ROLE closure filtering on `set_option = true` (preserves start_oid and target_oid); COMPLETE ADMINISTRATIVE EDGE UNIVERSE (`all_direct_admin_authority`) including every `pg_auth_members` edge with `admin_option = true` WITHOUT filtering the target to named protected roles — detects administration of unexpected roles, SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS roles, object-owner roles, and roles with protected effective privileges; named-protected-role derivation (`direct_admin_authority`) and complete-universe SET ROLE-reachable derivation (`all_set_role_reachable_admin`) built separately from the complete universe; direct holder authority verified independently from SET ROLE reachability (a role that directly holds admin_option does NOT need to SET ROLE to itself); catalog-discovered unexpected administrative holders inspected directly from `all_direct_admin_authority` (an unexpected role does NOT disappear because it is absent from a hard-coded starting list); powerful-role administration (direct and SET ROLE-reachable) tested using the complete universe; accepted_events UPDATE and DELETE verified against ALL administrable target roles (not just the 5 named ones); resulting membership grant fail-closed for every prohibited administrative edge (future GRANT ROLE options not statically determinable — unresolved prerequisite reported); version gate fails closed on PostgreSQL < 17 (post-deployment, check 10l)
- Exact default ACL verification: complete expected-vs-actual registry using `aclexplode()` on `defaclacl`; PUBLIC as grantee OID 0; covers tables, sequences, and functions separately; creating-role owner EXECUTE entry with is_grantable = false (owner implicit grant authority is NOT marked as stored grant option); verifies pg_default_acl function row exists (missing entry restores default PUBLIC EXECUTE); detects trigger_owner default ACL entries (trigger_owner lacks CREATE on schema, cannot create new functions); detects explicit grant options as unexpected (post-deployment, check 10m)
- Corrected sequence classification: `pg_class` for sequence detection, `aclexplode` on `relacl` for direct sequence ACL entries, `has_sequence_privilege` for effective sequence privileges (NOT `information_schema.table_privileges`) (check 10n)
- Exact function ACL verification: expected owner OID resolved INDEPENDENTLY from the literal expected role `ledger_trigger_owner` (NOT from `p.proowner` — a wrong actual owner must NOT redefine the expected ACL registry); explicit `expected_function_acl` registry containing fn_oid, grantor_oid (expected owner OID), grantee_oid (expected owner OID), privilege, and is_grantable; expected-minus-actual via LEFT JOIN from expected to actual (equivalent to EXCEPT); actual-minus-expected via LEFT JOIN from actual to expected (equivalent to EXCEPT); actual-owner-equals-expected-owner verified using independently resolved expected OID; expected owner role existence verified; `aclexplode()` on `proacl` with `fn_acl` CTE; proacl materialization enforced unconditionally (REVOKE EXECUTE FROM PUBLIC requires non-NULL proacl); PUBLIC as grantee OID 0 (not `has_function_privilege('PUBLIC', ...)`); exact search_path comparison (not regex); owner EXECUTE with is_grantable = false (owner implicit grant authority NOT marked as stored grant option); unexpected duplicate rows detected; effective function privilege check retains every expected role even if function or role is missing (missing-role and missing-function failures emitted inside this registry); direct ACL, effective EXECUTE, and ownership-derived authority for trigger_owner classified separately (post-deployment, check 10o)
- Absence of `event_id` uniqueness (constraints AND unique indexes)
- Absence of `positions.transfer_id` foreign key
- Absence of optional and Stage 2G1-B structures

Checks marked POST-DEPLOYMENT are written to FAIL or report NOT READY until deployment role names are resolved and applied. Role-dependent checks resolve roles safely via `pg_roles` before evaluating privilege functions, preventing script abortion when roles are absent.

Count-only summary checks remain as informational supplements and do NOT substitute for exact-definition checks.

A non-executed SQL file is NOT a passing database test.

---

## 16. Explicit Non-Execution Statement

**No SQL in this package has been executed.** This package was authored and statically reviewed only. No database was accessed, provisioned, or connected. No migrations were applied. No production code was modified. The governing contract was not modified. The schema proposal was not modified. Stage 2G1-B was not modified, tested, or activated. BT-042 was not executed.

The static review performed was lexical and structural-by-text inspection only. It does NOT constitute PostgreSQL parser validation, planner validation, recursive CTE execution validation, catalog behavior validation, ACL evaluation validation, or privilege-function behavior validation. Presence of CTE names or diagnostic strings in the SQL text does NOT prove their relational behavior.

---

## 17. Readiness Classification

This section is organized into four independent readiness categories. No category implies another. A "Yes" in one category does NOT justify a "Yes" in another. Every "Yes" must be mechanically justified by supporting evidence.

### A. Architectural Completeness

These items verify that intended SQL, registries, and relations have been authored. They do NOT verify that the SQL executes correctly, that the parser accepts it, or that catalog behavior matches expectations.

| Item | Status | Evidence |
|------|--------|----------|
| Schema-forward SQL authored (01) | Yes | 11 tables, constraints, indexes in file |
| Immutable-trigger SQL authored (02) | Yes | Trigger function + 2 triggers in file |
| RLS policy SQL authored (03) | Yes | 10 policies in file |
| Privilege SQL authored (04) | Yes | Sections 3–12 in file |
| Rollback SQL authored (05) | Yes | Down-migration in file |
| Static verification SQL authored (06) | Yes | Checks 1–13 in file |
| Expected column registry implemented | Yes | VALUES list, 94 columns (check 1) |
| Expected default-expression registry implemented | Yes | VALUES list, 14 defaults (check 1b) |
| Expected key registry implemented | Yes | VALUES list, 13 keys (check 2) |
| Expected FK registry implemented | Yes | VALUES list, 18 FKs (check 3) |
| Expected check constraint registry implemented | Yes | VALUES list, 7 checks (check 4) |
| Expected index registry implemented | Yes | VALUES list, 6 indexes (check 5) |
| Expected policy registry implemented | Yes | VALUES list, 10 policies (check 7) |
| Expected trigger registry implemented | Yes | Affirmative checks (check 8) |
| Expected table privilege matrix implemented | Yes | VALUES list, 33 rows (check 10k) |
| Expected direct table ACL registry implemented | Yes | `expected_acl` CTE (check 10p) |
| Expected default ACL registry implemented | Yes | `expected_default_acl` CTE (check 10m) |
| Expected function ACL registry implemented (independent of actual owner) | Yes | `expected_function_acl` CTE using `expected_function_owner` (check 10o) |
| Expected role registry implemented | Yes | VALUES list, 5 roles (checks 10a, 10l) |
| Inherited-authority closure implemented | Yes | `can_reach_inherited` CTE (check 10l) |
| SET ROLE closure implemented (preserves endpoints) | Yes | `can_reach_set_role` CTE (check 10l) |
| Complete administrative edge universe implemented | Yes | `all_direct_admin_authority` CTE (check 10l) |
| Direct administrative authority (non-transitive) implemented | Yes | `direct_admin_authority` derived from complete universe (check 10l) |
| SET ROLE-reachable administrative authority implemented | Yes | `all_set_role_reachable_admin` CTE (check 10l) |
| Powerful-role administration checks implemented | Yes | `POWERFUL-ADMIN-DIRECT`, `POWERFUL-ADMIN-SET-ROLE` (check 10l) |
| accepted_events UPDATE/DELETE consequence checks implemented | Yes | Against all administrable target roles (check 10l) |
| Missing-target registries implemented (per registry) | Yes | See Section 19 for per-registry evidence |
| PostgreSQL 17+ minimum declared | Yes | Version gate (check 10l) + file headers |

### B. Static Lexical Verification

These items verify that the authored SQL text has been inspected and that lexical searches, registry completeness checks, and expected-minus-actual constructions have been performed. They do NOT verify parser, planner, or catalog behavior.

| Item | Status | Evidence |
|------|--------|----------|
| Lexical static searches performed | Yes | Zero GRANT ALL, zero passwords, zero ALTER TRIGGER OWNER |
| SQL text manually inspected | Yes | All 6 files reviewed |
| Registry completeness checked (expected source vs resolution) | Yes | See Section 19 |
| Expected-minus-actual construction verified | Yes | Table ACL (10p), function ACL (10o), default ACL (10m) |
| Actual-minus-expected construction verified | Yes | Table ACL (10p), function ACL (10o), default ACL (10m) |
| Structural consistency verified (no stale CTE references) | Yes | No `can_administer`, `admin_holders`, `can_set_role_to_admin` references |
| Invalid admin_option-only recursion removed | Yes | No `can_administer` CTE |
| Function ACL expectations independent of actual owner (lexical) | Yes | `expected_function_owner` CTE resolves from `ledger_trigger_owner` |
| Owner grant-option semantics corrected (lexical) | Yes | Owner entries expected with `is_grantable = false` |
| Static review is lexical/non-executing | Yes | No database accessed |

### C. Semantic Verification

These items require PostgreSQL parser, planner, recursive execution, catalog behavior, ACL evaluation, and privilege-function behavior. No SQL has been executed against any database. Every item is No.

| Item | Status |
|------|--------|
| PostgreSQL parser validation performed | No |
| PostgreSQL planner validation performed | No |
| Recursive CTE execution validated | No |
| Catalog behavior validated (pg_auth_members, pg_roles, pg_proc, etc.) | No |
| ACL evaluation validated (aclexplode, has_table_privilege, has_function_privilege) | No |
| Privilege-function behavior validated | No |
| RLS policy behavior validated | No |
| Trigger function behavior validated | No |
| Immutability trigger enforcement validated | No |
| Membership closure termination validated | No |
| Administrative authority detection validated | No |
| accepted_events propagation validated | No |
| Function ACL materialization validated | No |
| Default ACL materialization validated | No |
| Owner grant-option ACL display validated | No |

### D. Deployment Readiness

These items require resolved deployment identities, connection-role mappings, ownership-transfer prerequisites, and provisioning. All remain unresolved.

| Item | Status |
|------|--------|
| Deployment roles created | No (requires CREATEROLE) |
| Role attributes hardened | No (requires CREATEROLE) |
| Ownership-transfer execution model resolved | No (Models A, B, C unresolved) |
| Login-to-logical-role mapping resolved | No (additional deployment prerequisite) |
| Deployment identity substitutions resolved | No (3 from convention, 2 package-local) |
| DBA executor identity resolved | No (ALTER FUNCTION OWNER unresolved) |
| Physical connection-role mapping resolved | No |
| Resulting membership propagation modeled | No (future GRANT ROLE options not statically determinable) |
| Deployment-runner version preflight resolved | No (no runner exists) |
| Isolated non-production database provisioned | No |
| Database execution authorized | No |
| Package directly executable without preprocessing | No |
| Package ready for database execution | No |

---

## 18. Subsystem Status Matrix

Each major subsystem receives exactly one status in each category. Categories are NOT merged.

| Subsystem | Implemented | Lexically Verified | Semantically Verified | Deployment Verified |
|-----------|:-----------:|:------------------:|:--------------------:|:-------------------:|
| Membership verification | Yes | Yes | No | No |
| SET ROLE verification | Yes | Yes | No | No |
| Administrative verification | Yes | Yes | No | No |
| accepted_events verification | Yes | Yes | No | No |
| Table ACL verification | Yes | Yes | No | No |
| Default ACL verification | Yes | Yes | No | No |
| Function ACL verification | Yes | Yes | No | No |
| Function ownership verification | Yes | Yes | No | No |
| RLS verification | Yes | Yes | No | No |
| Missing-target verification | Yes | Yes | No | No |
| Schema existence verification | Yes | Yes | No | No |
| Table existence verification | Yes | Yes | No | No |
| Role attribute verification | Yes | Yes | No | No |
| Sequence verification | Yes | Yes | No | No |

---

## 19. Missing-Target Registry Evidence

For each registry that claims missing-target handling, the actual expected source, resolution method, and unresolved behavior are documented. Universal wording ("every registry") is replaced with per-registry evidence.

| Registry | Expected source | Resolution method | Unresolved behavior | Expected-minus-actual | Actual-minus-expected |
|----------|----------------|-------------------|---------------------|----------------------|----------------------|
| Columns (1) | VALUES list (94) | LEFT JOIN information_schema | MISSING per column | N/A | UNEXPECTED per column |
| Defaults (1b) | VALUES list (14) | JOIN actual_defaults | MISSING/INCORRECT per default | N/A | UNEXPECTED per default |
| Keys (2) | VALUES list (13) | LEFT JOIN actual_keys | MISSING per key | N/A | UNEXPECTED per key |
| FKs (3) | VALUES list (18) | LEFT JOIN actual_fks | MISSING per FK | N/A | UNEXPECTED per FK |
| Check constraints (4) | VALUES list (7) | LEFT JOIN actual_checks | MISSING per check | N/A | UNEXPECTED per check |
| Indexes (5) | VALUES list (6) | LEFT JOIN actual_indexes | MISSING per index | N/A | UNEXPECTED per index |
| RLS policies (7) | VALUES list (10) | LEFT JOIN pg_policies | MISSING per policy | N/A | UNEXPECTED per policy |
| Triggers (8) | Affirmative WHERE NOT EXISTS | WHERE NOT EXISTS | MISSING/INCORRECT per trigger | N/A | UNEXPECTED per trigger |
| Role attributes (10a) | VALUES list (5) | LEFT JOIN pg_roles | MISSING per role | N/A | N/A |
| Table existence (10d) | VALUES list (11) | NOT EXISTS pg_class+pg_namespace | MISSING per table + WRONG relkind | N/A | N/A |
| Schema existence (10c) | Literal 'ledger' | NOT EXISTS pg_namespace | MISSING expected schema | N/A | N/A |
| Direct table ACLs (10p) | `expected_acl` CTE | LEFT JOIN from expected to actual | MISSING per ACL entry | Yes (LEFT JOIN) | Yes (LEFT JOIN) |
| Effective table privs (10k) | `expected_privs` CTE | LEFT JOIN + missing-role/table checks | MISSING per role/table | Yes (per-role/table) | Yes (per-role/table) |
| Membership (10l) | pg_roles cross product | EXISTS subquery + missing-role check | MISSING per role | N/A | N/A |
| Direct admin authority (10l) | `all_direct_admin_authority` | Complete universe (no target filter) | UNEXPECTED-ADMIN-HOLDER | N/A | N/A |
| SET ROLE-reachable admin (10l) | `all_set_role_reachable_admin` | Complete universe | UNEXPECTED via SET ROLE | N/A | N/A |
| Default ACLs (10m) | `expected_default_acl` CTE | LEFT JOIN from expected to actual | MISSING per entry | Yes (LEFT JOIN) | Yes (LEFT JOIN) |
| Sequence existence (10n) | Zero expected (proven from schema-forward — no SERIAL/IDENTITY/SEQUENCE) | pg_class detection | UNEXPECTED per sequence | N/A | N/A |
| Function existence (10o) | to_regprocedure + `expected_function_owner` | WHERE NULL + owner existence | MISSING function + MISSING expected owner | N/A | N/A |
| Direct function ACLs (10o) | `expected_function_acl` CTE | LEFT JOIN (EXCEPT-equivalent) | EXPECTED-MINUS-ACTUAL | Yes (LEFT JOIN) | Yes (LEFT JOIN) |
| Effective function privs (10o) | Expected-role registry + fn_resolution | LEFT JOIN pg_roles + fn existence | MISSING role + MISSING function | N/A | N/A |

---

## 20. Owner Review Criteria

"Owner review" means the owner has reviewed the authored SQL text and confirmed that the intended architecture is implemented as written. It refers ONLY to:

- Architectural Completeness (Section A): SQL authored, registries implemented, relations implemented
- Static Lexical Verification (Section B): lexical searches, registry completeness, SQL text inspection

Owner review does NOT mean and does NOT imply:

- The SQL has been parsed by PostgreSQL (Section C: No)
- The SQL has been executed against any database (Section C: No)
- Catalog behavior has been validated (Section C: No)
- The package is executable (Section D: No)
- Deployment prerequisites are resolved (Section D: No)
- Physical connection-role exposure is covered (Section D: No)
- Resulting membership propagation is modeled (Section D: No)

### Current owner-review readiness

Package ready for final owner review: **No**

The package is NOT ready for final owner review because:

1. Physical connection-role administrative exposure is not covered (Section D — unresolved deployment prerequisite)
2. Resulting membership propagation is not modeled (Section D — future GRANT ROLE options not statically determinable)
3. Deployment prerequisites remain unresolved (Section D — executor identity, ownership-transfer model, connection-role mapping)
4. No semantic verification has been performed (Section C — all items No)

Acknowledging unresolved core security assumptions while simultaneously claiming owner readiness is not mechanically justified. The current documented state: owner review has not been granted. Sections C and D document the pending semantic and deployment items. The four-section structure (A, B, C, D) describes the evidence as documented.

---

## 21. Outstanding Prerequisites

The following items remain unresolved. This list documents the current state; it does not prescribe order or recommend decisions.

1. Owner authorization for isolated non-production database creation
2. Role creation by a database administrator (Section 1 deployment template)
3. Role attribute hardening by a database administrator (Section 2 deployment template)
4. Owner authorization for SQL execution (Phase B of the schema proposal)
5. Confirmation of OD-004 (physical primary-key type) if surrogate UUID benchmark is requested
6. Selection of migration tooling (OD-015)
7. Resolution of deployment executor identity (Model A, B, or C for ALTER FUNCTION OWNER)
8. Resolution of physical connection-role mapping
9. Resolution of deployment-runner version preflight
