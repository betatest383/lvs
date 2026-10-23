import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Inbox, Check, Database, Clock, Route, Play, CheckCircle, Ban, RotateCcw, History, XCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STAGE_CONFIG = {
  received: { icon: Inbox, color: 'text-blue-600', bg: 'bg-blue-100' },
  validated: { icon: Check, color: 'text-blue-600', bg: 'bg-blue-100' },
  stored: { icon: Database, color: 'text-blue-600', bg: 'bg-blue-100' },
  queued: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
  processing: { icon: Loader2, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  routing: { icon: Route, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  handler_started: { icon: Play, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  handler_finished: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  ignored: { icon: Ban, color: 'text-gray-500', bg: 'bg-gray-100' },
  retry_scheduled: { icon: RotateCcw, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  replay_started: { icon: History, color: 'text-purple-600', bg: 'bg-purple-100' },
  replay_finished: { icon: CheckCircle, color: 'text-purple-600', bg: 'bg-purple-100' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
  dead_letter: { icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-200' },
  requeued: { icon: RotateCcw, color: 'text-blue-600', bg: 'bg-blue-100' },
  deleted: { icon: Trash2, color: 'text-gray-500', bg: 'bg-gray-100' },
};

export default function WebhookTimeline({ webhookEventId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!webhookEventId) return;
    setLoading(true);
    base44.entities.ServiceTitanWebhookTimeline.filter(
      { webhook_event_id: webhookEventId },
      'timestamp',
      200
    )
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [webhookEventId]);

  if (loading) {
    return <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  if (entries.length === 0) {
    return <div className="text-center text-xs text-muted-foreground p-4">No timeline entries.</div>;
  }

  return (
    <div className="space-y-0 max-h-[400px] overflow-y-auto">
      {entries.map((entry, i) => {
        const config = STAGE_CONFIG[entry.stage] || STAGE_CONFIG.received;
        const Icon = config.icon;
        const isLast = i === entries.length - 1;
        return (
          <div key={entry.id || i} className="flex gap-2">
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', config.bg)}>
                <Icon className={cn('w-3.5 h-3.5', config.color, entry.stage === 'processing' && 'animate-spin')} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border min-h-[12px]" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium capitalize">{entry.stage.replace(/_/g, ' ')}</span>
                {entry.duration_ms != null && entry.duration_ms > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{entry.duration_ms}ms</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{entry.message}</p>
              <span className="text-[10px] text-muted-foreground">
                {entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, HH:mm:ss') : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}