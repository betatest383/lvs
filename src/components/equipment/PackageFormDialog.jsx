import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function PackageFormDialog({ open, onOpenChange, initialData, onSaved }) {
  const [form, setForm] = useState({ package_name: '', description: '', role_type: 'lead_technician', notes: '' });
  const [items, setItems] = useState([]);
  const [masterItems, setMasterItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      base44.entities.EquipmentMaster.filter({ is_active: true }, 'item_name', 500)
        .then(setMasterItems)
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (initialData) {
      setForm({
        package_name: initialData.package_name || '',
        description: initialData.description || '',
        role_type: initialData.role_type || 'lead_technician',
        notes: initialData.notes || '',
      });
      let parsed = [];
      try { parsed = JSON.parse(initialData.items || '[]'); } catch {}
      setItems(parsed.map(p => ({
        equipment_master_id: p.equipment_master_id || '',
        item_name: p.item_name || '',
        category: p.category || '',
        unit: p.unit || 'ea',
        quantity_required: p.quantity_required || 1,
        required_daily_operations: p.required_daily_operations || false,
        notes: p.notes || '',
        replacement_cost_per_unit: p.replacement_cost_per_unit || 0,
      })));
    } else {
      setForm({ package_name: '', description: '', role_type: 'lead_technician', notes: '' });
      setItems([]);
    }
  }, [initialData]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const addItem = () => {
    setItems(prev => [...prev, { equipment_master_id: '', item_name: '', category: '', unit: 'ea', quantity_required: 1, required_daily_operations: false, notes: '', replacement_cost_per_unit: 0 }]);
    setIsDirty(true);
  };

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [key]: value };
      if (key === 'equipment_master_id') {
        const master = masterItems.find(m => m.id === value);
        if (master) {
          updated.item_name = master.item_name;
          updated.category = master.category || '';
          updated.unit = master.unit || 'ea';
          updated.replacement_cost_per_unit = master.replacement_cost_per_unit || 0;
        }
      }
      return updated;
    }));
    setIsDirty(true);
  };

  const removeItem = (idx) => { setItems(prev => prev.filter((_, i) => i !== idx)); setIsDirty(true); };

  const totalValue = items.reduce((s, it) => s + (it.replacement_cost_per_unit || 0) * (it.quantity_required || 1), 0);

  const handleSave = async () => {
    if (!form.package_name) { toast.error('Package name is required'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    if (items.some(it => !it.equipment_master_id)) { toast.error('All items must be selected from the Equipment Master'); return; }
    setSaving(true);
    try {
      const itemsJson = JSON.stringify(items.map(it => ({
        equipment_master_id: it.equipment_master_id,
        item_name: it.item_name,
        category: it.category,
        unit: it.unit,
        quantity_required: it.quantity_required,
        required_daily_operations: it.required_daily_operations,
        notes: it.notes,
        replacement_cost_per_unit: it.replacement_cost_per_unit,
      })));
      const data = {
        package_name: form.package_name,
        description: form.description,
        role_type: form.role_type,
        items: itemsJson,
        total_package_value: totalValue,
        is_active: true,
        notes: form.notes,
      };
      if (initialData?.id) {
        await base44.entities.EquipmentPackage.update(initialData.id, data);
        toast.success('Package updated');
      } else {
        await base44.entities.EquipmentPackage.create(data);
        toast.success('Package created');
      }
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast.error('Failed to save package');
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