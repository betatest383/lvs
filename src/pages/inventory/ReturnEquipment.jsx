import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { CONDITIONS } from '@/lib/inventoryConstants';

export default function ReturnEquipment() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ equipment_master_id: '', quantity: 1, employee: '', condition: 'good', reason: '', notes: '' });

  useEffect(() => {
    base44.entities.TechEquipment.filter({ is_active: true }, '-created_date', 500)
      .then(setAssignments).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const employees = [...new Set(assignments.map(a => a.assigned_employee).filter(Boolean))];
  const employeeAssignments = assignments.filter(a => a.assigned_employee === form.employee);
  const selectedItem = employeeAssignments.find(a => a.equipment_master_id === form.equipment_master_id);
  const maxReturn = selectedItem?.quantity || 0;

  const submit = async () => {
    if (!form.equipment_master_id) { toast({ title: 'Error', description: 'Select equipment to return', variant: 'destructive' }); return; }
    if (!form.employee) { toast({ title: 'Error', description: 'Select an employee', variant: 'destructive' }); return; }
    if (Number(form.quantity) > maxReturn) { toast({ title: 'Error', description: `Only ${maxReturn} units assigned`, variant: 'destructive' }); return; }
    setSubmitting(true); setSuccess(null);
    try {
      const res = await base44.functions.invoke('processInventoryTransaction', {
        transaction_type: 'return_from_employee',
        equipment_master_id: form.equipment_master_id,
        quantity: Number(form.quantity),
        employee: form.employee,
        condition: form.condition,
        reason: form.reason,
        notes: form.notes
      });
      if (res.data?.error) { toast({ title: 'Error', description: res.data.error, variant: 'destructive' }); }
      else {
        toast({ title: 'Success', description: `Returned ${form.quantity} units from ${form.employee}` });
        setSuccess(res.data);
        setForm({ equipment_master_id: '', quantity: 1, employee: '', condition: 'good', reason: '', notes: '' });
      }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-cyan-600" /> Return Equipment from Employee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Employee *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.employee} onChange={e => setForm(f => ({ ...f, employee: e.target.value, equipment_master_id: '' }))}>
              <option value="">Select employee...</option>
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <Label>Equipment to Return *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.equipment_master_id} onChange={e => setForm(f => ({ ...f, equipment_master_id: e.target.value }))} disabled={!form.employee}>
              <option value="">Select equipment...</option>
              {employeeAssignments.map(a => <option key={a.id} value={a.equipment_master_id}>{a.item_name} (Assigned: {a.quantity || 1})</option>)}
            </select>
          </div>
          {selectedItem && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              Currently assigned: <strong>{selectedItem.quantity || 1}</strong> units
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity to Return *</Label>
              <Input type="number" min="1" max={maxReturn} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Condition *</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" placeholder="e.g. end of assignment, truck reassignment, offboarding" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          {form.condition === 'repair' && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
              Equipment will be marked as out for repair.
            </div>
          )}
          {(form.condition === 'damaged' || form.condition === 'lost') && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Equipment will be retired from service.
            </div>
          )}
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            Process Return
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