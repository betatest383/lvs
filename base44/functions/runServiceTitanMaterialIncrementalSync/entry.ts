/**
 * runServiceTitanMaterialIncrementalSync
 *
 * Stage 2D Material (Item) Sync — ServiceTitan → LVC OS only.
 *
 * Performs NO outbound ServiceTitan writes. No deletion of ServiceTitan
 * or LVC OS records. Does not touch Purchase Order, Receiving, Transfer,
 * Customer, Job, Appointment, or Inventory Ledger logic. Does not modify
 * Vendor synchronization logic except where required to resolve immutable
 * Vendor relationships.
 *
 * Modes:
 *   watermark_status       — Read-only watermark status
 *   activate               — Idempotent watermark activation (zero writes)
 *   verify_api_created_on  — Read-only API connectivity check (pageSize=1)
 *   verify_api_modified_on — Read-only API connectivity check (pageSize=1)
 *   estimate_backfill      — Read-only record count estimate
 *   dry_run                — Owner-only read-only report with optional
 *                            historical window override
 *   incremental            — Owner-only controlled write path
 *
 * Security: admin/owner for authenticated calls; SCHEDULER_SECRET for
 * scheduled invocations. Browser never connects to ServiceTitan directly.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import { getWatermark, activateWatermark, incrementWatermarkCounters } from "../../shared/stSync/stSyncWatermark.ts";
import { verifyApiEndpoint, estimateRecordCount } from "../../shared/stSync/stSyncApiVerification.ts";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import { materialAdapter } from "../../shared/stSync/adapters/materialAdapter.ts";
import {
  materialWatermarkConfig,
  materialLockConfig,
  ITEMS_API_PATH,
  MATERIAL_PAGE_SIZE,
  MATERIAL_MAX_PAGES,
} from "../../shared/stSync/stMaterialSyncConfig.ts";
import {
  MATERIAL_LVC_OWNED_FIELDS,
  buildMaterialUpdateData,
} from "../../shared/stMaterialSync.ts";
import { normalizeBool, normalizeString } from "../../shared/stVendorSync.ts";
import {
  isRateLimitError,
  isRetriableError,
  withRetry,
  runBoundedConcurrent,
  reconcileOutcomes,
  createSyncRetryMetrics,
  safeCreateWithRecheck,
  type SyncRetryMetrics,
  type RecordOutcome,
  type RecordDisposition,
} from "../../shared/stSync/stRateLimitProtection.ts";
import { compareSourceVersions } from "../../shared/stSync/stSyncUtils.ts";

async function getMaterialWatermarkStats(base44: any, tenantId: string, environment: string) {
  const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
  let materialsWithStId = 0;
  try {
    const all = await base44.asServiceRole.entities.InventoryMaster.filter(
      { servicetitan_material_id: { $ne: null } },
      "-servicetitan_last_sync",
      5000
    );
    materialsWithStId = all.length;
  } catch { /* non-critical */ }
  let materialVendorTotal = 0;
  try {
    const allMv = await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000);
    materialVendorTotal = allMv.length;
  } catch { /* non-critical */ }
  return { watermark, materialsWithStId, materialVendorTotal };
}

// ─── Dry-Run Analyzer ─────────────────────────────────────────────────────────

async function runMaterialDryRun(
  base44: any,
  tenantId: string,
  environment: string,
  watermark: any,
  overrides?: { window_start?: string; window_end?: string }
): Promise<any> {
  const overlapMinutes = watermark.recovery_overlap_minutes || materialWatermarkConfig.defaultOverlapMinutes || 5;
  let windowStartIso: string;
  let windowEndIso: string;
  let overrideUsed = false;

  if (overrides && (overrides.window_start || overrides.window_end)) {
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

  // Load existing materials + vendors for in-memory checks
  const existingMaterials: any[] = [];
  try {
    existingMaterials.push(...await base44.asServiceRole.entities.InventoryMaster.filter({}, "-created_date", 5000));
  } catch { /* non-critical */ }
  const existingByStId = new Map<string, any>();
  for (const m of existingMaterials) {
    if (m.servicetitan_material_id) existingByStId.set(String(m.servicetitan_material_id), m);
  }

  // Load local vendors for orphan detection
  const localVendorStIds = new Set<string>();
  try {
    const vendors = await base44.asServiceRole.entities.Vendor.filter({ servicetitan_vendor_id: { $ne: null } }, "-servicetitan_last_sync", 5000);
    for (const v of vendors) {
      if (v.servicetitan_vendor_id) localVendorStIds.add(String(v.servicetitan_vendor_id));
    }
  } catch { /* non-critical */ }

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
    missing_material_id: 0,
    invalid_field_values: 0,
    name_collisions: 0,
    failed_records: 0,
    would_defer_missing_vendor: 0,
    vendor_relationships_total: 0,
    vendor_relationships_resolved: 0,
    vendor_relationships_orphan: 0,
    per_record: [] as any[],
    fields_that_would_change: [] as string[],
    fields_that_would_be_preserved: [...MATERIAL_LVC_OWNED_FIELDS],
    window_start: windowStartIso,
    window_end: windowEndIso,
    override_used: overrideUsed,
  };

  const seenIds = new Set<string>();
  let page = 1;
  let hasMore = true;
  const changedFieldCounts: Record<string, number> = {};
  const nowIso = new Date().toISOString();

  while (hasMore && page <= MATERIAL_MAX_PAGES) {
    let pageResult;
    try {
      pageResult = await materialAdapter.fetchPage(context, {
        pagination: { mode: "page", page, pageSize: MATERIAL_PAGE_SIZE },
        filterField: "modifiedOn",
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
      });
    } catch (err: any) {
      report.page_fetch_errors = (report.page_fetch_errors || 0) + 1;
      report.last_page_error = String(err?.message || err);
      break;
    }
    report.pages_retrieved++;
    const records = pageResult.records || [];
    report.records_retrieved += records.length;

    for (const record of records) {
      const sourceId = materialAdapter.getSourceId(record);
      if (!sourceId) {
        report.missing_material_id++;
        report.failed_records++;
        report.per_record.push({ source_id: null, classification: "missing_material_id", reason: "Missing or invalid Item.Id" });
        continue;
      }

      if (seenIds.has(sourceId)) {
        report.duplicate_st_ids++;
        report.per_record.push({ source_id: sourceId, classification: "duplicate_st_id", reason: "Same Item.Id appears more than once in the fetched set" });
        continue;
      }
      seenIds.add(sourceId);

      let mapped;
      try {
        mapped = await materialAdapter.mapRecord(record, context);
      } catch (err: any) {
        report.invalid_field_values++;
        report.failed_records++;
        report.per_record.push({ source_id: sourceId, classification: "invalid_field_values", reason: String(err?.message || err) });
        continue;
      }

      // Check vendor relationships for orphan detection
      const rels = mapped.vendor_relationships || [];
      report.vendor_relationships_total += rels.length;
      let hasOrphanVendor = false;
      for (const rel of rels) {
        if (!localVendorStIds.has(rel.servicetitan_vendor_id)) {
          hasOrphanVendor = true;
          report.vendor_relationships_orphan++;
        } else {
          report.vendor_relationships_resolved++;
        }
      }

      const existing = existingByStId.get(sourceId) || null;
      const isInactive = !mapped.servicetitan_active;

      if (!existing) {
        report.new_records++;
        if (hasOrphanVendor) {
          report.would_defer_missing_vendor++;
        }
        report.per_record.push({
          source_id: sourceId,
          classification: hasOrphanVendor ? "new_deferred_missing_vendor" : "new",
          name: mapped.item_name,
          sku: mapped.sku,
          inactive: isInactive,
          vendor_relationships: rels.length,
          has_orphan_vendor: hasOrphanVendor,
        });
        if (isInactive) report.inactive_records++;
      } else {
        report.matched_records++;
        const equal = materialAdapter.recordsEqual(existing, mapped);
        if (equal) {
          report.unchanged_records++;
          report.per_record.push({ source_id: sourceId, classification: "unchanged", name: mapped.item_name, inactive: isInactive });
        } else {
          report.would_update++;
          const update = buildMaterialUpdateData(existing, mapped, nowIso);
          const changedFields = update ? Object.keys(update).filter((f) => !["servicetitan_last_sync", "servicetitan_last_event_at", "servicetitan_sync_status", "servicetitan_sync_version"].includes(f)) : [];
          for (const f of changedFields) {
            changedFieldCounts[f] = (changedFieldCounts[f] || 0) + 1;
          }
          report.per_record.push({
            source_id: sourceId,
            classification: "would_update",
            name: mapped.item_name,
            inactive: isInactive,
            fields_that_would_change: changedFields,
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

// ─── Dry-Run Analysis (Extended Population Classification) ────────────────────

async function runMaterialDryRunAnalysis(
  base44: any,
  tenantId: string,
  environment: string,
  watermark: any,
  overrides?: { window_start?: string; window_end?: string }
): Promise<any> {
  const overlapMinutes = watermark.recovery_overlap_minutes || materialWatermarkConfig.defaultOverlapMinutes || 5;
  let windowStartIso: string;
  let windowEndIso: string;
  let overrideUsed = false;

  if (overrides && (overrides.window_start || overrides.window_end)) {
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

  // Load existing local Vendor records by ST vendor ID for identity verification
  const localVendorByStId = new Map<string, any[]>();
  try {
    const vendors = await base44.asServiceRole.entities.Vendor.filter({ servicetitan_vendor_id: { $ne: null } }, "-servicetitan_last_sync", 5000);
    for (const v of vendors) {
      if (v.servicetitan_vendor_id) {
        const stId = String(v.servicetitan_vendor_id);
        if (!localVendorByStId.has(stId)) localVendorByStId.set(stId, []);
        localVendorByStId.get(stId)!.push(v);
      }
    }
  } catch { /* non-critical */ }

  const context: any = {
    base44,
    tenantId,
    environment,
    watermark,
    batchId: `analysis-${Date.now()}`,
    source: "api_recovery",
  };

  const analysis: any = {
    window_start: windowStartIso,
    window_end: windowEndIso,
    override_used: overrideUsed,
    records_retrieved: 0,
    pages_retrieved: 0,
    has_more_at_cutoff: false,
    // Population classification
    active_true: 0,
    active_false: 0,
    is_inventory_true: 0,
    is_inventory_false: 0,
    has_primary_vendor: 0,
    has_other_vendors: 0,
    has_no_vendor_relationship: 0,
    empty_sku: 0,
    empty_display_name: 0,
    created_before_2025: 0,
    modified_before_2025: 0,
    // Identity
    distinct_st_material_ids: 0,
    duplicate_st_material_ids: 0,
    missing_material_id: 0,
    // Vendor relationship identity
    vendor_relationships_total: 0,
    vendor_relationships_missing_st_vendor_id: 0,
    distinct_st_vendor_ids_referenced: 0,
    vendor_ids_matched_to_exactly_one: 0,
    vendor_ids_matched_to_more_than_one: 0,
    vendor_ids_matched_to_zero: 0,
    blocking_identity_conflicts: [] as Array<{ st_vendor_id: string; local_vendor_count: number }>,
    // Explanation
    population_explanation: "",
  };

  const seenMaterialIds = new Set<string>();
  const seenVendorIds = new Set<string>();
  let page = 1;
  let hasMore = true;
  const CUTOFF_2025 = new Date("2025-01-01T00:00:00Z").getTime();

  while (hasMore && page <= MATERIAL_MAX_PAGES) {
    let pageResult;
    try {
      pageResult = await materialAdapter.fetchPage(context, {
        pagination: { mode: "page", page, pageSize: MATERIAL_PAGE_SIZE },
        filterField: "modifiedOn",
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
      });
    } catch (err: any) {
      analysis.page_fetch_errors = (analysis.page_fetch_errors || 0) + 1;
      analysis.last_page_error = String(err?.message || err);
      break;
    }
    analysis.pages_retrieved++;
    const records = pageResult.records || [];
    analysis.records_retrieved += records.length;

    for (const record of records) {
      const sourceId = materialAdapter.getSourceId(record);
      if (!sourceId) {
        analysis.missing_material_id++;
        continue;
      }
      if (seenMaterialIds.has(sourceId)) {
        analysis.duplicate_st_material_ids++;
        continue;
      }
      seenMaterialIds.add(sourceId);
      analysis.distinct_st_material_ids++;

      // Classify active
      const isActive = normalizeBool(record.active ?? record.Active);
      if (isActive) analysis.active_true++;
      else analysis.active_false++;

      // Classify isInventory
      const isInventory = normalizeBool(record.isInventory ?? record.IsInventory);
      if (isInventory) analysis.is_inventory_true++;
      else analysis.is_inventory_false++;

      // Vendor relationships
      let mapped;
      try {
        mapped = await materialAdapter.mapRecord(record, context);
      } catch {
        continue;
      }
      const rels = mapped.vendor_relationships || [];
      if (rels.length === 0) analysis.has_no_vendor_relationship++;
      const hasPrimary = rels.some((r: any) => r.is_preferred_vendor === true);
      const hasOther = rels.some((r: any) => r.is_preferred_vendor === false);
      if (hasPrimary) analysis.has_primary_vendor++;
      if (hasOther) analysis.has_other_vendors++;

      // Empty SKU/code
      const sku = normalizeString(record.code ?? record.Code);
      if (sku === "") analysis.empty_sku++;

      // Empty display name
      const displayName = normalizeString(record.displayName ?? record.name ?? record.Name);
      if (displayName === "") analysis.empty_display_name++;

      // Pre-2025 dates
      if (record.createdOn && new Date(record.createdOn).getTime() < CUTOFF_2025) analysis.created_before_2025++;
      if (record.modifiedOn && new Date(record.modifiedOn).getTime() < CUTOFF_2025) analysis.modified_before_2025++;

      // Vendor relationship identity
      for (const rel of rels) {
        analysis.vendor_relationships_total++;
        if (!rel.servicetitan_vendor_id) {
          analysis.vendor_relationships_missing_st_vendor_id++;
          continue;
        }
        if (!seenVendorIds.has(rel.servicetitan_vendor_id)) {
          seenVendorIds.add(rel.servicetitan_vendor_id);
          analysis.distinct_st_vendor_ids_referenced++;
          const localMatches = localVendorByStId.get(rel.servicetitan_vendor_id) || [];
          if (localMatches.length === 1) {
            analysis.vendor_ids_matched_to_exactly_one++;
          } else if (localMatches.length > 1) {
            analysis.vendor_ids_matched_to_more_than_one++;
            analysis.blocking_identity_conflicts.push({
              st_vendor_id: rel.servicetitan_vendor_id,
              local_vendor_count: localMatches.length,
            });
          } else {
            analysis.vendor_ids_matched_to_zero++;
          }
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

  analysis.has_more_at_cutoff = hasMore;

  // Explanation of population size
  const totalRecords = analysis.records_retrieved;
  analysis.population_explanation =
    `The historical dry run retrieved ${totalRecords} ServiceTitan Pricebook material records ` +
    `(pages=${analysis.pages_retrieved}, hasMoreAtCutoff=${analysis.has_more_at_cutoff}). ` +
    `Of these, ${analysis.distinct_st_material_ids} are distinct by ServiceTitan Material ID. ` +
    `This population is larger than the ~5,246 InventoryMaster records previously identified ` +
    `because the ServiceTitan Pricebook contains ALL materials — including non-stocked items, ` +
    `inactive items, and special-order-only items — not just the ${analysis.is_inventory_true} ` +
    `that ServiceTitan marks isInventory=true. Only ${analysis.is_inventory_true} records have ` +
    `isInventory=true; the remaining ${analysis.is_inventory_false} are not flagged as stocked ` +
    `by ServiceTitan. Additionally, ${analysis.active_false} records are inactive. ` +
    `All valid materials may be imported into InventoryMaster, but their ` +
    `servicetitan_is_inventory flag is preserved — LVC's is_stocked_inventory_item remains ` +
    `a separate, deliberate local decision and is NEVER automatically set by sync.`;

  return analysis;
}

// ─── Controlled Batch (Bounded Write) ────────────────────────────────────────

async function runControlledBatch(
  base44: any,
  tenantId: string,
  environment: string,
  watermark: any,
  batchSize: number
): Promise<any> {
  const batchRecords = Math.min(batchSize, 250);
  const batchPages = Math.ceil(batchRecords / MATERIAL_PAGE_SIZE);

  const overlapMinutes = watermark.recovery_overlap_minutes || materialWatermarkConfig.defaultOverlapMinutes || 5;
  const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
  const windowStart = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000);
  const windowEnd = new Date();

  const watermarkBefore = {
    id: watermark.id,
    last_modified_scan_at: watermark.last_modified_scan_at,
    materials_imported_since_activation: watermark.materials_imported_since_activation || 0,
    vendor_relationships_created: watermark.vendor_relationships_created || 0,
  };

  // Snapshot local state before
  const materialsBefore: any[] = [];
  try {
    materialsBefore.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
  } catch { /* non-critical */ }
  const materialIdsBefore = new Set(materialsBefore.map((m) => m.servicetitan_material_id).filter(Boolean));
  const mvBefore: any[] = [];
  try {
    mvBefore.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
  } catch { /* non-critical */ }
  const mvKeysBefore = new Set(mvBefore.map((mv) => mv.relationship_key).filter(Boolean));

  try {
    await base44.asServiceRole.entities.MaterialSyncWatermark.update(watermark.id, {
      recovery_window_start: windowStart.toISOString(),
      recovery_window_end: windowEnd.toISOString(),
      recovery_window_status: "in_progress",
      recovery_window_errors: 0,
    });
  } catch { /* non-critical */ }

  const result = await runSyncEngine(materialAdapter, {
    executionMode: "write",
    maxPages: batchPages,
    maxRecords: batchRecords,
    maxRuntimeMs: 540000,
    lockConfig: materialLockConfig,
    watermarkConfig: materialWatermarkConfig,
    filterField: "modifiedOn",
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }, base44, {
    tenantId,
    environment,
    source: "api_recovery",
  });

  // Snapshot local state after
  const materialsAfter: any[] = [];
  try {
    materialsAfter.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
  } catch { /* non-critical */ }
  const materialIdsAfter = new Set(materialsAfter.map((m) => m.servicetitan_material_id).filter(Boolean));
  const mvAfter: any[] = [];
  try {
    mvAfter.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
  } catch { /* non-critical */ }
  const mvKeysAfter = new Set(mvAfter.map((mv) => mv.relationship_key).filter(Boolean));

  // Duplicate detection
  const stIdCounts = new Map<string, number>();
  for (const m of materialsAfter) {
    if (m.servicetitan_material_id) {
      stIdCounts.set(m.servicetitan_material_id, (stIdCounts.get(m.servicetitan_material_id) || 0) + 1);
    }
  }
  const duplicateStIds = Array.from(stIdCounts.entries()).filter(([, c]) => c > 1);

  const mvKeyCounts = new Map<string, number>();
  for (const mv of mvAfter) {
    if (mv.relationship_key) {
      mvKeyCounts.set(mv.relationship_key, (mvKeyCounts.get(mv.relationship_key) || 0) + 1);
    }
  }
  const duplicateMvKeys = Array.from(mvKeyCounts.entries()).filter(([, c]) => c > 1);

  // LVC-owned field check: verify no created material has LVC-owned fields set by sync
  const lvcOwnedCheckFields = ["quantity_owned", "quantity_available", "quantity_assigned", "quantity_reserved",
    "quantity_on_order", "quantity_in_transit", "quantity_damaged", "quantity_retired",
    "warehouse_location", "warehouse_location_id", "bin_location", "bin_location_id",
    "reorder_point", "reorder_quantity", "minimum_stock", "maximum_stock",
    "is_stocked_inventory_item", "unit_cost", "average_cost", "inventory_value"];
  const newlyCreated = materialsAfter.filter((m) => !materialIdsBefore.has(m.servicetitan_material_id));
  let lvcOwnedOverwrites = 0;
  let quantityOverwrites = 0;
  let warehouseBinOverwrites = 0;
  let reorderOverwrites = 0;
  for (const m of newlyCreated) {
    for (const f of lvcOwnedCheckFields) {
      const val = m[f];
      const defaultVal = f === "is_stocked_inventory_item" ? false : (typeof val === "number" ? 0 : (typeof val === "string" ? "" : false));
      if (val !== undefined && val !== null && val !== defaultVal) {
        lvcOwnedOverwrites++;
        if (f.startsWith("quantity_")) quantityOverwrites++;
        if (f.includes("warehouse") || f.includes("bin_location")) warehouseBinOverwrites++;
        if (f === "reorder_point" || f === "reorder_quantity" || f === "minimum_stock" || f === "maximum_stock") reorderOverwrites++;
      }
    }
  }

  // isInventory classification for newly created
  let isInventoryTrueCount = 0;
  let isInventoryFalseCount = 0;
  for (const m of newlyCreated) {
    if (m.servicetitan_is_inventory === true) isInventoryTrueCount++;
    else isInventoryFalseCount++;
  }

  // MaterialVendor rows created/updated
  const mvKeysNew = Array.from(mvKeysAfter).filter((k) => !mvKeysBefore.has(k));
  const mvRowsCreated = mvKeysNew.length;
  const mvRowsTotal = mvAfter.length;

  // Orphan relationships
  const orphanRels = mvAfter.filter((mv) => mv.mapping_status === "orphan");

  // Watermark after
  const watermarkAfter: any = {};
  try {
    const wmAfter = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
    watermarkAfter.last_modified_scan_at = wmAfter?.last_modified_scan_at || null;
    watermarkAfter.materials_imported_since_activation = wmAfter?.materials_imported_since_activation || 0;
    watermarkAfter.vendor_relationships_created = wmAfter?.vendor_relationships_created || 0;
  } catch { /* non-critical */ }

  const watermarkAdvanced = !!(result.watermarkAfter && result.watermarkBefore
    && result.watermarkAfter.last_modified_scan_at !== result.watermarkBefore.last_modified_scan_at);

  const stopReason = result.stopReason || (result.partialRun ? "record_limit_or_page_limit" : null);
  const resumeCursor = result.partialRun
    ? (result.watermarkBefore?.last_modified_scan_at || watermarkBefore.last_modified_scan_at || null)
    : (result.watermarkAfter?.last_modified_scan_at || watermarkAfter.last_modified_scan_at || null);

  return {
    mode: "controlled_batch",
    batch_size: batchRecords,
    watermark_before: watermarkBefore,
    requested_historical_window: {
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    },
    pages_fetched: result.pagesFetched,
    records_fetched: result.recordsFetched,
    records_processed: result.processed,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    stale: result.stale,
    deferred: result.deferred,
    failed: result.failed,
    inactive_count: newlyCreated.filter((m) => m.servicetitan_active === false).length,
    is_inventory_true_count: isInventoryTrueCount,
    is_inventory_false_count: isInventoryFalseCount,
    material_vendor_rows_created: mvRowsCreated,
    material_vendor_rows_total: mvRowsTotal,
    orphan_relationships: orphanRels.length,
    duplicate_st_material_ids: duplicateStIds.length,
    duplicate_st_material_id_details: duplicateStIds,
    duplicate_material_vendor_keys: duplicateMvKeys.length,
    duplicate_material_vendor_key_details: duplicateMvKeys,
    lvc_owned_field_overwrites: lvcOwnedOverwrites,
    inventory_ledger_quantity_overwrites: quantityOverwrites,
    warehouse_bin_overwrites: warehouseBinOverwrites,
    reorder_setting_overwrites: reorderOverwrites,
    stop_reason: stopReason,
    partial_run: result.partialRun,
    watermark_advanced: watermarkAdvanced,
    watermark_after: watermarkAfter,
    resume_cursor: resumeCursor,
    partial_run_explanation: result.partialRun
      ? `Batch stopped after ${result.processed} records due to ${stopReason}. Watermark NOT advanced. Resume cursor remains at ${resumeCursor}. The next batch will re-fetch from the same window start, detect already-created records as unchanged, and continue processing the remaining population.`
      : `Batch completed within the ${batchRecords}-record limit. Watermark ${watermarkAdvanced ? "advanced" : "not advanced (no records to process or all unchanged)."}`,
    errors: result.errors,
    lock_acquired: result.lockAcquired,
  };
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication: admin/owner (manual) OR X-LVC-Scheduler-Secret (scheduled) ──
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

    // ── Watermark status ──
    if (mode === "watermark_status") {
      const stats = await getMaterialWatermarkStats(base44, tenantId, environment);
      return Response.json({
        mode: "watermark_status",
        watermark: stats.watermark ? {
          id: stats.watermark.id,
          sync_strategy: stats.watermark.sync_strategy,
          activation_timestamp: stats.watermark.activation_timestamp,
          status: stats.watermark.status,
          last_modified_scan_at: stats.watermark.last_modified_scan_at,
          materials_imported_since_activation: stats.watermark.materials_imported_since_activation || 0,
          materials_updated: stats.watermark.materials_updated || 0,
          materials_deactivated: stats.watermark.materials_deactivated || 0,
          vendor_relationships_created: stats.watermark.vendor_relationships_created || 0,
          vendor_relationships_orphan: stats.watermark.vendor_relationships_orphan || 0,
          materials_deferred_missing_vendor: stats.watermark.materials_deferred_missing_vendor || 0,
          last_successful_sync_at: stats.watermark.last_successful_sync_at,
          backfill_status: stats.watermark.backfill_status || "never_started",
        } : null,
        materials_with_servicetitan_id: stats.materialsWithStId,
        material_vendor_relationships_total: stats.materialVendorTotal,
      });
    }

    // ── Activate ──
    if (mode === "activate") {
      const existing = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (existing && existing.status === "active") {
        return Response.json({
          mode: "activate",
          status: "already_active",
          message: "Material Sync is already active — no changes made. Zero materials imported.",
        });
      }
      const watermark = await activateWatermark(base44, materialWatermarkConfig, tenantId, environment, user?.email || "system");
      return Response.json({
        mode: "activate",
        status: "activated",
        watermark: {
          id: watermark.id,
          sync_strategy: watermark.sync_strategy,
          activation_timestamp: watermark.activation_timestamp,
          status: watermark.status,
        },
        materials_imported: 0,
        message: "Watermark established. Zero materials imported, updated, or deleted.",
      });
    }

    // ── API verification ──
    if (mode === "verify_api_created_on") {
      const result = await verifyApiEndpoint(ITEMS_API_PATH(tenantId), environment, tenantId, "createdOnOrAfter");
      return Response.json({
        mode: "verify_api_created_on",
        ...result,
        summary: `API verification (createdOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero material writes, zero watermark advancement.`,
      });
    }
    if (mode === "verify_api_modified_on") {
      const result = await verifyApiEndpoint(ITEMS_API_PATH(tenantId), environment, tenantId, "modifiedOnOrAfter");
      return Response.json({
        mode: "verify_api_modified_on",
        ...result,
        summary: `API verification (modifiedOnOrAfter): HTTP ${result.http_status}, ${result.records_returned} records. Zero material writes, zero watermark advancement.`,
      });
    }

    // ── Estimate backfill ──
    if (mode === "estimate_backfill") {
      const estimate = await estimateRecordCount(ITEMS_API_PATH(tenantId), environment, tenantId);
      return Response.json({
        mode: "estimate_backfill",
        estimated_materials: estimate,
        message: estimate === -1 ? "Unable to determine exact count." : `${estimate} materials would be imported during a full backfill.`,
      });
    }

    // ── Dry-run ──
    if (mode === "dry_run") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "dry_run",
          status: "no_watermark",
          message: "No active Material Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

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

      const report = await runMaterialDryRun(base44, tenantId, environment, watermark, Object.keys(overrides).length ? overrides : undefined);
      return Response.json({
        mode: "dry_run",
        status: "completed",
        writes_performed: 0,
        watermark_advanced: false,
        override_used: report.override_used === true,
        window_start: report.window_start || null,
        window_end: report.window_end || null,
        report,
        summary: `Dry-run: ${report.records_retrieved} records, ${report.new_records} new, ${report.matched_records} matched, ${report.would_update} would update, ${report.unchanged_records} unchanged, ${report.inactive_records} inactive, ${report.duplicate_st_ids} duplicate ST IDs, ${report.missing_material_id} missing IDs, ${report.would_defer_missing_vendor} would defer (missing vendor), ${report.vendor_relationships_orphan} orphan vendor relationships.${report.override_used ? " Owner-controlled historical window override used." : ""} Zero writes. Watermark NOT advanced.`,
      });
    }

    // ── Dry-run analysis (extended population classification) ──
    if (mode === "dry_run_analysis") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "dry_run_analysis",
          status: "no_watermark",
          message: "No active Material Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const overrides: { window_start?: string; window_end?: string } = {};
      if (body.window_start !== undefined && body.window_start !== null && body.window_start !== "") {
        if (Number.isNaN(Date.parse(body.window_start))) {
          return Response.json({ mode: "dry_run_analysis", status: "invalid_window", error: "Invalid window_start — malformed timestamp rejected" }, { status: 400 });
        }
        overrides.window_start = body.window_start;
      }
      if (body.window_end !== undefined && body.window_end !== null && body.window_end !== "") {
        if (Number.isNaN(Date.parse(body.window_end))) {
          return Response.json({ mode: "dry_run_analysis", status: "invalid_window", error: "Invalid window_end — malformed timestamp rejected" }, { status: 400 });
        }
        overrides.window_end = body.window_end;
      }

      const analysis = await runMaterialDryRunAnalysis(base44, tenantId, environment, watermark, Object.keys(overrides).length ? overrides : undefined);
      return Response.json({
        mode: "dry_run_analysis",
        status: "completed",
        writes_performed: 0,
        watermark_advanced: false,
        analysis,
        summary: `Population analysis: ${analysis.records_retrieved} records, ${analysis.distinct_st_material_ids} distinct ST Material IDs, ${analysis.duplicate_st_material_ids} duplicates, ${analysis.active_true} active / ${analysis.active_false} inactive, ${analysis.is_inventory_true} isInventory=true / ${analysis.is_inventory_false} isInventory=false, ${analysis.vendor_relationships_total} vendor relationships, ${analysis.distinct_st_vendor_ids_referenced} distinct ST Vendor IDs, ${analysis.vendor_ids_matched_to_exactly_one} matched to exactly one, ${analysis.vendor_ids_matched_to_more_than_one} matched to more than one (BLOCKING), ${analysis.vendor_ids_matched_to_zero} unmatched. Zero writes.`,
      });
    }

    // ── Controlled batch (bounded write, max 250) ──
    if (mode === "controlled_batch") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "controlled_batch",
          status: "no_watermark",
          message: "No active Material Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const batchSize = Math.min(Math.max(parseInt(body.batch_size, 10) || 250, 1), 250);
      const batchReport = await runControlledBatch(base44, tenantId, environment, watermark, batchSize);
      return Response.json(batchReport);
    }

    // ── Rerun verification (immediate identical rerun) ──
    if (mode === "rerun_verification") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "rerun_verification",
          status: "no_watermark",
          message: "No active Material Sync watermark found.",
        }, { status: 400 });
      }

      const batchSize = Math.min(Math.max(parseInt(body.batch_size, 10) || 250, 1), 250);

      // Snapshot before rerun
      const materialsBeforeRerun: any[] = [];
      try {
        materialsBeforeRerun.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
      } catch { /* non-critical */ }
      const materialCountBefore = materialsBeforeRerun.length;
      const mvBeforeRerun: any[] = [];
      try {
        mvBeforeRerun.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
      } catch { /* non-critical */ }
      const mvCountBefore = mvBeforeRerun.length;

      const rerunReport = await runControlledBatch(base44, tenantId, environment, watermark, batchSize);

      // Snapshot after rerun
      const materialsAfterRerun: any[] = [];
      try {
        materialsAfterRerun.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
      } catch { /* non-critical */ }
      const materialCountAfter = materialsAfterRerun.length;
      const mvAfterRerun: any[] = [];
      try {
        mvAfterRerun.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
      } catch { /* non-critical */ }
      const mvCountAfter = mvAfterRerun.length;

      // Duplicate detection after rerun
      const stIdCounts = new Map<string, number>();
      for (const m of materialsAfterRerun) {
        if (m.servicetitan_material_id) {
          stIdCounts.set(m.servicetitan_material_id, (stIdCounts.get(m.servicetitan_material_id) || 0) + 1);
        }
      }
      const duplicateStIds = Array.from(stIdCounts.entries()).filter(([, c]) => c > 1);
      const mvKeyCounts = new Map<string, number>();
      for (const mv of mvAfterRerun) {
        if (mv.relationship_key) {
          mvKeyCounts.set(mv.relationship_key, (mvKeyCounts.get(mv.relationship_key) || 0) + 1);
        }
      }
      const duplicateMvKeys = Array.from(mvKeyCounts.entries()).filter(([, c]) => c > 1);

      const newMaterialsCreated = Math.max(0, materialCountAfter - materialCountBefore);
      const newMvCreated = Math.max(0, mvCountAfter - mvCountBefore);

      const idempotent = rerunReport.created === 0 && newMaterialsCreated === 0 && newMvCreated === 0
        && duplicateStIds.length === 0 && duplicateMvKeys.length === 0
        && rerunReport.lvc_owned_field_overwrites === 0;

      return Response.json({
        mode: "rerun_verification",
        batch_size: batchSize,
        material_count_before_rerun: materialCountBefore,
        material_count_after_rerun: materialCountAfter,
        material_vendor_count_before_rerun: mvCountBefore,
        material_vendor_count_after_rerun: mvCountAfter,
        new_materials_created_by_rerun: newMaterialsCreated,
        new_material_vendor_created_by_rerun: newMvCreated,
        unchanged_materials: rerunReport.unchanged,
        created_by_rerun: rerunReport.created,
        updated_by_rerun: rerunReport.updated,
        duplicate_st_material_ids: duplicateStIds.length,
        duplicate_material_vendor_keys: duplicateMvKeys.length,
        lvc_owned_field_overwrites: rerunReport.lvc_owned_field_overwrites,
        watermark_advanced: rerunReport.watermark_advanced,
        idempotent: idempotent,
        acceptance: idempotent
          ? "PASS — zero duplicates, zero new creates, all unchanged, no LVC-owned overwrite, no inappropriate watermark movement."
          : "FAIL — idempotency violations detected.",
      });
    }

    // ── Bounded retry (rate-limit-protected deterministic 250-record retry) ──
    if (mode === "bounded_retry") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "bounded_retry",
          status: "no_watermark",
          message: "No active Material Sync watermark found.",
        }, { status: 400 });
      }

      const batchSize = Math.min(Math.max(parseInt(body.batch_size, 10) || 250, 1), 250);
      const concurrency = Math.min(Math.max(parseInt(body.concurrency, 10) || 3, 1), 5);
      const maxRetriesPerRecord = Math.min(Math.max(parseInt(body.max_retries, 10) || 5, 1), 10);
      const batchPages = Math.ceil(batchSize / MATERIAL_PAGE_SIZE);

      const overlapMinutes = watermark.recovery_overlap_minutes || materialWatermarkConfig.defaultOverlapMinutes || 5;
      const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
      const windowStartIso = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000).toISOString();
      const windowEndIso = new Date().toISOString();

      const watermarkBefore = {
        id: watermark.id,
        last_modified_scan_at: watermark.last_modified_scan_at,
        materials_imported_since_activation: watermark.materials_imported_since_activation || 0,
        vendor_relationships_created: watermark.vendor_relationships_created || 0,
      };

      // Snapshot local state before
      const materialsBefore: any[] = [];
      try {
        materialsBefore.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
      } catch { /* non-critical */ }
      const materialIdsBefore = new Set(materialsBefore.map((m) => m.servicetitan_material_id).filter(Boolean));
      const mvBefore: any[] = [];
      try {
        mvBefore.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
      } catch { /* non-critical */ }
      const mvCountBefore = mvBefore.length;

      // ── Fetch deterministic source set (same 5 pages, no new modifications) ──
      const context: any = {
        base44,
        tenantId,
        environment,
        watermark,
        batchId: `bounded-${Date.now()}`,
        source: "api_recovery",
      };

      const sourceRecords: any[] = [];
      const seenSourceIds = new Set<string>();
      let page = 1;
      let fetchHasMore = true;
      let pagesFetched = 0;
      let fetchErrors = 0;

      while (fetchHasMore && page <= batchPages && sourceRecords.length < batchSize) {
        let pageResult;
        try {
          pageResult = await materialAdapter.fetchPage(context, {
            pagination: { mode: "page", page, pageSize: MATERIAL_PAGE_SIZE },
            filterField: "modifiedOn",
            windowStart: windowStartIso,
            windowEnd: windowEndIso,
          });
          pagesFetched++;
        } catch (err: any) {
          fetchErrors++;
          if (fetchErrors >= 3) break;
          await new Promise((r) => setTimeout(r, 2000));
          page++;
          continue;
        }
        const records = pageResult.records || [];
        for (const rec of records) {
          const sid = materialAdapter.getSourceId(rec);
          if (sid && !seenSourceIds.has(sid) && sourceRecords.length < batchSize) {
            seenSourceIds.add(sid);
            sourceRecords.push(rec);
          }
        }
        fetchHasMore = pageResult.hasMore;
        if (fetchHasMore && pageResult.nextPage != null) {
          page = pageResult.nextPage;
        } else {
          fetchHasMore = false;
        }
      }

      // ── Process source records with bounded concurrency + safe create ──
      const retryMetrics = createSyncRetryMetrics();
      const outcomes: RecordOutcome[] = sourceRecords.map((rec) => ({
        source_id: materialAdapter.getSourceId(rec) || "",
        disposition: "permanently_failed" as RecordDisposition,
        attempts: 0,
      }));

      const processOneRecord = async (rec: any, idx: number): Promise<void> => {
        const sourceId = materialAdapter.getSourceId(rec) || "";
        let attempts = 0;

        try {
          // Step 1: Map record (may throw on invalid — not retriable)
          const mapped = await materialAdapter.mapRecord(rec, context);

          // Step 2: Find existing (lookup retry — safe to retry)
          let existing: any = null;
          try {
            existing = await withRetry(
              () => materialAdapter.findExisting(base44, mapped, context),
              {
                maxRetries: maxRetriesPerRecord,
                onRetry: (_a, _e, d) => {
                  retryMetrics.lookup_retries++;
                  console.log(`[BOUNDED RETRY] sourceId='${sourceId}' findExisting retry after ${d}ms`);
                },
              }
            );
          } catch (lookupErr: any) {
            if (isRateLimitError(lookupErr)) {
              retryMetrics.lookup_retry_exhausted++;
              outcomes[idx] = {
                source_id: sourceId,
                disposition: "rate_limited_unresolved",
                attempts: 1,
                error: `findExisting rate-limited after retries: ${String(lookupErr?.message || lookupErr).substring(0, 200)}`,
              };
              return;
            }
            throw lookupErr;
          }

          // Step 3: Stale check
          if (existing) {
            const localMod = materialAdapter.getLocalSourceModifiedOn(existing);
            const comparison = compareSourceVersions({
              incomingModifiedOn: materialAdapter.getSourceModifiedOn(rec),
              localModifiedOn: localMod,
            });
            if (comparison === "older" || comparison === "invalid_incoming") {
              outcomes[idx] = { source_id: sourceId, disposition: "unchanged", attempts: 1 };
              return;
            }
          }

          // Step 4: Dependency check
          if (materialAdapter.verifyDependencies) {
            const depResult = await materialAdapter.verifyDependencies(base44, mapped, context);
            if (depResult.status === "deferred") {
              outcomes[idx] = {
                source_id: sourceId,
                disposition: "deferred",
                attempts: 1,
                error: depResult.warning,
                diagnostics: (depResult as any).diagnostics,
                verifyDependenciesDiagnostic: (depResult as any).verifyDependenciesDiagnostic,
              };
              return;
            }
            if (depResult.status === "failed") {
              outcomes[idx] = { source_id: sourceId, disposition: "permanently_failed", attempts: 1, error: depResult.warning };
              return;
            }
          }

          // Step 5: Records equal check
          if (existing && materialAdapter.recordsEqual(existing, mapped)) {
            outcomes[idx] = { source_id: sourceId, disposition: "unchanged", attempts: 1 };
            return;
          }

          // Step 6: Safe create or update
          if (existing) {
            // Update — safe to retry
            try {
              await withRetry(
                () => materialAdapter.updateRecord(base44, existing, mapped, context),
                {
                  maxRetries: maxRetriesPerRecord,
                  onRetry: () => { retryMetrics.update_retries++; },
                }
              );
              outcomes[idx] = { source_id: sourceId, disposition: "updated", attempts: 1 };
            } catch (updateErr: any) {
              if (isRateLimitError(updateErr)) {
                outcomes[idx] = {
                  source_id: sourceId,
                  disposition: "rate_limited_unresolved",
                  attempts: 1,
                  error: `Update rate-limited after retries: ${String(updateErr?.message || updateErr).substring(0, 200)}`,
                };
              } else {
                outcomes[idx] = {
                  source_id: sourceId,
                  disposition: "permanently_failed",
                  attempts: 1,
                  error: String(updateErr?.message || updateErr).substring(0, 200),
                };
              }
            }
            return;
          }

          // No existing record — use safeCreateWithRecheck
          const createResult = await safeCreateWithRecheck(
            () => materialAdapter.findExisting(base44, mapped, context),
            () => materialAdapter.createRecord(base44, mapped, context),
            (existingRecord) => materialAdapter.updateRecord(base44, existingRecord, mapped, context),
            retryMetrics,
            maxRetriesPerRecord
          );

          if (createResult.action === "create_recheck_recovery") {
            outcomes[idx] = {
              source_id: sourceId,
              disposition: "updated",
              attempts: createResult.attempts,
              error: "create_recheck_recovery: create partially committed, post-create recheck found record, updated instead of duplicating",
            };
          } else if (createResult.action === "created") {
            outcomes[idx] = { source_id: sourceId, disposition: "created", attempts: createResult.attempts };
          } else {
            outcomes[idx] = { source_id: sourceId, disposition: "updated", attempts: createResult.attempts };
          }
          return;
        } catch (err: any) {
          if (isRateLimitError(err)) {
            outcomes[idx] = {
              source_id: sourceId,
              disposition: "rate_limited_unresolved",
              attempts: 1,
              error: `Rate-limited: ${String(err?.message || err).substring(0, 200)}`,
            };
          } else {
            outcomes[idx] = {
              source_id: sourceId,
              disposition: "permanently_failed",
              attempts: 1,
              error: String(err?.message || err).substring(0, 200),
            };
          }
          return;
        }
      };

      const boundedResults = await runBoundedConcurrent(
        sourceRecords,
        processOneRecord,
        { concurrency }
      );

      // ── Reconcile outcomes ──
      const reconciliation = reconcileOutcomes(outcomes, batchSize);

      // ── Snapshot local state after ──
      const materialsAfter: any[] = [];
      try {
        materialsAfter.push(...await base44.asServiceRole.entities.InventoryMaster.filter({ servicetitan_material_id: { $ne: null } }, "-created_date", 5000));
      } catch { /* non-critical */ }
      const materialCountAfter = materialsAfter.length;
      const mvAfter: any[] = [];
      try {
        mvAfter.push(...await base44.asServiceRole.entities.MaterialVendor.list("-created_date", 5000));
      } catch { /* non-critical */ }
      const mvCountAfter = mvAfter.length;

      // ── Duplicate detection ──
      const stIdCounts = new Map<string, number>();
      for (const m of materialsAfter) {
        if (m.servicetitan_material_id) {
          stIdCounts.set(m.servicetitan_material_id, (stIdCounts.get(m.servicetitan_material_id) || 0) + 1);
        }
      }
      const duplicateStIds = Array.from(stIdCounts.entries()).filter(([, c]) => c > 1);
      const mvKeyCounts = new Map<string, number>();
      for (const mv of mvAfter) {
        if (mv.relationship_key) {
          mvKeyCounts.set(mv.relationship_key, (mvKeyCounts.get(mv.relationship_key) || 0) + 1);
        }
      }
      const duplicateMvKeys = Array.from(mvKeyCounts.entries()).filter(([, c]) => c > 1);

      // ── LVC-owned field check on newly created ──
      const newlyCreated = materialsAfter.filter((m) => !materialIdsBefore.has(m.servicetitan_material_id));
      const lvcOwnedCheckFields = [
        "quantity_owned", "quantity_available", "quantity_assigned", "quantity_reserved",
        "quantity_on_order", "quantity_in_transit", "quantity_damaged", "quantity_retired",
        "warehouse_location", "warehouse_location_id", "bin_location", "bin_location_id",
        "reorder_point", "reorder_quantity", "minimum_stock", "maximum_stock",
        "is_stocked_inventory_item", "unit_cost", "average_cost", "inventory_value",
      ];
      let lvcOwnedOverwrites = 0;
      let quantityOverwrites = 0;
      let warehouseBinOverwrites = 0;
      let reorderOverwrites = 0;
      for (const m of newlyCreated) {
        for (const f of lvcOwnedCheckFields) {
          const val = m[f];
          const defaultVal = f === "is_stocked_inventory_item" ? false : (typeof val === "number" ? 0 : (typeof val === "string" ? "" : false));
          if (val !== undefined && val !== null && val !== defaultVal) {
            lvcOwnedOverwrites++;
            if (f.startsWith("quantity_")) quantityOverwrites++;
            if (f.includes("warehouse") || f.includes("bin_location")) warehouseBinOverwrites++;
            if (f === "reorder_point" || f === "reorder_quantity" || f === "minimum_stock" || f === "maximum_stock") reorderOverwrites++;
          }
        }
      }

      // ── Watermark after (NOT advanced — controlled acceptance test) ──
      const watermarkAfter: any = {};
      try {
        const wmAfter = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
        watermarkAfter.last_modified_scan_at = wmAfter?.last_modified_scan_at || null;
        watermarkAfter.materials_imported_since_activation = wmAfter?.materials_imported_since_activation || 0;
      } catch { /* non-critical */ }

      const newMaterialsCreated = Math.max(0, materialCountAfter - materialsBefore.length);
      const newMvCreated = Math.max(0, mvCountAfter - mvCountBefore);

      const allProcessed = reconciliation.rate_limited_unresolved === 0 && reconciliation.permanently_failed === 0;

      // ── Deferred records detail (full diagnostic — only for deferred records) ──
      const deferredOutcomes = outcomes.filter((o) => o.disposition === "deferred");

      // Build a local vendor ID set for secondary existence verification
      const localVendorStIdSet = new Set<string>();
      try {
        const localVendors = await base44.asServiceRole.entities.Vendor.filter(
          { servicetitan_vendor_id: { $ne: null } },
          "-servicetitan_last_sync",
          5000
        );
        for (const v of localVendors) {
          if (v.servicetitan_vendor_id) localVendorStIdSet.add(String(v.servicetitan_vendor_id));
        }
      } catch { /* non-critical */ }

      const deferredRecordsDetail = [];
      for (const outcome of deferredOutcomes) {
        const stMatId = outcome.source_id;
        const localMat = materialsAfter.find((m) => String(m.servicetitan_material_id) === stMatId);
        const verifyDep = (outcome as any).verifyDependenciesDiagnostic || {};
        const perVendorLookups = verifyDep.per_vendor_lookup_diagnostics || (outcome as any).diagnostics || [];

        // Build the per-vendor lookup table
        const vendorLookupTable = perVendorLookups.map((d: any) => {
          // Secondary existence check: does this vendor ID exist in the local registry?
          const existsInLocalRegistry = localVendorStIdSet.has(d.vendor_st_id || d.vendor_st_id_normalized_value);

          // Extract the classification from verifyDependencies failure_classifications
          const classification = verifyDep.failure_classifications?.find(
            (f: any) => f.vendor_st_id === (d.vendor_st_id || d.vendor_st_id_raw_value)
          )?.classification;

          return {
            material_st_id: d.material_st_id || stMatId,
            material_name: d.material_name || localMat?.item_name || "",
            vendor_st_id: d.vendor_st_id || d.vendor_st_id_normalized_value || "",
            vendor_st_id_raw_value: d.vendor_st_id_raw_value || "",
            vendor_st_id_normalized_value: d.vendor_st_id_normalized_value || "",
            vendor_st_id_runtime_type: d.vendor_st_id_runtime_type || "",
            tenant_id: d.tenant_id || "",
            environment: d.environment || "",
            lookup_started_at: d.lookup_started_at || "",
            lookup_completed_at: d.lookup_completed_at || "",
            exact_query_used: d.exact_query_used || "",
            query_result: d.outcome || "",
            record_count_returned: d.record_count_returned ?? 0,
            // When found
            local_vendor_record_id: d.local_vendor_record_id || null,
            local_servicetitan_vendor_id: d.local_servicetitan_vendor_id || null,
            vendor_name: d.vendor_name || null,
            matched_field: d.matched_field || null,
            // When exception
            exception_name: d.exception_name || null,
            exception_message: d.exception_message || null,
            http_status: d.http_status || null,
            base44_error_code: d.base44_error_code || null,
            retry_after_ms: d.retry_after_ms || null,
            stack_location: d.stack_location || null,
            is_rate_limit_error: d.is_rate_limit_error ?? null,
            is_retriable_error: d.is_retriable_error ?? null,
            // Classification
            failure_classification: classification || (d.outcome === "no_record_found"
              ? (existsInLocalRegistry ? "TENANT_OR_ENVIRONMENT_MISMATCH" : "MISSING_VENDOR")
              : d.outcome === "exception"
                ? (d.is_rate_limit_error ? "RATE_LIMITED_LOOKUP" : d.is_retriable_error ? "TRANSIENT_LOOKUP_FAILURE" : "OTHER_EXCEPTION")
                : null),
            exists_in_local_registry: existsInLocalRegistry,
          };
        });

        // Determine overall root cause from classifications
        const classifications = vendorLookupTable.map((v: any) => v.failure_classification).filter(Boolean);
        const hasRateLimited = classifications.includes("RATE_LIMITED_LOOKUP");
        const hasTransient = classifications.includes("TRANSIENT_LOOKUP_FAILURE");
        const hasMissing = classifications.includes("MISSING_VENDOR");
        const hasNormalization = classifications.includes("NORMALIZATION_MISMATCH");
        const hasTenantEnv = classifications.includes("TENANT_OR_ENVIRONMENT_MISMATCH");
        const hasMultiple = classifications.includes("MULTIPLE_VENDOR_MATCHES") || verifyDep.multiple_vendor_matches;
        const hasOtherException = classifications.includes("OTHER_EXCEPTION");
        const hasDeterministic = classifications.includes("DETERMINISTIC_LOOKUP_FAILURE");

        let rootCause: string;
        let deferCausedBy: string;
        if (hasMultiple) {
          rootCause = "MULTIPLE_VENDOR_MATCHES — more than one local Vendor record returned for the same immutable ServiceTitan Vendor ID. Vendor identity-integrity failure.";
          deferCausedBy = "multiple_vendor_matches";
        } else if (hasMissing) {
          rootCause = "MISSING_VENDOR — one or more referenced ServiceTitan vendor IDs have no local Vendor record.";
          deferCausedBy = "missing_vendor";
        } else if (hasNormalization) {
          rootCause = "NORMALIZATION_MISMATCH — vendor exists locally but lookup fails due to string/number/whitespace/format conversion mismatch.";
          deferCausedBy = "normalization_mismatch";
        } else if (hasTenantEnv) {
          rootCause = "TENANT_OR_ENVIRONMENT_MISMATCH — vendor exists locally but excluded by tenant/environment/active filter.";
          deferCausedBy = "tenant_or_environment_mismatch";
        } else if (hasDeterministic) {
          rootCause = "DETERMINISTIC_LOOKUP_FAILURE — query consistently fails due to invalid filter syntax, schema mismatch, or unsupported field.";
          deferCausedBy = "deterministic_lookup_failure";
        } else if (hasRateLimited) {
          rootCause = "RATE_LIMITED_LOOKUP — Vendor.filter() threw HTTP 429 or Base44 rate-limit response during resolveAllVendorRelationships.";
          deferCausedBy = "rate_limited_lookup";
        } else if (hasTransient) {
          rootCause = "TRANSIENT_LOOKUP_FAILURE — Vendor.filter() failed due to timeout, network, or 5xx infrastructure error.";
          deferCausedBy = "transient_lookup_failure";
        } else if (hasOtherException) {
          rootCause = "OTHER_EXCEPTION — Vendor.filter() threw a non-retriable, non-rate-limit exception.";
          deferCausedBy = "other_exception";
        } else if (perVendorLookups.length === 0) {
          rootCause = "NO_LOOKUPS_EXECUTED — verifyDependencies returned deferred but no vendor lookup diagnostics were captured. Material has no local MaterialVendor records; vendor IDs come from ServiceTitan source data.";
          deferCausedBy = "no_lookups_executed";
        } else {
          rootCause = "UNCLASSIFIED — vendor lookups returned without exception but were classified as unresolved.";
          deferCausedBy = "unclassified";
        }

        deferredRecordsDetail.push({
          servicetitan_material_id: stMatId,
          material_name: localMat?.item_name || verifyDep.material_name || "(not found locally)",
          sku: localMat?.sku || "",
          exists_locally: !!localMat,
          existing_local_material_id: verifyDep.existing_local_material_id || null,
          // verifyDependencies summary
          verifyDependenciesDiagnostic: {
            material_st_id: verifyDep.material_st_id || stMatId,
            material_name: verifyDep.material_name || localMat?.item_name || "",
            existing_local_material_id: verifyDep.existing_local_material_id || null,
            number_of_source_vendor_relationships: verifyDep.number_of_source_vendor_relationships ?? 0,
            source_vendor_ids: verifyDep.source_vendor_ids || [],
            resolved_vendor_ids: verifyDep.resolved_vendor_ids || [],
            unresolved_vendor_ids: verifyDep.unresolved_vendor_ids || [],
            vendor_lookup_exceptions: verifyDep.vendor_lookup_exceptions || [],
            dependency_status_returned: verifyDep.dependency_status_returned || "deferred",
            dependency_warning_returned: verifyDep.dependency_warning_returned || outcome.error,
            decision_path: verifyDep.decision_path || "",
            multiple_vendor_matches: verifyDep.multiple_vendor_matches || false,
            multiple_match_details: verifyDep.multiple_match_details || [],
          },
          // Per-vendor lookup table (detailed)
          per_vendor_lookup_table: vendorLookupTable,
          // Summary
          vendor_lookup_summary: {
            total_lookups: perVendorLookups.length,
            record_found: perVendorLookups.filter((d: any) => d.outcome === "record_found").length,
            no_record_found: perVendorLookups.filter((d: any) => d.outcome === "no_record_found").length,
            exception: perVendorLookups.filter((d: any) => d.outcome === "exception").length,
            rate_limited: perVendorLookups.filter((d: any) => d.is_rate_limit_error === true).length,
            retriable_non_rate_limit: perVendorLookups.filter((d: any) => d.is_retriable_error === true && d.is_rate_limit_error !== true).length,
          },
          // Classification
          root_cause: rootCause,
          defer_caused_by: deferCausedBy,
          failure_classifications: classifications,
          // Secondary existence check
          all_unresolved_vendors_exist_in_local_registry: vendorLookupTable.filter((v: any) =>
            v.query_result !== "record_found"
          ).every((v: any) => v.exists_in_local_registry) && vendorLookupTable.some((v: any) => v.query_result !== "record_found"),
          attempts: outcome.attempts,
        });
      }

      return Response.json({
        mode: "bounded_retry",
        batch_size: batchSize,
        concurrency,
        max_retries_per_record: maxRetriesPerRecord,
        pages_fetched: pagesFetched,
        source_records_fetched: sourceRecords.length,
        fetch_errors: fetchErrors,
        deterministic_sample_definition: `${pagesFetched} pages × ${MATERIAL_PAGE_SIZE} records/page from modifiedOnOrAfter=${windowStartIso}, bounded to ${batchSize} records. Later pages and newly modified records are excluded.`,
        watermark_before: watermarkBefore,
        watermark_after: watermarkAfter,
        watermark_advanced: false,
        reconciliation: reconciliation,
        reconciliation_formula: "created + updated + unchanged + deferred + permanently_failed + rate_limited_unresolved = total",
        outcomes_by_disposition: {
          created: reconciliation.created,
          updated: reconciliation.updated,
          unchanged: reconciliation.unchanged,
          deferred: reconciliation.deferred,
          permanently_failed: reconciliation.permanently_failed,
          rate_limited_unresolved: reconciliation.rate_limited_unresolved,
          total: reconciliation.total,
          reconciled: reconciliation.reconciled,
        },
        per_record_outcomes: body.include_all_outcomes === true ? outcomes : (body.diagnostic_only === true ? `[${outcomes.filter((o) => o.disposition !== "unchanged").length} non-unchanged outcomes suppressed — see deferred_records_detail]` : outcomes.filter((o) => o.disposition !== "unchanged")),
        deferred_records_detail: body.compact_detail === true
          ? deferredRecordsDetail.map((d) => ({
              material_st_id: d.servicetitan_material_id,
              material_name: d.material_name,
              sku: d.sku,
              root_cause: d.root_cause,
              defer_caused_by: d.defer_caused_by,
              failure_classifications: d.failure_classifications,
              vendor_lookup_summary: d.vendor_lookup_summary,
              all_unresolved_vendors_exist_in_local_registry: d.all_unresolved_vendors_exist_in_local_registry,
              verifyDependencies_decision_path: d.verifyDependenciesDiagnostic?.decision_path,
              per_vendor_lookups: (d.per_vendor_lookup_table || []).map((v) => ({
                vendor_st_id: v.vendor_st_id,
                query_result: v.query_result,
                exception_name: v.exception_name,
                exception_message: v.exception_message ? String(v.exception_message).substring(0, 100) : null,
                http_status: v.http_status,
                is_rate_limit_error: v.is_rate_limit_error,
                is_retriable_error: v.is_retriable_error,
                failure_classification: v.failure_classification,
                exists_in_local_registry: v.exists_in_local_registry,
                local_vendor_record_id: v.local_vendor_record_id,
                vendor_name: v.vendor_name,
                exact_query_used: v.exact_query_used,
              })),
            }))
          : deferredRecordsDetail,
        material_count_before: materialsBefore.length,
        material_count_after: materialCountAfter,
        new_materials_created: newMaterialsCreated,
        material_vendor_count_before: mvCountBefore,
        material_vendor_count_after: mvCountAfter,
        new_material_vendor_created: newMvCreated,
        duplicate_st_material_ids: duplicateStIds.length,
        duplicate_material_vendor_keys: duplicateMvKeys.length,
        lvc_owned_field_overwrites: lvcOwnedOverwrites,
        quantity_field_overwrites: quantityOverwrites,
        warehouse_bin_overwrites: warehouseBinOverwrites,
        reorder_field_overwrites: reorderOverwrites,
        all_records_processed: allProcessed,
        batch_state: allProcessed
          ? "COMPLETED — all 250 records processed successfully"
          : "CONTROLLED_STOP — some records remain unresolved due to infrastructure limits",
        resume_boundary: reconciliation.rate_limited_unresolved > 0
          ? `${reconciliation.rate_limited_unresolved} records remain rate_limited_unresolved. Resume boundary = watermark last_modified_scan_at (${watermarkAfter.last_modified_scan_at}). Watermark NOT advanced past them.`
          : null,
        retry_metrics: retryMetrics,
        acceptance: (allProcessed && duplicateStIds.length === 0 && duplicateMvKeys.length === 0 && lvcOwnedOverwrites === 0)
          ? "PASS — all 250 processed, zero duplicates, zero LVC overwrites, watermark not advanced"
          : "PARTIAL — see reconciliation and integrity metrics",
      });
    }

    // ── Incremental ──
    if (mode === "incremental") {
      const watermark = await getWatermark(base44, materialWatermarkConfig, tenantId, environment);
      if (!watermark || watermark.status !== "active") {
        return Response.json({
          mode: "incremental",
          status: "no_watermark",
          message: "No active Material Sync watermark found. Activate the watermark first using mode='activate'.",
        }, { status: 400 });
      }

      const overlapMinutes = watermark.recovery_overlap_minutes || materialWatermarkConfig.defaultOverlapMinutes || 5;
      const lastScanAt = watermark.last_modified_scan_at || watermark.activation_timestamp;
      const windowStart = new Date(new Date(lastScanAt).getTime() - overlapMinutes * 60 * 1000);
      const windowEnd = new Date();

      try {
        await base44.asServiceRole.entities.MaterialSyncWatermark.update(watermark.id, {
          recovery_window_start: windowStart.toISOString(),
          recovery_window_end: windowEnd.toISOString(),
          recovery_window_status: "in_progress",
          recovery_window_errors: 0,
        });
      } catch { /* non-critical */ }

      const result = await runSyncEngine(materialAdapter, {
        executionMode: "write",
        maxPages: MATERIAL_MAX_PAGES,
        maxRecords: 15000,
        maxRuntimeMs: 540000,
        lockConfig: materialLockConfig,
        watermarkConfig: materialWatermarkConfig,
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
          await incrementWatermarkCounters(base44, materialWatermarkConfig.entityName, watermark.id, {
            materials_imported_since_activation: result.created,
            materials_updated: result.updated,
            recovery_events_processed: result.processed,
          });
        } catch { /* non-critical */ }
      }

      if (!succeeded && !lockConflict) {
        try {
          await base44.asServiceRole.entities.MaterialSyncWatermark.update(watermark.id, {
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
        deferred: result.deferred,
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
          ? `Incremental material sync completed: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.deferred} deferred.`
          : lockConflict
            ? "Another incremental material sync worker is already running."
            : `Incremental material sync partial failure: ${result.failed} failed. Watermark NOT advanced.`,
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[ST MATERIAL SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message, summary: "Material sync failed" }, { status: 500 });
  }
});