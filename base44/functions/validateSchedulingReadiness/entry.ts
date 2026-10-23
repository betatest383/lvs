import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ═══════════════════════════════════════════════════════════════════════
//  validateSchedulingReadiness — the SINGLE server-authoritative result
//  for "Ready for Scheduling". Evaluates the customer-selected, accepted
//  option ONLY. Non-selected Good/Better/Best options do NOT block after
//  the customer has selected one.
//
//  Returns: { ready, selected_option_id, scope_of_work_id, pricing_snapshot_id,
//             blocking_requirements, warnings, validated_at }
//
//  Reuses existing authoritative fields:
//    - AppointmentWorkflow.selected_option_id (immutable EstimatePackage ID)
//    - EstimatePackage.is_selected / selected_at / selected_by (acceptance)
//    - JobActivityLog signature_captured (customer signature)
//    - ScopeOfWork (estimate_package_id === selected_option_id)
//    - PricingCalculationSnapshot (estimate_package_id === selected_option_id)
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
    const { job_id } = body;
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const now = new Date().toISOString();
    const blocking = [];
    const warnings = [];

    // 1. Resolve the customer-selected option. The AUTHORITATIVE source is the
    //    CustomerPresentation record (selected_estimate_package_id — the immutable
    //    EstimatePackage id persisted by acceptProposalOption). AppointmentWorkflow
    //    .selected_option_id and a single is_selected package are fallbacks only.
    const presentations = await base44.asServiceRole.entities.CustomerPresentation
      .filter({ job_id }, '-created_date', 10).catch(() => []);
    const pres = presentations[0] || null;

    const workflows = await base44.asServiceRole.entities.AppointmentWorkflow
      .filter({ job_id }, '-created_date', 5).catch(() => []);
    const wf = workflows[0] || null;

    let selectedOptionId = pres?.selected_estimate_package_id
      || wf?.selected_option_id
      || null;

    const packages = await base44.asServiceRole.entities.EstimatePackage
      .filter({ job_id }, '-created_date', 100).catch(() => []);
    const customerFacing = packages.filter(p =>
      p.is_customer_facing !== false && p.status !== 'archived' && !p.superseded_by_id
    );

    // Exactly-one-selected enforcement: if more than one package is selected,
    // that is a data-integrity warning (acceptProposalOption always reconciles
    // to one). Scheduling proceeds against the authoritative selected_option_id.
    const selectedCount = customerFacing.filter(p => p.is_selected === true).length;
    if (selectedCount > 1) {
      warnings.push({
        key: 'multiple_selected_options',
        message: `${selectedCount} options are marked selected. The authoritative accepted option is "${selectedOptionId || 'unset'}". Re-running acceptProposalOption will reconcile.`,
      });
    }

    let selected = null;
    if (selectedOptionId) {
      selected = customerFacing.find(p => p.id === selectedOptionId) || packages.find(p => p.id === selectedOptionId) || null;
    }
    // Fallback: if no persisted selected id but exactly one package is_selected, use it
    if (!selected) {
      const isSelected = customerFacing.find(p => p.is_selected === true);
      if (isSelected) {
        selected = isSelected;
        selectedOptionId = isSelected.id;
      }
    }

    if (!selectedOptionId || !selected) {
      blocking.push({
        key: 'no_selected_option',
        message: 'No customer-selected option. The customer must select and accept one proposal option before scheduling.',
      });
      return Response.json({
        status: 'success', ready: false, selected_option_id: selectedOptionId || null,
        scope_of_work_id: null, pricing_snapshot_id: null, estimate_id: null,
        blocking_requirements: blocking, warnings, validated_at: now,
      });
    }

    // 2. Customer acceptance + signature + acceptance date — all from the
    //    AUTHORITATIVE CustomerPresentation record (the real acceptance source
    //    written by acceptProposalOption + uploadSignature). No side-channel log.
    const acceptedDecisions = ['perform_work_today', 'schedule_for_later'];
    const presDecision = pres?.customer_decision;
    const isAcceptedViaPres = pres && acceptedDecisions.includes(presDecision)
      && pres.selected_estimate_package_id === selectedOptionId;
    if (!isAcceptedViaPres && selected.is_selected !== true) {
      blocking.push({
        key: 'option_not_accepted',
        message: `${selected.name || selected.option_type || 'Selected option'} has not been accepted by the customer.`,
      });
    }

    const acceptanceDate = pres?.customer_decision_at || selected.selected_at || null;
    if (!acceptanceDate) {
      blocking.push({
        key: 'acceptance_date_missing',
        message: 'Customer acceptance date is missing.',
      });
    }

    // Customer signature — the authoritative source is CustomerPresentation
    // .customer_signature_url (the file_url from uploadSignature, persisted by
    // acceptProposalOption). Do NOT use a JobActivityLog side channel.
    const signatureUrl = pres?.customer_signature_url || '';
    if (!signatureUrl) {
      blocking.push({
        key: 'customer_signature_missing',
        message: 'Customer signature is missing. Capture the acceptance signature during presentation.',
      });
    }

    // 3. Authoritative Scope of Work for THIS option
    const scopes = await base44.asServiceRole.entities.ScopeOfWork
      .filter({ job_id }, '-created_date', 100).catch(() => []);
    const optionScope = scopes.find(s => s.estimate_package_id === selectedOptionId && !s.superseded_by_id && s.status === 'approved')
      || scopes.find(s => s.estimate_package_id === selectedOptionId && !s.superseded_by_id)
      || null;
    if (!optionScope) {
      blocking.push({
        key: 'no_scope_for_option',
        message: 'No active Scope of Work is linked to the selected option.',
      });
    } else {
      // 3a. Valid daily schedule with hours for every workday
      const dailySchedule = safeParse(optionScope.daily_schedule, []);
      if (!Array.isArray(dailySchedule) || dailySchedule.length === 0) {
        blocking.push({ key: 'daily_schedule_missing', message: 'No daily schedule on the selected option scope.' });
      } else {
        for (const d of dailySchedule) {
          const ch = Number(d.crew_hours);
          if (isNaN(ch) || ch <= 0) {
            blocking.push({
              key: `day_${d.day_number}_hours_missing`,
              message: `Day ${d.day_number} work hours are missing.`,
            });
          }
        }
      }
      // 3b. Crew counts
      const crewReqs = safeParse(optionScope.crew_requirements, []);
      const hasCrew = (Array.isArray(crewReqs) && crewReqs.some(c => (c.count || 0) > 0))
        || (optionScope.total_crew_required || 0) > 0
        || (Array.isArray(dailySchedule) && dailySchedule.some(d => (Number(d.apprentice_count) > 0)));
      if (!hasCrew) {
        blocking.push({ key: 'crew_counts_missing', message: 'Required crew counts are missing on the selected option scope.' });
      }
      // 3c. Materials/labor requirements (warning only — may be legitimately empty)
      const materials = safeParse(optionScope.required_materials, []);
      if (!Array.isArray(materials) || materials.length === 0) {
        warnings.push({ key: 'materials_empty', message: 'No materials listed on the selected option scope.' });
      }
    }

    // 4. Current, non-stale pricing snapshot for THIS exact option + scope
    const snapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot
      .filter({ job_id }, '-calculated_at', 50).catch(() => []);
    const optionSnaps = snapshots.filter(s => s.estimate_package_id === selectedOptionId);
    const latestOptionSnap = optionSnaps.find(s => s.calculation_status === 'approved')
      || optionSnaps.find(s => s.calculation_status === 'overridden')
      || optionSnaps[0]
      || null;
    if (!latestOptionSnap) {
      blocking.push({
        key: 'no_pricing_snapshot',
        message: 'No pricing snapshot exists for the selected option.',
      });
    } else {
      if (!['approved', 'overridden'].includes(latestOptionSnap.calculation_status)) {
        blocking.push({
          key: 'pricing_not_approved',
          message: `Pricing for the selected option is not approved (status: ${latestOptionSnap.calculation_status}).`,
        });
      }
      // Staleness is tracked on the EstimatePackage (pricing_status === 'stale'),
      // not on the snapshot. A stale selected option blocks scheduling until
      // pricing is recalculated for the changed scope.
      if (selected.pricing_status === 'stale') {
        blocking.push({
          key: 'pricing_stale',
          message: 'Pricing is stale because the scope changed. Recalculate pricing before scheduling.',
        });
      }
      if (!latestOptionSnap.final_selling_price || latestOptionSnap.final_selling_price <= 0) {
        blocking.push({
          key: 'no_final_price',
          message: 'Selected option has no valid final selling price.',
        });
      }
    }

    // Resolve the Estimate id for the selected option (when applicable).
    let estimateId = selected.estimate_id || null;
    let estimate = null;
    {
      if (estimateId) {
        estimate = await base44.asServiceRole.entities.Estimate.get(estimateId).catch(() => null);
      }
      if (!estimate) {
        const ests = await base44.asServiceRole.entities.Estimate
          .filter({ job_id }, '-created_date', 10).catch(() => []);
        estimate = ests?.[0] || null;
        estimateId = estimate?.id || null;
      }
    }

    // 5. Estimate-level scheduling context (server-authoritative).
    //    These fields live on the Estimate entity, NOT the per-option
    //    ScopeOfWork. They gate the "Ready for Scheduling" action.
    if (estimate) {
      // 5a. Scaffold plan — BLOCKING when required but not attached.
      if (estimate.scaffold_plan_required && estimate.scaffold_plan_status !== 'attached') {
        blocking.push({
          key: 'scaffold_plan_incomplete',
          message: `Scaffold plan is required but status is "${estimate.scaffold_plan_status || 'not_started'}". Attach the scaffold plan before scheduling.`,
        });
      }

      // 5b. Additional fleet resources — BLOCKING when required but no
      //     complete FleetResourceRequest records exist for this estimate.
      if (estimate.additional_fleet_required) {
        const fleetReqs = await base44.asServiceRole.entities.FleetResourceRequest
          .filter({ estimate_id: estimate.id }).catch(() => []);
        const completeReqs = fleetReqs.filter(r =>
          r.vehicle_class && r.status && r.status !== 'Pending Assignment'
        );
        if (completeReqs.length === 0) {
          blocking.push({
            key: 'fleet_requests_incomplete',
            message: 'Additional fleet resources are required but no complete FleetResourceRequest records exist. Create fleet resource requests before scheduling.',
          });
        }
      }

      // 5c. Weather sensitivity — WARNING (informational, not blocking unless
      //     business rules escalate it). Scheduling can proceed; the dispatcher
      //     should account for weather-dependent work.
      if (estimate.weather_sensitivity && estimate.weather_sensitivity !== 'none') {
        warnings.push({
          key: 'weather_sensitivity',
          message: `Weather sensitivity is "${estimate.weather_sensitivity}". Schedule with weather awareness.`,
        });
      }

      // 5d. Customer scheduling restrictions — WARNING (informational).
      if (estimate.customer_scheduling_restrictions && estimate.customer_scheduling_restrictions.trim()) {
        warnings.push({
          key: 'customer_scheduling_restrictions',
          message: `Customer scheduling restrictions: ${estimate.customer_scheduling_restrictions}`,
        });
      }
    }

    const ready = blocking.length === 0;
    return Response.json({
      status: 'success',
      ready,
      selected_option_id: selectedOptionId,
      scope_of_work_id: optionScope?.id || null,
      pricing_snapshot_id: latestOptionSnap?.id || null,
      estimate_id: estimateId,
      blocking_requirements: blocking,
      warnings,
      validated_at: now,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}