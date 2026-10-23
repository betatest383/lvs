export const EMPLOYMENT_STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Inactive: 'bg-gray-100 text-gray-700',
  'On Leave': 'bg-amber-100 text-amber-700',
  Terminated: 'bg-red-100 text-red-700',
};

export const EMPLOYMENT_TYPE_COLORS = {
  'Full Time': 'bg-blue-100 text-blue-700',
  'Part Time': 'bg-cyan-100 text-cyan-700',
  Seasonal: 'bg-purple-100 text-purple-700',
  Contractor: 'bg-orange-100 text-orange-700',
};

export const EMPLOYMENT_STATUS_OPTIONS = ['Active', 'Inactive', 'On Leave', 'Terminated'];
export const EMPLOYMENT_TYPE_OPTIONS = ['Full Time', 'Part Time', 'Seasonal', 'Contractor'];

export const EMPLOYEE_DETAIL_TABS = [
  'overview',
  'roles',
  'training',
  'certifications',
  'equipment',
  'fleet',
  'sops',
  'policies',
  'audits',
  'corrective_actions',
  'performance',
  'career_path',
  'documents',
  'activity_timeline',
];

export const EMPLOYEE_NAV_ITEMS = [
  { to: '/lvcos/employees', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/lvcos/employees/registry', label: 'Employee Registry', icon: 'List' },
  { to: '/lvcos/employees/role-assignments', label: 'Role Assignments', icon: 'UserCog' },
  { to: '/lvcos/employees/training-status', label: 'Training Status', icon: 'GraduationCap' },
  { to: '/lvcos/employees/certification-status', label: 'Cert Status', icon: 'Award' },
  { to: '/lvcos/employees/equipment', label: 'Equipment', icon: 'Package' },
  { to: '/lvcos/employees/documents', label: 'Documents', icon: 'FileText' },
  { to: '/lvcos/employees/performance', label: 'Performance', icon: 'TrendingUp' },
  { to: '/lvcos/employees/career-path', label: 'Career Path', icon: 'ArrowUpRight' },
  { to: '/lvcos/employees/reports', label: 'Reports', icon: 'BarChart3' },
];