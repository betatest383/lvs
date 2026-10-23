/**
 * Vendor Sync Adapter
 *
 * Implements ServiceTitanSyncAdapter for the Vendor domain (Stage 2C).
 *
 * DIRECTION: ServiceTitan → LVC OS only. The adapter performs NO outbound
 * writes to ServiceTitan. No POST/PUT/PATCH/DELETE is issued against the
 * vendors endpoint.
 *
 * Endpoint: /inventory/v2/tenant/{tenant}/vendors (page-based)
 * Pagination: page-based (page/pageSize) — same as Jobs / Appointments
 * Incremental filter: modifiedOnOrAfter
 *
 * DEPENDENCIES: None. A vendor has no required foreign-key dependencies.
 * verifyDependencies is omitted — the engine treats it as satisfied.
 *
 * IDENTITY: Vendor.Id → servicetitan_vendor_id (string, int64-safe).
 *   - Records are matched ONLY by servicetitan_vendor_id.
 *   - Never matched by name, email, or phone.
 *   - Missing/invalid IDs are rejected (getSourceId returns null → failed).
 *
 * Field Ownership:
 *   - ServiceTitan-owned: name, email, phone, contact_first_name,
 *     contact_last_name, fax, street, unit, city, state, zip_code, country,
 *     latitude, longitude, servicetitan_memo, servicetitan_active,
 *     servicetitan_is_truck_replenishment, servicetitan_modified_on, sync
 *     metadata, import metadata
 *   - LVC OS-owned: vendor_code, legal_name, contact_name, website, address,
 *     account_number, payment_terms, default_lead_time_days,
 *     performance_rating, fill_rate_percentage, on_time_delivery_percentage,
 *     total_pos_sent, total_pos_received, total_backorders, is_active,
 *     sort_order, notes — NEVER overwritten by sync
 */

import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPaginationState,
  SyncPageRequest,
  SyncPageResult,
} from "../stSyncAdapter.ts";
import { apiRequest, retryWithBackoff } from "../../stAuth.ts";
import {
  normalizeString,
  normalizeBool,
  normalizeCoordinate,
  normalizeVendorId,
  buildVendorCreateData,
  buildVendorUpdateData,
  syncVendorCreated,
  syncVendorUpdated,
  type MappedVendor,
  type LocalVendor,
} from "../../stVendorSync.ts";

// ─── Source Types (ServiceTitan Inventory v2 Vendors) ──────────────────────

/**
 * Raw ServiceTitan vendor record.
 *
 * TWO shapes are supported:
 *   1. Live Inventory v2 list endpoint (primary) — verified by live API
 *      verification (HTTP 200). Returns: id, name, active,
 *      isTruckReplenishment, memo, contactInfo {firstName,lastName,phone,
 *      email,fax}, address {street,unit,city,state,zip,country}, createdOn,
 *      modifiedOn. NOTE: latitude/longitude are NOT returned by the live
 *      endpoint (only by the export).
 *   2. Flattened export shape (fallback) — the uploaded ServiceTitan Vendor
 *      export: Id, Name, FirstName, LastName, Phone, Email, Fax,
 *      Address.{Street,Unit,City,State,Zip,Country}, Latitude, Longitude,
 *      Memo, Active, IsTruckReplenishment.
 *
 * mapRecord reads the live shape first and falls back to the export shape
 * for every field, so the adapter works against both representations.
 */
export interface StVendorSource {
  // ── Live API (lowercase / camelCase, nested) ──
  id?: number | string;
  name?: string;
  active?: boolean | number | string;
  isTruckReplenishment?: boolean | number | string;
  memo?: string;
  contactInfo?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    fax?: string;
    [key: string]: unknown;
  } | null;
  address?: {
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    [key: string]: unknown;
  } | null;
  createdOn?: string;
  modifiedOn?: string;
  // ── Export / flat fallback (PascalCase) ──
  Id?: number | string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  Phone?: string;
  Email?: string;
  Fax?: string;
  Address?: {
    Street?: string;
    Unit?: string;
    City?: string;
    State?: string;
    Zip?: string;
    Country?: string;
  } | null;
  Latitude?: number | string | null;
  Longitude?: number | string | null;
  Memo?: string;
  Active?: boolean | number | string;
  IsTruckReplenishment?: boolean | number | string;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VENDOR_DOMAIN = "vendor";
const VENDOR_INTEGRATION_NAME = "servicetitan_vendor_sync";
const VENDOR_PAGE_SIZE = 50;

function vendorsEndpoint(tenantId: string): string {
  return `/inventory/v2/tenant/${tenantId}/vendors`;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

export const vendorAdapter: ServiceTitanSyncAdapter<
  StVendorSource,
  MappedVendor,
  LocalVendor
> = {
  domain: VENDOR_DOMAIN,
  integrationName: VENDOR_INTEGRATION_NAME,

  getEndpoint(context: SyncContext): string {
    return vendorsEndpoint(context.tenantId);
  },

  getInitialPaginationState(_context: SyncContext): SyncPaginationState {
    return { mode: "page", page: 1, pageSize: VENDOR_PAGE_SIZE };
  },

  async fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<StVendorSource>> {
    const path = vendorsEndpoint(context.tenantId);
    const pagination = request.pagination;

    if (pagination.mode !== "page") {
      throw new Error("Vendor sync uses page-based pagination only");
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

    const records: StVendorSource[] = result.data || result.vendors || result.results || [];
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

  getSourceId(record: StVendorSource): string | null {
    // Live API uses lowercase `id`; export uses `Id`. normalizeVendorId
    // rejects missing/non-numeric values → null → engine classifies the
    // record as failed ("Missing source ID"). This satisfies both
    // "missing Vendor.Id rejected" and "invalid IDs rejected".
    return normalizeVendorId(record.id ?? record.Id);
  },

  getSourceCreatedOn(record: StVendorSource): string | null {
    return record.createdOn || null;
  },

  getSourceModifiedOn(record: StVendorSource): string | null {
    return record.modifiedOn || null;
  },

  async mapRecord(
    record: StVendorSource,
    context: SyncContext
  ): Promise<MappedVendor> {
    const stVendorId = normalizeVendorId(record.id ?? record.Id) || "";
    // Live API nests contact info under `contactInfo` and address under
    // lowercase `address`; the flattened export uses top-level
    // FirstName/LastName/Phone/Email/Fax and `Address` (PascalCase). Read
    // the live shape first, fall back to the export shape for every field.
    const contact = record.contactInfo || {};
    const addr = record.address || record.Address || {};

    return {
      servicetitan_vendor_id: stVendorId,
      name: normalizeString(record.name ?? record.Name),
      email: normalizeString(contact.email ?? record.Email),
      phone: normalizeString(contact.phone ?? record.Phone),
      contact_first_name: normalizeString(contact.firstName ?? record.FirstName),
      contact_last_name: normalizeString(contact.lastName ?? record.LastName),
      fax: normalizeString(contact.fax ?? record.Fax),
      street: normalizeString(addr.street ?? addr.Street),
      unit: normalizeString(addr.unit ?? addr.Unit),
      city: normalizeString(addr.city ?? addr.City),
      state: normalizeString(addr.state ?? addr.State),
      zip_code: normalizeString(addr.zip ?? addr.Zip),
      country: normalizeString(addr.country ?? addr.Country),
      latitude: normalizeCoordinate(record.latitude ?? record.Latitude),
      longitude: normalizeCoordinate(record.longitude ?? record.Longitude),
      servicetitan_memo: normalizeString(record.memo ?? record.Memo),
      servicetitan_active: normalizeBool(record.active ?? record.Active),
      servicetitan_is_truck_replenishment: normalizeBool(record.isTruckReplenishment ?? record.IsTruckReplenishment),
      servicetitan_modified_on: record.modifiedOn || null,
      servicetitan_last_event_at: record.modifiedOn || null,
      servicetitan_tenant_id: context.tenantId,
      servicetitan_source: context.source === "webhook" ? "webhook" : "api",
      servicetitan_sync_status: "synced",
      servicetitan_sync_version: 0,
      import_source: context.source === "api_recovery" ? "api_recovery" : context.source === "api_export" ? "api_export" : "manual",
      imported_at: null,
    };
  },

  async findExisting(
    base44: any,
    mapped: MappedVendor,
    _context: SyncContext
  ): Promise<LocalVendor | null> {
    if (!mapped.servicetitan_vendor_id) return null;
    try {
      // Match ONLY by canonical ServiceTitan identity. Never by name.
      const results = await base44.asServiceRole.entities.Vendor.filter(
        { servicetitan_vendor_id: mapped.servicetitan_vendor_id },
        "-servicetitan_last_sync",
        1
      );
      return results.length > 0 ? (results[0] as LocalVendor) : null;
    } catch (err) {
      console.error("[VENDOR ADAPTER] findExisting failed:", err);
      throw err;
    }
  },

  getLocalSourceModifiedOn(existing: LocalVendor): string | null {
    return existing.servicetitan_modified_on || existing.servicetitan_last_event_at || null;
  },

  recordsEqual(existing: LocalVendor, mapped: MappedVendor): boolean {
    // Compare ST-owned business fields only. Sync metadata (modified_on,
    // last_sync, sync_version) is excluded — it always changes and is not
    // a meaningful business change.
    const stringFields = [
      "name",
      "email",
      "phone",
      "contact_first_name",
      "contact_last_name",
      "fax",
      "street",
      "unit",
      "city",
      "state",
      "zip_code",
      "country",
      "servicetitan_memo",
    ];
    for (const field of stringFields) {
      const existingVal = String(existing[field] ?? "").trim();
      const mappedVal = String((mapped as any)[field] ?? "").trim();
      if (existingVal !== mappedVal) return false;
    }

    // Booleans
    if (Boolean(existing.servicetitan_active) !== mapped.servicetitan_active) return false;
    if (Boolean(existing.servicetitan_is_truck_replenishment) !== mapped.servicetitan_is_truck_replenishment) return false;

    // Coordinates (skip when incoming is null — preserves existing)
    if (mapped.latitude !== null && Number(existing.latitude) !== mapped.latitude) return false;
    if (mapped.longitude !== null && Number(existing.longitude) !== mapped.longitude) return false;

    return true;
  },

  // ── Create/update — wired to the domain service ──
  // NOT invoked during dry_run — the engine skips createRecord/updateRecord
  // when execution_mode = "dry_run".

  async createRecord(
    base44: any,
    mapped: MappedVendor,
    context: SyncContext
  ): Promise<LocalVendor> {
    const result = await syncVendorCreated(base44, mapped, context);
    if (!result.success) {
      throw new Error(result.error || "syncVendorCreated failed");
    }
    const existing = await this.findExisting(base44, mapped, context);
    if (!existing) {
      throw new Error("Vendor record not found after create");
    }
    return existing;
  },

  async updateRecord(
    base44: any,
    existing: LocalVendor,
    mapped: MappedVendor,
    context: SyncContext
  ): Promise<LocalVendor> {
    const result = await syncVendorUpdated(base44, existing as Record<string, any>, mapped, context);
    if (!result.success) {
      throw new Error(result.error || "syncVendorUpdated failed");
    }
    const updated = await this.findExisting(base44, mapped, context);
    if (!updated) {
      throw new Error("Vendor record not found after update");
    }
    return updated;
  },
};