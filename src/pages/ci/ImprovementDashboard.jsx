import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import {
  Lightbulb, Plus, List, KanbanSquare, CheckCircle2, BarChart3, User,
  Clock, DollarSign, AlertTriangle, Sparkles,
} from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import Gamification from '@/components/ci/Gamification';
import ImprovementFormDialog from '@/components/ci/ImprovementFormDialog';
import { STATUS_COLORS, calcAvgDaysToComplete } from '@/lib/improvementConstants';

export default function ImprovementDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setItems(await base44.entities.ImprovementRequest.list('-created_date', 500));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  const countByStatus = (s) => items.filter((i) => i.status === s).length;
  const now = new Date();
  const implementedThisMonth = items.filter((i) => i.status === 'Implemented' && i.completion_date && new Date(i.completion_date).getMonth() === now.getMonth() && new Date(i.completion_date).getFullYear() === now.getFullYear()).length;
  const avgDays = calcAvgDaysToComplete(items);
  const totalTimeSaved = items.filter((i) => i.status === 'Implemented').reduce((s, i) => s + (i.estimated_time_saved_hours || 0), 0);
  const totalCostSavings = items.filter((i) => i.status === 'Implemented').reduce((s, i) => s + (i.estimated_cost_savings || 0), 0);
  const recent = items.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-accent" /> Continuous Improvement
          </h1>
          <p className="text-muted-foreground text-sm">Improvement management system for LVC Operating System</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Submit Idea
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/ci/submit"><Button variant="outline" size="sm"><Plus className="w-3.5 h-3.5 mr-1" /> Submit</Button></Link>
        <Link to="/ci/queue"><Button variant="outline" size="sm"><List className="w-3.5 h-3.5 mr-1" /> Queue</Button></Link>
        <Link to="/ci/my-ideas"><Button variant="outline" size="sm"><User className="w-3.5 h-3.5 mr-1" /> My Ideas</Button></Link>
        <Link to="/ci/review-board"><Button variant="outline" size="sm"><KanbanSquare className="w-3.5 h-3.5 mr-1" /> Review Board</Button></Link>
        <Link to="/ci/implemented"><Button variant="outline" size="sm"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Implemented</Button></Link>
        <Link to="/ci/executive"><Button variant="outline" size="sm"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Executive</Button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="New Ideas" value={countByStatus('New')} icon={Lightbulb} color="text-blue-500" />
        <StatCard label="Needs Review" value={countByStatus('Needs Review')} icon={AlertTriangle} color="text-yellow-500" />
        <StatCard label="Approved" value={countByStatus('Approved')} icon={CheckCircle2} color="text-green-500" />
        <StatCard label="In Development" value={countByStatus('In Development')} icon={Sparkles} color="text-purple-500" />
        <StatCard label="Testing" value={countByStatus('Testing')} icon={AlertTriangle} color="text-indigo-500" />
        <StatCard label="Implemented This Month" value={implementedThisMonth} icon={CheckCircle2} color="text-teal-500" />
        <StatCard label="Avg Days to Complete" value={avgDays} icon={Clock} color="text-blue-500" subtitle="days" />
        <StatCard label="Est. Time Saved" value={totalTimeSaved.toFixed(0)} icon={Clock} color="text-green-500" subtitle="hours" />
        <StatCard label="Est. Cost Savings" value={`$${totalCostSavings.toLocaleString()}`} icon={DollarSign} color="text-green-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No improvements submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((item) => {
                  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.New;
                  return (
                    <Link key={item.id} to="/ci/queue" className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/30 transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                      <span className="text-sm flex-1 min-w-0 truncate">{item.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{item.category}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{item.improvement_id}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Gamification items={items} compact />
      </div>

      <ImprovementFormDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />
    </div>
  );
}