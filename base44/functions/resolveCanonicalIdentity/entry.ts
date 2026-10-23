import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVE CANONICAL IDENTITY — EmployeeRegistry deduplication resolver
//
// Given an authenticated user (email or linked_user_id), resolves the
// canonical EmployeeRegistry record. When duplicates exist, selects the
// record that:
//   1. Has Active employment_status
//   2. Has a linked_user_id matching the authenticated user
//   3. Has a RoleRegistry-linked primary_role (ROLE-XXX format)
//   4. Was created earliest (original record)
//
// Also returns legacy/superseded records for audit purposes.
//
// Used by: manageTask, manageTaskTemplate, orchestrateWork, notifications
// ═══════════════════════════════════════════════════════════════════════════

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ─── RESOLVE — resolve canonical employee for the authenticated user ───
    if (action === 'resolve' || !action) {
      // Query by email AND linked_user_id to catch all possible records
      const email = user.email;
      const linkedUserId = user.id;

      const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
        $or: [
          { email }, { login_email: email },
          { linked_user_id: linkedUserId },
        ],
      }, 'created_date', 20);

      if (employees.length === 0) {
        return Response.json({
          success: true,
          canonical: null,
          legacy: [],
          role_key: normalizeRole(user.role),
          employee_name: user.full_name || user.email,
          employee_id: '',
          warning: 'No EmployeeRegistry record found for this user.',
        });
      }

      // Determine canonical record
      let canonical = null;
      const legacy = [];

      if (employees.length === 1) {
        canonical = employees[0];
      } else {
        // Multiple records — apply canonical resolution rules
        // Rule 1: Active employment_status + linked_user_id match
        const activeWithLink = employees.find(e =>
          e.employment_status === 'Active' && e.linked_user_id === linkedUserId
        );
        // Rule 2: Has ROLE-XXX primary_role (proper RoleRegistry link)
        const withRoleRegistry = employees.find(e =>
          e.primary_role && e.primary_role.startsWith('ROLE-')
        );
        // Rule 3: Created earliest (original record)
        const earliest = employees[0]; // already sorted by created_date ascending

        canonical = activeWithLink || withRoleRegistry || earliest;

        // All others are legacy
        for (const emp of employees) {
          if (emp.id !== canonical.id) {
            legacy.push({
              id: emp.id,
              employee_id: emp.employee_id,
              name: `${emp.first_name} ${emp.last_name}`,
              email: emp.email || emp.login_email,
              employment_status: emp.employment_status,
              primary_role: emp.primary_role,
              department: emp.department,
              created_date: emp.created_date,
              reason: emp.employment_status !== 'Active' ? 'Inactive status'
                : (!emp.linked_user_id ? 'No linked user'
                : (emp.primary_role && !emp.primary_role.startsWith('ROLE-')) ? 'Text role instead of RoleRegistry ID'
                : 'Superseded by canonical record'),
            });
          }
        }
      }

      // Resolve role key from RoleRegistry
      let roleKey = normalizeRole(user.role);
      if (canonical?.primary_role && canonical.primary_role.startsWith('ROLE-')) {
        try {
          const roles = await base44.asServiceRole.entities.RoleRegistry.filter(
            { role_id: canonical.primary_role }, null, 1
          );
          if (roles[0]) {
            roleKey = roles[0].role_key || normalizeRole(roles[0].role_name || '');
          }
        } catch {}
      }

      const employeeName = canonical
        ? (canonical.preferred_name || canonical.first_name || '') + ' ' + (canonical.last_name || '')
        : user.full_name || user.email;

      return Response.json({
        success: true,
        canonical: canonical ? {
          id: canonical.id,
          employee_id: canonical.employee_id,
          name: employeeName,
          email: canonical.email || canonical.login_email,
          linked_user_id: canonical.linked_user_id,
          primary_role: canonical.primary_role,
          department: canonical.department,
          employment_status: canonical.employment_status,
        } : null,
        canonical_id: canonical?.id || '',
        canonical_employee_id: canonical?.employee_id || '',
        canonical_employee_name: employeeName,
        canonical_employee_email: canonical?.email || canonical?.login_email || user.email,
        role_key: roleKey,
        legacy,
        has_duplicates: legacy.length > 0,
      });
    }

    // ─── CHECK REFERENCES — check if a legacy record is referenced ───
    if (action === 'check_references') {
      const { employee_id } = body;
      if (!employee_id) return Response.json({ error: 'employee_id is required' }, { status: 400 });

      const checks = await Promise.all([
        base44.asServiceRole.entities.EnterpriseTask.filter({
          $or: [{ assigned_employee_registry_id: employee_id }, { requested_by_employee_id: employee_id }],
        }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.EnterpriseNotification.filter({
          $or: [{ recipient_employee_registry_id: employee_id }, { related_employee: employee_id }],
        }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.WorkSession.filter({ employee_id }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.WorkCheckpoint.filter({ employee_id }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.TaskAcknowledgment.filter({ employee_id }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.TrainingProgress.filter({ employee_registry_id: employee_id }, null, 200).then(r => r.length).catch(() => 0),
        base44.asServiceRole.entities.EmployeeCertification.filter({ employee_registry_id: employee_id }, null, 200).then(r => r.length).catch(() => 0),
      ]);

      const [tasks, notifs, sessions, checkpoints, acks, training, certs] = checks;
      const totalRefs = tasks + notifs + sessions + checkpoints + acks + training + certs;

      return Response.json({
        success: true,
        employee_id,
        references: {
          tasks, notifications: notifs, work_sessions: sessions,
          checkpoints: checkpoints, acknowledgments: acks,
          training_progress: training, employee_certs: certs,
          total: totalRefs,
        },
        can_supersede: totalRefs === 0,
      });
    }

    // ─── MARK LEGACY — mark a record as legacy/superseded ───
    if (action === 'mark_legacy') {
      if (normalizeRole(user.role) !== 'admin' && normalizeRole(user.role) !== 'owner') {
        return Response.json({ error: 'Only admin/owner can mark records as legacy' }, { status: 403 });
      }
      const { employee_id, reason } = body;
      if (!employee_id) return Response.json({ error: 'employee_id is required' }, { status: 400 });
      if (!reason) return Response.json({ error: 'reason is required' }, { status: 400 });

      const emp = await base44.asServiceRole.entities.EmployeeRegistry.get(employee_id);
      if (!emp) return Response.json({ error: 'Employee not found' }, { status: 404 });

      // Check references before marking as legacy
      const refResponse = await base44.functions.invoke('resolveCanonicalIdentity', {
        action: 'check_references', employee_id,
      });
      const refs = refResponse.data?.references || {};
      if (refs.total > 0) {
        return Response.json({
          error: 'Cannot mark as legacy — record is still referenced',
          references: refs,
        }, { status: 409 });
      }

      const updated = await base44.asServiceRole.entities.EmployeeRegistry.update(employee_id, {
        notes: (emp.notes || '') + `\n\n[LEGACY] Marked as legacy/superseded by ${user.email} on ${new Date().toISOString()}. Reason: ${reason}`,
        account_status: 'Disabled',
      });

      // Audit log
      try {
        await base44.asServiceRole.entities.AutomationRunLog.create({
          log_id: 'IDR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          log_type: 'event',
          source_module: 'identity_resolver',
          trigger_event: 'employee_marked_legacy',
          related_record_id: employee_id,
          status: 'success',
          execution_trace_json: JSON.stringify({
            employee_id: emp.employee_id,
            name: `${emp.first_name} ${emp.last_name}`,
            reason,
            marked_by: user.email,
            timestamp: new Date().toISOString(),
          }),
          triggered_by: user.email,
        });
      } catch {}

      return Response.json({ success: true, employee: updated });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[IDENTITY RESOLVER ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});