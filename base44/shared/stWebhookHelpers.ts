/**
 * Shared helpers for ServiceTitan webhook ingestion and processing.
 * Used by both the webhook receiver (servicetitanWebhook) and the
 * event processor (processServiceTitanWebhookEvent).
 */

/**
 * Maximum number of retry attempts before an event enters the Dead Letter Queue.
 */
export const MAX_WEBHOOK_RETRIES = 5;

/**
 * Timeout (in minutes) after which a webhook event in "processing" status
 * is considered stale and eligible for automatic recovery.
 *
 * All stale-processing detection MUST reference this constant — never hardcode
 * timeout values elsewhere.
 */
export const WEBHOOK_PROCESSING_TIMEOUT_MINUTES = 10;

/**
 * Generate a unique processing claim ID.
 * Format: CLM-<timestamp>-<random>
 */
export function generateClaimId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `CLM-${ts}-${rand}`;
}

/**
 * Determine if a webhook event is in a stale processing state.
 *
 * An event is stale when:
 *   1. processing_status == "processing"
 *   2. processing_started_at is older than WEBHOOK_PROCESSING_TIMEOUT_MINUTES
 *
 * Events in completed, failed, retry_scheduled, dead_letter, or ignored
 * states are never classified as stale.
 */
export function isStaleProcessing(event: any): boolean {
  if (!event || event.processing_status !== "processing") return false;
  if (!event.processing_started_at) return true; // No start time = always stale (crash before claim metadata saved)
  const startedAt = new Date(event.processing_started_at).getTime();
  if (isNaN(startedAt)) return true;
  const elapsedMs = Date.now() - startedAt;
  return elapsedMs > WEBHOOK_PROCESSING_TIMEOUT_MINUTES * 60 * 1000;
}

/**
 * Calculate the processing age in milliseconds for display purposes.
 * Returns null if the event is not in processing status or has no start time.
 */
export function getProcessingAgeMs(event: any): number | null {
  if (!event || event.processing_status !== "processing") return null;
  if (!event.processing_started_at) return null;
  const startedAt = new Date(event.processing_started_at).getTime();
  if (isNaN(startedAt)) return null;
  return Date.now() - startedAt;
}

/**
 * Deterministic SHA-256 hash of a string (hex-encoded).
 * Uses the Web Crypto SubtleCrypto API (async in Deno).
 */
export async function hashPayload(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize an event type string into { domain, action }.
 *
 * Tries to match the event type against known domain prefixes first.
 * If a match is found, the remaining portion is the action — this
 * correctly handles multi-word actions like "on_hold".
 *
 * Falls back to splitting on the last underscore for unknown domains.
 *
 * Examples:
 *   appointment_created      → { domain: "appointment",      action: "created" }
 *   purchase_order_received  → { domain: "purchase_order",   action: "received" }
 *   technician_assigned      → { domain: "technician",       action: "assigned" }
 *   job_on_hold              → { domain: "job",              action: "on_hold" }
 *
 * Adding a new event for an existing domain requires zero router changes.
 */
export function normalizeEvent(eventType: string): { domain: string; action: string } {
  if (!eventType) return { domain: "unknown", action: "unknown" };
  const et = eventType.toLowerCase().trim();

  // Try matching against known domains (longest first for correct prefix matching)
  const sortedDomains = [...KNOWN_DOMAINS].sort((a, b) => b.length - a.length);
  for (const domain of sortedDomains) {
    if (et.startsWith(domain + "_")) {
      const action = et.substring(domain.length + 1);
      return { domain, action };
    }
  }

  // Fallback: split on last underscore for unknown domains
  const parts = et.split("_");
  if (parts.length < 2) return { domain: et, action: "unknown" };
  const action = parts.pop()!;
  const domain = parts.join("_");
  return { domain, action };
}

/**
 * Normalize the affected object type from an event type string.
 * Uses the domain from normalizeEvent for a clean, consistent mapping.
 */
export function normalizeObjectType(eventType: string): string {
  const { domain } = normalizeEvent(eventType);
  return domain || "unknown";
}

/**
 * Extract event metadata from a parsed webhook payload and headers.
 * Reads from common field names and ServiceTitan-specific headers.
 * Does NOT trust frontend-supplied values — data comes from the HTTP request.
 */
export function extractEventMetadata(payload: any, headers: Headers) {
  const eventType =
    payload.event_type ||
    payload.eventType ||
    headers.get("x-st-event-type") ||
    "unknown";
  const eventId =
    payload.event_id ||
    payload.eventId ||
    payload.id ||
    headers.get("x-st-event-id") ||
    "";
  const tenantId =
    payload.tenant_id ||
    payload.tenantId ||
    payload.tenant ||
    headers.get("x-st-tenant-id") ||
    "";
  const objectId = String(
    payload.object_id ||
      payload.objectId ||
      payload.id ||
      payload.job_id ||
      payload.job_number ||
      payload.transfer_sheet_id ||
      payload.po_id ||
      payload.po_number ||
      payload.customer_id ||
      payload.invoice_id ||
      payload.appointment_id ||
      payload.inventory_event_id ||
      ""
  );
  const objectType = normalizeObjectType(eventType);
  const eventTimestamp =
    payload.event_timestamp ||
    payload.timestamp ||
    payload.created_at ||
    payload.occurred_at ||
    "";
  return { eventType, eventId: String(eventId), tenantId: String(tenantId), objectId, objectType, eventTimestamp };
}

/**
 * Known ServiceTitan event domains.
 * Unknown domains are routed to the unknownHandler (ignored).
 * Adding a new event type for an existing domain requires zero changes here.
 */
export const KNOWN_DOMAINS: string[] = [
  "appointment",
  "job",
  "customer",
  "invoice",
  "payment",
  "purchase_order",
  "inventory_transfer",
  "truck",
  "transfer_sheet",
  "estimate",
  "technician",
];

export function isKnownDomain(domain: string): boolean {
  return KNOWN_DOMAINS.includes(domain);
}

/**
 * Check if an event type is known by normalizing to its domain.
 * Kept for backward compatibility with the webhook receiver.
 */
export function isKnownEventType(eventType: string): boolean {
  const { domain } = normalizeEvent(eventType);
  return isKnownDomain(domain);
}

/**
 * Calculate the next retry time using exponential backoff.
 * attempt 0 → +1 min, 1 → +5 min, 2 → +15 min, 3+ → +60 min
 * Returns an ISO timestamp.
 */
export function calculateNextRetry(attempts: number): string {
  const delays = [60000, 300000, 900000, 3600000]; // 1m, 5m, 15m, 60m
  const delay = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}