import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { reconcileAppointmentImport } from "../../shared/appointmentReconciler.ts";

/**
 * Post-import reconciliation endpoint for ServiceTitan/Zapier-imported Jobs.
 *
 * Idempotent. Fills blank Job fields (location_id, job_type, technician
 * assignment, dispatch escalation, crm_job_number mirror) and links Appointment
 * technician mapping — for records created by direct Zapier "Create Record"
 * actions that bypass backend ingestion.
 *
 * Invocation modes:
 *   - On-demand:  POST { "job_id": "<id>" } or { "appointment_id": "<id>" }
 *   - Scan:       POST { "scan": true, "scan_limit": 50 }  (scheduled automation)
 *
 * Never creates a Job, Appointment, Customer, Location, Technician, or
 * EmployeeRegistry record. Preserves LVC-owned manual assignments and overrides.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const opts = {
      job_id: body.job_id || undefined,
      appointment_id: body.appointment_id || undefined,
      scan: body.scan === true,
      scan_limit: body.scan_limit ? Number(body.scan_limit) : undefined,
      repair_blank: body.repair_blank === true,
    };

    const result = await reconcileAppointmentImport(base44, opts);
    return Response.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RECONCILE APPOINTMENT IMPORT ERROR]", msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
});