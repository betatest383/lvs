import { base44 } from '@/api/base44Client';

export const AUDIT_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual', 'Random'];

export const AUDIT_STATUSES = ['In Progress', 'Completed', 'Under Review', 'Closed'];

export const CORRECTIVE_STATUSES = ['Open', 'In Progress', 'Completed', 'Overdue', 'Verified'];

export const CORRECTIVE_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const ROLE_OPTIONS = [
  'Warehouse Associate', 'Warehouse Manager', 'Lead Technician', 'Apprentice',
  'CSR', 'Dispatcher', 'Sales Technician', 'Operations Manager', 'Office Manager', 'Owner',
];

export const SUGGESTED_SECTIONS = [
  'Documentation', 'Process Execution', 'Quality', 'Safety',
  'Customer Experience', 'Inventory', 'Housekeeping', 'Company Standards',
];

export const AUDIT_STATUS_COLORS = {
  'In Progress': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Completed': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'Under Review': { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  'Closed': { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' },
};

export const CORRECTIVE_STATUS_COLORS = {
  'Open': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'In Progress': { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  'Completed': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'Overdue': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'Verified': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
};

export const PRIORITY_COLORS = {
  Critical: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  High: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  Low: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
};

export function getScoreColor(score) {
  if (score >= 90) return { text: 'text-green-600', bg: 'bg-green-500', label: 'Excellent' };
  if (score >= 75) return { text: 'text-blue-600', bg: 'bg-blue-500', label: 'Good' };
  if (score >= 60) return { text: 'text-yellow-600', bg: 'bg-yellow-500', label: 'Needs Improvement' };
  return { text: 'text-red-600', bg: 'bg-red-500', label: 'Critical' };
}

export async function generateAuditTemplateId(department, relatedSop) {
  if (relatedSop) return `AUD-${relatedSop}`;
  const prefix = department ? department.substring(0, 2).toUpperCase() : '00';
  try {
    const all = await base44.entities.AuditTemplate.list('-created_date', 500);
    const matching = all.filter((t) => t.audit_id?.startsWith(`AUD-${prefix}`));
    const nextNum = matching.length + 101;
    return `AUD-${prefix}-${nextNum}`;
  } catch {
    return `AUD-${prefix}-101`;
  }
}

export async function generateAuditNumber() {
  try {
    const all = await base44.entities.ManagementAudit.list('-created_date', 500);
    let maxNum = 0;
    all.forEach((a) => {
      const match = a.audit_number?.match(/MA-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });
    return `MA-${String(maxNum + 1).padStart(6, '0')}`;
  } catch {
    return `MA-${String(Math.floor(Math.random() * 900000) + 100000).padStart(6, '0')}`;
  }
}

export function parseSections(sectionsStr) {
  try {
    return JSON.parse(sectionsStr || '[]');
  } catch {
    return [];
  }
}

export function calculateScore(sections, results) {
  let totalWeight = 0;
  let passWeight = 0;
  let failedItems = 0;
  let criticalFailures = 0;

  sections.forEach((section, sIdx) => {
    (section.items || []).forEach((item, iIdx) => {
      const r = results[`${sIdx}-${iIdx}`];
      if (!r || r.result === 'na' || !r.result) return;
      const weight = item.weight || 1;
      totalWeight += weight;
      if (r.result === 'pass') {
        passWeight += weight;
      } else if (r.result === 'fail') {
        failedItems++;
        if (item.required) criticalFailures++;
      }
    });
  });

  const passPercentage = totalWeight > 0 ? Math.round((passWeight / totalWeight) * 100) : 0;
  return { totalWeight, passWeight, passPercentage, overallScore: passPercentage, failedItems, criticalFailures };
}

export function buildChecklistResults(sections, results) {
  const output = [];
  sections.forEach((section, sIdx) => {
    (section.items || []).forEach((item, iIdx) => {
      const r = results[`${sIdx}-${iIdx}`];
      if (!r) return;
      output.push({
        section: section.name,
        description: item.description,
        weight: item.weight || 1,
        required: item.required || false,
        photo_required: item.photo_required || false,
        result: r.result || 'na',
        comments: r.comments || '',
        photos: r.photos || [],
      });
    });
  });
  return output;
}

export function calcCompliance(audits) {
  if (audits.length === 0) return { compliance: 0, avgScore: 0, count: 0 };
  const completed = audits.filter((a) => a.status === 'Completed' || a.status === 'Closed');
  if (completed.length === 0) return { compliance: 0, avgScore: 0, count: 0 };
  const avgScore = Math.round(completed.reduce((s, a) => s + (a.pass_percentage || 0), 0) / completed.length);
  const passing = completed.filter((a) => (a.pass_percentage || 0) >= 75).length;
  const compliance = Math.round((passing / completed.length) * 100);
  return { compliance, avgScore, count: completed.length };
}

export function getMostCommonFailures(audits) {
  const failCounts = {};
  audits.forEach((audit) => {
    const results = JSON.parse(audit.checklist_results || '[]');
    results.forEach((r) => {
      if (r.result === 'fail') {
        const key = r.description || 'Unknown';
        failCounts[key] = (failCounts[key] || 0) + 1;
      }
    });
  });
  return Object.entries(failCounts)
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count);
}

export function getEmployeeStats(audits, employeeName) {
  const empAudits = audits.filter((a) => a.employee === employeeName);
  const { compliance, avgScore, count } = calcCompliance(empAudits);
  return { name: employeeName, audits: empAudits.length, completed: count, avgScore, compliance };
}