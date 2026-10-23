/**
 * ServiceTitan Deferred Customer Management
 *
 * Manages durable DeferredCustomer records for customers that could not be
 * imported due to missing createdOn, watermark errors, hydration failures, etc.
 *
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 *
 * Idempotency: Uses deterministic deferred_key (st_customer_id:deferred)
 * to prevent duplicate deferred records.
 */

/**
 * Create or update a deferred customer record.
 * Idempotent: if a pending deferred record already exists, increments attempt_count.
 */
export async function createDeferredCustomer(
  base44: any,
  stCustomerId: string,
  reason: string,
  source: string,
  tenantId: string,
  environment: string,
  webhookEventId: string | undefined,
  payloadSnapshot: any,
  error?: string
): Promise<{ created: boolean; id?: string }> {
  const deferredKey = `${stCustomerId}:deferred`;
  const now = new Date().toISOString();

  try {
    const existing = await base44.asServiceRole.entities.DeferredCustomer.filter(
      { deferred_key: deferredKey, status: "pending" },
      "-created_date",
      1
    );

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.DeferredCustomer.update(existing[0].id, {
        attempt_count: (existing[0].attempt_count || 0) + 1,
        last_attempted_at: now,
        last_error: error || existing[0].last_error || "",
        deferred_reason: reason as any,
      });
      return { created: false, id: existing[0].id };
    }

    const created = await base44.asServiceRole.entities.DeferredCustomer.create({
      deferred_key: deferredKey,
      servicetitan_customer_id: stCustomerId,
      deferred_reason: reason as any,
      deferred_source: source as any,
      tenant_id: tenantId,
      environment,
      webhook_event_id: webhookEventId || "",
      payload_snapshot_json: JSON.stringify(payloadSnapshot || {}),
      status: "pending",
      attempt_count: 1,
      max_attempts: 10,
      last_attempted_at: now,
      last_error: error || "",
      first_detected_at: now,
      requires_admin_review: false,
    });

    return { created: true, id: created.id };
  } catch (err) {
    console.error("[ST DEFERRED CUST] Failed to create deferred customer:", err);
    return { created: false };
  }
}

/**
 * Resolve all pending deferred customer records for a given ST customer ID.
 * Called after a customer is successfully imported.
 */
export async function resolveDeferredCustomer(
  base44: any,
  stCustomerId: string,
  localCustomerId: string
): Promise<void> {
  try {
    const pending = await base44.asServiceRole.entities.DeferredCustomer.filter(
      { servicetitan_customer_id: stCustomerId, status: "pending" },
      "-created_date",
      50
    );
    const now = new Date().toISOString();
    for (const d of pending) {
      await base44.asServiceRole.entities.DeferredCustomer.update(d.id, {
        status: "resolved",
        resolved_at: now,
        resolved_customer_id: localCustomerId,
      });
    }
  } catch (err) {
    console.error("[ST DEFERRED CUST] Failed to resolve deferred customer:", err);
  }
}