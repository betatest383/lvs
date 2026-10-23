import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CORRECTIVE_PRIORITIES } from '@/lib/auditConstants';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function CorrectiveActionDialog({ open, onClose, action, auditNumber, auditId, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        action
          ? { ...action }
          : {
              audit_number: auditNumber || '',
              audit_id: auditId || '',
              status: 'Open',
              priority: 'Medium',
              assigned_employee: '',
              due_date: '',
              description: '',
            }
      );
    }
  }, [action, open, auditNumber, auditId]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, action]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const update = (key, val) => { setForm((p) => ({ ...p, [key]: val })); setIsDirty(true); };

  const handleSave = async () => {
    if (!form.description?.trim() || !form.assigned_employee_registry_id) return;
    setSaving(true);
    try {
      if (action?.id) {
        await base44.entities.CorrectiveAction.update(action.id, form);
      } else {
        await base44.entities.CorrectiveAction.create(form);
      }
      onSaved?.();
      onClose();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const inputClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
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