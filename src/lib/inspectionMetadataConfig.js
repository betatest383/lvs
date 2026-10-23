// ─── Question Purpose Definitions ─────────────────────────────────
// Each purpose classifies WHY a question exists in the inspection system.
// Used by the Outputs tab, Matrix, and Gap Review for filtering and analysis.

export const QUESTION_PURPOSES = {
  safety: {
    label: 'Safety',
    color: 'red',
    description: 'Used to identify unsafe conditions.',
  },
  nfpa_code_compliance: {
    label: 'NFPA / Code Compliance',
    color: 'blue',
    description: 'Used to determine compliance failures or warnings.',
  },
  documentation: {
    label: 'Documentation',
    color: 'gray',
    description: 'Used to document the inspection record.',
  },
  customer_education: {
    label: 'Customer Education',
    color: 'cyan',
    description: 'Used to explain findings to the customer.',
  },
  estimate_generation: {
    label: 'Estimate Generation',
    color: 'orange',
    description: 'Used to create estimate recommendations.',
  },
  material_calculation: {
    label: 'Material Calculation',
    color: 'amber',
    description: 'Used to calculate materials or quantities.',
  },
  repair_recommendation: {
    label: 'Repair Recommendation',
    color: 'purple',
    description: 'Used to group findings into repair systems.',
  },
  before_after_gallery: {
    label: 'Before / After Gallery',
    color: 'pink',
    description: 'Used in before/after documentation.',
  },
  internal_technician_notes: {
    label: 'Internal Technician Notes',
    color: 'indigo',
    description: 'Used internally only.',
  },
  sales_opportunity: {
    label: 'Sales Opportunity',
    color: 'green',
    description: 'Used to identify memberships, upgrades, warranties, or add-ons.',
  },
  warranty: {
    label: 'Warranty',
    color: 'teal',
    description: 'Used to identify warranty relevance.',
  },
  membership: {
    label: 'Membership',
    color: 'lime',
    description: 'Used for membership-related workflow.',
  },
  scheduling: {
    label: 'Scheduling',
    color: 'cyan',
    description: 'Used to support scheduling decisions.',
  },
  warehouse_planning: {
    label: 'Warehouse Planning',
    color: 'amber',
    description: 'Used to help warehouse stage work.',
  },
  fleet_planning: {
    label: 'Fleet Planning',
    color: 'orange',
    description: 'Used to determine vehicle or equipment resource needs.',
  },
  analytics: {
    label: 'Analytics',
    color: 'blue',
    description: 'Used for reporting, trends, quality control, or production analysis.',
  },
  administrative: {
    label: 'Administrative',
    color: 'gray',
    description: 'Used for internal tracking only.',
  },
};

export const PURPOSE_ORDER = [
  'safety', 'nfpa_code_compliance', 'documentation', 'customer_education',
  'estimate_generation', 'material_calculation', 'repair_recommendation',
  'before_after_gallery', 'internal_technician_notes', 'sales_opportunity',
  'warranty', 'membership', 'scheduling', 'warehouse_planning',
  'fleet_planning', 'analytics', 'administrative',
];

// ─── Question Category Definitions ────────────────────────────────
// Groups related questions together regardless of form placement.

export const QUESTION_CATEGORIES = [
  'Clearance to Combustibles',
  'Chimney Crown',
  'Chimney Cap',
  'Chase Cover',
  'Flashing',
  'Brick / Masonry',
  'Mortar Joints',
  'Chimney Liner',
  'Smoke Chamber',
  'Firebox',
  'Damper',
  'Hearth Extension',
  'Appliance Venting',
  'Wood Stove',
  'Gas Appliance',
  'Pellet Appliance',
  'Boiler / Furnace Venting',
  'Water Intrusion',
  'Animal Entry',
  'Structural Stability',
  'Roof Access',
  'Safety Equipment',
  'Customer Concern',
  'Measurements',
  'Photos',
  'Administrative',
];

// ─── Output Destination Groups ────────────────────────────────────
// Used by the Outputs tab to organize columns into logical sections.

export const OUTPUT_GROUPS = {
  pdf_reports: {
    label: 'PDF / Reports',
    color: 'blue',
    fields: [
      { key: 'customer_pdf', label: 'Customer PDF' },
      { key: 'internal_notes', label: 'Internal Report' },
      { key: 'inspection_summary', label: 'Inspection Summary' },
      { key: 'customer_summary', label: 'Customer Summary' },
    ],
  },
  photos_gallery: {
    label: 'Photos / Gallery',
    color: 'purple',
    fields: [
      { key: 'photo_required', label: 'Photo Required' },
      { key: 'photo_customer_pdf', label: 'Customer PDF Photo' },
      { key: 'produces_gallery', label: 'Before Gallery' },
      { key: 'produces_gallery', label: 'After Gallery' },
      { key: 'photo_internal_only', label: 'Internal Only' },
      { key: 'customer_facing', label: 'Customer Presentation' },
    ],
  },
  nfpa_code: {
    label: 'NFPA / Code',
    color: 'red',
    fields: [
      { key: 'nfpa_211_question', label: 'NFPA 211 Required' },
      { key: 'pass_fail', label: 'Code Failure Trigger' },
      { key: 'safety_concern', label: 'Safety Concern Trigger' },
      { key: 'critical_failure', label: 'Critical Failure Trigger' },
      { key: 'inspection_level', label: 'Inspection Level' },
    ],
  },
  repair_engine: {
    label: 'Repair Engine',
    color: 'purple',
    fields: [
      { key: 'produces_findings', label: 'Creates Finding' },
      { key: 'repair_system', label: 'Repair System' },
      { key: 'recommendation_trigger', label: 'Recommendation Trigger' },
      { key: 'confidence_contribution', label: 'Confidence Contribution' },
      { key: 'good_better_best', label: 'Good / Better / Best Mapping' },
    ],
  },
  material_engine: {
    label: 'Material Engine',
    color: 'amber',
    fields: [
      { key: 'feeds_material_calculator', label: 'Feeds Material Calculator' },
      { key: 'calculation_input_field', label: 'Measurement Inputs' },
      { key: 'calculation_formula', label: 'Formula' },
      { key: 'calculation_output_field', label: 'Output Material' },
    ],
  },
  estimate_engine: {
    label: 'Estimate Engine',
    color: 'orange',
    fields: [
      { key: 'creates_recommendation', label: 'Creates Estimate Recommendation' },
      { key: 'pricebook_mapping', label: 'Suggested Pricebook Item' },
      { key: 'creates_option_group', label: 'Option Group' },
      { key: 'customer_facing', label: 'Customer-Facing Text' },
      { key: 'estimate_internal_only', label: 'Internal-Only Text' },
    ],
  },
  workflow: {
    label: 'Workflow',
    color: 'indigo',
    fields: [
      { key: 'workflow_job_hub', label: 'Job Hub' },
      { key: 'workflow_timeline', label: 'Timeline' },
      { key: 'workflow_scope_of_work', label: 'Scope of Work' },
      { key: 'workflow_scheduling', label: 'Scheduling' },
      { key: 'workflow_warehouse', label: 'Warehouse' },
      { key: 'workflow_fleet', label: 'Fleet' },
      { key: 'workflow_inspection', label: 'Technician Morning Workflow' },
      { key: 'workflow_analytics', label: 'Analytics' },
    ],
  },
};

// ─── Impact Analysis Systems ──────────────────────────────────────
// When a question changes, these systems may be affected.

export const IMPACT_SYSTEMS = [
  { key: 'logic_rules', label: 'Logic Rules', field: 'logic_source', condition: (e) => e.logic_source !== 'none' },
  { key: 'pdf_report', label: 'PDF Report', field: 'customer_pdf', condition: (e) => e.customer_pdf !== 'hide' },
  { key: 'photo_gallery', label: 'Photo Gallery', field: 'produces_gallery', condition: (e) => e.produces_gallery },
  { key: 'nfpa_code', label: 'NFPA / Code Output', field: 'nfpa_211_question', condition: (e) => e.nfpa_211_question },
  { key: 'repair_system', label: 'Repair System', field: 'repair_system', condition: (e) => e.repair_system && e.repair_system !== 'none' },
  { key: 'estimate_recommendation', label: 'Estimate Recommendation', field: 'estimate_recommendation', condition: (e) => e.estimate_recommendation },
  { key: 'material_calculation', label: 'Material Calculation', field: 'feeds_material_calculator', condition: (e) => e.feeds_material_calculator },
  { key: 'scope_of_work', label: 'Scope of Work', field: 'workflow_scope_of_work', condition: (e) => e.workflow_scope_of_work },
  { key: 'scheduling', label: 'Scheduling', field: 'workflow_scheduling', condition: (e) => e.workflow_scheduling },
  { key: 'warehouse', label: 'Warehouse', field: 'workflow_warehouse', condition: (e) => e.workflow_warehouse },
  { key: 'fleet', label: 'Fleet', field: 'workflow_fleet', condition: (e) => e.workflow_fleet },
  { key: 'job_hub', label: 'Job Hub', field: 'workflow_job_hub', condition: (e) => e.workflow_job_hub },
  { key: 'analytics', label: 'Analytics', field: 'workflow_analytics', condition: (e) => e.workflow_analytics },
];

// ─── Color maps ───────────────────────────────────────────────────

export const PURPOSE_COLOR = {
  safety: 'bg-red-100 text-red-700',
  nfpa_code_compliance: 'bg-blue-100 text-blue-700',
  documentation: 'bg-gray-100 text-gray-600',
  customer_education: 'bg-cyan-100 text-cyan-700',
  estimate_generation: 'bg-orange-100 text-orange-700',
  material_calculation: 'bg-amber-100 text-amber-700',
  repair_recommendation: 'bg-purple-100 text-purple-700',
  before_after_gallery: 'bg-pink-100 text-pink-700',
  internal_technician_notes: 'bg-indigo-100 text-indigo-700',
  sales_opportunity: 'bg-green-100 text-green-700',
  warranty: 'bg-teal-100 text-teal-700',
  membership: 'bg-lime-100 text-lime-700',
  scheduling: 'bg-cyan-100 text-cyan-700',
  warehouse_planning: 'bg-amber-100 text-amber-700',
  fleet_planning: 'bg-orange-100 text-orange-700',
  analytics: 'bg-blue-100 text-blue-700',
  administrative: 'bg-gray-100 text-gray-600',
};

export const CATEGORY_COLOR = {
  'Clearance to Combustibles': 'bg-red-100 text-red-700',
  'Chimney Crown': 'bg-amber-100 text-amber-700',
  'Chimney Cap': 'bg-purple-100 text-purple-700',
  'Chase Cover': 'bg-purple-100 text-purple-700',
  'Flashing': 'bg-orange-100 text-orange-700',
  'Brick / Masonry': 'bg-stone-100 text-stone-700',
  'Mortar Joints': 'bg-stone-100 text-stone-700',
  'Chimney Liner': 'bg-blue-100 text-blue-700',
  'Smoke Chamber': 'bg-indigo-100 text-indigo-700',
  'Firebox': 'bg-red-100 text-red-700',
  'Damper': 'bg-gray-100 text-gray-600',
  'Hearth Extension': 'bg-red-100 text-red-700',
  'Appliance Venting': 'bg-cyan-100 text-cyan-700',
  'Wood Stove': 'bg-orange-100 text-orange-700',
  'Gas Appliance': 'bg-blue-100 text-blue-700',
  'Pellet Appliance': 'bg-amber-100 text-amber-700',
  'Boiler / Furnace Venting': 'bg-cyan-100 text-cyan-700',
  'Water Intrusion': 'bg-blue-100 text-blue-700',
  'Animal Entry': 'bg-green-100 text-green-700',
  'Structural Stability': 'bg-red-100 text-red-700',
  'Roof Access': 'bg-gray-100 text-gray-600',
  'Safety Equipment': 'bg-red-100 text-red-700',
  'Customer Concern': 'bg-pink-100 text-pink-700',
  'Measurements': 'bg-amber-100 text-amber-700',
  'Photos': 'bg-purple-100 text-purple-700',
  'Administrative': 'bg-gray-100 text-gray-600',
};