/**
 * Inspection Rules Engine
 * Evaluates LogicRule records (or static JSON rules) against current form answers
 * and returns triggered findings.
 */

/**
 * Evaluate a single condition against answers
 */
function evaluateCondition(condition, answers, meta = {}) {
  // Support both question_id (DB) and question_key (JSON reference)
  const val = answers[condition.question_id] ?? answers[condition.question_key] ?? meta[condition.question_key];
  const target = condition.value;

  switch (condition.operator) {
    case 'equals':
      return String(val).toLowerCase() === String(target).toLowerCase();
    case 'not_equals':
      return String(val).toLowerCase() !== String(target).toLowerCase();
    case 'contains':
      return Array.isArray(val) ? val.includes(target) : String(val).toLowerCase().includes(String(target).toLowerCase());
    case 'not_contains':
      return Array.isArray(val) ? !val.includes(target) : !String(val).toLowerCase().includes(String(target).toLowerCase());
    case 'in_list': {
      const list = Array.isArray(target) ? target : String(target).split(',').map(s => s.trim());
      return list.some(t => String(val).toLowerCase() === t.toLowerCase());
    }
    case 'greater_than':
      return parseFloat(val) > parseFloat(target);
    case 'less_than':
      return parseFloat(val) < parseFloat(target);
    default:
      return false;
  }
}

/**
 * Evaluate a single rule (from DB LogicRule entity or JSON)
 * Returns the finding object if triggered, null otherwise.
 */
function evaluateRule(rule, answers, meta = {}) {
  let conditions = [];

  // DB format: conditions_json is a JSON string
  if (rule.conditions_json) {
    try {
      conditions = JSON.parse(rule.conditions_json);
    } catch {
      return null;
    }
  // Static JSON format: conditions is already an array
  } else if (Array.isArray(rule.conditions)) {
    conditions = rule.conditions;
  } else {
    return null;
  }

  if (conditions.length === 0) return null;

  const logic = rule.logic || 'and';
  let triggered = false;

  if (logic === 'or') {
    triggered = conditions.some(c => evaluateCondition(c, answers, meta));
  } else {
    triggered = conditions.every(c => evaluateCondition(c, answers, meta));
  }

  if (!triggered) return null;

  return {
    rule_id: rule.id || rule.rule_name,
    rule_name: rule.rule_name,
    finding_type: rule.output_finding_type,
    severity: rule.output_severity,
    category: rule.category,
    narrative: rule.output_narrative,
    suggested_repair: rule.suggested_repair || rule.output_repair_id,
  };
}

/**
 * Run all rules against current answers.
 * @param {Array} rules - Array of LogicRule DB records or JSON rules
 * @param {Object} answers - { [questionId]: value }
 * @param {Object} meta - Extra context like { chimney_type, property_type, fuel_type }
 * @returns {Array} - Array of triggered finding objects
 */
export function runRulesEngine(rules, answers, meta = {}) {
  const findings = [];
  for (const rule of rules) {
    if (rule.is_active === false) continue; // skip inactive DB rules
    const finding = evaluateRule(rule, answers, meta);
    if (finding) findings.push(finding);
  }
  // Sort by severity: critical > major > moderate > minor > info
  const order = { critical: 0, major: 1, moderate: 2, minor: 3, info: 4 };
  return findings.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
}

export const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'Critical' },
  major:    { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: 'Major' },
  moderate: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: 'Moderate' },
  minor:    { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', label: 'Minor' },
  info:     { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', label: 'Info' },
};