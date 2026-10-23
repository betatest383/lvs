/**
 * Stable question IDs for Chimney Cap Mounting and Material Resolver.
 * These are MongoDB ObjectId strings that serve as the stable identifiers.
 * Do NOT match by question text — wording may change.
 *
 * Discovered from the live InspectionQuestion records.
 */
export const CAP_QUESTION_IDS = {
  cap_present: '69c365ed38b67af793acbe65',
  cap_damaged: '69c365ed38b67af793acbe6b',
  cap_mounting_method: '69c365ed38b67af793acbe69',
  cap_type: '69c365ed38b67af793acbe67',
  cap_material: '69c365ed38b67af793acbe68',
  terracotta_tile_present: '69c365ed38b67af793acbe71',
  flue_projection: '69c365ed38b67af793acbe70',
  flue_exterior_measurements: '69c365ed38b67af793acbe73',
  flue_interior_measurements: '69c365ed38b67af793acbe72',
  crown_measurements: '69c365ed38b67af793acbe7d',
  // Conditional round-flue question: "Are the flue tiles round?"
  flue_tiles_round: '6a568202ecc945ffc1aa4b86',
  // Round inner diameter (for slip-in cap sizing)
  flue_inner_diameter: '6a568202ecc945ffc1aa4b87',
  // Round outer diameter (for exterior bolt-on cap sizing) — formerly flue_round_diameter
  flue_outer_diameter: '6a567ab6b49a5f6e3dbc8a8b',
};

/**
 * Mount types supported by the resolver.
 * slip_in = cap slips inside the flue (sized by INTERIOR measurements)
 * bolt_on_exterior = cap bolts over the exterior of the flue tile (sized by EXTERIOR measurements)
 * bolt_on = legacy alias for bolt_on_exterior (backward compatibility)
 * crown_mounted = cap sits on the crown (sized by CROWN measurements)
 */
export const CAP_MOUNT_TYPES = {
  SLIP_IN: 'slip_in',
  BOLT_ON_EXTERIOR: 'bolt_on_exterior',
  BOLT_ON: 'bolt_on',
  CROWN_MOUNTED: 'crown_mounted',
};

/**
 * Measurement basis — determines which measurement is used for matching.
 * Each mount type + shape combination maps to exactly one basis.
 * Cross-basis matching is always blocked.
 */
export const CAP_MEASUREMENT_BASIS = {
  INTERIOR_DIAMETER: 'interior_diameter',
  INTERIOR_LENGTH_WIDTH: 'interior_length_width',
  EXTERIOR_DIAMETER: 'exterior_diameter',
  EXTERIOR_LENGTH_WIDTH: 'exterior_length_width',
  CROWN: 'crown',
};

/**
 * Expected stored answer values (case-sensitive as stored in submissions).
 * The resolver normalizes to these for comparison.
 */
export const CAP_ANSWER_VALUES = {
  YES: 'Yes',
  NO: 'No',
};

/**
 * Selection group for mutually exclusive cap mounting method selection.
 * Only one mounting method may be committed per chimney/flue system.
 */
export const CAP_SELECTION_GROUP = 'chimney_cap_mounting_method';
export const CAP_MAX_COMMITTED_OPTIONS = 1;

/**
 * Resolver statuses
 */
export const CAP_RESOLVER_STATUS = {
  RESOLVED: 'resolved',
  TECHNICIAN_SELECTION_REQUIRED: 'technician_selection_required',
  MEASUREMENT_MISSING: 'measurement_missing',
  NO_COMPATIBLE_PRODUCT: 'no_compatible_product',
  MULTIPLE_MATCHES: 'multiple_matches',
  CONFIRMED: 'confirmed',
  OUTDATED: 'outdated',
};

/**
 * Normalize an answer value to a canonical lowercase string for comparison.
 */
export function normalizeAnswer(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Check if an answer value is affirmatively "Yes".
 * Handles variations: 'Yes', 'yes', 'true', 'True'
 */
export function isYesAnswer(value) {
  const normalized = normalizeAnswer(value).toLowerCase();
  return normalized === 'yes' || normalized === 'true';
}