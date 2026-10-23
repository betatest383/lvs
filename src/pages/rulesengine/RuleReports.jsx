import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { MODULE_EVENTS } from '@/lib/moduleEventRegistry';
import { ACTION_CATEGORIES } from '@/lib/enterpriseActionRegistry';

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899', '#10b981', '#6366f1', '#ef4444'];

export default function RuleReports() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.LogicRule.filter({ rule_type: 'automation' }, '-priority', 500)
      .then(setRules)
      .finally(() => setLoading(false));
  }, []);

  const byModule = {};
  rules.forEach(r => {
    const key = r.source_module_name || r.source_module || 'Unassigned';
    byModule[key] = (byModule[key] || 0) + 1;
  });
  const moduleData = Object.entries(byModule).map(([name, count]) => ({ name, count }));

  const statusData = [
    { name: 'Active', value: rules.filter(r => r.is_active !== false).length },
    { name: 'Inactive', value: rules.filter(r => r.is_active === false).length },
  ];

  const byCategory = {};
  rules.forEach(r => {
    let acts = [];
    try { acts = JSON.parse(r.actions_json || '[]'); } catch {}
    acts.forEach(a => {
      const cat = ACTION_CATEGORIES.find(c => c.actions.some(act => act.actionKey === a.action_key))?.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
  });
  const categoryData = Object.entries(byCategory).map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rule Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Analytics across all enterprise automation rules.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : rules.length === 0 ? (
        <Card><CardContent className="p-8 text-center space-y-2">
          <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No data to report yet</p>
          <p className="text-xs text-muted-foreground">Create automation rules to see analytics here.</p>
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Rules by Source Module</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={moduleData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Active vs Inactive</p>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {statusData.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : '#9ca3af'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Actions by Category</p>
              {categoryData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No actions configured yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}