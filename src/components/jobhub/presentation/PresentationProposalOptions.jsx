import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Crown, Award, Star, Package, CheckCircle2, ChevronDown, ChevronUp, Columns3,
} from 'lucide-react';
import {
  collectTemplateServiceRefs,
  matchTemplateToEstimateItems,
} from '@/lib/proposalMatching';
import { safeArray } from '@/lib/safeUtils';
import ProposalOptionDetails from './ProposalOptionDetails';
import ProposalOptionCompare from './ProposalOptionCompare';

const TIER_CONFIG = {
  good: { label: 'Good', icon: Award, color: 'text-blue-600', border: 'border-blue-300', bg: 'bg-blue-50/50' },
  better: { label: 'Better', icon: Star, color: 'text-purple-600', border: 'border-purple-300', bg: 'bg-purple-50/50' },
  best: { label: 'Best', icon: Crown, color: 'text-amber-600', border: 'border-amber-300', bg: 'bg-amber-50/50' },
  standalone: { label: 'Standalone', icon: Package, color: 'text-slate-600', border: 'border-slate-300', bg: 'bg-slate-50/50' },
};

function parseIds(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

// Customer presentation must use the saved authoritative package membership.
// Templates are for creating options; re-matching templates here can include the
// same repair more than once or resurrect standalone drafts.
function buildPackages(estimatePackages, draftEstimateItems) {
  const itemById = new Map((draftEstimateItems || []).map(item => [item.id, item]));

  return ['good', 'better', 'best'].map(level => {
    const pkg = (estimatePackages || []).find(p =>
      p.option_type === level && p.is_authoritative && !p.is_legacy && !p.superseded_by_id
    );
    if (!pkg) return null;

    const seen = new Set();
    const matchedItems = parseIds(pkg.estimate_item_ids)
      .map(id => itemById.get(id))
      .filter(item => item && !seen.has(item.id) && seen.add(item.id));

    let includedMaterials = [];
    try { includedMaterials = JSON.parse(pkg.included_materials || '[]'); } catch { includedMaterials = []; }

    return {
      level,
      option: { option_title: pkg.name, customer_description: pkg.notes || '', financing_available: false },
      matchedItems,
      includedMaterials: safeArray(includedMaterials),
      // Dynamic Pricing is the customer-facing price; item totals remain base scope cost.
      totalPrice: Number(pkg.selling_price ?? pkg.subtotal ?? 0),
    };
  }).filter(Boolean);
}

export default function PresentationProposalOptions({
  estimatePackages, draftEstimateItems, selectedTier, onSelectTier,
}) {
  const [expandedTier, setExpandedTier] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  const packages = useMemo(
    () => buildPackages(estimatePackages, draftEstimateItems),
    [estimatePackages, draftEstimateItems]
  );

  const toggleExpand = (level) => {
    setExpandedTier(prev => prev === level ? null : level);
  };

  // Authoritative package-based options
  if (packages.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={showCompare ? 'default' : 'outline'}
            className="gap-1"
            onClick={() => setShowCompare(!showCompare)}
          >
            <Columns3 className="w-3.5 h-3.5" /> {showCompare ? 'Hide' : 'Compare'} Options
          </Button>
        </div>

        {showCompare ? (
          <Card>
            <CardContent className="p-3">
              <ProposalOptionCompare
                packages={packages}
                selectedTier={selectedTier}
                onSelectTier={onSelectTier}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {packages.map(pkg => {
              const cfg = TIER_CONFIG[pkg.level];
              const Icon = cfg.icon;
              const isSelected = selectedTier === pkg.level;
              const isExpanded = expandedTier === pkg.level;

              return (
                <Card
                  key={pkg.level}
                  className={`border-2 ${cfg.border} ${isSelected ? 'ring-2 ring-accent' : ''} transition-all flex flex-col`}
                >
                  <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
                    {/* Header — clickable to select */}
                    <div
                      className="cursor-pointer"
                      onClick={() => onSelectTier(pkg.level)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                          <span className="font-semibold text-sm">{cfg.label}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-accent" />}
                        </div>
                        <Badge variant="outline" className="text-xs">${pkg.totalPrice.toFixed(2)}</Badge>
                      </div>
                      <p className="font-medium text-sm mt-1">{pkg.option.option_title}</p>
                      {pkg.option.customer_description && (
                        <p className="text-xs text-muted-foreground">{pkg.option.customer_description}</p>
                      )}
                    </div>

                    {/* Expand/Collapse button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full gap-1 text-xs h-7"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(pkg.level); }}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Collapse' : 'Expand'} Details
                    </Button>

                    {/* Expanded details */}
                    {isExpanded && <ProposalOptionDetails pkg={pkg} />}

                    {/* Select button at bottom */}
                    <div className="mt-auto pt-2">
                      {isSelected ? (
                        <Button size="sm" className="w-full gap-1" disabled>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => onSelectTier(pkg.level)}>
                          Select {cfg.label}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Fallback: item-based tier groups
  const items = draftEstimateItems || [];
  const tiers = ['good', 'better', 'best', 'standalone']
    .map(tier => ({
      tier,
      config: TIER_CONFIG[tier],
      items: items.filter(i => (i.proposal_tier || 'standalone') === tier),
    }))
    .filter(g => g.items.length > 0);

  if (tiers.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground italic">No proposal options configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-3">
      {tiers.map(({ tier, config, items }) => {
        const Icon = config.icon;
        const isSelected = selectedTier === tier;
        const isExpanded = expandedTier === tier;
        const total = items.reduce((sum, i) => sum + (i.total_item_price || 0), 0);

        return (
          <Card
            key={tier}
            className={`border-2 ${config.border} ${isSelected ? 'ring-2 ring-accent' : ''} transition-all flex flex-col`}
          >
            <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
              <div className="cursor-pointer" onClick={() => onSelectTier(tier)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="font-semibold text-sm">{config.label}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </div>
                  <Badge variant="outline" className="text-xs">${total.toFixed(2)}</Badge>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="w-full gap-1 text-xs h-7"
                onClick={(e) => { e.stopPropagation(); toggleExpand(tier); }}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {isExpanded ? 'Collapse' : 'Expand'} Details
              </Button>

              {isExpanded && (
                <ProposalOptionDetails
                  pkg={{
                    level: tier,
                    option: { financing_available: false },
                    matchedItems: items,
                    includedMaterials: [],
                    totalPrice: total,
                  }}
                />
              )}

              {!isExpanded && items.map(item => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span>{item.service_name}</span>
                  <span className="text-muted-foreground">${(item.total_item_price || 0).toFixed(2)}</span>
                </div>
              ))}

              <div className="mt-auto pt-2">
                {isSelected ? (
                  <Button size="sm" className="w-full gap-1" disabled>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => onSelectTier(tier)}>
                    Select {config.label}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}