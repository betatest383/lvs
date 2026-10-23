import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { acquireWorkflowLock, releaseWorkflowLock } from '../../shared/workflowLock.ts';
import { fencedWorkflowMutationCommit, reconcileCommitMarker, markPermanentOutcome } from '../../shared/workflowCommit.ts';
import { evaluateDecisionInvariants } from '../../shared/decisionInvariants.ts';

const MANAGERS = ['owner', 'admin', 'manager', 'operations_manager'];
const nowIso = () => new Date().toISOString();
const response = (data: any, status = 200) => Response.json(data, { status });

async function payloadHash(body: any) {
  const { idempotency_key, ...rest } = body;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function auditOnce(db: any, workflow: any, wmr: any, actor: any, details: any) {
  const prior = await db.entities.JobActivityLog.filter(
    { job_id: workflow.job_id, event_type: 'workflow_invariant_resolution' }, '-timestamp', 100,
  ).catch(() => []);
  if ((prior || []).some((x: any) => String(x.event_details || '').includes(wmr.id))) return;
  await db.entities.JobActivityLog.create({
    job_id: workflow.job_id,
    event_type: 'workflow_invariant_resolution',
    event_label: 'Workflow invariant exception resolved',
    performed_by: actor.email || actor.id || '',
    timestamp: nowIso(),
    event_details: JSON.stringify({ mutation_request_id: wmr.id, ...details }),
  });
}

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const user = await base44.auth.me().catch(() => null);
  if (!user) return response({ ok: false, error_code: 'UNAUTHORIZED' }, 401);
  if (!MANAGERS.includes(user.role || 'user')) return response({ ok: false, error_code: 'FORBIDDEN' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return response({ ok: false, error_code: 'INVALID_JSON' }, 400); }
  const { exception_id, workflow_id, expected_workflow_revision_version, idempotency_key, action, reason } = body || {};
  if (!exception_id || !workflow_id || !idempotency_key || !action || !reason) {
    return response({ ok: false, error_code: 'REQUIRED_FIELDS_MISSING' }, 422);
  }
  if (!['revalidated_clear', 'manager_override'].includes(action) || String(reason).trim().length < 10) {
    return response({ ok: false, error_code: 'INVALID_RESOLUTION' }, 422);
  }
  if (!Number.isInteger(Number(expected_workflow_revision_version))) {
    return response({ ok: false, error_code: 'EXPECTED_VERSION_REQUIRED' }, 422);
  }

  const [exception, workflow] = await Promise.all([
    db.entities.WorkflowInvariantException.get(exception_id).catch(() => null),
    db.entities.AppointmentWorkflow.get(workflow_id).catch(() => null),
  ]);
  if (!exception || exception.workflow_id !== workflow_id || !workflow) {
    return response({ ok: false, error_code: 'EXCEPTION_OR_WORKFLOW_NOT_FOUND' }, 404);
  }

  const hash = await payloadHash(body);
  const same = await db.entities.WorkflowMutationRequest.filter({ idempotency_key }, '-requested_at', 1).catch(() => []);
  let wmr = same?.[0] || null;
  if (wmr && wmr.payload_hash !== hash) return response({ ok: false, error_code: 'PAYLOAD_CONFLICT' }, 409);
  if (wmr?.status === 'completed' && wmr.result_json) {
    return response({ ...JSON.parse(wmr.result_json), ok: true, idempotent: true, mutation_request_id: wmr.id });
  }
  if (!wmr) {
    wmr = await db.entities.WorkflowMutationRequest.create({
      request_id: `WIR-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      idempotency_key,
      workflow_id,
      job_id: workflow.job_id,
      mutation_action: 'resolve_invariant_exception',
      stage_key: 'decision_invariants',
      expected_workflow_revision_version: Number(expected_workflow_revision_version),
      payload_hash: hash,
      requested_by: user.email || user.id || '',
      requested_by_name: user.full_name || '',
      requested_at: nowIso(),
      status: 'pending',
      post_commit_status: 'not_started',
      outcome_class: 'pending',
    });
  }

  const acquired = await acquireWorkflowLock(base44, workflow_id, wmr.id, 30);
  if (!acquired.acquired) {
    await db.entities.WorkflowMutationRequest.update(wmr.id, {
      status: 'retryable', error_code: 'WORKFLOW_IN_PROGRESS',
      error_message: 'A workflow mutation currently holds the shared lock.',
      outcome_class: 'transient_lock_contention', completed_at: null,
    });
    return response({ ok: false, retryable: true, error_code: 'WORKFLOW_IN_PROGRESS', mutation_request_id: wmr.id }, 409);
  }

  const lock = { token: acquired.token, generation: acquired.generation };
  try {
    const fresh = await db.entities.AppointmentWorkflow.get(workflow_id);
    const marker = await reconcileCommitMarker(base44, fresh, wmr, `invariant_resolution_${action}`, 'decision_invariants');
    let version = marker.version;

    if (!marker.confirmed) {
      version = Number(fresh.workflow_revision_version || 0);
      if (version !== Number(expected_workflow_revision_version)) {
        await markPermanentOutcome(base44, wmr.id, 'stale_version', 'STALE_VERSION', 'Refresh before resolving this exception.');
        return response({ ok: false, error_code: 'STALE_VERSION', current_workflow_revision_version: version }, 409);
      }

      const cdrs = await db.entities.CustomerDecisionRecord.filter({ workflow_id }, 'decision_sequence_number', 200).catch(() => []);
      const report = evaluateDecisionInvariants(fresh, cdrs);
      if (action === 'revalidated_clear' && report.blocking) {
        await markPermanentOutcome(base44, wmr.id, 'validation_failed', 'INVARIANTS_STILL_BLOCKING', 'The exception cannot be cleared because blocking evidence remains.');
        return response({ ok: false, error_code: 'INVARIANTS_STILL_BLOCKING', invariant_report: report }, 422);
      }

      const status = action === 'revalidated_clear' ? 'ok' : 'warning';
      const commit = await fencedWorkflowMutationCommit(base44, {
        workflowId: workflow_id,
        lockToken: lock.token,
        lockGeneration: lock.generation,
        expectedVersion: version,
        requestId: wmr.id,
        action: `invariant_resolution_${action}`,
        stageKey: 'decision_invariants',
        fields: {
          decision_invariant_status: status,
          decision_invariant_reason: JSON.stringify({
            resolution_action: action, exception_id, reason: String(reason).trim(), resolved_by: user.email || user.id || '',
          }),
          decision_invariant_detected_at: nowIso(),
        },
      });
      if (!commit.committed) {
        const recheck = await db.entities.AppointmentWorkflow.get(workflow_id).catch(() => fresh);
        const verified = await reconcileCommitMarker(base44, recheck, wmr, `invariant_resolution_${action}`, 'decision_invariants');
        if (!verified.confirmed) return response({ ok: false, error_code: 'LOCK_OWNERSHIP_LOST' }, 409);
        version = verified.version;
      } else {
        version = commit.resultingVersion;
      }
    }

    const priorResolution = await db.entities.WorkflowInvariantResolution
      .filter({ mutation_request_id: wmr.id }, '-resolved_at', 1).catch(() => []);
    if (!priorResolution?.[0]) {
      await db.entities.WorkflowInvariantResolution.create({
        exception_id,
        workflow_id,
        mutation_request_id: wmr.id,
        job_id: fresh.job_id,
        resolution_action: action,
        reason: String(reason).trim(),
        resolved_by: user.email || user.id || '',
        resolved_by_name: user.full_name || '',
        resolved_at: nowIso(),
        evidence_json: JSON.stringify({ exception_evidence: exception.evidence_json || null, workflow_revision_version: version }),
      });
    }

    const final = {
      ok: true, action, exception_id, workflow_id,
      workflow_revision_version: version,
      resolution_status: action === 'revalidated_clear' ? 'cleared' : 'manager_override_recorded',
      mutation_request_id: wmr.id,
    };
    await auditOnce(db, fresh, wmr, user, final);
    await db.entities.WorkflowMutationRequest.update(wmr.id, {
      status: 'completed',
      completed_at: nowIso(),
      resulting_workflow_revision_version: version,
      committed_workflow_revision_version: version,
      commit_confirmed: true,
      commit_marker_verified_at: nowIso(),
      post_commit_status: 'completed',
      post_commit_steps_json: JSON.stringify({ invariant_resolution: 'completed', activity_log: 'completed' }),
      outcome_class: marker.confirmed ? 'previously_committed' : 'completed',
      result_json: JSON.stringify(final),
      final_result_json: JSON.stringify(final),
    });
    return response(final);
  } catch (error: any) {
    return response({ ok: false, error_code: 'INVARIANT_RESOLUTION_FAILED', error: String(error?.message || error) }, 500);
  } finally {
    await releaseWorkflowLock(base44, workflow_id, lock.token, lock.generation, {}).catch(() => {});
  }
});
