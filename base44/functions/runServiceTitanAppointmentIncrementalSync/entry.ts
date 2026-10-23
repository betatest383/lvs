import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { getWatermark, activateWatermark } from "../../shared/stSync/stSyncWatermark.ts";
import { runRecoveryScan } from "../../shared/stSync/stSyncRecovery.ts";
import { verifyApiEndpoint, estimateRecordCount } from "../../shared/stSync/stSyncApiVerification.ts";
import {
  appointmentWatermarkConfig,
  APPOINTMENTS_API_PATH,
  APPOINTMENT_DOMAIN,
  APPOINTMENT_PAGE_SIZE,
  APPOINTMENT_MAX_PAGES,
} from "../../shared/stAppointmentSyncConfig.ts";
import { apiRequest, retryWithBackoff } from "../../shared/stAuth.ts";
import { syncAppointmentCreated } from "../../shared/stAppointmentSync.ts";

/**
 * ServiceTitan Appointment Incremental API Synchronization
 *
 * Imports directly from the generic sync engine modules — no redundant
 * orchestration layer.
 *
 * Modes:
 *   - watermark_status: Return watermark stats without processing
 *   - activate: Establish the watermark without importing (zero writes)
 *   - recovery: Run a windowed recovery scan
 *   - verify_api_created_on: No-write API verification (createdOnOrAfter)
 *   - verify_api_modified_on: No-write API verification (modifiedOnOrAfter)
 *   - estimate_backfill: Estimate total appointment count
 *
 * P7 — Authentication: External callers must pass scheduler_secret.
 */

// ─── Inline helpers (replaced stAppointmentApiSync.ts orchestration layer) ──

async function fetchAppointmentPage(
  environment: string,
  tenantId: string,
  filterParam: "createdOnOrAfter" | "modifiedOnOrAfter",
  since: string,
  page: number,
  pageSize: number
): Promise<{ records: any[]; hasMore: boolean }> {
  const path = APPOINTMENTS_API_PATH(tenantId);
  const params: Record<string, string> = {
    [filterParam]: since,
    page: String(page),
    pageSize: String(pageSize),
    includeTotal: "false",
  };
  const result = await retryWithBackoff(async () => {
    return await apiRequest(path, environment, { params });
  });
  const records = result.data || result.appointments || (Array.isArray(result) ? result : []);
  const hasMore = result.hasMore ?? result.has_more ?? false;
  return { records, hasMore };
}

async function processAppointmentRecord(
  base44: any,
  record: any,
  context: { tenantId: string; environment: string; batchId: string }
): Promise<{ action: "created" | "updated" | "unchanged" | "deferred" | "skipped" | "error"; error?: string }> {
  try {
    const stAppointmentId = record.id != null ? String(record.id).trim() : "";
    if (!stAppointmentId) {
      return { action: "error", error: "Missing appointment ID in API record" };
    }

    // Build webhook-shaped payload from the API record
    const payload = mapApiRecordToPayload(record, context.tenantId);

    const result = await syncAppointmentCreated({
      base44,
      payload,
      event: {
        id: `${context.batchId}-${stAppointmentId}`,
        event_type: "appointment_created",
        object_id: stAppointmentId,
        tenant_id: context.tenantId,
      },
      action: "created",
    });

    if (!result.success) {
      return result.retryable
        ? { action: "deferred", error: result.error }
        : { action: "error", error: result.error };
    }

    const syncAction = result.metadata?.sync_action || "created";
    if (syncAction === "unchanged") return { action: "unchanged" };
    if (syncAction === "updated") return { action: "updated" };
    return { action: "created" };
  } catch (err: any) {
    return { action: "error", error: err.message };
  }
}

function mapApiRecordToPayload(record: any, tenantId: string): any {
  let technicianId = String(record.technicianId || record.technician_id || "");
  let technicianName = record.technicianName || record.technician_name || "";
  let technicianEmail = record.technicianEmail || record.technician_email || "";
  if (!technicianId && Array.isArray(record.appointmentSummaries) && record.appointmentSummaries.length > 0) {
    const summary = record.appointmentSummaries[0];
    technicianId = String(summary.technicianId || summary.technician_id || "");
    technicianName = summary.technicianName || summary.technician_name || "";
    technicianEmail = summary.technicianEmail || summary.technician_email || "";
  }

  return {
    appointment_id: String(record.id || ""),
    servicetitan_appointment_id: String(record.id || ""),
    appointment_number: String(record.appointmentNumber || record.number || ""),
    job_id: String(record.jobId || record.job_id || ""),
    job_number: String(record.jobNumber || record.job_number || ""),
    customer_id: String(record.customerId || record.customer_id || ""),
    customer_name: record.customerName || record.customer_name || "",
    customer_phone: record.customerPhone || record.customer_phone || "",
    location_id: String(record.locationId || record.location_id || ""),
    location_name: record.locationName || record.location_name || "",
    technician_id: technicianId,
    technician_name: technicianName,
    technician_email: technicianEmail,
    employee_id: String(record.employeeId || record.employee_id || ""),
    tenant_id: tenantId,
    business_unit: record.businessUnit || record.business_unit || "",
    job_type: record.jobType || record.job_type || "",
    appointment_type: record.appointmentType || record.appointment_type || "",
    status: record.status || "",
    start_time: record.start || record.startTime || record.start_time || "",
    end_time: record.end || record.endTime || record.end_time || "",
    arrival_window_start: record.arrivalWindowStart || record.arrival_window_start || "",
    arrival_window_end: record.arrivalWindowEnd || record.arrival_window_end || "",
    address: record.address || record.serviceAddress || "",
    city: record.city || "",
    state: record.state || "",
    zip: record.zip || record.zipCode || "",
    notes: record.specialInstructions || record.notes || "",
    priority: record.priority || "",
    createdOn: record.createdOn || record.created_on || "",
    modifiedOn: record.modifiedOn || record.modified_on || "",
    completedOn: record.completedOn || record.completed_on || "",
    cancellation_reason: record.cancellationReason || record.cancellation_reason || "",
    is_on_hold: record.isOnHold || record.is_on_hold || false,
    is_confirmed: record.isConfirmed || record.is_confirmed || false,
    active: record.active,
    unused: record.unused,
    event_timestamp: record.modifiedOn || record.modified_on || new Date().toISOString(),
  };
}

async function getAppointmentWatermarkStats(
  base44: any,
  tenantId: string,
  environment: string
): Promise<{ watermark: any | null; deferred_appointments_count: number; appointments_total: number }> {
  const watermark = await getWatermark(base44, appointmentWatermarkConfig, tenantId, environment);

  let deferredAppointments = 0;
  try {
    const deferred = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
      { entity_type: "appointment", status: "pending" },
      "-created_date", 100
    );
    deferredAppointments = deferred?.length || 0;
  } catch (err) {
    console.error("[ST APPT SYNC] Failed to get deferred appointment count:", err);
  }

  let appointmentsTotal = 0;
  try {
    const appts = await base44.asServiceRole.entities.Appointment.filter(
      { servicetitan_appointment_id: { $ne: "" } },
      "-created_date", 1
    );
    appointmentsTotal = appts?.length || 0;
  } catch (err) {
    console.error("[ST APPT SYNC] Failed to get appointment count:", err);
  }

  return { watermark, deferred_appointments_count: deferredAppointments, appointments_total: appointmentsTotal };
}

async function runAppointmentRecoveryScan(
  base44: any,
  environment: string,
  tenantId: string,
  watermark: any
): Promise<any> {
  return await runRecoveryScan(
    base44,
    {
      domain: APPOINTMENT_DOMAIN,
      watermarkEntityName: "AppointmentSyncWatermark",
      cursorEntityName: "ServiceTitanSyncCursor",
      fetchPage: (env, tenant, since, page, pageSize) =>
        fetchAppointmentPage(env, tenant, "createdOnOrAfter", since, page, pageSize),
      processRecord: (base44, record, ctx) =>
        processAppointmentRecord(base44, record, { tenantId: ctx.tenantId, environment: ctx.environment, batchId: ctx.batchId }),
      maxPages: APPOINTMENT_MAX_PAGES,
      pageSize: APPOINTMENT_PAGE_SIZE,
      defaultOverlapMinutes: 5,
    },
    environment,
    tenantId,
    watermark,
    "last_created_scan_at"
  );
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication: admin/owner (manual) OR X-LVC-Scheduler-Secret (scheduled) ──
    if (user) {
      if (user.role !== "admin" && user.role !== "owner") {
        return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
      }
    } else {
      const expectedSecret = Deno.env.get("LVC_SCHEDULER_SECRET") || "";
      if (!expectedSecret) {
        return Response.json({ error: "Server not configured — LVC_SCHEDULER_SECRET not set" }, { status: 500 });
      }
      const providedSecret = req.headers.get("X-LVC-Scheduler-Secret") || "";
      if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
        return Response.json({ error: "Forbidden — valid X-LVC-Scheduler-Secret header required for scheduled invocation" }, { status: 403 });
      }
    }

    const mode = body.mode || "watermark_status";
    const tenantId = body.tenant_id || getTenantId();
    const environment = body.environment || getEnvironment();

    // ── Watermark status mode ──
    if (mode === "watermark_status") {
      const stats = await getAppointmentWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          last_created_scan_at: stats.watermark.last_created_scan_at,
          last_modified_scan_at: stats.watermark.last_modified_scan_at,
          appointments_imported_since_activation: stats.watermark.appointments_imported_since_activation || 0,
          appointments_imported_on_demand: stats.watermark.appointments_imported_on_demand || 0,
          webhook_events_processed: stats.watermark.webhook_events_processed || 0,
          webhook_stale_events_ignored: stats.watermark.webhook_stale_events_ignored || 0,
          recovery_events_processed: stats.watermark.recovery_events_processed || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
        } : null,
        deferred_appointments_count: stats.deferred_appointments_count,
        appointments_total: stats.appointments_total,
      });
    }

    // ── Activate mode ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, appointmentWatermarkConfig, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          message: "Appointment Sync is already active — no changes made. Zero appointments imported.",
        });
      }

      const watermark = await activateWatermark(base44, appointmentWatermarkConfig, tenantId, environment, user?.email || "system");

      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
        },
        appointments_imported: 0,
        message: "Watermark established. Zero appointments imported, updated, or deleted.",
      });
    }

    // ── Recovery mode ──
    if (mode === "recovery") {
      const watermark = await getWatermark(base44, appointmentWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "recovery",
          status: "no_watermark",
          message: "No active watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const result = await runAppointmentRecoveryScan(base44, environment, tenantId, watermark);

      return Response.json({
        mode: "recovery",
        status: "completed",
        ...result,
        watermark_id: watermark.id,
        activation_timestamp: watermark.activation_timestamp,
      });
    }

    // ── API verification modes ──
    if (mode === "verify_api_created_on") {
      const result = await verifyApiEndpoint(APPOINTMENTS_API_PATH(tenantId), environment, tenantId, "createdOnOrAfter");
      return Response.json({
        mode: "verify_api_created_on",
        ...result,
        summary: `API verification (createdOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero appointment writes, zero watermark advancement.`,
      });
    }

    if (mode === "verify_api_modified_on") {
      const result = await verifyApiEndpoint(APPOINTMENTS_API_PATH(tenantId), environment, tenantId, "modifiedOnOrAfter");
      return Response.json({
        mode: "verify_api_modified_on",
        ...result,
        summary: `API verification (modifiedOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero appointment writes, zero watermark advancement.`,
      });
    }

    // ── Estimate backfill scope ──
    if (mode === "estimate_backfill") {
      const estimate = await estimateRecordCount(APPOINTMENTS_API_PATH(tenantId), environment, tenantId);
      return Response.json({
        mode: "estimate_backfill",
        estimated_appointments: estimate,
        message: estimate === -1 ? "Unable to determine exact count." : `${estimate} appointments would be imported during a full backfill.`,
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST APPT SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Appointment sync failed" }, { status: 500 });
  }
});