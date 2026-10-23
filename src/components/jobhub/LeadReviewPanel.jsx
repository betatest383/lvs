import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Eye, CheckCircle2, XCircle, User, Clock } from 'lucide-react';
import moment from 'moment';
import { useDirtyCloseGuard } from '@/components/ui/useDirtyCloseGuard';
import DirtyCloseWarning from '@/components/ui/DirtyCloseWarning';

export default function LeadReviewPanel({ stages, workflow, onApprove, onReject, isLead }) {
  const [reviewing, setReviewing] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewAction, setReviewAction] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const { handleCloseAttempt, showWarning, confirmDiscard, cancelDiscard } = useDirtyCloseGuard(isDirty, () => setReviewing(null));

  const moduleAssignments = JSON.parse(workflow?.module_assignments || '{}');

  const modulesNeedingReview = [
    { key: 'interior', label: 'Interior Inspection', stageKey: 'interior_inspection' },
    { key: 'exterior', label: 'Exterior Inspection', stageKey: 'exterior_inspection' },
  ].filter(m => stages[m.stageKey]?.status === 'needs_lead_review');

  if (modulesNeedingReview.length === 0) return null;

  const handleReview = (module, action) => {
    setReviewing(module);
    setReviewAction(action);
    setReviewNotes('');
    setIsDirty(false);
  };

  const confirmReview = async () => {
    if (reviewAction === 'approve') {
      await onApprove(reviewing.key, reviewNotes);
    } else {
      await onReject(reviewing.key, reviewNotes);
    }
    setReviewing(null);
    setReviewNotes('');
    setIsDirty(false);
  };

  return (
    <>
      <Card className="border-0 shadow-sm border-l-4 border-l-purple-400 bg-purple-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-purple-900">
            <Eye className="w-4 h-4" /> Lead Technician Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {modulesNeedingReview.map(mod => {
            const assignment = moduleAssignments[mod.key] || {};
            return (
              <div key={mod.key} className="rounded-lg border border-purple-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{mod.label}</p>
                  <Badge className="bg-purple-100 text-purple-700 text-[10px]">Awaiting Review</Badge>
                </div>
                {assignment.assigned_to_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" /> Submitted by {assignment.assigned_to_name}
                  </p>
                )}
                {assignment.last_updated && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {moment(assignment.last_updated).format('h:mm A')}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="gap-1 flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleReview(mod, 'approve')}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 flex-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleReview(mod, 'reject')}>
                    <XCircle className="w-3.5 h-3.5" /> Return
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) handleCloseAttempt(); }}>
        <DialogContent onCloseAttempt={handleCloseAttempt}>
          <DialogHeader>
            <DialogTitle>{reviewAction === 'approve' ? 'Approve' : 'Return'} {reviewing?.label}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reviewNotes}
            onChange={e => { setReviewNotes(e.target.value); setIsDirty(true); }}
            placeholder={reviewAction === 'approve'
              ? 'Optional notes for the crew member...'
              : 'Explain what needs to be fixed or re-inspected...'}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt}>Cancel</Button>
            <Button
              className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={confirmReview}
            >
              {reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DirtyCloseWarning
        open={showWarning}
        onContinueEditing={cancelDiscard}
        onDiscardChanges={confirmDiscard}
      />
    </>
  );
}