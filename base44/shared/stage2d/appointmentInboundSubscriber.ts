/**
 * Appointment Inbound Subscriber (Stage 2D)
 *
 * Handler reference: "appointment.sync.inbound"
 *
 * Listens for appointment.created / appointment.updated / appointment.canceled /
 * appointment.completed / appointment.assigned / appointment.rescheduled
 * BusinessEvents.
 *
 * Stage 2D is INBOUND-ONLY (ServiceTitan → LVC OS).
 *
 * Processing flow:
 *   1. Ignore LVC-originated events (loop prevention).
 *   2. Parse the BusinessEvent payload.
 *   3. Resolve the canonical Job and Customer relationships via
 *      appointmentRelationshipResolver (reads local DB only — no ST API calls).
 *   4. If Job not found locally → return retryable deferral (no Appointment created).
 *   5. If Customer contradiction → return non-retryable error.
 *   6. If resolved → inject local job_id and customer_id into the payload.
 *   7. Call the REAL stAppointmentSync function (no test_skip_sync bypass).
 *   8. Record detailed shadow metrics for migration health monitoring.
 *
 * Security:
 *   - No test_skip_sync bypass is used for primary functional tests.
 *   - test_skip_sync is retained ONLY for narrowly defined infrastructure
 *     fault injection (e.g. persistence-mismatch detection), secured by
 *     testHarnessGuard. It is NEVER used to bypass the sync handler.
 *   - The real Appointment synchronization business logic ALWAYS executes.
 *
 * Loop Prevention:
 *   - Inbound subscriber ignores lvc_os events (outbound subscriber removed).
 *   - No outbound deliveries can be created (outbound subscriber unregistered,
 *     API_PUSH unsupported, EXTERNAL_TO_LVC policy enforced).
 */

import {
  registerSubscriberHandler,
  type SubscriberHandler,
} from "../businessEvent/subscriberHandlerRegistry.ts";
import {
  syncAppointmentCreated,
  syncAppointmentUpdated,
  syncAppointmentCanceled,
  syncAppointmentCompleted,
  syncTechnicianAssignment,
  type SyncContext,
  type SyncResult,
} from "../stAppointmentSync.ts";
import { resolveAppointmentRelationships } from "./appointmentRelationshipResolver.ts";
import { recordShadowExecution, type ShadowOutcome } from "../stage2b/shadowMetricsService.ts";
import { parseMetadata } from "../stage2b/testHarnessGuard.ts";

export const INBOUND_HANDLER_REF = "appointment.sync.inbound";

export const appointmentInboundSubscriber: SubscriberHandler = async (
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
      summary: "Skipped — LVC-originated event (loop prevention)",
      output: { skipped: true, reason: "lvc_origin" },
    };
  }

  // ── Parse the BusinessEvent payload ──
  let data: any;
  try {
    data = JSON.parse(event.payload);
  } catch {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Appointment", "servicetitan", {
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
  const webhookPayload = data.webhook_payload || {};
  const webhookEvent = data.webhook_event || {
    id: event.source_event_id,
    event_type: event.event_type,
    object_id: event.entity_id,
  };

  // ── Extract ST IDs for relationship resolution ──
  const stJobId =
    webhookPayload.job_id ||
    webhookPayload.servicetitan_job_id ||
    "";
  const stCustomerId =
    webhookPayload.customer_id ||
    webhookPayload.servicetitan_customer_id ||
    "";

  // ── Resolve Job and Customer relationships (local DB only) ──
  // This enforces the approved dependency resolution order and prevents
  // orphaned Appointments. No ServiceTitan API calls are made.
  const resolution = await resolveAppointmentRelationships(
    base44,
    stJobId,
    stCustomerId
  );

  if (resolution.status === "deferred") {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Appointment", "servicetitan", {
      outcome: "idempotent_noop",
      eventId: event.event_id,
      action,
      durationMs,
      success: false,
      error: resolution.error,
    });
    return {
      success: false,
      summary: resolution.warning || "Appointment deferred — Job not yet synchronized",
      error: resolution.error || "Job not found locally",
      retryable: true,
      output: { resolution_status: "deferred", servicetitan_job_id: stJobId },
    };
  }

  if (resolution.status === "contradiction") {
    const durationMs = Date.now() - startTime;
    await recordShadowExecution(base44, "Appointment", "servicetitan", {
      outcome: "mapping_failure",
      eventId: event.event_id,
      action,
      durationMs,
      success: false,
      error: resolution.error,
    });
    return {
      success: false,
      summary: resolution.error || "Customer contradiction detected",
      error: resolution.error || "Customer contradiction",
      retryable: false,
      output: { resolution_status: "contradiction" },
    };
  }

  // ── Inject resolved local IDs into the payload ──
  // The sync functions read these from the payload and store them
  // on the Appointment record (job_id, customer_id).
  if (resolution.status === "resolved") {
    if (resolution.job_id) webhookPayload._resolved_job_id = resolution.job_id;
    if (resolution.customer_id) webhookPayload._resolved_customer_id = resolution.customer_id;
    if (resolution.customer_name) webhookPayload.customer_name = resolution.customer_name;
  }

  // ── Build the SyncContext ──
  const syncCtx: SyncContext = {
    base44,
    payload: webhookPayload,
    event: webhookEvent,
    action,
  };

  // ── Run the REAL sync function (no test_skip_sync bypass) ──
  let result: SyncResult;
  let outcome: ShadowOutcome;

  try {
    switch (action) {
      case "created":
        result = await syncAppointmentCreated(syncCtx);
        break;
      case "updated":
        result = await syncAppointmentUpdated(syncCtx);
        break;
      case "canceled":
      case "cancelled":
        result = await syncAppointmentCanceled(syncCtx);
        break;
      case "completed":
        result = await syncAppointmentCompleted(syncCtx);
        break;
      case "assigned":
        result = await syncTechnicianAssignment(syncCtx, false);
        break;
      case "unassigned":
        result = await syncTechnicianAssignment(syncCtx, true);
        break;
      case "rescheduled":
        result = await syncAppointmentUpdated(syncCtx);
        break;
      default:
        result = {
          success: true,
          summary: `Appointment event '${action}' received — no subscriber handler for this action`,
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
    if (errMsg.includes("mapping") || errMsg.includes("missing required") || errMsg.includes("appointment_id")) {
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
        outcome = "appointment_created";
        break;
      case "updated":
        outcome = "appointment_updated";
        break;
      case "canceled":
      case "cancelled":
        outcome = "appointment_canceled";
        break;
      case "completed":
        outcome = "appointment_completed";
        break;
      case "assigned":
      case "reassigned":
        outcome = "appointment_assigned";
        break;
      case "rescheduled":
        outcome = "appointment_rescheduled";
        break;
      case "located":
      case "matched":
        outcome = "appointment_located";
        break;
      case "unmatched":
        outcome = "appointment_unmatched_technician";
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
      case "unchanged":
        outcome = "idempotent_noop";
        break;
      default:
        outcome = result.metadata?.local_appointment_id ? "appointment_updated" : "idempotent_noop";
    }
  }

  // ── Record detailed shadow metrics ──
  const durationMs = Date.now() - startTime;
  try {
    await recordShadowExecution(base44, "Appointment", "servicetitan", {
      outcome,
      eventId: event.event_id,
      action,
      durationMs,
      success: result.success,
      summary: result.summary,
      error: result.error,
    });
  } catch (err) {
    console.error("[STAGE 2D] recordShadowExecution failed:", err);
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
      local_appointment_id: result.metadata?.local_appointment_id,
      changed_fields: result.metadata?.changed_fields,
      resolution_status: resolution.status,
      job_id: resolution.job_id,
      customer_id: resolution.customer_id,
    },
  };
};

export function registerInboundSubscriber(): void {
  registerSubscriberHandler(INBOUND_HANDLER_REF, appointmentInboundSubscriber);
}