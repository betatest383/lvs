import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import {
  hashPayload,
  extractEventMetadata,
  isKnownEventType,
} from "../../shared/stWebhookHelpers.ts";
import { addTimelineEntry, TIMELINE_STAGES } from "../../shared/stTimeline.ts";

/**
 * ServiceTitan Webhook Receiver
 *
 * Secure, observable, idempotent webhook ingestion endpoint.
 *
 * Responsibilities:
 *   - Validate the webhook using a shared secret
 *   - Parse the JSON payload safely
 *   - Normalize event metadata from the raw HTTP request (never from frontend)
 *   - Check for duplicate deliveries (event_id or payload_hash)
 *   - Store the complete original payload
 *   - Create timeline entries (received, validated, stored, queued/ignored)
 *   - Return a fast 2xx acknowledgment
 *
 * Does NOT perform workflow processing — that is handled by
 * processServiceTitanWebhookEvent.
 *
 * Test mode: administrators can submit sample payloads via SDK invocation
 * with _testMode: true. This authenticates via base44.auth.me() and skips
 * the shared secret check, without exposing the endpoint to unauthenticated
 * requests in production.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    // Read raw body once — needed for both hash and parsing
    const rawBody = await req.text();

    // Parse JSON safely
    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Invalid JSON — handled after auth check to avoid leaking info
    }

    // ── Test mode: admin-authenticated sample submission ──
    let isTestMode = false;
    if (payload && payload._testMode === true) {
      try {
        const user = await base44.auth.me();
        if (!user || (user.role !== "admin" && user.role !== "owner")) {
          return Response.json(
            { error: "Test mode requires admin authentication" },
            { status: 403 }
          );
        }
        isTestMode = true;
        // Remove the test flag so it's not stored in the payload
        delete payload._testMode;
      } catch {
        return Response.json(
          { error: "Test mode requires authentication" },
          { status: 401 }
        );
      }
    }

    // ── Authentication (skip in test mode) ──
    if (!isTestMode) {
      const webhookSecret = url.searchParams.get("secret");
      const configuredSecret = Deno.env.get("SERVICETITAN_WEBHOOK_SECRET");
      if (!configuredSecret || webhookSecret !== configuredSecret) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // ── Normalize event metadata ──
    const meta = extractEventMetadata(payload, req.headers);
    const receivedAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    const payloadHash = await hashPayload(payloadJson);

    // ── Idempotency: check for duplicate event ──
    let existing: any[] = [];
    if (meta.eventId) {
      existing = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter(
        { event_id: meta.eventId },
        "-received_at",
        1
      );
    }
    if (existing.length === 0) {
      existing = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter(
        { payload_hash: payloadHash },
        "-received_at",
        1
      );
    }

    if (existing.length > 0) {
      console.log("[ST WEBHOOK DUPLICATE]", {
        eventId: meta.eventId || "(none)",
        payloadHash,
      });
      return Response.json({ success: true, duplicate: true });
    }

    // ── Determine initial processing status ──
    const knownEvent = isKnownEventType(meta.eventType);
    const initialStatus = knownEvent ? "received" : "ignored";

    // ── Store the event ──
    const event = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.create({
      event_id: meta.eventId || "",
      event_type: meta.eventType,
      tenant_id: meta.tenantId || "",
      object_id: meta.objectId,
      object_type: meta.objectType,
      event_timestamp: meta.eventTimestamp || null,
      received_at: receivedAt,
      payload_json: payloadJson,
      payload_hash: payloadHash,
      processing_status: initialStatus,
      processing_attempts: 0,
      processed_at: null,
      last_error: null,
      next_retry_at: null,
      source: "servicetitan",
    });

    // ── Create timeline entries for the reception lifecycle ──
    await addTimelineEntry(base44, event.id, TIMELINE_STAGES.RECEIVED,
      `Webhook received: ${meta.eventType}`, "info", undefined,
      { event_id: meta.eventId, object_id: meta.objectId, object_type: meta.objectType });

    await addTimelineEntry(base44, event.id, TIMELINE_STAGES.VALIDATED,
      "Payload validated and authenticated", "success");

    await addTimelineEntry(base44, event.id, TIMELINE_STAGES.STORED,
      "Event stored in database", "success", undefined,
      { payload_hash: payloadHash.substring(0, 16) });

    if (knownEvent) {
      await addTimelineEntry(base44, event.id, TIMELINE_STAGES.QUEUED,
        "Event queued for processing", "info");
    } else {
      await addTimelineEntry(base44, event.id, TIMELINE_STAGES.IGNORED,
        `Unknown event type '${meta.eventType}' — ignored`, "warning");
    }

    console.log("[ST WEBHOOK RECEIVED]", {
      eventId: meta.eventId || event.id,
      eventType: meta.eventType,
      objectId: meta.objectId,
      receivedAt,
    });

    // ── Fast acknowledgment ──
    return Response.json(
      {
        success: true,
        received: true,
        event_id: meta.eventId || null,
        processing_status: initialStatus,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[ST WEBHOOK ERROR]", {
      error: error.message,
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
});