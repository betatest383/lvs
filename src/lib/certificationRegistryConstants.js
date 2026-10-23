export const CERTIFICATION_TYPES = [
  'Safety',
  'Equipment',
  'Technical',
  'Manufacturer',
  'Vehicle',
  'HR',
  'Software',
  'Management',
];

export const CERTIFICATION_STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-muted text-muted-foreground',
};

export const CERTIFICATION_TYPE_COLORS = {
  Safety: 'bg-red-100 text-red-700',
  Equipment: 'bg-amber-100 text-amber-700',
  Technical: 'bg-blue-100 text-blue-700',
  Manufacturer: 'bg-purple-100 text-purple-700',
  Vehicle: 'bg-orange-100 text-orange-700',
  HR: 'bg-pink-100 text-pink-700',
  Software: 'bg-indigo-100 text-indigo-700',
  Management: 'bg-cyan-100 text-cyan-700',
};

export const RENEWAL_FREQUENCY_OPTIONS = [
  'Annual',
  'Semi-Annual',
  'Quarterly',
  'Biennial',
  'Triennial',
  '5-Year',
  'On Update',
];

export const EMPLOYEE_CERT_STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Expired: 'bg-red-100 text-red-700',
  'Expiring Soon': 'bg-amber-100 text-amber-700',
  Pending: 'bg-blue-100 text-blue-700',
  Suspended: 'bg-orange-100 text-orange-700',
  'Not Required': 'bg-muted text-muted-foreground',
};

export const CERTIFICATION_REGISTRY_LINK_CONFIG = [
  { field: 'required_roles', entity: 'RoleRegistry', idField: 'role_id', labelField: 'role_name', label: 'Required Roles' },
  { field: 'related_trainings', entity: 'TrainingRegistry', idField: 'training_id', labelField: 'training_name', label: 'Related Trainings' },
  { field: 'related_policies', entity: 'PolicyRegistry', idField: 'policy_id', labelField: 'policy_name', label: 'Related Policies' },
  { field: 'related_sops', entity: 'SopRegistry', idField: 'sop_id', labelField: 'title', label: 'Related SOPs' },
  { field: 'related_workflows', entity: 'WorkflowRegistry', idField: 'workflow_id', labelField: 'title', label: 'Related Workflows' },
];

// Maps renewal frequency to months
export const FREQUENCY_TO_MONTHS = {
  'Annual': 12,
  'Semi-Annual': 6,
  'Quarterly': 3,
  'Biennial': 24,
  'Triennial': 36,
  '5-Year': 60,
  'On Update': null,
};