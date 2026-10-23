import { CheckCircle2, Circle, AlertTriangle, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ConsumableVerificationPanel({
  data, workflowChecks, onVerifyItem,
}) {
  if (!data) return null;
  const { replenishedItems = [], hasShortages } = data;

  if (!hasShortages) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> No replenished items to verify — stock levels OK.
      </div>
    );
  }

  const verifiedKey = (item) => `consumable_verified_${item.item_name || item.request_id}`;
  const allVerified = replenishedItems.every(item =>
    workflowChecks[verifiedKey(item)]?.status === 'complete'
  );

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 space-y-1.5 text-xs">
      <p className="font-semibold text-blue-800 flex items-center gap-1">
        <PackageCheck className="w-3.5 h-3.5" /> Replenished Items — Verify Loaded
      </p>
      <div className="space-y-1">
        {replenishedItems.map((item, idx) => {
          const key = verifiedKey(item);
          const verified = workflowChecks[key]?.status === 'complete';
          return (
            <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-white/60">
              <div className="flex items-center gap-1.5 min-w-0">
                {verified
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
                <span className={`truncate ${verified ? 'text-muted-foreground line-through' : ''}`}>
                  {item.item_name || 'Unknown'}
                </span>
                {item.quantity && (
                  <span className="text-muted-foreground">× {item.quantity} {item.unit || 'ea'}</span>
                )}
              </div>
              {!verified && (
                <Button
                  size="sm"
                  className="h-5 text-[10px] px-1.5"
                  onClick={() => onVerifyItem(key)}
                >
                  Verify
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {allVerified && (
        <div className="flex items-center gap-1 p-1.5 rounded bg-green-50 border border-green-200 text-green-700 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> All replenished items verified.
        </div>
      )}
      {!allVerified && replenishedItems.some(item => {
        const r = item;
        return (r.category || '').toLowerCase().includes('missing') || r.status === 'Missing';
      }) && (
        <div className="flex items-center gap-1 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" /> Some items missing — use Request Warehouse.
        </div>
      )}
    </div>
  );
}