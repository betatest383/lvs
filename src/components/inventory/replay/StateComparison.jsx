import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { QUANTITY_BUCKETS } from '@/lib/inventoryMasterConstants';
import { getQtyChangeDiff } from '@/lib/auditUtils';

/**
 * Side-by-side Before / After inventory state comparison.
 * Highlights changed values in green (increase) or red (decrease).
 */
export default function StateComparison({ beforeState, afterState, item }) {
  const changes = getQtyChangeDiff(beforeState, afterState);
  const changedKeys = new Set(changes.map(c => c.key));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inventory State Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Before */}
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Before Replay</p>
            <div className="space-y-1">
              {QUANTITY_BUCKETS.map(b => {
                const val = beforeState?.[b.key] ?? 0;
                const isChanged = changedKeys.has(b.key);
                return (
                  <div key={b.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      <span className={`text-sm ${isChanged ? 'font-medium' : 'text-muted-foreground'}`}>{b.label}</span>
                    </div>
                    <span className={`text-sm tabular-nums ${isChanged ? 'font-bold' : 'text-muted-foreground'}`}>{val}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 pt-2 border-t flex justify-between text-sm">
              <span className="text-muted-foreground">Value</span>
              <span className="font-bold">${((beforeState?.quantity_owned || 0) * (item?.unit_cost || 0)).toFixed(2)}</span>
            </div>
          </div>

          <ArrowRight className="w-5 h-5 text-muted-foreground mx-auto hidden md:block" />

          {/* After */}
          <div className="rounded-lg border p-3 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">After Replay</p>
            <div className="space-y-1">
              {QUANTITY_BUCKETS.map(b => {
                const val = afterState?.[b.key] ?? 0;
                const change = changes.find(c => c.key === b.key);
                return (
                  <div key={b.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      <span className={`text-sm ${change ? 'font-medium' : 'text-muted-foreground'}`}>{b.label}</span>
                    </div>
                    <span className={`text-sm tabular-nums font-bold ${change ? (change.delta > 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                      {val}
                      {change && <span className="text-xs ml-1">({change.delta > 0 ? '+' : ''}{change.delta})</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 pt-2 border-t flex justify-between text-sm">
              <span className="text-muted-foreground">Value</span>
              <span className="font-bold">${((afterState?.quantity_owned || 0) * (item?.unit_cost || 0)).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}