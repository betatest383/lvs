/**
 * Job Sync Adapter
 *
 * Implements ServiceTitanSyncAdapter for the Job domain.
 *
 * NOT CONNECTED TO PRODUCTION EXECUTION.
 * No job records are written, no watermark is advanced,
 * no scheduler or webhook is enabled through this adapter.
 *
 * Endpoint: /jpm/v2/tenant/{tenant}/jobs (verified from ST JPM v2 API schema)
 * Pagination: Page-based (page/pageSize) — same as Appointments
 *
 * Customer Dependency: Fail-closed. A missing customer ID is a failure.
 * Missing local customers trigger the existing shared hydration utility.
 * Hydration failures create DeferredDependentRecord entries.
 * No orphan jobs are ever created.
 *
 * Location Dependency: OPTIONAL. The raw locationId is preserved but no
 * local Location lookup is performed. Location data (address, city, state,
 * zip) is resolved from the customer/location API, not from the Jobs API.
 *
 * Appointment Relationship: Idempotent reconciliation via existing
 * resolveAppointments() — queries Appointment records by servicetitan_job_id.
 * No placeholder appointments are created. No appointment workflow state
 * is overwritten.
 *
 * Field Ownership:
 *   - ServiceTitan-owned: job ID, job number, customer ID, location ID,
 *     business unit, job type, campaign, project, raw status, created/modified
 *     timestamps, summary, priority, completion/cancellation data
 *   - LVC OS-owned: notes, workflow_version, apprentice, truck assignment,
 *     Job Hub state, inspections, estimates, proposals, internal review state
 *   - Merged: customer_id (resolved via lookup), job_type (mapped from ST),
 *     status (mapped from ST raw with forward-progression), dispatch_status,
 *     technician assignments (resolved via EmployeeRegistry)
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
  DependencyResult,
} from "../stSyncAdapter.ts";
import { apiRequest, retryWithBackoff } from "../../stAuth.ts";
import { ensureCustomerForDependentRecord } from "../../stCustomerHydration.ts";
import { syncJobCreated, syncJobUpdated } from "../../stJobSync.ts";
import {
  normalizeJobStatus,
  type JobStatusNormalization,
} from "../../stJobStatusMapping.ts";

// ─── Source Types (verified from ServiceTitan JPM v2 Jobs API schema) ────────

/**
 * Raw ServiceTitan JPM v2 job record.
 * Fields verified from the official JSON schema at:
 *   https://raw.githubusercontent.com/api-evangelist/servicetitan/refs/heads/main/json-schema/servicetitan-job-schema.json
 *
 * Required API fields: id, customerId, locationId, businessUnitId, jobTypeId
 * Index signature uses `unknown` — never `any`.
 */
export interface StJobSource {
  id?: number | string;
  jobNumber?: string;
  customerId?: number | string;
  locationId?: number | string;
  businessUnitId?: number | string;
  jobTypeId?: number | string;
  priority?: string; // enum: "Urgent", "High", "Normal", "Low"
  jobStatus?: string; // enum: "Scheduled", "Dispatched", "InProgress", "Hold", "Completed", "Canceled"
  completedOn?: string | null;
  campaignId?: number | string | null;
  summary?: string;
  appointmentCount?: number;
  firstAppointmentId?: number | string | null;
  lastAppointmentId?: number | string | null;
  recallForId?: number | string | null;
  warrantyId?: number | string | null;
  noCharge?: boolean;
  notificationsEnabled?: boolean;
  createdOn?: string;
  modifiedOn?: string;
  customFields?: Array<{ typeId: number; name: string; value: string }>;
  jobGeneratedLeadSource?: { jobId?: number | string | null; employeeId?: number | string | null } | null;
  [key: string]: unknown;
}

// ─── Mapped Type ──────────────────────────────────────────────────────────────

/**
 * Mapped job data ready for local entity create/update.
 */
export interface MappedJob {
  // ── Primary sync key ──
  servicetitan_job_id: string;
  servicetitan_job_number: string;
  crm_job_number: string; // legacy alias

  // ── Customer linkage ──
  servicetitan_customer_id: string;

  // ── Location / business unit / job type ──
  servicetitan_location_id: string;
  servicetitan_business_unit_id: string;
  servicetitan_job_type_id: string;
  servicetitan_campaign_id: string;
  servicetitan_project_id: string;

  // ── Timestamps (for optimistic concurrency) ──
  servicetitan_created_on: string | null;
  servicetitan_modified_on: string | null;
  servicetitan_last_event_at: string | null;

  // ── Status (raw + normalized via centralized service) ──
  servicetitan_raw_status: string;
  status: string | null;
  status_mapping_result: "mapped" | "unsupported" | "invalid";
  is_completed: boolean;
  is_cancelled: boolean;
  is_on_hold: boolean;
  is_active: boolean;

  // ── Completion / cancellation state ──
  completed_at: string | null;

  // ── Job metadata ──
  servicetitan_summary: string;
  servicetitan_tenant_id: string;
  priority: string | null;

  // ── Recall / warranty indicators ──
  is_recall: boolean;
  has_warranty: boolean;
  no_charge: boolean;

  // ── Import metadata ──
  servicetitan_source: string;
  servicetitan_sync_status: string;
  servicetitan_sync_version: number;
}

/** Local Job entity record. */
export interface LocalJob {
  id: string;
  servicetitan_job_id: string;
  crm_job_number?: string;
  servicetitan_modified_on?: string | null;
  servicetitan_last_event_at?: string | null;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const JOB_DOMAIN = "job";
const JOB_INTEGRATION_NAME = "servicetitan_job_sync";
const JOB_PAGE_SIZE = 50;

function jobsEndpoint(tenantId: string): string {
  return `/jpm/v2/tenant/${tenantId}/jobs`;
}

// ─── Priority Normalization ──────────────────────────────────────────────────

function normalizePriority(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("urgent")) return "urgent";
  if (s.includes("high")) return "high";
  if (s.includes("normal")) return "normal";
  if (s.includes("low")) return "low";
  return null;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const jobAdapter: ServiceTitanSyncAdapter<
  StJobSource,
  MappedJob,
  LocalJob
> = {
  domain: JOB_DOMAIN,
  integrationName: JOB_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    return jobsEndpoint(context.tenantId);
  },

  getInitialPaginationState(_context: SyncContext): SyncPaginationState {
    return { mode: "page", page: 1, pageSize: JOB_PAGE_SIZE };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StJobSource>> {
    const path = jobsEndpoint(context.tenantId);
    const pagination = request.pagination;

    if (pagination.mode !== "page") {
      throw new Error("Job sync uses page-based pagination only");
    }

    const params: Record<string, string> = {
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    };
    if (request.filterField && request.windowStart) {
      params[request.filterField === "createdOn" ? "createdOnOrAfter" : "modifiedOnOrAfter"] = request.windowStart;
    }

    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, context.environment, { params });
    });

    const records: StJobSource[] = result.data || result.jobs || [];
    const hasMore = result.hasMore ?? result.has_more ?? false;
    const totalCount = result.totalCount ?? result.total_count ?? null;

    return {
      records,
      hasMore,
      nextPage: hasMore ? pagination.page + 1 : null,
      totalCount,
      rawPagination: { page: result.page, pageSize: result.pageSize, hasMore },
    };
  },

  getSourceId(record: StJobSource): string | null {
    if (record.id == null) return null;
    const id = String(record.id).trim();
    return id || null;
  },

  getSourceCreatedOn(record: StJobSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StJobSource): string | null {
    return record.modifiedOn || null;
  },

  async mapRecord(
    record: StJobSource,
    context: SyncContext
  ): Promise<MappedJob> {
    const stJobId = record.id != null ? String(record.id).trim() : "";
    const rawStatus = record.jobStatus || "";

    // ── Centralized status normalization ──
    const statusResult: JobStatusNormalization = normalizeJobStatus(rawStatus);

    return {
      // Primary sync key
      servicetitan_job_id: stJobId,
      servicetitan_job_number: record.jobNumber || "",
      crm_job_number: record.jobNumber || "",

      // Customer linkage
      servicetitan_customer_id: record.customerId != null ? String(record.customerId) : "",

      // Location / business unit / job type
      servicetitan_location_id: record.locationId != null ? String(record.locationId) : "",
      servicetitan_business_unit_id: record.businessUnitId != null ? String(record.businessUnitId) : "",
      servicetitan_job_type_id: record.jobTypeId != null ? String(record.jobTypeId) : "",
      servicetitan_campaign_id: record.campaignId != null ? String(record.campaignId) : "",
      servicetitan_project_id: "", // Not in the base Jobs API response; populated from webhooks

      // Timestamps
      servicetitan_created_on: record.createdOn || null,
      servicetitan_modified_on: record.modifiedOn || null,
      servicetitan_last_event_at: record.modifiedOn || null,

      // Status (raw always preserved; normalized is null when unsupported/invalid/Hold)
      servicetitan_raw_status: statusResult.rawStatus,
      status: statusResult.normalizedStatus,
      status_mapping_result: statusResult.mappingResult,
      is_completed: statusResult.isCompleted,
      is_cancelled: statusResult.isCancelled,
      is_on_hold: statusResult.isOnHold,
      is_active: statusResult.isActive,

      // Completion / cancellation state
      completed_at: statusResult.isCompleted ? (record.completedOn || null) : null,

      // Job metadata
      servicetitan_summary: record.summary || "",
      servicetitan_tenant_id: context.tenantId,
      priority: normalizePriority(record.priority),

      // Recall / warranty indicators
      is_recall: record.recallForId != null,
      has_warranty: record.warrantyId != null,
      no_charge: record.noCharge ?? false,

      // Import metadata
      servicetitan_source: context.source === "webhook" ? "webhook" : "api",
      servicetitan_sync_status: "synced",
      servicetitan_sync_version: 0,
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedJob,
    _context: SyncContext
  ): Promise<LocalJob | null> {
    if (!mapped.servicetitan_job_id) return null;
    try {
      const results = await base44.asServiceRole.entities.Job.filter(
        { servicetitan_job_id: mapped.servicetitan_job_id },
        "-servicetitan_last_sync_at",
        1
      );
      if (results.length > 0) return results[0] as LocalJob;

      const legacy = await base44.asServiceRole.entities.Job.filter(
        { crm_job_number: mapped.servicetitan_job_number },
        null,
        1
      );
      return legacy.length > 0 ? (legacy[0] as LocalJob) : null;
    } catch (err) {
      console.error("[JOB ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalJob): string | null {
    return existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
  },

  // ── Customer dependency — FAIL-CLOSED ──
  async verifyDependencies(
    base44: any,
    mapped: MappedJob,
    context: SyncContext
  ): Promise<DependencyResult> {
    // FAIL-CLOSED: Missing customer ID is a failure — never create orphan jobs
    if (!mapped.servicetitan_customer_id) {
      return {
        status: "failed",
        warning: "Job is missing servicetitan_customer_id — cannot create orphan job",
      };
    }

    // Check if customer exists locally
    try {
      const results = await base44.asServiceRole.entities.Customer.filter(
        { servicetitan_customer_id: mapped.servicetitan_customer_id },
        "-servicetitan_last_sync",
        1
      );
      if (results.length > 0) {
        return { status: "satisfied" };
      }

      // Customer not found — invoke existing shared Customer Hydration (no duplication)
      const hydrationResult = await ensureCustomerForDependentRecord(
        base44,
        mapped.servicetitan_customer_id,
        context.tenantId,
        context.environment,
        "job",
        mapped.servicetitan_job_id,
        context.eventId,
        context.payload || mapped
      );

      if (hydrationResult.status === "matched" || hydrationResult.status === "hydrated") {
        return { status: "satisfied" };
      }

      // Hydration failed — DeferredDependentRecord was created by the hydration utility
      return {
        status: "deferred",
        warning: hydrationResult.warning || `Customer '${mapped.servicetitan_customer_id}' hydration failed`,
        deferredRecordId: hydrationResult.deferredRecordId,
      };
    } catch (err: any) {
      return {
        status: "failed",
        warning: `Customer dependency check failed: ${err.message}`,
      };
    }
  },

  recordsEqual(
    existing: LocalJob,
    mapped: MappedJob
  ): boolean {
    // Compare key ST-controlled fields for optimistic concurrency.
    // status is excluded when null (Hold/unsupported/invalid): the existing
    // lifecycle status is intentionally left unchanged.
    //
    // servicetitan_modified_on is intentionally excluded: buildSyncUpdateData
    // does not store this field (it stores servicetitan_last_event_at and
    // servicetitan_last_sync_at instead). Timestamp comparison is handled
    // by the stale-event check via getLocalSourceModifiedOn, not here.
    //
    // servicetitan_raw_status is compared case-insensitively because
    // extractJobData lowercases it (.toLowerCase()) before storage, while
    // normalizeJobStatus preserves the original case.
    const fieldsToCompare = [
      "servicetitan_customer_id",
      "servicetitan_job_number",
      "servicetitan_location_id",
      "servicetitan_business_unit_id",
      "servicetitan_job_type_id",
      "servicetitan_campaign_id",
      "servicetitan_summary",
    ];
    for (const field of fieldsToCompare) {
      const existingVal = String(existing[field] ?? "").trim();
      const mappedVal = String((mapped as any)[field] ?? "").trim();
      if (existingVal !== mappedVal) return false;
    }

    // Case-insensitive comparison for raw status (extractJobData lowercases)
    const existingStatus = String(existing.servicetitan_raw_status ?? "").trim().toLowerCase();
    const mappedStatus = String(mapped.servicetitan_raw_status ?? "").trim().toLowerCase();
    if (existingStatus !== mappedStatus) return false;

    // If status was mapped and non-null, compare it too. If null (Hold/unsupported/invalid),
    // skip — the existing lifecycle status is intentionally preserved.
    if (mapped.status_mapping_result === "mapped" && mapped.status !== null) {
      const existingStatus = String(existing.status ?? "").trim();
      const mappedStatus = String(mapped.status).trim();
      if (existingStatus !== mappedStatus) return false;
    }

    // Compare priority if mapped
    if (mapped.priority !== null) {
      const existingPriority = String(existing.priority ?? "").trim().toLowerCase();
      const mappedPriority = String(mapped.priority).trim().toLowerCase();
      if (existingPriority !== mappedPriority) return false;
    }

    return true;
  },

  // ── Create/update — WIRED to the real sync function ──
  // Delegates to syncJobCreated/syncJobUpdated which handle technician mapping,
  // conflict detection, customer hydration, appointment resolution, and entity persistence.
  // NOT invoked during dry_run — the engine skips createRecord/updateRecord when
  // execution_mode = "dry_run".

  async createRecord(
    base44: any,
    mapped: MappedJob,
    context: SyncContext
  ): Promise<LocalJob> {
    const payload = mappedToWebhookPayload(mapped);
    const result = await syncJobCreated({
      base44,
      payload,
      event: {
        id: context.eventId || `${context.batchId}-${mapped.servicetitan_job_id}`,
        event_type: context.eventType || "job_created",
        object_id: mapped.servicetitan_job_id,
        tenant_id: context.tenantId,
      },
      action: "created",
    });

    if (!result.success) {
      throw new Error(result.error || "syncJobCreated failed for createRecord");
    }

    // Re-fetch the created/updated record
    const existing = await this.findExisting(base44, mapped, context);
    if (!existing) {
      throw new Error("Record not found after syncJobCreated");
    }
    return existing;
  },

  async updateRecord(
    base44: any,
    existing: LocalJob,
    mapped: MappedJob,
    context: SyncContext
  ): Promise<LocalJob> {
    const payload = mappedToWebhookPayload(mapped);
    const result = await syncJobUpdated({
      base44,
      payload,
      event: {
        id: context.eventId || `${context.batchId}-${mapped.servicetitan_job_id}`,
        event_type: context.eventType || "job_updated",
        object_id: mapped.servicetitan_job_id,
        tenant_id: context.tenantId,
      },
      action: "updated",
    });

    if (!result.success) {
      throw new Error(result.error || "syncJobUpdated failed for updateRecord");
    }

    // Re-fetch the updated record
    const updated = await this.findExisting(base44, mapped, context);
    if (!updated) {
      throw new Error("Record not found after update");
    }
    return updated;
  },
};

// ─── Payload Conversion ─────────────────────────────────────────────────────

/**
 * Convert MappedJob to the webhook payload shape expected by
 * syncJobCreated's extractJobData.
 */
function mappedToWebhookPayload(mapped: MappedJob): any {
  return {
    servicetitan_job_id: mapped.servicetitan_job_id,
    job_id: mapped.servicetitan_job_id,
    servicetitan_job_number: mapped.servicetitan_job_number,
    job_number: mapped.servicetitan_job_number,
    servicetitan_customer_id: mapped.servicetitan_customer_id,
    customer_id: mapped.servicetitan_customer_id,
    servicetitan_location_id: mapped.servicetitan_location_id,
    location_id: mapped.servicetitan_location_id,
    servicetitan_business_unit_id: mapped.servicetitan_business_unit_id,
    business_unit_id: mapped.servicetitan_business_unit_id,
    servicetitan_job_type_id: mapped.servicetitan_job_type_id,
    job_type_id: mapped.servicetitan_job_type_id,
    servicetitan_campaign_id: mapped.servicetitan_campaign_id,
    campaign_id: mapped.servicetitan_campaign_id,
    servicetitan_project_id: mapped.servicetitan_project_id,
    project_id: mapped.servicetitan_project_id,
    servicetitan_tenant_id: mapped.servicetitan_tenant_id,
    tenant_id: mapped.servicetitan_tenant_id,
    job_status: mapped.servicetitan_raw_status,
    status: mapped.servicetitan_raw_status,
    servicetitan_raw_status: mapped.servicetitan_raw_status,
    summary: mapped.servicetitan_summary,
    priority: mapped.priority || "",
    completed_at: mapped.completed_at,
    completion_date: mapped.completed_at,
    createdOn: mapped.servicetitan_created_on,
    modifiedOn: mapped.servicetitan_modified_on,
    event_timestamp: mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || new Date().toISOString(),
  };
}