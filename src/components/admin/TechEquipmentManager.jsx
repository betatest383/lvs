import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, Plus, Pencil, Trash2, Loader2, AlertTriangle, CalendarIcon, FileSignature, HelpCircle } from 'lucide-react';
import EquipmentReceiptViewer from '@/components/shared/EquipmentReceiptViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

const EMPTY_ITEM = { item_name: '', description: '', serial_number: '', assigned_date: '', value: '', condition: 'good', notes: '', catalog_id: '', quantity: 1 };

const CONDITION_LABELS = { new: 'New', good: 'Good', fair: 'Fair', poor: 'Poor', lost: 'Lost', damaged: 'Damaged' };
const CONDITION_COLORS = {
  new: 'bg-green-100 text-green-700',
  good: 'bg-blue-100 text-blue-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-red-100 text-red-700',
  lost: 'bg-gray-100 text-gray-600',
  damaged: 'bg-orange-100 text-orange-700',
};

// Adjust catalog stock by delta (+1 restore, -1 deduct). No-op if no catalog_id or qty not set.
async function adjustStock(catalogId, delta, catalogList, setCatalog) {
  if (!catalogId) return;
  const cat = catalogList.find(c => c.id === catalogId);
  if (!cat || cat.quantity == null) return;
  const newQty = Math.max(0, (cat.quantity || 0) + delta);
  const updated = await base44.entities.EquipmentCatalog.update(catalogId, { quantity: newQty });
  setCatalog(prev => prev.map(c => c.id === catalogId ? updated : c));
}

export default function TechEquipmentManager({ technician }) {
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  // deleteId stores { id, catalog_id } for stock restore decision
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [removeType, setRemoveType] = useState('return');
  const [returnQuantity, setReturnQuantity] = useState('');

  useEffect(() => {
    if (!technician?.email) return;
    setLoading(true);
    Promise.all([
      base44.entities.TechEquipment.filter({ technician_email: technician.email }, '-assigned_date'),
      base44.entities.EquipmentCatalog.list('item_name', 200),
    ]).then(([eq, cat]) => { setItems(eq); setCatalog(cat); })
      .finally(() => setLoading(false));
  }, [technician?.email]);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_ITEM); setDialogOpen(true); };

  const handleCatalogSelect = (catalogId) => {
    if (!catalogId) { setForm(p => ({ ...p, catalog_id: '' })); return; }
    const cat = catalog.find(c => c.id === catalogId);
    if (cat) setForm(p => ({
      ...p,
      catalog_id: catalogId,
      item_name: cat.item_name,
      description: cat.description || p.description,
      value: cat.default_value != null ? cat.default_value : p.value,
    }));
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ item_name: item.item_name, description: item.description || '', serial_number: item.serial_number || '', assigned_date: item.assigned_date || '', value: item.value || '', condition: item.condition || 'good', notes: item.notes || '', catalog_id: item.catalog_id || '', quantity: item.quantity || 1 });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_name || !form.assigned_date) {
      toast.error('Item name and assigned date are required');
      return;
    }
    setSaving(true);
    const data = {
      ...form,
      value: form.value !== '' ? parseFloat(form.value) : null,
      quantity: form.quantity !== '' ? parseInt(form.quantity) : 1,
      technician_email: technician.email,
      technician_name: technician.full_name,
    };

    if (editItem) {
      const updated = await base44.entities.TechEquipment.update(editItem.id, data);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      if (form.catalog_id && form.catalog_id !== editItem.catalog_id) {
        await adjustStock(form.catalog_id, -1, catalog, setCatalog);
        if (editItem.catalog_id) await adjustStock(editItem.catalog_id, +1, catalog, setCatalog);
      }
      toast.success('Equipment updated');
      setSaving(false);
      setDialogOpen(false);
    } else {
      const created = await base44.entities.TechEquipment.create(data);
      setItems(prev => [created, ...prev]);
      const qty = parseInt(form.quantity) || 1;
      if (form.catalog_id) await adjustStock(form.catalog_id, -qty, catalog, setCatalog);
      setSaving(false);
      setDialogOpen(false);
      toast.success('Equipment assigned — technician will be prompted to sign on their device.');
    }
  };

  const confirmDelete = (item) => {
    setDeleteTarget(item);
    setRemoveType('return');
    setReturnQuantity(item.quantity?.toString() || '1');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.TechEquipment.delete(deleteTarget.id);
    setItems(prev => prev.filter(i => i.id !== deleteTarget.id));

    // Archive any receipts linked to this equipment record
    const receipts = await base44.entities.EquipmentReceipt.filter({ equipment_id: deleteTarget.id });
    const itemQty = deleteTarget.quantity || 1;
    const returnQty = removeType === 'return' ? (parseInt(returnQuantity) || itemQty) : 0;
    const lostQty = itemQty - returnQty;
    const archiveReason = removeType === 'return'
      ? (lostQty > 0 ? `${returnQty} returned, ${lostQty} lost/damaged` : 'Item returned to inventory')
      : 'Item lost or damaged';
    await Promise.all(receipts.map(r =>
      base44.entities.EquipmentReceipt.update(r.id, { is_archived: true, archive_reason: archiveReason })
    ));

    // Restore only the returned quantity to stock
    if (removeType === 'return' && deleteTarget.catalog_id && returnQty > 0) {
      await adjustStock(deleteTarget.catalog_id, +returnQty, catalog, setCatalog);
      toast.success(`Equipment removed — ${returnQty} unit${returnQty !== 1 ? 's' : ''} restored to stock`);
    } else {
      toast.success('Equipment removed — stock not restored');
    }
    setDeleteTarget(null);
    setReturnQuantity('');
  };

  const totalValue = items.reduce((sum, i) => sum + (i.value || 0) * (i.quantity || 1), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            Tools & Equipment — {technician.full_name}
          </h3>
          {items.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {items.length} item{items.length !== 1 ? 's' : ''} · Total value: ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
        <Button size="sm" onClick={openAdd} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
      </div>

      <Tabs defaultValue="equipment">
        <TabsList>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="receipts" className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" /> Signed Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="equipment" className="mt-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
              No equipment assigned yet. Click "Add Item" to get started.
            </div>
          ) : (
            <div className="divide-y border rounded-xl overflow-hidden">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.item_name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {item.quantity != null && item.quantity > 1 && <span className="text-xs font-medium text-foreground">Qty: {item.quantity}</span>}
                      {item.assigned_date && <span className="text-xs text-muted-foreground">Assigned: {item.assigned_date}</span>}
                      {item.serial_number && <span className="text-xs text-muted-foreground">S/N: {item.serial_number}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.condition && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_COLORS[item.condition] || ''}`}>
                        {CONDITION_LABELS[item.condition] || item.condition}
                      </span>
                    )}
                    {item.value != null && (
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          ${(parseFloat(item.value) * (item.quantity || 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {(item.quantity || 1) > 1 && (
                          <p className="text-xs text-muted-foreground">${parseFloat(item.value).toFixed(2)} ea.</p>
                        )}
                      </div>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => confirmDelete(item)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="receipts" className="mt-3">
          <EquipmentReceiptViewer technicianEmail={technician.email} adminView />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Equipment' : 'Assign Equipment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {catalog.length > 0 && (
              <div>
                <Label>Select from Catalog</Label>
                <Select value={form.catalog_id} onValueChange={handleCatalogSelect}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a catalog item (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Type manually —</SelectItem>
                    {catalog.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.item_name}{c.quantity != null ? ` (${c.quantity} in stock)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Item Name *</Label>
              <Input className="mt-1" value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} placeholder="e.g. RIDGID SeeSnake Camera" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Date Assigned *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-muted/30 transition-colors">
                      <span className={form.assigned_date ? 'text-foreground' : 'text-muted-foreground'}>
                        {form.assigned_date ? format(parseISO(form.assigned_date), 'MMM d, yyyy') : 'Pick a date'}
                      </span>
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.assigned_date ? parseISO(form.assigned_date) : undefined}
                      onSelect={date => setForm(p => ({ ...p, assigned_date: date ? format(date, 'yyyy-MM-dd') : '' }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Quantity</Label>
                <Input className="mt-1" type="number" min="1" step="1" placeholder="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Value ($)</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" placeholder="0.00" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Serial Number</Label>
                <Input className="mt-1" value={form.serial_number} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(p => ({ ...p, condition: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editItem ? 'Save Changes' : 'Assign Equipment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Dialog — with stock decision */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Remove Equipment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">How is this item being removed?</p>
          {deleteTarget?.catalog_id && (
            <div className="space-y-3 py-1">
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                <input type="radio" name="removeType" value="return" checked={removeType === 'return'} onChange={() => setRemoveType('return')} className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Returned to stock</p>
                  <p className="text-xs text-muted-foreground">Catalog quantity will be restored</p>
                </div>
              </label>
              {removeType === 'return' && deleteTarget.quantity > 1 && (
                <div className="ml-6 p-2.5 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" /> How many units are being returned?
                  </p>
                  <Input
                    type="number"
                    min="0"
                    max={deleteTarget.quantity}
                    value={returnQuantity}
                    onChange={e => setReturnQuantity(e.target.value)}
                    placeholder={deleteTarget.quantity?.toString()}
                    className="text-sm"
                  />
                  {parseInt(returnQuantity) < deleteTarget.quantity && (
                    <p className="text-xs text-blue-700">
                      {deleteTarget.quantity - parseInt(returnQuantity) || deleteTarget.quantity} unit{deleteTarget.quantity - parseInt(returnQuantity) !== 1 ? 's' : ''} will be marked as lost/damaged.
                    </p>
                  )}
                </div>
              )}
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                <input type="radio" name="removeType" value="lost" checked={removeType === 'lost'} onChange={() => setRemoveType('lost')} className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Lost or damaged — not returning</p>
                  <p className="text-xs text-muted-foreground">Catalog quantity will NOT be restored</p>
                </div>
              </label>
            </div>
          )}
          {!deleteTarget?.catalog_id && (
            <p className="text-sm text-muted-foreground py-1">This item has no catalog link — it will simply be removed.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}