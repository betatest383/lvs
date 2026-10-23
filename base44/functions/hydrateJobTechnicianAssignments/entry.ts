import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { resolveTechnician, buildUnmatchedWarning } from "../../shared/technicianResolver.ts";

/**
 * Backfill: resolve ServiceTitan-imported technicians on existing Appointment
 * (and parent Job) records to the internal Technician / EmployeeRegistry,
 * without overwriting manually assigned technicians.
 *
 * Resolution priority (requirement 5):
 *   1. Exact ServiceTitan technician ID  → Technician.technician_id
 *   2. Exact normalized email              → Technician.email / EmployeeRegistry.email
 *   3. Exact normalized full name          → single unambiguous match only
 *
 * When resolved, writes the EmployeeRegistry ID into Appointment.technician_id
 * (the relationship the Assignment panel reads) and the resolved email into
 * Appointment.technician_email (the dropdown key). Sets dispatch_status=assigned
 * and technician_mapping_status=matched. Also populates the parent Job's
 * lead_technician_email/name and dispatch_status ONLY when the job has no
 * existing manual assignment.
 *
 * When unresolved, sets technician_mapping_status=unmatched with a warning
 * carrying the imported name + ST technician ID. Never creates a Technician,
 * EmployeeRegistry, Job, or Appointment record.
 *
 * Authorization: admin/owner only. Does not touch webhook/Zapier/sync paths.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* not authenticated */ }
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin or owner access required" }, { status: 403 });
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const targetJobId: string = body.job_id || "";

    // ── Load internal registries once ──
    const technicians: any[] = await base44.asServiceRole.entities.Technician.list("-created_date", 500);
    const employees: any[] = await base44.asServiceRole.entities.EmployeeRegistry.list("-created_date", 500);



    // ── Gather appointments needing hydration ──
    let apts: any[] = [];
    if (targetJobId) {
      const byLocal = await base44.asServiceRole.entities.Appointment.filter({ job_id: targetJobId }, null, 200).catch(() => []);
      apts = byLocal;
      const job: any = await base44.asServiceRole.entities.Job.get(targetJobId).catch(() => null);
      if (job?.servicetitan_job_id) {
        const bySt = await base44.asServiceRole.entities.Appointment.filter({ servicetitan_job_id: job.servicetitan_job_id }, null, 200).catch(() => []);
        const seen = new Set(apts.map((a) => a.id));
        for (const a of bySt) if (!seen.has(a.id)) { apts.push(a); seen.add(a.id); }
      }
    } else {
      apts = await base44.asServiceRole.entities.Appointment.filter({ appointment_source: "crm" }, "-created_date", 500).catch(() => []);
    }

    let processed = 0, resolved = 0, skipped = 0, alreadyLinked = 0, errors = 0;
    const details: any[] = [];
    const jobCache: Record<string, any> = {};

    for (const apt of apts) {
      processed++;
      const techName = (apt.servicetitan_technician_name || apt.technician_name || "").trim();
      const stTechId = (apt.servicetitan_technician_id || "").trim();
      const hasImportedTech = !!(techName || stTechId);
      const linked = !!(apt.technician_email && apt.technician_email.trim());

      if (!hasImportedTech) { skipped++; continue; }
      if (linked) { alreadyLinked++; continue; }

      const r = resolveTechnician(technicians, employees, stTechId, apt.technician_email || "", techName);

      if (r) {
        try {
          await base44.asServiceRole.entities.Appointment.update(apt.id, {
            technician_id: r.employeeRegistryId,
            technician_email: r.email,
            technician_name: r.name,
            dispatch_status: "assigned",
            technician_mapping_status: "matched",
            technician_mapping_warning: "",
          });
          resolved++;

          // Update parent job (only if not already manually assigned)
          const stJobId = apt.servicetitan_job_id;
          if (stJobId) {
            let job = jobCache[stJobId];
            if (!job) {
              const jobs = await base44.asServiceRole.entities.Job.filter({ servicetitan_job_id: stJobId }, null, 1).catch(() => []);
              if (jobs.length) { job = jobs[0]; jobCache[stJobId] = job; }
            }
            if (job && !job.lead_technician_email && !job.technician_email) {
              await base44.asServiceRole.entities.Job.update(job.id, {
                lead_technician_email: r.email,
                lead_technician_name: r.name,
                technician_email: r.email,
                technician_name: r.name,
                dispatch_status: "assigned",
              });
            }
          }
          details.push({ appointment_id: apt.id, servicetitan_appointment_id: apt.servicetitan_appointment_id, resolved: true, email: r.email, name: r.name });
        } catch (e) {
          errors++;
          details.push({ appointment_id: apt.id, error: e instanceof Error ? e.message : String(e) });
        }
      } else {
        const warning = buildUnmatchedWarning(techName, stTechId);
        try {
          await base44.asServiceRole.entities.Appointment.update(apt.id, {
            technician_mapping_status: "unmatched",
            technician_mapping_warning: warning,
          });
          details.push({ appointment_id: apt.id, servicetitan_appointment_id: apt.servicetitan_appointment_id, resolved: false, warning });
        } catch (e) {
          errors++;
          details.push({ appointment_id: apt.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    // ── Job-level pass: imported jobs with a technician name but NO appointment ──
    // Some ServiceTitan-imported jobs carry the technician name only on the Job
    // display field (technician_name) and never received a linked Appointment.
    // The Assignment panel reads Appointment fields first, then falls back to
    // Job.lead_technician_email / Job.dispatch_status. When there is no
    // appointment, resolve the imported name / ST technician ID to the internal
    // EmployeeRegistry and write the canonical assignment onto the Job itself.
    // Only imported jobs (servicetitan_job_id present) are touched, and only when
    // no manual lead_technician_email already exists.
    let jobProcessed = 0, jobResolved = 0, jobUnmatched = 0, jobSkipped = 0, jobErrors = 0;
    const jobDetails: any[] = [];

    let allJobs: any[] = [];
    if (targetJobId) {
      const one = await base44.asServiceRole.entities.Job.get(targetJobId).catch(() => null);
      if (one) allJobs = [one];
    } else {
      allJobs = await base44.asServiceRole.entities.Job.list("-created_date", 1000).catch(() => []);
    }
    const jobAptCache: Record<string, boolean> = {};

    for (const job of allJobs) {
      jobProcessed++;
      if (!job.servicetitan_job_id) { jobSkipped++; continue; }

      const techName = (job.technician_name || (Array.isArray(job.servicetitan_technician_names) ? job.servicetitan_technician_names.join(", ") : "") || "").trim();
      const stTechId = (Array.isArray(job.servicetitan_technician_ids) ? (job.servicetitan_technician_ids[0] || "") : (job.servicetitan_technician_ids || "")).trim();
      const hasImportedTech = !!(techName || stTechId);
      const alreadyLinked = !!(job.lead_technician_email && job.lead_technician_email.trim());

      if (!hasImportedTech) { jobSkipped++; continue; }
      if (alreadyLinked) { jobSkipped++; continue; }

      // Skip jobs that already have a linked appointment (appointment pass owns those)
      let hasApt = jobAptCache[job.servicetitan_job_id];
      if (hasApt === undefined) {
        const a = await base44.asServiceRole.entities.Appointment.filter({ servicetitan_job_id: job.servicetitan_job_id }, null, 1).catch(() => []);
        hasApt = a.length > 0; jobAptCache[job.servicetitan_job_id] = hasApt;
      }
      if (hasApt) { jobSkipped++; continue; }

      // Resolve — full name first, then first comma-separated part
      let r = resolveTechnician(technicians, employees, stTechId, job.technician_email || "", techName);
      if (!r && techName.includes(",")) {
        r = resolveTechnician(technicians, employees, stTechId, job.technician_email || "", techName.split(",")[0].trim());
      }

      if (r) {
        try {
          const jobUpdate: any = {
            lead_technician_email: r.email,
            lead_technician_name: r.name,
            technician_email: r.email,
            technician_name: r.name,
            technician_emails: [r.email],
            technician_mapping_status: "matched",
            technician_mapping_warning: "",
          };
          // Only escalate dispatch_status when it is not a manual LVC-owned status
          if (job.dispatch_status === "unassigned" || !job.dispatch_status) {
            jobUpdate.dispatch_status = "assigned";
          }
          await base44.asServiceRole.entities.Job.update(job.id, jobUpdate);
          jobResolved++;
          jobDetails.push({ job_id: job.id, servicetitan_job_id: job.servicetitan_job_id, resolved: true, email: r.email, name: r.name, fields_updated: Object.keys(jobUpdate) });
        } catch (e) {
          jobErrors++;
          jobDetails.push({ job_id: job.id, error: e instanceof Error ? e.message : String(e) });
        }
      } else {
        const warning = buildUnmatchedWarning(techName, stTechId);
        try {
          await base44.asServiceRole.entities.Job.update(job.id, {
            technician_mapping_status: "unmatched",
            technician_mapping_warning: warning,
          });
          jobUnmatched++;
          jobDetails.push({ job_id: job.id, servicetitan_job_id: job.servicetitan_job_id, resolved: false, warning });
        } catch (e) {
          jobErrors++;
          jobDetails.push({ job_id: job.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    return Response.json({
      success: true,
      // Appointment pass
      processed,
      resolved,
      skipped,
      already_linked: alreadyLinked,
      errors,
      details: details.slice(0, 50),
      // Job pass (imported jobs with no appointment)
      job_pass: {
        processed: jobProcessed,
        resolved: jobResolved,
        unmatched: jobUnmatched,
        skipped: jobSkipped,
        errors: jobErrors,
        details: jobDetails.slice(0, 50),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
});