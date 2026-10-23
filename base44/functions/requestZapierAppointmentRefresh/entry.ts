import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { secrets } from "base44:runtime";
import { requireAdminOrOwner } from "../../shared/securityAuth.ts";

/**
 * Manual "Refresh from ServiceTitan" trigger for a single Appointment.
 *
 * Loads an existing Base44 Appointment by record ID (server-side), requires its
 * servicetitan_appointment_id, and POSTs a single request to the configured
 * Zapier Catch Hook asking Zapier to re-publish the appointment's current
 * ServiceTitan state. The inbound Zapier update then flows back through
 * upsertZapierAppointment, which performs the actual partial update.
 *
 * Security:
 *   - POST only; Content-Type: application/json required.
 *   - Admin/Owner only (requireAdminUser). 403 otherwise.
 *   - Reads ZAPIER_MANUAL_REFRESH_HOOK_URL and ZAPIER_MANUAL_REFRESH_KEY from
 *     server-side secrets. These values are NEVER returned, logged, or sent
 *     anywhere except the single POST body to the hook URL.
 *   - The refresh key is included in the POST body as `refresh_key` for Zapier
 *     to authorize the request; it is never echoed in the response.
 *
 * Contract:
 *   Request body: { "appointment_id": "<Base44 Appointment record ID>" }
 *   Response (200): { success: true, message: "...", servicetitan_appointment_id: "..." }
 *   Response (4xx/5xx): { error: "<safe message>" }
 *
 * This function performs NO writes to Customers, Jobs, or Appointments.
 */

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

    // ── Authorization (admin/owner only) ──
    stage = "auth";
    const auth = await requireAdminOrOwner(base44);
    if (auth.error) {
      return auth.error; // 401 or 403
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

    // ── appointment_id (Base44 record ID) ──
    stage = "validate_appointment_id";
    const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id.trim() : "";
    if (!appointmentId) {
      return Response.json({ error: "appointment_id is required", stage }, { status: 422 });
    }

    // ── Load the Appointment (server-side, service role) ──
    stage = "load_appointment";
    let appointment: any = null;
    try {
      appointment = await base44.asServiceRole.entities.Appointment.get(appointmentId);
    } catch {
      return Response.json({ error: "Appointment not found", appointment_id: appointmentId, stage }, { status: 404 });
    }
    if (!appointment) {
      return Response.json({ error: "Appointment not found", appointment_id: appointmentId, stage }, { status: 404 });
    }

    // ── Require servicetitan_appointment_id ──
    stage = "validate_st_id";
    const stAppointmentId = typeof appointment.servicetitan_appointment_id === "string"
      ? appointment.servicetitan_appointment_id.trim()
      : "";
    if (!stAppointmentId) {
      return Response.json({
        error: "This appointment has no ServiceTitan appointment ID and cannot be refreshed from ServiceTitan.",
        appointment_id: appointmentId,
        stage,
      }, { status: 422 });
    }

    // ── Read secrets ──
    stage = "read_secrets";
    const hookUrl = (secrets.get("ZAPIER_MANUAL_REFRESH_HOOK_URL") || "").trim();
    const refreshKey = (secrets.get("ZAPIER_MANUAL_REFRESH_KEY") || "").trim();
    if (!hookUrl || !refreshKey) {
      // Never reveal which one is missing.
      return Response.json({
        error: "Manual refresh is not configured. Ask an admin to set the Zapier refresh hook URL and key.",
        stage,
      }, { status: 500 });
    }

    // ── POST to the Zapier Catch Hook ──
    stage = "post_zapier";
    let zapierRes: Response;
    try {
      zapierRes = await fetch(hookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: stAppointmentId,
          refresh_key: refreshKey,
        }),
      });
    } catch (networkErr) {
      // Do not leak the hook URL or key in the message.
      return Response.json({
        error: "Unable to reach the Zapier refresh hook. Please try again in a moment.",
        servicetitan_appointment_id: stAppointmentId,
        stage,
      }, { status: 502 });
    }

    // ── Treat any non-2xx as an error ──
    if (!zapierRes.ok) {
      return Response.json({
        error: `Zapier rejected the refresh request (HTTP ${zapierRes.status}). No appointment data was changed.`,
        servicetitan_appointment_id: stAppointmentId,
        stage,
      }, { status: 502 });
    }

    return Response.json({
      success: true,
      message: "Refresh request sent to Zapier. The appointment will update shortly when ServiceTitan republishes it.",
      servicetitan_appointment_id: stAppointmentId,
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ZAPIER APPOINTMENT REFRESH ERROR]", { stage, message: message.replace(/ZAPIER_MANUAL_REFRESH_HOOK_URL|ZAPIER_MANUAL_REFRESH_KEY/g, "[redacted]") });
    return Response.json({ error: "Internal server error", stage }, { status: 500 });
  }
});