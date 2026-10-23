import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Business Process Lifecycle ───────────────────────────────────────────────
// Planned → Under Review → Active (Owner/Admin only) → Retired
// Director can create/edit Planned and Under Review, submit for review.
// Director CANNOT set Active — only Owner/Admin.

const VALID_TRANSITIONS = {
  'Planned':      ['Under Review', 'Retired'],
  'Under Review': ['Active', 'Planned', 'Retired'],
  'Active':       ['Retired'],
  'Retired':      [],
};

const TRANSITION_PERMISSIONS = {
  'Under Review': 'submit',
  'Active':       'activate',
  'Planned':      'edit',
  'Retired':      'retire',
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
    log_id: 'BP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    log_type: 'event',
    source_module: 'business_process_registry',
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
    console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=bp_${action} record=${body.record_id || 'new'} requested_status=${body.data?.status || 'n/a'}`);

    // ─── LIST ───
    if (action === 'list') {
      if (!hasPermission(roleKey, 'view')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=bp_list`);
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      const records = await base44.asServiceRole.entities.BusinessProcess.list('-created_date', 500);
      return Response.json({ records });
    }

    // ─── GET ───
    if (action === 'get') {
      if (!hasPermission(roleKey, 'view')) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      const record = await base44.asServiceRole.entities.BusinessProcess.get(body.record_id);
      if (!record) return Response.json({ error: 'Business process not found' }, { status: 404 });
      return Response.json({ record });
    }

    // ─── CREATE ───
    if (action === 'create') {
      if (!hasPermission(roleKey, 'create')) {
        return Response.json({ error: 'Access denied: cannot create business processes' }, { status: 403 });
      }
      const data = { ...body.data };
      // New records must start as Planned — never Active
      if (data.status === 'Active') {
        return Response.json({ error: 'Cannot create an Active business process — submit for review first' }, { status: 403 });
      }
      data.status = data.status || 'Planned';
      const record = await base44.asServiceRole.entities.BusinessProcess.create(data);
      logEvent(base44, record.id, 'bp_created', { process_id: data.process_id, title: data.title, status: data.status }, user.email);
      return Response.json({ record });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      if (!hasPermission(roleKey, 'edit')) {
        return Response.json({ error: 'Access denied: cannot edit business processes' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.BusinessProcess.get(body.record_id);
      if (!existing) return Response.json({ error: 'Business process not found' }, { status: 404 });

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
        // Only Owner/Admin may set Active
        if (newStatus === 'Active' && !isPrivileged(roleKey)) {
          return Response.json({ error: 'Only the Owner may activate a business process' }, { status: 403 });
        }
      }

      // Retired records cannot be edited (except by Owner/Admin)
      if (oldStatus === 'Retired' && !isPrivileged(roleKey)) {
        return Response.json({ error: 'Cannot edit a retired business process' }, { status: 403 });
      }

      const record = await base44.asServiceRole.entities.BusinessProcess.update(body.record_id, data);
      logEvent(base44, record.id, 'bp_updated', { old_status: oldStatus, new_status: data.status || oldStatus }, user.email);
      return Response.json({ record });
    }

    // ─── RETIRE ───
    if (action === 'retire') {
      if (!hasPermission(roleKey, 'retire')) {
        return Response.json({ error: 'Access denied: cannot retire business processes' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.BusinessProcess.get(body.record_id);
      if (!existing) return Response.json({ error: 'Business process not found' }, { status: 404 });
      const record = await base44.asServiceRole.entities.BusinessProcess.update(body.record_id, {
        status: 'Retired',
      });
      logEvent(base44, record.id, 'bp_retired', { old_status: existing.status }, user.email);
      return Response.json({ record });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});