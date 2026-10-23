import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, ShieldCheck, History, Plus, CheckCircle2, AlertTriangle, Ban, CopyPlus, DollarSign, Percent, Clock, Lock } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_BADGES = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  superseded: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-700',
};

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtET = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
};

const MAX_CAP = 8; // fixed company policy

// daily_target_hours = min(actual, 8); required GP = sum(target_hours) × hourly_target
function requiredGpForSchedule(dailyHours, hourlyTarget) {
  const totalTarget = dailyHours.reduce((s, h) => s + Math.min(h, MAX_CAP), 0);
  return totalTarget * hourlyTarget;
}

const PREVIEW_SCENARIOS = [
  { label: '2-hour day', hours: [2] },
  { label: '4-hour day', hours: [4] },
  { label: '6-hour day', hours: [6] },
  { label: '8-hour day', hours: [8] },
  { label: '10-hour day', hours: [10] },
  { label: '3-day: 8, 8, 2', hours: [8, 8, 2] },
  { label: '3-day: 10, 10, 2', hours: [10, 10, 2] },
];

export default function PricingPolicyPage() {
  const [user, setUser] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // New-version form — defaults to the new hourly-capped model
  const [form, setForm] = useState({
    policy_name: '',
    pricing_target_model: 'hourly_capped',
    gross_profit_target_per_crew_hour: 500,
    gross_profit_per_production_day: 4000,
    minimum_gross_margin_percentage: 65,
    minimum_net_contribution_per_production_day: 3600,
    effective_immediately: false,
    effective_date_time: '',
    change_reason: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const role = (u?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'owner') {
        setAccessDenied(true);
        return;
      }
      const res = await base44.functions.invoke('managePricingPolicy', { action: 'list_history' });
      setPolicies(res.data?.policies || []);
    } catch (e) {
      toast.error('Failed to load pricing policy: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePolicy = policies.find(p => p.status === 'active') || null;
  const sorted = [...policies].sort((a, b) => (b.version_number || 0) - (a.version_number || 0));

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const invoke = async (payload) => {
    const res = await base44.functions.invoke('managePricingPolicy', payload);
    if (res.data?.ok === false) throw new Error(res.data.error || 'Operation failed');
    return res.data;
  };

  const formModel = form.pricing_target_model;
  const propHourly = Number(form.gross_profit_target_per_crew_hour) || 0;
  const propDaily = Number(form.gross_profit_per_production_day) || 0;
  const propMm = Number(form.minimum_gross_margin_percentage) || 0;
  const propMinNet = Number(form.minimum_net_contribution_per_production_day) || 0;
  const derivedMaxPerDay = propHourly * MAX_CAP;

  const handleCreate = async () => {
    if (!form.policy_name.trim()) { toast.error('Policy name is required.'); return; }
    if (!form.change_reason.trim()) { toast.error('A written change reason is required.'); return; }
    if (!(propMm > 0 && propMm < 100)) { toast.error('Minimum gross margin must be between 0% and 100%.'); return; }
    if (!(propMinNet >= 0)) { toast.error('Minimum daily net contribution must be zero or greater.'); return; }
    if (formModel === 'hourly_capped') {
      if (!(propHourly > 0)) { toast.error('Gross profit target per crew hour must be greater than zero.'); return; }
    } else {
      if (!(propDaily > 0)) { toast.error('Gross profit per production day must be greater than zero.'); return; }
    }
    if (!form.effective_immediately && !form.effective_date_time) { toast.error('Choose an effective date or enable "Effective immediately".'); return; }

    setSaving(true);
    try {
      await invoke({ action: 'create_version', ...form });
      toast.success('Pricing policy version created.');
      setForm(prev => ({ ...prev, policy_name: '', change_reason: '', effective_date_time: '' }));
      await load();
    } catch (e) {
      toast.error(e.message || 'Failed to create policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (policy_id) => {
    setSaving(true);
    try {
      await invoke({ action: 'activate', policy_id });
      toast.success('Policy activated.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Activation failed.');
    } finally { setSaving(false); }
  };

  const handleCancel = async (policy_id) => {
    setSaving(true);
    try {
      await invoke({ action: 'cancel', policy_id });
      toast.success('Scheduled policy canceled.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Cancel failed.');
    } finally { setSaving(false); }
  };

  const handleCreateFrom = async (source_policy_id) => {
    setSaving(true);
    try {
      await invoke({ action: 'create_from', source_policy_id });
      toast.success('New draft created from this policy. Edit and activate it.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Create-from failed.');
    } finally { setSaving(false); }
  };

  const modelBadge = (p) => {
    const m = p.pricing_target_model || 'daily';
    return m === 'hourly_capped'
      ? <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">Hourly-capped</Badge>
      : <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700">Daily (legacy)</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (accessDenied) {
    return (
      <div className="p-6 max-w-2xl">
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-600" />
            <p className="font-semibold text-red-900">Access Denied</p>
            <p className="text-sm text-red-700 mt-1">Only authorized Owner/Admin users may view or change the Pricing Policy.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> Pricing Policy</h1>
        <p className="text-muted-foreground">Versioned company pricing targets. The pricing solver enforces these floors on every calculation.</p>
      </div>

      {/* Active Policy */}
      <Card className={activePolicy ? 'border-green-300 bg-green-50/40' : 'border-red-300 bg-red-50'}>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Active Pricing Policy</CardTitle></CardHeader>
        <CardContent>
          {!activePolicy ? (
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">No active pricing policy is configured.</p>
                <p className="text-sm text-red-700 mt-1">All pricing calculations are blocked until a policy is activated. Create and activate a version below.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {modelBadge(activePolicy)}
                <Badge variant="outline" className="text-xs">{activePolicy.policy_id} · v{activePolicy.version_number}</Badge>
                <span className="font-semibold">{activePolicy.policy_name}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(activePolicy.pricing_target_model || 'daily') === 'hourly_capped' ? (
                  <div><p className="text-xs text-muted-foreground">GP Target / Crew Hour</p><p className="text-xl font-bold flex items-center gap-1"><DollarSign className="w-4 h-4" />{money(activePolicy.gross_profit_target_per_crew_hour)}</p></div>
                ) : (
                  <div><p className="text-xs text-muted-foreground">GP / Production Day</p><p className="text-xl font-bold flex items-center gap-1"><DollarSign className="w-4 h-4" />{money(activePolicy.gross_profit_per_production_day)}</p></div>
                )}
                <div><p className="text-xs text-muted-foreground">Daily Cap</p><p className="text-xl font-bold flex items-center gap-1"><Clock className="w-4 h-4" />{(activePolicy.maximum_target_hours_per_day || MAX_CAP)} hrs</p></div>
                <div><p className="text-xs text-muted-foreground">Min Margin</p><p className="text-xl font-bold flex items-center gap-1"><Percent className="w-4 h-4" />{activePolicy.minimum_gross_margin_percentage}%</p></div>
                <div><p className="text-xs text-muted-foreground">Effective (ET)</p><p className="text-sm font-medium">{fmtET(activePolicy.effective_date_time)}</p></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New Version */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> Create New Policy Version</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Policy Name</Label>
              <Input value={form.policy_name} onChange={e => set('policy_name', e.target.value)} placeholder="e.g. Standard Pricing Policy (Hourly), Winter Pricing Policy" />
            </div>
            <div className="space-y-1.5">
              <Label>Change Reason (required)</Label>
              <Input value={form.change_reason} onChange={e => set('change_reason', e.target.value)} placeholder="e.g. Move to hourly GP target model" />
            </div>
          </div>

          {/* Target model selector */}
          <div className="space-y-1.5">
            <Label>Pricing Target Model</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="model" checked={formModel === 'hourly_capped'} onChange={() => set('pricing_target_model', 'hourly_capped')} />
                Hourly-capped (new)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="model" checked={formModel === 'daily'} onChange={() => set('pricing_target_model', 'daily')} />
                Daily (legacy)
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Legacy finalized estimates keep their original model. New hourly-capped snapshots store the per-day target hours for reproducibility.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {formModel === 'hourly_capped' ? (
              <div className="space-y-1.5">
                <Label>Gross Profit Target per Crew Hour ($)</Label>
                <Input type="number" step="any" min="0" value={form.gross_profit_target_per_crew_hour} onChange={e => set('gross_profit_target_per_crew_hour', parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground">Company required gross-profit target per scheduled crew hour. Must be greater than zero.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Required Gross Profit per Production Day ($)</Label>
                <Input type="number" step="any" min="0" value={form.gross_profit_per_production_day} onChange={e => set('gross_profit_per_production_day', parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground">Legacy daily model. Must be greater than zero.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Minimum Gross Margin (%)</Label>
              <Input type="number" step="any" min="0" max="100" value={form.minimum_gross_margin_percentage} onChange={e => set('minimum_gross_margin_percentage', parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">Between 0 and 100. Decimals allowed (e.g. 62.5). Independent of the GP target.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Net Contribution per Production Day ($)</Label>
              <Input type="number" step="any" min="0" value={form.minimum_net_contribution_per_production_day} onChange={e => set('minimum_net_contribution_per_production_day', parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">After direct costs and overhead. Technician price adjustments cannot reduce an option below this amount for each production day.</p>
            </div>
          </div>

          {formModel === 'hourly_capped' && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Daily GP Target Cap:</span>
                <span className="font-semibold">{MAX_CAP} hours</span>
                <span className="text-xs text-muted-foreground">(fixed company policy — not editable, not overridable)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Maximum GP Target per Full Production Day = hourly target × 8:</span>
                <span className="font-semibold">{money(derivedMaxPerDay)}</span>
              </div>
              <div className="text-xs text-muted-foreground pl-6">
                Examples: {money(500)}/hr → {money(4000)} · {money(475)}/hr → {money(3800)} · {money(450)}/hr → {money(3600)}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Effective Date and Time</Label>
            <div className="flex items-center gap-3">
              <Input type="datetime-local" value={form.effective_date_time} onChange={e => set('effective_date_time', e.target.value)} disabled={form.effective_immediately} />
              <div className="flex items-center gap-2">
                <Switch checked={form.effective_immediately} onCheckedChange={v => set('effective_immediately', v)} />
                <Label className="text-sm">Effective immediately</Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Interpreted in the America/New_York business timezone.</p>
            <p className="text-xs text-blue-700 flex items-start gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Scheduled policies activate automatically at their effective time (checked every few minutes by the pricing-policy automation) — no manual activation required.
            </p>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-semibold mb-2">
              {formModel === 'hourly_capped'
                ? 'Policy Preview — Required Gross Profit by Daily Crew Hours'
                : 'Policy Preview — Required Gross Profit by Production Days'}
            </p>
            {formModel === 'hourly_capped' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-1">Schedule</th>
                      <th className="text-right">Actual Hours</th>
                      <th className="text-right">Target Hours</th>
                      <th className="text-right">Required GP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_SCENARIOS.map((s) => {
                      const actual = s.hours.reduce((a, b) => a + b, 0);
                      const target = s.hours.reduce((a, b) => a + Math.min(b, MAX_CAP), 0);
                      const gp = target * propHourly;
                      return (
                        <tr key={s.label} className="border-b last:border-0">
                          <td className="py-1.5">{s.label}</td>
                          <td className="text-right">{actual}</td>
                          <td className="text-right">{target}</td>
                          <td className="text-right font-medium">{money(gp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-2">
                  8- and 10-hour days have the same target hours (8), so the same required GP — while actual labor costs differ. The two-hour day contributes only {money(2 * propHourly)}.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-1">Production Days</th>
                    <th className="text-right">Required GP</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map(d => (
                    <tr key={d} className="border-b last:border-0">
                      <td className="py-1.5">{d}</td>
                      <td className="text-right font-medium">{money(d * propDaily)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Minimum margin: <span className="font-medium">{propMm}%</span>. Actual selling-price changes depend on materials, labor, equipment, commission, discounts, and which financial target controls per option.
            </p>
            <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              This creates a <strong>draft</strong>. Do not activate until implementation and persisted tests pass.
            </p>
          </div>

          <Button onClick={handleCreate} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {form.effective_immediately ? 'Create & Activate Version' : 'Create Draft Version'}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Pricing Policy History</CardTitle></CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pricing policy versions exist yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-1.5 pr-2">Version</th>
                    <th className="pr-2">Policy Name</th>
                    <th className="pr-2">Model</th>
                    <th className="pr-2">Effective (ET)</th>
                    <th className="text-right pr-2">GP Target</th>
                    <th className="text-right pr-2">Min Margin</th>
                    <th className="pr-2">Status</th>
                    <th className="pr-2">Changed By</th>
                    <th className="pr-2">Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => {
                    const isHourly = (p.pricing_target_model || 'daily') === 'hourly_capped';
                    return (
                      <tr key={p.id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-2 font-medium">{p.policy_id}<br/><span className="text-xs text-muted-foreground">v{p.version_number}</span></td>
                        <td className="pr-2">{p.policy_name}</td>
                        <td className="pr-2">{modelBadge(p)}</td>
                        <td className="pr-2 text-xs">{fmtET(p.effective_date_time)}</td>
                        <td className="text-right pr-2">
                          {isHourly
                            ? <span>{money(p.gross_profit_target_per_crew_hour)}/hr<br/><span className="text-xs text-muted-foreground">max {money((p.gross_profit_target_per_crew_hour || 0) * (p.maximum_target_hours_per_day || MAX_CAP))}/day</span></span>
                            : money(p.gross_profit_per_production_day)}
                        </td>
                        <td className="text-right pr-2">{p.minimum_gross_margin_percentage}%</td>
                        <td className="pr-2"><Badge className={STATUS_BADGES[p.status] || 'bg-gray-100'}>{p.status}</Badge></td>
                        <td className="pr-2 text-xs">{p.activated_by || p.created_by}</td>
                        <td className="pr-2 text-xs text-muted-foreground max-w-[200px]">{p.change_reason}</td>
                        <td className="text-right whitespace-nowrap">
                          {(p.status === 'draft' || p.status === 'scheduled') && (
                            <Button size="sm" variant="outline" className="mr-1 h-7 text-xs" onClick={() => handleActivate(p.policy_id)} disabled={saving}>Activate</Button>
                          )}
                          {(p.status === 'draft' || p.status === 'scheduled') && (
                            <Button size="sm" variant="ghost" className="mr-1 h-7 text-xs text-red-600" onClick={() => handleCancel(p.policy_id)} disabled={saving}><Ban className="w-3 h-3 mr-1" />Cancel</Button>
                          )}
                          {p.status !== 'draft' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleCreateFrom(p.policy_id)} disabled={saving}><CopyPlus className="w-3 h-3 mr-1" />New From</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}