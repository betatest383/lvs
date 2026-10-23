/**
 * Task Registry — Role-based action permissions.
 * These are workflow-level permissions enforced server-side in manageTask.
 * Portal-level route access is handled separately by checkNavigationAccess.
 *
 * Actions: view, create, edit, review, approve, assign, delete, configure
 * Extended: reopen, cancel, transition
 */

export const TASK_ACTIONS = [
  'view', 'create', 'edit', 'review', 'approve',
  'assign', 'delete', 'configure', 'reopen', 'cancel',
  'reassign', 'change_due_date', 'change_priority', 'duplicate', 'archive',
  'execute_assigned_task',
];

/**
 * Role → allowed actions mapping.
 * Admin/Owner have all actions. Other roles have restricted sets.
 */
export const ROLE_ACTION_PERMISSIONS = {
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

// Status-based editability rules
export const EDITABLE_STATUSES = ['New', 'Draft', 'Assigned', 'In Progress'];
export const ARCHIVABLE_STATUSES = ['Completed', 'Canceled', 'Cancelled', 'Draft', 'New'];
export const LOCKED_STATUSES = ['Submitted for Review', 'Awaiting Approval', 'Approved', 'Completed', 'Canceled', 'Cancelled'];

export const canEditTask = (task) => !!(task && task.status) && EDITABLE_STATUSES.includes(task.status);
export const canArchiveTask = (task) => !!(task && task.status) && ARCHIVABLE_STATUSES.includes(task.status);
export const isTaskLocked = (task) => !task || !task.status || LOCKED_STATUSES.includes(task.status);
export const canManageTask = (task) => !!(task && task.status) && !LOCKED_STATUSES.includes(task.status);

export function hasTaskPermission(canonicalRoleKey, action) {
  if (!canonicalRoleKey) return false;
  if (canonicalRoleKey === 'admin' || canonicalRoleKey === 'owner') return true;
  const perms = ROLE_ACTION_PERMISSIONS[canonicalRoleKey] || ['view'];
  return perms.includes(action);
}

/**
 * Execution transitions (Start, Submit for Review, Complete) that can be
 * performed by the direct assignee without general Edit Task permission.
 */
export const EXECUTION_TRANSITIONS = ['In Progress', 'Submitted for Review', 'Completed'];

/**
 * Administrative transitions that require 'cancel' or 'edit' permission.
 */
export const ADMIN_TRANSITIONS = ['Canceled', 'Cancelled', 'Blocked', 'On Hold'];

/**
 * Determines whether the authenticated employee can perform a status transition
 * on the given task. Separates task execution from task administration:
 *
 * - Execution transitions (Start, Submit for Review, Complete): authorized via
 *   assignee ownership — the direct assignee can perform these on their own task.
 * - Administrative transitions (Cancel, Block, Hold): require 'cancel' or
 *   'edit' permission.
 * - Approval transition (Approved): handled by the separate 'approve' action.
 *
 * @param {object} task - The EnterpriseTask record
 * @param {string} userEmail - The authenticated user's email
 * @param {string} employeeRegistryId - The authenticated employee's EmployeeRegistry ID
 * @param {string} employeeId - The authenticated employee's employee_id (EMP-xxx)
 * @param {string} canonicalRoleKey - The normalized role key
 * @param {string} targetStatus - The target status to transition to
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canTransitionTask(task, userEmail, employeeRegistryId, employeeId, canonicalRoleKey, targetStatus) {
  if (!task || !targetStatus) return { allowed: false, reason: 'Invalid request' };
  const privileged = canonicalRoleKey === 'admin' || canonicalRoleKey === 'owner';

  // Privileged users can perform any valid transition
  if (privileged) return { allowed: true };

  // Execution transitions: direct assignee OR edit permission
  if (EXECUTION_TRANSITIONS.includes(targetStatus)) {
    const isDirectAssignee =
      (userEmail && task.assigned_to_email === userEmail) ||
      (employeeRegistryId && task.assigned_employee_registry_id === employeeRegistryId) ||
      (employeeId && task.assigned_employee_registry_id === employeeId);

    if (isDirectAssignee) return { allowed: true };
    if (hasTaskPermission(canonicalRoleKey, 'edit')) return { allowed: true };
    return { allowed: false, reason: 'Only the assigned employee can start, submit, or complete this task' };
  }

  // Administrative transitions: require cancel or edit permission
  if (ADMIN_TRANSITIONS.includes(targetStatus)) {
    if (hasTaskPermission(canonicalRoleKey, 'cancel') || hasTaskPermission(canonicalRoleKey, 'edit')) {
      return { allowed: true };
    }
    return { allowed: false, reason: "You don't have permission to " + targetStatus + " this task" };
  }

  // Approval transitions are handled by the separate 'approve' action
  if (targetStatus === 'Approved') {
    if (hasTaskPermission(canonicalRoleKey, 'approve')) return { allowed: true };
    return { allowed: false, reason: "You don't have approval permission" };
  }

  // Default: require edit permission
  if (hasTaskPermission(canonicalRoleKey, 'edit')) return { allowed: true };
  return { allowed: false, reason: "You don't have permission to transition this task" };
}

/**
 * Valid status transitions for the Task Registry workflow.
 * Blocked, On Hold, Canceled, Submitted for Review, Awaiting Approval
 * are NOT treated as Completed.
 */
export const VALID_TRANSITIONS = {
  'Draft': ['Assigned', 'Canceled'],
  'Assigned': ['In Progress', 'Canceled', 'On Hold'],
  'In Progress': ['Blocked', 'On Hold', 'Submitted for Review', 'Canceled'],
  'Blocked': ['In Progress', 'Canceled'],
  'On Hold': ['In Progress', 'Canceled'],
  'Submitted for Review': ['Changes Requested', 'Awaiting Approval', 'Approved', 'In Progress'],
  'Changes Requested': ['In Progress', 'Canceled'],
  'Awaiting Approval': ['Approved', 'Changes Requested'],
  'Approved': ['Completed'],
  'Completed': [], // Owner can reopen via 'reopen' action
  // Legacy statuses (technician workflow)
  'New': ['Assigned', 'In Progress', 'Cancelled', 'Blocked'],
  'Waiting': ['In Progress', 'Cancelled'],
  'Needs Approval': ['Completed', 'Cancelled'],
  'Cancelled': [],
  'Overdue': ['In Progress', 'Cancelled', 'Completed'],
};

export const NOT_COMPLETED_STATUSES = [
  'Blocked', 'On Hold', 'Canceled', 'Submitted for Review',
  'Awaiting Approval', 'Changes Requested', 'Draft',
];

/**
 * Statuses that require a reason field.
 */
export const STATUSES_REQUIRING_REASON = ['Blocked', 'On Hold', 'Canceled'];

/**
 * New task types specific to the Task Registry.
 */
export const REGISTRY_TASK_TYPES = [
  'Data Entry',
  'Registry Build',
  'SOP Draft',
  'Policy Draft',
  'Process Documentation',
  'Trainual Upload',
  'Equipment Setup',
  'Material Setup',
  'Automation Request',
  'Automation Testing',
  'Review',
  'Approval',
  'Corrective Action',
  'Recurring Operational Task',
];

/**
 * New statuses specific to the Task Registry workflow.
 */
export const REGISTRY_STATUSES = [
  'Draft', 'Assigned', 'In Progress', 'Blocked', 'On Hold',
  'Submitted for Review', 'Changes Requested', 'Awaiting Approval',
  'Approved', 'Completed', 'Canceled',
];

export const REGISTRY_STATUS_COLORS = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Assigned': 'bg-cyan-100 text-cyan-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Blocked': 'bg-red-100 text-red-700',
  'On Hold': 'bg-purple-100 text-purple-700',
  'Submitted for Review': 'bg-blue-100 text-blue-700',
  'Changes Requested': 'bg-orange-100 text-orange-700',
  'Awaiting Approval': 'bg-indigo-100 text-indigo-700',
  'Approved': 'bg-green-100 text-green-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Canceled': 'bg-gray-100 text-gray-500',
};

/**
 * Task Registry tab definitions, filtered by role.
 */
export const TASK_TABS = [
  { key: 'dashboard', label: 'Dashboard', to: '/tasks', icon: 'LayoutDashboard', restricted: true },
  { key: 'my_tasks', label: 'My Tasks', to: '/tasks/my-tasks', icon: 'User', restricted: false },
  { key: 'created_by_me', label: 'Created by Me', to: '/tasks/created-by-me', icon: 'FileEdit', restricted: true },
  { key: 'team_queue', label: 'Team Queue', to: '/tasks/team-queue', icon: 'Users', restricted: true },
  { key: 'registry', label: 'Registry', to: '/tasks/registry', icon: 'List', restricted: true },
  { key: 'due_today', label: 'Due Today', to: '/tasks/due-today', icon: 'Calendar', restricted: true },
  { key: 'overdue', label: 'Overdue', to: '/tasks/overdue', icon: 'AlertTriangle', restricted: true },
  { key: 'blocked', label: 'Blocked', to: '/tasks/blocked', icon: 'Ban', restricted: true },
  { key: 'awaiting_review', label: 'Awaiting Review', to: '/tasks/awaiting-review', icon: 'Eye', restricted: true },
  { key: 'awaiting_approval', label: 'Awaiting Approval', to: '/tasks/awaiting-approval', icon: 'Clock', restricted: true },
  { key: 'changes_requested', label: 'Changes Requested', to: '/tasks/changes-requested', icon: 'RotateCcw', restricted: true },
  { key: 'completed', label: 'Completed', to: '/tasks/completed', icon: 'CheckCircle2', restricted: true },
  { key: 'recurring', label: 'Recurring', to: '/tasks/recurring', icon: 'Repeat', restricted: true },
  { key: 'reports', label: 'Reports', to: '/tasks/reports', icon: 'BarChart3', restricted: true },
  { key: 'settings', label: 'Settings', to: '/tasks/settings', icon: 'Settings', restricted: true },
];