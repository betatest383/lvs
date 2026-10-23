import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import IdStandardFormDialog from '@/components/lvcos/IdStandardFormDialog';

export default function IdStandardPage() {
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.IdStandard.list('-created_date', 200);
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.IdStandard.update(editing.id, data);
      toast.success('ID Standard updated');
    } else {
      await base44.entities.IdStandard.create(data);
      toast.success('ID Standard created');
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (record) => {
    if (!confirm(`Delete prefix "${record.prefix}" (${record.department})?`)) return;
    await base44.entities.IdStandard.delete(record.id);
    toast.success('ID Standard deleted');
    load();
  };

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.prefix?.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LVC OS ID Standard</h1>
          <p className="text-muted-foreground text-sm">
            Foundation mapping of ID prefixes to departments. Every LVC OS record follows this standard.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Prefix
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by prefix or department..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} prefix{filtered.length !== 1 ? 'es' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No prefixes found. Click "New Prefix" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Prefix</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">ID Pattern</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Description</th>
                <th className="px-3 py-2 font-medium text-center">Next #</th>
                <th className="px-3 py-2 font-medium text-center">Active</th>
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
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-mono font-bold">
                      {r.prefix}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.department}</td>
                  <td className="px-3 py-2 hidden md:table-cell font-mono text-xs text-muted-foreground">{r.id_pattern || `${r.prefix}-101`}</td>
                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">{r.description || '—'}</td>
                  <td className="px-3 py-2 text-center font-mono text-xs">{r.next_sequence ?? r.sequence_start ?? 1}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${r.is_active !== false ? 'bg-green-500' : 'bg-gray-300'}`} />
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

      <IdStandardFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Edit ID Standard' : 'New ID Standard'}
        initialData={editing || {}}
        onSave={handleSave}
      />
    </div>
  );
}