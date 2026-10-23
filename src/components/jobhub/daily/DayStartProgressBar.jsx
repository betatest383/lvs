import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Lock, AlertTriangle } from 'lucide-react';
import { DAY_START_STEPS, getStepStatus } from '@/lib/jobHubDailyConfig';

const STATUS_ICON = {
  not_started: { icon: Circle, color: 'text-gray-400' },
  in_progress: { icon: Circle, color: 'text-amber-500' },
  complete: { icon: CheckCircle2, color: 'text-green-600' },
  not_required: { icon: CheckCircle2, color: 'text-gray-400' },
  manager_override: { icon: AlertTriangle, color: 'text-purple-600' },
};

export default function DayStartProgressBar({ checklist, hasJob, managerOverrideUsed, clockedIn }) {
  const applicableSteps = DAY_START_STEPS.filter(s => {
    if (s.isDispatch && !hasJob) return false;
    if (s.requiresJob && !hasJob) return false;
    if (s.conditional && !hasJob) return false;
    return true;
  });

  const completedCount = applicableSteps.filter(s =>
    ['complete', 'not_required', 'manager_override'].includes(getStepStatus(s.id, checklist))
  ).length;
  const pct = Math.round((completedCount / applicableSteps.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Day-Start Workflow Progress</h3>
        <Badge variant="outline" className="text-xs">{completedCount} / {applicableSteps.length} complete</Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step pills */}
      <div className="flex flex-wrap gap-1.5">
        {applicableSteps.map((step, idx) => {
          const status = getStepStatus(step.id, checklist);
          const Icon = STATUS_ICON[status]?.icon || Circle;
          const color = STATUS_ICON[status]?.color || 'text-gray-400';
          const isLocked = !clockedIn && step.id !== 'clock_in';

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                  isLocked ? 'bg-muted/50 text-muted-foreground/50' : 'bg-muted/70'
                }`}
                title={step.label}
              >
                {isLocked ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Icon className={`w-3 h-3 ${color}`} />
                )}
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.number}</span>
              </div>
              {idx < applicableSteps.length - 1 && (
                <div className={`w-3 h-px mx-0.5 ${isLocked ? 'bg-muted-foreground/20' : 'bg-muted-foreground/40'}`} />
              )}
            </div>
          );
        })}
      </div>

      {managerOverrideUsed && (
        <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          Manager override active — dispatch requirements bypassed
        </div>
      )}
    </div>
  );
}