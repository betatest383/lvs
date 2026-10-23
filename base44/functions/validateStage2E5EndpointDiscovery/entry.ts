/**
 * validateStage2E5EndpointDiscovery — Stage 2E.5 Continuation
 *
 * Read-only endpoint discovery for receipts and bills, plus schema
 * reconciliation for all verified procurement endpoints.
 *
 * CONSTRAINTS:
 *   - GET requests ONLY. Fetch is instrumented to reject non-GET.
 *   - ZERO production entity writes.
 *   - ZERO watermark advancements.
 *   - ZERO production sync invocations.
 *   - Does NOT implement any proposed contract change.
 *   - Does NOT alter any approved contract.
 *
 * Purpose:
 *   1. Test the corrected receipt endpoint (inventory/v2, not procurement/v2).
 *   2. Test candidate bill endpoints.
 *   3. Compare observed API fields against LVC OS entity contracts.
 *   4. Return numbered schema differences for owner reconciliation.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  getAccessToken,
  getAppKey,
  getTenantId,
  getEnvironment,
  getApiBaseUrl,
  clearCachedToken,
} from "../../shared/stAuth.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDiff {
  changeNumber: number;
  area: string;
  expectedStField: string;
  observedStField: string | null;
  lvcField: string | null;
  expectedType: string;
  observedType: string | null;
  expectedNullable: boolean;
  observedNullable: boolean | null;
  classification: string;
  correctionRequired: boolean;
  operationalEffect: string;
  evidenceSource: string;
  representativeRecord: boolean;
}

interface AreaResult {
  area: string;
  endpoint: string;
  method: string;
  httpStatus: number | null;
  recordsReturned: number;
  hasRepresentativeRecord: boolean;
  status: string;
  errorOrBlockerInfo: string | null;
  fieldNames: string[];
  fieldTypes: Record<string, { type: string; wasNull: boolean }>;
  schemaDifferences: FieldDiff[];
}

// ─── LVC OS Contract Definitions ─────────────────────────────────────────────
// Maps ST API field → LVC entity field, type, nullability

const PO_CONTRACT: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }> = {
  "id": { lvcField: "servicetitan_purchase_order_id", type: "string", nullable: false },
  "number": { lvcField: "servicetitan_po_number", type: "string", nullable: false },
  "status": { lvcField: "status", type: "enum", nullable: false },
  "vendorId": { lvcField: "servicetitan_vendor_id", type: "string", nullable: false },
  "inventoryLocationId": { lvcField: "servicetitan_warehouse_id", type: "string", nullable: false },
  "date": { lvcField: "order_date", type: "date", nullable: true },
  "requiredOn": { lvcField: "expected_delivery_date", type: "date", nullable: true },
  "sentOn": { lvcField: "servicetitan_sent_on", type: "date-time", nullable: true },
  "receivedOn": { lvcField: "actual_delivery_date", type: "date", nullable: true },
  "total": { lvcField: "total", type: "number", nullable: false },
  "tax": { lvcField: "tax_amount", type: "number", nullable: false },
  "shipping": { lvcField: "shipping_amount", type: "number", nullable: false },
  "createdOn": { lvcField: "servicetitan_created_on", type: "date-time", nullable: false },
  "modifiedOn": { lvcField: "servicetitan_modified_on", type: "date-time", nullable: false },
  "typeId": { lvcField: "servicetitan_purchase_order_type_id", type: "string", nullable: true },
  "jobId": { lvcField: "servicetitan_job_id", type: "string", nullable: true },
  "projectId": { lvcField: "servicetitan_project_id", type: "string", nullable: true },
  "items": { lvcField: "lines (embedded)", type: "array", nullable: true },
  // Fields intentionally stored in raw_data (not promoted to LVC schema)
  "summary": { lvcField: "servicetitan_raw_data", type: "string", nullable: true, raw: true },
  "technicianId": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
  "shipTo": { lvcField: "servicetitan_raw_data", type: "object", nullable: true, raw: true },
  "businessUnitId": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
  "batchId": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
  "budgetCodeId": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
  "vendorDocumentNumber": { lvcField: "servicetitan_raw_data", type: "string", nullable: true, raw: true },
  "invoiceId": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
  "createdById": { lvcField: "servicetitan_raw_data", type: "number", nullable: true, raw: true },
};

const PO_TYPE_CONTRACT: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }> = {
  "id": { lvcField: "servicetitan_purchase_order_type_id", type: "string", nullable: false },
  "name": { lvcField: "servicetitan_purchase_order_type_name", type: "string", nullable: false },
  "active": { lvcField: "raw_data", type: "boolean", nullable: true, raw: true },
};

const TRANSFER_CONTRACT: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }> = {
  "id": { lvcField: "servicetitan_transfer_id", type: "string", nullable: false },
  "number": { lvcField: "servicetitan_transfer_number", type: "string", nullable: false },
  "status": { lvcField: "status", type: "enum", nullable: false },
  "fromWarehouseId": { lvcField: "servicetitan_source_warehouse_id", type: "string", nullable: false },
  "toWarehouseId": { lvcField: "servicetitan_destination_warehouse_id", type: "string", nullable: false },
  "createdOn": { lvcField: "servicetitan_created_on", type: "date-time", nullable: false },
  "modifiedOn": { lvcField: "servicetitan_modified_on", type: "date-time", nullable: false },
  "items": { lvcField: "lines (embedded)", type: "array", nullable: true },
};

const ADJUSTMENT_CONTRACT: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }> = {
  "id": { lvcField: "servicetitan_adjustment_id", type: "string", nullable: false },
  "status": { lvcField: "status", type: "enum", nullable: false },
  "materialId": { lvcField: "servicetitan_material_id", type: "string", nullable: false },
  "warehouseId": { lvcField: "servicetitan_warehouse_id", type: "string", nullable: false },
  "createdOn": { lvcField: "servicetitan_created_on", type: "date-time", nullable: false },
  "modifiedOn": { lvcField: "servicetitan_modified_on", type: "date-time", nullable: false },
};

const RECEIPT_CONTRACT: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }> = {
  "id": { lvcField: "servicetitan_receipt_id", type: "string", nullable: false },
  "purchaseOrderId": { lvcField: "servicetitan_purchase_order_id", type: "string", nullable: false },
  "vendorId": { lvcField: "servicetitan_vendor_id", type: "string", nullable: true },
  "status": { lvcField: "status", type: "enum", nullable: false },
  "createdOn": { lvcField: "servicetitan_created_on", type: "date-time", nullable: false },
  "modifiedOn": { lvcField: "servicetitan_modified_on", type: "date-time", nullable: false },
  "items": { lvcField: "lines (embedded)", type: "array", nullable: true },
};

// ─── HTTP Call Instrumentation ────────────────────────────────────────────────

let changeCounter = 0;

function sanitizeValue(val: any): string {
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

function wasNull(val: any): boolean {
  return val === null || val === undefined;
}

// ─── Schema Comparison ────────────────────────────────────────────────────────

function compareSchema(
  area: string,
  observedFields: Record<string, { type: string; wasNull: boolean }>,
  contract: Record<string, { lvcField: string; type: string; nullable: boolean; raw?: boolean }>,
  hasRepresentativeRecord: boolean,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Fields observed in ST API but NOT in the LVC OS contract
  for (const [stField, observed] of Object.entries(observedFields)) {
    if (!(stField in contract)) {
      changeCounter++;
      diffs.push({
        changeNumber: changeCounter,
        area,
        expectedStField: stField,
        observedStField: stField,
        lvcField: null,
        expectedType: "—",
        observedType: observed.type,
        expectedNullable: false,
        observedNullable: observed.wasNull,
        classification: "MISSING_FROM_CURRENT_CONTRACT",
        correctionRequired: true,
        operationalEffect: `Field '${stField}' returned by ServiceTitan but has no LVC OS contract mapping. Currently lost or stored in raw_data.`,
        evidenceSource: hasRepresentativeRecord ? "representative live record" : "endpoint access only",
        representativeRecord: hasRepresentativeRecord,
      });
    }
  }

  // Fields in the LVC OS contract that ARE observed in ST
  for (const [stField, expected] of Object.entries(contract)) {
    if (stField in observedFields) {
      const observed = observedFields[stField];
      let classification = "EXACT_MATCH";
      let correctionRequired = false;
      let effect = "No action needed.";

      // Type mismatch check (but allow null observations for nullable fields)
      if (!observed.wasNull && expected.type !== "—" && expected.type !== observed.type) {
        // int64 stored as string is intentional (COMPATIBLE_MATCH)
        if (expected.type === "string" && observed.type === "number") {
          classification = "COMPATIBLE_MATCH";
          effect = `ST returns ${observed.type}, LVC stores as ${expected.type} (int64 safety). Compatible — adapter converts.`;
        } else if (expected.raw) {
          classification = "COMPATIBLE_MATCH";
          effect = `Field stored in ${expected.lvcField} (raw_data). Compatible — preserved on sync.`;
        } else {
          classification = "TYPE_MISMATCH";
          correctionRequired = true;
          effect = `Type mismatch: LVC expects ${expected.type}, ST returns ${observed.type}.`;
        }
      } else if (expected.raw) {
        classification = "COMPATIBLE_MATCH";
        effect = `Field stored in ${expected.lvcField} (raw_data). Compatible — preserved on sync.`;
      }

      // Nullability mismatch
      if (observed.wasNull && !expected.nullable) {
        classification = "NULLABILITY_MISMATCH";
        correctionRequired = true;
        effect = `LVC expects non-null but ST returned null for ${stField}.`;
      }

      changeCounter++;
      diffs.push({
        changeNumber: changeCounter,
        area,
        expectedStField: stField,
        observedStField: stField,
        lvcField: expected.lvcField,
        expectedType: expected.type,
        observedType: observed.type,
        expectedNullable: expected.nullable,
        observedNullable: observed.wasNull,
        classification,
        correctionRequired,
        operationalEffect: effect,
        evidenceSource: hasRepresentativeRecord ? "representative live record" : "endpoint access only",
        representativeRecord: hasRepresentativeRecord,
      });
    } else {
      // Field in contract but NOT observed in ST response
      changeCounter++;
      diffs.push({
        changeNumber: changeCounter,
        area,
        expectedStField: stField,
        observedStField: null,
        lvcField: expected.lvcField,
        expectedType: expected.type,
        observedType: null,
        expectedNullable: expected.nullable,
        observedNullable: null,
        classification: hasRepresentativeRecord ? "PROPOSED_BUT_NOT_OBSERVED" : "UNRESOLVED — NO REPRESENTATIVE LIVE RECORD",
        correctionRequired: false,
        operationalEffect: `LVC contract field ${expected.lvcField} expects ST field ${stField} but it was not observed in the API response.`,
        evidenceSource: hasRepresentativeRecord ? "representative live record (field absent)" : "no representative data",
        representativeRecord: hasRepresentativeRecord,
      });
    }
  }

  return diffs;
}

// ─── Endpoint Testing ─────────────────────────────────────────────────────────

async function testEndpoint(
  area: string,
  path: string,
  environment: string,
  contract: Record<string, any>,
  evidenceSource: string,
): Promise<AreaResult> {
  const result: AreaResult = {
    area,
    endpoint: path,
    method: "GET",
    httpStatus: null,
    recordsReturned: 0,
    hasRepresentativeRecord: false,
    status: "UNRESOLVED",
    errorOrBlockerInfo: null,
    fieldNames: [],
    fieldTypes: {},
    schemaDifferences: [],
  };

  try {
    const token = await getAccessToken(environment);
    const appKey = getAppKey();
    const baseUrl = getApiBaseUrl(environment);
    const url = `${baseUrl}${path}?page=1&pageSize=1`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "ST-App-Key": appKey,
      },
    });

    result.httpStatus = response.status;

    if (response.status === 404) {
      result.status = "TESTED ROUTE NOT FOUND";
      result.errorOrBlockerInfo = `Not Found (404): endpoint does not exist at tested path`;
      return result;
    }

    if (response.status === 403) {
      result.status = "BLOCKED BY PERMISSION";
      result.errorOrBlockerInfo = `Forbidden (403): connected app lacks required scope`;
      return result;
    }

    if (!response.ok) {
      const text = await response.text();
      result.status = "BLOCKED BY PERMISSION";
      result.errorOrBlockerInfo = `HTTP ${response.status}: ${text.substring(0, 200)}`;
      return result;
    }

    const data = await response.json();
    const records = Array.isArray(data) ? data : (data.data || data.items || []);
    result.recordsReturned = records.length;

    if (records.length > 0) {
      result.hasRepresentativeRecord = true;
      result.status = "VERIFIED";
      const record = records[0];
      for (const [key, val] of Object.entries(record)) {
        result.fieldNames.push(key);
        result.fieldTypes[key] = { type: sanitizeValue(val), wasNull: wasNull(val) };
      }
      result.schemaDifferences = compareSchema(area, result.fieldTypes, contract, true);
    } else {
      result.status = "BLOCKED BY NO REPRESENTATIVE DATA";
    }
  } catch (error) {
    result.status = "UNRESOLVED — NO REPRESENTATIVE LIVE RECORD";
    result.errorOrBlockerInfo = error.message?.substring(0, 200) || String(error);
  }

  return result;
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    // Instrument fetch to enforce GET-only
    const httpCalls: { url: string; method: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : (input?.url || String(input));
      const method = ((init?.method) || "GET").toUpperCase();
      httpCalls.push({ url, method });
      if (method !== "GET" && !url.includes("auth.servicetitan.io") && !url.includes("auth.beta.servicetitan.io")) {
        throw new Error(`NON-GET request blocked: ${method} ${url}`);
      }
      return originalFetch(input, init);
    }) as any;

    const tenantId = getTenantId();
    const environment = getEnvironment();
    changeCounter = 0;
    const areas: AreaResult[] = [];

    try {
      // ── 1. Re-verify purchase_orders ──
      areas.push(await testEndpoint(
        "purchase_orders",
        `/inventory/v2/tenant/${tenantId}/purchase-orders`,
        environment,
        PO_CONTRACT,
        "Stage 2E.2A approved contract + live API",
      ));

      // ── 2. Re-verify purchase_order_types ──
      areas.push(await testEndpoint(
        "purchase_order_types",
        `/inventory/v2/tenant/${tenantId}/purchase-order-types`,
        environment,
        PO_TYPE_CONTRACT,
        "Stage 2E.2A approved contract + live API",
      ));

      // ── 3. Re-verify warehouse_transfers ──
      areas.push(await testEndpoint(
        "warehouse_transfers",
        `/inventory/v2/tenant/${tenantId}/transfers`,
        environment,
        TRANSFER_CONTRACT,
        "LVC OS contract + live API",
      ));

      // ── 4. Re-verify inventory_adjustments ──
      areas.push(await testEndpoint(
        "inventory_adjustments",
        `/inventory/v2/tenant/${tenantId}/adjustments`,
        environment,
        ADJUSTMENT_CONTRACT,
        "LVC OS contract + live API",
      ));

      // ── 5. Receipt endpoint discovery — CORRECTED path ──
      // The original /procurement/v2/ path returned 404.
      // The ServiceTitan native API reference documents receipts at:
      //   GET inventory/v2/tenant/{tenant}/receipts
      areas.push(await testEndpoint(
        "receipts_corrected",
        `/inventory/v2/tenant/${tenantId}/receipts`,
        environment,
        RECEIPT_CONTRACT,
        "ServiceTitan native API reference (github.com/mindcloud-inc/universal-api-reference)",
      ));

      // ── 6. Bill endpoint discovery — candidate paths ──
      // ServiceTitan docs state: "The ServiceTitan API does not directly create bills.
      // However, you can use Purchase Orders to generate bills automatically."
      // The Inventory API description mentions "inventory bills".
      // Test candidate paths:

      const billCandidates = [
        { path: `/inventory/v2/tenant/${tenantId}/bills`, source: "inventory bills (apis.io description)" },
        { path: `/inventory/v2/tenant/${tenantId}/inventory-bills`, source: "inventory-bills (alternate naming)" },
        { path: `/accounting/v2/tenant/${tenantId}/bills`, source: "accounting/v2 bills (AP)" },
        { path: `/inventory/v2/tenant/${tenantId}/vendor-bills`, source: "vendor-bills (alternate naming)" },
      ];

      for (const candidate of billCandidates) {
        const billResult = await testEndpoint(
          "bills_discovery",
          candidate.path,
          environment,
          {}, // No contract — discovery only
          candidate.source,
        );
        billResult.area = `bills_discovery_${candidate.path.split("/").pop()}`;
        areas.push(billResult);
      }

      clearCachedToken();
    } finally {
      globalThis.fetch = originalFetch;
      clearCachedToken();
    }

    // ── Verify GET-only enforcement ──
    const nonGetCalls = httpCalls.filter((c) => c.method !== "GET");
    const apiCalls = httpCalls.filter((c) => !c.url.includes("auth.servicetitan.io") && !c.url.includes("auth.beta.servicetitan.io"));
    const allGetOnly = nonGetCalls.length === 0;

    // ── Count results ──
    const verified = areas.filter((a) => a.status === "VERIFIED").length;
    const notFound = areas.filter((a) => a.status === "TESTED ROUTE NOT FOUND").length;
    const blocked = areas.filter((a) => a.status === "BLOCKED BY PERMISSION").length;
    const noData = areas.filter((a) => a.status === "BLOCKED BY NO REPRESENTATIVE DATA").length;

    const totalDiffs = areas.reduce((sum, a) => sum + a.schemaDifferences.length, 0);
    const requiredCorrections = areas.reduce(
      (sum, a) => sum + a.schemaDifferences.filter((d) => d.correctionRequired).length, 0,
    );

    // ── Check for "diffs" mode in request body ──
    let outputMode = "full";
    let areaFilter: string | null = null;
    try {
      const body = await req.clone().json();
      if (body && body.output_mode) outputMode = body.output_mode;
      if (body && body.area_filter) areaFilter = body.area_filter;
    } catch { /* no body */ }

    // ── In "diffs" mode, return ONLY schema differences (no fieldTypes/names) ──
    if (outputMode === "compact_diffs") {
      const filteredAreas = areaFilter ? areas.filter((a) => a.area === areaFilter) : areas;
      const compactDiffLines: string[] = [];
      for (const a of filteredAreas) {
        compactDiffLines.push(`### AREA: ${a.area} | endpoint: ${a.endpoint} | status: ${a.status} | httpStatus: ${a.httpStatus} | fields: ${a.fieldNames.length} | diffs: ${a.schemaDifferences.length}`);
        if (a.errorOrBlockerInfo) {
          compactDiffLines.push(`ERROR: ${a.errorOrBlockerInfo}`);
        }
        for (const d of a.schemaDifferences) {
          compactDiffLines.push(`${d.changeNumber}|${d.expectedStField}|${d.observedStField || "—"}|${d.lvcField || "—"}|${d.expectedType}|${d.observedType || "—"}|${d.expectedNullable}|${d.observedNullable !== null ? d.observedNullable : "—"}|${d.classification}|${d.correctionRequired ? "REQ" : "opt"}|${d.evidenceSource}`);
        }
      }
      return Response.json({
        stage: "2E.5",
        mode: "compact_diffs",
        executedAt: new Date().toISOString(),
        environment,
        requestInstrumentation: {
          totalCalls: httpCalls.length,
          nonGetApiCalls: httpCalls.filter((c) => c.method !== "GET" && !c.url.includes("auth.")),
          allGetOnly: httpCalls.filter((c) => c.method !== "GET" && !c.url.includes("auth.")).length === 0,
        },
        writesToProductionEntities: 0,
        watermarkAdvancementAttempts: 0,
        productionSyncInvocations: 0,
        summary: `Endpoint Discovery: ${verified} verified, ${notFound} route not found, ${blocked} blocked by permission, ${noData} no representative data. Total proposed changes: ${totalDiffs} (${requiredCorrections} required).`,
        totalProposedChanges: totalDiffs,
        requiredCorrections,
        compactDiffs: compactDiffLines,
      });
    }

    if (outputMode === "diffs") {
      const filteredAreas = areaFilter ? areas.filter((a) => a.area === areaFilter) : areas;
      const diffAreas = filteredAreas.map((a) => ({
        area: a.area,
        endpoint: a.endpoint,
        httpStatus: a.httpStatus,
        status: a.status,
        recordsReturned: a.recordsReturned,
        hasRepresentativeRecord: a.hasRepresentativeRecord,
        fieldCount: a.fieldNames.length,
        schemaDiffCount: a.schemaDifferences.length,
        schemaDifferences: a.schemaDifferences.map((d) => ({
          changeNumber: d.changeNumber,
          expectedStField: d.expectedStField,
          observedStField: d.observedStField,
          lvcField: d.lvcField,
          expectedType: d.expectedType,
          observedType: d.observedType,
          expectedNullable: d.expectedNullable,
          observedNullable: d.observedNullable,
          classification: d.classification,
          correctionRequired: d.correctionRequired,
          operationalEffect: d.operationalEffect,
          evidenceSource: d.evidenceSource,
          representativeRecord: d.representativeRecord,
        })),
      }));
      return Response.json({
        stage: "2E.5",
        mode: "endpoint_discovery",
        outputMode: "diffs",
        executedAt: new Date().toISOString(),
        environment,
        requestInstrumentation: {
          totalCalls: httpCalls.length,
          apiCalls: httpCalls.filter((c) => !c.url.includes("auth.")).length,
          nonGetApiCalls: httpCalls.filter((c) => c.method !== "GET" && !c.url.includes("auth.")),
          allGetOnly: httpCalls.filter((c) => c.method !== "GET" && !c.url.includes("auth.")).length === 0,
        },
        writesToProductionEntities: 0,
        watermarkAdvancementAttempts: 0,
        productionSyncInvocations: 0,
        summary: `Endpoint Discovery: ${verified} verified, ${notFound} route not found, ${blocked} blocked by permission, ${noData} no representative data. Total proposed changes: ${totalDiffs} (${requiredCorrections} required).`,
        areas: diffAreas,
        totalProposedChanges: totalDiffs,
        requiredCorrections,
      });
    }

    // ── Compact output (just diffs, no large record structures) ──
    const compactAreas = areas.map((a) => ({
      area: a.area,
      endpoint: a.endpoint,
      method: a.method,
      httpStatus: a.httpStatus,
      recordsReturned: a.recordsReturned,
      hasRepresentativeRecord: a.hasRepresentativeRecord,
      status: a.status,
      errorOrBlockerInfo: a.errorOrBlockerInfo,
      fieldCount: a.fieldNames.length,
      fieldNames: a.fieldNames,
      fieldTypes: a.fieldTypes,
      schemaDiffCount: a.schemaDifferences.length,
      schemaDifferences: a.schemaDifferences.map((d) => ({
        changeNumber: d.changeNumber,
        area: d.area,
        expectedStField: d.expectedStField,
        observedStField: d.observedStField,
        lvcField: d.lvcField,
        expectedType: d.expectedType,
        observedType: d.observedType,
        expectedNullable: d.expectedNullable,
        observedNullable: d.observedNullable,
        classification: d.classification,
        correctionRequired: d.correctionRequired,
        operationalEffect: d.operationalEffect,
        evidenceSource: d.evidenceSource,
        representativeRecord: d.representativeRecord,
      })),
    }));

    return Response.json({
      stage: "2E.5",
      mode: "endpoint_discovery",
      executedAt: new Date().toISOString(),
      environment,
      tenantId: tenantId.substring(0, 3) + "[REDACTED]",
      requestInstrumentation: {
        totalCalls: httpCalls.length,
        apiCalls: apiCalls.length,
        nonGetApiCalls: nonGetCalls.filter((c) => !c.url.includes("auth.")),
        allGetOnly,
      },
      writesToProductionEntities: 0,
      watermarkAdvancementAttempts: 0,
      productionSyncInvocations: 0,
      summary: `Endpoint Discovery: ${verified} verified, ${notFound} route not found, ${blocked} blocked by permission, ${noData} no representative data. GET-only: ${allGetOnly ? "PASS" : "FAIL"}. Total proposed changes: ${totalDiffs} (${requiredCorrections} required).`,
      areas: compactAreas,
      totalProposedChanges: totalDiffs,
      requiredCorrections,
    });
  } catch (error) {
    console.error("[ST 2E.5 DISCOVERY ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Endpoint discovery failed" }, { status: 500 });
  }
}