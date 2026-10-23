// Authoritative per-day labor model for Scope of Work.
// A multi-day job must NOT assume 8 hours per production day. Each scheduled day
// carries its own crew_hours; totals are DERIVED from the daily structure.

// NOTE: The authoritative apprentice labor rate is the LoadedLaborCost entity
// (role = 'apprentice', loaded_hourly_cost) — the single pricing configuration
// source read by every pricing consumer (backend calculatePricing). This module
// deliberately does NOT hardcode a dollar rate; deriveScheduleTotals returns
// apprenticeManHours (rate-agnostic) only. Callers that need a dollar cost must
// fetch LoadedLaborCost themselves (see ScopeOfWorkBuilderDialog).
export const DEFAULT_DAY_HOURS = 8;
export const MAX_NORMAL_DAY_HOURS = 12; // anything over this requires confirmation / management authorization

/**
 * Resolve the effective crew_hours for a single day, applying backward-compat
 * defaults for older plans that predate the crew_hours field.
 */
export function resolveDayHours(plan, index, opts = {}) {
  const { projectDuration, estimatedHours } = opts;
  const raw = plan?.crew_hours;
  if (raw === undefined || raw === null || raw === '' || isNaN(Number(raw))) {
    if (projectDuration === 'less_than_one_day' && index === 0) {
      return Number(estimatedHours) || 0;
    }
    return DEFAULT_DAY_HOURS;
  }
  return Number(raw);
}

/**
 * Compute authoritative labor values from a phase's daily_plans.
 * Returns the canonical daily schedule plus derived totals.
 */
export function computeDailySchedule(dailyPlans, opts = {}) {
  const plans = Array.isArray(dailyPlans) ? dailyPlans : [];
  const days = plans.map((p, i) => ({
    day_number: p?.day_number || (i + 1),
    crew_hours: resolveDayHours(p, i, opts),
    apprentice_count: Number(p?.apprentices) || 0,
    lead_technicians: Number(p?.lead_technicians) || 0,
    masons: Number(p?.masons) || 0,
  }));

  let totalCrewHours = 0;
  let productionDays = 0;
  let apprenticeManHours = 0;
  let leadManHours = 0;
  let masonManHours = 0;
  let maxCrew = 1;
  let totalLeads = 0;
  let totalApprentices = 0;
  let totalMasons = 0;

  for (const d of days) {
    const h = d.crew_hours > 0 ? d.crew_hours : 0;
    totalCrewHours += h;
    if (h > 0) productionDays += 1;
    apprenticeManHours += d.apprentice_count * h;
    leadManHours += d.lead_technicians * h;
    masonManHours += d.masons * h;
    const dayCrew = d.lead_technicians + d.apprentice_count + d.masons;
    maxCrew = Math.max(maxCrew, dayCrew || 1);
    totalLeads += d.lead_technicians;
    totalApprentices += d.apprentice_count;
    totalMasons += d.masons;
  }

  return {
    days,
    totalCrewHours,
    productionDays,
    apprenticeManHours,
    leadManHours,
    masonManHours,
    maxCrew,
    totalLeads,
    totalApprentices,
    totalMasons,
  };
}

/**
 * Storage shape for the authoritative daily schedule:
 *   [{ day_number, crew_hours, apprentice_count }]
 */
export function toStorageSchedule(days) {
  return (days || []).map(d => ({
    day_number: d.day_number,
    crew_hours: d.crew_hours,
    apprentice_count: d.apprentice_count,
    lead_technicians: d.lead_technicians,
    masons: d.masons,
  }));
}

/**
 * Aggregate multiple per-phase daily schedules into a single job-level daily
 * schedule by day_number (phases treated as concurrent). Used for the scope-level
 * daily_schedule field and scope-level derived totals.
 */
export function aggregateDailySchedule(phaseSchedules) {
  const byDay = {};
  for (const sched of phaseSchedules) {
    if (!Array.isArray(sched)) continue;
    for (const d of sched) {
      const dn = d.day_number;
      if (!byDay[dn]) byDay[dn] = { day_number: dn, crew_hours: 0, apprentice_count: 0, lead_technicians: 0, masons: 0 };
      byDay[dn].crew_hours += Number(d.crew_hours) || 0;
      byDay[dn].apprentice_count += Number(d.apprentice_count) || 0;
      byDay[dn].lead_technicians += Number(d.lead_technicians) || 0;
      byDay[dn].masons += Number(d.masons) || 0;
    }
  }
  return Object.values(byDay).sort((a, b) => a.day_number - b.day_number);
}

/**
 * Derive scope-level totals from an aggregated daily schedule.
 */
export function deriveScheduleTotals(dailySchedule) {
  const sched = Array.isArray(dailySchedule) ? dailySchedule : [];
  let totalCrewHours = 0;
  let productionDays = 0;
  let apprenticeManHours = 0;
  for (const d of sched) {
    const h = Number(d.crew_hours) || 0;
    totalCrewHours += h > 0 ? h : 0;
    if (h > 0) productionDays += 1;
    apprenticeManHours += (Number(d.apprentice_count) || 0) * h;
  }
  return {
    totalCrewHours,
    productionDays,
    apprenticeManHours,
  };
}

/**
 * Whether a day carries user-entered data worth warning about before removal
 * (used when reducing the number of production days).
 */
export function dayHasSavedData(plan) {
  if (!plan) return false;
  const ch = plan.crew_hours;
  if (ch !== undefined && ch !== null && ch !== '' && Number(ch) !== DEFAULT_DAY_HOURS) return true;
  if (plan.work_activities && plan.work_activities.length > 0) return true;
  if ((plan.work_notes || '').trim()) return true;
  if ((plan.staging_sequence || '').trim()) return true;
  if ((plan.lead_technicians || 0) > 0) return true;
  if ((plan.apprentices || 0) > 0) return true;
  if ((plan.masons || 0) > 0) return true;
  return false;
}