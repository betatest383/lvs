export const ONBOARDING_STATUSES = [
  'Planned', 'In Progress', 'Waiting', 'Completed', 'On Hold', 'Cancelled',
];

export const ONBOARDING_STATUS_COLORS = {
  'Planned': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Waiting': 'bg-purple-100 text-purple-700',
  'Completed': 'bg-green-100 text-green-700',
  'On Hold': 'bg-orange-100 text-orange-700',
  'Cancelled': 'bg-red-100 text-red-700',
};

export const ONBOARDING_PHASES = [
  { phase: 1, name: 'Pre-Hire', icon: 'UserPlus', description: 'Employee record, role, supervisor, background check' },
  { phase: 2, name: 'System Setup', icon: 'Monitor', description: 'Base44, Trainual, ServiceTitan, M365, RingCentral, Paychex' },
  { phase: 3, name: 'Training', icon: 'GraduationCap', description: 'Required training from Training Registry' },
  { phase: 4, name: 'Policies', icon: 'Shield', description: 'Policies requiring acknowledgment' },
  { phase: 5, name: 'Certifications', icon: 'Award', description: 'Required certifications' },
  { phase: 6, name: 'Equipment', icon: 'Package', description: 'Equipment package and temporary equipment' },
  { phase: 7, name: 'Fleet', icon: 'Truck', description: 'Truck, fuel card, fleet documents' },
  { phase: 8, name: 'Dept Training', icon: 'BookOpen', description: 'Required SOPs and workflows' },
  { phase: 9, name: 'Manager Review', icon: 'ClipboardCheck', description: '30, 60, and 90-day reviews' },
];

export const PHASE_FIELDS = {
  1: 'phase1_pre_hire',
  2: 'phase2_system_setup',
  3: 'phase3_training',
  4: 'phase4_policies',
  5: 'phase5_certifications',
  6: 'phase6_equipment',
  7: 'phase7_fleet',
  8: 'phase8_dept_training',
  9: 'phase9_reviews',
};

export const PHASE_TYPES = {
  1: 'simple',
  2: 'simple',
  3: 'training',
  4: 'policy',
  5: 'certification',
  6: 'equipment',
  7: 'simple',
  8: 'simple',
  9: 'review',
};

export const PHASE1_ITEMS = [
  'Employee Record Created',
  'Role Assigned',
  'Supervisor Assigned',
  'Offer Accepted',
  'Background Check',
  'Drug Screen (optional)',
  'Driver License Verified (if required)',
];

export const PHASE2_ITEMS = [
  'Base44 Role',
  'Trainual',
  'ServiceTitan',
  'Microsoft 365',
  'RingCentral',
  'Paychex',
  'Required Software',
];

export const PHASE7_ITEMS = [
  'Truck Assigned',
  'Fuel Card Issued',
  'Fleet Documents',
];

export const REVIEW_TYPES = [
  { type: '30-Day Review', days: 30 },
  { type: '60-Day Review', days: 60 },
  { type: '90-Day Review', days: 90 },
];

export const TASK_DEPARTMENTS = ['HR', 'Operations', 'Warehouse', 'IT', 'Training', 'Supervisor'];

export const DEFAULT_TASKS = [
  { task: 'Create Microsoft Account', department: 'IT' },
  { task: 'Assign Phone', department: 'HR' },
  { task: 'Assign Tablet', department: 'HR' },
  { task: 'Assign Uniforms', department: 'HR' },
  { task: 'Assign Keys', department: 'HR' },
  { task: 'Assign Truck', department: 'Operations', fleetOnly: true },
  { task: 'Issue Fuel Card', department: 'Operations', fleetOnly: true },
  { task: 'Assign Equipment', department: 'Warehouse' },
  { task: 'Assign Software', department: 'IT' },
  { task: 'Schedule Training', department: 'Training' },
  { task: 'Assign SOPs', department: 'Training' },
  { task: 'Assign Certifications', department: 'Supervisor' },
];

export const TASK_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-amber-100 text-amber-700',
  complete: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
};

export const parseJSON = (str, fallback) => {
  if (!str) return fallback;
  if (Array.isArray(str) || typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
};

export const calcCompletionPct = (record) => {
  if (!record) return 0;
  let total = 0, completed = 0;
  Object.values(PHASE_FIELDS).forEach(f => {
    const items = parseJSON(record[f], []);
    total += items.length;
    completed += items.filter(i => i.completed).length;
  });
  const tasks = parseJSON(record.tasks, []);
  total += tasks.length;
  completed += tasks.filter(t => t.status === 'complete').length;
  return total > 0 ? Math.round((completed / total) * 100) : 0;
};

export const generateOnboardingId = () => `ONB-${String(Date.now()).slice(-6)}`;