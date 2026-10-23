/**
 * Customer Inbound Subscriber (Stage 2B-A)
 *
 * Handler reference: "customer.sync.inbound"
 *
 * Listens for customer.created / customer.updated BusinessEvents.
 *   - Processes events where source_system is external (servicetitan).
 *   - Ignores LVC-originated events (loop prevention — outbound subscriber
 *     handles those).
 *   - Reconstructs the SyncContext from the event payload and calls the
 *     existing stCustomerSync functions (syncCustomerCreated / syncCustomerUpdated).
 *   - Records detailed shadow metrics for migration health monitoring.
 *   - Reconciles pending jobs after successful customer creation (mirrors the
 *     existing customerHandler behavior).
 *
 * Stage 2B-A Hardening:
 *   - Test-only behavior (test_skip_sync) secured via testHarnessGuard —
 *     ignored entirely in production.
 *   - Detailed shadow outcome tracking (located/created/updated/duplicate/
 *     replay/mapping/validation/idempotent/duration).
 *   - Automatic cut-over removed — shadow metrics collected indefinitely.
 */

import {
  registerSubscriberHandler,
  type SubscriberHandler,
} from "../businessEvent/subscriberHandlerRegistry.ts";
import {
  syncCustomerCreated,
  syncCustomerUpdated,
  type SyncContext,
  type SyncResult,
} from "../stCustomerSync.ts";
import { reconcilePendingCustomers } from "../stJobSync.ts";
import { recordShadowExecution, type ShadowOutcome } from "./shadowMetricsService.ts";
import { parseMetadata } from "./testHarnessGuard.ts";

export const INBOUND_HANDLER_REF = "customer.sync.inbound";

export const customerInboundSubscriber: SubscriberHandler = async (
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
    await recordShadowExecution(base44, "Customer", "servicetitan", {
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

  if (testSkipSync) {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Customer", "servicetitan", {
      outcome: "test_skipped",
      eventId: event.event_id,
      action,
      durationMs,
      success: true,
      summary: `Mock sync for ${action}`,
    });
    return {
      success: true,
      summary: `Test mode — skipped real sync for customer.${action}`,
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
  };

  // ── Run the existing sync function ──
  let result: SyncResult;
  let outcome: ShadowOutcome;

  try {
    result =
      action === "created"
        ? await syncCustomerCreated(syncCtx)
        : await syncCustomerUpdated(syncCtx);
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
    const errMsg = result.error || result.summary || "";
    if (errMsg.toLowerCase().includes("mapping") || errMsg.toLowerCase().includes("missing required") || errMsg.toLowerCase().includes("customer_id")) {
      outcome = "mapping_failure";
    } else if (errMsg.toLowerCase().includes("validation") || errMsg.toLowerCase().includes("invalid")) {
      outcome = "validation_failure";
    } else {
      outcome = "error";
    }
  } else {
    const syncAction = result.metadata?.sync_action;
    switch (syncAction) {
      case "created":
        outcome = "customer_created";
        break;
      case "updated":
        outcome = "customer_updated";
        break;
      case "located":
      case "matched":
        outcome = "customer_located";
        break;
      case "duplicate":
      case "duplicate_ignored":
        outcome = "duplicate_ignored";
        break;
      case "replay":
      case "replay_ignored":
      case "stale":
        outcome = "replay_ignored";
        break;
      case "idempotent":
      case "noop":
      case "no_change":
        outcome = "idempotent_noop";
        break;
      default:
        outcome = result.metadata?.local_customer_id ? "customer_updated" : "idempotent_noop";
    }
  }

  // ── Record detailed shadow metrics ──
  const durationMs = Date.now() - startTime;
  try {
    await recordShadowExecution(base44, "Customer", "servicetitan", {
      outcome,
      eventId: event.event_id,
      action,
      durationMs,
      success: result.success,
      summary: result.summary,
      error: result.error,
    });
  } catch (err) {
    console.error("[STAGE 2B-A] recordShadowExecution failed:", err);
  }

  // ── Reconcile pending jobs after successful customer creation ──
  if (result.success && result.metadata?.local_customer_id) {
    try {
      const stCustId =
        data.webhook_payload?.customer_id ||
        data.webhook_payload?.servicetitan_customer_id ||
        event.entity_id;
      await reconcilePendingCustomers(
        base44,
        stCustId,
        result.metadata.local_customer_id,
        result.metadata.customer_name || data.webhook_payload?.customer_name || "",
        result.metadata.customer_number || data.webhook_payload?.customer_number || "",
        event.source_event_id
      );
    } catch (err) {
      console.error("[STAGE 2B-A] reconcilePendingCustomers failed:", err);
    }
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
      local_customer_id: result.metadata?.local_customer_id,
      changed_fields: result.metadata?.changed_fields,
    },
  };
};

export function registerInboundSubscriber(): void {
  registerSubscriberHandler(INBOUND_HANDLER_REF, customerInboundSubscriber);
}