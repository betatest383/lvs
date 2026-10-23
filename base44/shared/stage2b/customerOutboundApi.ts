/**
 * Customer Outbound API (Stage 2B-A)
 *
 * Pushes LVC-owned customer fields to ServiceTitan via the CRM v2 API.
 *
 * Endpoints:
 *   Create: POST   /crm/v2/tenant/{tenant}/customers
 *   Update: PATCH  /crm/v2/tenant/{tenant}/customers/{id}
 *
 * Stage 2B-A Hardening:
 *   - Failure classification via outboundFailureClassification.ts
 *   - Returns failure_type for diagnostic reporting
 *   - Retry behavior reflects failure type (only retryable types retried)
 *
 * OAuth Scope Note:
 *   The existing OAuth app may be configured with read-only scope
 *   (tn.crm.customers:r). Outbound writes require a write scope. Until the
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
import { classifyOutboundFailure, type OutboundFailureType } from "./outboundFailureClassification.ts";

export interface OutboundCustomerPayload {
  servicetitan_customer_id?: string;
  name: string;
  customer_type?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface OutboundResult {
  success: boolean;
  action: "created" | "updated";
  servicetitan_customer_id?: string;
  raw_response?: any;
  error?: string;
  retryable?: boolean;
  failure_type?: OutboundFailureType;
}

/**
 * Build the ServiceTitan CRM v2 customer request body from LVC fields.
 * Only includes populated fields.
 */
export function buildStCustomerBody(data: OutboundCustomerPayload): any {
  const body: any = { name: data.name };

  if (data.customer_type) {
    body.type = data.customer_type === "commercial" ? "Commercial" : "Residential";
  }

  const contacts: any[] = [];
  if (data.phone) contacts.push({ type: "Phone", value: data.phone });
  if (data.email) contacts.push({ type: "Email", value: data.email });
  if (contacts.length > 0) body.contacts = contacts;

  if (data.address || data.city || data.state || data.zip) {
    body.address = {
      street: data.address || "",
      city: data.city || "",
      state: data.state || "",
      zip: data.zip || "",
    };
  }

  return body;
}

/**
 * Push a customer to ServiceTitan (create or update).
 * Uses retryWithBackoff for transient failures.
 * Classifies failures for diagnostic reporting.
 */
export async function pushCustomerToServiceTitan(
  data: OutboundCustomerPayload
): Promise<OutboundResult> {
  const tenantId = getTenantId();
  const environment = getEnvironment();
  const body = buildStCustomerBody(data);
  const hasStId = !!data.servicetitan_customer_id;

  try {
    const path = hasStId
      ? `/crm/v2/tenant/${tenantId}/customers/${data.servicetitan_customer_id}`
      : `/crm/v2/tenant/${tenantId}/customers`;
    const method = hasStId ? "PATCH" : "POST";

    const response = await retryWithBackoff(() =>
      apiRequest(path, environment, { method, body })
    );

    const stId = response?.id || data.servicetitan_customer_id || "";
    return {
      success: true,
      action: hasStId ? "updated" : "created",
      servicetitan_customer_id: String(stId),
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
 * Performs a GET to the CRM v2 customers endpoint to verify:
 *   - OAuth token is valid
 *   - CRM endpoint is reachable
 *
 * Does NOT verify write scope — that requires an actual write call.
 * Returns { token_valid, endpoint_reachable, error }.
 */
export async function verifyOutboundReadiness(): Promise<{
  token_valid: boolean;
  endpoint_reachable: boolean;
  error?: string;
}> {
  try {
    const tenantId = getTenantId();
    const environment = getEnvironment();
    await apiRequest(`/crm/v2/tenant/${tenantId}/customers?pageSize=1`, environment, {});
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