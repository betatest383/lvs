/**
 * ServiceTitan Transfer Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Warehouse Transfer domain.
 * Stage 2E Procurement — ServiceTitan → LVC OS only. No outbound writes.
 *
 * Transfers create: truck depletion → truck receipt → ledger updates →
 * completion. Support partial receive, exception handling, lost/damaged.
 *
 * DEPENDENCIES: WarehouseLocation (source + destination), Material (lines).
 * Each Transfer must resolve both source and destination to local
 * WarehouseLocation records by servicetitan_warehouse_id. Each transfer
 * line must resolve to a local InventoryMaster by servicetitan_material_id.
 * Transfers with unresolved dependencies are deferred.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

export const TRANSFER_WATERMARK_KEY = "transfer_go_live";
export const TRANSFER_SYNC_STRATEGY = "new_transfers_only";
export const TRANSFER_DOMAIN = "transfer";
export const TRANSFER_INTEGRATION_NAME = "servicetitan_transfer_sync";

export const TRANSFERS_API_PATH = (tenantId: string) =>
  `/inventory/v2/tenant/${tenantId}/transfers`;

export const TRANSFER_PAGE_SIZE = 50;
export const TRANSFER_MAX_PAGES = 500;

export const transferWatermarkConfig: WatermarkConfig = {
  entityName: "TransferSyncWatermark",
  watermarkKey: TRANSFER_WATERMARK_KEY,
  syncStrategy: TRANSFER_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const transferLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const transferPreflightConfig: PreflightConfig = {
  domain: TRANSFER_DOMAIN,
  watermarkEntityName: "TransferSyncWatermark",
  watermarkKey: TRANSFER_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: TRANSFER_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

export function buildTransferPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...transferPreflightConfig,
    apiEndpoint: TRANSFERS_API_PATH(tenantId),
  };
}