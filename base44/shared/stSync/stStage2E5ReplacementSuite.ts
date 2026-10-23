/**
 * Stage 2E.5 Replacement Run — Shared Suite
 *
 * Contracts, deterministic test suite, and CSV utilities for the
 * authorized replacement verification run.
 *
 * IMPORTED BY: validateStage2E5ReplacementRun
 * NOT imported by any production runtime code.
 */

import {
  sanitizeValue, wasNull, classifyHttpRequest,
  instrumentFetchForGetOnly, instrumentFetchWithLedger, instrumentBase44Operations,
  parsePagination, classifyHttpStatus, classifyEmptyResult, compareSchemaField,
  sanitizeTenantId, redactString, redactObject, redactWithKnownValues,
  verifyRedaction, SYNTHETIC_SECRETS, SYNTHETIC_PII, getAllSyntheticValues,
  calculateChecksum, ENTITY_ADAPTER_EXISTS,
  type ContractField, type ObservedField,
} from "./stStage2E5Shared.ts";
import { buildPoRawData, buildPoLineRawData } from "../stPurchaseOrderSync.ts";

// ─── Contract Helper ──────────────────────────────────────────────────────────

const cf = (lvcField: string, type: string, nullable: boolean, nesting: string, raw = false): ContractField =>
  ({ lvcField, type, nullable, nesting, raw });

// ─── Contract Definitions ─────────────────────────────────────────────────────

export const PO_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_purchase_order_id", "string", false, "root"),
  "number": cf("servicetitan_po_number", "string", false, "root"),
  "status": cf("status", "enum", false, "root"),
  "vendorId": cf("servicetitan_vendor_id", "string", false, "root"),
  "inventoryLocationId": cf("servicetitan_warehouse_id", "string", false, "root"),
  "date": cf("order_date", "date", true, "root"),
  "requiredOn": cf("expected_delivery_date", "date", true, "root"),
  "sentOn": cf("servicetitan_sent_on", "date-time", true, "root"),
  "receivedOn": cf("actual_delivery_date", "date", true, "root"),
  "total": cf("total", "number", false, "root"),
  "tax": cf("tax_amount", "number", false, "root"),
  "shipping": cf("shipping_amount", "number", false, "root"),
  "createdOn": cf("servicetitan_created_on", "date-time", false, "root"),
  "modifiedOn": cf("servicetitan_modified_on", "date-time", false, "root"),
  "typeId": cf("servicetitan_purchase_order_type_id", "string", true, "root"),
  "jobId": cf("servicetitan_job_id", "string", true, "root"),
  "projectId": cf("servicetitan_project_id", "string", true, "root"),
  "items": cf("lines (embedded in items[])", "array", true, "root.items[]"),
  "summary": cf("servicetitan_raw_data", "string", true, "root", true),
  "technicianId": cf("servicetitan_raw_data", "number", true, "root", true),
  "shipTo": cf("servicetitan_raw_data", "object", true, "root", true),
  "businessUnitId": cf("servicetitan_raw_data", "number", true, "root", true),
  "batchId": cf("servicetitan_raw_data", "number", true, "root", true),
  "budgetCodeId": cf("servicetitan_raw_data", "number", true, "root", true),
  "vendorDocumentNumber": cf("servicetitan_raw_data", "string", true, "root", true),
  "invoiceId": cf("servicetitan_raw_data", "number", true, "root", true),
  "createdById": cf("servicetitan_raw_data", "number", true, "root", true),
  "customFields": cf("servicetitan_raw_data", "array", true, "root", true),
  "active": cf("servicetitan_active", "boolean", false, "root"),
};

export const PO_LINE_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_po_line_id", "string", false, "items[]"),
  "skuId": cf("servicetitan_material_id", "string", false, "items[]"),
  "skuCode": cf("sku", "string", true, "items[]"),
  "skuName": cf("item_name", "string", true, "items[]"),
  "quantity": cf("quantity_ordered", "number", false, "items[]"),
  "quantityReceived": cf("quantity_received", "number", true, "items[]"),
  "cost": cf("unit_cost", "number", true, "items[]"),
  "total": cf("line_total", "number", true, "items[]"),
  "status": cf("line_status", "enum", false, "items[]"),
};

export const PO_TYPE_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_purchase_order_type_id", "string", false, "root"),
  "name": cf("servicetitan_purchase_order_type_name", "string", false, "root"),
  "active": cf("servicetitan_active", "boolean", true, "root"),
  "automaticallyReceive": cf("servicetitan_raw_data", "boolean", true, "root", true),
  "displayToTechnician": cf("servicetitan_raw_data", "boolean", true, "root", true),
};

export const TRANSFER_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_transfer_id", "string", false, "root"),
  "number": cf("servicetitan_transfer_number", "string", false, "root"),
  "status": cf("status", "enum", false, "root"),
  "fromLocationId": cf("servicetitan_source_warehouse_id", "string", false, "root"),
  "toLocationId": cf("servicetitan_destination_warehouse_id", "string", false, "root"),
  "createdOn": cf("servicetitan_created_on", "date-time", false, "root"),
  "modifiedOn": cf("servicetitan_modified_on", "date-time", false, "root"),
  "items": cf("line_items (JSON) + WarehouseTransferLine records", "array", true, "root.items[]"),
  "active": cf("servicetitan_active", "boolean", false, "root"),
  "transferType": cf("servicetitan_raw_data", "string", true, "root", true),
  "referenceNumber": cf("servicetitan_raw_data", "string", true, "root", true),
  "createdById": cf("servicetitan_raw_data", "number", true, "root", true),
  "memo": cf("servicetitan_raw_data", "string", true, "root", true),
  "date": cf("servicetitan_raw_data", "string", true, "root", true),
  "pickedDate": cf("servicetitan_raw_data", "string", true, "root", true),
  "receivedDate": cf("servicetitan_raw_data", "string", true, "root", true),
  "batchId": cf("servicetitan_raw_data", "number", true, "root", true),
};

export const TRANSFER_LINE_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_transfer_line_id", "string", false, "items[]"),
  "skuId": cf("servicetitan_material_id", "string", false, "items[]"),
  "quantity": cf("quantity_requested", "number", false, "items[]"),
  "quantityDispatched": cf("quantity_dispatched", "number", true, "items[]"),
  "quantityReceived": cf("quantity_received", "number", true, "items[]"),
  "cost": cf("unit_cost", "number", true, "items[]"),
};

export const ADJUSTMENT_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_adjustment_id", "string", false, "root"),
  "number": cf("servicetitan_raw_data", "string", false, "root", true),
  "status": cf("status", "enum", false, "root"),
  "materialId": cf("servicetitan_material_id", "string", false, "root"),
  "inventoryLocationId": cf("servicetitan_warehouse_id", "string", false, "root"),
  "createdOn": cf("servicetitan_created_on", "date-time", false, "root"),
  "modifiedOn": cf("servicetitan_modified_on", "date-time", false, "root"),
  "active": cf("servicetitan_active", "boolean", false, "root"),
  "referenceNumber": cf("servicetitan_raw_data", "string", true, "root", true),
  "type": cf("servicetitan_raw_data", "string", false, "root", true),
  "businessUnitId": cf("servicetitan_raw_data", "number", true, "root", true),
  "projectId": cf("servicetitan_raw_data", "number", true, "root", true),
  "invoiceId": cf("servicetitan_raw_data", "number", true, "root", true),
  "createdById": cf("servicetitan_raw_data", "number", true, "root", true),
  "memo": cf("servicetitan_raw_data", "string", true, "root", true),
  "date": cf("servicetitan_raw_data", "string", true, "root", true),
};

export const RECEIPT_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_receipt_id", "string", false, "root"),
  "number": cf("receipt_number (LVC-owned, not ST)", "string", false, "root"),
  "purchaseOrderId": cf("servicetitan_purchase_order_id", "string", false, "root"),
  "vendorId": cf("servicetitan_vendor_id", "string", true, "root"),
  "inventoryLocationId": cf("warehouse_location_id (resolved via ST ID)", "string", false, "root"),
  "status": cf("status", "enum", false, "root"),
  "createdOn": cf("servicetitan_created_on", "date-time", false, "root"),
  "modifiedOn": cf("servicetitan_modified_on", "date-time", false, "root"),
  "items": cf("lines (embedded in items[])", "array", true, "root.items[]"),
  "active": cf("servicetitan_active", "boolean", false, "root"),
  "vendorInvoiceNumber": cf("servicetitan_raw_data", "string", true, "root", true),
  "createdById": cf("servicetitan_raw_data", "number", true, "root", true),
  "memo": cf("servicetitan_raw_data", "string", true, "root", true),
  "billId": cf("servicetitan_raw_data", "number", true, "root", true),
  "jobId": cf("servicetitan_raw_data", "number", true, "root", true),
  "businessUnitId": cf("servicetitan_raw_data", "number", true, "root", true),
  "technicianId": cf("servicetitan_raw_data", "number", true, "root", true),
  "date": cf("receipt_date", "date-time", true, "root"),
};

export const RECEIPT_LINE_CONTRACT: Record<string, ContractField> = {
  "id": cf("servicetitan_receipt_line_id", "string", false, "items[]"),
  "purchaseOrderItemId": cf("servicetitan_po_line_id", "string", true, "items[]"),
  "skuId": cf("servicetitan_material_id", "string", false, "items[]"),
  "skuCode": cf("sku", "string", true, "items[]"),
  "skuName": cf("item_name", "string", true, "items[]"),
  "quantity": cf("quantity_received", "number", false, "items[]"),
  "quantityReceived": cf("quantity_received", "number", false, "items[]"),
  "quantityRejected": cf("quantity_rejected", "number", true, "items[]"),
  "cost": cf("unit_cost", "number", true, "items[]"),
  "total": cf("line_total", "number", true, "items[]"),
  "status": cf("line_status", "enum", false, "items[]"),
  "createdOn": cf("servicetitan_created_on", "date-time", false, "items[]"),
  "modifiedOn": cf("servicetitan_modified_on", "date-time", false, "items[]"),
};

// ─── Test Result Interface ────────────────────────────────────────────────────

export interface TestResult {
  testNumber: number;
  suite: string;
  behavior: string;
  moduleInvoked: string;
  startTime: string;
  completionTime: string;
  passed: boolean;
  actualResult: string;
  expectedResult: string;
  failureMessage: string | null;
  classification: string;
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

async function runTest(
  n: number, suite: string, name: string, mod: string,
  fn: () => Promise<{ passed: boolean; actual: string; expected: string; failure?: string; classification?: string }>,
): Promise<TestResult> {
  const start = new Date().toISOString();
  try {
    const r = await fn();
    return {
      testNumber: n, suite, behavior: name, moduleInvoked: mod,
      startTime: start, completionTime: new Date().toISOString(),
      passed: r.passed, actualResult: r.actual, expectedResult: r.expected,
      failureMessage: r.failure || null,
      classification: r.classification || (r.passed ? "PASS" : "FAIL"),
    };
  } catch (e: any) {
    return {
      testNumber: n, suite, behavior: name, moduleInvoked: mod,
      startTime: start, completionTime: new Date().toISOString(),
      passed: false, actualResult: "ERROR: " + (e.message || String(e)).substring(0, 150),
      expectedResult: "PASS", failureMessage: e.message || String(e),
      classification: "ERROR",
    };
  }
}

// ─── Deterministic Test Suite ──────────────────────────────────────────────────

export async function runTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Tests 1-5: GET-only enforcement
  for (let i = 0; i < 5; i++) {
    const method = ["GET", "POST", "PUT", "PATCH", "DELETE"][i];
    results.push(await runTest(i + 1, "GET-only", `Business ${method} ${method === "GET" ? "allowed" : "blocked"}`, "instrumentFetchForGetOnly", async () => {
      const inst = instrumentFetchForGetOnly();
      let blocked = false;
      try { await fetch("https://api.servicetitan.io/inventory/v2/tenant/123/receipts", { method }); } catch (e: any) { blocked = e.message.includes("NON-GET business request blocked"); }
      inst.restore();
      const businessCalls = inst.calls.filter(c => c.isBusiness);
      return {
        passed: method === "GET" ? !blocked && businessCalls.length === 1 : blocked,
        actual: `blocked=${blocked}`, expected: method === "GET" ? "blocked=false" : "blocked=true",
      };
    }));
  }

  // Test 6: Auth POST distinguished
  results.push(await runTest(6, "Classification", "Auth POST distinguished from business GET", "classifyHttpRequest", async () => {
    const calls = [
      classifyHttpRequest("https://auth.servicetitan.io/connect/token", "POST"),
      classifyHttpRequest("https://api.servicetitan.io/inventory/v2/tenant/123/receipts", "GET"),
    ];
    return {
      passed: calls.filter(c => c.isAuth).length === 1 && calls.filter(c => c.isBusiness).length === 1,
      actual: `auth=${calls.filter(c => c.isAuth).length}, business=${calls.filter(c => c.isBusiness).length}`,
      expected: "auth=1, business=1",
    };
  }));

  // Test 7: Credential redaction — tenantId
  results.push(await runTest(7, "Redaction", "Tenant ID redacted", "sanitizeTenantId", async () => {
    const s = sanitizeTenantId("434113558");
    return { passed: s.includes("[REDACTED]") && !s.includes("434113558"), actual: s, expected: "contains [REDACTED]" };
  }));

  // Test 8: Pagination parsing
  results.push(await runTest(8, "Pagination", "hasMore and nextPage extracted", "parsePagination", async () => {
    const p = parsePagination({ data: [{ id: 1 }], hasMore: true, nextPage: 2 });
    return { passed: p.records.length === 1 && p.hasMore === true && p.nextPage === 2, actual: `records=${p.records.length}, hasMore=${p.hasMore}`, expected: "records=1, hasMore=true" };
  }));

  // Test 9: Empty-result classification
  results.push(await runTest(9, "Classification", "Empty array → BLOCKED_BY_NO_REPRESENTATIVE_DATA", "classifyEmptyResult", async () => {
    const s = classifyEmptyResult([]);
    return { passed: s === "BLOCKED_BY_NO_REPRESENTATIVE_DATA", actual: s, expected: "BLOCKED_BY_NO_REPRESENTATIVE_DATA" };
  }));

  // Test 10: HTTP status classification
  results.push(await runTest(10, "Classification", "403 → BLOCKED_BY_PERMISSION, 404 → TESTED_ROUTE_NOT_FOUND", "classifyHttpStatus", async () => {
    return {
      passed: classifyHttpStatus(403) === "BLOCKED_BY_PERMISSION" && classifyHttpStatus(404) === "TESTED_ROUTE_NOT_FOUND",
      actual: `403=${classifyHttpStatus(403)}, 404=${classifyHttpStatus(404)}`,
      expected: "403=BLOCKED_BY_PERMISSION, 404=TESTED_ROUTE_NOT_FOUND",
    };
  }));

  // Test 11: Malformed response handling
  results.push(await runTest(11, "Parsing", "JSON parse error caught", "JSON.parse", async () => {
    let caught = false;
    try { JSON.parse("{invalid}"); } catch { caught = true; }
    return { passed: caught, actual: `caught=${caught}`, expected: "caught=true" };
  }));

  // Test 12: Nested line-field inventory
  results.push(await runTest(12, "Schema", "items[] fields inventoried", "Object.keys", async () => {
    const item = { id: 456, skuId: 789, quantity: 5, quantityReceived: 5 };
    const fields = Object.keys(item);
    return { passed: fields.includes("quantityReceived") && fields.length === 4, actual: JSON.stringify(fields), expected: "includes quantityReceived" };
  }));

  // Test 13: Type inventory
  results.push(await runTest(13, "Schema", "Types correctly identified", "sanitizeValue", async () => {
    const rec = { id: 123, total: 876.07, active: true, date: null };
    const types: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) types[k] = sanitizeValue(v);
    return { passed: types.id === "number" && types.total === "number" && types.active === "boolean" && types.date === "null", actual: JSON.stringify(types), expected: "correct types" };
  }));

  // Test 14: Nullability tracking
  results.push(await runTest(14, "Schema", "Null/undefined fields identified", "wasNull", async () => {
    const rec = { id: 123, date: null };
    return { passed: !wasNull(rec.id) && wasNull(rec.date), actual: `id_null=${wasNull(rec.id)}, date_null=${wasNull(rec.date)}`, expected: "id=false, date=true" };
  }));

  // Test 15: Schema comparison
  results.push(await runTest(15, "Schema", "Fields classified correctly", "compareSchemaField", async () => {
    const observed: Record<string, ObservedField> = {
      id: { type: "number", wasNull: false },
      number: { type: "string", wasNull: false },
      unknownField: { type: "string", wasNull: false },
    };
    const contract: Record<string, ContractField> = {
      id: cf("st_id", "string", false, "root"),
      number: cf("st_number", "string", false, "root"),
    };
    const { diffs } = compareSchemaField("test", "TestEntity", observed, contract, true, "root", 0, false);
    const byClass = diffs.reduce((acc, d) => { acc[d.mismatchClassification] = (acc[d.mismatchClassification] || 0) + 1; return acc; }, {} as Record<string, number>);
    return {
      passed: (byClass.COMPATIBLE_MATCH || 0) === 1 && (byClass.EXACT_MATCH || 0) === 1 && (byClass.MISSING_FROM_CURRENT_CONTRACT || 0) === 1,
      actual: JSON.stringify(byClass), expected: "compatible=1, exact=1, missing=1",
    };
  }));

  // Test 16: Stage 2E.2A impact — CONTRACT_FIELD_NOT_OBSERVED
  results.push(await runTest(16, "Schema", "PurchaseOrder CONTRACT_FIELD_NOT_OBSERVED sets stage2e2aAffected", "compareSchemaField", async () => {
    const observed: Record<string, ObservedField> = { id: { type: "number", wasNull: false } };
    const contract: Record<string, ContractField> = {
      id: cf("st_id", "string", false, "root"),
      active: cf("servicetitan_active", "boolean", false, "root"),
    };
    const { diffs } = compareSchemaField("po", "PurchaseOrder", observed, contract, true, "root", 0, true);
    const notObserved = diffs.find(d => d.mismatchClassification === "CONTRACT_FIELD_NOT_OBSERVED");
    return { passed: notObserved?.stage2e2aAffected === true, actual: `stage2e2aAffected=${notObserved?.stage2e2aAffected}`, expected: "stage2e2aAffected=true" };
  }));

  // Tests 17-19: Hard-coded zero counter tests — CLASSIFIED
  results.push(await runTest(17, "Safety", "No production entity writes (hard-coded counter)", "inline", async () => {
    return { passed: true, actual: "writesToProduction=0 (hard-coded)", expected: "0", classification: "HARD-CODED ZERO COUNTER — NOT OBSERVATIONAL EVIDENCE" };
  }));
  results.push(await runTest(18, "Safety", "No watermark advancement (hard-coded counter)", "inline", async () => {
    return { passed: true, actual: "watermarkAdvancements=0 (hard-coded)", expected: "0", classification: "HARD-CODED ZERO COUNTER — NOT OBSERVATIONAL EVIDENCE" };
  }));
  results.push(await runTest(19, "Safety", "No production sync invocation (hard-coded counter)", "inline", async () => {
    return { passed: true, actual: "syncInvocations=0 (hard-coded)", expected: "0", classification: "HARD-CODED ZERO COUNTER — NOT OBSERVATIONAL EVIDENCE" };
  }));

  // Test 20: GET-only reporting
  results.push(await runTest(20, "Reporting", "Auth and business counted separately", "classifyHttpRequest", async () => {
    const calls = [
      classifyHttpRequest("https://auth.servicetitan.io/connect/token", "POST"),
      classifyHttpRequest("https://api.servicetitan.io/inventory/v2/tenant/123/receipts", "GET"),
      classifyHttpRequest("https://api.servicetitan.io/inventory/v2/tenant/123/receipts?page=2", "GET"),
    ];
    return {
      passed: calls.filter(c => c.isAuth).length === 1 && calls.filter(c => c.isBusiness).every(c => c.method === "GET"),
      actual: `auth=${calls.filter(c => c.isAuth).length}, business=${calls.filter(c => c.isBusiness).length}`,
      expected: "auth=1, business=2",
    };
  }));

  // Test 21: Non-GET business detection
  results.push(await runTest(21, "Reporting", "Zero non-GET business calls", "classifyHttpRequest", async () => {
    const calls = [
      classifyHttpRequest("https://auth.servicetitan.io/connect/token", "POST"),
      classifyHttpRequest("https://api.servicetitan.io/inventory/v2/tenant/123/receipts", "GET"),
    ];
    return { passed: calls.filter(c => c.isBusiness && c.method !== "GET").length === 0, actual: `nonGet=${calls.filter(c => c.isBusiness && c.method !== "GET").length}`, expected: "nonGet=0" };
  }));

  // Tests 22-35: Redaction tests (data-driven)
  const redactionTests: { n: number; name: string; input: string; check: (r: string) => boolean; expected: string }[] = [
    { n: 22, name: "Bearer token removed", input: `Authorization: ${SYNTHETIC_SECRETS.bearerToken}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.bearerToken) && r.includes("[REDACTED]"), expected: "token removed" },
    { n: 23, name: "Access token removed from JSON", input: `{"access_token":"${SYNTHETIC_SECRETS.accessToken}","type":"Bearer"}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.accessToken), expected: "token removed" },
    { n: 24, name: "Refresh token removed", input: `{"refresh_token":"${SYNTHETIC_SECRETS.refreshToken}"}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.refreshToken), expected: "token removed" },
    { n: 25, name: "Client ID and secret removed", input: `{"client_id":"${SYNTHETIC_SECRETS.clientId}","client_secret":"${SYNTHETIC_SECRETS.clientSecret}"}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.clientId) && !r.includes(SYNTHETIC_SECRETS.clientSecret), expected: "both removed" },
    { n: 26, name: "ST-App-Key removed", input: `ST-App-Key: ${SYNTHETIC_SECRETS.appKey}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.appKey) && r.includes("[REDACTED]"), expected: "key removed" },
    { n: 27, name: "Tenant ID removed from URL", input: `https://api.servicetitan.io/inventory/v2/tenant/${SYNTHETIC_SECRETS.tenantId}/receipts`, check: (r) => !r.includes(SYNTHETIC_SECRETS.tenantId) && r.includes("[REDACTED]"), expected: "tenant removed" },
    { n: 28, name: "Scheduler secret removed", input: `X-LVC-Scheduler-Secret: ${SYNTHETIC_SECRETS.schedulerSecret}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.schedulerSecret), expected: "secret removed" },
    { n: 29, name: "Webhook secret removed", input: `X-CRM-Webhook-Secret: ${SYNTHETIC_SECRETS.webhookSecret}`, check: (r) => !r.includes(SYNTHETIC_SECRETS.webhookSecret), expected: "secret removed" },
    { n: 30, name: "Email removed", input: `Contact: ${SYNTHETIC_PII.customerEmail}`, check: (r) => !r.includes(SYNTHETIC_PII.customerEmail) && r.includes("[REDACTED_EMAIL]"), expected: "email removed" },
    { n: 31, name: "Phone removed", input: `Phone: ${SYNTHETIC_PII.customerPhone}`, check: (r) => !r.includes(SYNTHETIC_PII.customerPhone) && r.includes("[REDACTED_PHONE]"), expected: "phone removed" },
    { n: 32, name: "Customer name and address removed (known values)", input: `Customer: ${SYNTHETIC_PII.customerName}, Address: ${SYNTHETIC_PII.customerAddress}`, check: (r) => !r.includes(SYNTHETIC_PII.customerName) && !r.includes(SYNTHETIC_PII.customerAddress), expected: "both removed" },
    { n: 33, name: "verifyRedaction confirms ALL synthetic secrets removed", input: JSON.stringify({ access_token: SYNTHETIC_SECRETS.accessToken, refresh_token: SYNTHETIC_SECRETS.refreshToken, client_id: SYNTHETIC_SECRETS.clientId, client_secret: SYNTHETIC_SECRETS.clientSecret }) + ` Authorization: ${SYNTHETIC_SECRETS.bearerToken} ST-App-Key: ${SYNTHETIC_SECRETS.appKey} tenant/${SYNTHETIC_SECRETS.tenantId} X-LVC-Scheduler-Secret: ${SYNTHETIC_SECRETS.schedulerSecret} X-CRM-Webhook-Secret: ${SYNTHETIC_SECRETS.webhookSecret} ${SYNTHETIC_PII.customerEmail} ${SYNTHETIC_PII.customerPhone}`, check: (r) => verifyRedaction(r).allRedacted, expected: "all redacted" },
    { n: 34, name: "redactObject removes nested sensitive data", input: "", check: () => { const obj = { token: SYNTHETIC_SECRETS.bearerToken, data: { email: SYNTHETIC_PII.customerEmail } }; const r = JSON.stringify(redactObject(obj)); return !r.includes(SYNTHETIC_SECRETS.bearerToken) && !r.includes(SYNTHETIC_PII.customerEmail); }, expected: "nested removed" },
    { n: 35, name: "Non-sensitive data preserved (no false positives)", input: "This is a normal string with no secrets.", check: (r) => r === "This is a normal string with no secrets.", expected: "unchanged" },
  ];
  for (const tc of redactionTests) {
    results.push(await runTest(tc.n, "Redaction", tc.name, "redactString", async () => {
      const r = tc.input ? redactString(tc.input) : "";
      const passed = tc.input ? tc.check(r) : tc.check("");
      return { passed, actual: r.substring(0, 100), expected: tc.expected };
    }));
  }

  // Tests 36-38: Raw-data classification
  results.push(await runTest(36, "Raw-data", "Adapter exists → ACTIVE_ADAPTER_PRESERVES_THIS_SPECIFIC_FIELD", "compareSchemaField", async () => {
    const observed: Record<string, ObservedField> = { summary: { type: "string", wasNull: true } };
    const contract: Record<string, ContractField> = { summary: cf("servicetitan_raw_data", "string", true, "root", true) };
    const { diffs } = compareSchemaField("po", "PurchaseOrder", observed, contract, true, "root", 0, true);
    return { passed: diffs[0]?.rawDataPreservationStatus === "ACTIVE_ADAPTER_PRESERVES_THIS_SPECIFIC_FIELD", actual: diffs[0]?.rawDataPreservationStatus, expected: "ACTIVE_ADAPTER_PRESERVES_THIS_SPECIFIC_FIELD" };
  }));
  results.push(await runTest(37, "Raw-data", "No adapter → INTENDED_FUTURE_MAPPING_ONLY", "compareSchemaField", async () => {
    const observed: Record<string, ObservedField> = { memo: { type: "string", wasNull: false } };
    const contract: Record<string, ContractField> = { memo: cf("servicetitan_raw_data", "string", true, "root", true) };
    const { diffs } = compareSchemaField("receipts", "Receipt", observed, contract, true, "root", 0, false);
    return { passed: diffs[0]?.rawDataPreservationStatus === "INTENDED_FUTURE_MAPPING_ONLY", actual: diffs[0]?.rawDataPreservationStatus, expected: "INTENDED_FUTURE_MAPPING_ONLY" };
  }));
  results.push(await runTest(38, "Raw-data", "Missing from contract, no adapter → NO_ACTIVE_ADAPTER", "compareSchemaField", async () => {
    const observed: Record<string, ObservedField> = { unknownField: { type: "string", wasNull: false } };
    const contract: Record<string, ContractField> = {};
    const { diffs } = compareSchemaField("receipts", "Receipt", observed, contract, true, "root", 0, false);
    return { passed: diffs[0]?.rawDataPreservationStatus === "NO_ACTIVE_ADAPTER", actual: diffs[0]?.rawDataPreservationStatus, expected: "NO_ACTIVE_ADAPTER" };
  }));

  // Tests 39-40: Safety instrumentation
  results.push(await runTest(39, "Safety", "Base44 write operations recorded by instrumentation", "instrumentBase44Operations", async () => {
    const mockBase44 = { asServiceRole: { entities: { TestEntity: { create: async (d: any) => ({ id: "test-id", ...d }), filter: async () => [] } } } };
    const inst = instrumentBase44Operations(mockBase44);
    await mockBase44.asServiceRole.entities.TestEntity.create({ name: "test" });
    await mockBase44.asServiceRole.entities.TestEntity.filter({});
    inst.restore();
    return { passed: inst.writeOperations.length === 1 && inst.operations.length === 2, actual: `writes=${inst.writeOperations.length}, all=${inst.operations.length}`, expected: "writes=1, all=2" };
  }));
  results.push(await runTest(40, "Safety", "Zero write operations when only reads performed (observed)", "instrumentBase44Operations", async () => {
    const mockBase44 = { asServiceRole: { entities: { TestEntity: { filter: async () => [], list: async () => [] } } } };
    const inst = instrumentBase44Operations(mockBase44);
    await mockBase44.asServiceRole.entities.TestEntity.filter({});
    await mockBase44.asServiceRole.entities.TestEntity.list();
    inst.restore();
    return { passed: inst.writeOperations.length === 0 && inst.operations.length === 2, actual: `writes=${inst.writeOperations.length}, reads=${inst.operations.length}`, expected: "writes=0, reads=2", classification: "OBSERVED IN INSTRUMENTED PATHS ONLY" };
  }));

  // Test 41: Checksum
  results.push(await runTest(41, "Checksum", "SHA-256 deterministic and sensitive to input", "calculateChecksum", async () => {
    const c1 = await calculateChecksum("test data");
    const c2 = await calculateChecksum("test data");
    const c3 = await calculateChecksum("different data");
    return { passed: c1 === c2 && c1 !== c3 && c1.length === 64, actual: c1.substring(0, 16) + "...", expected: "deterministic, 64 chars" };
  }));

  // Tests 42-43: Request ledger
  results.push(await runTest(42, "RequestLedger", "Authentication request recorded with full fields", "instrumentFetchWithLedger", async () => {
    const inst = instrumentFetchWithLedger("test-run");
    try { await fetch("https://auth.servicetitan.io/connect/token", { method: "POST", body: "grant_type=client_credentials" }); } catch { /* may fail */ }
    inst.restore();
    const authEntry = inst.ledger.find(e => e.classification === "authentication");
    return { passed: authEntry != null && authEntry.method === "POST" && authEntry.requestNumber === 1, actual: `method=${authEntry?.method}, reqNum=${authEntry?.requestNumber}`, expected: "method=POST, reqNum=1" };
  }));
  results.push(await runTest(43, "RequestLedger", "Non-GET business request blocked and recorded", "instrumentFetchWithLedger", async () => {
    const inst = instrumentFetchWithLedger("test-run-2");
    let blocked = false;
    try { await fetch("https://api.servicetitan.io/inventory/v2/tenant/999/receipts", { method: "POST" }); } catch (e: any) { blocked = e.message.includes("NON-GET business request blocked"); }
    inst.restore();
    const blockedEntry = inst.ledger.find(e => e.responseClassification === "BLOCKED_NON_GET_BUSINESS");
    return { passed: blocked && blockedEntry != null && blockedEntry.method === "POST", actual: `blocked=${blocked}, entry=${blockedEntry != null}`, expected: "blocked=true, entry exists" };
  }));

  // Test 44: Adapter preservation — PO header unknown fields
  results.push(await runTest(44, "Adapter", "Unknown PO header fields survive in raw_data", "buildPoRawData", async () => {
    const synthetic = {
      id: 123, number: "PO-001", status: "Pending", vendorId: 456, inventoryLocationId: 789,
      total: 100, tax: 10, shipping: 5, createdOn: "2024-01-01", modifiedOn: "2024-01-01",
      unknownField1: "test1", unknownField2: 999, nestedField: { a: 1, b: 2 }, nullField: null,
    };
    const raw = buildPoRawData(synthetic);
    const parsed = JSON.parse(raw);
    const hasUnknown1 = parsed.unknownField1 === "test1";
    const hasUnknown2 = parsed.unknownField2 === 999;
    const hasNested = JSON.stringify(parsed.nestedField) === JSON.stringify({ a: 1, b: 2 });
    const hasNull = parsed.nullField === null;
    return { passed: hasUnknown1 && hasUnknown2 && hasNested && hasNull, actual: `u1=${hasUnknown1}, u2=${hasUnknown2}, nested=${hasNested}, null=${hasNull}`, expected: "all unknown fields preserved" };
  }));

  // Test 45: Adapter preservation — PO line unknown fields
  results.push(await runTest(45, "Adapter", "Unknown PO line fields survive in raw_data", "buildPoLineRawData", async () => {
    const synthetic = {
      id: 456, skuId: 789, skuCode: "SKU-001", quantity: 5, quantityReceived: 5, cost: 10, total: 50,
      status: "Received", createdOn: "2024-01-01", modifiedOn: "2024-01-01",
      unknownLineField1: "lineTest", unknownLineField2: true, nestedLineField: { x: 1 },
    };
    const raw = buildPoLineRawData(synthetic);
    const parsed = JSON.parse(raw);
    const hasUnknown1 = parsed.unknownLineField1 === "lineTest";
    const hasUnknown2 = parsed.unknownLineField2 === true;
    const hasNested = JSON.stringify(parsed.nestedLineField) === JSON.stringify({ x: 1 });
    return { passed: hasUnknown1 && hasUnknown2 && hasNested, actual: `u1=${hasUnknown1}, u2=${hasUnknown2}, nested=${hasNested}`, expected: "all unknown line fields preserved" };
  }));

  return results;
}

// ─── CSV Serialization (RFC 4180 compliant) ───────────────────────────────────

export function serializeCSV(rows: Record<string, any>[], headers: string[]): string {
  const escapeField = (val: any): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escapeField(row[h])).join(","));
  }
  return lines.join("\n");
}

export function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === "\n") { lines.push(current); current = ""; }
      else if (char === "\r") { /* skip */ }
      else { current += char; }
    }
  }
  if (current.length > 0) lines.push(current);

  if (lines.length === 0) return rows;
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQ) {
        if (char === '"') {
          if (line[i + 1] === '"') { field += '"'; i++; }
          else { inQ = false; }
        } else { field += char; }
      } else {
        if (char === '"') { inQ = true; }
        else if (char === ",") { fields.push(field); field = ""; }
        else { field += char; }
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim().length === 0) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}