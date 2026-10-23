import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeCertificationFormDialog from '@/components/lvcos/EmployeeCertificationFormDialog';
import { EMPLOYEE_CERT_STATUS_COLORS } from '@/lib/certificationRegistryConstants';

export default function EmployeeCertifications() {
  const [employeeCerts, setEmployeeCerts] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.EmployeeCertification.list('-created_date', 500);
      setEmployeeCerts(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.EmployeeCertification.update(editing.id, data);
      toast.success('Employee certification updated');
    } else {
      await base44.entities.EmployeeCertification.create(data);
      toast.success('Certification assigned');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (emp) => {
    if (!confirm(`Delete certification for ${emp.employee_name}?`)) return;
    await base44.entities.EmployeeCertification.delete(emp.id);
    toast.success('Deleted');
    load();
  };

  const filtered = employeeCerts.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const matches = e.employee_name?.toLowerCase().includes(q) || e.certification_name?.toLowerCase().includes(q) || e.employee_email?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employee Certifications</h1>
          <p className="text-muted-foreground text-sm">Track certification assignments, status, and documents</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> Assign Certification
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {['Active', 'Expired', 'Expiring Soon', 'Pending', 'Suspended', 'Not Required'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search employees or certifications..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">No employee certifications found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Certification</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Issue Date</th>
                <th className="px-3 py-2 font-medium">Expiration</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Doc</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr
                  key={e.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => { setEditing(e); setDialogOpen(true); }}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">{e.employee_name}</p>
                    {e.role && <p className="text-xs text-muted-foreground">{e.role}</p>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.certification_name}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYEE_CERT_STATUS_COLORS[e.status] || 'bg-muted'}`}>{e.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{e.issue_date || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.expiration_date || '—'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {e.document_url ? <FileCheck className="w-4 h-4 text-green-600" /> : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
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

      <EmployeeCertificationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}