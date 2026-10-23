/**
 * ServiceTitan Live No-Write API Verification
 *
 * Verifies the actual transactional API response shape without any writes.
 * Returns the raw API response metadata for administrative inspection.
 *
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 */

import { apiRequest, retryWithBackoff } from "./stAuth.ts";

export interface ApiVerificationResult {
  http_status: number;
  request_params: Record<string, string>;
  response_top_level_keys: string[];
  records_returned: number;
  pagination: {
    hasMore: any;
    page: any;
    pageSize: any;
    totalCount: any;
  };
  first_record_fields: string[] | string;
  first_record_createdOn: any;
  first_record_modifiedOn: any;
  first_record_id: any;
  first_record_name: any;
  last_record_id: any;
  writes_performed: false;
  contact_writes_performed: false;
  watermark_advanced: false;
}

/**
 * Verify the transactional API response shape for createdOnOrAfter filter.
 * Performs ZERO writes — no Customer records, no Contact records, no watermark advancement.
 */
export async function verifyTransactionalApiCreatedOn(
  environment: string,
  tenantId: string
): Promise<ApiVerificationResult> {
  const path = `/crm/v2/tenant/${tenantId}/customers`;
  const params: Record<string, string> = {
    createdOnOrAfter: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    page: "1",
    pageSize: "2",
  };

  const result = await apiRequest(path, environment, { params });

  const records = result.data || result.customers || (Array.isArray(result) ? result : []);
  const firstRecord = records.length > 0 ? records[0] : null;
  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  return {
    http_status: 200,
    request_params: params,
    response_top_level_keys: typeof result === "object" && !Array.isArray(result) ? Object.keys(result) : ["(array)"],
    records_returned: records.length,
    pagination: {
      hasMore: result.hasMore ?? result.has_more ?? "NOT_FOUND",
      page: result.page ?? "NOT_FOUND",
      pageSize: result.pageSize ?? "NOT_FOUND",
      totalCount: result.totalCount ?? result.total_count ?? "NOT_FOUND",
    },
    first_record_fields: firstRecord ? Object.keys(firstRecord) : "NO_RECORDS",
    first_record_createdOn: firstRecord?.createdOn ?? "NOT_FOUND",
    first_record_modifiedOn: firstRecord?.modifiedOn ?? "NOT_FOUND",
    first_record_id: firstRecord?.id ?? "NOT_FOUND",
    first_record_name: firstRecord?.name ?? "NOT_FOUND",
    last_record_id: lastRecord?.id ?? "NOT_FOUND",
    writes_performed: false,
    contact_writes_performed: false,
    watermark_advanced: false,
  };
}

/**
 * Verify the transactional API response shape for modifiedOnOrAfter filter.
 * Performs ZERO writes — no Customer records, no Contact records, no watermark advancement.
 */
export async function verifyTransactionalApiModifiedOn(
  environment: string,
  tenantId: string
): Promise<ApiVerificationResult> {
  const path = `/crm/v2/tenant/${tenantId}/customers`;
  const params: Record<string, string> = {
    modifiedOnOrAfter: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    page: "1",
    pageSize: "2",
  };

  const result = await apiRequest(path, environment, { params });

  const records = result.data || result.customers || (Array.isArray(result) ? result : []);
  const firstRecord = records.length > 0 ? records[0] : null;
  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  return {
    http_status: 200,
    request_params: params,
    response_top_level_keys: typeof result === "object" && !Array.isArray(result) ? Object.keys(result) : ["(array)"],
    records_returned: records.length,
    pagination: {
      hasMore: result.hasMore ?? result.has_more ?? "NOT_FOUND",
      page: result.page ?? "NOT_FOUND",
      pageSize: result.pageSize ?? "NOT_FOUND",
      totalCount: result.totalCount ?? result.total_count ?? "NOT_FOUND",
    },
    first_record_fields: firstRecord ? Object.keys(firstRecord) : "NO_RECORDS",
    first_record_createdOn: firstRecord?.createdOn ?? "NOT_FOUND",
    first_record_modifiedOn: firstRecord?.modifiedOn ?? "NOT_FOUND",
    first_record_id: firstRecord?.id ?? "NOT_FOUND",
    first_record_name: firstRecord?.name ?? "NOT_FOUND",
    last_record_id: lastRecord?.id ?? "NOT_FOUND",
    writes_performed: false,
    contact_writes_performed: false,
    watermark_advanced: false,
  };
}

/**
 * Backward-compat: original verifyTransactionalApi (createdOnOrAfter filter).
 */
export async function verifyTransactionalApi(
  environment: string,
  tenantId: string
): Promise<ApiVerificationResult> {
  return verifyTransactionalApiCreatedOn(environment, tenantId);
}

/**
 * Estimate the total number of customers that would be imported during a
 * full historical backfill. Uses the totalCount field from the API.
 */
export async function estimateBackfillScope(
  environment: string,
  tenantId: string
): Promise<number> {
  try {
    const path = `/crm/v2/tenant/${tenantId}/customers`;
    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, environment, { params: { page: "1", pageSize: "1" } });
    });

    if (result.totalCount != null) return result.totalCount;
    if (result.total_count != null) return result.total_count;
    if (result.count != null) return result.count;

    const hasMore = result.hasMore ?? result.has_more ?? false;
    return hasMore ? -1 : 0;
  } catch (err) {
    console.error("[ST API VERIFY] Failed to estimate backfill scope:", err);
    return -1;
  }
}