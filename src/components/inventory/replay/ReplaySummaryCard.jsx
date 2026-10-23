import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Package, MapPin, DollarSign, ArrowLeftRight, Clock } from 'lucide-react';
import { getTimelineEventMeta } from '@/lib/inventoryTimelineConstants';
import { resolvePerformedBy, deriveSourceModule } from '@/lib/auditUtils';

/**
 * Historical Summary card for Replay Inventory State.
 * Shows: Replay Date/Time, Inventory Item, Location, Bin, Inventory Value,
 * Last Transaction Before Replay, Next Transaction After Replay.
 */
export default function ReplaySummaryCard({ item, state, asOfTimestamp, lastTxnBefore, nextTxnAfter, employeeMap }) {
  const inventoryValue = ((state.quantity_owned || 0) * (item?.unit_cost || 0)).toFixed(2);
  const lastMeta = lastTxnBefore ? getTimelineEventMeta(lastTxnBefore.transaction_type) : null;
  const nextMeta = nextTxnAfter ? getTimelineEventMeta(nextTxnAfter.transaction_type) : null;
  const LastIcon = lastMeta?.icon;
  const NextIcon = nextMeta?.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Historical Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Replay Date &amp; Time</p>
            <p className="font-medium">{asOfTimestamp ? new Date(asOfTimestamp).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> Inventory Item</p>
            <p className="font-medium">{item?.item_name || '—'}</p>
            <p className="text-xs font-mono text-muted-foreground">{item?.sku || item?.inventory_id || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Inventory Value</p>
            <p className="font-bold text-lg">${inventoryValue}</p>
            <p className="text-xs text-muted-foreground">{state.quantity_owned || 0} × ${(item?.unit_cost || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</p>
            <p className="font-medium">{item?.warehouse_location || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Bin</p>
            <p className="font-medium">{item?.bin_location || '—'}</p>
          </div>
        </div>

        {/* Last & Next Transaction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Last Transaction Before Replay</p>
            {lastTxnBefore ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  {LastIcon && <LastIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${lastMeta.color}`}>{lastMeta.label}</span>
                  <span className="text-xs text-muted-foreground">{lastTxnBefore.transaction_date ? new Date(lastTxnBefore.transaction_date).toLocaleString() : '—'}</span>
                </div>
                <p className="text-xs">
                  <span className="text-muted-foreground">By:</span> {resolvePerformedBy(lastTxnBefore, employeeMap).display}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Source:</span> {deriveSourceModule(lastTxnBefore)}
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No prior transactions.</p>}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">Next Transaction After Replay</p>
            {nextTxnAfter ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  {NextIcon && <NextIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${nextMeta.color}`}>{nextMeta.label}</span>
                  <span className="text-xs text-muted-foreground">{nextTxnAfter.transaction_date ? new Date(nextTxnAfter.transaction_date).toLocaleString() : '—'}</span>
                </div>
                <p className="text-xs">
                  <span className="text-muted-foreground">By:</span> {resolvePerformedBy(nextTxnAfter, employeeMap).display}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Source:</span> {deriveSourceModule(nextTxnAfter)}
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No subsequent transactions — this is the latest state.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}