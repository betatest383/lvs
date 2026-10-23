import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle, RotateCcw, Loader2, ArrowRight,
  ShieldAlert, FileText, CheckCircle2, Lock, AlertCircle,
} from 'lucide-react';
import { previewReopen } from '@/lib/workflowRevisions';
import { isDependencyMapCompatible } from '@/lib/workflowStageDependencies';

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

export default function ReopenStageDialog({
  open, stageKey, stageState, workflow, userRole, isLead, isAssignedTech,
  onClose, onConfirm,
  affectedRecommendationIds, // optional: for precise scope invalidation
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapMismatch, setMapMismatch] = useState(false);

  useEffect(() => {
    if (!open || !stageKey || !workflow?.id) {
      setPreview(null);
      return;
    }
    setReason('');
    setMapMismatch(false);

    // ── Fetch server-authoritative preview ──
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const result = await previewReopen({
          job_id: workflow.job_id,
          workflow_id: workflow.id,
          stage_key: stageKey,
          expected_workflow_revision_version: workflow.workflow_revision_version || 0,
          affected_recommendation_ids: affectedRecommendationIds,
        });
        if (result?.success) {
          setPreview(result);
          // Fail safe: if the backend dependency_map_version doesn't match
          // the frontend, warn the user but still show the server's response.
          if (!isDependencyMapCompatible(result.dependency_map_version)) {
            setMapMismatch(true);
            console.warn('[ReopenStageDialog] Dependency map version mismatch — relying on backend preview only.');
          }
        }
      } catch (e) {
        console.error('[ReopenStageDialog] Preview failed:', e);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [open, stageKey, workflow?.id, workflow?.job_id, workflow?.workflow_revision_version, affectedRecommendationIds]);

  const stageLabel = STAGE_LABELS[stageKey] || stageKey;

  // Use the server-authoritative preview — never compute locally
  const impactedStages = preview?.impacted_stages || [];
  const canReopen = preview?.can_reopen ?? false;
  const requiresManagerApproval = preview?.requires_manager_approval ?? false;
  const warnings = preview?.warnings || [];
  const affectedOptionIds = preview?.affected_option_ids || [];
  const traceabilityComplete = preview?.traceability_complete ?? true;
  const traceabilityIncompleteReason = preview?.traceability_incomplete_reason || null;
  const packagesMissingTrace = preview?.packages_missing_trace || [];
  const affectedImmutableRecordIds = preview?.affected_immutable_record_ids || [];
  const customerPresented = preview?.customer_presented ?? false;
  const customerAccepted = preview?.customer_accepted ?? false;

  const canSubmit = reason.trim().length > 0 && !submitting && canReopen && !previewLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            Reopen {stageLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {previewLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading impact preview...</span>
            </div>
          )}

          {!previewLoading && !canReopen && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-700">
                {preview?.permission_reason || 'This stage cannot be reopened in its current state.'}
              </div>
            </div>
          )}

          {mapMismatch && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-xs text-amber-700">
                Dependency map version mismatch detected. Using server-authoritative preview only.
              </span>
            </div>
          )}

          {!previewLoading && canReopen && (
            <>
              {/* Impact Warning — from server */}
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Impact Warning
                </div>
                <p className="text-xs text-orange-700">
                  Reopening <strong>{stageLabel}</strong> will mark the following downstream stages
                  as <strong>stale</strong>. They remain viewable but will need to be re-completed.
                </p>

                {impactedStages.length > 0 ? (
                  <div className="space-y-1 mt-2">
                    {impactedStages.map((s) => (
                      <div key={s} className="flex items-center gap-1.5 text-xs text-orange-700">
                        <ArrowRight className="w-3 h-3" />
                        {STAGE_LABELS[s] || s}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-orange-700 mt-1">
                    No downstream stages will be affected — this is the last stage in the workflow.
                  </p>
                )}
              </div>

              {/* Affected options — precise scope invalidation */}
              {affectedOptionIds.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                  <div className="text-xs text-blue-700 font-medium mb-1">
                    Affected Proposal Options ({affectedOptionIds.length})
                  </div>
                  <p className="text-xs text-blue-600">
                    {traceabilityComplete
                      ? 'Only the options sharing the changed finding/recommendation will be affected.'
                      : 'Traceability incomplete — all active packages will be affected because precise isolation cannot be proven.'}
                    Immutable (presented/accepted) options will be preserved — new draft versions
                    will be created when you re-edit.
                  </p>
                </div>
              )}

              {/* Traceability incomplete warning */}
              {!traceabilityComplete && traceabilityIncompleteReason && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    Traceability Incomplete
                  </div>
                  <p className="text-xs text-amber-700">{traceabilityIncompleteReason}</p>
                  {packagesMissingTrace.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {packagesMissingTrace.length} package(s) missing trace data. Changing any option will affect ALL active packages.
                    </p>
                  )}
                </div>
              )}

              {/* Server warnings */}
              {warnings.map((w, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs text-amber-700">{w}</p>
                </div>
              ))}

              {/* Immutable record preservation notice */}
              {affectedImmutableRecordIds.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    {affectedImmutableRecordIds.length} immutable record(s) will be preserved.
                    Staleness is tracked in the workflow overlay — no historical data will be overwritten.
                  </span>
                </div>
              )}

              {customerAccepted && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1">
                    <ShieldAlert className="w-4 h-4" />
                    Customer Has Accepted
                  </div>
                  <p className="text-xs text-red-700">
                    The customer has already accepted a proposal. Reopening requires
                    <strong> manager approval</strong> — another manager must approve your request.
                    The original acceptance and signature will be preserved.
                  </p>
                </div>
              )}

              {requiresManagerApproval && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5" />
                  Manager approval required — you cannot approve your own request.
                </div>
              )}

              {/* Reason input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this stage needs to be reopened (e.g. 'Material quantity needs correction')"
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This reason will be recorded in the audit history and shown to other users.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {requiresManagerApproval ? 'Submit for Approval' : 'Confirm Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}