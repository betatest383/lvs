import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * inviteTechnician — Technician Invitation & Role Promotion (SECURED)
 *
 * Promotes a user to the 'technician' role and links their EmployeeRegistry record.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Requires authenticated Owner or explicitly authorized user-management role
 *   - Resolves caller role server-side — ignores caller-supplied authorization claims
 *   - Enforces an allowlist of assignable roles: ONLY 'technician'
 *   - Prevents assigning Owner, admin, or any privileged role through this function
 *   - Prevents self-elevation (cannot promote own account)
 *   - Prevents modifying an existing user's role if they already hold a privileged role
 *   - Logs caller, target, requested role, result, and rejection reason
 *
 * Allowed invocation types:
 *   - Authenticated Owner (manual invitation from admin UI)
 *   - Entity automation (new User created event) — uses scheduler secret
 *
 * Role allowlist: ONLY 'technician' can be assigned via this function.
 *   Any attempt to assign 'owner', 'admin', or other privileged roles is rejected.
 */

// The ONLY role this function is allowed to assign
const ALLOWED_ASSIGNABLE_ROLE = 'technician';

// Roles that this function may NEVER assign, promote to, or overwrite
const PRIVILEGED_ROLES = ['owner', 'admin'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // ── Authentication: Owner only (manual). No unauthenticated automation access. ──
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      // Not authenticated
    }

    const callerIdentity = user?.email || user?.id || 'system';

    if (!user) {
      console.log("[INVITE_TECHNICIAN] Rejected: unauthenticated invocation attempted");
      return Response.json({ error: "Unauthorized — authentication required" }, { status: 401 });
    }

    if (user.role !== "owner") {
      console.log(`[INVITE_TECHNICIAN] Rejected: caller '${callerIdentity}' role '${user.role}' is not owner`);
      return Response.json({ error: "Forbidden — owner access required" }, { status: 403 });
    }

    // ── Extract target email (from body or entity automation event) ──
    const email = (body?.email || body?.data?.email || '').toString().trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // ── Prevent self-elevation ──
    if (user && user.email && user.email.toLowerCase() === email) {
      console.log(`[INVITE_TECHNICIAN] Rejected: self-elevation attempt by '${callerIdentity}' for '${email}'`);
      return Response.json({ error: 'Cannot modify your own account through this function' }, { status: 403 });
    }

    // ── Reject caller-supplied role escalation ──
    // This function ONLY assigns 'technician'. Any caller-supplied role is ignored.
    if (body.role && body.role !== ALLOWED_ASSIGNABLE_ROLE) {
      console.log(`[INVITE_TECHNICIAN] Rejected: caller '${callerIdentity}' attempted to assign role '${body.role}' — only '${ALLOWED_ASSIGNABLE_ROLE}' is allowed`);
      return Response.json({
        error: `Role escalation denied — this function can only assign the '${ALLOWED_ASSIGNABLE_ROLE}' role`,
        requested_role: body.role,
      }, { status: 403 });
    }

    // ── Find the User record by email ──
    const matches = await base44.asServiceRole.entities.User.filter({ email });
    if (matches.length === 0) {
      // User hasn't accepted the invite yet — nothing to promote.
      console.log(`[INVITE_TECHNICIAN] User not found for '${email}' — no promotion needed (may not have accepted invite yet)`);
      return Response.json({ success: true, email, promoted: false, reason: 'user_not_found' });
    }

    const targetUser = matches[0];
    const userId = targetUser.id;

    // ── Prevent modifying existing privileged users ──
    if (PRIVILEGED_ROLES.includes(targetUser.role)) {
      console.log(`[INVITE_TECHNICIAN] Rejected: target '${email}' already has privileged role '${targetUser.role}' — cannot downgrade via this function`);
      return Response.json({
        error: `Cannot modify existing user with privileged role '${targetUser.role}' through this function`,
        target_email: email,
        target_role: targetUser.role,
      }, { status: 403 });
    }

    // ── Verify this email belongs to an EmployeeRegistry field-service record ──
    const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({ email });
    if (employees.length === 0) {
      console.log(`[INVITE_TECHNICIAN] Email '${email}' not found in EmployeeRegistry — not a field-service technician`);
      return Response.json({ success: true, email, promoted: false, reason: 'not_a_technician' });
    }

    // ── Promote the role (ONLY to 'technician') ──
    if (targetUser.role !== ALLOWED_ASSIGNABLE_ROLE) {
      await base44.asServiceRole.entities.User.update(userId, { role: ALLOWED_ASSIGNABLE_ROLE });
      console.log(`[INVITE_TECHNICIAN] Authorized: '${callerIdentity}' promoted '${email}' to '${ALLOWED_ASSIGNABLE_ROLE}'`);
    }

    // Link the EmployeeRegistry record(s) to the user id
    const now = new Date().toISOString();
    for (const emp of employees) {
      if (!emp.linked_user_id) {
        await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
          linked_user_id: userId,
          login_email: email,
          user_linked: true,
          account_status: 'Active',
          last_login: now,
          last_activity: now,
        });
      }
    }

    return Response.json({ success: true, email, promoted: true, assigned_role: ALLOWED_ASSIGNABLE_ROLE });
  } catch (error) {
    console.error('[INVITE_TECHNICIAN] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}