# Stage 1 Acceptance Test Plan

All tests use synthetic data: `environment = integration`, `tenant_id = STAGE1_TEST_TENANT`.
No production entity is created, updated, or deleted. No ServiceTitan outbound write occurs.

| ID | Purpose | Setup | Input | Concurrency | Expected | Evidence |
|---|---|---|---|---|---|---|
| AT-S1-001 | Duplicate submission | clean | same idempotency key x2 | 1 | 1 row; 2nd = duplicate | row count, outcomes |
| AT-S1-002 | Concurrent duplicate | clean | same key x25 | 25 | 1 row; 1 accepted; 24 duplicate | counts |
| AT-S1-003 | Two workers same key | 2 msgs same key | 2 claimers | 2 | 1 active lease; 1 claim | active count, claims |
| AT-S1-004 | 25 workers same key | 5 msgs same key | 25 claimers | 25 | 1 active lease; 1 claim | active count, claims |
| AT-S1-005 | Different keys | 5 domains | 5 claimers | 5 | 5 concurrent claims; ≤1/key | per-key counts |
| AT-S1-006 | Heartbeat success | 1 claimed | renew | 1 | renewed; lease advanced | res, lease time |
| AT-S1-007 | Stale heartbeat rejected | A claims, expires, B claims | A renews | 2 | A: ownership_lost; B owner | res, owner |
| AT-S1-008 | Stale completion rejected | same | A completes | 2 | A: ownership_lost | res |
| AT-S1-009 | Crash recovery | claim, expire | recover+claim | 1 | 1 recovered; reclaimable | counts |
| AT-S1-010 | Concurrent recovery | claim, expire | 5 recoverers | 5 | recovered once; status queued | totalRecovered, status |
| AT-S1-011 | Retry backoff | 1 msg | retry | 1 | not claimable before visible_at | visible_at, status |
| AT-S1-012 | Dead-letter | max_attempts=1 | retry x2 | 1 | dead_letter; not claimable | status, claim |
| AT-S1-013 | Dependency deferral | 1 msg | defer | 1 | deferral_count=1; attempt not consumed | counts |
| AT-S1-014 | Worker simulation | 1 msg | complete | 1 | simulation_completed; 0 writes | status, result |
| AT-S1-015 | Unauthorized submission | gateway up | no auth | 1 | 401/403; 0 rows | rejected, rows |
| AT-S1-016 | Invalid domain | — | bad domain | 1 | rejected; 0 rows | rejected, rows |
| AT-S1-017 | DB unavailable | bad DSN | query | 1 | fail closed | failedClosed |
| AT-S1-018 | Lease lost mid-processing | A claims, expires, recovers | A completes, B claims | 2 | A: ownership_lost; B reclaims | res, reclaimed |
| AT-S1-019 | No production mutation | after suite | count non-stage1 | — | 0 non-stage1 rows | count |

## Per-test evidence format (for the verification report)

For every test the harness prints: test id, pass/fail, and the evidence object
(row counts, active leases per key, worker identities, final status). For
concurrency tests the report records: number of submissions, number of
claimers, number of accepted rows, number of active leases per serialization
key, worker identities, and final queue state.

## Production-mutation audit (AT-S1-019)

The Stage 1 worker only connects to the Stage 1 Postgres. It has no Base44
SDK, no ServiceTitan credentials, and no access to production sync functions.
The assertion verifies zero non-Stage-1 rows exist in the queue table; the
deeper guarantee (no production entity mutation) holds by construction — the
worker simply does not import or call any production write path.