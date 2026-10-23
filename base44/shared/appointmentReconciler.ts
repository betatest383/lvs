/**
 * Idempotent post-import reconciliation for ServiceTitan/Zapier-imported Jobs
 * and their linked Appointments.
 *
 * Why this exists:
 *   Zapier's "Create Record" action can create Job + Appointment entities directly
 *   in Base44, bypassing every backend ingestion function (upsertAppointmentFromCrm,
 *   stJobSync, etc.). Entity-create automations do NOT fire for SDK/Zapier-created
 *   records, so no technician resolution, location linking, job-type mapping, or
 *   dispatch escalation ever runs. The result is a Job whose list-row shows blank
 *   Technician / Dispatch / Job Type / Location while its Appointment carries the
 *   raw imported data.
 *
 * What this does (per imported Job, only when fields are blank — idempotent):
 *   1. Mirror servicetitan_job_number -> crm_job_number when the legacy alias is blank.
 *   2. Resolve Location by servicetitan_location_id -> Location.crm_location_id and
 *      populate Job.location_id. Never creates a Customer or Location.
 *   3. Map Job.job_type from the imported ServiceTitan job-type name when a mapping
 *      exists; otherwise leave blank (never fails the import).
 *   4. Propagate the imported ServiceTitan technician IDs/names from linked
 *      Appointments onto the Job's servicetitan_technician_ids / names arrays.
 *   5. Resolve the primary imported ST technician to an EmployeeRegistry record
 *      by EXACT ID only:
 *        a. EmployeeRegistry.servicetitan_technician_id == ST technician ID, or
 *        b. Technician.technician_id == ST technician ID -> Technician.email ->
 *           EmployeeRegistry.email (bridge).
 *      Secondary: exact ServiceTitan employee ID, if uniquely verified.
 *      NO email or name fallback is permitted. When resolved AND there is no
 *      manual LVC lead-technician override, populate the Job's lead_technician_*,
 *      technician_*, escalate dispatch_status unassigned->assigned, and auto-assign
 *      the technician's registered truck. When unresolved, set
 *      technician_mapping_status="unmatched" + diagnostic warning, retain the
 *      imported technician name/ID for display, and do NOT set lead technician,
 *      dispatch assigned, or truck.
 *   6. Set Appointment.technician_mapping_status (matched/unmatched) on linked
 *      appointments and, on a match, link technician_id to the EmployeeRegistry id.
 *
 * LVC-owned fields preserved (requirement 6):
 *   - lead_technician_email: never overwritten when already set.
 *   - dispatch_status: only escalated unassigned/blank -> assigned; manual LVC
 *     statuses (dispatched/started/completed) are never changed.
 *   - truck overrides (truck_override_used, assigned_truck_id): never touched.
 *   - notes, priority, workflow_version, apprentice, Job Hub state: untouched.
 *
 * Never creates a Job, Appointment, Customer, Location, Technician, or
 * EmployeeRegistry record.
 */

import { mapJobType } from "./stJobSyncHelpers.ts";
import { fetchAppointmentTechnician } from "./stAppointmentEnrichment.ts";

export interface ReconcileOptions {
  job_id?: string;
  appointment_id?: string;
  scan?: boolean;
  scan_limit?: number;
  repair_blank?: boolean;
}

export interface ReconcileResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  details: any[];
}

// ─── In-memory technician resolution (exact ID only) ─────────────────────────
// Resolved against preloaded EmployeeRegistry + Technician lists. Priority:
//   1. Exact ServiceTitan technician ID — EmployeeRegistry.servicetitan_technician_id
//      (direct) OR Technician.technician_id -> Technician.email -> EmployeeRegistry.email
//      (bridge). Permitted for automatic assignment.
//   2. Exact ServiceTitan employee ID — permitted only if uniquely verified.
// No email or name fallback. Only Active employees are matched.

function isActiveEmployee(e: any): boolean {
  return e.employment_status === "Active";
}

function matchedMapping(
  emp: any,
  stTechId: string,
  stName: string,
  warning: string | undefined,
  resolutionMethod: "exact_servicetitan_technician_id" | "exact_servicetitan_employee_id",
) {
  return {
    status: "matched" as const,
    employeeRegistryId: emp.id,
    employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
    employeeEmail: emp.email || "",
    stTechnicianId: stTechId,
    stTechnicianName: stName,
    warning,
    resolutionMethod,
  };
}

function resolveTechInMemory(
  employees: any[],
  technicians: any[],
  stTechId: string,
  stName: string,
  stEmpId: string,
) {
  if (!stTechId && !stEmpId && !stName) return { status: "unassigned" as const };

  // 1. Exact ServiceTitan technician ID — permitted for automatic assignment.
  //    Path A: EmployeeRegistry.servicetitan_technician_id (direct).
  if (stTechId) {
    const direct = employees.find(
      (e) => String(e.servicetitan_technician_id || "") === String(stTechId) && isActiveEmployee(e),
    );
    if (direct) {
      return matchedMapping(direct, stTechId, stName, undefined, "exact_servicetitan_technician_id");
    }
    // Path B: Technician.technician_id -> Technician.email -> EmployeeRegistry.email (bridge).
    const tech = technicians.find(
      (x) => String(x.technician_id || "") === String(stTechId) && x.status !== "inactive",
    );
    if (tech && tech.email) {
      const ne = String(tech.email).toLowerCase();
      const er = employees.find((e) => String(e.email || "").toLowerCase() === ne && isActiveEmployee(e));
      if (er) {
        return matchedMapping(er, stTechId, stName, undefined, "exact_servicetitan_technician_id");
      }
    }
  }

  // 2. Exact ServiceTitan employee ID — permitted only if uniquely verified.
  if (stEmpId) {
    const matches = employees.filter(
      (e) => String(e.servicetitan_employee_id || "") === String(stEmpId) && isActiveEmployee(e),
    );
    if (matches.length === 1) {
      return matchedMapping(
        matches[0], stTechId, stName,
        `Technician matched by ServiceTitan employee ID '${stEmpId}' (technician ID '${stTechId || "N/A"}' not found).`,
        "exact_servicetitan_employee_id",
      );
    }
  }

  // 3. No automatic email or name fallback.
  return {
    status: "unmatched" as const,
    stTechnicianId: stTechId,
    stTechnicianName: stName,
    warning: `No exact ServiceTitan technician ID match for '${stTechId || "N/A"}' (employee ID: ${stEmpId || "N/A"}). Email/name fallback disabled; imported technician retained for display only.`,
  };
}

function arraysEqual(a: any[], b: any[]): boolean {
  const ba = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (ba.length !== bb.length) return false;
  return ba.every((v, i) => String(v) === String(bb[i]));
}

// Base44 record ids are 24-char hex; ServiceTitan technician IDs are numeric.
// Used to avoid mistaking a resolved EmployeeRegistry id stored in
// Appointment.technician_id for a raw ServiceTitan technician ID.
function isBase44Id(t: string): boolean {
  return /^[0-9a-f]{24}$/.test(String(t || ""));
}

// Gather technician signals from a single Appointment, robust to both the
// Zapier upsert path (comma-separated ST IDs in technician_id, names in
// technician_name) and the canonical ST sync path (singular
// servicetitan_technician_id / servicetitan_technician_name). IDs: union of
// servicetitan_technician_id (split) and technician_id tokens that are NOT
// Base44 ids. Names: servicetitan_technician_name (split), else technician_name.
// All lists de-duplicated, order preserved.
function gatherAppointmentTechSignals(apt: any): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const seenId = new Set<string>();
  const pushId = (t: string) => {
    const s = String(t || "").trim();
    if (s && !seenId.has(s) && !isBase44Id(s)) { seenId.add(s); ids.push(s); }
  };
  const sidRaw = String(apt?.servicetitan_technician_id || "").trim();
  if (sidRaw) sidRaw.split(",").forEach((x) => pushId(x));
  const tidRaw = String(apt?.technician_id || "").trim();
  if (tidRaw) tidRaw.split(",").forEach((x) => pushId(x));

  const names: string[] = [];
  const seenName = new Set<string>();
  const pushName = (n: string) => {
    const s = String(n || "").trim();
    if (s && !seenName.has(s)) { seenName.add(s); names.push(s); }
  };
  const snameRaw = String(apt?.servicetitan_technician_name || "").trim();
  if (snameRaw) snameRaw.split(",").forEach((x) => pushName(x));
  else {
    const tnameRaw = String(apt?.technician_name || "").trim();
    if (tnameRaw) tnameRaw.split(",").forEach((x) => pushName(x));
  }
  return { ids, names };
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export async function reconcileAppointmentImport(
  base44: any,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const Svc = base44.asServiceRole.entities;
  const result: ReconcileResult = { processed: 0, updated: 0, skipped: 0, errors: 0, details: [] };

  // Resolve the set of imported jobs to process.
  let jobs: any[] = [];
  if (opts.appointment_id) {
    try {
      const apt: any = await Svc.Appointment.get(opts.appointment_id);
      if (apt && apt.job_id) {
        const job: any = await Svc.Job.get(apt.job_id).catch(() => null);
        if (job) jobs = [job];
      }
    } catch { /* appointment not found */ }
  } else if (opts.job_id) {
    const job: any = await Svc.Job.get(opts.job_id).catch(() => null);
    if (job) jobs = [job];
  } else if (opts.scan) {
    const limit = Math.min(Math.max(opts.scan_limit || 50, 1), 200);
    const recent = await Svc.Job.list("-created_date", 200).catch(() => []);
    // Unreconciled imported jobs: servicetitan_job_id present AND technician_mapping_status blank.
    jobs = recent
      .filter((j: any) => j.servicetitan_job_id && String(j.servicetitan_job_id).trim())
      .filter((j: any) => !j.technician_mapping_status || !String(j.technician_mapping_status).trim())
      .slice(0, limit);
  } else if (opts.repair_blank) {
    // Repair: backfill Jobs with blank Job-level technician fields that have a
    // linked Appointment carrying a technician signal. Driven by recent
    // appointments so we only touch Jobs that actually have tech data to roll up.
    const limit = Math.min(Math.max(opts.scan_limit || 200, 1), 1000);
    const recentApts = await Svc.Appointment.list("-created_date", 1000).catch(() => []);
    const candidateJobIds: string[] = [];
    const seenJob = new Set<string>();
    for (const a of recentApts) {
      const sig = gatherAppointmentTechSignals(a);
      if (sig.ids.length === 0 && sig.names.length === 0) continue;
      const jid = String(a?.job_id || "").trim();
      if (jid && !seenJob.has(jid)) { seenJob.add(jid); candidateJobIds.push(jid); }
    }
    for (const jid of candidateJobIds.slice(0, limit)) {
      const job: any = await Svc.Job.get(jid).catch(() => null);
      if (!job) continue;
      const blankTech =
        !String(job.technician_name || "").trim() &&
        !String(job.lead_technician_name || "").trim() &&
        !(Array.isArray(job.servicetitan_technician_ids) && job.servicetitan_technician_ids.length);
      if (blankTech) jobs.push(job);
    }
  }

  if (jobs.length === 0) return result;

  // Preload registries once for efficient in-memory resolution.
  const employees: any[] = await Svc.EmployeeRegistry.list("-created_date", 1000).catch(() => []);
  const technicians: any[] = await Svc.Technician.list("-created_date", 500).catch(() => []);
  const trucks: any[] = await Svc.TruckProfile.list("-created_date", 200).catch(() => []);

  for (const job of jobs) {
    result.processed++;
    try {
      const updated = await reconcileOneJob(base44, job, employees, technicians, trucks);
      if (updated.changed) {
        result.updated++;
        result.details.push({ job_id: job.id, servicetitan_job_id: job.servicetitan_job_id, fields: updated.fields, appointment_updates: updated.appointmentUpdates, resolution_method: updated.resolutionMethod || null });
      } else {
        result.skipped++;
        result.details.push({ job_id: job.id, servicetitan_job_id: job.servicetitan_job_id, unchanged: true });
      }
    } catch (err) {
      result.errors++;
      result.details.push({ job_id: job.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

async function reconcileOneJob(base44: any, job: any, employees: any[], technicians: any[], trucks: any[]) {
  const Svc = base44.asServiceRole.entities;
  const update: Record<string, any> = {};
  const fields: string[] = [];
  const appointmentUpdates: any[] = [];
  let resolutionMethod: string | null = null;

  // 0. Mirror crm_job_number from servicetitan_job_number when blank.
  if ((!job.crm_job_number || !String(job.crm_job_number).trim()) && job.servicetitan_job_number) {
    update.crm_job_number = job.servicetitan_job_number;
    fields.push("crm_job_number");
  }

  // 1. Location resolution by servicetitan_location_id -> Location.crm_location_id.
  //    Also backfills the real service address when the Job still carries a
  //    placeholder ("Service address pending") or a blank address — so the
  //    Customer Jobs modal and Job Hub never show a pending service address for
  //    a Job whose Location exists. Never creates a Customer or Location.
  const addrPending =
    !job.address || !String(job.address).trim() ||
    String(job.address).trim().toLowerCase() === "service address pending";
  const needsLocLink = (!job.location_id || !String(job.location_id).trim()) && !!job.servicetitan_location_id;
  if ((needsLocLink || addrPending) && job.servicetitan_location_id) {
    try {
      const locs = await Svc.Location.filter({ crm_location_id: String(job.servicetitan_location_id) }, null, 5);
      if (locs.length > 0) {
        const loc = locs[0];
        if (!job.location_id || !String(job.location_id).trim()) {
          update.location_id = loc.id;
          fields.push("location_id");
        }
        if (addrPending) {
          if (loc.address) { update.address = loc.address; fields.push("address"); }
          if (loc.city) { update.city = loc.city; fields.push("city"); }
          if (loc.state) { update.state = loc.state; fields.push("state"); }
          if (loc.zip) { update.zip = loc.zip; fields.push("zip"); }
        }
        if ((!job.servicetitan_location_name || !String(job.servicetitan_location_name).trim()) && loc.location_label) {
          update.servicetitan_location_name = loc.location_label;
          fields.push("servicetitan_location_name");
        }
      }
    } catch { /* location lookup non-blocking */ }
  }

  // 2. Job type mapping (name-based; blank if no mapping)
  if (!job.job_type && job.servicetitan_job_type) {
    const mapped = mapJobType(String(job.servicetitan_job_type));
    if (mapped) {
      update.job_type = mapped;
      fields.push("job_type");
    }
  }

  // 3. Gather imported technician signals from the Job + linked Appointments.
  let stTechIds: string[] = Array.isArray(job.servicetitan_technician_ids) ? [...job.servicetitan_technician_ids] : [];
  let stTechNames: string[] = Array.isArray(job.servicetitan_technician_names) ? [...job.servicetitan_technician_names] : [];

  // Load linked appointments (by local job_id and by servicetitan_job_id).
  let appointments: any[] = [];
  if (job.id) {
    const byLocal = await Svc.Appointment.filter({ job_id: job.id }, "-created_date", 50).catch(() => []);
    appointments = byLocal;
  }
  if (job.servicetitan_job_id) {
    const bySt = await Svc.Appointment.filter({ servicetitan_job_id: job.servicetitan_job_id }, "-created_date", 50).catch(() => []);
    const seen = new Set(appointments.map((a) => a.id));
    for (const a of bySt) if (!seen.has(a.id)) { appointments.push(a); seen.add(a.id); }
  }

  for (const apt of appointments) {
    const sig = gatherAppointmentTechSignals(apt);
    for (const t of sig.ids) if (!stTechIds.includes(t)) stTechIds.push(t);
    for (const n of sig.names) if (!stTechNames.includes(n)) stTechNames.push(n);
  }

  // If no technician signal was found on the Job or its linked Appointments,
  // enrich from ServiceTitan using the same retrieval path as "Refresh from
  // ServiceTitan" (JPM v2 appointment: top-level technician, then
  // appointmentSummaries[0]). Persist the retrieved technician onto each
  // linked Appointment so downstream resolution + dispatch escalation runs.
  if (stTechIds.length === 0 && stTechNames.length === 0) {
    for (const apt of appointments) {
      const stAid = String(apt?.servicetitan_appointment_id || apt?.crm_appointment_id || "").trim();
      if (!stAid) continue;
      try {
        const fetched = await fetchAppointmentTechnician(stAid);
        if (!fetched) continue;
        const aptUpd: Record<string, any> = {};
        if (fetched.technicianId) aptUpd.servicetitan_technician_id = fetched.technicianId;
        if (fetched.technicianName) { aptUpd.servicetitan_technician_name = fetched.technicianName; aptUpd.technician_name = fetched.technicianName; }
        if (Object.keys(aptUpd).length > 0) {
          await Svc.Appointment.update(apt.id, aptUpd);
          appointmentUpdates.push({ appointment_id: apt.id, fields: Object.keys(aptUpd), source: "servicetitan_enrichment" });
          if (fetched.technicianId && !stTechIds.includes(fetched.technicianId)) stTechIds.push(fetched.technicianId);
          if (fetched.technicianName && !stTechNames.includes(fetched.technicianName)) stTechNames.push(fetched.technicianName);
        }
      } catch (enrichErr) {
        console.error("[RECONCILE] ST technician enrichment failed for appointment", apt?.id, enrichErr instanceof Error ? enrichErr.message : String(enrichErr));
      }
    }
  }

  // Roll up the linked ServiceTitan appointment IDs onto the Job so the Job
  // references every linked Appointment (idempotent; order preserved).
  const stApptIds: string[] = [];
  const seenAid = new Set<string>();
  for (const apt of appointments) {
    const aid = String(apt?.servicetitan_appointment_id || "").trim();
    if (aid && !seenAid.has(aid)) { seenAid.add(aid); stApptIds.push(aid); }
  }
  if (stApptIds.length > 0 && !arraysEqual(stApptIds, Array.isArray(job.servicetitan_appointment_ids) ? job.servicetitan_appointment_ids : [])) {
    update.servicetitan_appointment_ids = stApptIds;
    fields.push("servicetitan_appointment_ids");
  }

  const hasImportedTech = stTechIds.length > 0 || stTechNames.length > 0;
  const manualOverride = !!(job.lead_technician_email && String(job.lead_technician_email).trim());

  if (hasImportedTech) {
    // Propagate ST-owned display arrays onto the Job.
    if (!arraysEqual(stTechIds, job.servicetitan_technician_ids)) {
      update.servicetitan_technician_ids = stTechIds;
      fields.push("servicetitan_technician_ids");
    }
    if (!arraysEqual(stTechNames, job.servicetitan_technician_names)) {
      update.servicetitan_technician_names = stTechNames;
      fields.push("servicetitan_technician_names");
    }

    // dispatch_status = assigned whenever at least one ServiceTitan technician
    // ID is present across the linked Appointments (manual LVC statuses are
    // never downgraded). When no technician IDs exist, unassigned is retained.
    if (stTechIds.length > 0) {
      const cur = job.dispatch_status || "";
      if (cur === "" || cur === "unassigned") {
        update.dispatch_status = "assigned";
        if (!fields.includes("dispatch_status")) fields.push("dispatch_status");
      }
    }

    if (!manualOverride) {
      const primaryStId = stTechIds[0] || "";
      const primaryName = stTechNames[0] || "";
      const mapping: any = resolveTechInMemory(employees, technicians, primaryStId, primaryName, "");

      if (mapping.status === "matched") {
        resolutionMethod = mapping.resolutionMethod || null;
        update.lead_technician_email = mapping.employeeEmail;
        update.lead_technician_name = mapping.employeeName;
        update.technician_email = mapping.employeeEmail;
        update.technician_name = mapping.employeeName;
        update.technician_emails = [mapping.employeeEmail];
        update.technician_mapping_status = "matched";
        update.technician_mapping_warning = mapping.warning || "";
        fields.push("lead_technician_email", "lead_technician_name", "technician_email", "technician_name", "technician_emails", "technician_mapping_status", "technician_mapping_warning");

        // (Job-level dispatch escalation is handled above, keyed on stTechIds.)

        // Auto-assign the technician's registered truck when no manual override.
        const emp = employees.find((e) => e.id === mapping.employeeRegistryId);
        if (emp && emp.assigned_truck && String(emp.assigned_truck).trim() && !job.truck_override_used && !job.assigned_truck_id) {
          const truckNum = String(emp.assigned_truck).trim();
          const truck = trucks.find((t) => String(t.truck_number || "") === truckNum);
          update.auto_assigned_truck = truckNum;
          update.truck_assignment_source = "employee_registry";
          update.truck_assignment_status = "Auto Assigned";
          fields.push("auto_assigned_truck", "truck_assignment_source", "truck_assignment_status");
          if (truck) {
            update.assigned_truck_id = truck.id;
            update.assigned_truck_number = truck.truck_number;
            fields.push("assigned_truck_id", "assigned_truck_number");
          }
        }

        // Link appointments to the resolved EmployeeRegistry.
        for (const apt of appointments) {
          const aptUpd: Record<string, any> = {
            technician_id: mapping.employeeRegistryId,
            technician_email: mapping.employeeEmail,
            technician_name: mapping.employeeName,
            technician_mapping_status: "matched",
            technician_mapping_warning: mapping.warning || "",
          };
          if (!apt.dispatch_status || apt.dispatch_status === "unassigned") aptUpd.dispatch_status = "assigned";
          try {
            await Svc.Appointment.update(apt.id, aptUpd);
            appointmentUpdates.push({ appointment_id: apt.id, fields: Object.keys(aptUpd) });
          } catch (e) {
            console.error("[RECONCILE] Appointment technician-link update failed:", { job_id: job.id, appointment_id: apt.id, error: e instanceof Error ? e.message : String(e) });
          }
        }
      } else {
        // Unmatched: record diagnostic, keep imported display name, do NOT escalate dispatch.
        const warning = mapping.warning || `Unable to resolve technician '${primaryName || "N/A"}' (ST technician ID: ${primaryStId || "N/A"}).`;
        update.technician_name = stTechNames.join(", ") || job.technician_name || "";
        update.technician_mapping_status = "unmatched";
        update.technician_mapping_warning = warning;
        fields.push("technician_name", "technician_mapping_status", "technician_mapping_warning");

        for (const apt of appointments) {
          try {
            await Svc.Appointment.update(apt.id, {
              technician_mapping_status: "unmatched",
              technician_mapping_warning: warning,
            });
            appointmentUpdates.push({ appointment_id: apt.id, fields: ["technician_mapping_status", "technician_mapping_warning"] });
          } catch (e) {
            console.error("[RECONCILE] Appointment unmatched-mapping update failed:", { job_id: job.id, appointment_id: apt.id, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    }
    // If manualOverride: preserve LVC assignment. Still propagate ST display arrays (above) only if blank.
  } else {
    // No imported technician — mark as assessed/unassigned so the scan is idempotent.
    if (!job.technician_mapping_status || !String(job.technician_mapping_status).trim()) {
      update.technician_mapping_status = "unassigned";
      update.technician_mapping_warning = "";
      fields.push("technician_mapping_status", "technician_mapping_warning");
    }
  }

  let changed = false;
  if (fields.length > 0) {
    try {
      await Svc.Job.update(job.id, update);
      changed = true;
    } catch (err) {
      throw err;
    }
  }

  return { changed, fields, appointmentUpdates, resolutionMethod };
}