import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { STAGE_STATES } from '@/lib/workflowEngine';
import { ChevronRight, Clock, Camera, AlertTriangle, User, Eye, Play, Lock } from 'lucide-react';
import moment from 'moment';

export default function WorkflowStageCard({ stage, state, onAction, isLead, lockedBy }) {
  const stateDef = STAGE_STATES[state?.status] || STAGE_STATES.locked;
  const Icon = stage.icon;
  const StateIcon = stateDef.icon;

  const canAct = ['available', 'in_progress', 'needs_lead_review'].includes(state?.status);
  const isReview = state?.status === 'needs_lead_review';
  const isLocked = state?.status === 'locked';
  const isDone = ['completed', 'skipped'].includes(state?.status);

  return (
    <div className={`relative rounded-xl border-2 ${stateDef.borderClass} ${isDone ? 'opacity-75' : ''} transition-all`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Stage icon */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${stateDef.badgeClass}`}>
            <Icon className="w-5 h-5" />
          </div>

          {/* Stage info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{stage.label}</p>
              <Badge variant="outline" className={`text-[10px] ${stateDef.badgeClass} border-0`}>
                <StateIcon className="w-2.5 h-2.5 mr-0.5" />
                {stateDef.label}
              </Badge>
              {stage.conditional && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Conditional</Badge>
              )}
            </div>

            {state?.assigned_to_name && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3" /> {state.assigned_to_name}
              </p>
            )}

            {state?.completion_pct != null && state.completion_pct > 0 && state.completion_pct < 100 && (
              <div className="mt-1.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${state.completion_pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{state.completion_pct}% complete</p>
              </div>
            )}

            {state?.photos > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Camera className="w-3 h-3" /> {state.photos} photos
              </p>
            )}

            {state?.reviewRejected && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                <AlertTriangle className="w-3 h-3" /> Returned for revision
              </p>
            )}

            {state?.completed_at && (
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {moment(state.completed_at).format('h:mm A')}
                {state.completed_by_name && ` · ${state.completed_by_name}`}
              </p>
            )}

            {state?.skipReason && (
              <p className="text-[10px] text-muted-foreground italic mt-0.5">Skipped: {state.skipReason}</p>
            )}

            {lockedBy && lockedBy.locked_by_email !== state?.assigned_to && (
              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3" /> {lockedBy.locked_by_name} is editing
              </p>
            )}
          </div>

          {/* Action button */}
          {canAct && (
            <Button
              size="sm"
              variant={isReview ? 'default' : 'outline'}
              className="gap-1 flex-shrink-0"
              onClick={() => onAction(stage, state)}
            >
              {isReview ? <><Eye className="w-3.5 h-3.5" /> Review</> : state?.status === 'in_progress' ? <><Play className="w-3.5 h-3.5" /> Continue</> : <><ChevronRight className="w-3.5 h-3.5" /> Start</>}
            </Button>
          )}
        </div>
      </CardContent>
    </div>
  );
}