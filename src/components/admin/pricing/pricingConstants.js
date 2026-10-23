export const CATEGORY_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

export const MODIFIER_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'testing', label: 'Testing' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals' },
  { value: 'does_not_equal', label: 'Does Not Equal' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'greater_than_or_equal', label: 'Greater Than or Equal' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'less_than_or_equal', label: 'Less Than or Equal' },
  { value: 'between', label: 'Between' },
  { value: 'contains', label: 'Contains' },
  { value: 'selected', label: 'Selected / True' },
  { value: 'quantity_greater_than', label: 'Quantity Greater Than' },
  { value: 'always', label: 'Always Applies' },
];

export const CALCULATION_METHOD_OPTIONS = [
  { value: 'fixed_amount', label: 'Fixed Amount ($)' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'multiplier', label: 'Multiplier' },
  { value: 'hourly', label: 'Hourly Rate' },
  { value: 'daily', label: 'Daily Rate' },
  { value: 'per_unit', label: 'Per Unit' },
  { value: 'cost_plus_markup', label: 'Cost Plus Markup (%)' },
  { value: 'replace_price', label: 'Replace Price' },
  { value: 'minimum_charge', label: 'Minimum Charge' },
  { value: 'maximum_charge', label: 'Maximum Charge' },
];

export const APPLIES_TO_OPTIONS = [
  { value: 'labor_price', label: 'Labor Price' },
  { value: 'material_price', label: 'Material Price' },
  { value: 'equipment_price', label: 'Equipment Price' },
  { value: 'subcontractor_price', label: 'Subcontractor Price' },
  { value: 'total_selling_price', label: 'Total Selling Price' },
  { value: 'estimated_hours', label: 'Estimated Hours' },
  { value: 'labor_cost', label: 'Labor Cost' },
  { value: 'equipment_cost', label: 'Equipment Cost' },
  { value: 'total_job_cost', label: 'Total Job Cost' },
  { value: 'commissionable_revenue', label: 'Commissionable Revenue' },
  { value: 'specific_service', label: 'Specific Service' },
  { value: 'service_category', label: 'Service Category' },
  { value: 'entire_estimate', label: 'Entire Estimate' },
];

export const STACKING_METHOD_OPTIONS = [
  { value: 'additive', label: 'Additive' },
  { value: 'compound', label: 'Compound' },
  { value: 'highest_only', label: 'Highest Only' },
  { value: 'lowest_only', label: 'Lowest Only' },
  { value: 'mutually_exclusive', label: 'Mutually Exclusive' },
  { value: 'replace_existing', label: 'Replace Existing' },
  { value: 'first_match_only', label: 'First Match Only' },
];

export const SOURCE_FIELD_OPTIONS = [
  { value: 'scope.roof_pitch', label: 'Roof Pitch' },
  { value: 'scope.project_days', label: 'Project Days' },
  { value: 'scope.estimated_hours', label: 'Estimated Hours' },
  { value: 'scope.lead_technician_quantity', label: 'Lead Technician Quantity' },
  { value: 'scope.apprentice_quantity', label: 'Apprentice Quantity' },
  { value: 'scope.mason_quantity', label: 'Mason Quantity' },
  { value: 'scope.scaffold_required', label: 'Scaffold Required' },
  { value: 'scope.lift_required', label: 'Lift Required' },
  { value: 'scope.additional_vehicle_required', label: 'Additional Vehicle Required' },
  { value: 'scope.access_condition', label: 'Access Condition' },
  { value: 'scope.story_count', label: 'Story Count' },
  { value: 'scope.job_conditions', label: 'Job Conditions' },
  { value: 'scope.staging_sequence', label: 'Staging Sequence' },
  { value: 'always', label: 'Always (No Trigger Field)' },
];

export const ICON_OPTIONS = [
  'Home', 'Building', 'Building2', 'Truck', 'Wrench', 'Users', 'Calendar',
  'DollarSign', 'Percent', 'Clock', 'Package', 'AlertTriangle', 'TrendingUp',
  'Tag', 'Gift', 'Mountain', 'HardHat', 'Car', 'Zap', 'Shield', 'Star',
];

export const SIMULATOR_SCOPE_FIELDS = [
  { key: 'scope.roof_pitch', label: 'Roof Pitch', type: 'text', placeholder: 'e.g. 12/12' },
  { key: 'scope.estimated_hours', label: 'Estimated Hours', type: 'number' },
  { key: 'scope.project_days', label: 'Project Days', type: 'number' },
  { key: 'scope.lead_technician_quantity', label: 'Lead Tech Qty', type: 'number' },
  { key: 'scope.apprentice_quantity', label: 'Apprentice Qty', type: 'number' },
  { key: 'scope.mason_quantity', label: 'Mason Qty', type: 'number' },
  { key: 'scope.scaffold_required', label: 'Scaffold Required', type: 'boolean' },
  { key: 'scope.lift_required', label: 'Lift Required', type: 'boolean' },
  { key: 'scope.additional_vehicle_required', label: 'Additional Vehicle', type: 'boolean' },
  { key: 'scope.access_condition', label: 'Access Condition', type: 'text' },
  { key: 'scope.story_count', label: 'Story Count', type: 'number' },
];

export const SIMULATOR_BASE_AMOUNTS = [
  { key: 'labor_price', label: 'Base Labor Price', type: 'number' },
  { key: 'material_price', label: 'Base Material Price', type: 'number' },
  { key: 'equipment_price', label: 'Base Equipment Price', type: 'number' },
  { key: 'total_selling_price', label: 'Base Total Selling Price', type: 'number' },
  { key: 'estimated_hours', label: 'Estimated Hours (for hourly calcs)', type: 'number' },
  { key: 'project_days', label: 'Project Days (for daily calcs)', type: 'number' },
  { key: 'labor_cost', label: 'Internal Labor Cost', type: 'number' },
  { key: 'equipment_cost', label: 'Internal Equipment Cost', type: 'number' },
  { key: 'total_job_cost', label: 'Total Internal Job Cost', type: 'number' },
];

export function getLabel(options, value) {
  return options.find(o => o.value === value)?.label || value || '—';
}