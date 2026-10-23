import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { findAndRecoverStaleEvents } from "../../shared/stRecovery.ts";
import { requireSchedulerSecret } from "../../shared/securityAuth.ts";

/**
 * ServiceTitan Webhook Stale-Processing Recovery Job (SECURED)
 *
 * Scheduled automation (every 5 minutes) that locates webhook events stuck
 * in "processing" status beyond the configured timeout and recovers them
 * back to "received" for reprocessing.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Removes the fallback that permitted execution when the secret is missing
 *   - Rejects when the server secret is not configured (500 configuration error)
 *   - Rejects when secret is missing from request (403)
 *   - Rejects when secret is incorrect (403)
 *   - Does not treat absent authentication as a development convenience
 *   - Prevents body-supplied identity or role claims
 *   - Uses constant-time secret comparison
 *   - Restricts recovery to stale eligible webhook records only
 *   - Preserves immutable event identity and idempotency
 *   - Logs every recovery execution
 *
 * Required behavior:
 *   secret missing from server configuration → 500 configuration error
 *   secret missing from request → 403
 *   secret incorrect → 403
 *   valid scheduler secret → allowed
 *   authenticated Owner without approved invocation path → denied unless
 *     also providing valid scheduler secret
 *
 * Allowed invocation types:
 *   - Scheduled automation with valid scheduler secret
 *   - Authenticated admin/owner with valid scheduler secret
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authentication: X-LVC-Scheduler-Secret header required ──
    // No authenticated browser user may bypass this requirement.
    // No body/query/env-name secret accepted.
    const authResult = requireSchedulerSecret(req);
    if (authResult.error) {
      console.log("[ST STALE RECOVERY] Rejected: authentication failed");
      return authResult.error;
    }

    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* scheduled invocation */ }

    // ── Authorized: proceed with recovery ──
    const summary = await findAndRecoverStaleEvents(
      base44,
      user?.email || "system",
      "Automatic stale-processing recovery (scheduled)"
    );

    console.log("[ST STALE RECOVERY JOB]", JSON.stringify(summary));

    return Response.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("[ST STALE RECOVERY JOB ERROR]", {
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
}