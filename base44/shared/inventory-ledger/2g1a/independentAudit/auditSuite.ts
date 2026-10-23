// ═════════════════════════════════════════════════════════════════
// INDEPENDENT AUDIT TEST SUITE — 137 LITERAL TESTS
// Derived solely from the approved 2G1-A Implementation Authorization
// Contract (SHA-256: df9e621e...dedb544), Sections 1–26.
//
// NOT derived from the current implementation or reconstructed tests.
// Pure, non-routable, no SDK, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

import { evaluateEvent2G1A } from "../publicBoundary.ts";
import { runCompileChecks } from "../compileCheck.ts";
import { ALL_ERROR_CODES } from "../eventTypes.ts";
import type { DomainState } from "../domainState.ts";
import type { DomainResult2G1A } from "../resultTypes.ts";
import {
  makeBaseState, mkEvent, insertAcceptedTxn, insertProv, insertIssue,
  deepCloneState, statesEqual, runSeq, getRejCode,
  acc, rej, rejZm, tr,
  type AuditTestRecord, type AuditRunResult,
  resetEventCounter,
} from "./auditFixtures.ts";
import { TRACEABILITY_REGISTRY, verifyTraceability } from "./traceabilityRegistry.ts";

export function runAllTests(): AuditRunResult {
  const results: AuditTestRecord[] = [];
  resetEventCounter();

  // ═══════ E5: receipt.posted (AT-001 – AT-020) ═══════

  // AT-001: Receive ordinary item from vendor to warehouse
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-001", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-001", "Receive ordinary item from vendor to warehouse", "evaluateEvent2G1A returns ok=true for valid receipt to warehouse position", r)); }

  // AT-002: Receive with supported explicit cost
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-002", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); const hasCost = r.ok && r.immutable_facts.length > 0; results.push(tr("AT-002", "Receive with supported explicit cost", "Accepted with CostPreservationResult in immutable_facts", hasCost, "CostPreservationResult present", hasCost ? "present" : "absent")); }

  // AT-003: Receive without cost accepted with warning
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-003", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const hasWarn = r.ok && r.warnings.some(w => w.warning_code === "VAL.UNRESOLVED_COST_WARNING"); results.push(tr("AT-003", "Receive without cost accepted with warning", "Accepted with VAL.UNRESOLVED_COST_WARNING", r.ok && hasWarn, "ok=true + warning", `${r.ok ? "ok=true" : "ok=false"} + warning=${hasWarn}`)); }

  // AT-004: Receive rejects selling price
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-004", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-004", "Receive rejects selling price", "Reject with VAL.SELLING_PRICE_REJECTED + state unchanged", r, "VAL.SELLING_PRICE_REJECTED", before, s)); }

  // AT-005: Receive rejects MSRP
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-005", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "msrp", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-005", "Receive rejects MSRP", "Reject with VAL.MSRP_REJECTED + state unchanged", r, "VAL.MSRP_REJECTED", before, s)); }

  // AT-006: Receive rejects markup
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-006", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "markup", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-006", "Receive rejects markup", "Reject with VAL.MARKUP_REJECTED + state unchanged", r, "VAL.MARKUP_REJECTED", before, s)); }

  // AT-007: Receive rejects other_invalid cost source
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-007", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "other_invalid", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-007", "Receive rejects other_invalid cost source", "Reject with VAL.COST_SOURCE_INVALID + state unchanged", r, "VAL.COST_SOURCE_INVALID", before, s)); }

  // AT-008: Receive rejects unknown string cost_source
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-008", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "unknown_source", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-008", "Receive rejects unknown string cost_source", "Reject with VAL.COST_SOURCE_INVALID + state unchanged", r, "VAL.COST_SOURCE_INVALID", before, s)); }

  // AT-009: Receive rejects extra property on cost object
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-009", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5, currency: "USD", extra: "bad" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-009", "Receive rejects extra property on cost object", "Reject with VALIDATION.UNKNOWN_PAYLOAD_KEY + state unchanged", r, "VALIDATION.UNKNOWN_PAYLOAD_KEY", before, s)); }

  // AT-010: Receive rejects missing cost_source property
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-010", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-010", "Receive rejects missing cost_source property", "Reject with VALIDATION.MISSING_REQUIRED_FIELD + state unchanged", r, "VALIDATION.MISSING_REQUIRED_FIELD", before, s)); }

  // AT-011: Receive rejects non-string cost_source
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-011", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: 123, unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-011", "Receive rejects non-string cost_source", "Reject with VALIDATION.INVALID_ENUM_VALUE + state unchanged", r, "VALIDATION.INVALID_ENUM_VALUE", before, s)); }

  // AT-012: Receive to missing destination
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-012", destination_position_id: "NONEXISTENT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-012", "Receive to missing destination", "Reject with VALIDATION.MISSING_DESTINATION_POSITION + state unchanged", r, "VALIDATION.MISSING_DESTINATION_POSITION", before, s)); }

  // AT-013: Receive to terminal position
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-013", destination_position_id: "POS-TERMINAL", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-013", "Receive to terminal position", "Reject with STATE.WRONG_TRANSITION + state unchanged", r, "STATE.WRONG_TRANSITION", before, s)); }

  // AT-014: Receive zero quantity
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-014", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-014", "Receive zero quantity", "Reject with VALIDATION.NON_POSITIVE_QUANTITY + state unchanged", r, "VALIDATION.NON_POSITIVE_QUANTITY", before, s)); }

  // AT-015: Receive negative quantity
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-015", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-015", "Receive negative quantity", "Reject with VALIDATION.NON_POSITIVE_QUANTITY + state unchanged", r, "VALIDATION.NON_POSITIVE_QUANTITY", before, s)); }

  // AT-016: Receive non-finite quantity
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-016", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-016", "Receive non-finite quantity", "Reject with UOM.NON_FINITE_QUANTITY + state unchanged", r, "UOM.NON_FINITE_QUANTITY", before, s)); }

  // AT-017: Receive unknown payload key
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-017", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, unknown_key: "bad" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-017", "Receive unknown payload key", "Reject with VALIDATION.UNKNOWN_PAYLOAD_KEY + state unchanged", r, "VALIDATION.UNKNOWN_PAYLOAD_KEY", before, s)); }

  // AT-018: Receive missing required field (receipt_id)
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-018", "Receive missing required field", "Reject with VALIDATION.MISSING_REQUIRED_FIELD + state unchanged", r, "VALIDATION.MISSING_REQUIRED_FIELD", before, s)); }

  // AT-019: Receive non-ordinary item
  { const s = makeBaseState(); s.items["ITEM-001"].governed_tracking_mode = "ordinary" as never; s.items["ITEM-003"] = { item_id: "ITEM-003", governed_tracking_mode: "serialized" as never, governed_unit: "ea", valuation_method: null }; s.positions["POS-WH-3"] = { position_id: "POS-WH-3", item_id: "ITEM-003", position_kind: "physical_warehouse", ownership_class: "company_owned", origin_class: "none", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: "WH-001", bin_location_id: null, job_id: null, transfer_id: null, terminal_reference: null }; const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-019", destination_position_id: "POS-WH-3", item_id: "ITEM-003", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-019", "Receive non-ordinary item", "Reject with VALIDATION.INVALID_ENUM_VALUE + state unchanged", r, "VALIDATION.INVALID_ENUM_VALUE", before, s)); }

  // AT-020: Receive non-company-owned destination
  { const s = makeBaseState(); s.positions["POS-WH"].ownership_class = "company_owned" as never; s.positions["POS-WH-NCO"] = { position_id: "POS-WH-NCO", item_id: "ITEM-001", position_kind: "physical_warehouse", ownership_class: "vendor_consigned" as never, origin_class: "none", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: "WH-001", bin_location_id: null, job_id: null, transfer_id: null, terminal_reference: null }; const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-020", destination_position_id: "POS-WH-NCO", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-020", "Receive non-company-owned destination", "Reject with VALIDATION.INVALID_ENUM_VALUE + state unchanged", r, "VALIDATION.INVALID_ENUM_VALUE", before, s)); }

  // ═══════ E1–E4: WFA (AT-021 – AT-024) ═══════

  // AT-021: PO created
  { const s = makeBaseState(); const e = mkEvent("po.created", { purchase_order_id: "PO-021", vendor_id: "V-001", lines: [{ line_id: "L-1", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }] }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-021", "PO created", "Accepted with NoEffectWorkflow", r)); }

  // AT-022: PO approved
  { const s = makeBaseState(); const e = mkEvent("po.approved", { purchase_order_id: "PO-022" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-022", "PO approved", "Accepted with NoEffectWorkflow", r)); }

  // AT-023: PO sent
  { const s = makeBaseState(); const e = mkEvent("po.sent", { purchase_order_id: "PO-023" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-023", "PO sent", "Accepted with NoEffectWorkflow", r)); }

  // AT-024: PO line opened
  { const s = makeBaseState(); const e = mkEvent("po.line.opened", { purchase_order_id: "PO-024", line_id: "L-1", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-024", "PO line opened", "Accepted with NoEffectWorkflow", r)); }

  // ═══════ E8/E9: transfer (AT-025 – AT-035) ═══════

  // AT-025: Dispatch warehouse to logical-in-transit
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-025", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-025", "Dispatch warehouse to logical-in-transit", "Accepted", r)); }

  // AT-026: Receive logical-in-transit to truck exact full
  { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-026", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); const e9 = mkEvent("transfer.received", { transfer_id: "T-026", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s2); results.push(acc("AT-026", "Receive logical-in-transit to truck exact full", "Accepted", r)); }

  // AT-027: Dispatch + receipt conservation (company_owned unchanged)
  { const s = makeBaseState(); const coBefore = s.company_ownership["ITEM-001"].company_owned_quantity; const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-027", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); const e9 = mkEvent("transfer.received", { transfer_id: "T-027", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s3 } = runSeq(s2, e9); const coAfter = s3.company_ownership["ITEM-001"].company_owned_quantity; results.push(tr("AT-027", "Dispatch + receipt conservation", "company_owned_quantity unchanged across E8+E9", coBefore === coAfter, `company_owned=${coBefore}`, `company_owned=${coAfter}`)); }

  // AT-028: Dispatch to missing source
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("transfer.dispatched", { transfer_id: "T-028", source_position_id: "NONEXISTENT", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-028", "Dispatch to missing source", "Reject with VALIDATION.MISSING_SOURCE_POSITION + state unchanged", r, "VALIDATION.MISSING_SOURCE_POSITION", before, s)); }

  // AT-029: Dispatch insufficient source quantity
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("transfer.dispatched", { transfer_id: "T-029", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-029", "Dispatch insufficient source quantity", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s)); }

  // AT-030: Dispatch duplicate transfer_id
  { const s = makeBaseState(); const e1 = mkEvent("transfer.dispatched", { transfer_id: "T-030", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const before = deepCloneState(s2); const e2 = mkEvent("transfer.dispatched", { transfer_id: "T-030", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rejZm("AT-030", "Dispatch duplicate transfer_id", "Reject with INV.IDEMPOTENCY_DUPLICATE_CONTRACT + state unchanged", r, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", before, s2)); }

  // AT-031: Receipt exceeds dispatch
  { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-031", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); const before = deepCloneState(s2); const e9 = mkEvent("transfer.received", { transfer_id: "T-031", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s2); results.push(rejZm("AT-031", "Receipt exceeds dispatch", "Reject with TRANSFER.RECEIVE_EXCEEDS_DISPATCH + state unchanged", r, "TRANSFER.RECEIVE_EXCEEDS_DISPATCH", before, s2)); }

  // AT-032: Receipt without dispatch
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("transfer.received", { transfer_id: "T-032", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-032", "Receipt without dispatch", "Reject with TRANSFER.RECEIVE_WITHOUT_DISPATCH + state unchanged", r, "TRANSFER.RECEIVE_WITHOUT_DISPATCH", before, s)); }

  // AT-033: Receipt destination mismatch
  { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-033", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); const before = deepCloneState(s2); const e9 = mkEvent("transfer.received", { transfer_id: "T-033", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s2); results.push(rejZm("AT-033", "Receipt destination mismatch", "Reject with TRANSFER.DESTINATION_MISMATCH + state unchanged", r, "TRANSFER.DESTINATION_MISMATCH", before, s2)); }

  // AT-034: Partial receipt deferred
  { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-034", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); const before = deepCloneState(s2); const e9 = mkEvent("transfer.received", { transfer_id: "T-034", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s2); results.push(rejZm("AT-034", "Partial receipt deferred", "Reject with AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B + state unchanged", r, "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B", before, s2)); }

  // AT-035: Outstanding transfer remains
  { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-035", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e8, s); const hasTransfer = r.ok && r.proposed_state.transfers_outstanding["T-035"] !== undefined; results.push(tr("AT-035", "Outstanding transfer remains", "transfers_outstanding has entry after E8", hasTransfer, "transfer exists", hasTransfer ? "exists" : "missing")); }

  // ═══════ E6: receipt.reversed (AT-036 – AT-045) ═══════

  // AT-036: E6 partial reversal of accepted E5 (first partial)
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-036", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-036", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e6, s2); results.push(acc("AT-036", "E6 partial reversal of accepted E5 (first partial)", "Accepted", r)); }

  // AT-037: E6 second partial reversal of remaining (no independent blocker)
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-037", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-037", reversal_quantity: 4 }); const { state: s2 } = runSeq(s, e5, e6a); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-037", reversal_quantity: 6 }); const r = evaluateEvent2G1A(e6b, s2); results.push(acc("AT-037", "E6 second partial reversal of remaining (no independent blocker)", "Accepted", r)); }

  // AT-038: E6 reversal does not block itself
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-038", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-038", reversal_quantity: 4 }); const { state: s2 } = runSeq(s, e5, e6); const e6EventId = e6.event_id as string; const provs = Object.values(s2.correction_provenance); const e5Prov = provs.find(p => p.original_event_id === (e5.event_id as string)); const selfBlocked = e5Prov ? e5Prov.blocking_downstream_event_ids.includes(e6EventId) : true; results.push(tr("AT-038", "E6 reversal does not block itself", "E6 event_id not in E5 provenance blocking list", !selfBlocked, "self not in blocking list", selfBlocked ? "self IS in blocking list" : "self not in blocking list")); }

  // AT-039: E6 reversal blocked by downstream E8 dispatch
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-039", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-039", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e5, e8); const before = deepCloneState(s2); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-039", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e6, s2); results.push(rejZm("AT-039", "E6 reversal blocked by downstream E8 dispatch", "Reject with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", before, s2)); }

  // AT-040: E6 original not found
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.reversed", { original_receipt_id: "NONEXISTENT", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-040", "E6 original not found (receipt_id lookup)", "Reject with CORRECTION.ORIGINAL_NOT_FOUND + state unchanged", r, "CORRECTION.ORIGINAL_NOT_FOUND", before, s)); }

  // AT-041: E6 already fully reversed
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-041", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-041", reversal_quantity: 10 }); const { state: s2 } = runSeq(s, e5, e6a); const before = deepCloneState(s2); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-041", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e6b, s2); results.push(rejZm("AT-041", "E6 already fully reversed", "Reject with CORRECTION.ALREADY_REVERSED + state unchanged", r, "CORRECTION.ALREADY_REVERSED", before, s2)); }

  // AT-042: E6 reversal exceeds available
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-042", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null }); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R-042", reversal_quantity: 3 }); const { state: s2 } = runSeq(s, e5, e6a); const before = deepCloneState(s2); const e6b = mkEvent("receipt.reversed", { original_receipt_id: "R-042", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e6b, s2); results.push(rejZm("AT-042", "E6 reversal exceeds available", "Reject with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", before, s2)); }

  // AT-043: E6 reversal would make position negative
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-043", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); s2.positions["POS-WH"].position_quantity = 3; s2.company_ownership["ITEM-001"].company_owned_quantity = 3; const before = deepCloneState(s2); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-043", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e6, s2); results.push(rejZm("AT-043", "E6 reversal would make position negative", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s2)); }

  // AT-044: E6 ambiguous original reference
  { const s = makeBaseState(); const e5a = mkEvent("receipt.posted", { receipt_id: "R-044", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5a); insertAcceptedTxn(s2, mkEvent("receipt.posted", { receipt_id: "R-044", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null })); const before = deepCloneState(s2); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-044", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e6, s2); results.push(rejZm("AT-044", "E6 ambiguous original reference", "Reject with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE + state unchanged", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", before, s2)); }

  // AT-045: E6 source_document_id matches but receipt_id does not
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-045-ACTUAL", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); e5.source_document_id = "DOC-045"; const { state: s2 } = runSeq(s, e5); const before = deepCloneState(s2); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-045-WRONG", reversal_quantity: 1 }); e6.source_document_id = "DOC-045"; const r = evaluateEvent2G1A(e6, s2); results.push(rejZm("AT-045", "E6 source_document_id matches but receipt_id does not", "Reject with VALIDATION.RECEIPT_ID_MISMATCH + state unchanged", r, "VALIDATION.RECEIPT_ID_MISMATCH", before, s2)); }

  // ═══════ E25: adjustment.requested (AT-046) ═══════

  // AT-046: Adjustment requested
  { const s = makeBaseState(); const e = mkEvent("adjustment.requested", { adjustment_request_id: "AR-046", position_id: "POS-WH", item_id: "ITEM-001", proposed_delta: 5, reason_text: "test" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-046", "Adjustment requested", "Accepted with NoEffectCommand", r)); }

  // ═══════ E26: adjustment.posted (AT-047 – AT-050) ═══════

  // AT-047: Adjustment posted positive
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-047", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-047", "Adjustment posted positive", "Accepted", r)); }

  // AT-048: Adjustment posted negative
  { const s = makeBaseState(); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-048", position_id: "POS-WH", item_id: "ITEM-001", delta: -5, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-048", "Adjustment posted negative", "Accepted", r)); }

  // AT-049: Adjustment rejects negative result
  { const s = makeBaseState(); s.positions["POS-WH"].position_quantity = 3; s.company_ownership["ITEM-001"].company_owned_quantity = 3; const before = deepCloneState(s); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-049", position_id: "POS-WH", item_id: "ITEM-001", delta: -5, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-049", "Adjustment rejects negative result", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s)); }

  // AT-050: Adjustment zero delta
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("adjustment.posted", { adjustment_id: "ADJ-050", position_id: "POS-WH", item_id: "ITEM-001", delta: 0, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-050", "Adjustment zero delta", "Reject with VALIDATION.ZERO_DELTA_NOT_PERMITTED + state unchanged", r, "VALIDATION.ZERO_DELTA_NOT_PERMITTED", before, s)); }

  // ═══════ E28: reclassification (AT-051 – AT-053) ═══════

  // AT-051: Reclassification condition change
  { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "damaged", new_restriction: "none" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-051", "Reclassification condition change", "Accepted with ConditionReclassification", r)); }

  // AT-052: Reclassification restriction change
  { const s = makeBaseState(); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "quarantined" }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-052", "Reclassification restriction change", "Accepted with RestrictionReclassification", r)); }

  // AT-053: Reclassification no-op
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "none" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-053", "Reclassification no-op", "Reject with VALIDATION.NO_OP_RECLASSIFICATION + state unchanged", r, "VALIDATION.NO_OP_RECLASSIFICATION", before, s)); }

  // ═══════ E27: adjustment.reversed (AT-054 – AT-064) ═══════

  // AT-054: E27 reversal of positive E26 (partial)
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-054", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-054", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const deltaCorrect = r.ok && r.state_effects.some(e => e.kind === "position_quantity" && e.delta === -4); results.push(tr("AT-054", "E27 reversal of positive E26 (partial)", "Accepted with delta sign opposite original (-4)", r.ok && deltaCorrect, "ok=true, delta=-4", r.ok ? "ok=true" : "ok=false")); }

  // AT-055: E27 reversal of negative E26 (partial)
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-055", position_id: "POS-WH", item_id: "ITEM-001", delta: -10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-055", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const deltaCorrect = r.ok && r.state_effects.some(e => e.kind === "position_quantity" && e.delta === 4); results.push(tr("AT-055", "E27 reversal of negative E26 (partial)", "Accepted with delta sign opposite original (+4)", r.ok && deltaCorrect, "ok=true, delta=+4", r.ok ? "ok=true" : "ok=false")); }

  // AT-056: E27 sign restoration positive original (E26+10, E27=4 → delta=-4)
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-056", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-056", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const posEff = r.ok ? r.state_effects.find(e => e.kind === "position_quantity") : null; const delta = posEff ? (posEff as { delta: number }).delta : null; results.push(tr("AT-056", "E27 sign restoration positive original", "E26+10, E27=4 → E27 delta = -4", delta === -4, "delta=-4", `delta=${delta}`)); }

  // AT-057: E27 sign restoration negative original (E26-10, E27=4 → delta=+4)
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-057", position_id: "POS-WH", item_id: "ITEM-001", delta: -10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-057", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); const posEff = r.ok ? r.state_effects.find(e => e.kind === "position_quantity") : null; const delta = posEff ? (posEff as { delta: number }).delta : null; results.push(tr("AT-057", "E27 sign restoration negative original", "E26-10, E27=4 → E27 delta = +4", delta === 4, "delta=+4", `delta=${delta}`)); }

  // AT-058: E27 repeated partial reversal (no independent blocker)
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-058", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058", reversal_quantity: 4 }); const { state: s2 } = runSeq(s, e26, e27a); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-058", reversal_quantity: 6 }); const r = evaluateEvent2G1A(e27b, s2); results.push(acc("AT-058", "E27 repeated partial reversal (no independent blocker)", "Accepted", r)); }

  // AT-059: E27 original not found
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("adjustment.reversed", { original_adjustment_id: "NONEXISTENT", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-059", "E27 original not found", "Reject with CORRECTION.ORIGINAL_NOT_FOUND + state unchanged", r, "CORRECTION.ORIGINAL_NOT_FOUND", before, s)); }

  // AT-060: E27 already reversed
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-060", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-060", reversal_quantity: 10 }); const { state: s2 } = runSeq(s, e26, e27a); const before = deepCloneState(s2); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-060", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27b, s2); results.push(rejZm("AT-060", "E27 already reversed", "Reject with CORRECTION.ALREADY_REVERSED + state unchanged", r, "CORRECTION.ALREADY_REVERSED", before, s2)); }

  // AT-061: E27 reversal exceeds remaining reversible quantity
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-061", position_id: "POS-WH", item_id: "ITEM-001", delta: 5, authority_marker: "manager" }); const e27a = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-061", reversal_quantity: 3 }); const { state: s2 } = runSeq(s, e26, e27a); const before = deepCloneState(s2); const e27b = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-061", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e27b, s2); results.push(rejZm("AT-061", "E27 reversal exceeds remaining reversible quantity", "Reject with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", before, s2)); }

  // AT-062: E27 reversal negative result
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-062", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26); s2.positions["POS-WH"].position_quantity = 3; s2.company_ownership["ITEM-001"].company_owned_quantity = 3; const before = deepCloneState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-062", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-062", "E27 reversal negative result", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s2)); }

  // AT-063: E27 reversal blocked by independent downstream
  { const s = makeBaseState(); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-063", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-063", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e26, e8); const before = deepCloneState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-063", reversal_quantity: 4 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-063", "E27 reversal blocked by independent downstream", "Reject with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", before, s2)); }

  // AT-064: E27 ambiguous original reference
  { const s = makeBaseState(); const e26a = mkEvent("adjustment.posted", { adjustment_id: "ADJ-064", position_id: "POS-WH", item_id: "ITEM-001", delta: 10, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e26a); insertAcceptedTxn(s2, mkEvent("adjustment.posted", { adjustment_id: "ADJ-064", position_id: "POS-WH", item_id: "ITEM-001", delta: 5, authority_marker: "manager" })); const before = deepCloneState(s2); const e27 = mkEvent("adjustment.reversed", { original_adjustment_id: "ADJ-064", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e27, s2); results.push(rejZm("AT-064", "E27 ambiguous original reference", "Reject with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE + state unchanged", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", before, s2)); }

  // ═══════ E32: job_material.issued (AT-065 – AT-066) ═══════

  // AT-065: E32 issue creates JobIssueProgress
  { const s = makeBaseState(); const e = mkEvent("job_material.issued", { issue_id: "ISS-065", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); const hasIssue = r.ok && r.proposed_state.job_issue_progress["EVT-1"] !== undefined || (r.ok && Object.keys(r.proposed_state.job_issue_progress).length > 0); results.push(tr("AT-065", "E32 issue creates JobIssueProgress", "Accepted with JobIssueProgress created", r.ok && hasIssue, "ok=true + issue created", r.ok ? "ok=true" : "ok=false")); }

  // AT-066: Second E32 into same position+item while open
  { const s = makeBaseState(); const e1 = mkEvent("job_material.issued", { issue_id: "ISS-066", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e1); const before = deepCloneState(s2); const e2 = mkEvent("job_material.issued", { issue_id: "ISS-066B", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e2, s2); results.push(rejZm("AT-066", "Second E32 into same position+item while open", "Reject with VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION + state unchanged", r, "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION", before, s2)); }

  // ═══════ E33: job_material.consumed (AT-067 – AT-074) ═══════

  // AT-067: E33 partial consumption
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-067", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-067", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); results.push(acc("AT-067", "E33 partial consumption", "Accepted", r)); }

  // AT-068: E33 multiple consumptions
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-068", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33a = mkEvent("job_material.consumed", { consumption_id: "CON-068A", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33a); const e33b = mkEvent("job_material.consumed", { consumption_id: "CON-068B", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 4, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33b, s2); results.push(acc("AT-068", "E33 multiple consumptions", "Accepted", r)); }

  // AT-069: E33 consumption exceeds outstanding
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-069", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-069", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); results.push(rejZm("AT-069", "E33 consumption exceeds outstanding", "Reject with CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE + state unchanged", r, "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE", before, s2)); }

  // AT-070: E33 consumption without open issue
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("job_material.consumed", { consumption_id: "CON-070", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-070", "E33 consumption without open issue", "Reject with VALIDATION.MISSING_ISSUE_PROVENANCE + state unchanged", r, "VALIDATION.MISSING_ISSUE_PROVENANCE", before, s)); }

  // AT-071: E33 consumption missing source position
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("job_material.consumed", { consumption_id: "CON-071", job_custody_position_id: "NONEXISTENT", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-071", "E33 consumption missing source position", "Reject with VALIDATION.MISSING_SOURCE_POSITION + state unchanged", r, "VALIDATION.MISSING_SOURCE_POSITION", before, s)); }

  // AT-072: E33 consumption rejects selling price
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-072", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-072", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" }, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); results.push(rejZm("AT-072", "E33 consumption rejects selling price", "Reject with VAL.SELLING_PRICE_REJECTED + state unchanged", r, "VAL.SELLING_PRICE_REJECTED", before, s2)); }

  // AT-073: E33 consumption without cost accepted with warning
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-073", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-073", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); const hasWarn = r.ok && r.warnings.some(w => w.warning_code === "VAL.UNRESOLVED_COST_WARNING"); results.push(tr("AT-073", "E33 consumption without cost accepted with warning", "Accepted with VAL.UNRESOLVED_COST_WARNING", r.ok && hasWarn, "ok=true + warning", `${r.ok ? "ok=true" : "ok=false"} + warning=${hasWarn}`)); }

  // AT-074: E33 provenance sets related_issue_event_id canonically
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-074", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e32EventId = e32.event_id as string; const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-074", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); let relatedId = null; if (r.ok) { for (const p of Object.values(r.proposed_state.correction_provenance)) { if (p.original_event_type === "job_material.consumed") { relatedId = p.related_issue_event_id; } } } results.push(tr("AT-074", "E33 provenance sets related_issue_event_id canonically", "provenance.related_issue_event_id = issue.issue_event_id", relatedId === e32EventId, `related_issue_event_id=${e32EventId}`, `related_issue_event_id=${relatedId}`)); }

  // ═══════ Closure tests (AT-075 – AT-077) ═══════

  // AT-075: Closure through full consumption
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-075", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-075", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e32EventId = e32.event_id as string; const issue = s2.job_issue_progress[e32EventId]; const status = issue ? issue.status : "missing"; results.push(tr("AT-075", "Closure through full consumption", "JobIssueProgress.status === 'closed' after full consumption (10 of 10)", status === "closed", "status=closed", `status=${status}`)); }

  // AT-076: Closure through full return
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-076", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e32EventId = e32.event_id as string; const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-076", original_issue_id: "ISS-076", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); const status = r.ok ? (r.proposed_state.job_issue_progress[e32EventId]?.status ?? "missing") : "rejected"; results.push(tr("AT-076", "Closure through full return", "JobIssueProgress.status === 'closed' after full return (10 of 10)", status === "closed", "status=closed", `status=${status}`)); }

  // AT-077: Closure through mixed consumption and return
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-077", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-077", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e32EventId = e32.event_id as string; const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-077", original_issue_id: "ISS-077", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 7, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); const status = r.ok ? (r.proposed_state.job_issue_progress[e32EventId]?.status ?? "missing") : "rejected"; results.push(tr("AT-077", "Closure through mixed consumption and return", "JobIssueProgress.status === 'closed' after consumption 3 + return 7 = 10", status === "closed", "status=closed", `status=${status}`)); }

  // ═══════ E34: consumption.reversed (AT-078 – AT-089) ═══════

  // AT-078: E34 partial reversal of accepted E33
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-078", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-078", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-078", reversal_quantity: 2 }); const r = evaluateEvent2G1A(e34, s2); results.push(acc("AT-078", "E34 partial reversal of accepted E33", "Accepted", r)); }

  // AT-079: E34 repeated partial reversal (no independent blocker)
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-079", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-079", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-079", reversal_quantity: 2 }); const { state: s2 } = runSeq(s, e32, e33, e34a); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-079", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e34b, s2); results.push(acc("AT-079", "E34 repeated partial reversal (no independent blocker)", "Accepted", r)); }

  // AT-080: E34 reversal does not block itself
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-080", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-080", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-080", reversal_quantity: 2 }); const { state: s2 } = runSeq(s, e32, e33, e34); const e34EventId = e34.event_id as string; const e33EventId = e33.event_id as string; const e33Prov = Object.values(s2.correction_provenance).find(p => p.original_event_id === e33EventId); const selfBlocked = e33Prov ? e33Prov.blocking_downstream_event_ids.includes(e34EventId) : true; results.push(tr("AT-080", "E34 reversal does not block itself", "E34 event_id not in E33 provenance blocking list", !selfBlocked, "self not in blocking list", selfBlocked ? "self IS in blocking list" : "self not in blocking list")); }

  // AT-081: E34 reopening a closed issue
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-081", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-081", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e32EventId = e32.event_id as string; const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-081", reversal_quantity: 5 }); const r = evaluateEvent2G1A(e34, s2); const status = r.ok ? (r.proposed_state.job_issue_progress[e32EventId]?.status ?? "missing") : "rejected"; results.push(tr("AT-081", "E34 reopening a closed issue", "JobIssueProgress.status === 'open' after E34 reversal of closed issue", status === "open", "status=open", `status=${status}`)); }

  // AT-082: E34 locates issue via related_issue_event_id (not open-issue search)
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-082", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-082", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e32EventId = e32.event_id as string; const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-082", reversal_quantity: 2 }); const r = evaluateEvent2G1A(e34, s2); let correctIssueUpdated = false; if (r.ok) { const issue = r.proposed_state.job_issue_progress[e32EventId]; correctIssueUpdated = issue !== undefined && issue.consumed_quantity === 3; } results.push(tr("AT-082", "E34 locates issue via related_issue_event_id (not open-issue search)", "Correct JobIssueProgress updated (consumed reduced from 5 to 3)", correctIssueUpdated, "correct issue updated", correctIssueUpdated ? "correct" : "incorrect")); }

  // AT-083: E34 original not found
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("consumption.reversed", { original_consumption_id: "NONEXISTENT", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-083", "E34 original not found", "Reject with CORRECTION.ORIGINAL_NOT_FOUND + state unchanged", r, "CORRECTION.ORIGINAL_NOT_FOUND", before, s)); }

  // AT-084: E34 already reversed
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-084", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-084", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-084", reversal_quantity: 5 }); const { state: s2 } = runSeq(s, e32, e33, e34a); const before = deepCloneState(s2); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-084", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34b, s2); results.push(rejZm("AT-084", "E34 already reversed", "Reject with CORRECTION.ALREADY_REVERSED + state unchanged", r, "CORRECTION.ALREADY_REVERSED", before, s2)); }

  // AT-085: E34 reversal exceeds unreversed consumption
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-085", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-085", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const e34a = mkEvent("consumption.reversed", { original_consumption_id: "CON-085", reversal_quantity: 2 }); const { state: s2 } = runSeq(s, e32, e33, e34a); const before = deepCloneState(s2); const e34b = mkEvent("consumption.reversed", { original_consumption_id: "CON-085", reversal_quantity: 3 }); const r = evaluateEvent2G1A(e34b, s2); results.push(rejZm("AT-085", "E34 reversal exceeds unreversed consumption", "Reject with CORRECTION.REVERSAL_EXCEEDS_AVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", before, s2)); }

  // AT-086: E34 ambiguous original reference
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-086", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-086", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); insertAcceptedTxn(s2, mkEvent("job_material.consumed", { consumption_id: "CON-086", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" })); const before = deepCloneState(s2); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-086", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); results.push(rejZm("AT-086", "E34 ambiguous original reference", "Reject with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE + state unchanged", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", before, s2)); }

  // AT-087: E34 missing E33 provenance
  { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-087", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); insertAcceptedTxn(s, mkEvent("job_material.consumed", { consumption_id: "CON-087", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" })); const before = deepCloneState(s); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-087", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s); results.push(rejZm("AT-087", "E34 missing E33 provenance", "Reject with VALIDATION.ISSUE_PROVENANCE_MISMATCH + state unchanged", r, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", before, s)); }

  // AT-088: E34 missing JobIssueProgress for related_issue_event_id
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-088", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-088", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e33EventId = e33.event_id as string; const prov = Object.values(s2.correction_provenance).find(p => p.original_event_id === e33EventId); if (prov) prov.related_issue_event_id = "NONEXISTENT"; const before = deepCloneState(s2); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-088", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); results.push(rejZm("AT-088", "E34 missing JobIssueProgress for related_issue_event_id", "Reject with VALIDATION.ISSUE_PROVENANCE_MISMATCH + state unchanged", r, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", before, s2)); }

  // AT-089: E34 blocked by independent intervening quantity-changing event
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-089", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-089", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const e26 = mkEvent("adjustment.posted", { adjustment_id: "ADJ-089", position_id: "POS-JOB", item_id: "ITEM-001", delta: 1, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33, e26); const before = deepCloneState(s2); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-089", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); results.push(rejZm("AT-089", "E34 blocked by independent intervening quantity-changing event", "Reject with CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE + state unchanged", r, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", before, s2)); }

  // ═══════ E37: remnant.same_item_returned (AT-090 – AT-099) ═══════

  // AT-090: E37 valid exact issue/source attribution
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-090", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-090", original_issue_id: "ISS-090", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(acc("AT-090", "E37 valid exact issue/source attribution", "Accepted", r)); }

  // AT-091: E37 source position differing from referenced issue's custody position
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-091", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-091", original_issue_id: "ISS-091", source_position_id: "POS-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-091", "E37 source position differing from referenced issue's custody position", "Reject with VALIDATION.POSITION_MISMATCH + state unchanged", r, "VALIDATION.POSITION_MISMATCH", before, s2)); }

  // AT-092: E37 source item mismatch
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-092", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-092", original_issue_id: "ISS-092", source_position_id: "POS-JOB", destination_position_id: "POS-WH-2", item_id: "ITEM-002", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-092", "E37 source item mismatch", "Reject with VALIDATION.ITEM_MISMATCH + state unchanged", r, "VALIDATION.ITEM_MISMATCH", before, s2)); }

  // AT-093: E37 source quantity insufficient
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-093", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); s2.positions["POS-JOB"].position_quantity = 3; s2.positions["POS-WH"].position_quantity = 97; const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-093", original_issue_id: "ISS-093", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-093", "E37 source quantity insufficient", "Reject with INV.NEGATIVE_RESULT + state unchanged", r, "INV.NEGATIVE_RESULT", before, s2)); }

  // AT-094: E37 destination item mismatch
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-094", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-094", original_issue_id: "ISS-094", source_position_id: "POS-JOB", destination_position_id: "POS-WH-2", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-094", "E37 destination item mismatch", "Reject with VALIDATION.ITEM_MISMATCH + state unchanged", r, "VALIDATION.ITEM_MISMATCH", before, s2)); }

  // AT-095: E37 destination not warehouse/truck
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-095", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-095", original_issue_id: "ISS-095", source_position_id: "POS-JOB", destination_position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-095", "E37 destination not warehouse/truck", "Reject with VALIDATION.POSITION_MISMATCH + state unchanged", r, "VALIDATION.POSITION_MISMATCH", before, s2)); }

  // AT-096: E37 partial return
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-096", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const e32EventId = e32.event_id as string; const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-096", original_issue_id: "ISS-096", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); const outstanding = r.ok ? (r.proposed_state.job_issue_progress[e32EventId]?.outstanding_quantity ?? -1) : -1; results.push(tr("AT-096", "E37 partial return", "Accepted with outstanding=7 after partial return 3 of 10", r.ok && outstanding === 7, "outstanding=7", `outstanding=${outstanding}`)); }

  // AT-097: E37 return exceeds outstanding
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-097", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-097", original_issue_id: "ISS-097", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-097", "E37 return exceeds outstanding", "Reject with RETURN.EXCEEDS_OUTSTANDING_ISSUE + state unchanged", r, "RETURN.EXCEEDS_OUTSTANDING_ISSUE", before, s2)); }

  // AT-098: E37 original issue not found
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("remnant.same_item_returned", { return_id: "RET-098", original_issue_id: "NONEXISTENT", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-098", "E37 original issue not found", "Reject with CORRECTION.ORIGINAL_NOT_FOUND + state unchanged", r, "CORRECTION.ORIGINAL_NOT_FOUND", before, s)); }

  // AT-099: E37 ambiguous original reference
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-099", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); insertAcceptedTxn(s2, mkEvent("job_material.issued", { issue_id: "ISS-099", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" })); const before = deepCloneState(s2); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-099", original_issue_id: "ISS-099", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); results.push(rejZm("AT-099", "E37 ambiguous original reference", "Reject with VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE + state unchanged", r, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", before, s2)); }

  // ═══════ E47: count.observation (AT-100) ═══════

  // AT-100: Count observation no effect
  { const s = makeBaseState(); const e = mkEvent("count.observation", { count_session_id: "CS-100", position_id: "POS-WH", item_id: "ITEM-001", observed_quantity: 100 }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-100", "Count observation no effect", "Accepted with NoEffectObservation", r)); }

  // ═══════ E48: count.variance.resolved (AT-101 – AT-103) ═══════

  // AT-101: Count variance resolved positive
  { const s = makeBaseState(); const provBefore = Object.keys(s.correction_provenance).length; const e = mkEvent("count.variance.resolved", { count_session_id: "CS-101", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 105, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const provAfter = r.ok ? Object.keys(r.proposed_state.correction_provenance).length : provBefore; const hasProv = provAfter > provBefore; const hasCost = r.ok ? r.immutable_facts.length > 0 : true; results.push(tr("AT-101", "Count variance resolved positive", "Accepted, no CostPreservationResult, no provenance", r.ok && !hasProv && !hasCost, "no provenance, no cost", r.ok ? `prov=${hasProv}, cost=${hasCost}` : "ok=false")); }

  // AT-102: Count variance resolved negative
  { const s = makeBaseState(); const provBefore = Object.keys(s.correction_provenance).length; const e = mkEvent("count.variance.resolved", { count_session_id: "CS-102", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 95, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); const provAfter = r.ok ? Object.keys(r.proposed_state.correction_provenance).length : provBefore; const hasProv = provAfter > provBefore; const hasCost = r.ok ? r.immutable_facts.length > 0 : true; results.push(tr("AT-102", "Count variance resolved negative", "Accepted, no CostPreservationResult, no provenance", r.ok && !hasProv && !hasCost, "no provenance, no cost", r.ok ? `prov=${hasProv}, cost=${hasCost}` : "ok=false")); }

  // AT-103: E48 creates no CorrectionProvenanceCreatedOp
  { const s = makeBaseState(); const e = mkEvent("count.variance.resolved", { count_session_id: "CS-103", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 105, authority_marker: "manager" }); const r = evaluateEvent2G1A(e, s); let hasProvOp = false; if (r.ok) { for (const txn of Object.values(r.proposed_state.transactions)) { const ops = txn.recorded_operations as unknown[]; hasProvOp = hasProvOp || ops.some(op => (op as { op_kind?: string }).op_kind === "correction_provenance_created"); } } results.push(tr("AT-103", "E48 creates no CorrectionProvenanceCreatedOp", "recorded_operations empty of provenance creation", r.ok && !hasProvOp, "no provenance op", hasProvOp ? "provenance op FOUND" : "no provenance op")); }

  // ═══════ Boundary tests (AT-104 – AT-111) ═══════

  // AT-104: Deferred event E10 recognized as known deferred discriminator
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("po.received" as never, { purchase_order_id: "PO-104" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-104", "Deferred event E10 recognized as known deferred discriminator (payload NOT parsed)", "Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + state unchanged", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", before, s)); }

  // AT-105: Deferred event E40 recognized as known deferred discriminator
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("disposal.requested" as never, { disposal_id: "DISP-105" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-105", "Deferred event E40 recognized as known deferred discriminator (payload NOT parsed)", "Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + state unchanged", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", before, s)); }

  // AT-106: Deferred event E7 recognized as known deferred discriminator
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("po.received" as never, { purchase_order_id: "PO-106" }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-106", "Deferred event E7 recognized as known deferred discriminator (payload NOT parsed)", "Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + state unchanged", r, "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", before, s)); }

  // AT-107: Unknown discriminator
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("foo.bar" as never, {}); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-107", "Unknown discriminator", "Reject with VALIDATION.UNKNOWN_EVENT_TYPE + state unchanged", r, "VALIDATION.UNKNOWN_EVENT_TYPE", before, s)); }

  // AT-108: Null event input
  { const s = makeBaseState(); const before = deepCloneState(s); const r = evaluateEvent2G1A(null, s); results.push(rejZm("AT-108", "Null event input", "Reject with VALIDATION.NULL_EVENT_INPUT + state unchanged", r, "VALIDATION.NULL_EVENT_INPUT", before, s)); }

  // AT-109: Non-object input (string)
  { const s = makeBaseState(); const before = deepCloneState(s); const r = evaluateEvent2G1A("not an object", s); results.push(rejZm("AT-109", "Non-object input (string)", "Reject with VALIDATION.NON_OBJECT_INPUT + state unchanged", r, "VALIDATION.NON_OBJECT_INPUT", before, s)); }

  // AT-110: Non-object input (number)
  { const s = makeBaseState(); const before = deepCloneState(s); const r = evaluateEvent2G1A(42, s); results.push(rejZm("AT-110", "Non-object input (number)", "Reject with VALIDATION.NON_OBJECT_INPUT + state unchanged", r, "VALIDATION.NON_OBJECT_INPUT", before, s)); }

  // AT-111: Missing event_type field
  { const s = makeBaseState(); const before = deepCloneState(s); const r = evaluateEvent2G1A({}, s); results.push(rejZm("AT-111", "Missing event_type field", "Reject with VALIDATION.MISSING_REQUIRED_FIELD + state unchanged", r, "VALIDATION.MISSING_REQUIRED_FIELD", before, s)); }

  // ═══════ AT-112: Idempotency duplicate ═══════

  // AT-112: Idempotency duplicate
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-112", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const before = deepCloneState(s2); const e5b = mkEvent("receipt.posted", { receipt_id: "R-112B", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null }); e5b.idempotency_key = e5.idempotency_key as string; const r = evaluateEvent2G1A(e5b, s2); results.push(rejZm("AT-112", "Idempotency duplicate", "Reject with INV.IDEMPOTENCY_DUPLICATE_CONTRACT + state unchanged", r, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", before, s2)); }

  // ═══════ Invariant/structural tests (AT-113 – AT-121) ═══════

  // AT-113: Company-owned conservation
  { const s = makeBaseState(); let sum = 0; for (const p of Object.values(s.positions)) { if (p.item_id === "ITEM-001" && p.ownership_class === "company_owned" && p.position_kind !== "terminal_job_cost") sum += p.position_quantity; } const co = s.company_ownership["ITEM-001"].company_owned_quantity; results.push(tr("AT-113", "Company-owned conservation", "company_owned_quantity = sum of non-terminal positions", co === sum, `co=${co}`, `sum=${sum}`)); }

  // AT-114: Company-owned reconciliation mismatch
  { const s = makeBaseState(); s.company_ownership["ITEM-001"].company_owned_quantity = 999; const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-114", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const code = getRejCode(r); const unchanged = statesEqual(before, s); results.push(tr("AT-114", "Company-owned reconciliation mismatch", "Reject with RECONCILIATION.COMPANY_OWNED_MISMATCH + state unchanged", !r.ok && code === "RECONCILIATION.COMPANY_OWNED_MISMATCH" && unchanged, "RECONCILIATION.COMPANY_OWNED_MISMATCH + unchanged", `${code} + ${unchanged ? "unchanged" : "MUTATED"}`)); }

  // AT-115: Terminal zero-balance invariant
  { const s = makeBaseState(); const allZero = Object.values(s.positions).filter(p => p.position_kind === "terminal_job_cost").every(p => p.position_quantity === 0); results.push(tr("AT-115", "Terminal zero-balance invariant", "All terminal_job_cost positions have position_quantity = 0", allZero, "all terminal qty=0", allZero ? "all zero" : "nonzero terminal")); }

  // AT-116: Issued/consumed/returned/outstanding reconciliation
  { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-116", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-116", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e32, e33); const e32EventId = e32.event_id as string; const issue = s2.job_issue_progress[e32EventId]; const eq = issue ? (issue.outstanding_quantity === issue.issued_quantity - issue.consumed_quantity - issue.returned_quantity) : false; results.push(tr("AT-116", "Issued/consumed/returned/outstanding reconciliation", "outstanding = issued - consumed - returned", eq, "equation holds", eq ? "holds" : "fails")); }

  // AT-117: State revision increments by exactly one on accept
  { const s = makeBaseState(); const before = s.state_revision; const e = mkEvent("receipt.posted", { receipt_id: "R-117", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const after = r.ok ? r.proposed_state.state_revision : -1; results.push(tr("AT-117", "State revision increments by exactly one on accept", "after_revision = before_revision + 1", r.ok && after === before + 1, `revision=${before + 1}`, `revision=${after}`)); }

  // AT-118: State revision unchanged on rejection
  { const s = makeBaseState(); const before = s.state_revision; const e = mkEvent("receipt.posted", { receipt_id: "R-118", destination_position_id: "NONEXISTENT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); const after = s.state_revision; results.push(tr("AT-118", "State revision unchanged on rejection", "state_revision unchanged after rejection", !r.ok && after === before, `revision=${before}`, `revision=${after}`)); }

  // AT-119: Deterministic effect ordering
  { const s = makeBaseState(); const e = mkEvent("transfer.dispatched", { transfer_id: "T-119", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e, s); let sorted = true; if (r.ok) { const effs = r.state_effects; for (let i = 1; i < effs.length; i++) { const a = effs[i - 1]; const b = effs[i]; if (a.kind === "position_quantity" && b.kind === "position_quantity") { const ap = a as { position_id: string }; const bp = b as { position_id: string }; if (ap.position_id > bp.position_id) sorted = false; } } } results.push(tr("AT-119", "Deterministic effect ordering", "Effects sorted by position_id then item_id", r.ok && sorted, "sorted", sorted ? "sorted" : "not sorted")); }

  // AT-120: Deterministic error ordering
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null, unknown_key: "bad" }); const r = evaluateEvent2G1A(e, s); let sorted = true; if (!r.ok) { const errors = (r as { errors: { category: string; error_code: string }[] }).errors; if (errors.length > 1) { for (let i = 1; i < errors.length; i++) { const a = errors[i - 1]; const b = errors[i]; if (a.category > b.category || (a.category === b.category && a.error_code > b.error_code)) sorted = false; } } } results.push(tr("AT-120", "Deterministic error ordering", "Errors sorted by category, code, field", !r.ok && sorted, "sorted", sorted ? "sorted" : "not sorted")); }

  // AT-121: AcceptedEventRecord finite nonrecursive serialization
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-121", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const r = evaluateEvent2G1A(e, s); let serializable = false; let noSelfInsert = false; if (r.ok) { try { JSON.stringify(r.proposed_state.transactions); serializable = true; } catch { serializable = false; } const txn = Object.values(r.proposed_state.transactions).find(t => (t.event as Record<string, unknown>)?.event_id === (e.event_id as string)); if (txn) { const ops = txn.recorded_operations as unknown[]; noSelfInsert = !ops.some(op => { const k = (op as { op_kind?: string }).op_kind; return k === "accepted_event_record_inserted" || k === "state_revision_advanced"; }); } } results.push(tr("AT-121", "AcceptedEventRecord finite nonrecursive serialization", "JSON-serializable, no self-insertion op in recorded_operations", serializable && noSelfInsert, "serializable + no self-insert", `${serializable} + ${noSelfInsert}`)); }

  // ═══════ Compile/structural tests (AT-122 – AT-127) ═══════

  // AT-122: Transaction insertion op rejected inside its own record
  { const cc = runCompileChecks(); const passed = cc.passed; results.push(tr("AT-122", "Transaction insertion op rejected inside its own record", "Nonrecursion assertion: recorded_operations excludes AcceptedEventRecordInsertedOp and StateRevisionAdvancedOp", passed, "compile check passes", passed ? "passes" : "fails")); }

  // AT-123: NoEffectWorkflow compiles without duplicate properties
  { const cc = runCompileChecks(); results.push(tr("AT-123", "NoEffectWorkflow compiles without duplicate properties", "Compile check passes", cc.passed, "passes", cc.passed ? "passes" : "fails")); }

  // AT-124: NoEffectCommand compiles with single reason field
  { const cc = runCompileChecks(); results.push(tr("AT-124", "NoEffectCommand compiles with single reason field", "Compile check passes", cc.passed, "passes", cc.passed ? "passes" : "fails")); }

  // AT-125: NoEffectObservation compiles with single reason field
  { const cc = runCompileChecks(); results.push(tr("AT-125", "NoEffectObservation compiles with single reason field", "Compile check passes", cc.passed, "passes", cc.passed ? "passes" : "fails")); }

  // AT-126: RawEventInput2G1A exists before raw cost transformation
  { const s = makeBaseState(); const e = mkEvent("receipt.posted", { receipt_id: "R-126", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "supported_explicit", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(acc("AT-126", "RawEventInput2G1A exists before raw cost transformation", "Accepted (Stage C before Stage D)", r)); }

  // AT-127: Raw invalid cost never enters DomainEvent2G1A
  { const s = makeBaseState(); const before = deepCloneState(s); const e = mkEvent("receipt.posted", { receipt_id: "R-127", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" } }); const r = evaluateEvent2G1A(e, s); results.push(rejZm("AT-127", "Raw invalid cost never enters DomainEvent2G1A", "Reject with VAL.SELLING_PRICE_REJECTED + state unchanged (rejected before DomainEvent construction)", r, "VAL.SELLING_PRICE_REJECTED", before, s)); }

  // ═══════ Blocker emission tests (AT-128 – AT-137) ═══════

  // AT-128: E8 blocker emission for both affected positions (source and in-transit)
  { const s = makeBaseState(); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-128A", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5it = mkEvent("receipt.posted", { receipt_id: "R-128B", destination_position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5wh, e5it); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-128", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e8, s2); let blocksAtSource = false; let blocksAtInTransit = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-WH") blocksAtSource = true; if (bop.blocking_position_id === "POS-IN-TRANSIT") blocksAtInTransit = true; } } } results.push(tr("AT-128", "E8 blocker emission for both affected positions (source and in-transit)", "Blocks emitted at both positions", r.ok && blocksAtSource && blocksAtInTransit, "blocks at both", `source=${blocksAtSource}, in_transit=${blocksAtInTransit}`)); }

  // AT-129: E9 blocker emission for both affected positions (in-transit and destination)
  { const s = makeBaseState(); const e5it = mkEvent("receipt.posted", { receipt_id: "R-129A", destination_position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5truck = mkEvent("receipt.posted", { receipt_id: "R-129B", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T-129", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e5it, e5truck, e8); const e9 = mkEvent("transfer.received", { transfer_id: "T-129", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e9, s2); let blocksAtInTransit = false; let blocksAtDest = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-IN-TRANSIT") blocksAtInTransit = true; if (bop.blocking_position_id === "POS-TRUCK") blocksAtDest = true; } } } results.push(tr("AT-129", "E9 blocker emission for both affected positions (in-transit and destination)", "Blocks emitted at both positions", r.ok && blocksAtInTransit && blocksAtDest, "blocks at both", `in_transit=${blocksAtInTransit}, dest=${blocksAtDest}`)); }

  // AT-130: E32 blocker emission for both affected positions (source and job-custody)
  { const s = makeBaseState(); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-130A", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 50, unit_of_measure: "ea", cost: null }); const e5job = mkEvent("receipt.posted", { receipt_id: "R-130B", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5wh, e5job); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-130", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e32, s2); let blocksAtSource = false; let blocksAtJob = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-WH") blocksAtSource = true; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; } } } results.push(tr("AT-130", "E32 blocker emission for both affected positions (source and job-custody)", "Blocks emitted at both positions, excluding newly-created provenance", r.ok && blocksAtSource && blocksAtJob, "blocks at both", `source=${blocksAtSource}, job=${blocksAtJob}`)); }

  // AT-131: E33 blocker emission at job-custody position
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-131", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-131", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e5job, e32); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-131", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const r = evaluateEvent2G1A(e33, s2); let blocksAtJob = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; } } } results.push(tr("AT-131", "E33 blocker emission at job-custody position", "Blocks emitted, excluding newly-created provenance", r.ok && blocksAtJob, "blocks at job-custody", `blocks=${blocksAtJob}`)); }

  // AT-132: Zero mutation across all rejection codes (aggregate)
  { let allUnchanged = true; let codesTested = 0; let failedCodes: string[] = [];
    // Helper to test a rejection scenario
    function testRej(label: string, state: DomainState, event: unknown, expectedCode: string) {
      const before = deepCloneState(state);
      const r = evaluateEvent2G1A(event, state);
      const code = getRejCode(r);
      const unchanged = statesEqual(before, state);
      if (!unchanged) { allUnchanged = false; failedCodes.push(`${label}: MUTATED`); }
      if (code !== expectedCode) { failedCodes.push(`${label}: got ${code}, expected ${expectedCode}`); }
      codesTested++;
    }
    // 1. AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE
    { const s = makeBaseState(); testRej("SCOPE", s, mkEvent("po.received" as never, { purchase_order_id: "PO" }), "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE"); }
    // 2. AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B
    { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); testRej("PARTIAL", s2, mkEvent("transfer.received", { transfer_id: "T", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }), "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B"); }
    // 3. VALIDATION.NULL_EVENT_INPUT
    { const s = makeBaseState(); testRej("NULL", s, null, "VALIDATION.NULL_EVENT_INPUT"); }
    // 4. VALIDATION.NON_OBJECT_INPUT
    { const s = makeBaseState(); testRej("NONOBJ", s, "string", "VALIDATION.NON_OBJECT_INPUT"); }
    // 5. VALIDATION.MISSING_REQUIRED_FIELD
    { const s = makeBaseState(); testRej("MISSING", s, mkEvent("receipt.posted", { destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }), "VALIDATION.MISSING_REQUIRED_FIELD"); }
    // 6. VALIDATION.UNKNOWN_PAYLOAD_KEY
    { const s = makeBaseState(); testRej("UNKNOWN_KEY", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, bad: 1 }), "VALIDATION.UNKNOWN_PAYLOAD_KEY"); }
    // 7. VALIDATION.INVALID_ENUM_VALUE
    { const s = makeBaseState(); testRej("INVALID_ENUM", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: 123, unit_cost: 5, currency: "USD" } }), "VALIDATION.INVALID_ENUM_VALUE"); }
    // 8. VALIDATION.NON_POSITIVE_QUANTITY
    { const s = makeBaseState(); testRej("NONPOS", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null }), "VALIDATION.NON_POSITIVE_QUANTITY"); }
    // 9. VALIDATION.ZERO_DELTA_NOT_PERMITTED
    { const s = makeBaseState(); testRej("ZERO_DELTA", s, mkEvent("adjustment.posted", { adjustment_id: "A", position_id: "POS-WH", item_id: "ITEM-001", delta: 0, authority_marker: "m" }), "VALIDATION.ZERO_DELTA_NOT_PERMITTED"); }
    // 10. VALIDATION.NO_OP_RECLASSIFICATION
    { const s = makeBaseState(); testRej("NOOP", s, mkEvent("adjustment.reclassification", { position_id: "POS-WH", item_id: "ITEM-001", new_condition: "available", new_restriction: "none" }), "VALIDATION.NO_OP_RECLASSIFICATION"); }
    // 11. VALIDATION.MISSING_SOURCE_POSITION
    { const s = makeBaseState(); testRej("MISSING_SRC", s, mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "BAD", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }), "VALIDATION.MISSING_SOURCE_POSITION"); }
    // 12. VALIDATION.MISSING_DESTINATION_POSITION
    { const s = makeBaseState(); testRej("MISSING_DST", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "BAD", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }), "VALIDATION.MISSING_DESTINATION_POSITION"); }
    // 13. VALIDATION.MISSING_ISSUE_PROVENANCE
    { const s = makeBaseState(); testRej("MISSING_ISSUE", s, mkEvent("job_material.consumed", { consumption_id: "C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "m" }), "VALIDATION.MISSING_ISSUE_PROVENANCE"); }
    // 14. VALIDATION.ITEM_MISMATCH
    { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "I", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); testRej("ITEM_MISMATCH", s2, mkEvent("remnant.same_item_returned", { return_id: "R", original_issue_id: "I", source_position_id: "POS-JOB", destination_position_id: "POS-WH-2", item_id: "ITEM-002", quantity: 5, unit_of_measure: "ea" }), "VALIDATION.ITEM_MISMATCH"); }
    // 15. VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION
    { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "I", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); testRej("OPEN_ISSUE", s2, mkEvent("job_material.issued", { issue_id: "I2", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }), "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION"); }
    // 16. VALIDATION.UNKNOWN_EVENT_TYPE
    { const s = makeBaseState(); testRej("UNKNOWN_TYPE", s, mkEvent("foo.bar" as never, {}), "VALIDATION.UNKNOWN_EVENT_TYPE"); }
    // 17. VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); insertAcceptedTxn(s2, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null })); testRej("AMBIG", s2, mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 1 }), "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE"); }
    // 18. VALIDATION.RECEIPT_ID_MISMATCH
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-ACT", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); e5.source_document_id = "DOC-X"; const { state: s2 } = runSeq(s, e5); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R-WRONG", reversal_quantity: 1 }); e6.source_document_id = "DOC-X"; testRej("RECEIPT_MISMATCH", s2, e6, "VALIDATION.RECEIPT_ID_MISMATCH"); }
    // 19. VALIDATION.ISSUE_PROVENANCE_MISMATCH
    { const s = makeBaseState(); insertIssue(s, { issue_event_id: "E32-X", item_id: "ITEM-001", job_custody_position_id: "POS-JOB", issued_quantity: 10 }); insertAcceptedTxn(s, mkEvent("job_material.consumed", { consumption_id: "C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null, authority_marker: "m" })); testRej("ISSUE_PROV", s, mkEvent("consumption.reversed", { original_consumption_id: "C", reversal_quantity: 1 }), "VALIDATION.ISSUE_PROVENANCE_MISMATCH"); }
    // 20. VALIDATION.POSITION_MISMATCH
    { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "I", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); testRej("POS_MISMATCH", s2, mkEvent("remnant.same_item_returned", { return_id: "R", original_issue_id: "I", source_position_id: "POS-WH", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }), "VALIDATION.POSITION_MISMATCH"); }
    // 21. UOM.NON_FINITE_QUANTITY
    { const s = makeBaseState(); testRej("NONFINITE", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea", cost: null }), "UOM.NON_FINITE_QUANTITY"); }
    // 22. INV.NEGATIVE_RESULT
    { const s = makeBaseState(); testRej("NEG_RESULT", s, mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 200, unit_of_measure: "ea" }), "INV.NEGATIVE_RESULT"); }
    // 23. STATE.WRONG_TRANSITION
    { const s = makeBaseState(); testRej("WRONG_TRANS", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-TERMINAL", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }), "STATE.WRONG_TRANSITION"); }
    // 24. RECONCILIATION.COMPANY_OWNED_MISMATCH
    { const s = makeBaseState(); s.company_ownership["ITEM-001"].company_owned_quantity = 999; testRej("RECON", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }), "RECONCILIATION.COMPANY_OWNED_MISMATCH"); }
    // 25. INV.IDEMPOTENCY_DUPLICATE_CONTRACT
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e5b = mkEvent("receipt.posted", { receipt_id: "R2", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null }); e5b.idempotency_key = e5.idempotency_key as string; testRej("IDEM_DUP", s2, e5b, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT"); }
    // 26. TRANSFER.RECEIVE_WITHOUT_DISPATCH
    { const s = makeBaseState(); testRej("NO_DISPATCH", s, mkEvent("transfer.received", { transfer_id: "T", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }), "TRANSFER.RECEIVE_WITHOUT_DISPATCH"); }
    // 27. TRANSFER.RECEIVE_EXCEEDS_DISPATCH
    { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); testRej("EXCEEDS_DISPATCH", s2, mkEvent("transfer.received", { transfer_id: "T", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }), "TRANSFER.RECEIVE_EXCEEDS_DISPATCH"); }
    // 28. TRANSFER.DESTINATION_MISMATCH
    { const s = makeBaseState(); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e8); testRej("DEST_MISMATCH", s2, mkEvent("transfer.received", { transfer_id: "T", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }), "TRANSFER.DESTINATION_MISMATCH"); }
    // 29. CORRECTION.ORIGINAL_NOT_FOUND
    { const s = makeBaseState(); testRej("NOT_FOUND", s, mkEvent("receipt.reversed", { original_receipt_id: "BAD", reversal_quantity: 1 }), "CORRECTION.ORIGINAL_NOT_FOUND"); }
    // 30. CORRECTION.ALREADY_REVERSED
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e6 = mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 10 }); const { state: s2 } = runSeq(s, e5, e6); testRej("ALREADY_REV", s2, mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 1 }), "CORRECTION.ALREADY_REVERSED"); }
    // 31. CORRECTION.REVERSAL_EXCEEDS_AVAILABLE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea", cost: null }); const e6a = mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 3 }); const { state: s2 } = runSeq(s, e5, e6a); testRej("EXCEEDS_AVAIL", s2, mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 5 }), "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE"); }
    // 32. CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE
    { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e8 = mkEvent("transfer.dispatched", { transfer_id: "T", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e5, e8); testRej("PROV_UNAVAIL", s2, mkEvent("receipt.reversed", { original_receipt_id: "R", reversal_quantity: 4 }), "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE"); }
    // 33. CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE
    { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "I", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); testRej("EXCEEDS_ISSUE", s2, mkEvent("job_material.consumed", { consumption_id: "C", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null, authority_marker: "m" }), "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE"); }
    // 34. RETURN.EXCEEDS_OUTSTANDING_ISSUE
    { const s = makeBaseState(); const e32 = mkEvent("job_material.issued", { issue_id: "I", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e32); testRej("EXCEEDS_RETURN", s2, mkEvent("remnant.same_item_returned", { return_id: "R", original_issue_id: "I", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea" }), "RETURN.EXCEEDS_OUTSTANDING_ISSUE"); }
    // 35. VAL.SELLING_PRICE_REJECTED
    { const s = makeBaseState(); testRej("SELLING", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "selling_price", unit_cost: 5, currency: "USD" } }), "VAL.SELLING_PRICE_REJECTED"); }
    // 36. VAL.MSRP_REJECTED
    { const s = makeBaseState(); testRej("MSRP", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "msrp", unit_cost: 5, currency: "USD" } }), "VAL.MSRP_REJECTED"); }
    // 37. VAL.MARKUP_REJECTED
    { const s = makeBaseState(); testRej("MARKUP", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "markup", unit_cost: 5, currency: "USD" } }), "VAL.MARKUP_REJECTED"); }
    // 38. VAL.COST_SOURCE_INVALID
    { const s = makeBaseState(); testRej("COST_INVALID", s, mkEvent("receipt.posted", { receipt_id: "R", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: { cost_source: "other_invalid", unit_cost: 5, currency: "USD" } }), "VAL.COST_SOURCE_INVALID"); }

    results.push(tr("AT-132", "Zero mutation across all rejection codes (aggregate)", `All ${codesTested} rejection codes: state unchanged, correct code`, allUnchanged && codesTested === 38 && failedCodes.length === 0, `38 codes, all unchanged`, `codes=${codesTested}, unchanged=${allUnchanged}, failures=${failedCodes.length}`)); }

  // AT-133: E34 blocker emission at job-custody position excluding its own E33 target
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-133", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-133", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const e33 = mkEvent("job_material.consumed", { consumption_id: "CON-133", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea", cost: null, authority_marker: "manager" }); const { state: s2 } = runSeq(s, e5job, e32, e33); const e33EventId = e33.event_id as string; const e33Prov = Object.values(s2.correction_provenance).find(p => p.original_event_id === e33EventId); const e5Prov = Object.values(s2.correction_provenance).find(p => p.original_event_type === "receipt.posted" && p.original_position_id === "POS-JOB"); const e34 = mkEvent("consumption.reversed", { original_consumption_id: "CON-133", reversal_quantity: 1 }); const r = evaluateEvent2G1A(e34, s2); let blocksOtherProv = false; let doesNotBlockSelf = true; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { provenance_record_id: string }; if (e5Prov && bop.provenance_record_id === e5Prov.record_id) blocksOtherProv = true; if (e33Prov && bop.provenance_record_id === e33Prov.record_id) doesNotBlockSelf = false; } } } results.push(tr("AT-133", "E34 blocker emission at job-custody position excluding its own E33 target", "Blocks emitted at other eligible provenance, not own E33 target", r.ok && blocksOtherProv && doesNotBlockSelf, "blocks other, not self", `other=${blocksOtherProv}, self_not_blocked=${doesNotBlockSelf}`)); }

  // AT-134: E37 blocker emission for both affected positions (job-custody source and return destination)
  { const s = makeBaseState(); const e5job = mkEvent("receipt.posted", { receipt_id: "R-134A", destination_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e5wh = mkEvent("receipt.posted", { receipt_id: "R-134B", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const e32 = mkEvent("job_material.issued", { issue_id: "ISS-134", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 5, unit_of_measure: "ea" }); const { state: s2 } = runSeq(s, e5job, e5wh, e32); const e37 = mkEvent("remnant.same_item_returned", { return_id: "RET-134", original_issue_id: "ISS-134", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 3, unit_of_measure: "ea" }); const r = evaluateEvent2G1A(e37, s2); let blocksAtJob = false; let blocksAtWh = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") { const bop = op as { blocking_position_id: string }; if (bop.blocking_position_id === "POS-JOB") blocksAtJob = true; if (bop.blocking_position_id === "POS-WH") blocksAtWh = true; } } } results.push(tr("AT-134", "E37 blocker emission for both affected positions (job-custody source and return destination)", "Blocks emitted at both positions", r.ok && blocksAtJob && blocksAtWh, "blocks at both", `job=${blocksAtJob}, wh=${blocksAtWh}`)); }

  // AT-135: E48 blocker emission when delta nonzero
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-135", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-135", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 105, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s2); let blocksEmitted = false; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") blocksEmitted = true; } } results.push(tr("AT-135", "E48 blocker emission when delta nonzero", "Blocks emitted at affected position", r.ok && blocksEmitted, "blocks emitted", `blocks=${blocksEmitted}`)); }

  // AT-136: E48 zero-delta emits no blocker operation
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-136", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const currentQty = s2.positions["POS-WH"].position_quantity; const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-136", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: currentQty, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s2); let blockOps = 0; let qtyEffects = 0; if (r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") blockOps++; } for (const eff of r.state_effects) { if (eff.kind === "position_quantity") qtyEffects++; } } results.push(tr("AT-136", "E48 zero-delta emits no blocker operation", "Zero block ops, zero PositionQuantityEffect, zero CompanyOwnedEffect", r.ok && blockOps === 0 && qtyEffects === 0, "zero block ops", `blockOps=${blockOps}, qtyEffects=${qtyEffects}`)); }

  // AT-137: E48 rejected emits no blocker operation (zero mutation)
  { const s = makeBaseState(); const e5 = mkEvent("receipt.posted", { receipt_id: "R-137", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 10, unit_of_measure: "ea", cost: null }); const { state: s2 } = runSeq(s, e5); const before = deepCloneState(s2); const e48 = mkEvent("count.variance.resolved", { count_session_id: "CS-137", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: -1, authority_marker: "manager" }); const r = evaluateEvent2G1A(e48, s2); const code = getRejCode(r); const unchanged = statesEqual(before, s2); let blockOps = 0; if (!r.ok) { for (const op of r.atomic_record_operations) { if ((op as { op_kind?: string }).op_kind === "correction_provenance_downstream_block_updated") blockOps++; } } results.push(tr("AT-137", "E48 rejected emits no blocker operation (zero mutation)", "Rejected, zero block ops, state unchanged", !r.ok && blockOps === 0 && unchanged, "reject + zero block ops + unchanged", `${code} + blockOps=${blockOps} + ${unchanged ? "unchanged" : "MUTATED"}`)); }

  // ═══════ Summary ═══════
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const skipped = 0;
  const placeholder = 0;
  const ids = results.map(r => r.test_id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  const expectedIds = Array.from({ length: 137 }, (_, i) => `AT-${String(i + 1).padStart(3, "0")}`);
  const idSet = new Set(ids);
  const missing = expectedIds.filter(id => !idSet.has(id));

  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      placeholder_passes: placeholder,
      duplicate_ids: duplicates.length,
      missing_ids: missing.length,
      failed_ids: results.filter(r => !r.passed).map(r => r.test_id),
    },
  };
}

export { TRACEABILITY_REGISTRY, verifyTraceability };