import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';
import {
  NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES, NOTIFICATION_STATUSES, DEPARTMENTS, SOURCE_MODULES, DELIVERY_METHODS, DELIVERY_METHOD_STATUS,
} from '@/lib/notificationConstants';

export default function NotificationFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [form, setForm] = useState({});
  const [initialSnapshot, setInitialSnapshot] = useState({});
  const { isLeadTech, employee } = useCurrentRole();

  useEffect(() => {
    if (open) {
      const initial = initialData || {
        title: '', message: '', notification_type: 'Information', priority: 'Medium',
        source_module: 'Manual', recipient_email: '', recipient_name: '',
        recipient_role: '', recipient_department: '',
        requires_acknowledgment: false, delivery_methods: ['In-App'],
        notes: '',
      };
      setForm(initial);
      setInitialSnapshot(initial);
    }
  }, [open, initialData]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialSnapshot),
    [form, initialSnapshot]
  );
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(
    isDirty, () => onOpenChange(false)
  );

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleDelivery = (method) => {
    const current = form.delivery_methods || [];
    set('delivery_methods', current.includes(method) ? current.filter(m => m !== method) : [...current, method]);
  };

  const handleSubmit = () => {
    const data = { ...form };
    if (!data.notification_id && initialData?.notification_id) data.notification_id = initialData.notification_id;
    if (!data.status) data.status = 'Sent';
    if (!data.sent_date) data.sent_date = new Date().toISOString();
    onSave(data);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Notification' : 'Create Notification'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
            <Input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Notification title" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message <span className="text-destructive">*</span></Label>
            <Textarea value={form.message || ''} onChange={e => set('message', e.target.value)} rows={3} placeholder="Notification message..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.notification_type || 'Information'} onValueChange={v => set('notification_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NOTIFICATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority || 'Medium'} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NOTIFICATION_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Source Module</Label>
              <Select value={form.source_module || 'Manual'} onValueChange={v => set('source_module', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCE_MODULES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status || 'Sent'} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NOTIFICATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient Employee (optional)</Label>
            <EmployeePicker
              value={form.recipient_employee_registry_id}
              onChange={(selection) => {
                if (!selection) {
                  set('recipient_employee_registry_id', '');
                  set('recipient_email', '');
                  set('recipient_name', '');
                  return;
                }
                set('recipient_employee_registry_id', selection.employee_registry_id);
                set('recipient_email', selection.employee_email);
                set('recipient_name', selection.employee_name);
                set('recipient_role', selection.primary_role);
                set('recipient_department', selection.department);
              }}
              label=""
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient Role (if no specific employee)</Label>
              <Input value={form.recipient_role || ''} onChange={e => set('recipient_role', e.target.value)} placeholder="e.g. Operations Manager" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient Department</Label>
              <Select value={form.recipient_department || ''} onValueChange={v => set('recipient_department', v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Delivery Methods</Label>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_METHODS.map(method => {
                const status = DELIVERY_METHOD_STATUS[method] || { active: false, label: 'Planned' };
                const checked = (form.delivery_methods || []).includes(method);
                return (
                  <label key={method} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs ${status.active ? 'cursor-pointer hover:bg-muted/50' : 'opacity-50 cursor-not-allowed'} ${checked ? 'bg-accent/10 border-accent/30' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => status.active && toggleDelivery(method)} disabled={!status.active} className="w-3.5 h-3.5 rounded" />
                    <span className="font-medium">{method}</span>
                    {!status.active && <span className="text-muted-foreground">({status.label})</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.requires_acknowledgment || false} onCheckedChange={v => set('requires_acknowledgment', v)} />
            <Label className="text-xs cursor-pointer">Requires Acknowledgment</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Internal notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.title || !form.message}>
            {initialData ? 'Save Changes' : 'Send Notification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DirtyCloseWarning
      open={showWarning}
      onContinueEditing={cancelDiscard}
      onDiscardChanges={confirmDiscard}
    />
    </>
  );
}