import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity, CheckCircle2, PauseCircle, AlertTriangle, Clock, Zap,
  TrendingUp, AlertOctagon, Link2, Unlink, AlertCircle, XCircle, FileWarning
} from 'lucide-react';
import { detectRuleConflicts } from '@/lib/ruleDependencyResolver';

export default function RuleHealth() {
  const [rules, setRules] = useState([]);
  const [runLogs, setRunLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-priority', 500),
      base44.entities.AutomationRunLog.filter({ log_type: 'rule_run' }, '-created_date', 200),
    ]).then(([r, logs]) => {
      setRules(r);
      setRunLogs(logs);
      detectRuleConflicts().then(setConflicts).catch(() => {});
    }).finally(() => setLoading(false));
  }, []);

  const health = useMemo(() => {
    const active = rules.filter(r => r.is_active !== false);
    const inactive = rules.filter(r => r.is_active === false);
    const draft = rules.filter(r => !r.source_module || !r.trigger_event);
    const needsReview = rules.filter(r => r.simulation_status === 'stale' || r.simulation_status === 'never');
    const failedSims = rules.filter(r => r.simulation_status === 'failed');
    const passedSims = rules.filter(r => r.simulation_status === 'passed');

    // Most triggered rules (by run count)
    const runCounts = {};
    runLogs.forEach(log => {
      if (log.rule_id) runCounts[log.rule_id] = (runCounts[log.rule_id] || 0) + 1;
    });
    const mostTriggered = Object.entries(runCounts)
      .map(([id, count]) => ({ rule: rules.find(r => r.id === id), count }))
      .filter(x => x.rule)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Slowest rules (by avg duration)
    const durations = {};
    runLogs.forEach(log => {
      if (log.rule_id && log.duration_ms) {
        if (!durations[log.rule_id]) durations[log.rule_id] = { total: 0, count: 0, name: log.rule_name };
        durations[log.rule_id].total += log.duration_ms;
        durations[log.rule_id].count++;
      }
    });
    const slowest = Object.entries(durations)
      .map(([id, d]) => ({ rule: rules.find(r => r.id === id), avgMs: Math.round(d.total / d.count), runs: d.count }))
      .filter(x => x.rule)
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    // Rules never triggered
    const neverTriggered = rules.filter(r => r.is_active !== false && !runCounts[r.id]);

    // Failed runs
    const failedRuns = runLogs.filter(l => l.status === 'failed' || l.status === 'error');

    // Broken references: rules with actions but no source_module or trigger_event
    const brokenRefs = rules.filter(r => r.is_active !== false && (!r.source_module || !r.trigger_event));

    // Rules with actions that reference unknown action keys
    const unknownActions = [];
    rules.forEach(r => {
      try {
        const actions = JSON.parse(r.actions_json || '[]');
        actions.forEach(a => {
          if (!a.action_key || a.action_key === '') {
            unknownActions.push({ rule: r, issue: 'Empty action key' });
          }
        });
      } catch {
        unknownActions.push({ rule: r, issue: 'Invalid actions JSON' });
      }
    });

    return {
      total: rules.length,
      active: active.length,
      inactive: inactive.length,
      draft: draft.length,
      needsReview: needsReview.length,
      failedSims: failedSims.length,
      passedSims: passedSims.length,
      mostTriggered,
      slowest,
      neverTriggered,
      failedRuns: failedRuns.length,
      brokenRefs,
      unknownActions,
      conflicts,
    };
  }, [rules, runLogs, conflicts]);

  const stats = [
    { label: 'Total Rules', value: health.total, icon: Activity, color: 'bg-blue-50 text-blue-700' },
    { label: 'Enabled', value: health.active, icon: CheckCircle2, color: 'bg-green-50 text-green-700' },
    { label: 'Disabled', value: health.inactive, icon: PauseCircle, color: 'bg-gray-50 text-gray-700' },
    { label: 'Draft', value: health.draft, icon: FileWarning, color: 'bg-amber-50 text-amber-700' },
    { label: 'Needs Review', value: health.needsReview, icon: AlertCircle, color: 'bg-orange-50 text-orange-700' },
    { label: 'Failed Simulations', value: health.failedSims, icon: XCircle, color: 'bg-red-50 text-red-700' },
    { label: 'Passed Sims', value: health.passedSims, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Failed Runs', value: health.failedRuns, icon: AlertOctagon, color: 'bg-red-50 text-red-700' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-accent" /> Rule Health Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Health monitor for the entire LVC OS Rules Engine.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Most Triggered */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-green-600" /> Most Triggered Rules</p>
            {health.mostTriggered.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules have been triggered yet.</p>
            ) : health.mostTriggered.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                <span className="truncate">{item.rule.rule_name}</span>
                <Badge className="text-xs bg-green-100 text-green-700">{item.count} runs</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Slowest Rules */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-600" /> Slowest Rules</p>
            {health.slowest.length === 0 ? (
              <p className="text-xs text-muted-foreground">No execution data available.</p>
            ) : health.slowest.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                <span className="truncate">{item.rule.rule_name}</span>
                <Badge className="text-xs bg-amber-100 text-amber-700">{item.avgMs}ms avg</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Never Triggered */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Unlink className="w-4 h-4 text-gray-500" /> Rules Never Triggered</p>
            {health.neverTriggered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-green-600">All active rules have been triggered at least once.</p>
            ) : health.neverTriggered.slice(0, 10).map((rule, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                <span className="truncate">{rule.rule_name}</span>
                <Badge variant="outline" className="text-xs text-gray-500">Never</Badge>
              </div>
            ))}
            {health.neverTriggered.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">+ {health.neverTriggered.length - 10} more</p>
            )}
          </CardContent>
        </Card>

        {/* Conflicting Rules */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4 text-red-600" /> Conflicting Rules</p>
            {health.conflicts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-green-600">No conflicts detected.</p>
            ) : health.conflicts.map((c, i) => (
              <div key={i} className="space-y-1 border-b last:border-0 pb-2">
                <p className="text-xs text-muted-foreground">{c.source_module} → {c.trigger_event} (priority {c.priority})</p>
                {c.rules.map((r, j) => (
                  <div key={j} className="flex items-center justify-between text-sm pl-2">
                    <span>{r.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Broken References */}
      {(health.brokenRefs.length > 0 || health.unknownActions.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-600" /> Broken References</p>
            {health.brokenRefs.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-700">Rules missing source module or trigger event:</p>
                {health.brokenRefs.map((r, i) => (
                  <div key={i} className="text-xs text-red-600 pl-2">• {r.rule_name} — {!r.source_module ? 'missing module' : 'missing event'}</div>
                ))}
              </div>
            )}
            {health.unknownActions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-700">Rules with invalid action configurations:</p>
                {health.unknownActions.map((item, i) => (
                  <div key={i} className="text-xs text-red-600 pl-2">• {item.rule.rule_name} — {item.issue}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}