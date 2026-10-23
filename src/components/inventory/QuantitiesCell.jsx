import { ChevronRight, AlertTriangle } from 'lucide-react';
import { QUANTITY_BUCKETS, checkBalance } from '@/lib/inventoryMasterConstants';

/**
 * Expandable quantities cell for the Inventory List.
 * Collapsed: Owned + Available.
 * Expanded: all 7 buckets with color coding + balance check.
 */
export default function QuantitiesCell({ item, isOpen, onToggle }) {
  const owned = item.quantity_owned || 0;
  const available = item.quantity_available || 0;
  const balanced = checkBalance(item);
  const unit = item.unit || '';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-left w-full group"
      >
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
          <span className="tabular-nums">
            <span className="text-xs text-muted-foreground">Owned:</span>{' '}
            <span className="font-semibold">{owned}</span>
            {unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
          </span>
          <span className="tabular-nums">
            <span className="text-xs text-muted-foreground">Available:</span>{' '}
            <span className={`font-bold ${available === 0 ? 'text-red-600' : 'text-green-700'}`}>{available}</span>
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="mt-2 ml-5 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {QUANTITY_BUCKETS.map(bucket => {
              const val = item[bucket.key] || 0;
              return (
                <div key={bucket.key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${bucket.dot}`} />
                    <span className="text-muted-foreground truncate">{bucket.label}</span>
                  </div>
                  <span className={`tabular-nums font-medium ${bucket.color}`}>{val}</span>
                </div>
              );
            })}
          </div>

          <div className={`rounded-md px-2 py-1.5 text-xs ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {balanced ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Inventory Balanced
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                ⚠ Inventory Out of Balance
              </span>
            )}
            {!balanced && (
              <div className="mt-1 text-[10px] leading-tight text-red-600/80">
                Owned ({owned}) ≠ Avail ({item.quantity_available || 0}) + Res ({item.quantity_reserved || 0}) + Asg ({item.quantity_assigned || 0}) + Ord ({item.quantity_on_order || 0}) + Dmg ({item.quantity_damaged || 0}) + Ret ({item.quantity_retired || 0})
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}