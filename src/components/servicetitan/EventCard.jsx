import { useState } from "react";
import { ChevronDown, ChevronUp, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "./StatusBadges";
import { formatEventType, timeAgo } from "@/lib/servicetitanConstants";

export default function EventCard({ event, onRetry, onIgnore, onReplay, replaying = false, showActions = true }) {
  const [expanded, setExpanded] = useState(false);
  let payload = null;
  try { payload = event.raw_payload ? JSON.parse(event.raw_payload) : null; } catch { payload = event.raw_payload; }

  const summary = event.parsed_summary || event.event_type;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EventStatusBadge status={event.status} />
              <span className="text-sm font-medium">{formatEventType(event.event_type)}</span>
              {event.external_id && <span className="text-xs text-muted-foreground font-mono">{event.external_id}</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-1 truncate">{summary}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>Received {timeAgo(event.received_at)}</span>
              {event.related_truck_id && <span>Truck: {event.related_truck_id}</span>}
              {event.related_job_id && <span>Job: {event.related_job_id}</span>}
              {event.retry_count > 0 && <span className="text-amber-600">Retries: {event.retry_count}</span>}
            </div>
            {event.status === 'Failed' && event.error_message && (
              <p className="text-xs text-red-600 mt-1 font-mono bg-red-50 px-2 py-1 rounded">{event.error_message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            {showActions && event.status === 'Failed' && (
              <div className="flex gap-1">
                {onRetry && <Button size="sm" variant="outline" onClick={() => onRetry(event)}>Retry</Button>}
                {onIgnore && <Button size="sm" variant="ghost" onClick={() => onIgnore(event)}>Ignore</Button>}
              </div>
            )}
            {onReplay && (
              <Button size="sm" variant="outline" disabled={replaying} onClick={() => onReplay(event)}>
                <Repeat className="h-3.5 w-3.5 mr-1" /> {replaying ? 'Replaying...' : 'Replay'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {expanded && payload && (
          <pre className="mt-3 text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-md overflow-x-auto max-h-64">
            {typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}