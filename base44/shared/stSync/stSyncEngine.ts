/**
 * Generic ServiceTitan Synchronization Engine
 *
 * Executes any domain adapter (Appointment, Customer, Job, Estimate, Invoice,
 * Membership, Project, Equipment) through a single shared processing pipeline.
 *
 * The engine owns ALL cross-cutting synchronization behavior:
 *   - lock acquisition and release
 *   - pagination loop (page-based and continuation-token)
 *   - cursor / page-state handling
 *   - maximum-page, maximum-record, and maximum-runtime safeguards
 *   - repeated-cursor and repeated-page detection
 *   - watermark reads
 *   - watermark advancement (write mode only — NOT enabled in Phase 3)
 *   - stale-event protection (optimistic concurrency)
 *   - dependency verification orchestration
 *   - deferred-record handling
 *   - create / update / unchanged decisions
 *   - retry classification
 *   - metrics and structured logging
 *   - failure containment (single-record failures do not terminate the batch)
 *   - post-batch processing
 *
 * The engine does NOT contain domain-specific field mapping, status
 * normalization, or hydration logic. All such behavior lives in adapters.
 *
 * Phase 3: dry_run mode only. Write mode is structurally implemented but
 * must not be enabled or scheduled during this phase.
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
  SyncRecordResult,
  SyncBatchResult,
} from "./stSyncAdapter.ts";
import type { LockConfig, WatermarkConfig } from "./stSyncTypes.ts";
import { acquireLock, releaseLock, getOrCreateCursor } from "./stSyncLock.ts";
import { getWatermark, isPostActivation } from "./stSyncWatermark.ts";
import { compareSourceVersions, nextPageState } from "./stSyncUtils.ts";
import { safeCreateWithRecheck, createSyncRetryMetrics, type SyncRetryMetrics } from "./stRateLimitProtection.ts";

// ─── Engine Configuration ────────────────────────────────────────────────────

export interface EngineConfig {
  /** Execution mode. Phase 3: dry_run only. */
  executionMode: "dry_run" | "write";
  /** Maximum pages per sync cycle. */
  maxPages: number;
  /** Maximum records per sync cycle. */
  maxRecords: number;
  /** Maximum runtime in milliseconds. */
  maxRuntimeMs: number;
  /** Maximum errors to retain in the result (bounded). Default: 50. */
  maxErrors?: number;
  /** Lock configuration. If omitted, no lock is acquired. */
  lockConfig?: LockConfig;
  /** Watermark configuration. If omitted, no watermark is read. */
  watermarkConfig?: WatermarkConfig;
  /** Filter field for recovery scans. */
  filterField?: "createdOn" | "modifiedOn";
  /** Recovery window start (ISO 8601), including overlap. */
  windowStart?: string;
  /** Recovery window end (ISO 8601). */
  windowEnd?: string;
}

// ─── Engine Result ────────────────────────────────────────────────────────────

export interface EngineError {
  sourceId: string;
  stage: string;
  message: string;
  timestamp: string;
}

export interface EngineResult<TPostBatchSummary = void> {
  domain: string;
  mode: "dry_run" | "write";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pagesFetched: number;
  recordsFetched: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  deferred: number;
  skipped: number;
  invalid: number;
  unsupported: number;
  failed: number;
  retries: number;
  apiRequests: number;
  apiErrors: number;
  watermarkBefore: any | null;
  watermarkAfter: any | null;
  lockAcquired: boolean;
  partialRun: boolean;
  stopReason: string | null;
  errors: EngineError[];
  retryMetrics: SyncRetryMetrics;
  postBatchSummaries: TPostBatchSummary[];
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Execute a full synchronization cycle for the given adapter.
 *
 * The engine is completely domain-agnostic. It delegates all domain-specific
 * behavior (mapping, lookup, dependency verification, create/update) to the
 * adapter through the ServiceTitanSyncAdapter interface.
 */
export async function runSyncEngine<TPostBatchSummary = void>(
  adapter: ServiceTitanSyncAdapter<any, any, any, TPostBatchSummary>,
  config: EngineConfig,
  base44: any,
  contextParams: {
    tenantId: string;
    environment: string;
    source: "webhook" | "api_recovery" | "on_demand_hydration" | "manual";
    eventType?: string;
    eventId?: string;
    payload?: any;
  }
): Promise<EngineResult<TPostBatchSummary>> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const maxErrors = config.maxErrors ?? 50;
  const errors: EngineError[] = [];

  // Metrics
  let pagesFetched = 0;
  let recordsFetched = 0;
  let processed = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let stale = 0;
  let deferred = 0;
  let skipped = 0;
  let invalid = 0;
  let unsupported = 0;
  let failed = 0;
  let retries = 0;
  let apiRequests = 0;
  let apiErrors = 0;
  let partialRun = false;
  let stopReason: string | null = null;

  // Safe-create retry metrics (shared uniqueness enforcement)
  const retryMetrics = createSyncRetryMetrics();
  const postBatchSummaries: TPostBatchSummary[] = [];

  // Safeguard tracking
  const seenPageNumbers = new Set<number>();
  const seenContinuationTokens = new Set<string>();

  // ── 1. Read watermark (read-only, both modes) ──
  let watermarkBefore: any = null;
  let watermarkAfter: any = null;
  if (config.watermarkConfig) {
    try {
      watermarkBefore = await getWatermark(
        base44,
        config.watermarkConfig,
        contextParams.tenantId,
        contextParams.environment
      );
    } catch (err) {
      addError(errors, maxErrors, "", "watermark_read", String(err));
    }
  }

  // ── 2. Lock acquisition (when lockConfig is provided) ──
  let lockAcquired = false;
  let cursor: any = null;
  let lockId: string | null = null;

  if (config.lockConfig) {
    try {
      cursor = await getOrCreateCursor(
        base44,
        config.lockConfig,
        adapter.integrationName,
        adapter.domain,
        contextParams.tenantId,
        contextParams.environment
      );
      lockId = await acquireLock(base44, config.lockConfig, cursor);
      if (!lockId) {
        // Lock conflict — another worker holds the lock
        console.warn(`[SYNC ENGINE] Lock conflict for domain='${adapter.domain}' — another worker is active`);
        return makeResult<TPostBatchSummary>(
          adapter.domain, config.executionMode, startedAt, startTime,
          { pagesFetched: 0, recordsFetched: 0, processed: 0, created: 0,
            updated: 0, unchanged: 0, stale: 0, deferred: 0, skipped: 0,
            invalid: 0, unsupported: 0, failed: 0, retries: 0,
            apiRequests: 0, apiErrors: 0 },
          watermarkBefore, watermarkBefore,
          false, false, "lock_conflict", errors, retryMetrics, []
        );
      }
      lockAcquired = true;
      console.log(`[SYNC ENGINE] Lock acquired for domain='${adapter.domain}' lockId='${lockId}'`);
    } catch (err) {
      addError(errors, maxErrors, "", "lock_acquisition", String(err));
      return makeResult<TPostBatchSummary>(
        adapter.domain, config.executionMode, startedAt, startTime,
        { pagesFetched: 0, recordsFetched: 0, processed: 0, created: 0,
          updated: 0, unchanged: 0, stale: 0, deferred: 0, skipped: 0,
          invalid: 0, unsupported: 0, failed: 0, retries: 0,
          apiRequests: 0, apiErrors: 0 },
        watermarkBefore, watermarkBefore,
        false, false, "lock_error", errors, retryMetrics, []
      );
    }
  }

  try {
    // ── 3. Build sync context ──
    const context: SyncContext = {
      base44,
      tenantId: contextParams.tenantId,
      environment: contextParams.environment,
      watermark: watermarkBefore,
      batchId: `engine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: contextParams.source,
      eventType: contextParams.eventType,
      eventId: contextParams.eventId,
      payload: contextParams.payload,
      lockId: lockId || undefined,
    };

    // ── 4. Initialize pagination ──
    let pagination = adapter.getInitialPaginationState(context);
    let hasMore = true;

    // ── 5. Pagination loop ──
    while (hasMore) {
      // ── Safeguard: max pages ──
      if (pagesFetched >= config.maxPages) {
        partialRun = true;
        stopReason = "max_pages_exceeded";
        console.warn(`[SYNC ENGINE] Max pages exceeded (${config.maxPages}) — stopping`);
        break;
      }

      // ── Safeguard: max runtime ──
      if (Date.now() - startTime > config.maxRuntimeMs) {
        partialRun = true;
        stopReason = "max_runtime_exceeded";
        console.warn(`[SYNC ENGINE] Max runtime exceeded (${config.maxRuntimeMs}ms) — stopping`);
        break;
      }

      // ── Safeguard: repeated pagination state ──
      if (pagination.mode === "page") {
        if (seenPageNumbers.has(pagination.page)) {
          partialRun = true;
          stopReason = "repeated_pagination_state";
          console.warn(`[SYNC ENGINE] Repeated page detected (page=${pagination.page}) — stopping`);
          break;
        }
        seenPageNumbers.add(pagination.page);
      } else if (pagination.mode === "continuation" && pagination.continuationToken) {
        if (seenContinuationTokens.has(pagination.continuationToken)) {
          partialRun = true;
          stopReason = "repeated_pagination_state";
          console.warn(`[SYNC ENGINE] Repeated continuation token detected — stopping`);
          break;
        }
        seenContinuationTokens.add(pagination.continuationToken);
      }

      // ── Fetch page ──
      let pageResult: SyncPageResult<any>;
      try {
        apiRequests++;
        pageResult = await adapter.fetchPage(context, {
          pagination,
          filterField: config.filterField,
          windowStart: config.windowStart,
          windowEnd: config.windowEnd,
        });
        pagesFetched++;
        console.log(
          `[SYNC ENGINE] Fetched page ${pagesFetched} for domain='${adapter.domain}': ` +
          `${(pageResult.records || []).length} records, hasMore=${pageResult.hasMore}`
        );
      } catch (err) {
        apiErrors++;
        addError(errors, maxErrors, "", "fetch_page", String(err));
        partialRun = true;
        stopReason = "api_error";
        console.error(`[SYNC ENGINE] Page fetch failed: ${err}`);
        break;
      }

      const records = pageResult.records || [];
      recordsFetched += records.length;
      const pageResults: SyncRecordResult[] = [];

      // ── Process each record (failure containment) ──
      for (const record of records) {
        if (processed >= config.maxRecords) {
          partialRun = true;
          stopReason = "max_records_exceeded";
          break;
        }

        try {
          const result = await processRecord(adapter, record, context, config, retryMetrics);
          processed++;
          pageResults.push(result);

          switch (result.action) {
            case "created": created++; break;
            case "updated": updated++; break;
            case "unchanged": unchanged++; break;
            case "skipped_stale": stale++; break;
            case "deferred": deferred++; break;
            case "skipped_pre_activation":
            case "skipped_duplicate":
              skipped++; break;
            case "failed":
              failed++;
              if (result.error) {
                addError(errors, maxErrors, result.sourceId || "", "record_processing", result.error);
              }
              break;
          }

          // Track status mapping diagnostics (generic, non-domain-specific)
          if (result.metadata?.record_invalid) invalid++;
          if (result.metadata?.status_unsupported) unsupported++;
          if (result.metadata?.status_invalid && !result.metadata?.record_invalid) invalid++;

          // Call lifecycle hooks (write mode only — dry_run performs no side effects)
          if (config.executionMode === "write") {
            if (result.action === "created" || result.action === "updated" || result.action === "unchanged") {
              if (adapter.onSuccess) {
                try {
                  await adapter.onSuccess(base44, result, context);
                } catch (hookErr) {
                  console.warn(`[SYNC ENGINE] onSuccess hook failed (non-fatal): ${hookErr}`);
                }
              }
            } else if (result.action === "failed" || result.action === "deferred") {
              if (adapter.onFailure) {
                try {
                  await adapter.onFailure(base44, new Error(result.error || "unknown"), null, context);
                } catch (hookErr) {
                  console.warn(`[SYNC ENGINE] onFailure hook failed (non-fatal): ${hookErr}`);
                }
              }
            }
          }
        } catch (err) {
          // ── Individual record failure — does NOT terminate the batch ──
          failed++;
          processed++;
          const sid = safeGetSourceId(adapter, record);
          addError(errors, maxErrors, sid, "record_processing", String(err));
          console.warn(`[SYNC ENGINE] Record failed (continuing batch): sourceId='${sid}' error='${err}'`);
        }
      }

      if (stopReason === "max_records_exceeded") break;

      // ── Post-batch processing (write mode only) ──
      if (config.executionMode === "write" && adapter.postBatchProcess) {
        try {
          const batch: SyncBatchResult = {
            sourceRecords: records,
            results: pageResults,
            pagination,
            hasMore: pageResult.hasMore,
            totalCount: pageResult.totalCount,
          };
          const batchSummary = await adapter.postBatchProcess(base44, batch, context);
          if (batchSummary) postBatchSummaries.push(batchSummary);
        } catch (err) {
          addError(errors, maxErrors, "", "post_batch", String(err));
          console.warn(`[SYNC ENGINE] Post-batch processing failed (non-fatal): ${err}`);
        }
      }

      // ── Advance pagination ──
      hasMore = pageResult.hasMore;
      if (hasMore) {
        if (pagination.mode === "page" && pageResult.nextPage != null) {
          pagination = { mode: "page", page: pageResult.nextPage, pageSize: pagination.pageSize };
        } else if (pagination.mode === "continuation" && pageResult.nextContinuationToken != null) {
          pagination = {
            mode: "continuation",
            continuationToken: pageResult.nextContinuationToken,
            pageSize: pagination.pageSize,
          };
        } else if (pagination.mode === "page") {
          // hasMore but no explicit nextPage — increment
          pagination = nextPageState(pagination);
        } else {
          // No way to advance — stop
          hasMore = false;
        }
      }
    }

    // ── 6. Watermark advancement (write mode only) ──
    // In dry_run mode, watermarkAfter === watermarkBefore (no changes).
    // In write mode, the watermark advances only when the full cycle
    // completes with zero failures and no partial-run stop.
    watermarkAfter = watermarkBefore;
    if (
      config.executionMode === "write" &&
      config.watermarkConfig &&
      watermarkBefore &&
      !partialRun &&
      failed === 0 &&
      stopReason === null
    ) {
      try {
        const nowIso = new Date().toISOString();
        const advanceTo = config.windowEnd || nowIso;
        const wmUpdate: Record<string, any> = {
          last_modified_scan_at: advanceTo,
          last_successful_sync_at: nowIso,
          recovery_window_status: "idle",
        };
        await base44.asServiceRole.entities[config.watermarkConfig.entityName].update(
          watermarkBefore.id,
          wmUpdate
        );
        watermarkAfter = { ...watermarkBefore, ...wmUpdate };

        // Domain-specific counters (jobs_imported_since_activation, etc.) are
        // NOT updated by the generic engine. They must be handled by the
        // adapter's onSuccess hook or domain-specific orchestration layer.
        console.log(`[SYNC ENGINE] Watermark advanced for domain='${adapter.domain}' to '${advanceTo}'`);
      } catch (wmErr) {
        addError(errors, maxErrors, "", "watermark_advancement", String(wmErr));
        console.error(`[SYNC ENGINE] Watermark advancement failed: ${wmErr}`);
      }
    }

  } finally {
    // ── 7. Release lock (always, in finally) ──
    if (lockAcquired && cursor && lockId && config.lockConfig) {
      try {
        await releaseLock(base44, config.lockConfig, cursor.id, lockId, {}, true);
        console.log(`[SYNC ENGINE] Lock released for domain='${adapter.domain}' lockId='${lockId}'`);
      } catch (err) {
        addError(errors, maxErrors, "", "lock_release", String(err));
        console.error(`[SYNC ENGINE] Lock release failed: ${err}`);
      }
    }
  }

  return makeResult<TPostBatchSummary>(
    adapter.domain, config.executionMode, startedAt, startTime,
    { pagesFetched, recordsFetched, processed, created, updated, unchanged,
      stale, deferred, skipped, invalid, unsupported, failed, retries,
      apiRequests, apiErrors },
    watermarkBefore, watermarkAfter,
    lockAcquired, partialRun, stopReason, errors, retryMetrics, postBatchSummaries
  );
}

// ─── Record Processing Pipeline ──────────────────────────────────────────────

/**
 * Process a single source record through the full pipeline.
 *
 * Pipeline order:
 *   1. Extract and validate source ID
 *   2. Extract source timestamps
 *   3. Check activation watermark eligibility
 *   4. Map the source record
 *   5. Find existing local record
 *   6. Compare versions (stale-event protection)
 *   7. Verify required dependencies
 *   8. (Defer when dependencies cannot be resolved)
 *   9. Compare mapped data with existing local record
 *   10. Create, update, or classify as unchanged
 *
 * Note: mapRecord (step 4) is executed before findExisting (step 5) because
 * the adapter interface requires mapped data for local lookup. The key
 * invariant — stale data is rejected before dependencies are verified and
 * before records are created — is preserved.
 */
async function processRecord<TPostBatchSummary = void>(
  adapter: ServiceTitanSyncAdapter<any, any, any, TPostBatchSummary>,
  record: any,
  context: SyncContext,
  config: EngineConfig,
  retryMetrics: SyncRetryMetrics
): Promise<SyncRecordResult> {
  // ── 1. Extract and validate source ID ──
  const sourceId = adapter.getSourceId(record);
  if (!sourceId) {
    return {
      action: "failed",
      sourceId: "",
      error: "Missing source ID",
      metadata: { record_invalid: true },
    };
  }

  // ── 2. Extract source timestamps ──
  const sourceCreatedOn = adapter.getSourceCreatedOn(record);
  const sourceModifiedOn = adapter.getSourceModifiedOn(record);

  // ── 3. Check activation watermark eligibility ──
  if (adapter.checkEligibility) {
    const eligibility = await adapter.checkEligibility(
      context.base44, record, null, context
    );
    if (!eligibility.allowed) {
      return {
        action: "skipped_pre_activation",
        sourceId,
        error: eligibility.reason || eligibility.message || "Not eligible",
      };
    }
  } else if (context.watermark) {
    const eligibility = isPostActivation(
      sourceCreatedOn,
      context.watermark.activation_timestamp
    );
    if (!eligibility.allowed) {
      return {
        action: "skipped_pre_activation",
        sourceId,
        error: eligibility.reason || "Pre-activation",
      };
    }
  }

  // ── 4. Map the source record ──
  const mapped = await adapter.mapRecord(record, context);

  // Track status mapping diagnostics (generic field name, non-domain-specific).
  // The engine does NOT interpret status strings — it reads the diagnostic
  // field that the adapter's mapRecord may produce.
  const metadata: Record<string, any> = {};
  if (mapped && typeof mapped === "object") {
    const smr = (mapped as any).status_mapping_result;
    if (smr === "unsupported") metadata.status_unsupported = true;
    else if (smr === "invalid") metadata.status_invalid = true;
  }

  // ── 5. Find existing local record ──
  const existing = await adapter.findExisting(context.base44, mapped, context);

  // ── 6. Compare versions (stale-event protection) ──
  if (existing) {
    const localModifiedOn = adapter.getLocalSourceModifiedOn(existing);
    const comparison = compareSourceVersions({
      incomingModifiedOn: sourceModifiedOn,
      localModifiedOn,
    });

    // Reject stale or invalid-incoming records (fail-closed)
    if (comparison === "older" || comparison === "invalid_incoming") {
      return {
        action: "skipped_stale",
        sourceId,
        error: `Stale record (${comparison})`,
        metadata,
      };
    }
  }

  // ── 7. Verify required dependencies ──
  if (adapter.verifyDependencies) {
    const depResult = await adapter.verifyDependencies(
      context.base44, mapped, context
    );

    // ── 8. Defer when dependencies cannot be resolved ──
    if (depResult.status === "deferred") {
      return {
        action: "deferred",
        sourceId,
        error: depResult.warning || "Dependencies not resolved",
        warnings: depResult.deferredRecordId
          ? [`Deferred record: ${depResult.deferredRecordId}`]
          : undefined,
        metadata,
      };
    }
    if (depResult.status === "failed") {
      return {
        action: "failed",
        sourceId,
        error: depResult.warning || "Dependency verification failed",
        metadata,
      };
    }
  }

  // ── 9. Compare mapped data with existing local record ──
  if (existing && adapter.recordsEqual(existing, mapped)) {
    return { action: "unchanged", sourceId, local: existing, metadata };
  }

  // ── 10. Create, update, or classify as unchanged ──
  if (config.executionMode === "dry_run") {
    // Dry-run: classify what WOULD happen without writing
    if (existing) {
      return { action: "updated", sourceId, local: existing, metadata };
    }
    return { action: "created", sourceId, metadata };
  }

  // Write mode: actually create or update
  if (existing) {
    const updatedRecord = await adapter.updateRecord(
      context.base44, existing, mapped, context
    );
    return { action: "updated", sourceId, local: updatedRecord, metadata };
  }
  // ── Safe create with post-create recheck ──
  // The engine NEVER calls adapter.createRecord() directly. Instead it
  // routes through safeCreateWithRecheck to enforce uniqueness protection:
  // after any createRecord failure, findExisting() is performed again
  // before retrying. This prevents duplicate records when a create
  // partially commits (e.g. due to a rate-limit error mid-write).
  const createResult = await safeCreateWithRecheck(
    () => adapter.findExisting(context.base44, mapped, context),
    () => adapter.createRecord(context.base44, mapped, context),
    (existingRecord: any) => adapter.updateRecord(context.base44, existingRecord, mapped, context),
    retryMetrics,
    5
  );
  // create_recheck_recovery means the record was found on post-create
  // recheck after a partial commit — it was effectively updated, not
  // created. Classify as "updated" to keep watermark metrics accurate.
  const action = createResult.action === "created" ? "created" : "updated";
  return { action, sourceId, local: createResult.record, metadata };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addError(
  errors: EngineError[],
  maxErrors: number,
  sourceId: string,
  stage: string,
  message: string
): void {
  if (errors.length >= maxErrors) return;
  errors.push({
    sourceId,
    stage,
    message: message.substring(0, 500),
    timestamp: new Date().toISOString(),
  });
}

function safeGetSourceId<TPostBatchSummary = void>(adapter: ServiceTitanSyncAdapter<any, any, any, TPostBatchSummary>, record: any): string {
  try {
    return adapter.getSourceId(record) || "";
  } catch {
    return "";
  }
}

function makeResult<TPostBatchSummary = void>(
  domain: string,
  mode: "dry_run" | "write",
  startedAt: string,
  startTime: number,
  metrics: {
    pagesFetched: number;
    recordsFetched: number;
    processed: number;
    created: number;
    updated: number;
    unchanged: number;
    stale: number;
    deferred: number;
    skipped: number;
    invalid: number;
    unsupported: number;
    failed: number;
    retries: number;
    apiRequests: number;
    apiErrors: number;
  },
  watermarkBefore: any,
  watermarkAfter: any,
  lockAcquired: boolean,
  partialRun: boolean,
  stopReason: string | null,
  errors: EngineError[],
  retryMetrics: SyncRetryMetrics,
  postBatchSummaries: TPostBatchSummary[]
): EngineResult<TPostBatchSummary> {
  return {
    domain,
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    ...metrics,
    watermarkBefore,
    watermarkAfter,
    lockAcquired,
    partialRun,
    stopReason,
    errors,
    retryMetrics,
    postBatchSummaries,
  };
}