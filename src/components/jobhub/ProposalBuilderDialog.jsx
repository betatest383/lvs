import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Layers, ArrowRight, Crown, Award, Star, Package, CheckCircle2, Clock, Shield, Plus, Wrench, AlertCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  collectTemplateServiceRefs,
  matchTemplateToEstimateItems,
  buildPackageDiagnostics,
} from '@/lib/proposalMatching';
import { safeArray } from '@/lib/safeUtils';
import { getStalePackages } from '@/lib/estimatePackageWorkflow';
import StalePackageWarning from './StalePackageWarning';
import EstimateGroupReview from './EstimateGroupReview';
import EstimateGroupDiagnostics from './EstimateGroupDiagnostics';

const TIER_CONFIG = {
  good: { label: 'Good', icon: Award, color: 'text-blue-600', border: 'border-blue-300', bg: 'bg-blue-50/50' },
  better: { label: 'Better', icon: Star, color: 'text-purple-600', border: 'border-purple-300', bg: 'bg-purple-50/50' },
  best: { label: 'Best', icon: Crown, color: 'text-amber-600', border: 'border-amber-300', bg: 'bg-amber-50/50' },
  standalone: { label: 'Standalone', icon: Package, color: 'text-slate-600', border: 'border-slate-300', bg: 'bg-slate-50/50' },
};

export default function ProposalBuilderDialog({
  open, onClose, onContinue, jobId, estimate, draftEstimateItems, onRefresh,
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [optionTemplates, setOptionTemplates] = useState([]);
  const [selectedTier, setSelectedTier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stalePackages, setStalePackages] = useState([]);
  const [showGroupReview, setShowGroupReview] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load EstimatePackage records to detect stale packages
        const packages = await base44.entities.EstimatePackage
          .filter({ job_id: jobId, is_authoritative: true })
          .catch(() => []);
        setStalePackages(getStalePackages(packages));
        let draftItems = draftEstimateItems;
        if (!draftItems || draftEstimateItems.length === 0) {
          draftItems = await base44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []);
        }
        // Package membership is authoritative. Hide a stray standalone item when
        // the same recommendation is already represented by an assigned package item.
        const assignedItemIds = new Set();
        for (const pkg of packages) {
          try {
            for (const id of JSON.parse(pkg.estimate_item_ids || '[]')) assignedItemIds.add(id);
          } catch { /* malformed legacy membership is handled elsewhere */ }
        }
        const assignedRecommendationIds = new Set(
          draftItems
            .filter(item => assignedItemIds.has(item.id))
            .map(item => item.repair_system_recommendation_id || item.recommendation_review_item_id)
            .filter(Boolean)
        );
        const active = draftItems.filter(item => {
          if (item.status === 'rejected') return false;
          const recommendationId = item.repair_system_recommendation_id || item.recommendation_review_item_id;
          return !(item.proposal_tier === 'standalone' && recommendationId && assignedRecommendationIds.has(recommendationId));
        });
        active.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setItems(active);

        // Load ProposalOptionTemplates linked to the matched RepairRecommendationTemplates
        const templateIds = [...new Set(
          active.map(i => i.repair_recommendation_template_id).filter(Boolean)
        )];
        if (templateIds.length > 0) {
          const allOptions = [];
          for (const tid of templateIds) {
            const opts = await base44.entities.ProposalOptionTemplate
              .filter({ linked_repair_recommendation_template_id: tid, is_active: true })
              .catch(() => []);
            allOptions.push(...opts);
          }
          allOptions.sort((a, b) => {
            const order = { good: 0, better: 1, best: 2 };
            return (order[a.proposal_level] ?? 3) - (order[b.proposal_level] ?? 3)
              || (a.display_order || 0) - (b.display_order || 0);
          });
          setOptionTemplates(allOptions);
          // Pre-select the default option
          const defaultOpt = allOptions.find(o => o.default_selected);
          if (defaultOpt) setSelectedTier(defaultOpt.proposal_level);
        } else {
          setOptionTemplates([]);
        }
      } catch (e) {
        toast.error('Failed to load proposal data');
      }
      setLoading(false);
    };
    load();
  }, [open, jobId, draftEstimateItems]);

  // Determine if we have template-based options
  const hasTemplateOptions = optionTemplates.length > 0;

  // Build template-based package cards
  const templatePackages = useMemo(() => {
    if (!hasTemplateOptions) return [];
    return ['good', 'better', 'best'].map(level => {
      const opt = optionTemplates.find(o => o.proposal_level === level);
      if (!opt) return null;

      // Collect all service refs from the template (included, optional, recommended)
      const serviceRefs = collectTemplateServiceRefs(opt);

      // Match against estimate items
      const matchResult = matchTemplateToEstimateItems(serviceRefs, items);
      const matchedItems = matchResult.matched.map(m => m.item);
      const unmatchedRefs = matchResult.unmatched.map(u => u.ref);

      // Materials
      let includedMaterials = [];
      try { includedMaterials = JSON.parse(opt.included_materials || '[]'); } catch { includedMaterials = []; }

      const totalPrice = matchedItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0);
      const diagnostics = buildPackageDiagnostics(opt, serviceRefs, items, matchResult);

      return {
        level,
        option: opt,
        matchedItems,
        unmatchedRefs,
        serviceRefs,
        includedMaterials: safeArray(includedMaterials),
        totalPrice,
        diagnostics,
      };
    }).filter(Boolean);
  }, [optionTemplates, items, hasTemplateOptions]);

  // Fallback: item-based grouping
  const itemTierGroups = useMemo(() => {
    return ['good', 'better', 'best', 'standalone'].map(tier => ({
      tier,
      config: TIER_CONFIG[tier],
      items: items.filter(i => (i.proposal_tier || 'standalone') === tier),
    }));
  }, [items]);

  const itemTotalByTier = itemTierGroups.reduce((acc, g) => {
    acc[g.tier] = g.items.reduce((sum, i) => sum + (i.total_item_price || 0), 0);
    return acc;
  }, {});

  const handleItemTierChange = useCallback((itemId, tier) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, proposal_tier: tier } : i));
  }, []);

  const handleContinue = useCallback(async () => {
    setSaving(true);
    try {
      let selectedPackage = null;

      if (hasTemplateOptions && selectedTier) {
        selectedPackage = templatePackages.find(p => p.level === selectedTier);

        // Auto-add unmatched package services to DraftEstimateItems (prevent duplicates)
        if (selectedPackage && selectedPackage.unmatchedRefs.length > 0) {
          const estimates = await base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
          const est = estimates[0];
          if (est) {
            const newItems = [];
            for (const ref of selectedPackage.unmatchedRefs) {
              // Prevent duplicates: skip if a DraftEstimateItem already exists for this service
              const exists = items.some(i =>
                (ref.id && i.service_catalog_id === ref.id) ||
                (ref.name && i.service_name === ref.name)
              );
              if (exists) continue;

              let svc = null;
              if (ref.id) svc = await base44.entities.ServiceCatalog.get(ref.id).catch(() => null);
              if (!svc && ref.name) {
                const byName = await base44.entities.ServiceCatalog.filter({ service_name: ref.name }).catch(() => []);
                if (byName.length > 0) svc = byName[0];
              }

              const price = svc?.default_selling_price || 0;
              const cost = svc?.internal_cost || 0;
              newItems.push({
                estimate_id: est.id,
                job_id: jobId,
                customer_id: est.customer_id,
                service_catalog_id: ref.id || svc?.id || '',
                service_name: ref.name || svc?.service_name || 'Additional Service',
                service_code: svc?.service_code || '',
                service_description: svc?.description || '',
                customer_description: svc?.customer_description || '',
                service_price: price,
                internal_cost: cost,
                gross_profit: price - cost,
                gross_margin: price > 0 ? ((price - cost) / price) * 100 : 0,
                total_item_price: price,
                quantity: 1,
                proposal_tier: selectedTier,
                status: 'ready',
                sort_order: 999,
              });
            }
            if (newItems.length > 0) {
              await base44.entities.DraftEstimateItem.bulkCreate(newItems);
              toast.success(`Auto-added ${newItems.length} service(s) from ${TIER_CONFIG[selectedTier].label} package.`);
            }
          }
        }

        // Assign all items to the selected tier
        await Promise.all(items.map(item =>
          base44.entities.DraftEstimateItem.update(item.id, {
            proposal_tier: selectedTier,
            customer_description: item.customer_description || '',
          }).catch(() => {})
        ));
      } else {
        // Item-based: save per-item tier assignments
        await Promise.all(items.map(item =>
          base44.entities.DraftEstimateItem.update(item.id, {
            proposal_tier: item.proposal_tier || 'standalone',
            customer_description: item.customer_description || '',
          }).catch(() => {})
        ));
      }

      // Persist the selected option as an EstimatePackage record. This is required
      // for both template-based and manually grouped Good / Better / Best options;
      // Dynamic Pricing must never fall back to every draft item in the job.
      if (selectedTier && estimate) {
        // Reload draft items to include auto-added ones
        const refreshedItems = await base44.entities.DraftEstimateItem
          .filter({ job_id: jobId, status: { $ne: 'rejected' } })
          .catch(() => items);
        const tierItems = (selectedTier
          ? refreshedItems.filter(i => (i.proposal_tier || 'standalone') === selectedTier)
          : refreshedItems
        ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const totalPrice = tierItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0);
        const itemIds = tierItems.map(i => i.id);
        const serviceIds = [...new Set(tierItems.map(i => i.service_catalog_id).filter(Boolean))];

        // Deselect all existing packages for this job
        const existingPkgs = await base44.entities.EstimatePackage
          .filter({ job_id: jobId }).catch(() => []);
        await Promise.all(existingPkgs
          .filter(p => p.is_selected)
          .map(p => base44.entities.EstimatePackage.update(p.id, { is_selected: false }).catch(() => {}))
        );

        // Update or create the selected package
        const pkgName = `${TIER_CONFIG[selectedTier].label} — ${selectedPackage?.option?.option_title || 'Selected Package'}`;
        const includedMaterials = tierItems.flatMap(item => {
          try { return JSON.parse(item.materials || '[]'); } catch { return []; }
        });
        const pkgData = {
          selling_price: totalPrice,
          subtotal: totalPrice,
          estimate_item_ids: JSON.stringify(itemIds),
          included_service_ids: JSON.stringify(serviceIds),
          included_materials: JSON.stringify(includedMaterials),
          // Customer selection happens later in Customer Presentation — never here.
          is_selected: false,
          status: 'priced',
          pricing_status: 'calculated',
          estimated_hours: tierItems.reduce((sum, i) => sum + (i.estimated_time_hours || 0), 0),
        };

        const existingPkg = existingPkgs.find(p => p.option_type === selectedTier && p.is_authoritative !== false);
        const savedPkg = existingPkg
          ? await base44.entities.EstimatePackage.update(existingPkg.id, pkgData)
          : await base44.entities.EstimatePackage.create({
              job_id: jobId,
              appointment_id: estimate.appointment_id || '',
              customer_id: estimate.customer_id || '',
              customer_name: estimate.customer_name || '',
              estimate_id: estimate.id,
              name: pkgName,
              option_type: selectedTier,
              is_authoritative: true,
              is_customer_facing: true,
              workflow_version: 'v2_package',
              ...pkgData,
            });

        // Keep live package line items in sync with the authoritative draft-item
        // membership. Material cost is copied from the material selections made in
        // Recommendation Review, so it is option-specific and usable by Pricing.
        const packageId = savedPkg?.id || existingPkg?.id;
        if (packageId) {
          const existingPackageItems = await base44.entities.EstimatePackageItem
            .filter({ estimate_package_id: packageId }).catch(() => []);
          await Promise.all(tierItems.map((item, index) => {
            const itemData = {
              estimate_package_id: packageId,
              job_id: jobId,
              estimate_item_id: item.id,
              repair_recommendation_id: item.repair_recommendation_id || '',
              recommendation_title: item.recommendation_title || item.service_name || '',
              service_catalog_id: item.service_catalog_id || '',
              service_name: item.service_name || '',
              service_code: item.service_code || '',
              quantity: item.quantity || 1,
              material_cost: Number(item.chargeable_materials_total || 0),
              labor_cost: Number(item.internal_cost || 0),
              selling_price: Number(item.total_item_price || item.service_price || 0),
              customer_description: item.customer_description || '',
              internal_description: item.internal_notes || '',
              sort_order: index,
              workflow_version: 'v2_package',
            };
            const existingItem = existingPackageItems.find(p => p.estimate_item_id === item.id);
            return existingItem
              ? base44.entities.EstimatePackageItem.update(existingItem.id, itemData)
              : base44.entities.EstimatePackageItem.create(itemData);
          }));
        }
      }

      // In manual grouping mode, create every non-empty Good / Better / Best
      // package now. These are alternatives, not a customer selection; each gets
      // its own item membership and will be priced independently.
      if (estimate && !hasTemplateOptions) {
        const refreshedItems = await base44.entities.DraftEstimateItem
          .filter({ job_id: jobId, status: { $ne: 'rejected' } }).catch(() => items);
        const existingPkgs = await base44.entities.EstimatePackage.filter({ job_id: jobId }).catch(() => []);
        const optionGroups = ['good', 'better', 'best'].map(tier => ({
          tier,
          items: refreshedItems.filter(i => (i.proposal_tier || 'standalone') === tier)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        })).filter(group => group.items.length > 0);

        await Promise.all(optionGroups.map(async ({ tier, items: tierItems }) => {
          const itemIds = tierItems.map(i => i.id);
          const serviceIds = [...new Set(tierItems.map(i => i.service_catalog_id).filter(Boolean))];
          const includedMaterials = tierItems.flatMap(item => {
            try { return JSON.parse(item.materials || '[]'); } catch { return []; }
          });
          const pkgData = {
            name: `${TIER_CONFIG[tier].label} — Selected Package`,
            selling_price: tierItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0),
            subtotal: tierItems.reduce((sum, i) => sum + (i.total_item_price || 0), 0),
            estimate_item_ids: JSON.stringify(itemIds),
            included_service_ids: JSON.stringify(serviceIds),
            included_materials: JSON.stringify(includedMaterials),
            is_selected: false,
            status: 'priced',
            pricing_status: 'calculated',
            estimated_hours: tierItems.reduce((sum, i) => sum + (i.estimated_time_hours || 0), 0),
          };
          const existing = existingPkgs.find(p => p.option_type === tier && p.is_authoritative !== false);
          // Proposal Builder only confirms package composition. Once Dynamic Pricing
          // has calculated an option, preserve its final selling price and status.
          if (existing) await base44.entities.EstimatePackage.update(existing.id, {
            ...pkgData,
            selling_price: existing.selling_price,
            subtotal: existing.subtotal,
            pricing_status: existing.pricing_status,
            status: existing.status,
          });
          else await base44.entities.EstimatePackage.create({
            job_id: jobId, appointment_id: estimate.appointment_id || '',
            customer_id: estimate.customer_id || '', customer_name: estimate.customer_name || '',
            estimate_id: estimate.id, option_type: tier, is_authoritative: true,
            is_customer_facing: true, workflow_version: 'v2_package', ...pkgData,
          });
        }));
      }

      if (estimate) {
        await base44.entities.Estimate.update(estimate.id, {
          status: 'ready_for_presentation',
        });
      }

      await onRefresh?.();
      await onContinue();
    } catch (e) {
      toast.error('Failed to save proposal: ' + e.message);
    }
    setSaving(false);
  }, [items, estimate, onRefresh, onContinue, hasTemplateOptions, selectedTier, jobId, templatePackages]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" /> Proposal Builder
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {hasTemplateOptions
              ? 'Proposal options generated from repair recommendation templates. Select a package for customer presentation.'
              : 'Group estimate items into Good / Better / Best proposal packages for customer presentation.'}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {/* Estimate Group Review — shown before package options */}
          {showGroupReview && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent" />
                  <span className="text-sm font-semibold">Step 1: Review Estimate Groups</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowDiagnostics(!showDiagnostics)}>
                    {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowGroupReview(false)}>
                    Collapse
                  </Button>
                </div>
              </div>
              <EstimateGroupReview
                jobId={jobId}
                onContinue={() => setShowGroupReview(false)}
                onRefresh={onRefresh}
              />
              {showDiagnostics && (
                <EstimateGroupDiagnostics jobId={jobId} />
              )}
            </div>
          )}

          {!showGroupReview && (
            <button
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
              onClick={() => setShowGroupReview(true)}
            >
              <Layers className="w-3 h-3" /> Show Estimate Groups
            </button>
          )}

          {/* Divider between group review and proposal options */}
          {showGroupReview && (
            <div className="border-t pt-2">
              <p className="text-sm font-semibold text-muted-foreground">Step 2: Proposal Options</p>
            </div>
          )}

          {stalePackages.length > 0 && (
            <StalePackageWarning
              stalePackages={stalePackages}
              onRecalculate={onRefresh}
            />
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Loading proposal data...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
              No estimate items found. Complete Estimate Review first.
            </div>
          ) : hasTemplateOptions ? (
            <TemplatePackageView
              packages={templatePackages}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              allItems={items}
              jobId={jobId}
              onRefresh={onRefresh}
            />
          ) : (
            <ItemBasedView
              tierGroups={itemTierGroups}
              totalByTier={itemTotalByTier}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              onTierChange={handleItemTierChange}
            />
          )}
        </div>

        <DialogFooter className="border-t pt-4 flex items-center justify-between flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!loading && items.length > 0 && (
            <Button
              className="gap-1.5"
              onClick={handleContinue}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Confirm Options & Continue to Presentation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePackageView({ packages, selectedTier, onSelectTier, allItems, jobId, onRefresh }) {
  const assignedItemIds = new Set(packages.flatMap(p => p.matchedItems.map(i => i.id)));
  const unassignedItems = allItems.filter(i => !assignedItemIds.has(i.id));

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        {packages.map(pkg => (
          <PackageCard
            key={pkg.level}
            pkg={pkg}
            selectedTier={selectedTier}
            onSelectTier={onSelectTier}
            jobId={jobId}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      {unassignedItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Additional Items (not in any package)
          </p>
          <div className="space-y-1.5">
            {unassignedItems.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded border bg-white p-2 text-sm">
                <div>
                  <p className="font-medium">{item.service_name}</p>
                  <p className="text-xs text-muted-foreground">${(item.total_item_price || 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg, selectedTier, onSelectTier, jobId, onRefresh }) {
  const cfg = TIER_CONFIG[pkg.level];
  const Icon = cfg.icon;
  const isSelected = selectedTier === pkg.level;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [adding, setAdding] = useState(false);

  const hasConfiguredServices = pkg.serviceRefs.length > 0;
  const hasMatchedItems = pkg.matchedItems.length > 0;
  const hasUnmatchedRefs = pkg.unmatchedRefs.length > 0;

  const handleAddPackageServices = async (e) => {
    e.stopPropagation();
    if (!jobId) return;
    setAdding(true);
    try {
      // Find the estimate for this job
      const estimates = await base44.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
      const estimate = estimates[0];
      if (!estimate) {
        toast.error('No estimate found for this job.');
        setAdding(false);
        return;
      }

      // Create DraftEstimateItems for each unmatched service ref
      const newItems = [];
      for (const ref of pkg.unmatchedRefs) {
        // Try to find the service in ServiceCatalog by ID
        let serviceCatalogItem = null;
        if (ref.id) {
          try {
            const found = await base44.entities.ServiceCatalog.get(ref.id).catch(() => null);
            if (found) serviceCatalogItem = found;
          } catch {}
        }
        // If not found by ID, try by name
        if (!serviceCatalogItem && ref.name) {
          const byName = await base44.entities.ServiceCatalog
            .filter({ service_name: ref.name })
            .catch(() => []);
          if (byName.length > 0) serviceCatalogItem = byName[0];
        }

        const serviceName = ref.name || serviceCatalogItem?.service_name || 'Additional Service';
        const servicePrice = serviceCatalogItem?.default_selling_price || 0;
        const internalCost = serviceCatalogItem?.internal_cost || 0;

        newItems.push({
          estimate_id: estimate.id,
          job_id: jobId,
          customer_id: estimate.customer_id,
          service_catalog_id: ref.id || serviceCatalogItem?.id || '',
          service_name: serviceName,
          service_code: serviceCatalogItem?.service_code || '',
          service_description: serviceCatalogItem?.description || '',
          customer_description: serviceCatalogItem?.customer_description || '',
          service_price: servicePrice,
          internal_cost: internalCost,
          gross_profit: servicePrice - internalCost,
          gross_margin: servicePrice > 0 ? ((servicePrice - internalCost) / servicePrice) * 100 : 0,
          total_item_price: servicePrice,
          quantity: 1,
          proposal_tier: pkg.level,
          status: 'ready',
          sort_order: 999,
        });
      }

      if (newItems.length > 0) {
        await base44.entities.DraftEstimateItem.bulkCreate(newItems);
        toast.success(`Added ${newItems.length} service(s) from ${cfg.label} package to estimate.`);
        await onRefresh?.();
      } else {
        toast.info('No additional services to add.');
      }
    } catch (e) {
      toast.error('Failed to add package services: ' + e.message);
    }
    setAdding(false);
  };

  return (
    <Card
      className={`border-2 ${cfg.border} ${isSelected ? 'ring-2 ring-accent' : ''} cursor-pointer transition-all`}
      onClick={() => onSelectTier(pkg.level)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${cfg.color}`} />
            <span className="font-semibold text-sm">{cfg.label}</span>
            {isSelected && <CheckCircle2 className="w-4 h-4 text-accent" />}
          </div>
          <Badge variant="outline" className="text-xs">
            ${pkg.totalPrice.toFixed(2)}
          </Badge>
        </div>
        <p className="font-medium text-sm">{pkg.option.option_title}</p>
        {pkg.option.customer_description && (
          <p className="text-xs text-muted-foreground">{pkg.option.customer_description}</p>
        )}
        {pkg.option.customer_benefits && (
          <p className="text-xs text-green-700">✓ {pkg.option.customer_benefits}</p>
        )}
        {pkg.option.estimated_duration && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {pkg.option.estimated_duration}
          </p>
        )}
        {pkg.option.warranty_messaging && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="w-3 h-3" /> {pkg.option.warranty_messaging}
          </p>
        )}
        {pkg.option.financing_available && (
          <Badge variant="outline" className="text-[9px]">Financing Available</Badge>
        )}

        {/* Matched Estimate Items */}
        <div className="pt-1 border-t">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Matched Estimate Items</p>
          {hasMatchedItems ? (
            pkg.matchedItems.map(item => (
              <div key={item.id} className="flex justify-between text-xs">
                <span>{item.service_name}</span>
                <span className="text-muted-foreground">${(item.total_item_price || 0).toFixed(2)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No matched estimate items</p>
          )}
        </div>

        {/* Configured Services from Template (unmatched) */}
        {hasUnmatchedRefs && (
          <div className="pt-1 border-t">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Additional Service Included in This Option
            </p>
            {pkg.unmatchedRefs.map((ref, idx) => (
              <div key={idx} className="text-xs text-muted-foreground">
                {ref.name || ref.id || 'Unnamed service'}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] mt-1 gap-1"
              onClick={handleAddPackageServices}
              disabled={adding}
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add Package Services to Estimate
            </Button>
          </div>
        )}

        {/* Materials */}
        {pkg.includedMaterials.length > 0 && (
          <div className="pt-1 border-t">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Materials</p>
            {pkg.includedMaterials.map((mat, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span>{mat.material_name || mat.name || 'Material'}</span>
                <span className="text-muted-foreground">x{mat.quantity || 1}</span>
              </div>
            ))}
          </div>
        )}

        {/* No services at all warning */}
        {!hasConfiguredServices && !hasMatchedItems && (
          <div className="pt-1 border-t">
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> No services configured in this template.
            </p>
          </div>
        )}

        {/* Admin Diagnostics */}
        <div className="pt-1 border-t">
          <button
            className="text-[10px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setShowDiagnostics(!showDiagnostics); }}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showDiagnostics ? 'rotate-180' : ''}`} />
            Admin Diagnostics
          </button>
          {showDiagnostics && (
            <div className="mt-1 rounded border bg-muted/50 p-2 text-[10px] font-mono text-muted-foreground overflow-x-auto space-y-1">
              <div><span className="font-semibold">Template ID:</span> {pkg.diagnostics.templateId}</div>
              <div><span className="font-semibold">Level:</span> {pkg.diagnostics.proposalLevel}</div>
              <div>
                <span className="font-semibold">Raw included_services:</span>
                <pre className="whitespace-pre-wrap break-all mt-0.5">{pkg.diagnostics.rawIncludedServices}</pre>
              </div>
              <div>
                <span className="font-semibold">Raw optional_services:</span>
                <pre className="whitespace-pre-wrap break-all mt-0.5">{pkg.diagnostics.rawOptionalServices}</pre>
              </div>
              <div><span className="font-semibold">Recommended SVC ID:</span> {pkg.diagnostics.recommendedServiceCatalogId}</div>
              <div>
                <span className="font-semibold">Normalized Service Refs:</span>
                <ul className="list-disc list-inside mt-0.5">
                  {pkg.diagnostics.normalizedServiceRefs.map((r, i) => (
                    <li key={i}>id={r.id}, name={r.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-semibold">Estimate Item service_catalog_id values:</span>
                <ul className="list-disc list-inside mt-0.5">
                  {pkg.diagnostics.estimateItemServiceCatalogIds.map((id, i) => <li key={i}>{id}</li>)}
                </ul>
              </div>
              <div>
                <span className="font-semibold">Estimate Item service_name values:</span>
                <ul className="list-disc list-inside mt-0.5">
                  {pkg.diagnostics.estimateItemServiceNames.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
              <div>
                <span className="font-semibold">Match Results:</span>
                <ul className="list-disc list-inside mt-0.5">
                  {pkg.diagnostics.matchResults.map((m, i) => (
                    <li key={i} className={m.matched ? 'text-green-600' : 'text-red-600'}>
                      {m.matched ? '✓' : '✗'} ref(id={m.refId}, name={m.refName}) → {m.matched ? `${m.matchedItemName} (${m.matchedItemId})` : 'no match'}
                    </li>
                  ))}
                </ul>
              </div>
              <div><span className="font-semibold">Final Package Item Count:</span> {pkg.diagnostics.finalItemCount}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ItemBasedView({ tierGroups, totalByTier, selectedTier, onSelectTier, onTierChange }) {
  return (
    <>
      <div className="grid md:grid-cols-3 gap-3">
        {tierGroups.filter(g => g.tier !== 'standalone').map(group => {
          const Icon = group.config.icon;
          return (
            <Card key={group.tier} className={`border-2 ${group.config.border} ${selectedTier === group.tier ? 'ring-2 ring-accent' : ''} cursor-pointer`} onClick={() => onSelectTier(group.tier)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${group.config.color}`} />
                    <span className="font-semibold text-sm">{group.config.label}</span>
                    {selectedTier === group.tier && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    ${totalByTier[group.tier]?.toFixed(2) || '0.00'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {group.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No items in this tier</p>
                  ) : (
                    group.items.map(item => (
                      <div key={item.id} className="rounded border bg-white p-2 text-xs space-y-1">
                        <p className="font-medium">{item.service_name}</p>
                        <p className="text-muted-foreground">${(item.total_item_price || 0).toFixed(2)}</p>
                        {item.proposal_customer_benefits && (
                          <p className="text-[10px] text-muted-foreground">{item.proposal_customer_benefits}</p>
                        )}
                        {item.proposal_warranty_messaging && (
                          <p className="text-[10px] text-muted-foreground">Warranty: {item.proposal_warranty_messaging}</p>
                        )}
                        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={(e) => { e.stopPropagation(); onTierChange(item.id, 'standalone'); }}>
                          Remove from package
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {tierGroups.find(g => g.tier === 'standalone')?.items.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Unassigned Items
          </p>
          <div className="space-y-1.5">
            {tierGroups.find(g => g.tier === 'standalone').items.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded border bg-white p-2 text-sm">
                <div>
                  <p className="font-medium">{item.service_name}</p>
                  <p className="text-xs text-muted-foreground">${(item.total_item_price || 0).toFixed(2)}</p>
                </div>
                <div className="flex gap-1">
                  {['good', 'better', 'best'].map(tier => {
                    const cfg = TIER_CONFIG[tier];
                    const Icon = cfg.icon;
                    return (
                      <Button key={tier} variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { onTierChange(item.id, tier); onSelectTier(tier); }}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}