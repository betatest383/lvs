import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Clock, AlertTriangle, CheckCircle2, Pause, Play, ArrowRight,
  Zap, Shield, Loader2, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  WORK_CATEGORY_LABELS, WORK_CATEGORY_COLORS, ORCHESTRATION_STATE_LABELS,
  ORCHESTRATION_STATE_COLORS, INTERRUPTIBILITY_LABELS, DECISION_TYPE_LABELS,
} from '@/lib/orchestrationConstants';
import { toast } from 'sonner';

/**
 * OrchestrationPanel — Read-only preview panel showing the engine's
 * recommendation for the current employee. Does not take over the screen,
 * does not auto-pause work, does not lock navigation.
 *
 * In Preview Mode, shows what the engine WOULD recommend.
 */
export default function OrchestrationPanel({ taskId, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [currentWork, setCurrentWork] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [decisions, setDecisions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadRecommendation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'evaluate_employee_work',
      });
      if (res.data?.success) {
        setRecommendation(res.data);
        setCurrentWork(res.data.current_task);
      }
    } catch (err) {
      // Silent fail in preview mode — don't disrupt the user
      console.error('Orchestration eval failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('orchestrateWork', {
        action: 'get_policy',
      });
      if (res.data?.success) setPolicy(res.data.policy);
    } catch {}
  }, []);

  useEffect(() => {
    loadRecommendation();
    loadPolicy();
  }, [loadRecommendation, loadPolicy]);

  const loadHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    setLoadingHistory(true);
    setShowHistory(true);
    try {
      const params = { action: 'get_decision_history', limit: 10 };
      if (taskId) params.task_id = taskId;
      const res = await base44.functions.invoke('orchestrateWork', params);
      if (res.data?.success) setDecisions(res.data.decisions || []);
    } catch {}
    finally { setLoadingHistory(false); }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Evaluating work priorities…
        </CardContent>
      </Card>
    );
  }

  const mode = policy?.orchestration_mode || 'preview';
  const emergencyDisabled = policy?.emergency_disabled;

  return (
    <Card className={compact ? '' : 'border-accent/30'}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            Work Orchestration
            <Badge variant="outline" className="text-xs capitalize">
              {mode} Mode
            </Badge>
          </h3>
          <Button variant="ghost" size="sm" onClick={loadRecommendation} className="h-7 px-2">
            <RotateIcon /> Refresh
          </Button>
        </div>

        {emergencyDisabled && (
          <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            ⚠ Emergency Disabled by {policy.emergency_disabled_by}. Enforced behavior is suspended.
          </div>
        )}

        {mode === 'preview' && !emergencyDisabled && (
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            Preview Mode — recommendations are advisory only. No work is interrupted or locked.
          </div>
        )}

        {/* Current Work */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Work</p>
          {currentWork ? (
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${WORK_CATEGORY_COLORS[currentWork.work_category] || 'bg-gray-100 text-gray-700'}`}>
                {WORK_CATEGORY_LABELS[currentWork.work_category] || 'Uncategorized'}
              </span>
              <span className="text-sm font-medium truncate">{currentWork.title}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No active work session</p>
          )}
        </div>

        {/* Recommended Work */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recommended Next Work
          </p>
          {recommendation?.recommended_task ? (
            <div className="p-2 rounded-lg bg-muted/50 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${WORK_CATEGORY_COLORS[recommendation.recommended_task.work_category] || 'bg-gray-100 text-gray-700'}`}>
                  {WORK_CATEGORY_LABELS[recommendation.recommended_task.work_category] || 'Uncategorized'}
                </span>
                <span className="text-sm font-medium flex-1 truncate">
                  {recommendation.recommended_task.title}
                </span>
                {recommendation.recommended_task.is_overdue && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{recommendation.priority_reason}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono">Score: {recommendation.recommended_task.score}</span>
                {recommendation.requires_interruption && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5" /> Would Interrupt
                  </span>
                )}
                {recommendation.checkpoint_required && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> Checkpoint
                  </span>
                )}
                {recommendation.requires_acknowledgment && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" /> Acknowledgment
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {recommendation?.decision === 'resume_previous_work'
                ? 'Resume previous work recommended'
                : 'No eligible work available'}
            </p>
          )}
        </div>

        {/* Decision Summary */}
        {recommendation && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
            <span>Decision:</span>
            <Badge variant="outline" className="text-xs">
              {DECISION_TYPE_LABELS[recommendation.decision] || recommendation.decision}
            </Badge>
            <span className="ml-auto font-mono">v{recommendation.engine_version}</span>
          </div>
        )}

        {/* Decision History Toggle */}
        <div>
          <Button variant="ghost" size="sm" onClick={loadHistory} className="h-7 px-2 text-xs w-full justify-start">
            {showHistory ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            <History className="w-3 h-3 mr-1" />
            Decision History
          </Button>
          {showHistory && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {loadingHistory ? (
                <div className="flex justify-center py-2"><Loader2 className="w-3 h-3 animate-spin" /></div>
              ) : decisions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2">No decisions recorded.</p>
              ) : (
                decisions.map((d, i) => (
                  <div key={i} className="p-1.5 rounded text-xs bg-muted/30">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">{DECISION_TYPE_LABELS[d.decision_type] || d.decision_type}</Badge>
                      {d.selected_task_number && <span className="font-mono">{d.selected_task_number}</span>}
                      <span className="ml-auto text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate">{d.decision_reason}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RotateIcon() {
  return <RotateCwIcon />;
}
function RotateCwIcon() {
  return <Loader2 className="w-3 h-3" />;
}