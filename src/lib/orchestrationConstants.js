/**
 * Work Orchestration Engine — Constants and Configuration
 *
 * This module defines the controlled vocabulary, state machine, and
 * priority rules for the real-time work orchestration layer.
 *
 * The engine is deterministic — no generative AI makes binding decisions.
 */

// ─── Work Categories ─────────────────────────────────────────────────────────
export const WORK_CATEGORIES = [
  'critical',
  'operational_interruption',
  'high_priority',
  'scheduled_primary',
  'routine',
  'busy_work',
];

export const WORK_CATEGORY_LABELS = {
  critical: 'Critical',
  operational_interruption: 'Operational Interruption',
  high_priority: 'High Priority',
  scheduled_primary: 'Scheduled Primary',
  routine: 'Routine',
  busy_work: 'Busy Work',
};

export const WORK_CATEGORY_DESCRIPTIONS = {
  critical: 'Immediate safety, legal, customer, or operational threat. May interrupt any noncritical activity.',
  operational_interruption: 'An event that immediately affects current operations. Normally pauses routine, scheduled, or busy work.',
  high_priority: 'Important work with a due date or service-level deadline. Escalates as due time approaches.',
  scheduled_primary: 'The employee\'s normal planned work (cycle count, truck replenishment, morning prep, scheduled audit, planned training).',
  routine: 'Necessary work that should be completed during normal operations but does not normally interrupt primary work.',
  busy_work: 'Productive, interruptible work completed when higher-priority work is unavailable. Explicitly yields to higher-priority work and resumes afterward.',
};

export const WORK_CATEGORY_COLORS = {
  critical: 'bg-red-500 text-white',
  operational_interruption: 'bg-orange-500 text-white',
  high_priority: 'bg-amber-500 text-white',
  scheduled_primary: 'bg-blue-500 text-white',
  routine: 'bg-green-500 text-white',
  busy_work: 'bg-gray-400 text-white',
};

export const WORK_CATEGORY_RANK = {
  critical: 100,
  operational_interruption: 80,
  high_priority: 60,
  scheduled_primary: 40,
  routine: 20,
  busy_work: 10,
};

// ─── Orchestration States (extends existing EnterpriseTask status) ────────────
// These are ADDITIONAL states for the orchestration_state field,
// separate from the existing `status` field which remains unchanged.
export const ORCHESTRATION_STATES = [
  'draft',
  'queued',
  'offered',
  'assigned',
  'acknowledgment_required',
  'acknowledged',
  'in_progress',
  'paused',
  'paused_by_higher_priority',
  'waiting_on_person',
  'waiting_on_material',
  'waiting_on_approval',
  'blocked',
  'overdue',
  'focus_required',
  'completed',
  'cancelled',
  'superseded',
  'archived',
];

export const ORCHESTRATION_STATE_LABELS = {
  draft: 'Draft',
  queued: 'Queued',
  offered: 'Offered',
  assigned: 'Assigned',
  acknowledgment_required: 'Acknowledgment Required',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  paused: 'Paused',
  paused_by_higher_priority: 'Paused (Higher Priority)',
  waiting_on_person: 'Waiting on Person',
  waiting_on_material: 'Waiting on Material',
  waiting_on_approval: 'Waiting on Approval',
  blocked: 'Blocked',
  overdue: 'Overdue',
  focus_required: 'Focus Required',
  completed: 'Completed',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
  archived: 'Archived',
};

export const ORCHESTRATION_STATE_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  queued: 'bg-gray-200 text-gray-700',
  offered: 'bg-cyan-100 text-cyan-700',
  assigned: 'bg-blue-100 text-blue-700',
  acknowledgment_required: 'bg-amber-100 text-amber-700',
  acknowledged: 'bg-green-100 text-green-700',
  in_progress: 'bg-amber-100 text-amber-800',
  paused: 'bg-purple-100 text-purple-700',
  paused_by_higher_priority: 'bg-orange-100 text-orange-700',
  waiting_on_person: 'bg-indigo-100 text-indigo-700',
  waiting_on_material: 'bg-yellow-100 text-yellow-700',
  waiting_on_approval: 'bg-violet-100 text-violet-700',
  blocked: 'bg-red-100 text-red-700',
  overdue: 'bg-red-200 text-red-800',
  focus_required: 'bg-red-500 text-white',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  superseded: 'bg-gray-200 text-gray-600',
  archived: 'bg-gray-100 text-gray-400',
};

// ─── State Transition Matrix ─────────────────────────────────────────────────
export const ORCHESTRATION_TRANSITIONS = {
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
  focus_required: ['completed', 'paused'], // paused only through authorized override
  completed: ['archived'],
  cancelled: ['archived'],
  superseded: ['archived'],
  archived: [],
};

// ─── Interruptibility ────────────────────────────────────────────────────────
export const INTERRUPTIBILITY_VALUES = [
  'freely_interruptible',
  'interruptible_with_checkpoint',
  'manager_approval_required',
  'non_interruptible',
  'critical_only',
];

export const INTERRUPTIBILITY_LABELS = {
  freely_interruptible: 'Freely Interruptible',
  interruptible_with_checkpoint: 'Interruptible (Checkpoint Required)',
  manager_approval_required: 'Manager Approval Required',
  non_interruptible: 'Non-Interruptible',
  critical_only: 'Critical Only',
};

// ─── Claim Modes ─────────────────────────────────────────────────────────────
export const CLAIM_MODES = [
  'assigned',
  'claimable',
  'multi_claim',
];

// ─── Acknowledgment Responses ────────────────────────────────────────────────
export const ACKNOWLEDGMENT_RESPONSES = [
  'acknowledged',
  'start_now',
  'request_clarification',
  'unable_to_start',
  'manager_assistance_requested',
];

export const ACKNOWLEDGMENT_RESPONSE_LABELS = {
  acknowledged: 'Acknowledged',
  start_now: 'Start Now',
  request_clarification: 'Request Clarification',
  unable_to_start: 'Unable to Start',
  manager_assistance_requested: 'Manager Assistance Requested',
};

// ─── Decision Types ──────────────────────────────────────────────────────────
export const DECISION_TYPES = [
  'next_work_selected',
  'interrupt_current_work',
  'continue_current_work',
  'resume_previous_work',
  'focus_required',
  'no_eligible_work',
  'manager_override',
];

export const DECISION_TYPE_LABELS = {
  next_work_selected: 'Next Work Selected',
  interrupt_current_work: 'Interrupt Current Work',
  continue_current_work: 'Continue Current Work',
  resume_previous_work: 'Resume Previous Work',
  focus_required: 'Focus Required',
  no_eligible_work: 'No Eligible Work',
  manager_override: 'Manager Override',
};

// ─── Orchestration Modes ─────────────────────────────────────────────────────
export const ORCHESTRATION_MODES = [
  'off',
  'preview',
  'assisted',
  'enforced',
];

export const ORCHESTRATION_MODE_LABELS = {
  off: 'Off',
  preview: 'Preview',
  assisted: 'Assisted',
  enforced: 'Enforced',
};

export const ORCHESTRATION_MODE_DESCRIPTIONS = {
  off: 'Orchestration engine is disabled. No recommendations are generated.',
  preview: 'Engine generates recommendations but does not interrupt, pause, or lock. Read-only advisory display.',
  assisted: 'Engine suggests next work and creates checkpoints. User can dismiss. No forced interruption.',
  enforced: 'Engine controls work priority and can interrupt/pause work. Requires explicit activation by Owner/Director.',
};

// ─── Work Session Statuses ──────────────────────────────────────────────────
export const WORK_SESSION_STATUSES = [
  'active',
  'paused',
  'interrupted',
  'waiting',
  'completed',
  'abandoned',
];

export const WORK_SESSION_STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-purple-100 text-purple-700',
  interrupted: 'bg-orange-100 text-orange-700',
  waiting: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  abandoned: 'bg-gray-100 text-gray-500',
};

// ─── Business Impact Levels ──────────────────────────────────────────────────
export const BUSINESS_IMPACT_LEVELS = [
  'none',
  'low',
  'medium',
  'high',
  'severe',
];

export const BUSINESS_IMPACT_RANK = {
  none: 0,
  low: 10,
  medium: 20,
  high: 40,
  severe: 60,
};

// ─── Urgency Levels ──────────────────────────────────────────────────────────
export const URGENCY_LEVELS = [
  'none',
  'low',
  'medium',
  'high',
  'immediate',
];

export const URGENCY_RANK = {
  none: 0,
  low: 10,
  medium: 20,
  high: 40,
  immediate: 60,
};

// ─── Focus Lock Statuses ─────────────────────────────────────────────────────
export const FOCUS_LOCK_STATUSES = [
  'none',
  'eligible',
  'active',
  'override_requested',
];

// ─── Priority Rules (seed) ───────────────────────────────────────────────────
// These are the deterministic rules the engine evaluates in order.
export const PRIORITY_RULES = [
  {
    id: 'rule_001',
    name: 'Critical outranks all',
    description: 'Critical work outranks all noncritical work.',
    condition: 'work_category == critical AND current_work_category != critical',
    action: 'interrupt_current_work',
    priority_weight: 1000,
  },
  {
    id: 'rule_002',
    name: 'Operational interruption outranks scheduled/routine/busy',
    description: 'Operational interruptions outrank scheduled, routine, and busy work.',
    condition: 'work_category == operational_interruption AND current_work_category IN [scheduled_primary, routine, busy_work]',
    action: 'interrupt_current_work',
    priority_weight: 800,
  },
  {
    id: 'rule_003',
    name: 'High-priority overdue outranks scheduled/routine/busy',
    description: 'High-priority overdue work outranks scheduled, routine, and busy work.',
    condition: 'work_category == high_priority AND is_overdue AND current_work_category IN [scheduled_primary, routine, busy_work]',
    action: 'interrupt_current_work',
    priority_weight: 700,
  },
  {
    id: 'rule_004',
    name: 'Scheduled primary outranks routine and busy work',
    description: 'Scheduled primary work normally outranks routine and busy work.',
    condition: 'work_category == scheduled_primary AND current_work_category IN [routine, busy_work]',
    action: 'interrupt_current_work',
    priority_weight: 500,
  },
  {
    id: 'rule_005',
    name: 'Busy work only when nothing else ready',
    description: 'Busy work runs only when no eligible higher-priority work is ready.',
    condition: 'work_category == busy_work AND eligible_higher_priority_work_count > 0',
    action: 'defer',
    priority_weight: 100,
  },
  {
    id: 'rule_006',
    name: 'Noninterruptible work continues',
    description: 'Noninterruptible work continues unless a critical rule explicitly permits interruption.',
    condition: 'current_work_interruptibility == non_interruptible AND candidate_category != critical',
    action: 'continue_current_work',
    priority_weight: 900,
  },
  {
    id: 'rule_007',
    name: 'Paused work with resume_required returns to queue',
    description: 'Paused work with resume_required=true returns to the queue after the interrupting task is completed.',
    condition: 'interrupting_task_completed AND paused_task.resume_required == true',
    action: 'resume_previous_work',
    priority_weight: 600,
  },
  {
    id: 'rule_008',
    name: 'Completed interrupting task triggers reevaluation',
    description: 'A completed interrupting task should trigger reevaluation immediately.',
    condition: 'completed_task.interrupted_task_id != null',
    action: 'reevaluate',
    priority_weight: 650,
  },
  {
    id: 'rule_009',
    name: 'Employee eligibility required',
    description: 'An employee must meet role, training, certification, and capability requirements.',
    condition: 'employee.missing_required_role OR employee.missing_required_training OR employee.missing_required_certification',
    action: 'skip',
    priority_weight: 0,
  },
];

// ─── Default Priority Weights ────────────────────────────────────────────────
export const DEFAULT_PRIORITY_WEIGHTS = {
  category_base: {
    critical: 1000,
    operational_interruption: 800,
    high_priority: 600,
    scheduled_primary: 400,
    routine: 200,
    busy_work: 100,
  },
  urgency_multiplier: {
    none: 1.0,
    low: 1.1,
    medium: 1.25,
    high: 1.5,
    immediate: 2.0,
  },
  overdue_bonus: 150,
  business_impact_bonus: {
    none: 0,
    low: 20,
    medium: 40,
    high: 80,
    severe: 150,
  },
  waiting_time_bonus_per_minute: 2,
  task_age_bonus_per_hour: 5,
  max_task_age_bonus: 100,
};

// ─── Engine Version ───────────────────────────────────────────────────────────
export const ENGINE_VERSION = '1.0.0';

// ─── Helper Functions ────────────────────────────────────────────────────────
export function canInterrupt(currentCategory, candidateCategory, currentInterruptibility) {
  // Critical work can interrupt anything
  if (candidateCategory === 'critical') {
    if (currentInterruptibility === 'non_interruptible' && currentCategory !== 'critical') {
      return true; // critical overrides non-interruptible
    }
    return true;
  }

  // Non-interruptible work cannot be interrupted by non-critical
  if (currentInterruptibility === 'non_interruptible') return false;

  // Critical-only interruptibility means only critical can interrupt
  if (currentInterruptibility === 'critical_only' && candidateCategory !== 'critical') return false;

  // Manager approval required — engine recommends but doesn't auto-interrupt
  if (currentInterruptibility === 'manager_approval_required') return false;

  // Freely interruptible or interruptible_with_checkpoint — use category ranking
  const currentRank = WORK_CATEGORY_RANK[currentCategory] || 0;
  const candidateRank = WORK_CATEGORY_RANK[candidateCategory] || 0;
  return candidateRank > currentRank;
}

export function isValidTransition(fromState, toState) {
  const allowed = ORCHESTRATION_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

export function isOrchestrationActive(mode) {
  return mode === 'assisted' || mode === 'enforced';
}

export function isEnforced(mode) {
  return mode === 'enforced';
}