import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment, apiRequest } from "../../shared/stAuth.ts";
import { getWatermark, activateWatermark, incrementWatermarkCounters } from "../../shared/stSync/stSyncWatermark.ts";
import { verifyApiEndpoint, estimateRecordCount } from "../../shared/stSync/stSyncApiVerification.ts";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import { jobAdapter } from "../../shared/stSync/adapters/jobAdapter.ts";
import {
  jobWatermarkConfig,
  jobLockConfig,
  JOBS_API_PATH,
  JOB_PAGE_SIZE,
  JOB_MAX_PAGES,
} from "../../shared/stSync/stJobSyncConfig.ts";

/**
 * runServiceTitanJobIncrementalSync
 *
 * Phase 4 Job Sync — status, activation, API verification, and estimation.
 *
 * Does NOT perform production job writes.
 * Does NOT schedule recovery scans.
 * Does NOT modify webhook routing.
 * Does NOT perform historical backfill.
 *
 * Modes:
 *   watermark_status       — Read-only watermark status
 *   activate               — Idempotent watermark activation (zero writes)
 *   verify_api_modified_on — Read-only API connectivity check (pageSize=1)
 *   verify_api_created_on  — Read-only API connectivity check (pageSize=1)
 *   estimate_backfill      — Read-only record count estimate
 *   incremental            — Production write path: syncs modified jobs via the
 *                            generic sync engine + approved Job adapter. Uses
 *                            cursor lock, watermark windowing, stale-event
 *                            protection, customer dependency hydration/deferral,
 *                            and safe watermark advancement (only on full
 *                            success with zero failures).
 *
 * Incremental mode safeguards:
 *   - Requires active watermark (rejects if not active).
 *   - Uses lockConfig (ServiceTitanSyncCursor) — rejects if lock held.
 *   - maxRuntimeMs (9 min) < lockDurationMinutes (10 min) prevents stale workers.
 *   - Watermark advances ONLY when failed===0, !partialRun, stopReason===null.
 *   - Domain counters (jobs_imported_since_activation, recovery_events_processed)
 *     incremented post-success.
 *   - Recovery window marked "failed" with error count on partial failure.
 *   - Performs NO outbound ServiceTitan write calls.
 *   - Does NOT modify SyncPolicy, activate shadow, cutover, or backfill.
 */

async function getJobWatermarkStats(base44: any, tenantId: string, environment: string) {
  const watermark = await getWatermark(base44, jobWatermarkConfig, tenantId, environment);

  let deferredJobsCount = 0;
  try {
    const deferred = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
      { entity_type: "job", status: "pending" },
      "-created_date",
      100
    );
    deferredJobsCount = deferred.length;
  } catch { /* non-critical */ }

  let jobsTotal = 0;
  try {
    const jobs = await base44.asServiceRole.entities.Job.filter(
      { servicetitan_job_id: { $ne: null } },
      "-servicetitan_last_sync_at",
      1
    );
    jobsTotal = jobs.length;
  } catch { /* non-critical */ }

  return { watermark, deferredJobsCount, jobsTotal };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication: admin/owner (manual) OR X-LVC-Scheduler-Secret (scheduled) ──
    // No body secret accepted. Hardcoded env var name.
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
      const stats = await getJobWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          last_created_scan_at: stats.watermark.last_created_scan_at,
          last_modified_scan_at: stats.watermark.last_modified_scan_at,
          jobs_imported_since_activation: stats.watermark.jobs_imported_since_activation || 0,
          jobs_imported_on_demand: stats.watermark.jobs_imported_on_demand || 0,
          webhook_events_processed: stats.watermark.webhook_events_processed || 0,
          webhook_stale_events_ignored: stats.watermark.webhook_stale_events_ignored || 0,
          recovery_events_processed: stats.watermark.recovery_events_processed || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
        } : null,
        deferred_jobs_count: stats.deferredJobsCount,
        jobs_total: stats.jobsTotal,
      });
    }

    // ── Activate mode ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, jobWatermarkConfig, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          message: "Job Sync is already active — no changes made. Zero jobs imported.",
        });
      }

      const watermark = await activateWatermark(base44, jobWatermarkConfig, tenantId, environment, user?.email || "system");

      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
        },
        jobs_imported: 0,
        message: "Watermark established. Zero jobs imported, updated, or deleted.",
      });
    }

    // ── API verification modes ──
    if (mode === "verify_api_created_on") {
      const result = await verifyApiEndpoint(JOBS_API_PATH(tenantId), environment, tenantId, "createdOnOrAfter");
      return Response.json({
        mode: "verify_api_created_on",
        ...result,
        summary: `API verification (createdOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero job writes, zero watermark advancement.`,
      });
    }

    if (mode === "verify_api_modified_on") {
      const result = await verifyApiEndpoint(JOBS_API_PATH(tenantId), environment, tenantId, "modifiedOnOrAfter");
      return Response.json({
        mode: "verify_api_modified_on",
        ...result,
        summary: `API verification (modifiedOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero job writes, zero watermark advancement.`,
      });
    }

    // ── Estimate backfill scope ──
    if (mode === "estimate_backfill") {
      const estimate = await estimateRecordCount(JOBS_API_PATH(tenantId), environment, tenantId);
      return Response.json({
        mode: "estimate_backfill",
        estimated_jobs: estimate,
        message: estimate === -1 ? "Unable to determine exact count." : `${estimate} jobs would be imported during a full backfill.`,
      });
    }

    // ── Incremental mode: production write path ──
    // Uses the generic sync engine + approved Job adapter to sync modified
    // jobs from the ServiceTitan JPM v2 API. Lock, watermark, stale-event
    // protection, customer dependency, and safe advancement are handled by
    // the engine and adapter.
    if (mode === "incremental") {
      const watermark = await getWatermark(base44, jobWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "incremental",
          status: "no_watermark",
          message: "No active Job Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      // Compute recovery window with overlap
      const overlapMinutes = watermark.recovery_overlap_minutes || jobWatermarkConfig.defaultOverlapMinutes || 5;
      const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
      const windowStart = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000);
      const windowEnd = new Date();

      // Mark recovery window as in-progress
      try {
        await base44.asServiceRole.entities.JobSyncWatermark.update(watermark.id, {
          recovery_window_start: windowStart.toISOString(),
          recovery_window_end: windowEnd.toISOString(),
          recovery_window_status: "in_progress",
          recovery_window_errors: 0,
        });
      } catch { /* non-critical */ }

      // Run the engine in write mode with the approved Job adapter
      const result = await runSyncEngine(jobAdapter, {
        executionMode: "write",
        maxPages: JOB_MAX_PAGES,
        maxRecords: 5000,
        maxRuntimeMs: 540000, // 9 minutes (< 10-minute lock duration)
        lockConfig: jobLockConfig,
        watermarkConfig: jobWatermarkConfig,
        filterField: "modifiedOn",
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      }, base44, {
        tenantId,
        environment,
        source: "api_recovery",
      });

      const succeeded = result.lockAcquired && !result.partialRun && result.failed === 0 && result.stopReason === null;
      const lockConflict = result.stopReason === "lock_conflict";

      // Post-engine: increment domain counters on success
      if (succeeded) {
        try {
          await incrementWatermarkCounters(base44, jobWatermarkConfig.entityName, watermark.id, {
            jobs_imported_since_activation: result.created,
            recovery_events_processed: result.processed,
          });
        } catch { /* non-critical */ }
      }

      // Mark recovery window as failed on partial failure (not on lock conflict)
      if (!succeeded && !lockConflict) {
        try {
          await base44.asServiceRole.entities.JobSyncWatermark.update(watermark.id, {
            recovery_window_status: "failed",
            recovery_window_errors: result.failed,
          });
        } catch { /* non-critical */ }
      }

      const watermarkAdvanced = !!(result.watermarkAfter && result.watermarkBefore
        && result.watermarkAfter.last_modified_scan_at !== result.watermarkBefore.last_modified_scan_at);

      return Response.json({
        mode: "incremental",
        status: lockConflict ? "already_running" : (succeeded ? "completed" : "partial_failure"),
        domain: result.domain,
        execution_mode: result.mode,
        started_at: result.startedAt,
        finished_at: result.finishedAt,
        duration_ms: result.durationMs,
        pages_fetched: result.pagesFetched,
        records_fetched: result.recordsFetched,
        records_processed: result.processed,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        stale: result.stale,
        deferred: result.deferred,
        skipped: result.skipped,
        failed: result.failed,
        invalid: result.invalid,
        unsupported: result.unsupported,
        api_requests: result.apiRequests,
        api_errors: result.apiErrors,
        lock_acquired: result.lockAcquired,
        partial_run: result.partialRun,
        stop_reason: result.stopReason,
        watermark_advanced: watermarkAdvanced,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        errors: result.errors,
        policy_mode: "EXTERNAL_TO_LVC",
        outbound_writes: 0,
        scheduler_status: "not_scheduled",
        message: succeeded
          ? `Incremental sync completed: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`
          : lockConflict
            ? "Another incremental sync worker is already running."
            : `Incremental sync partial failure: ${result.failed} failed, ${result.deferred} deferred. Watermark NOT advanced.`,
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST JOB SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Job sync failed" }, { status: 500 });
  }
});