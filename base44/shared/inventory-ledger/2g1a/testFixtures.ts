// ═════════════════════════════════════════════════════════════════
// 2G1-A TEST FIXTURES — Pure helpers for the isolated test suite.
// No SDK, no network, no production deps. Sibling imports only.
// ═════════════════════════════════════════════════════════════════

import type { DomainState, AcceptedEventRecord, CorrectionProvenanceRecord, JobIssueProgress } from "./domainState.ts";
import { cloneDomainState } from "./domainState.ts";
import type { EventType2G1A, DomainErrorCode2G1A } from "./eventTypes.ts";
import type { DomainResult2G1A } from "./resultTypes.ts";
import { evaluateEvent2G1A } from "./publicBoundary.ts";

// ─── Test record types ───
export interface TestRecord {
  test_id: string;
  test_name: string;
  pass: boolean;
  assertion: string;
  actual: string;
  expected: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  placeholder_passes: number;
  failed_ids: string[];
}

export interface TestRunResult {
  summary: TestSummary;
  results: TestRecord[];
}

// ─── tr: test record factory (assertion before pass; expected_short overrides expected) ───
export function tr(test_id: string, test_name: string, assertion: string, pass: boolean, expected: string, actual: string, expected_short?: string): TestRecord {
  return { test_id, test_name, pass, assertion, actual, expected: expected_short ?? expected };
}

// ─── makeBaseState: standard DomainState for testing ───
export function makeBaseState(): DomainState {
  return {
    state_revision: 1,
    items: {
      "ITEM-001": { item_id: "ITEM-001", governed_tracking_mode: "ordinary", governed_unit: "ea", valuation_method: null },
    },
    positions: {
      "POS-WH": { position_id: "POS-WH", item_id: "ITEM-001", position_kind: "physical_warehouse", ownership_class: "company_owned", origin_class: "vendor_receipt", condition_class: "available", restriction_class: "none", position_quantity: 100, warehouse_location_id: "WH-001", bin_location_id: "BIN-001", job_id: null, transfer_id: null, terminal_reference: null },
      "POS-TRUCK": { position_id: "POS-TRUCK", item_id: "ITEM-001", position_kind: "physical_truck", ownership_class: "company_owned", origin_class: "transfer_in", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: null, bin_location_id: null, job_id: null, transfer_id: null, terminal_reference: null },
      "POS-JOB": { position_id: "POS-JOB", item_id: "ITEM-001", position_kind: "custody_job", ownership_class: "company_owned", origin_class: "unresolved", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: null, bin_location_id: null, job_id: "JOB-001", transfer_id: null, terminal_reference: null },
      "POS-IN-TRANSIT": { position_id: "POS-IN-TRANSIT", item_id: "ITEM-001", position_kind: "logical_in_transit", ownership_class: "company_owned", origin_class: "unresolved", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: null, bin_location_id: null, job_id: null, transfer_id: null, terminal_reference: null },
      "POS-TERMINAL": { position_id: "POS-TERMINAL", item_id: "ITEM-001", position_kind: "terminal_job_cost", ownership_class: "company_owned", origin_class: "none", condition_class: "available", restriction_class: "none", position_quantity: 0, warehouse_location_id: null, bin_location_id: null, job_id: "JOB-001", transfer_id: null, terminal_reference: "JOB-001" },
    },
    company_ownership: {
      "ITEM-001": { item_id: "ITEM-001", company_owned_quantity: 100 },
    },
    transfers_outstanding: {},
    correction_provenance: {},
    job_issue_progress: {},
    transactions: {},
    cutoff: { cutoff_time: "2025-01-01T00:00:00Z", freeze_status: "none" },
  };
}

// ─── inferDocType: map event_type to source_document_type ───
function inferDocType(eventType: EventType2G1A): string {
  if (eventType.startsWith("po.")) return "purchase_order";
  if (eventType.startsWith("receipt.")) return "receipt";
  if (eventType.startsWith("transfer.")) return "transfer";
  if (eventType.startsWith("adjustment.")) return "adjustment";
  if (eventType === "job_material.issued") return "job_material_issue";
  if (eventType === "job_material.consumed") return "consumption";
  if (eventType.startsWith("consumption.")) return "consumption";
  if (eventType.startsWith("remnant.")) return "remnant";
  if (eventType.startsWith("count.")) return "count";
  return "receipt";
}

// ─── mkEvent: create a raw event input with all required base fields ───
let eventCounter = 0;
export function mkEvent(eventType: EventType2G1A, fields: Record<string, unknown>): Record<string, unknown> {
  eventCounter++;
  const id = fields.event_id as string ?? `EVT-${eventCounter}`;
  const idem = fields.idempotency_key as string ?? `IDEM-${eventCounter}`;
  const base: Record<string, unknown> = {
    event_id: id,
    event_type: eventType,
    transaction_time: "2025-01-01T12:00:00Z",
    posting_time: "2025-01-01T12:00:01Z",
    source_document_type: inferDocType(eventType),
    source_document_id: `DOC-${eventCounter}`,
    source_document_number: null,
    idempotency_key: idem,
    requester: "test-requester",
    causation_id: null,
    correlation_id: null,
    notes: "",
  };
  const skip = new Set(["event_id","event_type","transaction_time","posting_time","source_document_type","source_document_id","source_document_number","idempotency_key","requester","causation_id","correlation_id","notes"]);
  for (const [k, v] of Object.entries(fields)) {
    if (!skip.has(k)) base[k] = v;
  }
  // Add null defaults for nullable required fields (must be present as keys)
  const nullableDefaults: Record<string, unknown> = {};
  if (eventType === "receipt.posted") { nullableDefaults.purchase_order_id = null; nullableDefaults.cost = null; }
  if (eventType === "job_material.consumed") { nullableDefaults.cost = null; }
  for (const [k, v] of Object.entries(nullableDefaults)) {
    if (!(k in base)) base[k] = v;
  }
  return base;
}

// ─── insertAcceptedTxn: insert an AcceptedEventRecord into state ───
export function insertAcceptedTxn(state: DomainState, event: Record<string, unknown>): void {
  const idem = event.idempotency_key as string;
  const recordId = `AER-${idem}-${state.state_revision}`;
  const record: AcceptedEventRecord = {
    record_id: recordId,
    event,
    state_effects: [],
    recorded_operations: [],
    immutable_facts: [],
    classification_results: [],
    derived_result_snapshots: [],
    notes: "",
    evaluation_timestamp: "2025-01-01T12:00:00Z",
    idempotency_key: idem,
    canonical_state_revision: state.state_revision,
    formula_version: "2g1a-v1.0.0",
  };
  state.transactions[recordId] = record;
}

// ─── insertProv: insert a CorrectionProvenanceRecord into state ───
export function insertProv(state: DomainState, partial: Partial<CorrectionProvenanceRecord> & { record_id: string }): void {
  const rec: CorrectionProvenanceRecord = {
    record_id: partial.record_id,
    original_event_type: partial.original_event_type ?? "receipt.posted",
    original_event_id: partial.original_event_id ?? "",
    original_item_id: partial.original_item_id ?? "ITEM-001",
    original_position_id: partial.original_position_id ?? "POS-WH",
    original_signed_delta: partial.original_signed_delta ?? 10,
    original_absolute_quantity: partial.original_absolute_quantity ?? 10,
    reversed_absolute_quantity: partial.reversed_absolute_quantity ?? 0,
    remaining_reversible_quantity: partial.remaining_reversible_quantity ?? 10,
    related_issue_event_id: partial.related_issue_event_id ?? null,
    blocking_downstream_event_ids: partial.blocking_downstream_event_ids ?? [],
  };
  state.correction_provenance[partial.record_id] = rec;
}

// ─── insertIssue: insert a JobIssueProgress into state ───
export function insertIssue(state: DomainState, partial: Partial<JobIssueProgress> & { issue_event_id: string }): void {
  const issued = partial.issued_quantity ?? 10;
  const consumed = partial.consumed_quantity ?? 0;
  const returned = partial.returned_quantity ?? 0;
  const outstanding = partial.outstanding_quantity ?? (issued - consumed - returned);
  const issue: JobIssueProgress = {
    issue_event_id: partial.issue_event_id,
    item_id: partial.item_id ?? "ITEM-001",
    job_custody_position_id: partial.job_custody_position_id ?? "POS-JOB",
    issued_quantity: issued,
    consumed_quantity: consumed,
    returned_quantity: returned,
    outstanding_quantity: outstanding,
    status: partial.status ?? (outstanding > 0 ? "open" : "closed"),
    created_revision: partial.created_revision ?? state.state_revision,
    last_updated_revision: partial.last_updated_revision ?? state.state_revision,
  };
  state.job_issue_progress[partial.issue_event_id] = issue;
  // Also insert an accepted E32 transaction so E37/E34 can find it via findAcceptedTransactions
  const e32 = mkEvent("job_material.issued", {
    issue_id: partial.issue_event_id,
    source_position_id: "POS-WH",
    job_custody_position_id: issue.job_custody_position_id,
    item_id: issue.item_id,
    quantity: issued,
    unit_of_measure: "ea",
  });
  e32.event_id = partial.issue_event_id;
  insertAcceptedTxn(state, e32);
  // Move quantity from POS-WH to job custody position (simulating E32 effect)
  const jobPos = state.positions[issue.job_custody_position_id];
  if (jobPos) {
    jobPos.position_quantity += issued;
    const sourcePos = state.positions["POS-WH"];
    if (sourcePos && sourcePos.item_id === issue.item_id) {
      sourcePos.position_quantity -= issued;
    }
  }
}

// ─── deepEqual: structural deep comparison ───
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

// ─── runSeq: run event and return proposed state if accepted ───
export function runSeq(state: DomainState, event: Record<string, unknown>): { result: DomainResult2G1A; state: DomainState } {
  const result = evaluateEvent2G1A(event, state);
  if (result.ok) {
    return { result, state: result.proposed_state };
  }
  return { result, state };
}

// ─── getRejCode: extract rejection code from result ───
export function getRejCode(result: DomainResult2G1A): string {
  if (!result.ok && (result as { errors: unknown[] }).errors.length > 0) {
    return (result as { errors: { error_code: string }[] }).errors[0].error_code;
  }
  return "";
}

// ─── zm: zero-mutation test — clone, run, assert code, deep-compare ───
export function zm(
  state: DomainState,
  event: Record<string, unknown>,
  expectedCode: string
): { code: string; zeroMut: boolean; codeMatch: boolean } {
  const snapshot = cloneDomainState(state);
  const result = evaluateEvent2G1A(event, state);
  const zeroMut = deepEqual(state, snapshot);
  const code = getRejCode(result);
  const codeMatch = code === expectedCode;
  return { code, zeroMut, codeMatch };
}