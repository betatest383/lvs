import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import {
  calculateNextRetry,
  generateClaimId,
  MAX_WEBHOOK_RETRIES,
  normalizeEvent,
} from "../../shared/stWebhookHelpers.ts";
import { routeEvent } from "../../shared/stEventRouter.ts";
import { addTimelineEntry, TIMELINE_STAGES } from "../../shared/stTimeline.ts";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import "../../shared/stage2c/jobSubscriberRegistration.ts";

/**
 * ServiceTitan Webhook Event Processor
 *
 * Admin-only function that claims one unprocessed webhook event and
 * processes it through the modular Domain+Action event router.
 *
 * Atomic Claim:
 *   The processor uses updateMany with a conditional filter to atomically
 *   transition an event from "received" (or "failed" with due retry) to
 *   "processing". Only ONE concurrent invocation can succeed; all others
 *   receive HTTP 200 with { processing_status: "already_claimed" }.
 *
 * Dead Letter Queue:
 *   After MAX_WEBHOOK_RETRIES (5) failed attempts, the event enters
 *   the dead_letter status. No further retries are scheduled.
 *
 * Optional parameter:
 *   event_id — process a specific event by its entity record ID
 *   (used by the admin monitor's "Retry" action for immediate processing)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse optional body (event_id for specific event processing)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body — claim next available
    }
    const specificEventId = body.event_id || body.eventId || null;

    let event: any = null;
    let claimFilter: Record<string, any> = {};

    if (specificEventId) {
      // ── Process a specific event (admin retry action) ──
      event = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.get(
        specificEventId
      );
      if (!event) {
        return Response.json({ error: "Event not found" }, { status: 404 });
      }
      if (event.processing_status === "processing") {
        return Response.json({ error: "Event is already being processed" }, { status: 409 });
      }
      if (event.processing_status === "processed") {
        return Response.json({ success: true, message: "Event already processed" });
      }
      // Allow retry of failed, dead_letter, and ignored events.
      // The claim filter must match the CURRENT status to be atomic.
      claimFilter = { id: event.id, processing_status: event.processing_status };
    } else {
      // ── Claim next available event ──
      const receivedEvents = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter(
        { processing_status: "received" },
        "received_at",
        1
      );
      event = receivedEvents[0];

      // If none received, check for failed events ready for retry (not dead_letter)
      if (!event) {
        const failedEvents = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter(
          { processing_status: "failed" },
          "received_at",
          50
        );
        event = failedEvents.find(
          (e: any) =>
            e.next_retry_at &&
            new Date(e.next_retry_at).getTime() <= Date.now()
        );
        if (event) {
          claimFilter = { id: event.id, processing_status: "failed" };
        }
      } else {
        claimFilter = { id: event.id, processing_status: "received" };
      }
    }

    if (!event) {
      return Response.json({ success: true, message: "No events to process" });
    }

    // ── ATOMIC CLAIM ──
    // Use updateMany with a conditional filter that matches both the event ID
    // AND the current processing status. Only one concurrent invocation can
    // succeed because the database applies the filter atomically.
    const attempts = (event.processing_attempts || 0) + 1;
    const claimId = generateClaimId();
    const claimTime = new Date().toISOString();
    const claimResult = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.updateMany(
      claimFilter,
      {
        $set: {
          processing_status: "processing",
          processing_attempts: attempts,
          last_error: null,
          processing_started_at: claimTime,
          processing_claimed_by: user.email || user.id || "unknown",
          processing_claim_id: claimId,
        },
      }
    );

    // Check if the claim succeeded. If modified_count is 0, another
    // invocation already claimed this event.
    const claimed = claimResult && (claimResult.modified_count > 0 || claimResult.updated > 0);
    if (!claimed) {
      // Another invocation won the claim — return already_claimed without
      // invoking the handler.
      return Response.json({
        success: true,
        processing_status: "already_claimed",
        processed: false,
        event_id: event.id,
      });
    }

    // ── Claim succeeded — log timeline with claim ID ──
    await addTimelineEntry(base44, event.id, TIMELINE_STAGES.PROCESSING,
      `Processing attempt ${attempts}/${MAX_WEBHOOK_RETRIES} (atomic claim succeeded)`,
      "info", undefined, { attempt: attempts, max_retries: MAX_WEBHOOK_RETRIES, claim_id: claimId, claimed_by: user.email || user.id });

    await addTimelineEntry(base44, event.id, TIMELINE_STAGES.PROCESSING_CLAIMED,
      `Processing claimed by ${user.email || user.id || "unknown"}`,
      "info", undefined, { claim_id: claimId, claimed_by: user.email || user.id, processing_started_at: claimTime });

    // ── Route to handler ──
    const payload = JSON.parse(event.payload_json || "{}");
    const result = await routeEvent(base44, event.event_type, payload, event);

    // ── Handle result and update status ──
    if (result.success) {
      const finalStatus = result.finalStatus || "processed";
      await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(event.id, {
        processing_status: finalStatus,
        processed_at: finalStatus === "processed" ? new Date().toISOString() : event.processed_at,
        last_error: null,
        next_retry_at: null,
      });

      await addTimelineEntry(base44, event.id,
        finalStatus === "processed" ? TIMELINE_STAGES.COMPLETED : TIMELINE_STAGES.IGNORED,
        result.summary,
        finalStatus === "processed" ? "success" : "warning");

      return Response.json({ success: true, event_id: event.id, result });
    } else {
      const retryable = result.retryable !== false;

      if (!retryable) {
        await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(event.id, {
          processing_status: "ignored",
          last_error: result.error || result.summary,
          next_retry_at: null,
        });

        await addTimelineEntry(base44, event.id, TIMELINE_STAGES.IGNORED,
          `Event ignored (non-retryable): ${result.error || result.summary}`, "warning");

        return Response.json({
          success: false,
          event_id: event.id,
          processing_status: "ignored",
          error: result.error || result.summary,
        });
      }

      // ── Check Dead Letter Queue threshold ──
      if (attempts >= MAX_WEBHOOK_RETRIES) {
        const dlqReason = `Exceeded max retries (${MAX_WEBHOOK_RETRIES}): ${result.error || result.summary}`;

        await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(event.id, {
          processing_status: "dead_letter",
          last_error: result.error || result.summary,
          next_retry_at: null,
          dead_letter_at: new Date().toISOString(),
          dead_letter_reason: dlqReason,
          dead_letter_by_system: true,
        });

        await addTimelineEntry(base44, event.id, TIMELINE_STAGES.DEAD_LETTER,
          `Event entered Dead Letter Queue after ${attempts} attempts: ${result.error || result.summary}`,
          "error", undefined, { reason: dlqReason, attempts });

        await addTimelineEntry(base44, event.id, TIMELINE_STAGES.FAILED,
          `Processing failed permanently after ${attempts} attempts`, "error");

        await notifyDeadLetter(base44, event, result, attempts);

        console.error("[ST WEBHOOK DEAD LETTER]", {
          eventId: event.event_id || event.id,
          eventType: event.event_type,
          attempts,
          error: result.error || result.summary,
        });

        return Response.json({
          success: false,
          event_id: event.id,
          processing_status: "dead_letter",
          dead_letter: true,
          error: dlqReason,
        });
      }

      // ── Schedule retry ──
      const nextRetry = calculateNextRetry(attempts);
      await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(event.id, {
        processing_status: "failed",
        last_error: result.error || result.summary,
        next_retry_at: nextRetry,
      });

      await addTimelineEntry(base44, event.id, TIMELINE_STAGES.RETRY_SCHEDULED,
        `Retry ${attempts + 1}/${MAX_WEBHOOK_RETRIES} scheduled`,
        "warning", undefined, { next_retry_at: nextRetry, attempt: attempts });

      await addTimelineEntry(base44, event.id, TIMELINE_STAGES.FAILED,
        `Processing failed (attempt ${attempts}/${MAX_WEBHOOK_RETRIES}): ${result.error || result.summary}`,
        "error");

      console.error("[ST WEBHOOK PROCESSING ERROR]", {
        eventId: event.event_id || event.id,
        eventType: event.event_type,
        error: result.error || result.summary,
        retryable,
        attempt: attempts,
      });

      return Response.json({
        success: false,
        event_id: event.id,
        processing_status: "failed",
        retry_scheduled: true,
        next_retry_at: nextRetry,
        error: result.error || result.summary,
      });
    }
  } catch (error) {
    console.error("[ST WEBHOOK PROCESSOR ERROR]", {
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Create admin notifications and an audit log entry when a webhook
 * event enters the Dead Letter Queue.
 */
async function notifyDeadLetter(base44: any, event: any, result: any, attempts: number) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: `ST-DLQ-${event.id.substring(0, 12)}`,
      log_type: "event",
      source_module: "servicetitan_webhook",
      source_module_name: "ServiceTitan Webhook Processor",
      trigger_event: "dead_letter",
      trigger_event_name: "Webhook Dead Letter",
      event_payload_json: JSON.stringify({
        event_id: event.id,
        event_type: event.event_type,
        attempts,
        error: result.error || result.summary,
      }),
      related_record_id: event.id,
      status: "error",
      error_message: `Webhook event '${event.event_type}' (${event.event_id || event.id}) entered Dead Letter Queue after ${attempts} attempts. Last error: ${result.error || result.summary}`,
      triggered_by: "processServiceTitanWebhookEvent",
    });

    const admins = await base44.asServiceRole.entities.EmployeeRegistry.filter({
      base44_user_role: "admin",
      employment_status: "Active",
    });

    const { domain, action } = normalizeEvent(event.event_type);

    for (const admin of admins) {
      try {
        await base44.asServiceRole.entities.EnterpriseNotification.create({
          notification_id: `ST-DLQ-${event.id.substring(0, 8)}-${admin.id.substring(0, 8)}`,
          title: "Webhook Event Dead-Lettered",
          message: `ServiceTitan webhook event '${event.event_type}' (domain: ${domain}, action: ${action}) has failed after ${attempts} attempts and entered the Dead Letter Queue. Last error: ${result.error || result.summary}`,
          notification_type: "Critical",
          notification_purpose: "servicetitan_webhook_dead_letter",
          priority: "High",
          status: "Pending",
          source_module: "servicetitan_webhook",
          source_record_id: event.id,
          recipient_employee_registry_id: admin.id,
          recipient_email: admin.email,
          recipient_name: `${admin.first_name} ${admin.last_name}`,
          recipient_role: admin.primary_role || admin.base44_user_role,
          recipient_department: admin.department,
          requires_acknowledgment: true,
          delivery_methods: ["In-App"],
          sent_date: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.error("[ST DLQ NOTIFICATION ERROR]", {
          admin: admin.email,
          error: notifErr.message,
        });
      }
    }
  } catch (err) {
    console.error("[ST DLQ NOTIFY ERROR]", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}