import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const SCAFFOLD_TYPES = [
  { value: 'tube_clamp', label: 'Tube & Clamp' },
  { value: 'system_scaffold', label: 'System Scaffold' },
  { value: 'rolling', label: 'Rolling Tower' },
  { value: 'swing_stage', label: 'Swing Stage' },
  { value: 'other', label: 'Other' },
];

const GROUND_CONDITIONS = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'grass', label: 'Grass / Soil' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'uneven', label: 'Uneven / Sloped' },
];

export const SCAFFOLD_FORM_FIELDS = [
  'scaffold_type', 'estimated_height', 'number_of_levels', 'setup_location',
  'ground_condition', 'fall_protection_required', 'tie_off_requirements',
  'setup_by', 'inspection_required_before_use', 'photos_required', 'notes',
];

export function isScaffoldFormComplete(form) {
  if (!form) return false;
  return !!form.scaffold_type && !!form.estimated_height && !!form.setup_location
    && !!form.ground_condition && !!form.setup_by;
}

export default function ScaffoldFormDialog({ open, onClose, data, onUpdate }) {
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const set = (field, value) => { onUpdate({ [field]: value }); setIsDirty(true); };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCloseAttempt(); }}>
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