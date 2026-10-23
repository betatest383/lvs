import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

const ROLE_OPTIONS = ['Lead Technician', 'Apprentice', 'Mason', 'Mason Helper', 'Installer', 'Supervisor', 'Warehouse Support'];

export default function LoadedLaborCostFormDialog({ open, onOpenChange, title, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(initialData || { status: 'active', base_hourly_wage: 0, payroll_tax_percentage: 0, workers_comp_percentage: 0, benefit_cost_per_hour: 0, insurance_cost_per_hour: 0, other_burden_per_hour: 0 });
  }, [initialData, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const update = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const loadedCost = (() => {
    const base = data.base_hourly_wage || 0;
    const tax = base * ((data.payroll_tax_percentage || 0) / 100);
    const wc = base * ((data.workers_comp_percentage || 0) / 100);
    return base + tax + wc + (data.benefit_cost_per_hour || 0) + (data.insurance_cost_per_hour || 0) + (data.other_burden_per_hour || 0);
  })();

  const handleSave = async () => {
    if (!data.role) { toast.error('Role is required'); return; }
    setSaving(true);
    try {
      await onSave({ ...data, loaded_hourly_cost: Math.round(loadedCost * 100) / 100 });
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