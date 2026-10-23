import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import RoleRegistryFormDialog from '@/components/lvcos/RoleRegistryFormDialog';
import { DEPARTMENTS, PERMISSION_LEVEL_COLORS, STATUS_COLORS } from '@/lib/roleRegistryConstants';

export default function RoleRegistryPage() {
  const [roles, setRoles] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.RoleRegistry.list('-sort_order', 500);
      setRoles(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.RoleRegistry.update(editing.id, data);
      toast.success('Role updated');
    } else {
      await base44.entities.RoleRegistry.create(data);
      toast.success('Role created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (role) => {
    if (!confirm(`Delete "${role.role_name}"?`)) return;
    await base44.entities.RoleRegistry.delete(role.id);
    toast.success('Role deleted');
    load();
  };

  const filtered = roles.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      const matches = r.role_name?.toLowerCase().includes(q) || r.role_id?.toLowerCase().includes(q) || r.department?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (deptFilter && r.department !== deptFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Role Registry</h1>
          <p className="text-muted-foreground text-sm">Master database for every company role</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Role
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={deptFilter} onValueChange={v => setDeptFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {['Active', 'Draft', 'Planned', 'Retired'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} role{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No roles found. Click "New Role" to create one.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Role ID</th>
                <th className="px-3 py-2 font-medium">Role Name</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Department</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Reports To</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Permission</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/roles/detail/${r.id}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.role_id || '—'}</td>
                  <td className="px-3 py-2 font-medium">{r.role_name}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{r.department || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{r.reports_to || '—'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {r.permission_level && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${PERMISSION_LEVEL_COLORS[r.permission_level] || ''}`}>{r.permission_level}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
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

      <RoleRegistryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
        allRoles={roles}
      />
    </div>
  );
}