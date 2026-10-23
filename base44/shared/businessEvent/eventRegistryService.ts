/**
 * Event Registry Service
 *
 * Validates published events against the governed EventRegistry. The registry
 * is the single source of truth for valid event types, their versions, and
 * their default processing behavior. The engine never accepts an unregistered
 * or inactive event type.
 */

import type { EventRegistryRecord } from "./businessEventTypes.ts";

/** Fetch the registry entry for an event type. Returns null if not found. */
export async function getEventType(
  base44: any,
  eventType: string
): Promise<EventRegistryRecord | null> {
  try {
    const results = await base44.asServiceRole.entities.EventRegistry.filter(
      { event_type: eventType },
      "-version",
      1
    );
    return results.length > 0 ? (results[0] as EventRegistryRecord) : null;
  } catch (err) {
    console.error("[EVENT REGISTRY] lookup failed:", err);
    return null;
  }
}

export interface EventValidationResult {
  valid: boolean;
  error?: string;
  registry?: EventRegistryRecord;
}

/**
 * Validate an event against the registry:
 *   1. The event type must be registered.
 *   2. The registry entry must be active.
 *   3. The supplied event version must not exceed the current version.
 *
 * A version lower than current is allowed (historical events retain their
 * original version) but a version higher than current is rejected.
 */
export async function validateEvent(
  base44: any,
  eventType: string,
  eventVersion: number
): Promise<EventValidationResult> {
  const registry = await getEventType(base44, eventType);
  if (!registry) {
    return { valid: false, error: `Unregistered event type: '${eventType}'` };
  }
  if (!registry.is_active) {
    return { valid: false, error: `Event type '${eventType}' is inactive`, registry };
  }
  if (eventVersion > registry.current_version) {
    return {
      valid: false,
      error: `Event version ${eventVersion} exceeds current version ${registry.current_version} for '${eventType}'`,
      registry,
    };
  }
  return { valid: true, registry };
}

/** Validate a payload against the registry's JSON schema (if defined). */
export function validatePayloadStructure(
  registry: EventRegistryRecord,
  payload: any
): { valid: boolean; error?: string } {
  if (!registry.schema_definition) {
    return { valid: true };
  }
  let schema: any;
  try {
    schema = JSON.parse(registry.schema_definition);
  } catch {
    return { valid: false, error: "Registry schema_definition is not valid JSON" };
  }
  if (!schema || typeof schema !== "object") {
    return { valid: true };
  }
  // Minimal structural validation: check required top-level keys if declared.
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (payload == null || typeof payload !== "object" || !(key in payload)) {
        return { valid: false, error: `Payload missing required field: '${key}'` };
      }
    }
  }
  return { valid: true };
}

/** List all active event types (for admin/registry views). */
export async function listActiveEventTypes(base44: any): Promise<EventRegistryRecord[]> {
  try {
    return await base44.asServiceRole.entities.EventRegistry.filter(
      { is_active: true },
      "event_type",
      200
    );
  } catch {
    return [];
  }
}