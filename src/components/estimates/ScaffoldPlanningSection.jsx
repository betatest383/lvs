import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { SCAFFOLD_STATUS_STYLE } from '@/lib/scopeOfWorkConstants';

export default function ScaffoldPlanningSection({ required, status, onChange }) {
  const resolvedStatus = required ? (status || 'pending') : 'not_required';
  const isBlocked = required && status !== 'attached';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={required} onCheckedChange={v => onChange({ required: v, status: v ? 'pending' : 'not_required' })} />
          <Label className="text-sm">Scaffold Plan Required?</Label>
        </div>
        <Badge className={`text-xs ${SCAFFOLD_STATUS_STYLE[resolvedStatus] || ''}`}>
          {resolvedStatus === 'not_required' ? 'Not Required' :
           resolvedStatus === 'pending' ? 'Plan Pending' : 'Plan Attached'}
        </Badge>
      </div>

      {required && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${isBlocked ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {isBlocked ? <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          <div>
            {isBlocked ? (
              <>
                <p className="font-medium">Scaffold Planning Form required before scheduling.</p>
                <p className="mt-0.5">Estimate cannot be marked Ready for Scheduling until the Scaffold Plan is attached.</p>
              </>
            ) : (
              <p className="font-medium">Scaffold Plan attached. Estimate is eligible for scheduling.</p>
            )}
          </div>
        </div>
      )}

      {required && status === 'attached' && (
        <button type="button" className="text-xs text-accent underline" onClick={() => onChange({ required, status: 'pending' })}>
          Detach Scaffold Plan
        </button>
      )}
      {required && status === 'pending' && (
        <button type="button" className="text-xs text-accent underline" onClick={() => onChange({ required, status: 'attached' })}>
          Mark Scaffold Plan as Attached
        </button>
      )}
    </div>
  );
}