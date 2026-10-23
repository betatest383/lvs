/**
 * Event Subscriber Service
 *
 * Resolves active subscribers for a given event type. Subscribers are
 * registered as governed data (EventSubscriber records) and looked up at
 * dispatch time. The engine never hardcodes subscriber lists.
 */

import type { EventSubscriberRecord } from "./businessEventTypes.ts";

/** Get all active subscribers for an event type, ordered by priority (ascending). */
export async function getActiveSubscribers(
  base44: any,
  eventType: string
): Promise<EventSubscriberRecord[]> {
  try {
    const now = new Date().toISOString();
    const all = await base44.asServiceRole.entities.EventSubscriber.filter(
      { event_type: eventType, is_active: true },
      "priority",
      200
    );
    return (all as EventSubscriberRecord[]).filter((s) => {
      if (s.activation_date && new Date(s.activation_date).getTime() > new Date(now).getTime()) {
        return false;
      }
      if (s.deactivation_date && new Date(s.deactivation_date).getTime() < new Date(now).getTime()) {
        return false;
      }
      return true;
    });
  } catch (err) {
    console.error("[SUBSCRIBER SERVICE] lookup failed:", err);
    return [];
  }
}

/** Get a single subscriber by its subscriber_id. */
export async function getSubscriber(
  base44: any,
  subscriberId: string
): Promise<EventSubscriberRecord | null> {
  try {
    const results = await base44.asServiceRole.entities.EventSubscriber.filter(
      { subscriber_id: subscriberId },
      null,
      1
    );
    return results.length > 0 ? (results[0] as EventSubscriberRecord) : null;
  } catch {
    return null;
  }
}

/** Validate that a subscriber record references a registered handler. */
export function validateSubscriberHandler(
  subscriber: EventSubscriberRecord,
  isHandlerRegistered: (ref: string) => boolean
): { valid: boolean; error?: string } {
  if (!subscriber.handler_reference) {
    return { valid: false, error: "Subscriber is missing handler_reference" };
  }
  if (!isHandlerRegistered(subscriber.handler_reference)) {
    return {
      valid: false,
      error: `No handler registered for handler_reference '${subscriber.handler_reference}'`,
    };
  }
  return { valid: true };
}