import { Card, CardContent } from '@/components/ui/card';
import { WORKFLOW_STAGES, STAGE_STATES } from '@/lib/workflowEngine';
import { Check } from 'lucide-react';

export default function WorkflowProgressBar({ stages, overallProgress }) {
  const useV2 = stages?.__meta?.useV2Workflow || false;
  const activeStages = WORKFLOW_STAGES.filter(s => {
    // Exclude v2-hidden stages from the visible tracker
    if (useV2 && s.v2Hidden) return false;
    const state = stages[s.key];
    return state && state.status !== 'skipped';
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overall Appointment Progress
          </p>
          <p className="text-lg font-bold text-accent">{overallProgress}%</p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-accent to-amber-400 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {activeStages.map((stage, i) => {
            const state = stages[stage.key] || { status: 'locked' };
            const stateDef = STAGE_STATES[state.status] || STAGE_STATES.locked;
            const isDone = ['completed', 'approved'].includes(state.status);
            const Icon = stage.icon;

            return (
              <div key={stage.key} className="flex items-center flex-shrink-0">
                <div
                  className={`flex flex-col items-center gap-0.5 w-14 ${i === activeStages.length - 1 ? '' : ''}`}
                  title={`${stage.shortLabel}: ${stateDef.label}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${stateDef.badgeClass}`}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-[8px] leading-tight text-center truncate w-full ${isDone ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                    {stage.shortLabel}
                  </span>
                </div>
                {i < activeStages.length - 1 && (
                  <div className={`w-3 h-0.5 ${isDone ? 'bg-green-400' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}