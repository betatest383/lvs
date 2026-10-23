/**
 * Focused unit tests for the Stage 2E.7 Request Ledger foundation module
 * (Foundation Slice 1).
 *
 * Repository-only, deterministic, mocked. Zero ServiceTitan contact, zero
 * Base44 contact, zero network. Exercises: phase transitions, terminal
 * enforcement, association binding, atomic cache publication + quarantine,
 * environment-aware URL classification, bounded fetch happy/failure paths.
 *
 * Test-only.
 */

import {
  createHandle,
  validateLedgerCompleteness,
  classifyRequestUrl,
  publishCacheAtomically,
  evaluateCachedToken,
  validateClockNow,
  validateAccessToken,
  validateTokenType,
  validateExpiresIn,
  computeLifetimeAndExpiry,
  computeStableRefreshMargin,
  isCachedToken,
  createInstrumentedFetch,
  boundedGetPage,
  extractRecords,
  isValidPagination,
  ClockDependencyError,
  TransportError,
  HttpResponseError,
  MalformedResponseJsonError,
  MalformedResponseShapeError,
  InvalidRecordCollectionError,
  MalformedPaginationError,
  LedgerAssociationError,
  OwnedLedgerIncompleteError,
  MetadataCompletionError,
  type InstrumentedFetchContext,
  type RequestLedgerEntry,
  type TokenState,
  type ClockState,
  type CachedToken,
  type LedgerClassification,
} from "../../../shared/stSync/stStage2E7RequestLedger.ts";

type TestResult = { id: string; passed: boolean; expected: string; actual: string };
const results: TestResult[] = [];
function check(id: string, passed: boolean, expected: string, actual: string): void {
  results.push({ id, passed, expected, actual });
}

function makeEntry(classification: LedgerClassification = "authentication"): RequestLedgerEntry {
  return {
    key: { instrumentationId: "00000000-0000-0000-0000-000000000001", requestNumber: 1 },
    classification,
    phase: "CREATED",
    transport: null, parse: null, authValidation: null, shape: null,
    records: null, pagination: null, metadata: null, corruption: null,
  };
}

// ── Phase transitions & terminal enforcement ──────────────────────────────────

function testPhaseTransitions(): void {
  // completeHttpResponse 2xx → HTTP_RECEIVED
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    const r = h.completeHttpResponse(200);
    check("RL-001", r.ok && e.phase === "HTTP_RECEIVED", "2xx → HTTP_RECEIVED", `phase=${e.phase},ok=${r.ok}`);
  }
  // completeHttpResponse non-2xx auth → AUTH_HTTP_REJECTED (terminal)
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    h.completeHttpResponse(401);
    check("RL-002", e.phase === "AUTH_HTTP_REJECTED", "auth 401 → AUTH_HTTP_REJECTED", `phase=${e.phase}`);
  }
  // completeHttpResponse non-2xx business → BUSINESS_HTTP_REJECTED (terminal)
  {
    const e = makeEntry("business");
    const h = createHandle(e);
    h.completeHttpResponse(500);
    check("RL-003", e.phase === "BUSINESS_HTTP_REJECTED", "business 500 → BUSINESS_HTTP_REJECTED", `phase=${e.phase}`);
  }
  // Invalid HTTP status rejected before mutation
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    const r = h.completeHttpResponse(999 as number);
    check("RL-004", !r.ok && e.phase === "CREATED" && e.transport === null, "invalid status → no mutation", `ok=${r.ok},phase=${e.phase}`);
  }
  // AUTH_VALIDATED is NONTERMINAL
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    h.completeHttpResponse(200);
    h.completeBodyParseSuccess();
    h.completeAuthValidated();
    const comp = validateLedgerCompleteness([e]);
    check("RL-005", !comp.complete, "AUTH_VALIDATED is nonterminal", `complete=${comp.complete}`);
  }
  // AUTH_ACQUISITION_COMPLETED is terminal
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    h.completeHttpResponse(200);
    h.completeBodyParseSuccess();
    h.completeAuthValidated();
    h.completeAuthAcquisitionCompleted();
    const comp = validateLedgerCompleteness([e]);
    check("RL-006", comp.complete, "AUTH_ACQUISITION_COMPLETED terminal", `complete=${comp.complete}`);
  }
  // Wrong-classification method rejected without mutation
  {
    const e = makeEntry("business");
    const h = createHandle(e);
    const r = h.completeAuthValidated();
    check("RL-007", !r.ok && e.phase === "CREATED", "wrong classification → no mutation", `ok=${r.ok},phase=${e.phase}`);
  }
  // Wrong-phase transition rejected without mutation
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    const r = h.completeAuthValidated(); // phase is CREATED, not BODY_PARSED
    check("RL-008", !r.ok && e.phase === "CREATED", "wrong phase → no mutation", `ok=${r.ok},phase=${e.phase}`);
  }
  // Duplicate completion rejected
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    h.completeHttpResponse(200);
    h.completeBodyParseSuccess();
    h.completeAuthValidated();
    const r = h.completeAuthValidated();
    check("RL-009", !r.ok && e.phase === "AUTH_VALIDATED", "duplicate auth-validated → no mutation", `ok=${r.ok},phase=${e.phase}`);
  }
  // Public handles cannot mutate corruption state.
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    check("RL-010", !("markLedgerCorrupted" in h), "public handle has no corruption mutator", `present=${"markLedgerCorrupted" in h}`);
  }
  // Acquisition completion failure cannot rewrite AUTH_ACQUISITION_COMPLETED
  {
    const e = makeEntry("authentication");
    const h = createHandle(e);
    h.completeHttpResponse(200);
    h.completeBodyParseSuccess();
    h.completeAuthValidated();
    h.completeAuthAcquisitionCompleted();
    const r = h.completeAuthAcquisitionCommitFailure();
    check("RL-011", !r.ok && e.phase === "AUTH_ACQUISITION_COMPLETED", "cannot rewrite success to failure", `ok=${r.ok},phase=${e.phase}`);
  }
}

// ── Environment-aware URL classification (fail-closed) ────────────────────────

function testUrlClassification(): void {
  check("URL-001", classifyRequestUrl("https://auth.servicetitan.io/connect/token", "production").ok === true, "production auth ok", "ok");
  check("URL-002", classifyRequestUrl("https://api.servicetitan.io/inventory/v2/tenant/x/purchase-orders", "production").ok === true, "production business ok", "ok");
  check("URL-003", classifyRequestUrl("https://evil.example/?next=auth.servicetitan.io", "production").ok === false, "spoofed substring rejected", "blocked");
  check("URL-004", classifyRequestUrl("https://auth.servicetitan.io.evil.example/token", "production").ok === false, "spoofed host rejected", "blocked");
  check("URL-005", classifyRequestUrl("https://unrelated.example/", "production").ok === false, "unknown origin rejected", "blocked");
  check("URL-006", classifyRequestUrl("not-a-url", "production").ok === false, "malformed rejected", "blocked");
  check("URL-007", classifyRequestUrl("https://user:pass@auth.servicetitan.io/connect/token", "production").ok === false, "userinfo rejected", "blocked");
  check("URL-008", classifyRequestUrl("http://auth.servicetitan.io/connect/token", "production").ok === false, "non-https rejected", "blocked");
  check("URL-009", classifyRequestUrl("https://auth.servicetitan.io/other", "production").ok === false, "auth origin wrong path rejected", "blocked");
  check("URL-010", classifyRequestUrl("https://auth.servicetitan.io/connect/token", "unknown-env").ok === false, "unknown environment rejected", "blocked");
}

// ── OAuth validators ──────────────────────────────────────────────────────────

function testValidators(): void {
  // Trim-first token policy
  check("VAL-001", validateAccessToken("  bearer-value  ").ok === true, "trim-first accepted", "ok");
  check("VAL-002", validateAccessToken("   ").ok === false, "blank rejected", "blocked");
  check("VAL-003", validateAccessToken(42 as any).ok === false, "non-string rejected", "blocked");
  // Oversized after trim
  check("VAL-004", validateAccessToken("x".repeat(8193)).ok === false, "oversized rejected", "blocked");
  // token type
  check("VAL-005", validateTokenType("Bearer").ok === true, "bearer accepted", "ok");
  check("VAL-006", validateTokenType("basic").ok === false, "non-bearer rejected", "blocked");
  // expires_in integer bounds
  check("VAL-007", validateExpiresIn(3600).ok === true, "3600 accepted", "ok");
  check("VAL-008", validateExpiresIn(0).ok === false, "zero rejected", "blocked");
  check("VAL-009", validateExpiresIn(-1).ok === false, "negative rejected", "blocked");
  check("VAL-010", validateExpiresIn(100000).ok === false, "excessive rejected", "blocked");
  // lifetime overflow
  check("VAL-011", computeLifetimeAndExpiry(Number.MAX_SAFE_INTEGER, 86400).ok === false, "lifetime overflow rejected", "blocked");
  // margin canonicalization
  const m1 = computeStableRefreshMargin(1000);
  check("VAL-012", m1.ok && m1.margin === 999, "short lifetime margin = lifetime-1", `margin=${(m1 as any).margin}`);
  const m2 = computeStableRefreshMargin(120000);
  check("VAL-013", m2.ok && m2.margin === 60000, "long lifetime margin capped 60000", `margin=${(m2 as any).margin}`);
}

// ── Cached token validation ────────────────────────────────────────────────────

function testCachedToken(): void {
  const valid: CachedToken = { token: "tok", issuedAt: 1000000, expiresAt: 1000000 + 3600000, refreshMarginMs: 60000 };
  check("CCH-001", isCachedToken(valid) === true, "valid cached token accepted", "ok");
  check("CCH-002", isCachedToken({ ...valid, token: " tok" }) === false, "non-canonical token rejected", "blocked");
  check("CCH-003", isCachedToken({ ...valid, refreshMarginMs: 1 }) === false, "noncanonical margin rejected", "blocked");
  check("CCH-004", isCachedToken({ ...valid, expiresAt: 1000000 + 1500 }) === false, "non-1000ms lifetime rejected", "blocked");

  const state: TokenState = { current: null };
  const clock: ClockState = { highWaterMark: null };
  const narrow = (d: ReturnType<typeof evaluateCachedToken>): string => (d.usable ? "usable" : d.reason);

  state.current = valid;
  check("CCH-005", narrow(evaluateCachedToken(state, clock, valid.expiresAt - valid.refreshMarginMs - 1)) === "usable", "1ms before boundary usable", "usable");
  state.current = valid;
  check("CCH-006", narrow(evaluateCachedToken(state, clock, valid.expiresAt - valid.refreshMarginMs)) === "refresh_due", "boundary refresh_due", "refresh_due");
  state.current = valid;
  check("CCH-007", narrow(evaluateCachedToken(state, clock, valid.expiresAt - 1)) === "refresh_due", "1ms before expiry refresh_due", "refresh_due");
  state.current = valid;
  check("CCH-008", narrow(evaluateCachedToken(state, clock, valid.expiresAt)) === "expired", "expiry expired", "expired");
  state.current = valid;
  check("CCH-009", narrow(evaluateCachedToken(state, clock, valid.expiresAt + 1)) === "expired", "after expiry expired", "expired");
  state.current = null;
  check("CCH-010", narrow(evaluateCachedToken(state, clock, valid.expiresAt)) === "no_token", "null no_token", "no_token");
  state.current = { quarantined: true, reason: "test", prior: null };
  check("CCH-011", narrow(evaluateCachedToken(state, clock, valid.expiresAt + 1)) === "quarantined", "quarantined never usable", "blocked");
  // clock rollback
  clock.highWaterMark = 5000000;
  let threw = false;
  try {
    validateClockNow(1000, clock);
  } catch (e) {
    threw = e instanceof ClockDependencyError;
  }
  check("CCH-012", threw === true, "clock rollback throws", "blocked");
}

// ── Atomic cache publication + quarantine ─────────────────────────────────────

function testCachePublication(): void {
  const state: TokenState = { current: null };
  const newToken: CachedToken = { token: "new", issuedAt: 1000, expiresAt: 1000 + 3600000, refreshMarginMs: 60000 };
  // publication succeeds
  const r1 = publishCacheAtomically(state, newToken);
  check("PUB-001", r1.ok && state.current === newToken, "publication succeeds", `ok=${r1.ok}`);
  // publication with prior — receipt preserves previous
  const prior = state.current;
  const newToken2: CachedToken = { token: "new2", issuedAt: 2000, expiresAt: 2000 + 3600000, refreshMarginMs: 60000 };
  const r2 = publishCacheAtomically(state, newToken2);
  check("PUB-002", r2.ok && (r2 as any).receipt.previous === prior, "receipt preserves previous", "ok");
  // quarantined cache is not consumable
  state.current = { quarantined: true, reason: "test", prior: null };
  const clock: ClockState = { highWaterMark: null };
  check("PUB-003", evaluateCachedToken(state, clock, 999999999).usable === false, "quarantined not consumable", "blocked");
}

// ── Instrumented fetch (separated transport/ledger; association) ──────────────

async function testInstrumentedFetch(): Promise<void> {
  {
    const fakeFetch = async () => new Response('{"access_token":"t","token_type":"Bearer","expires_in":3600}', { status: 200 });
    const { instrumentedFetch, ledger } = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "11111111-1111-1111-1111-111111111111" });
    const result = await instrumentedFetch("https://auth.servicetitan.io/connect/token", { method: "POST" });
    check("IF-001", result.association.classification === "authentication" && result.association.storedStatus === 200, "auth association bound", `cls=${result.association.classification}`);
    check("IF-002", ledger[0].phase === "HTTP_RECEIVED", "2xx auth → HTTP_RECEIVED", `phase=${ledger[0].phase}`);
  }
  {
    const fakeFetch = async () => new Response("nope", { status: 401 });
    const { instrumentedFetch, ledger } = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "22222222-2222-2222-2222-222222222222" });
    await instrumentedFetch("https://auth.servicetitan.io/connect/token");
    check("IF-003", ledger[0].phase === "AUTH_HTTP_REJECTED", "non-2xx → AUTH_HTTP_REJECTED (not transport)", `phase=${ledger[0].phase}`);
  }
  {
    const fakeFetch = async () => { throw new Error("network down"); };
    const { instrumentedFetch, ledger } = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "33333333-3333-3333-3333-333333333333" });
    let error: unknown;
    try { await instrumentedFetch("https://auth.servicetitan.io/connect/token"); } catch (err) { error = err; }
    check("IF-004", error instanceof TransportError && ledger[0].phase === "TRANSPORT_FAILED", "transport failure terminal + handle-carrying", `phase=${ledger[0].phase},err=${(error as any)?.constructor?.name}`);
  }
  {
    const fakeFetch = async () => new Response("{}", { status: 200 });
    const { instrumentedFetch, ledger } = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "44444444-4444-4444-4444-444444444444" });
    let threw = false;
    try { await instrumentedFetch("https://evil.example/x"); } catch (e) { threw = e instanceof LedgerAssociationError; }
    check("IF-005", threw && ledger.length === 0, "unknown origin → no row created", `rows=${ledger.length}`);
  }
}

// ── Bounded fetch ──────────────────────────────────────────────────────────────

function testBoundedGetPage(): Promise<void> {
  return Promise.resolve().then(async () => {
    const fakeFetch = async (_input: any, _init?: any) =>
      new Response(JSON.stringify({ data: [{ id: 1 }, { id: 2 }], hasMore: false }), { status: 200, headers: { "content-type": "application/json" } });
    const fetchContext = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "55555555-5555-5555-5555-555555555555" });
    const deps = {
      environment: "production", maxRetries: 2, tokenState: { current: null } as TokenState,
      clock: { highWaterMark: null } as ClockState, fetchContext,
      getTokenUrl: () => "https://auth.servicetitan.io/connect/token",
      getAccessToken: async () => "tok", dateNow: () => 1000000,
    };
    const getBusinessUrl = (path: string, env: string) => `https://api.servicetitan.io${path}`;
    const result = await boundedGetPage<{ id: number }>("/inventory/v2/tenant/t/purchase-orders", { page: "1" }, deps, getBusinessUrl);
    check("BF-001", !result.permanentFailure && result.records.length === 2 && result.ledgerComplete, "happy path 2 records", `records=${result.records.length},complete=${result.ledgerComplete}`);
  }).then(async () => {
    // Non-2xx retryable → retries then permanent failure
    let calls = 0;
    const fakeFetch = async () => { calls++; return new Response("err", { status: 500 }); };
    const fetchContext = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "66666666-6666-6666-6666-666666666666" });
    const deps = {
      environment: "production", maxRetries: 2, tokenState: { current: null } as TokenState,
      clock: { highWaterMark: null } as ClockState, fetchContext,
      getTokenUrl: () => "https://auth.servicetitan.io/connect/token",
      getAccessToken: async () => "tok", dateNow: () => 1000000,
    };
    const getBusinessUrl = (path: string) => `https://api.servicetitan.io${path}`;
    const result = await boundedGetPage("/x", {}, deps, getBusinessUrl);
    check("BF-002", result.permanentFailure && result.attempts === 3 && result.retries === 2, "500 retries 2 then fails", `attempts=${result.attempts},retries=${result.retries}`);
  }).then(async () => {
    // Malformed JSON → terminal BODY_PARSE_FAILED
    const fakeFetch = async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } });
    const fetchContext = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "77777777-7777-7777-7777-777777777777" });
    const { ledger } = fetchContext;
    const deps = {
      environment: "production", maxRetries: 0, tokenState: { current: null } as TokenState,
      clock: { highWaterMark: null } as ClockState, fetchContext,
      getTokenUrl: () => "https://auth.servicetitan.io/connect/token",
      getAccessToken: async () => "tok", dateNow: () => 1000000,
    };
    const result = await boundedGetPage("/x", {}, deps, (p: string) => `https://api.servicetitan.io${p}`);
    check("BF-003", result.permanentFailure && result.error instanceof MalformedResponseJsonError, "malformed JSON terminal", `err=${(result.error as any)?.name}`);
    check("BF-004", ledger[0].phase === "BODY_PARSE_FAILED", "BODY_PARSE_FAILED terminal", `phase=${ledger[0].phase}`);
  }).then(async () => {
    // Missing records array → terminal RECORD_VALIDATION_FAILED (never silently empty)
    const fakeFetch = async () => new Response(JSON.stringify({ hasMore: false }), { status: 200, headers: { "content-type": "application/json" } });
    const fetchContext = createInstrumentedFetch({ environment: "production", fetchImpl: fakeFetch as any, instrumentationIdFactory: () => "88888888-8888-8888-8888-888888888888" });
    const { ledger } = fetchContext;
    const deps = {
      environment: "production", maxRetries: 0, tokenState: { current: null } as TokenState,
      clock: { highWaterMark: null } as ClockState, fetchContext,
      getTokenUrl: () => "https://auth.servicetitan.io/connect/token",
      getAccessToken: async () => "tok", dateNow: () => 1000000,
    };
    const result = await boundedGetPage("/x", {}, deps, (p: string) => `https://api.servicetitan.io${p}`);
    check("BF-005", result.permanentFailure && result.error instanceof InvalidRecordCollectionError && result.records.length === 0, "missing records → failure not empty", `err=${(result.error as any)?.name},records=${result.records.length}`);
    check("BF-006", ledger[0].phase === "RECORD_VALIDATION_FAILED", "RECORD_VALIDATION_FAILED terminal", `phase=${ledger[0].phase}`);
  });
}

async function testCleanupContracts(): Promise<void> {
  const idFactory = () => "99999999-9999-9999-9999-999999999999";
  const okFetch = async () => new Response(JSON.stringify({ data: [], hasMore: false }), { status: 200 });
  const context: InstrumentedFetchContext = createInstrumentedFetch({ environment: "production", fetchImpl: okFetch as any, instrumentationIdFactory: idFactory });
  check("CTX-001", typeof context.instrumentedFetch === "function" && Array.isArray(context.ledger) && typeof context.verifier.verify === "function", "typed context exposes fetch, ledger, verifier", "context inspected");
  check("CTX-002", !("__verifier" in context.instrumentedFetch) && !("__ledger" in context.instrumentedFetch), "fetch has no hidden context properties", Object.keys(context.instrumentedFetch).join(","));

  const genuine = await context.instrumentedFetch("https://api.servicetitan.io/x", { method: "GET" });
  const verify = (candidate: typeof genuine) => context.verifier.verify(candidate, { classification: "business", response: candidate.response });
  check("AV-001", verify(genuine).ok, "genuine association verifies", "verified");
  check("AV-002", !context.verifier.verify(genuine, { classification: "business", response: new Response("{}", { status: 200 }) }).ok, "response identity mismatch rejected", "rejected");
  const otherHandle = createHandle(makeEntry("business"));
  check("AV-003", !verify({ ...genuine, handle: otherHandle }).ok, "handle identity mismatch rejected", "rejected");
  const savedPhase = genuine.handle.entry.phase;
  genuine.handle.entry.phase = "BODY_PARSED";
  check("AV-005", !verify(genuine).ok, "HTTP terminal classification mismatch rejected", "rejected");
  genuine.handle.entry.phase = savedPhase;
  check("AV-006", !verify({ ...genuine, association: { ...genuine.association, storedStatus: 201 } }).ok, "association status mismatch rejected", "rejected");

  const incompleteEntry = makeEntry("business");
  const incompleteHandle = createHandle(incompleteEntry);
  let incompleteCalls = 0;
  const incompleteContext: InstrumentedFetchContext = {
    ledger: [], verifier: context.verifier,
    instrumentedFetch: async () => { incompleteCalls++; incompleteContext.ledger.push(incompleteEntry); throw new TransportError(incompleteHandle, new Error("transport")); },
  };
  const commonDeps = { environment: "production", maxRetries: 2, tokenState: { current: null } as TokenState, clock: { highWaterMark: null } as ClockState, getTokenUrl: () => "", getAccessToken: async () => "tok", dateNow: () => 1 };
  const incompleteResult = await boundedGetPage("/x", {}, { ...commonDeps, fetchContext: incompleteContext }, (p) => `https://api.servicetitan.io${p}`);
  check("RT-001", incompleteCalls === 1 && incompleteResult.error instanceof OwnedLedgerIncompleteError && incompleteResult.error.handle === incompleteHandle, "incomplete owned ledger stops retry with real handle", `calls=${incompleteCalls}`);

  const metadataContext = createInstrumentedFetch({ environment: "production", fetchImpl: okFetch as any, instrumentationIdFactory: idFactory });
  const metadataVerifier = { verify(result: any, expected: any) {
    const verified = metadataContext.verifier.verify(result, expected);
    if (verified.ok) result.handle.entry.metadata = { recordCount: 9, paginationHasMore: null, paginationNextPage: null, paginationTotalCount: null };
    return verified;
  } };
  const metadataResult = await boundedGetPage("/x", {}, { ...commonDeps, fetchContext: { ...metadataContext, verifier: metadataVerifier } }, (p) => `https://api.servicetitan.io${p}`);
  check("MD-001", metadataResult.attempts === 1 && metadataResult.error instanceof MetadataCompletionError, "metadata failure returns immediately", `attempts=${metadataResult.attempts}`);
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export async function runAll(): Promise<TestResult[]> {
  testPhaseTransitions();
  testUrlClassification();
  testValidators();
  testCachedToken();
  testCachePublication();
  await testInstrumentedFetch();
  await testBoundedGetPage();
  await testCleanupContracts();
  return results;
}

// Standalone execution hook (when authorized)
if (typeof (globalThis as any).__runStage2E7RequestLedgerTests === "function") {
  (globalThis as any).__runStage2E7RequestLedgerTests(runAll);
}
