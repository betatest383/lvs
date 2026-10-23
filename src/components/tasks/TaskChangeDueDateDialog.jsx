import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TaskChangeDueDateDialog({ open, onOpenChange, task, onSuccess }) {
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setNewDate(task?.due_date || ''); setReason(''); }
  }, [open, task]);

  if (!task) return null;

  const handleSubmit = async () => {
    if (!newDate) return;
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'change_due_date',
        taskId: task.id,
        newDueDate: newDate,
        reason: reason || undefined,
      });
      if (response.data?.success) {
        toast.success('Due date changed to ' + newDate);
        onSuccess?.();
      } else {
        toast.error(response.data?.error || 'Failed to change due date');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change due date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Due Date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {task?.due_date && <p className="text-xs text-muted-foreground">Current due date: {task.due_date}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">New Due Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for due date change..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !newDate}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Change Due Date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}