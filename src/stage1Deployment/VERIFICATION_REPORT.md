# Stage 1 Verification Report

## Status

```
STAGE 1 ARTIFACT REPAIR COMPLETE — INFRASTRUCTURE EXECUTION REQUIRED BEFORE STAGE 1 CAN PASS
```

The artifact package has been repaired and statically verified. No external
PostgreSQL, gateway, or worker is provisioned, so the acceptance tests have
not been executed and Stage 1 is not declared passed.

## Package layout note

The runnable Node artifacts (worker, test harness, and this report) live
under `src/stage1Artifacts/` (and the export copy under
`src/stage1Deployment/`) rather than `base44/shared/stSync/stage1SqlQueue/`
because the Base44 backend shared-module validator rejects a bare `pg`
import and any dynamic `import()` in `base44/shared`, and once such a module
existed in that tree the validator blocked subsequent new `.md` writes there
even after the offending module was removed. The SQL, gateway contract, and
documentation remain under `base44/shared/stSync/stage1SqlQueue/`. This is a
packaging decision only; the artifacts are unchanged in behavior.

## 1. Files repaired

| File | Repair |
|---|---|
| `01_schema.sql` | Removed stray `j` after the enum-section separator; added `CREATE EXTENSION IF NOT EXISTS pgcrypto;` with a documented admin dependency for `gen_random_uuid()`; replaced invalid `NOT IN (...)::sync_request_status[]` array cast with valid per-element enum casts. |
| `03_submit_claim.sql` | Added a contract comment listing the 13 ordered parameters above `submit_sync_request`; added a `BEGIN … EXCEPTION WHEN unique_violation THEN CONTINUE` block around the claim UPDATE as defense-in-depth, with reasoning that the advisory lock + recheck make it unreachable. |
| `04_heartbeat_complete_retry.sql` | `heartbeat_sync_request`, `complete_sync_request`, and `retry_sync_request` now require `status='processing'`, `claimed_by=worker`, and `lease_expires_at > clock_timestamp()`; expired leases return `lease_expired` and may not renew, complete, or retry. |
| `05_defer_deadletter_recovery.sql` | `defer_sync_request` requires the same lease-validity triple and returns `lease_expired`. `dead_letter_sync_request` no longer allows a null `claimed_by` bypass: it requires `status='processing'`, `claimed_by=worker`, and a valid lease. System stale recovery remains the sole path that reclaims an expired lease (direct transition, no ownership bypass). |
| `stage1_test_harness.js` | Replaced the non-awaiting concurrent launch with a sequential test registry; each test owns a unique `correlation_id`/idempotency prefix and cleans up only its own rows; corrected `submit_sync_request` calls to 13 placeholders/args; AT-S1-015 now reports `BLOCKED` when `GATEWAY_URL` is absent; exit reports `passed/failed/blocked/total` and exits 0 only when `failed=0 && blocked=0 && passed=total`. Replaced the dynamic `import()` in AT-S1-017 with a reuse of the top-level `Pool` import. |
| `stage1_worker.js` | Relocated out of base44/shared (no behavioral repair); uses the static `pg` import. |

## 2. Defects corrected

1. Stray character `j` in `01_schema.sql` enum separator — removed.
2. Missing `pgcrypto` extension dependency for `gen_random_uuid()` — added with documented admin fallback.
3. Invalid enum-array cast in the completed-status constraint — replaced with two per-element casts.
4. Lease validity not enforced on heartbeat/complete/retry/defer — added `lease_expires_at > clock_timestamp()` with a `lease_expired` result.
5. `dead_letter_sync_request` allowed a null-`claimed_by` bypass — closed; requires owner + valid lease.
6. `claim_sync_request` had no `unique_violation` handling — added a sub-block that catches it and tries another key.
7. Test harness launched tests without awaiting and then awaited an already-populated array — replaced with a sequential `for` loop over a test registry.
8. Test harness deleted all `STAGE1_TEST_TENANT` rows on every `reset()` — replaced with per-test cleanup by `correlation_id`.
9. `submit_sync_request` test calls used 14 placeholders/args for a 13-parameter function — corrected to 13.
10. AT-S1-015 silently passed when `GATEWAY_URL` was absent — now reports `BLOCKED`.
11. Suite exit logic did not distinguish blocked from failed — now reports `passed/failed/blocked/total`.
12. Dynamic `import()` in AT-S1-017 tripped the shared-module validator — replaced with the top-level `Pool` import.

## 3. Corrected function signatures

```
submit_sync_request(text, text, sync_environment, sync_domain, sync_mode,
                    trigger_type, text, text, timestamptz, timestamptz,
                    text, jsonb, integer)
  RETURNS TABLE(outcome text, request_id uuid)

claim_sync_request(text, integer) RETURNS TABLE(... 17 columns ...)

heartbeat_sync_request(uuid, text, integer) RETURNS text
complete_sync_request(uuid, text, jsonb) RETURNS text
retry_sync_request(uuid, text, text, text) RETURNS text
defer_sync_request(uuid, text, text, integer) RETURNS text
dead_letter_sync_request(uuid, text, text, text) RETURNS text
recover_stale_sync_requests(integer, boolean) RETURNS TABLE(request_id uuid, serialization_key text, prior_worker text)
list_dead_letters(text, sync_domain, integer) RETURNS TABLE(...)
```

## 4. Corrected lease-validity rules

Every ownership-sensitive operation (`heartbeat`, `complete`, `retry`,
`defer`, `dead_letter`) now requires all three, evaluated on a `FOR UPDATE`-
locked row:

```
status          = 'processing'
claimed_by      = supplied worker_id
lease_expires_at > clock_timestamp()
```

Result strings:

```
not_found | not_processing | ownership_lost | lease_expired
renewed | completed | requeued | deferred | dead_lettered
```

An expired-lease worker is denied every mutation; only
`recover_stale_sync_requests` (system path) reclaims an expired lease, via a
direct status transition that does not call `dead_letter_sync_request`.

## 5. Corrected test execution model

- Tests run sequentially: `for (const [id, test] of tests) await run(id, test)`.
- Concurrency occurs only inside the specific concurrency test (e.g.
  `Promise.all(Array.from({length:25}, …))`).
- Each test has a unique `correlation_id` (its test id) and idempotency-key
  prefix `st:svc:{domain}:{testId}:{suffix}`.
- Cleanup deletes only rows `WHERE correlation_id = testId`.

## 6. PASS / FAIL / BLOCKED model

- `PASS` — the test asserted its expected invariant and produced evidence.
- `FAIL` — the test ran but the invariant did not hold, or it threw.
- `BLOCKED` — a required precondition is not provisioned (e.g. `GATEWAY_URL`
  absent for AT-S1-015). A blocked required test means Stage 1 is not ready.

Exit: `passed=… failed=… blocked=… total=…`; exit code 0 only when
`failed=0 && blocked=0 && passed=total`.

## 7. Static cross-file verification table

Performed without a PostgreSQL instance (no parser execution claimed).

| Check | Result | Notes |
|---|:---:|---|
| SQL free of stray characters | Pass | stray `j` removed from `01_schema.sql` |
| `gen_random_uuid()` dependency declared | Pass | `CREATE EXTENSION IF NOT EXISTS pgcrypto` |
| Enum array cast syntax valid | Pass | per-element `::sync_request_status` casts |
| `submit_sync_request` signature consistent | Pass | 13 params; tests + worker use 13 args/order |
| `claim_sync_request` signature consistent | Pass | `(text, integer)` across create/rollback/tests |
| Lease-validity enforced on heartbeat/complete/retry/defer | Pass | all require `lease_expires_at > clock_timestamp()` |
| `dead_letter_sync_request` ownership closed | Pass | requires `claimed_by=worker` + valid lease; no null bypass |
| `recover_stale_sync_requests` is sole expired-lease path | Pass | direct transition; does not call dead_letter function |
| `unique_violation` handled in claim | Pass | sub-block catches + `CONTINUE` |
| Function names in rollback match creation | Pass | `07_rollback.sql` DROP signatures match all 9 functions |
| Every referenced function included in package | Pass | submit/claim/heartbeat/complete/retry/defer/dead_letter/recover/list_dead_letters all present |
| Every required enum value present | Pass | status enum has queued/processing/completed/deferred/failed/dead_letter/cancelled/simulation_completed |
| Every required status transition has a path | Pass | queued to processing (claim); processing to simulation_completed/queued/deferred/dead_letter; expired to queued/dead_letter via recover |
| Test harness sequential | Pass | `for (const [id,test] of tests) await run(id,test)` |
| Test isolation by correlation_id | Pass | unique per test; cleanup per test id |
| AT-S1-015 BLOCKED when no gateway | Pass | returns `{blocked:true}` |
| No dynamic import() in deployment artifacts | Pass | runnable code uses `import { Pool } from "pg"` |
| No Base44 entity used as concurrency authority | Pass | authority is partial unique index + advisory lock in PostgreSQL |
| No production file modified | Pass | only stage1SqlQueue SQL/docs and deployment folder touched |
| PostgreSQL parser validation | Not claimed | no instance available; static review only |

## 8. Remaining external infrastructure dependencies

- Provisioned isolated PostgreSQL instance (apply `01` to `06`, or the combined `stage1_full_migration.sql`).
- `pgcrypto` extension installable by the applying role (or pre-installed by an admin).
- Authenticated HTTPS submission gateway (PostgREST or equivalent) per `GATEWAY_CONTRACT.md`.
- Containerized non-writing worker (Node + `pg`) per `stage1_worker.js`.
- Secrets: `DATABASE_URL`, `GATEWAY_URL`, `PG_GATEWAY_JWT_SECRET`,
  `SYNC_WORKER_TOKEN` (created at provisioning, not here).
- `GATEWAY_URL` env for the test runner so AT-S1-015 is not blocked.

## 9. No production change confirmation

- No production trigger, scheduler, webhook, cursor, sync handler, entity, or
  ServiceTitan configuration was modified.
- The 15-minute scheduler remains active and unchanged.
- `ServiceTitanSyncCursor` and `stSyncLock.ts` are untouched.
- No production LVC OS or ServiceTitan record was created, updated, or deleted.
- No secrets were created.

## 10. Claim-correctness reasoning

The partial unique index `sync_requests_one_inflight_per_key` is the
committed-state guarantee of at most one `processing` row per
`serialization_key`. Inside `claim_sync_request`, a per-key
`pg_advisory_xact_lock` serializes the critical section so only one claimer at
a time evaluates the eligibility recheck and UPDATE for a given key. With the
advisory lock held, the recheck reads committed state; if no active lease
exists, the UPDATE creates the sole `processing` row and cannot conflict. The
`unique_violation` handler is therefore unreachable under expected operation
but is retained as defense-in-depth: if it ever fires, the claimer abandons
that candidate and tries another eligible key.

## Final status

```
STAGE 1 ARTIFACT REPAIR COMPLETE — INFRASTRUCTURE EXECUTION REQUIRED BEFORE STAGE 1 CAN PASS
``