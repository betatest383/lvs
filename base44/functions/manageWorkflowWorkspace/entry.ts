import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { acquireWorkflowLock, releaseWorkflowLock } from '../../shared/workflowLock.ts';
import { fencedWorkflowMutationCommit, reconcileCommitMarker, markRetryableLockContention, markPermanentOutcome } from '../../shared/workflowCommit.ts';

const STAFF = ['owner','admin','manager','operations_manager','technician','lead_technician','apprentice','office_manager','csr'];
const MANAGERS = ['owner','admin','manager','operations_manager'];
const MODULES = ['interior','exterior'];
const STAGES = ['inspection_setup','interior_inspection','exterior_inspection','inspection_summary','ai_report_summary','recommendation_review','repair_system_review','estimate_package_builder','scope_of_work','dynamic_pricing','final_estimate_review','proposal_builder','customer_presentation','customer_decision','execution_plan','complete_appointment'];

const iso = () => new Date().toISOString();
const parse = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};
const isManager = (role: string) => MANAGERS.includes(role);

async function hashPayload(body: any) {
  const { idempotency_key, ...rest } = body;
  const text = JSON.stringify(rest, Object.keys(rest).sort());
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateWmr(db: any, body: any, user: any, workflow: any, action: string, stageKey: string) {
  const payloadHash = await hashPayload(body);
  const key = body.idempotency_key;
  if (!key || typeof key !== 'string' || key.length < 12) throw new Error('idempotency_key is required');
  const found = await db.entities.WorkflowMutationRequest.filter({ idempotency_key: key }, '-requested_at', 1).catch(() => []);
  let wmr = found?.[0] || null;
  if (wmr) {
    if (wmr.payload_hash !== payloadHash) return { error: 'payload_conflict', wmr };
    if (wmr.status === 'completed' && wmr.result_json) return { completed: true, wmr };
    return { wmr, payloadHash };
  }
  wmr = await db.entities.WorkflowMutationRequest.create({
    request_id: `WW-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    idempotency_key: key,
    workflow_id: workflow.id,
    job_id: workflow.job_id,
    mutation_action: `workspace_${action}`,
    stage_key: stageKey,
    expected_workflow_revision_version: Number(body.expected_workflow_revision_version || 0),
    payload_hash: payloadHash,
    requested_by: user.email || user.id || '',
    requested_by_name: user.full_name || '',
    requested_at: iso(),
    status: 'pending',
    post_commit_status: 'not_started',
    outcome_class: 'pending',
  });
  return { wmr, payloadHash };
}

async function auditOnce(db: any, workflow: any, wmr: any, label: string, details: any, user: any) {
  const events = await db.entities.JobActivityLog.filter({ job_id: workflow.job_id, event_type: 'workflow_workspace_mutation' }, '-timestamp', 100).catch(() => []);
  if ((events || []).some((e: any) => String(e.event_details || '').includes(wmr.id))) return;
  await db.entities.JobActivityLog.create({
    job_id: workflow.job_id,
    event_type: 'workflow_workspace_mutation',
    event_label: label,
    performed_by: user.email || user.id || '',
    timestamp: iso(),
    event_details: JSON.stringify({ mutation_request_id: wmr.id, ...details }),
  });
}

function response(data: any, status = 200) { return Response.json(data, { status }); }

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const user = await base44.auth.me().catch(() => null);
  if (!user) return response({ ok: false, error_code: 'UNAUTHORIZED' }, 401);
  const role = user.role || 'user';
  if (!STAFF.includes(role)) return response({ ok: false, error_code: 'FORBIDDEN' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return response({ ok: false, error_code: 'INVALID_JSON' }, 400); }
  const { action, workflow_id, job_id, expected_workflow_revision_version } = body || {};

  // Explicit, safe workflow provisioning. Caller cannot supply advanced state or locks.
  if (action === 'ensure_workflow') {
    if (!job_id) return response({ ok: false, error_code: 'JOB_REQUIRED' }, 422);
    const job = await db.entities.Job.get(job_id).catch(() => null);
    if (!job) return response({ ok: false, error_code: 'JOB_NOT_FOUND' }, 404);
    const existing = await db.entities.AppointmentWorkflow.filter({ job_id }, '-created_date', 5).catch(() => []);
    if (existing?.[0]) return response({ ok: true, workflow: existing[0], idempotent: true });
    const workflow = await db.entities.AppointmentWorkflow.create({
      job_id,
      appointment_id: body.appointment_id || '',
      customer_name: body.customer_name || job.customer_name || '',
      lead_technician_email: body.lead_technician_email || '',
      lead_technician_name: body.lead_technician_name || '',
      crew_members: '[]',
      module_assignments: '{}',
      stage_states: '{}',
      conflict_locks: '{}',
      review_decisions: '{}',
      selected_modules: '[]',
      customer_decision: 'pending',
      overall_progress: 0,
      workflow_version: 'v2_package',
      workflow_revision_version: 0,
      decision_lock_owner: '',
      decision_lock_token: '',
      decision_lock_generation: 0,
      decision_invariant_status: 'ok',
    });
    await db.entities.JobActivityLog.create({
      job_id, event_type: 'workflow_provisioned', event_label: 'Appointment workflow provisioned',
      performed_by: user.email || user.id || '', timestamp: iso(),
      event_details: JSON.stringify({ workflow_id: workflow.id, provisioned_by: user.email || user.id || '' }),
    }).catch(() => {});
    return response({ ok: true, workflow, idempotent: false });
  }

  const workflow = workflow_id ? await db.entities.AppointmentWorkflow.get(workflow_id).catch(() => null) : null;
  if (!workflow || (job_id && workflow.job_id !== job_id)) return response({ ok: false, error_code: 'WORKFLOW_NOT_FOUND' }, 404);
  if (!Number.isInteger(Number(expected_workflow_revision_version))) return response({ ok: false, error_code: 'EXPECTED_VERSION_REQUIRED' }, 422);

  const stageKey = action === 'set_stage_runtime_state' ? body.stage_key || '' : action || '';
  const wmrSetup = await getOrCreateWmr(db, body, user, workflow, action, stageKey);
  if (wmrSetup.error) return response({ ok: false, error_code: 'PAYLOAD_CONFLICT' }, 409);
  const wmr = wmrSetup.wmr;
  if (wmrSetup.completed) return response({ ...JSON.parse(wmr.result_json), ok: true, idempotent: true, mutation_request_id: wmr.id });

  const lockResult = await acquireWorkflowLock(base44, workflow.id, wmr.id, 30);
  if (!lockResult.acquired) {
    await markRetryableLockContention(base44, wmr.id, 'WORKFLOW_IN_PROGRESS', 'A workflow mutation is already in progress.');
    return response({ ok: false, retryable: true, error_code: 'WORKFLOW_IN_PROGRESS', mutation_request_id: wmr.id }, 409);
  }
  const lock = { token: lockResult.token, generation: lockResult.generation };
  try {
    const fresh = await db.entities.AppointmentWorkflow.get(workflow.id);
    const marker = await reconcileCommitMarker(base44, fresh, wmr, `workspace_${action}`, stageKey);
    if (marker.confirmed) {
      const final = { ok: true, action, workflow_id: fresh.id, workflow_revision_version: marker.version, idempotent: true, mutation_request_id: wmr.id };
      await db.entities.WorkflowMutationRequest.update(wmr.id, { status: 'completed', completed_at: iso(), post_commit_status: 'completed', final_result_json: JSON.stringify(final), result_json: JSON.stringify(final), outcome_class: 'previously_committed' });
      return response(final);
    }
    const version = Number(fresh.workflow_revision_version || 0);
    if (version !== Number(expected_workflow_revision_version)) {
      await markPermanentOutcome(base44, wmr.id, 'stale_version', 'STALE_VERSION', 'Refresh before retrying this workflow mutation.');
      return response({ ok: false, error_code: 'STALE_VERSION', current_workflow_revision_version: version }, 409);
    }

    let fields: Record<string, any> = {};
    let label = action;
    if (action === 'set_stage_runtime_state') {
      if (!STAGES.includes(body.stage_key) || !['available','in_progress'].includes(body.status)) return response({ ok: false, error_code: 'INVALID_STAGE_RUNTIME_STATE' }, 422);
      const states = parse(fresh.stage_states, {});
      const prior = states[body.stage_key] || {};
      states[body.stage_key] = { ...prior, status: body.status, started_at: body.status === 'in_progress' ? (prior.started_at || iso()) : prior.started_at, last_updated: iso() };
      fields = { stage_states: JSON.stringify(states) };
      label = `Stage ${body.stage_key} marked ${body.status}`;
    } else if (action === 'configure_inspection_setup') {
      const modules = Array.isArray(body.selected_modules) ? body.selected_modules.filter((m: any) => MODULES.includes(m)) : [];
      fields = { selected_modules: JSON.stringify([...new Set(modules)]) };
      label = 'Inspection modules configured';
    } else if (action === 'assign_module') {
      if (!isManager(role) && role !== 'lead_technician') return response({ ok: false, error_code: 'FORBIDDEN' }, 403);
      if (!MODULES.includes(body.module_key) || !body.assignee_email) return response({ ok: false, error_code: 'INVALID_MODULE_ASSIGNMENT' }, 422);
      const assignments = parse(fresh.module_assignments, {});
      assignments[body.module_key] = { ...(assignments[body.module_key] || {}), assigned_to_email: body.assignee_email, assigned_to_name: body.assignee_name || '', last_updated: iso() };
      fields = { module_assignments: JSON.stringify(assignments) };
      label = `Assigned ${body.module_key} inspection`;
    } else if (action === 'review_module') {
      if (!isManager(role) && role !== 'lead_technician') return response({ ok: false, error_code: 'FORBIDDEN' }, 403);
      if (!MODULES.includes(body.module_key) || !['approved','rejected'].includes(body.decision)) return response({ ok: false, error_code: 'INVALID_MODULE_REVIEW' }, 422);
      const reviews = parse(fresh.review_decisions, {});
      reviews[body.module_key] = { reviewed_by: user.email || user.id || '', reviewed_by_name: user.full_name || '', decision: body.decision, notes: String(body.notes || ''), reviewed_at: iso() };
      fields = { review_decisions: JSON.stringify(reviews) };
      label = `${body.module_key} inspection ${body.decision}`;
    } else if (['acquire_module_lock','release_module_lock','takeover_module_lock'].includes(action)) {
      if (!MODULES.includes(body.module_key)) return response({ ok: false, error_code: 'INVALID_MODULE_LOCK' }, 422);
      const locks = parse(fresh.conflict_locks, {});
      const existing = locks[body.module_key];
      const email = user.email || user.id || '';
      if (action === 'acquire_module_lock') {
        if (existing && existing.locked_by_email !== email) return response({ ok: false, retryable: true, error_code: 'MODULE_LOCKED', locked_by: existing }, 409);
        locks[body.module_key] = { locked_by_email: email, locked_by_name: user.full_name || '', locked_at: iso() };
      } else if (action === 'release_module_lock') {
        if (existing && existing.locked_by_email !== email && !isManager(role)) return response({ ok: false, error_code: 'LOCK_NOT_OWNED' }, 403);
        delete locks[body.module_key];
      } else {
        if (!isManager(role) || !String(body.reason || '').trim()) return response({ ok: false, error_code: 'TAKEOVER_NOT_AUTHORIZED' }, 403);
        locks[body.module_key] = { locked_by_email: email, locked_by_name: user.full_name || '', locked_at: iso(), takeover: true, takeover_reason: String(body.reason).trim() };
      }
      fields = { conflict_locks: JSON.stringify(locks) };
      label = `${action} ${body.module_key}`;
    } else if (action === 'update_crew_members') {
      if (!isManager(role) && role !== 'lead_technician') return response({ ok: false, error_code: 'FORBIDDEN' }, 403);
      if (!Array.isArray(body.crew_members)) return response({ ok: false, error_code: 'INVALID_CREW' }, 422);
      const crew = body.crew_members.slice(0, 20).map((m: any) => ({ email: String(m?.email || ''), name: String(m?.name || ''), role: String(m?.role || ''), employee_id: String(m?.employee_id || '') })).filter((m: any) => m.email);
      fields = { crew_members: JSON.stringify(crew) };
      label = 'Crew members updated';
    } else {
      return response({ ok: false, error_code: 'UNKNOWN_ACTION' }, 422);
    }

    const commit = await fencedWorkflowMutationCommit(base44, {
      workflowId: fresh.id, lockToken: lock.token, lockGeneration: lock.generation,
      expectedVersion: version, requestId: wmr.id, action: `workspace_${action}`, stageKey, fields,
    });
    if (!commit.committed) {
      const recheck = await db.entities.AppointmentWorkflow.get(fresh.id).catch(() => fresh);
      const verified = await reconcileCommitMarker(base44, recheck, wmr, `workspace_${action}`, stageKey);
      if (!verified.confirmed) {
        await markRetryableLockContention(base44, wmr.id, 'LOCK_OWNERSHIP_LOST', 'Workflow lock ownership changed before commit.');
        return response({ ok: false, retryable: true, error_code: 'LOCK_OWNERSHIP_LOST' }, 409);
      }
    }
    const finalVersion = commit.committed ? commit.resultingVersion : Number((await db.entities.AppointmentWorkflow.get(fresh.id)).workflow_revision_version);
    await auditOnce(db, fresh, wmr, label, { action, stage_key: stageKey, workflow_revision_version: finalVersion }, user);
    const final = { ok: true, action, workflow_id: fresh.id, workflow_revision_version: finalVersion, mutation_request_id: wmr.id, idempotent: !commit.committed };
    await db.entities.WorkflowMutationRequest.update(wmr.id, {
      status: 'completed', completed_at: iso(), resulting_workflow_revision_version: finalVersion,
      post_commit_status: 'completed', post_commit_steps_json: JSON.stringify({ activity_log: 'completed' }),
      outcome_class: commit.committed ? 'completed' : 'previously_committed',
      result_json: JSON.stringify(final), final_result_json: JSON.stringify(final),
    });
    return response(final);
  } finally {
    await releaseWorkflowLock(base44, workflow.id, lock.token, lock.generation, {}).catch(() => {});
  }
});