/**
 * runServiceTitanPurchaseOrderIncrementalSync — Stage 2E.2A
 *
 * Production incremental Purchase Order synchronization.
 * ServiceTitan → LVC OS ONLY. NO outbound ServiceTitan writes.
 *
 * Modes:
 *   watermark_status       — Read-only watermark status
 *   activate               — Idempotent watermark activation (zero writes)
 *   incremental            — Production write path via executeIncrementalSync
 *
 * Incremental mode safeguards:
 *   - Requires active watermark (rejects if not active).
 *   - Uses lockConfig (ServiceTitanSyncCursor) — rejects if lock held.
 *   - maxRuntimeMs (9 min) < lockDurationMinutes (10 min) prevents stale workers.
 *   - Watermark advances ONLY when failed===0, !partialRun, stopReason===null.
 *   - Domain counters incremented using ONLY per-run line deltas from
 *     postBatchSummaries — never historical PO queries.
 *   - Lock conflict restores prior recovery-window status (never stuck in_progress).
 *   - Performs NO outbound ServiceTitan write calls.
 *
 * SECURITY:
 *   Admin/owner (manual) OR X-LVC-Scheduler-Secret (scheduled).
 *   The authorization decision is delegated to decideAdminOrSchedulerAuth
 *   (a shared pure helper tested directly by the validation suites).
 *   Caller-supplied role claims are never trusted. Secrets in the body
 *   are never accepted — only the X-LVC-Scheduler-Secret header is checked.
 *   Base44 scheduled automations cannot inject custom HTTP headers, so secure
 *   scheduled invocation is NOT supported under the approved security contract.
 *   This function remains manually invocable by an authorized admin/owner.
 *   No insecure bypass is implemented.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { decideAdminOrSchedulerAuth } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { getWatermark, activateWatermark } from "../../shared/stSync/stSyncWatermark.ts";
import { executeIncrementalSync, getPoSampleCount } from "../../shared/stSync/poIncrementalOrchestrator.ts";
import { purchaseOrderAdapter, resetPoTypeCache } from "../../shared/stSync/adapters/purchaseOrderAdapter.ts";
import {
  purchaseOrderWatermarkConfig,
  purchaseOrderLockConfig,
  PURCHASE_ORDER_MAX_PAGES,
  PURCHASE_ORDER_OVERLAP_MINUTES,
} from "../../shared/stSync/stPurchaseOrderSyncConfig.ts";

async function getPoWatermarkStats(base44: any, tenantId: string, environment: string) {
  const watermark = await getWatermark(base44, purchaseOrderWatermarkConfig, tenantId, environment);

  let deferredHeadersCount = 0;
  try {
    const deferred = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
      { entity_type: "purchase_order", status: "pending" },
      "-created_date",
      100
    );
    deferredHeadersCount = deferred.length;
  } catch { /* non-critical */ }

  // Bounded, identity-filtered sample count. The sample includes ONLY records
  // with a valid servicetitan_purchase_order_id and is capped at PO_SAMPLE_LIMIT.
  // The result NEVER claims to be a complete total — if qualifying records exceed
  // the limit, purchase_orders_synced_sample_is_capped is set to true.
  const sampleStats = await getPoSampleCount(base44);

  return { watermark, deferredHeadersCount, sampleStats };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication: admin/owner (manual) OR X-LVC-Scheduler-Secret (scheduled) ──
    const expectedSecret = Deno.env.get("LVC_SCHEDULER_SECRET") || "";
    const schedulerHeader = req.headers.get("X-LVC-Scheduler-Secret") || "";
    const auth = decideAdminOrSchedulerAuth(user, schedulerHeader, expectedSecret);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }

    const mode = body.mode || "watermark_status";
    const tenantId = body.tenant_id || getTenantId();
    const environment = body.environment || getEnvironment();

    // ── Watermark status mode ──
    if (mode === "watermark_status") {
      const stats = await getPoWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          last_modified_scan_at: stats.watermark.last_modified_scan_at,
          purchase_orders_imported_since_activation: stats.watermark.purchase_orders_imported_since_activation || 0,
          purchase_orders_imported_on_demand: stats.watermark.purchase_orders_imported_on_demand || 0,
          purchase_orders_updated: stats.watermark.purchase_orders_updated || 0,
          po_lines_created: stats.watermark.po_lines_created || 0,
          po_lines_updated: stats.watermark.po_lines_updated || 0,
          po_deferred_missing_vendor: stats.watermark.po_deferred_missing_vendor || 0,
          po_deferred_missing_warehouse: stats.watermark.po_deferred_missing_warehouse || 0,
          po_deferred_missing_material: stats.watermark.po_deferred_missing_material || 0,
          recovery_events_processed: stats.watermark.recovery_events_processed || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
        } : null,
        deferred_headers_count: stats.deferredHeadersCount,
        purchase_orders_synced_sample_count: stats.sampleStats.purchase_orders_synced_sample_count,
        purchase_orders_synced_sample_limit: stats.sampleStats.purchase_orders_synced_sample_limit,
        purchase_orders_synced_sample_is_capped: stats.sampleStats.purchase_orders_synced_sample_is_capped,
      });
    }

    // ── Activate mode ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, purchaseOrderWatermarkConfig, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          message: "Purchase Order Sync is already active — no changes made. Zero POs imported.",
        });
      }

      const watermark = await activateWatermark(base44, purchaseOrderWatermarkConfig, tenantId, environment, user?.email || "system");

      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
        },
        purchase_orders_imported: 0,
        message: "Watermark established. Zero POs imported, updated, or deleted.",
      });
    }

    // ── Incremental mode: production write path ──
    if (mode === "incremental") {
      const result = await executeIncrementalSync(base44, {
        adapter: purchaseOrderAdapter,
        lockConfig: purchaseOrderLockConfig,
        watermarkConfig: purchaseOrderWatermarkConfig,
        maxPages: PURCHASE_ORDER_MAX_PAGES,
        maxRecords: 5000,
        maxRuntimeMs: 540000, // 9 minutes (< 10-minute lock duration)
        overlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES,
        resetCache: resetPoTypeCache,
      }, { tenantId, environment, source: "api_recovery" });

      if (result.status === "no_watermark") {
        return Response.json({ mode: "incremental", ...result }, { status: 400 });
      }

      return Response.json({ mode: "incremental", ...result });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST PO SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Purchase Order incremental sync failed" }, { status: 500 });
  }
}