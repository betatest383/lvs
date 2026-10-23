import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Workflow Lifecycle ──────────────────────────────────────────────────────
// Planned → In Development → Testing → Live (Owner/Admin only)
// Director can create/edit Planned, In Development, Testing.
// Director CANNOT set Live — only Owner/Admin.
// Retire = set is_active: false (Workflow entity has no "Retired" status).

const VALID_TRANSITIONS = {
  'Planned':         ['In Development', 'Retired'],
  'In Development':  ['Testing', 'Planned', 'Retired'],
  'Testing':         ['Live', 'Planned', 'In Development', 'Retired'],
  'Live':            ['Planned', 'Retired'],
};

const TRANSITION_PERMISSIONS = {
  'In Development': 'edit',
  'Testing':        'submit',
  'Live':           'activate',
  'Planned':        'edit',
  'Retired':        'retire',
};

const ROLE_PERMISSIONS = {
  admin:                 ['view', 'create', 'edit', 'submit', 'activate', 'retire'],
  owner:                 ['view', 'create', 'edit', 'submit', 'activate', 'retire'],
  director_of_operations:['view', 'create', 'edit', 'submit'],
  operations_manager:   ['view', 'create', 'edit', 'submit'],
  office_manager:        ['view', 'create', 'edit'],
  warehouse_manager:     ['view'],
  warehouse_associate:   ['view'],
  inventory_specialist: ['view'],
  lead_technician:       ['view'],
  technician:            ['view'],
  apprentice:            ['view'],
  csr:                   ['view'],
  dispatcher:            ['view'],
};

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function hasPermission(roleKey, action) {
  if (roleKey === 'admin' || roleKey === 'owner') return true;
  const perms = ROLE_PERMISSIONS[roleKey] || ['view'];
  return perms.includes(action);
}

function isPrivileged(roleKey) {
  return roleKey === 'admin' || roleKey === 'owner';
}

async function resolveUserRole(base44, user) {
  if (user.role === 'admin') return 'admin';
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  return normalizeRole(employee.primary_role || '');
}

function logEvent(base44, recordId, eventType, details, userEmail) {
  base44.asServiceRole.entities.AutomationRunLog.create({
    log_id: 'WF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    log_type: 'event',
    source_module: 'workflow_registry',
    trigger_event: eventType,
    related_record_id: recordId,
    status: 'success',
    conditions_met: true,
    execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
    triggered_by: userEmail,
  }).catch(() => {});
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roleKey = await resolveUserRole(base44, user);
    const body = await req.json();
    const { action } = body;
    console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=wf_${action} record=${body.record_id || 'new'} requested_status=${body.data?.status || 'n/a'}`);

    // ─── LIST ───
    if (action === 'list') {
      if (!hasPermission(roleKey, 'view')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=wf_list`);
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      const records = await base44.asServiceRole.entities.WorkflowRegistry.list('-created_date', 500);
      return Response.json({ records });
    }

    // ─── GET ───
    if (action === 'get') {
      if (!hasPermission(roleKey, 'view')) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      const record = await base44.asServiceRole.entities.WorkflowRegistry.get(body.record_id);
      if (!record) return Response.json({ error: 'Workflow not found' }, { status: 404 });
      return Response.json({ record });
    }

    // ─── CREATE ───
    if (action === 'create') {
      if (!hasPermission(roleKey, 'create')) {
        return Response.json({ error: 'Access denied: cannot create workflows' }, { status: 403 });
      }
      const data = { ...body.data };
      // New workflows must start as Planned — never Live
      if (data.status === 'Live') {
        return Response.json({ error: 'Cannot create a Live workflow — submit for testing first' }, { status: 403 });
      }
      data.status = data.status || 'Planned';
      const record = await base44.asServiceRole.entities.WorkflowRegistry.create(data);
      logEvent(base44, record.id, 'wf_created', { workflow_id: data.workflow_id, title: data.title, status: data.status }, user.email);
      return Response.json({ record });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      if (!hasPermission(roleKey, 'edit')) {
        return Response.json({ error: 'Access denied: cannot edit workflows' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.WorkflowRegistry.get(body.record_id);
      if (!existing) return Response.json({ error: 'Workflow not found' }, { status: 404 });

      const data = { ...body.data };
      const oldStatus = existing.status;
      const newStatus = data.status || oldStatus;

      // ─── Status transition validation ───
      if (newStatus !== oldStatus) {
        const allowed = VALID_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
          return Response.json({ error: `Invalid status transition: ${oldStatus} → ${newStatus}` }, { status: 400 });
        }
        const requiredPerm = TRANSITION_PERMISSIONS[newStatus];
        if (requiredPerm && !hasPermission(roleKey, requiredPerm)) {
          return Response.json({ error: `Access denied: cannot set status to ${newStatus}` }, { status: 403 });
        }
        // Only Owner/Admin may set Live
        if (newStatus === 'Live' && !isPrivileged(roleKey)) {
          return Response.json({ error: 'Only the Owner may set a workflow to Live' }, { status: 403 });
        }
      }

      // Retired (is_active=false) workflows cannot be edited (except by Owner/Admin)
      if (existing.is_active === false && !isPrivileged(roleKey)) {
        return Response.json({ error: 'Cannot edit a retired workflow' }, { status: 403 });
      }

      const record = await base44.asServiceRole.entities.WorkflowRegistry.update(body.record_id, data);
      logEvent(base44, record.id, 'wf_updated', { old_status: oldStatus, new_status: data.status || oldStatus }, user.email);
      return Response.json({ record });
    }

    // ─── RETIRE (set is_active=false, preserve status) ───
    if (action === 'retire') {
      if (!hasPermission(roleKey, 'retire')) {
        return Response.json({ error: 'Access denied: cannot retire workflows' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.WorkflowRegistry.get(body.record_id);
      if (!existing) return Response.json({ error: 'Workflow not found' }, { status: 404 });
      const record = await base44.asServiceRole.entities.WorkflowRegistry.update(body.record_id, {
        is_active: false,
      });
      logEvent(base44, record.id, 'wf_retired', { old_status: existing.status, old_is_active: existing.is_active }, user.email);
      return Response.json({ record });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});