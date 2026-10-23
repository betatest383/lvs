/**
 * Purchase Order Incremental Orchestration — Stage 2E.2A
 *
 * Extracted from runServiceTitanPurchaseOrderIncrementalSync so the real
 * incremental orchestration path can be tested deterministically with mocked
 * ServiceTitan reads and isolated mock entities — without standing up an
 * HTTP server or calling createClientFromRequest.
 *
 * Responsibilities:
 *   - Read the active watermark (reject if none).
 *   - Compute the recovery window with the approved 5-minute overlap.
 *   - Save the prior recovery-window status (for lock-conflict restoration).
 *   - Mark recovery_window_status="in_progress" BEFORE the engine runs.
 *   - Run the generic sync engine with the approved PO adapter.
 *   - On lock conflict: RESTORE the prior recovery-window status (never
 *     leave it stuck at "in_progress").
 *   - On success: increment domain counters using ONLY per-run line deltas
 *     from postBatchSummaries — never historical PO queries.
 *   - On partial failure (not lock conflict): mark recovery_window_status="failed".
 *
 * Direction: ServiceTitan → LVC OS ONLY. No outbound ST writes.
 */

import type { ServiceTitanSyncAdapter } from "./stSyncAdapter.ts";
import type { LockConfig, WatermarkConfig } from "./stSyncTypes.ts";
import { runSyncEngine } from "./stSyncEngine.ts";
import { getWatermark, incrementWatermarkCounters } from "./stSyncWatermark.ts";
import type { PoLineBatchSummary } from "./adapters/purchaseOrderAdapter.ts";

export interface IncrementalSyncConfig {
  adapter: ServiceTitanSyncAdapter<any, any, any, PoLineBatchSummary>;
  lockConfig: LockConfig;
  watermarkConfig: WatermarkConfig;
  maxPages: number;
  maxRecords: number;
  maxRuntimeMs: number;
  overlapMinutes: number;
  resetCache?: () => void;
}

export interface IncrementalSyncResult {
  status: "completed" | "partial_failure" | "already_running" | "no_watermark";
  domain: string;
  execution_mode: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  pages_fetched: number;
  headers_fetched: number;
  headers_processed: number;
  headers_created: number;
  headers_updated: number;
  headers_unchanged: number;
  headers_stale: number;
  headers_deferred: number;
  headers_failed: number;
  lock_acquired: boolean;
  partial_run: boolean;
  stop_reason: string | null;
  watermark_advanced: boolean;
  window_start: string;
  window_end: string;
  overlap_minutes: number;
  per_run_line_counters: PoLineBatchSummary;
  outbound_writes: number;
  errors: any[];
  message: string;
}

function emptySummary(): PoLineBatchSummary {
  return {
    po_lines_created_this_run: 0,
    po_lines_updated_this_run: 0,
    po_lines_unchanged_this_run: 0,
    po_lines_stale_this_run: 0,
    po_lines_deferred_this_run: 0,
    po_lines_failed_this_run: 0,
  };
}

/**
 * Aggregate per-run line summaries from the engine's postBatchSummaries.
 * Each summary is a PoLineBatchSummary produced by one postBatchProcess call.
 * The total represents the exact per-run line outcomes — never a historical
 * recount.
 */
function aggregateLineSummaries(summaries: PoLineBatchSummary[]): PoLineBatchSummary {
  const result = emptySummary();
  for (const s of summaries) {
    if (!s) continue;
    result.po_lines_created_this_run += s.po_lines_created_this_run || 0;
    result.po_lines_updated_this_run += s.po_lines_updated_this_run || 0;
    result.po_lines_unchanged_this_run += s.po_lines_unchanged_this_run || 0;
    result.po_lines_stale_this_run += s.po_lines_stale_this_run || 0;
    result.po_lines_deferred_this_run += s.po_lines_deferred_this_run || 0;
    result.po_lines_failed_this_run += s.po_lines_failed_this_run || 0;
  }
  return result;
}

export async function executeIncrementalSync(
  base44: any,
  config: IncrementalSyncConfig,
  contextParams: { tenantId: string; environment: string; source: string }
): Promise<IncrementalSyncResult> {
  const { watermarkConfig, lockConfig, adapter } = config;

  // ── 1. Read watermark ──
  const watermark = await getWatermark(base44, watermarkConfig, contextParams.tenantId, contextParams.environment);
  if (!watermark || watermark.status !== "active") {
    return {
      status: "no_watermark",
      domain: adapter.domain,
      execution_mode: "write",
      started_at: "", finished_at: "", duration_ms: 0,
      pages_fetched: 0, headers_fetched: 0, headers_processed: 0,
      headers_created: 0, headers_updated: 0, headers_unchanged: 0,
      headers_stale: 0, headers_deferred: 0, headers_failed: 0,
      lock_acquired: false, partial_run: false, stop_reason: null,
      watermark_advanced: false, window_start: "", window_end: "",
      overlap_minutes: config.overlapMinutes,
      per_run_line_counters: emptySummary(),
      outbound_writes: 0, errors: [],
      message: "No active Purchase Order Sync watermark found. Activate the watermark first using mode='activate'.",
    };
  }

  // ── 2. Compute recovery window with 5-minute overlap ──
  const overlapMinutes = watermark.recovery_overlap_minutes || config.overlapMinutes;
  const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
  const windowStart = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000);
  const windowEnd = new Date();

  // ── 3. Save prior recovery-window state (for lock-conflict restoration) ──
  // All four fields are preserved so a lock conflict can restore them exactly.
  // Prior timestamps are NOT replaced with null unless their prior values were null.
  const priorRecoveryStatus = watermark.recovery_window_status || "idle";
  const priorRecoveryStart = watermark.recovery_window_start ?? null;
  const priorRecoveryEnd = watermark.recovery_window_end ?? null;
  const priorRecoveryErrors = watermark.recovery_window_errors ?? 0;

  // ── 4. Mark recovery window as in-progress ──
  // If the engine returns lock_conflict, step 7 restores all four prior fields.
  try {
    await base44.asServiceRole.entities[watermarkConfig.entityName].update(watermark.id, {
      recovery_window_start: windowStart.toISOString(),
      recovery_window_end: windowEnd.toISOString(),
      recovery_window_status: "in_progress",
      recovery_window_errors: 0,
    });
  } catch { /* non-critical */ }

  // ── 5. Reset PO Type cache (fresh rebuild per run) ──
  if (config.resetCache) config.resetCache();

  // ── 6. Run the engine ──
  const result = await runSyncEngine(adapter, {
    executionMode: "write",
    maxPages: config.maxPages,
    maxRecords: config.maxRecords,
    maxRuntimeMs: config.maxRuntimeMs,
    lockConfig,
    watermarkConfig,
    filterField: "modifiedOn",
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }, base44, contextParams);

  const lockConflict = result.stopReason === "lock_conflict";
  const succeeded = result.lockAcquired && !result.partialRun && result.failed === 0 && result.stopReason === null;

  // ── 7. Lock-conflict recovery: restore ALL prior recovery-window fields ──
  // A lock conflict must NOT leave the watermark permanently in_progress.
  // All four fields are restored to their exact prior values — prior timestamps
  // are NOT replaced with null unless their prior values were null.
  if (lockConflict) {
    try {
      await base44.asServiceRole.entities[watermarkConfig.entityName].update(watermark.id, {
        recovery_window_status: priorRecoveryStatus,
        recovery_window_start: priorRecoveryStart,
        recovery_window_end: priorRecoveryEnd,
        recovery_window_errors: priorRecoveryErrors,
      });
    } catch { /* non-critical */ }
  }

  // ── 8. Compute per-run line counters from postBatchSummaries ──
  // NO historical PO queries — only the current run's deltas.
  // result.postBatchSummaries is typed PoLineBatchSummary[] — no cast needed.
  const lineSummary = aggregateLineSummaries(result.postBatchSummaries);

  // ── 9. On success: increment domain counters using ONLY per-run deltas ──
  if (succeeded) {
    try {
      await incrementWatermarkCounters(base44, watermarkConfig.entityName, watermark.id, {
        purchase_orders_imported_since_activation: result.created,
        purchase_orders_updated: result.updated,
        po_lines_created: lineSummary.po_lines_created_this_run,
        po_lines_updated: lineSummary.po_lines_updated_this_run,
        recovery_events_processed: result.processed,
      });
    } catch { /* non-critical */ }
  }

  // ── 10. On partial failure (not lock conflict): mark recovery_window_status="failed" ──
  if (!succeeded && !lockConflict) {
    try {
      await base44.asServiceRole.entities[watermarkConfig.entityName].update(watermark.id, {
        recovery_window_status: "failed",
        recovery_window_errors: result.failed,
      });
    } catch { /* non-critical */ }
  }

  const watermarkAdvanced = !!(result.watermarkAfter && result.watermarkBefore
    && result.watermarkAfter.last_modified_scan_at !== result.watermarkBefore.last_modified_scan_at);

  return {
    status: lockConflict ? "already_running" : (succeeded ? "completed" : "partial_failure"),
    domain: result.domain,
    execution_mode: result.mode,
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    duration_ms: result.durationMs,
    pages_fetched: result.pagesFetched,
    headers_fetched: result.recordsFetched,
    headers_processed: result.processed,
    headers_created: result.created,
    headers_updated: result.updated,
    headers_unchanged: result.unchanged,
    headers_stale: result.stale,
    headers_deferred: result.deferred,
    headers_failed: result.failed,
    lock_acquired: result.lockAcquired,
    partial_run: result.partialRun,
    stop_reason: result.stopReason,
    watermark_advanced: watermarkAdvanced,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    overlap_minutes: overlapMinutes,
    per_run_line_counters: lineSummary,
    outbound_writes: 0,
    errors: result.errors,
    message: succeeded
      ? `Incremental PO sync completed: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged. Lines: ${lineSummary.po_lines_created_this_run} created, ${lineSummary.po_lines_updated_this_run} updated. Watermark advanced.`
      : lockConflict
        ? "Another incremental PO sync worker is already running."
        : `Incremental PO sync partial failure: ${result.failed} failed, ${result.deferred} deferred. Watermark NOT advanced.`,
  };
}

// ─── Purchase-Order Sample Count (bounded, identity-filtered) ──────────────────

/**
 * Maximum number of PurchaseOrder records examined when building the
 * synced-sample count. The sample is bounded — it does NOT claim to be a
 * complete total. If more than PO_SAMPLE_LIMIT qualifying records exist, the
 * result is marked capped.
 */
export const PO_SAMPLE_LIMIT = 5000;

export interface PoSampleCountResult {
  /** Bounded count of PurchaseOrders with a valid ServiceTitan PO identity. */
  purchase_orders_synced_sample_count: number;
  /** The fixed limit used for the bounded sample. */
  purchase_orders_synced_sample_limit: number;
  /** True when qualifying records exceed the sample limit (count is capped). */
  purchase_orders_synced_sample_is_capped: boolean;
}

/**
 * Compute a bounded, identity-filtered sample count of synced PurchaseOrders.
 *
 * The sample includes ONLY records with a non-empty servicetitan_purchase_order_id
 * (the canonical ServiceTitan identity). Non-ServiceTitan PurchaseOrder records
 * (e.g. manually created, LVC-internal) are excluded.
 *
 * The sample is bounded at PO_SAMPLE_LIMIT. If qualifying records exceed the
 * limit, purchase_orders_synced_sample_is_capped is set to true and the count
 * is capped at the limit. The result NEVER claims to be a complete total.
 */
export async function getPoSampleCount(base44: any): Promise<PoSampleCountResult> {
  const sampleLimit = PO_SAMPLE_LIMIT;
  let sampleCount = 0;
  let isCapped = false;
  try {
    // Server-side filtered retrieval: filter for records with a valid, non-empty,
    // non-whitespace servicetitan_purchase_order_id BEFORE the limit is applied.
    //
    // $regex: "\\S" matches strings containing at least one non-whitespace
    // character — excluding empty strings, null, missing fields, and
    // whitespace-only strings. $exists: true excludes records where the field
    // is missing entirely.
    //
    // Because the filter is applied server-side BEFORE the limit, non-ServiceTitan
    // records (empty, null, or whitespace-only IDs) cannot displace qualifying
    // records within the bounded retrieval. This ensures purchase_orders_synced_
    // sample_is_capped reliably indicates whether qualifying ServiceTitan
    // PurchaseOrders exceed the sample limit.
    const pos = await base44.asServiceRole.entities.PurchaseOrder.filter(
      { servicetitan_purchase_order_id: { $regex: "\\S", $exists: true } },
      "-servicetitan_last_sync",
      sampleLimit + 1
    );
    if (pos.length > sampleLimit) {
      isCapped = true;
      sampleCount = sampleLimit;
    } else {
      sampleCount = pos.length;
    }
  } catch { /* non-critical — return zeros */ }
  return {
    purchase_orders_synced_sample_count: sampleCount,
    purchase_orders_synced_sample_limit: sampleLimit,
    purchase_orders_synced_sample_is_capped: isCapped,
  };
}