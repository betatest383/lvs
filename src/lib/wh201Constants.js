// Equipment catalog for WH-201 Truck Returns Process
export const EQUIPMENT_CATALOG = [
  'Inspection Camera',
  'Grinder',
  'Hammer Drill',
  'Vacuum',
  'Generator',
  'Extension Cord',
  'Battery Charger',
  'Roof Ladder',
  'Extension Ladder',
  'Step Ladder',
  'Roof Brackets',
  'Scaffolding Components',
  'Laser Measure',
  'Hand Tools',
  'Other',
];

export const EQUIPMENT_STATUS_OPTIONS = [
  'Good',
  'Damaged',
  'Needs Repair',
  'Missing',
  'Other',
];

export const WAREHOUSE_ITEM_VERIFICATION_OPTIONS = [
  'Accepted',
  'Damaged',
  'Missing',
  'Needs Manager Review',
];

export const MANAGER_REVIEW_ACTIONS = [
  { value: 'Approved Adjustment', label: 'Approve Adjustment', desc: 'Accept the discrepancy and adjust inventory' },
  { value: 'Inventory Adjustment Created', label: 'Create Inventory Adjustment', desc: 'Adjust inventory levels in ServiceTitan' },
  { value: 'Equipment Repair Ticket Created', label: 'Create Equipment Repair Ticket', desc: 'Generate a repair ticket for damaged equipment' },
  { value: 'Replacement Request Created', label: 'Create Replacement Request', desc: 'Request a replacement for missing/damaged equipment' },
  { value: 'Coaching Task Created', label: 'Assign Employee Coaching', desc: 'Assign coaching task for the technician' },
  { value: 'Investigation Opened', label: 'Open Investigation', desc: 'Open a formal investigation into discrepancies' },
];

// Status flow for WH-201 Truck Returns Process
export const WH201_STATUSES = [
  'Pending Return',
  'Warehouse Reviewing',
  'Verified',
  'Adjusted',
  'Closed',
];

// Legacy status kept for backward compatibility with existing records
export const LEGACY_STATUSES = ['Returned'];