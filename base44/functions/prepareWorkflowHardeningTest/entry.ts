import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PRIVILEGED = ['owner', 'admin'];

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error_code: 'UNAUTHORIZED' }, { status: 401 });
  if (!PRIVILEGED.includes(user.role || 'user')) return Response.json({ ok: false, error_code: 'FORBIDDEN' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error_code: 'INVALID_JSON' }, { status: 400 }); }
  if (body?.test_authorization !== 'I_AUTHORIZE_ISOLATED_WORKFLOW_FAULT_TEST') {
    return Response.json({ ok: false, error_code: 'EXPLICIT_TEST_AUTH_REQUIRED' }, { status: 403 });
  }

  const db = base44.asServiceRole;
  const nonce = crypto.randomUUID();
  const marker = `isolated-family5-${nonce}`;
  const jobId = `TEST-FAMILY5-${nonce}`;
  const workflow = await db.entities.AppointmentWorkflow.create({
    job_id: jobId,
    customer_name: 'ISOLATED WORKFLOW HARDENING TEST — NOT A CUSTOMER',
    workflow_version: 'v2_package',
    workflow_revision_version: 0,
    customer_decision: 'pending',
    overall_progress: 0,
    crew_members: '[]',
    module_assignments: '{}',
    stage_states: '{}',
    conflict_locks: '{}',
    review_decisions: '{}',
    selected_modules: '[]',
    decision_lock_owner: '',
    decision_lock_token: '',
    decision_lock_generation: 0,
    decision_invariant_status: 'ok',
    test_workflow_marker: marker,
  });
  return Response.json({
    ok: true,
    isolated: true,
    workflow_id: workflow.id,
    job_id: jobId,
    test_workflow_marker: marker,
    workflow_revision_version: 0,
  });
});
