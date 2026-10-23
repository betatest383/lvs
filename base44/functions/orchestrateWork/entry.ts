import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { checkAndCreateResumeObligation } from '../../shared/taskResponseHelpers.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATE WORK — Deterministic Priority Engine
//
// This function is the real-time work orchestration engine for LVC OS.
// It determines the most important work each employee or department should
// perform at any moment, safely interrupts lower-priority work, preserves
// progress, and resumes it when higher-priority work is completed.
//
// ENGINE VERSION: 1.0.0
// MODE: Preview (read-only recommendations, no forced interruption)
// ═══════════════════════════════════════════════════════════════════════════

const ENGINE_VERSION = '1.0.0';

// ─── Work Category Ranking ───────────────────────────────────────────────────
const CATEGORY_RANK = {
  critical: 100,
  operational_interruption: 80,
  high_priority: 60,
  scheduled_primary: 40,
  routine: 20,
  busy_work: 10,
};

const BUSINESS_IMPACT_RANK = {
  none: 0, low: 10, medium: 20, high: 40, severe: 60,
};

const URGENCY_RANK = {
  none: 0, low: 10, medium: 20, high: 40, immediate: 60,
};

const DEFAULT_WEIGHTS = {
  category_base: {
    critical: 1000, operational_interruption: 800, high_priority: 600,
    scheduled_primary: 400, routine: 200, busy_work: 100,
  },
  urgency_multiplier: { none: 1.0, low: 1.1, medium: 1.25, high: 1.5, immediate: 2.0 },
  overdue_bonus: 150,
  business_impact_bonus: { none: 0, low: 20, medium: 40, high: 80, severe: 150 },
  waiting_time_bonus_per_minute: 2,
  task_age_bonus_per_hour: 5,
  max_task_age_bonus: 100,
};

// ─── Orchestration State Transitions ────────────────────────────────────────
const ORCH_TRANSITIONS = {
  draft: ['queued', 'assigned', 'cancelled'],
  queued: ['offered', 'assigned', 'cancelled'],
  offered: ['assigned', 'queued', 'cancelled'],
  assigned: ['acknowledgment_required', 'in_progress', 'cancelled'],
  acknowledgment_required: ['acknowledged', 'assigned', 'cancelled'],
  acknowledged: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'paused_by_higher_priority', 'waiting_on_person', 'waiting_on_material', 'waiting_on_approval', 'blocked', 'completed', 'overdue'],
  paused: ['in_progress', 'cancelled', 'archived'],
  paused_by_higher_priority: ['in_progress', 'archived'],
  waiting_on_person: ['in_progress', 'blocked', 'cancelled'],
  waiting_on_material: ['in_progress', 'blocked', 'cancelled'],
  waiting_on_approval: ['in_progress', 'blocked', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  overdue: ['in_progress', 'focus_required', 'completed', 'cancelled'],
  focus_required: ['completed', 'paused'],
  completed: ['archived'],
  cancelled: ['archived'],
  superseded: ['archived'],
  archived: [],
};

function isValidOrchTransition(from, to) {
  const allowed = ORCH_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ─── Interruptibility check ──────────────────────────────────────────────────
function canInterrupt(currentCategory, candidateCategory, currentInterruptibility) {
  if (candidateCategory === 'critical') return true;
  if (currentInterruptibility === 'non_interruptible') return false;
  if (currentInterruptibility === 'critical_only' && candidateCategory !== 'critical') return false;
  if (currentInterruptibility === 'manager_approval_required') return false;
  const currentRank = CATEGORY_RANK[currentCategory] || 0;
  const candidateRank = CATEGORY_RANK[candidateCategory] || 0;
  return candidateRank > currentRank;
}

// ─── Role resolution ─────────────────────────────────────────────────────────
function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveEmployee(base44, user) {
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }, { linked_user_id: user.id }],
  }, 'created_date', 5);
  // Canonical resolution: prefer Active + ROLE-XXX primary_role (proper RoleRegistry link)
  const emp = employees.find(e => e.employment_status === 'Active' && e.primary_role?.startsWith('ROLE-')) || employees[0];
  if (!emp) return { user, employee: null, roleKey: normalizeRole(user.role) || 'user', employeeId: '', employeeName: user.full_name || user.email };
  let roleKey = normalizeRole(emp.primary_role || '');
  // If primary_role is a role ID (e.g. ROLE-001), resolve the role_key from RoleRegistry
  if (emp.primary_role && emp.primary_role.startsWith('ROLE-')) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({ role_id: emp.primary_role }, null, 1);
      if (roles[0]) {
        roleKey = roles[0].role_key || normalizeRole(roles[0].role_name || '');
      }
    } catch {}
  }
  return {
    user,
    employee: emp,
    roleKey,
    employeeId: emp.id,
    employeeName: (emp.preferred_name || emp.first_name || '') + ' ' + (emp.last_name || ''),
  };
}

// ─── Policy resolution ───────────────────────────────────────────────────────
async function resolvePolicy(base44, department) {
  let policy = null;
  if (department) {
    const deptPolicies = await base44.asServiceRole.entities.OrchestrationPolicy.filter({
      department, is_active: true,
    }, '-version', 1);
    policy = deptPolicies[0];
  }
  if (!policy) {
    const defaultPolicies = await base44.asServiceRole.entities.OrchestrationPolicy.filter({
      policy_key: 'default', is_active: true,
    }, '-version', 1);
    policy = defaultPolicies[0];
  }
  if (!policy) {
    // Fallback to in-memory defaults
    policy = {
      orchestration_mode: 'preview',
      priority_weights_json: JSON.stringify(DEFAULT_WEIGHTS),
      category_ranking: ['critical','operational_interruption','high_priority','scheduled_primary','routine','busy_work'],
      acknowledgment_deadline_minutes: 15,
      critical_acknowledgment_deadline_minutes: 5,
      overdue_escalation_minutes: 60,
      interruptibility_defaults_json: JSON.stringify({
        critical: 'critical_only', operational_interruption: 'freely_interruptible',
        high_priority: 'freely_interruptible', scheduled_primary: 'freely_interruptible',
        routine: 'freely_interruptible', busy_work: 'freely_interruptible',
      }),
      focus_lock_eligible_categories: ['high_priority', 'critical'],
      manager_override_roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'],
      emergency_disabled: false,
    };
  }
  return policy;
}

function parseWeights(policy) {
  if (policy.priority_weights_json) {
    try { return JSON.parse(policy.priority_weights_json); } catch {}
  }
  return DEFAULT_WEIGHTS;
}

// ─── Number generation ───────────────────────────────────────────────────────
async function generateNumber(base44, entityName, prefix, padLen) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities[entityName].filter(
      {}, '-created_date', 1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].id) {
      next = Math.floor(Date.now() / 1000) % 100000 + attempt;
    }
    const candidate = prefix + String(next).padStart(padLen, '0') + (attempt > 0 ? '-' + attempt : '');
    const collision = await base44.asServiceRole.entities[entityName].filter({ [prefix.toLowerCase() + '_number']: candidate.replace(/-\d+$/, '') }, null, 1);
    if (collision.length === 0) return candidate.replace(/-\d+$/, '');
    await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
  }
  return prefix + String(Date.now()).slice(-6);
}

// ─── Audit logging ──────────────────────────────────────────────────────────
async function logOrchestrationEvent(base44, eventType, details, userEmail) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: 'ORCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: 'orchestration_engine',
      trigger_event: eventType,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch {}
}

// ─── Employee eligibility check ─────────────────────────────────────────────
async function checkEmployeeEligibility(base44, task, employee, roleKey) {
  const blockedReasons = [];

  // Employee active status
  if (employee.employment_status && employee.employment_status !== 'Active') {
    blockedReasons.push(`Employee status is ${employee.employment_status} (not Active)`);
  }

  // Department mismatch (only for claimable tasks, not direct assignments)
  if (task.assigned_department && employee.department && task.claim_mode === 'claimable') {
    if (task.assigned_department !== employee.department) {
      blockedReasons.push(`Wrong department: task requires ${task.assigned_department}, employee is in ${employee.department}`);
    }
  }

  // Required capabilities
  const requiredCapabilities = task.required_capabilities || [];
  if (requiredCapabilities.length > 0 && employee.primary_role) {
    // Simplified capability check — in production this would query a capability registry
    // For now, we check if the employee's role key matches any required capability
    const hasAll = requiredCapabilities.every(cap => 
      cap === roleKey || cap === employee.primary_role || cap === 'any'
    );
    if (!hasAll) {
      blockedReasons.push(`Missing required capabilities: ${requiredCapabilities.filter(c => c !== roleKey && c !== employee.primary_role && c !== 'any').join(', ')}`);
    }
  }

  // Required roles
  const requiredRoleIds = task.required_role_ids || [];
  if (requiredRoleIds.length > 0) {
    // Check if employee's role matches any required role
    let roleMatch = false;
    for (const rid of requiredRoleIds) {
      try {
        const role = await base44.asServiceRole.entities.RoleRegistry.get(rid);
        if (role && (role.role_key === roleKey || role.role_name === employee.primary_role)) {
          roleMatch = true;
          break;
        }
      } catch {}
    }
    if (!roleMatch) blockedReasons.push('Missing required role');
  }

  // Required training
  const requiredTrainingIds = task.required_training_ids || [];
  if (requiredTrainingIds.length > 0) {
    const progress = await base44.asServiceRole.entities.TrainingProgress.filter({
      employee_registry_id: employee.id,
      status: 'completed',
      training_id: { $in: requiredTrainingIds },
    }, null, 100);
    const completedTrainingIds = new Set(progress.map(p => p.training_id));
    const missing = requiredTrainingIds.filter(id => !completedTrainingIds.has(id));
    if (missing.length > 0) blockedReasons.push(`Missing required training (${missing.length})`);
  }

  // Required certifications — verify active, non-expired certs matched by certification_id
  const requiredCertIds = task.required_certification_ids || [];
  if (requiredCertIds.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    const employeeCerts = await base44.asServiceRole.entities.EmployeeCertification.filter({
      employee_registry_id: employee.id,
      certification_id: { $in: requiredCertIds },
    }, null, 100);
    const validCertIds = new Set(
      employeeCerts
        .filter(c => c.status === 'Active' && (!c.expiration_date || c.expiration_date >= todayStr))
        .map(c => c.certification_id)
    );
    const missing = requiredCertIds.filter(id => !validCertIds.has(id));
    if (missing.length > 0) {
      const expiredNames = employeeCerts
        .filter(c => missing.includes(c.certification_id) && (c.status === 'Expired' || (c.expiration_date && c.expiration_date < todayStr)))
        .map(c => c.certification_name || c.certification_id);
      const trulyMissing = missing.filter(id => !employeeCerts.some(c => c.certification_id === id));
      if (expiredNames.length > 0) blockedReasons.push(`Expired certifications: ${expiredNames.join(', ')}`);
      if (trulyMissing.length > 0) blockedReasons.push(`Missing certifications (${trulyMissing.length}): ${trulyMissing.join(', ')}`);
    }
  }

  // Required employee count — verify enough available employees in department
  const requiredEmpCount = task.required_employee_count || 1;
  if (requiredEmpCount > 1) {
    const deptEmployees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
      department: employee.department,
      employment_status: 'Active',
    }, null, 200);
    const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
      employee_id: { $in: deptEmployees.map(e => e.id) },
      status: 'active',
      is_primary: true,
    }, null, 200);
    const busyEmpIds = new Set(activeSessions.map(s => s.employee_id));
    const availableCount = deptEmployees.filter(e => !busyEmpIds.has(e.id)).length;
    if (availableCount < requiredEmpCount) {
      blockedReasons.push(`Insufficient available employees: requires ${requiredEmpCount}, only ${availableCount} available in ${employee.department || 'department'}`);
    }
  }

  return { eligible: blockedReasons.length === 0, blockedReasons };
}

// ─── Priority scoring ───────────────────────────────────────────────────────
function calculatePriorityScore(task, weights) {
  const category = task.work_category || 'routine';
  const base = weights.category_base?.[category] || 200;
  const urgency = task.urgency || 'none';
  const urgencyMult = weights.urgency_multiplier?.[urgency] || 1.0;
  const businessImpact = task.business_impact || 'none';
  const impactBonus = weights.business_impact_bonus?.[businessImpact] || 0;

  let score = base * urgencyMult + impactBonus;

  // Overdue bonus
  const isOverdue = checkOverdue(task);
  if (isOverdue) score += weights.overdue_bonus || 150;

  // Waiting time bonus (for operational interruptions)
  if (task.source_event_type === 'delivery_arrived' && task.created_date) {
    const waitMinutes = (Date.now() - new Date(task.created_date).getTime()) / 60000;
    score += Math.min(waitMinutes * (weights.waiting_time_bonus_per_minute || 2), 200);
  }

  // Task age bonus
  if (task.created_date) {
    const ageHours = (Date.now() - new Date(task.created_date).getTime()) / 3600000;
    const ageBonus = Math.min(ageHours * (weights.task_age_bonus_per_hour || 5), weights.max_task_age_bonus || 100);
    score += ageBonus;
  }

  return Math.round(score);
}

function checkOverdue(task) {
  if (!task.due_at && !task.due_date) return false;
  const dueTime = task.due_at ? new Date(task.due_at).getTime() : new Date(task.due_date).getTime();
  return dueTime < Date.now();
}

// ─── Create OrchestrationDecision record ────────────────────────────────────
async function createDecisionRecord(base44, params) {
  const decisionNumber = await generateNumber(base44, 'OrchestrationDecision', 'OD', 6);
  try {
    return await base44.asServiceRole.entities.OrchestrationDecision.create({
      decision_number: decisionNumber,
      employee_id: params.employeeId || null,
      employee_name: params.employeeName || null,
      department_id: params.departmentId || null,
      department_name: params.departmentName || null,
      evaluated_task_ids: params.evaluatedTaskIds || [],
      selected_task_id: params.selectedTaskId || null,
      selected_task_number: params.selectedTaskNumber || null,
      selected_task_title: params.selectedTaskTitle || null,
      previous_task_id: params.previousTaskId || null,
      previous_task_number: params.previousTaskNumber || null,
      decision_type: params.decisionType,
      priority_scores_json: JSON.stringify(params.priorityScores || []),
      rule_results_json: JSON.stringify(params.ruleResults || []),
      decision_reason: params.decisionReason || '',
      source_event_type: params.sourceEventType || null,
      source_event_id: params.sourceEventId || null,
      created_at: new Date().toISOString(),
      engine_version: ENGINE_VERSION,
      manager_override: params.managerOverride || false,
      override_by: params.overrideBy || null,
      override_reason: params.overrideReason || null,
      requires_interruption: params.requiresInterruption || false,
      requires_acknowledgment: params.requiresAcknowledgment || false,
      checkpoint_required: params.checkpointRequired || false,
      rules_applied: params.rulesApplied || [],
      blocked_reasons: params.blockedReasons || [],
      orchestration_mode: params.orchestrationMode || 'preview',
    });
  } catch (e) {
    console.error('[ORCH] Failed to create decision record:', e.message);
    return null;
  }
}

// ─── Progress data validation (shared by save_progress and pause_task) ───────
async function validateProgressData(base44, task, session, body) {
  const { current_route, current_step, form_state, completed_item_ids, remaining_item_ids, warehouse_location_id, bin_location_id, inventory_item_id, idempotency_key } = body;

  // Task matches session
  if (session.task_id !== task.id) return { error: 'Task ID does not match the active work session' };

  // Route validation
  if (current_route !== undefined && current_route !== null) {
    if (typeof current_route !== 'string' || current_route.length > 500) return { error: 'Invalid route: must be a string ≤ 500 chars' };
  }

  // Workflow step validation
  if (current_step !== undefined && current_step !== null) {
    if (typeof current_step !== 'number' || current_step < 0 || !Number.isFinite(current_step)) return { error: 'Invalid workflow_step: must be a non-negative number' };
  }

  // Warehouse/bin/item existence
  if (warehouse_location_id) {
    try { const wh = await base44.asServiceRole.entities.WarehouseLocation.get(warehouse_location_id); if (!wh) return { error: 'Warehouse location not found' }; } catch { return { error: 'Warehouse location not found' }; }
  }
  if (bin_location_id) {
    try { const bin = await base44.asServiceRole.entities.BinLocation.get(bin_location_id); if (!bin) return { error: 'Bin location not found' }; } catch { return { error: 'Bin location not found' }; }
  }
  if (inventory_item_id) {
    try { const item = await base44.asServiceRole.entities.InventoryMaster.get(inventory_item_id); if (!item) return { error: 'Inventory item not found' }; } catch { return { error: 'Inventory item not found' }; }
  }

  // Completed/remaining overlap
  const completedSet = new Set(completed_item_ids || []);
  const remainingSet = new Set(remaining_item_ids || []);
  const overlap = [...completedSet].filter(id => remainingSet.has(id));
  if (overlap.length > 0) return { error: 'Completed and remaining item IDs must not overlap', overlap };

  // Sensitive data rejection
  if (form_state && typeof form_state === 'object') {
    const formStr = JSON.stringify(form_state).toLowerCase();
    const sensitivePatterns = ['password', 'passwd', 'token', 'secret', 'api_key', 'apikey', 'authorization', 'auth_token', 'cookie', 'credential'];
    for (const pattern of sensitivePatterns) {
      if (formStr.includes(pattern)) return { error: `Sensitive data detected in form_state: '${pattern}' is not allowed` };
    }
  }

  // Idempotency key dedup
  if (idempotency_key) {
    const existingByKey = await base44.asServiceRole.entities.WorkCheckpoint.filter({ work_session_id: session.id, idempotency_key }, null, 1);
    if (existingByKey.length > 0) return { idempotent: true, checkpoint: existingByKey[0] };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    let { user: _, employee, roleKey, employeeId, employeeName } = await resolveEmployee(base44, user);
    const callerEmail = user.email;
    const callerRoleKey = roleKey;

    // ─── Test execution mode (admin/owner only) ───
    // Allows authorized owners/admins to evaluate and execute work as a UAT employee
    // without impersonating them through caller-supplied identity fields.
    // Cannot be invoked by normal employees in production.
    let testExecution = false;
    let testExecutionBy = null;
    if (body.test_employee_id) {
      if (callerRoleKey !== 'admin' && callerRoleKey !== 'owner') {
        return Response.json({ error: 'Test execution mode requires admin/owner authorization' }, { status: 403 });
      }
      const testEmp = await base44.asServiceRole.entities.EmployeeRegistry.get(body.test_employee_id);
      if (!testEmp) return Response.json({ error: 'Test employee not found' }, { status: 404 });
      // Security: only allow test/UAT-classified employees
      const isUatEmployee = (testEmp.email && testEmp.email.includes('uat.')) ||
                            (testEmp.login_email && testEmp.login_email.includes('uat.')) ||
                            (testEmp.employee_id && testEmp.employee_id.startsWith('UAT-'));
      if (!isUatEmployee) {
        await logOrchestrationEvent(base44, 'test_execution_security_block', {
          reason: 'Target employee is not classified as test/UAT',
          target_employee_id: body.test_employee_id,
          target_employee_name: (testEmp.first_name || '') + ' ' + (testEmp.last_name || ''),
          target_employee_email: testEmp.email || testEmp.login_email,
        }, callerEmail);
        return Response.json({
          error: 'Test execution mode can only target UAT-classified employees. This employee is a production employee.',
          target_employee_id: body.test_employee_id,
        }, { status: 403 });
      }
      let testRoleKey = normalizeRole(testEmp.primary_role || '');
      if (testEmp.primary_role && testEmp.primary_role.startsWith('ROLE-')) {
        try {
          const roles = await base44.asServiceRole.entities.RoleRegistry.filter({ role_id: testEmp.primary_role }, null, 1);
          if (roles[0]) testRoleKey = roles[0].role_key || normalizeRole(roles[0].role_name || '');
        } catch {}
      }
      employee = testEmp;
      roleKey = testRoleKey;
      employeeId = testEmp.id;
      employeeName = (testEmp.preferred_name || testEmp.first_name || '') + ' ' + (testEmp.last_name || '');
      user = { ...user, email: testEmp.email || testEmp.login_email || '', full_name: employeeName };
      testExecution = true;
      testExecutionBy = callerEmail;
      await logOrchestrationEvent(base44, 'test_execution_initiated', {
        target_employee_id: testEmp.id,
        target_employee_name: employeeName,
        target_employee_email: testEmp.email || testEmp.login_email,
        action: body.action,
      }, callerEmail);
    }

    if (!employee && action !== 'get_policy' && action !== 'emergency_disable') {
      return Response.json({ error: 'Employee record not found. Orchestration requires a linked EmployeeRegistry record.' }, { status: 403 });
    }

    // Classification filter: test mode sees only test tasks; production excludes test data
    const classificationFilter = testExecution
      ? { $in: ['test'] }
      : { $nin: ['test', 'demo_seed', 'unknown_review', 'archived'] };

    const department = employee?.department || '';
    const policy = await resolvePolicy(base44, department);
    const weights = parseWeights(policy);
    const mode = policy.orchestration_mode || 'preview';
    const emergencyDisabled = policy.emergency_disabled === true;

    // ─── Emergency disable check ───
    if (emergencyDisabled && action !== 'get_policy' && action !== 'emergency_enable') {
      return Response.json({
        error: 'Orchestration engine is emergency disabled. All enforced behavior is suspended.',
        emergency_disabled: true,
        emergency_disabled_by: policy.emergency_disabled_by,
        emergency_disabled_reason: policy.emergency_disabled_reason,
      }, { status: 503 });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVALUATE EMPLOYEE WORK — core engine action
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'evaluate_employee_work' || action === 'get_next_work') {
      // ─── 1. Load employee's current active WorkSession ───
      const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
        employee_id: employee.id,
        status: 'active',
      }, '-started_at', 5);

      const primarySession = activeSessions.find(s => s.is_primary) || activeSessions[0] || null;
      let currentTask = null;
      let currentTaskFull = null;
      if (primarySession?.task_id) {
        try {
          currentTaskFull = await base44.asServiceRole.entities.EnterpriseTask.get(primarySession.task_id);
          currentTask = {
            id: currentTaskFull.id,
            task_number: currentTaskFull.task_number,
            title: currentTaskFull.title,
            work_category: currentTaskFull.work_category,
            orchestration_status: currentTaskFull.orchestration_status,
            interruptibility: currentTaskFull.interruptibility || 'freely_interruptible',
            due_at: currentTaskFull.due_at,
            due_date: currentTaskFull.due_date,
          };
        } catch {}
      }

      // ─── 2. Load eligible tasks ───
      // Tasks assigned to this employee OR claimable by their role
      const assignedTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
        $or: [
          { assigned_employee_registry_id: employee.id },
          { assigned_to_email: user.email },
        ],
        data_classification: classificationFilter,
        status: { $nin: ['Completed', 'Canceled', 'Cancelled'] },
      }, '-created_date', 100);

      // Filter to tasks that are eligible for orchestration (not completed in orchestration_status)
      const eligibleTasks = assignedTasks.filter(t => {
        const orchStatus = t.orchestration_status;
        if (orchStatus && ['completed', 'cancelled', 'superseded', 'archived'].includes(orchStatus)) return false;
        return true;
      });

      // ─── 3. Score each task ───
      const scoredTasks = [];
      const evaluatedTaskIds = [];
      const allBlockedReasons = [];

      for (const task of eligibleTasks) {
        evaluatedTaskIds.push(task.id);

        // Check eligibility
        const { eligible, blockedReasons } = await checkEmployeeEligibility(base44, task, employee, roleKey);
        if (!eligible) {
          allBlockedReasons.push({ task_id: task.id, task_number: task.task_number, title: task.title, blocked_reasons: blockedReasons });
          continue;
        }

        // Check dependencies
        const depIds = task.dependency_task_ids || [];
        let depsMet = true;
        for (const depId of depIds) {
          try {
            const dep = await base44.asServiceRole.entities.EnterpriseTask.get(depId);
            if (dep && dep.status !== 'Completed') {
              depsMet = false;
              break;
            }
          } catch {}
        }
        if (!depsMet) {
          allBlockedReasons.push({ task_id: task.id, task_number: task.task_number, title: task.title, blocked_reasons: ['Dependencies not met'] });
          continue;
        }

        const score = calculatePriorityScore(task, weights);
        const category = task.work_category || 'routine';
        const isOverdue = checkOverdue(task);

        const reasons = [];
        reasons.push(`Category: ${category} (rank ${CATEGORY_RANK[category] || 0})`);
        if (task.urgency && task.urgency !== 'none') reasons.push(`Urgency: ${task.urgency}`);
        if (isOverdue) reasons.push('Overdue');
        if (task.business_impact && task.business_impact !== 'none') reasons.push(`Business impact: ${task.business_impact}`);
        if (task.source_event_type === 'delivery_arrived') reasons.push('Delivery waiting');

        scoredTasks.push({
          task_id: task.id,
          task_number: task.task_number,
          title: task.title,
          work_category: category,
          score,
          is_overdue: isOverdue,
          due_at: task.due_at,
          due_date: task.due_date,
          interruptibility: task.interruptibility || 'freely_interruptible',
          requires_immediate_acknowledgment: task.requires_immediate_acknowledgment || false,
          reasons,
        });
      }

      // Sort by score descending
      scoredTasks.sort((a, b) => b.score - a.score);

      // ─── 4. Determine decision ───
      let recommendedTask = scoredTasks[0] || null;
      let decisionType = 'no_eligible_work';
      let requiresInterruption = false;
      let checkpointRequired = false;
      let requiresAcknowledgment = false;
      let decisionReason = 'No eligible work available.';
      const rulesApplied = [];

      if (recommendedTask) {
        if (currentTask && currentTask.id === recommendedTask.task_id) {
          decisionType = 'continue_current_work';
          decisionReason = `Continue current work: ${recommendedTask.title}. Score: ${recommendedTask.score}.`;
          rulesApplied.push('continue_current_work');
        } else if (currentTask) {
          // Check if we should interrupt
          const canInterruptResult = canInterrupt(
            currentTask.work_category || 'routine',
            recommendedTask.work_category || 'routine',
            currentTask.interruptibility || 'freely_interruptible'
          );

          if (canInterruptResult) {
            decisionType = 'interrupt_current_work';
            requiresInterruption = true;
            checkpointRequired = currentTask.interruptibility === 'interruptible_with_checkpoint' || true;
            decisionReason = `${WORK_CATEGORY_LABELS_INLINE[recommendedTask.work_category]} work "${recommendedTask.title}" (score ${recommendedTask.score}) selected because ${recommendedTask.reasons.join(', ')}. Current work "${currentTask.title}" is ${currentTask.interruptibility || 'freely interruptible'}.`;
            rulesApplied.push('interrupt_current_work');

            // Apply specific rules
            if (recommendedTask.work_category === 'critical') rulesApplied.push('rule_001_critical_outranks_all');
            if (recommendedTask.work_category === 'operational_interruption') rulesApplied.push('rule_002_operational_interruption');
            if (recommendedTask.is_overdue && recommendedTask.work_category === 'high_priority') rulesApplied.push('rule_003_high_priority_overdue');
          } else {
            decisionType = 'continue_current_work';
            decisionReason = `Continue current work: ${currentTask.title}. Current work is ${currentTask.interruptibility || 'non-interruptible'} and cannot be interrupted by "${recommendedTask.title}".`;
            rulesApplied.push('rule_006_noninterruptible');
          }
        } else {
          decisionType = 'next_work_selected';
          decisionReason = `${recommendedTask.title} selected. Score: ${recommendedTask.score}. ${recommendedTask.reasons.join('. ')}.`;
          rulesApplied.push('next_work_selected');
        }

        if (recommendedTask.requires_immediate_acknowledgment) {
          requiresAcknowledgment = true;
        }
      }

      // ─── 5. Check for resume obligations ───
      if (!currentTask) {
        // Check for interrupted sessions that need resuming
        const interruptedSessions = await base44.asServiceRole.entities.WorkSession.filter({
          employee_id: employee.id,
          status: 'interrupted',
          resume_required: true,
        }, '-paused_at', 5);

        if (interruptedSessions.length > 0) {
          const resumeSession = interruptedSessions[0];
          // Check if the interrupting task is completed
          if (resumeSession.interrupted_by_task_id) {
            try {
              const interruptingTask = await base44.asServiceRole.entities.EnterpriseTask.get(resumeSession.interrupted_by_task_id);
              if (interruptingTask && (interruptingTask.status === 'Completed' || interruptingTask.orchestration_status === 'completed')) {
                decisionType = 'resume_previous_work';
                decisionReason = `Resume previous work: ${resumeSession.task_title || 'interrupted task'}. The interrupting task ${resumeSession.interrupted_by_task_number || ''} is now completed.`;
                rulesApplied.length = 0; // clear previous rules
                rulesApplied.push('rule_007_resume_paused_work');
                rulesApplied.push('rule_008_completed_interrupting_triggers_reevaluation');

                // Override recommended task with the actual task to resume
                if (recommendedTask) {
                  recommendedTask.task_id = resumeSession.task_id;
                  recommendedTask.task_number = resumeSession.task_number;
                  recommendedTask.title = resumeSession.task_title;
                  recommendedTask.is_resume = true;
                  recommendedTask.score = recommendedTask.score || 0;
                  recommendedTask.reasons = ['Resume interrupted work', `Checkpoint: ${resumeSession.checkpoint_id || 'N/A'}`];
                } else {
                  // No scored tasks — create a resume recommendation from scratch
                  recommendedTask = {
                    task_id: resumeSession.task_id,
                    task_number: resumeSession.task_number,
                    title: resumeSession.task_title,
                    work_category: 'busy_work',
                    score: 0,
                    is_overdue: false,
                    due_at: null,
                    due_date: null,
                    interruptibility: 'freely_interruptible',
                    requires_immediate_acknowledgment: false,
                    reasons: ['Resume interrupted work'],
                    is_resume: true,
                  };
                  // Push to scoredTasks so it appears in all_scored_tasks
                  scoredTasks.unshift(recommendedTask);
                }
              }
            } catch {}
          }
        }
      }

      // ─── 6. Create OrchestrationDecision record ───
      const decisionRecord = await createDecisionRecord(base44, {
        employeeId: employee.id,
        employeeName,
        departmentId: department,
        departmentName: department,
        evaluatedTaskIds,
        selectedTaskId: recommendedTask?.task_id || null,
        selectedTaskNumber: recommendedTask?.task_number || null,
        selectedTaskTitle: recommendedTask?.title || null,
        previousTaskId: currentTask?.id || null,
        previousTaskNumber: currentTask?.task_number || null,
        decisionType,
        priorityScores: scoredTasks.map(t => ({ task_id: t.task_id, task_number: t.task_number, score: t.score, category: t.work_category, reasons: t.reasons })),
        ruleResults: rulesApplied.map(r => ({ rule_id: r, matched: true })),
        decisionReason,
        requiresInterruption,
        requiresAcknowledgment,
        checkpointRequired,
        rulesApplied,
        blockedReasons: allBlockedReasons.map(b => `${b.task_number}: ${b.blocked_reasons.join(', ')}`),
        orchestrationMode: mode,
      });

      // ─── 7. Return result ───
      return Response.json({
        success: true,
        employee_id: employee.id,
        current_task: currentTask,
        recommended_task: recommendedTask,
        decision: decisionType,
        requires_interruption: requiresInterruption,
        requires_acknowledgment: requiresAcknowledgment,
        checkpoint_required: checkpointRequired,
        priority_reason: decisionReason,
        rules_applied: rulesApplied,
        blocked_reasons: allBlockedReasons,
        test_execution: testExecution,
        test_execution_by: testExecutionBy || null,
        engine_version: ENGINE_VERSION,
        orchestration_mode: mode,
        decision_id: decisionRecord?.id || null,
        decision_number: decisionRecord?.decision_number || null,
        all_scored_tasks: scoredTasks.slice(0, 10),
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVALUATE DEPARTMENT WORK
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'evaluate_department_work') {
      const { department_id } = body;
      const targetDept = department_id || department;

      // Get all tasks for this department
      const deptTasks = await base44.asServiceRole.entities.EnterpriseTask.filter({
        $or: [{ department: targetDept }, { assigned_department: targetDept }],
        data_classification: classificationFilter,
        status: { $nin: ['Completed', 'Canceled', 'Cancelled'] },
      }, '-created_date', 200);

      const scoredTasks = deptTasks.map(task => ({
        task_id: task.id,
        task_number: task.task_number,
        title: task.title,
        work_category: task.work_category || 'routine',
        score: calculatePriorityScore(task, weights),
        is_overdue: checkOverdue(task),
        assigned_to: task.assigned_to,
        assigned_to_email: task.assigned_to_email,
      })).sort((a, b) => b.score - a.score);

      return Response.json({
        success: true,
        department: targetDept,
        tasks: scoredTasks.slice(0, 50),
        count: scoredTasks.length,
        engine_version: ENGINE_VERSION,
        orchestration_mode: mode,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // START TASK — creates a WorkSession
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'start_task') {
      const { task_id, idempotency_key, device_id, current_route, current_step } = body;

      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      // Idempotency check
      if (idempotency_key) {
        const existing = await base44.asServiceRole.entities.WorkSession.filter({
          task_id, employee_id: employee.id, status: 'active',
        }, null, 1);
        if (existing.length > 0) {
          return Response.json({ success: true, work_session: existing[0], already_active: true });
        }
      }

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      // Status synchronization: prevent starting a completed task
      if (task.status === 'Completed' || task.orchestration_status === 'completed') {
        return Response.json({ error: 'Cannot start a completed task' }, { status: 400 });
      }

      // Verify assignment
      const isAssigned = task.assigned_employee_registry_id === employee.id || task.assigned_to_email === user.email;
      const isClaimable = task.claim_mode === 'claimable' || task.claim_mode === 'multi_claim';
      if (!isAssigned && !isClaimable) {
        await logOrchestrationEvent(base44, 'bypass_attempt', { action: 'start_task', task_id, reason: 'Not assigned and not claimable' }, user.email);
        return Response.json({ error: 'Not authorized to start this task' }, { status: 403 });
      }

      // Check eligibility
      const { eligible, blockedReasons } = await checkEmployeeEligibility(base44, task, employee, roleKey);
      if (!eligible) {
        return Response.json({ error: 'Employee does not meet eligibility requirements', blocked_reasons: blockedReasons }, { status: 403 });
      }

      // If employee has an active primary session, pause it first (or reject in preview mode)
      const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
        employee_id: employee.id, status: 'active', is_primary: true,
      }, null, 1);

      if (activeSessions.length > 0) {
        const activeSession = activeSessions[0];
        const activeTask = await base44.asServiceRole.entities.EnterpriseTask.get(activeSession.task_id);
        const canInterruptResult = canInterrupt(
          activeTask?.work_category || 'routine',
          task.work_category || 'routine',
          activeTask?.interruptibility || 'freely_interruptible'
        );

        if (mode === 'preview') {
          return Response.json({
            success: false,
            preview_mode: true,
            message: 'Preview mode: cannot start new task while another is active. Engine recommends interrupting current work.',
            current_active_session: { id: activeSession.id, task_title: activeSession.task_title },
            would_interrupt: canInterruptResult,
            checkpoint_would_be_required: true,
          }, { status: 409 });
        }

        if (!canInterruptResult) {
          return Response.json({ error: 'Current work cannot be interrupted. Complete it first or get manager approval.' }, { status: 409 });
        }

        // Create checkpoint for the interrupted session
        if (activeTask) {
          const checkpointNumber = await generateNumber(base44, 'WorkCheckpoint', 'CP', 6);
          await base44.asServiceRole.entities.WorkCheckpoint.create({
            checkpoint_number: checkpointNumber,
            work_session_id: activeSession.id,
            task_id: activeSession.task_id,
            task_number: activeSession.task_number,
            employee_id: employee.id,
            employee_name: employeeName,
            route: current_route || activeSession.current_route || '',
            workflow_step: current_step || activeSession.current_step || 0,
            record_id: activeSession.workflow_session_id || '',
            completed_item_ids: [],
            remaining_item_ids: [],
            notes: 'Interrupted by higher priority task',
            created_at: new Date().toISOString(),
            created_by: user.email,
            resume_status: 'pending',
            interrupting_task_id: task_id,
            interrupting_task_number: task.task_number,
          });

          // Pause the active session
          await base44.asServiceRole.entities.WorkSession.update(activeSession.id, {
            status: 'interrupted',
            paused_at: new Date().toISOString(),
            interrupted_by_task_id: task_id,
            interrupted_by_task_number: task.task_number,
            resume_required: true,
            checkpoint_id: null, // will be updated
          });

          // Update task orchestration status
          await base44.asServiceRole.entities.EnterpriseTask.update(activeSession.task_id, {
            orchestration_status: 'paused_by_higher_priority',
            interrupting_task_id: task_id,
            last_priority_evaluated_at: new Date().toISOString(),
          });
        }
      }

      // Create new WorkSession
      const sessionNumber = await generateNumber(base44, 'WorkSession', 'WS', 6);
      const workSession = await base44.asServiceRole.entities.WorkSession.create({
        work_session_number: sessionNumber,
        task_id,
        task_number: task.task_number,
        task_title: task.title,
        workflow_session_id: task.workflow_session_id || '',
        employee_id: employee.id,
        employee_email: user.email,
        employee_name: employeeName,
        department_id: department,
        department_name: department,
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        status: 'active',
        is_primary: true,
        current_step: body.current_step || 0,
        current_route: body.current_route || '',
        device_id: device_id || '',
        created_by: user.email,
      });

      // Update task orchestration status
      await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
        orchestration_status: 'in_progress',
        last_priority_evaluated_at: new Date().toISOString(),
      });

      // Concurrency guard: verify this is the only active primary session (two-device race protection)
      const allActivePrimary = await base44.asServiceRole.entities.WorkSession.filter({
        employee_id: employee.id, status: 'active', is_primary: true,
      }, 'started_at', 10);

      if (allActivePrimary.length > 1) {
        const earliest = allActivePrimary[0];
        if (earliest.id !== workSession.id) {
          await base44.asServiceRole.entities.WorkSession.update(workSession.id, {
            status: 'abandoned',
            notes: 'Concurrency conflict: another primary session was created simultaneously',
          });
          await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
            orchestration_status: 'queued',
          });
          await logOrchestrationEvent(base44, 'concurrency_conflict', {
            task_id, winning_session: earliest.id, losing_session: workSession.id, employee: employeeName,
          }, user.email);
          return Response.json({
            success: false, conflict: true,
            message: 'Another work session was started simultaneously. Only one primary session is allowed.',
            existing_session: { id: earliest.id, task_title: earliest.task_title },
          }, { status: 409 });
        }
      }

      await logOrchestrationEvent(base44, 'task_started', { task_id, session_number: sessionNumber, employee: employeeName }, user.email);

      return Response.json({ success: true, work_session: workSession });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SAVE PROGRESS — creates a checkpoint without pausing the session
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'save_progress') {
      const { task_id, current_route, current_step, form_state, completed_item_ids, remaining_item_ids, warehouse_location_id, bin_location_id, inventory_item_id, idempotency_key } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      // Authenticated employee owns or may update the WorkSession
      if (task.assigned_employee_registry_id !== employee.id && task.assigned_to_email !== user.email) {
        return Response.json({ error: 'Not authorized to save progress for this task' }, { status: 403 });
      }

      // WorkSession is active
      const sessions = await base44.asServiceRole.entities.WorkSession.filter({ task_id, employee_id: employee.id, status: 'active' }, null, 1);
      const session = sessions[0];
      if (!session) return Response.json({ error: 'No active work session for this task' }, { status: 404 });

      // Shared validation
      const valResult = await validateProgressData(base44, task, session, body);
      if (valResult.error) return Response.json({ error: valResult.error, overlap: valResult.overlap }, { status: 400 });
      if (valResult.idempotent) return Response.json({ success: true, idempotent: true, checkpoint_id: valResult.checkpoint.id, checkpoint_number: valResult.checkpoint.checkpoint_number });

      // Mark previous pending checkpoints as superseded
      const prevCheckpoints = await base44.asServiceRole.entities.WorkCheckpoint.filter({ work_session_id: session.id, resume_status: 'pending' }, null, 10);
      for (const pc of prevCheckpoints) {
        try { await base44.asServiceRole.entities.WorkCheckpoint.update(pc.id, { resume_status: 'superseded' }); } catch {}
      }

      // Create checkpoint (session stays active)
      const checkpointNumber = await generateNumber(base44, 'WorkCheckpoint', 'CP', 6);
      const checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.create({
        checkpoint_number: checkpointNumber, work_session_id: session.id, task_id, task_number: task.task_number,
        workflow_session_id: task.workflow_session_id || '', employee_id: employee.id, employee_name: employeeName,
        route: current_route || session.current_route || '',
        workflow_step: current_step !== undefined ? current_step : (session.current_step || 0),
        record_id: task.workflow_session_id || '', warehouse_location_id: warehouse_location_id || '',
        bin_location_id: bin_location_id || '', inventory_item_id: inventory_item_id || '',
        form_state_json: form_state ? JSON.stringify(form_state) : '',
        completed_item_ids: completed_item_ids || [], remaining_item_ids: remaining_item_ids || [],
        notes: 'Progress saved', created_at: new Date().toISOString(), created_by: user.email,
        resume_status: 'pending', idempotency_key: idempotency_key || null,
      });

      // Update session last activity (stays active)
      await base44.asServiceRole.entities.WorkSession.update(session.id, {
        last_activity_at: new Date().toISOString(),
        current_route: current_route || session.current_route,
        current_step: current_step !== undefined ? current_step : session.current_step,
      });

      await logOrchestrationEvent(base44, 'progress_saved', { task_id, checkpoint: checkpointNumber }, user.email);
      return Response.json({ success: true, checkpoint_id: checkpoint.id, checkpoint_number: checkpoint.checkpoint_number, session_status: 'active' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PAUSE TASK
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'pause_task') {
      const { task_id, reason, current_route, current_step, form_state, completed_item_ids, remaining_item_ids, interrupting_task_id, interrupting_task_number, warehouse_location_id, bin_location_id, inventory_item_id, idempotency_key } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      if (task.assigned_employee_registry_id !== employee.id && task.assigned_to_email !== user.email) {
        return Response.json({ error: 'Not authorized to pause this task' }, { status: 403 });
      }

      if (!task.may_be_paused && mode !== 'preview' && !interrupting_task_id) {
        return Response.json({ error: 'This task may not be paused' }, { status: 400 });
      }

      // Find active or paused session (paused for idempotency check)
      const sessions = await base44.asServiceRole.entities.WorkSession.filter({
        task_id, employee_id: employee.id, status: { $in: ['active', 'paused', 'interrupted'] },
      }, '-created_date', 1);
      const session = sessions[0];
      if (!session) return Response.json({ error: 'No active work session for this task' }, { status: 404 });

      // Idempotency: if session is already paused/interrupted, return existing checkpoint
      if (session.status === 'paused' || session.status === 'interrupted') {
        let existingCheckpoint = null;
        if (session.checkpoint_id) {
          try { existingCheckpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(session.checkpoint_id); } catch {}
        }
        return Response.json({
          success: true,
          already_paused: true,
          checkpoint_id: existingCheckpoint?.id || null,
          checkpoint_number: existingCheckpoint?.checkpoint_number || null,
          session_status: session.status,
        });
      }

      // ─── Progress-saving validation ───
      const validation = await validateProgressData(base44, task, session, body);
      if (validation.error) return Response.json({ error: validation.error, overlap: validation.overlap }, { status: 400 });
      if (validation.idempotent) {
        return Response.json({ success: true, idempotent: true, checkpoint_id: validation.checkpoint.id, checkpoint_number: validation.checkpoint.checkpoint_number, session_status: session.status });
      }

      const isInterruption = !!interrupting_task_id;
      const now = new Date().toISOString();

      // Create checkpoint
      const checkpointNumber = await generateNumber(base44, 'WorkCheckpoint', 'CP', 6);
      const checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.create({
        checkpoint_number: checkpointNumber,
        work_session_id: session.id,
        task_id,
        task_number: task.task_number,
        workflow_session_id: task.workflow_session_id || '',
        employee_id: employee.id,
        employee_name: employeeName,
        route: current_route || session.current_route || '',
        workflow_step: current_step || session.current_step || 0,
        record_id: task.workflow_session_id || '',
        warehouse_location_id: warehouse_location_id || '',
        bin_location_id: bin_location_id || '',
        inventory_item_id: inventory_item_id || '',
        form_state_json: form_state ? JSON.stringify(form_state) : '',
        completed_item_ids: completed_item_ids || [],
        remaining_item_ids: remaining_item_ids || [],
        notes: reason || (isInterruption ? 'Interrupted by higher priority task' : 'Manually paused'),
        created_at: now,
        created_by: user.email,
        resume_status: 'pending',
        idempotency_key: idempotency_key || null,
        interrupting_task_id: interrupting_task_id || null,
        interrupting_task_number: interrupting_task_number || null,
      });

      // Update session — use 'interrupted' status when caused by a higher-priority task
      const sessionUpdate = {
        status: isInterruption ? 'interrupted' : 'paused',
        paused_at: now,
        pause_reason: reason || (isInterruption ? 'Interrupted by higher priority task' : 'Manually paused'),
        checkpoint_id: checkpoint.id,
        last_activity_at: now,
      };
      if (isInterruption) {
        sessionUpdate.interrupted_by_task_id = interrupting_task_id;
        sessionUpdate.interrupted_by_task_number = interrupting_task_number || '';
        sessionUpdate.resume_required = true;
      }
      await base44.asServiceRole.entities.WorkSession.update(session.id, sessionUpdate);

      // Update task
      await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
        orchestration_status: isInterruption ? 'paused_by_higher_priority' : 'paused',
        interrupting_task_id: interrupting_task_id || null,
        last_priority_evaluated_at: now,
      });

      // Set interrupted_task_id on the interrupting task (bidirectional reference)
      if (isInterruption && interrupting_task_id) {
        try {
          await base44.asServiceRole.entities.EnterpriseTask.update(interrupting_task_id, {
            interrupted_task_id: task_id,
            last_priority_evaluated_at: now,
          });
        } catch {}
      }

      await logOrchestrationEvent(base44, isInterruption ? 'task_interrupted' : 'task_paused', { task_id, checkpoint: checkpointNumber, reason, interrupting_task_id }, user.email);

      return Response.json({ success: true, checkpoint_id: checkpoint.id, checkpoint_number: checkpoint.checkpoint_number, session_status: sessionUpdate.status });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESUME TASK
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'resume_task') {
      const { task_id, checkpoint_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      // Find paused or active session (active for idempotency check)
      const sessions = await base44.asServiceRole.entities.WorkSession.filter({
        task_id, employee_id: employee.id, status: { $in: ['active', 'paused', 'interrupted'] },
      }, '-created_date', 1);
      const session = sessions[0];
      if (!session) return Response.json({ error: 'No paused work session for this task' }, { status: 404 });

      // Idempotency: if session is already active, return existing
      if (session.status === 'active') {
        return Response.json({ success: true, already_active: true, work_session_id: session.id });
      }

      // Status synchronization: require checkpoint when resume_required
      if (session.resume_required && !session.checkpoint_id && !checkpoint_id) {
        await logOrchestrationEvent(base44, 'resume_blocked', { task_id, reason: 'Checkpoint required but not found' }, user.email);
        return Response.json({ error: 'Cannot resume: checkpoint required but not found. Session was interrupted and requires a checkpoint to restore progress.' }, { status: 400 });
      }

      // Load checkpoint
      let checkpoint = null;
      if (session.checkpoint_id) {
        try { checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(session.checkpoint_id); } catch {}
      }
      if (checkpoint_id) {
        try { checkpoint = await base44.asServiceRole.entities.WorkCheckpoint.get(checkpoint_id); } catch {}
      }

      const resumeNow = new Date().toISOString();

      // Resume session — clear resume_required and active interruption markers.
      // Historical interruption relationships are preserved in the checkpoint.
      await base44.asServiceRole.entities.WorkSession.update(session.id, {
        status: 'active',
        resumed_at: resumeNow,
        last_activity_at: resumeNow,
        resume_required: false,
        interrupted_by_task_id: null,
        interrupted_by_task_number: null,
      });

      // Mark checkpoint as resumed
      if (checkpoint) {
        await base44.asServiceRole.entities.WorkCheckpoint.update(checkpoint.id, {
          resume_status: 'resumed',
          resumed_at: resumeNow,
          resumed_by: user.email,
        });
      }

      // Clear bidirectional interruption link on the interrupting task
      if (session.interrupted_by_task_id) {
        try {
          await base44.asServiceRole.entities.EnterpriseTask.update(session.interrupted_by_task_id, {
            interrupted_task_id: null,
            last_priority_evaluated_at: resumeNow,
          });
        } catch {}
      }

      // Update task — clear interrupting_task_id, set in_progress
      await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
        orchestration_status: 'in_progress',
        interrupting_task_id: null,
        last_priority_evaluated_at: resumeNow,
      });

      await logOrchestrationEvent(base44, 'task_resumed', { task_id, checkpoint: checkpoint?.checkpoint_number }, user.email);

      return Response.json({
        success: true,
        work_session_id: session.id,
        checkpoint: checkpoint ? {
          id: checkpoint.id,
          checkpoint_number: checkpoint.checkpoint_number,
          route: checkpoint.route,
          workflow_step: checkpoint.workflow_step,
          warehouse_location_id: checkpoint.warehouse_location_id || null,
          bin_location_id: checkpoint.bin_location_id || null,
          inventory_item_id: checkpoint.inventory_item_id || null,
          completed_item_ids: checkpoint.completed_item_ids,
          remaining_item_ids: checkpoint.remaining_item_ids,
          form_state: checkpoint.form_state_json ? JSON.parse(checkpoint.form_state_json) : null,
          notes: checkpoint.notes,
        } : null,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETE TASK
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'complete_task') {
      const { task_id, completion_summary, evidence_urls } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      if (task.assigned_employee_registry_id !== employee.id && task.assigned_to_email !== user.email && roleKey !== 'admin' && roleKey !== 'owner') {
        return Response.json({ error: 'Not authorized to complete this task' }, { status: 403 });
      }

      // Idempotency: if task is already completed, return existing
      if (task.status === 'Completed' && task.orchestration_status === 'completed') {
        return Response.json({ success: true, already_completed: true, completed_task: { id: task.id, task_number: task.task_number, title: task.title } });
      }

      // Complete the work session
      const sessions = await base44.asServiceRole.entities.WorkSession.filter({
        task_id, employee_id: employee.id, status: 'active',
      }, null, 1);
      if (sessions[0]) {
        await base44.asServiceRole.entities.WorkSession.update(sessions[0].id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        });
      }

      // Update task
      await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
        orchestration_status: 'completed',
        status: 'Completed',
        completed_at: new Date().toISOString(),
        completed_date: new Date().toISOString().split('T')[0],
        completion_summary: completion_summary || '',
        completion_evidence: evidence_urls || [],
        last_priority_evaluated_at: new Date().toISOString(),
      });

      await logOrchestrationEvent(base44, 'task_completed', { task_id, title: task.title }, user.email);

      // ─── Trigger reevaluation: check if there's an interrupted task to resume ───
      // Uses the shared checkAndCreateResumeObligation function which creates
      // the OrchestrationDecision and persistent resume notification.
      const reloadedTask = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      const resumeResult = await checkAndCreateResumeObligation(base44, {
        completedTask: reloadedTask,
        user,
        terminalStatus: 'Completed',
      });

      let resumeRecommendation = null;
      if (resumeResult.notification) {
        resumeRecommendation = {
          decision: 'resume_previous_work',
          task_id: resumeResult.notification.related_task,
          task_number: resumeResult.notification.related_task_number,
          task_title: resumeResult.notification.related_task_title,
          work_session_id: resumeResult.notification.resume_work_session_id,
          checkpoint_id: resumeResult.notification.resume_checkpoint_id,
          resume_notification_id: resumeResult.notification.id,
          reason: `Previous work "${resumeResult.notification.related_task_title}" should be resumed now that "${task.title}" is completed.`,
        };
      }

      return Response.json({
        success: true,
        completed_task: { id: task.id, task_number: task.task_number, title: task.title },
        resume_recommendation: resumeRecommendation,
        resume_decision: resumeResult.decision,
        resume_notification: resumeResult.notification,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET CURRENT WORK
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'get_current_work') {
      const sessions = await base44.asServiceRole.entities.WorkSession.filter({
        employee_id: employee.id,
        status: { $in: ['active', 'paused', 'interrupted'] },
      }, '-started_at', 10);

      const primary = sessions.find(s => s.is_primary && s.status === 'active') || sessions.find(s => s.status === 'active') || sessions[0] || null;

      let currentTask = null;
      if (primary?.task_id) {
        try {
          currentTask = await base44.asServiceRole.entities.EnterpriseTask.get(primary.task_id);
        } catch {}
      }

      return Response.json({
        success: true,
        current_session: primary,
        current_task: currentTask,
        all_sessions: sessions,
        orchestration_mode: mode,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PREVIEW INTERRUPTION
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'preview_interruption') {
      const { candidate_task_id } = body;
      if (!candidate_task_id) return Response.json({ error: 'candidate_task_id is required' }, { status: 400 });

      const candidateTask = await base44.asServiceRole.entities.EnterpriseTask.get(candidate_task_id);
      if (!candidateTask) return Response.json({ error: 'Candidate task not found' }, { status: 404 });

      // Load current work
      const activeSessions = await base44.asServiceRole.entities.WorkSession.filter({
        employee_id: employee.id, status: 'active', is_primary: true,
      }, null, 1);
      const activeSession = activeSessions[0];

      let currentTask = null;
      if (activeSession?.task_id) {
        try { currentTask = await base44.asServiceRole.entities.EnterpriseTask.get(activeSession.task_id); } catch {}
      }

      if (!currentTask) {
        return Response.json({
          success: true,
          has_current_work: false,
          would_interrupt: false,
          checkpoint_required: false,
          reason: 'No current work to interrupt.',
        });
      }

      const wouldInterrupt = canInterrupt(
        currentTask.work_category || 'routine',
        candidateTask.work_category || 'routine',
        currentTask.interruptibility || 'freely_interruptible'
      );

      const reason = wouldInterrupt
        ? `"${candidateTask.title}" (${candidateTask.work_category}) would interrupt "${currentTask.title}" (${currentTask.work_category}, ${currentTask.interruptibility || 'freely interruptible'}). A checkpoint will preserve progress.`
        : `"${candidateTask.title}" (${candidateTask.work_category}) cannot interrupt "${currentTask.title}" (${currentTask.interruptibility || 'non-interruptible'}).`;

      return Response.json({
        success: true,
        has_current_work: true,
        current_task: { id: currentTask.id, title: currentTask.title, work_category: currentTask.work_category, interruptibility: currentTask.interruptibility },
        candidate_task: { id: candidateTask.id, title: candidateTask.title, work_category: candidateTask.work_category },
        would_interrupt: wouldInterrupt,
        checkpoint_required: wouldInterrupt,
        reason,
        orchestration_mode: mode,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RECORD ACKNOWLEDGMENT
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'record_acknowledgment') {
      const { task_id, response, response_reason, notification_id, device_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const validResponses = ['acknowledged', 'start_now', 'request_clarification', 'unable_to_start', 'manager_assistance_requested'];
      if (!validResponses.includes(response)) {
        return Response.json({ error: 'Invalid response. Must be one of: ' + validResponses.join(', ') }, { status: 400 });
      }

      if ((response === 'unable_to_start' || response === 'manager_assistance_requested') && !response_reason) {
        return Response.json({ error: 'response_reason is required for this response' }, { status: 400 });
      }

      const task = await base44.asServiceRole.entities.EnterpriseTask.get(task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      // Check acknowledgment deadline
      const deadline = task.acknowledgment_deadline_minutes || policy.acknowledgment_deadline_minutes || 15;
      const wasOverdue = task.orchestration_status === 'acknowledgment_required' && task.last_priority_evaluated_at
        ? (Date.now() - new Date(task.last_priority_evaluated_at).getTime()) > deadline * 60000
        : false;

      const ackNumber = await generateNumber(base44, 'TaskAcknowledgment', 'ACK', 6);
      const acknowledgment = await base44.asServiceRole.entities.TaskAcknowledgment.create({
        acknowledgment_number: ackNumber,
        task_id,
        task_number: task.task_number,
        employee_id: employee.id,
        employee_email: user.email,
        employee_name: employeeName,
        notification_id: notification_id || null,
        delivered_at: task.last_priority_evaluated_at || null,
        displayed_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
        response,
        response_reason: response_reason || '',
        device_id: device_id || '',
        was_overdue: wasOverdue,
        acknowledgment_deadline_minutes: deadline,
        created_by: user.email,
      });

      // Update task acknowledgment status
      const ackStatus = response === 'start_now' ? 'start_now' : response;
      const newOrchStatus = response === 'start_now' ? 'in_progress' : 'acknowledged';

      await base44.asServiceRole.entities.EnterpriseTask.update(task_id, {
        acknowledgment_status: ackStatus,
        orchestration_status: newOrchStatus,
        last_priority_evaluated_at: new Date().toISOString(),
      });

      await logOrchestrationEvent(base44, 'acknowledgment_recorded', { task_id, response, was_overdue: wasOverdue }, user.email);

      return Response.json({ success: true, acknowledgment });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MANAGER OVERRIDE
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'manager_override') {
      const { employee_id, selected_task_id, reason, department_id } = body;

      // Verify override authority
      const overrideRoles = policy.manager_override_roles || ['admin', 'owner', 'director_of_operations', 'operations_manager'];
      if (!overrideRoles.includes(roleKey)) {
        await logOrchestrationEvent(base44, 'bypass_attempt', { action: 'manager_override', reason: 'Not authorized for override' }, user.email);
        return Response.json({ error: 'Not authorized to perform manager overrides' }, { status: 403 });
      }

      if (!reason || !reason.trim()) {
        return Response.json({ error: 'Override reason is required' }, { status: 400 });
      }

      // Verify department authority (for non-admin/owner)
      if (roleKey !== 'admin' && roleKey !== 'owner') {
        if (department_id && department !== department_id && department !== body.department_id) {
          return Response.json({ error: 'Can only override within your own department' }, { status: 403 });
        }
      }

      const targetEmployeeId = employee_id || employee.id;

      // Create override decision
      const decisionNumber = await generateNumber(base44, 'OrchestrationDecision', 'OD', 6);
      const overrideDecision = await base44.asServiceRole.entities.OrchestrationDecision.create({
        decision_number: decisionNumber,
        employee_id: targetEmployeeId,
        department_id: department_id || department,
        evaluated_task_ids: selected_task_id ? [selected_task_id] : [],
        selected_task_id: selected_task_id || null,
        decision_type: 'manager_override',
        decision_reason: `Manager override by ${employeeName}: ${reason}`,
        created_at: new Date().toISOString(),
        engine_version: ENGINE_VERSION,
        manager_override: true,
        override_by: user.email,
        override_reason: reason,
        orchestration_mode: mode,
      });

      await logOrchestrationEvent(base44, 'manager_override', { employee_id: targetEmployeeId, selected_task_id, reason, override_by: employeeName }, user.email);

      return Response.json({ success: true, decision: overrideDecision });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET POLICY
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'get_policy') {
      return Response.json({
        success: true,
        policy: {
          orchestration_mode: mode,
          emergency_disabled: emergencyDisabled,
          emergency_disabled_by: policy.emergency_disabled_by,
          emergency_disabled_reason: policy.emergency_disabled_reason,
          acknowledgment_deadline_minutes: policy.acknowledgment_deadline_minutes || 15,
          critical_acknowledgment_deadline_minutes: policy.critical_acknowledgment_deadline_minutes || 5,
          overdue_escalation_minutes: policy.overdue_escalation_minutes || 60,
          manager_override_roles: policy.manager_override_roles || ['admin', 'owner', 'director_of_operations', 'operations_manager'],
        },
        engine_version: ENGINE_VERSION,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EMERGENCY DISABLE — kills enforced orchestration immediately
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'emergency_disable' || action === 'emergency_enable') {
      const isDisable = action === 'emergency_disable';
      const { reason } = body;

      if (isDisable && (!reason || !reason.trim())) {
        return Response.json({ error: 'Reason is required for emergency disable' }, { status: 400 });
      }

      // Only Owner/Director can disable
      if (roleKey !== 'admin' && roleKey !== 'owner' && roleKey !== 'director_of_operations') {
        return Response.json({ error: 'Only Owner or Director of Operations can use emergency controls' }, { status: 403 });
      }

      // Find the default policy
      const defaultPolicies = await base44.asServiceRole.entities.OrchestrationPolicy.filter({
        policy_key: 'default', is_active: true,
      }, '-version', 1);
      const defaultPolicy = defaultPolicies[0];

      if (defaultPolicy) {
        await base44.asServiceRole.entities.OrchestrationPolicy.update(defaultPolicy.id, {
          emergency_disabled: isDisable,
          emergency_disabled_by: isDisable ? user.email : null,
          emergency_disabled_at: isDisable ? new Date().toISOString() : null,
          emergency_disabled_reason: isDisable ? reason : null,
          updated_by: user.email,
        });
      }

      // Notify Owner/Director
      try {
        await base44.asServiceRole.entities.EnterpriseNotification.create({
          notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title: isDisable ? 'ORCHESTRATION ENGINE EMERGENCY DISABLED' : 'Orchestration engine re-enabled',
          message: isDisable
            ? `${employeeName} has emergency-disabled the orchestration engine. Reason: ${reason}. All enforced behavior is suspended. Existing task and workflow state is preserved.`
            : `${employeeName} has re-enabled the orchestration engine. Enforced mode remains off until explicitly activated.`,
          notification_type: isDisable ? 'Critical' : 'System',
          priority: isDisable ? 'Critical' : 'High',
          status: 'Pending',
          source_module: 'orchestration_engine',
          recipient_role: 'Owner',
          delivery_methods: ['In-App'],
          requires_acknowledgment: true,
          is_archived: false,
          escalation_level: 0,
        });
      } catch {}

      await logOrchestrationEvent(base44, action, { reason, by: employeeName }, user.email);

      return Response.json({
        success: true,
        emergency_disabled: isDisable,
        message: isDisable
          ? 'Orchestration engine emergency disabled. All enforced behavior suspended. Task and workflow state preserved.'
          : 'Orchestration engine re-enabled. Mode remains preview until explicitly changed.',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UPDATE POLICY — Owner/Director only
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'update_policy') {
      if (roleKey !== 'admin' && roleKey !== 'owner' && roleKey !== 'director_of_operations') {
        return Response.json({ error: 'Only Owner or Director can update orchestration policy' }, { status: 403 });
      }

      const { orchestration_mode, acknowledgment_deadline_minutes, overdue_escalation_minutes } = body;

      // Prevent enabling enforced mode if emergency disabled
      if (orchestration_mode === 'enforced' && emergencyDisabled) {
        return Response.json({ error: 'Cannot enable enforced mode while emergency disabled is active' }, { status: 403 });
      }

      const defaultPolicies = await base44.asServiceRole.entities.OrchestrationPolicy.filter({
        policy_key: 'default', is_active: true,
      }, '-version', 1);
      const defaultPolicy = defaultPolicies[0];

      if (!defaultPolicy) {
        // Create default policy
        const newPolicy = await base44.asServiceRole.entities.OrchestrationPolicy.create({
          policy_key: 'default',
          policy_name: 'Default Orchestration Policy',
          description: 'Company-wide default orchestration policy',
          orchestration_mode: orchestration_mode || 'preview',
          priority_weights_json: JSON.stringify(DEFAULT_WEIGHTS),
          category_ranking: ['critical','operational_interruption','high_priority','scheduled_primary','routine','busy_work'],
          acknowledgment_deadline_minutes: acknowledgment_deadline_minutes || 15,
          critical_acknowledgment_deadline_minutes: 5,
          overdue_escalation_minutes: overdue_escalation_minutes || 60,
          interruptibility_defaults_json: JSON.stringify({
            critical: 'critical_only', operational_interruption: 'freely_interruptible',
            high_priority: 'freely_interruptible', scheduled_primary: 'freely_interruptible',
            routine: 'freely_interruptible', busy_work: 'freely_interruptible',
          }),
          focus_lock_eligible_categories: ['high_priority', 'critical'],
          manager_override_roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'],
          is_active: true,
          version: 1,
          created_by: user.email,
          updated_by: user.email,
        });
        return Response.json({ success: true, policy: newPolicy });
      }

      const updates = { updated_by: user.email };
      if (orchestration_mode !== undefined) updates.orchestration_mode = orchestration_mode;
      if (acknowledgment_deadline_minutes !== undefined) updates.acknowledgment_deadline_minutes = acknowledgment_deadline_minutes;
      if (overdue_escalation_minutes !== undefined) updates.overdue_escalation_minutes = overdue_escalation_minutes;
      updates.version = (defaultPolicy.version || 1) + 1;

      const updated = await base44.asServiceRole.entities.OrchestrationPolicy.update(defaultPolicy.id, updates);
      await logOrchestrationEvent(base44, 'policy_updated', { changes: Object.keys(updates), by: employeeName }, user.email);

      return Response.json({ success: true, policy: updated });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT DELIVERY ARRIVED — creates durable event + PO Receiving task
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'report_delivery_arrived') {
      const { po_number, vendor, warehouse_location_id, warehouse_location_name, items_summary } = body;
      if (!po_number) return Response.json({ error: 'po_number is required' }, { status: 400 });

      // Create durable event record
      const eventId = 'EVT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: eventId,
        log_type: 'event',
        source_module: 'orchestration_engine',
        source_module_name: 'Work Orchestration',
        trigger_event: 'delivery_arrived',
        trigger_event_name: 'Delivery Arrived',
        event_payload_json: JSON.stringify({
          po_number, vendor, warehouse_location_id, warehouse_location_name,
          items_summary: items_summary || '',
          employee_id: employeeId,
          employee_name: employeeName,
          test_execution: testExecution,
        }),
        status: 'received',
        conditions_met: true,
        triggered_by: user.email,
      });

      // Create PO Receiving task as a consequence of the event
      const taskNumber = await generateNumber(base44, 'EnterpriseTask', 'TSK', 6);
      const poTask = await base44.asServiceRole.entities.EnterpriseTask.create({
        task_number: taskNumber,
        task_id: taskNumber,
        title: `Receive PO ${po_number}`,
        description: `Receive delivery for PO ${po_number}${vendor ? ' from ' + vendor : ''}. Items: ${items_summary || 'N/A'}`,
        department: employee.department || 'Warehouse',
        task_type: 'Warehouse',
        priority: 'High',
        status: 'Assigned',
        data_classification: testExecution ? 'test' : 'production',
        is_test_data: testExecution,
        assigned_employee_registry_id: employeeId,
        assigned_to: employeeName,
        assigned_to_email: user.email,
        assigned_department: employee.department || 'Warehouse',
        work_category: 'operational_interruption',
        priority_level: 2,
        business_impact: 'medium',
        urgency: 'high',
        source_event_type: 'delivery_arrived',
        source_event_id: eventId,
        interruptibility: 'freely_interruptible',
        may_be_paused: true,
        resume_required: false,
        claim_mode: 'assigned',
        orchestration_status: 'queued',
        created_by: user.email,
      });

      await logOrchestrationEvent(base44, 'delivery_arrived', {
        event_id: eventId, task_id: poTask.id, task_number: taskNumber,
        po_number, vendor, test_execution: testExecution,
      }, user.email);

      return Response.json({
        success: true,
        event_id: eventId,
        task_id: poTask.id,
        task_number: taskNumber,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET DECISION HISTORY
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'get_decision_history') {
      const { task_id, limit } = body;
      const query = {};
      if (task_id) {
        query.selected_task_id = task_id;
      } else {
        query.employee_id = employee.id;
      }
      const decisions = await base44.asServiceRole.entities.OrchestrationDecision.filter(
        query, '-created_date', limit || 20
      );
      return Response.json({ success: true, decisions, count: decisions.length });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[ORCH ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Inline label map (avoid duplicate import) ──────────────────────────────
const WORK_CATEGORY_LABELS_INLINE = {
  critical: 'Critical',
  operational_interruption: 'Operational Interruption',
  high_priority: 'High Priority',
  scheduled_primary: 'Scheduled Primary',
  routine: 'Routine',
  busy_work: 'Busy Work',
};