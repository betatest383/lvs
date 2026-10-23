/**
 * ServiceTitan Customer Field Mapping & Extraction
 *
 * Shared helpers for extracting, normalizing, and mapping ServiceTitan
 * customer data from both webhook payloads and CRM v2 export records.
 * No business logic — pure data transformation only.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedCustomerData {
  servicetitan_customer_id: string;
  name: string;
  company: string;
  customer_type: string;
  email: string;
  alt_email: string;
  phone: string;
  alt_phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  status: string;
  servicetitan_tenant_id: string;
  servicetitan_last_event_at: string | null;
}

// ─── Payload Extraction ──────────────────────────────────────────────────────

export function getString(payload: any, ...keys: string[]): string {
  for (const k of keys) {
    if (payload[k] != null && String(payload[k]).trim()) {
      return String(payload[k]).trim();
    }
  }
  return "";
}

/**
 * Extract and normalize all ServiceTitan customer fields from the webhook
 * payload. Handles common field name variations.
 */
export function extractCustomerData(payload: any, event: any): ExtractedCustomerData {
  const stCustomerId =
    getString(payload, "customer_id", "servicetitan_customer_id", "id") ||
    (event?.object_id ? String(event.object_id) : "");

  const name = getString(
    payload,
    "name",
    "customer_name",
    "full_name",
    "display_name"
  );
  const company = getString(payload, "company", "company_name");
  const customerType = getString(payload, "customer_type", "type").toLowerCase();
  const email = getString(payload, "email", "primary_email");
  const altEmail = getString(payload, "alt_email", "secondary_email", "email_2");
  const phone = getString(payload, "phone", "primary_phone", "mobile");
  const altPhone = getString(
    payload,
    "alt_phone",
    "secondary_phone",
    "home_phone",
    "phone_2"
  );

  // Service address
  const address = getString(payload, "address", "service_address", "street");
  const city = getString(payload, "city", "service_city");
  const state = getString(payload, "state", "service_state");
  const zip = getString(payload, "zip", "service_zip", "zip_code", "postal_code");

  // Billing address (may be same as service)
  const billingAddress = getString(
    payload,
    "billing_address",
    "billing_street"
  );
  const billingCity = getString(payload, "billing_city");
  const billingState = getString(payload, "billing_state");
  const billingZip = getString(payload, "billing_zip", "billing_postal_code");

  // Status
  const rawStatus = getString(payload, "status", "active", "is_active").toLowerCase();
  let status = "active";
  if (rawStatus === "inactive" || rawStatus === "false" || rawStatus === "0") {
    status = "inactive";
  }

  const stTenantId =
    getString(payload, "tenant_id", "servicetitan_tenant_id") ||
    (event?.tenant_id ? String(event.tenant_id) : "");

  const stEventAt = getString(
    payload,
    "event_timestamp",
    "timestamp",
    "created_at",
    "updated_at",
    "occurred_at"
  );

  // Normalize customer_type
  let normalizedType = "";
  if (customerType === "residential" || customerType === "commercial") {
    normalizedType = customerType;
  } else if (customerType === "res" || customerType === "home") {
    normalizedType = "residential";
  } else if (customerType === "com" || customerType === "business") {
    normalizedType = "commercial";
  }

  return {
    servicetitan_customer_id: stCustomerId,
    name,
    company,
    customer_type: normalizedType,
    email,
    alt_email: altEmail,
    phone,
    alt_phone: altPhone,
    address,
    city,
    state,
    zip,
    billing_address: billingAddress,
    billing_city: billingCity,
    billing_state: billingState,
    billing_zip: billingZip,
    status,
    servicetitan_tenant_id: stTenantId,
    servicetitan_last_event_at: stEventAt || null,
  };
}

// ─── Event Ordering Protection ───────────────────────────────────────────────

/**
 * Check if an incoming webhook event is stale (older than the last
 * ServiceTitan event that updated this customer).
 *
 * Uses servicetitan_last_event_at from both the existing record and
 * the incoming payload. If the incoming event is older, it should not
 * overwrite newer ServiceTitan-controlled state.
 *
 * @returns true if the event is stale and should be ignored
 */
export function isStaleEvent(existing: any, incomingEventAt: string | null): boolean {
  if (!incomingEventAt) return false;
  const existingEventAt = existing?.servicetitan_last_event_at;
  if (!existingEventAt) return false;

  const incomingTime = new Date(incomingEventAt).getTime();
  const existingTime = new Date(existingEventAt).getTime();

  if (isNaN(incomingTime) || isNaN(existingTime)) return false;

  return incomingTime < existingTime;
}

// ─── Find Local Customer ────────────────────────────────────────────────────

export async function findLocalCustomer(
  base44: any,
  stCustomerId: string
): Promise<any | null> {
  if (!stCustomerId) return null;
  try {
    const results = await base44.asServiceRole.entities.Customer.filter(
      { servicetitan_customer_id: stCustomerId },
      "-servicetitan_last_sync",
      1
    );
    return results.length > 0 ? results[0] : null;
  } catch (err) {
    console.error("[ST CUST SYNC] findLocalCustomer failed:", err);
    throw err;
  }
}

// ─── Build Update Data ────────────────────────────────────────────────────────

/**
 * Build the update payload from extracted data.
 * Only includes ST-controlled fields and sync metadata.
 */
export function buildSyncUpdateData(
  extracted: ExtractedCustomerData,
  eventType: string,
  source: string = "webhook"
): Record<string, any> {
  const now = new Date().toISOString();
  return {
    servicetitan_customer_id: extracted.servicetitan_customer_id,
    name: extracted.name,
    company: extracted.company,
    customer_type: extracted.customer_type,
    email: extracted.email,
    alt_email: extracted.alt_email,
    phone: extracted.phone,
    alt_phone: extracted.alt_phone,
    address: extracted.address,
    city: extracted.city,
    state: extracted.state,
    zip: extracted.zip,
    billing_address: extracted.billing_address,
    billing_city: extracted.billing_city,
    billing_state: extracted.billing_state,
    billing_zip: extracted.billing_zip,
    status: extracted.status,
    servicetitan_tenant_id: extracted.servicetitan_tenant_id,
    servicetitan_last_sync: now,
    servicetitan_last_event_type: eventType,
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now,
    servicetitan_source: source,
    servicetitan_sync_status: "synced",
  };
}

// ─── API Export Record Mapping ────────────────────────────────────────────────

/**
 * Map a ServiceTitan CRM v2 export record into the payload format expected
 * by extractCustomerData. Reuses the SAME field-extraction logic as the
 * webhook handler — no duplicate mapping code.
 */
export function mapExportRecord(record: any, tenantId: string): any {
  const stId = String(record.id || record.customer_id || "");
  const active = record.active !== false;
  const modifiedOn = record.modifiedOn || record.modified_on || record.updated_at || "";
  const createdOn = record.createdOn || record.created_at || "";

  return {
    customer_id: stId,
    servicetitan_customer_id: stId,
    name: record.name || "",
    customer_type: record.type || "",
    type: record.type || "",
    address: record.address || "",
    city: record.city || "",
    state: record.state || "",
    zip: record.zip || record.zip_code || "",
    email: record.email || "",
    phone: record.phone || "",
    active: active ? "active" : "inactive",
    status: active ? "active" : "inactive",
    tenant_id: tenantId,
    servicetitan_tenant_id: tenantId,
    updated_at: modifiedOn,
    created_at: createdOn,
    event_timestamp: modifiedOn,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export function extractedEventAt(payload: any): string | null {
  return (
    getString(payload, "event_timestamp", "timestamp", "created_at", "updated_at", "occurred_at") ||
    null
  );
}