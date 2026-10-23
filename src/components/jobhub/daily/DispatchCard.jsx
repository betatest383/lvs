import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Lock, ShieldAlert, CheckCircle2, Truck } from 'lucide-react';
import { isDispatchReady, DISPATCH_BLOCKING_STEPS, getStepStatus } from '@/lib/jobHubDailyConfig';

export default function DispatchCard({ checklist, managerOverrideUsed, hasJob, onDispatch, onManagerOverride, session, truckAssignmentStatus, onRequestManagerReview }) {
  const ready = isDispatchReady(checklist, managerOverrideUsed);
  const dispatched = session?.status === 'dispatched' || !!session?.first_dispatch_time;

  const truckMissing = truckAssignmentStatus === 'Truck Assignment Needed';
  const truckBlocked = truckMissing && !managerOverrideUsed;

  if (!hasJob) return null;

  if (dispatched) {
    return (
      <Card className="border-0 shadow-sm bg-green-50/40">
        <CardContent className="p-5 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-semibold text-sm">Dispatched</p>
            <p className="text-xs text-muted-foreground">
              Dispatched at {new Date(session.first_dispatch_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const blockingStepsIncomplete = DISPATCH_BLOCKING_STEPS.filter(s =>
    !['complete', 'not_required', 'manager_override'].includes(getStepStatus(s.id, checklist))
  );

  return (
    <Card className={`border-0 shadow-sm ${ready ? 'bg-green-50/40' : ''}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ready ? 'bg-green-100' : 'bg-muted'}`}>
              {ready ? <Send className="w-5 h-5 text-green-600" /> : <Lock className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm">Dispatch to First Job</h3>
              <p className="text-xs text-muted-foreground">
                {ready ? 'All requirements met — ready to dispatch' : 'Complete required steps first'}
              </p>
            </div>
          </div>
          {ready && <Badge className="bg-green-100 text-green-700">Ready</Badge>}
        </div>

        {!ready && !managerOverrideUsed && (
          <div className="space-y-1.5">
            {blockingStepsIncomplete.map(step => (
              <div key={step.id} className="flex items-center gap-2 text-xs text-amber-700">
                <Lock className="w-3 h-3" />
                <span>{step.label} — incomplete</span>
              </div>
            ))}
          </div>
        )}

        {truckBlocked && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50/50 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-800">
              <Truck className="w-4 h-4" /> Truck assignment required before dispatch
            </div>
            <p className="text-xs text-red-700">
              This job requires a truck but none is assigned. A manager or dispatcher must assign a truck before you can dispatch.
            </p>
            {onRequestManagerReview && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onRequestManagerReview}>
                <ShieldAlert className="w-3.5 h-3.5" /> Request Manager Review
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1 gap-2 text-base"
            disabled={!ready || truckBlocked}
            onClick={onDispatch}
          >
            {ready && !truckBlocked ? <Send className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            {ready && !truckBlocked ? 'Dispatch to First Job' : 'Dispatch Locked'}
          </Button>
          {!ready && !managerOverrideUsed && (
            <Button variant="outline" size="lg" className="gap-1.5" onClick={onManagerOverride}>
              <ShieldAlert className="w-4 h-4" /> Override
            </Button>
          )}
        </div>

        {managerOverrideUsed && (
          <p className="text-xs text-purple-700 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Manager override active — dispatch unlocked
          </p>
        )}
      </CardContent>
    </Card>
  );
}