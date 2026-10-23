import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import CertificationFormDialog from '@/components/lvcos/CertificationFormDialog';
import { CERTIFICATION_TYPES, CERTIFICATION_STATUS_COLORS, CERTIFICATION_TYPE_COLORS } from '@/lib/certificationRegistryConstants';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';

export default function CertificationRegistryPage() {
  const [certifications, setCertifications] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.CertificationRegistry.list('-created_date', 500);
      setCertifications(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.CertificationRegistry.update(editing.id, data);
      toast.success('Certification updated');
    } else {
      await base44.entities.CertificationRegistry.create(data);
      toast.success('Certification created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (cert) => {
    if (!confirm(`Delete "${cert.certification_name}"?`)) return;
    await base44.entities.CertificationRegistry.delete(cert.id);
    toast.success('Certification deleted');
    load();
  };

  const filtered = certifications.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const matches = c.certification_name?.toLowerCase().includes(q) || c.certification_id?.toLowerCase().includes(q) || c.issuing_organization?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (typeFilter && c.certification_type !== typeFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certification Registry</h1>
          <p className="text-muted-foreground text-sm">Master database for all certifications and credentials</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Certification
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Types</SelectItem>
            {CERTIFICATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {['Draft', 'Active', 'Under Review', 'Retired'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search certifications..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} certification{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">No certifications found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Cert ID</th>
                <th className="px-3 py-2 font-medium">Certification Name</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Type</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Issuing Org</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Renewal</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/lvcos/certifications/detail/${c.id}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{c.certification_id}</td>
                  <td className="px-3 py-2 font-medium">{c.certification_name}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {c.certification_type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_TYPE_COLORS[c.certification_type] || ''}`}>{c.certification_type}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{c.issuing_organization || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{c.renewal_required ? c.renewal_frequency || 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">
                    {c.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${CERTIFICATION_STATUS_COLORS[c.status]}`}>{c.status}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
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

      <CertificationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}