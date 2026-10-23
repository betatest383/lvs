/**
 * Flue Tile Cut-Down Prerequisite Rule Engine
 *
 * Determines when a "Cut Down Terracotta Flue Tile" service is required
 * as a prerequisite for crown-mounted Multi-Flue Cap installation.
 *
 * Final height rules (based on flue tile projection above crown):
 *   projection < 1 inch           → 8-inch cap (no cut)
 *   projection >= 1 and <= 2 inch → 10-inch cap (no cut)
 *   projection > 2 and <= 4 inch  → 12-inch cap (no cut)
 *   projection > 4 inches         → Cut tile to 2 inches → 10-inch cap (CUT REQUIRED)
 *
 * When cut is required:
 *   inches_to_remove = original_projection − 2
 *   planned_final_projection = 2 inches
 *   required_cap_height = 10 inches
 *
 * The rule is applied separately to EVERY flue covered by the Multi-Flue Cap.
 * The original inspection measurement is NEVER overwritten — only the planned
 * final projection is calculated.
 *
 * The Cut Down Terracotta Flue Tile service:
 *   - Is required in every package containing the affected Multi-Flue Cap
 *   - Appears in Scope of Work
 *   - Is excluded from bolt-on-cap options
 *   - Is excluded when all covered flues are 4 inches or lower
 */

export const FINAL_PROJECTION_INCHES = 2;
export const CUT_DOWN_THRESHOLD_INCHES = 4;
export const CUT_DOWN_SERVICE_NAME = 'Cut Down Terracotta Flue Tile';

/**
 * Resolve the required cap height and cut-down status for a single flue tile projection.
 *
 * @param {number} projection - flue tile height above crown in inches
 * @returns {{ cap_height, cut_required, planned_final_projection, inches_to_remove, label }}
 */
export function resolveCapHeight(projection) {
  if (projection < 1) {
    return { cap_height: 8, cut_required: false, planned_final_projection: projection, inches_to_remove: 0, label: '8-inch cap' };
  }
  if (projection >= 1 && projection <= 2) {
    return { cap_height: 10, cut_required: false, planned_final_projection: projection, inches_to_remove: 0, label: '10-inch cap' };
  }
  if (projection > 2 && projection <= 4) {
    return { cap_height: 12, cut_required: false, planned_final_projection: projection, inches_to_remove: 0, label: '12-inch cap' };
  }
  // projection > 4 inches — cut required
  return {
    cap_height: 10,
    cut_required: true,
    planned_final_projection: FINAL_PROJECTION_INCHES,
    inches_to_remove: projection - FINAL_PROJECTION_INCHES,
    label: `Cut to ${FINAL_PROJECTION_INCHES}" → 10-inch cap`,
  };
}

/**
 * Evaluate flue tile prerequisite for a crown-mounted Multi-Flue Cap selection.
 *
 * Applies the rule separately to every flue covered by the Multi-Flue Cap.
 * Uses the single inspection projection value for each flue until per-flue
 * projection measurements become available in the inspection data model.
 *
 * @param {object} inputs - from extractCapInspectionInputs
 * @param {object} selectedProduct - the selected crown-mounted multi-flue cap
 * @returns {object} evaluation result
 */
export function evaluateFlueTilePrerequisite(inputs, selectedProduct) {
  if (!selectedProduct || selectedProduct.mount_type !== 'crown_mounted') {
    return { applicable: false, reason: 'Not a crown-mounted cap' };
  }
  if (selectedProduct.coverage_type !== 'multi_flue') {
    return { applicable: false, reason: 'Not a multi-flue cap' };
  }

  const projection = inputs.flueProjection;
  if (projection === null || projection === undefined) {
    return { applicable: false, reason: 'Flue tile projection measurement is missing' };
  }

  const flues = inputs.flueMeasurements || [];
  if (flues.length === 0) {
    return { applicable: false, reason: 'No flue measurements available' };
  }

  // Apply the single projection to each flue (until per-flue projections are available)
  const perFlueResults = flues.map((flue, idx) => {
    const tier = resolveCapHeight(projection);
    return {
      flue_identifier: `Flue ${idx + 1}`,
      flue_index: idx,
      original_projection: projection,
      planned_final_projection: tier.planned_final_projection,
      inches_to_remove: tier.inches_to_remove,
      required_cap_height: tier.cap_height,
      cut_required: tier.cut_required,
      tier_label: tier.label,
      technician_confirmed: false,
    };
  });

  const affectedFlues = perFlueResults.filter(f => f.cut_required);
  const allFluesAtOrBelowFour = perFlueResults.every(f => f.original_projection <= CUT_DOWN_THRESHOLD_INCHES);

  return {
    applicable: true,
    per_flue: perFlueResults,
    affected_flues: affectedFlues,
    cut_down_service_required: affectedFlues.length > 0,
    all_flues_at_or_below_four: allFluesAtOrBelowFour,
    required_cap_height: affectedFlues.length > 0 ? 10 : (perFlueResults[0]?.required_cap_height || null),
    selected_product_name: selectedProduct.matrix_name,
  };
}

/**
 * Build the human-readable cut-down display message for a single affected flue.
 *
 * Example: "The flue tile currently extends 6 inches above the crown. Cut it down
 * by 4 inches to a final projection of 2 inches before installing the 10-inch
 * multi-flue cap."
 *
 * @param {object} affectedFlue - from evaluateFlueTilePrerequisite per_flue entry
 * @returns {string}
 */
export function buildCutDownDisplayMessage(affectedFlue) {
  return `The flue tile currently extends ${affectedFlue.original_projection} inches above the crown. Cut it down by ${affectedFlue.inches_to_remove} inches to a final projection of ${FINAL_PROJECTION_INCHES} inches before installing the ${affectedFlue.required_cap_height}-inch multi-flue cap.`;
}

/**
 * Build the prerequisite service data for scope-of-work integration.
 * Returns null when no cut-down is required.
 *
 * @param {object} evaluation - from evaluateFlueTilePrerequisite
 * @returns {object|null} prerequisite service data
 */
export function buildPrerequisiteServiceData(evaluation) {
  if (!evaluation || !evaluation.applicable || !evaluation.cut_down_service_required) {
    return null;
  }

  return {
    service_name: CUT_DOWN_SERVICE_NAME,
    required_in_packages: true,
    appear_in_scope_of_work: true,
    excluded_from_bolt_on: true,
    excluded_when_all_flues_below_threshold: evaluation.all_flues_at_or_below_four,
    affected_flues: evaluation.affected_flues.map(f => ({
      flue_identifier: f.flue_identifier,
      original_projection: f.original_projection,
      planned_final_projection: f.planned_final_projection,
      inches_to_remove: f.inches_to_remove,
      required_cap_height: f.required_cap_height,
    })),
    required_cap_height: evaluation.required_cap_height,
  };
}