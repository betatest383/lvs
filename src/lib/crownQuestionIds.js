/**
 * Stable question IDs for Crown Calculation inspection-answer extraction.
 * These are MongoDB ObjectId strings that serve as the stable identifiers.
 * Do NOT match by question text — wording may change.
 */
export const CROWN_QUESTION_IDS = {
  flue_measurements: '69c365ed38b67af793acbe73',
  crown_cracks: '69c365ed38b67af793acbe7b',
  repair_method: '69c365ed38b67af793acbe7c',
  crown_measurements: '69c365ed38b67af793acbe7d',
  brick_courses: '6a55b11af4425ddf7efd8d65',
  crown_step_in: '6a55b11ac02d312f0d86eb2a',
};

/**
 * Parse "length x width" from a text answer.
 * Supports: "33x35", "33 x 35", "33 X 35", "33×35"
 * @returns {length, width} or null
 */
export function parseDimensions(text) {
  if (!text) return null;
  const match = String(text).trim().match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (match) return { length: parseFloat(match[1]), width: parseFloat(match[2]) };
  return null;
}

/**
 * Parse multiple "length x width" dimensions from a text answer.
 * Supports comma, semicolon, and newline separators.
 * e.g. "8x13, 12x12" → [{length: 8, width: 13}, {length: 12, width: 12}]
 * @returns array of {length, width}
 */
export function parseMultipleDimensions(text) {
  if (!text) return [];
  const parts = String(text).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const part of parts) {
    const dim = parseDimensions(part);
    if (dim) results.push(dim);
  }
  return results;
}

/**
 * Parse a single diameter from a text answer.
 * Returns null if the text contains an "x"/"×" separator (indicating L×W, not a diameter).
 * @returns number or null
 */
export function parseDiameter(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  // If it contains an LxW pattern, it's not a diameter
  if (/\d+\s*[xX×]\s*\d+/.test(trimmed)) return null;
  // Try to parse as a single number
  const match = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  return null;
}

/**
 * Parse multiple diameter values from a text answer (one per separated entry).
 * Entries with LxW patterns are skipped (not round).
 * @returns array of numbers (diameters)
 */
export function parseMultipleDiameters(text) {
  if (!text) return [];
  const parts = String(text).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const part of parts) {
    const d = parseDiameter(part);
    if (d !== null) results.push(d);
  }
  return results;
}

/**
 * Build CrownCalculation measurements from merged inspection answers.
 * @param {object} mergedAnswers - question_id → answer value
 * @returns {{ measurements, missing, sourceQuestionIds }}
 */
export function extractCrownMeasurements(mergedAnswers) {
  const Q = CROWN_QUESTION_IDS;
  const missing = [];

  // Crown measurements (length × width)
  const crownDims = parseDimensions(mergedAnswers[Q.crown_measurements]);
  if (!crownDims) {
    missing.push({ question_id: Q.crown_measurements, label: 'Crown measurements (length × width)' });
  }

  // Flue measurements (multiple)
  const flues = parseMultipleDimensions(mergedAnswers[Q.flue_measurements]);
  if (flues.length === 0) {
    missing.push({ question_id: Q.flue_measurements, label: 'Exterior flue tile measurements' });
  }

  // Brick courses (Yes/No — defaults to false)
  const brickRaw = String(mergedAnswers[Q.brick_courses] || '').toLowerCase().trim();
  const removing_brick_courses = brickRaw === 'yes' || brickRaw === 'true';

  // Crown step in (Yes/No — defaults to false)
  const stepRaw = String(mergedAnswers[Q.crown_step_in] || '').toLowerCase().trim();
  const crown_step_in = stepRaw === 'yes' || stepRaw === 'true';

  const measurements = {
    crown_form_length: crownDims ? crownDims.length : 0,
    crown_form_width: crownDims ? crownDims.width : 0,
    flues,
    removing_brick_courses,
    crown_step_in,
  };

  return {
    measurements,
    missing,
    sourceQuestionIds: Q,
  };
}