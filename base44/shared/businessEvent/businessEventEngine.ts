/**
 * Business Event Engine
 *
 * The nervous system of LVC OS. Owns event delivery infrastructure only —
 * no business behavior, no ServiceTitan calls, no domain-specific logic.
 *
 * Capabilities:
 *   - publishEvent        → validate, persist, resolve subscribers, create
 *                           deliveries, dispatch synchronous subscribers.
 *   - processNextDelivery  → claim + dispatch one pending async delivery
 *                           (PRODUCTION selector — used by scheduled processor).
 *   - processDeliveryById → claim + dispatch a SPECIFIC delivery by delivery_id
 *                           (VALIDATION selector — requires validation-run
 *                           authorization, processes only the named delivery).
 *   - dispatchToSubscriber → invoke a registered handler, track result, verify
 *                           committed state.
 *   - replayDelivery      → reset a dead-lettered/failed delivery and re-dispatch.
 *                           Rejects replays of completed deliveries.
 *   - getEventStatus      → read-only event + delivery summary.
 *
 * Idempotency: events are deduplicated by idempotency_key. Replaying the same
 * publish returns the existing event without re-dispatching.
 *
 * Committed-State Verification:
 *   After every delivery update, the record is independently re-fetched and
 *   verified. If the persisted state does not match the expected transition,
 *   the result is flagged as persistence_verification_failed. No in-memory
 *   fallback is ever substituted. The caller MUST treat a
 *   persistence_verification_failed result as a failure.
 *
 * Replay Protection:
 *   replayDelivery rejects completed deliveries. A completed delivery cannot
 *   be replayed, reset, or re-dispatched. This prevents duplicate business
 *   effects from double-replays.
 */

import type {
  BusinessEventRecord,
  BusinessEventDeliveryRecord,
  EventSubscriberRecord,
  EventRegistryRecord,
  PublishEventInput,
} from "./businessEventTypes.ts";
import { validateEvent, validatePayloadStructure } from "./eventRegistryService.ts";
import { getActiveSubscribers } from "./eventSubscriberService.ts";
import {
  getSubscriberHandler,
  type SubscriberHandlerContext,
  type SubscriberHandlerResult,
} from "./subscriberHandlerRegistry.ts";
import {
  buildDeliveryId,
  generateEventId,
  hashPayload,
} from "./eventRetryUtils.ts";
import {
  createDeliveries,
  claimNextDelivery,
  claimDeliveryById,
  updateDeliveryAfterAttempt,
  resetDeliveryForReplay,
  recomputeEventRollup,
  type DeliveryUpdateResult,
} from "./eventDeliveryService.ts";
import {
  verifyValidationRun,
  parseMetadata,
  recordUnrelatedDeliverySelected,
  recordUnrelatedDeliveryMutated,
  recordPersistenceVerificationFailure,
} from "../stage2b/testHarnessGuard.ts";

export interface PublishResult {
  success: boolean;
  duplicate: boolean;
  event_id?: string;
  business_event_id?: string;
  error?: string;
  deliveries?: { subscriber_id: string; subscriber_name: string; status: string }[];
}

/** Instrumentation captured during a test-owned delivery processing step. */
export interface DeliveryProcessingInstrumentation {
  test_run_id: string;
  business_event_id: string;
  delivery_id: string;
  delivery_entity_id: string;
  subscriber_entity_id: string;
  subscriber_id: string;
  handler_reference: string;
  maximum_attempts: number;
  status_before_claim: string;
  claim_result: boolean;
  processing_attempts_after_claim: number;
  handler_found: boolean;
  handler_result_success: boolean | null;
  status_update_payload: Record<string, any>;
  persisted_status_after_update: string;
  status_returned_to_caller: string;
  final_independently_fetched_status: string;
  persistence_verified: boolean;
  persistence_error?: string;
}

export interface ProcessDeliveryByIdResult {
  processed: boolean;
  delivery_id?: string;
  result?: SubscriberHandlerResult;
  delivery?: BusinessEventDeliveryRecord;
  error?: string;
  instrumentation?: DeliveryProcessingInstrumentation;
}

/**
 * Publish a BusinessEvent.
 */
export async function publishEvent(
  base44: any,
  input: PublishEventInput
): Promise<PublishResult> {
  const eventVersion = input.event_version || 1;

  // ── 1. Validate against registry ──
  const validation = await validateEvent(base44, input.event_type, eventVersion);
  if (!validation.valid) {
    return { success: false, duplicate: false, error: validation.error };
  }
  const registry = validation.registry as EventRegistryRecord;

  // ── 2. Validate payload structure ──
  const payloadCheck = validatePayloadStructure(registry, input.payload);
  if (!payloadCheck.valid) {
    return { success: false, duplicate: false, error: payloadCheck.error };
  }

  // ── 3. Idempotency ──
  const payloadStr = JSON.stringify(input.payload ?? {});
  const payloadHash = await hashPayload(payloadStr);
  const eventId = input.event_id || generateEventId();
  const idempotencyKey = input.idempotency_key ||
    (input.source_event_id
      ? `${input.source_system}:${input.source_event_id}`
      : `${input.event_type}:${input.entity_type}:${input.entity_id}:${input.causation_id || eventId}`);

  let existing: any[] = [];
  try {
    existing = await base44.asServiceRole.entities.BusinessEvent.filter(
      { idempotency_key: idempotencyKey },
      "-created_date",
      1
    );
  } catch (err) {
    return { success: false, duplicate: false, error: `Idempotency check failed: ${err}` };
  }
  if (existing.length > 0) {
    return {
      success: true,
      duplicate: true,
      event_id: existing[0].event_id,
      business_event_id: existing[0].id,
    };
  }

  // ── 4. Persist event ──
  const now = new Date().toISOString();
  const occurredAt = input.occurred_at || now;
  let event: BusinessEventRecord;
  try {
    event = await base44.asServiceRole.entities.BusinessEvent.create({
      event_id: eventId,
      idempotency_key: idempotencyKey,
      event_type: input.event_type,
      event_version: eventVersion,
      event_category: registry.category,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      source_system: input.source_system,
      source_event_id: input.source_event_id || "",
      correlation_id: input.correlation_id || "",
      causation_id: input.causation_id || "",
      tenant_id: input.tenant_id || "",
      occurred_at: occurredAt,
      received_at: now,
      published_at: now,
      payload: payloadStr,
      payload_hash: payloadHash,
      metadata: JSON.stringify(input.metadata || {}),
      processing_status: "dispatching",
      processing_attempts: 0,
      replay_count: 0,
      created_by: input.actor || "system",
    });
  } catch (err) {
    return { success: false, duplicate: false, error: `Event persist failed: ${err}` };
  }

  // ── 5. Resolve subscribers ──
  const subscribers = await getActiveSubscribers(base44, input.event_type);

  // ── 6. Create deliveries ──
  const deliveries = await createDeliveries(
    base44,
    { id: event.id, event_id: event.event_id, event_type: event.event_type },
    subscribers
  );

  // ── 7. Dispatch synchronous subscribers immediately ──
  // For test events (validation_run_id in metadata), pass
  // is_validation_authorized=true to the handler context so test-only
  // flags (test_skip_sync, test_skip_hydration) are honored. This is safe
  // because publishEvent is server-side only, and validation_run_id is
  // only set by validation functions that have already verified the VR
  // server-side. Production events have no validation_run_id, so
  // is_validation_authorized is always false/undefined in production.
  const inputMeta = input.metadata || {};
  const isTestEvent = !!inputMeta.validation_run_id;
  const syncDeliveries = deliveries.filter((d) => d.processing_mode === "synchronous");
  for (const delivery of syncDeliveries) {
    const sub = subscribers.find((s) => s.id === delivery.subscriber_id);
    if (!sub) continue;
    await dispatchToSubscriber(base44, event, delivery, sub, {
      actor: input.actor,
      is_validation_authorized: isTestEvent,
      validation_run_id: inputMeta.validation_run_id,
    });
  }

  // ── 8. Recompute rollup ──
  await recomputeEventRollup(base44, event.id);

  return {
    success: true,
    duplicate: false,
    event_id: event.event_id,
    business_event_id: event.id,
    deliveries: deliveries.map((d) => ({
      subscriber_id: d.subscriber_id,
      subscriber_name: d.subscriber_name || "",
      status: d.delivery_status,
    })),
  };
}

/**
 * Dispatch a single delivery to its registered handler. Used both for
 * synchronous dispatch within publishEvent and for async delivery
 * processing. Updates the delivery record with the result.
 *
 * Committed-state verification is performed by updateDeliveryAfterAttempt.
 * The result includes persistence_verified and persistence_error fields.
 */
export async function dispatchToSubscriber(
  base44: any,
  event: BusinessEventRecord,
  delivery: BusinessEventDeliveryRecord,
  subscriber: EventSubscriberRecord,
  context: { actor?: string; isReplay?: boolean; is_validation_authorized?: boolean; validation_run_id?: string }
): Promise<SubscriberHandlerResult> {
  const handler = getSubscriberHandler(subscriber.handler_reference);
  const maxAttempts = subscriber.maximum_attempts || 5;

  if (!handler) {
    const result: SubscriberHandlerResult = {
      success: false,
      summary: `No handler registered for '${subscriber.handler_reference}'`,
      error: `No handler registered for '${subscriber.handler_reference}'`,
      retryable: false,
    };
    const updateResult = await updateDeliveryAfterAttempt(base44, delivery, result, maxAttempts);
    return attachPersistenceStatus(result, updateResult);
  }

  const handlerContext: SubscriberHandlerContext = {
    base44,
    actor: context.actor,
    isReplay: context.isReplay,
    is_validation_authorized: context.is_validation_authorized,
    validation_run_id: context.validation_run_id,
  };

  let result: SubscriberHandlerResult;
  try {
    result = await handler(event, delivery, handlerContext);
  } catch (err) {
    result = {
      success: false,
      summary: `Handler threw: ${err instanceof Error ? err.message : String(err)}`,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }

  const updateResult = await updateDeliveryAfterAttempt(base44, delivery, result, maxAttempts);
  return attachPersistenceStatus(result, updateResult);
}

/**
 * Attach committed-state verification status to a handler result.
 * If persistence verification failed, the result is marked as not successful
 * so the caller cannot treat it as a successful transition.
 */
function attachPersistenceStatus(
  result: SubscriberHandlerResult,
  updateResult: DeliveryUpdateResult
): SubscriberHandlerResult {
  const enriched: SubscriberHandlerResult = {
    ...result,
    persistence_verified: updateResult.persistence_verified,
    persistence_error: updateResult.persistence_error,
    committed_delivery: updateResult.delivery,
  };

  if (!updateResult.persistence_verified) {
    // The delivery state could not be verified — do NOT report success.
    enriched.success = false;
    enriched.summary = `Persistence verification failed: ${updateResult.persistence_error}`;
    enriched.error = updateResult.persistence_error;
    enriched.retryable = true; // Allow retry to attempt the write again
  }

  return enriched;
}

/**
 * Claim and process one pending asynchronous delivery using the PRODUCTION
 * selector. Returns null when no eligible delivery is available.
 * Invoked by the scheduled delivery processor automation.
 */
export async function processNextDelivery(
  base44: any,
  context: { actor?: string }
): Promise<{ processed: boolean; delivery_id?: string; result?: SubscriberHandlerResult; delivery?: BusinessEventDeliveryRecord }> {
  const delivery = await claimNextDelivery(base44);
  if (!delivery) {
    return { processed: false };
  }

  // Fetch the parent event for the handler.
  let event: any = null;
  try {
    event = await base44.asServiceRole.entities.BusinessEvent.get(delivery.business_event_id);
  } catch (err) {
    console.error("[ENGINE] failed to load parent event:", err);
  }
  if (!event) {
    await updateDeliveryAfterAttempt(
      base44,
      delivery,
      { success: false, error: "Parent BusinessEvent not found", retryable: false },
      5
    );
    await recomputeEventRollup(base44, delivery.business_event_id);
    return { processed: true, delivery_id: delivery.delivery_id };
  }

  // Fetch the subscriber record.
  let subscriber: any = null;
  try {
    const subs = await base44.asServiceRole.entities.EventSubscriber.filter(
      { id: delivery.subscriber_id },
      null,
      1
    );
    subscriber = subs[0];
  } catch (err) {
    console.error("[ENGINE] failed to load subscriber:", err);
  }
  if (!subscriber) {
    await updateDeliveryAfterAttempt(
      base44,
      delivery,
      { success: false, error: "Subscriber record not found", retryable: false },
      5
    );
    await recomputeEventRollup(base44, delivery.business_event_id);
    return { processed: true, delivery_id: delivery.delivery_id };
  }

  const result = await dispatchToSubscriber(
    base44,
    event as BusinessEventRecord,
    delivery,
    subscriber as EventSubscriberRecord,
    context
  );

  await recomputeEventRollup(base44, delivery.business_event_id);

  // Re-fetch the delivery to return the committed final state.
  let finalDelivery: BusinessEventDeliveryRecord | null = null;
  try {
    finalDelivery = await base44.asServiceRole.entities.BusinessEventDelivery.get(delivery.id);
  } catch {
    finalDelivery = null;
  }

  return { processed: true, delivery_id: delivery.delivery_id, result, delivery: finalDelivery || undefined };
}

/**
 * Process a SPECIFIC delivery by delivery_id. This is the VALIDATION
 * selector — used by validation functions to process only their own
 * test-owned deliveries without touching unrelated production or historical
 * deliveries.
 *
 * Authorization:
 *   - When validation_run_id + validation_token are provided, the function
 *     verifies the validation run exists, is active, token matches, and has
 *     not expired (server-side verification via verifyValidationRun).
 *   - The delivery's parent event metadata must contain the same
 *     validation_run_id, proving the delivery belongs to this run.
 *   - If the delivery does NOT belong to the validation run, the function
 *     records an "unrelated delivery" counter on the run and returns
 *     { processed: false, error: "delivery does not belong to this validation run" }.
 *
 * This function uses the REAL claim, dispatch, persistence, and rollup
 * lifecycle — same as processNextDelivery. It simply targets a specific
 * delivery instead of the globally oldest one.
 */
export async function processDeliveryById(
  base44: any,
  deliveryId: string,
  context: {
    actor?: string;
    validation_run_id?: string;
    validation_token?: string;
  }
): Promise<ProcessDeliveryByIdResult> {
  const actor = context.actor || "validation";

  // ── 1. Verify validation run (REQUIRED — not optional) ──
  // processDeliveryById is the TEST-ONLY exact-delivery processor.
  // It MUST NOT operate without a valid, active, server-verified
  // ValidationRun. A caller cannot turn an arbitrary delivery ID into a
  // processing override by omitting the VR context.
  //
  // The token is passed directly in the context parameter (server-side
  // function call), NEVER read from persisted event metadata.
  if (!context.validation_run_id || !context.validation_token) {
    return {
      processed: false,
      error: "Missing validation authorization — processDeliveryById requires validation_run_id and validation_token",
    };
  }

  const verification = await verifyValidationRun(
    base44,
    context.validation_run_id,
    context.validation_token
  );
  if (!verification.valid) {
    return {
      processed: false,
      error: `Validation authorization failed: ${verification.error}`,
    };
  }
  const validationRun = verification.run;
  const isValidationAuthorized = true;

  // ── 2. Find the delivery by delivery_id ──
  let delivery: any = null;
  try {
    const results = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { delivery_id: deliveryId },
      null,
      1
    );
    delivery = results[0];
  } catch (err) {
    return { processed: false, error: `Delivery lookup failed: ${err}` };
  }
  if (!delivery) return { processed: false, error: "Delivery not found" };

  // ── 3. Verify the delivery belongs to the validation run ──
  let event: any = null;
  try {
    event = await base44.asServiceRole.entities.BusinessEvent.get(delivery.business_event_id);
  } catch { /* */ }

  // ── 3b. Verify the delivery belongs to the validation run ──
  // The event metadata carries the non-secret validation_run_id.
  // If it doesn't match, this delivery belongs to a different run (or no
  // run) — we record it and refuse BEFORE claiming or mutating.
  if (event) {
    const meta = parseMetadata(event.metadata);
    if (meta?.validation_run_id !== context.validation_run_id) {
      await recordUnrelatedDeliverySelected(base44, context.validation_run_id!);
      return {
        processed: false,
        error: "Delivery does not belong to this validation run — refused to process unrelated delivery",
      };
    }
  }

  if (!event) {
    // Parent event not found — update delivery to dead_letter.
    await updateDeliveryAfterAttempt(
      base44,
      delivery,
      { success: false, error: "Parent BusinessEvent not found", retryable: false },
      5
    );
    await recomputeEventRollup(base44, delivery.business_event_id);
    return { processed: true, delivery_id: delivery.delivery_id, error: "Parent event not found" };
  }

  // ── 4. Check if delivery is in a claimable state ──
  const statusBeforeClaim = delivery.delivery_status;
  if (!["pending", "failed"].includes(statusBeforeClaim)) {
    return {
      processed: false,
      error: `Delivery is in '${statusBeforeClaim}' state, not claimable (only pending/failed can be processed)`,
    };
  }

  // Check retry timing for failed deliveries.
  if (statusBeforeClaim === "failed" && delivery.next_retry_at) {
    if (new Date(delivery.next_retry_at).getTime() > Date.now()) {
      return {
        processed: false,
        error: "Delivery retry not yet due",
      };
    }
  }

  // ── 5. Atomically claim the delivery ──
  const claimResult = await claimDeliveryById(base44, delivery);
  if (!claimResult) {
    return {
      processed: false,
      error: "Claim failed — delivery may have been claimed by another worker",
    };
  }

  // Re-fetch the claimed delivery.
  let claimedDelivery: any = null;
  try {
    claimedDelivery = await base44.asServiceRole.entities.BusinessEventDelivery.get(delivery.id);
  } catch {
    return { processed: false, error: "Failed to re-fetch claimed delivery" };
  }
  if (!claimedDelivery) {
    return { processed: false, error: "Claimed delivery vanished after claim" };
  }

  // ── 6. Fetch the subscriber record ──
  let subscriber: any = null;
  try {
    const subs = await base44.asServiceRole.entities.EventSubscriber.filter(
      { id: delivery.subscriber_id },
      null,
      1
    );
    subscriber = subs[0];
  } catch (err) {
    console.error("[ENGINE] failed to load subscriber:", err);
  }
  if (!subscriber) {
    await updateDeliveryAfterAttempt(
      base44,
      claimedDelivery,
      { success: false, error: "Subscriber record not found", retryable: false },
      5
    );
    await recomputeEventRollup(base44, delivery.business_event_id);
    return { processed: true, delivery_id: delivery.delivery_id, error: "Subscriber record not found" };
  }

  // ── 7. Dispatch to subscriber ──
  // Pass is_validation_authorized=true so the handler can honor test-only
  // flags (test_skip_sync, test_skip_hydration). The token was verified
  // server-side above — it is NOT in event metadata.
  const result = await dispatchToSubscriber(
    base44,
    event as BusinessEventRecord,
    claimedDelivery as BusinessEventDeliveryRecord,
    subscriber as EventSubscriberRecord,
    { actor, is_validation_authorized: isValidationAuthorized, validation_run_id: context.validation_run_id }
  );

  // ── 8. Recompute rollup ──
  await recomputeEventRollup(base44, delivery.business_event_id);

  // ── 9. Independently re-fetch the final delivery state ──
  let finalDelivery: BusinessEventDeliveryRecord | null = null;
  try {
    finalDelivery = await base44.asServiceRole.entities.BusinessEventDelivery.get(delivery.id);
  } catch {
    finalDelivery = null;
  }

  // ── 10. Record persistence verification failure ──
  if (result.persistence_verified === false) {
    await recordPersistenceVerificationFailure(base44, context.validation_run_id!);
  }

  // ── 11. Build instrumentation ──
  const instrumentation: DeliveryProcessingInstrumentation = {
    test_run_id: context.validation_run_id || "none",
    business_event_id: delivery.business_event_id,
    delivery_id: delivery.delivery_id,
    delivery_entity_id: delivery.id,
    subscriber_entity_id: subscriber.id,
    subscriber_id: subscriber.subscriber_id,
    handler_reference: subscriber.handler_reference,
    maximum_attempts: subscriber.maximum_attempts || 5,
    status_before_claim: statusBeforeClaim,
    claim_result: claimResult,
    processing_attempts_after_claim: claimedDelivery.processing_attempts || 0,
    handler_found: getSubscriberHandler(subscriber.handler_reference) !== null,
    handler_result_success: result.success ? true : (result.persistence_verified === false ? null : false),
    status_update_payload: { delivery_status: result.success ? "completed" : (result.retryable === false ? "dead_letter" : "failed") },
    persisted_status_after_update: finalDelivery?.delivery_status || "unknown",
    status_returned_to_caller: result.committed_delivery?.delivery_status || "unknown",
    final_independently_fetched_status: finalDelivery?.delivery_status || "unknown",
    persistence_verified: result.persistence_verified ?? false,
    persistence_error: result.persistence_error,
  };

  return {
    processed: true,
    delivery_id: delivery.delivery_id,
    result,
    delivery: finalDelivery || undefined,
    instrumentation,
  };
}

/**
 * Replay a dead-lettered (or failed) delivery: reset its state, then
 * immediately re-dispatch it.
 *
 * Replay protection:
 *   - Completed deliveries CANNOT be replayed. resetDeliveryForReplay
 *     returns error="already_completed", and this function returns a
 *     canonical no-op result.
 *   - This prevents duplicate business effects from double-replays.
 *   - replay_count is NOT incremented for rejected replays.
 *   - processing_attempts is NOT incremented for rejected replays.
 *   - The handler is NOT invoked for rejected replays.
 */
export async function replayDelivery(
  base44: any,
  deliveryId: string,
  replayedBy: string
): Promise<{ success: boolean; error?: string; result?: SubscriberHandlerResult; skipped?: boolean; skip_reason?: string }> {
  const reset = await resetDeliveryForReplay(base44, deliveryId, replayedBy);

  if (!reset.delivery) {
    return { success: false, error: reset.error || "Delivery not found" };
  }

  // ── Handle already-completed deliveries (canonical no-op) ──
  if (reset.error === "already_completed") {
    return {
      success: true,
      skipped: true,
      skip_reason: "already_completed",
      error: "Delivery is already completed — replay is a no-op",
    };
  }

  // ── Handle invalid state for replay ──
  if (reset.error) {
    return {
      success: false,
      error: reset.error,
    };
  }

  let event: any = null;
  try {
    event = await base44.asServiceRole.entities.BusinessEvent.get(reset.delivery.business_event_id);
  } catch (err) {
    return { success: false, error: `Failed to load event: ${err}` };
  }
  if (!event) {
    return { success: false, error: "Parent BusinessEvent not found" };
  }

  // Check registry allows replay.
  let registry: any = null;
  try {
    const regResults = await base44.asServiceRole.entities.EventRegistry.filter(
      { event_type: event.event_type },
      null,
      1
    );
    registry = regResults[0];
  } catch { /* non-critical */ }

  if (registry && registry.allows_replay === false) {
    await updateDeliveryAfterAttempt(
      base44,
      reset.delivery,
      { success: false, error: "Replay not allowed for this event type", retryable: false },
      5
    );
    return { success: false, error: "Replay not allowed for this event type" };
  }

  let subscriber: any = null;
  try {
    const subs = await base44.asServiceRole.entities.EventSubscriber.filter(
      { id: reset.delivery.subscriber_id },
      null,
      1
    );
    subscriber = subs[0];
  } catch (err) {
    return { success: false, error: `Failed to load subscriber: ${err}` };
  }
  if (!subscriber) {
    await updateDeliveryAfterAttempt(
      base44,
      reset.delivery,
      { success: false, error: "Subscriber record not found", retryable: false },
      5
    );
    await recomputeEventRollup(base44, reset.delivery.business_event_id);
    return { success: false, error: "Subscriber record not found" };
  }

  const result = await dispatchToSubscriber(
    base44,
    event as BusinessEventRecord,
    reset.delivery,
    subscriber as EventSubscriberRecord,
    { actor: replayedBy, isReplay: true }
  );

  await recomputeEventRollup(base44, reset.delivery.business_event_id);
  return { success: result.success, result };
}

/** Read-only event status summary including delivery breakdown. */
export async function getEventStatus(
  base44: any,
  businessEventId: string
): Promise<{ event: BusinessEventRecord | null; deliveries: BusinessEventDeliveryRecord[] }> {
  let event: any = null;
  let deliveries: any[] = [];
  try {
    event = await base44.asServiceRole.entities.BusinessEvent.get(businessEventId);
  } catch { /* not found */ }
  try {
    deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { business_event_id: businessEventId },
      "priority",
      200
    );
  } catch { /* empty */ }
  return { event: event as BusinessEventRecord, deliveries: deliveries as BusinessEventDeliveryRecord[] };
}