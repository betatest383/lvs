import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import PolicyFormDialog from '@/components/lvcos/PolicyFormDialog';
import {
  POLICY_TYPES, POLICY_STATUS_COLORS, ENFORCEMENT_LEVEL_COLORS
} from '@/lib/policyRegistryConstants';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';
import { format } from 'date-fns';

export default function PolicyRegistryPage() {
  const [policies, setPolicies] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [enforcementFilter, setEnforcementFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.PolicyRegistry.list('-created_date', 500);
      setPolicies(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.PolicyRegistry.update(editing.id, data);
      toast.success('Policy updated');
    } else {
      await base44.entities.PolicyRegistry.create(data);
      toast.success('Policy created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (policy) => {
    if (!confirm(`Delete "${policy.policy_name}"?`)) return;
    await base44.entities.PolicyRegistry.delete(policy.id);
    toast.success('Policy deleted');
    load();
  };

  const filtered = policies.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      const matches = p.policy_name?.toLowerCase().includes(q) || p.policy_id?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (typeFilter && p.policy_type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (enforcementFilter && p.enforcement_level !== enforcementFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policy Registry</h1>
          <p className="text-muted-foreground text-sm">Master database for all company policies</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Policy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Types</SelectItem>
            {POLICY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {['Draft', 'Active', 'Under Review', 'Retired'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={enforcementFilter} onValueChange={v => setEnforcementFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Levels</SelectItem>
            {['Critical', 'High', 'Medium', 'Low'].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search policies..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} polic{filtered.length !== 1 ? 'ies' : 'y'}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">No policies found. Click "New Policy" to create one.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Policy ID</th>
                <th className="px-3 py-2 font-medium">Policy Name</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Type</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Department</th>
                <th className="px-3 py-2 font-medium">Enforcement</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Review Date</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/lvcos/policies/detail/${p.id}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{p.policy_id}</td>
                  <td className="px-3 py-2 font-medium">{p.policy_name}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.policy_type || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{p.department || '—'}</td>
                  <td className="px-3 py-2">
                    {p.enforcement_level && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[p.enforcement_level]}`}>{p.enforcement_level}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.review_date ? format(new Date(p.review_date), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-3 py-2">
                    {p.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${POLICY_STATUS_COLORS[p.status]}`}>{p.status}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PolicyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}