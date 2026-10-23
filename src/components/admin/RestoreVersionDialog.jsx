import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RotateCcw, Archive } from 'lucide-react';

/**
 * Confirmation dialog for restoring a historical version as a new active version.
 * Requires a reason before allowing the restore to proceed.
 */
export default function RestoreVersionDialog({
  open,
  onOpenChange,
  targetVersion,
  activeVersionNumber,
  newVersionNumber,
  roleLabel,
  restoring,
  onConfirm,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!targetVersion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" /> Restore {roleLabel || 'Role'} Configuration?
          </DialogTitle>
          <DialogDescription>
            This will create a new version from a historical one. The historical version will not be modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Active Version:</span>
              <span className="font-semibold">Version {activeVersionNumber ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Restore From:</span>
              <span className="font-semibold">Version {targetVersion.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New Version:</span>
              <span className="font-semibold text-primary">Version {newVersionNumber ?? '—'}</span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Version {newVersionNumber ?? '—'} will be created and become Active.
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Archive className="w-3 h-3" /> Version {activeVersionNumber ?? '—'} will be archived.
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Version {targetVersion.version} will remain unchanged.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restore-reason">Reason for restoring <span className="text-destructive">*</span></Label>
            <Textarea
              id="restore-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Previous dashboard layout was preferred by the warehouse team"
              rows={3}
              disabled={restoring}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={restoring}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || restoring}
          >
            {restoring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
            {restoring ? 'Restoring...' : 'Restore Version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}