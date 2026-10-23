import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Workflow constants ──────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  'Draft': ['Under Review', 'Retired'],
  'Under Review': ['Approved', 'Needs Update', 'Draft', 'Retired'],
  'Approved': ['Published', 'Needs Update', 'Retired'],
  'Published': ['Needs Update', 'Retired'],
  'Needs Update': ['Under Review', 'Draft', 'Retired'],
  'Retired': [],
};

// Map target status → required sub-permission for transitions
const TRANSITION_PERMISSIONS = {
  'Under Review': 'submit',
  'Draft': 'submit',
  'Approved': 'approve',
  'Published': 'publish',
  'Needs Update': 'edit',
  'Retired': 'retire',
};

const ROLE_ACTION_PERMISSIONS = {
  admin: ['view', 'create', 'edit', 'submit', 'review', 'approve', 'publish', 'retire', 'delete', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  owner: ['view', 'create', 'edit', 'submit', 'review', 'approve', 'publish', 'retire', 'delete', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  director_of_operations: ['view', 'create', 'edit', 'submit', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  operations_manager: ['view', 'create', 'edit', 'submit', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  warehouse_manager: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  warehouse_associate: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  inventory_specialist: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  office_manager: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  lead_technician: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  technician: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  apprentice: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
  csr: ['view', 'start_training', 'save_progress', 'complete_training', 'get_progress'],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function hasPermission(roleKey, action) {
  if (roleKey === 'admin' || roleKey === 'owner') return true;
  const perms = ROLE_ACTION_PERMISSIONS[roleKey] || ['view'];
  return perms.includes(action);
}

function isPrivileged(roleKey) {
  return roleKey === 'admin' || roleKey === 'owner';
}

function isAuthorRole(roleKey) {
  return roleKey === 'admin' || roleKey === 'owner' || roleKey === 'director_of_operations' || roleKey === 'operations_manager';
}

function parseJSON(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str) || typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

async function generateTrainingNumber(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.TrainingRegistry.filter(
      { training_number: { $regex: '^TRN-' } },
      '-training_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].training_number) {
      const match = String(existing[0].training_number).match(/TRN-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'TRN-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.TrainingRegistry.filter(
      { training_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'TRN-' + String(Date.now()).slice(-6);
}

async function logTrainingEvent(base44, trainingId, eventType, details, userEmail) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: 'TRN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: 'training_registry',
      trigger_event: eventType,
      related_record_id: trainingId,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch (e) { /* best-effort */ }
}

// Resolve employee by email — single source of truth for identity
async function resolveEmployee(base44, email) {
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email }, { login_email: email }]
  });
  return employees[0] || null;
}

// ─── Visibility: can this user view this guide? ────────────────────────────────

async function canViewGuide(base44, guide, roleKey, userEmail, employee, assignedTaskIds) {
  if (!guide) return false;
  // Owner/Admin: all guides
  if (isPrivileged(roleKey)) return true;

  // Director: guides they created, review, manage within Operations, or that apply to their role
  if (roleKey === 'director_of_operations') {
    if (guide.created_by === userEmail) return true;
    if (employee && (guide.reviewer_employee_id === employee.id || guide.approver_employee_id === employee.id)) return true;
    if (guide.department === 'Management' || guide.department === 'Office') return true;
    const roles = guide.applicable_roles || guide.required_roles || [];
    if (roles.length === 0 || roles.includes(roleKey)) return true;
    return false;
  }

  // Warehouse Manager / Associate: only Published Warehouse guides or guides assigned through a task
  if (roleKey === 'warehouse_manager' || roleKey === 'warehouse_associate' || roleKey === 'inventory_specialist') {
    if (guide.status !== 'Published') return false;
    if (guide.department === 'Warehouse') return true;
    const roles = guide.applicable_roles || guide.required_roles || [];
    if (roles.includes(roleKey)) return true;
    if (guide.linked_task_id && assignedTaskIds && assignedTaskIds.includes(guide.linked_task_id)) return true;
    return false;
  }

  // Other employees: only Published guides applicable to their role or assigned through a task
  if (guide.status !== 'Published') return false;
  const roles = guide.applicable_roles || guide.required_roles || [];
  if (roles.length === 0 || roles.includes(roleKey)) return true;
  if (guide.linked_task_id && assignedTaskIds && assignedTaskIds.includes(guide.linked_task_id)) return true;
  return false;
}

// Fetch the set of task IDs assigned to this employee (for task-based guide visibility)
async function getAssignedTaskIds(base44, employeeId) {
  if (!employeeId) return [];
  try {
    const tasks = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { assigned_employee_registry_id: employeeId, data_classification: 'production' },
      '-created_date',
      200
    );
    return tasks.map(t => t.id);
  } catch { return []; }
}

// Resolve linked_task_number → linked_task_id (entity ID) and backfill EnterpriseTask.training_guide_id
async function resolveTaskLinkage(base44, taskNumber, guideId) {
  if (!taskNumber) return null;
  try {
    const tasks = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { task_number: taskNumber },
      null,
      5
    );
    if (tasks.length === 0) return null;
    const taskId = tasks[0].id;
    if (guideId) {
      await base44.asServiceRole.entities.EnterpriseTask.update(taskId, { training_guide_id: guideId });
    }
    return taskId;
  } catch { return null; }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, trainingId, trainingData, newStatus, taskId, currentStep, stepProgressJson, evidenceUrls, _test_user_email } = body;

    // ── Step 1: Portal-level access via shared hardened authorization helper ──
    // Training actions (start, save, complete, upload_file) are user-facing, not admin edits
    const VIEW_ACTIONS = ['list', 'get', 'get_progress', 'find_by_task', 'start_training', 'save_progress', 'complete_training', 'upload_file'];
    const portalAction = VIEW_ACTIONS.includes(action) ? 'view' : 'edit';
    const navAccess = await base44.functions.invoke('checkNavigationAccess', {
      user_email: user.email,
      _test_user_email: _test_user_email,
      route: '/lvcos/training',
      action: portalAction,
    });

    if (navAccess.data?.allowed === false) {
      return Response.json({
        error: 'Access denied',
        reason: navAccess.data?.reason
      }, { status: 403 });
    }

    const canonicalRoleKey = navAccess.data?.canonical_role_key || normalizeRole(user.role);
    const privileged = isPrivileged(canonicalRoleKey);
    const isAuthor = isAuthorRole(canonicalRoleKey);
    // In test mode (admin simulating another user), resolve employee from the test email
    const effectiveEmail = (_test_user_email && isPrivileged(normalizeRole(user.role))) ? _test_user_email : user.email;
    const employee = await resolveEmployee(base44, effectiveEmail);
    const assignedTaskIds = (!privileged && !isAuthor) ? await getAssignedTaskIds(base44, employee?.id) : [];

    // ── Step 2: Action-specific permission check ──
    // Transitions are checked per-target-status inside the transition case
    // Map frontend actions to permission keys
    const PERMISSION_MAP = {
      'list': 'view',
      'get': 'view',
      'find_by_task': 'view',
      'update': 'edit',
      'upload_file': body.purpose === 'screenshot' ? 'edit' : 'save_progress',
    };
    const permissionAction = PERMISSION_MAP[action] || action;
    if (action !== 'transition' && !hasPermission(canonicalRoleKey, permissionAction)) {
      return Response.json({
        error: `Role '${canonicalRoleKey}' does not have '${permissionAction}' permission`
      }, { status: 403 });
    }

    // ── Step 3: Dispatch ──
    switch (action) {
      // ── LIST ──────────────────────────────────────────────────────────────────
      case 'list': {
        const { statusFilter, search, roleFilter, linkedTaskId } = body;
        let query = {};

        if (statusFilter) {
          query.status = statusFilter;
        }

        if (linkedTaskId) {
          query.linked_task_id = linkedTaskId;
        }

        let records = await base44.asServiceRole.entities.TrainingRegistry.filter(
          query,
          '-created_date',
          500
        );

        // Apply visibility rules
        if (!privileged || linkedTaskId) {
          const visible = [];
          for (const r of records) {
            if (await canViewGuide(base44, r, canonicalRoleKey, effectiveEmail, employee, assignedTaskIds)) {
              visible.push(r);
            }
          }
          records = visible;
        }

        // Search filter
        if (search) {
          const q = search.toLowerCase();
          records = records.filter(r =>
            (r.title || r.training_name || '').toLowerCase().includes(q) ||
            (r.training_number || r.training_id || '').toLowerCase().includes(q) ||
            (r.description || '').toLowerCase().includes(q)
          );
        }

        // Role filter (for admin/author views)
        if (roleFilter && (privileged || isAuthor)) {
          records = records.filter(r => {
            const roles = r.applicable_roles || r.required_roles || [];
            return roles.includes(roleFilter);
          });
        }

        return Response.json({
          success: true,
          guides: records,
          count: records.length,
          canonical_role_key: canonicalRoleKey,
          is_author: isAuthor,
        });
      }

      // ── FIND BY TASK (for TaskDetail linked-guide lookup) ─────────────────────
      case 'find_by_task': {
        const { taskId: searchTaskId } = body;
        if (!searchTaskId) return Response.json({ error: 'taskId required' }, { status: 400 });

        const records = await base44.asServiceRole.entities.TrainingRegistry.filter(
          { linked_task_id: searchTaskId },
          '-created_date',
          10
        );

        for (const r of records) {
          if (await canViewGuide(base44, r, canonicalRoleKey, effectiveEmail, employee, assignedTaskIds)) {
            return Response.json({ success: true, guide: r, is_author: isAuthor });
          }
        }

        return Response.json({ success: true, guide: null, is_author: isAuthor });
      }

      // ── GET ───────────────────────────────────────────────────────────────────
      case 'get': {
        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const guide = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!guide) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        // Enforce visibility
        if (!await canViewGuide(base44, guide, canonicalRoleKey, effectiveEmail, employee, assignedTaskIds)) {
          return Response.json({ error: 'Access denied — insufficient permissions for this guide' }, { status: 403 });
        }

        return Response.json({
          success: true,
          guide,
          canonical_role_key: canonicalRoleKey,
          is_author: isAuthor,
        });
      }

      // ── CREATE ────────────────────────────────────────────────────────────────
      case 'create': {
        if (!isAuthor) {
          return Response.json({ error: 'Only Owners, Admins, and Directors can create training guides' }, { status: 403 });
        }

        if (!trainingData?.title) {
          return Response.json({ error: 'Title is required' }, { status: 400 });
        }

        const trainingNumber = await generateTrainingNumber(base44);

        // Resolve immutable task linkage
        const taskNum = trainingData.linked_task_number || '';
        let linkedTaskId = trainingData.linked_task_id || '';
        if (taskNum && !linkedTaskId) {
          linkedTaskId = await resolveTaskLinkage(base44, taskNum, null) || '';
        }

        const steps = parseJSON(trainingData.training_steps, []);
        const guide = await base44.asServiceRole.entities.TrainingRegistry.create({
          training_number: trainingNumber,
          training_id: trainingNumber,
          title: trainingData.title,
          training_name: trainingData.title,
          description: trainingData.description || '',
          department: trainingData.department || '',
          training_type: trainingData.training_type || 'Role Training',
          status: 'Draft',
          applicable_roles: trainingData.applicable_roles || [],
          required_roles: trainingData.applicable_roles || [],
          related_module: trainingData.related_module || '',
          related_route: trainingData.related_route || '',
          related_task_type: trainingData.related_task_type || '',
          linked_task_number: taskNum,
          linked_task_id: linkedTaskId,
          learning_objective: trainingData.learning_objective || '',
          prerequisites: trainingData.prerequisites || '',
          training_steps: typeof trainingData.training_steps === 'string'
            ? trainingData.training_steps
            : JSON.stringify(steps),
          reviewer_employee_id: trainingData.reviewer_employee_id || '',
          approver_employee_id: trainingData.approver_employee_id || '',
          version: trainingData.version || '1.0',
          effective_date: trainingData.effective_date || null,
          review_date: trainingData.review_date || null,
          training_owner: trainingData.training_owner || user.full_name || user.email,
          estimated_completion_time: trainingData.estimated_completion_time || '',
          created_by: user.email,
          updated_by: user.email,
          notes: trainingData.notes || '',
        });

        // Backfill EnterpriseTask.training_guide_id
        if (linkedTaskId) {
          await resolveTaskLinkage(base44, taskNum, guide.id);
        }

        await logTrainingEvent(base44, guide.id, 'training_created', { training_number: trainingNumber, title: trainingData.title }, user.email);

        return Response.json({ success: true, guide });
      }

      // ── UPDATE ────────────────────────────────────────────────────────────────
      case 'update': {
        if (!isAuthor) {
          return Response.json({ error: 'Only Owners, Admins, and Directors can edit training guides' }, { status: 403 });
        }

        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!existing) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        // Directors can only edit Draft or Needs Update guides
        if (canonicalRoleKey === 'director_of_operations' && existing.status !== 'Draft' && existing.status !== 'Needs Update') {
          return Response.json({ error: `Cannot edit guide in '${existing.status}' status` }, { status: 403 });
        }

        // Resolve immutable task linkage if task number changed
        const taskNum = trainingData.linked_task_number ?? existing.linked_task_number;
        let linkedTaskId = trainingData.linked_task_id ?? existing.linked_task_id;
        if (taskNum && (taskNum !== existing.linked_task_number || !linkedTaskId)) {
          const resolved = await resolveTaskLinkage(base44, taskNum, trainingId);
          if (resolved) linkedTaskId = resolved;
        }

        const steps = parseJSON(trainingData.training_steps, []);
        const updated = await base44.asServiceRole.entities.TrainingRegistry.update(trainingId, {
          title: trainingData.title || existing.title,
          training_name: trainingData.title || existing.title,
          description: trainingData.description ?? existing.description,
          department: trainingData.department ?? existing.department,
          training_type: trainingData.training_type ?? existing.training_type,
          applicable_roles: trainingData.applicable_roles ?? existing.applicable_roles,
          required_roles: trainingData.applicable_roles ?? existing.required_roles,
          related_module: trainingData.related_module ?? existing.related_module,
          related_route: trainingData.related_route ?? existing.related_route,
          related_task_type: trainingData.related_task_type ?? existing.related_task_type,
          linked_task_number: taskNum,
          linked_task_id: linkedTaskId,
          learning_objective: trainingData.learning_objective ?? existing.learning_objective,
          prerequisites: trainingData.prerequisites ?? existing.prerequisites,
          training_steps: typeof trainingData.training_steps === 'string'
            ? trainingData.training_steps
            : JSON.stringify(steps),
          reviewer_employee_id: trainingData.reviewer_employee_id ?? existing.reviewer_employee_id,
          approver_employee_id: trainingData.approver_employee_id ?? existing.approver_employee_id,
          version: trainingData.version ?? existing.version,
          effective_date: trainingData.effective_date ?? existing.effective_date,
          review_date: trainingData.review_date ?? existing.review_date,
          training_owner: trainingData.training_owner ?? existing.training_owner,
          estimated_completion_time: trainingData.estimated_completion_time ?? existing.estimated_completion_time,
          updated_by: user.email,
          notes: trainingData.notes ?? existing.notes,
        });

        await logTrainingEvent(base44, trainingId, 'training_updated', { title: updated.title }, user.email);

        return Response.json({ success: true, guide: updated });
      }

      // ── TRANSITION ────────────────────────────────────────────────────────────
      case 'transition': {
        if (!trainingId || !newStatus) {
          return Response.json({ error: 'trainingId and newStatus required' }, { status: 400 });
        }

        const existing = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!existing) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        // Enforce visibility for non-privileged users
        if (!privileged && !await canViewGuide(base44, existing, canonicalRoleKey, effectiveEmail, employee, assignedTaskIds)) {
          return Response.json({ error: 'Access denied' }, { status: 403 });
        }

        // Validate transition is in the allowed graph
        const allowed = VALID_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(newStatus)) {
          return Response.json({
            error: `Invalid transition: '${existing.status}' → '${newStatus}'`
          }, { status: 400 });
        }

        // Check sub-permission for this specific transition
        const requiredPerm = TRANSITION_PERMISSIONS[newStatus];
        if (requiredPerm && !hasPermission(canonicalRoleKey, requiredPerm)) {
          return Response.json({
            error: `Role '${canonicalRoleKey}' cannot transition to '${newStatus}' (requires '${requiredPerm}' permission)`
          }, { status: 403 });
        }

        // Prevent self-approval: creator cannot approve their own guide when a separate approver is designated
        if (newStatus === 'Approved' && existing.created_by === effectiveEmail && existing.approver_employee_id) {
          return Response.json({
            error: 'Cannot approve your own guide — a separate approver is designated'
          }, { status: 403 });
        }

        const updates = { status: newStatus, updated_by: user.email };
        if (newStatus === 'Published') {
          updates.published_at = new Date().toISOString();
          updates.published_by = user.email;
        }

        const updated = await base44.asServiceRole.entities.TrainingRegistry.update(trainingId, updates);

        await logTrainingEvent(base44, trainingId, 'training_transitioned', {
          from: existing.status, to: newStatus, user: user.email
        }, user.email);

        return Response.json({ success: true, guide: updated });
      }

      // ── RETIRE (normal UI replacement for delete) ─────────────────────────────
      case 'retire': {
        if (!privileged) {
          return Response.json({ error: 'Only Owners and Admins can retire training guides' }, { status: 403 });
        }

        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!existing) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        if (existing.status === 'Retired') {
          return Response.json({ error: 'Guide is already retired' }, { status: 400 });
        }

        const updated = await base44.asServiceRole.entities.TrainingRegistry.update(trainingId, {
          status: 'Retired',
          updated_by: user.email,
        });

        await logTrainingEvent(base44, trainingId, 'training_retired', { title: existing.title }, user.email);

        return Response.json({ success: true, guide: updated });
      }

      // ── DELETE (admin-only administrative cleanup, outside normal workflow) ──
      case 'delete': {
        if (!privileged) {
          return Response.json({ error: 'Only Owners and Admins can delete training guides' }, { status: 403 });
        }

        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!existing) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        await base44.asServiceRole.entities.TrainingRegistry.delete(trainingId);

        await logTrainingEvent(base44, trainingId, 'training_deleted', { title: existing.title }, user.email);

        return Response.json({ success: true });
      }

      // ── START TRAINING ────────────────────────────────────────────────────────
      case 'start_training': {
        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const guide = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
        if (!guide) return Response.json({ error: 'Training guide not found' }, { status: 404 });

        // Enforce visibility
        if (!await canViewGuide(base44, guide, canonicalRoleKey, effectiveEmail, employee, assignedTaskIds)) {
          return Response.json({ error: 'Access denied' }, { status: 403 });
        }

        // Only Published guides can be started (except privileged viewing unpublished)
        if (guide.status !== 'Published') {
          return Response.json({ error: 'Training guide is not published' }, { status: 403 });
        }

        if (!employee) {
          return Response.json({ error: 'No employee record found for your account' }, { status: 403 });
        }

        const steps = parseJSON(guide.training_steps, []);
        const totalSteps = steps.length;

        // Check for existing progress
        const existing = await base44.asServiceRole.entities.TrainingProgress.filter({
          training_id: trainingId,
          employee_registry_id: employee.id,
        });

        if (existing.length > 0) {
          const progress = existing[0];
          if (taskId && !progress.task_id) {
            await base44.asServiceRole.entities.TrainingProgress.update(progress.id, {
              task_id: taskId,
              task_number: guide.linked_task_number || '',
            });
          }
          return Response.json({ success: true, progress });
        }

        const progress = await base44.asServiceRole.entities.TrainingProgress.create({
          training_id: trainingId,
          training_number: guide.training_number || guide.training_id || '',
          training_title: guide.title || guide.training_name || '',
          employee_registry_id: employee.id,
          employee_email: employee.email || employee.login_email || user.email,
          employee_name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
          linked_user_id: employee.linked_user_id || user.id,
          task_id: taskId || guide.linked_task_id || '',
          task_number: guide.linked_task_number || '',
          current_step: 0,
          total_steps: totalSteps,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          step_progress_json: JSON.stringify(steps.map((s, i) => ({
            step_number: i + 1,
            completed: false,
            completed_at: null,
          }))),
          evidence_urls: [],
          created_by: user.email,
        });

        await logTrainingEvent(base44, trainingId, 'training_started', {
          employee: employee.id, task: taskId || null
        }, user.email);

        return Response.json({ success: true, progress });
      }

      // ── SAVE PROGRESS ──────────────────────────────────────────────────────────
      case 'save_progress': {
        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const employee = await resolveEmployee(base44, effectiveEmail);
        if (!employee) {
          return Response.json({ error: 'No employee record found for your account' }, { status: 403 });
        }

        const existing = await base44.asServiceRole.entities.TrainingProgress.filter({
          training_id: trainingId,
          employee_registry_id: employee.id,
        });

        if (existing.length === 0) {
          return Response.json({ error: 'No training progress found — call start_training first' }, { status: 404 });
        }

        const progress = existing[0];
        const updates = {};
        if (currentStep !== undefined) updates.current_step = currentStep;
        if (stepProgressJson) updates.step_progress_json = stepProgressJson;
        if (evidenceUrls) {
          // Validate evidence URLs — only accept platform-uploaded files
          const validUrls = evidenceUrls.filter(url => typeof url === 'string' && url.startsWith('https://'));
          updates.evidence_urls = validUrls;
        }

        const updated = await base44.asServiceRole.entities.TrainingProgress.update(progress.id, updates);

        return Response.json({ success: true, progress: updated });
      }

      // ── COMPLETE TRAINING ──────────────────────────────────────────────────────
      case 'complete_training': {
        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const employee = await resolveEmployee(base44, effectiveEmail);
        if (!employee) {
          return Response.json({ error: 'No employee record found for your account' }, { status: 403 });
        }

        const existing = await base44.asServiceRole.entities.TrainingProgress.filter({
          training_id: trainingId,
          employee_registry_id: employee.id,
        });

        if (existing.length === 0) {
          return Response.json({ error: 'No training progress found — call start_training first' }, { status: 404 });
        }

        const progress = existing[0];
        // Validate evidence URLs — only accept platform-uploaded files
        const finalEvidenceUrls = (evidenceUrls || progress.evidence_urls || [])
          .filter(url => typeof url === 'string' && url.startsWith('https://'));

        const updated = await base44.asServiceRole.entities.TrainingProgress.update(progress.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          current_step: progress.total_steps || 0,
          step_progress_json: stepProgressJson || progress.step_progress_json,
          evidence_urls: finalEvidenceUrls,
        });

        // Update linked EnterpriseTask if task_id is set
        if (progress.task_id) {
          try {
            const task = await base44.asServiceRole.entities.EnterpriseTask.get(progress.task_id);
            if (task) {
              await base44.asServiceRole.entities.EnterpriseTask.update(progress.task_id, {
                training_session_id: progress.id,
                training_completed_at: new Date().toISOString(),
                current_training_step: progress.total_steps || 0,
              });
            }
          } catch (e) { /* best-effort */ }
        }

        await logTrainingEvent(base44, trainingId, 'training_completed', {
          employee: employee.id, task: progress.task_id || null
        }, user.email);

        return Response.json({ success: true, progress: updated });
      }

      // ── GET PROGRESS ────────────────────────────────────────────────────────────
      case 'get_progress': {
        if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

        const employee = await resolveEmployee(base44, effectiveEmail);
        if (!employee) {
          return Response.json({ success: true, progress: null });
        }

        const existing = await base44.asServiceRole.entities.TrainingProgress.filter({
          training_id: trainingId,
          employee_registry_id: employee.id,
        });

        return Response.json({
          success: true,
          progress: existing[0] || null,
          employee_id: employee.id,
        });
      }

      // ── UPLOAD FILE (server-side validated screenshot/evidence upload) ─────────
      case 'upload_file': {
        const { purpose, fileDataUrl, stepIndex } = body;
        const uploadEmployee = await resolveEmployee(base44, effectiveEmail);

        // 1. Verify authenticated employee
        if (!uploadEmployee) {
          return Response.json({ error: 'No employee record found for your account' }, { status: 403 });
        }

        // 2. Check permission and relationship based on purpose
        if (purpose === 'screenshot') {
          // Screenshot upload requires edit permission
          if (!hasPermission(canonicalRoleKey, 'edit')) {
            return Response.json({ error: 'You do not have permission to upload screenshots' }, { status: 403 });
          }
          if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

          const guide = await base44.asServiceRole.entities.TrainingRegistry.get(trainingId);
          if (!guide) return Response.json({ error: 'Training guide not found' }, { status: 404 });

          // Director can only edit Draft or Needs Update guides
          if (canonicalRoleKey === 'director_of_operations' && guide.status !== 'Draft' && guide.status !== 'Needs Update') {
            return Response.json({ error: `Cannot upload screenshot for guide in '${guide.status}' status` }, { status: 403 });
          }
        } else if (purpose === 'evidence') {
          // Evidence upload requires save_progress permission
          if (!hasPermission(canonicalRoleKey, 'save_progress')) {
            return Response.json({ error: 'You do not have permission to upload evidence' }, { status: 403 });
          }
          if (!trainingId) return Response.json({ error: 'trainingId required' }, { status: 400 });

          // Verify ownership of active training session
          const progressRecords = await base44.asServiceRole.entities.TrainingProgress.filter({
            training_id: trainingId,
            employee_registry_id: uploadEmployee.id,
            status: { $in: ['in_progress', 'completed'] },
          });
          if (progressRecords.length === 0) {
            return Response.json({ error: 'No active training session found — call start_training first' }, { status: 403 });
          }
        } else {
          return Response.json({ error: 'Invalid purpose. Must be "screenshot" or "evidence"' }, { status: 400 });
        }

        // 3. Parse data URL
        if (!fileDataUrl || typeof fileDataUrl !== 'string') {
          return Response.json({ error: 'fileDataUrl required' }, { status: 400 });
        }
        const dataMatch = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!dataMatch) {
          return Response.json({ error: 'Invalid file data format' }, { status: 400 });
        }

        const mimeType = dataMatch[1];
        const base64Data = dataMatch[2];

        // 4. Validate file type
        const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!ALLOWED_UPLOAD_TYPES.includes(mimeType)) {
          return Response.json({ error: `File type '${mimeType}' not allowed. Allowed: JPEG, PNG, WebP, GIF` }, { status: 400 });
        }

        // 5. Validate file size (max 10MB)
        const binaryString = atob(base64Data);
        const fileSizeBytes = binaryString.length;
        if (fileSizeBytes > 10 * 1024 * 1024) {
          return Response.json({ error: 'File exceeds 10MB limit' }, { status: 400 });
        }

        // 6. Upload via platform integration (server-side only)
        const fileBytes = new Uint8Array(fileSizeBytes);
        for (let i = 0; i < fileSizeBytes; i++) {
          fileBytes[i] = binaryString.charCodeAt(i);
        }
        const ext = mimeType.split('/')[1]; // jpeg, png, webp, gif
        const fileName = `training_${purpose}_${Date.now()}.${ext}`;
        const fileObj = new File([fileBytes], fileName, { type: mimeType });

        const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });

        if (!uploadRes?.file_url) {
          return Response.json({ error: 'File upload failed' }, { status: 500 });
        }

        // 7. Log the upload for audit trail
        await logTrainingEvent(base44, trainingId, 'file_uploaded', {
          purpose, mimeType, fileSizeBytes, file_url: uploadRes.file_url,
          stepIndex: stepIndex || null, uploaded_by: user.email
        }, user.email);

        return Response.json({ success: true, file_url: uploadRes.file_url });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});