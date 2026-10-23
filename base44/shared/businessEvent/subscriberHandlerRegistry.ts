/**
 * Subscriber Handler Registry
 *
 * In-code registry mapping a handler_reference string (declared on an
 * EventSubscriber record) to the actual handler function implementation.
 *
 * Design boundary:
 *   - The Business Event Engine is generic and never hardcodes specific
 *     subscriber implementations.
 *   - EventSubscriber records (data) are the source of truth for which
 *     subscribers are active, their priority, retry policy, etc.
 *   - This registry provides the implementation lookup only.
 *
 * Registering a new subscriber = (1) register the handler function here or in
 * a consuming module, (2) create an EventSubscriber record referencing the
 * same handler_reference. Stage 2A uses isolated test handlers only — no
 * production Customer/Job/Appointment sync services are registered.
 */

import type { BusinessEventRecord, BusinessEventDeliveryRecord } from "./businessEventTypes.ts";

export interface SubscriberHandlerContext {
  base44: any;
  actor?: string;
  /** Whether this dispatch was triggered by a replay. */
  isReplay?: boolean;
  /**
   * True ONLY when processDeliveryById verified an active ValidationRun
   * server-side (run exists, token matched, not expired) before dispatching.
   *
   * This flag is set by the engine — never by event metadata. Handlers
   * check this to decide whether to honor test-only flags (test_skip_sync,
   * test_skip_hydration). The authorization secret (run_token) never
   * enters persisted event metadata — it stays in the validation
   * function's server-side context and is passed directly to
   * processDeliveryById as a parameter.
   */
  is_validation_authorized?: boolean;
  /** Non-secret run ID for ownership tracking. May appear in metadata. */
  validation_run_id?: string;
}

export interface SubscriberHandlerResult {
  success: boolean;
  summary: string;
  /** Handler may emit new business events (causation chain). */
  emittedEvents?: string[];
  /** Arbitrary structured output persisted on the delivery record. */
  output?: Record<string, any>;
  error?: string;
  /** When false, the failure is permanent and must not be retried. */
  retryable?: boolean;
  /** Whether the delivery state was independently re-fetched and verified after the write. */
  persistence_verified?: boolean;
  /** Detailed error if committed-state verification failed. */
  persistence_error?: string;
  /** The committed delivery record after the update (independently re-fetched). */
  committed_delivery?: BusinessEventDeliveryRecord;
}

export type SubscriberHandler = (
  event: BusinessEventRecord,
  delivery: BusinessEventDeliveryRecord,
  context: SubscriberHandlerContext
) => Promise<SubscriberHandlerResult>;

const registry = new Map<string, SubscriberHandler>();

/** Register a subscriber handler implementation under a reference key. */
export function registerSubscriberHandler(reference: string, handler: SubscriberHandler): void {
  registry.set(reference, handler);
}

/** Look up a registered handler by reference. Returns null if not found. */
export function getSubscriberHandler(reference: string): SubscriberHandler | null {
  return registry.get(reference) || null;
}

/** Returns true if a handler is registered for the given reference. */
export function isHandlerRegistered(reference: string): boolean {
  return registry.has(reference);
}