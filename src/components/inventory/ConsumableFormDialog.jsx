import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { CONSUMABLE_CATEGORIES } from '@/lib/consumableCatalog';
import { computeInventoryValue } from '@/lib/consumableConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const UNITS = ['ea', 'Tube', 'Box', 'Bag', 'Pair', 'Piece', 'Roll', 'Container', 'Wheel', 'Gallon', 'Case'];

export default function ConsumableFormDialog({ open, onOpenChange, onSaved, editingItem }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sku: '',
    item_name: '',
    description: '',
    category: '',
    unit: 'ea',
    quantity_on_hand: 0,
    minimum_stock: 0,
    maximum_stock: 0,
    reorder_quantity: 0,
    warehouse_location: '',
    bin_location: '',
    vendor: '',
    manufacturer: '',
    unit_cost: 0,
    status: 'Active',
    notes: '',
  });

  useEffect(() => {
    if (editingItem) {
      setForm({
        sku: editingItem.sku || '',
        item_name: editingItem.item_name || '',
        description: editingItem.description || '',
        category: editingItem.category || '',
        unit: editingItem.unit || 'ea',
        quantity_on_hand: editingItem.quantity_on_hand || 0,
        minimum_stock: editingItem.minimum_stock || 0,
        maximum_stock: editingItem.maximum_stock || 0,
        reorder_quantity: editingItem.reorder_quantity || 0,
        warehouse_location: editingItem.warehouse_location || '',
        bin_location: editingItem.bin_location || '',
        vendor: editingItem.vendor || '',
        manufacturer: editingItem.manufacturer || '',
        unit_cost: editingItem.unit_cost || 0,
        status: editingItem.status || 'Active',
        notes: editingItem.notes || '',
      });
    } else {
      setForm({
        sku: '', item_name: '', description: '', category: '', unit: 'ea',
        quantity_on_hand: 0, minimum_stock: 0, maximum_stock: 0, reorder_quantity: 0,
        warehouse_location: '', bin_location: '', vendor: '', manufacturer: '',
        unit_cost: 0, status: 'Active', notes: '',
      });
    }
  }, [editingItem, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, editingItem]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (field, value) => { setForm(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const generateSku = () => {
    const prefix = 'CONS';
    const rand = Math.floor(Math.random() * 90000) + 10000;
    update('sku', `${prefix}-${rand}`);
  };

  const handleSubmit = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }
    if (!form.category) { toast.error('Category is required'); return; }

    setSaving(true);
    try {
      const data = {
        ...form,
        inventory_value: computeInventoryValue(form),
        is_active: form.status === 'Active',
      };

      if (editingItem) {
        await base44.entities.ConsumableCatalog.update(editingItem.id, data);
        toast.success('Consumable updated');
      } else {
        await base44.entities.ConsumableCatalog.create(data);
        toast.success('Consumable added');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save consumable');
    } finally {
      setSaving(false);
    }
  };

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