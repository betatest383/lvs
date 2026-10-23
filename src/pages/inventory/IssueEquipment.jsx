import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowUpFromLine, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function IssueEquipment() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ equipment_master_id: '', quantity: 1, employee: '', truck: '', notes: '' });

  useEffect(() => {
    Promise.all([
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500),
      base44.entities.EmployeeRegistry.filter({ employment_status: 'Active' }, 'first_name', 200),
      base44.entities.TruckProfile.filter({ status: 'Active' }, 'truck_number', 50)
    ]).then(([m, e, t]) => { setItems(m); setEmployees(e); setTrucks(t); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectedItem = items.find(i => i.id === form.equipment_master_id);
  const maxQty = selectedItem?.quantity_available || 0;

  const submit = async () => {
    if (!form.equipment_master_id) { toast({ title: 'Error', description: 'Select an equipment item', variant: 'destructive' }); return; }
    if (!form.employee) { toast({ title: 'Error', description: 'Select an employee', variant: 'destructive' }); return; }
    if (Number(form.quantity) > maxQty) { toast({ title: 'Error', description: `Only ${maxQty} units available`, variant: 'destructive' }); return; }
    setSubmitting(true); setSuccess(null);
    try {
      const res = await base44.functions.invoke('processInventoryTransaction', {
        transaction_type: 'issue_to_employee',
        equipment_master_id: form.equipment_master_id,
        quantity: Number(form.quantity),
        employee: form.employee,
        truck: form.truck,
        notes: form.notes
      });
      if (res.data?.error) { toast({ title: 'Error', description: res.data.error, variant: 'destructive' }); }
      else {
        toast({ title: 'Success', description: `Issued ${form.quantity} units to ${form.employee}` });
        setSuccess(res.data);
        setForm({ equipment_master_id: '', quantity: 1, employee: '', truck: '', notes: '' });
      }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowUpFromLine className="w-5 h-5 text-blue-600" /> Issue Equipment to Employee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Equipment Item *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.equipment_master_id} onChange={e => setForm(f => ({ ...f, equipment_master_id: e.target.value }))}>
              <option value="">Select equipment...</option>
              {items.filter(i => (i.quantity_available || 0) > 0).map(i => <option key={i.id} value={i.id}>{i.equipment_id || ''} — {i.item_name} (Avail: {i.quantity_available})</option>)}
            </select>
          </div>
          {selectedItem && (
            <div className="p-3 bg-muted rounded-lg text-sm flex gap-4">
              <span>Available: <strong className="text-green-600">{selectedItem.quantity_available}</strong></span>
              <span>Assigned: <strong className="text-blue-600">{selectedItem.quantity_assigned}</strong></span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" max={maxQty} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Employee *</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.employee} onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}>
                <option value="">Select employee...</option>
                {employees.map(e => <option key={e.id} value={`${e.first_name} ${e.last_name}`}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Assigned Truck (optional)</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.truck} onChange={e => setForm(f => ({ ...f, truck: e.target.value }))}>
              <option value="">No specific truck</option>
              {trucks.map(t => <option key={t.id} value={t.truck_number || t.truck_id}>{t.truck_number || t.truck_id} — {t.vehicle_name || t.vehicle_type}</option>)}
            </select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
            Issue Equipment
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