import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import SopFormDialog from '@/components/lvcos/SopFormDialog';

const TYPE_COLORS = {
  Process: 'bg-indigo-100 text-indigo-700',
  Policy: 'bg-purple-100 text-purple-700',
  Company: 'bg-cyan-100 text-cyan-700',
  Form: 'bg-blue-100 text-blue-700',
  Checklist: 'bg-teal-100 text-teal-700',
};

const STATUS_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  Draft: 'bg-gray-100 text-gray-700',
  'In Review': 'bg-amber-100 text-amber-700',
  Approved: 'bg-green-100 text-green-700',
  Archived: 'bg-red-100 text-red-700',
};

const WORKFLOW_COLORS = {
  Planned: 'bg-gray-100 text-gray-700',
  'In Development': 'bg-blue-100 text-blue-700',
  Testing: 'bg-amber-100 text-amber-700',
  Live: 'bg-green-100 text-green-700',
};

const ROLE_OPTIONS = [
  'Warehouse Associate', 'Warehouse Manager', 'Lead Technician', 'Apprentice',
  'CSR', 'Dispatcher', 'Sales Technician', 'Operations Manager',
  'Office Manager', 'Owner', 'Customer',
];

const FILTER_CONFIG = [
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'subject', label: 'Subject', type: 'text' },
  { key: 'document', label: 'Document', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Draft', 'In Review', 'Approved', 'Archived'] },
  { key: 'workflow_status', label: 'Workflow Status', type: 'select', options: ['Planned', 'In Development', 'Testing', 'Live'] },
  { key: 'applies_to', label: 'Role', type: 'select', options: ROLE_OPTIONS },
];

export default function SopRegistryPage() {
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('manageSop', { action: 'list' });
      setRecords(response.data.records);
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Failed to load SOPs';
      toast.error(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    try {
      if (editing) {
        await base44.functions.invoke('manageSop', { action: 'update', record_id: editing.id, data });
        toast.success('SOP updated');
      } else {
        await base44.functions.invoke('manageSop', { action: 'create', data });
        toast.success('SOP created');
      }
      setEditing(null);
      load();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Save failed';
      toast.error(msg);
    }
  };

  const handleDelete = async (record) => {
    if (!confirm(`Archive "${record.sop_id} — ${record.title}"?`)) return;
    try {
      await base44.functions.invoke('manageSop', { action: 'retire', record_id: record.id });
      toast.success('SOP archived');
      load();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Archive failed';
      toast.error(msg);
    }
  };

  const filtered = records.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      const matches =
        r.sop_id?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.subject?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === 'applies_to') {
        if (!Array.isArray(r.applies_to) || !r.applies_to.includes(value)) return false;
      } else {
        if (r[key] !== value) return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SOP Registry</h1>
          <p className="text-muted-foreground text-sm">Master database for all SOPs, processes, and policies</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New SOP
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by SOP ID, title, keyword, or department..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {FILTER_CONFIG.map(f => (
          <div key={f.key}>
            {f.type === 'text' ? (
              <Input
                placeholder={f.label}
                value={filters[f.key] || ''}
                onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="h-8 text-sm"
              />
            ) : (
              <Select
                value={filters[f.key] || ''}
                onValueChange={v => setFilters(prev => ({ ...prev, [f.key]: v === '__all' ? '' : v }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={f.label} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All {f.label}</SelectItem>
                  {f.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No SOPs found. Click "New SOP" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">SOP ID</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Department</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Owner</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Version</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Workflow</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => { setEditing(r); setDialogOpen(true); }}
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.sop_id}</td>
                  <td className="px-3 py-2 font-medium">{r.title}</td>
                  <td className="px-3 py-2">
                    {r.type && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[r.type] || 'bg-gray-100 text-gray-700'}`}>{r.type}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`}>{r.status}</span>}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{r.department || '—'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">{r.process_owner || '—'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">{r.current_version || '—'}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {r.workflow_status && <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${WORKFLOW_COLORS[r.workflow_status] || 'bg-gray-100 text-gray-700'}`}>{r.workflow_status}</span>}
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

      <SopFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit SOP' : 'New SOP'}
        initialData={editing || { status: 'Planned' }}
        onSave={handleSave}
      />
    </div>
  );
}