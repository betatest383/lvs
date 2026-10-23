/**
 * ServiceTitan Receipt Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Receipt domain.
 * Stage 2E Procurement — ServiceTitan → LVC OS only. No outbound writes.
 *
 * Receipts increase warehouse inventory and create ledger entries.
 * Receipts maintain immutable linkage to: PO, PO Line, Material, Vendor,
 * Warehouse.
 *
 * DEPENDENCIES: PurchaseOrder, Vendor, Material, WarehouseLocation.
 * Each Receipt must resolve to an existing local PurchaseOrder by
 * servicetitan_purchase_order_id. Each receipt line must resolve to
 * a local InventoryMaster by servicetitan_material_id and a local
 * PurchaseOrderLine by servicetitan_po_line_id.
 * Receipts with unresolved dependencies are deferred.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

export const RECEIPT_WATERMARK_KEY = "receipt_go_live";
export const RECEIPT_SYNC_STRATEGY = "new_receipts_only";
export const RECEIPT_DOMAIN = "receipt";
export const RECEIPT_INTEGRATION_NAME = "servicetitan_receipt_sync";

export const RECEIPTS_API_PATH = (tenantId: string) =>
  `/procurement/v2/tenant/${tenantId}/receipts`;

export const RECEIPT_PAGE_SIZE = 50;
export const RECEIPT_MAX_PAGES = 500;

export const receiptWatermarkConfig: WatermarkConfig = {
  entityName: "ReceiptSyncWatermark",
  watermarkKey: RECEIPT_WATERMARK_KEY,
  syncStrategy: RECEIPT_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const receiptLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const receiptPreflightConfig: PreflightConfig = {
  domain: RECEIPT_DOMAIN,
  watermarkEntityName: "ReceiptSyncWatermark",
  watermarkKey: RECEIPT_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: RECEIPT_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

export function buildReceiptPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...receiptPreflightConfig,
    apiEndpoint: RECEIPTS_API_PATH(tenantId),
  };
}