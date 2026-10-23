import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ClipboardCheck, ArrowLeft } from 'lucide-react';

export default function RecommendationReviewBlockDialog({
  open, onClose, onStartReview, onReturnToHub, deficiencyCount, reviewedCount,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Recommendation Review Required
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-900">
              Deficiencies were found during the inspection. Review each deficiency and determine
              the proper disposition before completing this appointment.
            </p>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Deficiencies Found:</span>
            <span className="font-semibold">{deficiencyCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reviewed:</span>
            <span className={`font-semibold ${reviewedCount === deficiencyCount ? 'text-green-600' : 'text-amber-600'}`}>
              {reviewedCount} / {deficiencyCount}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="gap-1" onClick={onReturnToHub || onClose}>
            <ArrowLeft className="w-4 h-4" /> Return to Job Hub
          </Button>
          <Button className="gap-1" onClick={onStartReview}>
            <ClipboardCheck className="w-4 h-4" /> Start Recommendation Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}