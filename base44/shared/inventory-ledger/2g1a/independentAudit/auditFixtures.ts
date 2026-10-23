// ═════════════════════════════════════════════════════════════════
// INDEPENDENT AUDIT FIXTURES
// Derived solely from the approved 2G1-A Implementation Authorization
// Contract (SHA-256: df9e621e...dedb544). NOT derived from the
// current implementation or reconstructed test files.
//
// Pure, non-routable, no SDK, no network, no production deps.
// Sibling imports only from the 2g1a implementation module.
// ═════════════════════════════════════════════════════════════════

import type { DomainState } from "../domainState.ts";
import type { DomainResult2G1A } from "../resultTypes.ts";
import type { EventType2G1A, SourceDocumentType2G1A } from "../eventTypes.ts";
import { evaluateEvent2G1A } from "../publicBoundary.ts";
import { runCompileChecks } from "../compileCheck.ts";

// ─── Test record interfaces ───
export interface AuditTestRecord {
  test_id: string;
  test_name: string;
  assertion: string;
  passed: boolean;
  expected: string;
  actual: string;
  notes?: string;
}

export interface AuditRunResult {
  results: AuditTestRecord[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    placeholder_passes: number;
    duplicate_ids: number;
    missing_ids: number;
    failed_ids: string[];
  };
}

// ─── Stable serialization for deep comparison ───
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k])).join(",") + "}";
}

// ─── Independent deep clone (JSON-based, no reference to impl clone) ───
export function deepCloneState(state: DomainState): DomainState {
  return JSON.parse(JSON.stringify(state));
}

// ─── Deep equality (state unchanged verification) ───
export function statesEqual(a: DomainState, b: DomainState): boolean {
  return stableStringify(a) === stableStringify(b);
}

// ─── Base state factory (per contract §3 Domain State Contracts) ───
// Positions per §3.2 per-kind location rules.
// Company ownership per §3.3 reconciliation rule.
export function makeBaseState(): DomainState {
  return {
    state_revision: 1,
    items: {
      "ITEM-001": {
        item_id: "ITEM-001",
        governed_tracking_mode: "ordinary",
        governed_unit: "ea",
        valuation_method: null,
      },
      "ITEM-002": {
        item_id: "ITEM-002",
        governed_tracking_mode: "ordinary",
        governed_unit: "ea",
        valuation_method: null,
      },
    },
    positions: {
      "POS-WH": {
        position_id: "POS-WH",
        item_id: "ITEM-001",
        position_kind: "physical_warehouse",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 100,
        warehouse_location_id: "WH-001",
        bin_location_id: null,
        job_id: null,
        transfer_id: null,
        terminal_reference: null,
      },
      "POS-WH-2": {
        position_id: "POS-WH-2",
        item_id: "ITEM-002",
        position_kind: "physical_warehouse",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 50,
        warehouse_location_id: "WH-001",
        bin_location_id: null,
        job_id: null,
        transfer_id: null,
        terminal_reference: null,
      },
      "POS-TRUCK": {
        position_id: "POS-TRUCK",
        item_id: "ITEM-001",
        position_kind: "physical_truck",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 0,
        warehouse_location_id: "WH-001",
        bin_location_id: null,
        job_id: null,
        transfer_id: null,
        terminal_reference: null,
      },
      "POS-JOB": {
        position_id: "POS-JOB",
        item_id: "ITEM-001",
        position_kind: "custody_job",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 0,
        warehouse_location_id: null,
        bin_location_id: null,
        job_id: "JOB-001",
        transfer_id: null,
        terminal_reference: null,
      },
      "POS-IN-TRANSIT": {
        position_id: "POS-IN-TRANSIT",
        item_id: "ITEM-001",
        position_kind: "logical_in_transit",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 0,
        warehouse_location_id: null,
        bin_location_id: null,
        job_id: null,
        transfer_id: "T-INIT",
        terminal_reference: null,
      },
      "POS-TERMINAL": {
        position_id: "POS-TERMINAL",
        item_id: "ITEM-001",
        position_kind: "terminal_job_cost",
        ownership_class: "company_owned",
        origin_class: "none",
        condition_class: "available",
        restriction_class: "none",
        position_quantity: 0,
        warehouse_location_id: null,
        bin_location_id: null,
        job_id: "JOB-001",
        transfer_id: null,
        terminal_reference: "TERM-001",
      },
    },
    company_ownership: {
      "ITEM-001": { item_id: "ITEM-001", company_owned_quantity: 100 },
      "ITEM-002": { item_id: "ITEM-002", company_owned_quantity: 50 },
    },
    transfers_outstanding: {},
    correction_provenance: {},
    job_issue_progress: {},
    transactions: {},
    cutoff: { cutoff_time: "2026-01-01T00:00:00Z", freeze_status: "none" },
  };
}

// ─── Event counter for unique IDs ───
let eventCounter = 0;
export function resetEventCounter(): void { eventCounter = 0; }

// ─── Source document type mapping (per §5 payload contracts) ───
function getDocType(eventType: EventType2G1A): SourceDocumentType2G1A {
  if (eventType.startsWith("po.")) return "purchase_order";
  if (eventType.startsWith("receipt.")) return "receipt";
  if (eventType.startsWith("transfer.")) return "transfer";
  if (eventType.startsWith("adjustment.")) return "adjustment";
  if (eventType === "job_material.issued") return "job_material_issue";
  if (eventType === "job_material.consumed" || eventType === "consumption.reversed") return "consumption";
  if (eventType === "remnant.same_item_returned") return "remnant";
  if (eventType.startsWith("count.")) return "count";
  return "adjustment";
}

// ─── Raw event factory (per §5 payload contracts) ───
// Creates structurally valid raw events for evaluateEvent2G1A.
// Adds required-nullable defaults (purchase_order_id, cost) per §5.1.
export function mkEvent(
  eventType: EventType2G1A,
  fields: Record<string, unknown>
): Record<string, unknown> {
  eventCounter++;
  const id = `EVT-${eventCounter}`;
  const idem = `IDEM-${eventCounter}`;
  const base: Record<string, unknown> = {
    event_id: id,
    event_type: eventType,
    transaction_time: "2026-01-01T10:00:00Z",
    posting_time: "2026-01-01T10:00:01Z",
    source_document_type: getDocType(eventType),
    source_document_id: `DOC-${eventCounter}`,
    source_document_number: null,
    idempotency_key: idem,
    requester: "audit-requester",
    causation_id: null,
    correlation_id: null,
    notes: "",
  };
  // Add event-specific fields
  for (const [k, v] of Object.entries(fields)) {
    base[k] = v;
  }
  // Required-nullable defaults per §5.1 (key required, value may be null)
  if (eventType === "receipt.posted" && !("purchase_order_id" in base)) {
    base.purchase_order_id = null;
  }
  if ((eventType === "receipt.posted" || eventType === "job_material.consumed") && !("cost" in base)) {
    base.cost = null;
  }
  return base;
}

// ─── Insert accepted transaction (for setup, not via evaluator) ───
export function insertAcceptedTxn(
  state: DomainState,
  event: Record<string, unknown>
): void {
  const idem = (event.idempotency_key as string) ?? `IDEM-${Object.keys(state.transactions).length + 1}`;
  const recordId = `AER-${idem}-${state.state_revision}`;
  state.transactions[recordId] = {
    record_id: recordId,
    event,
    state_effects: [],
    recorded_operations: [],
    immutable_facts: [],
    classification_results: [],
    derived_result_snapshots: [],
    notes: "",
    evaluation_timestamp: "2026-01-01T10:00:00Z",
    idempotency_key: idem,
    canonical_state_revision: state.state_revision,
    formula_version: "2g1a-v1.0.0",
  };
}

// ─── Insert correction provenance (for setup) ───
export function insertProv(
  state: DomainState,
  partial: {
    record_id: string;
    original_event_type: "receipt.posted" | "adjustment.posted" | "job_material.issued" | "job_material.consumed";
    original_event_id: string;
    original_item_id: string;
    original_position_id: string;
    original_signed_delta: number;
    related_issue_event_id: string | null;
  }
): void {
  const abs = Math.abs(partial.original_signed_delta);
  state.correction_provenance[partial.record_id] = {
    record_id: partial.record_id,
    original_event_type: partial.original_event_type,
    original_event_id: partial.original_event_id,
    original_item_id: partial.original_item_id,
    original_position_id: partial.original_position_id,
    original_signed_delta: partial.original_signed_delta,
    original_absolute_quantity: abs,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: abs,
    related_issue_event_id: partial.related_issue_event_id,
    blocking_downstream_event_ids: [],
  };
}

// ─── Insert JobIssueProgress (for setup) ───
// Per §3.6: also moves quantity from POS-WH to job custody position
// and inserts an accepted E32 transaction so E37/E34 can find it.
export function insertIssue(
  state: DomainState,
  partial: {
    issue_event_id: string;
    item_id: string;
    job_custody_position_id: string;
    issued_quantity: number;
  }
): void {
  const issued = partial.issued_quantity;
  state.job_issue_progress[partial.issue_event_id] = {
    issue_event_id: partial.issue_event_id,
    item_id: partial.item_id,
    job_custody_position_id: partial.job_custody_position_id,
    issued_quantity: issued,
    consumed_quantity: 0,
    returned_quantity: 0,
    outstanding_quantity: issued,
    status: "open",
    created_revision: state.state_revision,
    last_updated_revision: state.state_revision,
  };
  // Insert accepted E32 transaction (per §17: E37 lookup via issue_id → E32 event_id → JobIssueProgress)
  const e32 = mkEvent("job_material.issued", {
    issue_id: partial.issue_event_id,
    source_position_id: "POS-WH",
    job_custody_position_id: partial.job_custody_position_id,
    item_id: partial.item_id,
    quantity: issued,
    unit_of_measure: "ea",
  });
  e32.event_id = partial.issue_event_id;
  insertAcceptedTxn(state, e32);
  // Move quantity from POS-WH to job custody (simulating E32's PositionQuantityEffect)
  const jobPos = state.positions[partial.job_custody_position_id];
  if (jobPos) {
    jobPos.position_quantity += issued;
    const sourcePos = state.positions["POS-WH"];
    if (sourcePos && sourcePos.item_id === partial.item_id) {
      sourcePos.position_quantity -= issued;
    }
  }
}

// ─── Run event sequence (returns state after last accepted event) ───
export function runSeq(
  state: DomainState,
  ...events: Record<string, unknown>[]
): { state: DomainState; results: DomainResult2G1A[] } {
  let current = state;
  const results: DomainResult2G1A[] = [];
  for (const evt of events) {
    const r = evaluateEvent2G1A(evt, current);
    results.push(r);
    if (r.ok) {
      current = r.proposed_state;
    }
  }
  return { state: current, results };
}

// ─── Get rejection code from result ───
export function getRejCode(result: DomainResult2G1A): string {
  if (result.ok) return "ACCEPTED";
  const errors = (result as { errors: { error_code: string }[] }).errors;
  if (errors.length === 0) return "NO_ERROR";
  return errors[0].error_code;
}

// ─── Test helpers: accepted ───
export function acc(
  id: string, name: string, assertion: string,
  result: DomainResult2G1A, extra?: string
): AuditTestRecord {
  const actual = result.ok ? (extra ? `ok=true, ${extra}` : "ok=true") : "ok=false";
  return {
    test_id: id, test_name: name, assertion,
    passed: result.ok, expected: "ok=true", actual,
  };
}

// ─── Test helpers: rejected ───
export function rej(
  id: string, name: string, assertion: string,
  result: DomainResult2G1A, expectedCode: string
): AuditTestRecord {
  const code = getRejCode(result);
  const passed = !result.ok && code === expectedCode;
  return {
    test_id: id, test_name: name, assertion,
    passed, expected: expectedCode, actual: code,
  };
}

// ─── Test helpers: rejected with zero-mutation proof ───
export function rejZm(
  id: string, name: string, assertion: string,
  result: DomainResult2G1A, expectedCode: string,
  beforeState: DomainState, afterState: DomainState
): AuditTestRecord {
  const code = getRejCode(result);
  const codeMatch = !result.ok && code === expectedCode;
  const stateUnchanged = statesEqual(beforeState, afterState);
  const passed = codeMatch && stateUnchanged;
  return {
    test_id: id, test_name: name, assertion,
    passed,
    expected: `${expectedCode} + state_unchanged`,
    actual: `${code} + state_${stateUnchanged ? "unchanged" : "MUTATED"}`,
    notes: stateUnchanged ? undefined : "STATE WAS MUTATED ON REJECTION",
  };
}

// ─── Test helpers: truth assertion ───
export function tr(
  id: string, name: string, assertion: string,
  condition: boolean, expected: string, actual: string
): AuditTestRecord {
  return {
    test_id: id, test_name: name, assertion,
    passed: condition, expected, actual,
  };
}

// ─── Run compile checks ───
export { runCompileChecks };