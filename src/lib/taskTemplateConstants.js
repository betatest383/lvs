export const TEMPLATE_STATUSES = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];

export const WORK_CATEGORIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'operational_interruption', label: 'Operational Interruption' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'scheduled_primary', label: 'Scheduled Primary' },
  { value: 'routine', label: 'Routine' },
  { value: 'busy_work', label: 'Busy Work' },
];

export const INTERRUPTIBILITY_OPTIONS = [
  { value: 'freely_interruptible', label: 'Freely Interruptible' },
  { value: 'interruptible_with_checkpoint', label: 'Interruptible With Checkpoint' },
  { value: 'manager_approval_required', label: 'Manager Approval Required' },
  { value: 'non_interruptible', label: 'Noninterruptible' },
  { value: 'critical_only', label: 'Critical Only' },
];

export const ASSIGNMENT_MODES = [
  { value: 'specific_employee', label: 'Specific Employee' },
  { value: 'multiple_employees', label: 'Multiple Employees' },
  { value: 'role_queue', label: 'Role Queue' },
  { value: 'department_queue', label: 'Department Queue' },
  { value: 'eligibility_engine', label: 'Eligibility Engine' },
  { value: 'manager_selects', label: 'Manager Selects' },
];

export const CLAIM_MODES = [
  { value: 'assigned', label: 'Direct Assignment' },
  { value: 'claimable', label: 'First Eligible Claim' },
  { value: 'manager_assigns', label: 'Manager Assigns' },
  { value: 'multi_claim', label: 'Multiple Employees Required' },
  { value: 'automatic_eligibility', label: 'Automatic Eligibility Selection' },
];

export const EXECUTION_MODES = [
  { value: 'simple_action', label: 'Simple Action' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'guided_task', label: 'Guided Task' },
  { value: 'form', label: 'Form' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'wizard', label: 'Wizard' },
  { value: 'automated', label: 'Automated' },
  { value: 'linked_module', label: 'Linked Module' },
];

export const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'source_event', label: 'Source Event' },
  { value: 'workflow_event', label: 'Workflow Event' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'status_change', label: 'Status Change' },
  { value: 'external_integration', label: 'External Integration' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'ai_assisted', label: 'AI Assisted' },
];

export const RETURN_BEHAVIORS = [
  { value: 'reopen', label: 'Reopen Task' },
  { value: 'create_corrective_task', label: 'Create Corrective Task' },
  { value: 'notify_only', label: 'Notify Only' },
];

export const TEMPLATE_STATUS_COLORS = {
  'Draft': 'bg-slate-100 text-slate-700 border-slate-300',
  'In Review': 'bg-amber-100 text-amber-700 border-amber-300',
  'Approved': 'bg-blue-100 text-blue-700 border-blue-300',
  'Published': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'Archived': 'bg-gray-100 text-gray-500 border-gray-300',
};

export const WORK_CATEGORY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  operational_interruption: 'bg-orange-100 text-orange-700 border-orange-300',
  high_priority: 'bg-amber-100 text-amber-700 border-amber-300',
  scheduled_primary: 'bg-blue-100 text-blue-700 border-blue-300',
  routine: 'bg-slate-100 text-slate-700 border-slate-300',
  busy_work: 'bg-gray-100 text-gray-600 border-gray-300',
};

export const labelFor = (options, value) => {
  const opt = options.find(o => o.value === value);
  return opt ? opt.label : value || '—';
};

export const TEMPLATE_DEPARTMENTS = ['Warehouse', 'Operations', 'Field Service', 'Customer Service', 'Management', 'Fleet'];