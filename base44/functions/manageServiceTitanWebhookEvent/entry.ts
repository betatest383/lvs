import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { addTimelineEntry, TIMELINE_STAGES } from "../../shared/stTimeline.ts";
import { recoverStaleEvent } from "../../shared/stRecovery.ts";
import { isStaleProcessing } from "../../shared/stWebhookHelpers.ts";

/**
 * ServiceTitan Webhook Event Management
 *
 * Admin/Owner-only backend function for managing webhook event lifecycle
 * actions that must NOT be performed directly from the UI.
 *
 * Supported actions:
 *   - recover_processing: Recover a stale "processing" event back to "received"
 *   - requeue: Reset a dead_letter/failed event back to 'received' for reprocessing
 *   - ignore: Mark an event as ignored (non-retryable, manually dismissed)
 *   - delete: Cascade-delete the webhook and ALL related timeline/replay records
 *
 * For every action, this function:
 *   1. Validates admin/owner permissions
 *   2. Writes an audit log (AutomationRunLog) — permanent record
 *   3. Creates timeline entries (where records still exist)
 *   4. Updates webhook status
 *   5. Returns a structured success/error response
 *
 * Referential integrity:
 *   delete cascades to ServiceTitanWebhookTimeline and ServiceTitanWebhookReplay
 *   so no orphaned records remain. The permanent audit trail lives in
 *   AutomationRunLog, which is NOT deleted.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin/owner only" }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Request body required" }, { status: 400 });
    }

    const action = body.action;
    const webhookEventId = body.webhook_event_id || body.webhookEventId;
    const reason = body.reason || "";

    if (!action || !["recover_processing", "requeue", "ignore", "delete"].includes(action)) {
      return Response.json(
        { error: "Invalid or missing action. Supported: recover_processing, requeue, ignore, delete" },
        { status: 400 }
      );
    }
    if (!webhookEventId) {
      return Response.json({ error: "webhook_event_id is required" }, { status: 400 });
    }

    // ── Load the webhook event ──
    const event = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.get(
      webhookEventId
    );
    if (!event) {
      return Response.json({ error: "Webhook event not found" }, { status: 404 });
    }

    const userDisplay = user.email || user.id;

    switch (action) {
      // ──────────────────────────────────────────────
      // RECOVER_PROCESSING: Recover a stale "processing" event
      // ──────────────────────────────────────────────
      case "recover_processing": {
        // Guard: only stale events can be recovered
        if (!isStaleProcessing(event)) {
          return Response.json({
            success: false,
            error: "Event is not stale — only events stuck in processing beyond the timeout can be recovered",
          }, { status: 400 });
        }

        // Guard: dead_letter and ignored events are never recoverable
        if (event.processing_status === "dead_letter" || event.processing_status === "ignored") {
          return Response.json({
            success: false,
            error: `${event.processing_status} events cannot be recovered`,
          }, { status: 400 });
        }

        const recoveryReason = reason || `Manual recovery by ${userDisplay}`;

        // Delegate to the shared atomic recovery logic
        const result = await recoverStaleEvent(base44, event, userDisplay, recoveryReason);

        if (!result.recovered) {
          return Response.json({
            success: false,
            error: result.reason,
          }, { status: 409 });
        }

        return Response.json({
          success: true,
          action: "recover_processing",
          webhook_event_id: webhookEventId,
          processing_status: "received",
          recovery_count: result.recovery_count,
          message: `Stale processing recovered (recovery #${result.recovery_count})`,
        });
      }

      // ──────────────────────────────────────────────
      // REQUEUE: Reset to 'received' for reprocessing
      // ──────────────────────────────────────────────
      case "requeue": {
        await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(webhookEventId, {
          processing_status: "received",
          processing_attempts: 0,
          next_retry_at: null,
          dead_letter_at: null,
          dead_letter_reason: null,
          dead_letter_by_system: false,
          last_error: null,
        });

        await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.REQUEUED,
          `Event requeued by ${userDisplay}${reason ? ` — ${reason}` : ""}`,
          "info", undefined, { user: userDisplay, reason });

        await writeAuditLog(base44, event, "requeue", userDisplay, reason);

        return Response.json({
          success: true,
          action: "requeue",
          webhook_event_id: webhookEventId,
          processing_status: "received",
          message: "Event requeued for processing",
        });
      }

      // ──────────────────────────────────────────────
      // IGNORE: Mark as manually dismissed
      // ──────────────────────────────────────────────
      case "ignore": {
        await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(webhookEventId, {
          processing_status: "ignored",
          next_retry_at: null,
        });

        await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.IGNORED,
          `Event ignored by ${userDisplay}${reason ? ` — ${reason}` : ""}`,
          "warning", undefined, { user: userDisplay, reason });

        await writeAuditLog(base44, event, "ignore", userDisplay, reason);

        return Response.json({
          success: true,
          action: "ignore",
          webhook_event_id: webhookEventId,
          processing_status: "ignored",
          message: "Event marked as ignored",
        });
      }

      // ──────────────────────────────────────────────
      // DELETE: Cascade-delete timeline + replays + event
      // ──────────────────────────────────────────────
      case "delete": {
        // Timeline entry is created BEFORE cascade deletion so the
        // deletion is recorded. The timeline records themselves are
        // then deleted as part of the cascade. The permanent audit
        // trail lives in AutomationRunLog (writeAuditLog).
        await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.DELETED,
          `Event deleted by ${userDisplay}${reason ? ` — ${reason}` : ""}`,
          "warning", undefined, { user: userDisplay, reason });

        // Cascade-delete all related records — no orphans
        await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.deleteMany({
          webhook_event_id: webhookEventId,
        });

        await base44.asServiceRole.entities.ServiceTitanWebhookReplay.deleteMany({
          webhook_event_id: webhookEventId,
        });

        // Delete the webhook event itself
        await base44.asServiceRole.entities.ServiceTitanWebhookEvent.delete(webhookEventId);

        // Permanent audit record (uses the snapshot loaded before deletion)
        await writeAuditLog(base44, event, "delete", userDisplay, reason);

        return Response.json({
          success: true,
          action: "delete",
          webhook_event_id: webhookEventId,
          message: "Event and all related records deleted",
        });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[ST WEBHOOK MANAGE ERROR]", {
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Write a permanent audit log entry for a webhook management action.
 * This record survives even if the webhook event is deleted.
 */
async function writeAuditLog(
  base44: any,
  event: any,
  action: string,
  userDisplay: string,
  reason: string
) {
  try {
    const logId = `ST-MGMT-${event.id.substring(0, 12)}-${action}`.toUpperCase();

    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: logId,
      log_type: "event",
      source_module: "servicetitan_webhook",
      source_module_name: "ServiceTitan Webhook Management",
      trigger_event: action,
      trigger_event_name: `Webhook ${action}`,
      event_payload_json: JSON.stringify({
        webhook_event_id: event.id,
        event_type: event.event_type,
        event_id: event.event_id,
        object_id: event.object_id,
        previous_status: event.processing_status,
        action,
        reason,
        user: userDisplay,
      }),
      related_record_id: event.id,
      status: "success",
      triggered_by: "manageServiceTitanWebhookEvent",
      employee: userDisplay,
    });
  } catch (err) {
    console.error("[ST WEBHOOK AUDIT LOG ERROR]", {
      action,
      webhookEventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}