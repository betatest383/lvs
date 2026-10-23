import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, TrendingUp, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import { PRIORITY_RANK, PRIORITY_COLORS } from '@/lib/improvementConstants';

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4', '#a855f7', '#eab308', '#64748b', '#ef4444', '#22c55e'];

export default function ExecutiveDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setItems(await base44.entities.ImprovementRequest.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  // Top 10 opportunities
  const top10 = items
    .filter((i) => !['Implemented', 'Archived', 'Rejected'].includes(i.status))
    .sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
      if (pr !== 0) return pr;
      return (b.estimated_cost_savings || 0) - (a.estimated_cost_savings || 0);
    })
    .slice(0, 10);

  // Most common issues by category
  const catCounts = {};
  items.forEach((i) => { if (i.category) catCounts[i.category] = (catCounts[i.category] || 0) + 1; });
  const categoryData = Object.entries(catCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  // Department with most ideas
  const deptCounts = {};
  items.forEach((i) => { if (i.department) deptCounts[i.department] = (deptCounts[i.department] || 0) + 1; });
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  // Ideas awaiting review
  const awaitingReview = items.filter((i) => i.status === 'Needs Review' || i.status === 'New');

  // Estimated annual savings
  const annualSavings = items
    .filter((i) => i.status === 'Implemented')
    .reduce((s, i) => s + (i.estimated_cost_savings || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-accent" /> Executive Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">Strategic view of continuous improvement across the company</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Ideas" value={items.length} icon={BarChart3} color="text-blue-500" />
        <StatCard label="Awaiting Review" value={awaitingReview.length} icon={AlertTriangle} color="text-yellow-500" />
        <StatCard label="Est. Annual Savings" value={`$${annualSavings.toLocaleString()}`} icon={DollarSign} color="text-green-500" />
        <StatCard label="Top Department" value={deptData[0]?.name || '—'} icon={TrendingUp} color="text-purple-500" subtitle={`${deptData[0]?.value || 0} ideas`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most Common Issues (by Category)</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ideas by Department</CardTitle></CardHeader>
          <CardContent>
            {deptData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={deptData} margin={{ left: -10 }}>
                  <XAxis type="category" dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 10 Improvement Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          {top10.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No open opportunities.</p>
          ) : (
            <div className="space-y-2">
              {top10.map((item, i) => {
                const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors">
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.improvement_id} · {item.category}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${pc.bg} ${pc.text} shrink-0`}>{item.priority}</span>
                    {item.estimated_cost_savings > 0 && <span className="text-xs font-semibold text-green-600 shrink-0">${item.estimated_cost_savings.toLocaleString()}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Ideas Awaiting Review</CardTitle></CardHeader>
        <CardContent>
          {awaitingReview.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No ideas awaiting review.</p>
          ) : (
            <div className="space-y-1.5">
              {awaitingReview.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-mono text-muted-foreground">{item.improvement_id}</span>
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.submitted_by}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}