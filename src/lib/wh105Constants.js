export const CHECK_DEFINITIONS = [
  {
    id: 'consumables',
    label: 'Consumables',
    short: 'Consumables Submitted / Received',
    description: 'Consumable replenishment request submitted and received, or marked Not Required.',
    type: 'auto_optional',
    link: '/consumables/new',
  },
  {
    id: 'material_transfer',
    label: 'Material Transfer',
    short: 'ServiceTitan Transfer Received',
    description: 'ServiceTitan material transfer received, or Not Required if none exists.',
    type: 'auto',
    link: '/warehouse/material-returns/new',
  },
  {
    id: 'previous_returns',
    label: 'Previous Returns',
    short: 'Previous Job Items Returned',
    description: 'All WH-201 returns resolved and temporary equipment checked back in.',
    type: 'auto',
    link: '/warehouse/material-returns/new',
  },
  {
    id: 'truck_cleaned',
    label: 'Truck Cleaned',
    short: 'Truck Cleaned',
    description: 'Truck interior and exterior cleaned.',
    type: 'manual',
  },
  {
    id: 'truck_organized',
    label: 'Truck Organized',
    short: 'Truck Organized',
    description: 'Truck organized and stocked for the day.',
    type: 'manual',
  },
  {
    id: 'daily_equipment',
    label: 'Daily Equipment',
    short: 'Required Daily Equipment Ready',
    description: 'All required daily operations equipment is assigned and in good condition.',
    type: 'auto',
    link: '/tech/equipment',
  },
  {
    id: 'todays_job_equipment',
    label: "Today's Job Equipment",
    short: "Today's Job Equipment Ready",
    description: "Required equipment for today's job is assigned, or Not Required.",
    type: 'auto_optional',
    link: '/tech/equipment',
  },
  {
    id: 'materials_loaded',
    label: 'Materials Loaded',
    short: "Today's Materials Loaded",
    description: 'All materials for today loaded onto the truck.',
    type: 'conditional_manual',
  },
  {
    id: 'forklift_loading',
    label: 'Forklift Loading',
    short: 'Forklift Loading Complete',
    description: 'Forklift loading complete if required for this truck.',
    type: 'conditional_manual',
  },
  {
    id: 'blocking_issues',
    label: 'Blocking Issues',
    short: 'Blocking Issues Cleared',
    description: 'No outstanding blocking issues from any other check.',
    type: 'meta',
  },
  {
    id: 'manager_holds',
    label: 'Manager Holds',
    short: 'Manager Holds Cleared',
    description: 'No active manager holds or pending reviews.',
    type: 'auto',
  },
  {
    id: 'truck_inspection',
    label: 'Daily Safety Check',
    short: 'Daily Vehicle Safety Check Complete',
    description: 'Fuel, tires, dashboard lights, mirrors/windshield, exterior lights, fire extinguisher, first aid, vehicle safe to operate.',
    type: 'manual',
  },
  {
    id: 'dashboard_review',
    label: 'Dashboard Review',
    short: 'Morning Dashboard Reviewed',
    description: 'Reviewed today\'s jobs, appointments, tasks, and notifications.',
    type: 'manual',
  },
];

export const STATUS_CONFIG = {
  waiting: { label: 'Waiting', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  in_progress: { label: 'In Progress', text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' },
  complete: { label: 'Complete', text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' },
  not_required: { label: 'Not Required', text: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted', dot: 'bg-muted-foreground/30' },
  blocked: { label: 'Blocked', text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
  manager_override: { label: 'Override', text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
};

export const OVERRIDE_ROLES = ['operations_manager', 'director_of_operations', 'admin', 'owner'];

export const PASSING_STATUSES = ['complete', 'not_required', 'manager_override'];

export const LATE_DEPARTURE_HOUR = 8;

export function dateOnly(d) {
  return d ? String(d).split('T')[0] : '';
}

export function getStatus(check, checkId) {
  return check?.[`${checkId}_status`] || 'waiting';
}

export function computeAutoChecks(data) {
  const { consumableReqs = [], transferSheets = [], materialReturns = [], equipment = [], truck, todayJobs = [], today } = data;

  const todayConsumables = consumableReqs.filter(r => dateOnly(r.submitted_time || r.created_date) === today);
  const todayTransfers = transferSheets.filter(t => dateOnly(t.created_date) === today);
  const pendingReturns = materialReturns.filter(r => ['Pending Return', 'Returned', 'Warehouse Reviewing'].includes(r.status));
  const tempCheckouts = equipment.filter(e => e.assignment_type === 'temporary' && !e.actual_return_datetime);
  const dailyEquip = equipment.filter(e => e.required_daily_operations && e.is_active !== false);
  const dailyMissing = dailyEquip.filter(e => ['missing', 'damaged', 'out_for_repair'].includes(e.status) || ['missing', 'damaged'].includes(e.condition));
  const todaysEquip = equipment.filter(e => e.required_todays_job && e.is_active !== false);
  const todaysMissing = todaysEquip.filter(e => !e.assigned_employee && !e.assigned_employee_email);
  const forkliftRequired = truck?.forklift_required === true || truck?.forklift_required === 'Yes';
  const needsLoading = todayConsumables.length > 0 || todayTransfers.length > 0;
  const managerHolds = materialReturns.filter(r => r.manager_review_status && ['Pending', 'Investigation Requested'].includes(r.manager_review_status));

  return {
    consumables: todayConsumables.length === 0 ? 'waiting' : todayConsumables.every(r => ['received', 'completed', 'fulfilled', 'delivered'].includes((r.status || '').toLowerCase())) ? 'complete' : 'blocked',
    material_transfer: todayTransfers.length === 0 ? 'not_required' : todayTransfers.every(t => t.technician_received) ? 'complete' : 'blocked',
    previous_returns: pendingReturns.length === 0 && tempCheckouts.length === 0 ? 'not_required' : 'blocked',
    daily_equipment: dailyEquip.length === 0 ? 'not_required' : dailyMissing.length > 0 ? 'blocked' : 'complete',
    todays_job_equipment: todaysEquip.length === 0 ? 'waiting' : todaysMissing.length > 0 ? 'blocked' : 'complete',
    materials_loaded: needsLoading ? null : 'not_required',
    forklift_loading: forkliftRequired ? null : 'not_required',
    manager_holds: managerHolds.length > 0 ? 'blocked' : 'complete',
    _detail: {
      consumables: todayConsumables.length > 0 ? `${todayConsumables.length} request(s)` : 'No requests submitted',
      material_transfer: todayTransfers.length > 0 ? `${todayTransfers.length} transfer(s)` : 'No transfers today',
      previous_returns: pendingReturns.length > 0 || tempCheckouts.length > 0 ? `${pendingReturns.length} pending return(s), ${tempCheckouts.length} temp checkout(s)` : 'None pending',
      daily_equipment: dailyEquip.length === 0 ? 'No daily equipment required' : dailyMissing.length > 0 ? `${dailyMissing.length} item(s) missing/damaged: ${dailyMissing.map(e => e.item_name).join(', ')}` : `${dailyEquip.length} item(s) ready`,
      todays_job_equipment: todaysEquip.length === 0 ? 'No job-specific equipment' : todaysMissing.length > 0 ? `${todaysMissing.length} item(s) not assigned` : `${todaysEquip.length} item(s) ready`,
      manager_holds: managerHolds.length > 0 ? `${managerHolds.length} hold(s)` : 'No holds',
    },
  };
}

export function mergeChecks(record, autoChecks) {
  const merged = {};
  for (const def of CHECK_DEFINITIONS) {
    const field = `${def.id}_status`;
    const persisted = record?.[field] || 'waiting';
    const auto = autoChecks[def.id];

    if (def.type === 'meta') {
      merged[def.id] = null;
    } else if (def.type === 'manual') {
      merged[def.id] = persisted;
    } else if (def.type === 'conditional_manual') {
      merged[def.id] = auto === 'not_required' ? 'not_required' : persisted;
    } else if (def.type === 'auto_optional') {
      if (auto === 'blocked' || auto === 'complete') merged[def.id] = auto;
      else if (persisted === 'not_required') merged[def.id] = 'not_required';
      else merged[def.id] = auto || 'waiting';
    } else {
      merged[def.id] = auto || 'waiting';
    }
  }

  const blockingBlocked = CHECK_DEFINITIONS.filter(c => c.id !== 'blocking_issues').some(c => merged[c.id] === 'blocked');
  merged.blocking_issues = blockingBlocked ? 'blocked' : 'complete';

  return merged;
}

export function computeReadiness(merged) {
  const passCount = CHECK_DEFINITIONS.filter(c => PASSING_STATUSES.includes(merged[c.id])).length;
  return Math.round((passCount / CHECK_DEFINITIONS.length) * 100);
}

export function computeOverallStatus(merged, departed) {
  if (departed) return 'departed';
  const allPass = CHECK_DEFINITIONS.every(c => PASSING_STATUSES.includes(merged[c.id]));
  if (allPass) return 'ready';
  const anyBlocked = CHECK_DEFINITIONS.some(c => merged[c.id] === 'blocked');
  if (anyBlocked) return 'blocked';
  return 'in_progress';
}

export function getBlockingIssues(merged, detail) {
  return CHECK_DEFINITIONS
    .filter(c => merged[c.id] === 'blocked')
    .map(c => ({
      id: c.id,
      label: c.label,
      detail: detail?.[c.id] || '',
    }));
}

export function canStartMyDay(merged) {
  return CHECK_DEFINITIONS.every(c => PASSING_STATUSES.includes(merged[c.id]));
}