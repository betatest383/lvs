/**
 * resolvePoLineMaterialDependencies — Stage 2E.5 (Recovered)
 *
 * ARCHITECTURE CHANGE: Scan the ServiceTitan material catalog ONCE per batch
 * (max 5 pages), build an in-memory index, and resolve all missing PO line
 * material IDs against that single scan. No per-material page scanning.
 * Resumable via start_page / next_page.
 *
 * Modes:
 *   diagnostic_only        — Zero writes. Scan PO lines, scan material catalog
 *                            (bounded), match against index, return evidence.
 *   probe_single_endpoint  — Test one material ID against the single-item
 *                            endpoint. Return HTTP status + body. No fallback.
 *   controlled_write       — Create only resolved target materials using
 *                            safeCreateWithRecheck. Preserve LVC-owned fields.
 *
 * Bounds (diagnostic):
 *   max_pages = 5, page_size = 50, max_runtime_seconds = 120, writes = 0
 *
 * Security: admin/owner only.
 * Direction: ServiceTitan → LVC OS only. No outbound writes to ServiceTitan.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { apiRequest, retryWithBackoff, getEnvironment, getTenantId } from "../../shared/stAuth.ts";
import {
  PURCHASE_ORDERS_API_PATH,
  PURCHASE_ORDER_PAGE_SIZE,
  PURCHASE_ORDER_OVERLAP_MINUTES,
} from "../../shared/stSync/stPurchaseOrderSyncConfig.ts";
import { ITEMS_API_PATH, MATERIAL_PAGE_SIZE } from "../../shared/stSync/stMaterialSyncConfig.ts";
import { materialAdapter } from "../../shared/stSync/adapters/materialAdapter.ts";
import {
  syncMaterialCreated,
  syncMaterialUpdated,
  resolveAllVendorRelationships,
  upsertMaterialVendor,
  buildMaterialCreateData,
  buildMaterialUpdateData,
  assertNoLvcFieldWritten,
  normalizeMaterialId,
  MATERIAL_LVC_OWNED_FIELDS,
  type MappedMaterial,
} from "../../shared/stMaterialSync.ts";
import {
  safeCreateWithRecheck,
  createSyncRetryMetrics,
  type SyncRetryMetrics,
} from "../../shared/stSync/stRateLimitProtection.ts";
import { normalizePoId } from "../../shared/stPurchaseOrderSync.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const FUNCTION_VERSION = "2.0.0-recovered";
const DIAGNOSTIC_MAX_PAGES = 5;
const DIAGNOSTIC_MAX_RUNTIME_MS = 120000;
const WRITE_MAX_RUNTIME_MS = 270000;
const PO_PAGE_SIZE = PURCHASE_ORDER_PAGE_SIZE;
const MAT_PAGE_SIZE = MATERIAL_PAGE_SIZE;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiagnosticResult {
  function_deployed: boolean;
  function_version: string;
  writes_performed: number;
  unique_missing_material_ids: string[];
  pages_scanned: number;
  materials_examined: number;
  material_ids_resolved: string[];
  material_ids_unresolved: string[];
  has_more: boolean;
  next_page: number | null;
  remaining_target_ids: string[];
  resolved_target_ids: string[];
  scan_complete: boolean;
  duplicate_servicetitan_material_ids: string[];
  duplicate_local_material_ids: string[];
  local_inventory_master_matches: string[];
  runtime_ms: number;
}

interface ProbeResult {
  endpoint_path: string;
  http_status: number | null;
  response_body_summary: string;
  duration_ms: number;
  material_id: string;
}

interface ControlledWriteResult {
  materials_created: number;
  materials_updated: number;
  materials_unchanged: number;
  materials_deferred: number;
  material_vendor_links_created: number;
  material_vendor_links_updated: number;
  duplicate_material_ids: string[];
  duplicate_material_vendor_keys: string[];
  lvc_owned_field_overwrites: number;
  resolved_target_ids: string[];
  still_missing: string[];
  details: Array<{ material_id: string; status: string; error?: string }>;
  runtime_ms: number;
}

// ─── Phase 1: Extract Missing Material IDs from PO Lines ─────────────────────

async function extractMissingMaterialIds(
  base44: any,
  tenantId: string,
  environment: string
): Promise<{
  all_line_material_ids: string[];
  unique_material_ids: string[];
  local_matches: Map<string, string>;
  missing_ids: string[];
  duplicate_local_ids: string[];
}> {
  const poPath = PURCHASE_ORDERS_API_PATH(tenantId);
  const windowStart = new Date(
    Date.now() - 30 * 86400000 - PURCHASE_ORDER_OVERLAP_MINUTES * 60 * 1000
  ).toISOString();

  const result = await retryWithBackoff(async () => {
    return await apiRequest(poPath, environment, {
      params: { page: "1", pageSize: String(PO_PAGE_SIZE), modifiedOnOrAfter: windowStart },
    });
  });

  const poRecords: any[] = result.data || result.items || [];

  // Extract all unique material IDs from items[]
  const allLineMaterialIds: string[] = [];
  const uniqueSet = new Set<string>();

  for (const po of poRecords) {
    const items = Array.isArray(po.items) ? po.items : [];
    for (const item of items) {
      const matId = normalizePoId(item.skuId) || "";
      if (matId) {
        allLineMaterialIds.push(matId);
        uniqueSet.add(matId);
      }
    }
  }
  const uniqueMaterialIds = Array.from(uniqueSet);

  // Check local InventoryMaster for each — detect duplicates
  const localMatches = new Map<string, string>();
  const missingIds: string[] = [];
  const localIdCounts = new Map<string, number>();

  for (const matId of uniqueMaterialIds) {
    try {
      const results = await base44.asServiceRole.entities.InventoryMaster.filter(
        { servicetitan_material_id: matId },
        "-servicetitan_last_sync",
        10
      );
      if (results.length > 0) {
        localMatches.set(matId, results[0].id);
        for (const r of results) {
          localIdCounts.set(r.id, (localIdCounts.get(r.id) || 0) + 1);
        }
      } else {
        missingIds.push(matId);
      }
    } catch {
      missingIds.push(matId);
    }
  }

  const duplicateLocalIds = Array.from(localIdCounts.entries())
    .filter(([, c]) => c > 1)
    .map(([id]) => id);

  return {
    all_line_material_ids: allLineMaterialIds,
    unique_material_ids: uniqueMaterialIds,
    local_matches: localMatches,
    missing_ids: missingIds,
    duplicate_local_ids: duplicateLocalIds,
  };
}

// ─── Phase 2: Bounded Material Catalog Scan (Single Pass) ────────────────────

async function scanMaterialCatalog(
  tenantId: string,
  environment: string,
  startPage: number,
  maxPages: number,
  targetIds: Set<string>,
  startTime: number,
  maxRuntimeMs: number
): Promise<{
  index: Map<string, any>;
  pagesScanned: number;
  materialsExamined: number;
  hasMore: boolean;
  nextPage: number | null;
  duplicateStIds: string[];
}> {
  const path = ITEMS_API_PATH(tenantId);
  const index = new Map<string, any>();
  const stIdCounts = new Map<string, number>();
  let pagesScanned = 0;
  let materialsExamined = 0;
  let hasMore = false;
  let lastPage = startPage;

  for (let page = startPage; page < startPage + maxPages; page++) {
    if (Date.now() - startTime > maxRuntimeMs) break;
    if (targetIds.size > 0 && index.size >= targetIds.size) break;

    try {
      const result = await retryWithBackoff(async () => {
        return await apiRequest(path, environment, {
          params: { page: String(page), pageSize: String(MAT_PAGE_SIZE) },
        });
      });

      pagesScanned++;
      lastPage = page;
      const records: any[] = result.data || result.items || result.results || [];
      materialsExamined += records.length;

      for (const record of records) {
        const matId = normalizeMaterialId(record.id ?? record.Id);
        if (matId) {
          index.set(matId, record);
          stIdCounts.set(matId, (stIdCounts.get(matId) || 0) + 1);
        }
      }

      hasMore = result.hasMore ?? result.has_more ?? false;
      if (!hasMore) break;
    } catch (err) {
      break;
    }
  }

  const duplicateStIds = Array.from(stIdCounts.entries())
    .filter(([, c]) => c > 1)
    .map(([id]) => id);

  return {
    index,
    pagesScanned,
    materialsExamined,
    hasMore,
    nextPage: hasMore ? lastPage + 1 : null,
    duplicateStIds,
  };
}

// ─── Single-Item Resolution (bounded, no page scanning) ─────────────────────

async function fetchSingleMaterial(
  tenantId: string,
  environment: string,
  materialId: string
): Promise<any | null> {
  try {
    const path = `${ITEMS_API_PATH(tenantId)}/${materialId}`;
    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, environment, {});
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Resolve missing material IDs using a bounded two-phase approach:
 *   Phase 1: Page scan (max 5 pages) — build in-memory index from catalog.
 *   Phase 2: Single-item fetch for IDs not found in the page scan.
 * No per-material page scanning. Each single-item call is one HTTP GET.
 */
async function resolveMaterials(
  tenantId: string,
  environment: string,
  targetIds: Set<string>,
  startPage: number,
  maxPages: number,
  startTime: number,
  maxRuntimeMs: number
): Promise<{
  found: Map<string, any>;
  via_page_scan: string[];
  via_single_item: string[];
  unresolved: string[];
  pages_scanned: number;
  materials_examined: number;
  has_more: boolean;
  next_page: number | null;
  duplicate_st_ids: string[];
}> {
  // Phase 1: Page scan (single pass)
  const scan = await scanMaterialCatalog(
    tenantId, environment, startPage, maxPages, targetIds, startTime, maxRuntimeMs
  );

  const found = new Map<string, any>();
  const viaPageScan: string[] = [];
  const viaSingleItem: string[] = [];
  const unresolved: string[] = [];

  // Match against page scan
  for (const matId of Array.from(targetIds)) {
    if (scan.index.has(matId)) {
      found.set(matId, scan.index.get(matId));
      viaPageScan.push(matId);
    }
  }

  // Phase 2: Single-item fetch for remaining unresolved IDs
  const remaining = Array.from(targetIds).filter((id) => !found.has(id));
  for (const matId of remaining) {
    if (Date.now() - startTime > maxRuntimeMs) {
      unresolved.push(matId);
      continue;
    }
    const record = await fetchSingleMaterial(tenantId, environment, matId);
    if (record) {
      found.set(matId, record);
      viaSingleItem.push(matId);
    } else {
      unresolved.push(matId);
    }
  }

  return {
    found,
    via_page_scan: viaPageScan,
    via_single_item: viaSingleItem,
    unresolved,
    pages_scanned: scan.pagesScanned,
    materials_examined: scan.materialsExamined,
    has_more: scan.hasMore,
    next_page: scan.nextPage,
    duplicate_st_ids: scan.duplicateStIds,
  };
}

// ─── Mode: diagnostic_only ──────────────────────────────────────────────────

async function runDiagnostic(
  base44: any,
  tenantId: string,
  environment: string,
  startPage: number,
  maxPages: number,
  targetMaterialIds: string[] | null,
  startTime: number
): Promise<DiagnosticResult> {
  // Step 1: Extract missing material IDs from PO lines
  const extraction = await extractMissingMaterialIds(base44, tenantId, environment);

  // Determine target IDs: either explicitly provided, or all missing
  const targetIds = targetMaterialIds && targetMaterialIds.length > 0
    ? new Set(targetMaterialIds)
    : new Set(extraction.missing_ids);

  // Step 2: Resolve materials (page scan + single-item fetch, bounded)
  const resolution = await resolveMaterials(
    tenantId, environment, targetIds, startPage, maxPages, startTime, DIAGNOSTIC_MAX_RUNTIME_MS
  );

  const scanComplete = !resolution.has_more || resolution.unresolved.length === 0;

  return {
    function_deployed: true,
    function_version: FUNCTION_VERSION,
    writes_performed: 0,
    unique_missing_material_ids: Array.from(targetIds),
    pages_scanned: resolution.pages_scanned,
    materials_examined: resolution.materials_examined,
    material_ids_resolved: Array.from(resolution.found.keys()),
    material_ids_unresolved: resolution.unresolved,
    has_more: resolution.has_more,
    next_page: resolution.next_page,
    remaining_target_ids: resolution.unresolved,
    resolved_target_ids: Array.from(resolution.found.keys()),
    scan_complete: scanComplete,
    duplicate_servicetitan_material_ids: resolution.duplicate_st_ids,
    duplicate_local_material_ids: extraction.duplicate_local_ids,
    local_inventory_master_matches: Array.from(extraction.local_matches.keys()),
    runtime_ms: Date.now() - startTime,
    resolution_method: {
      via_page_scan: resolution.via_page_scan.length,
      via_single_item: resolution.via_single_item.length,
    },
  };
}

// ─── Mode: probe_single_endpoint ─────────────────────────────────────────────

async function runProbe(
  tenantId: string,
  environment: string,
  materialId: string
): Promise<ProbeResult> {
  const path = `${ITEMS_API_PATH(tenantId)}/${materialId}`;
  const start = Date.now();

  try {
    const response = await apiRequest(path, environment, {}, true);
    const duration = Date.now() - start;

    return {
      endpoint_path: path,
      http_status: 200,
      response_body_summary: JSON.stringify(response).substring(0, 500),
      duration_ms: duration,
      material_id: materialId,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    const status = err?.status || err?.statusCode || null;
    const body = err?.body || err?.message || String(err);

    return {
      endpoint_path: path,
      http_status: status,
      response_body_summary: String(body).substring(0, 500),
      duration_ms: duration,
      material_id: materialId,
    };
  }
}

// ─── Mode: controlled_write ──────────────────────────────────────────────────

async function runControlledWrite(
  base44: any,
  tenantId: string,
  environment: string,
  targetMaterialIds: string[],
  startTime: number
): Promise<ControlledWriteResult> {
  const nowIso = new Date().toISOString();
  const context = {
    base44,
    tenantId,
    environment,
    watermark: null,
    batchId: `resolve-${Date.now()}`,
    source: "api_recovery" as const,
  };

  const result: ControlledWriteResult = {
    materials_created: 0,
    materials_updated: 0,
    materials_unchanged: 0,
    materials_deferred: 0,
    material_vendor_links_created: 0,
    material_vendor_links_updated: 0,
    duplicate_material_ids: [],
    duplicate_material_vendor_keys: [],
    lvc_owned_field_overwrites: 0,
    resolved_target_ids: [],
    still_missing: [],
    details: [],
    runtime_ms: 0,
  };

  if (targetMaterialIds.length === 0) {
    result.runtime_ms = Date.now() - startTime;
    return result;
  }

  // Step 1: Resolve materials (page scan + single-item fetch, bounded)
  const resolution = await resolveMaterials(
    tenantId, environment, new Set(targetMaterialIds), 1, DIAGNOSTIC_MAX_PAGES, startTime, WRITE_MAX_RUNTIME_MS
  );

  // Step 2: For each resolved target ID, prepare for creation
  const materialsToCreate: Array<{ matId: string; record: any }> = [];
  for (const matId of targetMaterialIds) {
    const record = resolution.found.get(matId);
    if (record) {
      materialsToCreate.push({ matId, record });
    } else {
      result.still_missing.push(matId);
      result.details.push({ material_id: matId, status: "not_found" });
    }
  }

  // Step 3: Create materials using safeCreateWithRecheck
  const metrics: SyncRetryMetrics = createSyncRetryMetrics();

  for (const { matId, record } of materialsToCreate) {
    if (Date.now() - startTime > WRITE_MAX_RUNTIME_MS) {
      result.materials_deferred++;
      result.details.push({ material_id: matId, status: "runtime_limit" });
      continue;
    }

    try {
      const mapped: MappedMaterial = await materialAdapter.mapRecord(record, context);

      const findExisting = async () => {
        const results = await base44.asServiceRole.entities.InventoryMaster.filter(
          { servicetitan_material_id: matId },
          "-servicetitan_last_sync",
          1
        );
        return results.length > 0 ? results[0] : null;
      };

      // Create: buildMaterialCreateData sets inventory_type:"Material" as the
      // initial classification — this is correct for a new record, not an
      // overwrite. LVC-owned field protection applies to UPDATES only.
      const createRecord = async () => {
        const data = buildMaterialCreateData(mapped, nowIso);
        return await base44.asServiceRole.entities.InventoryMaster.create(data);
      };

      const updateRecord = async (existing: any) => {
        const update = buildMaterialUpdateData(existing, mapped, nowIso);
        if (update) {
          // buildMaterialUpdateData strips LVC-owned fields, but assert to be safe
          const violations = assertNoLvcFieldWritten(update);
          if (violations.length > 0) {
            result.lvc_owned_field_overwrites += violations.length;
            return existing; // skip update rather than throw
          }
          await base44.asServiceRole.entities.InventoryMaster.update(existing.id, update);
        }
        return existing;
      };

      const safeResult = await safeCreateWithRecheck(
        findExisting,
        createRecord,
        updateRecord,
        metrics,
        3
      );

      if (safeResult.action === "created") {
        result.materials_created++;
        result.resolved_target_ids.push(matId);
      } else if (safeResult.action === "updated" || safeResult.action === "create_recheck_recovery") {
        result.materials_updated++;
        result.resolved_target_ids.push(matId);
      }

      // Step 4: Create MaterialVendor relationships
      if (mapped.vendor_relationships.length > 0) {
        const { resolved } = await resolveAllVendorRelationships(
          base44,
          mapped.vendor_relationships,
          undefined,
          {
            material_st_id: mapped.servicetitan_material_id,
            material_name: mapped.item_name,
            tenant_id: context.tenantId,
            environment: context.environment,
          }
        );

        const vendorById = new Map<string, any>();
        for (const r of resolved) {
          vendorById.set(r.mapped.servicetitan_vendor_id, r.vendor);
        }

        for (const rel of mapped.vendor_relationships) {
          const vendor = vendorById.get(rel.servicetitan_vendor_id) || null;
          const mvResult = await upsertMaterialVendor(
            base44,
            safeResult.record.id,
            mapped.servicetitan_material_id,
            rel,
            vendor,
            nowIso,
            context.source
          );
          if (mvResult.action === "created") {
            result.material_vendor_links_created++;
          } else if (mvResult.action === "updated") {
            result.material_vendor_links_updated++;
          }
        }
      }
    } catch (err) {
      result.materials_deferred++;
      result.details.push({
        material_id: matId,
        status: "create_failed",
        error: String(err).substring(0, 200),
      });
    }
  }

  // Post-write duplicate check
  const postCheck = await base44.asServiceRole.entities.InventoryMaster.list(5000).catch(() => []);
  const postStIdCounts = new Map<string, number>();
  for (const m of postCheck) {
    if (m.servicetitan_material_id) {
      postStIdCounts.set(
        m.servicetitan_material_id,
        (postStIdCounts.get(m.servicetitan_material_id) || 0) + 1
      );
    }
  }
  result.duplicate_material_ids = Array.from(postStIdCounts.entries())
    .filter(([, c]) => c > 1)
    .map(([id]) => id);

  result.runtime_ms = Date.now() - startTime;
  return result;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    let body: any = {};
    try { body = await req.json(); } catch {}

    const mode = body.mode || "diagnostic_only";
    const environment = body.environment || getEnvironment();
    const tenantId = body.tenant_id || getTenantId();
    const startTime = Date.now();

    // ── diagnostic_only ──
    if (mode === "diagnostic_only") {
      const startPage = Number(body.start_page) || 1;
      const maxPages = Math.min(Number(body.max_pages) || DIAGNOSTIC_MAX_PAGES, DIAGNOSTIC_MAX_PAGES);
      const targetMaterialIds = Array.isArray(body.target_material_ids) ? body.target_material_ids : null;

      const diagnostic = await runDiagnostic(
        base44, tenantId, environment, startPage, maxPages, targetMaterialIds, startTime
      );

      return Response.json({
        mode: "diagnostic_only",
        ...diagnostic,
        conclusion: diagnostic.scan_complete && diagnostic.material_ids_resolved.length > 0
          ? "STAGE 2E.5 PO LINE MATERIAL DEPENDENCY RESOLUTION — DIAGNOSTIC PASSED"
          : diagnostic.has_more
          ? "PARTIAL SCAN — resume with start_page=" + diagnostic.next_page
          : "STAGE 2E.5 PO LINE MATERIAL DEPENDENCY RESOLUTION — DIAGNOSTIC INCOMPLETE",
      });
    }

    // ── probe_single_endpoint ──
    if (mode === "probe_single_endpoint") {
      const materialId = body.probe_material_id || body.material_id;
      if (!materialId) {
        return Response.json({ error: "probe_material_id required" }, { status: 400 });
      }

      const probe = await runProbe(tenantId, environment, materialId);

      return Response.json({
        mode: "probe_single_endpoint",
        ...probe,
        conclusion: probe.http_status === 200
          ? "SINGLE-MATERIAL ENDPOINT — RESPONSE RECEIVED"
          : probe.http_status === 404
          ? "SINGLE-MATERIAL ENDPOINT — 404 NOT FOUND (proven API behavior)"
          : "SINGLE-MATERIAL ENDPOINT — ERROR RESPONSE",
      });
    }

    // ── controlled_write ──
    if (mode === "controlled_write") {
      const targetMaterialIds: string[] = Array.isArray(body.target_material_ids)
        ? body.target_material_ids
        : [];

      if (targetMaterialIds.length === 0) {
        return Response.json({
          error: "target_material_ids required for controlled_write mode",
        }, { status: 400 });
      }

      const writeResult = await runControlledWrite(
        base44, tenantId, environment, targetMaterialIds, startTime
      );

      return Response.json({
        mode: "controlled_write",
        ...writeResult,
        conclusion: writeResult.materials_created > 0 && writeResult.duplicate_material_ids.length === 0
          ? "STAGE 2E.5 CONTROLLED MATERIAL WRITE — SUCCESS"
          : "STAGE 2E.5 CONTROLLED MATERIAL WRITE — INCOMPLETE",
      });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[RESOLVE PO LINE MATERIAL DEPS ERROR]", { error: error.message });
    return Response.json(
      { error: error.message, summary: "PO line material dependency resolution failed" },
      { status: 500 }
    );
  }
}