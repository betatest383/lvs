import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const STALE_PRICING_STATUSES = ['stale', 'not_started', 'pending'];

/**
 * Writes a rich audit record to JobActivityLog.
 * NON-BLOCKING — failures are logged but never interrupt the primary action.
 *
 * Audit fields: package_id, package_version, job_id, appointment_id, user_id,
 * previous_status, new_status, reason, related_item_id, related_scope_id,
 * related_proposal_id, timestamp.
 */
async function writeAudit(base44, params) {
  try {
    await base44.asServiceRole.entities.JobActivityLog.create({
      job_id: params.job_id || '',
      event_type: params.event_type,
      event_label: params.event_label,
      performed_by: params.user_id || '',
      event_details: JSON.stringify({
        package_id: params.package_id,
        package_version: params.package_version,
        job_id: params.job_id,
        appointment_id: params.appointment_id || '',
        user_id: params.user_id,
        previous_status: params.previous_status || null,
        new_status: params.new_status || null,
        reason: params.reason || '',
        related_item_id: params.related_item_id || null,
        related_scope_id: params.related_scope_id || null,
        related_proposal_id: params.related_proposal_id || null,
        ...params.extra,
      }),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[PackageAudit] Failed to write audit record:', err);
  }
}

/**
 * Full validation — same checks as validateEstimatePackage backend function.
 * Used before accepting to block if the package became stale.
 */
async function validatePackage(base44, pkg) {
  const reasons = [];
  if (!pkg) return { valid: false, reasons: ['Package not found'] };

  if (STALE_PRICING_STATUSES.includes(pkg.pricing_status)) {
    reasons.push(`pricing_status is '${pkg.pricing_status}'`);
  }
  if (pkg.proposal_stale === true) {
    reasons.push('proposal_stale is true');
  }
  if (pkg.is_authoritative === false) {
    reasons.push('Package is not authoritative');
  }

  // Check authoritative scope exists
  let scopeValid = false;
  if (pkg.scope_of_work_id) {
    try {
      const scope = await base44.asServiceRole.entities.ScopeOfWork.get(pkg.scope_of_work_id);
      if (scope && scope.is_authoritative !== false && !scope.superseded_by_id) {
        scopeValid = true;
      }
    } catch {}
  }
  if (!scopeValid) {
    try {
      const scopes = await base44.asServiceRole.entities.ScopeOfWork.filter(
        { estimate_package_id: pkg.id, is_authoritative: true }
      );
      if (scopes.some(s => !s.superseded_by_id)) scopeValid = true;
    } catch {}
  }
  if (!scopeValid) reasons.push('No authoritative Scope of Work');

  // Check totals match live items
  try {
    const items = await base44.asServiceRole.entities.EstimatePackageItem.filter(
      { estimate_package_id: pkg.id }
    );
    const computedSubtotal = items.reduce((s, i) => s + (i.material_cost || 0) + (i.labor_cost || 0), 0);
    const computedSellingPrice = items.reduce((s, i) => s + (i.selling_price || 0), 0);
    if (Math.abs((pkg.subtotal || 0) - computedSubtotal) > 0.01 ||
        Math.abs((pkg.selling_price || 0) - computedSellingPrice) > 0.01) {
      reasons.push('Package totals do not match live items');
    }
  } catch {
    reasons.push('Failed to verify totals');
  }

  return { valid: reasons.length === 0, reasons };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, package_id, expected_updated_date, reason, proposal_id } = body;

    if (!action || !package_id) {
      return Response.json({ error: 'action and package_id required' }, { status: 400 });
    }

    // Fetch the package fresh from the database
    let pkg;
    try {
      pkg = await base44.asServiceRole.entities.EstimatePackage.get(package_id);
    } catch {
      // get() throws if record not found
    }
    if (!pkg) {
      return Response.json({ error: 'Package not found' }, { status: 404 });
    }

    // --- Optimistic Locking ---
    // If the client passes expected_updated_date, verify the package hasn't been
    // modified since the client last read it. Prevents concurrent recalculate/revise.
    if (expected_updated_date && pkg.updated_date && pkg.updated_date !== expected_updated_date) {
      return Response.json({
        error: 'Package was modified by another user. Please refresh and try again.',
        conflict: true,
        current_updated_date: pkg.updated_date,
      }, { status: 409 });
    }

    const userId = user.email || user.id;
    const auditBase = {
      job_id: pkg.job_id,
      appointment_id: pkg.appointment_id,
      package_id: pkg.id,
      package_version: pkg.package_version || 1,
      user_id: userId,
    };

    // --- ACCEPT ---
    // Re-validates server-side before accepting. Blocks if package became stale
    // while the presentation was open.
    if (action === 'accept') {
      const validation = await validatePackage(base44, pkg);
      if (!validation.valid) {
        return Response.json({
          error: 'Package validation failed — cannot accept stale package',
          validation,
          blocked: true,
        }, { status: 422 });
      }

      const previousStatus = pkg.status;
      const updated = await base44.asServiceRole.entities.EstimatePackage.update(package_id, {
        status: 'accepted',
        is_selected: true,
        selected_at: new Date().toISOString(),
        selected_by: userId,
      });

      // Non-blocking audit — failure logged but never blocks acceptance
      await writeAudit(base44, {
        ...auditBase,
        event_type: 'package_revised',
        event_label: `Package '${pkg.name || pkg.package_number}' accepted by customer`,
        previous_status: previousStatus,
        new_status: 'accepted',
        reason: reason || 'customer_accepted',
        related_proposal_id: proposal_id || null,
      });

      return Response.json({ success: true, package: updated });
    }

    // --- RECALCULATE ---
    // Recomputes totals from live EstimatePackageItem records, clears stale state.
    // Protected by optimistic locking — two users can't recalculate simultaneously.
    if (action === 'recalculate') {
      const items = await base44.asServiceRole.entities.EstimatePackageItem.filter(
        { estimate_package_id: package_id }
      );

      const subtotal = items.reduce((s, i) => s + (i.material_cost || 0) + (i.labor_cost || 0), 0);
      const sellingPrice = items.reduce((s, i) => s + (i.selling_price || 0), 0);
      const grossProfit = sellingPrice - subtotal;
      const grossMargin = subtotal > 0 ? Math.round((grossProfit / sellingPrice) * 100) : 0;
      const estimatedHours = items.reduce((s, i) => s + (i.estimated_hours || 0), 0);
      const estimatedDays = Math.max(1, Math.ceil(estimatedHours / 8));
      const commissionTotal = items.reduce((s, i) => s + (i.commission_amount || 0), 0);
      const grossProfitPerDay = estimatedDays > 0 ? Math.round(grossProfit / estimatedDays) : 0;

      const previousPricingStatus = pkg.pricing_status;
      const updated = await base44.asServiceRole.entities.EstimatePackage.update(package_id, {
        subtotal: Math.round(subtotal * 100) / 100,
        selling_price: Math.round(sellingPrice * 100) / 100,
        gross_profit: Math.round(grossProfit * 100) / 100,
        gross_margin: grossMargin,
        gross_profit_per_day: grossProfitPerDay,
        estimated_hours: estimatedHours,
        estimated_days: estimatedDays,
        commission_total: Math.round(commissionTotal * 100) / 100,
        pricing_status: 'calculated',
        stale_reason: null,
        stale_item_id: null,
        stale_at: null,
        proposal_stale: false,
        proposal_stale_reason: null,
        profitability_target_met: grossMargin >= 40,
      });

      await writeAudit(base44, {
        ...auditBase,
        event_type: 'package_recalculated',
        event_label: `Package '${pkg.name || pkg.package_number}' pricing recalculated`,
        previous_status: previousPricingStatus,
        new_status: 'calculated',
        reason: reason || 'stale_pricing_recalculated',
        extra: {
          new_subtotal: Math.round(subtotal * 100) / 100,
          new_selling_price: Math.round(sellingPrice * 100) / 100,
          new_gross_margin: grossMargin,
          item_count: items.length,
        },
      });

      return Response.json({ success: true, package: updated });
    }

    // --- REVISE ---
    // Creates a new revision of an accepted package for editing.
    // Original is superseded; new revision starts in draft.
    // Protected by optimistic locking — two users can't revise simultaneously.
    if (action === 'revise') {
      const newVersion = (pkg.package_version || 1) + 1;
      const revision = await base44.asServiceRole.entities.EstimatePackage.create({
        package_number: pkg.package_number,
        job_id: pkg.job_id,
        appointment_id: pkg.appointment_id,
        customer_id: pkg.customer_id,
        customer_name: pkg.customer_name,
        estimate_id: pkg.estimate_id,
        name: pkg.name,
        option_type: pkg.option_type,
        status: 'draft',
        estimate_item_ids: pkg.estimate_item_ids,
        included_service_ids: pkg.included_service_ids,
        traceable_recommendation_ids: pkg.traceable_recommendation_ids,
        included_materials: pkg.included_materials,
        scope_of_work_id: null,
        pricing_status: 'not_started',
        workflow_version: pkg.workflow_version || 'v2_package',
        package_version: newVersion,
        is_legacy: false,
        is_authoritative: true,
        is_customer_facing: pkg.is_customer_facing,
        sort_order: pkg.sort_order,
        notes: `Revision ${newVersion} of package ${pkg.package_number || pkg.id}`,
      });

      // Supersede the original
      await base44.asServiceRole.entities.EstimatePackage.update(package_id, {
        is_authoritative: false,
        superseded_by_id: revision.id,
        status: 'archived',
      });

      await writeAudit(base44, {
        ...auditBase,
        event_type: 'package_revised',
        event_label: `Package '${pkg.name || pkg.package_number}' revised to v${newVersion}`,
        previous_status: pkg.status,
        new_status: 'archived',
        reason: reason || 'revision_created',
        extra: {
          revision_id: revision.id,
          new_version: newVersion,
        },
      });

      return Response.json({ success: true, package: revision });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});