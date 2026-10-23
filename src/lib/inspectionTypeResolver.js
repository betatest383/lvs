/**
 * Inspection Type Resolver
 * Resolves Chimney Type and Appliance Type from inspection answers
 * using the Inspection Engine (questions + rules). This is the single
 * source of truth — technicians answer inspection questions, and the
 * engine determines these classification values automatically.
 */

// Canonical values that downstream systems expect
export const CHIMNEY_TYPES = ['masonry', 'prefab', 'metal', 'other'];
export const APPLIANCE_TYPES = ['wood_stove', 'wood_insert', 'gas', 'oil', 'pellet', 'electric', 'other'];

// Keyword → canonical value maps (case-insensitive substring match)
const CHIMNEY_KEYWORDS = {
  masonry: ['masonry', 'brick', 'stone chimney', 'block chimney', 'mortar joint', 'brickwork'],
  prefab: ['prefab', 'prefabricated', 'factory built', 'zero clearance', 'metal chase', 'wood chase'],
  metal: ['metal chimney', 'stainless steel liner', 'class a', ' insulated pipe'],
  other: ['other chimney', 'unknown chimney'],
};

const APPLIANCE_KEYWORDS = {
  wood_stove: ['wood stove', 'freestanding stove', 'free standing stove'],
  wood_insert: ['wood insert', 'insert', 'fireplace insert'],
  gas: ['gas', 'natural gas', 'propane', 'lp ', 'gas log', 'gas fireplace', 'gas insert'],
  oil: ['oil', 'oil furnace', 'oil boiler', 'oil fired'],
  pellet: ['pellet', 'pellet stove', 'pellet insert'],
  electric: ['electric', 'electric fireplace', 'electric insert'],
  other: ['other appliance', 'unknown appliance'],
};

/**
 * Scan all answer values for keywords that indicate a specific type.
 * Returns the first matching canonical value, or null if unresolved.
 */
function resolveFromAnswers(answers, keywordMap, canonicalValues) {
  const values = Object.values(answers);
  for (const val of values) {
    if (val === null || val === undefined) continue;
    const text = Array.isArray(val) ? val.join(' ') : String(val);
    const lower = text.toLowerCase();
    for (const [canonical, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return canonical;
      }
    }
  }
  // Also check if any answer directly matches a canonical value
  for (const val of values) {
    if (val === null || val === undefined) continue;
    const lower = String(val).toLowerCase().trim();
    if (canonicalValues.includes(lower)) return lower;
  }
  return null;
}

/**
 * Resolve chimney type and appliance type from inspection answers.
 * @param {Object} answers - { [questionId]: value }
 * @returns {{ chimneyType: string|null, applianceType: string|null }}
 */
export function resolveInspectionTypes(answers) {
  return {
    chimneyType: resolveFromAnswers(answers, CHIMNEY_KEYWORDS, CHIMNEY_TYPES),
    applianceType: resolveFromAnswers(answers, APPLIANCE_KEYWORDS, APPLIANCE_TYPES),
  };
}