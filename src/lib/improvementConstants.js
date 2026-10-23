import { base44 } from '@/api/base44Client';

export const CATEGORIES = [
  'Process', 'Policy', 'Workflow', 'Form', 'Dashboard', 'KPI',
  'Automation', 'Software', 'Customer Experience', 'Safety',
  'Inventory', 'Equipment', 'Training', 'Documentation', 'Other',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const BUSINESS_IMPACTS = [
  'Safety', 'Customer Experience', 'Revenue', 'Efficiency', 'Quality',
  'Inventory', 'Compliance', 'Training', 'Cost Savings', 'Employee Satisfaction',
];

export const ESTIMATED_BENEFITS = [
  'Time Saved', 'Cost Savings', 'Reduced Errors', 'Better Customer Experience',
  'Improved Safety', 'Increased Revenue', 'Other',
];

export const STATUSES = [
  'New', 'Needs Review', 'Approved', 'Rejected',
  'In Development', 'Testing', 'Implemented', 'Archived',
];

export const KANBAN_COLUMNS = [
  { id: 'New', title: 'New', statuses: ['New'], color: 'border-blue-400' },
  { id: 'Review', title: 'Review', statuses: ['Needs Review'], color: 'border-yellow-400' },
  { id: 'Approved', title: 'Approved', statuses: ['Approved'], color: 'border-green-400' },
  { id: 'Development', title: 'Development', statuses: ['In Development'], color: 'border-purple-400' },
  { id: 'Testing', title: 'Testing', statuses: ['Testing'], color: 'border-indigo-400' },
  { id: 'Implemented', title: 'Implemented', statuses: ['Implemented'], color: 'border-teal-400' },
  { id: 'Archive', title: 'Archive', statuses: ['Archived', 'Rejected'], color: 'border-gray-400' },
];

export const STATUS_COLORS = {
  'New': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Needs Review': { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  'Approved': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'Rejected': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'In Development': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Testing': { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  'Implemented': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  'Archived': { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' },
};

export const PRIORITY_COLORS = {
  Critical: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  High: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  Low: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
};

export const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function deriveModuleFromPath(pathname) {
  if (pathname.startsWith('/warehouse')) return 'Warehouse';
  if (pathname.startsWith('/lvcos')) return 'LVC OS Registry';
  if (pathname.startsWith('/operations')) return 'Operations Center';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/tech')) return 'Field Operations';
  if (pathname.startsWith('/customer')) return 'Customer Portal';
  if (pathname.startsWith('/ci')) return 'Continuous Improvement';
  return 'Other';
}

export async function generateImprovementId() {
  try {
    const all = await base44.entities.ImprovementRequest.list('-created_date', 500);
    let maxNum = 0;
    all.forEach((item) => {
      const match = item.improvement_id?.match(/IMP-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });
    return `IMP-${String(maxNum + 1).padStart(6, '0')}`;
  } catch {
    return `IMP-${String(Math.floor(Math.random() * 900000) + 100000).padStart(6, '0')}`;
  }
}

export function calcAvgDaysToComplete(items) {
  const implemented = items.filter((i) => i.status === 'Implemented' && i.completion_date && i.date_submitted);
  if (implemented.length === 0) return 0;
  const totalDays = implemented.reduce((sum, i) => {
    const diff = new Date(i.completion_date) - new Date(i.date_submitted);
    return sum + diff / (1000 * 60 * 60 * 24);
  }, 0);
  return Math.round(totalDays / implemented.length);
}

export function calcEmployeeStats(items) {
  const stats = {};
  items.forEach((item) => {
    const name = item.submitted_by || 'Unknown';
    if (!stats[name]) {
      stats[name] = {
        name, email: item.submitted_by_email || '',
        submitted: 0, approved: 0, implemented: 0,
        dollarsSaved: 0, hoursSaved: 0,
      };
    }
    stats[name].submitted++;
    if (['Approved', 'In Development', 'Testing', 'Implemented'].includes(item.status)) stats[name].approved++;
    if (item.status === 'Implemented') {
      stats[name].implemented++;
      stats[name].dollarsSaved += item.estimated_cost_savings || 0;
      stats[name].hoursSaved += item.estimated_time_saved_hours || 0;
    }
  });
  return Object.values(stats).map((s) => ({
    ...s,
    score: s.submitted + s.approved * 3 + s.implemented * 5 + Math.floor(s.dollarsSaved / 100),
  })).sort((a, b) => b.score - a.score);
}