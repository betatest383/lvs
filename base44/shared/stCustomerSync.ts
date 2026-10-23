/**
 * ServiceTitan Customer Synchronization Service — Public API
 *
 * Barrel re-export module. All public types and functions are re-exported
 * from their focused sub-modules:
 *
 *   stCustomerMapping.ts        — field extraction, mapping, lookups, stale checks
 *   stCustomerConflict.ts       — ST-controlled fields, change detection, conflict history
 *   stCustomerMerge.ts          — record relinking during merges
 *   stCustomerWebhookHandlers.ts — webhook lifecycle sync (created/updated/merged/deleted/restored)
 *   stCustomerApiHandlers.ts    — CRM v2 export API upsert handlers
 *
 * This file preserves the original public interface so that existing
 * imports (stHandlers/customerHandler.ts, stCustomerApiSync.ts) continue
 * to work without any changes.
 */

// ─── Webhook Sync Types & Functions ──────────────────────────────────────────
export {
  type SyncContext,
  type SyncResult,
  syncCustomerCreated,
  syncCustomerUpdated,
  syncCustomerMerged,
  syncCustomerDeleted,
  syncCustomerRestored,
} from "./stCustomerWebhookHandlers.ts";

// ─── API Export Types & Functions ────────────────────────────────────────────
export {
  type ApiSyncOptions,
  type ApiSyncResult,
  upsertCustomerFromApiExport,
} from "./stCustomerApiHandlers.ts";

// ─── Sync Strategy (New-Customers-Only / Watermark) ──────────────────────────
export {
  type TransactionalCustomerPage,
  type HydrationResult,
  type RecoveryScanResult,
  type WatermarkStats,
  type WatermarkCheckResult,
  type ApiVerificationResult,
  getWatermark,
  activateWatermark,
  shouldImportNewCustomer,
  checkCustomerEligibility,
  resolveCustomerCreatedOn,
  incrementWatermarkCounters,
  createDeferredCustomer,
  resolveDeferredCustomer,
  fetchNewCustomersPage,
  fetchUpdatedCustomersPage,
  fetchCustomerById,
  hydrateCustomerOnDemand,
  createContactSyncRetry,
  runRecoveryScan,
  getWatermarkStats,
  verifyTransactionalApi,
  verifyTransactionalApiCreatedOn,
  verifyTransactionalApiModifiedOn,
  estimateBackfillScope,
} from "./stCustomerSyncStrategy.ts";