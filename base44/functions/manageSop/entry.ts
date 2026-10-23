import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── SOP Lifecycle ────────────────────────────────────────────────────────────
// Draft → In Review → Approved → (edit creates Draft revision) → In Review → ...
// Archived = retired (not deleted)

const VALID_TRANSITIONS = {
  'Planned':    ['Draft', 'Archived'],
  'Draft':      ['In Review', 'Archived'],
  'In Review':  ['Approved', 'Draft', 'Archived'],
  'Approved':   ['Draft', 'Archived'],
  'Archived':   [],
};

// Map target status → required permission
const TRANSITION_PERMISSIONS = {
  'Draft':      'edit',
  'In Review':  'submit',
  'Approved':   'approve',
  'Archived':   'retire',
  'Planned':    'edit',
};

const ROLE_PERMISSIONS = {
  admin:                 ['view', 'create', 'edit', 'submit', 'approve', 'retire'],
  owner:                 ['view', 'create', 'edit', 'submit', 'approve', 'retire'],
  director_of_operations:['view', 'create', 'edit', 'submit'],
  operations_manager:   ['view', 'create', 'edit', 'submit'],
  office_manager:        ['view', 'create', 'edit', 'submit'],
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

function canApprove(roleKey) {
  return isPrivileged(roleKey);
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

function logEvent(base44, sopId, eventType, details, userEmail) {
  // Best-effort audit log — do not await or block
  base44.asServiceRole.entities.AutomationRunLog.create({
    log_id: 'SOP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    log_type: 'event',
    source_module: 'sop_registry',
    trigger_event: eventType,
    related_record_id: sopId,
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
    console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=sop_${action} record=${body.record_id || 'new'} requested_status=${body.data?.status || 'n/a'}`);

    // ─── LIST ───
    if (action === 'list') {
      if (!hasPermission(roleKey, 'view')) {
        console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=sop_list`);
        return Response.json({ error: 'Access denied: cannot view SOPs' }, { status: 403 });
      }
      const records = await base44.asServiceRole.entities.SopRegistry.list('-created_date', 500);
      return Response.json({ records });
    }

    // ─── GET ───
    if (action === 'get') {
      if (!hasPermission(roleKey, 'view')) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      const record = await base44.asServiceRole.entities.SopRegistry.get(body.record_id);
      if (!record) return Response.json({ error: 'SOP not found' }, { status: 404 });
      return Response.json({ record });
    }

    // ─── CREATE ───
    if (action === 'create') {
      if (!hasPermission(roleKey, 'create')) {
        return Response.json({ error: 'Access denied: cannot create SOPs' }, { status: 403 });
      }
      const data = { ...body.data };
      // New SOPs must start as Planned or Draft — never Approved
      if (data.status && data.status === 'Approved') {
        return Response.json({ error: 'Cannot create an Approved SOP — submit for review first' }, { status: 403 });
      }
      data.status = data.status || 'Planned';
      // Only Owner/Admin can set Approved
      if (data.status === 'Approved' && !canApprove(roleKey)) {
        return Response.json({ error: 'Only the Owner may approve SOPs' }, { status: 403 });
      }
      data.created_by = user.email || user.id;
      data.updated_by = user.email || user.id;
      const record = await base44.asServiceRole.entities.SopRegistry.create(data);
      logEvent(base44, record.id, 'sop_created', { sop_id: data.sop_id, title: data.title, status: data.status }, user.email);
      return Response.json({ record });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      if (!hasPermission(roleKey, 'edit')) {
        return Response.json({ error: 'Access denied: cannot edit SOPs' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.SopRegistry.get(body.record_id);
      if (!existing) return Response.json({ error: 'SOP not found' }, { status: 404 });

      const data = { ...body.data };
      const oldStatus = existing.status;
      const newStatus = data.status || oldStatus;

      // ─── Status transition validation ───
      if (newStatus !== oldStatus) {
        const allowed = VALID_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
          return Response.json({ error: `Invalid status transition: ${oldStatus} → ${newStatus}` }, { status: 400 });
        }
        // Check transition permission
        const requiredPerm = TRANSITION_PERMISSIONS[newStatus];
        if (requiredPerm && !hasPermission(roleKey, requiredPerm)) {
          return Response.json({ error: `Access denied: cannot set status to ${newStatus}` }, { status: 403 });
        }
        // Only Owner/Admin may set Approved
        if (newStatus === 'Approved' && !canApprove(roleKey)) {
          return Response.json({ error: 'Only the Owner may approve SOPs' }, { status: 403 });
        }
      }

      // ─── Revision behavior: editing an Approved SOP reverts to Draft ───
      if (oldStatus === 'Approved' && newStatus === 'Approved') {
        // If content fields changed (not just metadata), revert to Draft
        const contentFields = ['title', 'description', 'type', 'department', 'subject', 'document', 'page',
          'trainual_url', 'base44_module', 'workflow_name', 'related_forms', 'related_workflows',
          'related_sops', 'related_policies', 'applies_to'];
        const contentChanged = contentFields.some(f => JSON.stringify(data[f]) !== JSON.stringify(existing[f]));
        if (contentChanged) {
          data.status = 'Draft';
          data.revision_notes = (data.revision_notes || '') + (data.revision_notes ? ' | ' : '') + 'Auto-reverted from Approved to Draft for revision';
        }
      }

      // Archived SOPs cannot be edited (except by Owner/Admin to un-archive)
      if (oldStatus === 'Archived' && !isPrivileged(roleKey)) {
        return Response.json({ error: 'Cannot edit an archived SOP' }, { status: 403 });
      }

      data.updated_by = user.email || user.id;
      const record = await base44.asServiceRole.entities.SopRegistry.update(body.record_id, data);
      logEvent(base44, record.id, 'sop_updated', { old_status: oldStatus, new_status: data.status || oldStatus }, user.email);
      return Response.json({ record });
    }

    // ─── RETIRE (archive, not delete) ───
    if (action === 'retire') {
      if (!hasPermission(roleKey, 'retire')) {
        return Response.json({ error: 'Access denied: cannot retire SOPs' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.SopRegistry.get(body.record_id);
      if (!existing) return Response.json({ error: 'SOP not found' }, { status: 404 });
      const record = await base44.asServiceRole.entities.SopRegistry.update(body.record_id, {
        status: 'Archived',
        updated_by: user.email || user.id,
      });
      logEvent(base44, record.id, 'sop_retired', { old_status: existing.status }, user.email);
      return Response.json({ record });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});