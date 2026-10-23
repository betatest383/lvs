import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role invocation */ }

    const body = await req.json();
    const { inspection_id, job_id } = body;

    if (!inspection_id && !job_id) {
      return Response.json({ error: 'inspection_id or job_id is required' }, { status: 400 });
    }

    // 1. Load findings — guardrails: exclude internal-only, non-deficiency observations
    const findingQuery = inspection_id ? { inspection_id } : { job_id };
    const findings = await base44.asServiceRole.entities.InspectionFinding.filter(findingQuery);

    const eligibleFindings = findings.filter(f =>
      f.include_in_estimate !== false &&
      f.internal_only !== true &&
      f.is_deficiency !== false
    );

    if (eligibleFindings.length === 0) {
      return Response.json({
        status: 'success',
        message: 'No eligible findings to generate recommendations from.',
        recommendations_created: 0,
      });
    }

    // 2. Load pricebook mappings
    const mappings = await base44.asServiceRole.entities.FindingPricebookMapping.filter({ is_active: true });

    // 3. Match findings to mappings and build recommendations
    const recommendations = [];
    let recCounter = 0;

    for (const finding of eligibleFindings) {
      const matches = mappings.filter(m => {
        if (m.deficiency_type !== finding.deficiency_type) return false;
        // Severity filter
        if (m.severity_filter) {
          let severities = [];
          try { severities = JSON.parse(m.severity_filter); } catch { /* ignore */ }
          if (Array.isArray(severities) && severities.length > 0 && !severities.includes(finding.severity)) {
            return false;
          }
        }
        // Appliance/system filter
        if (m.appliance_system_type && finding.appliance_system_type &&
            m.appliance_system_type !== finding.appliance_system_type) {
          return false;
        }
        return true;
      });

      // Parse measurements
      let measurements = {};
      try { measurements = JSON.parse(finding.measurements || '{}'); } catch { /* ignore */ }

      // Parse customer-facing photos (exclude internal-only)
      const customerPhotos = (finding.photo_urls || []).filter(
        url => !(finding.photos_internal_only || []).includes(url)
      );

      if (matches.length === 0) {
        // No mapping — create a pending recommendation with finding data for technician to resolve
        recCounter++;
        recommendations.push({
          recommendation_id: `REC-${Date.now()}-${recCounter}`,
          inspection_id: finding.inspection_id || inspection_id || '',
          job_id: finding.job_id || job_id || '',
          customer_id: finding.customer_id || '',
          customer_name: finding.customer_name || '',
          finding_ids: JSON.stringify([finding.id]),
          deficiency_type: finding.deficiency_type,
          option_group: finding.recommended_repair || finding.deficiency_type,
          option_tier: 'standalone',
          option_label: finding.recommended_repair || 'Unmapped — manual review needed',
          pricebook_item_name: finding.recommended_repair || 'Manual Review Required',
          quantity: 1,
          unit: 'ea',
          unit_price: 0,
          line_total: 0,
          photo_urls: customerPhotos,
          customer_description: finding.customer_facing_explanation || '',
          notes: 'No pricebook mapping found. Technician must assign item manually.',
          status: 'pending',
          source: 'auto',
          created_by: user?.email || 'system',
        });
        continue;
      }

      // Group matches by option_group
      const groups = {};
      for (const m of matches) {
        const group = m.option_group || finding.deficiency_type;
        if (!groups[group]) groups[group] = [];
        groups[group].push(m);
      }

      for (const [groupName, groupMappings] of Object.entries(groups)) {
        // Sort by tier: good < better < best < standalone
        const tierOrder = { good: 0, better: 1, best: 2, standalone: 3 };
        groupMappings.sort((a, b) => (tierOrder[a.option_tier] ?? 3) - (tierOrder[b.option_tier] ?? 3));

        for (const m of groupMappings) {
          recCounter++;
          // Calculate quantity from measurement if configured
          let quantity = m.default_quantity || 1;
          if (m.quantity_from_measurement && measurements[m.quantity_from_measurement] != null) {
            const measVal = parseFloat(measurements[m.quantity_from_measurement]) || 0;
            quantity = Math.ceil(measVal * (m.quantity_multiplier || 1));
          }

          const lineTotal = quantity * (m.unit_price || 0);

          // Build customer description
          let customerDesc = m.customer_description_template || m.report_language || '';
          if (!customerDesc && finding.customer_facing_explanation) {
            customerDesc = finding.customer_facing_explanation;
          }

          recommendations.push({
            recommendation_id: `REC-${Date.now()}-${recCounter}`,
            inspection_id: finding.inspection_id || inspection_id || '',
            job_id: finding.job_id || job_id || '',
            customer_id: finding.customer_id || '',
            customer_name: finding.customer_name || '',
            finding_ids: JSON.stringify([finding.id]),
            deficiency_type: finding.deficiency_type,
            option_group: groupName,
            option_tier: m.option_tier || 'standalone',
            option_label: m.option_label || m.pricebook_item_name,
            pricebook_item_name: m.pricebook_item_name,
            pricebook_item_id: m.pricebook_item_id || '',
            quantity,
            unit: m.unit || 'ea',
            unit_price: m.unit_price || 0,
            line_total: lineTotal,
            photo_urls: customerPhotos,
            customer_description: customerDesc,
            material_calculation: m.material_calculation || '',
            notes: '',
            is_upgrade: m.option_tier === 'best',
            status: 'pending',
            source: 'auto',
            created_by: user?.email || 'system',
          });
        }
      }
    }

    // 4. Delete old pending recommendations for this inspection/job (regeneration)
    const oldRecs = await base44.asServiceRole.entities.EstimateRecommendation.filter({
      ...(inspection_id ? { inspection_id } : { job_id }),
      status: 'pending',
    });
    for (const old of oldRecs) {
      await base44.asServiceRole.entities.EstimateRecommendation.delete(old.id);
    }

    // 5. Create new recommendations
    let created = [];
    if (recommendations.length > 0) {
      created = await base44.asServiceRole.entities.EstimateRecommendation.bulkCreate(recommendations);
    }

    // 6. Mark findings as recommendations_generated
    for (const finding of eligibleFindings) {
      await base44.asServiceRole.entities.InspectionFinding.update(finding.id, {
        recommendations_generated: true,
      });
    }

    return Response.json({
      status: 'success',
      findings_processed: eligibleFindings.length,
      recommendations_created: created.length,
      recommendations: created,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});