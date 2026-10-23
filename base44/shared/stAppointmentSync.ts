/**
 * ServiceTitan Appointment Synchronization Service
 *
 * Shared backend module that creates, updates, cancels, completes, and
 * reassigns local Appointment records from ServiceTitan webhook events.
 *
 * Called by the thin appointment and technician handlers — never contains
 * routing logic itself.
 *
 * Synchronization Key:
 *   servicetitan_appointment_id is the PRIMARY key. Never matches by
 *   customer name, job number, date, or technician alone.
 *
 * Idempotency:
 *   Every function searches first by servicetitan_appointment_id.
 *   Replaying the same webhook produces no duplicate and returns "unchanged"
 *   when no fields differ.
 *
 * Event Ordering Protection:
 *   servicetitan_last_event_at stores the timestamp of the last ServiceTitan
 *   event that updated this appointment. An older event never overwrites
 *   newer ServiceTitan-controlled state; it returns sync_action="stale_ignored".
 *
 * Conflict Ownership:
 *   ServiceTitan-controlled fields (start, end, status, technician, customer,
 *   address, arrival window) are overwritten on update. When a locally modified
 *   value is overwritten, the previous value is recorded in
 *   sync_conflict_history_json.
 *   LVC-controlled fields (notes, truck, crew, production) are never touched.
 *
 * Date Validation Rules:
 *   - An invalid supplied date (present but unparseable) is ALWAYS rejected,
 *     regardless of event type. The appointment is not created/updated.
 *   - appointment_created and appointment_rescheduled REQUIRE a valid
 *     scheduled_start. A missing start date is rejected.
 *   - appointment_updated rejects an invalid supplied date but allows a
 *     missing start date (only supplied fields are updated).
 *   - appointment_canceled, appointment_completed, technician_assigned,
 *     technician_unassigned do NOT require scheduling dates. A missing or
 *     omitted start date is acceptable.
 *
 * Technician Mapping States:
 *   matched   = ServiceTitan technician mapped to EmployeeRegistry
 *   unmatched = ServiceTitan supplied a technician, but no EmployeeRegistry match
 *   unassigned = ServiceTitan supplied no technician or explicitly removed it
 *
 * Technician Mapping Priority:
 *   1. servicetitan_technician_id (primary key, no warning)
 *   2. servicetitan_employee_id (fallback, identified with a note)
 *   3. email (fallback, warning)
 *   4. name (last resort, stronger warning)
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import { ensureCustomerForDependentRecord } from "./stCustomerHydration.ts";
import { findLocalCustomer } from "./stCustomerMapping.ts";
import { getTenantId, getEnvironment } from "./stAuth.ts";
import {
  upsertAssignment,
  removeAssignment,
  projectLeadTechnician,
  type AssignmentResult,
} from "./stage2d/appointmentTechnicianAssignmentService.ts";

const COMPANY_TIMEZONE = "America/New_York";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncContext {
  base44: any;
  payload: any;
  event: any;
  action: string;
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

interface TechMapping {
  status: "matched" | "unmatched" | "unassigned";
  employeeRegistryId?: string;
  employeeName?: string;
  employeeEmail?: string;
  warning?: string;
}

// ─── Fields controlled by ServiceTitan (may overwrite local edits with audit) ─
const ST_CONTROLLED_FIELDS = [
  "scheduled_start",
  "scheduled_end",
  "status",
  "dispatch_status",
  "technician_id",
  "technician_name",
  "technician_email",
  "customer_id",
  "customer_name",
  "address",
  "city",
  "state",
  "zip",
  "appointment_type",
  "servicetitan_arrival_window_start",
  "servicetitan_arrival_window_end",
  "servicetitan_business_unit",
  "servicetitan_job_type",
  "servicetitan_customer_id",
  "servicetitan_customer_name",
  "servicetitan_customer_phone",
  "servicetitan_technician_id",
  "servicetitan_technician_name",
  "servicetitan_job_id",
  "servicetitan_job_number",
  "servicetitan_tenant_id",
  "servicetitan_notes",
];

// ─── Events that require valid scheduling dates ──────────────────────────────
const SCHEDULING_ACTIONS = new Set(["created", "rescheduled"]);

// ─── Time Zone Helpers ───────────────────────────────────────────────────────

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

/**
 * Normalize a ServiceTitan timestamp to an ISO 8601 string with an explicit
 * offset. If the timestamp already has an offset or Z, it is used as-is.
 * If it is naive (no offset), it is interpreted in the company timezone
 * (America/New_York) and the correct offset is appended.
 */
function normalizeStTimestamp(
  value: any,
  fieldName: string
): { iso: string | null; warning?: string; wasSupplied: boolean } {
  if (!value) return { iso: null, wasSupplied: false };
  const str = String(value).trim();
  if (!str) return { iso: null, wasSupplied: false };

  // Already has explicit offset (Z, +HH:MM, or +HHMM)
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(str)) {
    return { iso: str, wasSupplied: true };
  }

  // Parse to get a valid Date for offset calculation
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return { iso: null, warning: `Invalid date in ${fieldName}: ${str}`, wasSupplied: true };
  }

  // Compute the timezone offset for this date
  const offsetMinutes = getTimezoneOffsetMinutes(COMPANY_TIMEZONE, parsed);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  return { iso: `${str}${offsetStr}`, wasSupplied: true };
}

// ─── Payload Extraction ──────────────────────────────────────────────────────

function getString(payload: any, ...keys: string[]): string {
  for (const k of keys) {
    if (payload[k] != null && String(payload[k]).trim()) {
      return String(payload[k]).trim();
    }
  }
  return "";
}

/**
 * Extract and normalize all ServiceTitan appointment fields from the webhook
 * payload. Handles common field name variations.
 */
function extractAppointmentData(payload: any, event: any) {
  const stAppointmentId =
    getString(payload, "appointment_id", "servicetitan_appointment_id", "crm_appointment_id") ||
    (event?.object_id ? String(event.object_id) : "");

  const stJobId = getString(payload, "job_id", "servicetitan_job_id");
  const stJobNumber = getString(
    payload,
    "job_number",
    "servicetitan_job_number",
    "crm_job_number"
  );
  const stCustomerId = getString(
    payload,
    "customer_id",
    "servicetitan_customer_id"
  );
  const stCustomerName = getString(
    payload,
    "customer_name",
    "servicetitan_customer_name"
  );
  const stCustomerPhone = getString(
    payload,
    "customer_phone",
    "phone",
    "servicetitan_customer_phone"
  );
  const stTechnicianId = getString(
    payload,
    "technician_id",
    "servicetitan_technician_id",
    "tech_id"
  );
  const stEmployeeId = getString(
    payload,
    "employee_id",
    "servicetitan_employee_id"
  );
  const stTechnicianName = getString(
    payload,
    "technician_name",
    "servicetitan_technician_name",
    "tech_name"
  );
  const stTechnicianEmail = getString(
    payload,
    "technician_email",
    "tech_email"
  );
  const stTenantId =
    getString(payload, "tenant_id", "servicetitan_tenant_id") ||
    (event?.tenant_id ? String(event.tenant_id) : "");
  const stBusinessUnit = getString(
    payload,
    "business_unit",
    "servicetitan_business_unit"
  );
  const stJobType = getString(
    payload,
    "job_type",
    "servicetitan_job_type",
    "appointment_type"
  );
  const stAddress = getString(payload, "address", "service_address");
  const stCity = getString(payload, "city");
  const stState = getString(payload, "state");
  const stZip = getString(payload, "zip", "zip_code", "postal_code");
  const stNotes = getString(payload, "notes", "special_instructions");
  const stEventAt = getString(payload, "event_timestamp", "timestamp", "created_at", "occurred_at");

  // Local relationship IDs (resolved by the inbound subscriber via
  // appointmentRelationshipResolver before calling the sync function).
  // These are NOT present in raw ServiceTitan webhooks — they are injected
  // by the Stage 2D inbound subscriber after resolving the local Job and Customer.
  const localJobId = getString(payload, "_resolved_job_id");
  const localCustomerId = getString(payload, "_resolved_customer_id");

  const startNorm = normalizeStTimestamp(
    payload.start_time || payload.start || payload.scheduled_start || payload.appointment_start,
    "start_time"
  );
  const endNorm = normalizeStTimestamp(
    payload.end_time || payload.end || payload.scheduled_end || payload.appointment_end,
    "end_time"
  );
  const arrivalStartNorm = normalizeStTimestamp(
    payload.arrival_window_start || payload.arrival_start,
    "arrival_window_start"
  );
  const arrivalEndNorm = normalizeStTimestamp(
    payload.arrival_window_end || payload.arrival_end,
    "arrival_window_end"
  );

  return {
    servicetitan_appointment_id: stAppointmentId,
    servicetitan_job_id: stJobId,
    servicetitan_job_number: stJobNumber,
    servicetitan_customer_id: stCustomerId,
    servicetitan_customer_name: stCustomerName,
    servicetitan_customer_phone: stCustomerPhone,
    servicetitan_technician_id: stTechnicianId,
    servicetitan_employee_id: stEmployeeId,
    servicetitan_technician_name: stTechnicianName,
    servicetitan_technician_email: stTechnicianEmail,
    servicetitan_tenant_id: stTenantId,
    servicetitan_business_unit: stBusinessUnit,
    servicetitan_job_type: stJobType,
    servicetitan_arrival_window_start: arrivalStartNorm.iso,
    servicetitan_arrival_window_end: arrivalEndNorm.iso,
    servicetitan_notes: stNotes,
    servicetitan_last_event_at: stEventAt || null,
    scheduled_start: startNorm.iso,
    scheduled_end: endNorm.iso,
    start_was_supplied: startNorm.wasSupplied,
    end_was_supplied: endNorm.wasSupplied,
    warnings: [startNorm.warning, endNorm.warning, arrivalStartNorm.warning, arrivalEndNorm.warning].filter(
      Boolean
    ) as string[],
    crm_appointment_id: stAppointmentId,
    crm_job_number: stJobNumber,
    job_id: localJobId,
    customer_id: localCustomerId,
    customer_name: stCustomerName,
    address: stAddress,
    city: stCity,
    state: stState,
    zip: stZip,
    technician_name: stTechnicianName,
    technician_email: stTechnicianEmail,
    appointment_type: stJobType,
  };
}

// ─── Date Validation ─────────────────────────────────────────────────────────

/**
 * Validate scheduling dates for events that require scheduling data.
 *
 * Rules:
 * - If a date IS supplied but is invalid → always reject (any event type)
 * - If scheduled_start is missing for "created" or "rescheduled" → reject
 * - Missing dates for other events (canceled, completed, assigned, unassigned) → OK
 */
function validateSchedulingDates(
  extracted: ReturnType<typeof extractAppointmentData>,
  action: string
): { error: string } | null {
  // Check for invalid supplied dates (warnings from normalizeStTimestamp)
  const hasInvalidDate = extracted.warnings.some((w) => w.includes("Invalid date"));
  if (hasInvalidDate) {
    const startInvalid = extracted.warnings.some(
      (w) => w.includes("start_time") || w.includes("scheduled_start")
    );
    if (startInvalid) return { error: "Invalid scheduled_start" };
    const endInvalid = extracted.warnings.some(
      (w) => w.includes("end_time") || w.includes("scheduled_end")
    );
    if (endInvalid) return { error: "Invalid scheduled_end" };
    const arrivalInvalid = extracted.warnings.some((w) => w.includes("arrival_window"));
    if (arrivalInvalid) return { error: "Invalid arrival_window" };
    return { error: "Invalid date in appointment payload" };
  }

  // Check for missing required scheduling dates
  if (SCHEDULING_ACTIONS.has(action) && !extracted.scheduled_start) {
    return { error: "Invalid scheduled_start" };
  }

  return null;
}

// ─── Event Ordering Protection ───────────────────────────────────────────────

/**
 * Check if an incoming webhook event is stale (older than the last
 * ServiceTitan event that updated this appointment).
 *
 * Uses servicetitan_last_event_at from both the existing record and
 * the incoming payload. If the incoming event is older, it should not
 * overwrite newer ServiceTitan-controlled state.
 *
 * @returns true if the event is stale and should be ignored
 */
function isStaleEvent(existing: any, incomingEventAt: string | null): boolean {
  if (!incomingEventAt) return false;
  const existingEventAt = existing?.servicetitan_last_event_at;
  if (!existingEventAt) return false;

  const incomingTime = new Date(incomingEventAt).getTime();
  const existingTime = new Date(existingEventAt).getTime();

  if (isNaN(incomingTime) || isNaN(existingTime)) return false;

  return incomingTime < existingTime;
}

// ─── Technician Mapping ─────────────────────────────────────────────────────

/**
 * Map a ServiceTitan technician to the local EmployeeRegistry.
 *
 * An Employee can be automatically resolved ONLY through a verified
 * ServiceTitan identifier:
 *
 *   1. servicetitan_technician_id (primary verified identifier)
 *   2. servicetitan_employee_id (secondary verified identifier)
 *
 * Email and first-and-last-name matching NEVER automatically resolve or
 * assign an Employee. They may produce unverified candidate suggestions
 * for administrative review, but these are NEVER written into canonical
 * appointment technician fields (technician_id, technician_name,
 * technician_email).
 *
 * When only email or name produces a possible match, the function returns
 * status "unmatched" with a warning explaining that a verified ServiceTitan
 * identifier must be added to the EmployeeRegistry record.
 *
 * No Employee record is ever created.
 */
async function mapTechnician(
  base44: any,
  stTechnicianId: string,
  stTechnicianName: string,
  stTechnicianEmail: string,
  stEmployeeId?: string
): Promise<TechMapping> {
  if (!stTechnicianId && !stEmployeeId && !stTechnicianEmail && !stTechnicianName) {
    return { status: "unassigned" };
  }

  // 1. Primary: ServiceTitan technician ID (verified identifier)
  if (stTechnicianId) {
    try {
      const byTechId = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { servicetitan_technician_id: stTechnicianId, employment_status: "Active" },
        null,
        1
      );
      if (byTechId.length > 0) {
        const emp = byTechId[0];
        return {
          status: "matched",
          employeeRegistryId: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
          employeeEmail: emp.email || "",
        };
      }
    } catch (err) {
      console.error("[ST APPT SYNC] EmployeeRegistry lookup by technician_id failed:", err);
    }
  }

  // 2. Secondary: ServiceTitan employee ID (verified identifier)
  if (stEmployeeId) {
    try {
      const byEmpId = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { servicetitan_employee_id: stEmployeeId, employment_status: "Active" },
        null,
        1
      );
      if (byEmpId.length > 0) {
        const emp = byEmpId[0];
        return {
          status: "matched",
          employeeRegistryId: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
          employeeEmail: emp.email || "",
          warning: `Technician matched by ServiceTitan employee ID '${stEmployeeId}' (technician ID '${stTechnicianId || "N/A"}' not found in EmployeeRegistry).`,
        };
      }
    } catch (err) {
      console.error("[ST APPT SYNC] EmployeeRegistry lookup by employee_id failed:", err);
    }
  }

  // ── Unverified candidate lookup (for administrative review ONLY) ──
  // Email and name are NOT verified ServiceTitan identifiers. They may
  // produce candidate Employee suggestions for manual reconciliation, but
  // they must NEVER be used to automatically resolve or assign an Employee.
  // The canonical technician_id, technician_name, and technician_email
  // fields are NOT populated from these candidates.
  let candidateInfo: string | undefined;

  // Check for email candidate (suggestion only — never resolved)
  if (stTechnicianEmail) {
    try {
      const byEmail = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { email: stTechnicianEmail, employment_status: "Active" },
        null,
        5
      );
      if (byEmail.length > 0) {
        const names = byEmail.map(e => `${e.first_name} ${e.last_name} (ID: ${e.id})`).join(", ");
        candidateInfo = `Unverified email candidate(s): ${names}. A verified ServiceTitan technician ID or employee ID must be added to the EmployeeRegistry record before this technician can be resolved.`;
      }
    } catch (err) {
      console.error("[ST APPT SYNC] EmployeeRegistry lookup by email (candidate) failed:", err);
    }
  }

  // Check for name candidate (suggestion only — never resolved)
  if (stTechnicianName && !candidateInfo) {
    try {
      const nameParts = stTechnicianName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const byName = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { first_name: nameParts[0], last_name: nameParts.slice(1).join(" "), employment_status: "Active" },
          null,
          5
        );
        if (byName.length > 0) {
          const names = byName.map(e => `${e.first_name} ${e.last_name} (ID: ${e.id})`).join(", ");
          candidateInfo = `Unverified name candidate(s): ${names}. A verified ServiceTitan technician ID or employee ID must be added to the EmployeeRegistry record before this technician can be resolved.`;
        }
      }
    } catch (err) {
      console.error("[ST APPT SYNC] EmployeeRegistry lookup by name (candidate) failed:", err);
    }
  }

  // ── Return unresolved with warning ──
  // The external technician info (servicetitan_technician_id, name, email)
  // is preserved by buildSyncUpdateData for manual reconciliation.
  const baseWarning = `No EmployeeRegistry record found with a verified ServiceTitan identifier for technician '${stTechnicianId || stEmployeeId || stTechnicianName || "N/A"}'.`;
  const warning = candidateInfo ? `${baseWarning} ${candidateInfo}` : baseWarning;

  return {
    status: "unmatched",
    warning,
  };
}

// ─── Find Local Appointment ───────────────────────────────────────────────────

async function findLocalAppointment(
  base44: any,
  stAppointmentId: string
): Promise<any | null> {
  if (!stAppointmentId) return null;
  try {
    const results = await base44.asServiceRole.entities.Appointment.filter(
      { servicetitan_appointment_id: stAppointmentId },
      "-servicetitan_last_synced_at",
      1
    );
    if (results.length > 0) return results[0];

    const legacy = await base44.asServiceRole.entities.Appointment.filter(
      { crm_appointment_id: stAppointmentId },
      null,
      1
    );
    return legacy.length > 0 ? legacy[0] : null;
  } catch (err) {
    console.error("[ST APPT SYNC] findLocalAppointment failed:", err);
    throw err;
  }
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Detect which ST-controlled fields changed between the current record and
 * the incoming data.
 */
function detectChangedFields(
  current: any,
  incoming: Record<string, any>,
  fieldList: string[]
): string[] {
  const changed: string[] = [];
  for (const field of fieldList) {
    if (!(field in incoming)) continue;
    const currentVal = current[field] ?? null;
    const newVal = incoming[field] ?? null;

    const currentStr = currentVal === null ? "" : String(currentVal);
    const newValStr = newVal === null ? "" : String(newVal);

    if (currentStr !== newValStr) {
      changed.push(field);
    }
  }
  return changed;
}

/**
 * Append conflict records for overwritten local values.
 * Only records fields that had a non-empty local value that differs from the
 * incoming ServiceTitan value. Records both previous and new values for audit.
 *
 * No conflict record is created when:
 * - The value is unchanged
 * - The incoming field is omitted (not in changedFields)
 * - The incoming webhook is stale (caller must check before calling this)
 * - The existing value is empty
 */
function appendConflictHistory(
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
    if (prev === null || prev === undefined || String(prev).trim() === "") continue;
    const newVal = incoming[field];
    history.push({
      webhook_event_id: event?.id || "",
      event_type: event?.event_type || "",
      field,
      previous_value: String(prev),
      new_value: String(newVal ?? ""),
      synced_at: syncedAt,
    });
  }

  return history.length > 0 ? JSON.stringify(history) : null;
}

// ─── Build Update Data ────────────────────────────────────────────────────────

/**
 * Build the update payload from extracted data and technician mapping.
 * Only includes ST-controlled fields and sync metadata.
 */
function buildSyncUpdateData(
  extracted: ReturnType<typeof extractAppointmentData>,
  techMapping: TechMapping,
  eventType: string
): Record<string, any> {
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    servicetitan_appointment_id: extracted.servicetitan_appointment_id,
    servicetitan_job_id: extracted.servicetitan_job_id,
    servicetitan_job_number: extracted.servicetitan_job_number,
    servicetitan_customer_id: extracted.servicetitan_customer_id,
    servicetitan_customer_name: extracted.servicetitan_customer_name,
    servicetitan_customer_phone: extracted.servicetitan_customer_phone,
    servicetitan_technician_id: extracted.servicetitan_technician_id,
    servicetitan_technician_name: extracted.servicetitan_technician_name,
    servicetitan_tenant_id: extracted.servicetitan_tenant_id,
    servicetitan_business_unit: extracted.servicetitan_business_unit,
    servicetitan_job_type: extracted.servicetitan_job_type,
    servicetitan_arrival_window_start: extracted.servicetitan_arrival_window_start,
    servicetitan_arrival_window_end: extracted.servicetitan_arrival_window_end,
    servicetitan_notes: extracted.servicetitan_notes,
    servicetitan_last_synced_at: now,
    servicetitan_last_event_type: eventType,
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
    servicetitan_source: "webhook",
    appointment_source: "crm",
    crm_appointment_id: extracted.crm_appointment_id,
    crm_job_number: extracted.crm_job_number,
    customer_name: extracted.customer_name,
    address: extracted.address,
    city: extracted.city,
    state: extracted.state,
    zip: extracted.zip,
    technician_name: extracted.technician_name,
    technician_email: extracted.technician_email,
    appointment_type: extracted.appointment_type,
  };

  if (extracted.scheduled_start) update.scheduled_start = extracted.scheduled_start;
  if (extracted.scheduled_end) update.scheduled_end = extracted.scheduled_end;

  // Local relationship IDs (injected by the Stage 2D inbound subscriber
  // after resolving the local Job and Customer). Only set if present.
  if (extracted.job_id) update.job_id = extracted.job_id;
  if (extracted.customer_id) update.customer_id = extracted.customer_id;

  if (techMapping.status === "matched" && techMapping.employeeRegistryId) {
    update.technician_id = techMapping.employeeRegistryId;
    update.technician_name = techMapping.employeeName || extracted.technician_name;
    if (techMapping.employeeEmail) update.technician_email = techMapping.employeeEmail;
  } else if (techMapping.status === "unmatched") {
    update.technician_id = extracted.servicetitan_technician_id || "";
    update.technician_name = extracted.servicetitan_technician_name;
    update.technician_email = extracted.servicetitan_technician_email;
  }
  update.technician_mapping_status = techMapping.status;
  update.technician_mapping_warning = techMapping.warning || "";

  return update;
}

// ─── Public Sync Functions ────────────────────────────────────────────────────

/**
 * syncAppointmentCreated — Handle appointment_created event.
 * Searches by servicetitan_appointment_id; creates if not found, updates if found.
 */
export async function syncAppointmentCreated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event, action } = ctx;
  const extracted = extractAppointmentData(payload, event);

  if (!extracted.servicetitan_appointment_id) {
    return {
      success: false,
      summary: "Appointment payload is missing appointment ID",
      error: "servicetitan_appointment_id is required",
      retryable: false,
    };
  }

  // ── Date validation for scheduling events ──
  const dateError = validateSchedulingDates(extracted, action);
  if (dateError) {
    return {
      success: false,
      summary: "Appointment payload contains an invalid date",
      error: dateError.error,
      retryable: false,
    };
  }

  const existing = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);

  if (existing) {
    // Idempotency: already exists, treat as update
    return syncAppointmentUpdated(ctx);
  }

  // ── On-demand customer hydration ──
  // If the referenced ServiceTitan customer is missing locally, hydrate it
  // before creating the appointment. If hydration fails, defer the appointment.
  if (extracted.servicetitan_customer_id) {
    const localCustomer = await findLocalCustomer(base44, extracted.servicetitan_customer_id);
    if (!localCustomer) {
      const tenantId = extracted.servicetitan_tenant_id || getTenantId();
      const environment = getEnvironment();
      const hydrationResult = await ensureCustomerForDependentRecord(
        base44,
        extracted.servicetitan_customer_id,
        tenantId,
        environment,
        "appointment",
        extracted.servicetitan_appointment_id,
        event?.id,
        payload
      );

      if (hydrationResult.status === "deferred") {
        return {
          success: false,
          summary: `Appointment deferred — customer '${extracted.servicetitan_customer_id}' hydration failed`,
          error: hydrationResult.warning || "Customer hydration failed",
          retryable: true,
        };
      }
    }
  }

  // Map technician
  const techMapping = await mapTechnician(
    base44,
    extracted.servicetitan_technician_id,
    extracted.servicetitan_technician_name,
    extracted.servicetitan_technician_email,
    extracted.servicetitan_employee_id
  );

  const updateData = buildSyncUpdateData(extracted, techMapping, event?.event_type || "appointment_created");

  try {
    const created = await base44.asServiceRole.entities.Appointment.create(updateData);

    // ── Upsert canonical child assignment (complete snapshot) ──
    if (extracted.servicetitan_technician_id || extracted.servicetitan_employee_id ||
        extracted.servicetitan_technician_name || extracted.servicetitan_technician_email) {
      const assignmentResult: AssignmentResult = await upsertAssignment(base44, {
        appointmentId: created.id,
        servicetitanAppointmentId: extracted.servicetitan_appointment_id,
        servicetitanTechnicianId: extracted.servicetitan_technician_id,
        servicetitanEmployeeId: extracted.servicetitan_employee_id,
        technicianName: extracted.servicetitan_technician_name,
        technicianEmail: extracted.servicetitan_technician_email,
        tenantId: extracted.servicetitan_tenant_id,
        eventType: event?.event_type || "appointment_created",
        eventTimestamp: extracted.servicetitan_last_event_at,
        webhookEventId: event?.id || "",
        isCompleteSnapshot: true,
        actor: "servicetitan-sync",
      });
      // Derive lead projection from canonical child assignments
      if (assignmentResult.success) {
        await projectLeadTechnician(base44, created.id);
      }
    }

    // Create technician-mapping-failed timeline entry when unmatched
    if (techMapping.status === "unmatched") {
      await addTimelineEntry(
        base44,
        event?.id,
        TIMELINE_STAGES.HANDLER_FINISHED,
        `Technician mapping failed: ${techMapping.warning}`,
        "warning",
        undefined,
        {
          sync_action: "technician_mapping_failed",
          servicetitan_technician_id: extracted.servicetitan_technician_id,
          servicetitan_employee_id: extracted.servicetitan_employee_id,
          servicetitan_technician_name: extracted.servicetitan_technician_name,
        }
      );
    }

    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Local appointment created (${created.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`,
      "success",
      undefined,
      {
        sync_action: "created",
        local_appointment_id: created.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        job_number: extracted.servicetitan_job_number,
        technician_mapping: techMapping.status,
      }
    );

    const warnings = [...extracted.warnings];
    if (techMapping.warning) warnings.push(techMapping.warning);

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} created in the LVC calendar`,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        sync_action: "created",
        local_appointment_id: created.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        technician_mapping: techMapping.status,
        changed_fields: Object.keys(updateData).filter(
          (k) => k !== "servicetitan_last_synced_at" && k !== "servicetitan_last_event_type" && k !== "servicetitan_last_event_at"
        ),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: "Appointment creation failed",
      error: `Database create failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

/**
 * syncAppointmentUpdated — Handle appointment_updated and appointment_rescheduled.
 * Finds by servicetitan_appointment_id; performs recovery upsert if not found.
 */
export async function syncAppointmentUpdated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event, action } = ctx;
  const extracted = extractAppointmentData(payload, event);

  if (!extracted.servicetitan_appointment_id) {
    return {
      success: false,
      summary: "Appointment payload is missing appointment ID",
      error: "servicetitan_appointment_id is required",
      retryable: false,
    };
  }

  // ── Date validation for scheduling events ──
  const dateError = validateSchedulingDates(extracted, action);
  if (dateError) {
    return {
      success: false,
      summary: "Appointment payload contains an invalid date",
      error: dateError.error,
      retryable: false,
    };
  }

  const existing = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);

  // Recovery upsert: if not found, create it
  if (!existing) {
    return syncAppointmentCreated(ctx);
  }

  // ── Event ordering protection: reject stale events ──
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Event ignored as stale: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning",
      undefined,
      {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        incoming_event_at: extracted.servicetitan_last_event_at,
        existing_event_at: existing.servicetitan_last_event_at,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} — stale event ignored (older than last sync)`,
      metadata: {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: [],
      },
    };
  }

  // Only re-evaluate technician mapping when the payload actually contains
  // technician data. Otherwise, preserve the existing mapping.
  const hasTechData = !!(
    extracted.servicetitan_technician_id ||
    extracted.servicetitan_employee_id ||
    extracted.servicetitan_technician_email ||
    extracted.servicetitan_technician_name
  );

  let techMapping: TechMapping;
  if (hasTechData) {
    techMapping = await mapTechnician(
      base44,
      extracted.servicetitan_technician_id,
      extracted.servicetitan_technician_name,
      extracted.servicetitan_technician_email,
      extracted.servicetitan_employee_id
    );
  } else {
    techMapping = {
      status: (existing.technician_mapping_status as TechMapping["status"]) || "unassigned",
      warning: existing.technician_mapping_warning || "",
    };
  }

  const updateData = buildSyncUpdateData(extracted, techMapping, event?.event_type || "appointment_updated");

  // Filter out empty incoming values — a missing field in the payload should NOT
  // overwrite an existing non-empty value.
  const nonEmptyUpdateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (
      key === "servicetitan_last_synced_at" ||
      key === "servicetitan_last_event_type" ||
      key === "servicetitan_last_event_at" ||
      key === "servicetitan_source" ||
      key === "appointment_source"
    ) {
      nonEmptyUpdateData[key] = value;
      continue;
    }
    if (key === "technician_mapping_status" || key === "technician_mapping_warning") {
      if (hasTechData) {
        nonEmptyUpdateData[key] = value;
      }
      continue;
    }
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      nonEmptyUpdateData[key] = value;
    }
  }

  const changedFields = detectChangedFields(existing, nonEmptyUpdateData, ST_CONTROLLED_FIELDS);

  if (changedFields.length === 0) {
    // Idempotency: no changes
    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `No changes required for appointment '${extracted.servicetitan_appointment_id}'`,
      "info",
      undefined,
      {
        sync_action: "unchanged",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} — no changes required`,
      metadata: {
        sync_action: "unchanged",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        technician_mapping: techMapping.status,
        changed_fields: [],
      },
    };
  }

  // Record conflict history for overwritten local values
  // (only for non-stale events — stale events are already returned above)
  const conflictHistory = appendConflictHistory(existing, nonEmptyUpdateData, changedFields, event);
  if (conflictHistory) {
    nonEmptyUpdateData.sync_conflict_history_json = conflictHistory;
  }

  try {
    await base44.asServiceRole.entities.Appointment.update(existing.id, nonEmptyUpdateData);

    // ── Upsert canonical child assignment when technician data is present ──
    if (hasTechData) {
      const assignmentResult: AssignmentResult = await upsertAssignment(base44, {
        appointmentId: existing.id,
        servicetitanAppointmentId: extracted.servicetitan_appointment_id,
        servicetitanTechnicianId: extracted.servicetitan_technician_id,
        servicetitanEmployeeId: extracted.servicetitan_employee_id,
        technicianName: extracted.servicetitan_technician_name,
        technicianEmail: extracted.servicetitan_technician_email,
        tenantId: extracted.servicetitan_tenant_id,
        eventType: event?.event_type || "appointment_updated",
        eventTimestamp: extracted.servicetitan_last_event_at,
        webhookEventId: event?.id || "",
        isCompleteSnapshot: true,
        actor: "servicetitan-sync",
      });
      if (assignmentResult.success) {
        await projectLeadTechnician(base44, existing.id);
      }
    }

    const isReschedule = action === "rescheduled" || event?.event_type === "appointment_rescheduled";
    const syncAction = isReschedule ? "rescheduled" : "updated";

    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      isReschedule
        ? `Appointment rescheduled (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`
        : `Local appointment updated (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`,
      "success",
      undefined,
      {
        sync_action: syncAction,
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        job_number: extracted.servicetitan_job_number,
        technician_mapping: techMapping.status,
        changed_fields: changedFields,
        previous_start: existing.scheduled_start || null,
        new_start: nonEmptyUpdateData.scheduled_start || existing.scheduled_start || null,
        previous_end: existing.scheduled_end || null,
        new_end: nonEmptyUpdateData.scheduled_end || existing.scheduled_end || null,
      }
    );

    const warnings = [...extracted.warnings];
    if (techMapping.warning) warnings.push(techMapping.warning);

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} ${isReschedule ? "rescheduled" : "updated"} in the LVC calendar`,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        sync_action: syncAction,
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        technician_mapping: techMapping.status,
        changed_fields: changedFields,
        previous_start: existing.scheduled_start || null,
        new_start: nonEmptyUpdateData.scheduled_start || existing.scheduled_start || null,
        previous_end: existing.scheduled_end || null,
        new_end: nonEmptyUpdateData.scheduled_end || existing.scheduled_end || null,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: "Appointment update failed",
      error: `Database update failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

/**
 * syncAppointmentCanceled — Handle appointment_canceled and appointment_cancelled.
 * Does NOT delete the local record — sets canceled state and preserves history.
 */
export async function syncAppointmentCanceled(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractAppointmentData(payload, event);

  if (!extracted.servicetitan_appointment_id) {
    return {
      success: false,
      summary: "Appointment payload is missing appointment ID",
      error: "servicetitan_appointment_id is required",
      retryable: false,
    };
  }

  const existing = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);

  if (!existing) {
    // Nothing to cancel — idempotent no-op
    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} not found locally — nothing to cancel`,
      metadata: {
        sync_action: "unchanged",
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: [],
      },
    };
  }

  // ── Event ordering protection: reject stale events ──
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Cancel event ignored as stale: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning",
      undefined,
      {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} — stale cancel event ignored`,
      metadata: {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: [],
      },
    };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    status: "cancelled",
    dispatch_status: "cancelled",
    is_canceled: true,
    canceled_at: now,
    canceled_source: "servicetitan",
    servicetitan_last_synced_at: now,
    servicetitan_last_event_type: event?.event_type || "appointment_canceled",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
    servicetitan_source: "webhook",
  };

  if (extracted.scheduled_start) updateData.scheduled_start = extracted.scheduled_start;
  if (extracted.scheduled_end) updateData.scheduled_end = extracted.scheduled_end;

  const changedFields = detectChangedFields(existing, updateData, [
    "status",
    "dispatch_status",
    "is_canceled",
    "scheduled_start",
    "scheduled_end",
  ]);

  try {
    await base44.asServiceRole.entities.Appointment.update(existing.id, updateData);

    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Appointment canceled (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`,
      "warning",
      undefined,
      {
        sync_action: "canceled",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: changedFields,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} canceled in the LVC calendar`,
      metadata: {
        sync_action: "canceled",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: changedFields,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: "Appointment cancellation failed",
      error: `Database update failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

/**
 * syncAppointmentCompleted — Handle appointment_completed.
 * Updates status to completed without completing unrelated local tasks.
 */
export async function syncAppointmentCompleted(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractAppointmentData(payload, event);

  if (!extracted.servicetitan_appointment_id) {
    return {
      success: false,
      summary: "Appointment payload is missing appointment ID",
      error: "servicetitan_appointment_id is required",
      retryable: false,
    };
  }

  const existing = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);

  if (!existing) {
    // Recovery upsert: create then mark completed
    const createResult = await syncAppointmentCreated(ctx);
    if (!createResult.success) return createResult;

    const newExisting = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);
    if (!newExisting) {
      return createResult;
    }

    const now = new Date().toISOString();
    try {
      await base44.asServiceRole.entities.Appointment.update(newExisting.id, {
        status: "completed",
        dispatch_status: "completed",
        completed_at: now,
        completed_source: "servicetitan",
        servicetitan_last_synced_at: now,
        servicetitan_last_event_type: event?.event_type || "appointment_completed",
        servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
      });

      return {
        success: true,
        summary: `Appointment ${extracted.servicetitan_appointment_id} created and completed`,
        metadata: {
          sync_action: "completed",
          local_appointment_id: newExisting.id,
          servicetitan_appointment_id: extracted.servicetitan_appointment_id,
          changed_fields: ["status", "completed_at"],
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: "Appointment completion failed",
        error: `Database update failed: ${errorMsg}`,
        retryable: true,
      };
    }
  }

  // ── Event ordering protection: reject stale events ──
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Complete event ignored as stale: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning",
      undefined,
      {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} — stale complete event ignored`,
      metadata: {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: [],
      },
    };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    status: "completed",
    dispatch_status: "completed",
    completed_at: now,
    completed_source: "servicetitan",
    servicetitan_last_synced_at: now,
    servicetitan_last_event_type: event?.event_type || "appointment_completed",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
  };

  const changedFields = detectChangedFields(existing, updateData, ["status", "dispatch_status", "completed_at"]);

  try {
    await base44.asServiceRole.entities.Appointment.update(existing.id, updateData);

    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Appointment completed (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`,
      "success",
      undefined,
      {
        sync_action: "completed",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: changedFields,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} completed in the LVC calendar`,
      metadata: {
        sync_action: "completed",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: changedFields,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: "Appointment completion failed",
      error: `Database update failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

/**
 * syncTechnicianAssignment — Handle appointment_assigned, technician_assigned,
 * and technician_unassigned.
 */
export async function syncTechnicianAssignment(
  ctx: SyncContext,
  isUnassign: boolean
): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractAppointmentData(payload, event);

  if (!extracted.servicetitan_appointment_id) {
    return {
      success: false,
      summary: "Appointment payload is missing appointment ID",
      error: "servicetitan_appointment_id is required",
      retryable: false,
    };
  }

  const existing = await findLocalAppointment(base44, extracted.servicetitan_appointment_id);

  if (!existing) {
    // Recovery upsert: create the appointment first, then apply assignment
    const createResult = await syncAppointmentCreated(ctx);
    if (!createResult.success) return createResult;
    return {
      ...createResult,
      summary: `Appointment ${extracted.servicetitan_appointment_id} created with technician assignment`,
    };
  }

  // ── Event ordering protection: reject stale events ──
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      `Technician event ignored as stale: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning",
      undefined,
      {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
      }
    );

    return {
      success: true,
      summary: `Appointment ${extracted.servicetitan_appointment_id} — stale technician event ignored`,
      metadata: {
        sync_action: "stale_ignored",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        changed_fields: [],
      },
    };
  }

  const now = new Date().toISOString();

  if (isUnassign) {
    const updateData: Record<string, any> = {
      technician_id: "",
      technician_name: "",
      technician_email: "",
      dispatch_status: "unassigned",
      technician_mapping_status: "unassigned",
      technician_mapping_warning: "",
      servicetitan_last_synced_at: now,
      servicetitan_last_event_type: event?.event_type || "technician_unassigned",
      servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
    };

    try {
      await base44.asServiceRole.entities.Appointment.update(existing.id, updateData);

      // ── Remove canonical child assignment(s) ──
      await removeAssignment(
        base44,
        existing.id,
        extracted.servicetitan_technician_id,
        event?.id || "",
        event?.event_type || "appointment_unassigned",
        extracted.servicetitan_last_event_at
      );
      // Derive lead projection (clears legacy fields if no lead remains)
      await projectLeadTechnician(base44, existing.id);

      await addTimelineEntry(
        base44,
        event?.id,
        TIMELINE_STAGES.HANDLER_FINISHED,
        `Technician unassigned from appointment (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`,
        "info",
        undefined,
        {
          sync_action: "updated",
          local_appointment_id: existing.id,
          servicetitan_appointment_id: extracted.servicetitan_appointment_id,
          technician_mapping: "unassigned",
          changed_fields: ["technician_id", "technician_name", "technician_email"],
        }
      );

      return {
        success: true,
        summary: `Technician unassigned from appointment ${extracted.servicetitan_appointment_id}`,
        metadata: {
          sync_action: "updated",
          local_appointment_id: existing.id,
          servicetitan_appointment_id: extracted.servicetitan_appointment_id,
          technician_mapping: "unassigned",
          changed_fields: ["technician_id", "technician_name", "technician_email"],
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: "Technician unassignment failed",
        error: `Database update failed: ${errorMsg}`,
        retryable: true,
      };
    }
  }

  // Assignment: map technician
  const techMapping = await mapTechnician(
    base44,
    extracted.servicetitan_technician_id,
    extracted.servicetitan_technician_name,
    extracted.servicetitan_technician_email,
    extracted.servicetitan_employee_id
  );

  const updateData: Record<string, any> = {
    servicetitan_technician_id: extracted.servicetitan_technician_id,
    servicetitan_technician_name: extracted.servicetitan_technician_name,
    technician_mapping_status: techMapping.status,
    technician_mapping_warning: techMapping.warning || "",
    dispatch_status: "assigned",
    servicetitan_last_synced_at: now,
    servicetitan_last_event_type: event?.event_type || "technician_assigned",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
  };

  if (techMapping.status === "matched" && techMapping.employeeRegistryId) {
    updateData.technician_id = techMapping.employeeRegistryId;
    updateData.technician_name = techMapping.employeeName || extracted.servicetitan_technician_name;
    if (techMapping.employeeEmail) updateData.technician_email = techMapping.employeeEmail;
  } else {
    updateData.technician_id = extracted.servicetitan_technician_id || "";
    updateData.technician_name = extracted.servicetitan_technician_name;
    updateData.technician_email = extracted.servicetitan_technician_email;
  }

  const changedFields = detectChangedFields(existing, updateData, [
    "technician_id",
    "technician_name",
    "technician_email",
    "dispatch_status",
    "servicetitan_technician_id",
    "servicetitan_technician_name",
    "technician_mapping_status",
  ]);

  // Determine timeline message based on whether this is a reassignment or initial assignment
  const isReassignment = !!existing.technician_id && techMapping.status === "matched";
  const timelineMessage =
    techMapping.status === "unmatched"
      ? `Technician mapping failed for appointment '${extracted.servicetitan_appointment_id}'`
      : isReassignment
        ? `Technician reassigned on appointment (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`
        : `Technician assigned to appointment (${existing.id}) for ST appointment '${extracted.servicetitan_appointment_id}'`;

  try {
    await base44.asServiceRole.entities.Appointment.update(existing.id, updateData);

    // ── Upsert canonical child assignment (partial update) ──
    const assignmentResult: AssignmentResult = await upsertAssignment(base44, {
      appointmentId: existing.id,
      servicetitanAppointmentId: extracted.servicetitan_appointment_id,
      servicetitanTechnicianId: extracted.servicetitan_technician_id,
      servicetitanEmployeeId: extracted.servicetitan_employee_id,
      technicianName: extracted.servicetitan_technician_name,
      technicianEmail: extracted.servicetitan_technician_email,
      tenantId: extracted.servicetitan_tenant_id,
      eventType: event?.event_type || "appointment_assigned",
      eventTimestamp: extracted.servicetitan_last_event_at,
      webhookEventId: event?.id || "",
      isCompleteSnapshot: false,
      actor: "servicetitan-sync",
    });
    if (assignmentResult.success) {
      await projectLeadTechnician(base44, existing.id);
    }

    await addTimelineEntry(
      base44,
      event?.id,
      TIMELINE_STAGES.HANDLER_FINISHED,
      timelineMessage,
      techMapping.status === "unmatched" ? "warning" : "success",
      undefined,
      {
        sync_action: techMapping.status === "unmatched" ? "unmatched" : "updated",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        technician_mapping: techMapping.status,
        servicetitan_technician_id: extracted.servicetitan_technician_id,
        servicetitan_technician_name: extracted.servicetitan_technician_name,
        is_reassignment: isReassignment,
        changed_fields: changedFields,
      }
    );

    const warnings = [...extracted.warnings];
    if (techMapping.warning) warnings.push(techMapping.warning);

    return {
      success: true,
      summary:
        techMapping.status === "unmatched"
          ? `Appointment ${extracted.servicetitan_appointment_id} synchronized, but technician mapping failed`
          : isReassignment
            ? `Technician reassigned on appointment ${extracted.servicetitan_appointment_id}`
            : `Technician assigned to appointment ${extracted.servicetitan_appointment_id}`,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        sync_action: techMapping.status === "unmatched" ? "unmatched" : "updated",
        local_appointment_id: existing.id,
        servicetitan_appointment_id: extracted.servicetitan_appointment_id,
        technician_mapping: techMapping.status,
        servicetitan_technician_id: extracted.servicetitan_technician_id,
        is_reassignment: isReassignment,
        changed_fields: changedFields,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      summary: "Technician assignment failed",
      error: `Database update failed: ${errorMsg}`,
      retryable: true,
    };
  }
}