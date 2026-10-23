/**
 * Shared utility for computing missing required photos.
 * Used by inspection forms (pre-submit), InspectionSummaryDialog, and JobHub blockers.
 *
 * Photo requirements are configurable per-question via `photo_requirement_mode`,
 * independent of question type:
 *   - not_required       → no enforcement
 *   - optional           → photos allowed but not enforced
 *   - required_on_pass   → photos required only when answer is a Pass/Yes value
 *   - required_on_fail   → photos required only when answer is a Fail/No/Deficient value
 *   - always_required    → photos required regardless of answer
 */

const PASS_VALUES = new Set([
  'yes', 'pass', 'passed', 'ok', 'okay', 'good', 'acceptable', 'safe',
  'true', '1', 'complete', 'completed', 'satisfactory', 'meets_code',
]);
const FAIL_VALUES = new Set([
  'no', 'fail', 'failed', 'deficient', 'bad', 'unacceptable', 'unsafe',
  'defective', 'damaged', 'missing', 'broken', 'cracked', 'false', '0',
]);

function normalizeAnswer(answer) {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(a => String(a).toLowerCase().trim()).join(',');
  return String(answer).toLowerCase().trim();
}

/**
 * Determines whether the answer represents a "pass" (satisfactory) outcome.
 */
function isPassAnswer(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  return normalized.split(',').some(v => PASS_VALUES.has(v));
}

/**
 * Determines whether the answer represents a "fail" (deficient) outcome.
 */
function isFailAnswer(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  return normalized.split(',').some(v => FAIL_VALUES.has(v));
}

/**
 * Resolves the effective photo requirement mode for a question.
 * Falls back to the legacy `photo_required` boolean for backward compatibility.
 */
export function resolvePhotoRequirementMode(question) {
  if (!question) return 'not_required';
  if (question.photo_requirement && question.photo_requirement !== 'not_required') {
    return question.photo_requirement;
  }
  // Legacy: photo_required === true (or photo question type) → always_required
  if (question.photo_required === true || question.question_type === 'photo') {
    return 'always_required';
  }
  return question.photo_requirement || 'not_required';
}

/**
 * Checks whether the current answer matches any of the configured
 * photo_required_answer_values. Comparison is case-insensitive and
 * handles both single-value and multi-select (array) answers.
 */
function answerMatchesConfiguredValues(answer, configuredValues) {
  if (!configuredValues || !Array.isArray(configuredValues) || configuredValues.length === 0) {
    return false;
  }
  const configuredSet = new Set(
    configuredValues.map(v => String(v).toLowerCase().trim()).filter(Boolean)
  );
  if (configuredSet.size === 0) return false;

  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;

  // Multi-select answers are joined as comma-separated; split and check each.
  const answerValues = normalized.split(',').map(v => v.trim()).filter(Boolean);
  return answerValues.some(v => configuredSet.has(v));
}

/**
 * Evaluates whether photos are required for a question given its current answer.
 * @param {Object} question - InspectionQuestion record
 * @param {*} answer - the current answer value for the question
 * @returns {boolean} - true when the photo requirement is active for this answer
 */
export function isPhotoRequiredForAnswer(question, answer) {
  const mode = resolvePhotoRequirementMode(question);
  switch (mode) {
    case 'not_required':
    case 'optional':
      return false;
    case 'always_required':
      return true;
    case 'required_on_pass':
      return isPassAnswer(answer);
    case 'required_on_fail':
      return isFailAnswer(answer);
    case 'specific_answers':
      return answerMatchesConfiguredValues(answer, question.photo_required_answer_values);
    default:
      return false;
  }
}

/**
 * Computes missing required photos for a set of questions and answers.
 * @param {Array} questions - InspectionQuestion records (already filtered to the relevant module)
 * @param {Object} answers - answers object (parsed from InspectionSubmission.answers JSON)
 * @param {Array} visibleQuestionIds - optional set of question IDs that were visible (to skip hidden photo_required questions)
 * @returns {Array} - array of { questionId, questionText, required, current, missing, managerOverrideAllowed }
 */
export function getMissingRequiredPhotos(questions, answers, visibleQuestionIds = null) {
  if (!questions || !answers) return [];

  const visibleSet = visibleQuestionIds ? new Set(visibleQuestionIds) : null;

  return questions
    .filter(q => visibleSet ? visibleSet.has(q.id) : true)
    .map(q => {
      const answer = answers[q.id];
      const required = isPhotoRequiredForAnswer(q, answer);
      if (!required) return null;

      const photos = answers[`${q.id}_photos`] || (q.question_type === 'photo' ? answers[q.id] : []) || [];
      const minRequired = q.minimum_photos || (q.question_type === 'photo' ? 1 : 1);
      const current = Array.isArray(photos) ? photos.length : 0;
      const missing = Math.max(0, minRequired - current);
      if (missing === 0) return null;

      return {
        questionId: q.id,
        questionText: q.question_text,
        required: minRequired,
        current,
        missing,
        satisfied: false,
        allow_photo_override: q.allow_photo_override !== false,
        photo_override_reason_required: q.photo_override_reason_required === true,
        mode: resolvePhotoRequirementMode(q),
      };
    })
    .filter(Boolean);
}

/**
 * Parses answers from an InspectionSubmission record.
 */
function parseSubmissionAnswers(submission) {
  if (!submission?.answers) return {};
  if (typeof submission.answers === 'object') return submission.answers;
  try { return JSON.parse(submission.answers); } catch { return {}; }
}

/**
 * Computes missing required photos across multiple submissions.
 * @param {Array} submissions - InspectionSubmission records
 * @param {Array} allQuestions - all InspectionQuestion records
 * @returns {Array} - flat list of { submission, missingItems }
 */
export function getMissingPhotosForSubmissions(submissions, allQuestions) {
  if (!submissions || !allQuestions) return [];
  const results = [];

  for (const sub of submissions) {
    const answers = parseSubmissionAnswers(sub);
    const visibleIds = answers.__visible_question_ids || null;

    const subQuestions = allQuestions.filter(q => {
      if (q.inspection_module === 'inspection_setup') return false;
      if (sub.inspection_type === 'interior') {
        return !q.inspection_type || q.inspection_type === 'interior' || q.inspection_type === 'both';
      } else if (sub.inspection_type === 'exterior') {
        return q.inspection_type === 'exterior' || q.inspection_type === 'both';
      }
      return true;
    });

    const missing = getMissingRequiredPhotos(subQuestions, answers, visibleIds);
    if (missing.length > 0) {
      results.push({ submission: sub, missingItems: missing });
    }
  }

  return results;
}

/**
 * Total count of missing required photos across all submissions.
 */
export function countMissingPhotos(submissions, allQuestions) {
  const grouped = getMissingPhotosForSubmissions(submissions, allQuestions);
  return grouped.reduce((sum, g) => sum + g.missingItems.length, 0);
}