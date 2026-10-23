import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Calculator, CheckCircle2, AlertTriangle, ShieldAlert,
  ArrowLeft, Package, FileText, History, DollarSign, TrendingUp, Clock, CalendarDays, BadgePercent,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const STATUS_LABELS = {
  draft: 'Draft', calculated: 'Calculated', approved: 'Approved',
  overridden: 'Manager Override', superseded: 'Superseded',
};

const STATUS_BADGES = {
  draft: 'bg-gray-100 text-gray-700',
  calculated: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  overridden: 'bg-amber-100 text-amber-700',
  superseded: 'bg-red-100 text-red-700',
};

function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function PricingStage({ jobId, scopeOfWorkId, estimatePackageId, onApprove, onReturnToScope, onReturnToPackages }) {
  const [user, setUser] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [settings, setSettings] = useState({});
  const [history, setHistory] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedScope, setSelectedScope] = useState(null);
  const [scopesForPackage, setScopesForPackage] = useState([]);
  const [pricingError, setPricingError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [activePolicy, setActivePolicy] = useState(null);
  const [policyOverrideOpen, setPolicyOverrideOpen] = useState(false);
  const [policyOverride, setPolicyOverride] = useState({ gp_per_day: '', gp_per_hour: '', min_margin: '', reason: '' });
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [technicianAdjustmentOpen, setTechnicianAdjustmentOpen] = useState(false);
  const [technicianDiscount, setTechnicianDiscount] = useState('');

  const isManagement = user?.role === 'admin' || user?.role === 'owner';

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadPricing();
  }, [jobId]);

  const loadPricing = async () => {
    setLoading(true);
    try {
      // Pricing history/settings must never make the option packages disappear.
      // Load each source independently so a stale or unavailable supporting record
      // leaves the calculator usable with the authoritative package data.
      const [snapshots, settingsRecs, packages, policyRes, scopes] = await Promise.all([
        base44.entities.PricingCalculationSnapshot.filter({ job_id: jobId }, '-calculated_at', 50).catch(() => []),
        base44.entities.CompanyPricingSettings.filter({}, null, 1).catch(() => []),
        base44.entities.EstimatePackage.filter({ job_id: jobId }, '-updated_date').catch(() => []),
        base44.functions.invoke('managePricingPolicy', { action: 'resolve_active' }).catch(() => null),
        base44.entities.ScopeOfWork.filter({ job_id: jobId }, '-updated_date').catch(() => []),
      ]);
      setHistory(snapshots);
      setScopesForPackage(scopes);
      const optionPackages = packages.filter(p => p.is_authoritative !== false && ['good', 'better', 'best'].includes(p.option_type));
      setPackages(optionPackages);
      if (settingsRecs.length > 0) setSettings(settingsRecs[0]);
      if (policyRes?.data?.ok) setActivePolicy(policyRes.data.policy);

      // Keep the option the technician is actively viewing. The package ID supplied
      // when this dialog opened is only the initial choice; it must never override a
      // later Good / Better / Best card selection.
      const selPkg = (selectedPackage?.id && optionPackages.find(p => p.id === selectedPackage.id))
        || (estimatePackageId && optionPackages.find(p => p.id === estimatePackageId))
        || packages.find(p => p.is_selected)
        || optionPackages[0]
        || packages.find(p => p.is_authoritative)
        || packages[0]
        || null;
      setSelectedPackage(selPkg);
      const scope = selPkg ? (scopes.find(s => s.id === selPkg.scope_of_work_id) || scopes.find(s => s.estimate_package_id === selPkg.id && !s.superseded_by_id) || null) : null;
      setSelectedScope(scope);
      setSnapshot(selPkg ? (snapshots.find(s => s.estimate_package_id === selPkg.id && s.calculation_status !== 'superseded') || null) : null);
    } catch (e) {
      toast.error('Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  // Reject DOM nodes, React SyntheticEvents, React Fiber refs, component instances,
  // and any other non-plain object that would make the request payload non-serializable.
  // A plain object's prototype is Object.prototype (or null). Everything else —
  // HTMLButtonElement, SyntheticEvent, Fiber, class instances — fails this check.
  const isPlainSerializableObject = (v) => {
    if (v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return false;
    if (typeof v.preventDefault === 'function' || typeof v.stopPropagation === 'function') return false;
    if (typeof v.nodeType === 'number') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  };

  // Explicit allowlist of the ONLY override keys the pricing backend accepts.
  // Never merge arbitrary fields from a caller — construct the request from primitives only.
  const buildPricingPayload = (baseId, baseScope, basePkg, overrideParams) => {
    const payload = {
      job_id: baseId,
      scope_of_work_id: baseScope,
      estimate_package_id: basePkg,
    };
    if (overrideParams == null) return payload;
    if (overrideParams.management_override_gross_profit_per_day != null) {
      payload.management_override_gross_profit_per_day = Number(overrideParams.management_override_gross_profit_per_day);
    }
    if (overrideParams.management_override_minimum_margin != null) {
      payload.management_override_minimum_margin = Number(overrideParams.management_override_minimum_margin);
    }
    if (overrideParams.management_override_gross_profit_per_crew_hour != null) {
      payload.management_override_gross_profit_per_crew_hour = Number(overrideParams.management_override_gross_profit_per_crew_hour);
    }
    if (overrideParams.override_reason != null) {
      payload.override_reason = String(overrideParams.override_reason);
    }
    if (overrideParams.technician_discount_amount != null) {
      payload.technician_discount_amount = Number(overrideParams.technician_discount_amount);
    }
    return payload;
  };

  const calculate = async (overrideParams = null) => {
    setCalculating(true);
    setPricingError(null);
    // Defensive gate: a DOM event, SyntheticEvent, React Fiber, ref, or component
    // instance must never reach base44.functions.invoke. This is the root cause of the
    // "Converting circular structure to JSON ... HTMLButtonElement ... __reactFiber
    // ... stateNode closes the circle" error — a click handler passed the React event
    // straight into calculate(). Reject it here with a clear internal error instead of
    // attempting a JSON.stringify replacer that would silently drop fields.
    if (overrideParams != null && !isPlainSerializableObject(overrideParams)) {
      const internalErr = 'Pricing request blocked: overrideParams must be a plain serializable object. A DOM event, React SyntheticEvent, Fiber, ref, or component instance was passed instead — this is a frontend wiring defect, not a missing-items error.';
      console.error('[PricingStage]', internalErr, overrideParams);
      setPricingError({ message: internalErr, diagnostics: null, kind: 'frontend_serialization' });
      setCalculating(false);
      return;
    }
    try {
      // The selected option and its bound scope are the authoritative calculation
      // context. Do not reuse the package/scope that happened to open this dialog.
      const payload = buildPricingPayload(
        jobId,
        selectedScope?.id || selectedPackage?.scope_of_work_id || scopeOfWorkId,
        selectedPackage?.id || estimatePackageId,
        overrideParams,
      );
      const response = await base44.functions.invoke('calculatePricing', payload);
      setSnapshot(response.data.snapshot);
      toast.success(`Pricing calculated — v${response.data.snapshot.pricing_version}`);
      loadPricing();
    } catch (error) {
      const errData = error?.response?.data || {};
      const msg = errData.error || error?.message || 'Unknown error';
      setPricingError({
        message: msg,
        diagnostics: errData.diagnostics || null,
        kind: 'backend',
      });
      toast.error(`Calculation failed: ${msg}`);
    } finally {
      setCalculating(false);
    }
  };

  const calculateAllPackages = async () => {
    if (packages.length === 0) {
      toast.error('No Good, Better, or Best packages are available. Return to Proposal Builder first.');
      return;
    }
    setCalculating(true);
    setPricingError(null);
    try {
      const results = await Promise.all(packages.map(pkg => {
        // Preserve any technician-approved option discount when refreshing pricing.
        // Otherwise a general recalculation would silently replace the discounted
        // snapshot with a new undiscounted one.
        const priorSnapshot = history.find(s => s.estimate_package_id === pkg.id && s.calculation_status !== 'superseded');
        const priorDiscount = Math.max(0, Number(priorSnapshot?.technician_discount_amount || 0));
        return base44.functions.invoke(
          'calculatePricing',
          buildPricingPayload(jobId, null, pkg.id, priorDiscount > 0 ? { technician_discount_amount: priorDiscount } : null)
        );
      }));
      setSnapshot(results[0]?.data?.snapshot || null);
      toast.success(`Calculated ${results.length} package prices.`);
      await loadPricing();
    } catch (error) {
      const errData = error?.response?.data || {};
      const msg = errData.error || error?.message || 'Unknown error';
      setPricingError({ message: msg, diagnostics: errData.diagnostics || null, kind: 'backend' });
      toast.error(`Package pricing failed: ${msg}`);
    } finally {
      setCalculating(false);
    }
  };

  const activeModel = (activePolicy?.pricing_target_model || 'daily');
  const applyPolicyOverride = async () => {
    const mm = Number(policyOverride.min_margin);
    if (!(mm > 0 && mm < 100)) { toast.error('Override margin must be between 0 and 100.'); return; }
    if (!policyOverride.reason.trim()) { toast.error('An override reason is required.'); return; }
    const overridePayload = { management_override_minimum_margin: mm, override_reason: policyOverride.reason.trim() };
    if (activeModel === 'hourly_capped') {
      const gph = Number(policyOverride.gp_per_hour);
      if (!(gph > 0)) { toast.error('Override GP target per crew hour must be > 0.'); return; }
      overridePayload.management_override_gross_profit_per_crew_hour = gph;
    } else {
      const gp = Number(policyOverride.gp_per_day);
      if (!(gp > 0)) { toast.error('Override GP/day must be > 0.'); return; }
      overridePayload.management_override_gross_profit_per_day = gp;
    }
    setPolicyOverrideOpen(false);
    await calculate(overridePayload);
    setPolicyOverride({ gp_per_day: '', gp_per_hour: '', min_margin: '', reason: '' });
  };

  const toggleWeekendWork = async (checked) => {
    if (!selectedPackage?.id) return;
    const prev = !!selectedPackage.weekend_work_required;
    try {
      await base44.entities.EstimatePackage.update(selectedPackage.id, { weekend_work_required: checked });
      setSelectedPackage({ ...selectedPackage, weekend_work_required: checked });
      toast.success(checked ? 'Weekend Work Required enabled for this option. Recalculate pricing to apply the Weekend Work modifier.' : 'Weekend Work Required cleared. Recalculate pricing to update adjustments.');
      if (snapshot && prev !== checked) loadPricing();
    } catch (e) {
      toast.error(`Failed to update Weekend Work flag: ${e?.message || 'Unknown error'}`);
    }
  };

  const stalePolicy = snapshot && activePolicy && snapshot.pricing_policy_id && snapshot.pricing_policy_id !== activePolicy.id;
  const staleModel = snapshot && activePolicy && (snapshot.pricing_target_model || 'daily') !== (activePolicy.pricing_target_model || 'daily');
  const staleScope = snapshot && activePolicy && (
    (Number(snapshot.total_actual_crew_hours) !== Number(snapshot.total_labor_hours)) ||
    (selectedScope && Number(snapshot.production_days) !== Number(selectedScope.production_days)) ||
    (snapshot.pricing_target_model === 'hourly_capped' && activePolicy.pricing_target_model === 'hourly_capped' &&
      Number(snapshot.gross_profit_target_per_crew_hour) !== Number(activePolicy.gross_profit_target_per_crew_hour))
  );

  const approve = async (override = false, reason = '') => {
    if (!snapshot) return;
    setApproving(true);
    try {
      const updateData = {
        calculation_status: override ? 'overridden' : 'approved',
        approved_by: user?.email || 'system',
        approved_at: new Date().toISOString(),
      };
      if (override) updateData.override_reason = reason;
      await base44.entities.PricingCalculationSnapshot.update(snapshot.id, updateData);
      toast.success(override ? 'Pricing approved with override' : 'Pricing approved');
      loadPricing();
      if (onApprove) onApprove();
    } catch (error) {
      toast.error(`Approval failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setApproving(false);
    }
  };

  // The active PricingPolicy is the source of truth for hard pricing guardrails.
  // CompanyPricingSettings may retain a legacy aspirational target, but it must
  // never be shown as the policy floor or used to block a technician adjustment.
  const minMargin = Number(activePolicy?.minimum_gross_margin_percentage ?? settings.minimum_gross_margin_percentage ?? 0);
  const currentMargin = snapshot?.gross_margin_percentage || 0;
  const isBelowMin = snapshot && currentMargin < minMargin;
  const requiredPrice = snapshot && snapshot.total_direct_job_cost > 0 && minMargin < 100
    ? snapshot.total_direct_job_cost / (1 - minMargin / 100)
    : 0;
  const shortfall = requiredPrice - (snapshot?.final_selling_price || 0);
  const policyFloorPrice = snapshot ? Math.max(
    Number(snapshot.margin_target_price) || 0,
    Number(snapshot.gross_profit_target_price) || 0,
    Number(snapshot.net_contribution_target_price) || 0,
  ) : 0;
  const floorLimitedDiscount = snapshot ? Math.max(0, (snapshot.final_selling_price || 0) - policyFloorPrice) : 0;
  // Technicians may lower an option whenever both policy guardrails remain met.
  // Do not apply an unrelated percentage cap; the policy floor is the sole limit.
  const maximumTechnicianDiscount = floorLimitedDiscount;
  const applyTechnicianDiscount = async () => {
    const amount = Number(technicianDiscount);
    if (!(amount > 0)) { toast.error('Enter a discount greater than $0.'); return; }
    if (amount > maximumTechnicianDiscount + 0.005) {
      toast.error(`The maximum allowed discount for this option is $${maximumTechnicianDiscount.toFixed(2)}.`);
      return;
    }
    setTechnicianAdjustmentOpen(false);
    await calculate({ technician_discount_amount: amount });
    setTechnicianDiscount('');
  };

  const matchedModifiers = snapshot ? ((() => { try { return JSON.parse(snapshot.matched_modifiers_json || '[]'); } catch { return []; } })()) : [];
  const customerVisibleModifiers = matchedModifiers.filter(m => m.customer_visible && m.affects_customer_price);
  const scopeInputs = snapshot ? ((() => { try { return JSON.parse(snapshot.scope_inputs_json || '{}'); } catch { return {}; } })()) : {};
  const weekendUsedInSnapshot = scopeInputs['scope.weekend_work_required'] === 'true';
  const membershipUsedInSnapshot = scopeInputs['scope.membership_eligible'] === 'true';
  const weekendMismatch = snapshot && selectedPackage && (weekendUsedInSnapshot !== !!selectedPackage.weekend_work_required);
  const hasZeroCompensation = snapshot?.total_employee_compensation_cost === 0 && snapshot?.base_total_price > 0;
  const employeeCompensation = snapshot ? ((() => { try { return JSON.parse(snapshot.employee_compensation_json || '[]'); } catch { return []; } })()) : [];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">Pricing</h2>
          {snapshot && (
            <Badge className={STATUS_BADGES[snapshot.calculation_status] || 'bg-gray-100'}>
              {STATUS_LABELS[snapshot.calculation_status] || snapshot.calculation_status} · v{snapshot.pricing_version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReturnToPackages && <Button variant="outline" size="sm" onClick={onReturnToPackages}><Package className="w-4 h-4 mr-1" /> Packages</Button>}
          {onReturnToScope && <Button variant="outline" size="sm" onClick={onReturnToScope}><ArrowLeft className="w-4 h-4 mr-1" /> Scope</Button>}
          {snapshot && settings.allow_technician_price_override && (
            <Button variant="outline" size="sm" onClick={() => setTechnicianAdjustmentOpen(true)} disabled={calculating}>
              <BadgePercent className="w-4 h-4 mr-1" /> {maximumTechnicianDiscount > 0 ? 'Adjust This Option' : 'At Policy Floor'}
            </Button>
          )}
          {isManagement && snapshot && (
            <Button variant="outline" size="sm" onClick={() => setPolicyOverrideOpen(true)} disabled={calculating}>
              <ShieldAlert className="w-4 h-4 mr-1" /> Management Override
            </Button>
          )}
          <Button onClick={snapshot ? () => setRecalcConfirmOpen(true) : () => calculateAllPackages()} disabled={calculating} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {calculating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Calculator className="w-4 h-4 mr-1" />}
            {snapshot ? 'Recalculate All Package Prices' : 'Calculate All Package Prices'}
          </Button>
        </div>
      </div>

      {/* Stale pricing-policy banner */}
      {stalePolicy && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-900">
              {staleModel
                ? 'The pricing target model has changed. Recalculate to apply the new model.'
                : staleScope
                ? 'Daily crew hours or production days have changed since this calculation. Recalculate to refresh the GP target.'
                : 'A newer pricing policy is available. Recalculate to apply it.'}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Management override label */}
      {snapshot?.management_override_applied && (
        <Card className="border-purple-300 bg-purple-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
              <span className="text-sm font-semibold text-purple-900">Management Pricing Override</span>
            </div>
            <p className="text-xs text-purple-700 mt-1">
              {(snapshot.pricing_target_model || 'daily') === 'hourly_capped'
                ? <>GP target per crew hour overridden to ${snapshot.management_override_gross_profit_per_crew_hour?.toFixed(2)} (8-hour cap unchanged). </>
                : <>GP/day overridden to ${snapshot.management_override_gross_profit_per_day?.toFixed(2)}. </>}
              Minimum margin overridden to {snapshot.management_override_minimum_margin}%. Authorized by {snapshot.management_override_by} on {snapshot.management_override_at ? new Date(snapshot.management_override_at).toLocaleString() : '—'}.
            </p>
            <p className="text-xs text-purple-700">Reason: {snapshot.management_override_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Selected Package Reference */}
      {selectedPackage && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium">{selectedPackage.name || selectedPackage.option_type || 'Selected Package'}</p>
                <p className="text-xs text-muted-foreground">
                  Package Total: <span className="font-bold">${(selectedPackage.selling_price || selectedPackage.subtotal || 0).toFixed(2)}</span>
                  {' · '}
                  {(() => {
                    try { return JSON.parse(selectedPackage.estimate_item_ids || '[]').length; } catch { return 0; }
                  })()} item(s)
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {selectedPackage.option_type || 'standalone'}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Every alternative is priced independently. This is not a customer selection. */}
      {packages.length > 0 && (
        <div className="grid md:grid-cols-3 gap-3">
          {packages.map(pkg => {
            const packageSnapshot = history.find(s => s.estimate_package_id === pkg.id && s.calculation_status !== 'superseded');
            const isViewing = selectedPackage?.id === pkg.id;
            return (
              <Card key={pkg.id} className={`border-blue-200 cursor-pointer ${isViewing ? 'ring-2 ring-accent' : ''}`} onClick={() => { setSelectedPackage(pkg); setSelectedScope(scopesForPackage?.find(s => s.id === pkg.scope_of_work_id) || null); setSnapshot(packageSnapshot || null); }}>
                <CardContent className="py-3 space-y-1">
                  <p className="font-semibold text-sm capitalize">{pkg.option_type}</p>
                  <p className="text-xs text-muted-foreground">{pkg.name || 'Proposal option'}</p>
                  <p className="text-xl font-bold">{packageSnapshot ? `$${(packageSnapshot.final_selling_price || 0).toFixed(2)}` : 'Not calculated'}</p>
                  {packageSnapshot && <>
                    <p className="text-xs text-muted-foreground">Base service: ${(packageSnapshot.base_service_price || 0).toFixed(2)} · Base material: ${(packageSnapshot.base_material_price || 0).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Materials: ${(packageSnapshot.material_cost || 0).toFixed(2)} · {(packageSnapshot.gross_margin_percentage || 0).toFixed(1)}% margin</p>
                  </>}
                  <p className="text-xs font-medium text-accent">{isViewing ? 'Viewing detailed pricing below' : 'Click to view detailed pricing'}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Option-specific eligibility controls */}
      {selectedPackage && (
        <Card className="border-slate-200">
          <CardContent className="py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-600" />
                <div>
                  <p className="text-sm font-medium">Weekend Work Required</p>
                  <p className="text-xs text-muted-foreground">Applies the Weekend Work modifier to this option only. Not inferred from the appointment date.</p>
                </div>
              </div>
              <Switch checked={!!selectedPackage.weekend_work_required} onCheckedChange={toggleWeekendWork} />
            </div>
            {weekendMismatch && (
              <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Weekend flag changed since this snapshot — recalculate to refresh the Weekend Work adjustment.</p>
            )}
            <div className="flex items-center justify-between border-t pt-2">
              <div className="flex items-center gap-2">
                <BadgePercent className="w-4 h-4 text-slate-600" />
                <div>
                  <p className="text-sm font-medium">Membership Discount</p>
                  <p className="text-xs text-muted-foreground">Applied only when the job's linked customer has an active, eligible membership valid at the pricing time.</p>
                </div>
              </div>
              {snapshot ? (
                <Badge className={membershipUsedInSnapshot ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                  {membershipUsedInSnapshot ? 'Eligible — applied' : 'Not eligible'}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Calculate to evaluate</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Validation Error */}
      {pricingError && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">{pricingError.message}</p>
                {pricingError.diagnostics && (
                  <div className="mt-2 text-xs text-red-700 space-y-0.5">
                    <p>Package Total: ${pricingError.diagnostics.package_total?.toFixed(2)}</p>
                    <p>Item Count: {pricingError.diagnostics.item_count}</p>
                    {pricingError.diagnostics.item_ids?.length > 0 && (
                      <p>Item IDs: {pricingError.diagnostics.item_ids.join(', ')}</p>
                    )}
                    {pricingError.diagnostics.item_prices?.length > 0 && (
                      <p>Item Prices: {pricingError.diagnostics.item_prices.map(p => `$${p.toFixed(2)}`).join(', ')}</p>
                    )}
                  </div>
                )}
                {pricingError.kind === 'frontend_serialization' ? (
                  <p className="text-xs text-red-600 mt-2">This is a frontend wiring defect — a UI event was passed to the pricing function. It is <strong>not</strong> a missing-items error; the package items were not checked. Reload the Job Hub and retry; if it persists, report this as a frontend bug.</p>
                ) : pricingError.diagnostics && (pricingError.diagnostics.item_count === 0 || (Array.isArray(pricingError.diagnostics.item_ids) && pricingError.diagnostics.item_ids.length === 0)) ? (
                  <p className="text-xs text-red-600 mt-2">Return to Packages to verify the selected package has priced estimate items.</p>
                ) : (
                  <p className="text-xs text-red-600 mt-2">The pricing calculation failed. Review the message above; this is not necessarily a missing-items issue.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!snapshot && !calculating && !pricingError && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No pricing calculated yet. Click "Calculate Pricing" to evaluate modifiers and generate a pricing snapshot.</p>
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {/* Margin Guardrails */}
          {isBelowMin && (
            <Card className="border-red-300 bg-red-50">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900">Margin Below Minimum — Manager Approval Required</p>
                    <div className="grid grid-cols-4 gap-3 mt-2 text-sm">
                      <div><span className="text-muted-foreground">Current:</span> <span className="font-bold text-red-700">{currentMargin.toFixed(1)}%</span></div>
                      <div><span className="text-muted-foreground">Target:</span> <span className="font-bold">{minMargin}%</span></div>
                      <div><span className="text-muted-foreground">Shortfall:</span> <span className="font-bold text-red-700">${shortfall.toFixed(2)}</span></div>
                      <div><span className="text-muted-foreground">Required Price:</span> <span className="font-bold">${requiredPrice.toFixed(2)}</span></div>
                    </div>
                    <p className="text-xs text-red-700 mt-2">Possible causes: labor hours, extra crew, equipment, steep roof modifier, access modifier, discounts, or material cost.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {!isBelowMin && (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-900">Minimum margin met ({currentMargin.toFixed(1)}% ≥ {minMargin}% policy floor)</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Technician View */}
          {!isManagement && (
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle>Price Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="Base Price" value={`$${snapshot.base_total_price?.toFixed(2)}`} />
                    <MetricCard label="Adjustments" value={`${snapshot.total_adjustment >= 0 ? '+' : ''}$${snapshot.total_adjustment?.toFixed(2)}`} sub={snapshot.discount_adjustment < 0 ? `Discounts: $${snapshot.discount_adjustment?.toFixed(2)}` : ''} />
                    <MetricCard label="Final Price" value={`$${snapshot.final_selling_price?.toFixed(2)}`} />
                  </div>
                  {matchedModifiers.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      <p className="text-sm font-medium">Applied Adjustments:</p>
                      {matchedModifiers.map((m, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <div>
                            <span>{m.customer_visible ? (m.customer_display_name || m.name) : m.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{m.calculation_formula}</span>
                          </div>
                          <span className={m.adjustment_amount >= 0 ? 'text-green-600' : 'text-red-600'}>{m.adjustment_amount >= 0 ? '+' : ''}${m.adjustment_amount.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-medium pt-1 border-t mt-1">
                        <span>Base + Adjustments = Final</span>
                        <span>${snapshot.base_total_price?.toFixed(2)} {snapshot.total_adjustment >= 0 ? '+' : '-'} ${Math.abs(snapshot.total_adjustment || 0).toFixed(2)} = ${snapshot.final_selling_price?.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* Actions */}
              <div className="flex items-center gap-2">
                {isBelowMin && (
                  <Button onClick={() => toast.info('Manager approval requested')} className="bg-amber-600 text-white hover:bg-amber-700">
                    <ShieldAlert className="w-4 h-4 mr-1" /> Request Manager Approval
                  </Button>
                )}
                {!isBelowMin && snapshot.calculation_status !== 'approved' && (
                  <Button onClick={() => approve(false)} disabled={approving} className="bg-green-600 text-white hover:bg-green-700">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve & Continue
                  </Button>
                )}
                {snapshot.calculation_status === 'approved' && (
                  <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>
                )}
              </div>
            </div>
          )}

          {/* Management View */}
          {isManagement && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Base Service" value={`$${snapshot.base_service_price?.toFixed(2)}`} />
                <MetricCard label="Base Material" value={`$${snapshot.base_material_price?.toFixed(2)}`} />
                <MetricCard label="Base Equipment" value={`$${snapshot.base_equipment_price?.toFixed(2)}`} />
                <MetricCard label="Base Total" value={`$${snapshot.base_total_price?.toFixed(2)}`} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Labor Adj." value={`${snapshot.labor_adjustment >= 0 ? '+' : ''}$${snapshot.labor_adjustment?.toFixed(2)}`} />
                <MetricCard label="Material Adj." value={`${snapshot.material_adjustment >= 0 ? '+' : ''}$${snapshot.material_adjustment?.toFixed(2)}`} />
                <MetricCard label="Equipment Adj." value={`${snapshot.equipment_adjustment >= 0 ? '+' : ''}$${snapshot.equipment_adjustment?.toFixed(2)}`} />
                <MetricCard label="Total Adj." value={`${snapshot.total_adjustment >= 0 ? '+' : ''}$${snapshot.total_adjustment?.toFixed(2)}`} sub={`Discounts: $${snapshot.discount_adjustment?.toFixed(2)}`} />
              </div>
              <Card>
                <CardHeader><CardTitle>{selectedPackage?.option_type ? `${selectedPackage.option_type.charAt(0).toUpperCase() + selectedPackage.option_type.slice(1)} — Modifier Breakdown` : 'Modifier Breakdown'}</CardTitle></CardHeader>
                <CardContent>
                  {matchedModifiers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No modifiers matched the scope values.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {matchedModifiers.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-sm border-b pb-1.5">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{m.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{m.calculation_formula}</span>
                          </div>
                          <span className={`font-medium ${m.adjustment_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{m.adjustment_amount >= 0 ? '+' : ''}${m.adjustment_amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Final Selling Price" value={`$${snapshot.final_selling_price?.toFixed(2)}`} />
                <MetricCard label="Gross Profit" value={`$${snapshot.gross_profit?.toFixed(2)}`} sub={`${snapshot.gross_margin_percentage?.toFixed(1)}% margin`} />
                <MetricCard label="Net Contribution" value={`$${snapshot.estimated_net_contribution?.toFixed(2)}`} sub={`${snapshot.estimated_net_margin_percentage?.toFixed(1)}% net`} />
                <MetricCard label="Overhead Alloc." value={`$${snapshot.estimated_overhead_allocation?.toFixed(2)}`} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Material Cost" value={`$${snapshot.material_cost?.toFixed(2)}`} />
                <MetricCard label="Loaded Labor Cost" value={`$${snapshot.loaded_labor_cost?.toFixed(2)}`} />
                <MetricCard label="Equipment Cost" value={`$${snapshot.equipment_cost?.toFixed(2)}`} />
                <MetricCard label="Total Direct Cost" value={`$${snapshot.total_direct_job_cost?.toFixed(2)}`} />
              </div>

              {/* Compensation Breakdown (Management only — confidential) */}
              {employeeCompensation.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> {selectedPackage?.option_type ? `${selectedPackage.option_type.charAt(0).toUpperCase() + selectedPackage.option_type.slice(1)} — Employee Compensation` : 'Employee Compensation'}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {employeeCompensation.map((e, i) => (
                        <div key={i} className="flex items-center justify-between text-sm border-b pb-1.5">
                          <div className="flex-1">
                            <span className="font-medium">{e.role}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {e.compensation_method}
                              {e.compensation_rate ? ` · ${e.commission_rate}%` : ''}
                              {e.hourly_rate ? ` · $${e.hourly_rate}/hr` : ''}
                              {e.hours ? ` · ${e.hours}h` : ''}
                              {e.quantity > 1 ? ` × ${e.quantity}` : ''}
                              <span className="text-muted-foreground/70"> ({e.calculation_status})</span>
                            </span>
                          </div>
                          <span className="font-medium">${(e.calculated_compensation || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-3 pt-2 border-t">
                      <MetricCard label="Hourly Labor" value={`$${snapshot.hourly_labor_cost?.toFixed(2)}`} />
                      <MetricCard label="Commission" value={`$${snapshot.commission_compensation_cost?.toFixed(2)}`} sub={`${snapshot.commissionable_subtotal?.toFixed(2)} eligible`} />
                      <MetricCard label="Salary Alloc." value={`$${snapshot.salary_allocation_cost?.toFixed(2)}`} />
                      <MetricCard label="Total Comp." value={`$${snapshot.total_employee_compensation_cost?.toFixed(2)}`} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Zero Compensation Warning */}
              {hasZeroCompensation && (
                <Card className="border-red-300 bg-red-50">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-red-900">Assigned employee compensation has not been included.</p>
                        <p className="text-xs text-red-700 mt-1">
                          Total Direct Job Cost is $0 despite priced estimate items. Pricing cannot be approved without manager confirmation that zero compensation is intentional.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Production Days" value={snapshot.production_days || 1} />
                <MetricCard label="Revenue / Day" value={`$${snapshot.revenue_per_production_day?.toFixed(2)}`} sub={`GP/Day: $${snapshot.gross_profit_per_production_day?.toFixed(2)}`} />
                <MetricCard label="Revenue / Labor Hr" value={`$${snapshot.revenue_per_labor_hour?.toFixed(2)}`} sub={`${snapshot.total_labor_hours || 0} hrs`} />
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                {snapshot.calculation_status !== 'approved' && snapshot.calculation_status !== 'overridden' && (
                  <>
                    {!isBelowMin && !hasZeroCompensation && (
                      <Button onClick={() => approve(false)} disabled={approving} className="bg-green-600 text-white hover:bg-green-700">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    )}
                    {(isBelowMin || hasZeroCompensation) && (
                      <Button onClick={() => setOverrideDialogOpen(true)} className="bg-amber-600 text-white hover:bg-amber-700">
                        <ShieldAlert className="w-4 h-4 mr-1" /> {hasZeroCompensation ? 'Confirm Zero Compensation & Approve' : 'Override & Approve'}
                      </Button>
                    )}
                    {!isBelowMin && !hasZeroCompensation && (
                      <Button onClick={() => setOverrideDialogOpen(true)} variant="outline">
                        <ShieldAlert className="w-4 h-4 mr-1" /> Override
                      </Button>
                    )}
                  </>
                )}
                {(snapshot.calculation_status === 'approved' || snapshot.calculation_status === 'overridden') && (
                  <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" /> {snapshot.calculation_status === 'overridden' ? 'Override Approved' : 'Approved'} by {snapshot.approved_by}</Badge>
                )}
              </div>
            </div>
          )}

          {/* Audit History */}
          {history.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Snapshot History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {history.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between text-sm border-b pb-1">
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_BADGES[s.calculation_status] || 'bg-gray-100'}>v{s.pricing_version}</Badge>
                        <span className="text-muted-foreground">{new Date(s.calculated_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Price: ${s.final_selling_price?.toFixed(2)}</span>
                        <span>Margin: {s.gross_margin_percentage?.toFixed(1)}%</span>
                        <span>By: {s.calculated_by}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Technician Adjustment */}
      <Dialog open={technicianAdjustmentOpen} onOpenChange={setTechnicianAdjustmentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust {selectedPackage?.option_type ? `${selectedPackage.option_type.charAt(0).toUpperCase() + selectedPackage.option_type.slice(1)} Option` : 'Option'} Price</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
              <p>Current price: <span className="font-bold">${snapshot?.final_selling_price?.toFixed(2)}</span></p>
              <p>Lowest permitted price: <span className="font-bold">${policyFloorPrice.toFixed(2)}</span></p>
              <p>Maximum permitted adjustment: <span className="font-bold">${maximumTechnicianDiscount.toFixed(2)}</span></p>
              <p className="text-xs text-muted-foreground">The price cannot go below the ${snapshot?.minimum_net_contribution_per_day_target?.toFixed(2) || '3,600.00'}/day net-contribution floor or the ${snapshot?.minimum_margin_target?.toFixed(1) || '65.0'}% margin floor. Your configured percentage cap also applies.</p>
              {maximumTechnicianDiscount <= 0 && <p className="text-xs font-medium text-amber-800">This option is already at its controlling policy floor, so no technician adjustment is available.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Price Adjustment ($)</Label>
              <Input type="number" min="0" step="0.01" max={maximumTechnicianDiscount} value={technicianDiscount} onChange={e => setTechnicianDiscount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechnicianAdjustmentOpen(false)}>Cancel</Button>
            <Button onClick={applyTechnicianDiscount} disabled={calculating || maximumTechnicianDiscount <= 0}>{maximumTechnicianDiscount > 0 ? 'Apply Adjustment' : 'No Adjustment Available'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manager Override — Approve Below Margin</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <p>Current Margin: <span className="font-bold">{currentMargin.toFixed(1)}%</span></p>
              <p>Minimum Required: <span className="font-bold">{minMargin}%</span></p>
              <p>Shortfall: <span className="font-bold text-red-600">${shortfall.toFixed(2)}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label>Override Reason (required)</Label>
              <Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={3} placeholder="Explain why this pricing is approved below the minimum margin threshold..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { approve(true, overrideReason); setOverrideDialogOpen(false); setOverrideReason(''); }} disabled={!overrideReason.trim() || approving} className="bg-amber-600 text-white hover:bg-amber-700">
              Approve with Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recalculate Using Current Pricing Policy — confirmation */}
      <Dialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recalculate Using Current Pricing Policy</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <div className="rounded-lg bg-muted/40 border p-3 space-y-1">
              <p><span className="text-muted-foreground">Previous policy:</span> <span className="font-medium">{snapshot?.pricing_policy_version ? `v${snapshot.pricing_policy_version}` : '—'}</span></p>
              <p><span className="text-muted-foreground">Current policy:</span> <span className="font-medium">{activePolicy ? `v${activePolicy.version_number} · ${activePolicy.policy_name}` : '—'}</span></p>
              <p><span className="text-muted-foreground">Previous price:</span> <span className="font-medium">${snapshot?.final_selling_price?.toFixed(2)}</span> · <span className="text-muted-foreground">GP/day:</span> ${snapshot?.gross_profit_per_production_day?.toFixed(2)} · <span className="text-muted-foreground">Margin:</span> {snapshot?.gross_margin_percentage?.toFixed(1)}%</p>
              <p className="text-muted-foreground">Proposed new price will be calculated after confirmation.</p>
            </div>
            <p className="text-xs text-muted-foreground">This replaces the current draft calculation. Approved historical estimates are not affected.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecalcConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => { setRecalcConfirmOpen(false); calculateAllPackages(); }} disabled={calculating} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {calculating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Calculator className="w-4 h-4 mr-1" />} Confirm Recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Management Pricing Override */}
      <Dialog open={policyOverrideOpen} onOpenChange={setPolicyOverrideOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Management Pricing Override — This Option Only</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <p>This override applies to <strong>this option and pricing calculation only</strong>. It never changes the global Pricing Policy, never alters another proposal option, and never applies to future jobs.</p>
              {activePolicy && <p className="mt-1 text-muted-foreground">Active policy: v{activePolicy.version_number} · {activePolicy.policy_name} ({(activePolicy.pricing_target_model || 'daily') === 'hourly_capped' ? `${activePolicy.gross_profit_target_per_crew_hour}/hr · 8h cap` : `${activePolicy.gross_profit_per_production_day}/day`}, {activePolicy.minimum_gross_margin_percentage}% margin).</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {activeModel === 'hourly_capped' ? (
                <div className="space-y-1.5">
                  <Label>Gross Profit Target per Crew Hour ($)</Label>
                  <Input type="number" step="any" min="0" value={policyOverride.gp_per_hour} onChange={e => setPolicyOverride(p => ({ ...p, gp_per_hour: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">8-hour daily cap is fixed and not overridable.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Gross Profit / Production Day ($)</Label>
                  <Input type="number" step="any" min="0" value={policyOverride.gp_per_day} onChange={e => setPolicyOverride(p => ({ ...p, gp_per_day: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Minimum Gross Margin (%)</Label>
                <Input type="number" step="any" min="0" max="100" value={policyOverride.min_margin} onChange={e => setPolicyOverride(p => ({ ...p, min_margin: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Override Reason (required)</Label>
              <Textarea rows={3} value={policyOverride.reason} onChange={e => setPolicyOverride(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Management-approved margin adjustment for this job" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOverrideOpen(false)}>Cancel</Button>
            <Button onClick={applyPolicyOverride} className="bg-amber-600 text-white hover:bg-amber-700">Apply Override & Recalculate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}