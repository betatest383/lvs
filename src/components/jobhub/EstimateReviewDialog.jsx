import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, DollarSign, AlertTriangle, ArrowRight, Save, FileCheck, RefreshCw, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import DraftEstimateItemCard from './DraftEstimateItemCard';
import EstimateReviewDiagnostics from './EstimateReviewDiagnostics';

const RESOLVED_STATUSES = ['ready', 'approved', 'deferred', 'rejected'];
const OPTION_ORDER = { good: 0, better: 1, best: 2, standalone: 3 };
const optionLabel = (optionType) => ({ good: 'Good', better: 'Better', best: 'Best' }[optionType] || 'Option');
const parseItemIds = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

export default function EstimateReviewDialog({
  open, onClose, onContinue, jobId, estimate, repairRecs, scopeOfWork, onRefresh, onEditScope,
}) {
  const { isDevToolsVisible } = useDeveloperMode();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [items, setItems] = useState([]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [currentEstimate, setCurrentEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [estimateName, setEstimateName] = useState('');
  const [packages, setPackages] = useState([]);
  const [packageScopes, setPackageScopes] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState(null);

  useEffect(() => {
    if (!open || !jobId) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      setDiagnostic(null);

      try {
        // Load service catalog
        const services = await base44.entities.ServiceCatalog.filter({ is_active: true }).catch(() => []);
        if (cancelled) return;
        setServiceCatalog(services);

        // Find existing estimate
        let est = estimate;
        if (!est) {
          const estimates = await base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
          est = estimates[0] || null;
        }

        // If no estimate, try auto-build as fallback
        if (!est) {
          try {
            const response = await base44.functions.invoke('autoBuildDraftEstimate', { job_id: jobId });
            if (response.data?.status === 'error') {
              setError(response.data.error || 'Failed to auto-build draft estimate.');
              setDiagnostic(response.data.diagnostic);
              setLoading(false);
              return;
            }
            if (response.data?.estimate_id) {
              est = await base44.entities.Estimate.get(response.data.estimate_id).catch(() => null);
              setDiagnostic(response.data.diagnostic);
              await onRefresh?.();
            }
          } catch (e) {
            setError('No draft estimate found. Complete Recommendation Review first.');
            setLoading(false);
            return;
          }
        }

        if (!est) {
          setError('Draft estimate could not be loaded.');
          setLoading(false);
          return;
        }

        setCurrentEstimate(est);

        // Final Estimate Review is option-based. The EstimatePackage record is the
        // authoritative customer option; the legacy Estimate remains only as its container.
        const [draftItems, packageRecords, scopeRecords] = await Promise.all([
          base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
          base44.entities.EstimatePackage.filter({ job_id: jobId, is_authoritative: true }).catch(() => []),
          base44.entities.ScopeOfWork.filter({ job_id: jobId }).catch(() => []),
        ]);
        if (cancelled) return;
        draftItems.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const activePackages = packageRecords
          .filter(pkg => pkg.status !== 'archived' && ['good', 'better', 'best'].includes(pkg.option_type))
          .sort((a, b) => (OPTION_ORDER[a.option_type] ?? 9) - (OPTION_ORDER[b.option_type] ?? 9) || (a.sort_order || 0) - (b.sort_order || 0));
        setItems(draftItems);
        setPackages(activePackages);
        setPackageScopes(scopeRecords);
        const initialPackage = activePackages[0] || null;
        setSelectedPackageId(initialPackage?.id || null);
        setEstimateName((initialPackage?.name || est?.estimate_name || '').toString().trim().slice(0, 120));

        if (!diagnostic) {
          setDiagnostic({
            job_id: jobId,
            inspection_id: est.inspection_id || null,
            draft_estimate_id: est.id,
            draft_estimate_item_count: draftItems.length,
            current_workflow_stage: 'estimate_review',
            next_workflow_stage: 'execution_plan',
          });
        }
      } catch (e) {
        setError(e.message || 'Failed to load estimate review');
      }
      setLoading(false);
    };

    if (!cancelled) init();
    return () => { cancelled = true; };
  }, [open, jobId, estimate]);

  const selectedPackage = packages.find(pkg => pkg.id === selectedPackageId) || null;
  const selectedScope = selectedPackage
    ? packageScopes.find(scope => scope.id === selectedPackage.scope_of_work_id || scope.estimate_package_id === selectedPackage.id)
    : scopeOfWork;
  const reviewItems = useMemo(() => {
    if (!selectedPackage) return items;
    const includedIds = parseItemIds(selectedPackage.estimate_item_ids);
    if (includedIds.length > 0) return items.filter(item => includedIds.includes(item.id));
    return items.filter(item => item.proposal_tier === selectedPackage.option_type);
  }, [items, selectedPackage]);

  const choosePackage = useCallback((pkg) => {
    setSelectedPackageId(pkg.id);
    setEstimateName((pkg.name || optionLabel(pkg.option_type)).toString().slice(0, 120));
  }, []);

  // Update item locally (no backend save until Save/Continue)
  const handleUpdateItem = useCallback((itemId, updates) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
  }, []);

  // Action buttons save immediately to backend
  const handleItemAction = useCallback(async (itemId, status) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status } : i));
    try {
      await base44.entities.DraftEstimateItem.update(itemId, { status });
    } catch (e) {
      toast.error('Failed to update item status: ' + e.message);
    }
  }, []);

  // Save all changes to backend
  const handleSave = useCallback(async () => {
    if (!currentEstimate) return;
    const trimmedName = estimateName.trim().slice(0, 120);
    if (!trimmedName) {
      toast.error('Enter an Estimate Name before saving or sending this estimate.');
      return;
    }
    setSaving(true);
    try {
      // Save each item
      await Promise.all(reviewItems.map(item =>
        base44.entities.DraftEstimateItem.update(item.id, {
          service_catalog_id: item.service_catalog_id,
          service_name: item.service_name,
          service_code: item.service_code,
          service_description: item.service_description,
          customer_facing_summary: item.customer_facing_summary,
          estimated_time_hours: item.estimated_time_hours,
          estimated_time_minutes: item.estimated_time_minutes,
          service_price: item.service_price,
          service_commission_type: item.service_commission_type,
          service_commission_value: item.service_commission_value,
          service_commission_amount: item.service_commission_amount,
          materials: item.materials,
          chargeable_materials_total: item.chargeable_materials_total,
          internal_materials_total: item.internal_materials_total,
          material_commission_amount: item.material_commission_amount,
          total_item_price: item.total_item_price,
          is_service_only: item.is_service_only,
          status: item.status,
        }).catch(() => {})
      ));

      // A customer option has its own name. Do not overwrite the one legacy
      // Estimate name when saving Good, Better, or Best.
      if (selectedPackage) {
        await base44.entities.EstimatePackage.update(selectedPackage.id, { name: trimmedName });
        setPackages(prev => prev.map(pkg => pkg.id === selectedPackage.id ? { ...pkg, name: trimmedName } : pkg));
      } else {
        const updated = await base44.entities.Estimate.update(currentEstimate.id, { estimate_name: trimmedName, status: 'draft' });
        setCurrentEstimate(updated);
      }
      toast.success(selectedPackage ? optionLabel(selectedPackage.option_type) + ' option saved' : 'Estimate saved');
      await onRefresh?.();
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
    setSaving(false);
  }, [currentEstimate, reviewItems, selectedPackage, onRefresh, estimateName]);

  // Continue: validate all resolved, save, proceed
  const handleContinue = useCallback(async () => {
    const unresolved = items.filter(i => !RESOLVED_STATUSES.includes(i.status));
    if (unresolved.length > 0) {
      toast.error('Some estimate items require review before continuing. Approve, edit, defer, or reject each item.');
      return;
    }
    const trimmedName = estimateName.trim().slice(0, 120);
    if (!trimmedName) {
      toast.error('Enter an Estimate Name before saving or sending this estimate.');
      return;
    }

    setSaving(true);
    try {
      // Auto-convert ready items to approved
      const finalizedItems = items.map(item =>
        item.status === 'ready' ? { ...item, status: 'approved' } : item
      );

      // Save all items with finalized statuses
      await Promise.all(finalizedItems.map(item =>
        base44.entities.DraftEstimateItem.update(item.id, {
          service_catalog_id: item.service_catalog_id,
          service_name: item.service_name,
          service_price: item.service_price,
          service_commission_amount: item.service_commission_amount,
          materials: item.materials,
          chargeable_materials_total: item.chargeable_materials_total,
          internal_materials_total: item.internal_materials_total,
          material_commission_amount: item.material_commission_amount,
          total_item_price: item.total_item_price,
          is_service_only: item.is_service_only,
          customer_facing_summary: item.customer_facing_summary,
          status: item.status,
        }).catch(() => {})
      ));

      // Update local state
      setItems(finalizedItems);

      // Save estimate as reviewed (execution_plan status = reviewed and ready for execution planning)
      if (currentEstimate) {
        const subtotal = finalizedItems.filter(i => i.status !== 'rejected')
          .reduce((sum, i) => sum + (i.total_item_price || 0), 0);
        await base44.entities.Estimate.update(currentEstimate.id, {
          line_items: JSON.stringify(finalizedItems.map(i => ({
            description: i.service_name,
            customer_description: i.customer_facing_summary,
            quantity: i.quantity || 1,
            unit: 'ea',
            unit_price: i.service_price || 0,
            line_total: i.total_item_price || 0,
            option_tier: i.proposal_tier || 'standalone',
            customer_facing: true,
            needs_pricebook_mapping: false,
          }))),
          subtotal,
          total: subtotal,
          status: 'execution_plan',
        });
        if (selectedPackage) {
          await base44.entities.EstimatePackage.update(selectedPackage.id, { name: trimmedName });
          setPackages(prev => prev.map(pkg => pkg.id === selectedPackage.id ? { ...pkg, name: trimmedName } : pkg));
        }
      }

      await onContinue();
    } catch (e) {
      toast.error('Failed to continue: ' + e.message);
    }
    setSaving(false);
  }, [items, currentEstimate, selectedPackage, onContinue, estimateName]);

  // Computed values
  const diagCounts = {
    items_ready: items.filter(i => i.status === 'ready').length,
    items_suggested: items.filter(i => i.status === 'suggested_service').length,
    items_manual_review: items.filter(i => i.status === 'manual_review').length,
    items_missing_price: items.filter(i => i.status === 'missing_price').length,
    items_approved: items.filter(i => i.status === 'approved').length,
    items_deferred: items.filter(i => i.status === 'deferred').length,
    items_rejected: items.filter(i => i.status === 'rejected').length,
  };

  const unresolvedCount = items.filter(i => !RESOLVED_STATUSES.includes(i.status)).length;
  const subtotal = reviewItems.filter(i => i.status !== 'rejected')
    .reduce((sum, i) => sum + (i.total_item_price || 0), 0);
  const totalCommission = reviewItems.filter(i => i.status !== 'rejected')
    .reduce((sum, i) => sum + (i.service_commission_amount || 0) + (i.material_commission_amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-accent" /> Estimate Review
            {currentEstimate && (
              <Badge variant="outline" className="text-[10px] ml-2 capitalize">
                {currentEstimate.status?.replace(/_/g, ' ')}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Loading estimate review...</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="w-5 h-5" />
                <p className="font-medium text-sm">Estimate Review Cannot Open</p>
              </div>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : (
            <>
              {packages.length > 0 && (
                <div className="grid md:grid-cols-3 gap-3">
                  {packages.map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => choosePackage(pkg)}
                      className="rounded-lg border-2 border-border p-3 text-left transition-all hover:border-accent/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{optionLabel(pkg.option_type)}</span>
                        {pkg.id === selectedPackageId && <Badge className="text-[10px]">Reviewing</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">{pkg.name || optionLabel(pkg.option_type) + ' Option'}</p>
                      <p className="mt-2 text-sm font-bold">&#36;{Number(pkg.selling_price || 0).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Option Name */}
              <Card className="border-l-4 border-l-accent/60">
                <CardContent className="p-3 space-y-1.5">
                  <Label htmlFor="estimate-name" className="text-sm font-semibold">
                    {selectedPackage ? optionLabel(selectedPackage.option_type) + ' Option Name' : 'Estimate Name'}
                  </Label>
                  <Input
                    id="estimate-name"
                    type="text"
                    maxLength={120}
                    placeholder="Example: Crown Repair Option"
                    value={estimateName}
                    onChange={(e) => setEstimateName(e.target.value.slice(0, 120))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedPackage ? 'This option name appears on the customer proposal. Good, Better, and Best each keep their own name.' : 'This name will identify the estimate in ServiceTitan.'}
                  </p>
                </CardContent>
              </Card>

              {/* Scope of Work Summary */}
              {selectedScope && (
                <Card className="border-l-4 border-l-blue-400 bg-blue-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-semibold">Scope of Work Summary</p>
                        <Badge variant="outline" className="text-[10px]">{selectedScope.status || 'generated'}</Badge>
                      </div>
                      {onEditScope && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => onEditScope(selectedPackage?.id)}>
                          <Edit className="w-3 h-3" /> Edit Scope
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total Hours:</span>{' '}
                        <span className="font-semibold">{selectedScope.total_estimated_hours || 0}h</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Crew Required:</span>{' '}
                        <span className="font-semibold">{selectedScope.total_crew_required || 1}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Source:</span>{' '}
                        <span className="font-semibold capitalize">{(selectedScope.generated_from || 'scope_builder').replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {unresolvedCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    {unresolvedCount} item(s) require review before continuing. Approve, edit, defer, or reject each item.
                  </p>
                </div>
              )}

              {reviewItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                  {selectedPackage ? 'No deficiencies are assigned to this option. Return to Estimate Package Builder and add the appropriate items.' : 'No estimate items found. Complete Recommendation Review to auto-build the draft estimate.'}
                </div>
              ) : (
                reviewItems.map(item => (
                  <DraftEstimateItemCard
                    key={item.id}
                    item={item}
                    serviceCatalog={serviceCatalog}
                    onUpdate={handleUpdateItem}
                    onAction={handleItemAction}
                  />
                ))
              )}

              {/* Pricing summary — base items are not the customer-facing final price. */}
              {reviewItems.length > 0 && (
                <div className="grid md:grid-cols-2 gap-3 border-t pt-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">{selectedPackage ? optionLabel(selectedPackage.option_type) + ' Base Scope Total' : 'Estimate Base Total'}</p>
                    <p className="text-xl font-bold">${subtotal.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Services and chargeable materials before Dynamic Pricing.</p>
                  </div>
                  {selectedPackage && (
                    <div className="rounded-lg border-2 border-accent bg-accent/5 p-3 text-sm">
                      <p className="text-xs font-medium text-accent">Final Dynamic Selling Price</p>
                      <p className="text-2xl font-bold">${Number(selectedPackage.selling_price || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">The price shown to the customer and used at Customer Decision.</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground md:col-span-2">Total Commission: ${totalCommission.toFixed(2)}</p>
                </div>
              )}

              {isDevToolsVisible && (
                <EstimateReviewDiagnostics
                  diagnostic={{
                    ...diagnostic,
                    ...diagCounts,
                    draft_estimate_item_count: items.length,
                    draft_estimate_status: currentEstimate?.status || '—',
                    resolved_item_count: items.filter(i => RESOLVED_STATUSES.includes(i.status)).length,
                    unresolved_item_count: unresolvedCount,
                    computed_next_action: unresolvedCount === 0 ? 'Continue to Execution Plan' : 'Resolve remaining items',
                    navigation_target: unresolvedCount === 0 ? 'execution_plan' : 'estimate_review (blocked)',
                  }}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4 flex items-center justify-between flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!error && reviewItems.length > 0 && (
            <div className="flex gap-2">
              {onEditScope && (
                <Button variant="outline" className="gap-1.5" onClick={() => onEditScope(selectedPackage?.id)} disabled={saving}>
                  <Edit className="w-4 h-4" /> Edit Scope
                </Button>
              )}
              <Button variant="outline" className="gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
              <Button
                className="gap-1.5"
                onClick={handleContinue}
                disabled={saving || unresolvedCount > 0}
                title={unresolvedCount > 0 ? `${unresolvedCount} unresolved item(s)` : 'Continue to Proposal Builder'}
              >
                <ArrowRight className="w-4 h-4" /> Continue to Proposal Builder
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}