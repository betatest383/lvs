export const POLICY_TYPES = [
  'Company',
  'HR',
  'Safety',
  'Warehouse',
  'Field Operations',
  'Customer Service',
  'Sales',
  'Accounting',
  'Equipment',
  'Vehicle',
  'Technology',
];

export const ENFORCEMENT_LEVELS = [
  { value: 'Critical', label: 'Critical', description: 'Mandatory compliance — violations result in immediate disciplinary action', color: 'bg-red-100 text-red-700' },
  { value: 'High', label: 'High', description: 'Strict compliance required — violations require formal review', color: 'bg-orange-100 text-orange-700' },
  { value: 'Medium', label: 'Medium', description: 'Compliance expected — deviations should be documented', color: 'bg-amber-100 text-amber-700' },
  { value: 'Low', label: 'Low', description: 'Guideline — best practice recommendation', color: 'bg-blue-100 text-blue-700' },
];

export const ENFORCEMENT_LEVEL_COLORS = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-blue-100 text-blue-700',
};

export const POLICY_STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-muted text-muted-foreground',
};

export const ACK_FREQUENCY_OPTIONS = [
  'Once',
  'Annual',
  'Semi-Annual',
  'Quarterly',
  'On Hire',
  'On Update',
];

export const POLICY_REGISTRY_LINK_CONFIG = [
  { field: 'related_roles', entity: 'RoleRegistry', idField: 'role_id', labelField: 'role_name', label: 'Related Roles' },
  { field: 'related_business_processes', entity: 'BusinessProcess', idField: 'process_id', labelField: 'title', label: 'Related Business Processes' },
  { field: 'related_sops', entity: 'SopRegistry', idField: 'sop_id', labelField: 'title', label: 'Related SOPs' },
  { field: 'related_workflows', entity: 'WorkflowRegistry', idField: 'workflow_id', labelField: 'title', label: 'Related Workflows' },
  { field: 'related_forms', entity: 'FormRegistry', idField: 'form_id', labelField: 'title', label: 'Related Forms' },
  { field: 'related_kpis', entity: 'KpiRegistry', idField: 'kpi_id', labelField: 'title', label: 'Related KPIs' },
  { field: 'related_audits', entity: 'AuditTemplate', idField: 'template_id', labelField: 'template_name', label: 'Related Audits' },
];