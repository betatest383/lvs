import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatProcessingAge } from '@/lib/staleProcessingUtils';

/**
 * Confirmation dialog for recovering a stale webhook processing event.
 *
 * Only available for stale events (stuck in "processing" beyond the timeout).
 * Uses the backend manageServiceTitanWebhookEvent function with action=recover_processing.
 */
export default function RecoverProcessingDialog({ event, open, onOpenChange, onRecovered }) {
  const [recovering, setRecovering] = useState(false);

  if (!event) return null;

  const handleRecover = async () => {
    setRecovering(true);
    try {
      const response = await base44.functions.invoke('manageServiceTitanWebhookEvent', {
        action: 'recover_processing',
        webhook_event_id: event.id,
        reason: `Manual recovery from Webhook Monitor`,
      });
      if (response.data?.success) {
        toast.success(
          `Stale processing recovered (recovery #${response.data.recovery_count || 1})`
        );
        onOpenChange(false);
        if (onRecovered) onRecovered();
      } else {
        toast.error(response.data?.error || 'Recovery failed');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to recover stale processing');
    } finally {
      setRecovering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Recover Stale Processing
          </DialogTitle>
          <DialogDescription>
            This event has been stuck in processing beyond the timeout and will be
            recovered back to "received" for reprocessing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Event Type:</span>
            <code className="text-xs">{event.event_type}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Processing Age:</span>
            <span className="font-medium text-amber-600">{formatProcessingAge(event)}</span>
          </div>
          {event.processing_claim_id && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Claim ID:</span>
              <code className="text-xs">{event.processing_claim_id}</code>
            </div>
          )}
          {event.processing_claimed_by && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Claimed By:</span>
              <span className="text-xs">{event.processing_claimed_by}</span>
            </div>
          )}
          {(event.processing_recovery_count || 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Previous Recoveries:</span>
              <Badge variant="outline">{event.processing_recovery_count}</Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={recovering}>
            Cancel
          </Button>
          <Button onClick={handleRecover} disabled={recovering}>
            {recovering ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Recovering...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 mr-1" /> Recover Processing
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}