import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { INVENTORY_TRANSACTION_TYPES, getBalanceSummary } from '@/lib/inventoryMasterConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function InventoryTransactionDialog({ open, onOpenChange, onSaved, item, defaultType }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    transaction_type: 'receive',
    quantity: 1,
    reason: '',
    notes: '',
    related_employee: '',
    related_truck: '',
    related_job: '',
    related_request_id: '',
    purchase_order: '',
    unit_cost: '',
    vendor: '',
    destination_location: '',
  });

  useEffect(() => {
    if (item && open) {
      setForm(prev => ({
        ...prev,
        transaction_type: defaultType || 'receive',
        unit_cost: item.unit_cost || '',
        vendor: item.vendor || '',
        destination_location: item.warehouse_location || '',
      }));
    }
  }, [item, open, defaultType]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, item]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (field, value) => { setForm(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const txnMeta = INVENTORY_TRANSACTION_TYPES.find(t => t.value === form.transaction_type) || {};
  const needsQuantity = txnMeta.delta !== 'none';

  const handleSubmit = async () => {
    if (!item) return;
    if (needsQuantity && (!form.quantity || form.quantity <= 0)) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    setSaving(true);
    try {
      await base44.functions.invoke('processInventoryMasterTransaction', {
        inventory_master_id: item.id,
        transaction_type: form.transaction_type,
        quantity: Number(form.quantity) || 0,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
        related_employee: form.related_employee || undefined,
        related_truck: form.related_truck || undefined,
        related_job: form.related_job || undefined,
        related_request_id: form.related_request_id || undefined,
        purchase_order: form.purchase_order || undefined,
        unit_cost: form.unit_cost !== '' ? Number(form.unit_cost) : undefined,
        vendor: form.vendor || undefined,
        destination_location: form.destination_location || undefined,
      });
      toast.success(`${txnMeta.label || 'Transaction'} completed`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Transaction failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
...
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}