/**
 * ServiceTitan Purchase Order Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Purchase Order domain.
 * Stage 2E Procurement — ServiceTitan → LVC OS only. No outbound writes.
 *
 * Endpoint (VERIFIED via live API — Stage 2E.1):
 *   GET /inventory/v2/tenant/{tenant}/purchase-orders
 *   Params: page, pageSize, modifiedOnOrAfter, createdOnOrAfter, active
 *   Pagination: page-based (hasMore controls continuation; totalCount unreliable/null)
 *   Lines: EMBEDDED in items[] array — no separate line endpoint.
 *   Sort: NOT supported (HTTP 400 on sort param).
 *
 * DEPENDENCIES: Vendor (required), WarehouseLocation (required), Material (required per line).
 * Each PO must resolve to an existing local Vendor by servicetitan_vendor_id.
 * Each PO must resolve to an existing local WarehouseLocation by servicetitan_warehouse_id.
 * Each PO line must resolve to an existing local InventoryMaster by servicetitan_material_id.
 * POs with unresolved header dependencies are deferred. POs with unresolved line
 * material dependencies preserve the header and defer only the unresolved line.
 *
 * PO TYPE: Not a blocking dependency. Resolved via a bounded in-memory cache
 * populated from /inventory/v2/tenant/{tenant}/purchase-order-types. If the type
 * name cannot be resolved, servicetitan_purchase_order_type_id is preserved and
 * the type name is left null (warning only, non-deferring).
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PURCHASE_ORDER_WATERMARK_KEY = "purchase_order_go_live";
export const PURCHASE_ORDER_SYNC_STRATEGY = "new_purchase_orders_only";
export const PURCHASE_ORDER_DOMAIN = "purchase_order";
export const PURCHASE_ORDER_INTEGRATION_NAME = "servicetitan_purchase_order_sync";

/**
 * Procurement v2 purchase orders endpoint.
 * VERIFIED via live API (Stage 2E.1): /procurement/v2/ returns 404.
 * Correct path is under /inventory/v2/.
 */
export const PURCHASE_ORDERS_API_PATH = (tenantId: string) =>
  `/inventory/v2/tenant/${tenantId}/purchase-orders`;

/**
 * Purchase Order Types endpoint.
 * Used ONLY to resolve servicetitan_purchase_order_type_name from typeId.
 * Not a sync domain — no watermark, no entity, no dependency.
 */
export const PURCHASE_ORDER_TYPES_API_PATH = (tenantId: string) =>
  `/inventory/v2/tenant/${tenantId}/purchase-order-types`;

export const PURCHASE_ORDER_PAGE_SIZE = 50;
export const PURCHASE_ORDER_MAX_PAGES = 500;

// ─── Engine Tuning ────────────────────────────────────────────────────────────

export const PURCHASE_ORDER_WRITE_CONCURRENCY = 3;
export const PURCHASE_ORDER_MAX_RETRIES = 5;
export const PURCHASE_ORDER_OVERLAP_MINUTES = 5;
export const PURCHASE_ORDER_CONTROLLED_BATCH_SIZE = 250;
export const PURCHASE_ORDER_RUNTIME_LIMIT_MS = 540000;

// ─── Configs ─────────────────────────────────────────────────────────────────

export const purchaseOrderWatermarkConfig: WatermarkConfig = {
  entityName: "PurchaseOrderSyncWatermark",
  watermarkKey: PURCHASE_ORDER_WATERMARK_KEY,
  syncStrategy: PURCHASE_ORDER_SYNC_STRATEGY,
  defaultOverlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES,
};

export const purchaseOrderLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const purchaseOrderPreflightConfig: PreflightConfig = {
  domain: PURCHASE_ORDER_DOMAIN,
  watermarkEntityName: "PurchaseOrderSyncWatermark",
  watermarkKey: PURCHASE_ORDER_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: PURCHASE_ORDER_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

export function buildPurchaseOrderPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...purchaseOrderPreflightConfig,
    apiEndpoint: PURCHASE_ORDERS_API_PATH(tenantId),
  };
}