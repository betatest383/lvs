import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  History, RotateCcw, CheckCircle2, XCircle, Clock, User,
  ArrowRight, FileText,
} from 'lucide-react';
import { loadWorkflowRevisions } from '@/lib/workflowRevisions';

const STAGE_LABELS = {
  inspection_setup: 'Inspection Setup',
  interior_inspection: 'Interior Inspection',
  exterior_inspection: 'Exterior Inspection',
  inspection_summary: 'Inspection Summary',
  ai_report_summary: 'AI Report Summary',
  recommendation_review: 'Recommendation Review',
  repair_system_review: 'Repair System Review',
  estimate_package_builder: 'Estimate Package Builder',
  scope_of_work: 'Scope of Work',
  dynamic_pricing: 'Dynamic Pricing',
  final_estimate_review: 'Final Estimate Review',
  proposal_builder: 'Proposal Builder',
  customer_presentation: 'Customer Presentation',
  customer_decision: 'Customer Decision',
  execution_plan: 'Execution Plan',
  complete_appointment: 'Complete Appointment',
};

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return ts; }
}

function RevisionEntry({ revision }) {
  const isApproved = revision.approval_status === 'approved';
  const isPending = revision.approval_status === 'pending';
  const isDenied = revision.approval_status === 'denied';

  return (
    <div className="rounded-lg border p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">
            {revision.stage_label || STAGE_LABELS[revision.stage_key] || revision.stage_key}
          </span>
        </div>
        <Badge
          variant="outline"
          className={
            isApproved ? 'bg-green-50 text-green-700 border-green-200' :
            isPending ? 'bg-amber-50 text-amber-700 border-amber-200' :
            isDenied ? 'bg-red-50 text-red-700 border-red-200' :
            'bg-muted text-muted-foreground'
          }
        >
          {isApproved ? 'Approved' : isPending ? 'Pending Approval' : isDenied ? 'Denied' : revision.approval_status}
        </Badge>
      </div>

      {/* Reason */}
      <p className="text-xs text-muted-foreground italic">
        "{revision.reason}"
      </p>

      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {revision.requested_by_name || revision.requested_by}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTimestamp(revision.requested_at)}
        </span>
        {revision.approved_by && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Approved by {revision.approved_by_name || revision.approved_by}
          </span>
        )}
      </div>

      {/* Downstream stages affected */}
      {revision.downstream_stages_marked_stale?.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Stages Marked Stale
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {revision.downstream_stages_marked_stale.map((s) => (
              <Badge key={s} variant="outline" className="text-[10px] py-0 px-1.5 bg-orange-50 text-orange-700 border-orange-200">
                {STAGE_LABELS[s] || s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Context flags */}
      <div className="flex items-center gap-2 flex-wrap">
        {revision.customer_presented_before_reopen && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
            <FileText className="w-2.5 h-2.5 mr-0.5" />
            Was Presented
          </Badge>
        )}
        {revision.customer_accepted_before_reopen && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-50 text-red-700 border-red-200">
            Was Accepted
          </Badge>
        )}
        {revision.scheduled_before_reopen && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
            Was Scheduled
          </Badge>
        )}
      </div>

      {/* Version transition */}
      {revision.previous_workflow_version != null && revision.new_workflow_version != null && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>v{revision.previous_workflow_version}</span>
          <ArrowRight className="w-2.5 h-2.5" />
          <span>v{revision.new_workflow_version}</span>
        </div>
      )}
    </div>
  );
}

export default function WorkflowRevisionHistory({ open, jobId, onClose }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);
    loadWorkflowRevisions(jobId)
      .then(setRevisions)
      .finally(() => setLoading(false));
  }, [open, jobId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Workflow Revision History
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 p-1">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading revision history...
            </div>
          ) : revisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No revisions have been recorded for this job.
            </div>
          ) : (
            revisions.map((rev) => (
              <RevisionEntry key={rev.id} revision={rev} />
            ))
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}