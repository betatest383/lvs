/**
 * ServiceTitan Webhook Stale-Processing Recovery
 *
 * Provides atomic recovery for webhook events stuck in "processing" status
 * after crashes, deployments, or unexpected failures.
 *
 * Recovery is concurrency-safe: it uses updateMany with a conditional filter
 * that matches BOTH the processing_status AND the original processing_started_at.
 * If another processor already completed the event (changing its status),
 * the recovery update matches zero rows and aborts.
 *
 * Used by:
 *   - recoverStaleWebhookEvents (scheduled recovery job, every 5 minutes)
 *   - manageServiceTitanWebhookEvent (admin manual recovery action)
 *   - replayServiceTitanWebhook (replay recognizes stale events)
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import {
  WEBHOOK_PROCESSING_TIMEOUT_MINUTES,
  isStaleProcessing,
} from "./stWebhookHelpers.ts";

export interface RecoveryResult {
  event_id: string;
  recovered: boolean;
  reason: string;
  recovery_count?: number;
  previous_claim_id?: string;
  previous_claimed_by?: string;
  processing_duration_ms?: number;
}

/**
 * Attempt to recover a single stale webhook event.
 *
 * Atomic transition: processing → received
 *
 * Concurrency protection:
 *   The updateMany filter matches {id, processing_status: "processing", processing_started_at: original}.
 *   If another processor already completed the event (changing processing_status),
 *   modified_count will be 0 and recovery aborts.
 *
 * Does NOT erase original claim information (processing_claimed_by, processing_claim_id,
 * processing_started_at are preserved for audit). Only recovery metadata is written.
 *
 * @param base44          Base44 SDK client
 * @param event           The stale webhook event (must be loaded before calling)
 * @param recoveredBy     "system" for scheduled recovery, or admin email for manual
 * @param reason          Human-readable recovery reason
 * @returns RecoveryResult
 */
export async function recoverStaleEvent(
  base44: any,
  event: any,
  recoveredBy: string,
  reason: string
): Promise<RecoveryResult> {
  const eventId = event.id;

  // ── Guard: only stale events can be recovered ──
  if (!isStaleProcessing(event)) {
    return {
      event_id: eventId,
      recovered: false,
      reason: "Event is not stale (not in processing status or within timeout)",
    };
  }

  // ── Capture original claim metadata for audit ──
  const originalStartedAt = event.processing_started_at || null;
  const originalClaimId = event.processing_claim_id || null;
  const originalClaimedBy = event.processing_claimed_by || null;
  const currentRecoveryCount = event.processing_recovery_count || 0;
  const newRecoveryCount = currentRecoveryCount + 1;

  // ── Calculate processing duration for audit ──
  let processingDurationMs: number | undefined;
  if (originalStartedAt) {
    const startedAt = new Date(originalStartedAt).getTime();
    if (!isNaN(startedAt)) {
      processingDurationMs = Date.now() - startedAt;
    }
  }

  // ── Timeline: timeout detected ──
  await addTimelineEntry(base44, eventId, TIMELINE_STAGES.PROCESSING_TIMEOUT,
    `Processing timeout detected — no activity for >${WEBHOOK_PROCESSING_TIMEOUT_MINUTES} min`,
    "warning", processingDurationMs,
    {
      claim_id: originalClaimId,
      claimed_by: originalClaimedBy,
      processing_started_at: originalStartedAt,
      processing_duration_ms: processingDurationMs,
    });

  // ── ATOMIC RECOVERY ──
  // Filter matches BOTH status AND processing_started_at to ensure we don't
  // recover an event that was already completed by another processor.
  const claimFilter: Record<string, any> = {
    id: eventId,
    processing_status: "processing",
  };
  if (originalStartedAt) {
    claimFilter.processing_started_at = originalStartedAt;
  }

  const claimResult = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.updateMany(
    claimFilter,
    {
      $set: {
        processing_status: "received",
        processing_recovered_at: new Date().toISOString(),
        processing_recovered_by: recoveredBy,
        processing_recovery_reason: reason,
        processing_recovery_count: newRecoveryCount,
      },
    }
  );

  const recovered = claimResult && (claimResult.modified_count > 0 || claimResult.updated > 0);
  if (!recovered) {
    // Another processor already completed the event — abort
    return {
      event_id: eventId,
      recovered: false,
      reason: "Event was already completed by another processor (concurrency abort)",
    };
  }

  // ── Timeline: recovered ──
  await addTimelineEntry(base44, eventId, TIMELINE_STAGES.PROCESSING_RECOVERED,
    `Stale processing recovered by ${recoveredBy} (recovery #${newRecoveryCount})`,
    "warning", processingDurationMs,
    {
      recovery_count: newRecoveryCount,
      recovered_by: recoveredBy,
      reason,
      previous_claim_id: originalClaimId,
      previous_claimed_by: originalClaimedBy,
      processing_started_at: originalStartedAt,
      processing_duration_ms: processingDurationMs,
    });

  // ── Permanent audit record ──
  await writeRecoveryAuditLog(base44, event, recoveredBy, reason, newRecoveryCount, originalClaimId, originalClaimedBy, originalStartedAt, processingDurationMs);

  return {
    event_id: eventId,
    recovered: true,
    reason,
    recovery_count: newRecoveryCount,
    previous_claim_id: originalClaimId,
    previous_claimed_by: originalClaimedBy,
    processing_duration_ms: processingDurationMs,
  };
}

/**
 * Find all stale processing events and recover them.
 * Used by the scheduled recovery job and can be called multiple times safely.
 *
 * @returns Summary of recovery results
 */
export async function findAndRecoverStaleEvents(
  base44: any,
  recoveredBy: string = "system",
  reason: string = "Automatic stale-processing recovery (scheduled)"
): Promise<{
  scanned: number;
  stale: number;
  recovered: number;
  aborted: number;
  results: RecoveryResult[];
}> {
  // ── Fetch all events currently in "processing" status ──
  const processingEvents = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter(
    { processing_status: "processing" },
    "-received_at",
    200
  );

  const staleEvents = processingEvents.filter((e: any) => isStaleProcessing(e));

  const results: RecoveryResult[] = [];
  let recovered = 0;
  let aborted = 0;

  // ── Recover each stale event sequentially (avoid concurrent DB operations) ──
  for (const event of staleEvents) {
    try {
      const result = await recoverStaleEvent(base44, event, recoveredBy, reason);
      results.push(result);
      if (result.recovered) {
        recovered++;
      } else {
        aborted++;
      }
    } catch (err) {
      console.error("[ST RECOVERY ERROR]", {
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({
        event_id: event.id,
        recovered: false,
        reason: `Recovery error: ${err instanceof Error ? err.message : String(err)}`,
      });
      aborted++;
    }
  }

  console.log("[ST RECOVERY SUMMARY]", JSON.stringify({
    scanned: processingEvents.length,
    stale: staleEvents.length,
    recovered,
    aborted,
  }));

  return {
    scanned: processingEvents.length,
    stale: staleEvents.length,
    recovered,
    aborted,
    results,
  };
}

/**
 * Write a permanent audit log entry for a stale-processing recovery.
 * This record survives even if the webhook event is later deleted.
 */
async function writeRecoveryAuditLog(
  base44: any,
  event: any,
  recoveredBy: string,
  reason: string,
  recoveryCount: number,
  originalClaimId: string | null,
  originalClaimedBy: string | null,
  originalStartedAt: string | null,
  processingDurationMs: number | undefined
): Promise<void> {
  try {
    const logId = `ST-RECOV-${event.id.substring(0, 12)}-${recoveryCount}`.toUpperCase();

    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: logId,
      log_type: "event",
      source_module: "servicetitan_webhook",
      source_module_name: "ServiceTitan Webhook Recovery",
      trigger_event: "stale_processing_recovery",
      trigger_event_name: "Stale Processing Recovery",
      event_payload_json: JSON.stringify({
        webhook_event_id: event.id,
        event_type: event.event_type,
        event_id: event.event_id,
        object_id: event.object_id,
        recovered_by: recoveredBy,
        reason,
        recovery_count: recoveryCount,
        previous_claim_id: originalClaimId,
        previous_claimed_by: originalClaimedBy,
        processing_started_at: originalStartedAt,
        processing_duration_ms: processingDurationMs,
      }),
      related_record_id: event.id,
      status: "success",
      triggered_by: recoveredBy === "system" ? "recoverStaleWebhookEvents" : "manageServiceTitanWebhookEvent",
    });
  } catch (err) {
    console.error("[ST RECOVERY AUDIT ERROR]", {
      webhookEventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}