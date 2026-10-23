import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Undo2, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CONDITION_LABELS, RETURN_REASON_LABELS, ASSIGNMENT_TYPE_LABELS } from '@/lib/equipmentConstants';
import { RETURN_CONDITION_DESTINATION, DISPOSITION_LABELS, processBulkReturns } from '@/lib/equipmentReturnUtils';

export default function BulkReturnDialog({ open, onOpenChange, assignments = [], onReturned }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        return_condition: 'good',
        return_reason: 'returned_to_warehouse',
        notes: '',
      });
      setResult(null);
    }
  }, [open]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const totalValue = assignments.reduce((s, a) => s + (a.current_value || (a.replacement_cost || 0) * (a.quantity || 1)), 0);
  const totalQty = assignments.reduce((s, a) => s + (a.quantity || 1), 0);
  const disposition = RETURN_CONDITION_DESTINATION[form.return_condition] || 'available';

  const handleSave = async () => {
    if (assignments.length === 0) return;
    setSaving(true);
    try {
      const res = await processBulkReturns(assignments, form);
      setResult(res);
      if (res.failed === 0) {
        toast.success(`${res.succeeded} items returned — ${DISPOSITION_LABELS[disposition]}`);
        onReturned?.();
        onOpenChange(false);
      } else {
        toast.warning(`${res.succeeded} returned, ${res.failed} failed`);
        if (res.succeeded > 0) onReturned?.();
      }
    } catch (err) {
      toast.error('Bulk return failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-accent" />
            Bulk Return Equipment
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 bg-muted rounded-lg grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold">{assignments.length}</p>
            <p className="text-xs text-muted-foreground">Items</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalQty}</p>
            <p className="text-xs text-muted-foreground">Total Units</p>
          </div>
          <div>
            <p className="text-2xl font-bold">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">Total Value</p>
          </div>
        </div>

        {assignments.length > 0 && (
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm">
                <span className="flex-1 truncate font-medium">{a.item_name}</span>
                <span className="text-xs text-muted-foreground">{a.assigned_employee || '—'}</span>
                <span className="text-xs text-muted-foreground">Qty: {a.quantity || 1}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4 py-2">
          <div>
            <Label>Return Condition (applied to all) *</Label>
            <Select value={form.return_condition} onValueChange={v => update('return_condition', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">→ {DISPOSITION_LABELS[disposition]}</p>
          </div>

          <div>
            <Label>Return Reason (applied to all) *</Label>
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
            <Label>Return Notes (applied to all)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="e.g. Employee offboarding, truck reassignment..."
              value={form.notes || ''}
              onChange={e => update('notes', e.target.value)}
            />
          </div>

          {result && result.errors?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
              <p className="text-xs font-medium text-red-700">Errors ({result.errors.length}):</p>
              {result.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e.item}: {e.error}</p>
              ))}
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              This will end {assignments.length} assignment(s) and create permanent history records for each.
              EquipmentMaster stock will be adjusted automatically. All assignment records will be preserved.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || assignments.length === 0} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Undo2 className="w-4 h-4 mr-1" />
            Return {assignments.length} Item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}