import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, ArrowDown, Pause, SkipForward, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  received: { icon: Circle, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Received' },
  matched: { icon: Circle, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Matched' },
  passed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  skipped: { icon: SkipForward, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Skipped' },
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Success' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Warning' },
  paused: { icon: Pause, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Paused' },
  complete: { icon: CheckCircle2, color: 'text-accent', bg: 'bg-accent/10', label: 'Complete' },
};

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function SimulationTimeline({ trace, onNodeClick }) {
  if (!trace || trace.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No simulation trace yet. Run a simulation to see the execution timeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {trace.map((step, i) => {
        const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.received;
        const Icon = config.icon;
        const isLast = i === trace.length - 1;

        return (
          <div key={i} className="flex gap-3">
            {/* Timeline rail */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.bg)}
                onClick={() => onNodeClick?.(step)}
                role={onNodeClick ? 'button' : undefined}
              >
                <Icon className={cn('w-4 h-4', config.color)} />
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 bg-border min-h-[24px]" />
              )}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-4', isLast && 'pb-0')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{formatTimestamp(step.timestamp)}</span>
                    <span className="text-xs text-muted-foreground">+{step.elapsed_ms}ms</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{step.action}</p>
                  <p className="text-xs text-muted-foreground">{step.module}</p>
                  <p className="text-xs mt-1">{step.message}</p>
                  {step.duration_ms !== undefined && step.duration_ms > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">⏱ {step.duration_ms}ms</p>
                  )}
                </div>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', config.bg, config.color)}>
                  {config.label}
                </span>
              </div>

              {/* Details */}
              {step.details && (
                <details className="mt-2">
                  <summary className="text-xs text-accent cursor-pointer hover:underline">Details</summary>
                  <pre className="text-[10px] bg-muted rounded p-2 mt-1 overflow-x-auto max-h-40">
                    {JSON.stringify(step.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}