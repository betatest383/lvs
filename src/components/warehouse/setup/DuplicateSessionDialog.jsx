import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, RotateCcw, FilePlus2, AlertTriangle } from 'lucide-react';
import { startAnotherSession } from '@/lib/warehouseSetupSession';
import { useToast } from '@/components/ui/use-toast';

export default function DuplicateSessionDialog({ info, onClose }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);

  if (!info) return null;

  const warehouseName = info.warehouse?.name || 'this warehouse';
  const sessions = info.sessions || [];

  const handleResume = (sessionId) => {
    onClose();
    setShowConfirm(false);
    setReason('');
    navigate(`/warehouse/setup/${sessionId}`);
  };

  const handleStartAnother = async () => {
    setCreating(true);
    try {
      const result = await startAnotherSession(
        info.warehouse.id,
        info.warehouse.name,
        sessions.map(s => s.id),
        reason.trim()
      );
      toast({
        title: 'New session created',
        description: `${result.session.session_id} created for ${info.warehouse.name}. Audit recorded.`,
      });
      onClose();
      setShowConfirm(false);
      setReason('');
      navigate(`/warehouse/setup/${result.session.id}`);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Failed to start another session',
        description: e.response?.data?.error || e.message,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (showConfirm) {
      setShowConfirm(false);
      return;
    }
    onClose();
  };

  return (
    <>
      {/* ── Primary dialog: Resume / Start Another / Cancel ── */}
      <Dialog open={!!info && !showConfirm} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md" onCloseAttempt={handleClose}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Existing Session Found
            </DialogTitle>
            <DialogDescription>
              An open setup session already exists for{' '}
              <span className="font-medium">{warehouseName}</span>. You can resume the
              existing session, start a separate session for the same warehouse, or cancel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                <div className="min-w-0">
                  <p className="text-sm font-mono font-medium">{s.session_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.status.replace(/_/g, ' ')} · Started by {s.started_by}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleResume(s.id)}>
                  <RotateCcw className="w-3 h-3" /> Resume
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="default"
              className="w-full"
              onClick={() => setShowConfirm(true)}
            >
              <FilePlus2 className="w-4 h-4" /> Start Another Session
            </Button>
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Second confirmation for "Start Another Session" ── */}
      <Dialog open={showConfirm} onOpenChange={(open) => !open && setShowConfirm(false)}>
        <DialogContent className="max-w-md" onCloseAttempt={() => setShowConfirm(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm: Start Another Session
            </DialogTitle>
            <DialogDescription>
              You are about to create a <strong>second concurrent session</strong> for{' '}
              <span className="font-medium">{warehouseName}</span>. This action is recorded
              in the audit history with your name, timestamp, warehouse, existing session IDs,
              and the new session ID.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
            <p><strong>Existing sessions:</strong> {sessions.map(s => s.session_id).join(', ') || 'None'}</p>
            <p><strong>Warehouse:</strong> {warehouseName}</p>
            <p><strong>User:</strong> You will be recorded as the initiator.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need a second session for this warehouse?"
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleStartAnother}
              disabled={creating}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
              Confirm &amp; Create New Session
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShowConfirm(false)} disabled={creating}>
              Go Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}