/**
 * Inspection Standards Library — Export Utilities
 */

function buildExportRow(std) {
  return {
    'Standard Name': std.standard_name || '',
    'Standard Number': std.standard_number || '',
    'Version': std.version || '',
    'Status': std.status || '',
    'Category': std.category || '',
    'Applies To': (std.applies_to || []).join('; '),
    'Inspection Level': std.inspection_level || '',
    'Authority Level': (std.authority_level || []).join('; '),
    'Severity': std.severity || '',
    'Default Repair System': std.default_repair_system || '',
    'Pass Criteria': std.pass_criteria || '',
    'Warning Criteria': std.warning_criteria || '',
    'Fail Criteria': std.fail_criteria || '',
    'Critical Failure Criteria': std.critical_failure_criteria || '',
    'Customer Explanation': std.customer_explanation || '',
    'Created By': std.created_by || '',
    'Approved By': std.approved_by || '',
    'Approval Date': std.approval_date || '',
  };
}

export function exportStandardsCSV(standards) {
  if (!standards || standards.length === 0) return;
  const rows = standards.map(buildExportRow);
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inspection_standards_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportStandardsExcel(standards) {
  if (!standards || standards.length === 0) return;
  const rows = standards.map(buildExportRow);
  const headers = Object.keys(rows[0]);
  let html = '<table border="1"><tr>';
  html += headers.map(h => `<th>${h}</th>`).join('');
  html += '</tr>';
  for (const r of rows) {
    html += '<tr>' + headers.map(h => `<td>${String(r[h]).replace(/</g, '&lt;')}</td>`).join('') + '</tr>';
  }
  html += '</table>';
  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inspection_standards_${new Date().toISOString().split('T')[0]}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportStandardsPDF(standards) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Inspection Standards Library', 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
    doc.text(`Total Standards: ${standards.length}`, pageWidth - 14, y, { align: 'right' });
    y += 8;

    for (const std of standards) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.text(std.standard_name || 'Unnamed', 14, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      const info = [
        `Number: ${std.standard_number || 'N/A'}  |  Version: ${std.version || 'N/A'}  |  Status: ${std.status || 'N/A'}`,
        `Category: ${std.category || 'N/A'}  |  Severity: ${std.severity || 'N/A'}`,
        `Authority: ${(std.authority_level || []).join(', ') || 'N/A'}`,
        std.pass_criteria ? `Pass: ${std.pass_criteria.substring(0, 120)}` : '',
        std.fail_criteria ? `Fail: ${std.fail_criteria.substring(0, 120)}` : '',
      ].filter(Boolean);
      for (const line of info) {
        if (y > 280) { doc.addPage(); y = 20; }
        const split = doc.splitTextToSize(line, pageWidth - 28);
        doc.text(split, 14, y);
        y += 4 * split.length;
      }
      y += 3;
    }
    doc.save(`inspection_standards_${new Date().toISOString().split('T')[0]}.pdf`);
  });
}