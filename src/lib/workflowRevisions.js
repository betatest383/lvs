/**
 * Frontend helper for workflow revision operations.
 * Wraps the manageWorkflowRevision backend function — the SERVER is
 * authoritative for all revision operations (preview, reopen, approve,
 * deny, recomplete, clear staleness, complete stage, create draft).
 *
 * The frontend NEVER mutates stage_states directly for these operations.
 * If the server is unavailable or returns an error, no mutation occurs.
 * The caller must show a visible retryable error and preserve user input.
 *
 * ── Version Contract ──
 *   Uses the persisted integer field `workflow_revision_version` (not
 *   updated_date). Each mutation sends expected_workflow_revision_version.
 *   The server returns previous_workflow_revision_version + workflow_revision_version.
 *
 * ── Idempotency ──
 *   Each mutation generates an idempotency_key. The server stores a
 *   WorkflowMutationRequest record. Repeated requests with the same key
 *   and payload return the original result.
 */
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Handles errors from the backend function. NEVER throws — always
 * returns a structured result so the caller can show a retryable error
 * without crashing or losing user input.
 */
/**
 * Handles errors from the backend function. NEVER throws — always
 * returns a structured result so the caller can show a retryable error
 * without crashing or losing user input.
 *
 * All error returns include `ok: false` per the standardized contract.
 */
function handleError(error, conflictMsg, deniedMsg) {
  const status = error?.response?.status;
  const errorData = error?.response?.data;

  if (status === 409) {
    const msg = conflictMsg || errorData?.error || 'This job was just modified by another user. Please refresh and try again.';
    toast.error(msg);
    return { ok: false, retryable: true, error_code: 'conflict', message: msg, conflict: true, status: 409, data: errorData };
  }
  if (status === 403) {
    const msg = errorData?.error || deniedMsg || 'You do not have permission for this action.';
    toast.error(msg);
    return { ok: false, retryable: false, error_code: 'denied', message: msg, denied: true, status: 403, data: errorData };
  }
  if (status === 422) {
    const msg = errorData?.error || 'Invalid request.';
    toast.error(msg);
    return { ok: false, retryable: false, error_code: 'validation', message: msg, error: msg, status: 422, data: errorData, unresolved_requirements: errorData?.unresolved_requirements };
  }

  // Network error or server unavailable — show a retryable error
  const msg = 'The server could not be reached. Your changes were not saved. Please check your connection and try again.';
  toast.error(msg);
  console.error('[WorkflowRevisions] Server error:', error?.message || error);
  return { ok: false, retryable: true, error_code: 'network_unavailable', message: msg, error: msg, network_error: true, status: status || 0 };
}

/**
 * Normalizes ALL backend responses to the standardized contract:
 *   { ok, previous_workflow_revision_version, workflow_revision_version, idempotent, result }
 *
 * manageWorkflowRevision returns `success: true` + `workflow: {...}`.
 * acceptProposalOption returns `ok: true` + flat action fields.
 * Both are normalized to `ok: true/false` while preserving all original
 * fields at the top level for backward compatibility.
 */
function normalizeResponse(data) {
  if (!data) return { ok: false, retryable: true, error_code: 'no_response', message: 'No response from server.' };

  // acceptProposalOption already sets `ok` — respect it
  if (data.ok !== undefined) return { ...data, ok: !!data.ok };

  // manageWorkflowRevision uses `success` — map to `ok`
  if (data.success !== undefined) return { ...data, ok: !!data.success };

  // Error responses (no ok, no success) → ok: false
  return { ...data, ok: false };
}

/**
 * Generates a stable idempotency key for a mutation request.
 * Format: wmr-<workflow_id>-<action>-<stage_key>-<timestamp>-<random>
 */
function generateIdempotencyKey({ workflow_id, job_id, action, stage_key }) {
  return `wmr-${workflow_id || job_id}-${action}-${stage_key || ''}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Preview the impact of reopening a stage. Read-only — returns impacted
 * stages, permissions, warnings, affected records, and traceability
 * status from the server.
 */
export async function previewReopen({ job_id, workflow_id, stage_key, expected_workflow_revision_version, affected_recommendation_ids }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id, stage_key,
      action: 'preview_reopen',
      expected_workflow_revision_version,
      affected_recommendation_ids,
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Requests a stage reopen via the server-authoritative backend function.
 * If approval is required, creates a pending revision with NO workflow mutation.
 */
export async function reopenWorkflowStage({ job_id, workflow_id, stage_key, reason, expected_workflow_revision_version, affected_recommendation_ids }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id, stage_key,
      action: 'reopen',
      reason,
      expected_workflow_revision_version,
      affected_recommendation_ids,
      idempotency_key: generateIdempotencyKey({ workflow_id, action: 'reopen', stage_key }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Approves a pending reopen request. The backend enforces approver ≠ requester.
 */
export async function approveReopenRequest({ revision_id, decision, job_id, workflow_id, expected_workflow_revision_version }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      revision_id, job_id, workflow_id,
      action: decision === 'denied' ? 'deny_reopen' : 'approve_reopen',
      approval_decision: decision,
      expected_workflow_revision_version,
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Denies a pending reopen request. No workflow mutation occurs.
 */
export async function denyReopenRequest({ revision_id, job_id, workflow_id }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      revision_id, job_id, workflow_id,
      action: 'deny_reopen',
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Server-authoritative re-completion of a reopened stage.
 * The server validates downstream records are current before clearing.
 */
export async function recompleteStageServer({ job_id, workflow_id, stage_key, expected_workflow_revision_version, reason, extra_data }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id, stage_key,
      action: 'recomplete_stage',
      expected_workflow_revision_version,
      reason: reason || 'Stage re-completed after reopen',
      extra_data,
      idempotency_key: generateIdempotencyKey({ workflow_id, action: 'recomplete_stage', stage_key }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and re-complete.');
  }
}

/**
 * Server-authoritative staleness clearing. The server validates that
 * downstream records are current before clearing the stale flag.
 */
export async function clearStalenessServer({ job_id, workflow_id, stage_key, expected_workflow_revision_version, reason }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id, stage_key,
      action: 'clear_staleness',
      expected_workflow_revision_version,
      reason: reason || 'Staleness cleared after review',
      idempotency_key: generateIdempotencyKey({ workflow_id, action: 'clear_staleness', stage_key }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try again.');
  }
}

/**
 * Server-authoritative stage completion with optimistic concurrency.
 * NO fail-open: if the server is unavailable, no mutation occurs.
 */
export async function completeStageServer({ job_id, workflow_id, stage_key, expected_workflow_revision_version, extra_data }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id, stage_key,
      action: 'complete_stage',
      expected_workflow_revision_version,
      extra_data,
      idempotency_key: generateIdempotencyKey({ workflow_id, action: 'complete_stage', stage_key }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try again.');
  }
}

/**
 * Creates a new draft revision from an immutable (presented/accepted) record.
 * The backend creates the new draft and returns its ID. The frontend editor
 * must load the new draft ID — NOT the historical record ID.
 */
export async function createDraftRevision({ job_id, workflow_id, record_type, record_id, expected_workflow_revision_version }) {
  try {
    const response = await base44.functions.invoke('manageWorkflowRevision', {
      job_id, workflow_id,
      action: 'create_draft_revision',
      record_type, record_id,
      expected_workflow_revision_version,
      idempotency_key: generateIdempotencyKey({ workflow_id, action: 'create_draft_revision', stage_key: record_type }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Loads all workflow revisions for a job (audit history).
 */
export async function loadWorkflowRevisions(job_id) {
  try {
    const revisions = await base44.entities.WorkflowRevision.filter(
      { job_id }, '-requested_at', 100
    ).catch(() => []);
    return revisions;
  } catch (error) {
    console.error('[WorkflowRevisions] Failed to load:', error);
    return [];
  }
}

/**
 * Loads pending approval requests for a workflow.
 */
export async function loadPendingApprovals(workflow_id) {
  try {
    const revisions = await base44.entities.WorkflowRevision.filter(
      { workflow_id, approval_status: 'pending' },
      '-requested_at',
      20
    ).catch(() => []);
    return revisions;
  } catch (error) {
    console.error('[WorkflowRevisions] Failed to load pending approvals:', error);
    return [];
  }
}

/**
 * Checks whether a stage is currently stale and returns display info.
 */
export function getStageStaleInfo(stageState) {
  if (!stageState?.stale) return null;
  return {
    reason: stageState.stale_reason || 'Stage is stale due to upstream changes',
    at: stageState.stale_at,
    by: stageState.stale_by_name || stageState.stale_by,
    sourceStage: stageState.stale_source_stage,
  };
}

/**
 * Checks whether a stage is currently reopened.
 */
export function getStageReopenInfo(stageState) {
  if (stageState?.status !== 'reopened') return null;
  return {
    at: stageState.reopened_at,
    by: stageState.reopened_by_name || stageState.reopened_by,
    reason: stageState.reopened_reason,
    previousStatus: stageState.previous_status,
  };
}

// ════════════════════════════════════════════════════════════════════
//  CUSTOMER DECISION — server-authoritative via acceptProposalOption
// ════════════════════════════════════════════════════════════════════
// The frontend must NEVER directly write customer_decision, selected_option_id,
// EstimatePackage.is_selected, or CustomerPresentation decision fields.
// All mutations go through these wrappers. On ok:false, the caller must
// NOT advance the workflow, NOT close the dialog, NOT show a success toast.

function generateCustomerDecisionKey({ workflow_id, job_id, action, estimate_package_id }) {
  return `cd-${workflow_id || job_id}-${action}-${estimate_package_id || ''}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Read the current customer decision state (read-only).
 */
export async function readCustomerDecisionState({ job_id }) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id,
      action: 'read_state',
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Accept a proposal option. Server-authoritative, idempotent.
 * Returns { ok, previous_workflow_revision_version, workflow_revision_version }.
 */
export async function acceptProposalOptionServer({
  job_id,
  workflow_id,
  estimate_package_id,
  expected_workflow_revision_version,
  customer_signature_url,
  accepted_price,
  customer_decision,
  decision_notes,
  idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id,
      workflow_id,
      estimate_package_id,
      action: 'accept',
      expected_workflow_revision_version,
      customer_signature_url,
      accepted_price,
      customer_decision,
      decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'accept', estimate_package_id }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try accepting again.');
  }
}

/**
 * Switch the accepted option to a different option (controlled revision).
 */
export async function switchProposalOptionServer({
  job_id,
  workflow_id,
  estimate_package_id,
  expected_workflow_revision_version,
  reason,
  customer_signature_url,
  customer_decision,
  decision_notes,
  idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id,
      workflow_id,
      estimate_package_id,
      action: 'switch_option',
      expected_workflow_revision_version,
      reason,
      customer_signature_url,
      customer_decision,
      decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'switch_option', estimate_package_id }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try switching again.');
  }
}

/**
 * Decline all options. Preserves every presented option and price.
 */
export async function declineAllOptionsServer({
  job_id,
  workflow_id,
  expected_workflow_revision_version,
  decision_notes,
  idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id,
      workflow_id,
      action: 'decline_all',
      expected_workflow_revision_version,
      decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'decline_all' }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try declining again.');
  }
}

/**
 * Cancel a previous acceptance (controlled withdrawal). The prior acceptance
 * is preserved as an immutable CustomerDecisionRecord; a new cancel record is
 * linked to it. Requires a written reason.
 */
export async function cancelPreviousAcceptanceServer({
  job_id, workflow_id, expected_workflow_revision_version, reason, decision_notes, idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id, workflow_id,
      action: 'cancel_previous_acceptance',
      expected_workflow_revision_version, reason, decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'cancel_previous_acceptance' }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try cancelling again.');
  }
}

/**
 * Defer the customer decision (formal record). Preserves all options and prices.
 */
export async function deferDecisionServer({
  job_id, workflow_id, expected_workflow_revision_version, decision_notes, idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id, workflow_id,
      action: 'defer_decision',
      expected_workflow_revision_version, decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'defer_decision' }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try again.');
  }
}

/**
 * Request revisions / additional info. Preserves every option and price.
 */
export async function requestRevisionsServer({
  job_id,
  workflow_id,
  expected_workflow_revision_version,
  decision_notes,
  idempotency_key,
}) {
  try {
    const response = await base44.functions.invoke('acceptProposalOption', {
      job_id,
      workflow_id,
      action: 'request_revisions',
      expected_workflow_revision_version,
      decision_notes,
      idempotency_key: idempotency_key || generateCustomerDecisionKey({ workflow_id, action: 'request_revisions' }),
    });
    return normalizeResponse(response.data);
  } catch (error) {
    return handleError(error, 'This job was just modified. Please refresh and try again.');
  }
}