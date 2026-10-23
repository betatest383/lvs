import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Pencil, Package, UserCheck, DollarSign, AlertTriangle, ArrowDownToLine, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EquipmentMasterFormDialog from '@/components/equipment/EquipmentMasterFormDialog';
import AssignEquipmentDialog from '@/components/equipment/AssignEquipmentDialog';
export default function EquipmentMaster() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [duplicating, setDuplicating] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [assignItem, setAssignItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ['item_name', 'equipment_id', 'category', 'unit']
      .some(f => item[f] && String(item[f]).toLowerCase().includes(q));
  });

  const totalCatalogValue = items.reduce((s, i) => s + (i.replacement_cost_per_unit || 0) * (i.quantity_owned || 0), 0);
  const totalAvailable = items.reduce((s, i) => s + (i.quantity_available || 0), 0);
  const totalAssigned = items.reduce((s, i) => s + (i.quantity_assigned || 0), 0);
  const lowStock = items.filter(i => (i.quantity_available || 0) <= 0 && (i.quantity_owned || 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Equipment Master</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {items.length} equipment types</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => navigate('/inventory/receive')} className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100">
            <ArrowDownToLine className="w-4 h-4" /> Receive Inventory
          </Button>
          <Button onClick={() => { setEditing(null); setDuplicating(null); setFormOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
            Add Equipment
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><Package className="w-4 h-4" /></div>
          <div><p className="text-xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">Equipment Types</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-100 text-green-600 flex items-center justify-center"><DollarSign className="w-4 h-4" /></div>
          <div><p className="text-xl font-bold">${totalCatalogValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">Total Catalog Value</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center"><Package className="w-4 h-4" /></div>
          <div><p className="text-xl font-bold">{totalAvailable}</p><p className="text-xs text-muted-foreground">Units Available</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><UserCheck className="w-4 h-4" /></div>
          <div><p className="text-xl font-bold">{totalAssigned}</p><p className="text-xs text-muted-foreground">Units Assigned</p></div>
        </CardContent></Card>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">{lowStock.length} equipment type(s) have zero available stock.</p>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name, ID, category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No equipment in master list. Click "Add Equipment" to get started.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
            <span className="col-span-3">Equipment</span>
            <span className="col-span-1 text-center">Unit</span>
            <span className="col-span-1 text-center">Owned</span>
            <span className="col-span-1 text-center">Avail</span>
            <span className="col-span-1 text-center">Assign</span>
            <span className="col-span-1 text-center">Repair</span>
            <span className="col-span-1 text-center">Retired</span>
            <span className="col-span-2 text-right">Total Value</span>
            <span className="col-span-1 text-right">Actions</span>
          </div>
          {filtered.map(item => {
            const totalValue = (item.replacement_cost_per_unit || 0) * (item.quantity_owned || 0);
            return (
              <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t bg-card text-sm items-center hover:bg-muted/30">
                <div className="col-span-12 md:col-span-3 flex items-center gap-2">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.item_name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.item_name}</p>
                    <div className="flex gap-1.5">
                      {item.equipment_id && <span className="text-xs text-muted-foreground">{item.equipment_id}</span>}
                      {item.category && <span className="text-xs text-muted-foreground">· {item.category}</span>}
                    </div>
                  </div>
                </div>
                <div className="col-span-3 md:col-span-1 text-center text-muted-foreground">{item.unit || 'ea'}</div>
                <div className="col-span-2 md:col-span-1 text-center font-medium">{item.quantity_owned || 0}</div>
                <div className="col-span-2 md:col-span-1 text-center"><span className={`font-medium ${(item.quantity_available || 0) <= 0 ? 'text-red-600' : 'text-green-600'}`}>{item.quantity_available || 0}</span></div>
                <div className="col-span-2 md:col-span-1 text-center text-blue-600">{item.quantity_assigned || 0}</div>
                <div className="col-span-2 md:col-span-1 text-center text-orange-600">{item.quantity_out_for_repair || 0}</div>
                <div className="col-span-2 md:col-span-1 text-center text-gray-500">{item.quantity_retired || 0}</div>
                <div className="col-span-6 md:col-span-2 text-right font-semibold">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                <div className="col-span-3 md:col-span-1 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetailItem(item)} disabled={(item.quantity_available || 0) <= 0} title="Assign"><UserCheck className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(item); setDuplicating(null); setFormOpen(true); }} title="Edit"><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditing(null); setDuplicating(item); setFormOpen(true); }} title="Duplicate Item"><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EquipmentMasterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editing || (duplicating ? { ...duplicating, id: null, equipment_id: '', photo_url: duplicating.photo_url || '' } : null)}
        isDuplicate={!!duplicating}
        onSaved={() => { setEditing(null); setDuplicating(null); load(); }}
      />
      <AssignEquipmentDialog open={!!assignItem} onOpenChange={v => !v && setAssignItem(null)} equipment={assignItem} onAssigned={() => load()} />

      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={v => !v && setDetailItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detailItem?.item_name}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              {detailItem.photo_url && <img src={detailItem.photo_url} alt={detailItem.item_name} className="w-full h-40 rounded-lg object-cover" />}
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Owned</p><p className="font-bold">{detailItem.quantity_owned || 0}</p></div>
                <div className="p-2 bg-green-50 rounded-lg"><p className="text-xs text-muted-foreground">Available</p><p className="font-bold text-green-600">{detailItem.quantity_available || 0}</p></div>
                <div className="p-2 bg-blue-50 rounded-lg"><p className="text-xs text-muted-foreground">Assigned</p><p className="font-bold text-blue-600">{detailItem.quantity_assigned || 0}</p></div>
                <div className="p-2 bg-orange-50 rounded-lg"><p className="text-xs text-muted-foreground">Repair</p><p className="font-bold text-orange-600">{detailItem.quantity_out_for_repair || 0}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailField label="Equipment ID" value={detailItem.equipment_id} />
                <DetailField label="Category" value={detailItem.category} />
                <DetailField label="Unit" value={detailItem.unit} />
                <DetailField label="Cost Per Unit" value={detailItem.replacement_cost_per_unit ? `$${detailItem.replacement_cost_per_unit.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : null} />
                <DetailField label="Total Value" value={`$${((detailItem.replacement_cost_per_unit || 0) * (detailItem.quantity_owned || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                <DetailField label="Retired" value={detailItem.quantity_retired || 0} />
              </div>
              {detailItem.description && <p className="text-sm text-muted-foreground">{detailItem.description}</p>}
              {detailItem.notes && <p className="text-sm text-muted-foreground">Notes: {detailItem.notes}</p>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setAssignItem(detailItem); setDetailItem(null); }} disabled={(detailItem.quantity_available || 0) <= 0}>Assign</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(detailItem); setDetailItem(null); setFormOpen(true); }}>Edit</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}