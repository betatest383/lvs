/**
 * Chimney Cap Mounting and Material Resolver Engine
 *
 * Conditional Measurement Flow:
 *   Question: "Are the flue tiles round?"
 *   - Yes → retrieve inner diameter + outer diameter
 *   - No  → retrieve interior L×W + exterior L×W
 *
 * Normalized per-flue structure:
 *   { flue_id, shape, interior: {diameter, length, width}, exterior: {diameter, length, width} }
 *
 * Matching Rules:
 *   slip_in + round         → interior.diameter
 *   slip_in + rectangular    → interior.length × interior.width
 *   bolt_on_exterior + round → exterior.diameter
 *   bolt_on_exterior + rect  → exterior.length × exterior.width
 *   crown_mounted            → crown measurements
 *
 * Cross-basis matching is blocked:
 *   - Never use inner diameter for exterior bolt-on
 *   - Never use outer diameter for slip-in
 *   - Never use rectangular measurements for a round product
 *   - Never estimate one measurement from the other
 */
import { CAP_QUESTION_IDS, CAP_ANSWER_VALUES, CAP_RESOLVER_STATUS, CAP_MOUNT_TYPES, CAP_MEASUREMENT_BASIS, isYesAnswer, normalizeAnswer } from './capQuestionIds';
import { parseDimensions, parseMultipleDimensions, parseDiameter } from './crownQuestionIds';

/**
 * Extract all cap-related inspection inputs from merged answers.
 * Uses the conditional measurement flow: round question determines
 * whether inner/outer diameters or interior/exterior L×W are retrieved.
 *
 * @param {object} mergedAnswers - question_id → answer value
 * @returns {{ inputs, missing }}
 */
export function extractCapInspectionInputs(mergedAnswers) {
  const Q = CAP_QUESTION_IDS;
  const missing = [];

  const capPresent = normalizeAnswer(mergedAnswers[Q.cap_present]);
  const capDamaged = normalizeAnswer(mergedAnswers[Q.cap_damaged]);
  const mountingMethod = normalizeAnswer(mergedAnswers[Q.cap_mounting_method]);
  const capType = normalizeAnswer(mergedAnswers[Q.cap_type]);
  const capMaterial = normalizeAnswer(mergedAnswers[Q.cap_material]);

  const terracottaPresent = isYesAnswer(mergedAnswers[Q.terracotta_tile_present]);

  const projectionRaw = normalizeAnswer(mergedAnswers[Q.flue_projection]).replace(/[^0-9.]/g, '');
  const projection = parseFloat(projectionRaw);
  const hasProjection = !isNaN(projection) && projection > 0;

  // --- Conditional measurement flow ---
  const flueTilesRoundRaw = normalizeAnswer(mergedAnswers[Q.flue_tiles_round]);
  const flueTilesRound = isYesAnswer(mergedAnswers[Q.flue_tiles_round]);

  // Determine shape from the round question
  let shape = null;
  if (flueTilesRoundRaw) {
    shape = flueTilesRound ? 'round' : 'rectangular';
  }

  // Build per-flue normalized measurement entries
  let flueEntries = [];

  if (shape === 'round') {
    // Round: read inner and outer diameters
    const innerRaw = normalizeAnswer(mergedAnswers[Q.flue_inner_diameter]).replace(/[^0-9.]/g, '');
    const outerRaw = normalizeAnswer(mergedAnswers[Q.flue_outer_diameter]).replace(/[^0-9.]/g, '');
    const innerD = parseFloat(innerRaw);
    const outerD = parseFloat(outerRaw);
    const hasInner = !isNaN(innerD) && innerD > 0;
    const hasOuter = !isNaN(outerD) && outerD > 0;

    flueEntries = [{
      flue_id: 'flue-1',
      shape: 'round',
      interior: { diameter: hasInner ? innerD : null, length: null, width: null },
      exterior: { diameter: hasOuter ? outerD : null, length: null, width: null },
      source_question_ids: {
        round: Q.flue_tiles_round,
        interior_diameter: Q.flue_inner_diameter,
        exterior_diameter: Q.flue_outer_diameter,
      },
    }];
  } else if (shape === 'rectangular') {
    // Rectangular: parse interior and exterior L×W (supports multiple flues)
    const interiorDims = parseMultipleDimensions(mergedAnswers[Q.flue_interior_measurements]);
    const exteriorDims = parseMultipleDimensions(mergedAnswers[Q.flue_exterior_measurements]);

    const flueCount = Math.max(interiorDims.length, exteriorDims.length, 1);
    for (let i = 0; i < flueCount; i++) {
      const interior = interiorDims[i] || { length: null, width: null };
      const exterior = exteriorDims[i] || { length: null, width: null };
      flueEntries.push({
        flue_id: `flue-${i + 1}`,
        shape: 'rectangular',
        interior: { diameter: null, length: interior.length ?? null, width: interior.width ?? null },
        exterior: { diameter: null, length: exterior.length ?? null, width: exterior.width ?? null },
        source_question_ids: {
          round: Q.flue_tiles_round,
          interior_length_width: Q.flue_interior_measurements,
          exterior_length_width: Q.flue_exterior_measurements,
        },
      });
    }
  }

  // Crown measurements
  const crownDims = parseDimensions(mergedAnswers[Q.crown_measurements]);
  const crownDiameter = parseDiameter(mergedAnswers[Q.crown_measurements]);

  // Track missing critical measurements
  if (!capPresent) {
    missing.push({ question_id: Q.cap_present, label: 'Is there a cap on the flue in service?' });
  }
  if (capPresent === CAP_ANSWER_VALUES.YES && !capDamaged) {
    missing.push({ question_id: Q.cap_damaged, label: 'Is there anything wrong with the cap?' });
  }
  if (!flueTilesRoundRaw) {
    missing.push({ question_id: Q.flue_tiles_round, label: 'Are the flue tiles round?' });
  }
  if (!hasProjection) {
    missing.push({ question_id: Q.flue_projection, label: 'How high does the flue tile extend above the crown?' });
  }
  if (!crownDims && crownDiameter === null) {
    missing.push({ question_id: Q.crown_measurements, label: 'Crown measurements (L × W or diameter)' });
  }

  return {
    inputs: {
      capPresent,
      capDamaged,
      mountingMethod,
      capType,
      capMaterial,
      terracottaPresent,
      flueProjection: hasProjection ? projection : null,
      flueTilesRoundAnswer: flueTilesRoundRaw,
      flueTilesRound,
      flueShape: shape,
      flueEntries,
      crownMeasurements: crownDims,
      crownDiameter,
      flueCount: flueEntries.length || 1,
    },
    missing,
  };
}

/**
 * Determine bolt-on exterior mounting eligibility.
 *
 * A bolt-on exterior cap is eligible only when:
 *   - Terracotta flue tile is present
 *   - Flue tile extends more than 3 inches above the crown
 */
export function determineBoltOnEligibility(inputs) {
  const reasons = [];

  if (!inputs.terracottaPresent) {
    reasons.push('no terracotta flue tile');
  }

  if (inputs.flueProjection === null) {
    reasons.push('flue tile projection measurement is missing');
  } else if (inputs.flueProjection <= 3) {
    reasons.push(`flue tile extends only ${inputs.flueProjection} inches above the crown; more than 3 inches is required`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

// ─── Matching helpers ───

function fitsInDiameterRange(diameter, product) {
  const min = product.min_fitting_diameter || 0;
  const max = product.max_fitting_diameter || Infinity;
  return diameter >= min && diameter <= max;
}

function isRoundProduct(product) {
  if (product.compatible_shape === 'round') return true;
  if (product.compatible_shape === 'any' && (product.nominal_diameter || product.min_fitting_diameter || product.max_fitting_diameter)) return true;
  return false;
}

function fitsInRange(length, width, product, rotated) {
  const checkL = rotated ? width : length;
  const checkW = rotated ? length : width;
  const minL = product.min_fitting_length || 0;
  const maxL = product.max_fitting_length || Infinity;
  const minW = product.min_fitting_width || 0;
  const maxW = product.max_fitting_width || Infinity;
  return checkL >= minL && checkL <= maxL && checkW >= minW && checkW <= maxW;
}

function sortProducts(products) {
  return [...products].sort((a, b) => {
    if (a.is_preferred && !b.is_preferred) return -1;
    if (!a.is_preferred && b.is_preferred) return 1;
    return (b.priority || 0) - (a.priority || 0);
  });
}

function sortRoundProducts(products, measuredDiameter) {
  return [...products].sort((a, b) => {
    const aExact = a.nominal_diameter && Math.abs(a.nominal_diameter - measuredDiameter) < 0.001;
    const bExact = b.nominal_diameter && Math.abs(b.nominal_diameter - measuredDiameter) < 0.001;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    const aRange = (a.max_fitting_diameter || 0) - (a.min_fitting_diameter || 0);
    const bRange = (b.max_fitting_diameter || 0) - (b.min_fitting_diameter || 0);
    if (aRange !== bRange) return aRange - bRange;
    return (b.priority || 0) - (a.priority || 0);
  });
}

/**
 * Build the standard product-fields snapshot object for a matched product.
 */
function buildProductFields(product) {
  return {
    matrix_id: product.id,
    matrix_name: product.matrix_name,
    mount_type: product.mount_type,
    cap_style: product.cap_style,
    base_material: product.base_material,
    finish: product.finish,
    finish_color: product.finish_color,
    finish_material_id: product.finish_material_id,
    finish_service_id: product.finish_service_id,
    coverage_type: product.coverage_type,
    manufacturer: product.manufacturer,
    model: product.model,
    material_id: product.material_id,
    material_sku: product.material_sku,
    service_id: product.service_id,
    nominal_height: product.nominal_height,
    compatible_shape: product.compatible_shape,
    is_preferred: product.is_preferred,
    priority: product.priority,
  };
}

// ─── Resolution: Slip-In (INTERIOR measurements) ───

/**
 * Resolve compatible slip-in products for each flue independently.
 * Uses INTERIOR measurements only.
 *   - Round flue: interior.diameter
 *   - Rectangular flue: interior.length × interior.width
 *
 * Cross-basis blocking:
 *   - Never uses exterior measurements
 *   - Never uses outer diameter
 */
export function resolveSlipInProducts(inputs, matrixRecords) {
  const eligible = matrixRecords.filter(m =>
    m.mount_type === CAP_MOUNT_TYPES.SLIP_IN && m.is_active !== false
  );
  return resolveFlueProducts(inputs, eligible, 'interior', CAP_MEASUREMENT_BASIS.INTERIOR_DIAMETER, CAP_MEASUREMENT_BASIS.INTERIOR_LENGTH_WIDTH);
}

// ─── Resolution: Bolt-On Exterior (EXTERIOR measurements) ───

/**
 * Resolve compatible exterior bolt-on products for each flue independently.
 * Uses EXTERIOR measurements only.
 *   - Round flue: exterior.diameter
 *   - Rectangular flue: exterior.length × exterior.width
 *
 * Cross-basis blocking:
 *   - Never uses interior measurements
 *   - Never uses inner diameter
 */
export function resolveBoltOnProducts(inputs, matrixRecords) {
  // Legacy 'bolt_on' records are excluded from automatic matching — they require classification first.
  const eligible = matrixRecords.filter(m =>
    m.mount_type === CAP_MOUNT_TYPES.BOLT_ON_EXTERIOR && m.is_active !== false
  );
  return resolveFlueProducts(inputs, eligible, 'exterior', CAP_MEASUREMENT_BASIS.EXTERIOR_DIAMETER, CAP_MEASUREMENT_BASIS.EXTERIOR_LENGTH_WIDTH);
}

/**
 * Core per-flue resolution for slip-in and bolt-on-exterior.
 * @param {object} inputs - from extractCapInspectionInputs
 * @param {array} eligibleProducts - pre-filtered by mount type
 * @param {'interior'|'exterior'} basis - which measurement side to use
 * @param {string} roundBasis - measurement basis label for round
 * @param {string} rectBasis - measurement basis label for rectangular
 * @returns {array} per-flue results
 */
function resolveFlueProducts(inputs, eligibleProducts, basis, roundBasis, rectBasis) {
  const flueEntries = inputs.flueEntries || [];

  // If no entries (shape not determined), return a single unresolved entry
  if (flueEntries.length === 0) {
    return [{
      flue_id: 'flue-1',
      flue_index: 0,
      flue_measurement: null,
      measurement_basis: null,
      compatible_products: [],
      status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING,
      missing_message: 'Flue tile round question must be answered before resolution.',
    }];
  }

  return flueEntries.map((entry, idx) => {
    const compatible = [];
    const measurements = entry[basis]; // {diameter, length, width}

    if (entry.shape === 'round') {
      const diameter = measurements.diameter;

      if (!diameter || diameter <= 0) {
        const missingMsg = basis === 'interior'
          ? 'Inner diameter required for slip-in cap sizing.'
          : 'Outer diameter required for exterior bolt-on cap sizing.';
        return {
          flue_id: entry.flue_id,
          flue_index: idx,
          flue_measurement: { diameter: null, round: true },
          measurement_basis: roundBasis,
          measurement_used: null,
          compatible_products: [],
          status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING,
          missing_message: missingMsg,
        };
      }

      for (const product of eligibleProducts) {
        // Block: round products only match round or universal shapes
        if (product.compatible_shape !== 'round' && product.compatible_shape !== 'any') continue;
        if (!product.min_fitting_diameter && !product.max_fitting_diameter) continue;
        if (!fitsInDiameterRange(diameter, product)) continue;

        compatible.push({
          ...buildProductFields(product),
          nominal_diameter: product.nominal_diameter,
          min_fitting_diameter: product.min_fitting_diameter,
          max_fitting_diameter: product.max_fitting_diameter,
          match_orientation: 'normal',
          measured_diameter: diameter,
          is_round_product: isRoundProduct(product),
        });
      }

      const sorted = sortRoundProducts(compatible, diameter);
      return {
        flue_id: entry.flue_id,
        flue_index: idx,
        flue_measurement: { diameter, round: true },
        measurement_basis: roundBasis,
        measurement_used: diameter,
        source_question_ids: entry.source_question_ids,
        compatible_products: sorted,
        status: sorted.length === 0 ? CAP_RESOLVER_STATUS.NO_COMPATIBLE_PRODUCT
          : sorted.length === 1 ? CAP_RESOLVER_STATUS.RESOLVED
          : CAP_RESOLVER_STATUS.MULTIPLE_MATCHES,
        match_label: buildMatchLabel(basis, 'round', diameter, null, null),
      };
    }

    // Rectangular flue
    const length = measurements.length;
    const width = measurements.width;

    if (!length || !width || length <= 0 || width <= 0) {
      const missingMsg = basis === 'interior'
        ? 'Interior length and width required for slip-in cap sizing.'
        : 'Exterior length and width required for exterior bolt-on cap sizing.';
      return {
        flue_id: entry.flue_id,
        flue_index: idx,
        flue_measurement: { length: null, width: null },
        measurement_basis: rectBasis,
        measurement_used: null,
        compatible_products: [],
        status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING,
        missing_message: missingMsg,
      };
    }

    for (const product of eligibleProducts) {
      // Block: round-only products cannot match rectangular flues
      if (product.compatible_shape === 'round') continue;

      const normalFit = fitsInRange(length, width, product, false);
      let rotatedFit = false;
      if (product.allows_rotated_match) {
        rotatedFit = fitsInRange(length, width, product, true);
      }

      if (normalFit || rotatedFit) {
        compatible.push({
          ...buildProductFields(product),
          nominal_length: product.nominal_length,
          nominal_width: product.nominal_width,
          match_orientation: normalFit ? 'normal' : 'rotated',
        });
      }
    }

    const sorted = sortProducts(compatible);
    return {
      flue_id: entry.flue_id,
      flue_index: idx,
      flue_measurement: { length, width },
      measurement_basis: rectBasis,
      measurement_used: { length, width },
      source_question_ids: entry.source_question_ids,
      compatible_products: sorted,
      status: sorted.length === 0 ? CAP_RESOLVER_STATUS.NO_COMPATIBLE_PRODUCT
        : sorted.length === 1 ? CAP_RESOLVER_STATUS.RESOLVED
        : CAP_RESOLVER_STATUS.MULTIPLE_MATCHES,
      match_label: buildMatchLabel(basis, 'rectangular', null, length, width),
    };
  });
}

// ─── Resolution: Crown-Mounted (CROWN measurements) ───

/**
 * Resolve compatible crown-mounted products.
 * Uses CROWN measurements only — never flue interior/exterior.
 */
export function resolveCrownMountedProducts(inputs, matrixRecords) {
  const hasCrownDims = inputs.crownMeasurements || inputs.crownDiameter !== null;
  if (!hasCrownDims) {
    return {
      status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING,
      missing_question_id: CAP_QUESTION_IDS.crown_measurements,
      compatible_products: [],
    };
  }

  const eligible = matrixRecords.filter(m => m.mount_type === CAP_MOUNT_TYPES.CROWN_MOUNTED && m.is_active !== false);
  const compatible = [];

  // Round crown path
  if (inputs.crownDiameter !== null) {
    const diameter = inputs.crownDiameter;
    for (const product of eligible) {
      if (product.compatible_shape !== 'round' && product.compatible_shape !== 'any') continue;
      if (!product.min_fitting_diameter && !product.max_fitting_diameter) continue;
      if (!fitsInDiameterRange(diameter, product)) continue;
      const fluesOk = (product.flues_supported || 1) >= inputs.flueCount;
      if (!fluesOk) continue;

      compatible.push({
        ...buildProductFields(product),
        nominal_diameter: product.nominal_diameter,
        min_fitting_diameter: product.min_fitting_diameter,
        max_fitting_diameter: product.max_fitting_diameter,
        manufacturer_clearance: product.manufacturer_clearance || 0,
        flues_supported: product.flues_supported || 1,
        match_orientation: 'normal',
        measured_diameter: diameter,
        is_round_product: isRoundProduct(product),
      });
    }
    const sorted = sortRoundProducts(compatible, diameter);
    return {
      status: sorted.length === 0 ? CAP_RESOLVER_STATUS.NO_COMPATIBLE_PRODUCT
        : sorted.length === 1 ? CAP_RESOLVER_STATUS.RESOLVED
        : CAP_RESOLVER_STATUS.MULTIPLE_MATCHES,
      measurement_basis: CAP_MEASUREMENT_BASIS.CROWN,
      compatible_products: sorted,
    };
  }

  // Rectangular crown path
  const { length: crownL, width: crownW } = inputs.crownMeasurements;

  for (const product of eligible) {
    if (product.compatible_shape === 'round') continue;

    const normalFit = fitsInRange(crownL, crownW, product, false);
    let rotatedFit = false;
    if (product.allows_rotated_match) {
      rotatedFit = fitsInRange(crownL, crownW, product, true);
    }

    const fluesOk = (product.flues_supported || 1) >= inputs.flueCount;

    if ((normalFit || rotatedFit) && fluesOk) {
      compatible.push({
        ...buildProductFields(product),
        nominal_length: product.nominal_length,
        nominal_width: product.nominal_width,
        manufacturer_clearance: product.manufacturer_clearance || 0,
        flues_supported: product.flues_supported || 1,
        match_orientation: normalFit ? 'normal' : 'rotated',
      });
    }
  }

  const sorted = sortProducts(compatible);
  return {
    status: sorted.length === 0 ? CAP_RESOLVER_STATUS.NO_COMPATIBLE_PRODUCT
      : sorted.length === 1 ? CAP_RESOLVER_STATUS.RESOLVED
      : CAP_RESOLVER_STATUS.MULTIPLE_MATCHES,
    measurement_basis: CAP_MEASUREMENT_BASIS.CROWN,
    compatible_products: sorted,
  };
}

// ─── Full resolution ───

/**
 * Full cap resolution: slip-in + exterior bolt-on + crown-mounted.
 */
export function resolveCapOptions(inputs, matrixRecords) {
  if (inputs.missing && inputs.missing.length > 0) {
    return {
      status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING,
      missing: inputs.missing,
      bolt_on_eligibility: null,
      slip_in_products: [],
      bolt_on_products: [],
      crown_mounted_result: { status: CAP_RESOLVER_STATUS.MEASUREMENT_MISSING, compatible_products: [] },
    };
  }

  const boltOnEligibility = determineBoltOnEligibility(inputs);
  const slipInProducts = resolveSlipInProducts(inputs, matrixRecords);
  const boltOnProducts = boltOnEligibility.eligible
    ? resolveBoltOnProducts(inputs, matrixRecords)
    : [];
  const crownMountedResult = resolveCrownMountedProducts(inputs, matrixRecords);

  const hasSlipIn = slipInProducts.some(f => f.compatible_products.length > 0);
  const hasBoltOn = boltOnProducts.some(f => f.compatible_products.length > 0);
  const hasCrown = crownMountedResult.compatible_products.length > 0;

  let status;
  if (!hasSlipIn && !hasBoltOn && !hasCrown) {
    status = CAP_RESOLVER_STATUS.NO_COMPATIBLE_PRODUCT;
  } else if ((hasSlipIn && hasBoltOn) || (hasSlipIn && hasCrown) || (hasBoltOn && hasCrown)) {
    status = CAP_RESOLVER_STATUS.TECHNICIAN_SELECTION_REQUIRED;
  } else {
    status = CAP_RESOLVER_STATUS.RESOLVED;
  }

  return {
    status,
    missing: [],
    bolt_on_eligibility: boltOnEligibility,
    slip_in_products: slipInProducts,
    bolt_on_products: boltOnProducts,
    crown_mounted_result: crownMountedResult,
  };
}

// ─── Display helpers ───

/**
 * Build a human-readable label describing the measurement basis used for a match.
 * Examples:
 *   "Slip-in match based on 8-inch inner diameter."
 *   "Exterior bolt-on match based on 10-inch outer diameter."
 *   "Slip-in match based on 8 × 12-inch interior opening."
 *   "Exterior bolt-on match based on 10 × 14-inch exterior tile."
 */
export function buildMatchLabel(basis, shape, diameter, length, width) {
  const mountLabel = basis === 'interior' ? 'Slip-in' : 'Exterior bolt-on';

  if (shape === 'round' && diameter) {
    const dimDesc = basis === 'interior' ? 'inner diameter' : 'outer diameter';
    return `${mountLabel} match based on ${diameter}-inch ${dimDesc}.`;
  }

  if (shape === 'rectangular' && length && width) {
    const dimDesc = basis === 'interior' ? 'interior opening' : 'exterior tile';
    return `${mountLabel} match based on ${length} × ${width}-inch ${dimDesc}.`;
  }

  return '';
}

/**
 * Build a missing-measurement message for a specific mount type + shape.
 */
export function buildMissingMeasurementMessage(mountType, shape) {
  if (mountType === CAP_MOUNT_TYPES.SLIP_IN) {
    if (shape === 'round') return 'Inner diameter required for slip-in cap sizing.';
    if (shape === 'rectangular') return 'Interior length and width required for slip-in cap sizing.';
    return 'Flue shape must be determined before slip-in cap sizing.';
  }
  if (mountType === CAP_MOUNT_TYPES.BOLT_ON_EXTERIOR || mountType === CAP_MOUNT_TYPES.BOLT_ON) {
    if (shape === 'round') return 'Outer diameter required for exterior bolt-on cap sizing.';
    if (shape === 'rectangular') return 'Exterior length and width required for exterior bolt-on cap sizing.';
    return 'Flue shape must be determined before exterior bolt-on cap sizing.';
  }
  if (mountType === CAP_MOUNT_TYPES.CROWN_MOUNTED) {
    return 'Crown measurements required for crown-mounted cap sizing.';
  }
  return 'Required measurement is missing.';
}

// ─── Snapshot ───

/**
 * Build a sizing snapshot for persistence with the technician's selection.
 * Preserves: round-question answer, shape, interior/exterior measurements,
 * source question IDs, mounting method, measurement basis used,
 * matched fitting range, and flue identifier.
 */
export function buildSizingSnapshot(inputs, selection, options = {}) {
  const flueEntry = (inputs.flueEntries || []).find(e => e.flue_id === options.flueId) || (inputs.flueEntries || [])[0] || null;

  const measurements = {
    flue_tiles_round_answer: inputs.flueTilesRoundAnswer || '',
    flue_tiles_round: inputs.flueTilesRound ?? null,
    flue_shape: inputs.flueShape || (flueEntry?.shape) || null,
    flue_entries: inputs.flueEntries || [],
    flue_count: inputs.flueCount,
    crown_measurements: inputs.crownMeasurements,
    crown_diameter: inputs.crownDiameter,
    terracotta_present: inputs.terracottaPresent,
    flue_projection: inputs.flueProjection,
  };

  return {
    recommendation_id: options.recommendationId || '',
    finding_ids: options.findingIds || [],
    repair_template_id: options.repairTemplateId || '',
    mount_type: selection.mount_type,
    cap_style: selection.cap_style || '',
    original_measurements: measurements,
    measurement_hash: hashMeasurements(measurements),
    matrix_id: selection.matrix_id,
    matrix_name: selection.matrix_name || '',
    material_id: selection.material_id,
    material_sku: selection.material_sku,
    material_description: selection.material_description || selection.matrix_name || '',
    material_price: selection.material_price || 0,
    service_id: selection.service_id || '',
    nominal_height: selection.nominal_height,
    nominal_length: selection.nominal_length,
    nominal_width: selection.nominal_width,
    nominal_diameter: selection.nominal_diameter,
    min_fitting_diameter: selection.min_fitting_diameter,
    max_fitting_diameter: selection.max_fitting_diameter,
    measured_diameter: selection.measured_diameter,
    is_round_product: isRoundProduct(selection),
    compatible_shape: selection.compatible_shape,
    rotated_match: options.rotatedMatch || false,
    // Round-question answer and shape
    flue_tiles_round_answer: inputs.flueTilesRoundAnswer || '',
    flue_tiles_round: inputs.flueTilesRound ?? null,
    flue_shape: inputs.flueShape || (flueEntry?.shape) || null,
    // Interior and exterior measurements
    interior_measurements: flueEntry?.interior || null,
    exterior_measurements: flueEntry?.exterior || null,
    // Source question IDs
    source_question_ids: flueEntry?.source_question_ids || {},
    // Measurement basis used and matched fitting range
    measurement_basis: selection.measurement_basis || options.measurementBasis || '',
    matched_fitting_range: {
      min_fitting_diameter: selection.min_fitting_diameter || null,
      max_fitting_diameter: selection.max_fitting_diameter || null,
      min_fitting_length: selection.min_fitting_length || null,
      max_fitting_length: selection.max_fitting_length || null,
      min_fitting_width: selection.min_fitting_width || null,
      max_fitting_width: selection.max_fitting_width || null,
    },
    // Flue identifier
    flue_id: options.flueId || flueEntry?.flue_id || 'flue-1',
    // Finish
    finish: selection.finish,
    base_material: selection.base_material,
    finish_material_id: selection.finish_material_id || null,
    finish_service_id: selection.finish_service_id || null,
    finish_color: selection.finish_color,
    // Bolt-on eligibility
    bolt_on_eligible: determineBoltOnEligibility(inputs).eligible,
    // Metadata
    selection_group: 'chimney_cap_mounting_method',
    selection_timestamp: new Date().toISOString(),
    technician_id: options.technicianId || '',
  };
}

function hashMeasurements(measurements) {
  const str = JSON.stringify({
    r: measurements.flue_tiles_round_answer,
    s: measurements.flue_shape,
    fe: measurements.flue_entries,
    fc: measurements.flue_count,
    cm: measurements.crown_measurements,
    cd: measurements.crown_diameter,
    tp: measurements.terracotta_present,
    fp: measurements.flue_projection,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ─── Committed-work key builders ───

export function capBaseWorkKey(recommendationId, matrixProductId) {
  return `cap-base:${recommendationId}:${matrixProductId}`;
}
export function capFinishWorkKey(recommendationId, finishPricingId) {
  return `cap-finish:${recommendationId}:${finishPricingId}`;
}
export function capColorPremiumWorkKey(recommendationId, colorId) {
  return `cap-color-premium:${recommendationId}:${colorId}`;
}
export function capCutDownWorkKey(recommendationId, flueId) {
  return `cap-cutdown:${recommendationId}:${flueId}`;
}

// ─── Outdated detection ───

/**
 * Compare a stored snapshot's measurements against current inputs.
 */
export function isSnapshotOutdated(snapshot, inputs) {
  if (!snapshot) return false;

  if (snapshot.flue_tiles_round !== inputs.flueTilesRound) return true;
  if (snapshot.flue_shape !== inputs.flueShape) return true;
  if (snapshot.flue_count !== inputs.flueCount) return true;

  const oldEntries = JSON.stringify(snapshot.interior_measurements || snapshot.original_measurements?.flue_entries || []);
  const newEntries = JSON.stringify(inputs.flueEntries || []);
  if (oldEntries !== newEntries) return true;

  if (snapshot.original_measurements?.terracotta_present !== inputs.terracottaPresent) return true;
  if (snapshot.original_measurements?.flue_projection !== inputs.flueProjection) return true;

  const oldCrown = JSON.stringify(snapshot.original_measurements?.crown_measurements || null);
  const newCrown = JSON.stringify(inputs.crownMeasurements || null);
  if (oldCrown !== newCrown) return true;

  if (snapshot.original_measurements?.crown_diameter !== inputs.crownDiameter) return true;

  return false;
}