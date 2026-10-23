import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  computeEffectiveStages,
  computeNextAction,
  computeOverallProgress,
  safeParse,
  applyRevisionStates,
} from '@/lib/workflowEngine';
import { logDuplicateCheck } from '@/lib/workflowTrace';
import { isEstimatePackageWorkflowEnabled, initializeAppointmentWorkflow } from '@/lib/estimatePackageWorkflow';
import {
  reopenWorkflowStage,
  loadWorkflowRevisions,
  recompleteStageServer,
  clearStalenessServer,
  completeStageServer,
  acceptProposalOptionServer,
  switchProposalOptionServer,
  declineAllOptionsServer,
  requestRevisionsServer,
} from '@/lib/workflowRevisions';
import { toast } from 'sonner';

export function useWorkflowState(jobId, employee, effectiveEmail, effectiveName) {
  const [workflow, setWorkflowState] = useState(null);
  const workflowRef = useRef(null);
  const setWorkflow = useCallback((wf) => {
    workflowRef.current = wf;
    setWorkflowState(wf);
  }, []);
  const [derived, setDerived] = useState({
    inspectionSetup: null,
    submissions: [],
    findings: [],
    legacyFindings: [],
    repairRecs: [],
    estimate: null,
    inspectionReport: null,
    recommendationReview: null,
    recommendationReviewItems: [],
    draftEstimateItems: [],
    scopeOfWork: null,
    customerPresentation: null,
    estimatePackages: [],
    useV2Workflow: false,
  });
  const [loading, setLoading] = useState(true);

  // Load workflow + derived data
  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const [
          workflows,
          setups,
          submissions,
          findings,
          legacyFindings,
          repairRecs,
          estimates,
          reports,
          recReviews,
          recReviewItems,
          draftEstimateItems,
          scopeOfWorks,
          customerPresentations,
          estimatePackages,
        ] = await Promise.all([
          base44.entities.AppointmentWorkflow.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.InspectionSetup.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.InspectionSubmission.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.InspectionFinding.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.Finding.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.Estimate.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.InspectionReport.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.RecommendationReview.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.RecommendationReviewItem.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.DraftEstimateItem.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.ScopeOfWork.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.CustomerPresentation.filter({ job_id: jobId }, '-created_date').catch(() => []),
          base44.entities.EstimatePackage.filter({ job_id: jobId }, '-created_date').catch(() => []),
        ]);
        if (cancelled) return;

        let wf = workflows[0] || null;
        // Log duplicate records for diagnosis
        logDuplicateCheck('AppointmentWorkflow', `job_id=${jobId}`, workflows);
        logDuplicateCheck('InspectionSetup', `job_id=${jobId}`, setups);
        logDuplicateCheck('InspectionSubmission', `job_id=${jobId}`, submissions);
        // Determine selected modules from InspectionSetup
        const setup = setups[0] || null;
        const setupModules = setup?.selected_modules || ['interior', 'exterior'];

        if (!wf) {
          // Provisioning is server-authoritative: the client cannot fabricate
          // an advanced workflow, lock, decision, pointer, or version.
          const provision = await base44.functions.invoke('manageWorkflowWorkspace', {
            action: 'ensure_workflow',
            job_id: jobId,
          });
          const provisionResult = provision?.data || provision;
          wf = provisionResult?.workflow || null;
          if (!wf) throw new Error(provisionResult?.error_code || 'Workflow provisioning failed');
        }
        // Keep setup metadata server-authoritative as well.
        const wfModules = safeParse(wf.selected_modules, ['interior', 'exterior']);
        if (setup && JSON.stringify(wfModules) !== JSON.stringify(setupModules)) {
          const sync = await base44.functions.invoke('manageWorkflowWorkspace', {
            action: 'configure_inspection_setup',
            job_id: jobId,
            workflow_id: wf.id,
            selected_modules: setupModules,
            expected_workflow_revision_version: wf.workflow_revision_version || 0,
            idempotency_key: `setup-${wf.id}-v${wf.workflow_revision_version || 0}-${setupModules.join('-')}`,
          });
          const syncResult = sync?.data || sync;
          if (!syncResult?.ok) throw new Error(syncResult?.error_code || 'Workflow setup sync failed');
          wf = await base44.entities.AppointmentWorkflow.get(wf.id);
        }
        setWorkflow(wf);
        const useV2 = isEstimatePackageWorkflowEnabled(wf);
        console.log('[WorkflowOrder] job_id:', jobId, 'workflow_version:', wf.workflow_version || '(unset→legacy)', 'useV2:', useV2);
        // Select the latest completed/approved non-superseded scope — not just the newest record.
        // This prevents stage derivation from using an older draft while a newer approved scope exists.
        const authoritativeScope = scopeOfWorks.find(s => s.status === 'approved' && !s.superseded_by_id)
          || scopeOfWorks.find(s => s.status === 'approved')
          || scopeOfWorks.find(s => !s.superseded_by_id)
          || scopeOfWorks[0] || null;
        logDuplicateCheck('ScopeOfWork', `job_id=${jobId}`, scopeOfWorks);
        setDerived({
          inspectionSetup: setup,
          submissions,
          findings,
          legacyFindings,
          repairRecs,
          estimate: estimates[0] || null,
          inspectionReport: reports[0] || null,
          recommendationReview: recReviews[0] || null,
          recommendationReviewItems: recReviewItems,
          draftEstimateItems,
          scopeOfWork: authoritativeScope,
          scopeOfWorks,
          customerPresentation: customerPresentations[0] || null,
          estimatePackages: estimatePackages || [],
          useV2Workflow: useV2,
        });
      } catch (e) {
        console.error('Workflow load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [jobId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = base44.entities.AppointmentWorkflow.subscribe((event) => {
      if (event.data?.job_id === jobId) {
        setWorkflow(event.data);
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [jobId]);

  // Also subscribe to InspectionSubmission changes (for live module status)
  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = base44.entities.InspectionSubmission.subscribe(async () => {
      const submissions = await base44.entities.InspectionSubmission.filter({ job_id: jobId }).catch(() => []);
      setDerived(prev => ({ ...prev, submissions }));
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [jobId]);

  // Subscribe to InspectionFinding changes so the Inspection Summary reflects
  // rule-created deficiencies the moment the async Rules Engine automation
  // (processInspectionAnswers) writes them — otherwise the dialog reads stale
  // derived.findings (loaded at mount, before the finding existed) and shows
  // "No deficiencies found" even though the finding exists in the database.
  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = base44.entities.InspectionFinding.subscribe((event) => {
      if (event?.data?.job_id !== jobId) return;
      base44.entities.InspectionFinding.filter({ job_id: jobId }, '-created_date')
        .then((findings) => setDerived((prev) => ({ ...prev, findings })))
        .catch(() => {});
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [jobId]);

  const stages = useMemo(
    () => applyRevisionStates(computeEffectiveStages(workflow, derived), workflow),
    [workflow, derived]
  );

  const nextAction = useMemo(
    () => computeNextAction(stages, workflow),
    [stages, workflow]
  );

  const overallProgress = useMemo(
    () => computeOverallProgress(stages, workflow),
    [stages, workflow]
  );

  const refresh = useCallback(async () => {
    if (!workflow?.id) return;
    const updated = await base44.entities.AppointmentWorkflow.get(workflow.id).catch(() => null);
    if (updated) setWorkflow(updated);
    console.log('[WorkflowState] refresh — re-loading derived data for job:', jobId);
    // Also reload derived data so downstream components see fresh recs/findings/estimate/report
    const [repairRecs, findings, legacyFindings, estimates, submissions, setups, reports, recReviews, recReviewItems, draftEstimateItems, scopeOfWorks, customerPresentations, estimatePackages] = await Promise.all([
      base44.entities.RepairSystemRecommendation.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.InspectionFinding.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.Finding.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.Estimate.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.InspectionSubmission.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.InspectionSetup.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.InspectionReport.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.RecommendationReview.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.RecommendationReviewItem.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.DraftEstimateItem.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.ScopeOfWork.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.CustomerPresentation.filter({ job_id: jobId }, '-created_date').catch(() => []),
      base44.entities.EstimatePackage.filter({ job_id: jobId }, '-created_date').catch(() => []),
    ]);
    // Log submission statuses after refresh for diagnosis
    logDuplicateCheck('InspectionSubmission (refresh)', `job_id=${jobId}`, submissions);
    // Select the latest completed/approved non-superseded scope — consistent with initial load
    const refreshedScope = scopeOfWorks.find(s => s.status === 'approved' && !s.superseded_by_id)
      || scopeOfWorks.find(s => s.status === 'approved')
      || scopeOfWorks.find(s => !s.superseded_by_id)
      || scopeOfWorks[0] || null;
    logDuplicateCheck('ScopeOfWork (refresh)', `job_id=${jobId}`, scopeOfWorks);
    setDerived(prev => ({
      ...prev,
      repairRecs,
      findings,
      legacyFindings,
      submissions,
      estimate: estimates[0] || null,
      inspectionSetup: setups[0] || prev.inspectionSetup,
      inspectionReport: reports[0] || null,
      recommendationReview: recReviews[0] || null,
      recommendationReviewItems: recReviewItems,
      draftEstimateItems,
      scopeOfWork: refreshedScope,
      scopeOfWorks,
      customerPresentation: customerPresentations[0] || null,
      estimatePackages: estimatePackages || [],
    }));
  }, [workflow?.id, jobId]);

  const workspaceMutation = useCallback(async (action, payload = {}) => {
    const wf = workflowRef.current;
    if (!wf?.id || !jobId) return { ok: false, error_code: 'WORKFLOW_NOT_LOADED' };
    const version = wf.workflow_revision_version || 0;
    const request = await base44.functions.invoke('manageWorkflowWorkspace', {
      action, job_id: jobId, workflow_id: wf.id,
      expected_workflow_revision_version: version,
      idempotency_key: `workspace-${action}-${wf.id}-v${version}-${payload.module_key || payload.stage_key || payload.decision || 'record'}`,
      ...payload,
    });
    const result = request?.data || request;
    if (result?.ok) {
      const updated = await base44.entities.AppointmentWorkflow.get(wf.id);
      setWorkflow(updated);
      return { ...result, workflow: updated };
    }
    return result || { ok: false, error_code: 'WORKSPACE_MUTATION_FAILED' };
  }, [jobId]);

  // Retained only for compatibility with hook consumers; protected workflow
  // fields are never sent to a generic direct entity update.
  const updateWorkflow = useCallback(async () => {
    throw new Error('Direct AppointmentWorkflow updates are disabled. Use an explicit workflow action.');
  }, []);

  const updateStageState = useCallback(async (stageKey, stateUpdate) => {
    return await workspaceMutation('set_stage_runtime_state', {
      stage_key: stageKey,
      status: stateUpdate?.status,
    });
  }, [workspaceMutation]);

  const assignModule = useCallback(async (moduleKey, crewMember) => {
    return await workspaceMutation('assign_module', {
      module_key: moduleKey,
      assignee_email: crewMember?.email || '',
      assignee_name: crewMember?.name || '',
    });
  }, [workspaceMutation]);

  const approveModule = useCallback(async (moduleKey, notes) => {
    return await workspaceMutation('review_module', {
      module_key: moduleKey,
      decision: 'approved',
      notes: notes || '',
    });
  }, [workspaceMutation]);

  const rejectModule = useCallback(async (moduleKey, notes) => {
    if (!workflow?.id) return;
    await workspaceMutation('review_module', {
      module_key: moduleKey,
      decision: 'rejected',
      notes: notes || '',
    });

    // Notify the assigned technician that their module was returned for correction
    const assignments = safeParse(workflow.module_assignments, {});
    const assignment = assignments[moduleKey];
    if (assignment?.assigned_to_email) {
      try {
        await base44.functions.invoke('manageNotification', {
          action: 'create',
          notificationData: {
            title: `${moduleKey === 'interior' ? 'Interior' : 'Exterior'} Inspection Returned for Correction`,
            message: `Your ${moduleKey} inspection has been returned by ${effectiveName} for correction.${notes ? ` Notes: ${notes}` : ''}`,
            notification_type: 'Warning',
            priority: 'High',
            recipient_email: assignment.assigned_to_email,
            recipient_name: assignment.assigned_to_name || '',
            related_job: workflow.job_id || '',
            related_workflow: workflow.id,
            source_module: 'job_hub',
            delivery_methods: ['In-App'],
          },
        });
      } catch (e) {
        console.error('Failed to send rejection notification:', e);
      }
    }
  }, [workflow, updateWorkflow, effectiveEmail, effectiveName]);

  const acquireLock = useCallback(async (moduleKey) => {
    const result = await workspaceMutation('acquire_module_lock', { module_key: moduleKey });
    if (result?.error_code === 'MODULE_LOCKED') return { conflict: true, lockedBy: result.locked_by };
    return { conflict: !result?.ok, error: result?.error_code };
  }, [workspaceMutation]);

  const releaseLock = useCallback(async (moduleKey) => {
    return await workspaceMutation('release_module_lock', { module_key: moduleKey });
  }, [workspaceMutation]);

  const takeoverLock = useCallback(async (moduleKey, reason) => {
    return await workspaceMutation('takeover_module_lock', { module_key: moduleKey, reason });
  }, [workspaceMutation]);

  // ── Customer Decision (SERVER-AUTHORITATIVE) ──
  // Routes through acceptProposalOption backend function. The server validates
  // the presentation, pricing, signature, reconciles all sibling packages,
  // persists selected_option_id, and increments workflow_revision_version.
  //
  // The frontend NEVER directly writes customer_decision, selected_option_id,
  // or EstimatePackage.is_selected. If the server is unavailable, no mutation
  // occurs — a visible retryable error is shown and the user's input preserved.
  //
  // The ready_for_scheduling transition is handled by markEstimateReadyForScheduling
  // (separate server-authoritative function) — NOT a direct Estimate.update here.
  const setCustomerDecision = useCallback(async (decision, selectedOptionId, context = {}) => {
    const wf = workflowRef.current;
    if (!wf?.id || !jobId) {
      toast.error('Cannot record decision — workflow not loaded. Please refresh and try again.');
      return { ok: false, retryable: true, error_code: 'workflow_not_loaded' };
    }

    const expectedVersion = wf.workflow_revision_version || 0;
    let result;

    if (decision === 'accepted') {
      // Resolve the immutable EstimatePackage ID — never a label/name/position
      const selectedPkg = (derived.estimatePackages || []).find(p => p.id === selectedOptionId)
        || (derived.estimatePackages || []).find(p => p.is_selected === true && !p.superseded_by_id)
        || (derived.estimatePackages || []).find(p => p.is_selected === true);
      const optionId = selectedOptionId || selectedPkg?.id || null;
      if (!optionId) {
        toast.error('No proposal option selected. Select an option before accepting.');
        return { ok: false, error: 'no_option_selected' };
      }

      const currentlySelected = (derived.estimatePackages || []).find(p => p.is_selected === true);
      if (currentlySelected && currentlySelected.id !== optionId) {
        // Switching to a different option after a prior acceptance — requires reason
        if (!context.reason || !context.reason.trim()) {
          toast.error('A written reason is required to switch the accepted option. Use the switch-option dialog.');
          return { ok: false, error_code: 'switch_requires_reason', retryable: false };
        }
        result = await switchProposalOptionServer({
          job_id: jobId,
          workflow_id: wf.id,
          estimate_package_id: optionId,
          expected_workflow_revision_version: expectedVersion,
          reason: context.reason,
          customer_signature_url: context.customer_signature_url,
          customer_decision: context.customer_decision,
          decision_notes: context.decision_notes,
        });
      } else {
        result = await acceptProposalOptionServer({
          job_id: jobId,
          workflow_id: wf.id,
          estimate_package_id: optionId,
          expected_workflow_revision_version: expectedVersion,
          customer_signature_url: context.customer_signature_url,
          accepted_price: selectedPkg?.selling_price,
          customer_decision: context.customer_decision,
          decision_notes: context.decision_notes,
        });
      }
    } else if (decision === 'declined') {
      result = await declineAllOptionsServer({
        job_id: jobId,
        workflow_id: wf.id,
        expected_workflow_revision_version: expectedVersion,
        decision_notes: context.decision_notes,
      });
    } else if (decision === 'deferred') {
      result = await requestRevisionsServer({
        job_id: jobId,
        workflow_id: wf.id,
        expected_workflow_revision_version: expectedVersion,
        decision_notes: context.decision_notes,
      });
    } else {
      toast.error(`Unknown decision: ${decision}`);
      return { ok: false, error: 'unknown_decision' };
    }

    // ── ok:false handling ──
    // Do NOT advance the workflow. Do NOT show success toast. Do NOT close dialog.
    // The wrapper already showed a toast for network/conflict errors.
    if (!result || result.ok === false || result.error || result.conflict || result.network_error) {
      return result || { ok: false, retryable: true, error_code: 'unknown' };
    }

    // Success — update local workflow state from server response
    if (result.workflow_revision_version !== undefined) {
      setWorkflow({ ...wf, workflow_revision_version: result.workflow_revision_version, customer_decision: decision, selected_option_id: result.selected_option_id || wf.selected_option_id });
    }

    // Readiness is now an idempotent step WITHIN the acceptProposalOption
    // accept action — no separate uncoordinated call here. If readiness
    // validation failed, the result carries readiness.blockers so the UI
    // can show a VISIBLE blocker (not a silent success).
    if (decision === 'accepted' && result?.readiness && !result.readiness.ready) {
      const blockers = (result.readiness.blockers || []).join(', ');
      toast.warning(`Customer accepted, but estimate is NOT ready for scheduling: ${blockers || 'unknown blockers'}. Resolve before scheduling.`);
    }

    return result;
  }, [jobId, derived.estimatePackages, setWorkflow]);

  // ── Server-Authoritative Stage Completion (NO FAIL-OPEN) ──
  // Routes through the manageWorkflowRevision backend function with
  // optimistic concurrency. The server validates the stage is not blocked,
  // updates stage_states, and increments workflow_revision_version.
  //
  // If the server is unavailable or returns an error:
  //   - NO direct write occurs
  //   - The persisted stage remains unchanged
  //   - A visible retryable error is shown to the user
  //   - The user's unsaved local input is preserved
  const completeStage = useCallback(async (stageKey, extraData) => {
    const wf = workflowRef.current;
    if (!wf?.id || !jobId) {
      toast.error('Cannot complete stage — workflow not loaded. Please refresh and try again.');
      return { success: false, error: 'no_workflow' };
    }
    const result = await completeStageServer({
      job_id: jobId,
      workflow_id: wf.id,
      stage_key: stageKey,
      expected_workflow_revision_version: wf.workflow_revision_version || 0,
      extra_data: {
        completed_by: effectiveEmail,
        completed_by_name: effectiveName,
        ...extraData,
      },
    });
    if (result?.ok === true) {
      // A stage completion can create or update related records (scope, estimate,
      // presentation, recommendations, etc.) that the workflow resolver uses to
      // unlock the next step. Reload them immediately so the technician can
      // continue without refreshing the whole Job Hub page.
      if (result.workflow) setWorkflow(result.workflow);
      await refresh();
    }
    // No fallback to direct write. Errors are surfaced by the wrapper.
    return result;
  }, [effectiveEmail, effectiveName, jobId, setWorkflow, refresh]);

  const setCrewMembers = useCallback(async (crew) => {
    return await workspaceMutation('update_crew_members', { crew_members: crew });
  }, [workspaceMutation]);

  // ── Controlled Reopen ──
  // Calls the server-authoritative manageWorkflowRevision backend function.
  // The backend validates permissions, marks downstream stages stale,
  // increments the workflow version, and creates an audit record.
  const reopenStage = useCallback(async (stageKey, reason, affectedRecommendationIds) => {
    if (!workflow?.id || !jobId) return { success: false };
    const result = await reopenWorkflowStage({
      job_id: jobId,
      workflow_id: workflow.id,
      stage_key: stageKey,
      reason,
      expected_workflow_revision_version: workflow.workflow_revision_version || 0,
      affected_recommendation_ids: affectedRecommendationIds,
    });
    if (result?.ok === true && result.workflow) {
      setWorkflow(result.workflow);
      if (result.requires_approval) {
        toast.info('Reopen request submitted for manager approval.');
      } else {
        toast.success(`Stage reopened. ${result.stale_stages?.length || 0} downstream stage(s) marked stale.`);
      }
    }
    return result;
  }, [workflow, jobId, setWorkflow]);

  // ── Re-complete a reopened stage (SERVER-AUTHORITATIVE) ──
  // Calls the manageWorkflowRevision backend function. The server validates
  // the stage is in 'reopened' status, clears reopen flags, marks it completed,
  // and increments workflow_revision_version. The frontend never mutates
  // stage_states directly for this operation.
  const recompleteStage = useCallback(async (stageKey, extraData) => {
    const wf = workflowRef.current;
    if (!wf?.id || !jobId) return { success: false };
    const result = await recompleteStageServer({
      job_id: jobId,
      workflow_id: wf.id,
      stage_key: stageKey,
      expected_workflow_revision_version: wf.workflow_revision_version || 0,
      extra_data: {
        completed_by: effectiveEmail,
        completed_by_name: effectiveName,
        ...extraData,
      },
    });
    if (result?.ok === true && result.workflow) {
      setWorkflow(result.workflow);
    }
    return result;
  }, [jobId, setWorkflow, effectiveEmail, effectiveName]);

  // ── Clear staleness on a stage (SERVER-AUTHORITATIVE) ──
  // Calls the manageWorkflowRevision backend function. The server validates
  // that upstream stages are no longer reopened before clearing the stale
  // flag. The frontend never mutates stage_states directly for this operation.
  const clearStaleness = useCallback(async (stageKey, reason) => {
    const wf = workflowRef.current;
    if (!wf?.id || !jobId) return { success: false };
    const result = await clearStalenessServer({
      job_id: jobId,
      workflow_id: wf.id,
      stage_key: stageKey,
      expected_workflow_revision_version: wf.workflow_revision_version || 0,
      reason,
    });
    if (result?.ok === true && result.workflow) {
      setWorkflow(result.workflow);
    }
    return result;
  }, [jobId, setWorkflow]);

  // ── Revision History ──
  const [revisions, setRevisions] = useState([]);
  const refreshRevisions = useCallback(async () => {
    if (!jobId) return;
    const revs = await loadWorkflowRevisions(jobId);
    setRevisions(revs);
  }, [jobId]);

  return {
    workflow,
    stages,
    nextAction,
    overallProgress,
    loading,
    derived,
    refresh,
    updateWorkflow,
    updateStageState,
    assignModule,
    approveModule,
    rejectModule,
    acquireLock,
    releaseLock,
    takeoverLock,
    setCustomerDecision,
    completeStage,
    setCrewMembers,
    // ── Revision-aware functions ──
    reopenStage,
    recompleteStage,
    clearStaleness,
    revisions,
    refreshRevisions,
  };
}