import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, Package, Upload } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  camera: 'Camera', brush: 'Brush', ladder: 'Ladder', vacuum: 'Vacuum',
  hand_tool: 'Hand Tool', safety: 'Safety', measurement: 'Measurement', vehicle: 'Vehicle', other: 'Other'
};

const EMPTY = { item_name: '', category: 'other', description: '', quantity: '', default_value: '', sku: '', supplier: '' };

export default function EquipmentCatalogManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = { current: null };

  useEffect(() => {
    base44.entities.EquipmentCatalog.list('-created_date', 200)
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const openAdd = () => { setEditItem(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ item_name: item.item_name, category: item.category || 'other', description: item.description || '', quantity: item.quantity ?? '', default_value: item.default_value ?? '', sku: item.sku || '', supplier: item.supplier || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }
    setSaving(true);
    const data = { ...form, quantity: form.quantity !== '' ? parseFloat(form.quantity) : null, default_value: form.default_value !== '' ? parseFloat(form.default_value) : null };
    if (editItem) {
      const updated = await base44.entities.EquipmentCatalog.update(editItem.id, data);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Item updated');
    } else {
      const created = await base44.entities.EquipmentCatalog.create(data);
      setItems(prev => [created, ...prev]);
      toast.success('Item added to catalog');
    }
    setSaving(false);
    setDialogOpen(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.EquipmentCatalog.delete(id);
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteId(null);
    toast.success('Item removed');
  };

  const downloadTemplate = () => {
    const headers = ['item_name', 'category', 'quantity', 'default_value', 'sku', 'supplier', 'description'];
    const example = ['Example Tool', 'hand_tool', '5', '49.99', 'SKU-001', 'Supplier Name', 'Optional description'];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'equipment_catalog_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  item_name: { type: 'string' },
                  category: { type: 'string' },
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  default_value: { type: 'number' },
                  sku: { type: 'string' },
                  supplier: { type: 'string' }
                }
              }
            }
          }
        }
      });
      if (result.status !== 'success' || !result.output?.items?.length) {
        toast.error('Could not read items from file. Make sure it has an "item_name" column.');
        return;
      }
      const rows = result.output.items.filter(r => r.item_name);
      const created = await base44.entities.EquipmentCatalog.bulkCreate(
        rows.map(r => ({ ...r, is_active: true }))
      );
      setItems(prev => [...created, ...prev]);
      toast.success(`Imported ${created.length} item${created.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const filtered = items.filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()) || (i.category || '').includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input placeholder="Search catalog..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-8 text-sm" />
        <div className="flex gap-2 shrink-0">
          <input ref={el => fileInputRef.current = el} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={importing} />
          <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} disabled={importing}>
            {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Import Excel
          </Button>
          <Button size="sm" onClick={openAdd} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {items.length === 0 ? 'No items in the catalog yet. Add items using the button above.' : 'No items match your search.'}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Item Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Supplier</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(item => (
                <tr key={item.id} className="bg-card hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.item_name}</p>
                    {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{CATEGORY_LABELS[item.category] || item.category}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{item.supplier || '—'}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">{item.quantity != null ? item.quantity : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {item.default_value != null ? `$${parseFloat(item.default_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Edit Catalog Item' : 'Add Catalog Item'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Item Name *</Label>
              <Input className="mt-1" value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} placeholder="e.g. RIDGID SeeSnake Micro CA-25" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qty in Stock</Label>
                <Input className="mt-1" type="number" min="0" step="1" placeholder="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Default Value ($)</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" placeholder="0.00" value={form.default_value} onChange={e => setForm(p => ({ ...p, default_value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU / Part #</Label>
                <Input className="mt-1" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <Label>Supplier</Label>
                <Input className="mt-1" value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add to Catalog'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Import Equipment Catalog</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Download the CSV template to see the expected column format, then upload your filled-in file.</p>
          <div className="flex flex-col gap-3 pt-2">
            <Button variant="outline" onClick={() => { downloadTemplate(); }}>
              <Upload className="w-4 h-4 mr-2 rotate-180" /> Download Template
            </Button>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => { setImportDialogOpen(false); fileInputRef.current?.click(); }}>
              <Upload className="w-4 h-4 mr-2" /> Upload File
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Item?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This removes the item from the catalog. Existing assignments are not affected.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteId)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}