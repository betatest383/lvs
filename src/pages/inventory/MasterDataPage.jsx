import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import LinkedResourcesPanel from '@/components/resources/LinkedResourcesPanel';
import { RELATIONSHIP_BY_ENTITY } from '@/lib/resourceLinkConfig';

/**
 * Generic master data management page.
 * Renders a searchable list with add/edit/delete for any master entity.
 *
 * Props:
 * - entityName: SDK entity name
 * - title: page heading
 * - description: subtitle
 * - fields: array of { name, label, type ('text'|'textarea'|'select'), options?, required? }
 * - displayField: field to show in list (default 'name')
 * - codeField: optional code field
 * - filter: query filter for listing
 */
export default function MasterDataPage({
  entityName,
  title,
  description,
  fields = [],
  displayField = 'name',
  codeField,
  filter = {},
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const entity = base44.entities[entityName];

  const load = async () => {
    setLoading(true);
    try {
      const recs = await entity.filter(filter, 'sort_order', 500);
      setRecords(recs);
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityName, JSON.stringify(filter)]);

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r[displayField] || '').toLowerCase().includes(q)
      || (codeField && (r[codeField] || '').toLowerCase().includes(q));
  });

  const openAdd = () => {
    setEditing(null);
    setForm({});
    setDialogOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setForm({ ...record });
    setDialogOpen(true);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    // Validate required
    for (const f of fields) {
      if (f.required && !form[f.name]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const data = { ...form, is_active: form.is_active !== false };
      if (editing) {
        await entity.update(editing.id, data);
        toast.success('Updated successfully');
      } else {
        await entity.create(data);
        toast.success('Added successfully');
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (!confirm(`Delete "${record[displayField]}"?`)) return;
    try {
      await entity.delete(record.id);
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const generateCode = () => {
    if (!codeField) return;
    const prefix = entityName.substring(0, 3).toUpperCase();
    const num = String(records.length + 1).padStart(3, '0');
    update(codeField, `${prefix}-${num}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 max-w-sm" />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr className="text-left">
                {codeField && <th className="p-3 font-medium">Code</th>}
                <th className="p-3 font-medium">{displayField === 'name' ? 'Name' : displayField}</th>
                {fields.filter(f => f.name !== displayField && f.name !== codeField && f.type !== 'textarea').slice(0, 4).map(f => (
                  <th key={f.name} className="p-3 font-medium">{f.label}</th>
                ))}
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    No records found. Click "Add" to create one.
                  </td>
                </tr>
              ) : (
                filtered.map(record => (
                  <tr key={record.id} className="hover:bg-muted/30">
                    {codeField && <td className="p-3 font-mono text-xs">{record[codeField] || '—'}</td>}
                    <td className="p-3 font-medium">{record[displayField]}</td>
                    {fields.filter(f => f.name !== displayField && f.name !== codeField && f.type !== 'textarea').slice(0, 4).map(f => (
                      <td key={f.name} className="p-3 text-muted-foreground">{record[f.name] || '—'}</td>
                    ))}
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        record.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {record.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(record)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(record)} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} {title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs">
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    value={form[f.name] || ''}
                    onChange={e => update(f.name, e.target.value)}
                    rows={2}
                  />
                ) : f.type === 'select' ? (
                  <select
                    value={form[f.name] || ''}
                    onChange={e => update(f.name, e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select...</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={form[f.name] || ''}
                      onChange={e => update(f.name, e.target.value)}
                    />
                    {f.name === codeField && (
                      <Button type="button" variant="outline" size="sm" onClick={generateCode}>Gen</Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active !== false}
                onChange={e => update('is_active', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="is_active" className="text-xs cursor-pointer">Active</Label>
            </div>
          </div>
          {editing?.id && RELATIONSHIP_BY_ENTITY[entityName] && (
            <LinkedResourcesPanel entityType={entityName} entityId={editing.id} title="Product Resources" />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}