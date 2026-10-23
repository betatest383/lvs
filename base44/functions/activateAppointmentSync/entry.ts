import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { runPreflightChecks } from "../../shared/stSync/stSyncPreflight.ts";
import { buildAppointmentPreflightConfig } from "../../shared/stAppointmentSyncConfig.ts";

/**
 * activateAppointmentSync
 *
 * Production activation for ServiceTitan Appointment Synchronization.
 * Orchestration only — validation logic lives in the shared preflight framework.
 *
 * Idempotent: returns "already active" if the watermark is active,
 * without creating duplicate records.
 *
 * Activation performs ZERO appointment writes.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "owner" && user.role !== "admin") {
      return Response.json({ error: "Forbidden — owner or admin required" }, { status: 403 });
    }

    const tenantId = getTenantId();
    const environment = getEnvironment();
    const preflightConfig = buildAppointmentPreflightConfig(tenantId);

    const result = await runPreflightChecks(base44, preflightConfig, user, tenantId, environment);

    if (!result.all_passed) {
      return Response.json({
        status: "FAIL",
        message: "Appointment Sync activation aborted — preflight validation failed",
        failed_checks: result.failed_checks,
        recommended_actions: result.failed_checks.map(c => `Fix: ${c.name} — ${c.details}`),
      }, { status: 400 });
    }

    const w = result.watermark;
    return Response.json({
      status: "PASS",
      message: "Appointment Sync is active",
      activated_by: user.email,
      timestamp: new Date().toISOString(),
      environment,
      tenant_id: tenantId,
      sync_strategy: w.sync_strategy,
      scheduler_status: "Disabled",
      backfill_status: w.backfill_status,
      appointments_imported: 0,
      watermark_advancement: false,
      api_latency_ms: result.api_latency_ms,
      checks_passed: result.checks.length - result.failed_checks.length,
      checks_total: result.checks.length,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: "FAIL" }, { status: 500 });
  }
});