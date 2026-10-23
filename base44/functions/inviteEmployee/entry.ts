import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Employee Invitation & Portal Access Service — Admin Only
 *
 * Actions:
 *   track_invite  — Record that an invitation was sent (update tracking fields)
 *   reset         — Unlink user and record reset (re-invite handled by frontend)
 *   status        — Resolve current invitation status by checking User records
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { action, employee_id } = body;
    const now = new Date().toISOString();

    if (!employee_id) return Response.json({ error: 'employee_id is required' }, { status: 400 });

    const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
      { employee_id }, '-updated_date', 1
    );
    if (!emps || emps.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }
    const emp = emps[0];
    const email = (emp.email || '').toLowerCase().trim();
    if (!email) return Response.json({ error: 'Employee has no email address' }, { status: 400 });

    switch (action) {
      case 'track_invite': {
        // Check if the user has already accepted (User record exists)
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        const invitationStatus = existingUsers && existingUsers.length > 0 ? 'Accepted' : 'Sent';

        await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
          last_invitation_sent: now,
          invitation_status: invitationStatus,
          account_status: 'Active',
          login_email: email,
        });

        // Best-effort: promote/link if user already exists
        if (existingUsers && existingUsers.length > 0) {
          try {
            await base44.functions.invoke('inviteTechnician', { email });
          } catch (_) { /* automation handles it */ }
        }

        return Response.json({
          success: true,
          employee_id: emp.employee_id,
          invitation_status: invitationStatus,
          last_invitation_sent: now,
        });
      }

      case 'reset': {
        // Unlink the existing user
        await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
          linked_user_id: '',
          login_email: email,
          user_linked: false,
          link_date: '',
          last_invitation_sent: now,
          invitation_status: 'Sent',
          account_status: 'Active',
        });

        return Response.json({
          success: true,
          employee_id: emp.employee_id,
          invitation_status: 'Sent',
          last_invitation_sent: now,
        });
      }

      case 'status': {
        let status = emp.invitation_status || 'Pending';

        if (emp.user_linked) {
          status = 'Linked';
        } else if (emp.last_invitation_sent) {
          const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
          if (existingUsers && existingUsers.length > 0) {
            status = 'Accepted';
          } else {
            const sentDate = new Date(emp.last_invitation_sent);
            const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
            status = daysSince > 7 ? 'Expired' : 'Sent';
          }
        } else {
          status = 'Pending';
        }

        if (status !== emp.invitation_status) {
          await base44.asServiceRole.entities.EmployeeRegistry.update(emp.id, {
            invitation_status: status,
          });
        }

        let linkedUser = null;
        if (emp.linked_user_id) {
          try {
            linkedUser = await base44.asServiceRole.entities.User.get(emp.linked_user_id);
          } catch (_) { linkedUser = null; }
        }

        return Response.json({
          success: true,
          employee_id: emp.employee_id,
          invitation_status: status,
          last_invitation_sent: emp.last_invitation_sent || null,
          linked_user: linkedUser ? {
            id: linkedUser.id,
            email: linkedUser.email,
            full_name: linkedUser.full_name,
            role: linkedUser.role,
            created_date: linkedUser.created_date,
          } : null,
        });
      }

      default:
        return Response.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});