import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import {
  getOrCreateCursor,
  acquireLock,
  releaseLock,
  isLockExpired,
  runSyncCycle,
  runControlledImport,
  verifyLockOwnership,
} from "../../shared/stCustomerApiSync.ts";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import {
  getWatermark,
  activateWatermark,
  runRecoveryScan,
  hydrateCustomerOnDemand,
  getWatermarkStats,
  estimateBackfillScope,
  verifyTransactionalApi,
  verifyTransactionalApiCreatedOn,
  verifyTransactionalApiModifiedOn,
} from "../../shared/stCustomerSyncStrategy.ts";

/**
 * ServiceTitan Customer Incremental API Synchronization
 *
 * Replaces webhook-only customer ingestion with a production-grade
 * incremental API synchronization worker using the CRM v2 export endpoint.
 *
 * Endpoint: GET /crm/v2/tenant/{tenant}/export/customers
 * OAuth scope: tn.crm.customers:r
 *
 * Modes:
 *   - incremental (default): Sync changed customers since last continuation token
 *   - initial_backfill: Full backfill from the beginning (requires confirm=true)
 *   - status: Return cursor status without processing
 *   - dry_run: Fetch one page and return results without modifying data (P2)
 *
 * P7 — Authentication:
 *   External callers must not be able to trigger synchronization.
 *   - Authenticated users must be admin or owner.
 *   - Unauthenticated (scheduled) invocations must pass SCHEDULER_SECRET
 *     in the request body. Without it, the request is rejected.
 *
 * P6 — Lock Ownership:
 *   The lockId acquired at the start is passed through the entire cycle.
 *   Only the lock owner may update the cursor, release the lock, or advance
 *   the continuation token. Stale workers are rejected.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Parse request body first (body can only be read once)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body — default to incremental mode (for scheduled invocations)
    }

    // ── P7: Authentication ──
    // External callers must not be able to trigger synchronization.
    // Scheduled automations invoke this function without an authenticated user
    // context, so base44.auth.me() throws — we catch and proceed to the
    // scheduler-secret check.
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      // Scheduled invocation — no authenticated user, proceed to secret check
    }

    if (user) {
      // Authenticated user — require admin or owner
      if (user.role !== "admin" && user.role !== "owner") {
        return Response.json(
          { error: "Forbidden — admin access required" },
          { status: 403 }
        );
      }
    } else {
      // Scheduled mode: require X-LVC-Scheduler-Secret header (hardcoded env var, header-only)
      const expectedSecret = Deno.env.get("LVC_SCHEDULER_SECRET") || "";
      if (!expectedSecret) {
        return Response.json(
          { error: "Server not configured — LVC_SCHEDULER_SECRET not set" },
          { status: 500 }
        );
      }
      const providedSecret = req.headers.get("X-LVC-Scheduler-Secret") || "";
      if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
        return Response.json(
          { error: "Forbidden — valid X-LVC-Scheduler-Secret header required for scheduled invocation" },
          { status: 403 }
        );
      }
    }

    const mode = body.mode || "incremental";
    if (!["incremental", "initial_backfill", "status", "dry_run", "controlled_import",
           "activate", "recovery", "hydrate", "watermark_status", "start_backfill",
           "estimate_backfill", "verify_api", "verify_api_created_on", "verify_api_modified_on"].includes(mode)) {
      return Response.json(
        { error: `Invalid mode '${mode}'. Must be: incremental, initial_backfill, status, dry_run, controlled_import, activate, recovery, hydrate, watermark_status, start_backfill, estimate_backfill, verify_api, verify_api_created_on, or verify_api_modified_on` },
        { status: 400 }
      );
    }

    // Get configuration from secrets
    const tenantId = body.tenant_id || getTenantId();
    const environment = body.environment || getEnvironment();

    // Get or create cursor
    const cursor = await getOrCreateCursor(base44, tenantId, environment);

    // ── Status mode: return cursor state without processing ──
    if (mode === "status") {
      return Response.json({
        cursor_id: cursor.id,
        integration_name: cursor.integration_name,
        domain: cursor.domain,
        tenant_id: cursor.tenant_id,
        environment: cursor.environment,
        status: cursor.status,
        mode: cursor.mode,
        continuation_token: cursor.continuation_token || "(none — starting from beginning)",
        last_successful_sync_at: cursor.last_successful_sync_at,
        last_attempt_at: cursor.last_attempt_at,
        last_completed_page_at: cursor.last_completed_page_at,
        records_processed: cursor.records_processed || 0,
        total_records_synced: cursor.total_records_synced || 0,
        consecutive_failures: cursor.consecutive_failures || 0,
        last_error: cursor.last_error || "",
        lock_id: cursor.lock_id || "",
        lock_expires_at: cursor.lock_expires_at,
        lock_expired: isLockExpired(cursor),
        last_batch_id: cursor.last_batch_id || "",
        contacts_last_synced_at: cursor.contacts_last_synced_at,
        last_sync_summary: cursor.last_sync_summary_json
          ? JSON.parse(cursor.last_sync_summary_json)
          : null,
      });
    }

    // ── Initial backfill: require explicit confirmation ──
    if (mode === "initial_backfill") {
      if (!body.confirm) {
        return Response.json({
          error: "Initial backfill requires explicit confirmation",
          message: "Pass { mode: 'initial_backfill', confirm: true } to start a full backfill. This will reset the continuation token and process all customers from the beginning.",
          current_cursor: {
            id: cursor.id,
            continuation_token: cursor.continuation_token || "(none)",
            records_processed: cursor.records_processed || 0,
          },
        }, { status: 400 });
      }

      const confirmedBy = user?.email || "scheduler";
      const now = new Date().toISOString();

      await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
        continuation_token: "",
        mode: "initial_backfill",
        backfill_started_at: now,
        backfill_confirmed_by: confirmedBy,
        backfill_completed_at: null,
        status: "backfilling",
      });

      const resetCursor = await base44.asServiceRole.entities.ServiceTitanSyncCursor.get(cursor.id);
      if (!resetCursor) {
        return Response.json({ error: "Failed to reload cursor after backfill reset" }, { status: 500 });
      }

      return await executeSyncCycle(base44, resetCursor, environment, tenantId, "initial_backfill", false);
    }

    // ── Dry run mode: fetch and report without modifying (P2) ──
    if (mode === "dry_run") {
      return await executeSyncCycle(base44, cursor, environment, tenantId, "dry_run", true);
    }

    // ── Controlled import mode: process a limited number of records ──
    if (mode === "controlled_import") {
      const limit = Math.min(Math.max(body.limit || 25, 1), 500);

      const lockId = await acquireLock(base44, cursor);
      if (!lockId) {
        return Response.json({
          cursor_id: cursor.id,
          mode,
          status: "already_running",
          message: "Another sync worker is already running for this cursor.",
          lock_expires_at: cursor.lock_expires_at,
        });
      }

      console.log(`[ST CUSTOMER API SYNC] Starting controlled import (limit: ${limit}, lock: ${lockId})`);

      try {
        const result = await runControlledImport(base44, cursor, environment, tenantId, lockId, limit);

        // Build cursor updates — do NOT advance continuation token
        const cursorUpdates: Record<string, any> = {
          last_sync_summary_json: JSON.stringify({
            type: "controlled_import",
            limit: result.total_records,
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            merged: result.merged,
            errors: result.errors,
            contacts_created: result.contacts_created,
            contacts_updated: result.contacts_updated,
            contacts_failed: result.contacts_failed,
            deferred_merges: result.deferred_merges,
            pending_merges_retried: result.pending_merges_retried,
            pending_merges_completed: result.pending_merges_completed,
            pending_merges_failed: result.pending_merges_failed,
            oldest_pending_merge_age_seconds: result.oldest_pending_merge_age_seconds,
            continuation_token_advanced: false,
            timestamp: new Date().toISOString(),
          }),
          last_batch_id: `CONTROLLED-${Date.now().toString(36)}`,
          records_processed: (cursor.records_processed || 0) + result.total_records,
          total_records_synced: (cursor.total_records_synced || 0) + result.created + result.updated,
        };
        if (result.contacts_created > 0 || result.contacts_updated > 0) {
          cursorUpdates.contacts_last_synced_at = new Date().toISOString();
        }

        await releaseLock(base44, cursor.id, lockId, cursorUpdates, result.errors === 0);

        console.log(`[ST CUSTOMER API SYNC] Controlled import completed: ${result.summary}`);

        return Response.json({
          ...result,
          cursor_id: cursor.id,
          mode: "controlled_import",
          status: "controlled_import_completed",
          lock_released: true,
          continuation_token_preserved: true,
        });
      } catch (error) {
        console.error("[ST CUSTOMER API SYNC] Controlled import failed:", error);
        await releaseLock(base44, cursor.id, lockId, { last_error: error.message }, false);
        return Response.json({
          cursor_id: cursor.id,
          mode: "controlled_import",
          status: "failed",
          error: error.message,
          summary: `Controlled import failed: ${error.message}`,
        }, { status: 500 });
      }
    }

    // ── Watermark status mode ──
    if (mode === "watermark_status") {
      const stats = await getWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          environment: stats.watermark.environment,
          tenant_id: stats.watermark.tenant_id,
          created_by: stats.watermark.created_by,
          created_at: stats.watermark.created_date,
          last_new_customer_scan_at: stats.watermark.last_new_customer_scan_at,
          last_update_scan_at: stats.watermark.last_update_scan_at,
          customers_imported_since_activation: stats.watermark.customers_imported_since_activation || 0,
          customers_imported_on_demand: stats.watermark.customers_imported_on_demand || 0,
          webhook_events_processed: stats.watermark.webhook_events_processed || 0,
          recovery_events_processed: stats.watermark.recovery_events_processed || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
          backfill_started_at: stats.watermark.backfill_started_at,
          backfill_confirmed_by: stats.watermark.backfill_confirmed_by,
          backfill_scope_estimate: stats.watermark.backfill_scope_estimate,
          notes: stats.watermark.notes,
        } : null,
        pending_merges_count: stats.pending_merges_count,
        customers_total: stats.customers_total,
      });
    }

    // ── Activate mode: establish the watermark without importing ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          watermark: {
            id: existing.id,
            sync_strategy: existing.sync_strategy,
            activation_timestamp: existing.activation_timestamp,
            status: existing.status,
          },
          message: "Watermark already active — no changes made. Zero customers imported.",
        });
      }

      const watermark = await activateWatermark(base44, tenantId, environment, user?.email || "system");

      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
          environment: watermark.environment,
          tenant_id: watermark.tenant_id,
          created_by: watermark.created_by,
        },
        customers_imported: 0,
        message: "Watermark established. Zero customers imported, updated, merged, or deleted.",
      });
    }

    // ── Recovery mode: scan for new customers since activation ──
    if (mode === "recovery") {
      const watermark = await getWatermark(base44, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "recovery",
          status: "no_watermark",
          message: "No active watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const result = await runRecoveryScan(base44, environment, tenantId, watermark);

      return Response.json({
        mode: "recovery",
        status: "completed",
        ...result,
        watermark_id: watermark.id,
        activation_timestamp: watermark.activation_timestamp,
      });
    }

    // ── Hydrate mode: on-demand hydration of a single customer ──
    if (mode === "hydrate") {
      const stCustomerId = body.servicetitan_customer_id || body.st_customer_id || "";
      if (!stCustomerId) {
        return Response.json({
          mode: "hydrate",
          error: "servicetitan_customer_id is required",
        }, { status: 400 });
      }

      const watermark = await getWatermark(base44, tenantId, environment);
      const result = await hydrateCustomerOnDemand(base44, environment, tenantId, stCustomerId, watermark);

      return Response.json({
        mode: "hydrate",
        ...result,
      });
    }

    // ── Live no-write API verification (createdOnOrAfter filter) ──
    if (mode === "verify_api" || mode === "verify_api_created_on") {
      const result = await verifyTransactionalApiCreatedOn(environment, tenantId);
      return Response.json({
        mode: "verify_api_created_on",
        ...result,
        summary: `API verification (createdOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records returned. ` +
          `Top-level keys: [${result.response_top_level_keys.join(", ")}]. ` +
          `Pagination: hasMore=${result.pagination.hasMore}, page=${result.pagination.page}, pageSize=${result.pagination.pageSize}. ` +
          `First record: id=${result.first_record_id}, createdOn=${result.first_record_createdOn}, modifiedOn=${result.first_record_modifiedOn}. ` +
          `Last record id=${result.last_record_id}. ` +
          `Zero Customer writes, zero Contact writes, zero watermark advancement.`,
      });
    }

    // ── Live no-write API verification (modifiedOnOrAfter filter) ──
    if (mode === "verify_api_modified_on") {
      const result = await verifyTransactionalApiModifiedOn(environment, tenantId);
      return Response.json({
        mode: "verify_api_modified_on",
        ...result,
        summary: `API verification (modifiedOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records returned. ` +
          `Top-level keys: [${result.response_top_level_keys.join(", ")}]. ` +
          `Pagination: hasMore=${result.pagination.hasMore}, page=${result.pagination.page}, pageSize=${result.pagination.pageSize}. ` +
          `First record: id=${result.first_record_id}, createdOn=${result.first_record_createdOn}, modifiedOn=${result.first_record_modifiedOn}. ` +
          `Last record id=${result.last_record_id}. ` +
          `Zero Customer writes, zero Contact writes, zero watermark advancement.`,
      });
    }

    // ── Estimate backfill scope ──
    if (mode === "estimate_backfill") {
      const estimate = await estimateBackfillScope(environment, tenantId);
      return Response.json({
        mode: "estimate_backfill",
        estimated_customers: estimate,
        message: estimate === -1
          ? "Unable to determine exact count. The export endpoint would need to be traversed."
          : `${estimate} customers would be imported during a full historical backfill.`,
      });
    }

    // ── Start backfill mode: requires Owner confirmation (DISABLED for now) ──
    if (mode === "start_backfill") {
      // This mode is intentionally disabled. It requires:
      // 1. Owner role confirmation (body.confirm === true)
      // 2. The backfill_status to be "never_started" or "disabled"
      // 3. Explicit scope acknowledgment
      if (user?.role !== "owner") {
        return Response.json({
          mode: "start_backfill",
          status: "forbidden",
          error: "Historical backfill requires Owner role confirmation.",
        }, { status: 403 });
      }

      if (!body.confirm) {
        const estimate = await estimateBackfillScope(environment, tenantId);
        return Response.json({
          mode: "start_backfill",
          status: "confirmation_required",
          message: "Historical backfill requires explicit confirmation. Pass { confirm: true } to proceed.",
          estimated_scope: estimate,
          warning: "This will import ALL historical customers from ServiceTitan. This action cannot be undone.",
        }, { status: 400 });
      }

      // Even with confirmation, the backfill is DISABLED for now.
      // It will only be enabled after the readiness report is reviewed.
      return Response.json({
        mode: "start_backfill",
        status: "disabled",
        message: "Historical backfill is currently disabled. The readiness report must be reviewed before enabling.",
      }, { status: 403 });
    }

    // ── Incremental mode (default) ──
    return await executeSyncCycle(base44, cursor, environment, tenantId, "incremental", false);

  } catch (error) {
    console.error("[ST CUSTOMER API SYNC ERROR]", { error: error.message });
    return Response.json(
      {
        error: error.message,
        summary: "Sync cycle failed",
      },
      { status: 500 }
    );
  }
});

// ─── Sync Cycle Executor ─────────────────────────────────────────────────────

async function executeSyncCycle(
  base44: any,
  cursor: any,
  environment: string,
  tenantId: string,
  mode: string,
  dryRun: boolean
): Promise<Response> {
  // P2: Dry run performs ZERO writes — skip lock management entirely.
  // No lock acquisition, no lock release, no cursor updates on success or failure.
  if (dryRun) {
    console.log(`[ST CUSTOMER API SYNC] Starting ${mode} cycle (NO LOCK — dry run)`);
    try {
      const result = await runSyncCycle(base44, cursor, environment, tenantId, mode, "DRY_RUN_NO_LOCK", dryRun);
      console.log(`[ST CUSTOMER API SYNC] Completed ${mode}: ${result.summary}`);
      return Response.json({
        ...result,
        lock_released: true, // No lock was acquired, so nothing to release
        status: "dry_run_completed",
      });
    } catch (error) {
      console.error("[ST CUSTOMER API SYNC] Dry run failed:", error);
      return Response.json({
        cursor_id: cursor.id,
        mode,
        status: "dry_run_failed",
        error: error.message,
        summary: `Dry run failed: ${error.message}`,
        continuation_token_preserved: true,
      }, { status: 500 });
    }
  }

  // ── Normal flow with lock management (P6) ──
  // Acquire lock
  const lockId = await acquireLock(base44, cursor);

  if (!lockId) {
    return Response.json({
      cursor_id: cursor.id,
      mode,
      status: "already_running",
      message: "Another sync worker is already running for this cursor. Lock is still active.",
      lock_expires_at: cursor.lock_expires_at,
    });
  }

  console.log(`[ST CUSTOMER API SYNC] Starting ${mode} sync cycle (lock: ${lockId})`);

  try {
    // P6: Pass lockId to runSyncCycle for ownership verification
    const result = await runSyncCycle(base44, cursor, environment, tenantId, mode, lockId, dryRun);

    // P2: In dry run mode, do NOT update cursor, do NOT mark backfill complete
    if (!dryRun && mode === "initial_backfill" && !result.has_more && result.errors === 0) {
      const ownsLock = await verifyLockOwnership(base44, cursor.id, lockId);
      if (ownsLock) {
        await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
          backfill_completed_at: new Date().toISOString(),
          mode: "incremental",
        });
      }
    }

    // ── PARTIAL FAILURE HANDLING ──
    if (result.errors > 0) {
      // P6: Pass lockId to releaseLock for ownership verification
      await releaseLock(base44, cursor.id, lockId, {
        continuation_token: result.final_continuation_token,
        last_error: `${result.errors} record(s) failed — continuation token preserved at '${result.final_continuation_token}'`,
        consecutive_failures: (cursor.consecutive_failures || 0) + 1,
        records_processed: (cursor.records_processed || 0) + result.total_records,
        total_records_synced: (cursor.total_records_synced || 0) + result.created + result.updated,
      }, false);

      console.error(`[ST CUSTOMER API SYNC] Partial failure: ${result.errors} records failed. Token preserved.`);

      return Response.json({
        ...result,
        lock_released: true,
        status: "partial_failure",
        continuation_token_preserved: true,
      });
    }

    // Release lock with success
    // P6: Pass lockId to releaseLock for ownership verification
    // P2: In dry run mode, don't update continuation token or counters
    await releaseLock(base44, cursor.id, lockId, {
      continuation_token: dryRun ? cursor.continuation_token : result.final_continuation_token,
      last_batch_id: cursor.last_batch_id,
      records_processed: dryRun ? cursor.records_processed : (cursor.records_processed || 0) + result.total_records,
      total_records_synced: dryRun ? cursor.total_records_synced : (cursor.total_records_synced || 0) + result.created + result.updated,
    }, true);

    console.log(`[ST CUSTOMER API SYNC] Completed ${mode} sync: ${result.summary}`);

    return Response.json({
      ...result,
      lock_released: true,
      status: "completed",
    });
  } catch (error) {
    console.error("[ST CUSTOMER API SYNC] Sync cycle failed:", error);

    // P6: Pass lockId to releaseLock for ownership verification
    await releaseLock(base44, cursor.id, lockId, {
      last_error: error.message,
    }, false);

    return Response.json({
      cursor_id: cursor.id,
      mode,
      status: "failed",
      error: error.message,
      summary: `Sync cycle failed: ${error.message}`,
      continuation_token_preserved: true,
    }, { status: 500 });
  }
}