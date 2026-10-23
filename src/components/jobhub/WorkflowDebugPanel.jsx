import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Bug, Activity, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { computeCurrentStageKey } from '@/lib/workflowEngine';

/**
 * Workflow Debug Panel — Admin/Developer only.
 *
 * Displays real-time workflow state, signature status, completion conditions,
 * and execution diagnostics to identify where workflow advancement stops.
 */
export default function WorkflowDebugPanel({
  job,
  workflow,
  stages,
  nextAction,
  todaysAppointment,
  customerPresentation,
  activityLogs,
  checklist,
  signatureRequired,
  signatureCaptured,
  signatureInfo,
  debugInfo,
}) {
  const [expanded, setExpanded] = useState(true);

  if (!workflow) return null;

  const currentStage = computeCurrentStageKey(stages, nextAction);
  const workflowStatus = workflow.overall_progress != null ? `${workflow.overall_progress}%` : '—';
  const workflowAction = nextAction?.label || '—';
  const presentationStatus = customerPresentation?.presentation_status || '—';
  const customerDecision = workflow.customer_decision || 'pending';

  const blockingCondition = checklist?.find(c => c.critical && !c.pass);
  const satisfiedConditions = checklist?.filter(c => c.pass).map(c => c.label) || [];
  const unsatisfiedConditions = checklist?.filter(c => !c.pass).map(c => c.label) || [];

  const rows = [
    { section: 'Workflow', items: [
      { label: 'Current Stage', value: currentStage },
      { label: 'Overall Progress', value: workflowStatus },
      { label: 'Next Action', value: workflowAction },
      { label: 'Last Workflow Transition', value: debugInfo?.lastWorkflowTransition || '—' },
    ]},
    { section: 'Presentation', items: [
      { label: 'Presentation Status', value: presentationStatus, badge: presentationStatus === 'complete' ? 'green' : 'amber' },
      { label: 'Customer Decision', value: customerDecision },
      { label: 'CustomerPresentation ID', value: customerPresentation?.id || '—' },
    ]},
    { section: 'Signature', items: [
      { label: 'Signature Required', value: signatureRequired ? 'Yes' : 'No', badge: signatureRequired ? 'amber' : 'muted' },
      { label: 'Signature Captured', value: signatureCaptured ? 'Yes' : 'No', badge: signatureCaptured ? 'green' : 'red' },
      { label: 'Signature ID / URL', value: signatureInfo?.signatureUrl || signatureInfo?.timestamp || '—' },
      { label: 'Signature Purpose', value: signatureInfo?.purposeLabel || '—' },
      { label: 'Signer Name', value: signatureInfo?.signerName || '—' },
    ]},
    { section: 'Completion Conditions', items: [
      { label: 'Blocking Condition', value: blockingCondition?.label || 'None — all critical conditions met', badge: blockingCondition ? 'red' : 'green' },
      { label: 'Satisfied', value: satisfiedConditions.length > 0 ? satisfiedConditions.join(', ') : '—', badge: 'green' },
      { label: 'Unsatisfied', value: unsatisfiedConditions.length > 0 ? unsatisfiedConditions.join(', ') : '—', badge: unsatisfiedConditions.length > 0 ? 'amber' : 'muted' },
    ]},
    { section: 'Execution', items: [
      { label: 'Current Async Operation', value: debugInfo?.lastAsyncOp || 'Idle', badge: debugInfo?.lastAsyncOp ? 'amber' : 'muted' },
      { label: 'Last Function Executed', value: debugInfo?.lastFunctionExecuted || '—' },
      { label: 'Last Error', value: debugInfo?.lastError || '—', badge: debugInfo?.lastError ? 'red' : 'muted' },
    ]},
    { section: 'Context', items: [
      { label: 'Job ID', value: job?.id || '—' },
      { label: 'Appointment ID', value: todaysAppointment?.id || '—' },
      { label: 'Activity Log Count', value: activityLogs?.length || 0 },
    ]},
  ];

  const badgeVariant = (color) => {
    if (color === 'green') return 'default';
    if (color === 'red') return 'destructive';
    if (color === 'amber') return 'secondary';
    return 'outline';
  };

  return (
    <Card className="border-purple-200 bg-purple-50/30 mt-3">
      <CardContent className="p-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-bold text-purple-700 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <Bug className="w-3.5 h-3.5" />
          Workflow Debug Panel
          {debugInfo?.lastError && (
            <Badge variant="destructive" className="text-[10px] ml-1">ERROR</Badge>
          )}
          {debugInfo?.lastAsyncOp && (
            <Badge variant="secondary" className="text-[10px] ml-1 flex items-center gap-1">
              <Activity className="w-2.5 h-2.5 animate-pulse" /> RUNNING
            </Badge>
          )}
        </button>
        {expanded && (
          <div className="mt-3 space-y-3">
            {rows.map((section) => (
              <div key={section.section}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-1">
                  {section.section}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((row) => (
                    <div key={row.label} className="flex gap-2 items-start text-xs font-mono">
                      <span className="text-muted-foreground font-semibold whitespace-nowrap min-w-[140px]">
                        {row.label}:
                      </span>
                      {row.badge ? (
                        <Badge variant={badgeVariant(row.badge)} className="text-[10px]">
                          {String(row.value)}
                        </Badge>
                      ) : (
                        <span className="break-all text-foreground">{String(row.value)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Quick status icons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-purple-200">
              {checklist?.map((item, i) => (
                <div key={i} className="flex items-center gap-1 text-xs">
                  {item.pass ? (
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                  ) : item.critical ? (
                    <XCircle className="w-3 h-3 text-red-600" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                  )}
                  <span className={item.pass ? 'text-green-700' : item.critical ? 'text-red-700' : 'text-amber-700'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}