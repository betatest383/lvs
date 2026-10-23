import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { COMPENSATION_METHODS, COMMISSION_BASES, COMMISSION_TIMINGS } from '@/lib/commissionEngine';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function CompensationPlanFormDialog({ open, plan, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '', employee_id: '', employee_name: '', role: 'Lead Technician',
    compensation_method: 'commission', hourly_rate: 0, salary_amount: 0,
    commission_rate_percentage: 15, commission_basis: 'job_subtotal', commission_timing: 'work_completed',
    include_chargeable_materials: true, include_service_revenue: true,
    include_visible_price_modifiers: true, include_discounts: true,
    include_tax: false, include_financing_fees: false, include_permits: false,
    include_subcontractors: false, include_membership_revenue: false,
    minimum_margin_required: null, effective_start_date: '', effective_end_date: '',
    status: 'active',
  });

  useEffect(() => {
    if (plan) {
      setForm({ ...form, ...plan });
    } else {
      setForm({
        name: '', employee_id: '', employee_name: '', role: 'Lead Technician',
        compensation_method: 'commission', hourly_rate: 0, salary_amount: 0,
        commission_rate_percentage: 15, commission_basis: 'job_subtotal', commission_timing: 'work_completed',
        include_chargeable_materials: true, include_service_revenue: true,
        include_visible_price_modifiers: true, include_discounts: true,
        include_tax: false, include_financing_fees: false, include_permits: false,
        include_subcontractors: false, include_membership_revenue: false,
        minimum_margin_required: null, effective_start_date: '', effective_end_date: '',
        status: 'active',
      });
    }
  }, [plan, open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, plan]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onClose());

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setIsDirty(true); };

  const handleSave = () => {
    if (!form.name) return;
    onSave(form);
  };

  const showCommission = form.compensation_method === 'commission' || form.compensation_method === 'hourly_plus_commission';
  const showHourly = form.compensation_method === 'hourly' || form.compensation_method === 'hourly_plus_commission';
  const showSalary = form.compensation_method === 'salary';

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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