import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RefreshCw, Loader2, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { parseJSON } from '@/lib/onboardingConstants';

export default function RoleChangeReview() {
  const [records, setRecords] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [diff, setDiff] = useState(null);
  const [managerApproved, setManagerApproved] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.EmployeeOnboarding.list('-created_date', 500),
      base44.entities.RoleRegistry.list('-created_date', 500),
    ]).then(([recs, rls]) => {
      setRecords(recs || []);
      setRoles(rls || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleRecordSelect = (recordId) => {
    const rec = records.find(r => r.id === recordId);
    setSelectedRecord(rec || null);
    setDiff(null);
    setManagerApproved(false);
    setSelectedRoleId('');
  };

  const handleRoleSelect = async (roleRecordId) => {
    const role = roles.find(r => r.id === roleRecordId);
    if (!role || !selectedRecord) return;
    setSelectedRoleId(role.role_id);
    setManagerApproved(false);

    const [trainings, policies, certs, sops, workflows] = await Promise.all([
      base44.entities.TrainingRegistry.list('-created_date', 500),
      base44.entities.PolicyRegistry.list('-created_date', 500),
      base44.entities.CertificationRegistry.list('-created_date', 500),
      base44.entities.SopRegistry.list('-created_date', 500),
      base44.entities.WorkflowRegistry.list('-created_date', 500),
    ]);

    const matchRole = (arr) => arr || [];
    const newTrainings = (trainings || []).filter(t => t.status === 'Active' && matchRole(t.required_roles).some(r => r === role.role_name || r === role.role_id));
    const newPolicies = (policies || []).filter(p => p.status === 'Active' && p.requires_acknowledgment && matchRole(p.related_roles).some(r => r === role.role_name || r === role.role_id));
    const newCerts = (certs || []).filter(c => c.status === 'Active' && matchRole(c.required_roles).some(r => r === role.role_name || r === role.role_id));
    const sopIds = role.required_sops || [];
    const newSops = (sops || []).filter(s => sopIds.includes(s.sop_id));
    const wfIds = role.required_workflows || [];
    const newWorkflows = (workflows || []).filter(w => wfIds.includes(w.workflow_id));

    setDiff({
      role,
      newTrainings: newTrainings.map(t => t.training_name),
      newPolicies: newPolicies.map(p => p.policy_name),
      newCerts: newCerts.map(c => c.certification_name),
      newSops: newSops.map(s => s.title),
      newWorkflows: newWorkflows.map(w => w.title),
      newSoftware: role.required_software || [],
      newEquipment: role.required_equipment_package || '',
      newDashboard: role.dashboard || '',
      newPortal: role.default_portal || '',
      newPermissions: role.permission_level || '',
    });
  };

  const applyRoleChange = async () => {
    if (!selectedRecord || !diff || !managerApproved) return;
    setApplying(true);
    try {
      const role = diff.role;
      const phase3 = parseJSON(selectedRecord.phase3_training, []);
      const phase4 = parseJSON(selectedRecord.phase4_policies, []);
      const phase5 = parseJSON(selectedRecord.phase5_certifications, []);
      const phase8 = parseJSON(selectedRecord.phase8_dept_training, []);

      diff.newTrainings.forEach(name => {
        if (!phase3.some(t => t.label === name)) {
          phase3.push({ label: name, completed: false, completed_at: null, status: 'Assigned', quiz_score: null, notes: '' });
        }
      });
      diff.newPolicies.forEach(name => {
        if (!phase4.some(p => p.label === name)) {
          phase4.push({ label: name, completed: false, completed_at: null, status: 'Assigned', notes: '' });
        }
      });
      diff.newCerts.forEach(name => {
        if (!phase5.some(c => c.label === name)) {
          phase5.push({ label: name, completed: false, completed_at: null, status: 'Required', notes: '' });
        }
      });
      [
        ...diff.newSops.map(s => ({ label: s, type: 'SOP', completed: false, completed_at: null, notes: '' })),
        ...diff.newWorkflows.map(w => ({ label: w, type: 'Workflow', completed: false, completed_at: null, notes: '' })),
      ].forEach(item => {
        if (!phase8.some(p => p.label === item.label)) {
          phase8.push(item);
        }
      });

      const roleChangeReview = parseJSON(selectedRecord.role_change_review, []);
      roleChangeReview.push({
        date: new Date().toISOString(),
        old_role: selectedRecord.primary_role,
        new_role: role.role_name,
        new_items: {
          training: diff.newTrainings,
          policies: diff.newPolicies,
          certifications: diff.newCerts,
          sops: diff.newSops,
          workflows: diff.newWorkflows,
        },
        approved: true,
      });

      await base44.entities.EmployeeOnboarding.update(selectedRecord.id, {
        primary_role: role.role_name,
        role_id: role.role_id,
        department: role.department || selectedRecord.department,
        assigned_equipment_package: role.required_equipment_package || selectedRecord.assigned_equipment_package,
        assigned_software: role.required_software || selectedRecord.assigned_software,
        phase3_training: JSON.stringify(phase3),
        phase4_policies: JSON.stringify(phase4),
        phase5_certifications: JSON.stringify(phase5),
        phase8_dept_training: JSON.stringify(phase8),
        role_change_review: JSON.stringify(roleChangeReview),
      });

      toast.success('Role change applied — new items added to onboarding');
      setSelectedRecord(null);
      setDiff(null);
      setManagerApproved(false);
      setSelectedRoleId('');
    } catch {
      toast.error('Failed to apply role change');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Role Change Review</h1>
        <p className="text-muted-foreground text-sm">Recommend new training, certifications, equipment, and permissions for promotions and transfers.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Select Onboarding Record</Label>
            <Select value={selectedRecord?.id || ''} onValueChange={handleRecordSelect}>
              <SelectTrigger><SelectValue placeholder="Select employee onboarding record" /></SelectTrigger>
              <SelectContent>
                {records.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.employee_name} — {r.primary_role} ({r.onboarding_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRecord && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">New Role</Label>
              <Select value={selectedRoleId} onValueChange={handleRoleSelect}>
                <SelectTrigger><SelectValue placeholder="Select new role" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.role_name} ({r.role_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {diff && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <RefreshCw className="w-4 h-4 text-accent" /> Role Change: {selectedRecord.primary_role} <ArrowRight className="w-4 h-4" /> {diff.role.role_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border bg-card">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">New Training Required</h4>
                {diff.newTrainings.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <ul className="space-y-1">{diff.newTrainings.map((t, i) => <li key={i} className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {t}</li>)}</ul>
                )}
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">New Policies</h4>
                {diff.newPolicies.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <ul className="space-y-1">{diff.newPolicies.map((p, i) => <li key={i} className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {p}</li>)}</ul>
                )}
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">New Certifications</h4>
                {diff.newCerts.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <ul className="space-y-1">{diff.newCerts.map((c, i) => <li key={i} className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {c}</li>)}</ul>
                )}
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">New SOPs & Workflows</h4>
                {diff.newSops.length === 0 && diff.newWorkflows.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <ul className="space-y-1">
                    {diff.newSops.map((s, i) => <li key={`s${i}`} className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {s}</li>)}
                    {diff.newWorkflows.map((w, i) => <li key={`w${i}`} className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {w}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">Changes Summary</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-800">
                <div>Equipment: {diff.newEquipment || '—'}</div>
                <div>Software: {diff.newSoftware.length} items</div>
                <div>Dashboard: {diff.newDashboard}</div>
                <div>Portal: {diff.newPortal}</div>
                <div>Permissions: {diff.newPermissions}</div>
              </div>
              <p className="text-xs text-amber-700 mt-2">Previous assignments will NOT be removed. New items will be appended.</p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Checkbox checked={managerApproved} onCheckedChange={setManagerApproved} />
              <Label className="text-sm">I approve this role change and acknowledge the new requirements.</Label>
            </div>

            <Button
              onClick={applyRoleChange}
              disabled={!managerApproved || applying}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Apply Role Change
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}