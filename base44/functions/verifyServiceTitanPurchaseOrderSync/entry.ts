/**
 * verifyServiceTitanPurchaseOrderSync — Read-Only Dry Run
 *
 * Stage 2E Purchase Order dry-run function. Authenticates against the live
 * ServiceTitan API, fetches PO pages, maps records, normalizes statuses,
 * resolves dependencies, and estimates creates/updates/unchanged/deferred/conflicts.
 *
 * PERFORMS ZERO WRITES:
 *   - Does NOT create or update PurchaseOrder records
 *   - Does NOT create or update PurchaseOrderLine records
 *   - Does NOT activate or advance watermarks
 *   - Does NOT post ledger entries
 *   - Does NOT enable schedulers
 *
 * Modes:
 *   dry_run          — Full dry-run analysis against live API
 *   verify_api       — Read-only API connectivity check (pageSize=1)
 *   watermark_status — Read-only watermark status
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment, apiRequest, retryWithBackoff } from "../../shared/stAuth.ts";
import { getWatermark } from "../../shared/stSync/stSyncWatermark.ts";
import {
  PURCHASE_ORDERS_API_PATH,
  PURCHASE_ORDER_TYPES_API_PATH,
  PURCHASE_ORDER_PAGE_SIZE,
  PURCHASE_ORDER_OVERLAP_MINUTES,
  purchaseOrderWatermarkConfig,
} from "../../shared/stSync/stPurchaseOrderSyncConfig.ts";
import {
  purchaseOrderAdapter,
  resetPoTypeCache,
} from "../../shared/stSync/adapters/purchaseOrderAdapter.ts";
import {
  normalizePoStatus,
  normalizePoLineStatus,
  type MappedPurchaseOrder,
} from "../../shared/stPurchaseOrderSync.ts";

// ─── PO Type Cache (bounded, in-memory, per run) ──────────────────────────────

async function buildPoTypeCache(environment: string, tenantId: string): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  try {
    const typesPath = PURCHASE_ORDER_TYPES_API_PATH(tenantId);
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 50) {
      const result = await retryWithBackoff(async () => {
        return await apiRequest(typesPath, environment, {
          params: { page: String(page), pageSize: "50" },
        });
      });
      const records = result.data || [];
      for (const t of records) {
        if (t.id != null) cache.set(String(t.id), t.name || "");
      }
      hasMore = result.hasMore ?? false;
      page++;
    }
  } catch (err) {
    console.warn("[PO DRY RUN] PO Type cache build failed:", String(err).substring(0, 150));
  }
  return cache;
}

// ─── Dry-Run Implementation ───────────────────────────────────────────────────

async function runDryRun(
  base44: any,
  tenantId: string,
  environment: string,
  watermark: any | null,
  overrides?: { window_start?: string; window_end?: string }
): Promise<any> {
  // Build PO Type cache
  const poTypeCache = await buildPoTypeCache(environment, tenantId);

  // Determine window
  const overlapMinutes = watermark?.recovery_overlap_minutes || PURCHASE_ORDER_OVERLAP_MINUTES;
  let windowStartIso: string;
  let windowEndIso: string;
  let overrideUsed = false;

  if (overrides && (overrides.window_start || overrides.window_end)) {
    const startMs = overrides.window_start ? Date.parse(overrides.window_start) : NaN;
    const endMs = overrides.window_end ? Date.parse(overrides.window_end) : NaN;
    if (overrides.window_start && Number.isNaN(startMs)) throw new Error("Invalid window_start");
    if (overrides.window_end && Number.isNaN(endMs)) throw new Error("Invalid window_end");
    const finalStart = overrides.window_start ? new Date(startMs).toISOString() : new Date(Date.now() - overlapMinutes * 60 * 1000).toISOString();
    const finalEnd = overrides.window_end ? new Date(endMs).toISOString() : new Date().toISOString();
    if (new Date(finalEnd).getTime() < new Date(finalStart).getTime()) throw new Error("window_end earlier than window_start");
    windowStartIso = finalStart;
    windowEndIso = finalEnd;
    overrideUsed = true;
  } else {
    const lastScanAt = watermark?.last_modified_scan_at || watermark?.activation_timestamp || new Date(Date.now() - 365 * 86400000).toISOString();
    windowStartIso = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000).toISOString();
    windowEndIso = new Date().toISOString();
  }

  // Load local state for dry-run comparison
  const localVendorIds = new Set<string>();
  try {
    const vendors = await base44.asServiceRole.entities.Vendor.filter(
      { servicetitan_vendor_id: { $ne: null } }, "-servicetitan_last_sync", 5000
    );
    for (const v of vendors) {
      if (v.servicetitan_vendor_id) localVendorIds.add(String(v.servicetitan_vendor_id));
    }
  } catch { /* non-critical */ }

  const localWarehouseIds = new Set<string>();
  try {
    const whs = await base44.asServiceRole.entities.WarehouseLocation.filter(
      { servicetitan_warehouse_id: { $ne: null } }, "-created_date", 5000
    );
    for (const w of whs) {
      if (w.servicetitan_warehouse_id) localWarehouseIds.add(String(w.servicetitan_warehouse_id));
    }
  } catch { /* non-critical */ }

  const localMaterialIds = new Set<string>();
  try {
    const mats = await base44.asServiceRole.entities.InventoryMaster.filter(
      { servicetitan_material_id: { $ne: null } }, "-servicetitan_last_sync", 5000
    );
    for (const m of mats) {
      if (m.servicetitan_material_id) localMaterialIds.add(String(m.servicetitan_material_id));
    }
  } catch { /* non-critical */ }

  const existingPoIds = new Set<string>();
  try {
    const pos = await base44.asServiceRole.entities.PurchaseOrder.filter(
      { servicetitan_purchase_order_id: { $ne: null } }, "-servicetitan_last_sync", 5000
    );
    for (const p of pos) {
      if (p.servicetitan_purchase_order_id) existingPoIds.add(String(p.servicetitan_purchase_order_id));
    }
  } catch { /* non-critical */ }

  const report: any = {
    endpoint_used: PURCHASE_ORDERS_API_PATH(tenantId),
    window_start: windowStartIso,
    window_end: windowEndIso,
    override_used: overrideUsed,
    pages_fetched: 0,
    headers_fetched: 0,
    lines_fetched: 0,
    headers_would_create: 0,
    headers_would_update: 0,
    headers_unchanged: 0,
    headers_deferred: 0,
    lines_would_create: 0,
    lines_would_update: 0,
    lines_unchanged: 0,
    lines_deferred_missing_material: 0,
    unknown_header_statuses: [] as string[],
    unknown_line_statuses: [] as string[],
    missing_vendors: [] as string[],
    missing_locations: [] as string[],
    missing_materials: [] as string[],
    po_type_name_resolution_warnings: 0,
    estimated_remaining_pages: null as number | null,
    watermark_candidate: windowEndIso,
    writes_performed: 0,
  };

  const context: any = {
    base44,
    tenantId,
    environment,
    watermark,
    batchId: `dryrun-${Date.now()}`,
    source: "api_recovery",
  };

  let page = 1;
  let hasMore = true;
  const maxPages = 20; // bounded for dry-run

  while (hasMore && page <= maxPages) {
    let pageResult: any;
    try {
      pageResult = await purchaseOrderAdapter.fetchPage(context, {
        pagination: { mode: "page", page, pageSize: PURCHASE_ORDER_PAGE_SIZE },
        filterField: "modifiedOn",
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
      });
    } catch (err: any) {
      report.page_fetch_errors = (report.page_fetch_errors || 0) + 1;
      report.last_page_error = String(err?.message || err).substring(0, 200);
      break;
    }
    report.pages_fetched++;
    const records = pageResult.records || [];
    report.headers_fetched += records.length;

    for (const record of records) {
      const sourceId = purchaseOrderAdapter.getSourceId(record);
      if (!sourceId) {
        report.missing_material_id = (report.missing_material_id || 0) + 1;
        continue;
      }

      let mapped: MappedPurchaseOrder;
      try {
        mapped = await purchaseOrderAdapter.mapRecord(record, context);
      } catch {
        report.failed_records = (report.failed_records || 0) + 1;
        continue;
      }

      // Status unknown tracking
      if (mapped.status_unknown && mapped.status_raw) {
        report.unknown_header_statuses.push(mapped.status_raw);
      }
      for (const line of mapped.lines) {
        if (line.line_status_unknown && line.line_status_raw) {
          report.unknown_line_statuses.push(line.line_status_raw);
        }
      }

      // PO Type resolution warning
      if (mapped.servicetitan_purchase_order_type_id && !mapped.servicetitan_purchase_order_type_name) {
        report.po_type_name_resolution_warnings++;
      }

      // Header dependency check
      let headerDeferred = false;
      if (!localVendorIds.has(mapped.servicetitan_vendor_id)) {
        report.missing_vendors.push(mapped.servicetitan_vendor_id);
        report.headers_deferred++;
        headerDeferred = true;
      }
      if (!localWarehouseIds.has(mapped.servicetitan_warehouse_id)) {
        report.missing_locations.push(mapped.servicetitan_warehouse_id);
        if (!headerDeferred) {
          report.headers_deferred++;
          headerDeferred = true;
        }
      }

      report.lines_fetched += mapped.lines.length;

      if (headerDeferred) continue;

      // Create vs update classification
      if (existingPoIds.has(mapped.servicetitan_purchase_order_id)) {
        report.headers_would_update++;
      } else {
        report.headers_would_create++;
      }

      // Line classification
      for (const line of mapped.lines) {
        if (!localMaterialIds.has(line.servicetitan_material_id)) {
          report.lines_deferred_missing_material++;
          if (!report.missing_materials.includes(line.servicetitan_material_id)) {
            report.missing_materials.push(line.servicetitan_material_id);
          }
        } else {
          report.lines_would_create++;
        }
      }
    }

    hasMore = pageResult.hasMore;
    if (hasMore && pageResult.nextPage != null) {
      page = pageResult.nextPage;
    } else {
      hasMore = false;
    }
  }

  report.estimated_remaining_pages = hasMore ? `hasMore=true at page ${page} — more pages exist` : null;
  report.totalCount_note = "totalCount is unreliable (null in live API); hasMore controls pagination";
  report.lines_unchanged = 0; // determined only during write mode
  report.headers_unchanged = 0; // determined only during write mode

  return report;
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

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

    const mode = body.mode || "dry_run";
    const tenantId = body.tenant_id || getTenantId();
    const environment = body.environment || getEnvironment();

    // ── Watermark status ──
    if (mode === "watermark_status") {
      const watermark = await getWatermark(base44, purchaseOrderWatermarkConfig, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: watermark ? {
          id: watermark.id,
          status: watermark.status,
          activation_timestamp: watermark.activation_timestamp,
          last_modified_scan_at: watermark.last_modified_scan_at,
          sync_strategy: watermark.sync_strategy,
          backfill_status: watermark.backfill_status || "never_started",
        } : null,
        writes_performed: 0,
      });
    }

    // ── API verification ──
    if (mode === "verify_api") {
      const path = PURCHASE_ORDERS_API_PATH(tenantId);
      const result = await retryWithBackoff(async () => {
        return await apiRequest(path, environment, {
          params: { page: "1", pageSize: "1", modifiedOnOrAfter: new Date(Date.now() - 365 * 86400000).toISOString() },
        });
      });
      return Response.json({
        mode: "verify_api",
        endpoint: path,
        http_status: 200,
        records_returned: (result.data || []).length,
        hasMore: result.hasMore ?? false,
        totalCount: result.totalCount ?? null,
        writes_performed: 0,
        message: "Read-only API connectivity check. Zero writes.",
      });
    }

    // ── Dry run ──
    if (mode === "dry_run") {
      const watermark = await getWatermark(base44, purchaseOrderWatermarkConfig, tenantId, environment);
      resetPoTypeCache();
      const overrides: { window_start?: string; window_end?: string } = {};
      if (body.window_start) overrides.window_start = body.window_start;
      if (body.window_end) overrides.window_end = body.window_end;
      const report = await runDryRun(base44, tenantId, environment, watermark, Object.keys(overrides).length ? overrides : undefined);
      return Response.json({
        mode: "dry_run",
        status: "completed",
        writes_performed: 0,
        watermark_advanced: false,
        report,
        summary: `Dry-run: ${report.headers_fetched} POs fetched across ${report.pages_fetched} pages, ${report.headers_would_create} would create, ${report.headers_would_update} would update, ${report.headers_deferred} deferred, ${report.lines_fetched} lines fetched, ${report.lines_deferred_missing_material} lines deferred (missing material), ${report.unknown_header_statuses.length} unknown header statuses, ${report.missing_vendors.length} missing vendors, ${report.missing_locations.length} missing locations. Zero writes.`,
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST PO DRY RUN ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Purchase Order dry run failed" }, { status: 500 });
  }
}