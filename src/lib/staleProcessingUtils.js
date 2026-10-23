/**
 * Frontend utility for stale webhook processing detection.
 *
 * This mirrors the backend logic in base44/shared/stWebhookHelpers.ts.
 * The timeout constant must be kept in sync with the backend value.
 */

export const WEBHOOK_PROCESSING_TIMEOUT_MINUTES = 10;

/**
 * Determine if a webhook event is in a stale processing state.
 *
 * An event is stale when:
 *   1. processing_status === 'processing'
 *   2. processing_started_at is older than WEBHOOK_PROCESSING_TIMEOUT_MINUTES
 *
 * If processing_started_at is missing while status is 'processing',
 * the event is considered stale (crash before claim metadata was saved).
 */
export function isStaleProcessing(event) {
  if (!event || event.processing_status !== 'processing') return false;
  if (!event.processing_started_at) return true;
  const startedAt = new Date(event.processing_started_at).getTime();
  if (isNaN(startedAt)) return true;
  const elapsedMs = Date.now() - startedAt;
  return elapsedMs > WEBHOOK_PROCESSING_TIMEOUT_MINUTES * 60 * 1000;
}

/**
 * Get the processing age in milliseconds for display.
 * Returns null if not in processing status or no start time.
 */
export function getProcessingAgeMs(event) {
  if (!event || event.processing_status !== 'processing') return null;
  if (!event.processing_started_at) return null;
  const startedAt = new Date(event.processing_started_at).getTime();
  if (isNaN(startedAt)) return null;
  return Date.now() - startedAt;
}

/**
 * Format processing age as a human-readable string.
 */
export function formatProcessingAge(event) {
  const ageMs = getProcessingAgeMs(event);
  if (ageMs === null) return '—';
  const minutes = Math.floor(ageMs / 60000);
  const seconds = Math.floor((ageMs % 60000) / 1000);
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}