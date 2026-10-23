import { jsPDF } from 'jspdf';
import { QUESTION_PURPOSES, PURPOSE_ORDER, OUTPUT_GROUPS, IMPACT_SYSTEMS } from '@/lib/inspectionMetadataConfig';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
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

function getImpactSystems(entry) {
  return IMPACT_SYSTEMS.filter(s => {
    try { return s.condition(entry); } catch { return false; }
  }).map(s => s.label);
}

function getDependencyChain(entry) {
  const chain = [];
  const role = entry.question_role || 'observation';
  if (role === 'measurement' || role === 'calculation_input') chain.push('Measurement Input');
  if (entry.logic_source === 'rule') chain.push('Logic Rule');
  if (role === 'derived_result') chain.push('Derived Result');
  if (entry.produces_findings) chain.push('Finding');
  if (entry.repair_system && entry.repair_system !== 'none') chain.push(`${entry.repair_system} Repair System`);
  if (entry.recommendation_trigger) chain.push('Repair System Recommendation');
  if (entry.customer_pdf && entry.customer_pdf !== 'hide') chain.push('Customer PDF');
  if (entry.estimate_recommendation) chain.push('Estimate Recommendation');
  if (entry.workflow_scope_of_work) chain.push('Scope of Work');
  if (entry.workflow_scheduling) chain.push('Scheduling');
  if (entry.workflow_warehouse) chain.push('Warehouse Planning');
  if (entry.workflow_job_hub) chain.push('Job Hub');
  return chain;
}

// ─── CSV Export ───────────────────────────────────────────────────

export function exportOutputsCSV(entries) {
  const headers = [
    'Question ID', 'Question Text', 'Form', 'Section', 'Subsection',
    'Question Role', 'Question Category', 'Question Purpose',
    'Active',
    // PDF / Reports
    'Customer PDF', 'Internal Report', 'Inspection Summary', 'Customer Summary',
    // Photos / Gallery
    'Photo Required', 'Customer PDF Photo', 'Gallery', 'Internal Only', 'Customer Presentation',
    // NFPA / Code
    'NFPA 211', 'Code Failure Trigger', 'Safety Concern', 'Critical Failure', 'Inspection Level',
    // Repair Engine
    'Creates Finding', 'Repair System', 'Recommendation Trigger', 'Confidence Contribution', 'Good/Better/Best',
    // Material Engine
    'Feeds Material Calculator', 'Measurement Inputs', 'Formula', 'Output Material',
    // Estimate Engine
    'Creates Estimate Rec', 'Suggested Pricebook', 'Option Group', 'Customer-Facing Text', 'Internal-Only Text',
    // Workflow
    'Job Hub', 'Timeline', 'Scope of Work', 'Scheduling', 'Warehouse', 'Fleet', 'Morning Workflow', 'Analytics',
    // Impact & Dependency
    'Dependency Chain', 'Impact Systems', 'Validation Warnings',
  ];

  const rows = entries.map(e => {
    const purposes = safeParse(e.question_purpose, []);
    const purposeLabels = Array.isArray(purposes) ? purposes.map(p => QUESTION_PURPOSES[p]?.label || p).join('; ') : '';
    const chain = getDependencyChain(e);
    const impact = getImpactSystems(e);
    const flags = safeParse(e.validation_flags, []);

    return [
      e.question_id || '',
      e.question_text || '',
      e.inspection_type || '',
      e.section || '',
      e.subsection || '',
      e.question_role || '',
      e.question_category || '',
      purposeLabels,
      e.is_active ? 'Yes' : 'No',
      e.customer_pdf || '',
      e.internal_notes ? 'Yes' : 'No',
      e.inspection_summary ? 'Yes' : 'No',
      e.customer_summary ? 'Yes' : 'No',
      e.photo_required ? 'Yes' : 'No',
      e.photo_customer_pdf ? 'Yes' : 'No',
      e.produces_gallery ? 'Yes' : 'No',
      e.photo_internal_only ? 'Yes' : 'No',
      e.customer_facing ? 'Yes' : 'No',
      e.nfpa_211_question ? 'Yes' : 'No',
      e.pass_fail || '',
      e.safety_concern ? 'Yes' : 'No',
      e.critical_failure ? 'Yes' : 'No',
      e.inspection_level || '',
      e.produces_findings ? 'Yes' : 'No',
      e.repair_system || 'none',
      e.recommendation_trigger ? 'Yes' : 'No',
      e.confidence_contribution || '',
      e.good_better_best || '',
      e.feeds_material_calculator ? 'Yes' : 'No',
      e.calculation_input_field || '',
      e.calculation_formula || '',
      e.calculation_output_field || '',
      e.creates_recommendation ? 'Yes' : 'No',
      e.pricebook_mapping ? 'Yes' : 'No',
      e.creates_option_group ? 'Yes' : 'No',
      e.customer_facing ? 'Yes' : 'No',
      e.estimate_internal_only ? 'Yes' : 'No',
      e.workflow_job_hub ? 'Yes' : 'No',
      e.workflow_timeline ? 'Yes' : 'No',
      e.workflow_scope_of_work ? 'Yes' : 'No',
      e.workflow_scheduling ? 'Yes' : 'No',
      e.workflow_warehouse ? 'Yes' : 'No',
      e.workflow_fleet ? 'Yes' : 'No',
      e.workflow_inspection ? 'Yes' : 'No',
      e.workflow_analytics ? 'Yes' : 'No',
      chain.join(' → '),
      impact.join('; '),
      Array.isArray(flags) ? flags.join('; ') : '',
    ];
  });

  const csv = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  downloadBlob(csv, `inspection_outputs_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

// ─── Excel Export ──────────────────────────────────────────────────

export function exportOutputsExcel(entries) {
  const headers = [
    'Question ID', 'Question Text', 'Form', 'Section', 'Subsection',
    'Question Role', 'Question Category', 'Question Purpose', 'Active',
    'Customer PDF', 'Internal Report', 'Inspection Summary', 'Customer Summary',
    'Photo Required', 'Customer PDF Photo', 'Gallery', 'Internal Only', 'Customer Presentation',
    'NFPA 211', 'Code Failure Trigger', 'Safety Concern', 'Critical Failure', 'Inspection Level',
    'Creates Finding', 'Repair System', 'Recommendation Trigger', 'Confidence Contribution', 'Good/Better/Best',
    'Feeds Material Calculator', 'Measurement Inputs', 'Formula', 'Output Material',
    'Creates Estimate Rec', 'Suggested Pricebook', 'Option Group', 'Customer-Facing Text', 'Internal-Only Text',
    'Job Hub', 'Timeline', 'Scope of Work', 'Scheduling', 'Warehouse', 'Fleet', 'Morning Workflow', 'Analytics',
    'Dependency Chain', 'Impact Systems', 'Validation Warnings',
  ];

  const headerRow = headers.map(h => `<th style="background:#1a1a2e;color:#fff;padding:4px 8px;font-size:10px;border:1px solid #ccc;">${h}</th>`).join('');

  const dataRows = entries.map(e => {
    const purposes = safeParse(e.question_purpose, []);
    const purposeLabels = Array.isArray(purposes) ? purposes.map(p => QUESTION_PURPOSES[p]?.label || p).join('; ') : '';
    const chain = getDependencyChain(e);
    const impact = getImpactSystems(e);
    const flags = safeParse(e.validation_flags, []);

    const cells = [
      e.question_id || '', e.question_text || '', e.inspection_type || '', e.section || '', e.subsection || '',
      e.question_role || '', e.question_category || '', purposeLabels, e.is_active ? 'Yes' : 'No',
      e.customer_pdf || '', e.internal_notes ? 'Yes' : 'No', e.inspection_summary ? 'Yes' : 'No', e.customer_summary ? 'Yes' : 'No',
      e.photo_required ? 'Yes' : 'No', e.photo_customer_pdf ? 'Yes' : 'No', e.produces_gallery ? 'Yes' : 'No',
      e.photo_internal_only ? 'Yes' : 'No', e.customer_facing ? 'Yes' : 'No',
      e.nfpa_211_question ? 'Yes' : 'No', e.pass_fail || '', e.safety_concern ? 'Yes' : 'No',
      e.critical_failure ? 'Yes' : 'No', e.inspection_level || '',
      e.produces_findings ? 'Yes' : 'No', e.repair_system || 'none', e.recommendation_trigger ? 'Yes' : 'No',
      e.confidence_contribution || '', e.good_better_best || '',
      e.feeds_material_calculator ? 'Yes' : 'No', e.calculation_input_field || '',
      e.calculation_formula || '', e.calculation_output_field || '',
      e.creates_recommendation ? 'Yes' : 'No', e.pricebook_mapping ? 'Yes' : 'No',
      e.creates_option_group ? 'Yes' : 'No', e.customer_facing ? 'Yes' : 'No', e.estimate_internal_only ? 'Yes' : 'No',
      e.workflow_job_hub ? 'Yes' : 'No', e.workflow_timeline ? 'Yes' : 'No', e.workflow_scope_of_work ? 'Yes' : 'No',
      e.workflow_scheduling ? 'Yes' : 'No', e.workflow_warehouse ? 'Yes' : 'No', e.workflow_fleet ? 'Yes' : 'No',
      e.workflow_inspection ? 'Yes' : 'No', e.workflow_analytics ? 'Yes' : 'No',
      chain.join(' → '), impact.join('; '), Array.isArray(flags) ? flags.join('; ') : '',
    ];

    return '<tr>' + cells.map(c => {
      const v = String(c).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<td style="padding:3px 8px;font-size:10px;border:1px solid #ddd;">${v}</td>`;
    }).join('') + '</tr>';
  }).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;
  downloadBlob(html, `inspection_outputs_${new Date().toISOString().slice(0,10)}.xls`, 'application/vnd.ms-excel');
}

// ─── PDF Export ───────────────────────────────────────────────────

export function exportOutputsPDF(entries) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const margin = 20;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Inspection Engine — Outputs & Data Lineage', margin, y);
  y += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.text(`Total Questions: ${entries.length}`, margin, y);
  y += 18;

  const cols = ['Form', 'Section', 'Question', 'Role', 'Category', 'Purpose', 'PDF', 'Photos', 'NFPA', 'Repair', 'Material', 'Estimate', 'Scope', 'Warehouse', 'Analytics'];
  const colW = [40, 55, 160, 50, 65, 80, 30, 30, 30, 50, 45, 45, 35, 40, 40];
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
  for (const e of entries) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = margin; }
    if (alt) { doc.setFillColor(245, 245, 248); doc.rect(margin, y, totalW, 16, 'F'); }
    alt = !alt;

    const purposes = safeParse(e.question_purpose, []);
    const purposeStr = Array.isArray(purposes) ? purposes.slice(0, 3).map(p => QUESTION_PURPOSES[p]?.label || p).join(', ') : '';

    const cells = [
      e.inspection_type || '',
      e.section || '',
      (e.question_text || '').substring(0, 55),
      e.question_role || '',
      (e.question_category || '').substring(0, 22),
      purposeStr.substring(0, 28),
      e.customer_pdf === 'show' ? 'Y' : e.customer_pdf === 'conditional' ? 'C' : 'N',
      e.photo_required ? 'Y' : 'N',
      e.nfpa_211_question ? 'Y' : 'N',
      (e.repair_system || 'none').substring(0, 18),
      e.feeds_material_calculator ? 'Y' : 'N',
      e.estimate_recommendation ? 'Y' : 'N',
      e.workflow_scope_of_work ? 'Y' : 'N',
      e.workflow_warehouse ? 'Y' : 'N',
      e.workflow_analytics ? 'Y' : 'N',
    ];

    x = margin;
    cells.forEach((v, i) => { doc.text(String(v), x + 2, y + 11); x += colW[i]; });
    y += 16;
  }

  doc.save(`inspection_outputs_${new Date().toISOString().slice(0,10)}.pdf`);
}

export { getImpactSystems, getDependencyChain };