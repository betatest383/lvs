/**
 * Master Classification Registry — Seed Data
 * Centralized taxonomy for all dropdowns throughout LVC OS.
 * No module should maintain its own list — every dropdown references this registry.
 */

export const CLASSIFICATION_TYPES = [
  { value: 'inspection_category', label: 'Inspection Category' },
  { value: 'inspection_section', label: 'Inspection Section' },
  { value: 'inspection_form', label: 'Inspection Form' },
  { value: 'deficiency_type', label: 'Deficiency Type' },
  { value: 'appliance_system_type', label: 'Appliance / System Type' },
  { value: 'chimney_system_type', label: 'Chimney System Type' },
  { value: 'severity_level', label: 'Severity Level' },
  { value: 'homeowner_risk', label: 'Homeowner Risk' },
  { value: 'finding_category', label: 'Finding Category' },
  { value: 'repair_category', label: 'Repair Category' },
];

/**
 * Seed data for the Master Classification Registry.
 * Each entry will become a MasterClassification entity record.
 */
export const SEED_CLASSIFICATIONS = [
  // ── Inspection Categories ──
  { classification_type: 'inspection_category', value: 'Exterior Chimney', label: 'Exterior Chimney', sort_order: 1 },
  { classification_type: 'inspection_category', value: 'Interior Fireplace', label: 'Interior Fireplace', sort_order: 2 },
  { classification_type: 'inspection_category', value: 'Appliance', label: 'Appliance', sort_order: 3 },
  { classification_type: 'inspection_category', value: 'Flue', label: 'Flue', sort_order: 4 },
  { classification_type: 'inspection_category', value: 'Roof', label: 'Roof', sort_order: 5 },
  { classification_type: 'inspection_category', value: 'Chase', label: 'Chase', sort_order: 6 },
  { classification_type: 'inspection_category', value: 'Foundation', label: 'Foundation', sort_order: 7 },
  { classification_type: 'inspection_category', value: 'Attic', label: 'Attic', sort_order: 8 },
  { classification_type: 'inspection_category', value: 'Basement', label: 'Basement', sort_order: 9 },

  // ── Inspection Forms (top-level — multi-select on templates) ──
  { classification_type: 'inspection_form', value: 'Level 1', label: 'Level 1', sort_order: 1 },
  { classification_type: 'inspection_form', value: 'Level 2', label: 'Level 2', sort_order: 2 },
  { classification_type: 'inspection_form', value: 'Level 3', label: 'Level 3', sort_order: 3 },
  { classification_type: 'inspection_form', value: 'Dryer Vent', label: 'Dryer Vent', sort_order: 4 },
  { classification_type: 'inspection_form', value: 'Pellet', label: 'Pellet', sort_order: 5 },
  { classification_type: 'inspection_form', value: 'Gas', label: 'Gas', sort_order: 6 },
  { classification_type: 'inspection_form', value: 'Wood', label: 'Wood', sort_order: 7 },
  { classification_type: 'inspection_form', value: 'Masonry', label: 'Masonry', sort_order: 8 },
  { classification_type: 'inspection_form', value: 'Commercial', label: 'Commercial', sort_order: 9 },

  // ── Inspection Sections (hierarchical — parent_value = inspection_form) ──
  // Level 2 sections
  { classification_type: 'inspection_section', value: 'Exterior', label: 'Exterior', parent_value: 'Level 2', sort_order: 1 },
  { classification_type: 'inspection_section', value: 'Firebox', label: 'Firebox', parent_value: 'Level 2', sort_order: 2 },
  { classification_type: 'inspection_section', value: 'Smoke Chamber', label: 'Smoke Chamber', parent_value: 'Level 2', sort_order: 3 },
  { classification_type: 'inspection_section', value: 'Damper', label: 'Damper', parent_value: 'Level 2', sort_order: 4 },
  { classification_type: 'inspection_section', value: 'Flue', label: 'Flue', parent_value: 'Level 2', sort_order: 5 },
  { classification_type: 'inspection_section', value: 'Roof', label: 'Roof', parent_value: 'Level 2', sort_order: 6 },
  { classification_type: 'inspection_section', value: 'Termination', label: 'Termination', parent_value: 'Level 2', sort_order: 7 },
  { classification_type: 'inspection_section', value: 'Crown', label: 'Crown', parent_value: 'Level 2', sort_order: 8 },
  { classification_type: 'inspection_section', value: 'Cap', label: 'Cap', parent_value: 'Level 2', sort_order: 9 },
  { classification_type: 'inspection_section', value: 'Flashing', label: 'Flashing', parent_value: 'Level 2', sort_order: 10 },
  { classification_type: 'inspection_section', value: 'Chase Cover', label: 'Chase Cover', parent_value: 'Level 2', sort_order: 11 },
  // Level 1 sections
  { classification_type: 'inspection_section', value: 'Firebox', label: 'Firebox', parent_value: 'Level 1', sort_order: 1 },
  { classification_type: 'inspection_section', value: 'Damper', label: 'Damper', parent_value: 'Level 1', sort_order: 2 },
  { classification_type: 'inspection_section', value: 'Flue', label: 'Flue', parent_value: 'Level 1', sort_order: 3 },
  { classification_type: 'inspection_section', value: 'Cap', label: 'Cap', parent_value: 'Level 1', sort_order: 4 },
  // Gas sections
  { classification_type: 'inspection_section', value: 'Gas Line', label: 'Gas Line', parent_value: 'Gas', sort_order: 1 },
  { classification_type: 'inspection_section', value: 'Burner', label: 'Burner', parent_value: 'Gas', sort_order: 2 },
  { classification_type: 'inspection_section', value: 'Ignition', label: 'Ignition', parent_value: 'Gas', sort_order: 3 },
  { classification_type: 'inspection_section', value: 'Valve', label: 'Valve', parent_value: 'Gas', sort_order: 4 },
  { classification_type: 'inspection_section', value: 'Logs', label: 'Logs', parent_value: 'Gas', sort_order: 5 },
  // Dryer Vent sections
  { classification_type: 'inspection_section', value: 'Transition Duct', label: 'Transition Duct', parent_value: 'Dryer Vent', sort_order: 1 },
  { classification_type: 'inspection_section', value: 'Exhaust Duct', label: 'Exhaust Duct', parent_value: 'Dryer Vent', sort_order: 2 },
  { classification_type: 'inspection_section', value: 'Termination Hood', label: 'Termination Hood', parent_value: 'Dryer Vent', sort_order: 3 },
  { classification_type: 'inspection_section', value: 'Booster Fan', label: 'Booster Fan', parent_value: 'Dryer Vent', sort_order: 4 },

  // ── Deficiency Types ──
  { classification_type: 'deficiency_type', value: 'Firebox', label: 'Firebox', sort_order: 1 },
  { classification_type: 'deficiency_type', value: 'Damper', label: 'Damper', sort_order: 2 },
  { classification_type: 'deficiency_type', value: 'Crown', label: 'Crown', sort_order: 3 },
  { classification_type: 'deficiency_type', value: 'Cap', label: 'Cap', sort_order: 4 },
  { classification_type: 'deficiency_type', value: 'Liner', label: 'Liner', sort_order: 5 },
  { classification_type: 'deficiency_type', value: 'Smoke Chamber', label: 'Smoke Chamber', sort_order: 6 },
  { classification_type: 'deficiency_type', value: 'Water Intrusion', label: 'Water Intrusion', sort_order: 7 },
  { classification_type: 'deficiency_type', value: 'Draft', label: 'Draft', sort_order: 8 },
  { classification_type: 'deficiency_type', value: 'Maintenance', label: 'Maintenance', sort_order: 9 },
  { classification_type: 'deficiency_type', value: 'Safety', label: 'Safety', sort_order: 10 },
  { classification_type: 'deficiency_type', value: 'Code Violation', label: 'Code Violation', sort_order: 11 },
  { classification_type: 'deficiency_type', value: 'Flashing', label: 'Flashing', sort_order: 12 },
  { classification_type: 'deficiency_type', value: 'Brick / Masonry', label: 'Brick / Masonry', sort_order: 13 },
  { classification_type: 'deficiency_type', value: 'Mortar Joints', label: 'Mortar Joints', sort_order: 14 },
  { classification_type: 'deficiency_type', value: 'Chase Cover', label: 'Chase Cover', sort_order: 15 },
  { classification_type: 'deficiency_type', value: 'Hearth Extension', label: 'Hearth Extension', sort_order: 16 },
  { classification_type: 'deficiency_type', value: 'Clearance to Combustibles', label: 'Clearance to Combustibles', sort_order: 17 },
  { classification_type: 'deficiency_type', value: 'Appliance Venting', label: 'Appliance Venting', sort_order: 18 },
  { classification_type: 'deficiency_type', value: 'Animal Entry', label: 'Animal Entry', sort_order: 19 },
  { classification_type: 'deficiency_type', value: 'Structural', label: 'Structural', sort_order: 20 },

  // ── Appliance / System Types ──
  { classification_type: 'appliance_system_type', value: 'Wood Fireplace', label: 'Wood Fireplace', sort_order: 1 },
  { classification_type: 'appliance_system_type', value: 'Gas Fireplace', label: 'Gas Fireplace', sort_order: 2 },
  { classification_type: 'appliance_system_type', value: 'Pellet Stove', label: 'Pellet Stove', sort_order: 3 },
  { classification_type: 'appliance_system_type', value: 'Wood Stove', label: 'Wood Stove', sort_order: 4 },
  { classification_type: 'appliance_system_type', value: 'Insert', label: 'Insert', sort_order: 5 },
  { classification_type: 'appliance_system_type', value: 'Zero Clearance', label: 'Zero Clearance', sort_order: 6 },
  { classification_type: 'appliance_system_type', value: 'Boiler', label: 'Boiler', sort_order: 7 },
  { classification_type: 'appliance_system_type', value: 'Oil Furnace', label: 'Oil Furnace', sort_order: 8 },
  { classification_type: 'appliance_system_type', value: 'Pellet Insert', label: 'Pellet Insert', sort_order: 9 },
  { classification_type: 'appliance_system_type', value: 'Gas Insert', label: 'Gas Insert', sort_order: 10 },

  // ── Chimney System Types ──
  { classification_type: 'chimney_system_type', value: 'Masonry', label: 'Masonry', sort_order: 1 },
  { classification_type: 'chimney_system_type', value: 'Factory Built', label: 'Factory Built', sort_order: 2 },
  { classification_type: 'chimney_system_type', value: 'Class A', label: 'Class A', sort_order: 3 },
  { classification_type: 'chimney_system_type', value: 'B-Vent', label: 'B-Vent', sort_order: 4 },
  { classification_type: 'chimney_system_type', value: 'Pellet Vent', label: 'Pellet Vent', sort_order: 5 },
  { classification_type: 'chimney_system_type', value: 'Direct Vent', label: 'Direct Vent', sort_order: 6 },
  { classification_type: 'chimney_system_type', value: 'Single Wall', label: 'Single Wall', sort_order: 7 },
  { classification_type: 'chimney_system_type', value: 'Double Wall', label: 'Double Wall', sort_order: 8 },

  // ── Severity Levels ──
  { classification_type: 'severity_level', value: 'info', label: 'Info', sort_order: 1 },
  { classification_type: 'severity_level', value: 'minor', label: 'Minor', sort_order: 2 },
  { classification_type: 'severity_level', value: 'moderate', label: 'Moderate', sort_order: 3 },
  { classification_type: 'severity_level', value: 'major', label: 'Major', sort_order: 4 },
  { classification_type: 'severity_level', value: 'critical', label: 'Critical', sort_order: 5 },

  // ── Risk Levels ──
  { classification_type: 'homeowner_risk', value: 'low', label: 'Low', sort_order: 1 },
  { classification_type: 'homeowner_risk', value: 'moderate', label: 'Moderate', sort_order: 2 },
  { classification_type: 'homeowner_risk', value: 'high', label: 'High', sort_order: 3 },
  { classification_type: 'homeowner_risk', value: 'immediate_safety', label: 'Immediate Safety', sort_order: 4 },

  // ── Finding Categories ──
  { classification_type: 'finding_category', value: 'Safety', label: 'Safety', sort_order: 1 },
  { classification_type: 'finding_category', value: 'Code Compliance', label: 'Code Compliance', sort_order: 2 },
  { classification_type: 'finding_category', value: 'Water Intrusion', label: 'Water Intrusion', sort_order: 3 },
  { classification_type: 'finding_category', value: 'Wear and Tear', label: 'Wear and Tear', sort_order: 4 },
  { classification_type: 'finding_category', value: 'Installation Defect', label: 'Installation Defect', sort_order: 5 },
  { classification_type: 'finding_category', value: 'Animal / Pest', label: 'Animal / Pest', sort_order: 6 },
  { classification_type: 'finding_category', value: 'Draft / Performance', label: 'Draft / Performance', sort_order: 7 },
  { classification_type: 'finding_category', value: 'Cosmetic', label: 'Cosmetic', sort_order: 8 },

  // ── Repair Categories ──
  { classification_type: 'repair_category', value: 'Crown', label: 'Crown Repair', sort_order: 1 },
  { classification_type: 'repair_category', value: 'Masonry', label: 'Masonry Repair', sort_order: 2 },
  { classification_type: 'repair_category', value: 'Liner', label: 'Liner Installation / Repair', sort_order: 3 },
  { classification_type: 'repair_category', value: 'Smoke Chamber', label: 'Smoke Chamber Repair', sort_order: 4 },
  { classification_type: 'repair_category', value: 'Cap / Chase', label: 'Cap / Chase Cover', sort_order: 5 },
  { classification_type: 'repair_category', value: 'Flashing', label: 'Flashing Repair', sort_order: 6 },
  { classification_type: 'repair_category', value: 'Firebox', label: 'Firebox Repair', sort_order: 7 },
  { classification_type: 'repair_category', value: 'Damper', label: 'Damper Repair', sort_order: 8 },
  { classification_type: 'repair_category', value: 'Waterproofing', label: 'Waterproofing', sort_order: 9 },
  { classification_type: 'repair_category', value: 'Installation', label: 'Installation', sort_order: 10 },
  { classification_type: 'repair_category', value: 'Maintenance', label: 'Maintenance', sort_order: 11 },
];

/**
 * Risk level badge colors for UI
 */
export const RISK_BADGES = {
  low: 'bg-blue-100 text-blue-700',
  moderate: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  immediate_safety: 'bg-red-100 text-red-700',
};