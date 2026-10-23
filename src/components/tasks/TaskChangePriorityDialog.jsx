import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TASK_PRIORITIES } from '@/lib/enterpriseTaskConstants';

export default function TaskChangePriorityDialog({ open, onOpenChange, task, onSuccess }) {
  const [newPriority, setNewPriority] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setNewPriority(task?.priority || ''); setReason(''); }
  }, [open, task]);

  if (!task) return null;

  const handleSubmit = async () => {
    if (!newPriority || newPriority === task?.priority) return;
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'change_priority',
        taskId: task.id,
        newPriority,
        reason: reason || undefined,
      });
      if (response.data?.success) {
        toast.success('Priority changed to ' + newPriority);
        onSuccess?.();
      } else {
        toast.error(response.data?.error || 'Failed to change priority');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change priority');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Priority</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {task?.priority && <p className="text-xs text-muted-foreground">Current priority: {task.priority}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">New Priority <span className="text-destructive">*</span></Label>
            <Select value={newPriority} onValueChange={setNewPriority}>
              <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
              <SelectContent>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for priority change..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !newPriority || newPriority === task?.priority}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Change Priority
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}