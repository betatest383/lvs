import { CheckCircle2, Circle, MinusCircle, AlertTriangle, ShieldCheck, Clock, ChevronRight } from 'lucide-react';
import { STATUS_CONFIG } from '@/lib/wh105Constants';
import { Link } from 'react-router-dom';

const ICONS = {
  waiting: Circle,
  in_progress: Clock,
  complete: CheckCircle2,
  not_required: MinusCircle,
  blocked: AlertTriangle,
  manager_override: ShieldCheck,
};

export default function Wh105CheckItem({ def, status, detail, onToggle, onMarkNotRequired, onOverride, canOverride }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.waiting;
  const Icon = ICONS[status] || Circle;
  const isPassing = ['complete', 'not_required', 'manager_override'].includes(status);
  const isManual = def.type === 'manual';
  const isConditionalManual = def.type === 'conditional_manual';
  const isAutoOptional = def.type === 'auto_optional';
  const isMeta = def.type === 'meta';
  const canToggle = (isManual || isConditionalManual) && status !== 'not_required';
  const canMarkNR = isAutoOptional && status === 'waiting';
  const canOverrideCheck = canOverride && !isPassing && !isMeta;

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${config.bg} ${config.border}`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.text}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isPassing ? config.text : ''}`}>{def.label}</span>
          {status === 'manager_override' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200 text-purple-700 font-medium">OVERRIDE</span>
          )}
          {status === 'not_required' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">N/A</span>
          )}
        </div>
        {detail && status === 'blocked' && (
          <p className="text-xs text-red-500 mt-0.5">{detail}</p>
        )}
        {detail && status === 'complete' && (
          <p className="text-xs text-green-500 mt-0.5">{detail}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {canToggle && (
            <button
              onClick={onToggle}
              className="text-xs px-2 py-0.5 rounded border border-border bg-background hover:bg-muted transition-colors select-none"
            >
              {status === 'complete' ? 'Undo' : 'Mark Done'}
            </button>
          )}
          {canMarkNR && (
            <button
              onClick={onMarkNotRequired}
              className="text-xs px-2 py-0.5 rounded border border-border bg-background hover:bg-muted transition-colors select-none"
            >
              Not Required
            </button>
          )}
          {canOverrideCheck && (
            <button
              onClick={onOverride}
              className="text-xs px-2 py-0.5 rounded border border-purple-300 text-purple-600 bg-background hover:bg-purple-50 transition-colors select-none flex items-center gap-1"
            >
              <ShieldCheck className="w-3 h-3" /> Override
            </button>
          )}
          {def.link && status === 'blocked' && (
            <Link to={def.link} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 select-none">
              Resolve <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}