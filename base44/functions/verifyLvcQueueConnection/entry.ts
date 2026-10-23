import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifyQueue, sanitizeMessage } from "../../shared/lvcQueuePostgres.ts";

/**
 * verifyLvcQueueConnection
 *
 * Owner-restricted verification that the LVC OS Base44 backend can reach
 * the Railway PostgreSQL Stage 1 queue through the isolated adapter.
 *
 * Performs:
 *   1. Confirms the LVC_QUEUE_DATABASE_URL secret exists (no value returned).
 *   2. Connects to Railway PostgreSQL via the adapter (secure TLS first;
 *      falls back to no-verify / no-SSL only to categorize the blocker).
 *   3. SELECT current_database(), current_user, now()
 *   4. Confirms the sync_requests table exists.
 *   5. Lists relevant Stage 1 queue functions by name.
 *   6. Lists relevant Stage 1 observability views by name.
 *   7. Returns a sanitized verification response (no credentials/URLs).
 *
 * Authorization: resolved server-side via base44.auth.me() (existing LVC OS
 * identity pattern). Request-body role/email/identity is never trusted.
 * Restricted to the Owner role (admin/owner). No production workflow is
 * modified; no queue records are submitted.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ connected: false, error: "unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ connected: false, error: "forbidden" }, { status: 403 });
    }

    const r = await verifyQueue();
    const status = r.connected ? 200 : (r.error_category === "missing_secret" ? 503 : 502);
    return Response.json(r, { status });
  } catch (error: any) {
    return Response.json(
      { connected: false, error: sanitizeMessage(error?.message || "verification_failed") },
      { status: 500 }
    );
  }
}