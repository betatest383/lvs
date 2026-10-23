import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Search, Plus } from 'lucide-react';
import StatCard from '@/components/ci/StatCard';
import CorrectiveActionDialog from '@/components/audits/CorrectiveActionDialog';
import { CORRECTIVE_STATUS_COLORS, PRIORITY_COLORS } from '@/lib/auditConstants';

export default function CorrectiveActions() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editAction, setEditAction] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setActions(await base44.entities.CorrectiveAction.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const filtered = actions.filter((a) => {
    if (search && !a.description?.toLowerCase().includes(search.toLowerCase()) && !a.assigned_employee?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  const open = actions.filter((a) => a.status === 'Open');
  const inProgress = actions.filter((a) => a.status === 'In Progress');
  const completed = actions.filter((a) => a.status === 'Completed' || a.status === 'Verified');
  const overdue = actions.filter((a) => a.status !== 'Completed' && a.status !== 'Verified' && a.due_date && a.due_date < today);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-accent" /> Corrective Actions
          </h1>
          <p className="text-muted-foreground text-sm">Track and manage corrective actions from audits</p>
        </div>
        <button onClick={() => { setEditAction(null); setCreateOpen(true); }} className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/90">
          <Plus className="w-4 h-4" /> New Action
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Open" value={open.length} icon={AlertTriangle} color="text-blue-500" />
        <StatCard label="In Progress" value={inProgress.length} icon={AlertTriangle} color="text-yellow-500" />
        <StatCard label="Completed" value={completed.length} icon={AlertTriangle} color="text-green-500" />
        <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} color="text-red-500" />
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {['Open', 'In Progress', 'Completed', 'Overdue', 'Verified'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No corrective actions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium hidden md:table-cell">Assigned To</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium hidden sm:table-cell">Due</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const sc = CORRECTIVE_STATUS_COLORS[a.status] || CORRECTIVE_STATUS_COLORS.Open;
                    const pc = PRIORITY_COLORS[a.priority] || PRIORITY_COLORS.Medium;
                    const isOverdue = a.status !== 'Completed' && a.status !== 'Verified' && a.due_date && a.due_date < today;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => { setEditAction(a); setCreateOpen(true); }}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium line-clamp-1">{a.description}</p>
                          <p className="text-xs text-muted-foreground">{a.audit_number}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{a.assigned_employee}</td>
                        <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded-full text-xs ${pc.bg} ${pc.text}`}>{a.priority}</span></td>
                        <td className={`px-4 py-2.5 hidden sm:table-cell ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{a.due_date || '—'}</td>
                        <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded-full text-xs ${sc.bg} ${sc.text}`}>{a.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CorrectiveActionDialog open={createOpen} onClose={() => setCreateOpen(false)} action={editAction} onSaved={load} />
    </div>
  );
}