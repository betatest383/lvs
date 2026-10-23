import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PRIVILEGED = ['owner', 'admin'];
const CHECKPOINTS = new Set([
  'after_wmr_created', 'after_lock_acquired', 'after_cdr_created',
  'after_fenced_commit', 'after_revision_created', 'after_activity_log',
  'before_readiness', 'after_readiness', 'before_wmr_completed',
  'after_wmr_completed', 'before_lock_release', 'after_lock_release',
]);

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error_code: 'UNAUTHORIZED' }, { status: 401 });
  if (!PRIVILEGED.includes(user.role || 'user')) return Response.json({ ok: false, error_code: 'FORBIDDEN' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error_code: 'INVALID_JSON' }, { status: 400 }); }
  const { workflow_id, checkpoint, test_workflow_marker, test_authorization } = body || {};
  if (test_authorization !== 'I_AUTHORIZE_ISOLATED_WORKFLOW_FAULT_TEST') {
    return Response.json({ ok: false, error_code: 'EXPLICIT_TEST_AUTH_REQUIRED' }, { status: 403 });
  }
  if (!workflow_id || !CHECKPOINTS.has(checkpoint) || !String(test_workflow_marker || '').startsWith('isolated-family5-')) {
    return Response.json({ ok: false, error_code: 'INVALID_TEST_REQUEST' }, { status: 422 });
  }

  const db = base44.asServiceRole;
  const workflow = await db.entities.AppointmentWorkflow.get(workflow_id).catch(() => null);
  if (!workflow || workflow.test_workflow_marker !== test_workflow_marker) {
    return Response.json({ ok: false, error_code: 'ISOLATED_WORKFLOW_MARKER_REQUIRED' }, { status: 409 });
  }
  const pending = await db.entities.WorkflowFaultInjection.filter(
    { workflow_id, checkpoint, status: 'pending' }, '-created_at', 5,
  ).catch(() => []);
  if ((pending || []).some((x: any) => x.test_workflow_marker === test_workflow_marker)) {
    return Response.json({ ok: true, idempotent: true, injection: pending[0] });
  }

  const injection = await db.entities.WorkflowFaultInjection.create({
    workflow_id,
    test_workflow_marker,
    checkpoint,
    status: 'pending',
    created_by: user.email || user.id || '',
    created_at: new Date().toISOString(),
  });
  return Response.json({ ok: true, injection });
});
