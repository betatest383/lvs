/**
 * Generic Sync API Verification
 *
 * Performs no-write verification of any ServiceTitan API endpoint.
 * Returns the raw response shape for administrative inspection.
 * Zero writes, zero watermark advancement.
 */

import { apiRequest } from "../stAuth.ts";
import type { ApiVerificationResult } from "./stSyncTypes.ts";

/**
 * Verify an API endpoint's response shape without any writes.
 *
 * @param endpoint   Full API path, e.g. "/jpm/v2/tenant/{tenant}/appointments"
 * @param environment ServiceTitan environment
 * @param tenantId    ServiceTitan tenant ID
 * @param filterParam Which filter to test: "createdOnOrAfter" or "modifiedOnOrAfter"
 * @param lookbackDays How far back to look for test data (default 365)
 */
export async function verifyApiEndpoint(
  endpoint: string,
  environment: string,
  tenantId: string,
  filterParam: "createdOnOrAfter" | "modifiedOnOrAfter" = "createdOnOrAfter",
  lookbackDays: number = 365
): Promise<ApiVerificationResult> {
  const params: Record<string, string> = {
    [filterParam]: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString(),
    page: "1",
    pageSize: "2",
  };

  const result = await apiRequest(endpoint, environment, { params });

  const records = result.data || result.results || result.appointments || (Array.isArray(result) ? result : []);
  const firstRecord = records.length > 0 ? records[0] : null;

  return {
    http_status: 200,
    endpoint,
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
    first_record_id: firstRecord?.id ?? "NOT_FOUND",
    first_record_createdOn: firstRecord?.createdOn ?? "NOT_FOUND",
    first_record_modifiedOn: firstRecord?.modifiedOn ?? "NOT_FOUND",
    writes_performed: false,
    watermark_advanced: false,
  };
}

/**
 * Estimate total record count for a domain using the API's totalCount field.
 */
export async function estimateRecordCount(
  endpoint: string,
  environment: string,
  tenantId: string
): Promise<number> {
  try {
    const { retryWithBackoff } = await import("../stAuth.ts");
    const result = await retryWithBackoff(async () => {
      return await apiRequest(endpoint, environment, { params: { page: "1", pageSize: "1" } });
    });

    if (result.totalCount != null) return result.totalCount;
    if (result.total_count != null) return result.total_count;
    if (result.count != null) return result.count;

    const hasMore = result.hasMore ?? result.has_more ?? false;
    return hasMore ? -1 : 0;
  } catch (err) {
    console.error("[ST SYNC API VERIFY] Failed to estimate count:", err);
    return -1;
  }
}