import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const diagnostic = {
      job_id: jobId,
      inspection_id: null,
      recommendation_review_id: null,
      repair_system_recommendation_count: 0,
      draft_estimate_id: null,
      draft_estimate_item_count: 0,
      items_ready: 0,
      items_suggested: 0,
      items_manual_review: 0,
      items_missing_price: 0,
      items_approved: 0,
      items_deferred: 0,
      template_matches: 0,
      fallback_matches: 0,
      no_matches: 0,
      proposal_option_templates_found: 0,
      current_workflow_stage: 'estimate_review',
      next_workflow_stage: 'execution_plan',
      errors: [],
    };

    // 1. Load job
    const job = await base44.entities.Job.get(jobId).catch(() => null);
    if (!job) {
      diagnostic.errors.push('Job not found');
      return Response.json({ status: 'error', error: 'Job not found', diagnostic }, { status: 404 });
    }

    // 2. Load all supporting data in parallel — including RepairRecommendationTemplates
    const [recReviews, recReviewItems, repairRecs, setups, appointments, propertyProfiles, serviceCatalog, templates] = await Promise.all([
      base44.entities.RecommendationReview.filter({ job_id: jobId }).catch(() => []),
      base44.entities.RecommendationReviewItem.filter({ job_id: jobId }).catch(() => []),
      base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []),
      base44.entities.InspectionSetup.filter({ job_id: jobId }).catch(() => []),
      base44.entities.Appointment.filter({ job_id: jobId }).catch(() => []),
      base44.entities.PropertyProfile.filter({ customer_id: job.customer_id || '' }).catch(() => []),
      base44.entities.ServiceCatalog.filter({ is_active: true }).catch(() => []),
      base44.entities.RepairRecommendationTemplate.filter({ is_active: true }).catch(() => []),
    ]);

    // Load ScopeOfWork from Scope Builder — operational details per recommendation
    const existingScopes = await base44.entities.ScopeOfWork.filter({ job_id: jobId }).catch(() => []);
    const builderScope = existingScopes.find(s => s.generated_from === 'scope_builder') || null;
    let builderScopeMap = {};
    if (builderScope) {
      try {
        const phases = JSON.parse(builderScope.work_phases || '[]');
        for (const phase of phases) {
          if (phase.recommendation_id) {
            builderScopeMap[phase.recommendation_id] = phase.scope_data || phase;
          }
        }
      } catch { /* ignore */ }
    }

    // Load ProposalOptionTemplates for all matched templates (after first pass below)
    // Preload all active proposal option templates
    const allProposalOptions = await base44.entities.ProposalOptionTemplate
      .filter({ is_active: true }).catch(() => []);

    const recReview = recReviews[0] || null;
    const inspectionSetup = setups[0] || null;
    const propertyProfile = propertyProfiles[0] || null;

    diagnostic.inspection_id = inspectionSetup?.id || null;
    diagnostic.recommendation_review_id = recReview?.id || null;
    diagnostic.repair_system_recommendation_count = repairRecs.length;

    // Resolve today's appointment
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayAppt = appointments.find(a => a.status === 'started' || a.status === 'dispatched')
      || appointments.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr)
      || appointments[0]
      || null;

    // 3. Filter estimate-required items
    const estimateRequiredItems = recReviewItems.filter(i => i.estimate_required);

    if (estimateRequiredItems.length === 0) {
      diagnostic.errors.push('No estimate-required recommendation review items found');
      return Response.json({
        status: 'error',
        error: 'No estimate-required items. Complete Recommendation Review first.',
        diagnostic,
      }, { status: 400 });
    }

    // 4. Delete old unresolved DraftEstimateItem records for this job (preserve approved/deferred/rejected)
    //    BUT preserve items with committed_work_key (cap items) — they are upserted, not deleted
    const oldItems = await base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []);
    const existingByKey = {}; // committed_work_key → DraftEstimateItem
    for (const oldItem of oldItems) {
      if (oldItem.committed_work_key) {
        existingByKey[oldItem.committed_work_key] = oldItem;
        continue; // don't delete — will be upserted
      }
      if (!['approved', 'deferred', 'rejected'].includes(oldItem.status)) {
        await base44.entities.DraftEstimateItem.delete(oldItem.id).catch(() => {});
      }
    }

    // 5. First pass: match templates → services, collect material IDs for inventory lookup
    const matchResults = [];
    const allMaterialIds = new Set();

    for (const item of estimateRequiredItems) {
      // Find linked RepairSystemRecommendation
      const linkedRec = repairRecs.find(r => {
        try {
          const ids = JSON.parse(r.related_findings || '[]');
          return Array.isArray(ids) && ids.includes(item.finding_id);
        } catch { return false; }
      });

      // --- Template-first matching ---
      const matchItem = {
        deficiency_type: item.deficiency_type || '',
        severity: item.severity || '',
        title: item.title || '',
        description: item.description || item.customer_summary || '',
        category: item.interior_exterior || '',
      };
      const templateMatches = findMatchingTemplate(matchItem, templates);
      let service = null;
      let matchType = 'none';
      let matchedTemplate = null;

      if (templateMatches.length > 0 && templateMatches[0].score >= 8) {
        matchedTemplate = templateMatches[0].template;
        // If template has a linked ServiceCatalog item, use it
        if (matchedTemplate.service_catalog_id) {
          service = serviceCatalog.find(s => s.id === matchedTemplate.service_catalog_id) || null;
        }
        // Determine match type: single strong match = template_direct, multiple = template_suggested
        matchType = templateMatches.length === 1 || templateMatches[0].score >= templateMatches[1]?.score + 5
          ? 'template_direct'
          : 'template_suggested';
        diagnostic.template_matches++;
      }

      // --- Fallback: existing ServiceCatalog keyword matching ---
      if (!service) {
        const fallback = matchService(item, linkedRec, serviceCatalog);
        service = fallback.service;
        matchType = fallback.matchType;
        if (service) diagnostic.fallback_matches++;
        else diagnostic.no_matches++;
      }

      matchResults.push({ item, linkedRec, service, matchType, template: matchedTemplate, templateMatches });

      // Collect material IDs from matched service defaults OR template default materials
      const materialSource = matchedTemplate?.default_materials || service?.default_materials;
      if (materialSource) {
        try {
          const mats = JSON.parse(materialSource);
          if (Array.isArray(mats)) {
            for (const m of mats) {
              if (m.material_id) allMaterialIds.add(m.material_id);
            }
          }
        } catch { /* ignore */ }
      }
      // Also collect from template internal materials
      if (matchedTemplate?.internal_materials) {
        try {
          const mats = JSON.parse(matchedTemplate.internal_materials);
          if (Array.isArray(mats)) {
            for (const m of mats) {
              if (m.material_id) allMaterialIds.add(m.material_id);
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 6. Look up InventoryMaster records for material pricing
    const inventoryMap = {};
    await Promise.all([...allMaterialIds].map(async id => {
      const inv = await base44.entities.InventoryMaster.get(id).catch(() => null);
      if (inv) inventoryMap[id] = inv;
    }));

    // 7. Build draft estimate items
    const draftItems = [];
    const allFindingIds = [];

    for (const { item, linkedRec, service, matchType, template, templateMatches } of matchResults) {
      if (item.finding_id) allFindingIds.push(item.finding_id);

      // Prefer materials chosen by the technician in Recommendation Review.
      // Template/service defaults remain the fallback only when no manual list exists.
      let { materials, chargeableMaterialsTotal, internalMaterialsTotal } = buildMaterials(template, service, inventoryMap);
      try {
        const selectedMaterials = JSON.parse(item.materials || '[]');
        if (Array.isArray(selectedMaterials) && selectedMaterials.length > 0) {
          materials = selectedMaterials.map((m) => ({
            material_id: m.material_id || '',
            material_name: m.item_name || m.material_name || '',
            quantity: Number(m.quantity) || 1,
            unit: m.unit || 'ea',
            unit_price: Number(m.unit_cost || m.unit_price) || 0,
            chargeable_to_customer: true,
            customer_visible: true,
          }));
          chargeableMaterialsTotal = materials.reduce((sum, m) => sum + (m.unit_price * m.quantity), 0);
          internalMaterialsTotal = 0;
        }
      } catch { /* retain configured defaults when saved material JSON is invalid */ }

      // --- Cap Sizing Snapshot Integration ---
      // If the linked recommendation has a confirmed cap_sizing_snapshot, inject cap-specific materials and items
      let capSnapshot = null;
      let capConfigStatus = linkedRec?.cap_configuration_status || null;
      if (linkedRec?.cap_sizing_snapshot) {
        try { capSnapshot = JSON.parse(linkedRec.cap_sizing_snapshot); } catch { /* ignore */ }
      }

      if (capSnapshot && capConfigStatus === 'confirmed') {
        // Build cap description with diameter info for round products
        let capDesc = capSnapshot.material_description || capSnapshot.matrix_name || 'Chimney Cap';
        if (capSnapshot.is_round_product || capSnapshot.nominal_diameter) {
          capDesc += ` — ${capSnapshot.nominal_diameter}" Ø round`;
          if (capSnapshot.measured_diameter) {
            capDesc += ` (measured flue Ø ${capSnapshot.measured_diameter}", fits ${capSnapshot.min_fitting_diameter}"–${capSnapshot.max_fitting_diameter}")`;
          }
        }
        // Add base cap material to the materials list
        const baseCapMaterial = {
          material_id: capSnapshot.material_id || '',
          material_name: capDesc,
          quantity: 1,
          unit: 'ea',
          unit_price: capSnapshot.material_price || 0,
          chargeable_to_customer: true,
          customer_visible: true,
          commission_type: 'none',
          commission_value: 0,
          committed_work_key: `cap-base:${linkedRec.id}:${capSnapshot.matrix_id}`,
        };
        materials.push(baseCapMaterial);
      }

      // Recalculate material totals if cap material was added
      let adjustedChargeableTotal = chargeableMaterialsTotal;
      if (capSnapshot && capConfigStatus === 'confirmed') {
        adjustedChargeableTotal = materials
          .filter(m => m.chargeable_to_customer !== false)
          .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
      }

      // Calculate totals — template price overrides service price when set
      const servicePrice = template?.default_selling_price || service?.default_selling_price || 0;
      const serviceCommissionType = template?.service_commission_type || service?.service_commission_type || 'none';
      const serviceCommissionValue = template?.service_commission_value || service?.service_commission_value || 0;

      const serviceCommissionAmount = calculateCommission(serviceCommissionType, serviceCommissionValue, servicePrice);
      const materialCommissionType = template?.service_commission_type || service?.material_commission_type || 'none';
      const materialCommissionValue = template?.service_commission_value || service?.material_commission_value || 0;
      const materialCommissionAmount = materials
        .filter(m => m.chargeable_to_customer !== false)
        .reduce((sum, m) => sum + calculateCommission(
          m.commission_type || materialCommissionType,
          m.commission_value || materialCommissionValue,
          (m.unit_price || 0) * (m.quantity || 1)
        ), 0);

      const totalItemPrice = servicePrice + adjustedChargeableTotal;

      // Proposal Option Templates — find the default-selected option for this repair template
      const templateProposalOptions = template
        ? allProposalOptions.filter(o => o.linked_repair_recommendation_template_id === template.id)
        : [];
      const defaultOption = templateProposalOptions.find(o => o.default_selected) || null;

      // Scope of Work builder data — operational details collected per recommendation
      const builderData = linkedRec ? (builderScopeMap[linkedRec.id] || null) : null;

      // --- Project Schedule computation (replaces generic labor-hours input) ---
      // The Service Configuration Engine now calculates pricing using:
      //   - Estimated project duration
      //   - Estimated hours (if less than one day)
      //   - Daily crew requirements (lead technicians, apprentices, masons)
      const parseScheduleJSON = (str, fallback) => {
        if (!str) return fallback;
        if (typeof str === 'object') return str;
        try { return JSON.parse(str); } catch { return fallback; }
      };
      const projectDuration = builderData?.project_duration || '';
      const customDays = builderData?.custom_days || 0;
      const scheduleHours = builderData?.estimated_hours || 0;
      const dailyPlans = parseScheduleJSON(builderData?.daily_plans, []);

      const durationToDays = (dur, cDays) => {
        if (dur === 'less_than_one_day') return 0;
        if (dur === 'custom') return Math.max(0, cDays || 0);
        const m = (dur || '').match(/^(\d+)_days$/);
        return m ? parseInt(m[1]) : 0;
      };

      let scheduleComputedHours = 0;
      let scheduleComputedCrew = 1;
      let scheduleTotalLeads = 0;
      let scheduleTotalApprentices = 0;
      let scheduleTotalMasons = 0;
      const scheduleNumDays = durationToDays(projectDuration, customDays);

      // Authoritative per-day model: sum each day's crew_hours. Legacy fallbacks
      // preserve former behavior for records without daily crew_hours:
      //   - "less than one day" → the single estimated_hours value
      //   - N days with no per-day hours → N × 8
      let dailyHoursSum = 0;
      let hasDailyCrewHours = false;
      for (const plan of dailyPlans) {
        const ch = Number(plan.crew_hours);
        if (!isNaN(ch) && ch > 0) {
          hasDailyCrewHours = true;
          dailyHoursSum += ch;
        }
        const dayCrew = (plan.lead_technicians || 0) + (plan.apprentices || 0) + (plan.masons || 0);
        scheduleComputedCrew = Math.max(scheduleComputedCrew, dayCrew || 1);
        scheduleTotalLeads += plan.lead_technicians || 0;
        scheduleTotalApprentices += plan.apprentices || 0;
        scheduleTotalMasons += plan.masons || 0;
      }

      if (hasDailyCrewHours) {
        scheduleComputedHours = dailyHoursSum;
      } else if (projectDuration === 'less_than_one_day') {
        scheduleComputedHours = scheduleHours;
      } else if (scheduleNumDays > 0) {
        scheduleComputedHours = scheduleNumDays * 8; // legacy 8-hour day fallback
      }

      // Service Configuration Engine fields — single source of truth from ServiceCatalog,
      // overridden by Scope Builder Project Schedule inputs where available
      const internalCost = (service?.internal_cost || 0) * 1;
      const grossProfit = servicePrice - internalCost;
      const grossMargin = servicePrice > 0 ? (grossProfit / servicePrice) * 100 : 0;
      const membershipPrice = service?.membership_price || 0;
      const crewSizeRequired = scheduleComputedCrew || builderData?.crew_size_required || service?.crew_size_required || 1;
      const laborPhases = service?.labor_phases || '';
      const requiredEquipment = service?.required_equipment || '';
      const scopeOfWork = service?.scope_of_work_template || '';
      // Proposal tier: use default-selected ProposalOptionTemplate if available, else fall back to ServiceCatalog
      const proposalTier = defaultOption?.proposal_level || service?.proposal_tier || 'standalone';
      const proposalCustomerBenefits = defaultOption?.customer_benefits || service?.proposal_customer_benefits || '';
      const proposalWarrantyMessaging = defaultOption?.warranty_messaging || service?.proposal_warranty_messaging || '';
      const proposalEstimatedDuration = defaultOption?.estimated_duration || service?.proposal_estimated_duration || '';
      const customerDescription = template?.customer_summary
        || service?.customer_description
        || service?.description
        || '';

      // Estimated time — Project Schedule computed hours take priority, then builder legacy field,
      // then template, then service
      const estimatedTimeHours = scheduleComputedHours
        || builderData?.estimated_labor_hours
        || template?.estimated_time_hours
        || service?.estimated_time_hours
        || 0;
      const estimatedTimeMinutes = template?.estimated_time_minutes ?? service?.estimated_time_minutes ?? 0;
      const hasEstimatedTime = estimatedTimeHours > 0 || estimatedTimeMinutes > 0 || (service?.default_labor_hours || 0) > 0;

      // Description — template customer_summary takes priority, then customer_facing_recommendation
      const customerFacing = template?.customer_summary
        || template?.customer_facing_recommendation
        || service?.customer_description
        || item.customer_summary
        || item.recommended_solution
        || '';
      const serviceDescription = template?.service_description
        || service?.description
        || service?.customer_description
        || '';
      const hasDescription = !!(customerFacing || serviceDescription);

      // Determine status based on match type and data completeness
      let status;
      if (matchType === 'template_direct') {
        if (servicePrice > 0 && hasDescription && hasEstimatedTime) {
          status = 'ready';
        } else if (servicePrice === 0 && hasDescription) {
          status = 'missing_price';
        } else {
          status = 'manual_review';
        }
      } else if (matchType === 'template_suggested') {
        status = 'suggested_service';
      } else if (matchType === 'user_selected' || matchType === 'direct') {
        if (servicePrice > 0 && hasDescription && hasEstimatedTime) {
          status = 'ready';
        } else if (servicePrice === 0 && hasDescription) {
          status = 'missing_price';
        } else if (servicePrice > 0 && !hasDescription) {
          status = 'manual_review';
        } else {
          status = 'manual_review';
        }
      } else if (matchType === 'suggested') {
        status = 'suggested_service';
      } else {
        status = 'manual_review';
      }

      draftItems.push({
        estimate_id: '', // Will be set after estimate is created/updated
        job_id: jobId,
        appointment_id: todayAppt?.id || '',
        inspection_id: inspectionSetup?.id || '',
        customer_id: job.customer_id || '',
        recommendation_review_id: recReview?.id || '',
        recommendation_review_item_id: item.id,
        repair_system_recommendation_id: linkedRec?.id || '',
        repair_recommendation_template_id: template?.id || '',
        finding_id: item.finding_id || '',
        finding_type: item.finding_type || 'InspectionFinding',
        deficiency_type: item.deficiency_type || '',
        severity: item.severity || 'moderate',
        source_title: item.title || item.recommended_solution || 'Deficiency',
        source_description: item.description || item.customer_summary || '',
        service_catalog_id: service?.id || template?.service_catalog_id || '',
        service_name: template?.service_name || service?.service_name || item.recommended_solution || item.title || '',
        service_code: template?.service_code || service?.service_code || '',
        service_description: serviceDescription,
        customer_facing_summary: customerFacing,
        estimated_time_hours: estimatedTimeHours,
        estimated_time_minutes: estimatedTimeMinutes,
        service_price: servicePrice,
        quantity: 1,
        service_commission_type: serviceCommissionType,
        service_commission_value: serviceCommissionValue,
        service_commission_amount: round2(serviceCommissionAmount),
        materials: JSON.stringify(materials),
        chargeable_materials_total: round2(adjustedChargeableTotal),
        internal_materials_total: round2(internalMaterialsTotal),
        material_commission_amount: round2(materialCommissionAmount),
        total_item_price: round2(totalItemPrice),
        internal_cost: round2(internalCost),
        gross_profit: round2(grossProfit),
        gross_margin: round2(grossMargin),
        membership_price: round2(membershipPrice),
        crew_size_required: crewSizeRequired,
        labor_phases: laborPhases,
        required_equipment: requiredEquipment,
        scope_of_work: scopeOfWork,
        proposal_tier: proposalTier,
        proposal_customer_benefits: proposalCustomerBenefits,
        proposal_warranty_messaging: proposalWarrantyMessaging,
        proposal_estimated_duration: proposalEstimatedDuration,
        customer_description: customerDescription,
        is_service_only: materials.length === 0,
        status,
        sort_order: draftItems.length,
        committed_work_key: (capSnapshot && capConfigStatus === 'confirmed')
          ? `cap-base:${linkedRec.id}:${capSnapshot.matrix_id}`
          : '',
        cap_snapshot_ref: linkedRec?.id || '',
      });

      // --- Cap Finish Service Item (powder-coat application) ---
      if (capSnapshot && capConfigStatus === 'confirmed' && capSnapshot.finish_configuration?.finish_type === 'powder_coated') {
        const fc = capSnapshot.finish_configuration;
        const colorName = fc.selected_color?.display_name || '';
        const colorCode = fc.selected_color?.manufacturer_color_code || '';

        // Finish service line item (powder-coat application labor + base charge)
        draftItems.push({
          estimate_id: '',
          job_id: jobId,
          appointment_id: todayAppt?.id || '',
          inspection_id: inspectionSetup?.id || '',
          customer_id: job.customer_id || '',
          recommendation_review_id: recReview?.id || '',
          recommendation_review_item_id: item.id,
          repair_system_recommendation_id: linkedRec?.id || '',
          repair_recommendation_template_id: template?.id || '',
          finding_id: item.finding_id || '',
          finding_type: 'InspectionFinding',
          deficiency_type: 'cap_finish_service',
          severity: 'info',
          source_title: `Powder-Coat Finish Application — ${capSnapshot.matrix_name || 'Cap'}`,
          source_description: `Powder-coat finish application for ${capSnapshot.material_sku || 'cap'}${colorName ? ` in ${colorName}` : ''}.`,
          service_catalog_id: fc.finish_service_id || '',
          service_name: `Powder-Coat Finish (${fc.pricing_tier || 'standard'})`,
          service_code: 'CAP-FINISH',
          service_description: `Apply powder-coat finish to ${capSnapshot.matrix_name || 'chimney cap'}${colorName ? ` in ${colorName} (${colorCode})` : ''}.`,
          customer_facing_summary: `Powder-coat finish in ${colorName || 'selected color'}${colorCode ? ` (${colorCode})` : ''}.`,
          customer_description: `Includes powder-coat application${colorName ? ` in ${colorName}` : ''}. Finish pricing tier: ${fc.pricing_tier || 'standard'}.`,
          estimated_time_hours: 0,
          estimated_time_minutes: 0,
          service_price: round2(fc.finish_additional_price || 0),
          quantity: 1,
          service_commission_type: 'none',
          service_commission_value: 0,
          service_commission_amount: 0,
          materials: JSON.stringify([{
            material_id: fc.finish_material_id || '',
            material_name: `Powder-Coat Finish Material (${colorName || 'selected color'})`,
            quantity: 1,
            unit: 'ea',
            unit_price: 0,
            chargeable_to_customer: true,
            customer_visible: true,
            commission_type: 'none',
            commission_value: 0,
          }]),
          chargeable_materials_total: 0,
          internal_materials_total: 0,
          material_commission_amount: 0,
          total_item_price: round2(fc.finish_additional_price || 0),
          internal_cost: 0,
          gross_profit: round2(fc.finish_additional_price || 0),
          gross_margin: 100,
          membership_price: 0,
          crew_size_required: 1,
          labor_phases: '',
          required_equipment: '',
          scope_of_work: '',
          proposal_tier: 'standalone',
          proposal_customer_benefits: '',
          proposal_warranty_messaging: '',
          proposal_estimated_duration: '',
          customer_description_text: '',
          is_service_only: false,
          status: 'ready',
          sort_order: draftItems.length,
          committed_work_key: `cap-finish:${linkedRec.id}:${fc.finish_pricing_entry_id || 'no-pricing'}`,
          cap_snapshot_ref: linkedRec?.id || '',
        });

        // Color Premium line item (if color has additional cost)
        if (fc.color_additional_cost > 0 && fc.selected_color?.id) {
          draftItems.push({
            estimate_id: '',
            job_id: jobId,
            appointment_id: todayAppt?.id || '',
            inspection_id: inspectionSetup?.id || '',
            customer_id: job.customer_id || '',
            recommendation_review_id: recReview?.id || '',
            recommendation_review_item_id: item.id,
            repair_system_recommendation_id: linkedRec?.id || '',
            repair_recommendation_template_id: template?.id || '',
            finding_id: item.finding_id || '',
            finding_type: 'InspectionFinding',
            deficiency_type: 'cap_color_premium',
            severity: 'info',
            source_title: `Color Premium — ${colorName}`,
            source_description: `Premium color upcharge for ${colorName} (${colorCode}).`,
            service_catalog_id: '',
            service_name: `Color Premium: ${colorName}`,
            service_code: 'CAP-COLOR',
            service_description: `Premium color upcharge for ${colorName} (${colorCode}).`,
            customer_facing_summary: `Premium color: ${colorName} (${colorCode}).`,
            customer_description: `Additional charge for premium color ${colorName} (${colorCode}). This is separate from the base powder-coat finish charge.`,
            estimated_time_hours: 0,
            estimated_time_minutes: 0,
            service_price: round2(fc.color_additional_cost),
            quantity: 1,
            service_commission_type: 'none',
            service_commission_value: 0,
            service_commission_amount: 0,
            materials: JSON.stringify([]),
            chargeable_materials_total: 0,
            internal_materials_total: 0,
            material_commission_amount: 0,
            total_item_price: round2(fc.color_additional_cost),
            internal_cost: 0,
            gross_profit: round2(fc.color_additional_cost),
            gross_margin: 100,
            membership_price: 0,
            crew_size_required: 0,
            labor_phases: '',
            required_equipment: '',
            scope_of_work: '',
            proposal_tier: 'standalone',
            proposal_customer_benefits: '',
            proposal_warranty_messaging: '',
            proposal_estimated_duration: '',
            is_service_only: true,
            status: 'ready',
            sort_order: draftItems.length,
            committed_work_key: `cap-color-premium:${linkedRec.id}:${fc.selected_color.id}`,
            cap_snapshot_ref: linkedRec?.id || '',
          });
        }

        // Flue Tile Cut-Down prerequisite service
        if (capSnapshot.flue_tile_prerequisite?.prerequisite_service) {
          const cutDown = capSnapshot.flue_tile_prerequisite.prerequisite_service;
          for (const affectedFlue of cutDown.affected_flues || []) {
            const flueId = affectedFlue.flue_identifier || `flue-${affectedFlue.flue_index}`;
            draftItems.push({
              estimate_id: '',
              job_id: jobId,
              appointment_id: todayAppt?.id || '',
              inspection_id: inspectionSetup?.id || '',
              customer_id: job.customer_id || '',
              recommendation_review_id: recReview?.id || '',
              recommendation_review_item_id: item.id,
              repair_system_recommendation_id: linkedRec?.id || '',
              repair_recommendation_template_id: template?.id || '',
              finding_id: item.finding_id || '',
              finding_type: 'InspectionFinding',
              deficiency_type: 'flue_tile_cutdown',
              severity: 'moderate',
              source_title: `Flue Tile Cut-Down — ${flueId}`,
              source_description: `Cut down ${flueId} from ${affectedFlue.original_projection}" to ${affectedFlue.planned_final_projection}" before installing ${affectedFlue.required_cap_height}" cap.`,
              service_catalog_id: '',
              service_name: `Cut Down Terracotta Flue Tile (${flueId})`,
              service_code: 'FLUE-CUT',
              service_description: `Cut down ${flueId} from ${affectedFlue.original_projection}" to ${affectedFlue.planned_final_projection}" projection. Required before installing the ${affectedFlue.required_cap_height}" multi-flue cap.`,
              customer_facing_summary: `Prerequisite: cut down ${flueId} to ${affectedFlue.planned_final_projection}" before cap installation.`,
              customer_description: `Flue tile cut-down required for ${flueId}: reduce from ${affectedFlue.original_projection}" to ${affectedFlue.planned_final_projection}".`,
              estimated_time_hours: 1,
              estimated_time_minutes: 0,
              service_price: 0,
              quantity: 1,
              service_commission_type: 'none',
              service_commission_value: 0,
              service_commission_amount: 0,
              materials: JSON.stringify([]),
              chargeable_materials_total: 0,
              internal_materials_total: 0,
              material_commission_amount: 0,
              total_item_price: 0,
              internal_cost: 0,
              gross_profit: 0,
              gross_margin: 0,
              membership_price: 0,
              crew_size_required: 1,
              labor_phases: '',
              required_equipment: '',
              scope_of_work: JSON.stringify({
                work_phases: [{
                  phase_name: `Cut down ${flueId}`,
                  estimated_hours: 1,
                  tasks: [
                    `Measure current flue tile projection: ${affectedFlue.original_projection}"`,
                    `Cut down to ${affectedFlue.planned_final_projection}" projection`,
                    `Verify ${affectedFlue.required_cap_height}" cap fits over cut tile`,
                  ],
                }],
                safety_notes: ['Wear eye protection when cutting tile.'],
                cleanup_tasks: ['Remove tile debris from crown area.'],
                internal_notes: `Required prerequisite for ${capSnapshot.matrix_name || 'multi-flue cap'}.`,
              }),
              proposal_tier: 'standalone',
              proposal_customer_benefits: '',
              proposal_warranty_messaging: '',
              proposal_estimated_duration: '',
              is_service_only: true,
              status: 'ready',
              sort_order: draftItems.length,
              committed_work_key: `cap-cutdown:${linkedRec.id}:${flueId}`,
              cap_snapshot_ref: linkedRec?.id || '',
            });
          }
        }
      }

      // --- Block cap estimate when configuration is unresolved/outdated/unconfirmed ---
      if (capSnapshot && capConfigStatus && capConfigStatus !== 'confirmed') {
        // Override the main item status to block automatic approval
        draftItems[draftItems.length - 1 - (
          // Count how many cap items we just added (finish, color, cutdowns)
          (capSnapshot.finish_configuration?.finish_type === 'powder_coated' ? 1 : 0) +
          (capSnapshot.finish_configuration?.color_additional_cost > 0 ? 1 : 0) +
          (capSnapshot.flue_tile_prerequisite?.prerequisite_service?.affected_flues?.length || 0)
        )].status = 'manual_review';
        diagnostic.errors.push(`Cap configuration is ${capConfigStatus} — technician must confirm cap selection before estimate can be approved.`);
      }

    } // end for each matchResult

    // 8. Check for existing estimate
    const existingEstimates = await base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
    let estimate = existingEstimates.find(e => e.status === 'draft' || e.status === 'pending_review') || existingEstimates[0] || null;

    // 9. Calculate estimate totals
    const subtotal = draftItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0);
    const totalEstimatedMinutes = draftItems.reduce((sum, i) => sum + (i.estimated_time_hours * 60 + i.estimated_time_minutes), 0);
    const uniqueFindingIds = [...new Set(allFindingIds)];

    // 10. Create or update estimate
    const lineItemsJson = JSON.stringify(draftItems.map(i => ({
      description: i.service_name,
      customer_description: i.customer_facing_summary,
      quantity: i.quantity,
      unit: 'ea',
      unit_price: i.service_price,
      line_total: i.total_item_price,
      option_tier: 'standalone',
      customer_facing: true,
      needs_pricebook_mapping: i.status === 'manual_review',
    })));

    const estimateFields = {
      line_items: lineItemsJson,
      subtotal: round2(subtotal),
      tax_rate: 0,
      tax_amount: 0,
      total: round2(subtotal),
      total_estimated_hours: round2(totalEstimatedMinutes / 60),
      repair_system_recommendation_ids: repairRecs.map(r => r.id),
      finding_ids: uniqueFindingIds,
    };

    if (!estimate) {
      estimate = await base44.entities.Estimate.create({
        job_id: jobId,
        appointment_id: todayAppt?.id || '',
        inspection_id: inspectionSetup?.id || '',
        inspection_setup_id: inspectionSetup?.id || '',
        property_profile_id: propertyProfile?.id || '',
        customer_id: job.customer_id || '',
        customer_name: job.customer_name || '',
        ...estimateFields,
        status: 'draft',
        total_job_days: 0,
        notes: '',
        valid_until: '',
      });
    } else {
      estimate = await base44.entities.Estimate.update(estimate.id, {
        ...estimateFields,
        status: 'draft',
      });
    }

    // 11. Set estimate_id on all draft items and upsert
    //     Items with committed_work_key are upserted (update if exists, create if not) for idempotency
    //     Items without committed_work_key are created fresh
    for (const di of draftItems) {
      di.estimate_id = estimate.id;
    }

    const toCreate = [];
    const toUpdate = [];
    for (const di of draftItems) {
      if (di.committed_work_key && existingByKey[di.committed_work_key]) {
        // Update existing item by committed_work_key
        const existing = existingByKey[di.committed_work_key];
        toUpdate.push({
          id: existing.id,
          estimate_id: estimate.id,
          service_name: di.service_name,
          service_price: di.service_price,
          materials: di.materials,
          chargeable_materials_total: di.chargeable_materials_total,
          total_item_price: di.total_item_price,
          customer_description: di.customer_description,
          customer_facing_summary: di.customer_facing_summary,
          status: di.status,
          scope_of_work: di.scope_of_work,
        });
      } else {
        toCreate.push(di);
      }
    }

    let createdItems = [];
    if (toCreate.length > 0) {
      createdItems = await base44.entities.DraftEstimateItem.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      await base44.entities.DraftEstimateItem.bulkUpdate(toUpdate);
    }
    const allProcessedItems = [...createdItems, ...toUpdate];

    // 12. Link estimate_id back to recommendations
    for (const rec of repairRecs) {
      if (rec.estimate_status !== 'estimate_created') {
        await base44.entities.RepairSystemRecommendation.update(rec.id, {
          estimate_id: estimate.id,
          estimate_status: 'estimate_created',
        }).catch(() => {});
      }
    }

    // 13. Update diagnostic counts
    diagnostic.draft_estimate_id = estimate.id;
    diagnostic.draft_estimate_item_count = draftItems.length;
    diagnostic.items_ready = draftItems.filter(i => i.status === 'ready').length;
    diagnostic.items_suggested = draftItems.filter(i => i.status === 'suggested_service').length;
    diagnostic.items_manual_review = draftItems.filter(i => i.status === 'manual_review').length;
    diagnostic.items_missing_price = draftItems.filter(i => i.status === 'missing_price').length;
    diagnostic.proposal_option_templates_found = allProposalOptions.length;

    return Response.json({
      status: 'success',
      message: `Draft estimate built with ${draftItems.length} item(s). Ready: ${diagnostic.items_ready}, Suggested: ${diagnostic.items_suggested}, Manual Review: ${diagnostic.items_manual_review}, Missing Price: ${diagnostic.items_missing_price}`,
      estimate_id: estimate.id,
      diagnostic,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Template Matching ---

function findMatchingTemplate(item, templates) {
  const itemDefType = (item.deficiency_type || '').toLowerCase().trim();
  const itemSeverity = (item.severity || '').toLowerCase().trim();
  const itemTitle = (item.title || '').toLowerCase();
  const itemDescription = (item.description || item.customer_summary || '').toLowerCase();
  const itemCategory = (item.category || item.interior_exterior || '').toLowerCase();

  const matches = [];

  for (const tpl of templates) {
    let score = 0;
    const reasons = [];

    // Deficiency type match (strongest signal)
    const tplDefType = (tpl.deficiency_type || '').toLowerCase().trim();
    if (tplDefType && tplDefType === itemDefType) {
      score += 10;
      reasons.push('deficiency_type exact match');
    } else if (tplDefType && itemDefType && (itemDefType.includes(tplDefType) || tplDefType.includes(itemDefType))) {
      score += 7;
      reasons.push('deficiency_type partial match');
    }

    // Severity filter — if template specifies severity, it must match exactly
    const tplSeverity = (tpl.severity || '').toLowerCase().trim();
    if (tplSeverity) {
      if (tplSeverity === itemSeverity) {
        score += 5;
        reasons.push('severity match');
      } else {
        // Template has a severity filter but finding doesn't match — skip this template
        continue;
      }
    }

    // Finding keywords match
    const keywords = (tpl.finding_keywords || '')
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    let keywordHits = 0;
    for (const kw of keywords) {
      if (itemTitle.includes(kw) || itemDescription.includes(kw) || itemDefType.includes(kw)) {
        keywordHits++;
      }
    }
    if (keywords.length > 0 && keywordHits > 0) {
      score += keywordHits * 3;
      reasons.push(`${keywordHits} keyword(s) matched`);
    }

    // Inspection category match
    const tplCategory = (tpl.inspection_category || '').toLowerCase().trim();
    if (tplCategory && itemCategory) {
      if (tplCategory === itemCategory) {
        score += 4;
        reasons.push('category match');
      } else if (itemCategory.includes(tplCategory) || tplCategory.includes(itemCategory)) {
        score += 2;
        reasons.push('category partial match');
      }
    }

    // Inspection section match
    const tplSection = (tpl.inspection_section || '').toLowerCase().trim();
    if (tplSection && itemCategory) {
      if (tplSection === itemCategory) {
        score += 3;
        reasons.push('section match');
      }
    }

    if (score > 0) {
      matches.push({ template: tpl, score, reasons });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// --- Helper functions ---

function matchService(item, linkedRec, serviceCatalog) {
  // 1. Try direct match by pricebook_item_name from the review item
  if (item.pricebook_item_name) {
    const pbName = item.pricebook_item_name.toLowerCase().trim();
    const direct = serviceCatalog.find(s =>
      s.service_name?.toLowerCase().trim() === pbName ||
      s.service_code?.toLowerCase().trim() === pbName
    );
    if (direct) return { service: direct, matchType: 'user_selected' };

    const partial = serviceCatalog.find(s =>
      s.service_name?.toLowerCase().includes(pbName) ||
      pbName.includes(s.service_name?.toLowerCase())
    );
    if (partial) return { service: partial, matchType: 'user_selected' };
  }

  // 2. Try keyword matching by deficiency_type, title, recommended_solution, repair_system_type
  const keywords = [
    item.deficiency_type,
    item.title,
    item.recommended_solution,
    linkedRec?.recommendation_title,
    linkedRec?.repair_system_type,
  ].filter(k => k && k.trim()).map(k => k.toLowerCase());

  let bestMatch = null;
  let bestScore = 0;

  for (const svc of serviceCatalog) {
    const svcText = [
      svc.service_name,
      svc.service_code,
      svc.category,
      svc.description,
      svc.customer_description,
    ].filter(t => t).join(' ').toLowerCase();

    let score = 0;
    for (const keyword of keywords) {
      if (!keyword) continue;
      const words = keyword.split(/[\s\/\-_]+/).filter(w => w.length > 2);
      for (const word of words) {
        if (svcText.includes(word)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = svc;
    }
  }

  if (bestMatch && bestScore >= 2) {
    return { service: bestMatch, matchType: 'suggested' };
  }

  return { service: null, matchType: 'none' };
}

function buildMaterials(template, service, inventoryMap) {
  const materials = [];

  // 1. Default materials from template (chargeable, required)
  if (template?.default_materials) {
    try {
      const raw = JSON.parse(template.default_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          const inv = m.material_id ? inventoryMap[m.material_id] : null;
          materials.push({
            material_id: m.material_id || '',
            material_name: m.material_name || inv?.item_name || '',
            quantity: m.quantity || 1,
            unit: m.unit || 'ea',
            unit_price: m.unit_price || (inv?.unit_cost || 0),
            chargeable_to_customer: m.chargeable_to_customer !== false,
            customer_visible: m.customer_visible !== false,
            commission_type: m.commission_type || template.service_commission_type || service?.material_commission_type || 'none',
            commission_value: m.commission_value || template.service_commission_value || service?.material_commission_value || 0,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Internal materials from template (non-chargeable, tracked internally)
  if (template?.internal_materials) {
    try {
      const raw = JSON.parse(template.internal_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          const inv = m.material_id ? inventoryMap[m.material_id] : null;
          materials.push({
            material_id: m.material_id || '',
            material_name: m.material_name || inv?.item_name || '',
            quantity: m.quantity || 1,
            unit: m.unit || 'ea',
            unit_price: m.unit_price || (inv?.unit_cost || 0),
            chargeable_to_customer: false,
            customer_visible: false,
            commission_type: 'none',
            commission_value: 0,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Fallback: service default materials (if no template materials)
  if (materials.length === 0 && service?.default_materials) {
    try {
      const raw = JSON.parse(service.default_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          const inv = m.material_id ? inventoryMap[m.material_id] : null;
          materials.push({
            material_id: m.material_id || '',
            material_name: m.material_name || inv?.item_name || '',
            quantity: m.quantity || 1,
            unit: m.unit || 'ea',
            unit_price: m.unit_price || (inv?.unit_cost || 0),
            chargeable_to_customer: m.chargeable_to_customer !== false,
            customer_visible: m.customer_visible !== false,
            commission_type: m.commission_type || service.material_commission_type || 'none',
            commission_value: m.commission_value || service.material_commission_value || 0,
          });
        }
      }
    } catch { /* ignore */ }
  }

  const chargeableMaterialsTotal = materials
    .filter(m => m.chargeable_to_customer !== false)
    .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
  const internalMaterialsTotal = materials
    .filter(m => m.chargeable_to_customer === false)
    .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);

  return { materials, chargeableMaterialsTotal, internalMaterialsTotal };
}

function calculateCommission(type, value, price) {
  if (!type || type === 'none') return 0;
  if (type === 'percentage') return round2((price * (value || 0)) / 100);
  if (type === 'flat_dollar') return round2(value || 0);
  return 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}