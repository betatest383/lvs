# Stage 1 External Infrastructure Provisioning Runbook

```
STATUS: UNPROVISIONED — AWAITING EXTERNAL EXECUTION
```

This runbook is for an **external developer or DevOps contractor**. It provisions
an isolated Stage 1 execution environment and runs the acceptance-test suite. It
does **not** authorize Stage 2, does **not** touch production synchronization,
webhooks, schedulers, or any LVC OS / ServiceTitan record. Every command below
runs against an isolated PostgreSQL instance with no network path to production.

The runnable artifacts live under `src/stage1Deployment/` in this export package
(SQL, gateway contract, worker, harness, combined migration, package.json,
.env.example, this runbook, and the verification report).

---

## 0. Definitions and scope

- **Stage 1 instance** — the isolated PostgreSQL database created by this runbook.
- **Stage 1 worker** — a Node process that polls the Stage 1 instance. It is
  `SHADOW_ONLY=true`; it never calls production sync handlers and never writes to
  any Base44 entity or ServiceTitan API.
- **Submission gateway** — an HTTPS service that accepts external sync-request
  submissions, validates them, and inserts into the Stage 1 instance.
- **Acceptance harness** — `stage1_test_harness.js`, which runs
  `AT-S1-001 … AT-S1-019` directly against the Stage 1 instance.

Hard isolation rules (enforced by design, re-confirmed in Section 8):
- The Stage 1 instance must be on a separate host/database from any production
  or shared database.
- No Stage 1 component may hold credentials for ServiceTitan, Base44, or any
  production system.
- The Stage 1 worker `SHADOW_ONLY` flag must be `true` for every run in this stage.

---

## 1. Required infrastructure

### 1.1 Supported PostgreSQL version

- **Minimum: PostgreSQL 17.** Earlier versions are not supported.
- Recommended: the latest stable 17.x patch release at execution time.
- Rationale: the package uses `pg_advisory_xact_lock`, `FOR UPDATE SKIP LOCKED`,
  `gen_random_uuid()` (via `pgcrypto`), and `make_interval(secs => …)` — all
  available on 17; the project's standing minimum is PostgreSQL 17+.

### 1.2 Required extensions

- `pgcrypto` — provides `gen_random_uuid()`. `01_schema.sql` runs
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.
- No other extensions are required.

### 1.3 Recommended hosting options (any one)

1. **Self-managed VM** — a small cloud or on-prem VM running the official
   PostgreSQL 17 Docker image or OS package. Simplest for an isolated test DB.
2. **Managed PostgreSQL** — a cloud-provider managed instance (e.g. RDS,
   Cloud SQL, Azure Database for PostgreSQL) pinned to version 17, single
   instance, no public production VPC peering.
3. **Local Docker (dev only)** — `docker run -d --name stage1-pg -p 127.0.0.1:5432:5432 \
   -e POSTGRES_PASSWORD=… postgres:17`. Acceptable for the acceptance run if the
   host is not shared with production.

### 1.4 Network and TLS requirements

- The Stage 1 instance must be reachable **only** from:
  - the submission gateway host, and
  - the worker host, and
  - the operator running the acceptance harness.
- No inbound route from the public internet to the database port. Place the DB
  in a private subnet or bind to `127.0.0.1`.
- The **submission gateway** must expose a single public HTTPS endpoint
  (`POST /sync-requests`) with TLS 1.2+. All other gateway paths must return 404.
- Worker → DB and gateway → DB connections should be on the private network; if
  they must traverse the public internet, enforce TLS on the Postgres connection
  (`sslmode=require` or stricter) and restrict by IP allow-list.

### 1.5 Minimum environment requirements

- PostgreSQL host: 1 vCPU, 1 GB RAM, 10 GB disk (the acceptance suite creates
  only a few hundred rows; this is a floor, not a recommendation for production).
- Gateway host: 1 vCPU, 512 MB RAM, any modern Node 20+ runtime.
- Worker host: 1 vCPU, 512 MB RAM, Node 20+.
- Operating system: any Linux distribution supporting Node 20 and PostgreSQL 17.

---

## 2. PostgreSQL provisioning

### 2.1 Database and restricted-user creation

Run as a superuser (e.g. `postgres`):

```bash
psql -U postgres -h 127.0.0.1 <<'SQL'
CREATE DATABASE stage1_queue;
CREATE ROLE stage1_owner WITH LOGIN PASSWORD 'REPLACE_STRONG_PASSWORD' NOBYPASSRLS;
GRANT ALL PRIVILEGES ON DATABASE stage1_queue TO stage1_owner;
SQL
```

Connect to the new database and create a restricted application role (the
gateway and worker connect as this role; it cannot bypass RLS or escalate):

```bash
psql -U postgres -h 127.0.0.1 -d stage1_queue <<'SQL'
CREATE ROLE stage1_app WITH LOGIN PASSWORD 'REPLACE_STRONG_PASSWORD' NOBYPASSRLS;
GRANT CONNECT ON DATABASE stage1_queue TO stage1_app;
SQL
```

> `stage1_owner` applies the migrations and owns the objects. `stage1_app` is
> granted only the privileges needed to call the queue functions (Section 2.3).

### 2.2 pgcrypto installation

`pgcrypto` is created by `01_schema.sql` (Section 2.4). If the applying role
(`stage1_owner`) lacks `CREATE` on the database or cannot install the extension,
pre-install it as a superuser before applying the migrations:

```bash
psql -U postgres -h 127.0.0.1 -d stage1_queue -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
```

If `CREATE EXTENSION` fails with `permission denied for extension pgcrypto`,
grant the role or pre-install as superuser; the migration will then succeed
because of `IF NOT EXISTS`.

### 2.3 Required permissions

After migrations are applied, grant the application role the minimum needed:

```sql
GRANT USAGE ON SCHEMA public TO stage1_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_requests TO stage1_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stage1_app;
-- Execute the queue functions the gateway and worker call:
GRANT EXECUTE ON FUNCTION
  submit_sync_request(text,text,sync_environment,sync_domain,sync_mode,
                      trigger_type,text,text,timestamptz,timestamptz,text,jsonb,integer),
  claim_sync_request(text,integer),
  heartbeat_sync_request(uuid,text,integer),
  complete_sync_request(uuid,text,jsonb),
  retry_sync_request(uuid,text,text,text),
  defer_sync_request(uuid,text,text,integer),
  dead_letter_sync_request(uuid,text,text,text),
  recover_stale_sync_requests(integer,boolean),
  list_dead_letters(text,sync_domain,integer)
  TO stage1_app;
```

`stage1_app` must **not** be granted `BYPASSRLS`, `SUPERUSER`, or `CREATEDB`.

### 2.4 Exact migration execution order

Copy `01_schema.sql … 06_observability.sql` (or use the combined
`stage1_full_migration.sql`) to the provisioning host, then apply in order
**as `stage1_owner`**:

```bash
DB=postgres://stage1_owner:REPLACE_STRONG_PASSWORD@127.0.0.1:5432/stage1_queue

# Option A — individual files:
psql "$DB" -v ON_ERROR_STOP=1 -f 01_schema.sql
psql "$DB" -v ON_ERROR_STOP=1 -f 02_indexes.sql
psql "$DB" -v ON_ERROR_STOP=1 -f 03_submit_claim.sql
psql "$DB" -v ON_ERROR_STOP=1 -f 04_heartbeat_complete_retry.sql
psql "$DB" -v ON_ERROR_STOP=1 -f 05_defer_deadletter_recovery.sql
psql "$DB" -v ON_ERROR_STOP=1 -f 06_observability.sql

# Option B — combined single file (equivalent):
psql "$DB" -v ON_ERROR_STOP=1 -f stage1_full_migration.sql
```

`-v ON_ERROR_STOP=1` halts on the first error so a partial apply is visible.

### 2.5 Verification commands after each migration

After each file, capture the output and confirm the expected objects exist.

```bash
# After 01_schema.sql
psql "$DB" -c "\dT+ sync_*"                   # four enum types
psql "$DB" -c "\d+ sync_requests"              # table + constraints + trigger
psql "$DB" -c "SELECT extname FROM pg_extension WHERE extname='pgcrypto';"
psql "$DB" -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='sync_requests_one_inflight_per_key';"  # expect 1

# After 02_indexes.sql
psql "$DB" -c "\di+ idx_claimable idx_ser_key_status idx_stale_recovery idx_tenant_domain_status idx_correlation idx_source_event idx_dead_letter"

# After 03_submit_claim.sql
psql "$DB" -c "\df+ submit_sync_request"
psql "$DB" -c "\df+ claim_sync_request"

# After 04_heartbeat_complete_retry.sql
psql "$DB" -c "\df+ heartbeat_sync_request"
psql "$DB" -c "\df+ complete_sync_request"
psql "$DB" -c "\df+ retry_sync_request"

# After 05_defer_deadletter_recovery.sql
psql "$DB" -c "\df+ defer_sync_request"
psql "$DB" -c "\df+ dead_letter_sync_request"
psql "$DB" -c "\df+ recover_stale_sync_requests"
psql "$DB" -c "\df+ list_dead_letters"

# After 06_observability.sql
psql "$DB" -c "\dv+ vq_queue_depth vq_oldest_queued_age vq_leases vq_dead_letter_count vq_inflight_per_key"
```

Expected object inventory at completion (capture this list as evidence):

```
Enums:   sync_environment, sync_domain, sync_mode, trigger_type, sync_request_status
Table:   sync_requests (+ sync_requests_touch_updated_at_trg trigger)
Index:   sync_requests_one_inflight_per_key (partial unique, the concurrency authority)
         idx_claimable, idx_ser_key_status, idx_stale_recovery,
         idx_tenant_domain_status, idx_correlation, idx_source_event, idx_dead_letter
Functions: submit_sync_request, claim_sync_request, heartbeat_sync_request,
          complete_sync_request, retry_sync_request, defer_sync_request,
          dead_letter_sync_request, recover_stale_sync_requests, list_dead_letters,
          sync_requests_touch_updated_at
Views:   vq_queue_depth, vq_oldest_queued_age, vq_leases, vq_dead_letter_count,
         vq_inflight_per_key
```

### 2.6 Rollback procedure (07_rollback.sql)

If a migration fails or a clean slate is required, apply the rollback **as
`stage1_owner`**:

```bash
psql "$DB" -v ON_ERROR_STOP=1 -f 07_rollback.sql
```

`07_rollback.sql` is idempotent: it drops the views, functions, indexes, table,
trigger, and enum types in reverse dependency order. After rollback, the schema
is empty and the migrations can be re-applied. Rollback does **not** drop the
`stage1_owner` / `stage1_app` roles or the `pgcrypto` extension (those are
managed by the superuser per Sections 2.1–2.2).

---

## 3. Submission gateway deployment

### 3.1 Recommended implementation

A thin HTTPS service that validates an incoming sync-request, then calls
`submit_sync_request` on the Stage 1 instance. Recommended stack:
- **PostgREST** (simplest — maps the `submit_sync_request` function directly to
  `POST /rpc/submit_sync_request`), or
- a small **Node 20 + Express/Fastify** service using the `pg` driver.

Either must conform to the contract in `GATEWAY_CONTRACT.md`.

### 3.2 Authentication requirements

- Every request must present a short-TTL JWT signed with `PG_GATEWAY_JWT_SECRET`.
  Verify the signature and `exp`; reject expired tokens with `401`.
- Requests without a valid token return `401` / `403`. This is tested by
  `AT-S1-015` (unauthorized submission must be rejected and produce zero rows).
- The gateway connects to PostgreSQL as `stage1_app` only. It must never use
  `stage1_owner`.

### 3.3 Required endpoint

- `POST /sync-requests` — the single public endpoint. All other paths return 404.

### 3.4 Request and response contract

See `GATEWAY_CONTRACT.md` for the authoritative field table and response codes.
In summary:

Request body (JSON), all fields validated before insert:

```json
{
  "idempotency_key": "st:svc:{domain}:{correlation}:{suffix}",
  "tenant_id": "<allow-listed tenant>",
  "environment": "integration",
  "domain": "<one of: customer|job|appointment|purchase_order|transfer|inventory>",
  "sync_mode": "incremental",
  "trigger_type": "manual",
  "source_event_id": null,
  "requested_by": "operator",
  "window_start": null,
  "window_end": null,
  "correlation_id": "<test id>",
  "payload_json": null,
  "max_attempts": 5
}
```

- Reject unknown fields with `400`.
- Enforce the tenant and domain allow-lists (Stage 1: one test tenant, the six
  domains above).
- Do not log payload bodies or secrets; log only metadata
  (idempotency_key, tenant, domain, outcome, latency).

Responses: `200` accepted/duplicate, `400` validation error,
`401`/`403` unauthorized, `503` DB unavailable (caller may retry).

### 3.5 Environment variables

```
DATABASE_URL=postgres://stage1_app:…@127.0.0.1:5432/stage1_queue
PG_GATEWAY_JWT_SECRET=<random >=32 bytes>
GATEWAY_PORT=8443
ALLOWED_TENANTS=STAGE1_TEST_TENANT
ALLOWED_DOMAINS=customer,job,appointment,purchase_order,transfer,inventory
LOG_LEVEL=info
```

### 3.6 Health check

- `GET /healthz` returns `200 {"status":"ok","db":"up"}` when the DB connection
  is live. Used by load balancers and the evidence capture in Section 7.

### 3.7 Failure handling

- On a `submit_sync_request` exception, map the SQLSTATE to an HTTP code
  (`23502`/`22023` → `400`; connection errors → `503`). Never return `200` for a
  rejected submission.
- The gateway never calls `claim`, `heartbeat`, `complete`, `retry`, `defer`, or
  `dead_letter` — those are worker-only.

---

## 4. Non-writing worker deployment

### 4.1 Runtime and dependency requirements

- Node.js 20+.
- `pg` package: `npm install` in the deployment directory (the included
  `package.json` declares `"pg": "^8.0.0"`).

```bash
cd src/stage1Deployment
npm install
```

`stage1_worker.js` uses `import { Pool } from "pg";` (ESM). No remote imports.

### 4.2 Exact environment variables

```
DATABASE_URL=postgres://stage1_app:…@127.0.0.1:5432/stage1_queue
WORKER_ID=stage1-w-1
POLL_INTERVAL_MS=2000
HEARTBEAT_INTERVAL_MS=30000
LEASE_DURATION_S=120
SHADOW_ONLY=true          # MUST be true for Stage 1
```

`SHADOW_ONLY` must be `true`; the worker refuses to start otherwise.

### 4.3 Worker startup command

```bash
npm run worker
# or: node stage1_worker.js
```

Run one worker for the basic acceptance pass. For the concurrency tests
(`AT-S1-002`, `AT-S1-003`, `AT-S1-004`, `AT-S1-010`) the harness drives
concurrency directly via `Promise.all` against the DB, so additional worker
processes are not required for the suite to pass; if you want to demonstrate
multi-worker behavior, launch 2–25 workers with distinct `WORKER_ID`s.

### 4.4 Lease and polling configuration

- Poll every `POLL_INTERVAL_MS` (default 2 s) via `claim_sync_request`.
- On a successful claim, start a heartbeat loop at `HEARTBEAT_INTERVAL_MS`
  (default 30 s) calling `heartbeat_sync_request` with `LEASE_DURATION_S`
  (default 120 s). 4× heartbeat within a lease gives detection margin.
- Release the lease only by `complete_sync_request`, `defer_sync_request`,
  `retry_sync_request`, or `dead_letter_sync_request`. A worker whose lease
  has expired receives `lease_expired` from all of these and must stop.

### 4.5 Logging requirements

- Emit one JSON line per state transition:
  `{"event":"worker_start|claim|heartbeat|simulation_completed|deferred|retried|lease_lost|worker_exception|worker_stop", "request_id":…, "worker_id":…, …}`
- Never log payload bodies or secrets.

### 4.6 Health and shutdown behavior

- On `SIGTERM`/`SIGINT`, finish the in-flight record and exit cleanly
  (`{"event":"worker_stop"}`). Do not leave a claim held.
- A worker that loses its lease (heartbeat returns `ownership_lost` or
  `lease_expired`) stops processing that request immediately.

---

## 5. Secrets

| Secret | Stored where | Accessed by | Notes |
|---|---|---|---|
| `DATABASE_URL` (Stage 1) | Worker host env / gateway host env / operator shell | Worker, gateway, harness | Points only at the Stage 1 instance. Never production. |
| `GATEWAY_URL` | Harness shell env | Acceptance harness only | Required for `AT-S1-015`; absence correctly yields BLOCKED. |
| `PG_GATEWAY_JWT_SECRET` | Gateway host env (secret manager preferred) | Gateway only | Signs/verifies gateway JWTs. ≥32 random bytes. |
| `SYNC_WORKER_TOKEN` | Worker host env (optional for Stage 1) | Worker | If the worker must authenticate to the gateway for future stages. Not required for Stage 1 acceptance. |
| `stage1_owner` / `stage1_app` DB passwords | Secret manager or OS keychain | The applying operator, the gateway, the worker | Rotate between stages. |

Rules:
- **No secret may be committed to source control.** The `.env.example` contains
  only variable names, never values.
- Stage 1 secrets must be distinct from any production secret; the existing
  app secrets (`SERVICETITAN_*`) must not be readable by any Stage 1 component.
- The harness reads only `DATABASE_URL` and `GATEWAY_URL` from the environment.

---

## 6. Acceptance-test execution

### 6.1 Exact command

From the `src/stage1Deployment/` directory (after `npm install`):

```bash
DATABASE_URL=postgres://stage1_app:…@127.0.0.1:5432/stage1_queue \
GATEWAY_URL=https://stage1-gateway.example.com \
npm run test:stage1
# or: node stage1_test_harness.js
```

### 6.2 Required environment variables

- `DATABASE_URL` — mandatory; the harness exits 1 without it.
- `GATEWAY_URL` — mandatory for `AT-S1-015` to be PASS. If absent, `AT-S1-015`
  reports BLOCKED and the suite cannot reach all-green.

### 6.3 Required test isolation

- The harness uses a single test tenant `STAGE1_TEST_TENANT` and environment
  `integration`.
- Each test owns a unique `correlation_id` (its test id, e.g. `AT-S1-003`) and
  an idempotency-key prefix `st:svc:{domain}:{testId}:{suffix}`.
- Cleanup deletes only rows `WHERE correlation_id = <testId>`; no global wipe
  between tests.
- Tests run sequentially; concurrency is isolated inside the specific
  concurrency test being measured.

### 6.4 Expected AT-S1-001 through AT-S1-019 output

Each line: `AT-S1-NNN: PASS|FAIL|BLOCKED — <detail>` followed by an evidence
JSON object. Final line:

```
SUMMARY: passed=N failed=N blocked=N total=19
STAGE 1 FOUNDATION PASSED — READY FOR SEPARATE STAGE 2 AUTHORIZATION   # only if failed=0 && blocked=0 && passed=19
```

Per-test expected outcome (all PASS when infrastructure is correctly provisioned):

| Test | Expect | What it proves |
|---|---|---|
| AT-S1-001 | PASS | idempotent submission (1 accepted, rest duplicate) |
| AT-S1-002 | PASS | 25 concurrent same-key submissions → exactly 1 row |
| AT-S1-003 | PASS | 2 workers same key → exactly 1 active lease |
| AT-S1-004 | PASS | 25 workers same key → exactly 1 active lease |
| AT-S1-005 | PASS | 5 different keys → 5 independent concurrent leases |
| AT-S1-006 | PASS | heartbeat renews lease (extends `lease_expires_at`) |
| AT-S1-007 | PASS | stale-lease heartbeat rejected (`ownership_lost`) |
| AT-S1-008 | PASS | stale-lease completion rejected (`ownership_lost`) |
| AT-S1-009 | PASS | crashed worker recovered by `recover_stale_sync_requests` |
| AT-S1-010 | PASS | 5 concurrent recovery sweeps → exactly 1 recovers the row |
| AT-S1-011 | PASS | retry backoff schedules a future `visible_at` |
| AT-S1-012 | PASS | exhausted attempts → `dead_letter` |
| AT-S1-013 | PASS | dependency deferral increments count, preserves attempts |
| AT-S1-014 | PASS | worker simulation completes with `production_writes: 0` |
| AT-S1-015 | PASS (BLOCKED if no `GATEWAY_URL`) | unauthorized submission rejected, 0 rows |
| AT-S1-016 | PASS | invalid domain rejected by `submit_sync_request`, 0 rows |
| AT-S1-017 | PASS | DB-unavailable fails closed |
| AT-S1-018 | PASS | lease lost mid-processing → completion rejected, re-claimable |
| AT-S1-019 | PASS | zero non-integration / non-test-tenant rows exist |

### 6.5 PASS / FAIL / BLOCKED interpretation

- **PASS** — the invariant held and evidence was captured.
- **FAIL** — the test ran but the invariant did not hold, or it threw. A single
  FAIL means the suite is not green.
- **BLOCKED** — a required precondition is missing (only `AT-S1-015` without
  `GATEWAY_URL`). A BLOCKED required test means Stage 1 is not ready.

### 6.6 Required process exit codes

- Exit `0` only when `failed=0 && blocked=0 && passed=total`.
- Exit `1` otherwise. Capture the exit code in the evidence package.

---

## 7. Evidence capture

The external developer must capture and return **all** of the following.
Nothing here may be synthesized; every item must be the actual command output.

### 7.1 Migration output
- `psql … -f 01..06` (or the combined file) stdout/stderr with
  `-v ON_ERROR_STOP=1` for each file.
- The verification command outputs from Section 2.5 (`\dT`, `\d+`, `\df+`,
  index listing, view listing).

### 7.2 PostgreSQL version and extension output
- `psql "$DB" -c 'SELECT version();'`
- `psql "$DB" -c "SELECT extname, extversion FROM pg_extension WHERE extname='pgcrypto';"`

### 7.3 Schema and function inventory
- `psql "$DB" -c '\d+ sync_requests'`
- `psql "$DB" -c '\df+'` filtered to the nine queue functions plus the trigger
  function.
- `psql "$DB" -c '\dv+'` for the observability views.
- `psql "$DB" -c '\di+'` for all `sync_*` / `idx_*` indexes.

### 7.4 Acceptance-test stdout and stderr
- The complete stdout of `npm run test:stage1` (all 19 test lines + the
  SUMMARY line) and the process exit code.
- stderr if any test wrote to it.

### 7.5 Queue-state queries (run after the suite, capture row counts)
```sql
SELECT status, count(*) FROM sync_requests GROUP BY status;
SELECT count(*) FROM sync_requests WHERE environment<>'integration';
SELECT count(*) FROM sync_requests WHERE tenant_id<>'STAGE1_TEST_TENANT';
SELECT count(*) FROM sync_requests WHERE status='processing';   -- expect 0
SELECT count(*) FROM sync_requests WHERE status='dead_letter';   -- expect the AT-S1-012 row
SELECT * FROM vq_queue_depth;
SELECT * FROM vq_leases;      -- expect empty
SELECT * FROM vq_dead_letter_count;
SELECT * FROM vq_inflight_per_key;   -- expect empty
```

### 7.6 Lease-recovery evidence
- Output of the `recover_stale_sync_requests` call made by `AT-S1-009` and
  `AT-S1-010` (captured in the harness stdout), showing exactly one recovery per
  stale row under concurrent sweeps.

### 7.7 Retry and dead-letter evidence
- `AT-S1-011`: the row's `visible_at` (future) and `status='queued'`.
- `AT-S1-012`: `status='dead_letter'`, `dead_lettered_at` set, not re-claimable.
- `AT-S1-013`: `dependency_deferral_count=1`, `attempt_number` unchanged.

### 7.8 Gateway logs
- Gateway stdout/stderr for the `AT-S1-015` run showing the `401`/`403` rejection
  and the zero-row confirmation query result.

### 7.9 Worker logs
- Worker JSON log lines for at least one simulation-completed claim
  (`"event":"simulation_completed"`, `"production_writes":0`).

### 7.10 Confirmation of zero ServiceTitan writes and zero production changes
- A signed statement (text file) from the operator confirming:
  - no ServiceTitan API call was made by any Stage 1 component,
  - no Base44 entity, webhook, scheduler, or cursor was modified,
  - the production scheduler remained active and unchanged,
  - the Stage 1 instance is on a separate host/database from production.
- `git status --porcelain` output showing only `src/stage1Deployment/` (and the
  repo's `src/stage1Artifacts/` + `base44/shared/stSync/stage1SqlQueue/` source)
  files changed (no production source).

---

## 8. Final handoff checklist

The external developer must complete every item and return the marked checklist
plus the evidence package (Section 7).

- [ ] PostgreSQL 17+ instance provisioned and reachable only from gateway/worker/operator.
- [ ] `pgcrypto` installed (by `01_schema.sql` or pre-installed as superuser).
- [ ] `stage1_owner` (migration owner) and `stage1_app` (restricted) roles created; `stage1_app` has no `BYPASSRLS`/`SUPERUSER`.
- [ ] `01_schema.sql` → `06_observability.sql` applied in order (or `stage1_full_migration.sql`) with `ON_ERROR_STOP=1`; all verification commands (Section 2.5) captured.
- [ ] Submission gateway deployed with a single `POST /sync-requests` endpoint, JWT auth, and the contract from `GATEWAY_CONTRACT.md`.
- [ ] Worker deployed with `SHADOW_ONLY=true`, `pg` installed via `npm install`.
- [ ] `AT-S1-001 … AT-S1-019` executed with `DATABASE_URL` and `GATEWAY_URL` set; full stdout + exit code captured.
- [ ] Evidence package (Section 7.1–7.10) assembled and returned.
- [ ] No production synchronization, webhook, scheduler, or sync configuration modified.
- [ ] No ServiceTitan write performed by any Stage 1 component.
- [ ] No Stage 2 work started. No production cutover. No production scheduler, webhook, or sync modifications.
- [ ] Rollback (`07_rollback.sql`) verified to restore a clean schema (capture output).

### Artifacts and logs to return

1. `migration_logs/` — psql apply + verification outputs (Section 7.1, 7.2, 7.3).
2. `acceptance_output.txt` — harness stdout/stderr + exit code (Section 7.4).
3. `queue_state.txt` — the Section 7.5 query outputs.
4. `gateway.log` — Section 7.8.
5. `worker.log` — Section 7.9.
6. `isolation_statement.txt` — Section 7.10 signed statement + `git status`.
7. `rollback.log` — `07_rollback.sql` output (proves clean teardown).

Do **not** return any secret values. Return only the names/locations of secrets
as configured.

---

## What happens next

The returned evidence package is reviewed against this runbook. Only after the
review confirms `passed=19 failed=0 blocked=0` and the isolation statement is
signed will the Stage 1 foundation be declared passed and a **separate** Stage 2
authorization be considered. This runbook authorizes provisioning and execution
only — never Stage 2 or production cutover.