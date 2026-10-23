/**
 * ServiceTitan Vendor Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Vendor domain.
 * This is the single place where Vendor-specific config lives.
 *
 * Endpoint verified from ServiceTitan Inventory v2 API:
 *   GET /inventory/v2/tenant/{tenant}/vendors
 *   Params: page, pageSize, modifiedOnOrAfter
 *   Pagination: page-based (same as Jobs / Appointments)
 *
 * Stage 2C Vendor — ServiceTitan → LVC OS only. No outbound writes.
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const VENDOR_WATERMARK_KEY = "vendor_go_live";
export const VENDOR_SYNC_STRATEGY = "new_vendors_only";
export const VENDOR_DOMAIN = "vendor";
export const VENDOR_INTEGRATION_NAME = "servicetitan_vendor_sync";

/** Inventory v2 vendors endpoint — verified from ServiceTitan API reference */
export const VENDORS_API_PATH = (tenantId: string) =>
  `/inventory/v2/tenant/${tenantId}/vendors`;

export const VENDOR_PAGE_SIZE = 50;
export const VENDOR_MAX_PAGES = 100;

// ─── Configs ─────────────────────────────────────────────────────────────────

export const vendorWatermarkConfig: WatermarkConfig = {
  entityName: "VendorSyncWatermark",
  watermarkKey: VENDOR_WATERMARK_KEY,
  syncStrategy: VENDOR_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const vendorLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const vendorPreflightConfig: PreflightConfig = {
  domain: VENDOR_DOMAIN,
  watermarkEntityName: "VendorSyncWatermark",
  watermarkKey: VENDOR_WATERMARK_KEY,
  apiEndpoint: "", // Set dynamically — see buildVendorPreflightConfig
  expectedSyncStrategy: VENDOR_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

/**
 * Build the preflight config with the tenant-specific API endpoint.
 */
export function buildVendorPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...vendorPreflightConfig,
    apiEndpoint: VENDORS_API_PATH(tenantId),
  };
}