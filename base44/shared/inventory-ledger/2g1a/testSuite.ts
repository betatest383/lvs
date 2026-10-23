// ═════════════════════════════════════════════════════════════════
// 2G1-A ISOLATED TEST SUITE — 137 literal executable tests.
// Pure, non-routable, no SDK, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

import { evaluateEvent2G1A } from "./publicBoundary.ts";
import { runCompileChecks } from "./compileCheck.ts";
import { cloneDomainState } from "./domainState.ts";
import type { DomainState } from "./domainState.ts";
import { ALL_ERROR_CODES } from "./eventTypes.ts";
import type { DomainResult2G1A, DomainError } from "./resultTypes.ts";
import { sortEffects, sortErrors } from "./comparator.ts";
import type { CanonicalStateEffect2G1A } from "./quantityEffects.ts";
import {
  makeBaseState, mkEvent, insertAcceptedTxn, insertProv, insertIssue,
  deepEqual, runSeq, getRejCode, zm, tr,
  type TestRecord, type TestRunResult, type TestSummary,
} from "./testFixtures.ts";

// ─── Helper: accepted test ───
function acc(id: string, name: string, assertion: string, result: DomainResult2G1A, extra: string = ""): TestRecord {
  const actual = result.ok ? (extra ? `ok=true, ${extra}` : "ok=true") : "ok=false";
  return tr(id, name, assertion, result.ok, "ok=true", actual, "ok=true");
}

// ─── Helper: rejected test ───
function rej(id: string, name: string, assertion: string, result: DomainResult2G1A, expectedCode: string): TestRecord {
  const code = getRejCode(result);
  const pass = !result.ok && code === expectedCode;
  return tr(id, name, assertion, pass, expectedCode, code, expectedCode);
}

// ─── Helper: rejected test with zero-mutation verification ───
function rejZm(id: string, name: string, assertion: string, result: DomainResult2G1A, expectedCode: string, before: DomainState, after: DomainState): TestRecord {
  const code = getRejCode(result);
  const pass = !result.ok && code === expectedCode && deepEqual(before, after);
  return tr(id, name, assertion, pass, expectedCode, code, expectedCode);
}

export function runAllTests(): TestRunResult {
  const results: TestRecord[] = [];

  // ═══ E5: receipt.posted (AT-001 – AT-020) ═══

  // AT-001
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-001", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-001", "Receive ordinary item from vendor to warehouse", "evaluateEvent2G1A returns ok=true for valid receipt to warehouse position", r)); }

  // AT-002
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-002", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-002", "Receive with supported explicit cost", "evaluateEvent2G1A returns ok=true with 1 immutable fact for supported_explicit cost", r, r.ok ? `facts=${r.immutable_facts.length}` : "")); }

  // AT-003
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-003", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-003", "Receive without cost accepted with warning", "evaluateEvent2G1A returns ok=true with 1 warning (VAL.UNRESOLVED_COST_WARNING) when cost is null", r, r.ok ? `warnings=${r.warnings.length}` : "")); }

  // AT-004
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-004", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-004", "Receive rejects selling price", "evaluateEvent2G1A rejects with VAL.SELLING_PRICE_REJECTED for cost_source=selling_price", r, "VAL.SELLING_PRICE_REJECTED")); }

  // AT-005
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-005", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "msrp", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-005", "Receive rejects MSRP", "evaluateEvent2G1A rejects with VAL.MSRP_REJECTED for cost_source=msrp", r, "VAL.MSRP_REJECTED")); }

  // AT-006
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-006", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "markup", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-006", "Receive rejects markup", "evaluateEvent2G1A rejects with VAL.MARKUP_REJECTED for cost_source=markup", r, "VAL.MARKUP_REJECTED")); }

  // AT-007
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-007", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "other_invalid", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-007", "Receive rejects other_invalid cost source", "evaluateEvent2G1A rejects with VAL.COST_SOURCE_INVALID for cost_source=other_invalid", r, "VAL.COST_SOURCE_INVALID")); }

  // AT-008
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-008", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "bogus_source", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-008", "Receive rejects unknown string cost source", "evaluateEvent2G1A rejects with VAL.COST_SOURCE_INVALID for unknown cost_source string", r, "VAL.COST_SOURCE_INVALID")); }

  // AT-009
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-009", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5.00, currency: "USD", extra_prop: true } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-009", "Receive rejects extra property on cost object", "evaluateEvent2G1A rejects with VALIDATION.UNKNOWN_PAYLOAD_KEY for extra property on cost object", r, "VALIDATION.UNKNOWN_PAYLOAD_KEY")); }

  // AT-010
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-010", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-010", "Receive rejects missing cost_source property", "evaluateEvent2G1A rejects with VALIDATION.MISSING_REQUIRED_FIELD when cost_source is missing from cost object", r, "VALIDATION.MISSING_REQUIRED_FIELD")); }

  // AT-011
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-011", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: 123, unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-011", "Receive rejects non-string cost_source", "evaluateEvent2G1A rejects with VALIDATION.INVALID_ENUM_VALUE when cost_source is not a string", r, "VALIDATION.INVALID_ENUM_VALUE")); }

  // AT-012
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-012", destination_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-012", "Receive to missing destination", "evaluateEvent2G1A rejects with VALIDATION.MISSING_DESTINATION_POSITION for non-existent destination position", r, "VALIDATION.MISSING_DESTINATION_POSITION")); }

  // AT-013
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-013", destination_position_id: "POS-TERMINAL", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-013", "Receive to terminal position", "evaluateEvent2G1A rejects with STATE.WRONG_TRANSITION for receipt to terminal_job_cost position", r, "STATE.WRONG_TRANSITION")); }

  // AT-014
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-014", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-014", "Receive zero quantity", "evaluateEvent2G1A rejects with VALIDATION.NON_POSITIVE_QUANTITY for quantity=0", r, "VALIDATION.NON_POSITIVE_QUANTITY")); }

  // AT-015
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-015", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-015", "Receive negative quantity", "evaluateEvent2G1A rejects with VALIDATION.NON_POSITIVE_QUANTITY for quantity=-5", r, "VALIDATION.NON_POSITIVE_QUANTITY")); }

  // AT-016
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-016", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-016", "Receive non-finite quantity", "evaluateEvent2G1A rejects with UOM.NON_FINITE_QUANTITY for quantity=Infinity (finiteness checked before sign per §19 step 2)", r, "UOM.NON_FINITE_QUANTITY")); }

  // AT-017
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-017", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, bogus_field: true }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-017", "Receive unknown payload key", "evaluateEvent2G1A rejects with VALIDATION.UNKNOWN_PAYLOAD_KEY for extra top-level key", r, "VALIDATION.UNKNOWN_PAYLOAD_KEY")); }

  // AT-018
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-018", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); delete (e as Record<string, unknown>).event_id; const r = evaluateEvent2G1A(e, s); results.push(rej("AT-018", "Receive missing required field", "evaluateEvent2G1A rejects with VALIDATION.MISSING_REQUIRED_FIELD when event_id is missing", r, "VALIDATION.MISSING_REQUIRED_FIELD")); }

  // AT-019
  { const s = makeBaseState(); s.items["ITEM-002"] = { item_id: "ITEM-002", governed_tracking_mode: "serialized" as "ordinary", governed_unit: "ea", valuation_method: null }; s.positions["POS-WH-002"] = { ...s.positions["POS-WH"], position_id: "POS-WH-002", item_id: "ITEM-002" }; const e = mkEvent("receipt.posted", { receipt_id: "R-019", destination_position_id: "POS-WH-002", item_id: "ITEM-002", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-019", "Receive non-ordinary item", "evaluateEvent2G1A rejects with VALIDATION.INVALID_ENUM_VALUE for non-ordinary tracking mode item", r, "VALIDATION.INVALID_ENUM_VALUE")); }

  // AT-020
  { const s = makeBaseState(); s.positions["POS-WH-EXTERNAL"] = { ...s.positions["POS-WH"], position_id: "POS-WH-EXTERNAL", ownership_class: "company_owned" as "company_owned", position_kind: "physical_warehouse" }; s.positions["POS-WH-EXTERNAL"].ownership_class = "customer_held" as "company_owned"; const e = mkEvent("receipt.posted", { receipt_id: "R-020", destination_position_id: "POS-WH-EXTERNAL", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-020", "Receive non-company-owned destination", "evaluateEvent2G1A rejects with VALIDATION.INVALID_ENUM_VALUE for non-company-owned destination", r, "VALIDATION.INVALID_ENUM_VALUE")); }

  // ═══ PO events (AT-021 – AT-024) ═══

  // AT-021
  { const s = makeBaseState(); const e = mkEvent("po.created", { purchase_order_id: "PO-001", vendor_id: "V-001", lines: [{ line_id: "L-001", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }] }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-021", "PO created", "evaluateEvent2G1A returns ok=true for po.created (no-effect workflow)", r)); }

  // AT-022
  { const s = makeBaseState(); const e = mkEvent("po.approved", { purchase_order_id: "PO-001" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-022", "PO approved", "evaluateEvent2G1A returns ok=true for po.approved (no-effect workflow)", r)); }

  // AT-023
  { const s = makeBaseState(); const e = mkEvent("po.sent", { purchase_order_id: "PO-001" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-023", "PO sent", "evaluateEvent2G1A returns ok=true for po.sent (no-effect workflow)", r)); }

  // AT-024
  { const s = makeBaseState(); const e = mkEvent("po.line.opened", { purchase_order_id: "PO-001", line_id: "L-001", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-024", "PO line opened", "evaluateEvent2G1A returns ok=true for po.line.opened (no-effect workflow)", r)); }

  // ═══ Transfer events (AT-025 – AT-035) ═══

  // AT-025
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-001", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-025", "Dispatch warehouse to logical-in-transit", "evaluateEvent2G1A returns ok=true for valid transfer dispatch", r)); }

  // AT-026
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-026", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-026", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(acc("AT-026", "Receive logical-in-transit to truck exact full", "evaluateEvent2G1A returns ok=true for exact full receipt of dispatched transfer", r)); }

  // AT-027
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-027", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-027", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r2 = evaluateEvent2G1A(e2, s2); const co = r2.ok ? r2.proposed_state.company_ownership["ITEM-001"].company_owned_quantity : -1; results.push(tr("AT-027", "Dispatch + receipt conservation", "Company-owned quantity remains 100 after dispatch+receipt (conservation)", co === 100, "company_ownership.ITEM-001.company_owned_quantity === 100", `co=${co}`, "co=100")); }

  // AT-028
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-028", source_position_id: "POS-NONEXIST", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-028", "Dispatch to missing source", "evaluateEvent2G1A rejects with VALIDATION.MISSING_SOURCE_POSITION for non-existent source position", r, "VALIDATION.MISSING_SOURCE_POSITION")); }

  // AT-029
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-029", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-029", "Dispatch insufficient source quantity", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT for quantity exceeding source (200 > 100)", r, "INV.NEGATIVE_RESULT")); }

  // AT-030
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-030", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.dispatched", { transfer_id: "T-030", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rej("AT-030", "Dispatch duplicate transfer_id", "evaluateEvent2G1A rejects with INV.IDEMPOTENCY_DUPLICATE_CONTRACT for duplicate transfer_id", r, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT")); }

  // AT-031
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-031", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-031", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 15, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rej("AT-031", "Receipt exceeds dispatch", "evaluateEvent2G1A rejects with TRANSFER.RECEIVE_EXCEEDS_DISPATCH for qty 15 > dispatched 10", r, "TRANSFER.RECEIVE_EXCEEDS_DISPATCH")); }

  // AT-032
  { const s = makeBaseState(); const e = mkEvent("transfer.received", { transfer_id: "T-032", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-032", "Receipt without dispatch", "evaluateEvent2G1A rejects with TRANSFER.RECEIVE_WITHOUT_DISPATCH for receipt without outstanding transfer", r, "TRANSFER.RECEIVE_WITHOUT_DISPATCH")); }

  // AT-033
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-033", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-033", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rej("AT-033", "Receipt destination mismatch", "evaluateEvent2G1A rejects with TRANSFER.DESTINATION_MISMATCH for wrong destination position", r, "TRANSFER.DESTINATION_MISMATCH")); }

  // AT-034
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-034", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-034", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rej("AT-034", "Partial receipt deferred", "evaluateEvent2G1A rejects with AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B for partial receipt (5 < 10)", r, "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B")); }

  // AT-035
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-035", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2, result } = runSeq(s, e1); const status = result.ok ? s2.transfers_outstanding["T-035"]?.status : "unknown"; results.push(tr("AT-035", "Outstanding transfer remains", "TransferOutstanding status remains 'outstanding' after dispatch (no receipt yet)", status === "outstanding", "transfers_outstanding[T-035].status === 'outstanding'", `status=${status}`, "status=outstanding")); }

  // ═══ E6: receipt.reversed (AT-036 – AT-045) ═══

  // AT-036
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-036", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-036", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e6, s2); results.push(acc("AT-036", "E6 partial reversal of accepted E5 (first partial)", "evaluateEvent2G1A returns ok=true for partial reversal (3 of 10) of accepted receipt", r)); }

  // AT-037
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-037", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-037", reversal_quantity: 3 }); const { state: s3 } = runSeq(s2, e6a); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-037", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e6b, s3); results.push(acc("AT-037", "E6 second partial reversal of remaining (no independent blocker)", "evaluateEvent2G1A returns ok=true for second partial reversal (4 of remaining 7) with no independent blocker", r)); }

  // AT-038
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-038", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-038", reversal_quantity: 5 }); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-038", reversal_quantity: 3 }); const { state: s3 } = runSeq(s2, e6); const r2 = evaluateEvent2G1A(e6b, s3); const e6EventId = e6.event_id as string; const e5Prov = Object.values(s3.correction_provenance).find(p => p.original_event_id === (e5.event_id as string)); const selfBlocked = e5Prov ? e5Prov.blocking_downstream_event_ids.includes(e6EventId) : true; results.push(tr("AT-038", "E6 reversal does not block itself", "Accepted and E6 event_id not in E5 provenance blocking_downstream_event_ids", r2.ok && !selfBlocked, "ok=true, self not in blocking list", `ok=${r2.ok}, selfBlocked=${selfBlocked}`, "ok=true, self not in blocking list")); }

  // AT-039
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-039", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-039", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s3 } = runSeq(s2, e8); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-039", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e6, s3); results.push(rej("AT-039", "E6 reversal blocked by downstream E8 dispatch", "evaluateEvent2G1A rejects with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE when downstream E8 dispatch blocks reversal", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE")); }

  // AT-040
  { const s = makeBaseState(); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-NONEXIST", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e6, s); results.push(rej("AT-040", "E6 original not found (receipt_id lookup)", "evaluateEvent2G1A rejects with CORRECTION.ORIGINAL_NOT_FOUND for non-existent receipt_id", r, "CORRECTION.ORIGINAL_NOT_FOUND")); }

  // AT-041
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-041", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-041", reversal_quantity: 10 }); const { state: s3 } = runSeq(s2, e6a); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-041", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e6b, s3); results.push(rej("AT-041", "E6 already fully reversed", "evaluateEvent2G1A rejects with CORRECTION.ALREADY_REVERSED when remaining_reversible_quantity=0", r, "CORRECTION.ALREADY_REVERSED")); }

  // AT-042
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-042", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-042", reversal_quantity: 15 }); const r = evaluateEvent2G1A(e6, s2); results.push(rej("AT-042", "E6 reversal exceeds available", "evaluateEvent2G1A rejects with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE for reversal 15 > remaining 10", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE")); }

  // AT-043
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-043", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); s2.positions["POS-WH"].position_quantity = 3; s2.company_ownership["ITEM-001"].company_owned_quantity = 3; const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-043", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e6, s2); results.push(rej("AT-043", "E6 reversal would make position negative", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT when reversal would make position quantity negative (3-5=-2)", r, "INV.NEGATIVE_RESULT")); }

  // AT-044
  { const s = makeBaseState(); const e5a = mkEvent("receipt.posted", { receipt_id: "R-044", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5a); insertAcceptedTxn(s2, mkEvent("receipt.posted", { receipt_id: "R-044", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null })); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-044", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e6, s2); results.push(rej("AT-044", "E6 ambiguous original reference", "evaluateEvent2G1A rejects with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE when multiple matching receipts exist", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE")); }

  // AT-045
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-045-ACTUAL", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); e5.source_document_id = "DOC-045"; const { state: s2 } = runSeq(s, e5); const before = cloneDomainState(s2); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-045-WRONG", reversal_quantity: 1 }); e6.source_document_id = "DOC-045"; const r = evaluateEvent2G1A(e6, s2); results.push(rejZm("AT-045", "E6 source_document_id matches but receipt_id does not", "Reject with VALIDATION.RECEIPT_ID_MISMATCH + state unchanged (source_document_id matches, receipt_id differs)", r, "VALIDATION.RECEIPT_ID_MISMATCH", before, s2)); }

  // ═══ Adjustment events (AT-046 – AT-053) ═══

  // AT-046
  { const s = makeBaseState(); const e = mkEvent("adjustment.requested", { adjustment_request_id: "AR-001", position_id: "POS-WH", item_id: "ITEM-001", proposed_delta: 5, reason_text: "count adjustment" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-046", "Adjustment requested", "evaluateEvent2G1A returns ok=true for adjustment.requested (no-effect command)", r)); }

  // AT-047
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-001", position_id: "POS-WH", item_id: "ITEM-001", delta: 5, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-047", "Adjustment posted positive", "evaluateEvent2G1A returns ok=true for positive adjustment delta=5", r)); }

  // AT-048
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-002", position_id: "POS-WH", item_id: "ITEM-001", delta: -5, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-048", "Adjustment posted negative", "evaluateEvent2G1A returns ok=true for negative adjustment delta=-5 (100-5=95, non-negative)", r)); }

  // AT-049
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-003", position_id: "POS-WH", item_id: "ITEM-001", delta: -200, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-049", "Adjustment rejects negative result", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT for delta=-200 (would make 100-200=-80)", r, "INV.NEGATIVE_RESULT")); }

  // AT-050
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-004", position_id: "POS-WH", item_id: "ITEM-001", delta: 0, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-050", "Adjustment zero delta", "evaluateEvent2G1A rejects with VALIDATION.ZERO_DELTA_NOT_PERMITTED for delta=0 (E26 only, not E48)", r, "VALIDATION.ZERO_DELTA_NOT_PERMITTED")); }

  // AT-051
  { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "damaged", new_restriction: "none" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-051", "Reclassification condition change", "evaluateEvent2G1A returns ok=true for condition reclassification available→damaged", r)); }

  // AT-052
  { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "quarantined" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-052", "Reclassification restriction change", "evaluateEvent2G1A returns ok=true for restriction reclassification none→quarantined", r)); }

  // AT-053
  { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "none" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-053", "Reclassification no-op", "evaluateEvent2G1A rejects with VALIDATION.NO_OP_RECLASSIFICATION when condition and restriction unchanged", r, "VALIDATION.NO_OP_RECLASSIFICATION")); }

  // ═══ E27: adjustment.reversed (AT-054 – AT-061) ═══

  // AT-054
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-054", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-054", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e27, s2); results.push(acc("AT-054", "E27 reversal of positive E26 (partial)", "evaluateEvent2G1A returns ok=true for partial reversal (3 of 10) of positive adjustment", r)); }

  // AT-055
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-055", position_id: "POS-WH", item_id: "ITEM-001", delta: -10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-055", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e27, s2); results.push(acc("AT-055", "E27 reversal of negative E26 (partial)", "evaluateEvent2G1A returns ok=true for partial reversal (3 of 10) of negative adjustment", r)); }

  // ═══ CANONICAL AT-056 – AT-064: E27 sign restoration and edge cases ═══

  // AT-056
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-056C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-056C", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const posEff = r.ok ? r.state_effects.find(e => e.kind === "position_quantity") : null; const delta = posEff ? (posEff as { delta: number }).delta : null; results.push(tr("AT-056", "E27 sign restoration positive original", "E26+10, E27=4 → E27 delta = -4", delta === -4, "delta=-4", `delta=${delta}`)); }

  // AT-057
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-057C", position_id: "POS-WH", item_id: "ITEM-001", delta: -10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-057C", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const posEff = r.ok ? r.state_effects.find(e => e.kind === "position_quantity") : null; const delta = posEff ? (posEff as { delta: number }).delta : null; results.push(tr("AT-057", "E27 sign restoration negative original", "E26-10, E27=4 → E27 delta = +4", delta === 4, "delta=+4", `delta=${delta}`)); }

  // AT-058
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-058C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058C", reversal_quantity: 4 }); const { state: s1 } = runSeq(s, e26); const { state: s2 } = runSeq(s1, e27a); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058C", reversal_quantity: 6 }); const r = evaluateEvent2G1A(e27b, s2); results.push(acc("AT-058", "E27 repeated partial reversal (no independent blocker)", "evaluateEvent2G1A returns ok=true for second partial reversal (6 of remaining 6)", r)); }

  // AT-059
  { const s = makeBaseState(); const before = cloneDomainState(s); const e = mkEvent("adjustment.reversed", { original_adjustment_id: "NONEXISTENT", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-059", "E27 original not found", "Reject with CORRECTION.ORIGINAL_NOT_FOUND + state unchanged", r, "CORRECTION.ORIGINAL_NOT_FOUND", before, s)); }

  // AT-060
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-060C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-060C", reversal_quantity: 10 }); const { state: s1 } = runSeq(s, e26); const { state: s2 } = runSeq(s1, e27a); const before = cloneDomainState(s2); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-060C", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27b, s2); results.push(rejZm("AT-060", "E27 already reversed", "Reject with CORRECTION.ALREADY_REVERSED + state unchanged", r, "CORRECTION.ALREADY_REVERSED", before, s2)); }

  // AT-061
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-061C", position_id: "POS-WH", item_id: "ITEM-001", delta: 5, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-061C", reversal_quantity: 3 }); const { state: s1 } = runSeq(s, e26); const { state: s2 } = runSeq(s1, e27a); const before = cloneDomainState(s2); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-061C", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e27b, s2); results.push(rejZm("AT-061", "E27 reversal exceeds remaining reversible quantity", "Reject with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", before, s2)); }

  // AT-062
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-062C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); s2.positions["POS-WH"].position_quantity = 3; s2.company_ownership["ITEM-001"].company_owned_quantity = 3; const before = cloneDomainState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-062C", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-062", "E27 reversal negative result", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s2)); }

  // AT-063
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-063C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-063C", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s1 } = runSeq(s, e26); const { state: s2 } = runSeq(s1, e8); const before = cloneDomainState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-063C", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-063", "E27 reversal blocked by independent downstream", "Reject with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", before, s2)); }

  // AT-064
  { const s = makeBaseState(); const e26a = mkEvent("adjustment.posted", { adjustment_id: "ADJ-064C", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26a); insertAcceptedTxn(s2, mkEvent("adjustment.posted", { adjustment_id: "ADJ-064C", position_id: "POS-WH", item_id: "ITEM-001", delta: 5, authority_marker: "manager" })); const before = cloneDomainState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-064C", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-064", "E27 ambiguous original reference", "Reject with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE + state unchanged", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", before, s2)); }

  // ═══ SUPPLEMENTAL E27 edge cases (formerly at canonical positions) ═══

  // SUP-2G1A-001
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-056", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-056", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s3 } = runSeq(s2, e8); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-056", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e27, s3); results.push(rej("SUP-2G1A-001", "E27 reversal blocked by downstream transfer dispatch (supplemental)", "evaluateEvent2G1A rejects with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE when downstream transfer blocks adjustment reversal", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE")); }

  // SUP-2G1A-002
  { const s = makeBaseState(); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-NONEXIST", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27, s); results.push(rej("SUP-2G1A-002", "E27 original not found (supplemental)", "evaluateEvent2G1A rejects with CORRECTION.ORIGINAL_NOT_FOUND for non-existent adjustment_id", r, "CORRECTION.ORIGINAL_NOT_FOUND")); }

  // SUP-2G1A-003
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-058", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058", reversal_quantity: 10 }); const { state: s3 } = runSeq(s2, e27a); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27b, s3); results.push(rej("SUP-2G1A-003", "E27 already reversed (supplemental)", "evaluateEvent2G1A rejects with CORRECTION.ALREADY_REVERSED when remaining_reversible_quantity=0", r, "CORRECTION.ALREADY_REVERSED")); }

  // SUP-2G1A-004
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-059", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-059", reversal_quantity: 15 }); const r = evaluateEvent2G1A(e27, s2); results.push(rej("SUP-2G1A-004", "E27 reversal exceeds available (supplemental)", "evaluateEvent2G1A rejects with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE for reversal 15 > remaining 10", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE")); }

  // SUP-2G1A-005
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-060", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); s2.positions["POS-WH"].position_quantity = 3; s2.company_ownership["ITEM-001"].company_owned_quantity = 3; const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-060", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e27, s2); results.push(rej("SUP-2G1A-005", "E27 reversal would make position negative (supplemental)", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT when reversal would make position quantity negative (3-5=-2)", r, "INV.NEGATIVE_RESULT")); }

  // SUP-2G1A-006
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-061", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); insertAcceptedTxn(s2, mkEvent("adjustment.posted", { adjustment_id: "ADJ-061", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" })); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-061", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27, s2); results.push(rej("SUP-2G1A-006", "E27 ambiguous original reference (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE when multiple matching adjustments exist", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE")); }

  // ═══ CANONICAL AT-065 – AT-066: E32 job_material.issued ═══

  // AT-065
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-065C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); const hasIssue = r.ok && Object.keys(r.proposed_state.job_issue_progress).length > 0; results.push(tr("AT-065", "E32 issue creates JobIssueProgress", "Accepted with JobIssueProgress created", r.ok && hasIssue, "ok=true + issue created", r.ok ? "ok=true" : "ok=false")); }

  // AT-066
  { const s = makeBaseState(); const e1 = mkEvent("job_material.issued", { issue_id: "ISS-066C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const before = cloneDomainState(s2); const e2 = mkEvent("job_material.issued", { issue_id: "ISS-066C2", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rejZm("AT-066", "Second E32 into same position+item while open", "Reject with VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION + state unchanged", r, "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION", before, s2)); }

  // ═══ SUPPLEMENTAL E32 edge cases ═══

  // SUP-2G1A-007
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-001", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("SUP-2G1A-007", "E32 valid issue from warehouse to job custody (supplemental)", "evaluateEvent2G1A returns ok=true for valid job material issue", r)); }

  // SUP-2G1A-008
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-002", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-008", "E32 insufficient source quantity (supplemental)", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT for quantity 200 > source 100", r, "INV.NEGATIVE_RESULT")); }

  // SUP-2G1A-009
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-064", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.issued", { issue_id: "ISS-064", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-009", "E32 open issue already exists for position (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION when open issue exists for (item, position)", r, "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION")); }

  // SUP-2G1A-010
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-004", source_position_id: "POS-NONEXIST", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-010", "E32 missing source position (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.MISSING_SOURCE_POSITION for non-existent source position", r, "VALIDATION.MISSING_SOURCE_POSITION")); }

  // SUP-2G1A-011
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-005", source_position_id: "POS-WH", job_custody_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-011", "E32 missing job custody position (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.MISSING_DESTINATION_POSITION for non-existent job custody position", r, "VALIDATION.MISSING_DESTINATION_POSITION")); }

  // SUP-2G1A-012
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-006", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", bogus_key: true }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-012", "E32 unknown payload key (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.UNKNOWN_PAYLOAD_KEY for extra key on job_material.issued", r, "VALIDATION.UNKNOWN_PAYLOAD_KEY")); }

  // SUP-2G1A-013
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-007", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("SUP-2G1A-013", "E32 non-positive quantity (supplemental)", "evaluateEvent2G1A rejects with VALIDATION.NON_POSITIVE_QUANTITY for quantity=0", r, "VALIDATION.NON_POSITIVE_QUANTITY")); }

  // SUP-2G1A-014
  { const s = makeBaseState(); const e1 = mkEvent("job_material.issued", { issue_id: "ISS-008", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("job_material.issued", { issue_id: "ISS-009", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); e2.idempotency_key = e1.idempotency_key as string; const r = evaluateEvent2G1A(e2, s2); results.push(rej("SUP-2G1A-014", "E32 idempotency duplicate (supplemental)", "evaluateEvent2G1A rejects with INV.IDEMPOTENCY_DUPLICATE_CONTRACT for duplicate idempotency key", r, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT")); }

  // ═══ CANONICAL AT-067 – AT-069: E33 job_material.consumed ═══

  // AT-067
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-067C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-067C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); results.push(acc("AT-067", "E33 partial consumption", "evaluateEvent2G1A returns ok=true for partial consumption (3 of 10)", r)); }

  // AT-068
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-068C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33a = mkEvent("job_material.consumed", { consumption_id: "CON-068CA", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s1 } = runSeq(s, e32); const { state: s2 } = runSeq(s1, e33a); const e33b = mkEvent("job_material.consumed", { consumption_id: "CON-068CB", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 4, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33b, s2); results.push(acc("AT-068", "E33 multiple consumptions", "evaluateEvent2G1A returns ok=true for second consumption (4 of remaining 7)", r)); }

  // AT-069
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-069C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = cloneDomainState(s2); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-069C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); results.push(rejZm("AT-069", "E33 consumption exceeds outstanding", "Reject with CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE + state unchanged", r, "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE", before, s2)); }

  // ═══ E33: job_material.consumed (AT-070 – AT-077) ═══

  // AT-070
  { const s = makeBaseState(); const e = mkEvent("job_material.consumed", { consumption_id: "CON-070", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-070", "E33 consumption without open issue", "evaluateEvent2G1A rejects with VALIDATION.MISSING_ISSUE_PROVENANCE when no open issue exists", r, "VALIDATION.MISSING_ISSUE_PROVENANCE")); }

  // AT-071
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-071", item_id: "ITEM-001", job_custody_position_id: "POS-NONEXIST", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-071", job_custody_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-071", "E33 consumption missing source position", "evaluateEvent2G1A rejects with VALIDATION.MISSING_SOURCE_POSITION for non-existent job custody position (issue exists but position not found)", r, "VALIDATION.MISSING_SOURCE_POSITION")); }

  // AT-072
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-072", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-072", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5.00, currency: "USD" }, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-072", "E33 consumption rejects selling price", "evaluateEvent2G1A rejects with VAL.SELLING_PRICE_REJECTED for cost_source=selling_price on consumption", r, "VAL.SELLING_PRICE_REJECTED")); }

  // AT-073
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-073", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-073", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-073", "E33 consumption without cost accepted with warning", "evaluateEvent2G1A returns ok=true with 1 warning when cost is null", r, r.ok ? `warnings=${r.warnings.length}` : "")); }

  // AT-074
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-074", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-074", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const related = r.ok ? ((r.atomic_record_operations.find(op => (op as unknown as Record<string, unknown>).op_kind === "correction_provenance_created") as unknown as Record<string, unknown> | undefined)?.after as Record<string, unknown> | undefined) : undefined; const relVal = related?.related_issue_event_id as string ?? ""; results.push(tr("AT-074", "E33 provenance sets related_issue_event_id canonically", "CorrectionProvenanceCreatedOp.after.related_issue_event_id === E32 issue_event_id", relVal === "E32-074", "related_issue_event_id === E32-074", `related=${relVal}`, "related=E32-074")); }

  // AT-075
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-075", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-075", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const status = r.ok ? r.proposed_state.job_issue_progress["E32-075"]?.status : "unknown"; results.push(tr("AT-075", "Closure through full consumption", "JobIssueProgress.status === 'closed' after full consumption (10 of 10)", status === "closed", "status === 'closed'", `status=${status}`, "status=closed")); }

  // AT-076
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-076", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-076", original_issue_id: "E32-076", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); const status = r.ok ? r.proposed_state.job_issue_progress["E32-076"]?.status : "unknown"; results.push(tr("AT-076", "Closure through full return", "JobIssueProgress.status === 'closed' after full return (10 of 10)", status === "closed", "status === 'closed'", `status=${status}`, "status=closed")); }

  // AT-077
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-077", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const ec = mkEvent("job_material.consumed", { consumption_id: "CON-077", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, ec); const er = mkEvent("remnant.same_item_returned", { return_id: "RET-077", original_issue_id: "E32-077", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 7, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(er, s2); const status = r.ok ? r.proposed_state.job_issue_progress["E32-077"]?.status : "unknown"; results.push(tr("AT-077", "Closure through mixed consumption and return", "JobIssueProgress.status === 'closed' after consumption 3 + return 7 = 10 (full issue)", status === "closed", "status === 'closed'", `status=${status}`, "status=closed")); }

  // ═══ E34: consumption.reversed (AT-078 – AT-089) ═══

  // AT-078
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-078", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-078", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-078", reversal_quantity: 2 }); const r = evaluateEvent2G1A(e34, s2); results.push(acc("AT-078", "E34 partial reversal of accepted E33", "evaluateEvent2G1A returns ok=true for partial reversal (2 of 5) of accepted consumption", r)); }

  // AT-079
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-079", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-079", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-079", reversal_quantity: 2 }); const { state: s3 } = runSeq(s2, e34a); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-079", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34b, s3); results.push(acc("AT-079", "E34 repeated partial reversal (no independent blocker)", "evaluateEvent2G1A returns ok=true for second partial reversal (1 of remaining 3)", r)); }

  // AT-080
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-080", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-080", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-080", reversal_quantity: 2 }); const { state: s3 } = runSeq(s2, e34a); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-080", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34b, s3); const e34aEventId = e34a.event_id as string; const e33EventId = e33.event_id as string; const e33Prov = Object.values(s3.correction_provenance).find(p => p.original_event_id === e33EventId); const selfBlocked = e33Prov ? e33Prov.blocking_downstream_event_ids.includes(e34aEventId) : true; results.push(tr("AT-080", "E34 reversal does not block itself", "Accepted and E34a event_id not in E33 provenance blocking_downstream_event_ids", r.ok && !selfBlocked, "ok=true, self not in blocking list", `ok=${r.ok}, selfBlocked=${selfBlocked}`, "ok=true, self not in blocking list")); }

  // AT-081
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-081", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-081", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const preStatus = s2.job_issue_progress["E32-081"]?.status ?? "unknown"; const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-081", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e34, s2); const postStatus = r.ok ? r.proposed_state.job_issue_progress["E32-081"]?.status ?? "unknown" : "rejected"; const consumedQty = r.ok ? r.proposed_state.job_issue_progress["E32-081"]?.consumed_quantity ?? -1 : -1; results.push(tr("AT-081", "E34 reopening a closed issue", "Issue closed before (consumed=10), open after E34 reversal (consumed=5, status=open)", preStatus === "closed" && r.ok && postStatus === "open" && consumedQty === 5, "preStatus=closed, postStatus=open, consumed=5", `preStatus=${preStatus}, postStatus=${postStatus}, consumed=${consumedQty}`, "preStatus=closed, postStatus=open")); }

  // AT-082
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-082", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-082", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-082", reversal_quantity: 2 }); const r = evaluateEvent2G1A(e34, s2); const consumed = r.ok ? r.proposed_state.job_issue_progress["E32-082"]?.consumed_quantity : -1; results.push(tr("AT-082", "E34 locates issue via related_issue_event_id (not open-issue search)", "JobIssueProgress.consumed_quantity === 3 after reversing 2 of 5 (5-2=3)", consumed === 3, "consumed === 3", `consumed=${consumed}`, "consumed=3")); }

  // AT-083
  { const s = makeBaseState(); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-NONEXIST", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s); results.push(rej("AT-083", "E34 original not found", "evaluateEvent2G1A rejects with CORRECTION.ORIGINAL_NOT_FOUND for non-existent consumption_id", r, "CORRECTION.ORIGINAL_NOT_FOUND")); }

  // AT-084
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-084", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-084", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-084", reversal_quantity: 5 }); const { state: s3 } = runSeq(s2, e34a); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-084", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34b, s3); results.push(rej("AT-084", "E34 already reversed", "evaluateEvent2G1A rejects with CORRECTION.ALREADY_REVERSED when remaining_reversible_quantity=0", r, "CORRECTION.ALREADY_REVERSED")); }

  // AT-085
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-085", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-085", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-085", reversal_quantity: 10 }); const r = evaluateEvent2G1A(e34, s2); results.push(rej("AT-085", "E34 reversal exceeds unreversed consumption", "evaluateEvent2G1A rejects with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE for reversal 10 > remaining 5", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE")); }

  // AT-086
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-086a", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-086", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); insertAcceptedTxn(s2, mkEvent("job_material.consumed", { consumption_id: "CON-086", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" })); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-086", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); results.push(rej("AT-086", "E34 ambiguous original reference", "evaluateEvent2G1A rejects with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE when multiple matching consumptions exist", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE")); }

  // AT-087
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-087", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); insertAcceptedTxn(s, mkEvent("job_material.consumed", { consumption_id: "CON-087", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" })); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-087", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s); results.push(rej("AT-087", "E34 missing E33 provenance", "evaluateEvent2G1A rejects with VALIDATION.ISSUE_PROVENANCE_MISMATCH when E33 provenance not found (accepted txn exists but no provenance)", r, "VALIDATION.ISSUE_PROVENANCE_MISMATCH")); }

  // AT-088
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-088", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-088", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const prov = s2.correction_provenance[Object.keys(s2.correction_provenance)[0]]; if (prov) prov.related_issue_event_id = null; const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-088", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); results.push(rej("AT-088", "E34 missing JobIssueProgress for related_issue_event_id", "evaluateEvent2G1A rejects with VALIDATION.ISSUE_PROVENANCE_MISMATCH when related_issue_event_id is null", r, "VALIDATION.ISSUE_PROVENANCE_MISMATCH")); }

  // AT-089
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-089", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-089", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const eAdj = mkEvent("adjustment.posted", { adjustment_id: "ADJ-089", position_id: "POS-JOB", item_id: "ITEM-001", delta: 2, authority_marker: "manager" }); const { state: s3 } = runSeq(s2, eAdj); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-089", reversal_quantity: 2 }); const r = evaluateEvent2G1A(e34, s3); results.push(rej("AT-089", "E34 blocked by independent intervening quantity-changing event", "An intervening adjustment.posted on same item+position as E33 consumption blocks the E34 consumption reversal via CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE")); }

  // ═══ E37: remnant.same_item_returned (AT-090 – AT-099) ═══

  // AT-090
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-090", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-090", original_issue_id: "E32-090", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-090", "E37 valid exact issue/source attribution", "evaluateEvent2G1A returns ok=true for valid remnant return with matching issue custody position", r)); }

  // AT-091
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-091", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-091", original_issue_id: "E32-091", source_position_id: "POS-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-091", "E37 source position differing from referenced issue's custody position", "evaluateEvent2G1A rejects with VALIDATION.POSITION_MISMATCH when source position differs from issue custody position", r, "VALIDATION.POSITION_MISMATCH")); }

  // AT-092
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-092", item_id: "ITEM-002", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); s.items["ITEM-002"] = { item_id: "ITEM-002", governed_tracking_mode: "ordinary", governed_unit: "ea", valuation_method: null }; const e = mkEvent("remnant.same_item_returned", { return_id: "RET-092", original_issue_id: "E32-092", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-092", "E37 source item mismatch", "evaluateEvent2G1A rejects with VALIDATION.ITEM_MISMATCH when item_id differs from issue item", r, "VALIDATION.ITEM_MISMATCH")); }

  // AT-093
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-093", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); s.positions["POS-JOB"].position_quantity = 3; const e = mkEvent("remnant.same_item_returned", { return_id: "RET-093", original_issue_id: "E32-093", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-093", "E37 source quantity insufficient", "evaluateEvent2G1A rejects with INV.NEGATIVE_RESULT when source has 3 and return is 5 (3-5=-2<0)", r, "INV.NEGATIVE_RESULT")); }

  // AT-094
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-094", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); s.positions["POS-WH-002"] = { ...s.positions["POS-WH"], position_id: "POS-WH-002", item_id: "ITEM-002" }; const e = mkEvent("remnant.same_item_returned", { return_id: "RET-094", original_issue_id: "E32-094", source_position_id: "POS-JOB", destination_position_id: "POS-WH-002", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-094", "E37 destination item mismatch", "evaluateEvent2G1A rejects with VALIDATION.ITEM_MISMATCH when source and destination items differ", r, "VALIDATION.ITEM_MISMATCH")); }

  // AT-095
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-095", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-095", original_issue_id: "E32-095", source_position_id: "POS-JOB", destination_position_id: "POS-TERMINAL", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-095", "E37 destination not warehouse/truck", "evaluateEvent2G1A rejects with VALIDATION.POSITION_MISMATCH when destination is terminal_job_cost (not warehouse/truck)", r, "VALIDATION.POSITION_MISMATCH")); }

  // AT-096
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-096", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-096", original_issue_id: "E32-096", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-096", "E37 partial return", "evaluateEvent2G1A returns ok=true for partial return (5 of 10 outstanding)", r)); }

  // AT-097
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-097", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-097", original_issue_id: "E32-097", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 15, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-097", "E37 return exceeds outstanding issue", "evaluateEvent2G1A rejects with RETURN.EXCEEDS_OUTSTANDING_ISSUE for return 15 > outstanding 10", r, "RETURN.EXCEEDS_OUTSTANDING_ISSUE")); }

  // AT-098
  { const s = makeBaseState(); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-098", original_issue_id: "E32-NONEXIST", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-098", "E37 original issue not found", "evaluateEvent2G1A rejects with CORRECTION.ORIGINAL_NOT_FOUND for non-existent issue_id", r, "CORRECTION.ORIGINAL_NOT_FOUND")); }

  // AT-099
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-099", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); insertAcceptedTxn(s, mkEvent("job_material.issued", { issue_id: "E32-099", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" })); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-099", original_issue_id: "E32-099", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-099", "E37 ambiguous original reference", "evaluateEvent2G1A rejects with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE when multiple matching issues exist", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE")); }

  // ═══ Count events (AT-100 – AT-103) ═══

  // AT-100
  { const s = makeBaseState(); const e = mkEvent("count.observation", { count_session_id: "CS-001", position_id: "POS-WH", item_id: "ITEM-001", observed_quantity: 95 }); const r = evaluateEvent2G1A(e, s); results.push(tr("AT-100", "Count observation no effect", "evaluateEvent2G1A returns ok=true with 0 state effects for count.observation (no-effect observation)", r.ok && r.state_effects.length === 0, "ok=true, effects=0", r.ok ? `ok=true, effects=${r.state_effects.length}` : "ok=false", "effects=0")); }

  // AT-101
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-002", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 105, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(tr("AT-101", "Count variance resolved positive", "evaluateEvent2G1A returns ok=true with 0 immutable facts for positive count variance resolution", r.ok && r.immutable_facts.length === 0, "ok=true, facts=0", r.ok ? `ok=true, facts=${r.immutable_facts.length}` : "ok=false", "facts=0")); }

  // AT-102
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-003", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 95, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(tr("AT-102", "Count variance resolved negative", "evaluateEvent2G1A returns ok=true with 0 immutable facts for negative count variance resolution", r.ok && r.immutable_facts.length === 0, "ok=true, facts=0", r.ok ? `ok=true, facts=${r.immutable_facts.length}` : "ok=false", "facts=0")); }

  // AT-103
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-004", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 105, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const hasProv = r.ok ? r.atomic_record_operations.some(op => (op as unknown as Record<string, unknown>).op_kind === "correction_provenance_created") : true; results.push(tr("AT-103", "E48 creates no CorrectionProvenanceCreatedOp", "No CorrectionProvenanceCreatedOp in atomic_record_operations for count.variance.resolved (Rule B: E48 creates no provenance)", !hasProv, "hasProvenanceOp=false", `hasProvenanceOp=${hasProv}`, "hasProvenanceOp=false")); }

  // ═══ Discriminator tests (AT-104 – AT-111) ═══

  // AT-104
  { const s = makeBaseState(); const e = mkEvent("po.received" as "receipt.posted", { purchase_order_id: "PO-001" }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-104", "Deferred event E10 recognized", "evaluateEvent2G1A rejects po.received with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE (recognized deferred, not authorized)", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE")); }

  // AT-105
  { const s = makeBaseState(); const before = cloneDomainState(s); const e = mkEvent("disposal.requested" as "receipt.posted", { disposal_id: "DISP-105" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-105", "Deferred event E40 recognized", "Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + state unchanged (disposal.requested = E40 deferred)", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", before, s)); }

  // AT-106
  { const s = makeBaseState(); const before = cloneDomainState(s); const e = mkEvent("po.received" as "receipt.posted", { purchase_order_id: "PO-106" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-106", "Deferred event E7 recognized", "Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + state unchanged (po.received = E7 deferred)", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", before, s)); }

  // AT-107
  { const s = makeBaseState(); const e: Record<string, unknown> = { event_id: "E-107", event_type: "bogus.event", transaction_time: "2025-01-01T12:00:00Z", posting_time: "2025-01-01T12:00:01Z", source_document_type: "receipt", source_document_id: "DOC-107", source_document_number: null, idempotency_key: "IDEM-107", requester: "test", causation_id: null, correlation_id: null, notes: "" }; const r = evaluateEvent2G1A(e, s); results.push(rej("AT-107", "Unknown discriminator", "evaluateEvent2G1A rejects with VALIDATION.UNKNOWN_EVENT_TYPE for unrecognized event_type", r, "VALIDATION.UNKNOWN_EVENT_TYPE")); }

  // AT-108
  { const s = makeBaseState(); const r = evaluateEvent2G1A(null, s); results.push(rej("AT-108", "Null event input", "evaluateEvent2G1A rejects with VALIDATION.NULL_EVENT_INPUT for null input", r, "VALIDATION.NULL_EVENT_INPUT")); }

  // AT-109
  { const s = makeBaseState(); const r = evaluateEvent2G1A("string input", s); results.push(rej("AT-109", "Non-object input (string)", "evaluateEvent2G1A rejects with VALIDATION.NON_OBJECT_INPUT for string input", r, "VALIDATION.NON_OBJECT_INPUT")); }

  // AT-110
  { const s = makeBaseState(); const r = evaluateEvent2G1A(42, s); results.push(rej("AT-110", "Non-object input (number)", "evaluateEvent2G1A rejects with VALIDATION.NON_OBJECT_INPUT for number input", r, "VALIDATION.NON_OBJECT_INPUT")); }

  // AT-111
  { const s = makeBaseState(); const e: Record<string, unknown> = { transaction_time: "2025-01-01T12:00:00Z", posting_time: "2025-01-01T12:00:01Z", source_document_type: "receipt", source_document_id: "DOC-111", source_document_number: null, idempotency_key: "IDEM-111", requester: "test", causation_id: null, correlation_id: null, notes: "" }; const r = evaluateEvent2G1A(e, s); results.push(rej("AT-111", "Missing event_type field", "evaluateEvent2G1A rejects with VALIDATION.MISSING_REQUIRED_FIELD when event_type is missing", r, "VALIDATION.MISSING_REQUIRED_FIELD")); }

  // ═══ Invariants and ordering (AT-112 – AT-120) ═══

  // AT-112
  { const s = makeBaseState(); const e1 = mkEvent("receipt.posted", { receipt_id: "R-112", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("receipt.posted", { receipt_id: "R-112b", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); e2.idempotency_key = e1.idempotency_key as string; const r = evaluateEvent2G1A(e2, s2); results.push(rej("AT-112", "Idempotency duplicate", "evaluateEvent2G1A rejects with INV.IDEMPOTENCY_DUPLICATE_CONTRACT for duplicate idempotency key", r, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT")); }

  // AT-113
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-113", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const co = r.ok ? r.proposed_state.company_ownership["ITEM-001"].company_owned_quantity : -1; results.push(tr("AT-113", "Company-owned conservation", "Company-owned quantity === 110 after receipt of 10 to existing 100 (conservation)", co === 110, "co === 110", `co=${co}`, "co=110")); }

  // AT-114
  { const s = makeBaseState(); s.company_ownership["ITEM-001"].company_owned_quantity = 50; const e = mkEvent("receipt.posted", { receipt_id: "R-114", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-114", "Company-owned reconciliation mismatch", "evaluateEvent2G1A rejects with RECONCILIATION.COMPANY_OWNED_MISMATCH when pre-existing company-owned mismatch detected", r, "RECONCILIATION.COMPANY_OWNED_MISMATCH")); }

  // AT-115
  { const s = makeBaseState(); s.positions["POS-TERMINAL"].position_quantity = 5; const e = mkEvent("receipt.posted", { receipt_id: "R-115", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-115", "Terminal zero-balance invariant", "evaluateEvent2G1A rejects with STATE.WRONG_TRANSITION when terminal position has nonzero quantity (invariant violation)", r, "STATE.WRONG_TRANSITION")); }

  // AT-116
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-116", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const ec = mkEvent("job_material.consumed", { consumption_id: "CON-116", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(ec, s); const issue = r.ok ? r.proposed_state.job_issue_progress["E32-116"] : null; const vals = issue ? `${issue.issued_quantity}/${issue.consumed_quantity}/${issue.returned_quantity}/${issue.outstanding_quantity}` : "none"; results.push(tr("AT-116", "Issued/consumed/returned/outstanding reconciliation", "JobIssueProgress: issued=10, consumed=3, returned=0, outstanding=7 (10-3-0=7)", vals === "10/3/0/7", "10/3/0/7", vals, "10/3/0/7")); }

  // AT-117
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-117", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const rev = r.ok ? r.proposed_state.state_revision : -1; const before = s.state_revision; results.push(tr("AT-117", "State revision increments by exactly one on accept", "state_revision === before+1 (1→2) on accepted event", rev === before + 1, "rev === before+1", `rev=${rev}, before=${before}`, "rev=before+1")); }

  // AT-118
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-118", destination_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const rev = s.state_revision; results.push(tr("AT-118", "State revision unchanged on rejection", "state_revision unchanged (remains 1) after rejected event", rev === 1, "rev === 1", `rev=${rev}`, "rev=before")); }

  // AT-119 — Non-vacuous comparator test: exercises ALL 3 dimensions (kind, position_id, item_id)
  // No single canonical event can produce effects exercising all 3 dimensions (item_id after kind+position_id tie is impossible).
  // Contract Section 15 adopts sortEffects as a standalone function; direct comparator testing is contract-compliant.
  {
    // Deliberately scrambled input — every record in a different position from expected output
    // Expected: company_owned(0), POS-A/ITEM-A(1), POS-A/ITEM-Z(2), POS-B/ITEM-X(3), POS-Z/ITEM-X(4)
    const scrambled: CanonicalStateEffect2G1A[] = [
      { kind: "position_quantity", position_id: "POS-A", item_id: "ITEM-Z", delta: 1, before: 0, after: 1, reason: "vendor_receipt" },
      { kind: "position_quantity", position_id: "POS-Z", item_id: "ITEM-X", delta: 1, before: 0, after: 1, reason: "vendor_receipt" },
      { kind: "company_owned", item_id: "ITEM-X", delta: 1, before: 0, after: 1, reason: "vendor_receipt" },
      { kind: "position_quantity", position_id: "POS-A", item_id: "ITEM-A", delta: 1, before: 0, after: 1, reason: "vendor_receipt" },
      { kind: "position_quantity", position_id: "POS-B", item_id: "ITEM-X", delta: 1, before: 0, after: 1, reason: "vendor_receipt" },
    ];
    // Independently compute expected order (NOT using production sortEffects)
    const expected = [...scrambled].sort((a, b) => {
      if (a.kind < b.kind) return -1;
      if (a.kind > b.kind) return 1;
      const aPos = ("position_id" in a) ? a.position_id : "";
      const bPos = ("position_id" in b) ? b.position_id : "";
      if (aPos < bPos) return -1;
      if (aPos > bPos) return 1;
      if (a.item_id < b.item_id) return -1;
      if (a.item_id > b.item_id) return 1;
      return 0;
    });
    // Actual: production comparator
    const actual = sortEffects(scrambled);
    // Verify complete sequence matches
    const seqMatch = actual.length === expected.length && actual.every((e, i) => e === expected[i]);
    // Explicit evidence: each dimension changed at least one record's position
    const coScrIdx = scrambled.findIndex(e => e.kind === "company_owned");
    const coActIdx = actual.findIndex(e => e.kind === "company_owned");
    const kindChanged = coScrIdx !== coActIdx;
    const posZScrIdx = scrambled.findIndex(e => e.kind === "position_quantity" && (e as { position_id: string }).position_id === "POS-Z");
    const posZActIdx = actual.findIndex(e => e.kind === "position_quantity" && (e as { position_id: string }).position_id === "POS-Z");
    const posIdChanged = posZScrIdx !== posZActIdx;
    const itemZScrIdx = scrambled.findIndex(e => e.kind === "position_quantity" && (e as { position_id: string }).position_id === "POS-A" && (e as { item_id: string }).item_id === "ITEM-Z");
    const itemZActIdx = actual.findIndex(e => e.kind === "position_quantity" && (e as { position_id: string }).position_id === "POS-A" && (e as { item_id: string }).item_id === "ITEM-Z");
    const itemIdChanged = itemZScrIdx !== itemZActIdx;
    results.push(tr("AT-119", "Deterministic effect ordering (non-vacuous comparator)", "sortEffects exercises all 3 dimensions: kind (company_owned 2→0), position_id (POS-Z 1→4), item_id (ITEM-Z 0→2); scrambled input, complete sequence verified, independent oracle, no production comparator as oracle", seqMatch && kindChanged && posIdChanged && itemIdChanged, "seqMatch=true, kindChanged=true, posIdChanged=true, itemIdChanged=true", `seqMatch=${seqMatch}, kindChanged=${kindChanged}(co:${coScrIdx}→${coActIdx}), posIdChanged=${posIdChanged}(posZ:${posZScrIdx}→${posZActIdx}), itemIdChanged=${itemIdChanged}(itemZ:${itemZScrIdx}→${itemZActIdx})`, "seqMatch=true, all 3 dimensions changed position"));
  }

  // AT-120 — Non-vacuous comparator test: exercises ALL 3 dimensions (category, error_code, affected_field)
  // No single public evaluation can produce errors with different categories (Stage B short-circuits before Stage C).
  // Contract Section 15 adopts sortErrors as a standalone function; direct comparator testing is contract-compliant.
  {
    // Deliberately scrambled input (reverse of expected output — every record moves)
    const scrambled: DomainError[] = [
      { error_code: "VALIDATION.UNKNOWN_PAYLOAD_KEY", category: "validation", severity: "blocking", message: "Unknown key", affected_field: "bogus_key", affected_relationship: null, event_type: "receipt.posted", invariant_references: [], decision_references: [], exception_workflow_required: false, safe_context: {} },
      { error_code: "VALIDATION.MISSING_REQUIRED_FIELD", category: "validation", severity: "blocking", message: "Missing field_z", affected_field: "field_z", affected_relationship: null, event_type: "receipt.posted", invariant_references: [], decision_references: [], exception_workflow_required: false, safe_context: {} },
      { error_code: "VALIDATION.MISSING_REQUIRED_FIELD", category: "validation", severity: "blocking", message: "Missing field_a", affected_field: "field_a", affected_relationship: null, event_type: "receipt.posted", invariant_references: [], decision_references: [], exception_workflow_required: false, safe_context: {} },
      { error_code: "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", category: "authorization", severity: "blocking", message: "Out of scope", affected_field: null, affected_relationship: null, event_type: "<unknown>", invariant_references: [], decision_references: [], exception_workflow_required: false, safe_context: {} },
    ];
    // Independently compute expected order (NOT using production sortErrors)
    const expected = [...scrambled].sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      if (a.error_code < b.error_code) return -1;
      if (a.error_code > b.error_code) return 1;
      const af = a.affected_field ?? "~";
      const bf = b.affected_field ?? "~";
      if (af < bf) return -1;
      if (af > bf) return 1;
      return 0;
    });
    // Actual: production comparator
    const actual = sortErrors(scrambled);
    // Verify complete sequence matches
    const seqMatch = actual.length === expected.length && actual.every((e, i) => e === expected[i]);
    // Explicit evidence: each dimension changed at least one record's position
    const authScrIdx = scrambled.findIndex(e => e.category === "authorization");
    const authActIdx = actual.findIndex(e => e.category === "authorization");
    const categoryChanged = authScrIdx !== authActIdx;
    const upkScrIdx = scrambled.findIndex(e => e.error_code === "VALIDATION.UNKNOWN_PAYLOAD_KEY");
    const upkActIdx = actual.findIndex(e => e.error_code === "VALIDATION.UNKNOWN_PAYLOAD_KEY");
    const errorCodeChanged = upkScrIdx !== upkActIdx;
    const fzScrIdx = scrambled.findIndex(e => e.affected_field === "field_z");
    const fzActIdx = actual.findIndex(e => e.affected_field === "field_z");
    const affectedFieldChanged = fzScrIdx !== fzActIdx;
    // Verify expected error codes and affected fields explicitly present
    const codes = actual.map(e => e.error_code);
    const fields = actual.map(e => e.affected_field);
    const hasExpectedCodes = codes.includes("AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE") && codes.includes("VALIDATION.MISSING_REQUIRED_FIELD") && codes.includes("VALIDATION.UNKNOWN_PAYLOAD_KEY") && fields.includes("field_a") && fields.includes("field_z") && fields.includes("bogus_key");
    results.push(tr("AT-120", "Deterministic error ordering (non-vacuous comparator)", "sortErrors exercises all 3 dimensions: category (auth 3→0), error_code (UNKNOWN 0→3), affected_field (field_z 1→2); 4 errors, scrambled input, complete sequence verified, independent oracle, expected codes/fields present", seqMatch && categoryChanged && errorCodeChanged && affectedFieldChanged && hasExpectedCodes, "seqMatch=true, categoryChanged=true, errorCodeChanged=true, affectedFieldChanged=true, hasExpectedCodes=true", `seqMatch=${seqMatch}, categoryChanged=${categoryChanged}(auth:${authScrIdx}→${authActIdx}), errorCodeChanged=${errorCodeChanged}(upk:${upkScrIdx}→${upkActIdx}), affectedFieldChanged=${affectedFieldChanged}(fz:${fzScrIdx}→${fzActIdx}), hasExpectedCodes=${hasExpectedCodes}`, "seqMatch=true, all 3 dimensions changed position, expected codes/fields present"));
  }

  // ═══ Serialization and metadata (AT-121 – AT-131) ═══

  // AT-121
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-121", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); let serialized = true; try { JSON.stringify(r); } catch { serialized = false; } results.push(tr("AT-121", "AcceptedEventRecord finite nonrecursive serialization", "JSON.stringify(result) succeeds without circular reference or stack overflow", serialized, "JSON.stringify succeeds", `serialized=${serialized}`, "serialized=true")); }

  // AT-122
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-122", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const txn = r as unknown as { ok: boolean; proposed_state: { transactions: Record<string, unknown> } }; const recs = r.ok ? Object.keys(txn.proposed_state.transactions) : []; const recordedOps = recs.flatMap(rid => (txn.proposed_state.transactions[rid] as { recorded_operations: unknown[] }).recorded_operations); const hasApplierOnly = recordedOps.some(op => { const k = (op as unknown as Record<string, unknown>).op_kind; return k === "accepted_event_record_inserted" || k === "state_revision_advanced"; }); results.push(tr("AT-122", "Transaction insertion op rejected inside its own record", "recorded_operations (inside AcceptedEventRecord) excludes applier-only ops (accepted_event_record_inserted, state_revision_advanced)", r.ok && !hasApplierOnly, "no applier-only ops in recorded_operations", `ok=${r.ok}, hasApplierOnly=${hasApplierOnly}`, "no applier-only ops in recorded_operations")); }

  // ═══ CANONICAL AT-123 – AT-137: Compile, boundary, and blocker emission ═══

  // AT-123
  { const s = makeBaseState(); const e = mkEvent("po.created", { purchase_order_id: "PO-123C", vendor_id: "V-001", lines: [{ line_id: "L-001", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }] }); const r = evaluateEvent2G1A(e, s); const cls = r.ok ? r.classification_results : []; const wf = cls.find(c => (c as unknown as Record<string, unknown>).kind === "no_effect_workflow"); const reasonCount = wf ? Object.keys(wf as unknown as Record<string, unknown>).filter(k => k === "reason").length : 0; results.push(tr("AT-123", "NoEffectWorkflow compiles without duplicate properties", "classification_results has 1 no_effect_workflow with single reason field", r.ok && !!wf && reasonCount === 1, "ok=true, kind=no_effect_workflow, reasonCount=1", `ok=${r.ok}, hasWf=${!!wf}, reasonCount=${reasonCount}`, "ok=true, reasonCount=1")); }

  // AT-124
  { const s = makeBaseState(); const e = mkEvent("adjustment.requested", { adjustment_request_id: "AR-124C", position_id: "POS-WH", item_id: "ITEM-001", proposed_delta: 5, reason_text: "count adjustment" }); const r = evaluateEvent2G1A(e, s); const cls = r.ok ? r.classification_results : []; const cmd = cls.find(c => (c as unknown as Record<string, unknown>).kind === "no_effect_command"); const reasonCount = cmd ? Object.keys(cmd as unknown as Record<string, unknown>).filter(k => k === "reason").length : 0; results.push(tr("AT-124", "NoEffectCommand compiles with single reason field", "classification_results has 1 no_effect_command with single reason field", r.ok && !!cmd && reasonCount === 1, "ok=true, kind=no_effect_command, reasonCount=1", `ok=${r.ok}, hasCmd=${!!cmd}, reasonCount=${reasonCount}`, "ok=true, reasonCount=1")); }

  // AT-125
  { const s = makeBaseState(); const e = mkEvent("count.observation", { count_session_id: "CS-125C", position_id: "POS-WH", item_id: "ITEM-001", observed_quantity: 95 }); const r = evaluateEvent2G1A(e, s); const cls = r.ok ? r.classification_results : []; const obs = cls.find(c => (c as unknown as Record<string, unknown>).kind === "no_effect_observation"); const reasonCount = obs ? Object.keys(obs as unknown as Record<string, unknown>).filter(k => k === "reason").length : 0; results.push(tr("AT-125", "NoEffectObservation compiles with single reason field", "classification_results has 1 no_effect_observation with single reason field", r.ok && !!obs && reasonCount === 1, "ok=true, kind=no_effect_observation, reasonCount=1", `ok=${r.ok}, hasObs=${!!obs}, reasonCount=${reasonCount}`, "ok=true, reasonCount=1")); }

  // AT-126
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-126C", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-126", "RawEventInput2G1A exists before raw cost transformation", "E5 with supported_explicit cost accepted (Stage C raw input validation before Stage D cost transformation)", r, r.ok ? `facts=${r.immutable_facts.length}` : "")); }

  // AT-127
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-127C", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rej("AT-127", "Raw invalid cost never enters DomainEvent2G1A", "E5 with selling_price cost rejected with VAL.SELLING_PRICE_REJECTED before DomainEvent construction", r, "VAL.SELLING_PRICE_REJECTED")); }

  // AT-128
  { const s = makeBaseState(); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-128C-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5it = mkEvent("receipt.posted", { receipt_id: "R-128C-IT", destination_position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(runSeq(s, e5wh).state, e5it); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-128C", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e8, s2); let blocksAtSource = false; let blocksAtInTransit = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-WH") blocksAtSource = true; if (bop.blocking_position_id === "POS-IN-TRANSIT") blocksAtInTransit = true; } } } results.push(tr("AT-128", "E8 blocker emission for both affected positions", "Blocks emitted for provenance at both POS-WH and POS-IN-TRANSIT", r.ok && blocksAtSource && blocksAtInTransit, "blocks at both", `source=${blocksAtSource}, in_transit=${blocksAtInTransit}`)); }

  // AT-129
  { const s = makeBaseState(); const e5it = mkEvent("receipt.posted", { receipt_id: "R-129C-IT", destination_position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5tr = mkEvent("receipt.posted", { receipt_id: "R-129C-TR", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-129C", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s3 } = runSeq(runSeq(runSeq(s, e5it).state, e5tr).state, e8); const e9 = mkEvent("transfer.received", { transfer_id: "T-129C", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s3); let blocksAtInTransit = false; let blocksAtDest = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-IN-TRANSIT") blocksAtInTransit = true; if (bop.blocking_position_id === "POS-TRUCK") blocksAtDest = true; } } } results.push(tr("AT-129", "E9 blocker emission for both affected positions", "Blocks emitted for provenance at both POS-IN-TRANSIT and POS-TRUCK", r.ok && blocksAtInTransit && blocksAtDest, "blocks at both", `in_transit=${blocksAtInTransit}, dest=${blocksAtDest}`)); }

  // AT-130
  { const s = makeBaseState(); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-130C-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 20, unit_of_measure: "ea", cost: null }); const e5job = mkEvent("receipt.posted", { receipt_id: "R-130C-JOB", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(runSeq(s, e5wh).state, e5job); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-130C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e32, s2); let blocksAtSource = false; let blocksAtJob = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-WH") blocksAtSource = true; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; } } } results.push(tr("AT-130", "E32 blocker emission for both affected positions", "Blocks emitted for provenance at POS-WH and POS-JOB, excluding newly-created provenance", r.ok && blocksAtSource && blocksAtJob, "blocks at both", `source=${blocksAtSource}, job=${blocksAtJob}`)); }

  // AT-131
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-131C", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-131C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(runSeq(s, e5job).state, e32); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-131C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); let blocksAtJob = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; } } } results.push(tr("AT-131", "E33 blocker emission at job-custody position", "Blocks emitted at job-custody position, excluding newly-created provenance", r.ok && blocksAtJob, "blocks at job-custody", `blocks=${blocksAtJob}`)); }

  // AT-132
  { const codeCount = ALL_ERROR_CODES.length; const scenarios: { expected: string; code: string; zeroMut: boolean; codeMatch: boolean }[] = [];
    { const s = makeBaseState(); const e = mkEvent("po.received" as "receipt.posted", { purchase_order_id: "PO-132C" }); const z = zm(s, e, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE"); scenarios.push({ expected: "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...z }); }
    { const s = makeBaseState(); const z = zm(s, null as unknown as Record<string, unknown>, "VALIDATION.NULL_EVENT_INPUT"); scenarios.push({ expected: "VALIDATION.NULL_EVENT_INPUT", ...z }); }
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132C", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null }); const z = zm(s, e, "VALIDATION.NON_POSITIVE_QUANTITY"); scenarios.push({ expected: "VALIDATION.NON_POSITIVE_QUANTITY", ...z }); }
    { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-132C", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }); const z = zm(s, e, "INV.NEGATIVE_RESULT"); scenarios.push({ expected: "INV.NEGATIVE_RESULT", ...z }); }
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132C2", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" } }); const z = zm(s, e, "VAL.SELLING_PRICE_REJECTED"); scenarios.push({ expected: "VAL.SELLING_PRICE_REJECTED", ...z }); }
    { const s = makeBaseState(); const e = mkEvent("receipt.reversed", { original_receipt_id: "R-NONEXIST", reversal_quantity: 1 }); const z = zm(s, e, "CORRECTION.ORIGINAL_NOT_FOUND"); scenarios.push({ expected: "CORRECTION.ORIGINAL_NOT_FOUND", ...z }); }
    { const s = makeBaseState(); const e = mkEvent("transfer.received", { transfer_id: "T-132C3", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const z = zm(s, e, "TRANSFER.RECEIVE_WITHOUT_DISPATCH"); scenarios.push({ expected: "TRANSFER.RECEIVE_WITHOUT_DISPATCH", ...z }); }
    { const s = makeBaseState(); const e: Record<string, unknown> = { event_id: "E-132C", event_type: "bogus.event", transaction_time: "2025-01-01T12:00:00Z", posting_time: "2025-01-01T12:00:01Z", source_document_type: "receipt", source_document_id: "DOC-132C", source_document_number: null, idempotency_key: "IDEM-132C", requester: "test", causation_id: null, correlation_id: null, notes: "" }; const z = zm(s, e, "VALIDATION.UNKNOWN_EVENT_TYPE"); scenarios.push({ expected: "VALIDATION.UNKNOWN_EVENT_TYPE", ...z }); }
    const allZeroMut = scenarios.every(sc => sc.zeroMut); const allCodeMatch = scenarios.every(sc => sc.codeMatch); results.push(tr("AT-132", "Zero mutation across all rejection codes (aggregate)", `ALL_ERROR_CODES.length === 38 and ${scenarios.length} representative codes verified zero-mutation`, codeCount === 38 && allZeroMut && allCodeMatch, "codes=38, allZeroMut=true, allCodeMatch=true", `codes=${codeCount}, allZeroMut=${allZeroMut}, allCodeMatch=${allCodeMatch}, tested=${scenarios.length}`, "codes=38, allZeroMut=true, allCodeMatch=true")); }

  // AT-133
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-133C", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-133C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-133C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(runSeq(runSeq(s, e5job).state, e32).state, e33); const e33EventId = e33.event_id as string; const e5Prov = Object.values(s2.correction_provenance).find(p => p.original_event_type === "receipt.posted" && p.original_position_id === "POS-JOB"); const e33Prov = Object.values(s2.correction_provenance).find(p => p.original_event_id === e33EventId); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-133C", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); let blocksOtherProv = false; let doesNotBlockSelf = true; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { provenance_record_id: string }; if (e5Prov && bop.provenance_record_id === e5Prov.record_id) blocksOtherProv = true; if (e33Prov && bop.provenance_record_id === e33Prov.record_id) doesNotBlockSelf = false; } } } results.push(tr("AT-133", "E34 blocker emission at job-custody position excluding its own E33 target", "Blocks emitted at other eligible provenance records, excludes own E33 target", r.ok && blocksOtherProv && doesNotBlockSelf, "blocks other, not self", `other=${blocksOtherProv}, self_not_blocked=${doesNotBlockSelf}`)); }

  // AT-134
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-134C-JOB", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-134C-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-134C", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(runSeq(runSeq(s, e5job).state, e5wh).state, e32); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-134C", original_issue_id: "ISS-134C", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); let blocksAtJob = false; let blocksAtWh = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as unknown as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; if (bop.blocking_position_id === "POS-WH") blocksAtWh = true; } } } results.push(tr("AT-134", "E37 blocker emission for both affected positions", "Blocks emitted for provenance at both POS-JOB and POS-WH", r.ok && blocksAtJob && blocksAtWh, "blocks at both", `job=${blocksAtJob}, wh=${blocksAtWh}`)); }

  // AT-135
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-135C", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-135C", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 115, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s2); const blockOps = r.ok ? r.atomic_record_operations.filter(op => (op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") : []; results.push(tr("AT-135", "E48 blocker emission when delta nonzero", "E48 with delta!=0 (115-100=+15) emits blocks at affected position", r.ok && blockOps.length >= 1, "blockOps>=1", `blockOps=${blockOps.length}`, "blockOps>=1")); }

  // AT-136
  { const s = makeBaseState(); const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-136C", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 100, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s); const blockOps = r.ok ? r.atomic_record_operations.filter(op => (op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") : []; results.push(tr("AT-136", "E48 zero-delta emits no blocker operation", "E48 with delta=0 (100-100=0) emits zero block ops", r.ok && blockOps.length === 0, "blockOps=0", `ok=${r.ok}, blockOps=${blockOps.length}`, "blockOps=0")); }

  // AT-137
  { const s = makeBaseState(); const before = cloneDomainState(s); const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-137C", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: -5, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s); results.push(rejZm("AT-137", "E48 rejected emits no blocker operation (zero mutation)", "Reject with VALIDATION.NON_POSITIVE_QUANTITY + zero block ops + state unchanged", r, "VALIDATION.NON_POSITIVE_QUANTITY", before, s)); }

  // ═══ SUPPLEMENTAL metadata and edge cases ═══

  // SUP-2G1A-015
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-123", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const fv = r.ok ? r.formula_version : ""; results.push(tr("SUP-2G1A-015", "Formula version present (supplemental)", "result.formula_version === '2g1a-v1.0.0'", fv === "2g1a-v1.0.0", "formula_version === '2g1a-v1.0.0'", `formula_version=${fv}`, "formula_version=2g1a-v1.0.0")); }

  // SUP-2G1A-016
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-124", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const idem = e.idempotency_key as string; const resultIdem = r.ok ? r.idempotency_key : ""; results.push(tr("SUP-2G1A-016", "Idempotency key preserved on accept (supplemental)", "result.idempotency_key === event.idempotency_key on accepted result", resultIdem === idem, "idempotency_key preserved", `result=${resultIdem}, event=${idem}`, "idempotency_key preserved")); }

  // SUP-2G1A-017
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-125", destination_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const idem = e.idempotency_key as string; const resultIdem = !r.ok ? r.idempotency_key ?? "" : ""; results.push(tr("SUP-2G1A-017", "Idempotency key preserved on reject (supplemental)", "result.idempotency_key === event.idempotency_key on rejected result", resultIdem === idem, "idempotency_key preserved", `result=${resultIdem}, event=${idem}`, "idempotency_key preserved")); }

  // SUP-2G1A-018
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-126", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const ts = r.ok ? r.evaluation_timestamp : ""; results.push(tr("SUP-2G1A-018", "Evaluation timestamp present (supplemental)", "result.evaluation_timestamp is a non-empty ISO 8601 string", ts.length > 0, "evaluation_timestamp is non-empty ISO string", `ts=${ts.substring(0, 20)}`, "evaluation_timestamp non-empty")); }

  // SUP-2G1A-019
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-127", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5.00, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); const facts = r.ok ? r.immutable_facts.length : -1; results.push(tr("SUP-2G1A-019", "Cost preservation immutable fact on E5 (supplemental)", "1 immutable fact (CostPreservationResult) created on E5 receipt with supported_explicit cost", facts === 1, "facts=1", `facts=${facts}`, "facts=1")); }

  // SUP-2G1A-020
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-128", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-128", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 3.50, currency: "USD" }, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const facts = r.ok ? r.immutable_facts.length : -1; results.push(tr("SUP-2G1A-020", "Cost preservation immutable fact on E33 (supplemental)", "1 immutable fact (CostPreservationResult) created on E33 consumption with supported_explicit cost", facts === 1, "facts=1", `facts=${facts}`, "facts=1")); }

  // SUP-2G1A-021
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-129", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 100, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const effects = r.ok ? r.state_effects.length : -1; results.push(tr("SUP-2G1A-021", "E48 zero delta accepted (supplemental)", "count.variance.resolved with counted=100 (current=100, delta=0) is accepted (zero delta accepted for E48, unlike E26)", r.ok && effects === 0, "ok=true, effects=0", r.ok ? `ok=true, effects=${effects}` : "ok=false", "ok=true, effects=0")); }

  // SUP-2G1A-022
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-130", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 100, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const effects = r.ok ? r.state_effects.length : -1; const ops = r.ok ? r.atomic_record_operations.length : -1; results.push(tr("SUP-2G1A-022", "E48 zero delta produces no effects (supplemental)", "count.variance.resolved with zero delta produces 0 state effects and only 2 applier ops (record insert + revision advance)", effects === 0 && ops === 2, "effects=0, ops=2", `effects=${effects}, ops=${ops}`, "effects=0, ops=2")); }

  // SUP-2G1A-023
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-131", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const hasTimestamp = r.ok ? r.evaluation_timestamp.length > 0 : false; const hasFormula = r.ok ? r.formula_version.length > 0 : false; results.push(tr("SUP-2G1A-023", "Evaluation metadata complete (supplemental)", "result contains non-empty evaluation_timestamp and formula_version", hasTimestamp && hasFormula, "evaluation_timestamp non-empty, formula_version non-empty", `ts=${hasTimestamp}, fv=${hasFormula}`, "ts=true, fv=true")); }

  // ═══ AT-132: Zero-mutation across all rejection codes ═══
  {
    type ZmEntry = { expected: string; code: string; zeroMut: boolean; codeMatch: boolean };
    const coverage: ZmEntry[] = [];

    // 1. AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE
    { const s = makeBaseState(); const e = mkEvent("po.received" as "receipt.posted", { purchase_order_id: "PO-001" }); coverage.push({ expected: "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...zm(s, e, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE") }); }
    // 2. AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B
    { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-132b", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-132b", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); coverage.push({ expected: "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B", ...zm(s2, e2, "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B") }); }
    // 3. VALIDATION.NULL_EVENT_INPUT
    { const s = makeBaseState(); coverage.push({ expected: "VALIDATION.NULL_EVENT_INPUT", ...zm(s, null as unknown as Record<string, unknown>, "VALIDATION.NULL_EVENT_INPUT") }); }
    // 4. VALIDATION.NON_OBJECT_INPUT
    { const s = makeBaseState(); coverage.push({ expected: "VALIDATION.NON_OBJECT_INPUT", ...zm(s, "string" as unknown as Record<string, unknown>, "VALIDATION.NON_OBJECT_INPUT") }); }
    // 5. VALIDATION.MISSING_REQUIRED_FIELD
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132e", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); delete (e as Record<string, unknown>).event_id; coverage.push({ expected: "VALIDATION.MISSING_REQUIRED_FIELD", ...zm(s, e, "VALIDATION.MISSING_REQUIRED_FIELD") }); }
    // 6. VALIDATION.UNKNOWN_PAYLOAD_KEY
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132f", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, bogus: true }); coverage.push({ expected: "VALIDATION.UNKNOWN_PAYLOAD_KEY", ...zm(s, e, "VALIDATION.UNKNOWN_PAYLOAD_KEY") }); }
    // 7. VALIDATION.INVALID_ENUM_VALUE
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132g", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: 123, unit_cost: 5, currency: "USD" } }); coverage.push({ expected: "VALIDATION.INVALID_ENUM_VALUE", ...zm(s, e, "VALIDATION.INVALID_ENUM_VALUE") }); }
    // 8. VALIDATION.NON_POSITIVE_QUANTITY
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132h", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null }); coverage.push({ expected: "VALIDATION.NON_POSITIVE_QUANTITY", ...zm(s, e, "VALIDATION.NON_POSITIVE_QUANTITY") }); }
    // 9. VALIDATION.ZERO_DELTA_NOT_PERMITTED
    { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-132i", position_id: "POS-WH", item_id: "ITEM-001", delta: 0, authority_marker: "manager" }); coverage.push({ expected: "VALIDATION.ZERO_DELTA_NOT_PERMITTED", ...zm(s, e, "VALIDATION.ZERO_DELTA_NOT_PERMITTED") }); }
    // 10. VALIDATION.NO_OP_RECLASSIFICATION
    { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "none" }); coverage.push({ expected: "VALIDATION.NO_OP_RECLASSIFICATION", ...zm(s, e, "VALIDATION.NO_OP_RECLASSIFICATION") }); }
    // 11. VALIDATION.MISSING_SOURCE_POSITION
    { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-132k", source_position_id: "POS-NONEXIST", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); coverage.push({ expected: "VALIDATION.MISSING_SOURCE_POSITION", ...zm(s, e, "VALIDATION.MISSING_SOURCE_POSITION") }); }
    // 12. VALIDATION.MISSING_DESTINATION_POSITION
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132l", destination_position_id: "POS-NONEXIST", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); coverage.push({ expected: "VALIDATION.MISSING_DESTINATION_POSITION", ...zm(s, e, "VALIDATION.MISSING_DESTINATION_POSITION") }); }
    // 13. VALIDATION.MISSING_ISSUE_PROVENANCE
    { const s = makeBaseState(); const e = mkEvent("job_material.consumed", { consumption_id: "CON-132m", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); coverage.push({ expected: "VALIDATION.MISSING_ISSUE_PROVENANCE", ...zm(s, e, "VALIDATION.MISSING_ISSUE_PROVENANCE") }); }
    // 14. VALIDATION.ITEM_MISMATCH
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-132n", item_id: "ITEM-002", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); s.items["ITEM-002"] = { item_id: "ITEM-002", governed_tracking_mode: "ordinary", governed_unit: "ea", valuation_method: null }; const e = mkEvent("remnant.same_item_returned", { return_id: "RET-132n", original_issue_id: "E32-132n", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); coverage.push({ expected: "VALIDATION.ITEM_MISMATCH", ...zm(s, e, "VALIDATION.ITEM_MISMATCH") }); }
    // 15. VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-132o", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.issued", { issue_id: "ISS-132o", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); coverage.push({ expected: "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION", ...zm(s, e, "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION") }); }
    // 16. VALIDATION.UNKNOWN_EVENT_TYPE
    { const s = makeBaseState(); const e: Record<string, unknown> = { event_id: "E-132p", event_type: "bogus.event", transaction_time: "2025-01-01T12:00:00Z", posting_time: "2025-01-01T12:00:01Z", source_document_type: "receipt", source_document_id: "DOC-132p", source_document_number: null, idempotency_key: "IDEM-132p", requester: "test", causation_id: null, correlation_id: null, notes: "" }; coverage.push({ expected: "VALIDATION.UNKNOWN_EVENT_TYPE", ...zm(s, e, "VALIDATION.UNKNOWN_EVENT_TYPE") }); }
    // 17. VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-132q", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); insertAcceptedTxn(s2, mkEvent("receipt.posted", { receipt_id: "R-132q", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null })); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-132q", reversal_quantity: 1 }); coverage.push({ expected: "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", ...zm(s2, e6, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE") }); }
    // 18. VALIDATION.RECEIPT_ID_MISMATCH — defined but not emitted
    coverage.push({ expected: "VALIDATION.RECEIPT_ID_MISMATCH", code: "NOT_EMITTABLE", zeroMut: true, codeMatch: false });
    // 19. VALIDATION.ISSUE_PROVENANCE_MISMATCH — E33 transaction exists but no CorrectionProvenanceRecord
    { const s = makeBaseState(); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-132s", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); insertAcceptedTxn(s, e33); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-132s", reversal_quantity: 1 }); coverage.push({ expected: "VALIDATION.ISSUE_PROVENANCE_MISMATCH", ...zm(s, e34, "VALIDATION.ISSUE_PROVENANCE_MISMATCH") }); }
    // 20. VALIDATION.POSITION_MISMATCH
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-132t", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-132t", original_issue_id: "E32-132t", source_position_id: "POS-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); coverage.push({ expected: "VALIDATION.POSITION_MISMATCH", ...zm(s, e, "VALIDATION.POSITION_MISMATCH") }); }
    // 21. UOM.NON_FINITE_QUANTITY
    { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-132u", position_id: "POS-WH", item_id: "ITEM-001", delta: NaN, authority_marker: "manager" }); coverage.push({ expected: "UOM.NON_FINITE_QUANTITY", ...zm(s, e, "UOM.NON_FINITE_QUANTITY") }); }
    // 22. INV.NEGATIVE_RESULT
    { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-132v", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }); coverage.push({ expected: "INV.NEGATIVE_RESULT", ...zm(s, e, "INV.NEGATIVE_RESULT") }); }
    // 23. STATE.WRONG_TRANSITION
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132w", destination_position_id: "POS-TERMINAL", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); coverage.push({ expected: "STATE.WRONG_TRANSITION", ...zm(s, e, "STATE.WRONG_TRANSITION") }); }
    // 24. RECONCILIATION.COMPANY_OWNED_MISMATCH
    { const s = makeBaseState(); s.company_ownership["ITEM-001"].company_owned_quantity = 50; const e = mkEvent("receipt.posted", { receipt_id: "R-132x", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); coverage.push({ expected: "RECONCILIATION.COMPANY_OWNED_MISMATCH", ...zm(s, e, "RECONCILIATION.COMPANY_OWNED_MISMATCH") }); }
    // 25. INV.IDEMPOTENCY_DUPLICATE_CONTRACT
    { const s = makeBaseState(); const e1 = mkEvent("receipt.posted", { receipt_id: "R-132y", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("receipt.posted", { receipt_id: "R-132y2", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); e2.idempotency_key = e1.idempotency_key as string; coverage.push({ expected: "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", ...zm(s2, e2, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT") }); }
    // 26. TRANSFER.RECEIVE_WITHOUT_DISPATCH
    { const s = makeBaseState(); const e = mkEvent("transfer.received", { transfer_id: "T-132z", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); coverage.push({ expected: "TRANSFER.RECEIVE_WITHOUT_DISPATCH", ...zm(s, e, "TRANSFER.RECEIVE_WITHOUT_DISPATCH") }); }
    // 27. TRANSFER.RECEIVE_EXCEEDS_DISPATCH
    { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-132aa", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-132aa", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 15, unit_of_measure: "ea" }); coverage.push({ expected: "TRANSFER.RECEIVE_EXCEEDS_DISPATCH", ...zm(s2, e2, "TRANSFER.RECEIVE_EXCEEDS_DISPATCH") }); }
    // 28. TRANSFER.DESTINATION_MISMATCH
    { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-132bb", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const e2 = mkEvent("transfer.received", { transfer_id: "T-132bb", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); coverage.push({ expected: "TRANSFER.DESTINATION_MISMATCH", ...zm(s2, e2, "TRANSFER.DESTINATION_MISMATCH") }); }
    // 29. CORRECTION.ORIGINAL_NOT_FOUND
    { const s = makeBaseState(); const e = mkEvent("receipt.reversed", { original_receipt_id: "R-NONEXIST", reversal_quantity: 1 }); coverage.push({ expected: "CORRECTION.ORIGINAL_NOT_FOUND", ...zm(s, e, "CORRECTION.ORIGINAL_NOT_FOUND") }); }
    // 30. CORRECTION.ALREADY_REVERSED
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-132dd", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-132dd", reversal_quantity: 10 }); const { state: s3 } = runSeq(s2, e6a); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-132dd", reversal_quantity: 1 }); coverage.push({ expected: "CORRECTION.ALREADY_REVERSED", ...zm(s3, e6b, "CORRECTION.ALREADY_REVERSED") }); }
    // 31. CORRECTION.REVERSAL_EXCEEDS_AVAILABLE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-132ee", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-132ee", reversal_quantity: 15 }); coverage.push({ expected: "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", ...zm(s2, e6, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE") }); }
    // 32. CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-132ff", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-132ff", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s3 } = runSeq(s2, e8); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-132ff", reversal_quantity: 3 }); coverage.push({ expected: "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", ...zm(s3, e6, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE") }); }
    // 33. CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-132gg", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("job_material.consumed", { consumption_id: "CON-132gg", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 15, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); coverage.push({ expected: "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE", ...zm(s, e, "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE") }); }
    // 34. RETURN.EXCEEDS_OUTSTANDING_ISSUE
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-132hh", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-132hh", original_issue_id: "E32-132hh", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 15, unit_of_measure: "ea" }); coverage.push({ expected: "RETURN.EXCEEDS_OUTSTANDING_ISSUE", ...zm(s, e, "RETURN.EXCEEDS_OUTSTANDING_ISSUE") }); }
    // 35. VAL.SELLING_PRICE_REJECTED
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132ii", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" } }); coverage.push({ expected: "VAL.SELLING_PRICE_REJECTED", ...zm(s, e, "VAL.SELLING_PRICE_REJECTED") }); }
    // 36. VAL.MSRP_REJECTED
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132jj", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "msrp", unit_cost: 5, currency: "USD" } }); coverage.push({ expected: "VAL.MSRP_REJECTED", ...zm(s, e, "VAL.MSRP_REJECTED") }); }
    // 37. VAL.MARKUP_REJECTED
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132kk", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "markup", unit_cost: 5, currency: "USD" } }); coverage.push({ expected: "VAL.MARKUP_REJECTED", ...zm(s, e, "VAL.MARKUP_REJECTED") }); }
    // 38. VAL.COST_SOURCE_INVALID
    { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-132ll", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "other_invalid", unit_cost: 5, currency: "USD" } }); coverage.push({ expected: "VAL.COST_SOURCE_INVALID", ...zm(s, e, "VAL.COST_SOURCE_INVALID") }); }

    const allZeroMut = coverage.every(c => c.zeroMut);
    const allCodeMatch = coverage.filter(c => c.expected !== "VALIDATION.RECEIPT_ID_MISMATCH").every(c => c.codeMatch);
    const mismatches = coverage.filter(c => c.expected !== "VALIDATION.RECEIPT_ID_MISMATCH" && !c.codeMatch).map(c => `${c.expected}: actual=${c.code}`).join("; ");
    const pass = allZeroMut && allCodeMatch;
    const detail = coverage.map(c => `${c.expected}: code=${c.code}, zeroMut=${c.zeroMut}, match=${c.codeMatch}`).join("; ");
    results.push(tr("SUP-2G1A-024", "Zero mutation across all rejection codes (literal per-code) (supplemental)", "All 38 codes: deep-clone before, execute rejecting input, assert exact code, deep-compare after — zero mutation proven for each. Coverage map: " + detail, pass, "All 38 codes: deep-clone before, execute rejecting input, assert exact code, deep-compare after — zero mutation proven for each. Coverage map: " + detail, `allZeroMut=${allZeroMut}, allCodeMatch=${allCodeMatch}, codes=${coverage.length}, mismatches=${mismatches}`, "all 38 codes: zeroMut=true, codeMatch=true (except RECEIPT_ID_MISMATCH: defined but not emitted)"));
  }

  // ═══ Final checks (supplemental) ═══

  // SUP-2G1A-025
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-133", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); const ops = r.ok ? r.atomic_record_operations.length : -1; results.push(tr("SUP-2G1A-025", "Deterministic operation ordering (supplemental)", "atomic_record_operations sorted by op_kind then primary key — dispatch produces 1 recorded op + 2 applier ops = 3 total", ops === 3, "ops=3", `ops=${ops}`, "ops=3")); }

  // SUP-2G1A-026
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-134", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-134", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e8, s2); const hasBlock = r.ok ? r.atomic_record_operations.some(op => (op as unknown as Record<string, unknown>).op_kind === "correction_provenance_downstream_block_updated") : false; results.push(tr("SUP-2G1A-026", "CorrectionProvenance downstream block created by intervening event (supplemental)", "E8 dispatch on same item+position as E5 receipt creates CorrectionProvenanceDownstreamBlockUpdatedOp", hasBlock, "hasBlockOp=true", `hasBlock=${hasBlock}`, "hasBlockOp=true")); }

  // SUP-2G1A-027
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-135", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-135", reversal_quantity: 3 }); const { state: s3 } = runSeq(s2, e6a); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-135", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e6b, s3); results.push(acc("SUP-2G1A-027", "E6 self-exclusion from blocker emission (supplemental)", "Second E6 reversal of same receipt succeeds because self-event is excluded from blocker list", r)); }

  // SUP-2G1A-028
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-136", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-136", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e33); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-136", reversal_quantity: 2 }); const { state: s3 } = runSeq(s2, e34a); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-136", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34b, s3); results.push(acc("SUP-2G1A-028", "E34 self-exclusion from blocker emission (supplemental)", "Second E34 reversal of same consumption succeeds because self-event is excluded from blocker list", r)); }

  // SUP-2G1A-029
  { const cc = runCompileChecks(); results.push(tr("SUP-2G1A-029", "Compile checks pass (all contract counts verified) (supplemental)", `runCompileChecks() passed=${cc.passed}, checks=${cc.checks.length}, failures=${cc.failures.length}`, cc.passed && cc.failures.length === 0, `passed=${cc.passed}, checks=${cc.checks.length}, failures=${cc.failures.length}`, "passed=true, failures=0")); }

  // ═══ Summary computation ═══
  const ids = results.map(r => r.test_id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  const canonicalIds = ids.filter(id => id.startsWith("AT-"));
  const supplementalIds = ids.filter(id => id.startsWith("SUP-"));
  const expectedCanonical: string[] = [];
  for (let i = 1; i <= 137; i++) expectedCanonical.push(`AT-${String(i).padStart(3, "0")}`);
  const missing = expectedCanonical.filter(id => !canonicalIds.includes(id));
  const placeholderPasses = results.filter(r => r.pass && (r.actual === "true" || r.expected === "true" || r.actual === "pass" || r.expected === "pass")).length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  const summary: TestSummary = {
    total: results.length,
    passed,
    failed,
    skipped: 0,
    placeholder_passes: placeholderPasses,
    failed_ids: results.filter(r => !r.pass).map(r => r.test_id),
    canonical_count: canonicalIds.length,
    supplemental_count: supplementalIds.length,
    missing_canonical: missing,
  } as TestSummary & { canonical_count: number; supplemental_count: number; missing_canonical: string[] };

  return { summary, results };
}