import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, CheckCircle2, XCircle, Play } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SIMULATOR_SCOPE_FIELDS, SIMULATOR_BASE_AMOUNTS, getLabel, APPLIES_TO_OPTIONS, OPERATOR_OPTIONS, CALCULATION_METHOD_OPTIONS } from './pricingConstants';
import { evaluateTrigger, calculateAdjustment, buildTriggerSummary, buildCalculationSummary } from '@/lib/pricingModifierEngine';

export default function ModifierSimulator({ open, onOpenChange, singleModifier }) {
  const [scopeValues, setScopeValues] = useState({});
  const [baseAmounts, setBaseAmounts] = useState({ labor_price: 4000, estimated_hours: 16, project_days: 1 });
  const [modifiers, setModifiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const query = singleModifier
      ? base44.entities.PricingModifier.filter({ id: singleModifier.id })
      : base44.entities.PricingModifier.filter({ status: 'active' }, 'display_order', 200);
    query.then(setModifiers).catch(() => setModifiers([])).finally(() => setLoading(false));
  }, [open, singleModifier]);

  const updateScope = (key, value) => setScopeValues(prev => ({ ...prev, [key]: value }));
  const updateBase = (key, value) => setBaseAmounts(prev => ({ ...prev, [key]: value }));

  const runTest = () => {
    const matched = [];
    for (const mod of modifiers) {
      const isMatch = evaluateTrigger(mod, scopeValues);
      if (isMatch) {
        const calc = calculateAdjustment(mod, baseAmounts);
        matched.push({ modifier: mod, ...calc });
      }
    }
    const totalAdjustment = matched.reduce((sum, m) => sum + m.adjustment, 0);
    const baseTotal = baseAmounts.total_selling_price || (baseAmounts.labor_price + baseAmounts.material_price + baseAmounts.equipment_price);
    setResults({ matched, totalAdjustment, baseTotal, adjustedTotal: baseTotal + totalAdjustment });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Modifier Simulator
            {singleModifier && <Badge variant="secondary" className="ml-2">Testing: {singleModifier.name}</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-sm font-semibold mb-2">Scope Values</h4>
            <div className="grid grid-cols-3 gap-2">
              {SIMULATOR_SCOPE_FIELDS.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {field.type === 'boolean' ? (
                    <div className="flex items-center gap-2 h-9">
                      <Switch checked={scopeValues[field.key] === 'true' || scopeValues[field.key] === true} onCheckedChange={v => updateScope(field.key, v ? 'true' : '')} />
                      <span className="text-xs text-muted-foreground">{scopeValues[field.key] ? 'Yes' : 'No'}</span>
                    </div>
                  ) : (
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={scopeValues[field.key] || ''}
                      onChange={e => updateScope(field.key, e.target.value)}
                      placeholder={field.placeholder || ''}
                      className="h-9"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Base Amounts</h4>
            <div className="grid grid-cols-3 gap-2">
              {SIMULATOR_BASE_AMOUNTS.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={baseAmounts[field.key] ?? ''}
                    onChange={e => updateBase(field.key, parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
              ))}
            </div>
          </div>
          <Button onClick={runTest} disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run Simulation
          </Button>
          {results && (
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Base Price</p>
                  <p className="text-lg font-bold">${results.baseTotal.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Adjustment</p>
                  <p className="text-lg font-bold text-accent">{results.totalAdjustment >= 0 ? '+' : ''}${results.totalAdjustment.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center bg-accent/5">
                  <p className="text-xs text-muted-foreground">Adjusted Price</p>
                  <p className="text-lg font-bold">${results.adjustedTotal.toFixed(2)}</p>
                </div>
              </div>
              {results.matched.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No modifiers matched the entered scope values.</p>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Matched Modifiers ({results.matched.length})</h4>
                  {results.matched.map((m, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{m.modifier.name}</span>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{m.modifier.category_name || '—'}</Badge>
                        <Badge variant="outline">{getLabel(APPLIES_TO_OPTIONS, m.modifier.applies_to)}</Badge>
                        <Badge variant="outline">{getLabel(CALCULATION_METHOD_OPTIONS, m.modifier.calculation_method)}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs mt-1">
                        <div><span className="text-muted-foreground">Trigger:</span> {buildTriggerSummary(m.modifier)}</div>
                        <div><span className="text-muted-foreground">Base:</span> ${m.baseAmount.toFixed(2)}</div>
                        <div><span className="text-muted-foreground">Formula:</span> {m.formula}</div>
                        <div><span className="text-muted-foreground">Adjustment:</span> <span className={m.adjustment >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{m.adjustment >= 0 ? '+' : ''}${m.adjustment.toFixed(2)}</span></div>
                      </div>
                      <div className="text-xs"><span className="text-muted-foreground">Resulting price:</span> <span className="font-medium">${m.newPrice.toFixed(2)}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}