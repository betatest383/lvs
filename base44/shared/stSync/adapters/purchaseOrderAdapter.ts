/**
 * Purchase Order Sync Adapter
 *
 * Implements ServiceTitanSyncAdapter for the Purchase Order domain (Stage 2E).
 *
 * DIRECTION: ServiceTitan → LVC OS only. The adapter performs NO outbound
 * writes to ServiceTitan. No ledger posting. No Receipt/Bill/Transfer creation.
 *
 * Endpoint: /inventory/v2/tenant/{tenant}/purchase-orders (VERIFIED Stage 2E.1)
 * Pagination: page-based (page/pageSize/hasMore) — totalCount unreliable/null
 * Lines: EMBEDDED in items[] array — NO separate line endpoint
 * Sort: NOT supported
 *
 * DEPENDENCIES: Vendor (required), WarehouseLocation (required), Material (per line).
 * PO Type: NOT a blocking dependency — resolved via bounded in-memory cache.
 *
 * IDENTITY: id → servicetitan_purchase_order_id (string, int64-safe).
 * Line identity: items[].id → servicetitan_po_line_id (string, int64-safe).
 * Records are matched ONLY by immutable IDs. Never by PO number or vendor name.
 *
 * Field Ownership (PurchaseOrder / PurchaseOrderLine):
 *   - ServiceTitan-owned: overwritten by sync.
 *   - LVC-owned: NEVER touched by sync (po_number, lvc_workflow_status, etc.).
 *   - Non-promoted ST fields (summary, technicianId, shipTo, etc.) remain in raw_data.
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
  DependencyResult,
  EligibilityResult,
  SyncRecordResult,
  SyncBatchResult,
} from "../stSyncAdapter.ts";
import { apiRequest, retryWithBackoff } from "../../stAuth.ts";
import { isPostActivation } from "../stSyncWatermark.ts";
import { normalizeString } from "../../stVendorSync.ts";
import {
  normalizePoId,
  normalizeNumber,
  normalizePoStatus,
  normalizePoLineStatus,
  buildPoRawData,
  buildPoLineRawData,
  buildPurchaseOrderCreateData,
  buildPurchaseOrderUpdateData,
  buildPoLineCreateData,
  buildPoLineUpdateData,
  assertNoLvcFieldWritten,
  resolveVendorByStId,
  resolveWarehouseDependency,
  resolveMaterialDependency,
  PURCHASE_ORDER_LVC_OWNED_FIELDS,
  PURCHASE_ORDER_LINE_LVC_OWNED_FIELDS,
  type MappedPurchaseOrder,
  type MappedPoLine,
  type LocalPurchaseOrder,
  type LocalPurchaseOrderLine,
} from "../../stPurchaseOrderSync.ts";
import {
  PURCHASE_ORDERS_API_PATH,
  PURCHASE_ORDER_TYPES_API_PATH,
  PURCHASE_ORDER_PAGE_SIZE,
} from "../stPurchaseOrderSyncConfig.ts";

// ─── Per-Run Line Summary ─────────────────────────────────────────────────────

/**
 * Typed summary of per-run PO-line outcomes produced by postBatchProcess.
 * The engine collects these into EngineResult.postBatchSummaries, and the
 * incremental orchestrator aggregates them to increment watermark counters
 * using ONLY current-run deltas — never historical queries.
 */
export interface PoLineBatchSummary {
  po_lines_created_this_run: number;
  po_lines_updated_this_run: number;
  po_lines_unchanged_this_run: number;
  po_lines_stale_this_run: number;
  po_lines_deferred_this_run: number;
  po_lines_failed_this_run: number;
  /**
   * Stable, machine-readable reason codes for lines deferred this run
   * (e.g. "MATERIAL_MISSING", "MATERIAL_AMBIGUOUS", "MATERIAL_INACTIVE",
   * "MATERIAL_MISSING_ID"). Optional — omitted by legacy callers. The
   * isPoLineBatchSummary guard does NOT require this field, so existing
   * summaries with only the six numeric counters remain valid.
   */
  line_deferral_reasons?: string[];
}

/**
 * Runtime type guard verifying a value satisfies the PoLineBatchSummary
 * contract. Used by deterministic verification tests to prove a malformed
 * summary cannot satisfy the Purchase Order adapter contract.
 */
export function isPoLineBatchSummary(s: unknown): s is PoLineBatchSummary {
  if (s == null || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return typeof obj.po_lines_created_this_run === "number" &&
    typeof obj.po_lines_updated_this_run === "number" &&
    typeof obj.po_lines_unchanged_this_run === "number" &&
    typeof obj.po_lines_stale_this_run === "number" &&
    typeof obj.po_lines_deferred_this_run === "number" &&
    typeof obj.po_lines_failed_this_run === "number";
}

// ─── Source Types ──────────────────────────────────────────────────────────────

export interface StPoSource {
  id?: number | string;
  number?: string;
  status?: string;
  vendorId?: number | string;
  inventoryLocationId?: number | string;
  projectId?: number | string;
  jobId?: number | string;
  typeId?: number | string;
  technicianId?: number | string;
  businessUnitId?: number | string;
  date?: string;
  requiredOn?: string;
  sentOn?: string;
  receivedOn?: string;
  total?: number;
  tax?: number;
  shipping?: number;
  createdOn?: string;
  modifiedOn?: string;
  createdById?: number | string;
  summary?: string;
  shipTo?: any;
  invoiceId?: number | string;
  vendorDocumentNumber?: string;
  batchId?: number | string;
  budgetCodeId?: number | string;
  customFields?: any;
  items?: StPoLineSource[];
  [key: string]: unknown;
}

export interface StPoLineSource {
  id?: number | string;
  skuId?: number | string;
  skuCode?: string;
  skuName?: string;
  skuType?: string;
  vendorPartNumber?: string;
  quantity?: number;
  quantityReceived?: number;
  cost?: number;
  total?: number;
  serialNumbers?: any;
  status?: string;
  chargeable?: boolean;
  budgetCodeId?: number | string;
  description?: string;
  createdOn?: string;
  modifiedOn?: string;
  [key: string]: unknown;
}

export interface StPoTypeSource {
  id: number | string;
  name: string;
  [key: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PO_DOMAIN = "purchase_order";
const PO_INTEGRATION_NAME = "servicetitan_purchase_order_sync";

// ─── PO Type Cache ─────────────────────────────────────────────────────────────

/**
 * Bounded in-memory cache for PO Type ID-to-name resolution.
 * Built once per sync run from the PO Types endpoint.
 * If the endpoint fails, the cache is empty and type names are left null
 * (non-blocking — POs are never deferred for unresolved type names).
 */
let poTypeCache: Map<string, string> | null = null;

async function buildPoTypeCache(context: SyncContext): Promise<Map<string, string>> {
  if (poTypeCache) return poTypeCache;
  const cache = new Map<string, string>();
  try {
    const typesPath = PURCHASE_ORDER_TYPES_API_PATH(context.tenantId);
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 50) {
      const result = await retryWithBackoff(async () => {
        return await apiRequest(typesPath, context.environment, {
          params: { page: String(page), pageSize: "50" },
        });
      });
      const records: StPoTypeSource[] = result.data || [];
      for (const t of records) {
        if (t.id != null) cache.set(String(t.id), t.name || "");
      }
      hasMore = result.hasMore ?? false;
      page++;
    }
  } catch (err) {
    console.warn("[PO ADAPTER] PO Type cache build failed — type names will be null:", String(err).substring(0, 150));
  }
  poTypeCache = cache;
  return cache;
}

export function resetPoTypeCache(): void {
  poTypeCache = null;
}

/**
 * Test hook: pre-populate the PO Type cache without hitting the live API.
 * Used by validation tests to avoid live API calls during mapRecord.
 */
export function setPoTypeCacheForTesting(cache: Map<string, string>): void {
  poTypeCache = cache;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const purchaseOrderAdapter: ServiceTitanSyncAdapter<
  StPoSource,
  MappedPurchaseOrder,
  LocalPurchaseOrder,
  PoLineBatchSummary
> = {
  domain: PO_DOMAIN,
  integrationName: PO_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    return PURCHASE_ORDERS_API_PATH(context.tenantId);
  },

  getInitialPaginationState(_context: SyncContext): SyncPaginationState {
    return { mode: "page", page: 1, pageSize: PURCHASE_ORDER_PAGE_SIZE };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StPoSource>> {
    const path = PURCHASE_ORDERS_API_PATH(context.tenantId);
    const pagination = request.pagination;

    if (pagination.mode !== "page") {
      throw new Error("Purchase Order sync uses page-based pagination only");
    }

    const params: Record<string, string> = {
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    };
    if (request.filterField && request.windowStart) {
      params[request.filterField === "createdOn" ? "createdOnOrAfter" : "modifiedOnOrAfter"] = request.windowStart;
    }

    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, context.environment, { params });
    });

    const records: StPoSource[] = result.data || result.items || [];
    const hasMore = result.hasMore ?? false;
    const totalCount = result.totalCount ?? null;

    return {
      records,
      hasMore,
      nextPage: hasMore ? pagination.page + 1 : null,
      totalCount,
      rawPagination: { page: result.page, pageSize: result.pageSize, hasMore, totalCount },
    };
  },

  getSourceId(record: StPoSource): string | null {
    return normalizePoId(record.id);
  },

  getSourceCreatedOn(record: StPoSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StPoSource): string | null {
    return record.modifiedOn || null;
  },

  /**
   * Stage 2E.6 eligibility gate.
   *
   * Business direction: import ONLY Pending and Sent purchase orders. Any
   * other status (Received, Partially Received, Cancelled, unknown, or
   * missing) is rejected BEFORE entering the active processing path.
   *
   * This hook ALSO preserves the prior activation guard (new-records-only
   * strategy): a record whose createdOn precedes the watermark activation
   * timestamp is rejected with a stable reason. Both gates must pass.
   *
   * The engine invokes checkEligibility BEFORE mapRecord (step 3), so
   * ineligible records never reach dependency resolution or persistence.
   * Reason codes are stable and machine-readable:
   *   - pre_activation / no_activation_ts / missing_created_on / invalid_timestamp
   *   - status_missing / status_unknown / status_not_pending_or_sent
   */
  async checkEligibility(
    _base44: any,
    record: StPoSource,
    _mapped: MappedPurchaseOrder | null,
    context: SyncContext
  ): Promise<EligibilityResult> {
    // ── 1. Activation guard (new-records-only) — preserve prior behavior ──
    if (context.watermark && context.watermark.activation_timestamp) {
      const createdOn = record.createdOn || null;
      const act = isPostActivation(createdOn, context.watermark.activation_timestamp);
      if (!act.allowed) {
        return { allowed: false, reason: act.reason || "pre_activation", message: "Record created before watermark activation" };
      }
    }

    // ── 2. Status eligibility — Stage 2E.6 import scope (Pending | Sent only) ──
    const statusNorm = normalizePoStatus(record.status);
    if (statusNorm.normalized === "draft" || statusNorm.normalized === "sent") {
      return { allowed: true };
    }
    const reason =
      statusNorm.raw === null ? "status_missing" :
      statusNorm.unknown ? "status_unknown" :
      "status_not_pending_or_sent";
    return {
      allowed: false,
      reason,
      message: `PO status '${record.status ?? null}' is not Pending or Sent — skipped per Stage 2E.6 import scope`,
    };
  },

  async mapRecord(
    record: StPoSource,
    context: SyncContext
  ): Promise<MappedPurchaseOrder> {
    const stPoId = normalizePoId(record.id) || "";
    const statusNorm = normalizePoStatus(record.status);

    // Resolve PO Type name from cache
    const typeIdRaw = record.typeId;
    const typeIdStr = typeIdRaw != null ? normalizePoId(typeIdRaw) : null;
    let typeName: string | null = null;
    if (typeIdStr) {
      const cache = await buildPoTypeCache(context);
      typeName = cache.get(typeIdStr) || null;
    }

    const items = Array.isArray(record.items) ? record.items : [];
    const linePromises: Promise<MappedPoLine>[] = items.map((item) => mapLine(item, stPoId, record.number || "", context));
    const lines: MappedPoLine[] = await Promise.all(linePromises);
    const total = normalizeNumber(record.total) ?? 0;
    const tax = normalizeNumber(record.tax) ?? 0;
    const shipping = normalizeNumber(record.shipping) ?? 0;
    const subtotal = total - tax - shipping;
    const totalQtyOrdered = lines.reduce((sum, l) => sum + l.quantity_ordered, 0);
    const totalQtyReceived = lines.reduce((sum, l) => sum + l.quantity_received, 0);
    const receivedPct = totalQtyOrdered > 0 ? (totalQtyReceived / totalQtyOrdered) * 100 : 0;

    return {
      servicetitan_purchase_order_id: stPoId,
      servicetitan_po_number: normalizeString(record.number),
      status: statusNorm.normalized,
      status_raw: statusNorm.raw,
      status_unknown: statusNorm.unknown,
      servicetitan_vendor_id: normalizePoId(record.vendorId) || "",
      vendor_id: null,
      vendor_name: "",
      servicetitan_warehouse_id: normalizePoId(record.inventoryLocationId) || "",
      warehouse_location_id: null,
      warehouse_name: "",
      servicetitan_project_id: record.projectId != null ? normalizePoId(record.projectId) : null,
      servicetitan_job_id: record.jobId != null ? normalizePoId(record.jobId) : null,
      servicetitan_sent_on: record.sentOn || null,
      servicetitan_purchase_order_type_id: typeIdStr,
      servicetitan_purchase_order_type_name: typeName,
      order_date: record.date || null,
      expected_delivery_date: record.requiredOn || null,
      actual_delivery_date: record.receivedOn || null,
      tax_amount: tax,
      shipping_amount: shipping,
      total: total,
      subtotal: subtotal,
      line_count: lines.length,
      total_quantity_ordered: totalQtyOrdered,
      total_quantity_received: totalQtyReceived,
      received_percentage: receivedPct,
      servicetitan_created_on: record.createdOn || null,
      servicetitan_modified_on: record.modifiedOn || null,
      servicetitan_last_event_at: record.modifiedOn || null,
      servicetitan_source: context.source === "webhook" ? "webhook" : "api",
      servicetitan_sync_status: "synced",
      servicetitan_sync_version: 0,
      servicetitan_raw_data: buildPoRawData(record),
      import_source: context.source === "api_recovery" ? "api_recovery" : context.source === "api_export" ? "api_export" : "manual",
      imported_at: null,
      lines,
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedPurchaseOrder,
    _context: SyncContext
  ): Promise<LocalPurchaseOrder | null> {
    if (!mapped.servicetitan_purchase_order_id) return null;
    try {
      const results = await base44.asServiceRole.entities.PurchaseOrder.filter(
        { servicetitan_purchase_order_id: mapped.servicetitan_purchase_order_id },
        "-servicetitan_last_sync",
        1
      );
      return results.length > 0 ? (results[0] as LocalPurchaseOrder) : null;
    } catch (err) {
      console.error("[PO ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalPurchaseOrder): string | null {
    return existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
  },

  recordsEqual(existing: LocalPurchaseOrder, mapped: MappedPurchaseOrder): boolean {
    const stringFields = [
      "servicetitan_po_number", "status", "servicetitan_vendor_id",
      "servicetitan_warehouse_id", "servicetitan_project_id", "servicetitan_job_id",
      "servicetitan_sent_on", "servicetitan_purchase_order_type_id",
      "servicetitan_purchase_order_type_name", "order_date",
      "expected_delivery_date", "actual_delivery_date",
    ];
    for (const field of stringFields) {
      if (String(existing[field] ?? "") !== String((mapped as any)[field] ?? "")) return false;
    }
    const numberFields = ["tax_amount", "shipping_amount", "total", "line_count", "total_quantity_ordered", "total_quantity_received"];
    for (const field of numberFields) {
      if (Number(existing[field] ?? 0) !== (mapped as any)[field]) return false;
    }
    if (Boolean(existing.servicetitan_active ?? true) !== true) return false;
    if ((existing.lines_expected_count ?? 0) !== mapped.lines.length) return false;
    return true;
  },

  async verifyDependencies(
    base44: any,
    mapped: MappedPurchaseOrder,
    _context: SyncContext
  ): Promise<DependencyResult> {
    const warnings: string[] = [];

    // Vendor (required)
    if (!mapped.servicetitan_vendor_id) {
      return {
        status: "deferred",
        warning: "PO deferred — missing vendorId in source record.",
      };
    }
    const vendor = await resolveVendorByStId(base44, mapped.servicetitan_vendor_id);
    if (!vendor) {
      return {
        status: "deferred",
        warning: `PO ${mapped.servicetitan_purchase_order_id} deferred — Vendor ${mapped.servicetitan_vendor_id} not found locally. Placed into retry.`,
      };
    }
    mapped.vendor_id = vendor.id;
    mapped.vendor_name = vendor.name;

    // WarehouseLocation (required) — discriminated resolution (Stage 2E.6)
    // Distinguishes missing-id, missing, ambiguous (multiple candidates), and
    // inactive. Never guesses between multiple candidates. Stable reason codes:
    //   WAREHOUSE_MISSING_ID | WAREHOUSE_MISSING | WAREHOUSE_AMBIGUOUS | WAREHOUSE_INACTIVE
    const warehouseRes = await resolveWarehouseDependency(base44, mapped.servicetitan_warehouse_id);
    if (warehouseRes.status !== "resolved") {
      return {
        status: "deferred",
        warning: `PO ${mapped.servicetitan_purchase_order_id} deferred — ${warehouseRes.reason}: ${mapped.servicetitan_warehouse_id || "(empty)"}. Placed into retry.`,
      };
    }
    mapped.warehouse_location_id = warehouseRes.id;
    mapped.warehouse_name = warehouseRes.name || "";

    // PO Type (non-blocking)
    if (mapped.servicetitan_purchase_order_type_id && !mapped.servicetitan_purchase_order_type_name) {
      warnings.push(`PO Type name unresolved for typeId=${mapped.servicetitan_purchase_order_type_id} — non-blocking, name left null.`);
    }

    // Line material dependencies are NOT verified here — lines are processed
    // independently in postBatchProcess. A missing material defers only the
    // line, not the header.
    return {
      status: "satisfied",
      warning: warnings.length > 0 ? warnings.join(" ") : undefined,
    };
  },

  async createRecord(
    base44: any,
    mapped: MappedPurchaseOrder,
    _context: SyncContext
  ): Promise<LocalPurchaseOrder> {
    const nowIso = new Date().toISOString();
    const data = buildPurchaseOrderCreateData(mapped, nowIso);

    // Ownership assertion — fail if LVC-owned fields in payload
    const violations = assertNoLvcFieldWritten(data, PURCHASE_ORDER_LVC_OWNED_FIELDS);
    if (violations.length > 0) {
      throw new Error(`Ownership violation: LVC-owned fields in create payload: ${violations.join(", ")}`);
    }

    const created = await base44.asServiceRole.entities.PurchaseOrder.create(data);
    return created as LocalPurchaseOrder;
  },

  async updateRecord(
    base44: any,
    existing: LocalPurchaseOrder,
    mapped: MappedPurchaseOrder,
    _context: SyncContext
  ): Promise<LocalPurchaseOrder> {
    const nowIso = new Date().toISOString();
    const update = buildPurchaseOrderUpdateData(existing as Record<string, any>, mapped, nowIso);
    if (update) {
      const violations = assertNoLvcFieldWritten(update, PURCHASE_ORDER_LVC_OWNED_FIELDS);
      if (violations.length > 0) {
        throw new Error(`Ownership violation: LVC-owned fields in update payload: ${violations.join(", ")}`);
      }
      await base44.asServiceRole.entities.PurchaseOrder.update(existing.id, update);
    }
    return existing;
  },

  // ── Post-batch: process embedded lines ──

  async postBatchProcess(
    base44: any,
    batch: SyncBatchResult<StPoSource>,
    context: SyncContext
  ): Promise<PoLineBatchSummary> {
    const nowIso = new Date().toISOString();
    const summary: PoLineBatchSummary = {
      po_lines_created_this_run: 0,
      po_lines_updated_this_run: 0,
      po_lines_unchanged_this_run: 0,
      po_lines_stale_this_run: 0,
      po_lines_deferred_this_run: 0,
      po_lines_failed_this_run: 0,
    };
    // Stage 2E.6: collect stable reason codes for every line deferred this run.
    const lineDeferralReasons: string[] = [];

    for (const result of batch.results) {
      if (result.action !== "created" && result.action !== "updated") continue;
      if (!result.local || !result.local.id) continue;

      const sourceId = result.sourceId;
      const sourceRecord = batch.sourceRecords.find(
        (r) => purchaseOrderAdapter.getSourceId(r) === sourceId
      );
      if (!sourceRecord) continue;

      const items = Array.isArray(sourceRecord.items) ? sourceRecord.items : [];
      const linesExpected = items.length;
      let linesSynced = 0;
      let linesDeferred = 0;
      let linesFailed = 0;

      for (const item of items) {
        try {
          const lineResult = await processLine(base44, item, result.local.id, sourceRecord, context, nowIso, lineDeferralReasons);
          switch (lineResult) {
            case "created": summary.po_lines_created_this_run++; linesSynced++; break;
            case "updated": summary.po_lines_updated_this_run++; linesSynced++; break;
            case "unchanged": summary.po_lines_unchanged_this_run++; linesSynced++; break;
            case "stale": summary.po_lines_stale_this_run++; linesSynced++; break;
            case "deferred": summary.po_lines_deferred_this_run++; linesDeferred++; break;
            case "failed": summary.po_lines_failed_this_run++; linesFailed++; break;
          }
        } catch (err) {
          linesFailed++;
          summary.po_lines_failed_this_run++;
          console.error(`[PO ADAPTER] Line processing failed for PO ${sourceId}:`, String(err).substring(0, 150));
        }
      }

      // Update header line-sync tracking
      const linesSyncStatus =
        linesFailed > 0 && linesSynced === 0 ? "failed" :
        linesDeferred > 0 || linesFailed > 0 ? "partial" :
        linesSynced === linesExpected ? "complete" :
        "pending";

      try {
        await base44.asServiceRole.entities.PurchaseOrder.update(result.local.id, {
          lines_sync_status: linesSyncStatus,
          lines_expected_count: linesExpected,
          lines_synced_count: linesSynced,
          lines_last_sync_at: nowIso,
        });
      } catch (err) {
        console.error(`[PO ADAPTER] Header line-sync update failed for PO ${sourceId}:`, String(err).substring(0, 150));
      }
    }

    summary.line_deferral_reasons = lineDeferralReasons;
    return summary;
  },

  async onSuccess(
    _base44: any,
    _result: SyncRecordResult<LocalPurchaseOrder>,
    _context: SyncContext
  ): Promise<void> {
    // No-op — no ledger posting, no notifications during sync
  },

  async onFailure(
    _base44: any,
    error: unknown,
    _mapped: MappedPurchaseOrder | null,
    _context: SyncContext
  ): Promise<void> {
    console.error("[PO ADAPTER] Record sync failed:", String(error).substring(0, 200));
  },
};

// ─── Line Processing ──────────────────────────────────────────────────────────

async function mapLine(
  item: StPoLineSource,
  poStId: string,
  poNumber: string,
  _context: SyncContext
): Promise<MappedPoLine> {
  const lineId = normalizePoId(item.id) || "";
  const materialId = normalizePoId(item.skuId) || "";
  const statusNorm = normalizePoLineStatus(item.status);
  const qtyOrdered = normalizeNumber(item.quantity) ?? 0;
  const qtyReceived = normalizeNumber(item.quantityReceived) ?? 0;
  return {
    servicetitan_po_line_id: lineId,
    servicetitan_purchase_order_id: poStId,
    purchase_order_id: null,
    po_number: poNumber,
    inventory_master_id: null,
    servicetitan_material_id: materialId,
    sku: normalizeString(item.skuCode),
    item_name: normalizeString(item.skuName),
    vendor_sku: normalizeString(item.vendorPartNumber),
    quantity_ordered: qtyOrdered,
    quantity_received: qtyReceived,
    quantity_outstanding: qtyOrdered - qtyReceived,
    unit_cost: normalizeNumber(item.cost) ?? 0,
    line_total: normalizeNumber(item.total) ?? 0,
    line_status: statusNorm.normalized,
    line_status_raw: statusNorm.raw,
    line_status_unknown: statusNorm.unknown,
    servicetitan_created_on: item.createdOn || null,
    servicetitan_modified_on: item.modifiedOn || null,
    servicetitan_raw_data: buildPoLineRawData(item),
    import_source: "api_recovery",
    imported_at: null,
  };
}

async function processLine(
  base44: any,
  item: StPoLineSource,
  purchaseOrderId: string,
  sourceRecord: StPoSource,
  context: SyncContext,
  nowIso: string,
  reasonsAccumulator?: string[]
): Promise<"created" | "updated" | "unchanged" | "stale" | "deferred" | "failed"> {
  const mapped = await mapLine(item, normalizePoId(sourceRecord.id) || "", sourceRecord.number || "", context);

  if (!mapped.servicetitan_po_line_id) {
    if (reasonsAccumulator) reasonsAccumulator.push("LINE_MISSING_ID");
    return "failed";
  }

  // Resolve material dependency — discriminated resolution (Stage 2E.6).
  // Distinguishes missing-id, missing, ambiguous (multiple candidates),
  // inactive. Never guesses; never creates materials automatically. Stable
  // reason codes:
  //   MATERIAL_MISSING_ID | MATERIAL_MISSING | MATERIAL_AMBIGUOUS | MATERIAL_INACTIVE
  const materialRes = await resolveMaterialDependency(base44, mapped.servicetitan_material_id);
  if (materialRes.status !== "resolved") {
    if (reasonsAccumulator) reasonsAccumulator.push(materialRes.reason);
    return "deferred";
  }
  mapped.inventory_master_id = materialRes.id;

  // Find existing line
  let existing: LocalPurchaseOrderLine | null = null;
  try {
    const results = await base44.asServiceRole.entities.PurchaseOrderLine.filter(
      { servicetitan_po_line_id: mapped.servicetitan_po_line_id },
      "-servicetitan_last_sync",
      1
    );
    if (results.length > 0) existing = results[0] as LocalPurchaseOrderLine;
  } catch {
    // fall through to create
  }

  if (existing) {
    // Stale-event protection on line modifiedOn
    const localModified = existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
    if (mapped.servicetitan_modified_on && localModified) {
      const incomingTime = new Date(mapped.servicetitan_modified_on).getTime();
      const localTime = new Date(localModified).getTime();
      if (!isNaN(incomingTime) && !isNaN(localTime) && incomingTime < localTime) {
        return "stale";
      }
    }

    const update = buildPoLineUpdateData(existing as Record<string, any>, mapped, purchaseOrderId, nowIso);
    if (update) {
      const violations = assertNoLvcFieldWritten(update, PURCHASE_ORDER_LINE_LVC_OWNED_FIELDS);
      if (violations.length > 0) {
        console.error(`[PO ADAPTER] Line ownership violation: ${violations.join(", ")}`);
        return "failed";
      }
      try {
        await base44.asServiceRole.entities.PurchaseOrderLine.update(existing.id, update);
      } catch (err) {
        console.error(`[PO ADAPTER] Line update failed: ${String(err).substring(0, 150)}`);
        return "failed";
      }
      return "updated";
    }
    return "unchanged";
  }

  // Create new line
  const data = buildPoLineCreateData(mapped, purchaseOrderId, nowIso);
  const violations = assertNoLvcFieldWritten(data, PURCHASE_ORDER_LINE_LVC_OWNED_FIELDS);
  if (violations.length > 0) {
    console.error(`[PO ADAPTER] Line ownership violation in create: ${violations.join(", ")}`);
    return "failed";
  }
  try {
    await base44.asServiceRole.entities.PurchaseOrderLine.create(data);
  } catch (err) {
    // Post-create recheck: the line may have partially committed
    try {
      const recheck = await base44.asServiceRole.entities.PurchaseOrderLine.filter(
        { servicetitan_po_line_id: mapped.servicetitan_po_line_id },
        "-servicetitan_last_sync",
        1
      );
      if (recheck.length > 0) return "updated";
    } catch { /* fall through */ }
    console.error(`[PO ADAPTER] Line create failed: ${String(err).substring(0, 150)}`);
    return "failed";
  }
  return "created";
}