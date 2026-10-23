/**
 * Request-specific fenced commit protocol for AppointmentWorkflow.
 *
 * A stage value and an advanced version never prove which request committed.
 * Only the marker written inside the same fenced update proves ownership.
 */

function nowIso(): string { return new Date().toISOString(); }

export type CommitMarker = {
  requestId: string;
  action: string;
  stageKey: string;
  resultingVersion: number;
};

export function markerMatches(
  workflow: any,
  requestId: string,
  action: string,
  stageKey: string,
): boolean {
  const version = Number(workflow?.workflow_revision_version);
  const committedAt = Date.parse(String(workflow?.last_workflow_mutation_committed_at || ''));
  return !!workflow
    && workflow.last_workflow_mutation_request_id === requestId
    && workflow.last_workflow_mutation_action === action
    && workflow.last_workflow_mutation_stage_key === stageKey
    && Number(workflow.last_workflow_mutation_version) === version
    && Number.isFinite(committedAt);
}

/** Persist the WMR-side confirmation only after the exact workflow marker matches. */
export async function reconcileCommitMarker(
  base44: any,
  workflow: any,
  wmr: any,
  action: string,
  stageKey: string,
): Promise<{ confirmed: boolean; version: number }> {
  if (!markerMatches(workflow, wmr?.id, action, stageKey)) {
    return { confirmed: false, version: Number(workflow?.workflow_revision_version || 0) };
  }
  const version = Number(workflow.workflow_revision_version);
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(wmr.id, {
    commit_confirmed: true,
    committed_workflow_revision_version: version,
    commit_marker_verified_at: nowIso(),
    post_commit_status: wmr.post_commit_status === 'completed' ? 'completed' : 'in_progress',
    outcome_class: wmr.post_commit_status === 'completed' ? 'previously_committed' : 'partially_completed',
  });
  return { confirmed: true, version };
}

/**
 * Performs the only authoritative AppointmentWorkflow commit for a mutation.
 * The marker, mutation fields, and version increment are in the exact same
 * compare-and-set update, fenced by the current lock ownership and version.
 */
export async function fencedWorkflowMutationCommit(
  base44: any,
  args: {
    workflowId: string;
    lockToken: string;
    lockGeneration: number;
    expectedVersion: number;
    requestId: string;
    action: string;
    stageKey: string;
    fields: Record<string, any>;
  },
): Promise<{ committed: boolean; resultingVersion: number }> {
  const resultingVersion = Number(args.expectedVersion) + 1;
  const committedAt = nowIso();
  const result = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    {
      id: args.workflowId,
      decision_lock_owner: args.lockToken,
      decision_lock_token: args.lockToken,
      decision_lock_generation: args.lockGeneration,
      workflow_revision_version: args.expectedVersion,
    },
    {
      $set: {
        ...args.fields,
        workflow_revision_version: resultingVersion,
        last_workflow_mutation_request_id: args.requestId,
        last_workflow_mutation_action: args.action,
        last_workflow_mutation_stage_key: args.stageKey,
        last_workflow_mutation_version: resultingVersion,
        last_workflow_mutation_committed_at: committedAt,
      },
    },
  ).catch(() => ({ updated: 0 }));

  if (result?.updated === 1) {
    await base44.asServiceRole.entities.WorkflowMutationRequest.update(args.requestId, {
      commit_confirmed: true,
      committed_workflow_revision_version: resultingVersion,
      commit_marker_verified_at: committedAt,
      post_commit_status: 'in_progress',
      outcome_class: 'committed',
    }).catch(() => {});
    return { committed: true, resultingVersion };
  }
  return { committed: false, resultingVersion: Number(args.expectedVersion) };
}

export async function markRetryableLockContention(base44: any, wmrId: string, code: string, message: string) {
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(wmrId, {
    status: 'retryable',
    error_code: code,
    error_message: message,
    outcome_class: 'transient_lock_contention',
    completed_at: null,
  }).catch(() => {});
}

export async function markPermanentOutcome(base44: any, wmrId: string, status: string, code: string, message: string) {
  await base44.asServiceRole.entities.WorkflowMutationRequest.update(wmrId, {
    status,
    error_code: code,
    error_message: message,
    completed_at: nowIso(),
    outcome_class: status === 'stale_version' ? 'stale_expected_version' : 'permanent_validation_failure',
  }).catch(() => {});
}
