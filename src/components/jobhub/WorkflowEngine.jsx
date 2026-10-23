import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, GitMerge, Workflow } from 'lucide-react';
import WorkflowStageCard from './WorkflowStageCard';
import { WORKFLOW_STAGES } from '@/lib/workflowEngine';

export default function WorkflowEngine({ stages, workflow, onAction, isLead, conflictLocks }) {
  const renderConnector = (stage, prevStage) => {
    if (!prevStage) return null;

    // Branch point: before inspection modules
    if (stage.isModule && !prevStage.isModule) {
      return (
        <div className="flex items-center justify-center py-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <GitBranch className="w-3 h-3" />
            <span>Parallel</span>
          </div>
        </div>
      );
    }

    // Merge point: after inspection modules
    if (stage.mergePoint) {
      return (
        <div className="flex items-center justify-center py-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <GitMerge className="w-3 h-3" />
            <span>Merge</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center py-0.5">
        <div className="w-0.5 h-3 bg-border" />
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="w-4 h-4 text-accent" /> Workflow Progress Engine
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {Object.values(stages).filter(s => ['completed', 'skipped'].includes(s?.status)).length}
            /{WORKFLOW_STAGES.filter(stage => !stages[stage.key]?.v2Hidden).length} stages
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        {WORKFLOW_STAGES.filter(stage => !stages[stage.key]?.v2Hidden).map((stage, i, arr) => {
          const state = stages[stage.key] || { status: 'locked' };
          const prevStage = i > 0 ? arr[i - 1] : null;
          const lockInfo = stage.isModule ? conflictLocks?.[stage.moduleKey] : null;

          return (
            <div key={stage.key}>
              {renderConnector(stage, prevStage)}
              <WorkflowStageCard
                stage={stage}
                state={state}
                onAction={onAction}
                isLead={isLead}
                lockedBy={lockInfo}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}