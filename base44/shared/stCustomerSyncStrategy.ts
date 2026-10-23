/**
 * ServiceTitan Customer Sync Strategy — Barrel Re-Export Module
 *
 * This file was split into focused sub-modules for maintainability.
 * It now serves as a barrel that re-exports all public types and functions
 * so existing imports continue to work without any changes.
 *
 * Sub-modules:
 *   stWatermark.ts             — watermark lifecycle, counters, stats
 *   stCustomerEligibility.ts    — eligibility checks, createdOn resolution
 *   stDeferredCustomer.ts      — deferred customer management
 *   stOnDemandHydration.ts      — on-demand hydration, fetchCustomerById, contact retry
 *   stRecoveryScan.ts           — windowed recovery scanning, transactional API fetches
 *   stApiVerification.ts        — live no-write API verification, backfill estimation
 */

// ─── Watermark Management ──
export {
  RECOVERY_OVERLAP_MINUTES,
  getWatermark,
  activateWatermark,
  incrementWatermarkCounters,
  getWatermarkStats,
  type WatermarkStats,
} from "./stWatermark.ts";

// ─── Customer Eligibility ──
export {
  type WatermarkCheckResult,
  checkCustomerEligibility,
  shouldImportNewCustomer,
  resolveCustomerCreatedOn,
} from "./stCustomerEligibility.ts";

// ─── Deferred Customer Management ──
export {
  createDeferredCustomer,
  resolveDeferredCustomer,
} from "./stDeferredCustomer.ts";

// ─── On-Demand Hydration ──
export {
  type HydrationResult,
  fetchCustomerById,
  hydrateCustomerOnDemand,
  createContactSyncRetry,
} from "./stOnDemandHydration.ts";

// ─── Recovery Scan ──
export {
  type TransactionalCustomerPage,
  type RecoveryScanResult,
  fetchNewCustomersPage,
  fetchUpdatedCustomersPage,
  runRecoveryScan,
} from "./stRecoveryScan.ts";

// ─── API Verification ──
export {
  type ApiVerificationResult,
  verifyTransactionalApi,
  verifyTransactionalApiCreatedOn,
  verifyTransactionalApiModifiedOn,
  estimateBackfillScope,
} from "./stApiVerification.ts";