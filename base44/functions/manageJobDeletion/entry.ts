import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * Secure Job Soft-Delete / Restore — LVC OS
 *
 * Owner/Admin-only endpoint that soft-deletes or restores a Job in LVC OS.
 *
 * Behavior:
 *   - Soft delete only. Never physically deletes the Job record.
 *   - Sets LVC-owned deletion fields (is_deleted, deleted_at, deleted_by,
 *     deleted_by_name, deletion_reason). Never touches ServiceTitan-owned
 *     deletion fields (servicetitan_deleted*).
 *   - Preserves all related appointments, assignments, tasks, estimates,
 *     invoices, inspections, documents, workflow history, KPIs, and audit
 *     history. No cascade deletes.
 *   - Does NOT send any delete/cancel request to ServiceTitan or Zapier.
 *   - Writes a permanent JobActivityLog audit record for both delete and
 *     restore (event_type job_deleted / job_restored).
 *
 * Authorization (backend-enforced):
 *   - base44.auth.me() required (401 if absent).
 *   - user.role must be 'admin' or 'owner' (403 otherwise).
 *
 * Payload:
 *   { action: "delete" | "restore", job_id: string, reason?: string }
 */
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin or owner access required" }, { status: 403 });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = body?.action;
    const jobId = typeof body?.job_id === "string" ? body.job_id.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (action !== "delete" && action !== "restore") {
      return Response.json({ error: 'Invalid action — must be "delete" or "restore"' }, { status: 400 });
    }
    if (!jobId) {
      return Response.json({ error: "job_id is required" }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const actorName = user.full_name || user.email || user.id;
    const jobNumber = job.crm_job_number || job.servicetitan_job_number || "";

    if (action === "delete") {
      if (job.is_deleted) {
        return Response.json({ success: true, already_deleted: true, job_id: jobId });
      }
      await base44.asServiceRole.entities.Job.update(jobId, {
        is_deleted: true,
        deleted_at: now,
        deleted_by: user.id,
        deleted_by_name: actorName,
        deletion_reason: reason,
      });
      await base44.asServiceRole.entities.JobActivityLog.create({
        job_id: jobId,
        job_number: jobNumber,
        customer_name: job.customer_name || "",
        event_type: "job_deleted",
        event_label: `Job deleted by ${actorName}`,
        event_details: JSON.stringify({
          servicetitan_job_id: job.servicetitan_job_id || null,
          reason,
          deleted_by: user.id,
          deleted_by_name: actorName,
          deleted_at: now,
        }),
        performed_by: actorName,
        timestamp: now,
      });
      return Response.json({ success: true, deleted: true, job_id: jobId, deleted_at: now });
    }

    // action === "restore"
    if (!job.is_deleted) {
      return Response.json({ success: true, already_active: true, job_id: jobId });
    }
    await base44.asServiceRole.entities.Job.update(jobId, {
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      deleted_by_name: null,
      deletion_reason: null,
    });
    await base44.asServiceRole.entities.JobActivityLog.create({
      job_id: jobId,
      job_number: jobNumber,
      customer_name: job.customer_name || "",
      event_type: "job_restored",
      event_label: `Job restored by ${actorName}`,
      event_details: JSON.stringify({
        servicetitan_job_id: job.servicetitan_job_id || null,
        prior_deleted_at: job.deleted_at || null,
        prior_deleted_by: job.deleted_by || null,
        prior_deleted_by_name: job.deleted_by_name || null,
        prior_deletion_reason: job.deletion_reason || null,
        restored_by: user.id,
        restored_by_name: actorName,
        restored_at: now,
      }),
      performed_by: actorName,
      timestamp: now,
    });
    return Response.json({ success: true, restored: true, job_id: jobId, restored_at: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[manageJobDeletion error]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}