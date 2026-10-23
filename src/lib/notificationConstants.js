export const NOTIFICATION_TYPES = [
  'Information', 'Reminder', 'Warning', 'Critical', 'Approval Required',
  'Success', 'Failure', 'System', 'Customer', 'Operational', 'Safety', 'Task',
];

export const NOTIFICATION_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const NOTIFICATION_STATUSES = [
  'Pending', 'Sent', 'Delivered', 'Read', 'Acknowledged', 'Resolved', 'Expired', 'Cancelled', 'Failed',
];

export const RESOLUTION_TYPES = [
  'approved',
  'returned_for_correction',
  'completed',
  'cancelled',
  'superseded',
  'expired',
  'no_longer_applicable',
];

export const RESOLUTION_TYPE_LABELS = {
  approved: 'Approved',
  returned_for_correction: 'Returned for Correction',
  completed: 'Completed',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
  expired: 'Expired',
  no_longer_applicable: 'No Longer Applicable',
};

export const RESOLUTION_TYPE_COLORS = {
  approved: 'bg-green-100 text-green-700 border-green-200',
  returned_for_correction: 'bg-orange-100 text-orange-700 border-orange-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  superseded: 'bg-slate-100 text-slate-700 border-slate-200',
  expired: 'bg-gray-200 text-gray-600 border-gray-300',
  no_longer_applicable: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const DELIVERY_METHODS = [
  'In-App', 'Email', 'SMS', 'Push Notification', 'Microsoft Teams', 'Slack',
];

export const DELIVERY_METHOD_STATUS = {
  'In-App': { active: true, label: 'Active' },
  'Email': { active: false, label: 'Planned' },
  'SMS': { active: false, label: 'Planned' },
  'Push Notification': { active: false, label: 'Planned' },
  'Microsoft Teams': { active: false, label: 'Planned' },
  'Slack': { active: false, label: 'Planned' },
};

export const DEPARTMENTS = [
  'Warehouse', 'Field Service', 'Operations', 'Customer Service',
  'Sales', 'Accounting', 'HR', 'IT', 'Safety & Compliance',
  'Training', 'Fleet', 'Continuous Improvement', 'Management',
];

export const SOURCE_MODULES = [
  'Enterprise Tasks', 'Employee Onboarding', 'Training', 'Certification',
  'Policies', 'Equipment', 'Fleet', 'Warehouse', 'Morning Readiness',
  'WH-105 Blocks', 'Management Audits', 'Corrective Actions',
  'Continuous Improvement', 'ServiceTitan Integration', 'Customer Portal',
  'Role Changes', 'Permission Changes', 'Document Review', 'System', 'Manual',
];

export const NOTIFICATION_TYPE_COLORS = {
  'Information': 'bg-blue-100 text-blue-700 border-blue-200',
  'Reminder': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Warning': 'bg-amber-100 text-amber-700 border-amber-200',
  'Critical': 'bg-red-100 text-red-700 border-red-200',
  'Approval Required': 'bg-purple-100 text-purple-700 border-purple-200',
  'Success': 'bg-green-100 text-green-700 border-green-200',
  'Failure': 'bg-red-100 text-red-700 border-red-200',
  'System': 'bg-slate-100 text-slate-700 border-slate-200',
  'Customer': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Operational': 'bg-orange-100 text-orange-700 border-orange-200',
  'Safety': 'bg-pink-100 text-pink-700 border-pink-200',
  'Task': 'bg-teal-100 text-teal-700 border-teal-200',
};

export const NOTIFICATION_STATUS_COLORS = {
  'Pending': 'bg-slate-100 text-slate-700',
  'Sent': 'bg-blue-100 text-blue-700',
  'Delivered': 'bg-cyan-100 text-cyan-700',
  'Read': 'bg-purple-100 text-purple-700',
  'Acknowledged': 'bg-teal-100 text-teal-700',
  'Resolved': 'bg-emerald-100 text-emerald-700',
  'Expired': 'bg-gray-200 text-gray-600',
  'Cancelled': 'bg-red-100 text-red-700',
  'Failed': 'bg-rose-100 text-rose-700',
};

export const PRIORITY_COLORS = {
  'Critical': 'bg-red-100 text-red-700 border-red-200',
  'High': 'bg-orange-100 text-orange-700 border-orange-200',
  'Medium': 'bg-amber-100 text-amber-700 border-amber-200',
  'Low': 'bg-green-100 text-green-700 border-green-200',
};

export const PRIORITY_BORDER = {
  'Critical': '#dc2626',
  'High': '#ea580c',
  'Medium': '#ca8a04',
  'Low': '#16a34a',
};

export const RELATED_FIELDS = [
  { key: 'related_employee', label: 'Employee' },
  { key: 'related_role', label: 'Role' },
  { key: 'related_department', label: 'Department' },
  { key: 'related_customer', label: 'Customer' },
  { key: 'related_job', label: 'Job' },
  { key: 'related_truck', label: 'Truck' },
  { key: 'related_equipment', label: 'Equipment' },
  { key: 'related_task', label: 'Task' },
  { key: 'related_audit', label: 'Audit' },
  { key: 'related_workflow', label: 'Workflow' },
  { key: 'related_sop', label: 'SOP' },
  { key: 'related_policy', label: 'Policy' },
  { key: 'related_certification', label: 'Certification' },
  { key: 'related_training', label: 'Training' },
  { key: 'related_onboarding', label: 'Onboarding' },
];

export const NOTIFICATION_RULES = [
  { module: 'Equipment', trigger: 'Equipment Assigned', recipients: 'Technician, Warehouse Manager', priority: 'High', type: 'Information', requiresAck: false },
  { module: 'Equipment', trigger: 'Equipment Damaged', recipients: 'Warehouse Manager, Operations Manager', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Equipment', trigger: 'Equipment Missing', recipients: 'Warehouse Manager, Operations Manager', priority: 'Critical', type: 'Critical', requiresAck: true },
  { module: 'Certification', trigger: 'Certification expires in 30 days', recipients: 'Employee, Supervisor', priority: 'High', type: 'Reminder', requiresAck: false },
  { module: 'Certification', trigger: 'Certification expired', recipients: 'Employee, Supervisor, HR', priority: 'Critical', type: 'Critical', requiresAck: true },
  { module: 'Morning Readiness', trigger: 'Readiness blocked', recipients: 'Operations Manager, Warehouse', priority: 'Critical', type: 'Critical', requiresAck: false },
  { module: 'WH-105 Blocks', trigger: 'Departure check blocked', recipients: 'Operations Manager, Warehouse Associate', priority: 'Critical', type: 'Operational', requiresAck: false },
  { module: 'Management Audits', trigger: 'Audit failure', recipients: 'Department Manager', priority: 'High', type: 'Failure', requiresAck: false },
  { module: 'Management Audits', trigger: 'Corrective action created', recipients: 'Assigned Employee, Supervisor', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Policies', trigger: 'Policy updated', recipients: 'Required Roles', priority: 'Medium', type: 'Information', requiresAck: true },
  { module: 'Policies', trigger: 'Policy acknowledgment due', recipients: 'All Employees', priority: 'High', type: 'Reminder', requiresAck: true },
  { module: 'Employee Onboarding', trigger: 'Onboarding phase started', recipients: 'New Hire, Supervisor, HR', priority: 'Medium', type: 'Information', requiresAck: false },
  { module: 'Employee Onboarding', trigger: 'Onboarding task overdue', recipients: 'Supervisor, HR', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Training', trigger: 'Training assigned', recipients: 'Employee', priority: 'Medium', type: 'Information', requiresAck: false },
  { module: 'Training', trigger: 'Training overdue', recipients: 'Employee, Supervisor', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Fleet', trigger: 'Vehicle assignment created', recipients: 'Assigned Driver', priority: 'Medium', type: 'Information', requiresAck: false },
  { module: 'Fleet', trigger: 'Shared vehicle overdue', recipients: 'Driver, Operations Manager', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Warehouse', trigger: 'Material return submitted', recipients: 'Warehouse Associate', priority: 'Medium', type: 'Operational', requiresAck: false },
  { module: 'Warehouse', trigger: 'Material return discrepancy', recipients: 'Warehouse Manager, Operations Manager', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'ServiceTitan Integration', trigger: 'Sync failed', recipients: 'IT, Operations Manager', priority: 'High', type: 'Failure', requiresAck: false },
  { module: 'ServiceTitan Integration', trigger: 'Webhook received', recipients: 'IT', priority: 'Low', type: 'System', requiresAck: false },
  { module: 'Continuous Improvement', trigger: 'Improvement submitted', recipients: 'Review Board', priority: 'Low', type: 'Information', requiresAck: false },
  { module: 'Continuous Improvement', trigger: 'Improvement approved', recipients: 'Submitter', priority: 'Medium', type: 'Success', requiresAck: false },
  { module: 'Customer Portal', trigger: 'Job booked', recipients: 'CSR, Dispatcher', priority: 'Medium', type: 'Customer', requiresAck: false },
  { module: 'Customer Portal', trigger: 'Customer message received', recipients: 'CSR', priority: 'High', type: 'Customer', requiresAck: false },
  { module: 'Role Changes', trigger: 'Role changed', recipients: 'Employee, Old Supervisor, New Supervisor', priority: 'High', type: 'Operational', requiresAck: true },
  { module: 'Permission Changes', trigger: 'Permission level changed', recipients: 'Employee, Supervisor', priority: 'High', type: 'Operational', requiresAck: true },
  { module: 'Document Review', trigger: 'Document review due', recipients: 'Document Owner', priority: 'Medium', type: 'Reminder', requiresAck: false },
  { module: 'Enterprise Tasks', trigger: 'Task assigned', recipients: 'Assigned Employee', priority: 'Medium', type: 'Information', requiresAck: false },
  { module: 'Enterprise Tasks', trigger: 'Task overdue', recipients: 'Assigned Employee, Supervisor', priority: 'High', type: 'Warning', requiresAck: false },
  { module: 'Enterprise Tasks', trigger: 'Approval required', recipients: 'Approval Role', priority: 'High', type: 'Approval Required', requiresAck: false },
  { module: 'Safety', trigger: 'Safety alert issued', recipients: 'All Field Staff', priority: 'Critical', type: 'Safety', requiresAck: true },
];

export const PERMISSIONS = [
  { role: 'Employees', canView: 'Own notifications only', canAcknowledge: 'Yes', canCreate: 'No', canManage: 'No' },
  { role: 'Managers', canView: 'Department notifications', canAcknowledge: 'Yes', canCreate: 'Yes', canManage: 'Department only' },
  { role: 'Admin', canView: 'All notifications', canAcknowledge: 'Yes', canCreate: 'Yes', canManage: 'Full access' },
  { role: 'Owner', canView: 'All notifications', canAcknowledge: 'Yes', canCreate: 'Yes', canManage: 'Full access' },
];

export const parseJSON = (str, fallback) => {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
};

export const isUnread = (n) => n.status === 'Sent' || n.status === 'Delivered' || n.status === 'Pending';
export const isCritical = (n) => n.priority === 'Critical' || n.notification_type === 'Critical' || n.notification_type === 'Safety';
export const isToday = (n) => n.created_date && new Date(n.created_date).toDateString() === new Date().toDateString();
export const isResolved = (n) => n.status === 'Resolved' || n.status === 'Expired' || n.status === 'Cancelled';
export const requiresAction = (n) => n.requires_acknowledgment && !isResolved(n) && n.status !== 'Acknowledged';
export const isApproval = (n) => n.notification_type === 'Approval Required';
export const isActionRequired = (n) => n.notification_type === 'Approval Required' || n.requires_acknowledgment;
export const isInformational = (n) => !n.requires_acknowledgment && n.notification_type !== 'Approval Required';
export const isExpired = (n) => n.status === 'Expired' || (n.expiration_date && new Date(n.expiration_date) < new Date() && !isResolved(n));