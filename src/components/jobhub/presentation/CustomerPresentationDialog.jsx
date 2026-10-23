import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Presentation, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import PresentationInspectionReport from './PresentationInspectionReport';
import PresentationFindings from './PresentationFindings';
import PresentationRecommendations from './PresentationRecommendations';
import PresentationProposalOptions from './PresentationProposalOptions';
import PresentationCustomerNotes from './PresentationCustomerNotes';
import PresentationChecklist from './PresentationChecklist';
import PresentationCustomerDecision from './PresentationCustomerDecision';
import PresentationDiagnostics from './PresentationDiagnostics';
import StalePackageWarning from '@/components/jobhub/StalePackageWarning';
import { getStalePackages, validatePackageForPresentation, validatePackageForAcceptance } from '@/lib/estimatePackageWorkflow';
import { acceptProposalOptionServer, declineAllOptionsServer, requestRevisionsServer } from '@/lib/workflowRevisions';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

const PRESENTATION_SECTIONS = [
  { key: 'report', label: 'Inspection Report' },
  { key: 'findings', label: 'Findings' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'proposal', label: 'Proposal Options' },
  { key: 'notes', label: 'Customer Notes' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'decision', label: 'Customer Decision' },
];

const CHECKLIST_KEYS = [
  'reviewed_inspection_report', 'reviewed_photos', 'explained_findings',
  'explained_recommended_repairs', 'presented_proposal_options',
  'reviewed_selected_option_price', 'discussed_scheduling_options',
  'answered_customer_questions',
];

export default function CustomerPresentationDialog({
  open, onClose, onComplete, onPresentationComplete, jobId, workflow, derived, effectiveName, todaysAppointment,
  refreshTrigger = 0, signatureCaptured = false, signatureInfo = null,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [presentation, setPresentation] = useState(null);
  const [optionTemplates, setOptionTemplates] = useState([]);
  const [selectedTier, setSelectedTier] = useState(null);

  // Form state
  const [notes, setNotes] = useState({});
  const [checklist, setChecklist] = useState({});
  const [customerDecision, setCustomerDecision] = useState('pending');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [reportDiagnostics, setReportDiagnostics] = useState(null);
  const [decisionDiagnostics, setDecisionDiagnostics] = useState(null);
  const [stalePackages, setStalePackages] = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [validationError, setValidationError] = useState(null);
  const { isDevToolsVisible } = useDeveloperMode();

  // Load or create CustomerPresentation record + proposal option templates
  useEffect(() => {
    if (!open || !jobId) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load existing presentation
        const existing = await base44.entities.CustomerPresentation
          .filter({ job_id: jobId }).catch(() => []);

        let pres = existing[0] || null;

        if (!pres) {
          // Create new presentation record
          pres = await base44.entities.CustomerPresentation.create({
            job_id: jobId,
            appointment_id: todaysAppointment?.id || '',
            customer_id: derived.estimate?.customer_id || '',
            customer_name: derived.estimate?.customer_name || '',
            inspection_id: derived.inspectionSetup?.id || '',
            draft_estimate_id: derived.estimate?.id || '',
            presentation_status: 'in_progress',
            started_at: new Date().toISOString(),
            presented_by: effectiveName,
            checklist_results: JSON.stringify({}),
            customer_questions: '',
            customer_concerns: '',
            requested_changes: '',
            office_follow_up_notes: '',
            customer_decision: 'pending',
            customer_decision_notes: '',
          });
        } else if (pres.presentation_status !== 'complete') {
          // Mark in progress if re-opening
          pres = await base44.entities.CustomerPresentation.update(pres.id, {
            presentation_status: 'in_progress',
          });
        }

        setPresentation(pres);

        // Load EstimatePackage records to detect stale packages
        const packages = await base44.entities.EstimatePackage
          .filter({ job_id: jobId, is_authoritative: true })
          .catch(() => []);
        setStalePackages(getStalePackages(packages));
        setAllPackages(packages);

        // Backend validation: ensure all packages are ready for customer presentation
        // Checks pricing_status, proposal_stale, is_authoritative, scope exists, totals match
        try {
          const validation = await validatePackageForPresentation(jobId);
          if (!validation.valid) {
            const allReasons = (validation.packages || []).flatMap(p => p.reasons || []);
            setValidationError(allReasons);
          } else {
            setValidationError(null);
          }
        } catch (err) {
          console.error('[Presentation] Package validation failed:', err);
          // Don't block on validation service failure — UI stale warning still shows
          setValidationError(null);
        }

        // Restore form state from existing record
        if (pres.checklist_results) {
          try { setChecklist(JSON.parse(pres.checklist_results)); } catch { /* ignore */ }
        }
        setNotes({
          customer_questions: pres.customer_questions || '',
          customer_concerns: pres.customer_concerns || '',
          requested_changes: pres.requested_changes || '',
          office_follow_up_notes: pres.office_follow_up_notes || '',
        });
        setCustomerDecision(pres.customer_decision || 'pending');
        setDecisionNotes(pres.customer_decision_notes || '');
        setSelectedTier(pres.proposal_level || null);

        // If presentation is already complete, jump to the decision section
        if (pres.presentation_status === 'complete') {
          setActiveSection(PRESENTATION_SECTIONS.findIndex(s => s.key === 'decision'));
        } else {
          setActiveSection(0);
        }

        // Load ProposalOptionTemplates
        const draftItems = derived.draftEstimateItems || [];
        const templateIds = [...new Set(
          draftItems.map(i => i.repair_recommendation_template_id).filter(Boolean)
        )];
        if (templateIds.length > 0) {
          const allOptions = [];
          for (const tid of templateIds) {
            const opts = await base44.entities.ProposalOptionTemplate
              .filter({ linked_repair_recommendation_template_id: tid, is_active: true })
              .catch(() => []);
            allOptions.push(...opts);
          }
          allOptions.sort((a, b) => {
            const order = { good: 0, better: 1, best: 2 };
            return (order[a.proposal_level] ?? 3) - (order[b.proposal_level] ?? 3)
              || (a.display_order || 0) - (b.display_order || 0);
          });
          setOptionTemplates(allOptions);
        } else {
          setOptionTemplates([]);
        }

        // Determine selected tier from draft estimate items if not set
        if (!pres.proposal_level && draftItems.length > 0) {
          const tieredItem = draftItems.find(i => i.proposal_tier && i.proposal_tier !== 'standalone');
          if (tieredItem) setSelectedTier(tieredItem.proposal_tier);
        }
      } catch (e) {
        toast.error('Failed to load presentation: ' + e.message);
      }
      setLoading(false);
    };
    load();
  }, [open, jobId, derived.estimate?.id, derived.inspectionSetup?.id, effectiveName, todaysAppointment?.id, refreshTrigger]);

  // Auto-save notes periodically (debounced via savePresentation)
  const handleNotesChange = useCallback((key, value) => {
    setNotes(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleChecklistToggle = useCallback((key) => {
    setChecklist(prev => ({
      ...prev,
      [key]: {
        checked: !prev[key]?.checked,
        checked_at: !prev[key]?.checked ? new Date().toISOString() : null,
      },
    }));
  }, []);

  const handleSelectTier = useCallback((tier) => {
    setSelectedTier(tier);
  }, []);

  const handleViewFullReport = useCallback(async () => {
    const reportId = derived.inspectionReport?.id;
    const appointmentId = todaysAppointment?.id;
    const inspectionId = derived.inspectionSetup?.id || derived.inspectionReport?.inspection_id;
    const customerId = derived.estimate?.customer_id || derived.inspectionReport?.customer_id;

    // Validate required IDs — don't send a bad request
    if (!reportId && !jobId) {
      const diag = {
        error: 'Inspection report cannot be opened because required report data is missing.',
        appointment_id: appointmentId || '—',
        job_id: jobId || '—',
        inspection_id: inspectionId || '—',
        report_id: reportId || '—',
        customer_id: customerId || '—',
        payload: { report_id: reportId, job_id: jobId },
        function: 'generateReportPdf',
        error_response: 'No report_id or job_id available to locate the inspection report.',
      };
      setReportDiagnostics(diag);
      toast.error('Inspection report cannot be opened because required report data is missing.');
      return;
    }

    // If a cached PDF URL exists, open it directly
    if (derived.inspectionReport?.pdf_url) {
      window.open(derived.inspectionReport.pdf_url, '_blank');
      setReportDiagnostics(null);
      return;
    }

    try {
      toast.info('Generating inspection report PDF...');
      const payload = { report_id: reportId, job_id: jobId };
      const response = await base44.functions.invoke('generateReportPdf', payload);

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        setReportDiagnostics(null);
      } else if (response.data?.error) {
        setReportDiagnostics({
          error: response.data.error,
          appointment_id: appointmentId || '—',
          job_id: jobId || '—',
          inspection_id: inspectionId || '—',
          report_id: reportId || '—',
          payload,
          function: 'generateReportPdf',
          error_response: JSON.stringify(response.data),
        });
        toast.error('Report generation failed: ' + response.data.error);
      } else {
        toast.error('No report URL returned.');
      }
    } catch (e) {
      setReportDiagnostics({
        error: e.message,
        appointment_id: appointmentId || '—',
        job_id: jobId || '—',
        inspection_id: inspectionId || '—',
        report_id: reportId || '—',
        payload: { report_id: reportId, job_id: jobId },
        function: 'generateReportPdf',
        error_response: e.response?.data ? JSON.stringify(e.response.data) : e.message,
      });
      toast.error('Failed to generate report: ' + e.message);
    }
  }, [jobId, derived.inspectionReport, derived.inspectionSetup, derived.estimate, todaysAppointment]);

  // Compute completion readiness
  const checklistComplete = CHECKLIST_KEYS.every(k => checklist[k]?.checked);
  const canComplete = selectedTier && checklistComplete;
  const canRecordDecision = presentation?.presentation_status === 'complete';

  // Save presentation (auto-save on section change or manual)
  const savePresentation = useCallback(async (overrides = {}) => {
    if (!presentation?.id) return null;
    try {
      const updated = await base44.entities.CustomerPresentation.update(presentation.id, {
        customer_questions: notes.customer_questions || '',
        customer_concerns: notes.customer_concerns || '',
        requested_changes: notes.requested_changes || '',
        office_follow_up_notes: notes.office_follow_up_notes || '',
        checklist_results: JSON.stringify(checklist),
        proposal_level: selectedTier || '',
        // The selected proposal option is the immutable EstimatePackage, not a
        // reusable template that may match multiple repairs.
        selected_proposal_option: allPackages.find(p => p.option_type === selectedTier)?.id || '',
        ...overrides,
      });
      setPresentation(updated);
      return updated;
    } catch (e) {
      console.error('Auto-save failed:', e);
      return null;
    }
  }, [presentation?.id, notes, checklist, selectedTier, allPackages]);

  // Auto-save when switching sections
  const handleSectionChange = useCallback((newIdx) => {
    savePresentation();
    setActiveSection(newIdx);
  }, [savePresentation]);

  // Complete presentation
  const handleCompletePresentation = useCallback(async () => {
    if (!canComplete) {
      const missing = [];
      if (!selectedTier) missing.push('Select a proposal option');
      if (!checklistComplete) missing.push('Complete all checklist items');
      toast.error('Cannot complete presentation: ' + missing.join(', '));
      return;
    }

    setSaving(true);
    try {
      // Save current state (notes, checklist, proposal) WITHOUT marking complete yet
      await savePresentation();

      // Signature validation + workflow stage completion happens in onPresentationComplete
      // Pass the current customer decision so validation uses the LIVE value, not stale workflow state
      const sigOk = await onPresentationComplete?.(customerDecision);
      if (sigOk === false) {
        // Signature blocked — SignatureBlockDialog will open in JobHub
        // After signature capture, JobHub auto-retries and triggers a refresh
        toast.warning('Customer signature is required to complete the presentation.');
        return;
      }

      // Signature passed — presentation record is updated to 'complete' by JobHub
      toast.success('Presentation completed. Ready to record customer decision.');
      setActiveSection(PRESENTATION_SECTIONS.findIndex(s => s.key === 'decision'));
    } catch (e) {
      toast.error('Failed to complete presentation: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [canComplete, selectedTier, checklistComplete, savePresentation, onPresentationComplete]);

  // Record customer decision and proceed
  const handleRecordDecision = useCallback(async () => {
    const missing = [];

    // Validate required decision fields
    if (!customerDecision || customerDecision === 'pending') {
      missing.push('Select a customer decision');
    }
    // think_about_it requires notes
    if (customerDecision === 'think_about_it' && !decisionNotes.trim()) {
      missing.push('Add customer decision notes');
    }

    const decisionRouteMap = {
      perform_work_today: 'Scope of Work Review / Execution Plan',
      schedule_for_later: 'Scope of Work Saved / Office Scheduling Queue',
      think_about_it: 'Follow-Up Opportunity',
      declined: 'Complete Appointment',
    };

    if (missing.length > 0) {
      const msg = missing.length === 1 && missing[0] === 'Select a customer decision'
        ? 'Select a customer decision before continuing.'
        : missing.length === 1 && missing[0] === 'Add customer decision notes'
          ? 'Add customer decision notes before continuing.'
          : missing.join(', ') + ' before continuing.';
      setDecisionDiagnostics({
        button_click_fired: true,
        selected_customer_decision: customerDecision || 'pending',
        required_fields: ['customer_decision', customerDecision === 'think_about_it' ? 'decision_notes' : ''].filter(Boolean),
        missing_fields: missing,
        save_status: 'blocked',
        next_workflow_stage: '—',
        navigation_target: '—',
      });
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      // For acceptance decisions, validate the selected package hasn't become stale
      // while the presentation was open. Blocks if backend validation fails.
      const acceptanceDecisions = ['perform_work_today', 'schedule_for_later'];
      if (acceptanceDecisions.includes(customerDecision)) {
        const selectedPackage = allPackages.find(p => p.option_type === selectedTier);
        if (selectedPackage) {
          try {
            const validation = await validatePackageForAcceptance(selectedPackage.id);
            if (!validation.valid) {
              toast.error('Package became stale during presentation. Please recalculate pricing before accepting.');
              setSaving(false);
              return;
            }
          } catch (err) {
            toast.error('Unable to validate package. Please try again.');
            setSaving(false);
            return;
          }

          // Server-authoritative, idempotent persistence of the accepted option.
          // Uses the server wrapper with version contract + idempotency key.
          // The immutable EstimatePackage.id is the authoritative identity.
          // On ok:false, do NOT advance, do NOT show success, do NOT close.
          // The presentation may stay open while pricing or stage data refreshes.
          // Read the workflow immediately before accepting so we never submit an
          // outdated optimistic-lock version from the dialog's original render.
          const latestWorkflow = workflow?.id
            ? await base44.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow)
            : workflow;
          const acceptRes = await acceptProposalOptionServer({
            job_id: jobId,
            workflow_id: latestWorkflow?.id || workflow?.id,
            estimate_package_id: selectedPackage.id,
            expected_workflow_revision_version: latestWorkflow?.workflow_revision_version || 0,
            customer_signature_url: signatureInfo?.signatureUrl || signatureInfo?.url || '',
            accepted_price: selectedPackage.selling_price || undefined,
            customer_decision: customerDecision,
            decision_notes: decisionNotes || '',
          });
          if (!acceptRes || acceptRes.ok === false || acceptRes.error || acceptRes.conflict || acceptRes.network_error) {
            // Wrapper already showed a toast. Do not advance.
            setSaving(false);
            return;
          }
          if (acceptRes?.ok === true) {
            setPresentation(prev => prev ? {
              ...prev,
              selected_estimate_package_id: acceptRes.selected_option_id,
              customer_signature_url: acceptRes.customer_signature_url,
              accepted_price: acceptRes.accepted_price,
            } : prev);
            // Surface readiness blockers as a VISIBLE warning — not a silent success.
            // The acceptance succeeded (customer decided), but the estimate may not
            // be ready for scheduling yet (missing scope, pricing, fleet, etc.).
            if (acceptRes.readiness && !acceptRes.readiness.ready) {
              const blockers = (acceptRes.readiness.blockers || []).join(', ');
              toast.warning(`Customer accepted, but estimate is NOT ready for scheduling: ${blockers || 'unresolved blockers'}. Resolve before scheduling.`);
            }
            // Surface invariant warnings if the acceptance detected a partial write
            if (acceptRes.invariant_warnings && acceptRes.invariant_warnings.length > 0) {
              toast.error(`Acceptance invariant warning: ${acceptRes.invariant_warnings.join('; ')}`);
            }
          }
        }
      }

      // NOTE: customer_decision / customer_decision_notes / customer_decision_at
      // are NO LONGER written here directly. The server-authoritative
      // acceptProposalOption function owns those fields. The dialog only
      // auto-saves non-decision fields (notes, checklist, proposal_level) via
      // savePresentation. For declined/deferred decisions, the server function
      // persists the decision fields; the dialog just passes the decision notes.

      // ── Decline all options (server-authoritative) ──
      if (customerDecision === 'declined') {
        const declineRes = await declineAllOptionsServer({
          job_id: jobId,
          workflow_id: workflow?.id,
          expected_workflow_revision_version: workflow?.workflow_revision_version || 0,
          decision_notes: decisionNotes || '',
        });
        if (!declineRes || declineRes.ok === false || declineRes.error || declineRes.conflict || declineRes.network_error) {
          setSaving(false);
          return;
        }
      }

      // ── Request revisions / think about it (server-authoritative) ──
      if (customerDecision === 'think_about_it') {
        const revRes = await requestRevisionsServer({
          job_id: jobId,
          workflow_id: workflow?.id,
          expected_workflow_revision_version: workflow?.workflow_revision_version || 0,
          decision_notes: decisionNotes || '',
        });
        if (!revRes || revRes.ok === false || revRes.error || revRes.conflict || revRes.network_error) {
          setSaving(false);
          return;
        }
      }

      // Ensure the customer_presentation workflow stage is completed
      // Pass the saved customer decision so validation uses the LIVE value
      const sigOk = await onPresentationComplete?.(customerDecision);
      if (sigOk === false) {
        // Signature blocked — don't proceed with decision recording
        return;
      }

      // Map decision to workflow customer_decision
      const decisionMap = {
        perform_work_today: 'accepted',
        schedule_for_later: 'accepted',
        think_about_it: 'deferred',
        declined: 'declined',
      };
      const workflowDecision = decisionMap[customerDecision] || 'pending';

      setDecisionDiagnostics({
        button_click_fired: true,
        selected_customer_decision: customerDecision,
        required_fields: ['customer_decision', customerDecision === 'think_about_it' ? 'decision_notes' : ''].filter(Boolean),
        missing_fields: [],
        save_status: 'saved',
        next_workflow_stage: decisionRouteMap[customerDecision] || '—',
        navigation_target: workflowDecision,
      });

      // onComplete validates the customer_decision signature and advances the workflow
      const completeOk = await onComplete?.(workflowDecision, customerDecision);
      if (completeOk === false) {
        // Signature blocked for decision stage — SignatureBlockDialog will open
        return;
      }
    } catch (e) {
      setDecisionDiagnostics({
        button_click_fired: true,
        selected_customer_decision: customerDecision,
        required_fields: ['customer_decision'],
        missing_fields: [],
        save_status: 'error: ' + e.message,
        next_workflow_stage: '—',
        navigation_target: '—',
      });
      toast.error('Failed to save decision: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [customerDecision, decisionNotes, savePresentation, onComplete, onPresentationComplete, workflow?.id, workflow?.workflow_revision_version, jobId, allPackages, selectedTier, signatureInfo]);

  const currentSection = PRESENTATION_SECTIONS[activeSection];

  const renderSection = () => {
    switch (currentSection.key) {
      case 'report':
        return (
          <PresentationInspectionReport
            inspectionReport={derived.inspectionReport}
            findings={derived.findings}
            legacyFindings={derived.legacyFindings}
            submissions={derived.submissions}
            onViewFullReport={handleViewFullReport}
            diagnostics={reportDiagnostics}
          />
        );
      case 'findings':
        return (
          <PresentationFindings
            findings={derived.findings}
            legacyFindings={derived.legacyFindings}
            recommendationReviewItems={derived.recommendationReviewItems}
          />
        );
      case 'recommendations':
        return (
          <PresentationRecommendations
            repairRecs={derived.repairRecs}
            draftEstimateItems={derived.draftEstimateItems}
          />
        );
      case 'proposal':
        return (
          <div className="space-y-3">
            {stalePackages.length > 0 && (
              <StalePackageWarning stalePackages={stalePackages} />
            )}
            <PresentationProposalOptions
              estimatePackages={allPackages}
              draftEstimateItems={derived.draftEstimateItems}
              selectedTier={selectedTier}
              onSelectTier={handleSelectTier}
            />
          </div>
        );
      case 'notes':
        return <PresentationCustomerNotes notes={notes} onNotesChange={handleNotesChange} />;
      case 'checklist':
        return <PresentationChecklist checklist={checklist} onToggle={handleChecklistToggle} />;
      case 'decision':
        return (
          <PresentationCustomerDecision
            selectedDecision={customerDecision}
            decisionNotes={decisionNotes}
            onSelectDecision={setCustomerDecision}
            onNotesChange={setDecisionNotes}
            diagnostics={decisionDiagnostics}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { savePresentation(); onClose(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="w-5 h-5 text-accent" /> Customer Presentation
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Guide the customer through findings, recommendations, and proposal options.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {validationError && validationError.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2 flex-shrink-0">
                <p className="text-sm font-semibold text-red-900">
                  Package validation failed. Resolve these issues before presenting to the customer:
                </p>
                <ul className="text-xs text-red-700 list-disc list-inside space-y-0.5">
                  {validationError.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {/* Section Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto border-b pb-2 flex-shrink-0">
              {PRESENTATION_SECTIONS.map((sec, idx) => {
                const isActive = idx === activeSection;
                const isComplete = sec.key === 'checklist' && checklistComplete
                  || sec.key === 'proposal' && selectedTier
                  || sec.key === 'decision' && canRecordDecision;
                return (
                  <button
                    key={sec.key}
                    onClick={() => handleSectionChange(idx)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    {isComplete && <CheckCircle2 className="w-3 h-3" />}
                    {sec.label}
                  </button>
                );
              })}
            </div>

            {/* Section Content */}
            <div className="flex-1 overflow-y-auto py-3">
              {renderSection()}
            </div>

            {/* Admin Diagnostics */}
            {isDevToolsVisible && (
              <PresentationDiagnostics
                presentationId={presentation?.id}
                signatureRequired={true}
                signatureCaptured={signatureCaptured}
                signatureRecordId={signatureInfo?.signatureUrl || signatureInfo?.timestamp || ''}
                checklistComplete={checklistComplete}
                selectedProposalOption={selectedTier || ''}
                currentSection={currentSection?.key}
                presentationStatus={presentation?.presentation_status}
                nextWorkflowStage={canRecordDecision ? 'customer_decision' : 'customer_presentation'}
              />
            )}

             {/* Footer */}
             <DialogFooter className="flex items-center justify-between border-t pt-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={activeSection === 0}
                  onClick={() => handleSectionChange(activeSection - 1)}
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <span className="text-xs text-muted-foreground">
                  Section {activeSection + 1} of {PRESENTATION_SECTIONS.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {activeSection < PRESENTATION_SECTIONS.length - 1 ? (
                  <>
                    {currentSection.key === 'checklist' && !canRecordDecision && (
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={!canComplete || saving}
                        onClick={handleCompletePresentation}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Complete Presentation
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => handleSectionChange(activeSection + 1)}
                    >
                      Next: {PRESENTATION_SECTIONS[activeSection + 1]?.label}
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={saving}
                    onClick={handleRecordDecision}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Record Decision & Continue
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}