import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { List, Search } from 'lucide-react';
import { CATEGORIES, PRIORITIES, STATUSES, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/improvementConstants';
import ImprovementFormDialog from '@/components/ci/ImprovementFormDialog';

export default function ImprovementQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [priFilter, setPriFilter] = useState('all');
  const [editItem, setEditItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setItems(await base44.entities.ImprovementRequest.list('-created_date', 500)); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = items.filter((i) => {
    if (search && !i.title?.toLowerCase().includes(search.toLowerCase()) && !i.improvement_id?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (catFilter !== 'all' && i.category !== catFilter) return false;
    if (priFilter !== 'all' && i.priority !== priFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <List className="w-6 h-6 text-accent" /> Improvement Queue
        </h1>
        <p className="text-muted-foreground text-sm">All improvement requests across the company</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priFilter} onValueChange={setPriFilter}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No improvements found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium hidden md:table-cell">Category</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium hidden sm:table-cell">Submitted By</th>
                    <th className="px-4 py-2 font-medium hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.New;
                    const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
                    return (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => { setEditItem(item); setEditOpen(true); }}>
                        <td className="px-4 py-2.5 font-mono text-xs">{item.improvement_id || '—'}</td>
                        <td className="px-4 py-2.5 font-medium max-w-xs truncate">{item.title}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{item.category || '—'}</td>
                        <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded-full text-xs ${pc.bg} ${pc.text}`}>{item.priority}</span></td>
                        <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded-full text-xs ${sc.bg} ${sc.text}`}>{item.status}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{item.submitted_by || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{item.date_submitted || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ImprovementFormDialog open={editOpen} onClose={() => setEditOpen(false)} improvement={editItem} onSaved={load} />
    </div>
  );
}