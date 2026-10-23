import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeFormDialog from '@/components/lvcos/EmployeeFormDialog';
import { EMPLOYMENT_STATUS_COLORS, EMPLOYMENT_TYPE_COLORS, EMPLOYMENT_STATUS_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from '@/lib/employeeRegistryConstants';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

export default function EmployeeRegistryPage() {
  const [employees, setEmployees] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try { setEmployees(await base44.entities.EmployeeRegistry.list('-created_date', 500)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.EmployeeRegistry.update(editing.id, data);
      toast.success('Employee updated');
    } else {
      await base44.entities.EmployeeRegistry.create(data);
      toast.success('Employee created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (emp) => {
    if (!confirm(`Delete ${emp.first_name} ${emp.last_name}?`)) return;
    await base44.entities.EmployeeRegistry.delete(emp.id);
    toast.success('Employee deleted');
    load();
  };

  const filtered = employees.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const matches = `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_id?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.primary_role?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (deptFilter && e.department !== deptFilter) return false;
    if (statusFilter && e.employment_status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Registry</h1>
          <p className="text-muted-foreground text-sm">Master employee database</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Employee
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={deptFilter} onValueChange={v => setDeptFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Depts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {EMPLOYMENT_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">No employees found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Emp ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Department</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Role</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/lvcos/employees/detail/${e.id}`)}>
                  <td className="px-3 py-2 font-mono text-xs">{e.employee_id}</td>
                  <td className="px-3 py-2 font-medium">{e.first_name} {e.last_name}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.department || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{e.primary_role || '—'}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {e.employment_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_TYPE_COLORS[e.employment_type]}`}>{e.employment_type}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {e.employment_status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_COLORS[e.employment_status]}`}>{e.employment_status}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={ev => { ev.stopPropagation(); handleDelete(e); }} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmployeeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing || {}} onSave={handleSave} />
    </div>
  );
}