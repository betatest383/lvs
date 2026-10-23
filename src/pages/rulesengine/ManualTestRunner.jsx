import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FlaskConical, Play, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { ACTION_CATEGORIES, ALL_ACTIONS } from '@/lib/enterpriseActionRegistry';

const OPERATORS = {
  equals: (a, b) => String(a) === String(b),
  not_equals: (a, b) => String(a) !== String(b),
  contains: (a, b) => String(a).includes(String(b)),
  not_contains: (a, b) => !String(a).includes(String(b)),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  exists: (a) => a !== undefined && a !== null && a !== '',
  not_exists: (a) => a === undefined || a === null || a === '',
  is_empty: (a) => a === '' || a === undefined || a === null,
  is_not_empty: (a) => a !== '' && a !== undefined && a !== null,
};

export default function ManualTestRunner() {
  const params = useParams();
  const preselectedId = params.ruleId || '';
  const [rules, setRules] = useState([]);
  const [selectedId, setSelectedId] = useState(preselectedId);
  const [sampleValues, setSampleValues] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    base44.entities.LogicRule.filter({}, '-priority', 500).then(setRules);
  }, []);

  useEffect(() => {
    if (preselectedId) setSelectedId(preselectedId);
  }, [preselectedId]);

  const selected = rules.find(r => r.id === selectedId);

  let eventFields = [];
  let conditions = [];
  let actions = [];
  if (selected) {
    try { eventFields = JSON.parse(selected.event_fields_json || '[]'); } catch {}
    try { conditions = JSON.parse(selected.conditions_json || '[]'); } catch {}
    try { actions = JSON.parse(selected.actions_json || '[]'); } catch {}
  }

  const runTest = async () => {
    if (!selected) return;
    const evaluatedConditions = conditions.filter(c => c.condition_type !== 'event_age' && c.field);
    const passed = evaluatedConditions.length === 0
      ? true
      : evaluatedConditions.every(c => {
        const actual = sampleValues[c.field];
        const op = OPERATORS[c.operator];
        if (!op) return true;
        return c.operator.startsWith('exists') || c.operator.startsWith('is_')
          ? op(actual)
          : op(actual, c.value);
      });
    const testResult = { passed, conditions, actions };
    setResult(testResult);

    // Auto-update the rule's simulation status
    const simStatus = passed ? 'passed' : 'failed';
    const summary = {
      triggered: passed,
      skipped: !passed,
      conditions_passed: passed,
      actions_executed: passed ? actions.length : 0,
      warnings: 0,
      errors: 0,
      execution_time_ms: 0,
    };
    try {
      await base44.entities.LogicRule.update(selected.id, {
        simulation_status: simStatus,
        last_simulated_at: new Date().toISOString(),
        last_simulation_result_json: JSON.stringify(summary),
      });
      // Refresh rules so the status badge updates
      base44.entities.LogicRule.filter({}, '-priority', 500).then(setRules);
    } catch (err) {
      // Status update failure should not block the test result display
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manual Test Runner</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Simulate an event payload and preview which conditions pass and which actions would fire.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-accent" /> Select a Rule</Label>
          <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); setSampleValues({}); setResult(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose an automation rule..." /></SelectTrigger>
            <SelectContent>
              {rules.map(r => <SelectItem key={r.id} value={r.id}>{r.rule_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">Sample Event Payload</p>
            <p className="text-xs text-muted-foreground">Enter sample values for the fields exposed by <code>{selected.trigger_event_name}</code>.</p>
            {eventFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">No event fields defined for this rule.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {eventFields.map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label} <span className="text-muted-foreground font-mono">({f.type})</span></Label>
                    <Input
                      value={sampleValues[f.key] || ''}
                      onChange={e => setSampleValues(s => ({ ...s, [f.key]: e.target.value }))}
                      placeholder={`e.g. ${f.type === 'number' ? '42' : 'sample'}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <Button onClick={runTest} className="gap-1.5"><Play className="w-4 h-4" /> Run Test</Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className={`flex items-center gap-2 p-3 rounded-lg ${result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.passed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              <div>
                <p className="font-semibold text-sm">{result.passed ? 'Conditions MET — rule would fire' : 'Conditions NOT met — rule would not fire'}</p>
                <p className="text-xs">{result.passed ? `${result.actions.length} action(s) would execute.` : 'No actions would execute.'}</p>
              </div>
            </div>

            {result.conditions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Condition Evaluation</p>
                {result.conditions.filter(c => c.field && c.condition_type !== 'event_age').map((c, i) => {
                  const op = OPERATORS[c.operator];
                  const actual = sampleValues[c.field];
                  const passed = op ? (c.operator.startsWith('exists') || c.operator.startsWith('is_') ? op(actual) : op(actual, c.value)) : true;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {passed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                      <code className="font-mono">{c.field} {c.operator} {c.value || ''}</code>
                      <span className="text-muted-foreground">→ actual: "{actual || '∅'}"</span>
                    </div>
                  );
                })}
              </div>
            )}

            {result.passed && result.actions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Actions That Would Fire</p>
                {result.actions.map((a, i) => {
                  const action = ALL_ACTIONS.find(act => act.actionKey === a.action_key);
                  const cat = ACTION_CATEGORIES.find(c => c.actions.some(act => act.actionKey === a.action_key));
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs border rounded p-2">
                      <Zap className={`w-3.5 h-3.5 ${cat?.color?.split(' ')[0] || 'bg-muted'}`} />
                      <span className="font-medium">{action?.action || a.action_key}</span>
                      <span className="text-muted-foreground">({(a.field_mappings || []).length} mapped fields)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}