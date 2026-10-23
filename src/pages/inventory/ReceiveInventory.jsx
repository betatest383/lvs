import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReceiveInventory() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    equipment_master_id: '',
    quantity: 1,
    vendor: '',
    purchase_order: '',
    unit_cost: '',
    warehouse_location: '',
    notes: ''
  });

  useEffect(() => {
    base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500)
      .then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectedItem = items.find(i => i.id === form.equipment_master_id);

  const submit = async () => {
    if (!form.equipment_master_id) { toast({ title: 'Error', description: 'Select an equipment item', variant: 'destructive' }); return; }
    if (!form.quantity || form.quantity <= 0) { toast({ title: 'Error', description: 'Enter a valid quantity', variant: 'destructive' }); return; }
    setSubmitting(true);
    setSuccess(null);
    try {
      const res = await base44.functions.invoke('processInventoryTransaction', {
        transaction_type: 'receive_purchase',
        equipment_master_id: form.equipment_master_id,
        quantity: Number(form.quantity),
        unit_cost: Number(form.unit_cost) || 0,
        vendor: form.vendor,
        purchase_order: form.purchase_order,
        warehouse_location: form.warehouse_location,
        notes: form.notes
      });
      if (res.data?.error) { toast({ title: 'Error', description: res.data.error, variant: 'destructive' }); }
      else {
        toast({ title: 'Success', description: `Received ${form.quantity} units of ${selectedItem?.item_name}` });
        setSuccess(res.data);
        setForm({ equipment_master_id: '', quantity: 1, vendor: '', purchase_order: '', unit_cost: '', warehouse_location: '', notes: '' });
      }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-green-600" /> Receive Inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Equipment Item *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.equipment_master_id} onChange={e => setForm(f => ({ ...f, equipment_master_id: e.target.value }))}>
              <option value="">Select equipment...</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.equipment_id || ''} — {i.item_name} (Avail: {i.quantity_available || 0})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Vendor</Label>
              <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Purchase Order #</Label>
              <Input value={form.purchase_order} onChange={e => setForm(f => ({ ...f, purchase_order: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Warehouse Location</Label>
            <Input value={form.warehouse_location} onChange={e => setForm(f => ({ ...f, warehouse_location: e.target.value }))} className="mt-1" placeholder="e.g. Main Warehouse, Shelf A-3" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          {form.unit_cost && form.quantity && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              Total Cost: <span className="font-bold">${(Number(form.unit_cost) * Number(form.quantity)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <Button onClick={submit} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 text-white">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            Receive Inventory
          </Button>
        </CardContent>
      </Card>

      {success && (
        <Card className="border-green-300">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-green-700">Transaction {success.transaction_id} completed</p>
              <p className="text-muted-foreground">Available: {success.master_before?.available} → {success.master_after?.available}</p>
              <p className="text-muted-foreground">Owned: {success.master_before?.owned} → {success.master_after?.owned}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}