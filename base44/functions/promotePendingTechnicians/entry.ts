import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireSchedulerSecret } from '../../shared/securityAuth.ts';

/**
 * Scheduled fallback: finds every field-service EmployeeRegistry record,
 * looks for a matching User by email, and promotes that user to the
 * 'technician' role if needed. Catches the case where a user accepts
 * their invitation after the initial invite-time promotion attempt.
 *
 * SECURITY (Stage 2F Remediation):
 *   - Rejects unauthenticated direct public calls
 *   - Requires authenticated admin/owner OR valid scheduler secret
 *   - Only assigns 'technician' role (never admin/owner)
 *   - Scheduled automation must provide X-LVC-Scheduler-Secret header
 *
 * Allowed invocation types:
 *   - Scheduled automation with valid scheduler secret
 *   - Authenticated admin/owner (manual trigger from admin UI)
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // ── Authentication: Owner (manual) OR X-LVC-Scheduler-Secret (scheduled) ──
    // No body secret accepted. No admin bypass — Owner only for manual mode.
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      // May be scheduled invocation
    }

    if (user) {
      if (user.role !== "owner") {
        return Response.json({ error: "Forbidden — owner access required for manual invocation" }, { status: 403 });
      }
    } else {
      const authResult = requireSchedulerSecret(req);
      if (authResult.error) {
        console.log("[PROMOTE_PENDING_TECHNICIANS] Rejected: invalid or missing X-LVC-Scheduler-Secret header");
        return authResult.error;
      }
    }

    const employees = await base44.asServiceRole.entities.EmployeeRegistry.list('-created_date', 200);
    const users = await base44.asServiceRole.entities.User.list();

    const userByEmail = new Map();
    for (const u of users) {
      if (u.email) userByEmail.set(u.email.toLowerCase(), u);
    }

    const FIELD_SERVICE_DEPARTMENTS = ['field service', 'field operations'];
    const FIELD_SERVICE_ROLE_KEYWORDS = ['lead tech', 'apprentice', 'mason', 'technician'];

    const isFieldService = (e: any) => {
      const dept = (e.department || '').toLowerCase();
      const role = (e.primary_role || '').toLowerCase();
      return FIELD_SERVICE_DEPARTMENTS.some(d => dept.includes(d)) ||
             FIELD_SERVICE_ROLE_KEYWORDS.some(r => role.includes(r));
    };

    const promoted: string[] = [];
    const now = new Date().toISOString();

    for (const emp of employees) {
      if (!isFieldService(emp)) continue;
      const email = (emp.email || '').toLowerCase();
      if (!email) continue;

      const targetUser = userByEmail.get(email);
      if (!targetUser) continue; // hasn't accepted invite yet
      if (targetUser.role === 'technician') continue; // already promoted

      // ── Never modify privileged users via this function ──
      if (targetUser.role === 'admin' || targetUser.role === 'owner') {
        console.log(`[PROMOTE_PENDING_TECHNICIANS] Skipping '${email}' — already has privileged role '${targetUser.role}'`);
        continue;
      }

      try {
        await base44.asServiceRole.entities.User.update(targetUser.id, { role: 'technician' });
        if (!emp.linked_user_id) {
          await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
            linked_user_id: targetUser.id,
            login_email: email,
            user_linked: true,
            account_status: 'Active',
            last_login: now,
            last_activity: now,
          });
        }
        promoted.push(email);
      } catch (err) {
        console.error(`[PROMOTE_PENDING_TECHNICIANS] Failed to promote ${email}:`, err.message);
      }
    }

    return Response.json({ success: true, promoted, count: promoted.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}