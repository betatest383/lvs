import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { User, Lightbulb, CheckCircle2, DollarSign } from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import ImprovementFormDialog from '@/components/ci/ImprovementFormDialog';
import { STATUS_COLORS, PRIORITY_COLORS } from '@/lib/improvementConstants';

export default function MyIdeas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      load(u);
    }).catch(() => setLoading(false));
  }, []);

  const load = async (u) => {
    try {
      const all = await base44.entities.ImprovementRequest.list('-created_date', 500);
      setItems(all.filter((i) => i.submitted_by_email === u?.email));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  const submitted = items.length;
  const approved = items.filter((i) => ['Approved', 'In Development', 'Testing', 'Implemented'].includes(i.status)).length;
  const implemented = items.filter((i) => i.status === 'Implemented').length;
  const savings = items.filter((i) => i.status === 'Implemented').reduce((s, i) => s + (i.estimated_cost_savings || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="w-6 h-6 text-accent" /> My Submitted Ideas
        </h1>
        <p className="text-muted-foreground text-sm">Track your improvement submissions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ideas Submitted" value={submitted} icon={Lightbulb} color="text-blue-500" />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} color="text-green-500" />
        <StatCard label="Implemented" value={implemented} icon={CheckCircle2} color="text-teal-500" />
        <StatCard label="Est. Cost Savings" value={`$${savings.toLocaleString()}`} icon={DollarSign} color="text-green-500" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">My Ideas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">You haven't submitted any ideas yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((item) => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.New;
                const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => { setEditItem(item); setEditOpen(true); }}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.improvement_id} · {item.category || 'Other'} · {item.date_submitted}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${pc.bg} ${pc.text} hidden sm:inline`}>{item.priority}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${sc.bg} ${sc.text}`}>{item.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ImprovementFormDialog open={editOpen} onClose={() => setEditOpen(false)} improvement={editItem} onSaved={() => load(user)} />
    </div>
  );
}