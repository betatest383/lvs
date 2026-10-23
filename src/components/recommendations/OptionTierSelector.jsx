import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

const TIER_CONFIG = {
  good: { label: 'Good', color: 'bg-green-100 text-green-700 border-green-200', ring: 'ring-green-400' },
  better: { label: 'Better', color: 'bg-blue-100 text-blue-700 border-blue-200', ring: 'ring-blue-400' },
  best: { label: 'Best', color: 'bg-purple-100 text-purple-700 border-purple-200', ring: 'ring-purple-400' },
  standalone: { label: 'Recommended', color: 'bg-accent/20 text-accent-foreground border-accent/30', ring: 'ring-accent' },
};

export default function OptionTierSelector({ options, selectedTier, onSelect }) {
  if (!options || options.length === 0) {
    return <p className="text-xs text-muted-foreground">No options available — manual review required.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Good / Better / Best Options</p>
      <div className="grid gap-2">
        {options.map((opt, i) => {
          const tier = TIER_CONFIG[opt.tier] || TIER_CONFIG.standalone;
          const isSelected = selectedTier === opt.tier;
          return (
            <button
              key={i}
              onClick={() => onSelect(opt.tier)}
              disabled={opt.disabled}
              className={`text-left border rounded-lg p-2.5 transition-all ${
                isSelected
                  ? `border-transparent ring-2 ${tier.ring} bg-background`
                  : 'border-border hover:border-muted-foreground/30 bg-background/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${tier.color}`}>{tier.label}</Badge>
                  {isSelected && <Check className="w-3.5 h-3.5 text-green-600" />}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-sm">${(opt.line_total || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">${(opt.unit_price || 0).toFixed(2)}/{opt.unit}</p>
                </div>
              </div>
              <p className="text-xs font-medium mt-1">{opt.label || opt.pricebook_item_name}</p>
              {opt.customer_description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opt.customer_description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}