import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import RepairCategoryCombobox from './RepairCategoryCombobox';

export default function RepairFormDialog({ open, onOpenChange, title, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || {});
  }, [initialData, open]);

  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initialData || {}),
    [data, initialData]
  );
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty, () => onOpenChange(false)
  );

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  const handleCategoryChange = (categoryId, categoryName) => {
    setData(prev => ({
      ...prev,
      repair_category_id: categoryId || '',
      repair_category_name: categoryName || '',
      category: categoryName || '',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      const backendMsg = error?.response?.data?.detail || error?.response?.data?.error || error?.message || 'Unknown error';
      toast.error(`Save failed: ${backendMsg}`);
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