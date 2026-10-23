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

const LIFT_TYPES = [
  { value: 'boom_lift', label: 'Boom Lift' },
  { value: 'scissor_lift', label: 'Scissor Lift' },
  { value: 'articulating', label: 'Articulating Boom' },
  { value: 'truck_mounted', label: 'Truck-Mounted Lift' },
  { value: 'other', label: 'Other' },
];

const GROUND_CONDITIONS = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'grass', label: 'Grass / Soil' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'uneven', label: 'Uneven / Sloped' },
];

export const LIFT_FORM_FIELDS = [
  'lift_type', 'lift_height', 'delivery_date', 'pickup_date',
  'delivery_location', 'ground_condition', 'operator',
  'operator_certification_confirmed', 'rental_company',
  'rental_confirmation', 'safety_perimeter_plan', 'photos_required', 'notes',
];

export function isLiftFormComplete(form) {
  if (!form) return false;
  return !!form.lift_type && !!form.lift_height && !!form.delivery_location
    && !!form.ground_condition && !!form.operator && !!form.rental_company
    && !!form.operator_certification_confirmed;
}

export default function LiftFormDialog({ open, onClose, data, onUpdate }) {
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