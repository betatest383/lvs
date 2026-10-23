// Commission calculation utilities for frontend use

export const COMPENSATION_METHODS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'commission', label: 'Commission' },
  { value: 'salary', label: 'Salary' },
  { value: 'hourly_plus_commission', label: 'Hourly + Commission' },
];

export const COMMISSION_BASES = [
  { value: 'job_subtotal', label: 'Job Subtotal' },
  { value: 'completed_revenue', label: 'Completed Revenue' },
  { value: 'collected_revenue', label: 'Collected Revenue' },
  { value: 'service_revenue', label: 'Service Revenue' },
  { value: 'gross_profit', label: 'Gross Profit' },
  { value: 'custom', label: 'Custom' },
];

export const COMMISSION_TIMINGS = [
  { value: 'estimate_approved', label: 'Estimate Approved' },
  { value: 'work_completed', label: 'Work Completed' },
  { value: 'invoice_closed', label: 'Invoice Closed' },
  { value: 'payment_collected', label: 'Payment Collected' },
];

export const EARNING_STATUSES = [
  { value: 'estimated', label: 'Estimated', color: 'bg-blue-100 text-blue-700' },
  { value: 'pending_completion', label: 'Pending Completion', color: 'bg-amber-100 text-amber-700' },
  { value: 'earned', label: 'Earned', color: 'bg-green-100 text-green-700' },
  { value: 'payable', label: 'Payable', color: 'bg-purple-100 text-purple-700' },
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'reversed', label: 'Reversed', color: 'bg-red-100 text-red-700' },
  { value: 'disputed', label: 'Disputed', color: 'bg-orange-100 text-orange-700' },
];

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

export function getCompensationMethodLabel(method) {
  return COMPENSATION_METHODS.find(m => m.value === method)?.label || method || '—';
}

export function getCommissionBasisLabel(basis) {
  return COMMISSION_BASES.find(b => b.value === basis)?.label || basis || '—';
}

export function getCommissionTimingLabel(timing) {
  return COMMISSION_TIMINGS.find(t => t.value === timing)?.label || timing || '—';
}

export function getEarningStatusLabel(status) {
  return EARNING_STATUSES.find(s => s.value === status)?.label || status || '—';
}

export function getEarningStatusColor(status) {
  return EARNING_STATUSES.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700';
}

export function formatTimeDisplay(hours, minutes) {
  const h = hours || 0;
  const m = minutes || 0;
  if (h === 0 && m === 0) return '—';
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export function formatCommission(type, value) {
  if (!type || type === 'none') return 'None';
  if (type === 'percentage') return `${value || 0}%`;
  if (type === 'flat_dollar') return formatCurrency(value || 0);
  return `${value || 0}`;
}

// Calculate commissionable subtotal from snapshot data and plan settings
export function calculateLineCommission({ commission_type, commission_value, price, quantity = 1 }) {
  if (!commission_type || commission_type === 'none') return 0;
  const lineTotal = (price || 0) * (quantity || 1);
  if (commission_type === 'percentage') {
    return Math.round(lineTotal * (commission_value || 0) / 100 * 100) / 100;
  }
  if (commission_type === 'flat_dollar') {
    return (commission_value || 0) * (quantity || 1);
  }
  return 0;
}

export function calculateCommissionableSubtotalFromSnapshot(snapshot, plan) {
  if (!snapshot || !plan) return 0;
  let subtotal = 0;
  if (plan.include_service_revenue !== false) subtotal += snapshot.base_service_price || 0;
  if (plan.include_chargeable_materials !== false) subtotal += snapshot.base_material_price || 0;
  
  let modifiers = [];
  try { modifiers = JSON.parse(snapshot.matched_modifiers_json || '[]'); } catch {}
  
  if (plan.include_visible_price_modifiers !== false) {
    for (const m of modifiers) {
      if (m.customer_visible && m.affects_customer_price) subtotal += m.adjustment_amount || 0;
    }
  }
  if (plan.include_discounts !== false) {
    for (const m of modifiers) {
      if (m.adjustment_amount < 0) subtotal += m.adjustment_amount || 0;
    }
  }
  return Math.max(0, subtotal);
}