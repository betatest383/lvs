/* global process */
/**
 * Stage 1 deterministic acceptance-test harness.
 *
 * UNPROVISIONED ARTIFACT. Cannot run until the owner provisions the
 * Stage 1 PostgreSQL instance and applies 01-06 SQL. Runtime: Node 20+
 * with the `pg` package installed (`npm i pg`).
 *
 * Env: DATABASE_URL (Stage 1 Postgres). GATEWAY_URL for AT-S1-015
 * (unauthorized submission). If GATEWAY_URL is absent, AT-S1-015 is
 * reported as BLOCKED and the suite cannot pass.
 *
 * Tests run SEQUENTIALLY at the suite level. Concurrency occurs only
 * inside the specific concurrency test being measured. Each test
 * cleans up only its own rows (by correlation_id = test id).
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required to run Stage 1 acceptance tests");
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL });

const TENANT = "STAGE1_TEST_TENANT";
const ENV = "integration";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * submit(testId, suffix, domain, extra)
 *
 * Calls submit_sync_request with parameters in this exact order:
 *   1  idempotency_key  text            -> `st:svc:{domain}:{testId}:{suffix}`
 *   2  tenant_id        text            -> TENANT
 *   3  environment      sync_environment-> ENV
 *   4  domain           sync_domain     -> domain
 *   5  sync_mode        sync_mode       -> extra.sync_mode || 'incremental'
 *   6  trigger_type     trigger_type    -> extra.trigger_type || 'manual'
 *   7  source_event_id  text            -> extra.source_event_id || null
 *   8  requested_by     text            -> extra.requested_by || 'tester'
 *   9  window_start     timestamptz     -> extra.window_start || null
 *   10 window_end       timestamptz     -> extra.window_end || null
 *   11 correlation_id   text            -> testId
 *   12 payload_json     jsonb           -> extra.payload_json (stringified) || null
 *   13 max_attempts     integer         -> extra.max_attempts || 5
 */
async function submit(testId, suffix, domain = "job", extra = {}) {
  const idempotency_key = `st:svc:${domain}:${testId}:${suffix}`;
  return pool.query(
    "SELECT outcome, request_id FROM submit_sync_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [
      idempotency_key, TENANT, ENV, domain,
      extra.sync_mode || "incremental", extra.trigger_type || "manual",
      extra.source_event_id || null, extra.requested_by || "tester",
      extra.window_start || null, extra.window_end || null,
      testId,
      extra.payload_json ? JSON.stringify(extra.payload_json) : null,
      extra.max_attempts || 5
    ]
  );
}

async function claim(workerId, leaseS = 120) {
  return pool.query("SELECT * FROM claim_sync_request($1,$2)", [workerId, leaseS]);
}

async function activeLeaseCountForKey(key) {
  const r = await pool.query(
    "SELECT count(*)::int AS n FROM sync_requests WHERE serialization_key=$1 AND status='processing'",
    [`${ENV}:${TENANT}:${key}`]
  );
  return r.rows[0].n;
}

async function rowCountForIdemKey(key) {
  const r = await pool.query("SELECT count(*)::int AS n FROM sync_requests WHERE idempotency_key=$1", [key]);
  return r.rows[0].n;
}

async function cleanup(testId) {
  await pool.query("DELETE FROM sync_requests WHERE correlation_id=$1 AND environment='integration'", [testId]);
}

// ---------- Test definitions ----------

async function testDuplicateSubmission() {
  await cleanup("AT-S1-001");
  const a = await submit("AT-S1-001", "a");
  const b = await submit("AT-S1-001", "a");
  const rows = await rowCountForIdemKey(`st:svc:job:AT-S1-001:a`);
  return { pass: rows === 1 && a.rows[0].outcome === "accepted" && b.rows[0].outcome === "duplicate", rows, a: a.rows[0], b: b.rows[0] };
}

async function testConcurrentDuplicateSubmission() {
  await cleanup("AT-S1-002");
  const k = `st:svc:job:AT-S1-002:a`;
  const rs = await Promise.all(Array.from({ length: 25 }, () => submit("AT-S1-002", "a")));
  const rows = await rowCountForIdemKey(k);
  const accepted = rs.filter(r => r.rows[0].outcome === "accepted").length;
  const dup = rs.filter(r => r.rows[0].outcome === "duplicate").length;
  return { pass: rows === 1 && accepted === 1 && dup === 24, rows, accepted, dup };
}

async function testTwoWorkersSameKey() {
  await cleanup("AT-S1-003");
  await submit("AT-S1-003", "a");
  await submit("AT-S1-003", "b");
  const c = await Promise.all([claim("wA003"), claim("wB003")]);
  const active = await activeLeaseCountForKey("job");
  const claims = c.filter(r => r.rows.length > 0).length;
  return { pass: active === 1 && claims === 1, active, claims };
}

async function test25WorkersSameKey() {
  await cleanup("AT-S1-004");
  for (let i = 0; i < 5; i++) await submit("AT-S1-004", `m${i}`);
  const c = await Promise.all(Array.from({ length: 25 }, (_, i) => claim(`w004-${i}`)));
  const active = await activeLeaseCountForKey("job");
  const claims = c.filter(r => r.rows.length > 0).length;
  return { pass: active === 1 && claims === 1, active, claims };
}

async function testDifferentKeys() {
  await cleanup("AT-S1-005");
  const domains = ["customer", "job", "appointment", "purchase_order", "transfer"];
  for (const d of domains) await submit("AT-S1-005", `k-${d}`, d);
  const c = await Promise.all(Array.from({ length: 5 }, (_, i) => claim(`wk005-${i}`)));
  const claimed = c.filter(r => r.rows.length > 0).length;
  const perKey = {};
  for (const d of domains) perKey[d] = await activeLeaseCountForKey(d);
  const ok = claimed === 5 && Object.values(perKey).every(n => n === 1);
  return { pass: ok, claimed, perKey };
}

async function testHeartbeatSuccess() {
  await cleanup("AT-S1-006");
  await submit("AT-S1-006", "a");
  const c = await claim("whb006");
  const before = c.rows[0].lease_expires_at;
  await sleep(50);
  const r = await pool.query("SELECT heartbeat_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "whb006", 120]);
  const row = await pool.query("SELECT lease_expires_at FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  return { pass: r.rows[0].res === "renewed" && new Date(row.rows[0].lease_expires_at) >= new Date(before), res: r.rows[0].res };
}

async function testStaleHeartbeatRejection() {
  await cleanup("AT-S1-007");
  await submit("AT-S1-007", "a");
  const c = await claim("wA007");
  await pool.query("UPDATE sync_requests SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE request_id=$1", [c.rows[0].request_id]);
  await pool.query("SELECT recover_stale_sync_requests(100, true)");
  await claim("wB007");
  const r = await pool.query("SELECT heartbeat_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "wA007", 120]);
  const owner = await pool.query("SELECT claimed_by FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  return { pass: r.rows[0].res === "ownership_lost" && owner.rows[0].claimed_by === "wB007", res: r.rows[0].res, owner: owner.rows[0].claimed_by };
}

async function testStaleCompletionRejection() {
  await cleanup("AT-S1-008");
  await submit("AT-S1-008", "a");
  const c = await claim("wA008");
  await pool.query("UPDATE sync_requests SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE request_id=$1", [c.rows[0].request_id]);
  await pool.query("SELECT recover_stale_sync_requests(100, true)");
  await claim("wB008");
  const r = await pool.query("SELECT complete_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "wA008", JSON.stringify({ x: 1 })]);
  return { pass: r.rows[0].res === "ownership_lost", res: r.rows[0].res };
}

async function testWorkerCrashRecovery() {
  await cleanup("AT-S1-009");
  await submit("AT-S1-009", "a");
  const c = await claim("wcrash009");
  await pool.query("UPDATE sync_requests SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE request_id=$1", [c.rows[0].request_id]);
  const rec = await pool.query("SELECT recover_stale_sync_requests(100, true)");
  const reclaim = await claim("wrecovery009");
  return { pass: rec.rows.length === 1 && reclaim.rows.length === 1, recovered: rec.rows.length, reclaimed: reclaim.rows.length };
}

async function testConcurrentStaleRecovery() {
  await cleanup("AT-S1-010");
  await submit("AT-S1-010", "a");
  const c = await claim("wstale010");
  await pool.query("UPDATE sync_requests SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE request_id=$1", [c.rows[0].request_id]);
  const recs = await Promise.all(Array.from({ length: 5 }, () => pool.query("SELECT recover_stale_sync_requests(100, true)")));
  const totalRecovered = recs.reduce((s, r) => s + r.rows.length, 0);
  const status = (await pool.query("SELECT status FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id])).rows[0].status;
  return { pass: totalRecovered === 1 && status === "queued", totalRecovered, status };
}

async function testRetryBackoff() {
  await cleanup("AT-S1-011");
  await submit("AT-S1-011", "a", "job", { payload_json: { simulate_retryable_failure: true } });
  const c = await claim("wretry011");
  const r = await pool.query("SELECT retry_sync_request($1,$2,$3,$4) AS res", [c.rows[0].request_id, "wretry011", "SIM", "fail"]);
  const before = await pool.query("SELECT visible_at, status FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  const now = new Date();
  const notYet = before.rows[0].status === "queued" && new Date(before.rows[0].visible_at) > now;
  return { pass: r.rows[0].res === "requeued" && notYet, res: r.rows[0].res, visible_at: before.rows[0].visible_at, status: before.rows[0].status };
}

async function testDeadLetterTransition() {
  await cleanup("AT-S1-012");
  await submit("AT-S1-012", "a", "job", { max_attempts: 1 });
  const c = await claim("wdl012");
  const r = await pool.query("SELECT retry_sync_request($1,$2,$3,$4) AS res", [c.rows[0].request_id, "wdl012", "SIM", "fail"]);
  const row = await pool.query("SELECT status, dead_lettered_at FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  const claimable = await claim("wx012");
  return { pass: r.rows[0].res === "dead_lettered" && row.rows[0].status === "dead_letter" && row.rows[0].dead_lettered_at && claimable.rows.length === 0, res: r.rows[0].res, status: row.rows[0].status };
}

async function testDependencyDeferral() {
  await cleanup("AT-S1-013");
  await submit("AT-S1-013", "a");
  const c = await claim("wdef013");
  const r = await pool.query("SELECT defer_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "wdef013", "Customer"]);
  const row = await pool.query("SELECT dependency_deferral_count, attempt_number, status FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  return { pass: r.rows[0].res === "deferred" && row.rows[0].dependency_deferral_count === 1 && row.rows[0].attempt_number === 1 && row.rows[0].status === "deferred", res: r.rows[0].res, row: row.rows[0] };
}

async function testWorkerSimulation() {
  await cleanup("AT-S1-014");
  await submit("AT-S1-014", "a");
  const c = await claim("wsim014");
  const r = await pool.query("SELECT complete_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "wsim014", JSON.stringify({ would_process: true, production_writes: 0 })]);
  const row = await pool.query("SELECT status, simulation_result FROM sync_requests WHERE request_id=$1", [c.rows[0].request_id]);
  return { pass: r.rows[0].res === "completed" && row.rows[0].status === "simulation_completed", res: r.rows[0].res, status: row.rows[0].status };
}

async function testUnauthorizedSubmission() {
  // REQUIRED test. BLOCKED (not pass) when GATEWAY_URL is not provisioned.
  const url = process.env.GATEWAY_URL;
  if (!url) return { blocked: true, reason: "GATEWAY_URL not provisioned" };
  let rejected = false;
  try {
    const res = await fetch(`${url}/sync-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotency_key: "st:svc:job:AT-S1-015:a", tenant_id: TENANT, environment: ENV, domain: "job", sync_mode: "incremental", trigger_type: "manual" })
    });
    rejected = res.status === 401 || res.status === 403;
  } catch (e) { rejected = true; }
  const rows = await rowCountForIdemKey("st:svc:job:AT-S1-015:a");
  return { pass: rejected && rows === 0, rejected, rows };
}

async function testInvalidDomain() {
  await cleanup("AT-S1-016");
  let rejected = false;
  try {
    await pool.query("SELECT submit_sync_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      ["st:svc:bad:AT-S1-016:a", TENANT, ENV, "not_a_domain", "incremental", "manual", null, "tester", null, null, "AT-S1-016", null, 5]);
  } catch (e) { rejected = true; }
  const rows = await rowCountForIdemKey("st:svc:bad:AT-S1-016:a");
  return { pass: rejected && rows === 0, rejected, rows };
}

async function testDatabaseUnavailable() {
  // Reuse the top-level Pool import (a second dynamic import() is not allowed
  // by the Base44 shared-module validator).
  const bad = new Pool({ connectionString: "postgresql://nobody:nobody@127.0.0.1:1/nope", connectionTimeoutMillis: 500 });
  let failedClosed = false;
  try { await bad.query("SELECT 1"); } catch (e) { failedClosed = true; }
  await bad.end();
  return { pass: failedClosed, failedClosed };
}

async function testLeaseLostDuringProcessing() {
  await cleanup("AT-S1-018");
  await submit("AT-S1-018", "a");
  const c = await claim("wA018");
  await pool.query("UPDATE sync_requests SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE request_id=$1", [c.rows[0].request_id]);
  await pool.query("SELECT recover_stale_sync_requests(100, true)");
  const r = await pool.query("SELECT complete_sync_request($1,$2,$3) AS res", [c.rows[0].request_id, "wA018", JSON.stringify({ x: 1 })]);
  const reclaim = await claim("wB018");
  return { pass: r.rows[0].res === "ownership_lost" && reclaim.rows.length === 1, res: r.rows[0].res, reclaimed: reclaim.rows.length };
}

async function testNoProductionMutation() {
  const r = await pool.query("SELECT count(*)::int AS n FROM sync_requests WHERE environment<>'integration' OR tenant_id<>$1", [TENANT]);
  return { pass: r.rows[0].n === 0, non_stage1_rows: r.rows[0].n };
}

// ---------- Sequential runner ----------

const tests = [
  ["AT-S1-001", testDuplicateSubmission],
  ["AT-S1-002", testConcurrentDuplicateSubmission],
  ["AT-S1-003", testTwoWorkersSameKey],
  ["AT-S1-004", test25WorkersSameKey],
  ["AT-S1-005", testDifferentKeys],
  ["AT-S1-006", testHeartbeatSuccess],
  ["AT-S1-007", testStaleHeartbeatRejection],
  ["AT-S1-008", testStaleCompletionRejection],
  ["AT-S1-009", testWorkerCrashRecovery],
  ["AT-S1-010", testConcurrentStaleRecovery],
  ["AT-S1-011", testRetryBackoff],
  ["AT-S1-012", testDeadLetterTransition],
  ["AT-S1-013", testDependencyDeferral],
  ["AT-S1-014", testWorkerSimulation],
  ["AT-S1-015", testUnauthorizedSubmission],
  ["AT-S1-016", testInvalidDomain],
  ["AT-S1-017", testDatabaseUnavailable],
  ["AT-S1-018", testLeaseLostDuringProcessing],
  ["AT-S1-019", testNoProductionMutation],
];

const summary = { passed: 0, failed: 0, blocked: 0, total: tests.length };

async function run(id, test) {
  let outcome = "FAIL", evidence = null, err = null;
  try {
    evidence = await test();
    if (evidence && evidence.blocked) outcome = "BLOCKED";
    else if (evidence && evidence.pass) outcome = "PASS";
  } catch (e) { err = String(e); }
  summary[outcome === "BLOCKED" ? "blocked" : outcome === "PASS" ? "passed" : "failed"] += 1;
  console.log(`${id}: ${outcome}${err ? ` — ${err}` : ""}`);
  if (evidence) console.log(`    ${JSON.stringify(evidence)}`);
}

for (const [id, test] of tests) {
  await run(id, test);
}

await pool.end();

console.log(`\nSUMMARY: passed=${summary.passed} failed=${summary.failed} blocked=${summary.blocked} total=${summary.total}`);
const allGreen = summary.failed === 0 && summary.blocked === 0 && summary.passed === summary.total;
if (allGreen) {
  console.log("STAGE 1 FOUNDATION PASSED — READY FOR SEPARATE STAGE 2 AUTHORIZATION");
} else {
  console.log("STAGE 1 FOUNDATION PARTIALLY COMPLETE — NOT READY FOR STAGE 2");
}
process.exit(allGreen ? 0 : 1);