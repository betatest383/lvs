// Pure helpers for clearing inspection answers on the active InspectionSubmission
// only. These never mutate the master InspectionQuestion/template/configuration —
// they only operate on the in-memory `answers`/`photos` state of the live form.

// Parse a question's visibility_rule and return the referenced question ids.
export function parseVisibilityDepIds(question) {
  if (!question || !question.visibility_rule) return [];
  try {
    const rule = typeof question.visibility_rule === 'string'
      ? JSON.parse(question.visibility_rule)
      : question.visibility_rule;
    const conds = rule && rule.conditions && Array.isArray(rule.conditions)
      ? rule.conditions
      : (rule && rule.question_id ? [rule] : []);
    const ids = [];
    for (const c of conds) if (c && c.question_id) ids.push(c.question_id);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

// Returns the set of question ids whose visibility depends (directly or
// indirectly) on `clearedId`. These are the follow-ups that must be cascade-
// cleared when the parent answer is cleared.
export function getTransitiveDependents(questions, clearedId) {
  const result = new Set();
  const seen = new Set([clearedId]);
  const queue = [clearedId];
  while (queue.length) {
    const cur = queue.shift();
    for (const q of questions) {
      if (q.id === clearedId || result.has(q.id)) continue;
      const deps = parseVisibilityDepIds(q);
      if (deps.includes(cur)) {
        result.add(q.id);
        if (!seen.has(q.id)) {
          seen.add(q.id);
          queue.push(q.id);
        }
      }
    }
  }
  return result;
}

// Every answer key tied to a question: the answer itself, `${id}_photos`, and
// any `${id}_<subfield>` keys (measurements/sub-fields). The trailing underscore
// guard prevents collisions when one id is a prefix of another.
export function questionAnswerKeys(question, answers) {
  const keys = new Set([question.id]);
  try {
    const subFields = JSON.parse(question.sub_fields || '[]');
    for (const sf of subFields) {
      if (sf && sf.name) keys.add(`${question.id}_${sf.name}`);
    }
  } catch { /* malformed sub_fields — ignore */ }
  keys.add(`${question.id}_photos`);
  for (const k of Object.keys(answers || {})) {
    if (k.startsWith(`${question.id}_`)) keys.add(k);
  }
  return keys;
}

// Remove all answer keys for the given question ids, returning a new answers
// object. Unrelated answers are preserved.
export function clearAnswersForQuestions(answers, questions, ids) {
  const idSet = new Set(ids);
  const affected = questions.filter(q => idSet.has(q.id));
  const keysToRemove = new Set();
  for (const q of affected) {
    for (const k of questionAnswerKeys(q, answers)) keysToRemove.add(k);
  }
  const next = {};
  for (const [k, v] of Object.entries(answers || {})) {
    if (!keysToRemove.has(k)) next[k] = v;
  }
  return next;
}

// Photo URLs attached to the given questions (per-question `_photos` arrays, or
// the answer array for photo-type questions). Used to drop those URLs from the
// form's global `photos` list on clear.
export function photosForQuestions(answers, questions, ids) {
  const idSet = new Set(ids);
  const affected = questions.filter(q => idSet.has(q.id));
  const urls = new Set();
  for (const q of affected) {
    const perQ = answers[`${q.id}_photos`];
    if (Array.isArray(perQ)) for (const u of perQ) if (typeof u === 'string') urls.add(u);
    const direct = answers[q.id];
    if (Array.isArray(direct)) for (const u of direct) if (typeof u === 'string') urls.add(u);
  }
  return Array.from(urls);
}