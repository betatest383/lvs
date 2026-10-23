import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { routeEvent, getHandler } from "../../shared/stEventRouter.ts";
import { isStaleProcessing, normalizeEvent } from "../../shared/stWebhookHelpers.ts";
import { recoverStaleEvent } from "../../shared/stRecovery.ts";
import { addTimelineEntry, TIMELINE_STAGES } from "../../shared/stTimeline.ts";

/**
 * ServiceTitan Webhook Replay
 *
 * Admin/Owner-only function that replays a previously received webhook
 * event by routing its stored payload back through the event router.
 *
 * What Replay DOES:
 *   ✔ Reuses the stored payload and event metadata
 *   ✔ Reuses the same routing logic (routeEvent)
 *   ✔ Reuses the same handler
 *   ✔ Generates normal [ST ROUTER] / [ST HANDLER] logs
 *   ✔ Creates timeline entries (replay_started, replay_finished)
 *   ✔ Creates a new ServiceTitanWebhookReplay record (processing attempt)
 *   ✔ Updates replay audit fields on the original webhook event
 *
 * What Replay does NOT do:
 *   ✘ Create another ServiceTitanWebhookEvent record
 *   ✘ Overwrite the original payload
 *   ✘ Change the original received_at timestamp
 *   ✘ Modify payload_hash
 *   ✘ Modify processing_status / processing_attempts / last_error
 *
 * Required parameter:
 *   webhook_event_id — entity ID of the ServiceTitanWebhookEvent to replay
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

    const webhookEventId = body.webhook_event_id || body.webhookEventId;
    if (!webhookEventId) {
      return Response.json({ error: "webhook_event_id is required" }, { status: 400 });
    }

    // ── Load the original webhook event ──
    const event = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.get(
      webhookEventId
    );
    if (!event) {
      return Response.json({ error: "Webhook event not found" }, { status: 404 });
    }

    // ── Stale-processing recovery before replay ──
    // If the event is stuck in "processing" beyond the timeout, recover it
    // first so we don't replay a permanently locked event.
    let recoveredBeforeReplay = false;
    if (isStaleProcessing(event)) {
      const recoveryResult = await recoverStaleEvent(
        base44, event, user.email || user.id,
        `Recovered before replay by ${user.email || user.id}`
      );
      if (recoveryResult.recovered) {
        recoveredBeforeReplay = true;
        await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.REPLAY_STARTED,
          `Recovered before replay — stale processing recovered (recovery #${recoveryResult.recovery_count})`,
          "warning", undefined,
          { recovered_before_replay: true, recovery_count: recoveryResult.recovery_count });

        // Reload the event after recovery so the replay uses the updated state
        const refreshedEvent = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.get(webhookEventId);
        if (refreshedEvent) {
          Object.assign(event, refreshedEvent);
        }
      } else {
        return Response.json({
          success: false,
          error: `Cannot replay — event is in processing status but recovery failed: ${recoveryResult.reason}`,
        }, { status: 409 });
      }
    }

    // ── Determine replay attempt number ──
    const attemptNumber = (event.replay_count || 0) + 1;
    const handler = getHandler(event.event_type);
    const { domain, action } = normalizeEvent(event.event_type);
    const startTime = Date.now();

    console.log("[ST WEBHOOK REPLAY]", JSON.stringify({
      event_id: event.event_id || event.id,
      event_type: event.event_type,
      domain,
      action,
      handler: handler.name,
      user: user.email,
      attempt: attemptNumber,
    }));

    // ── Timeline: replay started ──
    await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.REPLAY_STARTED,
      `Replay initiated by ${user.email} (attempt ${attemptNumber})`,
      "info", undefined, { domain, action, handler: handler.name, user: user.email });

    // ── Route through the same event router ──
    const payload = JSON.parse(event.payload_json || "{}");
    const result = await routeEvent(base44, event.event_type, payload, event);
    const duration = Date.now() - startTime;

    // ── Create replay history record ──
    const replayRecord = await base44.asServiceRole.entities.ServiceTitanWebhookReplay.create({
      webhook_event_id: webhookEventId,
      event_type: event.event_type,
      handler_name: handler.name,
      replayed_by: user.email || "unknown",
      replayed_by_user_id: user.id,
      replayed_at: new Date().toISOString(),
      result: result.summary || "",
      duration_ms: duration,
      success: result.success,
      error: result.error || "",
      processing_attempt: attemptNumber,
      final_status: result.success
        ? (result.finalStatus || "processed")
        : (result.retryable === false ? "ignored" : "failed"),
      warnings_json: result.warnings ? JSON.stringify(result.warnings) : "",
    });

    // ── Update original event's replay audit fields ──
    // Does NOT touch payload, received_at, payload_hash, or processing lifecycle
    await base44.asServiceRole.entities.ServiceTitanWebhookEvent.update(webhookEventId, {
      replay_count: attemptNumber,
      last_replay_at: new Date().toISOString(),
      last_replay_by: user.email || "unknown",
      last_replay_result: result.success
        ? (result.summary || "Success")
        : (result.error || "Failed"),
    });

    // ── Timeline: replay finished ──
    await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.REPLAY_FINISHED,
      result.success
        ? `Replay succeeded: ${result.summary}`
        : `Replay failed: ${result.error || result.summary}`,
      result.success ? "success" : "error",
      duration,
      { domain, action, handler: handler.name });

    console.log("[ST WEBHOOK REPLAY]", JSON.stringify({
      event_id: event.event_id || event.id,
      event_type: event.event_type,
      domain,
      action,
      handler: handler.name,
      user: user.email,
      duration,
      success: result.success,
    }));

    return Response.json({
      success: result.success,
      replay_id: replayRecord.id,
      webhook_event_id: webhookEventId,
      handler_name: handler.name,
      result: result.summary || "",
      duration_ms: duration,
      recovered_before_replay: recoveredBeforeReplay,
      error: result.error || undefined,
    });
  } catch (error) {
    console.error("[ST WEBHOOK REPLAY ERROR]", {
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});