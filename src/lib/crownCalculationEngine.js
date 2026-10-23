/**
 * Crown Calculation Engine — pure calculation functions.
 * No side effects, no API calls. Safe to use on both frontend and backend.
 *
 * All measurements are in inches unless otherwise noted.
 */

export const DEFAULT_CROWN_SETTINGS = {
  default_crown_thickness_inches: 4,
  default_bag_weight_lbs: 80,
  default_yield_per_bag_cubic_feet: 0.60,
  small_form_max_inches: 28.01,
  medium_form_max_inches: 56,
  large_form_max_inches: 92,
  foam_package_length_inches: 192,
};

/**
 * Classify a crown-form dimension independently.
 * Up to 28.01: Small Forms
 * Over 28.01 through 56: Medium Forms
 * Over 56 through 92: Large Forms
 * Over 92: Custom Wood Forms
 */
export function classifyCrownForm(dimension, settings = DEFAULT_CROWN_SETTINGS) {
  if (dimension <= settings.small_form_max_inches) return 'Small Forms';
  if (dimension <= settings.medium_form_max_inches) return 'Medium Forms';
  if (dimension <= settings.large_form_max_inches) return 'Large Forms';
  return 'Custom Wood Forms';
}

/** Gross crown area = Crown length × Crown width (sq in) */
export function calculateGrossCrownArea(length, width) {
  return length * width;
}

/** Individual flue area = Flue length × Flue width (sq in) */
export function calculateFlueArea(length, width) {
  return length * width;
}

/** Total flue area = Sum of all individual flue areas */
export function calculateTotalFlueArea(flues = []) {
  return flues.reduce((sum, f) => sum + (Number(f.length) * Number(f.width)), 0);
}

/** Net crown area = Gross crown area − Total flue area */
export function calculateNetCrownArea(grossArea, totalFlueArea) {
  return grossArea - totalFlueArea;
}

/** Concrete cubic feet = (Net crown area × Crown thickness in inches) ÷ 1,728 */
export function calculateConcreteCubicFeet(netAreaSqIn, thicknessInches) {
  return (netAreaSqIn * thicknessInches) / 1728;
}

/** Raw concrete bags = Concrete cubic feet ÷ Yield per bag (NOT rounded) */
export function calculateRawConcreteBags(cubicFeet, yieldPerBag) {
  return cubicFeet / yieldPerBag;
}

/** Concrete bags required = Round raw bags UP to next whole bag */
export function calculateConcreteBagsRequired(rawBags) {
  return Math.ceil(rawBags);
}

/** Wire-grid length = Crown length − 2 inches; Wire-grid width = Crown width − 2 inches */
export function calculateWireGrid(crownLength, crownWidth) {
  return {
    length: crownLength - 2,
    width: crownWidth - 2,
  };
}

/** Foam for one flue = (2 × Flue length) + (2 × Flue width) + 6 inches */
export function calculateFlueFoam(flueLength, flueWidth) {
  return (2 * Number(flueLength)) + (2 * Number(flueWidth)) + 6;
}

/** Total foam = Sum of foam required for every flue (NOT rounded) */
export function calculateTotalFoam(flues = []) {
  return flues.reduce((sum, f) => sum + calculateFlueFoam(f.length, f.width), 0);
}

/** Convert inches to linear feet (exact, not rounded) */
export function inchesToLinearFeet(inches) {
  return inches / 12;
}

/** Purchasable foam quantity = ceil(total foam inches ÷ package length inches) */
export function calculateFoamPurchaseQuantity(totalFoamInches, packageLengthInches) {
  if (!packageLengthInches || packageLengthInches <= 0) return 0;
  return Math.ceil(totalFoamInches / packageLengthInches);
}

/**
 * Run the full crown calculation from measurements + settings.
 * Does NOT round intermediate values. Only rounds the final concrete bag count up.
 *
 * @param {object} measurements - { crown_form_length, crown_form_width, crown_thickness, flues: [{length, width}], removing_brick_courses, crown_step_in }
 * @param {object} settings - CrownCalculationSettings (falls back to DEFAULT_CROWN_SETTINGS)
 * @returns {object} All calculated outputs
 */
export function runFullCalculation(measurements, settings = DEFAULT_CROWN_SETTINGS) {
  const crownLength = Number(measurements.crown_form_length) || 0;
  const crownWidth = Number(measurements.crown_form_width) || 0;
  const flues = measurements.flues || [];
  const thickness = Number(measurements.crown_thickness ?? settings.default_crown_thickness_inches);

  const grossArea = calculateGrossCrownArea(crownLength, crownWidth);
  const totalFlueArea = calculateTotalFlueArea(flues);
  const netArea = calculateNetCrownArea(grossArea, totalFlueArea);
  const cubicFeet = calculateConcreteCubicFeet(netArea, thickness);
  const rawBags = calculateRawConcreteBags(cubicFeet, settings.default_yield_per_bag_cubic_feet);
  const bagsRequired = calculateConcreteBagsRequired(rawBags);

  const wireGrid = calculateWireGrid(crownLength, crownWidth);

  const totalFoam = calculateTotalFoam(flues);
  const foamLinearFeet = inchesToLinearFeet(totalFoam);
  const foamPurchaseQty = calculateFoamPurchaseQuantity(totalFoam, settings.foam_package_length_inches);

  const formSizeLength = classifyCrownForm(crownLength, settings);
  const formSizeWidth = classifyCrownForm(crownWidth, settings);

  // Per-flue breakdown for transparency
  const flueBreakdown = flues.map((f, i) => {
    const flueArea = calculateFlueArea(f.length, f.width);
    const foam = calculateFlueFoam(f.length, f.width);
    return {
      index: i + 1,
      length: Number(f.length),
      width: Number(f.width),
      area: flueArea,
      foam_inches: foam,
    };
  });

  return {
    gross_crown_area: grossArea,
    total_flue_area: totalFlueArea,
    net_crown_area: netArea,
    concrete_cubic_feet: cubicFeet,
    raw_concrete_bags: rawBags,
    concrete_bags_required: bagsRequired,
    wire_grid_length: wireGrid.length,
    wire_grid_width: wireGrid.width,
    total_foam_inches: totalFoam,
    total_foam_linear_feet: foamLinearFeet,
    foam_purchase_quantity: foamPurchaseQty,
    crown_form_size_length: formSizeLength,
    crown_form_size_width: formSizeWidth,
    flue_breakdown: flueBreakdown,
  };
}

/**
 * Generate a deterministic hash of measurement values for outdated detection.
 * If this hash changes between saves, the calculation is marked outdated.
 */
export function generateMeasurementHash(measurements) {
  const { crown_form_length, crown_form_width, crown_thickness, flues = [], removing_brick_courses, crown_step_in } = measurements;
  const flueStr = flues.map(f => `${f.length}x${f.width}`).join(',');
  return `${crown_form_length}|${crown_form_width}|${crown_thickness}|${flueStr}|${removing_brick_courses}|${crown_step_in}`;
}

/**
 * Build the materials array for pushing to DraftEstimateItem.materials.
 * Each material follows the standard format: {material_id, material_name, quantity, unit, unit_price, chargeable_to_customer, customer_visible}
 */
export function buildMaterialsFromCalculation(calc, settings = DEFAULT_CROWN_SETTINGS) {
  const materials = [];

  // 1. Concrete bags
  materials.push({
    material_id: settings.concrete_material_id || '',
    material_name: `Concrete (${settings.default_bag_weight_lbs}lb bags)`,
    quantity: calc.concrete_bags_required,
    unit: 'bag',
    unit_price: 0,
    chargeable_to_customer: true,
    customer_visible: true,
    calculation_detail: `${calc.concrete_cubic_feet.toFixed(4)} cu ft ÷ ${settings.default_yield_per_bag_cubic_feet} yield = ${calc.raw_concrete_bags.toFixed(4)} raw → ${calc.concrete_bags_required} bags`,
  });

  // 2. Wire grid
  materials.push({
    material_id: settings.wire_grid_material_id || '',
    material_name: 'Wire Grid',
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    chargeable_to_customer: true,
    customer_visible: true,
    calculation_detail: `${calc.wire_grid_length} × ${calc.wire_grid_width} inches (crown − 2in each side)`,
    dimensions: { length: calc.wire_grid_length, width: calc.wire_grid_width },
  });

  // 3. Expansion foam
  materials.push({
    material_id: settings.expansion_foam_material_id || '',
    material_name: 'Expansion Foam',
    quantity: calc.foam_purchase_quantity,
    unit: 'ea',
    unit_price: 0,
    chargeable_to_customer: true,
    customer_visible: true,
    calculation_detail: `${calc.total_foam_inches} in total (${calc.total_foam_linear_feet.toFixed(2)} linear ft) ÷ ${settings.foam_package_length_inches} in/package = ${calc.foam_purchase_quantity} packages`,
    unrounded_inches: calc.total_foam_inches,
    unrounded_linear_feet: calc.total_foam_linear_feet,
  });

  // 4. Crown forms (length and width independently)
  materials.push({
    material_id: getFormMaterialId(calc.crown_form_size_length, settings),
    material_name: `Crown Form — Length (${calc.crown_form_size_length})`,
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    chargeable_to_customer: true,
    customer_visible: true,
    calculation_detail: `Crown length form classification`,
  });

  materials.push({
    material_id: getFormMaterialId(calc.crown_form_size_width, settings),
    material_name: `Crown Form — Width (${calc.crown_form_size_width})`,
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    chargeable_to_customer: true,
    customer_visible: true,
    calculation_detail: `Crown width form classification`,
  });

  return materials;
}

function getFormMaterialId(formSize, settings) {
  switch (formSize) {
    case 'Small Forms': return settings.small_form_material_id || '';
    case 'Medium Forms': return settings.medium_form_material_id || '';
    case 'Large Forms': return settings.large_form_material_id || '';
    case 'Custom Wood Forms': return settings.custom_form_material_id || '';
    default: return '';
  }
}