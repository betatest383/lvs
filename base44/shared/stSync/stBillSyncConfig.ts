/**
 * ServiceTitan Bill Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Bill (Accounts Payable) domain.
 * Stage 2E Procurement — ServiceTitan → LVC OS only. No outbound writes.
 *
 * Bills represent AP obligations. Bills do NOT change inventory.
 * Bills reference: PO, Receipt, Vendor, Terms, Amounts.
 * Support one bill from multiple receipts and multiple bills from one PO.
 *
 * DEPENDENCIES: PurchaseOrder, Receipt, Vendor, Material (for lines).
 * Each Bill must resolve to an existing local Vendor by
 * servicetitan_vendor_id. Bills linked to a PO must resolve to a local
 * PurchaseOrder. Bills linked to a Receipt must resolve to a local Receipt.
 * Bills with unresolved dependencies are deferred.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

export const BILL_WATERMARK_KEY = "bill_go_live";
export const BILL_SYNC_STRATEGY = "new_bills_only";
export const BILL_DOMAIN = "bill";
export const BILL_INTEGRATION_NAME = "servicetitan_bill_sync";

export const BILLS_API_PATH = (tenantId: string) =>
  `/procurement/v2/tenant/${tenantId}/bills`;

export const BILL_PAGE_SIZE = 50;
export const BILL_MAX_PAGES = 500;

export const billWatermarkConfig: WatermarkConfig = {
  entityName: "BillSyncWatermark",
  watermarkKey: BILL_WATERMARK_KEY,
  syncStrategy: BILL_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const billLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const billPreflightConfig: PreflightConfig = {
  domain: BILL_DOMAIN,
  watermarkEntityName: "BillSyncWatermark",
  watermarkKey: BILL_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: BILL_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

export function buildBillPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...billPreflightConfig,
    apiEndpoint: BILLS_API_PATH(tenantId),
  };
}