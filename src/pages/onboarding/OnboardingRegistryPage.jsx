import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingFormDialog from '@/components/onboarding/OnboardingFormDialog';
import { ONBOARDING_STATUSES, ONBOARDING_STATUS_COLORS } from '@/lib/onboardingConstants';

export default function OnboardingRegistryPage() {
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.EmployeeOnboarding.list('-created_date', 500);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.EmployeeOnboarding.update(editing.id, data);
      toast.success('Onboarding updated');
      setEditing(null);
      load();
    } else {
      const created = await base44.entities.EmployeeOnboarding.create(data);
      toast.success('Onboarding created');
      navigate(`/lvcos/onboarding/detail/${created.id}`);
    }
  };

  const handleDelete = async (rec) => {
    if (!confirm(`Delete onboarding for "${rec.employee_name}"?`)) return;
    await base44.entities.EmployeeOnboarding.delete(rec.id);
    toast.success('Onboarding deleted');
    load();
  };

  const filtered = records.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.employee_name?.toLowerCase().includes(q) && !r.onboarding_id?.toLowerCase().includes(q) && !r.primary_role?.toLowerCase().includes(q)) return false;
    }
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding Registry</h1>
          <p className="text-muted-foreground text-sm">All employee onboarding records</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Onboarding
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ID, role..." className="pl-9" />
        </div>
        <Select value={statusFilter || '__all'} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {ONBOARDING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No onboarding records found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/lvcos/onboarding/detail/${r.id}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent">{r.employee_name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.employee_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.onboarding_id} • {r.primary_role || 'No role'} • {r.department || 'No dept'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold">{r.overall_completion_pct || 0}%</p>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${r.overall_completion_pct || 0}%` }} />
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ONBOARDING_STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                  className="text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <OnboardingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing}
        onSave={handleSave}
      />
    </div>
  );
}