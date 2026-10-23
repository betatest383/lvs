/**
 * ServiceTitan Job Sync — Configuration & Watermark Wiring
 *
 * Wires the generic sync engine to the Job domain.
 * This is the single place where Job-specific config lives.
 *
 * Endpoint verified from ServiceTitan JPM v2 API:
 *   GET /jpm/v2/tenant/{tenant}/jobs
 *   Params: page, pageSize, modifiedOnOrAfter, jobStatus
 *   Pagination: page-based (same as Appointments)
 */

import type { WatermarkConfig, LockConfig, PreflightConfig } from "./stSyncTypes.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const JOB_WATERMARK_KEY = "job_go_live";
export const JOB_SYNC_STRATEGY = "new_and_referenced_jobs_only";
export const JOB_DOMAIN = "job";
export const JOB_INTEGRATION_NAME = "servicetitan_job_sync";

/** JPM v2 jobs endpoint — verified from ServiceTitan API schema */
export const JOBS_API_PATH = (tenantId: string) =>
  `/jpm/v2/tenant/${tenantId}/jobs`;

export const JOB_PAGE_SIZE = 50;
export const JOB_MAX_PAGES = 100;

// ─── Configs ─────────────────────────────────────────────────────────────────

export const jobWatermarkConfig: WatermarkConfig = {
  entityName: "JobSyncWatermark",
  watermarkKey: JOB_WATERMARK_KEY,
  syncStrategy: JOB_SYNC_STRATEGY,
  defaultOverlapMinutes: 5,
};

export const jobLockConfig: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 10,
};

export const jobPreflightConfig: PreflightConfig = {
  domain: JOB_DOMAIN,
  watermarkEntityName: "JobSyncWatermark",
  watermarkKey: JOB_WATERMARK_KEY,
  apiEndpoint: "", // Set dynamically — see activateJobSync
  expectedSyncStrategy: JOB_SYNC_STRATEGY,
  deferredEntityName: "DeferredDependentRecord",
};

/**
 * Build the preflight config with the tenant-specific API endpoint.
 */
export function buildJobPreflightConfig(tenantId: string): PreflightConfig {
  return {
    ...jobPreflightConfig,
    apiEndpoint: JOBS_API_PATH(tenantId),
  };
}