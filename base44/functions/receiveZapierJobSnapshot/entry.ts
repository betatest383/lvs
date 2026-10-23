import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { timingSafeEqual } from "../../shared/securityAuth.ts";
import { hashPayload } from "../../shared/stWebhookHelpers.ts";
import { validateEnvelope, buildRequestMetadata } from "../../shared/zapierJobSnapshotValidator.ts";

/**
 * Zapier → LVC OS ServiceTitan Job Snapshot Receiver
 *
 * Authenticated, idempotent, diagnostic-only ingress endpoint for ServiceTitan
 * job snapshots produced by Zapier. This is a Zapier-to-LVC-OS receiver and is
 * NOT the direct ServiceTitan webhook (servicetitanWebhook); that contract is
 * untouched.
 *
 * Security:
 *   - POST only
 *   - Content-Type: application/json required
 *   - Authenticates via X-CRM-Webhook-Secret header against CRM_WEBHOOK_SECRET
 *   - Fail-closed if the environment secret is absent
 *   - Never accepts auth from URL, query string, or body
 *   - Never logs or returns the secret
 *   - Constant-time secret comparison (timingSafeEqual)
 *
 * Idempotency:
 *   - Idempotency-Key header required
 *   - SHA-256 payload hash of the raw body
 *   - Same key + same hash → duplicate (returns original staging record id)
 *   - Same key + different hash → 409 conflict
 *
 * Staging:
 *   - Stores only in ZapierJobSnapshotEvent (admin-only RLS, service-role writes)
 *   - No canonical operational writes (customer, job, appointment, technician,
 *     task, estimate, invoice, inventory, calendar) are performed.
 *
 * Test mode (admin-authenticated, mirrors the servicetitanWebhook _testMode
 * convention): when the parsed body contains _testMode: true, the caller must
 * be an authenticated admin/owner. Test mode simulates the X-CRM-Webhook-Secret
 * and Idempotency-Key values from the body so the receiver can be exercised via
 * the SDK test harness (which cannot set custom HTTP headers). External
 * unauthenticated requests cannot reach test mode.
 */

const PROCESSING_STATE = "diagnostic_received";
const SECRET_HEADER = "X-CRM-Webhook-Secret";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const SECRET_ENV = "CRM_WEBHOOK_SECRET";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let stage = "request";
  try {
    // ── Method ──
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed", stage }, { status: 405 });
    }

    // ── Content-Type ──
    const contentTypeRaw = req.headers.get("content-type") || "";
    const contentType = contentTypeRaw.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return Response.json({ error: "Unsupported Media Type — Content-Type must be application/json", stage }, { status: 415 });
    }

    // ── Read raw body once ──
    const rawBody = await req.text();

    // ── Test-mode detection (parse for _testMode flag; malformed JSON handled later) ──
    let isTestMode = false;
    let testSecret = "valid";
    let testIdempotencyKey: string | undefined;
    let testRawBody: string | null = null;
    let cleanedRawBody = rawBody;
    let parsedForTest: any = null;
    try { parsedForTest = JSON.parse(rawBody); } catch { /* malformed — handled in validation */ }
    if (parsedForTest && typeof parsedForTest === "object" && !Array.isArray(parsedForTest) && parsedForTest._testMode === true) {
      try {
        const user = await base44.auth.me();
        if (!user || (user.role !== "admin" && user.role !== "owner")) {
          return Response.json({ error: "Test mode requires admin authentication" }, { status: 403 });
        }
      } catch {
        return Response.json({ error: "Test mode requires authentication" }, { status: 401 });
      }
      isTestMode = true;
      testSecret = typeof parsedForTest._testSecret === "string" ? parsedForTest._testSecret : "valid";
      testIdempotencyKey = typeof parsedForTest._testIdempotencyKey === "string" ? parsedForTest._testIdempotencyKey : undefined;
      testRawBody = typeof parsedForTest._testRawBody === "string" ? parsedForTest._testRawBody : null;

      // Cleaned envelope = parsed body with all _test* fields removed.
      const cleanedEnvelope: any = { ...parsedForTest };
      for (const k of Object.keys(cleanedEnvelope)) {
        if (k.startsWith("_test")) delete cleanedEnvelope[k];
      }
      cleanedRawBody = testRawBody != null ? testRawBody : JSON.stringify(cleanedEnvelope);
    }

    // ── Authentication ──
    stage = "auth";
    if (isTestMode) {
      if (testSecret === "missing" || testSecret === "invalid") {
        return Response.json({ error: "Unauthorized — valid X-CRM-Webhook-Secret header required", stage }, { status: 401 });
      }
      // "valid" → bypass secret check (admin-authenticated test mode)
    } else {
      const configuredSecret = Deno.env.get(SECRET_ENV) || "";
      if (!configuredSecret) {
        return Response.json({ error: "Server not configured — CRM_WEBHOOK_SECRET not set", stage }, { status: 500 });
      }
      const provided = req.headers.get(SECRET_HEADER) || "";
      if (!provided || !timingSafeEqual(provided, configuredSecret)) {
        return Response.json({ error: "Unauthorized — valid X-CRM-Webhook-Secret header required", stage }, { status: 401 });
      }
    }

    // ── Parse envelope (400 malformed JSON) ──
    stage = "parse";
    let envelope: any = null;
    try {
      envelope = JSON.parse(cleanedRawBody);
    } catch {
      return Response.json({ error: "Malformed JSON — request body is not valid JSON", stage }, { status: 400 });
    }
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      return Response.json({ error: "Invalid request body — JSON root must be an object", stage }, { status: 400 });
    }

    // ── Idempotency-Key required ──
    stage = "idempotency";
    const idempotencyKey = isTestMode
      ? (testIdempotencyKey || "")
      : (req.headers.get(IDEMPOTENCY_HEADER) || "");
    if (!idempotencyKey || !idempotencyKey.trim()) {
      return Response.json({ error: "Idempotency-Key header is required", stage }, { status: 422 });
    }

    // ── Validate envelope (422) ──
    stage = "validate";
    const validation = validateEnvelope(envelope);
    if (!validation.valid) {
      return Response.json({ error: validation.error, stage: validation.stage || stage }, { status: validation.status });
    }
    const parsedSnapshot = validation.parsedSnapshot;

    // ── Payload hash ──
    const payloadHash = await hashPayload(cleanedRawBody);

    // ── Idempotency lookup ──
    stage = "dedupe";
    const existing = await base44.asServiceRole.entities.ZapierJobSnapshotEvent.filter(
      { idempotency_key: idempotencyKey },
      "-received_at",
      1,
    );
    if (existing.length > 0) {
      const orig = existing[0];
      if (orig.payload_hash === payloadHash) {
        // Duplicate — return original staging record id, do not create another record.
        return Response.json({
          success: true,
          accepted: true,
          diagnostic_only: true,
          duplicate: true,
          integration_event_id: orig.id,
          job_id: orig.servicetitan_job_id,
          idempotency_key: orig.idempotency_key,
          correlation_id: orig.correlation_id,
          processing_state: PROCESSING_STATE,
        }, { status: 200 });
      }
      // Same key, different payload → conflict.
      return Response.json({ error: "Idempotency key reused with a different payload", stage }, { status: 409 });
    }

    // ── Correlation ID (preserve or generate) ──
    const correlationId = (typeof envelope.correlation_id === "string" && envelope.correlation_id.trim())
      ? envelope.correlation_id.trim()
      : crypto.randomUUID();

    // ── Sanitized request metadata (no credentials) ──
    const requestMetadata = buildRequestMetadata(
      req.method,
      req.headers.get("content-type") || "",
      req.headers.get("user-agent") || "",
      req.headers.get("host") || "",
    );

    // ── Store diagnostic staging record (service-role) ──
    stage = "store";
    const record = await base44.asServiceRole.entities.ZapierJobSnapshotEvent.create({
      event_id: `ZJS-${crypto.randomUUID()}`,
      source_system: envelope.source || "zapier",
      source_environment: envelope.environment || "",
      event_type: envelope.event_type,
      servicetitan_job_id: envelope.job_id,
      schema_version: envelope.schema_version,
      raw_envelope: cleanedRawBody,
      snapshot_json: envelope.snapshot_json,
      parsed_payload: JSON.stringify(parsedSnapshot),
      payload_hash: payloadHash,
      idempotency_key: idempotencyKey,
      correlation_id: correlationId,
      received_at: new Date().toISOString(),
      validation_result: "valid",
      processing_state: PROCESSING_STATE,
      error_info: "",
      retry_count: 0,
      request_metadata: requestMetadata,
      is_test_data: isTestMode,
      notes: isTestMode ? "Synthetic diagnostic record created via admin-authenticated test mode. Non-production." : "",
    });

    return Response.json({
      success: true,
      accepted: true,
      diagnostic_only: true,
      duplicate: false,
      integration_event_id: record.id,
      job_id: envelope.job_id,
      idempotency_key: idempotencyKey,
      correlation_id: correlationId,
      processing_state: PROCESSING_STATE,
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ZAPIER JOB SNAPSHOT ERROR]", { stage, message });
    return Response.json({ error: "Internal server error", stage }, { status: 500 });
  }
});