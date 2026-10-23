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
      accepted_recommendations_count: 0,
      recommendations_missing_pricebook_mapping: [],
      estimate_payload: null,
      estimate_create_response: null,
      created_estimate_id: null,
      workflow_link_update_result: null,
      existing_estimate_found: false,
      links_updated: 0,
      errors: [],
    };

    // 1. Load job
    const job = await base44.entities.Job.get(jobId).catch(() => null);
    if (!job) {
      diagnostic.errors.push('Job not found');
      return Response.json({ status: 'error', error: 'Job not found', diagnostic }, { status: 404 });
    }

    // 2. Load accepted RepairSystemRecommendations
    const allRecs = await base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []);
    const acceptedRecs = allRecs.filter(r => r.estimate_status === 'accepted');
    diagnostic.accepted_recommendations_count = acceptedRecs.length;

    if (acceptedRecs.length === 0) {
      return Response.json({
        status: 'error',
        error: 'No accepted repair system recommendations found. Accept at least one recommendation before creating an estimate.',
        diagnostic,
      }, { status: 400 });
    }

    // 3. Check for existing draft estimate (avoid duplicates)
    const existingEstimates = await base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
    const existingDraft = existingEstimates.find(e => e.status === 'draft' || e.status === 'pending_review');
    if (existingDraft) {
      diagnostic.existing_estimate_found = true;
      diagnostic.created_estimate_id = existingDraft.id;

      // Still link recommendations to existing estimate if not linked
      const recsToLink = acceptedRecs.filter(r => r.estimate_id !== existingDraft.id);
      const recIds = acceptedRecs.map(r => r.id);
      const findingIds = [];
      for (const rec of acceptedRecs) {
        try {
          const related = JSON.parse(rec.related_findings || '[]');
          if (Array.isArray(related)) findingIds.push(...related);
        } catch { /* ignore */ }
      }

      // Update estimate with full linkage if missing
      const updatePayload = {};
      if (!existingDraft.repair_system_recommendation_ids || existingDraft.repair_system_recommendation_ids.length === 0) {
        updatePayload.repair_system_recommendation_ids = recIds;
      }
      if (!existingDraft.finding_ids || existingDraft.finding_ids.length === 0) {
        updatePayload.finding_ids = [...new Set(findingIds)];
      }
      if (Object.keys(updatePayload).length > 0) {
        const updated = await base44.entities.Estimate.update(existingDraft.id, updatePayload).catch(e => {
          diagnostic.errors.push(`Failed to update existing estimate links: ${e.message}`);
          return null;
        });
        diagnostic.workflow_link_update_result = updated ? 'updated_existing' : 'update_failed';
      } else {
        diagnostic.workflow_link_update_result = 'already_linked';
      }

      // Link estimate_id back to recommendations
      for (const rec of recsToLink) {
        await base44.entities.RepairSystemRecommendation.update(rec.id, { estimate_id: existingDraft.id, estimate_status: 'estimate_created' }).catch(() => {});
        diagnostic.links_updated++;
      }

      return Response.json({
        status: 'success',
        message: 'Draft estimate already exists for this job. Recommendations linked.',
        estimate_id: existingDraft.id,
        diagnostic,
      });
    }

    // 4. Load supporting data: inspection setup, findings, appointment, property profile, customer
    const [setups, inspectionFindings, legacyFindings, appointments, propertyProfiles] = await Promise.all([
      base44.entities.InspectionSetup.filter({ job_id: jobId }).catch(() => []),
      base44.entities.InspectionFinding.filter({ job_id: jobId }).catch(() => []),
      base44.entities.Finding.filter({ job_id: jobId }).catch(() => []),
      base44.entities.Appointment.filter({ job_id: jobId }).catch(() => []),
      base44.entities.PropertyProfile.filter({ customer_id: job.customer_id || '' }).catch(() => []),
    ]);

    const inspectionSetup = setups[0] || null;
    const propertyProfile = propertyProfiles[0] || null;

    // Resolve today's appointment
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayAppt = appointments.find(a => a.status === 'started' || a.status === 'dispatched')
      || appointments.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr)
      || appointments[0]
      || null;

    // 5. Build line items from accepted recommendations
    const lineItems = [];
    const allFindingIds = [];
    const allPhotos = [];
    const internalNotes = [];

    for (const rec of acceptedRecs) {
      // Collect finding IDs
      try {
        const related = JSON.parse(rec.related_findings || '[]');
        if (Array.isArray(related)) allFindingIds.push(...related);
      } catch { /* ignore */ }

      // Collect photos
      if (Array.isArray(rec.related_photos)) allPhotos.push(...rec.related_photos);

      // Collect internal notes
      if (rec.internal_technician_notes) {
        internalNotes.push(`[${rec.recommendation_title}]: ${rec.internal_technician_notes}`);
      }

      // Parse Good/Better/Best options
      let options = [];
      try { options = JSON.parse(rec.good_better_best_options || '[]'); } catch { /* ignore */ }

      const selectedTier = rec.selected_option_tier && rec.selected_option_tier !== 'none'
        ? rec.selected_option_tier : null;

      // Find the selected option, or fall back to first option
      let selectedOption = null;
      if (selectedTier) {
        selectedOption = options.find(o => o.tier === selectedTier);
      }
      if (!selectedOption && options.length > 0) {
        selectedOption = options[0];
      }

      if (!selectedOption) {
        diagnostic.recommendations_missing_pricebook_mapping.push({
          recommendation_id: rec.id,
          recommendation_title: rec.recommendation_title,
          reason: 'No Good/Better/Best options available and no pricebook item mapped',
          selected_tier: rec.selected_option_tier,
        });
        // Still add a placeholder line item so the estimate is not empty
        lineItems.push({
          recommendation_id: rec.id,
          repair_system_type: rec.repair_system_type,
          description: rec.recommendation_title || 'Repair recommendation',
          customer_description: rec.customer_facing_explanation || rec.recommendation_summary || '',
          pricebook_item_name: rec.recommendation_title || 'Pending Pricebook Mapping',
          pricebook_item_id: '',
          quantity: 1,
          unit: 'ea',
          unit_price: 0,
          line_total: 0,
          option_tier: 'standalone',
          needs_pricebook_mapping: true,
          photos: rec.related_photos || [],
        });
        continue;
      }

      const qty = selectedOption.quantity || 1;
      const unitPrice = selectedOption.unit_price || 0;
      const lineTotal = selectedOption.line_total || (qty * unitPrice);

      lineItems.push({
        recommendation_id: rec.id,
        repair_system_type: rec.repair_system_type,
        description: selectedOption.label || rec.recommendation_title,
        customer_description: selectedOption.customer_description || rec.customer_facing_explanation || '',
        pricebook_item_name: selectedOption.pricebook_item_name || '',
        pricebook_item_id: selectedOption.pricebook_item_id || '',
        quantity: qty,
        unit: selectedOption.unit || 'ea',
        unit_price: unitPrice,
        line_total: lineTotal,
        option_tier: selectedOption.tier || 'standalone',
        photos: rec.related_photos || [],
        code_references: rec.code_nfpa_references || '',
      });
    }

    // Deduplicate finding IDs
    const uniqueFindingIds = [...new Set(allFindingIds)];

    // 6. Calculate totals
    const subtotal = lineItems.reduce((sum, li) => sum + (li.line_total || 0), 0);
    const taxRate = 0; // Default — tax is configured during estimate review
    const taxAmount = 0;
    const total = subtotal + taxAmount;

    // 7. Build estimate payload
    const estimatePayload = {
      job_id: jobId,
      appointment_id: todayAppt?.id || '',
      inspection_id: inspectionSetup?.id || '',
      inspection_setup_id: inspectionSetup?.id || '',
      property_profile_id: propertyProfile?.id || '',
      customer_id: job.customer_id || '',
      customer_name: job.customer_name || '',
      repair_system_recommendation_ids: acceptedRecs.map(r => r.id),
      finding_ids: uniqueFindingIds,
      line_items: JSON.stringify(lineItems),
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      status: 'draft',
      total_job_days: 0,
      total_estimated_hours: 0,
      notes: internalNotes.length > 0 ? internalNotes.join('\n\n') : '',
      valid_until: '',
    };

    diagnostic.estimate_payload = {
      job_id: estimatePayload.job_id,
      appointment_id: estimatePayload.appointment_id,
      inspection_setup_id: estimatePayload.inspection_setup_id,
      property_profile_id: estimatePayload.property_profile_id,
      customer_id: estimatePayload.customer_id,
      line_items_count: lineItems.length,
      subtotal: estimatePayload.subtotal,
      total: estimatePayload.total,
      repair_system_recommendation_ids_count: estimatePayload.repair_system_recommendation_ids.length,
      finding_ids_count: estimatePayload.finding_ids.length,
    };

    // 8. Create the estimate
    let createdEstimate = null;
    try {
      createdEstimate = await base44.entities.Estimate.create(estimatePayload);
      diagnostic.estimate_create_response = { id: createdEstimate.id, status: createdEstimate.status };
      diagnostic.created_estimate_id = createdEstimate.id;
    } catch (e) {
      diagnostic.errors.push(`Estimate creation failed: ${e.message}`);
      diagnostic.estimate_create_response = { error: e.message };
      return Response.json({
        status: 'error',
        error: `Failed to create estimate: ${e.message}`,
        diagnostic,
      }, { status: 500 });
    }

    // 9. Link estimate_id back to the accepted recommendations
    const recUpdatePromises = acceptedRecs.map(rec =>
      base44.entities.RepairSystemRecommendation.update(rec.id, {
        estimate_id: createdEstimate.id,
        estimate_status: 'estimate_created',
      }).then(() => ({ id: rec.id, success: true }))
        .catch(e => ({ id: rec.id, success: false, error: e.message }))
    );
    const recUpdateResults = await Promise.all(recUpdatePromises);
    diagnostic.links_updated = recUpdateResults.filter(r => r.success).length;
    const failedLinks = recUpdateResults.filter(r => !r.success);
    if (failedLinks.length > 0) {
      diagnostic.errors.push(`Failed to link ${failedLinks.length} recommendation(s) back to estimate`);
    }
    diagnostic.workflow_link_update_result = {
      total: acceptedRecs.length,
      linked: diagnostic.links_updated,
      failed: failedLinks.length,
    };

    return Response.json({
      status: 'success',
      message: `Draft estimate created with ${lineItems.length} line item(s) from ${acceptedRecs.length} accepted recommendation(s).`,
      estimate_id: createdEstimate.id,
      estimate: {
        id: createdEstimate.id,
        status: createdEstimate.status,
        subtotal,
        total,
        line_items_count: lineItems.length,
      },
      diagnostic,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});