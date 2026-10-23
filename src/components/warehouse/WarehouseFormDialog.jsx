import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import PhotoUploadField from './PhotoUploadField';
import SignaturePad from './SignaturePad';

export default function WarehouseFormDialog({ open, onOpenChange, title, fields, initialData, onSave, technicians = [] }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || {});
  }, [initialData]);

  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initialData || {}),
    [data, initialData]
  );
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty, () => onOpenChange(false)
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key, value) => setData(prev => ({ ...prev, [key]: value }));

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