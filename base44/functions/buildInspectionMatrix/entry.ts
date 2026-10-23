import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Category → Section / Subsection mapping
const CATEGORY_MAP = {
  general_info:     { section: 'General Info', subsection: 'Property' },
  exterior:         { section: 'Exterior', subsection: 'Exterior' },
  interior:         { section: 'Interior', subsection: 'Interior' },
  firebox:          { section: 'Interior', subsection: 'Firebox' },
  damper:           { section: 'Interior', subsection: 'Damper' },
  flue:             { section: 'Interior', subsection: 'Flue' },
  chimney_cap:      { section: 'Exterior', subsection: 'Chimney Cap' },
  crown:            { section: 'Exterior', subsection: 'Crown' },
  flashing:         { section: 'Exterior', subsection: 'Flashing' },
  smoke_chamber:    { section: 'Interior', subsection: 'Smoke Chamber' },
  liner:            { section: 'Interior', subsection: 'Liner' },
  hearth:           { section: 'Interior', subsection: 'Hearth' },
  clearances:       { section: 'Interior', subsection: 'Clearances' },
  carbon_monoxide:  { section: 'Safety', subsection: 'Carbon Monoxide' },
  water_damage:     { section: 'Interior', subsection: 'Water Damage' },
  structural:       { section: 'Exterior', subsection: 'Structural' },
  other:            { section: 'General Info', subsection: 'Other' },
};

// Category → Repair System mapping
const CATEGORY_TO_REPAIR_SYSTEM = {
  crown:           { system: 'crown', title: 'Cast-in-Place Concrete Crown Replacement', deficiencyTypes: ['cracked_crown','spalling_crown','crown_wash_failure','deteriorated_crown','missing_drip_edge','water_entry_crown'] },
  chimney_cap:     { system: 'cap_chase', title: 'Chimney Cap / Chase Cover Replacement', deficiencyTypes: ['missing_cap','damaged_cap','rusted_chase_cover','water_stains_cap','animal_entry','deteriorated_chase_cover'] },
  liner:           { system: 'liner', title: 'Stainless Steel Liner System', deficiencyTypes: ['cracked_clay_liner','damaged_liner','deteriorated_flue','missing_flue_mortar','improper_sizing','unsafe_venting','gaps_flue_tiles'] },
  flue:            { system: 'liner', title: 'Stainless Steel Liner System', deficiencyTypes: ['creosote_buildup','damaged_liner','deteriorated_flue'] },
  smoke_chamber:   { system: 'smoke_chamber', title: 'Smoke Chamber Resurfacing', deficiencyTypes: ['smoke_chamber_gaps','smoke_chamber_cracking','corbeling_issues','creosote_buildup','rough_smoke_chamber','smoke_chamber_deterioration'] },
  firebox:         { system: 'masonry', title: 'Chimney Masonry Restoration', deficiencyTypes: ['cracked_firebox_brick','deteriorated_mortar','missing_mortar_joints','spalling_brick'] },
  flashing:        { system: 'masonry', title: 'Chimney Masonry Restoration', deficiencyTypes: ['flashing_failure','water_intrusion'] },
  water_damage:    { system: 'masonry', title: 'Chimney Masonry Restoration', deficiencyTypes: ['water_intrusion','spalling_brick','efflorescence'] },
  structural:      { system: 'masonry', title: 'Chimney Masonry Restoration', deficiencyTypes: ['leaning_chimney','loose_brick','spalling_brick','cracked_bricks'] },
  damper:          { system: 'other', title: 'Damper Repair', deficiencyTypes: ['damaged_damper','missing_damper'] },
  hearth:          { system: 'other', title: 'Hearth Extension', deficiencyTypes: ['inadequate_hearth','cracked_hearth'] },
  clearances:      { system: 'other', title: 'Clearance Correction', deficiencyTypes: ['inadequate_clearance'] },
  carbon_monoxide: { system: 'other', title: 'CO Safety', deficiencyTypes: ['co_risk'] },
  general_info:    { system: 'none', title: '', deficiencyTypes: [] },
  exterior:        { system: 'none', title: '', deficiencyTypes: [] },
  interior:        { system: 'none', title: '', deficiencyTypes: [] },
  other:           { system: 'none', title: '', deficiencyTypes: [] },
};

const NFPA_REFERENCES = {
  crown: 'NFPA 211 §14.2 — Crown weather protection',
  chimney_cap: 'NFPA 211 §14.2.1 — Spark arrestor / rain cap',
  liner: 'NFPA 211 §14.9 — Flue lining requirements',
  flue: 'NFPA 211 §14.9 — Flue lining requirements',
  smoke_chamber: 'NFPA 211 §14.11 — Smoke chamber requirements',
  firebox: 'NFPA 211 §14.10 — Firebox requirements',
  flashing: 'NFPA 211 §14.4 — Masonry requirements',
  clearances: 'NFPA 211 §14.15 — Clearance to combustibles',
  hearth: 'NFPA 211 §14.12 — Hearth requirements',
  carbon_monoxide: 'NFPA 211 §14.9 / NFPA 720 — CO detection',
  structural: 'NFPA 211 §14.4 — Masonry requirements',
  damper: 'NFPA 211 §14.13 — Damper requirements',
  water_damage: 'NFPA 211 §14.4 — Masonry requirements',
};

const SAFETY_CATEGORIES = ['carbon_monoxide', 'structural', 'liner', 'flue', 'firebox', 'clearances'];
const MEASUREMENT_KEYWORDS = ['measurement', 'dimension', 'clearance', 'height', 'width', 'depth', 'diameter', 'area', 'length', 'distance', 'size'];
const NFPA_KEYWORDS = ['clearance', 'combustible', 'nfpa', 'code', 'safety', 'carbon monoxide', 'co detector', 'listing', 'listed', 'vent', 'draft', 'spark', 'fireblock', 'storm collar', 'thimble'];

// ─── Purpose Inference ────────────────────────────────────────────

function inferQuestionPurposes(q, role, isNFPA, isSafety, hasMapping, showOnReport, showOnMaterialList, isPhotoType, isMeas, sysConfig, suggestsUpgrade, wWarehouse, wFleet, wAnalytics) {
  // If explicitly set on the question, use it
  if (q.question_purpose && Array.isArray(q.question_purpose) && q.question_purpose.length > 0) {
    return { purposes: q.question_purpose, inferred: false, needsReview: false };
  }

  const text = (q.question_text || '').toLowerCase();
  const purposes = [];
  let needsReview = false;

  // Safety
  if (isSafety || text.includes('safety') || text.includes('unsafe') || text.includes('hazard')) {
    purposes.push('safety');
  }

  // NFPA / Code Compliance
  if (isNFPA) {
    purposes.push('nfpa_code_compliance');
  }

  // Documentation
  if (showOnReport && role !== 'administrative') {
    purposes.push('documentation');
  }

  // Customer Education
  if (showOnReport && (role === 'observation' || role === 'derived_result') && (hasMapping || sysConfig.system !== 'none')) {
    purposes.push('customer_education');
  }

  // Estimate Generation
  if (hasMapping || (role === 'observation' && sysConfig.system !== 'none')) {
    purposes.push('estimate_generation');
  }

  // Material Calculation
  if (showOnMaterialList || (isMeas && role === 'measurement')) {
    purposes.push('material_calculation');
  }

  // Repair Recommendation
  if (sysConfig.system !== 'none' && (role === 'observation' || role === 'derived_result')) {
    purposes.push('repair_recommendation');
  }

  // Before / After Gallery
  if (isPhotoType || role === 'photo') {
    purposes.push('before_after_gallery');
  }

  // Internal Technician Notes
  if (!showOnReport || role === 'administrative') {
    purposes.push('internal_technician_notes');
  }

  // Sales Opportunity
  if (suggestsUpgrade) {
    purposes.push('sales_opportunity');
  }

  // Warranty
  if (text.includes('warranty')) {
    purposes.push('warranty');
  }

  // Membership
  if (text.includes('membership')) {
    purposes.push('membership');
  }

  // Scheduling
  if (role === 'customer_information' || text.includes('scheduling') || text.includes('schedule')) {
    purposes.push('scheduling');
  }

  // Warehouse Planning
  if (wWarehouse) {
    purposes.push('warehouse_planning');
  }

  // Fleet Planning
  if (wFleet) {
    purposes.push('fleet_planning');
  }

  // Analytics
  if (wAnalytics) {
    purposes.push('analytics');
  }

  // Administrative
  if (role === 'administrative') {
    purposes.push('administrative');
  }

  // If no purposes inferred, flag for review
  if (purposes.length === 0) {
    purposes.push('documentation');
    needsReview = true;
  }

  return { purposes, inferred: true, needsReview };
}

// ─── Category Inference ───────────────────────────────────────────

const CATEGORY_INFERENCE_RULES = [
  { keywords: ['clearance', 'combustible'], category: 'Clearance to Combustibles' },
  { keywords: ['crown'], category: 'Chimney Crown' },
  { keywords: ['spark arrestor', 'rain cap', 'chimney cap', 'cap '], category: 'Chimney Cap' },
  { keywords: ['chase cover', 'chase'], category: 'Chase Cover' },
  { keywords: ['flashing', 'counter flashing'], category: 'Flashing' },
  { keywords: ['spalling', 'brick', 'masonry'], category: 'Brick / Masonry' },
  { keywords: ['mortar joint', 'mortar'], category: 'Mortar Joints' },
  { keywords: ['flue liner', 'flue tile', 'liner', 'flue'], category: 'Chimney Liner' },
  { keywords: ['smoke chamber'], category: 'Smoke Chamber' },
  { keywords: ['firebox', 'fire box'], category: 'Firebox' },
  { keywords: ['damper'], category: 'Damper' },
  { keywords: ['hearth extension', 'hearth'], category: 'Hearth Extension' },
  { keywords: ['b-vent', 'l-vent', 'vent pipe', 'venting'], category: 'Appliance Venting' },
  { keywords: ['wood stove', 'woodstove'], category: 'Wood Stove' },
  { keywords: ['gas log', 'gas insert', 'gas appliance'], category: 'Gas Appliance' },
  { keywords: ['pellet stove', 'pellet'], category: 'Pellet Appliance' },
  { keywords: ['boiler', 'furnace'], category: 'Boiler / Furnace Venting' },
  { keywords: ['water intrusion', 'water entry', 'leak', 'water stain'], category: 'Water Intrusion' },
  { keywords: ['animal', 'nest', 'bird'], category: 'Animal Entry' },
  { keywords: ['structural', 'leaning', 'crack'], category: 'Structural Stability' },
  { keywords: ['roof access', 'roof '], category: 'Roof Access' },
  { keywords: ['safety equipment', 'harness', 'ladder', 'fall protection'], category: 'Safety Equipment' },
  { keywords: ['customer concern', 'customer comment'], category: 'Customer Concern' },
];

const EXISTING_CATEGORY_MAP = {
  crown: 'Chimney Crown',
  chimney_cap: 'Chimney Cap',
  liner: 'Chimney Liner',
  flue: 'Chimney Liner',
  smoke_chamber: 'Smoke Chamber',
  firebox: 'Firebox',
  damper: 'Damper',
  hearth: 'Hearth Extension',
  clearances: 'Clearance to Combustibles',
  carbon_monoxide: 'Safety Equipment',
  water_damage: 'Water Intrusion',
  structural: 'Structural Stability',
  flashing: 'Flashing',
  general_info: 'Administrative',
  exterior: 'Administrative',
  interior: 'Administrative',
  other: 'Administrative',
};

function inferQuestionCategory(q, role, existingCategory) {
  // If explicitly set on the question, use it
  if (q.question_category) {
    return { category: q.question_category, inferred: false };
  }

  // Role-based defaults
  if (role === 'photo') return { category: 'Photos', inferred: true };
  if (role === 'administrative') return { category: 'Administrative', inferred: true };
  if (role === 'measurement' || role === 'calculation_input') return { category: 'Measurements', inferred: true };

  // Try keyword inference from question text
  const text = (q.question_text || '').toLowerCase();
  for (const rule of CATEGORY_INFERENCE_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return { category: rule.category, inferred: true };
    }
  }

  // Fall back to existing category mapping
  const mapped = EXISTING_CATEGORY_MAP[existingCategory];
  if (mapped) return { category: mapped, inferred: true };

  return { category: 'Administrative', inferred: true };
}

// ─── Role Inference ───────────────────────────────────────────────

const CUSTOMER_INFO_KEYWORDS = ['customer concern', 'preferred', 'customer comment', 'scheduling preference', 'customer note'];
const ADMIN_KEYWORDS = ['technician note', 'inspector name', 'inspection version', 'internal note', 'internal tracking', 'tracking number', 'invoice number'];
const VERIFICATION_KEYWORDS = ['verified', 'confirm', 'verification', 'check tag', 'check serial', 'verify access'];
const DERIVED_RESULT_KEYWORDS = ['complies', 'compliant', 'acceptable', 'passes', 'within code', 'meets requirement', 'is adequate', 'is sufficient', 'is proper', 'is correct'];

function inferQuestionRole(q, showOnMaterialList) {
  // If explicitly set on the question, use it
  if (q.question_role) return { role: q.question_role, inferred: false };

  const text = (q.question_text || '').toLowerCase();
  const type = q.question_type || '';

  // Photo type → photo role
  if (type === 'photo') return { role: 'photo', inferred: true };

  // Customer information
  if (CUSTOMER_INFO_KEYWORDS.some(kw => text.includes(kw))) return { role: 'customer_information', inferred: true };

  // Administrative
  if (ADMIN_KEYWORDS.some(kw => text.includes(kw))) return { role: 'administrative', inferred: true };

  // Verification
  if (VERIFICATION_KEYWORDS.some(kw => text.includes(kw))) return { role: 'verification', inferred: true };

  // Derived result (auto-calculated compliance values)
  if (DERIVED_RESULT_KEYWORDS.some(kw => text.includes(kw))) return { role: 'derived_result', inferred: true };

  // Measurement or calculation input
  const isMeasurement = type === 'number' || MEASUREMENT_KEYWORDS.some(kw => text.includes(kw));
  if (isMeasurement) {
    // If on material list → calculation_input, otherwise → measurement
    return { role: showOnMaterialList ? 'calculation_input' : 'measurement', inferred: true };
  }

  // Default: observation
  return { role: 'observation', inferred: true };
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function inferMeasurementUnits(questionText) {
  const lower = questionText.toLowerCase();
  if (lower.includes('diameter')) return 'inches';
  if (lower.includes('height') || lower.includes('tall')) return 'feet';
  if (lower.includes('width') || lower.includes('wide')) return 'inches';
  if (lower.includes('depth') || lower.includes('deep')) return 'inches';
  if (lower.includes('area') || lower.includes('square')) return 'sq_ft';
  if (lower.includes('length') || lower.includes('long') || lower.includes('linear')) return 'feet';
  if (lower.includes('clearance')) return 'inches';
  if (lower.includes('distance')) return 'inches';
  return '';
}

function isMeasurementQuestion(q) {
  if (q.question_type === 'number') return true;
  const text = (q.question_text || '').toLowerCase();
  return MEASUREMENT_KEYWORDS.some(kw => text.includes(kw));
}

function isNFPAQuestion(q) {
  if (NFPA_REFERENCES[q.category]) return true;
  const text = (q.question_text || '').toLowerCase();
  return NFPA_KEYWORDS.some(kw => text.includes(kw));
}

function isSafetyQuestion(q) {
  if (SAFETY_CATEGORIES.includes(q.category)) return true;
  const text = (q.question_text || '').toLowerCase();
  return text.includes('safety') || text.includes('unsafe') || text.includes('carbon monoxide') || text.includes('co detector') || text.includes('hazard');
}

function parseVisibilityRule(ruleStr) {
  if (!ruleStr) return null;
  const parsed = parseJSON(ruleStr, null);
  if (!parsed) return null;
  if (parsed.conditions) {
    return { type: 'multi', logic: parsed.logic || 'or', conditions: parsed.conditions };
  }
  return { type: 'single', condition: parsed };
}

function formatShowsWhen(ruleStr) {
  const parsed = parseVisibilityRule(ruleStr);
  if (!parsed) return '';
  if (parsed.type === 'single') {
    const c = parsed.condition;
    return `When [${c.question_id || '?'}] ${c.operator} "${c.value || ''}"`;
  }
  if (parsed.type === 'multi') {
    return parsed.conditions.map(c => `[${c.question_id || '?'}] ${c.operator} "${c.value || ''}"`).join(` ${parsed.logic.toUpperCase()} `);
  }
  return '';
}

function findRulesForQuestion(questionId, logicRules) {
  const matched = [];
  for (const rule of logicRules) {
    const conditions = parseJSON(rule.conditions_json, []);
    if (!Array.isArray(conditions)) continue;
    for (const cond of conditions) {
      if (cond.question_id === questionId) {
        matched.push(rule);
        break;
      }
    }
  }
  return matched;
}

// Find rules that REFERENCE this question as a measurement input (i.e. consume it)
function findConsumingRules(questionId, logicRules) {
  return findRulesForQuestion(questionId, logicRules);
}

function getHighestSeverity(rules) {
  const order = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };
  let highest = null;
  let highestVal = -1;
  for (const r of rules) {
    const sev = r.output_severity;
    const v = order[sev] ?? 0;
    if (v > highestVal) { highestVal = v; highest = sev; }
  }
  return highest;
}

function findPricebookMappingsForCategory(category, mappings) {
  const sysConfig = CATEGORY_TO_REPAIR_SYSTEM[category];
  if (!sysConfig || sysConfig.deficiencyTypes.length === 0) return [];
  return mappings.filter(m => sysConfig.deficiencyTypes.includes(m.deficiency_type));
}

function getGoodBetterBest(mappings) {
  const tiers = new Set();
  for (const m of mappings) {
    if (m.option_tier) tiers.add(m.option_tier);
  }
  const result = [];
  if (tiers.has('good')) result.push('Good');
  if (tiers.has('better')) result.push('Better');
  if (tiers.has('best')) result.push('Best');
  if (tiers.has('standalone')) result.push('Standalone');
  return result.join(' / ');
}

function getMeasurementKey(q) {
  const text = (q.question_text || '').toLowerCase();
  if (text.includes('flue') && text.includes('height')) return 'flue_height';
  if (text.includes('flue') && text.includes('diameter')) return 'flue_diameter';
  if (text.includes('crown') && text.includes('area')) return 'crown_area';
  if (text.includes('linear') || text.includes('mortar joint')) return 'linear_feet';
  if (text.includes('chimney') && text.includes('height')) return 'chimney_height';
  if (text.includes('smoke chamber') && text.includes('height')) return 'smoke_chamber_height';
  if (text.includes('smoke chamber') && text.includes('depth')) return 'smoke_chamber_depth';
  if (text.includes('chase') && text.includes('width')) return 'chase_width';
  if (text.includes('chase') && text.includes('depth')) return 'chase_depth';
  return '';
}

function getConfidenceContribution(q, matchedRules, hasMapping) {
  const parts = [];
  if (matchedRules.length > 0) parts.push(`Triggers ${matchedRules.length} rule(s)`);
  if (hasMapping) parts.push('Has pricebook mapping');
  if (q.question_type === 'photo') parts.push('Photo evidence');
  if (isMeasurementQuestion(q)) parts.push('Measurement input');
  if (isNFPAQuestion(q)) parts.push('NFPA relevance');
  if (parts.length === 0) return 'No direct confidence contribution';
  return parts.join(', ');
}

// ─── Main Handler ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const questions = await base44.asServiceRole.entities.InspectionQuestion.list('sort_order', 500);
    const allRules = await base44.asServiceRole.entities.LogicRule.list('sort_order', 500);
    const inspectionRules = allRules.filter(r =>
      r.rule_type === 'finding' || r.rule_type === 'repair' || r.rule_type === 'estimate_item' || r.rule_type === 'material' || r.rule_type === 'report_narrative' || r.rule_type === 'visibility'
    );
    const mappings = await base44.asServiceRole.entities.FindingPricebookMapping.filter({ is_active: true });

    // Fetch all approved inspection standards for question linking
    const allStandards = await base44.asServiceRole.entities.InspectionStandard.filter({ status: 'approved' }, '-updated_date', 500).catch(() => []);
    const standardsById = {};
    for (const s of allStandards) standardsById[s.id] = s;

    const entries = [];
    const buildDate = new Date().toISOString();

    // Track question texts for duplicate detection
    const textMap = {};
    for (const q of questions) {
      const key = (q.question_text || '').toLowerCase().trim();
      if (!textMap[key]) textMap[key] = [];
      textMap[key].push(q.id);
    }

    // Build a set of all question IDs that are consumed by any rule (for "consumes measurements" check)
    const allConsumedQuestionIds = new Set();
    for (const rule of inspectionRules) {
      const conditions = parseJSON(rule.conditions_json, []);
      if (!Array.isArray(conditions)) continue;
      for (const cond of conditions) {
        if (cond.question_id) allConsumedQuestionIds.add(cond.question_id);
      }
    }

    for (const q of questions) {
      const cat = q.category || 'other';
      const catMap = CATEGORY_MAP[cat] || CATEGORY_MAP.other;
      const inspectionModule = q.inspection_module || 'interior';
      // Override section for inspection_setup module questions
      const sectionLabel = inspectionModule === 'inspection_setup' ? 'Inspection Setup' : catMap.section;
      const subsectionLabel = inspectionModule === 'inspection_setup' ? 'Setup' : catMap.subsection;
      const sysConfig = CATEGORY_TO_REPAIR_SYSTEM[cat] || { system: 'none', title: '', deficiencyTypes: [] };
      const visibilityRule = parseVisibilityRule(q.visibility_rule);
      const hasConditionalLogic = !!visibilityRule;
      const showsWhen = formatShowsWhen(q.visibility_rule);
      const hiddenWhen = hasConditionalLogic ? `Hidden when: NOT (${showsWhen})` : '';

      const showOnReport = q.show_on_report !== false;
      const showOnMaterialList = !!q.show_on_material_list;

      // ── Explicit output overrides (from Question Editor) ──
      // When explicitly set on the question, use these instead of inferring
      const explicitOutput = (field) => q[field] === true || q[field] === false;
      const outCustomerPdf = explicitOutput('output_customer_pdf') ? q.output_customer_pdf : null;
      const outMaterialList = explicitOutput('output_material_list') ? q.output_material_list : null;

      // ── Infer Question Role ──
      const { role: questionRole, inferred: roleInferred } = inferQuestionRole(q, showOnMaterialList);

      const matchedRules = findRulesForQuestion(q.id, inspectionRules);
      const hasRuleMatch = matchedRules.length > 0;
      const findingType = matchedRules.length > 0 ? (matchedRules[0].output_finding_type || '') : '';
      const severity = getHighestSeverity(matchedRules);

      const pricebookMappings = findPricebookMappingsForCategory(cat, mappings);
      const hasPricebookMapping = pricebookMappings.length > 0;
      const gbb = getGoodBetterBest(pricebookMappings);

      const isPhotoType = q.question_type === 'photo';
      const isPhotoCapable = q.question_type !== 'photo';
      const isMeas = isMeasurementQuestion(q);
      const measUnits = isMeas ? inferMeasurementUnits(q.question_text) : '';
      const measKey = isMeas ? getMeasurementKey(q) : '';

      const isNFPA = q.nfpa_trigger === true ? true : (q.nfpa_trigger === false ? false : isNFPAQuestion(q));
      const codeRef = isNFPA ? (NFPA_REFERENCES[cat] || 'NFPA 211') : '';
      const isSafety = q.safety_trigger === true ? true : (q.safety_trigger === false ? false : isSafetyQuestion(q));
      const isCritical = q.critical_failure === true ? true : (q.critical_failure === false ? false : severity === 'critical');

      // Customer PDF status — respect explicit output config when set
      let customerPdf = 'hide';
      if (outCustomerPdf !== null) {
        customerPdf = outCustomerPdf ? (hasConditionalLogic ? 'conditional' : 'show') : 'hide';
      } else if (showOnReport && hasConditionalLogic) customerPdf = 'conditional';
      else if (showOnReport) customerPdf = 'show';

      // Inspection level
      let inspectionLevel = 'na';
      if (cat === 'liner' || cat === 'flue') inspectionLevel = 'both';
      else if (isNFPA) inspectionLevel = 'level_1';
      if (q.question_text && q.question_text.toLowerCase().includes('level 2')) inspectionLevel = 'level_2';

      // Pass/Fail determination
      let passFail = 'none';
      if (q.question_type === 'yes_no') {
        passFail = isNFPA ? 'pass_fail' : 'warning';
      } else if (q.question_type === 'select' || q.question_type === 'multi_select') {
        const opts = (q.answer_options || '').toLowerCase();
        if (opts.includes('good') || opts.includes('poor') || opts.includes('fail') || opts.includes('pass')) {
          passFail = 'pass_fail';
        } else {
          passFail = 'warning';
        }
      }

      const photoLabels = `${catMap.subsection} — ${q.question_text}`.substring(0, 100);

      // Logic source
      let logicSource = 'none';
      if (hasRuleMatch) logicSource = 'rule';
      else if (hasPricebookMapping) logicSource = 'manual';

      // Produces flags — respect explicit output config when set
      const explicitOut = (field) => q[field] === true || q[field] === false;
      const producesFindings = explicitOut('creates_finding') ? q.creates_finding : (hasRuleMatch || (explicitOut('output_repair_engine') ? q.output_repair_engine : hasRuleMatch));
      const producesRepair = explicitOut('output_repair_engine') ? q.output_repair_engine : sysConfig.system !== 'none';
      const producesEstimate = explicitOut('output_estimate_engine') ? q.output_estimate_engine : (hasRuleMatch || hasPricebookMapping);
      const producesMaterialCalculation = outMaterialList !== null ? outMaterialList : (showOnMaterialList || (isMeas && measKey !== ''));
      const producesPdf = outCustomerPdf !== null ? outCustomerPdf : showOnReport;
      const producesGallery = isPhotoType || isPhotoCapable;
      const producesTimeline = true;

      // Consumes measurements: true for derived_result role (auto-calculated from measurements)
      // Also true if any rule that references this question is of type 'finding' and references measurement questions
      const consumesMeasurements = questionRole === 'derived_result';

      // ── Role-aware validation flags ──
      const validationFlags = [];

      // Duplicate check (all roles)
      const textKey = (q.question_text || '').toLowerCase().trim();
      const isDuplicate = textMap[textKey] && textMap[textKey].length > 1;
      if (isDuplicate) validationFlags.push(`Duplicate — ${textMap[textKey].length} similar questions exist`);

      // Incomplete check (all roles)
      const isIncomplete = !q.question_text || !q.question_type;
      if (isIncomplete) validationFlags.push('Incomplete — missing required fields');

      // Role-specific validation
      if (questionRole === 'observation') {
        // Observations: require repair mapping, PDF mapping, logic rule (if applicable)
        if (sysConfig.system !== 'none' && !hasPricebookMapping) {
          validationFlags.push('Missing Repair Mapping — observation category has no FindingPricebookMapping');
        }
        if (sysConfig.system !== 'none' && !hasRuleMatch && !hasPricebookMapping) {
          validationFlags.push('Missing Mapping — no logic rule or pricebook mapping');
        }
        if (hasRuleMatch && !hasPricebookMapping && sysConfig.system !== 'none') {
          validationFlags.push('Missing Estimate Mapping — triggers findings but no pricebook mapping');
        }
        // NFPA observations need pass/fail
        if (isNFPA && (passFail === 'none' || !passFail)) {
          validationFlags.push('NFPA question missing Pass/Fail logic');
        }
      } else if (questionRole === 'measurement') {
        // Measurements: require units, logic rule usage, material calc (if applicable)
        // Should NOT require pass/fail, NFPA, repair mapping directly
        if (!measUnits) {
          validationFlags.push('Missing Units — measurement question has no inferred units');
        }
        if (!hasRuleMatch) {
          validationFlags.push('Measurement not consumed by any Logic Rule');
        }
        if (measKey && !showOnMaterialList) {
          validationFlags.push('Missing Material Calculation — measurement not on material list');
        }
      } else if (questionRole === 'calculation_input') {
        // Calculation inputs: require calculation mapping
        // Should NOT require repair mapping, pass/fail
        if (!showOnMaterialList && !measKey) {
          validationFlags.push('Missing Calculation Mapping — calculation input not connected to material calculator');
        }
      } else if (questionRole === 'photo') {
        // Photos: require photo destination, gallery/PDF mapping (if customer-facing)
        // Should NOT require repair logic, pass/fail
        if (showOnReport && !q.photo_customer_pdf && !showOnReport) {
          validationFlags.push('Missing PDF Destination — photo not routed to customer PDF');
        }
        // Photos should never trigger pass/fail — flag if they do
        if (passFail !== 'none') {
          validationFlags.push('Photo question has Pass/Fail logic — photos should never trigger pass/fail');
        }
      } else if (questionRole === 'derived_result') {
        // Derived results: require logic rule, repair mapping, estimate mapping, PDF mapping
        if (!hasRuleMatch) {
          validationFlags.push('Derived Result missing Logic Rule — auto-calculated values need a rule');
        }
        if (sysConfig.system !== 'none' && !hasPricebookMapping) {
          validationFlags.push('Derived Result missing Repair Mapping');
        }
        if (hasRuleMatch && !hasPricebookMapping && sysConfig.system !== 'none') {
          validationFlags.push('Derived Result missing Estimate Mapping');
        }
        if (!showOnReport) {
          validationFlags.push('Derived Result missing PDF Mapping — should appear on report');
        }
      } else if (questionRole === 'customer_information') {
        // Customer info: never triggers repair logic
        // Only check: PDF mapping if required
        if (q.required_flag && !showOnReport) {
          validationFlags.push('Required customer question hidden from report');
        }
      } else if (questionRole === 'administrative') {
        // Administrative: never participates in inspection logic
        // Only check: active status
        if (!q.is_active) {
          validationFlags.push('Inactive administrative question');
        }
      } else if (questionRole === 'verification') {
        // Verification: supports workflow only
        if (!q.is_active) {
          validationFlags.push('Inactive verification question');
        }
      }

      // Unused check (context-aware: customer_info/admin/verification are not "unused" just because they have no rules)
      const isUnused = !q.is_active || (
        questionRole !== 'customer_information' &&
        questionRole !== 'administrative' &&
        questionRole !== 'verification' &&
        !hasRuleMatch && !showOnReport && !hasPricebookMapping
      );
      if (!q.is_active) validationFlags.push('Inactive');
      if (isUnused && q.is_active) validationFlags.push('Unused — not referenced by any rule or mapping');

      // Required question missing PDF (all roles)
      if (q.required_flag && customerPdf === 'hide') {
        validationFlags.push('Required question missing PDF/report output');
      }

      // Estimate question missing customer language (observation and derived_result only)
      if ((questionRole === 'observation' || questionRole === 'derived_result') && (hasRuleMatch || hasPricebookMapping) && !showOnReport) {
        validationFlags.push('Estimate question missing customer-facing language');
      }

      const confidenceContribution = getConfidenceContribution(q, matchedRules, hasPricebookMapping);

      // ── Linked Inspection Standards ──
      const linkedIds = Array.isArray(q.linked_standard_ids) ? q.linked_standard_ids : [];
      const linkedStandards = linkedIds.map(id => standardsById[id]).filter(Boolean);
      const standardNames = linkedStandards.map(s => s.standard_name || '').filter(Boolean).join('; ');
      const standardAuths = [...new Set(linkedStandards.flatMap(s => s.authority_level || []))].join(', ');
      const standardSeverity = linkedStandards.map(s => s.severity).filter(Boolean).sort((a, b) => {
        const order = { low: 0, medium: 1, high: 2, critical: 3 };
        return (order[b] || 0) - (order[a] || 0);
      })[0] || '';
      const standardPass = linkedStandards.map(s => s.pass_criteria).filter(Boolean).join(' / ');
      const standardFail = linkedStandards.map(s => s.fail_criteria).filter(Boolean).join(' / ');
      const standardRepair = [...new Set(linkedStandards.map(s => s.default_repair_system).filter(Boolean))].join(', ') || '';

      // Workflows — respect explicit output config when set
      const w_inspection = true;
      const w_pdf = producesPdf;
      const w_material_calc = producesMaterialCalculation;
      const w_repair_system = producesRepair && (questionRole === 'observation' || questionRole === 'derived_result');
      const w_estimate = producesEstimate && (questionRole === 'observation' || questionRole === 'derived_result');
      const w_scope_of_work = explicitOut('output_scope_of_work') ? q.output_scope_of_work : w_estimate;
      const w_scheduling = explicitOut('output_scheduling') ? q.output_scheduling : w_estimate;
      const w_warehouse = explicitOut('output_warehouse') ? q.output_warehouse : w_material_calc;
      const w_fleet = explicitOut('output_fleet') ? q.output_fleet : false;
      const w_job_hub = explicitOut('output_job_hub') ? q.output_job_hub : (q.inspection_type === 'interior' || q.inspection_type === 'both');
      const w_timeline = explicitOut('output_timeline') ? q.output_timeline : true;
      const w_analytics = explicitOut('output_analytics') ? q.output_analytics : hasRuleMatch;

      // ── Infer Question Purpose ──
      const { purposes: questionPurposes, inferred: purposeInferred, needsReview: purposeNeedsReview } =
        inferQuestionPurposes(q, questionRole, isNFPA, isSafety, hasPricebookMapping, showOnReport, showOnMaterialList, isPhotoType, isMeas, sysConfig, pricebookMappings.some(m => m.option_tier === 'best'), w_warehouse, w_fleet, w_analytics);

      // ── Infer Question Category ──
      const { category: questionCategory, inferred: categoryInferred } =
        inferQuestionCategory(q, questionRole, cat);

      entries.push({
        question_id: q.id,
        section: sectionLabel,
        subsection: subsectionLabel,
        category: cat,
        inspection_module: inspectionModule,
        question_text: q.question_text || '',
        question_type: q.question_type || '',
        question_role: questionRole,
        role_inferred: roleInferred,
        question_purpose: JSON.stringify(questionPurposes),
        question_category: questionCategory,
        purpose_inferred: purposeInferred,
        category_inferred: categoryInferred,
        needs_review: purposeNeedsReview,
        logic_source: logicSource,
        consumes_measurements: consumesMeasurements,
        produces_findings: producesFindings,
        produces_repair: producesRepair,
        produces_estimate: producesEstimate,
        produces_material_calculation: producesMaterialCalculation,
        produces_pdf: producesPdf,
        produces_gallery: producesGallery,
        produces_timeline: producesTimeline,
        inspection_type: q.inspection_type || 'interior',
        display_order: q.sort_order || 0,
        is_active: q.is_active !== false,
        conditional_logic: hasConditionalLogic,
        shows_when: showsWhen,
        hidden_when: hiddenWhen,
        required: !!q.required_flag,
        required_conditionally: !!q.required_flag && hasConditionalLogic,
        answer_options: q.answer_options || '',
        help_text: q.help_text || '',
        photo_required: isPhotoType,
        photo_optional: isPhotoCapable,
        photo_category: catMap.subsection,
        photo_labels: photoLabels,
        photo_customer_pdf: showOnReport,
        photo_internal_report: true,
        photo_estimate: w_estimate,
        photo_repair_system: w_repair_system,
        photo_timeline: true,
        photo_internal_only: !showOnReport,
        measurement_required: isMeas,
        measurement_units: measUnits,
        measurement_material_calc: isMeas && showOnMaterialList,
        measurement_estimate_qty: isMeas && measKey !== '',
        measurement_pdf_report: isMeas && showOnReport,
        measurement_repair_system: isMeas && w_repair_system,
        customer_pdf: customerPdf,
        customer_summary: showOnReport && isNFPA,
        internal_notes: !showOnReport,
        inspection_summary: true,
        timeline: true,
        job_hub: w_job_hub,
        dashboard: hasRuleMatch,
        nfpa_211_question: isNFPA,
        code_reference: codeRef,
        pass_fail: passFail,
        safety_concern: isSafety,
        critical_failure: isCritical,
        inspection_level: inspectionLevel,
        repair_system: (q.repair_system_config && q.repair_system_config !== 'none') ? q.repair_system_config : sysConfig.system,
        finding_type: findingType,
        severity: severity || '',
        recommendation_trigger: hasRuleMatch,
        grouped_into: sysConfig.title,
        estimate_recommendation: w_estimate,
        pricebook_mapping: hasPricebookMapping,
        good_better_best: gbb,
        confidence_contribution: confidenceContribution,
        feeds_material_calculator: producesMaterialCalculation,
        calculation_type: isMeas ? (measKey.includes('area') ? 'area' : measKey.includes('linear') || measKey.includes('height') ? 'linear_feet' : 'quantity') : '',
        calculation_input_field: measKey,
        calculation_output_field: measKey ? `${measKey}_quantity` : '',
        calculation_formula: measKey ? `${measKey} × quantity_multiplier → material quantity` : '',
        creates_recommendation: hasRuleMatch,
        adds_estimate_item: hasPricebookMapping,
        suggests_upgrade: pricebookMappings.some(m => m.option_tier === 'best'),
        creates_option_group: pricebookMappings.some(m => m.option_group),
        customer_facing: showOnReport,
        estimate_internal_only: !showOnReport,
        workflow_inspection: w_inspection,
        workflow_pdf: w_pdf,
        workflow_material_calculator: w_material_calc,
        workflow_repair_system: w_repair_system,
        workflow_estimate: w_estimate,
        workflow_scope_of_work: w_scope_of_work,
        workflow_scheduling: w_scheduling,
        workflow_warehouse: w_warehouse,
        workflow_fleet: w_fleet,
        workflow_job_hub: w_job_hub,
        workflow_timeline: w_timeline,
        workflow_analytics: w_analytics,
        validation_unused: isUnused,
        validation_duplicate: isDuplicate,
        validation_incomplete: isIncomplete,
        validation_missing_mapping: (questionRole === 'observation' || questionRole === 'derived_result') && sysConfig.system !== 'none' && !hasRuleMatch && !hasPricebookMapping,
        validation_missing_photo_logic: false,
        validation_missing_repair_mapping: (questionRole === 'observation' || questionRole === 'derived_result') && sysConfig.system !== 'none' && !hasPricebookMapping,
        validation_missing_pdf_mapping: showOnReport === undefined || showOnReport === null,
        validation_missing_material_calc: (questionRole === 'measurement' || questionRole === 'calculation_input') && measKey !== '' && !showOnMaterialList,
        validation_missing_estimate_mapping: (questionRole === 'observation' || questionRole === 'derived_result') && hasRuleMatch && !hasPricebookMapping && sysConfig.system !== 'none',
        validation_flags: JSON.stringify(validationFlags),
        matrix_build_date: buildDate,
        linked_standard_ids: linkedIds,
        standard_names: standardNames,
        standard_authority_levels: standardAuths,
        standard_severity: standardSeverity,
        standard_pass_criteria: standardPass,
        standard_fail_criteria: standardFail,
        standard_repair_system: standardRepair,
      });
    }

    // Delete old entries (bulk for performance)
    await base44.asServiceRole.entities.InspectionMatrixEntry.deleteMany({});

    // Create new entries
    let created = [];
    if (entries.length > 0) {
      created = await base44.asServiceRole.entities.InspectionMatrixEntry.bulkCreate(entries);
    }

    // Count gaps (questions with any validation flags)
    const gapCount = entries.filter(e => {
      const flags = parseJSON(e.validation_flags, []);
      return Array.isArray(flags) && flags.length > 0;
    }).length;

    // Role distribution
    const roleCounts = {};
    for (const e of entries) {
      roleCounts[e.question_role] = (roleCounts[e.question_role] || 0) + 1;
    }

    // Purpose distribution
    const purposeCounts = {};
    for (const e of entries) {
      const purposes = parseJSON(e.question_purpose, []);
      if (Array.isArray(purposes)) {
        for (const p of purposes) {
          purposeCounts[p] = (purposeCounts[p] || 0) + 1;
        }
      }
    }

    // Category distribution
    const categoryCounts = {};
    for (const e of entries) {
      if (e.question_category) {
        categoryCounts[e.question_category] = (categoryCounts[e.question_category] || 0) + 1;
      }
    }

    const needsReviewCount = entries.filter(e => e.needs_review).length;

    return Response.json({
      status: 'success',
      questions_analyzed: questions.length,
      entries_created: created.length,
      gaps_identified: gapCount,
      role_distribution: roleCounts,
      purpose_distribution: purposeCounts,
      category_distribution: categoryCounts,
      needs_review: needsReviewCount,
      build_date: buildDate,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});