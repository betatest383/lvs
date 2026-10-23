// ═════════════════════════════════════════════════════════════════
// 2G1-B TEST SUITE — 42-Entry Registry
// Imports fixtures from ../2g1a/testFixtures.ts
// Isolated module: no SDK, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

import type { DomainState } from "../2g1a/domainState.ts";
import { cloneDomainState } from "../2g1a/domainState.ts";
import type { DomainResult2G1A } from "../2g1a/resultTypes.ts";
import {
  makeBaseState, mkEvent, deepEqual, runSeq,
} from "../2g1a/testFixtures.ts";
import type { DomainResult2G1B } from "./resultTypes.ts";
import { evaluateEvent2G1B } from "./publicBoundary.ts";
import { validateTransferOutstandingConsistency } from "./invariantValidators.ts";

// ─── Test result types ───
export type TestStatus2G1B = "PASS" | "FAIL" | "NOT_EXECUTED" | "EXTERNAL_CHECK_REQUIRED";

export interface TestResult2G1B {
  test_id: string;
  test_name: string;
  classification: string;
  status: TestStatus2G1B;
  assertion: string;
  actual: string;
  expected: string;
}

export interface TestRunResult2G1B {
  total: number;
  passed: number;
  failed: number;
  not_executed: number;
  results: TestResult2G1B[];
}

// ─── Helpers ───
function tr(
  test_id: string, test_name: string, classification: string,
  pass: boolean, assertion: string, expected: string, actual: string
): TestResult2G1B {
  return { test_id, test_name, classification, status: pass ? "PASS" : "FAIL", assertion, actual, expected };
}

function trStatus(
  test_id: string, test_name: string, classification: string,
  status: TestStatus2G1B, assertion: string, expected: string, actual: string
): TestResult2G1B {
  return { test_id, test_name, classification, status, assertion, actual, expected };
}

function makeTransferState(dispatchedQty: number, transferId: string = "TFR-001"): DomainState {
  const state = makeBaseState();
  const dispatchEvent = mkEvent("transfer.dispatched", {
    transfer_id: transferId,
    source_position_id: "POS-WH",
    in_transit_position_id: "POS-IN-TRANSIT",
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    quantity: dispatchedQty,
    unit_of_measure: "ea",
  });
  const { state: dispatchedState } = runSeq(state, dispatchEvent);
  return dispatchedState;
}

function makeReceiptEvent(
  transferId: string, qty: number, idemKey?: string, extra?: Record<string, unknown>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    transfer_id: transferId,
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    quantity: qty,
    unit_of_measure: "ea",
  };
  if (idemKey) fields.idempotency_key = idemKey;
  if (extra) Object.assign(fields, extra);
  return mkEvent("transfer.received", fields);
}

function getRejCode(result: DomainResult2G1B): string {
  if (!result.ok && result.errors.length > 0) {
    return result.errors[0].error_code;
  }
  return "";
}

function runPartial(state: DomainState, event: Record<string, unknown>): { result: DomainResult2G1B; state: DomainState } {
  const result = evaluateEvent2G1B(event, state);
  if (result.ok) {
    return { result, state: result.proposed_state };
  }
  return { result, state };
}

// ═════════════════════════════════════════════════════════════════
// A. ACCEPTED BEHAVIORAL TESTS (8)
// ═════════════════════════════════════════════════════════════════

function bt001(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { result } = runPartial(state, event);
  const pass = result.ok && result.formula_version === "2g1b-v1.0.0";
  return tr("BT-001", "First partial receipt", "Accepted", pass,
    "ok=true and formula_version=2g1b-v1.0.0", "ok=true, 2g1b-v1.0.0",
    `ok=${result.ok}, ${result.ok ? result.formula_version : getRejCode(result)}`);
}

function bt002(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 4, "IDEM-002");
  const { result } = runPartial(s1, ev2);
  const pass = result.ok && result.formula_version === "2g1b-v1.0.0";
  return tr("BT-002", "Second sequential partial receipt", "Accepted", pass,
    "ok=true and formula_version=2g1b-v1.0.0", "ok=true, 2g1b-v1.0.0",
    `ok=${result.ok}, ${result.ok ? result.formula_version : getRejCode(result)}`);
}

function bt003(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 4, "IDEM-002");
  const { state: s2 } = runPartial(s1, ev2);
  const ev3 = makeReceiptEvent("TFR-001", 3, "IDEM-003");
  const { result, state: s3 } = runPartial(s2, ev3);
  const transfer = s3.transfers_outstanding["TFR-001"];
  const pass = result.ok && transfer.status === "received" && transfer.received_quantity === 10;
  return tr("BT-003", "Final completing receipt", "Accepted", pass,
    "status=received, received=10", "received, 10",
    `${transfer.status}, ${transfer.received_quantity}`);
}

function bt004(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 5, "IDEM-001");
  const { state: s1, result: r1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 5, "IDEM-002");
  const { state: s2, result: r2 } = runPartial(s1, ev2);
  const transfer = s2.transfers_outstanding["TFR-001"];
  const pass = r1.ok && r1.formula_version === "2g1b-v1.0.0" &&
    r2.ok && r2.formula_version === "2g1b-v1.0.0" &&
    transfer.status === "received" && transfer.received_quantity === 10;
  return tr("BT-004", "Two equal halves", "Accepted", pass,
    "each 2g1b-v1.0.0, final received=10", "2x 2g1b-v1.0.0, received, 10",
    `${r1.ok ? r1.formula_version : "fail"}, ${r2.ok ? r2.formula_version : "fail"}, ${transfer.status}, ${transfer.received_quantity}`);
}

function bt005(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 1, "IDEM-001");
  const { result } = runPartial(state, event);
  const pass = result.ok && result.formula_version === "2g1b-v1.0.0";
  return tr("BT-005", "Single-unit partial receipt", "Accepted", pass,
    "ok=true and formula_version=2g1b-v1.0.0", "ok=true, 2g1b-v1.0.0",
    `ok=${result.ok}, ${result.ok ? result.formula_version : getRejCode(result)}`);
}

function bt006(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 10, "IDEM-001");
  const { result } = runPartial(state, event);
  const pass = result.ok && result.formula_version === "2g1a-v1.0.0";
  return tr("BT-006", "Full first-time receipt delegation", "Accepted", pass,
    "ok=true and formula_version=2g1a-v1.0.0 (delegated)", "ok=true, 2g1a-v1.0.0",
    `ok=${result.ok}, ${result.ok ? result.formula_version : getRejCode(result)}`);
}

function bt007(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 7, "IDEM-002");
  const { result, state: s2 } = runPartial(s1, ev2);
  const transfer = s2.transfers_outstanding["TFR-001"];
  const pass = result.ok && result.formula_version === "2g1b-v1.0.0" &&
    transfer.status === "received" && transfer.received_quantity === 10;
  return tr("BT-007", "Completing receipt after partial", "Accepted", pass,
    "2g1b-v1.0.0, status=received, received=10", "2g1b-v1.0.0, received, 10",
    `${result.ok ? result.formula_version : "fail"}, ${transfer.status}, ${transfer.received_quantity}`);
}

function bt037(): TestResult2G1B {
  const state = makeTransferState(10);
  // Insert provenance for ITEM-001 at POS-IN-TRANSIT
  state.correction_provenance["CPR-TEST"] = {
    record_id: "CPR-TEST",
    original_event_type: "receipt.posted",
    original_event_id: "EVT-ORIG",
    original_item_id: "ITEM-001",
    original_position_id: "POS-IN-TRANSIT",
    original_signed_delta: 10,
    original_absolute_quantity: 10,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: 10,
    related_issue_event_id: null,
    blocking_downstream_event_ids: [],
  };
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { result } = runPartial(state, event);
  let hasBlocker = false;
  if (result.ok) {
    for (const op of result.atomic_record_operations) {
      if (op.op_kind === "correction_provenance_downstream_block_updated") {
        hasBlocker = true;
      }
    }
  }
  const pass = result.ok && hasBlocker;
  return tr("BT-037", "Blocker emission with existing provenance", "Accepted", pass,
    "ok=true and blocker op present", "ok=true, blocker=true",
    `ok=${result.ok}, blocker=${hasBlocker}`);
}

// ═════════════════════════════════════════════════════════════════
// B. REJECTED BEHAVIORAL TESTS (24)
// ═════════════════════════════════════════════════════════════════

function bt008(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 8, "IDEM-002"); // remaining=7, 8>7
  const { result } = runPartial(s1, ev2);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.RECEIVE_EXCEEDS_REMAINING";
  return tr("BT-008", "One unit above remaining", "Rejected", pass,
    "TRANSFER.RECEIVE_EXCEEDS_REMAINING", "TRANSFER.RECEIVE_EXCEEDS_REMAINING", code);
}

function bt009(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 0, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.NON_POSITIVE_QUANTITY";
  return tr("BT-009", "Zero quantity", "Rejected", pass,
    "VALIDATION.NON_POSITIVE_QUANTITY", "VALIDATION.NON_POSITIVE_QUANTITY", code);
}

function bt010(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", -5, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.NON_POSITIVE_QUANTITY";
  return tr("BT-010", "Negative quantity", "Rejected", pass,
    "VALIDATION.NON_POSITIVE_QUANTITY", "VALIDATION.NON_POSITIVE_QUANTITY", code);
}

function bt011(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", NaN, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "UOM.NON_FINITE_QUANTITY";
  return tr("BT-011", "NaN quantity", "Rejected", pass,
    "UOM.NON_FINITE_QUANTITY", "UOM.NON_FINITE_QUANTITY", code);
}

function bt012(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", Infinity, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "UOM.NON_FINITE_QUANTITY";
  return tr("BT-012", "Positive infinity", "Rejected", pass,
    "UOM.NON_FINITE_QUANTITY", "UOM.NON_FINITE_QUANTITY", code);
}

function bt013(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", -Infinity, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "UOM.NON_FINITE_QUANTITY";
  return tr("BT-013", "Negative infinity", "Rejected", pass,
    "UOM.NON_FINITE_QUANTITY", "UOM.NON_FINITE_QUANTITY", code);
}

function bt014(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("NONEXISTENT", 3, "IDEM-001");
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.RECEIVE_WITHOUT_DISPATCH";
  return tr("BT-014", "Missing transfer", "Rejected", pass,
    "TRANSFER.RECEIVE_WITHOUT_DISPATCH", "TRANSFER.RECEIVE_WITHOUT_DISPATCH", code);
}

function bt015(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001", { destination_position_id: "POS-WH" });
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.DESTINATION_MISMATCH";
  return tr("BT-015", "Destination mismatch", "Rejected", pass,
    "TRANSFER.DESTINATION_MISMATCH", "TRANSFER.DESTINATION_MISMATCH", code);
}

function bt016(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001", { item_id: "ITEM-002" });
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.ITEM_MISMATCH";
  return tr("BT-016", "Item mismatch", "Rejected", pass,
    "VALIDATION.ITEM_MISMATCH", "VALIDATION.ITEM_MISMATCH", code);
}

function bt017(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 4, "IDEM-001"); // same key
  const { result } = runPartial(s1, ev2);
  const code = getRejCode(result);
  const pass = !result.ok && code === "INV.IDEMPOTENCY_DUPLICATE_CONTRACT";
  return tr("BT-017", "Duplicate idempotency key", "Rejected", pass,
    "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", code);
}

function bt018(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1, result: r1 } = runPartial(state, ev1);
  // Replay same event after partial acceptance
  const { result } = runPartial(s1, ev1);
  const code = getRejCode(result);
  const pass = r1.ok && !result.ok && code === "INV.IDEMPOTENCY_DUPLICATE_CONTRACT";
  return tr("BT-018", "Replay after partial acceptance", "Rejected", pass,
    "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", code);
}

function bt019(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 7, "IDEM-002");
  const { state: s2 } = runPartial(s1, ev2);
  // Now completed; replay ev1
  const { result } = runPartial(s2, ev1);
  const code = getRejCode(result);
  const pass = !result.ok && code === "INV.IDEMPOTENCY_DUPLICATE_CONTRACT";
  return tr("BT-019", "Replay after completion", "Rejected", pass,
    "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", code);
}

function bt020(): TestResult2G1B {
  const state = makeTransferState(10);
  // Complete via full receipt (delegation to 2G1-A)
  const ev1 = makeReceiptEvent("TFR-001", 10, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  // Receipt after completion with new key
  const ev2 = makeReceiptEvent("TFR-001", 3, "IDEM-002");
  const { result } = runPartial(s1, ev2);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.RECEIVE_WITHOUT_DISPATCH";
  return tr("BT-020", "Receipt after completion (new key)", "Rejected", pass,
    "TRANSFER.RECEIVE_WITHOUT_DISPATCH", "TRANSFER.RECEIVE_WITHOUT_DISPATCH", code);
}

function bt021(): TestResult2G1B {
  const state = makeTransferState(10);
  const ev1 = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { state: s1 } = runPartial(state, ev1);
  const ev2 = makeReceiptEvent("TFR-001", 10, "IDEM-002"); // remaining=7, 10>7
  const { result } = runPartial(s1, ev2);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.RECEIVE_EXCEEDS_REMAINING";
  return tr("BT-021", "Full dispatched after partial", "Rejected", pass,
    "TRANSFER.RECEIVE_EXCEEDS_REMAINING", "TRANSFER.RECEIVE_EXCEEDS_REMAINING", code);
}

function bt022(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 11, "IDEM-001"); // 11>10
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "TRANSFER.RECEIVE_EXCEEDS_REMAINING";
  return tr("BT-022", "Exceeding dispatched, first receipt", "Rejected", pass,
    "TRANSFER.RECEIVE_EXCEEDS_REMAINING", "TRANSFER.RECEIVE_EXCEEDS_REMAINING", code);
}

function bt023(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = mkEvent("transfer.received", {
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    quantity: 3,
    unit_of_measure: "ea",
    idempotency_key: "IDEM-001",
  });
  delete (event as Record<string, unknown>).transfer_id;
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.MISSING_REQUIRED_FIELD";
  return tr("BT-023", "Missing transfer_id", "Rejected", pass,
    "VALIDATION.MISSING_REQUIRED_FIELD", "VALIDATION.MISSING_REQUIRED_FIELD", code);
}

function bt024(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = mkEvent("transfer.received", {
    transfer_id: "TFR-001",
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    unit_of_measure: "ea",
    idempotency_key: "IDEM-001",
  });
  delete (event as Record<string, unknown>).quantity;
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.MISSING_REQUIRED_FIELD";
  return tr("BT-024", "Missing quantity", "Rejected", pass,
    "VALIDATION.MISSING_REQUIRED_FIELD", "VALIDATION.MISSING_REQUIRED_FIELD", code);
}

function bt025(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001", { extra_field: "bad" });
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.UNKNOWN_PAYLOAD_KEY";
  return tr("BT-025", "Unknown payload key", "Rejected", pass,
    "VALIDATION.UNKNOWN_PAYLOAD_KEY", "VALIDATION.UNKNOWN_PAYLOAD_KEY", code);
}

function bt026(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = mkEvent("transfer.received", {
    transfer_id: "TFR-001",
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    quantity: 3,
    idempotency_key: "IDEM-001",
  });
  delete (event as Record<string, unknown>).unit_of_measure;
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.MISSING_REQUIRED_FIELD";
  return tr("BT-026", "Missing unit_of_measure", "Rejected", pass,
    "VALIDATION.MISSING_REQUIRED_FIELD", "VALIDATION.MISSING_REQUIRED_FIELD", code);
}

function bt027(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = mkEvent("transfer.received", {
    transfer_id: "TFR-001",
    destination_position_id: "POS-TRUCK",
    item_id: "ITEM-001",
    quantity: 3,
    unit_of_measure: null,
    idempotency_key: "IDEM-001",
  });
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.MISSING_REQUIRED_FIELD";
  return tr("BT-027", "unit_of_measure null", "Rejected", pass,
    "VALIDATION.MISSING_REQUIRED_FIELD", "VALIDATION.MISSING_REQUIRED_FIELD", code);
}

function bt030(): TestResult2G1B {
  const state = makeTransferState(10);
  // Corrupt: set in-transit to 2 (less than receipt qty of 5)
  state.positions["POS-IN-TRANSIT"].position_quantity = 2;
  const event = makeReceiptEvent("TFR-001", 5, "IDEM-001"); // remaining=10, 5<=10 passes step 12, but in-transit 2-5=-3
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "INV.NEGATIVE_RESULT";
  return tr("BT-030", "Negative-position prevention", "Rejected", pass,
    "INV.NEGATIVE_RESULT", "INV.NEGATIVE_RESULT", code);
}

function bt034(): TestResult2G1B {
  const state = makeTransferState(10);
  const beforeRevision = state.state_revision;
  const event = makeReceiptEvent("TFR-001", 0, "IDEM-001"); // rejected: NON_POSITIVE
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "VALIDATION.NON_POSITIVE_QUANTITY" &&
    state.state_revision === beforeRevision;
  return tr("BT-034", "Rejected-event revision preservation", "Rejected", pass,
    "VALIDATION.NON_POSITIVE_QUANTITY, revision unchanged", "NON_POSITIVE, revision=same",
    `${code}, revision ${state.state_revision === beforeRevision ? "unchanged" : "changed"}`);
}

function bt035(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = mkEvent("po.created", {
    purchase_order_id: "PO-001", vendor_id: "V-001", lines: [],
  });
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE";
  return tr("BT-035", "Non-transfer event out of scope", "Rejected", pass,
    "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE", "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE", code);
}

function bt036(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = { ...mkEvent("transfer.received", { transfer_id: "TFR-001", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea" }) };
  event.event_type = "unknown.event";
  const { result } = runPartial(state, event);
  const code = getRejCode(result);
  const pass = !result.ok && code === "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE";
  return tr("BT-036", "Unknown event discriminator", "Rejected", pass,
    "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE", "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE", code);
}

// ═════════════════════════════════════════════════════════════════
// C. DIRECT INVARIANT UNIT TESTS (1)
// ═════════════════════════════════════════════════════════════════

function bt031(): TestResult2G1B {
  const state = makeTransferState(10);
  // Corrupt: received > dispatched
  state.transfers_outstanding["TFR-001"].received_quantity = 15;
  const error = validateTransferOutstandingConsistency(state);
  const pass = error !== null;
  return tr("BT-031", "Transfer outstanding consistency (received > dispatched)", "Invariant", pass,
    "validateTransferOutstandingConsistency returns error", "error != null",
    error ? "error != null" : "error == null");
}

// ═════════════════════════════════════════════════════════════════
// D. PROPERTY TESTS (4)
// ═════════════════════════════════════════════════════════════════

function bt029(): TestResult2G1B {
  const state = makeTransferState(10);
  const coBefore = state.company_ownership["ITEM-001"].company_owned_quantity;
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { result, state: after } = runPartial(state, event);
  const coAfter = after.company_ownership["ITEM-001"].company_owned_quantity;
  const pass = result.ok && coBefore === coAfter;
  return tr("BT-029", "Company-owned quantity unchanged", "Property", pass,
    "company_owned before === after", `${coBefore} === ${coAfter}`,
    `${coBefore} vs ${coAfter}`);
}

function bt032(): TestResult2G1B {
  const state = makeTransferState(10);
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-032");
  const { result, state: after } = runPartial(state, event);
  let recordIdOk = false;
  let noApplierOps = true;
  let formulaOk = false;
  if (result.ok) {
    const expectedRecordId = `AER-IDEM-032-${result.canonical_state_revision}`;
    recordIdOk = !!after.transactions[expectedRecordId];
    formulaOk = result.formula_version === "2g1b-v1.0.0";
    const record = after.transactions[expectedRecordId];
    if (record) {
      const ops = record.recorded_operations as Array<{ op_kind: string }>;
      for (const op of ops) {
        if (op.op_kind === "accepted_event_record_inserted" || op.op_kind === "state_revision_advanced") {
          noApplierOps = false;
        }
      }
    }
  }
  const pass = recordIdOk && noApplierOps && formulaOk;
  return tr("BT-032", "Accepted-event record insertion and bookkeeping", "Property", pass,
    "record_id=AER-IDEM-032-N, no applier ops, 2g1b-v1.0.0", "all true",
    `recordId=${recordIdOk}, noApplier=${noApplierOps}, formula=${formulaOk}`);
}

function bt033(): TestResult2G1B {
  const state = makeTransferState(10);
  const beforeRev = state.state_revision;
  const event = makeReceiptEvent("TFR-001", 3, "IDEM-001");
  const { result } = runPartial(state, event);
  const pass = result.ok && result.canonical_state_revision === beforeRev + 1;
  return tr("BT-033", "State revision advancement", "Property", pass,
    "afterRevision = before + 1", `${beforeRev + 1}`,
    `${result.ok ? result.canonical_state_revision : "N/A"}`);
}

function bt038(): TestResult2G1B {
  const state = makeTransferState(10);
  const snapshot = cloneDomainState(state);
  const event = makeReceiptEvent("TFR-001", 0, "IDEM-001"); // rejected
  evaluateEvent2G1B(event, state);
  const zeroMut = deepEqual(state, snapshot);
  const pass = zeroMut;
  return tr("BT-038", "Zero mutation on rejection (aggregate)", "Property", pass,
    "deepEqual(state_before, state_after) for all 9 members", "true",
    `${zeroMut}`);
}

// ═════════════════════════════════════════════════════════════════
// E. STATIC ISOLATION/CLOSURE CHECKS (3)
// ═════════════════════════════════════════════════════════════════

function bt039(): TestResult2G1B {
  // Requires external source-tree audit — this isolated module cannot read the filesystem.
  // The audit runner must independently grep for @base44/sdk, base44Client, .entities., .auth.
  return trStatus("BT-039", "Prohibited imports", "Static", "EXTERNAL_CHECK_REQUIRED",
    "grep for prohibited patterns in 2g1b/ → 0 matches", "0 matches (externally verified)",
    "NOT EXECUTED — requires external source-tree grep");
}

function bt040(): TestResult2G1B {
  // Requires external source-tree audit — this isolated module cannot read the filesystem.
  // The audit runner must independently grep for inventory-ledger/2g1b in production source.
  return trStatus("BT-040", "Production-import isolation", "Static", "EXTERNAL_CHECK_REQUIRED",
    "grep for inventory-ledger/2g1b in src/, base44/functions/, base44/agents/ → 0 matches", "0 matches (externally verified)",
    "NOT EXECUTED — requires external source-tree grep");
}

function bt041(): TestResult2G1B {
  // Requires external hash verification — this isolated module cannot read the filesystem.
  // The audit runner must independently recompute SHA-256 of both 2G1-A baseline files.
  return trStatus("BT-041", "2G1-A hash preservation", "Static", "EXTERNAL_CHECK_REQUIRED",
    "SHA-256 of both baseline files unchanged after 2G1-B creation", "unchanged (externally verified)",
    "NOT EXECUTED — requires external hash recompute");
}

// ═════════════════════════════════════════════════════════════════
// F. DOCUMENTED LIMITATIONS (1)
// ═════════════════════════════════════════════════════════════════

function bt028(): TestResult2G1B {
  // Documented limitation (contract §16): TransferOutstanding has no unit_of_measure field.
  // This is a non-representable requirement, not an executable test.
  return trStatus("BT-028", "Transfer-to-event UOM consistency", "Limitation", "NOT_EXECUTED",
    "NOT executable — TransferOutstanding has no unit_of_measure field", "documented limitation",
    "NOT EXECUTED — documented non-representable requirement (contract §16)");
}

// ═════════════════════════════════════════════════════════════════
// G. EXTERNAL DATABASE VERIFICATION (1)
// ═════════════════════════════════════════════════════════════════

function bt042(): TestResult2G1B {
  // External database verification — requires authorized external harness with database access.
  // A pure shared-library test suite cannot query or prove all production entity counts.
  // No-production-mutation is enforced by isolation (BT-039, BT-040) and design constraint.
  return trStatus("BT-042", "Zero production or persistent-data mutation", "External", "NOT_EXECUTED",
    "NOT executable in pure module — requires authorized external harness", "external procedure",
    "NOT EXECUTED — no database evidence obtained; requires authorized external harness");
}

// ═════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═════════════════════════════════════════════════════════════════

export function runAllTests2G1B(): TestRunResult2G1B {
  const tests: TestResult2G1B[] = [
    // A. Accepted (8)
    bt001(), bt002(), bt003(), bt004(), bt005(), bt006(), bt007(), bt037(),
    // B. Rejected (24)
    bt008(), bt009(), bt010(), bt011(), bt012(), bt013(), bt014(), bt015(),
    bt016(), bt017(), bt018(), bt019(), bt020(), bt021(), bt022(), bt023(),
    bt024(), bt025(), bt026(), bt027(), bt030(), bt034(), bt035(), bt036(),
    // C. Invariant (1)
    bt031(),
    // D. Property (4)
    bt029(), bt032(), bt033(), bt038(),
    // E. Static (3)
    bt039(), bt040(), bt041(),
    // F. Limitation (1)
    bt028(),
    // G. External (1)
    bt042(),
  ];

  const passed = tests.filter(t => t.status === "PASS").length;
  const failed = tests.filter(t => t.status === "FAIL").length;
  const not_executed = tests.filter(t => t.status === "NOT_EXECUTED" || t.status === "EXTERNAL_CHECK_REQUIRED").length;
  return {
    total: tests.length,
    passed,
    failed,
    not_executed,
    results: tests,
  };
}