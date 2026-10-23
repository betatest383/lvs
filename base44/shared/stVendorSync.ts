/**
 * ServiceTitan Vendor Sync — Domain Service
 *
 * Implements per-record create/update for the Vendor domain with strict
 * field-ownership enforcement. Reused by the Vendor sync adapter
 * (Stage 2C) for the inbound incremental write path.
 *
 * DIRECTION: ServiceTitan → LVC OS only. No outbound writes.
 *
 * FIELD OWNERSHIP:
 *   - ServiceTitan-owned fields are overwritten on update.
 *   - LVC OS-owned fields are NEVER touched by sync.
 *   - The canonical identity (servicetitan_vendor_id) is matched ONLY —
 *     never by name, email, or phone alone.
 *
 * NULL / EMPTY RULES:
 *   - Empty incoming string values do NOT clear a populated ST-owned field
 *     (ServiceTitan does not emit an explicit "cleared" marker). This is the
 *     conservative interpretation of the approved null rule.
 *   - Boolean ST-owned fields (servicetitan_active, servicetitan_is_truck_replenishment)
 *     are always written — false is a real signal.
 *   - Numeric fields (latitude/longitude) are written when the incoming value
 *     is a finite number; null/undefined does not clear an existing value.
 *   - Phone, fax, and postal code are preserved as text.
 *
 * INACTIVE RECORDS:
 *   - When ServiceTitan Active is false, the vendor is preserved, marked
 *     servicetitan_active=false, and is NOT deleted. LVC operational data
 *     (is_active, scorecards, payment terms, etc.) is untouched.
 */

// ─── Field Ownership ────────────────────────────────────────────────────────────

/**
 * The complete set of ServiceTitan-owned Vendor fields.
 * Only these fields may be written by inbound sync.
 * Every other Vendor field is LVC-owned and never touched.
 */
export const VENDOR_ST_OWNED_FIELDS = [
  "servicetitan_vendor_id",
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
  "latitude",
  "longitude",
  "servicetitan_memo",
  "servicetitan_active",
  "servicetitan_is_truck_replenishment",
  "servicetitan_modified_on",
  "servicetitan_last_sync",
  "servicetitan_last_event_at",
  "servicetitan_sync_status",
  "servicetitan_sync_version",
  "import_source",
  "imported_at",
] as const;

/**
 * LVC-owned fields that sync must NEVER write. Listed explicitly for audit
 * and test verification. This list is the complement of VENDOR_ST_OWNED_FIELDS
 * within the Vendor schema (excluding built-ins id/created_date/updated_date).
 */
export const VENDOR_LVC_OWNED_FIELDS = [
  "vendor_code",
  "legal_name",
  "contact_name",
  "website",
  "address",
  "account_number",
  "payment_terms",
  "default_lead_time_days",
  "performance_rating",
  "fill_rate_percentage",
  "on_time_delivery_percentage",
  "total_pos_sent",
  "total_pos_received",
  "total_backorders",
  "is_active",
  "sort_order",
  "notes",
] as const;

// ─── Normalization Helpers ───────────────────────────────────────────────────

/**
 * Normalize a string: trim whitespace. Returns "" for null/undefined.
 * Phone numbers and postal codes are preserved as text (no digit stripping).
 */
export function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  return s;
}

/**
 * Normalize a boolean from 1/0, true/false, "true"/"false", or equivalent.
 */
export function normalizeBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n" || s === "") return false;
  }
  return false;
}

/**
 * Normalize a numeric coordinate. Returns null when the value is not a
 * finite number (so the caller can skip clearing an existing value).
 */
export function normalizeCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!isFinite(n)) return null;
  return n;
}

/**
 * Normalize the ServiceTitan vendor ID to a consistent string representation.
 * ServiceTitan IDs can be int64; storing as string avoids precision loss.
 * Returns null for missing/invalid IDs.
 */
export function normalizeVendorId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  // Reject non-numeric garbage that cannot be an ST id.
  if (!/^-?\d+$/.test(s)) return null;
  return s;
}

// ─── Build Create / Update Data ───────────────────────────────────────────────

/** Local Vendor entity record (subset used by the adapter). */
export interface LocalVendor {
  id: string;
  servicetitan_vendor_id: string;
  servicetitan_modified_on?: string | null;
  servicetitan_last_event_at?: string | null;
  servicetitan_active?: boolean;
  servicetitan_is_truck_replenishment?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
}

export interface MappedVendor {
  servicetitan_vendor_id: string;
  name: string;
  email: string;
  phone: string;
  contact_first_name: string;
  contact_last_name: string;
  fax: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  servicetitan_memo: string;
  servicetitan_active: boolean;
  servicetitan_is_truck_replenishment: boolean;
  servicetitan_modified_on: string | null;
  servicetitan_last_event_at: string | null;
  servicetitan_tenant_id: string;
  servicetitan_source: string;
  servicetitan_sync_status: string;
  servicetitan_sync_version: number;
  import_source: string;
  imported_at: string | null;
}

/**
 * Build the create payload for a new Vendor record.
 * Writes all ST-owned fields plus the canonical identity.
 */
export function buildVendorCreateData(mapped: MappedVendor, nowIso: string): Record<string, any> {
  return {
    servicetitan_vendor_id: mapped.servicetitan_vendor_id,
    name: mapped.name,
    email: mapped.email,
    phone: mapped.phone,
    contact_first_name: mapped.contact_first_name,
    contact_last_name: mapped.contact_last_name,
    fax: mapped.fax,
    street: mapped.street,
    unit: mapped.unit,
    city: mapped.city,
    state: mapped.state,
    zip_code: mapped.zip_code,
    country: mapped.country,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    servicetitan_memo: mapped.servicetitan_memo,
    servicetitan_active: mapped.servicetitan_active,
    servicetitan_is_truck_replenishment: mapped.servicetitan_is_truck_replenishment,
    servicetitan_modified_on: mapped.servicetitan_modified_on,
    servicetitan_last_sync: nowIso,
    servicetitan_last_event_at: mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || nowIso,
    servicetitan_sync_status: "synced",
    servicetitan_sync_version: 1,
    import_source: mapped.import_source,
    imported_at: mapped.imported_at || nowIso,
  };
}

/**
 * Build the update payload for an existing Vendor record.
 *
 * Applies the approved null/empty rules:
 *   - Only ST-owned fields are considered.
 *   - Empty incoming strings do NOT clear populated existing fields.
 *   - Booleans are always written.
 *   - Coordinates are written only when finite.
 *   - Only fields that actually differ are included (minimal write).
 *
 * Returns the update payload, or null when nothing changed.
 */
export function buildVendorUpdateData(
  existing: Record<string, any>,
  mapped: MappedVendor,
  nowIso: string
): Record<string, any> | null {
  const update: Record<string, any> = {};

  // String ST-owned fields: write when incoming is non-empty and differs.
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
    const incoming = (mapped as any)[field] ?? "";
    if (incoming === "") continue; // do not clear populated field
    const current = String(existing[field] ?? "");
    if (String(incoming) !== current) {
      update[field] = incoming;
    }
  }

  // Boolean ST-owned fields: always write when they differ.
  if (mapped.servicetitan_active !== Boolean(existing.servicetitan_active)) {
    update.servicetitan_active = mapped.servicetitan_active;
  }
  if (mapped.servicetitan_is_truck_replenishment !== Boolean(existing.servicetitan_is_truck_replenishment)) {
    update.servicetitan_is_truck_replenishment = mapped.servicetitan_is_truck_replenishment;
  }

  // Coordinates: write only when finite and differing.
  if (mapped.latitude !== null && mapped.latitude !== Number(existing.latitude)) {
    update.latitude = mapped.latitude;
  }
  if (mapped.longitude !== null && mapped.longitude !== Number(existing.longitude)) {
    update.longitude = mapped.longitude;
  }

  // Sync metadata: always refresh.
  if (mapped.servicetitan_modified_on !== (existing.servicetitan_modified_on ?? null)) {
    update.servicetitan_modified_on = mapped.servicetitan_modified_on;
  }
  update.servicetitan_last_sync = nowIso;
  update.servicetitan_last_event_at = mapped.servicetitan_last_event_at || mapped.servicetitan_modified_on || nowIso;
  update.servicetitan_sync_status = "synced";
  update.servicetitan_sync_version = (Number(existing.servicetitan_sync_version) || 0) + 1;

  // Remove the sync metadata fields if ONLY they changed and nothing else —
  // we still want to record the sync touch even when business fields are
  // unchanged, so we keep them. The adapter's recordsEqual decides whether
  // a write is needed at all; buildVendorUpdateData is only called when a
  // write is warranted.

  // Never include LVC-owned fields here.
  for (const lvcField of VENDOR_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) {
      delete update[lvcField];
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

// ─── Per-record Sync ──────────────────────────────────────────────────────────

/**
 * Create a new local Vendor from mapped ServiceTitan data.
 * Called by the adapter's createRecord in write mode.
 */
export async function syncVendorCreated(
  base44: any,
  mapped: MappedVendor,
  _context: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const nowIso = new Date().toISOString();
    const data = buildVendorCreateData(mapped, nowIso);
    const created = await base44.asServiceRole.entities.Vendor.create(data);
    return { success: true, id: created?.id };
  } catch (err: any) {
    return { success: false, error: `Vendor create failed: ${err?.message || String(err)}` };
  }
}

/**
 * Update an existing local Vendor with mapped ServiceTitan data.
 * Preserves all LVC-owned fields. Applies the approved null/empty rules.
 * Called by the adapter's updateRecord in write mode.
 */
export async function syncVendorUpdated(
  base44: any,
  existing: Record<string, any>,
  mapped: MappedVendor,
  _context: any
): Promise<{ success: boolean; id?: string; error?: string; updatedFields?: string[] }> {
  try {
    const nowIso = new Date().toISOString();
    const update = buildVendorUpdateData(existing, mapped, nowIso);
    if (!update) {
      return { success: true, id: existing.id, updatedFields: [] };
    }
    await base44.asServiceRole.entities.Vendor.update(existing.id, update);
    return { success: true, id: existing.id, updatedFields: Object.keys(update) };
  } catch (err: any) {
    return { success: false, error: `Vendor update failed: ${err?.message || String(err)}` };
  }
}

/**
 * Verify that no LVC-owned field is present in an update payload.
 * Used by tests.
 */
export function assertNoLvcFieldWritten(update: Record<string, any>): string[] {
  const violations: string[] = [];
  for (const lvcField of VENDOR_LVC_OWNED_FIELDS) {
    if (update[lvcField] !== undefined) {
      violations.push(lvcField);
    }
  }
  return violations;
}