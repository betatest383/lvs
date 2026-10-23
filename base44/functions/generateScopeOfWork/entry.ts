import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { job_id, estimate_id } = body;

    if (!job_id) {
      return Response.json({ error: 'job_id is required' }, { status: 400 });
    }

    const parseJSON = (str, fallback) => {
      if (!str) return fallback;
      if (typeof str === 'object') return str;
      try { return JSON.parse(str); } catch { return fallback; }
    };

    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

    // Fetch estimate
    let estimate = null;
    if (estimate_id) {
      estimate = await base44.asServiceRole.entities.Estimate.get(estimate_id);
    } else {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id });
      estimate = estimates[0] || null;
    }

    // Check for existing ScopeOfWork created by the Scope Builder
    const existingScopes = await base44.asServiceRole.entities.ScopeOfWork.filter({ job_id });
    const builderScope = existingScopes.find(s => s.generated_from === 'scope_builder') || existingScopes[0] || null;

    // Parse builder work_phases — these contain scope_data per recommendation
    const builderPhases = builderScope ? parseJSON(builderScope.work_phases, []) : [];
    const builderScopeMap = {};
    for (const phase of builderPhases) {
      if (phase.recommendation_id) {
        builderScopeMap[phase.recommendation_id] = phase.scope_data || phase;
      }
    }

    // Fetch draft estimate items (excluding rejected)
    const draftItems = estimate
      ? await base44.asServiceRole.entities.DraftEstimateItem.filter({ estimate_id: estimate.id })
      : await base44.asServiceRole.entities.DraftEstimateItem.filter({ job_id });

    const activeItems = draftItems.filter(i => i.status !== 'rejected');

    // Also fetch RepairSystemRecommendations for items without a builder scope
    const repairRecs = await base44.asServiceRole.entities.RepairSystemRecommendation.filter({ job_id }).catch(() => []);

    const allWorkPhases = [];
    const allRequiredEquipment = [];
    const allRequiredMaterials = [];
    const allSafetyNotes = [];
    const allCleanupTasks = [];
    const internalNotes = [];
    let totalEstimatedHours = 0;
    let maxCrewSize = 1;

    // If builder scope exists, preserve its work_phases as the base
    if (builderScope && builderPhases.length > 0) {
      for (const phase of builderPhases) {
        allWorkPhases.push({ ...phase, service_name: phase.service_name || phase.phase_name || '' });
        const sd = phase.scope_data || {};

        // --- Project Schedule computation (replaces generic labor-hours) ---
        const phaseDailyPlans = parseJSON(sd.daily_plans, []);
        const phaseDuration = sd.project_duration || '';
        const phaseCustomDays = sd.custom_days || 0;
        const phaseScheduleHours = sd.estimated_hours || 0;

        const phaseDurationToDays = (dur, cDays) => {
          if (dur === 'less_than_one_day') return 0;
          if (dur === 'custom') return Math.max(0, cDays || 0);
          const m = (dur || '').match(/^(\d+)_days$/);
          return m ? parseInt(m[1]) : 0;
        };

        let phaseComputedHours = 0;
        let phaseComputedCrew = 1;
        let phaseDailyHoursSum = 0;
        let phaseHasDailyCrewHours = false;
        for (const plan of phaseDailyPlans) {
          const ch = Number(plan.crew_hours);
          if (!isNaN(ch) && ch > 0) {
            phaseHasDailyCrewHours = true;
            phaseDailyHoursSum += ch;
          }
          const dayCrew = (plan.lead_technicians || 0) + (plan.apprentices || 0) + (plan.masons || 0);
          phaseComputedCrew = Math.max(phaseComputedCrew, dayCrew || 1);
        }
        if (phaseHasDailyCrewHours) {
          phaseComputedHours = phaseDailyHoursSum;
        } else if (phaseDuration === 'less_than_one_day') {
          phaseComputedHours = phaseScheduleHours;
        } else {
          const pDays = phaseDurationToDays(phaseDuration, phaseCustomDays);
          if (pDays > 0) phaseComputedHours = pDays * 8; // legacy 8-hour day fallback
        }

        totalEstimatedHours += phaseComputedHours || sd.estimated_labor_hours || phase.estimated_hours || 0;
        maxCrewSize = Math.max(maxCrewSize, phaseComputedCrew || sd.crew_size_required || phase.crew_size || 1);
        if (sd.safety_notes) allSafetyNotes.push(sd.safety_notes);
        if (sd.cleanup_requirements) allCleanupTasks.push(sd.cleanup_requirements);
        if (sd.technician_notes) internalNotes.push(`${phase.service_name || phase.phase_name}: ${sd.technician_notes}`);
      }
    }

    // Enrich with DraftEstimateItem data (Service Configuration Engine output)
    for (const item of activeItems) {
      const itemScope = parseJSON(item.scope_of_work, null);
      const itemEquipment = parseJSON(item.required_equipment, []);
      const itemLaborPhases = parseJSON(item.labor_phases, []);
      const itemMaterials = parseJSON(item.materials, []);

      // If no builder scope existed, build work phases from DraftEstimateItem data
      if (!builderScope || builderPhases.length === 0) {
        if (itemScope) {
          (itemScope.work_phases || []).forEach(p => {
            allWorkPhases.push({ ...p, service_name: item.service_name });
          });
          allSafetyNotes.push(...(itemScope.safety_notes || []));
          allCleanupTasks.push(...(itemScope.cleanup_tasks || []));
          if (itemScope.internal_notes) {
            internalNotes.push(`${item.service_name}: ${itemScope.internal_notes}`);
          }
        }

        if (itemLaborPhases.length > 0 && (!itemScope || !itemScope.work_phases || itemScope.work_phases.length === 0)) {
          itemLaborPhases.forEach(p => {
            allWorkPhases.push({ ...p, service_name: item.service_name });
          });
        }

        totalEstimatedHours += (item.estimated_time_hours || 0) + (item.estimated_time_minutes || 0) / 60;
        maxCrewSize = Math.max(maxCrewSize, item.crew_size_required || 1);
      }

      // Equipment (always aggregate from items — Service Configuration Engine output)
      if (itemEquipment.length > 0) {
        itemEquipment.forEach(e => {
          allRequiredEquipment.push({ ...e, service_name: item.service_name });
        });
      }

      // Materials (always aggregate — chargeable + internal for execution)
      itemMaterials.forEach(m => {
        allRequiredMaterials.push({ ...m, service_name: item.service_name });
      });
    }

    // --- Cap finish instructions and flue cut-down from cap sizing snapshots ---
    const capRecs = repairRecs.filter(r => r.cap_sizing_snapshot);
    for (const capRec of capRecs) {
      let capSnapshot = null;
      try { capSnapshot = parseJSON(capRec.cap_sizing_snapshot, null); } catch { /* ignore */ }
      if (!capSnapshot) continue;

      // Add finish instructions to internal notes
      if (capSnapshot.finish_configuration?.finish_type === 'powder_coated') {
        const fc = capSnapshot.finish_configuration;
        const colorName = fc.selected_color?.display_name || 'selected color';
        const colorCode = fc.selected_color?.manufacturer_color_code || '';
        internalNotes.push(`Cap Finish: Apply powder-coat in ${colorName}${colorCode ? ` (${colorCode})` : ''}. Base cap SKU: ${capSnapshot.material_sku || 'N/A'}. Finish material ID: ${fc.finish_material_id || 'N/A'}. Total finish upcharge: $${fc.total_finish_upcharge || 0}.`);
      }

      // Add flue cut-down work phase from snapshot
      if (capSnapshot.flue_tile_prerequisite?.prerequisite_service) {
        const cutDown = capSnapshot.flue_tile_prerequisite.prerequisite_service;
        for (const affectedFlue of cutDown.affected_flues || []) {
          const flueId = affectedFlue.flue_identifier || `flue-${affectedFlue.flue_index}`;
          allWorkPhases.push({
            recommendation_id: capRec.id,
            phase_name: `Cut Down ${flueId}`,
            service_name: 'Flue Tile Cut-Down (Prerequisite)',
            estimated_hours: 1,
            crew_size: 1,
            tasks: [
              `Measure current flue tile projection: ${affectedFlue.original_projection}"`,
              `Cut down to ${affectedFlue.planned_final_projection}" projection`,
              `Verify ${affectedFlue.required_cap_height}" cap fits over cut tile`,
            ],
          });
          allSafetyNotes.push(`Wear eye protection when cutting ${flueId} tile.`);
          allCleanupTasks.push(`Remove tile debris from ${flueId} area after cut-down.`);
          totalEstimatedHours += 1;
        }
      }
    }

    // If still no work phases, try building from repair recommendations
    if (allWorkPhases.length === 0 && repairRecs.length > 0) {
      for (const rec of repairRecs) {
        const sd = builderScopeMap[rec.id] || {};
        allWorkPhases.push({
          recommendation_id: rec.id,
          phase_name: rec.service_name || rec.recommendation_title || rec.title || 'Service',
          service_name: rec.service_name || '',
          estimated_hours: sd.estimated_labor_hours || rec.estimated_time_hours || 0,
          crew_size: sd.crew_size_required || rec.crew_size_required || 1,
          scope_data: sd,
        });
        totalEstimatedHours += sd.estimated_labor_hours || rec.estimated_time_hours || 0;
        maxCrewSize = Math.max(maxCrewSize, sd.crew_size_required || rec.crew_size_required || 1);
      }
    }

    // Build the scope data, preserving builder-generated fields
    const scopeData = {
      job_id,
      estimate_id: estimate?.id || builderScope?.estimate_id || '',
      customer_id: estimate?.customer_id || builderScope?.customer_id || '',
      customer_name: estimate?.customer_name || builderScope?.customer_name || '',
      status: builderScope?.generated_from === 'scope_builder' ? 'updated' : 'generated',
      work_phases: JSON.stringify(allWorkPhases),
      total_estimated_hours: round2(totalEstimatedHours),
      estimated_hours: round2(totalEstimatedHours),
      total_crew_hours: round2(totalEstimatedHours),
      daily_schedule: builderScope?.daily_schedule || '',
      production_days: builderScope?.production_days || 0,
      apprentice_man_hours: builderScope?.apprentice_man_hours || 0,
      apprentice_labor_cost: builderScope?.apprentice_labor_cost || 0,
      total_crew_required: maxCrewSize,
      required_equipment: JSON.stringify(allRequiredEquipment),
      required_materials: JSON.stringify(allRequiredMaterials),
      safety_notes: JSON.stringify([...new Set(allSafetyNotes)]),
      cleanup_tasks: JSON.stringify([...new Set(allCleanupTasks)]),
      internal_notes: internalNotes.join('\n\n'),
      generated_at: new Date().toISOString(),
      generated_from: builderScope?.generated_from === 'scope_builder' ? 'scope_builder' : 'estimate',
    };

    let scope = builderScope;
    if (scope) {
      scope = await base44.asServiceRole.entities.ScopeOfWork.update(scope.id, scopeData);
    } else {
      scope = await base44.asServiceRole.entities.ScopeOfWork.create(scopeData);
    }

    return Response.json({
      status: 'success',
      scope_of_work_id: scope.id,
      source: scopeData.generated_from,
      summary: {
        total_phases: allWorkPhases.length,
        total_estimated_hours: round2(totalEstimatedHours),
        crew_required: maxCrewSize,
        equipment_count: allRequiredEquipment.length,
        material_count: allRequiredMaterials.length,
        safety_notes_count: allSafetyNotes.length,
        cleanup_tasks_count: allCleanupTasks.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});