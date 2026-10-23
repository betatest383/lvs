/**
 * Generic Sync Recovery Scan — Windowed, Safe Advancement
 *
 * Provides the windowed recovery scan pattern used by all sync domains.
 * Each domain supplies fetchPage and processRecord callbacks.
 *
 * SAFE ADVANCEMENT:
 *   - The scan window starts at (last_scan_at - overlap) and ends at now.
 *   - The cursor only advances to window_end if the entire window
 *     completes with zero errors.
 *   - The overlap protects against clock drift, delayed writes,
 *     and same-timestamp records.
 *   - Records are sorted by createdOn (or modifiedOn), then ServiceTitan ID
 *     (stable secondary ordering).
 *   - If any record fails, the window is marked failed and the cursor
 *     does NOT advance.
 */

import type { RecoveryScanConfig, RecoveryScanResult, RecoveryScanContext } from "./stSyncTypes.ts";
import { getWatermark, DEFAULT_RECOVERY_OVERLAP_MINUTES } from "./stSyncWatermark.ts";

const DEFAULT_MAX_PAGES = 100;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Run a windowed recovery scan for records created/modified since the last scan.
 *
 * @param base44          SDK client
 * @param config          Recovery scan configuration (fetchPage, processRecord, etc.)
 * @param environment     ServiceTitan environment
 * @param tenantId        ServiceTitan tenant ID
 * @param watermark       The active watermark record
 * @param scanField       Which watermark field to use as the cursor:
 *                        "last_created_scan_at" or "last_modified_scan_at"
 */
export async function runRecoveryScan(
  base44: any,
  config: RecoveryScanConfig,
  environment: string,
  tenantId: string,
  watermark: any,
  scanField: "last_created_scan_at" | "last_modified_scan_at" = "last_created_scan_at"
): Promise<RecoveryScanResult> {
  if (!watermark || watermark.status !== "active") {
    return emptyRecoveryResult("Watermark not active — recovery scan skipped");
  }

  const activationTs = watermark.activation_timestamp;
  if (!activationTs) {
    return emptyRecoveryResult("Watermark has no activation timestamp — recovery scan skipped");
  }

  const now = new Date();
  const overlapMinutes = watermark.recovery_overlap_minutes || config.defaultOverlapMinutes || DEFAULT_RECOVERY_OVERLAP_MINUTES;
  const lastScanAt = watermark[scanField] || activationTs;
  const lastScanTime = new Date(lastScanAt);

  // Window start = last scan - overlap (protects against clock drift)
  const windowStart = new Date(lastScanTime.getTime() - overlapMinutes * 60 * 1000);
  const windowEnd = now;

  // For the first scan, use activation timestamp as the start
  const scanSince = watermark[scanField]
    ? windowStart.toISOString()
    : activationTs;

  const maxPages = config.maxPages || DEFAULT_MAX_PAGES;
  const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;
  const batchId = `RECOVERY-${config.domain}-${Date.now().toString(36)}`;

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let deferred = 0;
  let skipped = 0;
  let errors = 0;
  let pagesProcessed = 0;
  let totalScanned = 0;
  let hasMore = false;

  console.log(`[ST RECOVERY ${config.domain}] Scanning since ${scanSince} (window: ${windowStart.toISOString()} → ${windowEnd.toISOString()})`);

  // Mark window as in-progress
  await base44.asServiceRole.entities[config.watermarkEntityName].update(watermark.id, {
    recovery_window_start: windowStart.toISOString(),
    recovery_window_end: windowEnd.toISOString(),
    recovery_window_status: "in_progress",
    recovery_window_errors: 0,
  });

  const scanContext: RecoveryScanContext = {
    tenantId,
    environment,
    watermark,
    batchId,
  };

  for (let page = 1; page <= maxPages; page++) {
    try {
      const pageResult = await config.fetchPage(environment, tenantId, scanSince, page, pageSize);

      if (pageResult.records.length === 0) {
        hasMore = false;
        break;
      }

      // Sort by createdOn (or modifiedOn), then ST ID (stable secondary ordering)
      const sortedRecords = [...pageResult.records].sort((a, b) => {
        const aCreated = a.createdOn || a.created_on || a.modifiedOn || "";
        const bCreated = b.createdOn || b.created_on || b.modifiedOn || "";
        if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
        const aId = String(a.id || "");
        const bId = String(b.id || "");
        return aId.localeCompare(bId);
      });

      totalScanned += sortedRecords.length;

      for (const record of sortedRecords) {
        try {
          const result = await config.processRecord(base44, record, scanContext);
          switch (result.action) {
            case "created": created++; break;
            case "updated": updated++; break;
            case "unchanged": unchanged++; break;
            case "deferred": deferred++; break;
            case "skipped": skipped++; break;
            case "error":
              errors++;
              if (result.error) console.error(`[ST RECOVERY ${config.domain}] Record error: ${result.error}`);
              break;
          }
        } catch (err: any) {
          console.error(`[ST RECOVERY ${config.domain}] Record processing failed:`, err.message);
          errors++;
        }
      }

      pagesProcessed++;
      hasMore = pageResult.hasMore;
      if (!hasMore) break;
    } catch (err: any) {
      console.error(`[ST RECOVERY ${config.domain}] Page ${page} failed:`, err.message);
      errors++;
      hasMore = true;
      break;
    }
  }

  // ── SAFE CURSOR ADVANCEMENT ──
  const cursorAdvanced = errors === 0;
  const nowIso = now.toISOString();

  if (cursorAdvanced) {
    const updateData: Record<string, any> = {
      [scanField]: windowEnd.toISOString(),
      last_successful_sync_at: nowIso,
      recovery_window_status: "completed",
      recovery_window_errors: 0,
    };
    await base44.asServiceRole.entities[config.watermarkEntityName].update(watermark.id, updateData);
  } else {
    await base44.asServiceRole.entities[config.watermarkEntityName].update(watermark.id, {
      recovery_window_status: "failed",
      recovery_window_errors: errors,
    });
  }

  const summary =
    `Recovery scan (${config.domain}): ${pagesProcessed} pages, ${totalScanned} records scanned. ` +
    `Created: ${created}, Updated: ${updated}, Unchanged: ${unchanged}, ` +
    `Deferred: ${deferred}, Skipped: ${skipped}, Errors: ${errors}. ` +
    `Cursor advanced: ${cursorAdvanced}.`;

  console.log(`[ST RECOVERY ${config.domain}] ${summary}`);

  return {
    records_created: created,
    records_updated: updated,
    records_unchanged: unchanged,
    records_deferred: deferred,
    records_skipped: skipped,
    errors,
    pages_processed: pagesProcessed,
    total_records_scanned: totalScanned,
    has_more: hasMore,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    cursor_advanced: cursorAdvanced,
    summary,
  };
}

function emptyRecoveryResult(message: string): RecoveryScanResult {
  return {
    records_created: 0, records_updated: 0, records_unchanged: 0,
    records_deferred: 0, records_skipped: 0, errors: 0,
    pages_processed: 0, total_records_scanned: 0, has_more: false,
    window_start: "", window_end: "", cursor_advanced: false,
    summary: message,
  };
}