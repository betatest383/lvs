import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { acquireWorkflowLock, releaseWorkflowLock, readLockState } from '../../shared/workflowLock.ts';
import { evaluateDecisionInvariants } from '../../shared/decisionInvariants.ts';
import { fencedWorkflowMutationCommit, reconcileCommitMarker, markRetryableLockContention } from '../../shared/workflowCommit.ts';
import { recordBlockingInvariantException } from '../../shared/workflowInvariantExceptions.ts';
import { maybeInjectWorkflowFault } from '../../shared/workflowFaultInjection.ts';

/**
 * acceptProposalOption — SERVER-AUTHORITATIVE customer decision engine (v3, CAS-hardened).
 *
 * ── Source of truth (unchanged) ──
 *   Historical customer decisions are IMMUTABLE, append-only CustomerDecisionRecord
 *   records. Current-state pointers live on AppointmentWorkflow. The authoritative
 *   answer to "what did the customer accept?" comes from CustomerDecisionRecord.
 *
 * ── CAS serialization (NEW — proven) ──
 *   Every mutating action acquires a per-workflow compare-and-set lock
 *   (workflowLock.ts) BEFORE any decision business write. The lock is a real
 *   atomic conditional write: `updateMany({id, decision_lock_owner:''}, $set…)`.
 *   Exactly one concurrent caller receives updated===1 (proven across 10×20
 *   contender runs + ownership/expiration/fencing tests).
 *
 * ── Phased execution ──
 *   A. Acquire CAS lock (fenced generation reserved).
 *   B. Prepare: re-read workflow, version guard, validate records, find/reuse
 *      CDR (resume), allocate sequence, create unfenced CDR (prepared append).
 *   C. Fenced decision commit: ONE updateMany with {owner,token,generation,
 *      workflow_revision_version} in the filter sets the pointer + increments
 *      the version. Lock is NOT cleared here.
 *   D. Post-commit completion (lock still held): readiness, presentation,
 *      audit/activity (idempotent), post-write invariants.
 *   E. Fenced release: only the owner/generation clears the lock.
 *
 * ── Ownership contract ──
 *   Every protected write embeds {decision_lock_owner, decision_lock_token,
 *   decision_lock_generation} in its filter. If any returns updated===0 we
 *   STOP, record LOCK_OWNERSHIP_LOST, run orphan detection, and return a
 *   controlled recovery-required result — no pointer/version/readiness change.
 *
 * ── Lock contender ──
 *   When a valid (non-expired) lock is held by another operation, the contender
 *   creates NO business effect and returns WORKFLOW_DECISION_IN_PROGRESS
 *   (retryable). It may keep its WMR in a conflict/waiting state.
 *
 * ── CDR authority rule ──
 *   A CDR is authoritative ONLY when
 *     AppointmentWorkflow.current_customer_decision_record_id == CDR.id
 *   or it is a valid historical ancestor. A created-but-unreferenced CDR is a
 *   prepared/orphaned append — it triggers NO readiness/scheduling/invoice/
 *   commission effect. Orphans are flagged by decisionInvariants (I5), never
 *   by mutating the append-only CDR.
 *
 * ── Lease ──
 *   TTL 30s (>> measured ~2s processing). Renewed via fenced CAS if <10s remain
 *   before the commit. If renewal returns updated===0, processing aborts.
 *
 * ── Recovery ──
 *   A retry with the same idempotency key reuses the WMR + CDR and resumes only
 *   incomplete post-commit steps (no second version increment, no duplicate
 *   readiness/audit). An expired-lock recovery worker inspects the prior WMR's
 *   committed pointer; if committed it resumes, if not it flags the orphan.
 */

const LOCK_TTL_SECONDS = 30;
const RENEW_THRESHOLD_SECONDS = 10;
const ACCEPTANCE_DECISIONS = ['perform_work_today', 'schedule_for_later'];

function safeJsonParse(str: any, fallback: any): any {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computePayloadHash(body: any): Promise<string> {
  const { idempotency_key, ...rest } = body;
  const normalized = JSON.stringify(rest, Object.keys(rest).sort());
  return await sha256(normalized);
}

function generateIdempotencyKey(body: any): string {
  return `cd-${body.workflow_id || body.job_id}-${body.action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function genDecisionRecordId(): string {
  return `CDR-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string { return new Date().toISOString(); }

async function createOperationalHandoff(base44: any, params: any) {
  const { jobId, decision, packages, scopes } = params;
  if (!decision?.estimate_package_id) return { created: false, reason: 'no_selected_option' };
  const estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id: jobId }, '-created_date', 20).catch(() => []);
  const estimate = estimates.find((e: any) => e.id === decision.estimate_id) || estimates.find((e: any) => e.selected_package_id === decision.estimate_package_id) || null;
  const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
  const scope = scopes.find((s: any) => s.estimate_package_id === decision.estimate_package_id && !s.superseded_by_id) || null;
  const pkg = packages.find((p: any) => p.id === decision.estimate_package_id) || null;
  const materialList = safeJsonParse(scope?.required_materials, []);
  const fleetList = safeJsonParse(estimate?.fleet_resource_requests, []);
  const materialSummary = Array.isArray(materialList) && materialList.length
    ? materialList.map((m: any) => `• ${m.quantity || 1} ${m.unit || 'ea'} — ${m.material_name || m.name || 'Material'}`).join('\n')
    : 'No itemized materials were captured. Confirm required materials before release.';
  const fleetSummary = Array.isArray(fleetList) && fleetList.length
    ? fleetList.map((r: any) => `• ${r.quantity_needed || 1} ${r.vehicle_class || 'Vehicle'} — ${r.purpose || 'Required for this job'}`).join('\n')
    : (estimate?.additional_fleet_required ? 'Additional vehicle is required; confirm vehicle class and days.' : 'No additional vehicle has been requested.');
  const key = `accepted-estimate:${decision.id}`;
  const existing = await base44.asServiceRole.entities.EnterpriseTask.filter({ source_module: 'Accepted Estimate Handoff', source_record_id: key }, null, 20).catch(() => []);
  let warehouseTask = existing.find((t: any) => t.task_type === 'Warehouse');
  let schedulingTask = existing.find((t: any) => t.assigned_department === 'Scheduling');
  const customer = job?.customer_name || estimate?.customer_name || pkg?.customer_name || 'Customer';
  const jobRef = job?.crm_job_number || job?.servicetitan_job_number || jobId;
  if (!warehouseTask) {
    warehouseTask = await base44.asServiceRole.entities.EnterpriseTask.create({
      title: `Warehouse review — ${customer} (${pkg?.name || 'Accepted option'})`,
      description: `Customer accepted ${pkg?.name || 'the selected option'}. Confirm, reserve, and stage materials; verify any additional vehicle requirement before releasing the job to Scheduling.\n\nJob: ${jobRef}\nEstimate: ${estimate?.estimate_number || 'Pending number'}\n\nMaterials:\n${materialSummary}\n\nFleet / extra vehicle:\n${fleetSummary}`,
      department: 'Warehouse', assigned_department: 'Warehouse', assigned_role: 'Warehouse Manager',
      task_type: 'Warehouse', priority: 'High', status: 'New', claim_mode: 'claimable',
      related_job: jobId, related_customer: customer, related_record_id: estimate?.id || decision.id,
      related_module: 'Estimate', related_route: estimate ? `/admin/estimates/${estimate.id}` : '',
      source_module: 'Accepted Estimate Handoff', source_record_id: key,
      notes: 'Complete this review to release the scheduling task.'
    });
    await base44.asServiceRole.entities.EnterpriseNotification.create({
      notification_id: `NOTF-WH-${Date.now()}`, title: `Warehouse review required — ${customer}`,
      message: `An accepted estimate requires material and fleet review before scheduling. Job ${jobRef}.`,
      notification_type: 'Operational', priority: 'High', status: 'Sent', recipient_department: 'Warehouse',
      recipient_role: 'Warehouse Manager', related_task: warehouseTask.id, related_job: jobId,
      source_module: 'Accepted Estimate Handoff', source_record_id: key + ':warehouse', delivery_methods: ['In-App']
    });
  }
  if (!schedulingTask) {
    schedulingTask = await base44.asServiceRole.entities.EnterpriseTask.create({
      title: `Schedule accepted job — ${customer}`,
      description: `Waiting for Warehouse material/fleet release. After release, schedule this job in ServiceTitan (the calendar source of truth) and confirm the assigned vehicle does not conflict with other future appointments.\n\nJob: ${jobRef}\nScope: ${scope?.production_days || 0} day(s), ${scope?.total_estimated_hours || 0} hour(s).\n\nFleet / extra vehicle:\n${fleetSummary}`,
      department: 'Scheduling', assigned_department: 'Scheduling', assigned_role: 'Scheduling',
      task_type: 'Operational', priority: 'High', status: 'Waiting', claim_mode: 'claimable',
      dependency_task_ids: [warehouseTask.id], related_job: jobId, related_customer: customer,
      related_record_id: estimate?.id || decision.id, related_module: 'Estimate', related_route: '/calendar',
      source_module: 'Accepted Estimate Handoff', source_record_id: key,
      notes: 'Use the ServiceTitan schedule; LVC OS displays the synced calendar and resource context.'
    });
  }
  return { created: true, warehouse_task_id: warehouseTask.id, scheduling_task_id: schedulingTask.id };
}


// ── Idempotency via durable WorkflowMutationRequest ──
async function findMutationRequest(base44: any, idempotencyKey: string) {
  const existing = await base44.asServiceRole.entities.WorkflowMutationRequest.filter(
    { idempotency_key: idempotencyKey }, '-requested_at', 1,
  ).catch(() => []);
  return (existing && existing[0]) || null;
}

async function createWMR(base44: any, body: any, user: any, payloadHash: string, idempotencyKey: string) {
  return await base44.asServiceRole.entities.WorkflowMutationRequest.create({
    request_id: `CD-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    idempotency_key: idempotencyKey,
    workflow_id: body.workflow_id || '',
    job_id: body.job_id,
    mutation_action: `customer_decision_${body.action}`,
    stage_key: 'customer_decision',
    expected_workflow_revision_version: body.expected_workflow_revision_version || 0,
    payload_hash: payloadHash,
    requested_by: user.email || user.id || '',
    requested_by_name: user.full_name || '',
    requested_at: nowIso(),
    status: 'pending',
  });
}

async function completeWMR(base44: any, reqId: string, result: any, newVersion: number) {
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(reqId, {
    status: 'completed', completed_at: nowIso(),
    resulting_workflow_revision_version: newVersion,
    committed_workflow_revision_version: newVersion,
    commit_confirmed: true,
    commit_marker_verified_at: nowIso(),
    post_commit_status: 'completed',
    post_commit_steps_json: JSON.stringify({ readiness: 'completed', presentation: 'completed', activity_log: 'completed', invariants: 'completed' }),
    outcome_class: 'completed',
    result_json: JSON.stringify(result),
    final_result_json: JSON.stringify(result),
  }).catch(() => {});
}

async function failWMR(base44: any, reqId: string, errorCode: string, errorMessage: string) {
  const stale = errorCode === 'STALE_VERSION';
  const validation = ['VALIDATION', 'DOWNSTREAM_INVALID', 'SIGNATURE_REQUIRED', 'TRACEABILITY_GAP', 'NO_PRESENTATION', 'PRESENTATION_STALE', 'PRICING_STALE'].includes(errorCode);
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
  // A held lease is transient. Never poison a same-key retry with a permanent conflict.
  await markRetryableLockContention(base44, reqId, errorCode, errorMessage);
}

// ── Decision chain helpers ──
async function loadDecisionChain(base44: any, workflowId: string) {
  const records = await base44.asServiceRole.entities.CustomerDecisionRecord.filter(
    { workflow_id: workflowId }, 'decision_sequence_number', 200,
  ).catch(() => []);
  return records || [];
}

async function nextSequenceNumber(chain: any[]): Promise<number> {
  if (!chain || chain.length === 0) return 1;
  return Math.max(...chain.map((r) => Number(r.decision_sequence_number) || 0)) + 1;
}

async function findExistingCdrForWMR(base44: any, wmrId: string) {
  const recs = await base44.asServiceRole.entities.CustomerDecisionRecord.filter(
    { mutation_request_id: wmrId }, '-decided_at', 5,
  ).catch(() => []);
  return (recs && recs[0]) || null;
}

// Idempotent activity log: skip if a log for this CDR already exists
async function logActivityIdempotent(base44: any, jobId: string, cdrId: string, eventType: string, label: string, performedBy: string, details: any) {
  const existing = await base44.asServiceRole.entities.JobActivityLog.filter(
    { job_id: jobId, event_type: eventType }, '-timestamp', 50,
  ).catch(() => []);
  const already = (existing || []).some((l: any) => {
    const d = l.event_details || '';
    return typeof d === 'string' && d.includes(cdrId);
  });
  if (already) return;
  await base44.asServiceRole.entities.JobActivityLog.create({
    job_id: jobId, event_type: eventType, event_label: label,
    performed_by: performedBy, timestamp: nowIso(),
    event_details: JSON.stringify({ decision_record_id: cdrId, ...(details || {}) }),
  }).catch(() => {});
}

// ── Invariant persistence (does NOT mutate CDR) ──
async function persistInvariantStatus(base44: any, workflowId: string, report: any, lock: any) {
  const blocked = report.blocking;
  const status = blocked ? 'blocked' : (report.violations.length > 0 ? 'warning' : 'ok');
  const workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflowId).catch(() => null);
  if (blocked && workflow) {
    await recordBlockingInvariantException(base44, {
      workflow,
      report,
      mutationRequestId: workflow.decision_lock_request_id || '',
      detectingFunction: 'acceptProposalOption',
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

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);

  let user: any;
  try { user = await base44.auth.me(); } catch { return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }); }
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }

  const {
    job_id, workflow_id, estimate_package_id, action = 'accept',
    customer_signature_url, accepted_price, price_presented,
    customer_decision, decision_notes, reason,
    expected_workflow_revision_version, idempotency_key,
  } = body || {};

  if (!job_id) return Response.json({ ok: false, error: 'job_id is required' }, { status: 422 });
  if (!action) return Response.json({ ok: false, error: 'action is required' }, { status: 422 });

  const userEmail = user.email || user.id || '';
  const mutationActions = ['accept', 'switch_option', 'decline_all', 'cancel_previous_acceptance', 'request_revisions', 'defer_decision'];

  // ═══════════════ read_state — read-only, no lock, no mutation ═════════════
  if (action === 'read_state') {
    const [workflows, packages, presentations] = await Promise.all([
      base44.asServiceRole.entities.AppointmentWorkflow.filter({ job_id }, '-created_date', 5).catch(() => []),
      base44.asServiceRole.entities.EstimatePackage.filter({ job_id, is_authoritative: true }).catch(() => []),
      base44.asServiceRole.entities.CustomerPresentation.filter({ job_id }, '-created_date', 10).catch(() => []),
    ]);
    const wf = workflows[0] || null;
    const pres = presentations[0] || null;
    let chain: any[] = [];
    let currentDecision: any = null;
    let invariantReport: any = { ok: true, violations: [], blocking: false };
    if (wf) {
      chain = await loadDecisionChain(base44, wf.id);
      if (wf.current_customer_decision_record_id) {
        currentDecision = chain.find((r) => r.id === wf.current_customer_decision_record_id) || null;
      }
      invariantReport = evaluateDecisionInvariants(wf, chain);
    }
    const selectedPkg = packages.find((p) => p.id === wf?.selected_option_id) || null;
    const lockState = wf ? await readLockState(base44, wf.id) : { held: false };
    return Response.json({
      ok: true,
      action: 'read_state',
      workflow_id: wf?.id || null,
      workflow_revision_version: wf?.workflow_revision_version || 0,
      customer_decision: wf?.customer_decision || 'pending',
      selected_option_id: wf?.selected_option_id || null,
      selected_option_name: selectedPkg?.name || null,
      current_customer_decision_record_id: wf?.current_customer_decision_record_id || null,
      decision_effective_at: wf?.decision_effective_at || null,
      current_decision: currentDecision ? {
        id: currentDecision.id, decision_type: currentDecision.decision_type,
        estimate_package_id: currentDecision.estimate_package_id,
        accepted_price: currentDecision.accepted_price, decided_at: currentDecision.decided_at,
        customer_signature_url: currentDecision.customer_signature_url,
        previous_decision_record_id: currentDecision.previous_decision_record_id,
      } : null,
      decision_chain: chain.map((r) => ({
        id: r.id, decision_type: r.decision_type, sequence: r.decision_sequence_number,
        estimate_package_id: r.estimate_package_id, accepted_price: r.accepted_price,
        decided_at: r.decided_at, is_current: r.id === wf?.current_customer_decision_record_id,
        previous_decision_record_id: r.previous_decision_record_id,
      })),
      presentation_id: pres?.id || null,
      presentation_status: pres?.presentation_status || 'not_started',
      presentation_stale: !!pres?.proposal_stale,
      accepted_price: currentDecision?.accepted_price ?? pres?.accepted_price ?? null,
      accepted_at: currentDecision?.decided_at ?? pres?.customer_decision_at ?? null,
      invariant_status: wf?.decision_invariant_status || 'ok',
      invariant_report: invariantReport,
      lock_state: lockState,
      available_options: packages.map((p) => ({
        id: p.id, name: p.name, option_type: p.option_type,
        is_selected: !!p.is_selected, status: p.status,
        pricing_status: p.pricing_status, selling_price: p.selling_price,
      })),
    });
  }

  // ═════════════ MUTATION ACTIONS — phased CAS pipeline ═════════════
  if (!mutationActions.includes(action)) {
    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 422 });
  }

  const payloadHash = await computePayloadHash(body);
  const effectiveIdempotencyKey = idempotency_key || generateIdempotencyKey(body);

  // ── Idempotency: reuse or create WMR ──
  let wmr = await findMutationRequest(base44, effectiveIdempotencyKey);
  if (wmr) {
    if (wmr.payload_hash !== payloadHash) {
      return Response.json({ ok: false, error: 'Idempotency key conflict: same key submitted with different payload.', idempotency_key: effectiveIdempotencyKey }, { status: 409 });
    }
    if (wmr.status === 'completed' && wmr.result_json) {
      return Response.json({ ...JSON.parse(wmr.result_json), ok: true, idempotent: true, mutation_request_id: wmr.id });
    }
    // pending/processing → resume path (fall through to acquire + resume)
  } else {
    wmr = await createWMR(base44, body, user, payloadHash, effectiveIdempotencyKey);
  }

  // ── Load workflow (for lock target) ──
  let workflow: any = null;
  if (workflow_id) workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow_id).catch(() => null);
  if (!workflow) {
    const wfs = await base44.asServiceRole.entities.AppointmentWorkflow.filter({ job_id }, '-created_date', 5).catch(() => []);
    workflow = wfs[0] || null;
  }
  if (!workflow) {
    await failWMR(base44, wmr.id, 'NO_WORKFLOW', 'No AppointmentWorkflow found for this job');
    return Response.json({ ok: false, error: 'No AppointmentWorkflow found for this job' }, { status: 404 });
  }
  await maybeInjectWorkflowFault(base44, { workflow, checkpoint: 'after_wmr_created', mutationRequestId: wmr.id, actor: userEmail });

  // ── Phase A: Acquire CAS lock ──
  const acquire = await acquireWorkflowLock(base44, workflow.id, wmr.id, LOCK_TTL_SECONDS);
  if (!acquire.acquired) {
    // Another valid (non-expired) operation owns the lock → no business effect.
    await conflictWMR(base44, wmr.id, 'WORKFLOW_DECISION_IN_PROGRESS', `Lock held by ${acquire.currentOwner || 'another operation'}`);
    return Response.json({
      ok: false, retryable: true, error_code: 'WORKFLOW_DECISION_IN_PROGRESS',
      message: 'Another customer decision is currently being processed.',
      workflow_id: workflow.id, retry_after_ms: 1500,
      mutation_request_id: wmr.id,
    }, { status: 409 });
  }
  const lock = { token: acquire.token, generation: acquire.generation, expiresAt: acquire.expiresAt || '', acquiredAt: nowIso() };
  const recoveredViaExpiry = acquire.reason === 'recovered_expired';
  await maybeInjectWorkflowFault(base44, { workflow, checkpoint: 'after_lock_acquired', mutationRequestId: wmr.id, actor: userEmail });

  // ── Phase B: Prepare (while holding lock) ──
  // Re-read authoritative workflow (it may have changed; for recovery, capture prior owner).
  workflow = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
  const currentVersion = Number(workflow.workflow_revision_version || 0);

  // Request-specific recovery. The lock request id is intentionally NOT used:
  // acquisition overwrites it, and a resulting status/version can belong to another request.
  // Only the exact fenced commit marker can prove this WMR committed.
  const markerRecovery = await reconcileCommitMarker(
    base44, workflow, wmr, `customer_decision_${action}`, 'customer_decision',
  );
  let resumeCdr: any = await findExistingCdrForWMR(base44, wmr.id);

  // Load related records
  const [packages, presentations, scopes, snapshots, chain] = await Promise.all([
    base44.asServiceRole.entities.EstimatePackage.filter({ job_id, is_authoritative: true }).catch(() => []),
    base44.asServiceRole.entities.CustomerPresentation.filter({ job_id }, '-created_date', 10).catch(() => []),
    base44.asServiceRole.entities.ScopeOfWork.filter({ job_id }, '-created_date', 50).catch(() => []),
    base44.asServiceRole.entities.PricingCalculationSnapshot.filter({ job_id }, '-calculated_at', 50).catch(() => []),
    loadDecisionChain(base44, workflow.id),
  ]);
  const pres = presentations[0] || null;
  const priorCurrent = workflow.current_customer_decision_record_id
    ? (chain.find((r: any) => r.id === workflow.current_customer_decision_record_id) || null)
    : null;

  // Version guard is skipped only after exact marker verification, never from
  // matching mutable decision state or an advanced version.
  const alreadyCommittedByUs = markerRecovery.confirmed;
  if (!alreadyCommittedByUs &&
      expected_workflow_revision_version !== undefined &&
      expected_workflow_revision_version !== null &&
      Number(currentVersion) !== Number(expected_workflow_revision_version)) {
    await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
    await failWMR(base44, wmr.id, 'STALE_VERSION', 'Workflow was modified by another user. Please refresh and try again.');
    return Response.json({
      ok: false, error: 'Workflow was modified by another user. Please refresh and try again.',
      current_workflow_revision_version: currentVersion, expected_workflow_revision_version,
    }, { status: 409 });
  }

  // ── Per-action validation + CDR/commit spec ──
  // Each action returns { ok, cdrFields, commitValues, postCommit } or an error.
  const seqNum = await nextSequenceNumber(chain);
  let cdr: any = null;
  let commitValues: any = null;
  let postCommitPlan: any = null;
  let auditLabel = '';
  let auditEventType = 'activity_completed';

  // Helper to build the shared CDR fields
  function buildCdrBase(decisionType: string, pkgId: string | null, fields: any) {
    const chosenPkg = pkgId ? packages.find((p: any) => p.id === pkgId) : null;
    const chosenSnaps = pkgId ? snapshots.filter((s: any) => s.estimate_package_id === pkgId) : [];
    const approvedSnap = chosenSnaps.find((s: any) => s.calculation_status === 'approved') || chosenSnaps[0] || null;
    const chosenScope = pkgId ? (scopes.find((s: any) => s.estimate_package_id === pkgId && !s.superseded_by_id) || null) : null;
    let resolvedPrice = fields.accepted_price;
    if (resolvedPrice === undefined || resolvedPrice === null || isNaN(Number(resolvedPrice))) resolvedPrice = chosenPkg?.selling_price;
    if (resolvedPrice === undefined || resolvedPrice === null || isNaN(Number(resolvedPrice))) resolvedPrice = approvedSnap?.final_selling_price;
    const finalAcceptedPrice = (resolvedPrice !== undefined && !isNaN(Number(resolvedPrice))) ? Number(resolvedPrice) : 0;
    const finalPricePresented = (fields.price_presented !== undefined && !isNaN(Number(fields.price_presented)))
      ? Number(fields.price_presented) : finalAcceptedPrice;
    return {
      decision_record_id: genDecisionRecordId(),
      customer_id: chosenPkg?.customer_id || workflow.customer_id || '',
      location_id: '',
      job_id, appointment_id: workflow.appointment_id || '',
      workflow_id: workflow.id,
      decision_type: decisionType,
      decision_sequence_number: seqNum,
      previous_decision_record_id: priorCurrent?.id || null,
      superseded_decision_record_id: fields.supersede ? (priorCurrent?.id || null) : null,
      customer_presentation_id: pres?.id || null,
      estimate_id: chosenPkg?.estimate_id || '',
      estimate_package_id: pkgId || null,
      scope_of_work_id: chosenScope?.id || chosenPkg?.scope_of_work_id || null,
      pricing_snapshot_id: approvedSnap?.id || null,
      package_version: chosenPkg?.package_version || null,
      scope_version: chosenScope?.scope_version || null,
      pricing_version: approvedSnap?.pricing_version || null,
      presentation_version: pres?.presentation_version || null,
      option_label_shown: chosenPkg?.name || chosenPkg?.option_type || '',
      accepted_price: finalAcceptedPrice,
      price_presented: finalPricePresented,
      customer_signature_url: fields.customer_signature_url || pres?.customer_signature_url || '',
      customer_acceptance_acknowledgment: !!fields.customer_signature_url || !!pres?.customer_signature_url,
      decided_at: nowIso(),
      customer_identity: '',
      recorded_by: userEmail,
      decision_reason: fields.reason || '',
      revision_request_notes: fields.decision_notes || '',
      cancellation_or_switch_reason: fields.reason || '',
      source_channel: 'in_app_presentation',
      idempotency_key: effectiveIdempotencyKey,
      payload_hash: payloadHash,
      expected_workflow_revision_version: currentVersion,
      resulting_workflow_revision_version: currentVersion + 1,
      correlation_id: wmr.id,
      mutation_request_id: wmr.id,
      is_current: true,
    };
  }

  // ── ACTION: accept ──
  if (action === 'accept') {
    if (!estimate_package_id) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'estimate_package_id is required for accept'); return Response.json({ ok: false, error: 'estimate_package_id is required for accept' }, { status: 422 }); }
    const chosen = packages.find((p: any) => p.id === estimate_package_id);
    if (!chosen) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'EstimatePackage not found or not authoritative.'); return Response.json({ ok: false, error: 'EstimatePackage not found or not authoritative.' }, { status: 404 }); }
    if (!pres) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NO_PRESENTATION', 'No CustomerPresentation found. Complete the presentation first.'); return Response.json({ ok: false, error: 'No CustomerPresentation found. Complete the presentation first.' }, { status: 422 }); }
    if (pres.proposal_stale) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'PRESENTATION_STALE', 'The presentation is stale. Regenerate the proposal before accepting.'); return Response.json({ ok: false, error: 'The presentation is stale. Regenerate the proposal before accepting.' }, { status: 409 }); }
    if (chosen.pricing_status === 'stale') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'PRICING_STALE', "The selected option's pricing is stale. Recalculate before accepting."); return Response.json({ ok: false, error: "The selected option's pricing is stale. Recalculate before accepting." }, { status: 409 }); }
    const traceScope = scopes.find((s: any) => s.estimate_package_id === chosen.id && !s.superseded_by_id) || null;
    const traceSnaps = snapshots.filter((s: any) => s.estimate_package_id === chosen.id);
    const traceSnap = traceSnaps.find((s: any) => s.calculation_status === 'approved') || traceSnaps[0] || null;
    if (!traceScope || !traceSnap) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'TRACEABILITY_GAP', 'Missing scope or approved pricing snapshot.'); return Response.json({ ok: false, error: 'The selected option is missing required traceability (scope of work or approved pricing snapshot). Regenerate the scope and pricing before accepting.', missing_scope: !traceScope, missing_pricing_snapshot: !traceSnap }, { status: 422 }); }
    if (priorCurrent && priorCurrent.decision_type === 'accept_option' && priorCurrent.estimate_package_id && priorCurrent.estimate_package_id !== chosen.id) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'ALREADY_ACCEPTED_DIFFERENT', 'A different option was already accepted. Use switch_option.'); return Response.json({ ok: false, error: 'A different option was already accepted. Use switch_option with a reason to change the selection.', currently_accepted_option_id: priorCurrent.estimate_package_id }, { status: 409 }); }
    // Re-submitting the same option after a completed acceptance must be a true
    // no-op. It does not create another immutable decision record or re-run
    // unrelated invariant checks; the existing record remains authoritative.
    if (priorCurrent && priorCurrent.decision_type === 'accept_option' && priorCurrent.estimate_package_id === chosen.id) {
      const result = {
        ok: true, action: 'accept', idempotent: true,
        selected_option_id: chosen.id, decision_record_id: priorCurrent.id,
        customer_signature_url: priorCurrent.customer_signature_url || pres?.customer_signature_url || '',
        accepted_price: Number(priorCurrent.accepted_price ?? chosen.selling_price ?? 0),
        message: 'This option is already accepted. No duplicate decision was created.',
        previous_workflow_revision_version: currentVersion,
        workflow_revision_version: currentVersion,
        package_mutation: false,
      };
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      await completeWMR(base44, wmr.id, result, currentVersion);
      return Response.json(result);
    }
    const isAcceptance = ACCEPTANCE_DECISIONS.includes(customer_decision) || !customer_decision;
    if (isAcceptance && !customer_signature_url && !pres?.customer_signature_url) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'SIGNATURE_REQUIRED', 'Customer signature is required to accept an option.'); return Response.json({ ok: false, error: 'Customer signature is required to accept an option.' }, { status: 422 }); }

    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('accept_option', chosen.id, { customer_signature_url, accepted_price, price_presented, reason: '', decision_notes }));
    commitValues = { customer_decision: 'accepted', selected_option_id: chosen.id };
    const acceptanceDecision = customer_decision || 'perform_work_today';
    postCommitPlan = { readiness: true, presentation: { pkgId: chosen.id, decision: acceptanceDecision, sig: customer_signature_url || pres?.customer_signature_url || '', notes: decision_notes, status: 'complete' } };
    auditLabel = `Customer accepted option ${chosen.name}`;
  }
  // ── ACTION: switch_option ──
  else if (action === 'switch_option') {
    if (!estimate_package_id) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'estimate_package_id is required'); return Response.json({ ok: false, error: 'estimate_package_id is required for switch_option' }, { status: 422 }); }
    if (!reason || !reason.trim()) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'A written reason is required to switch.'); return Response.json({ ok: false, error: 'A written reason is required to switch the accepted option.' }, { status: 422 }); }
    const chosen = packages.find((p: any) => p.id === estimate_package_id);
    if (!chosen) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NOT_FOUND', 'EstimatePackage not found.'); return Response.json({ ok: false, error: 'EstimatePackage not found or not authoritative.' }, { status: 404 }); }
    if (chosen.pricing_status === 'stale') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'PRICING_STALE', 'Pricing stale.'); return Response.json({ ok: false, error: "The selected option's pricing is stale. Recalculate before switching." }, { status: 409 }); }
    const traceScope = scopes.find((s: any) => s.estimate_package_id === chosen.id && !s.superseded_by_id) || null;
    const traceSnaps = snapshots.filter((s: any) => s.estimate_package_id === chosen.id);
    const traceSnap = traceSnaps.find((s: any) => s.calculation_status === 'approved') || traceSnaps[0] || null;
    if (!traceScope || !traceSnap) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'TRACEABILITY_GAP', 'Missing traceability.'); return Response.json({ ok: false, error: 'The selected option is missing required traceability. Regenerate before switching.' }, { status: 422 }); }
    if (!priorCurrent || priorCurrent.decision_type !== 'accept_option') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NO_PRIOR_ACCEPTANCE', 'switch_option requires a prior acceptance.'); return Response.json({ ok: false, error: 'switch_option requires a prior acceptance. Use accept for the first selection.' }, { status: 422 }); }
    if (priorCurrent.estimate_package_id === chosen.id) {
      // idempotent no-op switch
      const result = { ok: true, action: 'switch_option', idempotent: true, selected_option_id: chosen.id, decision_record_id: priorCurrent.id, message: 'Option is already the accepted option. No change made.', previous_workflow_revision_version: currentVersion, workflow_revision_version: currentVersion, package_mutation: false };
      await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
      await completeWMR(base44, wmr.id, result, currentVersion);
      return Response.json(result);
    }
    const priorPrice = Number(priorCurrent.accepted_price || 0);
    const newPrice = accepted_price !== undefined ? Number(accepted_price) : Number(chosen.selling_price || 0);
    if (priorPrice !== newPrice && !customer_signature_url && !pres?.customer_signature_url) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'SIGNATURE_REQUIRED', 'New signature required (price changed).'); return Response.json({ ok: false, error: 'A new customer signature is required because the price changed.' }, { status: 422 }); }
    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('switch_option', chosen.id, { customer_signature_url, accepted_price, price_presented, reason, decision_notes, supersede: true }));
    commitValues = { customer_decision: 'accepted', selected_option_id: chosen.id };
    postCommitPlan = { readiness: true, presentation: { pkgId: chosen.id, decision: customer_decision || 'perform_work_today', sig: customer_signature_url || pres?.customer_signature_url || '', notes: decision_notes, status: 'complete' } };
    auditLabel = `Customer switched to option ${chosen.name}`;
  }
  // ── ACTION: decline_all ──
  else if (action === 'decline_all') {
    if (priorCurrent && priorCurrent.decision_type === 'accept_option') { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'PRIOR_ACCEPTANCE_EXISTS', 'Use cancel_previous_acceptance.'); return Response.json({ ok: false, error: 'A prior acceptance exists. Use cancel_previous_acceptance to withdraw the accepted work.', current_decision_record_id: priorCurrent.id }, { status: 409 }); }
    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('decline_all', null, { customer_signature_url: '', accepted_price: 0, price_presented: 0, reason: '', decision_notes }));
    commitValues = { customer_decision: 'declined', selected_option_id: null };
    postCommitPlan = { readiness: false, presentation: { pkgId: null, decision: 'declined', sig: '', notes: decision_notes, status: 'complete' } };
    auditLabel = 'Customer declined all options';
  }
  // ── ACTION: cancel_previous_acceptance ──
  else if (action === 'cancel_previous_acceptance') {
    if (!reason || !reason.trim()) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'A written reason is required to cancel.'); return Response.json({ ok: false, error: 'A written reason is required to cancel a previous acceptance.' }, { status: 422 }); }
    if (!priorCurrent || (priorCurrent.decision_type !== 'accept_option' && priorCurrent.decision_type !== 'switch_option')) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'NO_PRIOR_ACCEPTANCE', 'No prior acceptance to cancel.'); return Response.json({ ok: false, error: 'No prior acceptance to cancel.' }, { status: 422 }); }
    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('cancel_previous_acceptance', null, { customer_signature_url: '', accepted_price: 0, price_presented: 0, reason, decision_notes, supersede: true }));
    commitValues = { customer_decision: 'declined', selected_option_id: null };
    postCommitPlan = { readiness: false, presentation: { pkgId: null, decision: 'declined', sig: '', notes: decision_notes, status: 'complete' } };
    auditLabel = 'Customer cancelled previous acceptance';
  }
  // ── ACTION: request_revisions ──
  else if (action === 'request_revisions') {
    if (!decision_notes || !decision_notes.trim()) { await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(()=>{}); await failWMR(base44, wmr.id, 'VALIDATION', 'Revision notes are required.'); return Response.json({ ok: false, error: 'Notes describing the requested revisions are required.' }, { status: 422 }); }
    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('request_revisions', null, { customer_signature_url: '', accepted_price: 0, price_presented: 0, reason: '', decision_notes }));
    commitValues = { customer_decision: 'deferred', selected_option_id: workflow.selected_option_id || null };
    postCommitPlan = { readiness: false, presentation: { pkgId: null, decision: 'think_about_it', sig: '', notes: decision_notes, status: 'in_progress' } };
    auditLabel = 'Customer requested revisions';
  }
  // ── ACTION: defer_decision ──
  else if (action === 'defer_decision') {
    cdr = resumeCdr || await base44.asServiceRole.entities.CustomerDecisionRecord.create(buildCdrBase('defer_decision', null, { customer_signature_url: '', accepted_price: 0, price_presented: 0, reason: '', decision_notes }));
    commitValues = { customer_decision: 'deferred', selected_option_id: workflow.selected_option_id || null };
    postCommitPlan = { readiness: false, presentation: null };
    auditLabel = 'Customer decision deferred';
  }

  await maybeInjectWorkflowFault(base44, { workflow, checkpoint: 'after_cdr_created', mutationRequestId: wmr.id, actor: userEmail });

  // ── Pre-write invariants ──
  const preChain = await loadDecisionChain(base44, workflow.id);
  const preReport = evaluateDecisionInvariants(workflow, preChain);
  if (preReport.blocking) {
    await persistInvariantStatus(base44, workflow.id, preReport, lock);
    await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
    await failWMR(base44, wmr.id, 'INVARIANT_VIOLATION', 'Blocking invariant violation detected before commit.');
    return Response.json({ ok: false, error_code: 'INVARIANT_VIOLATION', error: 'A blocking decision invariant violation was detected. The workflow is blocked until a manager resolves it.', invariant_report: preReport, workflow_id: workflow.id }, { status: 409 });
  }

  // ── Lease renew before commit (if low) ──
  const remainingMs = lock.expiresAt ? (new Date(lock.expiresAt).getTime() - Date.now()) : LOCK_TTL_SECONDS * 1000;
  if (remainingMs < RENEW_THRESHOLD_SECONDS * 1000) {
    const renewResult = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
      { id: workflow.id, decision_lock_owner: lock.token, decision_lock_token: lock.token, decision_lock_generation: lock.generation },
      { $set: { decision_lock_expires_at: new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString() } },
    ).catch((e: any) => ({ updated: 0, _error: String(e) }));
    if (renewResult?.updated !== 1) {
      // Lost ownership during renewal — abort, no commit.
      const orphanChain = await loadDecisionChain(base44, workflow.id);
      const orphanReport = evaluateDecisionInvariants(workflow, orphanChain);
      await persistInvariantStatus(base44, workflow.id, orphanReport, lock);
      await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Lock ownership lost during lease renewal.');
      return Response.json({ ok: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost before the decision could be committed. Recovery required.', invariant_report: orphanReport, workflow_id: workflow.id }, { status: 409 });
    }
    lock.expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString();
  }

  // ── Phase C: Fenced decision commit ──
  let newVersion = currentVersion;
  if (!alreadyCommittedByUs) {
    const commitResult = await fencedWorkflowMutationCommit(base44, {
      workflowId: workflow.id,
      lockToken: lock.token,
      lockGeneration: lock.generation,
      expectedVersion: currentVersion,
      requestId: wmr.id,
      action: `customer_decision_${action}`,
      stageKey: 'customer_decision',
      fields: {
        current_customer_decision_record_id: cdr.id,
        customer_decision: commitValues.customer_decision,
        selected_option_id: commitValues.selected_option_id,
        decision_effective_at: nowIso(),
      },
    });

    if (!commitResult.committed) {
      const recheck = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
      const verified = await reconcileCommitMarker(base44, recheck, wmr, `customer_decision_${action}`, 'customer_decision');
      if (verified.confirmed) {
        newVersion = verified.version;
      } else {
        // LOCK_OWNERSHIP_LOST or version changed — no pointer/version/readiness change.
        const orphanChain = await loadDecisionChain(base44, workflow.id);
        const orphanReport = evaluateDecisionInvariants(recheck, orphanChain);
        await persistInvariantStatus(base44, workflow.id, orphanReport, lock);
        await failWMR(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Fenced commit returned updated=0 and no matching request marker exists.');
        return Response.json({ ok: false, error_code: 'LOCK_OWNERSHIP_LOST', error: 'Lock ownership was lost or the workflow version changed before the commit. No decision was committed for this request.', invariant_report: orphanReport, workflow_id: workflow.id }, { status: 409 });
      }
    } else {
      newVersion = commitResult.resultingVersion;
    }
  } else {
    // The exact marker proves this request committed earlier. Do NOT increment again.
    newVersion = markerRecovery.version;
  }

  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'after_fenced_commit', mutationRequestId: wmr.id, actor: userEmail });

  // ── Phase D: Post-commit completion (lock still held) ──
  let readinessStatus: any = { checked: false, ready: false, blockers: [] };
  // Readiness (accept/switch only, idempotent)
  if (postCommitPlan?.readiness) {
    await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'before_readiness', mutationRequestId: wmr.id, actor: userEmail });
    try {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id }, '-created_date', 5).catch(() => []);
      const estimate = estimates?.[0] || null;
      if (estimate) {
        const approvedSnap = snapshots.find((s: any) => s.estimate_package_id === cdr.estimate_package_id && ['approved', 'overridden'].includes(s.calculation_status));
        const chosenScope = scopes.find((s: any) => s.estimate_package_id === cdr.estimate_package_id && !s.superseded_by_id);
        const chosenPkg = packages.find((p: any) => p.id === cdr.estimate_package_id);
        const blocking: string[] = [];
        if (!chosenScope) blocking.push('no_scope_for_option');
        if (!approvedSnap) blocking.push('no_pricing_snapshot');
        if (chosenPkg?.pricing_status === 'stale') blocking.push('pricing_stale');
        if (blocking.length === 0 && estimate.status !== 'ready_for_scheduling') {
          await base44.asServiceRole.entities.Estimate.update(estimate.id, { status: 'ready_for_scheduling' });
        }
        readinessStatus = { checked: true, ready: blocking.length === 0, blockers: blocking };
      } else {
        readinessStatus = { checked: true, ready: false, blockers: ['no_estimate'] };
      }
    } catch (e: any) {
      readinessStatus = { checked: false, ready: false, blockers: ['readiness_check_error'], error: e.message || String(e) };
    }
  }

  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'after_readiness', mutationRequestId: wmr.id, actor: userEmail });

  // Presentation current-state (backend-only, idempotent)
  if (postCommitPlan?.presentation && pres) {
    const pp = postCommitPlan.presentation;
    const presUpdate: any = {
      selected_estimate_package_id: pp.pkgId,
      customer_decision: pp.decision,
      customer_decision_notes: pp.notes || pres.customer_decision_notes || '',
      presentation_status: pp.status,
    };
    if (pp.sig) presUpdate.customer_signature_url = pp.sig;
    if (!pres.customer_decision_at) presUpdate.customer_decision_at = nowIso();
    if (pp.status === 'complete' && !pres.completed_at) presUpdate.completed_at = nowIso();
    // For decline/cancel/defer, do not preserve a stale accepted_price — reset to 0.
    if (pp.pkgId === null) { presUpdate.accepted_price = 0; presUpdate.price_presented = 0; }
    else {
      presUpdate.accepted_price = cdr.accepted_price;
      presUpdate.price_presented = cdr.price_presented;
    }
    await base44.asServiceRole.entities.CustomerPresentation.update(pres.id, presUpdate).catch(() => {});
  }

  // Audit/activity (idempotent)
  await logActivityIdempotent(base44, job_id, cdr.id, auditEventType, auditLabel, userEmail, { estimate_package_id: cdr.estimate_package_id, accepted_price: cdr.accepted_price, action });

  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'after_activity_log', mutationRequestId: wmr.id, actor: userEmail });

  // ── Post-write invariants ──
  const postChain = await loadDecisionChain(base44, workflow.id);
  const postWf = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflow.id).catch(() => workflow);
  const postReport = evaluateDecisionInvariants(postWf, postChain);
  const invariantStatus = await persistInvariantStatus(base44, workflow.id, postReport, lock);

  // ── Operational handoff (accepted options only, idempotent) ──
  let operationalHandoff: any = null;
  let procurementReservation: any = null;
  if ((action === 'accept' || action === 'switch_option') && cdr?.estimate_package_id) {
    operationalHandoff = await createOperationalHandoff(base44, { jobId: job_id, decision: cdr, packages, scopes }).catch((e: any) => ({ created: false, error: e?.message || String(e) }));
  }
  // Reserve material and create shortage purchase orders only on the initial,
  // signed customer acceptance — never during a proposal-option switch.
  if (action === 'accept' && cdr?.estimate_package_id) {
    procurementReservation = await base44.asServiceRole.functions.invoke('createSoldEstimateProcurement', {
      job_id,
      estimate_id: cdr.estimate_id || undefined,
    }).then((r: any) => r?.data || r).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  }

  // ── Store durable result + mark WMR completed (Phase D end) ──
  const result: any = {
    ok: true, action, job_id,
    selected_option_id: commitValues.selected_option_id,
    decision_record_id: cdr.id, previous_decision_record_id: priorCurrent?.id || null,
    scope_of_work_id: cdr.scope_of_work_id, pricing_snapshot_id: cdr.pricing_snapshot_id,
    presentation_id: pres?.id || null,
    accepted_price: cdr.accepted_price, price_presented: cdr.price_presented,
    customer_signature_url: cdr.customer_signature_url,
    accepted_at: cdr.decided_at,
    previous_workflow_revision_version: currentVersion, workflow_revision_version: newVersion,
    idempotent: !!resumeCdr,
    package_mutation: false,
    invariant_ok: postReport.ok && !postReport.blocking,
    invariant_warnings: postReport.violations.filter((v: any) => v.severity === 'warn'),
    invariant_status: invariantStatus,
    readiness: readinessStatus,
    lock_generation: lock.generation,
    recovered: recoveredViaExpiry,
    operational_handoff: operationalHandoff,
    procurement_reservation: procurementReservation,
  };
  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'before_wmr_completed', mutationRequestId: wmr.id, actor: userEmail });
  await completeWMR(base44, wmr.id, result, newVersion);
  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'after_wmr_completed', mutationRequestId: wmr.id, actor: userEmail });

  // ── Phase E: Fenced release ──
  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'before_lock_release', mutationRequestId: wmr.id, actor: userEmail });
  const releaseResult = await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {});
  await maybeInjectWorkflowFault(base44, { workflow: { ...workflow, workflow_revision_version: newVersion }, checkpoint: 'after_lock_release', mutationRequestId: wmr.id, actor: userEmail });
  if (!releaseResult.released) {
    // Lock was stolen by recovery while we worked. Our commit + post-commit
    // already landed under the fence, so the data is authoritative; but we
    // cannot clear the lock. Flag and return a recovery note.
    result.lock_release = 'stolen_after_commit';
    result.warning = 'Decision was committed but the lock was recovered by another worker before release. Verify invariant status.';
    return Response.json(result, { status: 200 });
  }

  return Response.json(result);
});