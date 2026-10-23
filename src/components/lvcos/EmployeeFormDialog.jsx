import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  EMPLOYMENT_STATUS_OPTIONS, EMPLOYMENT_TYPE_OPTIONS
} from '@/lib/employeeRegistryConstants';
import { DEPARTMENTS } from '@/lib/roleRegistryConstants';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function EmployeeFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [packages, setPackages] = useState([]);

  useEffect(() => { if (open) setData(initialData || {}); }, [initialData, open]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      base44.entities.RoleRegistry.list('-sort_order', 200).catch(() => []),
      base44.entities.EmployeeRegistry.list('-created_date', 200).catch(() => []),
      base44.entities.TruckProfile.list('-created_date', 200).catch(() => []),
      base44.entities.EquipmentPackage.filter({ is_active: true }, '-created_date', 200).catch(() => []),
    ]).then(([r, e, t, p]) => {
      setRoles(r || []);
      setEmployees(e || []);
      setTrucks(t || []);
      setPackages(p || []);
    });
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const handleSave = async () => {
    if (!data.employee_id || !data.first_name || !data.last_name) return;
    setSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleCloseAttempt}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Edit Employee' : 'New Employee'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Employee ID *</Label>
            <Input value={data.employee_id || ''} onChange={e => updateField('employee_id', e.target.value)} placeholder="EMP-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Preferred Name</Label>
            <Input value={data.preferred_name || ''} onChange={e => updateField('preferred_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>First Name *</Label>
            <Input value={data.first_name || ''} onChange={e => updateField('first_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name *</Label>
            <Input value={data.last_name || ''} onChange={e => updateField('last_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={data.email || ''} onChange={e => updateField('email', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={data.phone || ''} onChange={e => updateField('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={data.department || '__none__'} onValueChange={v => updateField('department', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Primary Role</Label>
            <Select value={data.primary_role || '__none__'} onValueChange={v => updateField('primary_role', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {roles.map(r => <SelectItem key={r.id} value={r.name || r.role_name || r.id}>{r.name || r.role_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Supervisor</Label>
            <Select value={data.supervisor || '__none__'} onValueChange={v => updateField('supervisor', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {employees.filter(e => e.id !== initialData?.id).map(e => (
                  <SelectItem key={e.id} value={`${e.first_name} ${e.last_name}`}>{e.first_name} {e.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Employment Type</Label>
            <Select value={data.employment_type || 'Full Time'} onValueChange={v => updateField('employment_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Employment Status</Label>
            <Select value={data.employment_status || 'Active'} onValueChange={v => updateField('employment_status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hire Date</Label>
            <Input type="date" value={data.hire_date || ''} onChange={e => updateField('hire_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Assigned Truck</Label>
            <Select value={data.assigned_truck || '__none__'} onValueChange={v => updateField('assigned_truck', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {trucks.map(t => <SelectItem key={t.id} value={t.truck_number || t.name || t.id}>{t.truck_number || t.name || t.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Equipment Package</Label>
            <Select value={data.assigned_equipment_package || '__none__'} onValueChange={v => updateField('assigned_equipment_package', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {packages.map(p => <SelectItem key={p.id} value={p.name || p.id}>{p.name || p.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={data.notes || ''} onChange={e => updateField('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !data.employee_id || !data.first_name || !data.last_name} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {initialData?.id ? 'Save Changes' : 'Create Employee'}
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