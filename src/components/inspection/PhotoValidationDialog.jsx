import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, AlertTriangle, ShieldCheck, ShieldAlert, XCircle } from 'lucide-react';

/**
 * Dialog showing missing required photos before module submission.
 * Allows manager/lead override with reason.
 */
export default function PhotoValidationDialog({
  open,
  onClose,
  missingItems,
  onOverrideSubmit,
  moduleName,
}) {
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOverride = async () => {
    if (!overrideReason.trim()) return;
    setSubmitting(true);
    try {
      await onOverrideSubmit(overrideReason.trim());
      setOverrideMode(false);
      setOverrideReason('');
    } catch (e) {
      console.error('Override submit failed:', e);
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setOverrideMode(false);
    setOverrideReason('');
    onClose();
  };

  const totalMissing = missingItems.reduce((sum, item) => sum + item.missing, 0);
  const allowOverride = missingItems.every(item => item.allow_photo_override !== false);
  const reasonRequired = missingItems.some(item => item.photo_override_reason_required === true);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Missing Required Photos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {moduleName || 'This module'} cannot be completed because <strong>{missingItems.length} question(s)</strong> require photos that haven't been uploaded yet ({totalMissing} photo(s) missing total).
          </div>

          {!allowOverride && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p>One or more questions have manager override disabled. The required photos must be uploaded — this requirement cannot be bypassed.</p>
            </div>
          )}

          <ScrollArea className="max-h-[300px] pr-2">
            <div className="space-y-2">
              {missingItems.map((item, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium flex-1">{item.questionText}</p>
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      {item.current}/{item.required} photos
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.missing} more photo(s) needed
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>

          {!overrideMode ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Upload the missing photos to complete this module. {allowOverride ? `A manager or lead technician can override this requirement${reasonRequired ? ' — a written reason is required' : ' with a reason'}.` : 'Manager override is disabled for one or more questions — photos are mandatory.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide">
                Override Reason {reasonRequired && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why the required photos are missing and why this module should still be completed..."
                rows={3}
                className="text-sm"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={handleClose}>
            <XCircle className="w-4 h-4 mr-1" /> Go Back
          </Button>
          {!overrideMode ? (
            allowOverride ? (
              <Button variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setOverrideMode(true)}>
                <ShieldCheck className="w-4 h-4" /> Manager Override
              </Button>
            ) : null
          ) : (
            <Button
              className="gap-1.5 bg-amber-600 hover:bg-amber-700"
              onClick={handleOverride}
              disabled={(reasonRequired && !overrideReason.trim()) || submitting}
            >
              <ShieldCheck className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Confirm Override & Submit'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}