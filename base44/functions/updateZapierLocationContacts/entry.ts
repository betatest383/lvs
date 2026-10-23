import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { requireCrmWebhook } from "../../shared/securityAuth.ts";

/**
 * Zapier → LVC OS Location Contact Update Receiver
 *
 * Authenticated Zapier ingress endpoint that performs a PARTIAL UPDATE of the
 * contact fields on an EXISTING Base44 Location record. It never creates a
 * Location — every location_id is validated to exist before any write.
 *
 * Handler pattern: Deno.serve + createClientFromRequest (SDK 0.8.31), matching
 * the proven servicetitanWebhook / receiveZapierJobSnapshot receivers. This is
 * the pattern the Base44 public-URL webhook gateway executes asynchronously;
 * `export default async function` is NOT executed for write operations via
 * the public URL.
 *
 * Security:
 *   - POST only
 *   - Content-Type: application/json required
 *   - Authenticates SOLELY via X-CRM-Webhook-Secret header against
 *     CRM_WEBHOOK_SECRET (constant-time comparison via
 *     securityAuth.requireCrmWebhook). This endpoint is invoked by Zapier
 *     server-to-server and has NO Base44 session — it MUST NOT depend on a
 *     signed-in user. base44.auth.me() is never called.
 *   - Fail-closed if the environment secret is absent
 *   - Never accepts auth from URL, query string, or body
 *   - Never logs or returns the secret
 *
 * Contract:
 *   Request body:
 *     {
 *       "location_id":   "<Base44 Location record ID>",
 *       "contact_name":  "<string>",
 *       "contact_email":  "<string>",
 *       "contact_phone": "<string>"
 *     }
 *   - Only contact_name, contact_email, contact_phone are ever written.
 *   - location_id is required. At least one contact field is required.
 *   - All other Location fields are preserved untouched.
 *   - Returns 404 when the Location does not exist; never creates one.
 *   - Repeated identical requests are idempotent (no write when values already match).
 */

const CONTACT_FIELDS = ["contact_name", "contact_email", "contact_phone"];

Deno.serve(async (req: Request): Promise<Response> => {
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

    // ── Authentication: X-CRM-Webhook-Secret header ONLY ──
    // Zapier invokes this server-to-server with no Base44 session. The shared
    // secret is the SOLE authentication factor. There is no auth.me() call and
    // no admin/owner session path — the endpoint must work for a fully
    // anonymous external POST that supplies only the valid secret header.
    stage = "auth";
    const auth = requireCrmWebhook(req);
    if (auth.error) {
      // requireCrmWebhook returns 500 (unconfigured) or 403 (bad/missing secret)
      return auth.error;
    }

    // ── Parse body ──
    stage = "parse";
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Malformed JSON — request body is not valid JSON", stage }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid request body — JSON root must be an object", stage }, { status: 400 });
    }

    // ── location_id ──
    stage = "validate_location_id";
    const locationId = typeof body.location_id === "string" ? body.location_id.trim() : "";
    if (!locationId) {
      return Response.json({ error: "location_id is required", stage }, { status: 422 });
    }

    // ── Build update payload (contact fields only) ──
    stage = "validate_fields";
    const update: Record<string, any> = {};
    for (const field of CONTACT_FIELDS) {
      if (field in body) {
        const val = body[field];
        if (val !== undefined && val !== null) {
          // Coerce to string: Zapier (Code by Zapier) may emit numbers/booleans
          // for contact fields; Location.update enforces string types and
          // throws "Input should be a valid string" (→ 500) on non-strings.
          update[field] = typeof val === "string" ? val.trim() : String(val);
        }
      }
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: "At least one contact field is required (contact_name, contact_email, contact_phone)", stage }, { status: 422 });
    }

    // ── Validate the Location exists (never create) ──
    stage = "lookup_location";
    let location: any = null;
    try {
      location = await base44.asServiceRole.entities.Location.get(locationId);
    } catch {
      return Response.json({ error: "Location not found — creation is not permitted by this endpoint", location_id: locationId, stage }, { status: 404 });
    }
    if (!location) {
      return Response.json({ error: "Location not found — creation is not permitted by this endpoint", location_id: locationId, stage }, { status: 404 });
    }

    // ── Idempotency: skip the write when every supplied value already matches ──
    let changed = false;
    for (const [field, val] of Object.entries(update)) {
      if (location[field] !== val) { changed = true; break; }
    }

    stage = "update";
    let updated: any = location;
    if (changed) {
      updated = await base44.asServiceRole.entities.Location.update(locationId, update);
    }

    return Response.json({
      success: true,
      action: changed ? "updated" : "no_change",
      location_id: locationId,
      updated_fields: Object.keys(update),
      location: {
        id: updated?.id ?? locationId,
        contact_name: updated?.contact_name ?? location.contact_name ?? "",
        contact_email: updated?.contact_email ?? location.contact_email ?? "",
        contact_phone: updated?.contact_phone ?? location.contact_phone ?? "",
        customer_id: updated?.customer_id ?? location.customer_id ?? "",
        customer_name: updated?.customer_name ?? location.customer_name ?? "",
        crm_location_id: updated?.crm_location_id ?? location.crm_location_id ?? "",
        location_id_field: updated?.location_id ?? location.location_id ?? "",
        location_label: updated?.location_label ?? location.location_label ?? "",
        address: updated?.address ?? location.address ?? "",
        city: updated?.city ?? location.city ?? "",
        state: updated?.state ?? location.state ?? "",
        zip: updated?.zip ?? location.zip ?? "",
        bill_to_customer: updated?.bill_to_customer ?? location.bill_to_customer ?? true,
        notes: updated?.notes ?? location.notes ?? "",
        is_active: updated?.is_active ?? location.is_active ?? true,
      },
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ZAPIER LOCATION CONTACTS UPDATE ERROR]", { stage, message });
    return Response.json({ error: "Internal server error", stage, message }, { status: 500 });
  }
});