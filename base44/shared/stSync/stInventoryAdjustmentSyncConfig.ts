/**
 * ServiceTitan Inventory Adjustment Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Inventory Adjustment domain.
 * Stage 2E Procurement — ServiceTitan → LVC OS only. READ-ONLY.
 *
 * Synchronize adjustments for visibility only. Do NOT overwrite LVC
 * inventory quantities. Adjustments become audit records, exception
 * records, and investigation records. LVC posts its own adjustments
 * via local workflow — the ledger_posted flag tracks LVC's independent
 * posting state.
 *
 * DEPENDENCIES: Material, WarehouseLocation.
 * Each Adjustment must resolve to a local InventoryMaster by
 * servicetitan_material_id and a local WarehouseLocation by
 * servicetitan_warehouse_id. Adjustments with unresolved dependencies
 * are deferred.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

export const INVENTORY_ADJUSTMENT_WATERMARK_KEY = "inventory_adjustment_go_live";
export const INVENTORY_ADJUSTMENT_SYNC_STRATEGY = "new_adjustments_only";
export const INVENTORY_ADJUSTMENT_DOMAIN = "inventory_adjustment";
export const INVENTORY_ADJUSTMENT_INTEGRATION_NAME = "servicetitan_inventory_adjustment_sync";

export const INVENTORY_ADJUSTMENTS_API_PATH = (tenantId: string) =>
  `/inventory/v2/tenant/${tenantId}/adjustments`;

export const INVENTORY_ADJUSTMENT_PAGE_SIZE = 50;
export const INVENTORY_ADJUSTMENT_MAX_PAGES = 500;

export const inventoryAdjustmentWatermarkConfig: WatermarkConfig = {
  entityName: "InventoryAdjustmentSyncWatermark",
  watermarkKey: INVENTORY_ADJUSTMENT_WATERMARK_KEY,
  syncStrategy: INVENTORY_ADJUSTMENT_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const inventoryAdjustmentLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const inventoryAdjustmentPreflightConfig: PreflightConfig = {
  domain: INVENTORY_ADJUSTMENT_DOMAIN,
  watermarkEntityName: "InventoryAdjustmentSyncWatermark",
  watermarkKey: INVENTORY_ADJUSTMENT_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: INVENTORY_ADJUSTMENT_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

export function buildInventoryAdjustmentPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...inventoryAdjustmentPreflightConfig,
    apiEndpoint: INVENTORY_ADJUSTMENTS_API_PATH(tenantId),
  };
}