import { jsPDF } from 'jspdf';

const MATRIX_COLUMNS = [
  { key: 'section', label: 'Section' },
  { key: 'subsection', label: 'Subsection' },
  { key: 'question_text', label: 'Question Text' },
  { key: 'question_type', label: 'Type' },
  { key: 'inspection_type', label: 'Form' },
  { key: 'display_order', label: 'Order' },
  { key: 'is_active', label: 'Active' },
  { key: 'conditional_logic', label: 'Conditional' },
  { key: 'shows_when', label: 'Shows When' },
  { key: 'required', label: 'Required' },
  { key: 'answer_options', label: 'Answer Options' },
  { key: 'photo_required', label: 'Photo Req' },
  { key: 'photo_optional', label: 'Photo Opt' },
  { key: 'photo_category', label: 'Photo Category' },
  { key: 'photo_customer_pdf', label: 'Photo→PDF' },
  { key: 'photo_estimate', label: 'Photo→Est' },
  { key: 'measurement_required', label: 'Meas Req' },
  { key: 'measurement_units', label: 'Meas Units' },
  { key: 'measurement_material_calc', label: 'Meas→Material' },
  { key: 'customer_pdf', label: 'Customer PDF' },
  { key: 'nfpa_211_question', label: 'NFPA 211' },
  { key: 'code_reference', label: 'Code Reference' },
  { key: 'pass_fail', label: 'Pass/Fail' },
  { key: 'safety_concern', label: 'Safety' },
  { key: 'critical_failure', label: 'Critical' },
  { key: 'inspection_level', label: 'Insp Level' },
  { key: 'repair_system', label: 'Repair System' },
  { key: 'finding_type', label: 'Finding Type' },
  { key: 'severity', label: 'Severity' },
  { key: 'recommendation_trigger', label: 'Rec Trigger' },
  { key: 'grouped_into', label: 'Grouped Into' },
  { key: 'estimate_recommendation', label: 'Est Rec' },
  { key: 'pricebook_mapping', label: 'PB Mapping' },
  { key: 'good_better_best', label: 'G/B/B' },
  { key: 'confidence_contribution', label: 'Confidence' },
  { key: 'feeds_material_calculator', label: 'Mat Calculator' },
  { key: 'calculation_type', label: 'Calc Type' },
  { key: 'calculation_input_field', label: 'Calc Input' },
  { key: 'calculation_formula', label: 'Formula' },
  { key: 'creates_recommendation', label: 'Creates Rec' },
  { key: 'adds_estimate_item', label: 'Est Item' },
  { key: 'suggests_upgrade', label: 'Upgrade' },
  { key: 'creates_option_group', label: 'Option Group' },
  { key: 'customer_facing', label: 'Customer Facing' },
  { key: 'estimate_internal_only', label: 'Est Internal' },
  { key: 'workflow_inspection', label: 'WF: Inspection' },
  { key: 'workflow_pdf', label: 'WF: PDF' },
  { key: 'workflow_material_calculator', label: 'WF: Material' },
  { key: 'workflow_repair_system', label: 'WF: Repair' },
  { key: 'workflow_estimate', label: 'WF: Estimate' },
  { key: 'workflow_scope_of_work', label: 'WF: Scope' },
  { key: 'workflow_scheduling', label: 'WF: Scheduling' },
  { key: 'workflow_warehouse', label: 'WF: Warehouse' },
  { key: 'workflow_fleet', label: 'WF: Fleet' },
  { key: 'workflow_job_hub', label: 'WF: Job Hub' },
  { key: 'workflow_timeline', label: 'WF: Timeline' },
  { key: 'workflow_analytics', label: 'WF: Analytics' },
  { key: 'validation_unused', label: 'V: Unused' },
  { key: 'validation_duplicate', label: 'V: Duplicate' },
  { key: 'validation_incomplete', label: 'V: Incomplete' },
  { key: 'validation_missing_mapping', label: 'V: Missing Map' },
  { key: 'validation_missing_repair_mapping', label: 'V: Missing Repair' },
  { key: 'validation_missing_pdf_mapping', label: 'V: Missing PDF' },
  { key: 'validation_missing_material_calc', label: 'V: Missing MatCalc' },
  { key: 'validation_missing_estimate_mapping', label: 'V: Missing EstMap' },
  { key: 'validation_flags', label: 'Validation Flags' },
];

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function cellValue(entry, col) {
  const val = entry[col.key];
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (col.key === 'validation_flags') {
    const flags = safeParse(val, []);
    return Array.isArray(flags) ? flags.join('; ') : '';
  }
  return val ?? '';
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

export function exportCSV(entries) {
  const headers = MATRIX_COLUMNS.map(c => `"${c.label}"`);
  const rows = entries.map(e =>
    MATRIX_COLUMNS.map(c => {
      const v = String(cellValue(e, c)).replace(/"/g, '""');
      return `"${v}"`;
    }).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(csv, `inspection_matrix_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

export function exportExcel(entries) {
  const headerRow = MATRIX_COLUMNS.map(c => `<th style="background:#1a1a2e;color:#fff;padding:4px 8px;font-size:10px;border:1px solid #ccc;">${c.label}</th>`).join('');
  const dataRows = entries.map(e =>
    '<tr>' + MATRIX_COLUMNS.map(c => {
      const v = String(cellValue(e, c)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<td style="padding:3px 8px;font-size:10px;border:1px solid #ddd;">${v}</td>`;
    }).join('') + '</tr>'
  ).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;
  downloadBlob(html, `inspection_matrix_${new Date().toISOString().slice(0,10)}.xls`, 'application/vnd.ms-excel');
}

export function exportPDF(entries) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Inspection Matrix', margin, y);
  y += 18;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 12;
  doc.text(`Total Questions: ${entries.length}`, margin, y);
  y += 20;

  const cols = ['Section', 'Subsection', 'Question', 'Type', 'Req', 'Cond', 'NFPA', 'Safety', 'Repair System', 'Severity', 'G/B/B', 'Validation Flags'];
  const colWidths = [60, 60, 180, 45, 30, 35, 35, 35, 70, 50, 50, 140];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Header
  doc.setFillColor(26, 26, 46);
  doc.rect(margin, y, totalWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c, x + 2, y + 12);
    x += colWidths[i];
  });
  y += 18;

  // Rows
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  let alt = false;
  for (const e of entries) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = margin;
    }
    if (alt) {
      doc.setFillColor(245, 245, 248);
      doc.rect(margin, y, totalWidth, 16, 'F');
    }
    alt = !alt;

    const flags = safeParse(e.validation_flags, []);
    const flagStr = Array.isArray(flags) ? flags.join('; ') : '';

    const cells = [
      e.section || '',
      e.subsection || '',
      (e.question_text || '').substring(0, 60),
      e.question_type || '',
      e.required ? 'Y' : 'N',
      e.conditional_logic ? 'Y' : 'N',
      e.nfpa_211_question ? 'Y' : 'N',
      e.safety_concern ? 'Y' : 'N',
      e.repair_system || 'none',
      e.severity || '',
      e.good_better_best || '',
      flagStr.substring(0, 80),
    ];

    x = margin;
    cells.forEach((v, i) => {
      doc.text(String(v), x + 2, y + 11);
      x += colWidths[i];
    });
    y += 16;
  }

  doc.save(`inspection_matrix_${new Date().toISOString().slice(0,10)}.pdf`);
}