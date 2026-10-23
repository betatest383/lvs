import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Unlock, Loader2 } from 'lucide-react';

/**
 * ReopenInspectionDialog — lets an authorized manager reopen a completed
 * inspection to add missing documentation. Preserves the original submission,
 * answers, findings, signatures, and reports. Marks the inspection summary/
 * report stale so it must be regenerated after new documentation is added.
 * The prior management override is preserved in the audit trail.
 */
export default function ReopenInspectionDialog({ open, onClose, onReopen }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReopen = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onReopen(reason.trim());
      setReason('');
      onClose();
    } catch (e) {
      console.error('Reopen failed:', e);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="w-5 h-5 text-blue-600" />
            Reopen Inspection — Add Missing Documentation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reopening preserves all original answers, findings, signatures, and reports. The inspection summary/report will be marked stale and must be regenerated after new documentation is added. Any prior management override is preserved in the audit trail.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this completed inspection is being reopened..."
              rows={3}
              className="text-sm"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReopen} disabled={submitting || !reason.trim()} className="gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
            Reopen for Documentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}