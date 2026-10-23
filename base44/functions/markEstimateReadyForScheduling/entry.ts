import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ═══════════════════════════════════════════════════════════════════════
//  markEstimateReadyForScheduling — the SERVER-AUTHORITATIVE gate for
//  transitioning an Estimate to "ready_for_scheduling".
//
//  This function:
//    1. Runs the same readiness validation as validateSchedulingReadiness
//       (selected option, acceptance, signature, scope, pricing, scaffold,
//        fleet, weather, restrictions).
//    2. If NOT ready, returns the exact blockers — NO status change occurs.
//    3. If ready, creates FleetResourceRequest records idempotently and
//       updates the Estimate status to "ready_for_scheduling".
//
//  The frontend "Ready for Scheduling" button MUST call this function.
//  Direct Estimate.update({ status: 'ready_for_scheduling' }) bypasses
//  validation and must not be used for this transition.
// ═══════════════════════════════════════════════════════════════════════

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const { job_id, estimate_id } = body;
    if (!job_id && !estimate_id) {
      return Response.json({ error: 'job_id or estimate_id is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const blocking = [];
    const warnings = [];

    // ── Resolve the Estimate ──
    let estimate = null;
    if (estimate_id) {
      estimate = await base44.asServiceRole.entities.Estimate.get(estimate_id).catch(() => null);
    }
    if (!estimate && job_id) {
      const ests = await base44.asServiceRole.entities.Estimate
        .filter({ job_id }, '-created_date', 10).catch(() => []);
      estimate = ests?.[0] || null;
    }
    if (!estimate) {
      blocking.push({ key: 'no_estimate', message: 'No estimate found for this job.' });
      return Response.json({ status: 'success', ready: false, blocking_requirements: blocking, warnings, validated_at: now });
    }
    const jid = job_id || estimate.job_id;

    // ── 1. Selected option resolution ──
    const presentations = await base44.asServiceRole.entities.CustomerPresentation
      .filter({ job_id: jid }, '-created_date', 10).catch(() => []);
    const pres = presentations[0] || null;
    const workflows = await base44.asServiceRole.entities.AppointmentWorkflow
      .filter({ job_id: jid }, '-created_date', 5).catch(() => []);
    const wf = workflows[0] || null;

    let selectedOptionId = pres?.selected_estimate_package_id || wf?.selected_option_id || null;
    const packages = await base44.asServiceRole.entities.EstimatePackage
      .filter({ job_id: jid }, '-created_date', 100).catch(() => []);
    const customerFacing = packages.filter(p =>
      p.is_customer_facing !== false && p.status !== 'archived' && !p.superseded_by_id
    );

    let selected = null;
    if (selectedOptionId) {
      selected = customerFacing.find(p => p.id === selectedOptionId) || packages.find(p => p.id === selectedOptionId) || null;
    }
    if (!selected) {
      const isSelected = customerFacing.find(p => p.is_selected === true);
      if (isSelected) { selected = isSelected; selectedOptionId = isSelected.id; }
    }

    if (!selectedOptionId || !selected) {
      blocking.push({ key: 'no_selected_option', message: 'No customer-selected option. The customer must select and accept one proposal option before scheduling.' });
      return Response.json({ status: 'success', ready: false, blocking_requirements: blocking, warnings, validated_at: now });
    }

    // ── 2. Customer acceptance + signature ──
    const acceptedDecisions = ['perform_work_today', 'schedule_for_later'];
    const isAcceptedViaPres = pres && acceptedDecisions.includes(pres.customer_decision)
      && pres.selected_estimate_package_id === selectedOptionId;
    if (!isAcceptedViaPres && selected.is_selected !== true) {
      blocking.push({ key: 'option_not_accepted', message: `${selected.name || selected.option_type || 'Selected option'} has not been accepted by the customer.` });
    }
    if (!pres?.customer_decision_at && !selected.selected_at) {
      blocking.push({ key: 'acceptance_date_missing', message: 'Customer acceptance date is missing.' });
    }
    if (!pres?.customer_signature_url) {
      blocking.push({ key: 'customer_signature_missing', message: 'Customer signature is missing. Capture the acceptance signature during presentation.' });
    }

    // ── 3. Authoritative Scope of Work ──
    const scopes = await base44.asServiceRole.entities.ScopeOfWork
      .filter({ job_id: jid }, '-created_date', 100).catch(() => []);
    const optionScope = scopes.find(s => s.estimate_package_id === selectedOptionId && !s.superseded_by_id && s.status === 'approved')
      || scopes.find(s => s.estimate_package_id === selectedOptionId && !s.superseded_by_id)
      || null;
    if (!optionScope) {
      blocking.push({ key: 'no_scope_for_option', message: 'No active Scope of Work is linked to the selected option.' });
    } else {
      const dailySchedule = safeParse(optionScope.daily_schedule, []);
      if (!Array.isArray(dailySchedule) || dailySchedule.length === 0) {
        blocking.push({ key: 'daily_schedule_missing', message: 'No daily schedule on the selected option scope.' });
      } else {
        for (const d of dailySchedule) {
          const ch = Number(d.crew_hours);
          if (isNaN(ch) || ch <= 0) {
            blocking.push({ key: `day_${d.day_number}_hours_missing`, message: `Day ${d.day_number} work hours are missing.` });
          }
        }
      }
      const crewReqs = safeParse(optionScope.crew_requirements, []);
      const hasCrew = (Array.isArray(crewReqs) && crewReqs.some(c => (c.count || 0) > 0))
        || (optionScope.total_crew_required || 0) > 0
        || (Array.isArray(dailySchedule) && dailySchedule.some(d => (Number(d.apprentice_count) > 0)));
      if (!hasCrew) {
        blocking.push({ key: 'crew_counts_missing', message: 'Required crew counts are missing on the selected option scope.' });
      }
    }

    // ── 4. Pricing snapshot ──
    const snapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot
      .filter({ job_id: jid }, '-calculated_at', 50).catch(() => []);
    const optionSnaps = snapshots.filter(s => s.estimate_package_id === selectedOptionId);
    const latestOptionSnap = optionSnaps.find(s => s.calculation_status === 'approved')
      || optionSnaps.find(s => s.calculation_status === 'overridden')
      || optionSnaps[0] || null;
    if (!latestOptionSnap) {
      blocking.push({ key: 'no_pricing_snapshot', message: 'No pricing snapshot exists for the selected option.' });
    } else {
      if (!['approved', 'overridden'].includes(latestOptionSnap.calculation_status)) {
        blocking.push({ key: 'pricing_not_approved', message: `Pricing for the selected option is not approved (status: ${latestOptionSnap.calculation_status}).` });
      }
      if (selected.pricing_status === 'stale') {
        blocking.push({ key: 'pricing_stale', message: 'Pricing is stale because the scope changed. Recalculate pricing before scheduling.' });
      }
      if (!latestOptionSnap.final_selling_price || latestOptionSnap.final_selling_price <= 0) {
        blocking.push({ key: 'no_final_price', message: 'Selected option has no valid final selling price.' });
      }
    }

    // ── 5. Estimate-level scheduling context ──
    if (estimate.scaffold_plan_required && estimate.scaffold_plan_status !== 'attached') {
      blocking.push({
        key: 'scaffold_plan_incomplete',
        message: `Scaffold plan is required but status is "${estimate.scaffold_plan_status || 'not_started'}". Attach the scaffold plan before scheduling.`,
      });
    }
    if (estimate.additional_fleet_required) {
      const fleetReqs = await base44.asServiceRole.entities.FleetResourceRequest
        .filter({ estimate_id: estimate.id }).catch(() => []);
      const completeReqs = fleetReqs.filter(r => r.vehicle_class && r.status && r.status !== 'Pending Assignment');
      if (completeReqs.length === 0) {
        blocking.push({
          key: 'fleet_requests_incomplete',
          message: 'Additional fleet resources are required but no complete FleetResourceRequest records exist. Create fleet resource requests before scheduling.',
        });
      }
    }
    if (estimate.weather_sensitivity && estimate.weather_sensitivity !== 'none') {
      warnings.push({ key: 'weather_sensitivity', message: `Weather sensitivity is "${estimate.weather_sensitivity}". Schedule with weather awareness.` });
    }
    if (estimate.customer_scheduling_restrictions && estimate.customer_scheduling_restrictions.trim()) {
      warnings.push({ key: 'customer_scheduling_restrictions', message: `Customer scheduling restrictions: ${estimate.customer_scheduling_restrictions}` });
    }

    // ── Gate: if not ready, return blockers — NO status change ──
    if (blocking.length > 0) {
      return Response.json({
        status: 'success', ready: false, estimate_id: estimate.id,
        blocking_requirements: blocking, warnings, validated_at: now,
      });
    }

    // ── 6. Idempotent FleetResourceRequest creation ──
    // Only create requests for vehicle_classes that don't already exist.
    if (estimate.additional_fleet_required) {
      let fleetRequests = safeParse(estimate.fleet_resource_requests, []);
      const existing = await base44.asServiceRole.entities.FleetResourceRequest
        .filter({ estimate_id: estimate.id }).catch(() => []);
      const existingClasses = new Set(existing.map(e => e.vehicle_class));
      const toCreate = fleetRequests
        .filter(r => r.vehicle_class && !existingClasses.has(r.vehicle_class))
        .map((r, i) => ({
          request_id: `FRR-${Date.now()}-${i}`,
          estimate_id: estimate.id,
          job_id: estimate.job_id || jid || '',
          customer_name: estimate.customer_name || '',
          customer_id: estimate.customer_id || '',
          vehicle_class: r.vehicle_class,
          quantity_needed: r.quantity_needed || 1,
          required_days: JSON.stringify(r.required_days || []),
          critical: r.critical || false,
          purpose: r.purpose || '',
          notes: r.notes || '',
          status: 'Pending Assignment',
          priority: 'normal',
          created_by: 'estimator',
        }));
      if (toCreate.length > 0) {
        await base44.asServiceRole.entities.FleetResourceRequest.bulkCreate(toCreate);
      }
    }

    // ── 7. Update Estimate status ──
    // Idempotent: if already ready_for_scheduling, just return success.
    if (estimate.status !== 'ready_for_scheduling') {
      const updated = await base44.asServiceRole.entities.Estimate.update(estimate.id, {
        status: 'ready_for_scheduling',
      });
      estimate = updated;
    }

    return Response.json({
      status: 'success', ready: true, estimate_id: estimate.id,
      estimate_status: 'ready_for_scheduling',
      blocking_requirements: [], warnings, validated_at: now,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}