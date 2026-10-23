import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DEFAULT_SETTINGS = {
  default_crown_thickness_inches: 4,
  default_bag_weight_lbs: 80,
  default_yield_per_bag_cubic_feet: 0.60,
  small_form_max_inches: 28.01,
  medium_form_max_inches: 56,
  large_form_max_inches: 92,
  foam_package_length_inches: 192,
};

function classifyForm(dim, settings) {
  if (dim <= settings.small_form_max_inches) return 'Small Forms';
  if (dim <= settings.medium_form_max_inches) return 'Medium Forms';
  if (dim <= settings.large_form_max_inches) return 'Large Forms';
  return 'Custom Wood Forms';
}

function runCalculation(measurements, settings) {
  const crownLength = Number(measurements.crown_form_length) || 0;
  const crownWidth = Number(measurements.crown_form_width) || 0;
  const flues = measurements.flues || [];
  const thickness = Number(measurements.crown_thickness ?? settings.default_crown_thickness_inches);

  const grossArea = crownLength * crownWidth;
  const totalFlueArea = flues.reduce((s, f) => s + (Number(f.length) * Number(f.width)), 0);
  const netArea = grossArea - totalFlueArea;
  const cubicFeet = (netArea * thickness) / 1728;
  const rawBags = cubicFeet / settings.default_yield_per_bag_cubic_feet;
  const bagsRequired = Math.ceil(rawBags);
  const wireGridLength = crownLength - 2;
  const wireGridWidth = crownWidth - 2;
  const totalFoam = flues.reduce((s, f) => s + (2 * Number(f.length) + 2 * Number(f.width) + 6), 0);
  const foamLinearFeet = totalFoam / 12;
  const foamPurchaseQty = settings.foam_package_length_inches > 0 ? Math.ceil(totalFoam / settings.foam_package_length_inches) : 0;
  const formSizeLength = classifyForm(crownLength, settings);
  const formSizeWidth = classifyForm(crownWidth, settings);

  const measurementHash = `${crownLength}|${crownWidth}|${thickness}|${flues.map(f => f.length + 'x' + f.width).join(',')}|${measurements.removing_brick_courses}|${measurements.crown_step_in}`;

  return {
    gross_crown_area: grossArea, total_flue_area: totalFlueArea, net_crown_area: netArea,
    concrete_cubic_feet: cubicFeet, raw_concrete_bags: rawBags, concrete_bags_required: bagsRequired,
    wire_grid_length: wireGridLength, wire_grid_width: wireGridWidth,
    total_foam_inches: totalFoam, total_foam_linear_feet: foamLinearFeet, foam_purchase_quantity: foamPurchaseQty,
    crown_form_size_length: formSizeLength, crown_form_size_width: formSizeWidth,
    measurement_hash: measurementHash,
  };
}

function buildMaterials(calc, settings) {
  return [
    { material_id: settings.concrete_material_id || '', material_name: `Concrete (${settings.default_bag_weight_lbs}lb bags)`,
      quantity: calc.concrete_bags_required, unit: 'bag', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
      calculation_detail: `${calc.concrete_cubic_feet.toFixed(4)} cu ft / ${settings.default_yield_per_bag_cubic_feet} yield = ${calc.raw_concrete_bags.toFixed(4)} raw → ${calc.concrete_bags_required} bags` },
    { material_id: settings.wire_grid_material_id || '', material_name: 'Wire Grid',
      quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
      calculation_detail: `${calc.wire_grid_length} × ${calc.wire_grid_width} inches (crown − 2in each side)` },
    { material_id: settings.expansion_foam_material_id || '', material_name: 'Expansion Foam',
      quantity: calc.foam_purchase_quantity, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
      calculation_detail: `${calc.total_foam_inches} in (${calc.total_foam_linear_feet.toFixed(2)} linear ft) → ${calc.foam_purchase_quantity} packages`,
      unrounded_inches: calc.total_foam_inches, unrounded_linear_feet: calc.total_foam_linear_feet },
    { material_id: '', material_name: `Crown Form — Length (${calc.crown_form_size_length})`,
      quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true },
    { material_id: '', material_name: `Crown Form — Width (${calc.crown_form_size_width})`,
      quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true },
  ];
}

async function pushCalculatedMaterials(base44, jobId, calc, settings, job) {
  const materials = buildMaterials(calc, settings);
  const results = { materials, items_updated: 0, items_created: 0 };

  // Find existing DraftEstimateItem for this job
  let estimateItems = [];
  if (calc.repair_template_id) {
    estimateItems = await base44.asServiceRole.entities.DraftEstimateItem.filter({ job_id: jobId, repair_recommendation_template_id: calc.repair_template_id });
  }
  if (estimateItems.length === 0) {
    estimateItems = await base44.asServiceRole.entities.DraftEstimateItem.filter({ job_id: jobId });
  }

  if (estimateItems.length > 0) {
    const item = estimateItems[0];
    await base44.asServiceRole.entities.DraftEstimateItem.update(item.id, { materials: JSON.stringify(materials) });
    results.items_updated = 1;
    results.estimate_item_id = item.id;

    // Update Scope of Work if it exists for this job
    const scopes = await base44.asServiceRole.entities.ScopeOfWork.filter({ job_id: jobId });
    if (scopes.length > 0) {
      const scope = scopes[0];
      await base44.asServiceRole.entities.ScopeOfWork.update(scope.id, { required_materials: JSON.stringify(materials) });
      results.scope_of_work_id = scope.id;
    }
  } else {
    // Create a DraftEstimateItem — requires an estimate_id
    let estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id: jobId });
    let estimateId = '';
    if (estimates.length > 0) {
      estimateId = estimates[0].id;
    } else {
      const newEst = await base44.asServiceRole.entities.Estimate.create({
        job_id: jobId, customer_id: job?.customer_id || '', customer_name: job?.customer_name || '',
        status: 'draft', line_items: '[]', subtotal: 0, total: 0,
      });
      estimateId = newEst.id;
    }
    const newItem = await base44.asServiceRole.entities.DraftEstimateItem.create({
      estimate_id: estimateId, job_id: jobId, customer_id: job?.customer_id || '',
      repair_recommendation_template_id: calc.repair_template_id || '',
      service_name: 'Install New Concrete Crown', source_title: 'Crown Calculation',
      materials: JSON.stringify(materials), status: 'manual_review', quantity: 1,
    });
    results.items_created = 1;
    results.estimate_item_id = newItem.id;
    results.estimate_id = estimateId;
  }

  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { job_id, measurements, crown_calculation_id, repair_template_id, property_asset_id, property_asset_name, inspection_finding_id, push_materials = false } = body;

    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    // Fetch settings
    const settingsList = await base44.asServiceRole.entities.CrownCalculationSettings.list();
    const settings = (settingsList && settingsList.length > 0) ? settingsList[0] : DEFAULT_SETTINGS;

    // Fetch job data for auto-population
    const job = await base44.asServiceRole.entities.Job.get(job_id);
    const customerAddress = [job?.address, job?.city, job?.state, job?.zip].filter(Boolean).join(', ');
    const technician = job?.lead_technician_name || job?.technician_name || job?.lead_technician_email || '';

    // Run calculations
    const calc = runCalculation(measurements || {}, settings);

    // Find existing calculation
    let existingCalc = null;
    if (crown_calculation_id) {
      existingCalc = await base44.asServiceRole.entities.CrownCalculation.get(crown_calculation_id);
    } else {
      const existing = await base44.asServiceRole.entities.CrownCalculation.filter({ job_id });
      if (existing && existing.length > 0) existingCalc = existing[0];
    }

    // Check proposal lock — do not silently modify presented/accepted proposals
    if (existingCalc && existingCalc.proposal_option_id) {
      try {
        const proposal = await base44.asServiceRole.entities.ProposalOptionTemplate.get(existingCalc.proposal_option_id);
        if (proposal && ['presented', 'accepted'].includes(proposal.option_status)) {
          return Response.json({ error: 'Cannot modify a calculation linked to a presented or accepted proposal. Create a new revision instead.', proposal_locked: true }, { status: 409 });
        }
      } catch { /* proposal may have been deleted */ }
    }

    // Determine status
    let status = 'confirmed';
    let outdatedReason = '';
    let outdatedAt = existingCalc?.outdated_at;
    if (existingCalc && existingCalc.measurement_hash && existingCalc.measurement_hash !== calc.measurement_hash) {
      status = 'outdated';
      outdatedReason = 'Measurements changed since last confirmation';
      outdatedAt = new Date().toISOString();
    }

    // Build CrownCalculation record
    const calcData = {
      job_id,
      appointment_id: existingCalc?.appointment_id || '',
      customer_id: job?.customer_id || existingCalc?.customer_id || '',
      customer_name: job?.customer_name || existingCalc?.customer_name || '',
      customer_address: customerAddress,
      technician,
      property_asset_id: property_asset_id || existingCalc?.property_asset_id || '',
      property_asset_name: property_asset_name || existingCalc?.property_asset_name || '',
      calculation_date: new Date().toISOString(),
      repair_template_id: repair_template_id || existingCalc?.repair_template_id || '',
      repair_template_name: existingCalc?.repair_template_name || '',
      inspection_finding_id: inspection_finding_id || existingCalc?.inspection_finding_id || '',
      inspection_id: existingCalc?.inspection_id || '',
      crown_form_length: Number(measurements?.crown_form_length) || 0,
      crown_form_width: Number(measurements?.crown_form_width) || 0,
      crown_thickness: Number(measurements?.crown_thickness ?? settings.default_crown_thickness_inches),
      flues_json: JSON.stringify(measurements?.flues || []),
      flue_count: (measurements?.flues || []).length,
      removing_brick_courses: measurements?.removing_brick_courses || false,
      crown_step_in: measurements?.crown_step_in || false,
      gross_crown_area: calc.gross_crown_area,
      total_flue_area: calc.total_flue_area,
      net_crown_area: calc.net_crown_area,
      concrete_cubic_feet: calc.concrete_cubic_feet,
      raw_concrete_bags: calc.raw_concrete_bags,
      concrete_bags_required: calc.concrete_bags_required,
      wire_grid_length: calc.wire_grid_length,
      wire_grid_width: calc.wire_grid_width,
      total_foam_inches: calc.total_foam_inches,
      total_foam_linear_feet: calc.total_foam_linear_feet,
      foam_purchase_quantity: calc.foam_purchase_quantity,
      crown_form_size_length: calc.crown_form_size_length,
      crown_form_size_width: calc.crown_form_size_width,
      calculation_snapshot_json: JSON.stringify(calc),
      settings_snapshot_json: JSON.stringify(settings),
      status,
      measurement_source: existingCalc?.measurement_source || 'inspection',
      measurement_hash: calc.measurement_hash,
      outdated_reason: outdatedReason,
      outdated_at: outdatedAt,
      updated_by: user.email || user.full_name || '',
    };

    let savedCalc;
    if (existingCalc) {
      savedCalc = await base44.asServiceRole.entities.CrownCalculation.update(existingCalc.id, calcData);
    } else {
      calcData.created_by = user.email || user.full_name || '';
      savedCalc = await base44.asServiceRole.entities.CrownCalculation.create(calcData);
    }

    // Push materials if requested
    let materialPushResult = null;
    if (push_materials && status !== 'outdated') {
      materialPushResult = await pushCalculatedMaterials(base44, job_id, savedCalc, settings, job);
      await base44.asServiceRole.entities.CrownCalculation.update(savedCalc.id, {
        materials_pushed: true,
        materials_pushed_at: new Date().toISOString(),
      });
    }

    return Response.json({ success: true, calculation: savedCalc, materials_pushed: materialPushResult });
  } catch (error) {
    console.error('calculateCrownMaterials error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});