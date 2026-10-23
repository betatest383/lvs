/**
 * Business Event Engine — Generic Retry & Delivery Utilities
 *
 * These utilities govern the DELIVERY lifecycle of internal BusinessEvents
 * to registered subscribers. They are completely independent of ServiceTitan.
 *
 * Boundary:
 *   ServiceTitanWebhookEvent retry  → receiving + translating an EXTERNAL event.
 *   BusinessEvent delivery retry   → delivering an INTERNAL normalized event
 *                                    to subscribers.
 * These are separate lifecycle layers and must not be confused. The timing
 * algorithm mirrors the proven ST webhook backoff pattern (1m, 5m, 15m, 60m)
 * but is reimplemented here with zero ServiceTitan imports so the Business
 * Event Engine never couples to an external integration.
 */

/** Maximum delivery attempts before a subscriber delivery is dead-lettered. */
export const MAX_DELIVERY_RETRIES = 5;

/** Minutes before a "processing" delivery is considered stale and recoverable. */
export const DELIVERY_PROCESSING_TIMEOUT_MINUTES = 10;

/** Default maximum attempts when a subscriber does not specify one. */
export const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Exponential backoff schedule (mirrors the proven ST pattern).
 * attempt 0 → +1 min, 1 → +5 min, 2 → +15 min, 3+ → +60 min.
 * Returns an ISO timestamp for the next retry.
 */
export function calculateNextDeliveryRetry(attempts: number): string {
  const delays = [60000, 300000, 900000, 3600000]; // 1m, 5m, 15m, 60m
  const delay = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

/** Generate a unique processing claim ID for a delivery. */
export function generateDeliveryClaimId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `BEC-${ts}-${rand}`;
}

/** Generate a server-side event ID for a published BusinessEvent. */
export function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `BE-${ts}-${rand}`;
}

/**
 * Determine if a delivery is in a stale "processing" state.
 * A delivery is stale when it has been "processing" longer than
 * DELIVERY_PROCESSING_TIMEOUT_MINUTES without reaching a terminal state.
 */
export function isDeliveryStale(delivery: any): boolean {
  if (!delivery || delivery.delivery_status !== "processing") return false;
  if (!delivery.processing_started_at) return true;
  const startedAt = new Date(delivery.processing_started_at).getTime();
  if (isNaN(startedAt)) return true;
  const elapsedMs = Date.now() - startedAt;
  return elapsedMs > DELIVERY_PROCESSING_TIMEOUT_MINUTES * 60 * 1000;
}

/** Deterministic SHA-256 hash (hex) using the Web Crypto SubtleCrypto API. */
export async function hashPayload(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic delivery idempotency key: eventId:subscriberId */
export function buildDeliveryId(businessEventId: string, subscriberId: string): string {
  return `${businessEventId}:${subscriberId}`;
}

/** Deterministic policy key: entityType:externalSystem */
export function buildPolicyKey(entityType: string, externalSystem: string): string {
  return `${entityType}:${externalSystem}`;
}

/** Deterministic field-authority key: entityType:fieldName:externalSystem */
export function buildFieldAuthorityKey(
  entityType: string,
  fieldName: string,
  externalSystem: string
): string {
  return `${entityType}:${fieldName}:${externalSystem}`;
}

/** Deterministic capability key: externalSystem:entityType:direction:capability */
export function buildCapabilityKey(
  externalSystem: string,
  entityType: string,
  direction: string,
  capability: string
): string {
  return `${externalSystem}:${entityType}:${direction}:${capability}`;
}