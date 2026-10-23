/**
 * Purchase Order Sync — Test Harness (shared mock scaffolding)
 *
 * Mock base44 client and source-record factories used by the deterministic
 * PO sync test suites. Performs ZERO live API calls and ZERO production
 * writes. Shared between validatePurchaseOrderSyncEngine and
 * validateStage2E2APurchaseOrder to avoid duplicated test scaffolding.
 */

import { purchaseOrderAdapter } from "./adapters/purchaseOrderAdapter.ts";

export const PO_TEST_NOW = "2026-08-03T12:00:00Z";
export const PO_TEST_TENANT_ID = "121";
export const PO_TEST_ENVIRONMENT = "production";

// ─── Mock Base44 ──────────────────────────────────────────────────────────────

/**
 * Evaluate a single field condition against a mock record, supporting the
 * MongoDB-style query operators used by the codebase ($ne, $exists, $regex,
 * $options, $in, $nin, $gte, $gt, $lte, $lt). This mirrors the Base44
 * server-side filter behavior so tests exercise the same filter-and-limit
 * semantics as production.
 */
function mockMatchesField(record: any, field: string, condition: any): boolean {
  const val = record[field];
  if (condition === null || condition === undefined) {
    return val === null || val === undefined;
  }
  if (Array.isArray(condition)) {
    return condition.includes(val);
  }
  if (typeof condition === "object") {
    for (const [op, opVal] of Object.entries(condition)) {
      switch (op) {
        case "$ne":
          if (val === opVal) return false;
          break;
        case "$exists":
          if (opVal === true && val === undefined) return false;
          if (opVal === false && val !== undefined) return false;
          break;
        case "$regex":
          try {
            const flags = typeof condition.$options === "string" ? condition.$options : "";
            const re = new RegExp(opVal as string, flags);
            if (!re.test(String(val ?? ""))) return false;
          } catch { return false; }
          break;
        case "$options":
          break;
        case "$in":
          if (!opVal.includes(val)) return false;
          break;
        case "$nin":
          if (opVal.includes(val)) return false;
          break;
        case "$gte":
          if (!(Number(val) >= Number(opVal))) return false;
          break;
        case "$gt":
          if (!(Number(val) > Number(opVal))) return false;
          break;
        case "$lte":
          if (!(Number(val) <= Number(opVal))) return false;
          break;
        case "$lt":
          if (!(Number(val) < Number(opVal))) return false;
          break;
      }
    }
    return true;
  }
  return val === condition;
}

export function createMockBase44(opts: {
  vendors?: any[];
  warehouses?: any[];
  materials?: any[];
  existingPOs?: any[];
  existingLines?: any[];
  watermark?: any;
  cursor?: any;
} = {}): { client: any; writes: any[]; state: Record<string, any[]> } {
  const writes: any[] = [];
  const state: Record<string, any[]> = {
    PurchaseOrder: opts.existingPOs ? [...opts.existingPOs] : [],
    PurchaseOrderLine: opts.existingLines ? [...opts.existingLines] : [],
    Vendor: opts.vendors || [],
    WarehouseLocation: opts.warehouses || [],
    InventoryMaster: opts.materials || [],
    PurchaseOrderSyncWatermark: opts.watermark ? [opts.watermark] : [],
    ServiceTitanSyncCursor: opts.cursor ? [opts.cursor] : [{
      id: "cursor-po",
      integration_name: "servicetitan_purchase_order_sync",
      domain: "purchase_order",
      tenant_id: PO_TEST_TENANT_ID,
      environment: PO_TEST_ENVIRONMENT,
      lock_id: null,
      lock_expires_at: null,
      status: "idle",
    }],
    DeferredDependentRecord: [],
  };

  function makeHandler(entityName: string) {
    return {
      filter: async (query: any, _sort?: string, limit?: number) => {
        let records = state[entityName] || [];
        if (query) {
          records = records.filter((r) => {
            for (const [key, val] of Object.entries(query)) {
              if (key === "$or") {
                if (!val.some((cond: any) => Object.entries(cond).every(([k, v]) => mockMatchesField(r, k, v)))) return false;
                continue;
              }
              if (key === "$and") {
                if (!val.every((cond: any) => Object.entries(cond).every(([k, v]) => mockMatchesField(r, k, v)))) return false;
                continue;
              }
              if (!mockMatchesField(r, key, val)) return false;
            }
            return true;
          });
        }
        return limit ? records.slice(0, limit) : records;
      },
      get: async (id: string) => {
        const records = state[entityName] || [];
        return records.find((r) => r.id === id) || null;
      },
      update: async (id: string, data: any) => {
        const records = state[entityName] || [];
        const idx = records.findIndex((r) => r.id === id);
        if (idx >= 0) records[idx] = { ...records[idx], ...data };
        writes.push({ entity: entityName, type: "update", id, data });
        return records[idx];
      },
      create: async (data: any) => {
        const record = { id: `mock-${entityName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data };
        if (!state[entityName]) state[entityName] = [];
        state[entityName].push(record);
        writes.push({ entity: entityName, type: "create", data });
        return record;
      },
      list: async (sort?: string, limit?: number) => {
        const records = state[entityName] || [];
        return limit ? records.slice(0, limit) : records;
      },
    };
  }

  const entities: Record<string, any> = {};
  for (const name of Object.keys(state)) {
    entities[name] = makeHandler(name);
  }

  return { writes, state, client: { asServiceRole: { entities } } };
}

// ─── Source Record Factories ─────────────────────────────────────────────────

export function makeVendor(stId: string, name: string = ""): any {
  return { id: `vendor-${stId}`, servicetitan_vendor_id: stId, name: name || `Vendor ${stId}` };
}

export function makeWarehouse(stId: string, name: string = "", locationType: string = "warehouse"): any {
  return { id: `wh-${stId}`, servicetitan_warehouse_id: stId, name: name || `Warehouse ${stId}`, location_type: locationType };
}

export function makeMaterial(stId: string): any {
  return { id: `mat-${stId}`, servicetitan_material_id: stId, item_name: `Material ${stId}` };
}

export function makePoSource(id: string | number, overrides: any = {}): any {
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
    createdOn: PO_TEST_NOW,
    modifiedOn: PO_TEST_NOW,
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
        createdOn: PO_TEST_NOW,
        modifiedOn: PO_TEST_NOW,
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
    activation_timestamp: "2026-08-01T00:00:00Z",
    status: "active",
    environment: PO_TEST_ENVIRONMENT,
    tenant_id: PO_TEST_TENANT_ID,
    last_modified_scan_at: "2026-08-03T11:00:00Z",
    last_successful_sync_at: "2026-08-03T11:00:00Z",
    recovery_overlap_minutes: 5,
    recovery_window_status: "idle",
    recovery_window_start: null,
    recovery_window_end: null,
    recovery_window_errors: 0,
    backfill_status: "never_started",
    purchase_orders_imported_since_activation: 0,
    recovery_events_processed: 0,
    ...overrides,
  };
}

/**
 * Build a test adapter that uses the real purchaseOrderAdapter logic but
 * overrides fetchPage with a mock so no live API call is made.
 */
export function makeTestAdapter(purchaseOrderAdapter: any, fetchPageMock: (context: any, request: any) => Promise<any>): any {
  return {
    ...purchaseOrderAdapter,
    fetchPage: async (context: any, request: any) => fetchPageMock(context, request),
  };
}

/**
 * Convenience wrapper that binds the real purchaseOrderAdapter to a mock
 * fetchPage. Shared by both PO test suites to avoid duplicated wrapper logic.
 */
export function makePoTestAdapter(fetchPageMock: (context: any, request: any) => Promise<any>): any {
  return makeTestAdapter(purchaseOrderAdapter, fetchPageMock);
}