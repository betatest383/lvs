/**
 * ServiceTitan On-Demand Customer Hydration
 *
 * Hydrates a single ServiceTitan customer on demand when a dependent record
 * (job, appointment, estimate, invoice, membership, project) references a
 * customer that does not exist locally.
 *
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 *
 * Contact sync: Contacts are supplementary — if sync fails, the customer is
 * still created but marked with contact_sync_status = "failed" or "partial".
 * A durable ContactSyncRetry record is created for later retry.
 */

import { apiRequest, retryWithBackoff } from "./stAuth.ts";
import { extractCustomerData, buildSyncUpdateData, findLocalCustomer, mapExportRecord, getString } from "./stCustomerMapping.ts";
import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import { syncContacts } from "./stCustomerApiSync.ts";
import { incrementWatermarkCounters } from "./stWatermark.ts";
import { resolveDeferredCustomer } from "./stDeferredCustomer.ts";

export interface HydrationResult {
  action: "created" | "already_exists" | "not_found" | "error" | "deferred";
  servicetitan_customer_id: string;
  local_customer_id?: string;
  contacts_synced?: number;
  contacts_failed?: number;
  contact_sync_status?: string;
  summary: string;
}

/**
 * Fetch a single customer by ID from the ServiceTitan transactional API.
 * Returns null on 404 or error.
 */
export async function fetchCustomerById(
  environment: string,
  tenantId: string,
  stCustomerId: string
): Promise<any | null> {
  const path = `/crm/v2/tenant/${tenantId}/customers/${stCustomerId}`;
  try {
    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, environment, {});
    });
    return result.data || result;
  } catch (err: any) {
    console.error(`[ST HYDRATION] fetchCustomerById failed for '${stCustomerId}':`, err.message);
    return null;
  }
}

/**
 * Hydrate a single ServiceTitan customer on demand.
 *
 * Called when a job, appointment, estimate, invoice, or other synchronized
 * record references a ServiceTitan customer that does not exist locally.
 *
 * Idempotent: if the customer already exists locally, returns "already_exists".
 * Contact sync is supplementary — failure does NOT delete the customer, but
 * marks it with contact_sync_status = "failed" and creates a retry record.
 */
export async function hydrateCustomerOnDemand(
  base44: any,
  environment: string,
  tenantId: string,
  stCustomerId: string,
  watermark: any | null
): Promise<HydrationResult> {
  if (!stCustomerId) {
    return { action: "not_found", servicetitan_customer_id: "", summary: "No customer ID provided" };
  }

  // Idempotency: check if customer already exists locally
  const existing = await findLocalCustomer(base44, stCustomerId);
  if (existing) {
    return {
      action: "already_exists",
      servicetitan_customer_id: stCustomerId,
      local_customer_id: existing.id,
      summary: `Customer '${stCustomerId}' already exists locally`,
    };
  }

  // Fetch from ServiceTitan
  const stCustomer = await fetchCustomerById(environment, tenantId, stCustomerId);
  if (!stCustomer) {
    return {
      action: "not_found",
      servicetitan_customer_id: stCustomerId,
      summary: `Customer '${stCustomerId}' not found in ServiceTitan`,
    };
  }

  // Extract and build update data
  const payload = mapExportRecord(stCustomer, tenantId);
  const extracted = extractCustomerData(payload, { object_id: stCustomerId, tenant_id: tenantId });

  if (!extracted.servicetitan_customer_id || !extracted.name) {
    return {
      action: "error",
      servicetitan_customer_id: stCustomerId,
      summary: `Customer '${stCustomerId}' has insufficient data (missing ID or name)`,
    };
  }

  const now = new Date().toISOString();
  const updateData = buildSyncUpdateData(extracted, "on_demand_hydration", "api");
  updateData.servicetitan_sync_version = 1;
  updateData.import_source = "on_demand_hydration";
  updateData.imported_at = now;
  updateData.contact_sync_status = "pending";

  let createdCustomerId: string;
  try {
    const created = await base44.asServiceRole.entities.Customer.create(updateData);
    createdCustomerId = created.id;
  } catch (err: any) {
    return {
      action: "error",
      servicetitan_customer_id: stCustomerId,
      summary: `Hydration failed (create): ${err.message}`,
    };
  }

  // ── Supplementary contact sync ──
  // If contact sync fails, the customer is still created (contacts are supplementary),
  // but we mark contact_sync_status and create a retry record.
  let contactsSynced = 0;
  let contactsFailed = 0;
  let contactSyncStatus = "complete";

  try {
    const contactResult = await syncContacts(base44, [stCustomerId], environment, tenantId);
    contactsSynced = contactResult.synced || 0;
    contactsFailed = contactResult.failed || 0;

    if (contactsFailed > 0 && contactsSynced > 0) {
      contactSyncStatus = "partial";
    } else if (contactsFailed > 0) {
      contactSyncStatus = "failed";
    }
  } catch (err: any) {
    console.error(`[ST HYDRATION] Contact sync failed during hydration for '${stCustomerId}':`, err.message);
    contactsFailed = 1;
    contactSyncStatus = "failed";
  }

  // Update customer with contact_sync_status
  try {
    await base44.asServiceRole.entities.Customer.update(createdCustomerId, {
      contact_sync_status: contactSyncStatus,
      contact_last_synced_at: new Date().toISOString(),
      contact_sync_attempt_count: 1,
    });
  } catch (err) {
    console.error(`[ST HYDRATION] Failed to set contact_sync_status for '${stCustomerId}':`, err.message);
  }

  // Create contact retry record if needed
  if (contactsFailed > 0) {
    await createContactSyncRetry(
      base44, stCustomerId, createdCustomerId, tenantId, environment, "hydration",
      `Contact sync failed during on-demand hydration: ${contactsFailed} contact(s) failed`
    );
  }

  // Update watermark counter
  if (watermark) {
    await incrementWatermarkCounters(base44, watermark.id, {
      customers_imported_on_demand: 1,
    });
  }

  // Resolve any pending deferred records for this customer
  await resolveDeferredCustomer(base44, stCustomerId, createdCustomerId);

  await addTimelineEntry(
    base44,
    `on-demand-${Date.now()}`,
    TIMELINE_STAGES.HANDLER_FINISHED,
    `Customer hydrated on demand (${createdCustomerId}) for ST customer '${stCustomerId}'. Contacts: ${contactsSynced} synced, ${contactsFailed} failed. Contact status: ${contactSyncStatus}.`,
    contactsFailed > 0 ? "warning" : "success",
    undefined,
    {
      sync_action: "on_demand_hydration",
      servicetitan_customer_id: stCustomerId,
      local_customer_id: createdCustomerId,
      customer_name: extracted.name,
      contacts_synced: contactsSynced,
      contacts_failed: contactsFailed,
      contact_sync_status: contactSyncStatus,
    }
  );

  return {
    action: "created",
    servicetitan_customer_id: stCustomerId,
    local_customer_id: createdCustomerId,
    contacts_synced: contactsSynced,
    contacts_failed: contactsFailed,
    contact_sync_status: contactSyncStatus,
    summary: `Customer '${extracted.name}' (${stCustomerId}) hydrated on demand. Contacts: ${contactsSynced} synced, ${contactsFailed} failed. Contact status: ${contactSyncStatus}.`,
  };
}

// ─── Contact Sync Retry Helper ────────────────────────────────────────────────

/**
 * Create or update a durable ContactSyncRetry record for a customer whose
 * contact synchronization failed.
 * Idempotent: uses retry_key = st_customer_id:contact_retry.
 */
export async function createContactSyncRetry(
  base44: any,
  stCustomerId: string,
  localCustomerId: string,
  tenantId: string,
  environment: string,
  source: string,
  error: string
): Promise<void> {
  const retryKey = `${stCustomerId}:contact_retry`;
  const now = new Date().toISOString();

  try {
    const existing = await base44.asServiceRole.entities.ContactSyncRetry.filter(
      { retry_key: retryKey, status: "pending" },
      "-created_date",
      1
    );

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.ContactSyncRetry.update(existing[0].id, {
        attempt_count: (existing[0].attempt_count || 0) + 1,
        last_attempted_at: now,
        last_error: error,
      });
      return;
    }

    await base44.asServiceRole.entities.ContactSyncRetry.create({
      retry_key: retryKey,
      servicetitan_customer_id: stCustomerId,
      local_customer_id: localCustomerId,
      tenant_id: tenantId,
      environment,
      status: "pending",
      source: source as any,
      attempt_count: 1,
      max_attempts: 10,
      last_attempted_at: now,
      last_error: error,
      first_detected_at: now,
      requires_admin_review: false,
    });
  } catch (err) {
    console.error("[ST HYDRATION] Failed to create contact sync retry record:", err);
  }
}