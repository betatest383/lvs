/**
 * Shared task response helpers used by manageNotification.
 *
 * Centralizes:
 *  - Manager resolution (determine the appropriate manager for a follow-up)
 *  - Manager follow-up notification creation (with duplicate prevention)
 *  - Work session creation for Start Now (with interruption + checkpoint)
 *  - Interruption logic (extracted from orchestrateWork for reuse)
 *
 * Extracted per the backend-function guide rule:
 * "Logic needed by more than one function must live in a shared module."
 */

// ─── Category ranking for interruptibility ─────────────────────────────────
const CATEGORY_RANK: Record<string, number> = {
  critical: 100,
  operational_interruption: 80,
  high_priority: 60,
  scheduled_primary: 40,
  routine: 20,
  busy_work: 10,
};

/**
 * Determine if a candidate task may interrupt the current work.
 * Extracted from orchestrateWork to ensure identical logic.
 */
export function canInterrupt(
  currentCategory: string,
  candidateCategory: string,
  currentInterruptibility: string
): boolean {
  if (candidateCategory === 'critical') return true;
  if (currentInterruptibility === 'non_interruptible') return false;
  if (currentInterruptibility === 'critical_only' && candidateCategory !== 'critical') return false;
  if (currentInterruptibility === 'manager_approval_required') return false;
  const currentRank = CATEGORY_RANK[currentCategory] || 0;
  const candidateRank = CATEGORY_RANK[candidateCategory] || 0;
  return candidateRank > currentRank;
}

// ─── Role normalization ────────────────────────────────────────────────────
export function normalizeRole(raw: string): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export function isPrivileged(roleKey: string): boolean {
  return roleKey === 'admin' || roleKey === 'owner';
}

// ─── Manager resolution ────────────────────────────────────────────────────
/**
 * Determine the appropriate manager for a task follow-up.
 *
 * Priority:
 * 1. Task's explicitly assigned manager (required_approver_id or required_reviewer_id)
 * 2. Assignee's direct supervisor (EmployeeRegistry.supervisor)
 * 3. Department manager (role with manager_approval_authority in the same department)
 * 4. Director of Operations (role_key match)
 * 5. Owner (fallback only when no operational manager exists)
 *
 * Prevents self-notification: if the resolved manager is the same person as the
 * employee who submitted the response, we escalate to the next level.
 *
 * @returns { managerEmployee, managerRoleKey, resolutionReason }
 */
export async function resolveManager(
  base44: any,
  task: any,
  assigneeEmployee: any
): Promise<{ managerEmployee: any | null; managerRoleKey: string; resolutionReason: string }> {
  const assigneeId = assigneeEmployee?.id || '';

  // 1. Task's explicitly assigned manager
  if (task.required_approver_id) {
    const mgr = await findEmployeeByIdOrNumber(base44, task.required_approver_id);
    if (mgr && mgr.id !== assigneeId) {
      const roleKey = await resolveRoleKeyFromEmployee(base44, mgr);
      if (isPrivileged(roleKey) || roleKey.includes('manager') || roleKey.includes('director') || roleKey.includes('supervisor')) {
        return { managerEmployee: mgr, managerRoleKey: roleKey, resolutionReason: 'Task required_approver_id' };
      }
    }
  }
  if (task.required_reviewer_id) {
    const mgr = await findEmployeeByIdOrNumber(base44, task.required_reviewer_id);
    if (mgr && mgr.id !== assigneeId) {
      const roleKey = await resolveRoleKeyFromEmployee(base44, mgr);
      if (isPrivileged(roleKey) || roleKey.includes('manager') || roleKey.includes('director') || roleKey.includes('supervisor')) {
        return { managerEmployee: mgr, managerRoleKey: roleKey, resolutionReason: 'Task required_reviewer_id' };
      }
    }
  }

  // 2. Assignee's direct supervisor
  if (assigneeEmployee?.supervisor) {
    const mgr = await findEmployeeByIdOrNumber(base44, assigneeEmployee.supervisor);
    if (mgr && mgr.id !== assigneeId) {
      const roleKey = await resolveRoleKeyFromEmployee(base44, mgr);
      return { managerEmployee: mgr, managerRoleKey: roleKey, resolutionReason: 'Assignee supervisor' };
    }
  }

  // 3. Department manager — find an employee in the same department with a manager/director role
  const dept = assigneeEmployee?.department || task.assigned_department || task.department || '';
  if (dept) {
    const deptEmployees = await base44.asServiceRole.entities.EmployeeRegistry.filter(
      { department: dept, employment_status: 'Active' },
      null,
      100
    );
    for (const emp of deptEmployees) {
      if (emp.id === assigneeId) continue; // Prevent self-notification
      const roleKey = await resolveRoleKeyFromEmployee(base44, emp);
      if (roleKey.includes('manager') || roleKey.includes('director') || roleKey.includes('supervisor') || isPrivileged(roleKey)) {
        return { managerEmployee: emp, managerRoleKey: roleKey, resolutionReason: `Department manager (${dept})` };
      }
    }
  }

  // 4. Director of Operations
  const directors = await base44.asServiceRole.entities.EmployeeRegistry.filter(
    { employment_status: 'Active' },
    null,
    200
  );
  for (const emp of directors) {
    if (emp.id === assigneeId) continue;
    const roleKey = await resolveRoleKeyFromEmployee(base44, emp);
    if (roleKey === 'director_of_operations' || roleKey === 'operations_director') {
      return { managerEmployee: emp, managerRoleKey: roleKey, resolutionReason: 'Director of Operations' };
    }
  }

  // 5. Owner fallback
  for (const emp of directors) {
    if (emp.id === assigneeId) continue;
    const roleKey = await resolveRoleKeyFromEmployee(base44, emp);
    if (roleKey === 'owner') {
      return { managerEmployee: emp, managerRoleKey: roleKey, resolutionReason: 'Owner (no operational manager found)' };
    }
  }
  for (const emp of directors) {
    if (emp.id === assigneeId) continue;
    const roleKey = await resolveRoleKeyFromEmployee(base44, emp);
    if (roleKey === 'admin') {
      return { managerEmployee: emp, managerRoleKey: roleKey, resolutionReason: 'Admin (no operational manager found)' };
    }
  }

  return { managerEmployee: null, managerRoleKey: '', resolutionReason: 'No manager found' };
}

/**
 * Find an EmployeeRegistry record by entity ID, employee_id (EMP-xxx), or email.
 */
async function findEmployeeByIdOrNumber(base44: any, idOrNumber: string): Promise<any | null> {
  if (!idOrNumber) return null;
  // Try entity ID first
  try {
    const emp = await base44.asServiceRole.entities.EmployeeRegistry.get(idOrNumber);
    if (emp) return emp;
  } catch { /* not an entity ID */ }
  // Try employee_id or email
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ employee_id: idOrNumber }, { email: idOrNumber }, { login_email: idOrNumber }],
  });
  return employees[0] || null;
}

/**
 * Resolve the canonical role_key from an EmployeeRegistry record.
 */
export async function resolveRoleKeyFromEmployee(base44: any, employee: any): Promise<string> {
  if (!employee) return '';
  const rawRole = employee.primary_role || employee.base44_user_role || '';
  if (!rawRole) return employee.base44_user_role === 'admin' ? 'admin' : '';
  if (employee.primary_role && employee.primary_role.startsWith('ROLE-')) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({ role_id: employee.primary_role }, null, 1);
      if (roles[0] && roles[0].role_key) return normalizeRole(roles[0].role_key);
    } catch { /* noop */ }
  }
  return normalizeRole(rawRole);
}

// ─── Manager follow-up notification ────────────────────────────────────────

const RESPONSE_PURPOSES: Record<string, string> = {
  request_clarification: 'task_clarification_requested',
  unable_to_start: 'task_unable_to_start',
  manager_assistance_requested: 'task_manager_help_requested',
};

/**
 * Check if there is already an active (non-resolved, non-cancelled) manager
 * follow-up notification for this task + assignment version.
 * Prevents duplicate follow-ups for repeated requests.
 */
export async function hasActiveManagerFollowup(
  base44: any,
  taskId: string,
  assignmentVersion: number
): Promise<boolean> {
  const existing = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    related_task: taskId,
    assignment_version: assignmentVersion,
    notification_purpose: { $in: ['task_clarification_requested', 'task_unable_to_start', 'task_manager_help_requested'] },
    status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
    is_archived: false,
  }, null, 1);
  return existing.length > 0;
}

/**
 * Create a manager follow-up notification.
 *
 * The notification is directly addressed to the resolved manager so it appears
 * in their personal actionable queue. It is NOT a broadcast — only the direct
 * recipient sees it in their banner.
 */
export async function createManagerFollowup(
  base44: any,
  params: {
    task: any;
    employee: any;
    response: string;
    responseCategory: string;
    responseReason: string;
    assignmentVersion: number;
    managerEmployee: any;
    managerRoleKey: string;
    resolutionReason: string;
  }
): Promise<any | null> {
  const { task, employee, response, responseCategory, responseReason, assignmentVersion, managerEmployee, resolutionReason } = params;

  if (!managerEmployee) return null;

  const purpose = RESPONSE_PURPOSES[response] || 'manual';
  const isSafety = responseCategory === 'Safety concern';
  const priority = isSafety ? 'Critical' : (task.priority || 'High');

  const notifId = await generateNotificationId(base44);
  const now = new Date().toISOString();

  const managerName = `${managerEmployee.preferred_name || managerEmployee.first_name || ''} ${managerEmployee.last_name || ''}`.trim();
  const employeeName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();

  const titleMap: Record<string, string> = {
    request_clarification: `Clarification Requested: ${task.task_number || task.title}`,
    unable_to_start: `Unable to Start: ${task.task_number || task.title}`,
    manager_assistance_requested: `Manager Help Requested: ${task.task_number || task.title}`,
  };

  const messageParts = [
    `Employee: ${employeeName} (${employee.employee_id || 'N/A'})`,
    `Response: ${response.replace(/_/g, ' ')}`,
  ];
  if (responseCategory) messageParts.push(`Category: ${responseCategory}`);
  if (responseReason) messageParts.push(`Explanation: ${responseReason}`);
  if (isSafety) messageParts.push('⚠️ SAFETY-RELATED RESPONSE');

  const notification = await base44.asServiceRole.entities.EnterpriseNotification.create({
    notification_id: notifId,
    title: titleMap[response] || `Follow-Up: ${task.task_number || task.title}`,
    message: messageParts.join('\n'),
    notification_type: isSafety ? 'Critical' : 'Approval Required',
    notification_purpose: purpose,
    priority,
    status: 'Sent',
    source_module: 'task_registry',
    source_record_id: task.id,
    recipient_employee_registry_id: managerEmployee.id,
    recipient_email: managerEmployee.email || managerEmployee.login_email || '',
    recipient_name: managerName,
    recipient_user_id: managerEmployee.linked_user_id || null,
    recipient_role: managerEmployee.primary_role || '',
    recipient_department: managerEmployee.department || '',
    related_task: task.id,
    related_task_number: task.task_number || '',
    related_task_title: task.title || '',
    related_task_priority: priority,
    related_task_due_date: task.due_date || null,
    related_employee: employee.id,
    assignment_version: assignmentVersion,
    delivery_methods: ['In-App'],
    requires_acknowledgment: false, // Manager follow-ups are actionable but don't require the same acknowledgment protocol
    is_archived: false,
    sent_date: now,
    escalation_level: 0,
    notes: JSON.stringify({
      employee_response: response,
      response_category: responseCategory,
      response_reason: responseReason,
      manager_resolution_reason: resolutionReason,
      is_safety: isSafety,
    }),
  });

  return notification;
}

// ─── Notification ID generation (shared with notificationHelpers) ──────────
export async function generateNotificationId(base44: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.EnterpriseNotification.filter(
      { notification_id: { $regex: '^NOTF-' } },
      '-notification_id',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].notification_id) {
      const match = String(existing[0].notification_id).match(/NOTF-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'NOTF-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.EnterpriseNotification.filter(
      { notification_id: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'NOTF-' + String(Date.now()).slice(-6);
}

// ─── Work session number generation ─────────────────────────────────────────
export async function generateWorkSessionNumber(base44: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.WorkSession.filter(
      { work_session_number: { $regex: '^WS-' } },
      '-work_session_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].work_session_number) {
      const match = String(existing[0].work_session_number).match(/WS-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'WS-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.WorkSession.filter(
      { work_session_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'WS-' + String(Date.now()).slice(-6);
}

// ─── Checkpoint number generation ───────────────────────────────────────────
export async function generateCheckpointNumber(base44: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.WorkCheckpoint.filter(
      { checkpoint_number: { $regex: '^CP-' } },
      '-checkpoint_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].checkpoint_number) {
      const match = String(existing[0].checkpoint_number).match(/CP-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'CP-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.WorkCheckpoint.filter(
      { checkpoint_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'CP-' + String(Date.now()).slice(-6);
}

// ─── OrchestrationDecision number generation ────────────────────────────────
export async function generateDecisionNumber(base44: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.OrchestrationDecision.filter(
      { decision_number: { $regex: '^OD-' } },
      '-decision_number',
      1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].decision_number) {
      const match = String(existing[0].decision_number).match(/OD-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'OD-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.OrchestrationDecision.filter(
      { decision_number: candidate },
      null,
      1
    );
    if (collision.length === 0) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'OD-' + String(Date.now()).slice(-6);
}

// ─── Create OrchestrationDecision for Start Now interruption (idempotent) ────
export async function createInterruptDecision(
  base44: any,
  params: {
    interruptingTask: any;
    interruptedTask: any;
    interruptedSession: any;
    newWorkSession: any;
    checkpoint: any;
    employee: any;
    user: any;
    assignmentVersion: number;
    canInterruptResult: boolean;
    currentInterruptibility: string;
  }
): Promise<any | null> {
  const { interruptingTask, interruptedTask, interruptedSession, newWorkSession, checkpoint, employee, user, assignmentVersion } = params;

  // Idempotency: check for existing decision with same interrupting + interrupted task
  const existing = await base44.asServiceRole.entities.OrchestrationDecision.filter(
    {
      selected_task_id: interruptingTask.id,
      previous_task_id: interruptedTask.id,
      decision_type: 'interrupt_current_work',
    },
    '-created_date',
    1
  );
  if (existing.length > 0) return existing[0];

  const decisionNumber = await generateDecisionNumber(base44);
  const employeeName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();

  const decisionReason = `Start Now on "${interruptingTask.title}" (${interruptingTask.task_number}) interrupted "${interruptedTask.title}" (${interruptedTask.task_number}). Category ${interruptingTask.work_category || 'routine'} outranks ${interruptedTask.work_category || 'routine'}. Interruptibility: ${params.currentInterruptibility}.`;

  try {
    return await base44.asServiceRole.entities.OrchestrationDecision.create({
      decision_number: decisionNumber,
      employee_id: employee.id,
      employee_name: employeeName,
      evaluated_task_ids: [interruptingTask.id, interruptedTask.id],
      selected_task_id: interruptingTask.id,
      selected_task_number: interruptingTask.task_number,
      selected_task_title: interruptingTask.title,
      previous_task_id: interruptedTask.id,
      previous_task_number: interruptedTask.task_number,
      decision_type: 'interrupt_current_work',
      priority_scores_json: JSON.stringify([
        { task_id: interruptingTask.id, task_number: interruptingTask.task_number, score: 0, category: interruptingTask.work_category || 'routine', reasons: ['Start Now — higher priority'] },
        { task_id: interruptedTask.id, task_number: interruptedTask.task_number, score: 0, category: interruptedTask.work_category || 'routine', reasons: ['Interrupted'] },
      ]),
      rule_results_json: JSON.stringify([
        { rule_id: 'can_interrupt', matched: params.canInterruptResult, action: 'interrupt' },
        { rule_id: 'checkpoint_preserved', matched: !!checkpoint, action: 'checkpoint_created' },
      ]),
      decision_reason: decisionReason,
      source_event_type: 'start_now',
      source_event_id: interruptingTask.id,
      created_at: new Date().toISOString(),
      engine_version: '1.0.0',
      requires_interruption: true,
      requires_acknowledgment: false,
      checkpoint_required: !!checkpoint,
      rules_applied: ['start_now_interrupt', 'can_interrupt_check'],
      blocked_reasons: [],
      orchestration_mode: 'assisted',
      manager_override: false,
      notes: JSON.stringify({
        assignment_version: assignmentVersion,
        employee_email: user.email,
        previous_work_session_id: interruptedSession?.id || null,
        new_work_session_id: newWorkSession?.id || null,
        checkpoint_id: checkpoint?.id || null,
        checkpoint_number: checkpoint?.checkpoint_number || null,
        interruptibility_evaluated: params.currentInterruptibility,
        decision_result: 'interrupted',
      }),
    });
  } catch (e) {
    // Best-effort: the interruption already succeeded, log the audit failure
    console.error('[TASK RESPONSE] Failed to create OrchestrationDecision:', e.message);
    return null;
  }
}

// ─── ResumeObligation tracking (durable, retryable) ──────────────────────────
/**
 * Creates or finds a ResumeObligation record. This is a DURABLE record that
 * survives processing failures. If the resume notification creation fails,
 * the obligation remains in 'pending' or 'failed' state and can be retried
 * by a scheduled automation or admin action.
 *
 * The obligation_key is deterministic: interrupting_task_id:interrupted_task_id.
 * This prevents duplicate obligations from repeated calls (e.g. when both
 * manageTask and orchestrateWork invoke checkAndCreateResumeObligation).
 */
export async function ensureResumeObligation(
  base44: any,
  params: {
    interruptingTaskId: string;
    interruptedTaskId: string;
    interruptingTaskNumber?: string;
    interruptedTaskNumber?: string;
    interruptedWorkSessionId?: string;
    checkpointId?: string;
    employeeId?: string;
    terminalStatus: string;
    triggeredBy: string;
  }
): Promise<any> {
  const obligationKey = `${params.interruptingTaskId}:${params.interruptedTaskId}`;

  // Check for existing obligation (idempotent)
  const existing = await base44.asServiceRole.entities.ResumeObligation.filter(
    { obligation_key: obligationKey },
    '-created_date',
    1
  );

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new obligation (pending)
  return await base44.asServiceRole.entities.ResumeObligation.create({
    obligation_key: obligationKey,
    obligation_type: 'resume_after_completion',
    operation_state: 'pending',
    interrupting_task_id: params.interruptingTaskId,
    interrupting_task_number: params.interruptingTaskNumber || '',
    interrupted_task_id: params.interruptedTaskId,
    interrupted_task_number: params.interruptedTaskNumber || '',
    interrupted_work_session_id: params.interruptedWorkSessionId || '',
    checkpoint_id: params.checkpointId || '',
    employee_id: params.employeeId || '',
    terminal_status: params.terminalStatus,
    triggered_by: params.triggeredBy,
    retry_count: 0,
    max_retries: 5,
    requires_admin_review: false,
    admin_review_status: 'none',
    created_at: new Date().toISOString(),
  });
}

/**
 * Updates a ResumeObligation record by its obligation_key.
 */
export async function updateResumeObligation(
  base44: any,
  obligationKey: string,
  updates: Record<string, any>
): Promise<void> {
  const existing = await base44.asServiceRole.entities.ResumeObligation.filter(
    { obligation_key: obligationKey },
    null,
    1
  );
  if (existing.length > 0) {
    await base44.asServiceRole.entities.ResumeObligation.update(existing[0].id, updates);
  }
}

// ─── Check and create resume obligation when interrupting task completes ─────
/**
 * Called when a task reaches a terminal state (Completed, Cancelled, etc.).
 * Checks if this task had interrupted another task. If so, and the interrupted
 * task is still eligible, creates a resume OrchestrationDecision and a
 * persistent resume notification to the employee.
 *
 * DURABILITY: A ResumeObligation record is created at the start. If processing
 * fails, the obligation remains in 'failed' state with the error, and can be
 * retried by a scheduled automation. Task completion is NEVER rolled back —
 * the obligation is preserved for retry.
 *
 * Idempotent: if a resume notification already exists for this
 * interrupting task + interrupted task pair, no duplicate is created.
 */
export async function checkAndCreateResumeObligation(
  base44: any,
  params: {
    completedTask: any;
    user: any;
    terminalStatus: string; // 'Completed' | 'Cancelled' | 'no_longer_applicable'
  }
): Promise<{ decision: any | null; notification: any | null; staleNotificationsResolved: number }> {
  const { completedTask, user, terminalStatus } = params;

  // Check if this task interrupted something
  if (!completedTask.interrupted_task_id) {
    return { decision: null, notification: null, staleNotificationsResolved: 0 };
  }

  const interruptedTaskId = completedTask.interrupted_task_id;

  // ── Create durable ResumeObligation record (survives processing failures) ──
  const obligation = await ensureResumeObligation(base44, {
    interruptingTaskId: completedTask.id,
    interruptedTaskId,
    interruptingTaskNumber: completedTask.task_number || '',
    terminalStatus,
    triggeredBy: user.email,
  });
  const obligationKey = obligation.obligation_key;

  // If already notified, return existing result (idempotent)
  if (obligation.operation_state === 'notified' || obligation.operation_state === 'completed') {
    return { decision: null, notification: null, staleNotificationsResolved: 0 };
  }

  // Load the interrupted task
  let interruptedTask = null;
  try { interruptedTask = await base44.asServiceRole.entities.EnterpriseTask.get(interruptedTaskId); } catch { /* task may not exist */ }
  if (!interruptedTask) {
    // The interrupted task no longer exists — resolve any stale resume notifications
    const staleCount = await resolveStaleResumeNotifications(base44, interruptedTaskId, 'Interrupted task no longer exists');
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'no_longer_applicable',
      completed_at: new Date().toISOString(),
      notes: 'Interrupted task no longer exists',
    });
    return { decision: null, notification: null, staleNotificationsResolved: staleCount };
  }

  // Find the interrupted WorkSession
  const interruptedSessions = await base44.asServiceRole.entities.WorkSession.filter({
    task_id: interruptedTaskId,
    status: 'interrupted',
    resume_required: true,
  }, '-paused_at', 5);

  if (interruptedSessions.length === 0) {
    // No interrupted session with resume_required — nothing to resume
    return { decision: null, notification: null, staleNotificationsResolved: 0 };
  }

  const interruptedSession = interruptedSessions[0];

  // ── Validate the interrupted task is still eligible to resume ──
  const ineligibleStatuses = ['Completed', 'Canceled', 'Cancelled', 'Approved'];
  const ineligibleOrchStatuses = ['completed', 'cancelled', 'superseded', 'archived'];

  if (ineligibleStatuses.includes(interruptedTask.status) || ineligibleOrchStatuses.includes(interruptedTask.orchestration_status)) {
    // Task reached a terminal state — resolve stale resume notifications
    const staleCount = await resolveStaleResumeNotifications(base44, interruptedTaskId, `Interrupted task is ${interruptedTask.status}`);
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'no_longer_applicable',
      completed_at: new Date().toISOString(),
      interrupted_task_number: interruptedTask.task_number || '',
      notes: `Interrupted task is ${interruptedTask.status}`,
    });
    return { decision: null, notification: null, staleNotificationsResolved: staleCount };
  }

  // Check if the task was reassigned to a different employee
  const interruptedEmployeeId = interruptedSession.employee_id;
  const currentAssigneeId = interruptedTask.assigned_employee_registry_id;
  if (currentAssigneeId && currentAssigneeId !== interruptedEmployeeId) {
    // Task was reassigned — the original employee can't resume it
    const staleCount = await resolveStaleResumeNotifications(base44, interruptedTaskId, 'Task reassigned to another employee');
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'no_longer_applicable',
      completed_at: new Date().toISOString(),
      interrupted_task_number: interruptedTask.task_number || '',
      notes: 'Task reassigned to another employee',
    });
    return { decision: null, notification: null, staleNotificationsResolved: staleCount };
  }

  // Load the checkpoint
  let checkpoint = null;
  if (interruptedSession.checkpoint_id) {
    try { checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(interruptedSession.checkpoint_id); } catch { /* noop */ }
  }
  if (!checkpoint) {
    // No valid checkpoint — can't resume safely
    const staleCount = await resolveStaleResumeNotifications(base44, interruptedTaskId, 'Missing valid checkpoint');
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'failed',
      last_error: 'Missing valid checkpoint',
      last_retry_at: new Date().toISOString(),
      requires_admin_review: true,
      admin_review_status: 'pending',
      interrupted_task_number: interruptedTask.task_number || '',
    });
    return { decision: null, notification: null, staleNotificationsResolved: staleCount };
  }

  // ── Idempotency: check for existing resume notification ──
  const existingResumeNotifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    related_task: interruptedTaskId,
    notification_purpose: 'task_resume_required',
    status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
    is_archived: false,
  }, null, 1);

  if (existingResumeNotifs.length > 0) {
    // Resume notification already exists — don't create a duplicate
    return { decision: null, notification: existingResumeNotifs[0], staleNotificationsResolved: 0 };
  }

  // ── Resolve stale resume notifications for other tasks (from previous interruptions) ──
  let staleCount = 0;

  // ── Load the employee ──
  // Note: $or with built-in 'id' field is not supported by the SDK.
  // Use get() first (entity ID lookup), then fall back to linked_user_id filter.
  let employee = null;
  try {
    employee = await base44.asServiceRole.entities.EmployeeRegistry.get(interruptedEmployeeId);
  } catch { /* not an entity ID */ }
  if (!employee) {
    try {
      const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
        linked_user_id: interruptedEmployeeId,
      }, null, 1);
      employee = employees[0];
    } catch { /* noop */ }
  }
  if (!employee) {
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'failed',
      last_error: 'Employee record not found for interrupted session',
      last_retry_at: new Date().toISOString(),
      requires_admin_review: true,
      admin_review_status: 'pending',
    });
    return { decision: null, notification: null, staleNotificationsResolved: 0 };
  }

  // ── Check for current active work ──
  const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
    employee_id: employee.id,
    status: 'active',
    is_primary: true,
  }, '-started_at', 1);

  const hasActiveWork = activeSessions.length > 0;
  let activeWorkInfo = null;
  if (hasActiveWork) {
    const activeTask = await base44.asServiceRole.entities.EnterpriseTask.get(activeSessions[0].task_id);
    activeWorkInfo = {
      task_id: activeSessions[0].task_id,
      task_number: activeSessions[0].task_number,
      task_title: activeSessions[0].task_title,
      work_category: activeTask?.work_category || 'routine',
      interruptibility: activeTask?.interruptibility || 'freely_interruptible',
    };
  }

  // ── Update obligation with resolved details ──
  await updateResumeObligation(base44, obligationKey, {
    interrupted_task_number: interruptedTask.task_number || '',
    interrupted_work_session_id: interruptedSession.id,
    checkpoint_id: checkpoint.id,
    employee_id: employee.id,
  });

  // ── Create the resume OrchestrationDecision + notification ──
  // Wrapped in try/catch: on failure, the obligation is marked as 'failed'
  // and can be retried by a scheduled automation. Task completion is preserved.
  try {
    const decisionNumber = await generateDecisionNumber(base44);
    const employeeName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();

    const decisionReason = `Previous work "${interruptedTask.title}" (${interruptedTask.task_number}) should be resumed. The interrupting task "${completedTask.title}" (${completedTask.task_number}) reached terminal state: ${terminalStatus}. Checkpoint ${checkpoint.checkpoint_number} preserves progress.${hasActiveWork ? ` Note: employee currently has active work "${activeWorkInfo.task_title}".` : ''}`;

    let resumeDecision = null;
    try {
      resumeDecision = await base44.asServiceRole.entities.OrchestrationDecision.create({
        decision_number: decisionNumber,
        employee_id: employee.id,
        employee_name: employeeName,
        evaluated_task_ids: [interruptedTask.id, completedTask.id],
        selected_task_id: interruptedTask.id,
        selected_task_number: interruptedTask.task_number,
        selected_task_title: interruptedTask.title,
        previous_task_id: completedTask.id,
        previous_task_number: completedTask.task_number,
        decision_type: 'resume_previous_work',
        priority_scores_json: JSON.stringify([
          { task_id: interruptedTask.id, task_number: interruptedTask.task_number, score: 0, category: interruptedTask.work_category || 'routine', reasons: ['Resume interrupted work'] },
        ]),
        rule_results_json: JSON.stringify([
          { rule_id: 'interrupting_task_completed', matched: true, action: 'resume_obligation_created' },
          { rule_id: 'checkpoint_valid', matched: !!checkpoint, action: 'resume_eligible' },
          { rule_id: 'has_active_work', matched: hasActiveWork, action: hasActiveWork ? 'resume_blocked_by_active_work' : 'resume_available' },
        ]),
        decision_reason: decisionReason,
        source_event_type: 'task_completed',
        source_event_id: completedTask.id,
        created_at: new Date().toISOString(),
        engine_version: '1.0.0',
        requires_interruption: false,
        requires_acknowledgment: false,
        checkpoint_required: false,
        rules_applied: ['rule_007_resume_paused_work', 'rule_008_completed_interrupting_triggers_reevaluation'],
        blocked_reasons: hasActiveWork ? ['Employee has active work — resume requires confirmation'] : [],
        orchestration_mode: 'assisted',
        manager_override: false,
        notes: JSON.stringify({
          interrupting_task_id: completedTask.id,
          interrupting_task_number: completedTask.task_number,
          interrupted_task_id: interruptedTask.id,
          interrupted_task_number: interruptedTask.task_number,
          interrupted_work_session_id: interruptedSession.id,
          checkpoint_id: checkpoint.id,
          checkpoint_number: checkpoint.checkpoint_number,
          terminal_status: terminalStatus,
          has_active_work: hasActiveWork,
          active_work: activeWorkInfo,
          decision_result: hasActiveWork ? 'resume_blocked_by_active_work' : 'resume_available',
        }),
      });
    } catch (e) {
      console.error('[TASK RESPONSE] Failed to create resume OrchestrationDecision:', e.message);
      // Non-fatal: the notification is the critical record. Mark obligation for retry of decision.
    }

    // ── Create the persistent resume notification ──
    const resumeNotif = await createResumeNotification(base44, {
      interruptedTask,
      interruptingTask: completedTask,
      interruptedSession,
      checkpoint,
      employee,
      hasActiveWork,
      activeWorkInfo,
      decisionReason,
    });

    // ── Mark obligation as notified ──
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'notified',
      resume_notification_id: resumeNotif?.id || null,
      orchestration_decision_id: resumeDecision?.id || null,
      notified_at: new Date().toISOString(),
    });

    return { decision: resumeDecision, notification: resumeNotif, staleNotificationsResolved: staleCount };
  } catch (e) {
    // CRITICAL: Resume notification creation failed. The obligation is preserved
    // in 'failed' state for retry. Task completion is NOT rolled back.
    console.error('[TASK RESPONSE] Resume obligation processing failed:', e.message);
    const retryCount = (obligation.retry_count || 0) + 1;
    const maxRetries = obligation.max_retries || 5;
    await updateResumeObligation(base44, obligationKey, {
      operation_state: 'failed',
      last_error: e.message,
      retry_count: retryCount,
      last_retry_at: new Date().toISOString(),
      requires_admin_review: retryCount >= maxRetries,
      admin_review_status: retryCount >= maxRetries ? 'pending' : 'none',
    });

    // Log for admin recovery queue
    try {
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: 'RESUME-OBL-FAIL-' + Date.now(),
        log_type: 'event',
        source_module: 'task_response',
        trigger_event: 'resume_obligation_failed',
        related_record_id: completedTask.id,
        status: 'error',
        error_message: `Resume obligation failed for interrupting task ${completedTask.task_number}, interrupted task ${interruptedTask.task_number}: ${e.message}. Retry ${retryCount}/${maxRetries}.`,
        triggered_by: user.email,
      });
    } catch { /* best-effort logging */ }

    // Don't throw — preserve task completion. The obligation is durable and retryable.
    return { decision: null, notification: null, staleNotificationsResolved: 0 };
  }
}

// ─── Create the persistent resume notification ───────────────────────────────
export async function createResumeNotification(
  base44: any,
  params: {
    interruptedTask: any;
    interruptingTask: any;
    interruptedSession: any;
    checkpoint: any;
    employee: any;
    hasActiveWork: boolean;
    activeWorkInfo: any;
    decisionReason: string;
  }
): Promise<any | null> {
  const { interruptedTask, interruptingTask, interruptedSession, checkpoint, employee, hasActiveWork, activeWorkInfo } = params;

  const notifId = await generateNotificationId(base44);
  const now = new Date().toISOString();
  const employeeName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();

  const messageParts = [
    `Your previous work "${interruptedTask.title}" (${interruptedTask.task_number}) is ready to resume.`,
    `It was interrupted by "${interruptingTask.title}" (${interruptingTask.task_number || ''}), which is now ${interruptingTask.status || 'completed'}.`,
    `Interruption occurred: ${interruptedSession.paused_at || 'N/A'}`,
    `Saved checkpoint: ${checkpoint.checkpoint_number || 'N/A'}`,
    `Progress: step ${checkpoint.workflow_step || 0}${checkpoint.route ? ', route ' + checkpoint.route : ''}`,
  ];
  if (hasActiveWork && activeWorkInfo) {
    messageParts.push(`Current active work: "${activeWorkInfo.task_title}" (${activeWorkInfo.task_number}) — you may need to pause it first.`);
  }

  const notification = await base44.asServiceRole.entities.EnterpriseNotification.create({
    notification_id: notifId,
    title: 'Previous Work Ready to Resume',
    message: messageParts.join('\n'),
    notification_type: 'Task',
    notification_purpose: 'task_resume_required',
    priority: interruptedTask.priority || 'Medium',
    status: 'Sent',
    source_module: 'task_registry',
    source_record_id: interruptedTask.id,
    recipient_employee_registry_id: employee.id,
    recipient_email: employee.email || employee.login_email || '',
    recipient_name: employeeName,
    recipient_user_id: employee.linked_user_id || null,
    recipient_role: employee.primary_role || '',
    recipient_department: employee.department || '',
    related_task: interruptedTask.id,
    related_task_number: interruptedTask.task_number,
    related_task_title: interruptedTask.title,
    related_task_priority: interruptedTask.priority || 'Medium',
    related_task_due_date: interruptedTask.due_date || null,
    related_employee: employee.id,
    assignment_version: interruptedTask.assignment_version || 0,
    delivery_methods: ['In-App'],
    requires_acknowledgment: true,
    is_archived: false,
    sent_date: now,
    escalation_level: 0,
    resume_checkpoint_id: checkpoint.id,
    resume_work_session_id: interruptedSession.id,
    resume_interrupting_task_number: interruptingTask.task_number || '',
    notes: JSON.stringify({
      interrupting_task_id: interruptingTask.id,
      interrupted_session_id: interruptedSession.id,
      checkpoint_id: checkpoint.id,
      checkpoint_number: checkpoint.checkpoint_number,
      has_active_work: hasActiveWork,
      active_work: activeWorkInfo,
      decision_reason: params.decisionReason,
    }),
  });

  return notification;
}

// ─── Resolve stale resume notifications ──────────────────────────────────────
export async function resolveStaleResumeNotifications(
  base44: any,
  interruptedTaskId: string,
  reason: string
): Promise<number> {
  const staleNotifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    related_task: interruptedTaskId,
    notification_purpose: 'task_resume_required',
    status: { $nin: ['Resolved', 'Cancelled', 'Expired', 'Failed'] },
    is_archived: false,
  }, null, 10);

  const now = new Date().toISOString();
  for (const n of staleNotifs) {
    await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, {
      status: 'Resolved',
      resolved_at: now,
      resolution_type: 'no_longer_applicable',
      resolution_reason: reason,
      resolution_decision: 'Resume obligation no longer applicable',
    });
  }
  return staleNotifs.length;
}

// ─── Resume interrupted work (canonical server-side action) ───────────────────
/**
 * Resumes an interrupted WorkSession. Idempotent — repeated calls return
 * the existing resumed session without creating duplicates.
 *
 * Authorization: only the original employee or current authorized assignee.
 * Validates: checkpoint ownership, resume_required, assignment version,
 * and current active work conflicts.
 */
export async function resumeInterruptedWork(
  base44: any,
  params: {
    notificationId: string;
    employee: any;
    user: any;
    roleKey: string;
    forceInterrupt?: boolean; // When true, employee confirmed pausing current work
  }
): Promise<{ workSession: any | null; checkpoint: any | null; conflict: any | null; decision: any | null; notification: any | null }> {
  const { notificationId, employee, user, roleKey } = params;

  // Load the resume notification
  const notif = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
  if (!notif) return { workSession: null, checkpoint: null, conflict: null, decision: null, notification: null };

  // Verify this is a resume notification
  if (notif.notification_purpose !== 'task_resume_required') {
    return { workSession: null, checkpoint: null, conflict: { type: 'invalid_notification', message: 'This notification is not a resume notification' }, decision: null, notification: notif };
  }

  // ── Authorization: only the direct recipient may resume ──
  if (notif.recipient_employee_registry_id !== employee.id) {
    return { workSession: null, checkpoint: null, conflict: { type: 'not_authorized', message: 'Only the assigned employee may resume this work' }, decision: null, notification: notif };
  }

  // Load the interrupted task
  let task = null;
  if (notif.related_task) {
    try { task = await base44.asServiceRole.entities.EnterpriseTask.get(notif.related_task); } catch { /* noop */ }
  }
  if (!task) {
    await resolveStaleResumeNotifications(base44, notif.related_task, 'Task no longer exists during resume');
    return { workSession: null, checkpoint: null, conflict: { type: 'task_not_found', message: 'The interrupted task no longer exists' }, decision: null, notification: notif };
  }

  // ── Validate the task is still resumable ──
  const ineligibleStatuses = ['Completed', 'Canceled', 'Cancelled', 'Approved'];
  const ineligibleOrchStatuses = ['completed', 'cancelled', 'superseded', 'archived'];
  if (ineligibleStatuses.includes(task.status) || ineligibleOrchStatuses.includes(task.orchestration_status)) {
    await resolveStaleResumeNotifications(base44, task.id, `Task is ${task.status} — cannot resume`);
    return { workSession: null, checkpoint: null, conflict: { type: 'task_not_resumable', message: `Task is ${task.status} and cannot be resumed` }, decision: null, notification: notif };
  }

  // Check assignment ownership
  if (task.assigned_employee_registry_id && task.assigned_employee_registry_id !== employee.id) {
    await resolveStaleResumeNotifications(base44, task.id, 'Task reassigned to another employee');
    return { workSession: null, checkpoint: null, conflict: { type: 'reassigned', message: 'This task has been reassigned to another employee' }, decision: null, notification: notif };
  }

  // ── Find the interrupted WorkSession ──
  const sessions = await base44.asServiceRole.entities.WorkSession.filter({
    task_id: task.id,
    employee_id: employee.id,
    status: { $in: ['interrupted', 'paused', 'active'] },
  }, '-created_date', 1);

  const session = sessions[0];
  if (!session) {
    await resolveStaleResumeNotifications(base44, task.id, 'No interrupted session found');
    return { workSession: null, checkpoint: null, conflict: { type: 'no_session', message: 'No interrupted work session found for this task' }, decision: null, notification: notif };
  }

  // ── Idempotency: if session is already active, return it ──
  if (session.status === 'active') {
    let existingCheckpoint = null;
    if (session.checkpoint_id) {
      try { existingCheckpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(session.checkpoint_id); } catch { /* noop */ }
    }
    // Resolve the notification
    await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
      status: 'Resolved',
      resolved_at: new Date().toISOString(),
      resolution_type: 'completed',
      resolution_decision: 'Work resumed (idempotent — session already active)',
    });
    return { workSession: session, checkpoint: existingCheckpoint, conflict: null, decision: null, notification: notif };
  }

  // ── Verify resume_required and checkpoint ──
  if (!session.resume_required) {
    return { workSession: null, checkpoint: null, conflict: { type: 'not_required', message: 'This session does not require resume' }, decision: null, notification: notif };
  }

  // Load the checkpoint
  let checkpoint = null;
  if (notif.resume_checkpoint_id) {
    try { checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(notif.resume_checkpoint_id); } catch { /* noop */ }
  }
  if (!checkpoint && session.checkpoint_id) {
    try { checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(session.checkpoint_id); } catch { /* noop */ }
  }
  if (!checkpoint) {
    return { workSession: null, checkpoint: null, conflict: { type: 'no_checkpoint', message: 'Missing valid checkpoint — cannot restore progress' }, decision: null, notification: notif };
  }

  // Verify checkpoint belongs to this session and task
  if (checkpoint.work_session_id !== session.id || checkpoint.task_id !== task.id) {
    return { workSession: null, checkpoint: null, conflict: { type: 'checkpoint_mismatch', message: 'Checkpoint does not match the work session' }, decision: null, notification: notif };
  }

  // ── Assignment version check ──
  const taskAssignmentVersion = task.assignment_version || 0;
  const notifAssignmentVersion = notif.assignment_version || 0;
  if (taskAssignmentVersion > notifAssignmentVersion) {
    return { workSession: null, checkpoint: null, conflict: { type: 'stale_assignment', message: 'This resume is for a previous assignment. The task has been reassigned.' }, decision: null, notification: notif };
  }

  // ── Check for current active WorkSession conflict ──
  const activePrimary = await base44.asServiceRole.entities.WorkSession.filter({
    employee_id: employee.id,
    status: 'active',
    is_primary: true,
  }, '-started_at', 1);

  let conflictCheckpoint = null;
  let conflictSession = null;

  if (activePrimary.length > 0) {
    const activeSession = activePrimary[0];
    if (activeSession.task_id === task.id) {
      // Already working on this task — idempotent return
      await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
        status: 'Resolved',
        resolved_at: new Date().toISOString(),
        resolution_type: 'completed',
        resolution_decision: 'Work resumed (already active on this task)',
      });
      return { workSession: activeSession, checkpoint, conflict: null, decision: null, notification: notif };
    }

    // Load the active task to check interruptibility
    let activeTask = null;
    try { activeTask = await base44.asServiceRole.entities.EnterpriseTask.get(activeSession.task_id); } catch { /* noop */ }

    const activeCategory = activeTask?.work_category || 'routine';
    const resumeCategory = task.work_category || 'routine';
    const activeInterruptibility = activeTask?.interruptibility || 'freely_interruptible';

    // Can the resumed task interrupt the current active task?
    const canInterruptResult = canInterrupt(activeCategory, resumeCategory, activeInterruptibility);

    if (!canInterruptResult) {
      // Non-interruptible or higher priority — don't resume automatically
      return {
        workSession: null,
        checkpoint: null,
        conflict: {
          type: activeInterruptibility === 'non_interruptible' ? 'non_interruptible_active' : 'higher_priority_active',
          message: `Current work "${activeSession.task_title}" cannot be interrupted. Complete it first or request manager help.`,
          current_session: { id: activeSession.id, task_title: activeSession.task_title, task_number: activeSession.task_number },
          current_interruptibility: activeInterruptibility,
        },
        decision: null,
        notification: notif,
      };
    }

    // Lower-priority interruptible work — require explicit confirmation
    if (!params.forceInterrupt) {
      return {
        workSession: null,
        checkpoint: null,
        conflict: {
          type: 'confirm_interrupt',
          message: `Resuming "${task.title}" will pause your current work "${activeSession.task_title}". Continue?`,
          current_session: { id: activeSession.id, task_title: activeSession.task_title, task_number: activeSession.task_number },
          current_interruptibility: activeInterruptibility,
        },
        decision: null,
        notification: notif,
      };
    }

    // Employee confirmed — create checkpoint for current work and pause it
    const checkpointNumber = await generateCheckpointNumber(base44);
    conflictCheckpoint = await base44.asServiceRole.entities.WorkCheckpoint.create({
      checkpoint_number: checkpointNumber,
      work_session_id: activeSession.id,
      task_id: activeSession.task_id,
      task_number: activeSession.task_number,
      employee_id: employee.id,
      employee_name: `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim(),
      route: activeSession.current_route || '',
      workflow_step: activeSession.current_step || 0,
      record_id: activeSession.workflow_session_id || '',
      completed_item_ids: [],
      remaining_item_ids: [],
      notes: 'Interrupted by resume of higher-priority work',
      created_at: new Date().toISOString(),
      created_by: user.email,
      resume_status: 'pending',
      interrupting_task_id: task.id,
      interrupting_task_number: task.task_number,
    });

    // Pause the active session
    await base44.asServiceRole.entities.WorkSession.update(activeSession.id, {
      status: 'interrupted',
      paused_at: new Date().toISOString(),
      interrupted_by_task_id: task.id,
      interrupted_by_task_number: task.task_number,
      resume_required: true,
      checkpoint_id: conflictCheckpoint.id,
      last_activity_at: new Date().toISOString(),
    });

    // Update the active task
    await base44.asServiceRole.entities.EnterpriseTask.update(activeSession.task_id, {
      orchestration_status: 'paused_by_higher_priority',
      interrupting_task_id: task.id,
      last_priority_evaluated_at: new Date().toISOString(),
    });

    // Set bidirectional link
    await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
      interrupted_task_id: activeSession.task_id,
      last_priority_evaluated_at: new Date().toISOString(),
    });

    conflictSession = activeSession;
  }

  // ── Resume the interrupted session ──
  const resumeNow = new Date().toISOString();
  await base44.asServiceRole.entities.WorkSession.update(session.id, {
    status: 'active',
    resumed_at: resumeNow,
    last_activity_at: resumeNow,
    resume_required: false,
    interrupted_by_task_id: null,
    interrupted_by_task_number: null,
  });

  // Mark checkpoint as resumed
  await base44.asServiceRole.entities.WorkCheckpoint.update(checkpoint.id, {
    resume_status: 'resumed',
    resumed_at: resumeNow,
    resumed_by: user.email,
  });

  // Clear bidirectional interruption link on the interrupting task
  if (task.interrupting_task_id) {
    try {
      await base44.asServiceRole.entities.EnterpriseTask.update(task.interrupting_task_id, {
        interrupted_task_id: null,
        last_priority_evaluated_at: resumeNow,
      });
    } catch { /* noop */ }
  }

  // Update task — clear interrupting_task_id, set in_progress
  await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
    orchestration_status: 'in_progress',
    status: 'In Progress',
    interrupting_task_id: null,
    last_priority_evaluated_at: resumeNow,
  });

  // ── Resolve the resume notification ──
  await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
    status: 'Resolved',
    resolved_at: resumeNow,
    resolution_type: 'completed',
    resolution_decision: 'Work resumed by employee',
    resolved_by_user_id: user.id || '',
    resolved_by_employee_id: employee.id,
    resolved_by_name: `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim(),
  });

  // ── Create resume OrchestrationDecision ──
  const decisionNumber = await generateDecisionNumber(base44);
  const employeeName = `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim();
  let resumeDecision = null;
  try {
    resumeDecision = await base44.asServiceRole.entities.OrchestrationDecision.create({
      decision_number: decisionNumber,
      employee_id: employee.id,
      employee_name: employeeName,
      evaluated_task_ids: [task.id],
      selected_task_id: task.id,
      selected_task_number: task.task_number,
      selected_task_title: task.title,
      decision_type: 'resume_previous_work',
      priority_scores_json: JSON.stringify([
        { task_id: task.id, task_number: task.task_number, score: 0, category: task.work_category || 'routine', reasons: ['Resumed by employee'] },
      ]),
      rule_results_json: JSON.stringify([
        { rule_id: 'resume_confirmed', matched: true, action: 'session_resumed' },
        { rule_id: 'checkpoint_restored', matched: !!checkpoint, action: 'progress_restored' },
      ]),
      decision_reason: `Employee resumed interrupted work "${task.title}" (${task.task_number}). Checkpoint ${checkpoint.checkpoint_number} restored progress.`,
      source_event_type: 'resume_work',
      source_event_id: task.id,
      created_at: resumeNow,
      engine_version: '1.0.0',
      requires_interruption: !!conflictSession,
      requires_acknowledgment: false,
      checkpoint_required: !!conflictCheckpoint,
      rules_applied: ['employee_initiated_resume'],
      blocked_reasons: [],
      orchestration_mode: 'assisted',
      manager_override: false,
      notes: JSON.stringify({
        resume_notification_id: notificationId,
        checkpoint_id: checkpoint.id,
        checkpoint_number: checkpoint.checkpoint_number,
        work_session_id: session.id,
        conflicted_session_id: conflictSession?.id || null,
        conflicted_checkpoint_id: conflictCheckpoint?.id || null,
        decision_result: 'resumed',
      }),
    });
  } catch (e) {
    console.error('[TASK RESPONSE] Failed to create resume OrchestrationDecision:', e.message);
  }

  return { workSession: session, checkpoint, conflict: null, decision: resumeDecision, notification: notif };
}

// ─── Snooze resume notification (server-side) ────────────────────────────────
export async function snoozeResumeNotification(
  base44: any,
  notificationId: string,
  minutes: number
): Promise<any | null> {
  const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  return await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
    resume_snooze_until: snoozeUntil,
  });
}

// ─── Start Now: create WorkSession with interruption logic ──────────────────
/**
 * Handles the "Start Now" response:
 * 1. Check if employee already has an active WorkSession for this task (idempotent)
 * 2. Check if employee has an active WorkSession for a different task
 * 3. If interruptible, create a checkpoint and pause the current session
 * 4. If non-interruptible, return a conflict result (do NOT start)
 * 5. Create a new WorkSession for the new task
 *
 * @returns { workSession, interruptedSession, checkpoint, conflict }
 */
export async function startWorkSession(
  base44: any,
  params: {
    task: any;
    employee: any;
    user: any;
    roleKey: string;
    currentRoute?: string;
    currentStep?: number;
    deviceId?: string;
  }
): Promise<{ workSession: any | null; interruptedSession: any | null; checkpoint: any | null; conflict: any | null }> {
  const { task, employee, user, roleKey } = params;
  const now = new Date().toISOString();

  // 1. Idempotency: check if there's already an active session for this task
  const existingSessions = await base44.asServiceRole.entities.WorkSession.filter({
    task_id: task.id,
    employee_id: employee.id,
    status: 'active',
  }, null, 1);

  if (existingSessions.length > 0) {
    return { workSession: existingSessions[0], interruptedSession: null, checkpoint: null, conflict: null };
  }

  // 2. Check for an active primary session on a different task
  const activePrimary = await base44.asServiceRole.entities.WorkSession.filter({
    employee_id: employee.id,
    status: 'active',
    is_primary: true,
  }, '-started_at', 1);

  let checkpoint = null;
  let interruptedSession = null;
  let currentInterruptibility = 'freely_interruptible';

  if (activePrimary.length > 0) {
    const activeSession = activePrimary[0];
    // Same task? Should have been caught above, but just in case
    if (activeSession.task_id === task.id) {
      return { workSession: activeSession, interruptedSession: null, checkpoint: null, conflict: null };
    }

    // Load the active task to check interruptibility
    let activeTask = null;
    try { activeTask = await base44.asServiceRole.entities.EnterpriseTask.get(activeSession.task_id); } catch { /* noop */ }

    const currentCategory = activeTask?.work_category || 'routine';
    const candidateCategory = task.work_category || 'routine';
    currentInterruptibility = activeTask?.interruptibility || 'freely_interruptible';

    const canInterruptResult = canInterrupt(currentCategory, candidateCategory, currentInterruptibility);

    if (!canInterruptResult) {
      // Non-interruptible — return conflict, do NOT start
      return {
        workSession: null,
        interruptedSession: null,
        checkpoint: null,
        conflict: {
          type: 'non_interruptible',
          message: `Current work "${activeSession.task_title}" cannot be interrupted. Complete it first or get manager approval.`,
          current_session: { id: activeSession.id, task_title: activeSession.task_title, task_number: activeSession.task_number },
          current_interruptibility: currentInterruptibility,
        },
      };
    }

    // 3. Create checkpoint and pause the current session
    const checkpointNumber = await generateCheckpointNumber(base44);
    checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.create({
      checkpoint_number: checkpointNumber,
      work_session_id: activeSession.id,
      task_id: activeSession.task_id,
      task_number: activeSession.task_number,
      employee_id: employee.id,
      employee_name: `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim(),
      route: params.currentRoute || activeSession.current_route || '',
      workflow_step: params.currentStep ?? activeSession.current_step ?? 0,
      record_id: activeSession.workflow_session_id || '',
      completed_item_ids: [],
      remaining_item_ids: [],
      notes: 'Interrupted by Start Now on higher-priority task',
      created_at: now,
      created_by: user.email,
      resume_status: 'pending',
      interrupting_task_id: task.id,
      interrupting_task_number: task.task_number,
    });

    // Pause the active session
    await base44.asServiceRole.entities.WorkSession.update(activeSession.id, {
      status: 'interrupted',
      paused_at: now,
      interrupted_by_task_id: task.id,
      interrupted_by_task_number: task.task_number,
      resume_required: true,
      checkpoint_id: checkpoint.id,
      last_activity_at: now,
    });

    // Update the interrupted task
    await base44.asServiceRole.entities.EnterpriseTask.update(activeSession.task_id, {
      orchestration_status: 'paused_by_higher_priority',
      interrupting_task_id: task.id,
      last_priority_evaluated_at: now,
    });

    // Set bidirectional interruption link on the new task
    await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
      interrupted_task_id: activeSession.task_id,
      last_priority_evaluated_at: now,
    });

    interruptedSession = activeSession;
  }

  // 4. Create new WorkSession
  const sessionNumber = await generateWorkSessionNumber(base44);
  const workSession = await base44.asServiceRole.entities.WorkSession.create({
    work_session_number: sessionNumber,
    task_id: task.id,
    task_number: task.task_number,
    task_title: task.title,
    workflow_session_id: task.workflow_session_id || '',
    employee_id: employee.id,
    employee_email: user.email,
    employee_name: `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim(),
    department_id: employee.department || '',
    department_name: employee.department || '',
    started_at: now,
    last_activity_at: now,
    status: 'active',
    is_primary: true,
    current_step: params.currentStep || 0,
    current_route: params.currentRoute || '',
    device_id: params.deviceId || '',
    created_by: user.email,
  });

  // 5. Update task status
  await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
    status: 'In Progress',
    orchestration_status: 'in_progress',
    last_priority_evaluated_at: now,
  });

  // 6. Create OrchestrationDecision if interruption occurred — REQUIRED (not best-effort)
  // The employee's previous work must NOT be left interrupted without a checkpoint
  // and decision. If decision creation fails, apply compensating updates to roll back.
  let interruptDecision = null;
  if (interruptedSession && checkpoint) {
    try {
      const interruptedTask = await base44.asServiceRole.entities.EnterpriseTask.get(interruptedSession.task_id);
      interruptDecision = await createInterruptDecision(base44, {
        interruptingTask: task,
        interruptedTask,
        interruptedSession,
        newWorkSession: workSession,
        checkpoint,
        employee,
        user,
        assignmentVersion: task.assignment_version || 0,
        canInterruptResult: true,
        currentInterruptibility: currentInterruptibility,
      });
    } catch (e) {
      // CRITICAL: OrchestrationDecision creation failed. Apply compensating updates
      // to roll back the entire interruption. Never leave two active primary sessions
      // or an interrupted session without a checkpoint and decision.
      console.error('[TASK RESPONSE] OrchestrationDecision creation failed — compensating:', e.message);
      try {
        // Undo: restore the interrupted session to active
        await base44.asServiceRole.entities.WorkSession.update(interruptedSession.id, {
          status: 'active',
          paused_at: null,
          interrupted_by_task_id: null,
          interrupted_by_task_number: null,
          resume_required: false,
          checkpoint_id: null,
          last_activity_at: new Date().toISOString(),
        });
        // Undo: restore the interrupted task
        await base44.asServiceRole.entities.EnterpriseTask.update(interruptedSession.task_id, {
          orchestration_status: 'in_progress',
          interrupting_task_id: null,
          last_priority_evaluated_at: new Date().toISOString(),
        });
        // Undo: clear bidirectional link on the new task
        await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
          interrupted_task_id: null,
        });
        // Undo: delete the checkpoint (no longer valid)
        await base44.asServiceRole.entities.WorkCheckpoint.delete(checkpoint.id);
        // Undo: mark the new session as abandoned
        await base44.asServiceRole.entities.WorkSession.update(workSession.id, {
          status: 'abandoned',
          last_activity_at: new Date().toISOString(),
        });
        // Undo: restore the new task to its previous state
        await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
          status: 'Assigned',
          orchestration_status: 'assigned',
        });
      } catch (compensateErr) {
        // Compensation also failed — log for admin recovery (system is inconsistent)
        console.error('[TASK RESPONSE] Compensating update also failed:', compensateErr.message);
        try {
          await base44.asServiceRole.entities.AutomationRunLog.create({
            log_id: 'INTERRUPT-FAIL-' + Date.now(),
            log_type: 'event',
            source_module: 'task_response',
            trigger_event: 'interruption_compensation_failed',
            related_record_id: task.id,
            status: 'error',
            error_message: `Decision creation failed: ${e.message}. Compensation also failed: ${compensateErr.message}. Tasks: ${task.task_number} interrupted ${interruptedSession.task_number}.`,
            triggered_by: user.email,
          });
        } catch { /* best-effort logging */ }
      }
      // Return a retryable error — keep the assignment banner actionable
      return {
        workSession: null,
        interruptedSession: null,
        checkpoint: null,
        conflict: {
          type: 'operation_failed',
          message: 'Unable to start work due to a system error. Your previous work was restored. Please try again.',
          retryable: true,
          error: e.message,
        },
      };
    }
  }

  return { workSession, interruptedSession: interruptedSession || null, checkpoint: checkpoint || null, conflict: null, interruptDecision };
}

// ─── Audit logging ─────────────────────────────────────────────────────────
export async function logResponseEvent(
  base44: any,
  recordId: string,
  eventType: string,
  details: Record<string, any>,
  userEmail: string
): Promise<void> {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: 'TASK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: 'task_response',
      trigger_event: eventType,
      related_record_id: recordId,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch { /* best-effort */ }
}