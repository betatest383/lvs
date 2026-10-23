export const TASK_TYPES = [
  'Data Entry', 'Registry Build', 'SOP Draft', 'Policy Draft',
  'Process Documentation', 'Trainual Upload', 'Equipment Setup',
  'Material Setup', 'Automation Request', 'Automation Testing',
  'Review', 'Approval', 'Corrective Action', 'Recurring Operational Task',
  'Operational', 'Warehouse', 'Technician', 'CSR', 'Management',
  'HR', 'Training', 'Certification', 'Policy Acknowledgment',
  'Equipment', 'Fleet', 'Safety', 'Audit',
  'Onboarding', 'Continuous Improvement', 'Integration Issue',
  'Customer Issue', 'Follow-Up',
];

export const TASK_STATUSES = [
  'New', 'Assigned', 'In Progress', 'Waiting', 'Blocked',
  'Needs Approval', 'Completed', 'Cancelled', 'Overdue',
];

export const TASK_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const DEPARTMENTS = [
  'Warehouse', 'Operations', 'Field Service', 'Customer Service',
  'Sales', 'Finance', 'Administration', 'Management', 'Fleet',
  'Safety & Compliance', 'IT', 'Human Resources',
];

export const SOURCE_MODULES = [
  'Employee Onboarding', 'Certification Registry', 'Training Registry',
  'Policy Registry', 'Equipment Management', 'Fleet Management',
  'Warehouse Operations', 'WH-105 Morning Readiness', 'Management Audits',
  'Corrective Actions', 'Continuous Improvement', 'ServiceTitan Integration',
  'Operations Center', 'Morning Brief', 'Technician Dashboard',
  'CSR Dashboard', 'Warehouse Dashboard', 'Manual',
];

export const TASK_STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-700',
  'Assigned': 'bg-cyan-100 text-cyan-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Waiting': 'bg-purple-100 text-purple-700',
  'Blocked': 'bg-red-100 text-red-700',
  'Needs Approval': 'bg-orange-100 text-orange-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Overdue': 'bg-red-200 text-red-800',
  'Draft': 'bg-gray-100 text-gray-700',
  'On Hold': 'bg-purple-100 text-purple-700',
  'Submitted for Review': 'bg-blue-100 text-blue-700',
  'Changes Requested': 'bg-orange-100 text-orange-700',
  'Awaiting Approval': 'bg-indigo-100 text-indigo-700',
  'Approved': 'bg-emerald-100 text-emerald-700',
  'Canceled': 'bg-gray-100 text-gray-500',
};

export const PRIORITY_COLORS = {
  Critical: 'bg-red-100 text-red-700 border-red-300',
  High: 'bg-orange-100 text-orange-700 border-orange-300',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Low: 'bg-green-100 text-green-700 border-green-300',
};

export const KANBAN_COLUMNS = [
  'New', 'Assigned', 'In Progress', 'Waiting', 'Blocked', 'Needs Approval', 'Completed',
];

export const APPROVAL_ACTIONS = ['Approve', 'Reject', 'Request Changes'];

export const APPROVAL_STATUS_COLORS = {
  'Pending': 'bg-orange-100 text-orange-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Changes Requested': 'bg-amber-100 text-amber-700',
};

export const parseJSON = (str, fallback) => {
  if (!str) return fallback;
  if (Array.isArray(str) || typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

const INACTIVE_STATUSES = ['Completed', 'Cancelled', 'Canceled', 'Approved'];

export const isOverdue = (task) => {
  if (!task.due_date || INACTIVE_STATUSES.includes(task.status)) return false;
  return new Date(task.due_date) < new Date(new Date().toDateString());
};

export const isDueToday = (task) => {
  if (!task.due_date || INACTIVE_STATUSES.includes(task.status)) return false;
  return new Date(task.due_date).toDateString() === new Date().toDateString();
};

export const isBlockedTooLong = (task) => {
  if (task.status !== 'Blocked') return false;
  const history = parseJSON(task.status_history, []);
  const blockedEntry = history.filter(h => h.status === 'Blocked').pop();
  if (!blockedEntry) return false;
  const blockedTime = new Date(blockedEntry.timestamp).getTime();
  return Date.now() - blockedTime > 24 * 60 * 60 * 1000;
};

export const generateTaskId = () => `TASK-${String(Date.now()).slice(-6)}`;

export const RELATED_FIELDS = [
  { key: 'related_employee', label: 'Employee' },
  { key: 'related_customer', label: 'Customer' },
  { key: 'related_job', label: 'Job' },
  { key: 'related_truck', label: 'Truck' },
  { key: 'related_equipment', label: 'Equipment' },
  { key: 'related_sop', label: 'SOP' },
  { key: 'related_workflow', label: 'Workflow' },
  { key: 'related_business_process', label: 'Business Process' },
  { key: 'related_policy', label: 'Policy' },
  { key: 'related_training', label: 'Training' },
  { key: 'related_certification', label: 'Certification' },
  { key: 'related_audit', label: 'Audit' },
  { key: 'related_corrective_action', label: 'Corrective Action' },
  { key: 'related_onboarding', label: 'Onboarding' },
  { key: 'related_improvement_request', label: 'Improvement Request' },
];