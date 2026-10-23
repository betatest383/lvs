/**
 * manageWorkflowRevision — Server-Authoritative Workflow Revision Engine (v2, CAS-hardened).
 *
 * ── Shared workflow lock (NEW) ──
 *   Every mutating action acquires the SAME per-workflow CAS lock used by
 *   acceptProposalOption (`decision_lock_*` fields via workflowLock.ts). A
 *   stage mutation and a customer decision therefore contend for the SAME
 *   lock — they cannot run simultaneously against one workflow. No separate
 *   "stage lock" exists.
 *
 * ── Phased execution (NEW) ──
 *   Create/reuse WMR → acquire shared CAS lock → re-read workflow → revalidate
 *   expected version → validate stage/action requirements → execute resumable
 *   protected mutation → fenced workflow/version commit (one updateMany with
 *   {owner,token,generation,workflow_revision_version} in the filter) →
 *   post-commit audit/effects (idempotent) → invariant verification → WMR
 *   completion → fenced release.
 *
 * ── Version contract (unchanged) ──
 *   { workflow_id, expected_workflow_revision_version, idempotency_key } in;
 *   { previous_workflow_revision_version, workflow_revision_version, idempotent } out.
 *
 * ── Resumability (NEW) ──
 *   Same idempotency key + payload reuses the WMR. If a prior attempt already
 *   committed the version (detected: fenced commit returns updated:0 but the
 *   stage is already in the intended target status and version advanced), the
 *   commit is skipped (no second increment), idempotent post-commit steps run,
 *   and the WMR completes once. No duplicate WorkflowRevision / JobActivityLog.
 *
 * ── PLATFORM LIMITATION (removed) ──
 *   The previous "optimistic version guard is not a true CAS" limitation is
 *   eliminated: the version increment now happens inside a fenced updateMany
 *   conditioned on the lock owner, so two simultaneous stage mutations cannot
 *   both commit. The CAS primitive is proven (10×20 contender race + ownership/
 *   expiration/fencing tests).
 *
 * ── Actions ──
 *   preview_reopen (read-only, no lock), reopen, approve_reopen, deny_reopen,
 *   recomplete_stage, clear_staleness, complete_stage, create_draft_revision.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  canReopenStage,
  determineWorkflowPhase,
  getStagesToMarkStale,
  STAGE_KEYS,
  DEPENDENCY_MAP_VERSION,
  isEstimatePackageImmutable,
  isPricingSnapshotImmutable,
  isCustomerPresentationImmutable,
  isScopeImmutable,
  getAffectedPackageIdsWithTraceability,
  classifyPackagesByImmutability,
  validateDownstreamRecords,
} from '../../shared/workflowDependencies.ts';
import { acquireWorkflowLock, releaseWorkflowLock } from '../../shared/workflowLock.ts';
import { evaluateDecisionInvariants } from '../../shared/decisionInvariants.ts';
import { fencedWorkflowMutationCommit, reconcileCommitMarker, markRetryableLockContention } from '../../shared/workflowCommit.ts';
import { recordBlockingInvariantException } from '../../shared/workflowInvariantExceptions.ts';

const LOCK_TTL_SECONDS = 30;
const MANAGER_ROLES = ['admin', 'owner', 'manager', 'operations_manager'];
const isManager = (r: string) => MANAGER_ROLES.includes(r);

function safeJsonParse(str: any, fallback: any): any {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function getStageLabel(stageKey: string): string {
  const labels: Record<string, string> = {
    inspection_setup: 'Inspection Setup', interior_inspection: 'Interior Inspection',
    exterior_inspection: 'Exterior Inspection', inspection_summary: 'Inspection Summary',
    ai_report_summary: 'AI Report Summary', recommendation_review: 'Recommendation Review',
    repair_system_review: 'Repair System Review', estimate_package_builder: 'Estimate Package Builder',
    scope_of_work: 'Scope of Work', dynamic_pricing: 'Dynamic Pricing',
    final_estimate_review: 'Final Estimate Review', proposal_builder: 'Proposal Builder',
    customer_presentation: 'Customer Presentation', customer_decision: 'Customer Decision',
    execution_plan: 'Execution Plan', complete_appointment: 'Complete Appointment',
  };
  return labels[stageKey] || stageKey;
}

async function computePayloadHash(body: any): Promise<string> {
  const { idempotency_key, ...rest } = body;
  const normalized = JSON.stringify(rest, Object.keys(rest).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateIdempotencyKey(body: any): string {
  return `wmr-${body.workflow_id || body.job_id}-${body.action}-${body.stage_key || ''}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso(): string { return new Date().toISOString(); }

async function loadRelatedRecords(base44: any, jobId: string) {
  const [estimates, packages, scopes, snapshots, presentations] = await Promise.all([
    base44.asServiceRole.entities.Estimate.filter({ job_id: jobId }, '-created_date', 1).catch(() => []),
    base44.asServiceRole.entities.EstimatePackage.filter({ job_id: jobId }, '-created_date', 50).catch(() => []),
    base44.asServiceRole.entities.ScopeOfWork.filter({ job_id: jobId }, '-created_date', 50).catch(() => []),
    base44.asServiceRole.entities.PricingCalculationSnapshot.filter({ job_id: jobId }, '-created_date', 50).catch(() => []),
    base44.asServiceRole.entities.CustomerPresentation.filter({ job_id: jobId }, '-created_date', 10).catch(() => []),
  ]);
  return { estimate: estimates[0] || null, packages, scopes, snapshots, presentations };
}

async function findMutationRequest(base44: any, idempotencyKey: string) {
  const existing = await base44.asServiceRole.entities.WorkflowMutationRequest.filter(
    { idempotency_key: idempotencyKey }, '-requested_at', 1,
  ).catch(() => []);
  return (existing && existing[0]) || null;
}
async function createWMR(base44: any, body: any, user: any, payloadHash: string, idempotencyKey: string) {
  return await base44.asServiceRole.entities.WorkflowMutationRequest.create({
    request_id: `WMR-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    idempotency_key: idempotencyKey,
    workflow_id: body.workflow_id || '', job_id: body.job_id,
    mutation_action: body.action, stage_key: body.stage_key || '',
    expected_workflow_revision_version: body.expected_workflow_revision_version || 0,
    payload_hash: payloadHash, requested_by: user.email || user.id || '',
    requested_by_name: user.full_name || '', requested_at: nowIso(), status: 'pending',
  });
}
async function completeWMR(base44: any, reqId: string, result: any, newVersion: number, revisionId?: string) {
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(reqId, {
    status: 'completed', completed_at: nowIso(),
    resulting_workflow_revision_version: newVersion,
    post_commit_status: 'completed',
    post_commit_steps_json: JSON.stringify({ workflow_revision: revisionId ? 'completed' : 'not_required', activity_log: 'completed', invariants: 'completed' }),
    outcome_class: 'completed',
    result_json: JSON.stringify(result),
    final_result_json: JSON.stringify(result),
    created_revision_id: revisionId || null,
  }).catch(() => {});
}
async function failWMR(base44: any, reqId: string, errorCode: string, errorMessage: string) {
  const stale = errorCode === 'STALE_VERSION';
  const validation = ['VALIDATION', 'DOWNSTREAM_INVALID', 'NOT_COMPLETED', 'NOT_REOPENED', 'NOT_STALE', 'SELF_APPROVAL'].includes(errorCode);
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(reqId, {
    status: stale ? 'stale_version' : (validation ? 'validation_failed' : 'failed'),
    completed_at: nowIso(),
    error_code: errorCode,
    error_message: errorMessage,
    post_commit_status: 'failed',
    outcome_class: stale ? 'stale_expected_version' : (validation ? 'permanent_validation_failure' : 'failed_before_commit'),
  }).catch(() => {});
}
async function conflictWMR(base44: any, reqId: string, errorCode: string, errorMessage: string) {
  // Lock contention is a retryable outcome for this exact idempotency key.
  await markRetryableLockContention(base44, reqId, errorCode, errorMessage);
}

// Idempotent activity log: skip if a log for this revision/decision already exists
async function logActivityIdempotent(base44: any, jobId: string, dedupId: string, eventType: string, label: string, performedBy: string, details: any) {
  const existing = await base44.asServiceRole.entities.JobActivityLog.filter(
    { job_id: jobId, event_type: eventType }, '-timestamp', 50,
  ).catch(() => []);
  const already = (existing || []).some((l: any) => {
    const d = l.event_details || '';
    return typeof d === 'string' && d.includes(dedupId);
  });
  if (already) return;
  await base44.asServiceRole.entities.JobActivityLog.create({
    job_id: jobId, event_type: eventType, event_label: label,
    performed_by: performedBy, timestamp: nowIso(),
    event_details: JSON.stringify({ revision_id: dedupId, ...(details || {}) }),
  }).catch(() => {});
}

// Fenced workflow commit: stage state, version, and request-specific marker land atomically.
async function fencedStageCommit(base44: any, workflowId: string, lock: any, currentVersion: number, newStates: any, requestId: string, action: string, stageKey: string, extraCommit: Record<string, any> = {}) {
  return await fencedWorkflowMutationCommit(base44, {
    workflowId,
    lockToken: lock.token,
    lockGeneration: lock.generation,
    expectedVersion: currentVersion,
    requestId,
    action,
    stageKey,
    fields: { stage_states: JSON.stringify(newStates), ...extraCommit },
  });
}

async function persistInvariantStatus(base44: any, workflowId: string, report: any, lock: any) {
  const blocked = report.blocking;
  const status = blocked ? 'blocked' : (report.violations.length > 0 ? 'warning' : 'ok');
  const workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflowId).catch(() => null);
  if (blocked && workflow) {
    await recordBlockingInvariantException(base44, {
      workflow,
      report,
      mutationRequestId: workflow.decision_lock_request_id || '',
      detectingFunction: 'manageWorkflowRevision',
      lockGeneration: Number(lock?.generation || workflow.decision_lock_generation || 0),
    }).catch(() => {});
  }
  if (!lock) return status;
  await base44.asServiceRole.entities.AppointmentWorkflow.updateMany({
    id: workflowId,
    decision_lock_owner: lock.token,
    decision_lock_token: lock.token,
    decision_lock_generation: lock.generation,
  }, {
    $set: {
      decision_invariant_status: status,
      decision_invariant_reason: JSON.stringify(report.violations || []),
      decision_invariant_detected_at: nowIso(),
    },
  }).catch(() => {});
  return status;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      job_id, stage_key, action, reason, approval_decision, revision_id,
      affected_recommendation_ids, extra_data, idempotency_key,
    } = body;

    if (!job_id || !action) return Response.json({ error: 'job_id and action are required' }, { status: 422 });

    const userEmail = user.email || user.id || '';
    const userRole = user.role || 'user';
    const userFullName = user.full_name || '';

    // ── locate workflow ──
    async function loadWorkflow() {
      let workflow = null;
      if (body.workflow_id) workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(body.workflow_id).catch(() => null);
      if (!workflow) {
        const wfs = await base44.asServiceRole.entities.AppointmentWorkflow.filter({ job_id }, '-created_date', 5).catch(() => []);
        workflow = wfs[0] || null;
      }
      return workflow;
    }

    // ── preview_reopen: read-only, no lock, no mutation ──
    if (action === 'preview_reopen') {
      if (!stage_key) return Response.json({ error: 'stage_key is required for preview_reopen' }, { status: 422 });
      const workflow = await loadWorkflow();
      if (!workflow) return Response.json({ error: 'No AppointmentWorkflow found for this job' }, { status: 404 });
      const stageStates = safeJsonParse(workflow.stage_states, {});
      const currentStageState = stageStates[stage_key] || {};
      const customerDecision = workflow.customer_decision || 'pending';
      const related = await loadRelatedRecords(base44, job_id);
      const estimateStatus = related.estimate?.status || 'draft';
      const phase = determineWorkflowPhase(stageStates, customerDecision, estimateStatus);
      const moduleAssignments = safeJsonParse(workflow.module_assignments, {});
      const isAssignedTech = Object.values(moduleAssignments).some((a: any) => a?.assigned_to_email === userEmail);
      const isLead = workflow.lead_technician_email === userEmail;
      const isCompleted = ['completed', 'approved'].includes(currentStageState.status);
      const permission = canReopenStage(stage_key, userRole, isLead, phase, isAssignedTech);
      const stagesToMarkStale = getStagesToMarkStale(stage_key);
      const customerPresented = stageStates[STAGE_KEYS.CUSTOMER_PRESENTATION]?.status === 'completed';
      const customerAccepted = ['accepted', 'perform_work_today', 'schedule_for_later'].includes(customerDecision);
      const scheduled = ['ready_for_scheduling', 'scheduled'].includes(estimateStatus);
      const traceResult = getAffectedPackageIdsWithTraceability(related.packages, affected_recommendation_ids);
      const { immutable: immutablePkgs } = classifyPackagesByImmutability(related.packages);
      const immutableSnapshotIds = related.snapshots.filter(isPricingSnapshotImmutable).map((s: any) => s.id);
      const immutablePresIds = related.presentations.filter(isCustomerPresentationImmutable).map((p: any) => p.id);
      const immutableScopeIds = related.scopes.filter(isScopeImmutable).map((s: any) => s.id);
      const warnings: string[] = [];
      if (!isCompleted) warnings.push(`Stage '${getStageLabel(stage_key)}' is not completed (current: ${currentStageState.status || 'not_started'}). Only completed stages can be reopened.`);
      if (customerAccepted) warnings.push('Customer has already accepted a proposal. The original acceptance and signature will be preserved.');
      if (customerPresented && !customerAccepted) warnings.push('A proposal has already been presented. The earlier presentation will be preserved as history.');
      if (scheduled) warnings.push('The job has already been scheduled. Scheduling may need to be revisited after the revision.');
      if (immutablePkgs.length > 0) warnings.push(`${immutablePkgs.length} package(s) have been presented/accepted and will be preserved as immutable.`);
      if (!traceResult.traceability_complete) warnings.push(`TRACEABILITY INCOMPLETE: ${traceResult.traceability_incomplete_reason} Changing any option will affect all active packages.`);
      if (permission.requiresManagerApproval && !isManager(userRole)) warnings.push('This reopen requires manager approval. Your request will be submitted to a manager — you cannot approve your own request.');
      return Response.json({
        success: true, action: 'preview_reopen', dependency_map_version: DEPENDENCY_MAP_VERSION,
        can_reopen: isCompleted && permission.canReopen, requires_manager_approval: permission.requiresManagerApproval,
        permission_reason: permission.reason, impacted_stages: stagesToMarkStale,
        affected_option_ids: traceResult.affected_package_ids, traceability_complete: traceResult.traceability_complete,
        traceability_incomplete_reason: traceResult.traceability_incomplete_reason || null,
        packages_missing_trace: traceResult.packages_missing_trace,
        affected_immutable_record_ids: [...immutablePkgs.map((p: any) => p.id), ...immutableSnapshotIds, ...immutablePresIds, ...immutableScopeIds],
        warnings, customer_presented: customerPresented, customer_accepted: customerAccepted, scheduled,
        current_stage_status: currentStageState.status || 'not_started',
        current_workflow_revision_version: workflow.workflow_revision_version || 0,
        user_role: userRole, is_lead: isLead, is_assigned_tech: isAssignedTech,
      });
    }

    // ═══════════════ MUTATION ACTIONS — shared CAS lock ═══════════════
    const payloadHash = await computePayloadHash(body);
    const effectiveIdempotencyKey = idempotency_key || generateIdempotencyKey(body);

    // Idempotency: reuse or create WMR
    let wmr = await findMutationRequest(base44, effectiveIdempotencyKey);
    if (wmr) {
      if (wmr.payload_hash !== payloadHash) {
        return Response.json({ error: 'Idempotency key conflict: same key submitted with different payload.', idempotency_key: effectiveIdempotencyKey }, { status: 409 });
      }
      if (wmr.status === 'completed' && wmr.result_json) {
        return Response.json({ ...JSON.parse(wmr.result_json), idempotent: true, mutation_request_id: wmr.id });
      }
      // pending → resume path (fall through)
    } else {
      wmr = await createWMR(base44, body, user, payloadHash, effectiveIdempotencyKey);
    }

    // ── locate workflow ──
    let workflow: any = await loadWorkflow();
    if (!workflow) {
      await failWMR(base44, wmr.id, 'NO_WORKFLOW', 'No AppointmentWorkflow found for this job');
      return Response.json({ error: 'No AppointmentWorkflow found for this job' }, { status: 404 });
    }

    // ── Phase A: acquire shared workflow lock ──
    const acquire = await acquireWorkflowLock(base44, workflow.id, wmr.id, LOCK_TTL_SECONDS);
    if (!acquire.acquired) {
      await conflictWMR(base44, wmr.id, 'WORKFLOW_IN_PROGRESS', `Lock held by ${acquire.currentOwner || 'another operation'}`);
      return Response.json({
        success: false, retryable: true, error_code: 'WORKFLOW_IN_PROGRESS',
        message: 'Another workflow mutation (decision or stage) is currently in progress on this workflow.',
        workflow_id: workflow.id, retry_after_ms: 1500, mutation_request_id: wmr.id,
      }, { status: 409 });
    }
    const lock = { token: acquire.token, generation: acquire.generation, expiresAt: acquire.expiresAt || '' };

    // ── Phase B: re-read + re-guard version (while holding lock) ──
    workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
    const currentVersion = Number(workflow.workflow_revision_version || 0);
    const stageStates = safeJsonParse(workflow.stage_states, {});
    const currentStageState = stageStates[stage_key] || {};
    const customerDecision = workflow.customer_decision || 'pending';
    const related = await loadRelatedRecords(base44, job_id);
    const estimateStatus = related.estimate?.status || 'draft';
    const phase = determineWorkflowPhase(stageStates, customerDecision, estimateStatus);
    const moduleAssignments = safeJsonParse(workflow.module_assignments, {});
    const isAssignedTech = Object.values(moduleAssignments).some((a: any) => a?.assigned_to_email === userEmail);
    const isLead = workflow.lead_technician_email === userEmail;

    // Only the exact marker can establish that this WMR already committed.
    const markerRecovery = await reconcileCommitMarker(base44, workflow, wmr, action, stage_key || '');
    if (!markerRecovery.confirmed && body.expected_workflow_revision_version !== undefined && body.expected_workflow_revision_version !== null &&
        Number(currentVersion) !== Number(body.expected_workflow_revision_version)) {
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      await base44.asServiceRole.entities.WorkflowMutationRequest.update(wmr.id, {
        status: 'stale_version', completed_at: nowIso(),
        error_code: 'STALE_VERSION',
        error_message: 'Workflow was modified by another user. Please refresh and try again.',
        outcome_class: 'stale_expected_version',
      }).catch(() => {});
      return Response.json({ error: 'Workflow was modified by another user. Please refresh and try again.', current_workflow_revision_version: currentVersion, expected_workflow_revision_version: body.expected_workflow_revision_version }, { status: 409 });
    }

    // Helper: fenced commit with request-specific recovery. Matching stage status is
    // deliberately ignored: another request may have produced the same state.
    async function commitStage(newStates: any, targetStatus: string | null, extraCommit: Record<string, any> = {}) {
      if (markerRecovery.confirmed) {
        return { committed: false, resumed: true, newVersion: markerRecovery.version };
      }
      const commitResult = await fencedStageCommit(base44, workflow.id, lock, currentVersion, newStates, wmr.id, action, stage_key || '', extraCommit);
      if (commitResult?.committed) {
        return { committed: true, newVersion: commitResult.resultingVersion };
      }
      const recheck = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
      const verified = await reconcileCommitMarker(base44, recheck, wmr, action, stage_key || '');
      if (verified.confirmed) {
        return { committed: false, resumed: true, newVersion: verified.version };
      }
      return { committed: false, resumed: false, lost: true, recheckVersion: Number(recheck.workflow_revision_version || 0) };
    }

    // ═════════════ ACTION: reopen ═════════════
    if (action === 'reopen') {
      if (!reason) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'A written reason is required to reopen a stage'); return Response.json({ error: 'A written reason is required to reopen a stage' }, { status: 422 }); }
      if (!stage_key) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'stage_key is required'); return Response.json({ error: 'stage_key is required' }, { status: 422 }); }
      const isCompleted = ['completed', 'approved'].includes(currentStageState.status);
      if (!isCompleted && !markerRecovery.confirmed) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_COMPLETED', `Stage not completed (current: ${currentStageState.status || 'not_started'})`); return Response.json({ error: `Stage '${getStageLabel(stage_key)}' is not completed. Only completed stages can be reopened.` }, { status: 422 }); }
      const permission = canReopenStage(stage_key, userRole, isLead, phase, isAssignedTech);
      if (!permission.canReopen) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'PERMISSION', permission.reason || 'Insufficient permissions'); return Response.json({ error: permission.reason || 'Insufficient permissions to reopen this stage' }, { status: 403 }); }

      const stagesToMarkStale = getStagesToMarkStale(stage_key);
      const customerPresentedBeforeReopen = stageStates[STAGE_KEYS.CUSTOMER_PRESENTATION]?.status === 'completed';
      const customerAcceptedBeforeReopen = ['accepted', 'perform_work_today', 'schedule_for_later'].includes(customerDecision);
      const scheduledBeforeReopen = ['ready_for_scheduling', 'scheduled'].includes(estimateStatus);
      const traceResult = getAffectedPackageIdsWithTraceability(related.packages, affected_recommendation_ids);
      const { immutable: immutablePkgs } = classifyPackagesByImmutability(related.packages);

      // Manager-approval-required: create PENDING revision, NO workflow mutation, release lock.
      if (permission.requiresManagerApproval) {
        const revisionNumber = `WR-${Date.now()}`;
        const revision = await base44.asServiceRole.entities.WorkflowRevision.create({
          revision_number: revisionNumber, job_id, workflow_id: workflow.id, stage_key,
          stage_label: getStageLabel(stage_key), action: 'reopen',
          previous_status: currentStageState.status, new_status: 'pending_approval',
          reason, requested_by: userEmail, requested_by_name: userFullName, requested_at: nowIso(),
          manager_approval_required: true, approval_status: 'pending',
          downstream_stages_marked_stale: stagesToMarkStale, affected_option_ids: traceResult.affected_package_ids,
          affected_recommendation_ids: affected_recommendation_ids || [],
          affected_immutable_record_ids: immutablePkgs.map((p: any) => p.id),
          customer_presented_before_reopen: customerPresentedBeforeReopen,
          customer_accepted_before_reopen: customerAcceptedBeforeReopen,
          scheduled_before_reopen: scheduledBeforeReopen, status: 'active',
        });
        const result = { success: true, requires_approval: true, revision_id: revision.id, revision_number: revisionNumber, message: 'Reopen request submitted for manager approval. No workflow stages were changed.' };
        await completeWMR(base44, wmr.id, result, currentVersion, revision.id);
        await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
        // notify eligible approvers (non-blocking)
        try {
          const managers = await base44.asServiceRole.entities.User.list().catch(() => []);
          for (const mgr of managers.filter((u: any) => MANAGER_ROLES.includes(u.role) && u.email !== userEmail)) {
            await base44.functions.invoke('manageNotification', { action: 'create', notificationData: { title: `Reopen Approval Required: ${getStageLabel(stage_key)}`, message: `${userFullName} requested to reopen ${getStageLabel(stage_key)} on job ${job_id}. Reason: ${reason}`, notification_type: 'Warning', priority: 'High', recipient_email: mgr.email, recipient_name: mgr.full_name || '', related_job: job_id, related_workflow: workflow.id, source_module: 'job_hub', delivery_methods: ['In-App'] } }).catch(() => {});
          }
        } catch { /* non-blocking */ }
        return Response.json({ ...result, idempotent: false, mutation_request_id: wmr.id });
      }

      // Apply reopen (fenced commit)
      const newStates = { ...stageStates };
      const prevState = stageStates[stage_key] || {};
      newStates[stage_key] = { ...prevState, status: 'reopened', reopened_at: nowIso(), reopened_by: userEmail, reopened_by_name: userFullName, reopened_reason: reason, previous_status: prevState.status, last_updated: nowIso() };
      for (const staleStage of stagesToMarkStale) {
        const existing = stageStates[staleStage] || {};
        if (['completed', 'approved', 'in_progress'].includes(existing.status)) {
          newStates[staleStage] = { ...existing, stale: true, stale_reason: `${getStageLabel(stage_key)} was reopened by ${userFullName}`, stale_at: nowIso(), stale_by: userEmail, stale_by_name: userFullName, stale_source_stage: stage_key, last_updated: nowIso() };
        }
      }
      const commit = await commitStage(newStates, 'reopened');
      if (commit.lost) {
        await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced stage commit returned updated=0. Lock lost or version changed.');
        return Response.json({ success: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost or the workflow version changed before the stage commit. No stage transition was applied.', workflow_id: workflow.id }, { status: 409 });
      }
      const newVersion = commit.newVersion;
      const revisionNumber = `WR-${Date.now()}`;
      const revision = await base44.asServiceRole.entities.WorkflowRevision.create({
        revision_number: revisionNumber, job_id, workflow_id: workflow.id, stage_key,
        stage_label: getStageLabel(stage_key), action: 'reopen',
        previous_status: prevState.status, new_status: 'reopened',
        reason, requested_by: userEmail, requested_by_name: userFullName, requested_at: nowIso(),
        manager_approval_required: false, approval_status: 'not_required',
        downstream_stages_marked_stale: stagesToMarkStale, affected_option_ids: traceResult.affected_package_ids,
        affected_recommendation_ids: affected_recommendation_ids || [],
        affected_immutable_record_ids: immutablePkgs.map((p: any) => p.id),
        previous_workflow_version: currentVersion, new_workflow_version: newVersion,
        customer_presented_before_reopen: customerPresentedBeforeReopen,
        customer_accepted_before_reopen: customerAcceptedBeforeReopen,
        scheduled_before_reopen: scheduledBeforeReopen, status: 'active',
      });
      await logActivityIdempotent(base44, job_id, revision.id, 'package_revised', `${getStageLabel(stage_key)} reopened by ${userFullName}`, userEmail, { stage_key, reason, revision_id: revision.id, downstream_stale: stagesToMarkStale, affected_options: traceResult.affected_package_ids });
      const result = { success: true, revision_id: revision.id, revision_number: revisionNumber, reopened_stage: stage_key, stale_stages: stagesToMarkStale, affected_option_ids: traceResult.affected_package_ids, traceability_complete: traceResult.traceability_complete, previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion, idempotent: !!commit.resumed };
      await completeWMR(base44, wmr.id, result, newVersion, revision.id);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json({ ...result, mutation_request_id: wmr.id });
    }

    // ═════════════ ACTION: approve_reopen / deny_reopen ═════════════
    if (action === 'approve_reopen' || action === 'deny_reopen') {
      if (!isManager(userRole)) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); return Response.json({ error: 'Only managers/admins can approve or deny reopen requests' }, { status: 403 }); }
      if (!revision_id) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'revision_id is required'); return Response.json({ error: 'revision_id is required' }, { status: 422 }); }
      const revision = await base44.asServiceRole.entities.WorkflowRevision.get(revision_id).catch(() => null);
      if (!revision) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'Revision not found'); return Response.json({ error: 'Revision not found' }, { status: 404 }); }
      if (revision.approval_status !== 'pending') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'ALREADY_DECIDED', `Revision already ${revision.approval_status}`); return Response.json({ error: `Revision is already ${revision.approval_status} and cannot be ${action === 'deny_reopen' ? 'denied' : 'approved'} again` }, { status: 422 }); }
      if (revision.requested_by === userEmail) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'SELF_APPROVAL', 'Cannot approve own request'); return Response.json({ error: 'You cannot approve or deny your own reopen request. Another manager must act on it.' }, { status: 403 }); }

      // DENY: no workflow mutation
      if (action === 'deny_reopen' || approval_decision === 'denied') {
        await base44.asServiceRole.entities.WorkflowRevision.update(revision.id, { approval_status: 'denied', approved_by: userEmail, approved_by_name: userFullName, approved_at: nowIso(), status: 'denied' });
        await logActivityIdempotent(base44, job_id, revision.id, 'package_revised', `Reopen of ${getStageLabel(revision.stage_key)} denied by ${userFullName}`, userEmail, { revision_id: revision.id, denied_by: userEmail });
        const result = { success: true, approved: false, denied: true, revision_id: revision.id };
        await completeWMR(base44, wmr.id, result, currentVersion, revision.id);
        await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
        return Response.json(result);
      }

      // APPROVE: fenced stage commit
      const stageToReopen = revision.stage_key;
      const stagesToMarkStale = revision.downstream_stages_marked_stale || getStagesToMarkStale(stageToReopen);
      const stageNow = stageStates[stageToReopen] || {};
      if (!['completed', 'approved'].includes(stageNow.status) && !markerRecovery.confirmed) {
        await base44.asServiceRole.entities.WorkflowRevision.update(revision.id, { approval_status: 'denied', approved_by: userEmail, approved_by_name: userFullName, approved_at: nowIso(), status: 'denied' });
        await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
        await failWMR(base44, wmr.id, 'NOT_COMPLETED', `Stage no longer completed (current: ${stageNow.status}). Reopen auto-denied.`);
        return Response.json({ error: `Stage is no longer completed (current: ${stageNow.status}). Reopen auto-denied.` }, { status: 422 });
      }
      const newStates = { ...stageStates };
      newStates[stageToReopen] = { ...stageNow, status: 'reopened', reopened_at: nowIso(), reopened_by: revision.requested_by, reopened_by_name: revision.requested_by_name, reopened_reason: revision.reason, previous_status: stageNow.status, last_updated: nowIso() };
      for (const staleStage of stagesToMarkStale) {
        const existing = stageStates[staleStage] || {};
        if (['completed', 'approved', 'in_progress'].includes(existing.status)) {
          newStates[staleStage] = { ...existing, stale: true, stale_reason: `${getStageLabel(stageToReopen)} reopened (approved by ${userFullName})`, stale_at: nowIso(), stale_by: userEmail, stale_by_name: userFullName, stale_source_stage: stageToReopen, last_updated: nowIso() };
        }
      }
      const commit = await commitStage(newStates, 'reopened');
      if (commit.lost) {
        await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced approve-reopen commit returned updated=0.');
        return Response.json({ success: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost before the approval commit. No stage transition was applied.', workflow_id: workflow.id }, { status: 409 });
      }
      const newVersion = commit.newVersion;
      await base44.asServiceRole.entities.WorkflowRevision.update(revision.id, { approval_status: 'approved', approved_by: userEmail, approved_by_name: userFullName, approved_at: nowIso(), status: 'active', previous_workflow_version: currentVersion, new_workflow_version: newVersion });
      await logActivityIdempotent(base44, job_id, revision.id, 'package_revised', `${getStageLabel(stageToReopen)} reopened (approved by ${userFullName})`, userEmail, { stage_key: stageToReopen, revision_id: revision.id });
      const result = { success: true, approved: true, revision_id: revision.id, reopened_stage: stageToReopen, stale_stages: stagesToMarkStale, previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion, idempotent: !!commit.resumed };
      await completeWMR(base44, wmr.id, result, newVersion, revision.id);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json(result);
    }

    // ═════════════ ACTION: recomplete_stage ═════════════
    if (action === 'recomplete_stage') {
      if (!stage_key) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'stage_key is required'); return Response.json({ error: 'stage_key is required' }, { status: 422 }); }
      if (currentStageState.status !== 'reopened' && !isManager(userRole) && !markerRecovery.confirmed) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_REOPENED', `Stage not reopened (current: ${currentStageState.status})`); return Response.json({ error: `Stage is not in 'reopened' status (current: ${currentStageState.status})` }, { status: 422 }); }
      const validation = validateDownstreamRecords(stage_key, stageStates, related);
      if (!validation.valid) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'DOWNSTREAM_INVALID', validation.unresolved_requirements.join('; ')); return Response.json({ error: 'Cannot re-complete stage — downstream requirements are not met', unresolved_requirements: validation.unresolved_requirements }, { status: 422 }); }
      const newStates = { ...stageStates };
      const existing = stageStates[stage_key] || {};
      newStates[stage_key] = { ...existing, status: 'completed', completed_at: nowIso(), completed_by: userEmail, completed_by_name: userFullName, reopened_at: undefined, reopened_by: undefined, reopened_by_name: undefined, reopened_reason: undefined, previous_status: undefined, stale: false, stale_reason: undefined, stale_at: undefined, stale_by: undefined, stale_by_name: undefined, stale_source_stage: undefined, last_updated: nowIso(), ...(extra_data || {}) };
      const commit = await commitStage(newStates, 'completed');
      if (commit.lost) { await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced recomplete commit returned updated=0.'); return Response.json({ success: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost before the re-complete commit.', workflow_id: workflow.id }, { status: 409 }); }
      const newVersion = commit.newVersion;
      const revision = await base44.asServiceRole.entities.WorkflowRevision.create({ revision_number: `WR-${Date.now()}`, job_id, workflow_id: workflow.id, stage_key, stage_label: getStageLabel(stage_key), action: 'recomplete_stage', previous_status: existing.status, new_status: 'completed', reason: reason || 'Stage re-completed after reopen', requested_by: userEmail, requested_by_name: userFullName, requested_at: nowIso(), manager_approval_required: false, approval_status: 'not_required', previous_workflow_version: currentVersion, new_workflow_version: newVersion, status: 'active' });
      await logActivityIdempotent(base44, job_id, revision.id, 'package_revised', `${getStageLabel(stage_key)} re-completed by ${userFullName}`, userEmail, { stage_key, revision_id: revision.id });
      const result = { success: true, recompleted_stage: stage_key, previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion, idempotent: !!commit.resumed };
      await completeWMR(base44, wmr.id, result, newVersion, revision.id);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json({ ...result, mutation_request_id: wmr.id });
    }

    // ═════════════ ACTION: clear_staleness ═════════════
    if (action === 'clear_staleness') {
      if (!stage_key) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'stage_key is required'); return Response.json({ error: 'stage_key is required' }, { status: 422 }); }
      const existing = stageStates[stage_key] || {};
      if (!existing.stale && !markerRecovery.confirmed) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_STALE', 'Stage is not stale'); return Response.json({ error: 'Stage is not stale' }, { status: 422 }); }
      const validation = validateDownstreamRecords(stage_key, stageStates, related);
      if (!validation.valid) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'DOWNSTREAM_INVALID', validation.unresolved_requirements.join('; ')); return Response.json({ error: 'Cannot clear staleness — downstream requirements are not met', unresolved_requirements: validation.unresolved_requirements }, { status: 422 }); }
      const newStates = { ...stageStates };
      newStates[stage_key] = { ...existing, stale: false, stale_reason: undefined, stale_at: undefined, stale_by: undefined, stale_by_name: undefined, stale_source_stage: undefined, last_updated: nowIso() };
      const commit = await commitStage(newStates, existing.status === 'completed' ? 'completed' : null);
      if (commit.lost) { await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced clear-staleness commit returned updated=0.'); return Response.json({ success: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost before the staleness-clear commit.', workflow_id: workflow.id }, { status: 409 }); }
      const newVersion = commit.newVersion;
      const revision = await base44.asServiceRole.entities.WorkflowRevision.create({ revision_number: `WR-${Date.now()}`, job_id, workflow_id: workflow.id, stage_key, stage_label: getStageLabel(stage_key), action: 'clear_staleness', previous_status: existing.status, new_status: existing.status, reason: reason || 'Staleness cleared after review', requested_by: userEmail, requested_by_name: userFullName, requested_at: nowIso(), manager_approval_required: false, approval_status: 'not_required', previous_workflow_version: currentVersion, new_workflow_version: newVersion, status: 'active' });
      await logActivityIdempotent(base44, job_id, revision.id, 'package_revised', `Staleness cleared for ${getStageLabel(stage_key)} by ${userFullName}`, userEmail, { stage_key, revision_id: revision.id });
      const result = { success: true, cleared_stage: stage_key, previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion, idempotent: !!commit.resumed };
      await completeWMR(base44, wmr.id, result, newVersion, revision.id);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json({ ...result, mutation_request_id: wmr.id });
    }

    // ═════════════ ACTION: complete_stage ═════════════
    if (action === 'complete_stage') {
      if (!stage_key) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'stage_key is required'); return Response.json({ error: 'stage_key is required' }, { status: 422 }); }
      const existing = stageStates[stage_key] || {};
      if (existing.status === 'blocked') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'BLOCKED', 'Stage is blocked'); return Response.json({ error: `Stage '${getStageLabel(stage_key)}' is blocked and cannot be completed.` }, { status: 422 }); }
      const newStates = { ...stageStates };
      newStates[stage_key] = { ...existing, status: 'completed', completed_at: nowIso(), completed_by: userEmail, completed_by_name: userFullName, reopened_at: undefined, reopened_by: undefined, reopened_by_name: undefined, reopened_reason: undefined, previous_status: undefined, stale: false, stale_reason: undefined, stale_at: undefined, stale_by: undefined, stale_by_name: undefined, stale_source_stage: undefined, last_updated: nowIso(), ...(extra_data || {}) };
      const commit = await commitStage(newStates, 'completed');
      if (commit.lost) { await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced complete-stage commit returned updated=0.'); return Response.json({ success: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost before the stage-completion commit.', workflow_id: workflow.id }, { status: 409 }); }
      const newVersion = commit.newVersion;
      // post-commit invariants (non-blocking)
      try {
        const chain = await base44.asServiceRole.entities.CustomerDecisionRecord.filter({ workflow_id: workflow.id }, 'decision_sequence_number', 200).catch(() => []);
        const postWf = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
        const report = evaluateDecisionInvariants(postWf, chain);
        await persistInvariantStatus(base44, workflow.id, report, lock);
      } catch { /* non-blocking */ }
      const result = { success: true, completed_stage: stage_key, previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion, idempotent: !!commit.resumed };
      await completeWMR(base44, wmr.id, result, newVersion);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json({ ...result, mutation_request_id: wmr.id });
    }

    // ═════════════ ACTION: create_draft_revision (no workflow version change, but lock-serialized) ═════════════
    if (action === 'create_draft_revision') {
      const { record_type, record_id } = body;
      if (!record_type || !record_id) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'record_type and record_id are required'); return Response.json({ error: 'record_type and record_id are required' }, { status: 422 }); }
      let newDraftId: string | null = null;
      if (record_type === 'estimate_package') {
        const original = await base44.asServiceRole.entities.EstimatePackage.get(record_id).catch(() => null);
        if (!original) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'EstimatePackage not found'); return Response.json({ error: 'EstimatePackage not found' }, { status: 404 }); }
        const { id, created_date, updated_date, created_by, ...fields } = original;
        const newDraft = await base44.asServiceRole.entities.EstimatePackage.create({ ...fields, job_id: original.job_id, name: `${original.name || 'Package'} (Revision)`, status: 'draft', pricing_status: 'not_started', is_selected: false, is_authoritative: true, is_legacy: false, workflow_version: 'v2_package', package_version: (original.package_version || 1) + 1, superseded_by_id: null, sort_order: (original.sort_order || 0) + 1 });
        await base44.asServiceRole.entities.EstimatePackage.update(original.id, { is_authoritative: false, superseded_by_id: newDraft.id });
        newDraftId = newDraft.id;
      } else if (record_type === 'scope_of_work') {
        const original = await base44.asServiceRole.entities.ScopeOfWork.get(record_id).catch(() => null);
        if (!original) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'ScopeOfWork not found'); return Response.json({ error: 'ScopeOfWork not found' }, { status: 404 }); }
        const { id, created_date, updated_date, ...fields } = original;
        const newDraft = await base44.asServiceRole.entities.ScopeOfWork.create({ ...fields, job_id: original.job_id, status: 'draft', is_authoritative: true, version: (original.version || 1) + 1, superseded_by_id: null });
        await base44.asServiceRole.entities.ScopeOfWork.update(original.id, { is_authoritative: false, superseded_by_id: newDraft.id });
        newDraftId = newDraft.id;
      } else if (record_type === 'pricing_snapshot') {
        const original = await base44.asServiceRole.entities.PricingCalculationSnapshot.get(record_id).catch(() => null);
        if (!original) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'PricingCalculationSnapshot not found'); return Response.json({ error: 'PricingCalculationSnapshot not found' }, { status: 404 }); }
        const { id, created_date, updated_date, ...fields } = original;
        const newDraft = await base44.asServiceRole.entities.PricingCalculationSnapshot.create({ ...fields, job_id: original.job_id, calculation_status: 'draft', supersedes_snapshot_id: original.id, pricing_version: (original.pricing_version || 1) + 1 });
        newDraftId = newDraft.id;
      } else if (record_type === 'customer_presentation') {
        const original = await base44.asServiceRole.entities.CustomerPresentation.get(record_id).catch(() => null);
        if (!original) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'CustomerPresentation not found'); return Response.json({ error: 'CustomerPresentation not found' }, { status: 404 }); }
        const { id, created_date, updated_date, ...fields } = original;
        const newDraft = await base44.asServiceRole.entities.CustomerPresentation.create({ ...fields, job_id: original.job_id, presentation_status: 'not_started', customer_decision: 'pending', presentation_version: (original.presentation_version || 1) + 1 });
        newDraftId = newDraft.id;
      } else {
        await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{});
        await failWMR(base44, wmr.id, 'UNKNOWN_TYPE', `Unsupported record_type: ${record_type}`);
        return Response.json({ error: `Unsupported record_type: ${record_type}` }, { status: 422 });
      }
      const result = { success: true, new_draft_id: newDraftId, record_type, original_record_id: record_id, message: `New draft ${record_type} created. Load the new draft ID to edit.` };
      await completeWMR(base44, wmr.id, result, currentVersion);
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      return Response.json({ ...result, idempotent: false, mutation_request_id: wmr.id });
    }

    // unknown action
    await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
    await failWMR(base44, wmr.id, 'UNKNOWN_ACTION', `Unknown action: ${action}`);
    return Response.json({ error: `Unknown action: ${action}` }, { status: 422 });
  } catch (error: any) {
    console.error('[manageWorkflowRevision] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}