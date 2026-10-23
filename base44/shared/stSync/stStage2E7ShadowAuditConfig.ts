/**
 * Stage 2E.7 Shadow Audit — Configuration.
 *
 * D-2 bounded-query caps, endpoints, watermark key, run-sensitive entity list,
 * approved/denied op lists, correlation-ID prefix, and the disabled live
 * payload-threshold configuration (state UNAPPROVED).
 *
 * Runtime and test-only. Pure constants; no side effects.
 */

export const STAGE_2E7_PAGE_SIZE = 50;
export const STAGE_2E7_MAX_PAGES = 10;
export const STAGE_2E7_MAX_RECORDS = 500;
export const STAGE_2E7_MAX_RETRIES = 2;
export const STAGE_2E7_MAX_RUNTIME_MS = 300000;

export const STAGE_2E7_WATERMARK_KEY = "purchase_order_go_live";
export const STAGE_2E7_CURSOR_DOMAIN = "purchase_order";
export const STAGE_2E7_CORRELATION_PREFIX = "2E7SA";

export const STAGE_2E7_ENDPOINT_PURCHASE_ORDERS = (tenant: string) =>
  `/inventory/v2/tenant/${tenant}/purchase-orders`;
export const STAGE_2E7_ENDPOINT_PURCHASE_ORDER_TYPES = (tenant: string) =>
  `/inventory/v2/tenant/${tenant}/purchase-order-types`;

export const RUN_SENSITIVE_ENTITIES = [
  "PurchaseOrder",
  "PurchaseOrderLine",
  "PurchaseOrderSyncWatermark",
  "ServiceTitanSyncCursor",
  "DeferredDependentRecord",
  "InventoryTransaction",
  "Receipt",
  "Bill",
  "WarehouseTransfer",
  "InventoryAdjustment",
  "Vendor",
  "WarehouseLocation",
  "InventoryMaster",
  "BusinessEvent",
  "ServiceTitanWebhookEvent",
] as const;

export const APPROVED_READ_OPS = ["filter", "list", "get", "schema"] as const;

export const DENIED_WRITE_OPS = [
  "create",
  "update",
  "delete",
  "bulkCreate",
  "bulkUpdate",
  "updateMany",
  "deleteMany",
  "subscribe",
] as const;

export const DENIED_NESTED = ["asServiceRole", "users", "analytics", "connectors", "auth"] as const;

export interface LiveThresholdConfig {
  state: "UNAPPROVED";
  maxResponseBytes: null;
}

export const LIVE_THRESHOLD: LiveThresholdConfig = { state: "UNAPPROVED", maxResponseBytes: null };