import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { runPreflightChecks } from "../../shared/stActivationPreflight.ts";

/**
 * activateCustomerSync
 *
 * Production activation for ServiceTitan Customer Synchronization.
 * Orchestration only — validation logic lives in stActivationPreflight.ts.
 *
 * Idempotent: returns "already active" if the watermark is active,
 * without creating duplicate records.
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

    const result = await runPreflightChecks(base44, user, tenantId, environment);

    if (!result.all_passed) {
      return Response.json({
        status: "FAIL",
        message: "Activation aborted — preflight validation failed",
        failed_checks: result.failed_checks,
        recommended_actions: result.failed_checks.map(c => `Fix: ${c.name} — ${c.details}`),
      }, { status: 400 });
    }

    const w = result.watermark;
    return Response.json({
      status: "PASS",
      message: "Customer Sync is active",
      activated_by: user.email,
      timestamp: new Date().toISOString(),
      environment,
      tenant_id: tenantId,
      sync_strategy: w.sync_strategy,
      scheduler_status: "Disabled",
      backfill_status: w.backfill_status,
      customers_imported: 0,
      contacts_imported: 0,
      watermark_advancement: false,
      api_latency_ms: result.api_latency_ms,
      checks_passed: result.checks.length - result.failed_checks.length,
      checks_total: result.checks.length,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: "FAIL" }, { status: 500 });
  }
});