/**
 * ServiceTitan Webhook Processing Timeline
 *
 * Every major processing step creates a timeline record, providing
 * a complete lifecycle view from reception through completion (or failure).
 * The timeline is the primary troubleshooting tool for webhook processing.
 *
 * Timeline entries are created by:
 *   - servicetitanWebhook (receiver): received, validated, stored, queued/ignored
 *   - processServiceTitanWebhookEvent (processor): processing, processing_claimed, retry_scheduled, completed, ignored, failed, dead_letter
 *   - stEventRouter (router): routing, handler_started, handler_finished
 *   - replayServiceTitanWebhook (replay): replay_started, replay_finished
 *   - stRecovery (recovery): processing_timeout, processing_recovered
 *   - Admin recovery actions: requeued, deleted
 */

export const TIMELINE_STAGES = {
  RECEIVED: "received",
  VALIDATED: "validated",
  STORED: "stored",
  QUEUED: "queued",
  PROCESSING: "processing",
  ROUTING: "routing",
  HANDLER_STARTED: "handler_started",
  HANDLER_FINISHED: "handler_finished",
  COMPLETED: "completed",
  IGNORED: "ignored",
  RETRY_SCHEDULED: "retry_scheduled",
  REPLAY_STARTED: "replay_started",
  REPLAY_FINISHED: "replay_finished",
  FAILED: "failed",
  DEAD_LETTER: "dead_letter",
  PROCESSING_CLAIMED: "processing_claimed",
  PROCESSING_TIMEOUT: "processing_timeout",
  PROCESSING_RECOVERED: "processing_recovered",
  REQUEUED: "requeued",
  DELETED: "deleted",
} as const;

/**
 * Create a timeline entry for a webhook event.
 *
 * Never throws — timeline failures are logged but never break processing.
 * This ensures the timeline is a best-effort observability layer.
 */
export async function addTimelineEntry(
  base44: any,
  webhookEventId: string,
  stage: string,
  message: string,
  status: string = "info",
  durationMs?: number,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.create({
      webhook_event_id: webhookEventId,
      timestamp: new Date().toISOString(),
      stage,
      message,
      status,
      duration_ms: durationMs ?? null,
      metadata_json: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    console.error("[ST TIMELINE ERROR]", {
      webhookEventId,
      stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}