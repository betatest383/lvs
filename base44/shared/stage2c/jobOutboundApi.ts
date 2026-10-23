/**
 * Job Outbound API (Stage 2C)
 *
 * Pushes LVC-owned Job fields to ServiceTitan via the JPM v2 API.
 *
 * Endpoints:
 *   Create: POST   /jpm/v2/tenant/{tenant}/jobs
 *   Update: PATCH  /jpm/v2/tenant/{tenant}/jobs/{id}
 *
 * Stage 2C Hardening (mirrors Stage 2B-A Customer pattern):
 *   - Failure classification via outboundFailureClassification.ts
 *   - Returns failure_type for diagnostic reporting
 *   - Retry behavior reflects failure type (only retryable types retried)
 *
 * OAuth Scope Note:
 *   The existing OAuth app may be configured with read-only scope
 *   (tn.jpm.jobs:r). Outbound writes require a write scope. Until the
 *   OAuth app scope is updated in the ServiceTitan developer portal, the API
 *   call will return 403 — the delivery dead-letters with failure_type=
 *   oauth_scope_insufficient, surfacing the gap.
 *   The mock_st_api metadata flag bypasses the real call for testing
 *   (secured by testHarnessGuard — ignored in production).
 */

import {
  apiRequest,
  retryWithBackoff,
  getTenantId,
  getEnvironment,
  ApiError,
} from "../stAuth.ts";
import { classifyOutboundFailure, type OutboundFailureType } from "../stage2b/outboundFailureClassification.ts";

export interface OutboundJobPayload {
  servicetitan_job_id?: string;
  job_type?: string;
  priority?: string;
  notes?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface OutboundResult {
  success: boolean;
  action: "created" | "updated";
  servicetitan_job_id?: string;
  raw_response?: any;
  error?: string;
  retryable?: boolean;
  failure_type?: OutboundFailureType;
}

/**
 * Build the ServiceTitan JPM v2 job request body from LVC fields.
 * Only includes populated fields.
 */
export function buildStJobBody(data: OutboundJobPayload): any {
  const body: any = {};

  if (data.job_type) body.type = data.job_type;
  if (data.priority) body.priority = data.priority;
  if (data.notes) body.summary = data.notes;

  if (data.address || data.city || data.state || data.zip) {
    body.location = {
      street: data.address || "",
      city: data.city || "",
      state: data.state || "",
      zip: data.zip || "",
    };
  }

  return body;
}

/**
 * Push a job to ServiceTitan (create or update).
 * Uses retryWithBackoff for transient failures.
 * Classifies failures for diagnostic reporting.
 */
export async function pushJobToServiceTitan(
  data: OutboundJobPayload
): Promise<OutboundResult> {
  const tenantId = getTenantId();
  const environment = getEnvironment();
  const body = buildStJobBody(data);
  const hasStId = !!data.servicetitan_job_id;

  try {
    const path = hasStId
      ? `/jpm/v2/tenant/${tenantId}/jobs/${data.servicetitan_job_id}`
      : `/jpm/v2/tenant/${tenantId}/jobs`;
    const method = hasStId ? "PATCH" : "POST";

    const response = await retryWithBackoff(() =>
      apiRequest(path, environment, { method, body })
    );

    const stId = response?.id || data.servicetitan_job_id || "";
    return {
      success: true,
      action: hasStId ? "updated" : "created",
      servicetitan_job_id: String(stId),
      raw_response: response,
    };
  } catch (err) {
    // Classify the failure for diagnostics
    const statusCode = err instanceof ApiError ? (err as any).statusCode : undefined;
    const responseBody = err instanceof ApiError ? err.message : "";
    const classified = classifyOutboundFailure(err, statusCode, responseBody);

    return {
      success: false,
      action: hasStId ? "updated" : "created",
      error: classified.error,
      retryable: classified.retryable,
      failure_type: classified.failure_type,
    };
  }
}

/**
 * Verify outbound readiness without making a write call.
 * Performs a GET to the JPM v2 jobs endpoint to verify:
 *   - OAuth token is valid
 *   - JPM endpoint is reachable
 *
 * Does NOT verify write scope — that requires an actual write call.
 * Returns { token_valid, endpoint_reachable, error }.
 */
export async function verifyJobOutboundReadiness(): Promise<{
  token_valid: boolean;
  endpoint_reachable: boolean;
  error?: string;
}> {
  try {
    const tenantId = getTenantId();
    const environment = getEnvironment();
    await apiRequest(`/jpm/v2/tenant/${tenantId}/jobs?pageSize=1`, environment, {});
    return { token_valid: true, endpoint_reachable: true };
  } catch (err) {
    const statusCode = err instanceof ApiError ? (err as any).statusCode : undefined;
    const isTokenError = statusCode === 401 || (err instanceof Error && err.message.includes("401"));
    return {
      token_valid: !isTokenError,
      endpoint_reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}