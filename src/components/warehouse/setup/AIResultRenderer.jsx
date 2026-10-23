import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Lightbulb, ArrowRight, MapPin, ListChecks, ShieldAlert, Info } from 'lucide-react';

const SEVERITY_STYLES = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', label: 'Info' },
  required: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', label: 'Required' },
  blocker: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', label: 'Blocker' },
};

const STATUS_STYLES = {
  complete: { icon: CheckCircle2, color: 'text-green-500', label: 'Complete' },
  incomplete: { icon: XCircle, color: 'text-red-500', label: 'Incomplete' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', label: 'Warning' },
};

function StatusIcon({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.incomplete;
  const Icon = style.icon;
  return <Icon className={`w-4 h-4 ${style.color} shrink-0`} />;
}

export default function AIResultRenderer({ result }) {
  if (!result?.response) return null;
  const r = result.response;

  return (
    <div className="space-y-3 text-sm">
      {/* Guide metadata */}
      {result.guide_number && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2 border-b flex-wrap">
          <span>Guide: {result.guide_number}</span>
          <span>•</span>
          <span>Step: {result.step_name}</span>
          {result.authoritative ? (
            <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">Published</span>
          ) : result.guide_mode === 'draft_preview' ? (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">Draft</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">General</span>
          )}
        </div>
      )}

      {/* Fallback notice */}
      {result.fallback_notice && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No approved company guide exists yet.</p>
            <p className="text-blue-700 mt-0.5">Showing general warehouse best practices.</p>
          </div>
        </div>
      )}

      {/* Explanation */}
      {r.explanation && (
        <div className="p-3 rounded-md bg-muted/50">
          <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Explanation</p>
          <p className="whitespace-pre-wrap">{r.explanation}</p>
        </div>
      )}

      {/* Completed work */}
      {r.completed_work?.length > 0 && (
        <div>
          <p className="font-medium text-xs uppercase text-green-600 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</p>
          <ul className="space-y-1">
            {r.completed_work.map((w, i) => <li key={i} className="flex gap-2"><span className="text-green-500">✓</span><span>{w}</span></li>)}
          </ul>
        </div>
      )}

      {/* Remaining work */}
      {r.remaining_work?.length > 0 && (
        <div>
          <p className="font-medium text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> Remaining</p>
          <ul className="space-y-1">
            {r.remaining_work.map((w, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">○</span><span>{w}</span></li>)}
          </ul>
        </div>
      )}

      {/* Issues with severity */}
      {r.issues?.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase text-muted-foreground">Issues Found</p>
          {r.issues.map((issue, i) => {
            const style = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info;
            return (
              <div key={i} className={`p-2.5 rounded-md border ${style.bg} ${style.border}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm">{issue.item || issue.type || 'Issue'}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>{style.label}</span>
                </div>
                {issue.detail && <p className="text-xs text-muted-foreground mb-1">{issue.detail}</p>}
                {issue.fix_action && (
                  <p className="text-xs flex items-start gap-1 mt-1">
                    <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-accent" />
                    <span><span className="font-medium">Fix:</span> {issue.fix_action}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Checklist */}
      {r.checklist?.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Session Checklist</p>
          {r.checklist.map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md border bg-card">
              <StatusIcon status={item.status} />
              <div className="flex-1">
                <p className="text-sm font-medium">{item.item}</p>
                {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bin recommendation */}
      {r.recommended_bin && (
        <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
          <p className="font-medium text-xs uppercase text-accent mb-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Recommended Bin</p>
          <p className="font-bold text-base font-mono">{r.recommended_bin}</p>
          {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
          {r.alternatives?.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Alternatives:</p>
              {r.alternatives.map((alt, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-medium">{alt.bin_code}</span>
                  <span className="text-muted-foreground">— {alt.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestions */}
      {r.suggestions?.length > 0 && (
        <div>
          <p className="font-medium text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> Suggestions (confirmation required)</p>
          <ul className="space-y-1">
            {r.suggestions.map((s, i) => <li key={i} className="flex gap-2"><span className="text-accent">•</span><span>{s}</span></li>)}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {r.warnings?.length > 0 && (
        <div>
          <p className="font-medium text-xs uppercase text-destructive mb-1">Warnings</p>
          <ul className="space-y-1">
            {r.warnings.map((w, i) => <li key={i} className="flex gap-2"><span className="text-destructive">⚠</span><span>{w}</span></li>)}
          </ul>
        </div>
      )}

      {/* Blockers */}
      {r.blockers?.length > 0 && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200">
          <p className="font-medium text-xs uppercase text-red-600 mb-1 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Approval/Activation Blockers</p>
          <ul className="space-y-1">
            {r.blockers.map((b, i) => <li key={i} className="flex gap-2"><span className="text-red-500">⛔</span><span>{b}</span></li>)}
          </ul>
        </div>
      )}

      {/* Bin validation warning */}
      {result.bin_validation && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{result.bin_validation.warning}</p>
            {result.bin_validation.invalid_codes?.length > 0 && (
              <p className="text-muted-foreground mt-1">Invalid codes: {result.bin_validation.invalid_codes.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* Next action */}
      {r.nextAction && (
        <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
          <p className="font-medium text-xs uppercase text-accent mb-1 flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5" /> Next Action</p>
          <p>{r.nextAction}</p>
        </div>
      )}

      {/* Escalation */}
      {r.escalation_needed && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">Escalation recommended — contact your supervisor or Director of Operations.</span>
        </div>
      )}

      {/* Has approved guidance indicator */}
      {r.has_approved_guidance === false && (
        <p className="text-xs text-amber-600 italic">No approved company instruction exists for this topic. Consider requesting help from your supervisor.</p>
      )}

      {/* Safety notice */}
      <p className="text-xs text-muted-foreground italic">{result.ai_safety_notice || 'AI guidance only. All actions require your explicit confirmation.'}</p>
    </div>
  );
}