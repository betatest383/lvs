/**
 * Inspection Question Ordering Utilities
 *
 * Provides stable, section-scoped sorting and auto-ordering for InspectionQuestion records.
 *
 * Sort priority (stable fallback):
 *   1. sort_order ascending (null/0 treated as Infinity → sorted last)
 *   2. section order (canonical SECTIONS constant order)
 *   3. created_date ascending
 *   4. id ascending
 */

const SECTION_ORDER = [
  'general_info', 'exterior', 'interior', 'firebox', 'damper', 'flue',
  'chimney_cap', 'crown', 'flashing', 'smoke_chamber', 'liner', 'hearth',
  'clearances', 'carbon_monoxide', 'water_damage', 'structural', 'other',
];

const SECTION_LABELS = {
  general_info: 'General Info',
  exterior: 'Exterior',
  interior: 'Interior',
  firebox: 'Firebox',
  damper: 'Damper',
  flue: 'Flue',
  chimney_cap: 'Chimney Cap',
  crown: 'Crown',
  flashing: 'Flashing',
  smoke_chamber: 'Smoke Chamber',
  liner: 'Liner',
  hearth: 'Hearth',
  clearances: 'Clearances',
  carbon_monoxide: 'Carbon Monoxide',
  water_damage: 'Water Damage',
  structural: 'Structural',
  other: 'Other',
};

export function sectionIndex(category) {
  const idx = SECTION_ORDER.indexOf(category);
  return idx === -1 ? SECTION_ORDER.length : idx;
}

export function sectionLabel(category) {
  return SECTION_LABELS[category] ||
    (category ? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown');
}

/** Treat null/undefined/0/NaN as Infinity so they sort to the end. */
function safeSortOrder(q) {
  const so = Number(q.sort_order);
  return (!so || isNaN(so)) ? Infinity : so;
}

function stableCompare(a, b) {
  const soDiff = safeSortOrder(a) - safeSortOrder(b);
  if (soDiff !== 0) return soDiff;
  const secDiff = sectionIndex(a.category) - sectionIndex(b.category);
  if (secDiff !== 0) return secDiff;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Stable sort: sort_order asc → section order → id asc.
 * @param {Array} questions
 * @returns {Array} new sorted array
 */
export function stableSortQuestions(questions) {
  return [...questions].sort(stableCompare);
}

/**
 * Compute the next sort_order within the same inspection_type + category scope.
 * @param {Array} questions all questions (typically the full loaded list)
 * @param {string} inspectionType
 * @param {string} category
 * @returns {number} max(sort_order) + 1, or 1 if no existing questions
 */
export function computeNextSortOrder(questions, inspectionType, category) {
  const scoped = questions.filter(q =>
    (q.inspection_type || 'interior') === (inspectionType || 'interior') &&
    (q.category || 'other') === (category || 'other')
  );
  let max = 0;
  for (const q of scoped) {
    const so = Number(q.sort_order);
    if (!isNaN(so) && so > max) max = so;
  }
  return max + 1;
}

/**
 * Get the 1-based position of a question within its section (inspection_type + category).
 * For unsaved questions (no id), returns scoped.length + 1 (next position at bottom).
 * @param {Array} questions
 * @param {object} question
 * @returns {number}
 */
export function getSectionPosition(questions, question) {
  const scoped = stableSortQuestions(questions.filter(q =>
    (q.inspection_type || 'interior') === ((question && question.inspection_type) || 'interior') &&
    (q.category || 'other') === ((question && question.category) || 'other')
  ));
  const idx = scoped.findIndex(q => q.id === (question && question.id));
  return idx >= 0 ? idx + 1 : scoped.length + 1;
}

/**
 * Parse every question id referenced by a conditional question's visibility_rule.
 * Handles both the multi-condition format ({conditions:[...], logic}) and the
 * single-condition format ({question_id, operator, value}). Self-references and
 * ids not present on the form are filtered by the caller.
 *
 * @param {object} question
 * @returns {string[]} referenced question ids (deduped, order preserved)
 */
export function parseVisibilityDependencyIds(question) {
  if (!question.visibility_rule) return [];
  let rule;
  try { rule = JSON.parse(question.visibility_rule); } catch { return []; }
  const ids = [];
  const seen = new Set();
  const push = (id) => { if (id && !seen.has(id)) { seen.add(id); ids.push(id); } };
  if (rule.conditions && Array.isArray(rule.conditions)) {
    for (const c of rule.conditions) push(c.question_id);
  } else if (rule.question_id) {
    push(rule.question_id);
  }
  return ids;
}

/**
 * Compute the render order of inspection questions using two placement modes for
 * conditional follow-ups:
 *
 *   • Fixed anchor — when a question sets display_after_question_id to another
 *     on-form question, it renders directly below that anchor (and nested
 *     follow-ups of it render below it). This is the optional override for
 *     questions that truly have one fixed parent.
 *
 *   • Dynamic "after last visible triggering dependency" — when a conditional
 *     question has no explicit anchor, it renders immediately after the last
 *     visible referenced dependency whose condition is currently satisfied
 *     (i.e. the dependency that actually triggered the follow-up). If several
 *     triggering dependencies are visible, the one appearing latest in the
 *     current displayed sequence is used. No Sort Order or fixed anchor is
 *     required. When no triggering dependency is visible, falls back to the
 *     last visible referenced dependency; if none, the question appends.
 *
 * Base/root questions (no on-form dependencies) render in stable Sort Order.
 * Visibility is still controlled by each question's own visibility_rule in the
 * form; this function only determines position. Saved sort_order is never
 * changed — ordering is computed in memory from the current answers.
 *
 * Guarantees:
 *   - No duplicate rendering (each question placed once).
 *   - Circular dependencies are broken gracefully (participants render at the
 *     end in stable order).
 *   - Hidden dynamic/fixed questions are omitted from the sequence entirely;
 *     the form's render filter still hides base questions whose own rule fails.
 *
 * @param {Array} questions all questions on the current form
 * @param {(q:object)=>boolean} isVisible visibility evaluator over current answers
 * @param {(q:object)=>string[]} [getSatisfiedDepIds] returns referenced dep ids
 *        whose specific condition is currently satisfied (the triggering deps).
 *        When omitted, dynamic mode falls back to "last visible referenced dep".
 * @returns {Array} ordered questions (input not mutated)
 */
export function computeConditionalFormOrder(questions, isVisible, getSatisfiedDepIds) {
  const getSatisfied = typeof getSatisfiedDepIds === 'function' ? getSatisfiedDepIds : () => [];
  const validIds = new Set(questions.map(q => q.id));
  const byId = new Map(questions.map(q => [q.id, q]));

  const modeOf = new Map();        // id -> 'base' | 'fixed' | 'dynamic'
  const fixedParentOf = new Map(); // id -> anchor id (fixed mode)
  const referencedOf = new Map(); // id -> all on-form referenced ids
  const candidatesOf = new Map();  // dynamic id -> ordered candidate anchor ids

  const computeCandidates = (q, referenced) => {
    const triggering = getSatisfied(q).filter(id => referenced.includes(id));
    const visibleTriggering = triggering.filter(id => byId.has(id) && isVisible(byId.get(id)));
    return visibleTriggering.length > 0
      ? visibleTriggering
      : referenced.filter(id => byId.has(id) && isVisible(byId.get(id)));
  };

  for (const q of questions) {
    const anchor = q.display_after_question_id;
    const referenced = parseVisibilityDependencyIds(q).filter(id => validIds.has(id) && id !== q.id);
    referencedOf.set(q.id, referenced);
    const pm = q.placement_mode;
    if (pm === 'standard_sort') {
      modeOf.set(q.id, 'base');
    } else if (pm === 'fixed_after_selected') {
      if (anchor && validIds.has(anchor) && anchor !== q.id) {
        modeOf.set(q.id, 'fixed');
        fixedParentOf.set(q.id, anchor);
      } else {
        modeOf.set(q.id, 'base');
      }
    } else if (pm === 'after_last_visible_trigger') {
      modeOf.set(q.id, 'dynamic');
      candidatesOf.set(q.id, computeCandidates(q, referenced));
    } else {
      // Legacy inference (no explicit placement_mode).
      if (anchor && validIds.has(anchor) && anchor !== q.id) {
        modeOf.set(q.id, 'fixed');
        fixedParentOf.set(q.id, anchor);
      } else if (referenced.length > 0) {
        modeOf.set(q.id, 'dynamic');
        candidatesOf.set(q.id, computeCandidates(q, referenced));
      } else {
        modeOf.set(q.id, 'base');
      }
    }
  }

  const stable = [...questions].sort(stableCompare);

  const result = [];
  const placed = new Set();
  const visiting = new Set();   // cycle guard for in-progress placements
  const effParent = new Map();  // id -> effective anchor id (for subtree detection)

  const isUnder = (candId, rootId) => {
    let cur = candId;
    while (cur) {
      if (cur === rootId) return true;
      cur = effParent.get(cur) || null;
    }
    return false;
  };

  const insertAfterAnchor = (anchorId, q) => {
    const idx = result.findIndex(r => r.id === anchorId);
    if (idx === -1) { result.push(q); effParent.set(q.id, null); placed.add(q.id); return; }
    let j = idx;
    while (j + 1 < result.length && isUnder(result[j + 1].id, anchorId)) j++;
    result.splice(j + 1, 0, q);
    effParent.set(q.id, anchorId);
    placed.add(q.id);
  };

  const isReadyFixed = (q) => {
    if (!isVisible(q)) return false;
    const parent = fixedParentOf.get(q.id);
    return !!parent && !!byId.get(parent) && isVisible(byId.get(parent)) && placed.has(parent);
  };
  const isReadyDynamic = (q) => {
    if (!isVisible(q)) return false;
    const candidates = candidatesOf.get(q.id) || [];
    return candidates.every(c => placed.has(c));
  };

  const flushReady = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of stable) {
        if (placed.has(q.id) || visiting.has(q.id)) continue;
        const mode = modeOf.get(q.id);
        if (mode === 'fixed' && isReadyFixed(q)) { place(q); changed = true; }
        else if (mode === 'dynamic' && isReadyDynamic(q)) { place(q); changed = true; }
      }
    }
  };

  function place(q) {
    if (placed.has(q.id) || visiting.has(q.id)) return;
    visiting.add(q.id);
    const mode = modeOf.get(q.id);
    if (mode === 'base') {
      result.push(q);
      effParent.set(q.id, null);
      placed.add(q.id);
    } else if (mode === 'fixed') {
      const parent = fixedParentOf.get(q.id);
      if (placed.has(parent) && isVisible(byId.get(parent))) {
        insertAfterAnchor(parent, q);
      } else {
        // Anchor not visible/placed — fall back to base append so the question
        // is still available (its own visibility_rule will gate rendering).
        result.push(q);
        effParent.set(q.id, null);
        placed.add(q.id);
      }
    } else { // dynamic
      const candidates = (candidatesOf.get(q.id) || []).filter(c => placed.has(c));
      if (candidates.length > 0) {
        let lastDep = candidates[0];
        let lastIdx = result.findIndex(r => r.id === lastDep);
        for (const c of candidates) {
          const i = result.findIndex(r => r.id === c);
          if (i > lastIdx) { lastIdx = i; lastDep = c; }
        }
        insertAfterAnchor(lastDep, q);
      } else {
        // Visible but no visible/triggering dependency placed — append in stable order.
        result.push(q);
        effParent.set(q.id, null);
        placed.add(q.id);
      }
    }
    visiting.delete(q.id);
    flushReady();
  }

  // Drive: place base questions in stable order; each placement flushes any
  // fixed/dynamic follow-ups that become ready.
  for (const q of stable) {
    if (placed.has(q.id)) continue;
    if (modeOf.get(q.id) === 'base') place(q);
    flushReady();
  }

  // Final pass: any visible question not yet placed (orphan, cycle, or dynamic
  // whose referenced deps are all hidden) appends in stable order.
  for (const q of stable) {
    if (!placed.has(q.id) && isVisible(q)) {
      result.push(q);
      effParent.set(q.id, null);
      placed.add(q.id);
    }
  }

  return result;
}