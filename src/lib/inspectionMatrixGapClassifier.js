import { jsPDF } from 'jspdf';

// ─── Role Definitions ─────────────────────────────────────────────
export const QUESTION_ROLES = {
  observation: {
    label: 'Observation',
    color: 'blue',
    description: 'Can trigger findings, repair systems, estimates, NFPA failures, customer PDF. May require photos.',
  },
  measurement: {
    label: 'Measurement',
    color: 'amber',
    description: 'Collects numeric values. Feeds logic rules, material calculations, estimate quantities, report. Should NOT require pass/fail.',
  },
  photo: {
    label: 'Photo',
    color: 'purple',
    description: 'Documentation only. Feeds customer PDF, galleries, repair evidence, estimate presentation. Should NEVER trigger pass/fail.',
  },
  calculation_input: {
    label: 'Calculation Input',
    color: 'cyan',
    description: 'Used by material calculator, estimate quantities, repair calculations. Should NOT trigger repair systems directly.',
  },
  derived_result: {
    label: 'Derived Result',
    color: 'green',
    description: 'Auto-calculated values. Can trigger failures, repair systems, customer PDF, estimates. Technicians do NOT answer these.',
  },
  customer_information: {
    label: 'Customer Information',
    color: 'pink',
    description: 'Customer concern, scheduling, comments. Never triggers repair logic.',
  },
  administrative: {
    label: 'Administrative',
    color: 'gray',
    description: 'Technician notes, inspection version, internal tracking. Never participates in inspection logic.',
  },
  verification: {
    label: 'Verification',
    color: 'indigo',
    description: 'Verified appliance tag, serial number, access. Supports workflow only.',
  },
};

const ALL_ROLES = ['observation', 'measurement', 'photo', 'calculation_input', 'derived_result', 'customer_information', 'administrative', 'verification'];

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── Smarter Material Calculation Evaluation ──────────────────────
// Only flag Material Calculation gaps if:
// 1. Question Purpose includes 'material_calculation', OR
// 2. Repair System requires a material calculation (repair_system !== 'none')
// Exclude measurements that only support NFPA, documentation, customer report, general measurements
const MATERIAL_CALC_EXCLUDE_KEYWORDS = ['clearance', 'hearth extension', 'mantel', 'left side', 'right side'];

function shouldEvaluateMaterialCalc(entry) {
  const purposes = safeParse(entry.question_purpose, []);
  const hasMaterialPurpose = Array.isArray(purposes) && purposes.includes('material_calculation');
  const repairSystemRequires = entry.repair_system && entry.repair_system !== 'none';

  if (!hasMaterialPurpose && !repairSystemRequires) return false;

  const text = (entry.question_text || '').toLowerCase();
  if (MATERIAL_CALC_EXCLUDE_KEYWORDS.some(kw => text.includes(kw))) return false;

  return true;
}

// ─── Confidence Scoring ──────────────────────────────────────────
function calculateGapConfidence(entry, gapDef) {
  let score = 50;
  const reasons = [];

  if (entry.nfpa_211_question) { score += 20; reasons.push('NFPA reference explicitly set'); }
  if (entry.safety_concern) { score += 10; reasons.push('Safety concern explicitly flagged'); }

  const purposes = safeParse(entry.question_purpose, []);
  if (Array.isArray(purposes) && purposes.length > 0 && !entry.purpose_inferred) {
    score += 15; reasons.push('Purpose explicitly set');
  }
  if (entry.question_category && !entry.category_inferred) { score += 15; reasons.push('Category explicitly set'); }
  if (entry.question_role && !entry.role_inferred) { score += 10; reasons.push('Role explicitly set'); }

  if (entry.logic_source === 'rule') { score += 10; reasons.push('Has logic rule'); }
  if (entry.pricebook_mapping) { score += 5; reasons.push('Has pricebook mapping'); }
  if (entry.required) { score += 5; reasons.push('Required question'); }

  if (entry.role_inferred) { score -= 15; reasons.push('Role auto-inferred'); }
  if (entry.purpose_inferred) { score -= 15; reasons.push('Purpose auto-inferred'); }
  if (entry.category_inferred) { score -= 10; reasons.push('Category auto-inferred'); }
  if (entry.needs_review) { score -= 10; reasons.push('Classification needs review'); }

  score = Math.max(5, Math.min(99, Math.round(score)));

  let level;
  if (score >= 80) level = 'high';
  else if (score >= 50) level = 'medium';
  else level = 'low';

  return { score, level, reason: reasons.join('; ') };
}

// ─── Impact Systems per Gap ──────────────────────────────────────
function getGapImpactSystems(entry) {
  const systems = ['Inspection'];
  if (entry.customer_pdf && entry.customer_pdf !== 'hide') systems.push('Customer PDF');
  if (entry.internal_notes || !entry.is_active) systems.push('Internal Report');
  if (entry.logic_source && entry.logic_source !== 'none') systems.push('Logic Rules');
  if (entry.repair_system && entry.repair_system !== 'none') systems.push('Repair System');
  if (entry.estimate_recommendation) systems.push('Estimate Engine');
  if (entry.feeds_material_calculator) systems.push('Material Calculator');
  if (entry.workflow_scope_of_work) systems.push('Scope of Work');
  if (entry.workflow_scheduling) systems.push('Scheduling');
  if (entry.workflow_warehouse) systems.push('Warehouse');
  if (entry.workflow_fleet) systems.push('Fleet');
  if (entry.workflow_job_hub) systems.push('Job Hub');
  if (entry.workflow_analytics) systems.push('Analytics');
  return systems;
}

// ─── Gap Definitions (Role-Aware) ────────────────────────────────
export const GAP_DEFINITIONS = [
  // ── 1. Critical Gaps ──
  {
    id: 'critical_nfpa_no_logic',
    category: 'critical',
    priority: 'critical',
    title: 'NFPA/Code Question Missing Failure Logic',
    whyItMatters: 'NFPA 211 questions must have pass/fail logic to determine code compliance. Without it, code violations cannot be automatically detected.',
    recommendedAction: 'Create a LogicRule with pass_fail output for this question, or configure pass_fail in the question definition.',
    affectedSystems: ['Inspection', 'Customer PDF', 'Repair System'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.nfpa_211_question && (e.pass_fail === 'none' || !e.pass_fail),
  },
  {
    id: 'critical_safety_no_repair',
    category: 'critical',
    priority: 'critical',
    title: 'Safety Question Missing Repair Mapping',
    whyItMatters: 'Safety-related questions must map to a repair system so that safety deficiencies automatically generate repair recommendations.',
    recommendedAction: 'Create a FindingPricebookMapping for the deficiency type associated with this question\'s category.',
    affectedSystems: ['Repair System', 'Estimate Engine', 'Safety Reporting'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.safety_concern && !e.pricebook_mapping,
  },
  {
    id: 'critical_required_no_pdf',
    category: 'critical',
    priority: 'critical',
    title: 'Required Question Missing PDF/Report Output',
    whyItMatters: 'Required questions must appear on the customer-facing report. If hidden, critical inspection data is never delivered to the customer.',
    recommendedAction: 'Set show_on_report = true on the InspectionQuestion, or add a visibility rule that includes it conditionally.',
    affectedSystems: ['Customer PDF', 'Inspection Summary'],
    roles: ['observation', 'measurement', 'photo', 'calculation_input', 'derived_result', 'customer_information', 'verification'],
    test: (e) => e.required && e.customer_pdf === 'hide',
  },
  {
    id: 'critical_estimate_no_customer_language',
    category: 'critical',
    priority: 'critical',
    title: 'Estimate Question Missing Customer-Facing Language',
    whyItMatters: 'Questions that feed estimates must have customer-facing descriptions so customers understand what they are being charged for.',
    recommendedAction: 'Add customer_description_template to the FindingPricebookMapping for this question\'s deficiency type.',
    affectedSystems: ['Estimate Engine', 'Customer PDF', 'Customer Portal'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.estimate_recommendation && !e.customer_facing,
  },

  // ── 2. Estimate Gaps ──
  {
    id: 'estimate_no_pricebook',
    category: 'estimate',
    priority: 'high',
    title: 'Missing Pricebook Mapping',
    whyItMatters: 'This question triggers findings but has no pricebook item mapping, so no estimate line items can be generated.',
    recommendedAction: 'Create a FindingPricebookMapping linking the deficiency type to a pricebook item.',
    affectedSystems: ['Estimate Engine', 'Pricebook'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.recommendation_trigger && !e.pricebook_mapping && e.repair_system !== 'none',
  },
  {
    id: 'estimate_no_repair_system',
    category: 'estimate',
    priority: 'high',
    title: 'Missing Repair System Mapping',
    whyItMatters: 'This question\'s category has no repair system assignment, so findings cannot be grouped into repair recommendations.',
    recommendedAction: 'Add the deficiency type to the category-to-repair-system mapping in the build engine.',
    affectedSystems: ['Repair System', 'Estimate Engine'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.validation_missing_repair_mapping,
  },
  {
    id: 'estimate_no_gbb',
    category: 'estimate',
    priority: 'medium',
    title: 'Missing Good/Better/Best Options',
    whyItMatters: 'This question has a pricebook mapping but no Good/Better/Best tiers, limiting customer choice and upsell potential.',
    recommendedAction: 'Add option_group and option_tier entries to the FindingPricebookMapping for this deficiency type.',
    affectedSystems: ['Estimate Engine', 'Customer Portal'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.pricebook_mapping && !e.good_better_best,
  },

  // ── 3. Report Gaps ──
  {
    id: 'report_no_pdf_mapping',
    category: 'report',
    priority: 'medium',
    title: 'Missing Customer PDF Mapping',
    whyItMatters: 'This question\'s visibility on the customer report is not configured, risking incomplete or missing report sections.',
    recommendedAction: 'Set show_on_report on the InspectionQuestion to explicitly include or exclude it.',
    affectedSystems: ['Customer PDF', 'Report Engine'],
    roles: ALL_ROLES,
    test: (e) => e.validation_missing_pdf_mapping,
  },
  {
    id: 'report_no_summary',
    category: 'report',
    priority: 'medium',
    title: 'Missing Customer Summary Language',
    whyItMatters: 'NFPA 211 questions should appear in the customer summary for compliance transparency, but this one does not.',
    recommendedAction: 'Enable customer_summary for this question or add it to the report summary section.',
    affectedSystems: ['Customer PDF', 'Inspection Summary'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.nfpa_211_question && !e.customer_summary,
  },
  {
    id: 'report_facing_but_hidden',
    category: 'report',
    priority: 'medium',
    title: 'Customer-Facing Question Hidden from Report',
    whyItMatters: 'This question is marked as customer-facing but is hidden from the PDF report, creating an inconsistency.',
    recommendedAction: 'Set show_on_report = true, or remove the customer_facing flag if it should be internal only.',
    affectedSystems: ['Customer PDF', 'Customer Portal'],
    roles: ALL_ROLES,
    test: (e) => e.customer_facing && e.customer_pdf === 'hide',
  },

  // ── 4. Photo Gaps ──
  {
    id: 'photo_deficiency_no_photo',
    category: 'photo',
    priority: 'high',
    title: 'Deficiency Question Without Photo Requirement',
    whyItMatters: 'Questions tied to repair systems should require photo evidence to support findings and estimate recommendations.',
    recommendedAction: 'Change question_type to "photo" or enforce per-question photo capture in the inspection form.',
    affectedSystems: ['Inspection', 'Repair System', 'Estimate Engine'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.repair_system && e.repair_system !== 'none' && !e.photo_required,
  },
  {
    id: 'photo_no_pdf_destination',
    category: 'photo',
    priority: 'medium',
    title: 'Photos Without PDF/Gallery Destination',
    whyItMatters: 'Photos captured for this question are not routed to the customer PDF, making them invisible in the final report.',
    recommendedAction: 'Set photo_customer_pdf = true, or configure the report template to include this photo category.',
    affectedSystems: ['Customer PDF', 'Photo Gallery'],
    roles: ['photo'],
    test: (e) => e.photo_required && !e.photo_customer_pdf,
  },
  {
    id: 'photo_internal_only_conflict',
    category: 'photo',
    priority: 'low',
    title: 'Internal-Only Photo Conflict',
    whyItMatters: 'This question\'s photos are flagged as both internal-only and customer-facing, creating a routing conflict.',
    recommendedAction: 'Resolve the photo routing: set photo_internal_only = false or photo_customer_pdf = false.',
    affectedSystems: ['Customer PDF', 'Internal Report'],
    roles: ['photo'],
    test: (e) => e.photo_internal_only && e.photo_customer_pdf,
  },

  // ── 5. Material Calculation Gaps (Smarter) ──
  // Only evaluated if shouldEvaluateMaterialCalc(entry) returns true
  {
    id: 'material_meas_not_connected',
    category: 'material',
    priority: 'medium',
    title: 'Measurement Not Connected to Material Calculation',
    whyItMatters: 'This measurement question does not feed the material calculator, so material quantities must be calculated manually.',
    recommendedAction: 'Add a quantity_from_measurement field to the FindingPricebookMapping for this question\'s measurement key.',
    affectedSystems: ['Material Calculator', 'Warehouse', 'Scope of Work'],
    roles: ['measurement', 'calculation_input'],
    test: (e) => e.measurement_required && !e.measurement_material_calc,
  },
  {
    id: 'material_meas_not_consumed',
    category: 'material',
    priority: 'high',
    title: 'Measurement Not Consumed by Any Logic Rule',
    whyItMatters: 'This measurement question is not referenced by any logic rule, so its value is never used for compliance determination or material calculation.',
    recommendedAction: 'Create a LogicRule that consumes this measurement to determine compliance, or connect it to a material calculation.',
    affectedSystems: ['Logic Rules', 'Material Calculator', 'Estimate Engine'],
    roles: ['measurement', 'calculation_input'],
    test: (e) => e.logic_source === 'none',
  },
  {
    id: 'material_repair_missing_meas',
    category: 'material',
    priority: 'medium',
    title: 'Repair System Missing Required Measurement Input',
    whyItMatters: 'This repair system question does not feed the material calculator, so material quantities may be inaccurate.',
    recommendedAction: 'Add measurement input fields to the question, or configure the material calculation in the pricebook mapping.',
    affectedSystems: ['Material Calculator', 'Warehouse', 'Scope of Work'],
    roles: ['observation', 'derived_result'],
    test: (e) => e.repair_system && e.repair_system !== 'none' && !e.feeds_material_calculator,
  },

  // ── 6. Cleanup Subcategories (Split) ──
  {
    id: 'cleanup_duplicate',
    category: 'duplicate',
    priority: 'medium',
    title: 'Duplicate Question',
    whyItMatters: 'Similar question text exists elsewhere, potentially causing conflicting answers and report duplication.',
    recommendedAction: 'Review and merge duplicate questions, or deactivate one to avoid confusion.',
    affectedSystems: ['Inspection', 'Customer PDF'],
    roles: ALL_ROLES,
    test: (e) => e.validation_duplicate,
  },
  {
    id: 'cleanup_inactive_downstream',
    category: 'inactive',
    priority: 'high',
    title: 'Inactive Question Used Downstream',
    whyItMatters: 'This question is inactive but still referenced by rules or estimate mappings, creating orphaned dependencies.',
    recommendedAction: 'Either reactivate the question or remove the downstream rules/mappings that reference it.',
    affectedSystems: ['Logic Rules', 'Estimate Engine', 'Repair System'],
    roles: ALL_ROLES,
    test: (e) => !e.is_active && (e.estimate_recommendation || e.recommendation_trigger),
  },
  {
    id: 'cleanup_unused',
    category: 'unused',
    priority: 'low',
    title: 'Unused Question',
    whyItMatters: 'This question is not referenced by any rule, mapping, or report output. It may be obsolete.',
    recommendedAction: 'Review whether this question is still needed. If not, deactivate or delete it.',
    affectedSystems: ['Inspection'],
    roles: ['observation', 'measurement', 'photo', 'calculation_input', 'derived_result'],
    test: (e) => e.validation_unused,
  },
  {
    id: 'cleanup_incomplete',
    category: 'missing_metadata',
    priority: 'medium',
    title: 'Incomplete Question',
    whyItMatters: 'This question is missing required configuration fields (question text or type).',
    recommendedAction: 'Complete the question configuration: ensure question_text and question_type are set.',
    affectedSystems: ['Inspection'],
    roles: ALL_ROLES,
    test: (e) => e.validation_incomplete,
  },
  {
    id: 'cleanup_missing_purpose',
    category: 'missing_purpose',
    priority: 'medium',
    title: 'Missing Question Purpose',
    whyItMatters: 'This question has no purpose classification, making it difficult to determine its downstream impact.',
    recommendedAction: 'Assign a question purpose in the InspectionQuestion configuration.',
    affectedSystems: ['Inspection', 'Analytics'],
    roles: ALL_ROLES,
    test: (e) => {
      const p = safeParse(e.question_purpose, []);
      return !Array.isArray(p) || p.length === 0;
    },
  },
  {
    id: 'cleanup_missing_category',
    category: 'missing_category',
    priority: 'medium',
    title: 'Missing Question Category',
    whyItMatters: 'This question has no category classification, preventing proper grouping and logic rule evaluation.',
    recommendedAction: 'Assign a question category in the InspectionQuestion configuration.',
    affectedSystems: ['Inspection', 'Logic Rules'],
    roles: ALL_ROLES,
    test: (e) => !e.question_category,
  },
  {
    id: 'cleanup_legacy',
    category: 'legacy',
    priority: 'low',
    title: 'Legacy / Orphaned Question',
    whyItMatters: 'This question is inactive and not referenced by any rule, mapping, or report. It may be obsolete and a candidate for deletion.',
    recommendedAction: 'Review whether this question should be deleted or reactivated with proper configuration.',
    affectedSystems: ['Inspection'],
    roles: ALL_ROLES,
    test: (e) => !e.is_active && e.logic_source === 'none' && !e.estimate_recommendation && !e.recommendation_trigger,
  },

  // ── 7. Derived Result Gaps ──
  {
    id: 'derived_no_logic_rule',
    category: 'critical',
    priority: 'high',
    title: 'Derived Result Missing Logic Rule',
    whyItMatters: 'This is an auto-calculated value (e.g. "Clearance complies with NFPA") but has no logic rule to perform the calculation.',
    recommendedAction: 'Create a LogicRule that computes this derived result from the underlying measurement questions.',
    affectedSystems: ['Logic Rules', 'Inspection'],
    roles: ['derived_result'],
    test: (e) => e.logic_source === 'none',
  },
];

export const CATEGORY_META = {
  critical: { label: 'Critical Gaps', color: 'red', description: 'NFPA, safety, required, and customer-language gaps' },
  estimate: { label: 'Estimate Gaps', color: 'orange', description: 'Missing pricebook, repair system, and G/B/B mappings' },
  report: { label: 'Report Gaps', color: 'blue', description: 'Customer PDF, summary, and visibility issues' },
  photo: { label: 'Photo Gaps', color: 'purple', description: 'Missing photo requirements and destination conflicts' },
  material: { label: 'Material Calc Gaps', color: 'amber', description: 'Measurement and material calculation disconnections' },
  unused: { label: 'Unused Questions', color: 'gray', description: 'Not referenced by any rule, mapping, or report' },
  duplicate: { label: 'Duplicate Questions', color: 'gray', description: 'Similar question text exists elsewhere' },
  inactive: { label: 'Inactive Questions', color: 'gray', description: 'Inactive but still referenced downstream' },
  missing_metadata: { label: 'Missing Metadata', color: 'gray', description: 'Missing required configuration fields' },
  missing_purpose: { label: 'Missing Purpose', color: 'gray', description: 'No question purpose assigned' },
  missing_category: { label: 'Missing Category', color: 'gray', description: 'No question category assigned' },
  legacy: { label: 'Legacy Questions', color: 'gray', description: 'Inactive and orphaned — candidate for deletion' },
};

export const CATEGORY_ORDER = [
  'critical', 'estimate', 'report', 'photo', 'material',
  'unused', 'duplicate', 'inactive', 'missing_metadata', 'missing_purpose', 'missing_category', 'legacy',
];

export const PRIORITY_META = {
  critical: { label: 'Critical', color: 'red' },
  high: { label: 'High', color: 'orange' },
  medium: { label: 'Medium', color: 'amber' },
  low: { label: 'Low', color: 'gray' },
};

export function classifyGaps(entries) {
  const gaps = [];
  for (const entry of entries) {
    const role = entry.question_role || 'observation';
    for (const def of GAP_DEFINITIONS) {
      if (!def.roles.includes(role)) continue;

      // Smarter material calc evaluation
      if (def.category === 'material' && !shouldEvaluateMaterialCalc(entry)) continue;

      try {
        if (def.test(entry)) {
          const confidence = calculateGapConfidence(entry, def);
          const impactSystems = getGapImpactSystems(entry);
          gaps.push({
            entry_id: entry.id,
            question_id: entry.question_id,
            question_text: entry.question_text,
            section: entry.section,
            subsection: entry.subsection,
            category: entry.category,
            question_role: role,
            question_purpose: entry.question_purpose,
            question_category: entry.question_category,
            needs_review: entry.needs_review,
            inspection_type: entry.inspection_type,
            repair_system: entry.repair_system,
            nfpa_211_question: entry.nfpa_211_question,
            safety_concern: entry.safety_concern,
            estimate_recommendation: entry.estimate_recommendation,
            customer_pdf: entry.customer_pdf,
            is_active: entry.is_active,
            logic_source: entry.logic_source,
            gap_id: `${entry.question_id}::${def.id}`,
            gap_def_id: def.id,
            gap_type: def.title,
            gap_category: def.category,
            gap_priority: def.priority,
            gap_why: def.whyItMatters,
            gap_action: def.recommendedAction,
            gap_systems: def.affectedSystems,
            impact_systems: impactSystems,
            confidence_score: confidence.score,
            confidence_level: confidence.level,
            confidence_reason: confidence.reason,
            matrix_build_date: entry.matrix_build_date,
            // Review fields (merged from InspectionGapReview records)
            status: 'new',
            assigned_to: '',
            department: '',
            target_date: '',
            priority_override: '',
            reviewed_by: '',
            review_date: '',
            resolution_notes: '',
            review_id: null,
          });
        }
      } catch { /* skip entry on test error */ }
    }
  }
  return gaps;
}

// ─── Export Functions ──────────────────────────────────────────────

const EXPORT_COLUMNS = [
  { key: 'gap_priority', label: 'Priority' },
  { key: 'gap_category', label: 'Category' },
  { key: 'question_role', label: 'Question Role' },
  { key: 'question_category', label: 'Question Category' },
  { key: 'question_purpose', label: 'Question Purpose' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'confidence_score', label: 'Confidence %' },
  { key: 'confidence_level', label: 'Confidence Level' },
  { key: 'status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'gap_type', label: 'Gap Type' },
  { key: 'question_text', label: 'Question' },
  { key: 'section', label: 'Section' },
  { key: 'subsection', label: 'Subsection' },
  { key: 'inspection_type', label: 'Form' },
  { key: 'repair_system', label: 'Repair System' },
  { key: 'logic_source', label: 'Logic Source' },
  { key: 'nfpa_211_question', label: 'NFPA 211' },
  { key: 'safety_concern', label: 'Safety' },
  { key: 'gap_why', label: 'Why It Matters' },
  { key: 'gap_action', label: 'Recommended Action' },
  { key: 'impact_systems', label: 'Impact Systems' },
  { key: 'gap_systems', label: 'Systems Affected' },
  { key: 'resolution_notes', label: 'Resolution Notes' },
];

function cellVal(gap, col) {
  const v = gap[col.key];
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (col.key === 'gap_systems' || col.key === 'impact_systems') return Array.isArray(v) ? v.join('; ') : '';
  if (col.key === 'question_purpose') {
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p.join('; ') : ''; } catch { return ''; }
  }
  return v ?? '';
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportGapsCSV(gaps) {
  const headers = EXPORT_COLUMNS.map(c => `"${c.label}"`);
  const rows = gaps.map(g =>
    EXPORT_COLUMNS.map(c => `"${String(cellVal(g, c)).replace(/"/g, '""')}"`).join(',')
  );
  downloadBlob([headers.join(','), ...rows].join('\n'), `inspection_gaps_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

export function exportGapsExcel(gaps) {
  const headerRow = EXPORT_COLUMNS.map(c => `<th style="background:#1a1a2e;color:#fff;padding:4px 8px;font-size:10px;border:1px solid #ccc;">${c.label}</th>`).join('');
  const dataRows = gaps.map(g =>
    '<tr>' + EXPORT_COLUMNS.map(c => {
      const v = String(cellVal(g, c)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<td style="padding:3px 8px;font-size:10px;border:1px solid #ddd;">${v}</td>`;
    }).join('') + '</tr>'
  ).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;
  downloadBlob(html, `inspection_gaps_${new Date().toISOString().slice(0,10)}.xls`, 'application/vnd.ms-excel');
}

export function exportGapsPDF(gaps) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const margin = 20;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Inspection Matrix — Gap Review', margin, y);
  y += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.text(`Total Gaps: ${gaps.length}`, margin, y);
  y += 18;

  const cols = ['Priority', 'Category', 'Role', 'Conf%', 'Status', 'Gap Type', 'Question', 'Section', 'Repair System', 'Why It Matters', 'Recommended Action'];
  const colW = [40, 50, 50, 35, 50, 100, 130, 40, 50, 120, 120];
  const totalW = colW.reduce((a, b) => a + b, 0);

  doc.setFillColor(26, 26, 46);
  doc.rect(margin, y, totalW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  let x = margin;
  cols.forEach((c, i) => { doc.text(c, x + 2, y + 12); x += colW[i]; });
  y += 18;

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  let alt = false;
  for (const g of gaps) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = margin; }
    if (alt) { doc.setFillColor(245, 245, 248); doc.rect(margin, y, totalW, 16, 'F'); }
    alt = !alt;

    const cells = [
      g.gap_priority,
      g.gap_category,
      g.question_role || '',
      String(g.confidence_score || ''),
      g.status || 'new',
      g.gap_type,
      (g.question_text || '').substring(0, 45),
      g.section || '',
      g.repair_system || 'none',
      (g.gap_why || '').substring(0, 50),
      (g.gap_action || '').substring(0, 50),
    ];
    x = margin;
    cells.forEach((v, i) => { doc.text(String(v), x + 2, y + 11); x += colW[i]; });
    y += 16;
  }

  doc.save(`inspection_gaps_${new Date().toISOString().slice(0,10)}.pdf`);
}