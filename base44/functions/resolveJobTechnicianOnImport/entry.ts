import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { resolveTechnician, buildUnmatchedWarning } from "../../shared/technicianResolver.ts";

/**
 * Live import hook: automatically resolve the imported ServiceTitan technician
 * on a freshly created Job (the Zapier "Create Entity: Job" path).
 *
 * Triggered by the Job entity "create" automation — never from Job Hub rendering
 * and never through a manual admin backfill. Runs only for imported jobs
 * (servicetitan_job_id present) that have no manual lead_technician_email and a
 * blank/unassigned dispatch_status. Reuses the shared resolution rules; never
 * creates a Job, Appointment, Technician, or EmployeeRegistry record; never
 * overwrites a manual LVC assignment or a non-unassigned LVC dispatch status.
 *
 * On a successful match, updates ONLY the newly created Job with:
 *   lead_technician_email, lead_technician_name, technician_email,
 *   technician_name, technician_emails, technician_mapping_status=matched,
 *   empty technician_mapping_warning, and dispatch_status=assigned only when
 *   its current value is blank or "unassigned".
 *
 * On failure: leaves dispatch_status unassigned and records
 *   technician_mapping_status=unmatched plus a diagnostic warning.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let payload: any = {};
    try { payload = await req.json(); } catch { payload = {}; }

    const entityId: string = payload?.event?.entity_id || payload?.entity_id || "";
    if (!entityId) return Response.json({ skipped: true, reason: "no entity_id" });

    let data: any = payload?.data || null;
    if (!data) {
      data = await base44.asServiceRole.entities.Job.get(entityId).catch(() => null);
    }
    if (!data) return Response.json({ skipped: true, reason: "job not found" });

    // Only imported jobs (Zapier-created ServiceTitan jobs)
    if (!data.servicetitan_job_id) {
      return Response.json({ skipped: true, reason: "not an imported job" });
    }

    // Preserve manual LVC assignments
    if (data.lead_technician_email && String(data.lead_technician_email).trim()) {
      return Response.json({ skipped: true, reason: "already linked" });
    }
    const currentDispatch = data.dispatch_status || "";
    if (currentDispatch && currentDispatch !== "unassigned") {
      return Response.json({ skipped: true, reason: "manual dispatch status preserved" });
    }

    // Imported technician identity (Job display field + ST arrays)
    const techName = (
      data.technician_name ||
      (Array.isArray(data.servicetitan_technician_names) ? data.servicetitan_technician_names.join(", ") : "") ||
      ""
    ).trim();
    const stTechId = (
      Array.isArray(data.servicetitan_technician_ids)
        ? data.servicetitan_technician_ids[0] || ""
        : data.servicetitan_technician_ids || ""
    ).trim();
    if (!techName && !stTechId) {
      return Response.json({ skipped: true, reason: "no imported technician" });
    }

    const technicians = await base44.asServiceRole.entities.Technician.list("-created_date", 500);
    const employees = await base44.asServiceRole.entities.EmployeeRegistry.list("-created_date", 500);

    let r = resolveTechnician(technicians, employees, stTechId, data.technician_email || "", techName);
    if (!r && techName.includes(",")) {
      r = resolveTechnician(technicians, employees, stTechId, data.technician_email || "", techName.split(",")[0].trim());
    }

    if (r) {
      const jobUpdate: any = {
        lead_technician_email: r.email,
        lead_technician_name: r.name,
        technician_email: r.email,
        technician_name: r.name,
        technician_emails: [r.email],
        technician_mapping_status: "matched",
        technician_mapping_warning: "",
      };
      if (currentDispatch === "" || currentDispatch === "unassigned") {
        jobUpdate.dispatch_status = "assigned";
      }
      await base44.asServiceRole.entities.Job.update(entityId, jobUpdate);
      return Response.json({
        resolved: true,
        job_id: entityId,
        servicetitan_job_id: data.servicetitan_job_id,
        email: r.email,
        name: r.name,
        fields_updated: Object.keys(jobUpdate),
      });
    }

    const warning = buildUnmatchedWarning(techName, stTechId);
    await base44.asServiceRole.entities.Job.update(entityId, {
      technician_mapping_status: "unmatched",
      technician_mapping_warning: warning,
    });
    return Response.json({
      resolved: false,
      job_id: entityId,
      servicetitan_job_id: data.servicetitan_job_id,
      warning,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
});