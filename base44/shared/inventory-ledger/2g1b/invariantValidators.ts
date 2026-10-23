// ═════════════════════════════════════════════════════════════════
// 2G1-B INVARIANT VALIDATORS
// validateTransferOutstandingConsistency + validateAllInvariants2G1B
// (wraps 2G1-A's validateAllInvariants)
// ═════════════════════════════════════════════════════════════════

import type { DomainState } from "../2g1a/domainState.ts";
import type { DomainError } from "../2g1a/resultTypes.ts";
import { validateAllInvariants } from "../2g1a/invariantValidators.ts";
import type { DomainError2G1B } from "./resultTypes.ts";
import { makeError2G1B } from "./resultTypes.ts";

// ─── New 2G1-B invariant: Transfer outstanding consistency (§11.2) ───
export function validateTransferOutstandingConsistency(state: DomainState): DomainError2G1B | null {
  for (const transferId of Object.keys(state.transfers_outstanding)) {
    const t = state.transfers_outstanding[transferId];
    if (t.received_quantity < 0) {
      return makeError2G1B(
        "STATE.WRONG_TRANSITION", "state",
        `Transfer ${transferId} has negative received_quantity: ${t.received_quantity}`,
        "<unknown>",
        { affected_field: "received_quantity", safe_context: { transfer_id: transferId, received_quantity: t.received_quantity } }
      );
    }
    if (t.received_quantity > t.dispatched_quantity) {
      return makeError2G1B(
        "STATE.WRONG_TRANSITION", "state",
        `Transfer ${transferId} received (${t.received_quantity}) exceeds dispatched (${t.dispatched_quantity})`,
        "<unknown>",
        { affected_field: "received_quantity", safe_context: { transfer_id: transferId, received: t.received_quantity, dispatched: t.dispatched_quantity } }
      );
    }
    const expectedStatus = t.received_quantity === t.dispatched_quantity ? "received" : "outstanding";
    if (t.status !== expectedStatus) {
      return makeError2G1B(
        "STATE.WRONG_TRANSITION", "state",
        `Transfer ${transferId} status mismatch: stored=${t.status}, expected=${expectedStatus}`,
        "<unknown>",
        { affected_field: "status", safe_context: { transfer_id: transferId, stored: t.status, expected: expectedStatus } }
      );
    }
  }
  return null;
}

// ─── Run all invariants: 2G1-A inherited + new 2G1-B (§11.1, §11.2) ───
export function validateAllInvariants2G1B(state: DomainState): DomainError2G1B[] {
  const errors: DomainError2G1B[] = [];
  const inherited: DomainError[] = validateAllInvariants(state);
  for (const e of inherited) {
    errors.push(e);
  }
  const transferError = validateTransferOutstandingConsistency(state);
  if (transferError) errors.push(transferError);
  return errors;
}