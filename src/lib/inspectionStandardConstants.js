/**
 * Inspection Standards Library — Constants & Configuration
 * The InspectionStandard entity is the single source of truth for inspection criteria,
 * authority references, customer education, technician guidance, and repair recommendations.
 */

export const STANDARD_STATUSES = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  in_review: { label: 'In Review', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  retired: { label: 'Retired', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

export const STATUS_ORDER = ['draft', 'in_review', 'approved', 'retired'];

export const STANDARD_CATEGORIES = [
  'Clearance to Combustibles',
  'Chimney Crown',
  'Smoke Chamber',
  'Firebox',
  'Chimney Liner',
  'Masonry',
  'Flashing',
  'Chimney Cap',
  'Chase Cover',
  'Appliance Venting',
  'Water Intrusion',
  'Animal Entry',
  'Structural Stability',
  'Damper',
  'Hearth Extension',
  'Other',
];

export const APPLIES_TO_OPTIONS = [
  'Wood Fireplace',
  'Wood Stove',
  'Pellet Stove',
  'Gas Fireplace',
  'Gas Insert',
  'Gas Boiler',
  'Oil Boiler',
  'Commercial',
  'Universal',
];

export const AUTHORITY_OPTIONS = [
  'NFPA 211',
  'IRC',
  'IFGC',
  'IMC',
  'NEC',
  'Manufacturer Installation Manual',
  'UL Listing',
  'ASTM',
  'OSHA',
  'Local Building Code',
  'State Code',
  'Insurance Requirement',
  'Company Best Practice',
  'Internal Quality Standard',
  'Industry Recommendation',
  'Customer Requested Standard',
];

export const AUTHORITY_COLORS = {
  'NFPA 211': 'bg-red-100 text-red-700',
  'IRC': 'bg-blue-100 text-blue-700',
  'IFGC': 'bg-cyan-100 text-cyan-700',
  'IMC': 'bg-teal-100 text-teal-700',
  'NEC': 'bg-amber-100 text-amber-700',
  'Manufacturer Installation Manual': 'bg-purple-100 text-purple-700',
  'UL Listing': 'bg-indigo-100 text-indigo-700',
  'ASTM': 'bg-violet-100 text-violet-700',
  'OSHA': 'bg-orange-100 text-orange-700',
  'Local Building Code': 'bg-stone-100 text-stone-700',
  'State Code': 'bg-slate-100 text-slate-700',
  'Insurance Requirement': 'bg-pink-100 text-pink-700',
  'Company Best Practice': 'bg-green-100 text-green-700',
  'Internal Quality Standard': 'bg-emerald-100 text-emerald-700',
  'Industry Recommendation': 'bg-sky-100 text-sky-700',
  'Customer Requested Standard': 'bg-fuchsia-100 text-fuchsia-700',
};

export const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-green-100 text-green-700' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
];

export const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

export const INSPECTION_LEVEL_OPTIONS = [
  { value: 'level_1', label: 'Level 1' },
  { value: 'level_2', label: 'Level 2' },
  { value: 'level_3', label: 'Level 3' },
];

export const REPAIR_SYSTEM_OPTIONS = [
  'crown',
  'masonry',
  'liner',
  'smoke_chamber',
  'cap_chase',
  'other',
  'none',
];

export const LABOR_DIFFICULTY_OPTIONS = ['Easy', 'Moderate', 'Difficult', 'Complex', 'Expert'];

export const RISK_FLAGS = [
  { key: 'safety_concern', label: 'Safety Concern', color: 'bg-red-50 border-red-200' },
  { key: 'code_failure', label: 'Code Failure', color: 'bg-orange-50 border-orange-200' },
  { key: 'insurance_concern', label: 'Insurance Concern', color: 'bg-blue-50 border-blue-200' },
  { key: 'warranty_concern', label: 'Warranty Concern', color: 'bg-purple-50 border-purple-200' },
  { key: 'structural_concern', label: 'Structural Concern', color: 'bg-stone-50 border-stone-200' },
  { key: 'water_intrusion', label: 'Water Intrusion', color: 'bg-cyan-50 border-cyan-200' },
  { key: 'fire_hazard', label: 'Fire Hazard', color: 'bg-red-50 border-red-300' },
  { key: 'carbon_monoxide_hazard', label: 'Carbon Monoxide Hazard', color: 'bg-gray-50 border-gray-300' },
  { key: 'life_safety_hazard', label: 'Life Safety Hazard', color: 'bg-red-100 border-red-400' },
];

/**
 * Tab definitions for the Standard Form Dialog.
 * Each field has: key, label, type, and optional flags.
 * Types: text, textarea, select, multiselect, boolean, number, date, authority_editor, risk_flags
 */
export const STANDARD_TABS = [
  {
    key: 'general',
    label: 'General',
    fields: [
      { key: 'standard_name', label: 'Standard Name', type: 'text', required: true, full: true, placeholder: 'e.g. Clearance to Combustibles — NFPA 211' },
      { key: 'standard_number', label: 'Standard Number', type: 'text', placeholder: 'e.g. NFPA-211-13.1.1' },
      { key: 'version', label: 'Version', type: 'text', placeholder: '1.0' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_ORDER.map(s => ({ value: s, label: STANDARD_STATUSES[s].label })) },
      { key: 'category', label: 'Category', type: 'select', options: STANDARD_CATEGORIES },
      { key: 'inspection_level', label: 'Inspection Level', type: 'select', options: INSPECTION_LEVEL_OPTIONS },
      { key: 'applies_to', label: 'Applies To', type: 'multiselect', options: APPLIES_TO_OPTIONS, full: true },
    ],
  },
  {
    key: 'authority',
    label: 'Authority',
    fields: [
      { key: 'authority_level', label: 'Authority Level', type: 'multiselect', options: AUTHORITY_OPTIONS, full: true },
      { key: 'authority_details', label: 'Authority References', type: 'authority_editor', full: true },
    ],
  },
  {
    key: 'criteria',
    label: 'Criteria',
    fields: [
      { key: 'pass_criteria', label: 'Pass Criteria', type: 'textarea', full: true },
      { key: 'warning_criteria', label: 'Warning Criteria', type: 'textarea', full: true },
      { key: 'fail_criteria', label: 'Fail Criteria', type: 'textarea', full: true },
      { key: 'critical_failure_criteria', label: 'Critical Failure Criteria', type: 'textarea', full: true },
      { key: 'na_criteria', label: 'N/A Criteria', type: 'textarea', full: true },
      { key: 'measurement_tolerances', label: 'Measurement Tolerances', type: 'textarea' },
      { key: 'photo_requirements', label: 'Photo Requirements', type: 'textarea' },
      { key: 'measurement_requirements', label: 'Measurement Requirements', type: 'textarea' },
      { key: 'required_supporting_evidence', label: 'Required Supporting Evidence', type: 'textarea', full: true },
      { key: 'minimum_value', label: 'Minimum Value (for logic rules)', type: 'number' },
      { key: 'maximum_value', label: 'Maximum Value (for logic rules)', type: 'number' },
      { key: 'target_value', label: 'Target Value', type: 'number' },
      { key: 'unit_of_measure', label: 'Unit of Measure', type: 'text', placeholder: 'inches, feet, sq_ft' },
    ],
  },
  {
    key: 'technician',
    label: 'Technician',
    fields: [
      { key: 'inspection_procedure', label: 'Inspection Procedure', type: 'textarea', full: true },
      { key: 'how_to_inspect', label: 'How To Inspect', type: 'textarea', full: true },
      { key: 'measurement_instructions', label: 'Measurement Instructions', type: 'textarea', full: true },
      { key: 'photo_instructions', label: 'Photo Instructions', type: 'textarea', full: true },
      { key: 'required_documentation', label: 'Required Documentation', type: 'textarea', full: true },
      { key: 'common_defects', label: 'Common Defects', type: 'textarea', full: true },
      { key: 'common_causes', label: 'Common Causes', type: 'textarea', full: true },
      { key: 'safety_considerations', label: 'Safety Considerations', type: 'textarea', full: true },
      { key: 'troubleshooting_tips', label: 'Troubleshooting Tips', type: 'textarea', full: true },
      { key: 'technician_notes', label: 'Technician Notes', type: 'textarea', full: true },
    ],
  },
  {
    key: 'customer',
    label: 'Customer',
    fields: [
      { key: 'customer_explanation', label: 'Customer Explanation', type: 'textarea', full: true },
      { key: 'why_this_matters', label: 'Why This Matters', type: 'textarea', full: true },
      { key: 'potential_risks', label: 'Potential Risks', type: 'textarea', full: true },
      { key: 'consequences_if_ignored', label: 'Consequences If Ignored', type: 'textarea', full: true },
      { key: 'recommended_maintenance', label: 'Recommended Maintenance', type: 'textarea', full: true },
      { key: 'faq', label: 'Frequently Asked Questions', type: 'textarea', full: true },
      { key: 'customer_friendly_language', label: 'Customer-Friendly Language', type: 'textarea', full: true },
    ],
  },
  {
    key: 'repair',
    label: 'Repair',
    fields: [
      { key: 'default_repair_system', label: 'Default Repair System', type: 'select', options: REPAIR_SYSTEM_OPTIONS.map(r => ({ value: r, label: r })) },
      { key: 'possible_repair_systems', label: 'Possible Repair Systems', type: 'multiselect', options: REPAIR_SYSTEM_OPTIONS, full: true },
      { key: 'good_option', label: 'Good Option', type: 'text', full: true },
      { key: 'better_option', label: 'Better Option', type: 'text', full: true },
      { key: 'best_option', label: 'Best Option', type: 'text', full: true },
      { key: 'recommended_pricebook_categories', label: 'Recommended Pricebook Categories', type: 'textarea', full: true },
      { key: 'suggested_material_calc_template', label: 'Suggested Material Calculation Template', type: 'textarea', full: true },
      { key: 'suggested_scope_of_work_template', label: 'Suggested Scope of Work Template', type: 'textarea', full: true },
      { key: 'typical_labor_difficulty', label: 'Typical Labor Difficulty', type: 'select', options: LABOR_DIFFICULTY_OPTIONS.map(d => ({ value: d, label: d })) },
    ],
  },
  {
    key: 'risk',
    label: 'Risk',
    fields: [
      { key: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS },
      { key: 'risk_flags', label: 'Risk Classification Flags', type: 'risk_flags', full: true },
    ],
  },
  {
    key: 'version',
    label: 'Version Control',
    fields: [
      { key: 'created_by', label: 'Created By', type: 'text' },
      { key: 'reviewed_by', label: 'Reviewed By', type: 'text' },
      { key: 'approved_by', label: 'Approved By', type: 'text' },
      { key: 'approval_date', label: 'Approval Date', type: 'date' },
      { key: 'revision_history', label: 'Revision History', type: 'textarea', full: true, placeholder: 'Auto-maintained — JSON array of { version, date, author, changes }' },
    ],
  },
];

export const CATEGORY_COLORS = {
  'Clearance to Combustibles': 'bg-red-100 text-red-700',
  'Chimney Crown': 'bg-amber-100 text-amber-700',
  'Smoke Chamber': 'bg-orange-100 text-orange-700',
  'Firebox': 'bg-stone-100 text-stone-700',
  'Chimney Liner': 'bg-blue-100 text-blue-700',
  'Masonry': 'bg-yellow-100 text-yellow-700',
  'Flashing': 'bg-cyan-100 text-cyan-700',
  'Chimney Cap': 'bg-purple-100 text-purple-700',
  'Chase Cover': 'bg-violet-100 text-violet-700',
  'Appliance Venting': 'bg-pink-100 text-pink-700',
  'Water Intrusion': 'bg-sky-100 text-sky-700',
  'Animal Entry': 'bg-green-100 text-green-700',
  'Structural Stability': 'bg-indigo-100 text-indigo-700',
  'Damper': 'bg-teal-100 text-teal-700',
  'Hearth Extension': 'bg-lime-100 text-lime-700',
  'Other': 'bg-gray-100 text-gray-600',
};

export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-600';
}

export function getAuthorityColor(auth) {
  return AUTHORITY_COLORS[auth] || 'bg-gray-100 text-gray-600';
}

export function formatAuthorityRef(standard) {
  if (!standard) return '';
  const authorities = standard.authority_level || [];
  if (authorities.length === 0) return '';
  return authorities.join(', ');
}