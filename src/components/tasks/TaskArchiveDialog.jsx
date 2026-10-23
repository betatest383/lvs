import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Archive } from 'lucide-react';
import { toast } from 'sonner';

export default function TaskArchiveDialog({ open, onOpenChange, task, onSuccess }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);

  const isActive = task && ['Draft', 'New'].includes(task.status);

  useEffect(() => {
    if (open) { setReason(''); setConfirmActive(false); }
  }, [open]);

  if (!task) return null;

  const handleArchive = async () => {
    if (isActive && !confirmActive) {
      setConfirmActive(true);
      return;
    }
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'archive',
        taskId: task.id,
        archiveReason: reason || undefined,
      });
      if (response.data?.success) {
        toast.success('Task archived');
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(response.data?.error || 'Failed to archive task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Archive Task</DialogTitle>
          <DialogDescription>Archived tasks remain searchable and auditable but are excluded from active lists.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isActive && confirmActive && (
            <p className="text-sm text-amber-600 font-medium">This task is still active ({task?.status}). Are you sure you want to archive it?</p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Archive Reason {isActive ? '(required)' : '(optional)'}</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for archiving..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleArchive} disabled={saving || (isActive && confirmActive && !reason.trim())}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
            {isActive && !confirmActive ? 'Archive' : 'Confirm Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}