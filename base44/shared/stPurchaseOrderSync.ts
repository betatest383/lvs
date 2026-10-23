/**
 * ServiceTitan Purchase Order Sync — Domain Service
 *
 * Implements per-record create/update for the Purchase Order domain (Stage 2E)
 * with strict field-ownership enforcement and embedded-line processing.
 *
 * DIRECTION: ServiceTitan → LVC OS only. No outbound writes.
 *
 * FIELD OWNERSHIP (PurchaseOrder):
 *   - ServiceTitan-owned fields are overwritten on update.
 *   - LVC OS-owned fields are NEVER touched by sync.
 *   - The canonical identity (servicetitan_purchase_order_id) is matched ONLY —
 *     never by PO number, vendor name, or warehouse name.
 *
 * EMBEDDED LINES:
 *   - PO lines arrive embedded in the header `items[]` array.
 *   - There is NO separate line endpoint.
 *   - Each line has an immutable `id` (servicetitan_po_line_id).
 *   - Lines are processed independently — a missing material dependency defers
 *     only the unresolved line, preserving the header.
 *   - lines_sync_status tracks material dependency resolution completeness.
 *
 * NO LEDGER POSTING:
 *   - This service performs NO inventory ledger writes.
 *   - PO sync creates PO header + PO line records only.
 *   - Receipt sync (future domain) handles inventory increase via LVC workflow.
 */

import { normalizeString, normalizeBool, normalizeVendorId } from "./stVendorSync.ts";
import { withRetry } from "./stSync/stRateLimitProtection.ts";

// ─── Field Ownership (PurchaseOrder) ─────────────────────────────────────────

export const PURCHASE_ORDER_ST_OWNED_FIELDS = [
  "status",
  "servicetitan_po_number",
  "order_date",
  "expected_delivery_date",
  "actual_delivery_date",
  "vendor_name",
  "warehouse_name",
  "subtotal",
  "tax_amount",
  "shipping_amount",
  "total",
  "line_count",
  "total_quantity_ordered",
  "total_quantity_received",
  "received_percentage",
  "vendor_confirmed_at",
  "closed_at",
  "cancelled_at",
  "cancellation_reason",
  "servicetitan_active",
  "servicetitan_vendor_id",
  "servicetitan_warehouse_id",
  "servicetitan_project_id",
  "servicetitan_job_id",
  "servicetitan_sent_on",
  "servicetitan_purchase_order_type_id",
  "servicetitan_purchase_order_type_name",
  "servicetitan_purchase_order_id",
  "servicetitan_created_on",
  "servicetitan_modified_on",
  "servicetitan_last_sync",
  "servicetitan_last_event_at",
  "servicetitan_sync_status",
  "servicetitan_sync_version",
  "servicetitan_source",
  "servicetitan_raw_data",
  "lines_sync_status",
  "lines_expected_count",
  "lines_synced_count",
  "lines_last_sync_at",
  "import_source",
  "imported_at",
] as const;

export const PURCHASE_ORDER_LVC_OWNED_FIELDS = [
  "po_number",
  "lvc_workflow_status",
  "replenishment_origin",
  "replenishment_ids",
  "parent_po_id",
  "parent_po_number",
  "partial_receipt_origin",
  "created_by",
  "approved_by",
  "approved_at",
  "sent_by",
  "sent_at",
  "approval_status",
  "approval_history_json",
  "notes",
] as const;

export const PURCHASE_ORDER_LINE_ST_OWNED_FIELDS = [
  "purchase_order_id",
  "servicetitan_purchase_order_id",
  "po_number",
  "inventory_master_id",
  "servicetitan_material_id",
  "sku",
  "item_name",
  "vendor_sku",
  "quantity_ordered",
  "quantity_received",
  "quantity_outstanding",
  "unit_cost",
  "line_total",
  "line_status",
  "servicetitan_po_line_id",
  "servicetitan_active",
  "servicetitan_sync_status",
  "servicetitan_last_sync",
  "servicetitan_last_event_at",
  "servicetitan_modified_on",
  "servicetitan_created_on",
  "servicetitan_sync_version",
  "servicetitan_source",
  "servicetitan_raw_data",
  "import_source",
  "imported_at",
] as const;

export const PURCHASE_ORDER_LINE_LVC_OWNED_FIELDS = [
  "replenishment_id",
  "sort_order",
  "notes",
] as const;

// ─── Status Normalization ───────────────────────────────────────────────────

/**
 * Normalization table for ServiceTitan PO status values.
 * API uses TitleCase; schema uses lowercase.
 * Unknown values are NOT silently mapped — returned as-is for conflict classification.
 */
export const PO_STATUS_NORMALIZATION: Record<string, string> = {
  "pending": "draft",
  "sent": "sent",
  "received": "received",
  "canceled": "cancelled",
  "partially received": "partially_received",
};

export function normalizePoStatus(raw: unknown): { normalized: string | null; raw: string | null; unknown: boolean } {
  if (raw === null || raw === undefined || raw === "") return { normalized: null, raw: null, unknown: false };
  const rawStr = String(raw).trim();
  const lower = rawStr.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  const mapped = PO_STATUS_NORMALIZATION[lower];
  if (mapped) return { normalized: mapped, raw: rawStr, unknown: false };
  return { normalized: null, raw: rawStr, unknown: true };
}

/**
 * Normalization table for ServiceTitan PO line status values.
 * Distinct from the header table because the line_status enum
 * (["open","partially_received","received","cancelled"]) does NOT include
 * "draft" or "sent" — ServiceTitan "Pending"/"Sent" lines are open for
 * receiving, so they normalize to "open".
 * Unknown values are NOT silently mapped — returned as-is for conflict classification.
 */
export const PO_LINE_STATUS_NORMALIZATION: Record<string, string> = {
  "open": "open",
  "pending": "open",
  "sent": "open",
  "partially received": "partially_received",
  "received": "received",
  "canceled": "cancelled",
};

export function normalizePoLineStatus(raw: unknown): { normalized: string | null; raw: string | null; unknown: boolean } {
  if (raw === null || raw === undefined || raw === "") return { normalized: null, raw: null, unknown: false };
  const rawStr = String(raw).trim();
  const lower = rawStr.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  const mapped = PO_LINE_STATUS_NORMALIZATION[lower];
  if (mapped) return { normalized: mapped, raw: rawStr, unknown: false };
  return { normalized: null, raw: rawStr, unknown: true };
}

// ─── Normalization Helpers ────────────────────────────────────────────────────

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!isFinite(n)) return null;
  return n;
}

export function normalizePoId(value: unknown): string | null {
  return normalizeVendorId(value);
}

// ─── Mapped Types ─────────────────────────────────────────────────────────────

export interface MappedPoLine {
  servicetitan_po_line_id: string;
  servicetitan_purchase_order_id: string;
  purchase_order_id: string | null;
  po_number: string;
  inventory_master_id: string | null;
  servicetitan_material_id: string;
  sku: string;
  item_name: string;
  vendor_sku: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_outstanding: number;
  unit_cost: number;
  line_total: number;
  line_status: string | null;
  line_status_raw: string | null;
  line_status_unknown: boolean;
  servicetitan_created_on: string | null;
  servicetitan_modified_on: string | null;
  servicetitan_raw_data: string;
  import_source: string;
  imported_at: string | null;
}

export interface MappedPurchaseOrder {
  servicetitan_purchase_order_id: string;
  servicetitan_po_number: string;
  status: string | null;
  status_raw: string | null;
  status_unknown: boolean;
  servicetitan_vendor_id: string;
  vendor_id: string | null;
  vendor_name: string;
  servicetitan_warehouse_id: string;
  warehouse_location_id: string | null;
  warehouse_name: string;
  servicetitan_project_id: string | null;
  servicetitan_job_id: string | null;
  servicetitan_sent_on: string | null;
  servicetitan_purchase_order_type_id: string | null;
  servicetitan_purchase_order_type_name: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  tax_amount: number;
  shipping_amount: number;
  total: number;
  subtotal: number;
  line_count: number;
  total_quantity_ordered: number;
  total_quantity_received: number;
  received_percentage: number;
  servicetitan_created_on: string | null;
  servicetitan_modified_on: string | null;
  servicetitan_last_event_at: string | null;
  servicetitan_source: string;
  servicetitan_sync_status: string;
  servicetitan_sync_version: number;
  servicetitan_raw_data: string;
  import_source: string;
  imported_at: string | null;
  lines: MappedPoLine[];
}

export interface LocalPurchaseOrder {
  id: string;
  servicetitan_purchase_order_id?: string;
  servicetitan_modified_on?: string | null;
  servicetitan_last_event_at?: string | null;
  [key: string]: unknown;
}

export interface LocalPurchaseOrderLine {
  id: string;
  servicetitan_po_line_id?: string;
  [key: string]: unknown;
}

// ─── Raw Data Builder ─────────────────────────────────────────────────────────

const PO_HEADER_KNOWN_FIELDS = [
  "id", "number", "status", "vendorId", "inventoryLocationId", "projectId",
  "jobId", "typeId", "technicianId", "businessUnitId", "date", "requiredOn",
  "sentOn", "receivedOn", "total", "tax", "shipping", "createdOn", "modifiedOn",
  "createdById", "summary", "shipTo", "invoiceId", "vendorDocumentNumber",
  "batchId", "budgetCodeId", "customFields", "items",
];

export function buildPoRawData(record: any): string {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!PO_HEADER_KNOWN_FIELDS.includes(key)) {
      raw[key] = value;
    }
  }
  // Explicitly preserve the non-promoted ST fields per Stage 2E.2A
  if (record.summary !== undefined) raw.summary = record.summary;
  if (record.createdById !== undefined) raw.createdById = record.createdById;
  if (record.invoiceId !== undefined) raw.invoiceId = record.invoiceId;
  if (record.batchId !== undefined) raw.batchId = record.batchId;
  if (record.budgetCodeId !== undefined) raw.budgetCodeId = record.budgetCodeId;
  if (record.businessUnitId !== undefined) raw.businessUnitId = record.businessUnitId;
  if (record.technicianId !== undefined) raw.technicianId = record.technicianId;
  if (record.shipTo !== undefined) raw.shipTo = record.shipTo;
  if (record.vendorDocumentNumber !== undefined) raw.vendorDocumentNumber = record.vendorDocumentNumber;
  if (record.customFields !== undefined) raw.customFields = record.customFields;
  return JSON.stringify(raw);
}

const PO_LINE_KNOWN_FIELDS = [
  "id", "skuId", "skuCode", "skuName", "vendorPartNumber", "quantity",
  "quantityReceived", "cost", "total", "status", "createdOn", "modifiedOn",
];

export function buildPoLineRawData(record: any): string {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!PO_LINE_KNOWN_FIELDS.includes(key)) {
      raw[key] = value;
    }
  }
  // Preserve non-promoted line fields
  if (record.skuType !== undefined) raw.skuType = record.skuType;
  if (record.chargeable !== undefined) raw.chargeable = record.chargeable;
  if (record.description !== undefined) raw.description = record.description;
  if (record.serialNumbers !== undefined) raw.serialNumbers = record.serialNumbers;
  if (record.budgetCodeId !== undefined) raw.budgetCodeId = record.budgetCodeId;
  return JSON.stringify(raw);
}

// ─── Build Create / Update Data ──────────────────────────────────────────────

export function buildPurchaseOrderCreateData(mapped: MappedPurchaseOrder, nowIso: string): Record<string, any> {
  return {
    servicetitan_purchase_order_id: mapped.servicetitan_purchase_order_id,
    servicetitan_po_number: mapped.servicetitan_po_number,
    status: mapped.status || "draft",
    servicetitan_vendor_id: mapped.servicetitan_vendor_id,
    vendor_id: mapped.vendor_id,
    vendor_name: mapped.vendor_name,
    servicetitan_warehouse_id: mapped.servicetitan_warehouse_id,
    warehouse_location_id: mapped.warehouse_location_id,
    warehouse_name: mapped.warehouse_name,
    servicetitan_project_id: mapped.servicetitan_project_id,
    servicetitan_job_id: mapped.servicetitan_job_id,
    servicetitan_sent_on: mapped.servicetitan_sent_on,
    servicetitan_purchase_order_type_id: mapped.servicetitan_purchase_order_type_id,
    servicetitan_purchase_order_type_name: mapped.servicetitan_purchase_order_type_name,
    order_date: mapped.order_date,
    expected_delivery_date: mapped.expected_delivery_date,
    actual_delivery_date: mapped.actual_delivery_date,
    subtotal: mapped.subtotal,
    tax_amount: mapped.tax_amount,
    shipping_amount: mapped.shipping_amount,
    total: mapped.total,
    line_count: mapped.line_count,
    total_quantity_ordered: mapped.total_quantity_ordered,
    total_quantity_received: mapped.total_quantity_received,
    received_percentage: mapped.received_percentage,
    lines_sync_status: "not_started",
    lines_expected_count: mapped.lines.length,
    lines_synced_count: 0,
    lines_last_sync_at: nowIso,
    servicetitan_created_on: mapped.servicetitan_created_on,
    servicetitan_modified_on: mapped.servicetitan_modified_on,
    servicetitan_last_sync: nowIso,
    servicetitan_last_event_at: mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || nowIso,
    servicetitan_sync_status: "synced",
    servicetitan_sync_version: 1,
    servicetitan_source: mapped.servicetitan_source,
    servicetitan_active: true,
    servicetitan_raw_data: mapped.servicetitan_raw_data,
    import_source: mapped.import_source,
    imported_at: mapped.imported_at || nowIso,
  };
}

export function buildPurchaseOrderUpdateData(
  existing: Record<string, any>,
  mapped: MappedPurchaseOrder,
  nowIso: string
): Record<string, any> | null {
  const update: Record<string, any> = {};

  const stringFields: Array<keyof MappedPurchaseOrder> = [
    "servicetitan_po_number", "status", "vendor_name", "warehouse_name",
    "servicetitan_project_id", "servicetitan_job_id", "servicetitan_sent_on",
    "servicetitan_purchase_order_type_id", "servicetitan_purchase_order_type_name",
    "order_date", "expected_delivery_date", "actual_delivery_date",
  ];
  for (const field of stringFields) {
    const incoming = (mapped as any)[field] ?? null;
    const current = existing[field as string] ?? null;
    if (String(incoming ?? "") !== String(current ?? "")) {
      update[field as string] = incoming;
    }
  }

  const numberFields: Array<keyof MappedPurchaseOrder> = [
    "tax_amount", "shipping_amount", "total", "subtotal",
    "line_count", "total_quantity_ordered", "total_quantity_received", "received_percentage",
  ];
  for (const field of numberFields) {
    const incoming = (mapped as any)[field] ?? 0;
    const current = Number(existing[field as string] ?? 0);
    if (incoming !== current) {
      update[field as string] = incoming;
    }
  }

  // ID fields (vendor, warehouse) — always write if changed
  if (mapped.servicetitan_vendor_id !== (existing.servicetitan_vendor_id ?? "")) {
    update.servicetitan_vendor_id = mapped.servicetitan_vendor_id;
    update.vendor_id = mapped.vendor_id;
  }
  if (mapped.servicetitan_warehouse_id !== (existing.servicetitan_warehouse_id ?? "")) {
    update.servicetitan_warehouse_id = mapped.servicetitan_warehouse_id;
    update.warehouse_location_id = mapped.warehouse_location_id;
  }
  if (mapped.servicetitan_purchase_order_id !== (existing.servicetitan_purchase_order_id ?? "")) {
    update.servicetitan_purchase_order_id = mapped.servicetitan_purchase_order_id;
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
  update.lines_expected_count = mapped.lines.length;
  update.lines_last_sync_at = nowIso;

  // Never include LVC-owned fields
  for (const lvcField of PURCHASE_ORDER_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) delete update[lvcField];
  }

  return Object.keys(update).length > 0 ? update : null;
}

export function buildPoLineCreateData(mapped: MappedPoLine, purchaseOrderId: string, nowIso: string): Record<string, any> {
  return {
    purchase_order_id: purchaseOrderId,
    servicetitan_purchase_order_id: mapped.servicetitan_purchase_order_id,
    po_number: mapped.po_number,
    inventory_master_id: mapped.inventory_master_id,
    servicetitan_material_id: mapped.servicetitan_material_id,
    sku: mapped.sku,
    item_name: mapped.item_name,
    vendor_sku: mapped.vendor_sku,
    quantity_ordered: mapped.quantity_ordered,
    quantity_received: mapped.quantity_received,
    quantity_outstanding: mapped.quantity_outstanding,
    unit_cost: mapped.unit_cost,
    line_total: mapped.line_total,
    line_status: mapped.line_status || "open",
    servicetitan_po_line_id: mapped.servicetitan_po_line_id,
    servicetitan_active: true,
    servicetitan_sync_status: "synced",
    servicetitan_last_sync: nowIso,
    servicetitan_last_event_at: mapped.servicetitan_modified_on || nowIso,
    servicetitan_modified_on: mapped.servicetitan_modified_on,
    servicetitan_created_on: mapped.servicetitan_created_on,
    servicetitan_sync_version: 1,
    servicetitan_source: "api",
    servicetitan_raw_data: mapped.servicetitan_raw_data,
    import_source: mapped.import_source,
    imported_at: mapped.imported_at || nowIso,
  };
}

export function buildPoLineUpdateData(
  existing: Record<string, any>,
  mapped: MappedPoLine,
  purchaseOrderId: string,
  nowIso: string
): Record<string, any> | null {
  const update: Record<string, any> = {};

  const stringFields = ["sku", "item_name", "vendor_sku", "line_status", "po_number"];
  for (const field of stringFields) {
    const incoming = (mapped as any)[field] ?? "";
    if (incoming === "") continue;
    if (String(incoming) !== String(existing[field] ?? "")) {
      update[field] = incoming;
    }
  }

  const numberFields = ["quantity_ordered", "quantity_received", "quantity_outstanding", "unit_cost", "line_total"];
  for (const field of numberFields) {
    const incoming = (mapped as any)[field] ?? 0;
    if (incoming !== Number(existing[field] ?? 0)) {
      update[field] = incoming;
    }
  }

  if (mapped.inventory_master_id !== (existing.inventory_master_id ?? null)) {
    update.inventory_master_id = mapped.inventory_master_id;
  }
  if (mapped.servicetitan_material_id !== (existing.servicetitan_material_id ?? "")) {
    update.servicetitan_material_id = mapped.servicetitan_material_id;
  }
  if (purchaseOrderId !== (existing.purchase_order_id ?? "")) {
    update.purchase_order_id = purchaseOrderId;
  }

  if (mapped.servicetitan_raw_data !== (existing.servicetitan_raw_data ?? "")) {
    update.servicetitan_raw_data = mapped.servicetitan_raw_data;
  }
  if (mapped.servicetitan_modified_on !== (existing.servicetitan_modified_on ?? null)) {
    update.servicetitan_modified_on = mapped.servicetitan_modified_on;
  }
  update.servicetitan_last_sync = nowIso;
  update.servicetitan_last_event_at = mapped.servicetitan_modified_on || nowIso;
  update.servicetitan_sync_status = "synced";
  update.servicetitan_sync_version = (Number(existing.servicetitan_sync_version) || 0) + 1;

  for (const lvcField of PURCHASE_ORDER_LINE_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) delete update[lvcField];
  }

  return Object.keys(update).length > 0 ? update : null;
}

// ─── Ownership Assertion ──────────────────────────────────────────────────────

export function assertNoLvcFieldWritten(payload: Record<string, any>, lvcFields: readonly string[]): string[] {
  const violations: string[] = [];
  for (const field of lvcFields) {
    if (payload[field] !== undefined) {
      violations.push(field);
    }
  }
  return violations;
}

// ─── Dependency Resolution ────────────────────────────────────────────────────

export async function resolveVendorByStId(
  base44: any,
  servicetitanVendorId: string
): Promise<{ id: string; name: string } | null> {
  if (!servicetitanVendorId) return null;
  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.Vendor.filter(
        { servicetitan_vendor_id: servicetitanVendorId },
        "-servicetitan_last_sync",
        1
      ),
      { maxRetries: 5 }
    );
    if (results.length > 0) {
      return { id: results[0].id, name: results[0].name || "" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveWarehouseByStId(
  base44: any,
  servicetitanWarehouseId: string
): Promise<{ id: string; name: string } | null> {
  if (!servicetitanWarehouseId) return null;
  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.WarehouseLocation.filter(
        { servicetitan_warehouse_id: servicetitanWarehouseId },
        "-created_date",
        1
      ),
      { maxRetries: 5 }
    );
    if (results.length > 0) {
      return { id: results[0].id, name: results[0].name || "" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveMaterialByStId(
  base44: any,
  servicetitanMaterialId: string
): Promise<{ id: string } | null> {
  if (!servicetitanMaterialId) return null;
  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.InventoryMaster.filter(
        { servicetitan_material_id: servicetitanMaterialId },
        "-servicetitan_last_sync",
        1
      ),
      { maxRetries: 5 }
    );
    if (results.length > 0) {
      return { id: results[0].id };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Discriminated Dependency Resolution (Stage 2E.6) ──────────────────────────
//
// Distinguishes missing, ambiguous (multiple candidates), inactive, and
// unresolved dependencies with STABLE, machine-readable reason codes. The
// legacy resolve{Vendor,Warehouse,Material}ByStId helpers are retained for
// backward compatibility; the Stage 2E.6 adapter path uses these
// discriminated resolvers to emit actionable deferral reasons without ever
// guessing between multiple candidates.

export type DependencyResolution =
  | { status: "resolved"; id: string; name?: string }
  | { status: "missing_id"; reason: string }
  | { status: "missing"; reason: string }
  | { status: "ambiguous"; reason: string; matchCount: number }
  | { status: "inactive"; reason: string; id: string };

export async function resolveWarehouseDependency(
  base44: any,
  servicetitanWarehouseId: string
): Promise<DependencyResolution> {
  if (!servicetitanWarehouseId) return { status: "missing_id", reason: "WAREHOUSE_MISSING_ID" };
  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.WarehouseLocation.filter(
        { servicetitan_warehouse_id: servicetitanWarehouseId },
        "-created_date",
        2
      ),
      { maxRetries: 5 }
    );
    if (!results || results.length === 0) return { status: "missing", reason: "WAREHOUSE_MISSING" };
    if (results.length > 1) return { status: "ambiguous", reason: "WAREHOUSE_AMBIGUOUS", matchCount: results.length };
    const wh = results[0];
    if (wh.is_active === false) return { status: "inactive", reason: "WAREHOUSE_INACTIVE", id: wh.id };
    return { status: "resolved", id: wh.id, name: wh.name || "" };
  } catch {
    return { status: "missing", reason: "WAREHOUSE_LOOKUP_ERROR" };
  }
}

export async function resolveMaterialDependency(
  base44: any,
  servicetitanMaterialId: string
): Promise<DependencyResolution> {
  if (!servicetitanMaterialId) return { status: "missing_id", reason: "MATERIAL_MISSING_ID" };
  try {
    const results = await withRetry(
      () => base44.asServiceRole.entities.InventoryMaster.filter(
        { servicetitan_material_id: servicetitanMaterialId },
        "-servicetitan_last_sync",
        2
      ),
      { maxRetries: 5 }
    );
    if (!results || results.length === 0) return { status: "missing", reason: "MATERIAL_MISSING" };
    if (results.length > 1) return { status: "ambiguous", reason: "MATERIAL_AMBIGUOUS", matchCount: results.length };
    const mat = results[0];
    if (mat.is_active === false) return { status: "inactive", reason: "MATERIAL_INACTIVE", id: mat.id };
    return { status: "resolved", id: mat.id };
  } catch {
    return { status: "missing", reason: "MATERIAL_LOOKUP_ERROR" };
  }
}