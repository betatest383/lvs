/**
 * Stage 2E.7 Shadow Audit — Bounded ServiceTitan request controller (D-E).
 *
 * Wraps `apiRequest` with a maximum of TWO retries per transiently failed
 * request. Does NOT use `retryWithBackoff` (which defaults to 5 attempts).
 * No retry for permanent failures. Identical request scope on retry.
 * Every attempt is recorded in the fetch ledger.
 *
 * Runtime and test-only. Contacts ServiceTitan only via the approved GET path.
 */

import { apiRequest, ApiError } from "../stAuth.ts";
import { instrumentFetchWithLedger } from "./stStage2E5Shared.ts";
import { STAGE_2E7_MAX_RETRIES } from "./stStage2E7ShadowAuditConfig.ts";

export interface BoundedFetchResult {
  records: any[];
  hasMore: boolean;
  nextPage: number | null;
  totalCount: number | null;
  attempts: number;
  retries: number;
  ledger: any[];
  permanentFailure: boolean;
}

export async function boundedGetPage(
  environment: string,
  path: string,
  params: Record<string, string>,
  correlationId: string,
  page: number,
  pageSize: number,
): Promise<BoundedFetchResult> {
  const { ledger, restore } = instrumentFetchWithLedger(correlationId);
  let attempts = 0;
  let retries = 0;
  let lastErr: any;
  for (let attempt = 0; attempt <= STAGE_2E7_MAX_RETRIES; attempt++) {
    attempts++;
    if (attempt > 0) retries++;
    try {
      const data = await apiRequest(path, environment, {
        method: "GET",
        params: { ...params, page: String(page), pageSize: String(pageSize) },
      });
      restore();
      const records = Array.isArray(data) ? data : (data.data || data.items || []);
      const hasMore = data?.hasMore ?? data?.hasMoreResults ?? false;
      const nextPage = data?.nextPage ?? (hasMore ? page + 1 : null);
      const totalCount = data?.totalCount ?? null;
      return { records, hasMore, nextPage, totalCount, attempts, retries, ledger, permanentFailure: false };
    } catch (err: any) {
      lastErr = err;
      if (err instanceof ApiError && !err.retryable) {
        restore();
        return { records: [], hasMore: false, nextPage: null, totalCount: null, attempts, retries, ledger, permanentFailure: true };
      }
      if (attempt === STAGE_2E7_MAX_RETRIES) {
        restore();
        return { records: [], hasMore: false, nextPage: null, totalCount: null, attempts, retries, ledger, permanentFailure: false };
      }
    }
  }
  restore();
  return { records: [], hasMore: false, nextPage: null, totalCount: null, attempts, retries, ledger, permanentFailure: false };
}

/** Classify an HTTP method+url against the GET-only rule. Returns the ledger entry classification. */
export function classifyBusinessMethod(method: string, isBusiness: boolean): "GET" | "BLOCKED_NON_GET_BUSINESS" | "AUTH" | "OTHER" {
  if (!isBusiness) return method === "GET" ? "AUTH" : "OTHER";
  return method === "GET" ? "GET" : "BLOCKED_NON_GET_BUSINESS";
}