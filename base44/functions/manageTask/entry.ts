import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { checkAndCreateResumeObligation, startWorkSession } from '../../shared/taskResponseHelpers.ts';
import { generateAcknowledgmentNumber } from '../../shared/notificationHelpers.ts';

// ─── Workflow constants ──────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  'Draft': ['Assigned', 'Canceled'],
  'Assigned': ['In Progress', 'Canceled', 'On Hold'],
  'In Progress': ['Blocked', 'On Hold', 'Submitted for Review', 'Canceled'],
  'Blocked': ['In Progress', 'Canceled'],
  'On Hold': ['In Progress', 'Canceled'],
  'Submitted for Review': ['Changes Requested', 'Awaiting Approval', 'Approved', 'In Progress'],
  'Changes Requested': ['In Progress', 'Canceled'],
  'Awaiting Approval': ['Approved', 'Changes Requested'],
  'Approved': ['Completed'],
  'Completed': [],
  'New': ['Assigned', 'In Progress', 'Cancelled', 'Blocked'],
  'Waiting': ['In Progress', 'Cancelled'],
  'Needs Approval': ['Completed', 'Cancelled'],
  'Cancelled': [],
  'Overdue': ['In Progress', 'Cancelled', 'Completed'],
};

const STATUSES_REQUIRING_REASON = ['Blocked', 'On Hold', 'Canceled', 'Cancelled'];

const ROLE_ACTION_PERMISSIONS = {
  admin: ['view', 'create', 'edit', 'review', 'approve', 'assign', 'delete', 'configure', 'reopen', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'archive', 'execute_assigned_task'],
  owner: ['view', 'create', 'edit', 'review', 'approve', 'assign', 'delete', 'configure', 'reopen', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'archive', 'execute_assigned_task'],
  director_of_operations: ['view', 'create', 'edit', 'review', 'assign', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'archive', 'execute_assigned_task'],
  warehouse_manager: ['view', 'create', 'edit', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'execute_assigned_task'],
  warehouse_associate: ['view', 'edit', 'execute_assigned_task'],
  operations_manager: ['view', 'create', 'edit', 'review', 'assign', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'archive', 'execute_assigned_task'],
  office_manager: ['view', 'create', 'edit', 'assign', 'cancel', 'reassign', 'change_due_date', 'change_priority', 'duplicate', 'execute_assigned_task'],
  // Field roles — can view and execute their own assigned tasks, but NOT edit task configuration
  lead_technician: ['view', 'execute_assigned_task'],
  technician: ['view', 'execute_assigned_task'],
  apprentice: ['view', 'execute_assigned_task'],
  csr: ['view', 'execute_assigned_task'],
  inventory_specialist: ['view', 'execute_assigned_task'],
  customer: ['view'],
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

async function generateTaskNumber(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { task_number: { $regex: '^TSK-' } },
      '-task_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].task_number) {
      const match = String(existing[0].task_number).match(/TSK-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'TSK-' + String(next).padStart(6, '0');
    // Check for collision (parallel calls may generate the same number)
    const collision = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { task_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  // Fallback: timestamp-based (extremely unlikely to collide)
  return 'TSK-' + String(Date.now()).slice(-6);
}

async function logTaskEvent(base44, taskId, eventType, details, userEmail) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: 'TASK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: 'task_registry',
      trigger_event: eventType,
      related_record_id: taskId,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch (e) { /* best-effort */ }
}

async function createNotification(base44, params) {
  try {
    // ── Duplicate prevention: check for an existing ACTIVE notification
    //    for the same task, same recipient, same purpose, same assignment version ──
    if (params.taskId && params.notificationPurpose) {
      const dupQuery = {
        related_task: params.taskId,
        notification_purpose: params.notificationPurpose,
        assignment_version: params.assignmentVersion || 0,
        is_archived: { $ne: true },
        status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
      };
      if (params.recipientEmployeeId) {
        dupQuery.recipient_employee_registry_id = params.recipientEmployeeId;
      } else if (params.recipientEmail) {
        dupQuery.recipient_email = params.recipientEmail;
      } else if (params.recipientRole) {
        dupQuery.recipient_role = params.recipientRole;
      }
      const existing = await base44.asServiceRole.entities.EnterpriseNotification.filter(dupQuery, null, 1);
      if (existing.length > 0) {
        // Already have an active notification for this assignment — skip
        return;
      }
    }

    // Generate a safe notification ID (NOT count+1)
    let notificationId = null;
    try {
      // Inline safe ID generation to avoid circular import
      for (let attempt = 0; attempt < 5; attempt++) {
        const recent = await base44.asServiceRole.entities.EnterpriseNotification.filter(
          { notification_id: { $regex: '^NOTF-' } },
          '-notification_id',
          1
        );
        let next = 1;
        if (recent.length > 0 && recent[0].notification_id) {
          const match = String(recent[0].notification_id).match(/NOTF-(\d+)/);
          if (match) next = parseInt(match[1], 10) + 1;
        }
        const candidate = 'NOTF-' + String(next).padStart(6, '0');
        const collision = await base44.asServiceRole.entities.EnterpriseNotification.filter(
          { notification_id: candidate }, null, 1
        );
        if (collision.length === 0) { notificationId = candidate; break; }
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
    } catch (e) { /* fall through */ }
    if (!notificationId) notificationId = 'NOTF-' + String(Date.now()).slice(-6);

    await base44.asServiceRole.entities.EnterpriseNotification.create({
      notification_id: notificationId,
      notification_type: 'Task',
      notification_purpose: params.notificationPurpose || 'task_assignment',
      title: params.title,
      message: params.message,
      priority: params.priority || 'Medium',
      recipient_email: params.recipientEmail || null,
      recipient_employee_registry_id: params.recipientEmployeeId || null,
      recipient_role: params.recipientRole || null,
      recipient_department: params.recipientDepartment || null,
      related_task: params.taskId || null,
      related_task_number: params.taskNumber || null,
      related_task_title: params.taskTitle || null,
      related_task_priority: params.taskPriority || null,
      related_task_due_date: params.taskDueDate || null,
      assignment_version: params.assignmentVersion || 0,
      source_module: 'task_registry',
      source_record_id: params.taskId || null,
      delivery_methods: ['In-App'],
      status: 'Sent',
      sent_date: new Date().toISOString(),
      is_archived: false,
      requires_acknowledgment: params.requiresAcknowledgment || false,
      escalation_level: 0,
    });
  } catch (e) { /* best-effort */ }
}

/**
 * Resolve (mark as Resolved/superseded) all active task-related notifications
 * for a given task, optionally filtered by purpose.
 * Used by task lifecycle actions (complete, cancel, archive, reassign).
 */
async function resolveTaskNotifications(base44, taskId, resolutionType, resolutionReason, resolvedByName, resolvedByEmployeeId, purposeFilter) {
  try {
    const query = {
      related_task: taskId,
      is_archived: { $ne: true },
      status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
    };
    if (purposeFilter) query.notification_purpose = purposeFilter;
    const active = await base44.asServiceRole.entities.EnterpriseNotification.filter(query, null, 50);
    const now = new Date().toISOString();
    for (const n of active) {
      await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, {
        status: 'Resolved',
        resolved_at: now,
        resolved_by_name: resolvedByName,
        resolved_by_employee_id: resolvedByEmployeeId || null,
        resolution_type: resolutionType,
        resolution_reason: resolutionReason || null,
        resolution_source_type: 'enterprise_task',
        resolution_source_id: taskId,
      });
    }
  } catch (e) { /* best-effort */ }
}

/**
 * Update the active task assignment notification's snapshot fields
 * (due date, priority, title) without creating a duplicate.
 */
async function updateTaskNotificationSnapshot(base44, taskId, updates) {
  try {
    const active = await base44.asServiceRole.entities.EnterpriseNotification.filter(
      {
        related_task: taskId,
        notification_purpose: { $in: ['task_assignment', 'task_reassigned'] },
        is_archived: { $ne: true },
        status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
      },
      null,
      10
    );
    const snapshotUpdates = {};
    if (updates.priority) snapshotUpdates.related_task_priority = updates.priority;
    if (updates.due_date) snapshotUpdates.related_task_due_date = updates.due_date;
    if (updates.title) snapshotUpdates.related_task_title = updates.title;
    if (updates.priority) snapshotUpdates.priority = updates.priority;
    for (const n of active) {
      await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, snapshotUpdates);
    }
  } catch (e) { /* best-effort */ }
}

// ─── Template-derived fields tracked for override detection ───────────────────
const TEMPLATE_DERIVED_FIELDS = [
  'priority', 'work_category', 'business_impact', 'urgency', 'interruptibility',
  'focus_lock_eligible', 'resume_required', 'requires_immediate_acknowledgment',
  'claim_mode', 'estimated_duration_minutes', 'execution_mode', 'assignment_mode',
  'requires_notes', 'requires_signature', 'requires_record_id', 'requires_manager_verification',
  'requires_checklist_completion', 'requires_training_completion', 'requires_linked_workflow_completion',
  'minimum_photo_count', 'required_evidence_types', 'self_approval_prohibited',
  'approval_capability', 'escalation_conditions_json', 'requires_approval',
  'execution_route', 'linked_module',
];

// ─── Customer/Job Relationship Validation ────────────────────────────────────
async function validateCustomerJobRelationship(base44, customerId, jobId, previousCustomerId) {
  if (!customerId || !jobId) return { valid: true };
  let customer = null;
  try { customer = await base44.asServiceRole.entities.Customer.get(customerId); } catch (e) { }
  if (!customer) return { valid: false, error: 'Selected customer not found' };
  let job = null;
  try { job = await base44.asServiceRole.entities.Job.get(jobId); } catch (e) { }
  if (!job) return { valid: false, error: 'Selected job not found' };
  const customerRef = String(customer.customer_number || '').trim();
  const jobCustomerRef = String(job.customer_id || job.customer_number || '').trim();
  if (previousCustomerId && previousCustomerId !== customerId) {
    if (jobCustomerRef && customerRef && jobCustomerRef !== customerRef) {
      return { valid: false, error: 'Customer changed but the selected job belongs to customer ' + jobCustomerRef + ', not ' + customerRef + '. Clear the job or select a matching one.', shouldClearJob: true };
    }
  }
  if (customerRef && jobCustomerRef && customerRef !== jobCustomerRef) {
    return { valid: false, error: 'Job ' + (job.job_number || job.id || '') + ' does not belong to customer ' + (customer.name || customer.customer_number || '') + ' (customer ' + customerRef + ' vs job customer ' + jobCustomerRef + ')' };
  }
  return { valid: true, customer, job };
}

// ─── Granular Completion Evidence Validation ──────────────────────────────────
function validateCompletionRequirements(task, approverEmployeeId) {
  const missing = [];
  if (task.requires_notes) {
    if (String(task.completion_summary || '').trim().length < 10) missing.push({ requirement: 'notes', message: 'Completion notes are required (minimum 10 characters)' });
  }
  const minPhotos = task.minimum_photo_count || 0;
  if (minPhotos > 0 && (task.completion_evidence || []).length < minPhotos) missing.push({ requirement: 'photos', message: 'Minimum ' + minPhotos + ' photo(s) required (' + (task.completion_evidence || []).length + ' provided)' });
  if (task.required_evidence_types && task.required_evidence_types.length > 0 && !(task.completion_evidence || []).length) missing.push({ requirement: 'evidence_types', message: 'Required evidence types: ' + task.required_evidence_types.join(', ') });
  if (task.requires_signature && !(task.completion_evidence || []).some(u => /sig/i.test(String(u)))) missing.push({ requirement: 'signature', message: 'A valid signature is required to complete this task' });
  if (task.requires_record_id && !task.related_record_id && !task.source_record_id) missing.push({ requirement: 'record_id', message: 'A linked record ID is required to complete this task' });
  if (task.requires_manager_verification) {
    const ah = parseJSON(task.approval_history, []);
    if (!ah.some(e => /Verified|Approved/i.test(String(e.action || '')))) missing.push({ requirement: 'manager_verification', message: 'Manager verification is required before completion' });
  }
  if (task.requires_checklist_completion && !task.linked_checklist_id) missing.push({ requirement: 'checklist', message: 'A linked checklist must be completed' });
  if (task.requires_training_completion && !task.training_completed_at && !task.knowledge_check_score) missing.push({ requirement: 'training', message: 'Associated training must be completed before task completion' });
  if (task.requires_linked_workflow_completion && !task.workflow_session_id) missing.push({ requirement: 'linked_workflow', message: 'A linked workflow session must be completed' });
  if (task.self_approval_prohibited && approverEmployeeId && task.requested_by_employee_id === approverEmployeeId) missing.push({ requirement: 'self_approval', message: 'Self-approval is prohibited — the submitter cannot approve this task' });
  if (task.require_completion_evidence && !task.completion_summary && !(task.completion_evidence || []).length) missing.push({ requirement: 'completion_evidence', message: 'Completion notes or evidence is required' });
  return missing;
}

// ─── Template Override Detection ──────────────────────────────────────────────
function detectAndRecordOverrides(task, taskData, employeeId, employeeName) {
  if (!task.task_template_id) return { overrides: [] };
  const snapshot = parseJSON(task.template_defaults_snapshot, null);
  if (!snapshot) return { overrides: [] };
  const overrideReason = taskData.template_override_reason || '';
  const changedFields = Object.keys(taskData).filter(k =>
    TEMPLATE_DERIVED_FIELDS.includes(k) && taskData[k] !== undefined &&
    JSON.stringify(task[k]) !== JSON.stringify(taskData[k])
  );
  if (changedFields.length === 0) return { overrides: [] };
  if (!overrideReason) return { error: 'Override reason required when changing template-derived fields: ' + changedFields.join(', '), changedFields };
  const existingHistory = parseJSON(task.template_override_history, []);
  const now = new Date().toISOString();
  const newEntries = changedFields.map(field => ({
    field, template_value: snapshot[field] !== undefined ? snapshot[field] : null,
    previous_task_value: task[field] !== undefined ? task[field] : null,
    new_value: taskData[field], reason: overrideReason,
    changed_by_employee_id: employeeId, changed_by_name: employeeName, changed_at: now,
  }));
  return { overrides: newEntries, updatedHistory: JSON.stringify([...existingHistory, ...newEntries]) };
}

// ─── Assignment Mode Validation ──────────────────────────────────────────────
async function validateAssignmentMode(base44, taskData) {
  const mode = taskData.assignment_mode;
  const errors = [];
  switch (mode) {
    case 'specific_employee': {
      const empId = taskData.assigned_employee_registry_id;
      if (!empId) { errors.push('Specific Employee assignment requires one employee'); break; }
      try { const emp = await base44.asServiceRole.entities.EmployeeRegistry.get(empId);
        if (!emp) errors.push('Assigned employee not found');
        else if (emp.employment_status && emp.employment_status !== 'Active') errors.push('Assigned employee must be Active (current: ' + emp.employment_status + ')');
      } catch (e) { errors.push('Assigned employee not found'); }
      break;
    }
    case 'multiple_employees': {
      const ids = taskData.assigned_employee_ids || [];
      const required = taskData.required_employee_count || 1;
      if (ids.length < required) errors.push('Multiple Employees requires ' + required + ' employee(s) (' + ids.length + ' provided)');
      for (const id of ids) { try { const emp = await base44.asServiceRole.entities.EmployeeRegistry.get(id);
        if (emp && emp.employment_status && emp.employment_status !== 'Active') errors.push('Employee ' + (emp.employee_id || id) + ' is not Active');
      } catch (e) {} }
      break;
    }
    case 'role_queue': {
      const roleIds = taskData.assigned_role_ids || [];
      if (roleIds.length === 0) { errors.push('Role Queue requires at least one RoleRegistry ID'); break; }
      for (const id of roleIds) { try { const role = await base44.asServiceRole.entities.RoleRegistry.get(id);
        if (role && role.status && role.status !== 'Active') errors.push('Role ' + (role.role_id || id) + ' is not Active');
      } catch (e) {} }
      break;
    }
    case 'department_queue':
      if (!taskData.assigned_department_id && !taskData.assigned_department) errors.push('Department Queue requires a valid department');
      break;
    case 'eligibility_engine': {
      const caps = taskData.required_capabilities || []; const tr = taskData.required_training_ids || []; const cert = taskData.required_certification_ids || [];
      if (caps.length === 0 && tr.length === 0 && cert.length === 0) errors.push('Eligibility Engine requires qualification rules (capabilities, training, or certifications)');
      break;
    }
    case 'manager_selects':
      if (!taskData.required_approver_id && !taskData.assigned_department_id) errors.push('Manager Selects requires a responsible manager or department queue');
      break;
    case undefined: case null: case '': break;
    default: errors.push('Unknown assignment mode: ' + mode);
  }
  if (mode === 'role_queue' && taskData.assigned_employee_registry_id && !(taskData.assigned_employee_ids || []).length) errors.push('Role Queue mode should not have a pre-assigned specific employee');
  return errors;
}

// ─── Execution Mode Validation ────────────────────────────────────────────────
async function validateExecutionMode(base44, taskData) {
  const mode = taskData.execution_mode;
  const errors = [];
  switch (mode) {
    case 'simple_action': break;
    case 'checklist': if (!taskData.linked_checklist_id) errors.push('Checklist execution mode requires a valid checklist'); break;
    case 'guided_task': if (!taskData.execution_route && !taskData.related_route) errors.push('Guided Task execution mode requires an execution route'); break;
    case 'form': if (!taskData.linked_form_id) errors.push('Form execution mode requires a valid linked form'); break;
    case 'workflow': {
      if (!taskData.linked_workflow_id) { errors.push('Workflow execution mode requires a valid published workflow'); break; }
      try { const wf = await base44.asServiceRole.entities.WorkflowRegistry.get(taskData.linked_workflow_id);
        if (wf && wf.status && !['Published','Active','Approved'].includes(wf.status)) errors.push('Linked workflow must be Published (current: ' + wf.status + ')');
      } catch (e) { errors.push('Linked workflow not found'); }
      break;
    }
    case 'wizard': if (!taskData.linked_wizard_key || !taskData.execution_route) errors.push('Wizard execution mode requires a registered wizard key and route'); break;
    case 'linked_module': if (!taskData.linked_module || !taskData.execution_route) errors.push('Linked Module execution mode requires an allowed module and route'); break;
    case 'automated': if (!taskData.trigger_type || taskData.trigger_type === 'manual') errors.push('Automated execution mode requires a non-manual trigger type'); break;
    case undefined: case null: case '': break;
    default: errors.push('Unknown execution mode: ' + mode);
  }
  return errors;
}

// ─── Copy direct fields from published template ───────────────────────────────
const TEMPLATE_DIRECT_FIELDS = [
  'execution_mode','assignment_mode','execution_route','linked_module',
  'linked_checklist_id','linked_form_id','linked_workflow_id','linked_wizard_key',
  'required_evidence_types','minimum_photo_count','requires_notes','requires_signature',
  'requires_record_id','requires_manager_verification','requires_checklist_completion',
  'requires_training_completion','requires_linked_workflow_completion',
  'self_approval_prohibited','approval_capability','escalation_conditions_json',
  'work_category','business_impact','urgency','interruptibility','focus_lock_eligible',
  'resume_required','requires_immediate_acknowledgment','claim_mode',
  'estimated_duration_minutes','requires_approval',
];

async function copyTemplateFields(base44, taskData) {
  if (!taskData.task_template_id) return {};
  let template = null;
  try { template = await base44.asServiceRole.entities.TaskTemplate.get(taskData.task_template_id); } catch (e) { }
  if (!template) return {};
  if (template.status !== 'Published' && template.status !== 'Approved') return { error: 'Only Published or Approved templates can be used for task creation (current: ' + template.status + ')' };
  const copied = {};
  for (const f of TEMPLATE_DIRECT_FIELDS) {
    if (template[f] !== undefined && template[f] !== null && taskData[f] === undefined) copied[f] = template[f];
  }
  if (!taskData.template_defaults_snapshot) {
    copied.template_defaults_snapshot = JSON.stringify({ ...copied, title: template.template_name, description: template.description || '', department: template.department_name_snapshot || '', priority: template.default_priority || 'Medium', work_category: template.work_category, execution_mode: template.execution_mode, assignment_mode: template.assignment_mode });
  }
  if (!taskData.task_template_number) copied.task_template_number = template.template_number;
  if (!taskData.task_template_version) copied.task_template_version = template.version || 1;
  return { copied, template };
}

function parseJSON(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str) || typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, taskId, taskData, newStatus, reason, commentText, reviewAction, attachmentUrl, evidenceUrl, evidenceNotes, filters, listScope, _test_user_email, newDueDate, newPriority, archiveReason, templateId, expectedAssignmentVersion, sourceContext, notificationId, deviceId, currentRoute, currentStep, startsAt, endsAt, isAllDay, scheduleTimezone, updateDueAt, rescheduleReason } = body;

    // ── Step 1: Portal-level access via shared hardened authorization helper ──
    // Never trust a role from the caller — checkNavigationAccess resolves it from auth.me()
    // _test_user_email is admin-only and simulates another user's identity for testing
    // ── Transition (Start, Submit for Review, Complete, Block, Hold, Cancel) ──
    // Transition is an execution action authorized through assignee ownership, NOT
    // general Edit Task permission. Portal-level access only requires 'view' (the
    // user must be able to see the task). Assignee-based authorization is enforced
    // inside the transition case for execution transitions (In Progress, Submitted
    // for Review, Completed). Administrative transitions (Canceled, Blocked, On
    // Hold) still require 'cancel' or 'edit' permission checked server-side.
    const portalAction = (action === 'list' || action === 'get' || action === 'comment' || action === 'transition' || action === 'start_assigned_task') ? 'view'
      : (action === 'reassign') ? 'assign'
      : (action === 'change_due_date' || action === 'change_priority' || action === 'archive' || action === 'match_template' || action === 'schedule_task') ? 'edit'
      : (action === 'duplicate') ? 'create'
      : action;
    const navAccess = await base44.functions.invoke('checkNavigationAccess', {
      user_email: user.email,
      _test_user_email: _test_user_email,
      route: '/tasks',
      action: portalAction,
    });

    if (navAccess.data?.allowed === false) {
      return Response.json({
        error: 'Access denied',
        reason: navAccess.data?.reason || 'Not permitted to access Task Registry',
      }, { status: 403 });
    }

    const canonicalRoleKey = navAccess.data?.canonical_role_key || normalizeRole(user.role);
    const privileged = isPrivileged(canonicalRoleKey);

    // ── Step 2: Role-specific action permission check ──
    if (!privileged && !hasPermission(canonicalRoleKey, portalAction)) {
      return Response.json({
        error: "Role '" + canonicalRoleKey + "' does not have '" + portalAction + "' permission",
      }, { status: 403 });
    }

    // ── Step 3: Resolve employee record for workflow rules ──
    const effectiveEmail = _test_user_email || user.email;
    const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
      $or: [{ email: effectiveEmail }, { login_email: effectiveEmail }],
    });
    const employee = employees[0];
    const employeeId = employee?.employee_id || employee?.id || '';
    const employeeName = employee
      ? (employee.preferred_name || employee.first_name || '') + ' ' + (employee.last_name || '')
      : user.full_name || 'Unknown';

    // ── Step 4: Execute action ──

    console.log("[MANAGE TASK ACTION]", {
      action,
      functionVersion: "schedule-task-fix-1",
    });

    switch (action) {

      // ── CREATE ──────────────────────────────────────────────────────────────
      case 'create': {
        // Security: strip caller-supplied creator identity — always resolve server-side
        const { created_by: _ignoredCreatedBy, requested_by_employee_id: _ignoredReqBy, ...safeTaskData } = taskData;
        if (_ignoredCreatedBy || _ignoredReqBy) {
          await logTaskEvent(base44, null, 'creator_identity_spoof_attempt', {
            supplied_created_by: _ignoredCreatedBy,
            supplied_requested_by: _ignoredReqBy,
            resolved_employee: employeeName,
          }, user.email);
        }

        // ── Test Record server-side enforcement ──
        // Do NOT trust a caller-supplied test flag from unauthorized users
        const isTestRequest = safeTaskData.is_test_record === true
          || safeTaskData.data_classification === 'test'
          || safeTaskData.is_test_data === true;
        if (isTestRequest) {
          if (!privileged) {
            await logTaskEvent(base44, null, 'unauthorized_test_record_attempt', {
              attempted_by: employeeName,
              attempted_classification: safeTaskData.data_classification,
            }, user.email);
            return Response.json({ error: 'Only Owner/Admin roles can create test records' }, { status: 403 });
          }
          const testPurpose = String(safeTaskData.test_purpose || '').trim();
          if (testPurpose.length < 5) {
            return Response.json({ error: 'Test Purpose is required (minimum 5 characters) when creating a test record' }, { status: 400 });
          }
          safeTaskData.data_classification = 'test';
          safeTaskData.is_test_data = true;
          delete safeTaskData.is_test_record;
        }

        // ── Customer/Job relationship validation ──
        if (safeTaskData.related_customer && safeTaskData.related_job) {
          const cjResult = await validateCustomerJobRelationship(base44, safeTaskData.related_customer, safeTaskData.related_job, null);
          if (!cjResult.valid) return Response.json({ error: cjResult.error }, { status: 400 });
        }

        // ── Copy direct fields from published template ──
        const tplResult = await copyTemplateFields(base44, safeTaskData);
        if (tplResult.error) return Response.json({ error: tplResult.error }, { status: 400 });
        const mergedData = { ...tplResult.copied, ...safeTaskData };

        // ── Assignment mode validation ──
        if (mergedData.assignment_mode) {
          const assignErrors = await validateAssignmentMode(base44, mergedData);
          if (assignErrors.length > 0) return Response.json({ error: 'Assignment validation failed', details: assignErrors }, { status: 400 });
        }

        // ── Execution mode validation ──
        if (mergedData.execution_mode) {
          const execErrors = await validateExecutionMode(base44, mergedData);
          if (execErrors.length > 0) return Response.json({ error: 'Execution validation failed', details: execErrors }, { status: 400 });
        }

        // ── LVC OS Default: newly assigned production tasks require acknowledgment ──
        // Every newly assigned production task defaults to requiring immediate
        // acknowledgment, unless an approved TaskTemplate explicitly opts out
        // (requires_immediate_acknowledgment === false). Test tasks are excluded.
        if (mergedData.assigned_employee_registry_id && !mergedData.is_test_data) {
          if (mergedData.requires_immediate_acknowledgment === undefined || mergedData.requires_immediate_acknowledgment === null) {
            mergedData.requires_immediate_acknowledgment = true;
          }
          if (!mergedData.acknowledgment_status || mergedData.acknowledgment_status === 'none') {
            mergedData.acknowledgment_status = 'pending';
          }
        }

        const taskNumber = await generateTaskNumber(base44);
        const status = mergedData.assigned_employee_registry_id
          ? (mergedData.status || 'Assigned')
          : (mergedData.status || 'Draft');

        const newTask = {
          ...mergedData,
          task_number: taskNumber,
          task_id: taskNumber,
          assignment_version: mergedData.assigned_employee_registry_id ? 1 : 0,
          status,
          priority: mergedData.priority || 'Medium',
          task_type: mergedData.task_type || 'Operational',
          created_by: employeeName,
          requested_by_employee_id: employeeId,
          created_date: new Date().toISOString(),
        };

        const created = await base44.asServiceRole.entities.EnterpriseTask.create(newTask);

        await logTaskEvent(base44, created.id, 'task_created', {
          task_number: taskNumber, title: newTask.title, created_by: employeeName,
        }, user.email);

        // ── Create authoritative notification for the assignee ──
        if (newTask.assigned_to_email && !newTask.is_test_data) {
          await createNotification(base44, {
            title: 'New Task Assigned: ' + newTask.title,
            message: 'You have been assigned ' + taskNumber + ': ' + newTask.title,
            priority: newTask.priority,
            recipientEmail: newTask.assigned_to_email,
            recipientEmployeeId: newTask.assigned_employee_registry_id,
            taskId: created.id,
            taskNumber: taskNumber,
            taskTitle: newTask.title,
            taskPriority: newTask.priority,
            taskDueDate: newTask.due_date || null,
            assignmentVersion: newTask.assignment_version,
            notificationPurpose: 'task_assignment',
            requiresAcknowledgment: newTask.requires_immediate_acknowledgment !== false,
          });
        }

        // ── Audit test record creation ──
        if (newTask.is_test_data) {
          await logTaskEvent(base44, created.id, 'test_record_created', {
            task_number: taskNumber,
            title: newTask.title,
            created_by: employeeName,
            test_purpose: safeTaskData.test_purpose,
          }, user.email);
        }

        return Response.json({ success: true, task: created });
      }

      // ── UPDATE ──────────────────────────────────────────────────────────────
      case 'edit': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        // Cannot edit completed tasks (except Owner)
        if (task.status === 'Completed' && !privileged) {
          return Response.json({ error: 'Cannot edit completed tasks' }, { status: 403 });
        }

        // Warehouse Manager can only edit tasks assigned to them
        if (canonicalRoleKey === 'warehouse_manager' && task.assigned_to_email !== effectiveEmail && task.requested_by_employee_id !== employeeId) {
          return Response.json({ error: 'Can only edit tasks assigned to you' }, { status: 403 });
        }

        // ── Customer/Job relationship validation on edit ──
        if (taskData.related_customer !== undefined || taskData.related_job !== undefined) {
          const newCustomer = taskData.related_customer !== undefined ? taskData.related_customer : task.related_customer;
          const newJob = taskData.related_job !== undefined ? taskData.related_job : task.related_job;
          if (newCustomer && newJob) {
            const cjResult = await validateCustomerJobRelationship(base44, newCustomer, newJob, task.related_customer);
            if (!cjResult.valid) {
              if (cjResult.shouldClearJob) {
                taskData.related_job = '';
              } else {
                return Response.json({ error: cjResult.error }, { status: 400 });
              }
            }
          }
        }

        // ── Assignment mode validation on edit ──
        if (taskData.assignment_mode) {
          const assignErrors = await validateAssignmentMode(base44, { ...task, ...taskData });
          if (assignErrors.length > 0) return Response.json({ error: 'Assignment validation failed', details: assignErrors }, { status: 400 });
        }

        // ── Execution mode validation on edit ──
        if (taskData.execution_mode) {
          const execErrors = await validateExecutionMode(base44, { ...task, ...taskData });
          if (execErrors.length > 0) return Response.json({ error: 'Execution validation failed', details: execErrors }, { status: 400 });
        }

        // ── Template override detection ──
        const overrideResult = detectAndRecordOverrides(task, taskData, employeeId, employeeName);
        if (overrideResult.error) return Response.json({ error: overrideResult.error }, { status: 400 });
        const updatePayload = { ...taskData, updated_by: employeeName };
        if (overrideResult.updatedHistory) {
          updatePayload.template_override_history = overrideResult.updatedHistory;
        }

        const updated = await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updatePayload);

        const logChanges = [...Object.keys(taskData)];
        if (overrideResult.overrides && overrideResult.overrides.length > 0) {
          logChanges.push('template_override_history');
        }
        await logTaskEvent(base44, taskId, 'task_updated', {
          changes: logChanges, updated_by: employeeName, overrides: overrideResult.overrides || [],
        }, user.email);

        return Response.json({ success: true, task: updated });
      }

      // ── ASSIGN / REASSIGN ───────────────────────────────────────────────────
      case 'assign': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!taskData?.assigned_employee_registry_id) {
          return Response.json({ error: 'Assignee is required' }, { status: 400 });
        }

        // Resolve any previous assignee's active assignment notification
        if (task.assigned_to_email && task.assigned_to_email !== taskData.assigned_to_email) {
          await resolveTaskNotifications(base44, taskId, 'superseded', 'Task reassigned to another employee', employeeName, employeeId, 'task_assignment');
        }

        const newAssignmentVersion = (task.assignment_version || 0) + 1;

        // ── LVC OS Default: assignment requires acknowledgment unless explicitly disabled ──
        const assignRequiresAck = task.requires_immediate_acknowledgment !== false;
        const updates = {
          assigned_employee_registry_id: taskData.assigned_employee_registry_id,
          assigned_to: taskData.assigned_to || '',
          assigned_to_email: taskData.assigned_to_email || '',
          assigned_to_linked_user_id: taskData.assigned_to_linked_user_id || '',
          assigned_role: taskData.assigned_role || '',
          assignment_version: newAssignmentVersion,
          acknowledgment_status: 'pending',
          requires_immediate_acknowledgment: (task.requires_immediate_acknowledgment === undefined || task.requires_immediate_acknowledgment === null) ? true : task.requires_immediate_acknowledgment,
          updated_by: employeeName,
        };
        if (task.status === 'Draft') updates.status = 'Assigned';

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

        await logTaskEvent(base44, taskId, 'task_assigned', {
          assigned_to: taskData.assigned_to, assigned_by: employeeName, assignment_version: newAssignmentVersion,
        }, user.email);

        // Notify new assignee
        if (taskData.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Assigned: ' + task.title,
            message: employeeName + ' assigned you ' + (task.task_number || task.title) + ': ' + task.title,
            priority: task.priority,
            recipientEmail: taskData.assigned_to_email,
            recipientEmployeeId: taskData.assigned_employee_registry_id,
            taskId,
            taskNumber: task.task_number || '',
            taskTitle: task.title,
            taskPriority: task.priority,
            taskDueDate: task.due_date || null,
            assignmentVersion: newAssignmentVersion,
            notificationPurpose: 'task_assignment',
            requiresAcknowledgment: assignRequiresAck,
          });
        }

        // Notify previous assignee if reassigned
        if (task.assigned_to_email && task.assigned_to_email !== taskData.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Reassigned: ' + task.title,
            message: employeeName + ' reassigned ' + (task.task_number || task.title) + ' from you',
            priority: 'Low',
            recipientEmail: task.assigned_to_email,
            recipientEmployeeId: task.assigned_employee_registry_id,
            taskId,
          });
        }

        return Response.json({ success: true });
      }

      // ── STATUS TRANSITION ───────────────────────────────────────────────────
      case 'transition': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        const currentStatus = task.status;
        const targetStatus = newStatus;

        // Validate transition — applies to ALL users including Owner
        const allowed = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(targetStatus)) {
          return Response.json({
            error: 'Invalid status transition: ' + currentStatus + ' -> ' + targetStatus,
            valid_transitions: allowed,
          }, { status: 403 });
        }

        // Reopen (Owner only) — handled separately below
        if (targetStatus === 'Completed' && currentStatus === 'Completed') {
          return Response.json({ error: 'Task is already completed' }, { status: 400 });
        }

        // ── Assignee-based authorization for execution transitions ──────────────
        // Execution transitions (Start → In Progress, Submit for Review, Complete)
        // can be performed by the DIRECT ASSIGNEE without general Edit Task
        // permission. This separates task execution from task administration.
        //
        // Administrative transitions (Canceled, Blocked, On Hold) require 'cancel'
        // or 'edit' permission — only managers/admins can cancel or block tasks.
        //
        // Spoofed identity is ignored: assignee is resolved server-side from the
        // authenticated user's email and EmployeeRegistry record, never from
        // caller-supplied fields.
        const EXECUTION_TRANSITIONS = ['In Progress', 'Submitted for Review', 'Completed'];
        const ADMIN_TRANSITIONS = ['Canceled', 'Cancelled', 'Blocked', 'On Hold'];

        if (EXECUTION_TRANSITIONS.includes(targetStatus)) {
          // Resolve the direct assignee server-side
          const isDirectAssignee = task.assigned_to_email === effectiveEmail
            || (employee && task.assigned_employee_registry_id === employee.id)
            || (employeeId && task.assigned_employee_registry_id === employeeId)
            || (employeeId && task.assigned_employee_registry_id === employeeId);

          if (!isDirectAssignee && !hasPermission(canonicalRoleKey, 'edit')) {
            await logTaskEvent(base44, taskId, 'transition_denied_not_assignee', {
              attempted_by: employeeName,
              attempted_by_email: effectiveEmail,
              target_status: targetStatus,
              assigned_to_email: task.assigned_to_email,
              assigned_employee_registry_id: task.assigned_employee_registry_id,
              reason: 'authenticated employee is not the direct assignee and lacks edit permission',
            }, user.email);
            return Response.json({
              error: 'Only the assigned employee can start, submit, or complete this task',
              reason: 'not_direct_assignee',
            }, { status: 403 });
          }
        } else if (ADMIN_TRANSITIONS.includes(targetStatus)) {
          // Administrative transitions require cancel or edit permission
          if (!hasPermission(canonicalRoleKey, 'cancel') && !hasPermission(canonicalRoleKey, 'edit')) {
            return Response.json({
              error: "Role '" + canonicalRoleKey + "' does not have permission to " + targetStatus + " tasks",
            }, { status: 403 });
          }
        }

        // Assigned requires assignee
        if (targetStatus === 'Assigned' && !task.assigned_employee_registry_id) {
          return Response.json({ error: 'Cannot assign task without an assignee' }, { status: 400 });
        }

        // Blocked / On Hold / Canceled require reason
        if (STATUSES_REQUIRING_REASON.includes(targetStatus) && !reason) {
          return Response.json({ error: targetStatus + ' requires a reason' }, { status: 400 });
        }

        // Granular completion evidence validation for Submitted for Review and Completed
        if (targetStatus === 'Submitted for Review' || targetStatus === 'Completed') {
          const missingReqs = validateCompletionRequirements(task, employeeId);
          if (missingReqs.length > 0) {
            return Response.json({
              error: 'Completion requirements not met',
              missing_requirements: missingReqs,
              missing: missingReqs.map(r => r.message),
            }, { status: 400 });
          }
        }

        // Self-approval prohibited check for Approved transition
        if (targetStatus === 'Approved' && task.self_approval_prohibited) {
          if (task.requested_by_employee_id === employeeId) {
            return Response.json({ error: 'Self-approval is prohibited — the task submitter cannot approve this task' }, { status: 403 });
          }
        }

        // Check dependencies before completing
        if (targetStatus === 'Completed') {
          const depIds = task.dependency_task_ids || [];
          for (const depId of depIds) {
            try {
              const dep = await base44.asServiceRole.entities.EnterpriseTask.get(depId);
              if (dep && dep.status !== 'Completed') {
                return Response.json({
                  error: 'Dependency ' + (dep.task_number || dep.title) + ' must be completed first',
                }, { status: 400 });
              }
            } catch (e) { /* dependency may have been deleted */ }
          }
        }

        const updates = { status: targetStatus, updated_by: employeeName };
        if (targetStatus === 'Blocked') updates.blocked_reason = reason;
        if (targetStatus === 'On Hold') updates.on_hold_reason = reason;
        if (targetStatus === 'Canceled' || targetStatus === 'Cancelled') updates.cancel_reason = reason;
        if (targetStatus === 'In Progress' && !task.start_date) {
          updates.start_date = new Date().toISOString().split('T')[0];
        }
        if (targetStatus === 'Completed') updates.completed_at = new Date().toISOString();
        if (targetStatus === 'Submitted for Review') updates.reviewed_at = new Date().toISOString();
        if (targetStatus === 'Approved') updates.approved_at = new Date().toISOString();

        // ── Lifecycle sync: resolve/cancel task notifications on terminal status ──
        if (targetStatus === 'Completed') {
          await resolveTaskNotifications(base44, taskId, 'completed', 'Task completed', employeeName, employeeId);
        }
        if (targetStatus === 'Canceled' || targetStatus === 'Cancelled') {
          await resolveTaskNotifications(base44, taskId, 'cancelled', 'Task cancelled', employeeName, employeeId);
        }

        // Append to status history
        const history = parseJSON(task.status_history, []);
        history.push({
          status: targetStatus, changed_by: employeeName,
          timestamp: new Date().toISOString(), notes: reason || '',
        });
        updates.status_history = JSON.stringify(history);

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

        // Accepted-estimate handoff: Warehouse completion releases Scheduling.
        if (targetStatus === 'Completed' && task.source_module === 'Accepted Estimate Handoff' && task.task_type === 'Warehouse') {
          const waitingTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
            source_module: 'Accepted Estimate Handoff',
            source_record_id: task.source_record_id,
            assigned_department: 'Scheduling',
            status: 'Waiting',
          }).catch(() => []);
          for (const schedulingTask of waitingTasks) {
            await base44.asServiceRole.entities.EnterpriseTask.update(schedulingTask.id, {
              status: 'New',
              waiting_reason: '',
              notes: (schedulingTask.notes || '') + '\nWarehouse review completed — ready for ServiceTitan scheduling.',
            });
            await createNotification(base44, {
              title: 'Ready to schedule: ' + schedulingTask.title,
              message: 'Warehouse has released this accepted job. Schedule it in ServiceTitan and verify vehicle availability against the synced calendar.',
              priority: 'High',
              recipientDepartment: 'Scheduling',
              taskId: schedulingTask.id,
              taskNumber: schedulingTask.task_number,
              taskTitle: schedulingTask.title,
              taskPriority: schedulingTask.priority,
              notificationPurpose: 'warehouse_release_to_scheduling',
            });
          }
        }

        // ── WorkSession lifecycle sync ──
        // Submit for Review → mark active session as waiting
        // Complete → close active session
        // Cancel → abandon active session
        if (['Submitted for Review', 'Completed', 'Canceled', 'Cancelled'].includes(targetStatus)) {
          try {
            const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
              task_id: taskId,
              status: { $in: ['active', 'waiting'] },
            }, '-started_at', 5);
            const wsNow = new Date().toISOString();
            for (const ws of activeSessions) {
              const wsUpdates = { last_activity_at: wsNow };
              if (targetStatus === 'Submitted for Review') {
                wsUpdates.status = 'waiting';
              } else if (targetStatus === 'Completed') {
                wsUpdates.status = 'completed';
                wsUpdates.completed_at = wsNow;
              } else if (targetStatus === 'Canceled' || targetStatus === 'Cancelled') {
                wsUpdates.status = 'abandoned';
              }
              await base44.asServiceRole.entities.WorkSession.update(ws.id, wsUpdates);
            }
          } catch (e) { /* best-effort */ }
        }

        await logTaskEvent(base44, taskId, 'status_transition', {
          from: currentStatus, to: targetStatus, reason, changed_by: employeeName,
        }, user.email);

        // Notifications
        if (targetStatus === 'Submitted for Review') {
          if (task.required_reviewer_id) {
            await createNotification(base44, {
              title: 'Review Requested: ' + task.title,
              message: employeeName + ' submitted ' + (task.task_number || task.title) + ' for your review',
              priority: 'High',
              recipientEmployeeId: task.required_reviewer_id,
              taskId,
            });
          } else if (privileged || canonicalRoleKey === 'director_of_operations' || canonicalRoleKey === 'operations_manager') {
            // Notify Director/Manager
            await createNotification(base44, {
              title: 'Review Requested: ' + task.title,
              message: employeeName + ' submitted ' + (task.task_number || task.title) + ' for review',
              priority: 'High',
              recipientRole: 'Director of Operations',
              taskId,
            });
          }
        }
        if (targetStatus === 'Blocked') {
          await createNotification(base44, {
            title: 'Task Blocked: ' + task.title,
            message: employeeName + ' blocked ' + (task.task_number || task.title) + ': ' + (reason || 'No reason given'),
            priority: 'High',
            recipientRole: 'Director of Operations',
            recipientEmail: task.requested_by_employee_id ? null : null,
            taskId,
          });
        }
        if (targetStatus === 'Approved' && task.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Approved: ' + task.title,
            message: employeeName + ' approved ' + (task.task_number || task.title),
            recipientEmail: task.assigned_to_email,
            taskId,
          });
        }
        if (targetStatus === 'Completed' && task.requested_by_employee_id) {
          await createNotification(base44, {
            title: 'Task Completed: ' + task.title,
            message: employeeName + ' completed ' + (task.task_number || task.title),
            recipientEmployeeId: task.requested_by_employee_id,
            taskId,
          });
        }

        // ── Check for resume obligations when task reaches terminal state ──
        if (['Completed', 'Canceled', 'Cancelled'].includes(targetStatus)) {
          try {
            const reloadedTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
            await checkAndCreateResumeObligation(base44, {
              completedTask: reloadedTask,
              user,
              terminalStatus: targetStatus,
            });
          } catch (e) {
            // Best-effort — don't fail the status transition
            console.error('[MANAGE TASK] Resume obligation check failed:', e.message);
          }
        }

        return Response.json({ success: true, new_status: targetStatus });
      }

      // ── REVIEW (submit review decision: approve review or request changes) ──
      case 'review': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (task.status !== 'Submitted for Review') {
          return Response.json({ error: 'Task is not pending review (current: ' + task.status + ')' }, { status: 400 });
        }

        // Warehouse Manager cannot review their own submission
        if (!privileged && task.assigned_to_email === effectiveEmail) {
          return Response.json({ error: 'Cannot review your own submission' }, { status: 403 });
        }

        const history = parseJSON(task.approval_history, []);

        if (reviewAction === 'request_changes') {
          const updates = { status: 'Changes Requested', updated_by: employeeName };
          history.push({ action: 'Changes Requested', approver: employeeName, notes: reason || '', timestamp: new Date().toISOString() });
          updates.approval_history = JSON.stringify(history);
          await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

          await logTaskEvent(base44, taskId, 'changes_requested', { reviewer: employeeName, reason }, user.email);

          if (task.assigned_to_email) {
            await createNotification(base44, {
              title: 'Changes Requested: ' + task.title,
              message: employeeName + ' requested changes on ' + (task.task_number || task.title) + (reason ? ': ' + reason : ''),
              priority: 'High',
              recipientEmail: task.assigned_to_email,
              taskId,
            });
          }
          return Response.json({ success: true, new_status: 'Changes Requested' });
        }

        if (reviewAction === 'approve_review') {
          // Director reviews and approves — check if Owner approval is needed
          if (task.required_approver_id && !privileged) {
            // Director cannot approve when Owner approval is required — escalate
            const updates = { status: 'Awaiting Approval', updated_by: employeeName };
            history.push({ action: 'Reviewed — Escalated to Owner', approver: employeeName, notes: reason || '', timestamp: new Date().toISOString() });
            updates.approval_history = JSON.stringify(history);
            await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

            await logTaskEvent(base44, taskId, 'escalated_to_owner', { director: employeeName }, user.email);

            await createNotification(base44, {
              title: 'Approval Required: ' + task.title,
              message: employeeName + ' reviewed ' + (task.task_number || task.title) + ' and escalated for Owner approval',
              priority: 'High',
              recipientRole: 'Owner',
              taskId,
            });
            return Response.json({ success: true, new_status: 'Awaiting Approval', message: 'Escalated to Owner for approval' });
          }

          // No Owner approval required — Director approves directly
          const updates = { status: 'Approved', approved_by: employeeName, approved_at: new Date().toISOString(), updated_by: employeeName };
          history.push({ action: 'Approved', approver: employeeName, notes: reason || '', timestamp: new Date().toISOString() });
          updates.approval_history = JSON.stringify(history);
          await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

          await logTaskEvent(base44, taskId, 'task_approved', { approver: employeeName }, user.email);

          if (task.assigned_to_email) {
            await createNotification(base44, {
              title: 'Task Approved: ' + task.title,
              message: employeeName + ' approved ' + (task.task_number || task.title),
              recipientEmail: task.assigned_to_email,
              taskId,
            });
          }
          return Response.json({ success: true, new_status: 'Approved' });
        }

        return Response.json({ error: 'Invalid reviewAction. Use "approve_review" or "request_changes".' }, { status: 400 });
      }

      // ── APPROVE (Owner final approval) ──────────────────────────────────────
      case 'approve': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (task.status !== 'Awaiting Approval' && task.status !== 'Submitted for Review') {
          return Response.json({ error: 'Task is not pending approval (current: ' + task.status + ')' }, { status: 400 });
        }

        const history = parseJSON(task.approval_history, []);
        history.push({ action: 'Approved', approver: employeeName, notes: reason || '', timestamp: new Date().toISOString() });

        const updates = {
          status: 'Approved',
          approved_by: employeeName,
          approved_at: new Date().toISOString(),
          approval_status: 'Approved',
          approval_history: JSON.stringify(history),
          updated_by: employeeName,
        };
        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

        await logTaskEvent(base44, taskId, 'task_approved', { approver: employeeName, reason }, user.email);

        if (task.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Approved: ' + task.title,
            message: employeeName + ' approved ' + (task.task_number || task.title),
            recipientEmail: task.assigned_to_email,
            taskId,
          });
        }
        return Response.json({ success: true, new_status: 'Approved' });
      }

      // ── REOPEN (Owner only) ─────────────────────────────────────────────────
      case 'reopen': {
        if (!privileged) {
          return Response.json({ error: 'Only Owner can reopen completed tasks' }, { status: 403 });
        }
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
        if (task.status !== 'Completed' && task.status !== 'Canceled' && task.status !== 'Cancelled') {
          return Response.json({ error: 'Can only reopen completed or canceled tasks' }, { status: 400 });
        }

        const history = parseJSON(task.status_history, []);
        history.push({ status: 'In Progress', changed_by: employeeName, timestamp: new Date().toISOString(), notes: reason || 'Reopened' });
        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          status: 'In Progress', status_history: JSON.stringify(history), updated_by: employeeName,
        });

        await logTaskEvent(base44, taskId, 'task_reopened', { reopened_by: employeeName, reason }, user.email);
        return Response.json({ success: true, new_status: 'In Progress' });
      }

      // ── COMMENT ─────────────────────────────────────────────────────────────
      case 'comment': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        const comments = parseJSON(task.comments, []);
        comments.push({ author: employeeName, text: commentText, timestamp: new Date().toISOString() });
        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, { comments: JSON.stringify(comments) });

        await logTaskEvent(base44, taskId, 'comment_added', { author: employeeName }, user.email);
        return Response.json({ success: true, comments });
      }

      // ── LIST (role-based filtering) ─────────────────────────────────────────
      case 'list': {
        const scope = listScope || 'all';
        let query = {};
        const sortField = filters?.sort || '-created_date';
        const limit = filters?.limit || 500;

        // Archive filter: 'active' (default) excludes archived, 'archived' shows only archived, 'all' shows everything
        const archiveFilter = filters?.archiveFilter || 'active';
        const prod = archiveFilter === 'archived'
          ? { is_test_data: { $ne: true }, is_demo_data: { $ne: true }, data_classification: 'archived' }
          : archiveFilter === 'all'
          ? { is_test_data: { $ne: true }, is_demo_data: { $ne: true }, data_classification: { $nin: ['test', 'demo_seed', 'unknown_review'] } }
          : { is_test_data: { $ne: true }, is_demo_data: { $ne: true }, data_classification: { $nin: ['test', 'demo_seed', 'unknown_review', 'archived'] } };

        if (scope === 'data_review') {
          if (!privileged) {
            return Response.json({ error: 'Not authorized to access data review' }, { status: 403 });
          }
          query = { $or: [
            { is_test_data: true },
            { is_demo_data: true },
            { data_classification: { $in: ['test', 'demo_seed', 'unknown_review', 'archived'] } },
          ]};
        } else if (scope === 'my_tasks') {
            const empName = employee
              ? (employee.preferred_name || employee.first_name || '') + ' ' + (employee.last_name || '')
              : (user.full_name || '');
            const empEntityId = employee?.id || '';
            query = { ...prod, $or: [
              { assigned_to_email: effectiveEmail },
              { assigned_to: empName },
              { assigned_employee_registry_id: employeeId },
              { assigned_employee_registry_id: empEntityId },
              { related_employee: empName },
              { requested_by_employee_id: employeeId },
            ]};
        } else if (scope === 'created_by_me') {
          query = { ...prod, requested_by_employee_id: employeeId };
        } else if (scope === 'all') {
          if (privileged) {
            query = prod;
          } else if (canonicalRoleKey === 'director_of_operations') {
            query = { ...prod, $or: [
              { requested_by_employee_id: employeeId },
              { assigned_to_email: effectiveEmail },
              { assigned_role: { $in: ['Warehouse Manager', 'warehouse_manager', 'Warehouse Associate', 'warehouse_associate'] } },
              { department: { $in: ['Warehouse', 'Operations'] } },
              { required_reviewer_id: employeeId },
              { status: 'Submitted for Review', department: { $in: ['Warehouse', 'Operations'] } },
            ]};
          } else if (canonicalRoleKey === 'warehouse_manager') {
            query = { ...prod, $or: [
              { assigned_to_email: effectiveEmail },
              { requested_by_employee_id: employeeId },
              { assigned_role: { $in: ['Warehouse Manager', 'warehouse_manager', 'Warehouse Associate', 'warehouse_associate'] } },
              { department: 'Warehouse' },
            ]};
          } else {
            query = { ...prod, assigned_to_email: effectiveEmail };
          }
        }

        // Apply status filter
        if (filters?.status) {
          query = { ...query, status: filters.status };
        }

        const tasks = await base44.asServiceRole.entities.EnterpriseTask.filter(query, sortField, limit);
        return Response.json({ success: true, tasks, count: tasks.length });
      }

      // ── GET (single task with permission check) ────────────────────────────
      case 'get': {
        // Resolve by entity record ID, then task_id, then task_number
        let task = null;
        try {
          task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        } catch (e) { /* taskId may not be a valid entity ID — try fallback lookups */ }

        if (!task) {
          const byTaskId = await base44.asServiceRole.entities.EnterpriseTask.filter({ task_id: taskId }, null, 1);
          task = byTaskId[0] || null;
        }
        if (!task) {
          const byTaskNumber = await base44.asServiceRole.entities.EnterpriseTask.filter({ task_number: taskId }, null, 1);
          task = byTaskNumber[0] || null;
        }
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        // Deny direct access to test/demo/archived tasks for non-admin roles
        if (!privileged && (task.is_test_data || task.is_demo_data || ['test', 'demo_seed', 'unknown_review', 'archived'].includes(task.data_classification))) {
          return Response.json({ error: 'Not authorized to view this task' }, { status: 403 });
        }

        // Permission check: can the user view this task?
        if (!privileged) {
          const canView =
            task.assigned_to_email === effectiveEmail ||
            task.requested_by_employee_id === employeeId ||
            task.required_reviewer_id === employeeId ||
            task.required_approver_id === employeeId ||
            (canonicalRoleKey === 'director_of_operations' && (
              task.department === 'Warehouse' || task.department === 'Operations' ||
              String(task.assigned_role).toLowerCase().includes('warehouse') ||
              String(task.assigned_role).toLowerCase().includes('director') ||
              (task.status === 'Submitted for Review' && (task.department === 'Warehouse' || task.department === 'Operations'))
            )) ||
            (canonicalRoleKey === 'warehouse_manager' && (
              task.department === 'Warehouse' ||
              String(task.assigned_role).toLowerCase().includes('warehouse')
            )) ||
            (canonicalRoleKey === 'operations_manager');
          if (!canView) {
            return Response.json({ error: 'Not authorized to view this task' }, { status: 403 });
          }
        }

        return Response.json({ success: true, task });
      }

      // ── DELETE (Owner only, not in normal UI) ───────────────────────────────
      case 'delete': {
        if (!privileged) {
          return Response.json({ error: 'Only Owner can permanently delete tasks' }, { status: 403 });
        }
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        await base44.asServiceRole.entities.EnterpriseTask.delete(taskId);
        await logTaskEvent(base44, taskId, 'task_deleted', { deleted_by: employeeName, title: task.title }, user.email);
        return Response.json({ success: true });
      }

      // ── REASSIGN ─────────────────────────────────────────────────────────────
      case 'reassign': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'reassign')) {
          return Response.json({ error: 'Not authorized to reassign tasks' }, { status: 403 });
        }

        const prevAssignee = task.assigned_to || '';
        const prevAssigneeEmail = task.assigned_to_email || '';
        const prevAssigneeId = task.assigned_employee_registry_id || '';

        // Resolve the previous assignee's active assignment notification
        if (prevAssigneeEmail && prevAssigneeEmail !== taskData.assigned_to_email) {
          await resolveTaskNotifications(base44, taskId, 'superseded', 'Task reassigned to another employee', employeeName, employeeId, 'task_assignment');
          await resolveTaskNotifications(base44, taskId, 'superseded', 'Task reassigned to another employee', employeeName, employeeId, 'task_reassigned');
        }

        const newAssignmentVersion = (task.assignment_version || 0) + 1;

        // ── LVC OS Default: reassignment requires acknowledgment unless explicitly disabled ──
        const reassignRequiresAck = task.requires_immediate_acknowledgment !== false;
        const updates = {
          assigned_employee_registry_id: taskData.assigned_employee_registry_id || '',
          assigned_to: taskData.assigned_to || '',
          assigned_to_email: taskData.assigned_to_email || '',
          assigned_to_linked_user_id: taskData.assigned_to_linked_user_id || '',
          assigned_role: taskData.assigned_role || '',
          assigned_department: taskData.assigned_department || task.assigned_department || '',
          assignment_version: newAssignmentVersion,
          acknowledgment_status: 'pending',
          requires_immediate_acknowledgment: (task.requires_immediate_acknowledgment === undefined || task.requires_immediate_acknowledgment === null) ? true : task.requires_immediate_acknowledgment,
          updated_by: employeeName,
        };

        const history = parseJSON(task.status_history, []);
        history.push({
          status: task.status, changed_by: employeeName,
          timestamp: new Date().toISOString(),
          notes: 'Reassigned from ' + prevAssignee + ' to ' + (taskData.assigned_to || '') + (reason ? ': ' + reason : ''),
        });
        updates.status_history = JSON.stringify(history);

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, updates);

        await logTaskEvent(base44, taskId, 'task_reassigned', {
          from: prevAssignee, to: taskData.assigned_to, reason, reassigned_by: employeeName, assignment_version: newAssignmentVersion,
        }, user.email);

        if (taskData.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Reassigned to You: ' + task.title,
            message: employeeName + ' reassigned ' + (task.task_number || task.title) + ' to you' + (reason ? ': ' + reason : ''),
            priority: task.priority,
            recipientEmail: taskData.assigned_to_email,
            recipientEmployeeId: taskData.assigned_employee_registry_id,
            taskId,
            taskNumber: task.task_number || '',
            taskTitle: task.title,
            taskPriority: task.priority,
            taskDueDate: task.due_date || null,
            assignmentVersion: newAssignmentVersion,
            notificationPurpose: 'task_reassigned',
            requiresAcknowledgment: reassignRequiresAck,
          });
        }
        if (prevAssigneeEmail && prevAssigneeEmail !== taskData.assigned_to_email) {
          await createNotification(base44, {
            title: 'Task Reassigned: ' + task.title,
            message: employeeName + ' reassigned ' + (task.task_number || task.title) + ' from you to ' + (taskData.assigned_to || 'another employee') + (reason ? ': ' + reason : ''),
            priority: 'Low',
            recipientEmail: prevAssigneeEmail,
            recipientEmployeeId: prevAssigneeId,
            taskId,
          });
        }

        return Response.json({ success: true, previous_assignee: prevAssignee });
      }

      // ── CHANGE DUE DATE ──────────────────────────────────────────────────────
      case 'change_due_date': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'change_due_date')) {
          return Response.json({ error: 'Not authorized to change due date' }, { status: 403 });
        }

        const prevDueDate = task.due_date || '';
        const newDate = newDueDate || '';

        const history = parseJSON(task.status_history, []);
        history.push({
          status: task.status, changed_by: employeeName,
          timestamp: new Date().toISOString(),
          notes: 'Due date changed from ' + (prevDueDate || 'none') + ' to ' + (newDate || 'none') + (reason ? ': ' + reason : ''),
        });

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          due_date: newDate, status_history: JSON.stringify(history), updated_by: employeeName,
        });

        // ── Lifecycle sync: update active notification snapshot (no duplicate) ──
        await updateTaskNotificationSnapshot(base44, taskId, { due_date: newDate });

        await logTaskEvent(base44, taskId, 'due_date_changed', {
          from: prevDueDate, to: newDate, reason, changed_by: employeeName,
        }, user.email);

        return Response.json({ success: true, previous_due_date: prevDueDate, new_due_date: newDate });
      }

      // ── CHANGE PRIORITY ─────────────────────────────────────────────────────
      case 'change_priority': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'change_priority')) {
          return Response.json({ error: 'Not authorized to change priority' }, { status: 403 });
        }

        const prevPriority = task.priority || '';
        const newP = newPriority || '';

        const history = parseJSON(task.status_history, []);
        history.push({
          status: task.status, changed_by: employeeName,
          timestamp: new Date().toISOString(),
          notes: 'Priority changed from ' + prevPriority + ' to ' + newP + (reason ? ': ' + reason : ''),
        });

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          priority: newP, status_history: JSON.stringify(history), updated_by: employeeName,
        });

        // ── Lifecycle sync: update active notification priority (re-sorts queue) ──
        await updateTaskNotificationSnapshot(base44, taskId, { priority: newP });

        await logTaskEvent(base44, taskId, 'priority_changed', {
          from: prevPriority, to: newP, reason, changed_by: employeeName,
        }, user.email);

        return Response.json({ success: true, previous_priority: prevPriority, new_priority: newP });
      }

      // ── DUPLICATE ───────────────────────────────────────────────────────────
      case 'duplicate': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'duplicate')) {
          return Response.json({ error: 'Not authorized to duplicate tasks' }, { status: 403 });
        }

        const taskNumber = await generateTaskNumber(base44);
        // Security: creator identity resolved server-side
        const newTask = {
          title: (task.title || 'Untitled Task') + ' (Copy)',
          description: task.description || '',
          task_type: task.task_type || 'Operational',
          priority: task.priority || 'Medium',
          department: task.department || '',
          assigned_department: task.assigned_department || task.department || '',
          assigned_role: task.assigned_role || '',
          due_date: task.due_date || '',
          related_module: task.related_module || '',
          related_record_id: task.related_record_id || '',
          related_route: task.related_route || '',
          source_module: task.source_module || '',
          notes: task.notes || '',
          requires_approval: task.requires_approval || false,
          approval_role: task.approval_role || '',
          escalation_level: 0,
          recurrence_config: task.recurrence_config || '',
          task_number: taskNumber,
          task_id: taskNumber,
          status: 'New',
          created_by: employeeName,
          requested_by_employee_id: employeeId,
          created_date: new Date().toISOString(),
          data_classification: 'production',
        };

        const created = await base44.asServiceRole.entities.EnterpriseTask.create(newTask);

        await logTaskEvent(base44, created.id, 'task_duplicated', {
          source_task_id: taskId, source_task_number: task.task_number,
          new_task_number: taskNumber, duplicated_by: employeeName,
        }, user.email);

        return Response.json({ success: true, task: created });
      }

      // ── ARCHIVE ─────────────────────────────────────────────────────────────
      case 'archive': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'archive')) {
          return Response.json({ error: 'Not authorized to archive tasks' }, { status: 403 });
        }

        const archivableStatuses = ['Completed', 'Canceled', 'Cancelled', 'Draft', 'New'];
        if (!archivableStatuses.includes(task.status)) {
          return Response.json({
            error: 'Cannot archive task in status: ' + task.status + '. Only Completed, Cancelled, Draft, or New tasks can be archived.',
          }, { status: 400 });
        }

        const history = parseJSON(task.status_history, []);
        history.push({
          status: task.status, changed_by: employeeName,
          timestamp: new Date().toISOString(),
          notes: 'Archived' + (archiveReason ? ': ' + archiveReason : ''),
        });

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          data_classification: 'archived',
          archived_at: new Date().toISOString(),
          archived_by: employeeName,
          archive_reason: archiveReason || '',
          status_history: JSON.stringify(history),
          updated_by: employeeName,
        });

        // ── Lifecycle sync: resolve active task notifications on archive ──
        await resolveTaskNotifications(base44, taskId, 'no_longer_applicable', 'Task archived', employeeName, employeeId);

        await logTaskEvent(base44, taskId, 'task_archived', {
          archived_by: employeeName, reason: archiveReason,
        }, user.email);

        return Response.json({ success: true });
      }

      // ── MATCH TEMPLATE — link an existing task to a template (no side effects) ──
      case 'match_template': {
        const task = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

        if (!hasPermission(canonicalRoleKey, 'edit')) {
          return Response.json({ error: 'Not authorized to match tasks to templates' }, { status: 403 });
        }

        const template = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
        if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });

        if (template.status !== 'Published' && template.status !== 'Approved') {
          return Response.json({ error: 'Only Published or Approved templates can be matched to tasks' }, { status: 400 });
        }

        // Build template defaults snapshot
        const defaultsSnapshot = {
          title: template.template_name,
          description: template.description || '',
          department: template.department_name_snapshot || '',
          priority: template.default_priority || 'Medium',
          work_category: template.work_category || 'routine',
          business_impact: template.business_impact || 'none',
          urgency: template.urgency || 'none',
          interruptibility: template.interruptibility || 'freely_interruptible',
          execution_mode: template.execution_mode || 'simple_action',
          related_route: template.execution_route || '',
        };

        // Record template metadata — PRESERVE existing status, assignment, priority, due date, and history
        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          task_template_id: templateId,
          task_template_number: template.template_number,
          task_template_version: template.version || 1,
          template_defaults_snapshot: JSON.stringify(defaultsSnapshot),
          updated_by: employeeName,
        });

        // Audit log only — NO WorkSession, NO notifications, NO status change
        await logTaskEvent(base44, taskId, 'task_matched_to_template', {
          template_id: templateId,
          template_number: template.template_number,
          template_version: template.version || 1,
          matched_by: employeeName,
        }, user.email);

        return Response.json({ success: true, task: await base44.asServiceRole.entities.EnterpriseTask.get(taskId) });
      }

      // ── START ASSIGNED TASK (canonical Start action) ──────────────────────
      // Every frontend Start entry point (TaskAlertBanner, TaskDetail, TaskBoard)
      // must call this action. Reuses taskResponseHelpers.startWorkSession for
      // interruptibility, checkpoint, OrchestrationDecision, and WorkSession.
      //
      // Does NOT require general Edit Task permission — authorized via assignee
      // ownership. Owner/Admin cannot start on behalf of an employee.
      case 'start_assigned_task': {
        const startTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);
        if (!startTask) return Response.json({ error: 'Task not found' }, { status: 404 });

        // ── Verify the employee is the current direct assignee ──
        const isStartAssignee = (startTask.assigned_to_email && startTask.assigned_to_email === effectiveEmail)
          || (employee && startTask.assigned_employee_registry_id === employee.id)
          || (employeeId && startTask.assigned_employee_registry_id === employeeId);

        if (!isStartAssignee) {
          if (privileged) {
            return Response.json({
              error: 'Owner/Admin cannot start a task on behalf of an employee. Use reassign or transition instead.',
              reason: 'owner_cannot_start_for_employee',
            }, { status: 403 });
          }
          await logTaskEvent(base44, taskId, 'start_denied_not_assignee', {
            attempted_by: employeeName, attempted_by_email: effectiveEmail,
            assigned_to_email: startTask.assigned_to_email,
            assigned_employee_registry_id: startTask.assigned_employee_registry_id,
          }, user.email);
          return Response.json({
            error: 'Only the assigned employee can start this task',
            reason: 'not_direct_assignee',
          }, { status: 403 });
        }

        // ── Verify assignment version (409 if stale) ──
        const startCurrentVersion = startTask.assignment_version || 0;
        const startExpectedVersion = (expectedAssignmentVersion !== undefined && expectedAssignmentVersion !== null) ? expectedAssignmentVersion : startCurrentVersion;
        if (startCurrentVersion > startExpectedVersion) {
          return Response.json({
            error: 'This task has been reassigned. Please refresh and try again.',
            reason: 'stale_assignment',
            current_assignment_version: startCurrentVersion,
            expected_assignment_version: startExpectedVersion,
          }, { status: 409 });
        }

        // ── Verify task status is startable ──
        const startableStatuses = ['New', 'Assigned', 'Draft', 'In Progress', 'Waiting', 'Overdue', 'Blocked', 'On Hold', 'Changes Requested'];
        if (!startableStatuses.includes(startTask.status)) {
          return Response.json({
            error: 'Task cannot be started in its current status: ' + startTask.status,
            reason: 'not_startable',
          }, { status: 400 });
        }

        // ── Create or find TaskAcknowledgment with response=start_now ──
        // Separate from any prior 'acknowledged' response — both preserved.
        const startAckKey = startTask.id + ':' + startCurrentVersion + ':' + employee.id + ':start_now';
        const existingStartAck = await base44.asServiceRole.entities.TaskAcknowledgment.filter(
          { idempotency_key: startAckKey }, null, 1
        );

        let startAck = null;
        const startNowIso = new Date().toISOString();
        if (existingStartAck.length > 0) {
          startAck = existingStartAck[0];
        } else {
          const startAckNumber = await generateAcknowledgmentNumber(base44);
          startAck = await base44.asServiceRole.entities.TaskAcknowledgment.create({
            acknowledgment_number: startAckNumber,
            task_id: startTask.id,
            task_number: startTask.task_number || '',
            employee_id: employee.id,
            employee_email: employee.email || employee.login_email || user.email,
            employee_name: employeeName,
            notification_id: notificationId || '',
            assignment_version: startCurrentVersion,
            idempotency_key: startAckKey,
            delivered_at: startTask.created_date || startNowIso,
            displayed_at: startNowIso,
            acknowledged_at: startNowIso,
            response: 'start_now',
            response_reason: '',
            device_id: deviceId || '',
            created_by: user.email,
          });
        }

        // ── Call canonical startWorkSession ──
        const startResult = await startWorkSession(base44, {
          task: startTask,
          employee,
          user,
          roleKey: canonicalRoleKey,
          currentRoute: currentRoute || '',
          currentStep: currentStep || 0,
          deviceId: deviceId || '',
        });

        if (startResult.conflict) {
          await logTaskEvent(base44, taskId, 'start_blocked_non_interruptible', {
            task_number: startTask.task_number,
            conflict: startResult.conflict,
            employee_id: employee.id,
          }, user.email);
          return Response.json({
            success: false,
            start_conflict: startResult.conflict,
            acknowledgment: startAck,
          }, { status: 200 });
        }

        // Set started_at on the acknowledgment
        if (existingStartAck.length === 0) {
          await base44.asServiceRole.entities.TaskAcknowledgment.update(startAck.id, {
            started_at: startNowIso,
          });
        }

        // ── Set start_date if not already set ──
        if (!startTask.start_date) {
          await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
            start_date: new Date().toISOString().split('T')[0],
          });
        }

        // ── Update task acknowledgment_status ──
        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, {
          acknowledgment_status: 'start_now',
          updated_by: employeeName,
        });

        // ── Update related notification ──
        const notifResolveDecision = 'Task started via ' + (sourceContext || 'task_detail');
        if (notificationId) {
          try {
            const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
            if (n) {
              await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
                status: 'Acknowledged',
                acknowledged_date: startNowIso,
                acknowledged_by: employeeName,
                resolved_at: startNowIso,
                resolved_by_user_id: user.id || '',
                resolved_by_employee_id: employee.id,
                resolved_by_name: employeeName,
                resolution_type: 'completed',
                resolution_decision: notifResolveDecision,
              });
            }
          } catch { /* best-effort */ }
        } else {
          // Look for active assignment notifications and resolve them
          try {
            const activeNotifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
              related_task: taskId,
              recipient_employee_registry_id: employee.id,
              notification_purpose: { $in: ['task_assignment', 'task_reassigned'] },
              status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
              is_archived: false,
            }, null, 5);
            for (const n of activeNotifs) {
              await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, {
                status: 'Acknowledged',
                acknowledged_date: startNowIso,
                acknowledged_by: employeeName,
                resolved_at: startNowIso,
                resolved_by_user_id: user.id || '',
                resolved_by_employee_id: employee.id,
                resolved_by_name: employeeName,
                resolution_type: 'completed',
                resolution_decision: notifResolveDecision,
              });
            }
          } catch { /* best-effort */ }
        }

        // ── Audit log ──
        await logTaskEvent(base44, taskId, 'task_started_canonical', {
          task_number: startTask.task_number,
          work_session_id: startResult.workSession?.id || null,
          work_session_number: startResult.workSession?.work_session_number || null,
          acknowledgment_number: startAck?.acknowledgment_number || null,
          interrupted_session_id: startResult.interruptedSession?.id || null,
          checkpoint_id: startResult.checkpoint?.id || null,
          interrupt_decision_id: startResult.interruptDecision?.id || null,
          source_context: sourceContext || 'task_detail',
          started_by: employeeName,
          idempotent: existingStartAck.length > 0,
        }, user.email);

        const startedTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);

        return Response.json({
          success: true,
          task: startedTask,
          work_session: startResult.workSession,
          interrupted_session: startResult.interruptedSession,
          checkpoint: startResult.checkpoint,
          acknowledgment: startAck,
          interrupt_decision: startResult.interruptDecision || null,
          idempotent: existingStartAck.length > 0,
          navigation: {
            execution_route: startTask.execution_route || startTask.related_route || null,
            task_id: startTask.id,
            task_number: startTask.task_number,
          },
        });
      }

      // ── SCHEDULE TASK ──────────────────────────────────────────────────────
      // Schedules or reschedules an EnterpriseTask on the calendar.
      // Does NOT create a WorkSession or change task status.
      case 'schedule_task': {
        if (!hasPermission(canonicalRoleKey, 'change_due_date') && !privileged) {
          return Response.json({ error: "You don't have permission to schedule tasks" }, { status: 403 });
        }

        let schedTask = null;
        try { schedTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId); } catch { /* not found */ }
        if (!schedTask) return Response.json({ error: 'Task not found' }, { status: 404 });

        // Validate starts_at
        if (!startsAt) {
          return Response.json({ error: 'starts_at is required for scheduling' }, { status: 400 });
        }
        const schedStartDate = new Date(startsAt);
        if (isNaN(schedStartDate.getTime())) {
          return Response.json({ error: 'Invalid starts_at value' }, { status: 400 });
        }

        // Validate ends_at for timed tasks
        let schedEndDate = null;
        if (!isAllDay && endsAt) {
          schedEndDate = new Date(endsAt);
          if (isNaN(schedEndDate.getTime())) {
            return Response.json({ error: 'Invalid ends_at value' }, { status: 400 });
          }
          if (schedEndDate <= schedStartDate) {
            return Response.json({ error: 'ends_at must be after starts_at for timed tasks' }, { status: 400 });
          }
        }

        // Determine if this is a reschedule (task already had a schedule)
        const previousStart = schedTask.starts_at || schedTask.due_at || null;
        const isReschedule = !!(schedTask.starts_at || schedTask.schedule_status === 'scheduled' || schedTask.schedule_status === 'rescheduled');

        const movedToDifferentDay = previousStart
          ? new Date(previousStart).toDateString() !== schedStartDate.toDateString()
          : false;
        const movedEarlier = previousStart
          ? schedStartDate < new Date(previousStart)
          : false;

        // Require reschedule reason for critical cases
        const isOverdue = schedTask.due_date && new Date(schedTask.due_date) < new Date(new Date().toDateString());
        const requiresReason = schedTask.priority === 'Critical'
          || isOverdue
          || schedTask.acknowledgment_status === 'acknowledged'
          || schedTask.status === 'In Progress'
          || movedToDifferentDay;

        if (requiresReason && !rescheduleReason) {
          return Response.json({
            error: 'Reschedule reason is required for critical, overdue, acknowledged, in-progress, or cross-day reschedules',
            requires_reason: true,
          }, { status: 400 });
        }

        // Check for active WorkSession — warn but don't block
        let activeWorkSession = null;
        try {
          const sessions = await base44.asServiceRole.entities.WorkSession.filter({
            task_id: taskId,
            status: { $in: ['active', 'interrupted', 'waiting'] },
          }, '-started_at', 1);
          activeWorkSession = sessions[0] || null;
        } catch { /* best-effort */ }

        // Build scheduling update — preserve status and assignment_version
        const tz = scheduleTimezone || 'America/New_York';
        const schedNow = new Date().toISOString();
        const schedUpdates = {
          starts_at: startsAt,
          ends_at: isAllDay ? null : (endsAt || null),
          is_all_day: !!isAllDay,
          schedule_timezone: tz,
          schedule_status: isReschedule ? 'rescheduled' : 'scheduled',
          scheduled_by_employee_id: employee.id || '',
          scheduled_by_name: employeeName,
          scheduled_at: schedNow,
        };

        if (isReschedule) {
          schedUpdates.last_rescheduled_at = schedNow;
          schedUpdates.last_rescheduled_by = employeeName;
          if (rescheduleReason) schedUpdates.reschedule_reason = rescheduleReason;
        }

        // Only update due_at if explicitly requested
        if (updateDueAt && newDueAt) {
          schedUpdates.due_at = newDueAt;
          schedUpdates.due_date = newDueAt.split('T')[0];
        }

        // Append audit history
        const schedHistoryEntry = {
          action: isReschedule ? 'rescheduled' : 'scheduled',
          by: employeeName,
          by_email: user.email,
          timestamp: schedNow,
          starts_at: startsAt,
          ends_at: isAllDay ? null : (endsAt || null),
          is_all_day: !!isAllDay,
          previous_starts_at: previousStart,
          reschedule_reason: rescheduleReason || null,
          source_context: sourceContext || 'calendar',
        };

        let existingSchedHistory = [];
        try { existingSchedHistory = schedTask.status_history ? JSON.parse(schedTask.status_history) : []; } catch { /* noop */ }
        existingSchedHistory.push(schedHistoryEntry);
        schedUpdates.status_history = JSON.stringify(existingSchedHistory);

        await base44.asServiceRole.entities.EnterpriseTask.update(taskId, schedUpdates);

        // Audit log
        await logTaskEvent(base44, taskId, isReschedule ? 'task_rescheduled' : 'task_scheduled', {
          task_number: schedTask.task_number,
          starts_at: startsAt,
          ends_at: isAllDay ? null : (endsAt || null),
          is_all_day: !!isAllDay,
          timezone: tz,
          previous_starts_at: previousStart,
          reschedule_reason: rescheduleReason || null,
          scheduled_by: employeeName,
          source_context: sourceContext || 'calendar',
          active_work_session: activeWorkSession ? activeWorkSession.work_session_number : null,
        }, user.email);

        // Notify assignee when another user materially reschedules their task
        const isAssigneeSelf = schedTask.assigned_to_email === user.email
          || schedTask.assigned_employee_registry_id === employee.id;

        if (isReschedule && !isAssigneeSelf && schedTask.assigned_employee_registry_id) {
          const notifPurpose = movedToDifferentDay ? 'task_rescheduled' : 'task_schedule_changed';
          await createNotification(base44, {
            taskId: schedTask.id,
            taskNumber: schedTask.task_number,
            taskTitle: schedTask.title,
            taskPriority: schedTask.priority,
            taskDueDate: schedTask.due_date,
            assignmentVersion: schedTask.assignment_version || 0,
            recipientEmployeeId: schedTask.assigned_employee_registry_id,
            recipientEmail: schedTask.assigned_to_email,
            recipientName: schedTask.assigned_to,
            notificationPurpose: notifPurpose,
            title: movedToDifferentDay
              ? 'Task Rescheduled to Different Day'
              : movedEarlier
                ? 'Task Start Time Moved Earlier'
                : 'Task Schedule Updated',
            message: employeeName + ' ' + (movedToDifferentDay ? 'moved' : 'updated') + ' "' + schedTask.title + '" (' + schedTask.task_number + ').\nNew start: ' + new Date(startsAt).toLocaleString('en-US', { timeZone: tz }) + (rescheduleReason ? '\nReason: ' + rescheduleReason : ''),
            priority: schedTask.priority || 'Medium',
            requiresAcknowledgment: false,
          });
        }

        const updatedSchedTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId);

        return Response.json({
          success: true,
          task: updatedSchedTask,
          schedule_status: schedUpdates.schedule_status,
          active_work_session: activeWorkSession ? {
            id: activeWorkSession.id,
            number: activeWorkSession.work_session_number,
            status: activeWorkSession.status,
          } : null,
        });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}`, receivedAction: action }, { status: 400 });
    }
  } catch (error) {
    const errMsg = String(error.message || error);
    if (errMsg.includes('not found')) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    return Response.json({ error: errMsg }, { status: 500 });
  }
});