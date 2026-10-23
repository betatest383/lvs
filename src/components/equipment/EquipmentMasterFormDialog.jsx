import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function EquipmentMasterFormDialog({ open, onOpenChange, initialData, onSaved, isDuplicate }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(initialData || { unit: 'ea', quantity_owned: 0, replacement_cost_per_unit: 0 });
    }
  }, [initialData, open]);

  useEffect(() => {
    if (open) {
      base44.entities.EquipmentCategory.filter({ is_active: true }, 'sort_order', 50)
        .then(setCategories)
        .catch(() => {});
    }
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update('photo_url', file_url);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }
    if (!form.unit) { toast.error('Unit is required'); return; }
    setSaving(true);
    try {
      const isEdit = !!initialData?.id && !isDuplicate;
      const qtyOwned = form.quantity_owned || 0;
      const data = {
        item_name: form.item_name,
        category: form.category || '',
        description: form.description || '',
        unit: form.unit || 'ea',
        replacement_cost_per_unit: form.replacement_cost_per_unit || 0,
        required_daily_operations: form.required_daily_operations || false,
        required_todays_job: form.required_todays_job || false,
        photo_url: form.photo_url || '',
        notes: form.notes || '',
        is_active: form.is_active !== false,
      };

      if (isEdit) {
        // On edit, don't change stock quantities (managed by workflow)
        await base44.entities.EquipmentMaster.update(initialData.id, data);
        toast.success('Equipment updated');
      } else {
        // On create, all owned items start as available
        data.quantity_owned = qtyOwned;
        data.quantity_available = qtyOwned;
        data.quantity_assigned = 0;
        data.quantity_out_for_repair = 0;
        data.quantity_retired = 0;
        // Auto-generate equipment_id
        const existing = await base44.entities.EquipmentMaster.filter({});
        const seq = String((existing?.length || 0) + 1).padStart(6, '0');
        data.equipment_id = form.equipment_id || `EM-${seq}`;
        const result = await base44.entities.EquipmentMaster.create(data);
        toast.success('Equipment added to master list');
        onSaved?.(result);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save equipment');
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!initialData?.id && !isDuplicate;
  const totalValue = (form.quantity_owned || 0) * (form.replacement_cost_per_unit || 0);

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