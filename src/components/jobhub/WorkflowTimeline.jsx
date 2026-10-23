import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, Eye, RotateCcw, History, Lock, CheckCircle2,
  Circle, AlertTriangle, Clock, FileText, ArrowRight,
  Settings, Home, TreePine, Sparkles, ClipboardCheck, Wrench,
  Package, Calculator, Layers, Presentation, Users, ClipboardList, Flag,
  FileCheck, DollarSign,
} from 'lucide-react';
import { WORKFLOW_STAGES, STAGE_STATES, safeParse } from '@/lib/workflowEngine';

// Extended stage states for the timeline (beyond the base STAGE_STATES)
const EXTENDED_STATES = {
  ...STAGE_STATES,
  stale: {
    label: 'Stale',
    icon: AlertTriangle,
    badgeClass: 'bg-orange-100 text-orange-700',
    dotClass: 'bg-orange-500',
    borderClass: 'border-orange-300',
  },
  reopened: {
    label: 'Reopened',
    icon: RotateCcw,
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
    borderClass: 'border-blue-300',
  },
  superseded: {
    label: 'Superseded',
    icon: History,
    badgeClass: 'bg-gray-200 text-gray-600',
    dotClass: 'bg-gray-400',
    borderClass: 'border-gray-300',
  },
  blocked: {
    label: 'Blocked',
    icon: Lock,
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-300',
  },
};

const STAGE_ICONS = {
  inspection_setup: Settings,
  interior_inspection: Home,
  exterior_inspection: TreePine,
  inspection_summary: FileText,
  ai_report_summary: Sparkles,
  recommendation_review: ClipboardCheck,
  repair_system_review: Wrench,
  estimate_package_builder: Package,
  scope_of_work: FileCheck,
  dynamic_pricing: Calculator,
  final_estimate_review: DollarSign,
  proposal_builder: Layers,
  customer_presentation: Presentation,
  customer_decision: Users,
  execution_plan: ClipboardList,
  complete_appointment: Flag,
};

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return ts; }
}

function StageRow({ stage, state, index, isActive, onSelect, canReopen, isSelected }) {
  if (!state || state.status === 'skipped') return null;

  const stateDef = EXTENDED_STATES[state.status] || EXTENDED_STATES.locked;
  const Icon = STAGE_ICONS[stage.key] || Circle;
  const StateIcon = stateDef.icon;
  const isCompleted = ['completed', 'approved'].includes(state.status);
  const isStale = state.stale === true;
  const isReopened = state.status === 'reopened';

  return (
    <div className="flex items-stretch gap-0">
      {/* Vertical connector line */}
      <div className="flex flex-col items-center w-7 flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all ${stateDef.badgeClass} ${isActive ? 'ring-2 ring-accent ring-offset-1' : ''}`}
          onClick={() => onSelect(stage.key)}
        >
          {isCompleted && !isStale ? <CheckCircle2 className="w-3.5 h-3.5" /> :
           isReopened ? <RotateCcw className="w-3.5 h-3.5" /> :
           isStale ? <AlertTriangle className="w-3.5 h-3.5" /> :
           <Icon className="w-3.5 h-3.5" />}
        </div>
        <div className={`flex-1 w-0.5 ${isCompleted && !isStale ? 'bg-green-400' : 'bg-border'}`} />
      </div>

      {/* Stage content */}
      <div
        className={`flex-1 pb-3 pl-2 cursor-pointer rounded-lg p-2 transition-colors ${isSelected ? 'bg-accent/5' : 'hover:bg-muted/50'}`}
        onClick={() => onSelect(stage.key)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium">{stage.label}</span>
              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${stateDef.badgeClass} border-0`}>
                {stateDef.label}
              </Badge>
              {isStale && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-orange-50 text-orange-700 border-orange-200 border">
                  Stale
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stage.description}</p>

            {/* Metadata row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
              {state.completed_at && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTimestamp(state.completed_at)}
                </span>
              )}
              {state.completed_by_name && (
                <span>by {state.completed_by_name}</span>
              )}
              {state.last_updated && !state.completed_at && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTimestamp(state.last_updated)}
                </span>
              )}
            </div>

            {/* Stale reason */}
            {isStale && state.stale_reason && (
              <p className="text-[10px] text-orange-600 mt-1 flex items-start gap-1">
                <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                {state.stale_reason}
                {state.stale_by_name && ` (by ${state.stale_by_name})`}
              </p>
            )}

            {/* Reopened reason */}
            {isReopened && (
              <p className="text-[10px] text-blue-600 mt-1 flex items-start gap-1">
                <RotateCcw className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                Reopened by {state.reopened_by_name || state.reopened_by}
                {state.reopened_reason && ` — ${state.reopened_reason}`}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onSelect(stage.key); }}
            >
              <Eye className="w-3 h-3 mr-1" />
              View
            </Button>
            {isCompleted && canReopen && !isStale && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={(e) => { e.stopPropagation(); onSelect(stage.key, 'reopen'); }}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reopen
              </Button>
            )}
            {isStale && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-orange-600"
                onClick={(e) => { e.stopPropagation(); onSelect(stage.key, 'refresh'); }}
              >
                <ArrowRight className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowTimeline({
  stages, workflow, overallProgress, onStageSelect, onReopenStage,
  userRole, isLead, isAssignedTech, activeStageKey,
}) {
  const [expanded, setExpanded] = useState(true);
  const useV2 = stages?.__meta?.useV2Workflow || false;

  const activeStages = useMemo(() => {
    return WORKFLOW_STAGES.filter(s => {
      if (useV2 && s.v2Hidden) return false;
      const state = stages[s.key];
      return state && state.status !== 'skipped';
    });
  }, [stages, useV2]);

  // Determine which stages the current user can reopen
  const canReopenStage = (stageKey, state) => {
    if (!state || !['completed', 'approved'].includes(state.status)) return false;
    if (state.stale === true) return false; // Already stale, needs refresh not reopen

    const customerDecision = workflow?.customer_decision || 'pending';
    const customerPresented = stages?.customer_presentation?.status === 'completed';
    const customerAccepted = ['accepted', 'perform_work_today', 'schedule_for_later'].includes(customerDecision);

    // Admin/owner/manager can always reopen (backend enforces the actual permission)
    if (['admin', 'owner', 'manager', 'operations_manager'].includes(userRole)) return true;

    // Post-acceptance: only manager/admin (handled by backend)
    if (customerAccepted) return false;
    // Post-presentation: only manager/admin
    if (customerPresented) return false;

    // Pre-presentation:
    // Lead can reopen inspection stages
    if (isLead) {
      const inspectionStages = ['inspection_setup', 'interior_inspection', 'exterior_inspection', 'inspection_summary', 'ai_report_summary'];
      return inspectionStages.includes(stageKey);
    }
    // Assigned tech can reopen their own operational stages
    if (isAssignedTech) {
      return ['interior_inspection', 'exterior_inspection', 'inspection_setup'].includes(stageKey);
    }
    return false;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Workflow Timeline</p>
            <Badge variant="outline" className="text-xs">{overallProgress}%</Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>

        {expanded && (
          <div className="max-h-[500px] overflow-y-auto pr-1">
            {activeStages.map((stage, i) => {
              const state = stages[stage.key] || { status: 'locked' };
              return (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  state={state}
                  index={i}
                  isLast={i === activeStages.length - 1}
                  isActive={activeStageKey === stage.key}
                  onSelect={(key, action) => {
                    if (action === 'reopen') onReopenStage(key);
                    else onStageSelect(key);
                  }}
                  canReopen={canReopenStage(stage.key, state)}
                  isSelected={activeStageKey === stage.key}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}