/**
 * Test-only crash injection. It is armed only by a separate privileged
 * endpoint, and only for a workflow already marked as an isolated test.
 * Customer payloads never select checkpoints.
 */
const iso = () => new Date().toISOString();

export async function maybeInjectWorkflowFault(
  base44: any,
  args: { workflow: any; checkpoint: string; mutationRequestId?: string; actor?: string },
) {
  const workflow = args.workflow;
  const marker = String(workflow?.test_workflow_marker || '');
  if (!marker.startsWith('isolated-family5-')) return;

  const db = base44.asServiceRole;
  const pending = await db.entities.WorkflowFaultInjection.filter(
    { workflow_id: workflow.id, checkpoint: args.checkpoint, status: 'pending' }, '-created_at', 2,
  ).catch(() => []);
  const injection = (pending || []).find((x: any) => x.test_workflow_marker === marker);
  if (!injection) return;

  const evidence = await db.entities.WorkflowFaultEvidence.create({
    workflow_id: workflow.id,
    mutation_request_id: args.mutationRequestId || '',
    checkpoint: args.checkpoint,
    test_workflow_marker: marker,
    injected_by: args.actor || 'trusted_test_harness',
    injected_at: iso(),
    details_json: JSON.stringify({
      injection_id: injection.id,
      workflow_revision_version: workflow.workflow_revision_version,
      lock_generation: workflow.decision_lock_generation,
    }),
  });
  await db.entities.WorkflowFaultInjection.update(injection.id, {
    status: 'triggered',
    triggered_at: iso(),
    mutation_request_id: args.mutationRequestId || '',
    evidence_id: evidence.id,
  });
  throw new Error(`TEST_FAULT_INJECTED:${args.checkpoint}:${evidence.id}`);
}
