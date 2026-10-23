/**
 * Validation Harness Utils (Stage 2A / 2B-A / 2C / Cross-Entity)
 *
 * Shared utility functions used by all validation functions.
 *
 * drainPendingDeliveries (the regex-based drain) has been REMOVED.
 * Validation functions MUST use processTestDelivery or
 * processEventDeliveries instead, which:
 *   - accept exact event/delivery IDs created by the test;
 *   - require an active authorized validation context;
 *   - never fall back to the global queue selector;
 *   - never use regex-based metadata matching.
 *
 * Authorization model:
 *   - The validation function creates a ValidationRun server-side and holds
 *     the run_token in its local variable (server-side memory).
 *   - The run_token is passed directly to these functions as a parameter —
 *     it is NEVER placed in persisted event metadata.
 *   - Event metadata carries ONLY the non-secret validation_run_id for
 *     ownership tracking.
 */

import { processDeliveryById } from "../businessEvent/businessEventEngine.ts";
import type { BusinessEventDeliveryRecord } from "../businessEvent/businessEventTypes.ts";

/**
 * Process all pending/failed deliveries belonging to a specific
 * BusinessEvent. Each delivery is processed individually via
 * processDeliveryById, which:
 *   - Verifies the delivery belongs to the validation run (REQUIRED)
 *   - Claims it atomically
 *   - Dispatches the handler
 *   - Verifies committed state
 *   - Recomputes the event rollup
 *
 * This function NEVER processes unrelated deliveries — it targets deliveries
 * by their parent event ID, which is test-owned.
 */
export async function processEventDeliveries(
  base44: any,
  businessEventId: string,
  validationRunId: string,
  validationToken: string,
  actor: string
): Promise<{ processed: number; results: any[] }> {
  let deliveries: any[] = [];
  try {
    deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { business_event_id: businessEventId },
      null,
      20
    );
  } catch {
    return { processed: 0, results: [] };
  }

  const results: any[] = [];
  for (const d of deliveries) {
    if (d.delivery_status === "pending" || d.delivery_status === "failed") {
      // For failed deliveries, check retry timing.
      if (d.delivery_status === "failed" && d.next_retry_at) {
        if (new Date(d.next_retry_at).getTime() > Date.now()) {
          continue; // Not yet due for retry.
        }
      }
      const result = await processDeliveryById(base44, d.delivery_id, {
        actor,
        validation_run_id: validationRunId,
        validation_token: validationToken,
      });
      results.push(result);
    }
  }

  return { processed: results.length, results };
}

/**
 * Process a specific delivery by event ID and subscriber ID.
 * Convenience wrapper around processDeliveryById.
 */
export async function processTestDelivery(
  base44: any,
  businessEventId: string,
  subscriberId: string,
  validationRunId: string,
  validationToken: string,
  actor: string
): Promise<any> {
  let deliveries: any[] = [];
  try {
    deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { business_event_id: businessEventId, subscriber_id: subscriberId },
      null,
      1
    );
  } catch {
    return { processed: false, error: "Delivery lookup failed" };
  }
  if (deliveries.length === 0) {
    return { processed: false, error: "Delivery not found" };
  }
  const delivery = deliveries[0];

  // For failed deliveries, force retry timing to be due.
  if (delivery.delivery_status === "failed" && delivery.next_retry_at) {
    if (new Date(delivery.next_retry_at).getTime() > Date.now()) {
      await base44.asServiceRole.entities.BusinessEventDelivery.update(delivery.id, {
        next_retry_at: new Date(Date.now() - 1000).toISOString(),
      });
    }
  }

  return await processDeliveryById(base44, delivery.delivery_id, {
    actor,
    validation_run_id: validationRunId,
    validation_token: validationToken,
  });
}

/**
 * Ensure EventRegistry entries exist for the given event types.
 */
export async function ensureEventRegistry(base44: any, actor: string, eventTypes: any[]): Promise<void> {
  const now = new Date().toISOString();
  for (const et of eventTypes) {
    try {
      const existing = await base44.asServiceRole.entities.EventRegistry.filter({ event_type: et.event_type }, null, 1);
      if (existing.length === 0) {
        await base44.asServiceRole.entities.EventRegistry.create({
          ...et,
          description: `Published when a ${et.entity_type} is ${et.event_type.split(".")[1]}.`,
          current_version: 1,
          schema_definition: "",
          is_active: true,
          allows_replay: true,
          default_processing_mode: "asynchronous",
          default_retry_policy: "bounded",
          activation_date: now,
          created_by: actor,
        });
      }
    } catch { /* ignore */ }
  }
}

/**
 * Ensure EventSubscriber records exist for the given subscriber definitions.
 */
export async function ensureEventSubscribers(base44: any, actor: string, subscribers: any[]): Promise<void> {
  const now = new Date().toISOString();
  for (const sub of subscribers) {
    try {
      const found = await base44.asServiceRole.entities.EventSubscriber.filter({ subscriber_id: sub.subscriber_id }, null, 1);
      if (found.length === 0) {
        await base44.asServiceRole.entities.EventSubscriber.create({
          ...sub,
          is_active: true,
          retry_policy: "bounded",
          maximum_attempts: 5,
          timeout_seconds: 30,
          activation_date: now,
          created_by: actor,
        });
      }
    } catch { /* ignore */ }
  }
}

/**
 * Create a simple test tracker.
 */
export function createTestTracker() {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;

  const track = (name: string, passed_: boolean, expected: string, actual: string, failure_reason = "") => {
    results.push({ name, passed: passed_, expected, actual, failure_reason });
    if (passed_) passed++; else failed++;
  };

  return {
    results,
    passed,
    failed,
    track,
    getSummary: () => ({
      tests_total: results.length,
      tests_passed: passed,
      tests_failed: failed,
      all_passed: failed === 0,
      failed_tests: results.filter((r) => !r.passed),
      results,
    }),
  };
}