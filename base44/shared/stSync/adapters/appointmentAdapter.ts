/**
 * Appointment Sync Adapter — Skeleton Implementation
 *
 * Implements ServiceTitanSyncAdapter for the Appointment domain.
 *
 * NOT CONNECTED TO PRODUCTION EXECUTION.
 * No appointment records are written, no watermark is advanced,
 * no scheduler or webhook is enabled through this adapter.
 *
 * Pagination: Page-based (page/pageSize) as proven by live API verification
 * of /jpm/v2/tenant/{tenant}/appointments.
 *
 * Customer Dependency: Fail-closed. A missing customer ID is a failure.
 * Missing local customers trigger the existing shared hydration utility.
 * Hydration failures create DeferredDependentRecord entries.
 * No orphan appointments are ever created.
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
import { ensureCustomerForDependentRecord } from "../../stCustomerHydration.ts";
import { syncAppointmentCreated } from "../../stAppointmentSync.ts";
import {
  normalizeAppointmentStatus,
  normalizeDispatchStatus,
  type AppointmentStatusNormalization,
  type DispatchStatusNormalization,
} from "../../stAppointmentStatusMapping.ts";

// ─── Source Types (verified ServiceTitan JPM v2 appointment fields) ─────────

/** Verified ServiceTitan JPM v2 appointment summary (nested in appointmentSummaries). */
export interface StAppointmentSummary {
  technicianId?: number | string;
  technicianName?: string;
  technicianEmail?: string;
  employeeId?: number | string;
  [key: string]: unknown;
}

/**
 * Raw ServiceTitan JPM v2 appointment record.
 * Only verified camelCase API fields are declared explicitly.
 * Index signature uses `unknown` — never `any`.
 */
export interface StAppointmentSource {
  id?: number | string;
  appointmentNumber?: string;
  jobId?: number | string;
  jobNumber?: string;
  customerId?: number | string;
  customerName?: string;
  customerPhone?: string;
  locationId?: number | string;
  locationName?: string;
  technicianId?: number | string;
  technicianName?: string;
  technicianEmail?: string;
  employeeId?: number | string;
  businessUnit?: string;
  jobType?: string;
  appointmentType?: string;
  status?: string;
  start?: string;
  end?: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  zipCode?: string;
  specialInstructions?: string;
  notes?: string;
  priority?: string;
  createdOn?: string;
  modifiedOn?: string;
  completedOn?: string;
  cancellationReason?: string;
  isOnHold?: boolean;
  isConfirmed?: boolean;
  active?: boolean;
  unused?: boolean;
  appointmentSummaries?: StAppointmentSummary[];
  [key: string]: unknown;
}

// ─── Mapped Type ──────────────────────────────────────────────────────────────

/**
 * Mapped appointment data ready for local entity create/update.
 * Contains all fields required for future optimistic concurrency.
 */
export interface MappedAppointment {
  // ── Primary sync key ──
  servicetitan_appointment_id: string;
  servicetitan_appointment_number: string;

  // ── Job linkage ──
  servicetitan_job_id: string;
  servicetitan_job_number: string;

  // ── Customer linkage ──
  servicetitan_customer_id: string;
  servicetitan_customer_name: string;
  servicetitan_customer_phone: string;

  // ── Location ──
  servicetitan_location_id: string;
  servicetitan_location_name: string;

  // ── Timestamps (for optimistic concurrency) ──
  servicetitan_created_on: string | null;
  servicetitan_modified_on: string | null;
  servicetitan_last_event_at: string | null;

  // ── Status (raw + normalized via centralized service) ──
  // rawStatus is ALWAYS preserved exactly as received from ServiceTitan.
  // status/dispatch_status are null when unsupported/invalid — the caller
  // must leave the existing lifecycle status unchanged in that case.
  // mapping_result is "mapped" | "unsupported" | "invalid".
  // is_cancellation / is_completion / is_hold come directly from the
  // normalization service — the adapter never inspects raw status strings.
  servicetitan_raw_status: string;
  status: string | null;
  dispatch_status: string | null;
  status_mapping_result: "mapped" | "unsupported" | "invalid";
  dispatch_mapping_result: "mapped" | "unsupported" | "invalid";
  status_reason?: string;
  dispatch_reason?: string;
  is_cancellation: boolean;
  is_completion: boolean;
  is_hold: boolean;

  // ── Scheduling ──
  scheduled_start: string | null;
  scheduled_end: string | null;
  servicetitan_arrival_window_start: string | null;
  servicetitan_arrival_window_end: string | null;

  // ── Confirmation / lifecycle state ──
  servicetitan_confirmed: boolean;
  servicetitan_hold_status: boolean;
  servicetitan_active: boolean;
  servicetitan_unused: boolean;
  is_canceled: boolean;
  servicetitan_cancellation_reason: string;

  // ── Technician identifiers ──
  servicetitan_technician_id: string;
  servicetitan_technician_name: string;
  servicetitan_technician_email: string;
  servicetitan_employee_id: string;

  // ── Business / job metadata ──
  servicetitan_business_unit: string;
  servicetitan_job_type: string;
  servicetitan_tenant_id: string;
  servicetitan_notes: string;
  servicetitan_priority: string;

  // ── Import metadata ──
  appointment_source: string;
  import_source: string;
  servicetitan_source: string;
  servicetitan_sync_status: string;
  servicetitan_sync_version: number;

  // ── Legacy compat ──
  crm_appointment_id: string;
  crm_job_number: string;

  // ── Local display fields ──
  customer_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  technician_name: string;
  technician_email: string;
  appointment_type: string;
}

/** Local Appointment entity record. */
export interface LocalAppointment {
  id: string;
  servicetitan_appointment_id: string;
  crm_appointment_id?: string;
  servicetitan_modified_on?: string | null;
  servicetitan_last_event_at?: string | null;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const APPOINTMENT_DOMAIN = "appointment";
const APPOINTMENT_INTEGRATION_NAME = "servicetitan_appointment_sync";
const APPOINTMENT_PAGE_SIZE = 50;

function appointmentsEndpoint(tenantId: string): string {
  return `/jpm/v2/tenant/${tenantId}/appointments`;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const appointmentAdapter: ServiceTitanSyncAdapter<
  StAppointmentSource,
  MappedAppointment,
  LocalAppointment
> = {
  domain: APPOINTMENT_DOMAIN,
  integrationName: APPOINTMENT_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    return appointmentsEndpoint(context.tenantId);
  },

  getInitialPaginationState(_context: SyncContext): SyncPaginationState {
    return { mode: "page", page: 1, pageSize: APPOINTMENT_PAGE_SIZE };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StAppointmentSource>> {
    const path = appointmentsEndpoint(context.tenantId);
    const pagination = request.pagination;

    if (pagination.mode !== "page") {
      throw new Error("Appointment sync uses page-based pagination only");
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

    const records: StAppointmentSource[] = result.data || result.appointments || [];
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

  getSourceId(record: StAppointmentSource): string | null {
    if (record.id == null) return null;
    const id = String(record.id).trim();
    return id || null;
  },

  getSourceCreatedOn(record: StAppointmentSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StAppointmentSource): string | null {
    return record.modifiedOn || null;
  },

  async mapRecord(
    record: StAppointmentSource,
    context: SyncContext
  ): Promise<MappedAppointment> {
    const stAppointmentId = record.id != null ? String(record.id).trim() : "";
    const rawStatus = record.status || "";

    // ── Centralized status normalization ──
    // The adapter NEVER contains inline status-mapping logic.
    // All sync paths call the same normalization service.
    // When unmapped, normalizedStatus is null — the caller must leave
    // the existing lifecycle status unchanged.
    const statusResult: AppointmentStatusNormalization = normalizeAppointmentStatus(rawStatus);
    const dispatchResult: DispatchStatusNormalization = normalizeDispatchStatus(rawStatus);

    // Extract technician from appointmentSummaries if top-level fields are absent
    let technicianId = record.technicianId != null ? String(record.technicianId).trim() : "";
    let technicianName = record.technicianName || "";
    let technicianEmail = record.technicianEmail || "";
    let employeeId = record.employeeId != null ? String(record.employeeId).trim() : "";

    if (!technicianId && Array.isArray(record.appointmentSummaries) && record.appointmentSummaries.length > 0) {
      const summary = record.appointmentSummaries[0];
      technicianId = summary.technicianId != null ? String(summary.technicianId).trim() : "";
      technicianName = summary.technicianName || technicianName;
      technicianEmail = summary.technicianEmail || technicianEmail;
      employeeId = summary.employeeId != null ? String(summary.employeeId).trim() : employeeId;
    }

    // Classification booleans come directly from the normalization service.
    // The adapter NEVER inspects raw ServiceTitan status strings.
    const isCanceled = statusResult.isCancellation;

    return {
      // Primary sync key
      servicetitan_appointment_id: stAppointmentId,
      servicetitan_appointment_number: record.appointmentNumber || "",

      // Job linkage
      servicetitan_job_id: record.jobId != null ? String(record.jobId) : "",
      servicetitan_job_number: record.jobNumber || "",

      // Customer linkage
      servicetitan_customer_id: record.customerId != null ? String(record.customerId) : "",
      servicetitan_customer_name: record.customerName || "",
      servicetitan_customer_phone: record.customerPhone || "",

      // Location
      servicetitan_location_id: record.locationId != null ? String(record.locationId) : "",
      servicetitan_location_name: record.locationName || "",

      // Timestamps
      servicetitan_created_on: record.createdOn || null,
      servicetitan_modified_on: record.modifiedOn || null,
      servicetitan_last_event_at: record.modifiedOn || null,

      // Status (raw always preserved; normalized is null when unsupported/invalid)
      servicetitan_raw_status: statusResult.rawStatus,
      status: statusResult.normalizedStatus,
      dispatch_status: dispatchResult.normalizedDispatchStatus,
      status_mapping_result: statusResult.mappingResult,
      dispatch_mapping_result: dispatchResult.mappingResult,
      status_reason: statusResult.reason,
      dispatch_reason: dispatchResult.reason,
      is_cancellation: statusResult.isCancellation,
      is_completion: statusResult.isCompletion,
      is_hold: statusResult.isHold,

      // Scheduling
      scheduled_start: record.start || null,
      scheduled_end: record.end || null,
      servicetitan_arrival_window_start: record.arrivalWindowStart || null,
      servicetitan_arrival_window_end: record.arrivalWindowEnd || null,

      // Confirmation / lifecycle state
      servicetitan_confirmed: record.isConfirmed ?? false,
      servicetitan_hold_status: record.isOnHold ?? false,
      servicetitan_active: record.active ?? true,
      servicetitan_unused: record.unused ?? false,
      is_canceled: isCanceled,
      servicetitan_cancellation_reason: record.cancellationReason || "",

      // Technician identifiers
      servicetitan_technician_id: technicianId,
      servicetitan_technician_name: technicianName,
      servicetitan_technician_email: technicianEmail,
      servicetitan_employee_id: employeeId,

      // Business / job metadata
      servicetitan_business_unit: record.businessUnit || "",
      servicetitan_job_type: record.jobType || "",
      servicetitan_tenant_id: context.tenantId,
      servicetitan_notes: record.specialInstructions || record.notes || "",
      servicetitan_priority: record.priority || "",

      // Import metadata
      appointment_source: "crm",
      import_source: context.source === "webhook" ? "webhook" : context.source === "api_recovery" ? "api_recovery" : context.source === "on_demand_hydration" ? "on_demand_hydration" : "manual",
      servicetitan_source: context.source === "webhook" ? "webhook" : "api",
      servicetitan_sync_status: "synced",
      servicetitan_sync_version: 0,

      // Legacy compat
      crm_appointment_id: stAppointmentId,
      crm_job_number: record.jobNumber || "",

      // Local display fields
      customer_name: record.customerName || "",
      address: record.address || "",
      city: record.city || "",
      state: record.state || "",
      zip: record.zip || record.zipCode || "",
      technician_name: technicianName,
      technician_email: technicianEmail,
      appointment_type: record.appointmentType || record.jobType || "",
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedAppointment,
    _context: SyncContext
  ): Promise<LocalAppointment | null> {
    if (!mapped.servicetitan_appointment_id) return null;
    try {
      const results = await base44.asServiceRole.entities.Appointment.filter(
        { servicetitan_appointment_id: mapped.servicetitan_appointment_id },
        "-servicetitan_last_synced_at",
        1
      );
      if (results.length > 0) return results[0] as LocalAppointment;

      const legacy = await base44.asServiceRole.entities.Appointment.filter(
        { crm_appointment_id: mapped.servicetitan_appointment_id },
        null,
        1
      );
      return legacy.length > 0 ? (legacy[0] as LocalAppointment) : null;
    } catch (err) {
      console.error("[APPT ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalAppointment): string | null {
    return existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
  },

  // ── Customer dependency — FAIL-CLOSED ──
  async verifyDependencies(
    base44: any,
    mapped: MappedAppointment,
    context: SyncContext
  ): Promise<DependencyResult> {
    // FAIL-CLOSED: Missing customer ID is a failure — never create orphan appointments
    if (!mapped.servicetitan_customer_id) {
      return {
        status: "failed",
        warning: "Appointment is missing servicetitan_customer_id — cannot create orphan appointment",
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
        "appointment",
        mapped.servicetitan_appointment_id,
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
    existing: LocalAppointment,
    mapped: MappedAppointment
  ): boolean {
    // Compare key ST-controlled fields for optimistic concurrency.
    // status and dispatch_status are excluded: when unsupported/invalid
    // (null), the existing value is intentionally left unchanged and must
    // not trigger a false "changed" detection. Raw status is compared instead.
    const fieldsToCompare = [
      "servicetitan_customer_id",
      "servicetitan_job_id",
      "servicetitan_job_number",
      "servicetitan_location_id",
      "scheduled_start",
      "scheduled_end",
      "servicetitan_technician_id",
      "servicetitan_raw_status",
      "servicetitan_modified_on",
    ];
    for (const field of fieldsToCompare) {
      const existingVal = String(existing[field] ?? "").trim();
      const mappedVal = String((mapped as any)[field] ?? "").trim();
      if (existingVal !== mappedVal) return false;
    }

    // If status was mapped, compare it too. If unsupported/invalid (null),
    // skip — the existing lifecycle status is intentionally preserved.
    if (mapped.status_mapping_result === "mapped" && mapped.status !== null) {
      const existingStatus = String(existing.status ?? "").trim();
      const mappedStatus = String(mapped.status).trim();
      if (existingStatus !== mappedStatus) return false;
    }

    return true;
  },

  // ── Create/update — WIRED to the real sync function ──
  // Delegates to syncAppointmentCreated which handles technician mapping,
  // conflict detection, customer hydration, and entity persistence.

  async createRecord(
    base44: any,
    mapped: MappedAppointment,
    context: SyncContext
  ): Promise<LocalAppointment> {
    const payload = mappedToWebhookPayload(mapped);
    const result = await syncAppointmentCreated({
      base44,
      payload,
      event: {
        id: context.eventId || `${context.batchId}-${mapped.servicetitan_appointment_id}`,
        event_type: context.eventType || "appointment_created",
        object_id: mapped.servicetitan_appointment_id,
        tenant_id: context.tenantId,
      },
      action: "created",
    });

    if (!result.success) {
      throw new Error(result.error || "syncAppointmentCreated failed for createRecord");
    }

    // Re-fetch the created/updated record
    const existing = await this.findExisting(base44, mapped, context);
    if (!existing) {
      throw new Error("Record not found after syncAppointmentCreated");
    }
    return existing;
  },

  async updateRecord(
    base44: any,
    existing: LocalAppointment,
    mapped: MappedAppointment,
    context: SyncContext
  ): Promise<LocalAppointment> {
    const payload = mappedToWebhookPayload(mapped);
    const result = await syncAppointmentCreated({
      base44,
      payload,
      event: {
        id: context.eventId || `${context.batchId}-${mapped.servicetitan_appointment_id}`,
        event_type: context.eventType || "appointment_updated",
        object_id: mapped.servicetitan_appointment_id,
        tenant_id: context.tenantId,
      },
      action: "updated",
    });

    if (!result.success) {
      throw new Error(result.error || "syncAppointmentCreated failed for updateRecord");
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
 * Convert MappedAppointment to the webhook payload shape expected by
 * syncAppointmentCreated's extractAppointmentData.
 */
function mappedToWebhookPayload(mapped: MappedAppointment): any {
  return {
    servicetitan_appointment_id: mapped.servicetitan_appointment_id,
    appointment_id: mapped.servicetitan_appointment_id,
    servicetitan_job_id: mapped.servicetitan_job_id,
    job_id: mapped.servicetitan_job_id,
    servicetitan_job_number: mapped.servicetitan_job_number,
    job_number: mapped.servicetitan_job_number,
    servicetitan_customer_id: mapped.servicetitan_customer_id,
    customer_id: mapped.servicetitan_customer_id,
    servicetitan_customer_name: mapped.servicetitan_customer_name,
    customer_name: mapped.servicetitan_customer_name,
    servicetitan_customer_phone: mapped.servicetitan_customer_phone,
    customer_phone: mapped.servicetitan_customer_phone,
    servicetitan_technician_id: mapped.servicetitan_technician_id,
    technician_id: mapped.servicetitan_technician_id,
    servicetitan_employee_id: mapped.servicetitan_employee_id,
    employee_id: mapped.servicetitan_employee_id,
    servicetitan_technician_name: mapped.servicetitan_technician_name,
    technician_name: mapped.servicetitan_technician_name,
    technician_email: mapped.servicetitan_technician_email,
    servicetitan_tenant_id: mapped.servicetitan_tenant_id,
    tenant_id: mapped.servicetitan_tenant_id,
    servicetitan_business_unit: mapped.servicetitan_business_unit,
    business_unit: mapped.servicetitan_business_unit,
    servicetitan_job_type: mapped.servicetitan_job_type,
    job_type: mapped.servicetitan_job_type,
    appointment_type: mapped.appointment_type,
    address: mapped.address,
    city: mapped.city,
    state: mapped.state,
    zip: mapped.zip,
    notes: mapped.servicetitan_notes,
    special_instructions: mapped.servicetitan_notes,
    servicetitan_arrival_window_start: mapped.servicetitan_arrival_window_start,
    arrival_window_start: mapped.servicetitan_arrival_window_start,
    servicetitan_arrival_window_end: mapped.servicetitan_arrival_window_end,
    arrival_window_end: mapped.servicetitan_arrival_window_end,
    scheduled_start: mapped.scheduled_start,
    start_time: mapped.scheduled_start,
    scheduled_end: mapped.scheduled_end,
    end_time: mapped.scheduled_end,
    status: mapped.servicetitan_raw_status,
    priority: mapped.servicetitan_priority,
    createdOn: mapped.servicetitan_created_on,
    modifiedOn: mapped.servicetitan_modified_on,
    event_timestamp: mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || new Date().toISOString(),
    is_on_hold: mapped.servicetitan_hold_status,
    is_confirmed: mapped.servicetitan_confirmed,
    active: mapped.servicetitan_active,
    unused: mapped.servicetitan_unused,
    cancellation_reason: mapped.servicetitan_cancellation_reason,
  };
}