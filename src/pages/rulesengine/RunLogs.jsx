import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollText, RefreshCw, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Zap } from 'lucide-react';

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: 'Success' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
  error: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: 'Error' },
  no_match: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-100', label: 'No Match' },
  evaluated: { icon: ScrollText, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Evaluated' },
  received: { icon: ScrollText, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Received' },
  matched: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: 'Matched' },
};

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
  });
}

export default function RunLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    base44.entities.AutomationRunLog.filter({ log_type: 'rule_run' }, '-created_date', 200)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    failed: logs.filter(l => l.status === 'failed' || l.status === 'error').length,
    noMatch: logs.filter(l => l.status === 'no_match').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Run Logs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Execution history for every rule evaluation.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Runs', value: stats.total, color: 'text-blue-700' },
          { label: 'Success', value: stats.success, color: 'text-green-700' },
          { label: 'Failed', value: stats.failed, color: 'text-red-700' },
          { label: 'No Match', value: stats.noMatch, color: 'text-gray-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <ScrollText className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No execution logs yet</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Run logs are created automatically when events trigger rule evaluation.
              Trigger a WH-105 blocked transition or use the Manual Test Runner to generate logs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground border-b pb-2 mb-2">
              <div className="col-span-3">Rule</div>
              <div className="col-span-2">Triggered At</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Duration</div>
              <div className="col-span-2">Actions</div>
              <div className="col-span-2">Error</div>
            </div>
            {logs.map(log => {
              const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.received;
              let actions = [];
              try { actions = JSON.parse(log.actions_executed_json || '[]'); } catch {}
              const successCount = actions.filter(a => a.status === 'success').length;
              const failedCount = actions.filter(a => a.status === 'failed').length;

              return (
                <div key={log.id} className="grid grid-cols-12 gap-2 text-xs border-b last:border-0 py-2.5 items-center">
                  <div className="col-span-3">
                    <p className="font-medium truncate">{log.rule_name || '—'}</p>
                    <p className="text-muted-foreground">{log.source_module} → {log.trigger_event}</p>
                  </div>
                  <div className="col-span-2 text-muted-foreground">{formatTime(log.created_date)}</div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      <cfg.icon className="w-3 h-3" /> {cfg.label}
                    </span>
                  </div>
                  <div className="col-span-1 text-muted-foreground">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</div>
                  <div className="col-span-2">
                    {actions.length > 0 ? (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-muted-foreground" />
                        {successCount} ok, {failedCount} failed
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="col-span-2 truncate text-red-600">{log.error_message || '—'}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}