import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { runPreflightChecks } from "../../shared/stSync/stSyncPreflight.ts";
import { buildJobPreflightConfig } from "../../shared/stSync/stJobSyncConfig.ts";

/**
 * activateJobSync
 *
 * Phase 4 activation for ServiceTitan Job Synchronization.
 * Orchestration only — validation logic lives in the shared preflight framework.
 *
 * Idempotent: returns "already active" if the watermark is active,
 * without creating duplicate records.
 *
 * Activation performs ZERO job writes.
 * Does NOT modify webhook routing.
 * Does NOT schedule recovery scans.
 * Does NOT perform historical backfill.
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
    const preflightConfig = buildJobPreflightConfig(tenantId);

    const result = await runPreflightChecks(base44, preflightConfig, user, tenantId, environment);

    if (!result.all_passed) {
      return Response.json({
        status: "FAIL",
        message: "Job Sync activation aborted — preflight validation failed",
        failed_checks: result.failed_checks,
        recommended_actions: result.failed_checks.map(c => `Fix: ${c.name} — ${c.details}`),
      }, { status: 400 });
    }

    const w = result.watermark;
    return Response.json({
      status: "PASS",
      message: "Job Sync is active",
      activated_by: user.email,
      timestamp: new Date().toISOString(),
      environment,
      tenant_id: tenantId,
      sync_strategy: w.sync_strategy,
      scheduler_status: "Disabled",
      backfill_status: w.backfill_status,
      jobs_imported: 0,
      watermark_advancement: false,
      api_latency_ms: result.api_latency_ms,
      checks_passed: result.checks.length - result.failed_checks.length,
      checks_total: result.checks.length,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: "FAIL" }, { status: 500 });
  }
});