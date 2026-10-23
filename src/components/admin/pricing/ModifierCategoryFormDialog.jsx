import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_STATUS_OPTIONS, ICON_OPTIONS } from './pricingConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function ModifierCategoryFormDialog({ open, onOpenChange, title, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || { status: 'active', allow_multiple_modifiers: true, mutually_exclusive: false, display_order: 0 });
  }, [initialData, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const handleSave = async () => {
    if (!data.name?.trim()) {
      toast.error('Category Name is required');
      return;
    }
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Save failed: ${error?.message || 'Unknown error'}`);
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