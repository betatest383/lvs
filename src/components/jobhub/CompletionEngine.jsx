import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle, Flag } from 'lucide-react';

export default function CompletionEngine({ open, onClose, checklist, onComplete, hubStatus, onAddMissingPhotos }) {
  const allPass = checklist.every(item => item.pass);
  const criticalPass = checklist.filter(c => c.critical).every(item => item.pass);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-accent" /> Smart Completion Engine
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground mb-3">
            Verifying all required actions are complete before allowing appointment completion.
          </p>

          {checklist.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded-lg ${item.pass ? 'bg-green-50' : item.critical ? 'bg-red-50' : 'bg-amber-50'}`}
            >
              {item.pass ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : item.critical ? (
                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                {!item.pass && item.detail && (
                  <p className={`text-xs ${item.critical ? 'text-red-600' : 'text-amber-700'}`}>{item.detail}</p>
                )}
              </div>
              {!item.pass && item.action === 'add_missing_photos' && onAddMissingPhotos && (
                <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700" onClick={onAddMissingPhotos}>
                  Add Photos
                </Button>
              )}
              {item.critical && !item.pass && (
                <span className="text-[10px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">BLOCKING</span>
              )}
            </div>
          ))}
        </div>

        {!allPass && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {criticalPass
                ? 'All critical items are complete. Non-critical items can be skipped, but they will be logged.'
                : 'Some blocking items are incomplete. Complete them before finishing the appointment.'}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!criticalPass || hubStatus === 'completed'}
            onClick={onComplete}
            className="gap-1"
          >
            <Flag className="w-4 h-4" /> {hubStatus === 'completed' ? 'Already Completed' : 'Complete Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}