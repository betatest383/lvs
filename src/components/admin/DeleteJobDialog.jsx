import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function DeleteJobDialog({ open, onOpenChange, job, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setConfirmText(''); setReason(''); setSubmitting(false); };

  const handleOpenChange = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleConfirm = async () => {
    if (confirmText !== 'DELETE' || submitting) return;
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('manageJobDeletion', {
        action: 'delete',
        job_id: job.id,
        reason: reason.trim(),
      });
      toast.success('Job deleted');
      handleOpenChange(false);
      onDeleted?.(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Failed to delete job');
      setSubmitting(false);
    }
  };

  if (!job) return null;

  const address = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ');
  const jobNumber = job.crm_job_number || job.servicetitan_job_number || job.id;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Delete Job
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            You are about to soft-delete this job. It will disappear from active LVC OS views
            (searches, dropdowns, schedules, dashboards, and active job lists). All related
            appointments, estimates, inspections, tasks, invoices, and history are preserved.
            This does <strong>not</strong> cancel the job in ServiceTitan.
          </p>
          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
            <div><span className="text-muted-foreground">Job number:</span> <span className="font-mono font-medium">{jobNumber}</span></div>
            <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{job.customer_name || '—'}</span></div>
            <div><span className="text-muted-foreground">Address:</span> <span className="font-medium">{address || '—'}</span></div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Deletion reason (optional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this job being deleted?"
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmText !== 'DELETE' || submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}