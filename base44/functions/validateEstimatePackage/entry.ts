import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const STALE_PRICING_STATUSES = ['stale', 'not_started', 'pending'];

/**
 * Validates a single package against all readiness checks.
 * Returns { valid, reasons, ...metadata }.
 */
async function validatePackage(base44, pkg, checkTotals) {
  const reasons = [];
  if (!pkg) return { valid: false, reasons: ['Package not found'], package_id: null };

  // 1. pricing_status is current (not stale/pending/not_started)
  if (STALE_PRICING_STATUSES.includes(pkg.pricing_status)) {
    reasons.push(`pricing_status is '${pkg.pricing_status}' — must be calculated, approved, or locked`);
  }

  // 2. proposal_stale is false
  if (pkg.proposal_stale === true) {
    reasons.push('proposal_stale is true — proposal must be regenerated');
  }

  // 3. package is authoritative (not superseded)
  if (pkg.is_authoritative === false) {
    reasons.push('Package is not authoritative (superseded)');
  }

  // 4. authoritative scope exists
  let scopeValid = false;
  if (pkg.scope_of_work_id) {
    try {
      const scope = await base44.asServiceRole.entities.ScopeOfWork.get(pkg.scope_of_work_id);
      if (scope && scope.is_authoritative !== false && !scope.superseded_by_id) {
        scopeValid = true;
      } else {
        reasons.push('Linked Scope of Work is not authoritative or has been superseded');
      }
    } catch {
      reasons.push('Failed to fetch linked Scope of Work');
    }
  } else {
    try {
      const scopes = await base44.asServiceRole.entities.ScopeOfWork.filter(
        { estimate_package_id: pkg.id, is_authoritative: true }
      );
      if (scopes.some(s => !s.superseded_by_id)) {
        scopeValid = true;
      } else {
        reasons.push('No authoritative Scope of Work found for this package');
      }
    } catch {
      reasons.push('Failed to query Scope of Work');
    }
  }

  // 5. The dynamic pricing snapshot is authoritative for an option's final
  // customer price. Package-item rows are composition inputs, not a second price.
  if (checkTotals) {
    try {
      const snapshots = await base44.asServiceRole.entities.PricingCalculationSnapshot.filter(
        { job_id: pkg.job_id, estimate_package_id: pkg.id, calculation_status: { $in: ['calculated', 'approved', 'overridden'] } },
        '-calculated_at',
        1,
      );
      const snapshot = snapshots[0];
      if (!snapshot) {
        reasons.push('No current dynamic pricing snapshot found for this option');
      } else if (
        Math.abs((pkg.subtotal || 0) - (snapshot.base_total_price || 0)) > 0.01 ||
        Math.abs((pkg.selling_price || 0) - (snapshot.final_selling_price || 0)) > 0.01
      ) {
        reasons.push(
          `Package totals are out of date — stored subtotal=${pkg.subtotal}, priced base=${snapshot.base_total_price}; ` +
          `stored selling_price=${pkg.selling_price}, priced selling_price=${snapshot.final_selling_price}`
        );
      }
    } catch {
      reasons.push('Failed to verify package totals against current pricing');
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    package_id: pkg.id,
    package_number: pkg.package_number,
    pricing_status: pkg.pricing_status,
    proposal_stale: pkg.proposal_stale,
    is_authoritative: pkg.is_authoritative,
    scope_valid: scopeValid,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { package_id, job_id, check_totals = true } = body;

    if (!package_id && !job_id) {
      return Response.json({ error: 'package_id or job_id required' }, { status: 400 });
    }

    let packages = [];
    if (package_id) {
      const pkg = await base44.asServiceRole.entities.EstimatePackage.get(package_id);
      if (pkg) packages = [pkg];
    } else {
      packages = await base44.asServiceRole.entities.EstimatePackage.filter(
        { job_id, is_authoritative: true }
      );
    }

    const results = [];
    for (const pkg of packages) {
      const result = await validatePackage(base44, pkg, check_totals);
      results.push(result);
    }

    // No packages = valid (legacy workflow has nothing to validate)
    const allValid = results.length > 0 ? results.every(r => r.valid) : true;

    return Response.json({ valid: allValid, packages: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});