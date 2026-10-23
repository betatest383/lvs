/**
 * Stage 2E.7 Shadow Audit — Deterministic fixtures.
 *
 * Self-contained. No import of poSyncTestHarness. Frozen deterministic values
 * (no randomized IDs) so projected-state passes are reproducible.
 *
 * Test-only.
 */

export const FIX_NOW = "2026-08-03T12:00:00Z";
export const FIX_TENANT = "121";
export const FIX_ENV = "production";
export const FIX_ACTIVATION = "2026-08-01T00:00:00Z";

export function makeVendor(stId: string, name = ""): any {
  return { id: `vendor-${stId}`, servicetitan_vendor_id: stId, name: name || `Vendor ${stId}` };
}

export function makeWarehouse(stId: string, name = "", locationType = "warehouse"): any {
  return { id: `wh-${stId}`, servicetitan_warehouse_id: stId, name: name || `Warehouse ${stId}`, location_type: locationType };
}

export function makeMaterial(stId: string): any {
  return { id: `mat-${stId}`, servicetitan_material_id: stId, item_name: `Material ${stId}` };
}

export function makePoSource(id: number | string, overrides: any = {}): any {
  const numId = typeof id === "number" ? id : Number(id);
  return {
    id: numId,
    number: `PO-${id}`,
    status: "Pending",
    vendorId: 22549317,
    inventoryLocationId: 141,
    date: "2026-07-31T00:00:00Z",
    requiredOn: "2026-08-03T00:00:00Z",
    sentOn: null,
    receivedOn: null,
    total: 876.07,
    tax: 0,
    shipping: 0,
    createdOn: FIX_NOW,
    modifiedOn: FIX_NOW,
    typeId: 146,
    jobId: null,
    projectId: null,
    items: [
      {
        id: Number(String(id) + "01"),
        skuId: 38372634,
        skuCode: "03601669",
        skuName: "Test Material",
        quantity: 1,
        quantityReceived: 0,
        cost: 211.01,
        total: 211.01,
        status: "Pending",
        createdOn: FIX_NOW,
        modifiedOn: FIX_NOW,
      },
    ],
    ...overrides,
  };
}

export function makeWatermark(overrides: any = {}): any {
  return {
    id: "wm-po-1",
    watermark_key: "purchase_order_go_live",
    sync_strategy: "new_purchase_orders_only",
    activation_timestamp: FIX_ACTIVATION,
    status: "active",
    environment: FIX_ENV,
    tenant_id: FIX_TENANT,
    last_modified_scan_at: "2026-08-03T11:00:00Z",
    last_successful_sync_at: "2026-08-03T11:00:00Z",
    recovery_overlap_minutes: 5,
    recovery_window_status: "idle",
    ...overrides,
  };
}

export function makeEligibleSentPo(id: number): any {
  return makePoSource(id, { status: "Sent", createdOn: "2026-08-02T00:00:00Z" });
}

export function makePostActivationPendingPo(id: number): any {
  return makePoSource(id, { status: "Pending", createdOn: "2026-08-02T00:00:00Z" });
}

export function makePreActivationPo(id: number): any {
  return makePoSource(id, { status: "Sent", createdOn: "2026-07-15T00:00:00Z" });
}

export function makeNonEligibleStatusPo(id: number, status: string): any {
  return makePoSource(id, { status, createdOn: "2026-08-02T00:00:00Z" });
}

export function baseDeps(): any {
  return {
    vendors: [makeVendor("22549317")],
    warehouses: [makeWarehouse("141")],
    materials: [makeMaterial("38372634")],
  };
}

// Minimal fake adapter for the engine that classifies records using the same
// eligibility/dependency logic the real purchaseOrderAdapter uses, without
// importing stSyncEngine/purchaseOrderAdapter (keeps projected-state tests pure).
export interface FakeAdapterResult {
  sourceId: string;
  action: "created" | "updated" | "unchanged" | "deferred" | "skipped_pre_activation" | "failed";
  reason?: string;
}

export function fakeCheckEligibility(record: any, activationTs: string): { allowed: boolean; reason: string } {
  const createdOn = record?.createdOn;
  if (!createdOn) return { allowed: false, reason: "missing_created_on" };
  if (new Date(createdOn).getTime() < new Date(activationTs).getTime()) {
    return { allowed: false, reason: "pre_activation" };
  }
  const status = record?.status;
  if (status === null || status === undefined) return { allowed: false, reason: "status_missing" };
  if (status !== "Pending" && status !== "Sent") {
    if (["Received", "Canceled", "Partially Received"].includes(status)) return { allowed: false, reason: "status_not_pending_or_sent" };
    return { allowed: false, reason: "status_unknown" };
  }
  return { allowed: true, reason: "ok" };
}

export function fakeResolveDependencies(record: any, seed: any): { status: "satisfied" | "deferred"; reason?: string } {
  const vendorId = String(record?.vendorId ?? "");
  const whId = String(record?.inventoryLocationId ?? "");
  if (!vendorId) return { status: "deferred", reason: "VENDOR_MISSING_ID" };
  const vendorMatches = (seed.vendors || []).filter((v: any) => v.servicetitan_vendor_id === vendorId);
  if (vendorMatches.length === 0) return { status: "deferred", reason: "VENDOR_MISSING" };
  if (vendorMatches.length > 1) return { status: "deferred", reason: "VENDOR_AMBIGUOUS" };
  if (!whId) return { status: "deferred", reason: "WAREHOUSE_MISSING_ID" };
  const whMatches = (seed.warehouses || []).filter((w: any) => w.servicetitan_warehouse_id === whId);
  if (whMatches.length === 0) return { status: "deferred", reason: "WAREHOUSE_MISSING" };
  if (whMatches.length > 1) return { status: "deferred", reason: "WAREHOUSE_AMBIGUOUS" };
  return { status: "satisfied" };
}

export function fakeRecordsEqual(existing: any, mapped: any): boolean {
  return JSON.stringify(existing) === JSON.stringify(mapped);
}

// Synthetic secrets + PII for sanitization tests (mirrors stStage2E5Shared synthetic set).
export const SYNTH_LEAK_VALUE = "Bearer sy_test_bearer_token_abc123def456";
export const SYNTH_LEAK_EMAIL = "john.testdoe@testexample.com";