/* global process */
/**
 * Stage 1 non-writing worker.
 *
 * UNPROVISIONED ARTIFACT. Cannot run until the owner provisions a
 * PostgreSQL instance, applies 01-06 SQL, and deploys an authenticated
 * submission gateway. This worker NEVER calls production sync handlers
 * in write mode, NEVER creates/updates/deletes production LVC OS
 * entities, and NEVER advances production watermarks. It records a
 * non-writing simulation result only.
 *
 * Runtime: this artifact is written as ESM with an esm.sh URL import. In a
 * real Node deployment the owner installs `pg` (`npm i pg`) and replaces
 * the import line below with:
 *     import { Pool } from "pg";
 *
 * Env:
 *   DATABASE_URL              — Postgres connection string
 *   WORKER_ID                 — unique worker identity
 *   POLL_INTERVAL_MS          — default 2000
 *   HEARTBEAT_INTERVAL_MS     — default 30000
 *   LEASE_DURATION_S          — default 120
 *   SHADOW_ONLY               — must be "true" for Stage 1
 */

import { Pool } from "https://esm.sh/pg";

const DATABASE_URL = process.env.DATABASE_URL;
const WORKER_ID = process.env.WORKER_ID || `w-${process.pid}-${Date.now()}`;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "2000", 10);
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || "30000", 10);
const LEASE_DURATION_S = parseInt(process.env.LEASE_DURATION_S || "120", 10);
const SHADOW_ONLY = (process.env.SHADOW_ONLY || "true") === "true";

if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
if (!SHADOW_ONLY) {
  console.error("Stage 1 worker requires SHADOW_ONLY=true");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

let stopping = false;
function gracefulShutdown() { stopping = true; }
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function heartbeatLoop(requestId, stopFlagRef) {
  while (!stopFlagRef.stopped && !stopping) {
    await sleep(HEARTBEAT_INTERVAL_MS);
    if (stopFlagRef.stopped || stopping) return;
    try {
      const r = await pool.query(
        "SELECT heartbeat_sync_request($1, $2, $3) AS result",
        [requestId, WORKER_ID, LEASE_DURATION_S]
      );
      if (r.rows[0].result !== "renewed") {
        stopFlagRef.stopped = true;
        console.log(JSON.stringify({
          event: "lease_lost", request_id: requestId, worker_id: WORKER_ID,
          heartbeat_result: r.rows[0].result
        }));
        return;
      }
    } catch (e) {
      stopFlagRef.stopped = true;
      console.log(JSON.stringify({ event: "heartbeat_error", request_id: requestId, error: String(e) }));
      return;
    }
  }
}

function buildSimulationResult(claimed) {
  return {
    would_process: true,
    tenant_id: claimed.tenant_id,
    domain: claimed.domain,
    sync_mode: claimed.sync_mode,
    window_start: claimed.window_start,
    window_end: claimed.window_end,
    production_writes: 0,
    shadow_only: true
  };
}

async function processOne() {
  const claimedRes = await pool.query("SELECT * FROM claim_sync_request($1, $2)", [WORKER_ID, LEASE_DURATION_S]);
  if (claimedRes.rows.length === 0) return false;
  const claimed = claimedRes.rows[0];
  const stopFlag = { stopped: false };
  const hb = heartbeatLoop(claimed.request_id, stopFlag);

  try {
    const sim = buildSimulationResult(claimed);
    const payload = claimed.payload_json || {};

    if (payload.simulate_defer === true) {
      const d = await pool.query(
        "SELECT defer_sync_request($1,$2,$3) AS result",
        [claimed.request_id, WORKER_ID, payload.missing_dependency || "test-dependency"]
      );
      stopFlag.stopped = true;
      console.log(JSON.stringify({ event: "deferred", request_id: claimed.request_id, result: d.rows[0].result }));
      return true;
    }
    if (payload.simulate_retryable_failure === true) {
      const d = await pool.query(
        "SELECT retry_sync_request($1,$2,$3,$4) AS result",
        [claimed.request_id, WORKER_ID, "SIMULATED_FAILURE", "stage1 simulated retryable failure"]
      );
      stopFlag.stopped = true;
      console.log(JSON.stringify({ event: "retried", request_id: claimed.request_id, result: d.rows[0].result }));
      return true;
    }

    const c = await pool.query(
      "SELECT complete_sync_request($1,$2,$3) AS result",
      [claimed.request_id, WORKER_ID, JSON.stringify(sim)]
    );
    stopFlag.stopped = true;
    console.log(JSON.stringify({
      event: "simulation_completed", request_id: claimed.request_id,
      worker_id: WORKER_ID, result: c.rows[0].result, production_writes: 0
    }));
  } catch (e) {
    stopFlag.stopped = true;
    try {
      await pool.query(
        "SELECT retry_sync_request($1,$2,$3,$4)",
        [claimed.request_id, WORKER_ID, "WORKER_EXCEPTION", String(e).slice(0, 2000)]
      );
    } catch (_) { /* recovery sweep handles it */ }
    console.log(JSON.stringify({ event: "worker_exception", request_id: claimed.request_id, error: String(e) }));
  } finally {
    await hb;
  }
  return true;
}

async function loop() {
  console.log(JSON.stringify({ event: "worker_start", worker_id: WORKER_ID, shadow_only: true }));
  while (!stopping) {
    try {
      const got = await processOne();
      if (!got) await sleep(POLL_INTERVAL_MS);
    } catch (e) {
      console.log(JSON.stringify({ event: "loop_error", error: String(e) }));
      await sleep(POLL_INTERVAL_MS);
    }
  }
  await pool.end();
  console.log(JSON.stringify({ event: "worker_stop", worker_id: WORKER_ID }));
}

loop().catch((e) => { console.error(e); process.exit(1); });