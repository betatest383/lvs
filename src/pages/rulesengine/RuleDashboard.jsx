import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Cog, Zap, CheckCircle2, PauseCircle, Boxes, Wand2, ArrowRight } from 'lucide-react';
import { MODULE_EVENTS } from '@/lib/moduleEventRegistry';
import { ACTION_CATEGORIES } from '@/lib/enterpriseActionRegistry';

export default function RuleDashboard() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-updated_date', 500)
      .then(setRules)
      .finally(() => setLoading(false));
  }, []);

  const active = rules.filter(r => r.is_active !== false);
  const inactive = rules.filter(r => r.is_active === false);
  const modulesCovered = new Set(rules.map(r => r.source_module).filter(Boolean));

  // rules by module
  const byModule = {};
  rules.forEach(r => {
    const key = r.source_module || 'unassigned';
    byModule[key] = (byModule[key] || 0) + 1;
  });
  const moduleRows = Object.entries(byModule).sort((a, b) => b[1] - a[1]);

  // actions configured across all rules
  let totalActions = 0;
  const byActionCategory = {};
  rules.forEach(r => {
    let acts = [];
    try { acts = JSON.parse(r.actions_json || '[]'); } catch {}
    totalActions += acts.length;
    acts.forEach(a => {
      const cat = ACTION_CATEGORIES.find(c => c.actions.some(act => act.actionKey === a.action_key))?.categoryKey || 'other';
      byActionCategory[cat] = (byActionCategory[cat] || 0) + 1;
    });
  });

  const stats = [
    { label: 'Total Rules', value: rules.length, icon: Cog, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active', value: active.length, icon: CheckCircle2, color: 'bg-green-50 text-green-700' },
    { label: 'Inactive', value: inactive.length, icon: PauseCircle, color: 'bg-amber-50 text-amber-700' },
    { label: 'Modules Covered', value: modulesCovered.size, icon: Boxes, color: 'bg-purple-50 text-purple-700' },
    { label: 'Actions Configured', value: totalActions, icon: Zap, color: 'bg-accent/10 text-accent' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enterprise Rules Engine</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Central automation hub for every LVC OS module — manage triggers, conditions, and actions across the platform.</p>
        </div>
        <Link to="/rules-engine/builder" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors">
          <Wand2 className="w-4 h-4" /> Build a Rule
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold">Rules by Source Module</p>
                {moduleRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rules yet.</p>
                ) : moduleRows.map(([key, count]) => {
                  const mod = MODULE_EVENTS.find(m => m.moduleKey === key);
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${mod?.color?.split(' ')[0] || 'bg-gray-400'}`} />
                        {mod?.module || key}
                      </span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold">Actions by Category</p>
                {Object.keys(byActionCategory).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No actions configured.</p>
                ) : ACTION_CATEGORIES.map(cat => {
                  const count = byActionCategory[cat.categoryKey] || 0;
                  if (!count) return null;
                  return (
                    <div key={cat.categoryKey} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${cat.color.split(' ')[0]}`} />
                        {cat.category}
                      </span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Recent Rules</p>
                <Link to="/rules-engine/registry" className="text-xs text-accent flex items-center gap-1 hover:underline">View all <ArrowRight className="w-3 h-3" /></Link>
              </div>
              {rules.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">No automation rules yet.</p>
                  <Link to="/rules-engine/builder" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"><Wand2 className="w-4 h-4" /> Build your first rule</Link>
                </div>
              ) : rules.slice(0, 6).map(r => (
                <div key={r.id} className="flex items-center justify-between border-b last:border-0 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.rule_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.source_module_name || '—'} → {r.trigger_event_name || '—'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${r.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}