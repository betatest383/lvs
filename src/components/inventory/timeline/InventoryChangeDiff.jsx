import { ArrowDown } from 'lucide-react';
import { parseQtySnapshot } from '@/lib/inventoryTimelineConstants';
import { getQtyChangeDiff } from '@/lib/auditUtils';
import { QUANTITY_BUCKETS } from '@/lib/inventoryMasterConstants';

/**
 * Displays before → after quantity snapshots for all 7 inventory buckets.
 * Changed fields are highlighted; unchanged fields are dimmed.
 */
export default function InventoryChangeDiff({ txn, item }) {
  const before = parseQtySnapshot(txn.quantity_before);
  const after = parseQtySnapshot(txn.quantity_after);
  const unit = item?.unit || 'ea';

  if (!before || !after) {
    return txn.quantity != null && txn.quantity !== 0 ? (
      <div className="text-xs">Qty: <strong className="tabular-nums">{txn.quantity}</strong> {unit}</div>
    ) : null;
  }

  const changes = getQtyChangeDiff(before, after);
  const hasChanges = changes.length > 0;

  return (
    <div className="flex items-start gap-2">
      <div className="grid grid-cols-2 gap-2 text-xs flex-1">
        <div className="rounded border p-2">
          <p className="font-medium text-muted-foreground mb-1">Before</p>
          {QUANTITY_BUCKETS.map(b => (
            <div key={b.key} className={`flex justify-between ${changes.some(c => c.key === b.key) ? 'font-semibold' : 'text-muted-foreground'}`}>
              <span>{b.label}</span>
              <span className="tabular-nums">{before[b.key] ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="rounded border p-2">
          <p className="font-medium text-muted-foreground mb-1">After</p>
          {QUANTITY_BUCKETS.map(b => {
            const change = changes.find(c => c.key === b.key);
            return (
              <div key={b.key} className={`flex justify-between ${change ? 'font-bold' : 'text-muted-foreground'}`}>
                <span>{b.label}</span>
                <span className={`tabular-nums ${change ? (change.delta > 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                  {after[b.key] ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {hasChanges && (
        <div className="flex flex-col items-center pt-4">
          <ArrowDown className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      )}
    </div>
  );
}