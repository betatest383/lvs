export const TRAINING_TYPES = [
  'Company Foundation',
  'Role Training',
  'SOP Training',
  'Safety Training',
  'Equipment Training',
  'Software Training',
  'Customer Service Training',
  'Management Training',
];

export const TRAINING_STATUSES = [
  'Draft',
  'Under Review',
  'Approved',
  'Published',
  'Needs Update',
  'Retired',
];

export const TRAINING_STATUS_COLORS = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  'Approved': 'bg-blue-100 text-blue-700',
  'Published': 'bg-green-100 text-green-700',
  'Needs Update': 'bg-orange-100 text-orange-700',
  'Retired': 'bg-muted text-muted-foreground',
  // Legacy
  'Active': 'bg-green-100 text-green-700',
};

export const TRAINING_TRANSITIONS = {
  'Draft': ['Under Review', 'Retired'],
  'Under Review': ['Approved', 'Needs Update', 'Draft', 'Retired'],
  'Approved': ['Published', 'Needs Update', 'Retired'],
  'Published': ['Needs Update', 'Retired'],
  'Needs Update': ['Under Review', 'Draft', 'Retired'],
  'Retired': [],
};

// Map target status → required permission key for transitions
// Used by the frontend to show only buttons the user's role can execute
export const TRANSITION_PERMISSIONS = {
  'Under Review': 'submit',
  'Draft': 'submit',
  'Approved': 'approve',
  'Published': 'publish',
  'Needs Update': 'edit',
  'Retired': 'retire',
};

// Role → set of permission keys this role holds for transitions
export const ROLE_TRANSITION_PERMISSIONS = {
  admin: ['submit', 'approve', 'publish', 'edit', 'retire'],
  owner: ['submit', 'approve', 'publish', 'edit', 'retire'],
  director_of_operations: ['submit', 'edit'],
  operations_manager: ['submit', 'edit'],
  warehouse_manager: [],
  warehouse_associate: [],
  inventory_specialist: [],
  office_manager: [],
  lead_technician: [],
  technician: [],
  apprentice: [],
  csr: [],
};

export const ROLE_OPTIONS = [
  { key: 'owner', label: 'Owner' },
  { key: 'director_of_operations', label: 'Director of Operations' },
  { key: 'operations_manager', label: 'Operations Manager' },
  { key: 'office_manager', label: 'Office Manager' },
  { key: 'warehouse_manager', label: 'Warehouse Manager' },
  { key: 'warehouse_associate', label: 'Warehouse Associate' },
  { key: 'inventory_specialist', label: 'Inventory Specialist' },
  { key: 'lead_technician', label: 'Lead Technician' },
  { key: 'technician', label: 'Technician' },
  { key: 'service_technician', label: 'Service Technician' },
  { key: 'apprentice', label: 'Apprentice' },
  { key: 'csr', label: 'CSR' },
];

export const MODULE_ROUTE_OPTIONS = [
  { module: 'sop_registry', route: '/lvcos/sop-registry', label: 'SOP Registry' },
  { module: 'policy_registry', route: '/lvcos/policies/registry', label: 'Policy Registry' },
  { module: 'inventory_master', route: '/inventory/master', label: 'Inventory Master' },
  { module: 'business_process_registry', route: '/lvcos/business-process-registry', label: 'Business Process Registry' },
  { module: 'workflow_registry', route: '/lvcos/workflow-registry', label: 'Workflow Registry' },
  { module: 'form_registry', route: '/lvcos/form-registry', label: 'Form Registry' },
  { module: 'warehouse', route: '/warehouse', label: 'Warehouse' },
  { module: 'fleet', route: '/fleet', label: 'Fleet' },
  { module: 'equipment', route: '/equipment', label: 'Equipment' },
  { module: 'customer', route: '/customer/dashboard', label: 'Customer Portal' },
];

export const TRAINING_REGISTRY_LINK_CONFIG = [
  { field: 'required_roles', entity: 'RoleRegistry', idField: 'role_id', labelField: 'role_name', label: 'Required Roles' },
  { field: 'related_policies', entity: 'PolicyRegistry', idField: 'policy_id', labelField: 'policy_name', label: 'Related Policies' },
  { field: 'related_sops', entity: 'SopRegistry', idField: 'sop_id', labelField: 'title', label: 'Related SOPs' },
  { field: 'related_workflows', entity: 'WorkflowRegistry', idField: 'workflow_id', labelField: 'title', label: 'Related Workflows' },
  { field: 'related_forms', entity: 'FormRegistry', idField: 'form_id', labelField: 'title', label: 'Related Forms' },
  { field: 'related_kpis', entity: 'KpiRegistry', idField: 'kpi_id', labelField: 'title', label: 'Related KPIs' },
  { field: 'related_audits', entity: 'AuditTemplate', idField: 'template_id', labelField: 'template_name', label: 'Related Audits' },
];

export const PROGRESS_STATUS_COLORS = {
  'not_started': 'bg-gray-100 text-gray-700',
  'in_progress': 'bg-amber-100 text-amber-700',
  'completed': 'bg-green-100 text-green-700',
};

export const RENEWAL_FREQUENCY_OPTIONS = [
  'Annual',
  'Semi-Annual',
  'Quarterly',
  'Biennial',
  'On Update',
];

export const TRAINING_TYPE_COLORS = {
  'Company Foundation': 'bg-blue-100 text-blue-700',
  'Role Training': 'bg-purple-100 text-purple-700',
  'SOP Training': 'bg-cyan-100 text-cyan-700',
  'Safety Training': 'bg-red-100 text-red-700',
  'Equipment Training': 'bg-amber-100 text-amber-700',
  'Software Training': 'bg-indigo-100 text-indigo-700',
  'Customer Service Training': 'bg-green-100 text-green-700',
  'Management Training': 'bg-orange-100 text-orange-700',
};

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