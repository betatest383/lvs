/**
 * ServiceTitan Material Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Material (InventoryMaster) domain.
 * This is the single place where Material-specific config lives.
 *
 * Endpoint (to be verified via verify_api_modified_on):
 *   GET /inventory/v2/tenant/{tenant}/items
 *   Params: page, pageSize, modifiedOnOrAfter
 *   Pagination: page-based (same as Vendors / Jobs / Appointments)
 *
 * Stage 2D Material — ServiceTitan → LVC OS only. No outbound writes.
 *
 * DEPENDENCIES: Vendor. Each Material's vendor relationships must resolve
 * to an existing local Vendor by servicetitan_vendor_id. Materials with
 * unresolved vendor references are deferred (placed into retry).
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MATERIAL_WATERMARK_KEY = "material_go_live";
export const MATERIAL_SYNC_STRATEGY = "new_materials_only";
export const MATERIAL_DOMAIN = "material";
export const MATERIAL_INTEGRATION_NAME = "servicetitan_material_sync";

/**
 * Pricebook v2 materials endpoint — ServiceTitan items (materials) are
 * managed through the Pricebook API. Verified via live API check.
 */
export const ITEMS_API_PATH = (tenantId: string) =>
  `/pricebook/v2/tenant/${tenantId}/materials`;

export const MATERIAL_PAGE_SIZE = 50;
export const MATERIAL_MAX_PAGES = 500;

// ─── Configs ─────────────────────────────────────────────────────────────────

export const materialWatermarkConfig: WatermarkConfig = {
  entityName: "MaterialSyncWatermark",
  watermarkKey: MATERIAL_WATERMARK_KEY,
  syncStrategy: MATERIAL_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const materialLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const materialPreflightConfig: PreflightConfig = {
  domain: MATERIAL_DOMAIN,
  watermarkEntityName: "MaterialSyncWatermark",
  watermarkKey: MATERIAL_WATERMARK_KEY,
  apiEndpoint: "",
  expectedSyncStrategy: MATERIAL_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

/**
 * Build the preflight config with the tenant-specific API endpoint.
 */
export function buildMaterialPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...materialPreflightConfig,
    apiEndpoint: ITEMS_API_PATH(tenantId),
  };
}