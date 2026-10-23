/**
 * runServiceTitanVendorIncrementalSync
 *
 * Stage 2C Vendor Sync — ServiceTitan → LVC OS only.
 *
 * Performs NO outbound ServiceTitan Vendor writes. No deletion of
 * ServiceTitan or LVC OS records. Does not touch Purchase Order, Material,
 * Inventory, Receiving, or Transfer domains.
 *
 * Modes:
 *   watermark_status       — Read-only watermark status
 *   activate               — Idempotent watermark activation (zero writes)
 *   verify_api_created_on  — Read-only API connectivity check (pageSize=1)
 *   verify_api_modified_on — Read-only API connectivity check (pageSize=1)
 *   estimate_backfill      — Read-only record count estimate
 *   dry_run                — Owner-only read-only report: retrieves vendor
 *                            pages and classifies every record without
 *                            writing. Reports new/matched/unchanged/would-
 *                            update/inactive/duplicate-st-ids/missing-ids/
 *                            invalid-field-values/name-collisions/field-diffs.
 *   incremental            — Owner-only controlled write path: syncs modified
 *                            vendors via the generic sync engine + approved
 *                            Vendor adapter. Uses cursor lock, watermark
 *                            windowing, stale-event protection, idempotent
 *                            upsert by servicetitan_vendor_id, and safe
 *                            watermark advancement (only on full success with
 *                            zero failures).
 *
 * Security:
 *   - Authenticated callers must be admin or owner.
 *   - Unauthenticated (scheduled) invocations must pass SCHEDULER_SECRET.
 *   - The browser never connects directly to ServiceTitan or PostgreSQL —
 *     all API calls are server-side via the shared auth layer.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment, apiRequest } from "../../shared/stAuth.ts";
import { getWatermark, activateWatermark, incrementWatermarkCounters } from "../../shared/stSync/stSyncWatermark.ts";
import { verifyApiEndpoint, estimateRecordCount } from "../../shared/stSync/stSyncApiVerification.ts";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import { vendorAdapter } from "../../shared/stSync/adapters/vendorAdapter.ts";
import {
  vendorWatermarkConfig,
  vendorLockConfig,
  VENDORS_API_PATH,
  VENDOR_PAGE_SIZE,
  VENDOR_MAX_PAGES,
} from "../../shared/stSync/stVendorSyncConfig.ts";
import {
  VENDOR_ST_OWNED_FIELDS,
  VENDOR_LVC_OWNED_FIELDS,
  buildVendorUpdateData,
} from "../../shared/stVendorSync.ts";

async function getVendorWatermarkStats(base44: any, tenantId: string, environment: string) {
  const watermark = await getWatermark(base44, vendorWatermarkConfig, tenantId, environment);

  let vendorsTotal = 0;
  let vendorsWithStId = 0;
  try {
    const all = await base44.asServiceRole.entities.Vendor.filter(
      { servicetitan_vendor_id: { $ne: null } },
      "-servicetitan_last_sync",
      5000
    );
    vendorsWithStId = all.length;
  } catch { /* non-critical */ }
  try {
    const sample = await base44.asServiceRole.entities.Vendor.list(1);
    vendorsTotal = sample.length > 0 ? -1 : 0; // list(1) returns 1 if any exist
    if (vendorsTotal === -1) {
      const allSynced = await base44.asServiceRole.entities.Vendor.filter({}, "-created_date", 5000);
      vendorsTotal = allSynced.length;
    }
  } catch { /* non-critical */ }

  return { watermark, vendorsWithStId, vendorsTotal };
}

// ─── Dry-Run Analyzer ─────────────────────────────────────────────────────────

/**
 * Read-only dry-run report. Fetches vendor pages from the ServiceTitan API,
 * classifies every record, and produces the detailed report required before
 * any write. Performs ZERO writes and does NOT acquire the lock (read-only).
 *
 * Reuses the real vendor adapter for fetchPage / getSourceId / mapRecord /
 * findExisting / recordsEqual so the classification matches the write path.
 */
async function runVendorDryRun(
  base44: any,
  tenantId: string,
  environment: string,
  watermark: any,
  overrides?: { window_start?: string; window_end?: string }
): Promise<any> {
  const overlapMinutes = watermark.recovery_overlap_minutes || vendorWatermarkConfig.defaultOverlapMinutes || 5;
  let windowStartIso: string;
  let windowEndIso: string;
  let overrideUsed = false;

  if (overrides && (overrides.window_start || overrides.window_end)) {
    // ── Owner-controlled historical override (dry-run ONLY) ──
    // Validate both timestamps; reject malformed or reversed windows.
    const startMs = overrides.window_start ? Date.parse(overrides.window_start) : NaN;
    const endMs = overrides.window_end ? Date.parse(overrides.window_end) : NaN;
    if (overrides.window_start && Number.isNaN(startMs)) {
      throw new Error("Invalid window_start — malformed timestamp rejected");
    }
    if (overrides.window_end && Number.isNaN(endMs)) {
      throw new Error("Invalid window_end — malformed timestamp rejected");
    }
    const finalStart = overrides.window_start ? new Date(startMs).toISOString() : new Date(new Date(watermark.activation_timestamp || Date.now()).getTime() - overlapMinutes * 60 * 1000).toISOString();
    const finalEnd = overrides.window_end ? new Date(endMs).toISOString() : new Date().toISOString();
    if (new Date(finalEnd).getTime() < new Date(finalStart).getTime()) {
      throw new Error("Invalid window — window_end earlier than window_start rejected");
    }
    windowStartIso = finalStart;
    windowEndIso = finalEnd;
    overrideUsed = true;
  } else {
    const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
    windowStartIso = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000).toISOString();
    windowEndIso = new Date().toISOString();
  }

  // Load all existing vendors once for in-memory collision/diff checks.
  const existingVendors: any[] = [];
  try {
    existingVendors.push(...await base44.asServiceRole.entities.Vendor.filter({}, "-created_date", 5000));
  } catch { /* non-critical */ }
  const existingByStId = new Map<string, any>();
  const existingByName = new Map<string, any[]>();
  for (const v of existingVendors) {
    if (v.servicetitan_vendor_id) existingByStId.set(String(v.servicetitan_vendor_id), v);
    const nm = String(v.name ?? "").trim().toLowerCase();
    if (nm) {
      if (!existingByName.has(nm)) existingByName.set(nm, []);
      existingByName.get(nm)!.push(v);
    }
  }

  const context: any = {
    base44,
    tenantId,
    environment,
    watermark,
    batchId: `dryrun-${Date.now()}`,
    source: "api_recovery",
  };

  const report: any = {
    records_retrieved: 0,
    pages_retrieved: 0,
    new_records: 0,
    matched_records: 0,
    would_update: 0,
    unchanged_records: 0,
    inactive_records: 0,
    duplicate_st_ids: 0,
    missing_vendor_id: 0,
    invalid_field_values: 0,
    name_collisions: 0,
    failed_records: 0,
    per_record: [] as any[],
    fields_that_would_change: [] as string[],
    fields_that_would_be_preserved: [...VENDOR_LVC_OWNED_FIELDS],
    window_start: windowStartIso,
    window_end: windowEndIso,
    override_used: overrideUsed,
  };

  const seenIds = new Set<string>();
  let page = 1;
  let hasMore = true;
  const changedFieldCounts: Record<string, number> = {};
  const nowIso = new Date().toISOString();

  while (hasMore && page <= VENDOR_MAX_PAGES) {
    let pageResult;
    try {
      pageResult = await vendorAdapter.fetchPage(context, {
        pagination: { mode: "page", page, pageSize: VENDOR_PAGE_SIZE },
        filterField: "modifiedOn",
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
      });
    } catch (err: any) {
      // A failed page does not advance the watermark and is reported.
      report.page_fetch_errors = (report.page_fetch_errors || 0) + 1;
      report.last_page_error = String(err?.message || err);
      break;
    }
    report.pages_retrieved++;
    const records = pageResult.records || [];
    report.records_retrieved += records.length;

    for (const record of records) {
      const sourceId = vendorAdapter.getSourceId(record);
      if (!sourceId) {
        report.missing_vendor_id++;
        report.failed_records++;
        report.per_record.push({ source_id: null, classification: "missing_vendor_id", reason: "Missing or invalid Vendor.Id" });
        continue;
      }

      if (seenIds.has(sourceId)) {
        report.duplicate_st_ids++;
        report.per_record.push({ source_id: sourceId, classification: "duplicate_st_id", reason: "Same Vendor.Id appears more than once in the fetched set" });
        continue;
      }
      seenIds.add(sourceId);

      let mapped;
      try {
        mapped = await vendorAdapter.mapRecord(record, context);
      } catch (err: any) {
        report.invalid_field_values++;
        report.failed_records++;
        report.per_record.push({ source_id: sourceId, classification: "invalid_field_values", reason: String(err?.message || err) });
        continue;
      }

      const existing = existingByStId.get(sourceId) || null;
      const isInactive = !mapped.servicetitan_active;

      if (!existing) {
        report.new_records++;
        // Name collision check: same name, different (or no) ST id.
        const nm = mapped.name.trim().toLowerCase();
        let nameCollision = false;
        if (nm) {
          const candidates = existingByName.get(nm) || [];
          const collision = candidates.find((c) => String(c.servicetitan_vendor_id ?? "") !== sourceId);
          if (collision) {
            nameCollision = true;
            report.name_collisions++;
          }
        }
        report.per_record.push({
          source_id: sourceId,
          classification: nameCollision ? "new_with_name_collision" : "new",
          name: mapped.name,
          inactive: isInactive,
          name_collision_with: nameCollision ? (existingByName.get(nm) || []).map((c) => ({ id: c.id, servicetitan_vendor_id: c.servicetitan_vendor_id || null, name: c.name })) : [],
        });
        if (isInactive) report.inactive_records++;
      } else {
        report.matched_records++;
        const equal = vendorAdapter.recordsEqual(existing, mapped);
        if (equal) {
          report.unchanged_records++;
          report.per_record.push({ source_id: sourceId, classification: "unchanged", name: mapped.name, inactive: isInactive });
        } else {
          report.would_update++;
          const update = buildVendorUpdateData(existing, mapped, nowIso);
          const changedFields = update ? Object.keys(update).filter((f) => !["servicetitan_last_sync", "servicetitan_last_event_at", "servicetitan_sync_status", "servicetitan_sync_version"].includes(f)) : [];
          for (const f of changedFields) {
            changedFieldCounts[f] = (changedFieldCounts[f] || 0) + 1;
          }
          const preservedFields = VENDOR_LVC_OWNED_FIELDS.filter((f) => existing[f] !== undefined && existing[f] !== null && existing[f] !== "" && typeof existing[f] !== "number" ? true : true);
          report.per_record.push({
            source_id: sourceId,
            classification: "would_update",
            name: mapped.name,
            inactive: isInactive,
            fields_that_would_change: changedFields,
            fields_that_would_be_preserved: preservedFields,
          });
        }
        if (isInactive) report.inactive_records++;
      }
    }

    hasMore = pageResult.hasMore;
    if (hasMore && pageResult.nextPage != null) {
      page = pageResult.nextPage;
    } else {
      hasMore = false;
    }
  }

  report.fields_that_would_change = Object.entries(changedFieldCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => ({ field, count }));

  return report;
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication ──
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
      const stats = await getVendorWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          last_modified_scan_at: stats.watermark.last_modified_scan_at,
          last_created_scan_at: stats.watermark.last_created_scan_at,
          vendors_imported_since_activation: stats.watermark.vendors_imported_since_activation || 0,
          vendors_updated: stats.watermark.vendors_updated || 0,
          vendors_deactivated: stats.watermark.vendors_deactivated || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
        } : null,
        vendors_with_servicetitan_id: stats.vendorsWithStId,
        vendors_total: stats.vendorsTotal,
      });
    }

    // ── Activate mode ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, vendorWatermarkConfig, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          message: "Vendor Sync is already active — no changes made. Zero vendors imported.",
        });
      }
      const watermark = await activateWatermark(base44, vendorWatermarkConfig, tenantId, environment, user?.email || "system");
      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
        },
        vendors_imported: 0,
        message: "Watermark established. Zero vendors imported, updated, or deleted.",
      });
    }

    // ── API verification modes ──
    if (mode === "verify_api_created_on") {
      const result = await verifyApiEndpoint(VENDORS_API_PATH(tenantId), environment, tenantId, "createdOnOrAfter");
      return Response.json({
        mode: "verify_api_created_on",
        ...result,
        summary: `API verification (createdOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero vendor writes, zero watermark advancement.`,
      });
    }
    if (mode === "verify_api_modified_on") {
      const result = await verifyApiEndpoint(VENDORS_API_PATH(tenantId), environment, tenantId, "modifiedOnOrAfter");
      return Response.json({
        mode: "verify_api_modified_on",
        ...result,
        summary: `API verification (modifiedOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero vendor writes, zero watermark advancement.`,
      });
    }

    // ── Estimate backfill scope ──
    if (mode === "estimate_backfill") {
      const estimate = await estimateRecordCount(VENDORS_API_PATH(tenantId), environment, tenantId);
      return Response.json({
        mode: "estimate_backfill",
        estimated_vendors: estimate,
        message: estimate === -1 ? "Unable to determine exact count." : `${estimate} vendors would be imported during a full backfill.`,
      });
    }

    // ── Dry-run mode (owner-only read-only report) ──
    if (mode === "dry_run") {
      const watermark = await getWatermark(base44, vendorWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "dry_run",
          status: "no_watermark",
          message: "No active Vendor Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      // Optional owner-controlled historical window override (dry-run only).
      // Validates both timestamps; rejects malformed or reversed windows.
      const overrides: { window_start?: string; window_end?: string } = {};
      if (body.window_start !== undefined && body.window_start !== null && body.window_start !== "") {
        if (Number.isNaN(Date.parse(body.window_start))) {
          return Response.json({ mode: "dry_run", status: "invalid_window", error: "Invalid window_start — malformed timestamp rejected" }, { status: 400 });
        }
        overrides.window_start = body.window_start;
      }
      if (body.window_end !== undefined && body.window_end !== null && body.window_end !== "") {
        if (Number.isNaN(Date.parse(body.window_end))) {
          return Response.json({ mode: "dry_run", status: "invalid_window", error: "Invalid window_end — malformed timestamp rejected" }, { status: 400 });
        }
        overrides.window_end = body.window_end;
      }
      if (overrides.window_start && overrides.window_end
        && new Date(overrides.window_end).getTime() < new Date(overrides.window_start).getTime()) {
        return Response.json({ mode: "dry_run", status: "invalid_window", error: "Invalid window — window_end earlier than window_start rejected" }, { status: 400 });
      }

      const report = await runVendorDryRun(base44, tenantId, environment, watermark, Object.keys(overrides).length ? overrides : undefined);
      return Response.json({
        mode: "dry_run",
        status: "completed",
        writes_performed: 0,
        watermark_advanced: false,
        override_used: report.override_used === true,
        window_start: report.window_start || null,
        window_end: report.window_end || null,
        report,
        summary: `Dry-run: ${report.records_retrieved} records, ${report.new_records} new, ${report.matched_records} matched, ${report.would_update} would update, ${report.unchanged_records} unchanged, ${report.inactive_records} inactive, ${report.duplicate_st_ids} duplicate ST IDs, ${report.missing_vendor_id} missing IDs, ${report.name_collisions} name collisions.${report.override_used ? " Owner-controlled historical window override used." : ""} Zero writes. Watermark NOT advanced.`,
      });
    }

    // ── Incremental mode (owner-only controlled write path) ──
    if (mode === "incremental") {
      const watermark = await getWatermark(base44, vendorWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "incremental",
          status: "no_watermark",
          message: "No active Vendor Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const overlapMinutes = watermark.recovery_overlap_minutes || vendorWatermarkConfig.defaultOverlapMinutes || 5;
      const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
      const windowStart = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000);
      const windowEnd = new Date();

      try {
        await base44.asServiceRole.entities.VendorSyncWatermark.update(watermark.id, {
          recovery_window_start: windowStart.toISOString(),
          recovery_window_end: windowEnd.toISOString(),
          recovery_window_status: "in_progress",
          recovery_window_errors: 0,
        });
      } catch { /* non-critical */ }

      const result = await runSyncEngine(vendorAdapter, {
        executionMode: "write",
        maxPages: VENDOR_MAX_PAGES,
        maxRecords: 5000,
        maxRuntimeMs: 540000, // 9 minutes (< 10-minute lock duration)
        lockConfig: vendorLockConfig,
        watermarkConfig: vendorWatermarkConfig,
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

      if (succeeded) {
        try {
          await incrementWatermarkCounters(base44, vendorWatermarkConfig.entityName, watermark.id, {
            vendors_imported_since_activation: result.created,
            vendors_updated: result.updated,
            recovery_events_processed: result.processed,
          });
        } catch { /* non-critical */ }
      }

      if (!succeeded && !lockConflict) {
        try {
          await base44.asServiceRole.entities.VendorSyncWatermark.update(watermark.id, {
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
        skipped: result.skipped,
        failed: result.failed,
        invalid: result.invalid,
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
          ? `Incremental vendor sync completed: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`
          : lockConflict
            ? "Another incremental vendor sync worker is already running."
            : `Incremental vendor sync partial failure: ${result.failed} failed. Watermark NOT advanced.`,
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST VENDOR SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Vendor sync failed" }, { status: 500 });
  }
});