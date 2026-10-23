import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, DollarSign, Clock } from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import ImprovementFormDialog from '@/components/ci/ImprovementFormDialog';
import { PRIORITY_COLORS } from '@/lib/improvementConstants';

export default function ImplementedImprovements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const all = await base44.entities.ImprovementRequest.list('-created_date', 500);
      setItems(all.filter((i) => i.status === 'Implemented'));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  const totalSavings = items.reduce((s, i) => s + (i.estimated_cost_savings || 0), 0);
  const totalTime = items.reduce((s, i) => s + (i.estimated_time_saved_hours || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-accent" /> Implemented Improvements
        </h1>
        <p className="text-muted-foreground text-sm">Completed improvements and their measurable impact</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Implemented" value={items.length} icon={CheckCircle2} color="text-teal-500" />
        <StatCard label="Total Cost Savings" value={`$${totalSavings.toLocaleString()}`} icon={DollarSign} color="text-green-500" />
        <StatCard label="Total Time Saved" value={`${totalTime.toFixed(0)}h`} icon={Clock} color="text-blue-500" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Implemented Ideas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No improvements implemented yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((item) => {
                const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => { setEditItem(item); setEditOpen(true); }}>
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.improvement_id} · {item.category} · Completed {item.completion_date || '—'}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${pc.bg} ${pc.text} hidden sm:inline`}>{item.priority}</span>
                    {item.estimated_cost_savings > 0 && <span className="text-xs font-semibold text-green-600 shrink-0">${item.estimated_cost_savings.toLocaleString()}</span>}
                    {item.estimated_time_saved_hours > 0 && <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">{item.estimated_time_saved_hours}h saved</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ImprovementFormDialog open={editOpen} onClose={() => setEditOpen(false)} improvement={editItem} onSaved={load} />
    </div>
  );
}