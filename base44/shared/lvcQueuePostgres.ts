// ============================================================
// lvcQueuePostgres.ts — LVC OS Stage 1 PostgreSQL Queue Adapter
// ============================================================
// SINGLE, ISOLATED PostgreSQL connection adapter for the Stage 1
// durable work queue. Every Base44 backend function that needs to
// reach the Railway PostgreSQL Stage 1 queue MUST go through this
// module. When LVC OS migrates away from Base44, only this file is
// replaced.
//
// Runtime: Base44 backend = Deno. PostgreSQL client: node-postgres
// (`npm:pg@8.13.0`), a versioned npm specifier supported by the
// Base44 Deno runtime. Raw `Deno.connect` is NOT available to backend
// functions; node-postgres reaches Railway through the runtime's
// `node:net` compatibility layer.
//
// Security:
//   - Connection string read ONLY from Base44 secret
//     LVC_QUEUE_DATABASE_URL (via base44:runtime `secrets`).
//     Optional CA from LVC_QUEUE_DATABASE_CA.
//     Never hardcoded, logged, or returned.
//   - All SQL uses parameterized queries ($1..$n).
//   - Errors are sanitized (URLs/passwords/PGPASSWORD redacted) and
//     categorized; raw error objects/messages are never surfaced.
//   - Production pool (getPool) is FAIL-CLOSED: ssl rejectUnauthorized
//     true (with CA if provided). It NEVER falls back to plaintext.
//   - Diagnostic connection tests (Tests A-F) live ONLY inside the
//     owner-only verification function and use transient Client
//     instances (not a per-invocation pool) — clearly non-production.
//   - Clients/connections are end()ed in finally blocks; no
//     transactions are left open.
//
// Stage 1 queue functions wrapped (exact installed names/signatures):
//   submit_sync_request, claim_sync_request, heartbeat_sync_request,
//   complete_sync_request, retry_sync_request, defer_sync_request,
//   dead_letter_sync_request, recover_stale_sync_requests,
//   list_dead_letters.
// ============================================================

import pg from "npm:pg@8.13.0";
import { secrets } from "base44:runtime";

const { Pool, Client } = pg as any;

const SECRET_NAME = "LVC_QUEUE_DATABASE_URL";
const CA_SECRET_NAME = "LVC_QUEUE_DATABASE_CA";
const CONNECTION_TIMEOUT_MS = 10000;
const MAX_POOL_SIZE = 5;
const IDLE_TIMEOUT_MS = 30000;

export const EXPECTED_QUEUE_FUNCTIONS = [
  "submit_sync_request",
  "claim_sync_request",
  "heartbeat_sync_request",
  "complete_sync_request",
  "retry_sync_request",
  "defer_sync_request",
  "dead_letter_sync_request",
  "recover_stale_sync_requests",
  "list_dead_letters",
];

export const EXPECTED_QUEUE_VIEWS = [
  "vq_queue_depth",
  "vq_oldest_queued_age",
  "vq_leases",
  "vq_dead_letter_count",
  "vq_inflight_per_key",
];

let pool: any = null;
let cachedConnString: string | null = null;

// ---- Secret management -------------------------------------------------

export function hasSecret(): boolean {
  const v = secrets.get(SECRET_NAME);
  return !!v && typeof v === "string" && v.trim() !== "";
}

function readConnectionString(): string {
  const v = secrets.get(SECRET_NAME);
  if (!v || typeof v !== "string" || v.trim() === "") {
    const err = new Error("missing_secret");
    (err as any).code = "missing_secret";
    throw err;
  }
  return v.trim();
}

// ---- Sanitization + categorization -------------------------------------

export function sanitizeMessage(msg: unknown): string {
  return String(msg ?? "")
    .replace(/postgresql:\/\/[^\s]*/gi, "[redacted-url]")
    .replace(/postgres:\/\/[^\s]*/gi, "[redacted-url]")
    .replace(/password=[^\s&]*/gi, "password=[redacted]")
    .replace(/PGPASSWORD=\S+/gi, "PGPASSWORD=[redacted]");
}

/**
 * Categorize an error. `attemptedSsl` = the test attempted a TLS
 * connection; `serverSslOn` = the server's `SHOW ssl` result (null if
 * unknown). Used to disambiguate generic "Connection terminated" into
 * ssl_not_supported vs ssl_required vs tls_handshake_failed.
 */
export function categorizeError(e: any, attemptedSsl: boolean | null = null, serverSslOn: boolean | null = null): string {
  const msg = String(e?.message || e?.code || e?.name || "");
  const code = String(e?.code || "");
  if (/missing_secret/.test(code) || /missing_secret/.test(msg)) return "configuration_conflict";
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return "connection_timeout";
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|getaddrinfo|EAI_AGAIN|EAI_NODATA/i.test(msg)) return "tcp_unreachable";
  if (/authentication|password auth|role does not exist|28P01|28000|fatal: .*password/i.test(msg)) return "authentication_failed";
  if (/unable to verify|self.signed|SELF_SIGNED|UNABLE_TO_VERIFY|CERT_NOT_YET_VALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED/i.test(msg)) return "certificate_untrusted";
  if (/hostname|altname|ERR_TLS_CERT_ALTNAME|does not match|IP address mismatch/i.test(msg)) return "hostname_verification_failed";
  if (/sslmode|conflict|invalid ssl mode|both ssl/i.test(msg)) return "configuration_conflict";
  if (/ssl|tls|handshake|protocol version|no shared cipher|unsupported secure transport/i.test(msg)) return "tls_handshake_failed";
  if (/terminated|reset|closed|aborted|ECONNRESET|EPIPE|socket hang up/i.test(msg)) {
    if (attemptedSsl === true && serverSslOn === false) return "ssl_not_supported";
    if (attemptedSsl === false && serverSslOn === true) return "ssl_required";
    if (attemptedSsl === true) return "tls_handshake_failed";
    return "connection_terminated";
  }
  return "unknown";
}

// ---- URL property inspection (non-secret only) ------------------------

export interface UrlProperties {
  protocol_present: boolean;
  hostname_present: boolean;
  port_present: boolean;
  database_path_present: boolean;
  sslmode_present: boolean;
  is_railway_public_proxy: boolean;
}

function internalUrlSslmode(connStr: string): string | null {
  try {
    const u = new URL(connStr);
    const m = u.searchParams.get("sslmode");
    return m || null;
  } catch {
    return null;
  }
}

export function inspectUrlProperties(): UrlProperties {
  try {
    const connStr = readConnectionString();
    const u = new URL(connStr);
    const host = u.hostname || "";
    return {
      protocol_present: /^(postgresql|postgres)$/i.test(u.protocol.replace(":", "")),
      hostname_present: !!host,
      port_present: !!u.port,
      database_path_present: !!u.pathname && u.pathname !== "/" && u.pathname !== "",
      sslmode_present: u.searchParams.has("sslmode"),
      is_railway_public_proxy: /\.db\.railway\.app$/i.test(host) || /\.proxy\.rlwy\.net$/i.test(host) || /\.rlwy\.net$/i.test(host),
    };
  } catch (e: any) {
    if (String(e?.code) === "missing_secret") {
      const err = new Error("missing_secret"); (err as any).code = "missing_secret"; throw err;
    }
    return {
      protocol_present: false, hostname_present: false, port_present: false,
      database_path_present: false, sslmode_present: false, is_railway_public_proxy: false,
    };
  }
}

// ---- Server SSL state inspection (via working connection) -------------

export interface ServerSslState {
  reachable: boolean;
  postgres_ssl_enabled: boolean | null;
  ssl_min_protocol_version: string | null;
  ssl_max_protocol_version: string | null;
  session_ssl: boolean | null;
  error_category: string | null;
}

export async function inspectServerSsl(): Promise<ServerSslState> {
  const connStr = readConnectionString();
  const client = new Client({
    connectionString: connStr,
    ssl: false,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  const start = Date.now();
  try {
    await client.connect();
    const show = await client.query("SHOW ssl");
    const postgres_ssl_enabled = /^(on|true|yes)$/i.test(String(show.rows[0]?.ssl || ""));
    let ssl_min: string | null = null;
    let ssl_max: string | null = null;
    try {
      const mn = await client.query("SHOW ssl_min_protocol_version");
      ssl_min = mn.rows[0]?.ssl_min_protocol_version || null;
      const mx = await client.query("SHOW ssl_max_protocol_version");
      ssl_max = mx.rows[0]?.ssl_max_protocol_version || null;
    } catch { /* older PostgreSQL */ }
    const sess = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    const session_ssl = !!sess.rows[0]?.ssl;
    return { reachable: true, postgres_ssl_enabled, ssl_min_protocol_version: ssl_min, ssl_max_protocol_version: ssl_max, session_ssl, error_category: null };
  } catch (e: any) {
    return { reachable: false, postgres_ssl_enabled: null, ssl_min_protocol_version: null, ssl_max_protocol_version: null, session_ssl: null, error_category: categorizeError(e, false, null) };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

// ---- Connection diagnostic tests (A-F) --------------------------------

function normalizeUrlSslmode(connStr: string, sslmode: string): string {
  const u = new URL(connStr);
  u.searchParams.delete("sslmode");
  u.searchParams.delete("ssl");
  u.searchParams.set("sslmode", sslmode);
  return u.toString();
}

export interface DiagnosticResult {
  test_name: string;
  connected: boolean;
  encrypted: boolean;
  error_category: string | null;
  session_ssl: boolean | null;
  certificate_verification_enabled: boolean;
  elapsed_ms: number;
}

interface TestDef {
  name: string;
  attemptedSsl: boolean;
  certVerify: boolean;
  buildConfig: (connStr: string) => any;
}

function internalHost(connStr: string): string {
  try { return new URL(connStr).hostname || ""; } catch { return ""; }
}

const TESTS: TestDef[] = [
  { name: "A_url_settings_only", attemptedSsl: null as any, certVerify: false, buildConfig: (c) => ({ connectionString: c }) },
  { name: "B_ssl_verify_true", attemptedSsl: true, certVerify: true, buildConfig: (c) => ({ connectionString: c, ssl: { rejectUnauthorized: true } }) },
  { name: "C_ssl_no_verify", attemptedSsl: true, certVerify: false, buildConfig: (c) => ({ connectionString: c, ssl: { rejectUnauthorized: false } }) },
  { name: "D_sslmode_require", attemptedSsl: true, certVerify: false, buildConfig: (c) => ({ connectionString: normalizeUrlSslmode(c, "require") }) },
  { name: "E_sslmode_verify_full", attemptedSsl: true, certVerify: true, buildConfig: (c) => ({ connectionString: normalizeUrlSslmode(c, "verify-full") }) },
  { name: "F_no_ssl", attemptedSsl: false, certVerify: false, buildConfig: (c) => ({ connectionString: c, ssl: false }) },
  { name: "G_ssl_servername_no_verify", attemptedSsl: true, certVerify: false, buildConfig: (c) => ({ connectionString: c, ssl: { rejectUnauthorized: false, servername: internalHost(c) } }) },
  { name: "H_ssl_servername_verify", attemptedSsl: true, certVerify: true, buildConfig: (c) => ({ connectionString: c, ssl: { rejectUnauthorized: true, servername: internalHost(c) } }) },
  { name: "I_ssl_servername_min_tls12", attemptedSsl: true, certVerify: false, buildConfig: (c) => ({ connectionString: c, ssl: { rejectUnauthorized: false, servername: internalHost(c), minVersion: "TLSv1.2" } }) },
];

async function runOneTest(def: TestDef, connStr: string, serverSslOn: boolean | null): Promise<DiagnosticResult> {
  const start = Date.now();
  const client = new Client({ ...def.buildConfig(connStr), connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  let connected = false;
  let encrypted = false;
  let sessionSsl: boolean | null = null;
  let rawError: any = null;
  try {
    await client.connect();
    connected = true;
    const sess = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    sessionSsl = !!sess.rows[0]?.ssl;
    encrypted = !!sessionSsl;
  } catch (e: any) {
    rawError = e;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
  // Resolve attemptedSsl for Test A from the URL sslmode.
  let attempted = def.attemptedSsl;
  if (def.name === "A_url_settings_only") {
    const m = internalUrlSslmode(connStr);
    attempted = !!(m && !/^(disable|allow|prefer)$/i.test(m));
  }
  const error_category = rawError ? categorizeError(rawError, attempted, serverSslOn) : null;
  return {
    test_name: def.name,
    connected,
    encrypted,
    error_category,
    session_ssl: connected ? sessionSsl : null,
    certificate_verification_enabled: def.certVerify,
    elapsed_ms: Date.now() - start,
  };
}

export async function runConnectionDiagnostics(serverSslOn: boolean | null): Promise<DiagnosticResult[]> {
  const connStr = readConnectionString();
  const results: DiagnosticResult[] = [];
  for (const def of TESTS) {
    results.push(await runOneTest(def, connStr, serverSslOn));
  }
  return results;
}

// ---- Schema inspection on a chosen connection method ------------------

interface SchemaInspection {
  database: string | null;
  database_user: string | null;
  server_timestamp: string | null;
  session_ssl: boolean | null;
  queue_table_found: boolean;
  functions_found: string[];
  views_found: string[];
  missing_functions: string[];
  missing_views: string[];
}

async function inspectSchemaWith(config: any): Promise<SchemaInspection> {
  const client = new Client({ ...config, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  try {
    await client.connect();
    const b = await client.query("SELECT current_database() AS db, current_user AS usr, now() AS ts");
    const sess = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    const tableRes = await client.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
      ["sync_requests"]
    );
    const fnRes = await client.query(
      "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])",
      [EXPECTED_QUEUE_FUNCTIONS]
    );
    const viewRes = await client.query(
      "SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [EXPECTED_QUEUE_VIEWS]
    );
    const fns = fnRes.rows.map((r: any) => r.proname);
    const views = viewRes.rows.map((r: any) => r.table_name);
    const ts = b.rows[0].ts;
    return {
      database: b.rows[0].db,
      database_user: b.rows[0].usr,
      server_timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
      session_ssl: !!sess.rows[0]?.ssl,
      queue_table_found: !!tableRes.rows[0].exists,
      functions_found: fns,
      views_found: views,
      missing_functions: EXPECTED_QUEUE_FUNCTIONS.filter((f) => !fns.includes(f)),
      missing_views: EXPECTED_QUEUE_VIEWS.filter((v) => !views.includes(v)),
    };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

// ---- Full verification orchestration -----------------------------------

export interface VerificationResult {
  connected: boolean;
  secure_connection: boolean;
  encrypted: boolean;
  certificate_verified: boolean;
  connection_method: string | null;
  database: string | null;
  database_user: string | null;
  server_timestamp: string | null;
  postgres_ssl_enabled: boolean | null;
  session_ssl: boolean | null;
  queue_table_found: boolean;
  functions_found: string[];
  views_found: string[];
  missing_functions: string[];
  missing_views: string[];
  diagnostic_results: DiagnosticResult[];
  url_properties: UrlProperties | null;
  server_ssl_state: ServerSslState | null;
  error_category: string | null;
  error: string | null;
}

function secureConfigFromMethod(method: string, connStr: string): any {
  switch (method) {
    case "B_ssl_verify_true": return { connectionString: connStr, ssl: { rejectUnauthorized: true } };
    case "E_sslmode_verify_full": return { connectionString: normalizeUrlSslmode(connStr, "verify-full") };
    default: return { connectionString: connStr, ssl: { rejectUnauthorized: true } };
  }
}

export async function verifyQueue(): Promise<VerificationResult> {
  const base: VerificationResult = {
    connected: false, secure_connection: false, encrypted: false, certificate_verified: false,
    connection_method: null, database: null, database_user: null, server_timestamp: null,
    postgres_ssl_enabled: null, session_ssl: null,
    queue_table_found: false, functions_found: [], views_found: [],
    missing_functions: [], missing_views: [],
    url_properties: null, server_ssl_state: null, diagnostic_results: [],
    error_category: null, error: null,
  };

  if (!hasSecret()) {
    base.error_category = "missing_secret";
    base.error = "missing_secret";
    return base;
  }

  try {
    base.url_properties = inspectUrlProperties();
  } catch (e: any) {
    if (String(e?.code) === "missing_secret") {
      base.error_category = "missing_secret"; base.error = "missing_secret"; return base;
    }
    base.url_properties = null;
  }

  const connStr = readConnectionString();

  // Server SSL state via the known-working plaintext connection.
  const serverState = await inspectServerSsl();
  base.server_ssl_state = serverState;
  base.postgres_ssl_enabled = serverState.postgres_ssl_enabled;

  // Run all six diagnostic tests.
  const diags = await runConnectionDiagnostics(serverState.postgres_ssl_enabled);
  base.diagnostic_results = diags;

  // Pick the best SECURE method: encrypted AND certificate verified.
  const secureDiag = diags.find(
    (d) => d.connected && d.encrypted && d.certificate_verification_enabled && d.session_ssl === true
  );

  // Pick a reachable method for schema inspection (prefer secure, else no_ssl).
  const anyConnectedDiag = secureDiag || diags.find((d) => d.connected) || null;

  if (secureDiag) {
    const cfg = secureConfigFromMethod(secureDiag.test_name, connStr);
    const schema = await inspectSchemaWith(cfg);
    base.connected = true;
    base.secure_connection = true;
    base.encrypted = true;
    base.certificate_verified = true;
    base.connection_method = secureDiag.test_name;
    base.database = schema.database;
    base.database_user = schema.database_user;
    base.server_timestamp = schema.server_timestamp;
    base.session_ssl = schema.session_ssl;
    base.queue_table_found = schema.queue_table_found;
    base.functions_found = schema.functions_found;
    base.views_found = schema.views_found;
    base.missing_functions = schema.missing_functions;
    base.missing_views = schema.missing_views;
    return base;
  }

  if (anyConnectedDiag) {
    // Reachable but NOT secure. Reuse the EXACT config that connected
    // (plaintext or otherwise) for read-only schema inspection, to report
    // table/functions/views status. This is diagnostic only and does NOT
    // authorize production use.
    const anyConnectedDef = TESTS.find((t) => t.name === anyConnectedDiag.test_name) || null;
    const cfg = anyConnectedDef ? anyConnectedDef.buildConfig(connStr) : { connectionString: connStr, ssl: false };
    let schema: SchemaInspection | null = null;
    try { schema = await inspectSchemaWith(cfg); } catch { schema = null; }
    base.connected = true;
    base.secure_connection = false;
    base.encrypted = !!anyConnectedDiag.encrypted;
    base.certificate_verified = false;
    base.connection_method = anyConnectedDiag.test_name;
    base.session_ssl = anyConnectedDiag.session_ssl;
    if (schema) {
      base.database = schema.database;
      base.database_user = schema.database_user;
      base.server_timestamp = schema.server_timestamp;
      base.queue_table_found = schema.queue_table_found;
      base.functions_found = schema.functions_found;
      base.views_found = schema.views_found;
      base.missing_functions = schema.missing_functions;
      base.missing_views = schema.missing_views;
    }
    // Server SSL is ON but every TLS handshake fails -> runtime node:tls
    // incompatibility. If server SSL were OFF, this would be ssl_not_supported.
    base.error_category = serverState.postgres_ssl_enabled === false ? "ssl_not_supported" : "tls_handshake_failed";
    base.error = "reachable_not_secure";
    return base;
  }

  base.connected = false;
  base.error_category = diags.length ? diags[diags.length - 1].error_category : "unknown";
  base.error = "connection_failed";
  return base;
}

// ---- Production pool (FAIL-CLOSED, verified TLS) ----------------------

function getPool(): any {
  const connStr = readConnectionString();
  if (pool && cachedConnString === connStr) return pool;
  if (pool) { try { pool.end(); } catch { /* ignore */ } pool = null; }
  const ca = secrets.get(CA_SECRET_NAME);
  const ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  pool = new Pool({
    connectionString: connStr,
    ssl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    max: MAX_POOL_SIZE,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  cachedConnString = connStr;
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    try { await pool.end(); } catch { /* ignore */ }
    pool = null; cachedConnString = null;
  }
}

async function runQuery(sql: string, params: any[]): Promise<any> {
  const p = getPool();
  const client = await p.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ---- Narrowly scoped wrappers for installed Stage 1 functions ----------

export interface SubmitArgs {
  idempotency_key: string; tenant_id: string; environment: string; domain: string;
  sync_mode: string; trigger_type: string; source_event_id?: string | null;
  requested_by?: string | null; window_start?: string | null; window_end?: string | null;
  correlation_id?: string | null; payload_json?: any | null; max_attempts?: number;
}

export async function submitSyncRequest(a: SubmitArgs): Promise<{ outcome: string; request_id: string }> {
  const res = await runQuery(
    "SELECT outcome, request_id FROM submit_sync_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [
      a.idempotency_key, a.tenant_id, a.environment, a.domain, a.sync_mode, a.trigger_type,
      a.source_event_id ?? null, a.requested_by ?? null, a.window_start ?? null, a.window_end ?? null,
      a.correlation_id ?? null, a.payload_json != null ? JSON.stringify(a.payload_json) : null, a.max_attempts ?? 5,
    ]
  );
  return res.rows[0];
}

export async function claimSyncRequest(workerId: string, leaseDurationS = 120): Promise<any | null> {
  const res = await runQuery("SELECT * FROM claim_sync_request($1,$2)", [workerId, leaseDurationS]);
  return res.rows[0] ?? null;
}

export async function heartbeatSyncRequest(requestId: string, workerId: string, leaseDurationS = 120): Promise<string> {
  const res = await runQuery("SELECT heartbeat_sync_request($1,$2,$3) AS result", [requestId, workerId, leaseDurationS]);
  return res.rows[0].result;
}

export async function completeSyncRequest(requestId: string, workerId: string, simulationResult?: any | null): Promise<string> {
  const res = await runQuery(
    "SELECT complete_sync_request($1,$2,$3::jsonb) AS result",
    [requestId, workerId, simulationResult != null ? JSON.stringify(simulationResult) : null]
  );
  return res.rows[0].result;
}

export async function retrySyncRequest(requestId: string, workerId: string, errorCode: string, errorMessage: string): Promise<string> {
  const res = await runQuery("SELECT retry_sync_request($1,$2,$3,$4) AS result", [requestId, workerId, errorCode, errorMessage]);
  return res.rows[0].result;
}

export async function deferSyncRequest(requestId: string, workerId: string, missingDependency: string, deferralDelayS = 30): Promise<string> {
  const res = await runQuery("SELECT defer_sync_request($1,$2,$3,$4) AS result", [requestId, workerId, missingDependency, deferralDelayS]);
  return res.rows[0].result;
}

export async function deadLetterSyncRequest(requestId: string, workerId: string, errorCode: string, errorMessage: string): Promise<string> {
  const res = await runQuery("SELECT dead_letter_sync_request($1,$2,$3,$4) AS result", [requestId, workerId, errorCode, errorMessage]);
  return res.rows[0].result;
}

export async function recoverStaleSyncRequests(batchLimit = 100, immediateVisible = false): Promise<any[]> {
  const res = await runQuery("SELECT * FROM recover_stale_sync_requests($1,$2)", [batchLimit, immediateVisible]);
  return res.rows;
}

export async function listDeadLetters(tenantId: string | null = null, domain: string | null = null, limit = 100): Promise<any[]> {
  const res = await runQuery("SELECT * FROM list_dead_letters($1,$2,$3)", [tenantId, domain, limit]);
  return res.rows;
}