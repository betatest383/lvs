import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, FilePlus2, Archive, Clock, MapPin, AlertTriangle, ChevronRight, X } from 'lucide-react';

const STEP_LABELS = ['Create Location', 'Add Bins', 'Assign Materials', 'Inventory Count', 'Review', 'Activate'];

function SessionDetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

export default function SessionResumeDialog({ open, session, onResume, onArchiveAndStartNew, onCancel }) {
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  if (!session) return null;

  const step = session.current_step || 0;
  const progressPct = Math.round(((step + 1) / 6) * 100);
  const createdDate = session.started_at || session.created_date;

  const handleStartNew = () => setShowArchiveConfirm(true);
  const handleConfirmArchive = () => {
    setShowArchiveConfirm(false);
    onArchiveAndStartNew();
  };
  const handleCancelArchive = () => setShowArchiveConfirm(false);
  const handleDialogClose = (open) => {
    if (!open && onCancel) onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-lg" onCloseAttempt={onCancel}>
        {!showArchiveConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Unfinished Warehouse Setup Found
              </DialogTitle>
              <DialogDescription>
                You have an in-progress setup session. Would you like to resume it or start a new one?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg border bg-muted/30 space-y-2.5">
                <SessionDetailRow icon={MapPin} label="Setup Location" value={session.warehouse_location_name || 'No location set'} />
                <SessionDetailRow icon={Clock} label="Date Created" value={createdDate ? new Date(createdDate).toLocaleString() : 'N/A'} />
                <SessionDetailRow icon={ChevronRight} label="Current Step" value={`${step + 1} of 6 — ${STEP_LABELS[step] || 'Unknown'}`} />
                <SessionDetailRow icon={Archive} label="Created By" value={session.started_by || 'N/A'} />

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-bold">{progressPct}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-accent h-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onResume} className="w-full" size="lg">
                <Play className="w-4 h-4" /> Resume Setup
              </Button>
              <Button onClick={handleStartNew} variant="outline" className="w-full" size="lg">
                <FilePlus2 className="w-4 h-4" /> Start New Setup
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Archive Existing Setup?
              </DialogTitle>
              <DialogDescription>
                An unfinished warehouse setup already exists. What would you like to do?
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
              Starting a new setup will archive the existing session. The archived session will be
              preserved for audit purposes but cannot be resumed. Its assigned materials and counts
              will not carry over to the new session.
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={() => setShowArchiveConfirm(false)} variant="outline" className="w-full">
                Resume Existing Setup
              </Button>
              <Button onClick={handleConfirmArchive} variant="destructive" className="w-full">
                <Archive className="w-4 h-4" /> Archive Existing & Start New
              </Button>
              <Button onClick={handleCancelArchive} variant="ghost" className="w-full">
                <X className="w-4 h-4" /> Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}