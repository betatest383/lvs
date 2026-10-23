import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Undo2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { CONDITION_LABELS, RETURN_REASON_LABELS } from '@/lib/equipmentConstants';
import { RETURN_CONDITION_DESTINATION, DISPOSITION_LABELS, processEquipmentReturn } from '@/lib/equipmentReturnUtils';

export default function UnassignEquipmentDialog({ open, onOpenChange, assignment, onReturned }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (assignment) {
      setForm({
        return_condition: 'good',
        quantity_returned: assignment.quantity || 1,
        return_reason: 'returned_to_warehouse',
        notes: '',
      });
    }
  }, [assignment]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const assignedQty = assignment?.quantity || 1;
  const returnQty = form.quantity_returned || 1;
  const exceedsAssigned = returnQty > assignedQty;
  const disposition = RETURN_CONDITION_DESTINATION[form.return_condition] || 'available';

  const handleSave = async () => {
    if (!assignment) return;
    if (returnQty < 1) { toast.error('Quantity returned must be at least 1'); return; }
    if (exceedsAssigned) { toast.error(`Cannot return more than ${assignedQty} assigned`); return; }
    setSaving(true);
    try {
      const result = await processEquipmentReturn(assignment, form);
      toast.success(`${returnQty} x ${assignment.item_name} returned — ${DISPOSITION_LABELS[result.disposition]}`);
      onReturned?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to process return: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-accent" />
            Unassign / Return Equipment
          </DialogTitle>
        </DialogHeader>
        {assignment && (
          <>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                {assignment.photo_url ? (
                  <img src={assignment.photo_url} alt={assignment.item_name} className="w-12 h-12 rounded-lg object-cover" />
                ) : null}
                <div className="flex-1">
                  <p className="text-sm font-medium">{assignment.item_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.equipment_id || 'No ID'} · Assigned to {assignment.assigned_employee || '—'}
                  </p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">
                    {assignedQty} assigned · ${(assignment.current_value || (assignment.replacement_cost || 0) * assignedQty).toLocaleString('en-US', { maximumFractionDigits: 0 })} total value
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 py-2">
              <div>
                <Label>Quantity Returned *</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  max={assignedQty}
                  value={returnQty}
                  onChange={e => update('quantity_returned', parseInt(e.target.value) || 1)}
                />
                {exceedsAssigned && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-red-600">
                    <AlertTriangle className="w-3 h-3" /> Only {assignedQty} assigned
                  </div>
                )}
                {returnQty < assignedQty && (
                  <p className="text-xs text-amber-600 mt-1">
                    Partial return: {assignedQty - returnQty} unit(s) will remain assigned.
                  </p>
                )}
              </div>

              <div>
                <Label>Return Condition *</Label>
                <Select value={form.return_condition} onValueChange={v => update('return_condition', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  → {DISPOSITION_LABELS[disposition]}
                </p>
              </div>

              <div>
                <Label>Return Reason *</Label>
                <Select value={form.return_reason} onValueChange={v => update('return_reason', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RETURN_REASON_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Return Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  placeholder="Additional notes about this return..."
                  value={form.notes || ''}
                  onChange={e => update('notes', e.target.value)}
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  This will end the assignment and create a permanent history record.
                  EquipmentMaster stock will be adjusted automatically.
                  The assignment record will be preserved (not deleted).
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || exceedsAssigned} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Undo2 className="w-4 h-4 mr-1" />
                Process Return
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}