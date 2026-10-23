import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Download, FlaskConical, ChevronRight, AlertCircle, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import SimulationTimeline from '@/components/rulesengine/SimulationTimeline';
import SimulatedFindingDetail from '@/components/rulesengine/SimulatedFindingDetail';

export default function RuleSimulator() {
  const params = useParams();
  const preselectedRuleId = params.ruleId || '';
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState(preselectedRuleId || '');
  const [testInput, setTestInput] = useState({});
  const [breakpoints, setBreakpoints] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadRules = () => base44.entities.LogicRule.filter({}, '-priority', 500).then(setRules).finally(() => setLoading(false));

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    if (preselectedRuleId) setSelectedRuleId(preselectedRuleId);
  }, [preselectedRuleId]);

  const selectedRule = useMemo(
    () => rules.find(r => r.id === selectedRuleId),
    [rules, selectedRuleId]
  );

  const eventFields = useMemo(() => {
    if (!selectedRule) return [];
    try {
      return JSON.parse(selectedRule.event_fields_json || '[]');
    } catch {
      return [];
    }
  }, [selectedRule]);

  const actions = useMemo(() => {
    if (!selectedRule) return [];
    try {
      return JSON.parse(selectedRule.actions_json || '[]');
    } catch {
      return [];
    }
  }, [selectedRule]);

  const handleRunSimulation = async () => {
    if (!selectedRuleId) return;
    setSimulating(true);
    setError('');
    setResult(null);
    try {
      const resp = await base44.functions.invoke('simulateRule', {
        rule_id: selectedRuleId,
        test_input: testInput,
        breakpoints: breakpoints.length > 0 ? breakpoints : undefined,
      });
      setResult(resp.data || resp);
      // Refresh rule list so the simulation status badge updates in the dropdown
      loadRules();
    } catch (err) {
      setError(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const handleExportTrace = () => {
    if (!result?.trace) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-${selectedRule?.rule_name?.replace(/\s+/g, '-').toLowerCase() || 'trace'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleBreakpoint = (actionKey) => {
    setBreakpoints(prev =>
      prev.includes(actionKey)
        ? prev.filter(k => k !== actionKey)
        : [...prev, actionKey]
    );
  };

  const isPaused = result?.status === 'paused';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-accent" /> Rule Simulator
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Execute any rule in a sandbox environment. No live records are created or modified.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: Configuration ── */}
        <div className="space-y-4">
          {/* Rule Selector */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">1. Select Rule</Label>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                <SelectTrigger><SelectValue placeholder="Choose a rule..." /></SelectTrigger>
                <SelectContent>
                  {rules.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        {r.rule_name}
                        {r.simulation_status === 'passed' && <span className="w-2 h-2 rounded-full bg-green-500" />}
                        {r.simulation_status === 'failed' && <span className="w-2 h-2 rounded-full bg-red-500" />}
                        {r.simulation_status === 'never' && <span className="w-2 h-2 rounded-full bg-gray-300" />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRule && (
                <div className="text-xs space-y-1 bg-muted/50 rounded-lg p-3 border">
                  <div className="flex justify-between"><span className="text-muted-foreground">Module:</span><span className="font-medium">{selectedRule.source_module_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Trigger:</span><span className="font-medium">{selectedRule.trigger_event_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Priority:</span><span className="font-medium">{selectedRule.priority || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Sim:</span><span className="font-medium">{selectedRule.last_simulated_at ? new Date(selectedRule.last_simulated_at).toLocaleDateString() : 'Never'}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Input */}
          {selectedRule && eventFields.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-semibold">2. Test Input</Label>
                <p className="text-xs text-muted-foreground">Enter values for the event fields the rule expects.</p>
                {eventFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">{field.label} <span className="text-muted-foreground font-mono">({field.type})</span></Label>
                    {field.type === 'boolean' ? (
                      <Select value={String(testInput[field.key] ?? '')} onValueChange={v => setTestInput(prev => ({ ...prev, [field.key]: v === 'true' }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : field.type === 'number' ? (
                      <Input type="number" className="h-8 text-xs" placeholder={`Enter ${field.label}...`} value={testInput[field.key] ?? ''} onChange={e => setTestInput(prev => ({ ...prev, [field.key]: Number(e.target.value) }))} />
                    ) : (
                      <Input className="h-8 text-xs" placeholder={`Enter ${field.label}...`} value={testInput[field.key] ?? ''} onChange={e => setTestInput(prev => ({ ...prev, [field.key]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Breakpoints */}
          {selectedRule && actions.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5"><Pause className="w-3.5 h-3.5" /> 3. Breakpoints</Label>
                <p className="text-xs text-muted-foreground">Pause simulation after these actions.</p>
                <div className="space-y-2">
                  {actions.map((action, i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={breakpoints.includes(action.action_key)} onCheckedChange={() => toggleBreakpoint(action.action_key)} />
                      <span className="text-xs">{action.action_key}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Run Button */}
          <Button onClick={handleRunSimulation} disabled={!selectedRuleId || simulating} className="w-full gap-2">
            {simulating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Simulating...</> : <><Play className="w-4 h-4" /> Run Simulation</>}
          </Button>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* ── Right: Results ── */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              {/* Status Banner */}
              <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                result.status === 'passed' ? 'bg-green-50 border-green-200' :
                result.status === 'failed' ? 'bg-red-50 border-red-200' :
                result.status === 'warning' ? 'bg-amber-50 border-amber-200' :
                result.status === 'paused' ? 'bg-purple-50 border-purple-200' :
                'bg-muted/50 border-border'
              }`}>
                {result.status === 'passed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {result.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
                {result.status === 'paused' && <Pause className="w-5 h-5 text-purple-600" />}
                {result.status === 'warning' && <AlertCircle className="w-5 h-5 text-amber-600" />}
                <div className="flex-1">
                  <p className="text-sm font-semibold capitalize">
                    {result.status === 'paused' ? `Paused at breakpoint: ${result.breakpoint_hit}` : `Simulation ${result.status}`}
                  </p>
                  <p className="text-xs text-muted-foreground">Execution time: {result.elapsed_ms}ms</p>
                </div>
                {isPaused && (
                  <Button size="sm" variant="outline" onClick={handleRunSimulation} className="gap-1.5">
                    <Play className="w-3.5 h-3.5" /> Continue
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleExportTrace} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export
                </Button>
              </div>

              {/* Timeline */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Execution Timeline</p>
                    <Badge variant="outline" className="text-xs">{result.trace?.length || 0} steps</Badge>
                  </div>
                  <SimulationTimeline trace={result.trace} />
                </CardContent>
              </Card>

              {/* Summary */}
              {result.summary && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-semibold">Simulation Summary</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <SummaryStat label="Triggered" value={result.summary.triggered ? 'Yes' : 'No'} icon={Zap} color={result.summary.triggered ? 'text-green-600' : 'text-gray-500'} />
                      <SummaryStat label="Skipped" value={result.summary.skipped ? 'Yes' : 'No'} icon={ChevronRight} color={result.summary.skipped ? 'text-gray-500' : 'text-green-600'} />
                      <SummaryStat label="Conditions Passed" value={result.summary.conditions_passed ? 'Yes' : 'No'} icon={CheckCircle2} color={result.summary.conditions_passed ? 'text-green-600' : 'text-red-600'} />
                      <SummaryStat label="Actions Executed" value={result.summary.actions_executed} icon={Zap} color="text-blue-600" />
                      <SummaryStat label="Warnings" value={result.summary.warnings} icon={AlertCircle} color={result.summary.warnings > 0 ? 'text-amber-600' : 'text-green-600'} />
                      <SummaryStat label="Errors" value={result.summary.errors} icon={XCircle} color={result.summary.errors > 0 ? 'text-red-600' : 'text-green-600'} />
                      <SummaryStat label="Execution Time" value={`${result.summary.execution_time_ms}ms`} icon={Clock} color="text-accent" />
                      <SummaryStat label="Actions Failed" value={result.summary.actions_failed} icon={XCircle} color={result.summary.actions_failed > 0 ? 'text-red-600' : 'text-green-600'} />
                    </div>
                    {result.summary.warning_list?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-700">Warnings:</p>
                        {result.summary.warning_list.map((w, i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
                      </div>
                    )}
                    {result.summary.error_list?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-red-700">Errors:</p>
                        {result.summary.error_list.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Conditions Detail */}
              {result.condition_results?.length > 0 && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-semibold">Conditions Evaluated</p>
                    {result.condition_results.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 py-1.5">
                        <span className="font-mono">{c.field} {c.operator} {c.expected}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">actual: {String(c.actual)}</span>
                          {c.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Simulated Finding Output — enriched with inherited template config */}
              {result.actions_executed?.length > 0 && (
                <SimulatedFindingDetail actions={result.actions_executed} />
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a rule and run a simulation to see the execution timeline, conditions, and action results.</p>
                <p className="text-xs mt-1">All simulations run in sandbox mode — no live data is modified.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      <Icon className={`w-4 h-4 ${color}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}