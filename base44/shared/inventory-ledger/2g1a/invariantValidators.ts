// ═════════════════════════════════════════════════════════════════
// 2G1-A INVARIANT VALIDATORS
// ═════════════════════════════════════════════════════════════════

import type { DomainState } from "./domainState.ts";
import type { DomainError } from "./resultTypes.ts";
import { makeError } from "./resultTypes.ts";

// ─── Company-owned reconciliation ───
export function validateCompanyOwnedReconciliation(state: DomainState): DomainError | null {
  for (const itemId of Object.keys(state.company_ownership)) {
    const co = state.company_ownership[itemId];
    let sum = 0;
    for (const posId of Object.keys(state.positions)) {
      const pos = state.positions[posId];
      if (pos.item_id === itemId && pos.ownership_class === "company_owned") {
        if (pos.position_kind !== "terminal_job_cost") {
          sum += pos.position_quantity;
        }
      }
    }
    if (co.company_owned_quantity !== sum) {
      return makeError(
        "RECONCILIATION.COMPANY_OWNED_MISMATCH",
        "conservation",
        `Company-owned quantity mismatch for item ${itemId}: stored=${co.company_owned_quantity}, computed=${sum}`,
        "<unknown>",
        { affected_field: "company_owned_quantity", safe_context: { item_id: itemId, stored: co.company_owned_quantity, computed: sum } }
      );
    }
  }
  return null;
}

// ─── Terminal zero-balance ───
export function validateTerminalZeroBalance(state: DomainState): DomainError | null {
  for (const posId of Object.keys(state.positions)) {
    const pos = state.positions[posId];
    if (pos.position_kind === "terminal_job_cost" && pos.position_quantity !== 0) {
      return makeError(
        "STATE.WRONG_TRANSITION",
        "state",
        `Terminal position ${posId} has nonzero quantity: ${pos.position_quantity}`,
        "<unknown>",
        { affected_field: "position_quantity", safe_context: { position_id: posId, quantity: pos.position_quantity } }
      );
    }
  }
  return null;
}

// ─── JobIssueProgress reconciliation ───
export function validateJobIssueProgress(state: DomainState): DomainError | null {
  for (const issueId of Object.keys(state.job_issue_progress)) {
    const issue = state.job_issue_progress[issueId];
    const computed = issue.issued_quantity - issue.consumed_quantity - issue.returned_quantity;
    if (issue.outstanding_quantity !== computed) {
      return makeError(
        "RECONCILIATION.COMPANY_OWNED_MISMATCH",
        "conservation",
        `Issue ${issueId} outstanding mismatch: stored=${issue.outstanding_quantity}, computed=${computed}`,
        "<unknown>",
        { affected_field: "outstanding_quantity", safe_context: { issue_event_id: issueId } }
      );
    }
    if (issue.consumed_quantity + issue.returned_quantity > issue.issued_quantity) {
      return makeError(
        "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE",
        "conservation",
        `Issue ${issueId} consumed+returned exceeds issued`,
        "<unknown>",
        { affected_field: "consumed_quantity", safe_context: { issue_event_id: issueId } }
      );
    }
    const expectedStatus = issue.outstanding_quantity > 0 ? "open" : "closed";
    if (issue.status !== expectedStatus) {
      return makeError(
        "STATE.WRONG_TRANSITION",
        "state",
        `Issue ${issueId} status mismatch: stored=${issue.status}, expected=${expectedStatus}`,
        "<unknown>",
        { affected_field: "status", safe_context: { issue_event_id: issueId } }
      );
    }
  }
  return null;
}

// ─── CorrectionProvenanceRecord equation ───
export function validateCorrectionProvenance(state: DomainState): DomainError | null {
  for (const recId of Object.keys(state.correction_provenance)) {
    const p = state.correction_provenance[recId];
    const expectedRemaining = p.original_absolute_quantity - p.reversed_absolute_quantity;
    if (p.remaining_reversible_quantity !== expectedRemaining) {
      return makeError(
        "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE",
        "correction",
        `Provenance ${recId} remaining mismatch`,
        "<unknown>",
        { affected_field: "remaining_reversible_quantity", safe_context: { record_id: recId } }
      );
    }
  }
  return null;
}

// ─── Run all invariant checks ───
export function validateAllInvariants(state: DomainState): DomainError[] {
  const errors: DomainError[] = [];
  const co = validateCompanyOwnedReconciliation(state);
  if (co) errors.push(co);
  const tb = validateTerminalZeroBalance(state);
  if (tb) errors.push(tb);
  const ji = validateJobIssueProgress(state);
  if (ji) errors.push(ji);
  const cp = validateCorrectionProvenance(state);
  if (cp) errors.push(cp);
  return errors;
}