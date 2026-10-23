import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import EmployeePicker from '@/components/shared/EmployeePicker';
import { toast } from 'sonner';

export default function TaskReassignDialog({ open, onOpenChange, task, onSuccess }) {
  const [selection, setSelection] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setSelection(null); setReason(''); }
  }, [open]);

  if (!task) return null;

  const handleSubmit = async () => {
    if (!selection?.employee_registry_id) return;
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'reassign',
        taskId: task.id,
        taskData: {
          assigned_employee_registry_id: selection.employee_registry_id,
          assigned_to: selection.employee_name,
          assigned_to_email: selection.employee_email,
          assigned_to_linked_user_id: selection.linked_user_id,
          assigned_role: selection.primary_role,
          assigned_department: selection.department,
        },
        reason: reason || undefined,
      });
      if (response.data?.success) {
        toast.success('Task reassigned to ' + selection.employee_name);
        onSuccess?.();
      } else {
        toast.error(response.data?.error || 'Failed to reassign task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">New Assignee <span className="text-destructive">*</span></Label>
            <EmployeePicker value={selection?.employee_registry_id} onChange={setSelection} label="" />
          </div>
          {task?.assigned_to && <p className="text-xs text-muted-foreground">Current assignee: {task.assigned_to}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for reassignment..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !selection?.employee_registry_id}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}