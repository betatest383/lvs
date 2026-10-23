/**
 * Customer Sync Compatibility Adapter — Non-Production Skeleton
 *
 * Demonstrates that the ServiceTitanSyncAdapter interface can support
 * the Customer domain's dual pagination models:
 *   - Export endpoint: continuation-token pagination (from, includeRecentChanges)
 *   - Transactional/recovery endpoint: page-based pagination (page, pageSize)
 *
 * THIS IS NOT CONNECTED TO PRODUCTION.
 * No Customer Sync imports or execution paths are switched.
 * No customer records are written, no watermark is advanced.
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
  DependencyResult,
  EligibilityResult,
} from "../stSyncAdapter.ts";
import { apiRequest, retryWithBackoff } from "../../stAuth.ts";
import { getString } from "../stSyncUtils.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Raw ServiceTitan CRM v2 customer record (export or transactional).
 * Only verified API fields declared explicitly. Index signature uses `unknown`.
 */
export interface StCustomerSource {
  id?: number | string;
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  createdOn?: string;
  modifiedOn?: string;
  [key: string]: unknown;
}

/** Mapped customer data ready for local entity create/update. */
export interface MappedCustomer {
  servicetitan_customer_id: string;
  name: string;
  customer_type: string;
  email: string;
  alt_email: string;
  phone: string;
  alt_phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  status: string;
  servicetitan_tenant_id: string;
  servicetitan_last_event_at: string | null;
  sourceCreatedOn: string | null;
  sourceModifiedOn: string | null;
}

/** Local Customer entity record. */
export interface LocalCustomer {
  id: string;
  servicetitan_customer_id: string;
  servicetitan_last_event_at?: string | null;
  servicetitan_sync_version?: number;
  contact_sync_status?: string;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CUSTOMER_DOMAIN = "customer";
const CUSTOMER_INTEGRATION_NAME = "servicetitan_customer_export";
const CUSTOMER_PAGE_SIZE = 500;

function customerExportEndpoint(tenantId: string): string {
  return `/crm/v2/tenant/${tenantId}/export/customers`;
}

function customerTransactionalEndpoint(tenantId: string): string {
  return `/crm/v2/tenant/${tenantId}/customers`;
}

// ─── Adapter Configuration ──────────────────────────────────────────────────

type CustomerSyncMode = "export" | "transactional";

function getSyncMode(context: SyncContext): CustomerSyncMode {
  if (context.source === "api_recovery") return "transactional";
  return "export";
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const customerCompatibilityAdapter: ServiceTitanSyncAdapter<
  StCustomerSource,
  MappedCustomer,
  LocalCustomer
> = {
  domain: CUSTOMER_DOMAIN,
  integrationName: CUSTOMER_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    const mode = getSyncMode(context);
    return mode === "export"
      ? customerExportEndpoint(context.tenantId)
      : customerTransactionalEndpoint(context.tenantId);
  },

  getInitialPaginationState(context: SyncContext): SyncPaginationState {
    const mode = getSyncMode(context);
    if (mode === "export") {
      return { mode: "continuation", continuationToken: null, pageSize: CUSTOMER_PAGE_SIZE };
    }
    return { mode: "page", page: 1, pageSize: 50 };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StCustomerSource>> {
    const mode = getSyncMode(context);
    const path = mode === "export"
      ? customerExportEndpoint(context.tenantId)
      : customerTransactionalEndpoint(context.tenantId);

    const params: Record<string, string> = {};

    if (mode === "export") {
      const pagination = request.pagination;
      if (pagination.mode !== "continuation") {
        throw new Error("Customer export requires continuation-token pagination");
      }
      if (pagination.continuationToken) {
        params.from = pagination.continuationToken;
      }
      params.includeRecentChanges = "true";
    } else {
      const pagination = request.pagination;
      if (pagination.mode !== "page") {
        throw new Error("Customer transactional requires page-based pagination");
      }
      params.page = String(pagination.page);
      params.pageSize = String(pagination.pageSize);
      if (request.filterField && request.windowStart) {
        params[request.filterField === "createdOn" ? "createdOnOrAfter" : "modifiedOnOrAfter"] = request.windowStart;
      }
    }

    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, context.environment, { params });
    });

    const records: StCustomerSource[] = result.data || result.customers || (Array.isArray(result) ? result : []);

    let hasMore: boolean;
    let nextContinuationToken: string | null = null;
    let nextPage: number | null = null;

    if (mode === "export") {
      const token = result.continueFrom || result.continue_from || result.nextPageToken || result.next_page_token || "";
      nextContinuationToken = token || null;
      const explicitHasMore = result.hasMore ?? result.has_more ?? result.hasMoreData ?? null;
      hasMore = explicitHasMore !== null ? explicitHasMore : !!nextContinuationToken;
    } else {
      hasMore = result.hasMore ?? result.has_more ?? false;
      const pagination = request.pagination as Extract<SyncPaginationState, { mode: "page" }>;
      nextPage = hasMore ? pagination.page + 1 : null;
    }

    const totalCount = result.totalCount ?? result.total_count ?? null;

    return {
      records,
      hasMore,
      nextPage,
      nextContinuationToken,
      totalCount,
      rawPagination: {
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      },
    };
  },

  getSourceId(record: StCustomerSource): string | null {
    const id = record.id != null ? String(record.id).trim() : "";
    return id || null;
  },

  getSourceCreatedOn(record: StCustomerSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StCustomerSource): string | null {
    return record.modifiedOn || null;
  },

  async mapRecord(
    record: StCustomerSource,
    context: SyncContext
  ): Promise<MappedCustomer> {
    const stId = record.id != null ? String(record.id).trim() : "";
    const active = record.active !== false;
    const rawStatus = active ? "active" : "inactive";

    const rawType = (record.type || "").toLowerCase();
    let customerType = "";
    if (rawType === "residential" || rawType === "res" || rawType === "home") {
      customerType = "residential";
    } else if (rawType === "commercial" || rawType === "com" || rawType === "business") {
      customerType = "commercial";
    }

    return {
      servicetitan_customer_id: stId,
      name: record.name || "",
      customer_type: customerType,
      email: record.email || "",
      alt_email: "",
      phone: record.phone || "",
      alt_phone: "",
      address: record.address || "",
      city: record.city || "",
      state: record.state || "",
      zip: record.zip || "",
      billing_address: "",
      billing_city: "",
      billing_state: "",
      billing_zip: "",
      status: rawStatus,
      servicetitan_tenant_id: context.tenantId,
      servicetitan_last_event_at: record.modifiedOn || null,
      sourceCreatedOn: record.createdOn || null,
      sourceModifiedOn: record.modifiedOn || null,
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedCustomer,
    _context: SyncContext
  ): Promise<LocalCustomer | null> {
    if (!mapped.servicetitan_customer_id) return null;
    try {
      const results = await base44.asServiceRole.entities.Customer.filter(
        { servicetitan_customer_id: mapped.servicetitan_customer_id },
        "-servicetitan_last_sync",
        1
      );
      return results.length > 0 ? (results[0] as LocalCustomer) : null;
    } catch (err) {
      console.error("[CUST COMPAT ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalCustomer): string | null {
    return existing.servicetitan_last_event_at || null;
  },

  // ── Eligibility hook (references existing customer eligibility logic) ──
  async checkEligibility(
    _base44: any,
    _record: StCustomerSource,
    mapped: MappedCustomer,
    existing: LocalCustomer | null,
    context: SyncContext
  ): Promise<EligibilityResult> {
    if (!context.watermark || context.watermark.status !== "active") {
      return { allowed: false, reason: "no_watermark", message: "Watermark not active" };
    }
    const activationTs = context.watermark.activation_timestamp;
    if (!activationTs) {
      return { allowed: false, reason: "no_activation_ts", message: "No activation timestamp" };
    }

    if (existing) return { allowed: true };

    if (!mapped.sourceCreatedOn) {
      return { allowed: false, reason: "missing_created_on", message: "createdOn missing — would defer for resolution" };
    }

    const createdTime = new Date(mapped.sourceCreatedOn).getTime();
    const activationTime = new Date(activationTs).getTime();
    if (isNaN(createdTime) || isNaN(activationTime)) {
      return { allowed: false, reason: "invalid_timestamp", message: "Invalid timestamp" };
    }
    if (createdTime < activationTime) {
      return { allowed: false, reason: "pre_activation", message: "Record created before activation" };
    }
    return { allowed: true };
  },

  recordsEqual(
    existing: LocalCustomer,
    mapped: MappedCustomer
  ): boolean {
    const fieldsToCompare = [
      "name",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "zip",
      "servicetitan_customer_id",
    ];
    for (const field of fieldsToCompare) {
      const existingVal = String(existing[field] ?? "").trim();
      const mappedVal = String((mapped as any)[field] ?? "").trim();
      if (existingVal !== mappedVal) return false;
    }
    return true;
  },

  // ── Create/update (references existing logic — not connected) ──
  async createRecord(
    _base44: any,
    _mapped: MappedCustomer,
    _context: SyncContext
  ): Promise<LocalCustomer> {
    throw new Error("Customer compatibility adapter — not connected to production");
  },

  async updateRecord(
    _base44: any,
    _existing: LocalCustomer,
    _mapped: MappedCustomer,
    _context: SyncContext
  ): Promise<LocalCustomer> {
    throw new Error("Customer compatibility adapter — not connected to production");
  },

  // ── Post-batch: contact sync (references existing logic) ──
  async postBatchProcess(
    _base44: any,
    _batch: any,
    _context: SyncContext
  ): Promise<void> {
    // Reference: stCustomerApiSync.ts syncContacts
    // Not connected in this skeleton
  },
};