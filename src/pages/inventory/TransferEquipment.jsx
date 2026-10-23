import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Repeat, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { TRANSFER_TYPES } from '@/lib/inventoryConstants';

export default function TransferEquipment() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ transfer_type: 'transfer_between_employees', equipment_master_id: '', quantity: 1, source_location: '', destination_location: '', notes: '' });

  useEffect(() => {
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.entities.EmployeeRegistry.filter({ employment_status: 'Active' }, 'first_name', 200),
      base44.entities.TruckProfile.filter({ status: 'Active' }, 'truck_number', 50)
    ]).then(([m, e, t]) => { setItems(m); setEmployees(e); setTrucks(t); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const isTruckTransfer = form.transfer_type === 'truck_restock' || form.transfer_type === 'truck_return' || form.transfer_type === 'transfer_between_trucks';
  const isEmployeeTransfer = form.transfer_type === 'transfer_between_employees';
  const sourceLabel = isEmployeeTransfer ? 'Source Employee' : isTruckTransfer ? 'Source Truck / Warehouse' : 'Source Warehouse';
  const destLabel = isEmployeeTransfer ? 'Destination Employee' : form.transfer_type === 'truck_restock' ? 'Destination Truck' : isTruckTransfer ? 'Destination Truck' : 'Destination Warehouse';

  const submit = async () => {
    if (!form.equipment_master_id) { toast({ title: 'Error', description: 'Select an equipment item', variant: 'destructive' }); return; }
    if (!form.source_location && form.transfer_type !== 'truck_restock') { toast({ title: 'Error', description: 'Enter source location', variant: 'destructive' }); return; }
    if (!form.destination_location) { toast({ title: 'Error', description: 'Enter destination', variant: 'destructive' }); return; }
    setSubmitting(true); setSuccess(null);
    try {
      const res = await base44.functions.invoke('processInventoryTransaction', {
        transaction_type: form.transfer_type,
        equipment_master_id: form.equipment_master_id,
        quantity: Number(form.quantity),
        source_location: form.source_location,
        destination_location: form.destination_location,
        truck: form.transfer_type === 'truck_restock' ? form.destination_location : form.transfer_type === 'truck_return' ? form.source_location : '',
        notes: form.notes
      });
      if (res.data?.error) { toast({ title: 'Error', description: res.data.error, variant: 'destructive' }); }
      else {
        toast({ title: 'Success', description: 'Transfer completed' });
        setSuccess(res.data);
        setForm(f => ({ ...f, source_location: '', destination_location: '', notes: '' }));
      }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Repeat className="w-5 h-5 text-indigo-600" /> Transfer Equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Transfer Type *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.transfer_type} onChange={e => setForm(f => ({ ...f, transfer_type: e.target.value, source_location: '', destination_location: '' }))}>
              {TRANSFER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Equipment Item *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.equipment_master_id} onChange={e => setForm(f => ({ ...f, equipment_master_id: e.target.value }))}>
              <option value="">Select equipment...</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.equipment_id || ''} — {i.item_name}</option>)}
            </select>
          </div>
          <div>
            <Label>Quantity *</Label>
            <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
          </div>
          {form.transfer_type !== 'truck_restock' && (
            <div>
              <Label>{sourceLabel} *</Label>
              {isEmployeeTransfer ? (
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.source_location} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))}>
                  <option value="">Select source employee...</option>
                  {employees.map(e => <option key={e.id} value={`${e.first_name} ${e.last_name}`}>{e.first_name} {e.last_name}</option>)}
                </select>
              ) : isTruckTransfer ? (
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.source_location} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))}>
                  <option value="">Select source...</option>
                  <option value="Warehouse">Warehouse</option>
                  {trucks.map(t => <option key={t.id} value={t.truck_number || t.truck_id}>{t.truck_number || t.truck_id}</option>)}
                </select>
              ) : (
                <Input value={form.source_location} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))} className="mt-1" placeholder="e.g. Main Warehouse" />
              )}
            </div>
          )}
          <div>
            <Label>{destLabel} *</Label>
            {isEmployeeTransfer ? (
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.destination_location} onChange={e => setForm(f => ({ ...f, destination_location: e.target.value }))}>
                <option value="">Select destination employee...</option>
                {employees.map(e => <option key={e.id} value={`${e.first_name} ${e.last_name}`}>{e.first_name} {e.last_name}</option>)}
              </select>
            ) : form.transfer_type === 'truck_restock' || form.transfer_type === 'transfer_between_trucks' ? (
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.destination_location} onChange={e => setForm(f => ({ ...f, destination_location: e.target.value }))}>
                <option value="">Select destination truck...</option>
                {trucks.map(t => <option key={t.id} value={t.truck_number || t.truck_id}>{t.truck_number || t.truck_id}</option>)}
              </select>
            ) : form.transfer_type === 'truck_return' ? (
              <Input value={form.destination_location} onChange={e => setForm(f => ({ ...f, destination_location: e.target.value }))} className="mt-1" defaultValue="Warehouse" />
            ) : (
              <Input value={form.destination_location} onChange={e => setForm(f => ({ ...f, destination_location: e.target.value }))} className="mt-1" placeholder="e.g. Secondary Warehouse" />
            )}
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            Process Transfer
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
              <p className="text-muted-foreground">Assigned: {success.master_before?.assigned} → {success.master_after?.assigned}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}