import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, FolderOpen } from 'lucide-react';

/**
 * Success dialog shown after a version restore completes.
 * Shows what happened and offers to open the newly active version in the builder.
 */
export default function RestoreSuccessDialog({
  open,
  onOpenChange,
  result,
  onOpenActive,
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" /> Configuration Restored
          </DialogTitle>
          <DialogDescription>The restore completed successfully.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">New Active Version:</span>
              <span className="font-semibold text-green-600">Version {result.newVersionNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Restored From:</span>
              <span className="font-semibold">Version {result.restoredFromVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Archived:</span>
              <span className="font-semibold text-muted-foreground">Version {result.replacedVersion}</span>
            </div>
            {result.restoredBy && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restored By:</span>
                <span className="font-semibold">{result.restoredBy}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => { onOpenChange(false); onOpenActive(); }}>
            <FolderOpen className="w-4 h-4 mr-1" /> Open Active Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}