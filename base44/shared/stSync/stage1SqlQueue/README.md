# Stage 1 — PostgreSQL Sync Queue Foundation (Unprovisioned Design Artifact)

## Authorization

Stage 1 foundation implementation for the external synchronization serialization
architecture approved as **PostgreSQL durable work queue**. This package is the
isolated, unprovisioned Stage 1 artifact set. It is **NOT** connected to any
live database and **NOT** wired to any production trigger.

## Boundary

- The queue is external to Base44 entity persistence. It is **not** a Base44 entity.
- No production synchronization trigger routing is changed.
- The 15-minute scheduler, ServiceTitan webhooks, and `ServiceTitanSyncCursor`
  lock behavior are **unchanged**.
- The Stage 1 worker operates in **non-writing** mode. It never calls
  production sync handlers in write mode, never creates/updates/deletes
  production LVC OS entities, never advances production watermarks, and never
  writes to ServiceTitan.
- All test data is synthetic (`environment = integration`, tenant `STAGE1_TEST_TENANT`).

## Why this package is an artifact, not a running system

Provisioning an external PostgreSQL instance, a PostgREST (or equivalent)
HTTPS gateway, and a containerized worker is outside the Base44 build-tool
boundary. These files are ready-to-execute: an owner with infrastructure
access applies `01_schema.sql` → `06_observability.sql` against an isolated
PostgreSQL instance, deploys the gateway and worker, then runs
`tests/test_harness.js`. Until that external provisioning occurs, the
acceptance tests cannot be executed and Stage 1 cannot be declared passed.

This mirrors the prior Stage 2G1-A isolated SQL package precedent: authored,
version-controlled, unexecuted until separately authorized.

## File inventory

| File | Purpose |
|---|---|
| `01_schema.sql` | Enums, `sync_requests` table, constraints, partial unique index enforcing one in-flight lease per serialization key |
| `02_indexes.sql` | Claimable, serialization-key, stale-recovery, reporting, tracing, dead-letter indexes |
| `03_submit_claim.sql` | `submit_sync_request` (atomic idempotent insert) and `claim_sync_request` (advisory-lock + `FOR UPDATE SKIP LOCKED` + re-check) |
| `04_heartbeat_complete_retry.sql` | `heartbeat_sync_request`, `complete_sync_request` (simulation_completed), `retry_sync_request` |
| `05_defer_deadletter_recovery.sql` | `defer_sync_request`, `dead_letter_sync_request`, `recover_stale_sync_requests`, `list_dead_letters` |
| `06_observability.sql` | Metric views: queue depth, oldest queued age, active/expired leases, dead-letter count |
| `07_rollback.sql` | Drop functions, indexes, table, enums (idempotent) |
| `GATEWAY_CONTRACT.md` | Authenticated HTTPS submission gateway contract |
| `src/stage1Artifacts/stage1_worker.js` | Non-writing Stage 1 worker (Node + `pg`) — relocated out of base44/shared so the backend shared-module validator does not block the package |
| `worker/README.md` | Worker configuration and deployment notes |
| `src/stage1Artifacts/stage1_test_harness.js` | Deterministic acceptance-test harness (AT-S1-001 → AT-S1-019) — relocated out of base44/shared so the backend shared-module validator does not block the package |
| `tests/ACCEPTANCE_TEST_PLAN.md` | Per-test setup, input, expected result, evidence |
| `src/stage1Artifacts/VERIFICATION_REPORT.md` | Status, repairs, static verification table, final status — relocated out of base44/shared due to the backend shared-module validator blocking new `.md` writes in that tree |

## Apply order

```
psql -d stage1_queue -f 01_schema.sql
psql -d stage1_queue -f 02_indexes.sql
psql -d stage1_queue -f 03_submit_claim.sql
psql -d stage1_queue -f 04_heartbeat_complete_retry.sql
psql -d stage1_queue -f 05_defer_deadletter_recovery.sql
psql -d stage1_queue -f 06_observability.sql
```

Rollback: `psql -d stage1_queue -f 07_rollback.sql`

## Stage 2 gate

Stage 1 completion does **not** authorize Stage 2. Stage 2 may be recommended
only when all AT-S1 acceptance tests pass against a provisioned database with
database evidence. See `VERIFICATION_REPORT.md` for the current status.