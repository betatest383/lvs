/**
 * Appointment Technician Assignment Service (Stage 2D)
 *
 * Manages canonical child records (AppointmentTechnicianAssignment) for
 * technician assignments on Appointment records.
 *
 * Architecture:
 *   - One canonical child record per Appointment and external technician.
 *   - Tenant-safe uniqueness via assignment_key (appointment_id:external_identifier).
 *   - All source technician assignments persisted (including removed for history).
 *   - Verified external-ID Employee resolution only (no email/name auto-resolve).
 *   - Unresolved external technician IDs preserved on the assignment record.
 *   - Assignment roles and lead designation when supplied.
 *   - Assignment removal and reassignment (mark old as removed, create new active).
 *   - Complete-snapshot vs partial-update handling.
 *   - Stale-event protection (older events cannot overwrite newer assignment state).
 *   - Replay idempotency (assignment_key prevents duplicates).
 *   - Derived legacy lead projection (Appointment.technician_id/name/email derived
 *     from the active lead assignment — never the other way around).
 *
 * crew_assignment JSON array on Appointment is NOT a substitute for this
 * canonical child entity. It stores LVC-local crew (apprentices/helpers) for
 * backward compatibility but is not the source of truth for ST-assigned
 * technicians.
 */

export interface TechMappingResult {
  status: "matched" | "unmatched" | "unassigned";
  employeeRegistryId?: string;
  employeeName?: string;
  employeeEmail?: string;
  warning?: string;
}

export interface AssignmentInput {
  appointmentId: string;
  servicetitanAppointmentId: string;
  servicetitanTechnicianId: string;
  servicetitanEmployeeId: string;
  technicianName: string;
  technicianEmail: string;
  tenantId: string;
  eventType: string;
  eventTimestamp: string | null;
  webhookEventId: string;
  isCompleteSnapshot: boolean;
  actor: string;
}

export interface AssignmentResult {
  success: boolean;
  assignmentId?: string;
  mappingStatus: "matched" | "unmatched" | "unassigned";
  employeeRegistryId?: string;
  employeeName?: string;
  employeeEmail?: string;
  warning?: string;
  removedAssignments?: number;
  error?: string;
}

/**
 * Build the deterministic assignment_key.
 * Uses technician_id when available, falls back to employee_id.
 * Format: appointment_id:tech:{stTechId} or appointment_id:emp:{stEmpId}
 */
export function buildAssignmentKey(
  appointmentId: string,
  stTechnicianId: string,
  stEmployeeId: string
): string {
  if (stTechnicianId) {
    return `${appointmentId}:tech:${stTechnicianId}`;
  }
  if (stEmployeeId) {
    return `${appointmentId}:emp:${stEmployeeId}`;
  }
  return `${appointmentId}:none`;
}

/**
 * Resolve a ServiceTitan technician to EmployeeRegistry using ONLY verified
 * ServiceTitan identifiers (technician_id or employee_id). Email and name
 * are NEVER used for automatic resolution — they produce candidate suggestions
 * for administrative review only.
 *
 * This mirrors the mapTechnician logic in stAppointmentSync.ts but is
 * encapsulated here so the assignment service is self-contained.
 */
async function resolveEmployee(
  base44: any,
  stTechnicianId: string,
  stEmployeeId: string,
  technicianEmail: string,
  technicianName: string
): Promise<TechMappingResult> {
  if (!stTechnicianId && !stEmployeeId && !technicianEmail && !technicianName) {
    return { status: "unassigned" };
  }

  // 1. Primary: ServiceTitan technician ID (verified)
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
      console.error("[ASSIGNMENT SVC] EmployeeRegistry lookup by technician_id failed:", err);
    }
  }

  // 2. Secondary: ServiceTitan employee ID (verified)
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
      console.error("[ASSIGNMENT SVC] EmployeeRegistry lookup by employee_id failed:", err);
    }
  }

  // ── Unverified candidate lookup (for administrative review ONLY) ──
  let candidateInfo: string | undefined;

  if (technicianEmail) {
    try {
      const byEmail = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { email: technicianEmail, employment_status: "Active" },
        null,
        5
      );
      if (byEmail.length > 0) {
        const names = byEmail.map(e => `${e.first_name} ${e.last_name} (ID: ${e.id})`).join(", ");
        candidateInfo = `Unverified email candidate(s): ${names}. A verified ServiceTitan technician ID or employee ID must be added to the EmployeeRegistry record before this technician can be resolved.`;
      }
    } catch (err) {
      console.error("[ASSIGNMENT SVC] Email candidate lookup failed:", err);
    }
  }

  if (technicianName && !candidateInfo) {
    try {
      const nameParts = technicianName.trim().split(/\s+/);
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
      console.error("[ASSIGNMENT SVC] Name candidate lookup failed:", err);
    }
  }

  const baseWarning = `No EmployeeRegistry record found with a verified ServiceTitan identifier for technician '${stTechnicianId || stEmployeeId || technicianName || "N/A"}'.`;
  const warning = candidateInfo ? `${baseWarning} ${candidateInfo}` : baseWarning;

  return { status: "unmatched", warning };
}

/**
 * Check if an incoming event is stale relative to the existing assignment.
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

/**
 * Upsert a technician assignment for an appointment.
 *
 * Creates a new active assignment if none exists, or reactivates/updates an
 * existing one. Handles:
 *   - Idempotency via assignment_key (no duplicate active assignments)
 *   - Stale-event protection (older events ignored)
 *   - Employee resolution via verified ST identifiers
 *   - Lead designation (ST-assigned techs are lead by default)
 *
 * If isCompleteSnapshot=true, all OTHER active assignments for this appointment
 * that don't match the incoming external identifier are marked as removed
 * (complete-snapshot semantics: the payload represents the full current state).
 */
export async function upsertAssignment(
  base44: any,
  input: AssignmentInput
): Promise<AssignmentResult> {
  const {
    appointmentId,
    servicetitanAppointmentId,
    servicetitanTechnicianId: stTechId,
    servicetitanEmployeeId: stEmpId,
    technicianName,
    technicianEmail,
    tenantId,
    eventType,
    eventTimestamp,
    webhookEventId,
    isCompleteSnapshot,
    actor,
  } = input;

  // If no technician data at all, return unassigned without creating an assignment
  if (!stTechId && !stEmpId && !technicianEmail && !technicianName) {
    return { success: true, mappingStatus: "unassigned" };
  }

  const assignmentKey = buildAssignmentKey(appointmentId, stTechId, stEmpId);
  const now = new Date().toISOString();

  // Resolve Employee via verified identifiers
  const mapping = await resolveEmployee(base44, stTechId, stEmpId, technicianEmail, technicianName);

  // Find existing assignment by key
  let existing: any = null;
  try {
    const existingAssignments = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
      { assignment_key: assignmentKey },
      "-servicetitan_last_synced_at",
      1
    );
    existing = existingAssignments[0] || null;
  } catch (err) {
    console.error("[ASSIGNMENT SVC] Lookup failed:", err);
  }

  // Stale-event protection
  if (existing && isStaleEvent(existing, eventTimestamp)) {
    return {
      success: true,
      mappingStatus: existing.mapping_status || "unmatched",
      employeeRegistryId: existing.employee_registry_id || "",
      warning: "Stale event ignored — assignment not updated",
    };
  }

  const updateData: Record<string, any> = {
    appointment_id: appointmentId,
    servicetitan_appointment_id: servicetitanAppointmentId,
    servicetitan_technician_id: stTechId,
    servicetitan_employee_id: stEmpId,
    technician_name: technicianName,
    technician_email: technicianEmail,
    mapping_status: mapping.status,
    mapping_warning: mapping.warning || "",
    assignment_role: "lead",
    is_lead: true,
    assignment_source: "servicetitan",
    status: "active",
    servicetitan_last_event_at: eventTimestamp || now,
    servicetitan_last_event_type: eventType,
    servicetitan_last_synced_at: now,
    servicetitan_tenant_id: tenantId,
    servicetitan_last_webhook_event_id: webhookEventId,
    created_by: actor,
    removed_at: null,
    removed_by_event_id: null,
  };

  if (mapping.status === "matched" && mapping.employeeRegistryId) {
    updateData.employee_registry_id = mapping.employeeRegistryId;
  } else {
    updateData.employee_registry_id = "";
  }

  let assignmentId: string;

  if (existing) {
    // Update existing assignment (may reactivate a removed one)
    try {
      await base44.asServiceRole.entities.AppointmentTechnicianAssignment.update(existing.id, updateData);
      assignmentId = existing.id;
    } catch (err) {
      return { success: false, mappingStatus: mapping.status, error: `Update failed: ${err}` };
    }
  } else {
    // Create new assignment
    try {
      const created = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.create({
        ...updateData,
        assignment_key: assignmentKey,
      });
      assignmentId = created.id;
    } catch (err) {
      return { success: false, mappingStatus: mapping.status, error: `Create failed: ${err}` };
    }
  }

  // Complete-snapshot: mark all OTHER active assignments as removed
  let removedCount = 0;
  if (isCompleteSnapshot) {
    try {
      const allActive = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
        { appointment_id: appointmentId, status: "active" },
        null,
        50
      );
      for (const a of allActive) {
        if (a.id !== assignmentId && a.assignment_source === "servicetitan") {
          try {
            await base44.asServiceRole.entities.AppointmentTechnicianAssignment.update(a.id, {
              status: "removed",
              removed_at: now,
              removed_by_event_id: webhookEventId,
              is_lead: false,
            });
            removedCount++;
          } catch {}
        }
      }
    } catch (err) {
      console.error("[ASSIGNMENT SVC] Snapshot removal failed:", err);
    }
  }

  return {
    success: true,
    assignmentId,
    mappingStatus: mapping.status,
    employeeRegistryId: mapping.employeeRegistryId,
    employeeName: mapping.employeeName,
    employeeEmail: mapping.employeeEmail,
    warning: mapping.warning,
    removedAssignments: removedCount,
  };
}

/**
 * Remove (mark as removed) the active assignment(s) for an appointment.
 *
 * Used when:
 *   - A technician is explicitly unassigned (appointment.unassigned event)
 *   - The appointment is canceled or completed (assignments are preserved as
 *     removed for history, but lead projection is cleared)
 *
 * If stTechId is provided, only the assignment matching that technician is removed.
 * If stTechId is empty, ALL active ST-sourced assignments are removed.
 */
export async function removeAssignment(
  base44: any,
  appointmentId: string,
  stTechId: string,
  webhookEventId: string,
  eventType: string,
  eventTimestamp: string | null
): Promise<{ removed: number }> {
  const now = new Date().toISOString();

  try {
    const filter: any = { appointment_id: appointmentId, status: "active", assignment_source: "servicetitan" };
    if (stTechId) {
      filter.servicetitan_technician_id = stTechId;
    }
    const activeAssignments = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
      filter,
      null,
      50
    );

    for (const a of activeAssignments) {
      if (isStaleEvent(a, eventTimestamp)) continue;
      try {
        await base44.asServiceRole.entities.AppointmentTechnicianAssignment.update(a.id, {
          status: "removed",
          removed_at: now,
          removed_by_event_id: webhookEventId,
          is_lead: false,
          servicetitan_last_event_at: eventTimestamp || now,
          servicetitan_last_event_type: eventType,
          servicetitan_last_synced_at: now,
        });
      } catch {}
    }

    return { removed: activeAssignments.length };
  } catch (err) {
    console.error("[ASSIGNMENT SVC] Remove failed:", err);
    return { removed: 0 };
  }
}

/**
 * Get all active assignments for an appointment.
 */
export async function getActiveAssignments(
  base44: any,
  appointmentId: string
): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
      { appointment_id: appointmentId, status: "active" },
      null,
      50
    );
  } catch {
    return [];
  }
}

/**
 * Get the active lead assignment for an appointment.
 * The lead is the assignment with is_lead=true and status=active.
 * If no lead exists, returns the first active ST-sourced assignment.
 */
export async function getLeadAssignment(
  base44: any,
  appointmentId: string
): Promise<any | null> {
  const active = await getActiveAssignments(base44, appointmentId);
  if (active.length === 0) return null;

  const lead = active.find(a => a.is_lead === true);
  if (lead) return lead;

  // Fallback: first active ST-sourced assignment
  const stAssignment = active.find(a => a.assignment_source === "servicetitan");
  return stAssignment || active[0];
}

/**
 * Derive and project the lead technician onto the Appointment's legacy
 * scalar fields (technician_id, technician_name, technician_email,
 * technician_mapping_status, technician_mapping_warning).
 *
 * This is the DERIVED lead projection — the Appointment's scalar technician
 * fields are NEVER the source of truth. They are derived from the canonical
 * child assignment records.
 *
 * Called after any assignment change (upsert, remove, snapshot sync).
 */
export async function projectLeadTechnician(
  base44: any,
  appointmentId: string
): Promise<void> {
  const lead = await getLeadAssignment(base44, appointmentId);

  if (!lead) {
    // No active lead — clear legacy fields
    try {
      await base44.asServiceRole.entities.Appointment.update(appointmentId, {
        technician_id: "",
        technician_name: "",
        technician_email: "",
        technician_mapping_status: "unassigned",
        technician_mapping_warning: "",
      });
    } catch (err) {
      console.error("[ASSIGNMENT SVC] Lead projection (clear) failed:", err);
    }
    return;
  }

  // Project the lead assignment onto legacy fields
  const updateData: Record<string, any> = {
    technician_mapping_status: lead.mapping_status || "unmatched",
    technician_mapping_warning: lead.mapping_warning || "",
  };

  if (lead.mapping_status === "matched" && lead.employee_registry_id) {
    updateData.technician_id = lead.employee_registry_id;
    updateData.technician_name = lead.technician_name || "";
    updateData.technician_email = lead.technician_email || "";
  } else if (lead.servicetitan_technician_id) {
    updateData.technician_id = lead.servicetitan_technician_id;
    updateData.technician_name = lead.technician_name || "";
    updateData.technician_email = lead.technician_email || "";
  } else if (lead.servicetitan_employee_id) {
    updateData.technician_id = lead.servicetitan_employee_id;
    updateData.technician_name = lead.technician_name || "";
    updateData.technician_email = lead.technician_email || "";
  } else {
    updateData.technician_id = "";
    updateData.technician_name = lead.technician_name || "";
    updateData.technician_email = lead.technician_email || "";
  }

  try {
    await base44.asServiceRole.entities.Appointment.update(appointmentId, updateData);
  } catch (err) {
    console.error("[ASSIGNMENT SVC] Lead projection failed:", err);
  }
}

/**
 * Clean up all assignment records for an appointment (used in test cleanup).
 */
export async function cleanupAssignmentsForAppointment(
  base44: any,
  appointmentId: string
): Promise<void> {
  try {
    const all = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
      { appointment_id: appointmentId },
      null,
      100
    );
    for (const a of all) {
      try { await base44.asServiceRole.entities.AppointmentTechnicianAssignment.delete(a.id); } catch {}
    }
  } catch {}
}

/**
 * Clean up all assignment records matching a prefix (used in test cleanup).
 */
export async function cleanupAssignmentsByPrefix(
  base44: any,
  prefix: string
): Promise<void> {
  try {
    const all = await base44.asServiceRole.entities.AppointmentTechnicianAssignment.filter(
      { servicetitan_appointment_id: { $regex: prefix } },
      null,
      200
    );
    for (const a of all) {
      try { await base44.asServiceRole.entities.AppointmentTechnicianAssignment.delete(a.id); } catch {}
    }
  } catch {}
}