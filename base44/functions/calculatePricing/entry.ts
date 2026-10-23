import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ── Inline trigger evaluation (backend functions can't import src/lib) ──
function evaluateTrigger(modifier, scopeValues) {
  if (!modifier.operator || modifier.operator === 'always') return true;
  if (!modifier.source_field) return false;
  const fieldValue = scopeValues[modifier.source_field];
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') return false;
  const triggerValue = modifier.trigger_value;
  const operator = modifier.operator;
  switch (operator) {
    case 'equals': return String(fieldValue).toLowerCase() === String(triggerValue).toLowerCase();
    case 'does_not_equal': return String(fieldValue).toLowerCase() !== String(triggerValue).toLowerCase();
    case 'greater_than':
    case 'quantity_greater_than': return parseFloat(fieldValue) > parseFloat(triggerValue);
    case 'greater_than_or_equal': return parseFloat(fieldValue) >= parseFloat(triggerValue);
    case 'less_than': return parseFloat(fieldValue) < parseFloat(triggerValue);
    case 'less_than_or_equal': return parseFloat(fieldValue) <= parseFloat(triggerValue);
    case 'between': return parseFloat(fieldValue) >= parseFloat(triggerValue) && parseFloat(fieldValue) <= parseFloat(modifier.secondary_trigger_value);
    case 'contains': return String(fieldValue).toLowerCase().includes(String(triggerValue).toLowerCase());
    case 'selected': return Array.isArray(fieldValue) ? fieldValue.includes(triggerValue) : Boolean(fieldValue);
    default: return false;
  }
}

function calculateAdjustment(modifier, baseAmounts) {
  const method = modifier.calculation_method;
  const base = baseAmounts[modifier.applies_to] || 0;
  let adjustment = 0, newPrice = base, formula = '';
  switch (method) {
    case 'fixed_amount': adjustment = modifier.modifier_value || 0; newPrice = base + adjustment; formula = `+ $${adjustment.toFixed(2)}`; break;
    case 'percentage': adjustment = base * ((modifier.percentage_value || 0) / 100); newPrice = base + adjustment; formula = `+ ${modifier.percentage_value}% of $${base.toFixed(2)}`; break;
    case 'multiplier': newPrice = base * (modifier.multiplier_value || 1); adjustment = newPrice - base; formula = `× ${modifier.multiplier_value}`; break;
    case 'hourly': adjustment = (modifier.hourly_rate || 0) * (baseAmounts.estimated_hours || 0); newPrice = base + adjustment; formula = `$${modifier.hourly_rate}/hr × ${baseAmounts.estimated_hours || 0} hrs`; break;
    case 'daily': adjustment = (modifier.daily_rate || 0) * (baseAmounts.project_days || 0); newPrice = base + adjustment; formula = `$${modifier.daily_rate}/day × ${baseAmounts.project_days || 0} days`; break;
    case 'per_unit': adjustment = (modifier.unit_rate || 0) * (baseAmounts.unit_quantity || 1); newPrice = base + adjustment; formula = `$${modifier.unit_rate}/unit`; break;
    case 'cost_plus_markup': adjustment = base * ((modifier.markup_percentage || 0) / 100); newPrice = base + adjustment; formula = `+ ${modifier.markup_percentage}% markup`; break;
    case 'replace_price': newPrice = modifier.modifier_value || 0; adjustment = newPrice - base; formula = `Replace with $${newPrice.toFixed(2)}`; break;
    case 'minimum_charge': newPrice = Math.max(base, modifier.minimum_amount || 0); adjustment = newPrice - base; formula = `Min $${modifier.minimum_amount}`; break;
    case 'maximum_charge': newPrice = Math.min(base, modifier.maximum_amount || 0); adjustment = newPrice - base; formula = `Max $${modifier.maximum_amount}`; break;
    default: formula = 'Unknown method';
  }
  return { adjustment, newPrice, formula, baseAmount: base };
}

function extractScopeValues(scope) {
  const v = {};
  v['scope.project_days'] = scope.estimated_days || 1;
  v['scope.estimated_hours'] = scope.estimated_hours || scope.total_estimated_hours || 0;

  // ── Authoritative per-day labor model ──
  // When work_phases carry per-day crew_hours, derive total_crew_hours,
  // production_days, and per-role man-hours from the daily structure. This
  // replaces the legacy "production_days × 8" assumption. Legacy scopes
  // without daily crew_hours keep their stored estimated_hours/days (safe
  // fallback — no silent recalculation of finalized records).
  let workPhases = [];
  try { workPhases = JSON.parse(scope.work_phases || '[]'); } catch {}
  let dailyCrewHours = 0;
  let leadManHours = 0, apprenticeManHours = 0, masonManHours = 0;
  let leadQty = 0, apprenticeQty = 0, masonQty = 0;
  let hasDaily = false;
  for (const phase of workPhases) {
    const sd = phase.scope_data || {};
    let plans = [];
    try { plans = typeof sd.daily_plans === 'string' ? JSON.parse(sd.daily_plans || '[]') : (sd.daily_plans || []); } catch {}
    if (!Array.isArray(plans)) plans = [];
    for (const p of plans) {
      const ch = Number(p.crew_hours);
      if (isNaN(ch) || ch <= 0) continue;
      hasDaily = true;
      dailyCrewHours += ch;
      const leads = Number(p.lead_technicians) || 0;
      const apps = Number(p.apprentices) || 0;
      const masons = Number(p.masons) || 0;
      leadManHours += leads * ch;
      apprenticeManHours += apps * ch;
      masonManHours += masons * ch;
      leadQty = Math.max(leadQty, leads);
      apprenticeQty = Math.max(apprenticeQty, apps);
      masonQty = Math.max(masonQty, masons);
    }
  }
  if (hasDaily) {
    v['scope.has_daily'] = true;
    v['scope.total_crew_hours'] = dailyCrewHours;
    v['scope.lead_man_hours'] = leadManHours;
    v['scope.apprentice_man_hours'] = apprenticeManHours;
    v['scope.mason_man_hours'] = masonManHours;
    v['scope.lead_technician_quantity'] = leadQty;
    v['scope.apprentice_quantity'] = apprenticeQty;
    v['scope.mason_quantity'] = masonQty;
    let dailySchedule = [];
    try { dailySchedule = typeof scope.daily_schedule === 'string' ? JSON.parse(scope.daily_schedule || '[]') : (scope.daily_schedule || []); } catch {}
    const prodDays = Array.isArray(dailySchedule) && dailySchedule.length > 0
      ? dailySchedule.filter(d => Number(d.crew_hours) > 0).length
      : 1;
    v['scope.production_days'] = prodDays;
    v['scope.project_days'] = prodDays;
    v['scope.estimated_hours'] = dailyCrewHours;
  }

  let crewReqs = [];
  try { crewReqs = JSON.parse(scope.crew_requirements || '[]'); } catch {}
  // Only use crew_requirements for role quantities when there is no daily
  // schedule (legacy). The daily schedule is authoritative for variable
  // daily staffing.
  if (!v['scope.has_daily']) {
    for (const c of crewReqs) {
      const role = (c.role || '').toLowerCase();
      if (role.includes('lead')) v['scope.lead_technician_quantity'] = c.count || 0;
      if (role.includes('apprentice')) v['scope.apprentice_quantity'] = c.count || 0;
      if (role.includes('mason') && !role.includes('helper')) v['scope.mason_quantity'] = c.count || 0;
    }
  }
  let equipment = [];
  try { equipment = JSON.parse(scope.required_equipment || scope.equipment || '[]'); } catch {}
  for (const eq of equipment) {
    const name = (eq.item_name || '').toLowerCase();
    if (name.includes('scaffold')) v['scope.scaffold_required'] = 'true';
    if (name.includes('lift') || name.includes('boom')) v['scope.lift_required'] = 'true';
  }
  let jobConditions = {};
  try { jobConditions = typeof scope.job_conditions === 'string' ? JSON.parse(scope.job_conditions) : (scope.job_conditions || {}); } catch {}
  v['scope.roof_pitch'] = String(jobConditions.roof_pitch || '');
  v['scope.story_count'] = String(jobConditions.story_count || jobConditions.stories || '');
  v['scope.access_condition'] = String(jobConditions.access_condition || jobConditions.access_difficulty || '');
  v['scope.job_conditions'] = scope.job_conditions || '{}';
  v['scope.staging_sequence'] = String(jobConditions.staging_sequence || '');
  v['scope.additional_vehicle_required'] = jobConditions.additional_vehicle_required ? 'true' : '';
  return v;
}

// ── Per-day crew hours for the hourly-capped GP target model ──
// Returns [{day_number, actual_crew_hours}] resolved from the authoritative
// daily_schedule, then work_phases daily_plans, then a legacy single-day
// fallback. The 8-hour cap is applied by the caller (never here) so the same
// actual-hours value drives BOTH target hours (capped) and direct labor cost
// (uncapped) — apprentice/lead labor is never capped at 8.
function extractDailyHours(scope, scopeValues) {
  let dailySchedule = [];
  try { dailySchedule = typeof scope.daily_schedule === 'string' ? JSON.parse(scope.daily_schedule || '[]') : (scope.daily_schedule || []); } catch {}
  if (Array.isArray(dailySchedule) && dailySchedule.length > 0) {
    const out = [];
    for (const d of dailySchedule) {
      const ch = Number(d.crew_hours);
      if (isNaN(ch) || ch <= 0) continue;
      out.push({ day_number: Number(d.day_number) || (out.length + 1), actual_crew_hours: ch });
    }
    if (out.length > 0) return out;
  }
  let workPhases = [];
  try { workPhases = JSON.parse(scope.work_phases || '[]'); } catch {}
  const out = [];
  for (const phase of workPhases) {
    const sd = phase.scope_data || {};
    let plans = [];
    try { plans = typeof sd.daily_plans === 'string' ? JSON.parse(sd.daily_plans || '[]') : (sd.daily_plans || []); } catch {}
    if (!Array.isArray(plans)) plans = [];
    for (const p of plans) {
      const ch = Number(p.crew_hours);
      if (isNaN(ch) || ch <= 0) continue;
      out.push({ day_number: Number(p.day_number) || (out.length + 1), actual_crew_hours: ch });
    }
  }
  if (out.length > 0) return out;
  const hrs = scopeValues['scope.estimated_hours'] || scopeValues['scope.total_crew_hours'] || scope.estimated_hours || 0;
  return [{ day_number: 1, actual_crew_hours: hrs }];
}

function computeScopeHash(scopeValues) {
  const keys = [
    'scope.project_days', 'scope.estimated_hours',
    'scope.lead_technician_quantity', 'scope.apprentice_quantity', 'scope.mason_quantity',
    'scope.scaffold_required', 'scope.lift_required', 'scope.additional_vehicle_required',
    'scope.roof_pitch', 'scope.story_count', 'scope.access_condition',
    'scope.job_conditions', 'scope.staging_sequence',
    'scope.weekend_work_required', 'scope.membership_eligible',
  ];
  const str = keys.map(k => `${k}=${scopeValues[k] || ''}`).join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}

function calculateLoadedLaborCost(scopeValues, laborCostMap) {
  // Authoritative per-day model: use per-role man-hours derived from the daily
  // schedule. Apprentice labor cost = apprentice_man_hours × LoadedLaborCost
  // 'apprentice' rate (the fully-loaded rate). No payroll taxes or burden are
  // added on top — the loaded rate already includes them.
  if (scopeValues['scope.has_daily']) {
    const roles = [
      { key: 'scope.lead_man_hours', role: 'lead technician' },
      { key: 'scope.apprentice_man_hours', role: 'apprentice' },
      { key: 'scope.mason_man_hours', role: 'mason' },
    ];
    let total = 0;
    for (const r of roles) {
      const mh = scopeValues[r.key] || 0;
      const rate = laborCostMap[r.role] || 0;
      total += mh * rate;
    }
    return total;
  }
  // Legacy fallback (no daily schedule): qty × hours × rate
  const hours = scopeValues['scope.estimated_hours'] || 0;
  let total = 0;
  const roles = [
    { key: 'scope.lead_technician_quantity', role: 'lead technician' },
    { key: 'scope.apprentice_quantity', role: 'apprentice' },
    { key: 'scope.mason_quantity', role: 'mason' },
  ];
  for (const r of roles) {
    const qty = scopeValues[r.key] || 0;
    const rate = laborCostMap[r.role] || 0;
    total += qty * hours * rate;
  }
  if (total === 0 && hours > 0) {
    total = hours * (laborCostMap['lead technician'] || 0);
  }
  return total;
}

function calculateCommissionableSubtotal(baseServicePrice, baseMaterialPrice, ordered, plan) {
  let subtotal = 0;
  if (plan.include_service_revenue !== false) subtotal += baseServicePrice;
  if (plan.include_chargeable_materials !== false) subtotal += baseMaterialPrice;
  // Include positive customer-visible adjustments only — discounts are handled separately
  // to prevent double-counting (a discount is both customer-visible AND negative)
  if (plan.include_visible_price_modifiers !== false) {
    for (const m of ordered) {
      if (m.customer_visible && m.affects_customer_price && m.adjustment_amount > 0) subtotal += m.adjustment_amount;
    }
  }
  if (plan.include_discounts !== false) {
    for (const m of ordered) {
      if (m.adjustment_amount < 0) subtotal += m.adjustment_amount;
    }
  }
  return Math.max(0, subtotal);
}

function calculateEmployeeCompensation(scopeValues, laborCostMap, compPlanMap, commissionableSubtotal) {
  const hasDaily = !!scopeValues['scope.has_daily'];
  const hours = scopeValues['scope.estimated_hours'] || 0;
  const projectDays = scopeValues['scope.project_days'] || 1;
  const roles = [
    { qtyKey: 'scope.lead_technician_quantity', mhKey: 'scope.lead_man_hours', role: 'Lead Technician' },
    { qtyKey: 'scope.apprentice_quantity', mhKey: 'scope.apprentice_man_hours', role: 'Apprentice' },
    { qtyKey: 'scope.mason_quantity', mhKey: 'scope.mason_man_hours', role: 'Mason' },
  ];

  let hourlyLaborCost = 0;
  let commissionCompensationCost = 0;
  let salaryAllocationCost = 0;
  const employeeCompensation = [];

  for (const r of roles) {
    const qty = scopeValues[r.qtyKey] || 0;
    // Per-role man-hours drive hourly compensation (variable daily staffing).
    // Legacy (no daily schedule): man-hours = qty × estimated_hours (unchanged).
    const manHours = hasDaily ? (scopeValues[r.mhKey] || 0) : (qty * hours);

    if (qty === 0 && manHours === 0) continue;

    const plan = compPlanMap[r.role.toLowerCase()];

    // Apprentice labor cost = apprentice_man_hours × loaded apprentice rate;
    // no payroll taxes or burden are added again (the rate is fully loaded).
    if (!plan) {
      const rate = laborCostMap[r.role.toLowerCase()] || 0;
      const cost = manHours * rate;
      hourlyLaborCost += cost;
      employeeCompensation.push({
        role: r.role, quantity: qty, compensation_method: 'hourly',
        hourly_rate: rate, hours: manHours, calculated_compensation: cost,
        calculation_status: 'no_plan_default_hourly',
      });
      continue;
    }

    const method = plan.compensation_method;

    if (method === 'hourly' || method === 'hourly_plus_commission') {
      const rate = plan.hourly_rate || laborCostMap[r.role.toLowerCase()] || 0;
      const cost = manHours * rate;
      hourlyLaborCost += cost;
      employeeCompensation.push({
        role: r.role, quantity: qty, compensation_method: method,
        compensation_plan_id: plan.id, compensation_plan_name: plan.name,
        hourly_rate: rate, hours: manHours, calculated_compensation: cost,
        calculation_status: 'hourly_calculated',
      });
    }

    // Commission remains separate — based on commissionable subtotal × rate × qty
    // (number of leads), independent of daily man-hours.
    if (method === 'commission' || method === 'hourly_plus_commission') {
      const rate = plan.commission_rate_percentage || 0;
      const commission = commissionableSubtotal * (rate / 100) * qty;
      commissionCompensationCost += commission;
      employeeCompensation.push({
        role: r.role, quantity: qty, compensation_method: method,
        compensation_plan_id: plan.id, compensation_plan_name: plan.name,
        commission_basis: plan.commission_basis, commission_rate: rate,
        commissionable_amount: commissionableSubtotal,
        calculated_compensation: commission,
        calculation_status: 'commission_calculated',
      });
    }

    if (method === 'salary') {
      const dailyAllocation = (plan.salary_amount || 0) / 260;
      const cost = qty * dailyAllocation * projectDays;
      salaryAllocationCost += cost;
      employeeCompensation.push({
        role: r.role, quantity: qty, compensation_method: 'salary',
        compensation_plan_id: plan.id, compensation_plan_name: plan.name,
        salary_amount: plan.salary_amount, daily_allocation: dailyAllocation,
        project_days: projectDays, calculated_compensation: cost,
        calculation_status: 'salary_allocated',
      });
    }
  }

  if (hourlyLaborCost === 0 && commissionCompensationCost === 0 && salaryAllocationCost === 0 && (hours > 0 || (scopeValues['scope.total_crew_hours'] || 0) > 0)) {
    const rate = laborCostMap['lead technician'] || 0;
    const fallbackHours = hasDaily ? (scopeValues['scope.lead_man_hours'] || scopeValues['scope.total_crew_hours'] || 0) : hours;
    const cost = fallbackHours * rate;
    hourlyLaborCost = cost;
    employeeCompensation.push({
      role: 'Lead Technician', quantity: 1, compensation_method: 'hourly',
      hourly_rate: rate, hours: fallbackHours, calculated_compensation: cost,
      calculation_status: 'fallback_lead_tech',
    });
  }

  return { hourlyLaborCost, commissionCompensationCost, salaryAllocationCost, employeeCompensation };
}

// ── Pricing Solver ──
// Every option must satisfy BOTH:
//   gross_profit >= production_days × REQUIRED_GP_PER_PRODUCTION_DAY
//   gross_margin >= configured minimum margin
// Commission is price-dependent: the solver raises the selling price above the
// base+modifier total (uplift) and recomputes commission on the uplift until
// price, commission, direct cost, gross profit, and margin all agree.
const REQUIRED_GP_PER_PRODUCTION_DAY = 4000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function solvePricing({ baseAdjustedTotal, fixedDirectCost, baseCommission, commissionFactor, requiredGP, minMarginPct, minimumNetContributionPerDay = 0, minimumNetContributionPerCrewHour = 0, partialDayThresholdHours = 8, productionHours = 0, productionDays = 1, overheadPct = 0 }) {
  const minMargin = (minMarginPct || 0) / 100;
  const overheadRate = (overheadPct || 0) / 100;
  const isPartialDay = productionHours > 0 && productionHours < partialDayThresholdHours;
  const requiredNetContribution = isPartialDay
    ? Math.max(0, minimumNetContributionPerCrewHour || 0) * productionHours
    : Math.max(0, minimumNetContributionPerDay || 0) * Math.max(1, productionDays || 1);
  const uplift = (P) => Math.max(0, P - baseAdjustedTotal);
  // Marginal commission per $ of selling-price uplift (price-dependent cost).
  const commissionAt = (P) => baseCommission + commissionFactor * uplift(P);
  const costAt = (P) => fixedDirectCost + commissionAt(P);

  let P = Math.max(0, baseAdjustedTotal);
  for (let i = 0; i < 200; i++) {
    const cost = costAt(P);
    const gpFloor = cost + requiredGP;                                   // P - cost >= requiredGP
    const marginFloor = (minMargin > 0 && minMargin < 1) ? cost / (1 - minMargin) : 0; // (P-cost)/P >= minMargin
    const netContributionFloor = requiredNetContribution > 0 ? (cost + requiredNetContribution) / (1 - overheadRate) : 0; // P - cost - overhead >= required net contribution
    const nextP = Math.max(baseAdjustedTotal, gpFloor, marginFloor, netContributionFloor);
    if (Math.abs(nextP - P) < 0.005) { P = nextP; break; }
    P = nextP;
  }
  const cost = costAt(P);
  const baseFloor = round2(baseAdjustedTotal);
  const gpFloorPrice = round2(cost + requiredGP);
  const marginFloorPrice = (minMargin > 0 && minMargin < 1) ? round2(cost / (1 - minMargin)) : baseFloor;
  const netContributionFloorPrice = requiredNetContribution > 0 ? round2((cost + requiredNetContribution) / (1 - overheadRate)) : baseFloor;
  const commission = round2(commissionAt(P));
  const totalDirectJobCost = round2(cost);
  const grossProfit = round2(P - totalDirectJobCost);
  const grossMargin = P > 0 ? round2((grossProfit / P) * 100) : 0;
  const eps = 0.01;
  let controllingTarget = 'none';
  if (round2(P) <= baseFloor + eps && gpFloorPrice <= baseFloor + eps && marginFloorPrice <= baseFloor + eps) {
    controllingTarget = 'base_price';
  } else if (netContributionFloorPrice >= gpFloorPrice - eps && netContributionFloorPrice >= marginFloorPrice - eps) {
    controllingTarget = 'net_contribution_target';
  } else if (gpFloorPrice >= marginFloorPrice - eps) {
    controllingTarget = 'gross_profit_target';
  } else {
    controllingTarget = 'margin_target';
  }
  const solverApplied = round2(P) > baseFloor + eps;
  return {
    finalSellingPrice: round2(P),
    commission,
    totalDirectJobCost,
    grossProfit,
    grossMargin,
    requiredGP: round2(requiredGP),
    requiredGpPerDay: REQUIRED_GP_PER_PRODUCTION_DAY,
    configuredMinimumMargin: round2(minMarginPct || 0),
    marginTargetPrice: marginFloorPrice,
    grossProfitTargetPrice: gpFloorPrice,
    netContributionTargetPrice: netContributionFloorPrice,
    requiredNetContribution,
    controllingTarget,
    solverApplied,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const { job_id, scope_of_work_id, estimate_package_id, proposal_option_id } = body;
    const requestedTechnicianDiscount = Number(body.technician_discount_amount || 0);
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    // 1. Load Scope of Work — one independent scope per active proposal option.
    //    When estimate_package_id / proposal_option_id is supplied, load the scope
    //    bound to that option (immutable option relationship). Else fall back to
    //    the latest authoritative scope for the job.
    const jobScopes = await base44.asServiceRole.entities.ScopeOfWork.filter({ job_id }, '-updated_date', 200).catch(() => []);
    let scope = null;
    // A package-specific calculation must use that package's bound scope. This
    // prevents a stale dialog-open scope from being combined with a different
    // Good / Better / Best option after the technician switches cards.
    if (estimate_package_id) {
      scope = jobScopes.find(s => s.estimate_package_id === estimate_package_id && !s.superseded_by_id && s.status === 'approved')
        || jobScopes.find(s => s.estimate_package_id === estimate_package_id && !s.superseded_by_id)
        || jobScopes.find(s => s.estimate_package_id === estimate_package_id);
    }
    if (!scope && scope_of_work_id) {
      scope = jobScopes.find(s => s.id === scope_of_work_id)
        || await base44.asServiceRole.entities.ScopeOfWork.get(scope_of_work_id).catch(() => null);
    } else if (!scope && proposal_option_id) {
      scope = jobScopes.find(s => s.proposal_option_id === proposal_option_id && !s.superseded_by_id && s.status === 'approved')
        || jobScopes.find(s => s.proposal_option_id === proposal_option_id && !s.superseded_by_id)
        || jobScopes.find(s => s.proposal_option_id === proposal_option_id);
    }
    if (!scope) {
      scope = jobScopes.find(s => s.status === 'approved' && !s.superseded_by_id)
        || jobScopes.find(s => !s.superseded_by_id)
        || jobScopes[0]
        || null;
    }
    if (!scope) return Response.json({ error: 'No Scope of Work found for this job. Complete the Scope stage first.' }, { status: 400 });

    // 2. Extract scope values
    const scopeValues = extractScopeValues(scope);

    // 2b. Load Job to resolve assigned technicians from live job context
    const jobRecord = await base44.asServiceRole.entities.Job.get(job_id).catch(() => null);
    const assignedLeadTechEmail = jobRecord?.lead_technician_email || jobRecord?.technician_email || null;
    const assignedLeadTechName = jobRecord?.lead_technician_name || jobRecord?.technician_name || null;
    const assignedApprenticeEmail = jobRecord?.apprentice_email || null;

    // If scope has no crew quantities (legacy, no daily schedule), derive from job
    // assignments. With a daily schedule, the per-day counts are authoritative.
    if (!scopeValues['scope.has_daily']) {
      if (!scopeValues['scope.lead_technician_quantity'] && assignedLeadTechEmail) {
        scopeValues['scope.lead_technician_quantity'] = 1;
      }
      if (!scopeValues['scope.apprentice_quantity'] && assignedApprenticeEmail) {
        scopeValues['scope.apprentice_quantity'] = 1;
      }
    }

    console.log('[Compensation] ─── Technician Resolution ───');
    console.log('[Compensation] job_id:                    ', job_id);
    console.log('[Compensation] appointment_id:            ', scope.appointment_id || 'none');
    console.log('[Compensation] lead_technician_email:      ', assignedLeadTechEmail || 'none');
    console.log('[Compensation] lead_technician_name:      ', assignedLeadTechName || 'none');
    console.log('[Compensation] scope.lead_tech_quantity:  ', scopeValues['scope.lead_technician_quantity']);
    console.log('[Compensation] scope.apprentice_quantity: ', scopeValues['scope.apprentice_quantity']);
    console.log('[Compensation] scope.estimated_hours:     ', scopeValues['scope.estimated_hours']);
    console.log('[Compensation] ──────────────────────────────');

    // 3. Load estimate data — Pricing Source Priority:
    //    1. Selected package estimate items
    //    2. Approved DraftEstimateItems linked to selected package
    //    3. Existing customer Estimate items
    //    4. Service Catalog base prices as fallback
    let baseServicePrice = 0, baseMaterialPrice = 0, baseEquipmentPrice = 0;
    let estimateItems = [];
    let estimateId = null, proposalId = null;
    let selectedPackageId = estimate_package_id || null;
    let selectedPackageName = null;
    let matchedEstimateItemIds = [];
    let matchedEstimateItemPrices = [];
    let draftItemsLoaded = [];

    // ── Priority 1: Selected package ──
    let pkg = null;
    if (estimate_package_id) {
      pkg = await base44.asServiceRole.entities.EstimatePackage.get(estimate_package_id).catch(() => null);
    } else {
      const pkgs = await base44.asServiceRole.entities.EstimatePackage
        .filter({ job_id, is_authoritative: true }, '-updated_date', 1).catch(() => []);
      // Prefer the selected package; fall back to the first authoritative one
      pkg = pkgs.find(p => p.is_selected) || pkgs[0] || null;
    }
    if (!pkg) {
      return Response.json({
        error: 'No proposal package is selected for this job. Return to Proposal Builder, choose the Good, Better, or Best option to price, then continue to Dynamic Pricing.',
        code: 'PACKAGE_REQUIRED_FOR_PRICING',
      }, { status: 400 });
    }
    if (pkg) {
      selectedPackageId = pkg.id;
      selectedPackageName = pkg.name || pkg.option_type || 'Unknown';
      estimateId = pkg.estimate_id;
      // Package selling_price is the previous dynamic result, never a base input.
      // Recalculate from the option's linked DraftEstimateItems every time.

      // Load EstimatePackageItem records if they exist
      const storedPkgItems = await base44.asServiceRole.entities.EstimatePackageItem
        .filter({ estimate_package_id: pkg.id }, 'sort_order', 200).catch(() => []);
      let packageMembershipIds = [];
      try { packageMembershipIds = JSON.parse(pkg.estimate_item_ids || '[]'); } catch {}
      if (!Array.isArray(packageMembershipIds)) packageMembershipIds = [];

      // The package header is the immutable membership record. Fetch those exact
      // IDs rather than re-querying all job items and hoping a delayed index returns
      // them. This keeps Good / Better / Best isolated and eliminates the stale
      // "priced items could not load" failure during a recalculation.
      const linkedDraftItems = [];
      for (const itemId of packageMembershipIds) {
        const item = await base44.asServiceRole.entities.DraftEstimateItem.get(itemId).catch(() => null);
        // Membership is written by the Package Builder and is the authoritative
        // link. Do not discard a valid member because an old screen submitted a
        // stale job ID alongside the package ID.
        if (item?.id) linkedDraftItems.push(item);
      }
      draftItemsLoaded = linkedDraftItems;

      // The header membership is authoritative. Ignore an old line item that was
      // removed from a package instead of accidentally pricing it again.
      const pkgItems = packageMembershipIds.length > 0
        ? storedPkgItems.filter(item => packageMembershipIds.includes(item.estimate_item_id))
        : storedPkgItems;
      estimateItems = pkgItems;
      for (const item of pkgItems) {
        baseMaterialPrice += item.material_cost || 0;
      }

      // Material cost remains available even when legacy EstimatePackageItem rows
      // have not been written yet.
      if (pkgItems.length === 0) {
        for (const item of linkedDraftItems) {
          baseMaterialPrice += Number(item.chargeable_materials_total || 0);
        }
      }

      // ── Priority 2: Load the option's exact linked DraftEstimateItems as base input ──
      for (const item of linkedDraftItems) {
        const itemPrice = item.total_item_price || item.service_price || 0;
        baseServicePrice += itemPrice;
        matchedEstimateItemIds.push(item.id);
        matchedEstimateItemPrices.push(itemPrice);
      }
    }

    // ── Priority 2b: If still 0, try DraftEstimateItems matching the package tier ──
    if (baseServicePrice === 0) {
      const draftItems = await base44.asServiceRole.entities.DraftEstimateItem
        .filter({ job_id, status: { $ne: 'rejected' } }, '-created_date', 200).catch(() => []);
      draftItemsLoaded = draftItems;
      if (draftItems.length > 0) {
        let itemsToUse = draftItems;
        if (pkg?.option_type) {
          const tierItems = draftItems.filter(i => (i.proposal_tier || 'standalone') === pkg.option_type);
          if (tierItems.length > 0) itemsToUse = tierItems;
        }
        for (const item of itemsToUse) {
          const itemPrice = item.total_item_price || item.service_price || 0;
          baseServicePrice += itemPrice;
          matchedEstimateItemIds.push(item.id);
          matchedEstimateItemPrices.push(itemPrice);
        }
        if (estimateItems.length === 0) estimateItems = itemsToUse;
      }
    }

    // ── Priority 3: Existing customer Estimate line items ──
    if (baseServicePrice === 0 && !estimateId) {
      const estimates = await base44.asServiceRole.entities.Estimate
        .filter({ job_id }, '-created_date', 1).catch(() => []);
      if (estimates.length > 0) {
        estimateId = estimates[0].id;
        let lineItems = [];
        try { lineItems = JSON.parse(estimates[0].line_items || '[]'); } catch {}
        for (const li of lineItems) {
          baseServicePrice += li.price || li.amount || li.total || 0;
        }
      }
    }

    // ── Diagnostic: trace the package-to-pricing handoff ──
    console.log('[PricingHandoff] ─────────────────────────────');
    console.log('[PricingHandoff] job_id:                  ', job_id);
    console.log('[PricingHandoff] appointment_id:          ', scope.appointment_id || 'none');
    console.log('[PricingHandoff] selected_package_id:     ', selectedPackageId || 'none');
    console.log('[PricingHandoff] selected_package_name:   ', selectedPackageName || 'none');
    console.log('[PricingHandoff] selected_package_total:  ', pkg?.selling_price || pkg?.subtotal || 0);
    console.log('[PricingHandoff] matched_estimate_item_ids:', JSON.stringify(matchedEstimateItemIds));
    console.log('[PricingHandoff] matched_estimate_item_prices:', JSON.stringify(matchedEstimateItemPrices));
    console.log('[PricingHandoff] DraftEstimateItems loaded:', draftItemsLoaded.length);
    console.log('[PricingHandoff] Pricing base subtotal:   ', baseServicePrice);
    console.log('[PricingHandoff] ─────────────────────────────');

    // ── Validation: Block $0 snapshot when a priced package exists ──
    if (baseServicePrice === 0 && pkg && (pkg.selling_price > 0 || pkg.subtotal > 0)) {
      return Response.json({
        error: 'Selected package contains priced items, but Pricing could not load them.',
        diagnostics: {
          package_total: pkg.selling_price || pkg.subtotal || 0,
          item_count: matchedEstimateItemIds.length,
          item_ids: matchedEstimateItemIds,
          item_prices: matchedEstimateItemPrices,
        },
      }, { status: 400 });
    }

    // 3b. Option-specific eligibility injection (replaces unconditional 'always' triggers).
    //     Weekend Work is gated by the option-specific EstimatePackage.weekend_work_required
    //     flag — never inferred from the appointment date, and editing one option never
    //     changes another. Membership Discount is gated by the Job's immutable Customer
    //     relationship + an active Membership valid at the calculation timestamp — never
    //     matched by name, address, phone, or email. Both values feed the modifier trigger
    //     evaluation and the scope hash (so a change marks an open snapshot stale).
    scopeValues['scope.weekend_work_required'] = pkg?.weekend_work_required ? 'true' : '';
    let membershipIdUsed = null, membershipTypeUsed = null, membershipRenewalDate = null;
    let membershipEligibilityStatus = 'no_customer';
    if (jobRecord?.customer_id) {
      membershipEligibilityStatus = 'no_membership';
      const linkedCustomer = await base44.asServiceRole.entities.Customer.get(jobRecord.customer_id).catch(() => null);
      if (linkedCustomer && !linkedCustomer.servicetitan_deleted) {
        const memberships = await base44.asServiceRole.entities.Membership.filter({ customer_id: jobRecord.customer_id }, null, 50).catch(() => []);
        const today = new Date().toISOString().slice(0, 10);
        let eligible = null;
        for (const m of memberships) {
          if (m.status !== 'active') continue;
          const start = m.start_date ? String(m.start_date).slice(0, 10) : null;
          const renewal = m.renewal_date ? String(m.renewal_date).slice(0, 10) : null;
          if (start && start > today) continue;        // not yet started
          if (renewal && renewal < today) continue;    // expired
          eligible = m; break;
        }
        if (eligible) {
          membershipEligibilityStatus = 'eligible';
          membershipIdUsed = eligible.id;
          membershipTypeUsed = eligible.membership_type || null;
          membershipRenewalDate = eligible.renewal_date || null;
          scopeValues['scope.membership_eligible'] = 'true';
        } else {
          const anyActive = memberships.some(m => m.status === 'active');
          membershipEligibilityStatus = anyActive ? 'expired' : (memberships.length > 0 ? 'inactive' : 'no_membership');
          scopeValues['scope.membership_eligible'] = '';
        }
      } else {
        membershipEligibilityStatus = 'no_customer';
        scopeValues['scope.membership_eligible'] = '';
      }
    } else {
      scopeValues['scope.membership_eligible'] = '';
    }
    console.log('[ModifierEligibility] weekend_work_required:', scopeValues['scope.weekend_work_required'], '| membership:', membershipEligibilityStatus, membershipIdUsed || 'none');

    // 4. Load active modifiers (sorted by priority desc, then display_order)
    const modifiers = await base44.asServiceRole.entities.PricingModifier.filter({ status: 'active' }, '-priority', 500);
    const categories = await base44.asServiceRole.entities.PricingModifierCategory.filter({ status: 'active' }, 'display_order', 200);

    // 5. Load company settings
    let settings = {};
    const settingsRecs = await base44.asServiceRole.entities.CompanyPricingSettings.filter({}, null, 1);
    if (settingsRecs.length > 0) settings = settingsRecs[0];
    if (!Number.isFinite(requestedTechnicianDiscount) || requestedTechnicianDiscount < 0) {
      return Response.json({ error: 'Technician discount must be a non-negative dollar amount.' }, { status: 400 });
    }
    if (requestedTechnicianDiscount > 0 && settings.allow_technician_price_override !== true) {
      return Response.json({ error: 'Technician price adjustments are not enabled in Company Pricing Settings.' }, { status: 403 });
    }

    // 5b. Resolve the active Pricing Policy — the authoritative source for the
    //     gross-profit-per-day and minimum-margin floors. CompanyPricingSettings
    //     no longer controls these targets; they are versioned policy records.
    //     Failure behavior: if no active policy can be resolved, block the
    //     calculation (never silently use zero or an unprotected price). If
    //     multiple policies are incorrectly active, fail safely.
    const nowTs = new Date();
    const allActivePolicies = await base44.asServiceRole.entities.PricingPolicy.filter({ status: 'active' }, '-effective_date_time', 200).catch(() => []);
    const effectiveActivePolicies = allActivePolicies.filter(p => new Date(p.effective_date_time || p.created_at) <= nowTs);
    if (effectiveActivePolicies.length === 0) {
      return Response.json({ error: 'No active pricing policy is configured. Contact an administrator.' }, { status: 400 });
    }
    if (effectiveActivePolicies.length > 1) {
      return Response.json({ error: 'Multiple active pricing policies detected. Contact an administrator.' }, { status: 500 });
    }
    const activePolicy = effectiveActivePolicies[0];

    // 5c. Job-specific management override (admin only). Override targets apply
    //     to this single option/calculation only and never change the global
    //     Pricing Policy, never alter another proposal option, and never apply
    //     to future jobs. The active policy must still exist (override changes
    //     targets, not the policy itself).
    // Job-specific management override (admin only). The override changes the
    // GP target and/or minimum margin for THIS single option/calculation only.
    // The 8-hour daily cap is NEVER overridable. The model follows the active
    // policy (override changes the target value, not the model).
    let overrideApplied = false, overrideGpPerDay = null, overrideMinMargin = null, overrideHourlyGp = null;
    let overrideReason = null, overrideBy = null, overrideAt = null;
    if (body.override_reason && (user.role === 'admin' || user.role === 'owner')) {
      const om = Number(body.management_override_minimum_margin ?? body.override_minimum_margin);
      if (!(om > 0 && om < 100)) {
        return Response.json({ error: 'Invalid management override: minimum margin must be between 0 and 100.' }, { status: 400 });
      }
      overrideMinMargin = om;
      overrideReason = String(body.override_reason).trim(); overrideBy = user.email; overrideAt = new Date().toISOString();
      const overrideModel = activePolicy.pricing_target_model || 'daily';
      if (overrideModel === 'hourly_capped') {
        const ohg = Number(body.management_override_gross_profit_per_crew_hour ?? body.override_gross_profit_per_crew_hour);
        if (!(ohg > 0)) {
          return Response.json({ error: 'Invalid management override: gross profit target per crew hour must be > 0.' }, { status: 400 });
        }
        overrideHourlyGp = ohg;
      } else {
        const ogp = Number(body.management_override_gross_profit_per_day ?? body.override_gross_profit_per_day);
        if (!(ogp > 0)) {
          return Response.json({ error: 'Invalid management override: gross profit per day must be > 0.' }, { status: 400 });
        }
        overrideGpPerDay = ogp;
      }
      overrideApplied = true;
    }

    // 6. Load labor costs
    const laborCosts = await base44.asServiceRole.entities.LoadedLaborCost.filter({ status: 'active' }, null, 50);
    const laborCostMap = {};
    for (const lc of laborCosts) laborCostMap[lc.role.toLowerCase()] = lc.loaded_hourly_cost || 0;

    // 6b. Load active compensation plans by role
    const compPlans = await base44.asServiceRole.entities.EmployeeCompensationPlan.filter({ status: 'active' }, null, 200);
    const compPlanMap = {};
    for (const cp of compPlans) {
      const roleKey = (cp.role || '').toLowerCase();
      if (!compPlanMap[roleKey]) compPlanMap[roleKey] = cp;
    }

    // 6c. Resolve employee-specific compensation plan for lead technician
    // Priority: employee-specific plan (by employee_id) > role-based plan
    let leadEmployee = null;
    let leadCompPlan = compPlanMap['lead technician'] || null;
    let compResolutionMethod = leadCompPlan ? 'role_based' : 'none';

    if (assignedLeadTechEmail) {
      const employees = await base44.asServiceRole.entities.EmployeeRegistry
        .filter({ email: assignedLeadTechEmail }).catch(() => []);
      leadEmployee = employees[0] || null;

      if (leadEmployee?.id) {
        const empPlans = await base44.asServiceRole.entities.EmployeeCompensationPlan
          .filter({ employee_id: leadEmployee.id, status: 'active' }).catch(() => []);
        if (empPlans.length > 0) {
          leadCompPlan = empPlans[0];
          compResolutionMethod = 'employee_specific';
          compPlanMap['lead technician'] = leadCompPlan;
        }
      }
    }

    console.log('[Compensation] ─── Plan Resolution ───');
    console.log('[Compensation] lead_employee_id:         ', leadEmployee?.id || 'not found');
    console.log('[Compensation] lead_employee_name:       ', leadEmployee?.full_name || assignedLeadTechName || 'none');
    console.log('[Compensation] comp_resolution_method:  ', compResolutionMethod);
    console.log('[Compensation] compensation_plan_id:     ', leadCompPlan?.id || 'none');
    console.log('[Compensation] compensation_plan_name:   ', leadCompPlan?.name || 'none');
    console.log('[Compensation] compensation_method:      ', leadCompPlan?.compensation_method || 'none');
    console.log('[Compensation] commission_rate:           ', leadCompPlan?.commission_rate_percentage || 0);
    console.log('[Compensation] commission_basis:          ', leadCompPlan?.commission_basis || 'none');
    console.log('[Compensation] ──────────────────────────────');

    // 7. Build base amounts map
    const baseTotal = baseServicePrice + baseMaterialPrice + baseEquipmentPrice;
    const baseAmounts = {
      labor_price: baseServicePrice,
      material_price: baseMaterialPrice,
      equipment_price: baseEquipmentPrice,
      total_selling_price: baseTotal,
      estimated_hours: scopeValues['scope.estimated_hours'] || 0,
      project_days: scopeValues['scope.project_days'] || 1,
      labor_cost: 0, equipment_cost: 0, total_job_cost: 0,
    };

    // 8. Evaluate modifiers
    const categoryMap = {};
    for (const c of categories) categoryMap[c.id] = c;

    const allEvaluated = [];
    const matchedByCategory = {};

    for (const mod of modifiers) {
      // Check effective dates
      const now = new Date();
      if (mod.effective_start_date && new Date(mod.effective_start_date) > now) continue;
      if (mod.effective_end_date && new Date(mod.effective_end_date) < now) continue;

      const isMatch = evaluateTrigger(mod, scopeValues);
      const calc = isMatch ? calculateAdjustment(mod, baseAmounts) : null;

      const record = {
        modifier_id: mod.id,
        name: mod.name,
        category_id: mod.category_id,
        category_name: mod.category_name,
        trigger_field: mod.source_field,
        trigger_value: mod.trigger_value,
        matched: isMatch,
        calculation_method: mod.calculation_method,
        applies_to: mod.applies_to,
        calculation_base: calc ? calc.baseAmount : 0,
        calculation_formula: calc ? calc.formula : '',
        adjustment_amount: calc ? calc.adjustment : 0,
        resulting_subtotal: calc ? calc.newPrice : 0,
        affects_customer_price: mod.affects_customer_price,
        affects_internal_cost: mod.affects_internal_cost,
        affects_estimated_hours: mod.affects_estimated_hours,
        customer_visible: mod.customer_visible,
        customer_display_name: mod.customer_display_name,
        stacking_method: mod.stacking_method,
        stacking_group: mod.stacking_group,
        priority: mod.priority || 0,
      };
      allEvaluated.push(record);
      if (isMatch) {
        if (!matchedByCategory[mod.category_id]) matchedByCategory[mod.category_id] = [];
        matchedByCategory[mod.category_id].push(record);
      }
    }

    // 9. Apply stacking rules — mutually exclusive categories keep only highest priority
    const appliedModifiers = [];
    for (const [catId, mods] of Object.entries(matchedByCategory)) {
      const cat = categoryMap[catId];
      if (cat && cat.mutually_exclusive) {
        // Keep only the highest-priority modifier
        mods.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        appliedModifiers.push(mods[0]);
      } else {
        appliedModifiers.push(...mods);
      }
    }

    // 10. Sort into calculation order
    const order = [
      (m) => m.affects_estimated_hours,
      (m) => m.affects_internal_cost && m.calculation_method === 'hourly',
      (m) => m.applies_to === 'equipment_price',
      (m) => m.calculation_method === 'fixed_amount' && m.adjustment_amount > 0,
      (m) => m.applies_to === 'labor_price' && m.calculation_method === 'percentage',
      (m) => m.applies_to === 'material_price' && m.calculation_method === 'percentage',
      (m) => m.applies_to === 'total_selling_price' && m.calculation_method === 'percentage',
      (m) => m.adjustment_amount < 0,
      (m) => m.calculation_method === 'minimum_charge' || m.calculation_method === 'maximum_charge',
    ];
    const ordered = [];
    const used = new Set();
    for (const filter of order) {
      for (const m of appliedModifiers) {
        if (!used.has(m.modifier_id) && filter(m)) {
          ordered.push(m);
          used.add(m.modifier_id);
        }
      }
    }
    // Add any remaining (not caught by filters)
    for (const m of appliedModifiers) {
      if (!used.has(m.modifier_id)) { ordered.push(m); used.add(m.modifier_id); }
    }

    // Technician price adjustment is an option-specific discount. The solver below
    // still raises the price to the stricter of the gross-profit, margin, and net-
    // contribution floors; this value can never reduce an option below a policy floor.
    if (requestedTechnicianDiscount > 0) {
      // The pricing solver below enforces the margin and net-contribution floors.
      // There is intentionally no separate percentage cap for technician discounts.
      ordered.push({
        modifier_id: 'technician_price_adjustment',
        name: 'Technician Price Adjustment',
        customer_display_name: 'Courtesy adjustment',
        customer_visible: true,
        affects_customer_price: true,
        applies_to: 'total_selling_price',
        calculation_method: 'fixed_amount',
        calculation_formula: `− $${requestedTechnicianDiscount.toFixed(2)} technician adjustment`,
        adjustment_amount: -requestedTechnicianDiscount,
      });
    }

    // 11. Calculate totals
    let laborAdjustment = 0, materialAdjustment = 0, equipmentAdjustment = 0;
    let fixedAdjustment = 0, discountAdjustment = 0, totalAdjustment = 0;
    for (const m of ordered) {
      totalAdjustment += m.adjustment_amount;
      if (m.applies_to === 'labor_price') laborAdjustment += m.adjustment_amount;
      if (m.applies_to === 'material_price') materialAdjustment += m.adjustment_amount;
      if (m.applies_to === 'equipment_price') equipmentAdjustment += m.adjustment_amount;
      if (m.calculation_method === 'fixed_amount') fixedAdjustment += m.adjustment_amount;
      if (m.adjustment_amount < 0) discountAdjustment += m.adjustment_amount;
    }

    // 12. Calculate commissionable subtotal (for commission-based employees)
    const leadPlan = compPlanMap['lead technician'];
    const commissionableSubtotal = leadPlan
      ? calculateCommissionableSubtotal(baseServicePrice, baseMaterialPrice, ordered, leadPlan)
      : (baseTotal + totalAdjustment);

    // 12b. Calculate employee compensation
    const compResult = calculateEmployeeCompensation(scopeValues, laborCostMap, compPlanMap, commissionableSubtotal);
    let hourlyLaborCost = compResult.hourlyLaborCost;
    let commissionCompensationCost = compResult.commissionCompensationCost;
    let salaryAllocationCost = compResult.salaryAllocationCost;
    const employeeCompensation = compResult.employeeCompensation;
    let totalEmployeeCompensationCost = hourlyLaborCost + commissionCompensationCost + salaryAllocationCost;

    // 12c. Calculate internal costs
    const materialCost = baseMaterialPrice;
    let loadedLaborCost = totalEmployeeCompensationCost;
    const equipmentCost = baseEquipmentPrice + equipmentAdjustment;
    const vehicleCost = 0;
    const subcontractorCost = 0;
    let totalDirectJobCost = materialCost + totalEmployeeCompensationCost + equipmentCost + vehicleCost + subcontractorCost;

    // 13. Calculate final prices (base + modifiers, before solver)
    const finalServicePrice = baseServicePrice + laborAdjustment;
    const finalMaterialPrice = baseMaterialPrice + materialAdjustment;
    const finalEquipmentPrice = baseEquipmentPrice + equipmentAdjustment;
    let finalSellingPrice = baseTotal + totalAdjustment;

    // 14b. Pricing Solver — enforce BOTH:
    //   gross_profit >= production_days × $4,000  (required gross profit)
    //   gross_margin >= CompanyPricingSettings.minimum_gross_margin_percentage
    // Commission is price-dependent: any selling-price uplift above the base
    // total is additional commissionable revenue, so the solver recomputes
    // commission on the uplift and iterates until price, commission, direct
    // cost, gross profit, and margin all agree. Discounts/modifiers are already
    // included in the base total before the solver runs.
    const baseAdjustedTotal = finalSellingPrice;
    const solverProductionDays = scopeValues['scope.production_days'] || scopeValues['scope.project_days'] || scope.estimated_days || 1;
    // ── Pricing target model ──
    // daily (legacy): required_gross_profit = production_days × gp_per_day
    // hourly_capped:  daily_target_hours = min(actual_daily_crew_hours, 8) per day;
    //                total_target_hours = sum; required_gross_profit = total_target_hours × gp_per_crew_hour
    // The 8-hour cap resets per production day. Actual crew hours (uncapped)
    // still drive apprentice/lead labor cost — labor is NEVER capped at 8.
    const pricingTargetModel = activePolicy.pricing_target_model || 'daily';
    const maxTargetHoursPerDay = 8; // fixed company policy — never editable, never overridable
    const dailyHours = extractDailyHours(scope, scopeValues);
    const dailyTargetHours = dailyHours.map(d => ({ day_number: d.day_number, actual_crew_hours: d.actual_crew_hours, target_hours: Math.min(d.actual_crew_hours, maxTargetHoursPerDay) }));
    const totalActualCrewHours = dailyHours.reduce((s, d) => s + d.actual_crew_hours, 0);
    const totalTargetHours = dailyTargetHours.reduce((s, d) => s + d.target_hours, 0);
    let requiredGpPerDay = 0, requiredGrossProfit = 0, hourlyGpTargetPerHour = 0;
    if (pricingTargetModel === 'hourly_capped') {
      hourlyGpTargetPerHour = overrideApplied ? overrideHourlyGp : (activePolicy.gross_profit_target_per_crew_hour || 0);
      requiredGrossProfit = totalTargetHours * hourlyGpTargetPerHour;
      requiredGpPerDay = 0; // n/a for hourly model
    } else {
      requiredGpPerDay = overrideApplied ? overrideGpPerDay : activePolicy.gross_profit_per_production_day;
      requiredGrossProfit = solverProductionDays * requiredGpPerDay;
    }
    const minMarginPct = overrideApplied ? overrideMinMargin : activePolicy.minimum_gross_margin_percentage;
    const minimumNetContributionPerDay = activePolicy.minimum_net_contribution_per_production_day || 0;
    const minimumNetContributionPerCrewHour = activePolicy.minimum_net_contribution_per_crew_hour || 450;
    const partialDayThresholdHours = activePolicy.partial_day_net_contribution_threshold_hours || 8;
    const overheadPct = settings.overhead_percentage || 0;
    const fixedDirectCost = materialCost + hourlyLaborCost + salaryAllocationCost + equipmentCost + vehicleCost + subcontractorCost;
    let commissionFactor = 0;
    const leadPlanForSolver = compPlanMap['lead technician'];
    const leadQtyForSolver = scopeValues['scope.lead_technician_quantity'] || 0;
    if (leadPlanForSolver && ['commission', 'hourly_plus_commission'].includes(leadPlanForSolver.compensation_method) && leadQtyForSolver > 0) {
      commissionFactor = ((leadPlanForSolver.commission_rate_percentage || 0) / 100) * leadQtyForSolver;
    }
    const solver = solvePricing({
      baseAdjustedTotal,
      fixedDirectCost,
      baseCommission: commissionCompensationCost,
      commissionFactor,
      requiredGP: requiredGrossProfit,
      minMarginPct,
      minimumNetContributionPerDay,
      minimumNetContributionPerCrewHour,
      partialDayThresholdHours,
      productionHours: totalActualCrewHours,
      productionDays: solverProductionDays,
      overheadPct,
    });
    // Apply solver result
    finalSellingPrice = solver.finalSellingPrice;
    commissionCompensationCost = solver.commission;
    totalEmployeeCompensationCost = round2(hourlyLaborCost + salaryAllocationCost + commissionCompensationCost);
    totalDirectJobCost = solver.totalDirectJobCost;
    loadedLaborCost = totalEmployeeCompensationCost;
    const grossProfit = solver.grossProfit;
    const grossMarginPct = solver.grossMargin;
    const solverApplied = solver.solverApplied;
    if (solverApplied) {
      for (const e of employeeCompensation) {
        if (e.calculation_status === 'commission_calculated') {
          e.calculated_compensation = commissionCompensationCost;
          e.solver_uplift_applied = true;
        }
      }
    }

    // Compensation warning: assigned technician but $0 compensation
    let compensationWarning = null;
    if (assignedLeadTechEmail && totalEmployeeCompensationCost === 0) {
      if (!leadCompPlan) {
        compensationWarning = 'Employee compensation could not be calculated because no active compensation plan was resolved for the assigned Lead Technician.';
      } else if (leadCompPlan.compensation_method === 'commission' && commissionableSubtotal === 0) {
        compensationWarning = 'Commission plan resolved but commissionable subtotal is $0 — no eligible revenue for commission calculation.';
      } else {
        compensationWarning = 'Assigned employee compensation has not been included. Pricing cannot be approved.';
      }
    }

    console.log('[Compensation] ─── Calculation Results ───');
    console.log('[Compensation] commissionable_subtotal:   ', commissionableSubtotal);
    console.log('[Compensation] estimated_commission_total:', commissionCompensationCost);
    console.log('[Compensation] hourly_labor_cost:          ', hourlyLaborCost);
    console.log('[Compensation] commission_compensation:    ', commissionCompensationCost);
    console.log('[Compensation] salary_allocation:         ', salaryAllocationCost);
    console.log('[Compensation] total_emp_compensation:    ', totalEmployeeCompensationCost);
    console.log('[Compensation] material_cost:              ', materialCost);
    console.log('[Compensation] total_direct_job_cost:      ', totalDirectJobCost);
    console.log('[Compensation] gross_profit:               ', grossProfit);
    console.log('[Compensation] gross_margin_pct:           ', Math.round(grossMarginPct * 100) / 100);
    console.log('[Compensation] final_selling_price:        ', finalSellingPrice);
    console.log('[Compensation] compensation_warning:       ', compensationWarning || 'none');
    console.log('[Compensation] ──────────────────────────────');

    const estimatedOverhead = finalSellingPrice * (overheadPct / 100);
    const estimatedNetContribution = grossProfit - estimatedOverhead;
    const estimatedNetMarginPct = finalSellingPrice > 0 ? (estimatedNetContribution / finalSellingPrice) * 100 : 0;
    const productionDays = scopeValues['scope.project_days'] || scope.estimated_days || 1;
    const totalLaborHours = scopeValues['scope.estimated_hours'] || scope.estimated_hours || 0;
    const revenuePerDay = productionDays > 0 ? finalSellingPrice / productionDays : 0;
    const grossProfitPerDay = productionDays > 0 ? grossProfit / productionDays : 0;
    const revenuePerLaborHour = totalLaborHours > 0 ? finalSellingPrice / totalLaborHours : 0;

    // 15. Supersede prior snapshots
    // Supersede only the prior snapshot for this option. Good, Better, and Best
    // are alternatives and must retain their own current price snapshots.
    const priorSnapshotQuery = estimate_package_id
      ? { job_id, estimate_package_id, calculation_status: { $in: ['approved', 'calculated', 'overridden'] } }
      : { job_id, scope_of_work_id: scope.id, calculation_status: { $in: ['approved', 'calculated', 'overridden'] } };
    const priorSnapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot.filter(priorSnapshotQuery, '-calculated_at', 50);
    let supersedesId = null;
    if (priorSnapshots.length > 0) {
      supersedesId = priorSnapshots[0].id;
      for (const ps of priorSnapshots) {
        await base44.asServiceRole.entities.PricingCalculationSnapshot.update(ps.id, { calculation_status: 'superseded' });
      }
    }

    // Count existing snapshots for version
    const allSnapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot.filter({ job_id }, null, 500);
    const pricingVersion = allSnapshots.length + 1;

    // 16. Create snapshot
    const snapshot = await base44.asServiceRole.entities.PricingCalculationSnapshot.create({
      job_id,
      appointment_id: scope.appointment_id,
      estimate_id: estimateId,
      proposal_id: proposalId,
      scope_of_work_id: scope.id,
      estimate_package_id: estimate_package_id || (priorSnapshots[0]?.estimate_package_id),
      proposal_option_id: proposal_option_id || scope.proposal_option_id || null,
      pricing_version: pricingVersion,
      calculation_status: 'calculated',
      scope_inputs_json: JSON.stringify(scopeValues),
      scope_hash: computeScopeHash(scopeValues),
      estimate_items_json: JSON.stringify(estimateItems.map(i => ({ id: i.id, name: i.service_name, price: i.selling_price, qty: i.quantity }))),
      base_service_price: baseServicePrice,
      base_material_price: baseMaterialPrice,
      base_equipment_price: baseEquipmentPrice,
      base_total_price: baseTotal,
      matched_modifiers_json: JSON.stringify(ordered),
      modifier_calculation_order_json: JSON.stringify(ordered.map((m, i) => ({ step: i + 1, modifier_id: m.modifier_id, name: m.name, adjustment: m.adjustment_amount }))),
      labor_adjustment: laborAdjustment,
      material_adjustment: materialAdjustment,
      equipment_adjustment: equipmentAdjustment,
      fixed_adjustment: fixedAdjustment,
      discount_adjustment: discountAdjustment,
      total_adjustment: totalAdjustment,
      final_service_price: finalServicePrice,
      final_material_price: finalMaterialPrice,
      final_equipment_price: finalEquipmentPrice,
      final_selling_price: finalSellingPrice,
      material_cost: materialCost,
      loaded_labor_cost: loadedLaborCost,
      equipment_cost: equipmentCost,
      vehicle_cost: vehicleCost,
      subcontractor_cost: subcontractorCost,
      commissionable_subtotal: commissionableSubtotal,
      estimated_commission_total: commissionCompensationCost,
      employee_compensation_json: JSON.stringify(employeeCompensation),
      hourly_labor_cost: hourlyLaborCost,
      commission_compensation_cost: commissionCompensationCost,
      salary_allocation_cost: salaryAllocationCost,
      total_employee_compensation_cost: totalEmployeeCompensationCost,
      commission_estimate: commissionCompensationCost,
      total_direct_job_cost: totalDirectJobCost,
      gross_profit: grossProfit,
      gross_margin_percentage: grossMarginPct,
      required_gross_profit_per_day: requiredGpPerDay,
      required_gross_profit: requiredGrossProfit,
      pricing_target_model: pricingTargetModel,
      gross_profit_target_per_crew_hour: pricingTargetModel === 'hourly_capped' ? hourlyGpTargetPerHour : null,
      maximum_target_hours_per_day: maxTargetHoursPerDay,
      daily_target_hours_json: JSON.stringify(dailyTargetHours),
      total_target_hours: totalTargetHours,
      total_actual_crew_hours: totalActualCrewHours,
      hourly_gp_target_price: pricingTargetModel === 'hourly_capped' ? solver.grossProfitTargetPrice : null,
      pricing_policy_id: activePolicy.id,
      pricing_policy_version: activePolicy.version_number || 1,
      gross_profit_per_day_target: requiredGpPerDay,
      minimum_margin_target: minMarginPct,
      management_override_applied: overrideApplied,
      management_override_gross_profit_per_day: overrideGpPerDay,
      management_override_gross_profit_per_crew_hour: overrideHourlyGp,
      management_override_minimum_margin: overrideMinMargin,
      management_override_reason: overrideReason,
      management_override_by: overrideBy,
      management_override_at: overrideAt,
      configured_minimum_margin: solver.configuredMinimumMargin,
      margin_target_price: solver.marginTargetPrice,
      gross_profit_target_price: solver.grossProfitTargetPrice,
      controlling_target: solver.controllingTarget,
      solver_applied: solverApplied,
      minimum_net_contribution_per_day_target: minimumNetContributionPerDay,
      net_contribution_target_price: solver.netContributionTargetPrice,
      technician_discount_amount: requestedTechnicianDiscount,
      estimated_overhead_allocation: estimatedOverhead,
      estimated_net_contribution: estimatedNetContribution,
      estimated_net_margin_percentage: Math.round(estimatedNetMarginPct * 100) / 100,
      production_days: productionDays,
      total_labor_hours: totalLaborHours,
      revenue_per_production_day: revenuePerDay,
      gross_profit_per_production_day: grossProfitPerDay,
      revenue_per_labor_hour: revenuePerLaborHour,
      calculated_by: user.email,
      calculated_at: new Date().toISOString(),
      supersedes_snapshot_id: supersedesId,
    });

    // Keep the package header synchronized with its own dynamic pricing result.
    // Customer presentation validates this price, not pre-solver line-item sums.
    if (pkg?.id) {
      await base44.asServiceRole.entities.EstimatePackage.update(pkg.id, {
        subtotal: round2(baseTotal),
        selling_price: round2(finalSellingPrice),
        gross_profit: round2(grossProfit),
        gross_margin: round2(grossMarginPct),
        gross_profit_per_day: round2(grossProfitPerDay),
        estimated_hours: totalLaborHours,
        estimated_days: productionDays,
        pricing_status: 'calculated',
        stale_reason: null,
        stale_item_id: null,
        stale_at: null,
        proposal_stale: false,
        proposal_stale_reason: null,
        profitability_target_met: solverApplied,
      });
    }

    return Response.json({
      status: 'success',
      snapshot,
      solver: {
        pricing_target_model: pricingTargetModel,
        gross_profit_target_per_crew_hour: pricingTargetModel === 'hourly_capped' ? hourlyGpTargetPerHour : null,
        maximum_target_hours_per_day: maxTargetHoursPerDay,
        total_target_hours: totalTargetHours,
        total_actual_crew_hours: totalActualCrewHours,
        daily_target_hours: dailyTargetHours,
        required_gross_profit_per_day: requiredGpPerDay,
        required_gross_profit: requiredGrossProfit,
        hourly_gp_target_price: pricingTargetModel === 'hourly_capped' ? solver.grossProfitTargetPrice : null,
        configured_minimum_margin: solver.configuredMinimumMargin,
        margin_target_price: solver.marginTargetPrice,
        gross_profit_target_price: solver.grossProfitTargetPrice,
        controlling_target: solver.controllingTarget,
        solver_applied: solverApplied,
        base_selling_price: round2(baseAdjustedTotal),
        final_selling_price: finalSellingPrice,
      },
      all_evaluated: allEvaluated,
      applied_modifiers: ordered,
      scope_values: scopeValues,
      compensation_diagnostics: {
        assigned_lead_tech_email: assignedLeadTechEmail,
        assigned_lead_tech_name: assignedLeadTechName,
        lead_employee_id: leadEmployee?.id || null,
        lead_employee_name: leadEmployee?.full_name || assignedLeadTechName || null,
        comp_resolution_method: compResolutionMethod,
        compensation_plan_id: leadCompPlan?.id || null,
        compensation_plan_name: leadCompPlan?.name || null,
        compensation_method: leadCompPlan?.compensation_method || null,
        commission_rate: leadCompPlan?.commission_rate_percentage || 0,
        commission_basis: leadCompPlan?.commission_basis || null,
        commissionable_subtotal: commissionableSubtotal,
        estimated_commission_total: commissionCompensationCost,
        hourly_labor_cost: hourlyLaborCost,
        commission_compensation_cost: commissionCompensationCost,
        salary_allocation_cost: salaryAllocationCost,
        total_employee_compensation_cost: totalEmployeeCompensationCost,
        total_direct_job_cost: totalDirectJobCost,
        gross_profit: grossProfit,
        gross_margin_percentage: Math.round(grossMarginPct * 100) / 100,
        compensation_warning: compensationWarning,
      },
      modifier_eligibility: {
        weekend_work_required: !!scopeValues['scope.weekend_work_required'],
        membership: {
          customer_id: jobRecord?.customer_id || null,
          membership_id: membershipIdUsed,
          membership_type: membershipTypeUsed,
          renewal_date: membershipRenewalDate,
          eligibility_status: membershipEligibilityStatus,
        },
      },
      settings,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});