import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import { searchRoles, resolveRoles, searchEmployeesByRole, resolveEmployeesByRole } from '@/lib/taskSearchFunctions';
import { AlertTriangle } from 'lucide-react';

export default function ApprovalEscalationSection({ data, updateField }) {
  const [eligibleApprovers, setEligibleApprovers] = useState([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);

  // When an approval role is selected, load eligible active employees holding that role
  useEffect(() => {
    if (!data.assigned_role_id) {
      setEligibleApprovers([]);
      return;
    }
    setLoadingApprovers(true);
    searchEmployeesByRole('', 0, { roleId: data.assigned_role_id })
      .then(result => setEligibleApprovers(result.items))
      .catch(() => setEligibleApprovers([]))
      .finally(() => setLoadingApprovers(false));
  }, [data.assigned_role_id]);

  const selfApprovalProhibited = data.self_approval_prohibited !== false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Requires Approval</Label>
        <Switch checked={data.requires_approval || false} onCheckedChange={v => updateField('requires_approval', v)} />
      </div>

      {data.requires_approval && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Approval Role</Label>
            <RegistrySearchCombobox
              value={data.assigned_role_id || ''}
              onChange={(id) => updateField('assigned_role_id', id)}
              searchFn={searchRoles}
              resolveFn={resolveRoles}
              placeholder="Search approval roles…"
            />
          </div>

          {data.assigned_role_id && (
            <div className="space-y-1.5">
              <Label className="text-xs">Eligible Approvers</Label>
              {loadingApprovers ? (
                <p className="text-xs text-muted-foreground">Loading approvers…</p>
              ) : eligibleApprovers.length === 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  No active employees found with this role. Approval may be delayed.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {eligibleApprovers.map(a => (
                    <Badge key={a.id} variant="secondary" className="text-xs">{a.label}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-xs">Self-Approval Prohibited</Label>
            <Switch checked={selfApprovalProhibited} onCheckedChange={v => updateField('self_approval_prohibited', v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Escalation Level</Label>
              <Input type="number" min="0" value={data.escalation_level || 0} onChange={e => updateField('escalation_level', parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Escalation Due Date</Label>
              <Input type="date" value={data.escalation_due_date || ''} onChange={e => updateField('escalation_due_date', e.target.value)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}