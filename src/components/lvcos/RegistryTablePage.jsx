import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import RegistryFormDialog from '@/components/lvcos/RegistryFormDialog';

export default function RegistryTablePage({ config }) {
  const {
    entityName, title, description, idField, searchFields,
    columns, filterConfig, formSections, saveLabel, newItemLabel, defaultData,
    manageFunction,
  } = config;

  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      let recs;
      if (manageFunction) {
        const response = await base44.functions.invoke(manageFunction, { action: 'list' });
        recs = response.data.records;
      } else {
        recs = await base44.entities[entityName].list('-created_date', 500);
      }
      setRecords(recs);
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Failed to load records';
      toast.error(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    try {
      if (manageFunction) {
        if (editing) {
          await base44.functions.invoke(manageFunction, { action: 'update', record_id: editing.id, data });
          toast.success(`${title} record updated`);
        } else {
          await base44.functions.invoke(manageFunction, { action: 'create', data });
          toast.success(`${title} record created`);
        }
      } else {
        if (editing) {
          await base44.entities[entityName].update(editing.id, data);
          toast.success(`${title} record updated`);
        } else {
          await base44.entities[entityName].create(data);
          toast.success(`${title} record created`);
        }
      }
      setEditing(null);
      load();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Save failed';
      toast.error(msg);
    }
  };

  const handleDelete = async (record) => {
    const label = record[idField] || record.title || 'record';
    const actionLabel = manageFunction ? 'Archive' : 'Delete';
    if (!confirm(`${actionLabel} "${label}"?`)) return;
    try {
      if (manageFunction) {
        await base44.functions.invoke(manageFunction, { action: 'retire', record_id: record.id });
        toast.success('Record archived');
      } else {
        await base44.entities[entityName].delete(record.id);
        toast.success('Record deleted');
      }
      load();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Action failed';
      toast.error(msg);
    }
  };

  const filtered = records.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      const matches = searchFields.some(f => r[f]?.toLowerCase().includes(q));
      if (!matches) return false;
    }
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (r[key] !== value) return false;
    }
    return true;
  });

  const renderCell = (col, r) => {
    const value = r[col.key];
    if (col.badge && value) {
      return (
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${col.badge[value] || 'bg-gray-100 text-gray-700'}`}>
          {value}
        </span>
      );
    }
    if (col.mono) return <span className="font-mono text-xs">{value || '—'}</span>;
    return value || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> {newItemLabel}
        </Button>
      </div>

      {filterConfig?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {filterConfig.map(f => (
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
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${title.toLowerCase()}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No records found. Click "{newItemLabel}" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-medium ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.hideOnDesktop ? 'hidden lg:table-cell' : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
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
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.hideOnDesktop ? 'hidden lg:table-cell' : ''} ${!col.mono && !col.badge ? 'text-muted-foreground' : ''}`}
                    >
                      {renderCell(col, r)}
                    </td>
                  ))}
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

      <RegistryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit ${title}` : newItemLabel}
        initialData={editing || defaultData || {}}
        onSave={handleSave}
        sections={formSections}
        saveLabel={saveLabel}
      />
    </div>
  );
}