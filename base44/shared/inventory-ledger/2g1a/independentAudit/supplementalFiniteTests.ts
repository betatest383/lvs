// ═════════════════════════════════════════════════════════════════
// SUPPLEMENTAL CONTRACT-CONFORMANCE TESTS
// Non-finite / non-positive quantity validation for all affected events.
//
// These tests are SEPARATE from AT-001–AT-137 and do not renumber,
// replace, or represent any part of the approved 137-test registry.
//
// Tests: SUP-001 through SUP-045
// Pure, non-routable, no SDK, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

import { evaluateEvent2G1A } from "../publicBoundary.ts";
import {
  makeBaseState, mkEvent, deepCloneState, statesEqual, getRejCode,
  type AuditTestRecord, type AuditRunResult, resetEventCounter,
} from "./auditFixtures.ts";

export function runSupplementalTests(): AuditRunResult {
  const results: AuditTestRecord[] = [];
  resetEventCounter();
  let n = 0;

  function rejZm(
    testName: string,
    state: ReturnType<typeof makeBaseState>,
    event: unknown,
    expectedCode: string,
    eventType: string
  ): void {
    const before = deepCloneState(state);
    const r = evaluateEvent2G1A(event, state);
    const code = getRejCode(r);
    const unchanged = statesEqual(before, state);
    const noOps = !r.ok && r.atomic_record_operations.length === 0;
    const noEffects = !r.ok && r.state_effects.length === 0;
    const noFacts = !r.ok && r.immutable_facts.length === 0;
    const noClassifications = !r.ok && r.classification_results.length === 0;
    const noDerived = !r.ok && r.derived_result_snapshots.length === 0;
    const passed = !r.ok && code === expectedCode && unchanged && noOps && noEffects && noFacts && noClassifications && noDerived;
    n++;
    results.push({
      test_id: `SUP-${String(n).padStart(3, "0")}`,
      test_name: testName,
      assertion: `Reject ${expectedCode} + zero mutation + no operations/effects/facts/classifications/derived`,
      passed,
      expected: `${expectedCode} + unchanged + no side effects`,
      actual: `${code} + ${unchanged ? "unchanged" : "MUTATED"} + ops=${r.atomic_record_operations.length} + eff=${r.state_effects.length} + facts=${r.immutable_facts.length} + cls=${r.classification_results.length} + der=${r.derived_result_snapshots.length}`,
      notes: eventType,
    });
  }

  function accZero(
    testName: string,
    state: ReturnType<typeof makeBaseState>,
    event: unknown,
    eventType: string
  ): void {
    const before = deepCloneState(state);
    const r = evaluateEvent2G1A(event, state);
    const passed = r.ok;
    n++;
    results.push({
      test_id: `SUP-${String(n).padStart(3, "0")}`,
      test_name: testName,
      assertion: "Accepted (zero is valid for non-negative sign rule)",
      passed,
      expected: "ok=true",
      actual: r.ok ? "ok=true" : `ok=false (${getRejCode(r)})`,
      notes: eventType,
    });
  }

  // ═══════ E6: receipt.reversed (reversal_quantity, positive sign rule) ═══════
  rejZm("E6 reversal_quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("receipt.reversed", { original_receipt_id: "R-S1", reversal_quantity: NaN }), "UOM.NON_FINITE_QUANTITY", "receipt.reversed");
  rejZm("E6 reversal_quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("receipt.reversed", { original_receipt_id: "R-S2", reversal_quantity: Infinity }), "UOM.NON_FINITE_QUANTITY", "receipt.reversed");
  rejZm("E6 reversal_quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("receipt.reversed", { original_receipt_id: "R-S3", reversal_quantity: -Infinity }), "UOM.NON_FINITE_QUANTITY", "receipt.reversed");
  rejZm("E6 reversal_quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("receipt.reversed", { original_receipt_id: "R-S4", reversal_quantity: 0 }), "VALIDATION.NON_POSITIVE_QUANTITY", "receipt.reversed");
  rejZm("E6 reversal_quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("receipt.reversed", { original_receipt_id: "R-S5", reversal_quantity: -5 }), "VALIDATION.NON_POSITIVE_QUANTITY", "receipt.reversed");

  // ═══════ E8: transfer.dispatched (quantity, positive sign rule) ═══════
  rejZm("E8 quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.dispatched", { transfer_id: "T-S6", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: NaN, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.dispatched");
  rejZm("E8 quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.dispatched", { transfer_id: "T-S7", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.dispatched");
  rejZm("E8 quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.dispatched", { transfer_id: "T-S8", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: -Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.dispatched");
  rejZm("E8 quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("transfer.dispatched", { transfer_id: "T-S9", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "transfer.dispatched");
  rejZm("E8 quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("transfer.dispatched", { transfer_id: "T-S10", source_position_id: "POS-WH", in_transit_position_id: "POS-IN-TRANSIT", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "transfer.dispatched");

  // ═══════ E9: transfer.received (quantity, positive sign rule) ═══════
  rejZm("E9 quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.received", { transfer_id: "T-S11", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: NaN, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.received");
  rejZm("E9 quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.received", { transfer_id: "T-S12", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.received");
  rejZm("E9 quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("transfer.received", { transfer_id: "T-S13", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: -Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "transfer.received");
  rejZm("E9 quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("transfer.received", { transfer_id: "T-S14", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "transfer.received");
  rejZm("E9 quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("transfer.received", { transfer_id: "T-S15", destination_position_id: "POS-TRUCK", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "transfer.received");

  // ═══════ E27: adjustment.reversed (reversal_quantity, positive sign rule) ═══════
  rejZm("E27 reversal_quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("adjustment.reversed", { original_adjustment_id: "A-S16", reversal_quantity: NaN }), "UOM.NON_FINITE_QUANTITY", "adjustment.reversed");
  rejZm("E27 reversal_quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("adjustment.reversed", { original_adjustment_id: "A-S17", reversal_quantity: Infinity }), "UOM.NON_FINITE_QUANTITY", "adjustment.reversed");
  rejZm("E27 reversal_quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("adjustment.reversed", { original_adjustment_id: "A-S18", reversal_quantity: -Infinity }), "UOM.NON_FINITE_QUANTITY", "adjustment.reversed");
  rejZm("E27 reversal_quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("adjustment.reversed", { original_adjustment_id: "A-S19", reversal_quantity: 0 }), "VALIDATION.NON_POSITIVE_QUANTITY", "adjustment.reversed");
  rejZm("E27 reversal_quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("adjustment.reversed", { original_adjustment_id: "A-S20", reversal_quantity: -5 }), "VALIDATION.NON_POSITIVE_QUANTITY", "adjustment.reversed");

  // ═══════ E32: job_material.issued (quantity, positive sign rule) ═══════
  rejZm("E32 quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.issued", { issue_id: "I-S21", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: NaN, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "job_material.issued");
  rejZm("E32 quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.issued", { issue_id: "I-S22", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "job_material.issued");
  rejZm("E32 quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.issued", { issue_id: "I-S23", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: -Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "job_material.issued");
  rejZm("E32 quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("job_material.issued", { issue_id: "I-S24", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "job_material.issued");
  rejZm("E32 quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("job_material.issued", { issue_id: "I-S25", source_position_id: "POS-WH", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "job_material.issued");

  // ═══════ E33: job_material.consumed (quantity, positive sign rule) ═══════
  rejZm("E33 quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.consumed", { consumption_id: "C-S26", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: NaN, unit_of_measure: "ea", cost: null, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "job_material.consumed");
  rejZm("E33 quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.consumed", { consumption_id: "C-S27", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea", cost: null, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "job_material.consumed");
  rejZm("E33 quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("job_material.consumed", { consumption_id: "C-S28", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: -Infinity, unit_of_measure: "ea", cost: null, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "job_material.consumed");
  rejZm("E33 quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("job_material.consumed", { consumption_id: "C-S29", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea", cost: null, authority_marker: "manager" }), "VALIDATION.NON_POSITIVE_QUANTITY", "job_material.consumed");
  rejZm("E33 quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("job_material.consumed", { consumption_id: "C-S30", job_custody_position_id: "POS-JOB", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea", cost: null, authority_marker: "manager" }), "VALIDATION.NON_POSITIVE_QUANTITY", "job_material.consumed");

  // ═══════ E34: consumption.reversed (reversal_quantity, positive sign rule) ═══════
  rejZm("E34 reversal_quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("consumption.reversed", { original_consumption_id: "C-S31", reversal_quantity: NaN }), "UOM.NON_FINITE_QUANTITY", "consumption.reversed");
  rejZm("E34 reversal_quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("consumption.reversed", { original_consumption_id: "C-S32", reversal_quantity: Infinity }), "UOM.NON_FINITE_QUANTITY", "consumption.reversed");
  rejZm("E34 reversal_quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("consumption.reversed", { original_consumption_id: "C-S33", reversal_quantity: -Infinity }), "UOM.NON_FINITE_QUANTITY", "consumption.reversed");
  rejZm("E34 reversal_quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("consumption.reversed", { original_consumption_id: "C-S34", reversal_quantity: 0 }), "VALIDATION.NON_POSITIVE_QUANTITY", "consumption.reversed");
  rejZm("E34 reversal_quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("consumption.reversed", { original_consumption_id: "C-S35", reversal_quantity: -5 }), "VALIDATION.NON_POSITIVE_QUANTITY", "consumption.reversed");

  // ═══════ E37: remnant.same_item_returned (quantity, positive sign rule) ═══════
  rejZm("E37 quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("remnant.same_item_returned", { return_id: "R-S36", original_issue_id: "I-S36", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: NaN, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "remnant.same_item_returned");
  rejZm("E37 quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("remnant.same_item_returned", { return_id: "R-S37", original_issue_id: "I-S37", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "remnant.same_item_returned");
  rejZm("E37 quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("remnant.same_item_returned", { return_id: "R-S38", original_issue_id: "I-S38", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: -Infinity, unit_of_measure: "ea" }), "UOM.NON_FINITE_QUANTITY", "remnant.same_item_returned");
  rejZm("E37 quantity=0 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("remnant.same_item_returned", { return_id: "R-S39", original_issue_id: "I-S39", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: 0, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "remnant.same_item_returned");
  rejZm("E37 quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("remnant.same_item_returned", { return_id: "R-S40", original_issue_id: "I-S40", source_position_id: "POS-JOB", destination_position_id: "POS-WH", item_id: "ITEM-001", quantity: -5, unit_of_measure: "ea" }), "VALIDATION.NON_POSITIVE_QUANTITY", "remnant.same_item_returned");

  // ═══════ E48: count.variance.resolved (counted_quantity, NON-NEGATIVE sign rule — zero is valid) ═══════
  // E48 uses a different contract-authorized sign rule: counted_quantity must be >= 0 (non-negative, not strictly positive).
  // Zero is a valid value. The finiteness-first pattern still applies; only the sign check differs.
  rejZm("E48 counted_quantity=NaN → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("count.variance.resolved", { count_session_id: "CS-S41", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: NaN, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "count.variance.resolved");
  rejZm("E48 counted_quantity=+Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("count.variance.resolved", { count_session_id: "CS-S42", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: Infinity, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "count.variance.resolved");
  rejZm("E48 counted_quantity=-Infinity → UOM.NON_FINITE_QUANTITY", makeBaseState(), mkEvent("count.variance.resolved", { count_session_id: "CS-S43", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: -Infinity, authority_marker: "manager" }), "UOM.NON_FINITE_QUANTITY", "count.variance.resolved");
  rejZm("E48 counted_quantity=-5 → VALIDATION.NON_POSITIVE_QUANTITY", makeBaseState(), mkEvent("count.variance.resolved", { count_session_id: "CS-S44", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: -5, authority_marker: "manager" }), "VALIDATION.NON_POSITIVE_QUANTITY", "count.variance.resolved");

  // SUP-045: E48 counted_quantity=0 → accepted (non-negative sign rule, zero is valid)
  // Use a position with quantity=0 so delta = 0-0 = 0 → accepted with no effects
  { const s = makeBaseState(); s.positions["POS-WH"].position_quantity = 0; s.company_ownership["ITEM-001"].company_owned_quantity = 0; accZero("E48 counted_quantity=0 → accepted (non-negative sign rule, zero is valid)", s, mkEvent("count.variance.resolved", { count_session_id: "CS-S45", position_id: "POS-WH", item_id: "ITEM-001", counted_quantity: 0, authority_marker: "manager" }), "count.variance.resolved"); }

  // ═══════ Summary ═══════
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped: 0,
      placeholder_passes: 0,
      duplicate_ids: 0,
      missing_ids: 0,
      failed_ids: results.filter(r => !r.passed).map(r => r.test_id),
    },
  };
}