/**
 * Event Delivery Service
 *
 * Creates, claims, updates, and aggregates per-subscriber delivery records.
 * Each BusinessEvent→Subscriber pair gets its own delivery record so that one
 * subscriber's failure never incorrectly marks the whole event as failed.
 *
 * Committed-State Verification:
 *   updateDeliveryAfterAttempt performs an independent re-fetch after every
 *   write and verifies the persisted status matches the expected transition.
 *   If the re-fetch fails, returns null, or returns a stale/mismatched status,
 *   the result is flagged as persistence_verification_failed.
 *   No in-memory fallback is ever substituted.
 */

import type {
  BusinessEventDeliveryRecord,
  EventSubscriberRecord,
} from "./businessEventTypes.ts";
import {
  buildDeliveryId,
  calculateNextDeliveryRetry,
  generateDeliveryClaimId,
  isDeliveryStale,
  MAX_DELIVERY_RETRIES,
} from "./eventRetryUtils.ts";

/** Result of a delivery update attempt, including committed-state verification. */
export interface DeliveryUpdateResult {
  delivery: BusinessEventDeliveryRecord;
  persistence_verified: boolean;
  persistence_error?: string;
}

/** Create a delivery record for each resolved subscriber of an event. */
export async function createDeliveries(
  base44: any,
  event: { id: string; event_id: string; event_type: string },
  subscribers: EventSubscriberRecord[]
): Promise<BusinessEventDeliveryRecord[]> {
  const created: BusinessEventDeliveryRecord[] = [];
  for (const sub of subscribers) {
    const deliveryId = buildDeliveryId(event.id, sub.id);
    const record: any = {
      delivery_id: deliveryId,
      business_event_id: event.id,
      subscriber_id: sub.id,
      subscriber_name: sub.subscriber_name,
      event_type: event.event_type,
      delivery_status: "pending",
      processing_mode: sub.processing_mode,
      processing_attempts: 0,
      replay_count: 0,
    };
    try {
      const saved = await base44.asServiceRole.entities.BusinessEventDelivery.create(record);
      created.push(saved as BusinessEventDeliveryRecord);
    } catch (err) {
      console.error("[DELIVERY] create failed:", err);
    }
  }
  return created;
}

/**
 * Atomically claim one pending async delivery for processing.
 * Uses updateMany with a conditional filter so only one concurrent worker
 * can win the claim. Returns the claimed delivery or null if none available.
 *
 * This is the PRODUCTION selector — used by the scheduled delivery processor.
 * Validation functions use processDeliveryById instead, which targets a
 * specific delivery by ID and requires validation-run authorization.
 */
export async function claimNextDelivery(
  base44: any
): Promise<BusinessEventDeliveryRecord | null> {
  const now = new Date().toISOString();

  // Find candidate deliveries: asynchronous + pending (no retry scheduled yet).
  let pendingCandidates: any[] = [];
  try {
    pendingCandidates = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { delivery_status: "pending", processing_mode: "asynchronous" },
      "created_date",
      50
    );
  } catch (err) {
    console.error("[DELIVERY] claim query (pending) failed:", err);
  }

  // Also find FAILED deliveries whose next_retry_at has arrived.
  let failedCandidates: any[] = [];
  try {
    failedCandidates = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { delivery_status: "failed", processing_mode: "asynchronous" },
      "created_date",
      50
    );
  } catch (err) {
    console.error("[DELIVERY] claim query (failed) failed:", err);
  }

  const eligiblePending = (pendingCandidates as BusinessEventDeliveryRecord[]).filter((d) => {
    if (d.next_retry_at && new Date(d.next_retry_at).getTime() > Date.now()) {
      return false;
    }
    return true;
  });

  const eligibleFailed = (failedCandidates as BusinessEventDeliveryRecord[]).filter((d) => {
    if (!d.next_retry_at) return true;
    return new Date(d.next_retry_at).getTime() <= Date.now();
  });

  // Also recover stale "processing" deliveries.
  const staleCandidates = await findStaleProcessingDeliveries(base44);

  const target = eligiblePending[0] || eligibleFailed[0] || staleCandidates[0];
  if (!target) return null;

  const claimed = await claimDeliveryById(base44, target);
  if (!claimed) return null;

  // Re-fetch the claimed record to return current state.
  try {
    const fresh = await base44.asServiceRole.entities.BusinessEventDelivery.get(target.id);
    return fresh as BusinessEventDeliveryRecord;
  } catch {
    return null;
  }
}

/**
 * Atomically claim a specific delivery record. Uses updateMany with a
 * conditional filter on (id, delivery_status) so only one concurrent worker
 * can win the claim.
 *
 * Returns true if the claim succeeded, false otherwise.
 */
export async function claimDeliveryById(
  base44: any,
  delivery: BusinessEventDeliveryRecord
): Promise<boolean> {
  const now = new Date().toISOString();
  const claimId = generateDeliveryClaimId();
  const attempts = (delivery.processing_attempts || 0) + 1;

  const claimResult = await base44.asServiceRole.entities.BusinessEventDelivery.updateMany(
    { id: delivery.id, delivery_status: delivery.delivery_status },
    {
      $set: {
        delivery_status: "processing",
        processing_attempts: attempts,
        processing_claim_id: claimId,
        processing_started_at: now,
        last_error: null,
        processing_recovered_at: delivery.delivery_status === "processing" ? now : undefined,
      },
    }
  );

  return !!(claimResult && (claimResult.modified_count > 0 || claimResult.updated > 0));
}

async function findStaleProcessingDeliveries(
  base44: any
): Promise<BusinessEventDeliveryRecord[]> {
  try {
    const processing = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { delivery_status: "processing", processing_mode: "asynchronous" },
      "created_date",
      50
    );
    return (processing as BusinessEventDeliveryRecord[]).filter((d) => isDeliveryStale(d));
  } catch {
    return [];
  }
}

/**
 * Update a delivery record after a dispatch attempt.
 *
 * Committed-State Verification:
 *   1. Write the update to the database.
 *   2. Independently re-fetch the record.
 *   3. Verify the persisted status matches the expected transition.
 *   4. If the write fails, re-fetch fails, re-fetch returns null, or the
 *      persisted status does not match → return persistence_verified=false
 *      with a specific error category.
 *   5. NO in-memory fallback is ever used.
 *
 * Error categories:
 *   - write_failure: the database write threw an exception
 *   - refetch_failure: the independent re-fetch threw an exception
 *   - refetch_returned_null: the re-fetch returned null (record vanished)
 *   - stale_state: the re-fetch returned a status different from expected
 */
export async function updateDeliveryAfterAttempt(
  base44: any,
  delivery: BusinessEventDeliveryRecord,
  result: { success: boolean; error?: string; retryable?: boolean; output?: Record<string, any>; summary?: string },
  maxAttempts: number
): Promise<DeliveryUpdateResult> {
  const now = new Date().toISOString();
  const attempts = (delivery.processing_attempts || 0);

  let expectedStatus: string;
  let update: any;

  if (result.success) {
    expectedStatus = "completed";
    update = {
      delivery_status: "completed",
      completed_at: now,
      last_attempt_at: now,
      first_attempt_at: delivery.first_attempt_at || now,
      next_retry_at: null,
      last_error: null,
      output_metadata: result.output ? JSON.stringify(result.output) : undefined,
    };
  } else if (result.retryable === false || attempts >= maxAttempts) {
    expectedStatus = "dead_letter";
    update = {
      delivery_status: "dead_letter",
      last_attempt_at: now,
      first_attempt_at: delivery.first_attempt_at || now,
      next_retry_at: null,
      last_error: result.error || result.summary || "Unknown error",
      dead_lettered_at: now,
      output_metadata: result.output ? JSON.stringify(result.output) : undefined,
    };
  } else {
    expectedStatus = "failed";
    const nextRetry = calculateNextDeliveryRetry(attempts);
    update = {
      delivery_status: "failed",
      last_attempt_at: now,
      first_attempt_at: delivery.first_attempt_at || now,
      next_retry_at: nextRetry,
      last_error: result.error || result.summary || "Unknown error",
      output_metadata: result.output ? JSON.stringify(result.output) : undefined,
    };
  }

  // ── 1. Write the update ──
  try {
    await base44.asServiceRole.entities.BusinessEventDelivery.update(delivery.id, update);
  } catch (err) {
    // Write failure — the delivery remains in "processing" state.
    // Return the delivery as-is (still "processing") with a write_failure error.
    return {
      delivery: { ...delivery, delivery_status: "processing" } as BusinessEventDeliveryRecord,
      persistence_verified: false,
      persistence_error: `write_failure: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── 2. Independently re-fetch the record ──
  let fresh: any = null;
  try {
    fresh = await base44.asServiceRole.entities.BusinessEventDelivery.get(delivery.id);
  } catch (err) {
    return {
      delivery: { ...delivery, delivery_status: "processing" } as BusinessEventDeliveryRecord,
      persistence_verified: false,
      persistence_error: `refetch_failure: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── 3. Verify the persisted record exists ──
  if (!fresh) {
    return {
      delivery: { ...delivery, delivery_status: "processing" } as BusinessEventDeliveryRecord,
      persistence_verified: false,
      persistence_error: "refetch_returned_null: delivery record not found after update",
    };
  }

  // ── 4. Verify the persisted status matches the expected transition ──
  if (fresh.delivery_status !== expectedStatus) {
    return {
      delivery: fresh as BusinessEventDeliveryRecord,
      persistence_verified: false,
      persistence_error: `stale_state: expected '${expectedStatus}', got '${fresh.delivery_status}'`,
    };
  }

  // ── 5. Committed-state verified ──
  return {
    delivery: fresh as BusinessEventDeliveryRecord,
    persistence_verified: true,
  };
}

/**
 * Reset a dead-lettered (or failed) delivery for replay.
 *
 * Returns { delivery, error } where error indicates why the reset was
 * rejected (e.g. "already_completed" or "invalid_state_for_replay").
 *
 * Replay protection:
 *   - Completed deliveries CANNOT be replayed — returns error="already_completed".
 *   - Only "dead_letter" and "failed" deliveries can be replayed.
 *   - This prevents duplicate business effects from double-replays.
 */
export async function resetDeliveryForReplay(
  base44: any,
  deliveryId: string,
  replayedBy: string
): Promise<{ delivery: BusinessEventDeliveryRecord | null; error?: string }> {
  let delivery: any = null;
  try {
    const results = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { delivery_id: deliveryId },
      null,
      1
    );
    delivery = results[0];
  } catch (err) {
    return { delivery: null, error: `Delivery lookup failed: ${err}` };
  }
  if (!delivery) return { delivery: null, error: "Delivery not found" };

  // ── Replay protection: reject completed deliveries ──
  if (delivery.delivery_status === "completed") {
    return {
      delivery: delivery as BusinessEventDeliveryRecord,
      error: "already_completed",
    };
  }

  // Only dead_letter and failed deliveries can be replayed.
  if (!["dead_letter", "failed"].includes(delivery.delivery_status)) {
    return {
      delivery: delivery as BusinessEventDeliveryRecord,
      error: `invalid_state_for_replay: ${delivery.delivery_status}`,
    };
  }

  const now = new Date().toISOString();
  const update: any = {
    delivery_status: "pending",
    next_retry_at: null,
    last_error: null,
    dead_lettered_at: null,
    processing_claim_id: null,
    processing_started_at: null,
    replay_count: (delivery.replay_count || 0) + 1,
    last_replayed_at: now,
    last_replayed_by: replayedBy,
  };
  await base44.asServiceRole.entities.BusinessEventDelivery.update(delivery.id, update);
  return { delivery: { ...delivery, ...update } as BusinessEventDeliveryRecord };
}

/**
 * Recompute the rollup processing_status of a BusinessEvent from its
 * deliveries. An event is "processed" only when every delivery reaches a
 * terminal state (completed, dead_letter, or skipped).
 */
export async function recomputeEventRollup(
  base44: any,
  businessEventId: string
): Promise<{ status: string; nextRetryAt: string | null; attempts: number; deadLetteredAt: string | null }> {
  let deliveries: any[] = [];
  try {
    deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { business_event_id: businessEventId },
      null,
      200
    );
  } catch (err) {
    console.error("[DELIVERY] rollup query failed:", err);
    return { status: "failed", nextRetryAt: null, attempts: 0, deadLetteredAt: null };
  }

  if (deliveries.length === 0) {
    await base44.asServiceRole.entities.BusinessEvent.update(businessEventId, {
      processing_status: "processed",
      next_retry_at: null,
    });
    return { status: "processed", nextRetryAt: null, attempts: 0, deadLetteredAt: null };
  }

  const terminal = ["completed", "dead_letter", "skipped"];
  const allTerminal = deliveries.every((d) => terminal.includes(d.delivery_status));
  const anyFailed = deliveries.some((d) => d.delivery_status === "failed");
  const anyDeadLetter = deliveries.some((d) => d.delivery_status === "dead_letter");
  const anyProcessing = deliveries.some(
    (d) => d.delivery_status === "processing" || d.delivery_status === "pending" || d.delivery_status === "delivered"
  );

  let status: string;
  if (allTerminal) {
    status = "processed";
  } else if (anyFailed) {
    status = "failed";
  } else if (anyProcessing) {
    status = "dispatching";
  } else {
    status = "dispatching";
  }

  const pendingRetries = deliveries
    .filter((d) => d.delivery_status === "failed" && d.next_retry_at)
    .map((d) => new Date(d.next_retry_at).getTime())
    .filter((t) => !isNaN(t));
  const nextRetryAt = pendingRetries.length > 0
    ? new Date(Math.min(...pendingRetries)).toISOString()
    : null;

  const totalAttempts = deliveries.reduce((sum, d) => sum + (d.processing_attempts || 0), 0);
  const deadLetteredAt = anyDeadLetter ? new Date().toISOString() : null;

  const lastError = deliveries
    .filter((d) => d.last_error)
    .map((d) => d.last_error)
    .slice(-1)[0] || null;

  await base44.asServiceRole.entities.BusinessEvent.update(businessEventId, {
    processing_status: status,
    processing_attempts: totalAttempts,
    next_retry_at: nextRetryAt,
    dead_lettered_at: deadLetteredAt,
    last_error: lastError,
  });

  return { status, nextRetryAt, attempts: totalAttempts, deadLetteredAt };
}

export { MAX_DELIVERY_RETRIES };