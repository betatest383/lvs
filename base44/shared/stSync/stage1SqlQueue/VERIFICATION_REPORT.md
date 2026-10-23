# Stage 1 Verification Report

## What was authored

A complete, ready-to-execute Stage 1 foundation artifact set under
`base44/shared/stSync/stage1SqlQueue/`:

- `01_schema.sql` — enums, `sync_requests` table, constraints, partial unique
  index `sync_requests_one_inflight_per_key` (DB-enforced single in-flight lease
  per serialization key).
- `02_indexes.sql` — claimable, serialization-key, stale-recovery, reporting,
  tracing, dead-letter indexes with documented rationale.
- `03_submit_claim.sql` — `submit_sync_request` (atomic `INSERT … ON CONFLICT
  DO NOTHING` idempotency) and `claim_sync_request` (advisory per-key lock +
  `FOR UPDATE SKIP LOCKED` + under-lock re-check; increments attempt_number
  once per real claim).
- `04_heartbeat_complete_retry.sql` — lease heartbeat (explicit result
  strings), `complete_sync_request` → `simulation_completed`, retry with
  backoff schedule 1/2/5/15/60 min.
- `05_defer_deadletter_recovery.sql` — dependency deferral (separate counter,
  does not consume failure budget), dead-letter transition,
  `recover_stale_sync_requests` (concurrent-safe via `FOR UPDATE SKIP LOCKED`),
  `list_dead_letters` (read-only admin inspection).
- `06_observability.sql` — `vq_*` metric views (queue depth, oldest queued
  age, active/expired leases, dead-letter count, per-key inflight).
- `07_rollback.sql` — idempotent full removal.
- `GATEWAY_CONTRACT.md` — authenticated HTTPS submission gateway contract
  (JWT, replay protection, status codes, idempotency-key rules).
- `worker/worker.js` + `worker/README.md` — non-writing Stage 1 worker
  (Node + `pg`); `SHADOW_ONLY=true` enforced; heartbeat loop; graceful
  shutdown; lease-loss stop.
- `tests/test_harness.js` + `tests/ACCEPTANCE_TEST_PLAN.md` — AT-S1-001 →
  AT-S1-019 deterministic tests with evidence capture.

## Concurrency authority

Single in-flight lease per `serialization_key`
(`{environment}:{tenant_id}:{domain}`) is enforced **transactionally by
PostgreSQL** via the partial unique index
`sync_requests_one_inflight_per_key` (`WHERE status='processing'`) plus a
per-key `pg_advisory_xact_lock` inside `claim_sync_request`. This is not a
worker-side check. Different serialization keys remain independently
claimable.

## Idempotency model

At-least-once delivery with idempotent processing → effectively-once state
transition. Permanent submission dedup via DB `UNIQUE(idempotency_key)`.
Retry/delivery dedup via adapter-level `findExisting`/`recordsEqual` (existing
engine behavior) once Stage 2+ connects a real worker.

## Lease model (final values)

- heartbeat interval: 30 s
- lease duration: 120 s

Rationale: four heartbeats fit within one lease, giving robust detection of a
stalled worker before expiry while keeping DB write volume modest per
in-flight request.

## What was NOT done (platform boundary)

The following are outside the Base44 build-tool boundary and require separate
owner infrastructure action — they are explicitly not authorized here and
were not performed:

- **No PostgreSQL instance was provisioned.** Provisioning managed Postgres
  (or any external DB) is not possible from the Base44 build tools.
- **No SQL was executed.** The schema/functions/indexes are unapplied design
  artifacts.
- **No PostgREST/HTTPS gateway was deployed.** The contract is documented; the
  running gateway is provisioned by the owner.
- **No worker was deployed.** The worker source is provided; deployment is by
  the owner.
- **No secrets were created.** `PG_GATEWAY_URL`, `PG_GATEWAY_JWT_SECRET`,
  `SYNC_WORKER_TOKEN` are documented as required; they are created when the
  gateway is provisioned.
- **No production trigger routing changed.** The 15-minute scheduler,
  ServiceTitan webhooks, `ServiceTitanSyncCursor`, and all sync handlers are
  unchanged.
- **No production entity was created, updated, or deleted.**

## Acceptance-test execution status

The acceptance tests (`AT-S1-001` … `AT-S1-019`) **were not executed**, because
they require a provisioned Stage 1 PostgreSQL instance that does not exist.
Database evidence and log evidence therefore cannot be produced from within
this authorization. The test harness is ready to execute once the owner
provisions the database and applies `01_schema.sql` → `06_observability.sql`.

## Production-mutation audit

By construction, Stage 1 cannot mutate production data: the worker connects
only to the Stage 1 Postgres, holds no Base44 SDK, no ServiceTitan
credentials, and no access to production sync functions. No production sync
path was modified. The 15-minute scheduler remains active and unchanged.

## Rollback

Stage 1 is independently removable:
1. Stop the Stage 1 worker.
2. Disable the submission gateway.
3. Revoke Stage 1 credentials.
4. Retain test evidence, then `psql -f 07_rollback.sql`.
5. Confirm Base44 synchronization behavior unchanged and the 15-minute
   scheduler still active.

Because no production trigger routing changed, rollback requires no
restoration of any production sync path.

## Known limitations

- Artifacts are unprovisioned; acceptance tests cannot be run from within
  the Base44 environment.
- `hashtext` advisory locks can collide across unrelated keys, causing rare
  over-serialization (harmless for correctness).
- The gateway-auth test (AT-S1-015) is skipped if `GATEWAY_URL` is not
  provided at test time.

## Stage 2 readiness

Stage 2 is **not** recommended until all AT-S1 acceptance tests pass against a
provisioned database with database evidence, and the production-mutation
audit confirms zero production writes. That evidence does not exist yet.

## Final status

```
STAGE 1 FOUNDATION PARTIALLY COMPLETE — NOT READY FOR STAGE 2
```

The complete, ready-to-execute Stage 1 foundation has been authored as
version-controlled artifacts. Execution against a live PostgreSQL instance —
and therefore a truthful "PASSED" status — requires separate owner
authorization to provision the external infrastructure (PostgreSQL,
PostgREST gateway, containerized worker) that is outside the Base44
build-tool boundary.