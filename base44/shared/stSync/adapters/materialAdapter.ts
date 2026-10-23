/**
 * Material Sync Adapter
 *
 * Implements ServiceTitanSyncAdapter for the Material (InventoryMaster) domain
 * (Stage 2D).
 *
 * DIRECTION: ServiceTitan → LVC OS only. The adapter performs NO outbound
 * writes to ServiceTitan.
 *
 * Endpoint: /inventory/v2/tenant/{tenant}/items (page-based)
 * Pagination: page-based (page/pageSize) — same as Vendors / Jobs
 * Incremental filter: modifiedOnOrAfter
 *
 * DEPENDENCIES: Vendor. Each Material's vendor relationships must resolve
 * to an existing local Vendor by servicetitan_vendor_id. Materials with
 * unresolved vendor references are deferred (placed into retry).
 *
 * IDENTITY: Item.Id → servicetitan_material_id (string, int64-safe).
 *   - Records are matched ONLY by servicetitan_material_id.
 *   - Never matched by name, SKU, or vendor part number.
 *   - Missing/invalid IDs are rejected.
 *
 * VENDOR RELATIONSHIPS:
 *   - Each Item may have multiple vendor relationships.
 *   - Each relationship is resolved via servicetitan_vendor_id ONLY.
 *   - Never by vendor name, vendor code, or fuzzy matching.
 *   - If any referenced vendor ID has no local Vendor, the Material is
 *     deferred (verifyDependencies returns "deferred").
 *
 * Field Ownership (InventoryMaster):
 *   - ServiceTitan-owned: item_name, description, sku, manufacturer,
 *     standard_cost, selling_price, servicetitan_active, category, unit,
 *     serialized, lot_tracking, servicetitan_raw_data, sync metadata,
 *     import metadata
 *   - LVC OS-owned: inventory_id, barcode, qr_code, vendor_sku,
 *     inventory_type, all quantity fields, bin/warehouse assignments,
 *     vendor_id, manufacturer_id, unit_cost, purchase_cost, average_cost,
 *     msrp, reorder settings, status, notes, is_active — NEVER overwritten
 *
 * INVENTORY QUANTITIES: ServiceTitan quantity fields are NOT written to
 *   InventoryMaster. LVC OS Inventory Ledger remains authoritative.
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
  DependencyResult,
} from "../stSyncAdapter.ts";
import { apiRequest, retryWithBackoff } from "../../stAuth.ts";
import {
  normalizeString,
  normalizeBool,
  normalizeVendorId,
} from "../../stVendorSync.ts";
import {
  normalizeMaterialId,
  normalizeNumber,
  buildMaterialCreateData,
  buildMaterialUpdateData,
  syncMaterialCreated,
  syncMaterialUpdated,
  resolveAllVendorRelationships,
  upsertMaterialVendor,
  buildRawDataJson,
  type MappedMaterial,
  type MappedVendorRelationship,
  type LocalInventoryMaster,
  type ResolvedVendor,
  MATERIAL_ST_OWNED_FIELDS,
} from "../../stMaterialSync.ts";
import { ITEMS_API_PATH } from "../stMaterialSyncConfig.ts";

// ─── Source Types ──────────────────────────────────────────────────────────────

export interface StItemSource {
  // ── Live Pricebook v2 shape (verified HTTP 200) ──
  id?: number | string;
  code?: string;
  displayName?: string;
  description?: string;
  cost?: number | string | null;
  active?: boolean | number | string;
  price?: number | string | null;
  unitOfMeasure?: string;
  isInventory?: boolean | number | string;
  primaryVendor?: StItemVendorSource | null;
  otherVendors?: Array<StItemVendorSource> | null;
  categories?: Array<{ id?: string | number; name?: string } | string> | null;
  createdOn?: string;
  modifiedOn?: string;
  // ── Export/flat fallback (PascalCase) ──
  Id?: number | string;
  Name?: string;
  Code?: string;
  Description?: string;
  Cost?: number | string | null;
  Active?: boolean | number | string;
  Price?: number | string | null;
  Unit?: string;
  Category?: string | { Name?: string } | null;
  Manufacturer?: string | { Name?: string } | null;
  Serialized?: boolean | number | string;
  LotTracking?: boolean | number | string;
  Vendors?: Array<StItemVendorSource> | null;
  [key: string]: unknown;
}

export interface StItemVendorSource {
  vendorId?: number | string;
  vendorName?: string;
  vendorPartNumber?: string;
  cost?: number | string | null;
  isPrimary?: boolean | number | string;
  memo?: string;
  active?: boolean | number | string;
  // Export fallback
  VendorId?: number | string;
  VendorName?: string;
  VendorPartNumber?: string;
  Cost?: number | string | null;
  IsPrimary?: boolean | number | string;
  Memo?: string;
  Active?: boolean | number | string;
  [key: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_DOMAIN = "material";
const MATERIAL_INTEGRATION_NAME = "servicetitan_material_sync";
const MATERIAL_PAGE_SIZE = 50;

function itemsEndpoint(tenantId: string): string {
  return ITEMS_API_PATH(tenantId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCategory(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return normalizeString(value);
  if (typeof value === "object") return normalizeString(value.name ?? value.Name ?? value.id);
  return "";
}

function mapVendorRelationships(record: StItemSource): MappedVendorRelationship[] {
  const relationships: MappedVendorRelationship[] = [];

  // Live shape: primaryVendor (single) + otherVendors (array)
  const primary = record.primaryVendor;
  if (primary && typeof primary === "object") {
    const stVendorId = normalizeVendorId(primary.vendorId ?? primary.VendorId);
    if (stVendorId) {
      relationships.push({
        servicetitan_vendor_id: stVendorId,
        vendor_name_snapshot: normalizeString(primary.vendorName ?? primary.VendorName),
        vendor_part_number: normalizeString(primary.vendorPartNumber ?? primary.VendorPartNumber),
        vendor_cost: normalizeNumber(primary.cost ?? primary.Cost) ?? 0,
        is_preferred_vendor: normalizeBool(primary.isPrimary ?? primary.IsPrimary ?? true),
        vendor_memo: normalizeString(primary.memo ?? primary.Memo),
        is_active: normalizeBool(primary.active ?? primary.Active ?? true),
      });
    }
  }

  const others = record.otherVendors || [];
  if (Array.isArray(others)) {
    for (const v of others) {
      const stVendorId = normalizeVendorId(v.vendorId ?? v.VendorId);
      if (!stVendorId) continue;
      relationships.push({
        servicetitan_vendor_id: stVendorId,
        vendor_name_snapshot: normalizeString(v.vendorName ?? v.VendorName),
        vendor_part_number: normalizeString(v.vendorPartNumber ?? v.VendorPartNumber),
        vendor_cost: normalizeNumber(v.cost ?? v.Cost) ?? 0,
        is_preferred_vendor: normalizeBool(v.isPrimary ?? v.IsPrimary ?? false),
        vendor_memo: normalizeString(v.memo ?? v.Memo),
        is_active: normalizeBool(v.active ?? v.Active ?? true),
      });
    }
  }

  // Export/flat fallback: Vendors array
  const rawVendors = record.vendors || record.Vendors || [];
  if (Array.isArray(rawVendors)) {
    for (const v of rawVendors) {
      const stVendorId = normalizeVendorId(v.vendorId ?? v.VendorId);
      if (!stVendorId) continue;
      relationships.push({
        servicetitan_vendor_id: stVendorId,
        vendor_name_snapshot: normalizeString(v.vendorName ?? v.VendorName),
        vendor_part_number: normalizeString(v.vendorPartNumber ?? v.VendorPartNumber),
        vendor_cost: normalizeNumber(v.cost ?? v.Cost) ?? 0,
        is_preferred_vendor: normalizeBool(v.isPrimary ?? v.IsPrimary),
        vendor_memo: normalizeString(v.memo ?? v.Memo),
        is_active: normalizeBool(v.active ?? v.Active ?? true),
      });
    }
  }

  // Deduplicate by servicetitan_vendor_id. If the same vendor appears in
  // both primaryVendor and otherVendors (or the export Vendors array),
  // keep the entry with is_preferred_vendor=true; otherwise keep the first.
  const seen = new Map<string, MappedVendorRelationship>();
  for (const rel of relationships) {
    const existing = seen.get(rel.servicetitan_vendor_id);
    if (!existing) {
      seen.set(rel.servicetitan_vendor_id, rel);
    } else if (rel.is_preferred_vendor && !existing.is_preferred_vendor) {
      seen.set(rel.servicetitan_vendor_id, rel);
    }
  }
  return Array.from(seen.values());
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const materialAdapter: ServiceTitanSyncAdapter<
  StItemSource,
  MappedMaterial,
  LocalInventoryMaster
> = {
  domain: MATERIAL_DOMAIN,
  integrationName: MATERIAL_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    return itemsEndpoint(context.tenantId);
  },

  getInitialPaginationState(_context: SyncContext): SyncPaginationState {
    return { mode: "page", page: 1, pageSize: MATERIAL_PAGE_SIZE };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StItemSource>> {
    const path = itemsEndpoint(context.tenantId);
    const pagination = request.pagination;

    if (pagination.mode !== "page") {
      throw new Error("Material sync uses page-based pagination only");
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

    const records: StItemSource[] = result.data || result.items || result.results || [];
    const hasMore = result.hasMore ?? result.has_more ?? false;
    const totalCount = result.totalCount ?? result.total_count ?? null;

    return {
      records,
      hasMore,
      nextPage: hasMore ? pagination.page + 1 : null,
      totalCount,
      rawPagination: { page: result.page, pageSize: result.pageSize, hasMore },
    };
  },

  getSourceId(record: StItemSource): string | null {
    return normalizeMaterialId(record.id ?? record.Id);
  },

  getSourceCreatedOn(record: StItemSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StItemSource): string | null {
    return record.modifiedOn || null;
  },

  async mapRecord(
    record: StItemSource,
    context: SyncContext
  ): Promise<MappedMaterial> {
    const stMaterialId = normalizeMaterialId(record.id ?? record.Id) || "";
    const knownFields = [
      "id", "code", "displayName", "description", "cost", "active", "price",
      "unitOfMeasure",       "isInventory", "IsInventory", "primaryVendor", "otherVendors",
      "categories", "createdOn", "modifiedOn",
      "Id", "Name", "Code", "Description", "Cost", "Active", "Price",
      "Unit", "Category", "Manufacturer", "Serialized", "LotTracking", "Vendors",
    ];
    const rawData = buildRawDataJson(record, knownFields);

    // Category: live API returns categories as an array of objects; extract
    // the first category name. Fallback to flat Category string.
    let category = "";
    if (Array.isArray(record.categories) && record.categories.length > 0) {
      const first = record.categories[0];
      category = extractCategory(first);
    } else {
      category = extractCategory(record.category ?? record.Category);
    }

    return {
      servicetitan_material_id: stMaterialId,
      item_name: normalizeString(record.displayName ?? record.name ?? record.Name),
      description: normalizeString(record.description ?? record.Description),
      sku: normalizeString(record.code ?? record.Code),
      manufacturer: extractCategory(record.manufacturer ?? record.Manufacturer),
      standard_cost: normalizeNumber(record.cost ?? record.Cost),
      selling_price: normalizeNumber(record.price ?? record.Price),
      servicetitan_active: normalizeBool(record.active ?? record.Active),
      servicetitan_is_inventory: normalizeBool(record.isInventory ?? record.IsInventory),
      category,
      unit: normalizeString(record.unitOfMeasure ?? record.unit ?? record.Unit) || "ea",
      serialized: normalizeBool(record.serialized ?? record.Serialized),
      lot_tracking: normalizeBool(record.lotTracking ?? record.LotTracking),
      servicetitan_created_on: record.createdOn || null,
      servicetitan_modified_on: record.modifiedOn || null,
      servicetitan_last_event_at: record.modifiedOn || null,
      servicetitan_tenant_id: context.tenantId,
      servicetitan_source: context.source === "webhook" ? "webhook" : "api",
      servicetitan_sync_status: "synced",
      servicetitan_sync_version: 0,
      servicetitan_raw_data: rawData,
      import_source: context.source === "api_recovery" ? "api_recovery" : context.source === "api_export" ? "api_export" : "manual",
      imported_at: null,
      vendor_relationships: mapVendorRelationships(record),
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedMaterial,
    _context: SyncContext
  ): Promise<LocalInventoryMaster | null> {
    if (!mapped.servicetitan_material_id) return null;
    try {
      const results = await base44.asServiceRole.entities.InventoryMaster.filter(
        { servicetitan_material_id: mapped.servicetitan_material_id },
        "-servicetitan_last_sync",
        1
      );
      return results.length > 0 ? (results[0] as LocalInventoryMaster) : null;
    } catch (err) {
      console.error("[MATERIAL ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalInventoryMaster): string | null {
    return existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
  },

  recordsEqual(existing: LocalInventoryMaster, mapped: MappedMaterial): boolean {
    const stringFields = ["item_name", "description", "sku", "manufacturer", "category", "unit"];
    for (const field of stringFields) {
      if (String(existing[field] ?? "").trim() !== String((mapped as any)[field] ?? "").trim()) return false;
    }
    if (Boolean(existing.servicetitan_active) !== mapped.servicetitan_active) return false;
    if (Boolean(existing.serialized) !== mapped.serialized) return false;
    if (Boolean(existing.lot_tracking) !== mapped.lot_tracking) return false;
    if (Boolean(existing.servicetitan_is_inventory) !== mapped.servicetitan_is_inventory) return false;
    if (mapped.standard_cost !== null && Number(existing.standard_cost) !== mapped.standard_cost) return false;
    if (mapped.selling_price !== null && Number(existing.selling_price) !== mapped.selling_price) return false;
    return true;
  },

  // ── Dependency: vendor resolution ──
  async verifyDependencies(
    base44: any,
    mapped: MappedMaterial,
    _context: SyncContext
  ): Promise<DependencyResult> {
    const sourceVendorIds = mapped.vendor_relationships.map((r) => r.servicetitan_vendor_id);

    if (mapped.vendor_relationships.length === 0) {
      return {
        status: "satisfied",
        verifyDependenciesDiagnostic: {
          material_st_id: mapped.servicetitan_material_id,
          material_name: mapped.item_name,
          existing_local_material_id: null,
          number_of_source_vendor_relationships: 0,
          source_vendor_ids: [],
          resolved_vendor_ids: [],
          unresolved_vendor_ids: [],
          vendor_lookup_exceptions: [],
          dependency_status_returned: "satisfied",
          dependency_warning_returned: null,
          decision_path: "source vendor count: 0 → no vendor lookups needed → verifyDependencies result: satisfied",
        },
      } as DependencyResult;
    }

    // Find existing local material (for diagnostic reporting)
    let existingLocalMaterialId: string | null = null;
    try {
      const existing = await base44.asServiceRole.entities.InventoryMaster.filter(
        { servicetitan_material_id: mapped.servicetitan_material_id },
        "-servicetitan_last_sync",
        1
      );
      if (existing.length > 0) existingLocalMaterialId = existing[0].id;
    } catch { /* non-critical for diagnostic */ }

    const lookupContext = {
      material_st_id: mapped.servicetitan_material_id,
      material_name: mapped.item_name,
      tenant_id: _context.tenantId,
      environment: _context.environment,
    };

    const vendorDiagnostics: any[] = [];
    const { allResolved, orphan, resolved } = await resolveAllVendorRelationships(
      base44, mapped.vendor_relationships, vendorDiagnostics, lookupContext
    );

    const resolvedVendorIds = resolved.map((r) => r.vendor.servicetitan_vendor_id);
    const unresolvedVendorIds = orphan.map((o) => o.mapped.servicetitan_vendor_id);

    // Classify each unresolved vendor lookup
    const vendorLookupExceptions: any[] = [];
    const failureClassifications: Array<{ vendor_st_id: string; classification: string }> = [];

    for (const diag of vendorDiagnostics) {
      if (diag.outcome === "record_found") continue; // only classify failures

      let classification: string;
      if (diag.outcome === "exception") {
        if (diag.is_rate_limit_error === true) {
          classification = "RATE_LIMITED_LOOKUP";
        } else if (diag.is_retriable_error === true) {
          classification = "TRANSIENT_LOOKUP_FAILURE";
        } else {
          // Check for deterministic failure indicators
          const msg = String(diag.exception_message || "").toLowerCase();
          if (msg.includes("schema") || msg.includes("field") || msg.includes("syntax") || msg.includes("unsupported")) {
            classification = "DETERMINISTIC_LOOKUP_FAILURE";
          } else {
            classification = "OTHER_EXCEPTION";
          }
        }
        vendorLookupExceptions.push({
          vendor_st_id: diag.vendor_st_id,
          exception_name: diag.exception_name,
          exception_message: diag.exception_message,
          http_status: diag.http_status,
          base44_error_code: diag.base44_error_code,
          retry_after_ms: diag.retry_after_ms,
          is_rate_limit_error: diag.is_rate_limit_error,
          is_retriable_error: diag.is_retriable_error,
        });
      } else if (diag.outcome === "no_record_found") {
        // Distinguish MISSING_VENDOR from NORMALIZATION_MISMATCH / TENANT_OR_ENVIRONMENT_MISMATCH
        // by checking if the raw and normalized values differ (normalization mismatch indicator)
        if (String(diag.vendor_st_id_raw_value) !== String(diag.vendor_st_id_normalized_value)) {
          classification = "NORMALIZATION_MISMATCH";
        } else {
          classification = "MISSING_VENDOR";
        }
      } else {
        classification = "OTHER_EXCEPTION";
      }

      failureClassifications.push({
        vendor_st_id: diag.vendor_st_id || diag.vendor_st_id_raw_value || "",
        classification,
      });
    }

    // Check for MULTIPLE_VENDOR_MATCHES (secondary query with limit=2)
    let multipleMatchesDetected = false;
    const multipleMatchDetails: any[] = [];
    for (const diag of vendorDiagnostics) {
      if (diag.outcome === "record_found" && diag.record_count_returned >= 1) {
        try {
          const countCheck = await base44.asServiceRole.entities.Vendor.filter(
            { servicetitan_vendor_id: diag.vendor_st_id },
            "-servicetitan_last_sync",
            2
          );
          if (countCheck.length > 1) {
            multipleMatchesDetected = true;
            multipleMatchDetails.push({
              vendor_st_id: diag.vendor_st_id,
              match_count: countCheck.length,
              vendor_ids: countCheck.map((v: any) => v.id),
            });
          }
        } catch { /* non-critical for diagnostic */ }
      }
    }

    if (!allResolved) {
      const orphanIds = unresolvedVendorIds.join(", ");
      const classifications = failureClassifications.map((f) => `${f.vendor_st_id}:${f.classification}`).join(", ");

      return {
        status: "deferred",
        warning: `Material ${mapped.servicetitan_material_id} deferred — unresolved vendor IDs: ${orphanIds}. Placed into retry. Classifications: ${classifications}.`,
        diagnostics: vendorDiagnostics,
        verifyDependenciesDiagnostic: {
          material_st_id: mapped.servicetitan_material_id,
          material_name: mapped.item_name,
          existing_local_material_id: existingLocalMaterialId,
          number_of_source_vendor_relationships: mapped.vendor_relationships.length,
          source_vendor_ids: sourceVendorIds,
          resolved_vendor_ids: resolvedVendorIds,
          unresolved_vendor_ids: unresolvedVendorIds,
          vendor_lookup_exceptions: vendorLookupExceptions,
          dependency_status_returned: "deferred",
          dependency_warning_returned: `Material ${mapped.servicetitan_material_id} deferred — unresolved vendor IDs: ${orphanIds}. Placed into retry.`,
          failure_classifications: failureClassifications,
          multiple_vendor_matches: multipleMatchesDetected,
          multiple_match_details: multipleMatchDetails,
          decision_path: `source vendor count: ${mapped.vendor_relationships.length} → vendor lookups executed → resolved: ${resolvedVendorIds.length}, unresolved: ${unresolvedVendorIds.length} → classifications: ${classifications} → verifyDependencies result: deferred`,
          per_vendor_lookup_diagnostics: vendorDiagnostics,
        },
      } as DependencyResult;
    }

    return {
      status: "satisfied",
      verifyDependenciesDiagnostic: {
        material_st_id: mapped.servicetitan_material_id,
        material_name: mapped.item_name,
        existing_local_material_id: existingLocalMaterialId,
        number_of_source_vendor_relationships: mapped.vendor_relationships.length,
        source_vendor_ids: sourceVendorIds,
        resolved_vendor_ids: resolvedVendorIds,
        unresolved_vendor_ids: [],
        vendor_lookup_exceptions: [],
        dependency_status_returned: "satisfied",
        dependency_warning_returned: null,
        decision_path: `source vendor count: ${mapped.vendor_relationships.length} → vendor lookups executed → resolved: ${resolvedVendorIds.length}, unresolved: 0 → verifyDependencies result: satisfied`,
      },
    } as DependencyResult;
  },

  // ── Create/update — wired to the domain service ──
  // NOT invoked during dry_run.

  async createRecord(
    base44: any,
    mapped: MappedMaterial,
    context: SyncContext
  ): Promise<LocalInventoryMaster> {
    const result = await syncMaterialCreated(base44, mapped, context);
    if (!result.success) {
      throw new Error(result.error || "syncMaterialCreated failed");
    }
    const existing = await this.findExisting(base44, mapped, context);
    if (!existing) {
      throw new Error("Material record not found after create");
    }

    // Upsert vendor relationships
    const nowIso = new Date().toISOString();
    const { resolved, orphan } = await resolveAllVendorRelationships(base44, mapped.vendor_relationships);
    for (const { mapped: rel, vendor } of resolved) {
      await upsertMaterialVendor(base44, existing.id, mapped.servicetitan_material_id, rel, vendor, nowIso, mapped.import_source);
    }
    for (const { mapped: rel } of orphan) {
      await upsertMaterialVendor(base44, existing.id, mapped.servicetitan_material_id, rel, null, nowIso, mapped.import_source);
    }

    return existing;
  },

  async updateRecord(
    base44: any,
    existing: LocalInventoryMaster,
    mapped: MappedMaterial,
    context: SyncContext
  ): Promise<LocalInventoryMaster> {
    const result = await syncMaterialUpdated(base44, existing as Record<string, any>, mapped, context);
    if (!result.success) {
      throw new Error(result.error || "syncMaterialUpdated failed");
    }

    // Upsert vendor relationships
    const nowIso = new Date().toISOString();
    const { resolved, orphan } = await resolveAllVendorRelationships(base44, mapped.vendor_relationships);
    for (const { mapped: rel, vendor } of resolved) {
      await upsertMaterialVendor(base44, existing.id, mapped.servicetitan_material_id, rel, vendor, nowIso, mapped.import_source);
    }
    for (const { mapped: rel } of orphan) {
      await upsertMaterialVendor(base44, existing.id, mapped.servicetitan_material_id, rel, null, nowIso, mapped.import_source);
    }

    const updated = await this.findExisting(base44, mapped, context);
    if (!updated) {
      throw new Error("Material record not found after update");
    }
    return updated;
  },
};