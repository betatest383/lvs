/**
 * Job Inbound Subscriber (Stage 2C)
 *
 * Handler reference: "job.sync.inbound"
 *
 * Listens for job.created / job.updated / job.deleted / job.restored
 * BusinessEvents.
 *   - Processes events where source_system is external (servicetitan).
 *   - Ignores LVC-originated events (loop prevention — outbound subscriber
 *     handles those).
 *   - Reconstructs the SyncContext from the event payload and calls the
 *     existing stJobSync functions.
 *   - Records detailed shadow metrics for migration health monitoring.
 *
 * Stage 2C Hardening (mirrors Stage 2B-A Customer pattern):
 *   - Test-only behavior (test_skip_sync) secured via testHarnessGuard —
 *     ignored entirely in production.
 *   - Detailed shadow outcome tracking (located/created/updated/deleted/
 *     restored/duplicate/replay/mapping/validation/idempotent/duration).
 *   - Automatic cut-over removed — shadow metrics collected indefinitely.
 */

import {
  registerSubscriberHandler,
  type SubscriberHandler,
} from "../businessEvent/subscriberHandlerRegistry.ts";
import {
  syncJobCreated,
  syncJobUpdated,
  syncJobDeleted,
  syncJobRestored,
  type SyncContext,
  type SyncResult,
} from "../stJobSync.ts";
import { recordShadowExecution, type ShadowOutcome } from "../stage2b/shadowMetricsService.ts";
import { parseMetadata } from "../stage2b/testHarnessGuard.ts";

export const INBOUND_HANDLER_REF = "job.sync.inbound";

export const jobInboundSubscriber: SubscriberHandler = async (
  event,
  delivery,
  context
) => {
  const { base44 } = context;
  const startTime = Date.now();

  // ── Loop prevention: ignore LVC-originated events ──
  if (event.source_system === "lvc_os") {
    return {
      success: true,
      summary: "Skipped — LVC-originated event (outbound subscriber handles this)",
      output: { skipped: true, reason: "lvc_origin" },
    };
  }

  // ── Parse the BusinessEvent payload ──
  let data: any;
  try {
    data = JSON.parse(event.payload);
  } catch {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Job", "servicetitan", {
      outcome: "validation_failure",
      eventId: event.event_id,
      action: event.event_type.split(".")[1] || "updated",
      durationMs,
      success: false,
      error: "Payload is not valid JSON",
    });
    return {
      success: false,
      summary: "Invalid event payload — not valid JSON",
      error: "Payload is not valid JSON",
      retryable: false,
    };
  }

  const action = event.event_type.split(".")[1] || "updated";
  const meta = parseMetadata(event.metadata);

  // ── Secure test-only behavior ──
  // context.is_validation_authorized is set by processDeliveryById AFTER
  // server-side VR verification (run exists, token matched, not expired).
  // The token never enters persisted metadata — it stays in the validation
  // function's server-side context. Production events are never dispatched
  // through processDeliveryById, so is_validation_authorized is always
  // false/undefined in production.
  //
  // The metadata flag (test_skip_sync) is just a signal — it is NOT
  // authorization. It is honored ONLY when is_validation_authorized is true.
  const isValidationAuthorized = context.is_validation_authorized === true;
  const testSkipSync = isValidationAuthorized && meta?.test_skip_sync === true;
  const testSkipHydration = isValidationAuthorized && meta?.test_skip_hydration === true;

  if (testSkipSync) {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Job", "servicetitan", {
      outcome: "test_skipped",
      eventId: event.event_id,
      action,
      durationMs,
      success: true,
      summary: `Mock sync for ${action}`,
    });
    return {
      success: true,
      summary: `Test mode — skipped real sync for job.${action}`,
      output: { test_skipped: true, action },
    };
  }

  // ── Reconstruct the SyncContext ──
  const syncCtx: SyncContext = {
    base44,
    payload: data.webhook_payload || {},
    event:
      data.webhook_event || {
        id: event.source_event_id,
        event_type: event.event_type,
        object_id: event.entity_id,
      },
    action,
    testSkipHydration,
  };

  // ── Run the existing sync function ──
  let result: SyncResult;
  let outcome: ShadowOutcome;

  try {
    switch (action) {
      case "created":
        result = await syncJobCreated(syncCtx);
        break;
      case "updated":
        result = await syncJobUpdated(syncCtx);
        break;
      case "deleted":
        result = await syncJobDeleted(syncCtx);
        break;
      case "restored":
        result = await syncJobRestored(syncCtx);
        break;
      default:
        result = {
          success: true,
          summary: `Job event '${action}' received — no subscriber handler for this action`,
          metadata: { sync_action: "noop" },
        };
    }
  } catch (err) {
    result = {
      success: false,
      summary: "Inbound subscriber sync threw",
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }

  // ── Determine shadow outcome from sync result ──
  if (!result.success) {
    const errMsg = (result.error || result.summary || "").toLowerCase();
    if (errMsg.includes("mapping") || errMsg.includes("missing required") || errMsg.includes("job_id")) {
      outcome = "mapping_failure";
    } else if (errMsg.includes("validation") || errMsg.includes("invalid")) {
      outcome = "validation_failure";
    } else {
      outcome = "error";
    }
  } else {
    const syncAction = result.metadata?.sync_action;
    switch (syncAction) {
      case "created":
        outcome = "job_created";
        break;
      case "updated":
        outcome = "job_updated";
        break;
      case "deleted":
        outcome = "job_deleted";
        break;
      case "restored":
        outcome = "job_restored";
        break;
      case "located":
      case "matched":
        outcome = "job_located";
        break;
      case "duplicate":
      case "duplicate_ignored":
        outcome = "duplicate_ignored";
        break;
      case "replay":
      case "replay_ignored":
      case "stale":
      case "stale_ignored":
        outcome = "replay_ignored";
        break;
      case "idempotent":
      case "noop":
      case "no_change":
        outcome = "idempotent_noop";
        break;
      default:
        outcome = result.metadata?.local_job_id ? "job_updated" : "idempotent_noop";
    }
  }

  // ── Record detailed shadow metrics ──
  const durationMs = Date.now() - startTime;
  try {
    await recordShadowExecution(base44, "Job", "servicetitan", {
      outcome,
      eventId: event.event_id,
      action,
      durationMs,
      success: result.success,
      summary: result.summary,
      error: result.error,
    });
  } catch (err) {
    console.error("[STAGE 2C] recordShadowExecution failed:", err);
  }

  return {
    success: result.success,
    summary: result.summary,
    error: result.error,
    retryable: result.retryable,
    output: {
      sync_action: result.metadata?.sync_action,
      shadow_outcome: outcome,
      duration_ms: durationMs,
      local_job_id: result.metadata?.local_job_id,
      changed_fields: result.metadata?.changed_fields,
    },
  };
};

export function registerInboundSubscriber(): void {
  registerSubscriberHandler(INBOUND_HANDLER_REF, jobInboundSubscriber);
}