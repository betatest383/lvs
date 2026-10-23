import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { requireCrmWebhook } from "../../shared/securityAuth.ts";
import { reconcileAppointmentImport } from "../../shared/appointmentReconciler.ts";

/**
 * Zapier → LVC OS Appointment Partial-Update Receiver
 *
 * Authenticated Zapier ingress endpoint that performs a PARTIAL UPDATE of an
 * existing Base44 Appointment record. It never creates a Customer, Job, or
 * Appointment — every referenced ID is validated to exist before any write.
 *
 * Security:
 *   - POST only
 *   - Content-Type: application/json required
 *   - Authenticates via X-CRM-Webhook-Secret header against CRM_WEBHOOK_SECRET
 *     (constant-time comparison via securityAuth.requireCrmWebhook)
 *   - Fail-closed if the environment secret is absent
 *   - Never accepts auth from URL, query string, or body
 *   - Never logs or returns the secret
 *
 * Contract:
 *   Request body:
 *     {
 *       "appointment_id": "<Base44 Appointment ID>",
 *       "data": {
 *         "job_id":            "<Base44 Job ID>",
 *         "customer_id":       "<Base44 Customer ID>",
 *         "crm_appointment_id":"<ServiceTitan appointment ID>",
 *         "technician_name":   "comma-separated names",
 *         "technician_id":     "comma-separated IDs"
 *       }
 *     }
 *   - Only fields present in `data` are written (partial update).
 *   - `appointment_id` and `data` are required.
 *   - All provided IDs are validated to reference existing records; a missing
 *     Appointment returns 404, a missing/invalid Job or Customer returns 422.
 *   - technician_name / technician_id are normalized to unique comma-separated
 *     values (duplicate tokens removed, order preserved).
 */

const SECRET_HEADER = "X-CRM-Webhook-Secret";

/** Allowed partial-update fields on the Appointment entity. */
const ALLOWED_FIELDS = [
  "job_id",
  "customer_id",
  "crm_appointment_id",
  "servicetitan_appointment_id",
  "technician_name",
  "technician_id",
  "scheduled_start",
  "scheduled_end",
  "status",
];

/** Dedupe comma-separated tokens, preserving first-seen order. Empty/blank tokens dropped. */
function dedupeCsv(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;
  const tokens = raw.split(",").map(t => t.trim()).filter(t => t.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out.join(",");
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let stage = "request";
  try {
    // ── Method ──
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed", stage }, { status: 405 });
    }

    // ── Content-Type ──
    const contentTypeRaw = req.headers.get("content-type") || "";
    const contentType = contentTypeRaw.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return Response.json({ error: "Unsupported Media Type — Content-Type must be application/json", stage }, { status: 415 });
    }

    // ── Authentication (X-CRM-Webhook-Secret against CRM_WEBHOOK_SECRET) ──
    stage = "auth";
    const auth = requireCrmWebhook(req);
    if (auth.error) {
      // requireCrmWebhook returns 500 (unconfigured) or 403 (bad/missing secret)
      return auth.error;
    }

    // ── Parse body ──
    stage = "parse";
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Malformed JSON — request body is not valid JSON", stage }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid request body — JSON root must be an object", stage }, { status: 400 });
    }

    // ── appointment_id ──
    stage = "validate_appointment_id";
    const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id.trim() : "";
    if (!appointmentId) {
      return Response.json({ error: "appointment_id is required", stage }, { status: 422 });
    }

    // ── data ──
    stage = "validate_data";
    const data = body.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ error: "data object is required", stage }, { status: 422 });
    }

    // Build the partial-update payload from allowed fields only.
    const update: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in data) {
        const val = (data as any)[field];
        if (val !== undefined && val !== null) {
          update[field] = typeof val === "string" ? val.trim() : val;
        }
      }
    }

    // technician_name / technician_id → dedupe comma-separated tokens.
    if ("technician_name" in data) {
      const norm = dedupeCsv(data.technician_name);
      if (norm !== undefined) update.technician_name = norm;
    }
    if ("technician_id" in data) {
      const norm = dedupeCsv(data.technician_id);
      if (norm !== undefined) update.technician_id = norm;
    }

    // Preserve raw ServiceTitan technician IDs/names in the dedicated ST fields
    // so post-import reconciliation (appointmentReconciler) can roll them up
    // onto the linked Job even after a later reconcile overwrites technician_id
    // with the resolved EmployeeRegistry id. technician_id/technician_name are
    // still saved exactly as supplied ("as it does now").
    if (update.technician_id !== undefined) update.servicetitan_technician_id = update.technician_id;
    if (update.technician_name !== undefined) update.servicetitan_technician_name = update.technician_name;

    // Keep the ServiceTitan appointment ID consistent across both fields.
    // crm_appointment_id is the legacy alias for servicetitan_appointment_id;
    // when the caller supplies one, mirror it into the other so Zapier's
    // "ServiceTitan Appointment ID Filter" always resolves against a populated
    // servicetitan_appointment_id.
    {
      const crm = typeof update.crm_appointment_id === "string" ? update.crm_appointment_id.trim() : update.crm_appointment_id;
      const st  = typeof update.servicetitan_appointment_id === "string" ? update.servicetitan_appointment_id.trim() : update.servicetitan_appointment_id;
      if (crm && !st) update.servicetitan_appointment_id = crm;
      else if (st && !crm) update.crm_appointment_id = st;
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ error: "data must contain at least one updatable field (job_id, customer_id, crm_appointment_id, servicetitan_appointment_id, technician_name, technician_id, scheduled_start, scheduled_end, status)", stage }, { status: 422 });
    }

    // ── Validate the Appointment exists (never create) ──
    stage = "lookup_appointment";
    let appointment: any = null;
    try {
      appointment = await base44.asServiceRole.entities.Appointment.get(appointmentId);
    } catch {
      return Response.json({ error: "Appointment not found — creation is not permitted by this endpoint", appointment_id: appointmentId, stage }, { status: 404 });
    }
    if (!appointment) {
      return Response.json({ error: "Appointment not found — creation is not permitted by this endpoint", appointment_id: appointmentId, stage }, { status: 404 });
    }

    // ── Validate job_id references an existing Job (never create) ──
    if (update.job_id !== undefined) {
      stage = "validate_job_id";
      if (typeof update.job_id !== "string" || !update.job_id.trim()) {
        return Response.json({ error: "job_id is required and must be a non-empty string", stage }, { status: 422 });
      }
      let job: any = null;
      try {
        job = await base44.asServiceRole.entities.Job.get(update.job_id);
      } catch { /* not found */ }
      if (!job) {
        return Response.json({ error: "Job not found — creation is not permitted by this endpoint", job_id: update.job_id, stage }, { status: 422 });
      }
    }

    // ── Validate customer_id references an existing Customer (never create) ──
    if (update.customer_id !== undefined) {
      stage = "validate_customer_id";
      if (typeof update.customer_id !== "string" || !update.customer_id.trim()) {
        return Response.json({ error: "customer_id is required and must be a non-empty string", stage }, { status: 422 });
      }
      let customer: any = null;
      try {
        customer = await base44.asServiceRole.entities.Customer.get(update.customer_id);
      } catch { /* not found */ }
      if (!customer) {
        return Response.json({ error: "Customer not found — creation is not permitted by this endpoint", customer_id: update.customer_id, stage }, { status: 422 });
      }
    }

    // ── Partial update (native Appointment.update) ──
    stage = "update";
    const updated = await base44.asServiceRole.entities.Appointment.update(appointmentId, update);

    // ── Post-import reconciliation: propagate imported technician/location/job-type
    // onto the linked Job and set appointment mapping status. Idempotent; preserves
    // manual LVC overrides. Runs after every Zapier appointment update.
    try {
      await reconcileAppointmentImport(base44, { appointment_id: appointmentId });
    } catch (reconcileErr) {
      console.error("[ZAPIER APPOINTMENT RECONCILE ERROR]", reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr));
      // Non-blocking — the appointment update itself succeeded.
    }

    return Response.json({
      success: true,
      action: "updated",
      appointment_id: appointmentId,
      updated_fields: Object.keys(update),
      updated_at: new Date().toISOString(),
      appointment: {
        id: updated?.id ?? appointmentId,
        job_id: updated?.job_id ?? appointment.job_id,
        customer_id: updated?.customer_id ?? appointment.customer_id,
        crm_appointment_id: updated?.crm_appointment_id ?? appointment.crm_appointment_id,
        servicetitan_appointment_id: updated?.servicetitan_appointment_id ?? appointment.servicetitan_appointment_id,
        scheduled_start: updated?.scheduled_start ?? appointment.scheduled_start ?? null,
        scheduled_end: updated?.scheduled_end ?? appointment.scheduled_end ?? null,
        status: updated?.status ?? appointment.status ?? null,
        technician_name: updated?.technician_name ?? appointment.technician_name ?? null,
        technician_id: updated?.technician_id ?? appointment.technician_id ?? null,
      },
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ZAPIER APPOINTMENT UPSERT ERROR]", { stage, message });
    return Response.json({ error: "Internal server error", stage }, { status: 500 });
  }
});