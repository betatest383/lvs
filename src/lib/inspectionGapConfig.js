// ─── Gap Review Statuses ──────────────────────────────────────────
export const GAP_STATUSES = {
  new: { label: 'New', color: 'blue', description: 'Newly detected, not yet reviewed' },
  reviewed: { label: 'Reviewed', color: 'cyan', description: 'Reviewed but no action taken yet' },
  accepted: { label: 'Accepted', color: 'amber', description: 'Accepted as a real gap, work pending' },
  deferred: { label: 'Deferred', color: 'orange', description: 'Deferred to a later time' },
  not_applicable: { label: 'Not Applicable', color: 'gray', description: 'Determined to not require action' },
  fixed: { label: 'Fixed', color: 'green', description: 'Resolved — validation now passes' },
};

export const STATUS_ORDER = ['new', 'reviewed', 'accepted', 'deferred', 'not_applicable', 'fixed'];

// ─── Confidence Levels ───────────────────────────────────────────
export const CONFIDENCE_LEVELS = {
  high: { label: 'High', color: 'green', min: 80, description: 'Gap is very likely real' },
  medium: { label: 'Medium', color: 'amber', min: 50, description: 'Gap is likely real, review recommended' },
  low: { label: 'Low', color: 'orange', min: 0, description: 'Automatic classification only, manual review needed' },
};

export const CONFIDENCE_ORDER = ['high', 'medium', 'low'];

// ─── Departments ──────────────────────────────────────────────────
export const DEPARTMENTS = [
  'Inspection Engineering',
  'Estimating',
  'Warehouse',
  'Fleet',
  'Operations',
  'IT / Systems',
];

// ─── Impact Systems for Gap Preview ──────────────────────────────
export const GAP_IMPACT_SYSTEMS = [
  { key: 'inspection', label: 'Inspection', always: true },
  { key: 'customer_pdf', label: 'Customer PDF' },
  { key: 'internal_report', label: 'Internal Report' },
  { key: 'logic_rules', label: 'Logic Rules' },
  { key: 'repair_system', label: 'Repair System' },
  { key: 'estimate_engine', label: 'Estimate Engine' },
  { key: 'material_calculator', label: 'Material Calculator' },
  { key: 'scope_of_work', label: 'Scope of Work' },
  { key: 'scheduling', label: 'Scheduling' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'job_hub', label: 'Job Hub' },
  { key: 'analytics', label: 'Analytics' },
];