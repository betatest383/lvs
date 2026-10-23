/**
 * Stage 2E.5 Shared Helpers (v4 — Evidence Integrity Corrections)
 *
 * SHARED between validateStage2E5CorrectedReconciliation (live verifier)
 * and validateStage2E5DeterministicTests (deterministic suite).
 *
 * v4 CORRECTIONS:
 *   1. Comprehensive credential and PII redaction (replaces no-op sanitizeOutput)
 *   2. Enhanced fetch instrumentation with complete request ledger
 *   3. Base44 entity operation instrumentation (proves zero writes via observation)
 *   4. Corrected raw-data classification (distinguishes adapter-preserved from intended)
 *   5. ENTITY_ADAPTER_EXISTS map for raw-data preservation status
 */

// ─── Value Sanitization ─────────────────────────────────────────────────────

export function sanitizeValue(val: any): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  const t = typeof val;
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "string") return "string";
  if (Array.isArray(val)) return "array";
  if (t === "object") return "object";
  return t;
}

export function wasNull(val: any): boolean {
  return val === null || val === undefined;
}

// ─── URL Classification ──────────────────────────────────────────────────────

export function isAuthUrl(url: string): boolean {
  return url.includes("auth.servicetitan.io") || url.includes("auth.beta.servicetitan.io");
}

export function isBusinessUrl(url: string): boolean {
  return !isAuthUrl(url) && (url.includes("servicetitan.io") || url.includes("servicetitan.com"));
}

export interface HttpCallRecord {
  url: string;
  method: string;
  isAuth: boolean;
  isBusiness: boolean;
}

export function classifyHttpRequest(url: string, method: string): HttpCallRecord {
  const auth = isAuthUrl(url);
  const business = isBusinessUrl(url);
  return { url, method: method.toUpperCase(), isAuth: auth, isBusiness: business };
}

// ─── Credential and PII Redaction ────────────────────────────────────────────

/**
 * Pattern-based redaction for structured secrets and PII.
 * Replaces all known credential patterns and PII patterns with [REDACTED] markers.
 * This is REAL redaction — not a pass-through.
 */
const REDACTION_PATTERNS: { name: string; pattern: RegExp; replacement: string }[] = [
  { name: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._\-]+/g, replacement: "Bearer [REDACTED]" },
  { name: "access_token_json", pattern: /"access_token"\s*:\s*"[^"]*"/g, replacement: '"access_token":"[REDACTED]"' },
  { name: "refresh_token_json", pattern: /"refresh_token"\s*:\s*"[^"]*"/g, replacement: '"refresh_token":"[REDACTED]"' },
  { name: "client_id_json", pattern: /"client_id"\s*:\s*"[^"]*"/g, replacement: '"client_id":"[REDACTED]"' },
  { name: "client_secret_json", pattern: /"client_secret"\s*:\s*"[^"]*"/g, replacement: '"client_secret":"[REDACTED]"' },
  { name: "app_key_header", pattern: /ST-App-Key\s*[:\s]*[\w\-]+/g, replacement: "ST-App-Key: [REDACTED]" },
  { name: "tenant_id_url", pattern: /tenant\/\d{3,}/g, replacement: "tenant/[REDACTED]" },
  { name: "auth_header", pattern: /Authorization\s*:\s*[^\s,}"]+/g, replacement: "Authorization: [REDACTED]" },
  { name: "scheduler_secret", pattern: /X-LVC-Scheduler-Secret\s*[:\s]*[\w\-]+/g, replacement: "X-LVC-Scheduler-Secret: [REDACTED]" },
  { name: "webhook_secret", pattern: /X-CRM-Webhook-Secret\s*[:\s]*[\w\-]+/g, replacement: "X-CRM-Webhook-Secret: [REDACTED]" },
  { name: "internal_secret", pattern: /X-LVC-Internal-Automation-Secret\s*[:\s]*[\w\-]+/g, replacement: "X-LVC-Internal-Automation-Secret: [REDACTED]" },
  { name: "email", pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, replacement: "[REDACTED_EMAIL]" },
  { name: "phone", pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
];

export function redactString(input: string): string {
  let result = input;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactObject(obj: any): any {
  const str = JSON.stringify(obj);
  const redacted = redactString(str);
  return JSON.parse(redacted);
}

export function redactWithKnownValues(input: string, knownValues: string[]): string {
  let result = redactString(input);
  for (const value of knownValues) {
    if (value && value.length > 2) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), "[REDACTED]");
    }
  }
  return result;
}

// ─── Synthetic Test Values (for deterministic redaction tests) ───────────────

export const SYNTHETIC_SECRETS = {
  bearerToken: "Bearer sy_test_bearer_token_abc123def456",
  accessToken: "sy_test_access_token_xyz789ghi012",
  refreshToken: "sy_test_refresh_token_mno345pqr678",
  clientId: "sy_test_client_id_stu901vwx234",
  clientSecret: "sy_test_client_secret_yza567bcd890",
  appKey: "sy_test_app_key_efg123hij456",
  tenantId: "999123456789",
  schedulerSecret: "sy_test_scheduler_secret_klm789nop012",
  webhookSecret: "sy_test_webhook_secret_qrs345tuv678",
  internalSecret: "sy_test_internal_secret_wxy901zab234",
};

export const SYNTHETIC_PII = {
  customerName: "John TestDoe",
  customerAddress: "123 Test Main St, Testville, TS 12345",
  customerEmail: "john.testdoe@testexample.com",
  customerPhone: "555-123-4567",
  employeeName: "Jane TestSmith",
  employeeEmail: "jane.testsmith@testexample.com",
};

export function getAllSyntheticValues(): string[] {
  return [...Object.values(SYNTHETIC_SECRETS), ...Object.values(SYNTHETIC_PII)];
}

export function verifyRedaction(redacted: string): { allRedacted: boolean; leakedValues: string[] } {
  const allValues = getAllSyntheticValues();
  const leakedValues: string[] = [];
  for (const value of allValues) {
    if (value.length > 2 && redacted.includes(value)) {
      leakedValues.push(value);
    }
  }
  return { allRedacted: leakedValues.length === 0, leakedValues };
}

// ─── Enhanced Fetch Instrumentation with Complete Request Ledger ─────────────

export interface RequestLedgerEntry {
  requestNumber: number;
  runId: string;
  timestamp: string;
  classification: "authentication" | "business" | "other";
  method: string;
  sanitizedEndpoint: string;
  sanitizedQueryParams: Record<string, string>;
  httpStatus: number | null;
  responseClassification: string;
  recordCount: number | null;
  paginationHasMore: boolean | null;
  paginationNextPage: number | null;
  paginationTotalCount: number | null;
  purpose: string;
}

function inferRequestPurpose(pathname: string, queryParams: Record<string, string>): string {
  if (pathname.includes("/connect/token")) return "OAuth token acquisition";
  if (pathname.includes("/purchase-order-types")) return "PO type cache build";
  if (pathname.includes("/purchase-orders")) return "Purchase order endpoint test";
  if (pathname.includes("/transfers")) return "Warehouse transfers endpoint test";
  if (pathname.includes("/adjustments")) return "Inventory adjustments endpoint test";
  if (pathname.includes("/receipts")) {
    if (queryParams["modifiedOnOrAfter"]) return "Receipts modifiedOnOrAfter test";
    if (queryParams["pageSize"] === "2") return "Receipts pagination test";
    return "Receipts endpoint test";
  }
  return "other";
}

export function instrumentFetchWithLedger(runId: string): {
  ledger: RequestLedgerEntry[];
  restore: () => void;
} {
  const ledger: RequestLedgerEntry[] = [];
  const originalFetch = globalThis.fetch;
  let requestCounter = 0;

  globalThis.fetch = (async (input: any, init?: any) => {
    requestCounter++;
    const reqNum = requestCounter;
    const url = typeof input === "string" ? input : (input?.url || String(input));
    const method = ((init?.method) || "GET").toUpperCase();
    const classified = classifyHttpRequest(url, method);

    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch { parsedUrl = new URL("http://unknown/"); }

    const sanitizedEndpoint = redactString(`${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`);
    const sanitizedQueryParams: Record<string, string> = {};
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      sanitizedQueryParams[key] = redactString(value);
    }

    const classification: "authentication" | "business" | "other" =
      classified.isAuth ? "authentication" :
      classified.isBusiness ? "business" : "other";

    const purpose = inferRequestPurpose(parsedUrl.pathname, sanitizedQueryParams);

    if (method !== "GET" && classified.isBusiness) {
      ledger.push({
        requestNumber: reqNum, runId, timestamp: new Date().toISOString(),
        classification, method, sanitizedEndpoint, sanitizedQueryParams,
        httpStatus: null, responseClassification: "BLOCKED_NON_GET_BUSINESS",
        recordCount: null, paginationHasMore: null, paginationNextPage: null, paginationTotalCount: null,
        purpose,
      });
      throw new Error(`NON-GET business request blocked: ${method} ${url}`);
    }

    const response = await originalFetch(input, init);
    let httpStatus = response.status;
    let responseClassification = classifyHttpStatus(response.status);
    let recordCount: number | null = null;
    let paginationHasMore: boolean | null = null;
    let paginationNextPage: number | null = null;
    let paginationTotalCount: number | null = null;

    try {
      const cloned = response.clone();
      const data = await cloned.json();
      const pag = parsePagination(data);
      recordCount = pag.records.length;
      paginationHasMore = pag.hasMore;
      paginationNextPage = pag.nextPage;
      paginationTotalCount = pag.totalCount;
    } catch { /* not JSON */ }

    ledger.push({
      requestNumber: reqNum, runId, timestamp: new Date().toISOString(),
      classification, method, sanitizedEndpoint, sanitizedQueryParams,
      httpStatus, responseClassification,
      recordCount, paginationHasMore, paginationNextPage, paginationTotalCount,
      purpose,
    });

    return response;
  }) as any;

  return {
    ledger,
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

// Backward-compatible wrapper
export function instrumentFetchForGetOnly(): {
  calls: HttpCallRecord[];
  restore: () => void;
} {
  const calls: HttpCallRecord[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input?.url || String(input));
    const method = ((init?.method) || "GET").toUpperCase();
    const record = classifyHttpRequest(url, method);
    calls.push(record);
    if (method !== "GET" && record.isBusiness) {
      throw new Error(`NON-GET business request blocked: ${method} ${url}`);
    }
    return originalFetch(input, init);
  }) as any;

  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

// ─── Base44 Entity Operation Instrumentation ────────────────────────────────

export interface Base44OperationRecord {
  operationType: string;
  entityType: string;
  timestamp: string;
  argsSummary: string;
  isWrite: boolean;
}

export function instrumentBase44Operations(base44: any): {
  operations: Base44OperationRecord[];
  writeOperations: Base44OperationRecord[];
  restore: () => void;
} {
  const operations: Base44OperationRecord[] = [];
  const writeOperations: Base44OperationRecord[] = [];

  if (!base44?.asServiceRole?.entities) {
    return { operations, writeOperations, restore: () => {} };
  }

  const originalEntities = base44.asServiceRole.entities;
  const WRITE_OPS = new Set(["create", "update", "delete", "bulkCreate", "bulkUpdate", "updateMany", "deleteMany"]);
  const ALL_OPS = ["create", "update", "delete", "filter", "list", "get", "bulkCreate", "bulkUpdate", "updateMany", "deleteMany", "schema", "subscribe"];

  const wrappedEntities: Record<string, any> = {};
  for (const entityName of Object.keys(originalEntities)) {
    const entity = originalEntities[entityName];
    if (!entity || typeof entity !== "object") {
      wrappedEntities[entityName] = entity;
      continue;
    }
    wrappedEntities[entityName] = {};
    for (const opName of ALL_OPS) {
      if (typeof entity[opName] === "function") {
        const original = entity[opName];
        wrappedEntities[entityName][opName] = async function (...args: any[]) {
          const record: Base44OperationRecord = {
            operationType: opName,
            entityType: String(entityName),
            timestamp: new Date().toISOString(),
            argsSummary: JSON.stringify(args).substring(0, 200),
            isWrite: WRITE_OPS.has(opName),
          };
          operations.push(record);
          if (WRITE_OPS.has(opName)) writeOperations.push(record);
          return original.apply(entity, args);
        };
      } else {
        wrappedEntities[entityName][opName] = entity[opName];
      }
    }
  }

  base44.asServiceRole.entities = wrappedEntities;

  return {
    operations,
    writeOperations,
    restore: () => { base44.asServiceRole.entities = originalEntities; },
  };
}

// ─── Pagination Parsing ─────────────────────────────────────────────────────

export interface PaginationResult {
  records: any[];
  hasMore: boolean | null;
  nextPage: number | null;
  totalCount: number | null;
}

export function parsePagination(data: any): PaginationResult {
  const records = Array.isArray(data) ? data : (data.data || data.items || []);
  const hasMore = data?.hasMore ?? data?.hasMoreResults ?? null;
  const nextPage = data?.nextPage ?? (hasMore ? 2 : null);
  const totalCount = data?.totalCount ?? null;
  return { records, hasMore, nextPage, totalCount };
}

// ─── Response Status Classification ──────────────────────────────────────────

export function classifyHttpStatus(status: number): string {
  if (status === 404) return "TESTED_ROUTE_NOT_FOUND";
  if (status === 403) return "BLOCKED_BY_PERMISSION";
  if (status >= 500) return "BLOCKED_BY_SERVER_ERROR";
  if (!status || status < 200 || status >= 300) return "BLOCKED_BY_HTTP_ERROR";
  return "OK";
}

export function classifyEmptyResult(records: any[]): string {
  return records.length > 0 ? "VERIFIED" : "BLOCKED_BY_NO_REPRESENTATIVE_DATA";
}

// ─── Entity Adapter Existence Map ────────────────────────────────────────────

export const ENTITY_ADAPTER_EXISTS: Record<string, boolean> = {
  PurchaseOrder: true,
  PurchaseOrderLine: true,
  PurchaseOrderTypeSnapshot: true,
  WarehouseTransfer: false,
  WarehouseTransferLine: false,
  InventoryAdjustment: false,
  Receipt: false,
  ReceiptLine: false,
};

// ─── Schema Comparison ───────────────────────────────────────────────────────

export interface ContractField {
  lvcField: string;
  type: string;
  nullable: boolean;
  nesting: string;
  raw?: boolean;
}

export interface ObservedField {
  type: string;
  wasNull: boolean;
}

export type RawDataPreservationStatus =
  | "SCHEMA_FIELD_EXISTS"
  | "ACTIVE_ADAPTER_PRESERVES_COMPLETE_RAW_OBJECT"
  | "ACTIVE_ADAPTER_PRESERVES_THIS_SPECIFIC_FIELD"
  | "INTENDED_FUTURE_MAPPING_ONLY"
  | "NO_ACTIVE_ADAPTER"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

export interface FieldDiff {
  changeNumber: number;
  area: string;
  entityOrContract: string;
  currentLvcField: string | null;
  currentType: string;
  currentNullable: boolean;
  currentNesting: string;
  observedStField: string;
  observedType: string | null;
  observedNullable: boolean | null;
  observedNesting: string;
  evidenceSource: string;
  representativeRecord: boolean;
  mismatchClassification: string;
  operationalEffect: string;
  requiredOrOptional: "required" | "optional";
  compatibilityImpact: string;
  migrationImpact: string;
  recommendedOwnerDecision: string;
  proposedFinalFieldDefinition: string;
  codeChangesRequired: boolean;
  stage2e2aAffected: boolean;
  rawDataPreservationStatus: RawDataPreservationStatus;
  adapterExists: boolean;
}

function classifyRawDataPreservation(
  isRawMapping: boolean,
  classification: string,
  adapterExists: boolean,
): RawDataPreservationStatus {
  if (classification === "CONTRACT_FIELD_NOT_OBSERVED" || classification === "UNRESOLVED_NO_REPRESENTATIVE_RECORD") {
    return "UNRESOLVED";
  }
  if (classification === "MISSING_FROM_CURRENT_CONTRACT") {
    return adapterExists
      ? "ACTIVE_ADAPTER_PRESERVES_COMPLETE_RAW_OBJECT"
      : "NO_ACTIVE_ADAPTER";
  }
  if (isRawMapping) {
    return adapterExists
      ? "ACTIVE_ADAPTER_PRESERVES_THIS_SPECIFIC_FIELD"
      : "INTENDED_FUTURE_MAPPING_ONLY";
  }
  return "NOT_APPLICABLE";
}

export function compareSchemaField(
  area: string,
  entityName: string,
  observedFields: Record<string, ObservedField>,
  contract: Record<string, ContractField>,
  hasRepresentativeRecord: boolean,
  nesting: string,
  startCounter: number,
  adapterExists?: boolean,
): { diffs: FieldDiff[]; nextCounter: number } {
  const adapter = adapterExists ?? (ENTITY_ADAPTER_EXISTS[entityName] ?? false);
  const diffs: FieldDiff[] = [];
  let counter = startCounter;

  for (const [stField, observed] of Object.entries(observedFields)) {
    counter++;
    if (!(stField in contract)) {
      const classification = "MISSING_FROM_CURRENT_CONTRACT";
      diffs.push({
        changeNumber: counter, area, entityOrContract: entityName,
        currentLvcField: null, currentType: "—", currentNullable: false, currentNesting: "not mapped",
        observedStField: stField, observedType: observed.type, observedNullable: observed.wasNull, observedNesting: nesting,
        evidenceSource: hasRepresentativeRecord ? "representative live record" : "endpoint access only",
        representativeRecord: hasRepresentativeRecord,
        mismatchClassification: classification,
        operationalEffect: `Field '${stField}' returned by ST but has no LVC entity field. Must be stored in servicetitan_raw_data or promoted.`,
        requiredOrOptional: "required",
        compatibilityImpact: adapter
          ? "Adapter preserves in raw_data."
          : "NO ACTIVE ADAPTER — field would be lost without adapter.",
        migrationImpact: "No migration needed if stored in raw_data.",
        recommendedOwnerDecision: "Store in servicetitan_raw_data (default) or promote to dedicated field.",
        proposedFinalFieldDefinition: `servicetitan_raw_data (JSON) — preserve '${stField}'`,
        codeChangesRequired: false, stage2e2aAffected: false,
        rawDataPreservationStatus: classifyRawDataPreservation(false, classification, adapter),
        adapterExists: adapter,
      });
    } else {
      const expected = contract[stField];
      let classification = "EXACT_MATCH";
      let effect = "No action needed.";
      let required: "required" | "optional" = "optional";

      if (!observed.wasNull && expected.type !== observed.type) {
        if (expected.type === "string" && observed.type === "number") {
          classification = "COMPATIBLE_MATCH";
          effect = `ST returns ${observed.type}, LVC stores as ${expected.type} (int64 safety).`;
        } else if (expected.raw) {
          classification = "COMPATIBLE_MATCH";
          effect = `Field stored in ${expected.lvcField} (raw_data).`;
        } else if (expected.type === "date" || expected.type === "date-time" || expected.type === "enum") {
          classification = "COMPATIBLE_MATCH";
          effect = `LVC declares ${expected.type}, ST returns ${observed.type}. Adapter normalizes.`;
        } else {
          classification = "TYPE_MISMATCH";
          effect = `Type mismatch: LVC expects ${expected.type}, ST returns ${observed.type}.`;
          required = "required";
        }
      } else if (expected.raw) {
        classification = "COMPATIBLE_MATCH";
        effect = adapter
          ? `Field stored in ${expected.lvcField} (raw_data). Active adapter preserves this field.`
          : `Field mapped to ${expected.lvcField} (raw_data) — INTENDED mapping, NO active adapter.`;
      }

      if (observed.wasNull && !expected.nullable) {
        classification = "NULLABILITY_MISMATCH";
        effect = `LVC expects non-null but ST returned null for ${stField}.`;
        required = "required";
      }

      const affects2E2A = (entityName === "PurchaseOrder" || entityName === "PurchaseOrderLine")
        && (classification === "TYPE_MISMATCH" || classification === "NULLABILITY_MISMATCH");

      diffs.push({
        changeNumber: counter, area, entityOrContract: entityName,
        currentLvcField: expected.lvcField, currentType: expected.type, currentNullable: expected.nullable, currentNesting: expected.nesting,
        observedStField: stField, observedType: observed.type, observedNullable: observed.wasNull, observedNesting: nesting,
        evidenceSource: hasRepresentativeRecord ? "representative live record" : "endpoint access only",
        representativeRecord: hasRepresentativeRecord,
        mismatchClassification: classification,
        operationalEffect: effect,
        requiredOrOptional: required,
        compatibilityImpact: classification === "EXACT_MATCH" || classification === "COMPATIBLE_MATCH" ? "No impact." : "Requires adapter update.",
        migrationImpact: "No migration needed.",
        recommendedOwnerDecision: classification === "EXACT_MATCH" || classification === "COMPATIBLE_MATCH" ? "No action needed." : "Review and update contract.",
        proposedFinalFieldDefinition: `${expected.lvcField}: ${expected.type}${expected.nullable ? " (nullable)" : ""}`,
        codeChangesRequired: classification === "TYPE_MISMATCH" || classification === "NULLABILITY_MISMATCH",
        stage2e2aAffected: affects2E2A,
        rawDataPreservationStatus: classifyRawDataPreservation(!!expected.raw, classification, adapter),
        adapterExists: adapter,
      });
    }
  }

  for (const [stField, expected] of Object.entries(contract)) {
    if (!(stField in observedFields)) {
      counter++;
      const affects2E2A = (entityName === "PurchaseOrder" || entityName === "PurchaseOrderLine");

      diffs.push({
        changeNumber: counter, area, entityOrContract: entityName,
        currentLvcField: expected.lvcField, currentType: expected.type, currentNullable: expected.nullable, currentNesting: expected.nesting,
        observedStField: stField, observedType: null, observedNullable: null, observedNesting: "not observed",
        evidenceSource: hasRepresentativeRecord ? "representative live record (field absent)" : "no representative data",
        representativeRecord: hasRepresentativeRecord,
        mismatchClassification: hasRepresentativeRecord ? "CONTRACT_FIELD_NOT_OBSERVED" : "UNRESOLVED_NO_REPRESENTATIVE_RECORD",
        operationalEffect: `LVC contract expects ST field '${stField}' but it was not in the API response.`,
        requiredOrOptional: "optional",
        compatibilityImpact: "Field may appear on other records.",
        migrationImpact: "No migration needed.",
        recommendedOwnerDecision: "Confirm field appears on non-empty records or is optional.",
        proposedFinalFieldDefinition: `${expected.lvcField}: ${expected.type}${expected.nullable ? " (nullable)" : ""}`,
        codeChangesRequired: false,
        stage2e2aAffected: affects2E2A,
        rawDataPreservationStatus: "UNRESOLVED",
        adapterExists: adapter,
      });
    }
  }

  return { diffs, nextCounter: counter };
}

// ─── PII Sanitization ────────────────────────────────────────────────────────

export function sanitizeTenantId(tenantId: string): string {
  if (!tenantId || tenantId.length < 3) return "[REDACTED]";
  return tenantId.substring(0, 3) + "[REDACTED]";
}

export function sanitizeOutput(obj: any): any {
  return redactObject(obj);
}

// ─── Checksum ────────────────────────────────────────────────────────────────

export async function calculateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}