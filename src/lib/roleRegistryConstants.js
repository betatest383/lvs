export const DEPARTMENTS = [
  'Warehouse',
  'Operations',
  'Field Service',
  'Customer Service',
  'Sales',
  'Finance',
  'Administration',
  'Management',
  'Fleet',
  'Safety & Compliance',
  'IT',
  'Human Resources',
];

export const PERMISSION_LEVELS = [
  { value: 'view_only', label: 'View Only', description: 'Read-only access, no edits' },
  { value: 'standard', label: 'Standard', description: 'Can create and edit own records' },
  { value: 'elevated', label: 'Elevated', description: 'Can edit records across team' },
  { value: 'manager', label: 'Manager', description: 'Can approve, override, and manage team' },
  { value: 'executive', label: 'Executive', description: 'Full company-wide visibility and approvals' },
  { value: 'admin', label: 'Admin', description: 'Full system access including settings' },
];

export const PERMISSION_LEVEL_COLORS = {
  view_only: 'bg-gray-100 text-gray-700',
  standard: 'bg-blue-100 text-blue-700',
  elevated: 'bg-cyan-100 text-cyan-700',
  manager: 'bg-purple-100 text-purple-700',
  executive: 'bg-amber-100 text-amber-700',
  admin: 'bg-red-100 text-red-700',
};

export const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Draft: 'bg-gray-100 text-gray-700',
  Planned: 'bg-blue-100 text-blue-700',
  Retired: 'bg-muted text-muted-foreground',
};

export const PORTALS = [
  { value: 'admin', label: 'Admin Portal' },
  { value: 'tech', label: 'Technician Portal' },
  { value: 'warehouse', label: 'Warehouse Portal' },
  { value: 'customer', label: 'Customer Portal' },
  { value: 'fleet', label: 'Fleet Portal' },
  { value: 'operations', label: 'Operations Portal' },
];

export const PERMISSION_FLAGS = [
  { key: 'manager_approval_authority', label: 'Manager Approval Authority', description: 'Can approve requests, overrides, and adjustments' },
  { key: 'can_override_readiness', label: 'Can Override Readiness', description: 'Can override WH-105 departure checks' },
  { key: 'can_approve_inventory', label: 'Can Approve Inventory', description: 'Can approve inventory adjustments and transfers' },
  { key: 'can_approve_equipment_assignments', label: 'Can Approve Equipment Assignments', description: 'Can assign and reassign equipment to technicians' },
  { key: 'can_manage_employees', label: 'Can Manage Employees', description: 'Can invite, assign roles, and manage technician records' },
];

export const REGISTRY_LINK_CONFIG = [
  { field: 'business_processes', entity: 'BusinessProcess', idField: 'process_id', labelField: 'title', label: 'Business Processes' },
  { field: 'required_sops', entity: 'SopRegistry', idField: 'sop_id', labelField: 'title', label: 'Required SOPs' },
  { field: 'required_workflows', entity: 'WorkflowRegistry', idField: 'workflow_id', labelField: 'title', label: 'Required Workflows' },
  { field: 'required_forms', entity: 'FormRegistry', idField: 'form_id', labelField: 'title', label: 'Required Forms' },
  { field: 'required_kpis', entity: 'KpiRegistry', idField: 'kpi_id', labelField: 'title', label: 'Required KPIs' },
  { field: 'required_audits', entity: 'AuditTemplate', idField: 'template_id', labelField: 'template_name', label: 'Required Audits' },
];

export const SOFTWARE_OPTIONS = [
  'ServiceTitan',
  'Base44 / LVC OS',
  'Trainual',
  'Google Workspace',
  'Slack',
  'QuickBooks',
  'Stripe',
  'Shopify',
];

export const CERTIFICATION_OPTIONS = [
  'CSIA Certified',
  'NFI Certified',
  'OSHA 10',
  'OSHA 30',
  'Forklift Certification',
  'DOT Medical Card',
  'Driver\'s License (CDL)',
  'Background Check',
  'First Aid / CPR',
  'Chimney Sweep Certification',
];