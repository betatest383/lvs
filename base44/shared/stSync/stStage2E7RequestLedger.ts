/**
 * Stage 2E.7 Request Ledger — Foundation Slice 1
 *
 * A NEW, self-contained, opt-in request-ledger, runtime association registry,
 * atomic cache publication, and bounded-fetch primitive. This module does NOT
 * modify stAuth.ts, stStage2E5Shared.ts, or any adapter. It is intended as the
 * foundation for a future Stage 2E.7 shadow-audit bounded-fetch path; wiring
 * into the live sync engine is deferred to a later slice.
 *
 * Design properties (compile-coherent; execution-verified is a separate
 * authorized step):
 *   - Atomic phase transitions: every handle method validates BEFORE mutation
 *     and returns a TransitionResult instead of throwing.
 *   - Terminal observability: every post-handle failure reaches a mechanically
 *     recognized terminal phase or a separate immutable LEDGER_CORRUPTED phase.
 *   - No unrestricted public setter: corruption recording is narrowly owned
 *     by the instrumented-fetch recovery path.
 *   - Handle-carrying errors: every post-handle error carries its exact handle.
 *   - Runtime association: a closure-owned registry binds response, handle,
 *     ledger entry, URL, method, classification, and status; consumers verify
 *     before interpreting the response.
 *   - Atomic cache publication with quarantine: a failed commit never leaves a
 *     consumable new token; a corrupted cache is quarantined and never yields.
 *   - Environment-aware URL classification: parsed origins and exact paths;
 *     fail-closed on unknown or malformed URLs.
 *
 * Test-only / foundation. No production wiring in this slice.
 */

// ─── Ledger classification & phases ──────────────────────────────────────────

export type LedgerClassification = "authentication" | "business";

export type RequestLedgerPhase =
  | "CREATED"
  | "TRANSPORT_FAILED"
  | "HTTP_RECEIVED"
  | "AUTH_HTTP_REJECTED"
  | "BUSINESS_HTTP_REJECTED"
  | "BODY_PARSE_FAILED"
  | "BODY_PARSED"
  | "AUTH_VALIDATION_FAILED"
  | "AUTH_VALIDATED" // NONTERMINAL intermediate
  | "AUTH_LEDGER_COMPLETION_FAILED"
  | "AUTH_CACHE_PUBLICATION_FAILED"
  | "AUTH_ACQUISITION_COMMIT_FAILED"
  | "AUTH_ACQUISITION_COMPLETED"
  | "AUTH_UNEXPECTED_FAILURE"
  | "SHAPE_VALIDATION_FAILED"
  | "RECORD_VALIDATION_FAILED"
  | "PAGINATION_VALIDATION_FAILED"
  | "METADATA_COMPLETED"
  | "BUSINESS_UNEXPECTED_FAILURE"
  | "LEDGER_CORRUPTED";

const AUTH_TERMINAL: ReadonlySet<RequestLedgerPhase> = new Set([
  "TRANSPORT_FAILED", "AUTH_HTTP_REJECTED", "BODY_PARSE_FAILED",
  "AUTH_VALIDATION_FAILED", "AUTH_LEDGER_COMPLETION_FAILED",
  "AUTH_CACHE_PUBLICATION_FAILED", "AUTH_ACQUISITION_COMMIT_FAILED",
  "AUTH_UNEXPECTED_FAILURE", "AUTH_ACQUISITION_COMPLETED",
  "LEDGER_CORRUPTED",
]);
const BUSINESS_TERMINAL: ReadonlySet<RequestLedgerPhase> = new Set([
  "TRANSPORT_FAILED", "BUSINESS_HTTP_REJECTED", "BODY_PARSE_FAILED",
  "SHAPE_VALIDATION_FAILED", "RECORD_VALIDATION_FAILED",
  "PAGINATION_VALIDATION_FAILED", "BUSINESS_UNEXPECTED_FAILURE",
  "METADATA_COMPLETED", "LEDGER_CORRUPTED",
]);

// ─── Key & handle contracts ──────────────────────────────────────────────────

export interface RequestLedgerKey {
  readonly instrumentationId: string;
  readonly requestNumber: number;
}

export type TransitionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ParsedMetadata {
  readonly recordCount: number;
  readonly paginationHasMore: boolean | null;
  readonly paginationNextPage: number | null;
  readonly paginationTotalCount: number | null;
}

export interface RequestLedgerEntry {
  readonly key: RequestLedgerKey;
  readonly classification: LedgerClassification;
  phase: RequestLedgerPhase;
  transport: { httpStatus: number; classification: string } | null;
  parse: { ok: boolean; reason: string | null } | null;
  authValidation: { ok: boolean | null; reason: string | null } | null;
  shape: { reason: string } | null;
  records: { reason: string } | null;
  pagination: { reason: string } | null;
  metadata: ParsedMetadata | null;
  corruption: { reason: string } | null;
}

export interface RequestLedgerHandle {
  readonly key: RequestLedgerKey;
  readonly classification: LedgerClassification;
  readonly entry: RequestLedgerEntry; // for association registry identity binding
  completeTransportFailure(): TransitionResult;
  completeHttpResponse(httpStatus: number): TransitionResult;
  completeBodyParseFailure(reason: string): TransitionResult;
  completeBodyParseSuccess(): TransitionResult;
  completeAuthValidationFailure(reason: string): TransitionResult;
  completeAuthValidated(): TransitionResult;
  completeAuthLedgerCompletionFailure(): TransitionResult;
  completeAuthCachePublicationFailure(): TransitionResult;
  completeAuthAcquisitionCommitFailure(): TransitionResult;
  completeAuthAcquisitionCompleted(): TransitionResult;
  completeAuthUnexpectedFailure(reason: string): TransitionResult;
  completeShapeFailure(reason: string): TransitionResult;
  completeRecordFailure(reason: string): TransitionResult;
  completePaginationFailure(reason: string): TransitionResult;
  completeParsedMetadata(metadata: ParsedMetadata): TransitionResult;
  completeBusinessUnexpectedFailure(reason: string): TransitionResult;
}

const handleEntries = new WeakMap<RequestLedgerHandle, RequestLedgerEntry>();

function classifyHttpStatus(status: number): string {
  if (status === 404) return "TESTED_ROUTE_NOT_FOUND";
  if (status === 403) return "BLOCKED_BY_PERMISSION";
  if (status >= 500) return "BLOCKED_BY_SERVER_ERROR";
  if (!status || status < 200 || status >= 300) return "BLOCKED_BY_HTTP_ERROR";
  return "OK";
}

export function createHandle(entry: RequestLedgerEntry): RequestLedgerHandle {
  const requirePhase = (expected: RequestLedgerPhase): TransitionResult => {
    if (entry.phase === "LEDGER_CORRUPTED") return { ok: false, reason: "ledger_corrupted" };
    if (entry.phase !== expected) return { ok: false, reason: `invalid_phase_transition:${entry.phase}` };
    return { ok: true };
  };
  const commit = (next: RequestLedgerPhase): TransitionResult => {
    entry.phase = next;
    return { ok: true };
  };

  const handle: RequestLedgerHandle = {
    key: entry.key,
    classification: entry.classification,
    entry,
    completeTransportFailure(): TransitionResult {
      if (entry.transport !== null) return { ok: false, reason: "transport_already_completed" };
      const pre = requirePhase("CREATED");
      if (!pre.ok) return pre;
      entry.transport = { httpStatus: 0, classification: "TRANSPORT_ERROR" };
      return commit("TRANSPORT_FAILED");
    },
    completeHttpResponse(httpStatus: number): TransitionResult {
      // ALL validation BEFORE mutation
      if (entry.transport !== null) return { ok: false, reason: "transport_already_completed" };
      if (entry.phase !== "CREATED") return { ok: false, reason: `invalid_phase_transition:${entry.phase}` };
      if (typeof httpStatus !== "number" || !Number.isFinite(httpStatus) || !Number.isInteger(httpStatus))
        return { ok: false, reason: "invalid_http_status" };
      if (httpStatus < 100 || httpStatus > 599) return { ok: false, reason: "http_status_out_of_range" };
      let next: RequestLedgerPhase;
      if (httpStatus >= 200 && httpStatus < 300) next = "HTTP_RECEIVED";
      else if (entry.classification === "authentication") next = "AUTH_HTTP_REJECTED";
      else if (entry.classification === "business") next = "BUSINESS_HTTP_REJECTED";
      else return { ok: false, reason: "unknown_classification" };
      entry.transport = { httpStatus, classification: classifyHttpStatus(httpStatus) };
      entry.phase = next;
      return { ok: true };
    },
    completeBodyParseFailure(reason: string): TransitionResult {
      if (entry.parse !== null) return { ok: false, reason: "parse_already_completed" };
      const pre = requirePhase("HTTP_RECEIVED");
      if (!pre.ok) return pre;
      entry.parse = { ok: false, reason };
      return commit("BODY_PARSE_FAILED");
    },
    completeBodyParseSuccess(): TransitionResult {
      if (entry.parse !== null) return { ok: false, reason: "parse_already_completed" };
      const pre = requirePhase("HTTP_RECEIVED");
      if (!pre.ok) return pre;
      entry.parse = { ok: true, reason: null };
      return commit("BODY_PARSED");
    },
    completeAuthValidationFailure(reason: string): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      if (entry.authValidation !== null) return { ok: false, reason: "auth_validation_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.authValidation = { ok: false, reason };
      return commit("AUTH_VALIDATION_FAILED");
    },
    completeAuthValidated(): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      if (entry.authValidation !== null) return { ok: false, reason: "auth_validation_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.authValidation = { ok: true, reason: null };
      return commit("AUTH_VALIDATED"); // nonterminal
    },
    completeAuthLedgerCompletionFailure(): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("AUTH_VALIDATED");
      if (!pre.ok) return pre;
      return commit("AUTH_LEDGER_COMPLETION_FAILED");
    },
    completeAuthCachePublicationFailure(): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("AUTH_VALIDATED");
      if (!pre.ok) return pre;
      return commit("AUTH_CACHE_PUBLICATION_FAILED");
    },
    completeAuthAcquisitionCommitFailure(): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("AUTH_VALIDATED");
      if (!pre.ok) return pre;
      return commit("AUTH_ACQUISITION_COMMIT_FAILED");
    },
    completeAuthAcquisitionCompleted(): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("AUTH_VALIDATED");
      if (!pre.ok) return pre;
      return commit("AUTH_ACQUISITION_COMPLETED");
    },
    completeAuthUnexpectedFailure(_reason: string): TransitionResult {
      if (entry.classification !== "authentication") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      return commit("AUTH_UNEXPECTED_FAILURE");
    },
    completeShapeFailure(reason: string): TransitionResult {
      if (entry.classification !== "business") return { ok: false, reason: "wrong_classification" };
      if (entry.shape !== null) return { ok: false, reason: "shape_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.shape = { reason };
      return commit("SHAPE_VALIDATION_FAILED");
    },
    completeRecordFailure(reason: string): TransitionResult {
      if (entry.classification !== "business") return { ok: false, reason: "wrong_classification" };
      if (entry.records !== null) return { ok: false, reason: "records_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.records = { reason };
      return commit("RECORD_VALIDATION_FAILED");
    },
    completePaginationFailure(reason: string): TransitionResult {
      if (entry.classification !== "business") return { ok: false, reason: "wrong_classification" };
      if (entry.pagination !== null) return { ok: false, reason: "pagination_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.pagination = { reason };
      return commit("PAGINATION_VALIDATION_FAILED");
    },
    completeParsedMetadata(metadata: ParsedMetadata): TransitionResult {
      if (entry.classification !== "business") return { ok: false, reason: "wrong_classification" };
      if (entry.metadata !== null) return { ok: false, reason: "metadata_already_completed" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      entry.metadata = metadata;
      return commit("METADATA_COMPLETED");
    },
    completeBusinessUnexpectedFailure(_reason: string): TransitionResult {
      if (entry.classification !== "business") return { ok: false, reason: "wrong_classification" };
      const pre = requirePhase("BODY_PARSED");
      if (!pre.ok) return pre;
      return commit("BUSINESS_UNEXPECTED_FAILURE");
    },
  };
  handleEntries.set(handle, entry);
  return handle;
}

function recordLedgerCorruption(
  handle: RequestLedgerHandle,
  expectedEntry: RequestLedgerEntry,
  ownedRows: readonly RequestLedgerEntry[],
  reason: string,
): TransitionResult {
  if (handleEntries.get(handle) !== expectedEntry) return { ok: false, reason: "handle_identity_mismatch" };
  if (handle.entry !== expectedEntry) return { ok: false, reason: "entry_identity_mismatch" };
  const ownedEntry = ownedRows.find((row) => row.key.instrumentationId === expectedEntry.key.instrumentationId && row.key.requestNumber === expectedEntry.key.requestNumber);
  if (!ownedEntry) return { ok: false, reason: "entry_not_owned" };
  if (ownedEntry !== expectedEntry) return { ok: false, reason: "owned_entry_replaced" };
  expectedEntry.phase = "LEDGER_CORRUPTED";
  expectedEntry.corruption = { reason };
  return { ok: true };
}

export function validateLedgerCompleteness(ownedRows: readonly RequestLedgerEntry[]): {
  complete: boolean;
  incomplete: RequestLedgerEntry[];
} {
  const incomplete: RequestLedgerEntry[] = [];
  for (const entry of ownedRows) {
    const terminal = entry.classification === "authentication" ? AUTH_TERMINAL : BUSINESS_TERMINAL;
    if (!terminal.has(entry.phase)) incomplete.push(entry);
  }
  return { complete: incomplete.length === 0, incomplete };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export abstract class HandleCarryingError extends Error {
  constructor(public readonly handle: RequestLedgerHandle, message: string) {
    super(message);
  }
}
export class TransportError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly cause: unknown) {
    super(handle, "transport_error");
    this.name = "TransportError";
  }
}
export class HttpResponseError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly httpStatus: number, public readonly retryable: boolean) {
    super(handle, `http_${httpStatus}`);
    this.name = "HttpResponseError";
  }
}
export class MalformedResponseJsonError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "MalformedResponseJsonError";
  }
}
export class MalformedResponseShapeError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "MalformedResponseShapeError";
  }
}
export class MalformedPaginationError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "MalformedPaginationError";
  }
}
export class InvalidRecordCollectionError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "InvalidRecordCollectionError";
  }
}
export class OAuthTransportError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly cause: unknown) {
    super(handle, "oauth_transport_error");
    this.name = "OAuthTransportError";
  }
}
export class OAuthRejectionError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly statusCode: number) {
    super(handle, "oauth_rejection_error");
    this.name = "OAuthRejectionError";
  }
}
export class MalformedOAuthResponseError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string, public readonly cause?: unknown) {
    super(handle, reason);
    this.name = "MalformedOAuthResponseError";
  }
}
export class OAuthClockDependencyError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string, public readonly cause: unknown) {
    super(handle, reason);
    this.name = "OAuthClockDependencyError";
  }
}
export class OAuthCachePublicationError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly cause: unknown) {
    super(handle, "cache_publication_failed");
    this.name = "OAuthCachePublicationError";
  }
}
export class LedgerCorruptionError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "LedgerCorruptionError";
  }
}
export class OwnedLedgerIncompleteError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly incomplete: readonly RequestLedgerEntry[]) {
    super(handle, "owned_ledger_incomplete");
    this.name = "OwnedLedgerIncompleteError";
  }
}
export class MetadataCompletionError extends HandleCarryingError {
  constructor(handle: RequestLedgerHandle, public readonly reason: string) {
    super(handle, reason);
    this.name = "MetadataCompletionError";
  }
}
export class ClockDependencyError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "ClockDependencyError";
  }
}
export class LedgerAssociationError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "LedgerAssociationError";
  }
}

// ─── Environment-aware URL classification (fail-closed) ────────────────────────

const AUTH_ORIGINS: Record<string, string[]> = {
  production: ["https://auth.servicetitan.io"],
  integration: ["https://auth.beta.servicetitan.io"],
};
const AUTH_TOKEN_PATH = "/connect/token";
const BUSINESS_ORIGINS: Record<string, string[]> = {
  production: ["https://api.servicetitan.io"],
  integration: ["https://api.beta.servicetitan.io"],
};

export function classifyRequestUrl(
  rawUrl: string,
  environment: string,
): { ok: true; classification: LedgerClassification; normalizedUrl: string } | { ok: false; reason: string } {
  if (!AUTH_ORIGINS[environment] || !BUSINESS_ORIGINS[environment]) return { ok: false, reason: "unknown_environment" };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed_request_url" };
  }
  if (parsed.username || parsed.password) return { ok: false, reason: "userinfo_not_permitted" };
  if (parsed.protocol !== "https:") return { ok: false, reason: "non_https_protocol" };
  const origin = `${parsed.protocol}//${parsed.host}`;
  const normalizedUrl = `${parsed.origin}${parsed.pathname}`;
  if (AUTH_ORIGINS[environment].includes(origin) && parsed.pathname === AUTH_TOKEN_PATH) {
    return { ok: true, classification: "authentication", normalizedUrl };
  }
  if (BUSINESS_ORIGINS[environment].includes(origin)) {
    return { ok: true, classification: "business", normalizedUrl };
  }
  return { ok: false, reason: "unknown_request_origin" };
}

// ─── Runtime association registry (closure-owned) ──────────────────────────────

export interface RequestAssociation {
  readonly instrumentationId: string;
  readonly requestNumber: number;
  readonly nonce: string;
  readonly classification: LedgerClassification;
  readonly normalizedUrl: string;
  readonly method: string;
  readonly storedStatus: number;
}

export interface InstrumentedFetchResult {
  readonly response: Response;
  readonly handle: RequestLedgerHandle;
  readonly association: RequestAssociation;
}

interface AssociationRecord {
  readonly association: RequestAssociation;
  readonly response: Response;
  readonly entry: RequestLedgerEntry;
  readonly handle: RequestLedgerHandle;
}

export interface AssociationVerifier {
  verify(
    result: InstrumentedFetchResult,
    expected: { classification: LedgerClassification; response: Response },
  ): { ok: true; handle: RequestLedgerHandle } | { ok: false; reason: string };
}

function createAssociationVerifier() {
  const registry = new Map<string, AssociationRecord>();
  return {
    register(rec: AssociationRecord): void {
      registry.set(`${rec.association.instrumentationId}:${rec.association.requestNumber}`, rec);
    },
    verify(
      result: InstrumentedFetchResult,
      expected: { classification: LedgerClassification; response: Response },
    ): { ok: true; handle: RequestLedgerHandle } | { ok: false; reason: string } {
      const key = `${result.association.instrumentationId}:${result.association.requestNumber}`;
      const rec = registry.get(key);
      if (!rec) return { ok: false, reason: "association_not_registered" };
      if (rec.response !== expected.response) return { ok: false, reason: "response_identity_mismatch" };
      if (rec.handle !== result.handle) return { ok: false, reason: "handle_identity_mismatch" };
      if (rec.entry !== result.handle.entry) return { ok: false, reason: "handle_not_bound_to_ledger_row" };
      if (rec.entry !== handleEntries.get(result.handle)) return { ok: false, reason: "entry_identity_mismatch" };
      if (rec.association.storedStatus !== expected.response.status) return { ok: false, reason: "stored_status_mismatch" };
      if (rec.association.storedStatus !== result.association.storedStatus) return { ok: false, reason: "association_status_mismatch" };
      if (rec.association.classification !== expected.classification) return { ok: false, reason: "classification_mismatch" };
      if (rec.association.classification !== result.association.classification) return { ok: false, reason: "association_classification_mismatch" };
      if (rec.association.method !== result.association.method) return { ok: false, reason: "method_mismatch" };
      if (rec.association.normalizedUrl !== result.association.normalizedUrl) return { ok: false, reason: "url_mismatch" };
      if (rec.association.nonce !== result.association.nonce) return { ok: false, reason: "nonce_mismatch" };
      if (rec.association.instrumentationId !== result.association.instrumentationId) return { ok: false, reason: "instrumentation_id_mismatch" }; +      if (rec.association.requestNumber !== result.association.requestNumber) return { ok: false, reason: "request_number_mismatch" };
      const expectedPhase: RequestLedgerPhase = expected.response.status >= 200 && expected.response.status < 300
        ? "HTTP_RECEIVED"
        : rec.association.classification === "authentication" ? "AUTH_HTTP_REJECTED" : "BUSINESS_HTTP_REJECTED";
      if (rec.entry.phase !== expectedPhase) return { ok: false, reason: "http_terminal_classification_mismatch" };
      return { ok: true, handle: rec.handle };
    },
  };
}

// ─── Atomic cache publication with quarantine ─────────────────────────────────

export interface CachedToken {
  readonly token: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly refreshMarginMs: number;
}
export interface QuarantinedCache {
  readonly quarantined: true;
  readonly reason: string;
  readonly prior: TokenStateValue;
}
export type TokenStateValue = CachedToken | QuarantinedCache | null;
export interface TokenState {
  current: TokenStateValue;
}

export type CacheCommitResult =
  | { readonly ok: true; readonly receipt: { readonly previous: TokenStateValue } }
  | { readonly ok: false; readonly state: "unchanged"; readonly cause: unknown }
  | { readonly ok: false; readonly state: "corrupted"; readonly quarantine: QuarantinedCache; readonly cause: unknown };

export function publishCacheAtomically(state: TokenState, newToken: CachedToken): CacheCommitResult {
  const previous: TokenStateValue = state.current;
  try {
    state.current = newToken;
    if (state.current !== newToken) {
      try {
        state.current = previous;
      } catch {
        const quarantine: QuarantinedCache = { quarantined: true, reason: "publication_identity_mismatch_restore_failed", prior: previous };
        state.current = quarantine;
        return { ok: false, state: "corrupted", quarantine, cause: new Error("publication_identity_mismatch_restore_failed") };
      }
      return { ok: false, state: "unchanged", cause: new Error("publication_identity_mismatch") };
    }
    return { ok: true, receipt: { previous } };
  } catch (writeErr) {
    try {
      state.current = previous;
    } catch {
      const quarantine: QuarantinedCache = { quarantined: true, reason: "publication_threw_restore_failed", prior: previous };
      state.current = quarantine;
      return { ok: false, state: "corrupted", quarantine, cause: writeErr };
    }
    if (state.current !== previous) {
      const quarantine: QuarantinedCache = { quarantined: true, reason: "publication_restore_verify_failed", prior: previous };
      state.current = quarantine;
      return { ok: false, state: "corrupted", quarantine, cause: writeErr };
    }
    return { ok: false, state: "unchanged", cause: writeErr };
  }
}

// ─── Cached-token validation ──────────────────────────────────────────────────

const MAX_LIFETIME_SECONDS = 86400;
const MAX_MARGIN_MS = 60000;
const MIN_MARGIN_MS = 1;
const CLOCK_BACKWARD_TOLERANCE_MS = 1000;
const MAX_ACCESS_TOKEN_LENGTH = 8192;

export interface ClockState {
  highWaterMark: number | null;
}

export function validateClockNow(now: number, clock: ClockState): void {
  if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now))
    throw new ClockDependencyError("invalid_clock_output");
  if (clock.highWaterMark !== null && now < clock.highWaterMark - CLOCK_BACKWARD_TOLERANCE_MS)
    throw new ClockDependencyError("clock_rollback_exceeded_tolerance");
  clock.highWaterMark = clock.highWaterMark === null ? now : Math.max(clock.highWaterMark, now);
}

export type AccessTokenResult = { ok: true; token: string } | { ok: false; discriminant: string };
export function validateAccessToken(value: unknown): AccessTokenResult {
  if (typeof value !== "string") return { ok: false, discriminant: "missing_access_token" };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: false, discriminant: "blank_access_token" };
  if (trimmed.length > MAX_ACCESS_TOKEN_LENGTH) return { ok: false, discriminant: "oversized_access_token" };
  return { ok: true, token: trimmed };
}
export type TokenTypeResult = { ok: true } | { ok: false; discriminant: string };
export function validateTokenType(value: unknown): TokenTypeResult {
  if (typeof value !== "string") return { ok: false, discriminant: "missing_token_type" };
  if (value.trim().toLowerCase() !== "bearer") return { ok: false, discriminant: "invalid_token_type" };
  return { ok: true };
}
export type ExpiresInResult = { ok: true; lifetimeSeconds: number } | { ok: false; discriminant: string };
export function validateExpiresIn(value: unknown): ExpiresInResult {
  if (typeof value !== "number") return { ok: false, discriminant: "invalid_expires_in_type" };
  if (!Number.isFinite(value)) return { ok: false, discriminant: "non_finite_expires_in" };
  if (!Number.isInteger(value)) return { ok: false, discriminant: "non_integer_expires_in" };
  if (value === 0) return { ok: false, discriminant: "zero_expires_in" };
  if (value < 0) return { ok: false, discriminant: "negative_expires_in" };
  if (value > MAX_LIFETIME_SECONDS) return { ok: false, discriminant: "excessive_expires_in" };
  return { ok: true, lifetimeSeconds: value };
}
export type LifetimeResult = { ok: true; lifetimeMs: number; expiresAt: number } | { ok: false; discriminant: string };
export function computeLifetimeAndExpiry(acquisitionTime: number, lifetimeSeconds: number): LifetimeResult {
  const lifetimeMs = lifetimeSeconds * 1000;
  if (!Number.isSafeInteger(lifetimeMs)) return { ok: false, discriminant: "lifetime_product_overflow" };
  const expiresAt = acquisitionTime + lifetimeMs;
  if (!Number.isSafeInteger(expiresAt)) return { ok: false, discriminant: "expiresAt_overflow" };
  return { ok: true, lifetimeMs, expiresAt };
}
export type MarginResult = { ok: true; margin: number } | { ok: false; discriminant: string };
export function computeStableRefreshMargin(lifetimeMs: number): MarginResult {
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) return { ok: false, discriminant: "invalid_lifetime_for_margin" };
  if (lifetimeMs < MAX_MARGIN_MS) return { ok: true, margin: Math.max(MIN_MARGIN_MS, lifetimeMs - 1) };
  return { ok: true, margin: MAX_MARGIN_MS };
}

export function isCachedToken(value: unknown): value is CachedToken {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== "string") return false;
  if (v.token.trim() === "") return false;
  if (v.token !== v.token.trim()) return false;
  if (v.token.length > MAX_ACCESS_TOKEN_LENGTH) return false;
  if (typeof v.issuedAt !== "number" || !Number.isFinite(v.issuedAt) || !Number.isSafeInteger(v.issuedAt)) return false;
  if (typeof v.expiresAt !== "number" || !Number.isFinite(v.expiresAt) || !Number.isSafeInteger(v.expiresAt)) return false;
  if (v.issuedAt >= v.expiresAt) return false;
  if (typeof v.refreshMarginMs !== "number" || !Number.isSafeInteger(v.refreshMarginMs) || v.refreshMarginMs < 0) return false;
  if (v.refreshMarginMs > MAX_MARGIN_MS) return false;
  const lifetimeMs = (v.expiresAt as number) - (v.issuedAt as number);
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) return false;
  const maxLifetimeMs = MAX_LIFETIME_SECONDS * 1000;
  if (!Number.isSafeInteger(maxLifetimeMs)) return false;
  if (lifetimeMs > maxLifetimeMs) return false;
  if (lifetimeMs % 1000 !== 0) return false;
  const refreshBoundary = (v.expiresAt as number) - (v.refreshMarginMs as number);
  if (!Number.isSafeInteger(refreshBoundary)) return false;
  if (refreshBoundary < (v.issuedAt as number)) return false;
  const canonicalMargin = computeStableRefreshMargin(lifetimeMs);
  if (!canonicalMargin.ok) return false;
  if (v.refreshMarginMs !== canonicalMargin.margin) return false;
  return true;
}

export type CacheDecision =
  | { usable: true; token: string }
  | { usable: false; reason: "no_token" | "refresh_due" | "expired" | "corrupt" | "quarantined"; cleared: boolean };

export function evaluateCachedToken(state: TokenState, clock: ClockState, now: number): CacheDecision {
  validateClockNow(now, clock);
  const cached = state.current;
  if (cached === null) return { usable: false, reason: "no_token", cleared: false };
  if (typeof cached === "object" && cached !== null && "quarantined" in cached)
    return { usable: false, reason: "quarantined", cleared: false };
  if (!isCachedToken(cached)) {
    state.current = null;
    return { usable: false, reason: "corrupt", cleared: true };
  }
  const refreshBoundary = cached.expiresAt - cached.refreshMarginMs;
  if (now < refreshBoundary) return { usable: true, token: cached.token };
  if (now < cached.expiresAt) return { usable: false, reason: "refresh_due", cleared: false };
  return { usable: false, reason: "expired", cleared: false };
}

// ─── Instrumented fetch (separated transport/ledger; association-bound) ───────

export interface InstrumentFetchDeps {
  readonly environment: string;
  readonly fetchImpl?: typeof fetch;
  readonly instrumentationIdFactory?: () => string;
}

export interface InstrumentedFetchContext {
  readonly instrumentedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<InstrumentedFetchResult>;
  readonly ledger: RequestLedgerEntry[];
  readonly verifier: AssociationVerifier;
}

export function createInstrumentedFetch(deps: InstrumentFetchDeps): InstrumentedFetchContext {
  const ledger: RequestLedgerEntry[] = [];
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const verifier = createAssociationVerifier();
  let requestCounter = 0;
  let instrumentationId: string;
  try {
    instrumentationId = deps.instrumentationIdFactory ? deps.instrumentationIdFactory() : crypto.randomUUID();
  } catch {
    throw new LedgerAssociationError("instrumentation_id_factory_threw");
  }

  const instrumentedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<InstrumentedFetchResult> => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = ((init?.method) || "GET").toUpperCase();
    const classified = classifyRequestUrl(rawUrl, deps.environment);
    if (!classified.ok) throw new LedgerAssociationError(`url_classification_failed:${classified.reason}`);

    requestCounter++;
    const requestNumber = requestCounter;
    let nonce: string;
    try {
      nonce = deps.instrumentationIdFactory ? deps.instrumentationIdFactory() : crypto.randomUUID();
    } catch {
      throw new LedgerAssociationError("nonce_factory_threw");
    }
    const key: RequestLedgerKey = { instrumentationId, requestNumber };
    const entry: RequestLedgerEntry = {
      key, classification: classified.classification, phase: "CREATED",
      transport: null, parse: null, authValidation: null, shape: null,
      records: null, pagination: null, metadata: null, corruption: null,
    };
    ledger.push(entry);
    const handle = createHandle(entry);

    // SEPARATED native transport
    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (transportErr) {
      const tr = handle.completeTransportFailure();
      if (!tr.ok) recordLedgerCorruption(handle, entry, ledger, `transport_completion_failed:${tr.reason}`);
      throw new TransportError(handle, transportErr);
    }

    // SEPARATED ledger HTTP completion — a received response is NEVER reclassified as transport failure
    const hr = handle.completeHttpResponse(response.status);
    if (!hr.ok) {
      recordLedgerCorruption(handle, entry, ledger, `http_completion_failed:${hr.reason}`);
      throw new LedgerCorruptionError(handle, `http_completion_failed:${hr.reason}`);
    }

    const association: RequestAssociation = {
      instrumentationId, requestNumber, nonce,
      classification: classified.classification, normalizedUrl: classified.normalizedUrl,
      method, storedStatus: response.status,
    };
    verifier.register({ association, response, entry, handle });
    return { response, handle, association };
  };

  return { instrumentedFetch, ledger, verifier };
}

// ─── Bounded fetch (standalone; operates on injected deps) ────────────────────

export interface BoundedFetchDeps {
  readonly environment: string;
  readonly maxRetries: number;
  readonly tokenState: TokenState;
  readonly clock: ClockState;
  readonly fetchContext: InstrumentedFetchContext;
  readonly getTokenUrl: (environment: string) => string;
  readonly getAccessToken?: (environment: string) => Promise<string>;
  readonly dateNow: () => number;
}

export interface BoundedFetchResult<T> {
  readonly records: readonly T[];
  readonly pagination: { hasMore: boolean | null; nextPage: number | null; totalCount: number | null } | null;
  readonly attempts: number;
  readonly retries: number;
  readonly permanentFailure: boolean;
  readonly error: unknown | null;
  readonly ledgerComplete: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractRecords<T>(data: unknown): T[] | null {
  if (Array.isArray(data)) return data as T[];
  if (!isPlainObject(data)) return null; // caller classifies as record failure — never silently empty
  const candidates = (data as any).data ?? (data as any).items ?? (data as any).results ?? null;
  if (Array.isArray(candidates)) return candidates as T[];
  return null;
}

export function extractPagination(data: unknown): { hasMore: boolean | null; nextPage: number | null; totalCount: number | null } {
  if (!isPlainObject(data)) return { hasMore: null, nextPage: null, totalCount: null };
  const d = data as any;
  return { hasMore: d.hasMore ?? d.hasMoreResults ?? null, nextPage: d.nextPage ?? null, totalCount: d.totalCount ?? null };
}

export function isValidPagination(p: { hasMore: boolean | null; nextPage: number | null; totalCount: number | null }): boolean {
  if (p.hasMore !== null && typeof p.hasMore !== "boolean") return false;
  if (p.nextPage !== null && (typeof p.nextPage !== "number" || !Number.isFinite(p.nextPage))) return false;
  if (p.totalCount !== null && (typeof p.totalCount !== "number" || !Number.isFinite(p.totalCount))) return false;
  return true;
}

function isRetryable(err: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false;
  if (err instanceof TransportError) return true;
  if (err instanceof HttpResponseError && err.retryable) return true;
  return false;
}

export async function boundedGetPage<T>(
  path: string,
  params: Record<string, string>,
  deps: BoundedFetchDeps,
  getBusinessUrl: (path: string, environment: string, params: Record<string, string>) => string,
): Promise<BoundedFetchResult<T>> {
  let attempts = 0;
  let retries = 0;
  const { instrumentedFetch, ledger: fetchLedger, verifier } = deps.fetchContext;
  const ownedStart = fetchLedger.length;
  let lastOwnedHandle: RequestLedgerHandle | null = null;
  const ownedRows = (): readonly RequestLedgerEntry[] => fetchLedger.slice(ownedStart);
  const completeness = () => validateLedgerCompleteness(ownedRows());
  const corrupt = (handle: RequestLedgerHandle, reason: string): TransitionResult =>
    recordLedgerCorruption(handle, handle.entry, ownedRows(), reason);

  for (let attempt = 0; attempt <= deps.maxRetries; attempt++) {
    attempts++;
    const token = deps.getAccessToken ? await deps.getAccessToken(deps.environment) : "";
    const url = getBusinessUrl(path, deps.environment, params);
    let result: InstrumentedFetchResult;
    try {
      result = await instrumentedFetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      if (err instanceof HandleCarryingError) lastOwnedHandle = err.handle;
      const complete = completeness();
      if (!complete.complete && lastOwnedHandle) {
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new OwnedLedgerIncompleteError(lastOwnedHandle, complete.incomplete), ledgerComplete: false };
      }
      if (isRetryable(err, attempt, deps.maxRetries)) { retries++; continue; }
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: err, ledgerComplete: complete.complete };
    }

    lastOwnedHandle = result.handle;
    const v = verifier.verify(result, { classification: "business", response: result.response });
    if (!v.ok) {
      const r = result.handle.completeBusinessUnexpectedFailure(`association_mismatch:${v.reason}`);
      if (!r.ok) corrupt(result.handle, `association_mismatch:${r.reason}`);
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedResponseShapeError(result.handle, `request_result_mismatch:${v.reason}`), ledgerComplete: false };
    }
    const handle = v.handle;
    const response = result.response;

    // createInstrumentedFetch terminalizes HTTP before this status policy runs;
    // verification above proves the ledger phase matches the received status.
    if (response.status === 401) {
      deps.tokenState.current = null;
      const complete = completeness();
      const err = new HttpResponseError(handle, 401, true);
      if (!complete.complete) return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new OwnedLedgerIncompleteError(handle, complete.incomplete), ledgerComplete: false };
      if (isRetryable(err, attempt, deps.maxRetries)) { retries++; continue; }
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: err, ledgerComplete: true };
    }
    if (response.status === 403 || response.status >= 500 || response.status < 200 || response.status >= 300) {
      const retryable = response.status === 429 || response.status >= 500;
      const complete = completeness();
      const err = new HttpResponseError(handle, response.status, retryable);
      if (!complete.complete) return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new OwnedLedgerIncompleteError(handle, complete.incomplete), ledgerComplete: false };
      if (isRetryable(err, attempt, deps.maxRetries)) { retries++; continue; }
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: err, ledgerComplete: true };
    }

    let parsed: T;
    try {
      parsed = (await response.json()) as T;
    } catch {
      const r = handle.completeBodyParseFailure("malformed_json");
      if (!r.ok) corrupt(handle, `parse_failure_completion_failed:${r.reason}`);
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedResponseJsonError(handle, "malformed_json"), ledgerComplete: false };
    }
    const ps = handle.completeBodyParseSuccess();
    if (!ps.ok) {
      corrupt(handle, `parse_success_completion_failed:${ps.reason}`);
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedResponseJsonError(handle, `parse_success_completion_failed:${ps.reason}`), ledgerComplete: false };
    }

    try {
      if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
        const r = handle.completeShapeFailure("invalid_shape");
        if (!r.ok) corrupt(handle, `shape_completion_failed:${r.reason}`);
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedResponseShapeError(handle, "invalid_shape"), ledgerComplete: false };
      }
      const extracted = extractRecords<T>(parsed);
      if (extracted === null) {
        const r = handle.completeRecordFailure("records_not_array");
        if (!r.ok) corrupt(handle, `record_completion_failed:${r.reason}`);
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new InvalidRecordCollectionError(handle, "records_not_array"), ledgerComplete: false };
      }
      const pag = extractPagination(parsed);
      if (!isValidPagination(pag)) {
        const r = handle.completePaginationFailure("invalid_pagination");
        if (!r.ok) corrupt(handle, `pagination_completion_failed:${r.reason}`);
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedPaginationError(handle, "invalid_pagination"), ledgerComplete: false };
      }
      const mr = handle.completeParsedMetadata({ recordCount: extracted.length, paginationHasMore: pag.hasMore, paginationNextPage: pag.nextPage, paginationTotalCount: pag.totalCount });
      if (!mr.ok) {
        corrupt(handle, `metadata_completion_failed:${mr.reason}`);
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MetadataCompletionError(handle, mr.reason), ledgerComplete: false };
      }
      const complete = completeness();
      if (!complete.complete) {
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new OwnedLedgerIncompleteError(handle, complete.incomplete), ledgerComplete: false };
      }
      return { records: extracted, pagination: pag, attempts, retries, permanentFailure: false, error: null, ledgerComplete: true };
    } catch (postParseErr) {
      if (postParseErr instanceof MetadataCompletionError || postParseErr instanceof OwnedLedgerIncompleteError) {
        return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: postParseErr, ledgerComplete: false };
      }
      const r = handle.completeBusinessUnexpectedFailure(postParseErr instanceof Error ? postParseErr.message : "unexpected_business_error");
      if (!r.ok) corrupt(handle, `business_unexpected_completion_failed:${r.reason}`);
      return { records: [], pagination: null, attempts, retries, permanentFailure: true, error: new MalformedResponseShapeError(handle, "business_unexpected_failure"), ledgerComplete: false };
    }
  }
  const complete = completeness();
  const error = lastOwnedHandle
    ? new OwnedLedgerIncompleteError(lastOwnedHandle, complete.incomplete)
    : new LedgerAssociationError("retry_loop_exhausted");
  return { records: [], pagination: null, attempts, retries, permanentFailure: true, error, ledgerComplete: complete.complete };
}
