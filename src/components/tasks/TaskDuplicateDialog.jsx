import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const COPIED_FIELDS = ['Title', 'Description', 'Task type', 'Priority', 'Department', 'Due date', 'Related record', 'Notes', 'Approval settings'];
const EXCLUDED_FIELDS = ['Task number', 'Status history', 'Approval history', 'Comments', 'Completion data', 'Started date', 'Completed date'];

export default function TaskDuplicateDialog({ open, onOpenChange, task, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  if (!task) return null;

  const handleDuplicate = async () => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'duplicate',
        taskId: task.id,
      });
      if (response.data?.success) {
        toast.success('Task duplicated: ' + (response.data.task?.task_number || ''));
        onOpenChange(false);
        if (onSuccess) onSuccess();
        if (response.data.task?.id) navigate(`/tasks/detail/${response.data.task.id}`);
      } else {
        toast.error(response.data?.error || 'Failed to duplicate task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to duplicate task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate Task</DialogTitle>
          <DialogDescription>Creates a new live task with a new task number.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">Source: <span className="font-medium">{task?.task_number || task?.title}</span></p>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs font-medium text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Copied:</p>
            <p className="text-xs text-muted-foreground">{COPIED_FIELDS.join(', ')}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs font-medium text-red-600 flex items-center gap-1"><Copy className="w-3 h-3" /> Not copied:</p>
            <p className="text-xs text-muted-foreground">{EXCLUDED_FIELDS.join(', ')}</p>
          </div>
          <p className="text-xs text-muted-foreground">The new task will have status: <span className="font-medium">New</span></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleDuplicate} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            Duplicate Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}