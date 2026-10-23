/**
 * LVC OS Security Authentication Helpers (CORRECTED)
 *
 * SECURITY INVARIANTS:
 *   1. Environment-variable names are NEVER read from request data.
 *      The server reads only hardcoded env var names.
 *   2. Secrets are accepted ONLY from request headers, never from body/query.
 *   3. Constant-time comparison prevents timing attacks.
 *   4. Caller-supplied identity is NEVER trusted.
 *
 * SECRET OWNERSHIP:
 *   LVC_SCHEDULER_SECRET           — scheduled maintenance functions (header: X-LVC-Scheduler-Secret)
 *   LVC_INTERNAL_AUTOMATION_SECRET — Base44 entity-automation functions (header: X-LVC-Internal-Automation-Secret)
 *   SERVICETITAN_WEBHOOK_SECRET    — ServiceTitan webhook endpoints (header: X-ServiceTitan-Signature)
 *   CRM_WEBHOOK_SECRET             — CRM/Zapier webhook endpoints (header: X-CRM-Webhook-Secret)
 *
 * PLATFORM LIMITATION:
 *   Base44 automations (entity-automation and scheduled) invoke functions via HTTP POST
 *   with function_args in the request body. The platform does NOT currently support
 *   setting custom HTTP headers on automation-triggered invocations.
 *   This means header-based secret authentication cannot be satisfied by Base44
 *   automations at this time. Functions requiring header-based secrets will reject
 *   automation invocations until the platform supports custom headers or an
 *   alternative secure channel is established.
 */

/** Constant-time string comparison to prevent timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encA = new TextEncoder().encode(a);
  const encB = new TextEncoder().encode(b);
  if (encA.length !== encB.length) return false;
  let diff = 0;
  for (let i = 0; i < encA.length; i++) {
    diff |= encA[i] ^ encB[i];
  }
  return diff === 0;
}

/** Read a secret from a HARDCODED environment-variable name. Never from request data. */
function readSecret(envName: string): string {
  return Deno.env.get(envName) || "";
}

/** Verify a secret provided via request header using constant-time comparison. */
function verifyHeaderSecret(req: Request, headerName: string, expectedSecret: string): boolean {
  if (!expectedSecret) return false;
  const provided = req.headers.get(headerName) || "";
  if (!provided) return false;
  return timingSafeEqual(provided, expectedSecret);
}

export interface AuthResult {
  user: any | null;
  error?: Response;
}

// ── Machine-call auth (header-only, hardcoded env var) ──

/** Require X-LVC-Scheduler-Secret header. For scheduled maintenance functions. */
export function requireSchedulerSecret(req: Request): AuthResult {
  const expected = readSecret("LVC_SCHEDULER_SECRET");
  if (!expected) {
    return { user: null, error: Response.json(
      { error: "Server not configured — LVC_SCHEDULER_SECRET not set" },
      { status: 500 }
    )};
  }
  if (!verifyHeaderSecret(req, "X-LVC-Scheduler-Secret", expected)) {
    return { user: null, error: Response.json(
      { error: "Forbidden — valid X-LVC-Scheduler-Secret header required" },
      { status: 403 }
    )};
  }
  return { user: null };
}

/** Require X-LVC-Internal-Automation-Secret header. For Base44 entity-automation functions. */
export function requireInternalAutomationSecret(req: Request): AuthResult {
  const expected = readSecret("LVC_INTERNAL_AUTOMATION_SECRET");
  if (!expected) {
    return { user: null, error: Response.json(
      { error: "Server not configured — LVC_INTERNAL_AUTOMATION_SECRET not set" },
      { status: 500 }
    )};
  }
  if (!verifyHeaderSecret(req, "X-LVC-Internal-Automation-Secret", expected)) {
    return { user: null, error: Response.json(
      { error: "Forbidden — valid X-LVC-Internal-Automation-Secret header required" },
      { status: 403 }
    )};
  }
  return { user: null };
}

/** Require X-CRM-Webhook-Secret header. For CRM/Zapier webhook endpoints. */
export function requireCrmWebhook(req: Request): AuthResult {
  const expected = readSecret("CRM_WEBHOOK_SECRET");
  if (!expected) {
    return { user: null, error: Response.json(
      { error: "Server not configured — CRM_WEBHOOK_SECRET not set" },
      { status: 500 }
    )};
  }
  if (!verifyHeaderSecret(req, "X-CRM-Webhook-Secret", expected)) {
    return { user: null, error: Response.json(
      { error: "Forbidden — valid X-CRM-Webhook-Secret header required" },
      { status: 403 }
    )};
  }
  return { user: null };
}

/** Require X-ServiceTitan-Signature header. For ServiceTitan webhook endpoints. */
export function requireServiceTitanWebhook(req: Request): AuthResult {
  const expected = readSecret("SERVICETITAN_WEBHOOK_SECRET");
  if (!expected) {
    return { user: null, error: Response.json(
      { error: "Server not configured — SERVICETITAN_WEBHOOK_SECRET not set" },
      { status: 500 }
    )};
  }
  if (!verifyHeaderSecret(req, "X-ServiceTitan-Signature", expected)) {
    return { user: null, error: Response.json(
      { error: "Forbidden — valid X-ServiceTitan-Signature header required" },
      { status: 403 }
    )};
  }
  return { user: null };
}

// ── User auth (session-based) ──

/** Require an authenticated user (any role). Returns 401 if not authenticated. */
export async function requireAuthenticatedUser(base44: any): Promise<AuthResult> {
  let user: any = null;
  try { user = await base44.auth.me(); } catch { /* not authenticated */ }
  if (!user) {
    return { user: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

/** Require authenticated admin or owner. Returns 401/403 if not. */
export async function requireAdminOrOwner(base44: any): Promise<AuthResult> {
  let user: any = null;
  try { user = await base44.auth.me(); } catch { /* not authenticated */ }
  if (!user) {
    return { user: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return { user: null, error: Response.json(
      { error: "Forbidden — admin or owner access required" },
      { status: 403 }
    )};
  }
  return { user };
}

/** Require authenticated owner only. Returns 401/403 if not. */
export async function requireOwnerOnly(base44: any): Promise<AuthResult> {
  let user: any = null;
  try { user = await base44.auth.me(); } catch { /* not authenticated */ }
  if (!user) {
    return { user: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "owner") {
    return { user: null, error: Response.json(
      { error: "Forbidden — owner access required" },
      { status: 403 }
    )};
  }
  return { user };
}

// ── Combined Admin/Owner OR Scheduler-Secret Authorization ──

export interface AuthDecision {
  authorized: boolean;
  status?: number;
  error?: string;
}

/**
 * Combined authorization decision for functions that accept EITHER an
 * authenticated admin/owner session OR a valid scheduler secret header.
 *
 * This is a PURE function — it does not read environment variables, request
 * headers, or perform any I/O. The caller supplies the resolved user, the
 * header value, and the expected secret. This allows deterministic unit
 * testing of the exact authorization boundary used by the real function.
 *
 * SECURITY INVARIANTS:
 *   - Caller-supplied role claims (in request body) are NEVER consulted —
 *     only the server-resolved user.role is trusted.
 *   - Secrets supplied in the request body are NEVER accepted — only the
 *     schedulerSecretHeader parameter (extracted from the request header
 *     by the caller) is checked.
 *   - Constant-time comparison (timingSafeEqual) prevents timing attacks.
 */
export function decideAdminOrSchedulerAuth(
  user: any | null,
  schedulerSecretHeader: string,
  expectedSecret: string
): AuthDecision {
  if (user) {
    if (user.role !== "admin" && user.role !== "owner") {
      return { authorized: false, status: 403, error: "Forbidden — admin access required" };
    }
    return { authorized: true };
  }
  // No authenticated user — require scheduler secret from HEADER (never body)
  if (!expectedSecret) {
    return { authorized: false, status: 500, error: "Server not configured — LVC_SCHEDULER_SECRET not set" };
  }
  if (!schedulerSecretHeader || !timingSafeEqual(schedulerSecretHeader, expectedSecret)) {
    return { authorized: false, status: 403, error: "Forbidden — valid X-LVC-Scheduler-Secret header required for scheduled invocation" };
  }
  return { authorized: true };
}