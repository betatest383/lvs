import { CheckCircle2, Circle, AlertTriangle, ClipboardList, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MaterialPickupPanel({
  data, workflowChecks, onVerifyAll, onReportShortage, onReportWrongItem, disabled,
}) {
  if (!data) return null;
  const { stagedItems = [], stagedTransfers = [], hasStaged } = data;

  if (!hasStaged) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
        <ClipboardList className="w-3.5 h-3.5" /> No staged materials for today.
      </div>
    );
  }

  const allVerified = workflowChecks['verify_correct_items']?.status === 'complete' &&
    workflowChecks['verify_correct_quantities']?.status === 'complete' &&
    workflowChecks['confirm_load_complete']?.status === 'complete';

  return (
    <div className="rounded-lg bg-muted/40 border border-border p-2 space-y-1.5 text-xs">
      <p className="font-medium text-foreground flex items-center gap-1">
        <Package className="w-3.5 h-3.5" /> Staged Materials ({stagedItems.length} items)
      </p>
      {stagedTransfers.map(transfer => (
        <div key={transfer.id} className="flex items-center justify-between p-1 rounded bg-background">
          <span className="font-mono truncate">{transfer.transfer_id || transfer.id}</span>
          <span className={`font-medium ${
            transfer.status === 'Loaded' ? 'text-green-600' : 'text-muted-foreground'
          }`}>{transfer.status}</span>
        </div>
      ))}
      <div className="space-y-1 mt-1">
        {stagedItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-background">
            <div className="flex items-center gap-1.5 min-w-0">
              {item.verified
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
              <span className="truncate">{item.item_name || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-muted-foreground">
                Expected: <span className="font-medium">{item.quantity_requested || 0}</span>
              </span>
              <span className={item.verified ? 'text-green-600 font-medium' : 'text-amber-600'}>
                Loaded: <span className="font-medium">{item.verified ? item.quantity_requested || 0 : '—'}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
      {allVerified ? (
        <div className="flex items-center gap-1 p-1.5 rounded bg-green-50 border border-green-200 text-green-700 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> All materials verified — transfer status: Loaded.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={onVerifyAll}
            disabled={disabled}
          >
            Verify All
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onReportShortage}
            disabled={disabled}
          >
            Report Shortage
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onReportWrongItem}
            disabled={disabled}
          >
            Report Wrong Item
          </Button>
        </div>
      )}
    </div>
  );
}