import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  ONBOARDING_STATUSES, PHASE1_ITEMS, PHASE2_ITEMS, PHASE7_ITEMS,
  REVIEW_TYPES, DEFAULT_TASKS, generateOnboardingId,
} from '@/lib/onboardingConstants';
import { toast } from 'sonner';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function OnboardingFormDialog({ open, onOpenChange, initialData, onSave }) {
  const [data, setData] = useState(initialData || {});
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [assignmentSummary, setAssignmentSummary] = useState(null);

  useEffect(() => {
    setData(initialData || {});
    setAssignmentSummary(null);
  }, [initialData]);

  useEffect(() => {
    if (!open) return;
    base44.entities.EmployeeRegistry.list('-created_date', 500).then(setEmployees).catch(() => {});
    base44.entities.RoleRegistry.list('-created_date', 500).then(setRoles).catch(() => {});
  }, [open]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => { if (open) setIsDirty(false); }, [open, initialData]);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => onOpenChange(false));

  const updateField = (key, value) => { setData(prev => ({ ...prev, [key]: value })); setIsDirty(true); };

  const handleEmployeeSelect = (selection) => {
    if (!selection) {
      setData(prev => ({
        ...prev,
        employee_registry_id: '',
        employee_name: '',
        employee_email: '',
        employee_id: '',
        supervisor: '',
      }));
      return;
    }
    setData(prev => ({
      ...prev,
      employee_registry_id: selection.employee_registry_id,
      employee_name: selection.employee_name,
      employee_email: selection.employee_email,
      employee_id: selection.employee_id,
      department: selection.department || prev.department,
      primary_role: selection.primary_role || prev.primary_role,
    }));
  };

  const handleRoleSelect = async (roleRecordId) => {
    const role = roles.find(r => r.id === roleRecordId);
    if (!role) return;
    setAutoAssigning(true);
    try {
      const [trainings, policies, certs, sops, workflows] = await Promise.all([
        base44.entities.TrainingRegistry.list('-created_date', 500),
        base44.entities.PolicyRegistry.list('-created_date', 500),
        base44.entities.CertificationRegistry.list('-created_date', 500),
        base44.entities.SopRegistry.list('-created_date', 500),
        base44.entities.WorkflowRegistry.list('-created_date', 500),
      ]);

      const matchRole = (arr) => arr || [];
      const requiredTrainings = (trainings || []).filter(t =>
        t.status === 'Active' &&
        matchRole(t.required_roles).some(r => r === role.role_name || r === role.role_id),
      );
      const requiredPolicies = (policies || []).filter(p =>
        p.status === 'Active' &&
        p.requires_acknowledgment &&
        matchRole(p.related_roles).some(r => r === role.role_name || r === role.role_id),
      );
      const requiredCerts = (certs || []).filter(c =>
        c.status === 'Active' &&
        matchRole(c.required_roles).some(r => r === role.role_name || r === role.role_id),
      );
      const sopIds = role.required_sops || [];
      const requiredSops = (sops || []).filter(s => sopIds.includes(s.sop_id));
      const wfIds = role.required_workflows || [];
      const requiredWorkflows = (workflows || []).filter(w => wfIds.includes(w.workflow_id));

      const phase1 = PHASE1_ITEMS.map(item => ({ label: item, completed: false, completed_at: null, notes: '' }));
      const phase2 = PHASE2_ITEMS.map(item => ({ label: item, completed: false, completed_at: null, notes: '' }));
      const phase3 = requiredTrainings.map(t => ({ label: t.training_name, id: t.training_id, completed: false, completed_at: null, status: 'Assigned', quiz_score: null, notes: '' }));
      const phase4 = requiredPolicies.map(p => ({ label: p.policy_name, id: p.policy_id, completed: false, completed_at: null, status: 'Assigned', notes: '' }));
      const phase5 = requiredCerts.map(c => ({ label: c.certification_name, id: c.certification_id, completed: false, completed_at: null, status: 'Required', notes: '' }));
      const phase6 = [{ label: role.required_equipment_package || 'Standard Package', completed: false, completed_at: null, status: 'Pending', acknowledgment_signed: false, notes: '' }];
      const phase7 = PHASE7_ITEMS.map(item => ({ label: item, completed: false, completed_at: null, notes: '' }));
      const phase8 = [
        ...requiredSops.map(s => ({ label: s.title, id: s.sop_id, type: 'SOP', completed: false, completed_at: null, notes: '' })),
        ...requiredWorkflows.map(w => ({ label: w.title, id: w.workflow_id, type: 'Workflow', completed: false, completed_at: null, notes: '' })),
      ];
      const phase9 = REVIEW_TYPES.map(r => ({ label: r.type, completed: false, completed_at: null, status: 'Pending', notes: '' }));

      const requiresFleet = role.default_portal === 'tech' || role.default_portal === 'fleet';
      const tasks = DEFAULT_TASKS
        .filter(t => !t.fleetOnly || requiresFleet)
        .map(t => ({ task: t.task, department: t.department, status: 'pending', assigned_to: '', notes: '' }));

      setAssignmentSummary({
        training: requiredTrainings.length,
        policies: requiredPolicies.length,
        certifications: requiredCerts.length,
        sops: requiredSops.length,
        workflows: requiredWorkflows.length,
        tasks: tasks.length,
      });

      setData(prev => ({
        ...prev,
        role_id: role.role_id,
        primary_role: role.role_name,
        department: role.department || prev.department,
        assigned_equipment_package: role.required_equipment_package || '',
        assigned_software: role.required_software || [],
        phase1_pre_hire: JSON.stringify(phase1),
        phase2_system_setup: JSON.stringify(phase2),
        phase3_training: JSON.stringify(phase3),
        phase4_policies: JSON.stringify(phase4),
        phase5_certifications: JSON.stringify(phase5),
        phase6_equipment: JSON.stringify(phase6),
        phase7_fleet: JSON.stringify(phase7),
        phase8_dept_training: JSON.stringify(phase8),
        phase9_reviews: JSON.stringify(phase9),
        tasks: JSON.stringify(tasks),
      }));
      toast.success('Auto-assigned from role registry');
    } catch {
      toast.error('Failed to auto-assign from role');
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleSave = async () => {
    if (!data.employee_registry_id) return;
    setSaving(true);
    const payload = { ...data };
    if (!payload.onboarding_id) payload.onboarding_id = generateOnboardingId();
    if (!payload.status) payload.status = 'Planned';
    if (!payload.current_phase) payload.current_phase = 1;
    if (!payload.overall_completion_pct) payload.overall_completion_pct = 0;
    try {
      await onSave(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAttempt={handleCloseAttempt}>
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Onboarding' : 'New Onboarding'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label className="text-xs">Employee <span className="text-destructive">*</span></Label>
            <EmployeePicker
              value={data.employee_registry_id}
              onChange={handleEmployeeSelect}
              label=""
            />
          </div>

          {/* Role + Auto-Assign */}
          <div className="space-y-1.5">
            <Label className="text-xs">Role (auto-assigns training, policies, certs, SOPs)</Label>
            <Select value={data.role_id || ''} onValueChange={handleRoleSelect}>
              <SelectTrigger><SelectValue placeholder="Select role to auto-assign requirements" /></SelectTrigger>
              <SelectContent>
                {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.role_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {autoAssigning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Auto-assigning from role registry...
              </div>
            )}
            {assignmentSummary && (
              <div className="rounded-md bg-green-50 border border-green-200 p-2 text-xs text-green-700 space-y-0.5">
                <p className="font-medium">Auto-assigned from role:</p>
                <p>{assignmentSummary.training} training · {assignmentSummary.policies} policies · {assignmentSummary.certifications} certs · {assignmentSummary.sops} SOPs · {assignmentSummary.workflows} workflows · {assignmentSummary.tasks} tasks</p>
              </div>
            )}
          </div>

          {/* Department + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Input value={data.department || ''} onChange={e => updateField('department', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={data.status || 'Planned'} onValueChange={v => updateField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ONBOARDING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Supervisor + Start Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supervisor</Label>
              <Input value={data.supervisor || ''} onChange={e => updateField('supervisor', e.target.value)} placeholder="Supervisor name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={data.start_date || ''} onChange={e => updateField('start_date', e.target.value)} />
            </div>
          </div>

          {/* Employment Type + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Employment Type</Label>
              <Select value={data.employment_type || 'Full Time'} onValueChange={v => updateField('employment_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full Time">Full Time</SelectItem>
                  <SelectItem value="Part Time">Part Time</SelectItem>
                  <SelectItem value="Seasonal">Seasonal</SelectItem>
                  <SelectItem value="Contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input value={data.location || ''} onChange={e => updateField('location', e.target.value)} placeholder="Office/branch location" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={data.notes || ''} onChange={e => updateField('notes', e.target.value)} rows={2} placeholder="Onboarding notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !data.employee_registry_id}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {initialData ? 'Save Changes' : 'Create Onboarding'}
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