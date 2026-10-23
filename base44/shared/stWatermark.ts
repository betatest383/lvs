/**
 * ServiceTitan Customer Sync Watermark Management
 *
 * Focused module for watermark lifecycle, counter increments, and stats.
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 *
 * SAFETY: getWatermark THROWS on database errors — callers must handle (fail-closed).
 */

const WATERMARK_KEY = "customer_go_live";
export const RECOVERY_OVERLAP_MINUTES = 5;

/**
 * Get the active watermark for a given tenant and environment.
 * Returns null if no watermark has been established.
 * THROWS on database errors — callers must handle (fail-closed).
 */
export async function getWatermark(
  base44: any,
  tenantId: string,
  environment: string
): Promise<any | null> {
  const results = await base44.asServiceRole.entities.CustomerSyncWatermark.filter(
    { watermark_key: WATERMARK_KEY, tenant_id: tenantId, environment },
    "-created_date",
    1
  );
  return results && results.length > 0 ? results[0] : null;
}

/**
 * Activate the new-customers-only watermark.
 * Idempotent: if already active, returns as-is.
 */
export async function activateWatermark(
  base44: any,
  tenantId: string,
  environment: string,
  userEmail: string
): Promise<any> {
  const existing = await getWatermark(base44, tenantId, environment);

  if (existing && existing.status === "active" && existing.sync_strategy === "new_customers_only") {
    return existing;
  }

  const now = new Date().toISOString();

  if (existing) {
    return await base44.asServiceRole.entities.CustomerSyncWatermark.update(existing.id, {
      sync_strategy: "new_customers_only",
      activation_timestamp: now,
      status: "active",
      created_by: userEmail,
      backfill_status: "never_started",
      backfill_started_at: null,
      backfill_confirmed_by: null,
      recovery_window_status: "idle",
      recovery_window_start: null,
      recovery_window_end: null,
      recovery_window_errors: 0,
    });
  }

  return await base44.asServiceRole.entities.CustomerSyncWatermark.create({
    watermark_key: WATERMARK_KEY,
    sync_strategy: "new_customers_only",
    activation_timestamp: now,
    environment,
    tenant_id: tenantId,
    created_by: userEmail,
    status: "active",
    recovery_overlap_minutes: RECOVERY_OVERLAP_MINUTES,
    recovery_window_status: "idle",
    recovery_window_errors: 0,
    customers_imported_since_activation: 0,
    customers_imported_on_demand: 0,
    webhook_creates_completed: 0,
    webhook_updates_completed: 0,
    webhook_events_skipped_pre_activation: 0,
    webhook_events_deferred: 0,
    webhook_events_failed: 0,
    webhook_duplicate_events_ignored: 0,
    webhook_events_processed: 0,
    recovery_events_processed: 0,
    backfill_status: "never_started",
  });
}

/**
 * Increment watermark counters atomically (read-modify-write).
 * Only call after an operation has succeeded.
 */
export async function incrementWatermarkCounters(
  base44: any,
  watermarkId: string,
  updates: Record<string, number>
): Promise<void> {
  try {
    const current = await base44.asServiceRole.entities.CustomerSyncWatermark.get(watermarkId);
    if (!current) return;

    const updateData: Record<string, any> = {};
    for (const [key, increment] of Object.entries(updates)) {
      updateData[key] = (current[key] || 0) + increment;
    }
    await base44.asServiceRole.entities.CustomerSyncWatermark.update(watermarkId, updateData);
  } catch (err) {
    console.error("[ST WATERMARK] Failed to increment counters:", err);
  }
}

// ─── Watermark Stats ─────────────────────────────────────────────────────────

export interface WatermarkStats {
  watermark: any | null;
  pending_merges_count: number;
  customers_total: number;
  deferred_customers_count: number;
  deferred_dependents_count: number;
  pending_contact_retries_count: number;
}

export async function getWatermarkStats(
  base44: any,
  tenantId: string,
  environment: string
): Promise<WatermarkStats> {
  const watermark = await getWatermark(base44, tenantId, environment);

  let pendingMerges = 0;
  try {
    const pendingResults = await base44.asServiceRole.entities.PendingMerge.filter(
      { status: { $in: ["pending", "in_progress", "failed"] } },
      "-created_date",
      1
    );
    pendingMerges = pendingResults?.length || 0;
  } catch (err) {
    console.error("[ST WATERMARK] Failed to get pending merge count:", err);
  }

  let customersTotal = 0;
  try {
    const customers = await base44.asServiceRole.entities.Customer.filter(
      { servicetitan_sync_status: { $ne: "merged" } },
      "-created_date",
      1
    );
    customersTotal = customers?.length || 0;
  } catch (err) {
    console.error("[ST WATERMARK] Failed to get customer count:", err);
  }

  let deferredCount = 0;
  try {
    const deferred = await base44.asServiceRole.entities.DeferredCustomer.filter(
      { status: "pending" },
      "-created_date",
      1
    );
    deferredCount = deferred?.length || 0;
  } catch (err) {
    console.error("[ST WATERMARK] Failed to get deferred customer count:", err);
  }

  let deferredDependentsCount = 0;
  try {
    const deferredDeps = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
      { status: "pending" },
      "-created_date",
      1
    );
    deferredDependentsCount = deferredDeps?.length || 0;
  } catch (err) {
    console.error("[ST WATERMARK] Failed to get deferred dependent count:", err);
  }

  let pendingContactRetries = 0;
  try {
    const retries = await base44.asServiceRole.entities.ContactSyncRetry.filter(
      { status: "pending" },
      "-created_date",
      1
    );
    pendingContactRetries = retries?.length || 0;
  } catch (err) {
    console.error("[ST WATERMARK] Failed to get contact retry count:", err);
  }

  return {
    watermark,
    pending_merges_count: pendingMerges,
    customers_total: customersTotal,
    deferred_customers_count: deferredCount,
    deferred_dependents_count: deferredDependentsCount,
    pending_contact_retries_count: pendingContactRetries,
  };
}