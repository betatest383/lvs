/**
 * ServiceTitan Job Synchronization — Helpers
 *
 * Shared helpers for stJobSync.ts: types, constants, payload extraction,
 * customer resolution, technician mapping, appointment resolution,
 * status mapping, conflict detection, and update-data building.
 *
 * This module contains NO public sync functions — those live in stJobSync.ts.
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import { ensureCustomerForDependentRecord } from "./stCustomerHydration.ts";
import { getTenantId, getEnvironment } from "./stAuth.ts";

const COMPANY_TIMEZONE = "America/New_York";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncContext {
  base44: any;
  payload: any;
  event: any;
  action: string;
  /** When true, skip ServiceTitan API hydration calls (test harness only). */
  testSkipHydration?: boolean;
}

export interface SyncResult {
  success: boolean;
  summary: string;
  warnings?: string[];
  metadata?: Record<string, any>;
  error?: string;
  retryable?: boolean;
  finalStatus?: "processed" | "ignored";
}

export interface TechMapping {
  status: "matched" | "unmatched" | "unassigned";
  employeeRegistryId?: string;
  employeeName?: string;
  employeeEmail?: string;
  stTechnicianId?: string;
  stTechnicianName?: string;
  warning?: string;
}

export interface CustomerResolution {
  status: "matched" | "pending" | "unmatched" | "deferred";
  customerId?: string;
  customerName?: string;
  customerNumber?: string;
  warning?: string;
  deferredRecordId?: string;
}

// ─── Fields controlled by ServiceTitan (may overwrite local edits with audit) ─

export const ST_CONTROLLED_FIELDS = [
  "crm_job_number",
  "customer_id",
  "customer_name",
  "customer_number",
  "address",
  "city",
  "state",
  "zip",
  "job_type",
  "status",
  "dispatch_status",
  "appointment_date",
  "service_date",
  "arrival_window_start",
  "arrival_window_end",
  "technician_email",
  "technician_emails",
  "technician_name",
  "lead_technician_email",
  "lead_technician_name",
  "servicetitan_job_id",
  "servicetitan_job_number",
  "servicetitan_customer_id",
  "servicetitan_location_id",
  "servicetitan_location_name",
  "servicetitan_business_unit",
  "servicetitan_business_unit_id",
  "servicetitan_job_type",
  "servicetitan_job_type_id",
  "servicetitan_campaign_id",
  "servicetitan_project_id",
  "servicetitan_tenant_id",
  "servicetitan_raw_status",
  "servicetitan_latitude",
  "servicetitan_longitude",
  "servicetitan_arrival_window_start",
  "servicetitan_arrival_window_end",
  "servicetitan_summary",
  "servicetitan_technician_ids",
  "servicetitan_technician_names",
  "servicetitan_appointment_ids",
  "customer_mapping_status",
  "customer_mapping_warning",
  "technician_mapping_status",
  "technician_mapping_warning",
];

// ─── Centralized Status Mapping ───────────────────────────────────────────────

/**
 * ServiceTitan raw status → LVC Job status.
 * Empty string = do NOT change the LVC status field (preserve workflow state).
 */
const ST_TO_LVC_STATUS_MAP: Record<string, string> = {
  scheduled: "scheduled",
  dispatched: "assigned",
  in_progress: "in_progress",
  on_hold: "",
  onhold: "",
  hold: "",
  completed: "completed",
  canceled: "cancelled",
  cancelled: "cancelled",
  reopened: "",
};

/**
 * LVC status progression order (for forward-only movement).
 */
const LVC_STATUS_ORDER = [
  "scheduled",
  "assigned",
  "in_progress",
  "inspection_complete",
  "estimate_sent",
  "approved",
  "invoiced",
  "completed",
];

/**
 * ServiceTitan job type → LVC job_type enum.
 */
const ST_TO_LVC_JOB_TYPE_MAP: Record<string, string> = {
  inspection: "inspection",
  inspect: "inspection",
  repair: "repair",
  repairs: "repair",
  cleaning: "cleaning",
  sweep: "cleaning",
  installation: "installation",
  install: "installation",
  replacement: "installation",
  follow_up: "follow_up",
  followup: "follow_up",
  "follow-up": "follow_up",
  maintenance: "follow_up",
};

// ─── Time Zone Helpers ──────────────────────────────────────────────────────

function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hourStr = map.hour === "24" ? "00" : map.hour;
  const asUTC = Date.UTC(
    parseInt(map.year),
    parseInt(map.month) - 1,
    parseInt(map.day),
    parseInt(hourStr),
    parseInt(map.minute),
    parseInt(map.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

export function normalizeStTimestamp(
  value: any,
  fieldName: string
): { iso: string | null; warning?: string; wasSupplied: boolean } {
  if (!value) return { iso: null, wasSupplied: false };
  const str = String(value).trim();
  if (!str) return { iso: null, wasSupplied: false };

  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(str)) {
    return { iso: str, wasSupplied: true };
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return { iso: null, warning: `Invalid date in ${fieldName}: ${str}`, wasSupplied: true };
  }

  const offsetMinutes = getTimezoneOffsetMinutes(COMPANY_TIMEZONE, parsed);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  return { iso: `${str}${offsetStr}`, wasSupplied: true };
}

export function extractTimeFromIso(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function extractDateFromIso(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

// ─── Payload Extraction ──────────────────────────────────────────────────────

export function getString(payload: any, ...keys: string[]): string {
  for (const k of keys) {
    if (payload[k] != null && String(payload[k]).trim()) {
      return String(payload[k]).trim();
    }
  }
  return "";
}

export function getNumber(payload: any, ...keys: string[]): number | null {
  for (const k of keys) {
    if (payload[k] != null && !isNaN(Number(payload[k]))) {
      return Number(payload[k]);
    }
  }
  return null;
}

/**
 * Extract and normalize all ServiceTitan job fields from the webhook payload.
 */
export function extractJobData(payload: any, event: any) {
  const stJobId =
    getString(payload, "job_id", "servicetitan_job_id", "id") ||
    (event?.object_id ? String(event.object_id) : "");

  const stJobNumber = getString(payload, "job_number", "servicetitan_job_number", "crm_job_number");
  const stCustomerId = getString(payload, "customer_id", "servicetitan_customer_id");
  const stCustomerName = getString(payload, "customer_name", "servicetitan_customer_name");
  const stCustomerNumber = getString(payload, "customer_number");
  const stLocationId = getString(payload, "location_id", "servicetitan_location_id");
  const stLocationName = getString(payload, "location_name", "servicetitan_location_name");
  const stBusinessUnit = getString(payload, "business_unit", "business_unit_name", "servicetitan_business_unit");
  const stBusinessUnitId = getString(payload, "business_unit_id", "servicetitan_business_unit_id");
  const stJobType = getString(payload, "job_type", "servicetitan_job_type", "type");
  const stJobTypeId = getString(payload, "job_type_id", "servicetitan_job_type_id");
  const stCampaignId = getString(payload, "campaign_id", "servicetitan_campaign_id");
  const stProjectId = getString(payload, "project_id", "servicetitan_project_id");
  const stTenantId =
    getString(payload, "tenant_id", "servicetitan_tenant_id") ||
    (event?.tenant_id ? String(event.tenant_id) : "");
  const stRawStatus = getString(payload, "job_status", "status", "servicetitan_raw_status", "servicetitan_job_status").toLowerCase();
  const stSummary = getString(payload, "summary", "description", "job_summary");
  const address = getString(payload, "address", "service_address", "street");
  const city = getString(payload, "city");
  const state = getString(payload, "state");
  const zip = getString(payload, "zip", "zip_code", "postal_code");
  const latitude = getNumber(payload, "latitude", "lat");
  const longitude = getNumber(payload, "longitude", "lng", "long");
  const stEventAt = getString(payload, "event_timestamp", "timestamp", "created_at", "updated_at", "occurred_at");

  const scheduledStartNorm = normalizeStTimestamp(
    payload.scheduled_start || payload.start_time || payload.start || payload.appointment_start,
    "scheduled_start"
  );
  const scheduledEndNorm = normalizeStTimestamp(
    payload.scheduled_end || payload.end_time || payload.end || payload.appointment_end,
    "scheduled_end"
  );
  const arrivalStartNorm = normalizeStTimestamp(
    payload.arrival_window_start || payload.arrival_start,
    "arrival_window_start"
  );
  const arrivalEndNorm = normalizeStTimestamp(
    payload.arrival_window_end || payload.arrival_end,
    "arrival_window_end"
  );
  const completedAtNorm = normalizeStTimestamp(payload.completed_at || payload.completion_date, "completed_at");
  const canceledAtNorm = normalizeStTimestamp(payload.canceled_at || payload.cancellation_date || payload.cancelled_at, "canceled_at");

  // Technicians
  const rawTechnicians: any[] = [];
  if (Array.isArray(payload.technicians)) {
    rawTechnicians.push(...payload.technicians);
  } else if (Array.isArray(payload.assigned_technicians)) {
    rawTechnicians.push(...payload.assigned_technicians);
  } else if (payload.technician && typeof payload.technician === "object") {
    rawTechnicians.push(payload.technician);
  }

  const stTechnicianIds: string[] = [];
  const stTechnicianNames: string[] = [];
  const stTechnicianEmails: string[] = [];
  const stEmployeeIds: string[] = [];

  for (const tech of rawTechnicians) {
    const tid = getString(tech, "technician_id", "id", "servicetitan_technician_id");
    const eid = getString(tech, "employee_id", "servicetitan_employee_id");
    const tname = getString(tech, "name", "technician_name", "full_name");
    const temail = getString(tech, "email", "technician_email");
    if (tid) stTechnicianIds.push(tid);
    if (eid && eid !== tid) stEmployeeIds.push(eid);
    if (tname) stTechnicianNames.push(tname);
    if (temail) stTechnicianEmails.push(temail);
  }

  if (stTechnicianIds.length === 0) {
    const tid = getString(payload, "technician_id", "servicetitan_technician_id", "tech_id");
    if (tid) stTechnicianIds.push(tid);
  }
  if (stTechnicianNames.length === 0) {
    const tname = getString(payload, "technician_name", "servicetitan_technician_name", "tech_name");
    if (tname) stTechnicianNames.push(tname);
  }
  if (stTechnicianEmails.length === 0) {
    const temail = getString(payload, "technician_email", "tech_email");
    if (temail) stTechnicianEmails.push(temail);
  }

  const warnings = [
    scheduledStartNorm.warning, scheduledEndNorm.warning,
    arrivalStartNorm.warning, arrivalEndNorm.warning,
    completedAtNorm.warning, canceledAtNorm.warning,
  ].filter(Boolean) as string[];

  return {
    servicetitan_job_id: stJobId,
    servicetitan_job_number: stJobNumber,
    servicetitan_customer_id: stCustomerId,
    servicetitan_customer_name: stCustomerName,
    customer_number: stCustomerNumber,
    servicetitan_location_id: stLocationId,
    servicetitan_location_name: stLocationName,
    servicetitan_business_unit: stBusinessUnit,
    servicetitan_business_unit_id: stBusinessUnitId,
    servicetitan_job_type: stJobType,
    servicetitan_job_type_id: stJobTypeId,
    servicetitan_campaign_id: stCampaignId,
    servicetitan_project_id: stProjectId,
    servicetitan_tenant_id: stTenantId,
    servicetitan_raw_status: stRawStatus,
    servicetitan_summary: stSummary,
    address, city, state, zip,
    servicetitan_latitude: latitude,
    servicetitan_longitude: longitude,
    servicetitan_last_event_at: stEventAt || null,
    scheduled_start: scheduledStartNorm.iso,
    scheduled_end: scheduledEndNorm.iso,
    servicetitan_arrival_window_start: arrivalStartNorm.iso,
    servicetitan_arrival_window_end: arrivalEndNorm.iso,
    completed_at_from_payload: completedAtNorm.iso,
    canceled_at_from_payload: canceledAtNorm.iso,
    servicetitan_technician_ids: stTechnicianIds,
    servicetitan_technician_names: stTechnicianNames,
    servicetitan_technician_emails: stTechnicianEmails,
    servicetitan_employee_ids: stEmployeeIds,
    warnings,
  };
}

// ─── Event Ordering Protection ───────────────────────────────────────────────

export function isStaleEvent(existing: any, incomingEventAt: string | null): boolean {
  if (!incomingEventAt) return false;
  const existingEventAt = existing?.servicetitan_last_event_at;
  if (!existingEventAt) return false;
  const incomingTime = new Date(incomingEventAt).getTime();
  const existingTime = new Date(existingEventAt).getTime();
  if (isNaN(incomingTime) || isNaN(existingTime)) return false;
  return incomingTime < existingTime;
}

// ─── Find Local Job ──────────────────────────────────────────────────────────

export async function findLocalJob(base44: any, stJobId: string): Promise<any | null> {
  if (!stJobId) return null;
  try {
    const results = await base44.asServiceRole.entities.Job.filter(
      { servicetitan_job_id: stJobId },
      "-servicetitan_last_sync_at",
      1
    );
    if (results.length > 0) return results[0];
    const legacy = await base44.asServiceRole.entities.Job.filter(
      { crm_job_number: stJobId },
      null,
      1
    );
    return legacy.length > 0 ? legacy[0] : null;
  } catch (err) {
    console.error("[ST JOB SYNC] findLocalJob failed:", err);
    throw err;
  }
}

// ─── Customer Resolution ──────────────────────────────────────────────────────

export async function resolveCustomer(
  base44: any,
  stCustomerId: string,
  customerName: string,
  webhookEventId?: string,
  stJobId?: string,
  payloadSnapshot?: any,
  testSkipHydration?: boolean
): Promise<CustomerResolution> {
  if (!stCustomerId) {
    return {
      status: "unmatched",
      warning: "No servicetitan_customer_id supplied in job payload",
    };
  }

  try {
    const customers = await base44.asServiceRole.entities.Customer.filter(
      { servicetitan_customer_id: stCustomerId },
      "-servicetitan_last_sync",
      1
    );

    if (customers.length > 0) {
      const cust = customers[0];
      if (cust.servicetitan_deleted) {
        return {
          status: "unmatched",
          customerId: cust.id,
          customerName: cust.name || customerName,
          customerNumber: cust.customer_number || "",
          warning: `Customer '${stCustomerId}' is soft-deleted in the local system`,
        };
      }
      return {
        status: "matched",
        customerId: cust.id,
        customerName: cust.name || customerName,
        customerNumber: cust.customer_number || "",
      };
    }
  } catch (err) {
    console.error("[ST JOB SYNC] resolveCustomer lookup failed:", err);
  }

  // ── Customer not found locally — attempt on-demand hydration ──
  // This prevents orphaned jobs. If hydration fails, the job is deferred
  // via a DeferredDependentRecord and NOT created.
  //
  // Test harness: when testSkipHydration is true, skip the ST API call
  // and immediately defer the customer. This allows the validation
  // harness to test the real deferral path without making API calls.
  if (testSkipHydration) {
    return {
      status: "deferred",
      warning: `Customer '${stCustomerId}' not found locally — hydration skipped (test mode)`,
    };
  }

  try {
    const tenantId = getTenantId();
    const environment = getEnvironment();
    const hydrationResult = await ensureCustomerForDependentRecord(
      base44,
      stCustomerId,
      tenantId,
      environment,
      "job",
      stJobId || stCustomerId,
      webhookEventId,
      payloadSnapshot
    );

    if (hydrationResult.status === "hydrated" || hydrationResult.status === "matched") {
      return {
        status: "matched",
        customerId: hydrationResult.localCustomerId,
        customerName: customerName,
        warning: hydrationResult.warning,
      };
    }

    if (hydrationResult.status === "deferred") {
      return {
        status: "deferred",
        warning: hydrationResult.warning || `Customer '${stCustomerId}' hydration failed — job deferred`,
        deferredRecordId: hydrationResult.deferredRecordId,
      };
    }

    return {
      status: "unmatched",
      warning: hydrationResult.warning || `Customer '${stCustomerId}' could not be resolved`,
    };
  } catch (err: any) {
    console.error("[ST JOB SYNC] resolveCustomer hydration failed:", err.message);
    return {
      status: "unmatched",
      warning: `Customer hydration error: ${err.message}`,
    };
  }
}

// ─── Technician Mapping ──────────────────────────────────────────────────────

export async function mapTechnician(
  base44: any,
  stTechnicianId: string,
  stTechnicianName: string,
  stTechnicianEmail: string,
  stEmployeeId?: string
): Promise<TechMapping> {
  if (!stTechnicianId && !stEmployeeId && !stTechnicianEmail && !stTechnicianName) {
    return { status: "unassigned" };
  }

  // 1. Primary: ServiceTitan technician ID
  if (stTechnicianId) {
    try {
      const byTechId = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { servicetitan_technician_id: stTechnicianId, employment_status: "Active" },
        null, 1
      );
      if (byTechId.length > 0) {
        const emp = byTechId[0];
        return {
          status: "matched",
          employeeRegistryId: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
          employeeEmail: emp.email || "",
          stTechnicianId, stTechnicianName,
        };
      }
    } catch (err) {
      console.error("[ST JOB SYNC] EmployeeRegistry lookup by technician_id failed:", err);
    }
  }

  // 2. Secondary: ServiceTitan employee ID
  if (stEmployeeId) {
    try {
      const byEmpId = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { servicetitan_employee_id: stEmployeeId, employment_status: "Active" },
        null, 1
      );
      if (byEmpId.length > 0) {
        const emp = byEmpId[0];
        return {
          status: "matched",
          employeeRegistryId: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
          employeeEmail: emp.email || "",
          stTechnicianId, stTechnicianName,
          warning: `Technician matched by ServiceTitan employee ID '${stEmployeeId}' (technician ID '${stTechnicianId || "N/A"}' not found in EmployeeRegistry).`,
        };
      }
    } catch (err) {
      console.error("[ST JOB SYNC] EmployeeRegistry lookup by employee_id failed:", err);
    }
  }

  // 3. Fallback: email
  if (stTechnicianEmail) {
    try {
      const byEmail = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { email: stTechnicianEmail, employment_status: "Active" },
        null, 1
      );
      if (byEmail.length > 0) {
        const emp = byEmail[0];
        return {
          status: "matched",
          employeeRegistryId: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
          employeeEmail: emp.email || "",
          stTechnicianId, stTechnicianName,
          warning: `Technician matched by email, not by ServiceTitan technician ID '${stTechnicianId || "N/A"}'.`,
        };
      }
    } catch (err) {
      console.error("[ST JOB SYNC] EmployeeRegistry lookup by email failed:", err);
    }
  }

  // 4. Last resort: name match
  if (stTechnicianName) {
    try {
      const nameParts = stTechnicianName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const byName = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { first_name: nameParts[0], last_name: nameParts.slice(1).join(" "), employment_status: "Active" },
          null, 1
        );
        if (byName.length > 0) {
          const emp = byName[0];
          return {
            status: "matched",
            employeeRegistryId: emp.id,
            employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
            employeeEmail: emp.email || "",
            stTechnicianId, stTechnicianName,
            warning: `Technician matched by name only (fallback). ServiceTitan technician ID '${stTechnicianId || "N/A"}' not found in EmployeeRegistry. Please update the employee's ServiceTitan Technician ID.`,
          };
        }
      }
    } catch (err) {
      console.error("[ST JOB SYNC] EmployeeRegistry lookup by name failed:", err);
    }
  }

  return {
    status: "unmatched",
    stTechnicianId, stTechnicianName,
    warning: `No EmployeeRegistry record found for ServiceTitan technician '${stTechnicianId || stEmployeeId || stTechnicianName || "N/A"}'.`,
  };
}

export async function mapAllTechnicians(
  base44: any,
  extracted: ReturnType<typeof extractJobData>
): Promise<{ mappings: TechMapping[]; aggregateStatus: "matched" | "unmatched" | "unassigned"; warnings: string[] }> {
  const ids = extracted.servicetitan_technician_ids;
  const names = extracted.servicetitan_technician_names;
  const emails = extracted.servicetitan_technician_emails;
  const empIds = extracted.servicetitan_employee_ids;
  const count = Math.max(ids.length, names.length, emails.length);

  if (count === 0) {
    return { mappings: [], aggregateStatus: "unassigned", warnings: [] };
  }

  const mappings: TechMapping[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < count; i++) {
    const mapping = await mapTechnician(base44, ids[i] || "", names[i] || "", emails[i] || "", empIds[i] || "");
    mappings.push(mapping);
    if (mapping.warning) warnings.push(mapping.warning);
  }

  const anyMatched = mappings.some((m) => m.status === "matched");
  return { mappings, aggregateStatus: anyMatched ? "matched" : "unmatched", warnings };
}

// ─── Appointment Resolution ──────────────────────────────────────────────────

export async function resolveAppointments(
  base44: any,
  stJobId: string
): Promise<{ appointmentIds: string[]; count: number }> {
  if (!stJobId) return { appointmentIds: [], count: 0 };
  try {
    const appts = await base44.asServiceRole.entities.Appointment.filter(
      { servicetitan_job_id: stJobId },
      null, 100
    );
    return {
      appointmentIds: appts.map((a: any) => a.servicetitan_appointment_id || a.crm_appointment_id || "").filter(Boolean),
      count: appts.length,
    };
  } catch (err) {
    console.error("[ST JOB SYNC] resolveAppointments failed:", err);
    return { appointmentIds: [], count: 0 };
  }
}

// ─── Status Mapping ──────────────────────────────────────────────────────────

export function mapStatus(stRawStatus: string): string {
  return ST_TO_LVC_STATUS_MAP[stRawStatus?.toLowerCase()] ?? "";
}

export function shouldApplyLvcStatus(currentStatus: string, mappedStatus: string): boolean {
  if (!mappedStatus) return false;
  if (mappedStatus === "cancelled") return true;
  if (mappedStatus === "completed") return true;
  const currentIdx = LVC_STATUS_ORDER.indexOf(currentStatus);
  const mappedIdx = LVC_STATUS_ORDER.indexOf(mappedStatus);
  if (currentIdx === -1) return true;
  if (mappedIdx === -1) return false;
  return mappedIdx > currentIdx;
}

export function mapJobType(stJobType: string): string {
  return ST_TO_LVC_JOB_TYPE_MAP[stJobType?.toLowerCase().trim()] ?? "";
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

export function detectChangedFields(
  current: any,
  incoming: Record<string, any>,
  fieldList: string[]
): string[] {
  const changed: string[] = [];
  for (const field of fieldList) {
    if (!(field in incoming)) continue;
    const currentVal = current[field] ?? null;
    const newVal = incoming[field] ?? null;
    const currentStr = Array.isArray(currentVal) ? JSON.stringify(currentVal) : (currentVal === null ? "" : String(currentVal));
    const newValStr = Array.isArray(newVal) ? JSON.stringify(newVal) : (newVal === null ? "" : String(newVal));
    if (currentStr !== newValStr) {
      changed.push(field);
    }
  }
  return changed;
}

export function appendConflictHistory(
  current: any,
  incoming: Record<string, any>,
  changedFields: string[],
  event: any
): string | null {
  if (changedFields.length === 0) return current.sync_conflict_history_json || null;

  let history: any[] = [];
  try {
    history = current.sync_conflict_history_json ? JSON.parse(current.sync_conflict_history_json) : [];
  } catch {
    history = [];
  }

  const syncedAt = new Date().toISOString();
  for (const field of changedFields) {
    const prev = current[field];
    if (prev === null || prev === undefined) continue;
    const prevStr = Array.isArray(prev) ? JSON.stringify(prev) : String(prev);
    if (prevStr.trim() === "") continue;
    const newVal = incoming[field];
    const newValStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? "");
    history.push({
      webhook_event_id: event?.id || "",
      event_type: event?.event_type || "",
      field,
      previous_value: prevStr,
      new_value: newValStr,
      synced_at: syncedAt,
    });
  }

  return history.length > 0 ? JSON.stringify(history) : null;
}

// ─── Build Sync Update Data ──────────────────────────────────────────────────

export function buildSyncUpdateData(
  extracted: ReturnType<typeof extractJobData>,
  customerRes: CustomerResolution,
  techResult: { mappings: TechMapping[]; aggregateStatus: "matched" | "unmatched" | "unassigned"; warnings: string[] },
  apptResult: { appointmentIds: string[]; count: number },
  eventType: string,
  isCreate: boolean
): Record<string, any> {
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    servicetitan_job_id: extracted.servicetitan_job_id,
    servicetitan_job_number: extracted.servicetitan_job_number,
    crm_job_number: extracted.servicetitan_job_number,
    servicetitan_customer_id: extracted.servicetitan_customer_id,
    servicetitan_location_id: extracted.servicetitan_location_id,
    servicetitan_location_name: extracted.servicetitan_location_name,
    servicetitan_business_unit: extracted.servicetitan_business_unit,
    servicetitan_business_unit_id: extracted.servicetitan_business_unit_id,
    servicetitan_job_type: extracted.servicetitan_job_type,
    servicetitan_job_type_id: extracted.servicetitan_job_type_id,
    servicetitan_campaign_id: extracted.servicetitan_campaign_id,
    servicetitan_project_id: extracted.servicetitan_project_id,
    servicetitan_tenant_id: extracted.servicetitan_tenant_id,
    servicetitan_raw_status: extracted.servicetitan_raw_status,
    servicetitan_summary: extracted.servicetitan_summary,
    servicetitan_latitude: extracted.servicetitan_latitude,
    servicetitan_longitude: extracted.servicetitan_longitude,
    servicetitan_arrival_window_start: extracted.servicetitan_arrival_window_start,
    servicetitan_arrival_window_end: extracted.servicetitan_arrival_window_end,
    servicetitan_technician_ids: extracted.servicetitan_technician_ids,
    servicetitan_technician_names: extracted.servicetitan_technician_names,
    servicetitan_appointment_ids: apptResult.appointmentIds,
    servicetitan_last_sync_at: now,
    servicetitan_last_event_type: eventType,
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
    servicetitan_source: "webhook",
    servicetitan_sync_status: "synced",
    address: extracted.address,
    city: extracted.city,
    state: extracted.state,
    zip: extracted.zip,
    customer_mapping_status: customerRes.status,
    customer_mapping_warning: customerRes.warning || "",
    technician_mapping_status: techResult.aggregateStatus,
    technician_mapping_warning: techResult.warnings.join("; ") || "",
  };

  // Customer relationship
  if (customerRes.status === "matched" && customerRes.customerId) {
    update.customer_id = customerRes.customerId;
    update.customer_name = customerRes.customerName || extracted.servicetitan_customer_name || "";
    update.customer_number = customerRes.customerNumber || "";
  } else if (isCreate) {
    update.customer_id = customerRes.customerId || `pending:${extracted.servicetitan_customer_id}`;
    update.customer_name = extracted.servicetitan_customer_name || `ST Customer ${extracted.servicetitan_customer_id}`;
  }

  // Map job type
  const mappedJobType = mapJobType(extracted.servicetitan_job_type);
  if (mappedJobType) update.job_type = mappedJobType;

  // Scheduled dates
  if (extracted.scheduled_start) {
    update.service_date = extractDateFromIso(extracted.scheduled_start);
    update.appointment_date = extractDateFromIso(extracted.scheduled_start);
  }
  if (extracted.servicetitan_arrival_window_start) {
    update.arrival_window_start = extractTimeFromIso(extracted.servicetitan_arrival_window_start);
  }
  if (extracted.servicetitan_arrival_window_end) {
    update.arrival_window_end = extractTimeFromIso(extracted.servicetitan_arrival_window_end);
  }

  // Technician assignments
  const matchedTechs = techResult.mappings.filter((m) => m.status === "matched");
  const allTechEmails: string[] = [];
  const allTechNames: string[] = [];

  for (const mapping of techResult.mappings) {
    if (mapping.status === "matched") {
      if (mapping.employeeEmail) allTechEmails.push(mapping.employeeEmail);
      if (mapping.employeeName) allTechNames.push(mapping.employeeName);
    } else if (mapping.status === "unmatched") {
      if (mapping.stTechnicianName) allTechNames.push(mapping.stTechnicianName);
    }
  }

  if (allTechEmails.length > 0) {
    update.technician_emails = allTechEmails;
    update.technician_email = allTechEmails[0];
    update.lead_technician_email = allTechEmails[0];
    update.lead_technician_name = allTechNames[0] || "";
    update.technician_name = allTechNames.join(", ");
    update.dispatch_status = "assigned";
  } else if (techResult.mappings.length > 0) {
    update.technician_name = extracted.servicetitan_technician_names.join(", ");
    update.dispatch_status = "assigned";
  }

  return update;
}

// ─── Helper: Apply LVC Status Safely ─────────────────────────────────────────

export function applyLvcStatus(
  updateData: Record<string, any>,
  currentStatus: string | undefined,
  stRawStatus: string
): boolean {
  const mapped = mapStatus(stRawStatus);
  if (!mapped) return false;
  if (!shouldApplyLvcStatus(currentStatus || "scheduled", mapped)) return false;
  updateData.status = mapped;
  return true;
}

// ─── Helper: Filter Empty Values ─────────────────────────────────────────────

export function filterEmptyValues(updateData: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  const alwaysInclude = new Set([
    "servicetitan_last_sync_at",
    "servicetitan_last_event_type",
    "servicetitan_last_event_at",
    "servicetitan_source",
    "servicetitan_sync_status",
    "servicetitan_sync_version",
    "customer_mapping_status",
    "customer_mapping_warning",
    "technician_mapping_status",
    "technician_mapping_warning",
    "servicetitan_raw_status",
    "servicetitan_technician_ids",
    "servicetitan_technician_names",
    "servicetitan_appointment_ids",
  ]);

  for (const [key, value] of Object.entries(updateData)) {
    if (alwaysInclude.has(key)) {
      result[key] = value;
      continue;
    }
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        if (value.length > 0) result[key] = value;
      } else if (typeof value === "number") {
        result[key] = value;
      } else if (String(value).trim() !== "") {
        result[key] = value;
      }
    }
  }
  return result;
}