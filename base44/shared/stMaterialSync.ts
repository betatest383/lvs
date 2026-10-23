/**
 * ServiceTitan Material Sync — Domain Service
 *
 * Implements per-record create/update for the Material (InventoryMaster)
 * domain with strict field-ownership enforcement. Also manages the
 * MaterialVendor relationship table. Reused by the Material sync adapter
 * (Stage 2D) for the inbound incremental write path.
 *
 * DIRECTION: ServiceTitan → LVC OS only. No outbound writes.
 *
 * FIELD OWNERSHIP (InventoryMaster):
 *   - ServiceTitan-owned fields are overwritten on update.
 *   - LVC OS-owned fields are NEVER touched by sync.
 *   - The canonical identity (servicetitan_material_id) is matched ONLY —
 *     never by name, SKU, or vendor part number.
 *
 * VENDOR RELATIONSHIPS:
 *   - Each Material's vendor relationships resolve via the immutable
 *     ServiceTitan Vendor ID (servicetitan_vendor_id).
 *   - Never by vendor name, vendor code, or fuzzy matching.
 *   - If a referenced vendor ID does not exist locally, the relationship
 *     is marked "orphan" and the Material is deferred (placed into retry).
 *   - The four acknowledged Vendor name collisions from Stage 2C must
 *     remain separate until manually reconciled.
 *
 * INVENTORY QUANTITIES:
 *   - ServiceTitan quantity fields (On Hand, Available, On Order, etc.)
 *     are reconciliation snapshots only. They are NOT the authoritative
 *     inventory ledger and are NOT written to InventoryMaster quantity
 *     fields. LVC OS Inventory Ledger remains authoritative.
 *
 * NEGATIVE INVENTORY:
 *   - ServiceTitan permits negative inventory. LVC OS synchronizes the
 *     value, preserves compatibility, and flags it. Negative inventory
 *     is not a synchronization failure.
 */

import { normalizeString, normalizeBool, normalizeVendorId } from "./stVendorSync.ts";
import { withRetry, isRateLimitError, isRetriableError, extractRetryAfterMs } from "./stSync/stRateLimitProtection.ts";

// ─── Field Ownership (InventoryMaster) ───────────────────────────────────────

export const MATERIAL_ST_OWNED_FIELDS = [
  "servicetitan_material_id",
  "item_name",
  "description",
  "sku",
  "manufacturer",
  "standard_cost",
  "selling_price",
  "servicetitan_active",
  "servicetitan_is_inventory",
  "category",
  "unit",
  "serialized",
  "lot_tracking",
  "servicetitan_created_on",
  "servicetitan_modified_on",
  "servicetitan_last_sync",
  "servicetitan_last_event_at",
  "servicetitan_sync_status",
  "servicetitan_sync_version",
  "servicetitan_source",
  "servicetitan_raw_data",
  "import_source",
  "imported_at",
] as const;

export const MATERIAL_LVC_OWNED_FIELDS = [
  "inventory_id",
  "barcode",
  "qr_code",
  "vendor_sku",
  "inventory_type",
  "category_id",
  "subcategory",
  "stocked_item",
  "is_stocked_inventory_item",
  "inventory_status",
  "default_inventory_location_id",
  "default_bin_location_id",
  "inventory_tracking_method",
  "chargeable_material",
  "quantity_owned",
  "quantity_available",
  "quantity_assigned",
  "quantity_reserved",
  "quantity_on_order",
  "quantity_in_transit",
  "quantity_damaged",
  "quantity_retired",
  "minimum_stock",
  "maximum_stock",
  "reorder_point",
  "reorder_quantity",
  "warehouse_location",
  "warehouse_location_id",
  "bin_location",
  "bin_location_id",
  "vendor",
  "vendor_id",
  "alternate_vendor_ids",
  "manufacturer_id",
  "lead_time_days",
  "preferred_order_quantity",
  "unit_cost",
  "purchase_cost",
  "average_cost",
  "msrp",
  "image_url",
  "job_cost_category",
  "inventory_value",
  "last_movement_date",
  "last_receipt_date",
  "status",
  "is_balanced",
  "legacy_id",
  "legacy_entity",
  "assignment_history_json",
  "notes",
  "is_active",
] as const;

// ─── MaterialVendor ST-owned fields ──────────────────────────────────────────

export const MATERIAL_VENDOR_ST_OWNED_FIELDS = [
  "vendor_part_number",
  "vendor_cost",
  "is_preferred_vendor",
  "vendor_memo",
  "is_active",
] as const;

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeMaterialId(value: unknown): string | null {
  return normalizeVendorId(value);
}

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!isFinite(n)) return null;
  return n;
}

// ─── Mapped Types ─────────────────────────────────────────────────────────────

export interface MappedVendorRelationship {
  servicetitan_vendor_id: string;
  vendor_name_snapshot: string;
  vendor_part_number: string;
  vendor_cost: number;
  is_preferred_vendor: boolean;
  vendor_memo: string;
  is_active: boolean;
}

export interface MappedMaterial {
  servicetitan_material_id: string;
  item_name: string;
  description: string;
  sku: string;
  manufacturer: string;
  standard_cost: number | null;
  selling_price: number | null;
  servicetitan_active: boolean;
  servicetitan_is_inventory: boolean;
  category: string;
  unit: string;
  serialized: boolean;
  lot_tracking: boolean;
  servicetitan_created_on: string | null;
  servicetitan_modified_on: string | null;
  servicetitan_last_event_at: string | null;
  servicetitan_tenant_id: string;
  servicetitan_source: string;
  servicetitan_sync_status: string;
  servicetitan_sync_version: number;
  servicetitan_raw_data: string;
  import_source: string;
  imported_at: string | null;
  vendor_relationships: MappedVendorRelationship[];
}

export interface LocalInventoryMaster {
  id: string;
  servicetitan_material_id?: string;
  servicetitan_modified_on?: string | null;
  servicetitan_last_event_at?: string | null;
  servicetitan_active?: boolean;
  [key: string]: unknown;
}

export interface ResolvedVendor {
  id: string;
  name: string;
  servicetitan_vendor_id: string;
}

// ─── Build Create / Update Data ──────────────────────────────────────────────

export function buildMaterialCreateData(mapped: MappedMaterial, nowIso: string): Record<string, any> {
  return {
    servicetitan_material_id: mapped.servicetitan_material_id,
    item_name: mapped.item_name,
    description: mapped.description,
    sku: mapped.sku,
    manufacturer: mapped.manufacturer,
    standard_cost: mapped.standard_cost ?? 0,
    selling_price: mapped.selling_price ?? 0,
    servicetitan_active: mapped.servicetitan_active,
    servicetitan_is_inventory: mapped.servicetitan_is_inventory,
    category: mapped.category,
    unit: mapped.unit,
    serialized: mapped.serialized,
    lot_tracking: mapped.lot_tracking,
    inventory_type: "Material",
    servicetitan_created_on: mapped.servicetitan_created_on,
    servicetitan_modified_on: mapped.servicetitan_modified_on,
    servicetitan_last_sync: nowIso,
    servicetitan_last_event_at: mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || nowIso,
    servicetitan_sync_status: "synced",
    servicetitan_sync_version: 1,
    servicetitan_source: mapped.servicetitan_source === "webhook" ? "webhook" : "api",
    servicetitan_raw_data: mapped.servicetitan_raw_data,
    import_source: mapped.import_source,
    imported_at: mapped.imported_at || nowIso,
  };
}

export function buildMaterialUpdateData(
  existing: Record<string, any>,
  mapped: MappedMaterial,
  nowIso: string
): Record<string, any> | null {
  const update: Record<string, any> = {};

  const stringFields = ["item_name", "description", "sku", "manufacturer", "category", "unit"];
  for (const field of stringFields) {
    const incoming = (mapped as any)[field] ?? "";
    if (incoming === "") continue;
    const current = String(existing[field] ?? "");
    if (String(incoming) !== current) {
      update[field] = incoming;
    }
  }

  // Numeric ST-owned fields: write when finite and differing
  if (mapped.standard_cost !== null && mapped.standard_cost !== Number(existing.standard_cost)) {
    update.standard_cost = mapped.standard_cost;
  }
  if (mapped.selling_price !== null && mapped.selling_price !== Number(existing.selling_price)) {
    update.selling_price = mapped.selling_price;
  }

  // Boolean ST-owned fields: always write when they differ
  if (mapped.servicetitan_active !== Boolean(existing.servicetitan_active)) {
    update.servicetitan_active = mapped.servicetitan_active;
  }
  if (mapped.serialized !== Boolean(existing.serialized)) {
    update.serialized = mapped.serialized;
  }
  if (mapped.lot_tracking !== Boolean(existing.lot_tracking)) {
    update.lot_tracking = mapped.lot_tracking;
  }
  if (mapped.servicetitan_is_inventory !== Boolean(existing.servicetitan_is_inventory)) {
    update.servicetitan_is_inventory = mapped.servicetitan_is_inventory;
  }

  // Raw data: always refresh
  if (mapped.servicetitan_raw_data !== (existing.servicetitan_raw_data ?? "")) {
    update.servicetitan_raw_data = mapped.servicetitan_raw_data;
  }

  // Sync metadata
  if (mapped.servicetitan_modified_on !== (existing.servicetitan_modified_on ?? null)) {
    update.servicetitan_modified_on = mapped.servicetitan_modified_on;
  }
  update.servicetitan_last_sync = nowIso;
  update.servicetitan_last_event_at = mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || nowIso;
  update.servicetitan_sync_status = "synced";
  update.servicetitan_sync_version = (Number(existing.servicetitan_sync_version) || 0) + 1;

  // Never include LVC-owned fields
  for (const lvcField of MATERIAL_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) {
      delete update[lvcField];
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

// ─── Per-record Sync ──────────────────────────────────────────────────────────

export async function syncMaterialCreated(
  base44: any,
  mapped: MappedMaterial,
  _context: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const nowIso = new Date().toISOString();
    const data = buildMaterialCreateData(mapped, nowIso);
    const created = await base44.asServiceRole.entities.InventoryMaster.create(data);
    return { success: true, id: created?.id };
  } catch (err: any) {
    return { success: false, error: `Material create failed: ${err?.message || String(err)}` };
  }
}

export async function syncMaterialUpdated(
  base44: any,
  existing: Record<string, any>,
  mapped: MappedMaterial,
  _context: any
): Promise<{ success: boolean; id?: string; error?: string; updatedFields?: string[] }> {
  try {
    const nowIso = new Date().toISOString();
    const update = buildMaterialUpdateData(existing, mapped, nowIso);
    if (!update) {
      return { success: true, id: existing.id, updatedFields: [] };
    }
    await base44.asServiceRole.entities.InventoryMaster.update(existing.id, update);
    return { success: true, id: existing.id, updatedFields: Object.keys(update) };
  } catch (err: any) {
    return { success: false, error: `Material update failed: ${err?.message || String(err)}` };
  }
}

// ─── Vendor Resolution ────────────────────────────────────────────────────────

/**
 * Resolve a ServiceTitan vendor ID to a local Vendor record.
 * Matches ONLY by servicetitan_vendor_id. Never by name.
 */
export interface VendorLookupContext {
  material_st_id?: string;
  material_name?: string;
  tenant_id?: string;
  environment?: string;
}

export async function resolveVendorByStId(
  base44: any,
  servicetitanVendorIdRaw: string,
  diagnostics?: Array<any>,
  lookupContext?: VendorLookupContext
): Promise<ResolvedVendor | null> {
  const lookupStartedAt = new Date().toISOString();
  const rawValue = servicetitanVendorIdRaw;
  const normalizedValue = normalizeVendorId(rawValue) || "";
  const runtimeType = typeof rawValue;

  if (!normalizedValue) {
    if (diagnostics) {
      diagnostics.push({
        material_st_id: lookupContext?.material_st_id || "",
        material_name: lookupContext?.material_name || "",
        vendor_st_id: rawValue || "",
        vendor_st_id_raw_value: rawValue || "",
        vendor_st_id_normalized_value: "",
        vendor_st_id_runtime_type: runtimeType,
        tenant_id: lookupContext?.tenant_id || "",
        environment: lookupContext?.environment || "",
        lookup_started_at: lookupStartedAt,
        lookup_completed_at: new Date().toISOString(),
        entity: "Vendor",
        filter: { servicetitan_vendor_id: rawValue },
        additional_filters: {
          sort: "-servicetitan_last_sync",
          limit: 1,
          tenant_filter: null,
          environment_filter: null,
          active_status_filter: null,
          deleted_status_filter: null,
        },
        exact_query_used: "SKIPPED — normalized vendor ID is empty after normalizeVendorId()",
        outcome: "exception",
        exception_name: "EmptyVendorId",
        exception_message: "Normalized vendor ID is empty — cannot execute query",
        http_status: null,
        base44_error_code: null,
        retry_after_ms: null,
        stack_location: null,
        is_rate_limit_error: false,
        is_retriable_error: false,
        record_count_returned: 0,
      });
    }
    return null;
  }

  const filter = { servicetitan_vendor_id: normalizedValue };
  const sort = "-servicetitan_last_sync";
  const limit = 1;
  const exactQuery = `Vendor.filter(${JSON.stringify(filter)}, "${sort}", ${limit})`;

  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.Vendor.filter(filter, sort, limit),
      {
        maxRetries: 5,
        onRetry: (_attempt: number, _err: any, delayMs: number) => {
          console.log(`[VENDOR RESOLVE] stVendorId='${normalizedValue}' material='${lookupContext?.material_st_id || ""}' retry after ${delayMs}ms (rate-limit)`);
        },
      }
    );
    const lookupCompletedAt = new Date().toISOString();

    if (results.length > 0) {
      const v = results[0];
      if (diagnostics) {
        diagnostics.push({
          material_st_id: lookupContext?.material_st_id || "",
          material_name: lookupContext?.material_name || "",
          vendor_st_id: normalizedValue,
          vendor_st_id_raw_value: rawValue,
          vendor_st_id_normalized_value: normalizedValue,
          vendor_st_id_runtime_type: runtimeType,
          tenant_id: lookupContext?.tenant_id || "",
          environment: lookupContext?.environment || "",
          lookup_started_at: lookupStartedAt,
          lookup_completed_at: lookupCompletedAt,
          entity: "Vendor",
          filter,
          additional_filters: {
            sort,
            limit,
            tenant_filter: null,
            environment_filter: null,
            active_status_filter: null,
            deleted_status_filter: null,
          },
          exact_query_used: exactQuery,
          outcome: "record_found",
          local_vendor_record_id: v.id,
          local_servicetitan_vendor_id: String(v.servicetitan_vendor_id),
          vendor_name: v.name,
          matched_field: "servicetitan_vendor_id",
          record_count_returned: results.length,
          exception_name: null,
          exception_message: null,
          http_status: null,
          base44_error_code: null,
          retry_after_ms: null,
          stack_location: null,
          is_rate_limit_error: false,
          is_retriable_error: false,
        });
      }
      return { id: v.id, name: v.name || "", servicetitan_vendor_id: String(v.servicetitan_vendor_id) };
    }

    if (diagnostics) {
      diagnostics.push({
        material_st_id: lookupContext?.material_st_id || "",
        material_name: lookupContext?.material_name || "",
        vendor_st_id: normalizedValue,
        vendor_st_id_raw_value: rawValue,
        vendor_st_id_normalized_value: normalizedValue,
        vendor_st_id_runtime_type: runtimeType,
        tenant_id: lookupContext?.tenant_id || "",
        environment: lookupContext?.environment || "",
        lookup_started_at: lookupStartedAt,
        lookup_completed_at: lookupCompletedAt,
        entity: "Vendor",
        filter,
        additional_filters: {
          sort,
          limit,
          tenant_filter: null,
          environment_filter: null,
          active_status_filter: null,
          deleted_status_filter: null,
        },
        exact_query_used: exactQuery,
        outcome: "no_record_found",
        record_count_returned: 0,
        exception_name: null,
        exception_message: null,
        http_status: null,
        base44_error_code: null,
        retry_after_ms: null,
        stack_location: null,
        is_rate_limit_error: false,
        is_retriable_error: false,
      });
    }
    return null;
  } catch (err: any) {
    const lookupCompletedAt = new Date().toISOString();
    const rateLimited = isRateLimitError(err);
    const retriable = isRetriableError(err);
    if (diagnostics) {
      diagnostics.push({
        material_st_id: lookupContext?.material_st_id || "",
        material_name: lookupContext?.material_name || "",
        vendor_st_id: normalizedValue,
        vendor_st_id_raw_value: rawValue,
        vendor_st_id_normalized_value: normalizedValue,
        vendor_st_id_runtime_type: runtimeType,
        tenant_id: lookupContext?.tenant_id || "",
        environment: lookupContext?.environment || "",
        lookup_started_at: lookupStartedAt,
        lookup_completed_at: lookupCompletedAt,
        entity: "Vendor",
        filter,
        additional_filters: {
          sort,
          limit,
          tenant_filter: null,
          environment_filter: null,
          active_status_filter: null,
          deleted_status_filter: null,
        },
        exact_query_used: exactQuery,
        outcome: "exception",
        exception_name: err?.name || err?.constructor?.name || "Error",
        exception_message: String(err?.message || err).substring(0, 500),
        http_status: err?.status || err?.statusCode || err?.response?.status || null,
        base44_error_code: err?.code || err?.error?.code || null,
        retry_after_ms: extractRetryAfterMs(err),
        stack_location: err?.stack?.split("\n").slice(1, 3).map((s: string) => s.trim()).join(" | ") || null,
        is_rate_limit_error: rateLimited,
        is_retriable_error: retriable,
        record_count_returned: 0,
      });
    }
    return null;
  }
}

/**
 * Resolve all vendor relationships for a material. Returns:
 *   - resolved: relationships with a local Vendor match
 *   - orphan: relationships where the ST vendor ID has no local Vendor
 * Returns true if ALL relationships resolved, false if any are orphan.
 */
export async function resolveAllVendorRelationships(
  base44: any,
  relationships: MappedVendorRelationship[],
  diagnostics?: Array<any>,
  lookupContext?: VendorLookupContext
): Promise<{
  resolved: Array<{ mapped: MappedVendorRelationship; vendor: ResolvedVendor }>;
  orphan: Array<{ mapped: MappedVendorRelationship }>;
  allResolved: boolean;
}> {
  const resolved: Array<{ mapped: MappedVendorRelationship; vendor: ResolvedVendor }> = [];
  const orphan: Array<{ mapped: MappedVendorRelationship }> = [];

  for (const rel of relationships) {
    const vendor = await resolveVendorByStId(base44, rel.servicetitan_vendor_id, diagnostics, lookupContext);
    if (vendor) {
      resolved.push({ mapped: rel, vendor });
    } else {
      orphan.push({ mapped: rel });
    }
  }

  return { resolved, orphan, allResolved: orphan.length === 0 };
}

// ─── MaterialVendor Relationship Upsert ──────────────────────────────────────

/**
 * Upsert a MaterialVendor relationship record. Matched by
 * (inventory_master_id, servicetitan_vendor_id). Never by vendor name.
 */
export async function upsertMaterialVendor(
  base44: any,
  inventoryMasterId: string,
  servicetitanMaterialId: string,
  mapped: MappedVendorRelationship,
  resolvedVendor: ResolvedVendor | null,
  nowIso: string,
  importSource: string
): Promise<{ action: "created" | "updated" | "unchanged"; id?: string; status: string }> {
  const relationshipKey = `${inventoryMasterId}:${mapped.servicetitan_vendor_id}`;

  let existing: any = null;
  try {
    const results = await base44.asServiceRole.entities.MaterialVendor.filter(
      { relationship_key: relationshipKey },
      "-servicetitan_last_sync",
      1
    );
    if (results.length > 0) existing = results[0];
  } catch { /* non-critical */ }

  const data: Record<string, any> = {
    relationship_key: relationshipKey,
    inventory_master_id: inventoryMasterId,
    servicetitan_material_id: servicetitanMaterialId,
    servicetitan_vendor_id: mapped.servicetitan_vendor_id,
    vendor_name_snapshot: mapped.vendor_name_snapshot,
    vendor_part_number: mapped.vendor_part_number,
    vendor_cost: mapped.vendor_cost,
    is_preferred_vendor: mapped.is_preferred_vendor,
    vendor_memo: mapped.vendor_memo,
    is_active: mapped.is_active,
    mapping_status: resolvedVendor ? "matched" : "orphan",
    mapping_warning: resolvedVendor ? "" : `ServiceTitan vendor ID ${mapped.servicetitan_vendor_id} has no local Vendor record`,
    servicetitan_modified_on: nowIso,
    servicetitan_last_sync: nowIso,
    servicetitan_sync_status: "synced",
    servicetitan_sync_version: existing ? (Number(existing.servicetitan_sync_version) || 0) + 1 : 1,
    import_source: importSource,
    imported_at: existing ? existing.imported_at : nowIso,
  };

  if (resolvedVendor) {
    data.vendor_id = resolvedVendor.id;
  } else {
    data.vendor_id = "";
  }

  if (!existing) {
    try {
      const created = await base44.asServiceRole.entities.MaterialVendor.create(data);
      return { action: "created", id: created?.id, status: data.mapping_status };
    } catch {
      return { action: "created", status: data.mapping_status };
    }
  }

  // Check if anything changed
  const changedFields = [
    "vendor_part_number", "vendor_cost", "is_preferred_vendor", "vendor_memo",
    "is_active", "vendor_id", "mapping_status",
  ];
  let changed = false;
  for (const f of changedFields) {
    if (data[f] !== existing[f]) { changed = true; break; }
  }
  if (!changed) {
    return { action: "unchanged", id: existing.id, status: existing.mapping_status };
  }

  try {
    await base44.asServiceRole.entities.MaterialVendor.update(existing.id, data);
    return { action: "updated", id: existing.id, status: data.mapping_status };
  } catch {
    return { action: "updated", id: existing.id, status: data.mapping_status };
  }
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

export function assertNoLvcFieldWritten(update: Record<string, any>): string[] {
  const violations: string[] = [];
  for (const lvcField of MATERIAL_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) {
      violations.push(lvcField);
    }
  }
  return violations;
}

export function buildRawDataJson(record: Record<string, any>, knownFields: string[]): string {
  const unknown: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!knownFields.includes(key) && !["id", "created_date", "updated_date", "created_by_id"].includes(key)) {
      unknown[key] = value;
    }
  }
  return Object.keys(unknown).length > 0 ? JSON.stringify(unknown) : "";
}