import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const { job_id, pricing_snapshot_id } = body;
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    // 1. Load the approved pricing snapshot
    let snapshot = null;
    if (pricing_snapshot_id) {
      snapshot = await base44.asServiceRole.entities.PricingCalculationSnapshot.get(pricing_snapshot_id);
    } else {
      const snapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot.filter(
        { job_id, calculation_status: { $in: ['approved', 'overridden'] } },
        '-calculated_at', 1
      );
      snapshot = snapshots[0];
    }

    if (!snapshot) {
      return Response.json({ error: 'No approved pricing snapshot found. Approve pricing first.' }, { status: 400 });
    }
    if (!['approved', 'overridden'].includes(snapshot.calculation_status)) {
      return Response.json({ error: `Pricing snapshot status is "${snapshot.calculation_status}" — must be approved or overridden.` }, { status: 400 });
    }

    // 2. Load job for customer info
    const job = await base44.asServiceRole.entities.Job.get(job_id);

    // 3. Build customer-facing line items from estimate package items
    let lineItems = [];
    const packageId = snapshot.estimate_package_id;
    if (packageId) {
      const pkgItems = await base44.asServiceRole.entities.EstimatePackageItem.filter(
        { estimate_package_id: packageId }, 'sort_order', 200
      );
      lineItems = pkgItems.map(item => ({
        description: item.customer_description || item.service_name || item.recommendation_title || 'Service',
        quantity: item.quantity || 1,
        unit_price: item.selling_price || 0,
        total: (item.selling_price || 0) * (item.quantity || 1),
        service_name: item.service_name || '',
        service_code: item.service_code || '',
      }));
    }

    // 4. Add customer-visible modifier adjustments as line items
    let matchedModifiers = [];
    try { matchedModifiers = JSON.parse(snapshot.matched_modifiers_json || '[]'); } catch {}
    const customerVisibleModifiers = matchedModifiers.filter(
      m => m.customer_visible && m.affects_customer_price && m.adjustment_amount !== 0
    );
    for (const mod of customerVisibleModifiers) {
      lineItems.push({
        description: mod.customer_display_name || mod.name,
        quantity: 1,
        unit_price: mod.adjustment_amount,
        total: mod.adjustment_amount,
        is_modifier: true,
      });
    }

    // 5. Check for existing estimate
    const existingEstimates = await base44.asServiceRole.entities.Estimate.filter({ job_id }, '-updated_date', 1);
    const existing = existingEstimates[0];

    // 6. Generate estimate number if new
    const estimateNumber = existing?.estimate_number || `EST-${Date.now().toString().slice(-6)}`;

    const estimateData = {
      job_id,
      appointment_id: snapshot.appointment_id || job.appointment_id || '',
      customer_id: job.customer_id || '',
      customer_name: job.customer_name || '',
      pricing_snapshot_id: snapshot.id,
      selected_package_id: packageId || '',
      scope_of_work_id: snapshot.scope_of_work_id || '',
      estimate_number: estimateNumber,
      line_items: JSON.stringify(lineItems),
      subtotal: snapshot.base_total_price || 0,
      total: snapshot.final_selling_price || 0,
      status: 'approved',
      total_estimated_hours: snapshot.total_labor_hours || 0,
      total_job_days: snapshot.production_days || 1,
      customer_description: `Estimate for ${job.customer_name || 'customer'}`,
    };

    let estimate;
    if (existing) {
      estimate = await base44.asServiceRole.entities.Estimate.update(existing.id, estimateData);
    } else {
      estimate = await base44.asServiceRole.entities.Estimate.create(estimateData);
    }

    return Response.json({
      status: 'success',
      estimate,
      line_items: lineItems,
      snapshot_id: snapshot.id,
      final_selling_price: snapshot.final_selling_price,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});