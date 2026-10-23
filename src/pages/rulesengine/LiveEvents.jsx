import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Radio, ArrowDown, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Zap, ChevronDown, ChevronRight, RefreshCw, Activity } from 'lucide-react';
import { MODULE_EVENTS } from '@/lib/moduleEventRegistry';

const STATUS_CONFIG = {
  received: { icon: Radio, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Event Received' },
  matched: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Rule Matched' },
  no_match: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-50', label: 'No Rule Matched' },
  evaluated: { icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Evaluated' },
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Success' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  error: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Error' },
};

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
  });
}

function EventRow({ eventLog, runLogs }) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[eventLog.status] || STATUS_CONFIG.received;
  const moduleInfo = MODULE_EVENTS.find(m => m.moduleKey === eventLog.source_module);

  let payload = {};
  try { payload = JSON.parse(eventLog.event_payload_json || '{}'); } catch {}

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Event Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left select-none"
        >
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${statusCfg.bg}`}>
            <statusCfg.icon className={`w-5 h-5 ${statusCfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate">
                {eventLog.trigger_event_name || eventLog.trigger_event || 'Unknown Event'}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {moduleInfo?.module || eventLog.source_module_name || eventLog.source_module} → {eventLog.employee || '—'} → Truck {eventLog.truck || '—'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{formatTime(eventLog.created_date)}</p>
            {runLogs.length > 0 && (
              <p className="text-xs font-medium">{runLogs.length} rule run{runLogs.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        </button>

        {/* Expanded Detail */}
        {expanded && (
          <div className="border-t bg-muted/20 p-4 space-y-4">
            {/* Pipeline Visualization */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                <Radio className="w-3 h-3" /> Event Received
              </div>
              <ArrowDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${runLogs.length > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {runLogs.length > 0 ? <CheckCircle2 className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                {runLogs.length > 0 ? `${runLogs.length} Rule(s) Matched` : 'No Rules Matched'}
              </div>
              {runLogs.length > 0 && (
                <>
                  <ArrowDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
                    <Activity className="w-3 h-3" /> Evaluated
                  </div>
                </>
              )}
            </div>

            {/* Event Payload */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Event Payload</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {payload.employee && <div><span className="text-muted-foreground">Employee:</span> {payload.employee}</div>}
                {payload.truck && <div><span className="text-muted-foreground">Truck:</span> {payload.truck}</div>}
                {payload.blocking_reason && <div className="col-span-2"><span className="text-muted-foreground">Blocking Reason:</span> {payload.blocking_reason}</div>}
                {payload.related_record_id && <div className="col-span-2"><span className="text-muted-foreground">Record ID:</span> <code className="font-mono">{payload.related_record_id}</code></div>}
                {payload.timestamp && <div><span className="text-muted-foreground">Timestamp:</span> {formatTime(payload.timestamp)}</div>}
              </div>
            </div>

            {/* Rule Run Logs */}
            {runLogs.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Rule Evaluation Results</p>
                {runLogs.map((run, i) => {
                  const runStatus = STATUS_CONFIG[run.status] || STATUS_CONFIG.received;
                  let conditions = [];
                  let actions = [];
                  try { conditions = JSON.parse(run.conditions_evaluated_json || '[]'); } catch {}
                  try { actions = JSON.parse(run.actions_executed_json || '[]'); } catch {}

                  return (
                    <div key={i} className="border rounded-lg p-3 bg-background">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <runStatus.icon className={`w-4 h-4 ${runStatus.color}`} />
                          <span className="text-sm font-medium">{run.rule_name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${runStatus.bg} ${runStatus.color}`}>
                          {runStatus.label}
                        </span>
                      </div>

                      {/* Conditions */}
                      {conditions.length > 0 && (
                        <div className="mb-2 space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Conditions:</p>
                          {conditions.map((c, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs pl-3">
                              {c.passed ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                              <code className="font-mono">{c.field} {c.operator} {c.expected || ''}</code>
                              <span className="text-muted-foreground">→ actual: "{c.actual ?? '∅'}"</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {actions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Actions:</p>
                          {actions.map((a, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs pl-3">
                              <Zap className={`w-3 h-3 ${a.status === 'success' ? 'text-green-600' : 'text-red-600'}`} />
                              <span className="font-medium">{a.action_key}</span>
                              <span className={a.status === 'success' ? 'text-green-600' : 'text-red-600'}>{a.status}</span>
                              {a.error && <span className="text-red-500">— {a.error}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Error */}
                      {run.error_message && (
                        <div className="mt-2 p-2 rounded bg-red-50 border border-red-100">
                          <p className="text-xs text-red-700"><strong>Error:</strong> {run.error_message}</p>
                        </div>
                      )}

                      {run.duration_ms != null && (
                        <p className="text-xs text-muted-foreground mt-1.5">Duration: {run.duration_ms}ms</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-700">
                  No active rules matched this event. Create a rule with source module "{eventLog.source_module}" and trigger event "{eventLog.trigger_event}" to see evaluation results here.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LiveEvents() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchLogs = useCallback(() => {
    setLoading(true);
    base44.entities.AutomationRunLog.list('-created_date', 100)
      .then(all => {
        setLogs(all || []);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Group: event logs with their associated rule run logs
  const eventLogs = logs.filter(l => l.log_type === 'event');
  const runLogs = logs.filter(l => l.log_type === 'rule_run');

  const grouped = eventLogs.map(evt => {
    const related = runLogs.filter(r =>
      r.source_module === evt.source_module &&
      r.trigger_event === evt.trigger_event &&
      Math.abs(new Date(r.created_date) - new Date(evt.created_date)) < 60000
    );
    return { eventLog: evt, runLogs: related };
  });

  const filtered = filter === 'all' ? grouped :
    filter === 'matched' ? grouped.filter(g => g.runLogs.length > 0) :
    filter === 'no_match' ? grouped.filter(g => g.runLogs.length === 0 || g.runLogs.every(r => r.status === 'no_match')) :
    filter === 'failed' ? grouped.filter(g => g.runLogs.some(r => r.status === 'failed' || r.status === 'error')) :
    grouped;

  const stats = {
    total: eventLogs.length,
    matched: grouped.filter(g => g.runLogs.some(r => r.status !== 'no_match')).length,
    noMatch: grouped.filter(g => g.runLogs.length === 0 || g.runLogs.every(r => r.status === 'no_match')).length,
    failed: grouped.filter(g => g.runLogs.some(r => r.status === 'failed' || r.status === 'error')).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Events Monitor</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time event pipeline — every event received, rule matched, action executed, and error logged.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Events', value: stats.total, color: 'bg-blue-50 text-blue-700' },
          { label: 'Matched', value: stats.matched, color: 'bg-green-50 text-green-700' },
          { label: 'No Match', value: stats.noMatch, color: 'bg-gray-50 text-gray-600' },
          { label: 'Failed', value: stats.failed, color: 'bg-red-50 text-red-700' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'matched', label: 'Matched' },
          { key: 'no_match', label: 'No Match' },
          { key: 'failed', label: 'Failed' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors select-none ${
              filter === f.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Event List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <Radio className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No events logged yet</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Events appear here when a module publishes them. To test the pipeline, trigger a WH-105
              blocked transition or use the Manual Test Runner.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((g, i) => (
            <EventRow key={g.eventLog.id || i} eventLog={g.eventLog} runLogs={g.runLogs} />
          ))}
        </div>
      )}
    </div>
  );
}