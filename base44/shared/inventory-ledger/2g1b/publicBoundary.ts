// ═════════════════════════════════════════════════════════════════
// 2G1-B PUBLIC BOUNDARY
// evaluateEvent2G1B, sortOperations2G1B, sortErrors2G1B
//
// Pure function: no SDK, no network, no I/O, no mutation of input state.
// Module is isolated and unreachable from production.
// ═════════════════════════════════════════════════════════════════

import type {
  EventType2G1A, ErrorCategory2G1A, UnitOfMeasure2G1A,
  TransferOutstandingStatus2G1A,
} from "../2g1a/eventTypes.ts";
import type {
  DomainState, DomainPosition, TransferOutstanding, AcceptedEventRecord,
} from "../2g1a/domainState.ts";
import { cloneDomainState, getPosition } from "../2g1a/domainState.ts";
import type { DomainEvent2G1A, E9Payload } from "../2g1a/payloads.ts";
import type {
  PositionQuantityEffect, CanonicalStateEffect2G1A,
} from "../2g1a/quantityEffects.ts";
import type {
  AtomicRecordOperation2G1A, AcceptedEventRecordInsertedOp,
  StateRevisionAdvancedOp, CorrectionProvenanceDownstreamBlockUpdatedOp,
} from "../2g1a/atomicRecordOps.ts";
import type {
  DomainResult2G1A, DomainWarning,
} from "../2g1a/resultTypes.ts";
import { isFiniteNumber, isPositiveFinite } from "../2g1a/unitOfMeasureRules.ts";
import { compareStrings, sortEffects, sortWarnings } from "../2g1a/comparator.ts";
import { evaluateEvent2G1A } from "../2g1a/publicBoundary.ts";

import type { DomainErrorCode2G1B } from "./eventTypes.ts";
import type {
  AtomicRecordOperation2G1B, RecordedDomainOperation2G1B,
  TransferOutstandingPartialReceiptUpdatedOp,
} from "./atomicRecordOps.ts";
import type {
  DomainError2G1B, AcceptedDomainResult2G1B, RejectedDomainResult2G1B,
  DomainResult2G1B,
} from "./resultTypes.ts";
import { makeError2G1B, makeRejected2G1B, FORMULA_VERSION_2G1B } from "./resultTypes.ts";
import { validateAllInvariants2G1B } from "./invariantValidators.ts";

// ═════════════════════════════════════════════════════════════════
// SORTERS (§8.2, §8.5 — compilation-proven, exact contract text)
// ═════════════════════════════════════════════════════════════════

function primarySortKey(op: AtomicRecordOperation2G1B): string {
  switch (op.op_kind) {
    case "transfer_outstanding_created":
      return op.transfer_id;
    case "transfer_outstanding_received":
      return op.transfer_id;
    case "transfer_outstanding_partial_receipt_updated":
      return op.transfer_id;
    case "correction_provenance_created":
      return op.record_id;
    case "correction_provenance_reversal_updated":
      return op.provenance_record_id;
    case "correction_provenance_downstream_block_updated":
      return op.provenance_record_id;
    case "job_issue_progress_created":
      return op.issue_event_id;
    case "job_issue_consumed_updated":
      return op.issue_event_id;
    case "job_issue_consumed_reversed":
      return op.issue_event_id;
    case "job_issue_returned_updated":
      return op.issue_event_id;
    case "accepted_event_record_inserted":
      return op.record.record_id;
    case "state_revision_advanced":
      return String(op.after_revision);
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

function secondarySortKey(op: AtomicRecordOperation2G1B): string {
  switch (op.op_kind) {
    case "correction_provenance_reversal_updated":
      return op.reversing_event_id;
    case "correction_provenance_downstream_block_updated":
      return op.blocking_event_id;
    case "job_issue_consumed_updated":
      return op.consumption_event_id;
    case "job_issue_consumed_reversed":
      return op.reversal_event_id;
    case "job_issue_returned_updated":
      return op.return_event_id;
    case "transfer_outstanding_created":
    case "transfer_outstanding_received":
    case "transfer_outstanding_partial_receipt_updated":
    case "correction_provenance_created":
    case "job_issue_progress_created":
    case "accepted_event_record_inserted":
    case "state_revision_advanced":
      return "";
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

export function sortOperations2G1B(
  operations: AtomicRecordOperation2G1B[]
): AtomicRecordOperation2G1B[] {
  return [...operations].sort((a, b) => {
    const ak = a.op_kind;
    const bk = b.op_kind;
    if (ak !== bk) return compareStrings(ak, bk);

    const c = compareStrings(primarySortKey(a), primarySortKey(b));
    if (c !== 0) return c;

    return compareStrings(secondarySortKey(a), secondarySortKey(b));
  });
}

export function sortErrors2G1B(
  errors: DomainError2G1B[]
): DomainError2G1B[] {
  return [...errors].sort((a, b) => {
    const c = compareStrings(a.category, b.category);
    if (c !== 0) return c;

    const c2 = compareStrings(a.error_code, b.error_code);
    if (c2 !== 0) return c2;

    const af = a.affected_field ?? "~";
    const bf = b.affected_field ?? "~";
    return compareStrings(af, bf);
  });
}

// ═════════════════════════════════════════════════════════════════
// STRUCTURAL VALIDATION (Step 4)
// ═════════════════════════════════════════════════════════════════

const BASE_REQUIRED_FIELDS = [
  "event_id", "event_type", "transaction_time", "posting_time",
  "source_document_type", "source_document_id", "idempotency_key",
  "requester", "notes",
];
const BASE_NULLABLE_FIELDS = ["source_document_number", "causation_id", "correlation_id"];

const E9_REQUIRED_FIELDS = ["transfer_id", "destination_position_id", "item_id", "quantity", "unit_of_measure"];
const E9_ALLOWED_KEYS = new Set([
  ...BASE_REQUIRED_FIELDS, ...BASE_NULLABLE_FIELDS, ...E9_REQUIRED_FIELDS,
]);

function validateStructure2G1B(raw: Record<string, unknown>): DomainError2G1B[] {
  const errors: DomainError2G1B[] = [];

  for (const f of BASE_REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null) {
      errors.push(makeError2G1B("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${f}`, "<unknown>", { affected_field: f }));
    }
  }
  for (const f of BASE_NULLABLE_FIELDS) {
    if (!(f in raw)) {
      errors.push(makeError2G1B("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${f}`, "<unknown>", { affected_field: f }));
    }
  }

  // source_document_type must be "transfer" (§3 step 4)
  if (raw.source_document_type !== "transfer") {
    errors.push(makeError2G1B("VALIDATION.INVALID_ENUM_VALUE", "validation", `source_document_type must be 'transfer', got: ${raw.source_document_type}`, "<unknown>", { affected_field: "source_document_type" }));
  }

  for (const f of E9_REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null) {
      errors.push(makeError2G1B("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${f}`, "<unknown>", { affected_field: f }));
    }
  }

  for (const k of Object.keys(raw)) {
    if (!E9_ALLOWED_KEYS.has(k)) {
      errors.push(makeError2G1B("VALIDATION.UNKNOWN_PAYLOAD_KEY", "validation", `Unknown payload key: ${k}`, "<unknown>", { affected_field: k }));
    }
  }

  return errors;
}

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════

function buildE9Event(raw: Record<string, unknown>): E9Payload {
  return {
    event_id: raw.event_id as string,
    event_type: "transfer.received",
    transaction_time: raw.transaction_time as string,
    posting_time: raw.posting_time as string,
    source_document_type: "transfer",
    source_document_id: raw.source_document_id as string,
    source_document_number: (raw.source_document_number ?? null) as string | null,
    idempotency_key: raw.idempotency_key as string,
    requester: raw.requester as string,
    causation_id: (raw.causation_id ?? null) as string | null,
    correlation_id: (raw.correlation_id ?? null) as string | null,
    notes: (raw.notes ?? "") as string,
    transfer_id: raw.transfer_id as string,
    destination_position_id: raw.destination_position_id as string,
    item_id: raw.item_id as string,
    quantity: raw.quantity as number,
    unit_of_measure: raw.unit_of_measure as UnitOfMeasure2G1A,
  };
}

function makePositionQtyEffect(
  state: DomainState,
  positionId: string,
  itemId: string,
  delta: number,
  reason: PositionQuantityEffect["reason"]
): PositionQuantityEffect | null {
  const pos = getPosition(state, positionId);
  if (!pos) return null;
  const before = pos.position_quantity;
  const after = before + delta;
  return { kind: "position_quantity", position_id: positionId, item_id: itemId, delta, before, after, reason };
}

function applyEffect2G1B(state: DomainState, eff: CanonicalStateEffect2G1A): void {
  if (eff.kind === "position_quantity") {
    const pos = state.positions[eff.position_id];
    if (pos) pos.position_quantity = eff.after;
  } else if (eff.kind === "company_owned") {
    const co = state.company_ownership[eff.item_id];
    if (co) {
      co.company_owned_quantity = eff.after;
    } else {
      state.company_ownership[eff.item_id] = { item_id: eff.item_id, company_owned_quantity: eff.after };
    }
  } else if (eff.kind === "condition_reclassification") {
    const pos = state.positions[eff.position_id];
    if (pos) pos.condition_class = eff.after;
  } else if (eff.kind === "restriction_reclassification") {
    const pos = state.positions[eff.position_id];
    if (pos) pos.restriction_class = eff.after;
  }
}

function applyOperation2G1B(state: DomainState, op: AtomicRecordOperation2G1B): void {
  switch (op.op_kind) {
    case "transfer_outstanding_partial_receipt_updated": {
      const t = state.transfers_outstanding[op.transfer_id];
      if (t) {
        t.received_quantity = op.after.received_quantity;
        t.status = op.after.status;
        t.receive_event_id = op.receive_event_id;
      }
      break;
    }
    case "transfer_outstanding_created": {
      state.transfers_outstanding[op.transfer_id] = {
        transfer_id: op.transfer_id,
        item_id: op.item_id,
        source_position_id: op.source_position_id,
        destination_position_id: op.destination_position_id,
        in_transit_position_id: op.in_transit_position_id,
        dispatched_quantity: op.dispatched_quantity,
        received_quantity: 0,
        status: "outstanding",
        dispatch_event_id: op.dispatch_event_id,
        receive_event_id: null,
      };
      break;
    }
    case "transfer_outstanding_received": {
      const t = state.transfers_outstanding[op.transfer_id];
      if (t) {
        t.received_quantity = op.received_quantity;
        t.status = "received";
        t.receive_event_id = op.receive_event_id;
      }
      break;
    }
    case "correction_provenance_created": {
      state.correction_provenance[op.record_id] = {
        record_id: op.record_id,
        original_event_type: op.original_event_type,
        original_event_id: op.original_event_id,
        original_item_id: op.original_item_id,
        original_position_id: op.original_position_id,
        original_signed_delta: op.original_signed_delta,
        original_absolute_quantity: op.original_absolute_quantity,
        reversed_absolute_quantity: 0,
        remaining_reversible_quantity: op.original_absolute_quantity,
        related_issue_event_id: op.related_issue_event_id,
        blocking_downstream_event_ids: [],
      };
      break;
    }
    case "correction_provenance_reversal_updated": {
      const p = state.correction_provenance[op.provenance_record_id];
      if (p) {
        p.reversed_absolute_quantity = op.after.reversed_absolute_quantity;
        p.remaining_reversible_quantity = op.after.remaining_reversible_quantity;
      }
      break;
    }
    case "correction_provenance_downstream_block_updated": {
      const p = state.correction_provenance[op.provenance_record_id];
      if (p) {
        if (!p.blocking_downstream_event_ids.includes(op.blocking_event_id)) {
          p.blocking_downstream_event_ids.push(op.blocking_event_id);
        }
      }
      break;
    }
    case "job_issue_progress_created": {
      state.job_issue_progress[op.issue_event_id] = {
        issue_event_id: op.issue_event_id,
        item_id: op.item_id,
        job_custody_position_id: op.job_custody_position_id,
        issued_quantity: op.issued_quantity,
        consumed_quantity: 0,
        returned_quantity: 0,
        outstanding_quantity: op.issued_quantity,
        status: "open",
        created_revision: op.after_revision,
        last_updated_revision: op.after_revision,
      };
      break;
    }
    case "job_issue_consumed_updated": {
      const issue = state.job_issue_progress[op.issue_event_id];
      if (issue) {
        issue.consumed_quantity = op.after.consumed_quantity;
        issue.outstanding_quantity = op.after.outstanding_quantity;
        issue.status = op.after.status;
        issue.last_updated_revision = op.after_revision;
      }
      break;
    }
    case "job_issue_consumed_reversed": {
      const issue = state.job_issue_progress[op.issue_event_id];
      if (issue) {
        issue.consumed_quantity = op.after.consumed_quantity;
        issue.outstanding_quantity = op.after.outstanding_quantity;
        issue.status = op.after.status;
        issue.last_updated_revision = op.after_revision;
      }
      break;
    }
    case "job_issue_returned_updated": {
      const issue = state.job_issue_progress[op.issue_event_id];
      if (issue) {
        issue.returned_quantity = op.after.returned_quantity;
        issue.outstanding_quantity = op.after.outstanding_quantity;
        issue.status = op.after.status;
        issue.last_updated_revision = op.after_revision;
      }
      break;
    }
    case "accepted_event_record_inserted": {
      state.transactions[op.record.record_id] = op.record;
      break;
    }
    case "state_revision_advanced": {
      state.state_revision = op.after_revision;
      break;
    }
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

// ─── Blocker emission (step 21) ───
function emitBlockers2G1B(
  state: DomainState,
  effects: PositionQuantityEffect[],
  eventId: string,
  eventType: EventType2G1A,
  operations: AtomicRecordOperation2G1B[],
  recordedOps: RecordedDomainOperation2G1B[]
): void {
  for (const eff of effects) {
    if (eff.kind !== "position_quantity") continue;
    for (const recId of Object.keys(state.correction_provenance)) {
      const p = state.correction_provenance[recId];
      if (p.original_item_id === eff.item_id && p.original_position_id === eff.position_id) {
        const blockOp: CorrectionProvenanceDownstreamBlockUpdatedOp = {
          op_kind: "correction_provenance_downstream_block_updated",
          provenance_record_id: recId,
          blocking_event_id: eventId,
          blocking_event_type: eventType,
          blocking_item_id: eff.item_id,
          blocking_position_id: eff.position_id,
          before: { blocking_downstream_event_ids: [...p.blocking_downstream_event_ids] },
          after: { blocking_downstream_event_ids: [...p.blocking_downstream_event_ids, eventId] },
        };
        operations.push(blockOp);
        recordedOps.push(blockOp);
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT — 30-Step Pipeline (§3)
// ═════════════════════════════════════════════════════════════════

export function evaluateEvent2G1B(rawInput: unknown, state: DomainState): DomainResult2G1B {
  const now = new Date().toISOString();

  // ─── Step 1: Null/non-object input validation ───
  if (rawInput === null || rawInput === undefined) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.NULL_EVENT_INPUT", "validation", "Null event input", "<unknown>")],
      [], "<unknown>", null
    );
  }
  if (typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.NON_OBJECT_INPUT", "validation", "Non-object input", "<unknown>")],
      [], "<unknown>", null
    );
  }

  const raw = rawInput as Record<string, unknown>;

  // ─── Step 2: event_type presence and type validation ───
  const eventTypeRaw = raw.event_type;
  if (typeof eventTypeRaw !== "string") {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.MISSING_REQUIRED_FIELD", "validation", "Missing event_type field", "<unknown>", { affected_field: "event_type" })],
      [], "<unknown>", null
    );
  }

  // ─── Step 3: 2G1-B discriminator/scope validation ───
  if (eventTypeRaw !== "transfer.received") {
    return makeRejected2G1B(
      [makeError2G1B("AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE", "authorization", `Event type ${eventTypeRaw} is outside 2G1-B scope`, "<unknown>", { safe_context: { event_type: eventTypeRaw } })],
      [], "<unknown>", null
    );
  }

  // ─── Step 4: Structural validation ───
  const structErrors = validateStructure2G1B(raw);
  if (structErrors.length > 0) {
    const idemKey = (raw.idempotency_key as string) ?? null;
    return makeRejected2G1B(sortErrors2G1B(structErrors), [], "transfer.received", idemKey);
  }

  const idemKey = raw.idempotency_key as string;

  // ─── Step 5: Duplicate-idempotency check ───
  for (const txnId of Object.keys(state.transactions)) {
    const txn = state.transactions[txnId];
    if (txn.idempotency_key === idemKey) {
      return makeRejected2G1B(
        [makeError2G1B("INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "commitment", `Duplicate idempotency key: ${idemKey}`, "transfer.received", { affected_field: "idempotency_key", safe_context: { idempotency_key: idemKey } })],
        [], "transfer.received", idemKey
      );
    }
  }

  // ─── Step 6: Quantity finiteness ───
  const qty = raw.quantity as number;
  if (!isFiniteNumber(qty)) {
    return makeRejected2G1B(
      [makeError2G1B("UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "transfer.received", { affected_field: "quantity" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 7: Quantity positivity ───
  if (!isPositiveFinite(qty)) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "transfer.received", { affected_field: "quantity" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 8: Transfer existence ───
  const transferId = raw.transfer_id as string;
  const transfer = state.transfers_outstanding[transferId];
  if (!transfer) {
    return makeRejected2G1B(
      [makeError2G1B("TRANSFER.RECEIVE_WITHOUT_DISPATCH", "transfer", "No outstanding transfer found", "transfer.received", { affected_field: "transfer_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 9: Transfer status ───
  if (transfer.status !== "outstanding") {
    return makeRejected2G1B(
      [makeError2G1B("TRANSFER.RECEIVE_WITHOUT_DISPATCH", "transfer", "Transfer already received", "transfer.received", { affected_field: "transfer_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 10: Calculate remaining_before ───
  const dispatchedQty = transfer.dispatched_quantity;
  const receivedBefore = transfer.received_quantity;
  const remainingBefore = dispatchedQty - receivedBefore;

  // ─── Step 11: Delegate full first-time receipt to 2G1-A ───
  // (received_quantity === 0 AND qty === dispatched_quantity)
  if (receivedBefore === 0 && qty === dispatchedQty) {
    return evaluateEvent2G1A(rawInput, state);
  }

  // ─── Step 12: Validate receipt does not exceed remaining ───
  if (qty > remainingBefore) {
    return makeRejected2G1B(
      [makeError2G1B("TRANSFER.RECEIVE_EXCEEDS_REMAINING", "transfer", `Receipt quantity ${qty} exceeds remaining ${remainingBefore}`, "transfer.received", { affected_field: "quantity", safe_context: { requested: qty, remaining: remainingBefore } })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 13: Validate destination ───
  const destPosId = raw.destination_position_id as string;
  if (transfer.destination_position_id !== destPosId) {
    return makeRejected2G1B(
      [makeError2G1B("TRANSFER.DESTINATION_MISMATCH", "transfer", "Destination position mismatch", "transfer.received", { affected_field: "destination_position_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 14: Validate item ───
  const itemId = raw.item_id as string;
  if (transfer.item_id !== itemId) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.ITEM_MISMATCH", "validation", "Item ID mismatch", "transfer.received", { affected_field: "item_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 15: Validate in-transit/source position exists ───
  const inTransitPosId = transfer.in_transit_position_id;
  const inTransitPos = getPosition(state, inTransitPosId);
  if (!inTransitPos) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.MISSING_SOURCE_POSITION", "validation", "In-transit position not found", "transfer.received", { affected_field: "in_transit_position_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 16: Validate nonnegative in-transit result ───
  const inTransitAfter = inTransitPos.position_quantity - qty;
  if (inTransitAfter < 0) {
    return makeRejected2G1B(
      [makeError2G1B("INV.NEGATIVE_RESULT", "conservation", "Negative in-transit result", "transfer.received", { affected_field: "position_quantity" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 17: Validate destination position exists ───
  const destPos = getPosition(state, destPosId);
  if (!destPos) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", "transfer.received", { affected_field: "destination_position_id" })],
      [], "transfer.received", idemKey
    );
  }

  // ─── Step 18: Calculate cumulative_received_after, remaining_after, new_status ───
  const cumulativeReceivedAfter = receivedBefore + qty;
  const remainingAfter = dispatchedQty - cumulativeReceivedAfter;
  const newStatus: TransferOutstandingStatus2G1A = remainingAfter === 0 ? "received" : "outstanding";

  // ─── Step 19: Create quantity effects ───
  const effects: CanonicalStateEffect2G1A[] = [];
  const eventId = raw.event_id as string;

  const inTransitEff = makePositionQtyEffect(state, inTransitPosId, itemId, -qty, "transfer_receipt");
  if (!inTransitEff) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.MISSING_SOURCE_POSITION", "validation", "In-transit position not found", "transfer.received")],
      [], "transfer.received", idemKey
    );
  }
  effects.push(inTransitEff);

  const destEff = makePositionQtyEffect(state, destPosId, itemId, qty, "transfer_receipt");
  if (!destEff) {
    return makeRejected2G1B(
      [makeError2G1B("VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", "transfer.received")],
      [], "transfer.received", idemKey
    );
  }
  effects.push(destEff);

  // ─── Step 20: Create the partial-receipt update operation ───
  const operations: AtomicRecordOperation2G1B[] = [];
  const recordedOps: RecordedDomainOperation2G1B[] = [];

  const partialReceiptOp: TransferOutstandingPartialReceiptUpdatedOp = {
    op_kind: "transfer_outstanding_partial_receipt_updated",
    transfer_id: transferId,
    cumulative_received_after: cumulativeReceivedAfter,
    remaining_after: remainingAfter,
    new_status: newStatus,
    receive_event_id: eventId,
    before: {
      received_quantity: receivedBefore,
      remaining_quantity: remainingBefore,
      status: "outstanding",
    },
    after: {
      received_quantity: cumulativeReceivedAfter,
      remaining_quantity: remainingAfter,
      status: newStatus,
    },
  };
  operations.push(partialReceiptOp);
  recordedOps.push(partialReceiptOp);

  // ─── Step 21: Emit applicable blockers ───
  emitBlockers2G1B(state, [inTransitEff, destEff], eventId, "transfer.received", operations, recordedOps);

  // ─── Step 22: Clone state ───
  const beforeRevision = state.state_revision;
  const afterRevision = beforeRevision + 1;
  const cloned = cloneDomainState(state);

  // ─── Step 23: Apply effects ───
  for (const eff of effects) {
    applyEffect2G1B(cloned, eff);
  }

  // ─── Step 24: Apply record operations ───
  for (const op of operations) {
    applyOperation2G1B(cloned, op);
  }

  // ─── Step 25: Validate all invariants ───
  const invariantErrors = validateAllInvariants2G1B(cloned);
  if (invariantErrors.length > 0) {
    return makeRejected2G1B(sortErrors2G1B(invariantErrors), [], "transfer.received", idemKey);
  }

  // ─── Step 26: Build AcceptedEventRecord ───
  const event = buildE9Event(raw);
  const recordId = `AER-${idemKey}-${afterRevision}`;
  const record: AcceptedEventRecord = {
    record_id: recordId,
    event,
    state_effects: sortEffects(effects),
    recorded_operations: recordedOps,
    immutable_facts: [],
    classification_results: [],
    derived_result_snapshots: [],
    notes: "",
    evaluation_timestamp: now,
    idempotency_key: idemKey,
    canonical_state_revision: afterRevision,
    formula_version: FORMULA_VERSION_2G1B,
  };

  // ─── Step 27: Nonrecursion assertion ───
  for (const op of recordedOps) {
    const opKind: string = op.op_kind;
    if (opKind === "accepted_event_record_inserted" || opKind === "state_revision_advanced") {
      return makeRejected2G1B(
        [makeError2G1B("INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "state", "Nonrecursion violation: applier-only op in recorded_operations", "transfer.received")],
        [], "transfer.received", idemKey
      );
    }
  }

  // ─── Step 28: Insert AcceptedEventRecord ───
  const insertOp: AcceptedEventRecordInsertedOp = {
    op_kind: "accepted_event_record_inserted",
    record,
    before: null,
    after: { record_id: recordId },
  };
  operations.push(insertOp);
  cloned.transactions[recordId] = record;

  // ─── Step 29: Advance state revision ───
  const revOp: StateRevisionAdvancedOp = {
    op_kind: "state_revision_advanced",
    before_revision: beforeRevision,
    after_revision: afterRevision,
    before: { state_revision: beforeRevision },
    after: { state_revision: afterRevision },
  };
  operations.push(revOp);
  cloned.state_revision = afterRevision;

  // ─── Step 30: Return accepted result ───
  const accepted: AcceptedDomainResult2G1B = {
    ok: true,
    event,
    proposed_state: cloned,
    state_effects: sortEffects(effects),
    atomic_record_operations: sortOperations2G1B(operations),
    immutable_facts: [],
    classification_results: [],
    derived_result_snapshots: [],
    warnings: [],
    idempotency_key: idemKey,
    canonical_state_revision: afterRevision,
    formula_version: FORMULA_VERSION_2G1B,
    evaluation_timestamp: now,
  };

  return accepted;
}