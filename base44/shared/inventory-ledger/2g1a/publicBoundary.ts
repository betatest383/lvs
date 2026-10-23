// ═════════════════════════════════════════════════════════════════
// 2G1-A PUBLIC PARSER/EVALUATOR BOUNDARY
// evaluateEvent2G1A(rawInput: unknown, state: DomainState): DomainResult2G1A
//
// Pure function: no SDK, no network, no I/O, no mutation of input state.
// Module is isolated and unreachable from production.
// ═════════════════════════════════════════════════════════════════

import type {
  EventType2G1A, DomainErrorCode2G1A, ErrorCategory2G1A,
} from "./eventTypes.ts";
import {
  E1_E55_REGISTER, AUTHORIZED_2G1A_EVENTS, RECOGNIZED_COST_SOURCES,
} from "./eventTypes.ts";
import type {
  DomainState, DomainPosition, DomainItem,
  TransferOutstanding, CorrectionProvenanceRecord, JobIssueProgress,
  AcceptedEventRecord,
} from "./domainState.ts";
import {
  cloneDomainState, getPosition, getItem, findOpenIssue,
  findIssueByEventId, findProvenanceByOriginalEventId, findAcceptedTransactions,
} from "./domainState.ts";
import type { DomainEvent2G1A, E5Payload, E33Payload } from "./payloads.ts";
import type { RawCostInput2G1A, SuppliedCost2G1A, CostPreservationResult } from "./valuationRules.ts";
import { parseCost, buildCostPreservation } from "./valuationRules.ts";
import type {
  PositionQuantityEffect, CompanyOwnedEffect,
  ConditionReclassification, RestrictionReclassification,
  CanonicalStateEffect2G1A,
} from "./quantityEffects.ts";
import type {
  AtomicRecordOperation2G1A, RecordedDomainOperation2G1A,
  TransferOutstandingCreatedOp, TransferOutstandingReceivedOp,
  CorrectionProvenanceCreatedOp, CorrectionProvenanceReversalUpdatedOp,
  CorrectionProvenanceDownstreamBlockUpdatedOp,
  JobIssueProgressCreatedOp, JobIssueConsumedUpdatedOp,
  JobIssueConsumedReversedOp, JobIssueReturnedUpdatedOp,
  AcceptedEventRecordInsertedOp, StateRevisionAdvancedOp,
} from "./atomicRecordOps.ts";
import type {
  ClassificationResult2G1A, DerivedResultSnapshot2G1A,
} from "./classificationResults.ts";
import type {
  DomainResult2G1A, AcceptedDomainResult, RejectedDomainResult,
  DomainError, DomainWarning,
} from "./resultTypes.ts";
import { makeError, makeWarning, makeRejected, FORMULA_VERSION } from "./resultTypes.ts";
import { isFiniteNumber, isPositiveFinite, isNonNegativeFinite } from "./unitOfMeasureRules.ts";
import {
  sortEffects, sortOperations, sortErrors, sortWarnings,
} from "./comparator.ts";
import { validateAllInvariants } from "./invariantValidators.ts";

// ─── Internal computation context ───
interface EvalContext {
  event: DomainEvent2G1A;
  state: DomainState;
  effects: CanonicalStateEffect2G1A[];
  operations: AtomicRecordOperation2G1A[];
  recordedOps: RecordedDomainOperation2G1A[];
  immutableFacts: CostPreservationResult[];
  classifications: ClassificationResult2G1A[];
  derivedSnapshots: DerivedResultSnapshot2G1A[];
  warnings: DomainWarning[];
  errors: DomainError[];
  beforeRevision: number;
  afterRevision: number;
}

function ctx(event: DomainEvent2G1A, state: DomainState): EvalContext {
  return {
    event,
    state,
    effects: [],
    operations: [],
    recordedOps: [],
    immutableFacts: [],
    classifications: [],
    derivedSnapshots: [],
    warnings: [],
    errors: [],
    beforeRevision: state.state_revision,
    afterRevision: state.state_revision + 1,
  };
}

// ─── Main entry point ───
export function evaluateEvent2G1A(rawInput: unknown, state: DomainState): DomainResult2G1A {
  const now = new Date().toISOString();

  // ═══ STAGE B: Discriminator recognition (Rule A) ═══
  if (rawInput === null || rawInput === undefined) {
    return makeRejected(
      [makeError("VALIDATION.NULL_EVENT_INPUT", "validation", "Null event input", "<unknown>")],
      [], "<unknown>", null
    );
  }
  if (typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return makeRejected(
      [makeError("VALIDATION.NON_OBJECT_INPUT", "validation", "Non-object input", "<unknown>")],
      [], "<unknown>", null
    );
  }

  const raw = rawInput as Record<string, unknown>;
  const eventTypeRaw = raw.event_type;

  if (typeof eventTypeRaw !== "string") {
    return makeRejected(
      [makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", "Missing event_type field", "<unknown>", { affected_field: "event_type" })],
      [], "<unknown>", null
    );
  }

  // Known deferred discriminator? (recognized but payload NOT parsed)
  if (E1_E55_REGISTER.has(eventTypeRaw) && !AUTHORIZED_2G1A_EVENTS.has(eventTypeRaw as EventType2G1A)) {
    return makeRejected(
      [makeError(
        "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE",
        "authorization",
        `Event type ${eventTypeRaw} is outside 2G1-A scope (recognized as known deferred discriminator; payload NOT parsed)`,
        "<unknown>",
        { safe_context: { event_type: eventTypeRaw } }
      )],
      [], "<unknown>", null
    );
  }

  // Unknown discriminator?
  if (!AUTHORIZED_2G1A_EVENTS.has(eventTypeRaw as EventType2G1A)) {
    return makeRejected(
      [makeError(
        "VALIDATION.UNKNOWN_EVENT_TYPE",
        "unknown_event",
        `Unknown event type: ${eventTypeRaw}`,
        "<unknown>",
        { safe_context: { event_type: eventTypeRaw } }
      )],
      [], "<unknown>", null
    );
  }

  const eventType = eventTypeRaw as EventType2G1A;

  // ═══ STAGE C: Structural validation ═══
  const structResult = validateStructure(raw, eventType);
  if (structResult.errors.length > 0) {
    return makeRejected(sortErrors(structResult.errors), sortWarnings(structResult.warnings), eventType, (raw.idempotency_key as string) ?? null);
  }

  // ═══ STAGE D: Cost parsing (E5, E33 only) ═══
  let suppliedCost: SuppliedCost2G1A | null = null;
  const warnings: DomainWarning[] = [];
  let costError: DomainError | null = null;

  if (eventType === "receipt.posted" || eventType === "job_material.consumed") {
    const costRaw = raw.cost;
    if (costRaw === null || costRaw === undefined) {
      // Accept with warning, no CostPreservationResult
      warnings.push(makeWarning("VAL.UNRESOLVED_COST_WARNING", "Cost not supplied; no authoritative valuation created", eventType, "cost"));
      suppliedCost = null;
    } else if (typeof costRaw === "object" && !Array.isArray(costRaw)) {
      const c = costRaw as Record<string, unknown>;
      // Validate cost_source exists
      if (c.cost_source === undefined || c.cost_source === null) {
        return makeRejected(
          [makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", "Missing cost_source property", eventType, { affected_field: "cost_source" })],
          [], eventType, (raw.idempotency_key as string) ?? null
        );
      }
      if (typeof c.cost_source !== "string") {
        return makeRejected(
          [makeError("VALIDATION.INVALID_ENUM_VALUE", "validation", "cost_source must be a string", eventType, { affected_field: "cost_source" })],
          [], eventType, (raw.idempotency_key as string) ?? null
        );
      }
      // Check for unknown keys on cost object
      const allowedCostKeys = new Set(["cost_source", "unit_cost", "currency"]);
      for (const k of Object.keys(c)) {
        if (!allowedCostKeys.has(k)) {
          return makeRejected(
            [makeError("VALIDATION.UNKNOWN_PAYLOAD_KEY", "validation", `Unknown key on cost object: ${k}`, eventType, { affected_field: k })],
            [], eventType, (raw.idempotency_key as string) ?? null
          );
        }
      }
      const rawCost: RawCostInput2G1A = {
        cost_source: c.cost_source,
        unit_cost: c.unit_cost as number,
        currency: c.currency as "USD",
      };
      const parseResult = parseCost(rawCost);
      if (!parseResult.ok) {
        costError = makeError(parseResult.rejection_code, "valuation", `Cost source rejected: ${c.cost_source}`, eventType, { affected_field: "cost_source", safe_context: { cost_source: c.cost_source } });
      } else {
        suppliedCost = parseResult.supplied_cost;
      }
    } else {
      return makeRejected(
        [makeError("VALIDATION.INVALID_ENUM_VALUE", "validation", "cost must be an object or null", eventType, { affected_field: "cost" })],
        [], eventType, (raw.idempotency_key as string) ?? null
      );
    }
  }

  if (costError) {
    return makeRejected([costError], [], eventType, (raw.idempotency_key as string) ?? null);
  }

  // ═══ STAGE E: DomainEvent2G1A construction ═══
  const event = buildDomainEvent(raw, eventType, suppliedCost);
  if (!event) {
    return makeRejected(
      [makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", "Failed to construct domain event", eventType)],
      [], eventType, (raw.idempotency_key as string) ?? null
    );
  }

  // ═══ STAGE F: Referenced-state validation, computation, application ═══
  return processEvent(event, state, suppliedCost, warnings, now);
}

// ─── Structural validation ───
interface StructResult {
  errors: DomainError[];
  warnings: DomainWarning[];
}

const BASE_REQUIRED_FIELDS = [
  "event_id", "event_type", "transaction_time", "posting_time",
  "source_document_type", "source_document_id", "idempotency_key",
  "requester", "notes",
];
// These are required-nullable: key required, value may be null
const BASE_NULLABLE_FIELDS = ["source_document_number", "causation_id", "correlation_id"];

const VALID_SOURCE_DOC_TYPES = new Set([
  "purchase_order", "receipt", "transfer", "adjustment",
  "job_material_issue", "consumption", "remnant", "count",
]);

function validateStructure(raw: Record<string, unknown>, eventType: EventType2G1A): StructResult {
  const errors: DomainError[] = [];

  // Validate base required fields
  for (const f of BASE_REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null) {
      errors.push(makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${f}`, eventType, { affected_field: f }));
    }
  }
  // Validate required-nullable fields (key must be present, value can be null)
  for (const f of BASE_NULLABLE_FIELDS) {
    if (!(f in raw)) {
      errors.push(makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${f}`, eventType, { affected_field: f }));
    }
  }
  // Validate source_document_type enum
  if (typeof raw.source_document_type === "string" && !VALID_SOURCE_DOC_TYPES.has(raw.source_document_type)) {
    errors.push(makeError("VALIDATION.INVALID_ENUM_VALUE", "validation", `Invalid source_document_type: ${raw.source_document_type}`, eventType, { affected_field: "source_document_type" }));
  }

  // Validate event-specific required fields
  const eventFields = getEventRequiredFields(eventType);
  for (const [field, fieldType] of eventFields) {
    if (fieldType === "nullable") {
      // Required key, value may be null
      if (!(field in raw)) {
        errors.push(makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${field}`, eventType, { affected_field: field }));
      }
    } else if (fieldType === "required") {
      if (raw[field] === undefined || raw[field] === null) {
        errors.push(makeError("VALIDATION.MISSING_REQUIRED_FIELD", "validation", `Missing required field: ${field}`, eventType, { affected_field: field }));
      }
    }
  }

  // Check for unknown top-level keys
  const allowedKeys = getEventAllowedKeys(eventType);
  for (const k of Object.keys(raw)) {
    if (!allowedKeys.has(k)) {
      errors.push(makeError("VALIDATION.UNKNOWN_PAYLOAD_KEY", "validation", `Unknown payload key: ${k}`, eventType, { affected_field: k }));
    }
  }

  return { errors, warnings: [] };
}

function getEventRequiredFields(eventType: EventType2G1A): [string, "required" | "nullable"][] {
  switch (eventType) {
    case "po.created": return [["purchase_order_id", "required"], ["vendor_id", "required"], ["lines", "required"]];
    case "po.approved": return [["purchase_order_id", "required"]];
    case "po.sent": return [["purchase_order_id", "required"]];
    case "po.line.opened": return [["purchase_order_id", "required"], ["line_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"]];
    case "receipt.posted": return [["purchase_order_id", "nullable"], ["receipt_id", "required"], ["destination_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"], ["cost", "nullable"]];
    case "receipt.reversed": return [["original_receipt_id", "required"], ["reversal_quantity", "required"]];
    case "transfer.dispatched": return [["transfer_id", "required"], ["source_position_id", "required"], ["in_transit_position_id", "required"], ["destination_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"]];
    case "transfer.received": return [["transfer_id", "required"], ["destination_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"]];
    case "adjustment.requested": return [["adjustment_request_id", "required"], ["position_id", "required"], ["item_id", "required"], ["proposed_delta", "required"], ["reason_text", "required"]];
    case "adjustment.posted": return [["adjustment_id", "required"], ["position_id", "required"], ["item_id", "required"], ["delta", "required"], ["authority_marker", "required"]];
    case "adjustment.reversed": return [["original_adjustment_id", "required"], ["reversal_quantity", "required"]];
    case "adjustment.reclassification": return [["position_id", "required"], ["item_id", "required"], ["new_condition", "required"], ["new_restriction", "required"]];
    case "job_material.issued": return [["issue_id", "required"], ["source_position_id", "required"], ["job_custody_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"]];
    case "job_material.consumed": return [["consumption_id", "required"], ["job_custody_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"], ["cost", "nullable"], ["authority_marker", "required"]];
    case "consumption.reversed": return [["original_consumption_id", "required"], ["reversal_quantity", "required"]];
    case "remnant.same_item_returned": return [["return_id", "required"], ["original_issue_id", "required"], ["source_position_id", "required"], ["destination_position_id", "required"], ["item_id", "required"], ["quantity", "required"], ["unit_of_measure", "required"]];
    case "count.observation": return [["count_session_id", "required"], ["position_id", "required"], ["item_id", "required"], ["observed_quantity", "required"]];
    case "count.variance.resolved": return [["count_session_id", "required"], ["position_id", "required"], ["item_id", "required"], ["counted_quantity", "required"], ["authority_marker", "required"]];
  }
}

function getEventAllowedKeys(eventType: EventType2G1A): Set<string> {
  const base = new Set([
    ...BASE_REQUIRED_FIELDS, ...BASE_NULLABLE_FIELDS,
  ]);
  switch (eventType) {
    case "po.created": base.add("purchase_order_id"); base.add("vendor_id"); base.add("lines"); break;
    case "po.approved": base.add("purchase_order_id"); break;
    case "po.sent": base.add("purchase_order_id"); break;
    case "po.line.opened": base.add("purchase_order_id"); base.add("line_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); break;
    case "receipt.posted": base.add("purchase_order_id"); base.add("receipt_id"); base.add("destination_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); base.add("cost"); break;
    case "receipt.reversed": base.add("original_receipt_id"); base.add("reversal_quantity"); break;
    case "transfer.dispatched": base.add("transfer_id"); base.add("source_position_id"); base.add("in_transit_position_id"); base.add("destination_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); break;
    case "transfer.received": base.add("transfer_id"); base.add("destination_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); break;
    case "adjustment.requested": base.add("adjustment_request_id"); base.add("position_id"); base.add("item_id"); base.add("proposed_delta"); base.add("reason_text"); break;
    case "adjustment.posted": base.add("adjustment_id"); base.add("position_id"); base.add("item_id"); base.add("delta"); base.add("authority_marker"); break;
    case "adjustment.reversed": base.add("original_adjustment_id"); base.add("reversal_quantity"); break;
    case "adjustment.reclassification": base.add("position_id"); base.add("item_id"); base.add("new_condition"); base.add("new_restriction"); break;
    case "job_material.issued": base.add("issue_id"); base.add("source_position_id"); base.add("job_custody_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); break;
    case "job_material.consumed": base.add("consumption_id"); base.add("job_custody_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); base.add("cost"); base.add("authority_marker"); break;
    case "consumption.reversed": base.add("original_consumption_id"); base.add("reversal_quantity"); break;
    case "remnant.same_item_returned": base.add("return_id"); base.add("original_issue_id"); base.add("source_position_id"); base.add("destination_position_id"); base.add("item_id"); base.add("quantity"); base.add("unit_of_measure"); break;
    case "count.observation": base.add("count_session_id"); base.add("position_id"); base.add("item_id"); base.add("observed_quantity"); break;
    case "count.variance.resolved": base.add("count_session_id"); base.add("position_id"); base.add("item_id"); base.add("counted_quantity"); base.add("authority_marker"); break;
  }
  return base;
}

// ─── Build DomainEvent2G1A from raw ───
function buildDomainEvent(raw: Record<string, unknown>, eventType: EventType2G1A, suppliedCost: SuppliedCost2G1A | null): DomainEvent2G1A | null {
  const base: Record<string, unknown> = {
    event_id: raw.event_id,
    event_type: eventType,
    transaction_time: raw.transaction_time,
    posting_time: raw.posting_time,
    source_document_type: raw.source_document_type,
    source_document_id: raw.source_document_id,
    source_document_number: raw.source_document_number ?? null,
    idempotency_key: raw.idempotency_key,
    requester: raw.requester,
    causation_id: raw.causation_id ?? null,
    correlation_id: raw.correlation_id ?? null,
    notes: raw.notes ?? "",
  };
  // Copy event-specific fields
  const eventFields = getEventRequiredFields(eventType);
  for (const [field] of eventFields) {
    if (field === "cost") {
      base.cost = suppliedCost;
    } else {
      base[field] = raw[field];
    }
  }
  return base as unknown as DomainEvent2G1A;
}

// ─── Process event: compute effects, operations, apply, validate ───
function processEvent(
  event: DomainEvent2G1A,
  state: DomainState,
  suppliedCost: SuppliedCost2G1A | null,
  warnings: DomainWarning[],
  now: string
): DomainResult2G1A {
  const c = ctx(event, state);
  c.warnings.push(...warnings);
  const evt = event as unknown as Record<string, unknown>;
  const eventType = evt.event_type as EventType2G1A;

  // ─── Idempotency check ───
  const idemKey = evt.idempotency_key as string;
  for (const txnId of Object.keys(state.transactions)) {
    const txn = state.transactions[txnId];
    if (txn.idempotency_key === idemKey) {
      return makeRejected(
        [makeError("INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "commitment", `Duplicate idempotency key: ${idemKey}`, eventType, { affected_field: "idempotency_key", safe_context: { idempotency_key: idemKey } })],
        sortWarnings(c.warnings), eventType, idemKey
      );
    }
  }

  // ─── Event-specific processing ───
  const result = processEventSpecific(c, event, eventType, suppliedCost);
  if (result) return result; // early rejection

  // ─── Clone state and apply ───
  const cloned = cloneDomainState(state);
  c.state = cloned;

  // Apply effects to positions and company ownership
  for (const eff of c.effects) {
    applyEffect(cloned, eff);
  }

  // Apply operations to cloned state
  for (const op of c.operations) {
    applyOperation(cloned, op, c.afterRevision);
  }

  // ─── Invariant validation ───
  const invariantErrors = validateAllInvariants(cloned);
  if (invariantErrors.length > 0) {
    return makeRejected(sortErrors(invariantErrors), sortWarnings(c.warnings), eventType, idemKey);
  }

  // ─── Build AcceptedEventRecord ───
  const recordId = `AER-${idemKey}-${c.afterRevision}`;
  const record: AcceptedEventRecord = {
    record_id: recordId,
    event,
    state_effects: sortEffects(c.effects),
    recorded_operations: c.recordedOps,
    immutable_facts: c.immutableFacts,
    classification_results: c.classifications,
    derived_result_snapshots: c.derivedSnapshots,
    notes: "",
    evaluation_timestamp: now,
    idempotency_key: idemKey,
    canonical_state_revision: c.afterRevision,
    formula_version: FORMULA_VERSION,
  };

  // Nonrecursion assertion
  for (const op of c.recordedOps) {
    const opKind = (op as { op_kind: string }).op_kind;
    if (opKind === "accepted_event_record_inserted" || opKind === "state_revision_advanced") {
      return makeRejected(
        [makeError("INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "state", "Nonrecursion violation: applier-only op in recorded_operations", eventType)],
        sortWarnings(c.warnings), eventType, idemKey
      );
    }
  }

  // ─── AcceptedEventRecordInsertedOp ───
  const insertOp: AcceptedEventRecordInsertedOp = {
    op_kind: "accepted_event_record_inserted",
    record,
    before: null,
    after: { record_id: recordId },
  };
  c.operations.push(insertOp);
  cloned.transactions[recordId] = record;

  // ─── StateRevisionAdvancedOp ───
  const revOp: StateRevisionAdvancedOp = {
    op_kind: "state_revision_advanced",
    before_revision: c.beforeRevision,
    after_revision: c.afterRevision,
    before: { state_revision: c.beforeRevision },
    after: { state_revision: c.afterRevision },
  };
  c.operations.push(revOp);
  cloned.state_revision = c.afterRevision;

  // ─── Build accepted result ───
  const accepted: AcceptedDomainResult = {
    ok: true,
    event,
    proposed_state: cloned,
    state_effects: sortEffects(c.effects),
    atomic_record_operations: sortOperations(c.operations),
    immutable_facts: c.immutableFacts,
    classification_results: c.classifications,
    derived_result_snapshots: c.derivedSnapshots,
    warnings: sortWarnings(c.warnings),
    idempotency_key: idemKey,
    canonical_state_revision: c.afterRevision,
    formula_version: FORMULA_VERSION,
    evaluation_timestamp: now,
  };

  return accepted;
}

// ─── Apply a single effect to state ───
function applyEffect(state: DomainState, eff: CanonicalStateEffect2G1A): void {
  if (eff.kind === "position_quantity") {
    const pos = state.positions[eff.position_id];
    if (pos) {
      pos.position_quantity = eff.after;
    }
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

// ─── Apply a single operation to state ───
function applyOperation(state: DomainState, op: AtomicRecordOperation2G1A, afterRevision: number): void {
  const opKind = (op as { op_kind: string }).op_kind;
  const o = op as unknown as Record<string, unknown>;

  switch (opKind) {
    case "transfer_outstanding_created": {
      const t = o as unknown as TransferOutstandingCreatedOp;
      state.transfers_outstanding[t.transfer_id] = {
        transfer_id: t.transfer_id,
        item_id: t.item_id,
        source_position_id: t.source_position_id,
        destination_position_id: t.destination_position_id,
        in_transit_position_id: t.in_transit_position_id,
        dispatched_quantity: t.dispatched_quantity,
        received_quantity: 0,
        status: "outstanding",
        dispatch_event_id: t.dispatch_event_id,
        receive_event_id: null,
      };
      break;
    }
    case "transfer_outstanding_received": {
      const t = o as unknown as TransferOutstandingReceivedOp;
      const existing = state.transfers_outstanding[t.transfer_id];
      if (existing) {
        existing.received_quantity = t.received_quantity;
        existing.status = "received";
        existing.receive_event_id = t.receive_event_id;
      }
      break;
    }
    case "correction_provenance_created": {
      const t = o as unknown as CorrectionProvenanceCreatedOp;
      state.correction_provenance[t.record_id] = {
        record_id: t.record_id,
        original_event_type: t.original_event_type,
        original_event_id: t.original_event_id,
        original_item_id: t.original_item_id,
        original_position_id: t.original_position_id,
        original_signed_delta: t.original_signed_delta,
        original_absolute_quantity: t.original_absolute_quantity,
        reversed_absolute_quantity: 0,
        remaining_reversible_quantity: t.original_absolute_quantity,
        related_issue_event_id: t.related_issue_event_id,
        blocking_downstream_event_ids: [],
      };
      break;
    }
    case "correction_provenance_reversal_updated": {
      const t = o as unknown as CorrectionProvenanceReversalUpdatedOp;
      const p = state.correction_provenance[t.provenance_record_id];
      if (p) {
        p.reversed_absolute_quantity = t.after.reversed_absolute_quantity;
        p.remaining_reversible_quantity = t.after.remaining_reversible_quantity;
      }
      break;
    }
    case "correction_provenance_downstream_block_updated": {
      const t = o as unknown as CorrectionProvenanceDownstreamBlockUpdatedOp;
      const p = state.correction_provenance[t.provenance_record_id];
      if (p) {
        if (!p.blocking_downstream_event_ids.includes(t.blocking_event_id)) {
          p.blocking_downstream_event_ids.push(t.blocking_event_id);
        }
      }
      break;
    }
    case "job_issue_progress_created": {
      const t = o as unknown as JobIssueProgressCreatedOp;
      state.job_issue_progress[t.issue_event_id] = {
        issue_event_id: t.issue_event_id,
        item_id: t.item_id,
        job_custody_position_id: t.job_custody_position_id,
        issued_quantity: t.issued_quantity,
        consumed_quantity: 0,
        returned_quantity: 0,
        outstanding_quantity: t.issued_quantity,
        status: "open",
        created_revision: afterRevision,
        last_updated_revision: afterRevision,
      };
      break;
    }
    case "job_issue_consumed_updated": {
      const t = o as unknown as JobIssueConsumedUpdatedOp;
      const issue = state.job_issue_progress[t.issue_event_id];
      if (issue) {
        issue.consumed_quantity = t.after.consumed_quantity;
        issue.outstanding_quantity = t.after.outstanding_quantity;
        issue.status = t.after.status;
        issue.last_updated_revision = afterRevision;
      }
      break;
    }
    case "job_issue_consumed_reversed": {
      const t = o as unknown as JobIssueConsumedReversedOp;
      const issue = state.job_issue_progress[t.issue_event_id];
      if (issue) {
        issue.consumed_quantity = t.after.consumed_quantity;
        issue.outstanding_quantity = t.after.outstanding_quantity;
        issue.status = t.after.status;
        issue.last_updated_revision = afterRevision;
      }
      break;
    }
    case "job_issue_returned_updated": {
      const t = o as unknown as JobIssueReturnedUpdatedOp;
      const issue = state.job_issue_progress[t.issue_event_id];
      if (issue) {
        issue.returned_quantity = t.after.returned_quantity;
        issue.outstanding_quantity = t.after.outstanding_quantity;
        issue.status = t.after.status;
        issue.last_updated_revision = afterRevision;
      }
      break;
    }
    // accepted_event_record_inserted and state_revision_advanced handled in processEvent
  }
}

// ─── Event-specific processing ───
// Returns RejectedDomainResult if rejected, null if OK (effects/ops populated in context)
function processEventSpecific(
  c: EvalContext,
  event: DomainEvent2G1A,
  eventType: EventType2G1A,
  suppliedCost: SuppliedCost2G1A | null
): RejectedDomainResult | null {
  const evt = event as unknown as Record<string, unknown>;
  const state = c.state;
  const idemKey = evt.idempotency_key as string;

  switch (eventType) {
    // ─── E1–E4: No-effect workflows ───
    case "po.created": {
      c.classifications.push({ kind: "no_effect_workflow", event_id: evt.event_id as string, reason: "po_created" });
      return null;
    }
    case "po.approved": {
      c.classifications.push({ kind: "no_effect_workflow", event_id: evt.event_id as string, reason: "po_approved" });
      return null;
    }
    case "po.sent": {
      c.classifications.push({ kind: "no_effect_workflow", event_id: evt.event_id as string, reason: "po_sent" });
      return null;
    }
    case "po.line.opened": {
      c.classifications.push({ kind: "no_effect_workflow", event_id: evt.event_id as string, reason: "po_line_opened" });
      return null;
    }
    // ─── E25: No-effect command ───
    case "adjustment.requested": {
      c.classifications.push({ kind: "no_effect_command", event_id: evt.event_id as string, reason: "adjustment_requested" });
      return null;
    }
    // ─── E47: No-effect observation ───
    case "count.observation": {
      c.classifications.push({ kind: "no_effect_observation", event_id: evt.event_id as string, reason: "count_observation" });
      return null;
    }

    // ─── E5: receipt.posted ───
    case "receipt.posted": {
      return processE5(c, evt, suppliedCost);
    }
    // ─── E6: receipt.reversed ───
    case "receipt.reversed": {
      return processE6(c, evt);
    }
    // ─── E8: transfer.dispatched ───
    case "transfer.dispatched": {
      return processE8(c, evt);
    }
    // ─── E9: transfer.received ───
    case "transfer.received": {
      return processE9(c, evt);
    }
    // ─── E26: adjustment.posted ───
    case "adjustment.posted": {
      return processE26(c, evt);
    }
    // ─── E27: adjustment.reversed ───
    case "adjustment.reversed": {
      return processE27(c, evt);
    }
    // ─── E28: adjustment.reclassification ───
    case "adjustment.reclassification": {
      return processE28(c, evt);
    }
    // ─── E32: job_material.issued ───
    case "job_material.issued": {
      return processE32(c, evt);
    }
    // ─── E33: job_material.consumed ───
    case "job_material.consumed": {
      return processE33(c, evt, suppliedCost);
    }
    // ─── E34: consumption.reversed ───
    case "consumption.reversed": {
      return processE34(c, evt);
    }
    // ─── E37: remnant.same_item_returned ───
    case "remnant.same_item_returned": {
      return processE37(c, evt);
    }
    // ─── E48: count.variance.resolved ───
    case "count.variance.resolved": {
      return processE48(c, evt);
    }
  }
  return null;
}

// ─── Generic blocker emission ───
function emitBlockers(
  c: EvalContext,
  effects: PositionQuantityEffect[],
  isReversal: boolean,
  reversalTargetOriginalEventId: string | null,
  newlyCreatedProvenanceRecordIds: Set<string>
): void {
  for (const eff of effects) {
    if (eff.kind !== "position_quantity") continue;
    const pair = { item_id: eff.item_id, position_id: eff.position_id };
    for (const recId of Object.keys(c.state.correction_provenance)) {
      const p = c.state.correction_provenance[recId];
      if (p.original_item_id === pair.item_id && p.original_position_id === pair.position_id) {
        // Same-original reversal exclusion
        if (isReversal && reversalTargetOriginalEventId && p.original_event_id === reversalTargetOriginalEventId) {
          continue;
        }
        // Newly-created-provenance exclusion
        if (newlyCreatedProvenanceRecordIds.has(recId)) {
          continue;
        }
        // Emit block op
        const blockOp: CorrectionProvenanceDownstreamBlockUpdatedOp = {
          op_kind: "correction_provenance_downstream_block_updated",
          provenance_record_id: recId,
          blocking_event_id: (c.event as unknown as Record<string, unknown>).event_id as string,
          blocking_event_type: (c.event as unknown as Record<string, unknown>).event_type as EventType2G1A,
          blocking_item_id: pair.item_id,
          blocking_position_id: pair.position_id,
          before: { blocking_downstream_event_ids: [...p.blocking_downstream_event_ids] },
          after: { blocking_downstream_event_ids: [...p.blocking_downstream_event_ids, (c.event as unknown as Record<string, unknown>).event_id as string] },
        };
        c.operations.push(blockOp);
        c.recordedOps.push(blockOp);
      }
    }
  }
}

// ─── Helper: make PositionQuantityEffect ───
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

// ─── Helper: make CompanyOwnedEffect ───
function makeCompanyOwnedEffect(
  state: DomainState,
  itemId: string,
  delta: number,
  reason: CompanyOwnedEffect["reason"]
): CompanyOwnedEffect | null {
  const co = state.company_ownership[itemId];
  const before = co?.company_owned_quantity ?? 0;
  const after = before + delta;
  return { kind: "company_owned", item_id: itemId, delta, before, after, reason };
}

// ─── E5: receipt.posted ───
function processE5(c: EvalContext, evt: Record<string, unknown>, suppliedCost: SuppliedCost2G1A | null): RejectedDomainResult | null {
  const itemId = evt.item_id as string;
  const destPosId = evt.destination_position_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  // Validate quantity — finiteness checked before sign per §19 step 2
  if (!isFiniteNumber(qty)) {
    return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  }
  if (!isPositiveFinite(qty)) {
    return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");
  }
  // Validate destination position
  const destPos = getPosition(c.state, destPosId);
  if (!destPos) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", "destination_position_id");
  if (destPos.position_kind === "terminal_job_cost") return reject(c, "STATE.WRONG_TRANSITION", "state", "Cannot receive to terminal position", "destination_position_id");
  if (destPos.ownership_class !== "company_owned") return reject(c, "VALIDATION.INVALID_ENUM_VALUE", "validation", "Destination must be company_owned", "destination_position_id");
  // Validate item
  const item = getItem(c.state, itemId);
  if (!item) return reject(c, "VALIDATION.INVALID_ENUM_VALUE", "validation", "Item not found", "item_id");
  if (item.governed_tracking_mode !== "ordinary") return reject(c, "VALIDATION.INVALID_ENUM_VALUE", "validation", "Item must be ordinary tracking mode", "item_id");

  // PositionQuantityEffect (destination +qty)
  const posEff = makePositionQtyEffect(c.state, destPosId, itemId, qty, "vendor_receipt");
  if (!posEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", "destination_position_id");
  if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
  c.effects.push(posEff);

  // CompanyOwnedEffect (+qty)
  const coEff = makeCompanyOwnedEffect(c.state, itemId, qty, "vendor_receipt");
  if (!coEff) return reject(c, "RECONCILIATION.COMPANY_OWNED_MISMATCH", "conservation", "Company ownership not found", "company_owned_quantity");
  c.effects.push(coEff);

  // CostPreservationResult
  if (suppliedCost) {
    c.immutableFacts.push(buildCostPreservation(itemId, eventId, suppliedCost, "vendor_receipt"));
  }

  // CorrectionProvenanceCreatedOp
  const provenanceId = `CPR-${eventId}`;
  const provenanceOp: CorrectionProvenanceCreatedOp = {
    op_kind: "correction_provenance_created",
    record_id: provenanceId,
    original_event_type: "receipt.posted",
    original_event_id: eventId,
    original_item_id: itemId,
    original_position_id: destPosId,
    original_signed_delta: qty,
    original_absolute_quantity: qty,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: qty,
    related_issue_event_id: null,
    blocking_downstream_event_ids: [],
    before: null,
    after: { reversed_absolute_quantity: 0, remaining_reversible_quantity: qty, related_issue_event_id: null, blocking_downstream_event_ids: [] },
  };
  c.operations.push(provenanceOp);
  c.recordedOps.push(provenanceOp);

  // Blocker emission (exclude newly-created provenance)
  emitBlockers(c, [posEff], false, null, new Set([provenanceId]));

  return null;
}

// ─── E6: receipt.reversed ───
function processE6(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const originalReceiptId = evt.original_receipt_id as string;
  const reversalQty = evt.reversal_quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(reversalQty)) {
    return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Reversal quantity must be finite", "reversal_quantity");
  }
  if (!isPositiveFinite(reversalQty)) {
    return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Reversal quantity must be positive", "reversal_quantity");
  }

  // Find accepted E5 by receipt_id (§5.8 §17)
  const matching = findAcceptedTransactions(c.state, "receipt.posted", "receipt_id", originalReceiptId);
  if (matching.length === 0) {
    // Secondary check: if a record matches by source_document_id but receipt_id differs → RECEIPT_ID_MISMATCH
    const e6SourceDocId = evt.source_document_id as string;
    if (e6SourceDocId) {
      const docMatches = findAcceptedTransactions(c.state, "receipt.posted", "source_document_id", e6SourceDocId);
      if (docMatches.length > 0) {
        return reject(c, "VALIDATION.RECEIPT_ID_MISMATCH", "validation", "source_document_id matches but receipt_id differs", "original_receipt_id");
      }
    }
    return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", `Original receipt not found: ${originalReceiptId}`, null);
  }
  if (matching.length > 1) return reject(c, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", "validation", "Multiple matching receipts", null);

  const originalTxn = matching[0];
  const originalEvent = originalTxn.event as Record<string, unknown>;
  const originalEventId = originalEvent.event_id as string;

  // Find provenance
  const provenance = findProvenanceByOriginalEventId(c.state, originalEventId);
  if (!provenance) return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", "Provenance not found", null);

  // Check already reversed (must precede REVERSAL_EXCEEDS_AVAILABLE — when remaining=0, ALREADY_REVERSED is the correct code)
  if (provenance.remaining_reversible_quantity === 0) {
    return reject(c, "CORRECTION.ALREADY_REVERSED", "correction", "Already fully reversed", null);
  }

  // Check remaining reversible
  if (reversalQty > provenance.remaining_reversible_quantity) {
    return reject(c, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", "correction", `Reversal exceeds remaining: ${reversalQty} > ${provenance.remaining_reversible_quantity}`, null);
  }

  // Check downstream blockers (self-excluded)
  const blockers = provenance.blocking_downstream_event_ids.filter(id => id !== eventId);
  if (blockers.length > 0) {
    return reject(c, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", "correction", "Downstream blockers present", null);
  }

  const itemId = provenance.original_item_id;
  const destPosId = provenance.original_position_id;
  const signedDelta = -provenance.original_signed_delta > 0 ? -reversalQty : reversalQty;
  // Sign restoration: applied_signed_delta = -sign(original_signed_delta) * reversal_quantity
  const sign = provenance.original_signed_delta > 0 ? 1 : -1;
  const appliedDelta = -sign * reversalQty;

  // PositionQuantityEffect (destination -qty)
  const posEff = makePositionQtyEffect(c.state, destPosId, itemId, appliedDelta, "receipt_reversal");
  if (!posEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", null);
  if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
  c.effects.push(posEff);

  // CompanyOwnedEffect
  const coEff = makeCompanyOwnedEffect(c.state, itemId, appliedDelta, "receipt_reversal");
  if (coEff) c.effects.push(coEff);

  // CorrectionProvenanceReversalUpdatedOp
  const newReversed = provenance.reversed_absolute_quantity + reversalQty;
  const newRemaining = provenance.remaining_reversible_quantity - reversalQty;
  const revOp: CorrectionProvenanceReversalUpdatedOp = {
    op_kind: "correction_provenance_reversal_updated",
    provenance_record_id: provenance.record_id,
    original_event_id: originalEventId,
    reversal_delta_absolute: reversalQty,
    applied_signed_delta: appliedDelta,
    reversing_event_id: eventId,
    before: { reversed_absolute_quantity: provenance.reversed_absolute_quantity, remaining_reversible_quantity: provenance.remaining_reversible_quantity },
    after: { reversed_absolute_quantity: newReversed, remaining_reversible_quantity: newRemaining },
  };
  c.operations.push(revOp);
  c.recordedOps.push(revOp);

  // Blocker emission (exclude self-target provenance)
  emitBlockers(c, [posEff], true, originalEventId, new Set());

  return null;
}

// ─── E8: transfer.dispatched ───
function processE8(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const transferId = evt.transfer_id as string;
  const sourcePosId = evt.source_position_id as string;
  const inTransitPosId = evt.in_transit_position_id as string;
  const itemId = evt.item_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(qty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  if (!isPositiveFinite(qty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");

  // Check transfer_id uniqueness
  if (c.state.transfers_outstanding[transferId]) {
    return reject(c, "INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "commitment", `Duplicate transfer_id: ${transferId}`, "transfer_id");
  }

  const sourcePos = getPosition(c.state, sourcePosId);
  if (!sourcePos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", "source_position_id");

  // PositionQuantityEffect (source -qty)
  const srcEff = makePositionQtyEffect(c.state, sourcePosId, itemId, -qty, "transfer_dispatch");
  if (!srcEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", null);
  if (srcEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Insufficient source quantity", "position_quantity");
  c.effects.push(srcEff);

  // PositionQuantityEffect (in_transit +qty)
  const inTransitEff = makePositionQtyEffect(c.state, inTransitPosId, itemId, qty, "transfer_dispatch");
  if (!inTransitEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "In-transit position not found", "in_transit_position_id");
  c.effects.push(inTransitEff);

  // TransferOutstandingCreatedOp
  const createOp: TransferOutstandingCreatedOp = {
    op_kind: "transfer_outstanding_created",
    transfer_id: transferId,
    item_id: itemId,
    source_position_id: sourcePosId,
    destination_position_id: evt.destination_position_id as string,
    in_transit_position_id: inTransitPosId,
    dispatched_quantity: qty,
    dispatch_event_id: eventId,
    before: null,
    after: { received_quantity: 0, status: "outstanding", receive_event_id: null },
  };
  c.operations.push(createOp);
  c.recordedOps.push(createOp);

  // Blocker emission at both positions
  emitBlockers(c, [srcEff, inTransitEff], false, null, new Set());

  return null;
}

// ─── E9: transfer.received ───
function processE9(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const transferId = evt.transfer_id as string;
  const destPosId = evt.destination_position_id as string;
  const itemId = evt.item_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(qty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  if (!isPositiveFinite(qty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");

  const transfer = c.state.transfers_outstanding[transferId];
  if (!transfer) return reject(c, "TRANSFER.RECEIVE_WITHOUT_DISPATCH", "transfer", "No outstanding transfer found", "transfer_id");
  if (transfer.status !== "outstanding") return reject(c, "TRANSFER.RECEIVE_WITHOUT_DISPATCH", "transfer", "Transfer already received", "transfer_id");
  if (qty > transfer.dispatched_quantity) return reject(c, "TRANSFER.RECEIVE_EXCEEDS_DISPATCH", "transfer", "Quantity exceeds dispatched", "quantity");
  if (qty < transfer.dispatched_quantity) return reject(c, "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B", "authorization", "Partial receipt deferred to 2G1-B", "quantity");
  if (transfer.destination_position_id !== destPosId) return reject(c, "TRANSFER.DESTINATION_MISMATCH", "transfer", "Destination mismatch", "destination_position_id");

  const inTransitPosId = transfer.in_transit_position_id;

  // PositionQuantityEffect (in_transit -qty)
  const inTransitEff = makePositionQtyEffect(c.state, inTransitPosId, itemId, -qty, "transfer_receipt");
  if (!inTransitEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "In-transit position not found", null);
  if (inTransitEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative in-transit result", "position_quantity");
  c.effects.push(inTransitEff);

  // PositionQuantityEffect (destination +qty)
  const destEff = makePositionQtyEffect(c.state, destPosId, itemId, qty, "transfer_receipt");
  if (!destEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", null);
  c.effects.push(destEff);

  // TransferOutstandingReceivedOp
  const recvOp: TransferOutstandingReceivedOp = {
    op_kind: "transfer_outstanding_received",
    transfer_id: transferId,
    received_quantity: qty,
    receive_event_id: eventId,
    before: { received_quantity: 0, status: "outstanding", receive_event_id: null },
    after: { received_quantity: qty, status: "received", receive_event_id: eventId },
  };
  c.operations.push(recvOp);
  c.recordedOps.push(recvOp);

  // Blocker emission at both positions
  emitBlockers(c, [inTransitEff, destEff], false, null, new Set());

  return null;
}

// ─── E26: adjustment.posted ───
function processE26(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const posId = evt.position_id as string;
  const itemId = evt.item_id as string;
  const delta = evt.delta as number;
  const eventId = evt.event_id as string;
  const adjustmentId = evt.adjustment_id as string;

  // Zero-delta check (E26 only — does NOT apply to E48)
  if (delta === 0) return reject(c, "VALIDATION.ZERO_DELTA_NOT_PERMITTED", "validation", "Adjustment delta must be nonzero", "delta");

  if (!isFiniteNumber(delta)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Delta must be finite", "delta");

  const pos = getPosition(c.state, posId);
  if (!pos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", "position_id");

  // PositionQuantityEffect
  const posEff = makePositionQtyEffect(c.state, posId, itemId, delta, "adjustment_posted");
  if (!posEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", null);
  if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
  c.effects.push(posEff);

  // CompanyOwnedEffect
  const coEff = makeCompanyOwnedEffect(c.state, itemId, delta, "adjustment_posted");
  if (coEff) c.effects.push(coEff);

  // CorrectionProvenanceCreatedOp
  const provenanceId = `CPR-${eventId}`;
  const absQty = Math.abs(delta);
  const provenanceOp: CorrectionProvenanceCreatedOp = {
    op_kind: "correction_provenance_created",
    record_id: provenanceId,
    original_event_type: "adjustment.posted",
    original_event_id: eventId,
    original_item_id: itemId,
    original_position_id: posId,
    original_signed_delta: delta,
    original_absolute_quantity: absQty,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: absQty,
    related_issue_event_id: null,
    blocking_downstream_event_ids: [],
    before: null,
    after: { reversed_absolute_quantity: 0, remaining_reversible_quantity: absQty, related_issue_event_id: null, blocking_downstream_event_ids: [] },
  };
  c.operations.push(provenanceOp);
  c.recordedOps.push(provenanceOp);

  // Blocker emission (exclude newly-created provenance)
  emitBlockers(c, [posEff], false, null, new Set([provenanceId]));

  return null;
}

// ─── E27: adjustment.reversed ───
function processE27(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const originalAdjustmentId = evt.original_adjustment_id as string;
  const reversalQty = evt.reversal_quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(reversalQty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Reversal quantity must be finite", "reversal_quantity");
  if (!isPositiveFinite(reversalQty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Reversal quantity must be positive", "reversal_quantity");

  // Find accepted E26 by adjustment_id
  const matching = findAcceptedTransactions(c.state, "adjustment.posted", "adjustment_id", originalAdjustmentId);
  if (matching.length === 0) return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", "Original adjustment not found", null);
  if (matching.length > 1) return reject(c, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", "validation", "Multiple matching adjustments", null);

  const originalEvent = matching[0].event as Record<string, unknown>;
  const originalEventId = originalEvent.event_id as string;
  const provenance = findProvenanceByOriginalEventId(c.state, originalEventId);
  if (!provenance) return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", "Provenance not found", null);

  if (provenance.remaining_reversible_quantity === 0) return reject(c, "CORRECTION.ALREADY_REVERSED", "correction", "Already fully reversed", null);

  if (reversalQty > provenance.remaining_reversible_quantity) {
    return reject(c, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", "correction", "Reversal exceeds remaining", null);
  }

  const blockers = provenance.blocking_downstream_event_ids.filter(id => id !== eventId);
  if (blockers.length > 0) return reject(c, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", "correction", "Downstream blockers present", null);

  const itemId = provenance.original_item_id;
  const posId = provenance.original_position_id;
  const sign = provenance.original_signed_delta > 0 ? 1 : -1;
  const appliedDelta = -sign * reversalQty;

  const posEff = makePositionQtyEffect(c.state, posId, itemId, appliedDelta, "adjustment_reversal");
  if (!posEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", null);
  if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
  c.effects.push(posEff);

  const coEff = makeCompanyOwnedEffect(c.state, itemId, appliedDelta, "adjustment_reversal");
  if (coEff) c.effects.push(coEff);

  const newReversed = provenance.reversed_absolute_quantity + reversalQty;
  const newRemaining = provenance.remaining_reversible_quantity - reversalQty;
  const revOp: CorrectionProvenanceReversalUpdatedOp = {
    op_kind: "correction_provenance_reversal_updated",
    provenance_record_id: provenance.record_id,
    original_event_id: originalEventId,
    reversal_delta_absolute: reversalQty,
    applied_signed_delta: appliedDelta,
    reversing_event_id: eventId,
    before: { reversed_absolute_quantity: provenance.reversed_absolute_quantity, remaining_reversible_quantity: provenance.remaining_reversible_quantity },
    after: { reversed_absolute_quantity: newReversed, remaining_reversible_quantity: newRemaining },
  };
  c.operations.push(revOp);
  c.recordedOps.push(revOp);

  emitBlockers(c, [posEff], true, originalEventId, new Set());

  return null;
}

// ─── E28: adjustment.reclassification ───
function processE28(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const posId = evt.position_id as string;
  const itemId = evt.item_id as string;
  const newCondition = evt.new_condition as ConditionReclassification["after"];
  const newRestriction = evt.new_restriction as RestrictionReclassification["after"];

  const pos = getPosition(c.state, posId);
  if (!pos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", "position_id");

  const conditionChanged = pos.condition_class !== newCondition;
  const restrictionChanged = pos.restriction_class !== newRestriction;
  if (!conditionChanged && !restrictionChanged) {
    return reject(c, "VALIDATION.NO_OP_RECLASSIFICATION", "validation", "Reclassification is a no-op", null);
  }

  if (conditionChanged) {
    const eff: ConditionReclassification = {
      kind: "condition_reclassification",
      position_id: posId,
      item_id: itemId,
      before: pos.condition_class,
      after: newCondition,
      reason: "adjustment_reclassification",
    };
    c.effects.push(eff);
  }
  if (restrictionChanged) {
    const eff: RestrictionReclassification = {
      kind: "restriction_reclassification",
      position_id: posId,
      item_id: itemId,
      before: pos.restriction_class,
      after: newRestriction,
      reason: "adjustment_reclassification",
    };
    c.effects.push(eff);
  }

  return null;
}

// ─── E32: job_material.issued ───
function processE32(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const issueId = evt.issue_id as string;
  const sourcePosId = evt.source_position_id as string;
  const jobCustodyPosId = evt.job_custody_position_id as string;
  const itemId = evt.item_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(qty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  if (!isPositiveFinite(qty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");

  // Check no open issue for (item_id, job_custody_position_id)
  const existingIssue = findOpenIssue(c.state, itemId, jobCustodyPosId);
  if (existingIssue) return reject(c, "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION", "validation", "Open issue already exists for this position+item", null);

  const sourcePos = getPosition(c.state, sourcePosId);
  if (!sourcePos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", "source_position_id");

  // PositionQuantityEffect (source -qty)
  const srcEff = makePositionQtyEffect(c.state, sourcePosId, itemId, -qty, "job_material_issued");
  if (!srcEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", null);
  if (srcEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Insufficient source quantity", "position_quantity");
  c.effects.push(srcEff);

  // PositionQuantityEffect (job_custody +qty)
  const jobCustodyEff = makePositionQtyEffect(c.state, jobCustodyPosId, itemId, qty, "job_material_issued");
  if (!jobCustodyEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Job custody position not found", "job_custody_position_id");
  c.effects.push(jobCustodyEff);

  // CorrectionProvenanceCreatedOp
  const provenanceId = `CPR-${eventId}`;
  const provenanceOp: CorrectionProvenanceCreatedOp = {
    op_kind: "correction_provenance_created",
    record_id: provenanceId,
    original_event_type: "job_material.issued",
    original_event_id: eventId,
    original_item_id: itemId,
    original_position_id: jobCustodyPosId,
    original_signed_delta: qty,
    original_absolute_quantity: qty,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: qty,
    related_issue_event_id: null,
    blocking_downstream_event_ids: [],
    before: null,
    after: { reversed_absolute_quantity: 0, remaining_reversible_quantity: qty, related_issue_event_id: null, blocking_downstream_event_ids: [] },
  };
  c.operations.push(provenanceOp);
  c.recordedOps.push(provenanceOp);

  // JobIssueProgressCreatedOp
  const issueOp: JobIssueProgressCreatedOp = {
    op_kind: "job_issue_progress_created",
    issue_event_id: eventId,
    item_id: itemId,
    job_custody_position_id: jobCustodyPosId,
    issued_quantity: qty,
    after_revision: c.afterRevision,
    before: null,
    after: { consumed_quantity: 0, returned_quantity: 0, outstanding_quantity: qty, status: "open", created_revision: c.afterRevision, last_updated_revision: c.afterRevision },
  };
  c.operations.push(issueOp);
  c.recordedOps.push(issueOp);

  // Blocker emission at both positions (exclude newly-created provenance)
  emitBlockers(c, [srcEff, jobCustodyEff], false, null, new Set([provenanceId]));

  return null;
}

// ─── E33: job_material.consumed ───
function processE33(c: EvalContext, evt: Record<string, unknown>, suppliedCost: SuppliedCost2G1A | null): RejectedDomainResult | null {
  const jobCustodyPosId = evt.job_custody_position_id as string;
  const itemId = evt.item_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(qty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  if (!isPositiveFinite(qty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");

  // Validate job_custody_position_id exists (owner resolution: position check before issue check)
  const jobCustodyPos = getPosition(c.state, jobCustodyPosId);
  if (!jobCustodyPos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Job custody position not found", "job_custody_position_id");

  // Find open issue
  const issue = findOpenIssue(c.state, itemId, jobCustodyPosId);
  if (!issue) return reject(c, "VALIDATION.MISSING_ISSUE_PROVENANCE", "validation", "No open issue found", null);

  if (qty > issue.outstanding_quantity) return reject(c, "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE", "conservation", "Consumption exceeds outstanding", "quantity");

  // PositionQuantityEffect (job_custody -qty)
  const posEff = makePositionQtyEffect(c.state, jobCustodyPosId, itemId, -qty, "job_material_consumed");
  if (!posEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Job custody position not found", null);
  if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
  c.effects.push(posEff);

  // CompanyOwnedEffect (-qty)
  const coEff = makeCompanyOwnedEffect(c.state, itemId, -qty, "job_material_consumed");
  if (coEff) c.effects.push(coEff);

  // CostPreservationResult
  if (suppliedCost) {
    c.immutableFacts.push(buildCostPreservation(itemId, eventId, suppliedCost, "job_material_consumed"));
  }

  // CorrectionProvenanceCreatedOp (related_issue_event_id = issue.issue_event_id)
  const provenanceId = `CPR-${eventId}`;
  const provenanceOp: CorrectionProvenanceCreatedOp = {
    op_kind: "correction_provenance_created",
    record_id: provenanceId,
    original_event_type: "job_material.consumed",
    original_event_id: eventId,
    original_item_id: itemId,
    original_position_id: jobCustodyPosId,
    original_signed_delta: -qty,
    original_absolute_quantity: qty,
    reversed_absolute_quantity: 0,
    remaining_reversible_quantity: qty,
    related_issue_event_id: issue.issue_event_id,
    blocking_downstream_event_ids: [],
    before: null,
    after: { reversed_absolute_quantity: 0, remaining_reversible_quantity: qty, related_issue_event_id: issue.issue_event_id, blocking_downstream_event_ids: [] },
  };
  c.operations.push(provenanceOp);
  c.recordedOps.push(provenanceOp);

  // JobIssueConsumedUpdatedOp
  const newConsumed = issue.consumed_quantity + qty;
  const newOutstanding = issue.outstanding_quantity - qty;
  const newStatus = newOutstanding > 0 ? "open" : "closed";
  const consumedOp: JobIssueConsumedUpdatedOp = {
    op_kind: "job_issue_consumed_updated",
    issue_event_id: issue.issue_event_id,
    consumption_delta: qty,
    consumption_event_id: eventId,
    after_revision: c.afterRevision,
    before: { consumed_quantity: issue.consumed_quantity, returned_quantity: issue.returned_quantity, outstanding_quantity: issue.outstanding_quantity, status: issue.status, last_updated_revision: issue.last_updated_revision },
    after: { consumed_quantity: newConsumed, returned_quantity: issue.returned_quantity, outstanding_quantity: newOutstanding, status: newStatus, last_updated_revision: c.afterRevision },
  };
  c.operations.push(consumedOp);
  c.recordedOps.push(consumedOp);

  // Blocker emission (exclude newly-created provenance)
  emitBlockers(c, [posEff], false, null, new Set([provenanceId]));

  return null;
}

// ─── E34: consumption.reversed ───
function processE34(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const originalConsumptionId = evt.original_consumption_id as string;
  const reversalQty = evt.reversal_quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(reversalQty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Reversal quantity must be finite", "reversal_quantity");
  if (!isPositiveFinite(reversalQty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Reversal quantity must be positive", "reversal_quantity");

  // Find accepted E33 by consumption_id
  const matching = findAcceptedTransactions(c.state, "job_material.consumed", "consumption_id", originalConsumptionId);
  if (matching.length === 0) return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", "Original consumption not found", null);
  if (matching.length > 1) return reject(c, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", "validation", "Multiple matching consumptions", null);

  const originalEvent = matching[0].event as Record<string, unknown>;
  const originalEventId = originalEvent.event_id as string;

  // Find E33 provenance
  const provenance = findProvenanceByOriginalEventId(c.state, originalEventId);
  if (!provenance) return reject(c, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", "validation", "E33 provenance not found", null);

  // Get related_issue_event_id
  const relatedIssueEventId = provenance.related_issue_event_id;
  if (!relatedIssueEventId) return reject(c, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", "validation", "E33 provenance has no related_issue_event_id", null);

  // Find JobIssueProgress by issue_event_id
  const issue = findIssueByEventId(c.state, relatedIssueEventId);
  if (!issue) return reject(c, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", "validation", "JobIssueProgress not found for related_issue_event_id", null);

  // Check already reversed (must precede REVERSAL_EXCEEDS_AVAILABLE)
  if (provenance.remaining_reversible_quantity === 0) return reject(c, "CORRECTION.ALREADY_REVERSED", "correction", "Already fully reversed", null);

  // Check remaining reversible
  if (reversalQty > provenance.remaining_reversible_quantity) {
    return reject(c, "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE", "correction", "Reversal exceeds remaining", null);
  }

  // Check downstream blockers (self-excluded)
  const blockers = provenance.blocking_downstream_event_ids.filter(id => id !== eventId);
  if (blockers.length > 0) return reject(c, "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE", "correction", "Downstream blockers present", null);

  const itemId = provenance.original_item_id;
  const jobCustodyPosId = provenance.original_position_id;
  const appliedDelta = reversalQty; // positive (restores consumption)

  // PositionQuantityEffect (job_custody +qty)
  const posEff = makePositionQtyEffect(c.state, jobCustodyPosId, itemId, appliedDelta, "consumption_reversal");
  if (!posEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Job custody position not found", null);
  c.effects.push(posEff);

  // CompanyOwnedEffect (+qty)
  const coEff = makeCompanyOwnedEffect(c.state, itemId, appliedDelta, "consumption_reversal");
  if (coEff) c.effects.push(coEff);

  // CorrectionProvenanceReversalUpdatedOp
  const newReversed = provenance.reversed_absolute_quantity + reversalQty;
  const newRemaining = provenance.remaining_reversible_quantity - reversalQty;
  const revOp: CorrectionProvenanceReversalUpdatedOp = {
    op_kind: "correction_provenance_reversal_updated",
    provenance_record_id: provenance.record_id,
    original_event_id: originalEventId,
    reversal_delta_absolute: reversalQty,
    applied_signed_delta: appliedDelta,
    reversing_event_id: eventId,
    before: { reversed_absolute_quantity: provenance.reversed_absolute_quantity, remaining_reversible_quantity: provenance.remaining_reversible_quantity },
    after: { reversed_absolute_quantity: newReversed, remaining_reversible_quantity: newRemaining },
  };
  c.operations.push(revOp);
  c.recordedOps.push(revOp);

  // JobIssueConsumedReversedOp
  const newConsumed = issue.consumed_quantity - reversalQty;
  const newOutstanding = issue.outstanding_quantity + reversalQty;
  const newStatus = newOutstanding > 0 ? "open" : "closed";
  const reversedOp: JobIssueConsumedReversedOp = {
    op_kind: "job_issue_consumed_reversed",
    issue_event_id: issue.issue_event_id,
    reversal_delta: reversalQty,
    reversal_event_id: eventId,
    after_revision: c.afterRevision,
    before: { consumed_quantity: issue.consumed_quantity, returned_quantity: issue.returned_quantity, outstanding_quantity: issue.outstanding_quantity, status: issue.status, last_updated_revision: issue.last_updated_revision },
    after: { consumed_quantity: newConsumed, returned_quantity: issue.returned_quantity, outstanding_quantity: newOutstanding, status: newStatus, last_updated_revision: c.afterRevision },
  };
  c.operations.push(reversedOp);
  c.recordedOps.push(reversedOp);

  // Blocker emission (exclude self-target provenance)
  emitBlockers(c, [posEff], true, originalEventId, new Set());

  return null;
}

// ─── E37: remnant.same_item_returned ───
function processE37(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const originalIssueId = evt.original_issue_id as string;
  const sourcePosId = evt.source_position_id as string;
  const destPosId = evt.destination_position_id as string;
  const itemId = evt.item_id as string;
  const qty = evt.quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(qty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Quantity must be finite", "quantity");
  if (!isPositiveFinite(qty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Quantity must be positive", "quantity");

  // Find accepted E32 by issue_id
  const matching = findAcceptedTransactions(c.state, "job_material.issued", "issue_id", originalIssueId);
  if (matching.length === 0) return reject(c, "CORRECTION.ORIGINAL_NOT_FOUND", "correction", "Original issue not found", null);
  if (matching.length > 1) return reject(c, "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE", "validation", "Multiple matching issues", null);

  const originalEvent = matching[0].event as Record<string, unknown>;
  const originalEventId = originalEvent.event_id as string;

  // Find JobIssueProgress by issue_event_id = E32.event_id
  const issue = findIssueByEventId(c.state, originalEventId);
  if (!issue) return reject(c, "VALIDATION.ISSUE_PROVENANCE_MISMATCH", "validation", "JobIssueProgress not found for issue_event_id", null);

  // Validate source_position_id = issue's job_custody_position_id
  if (sourcePosId !== issue.job_custody_position_id) return reject(c, "VALIDATION.POSITION_MISMATCH", "validation", "Source position does not match issue's custody position", "source_position_id");

  // Validate item_id match
  if (itemId !== issue.item_id) return reject(c, "VALIDATION.ITEM_MISMATCH", "validation", "Item ID does not match issue", "item_id");

  // Validate source position kind
  const sourcePos = getPosition(c.state, sourcePosId);
  if (!sourcePos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", "source_position_id");
  if (sourcePos.position_kind !== "custody_job") return reject(c, "VALIDATION.POSITION_MISMATCH", "validation", "Source position must be custody_job", "source_position_id");

  // Validate destination position kind
  const destPos = getPosition(c.state, destPosId);
  if (!destPos) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", "destination_position_id");
  if (destPos.position_kind !== "physical_warehouse" && destPos.position_kind !== "physical_truck") return reject(c, "VALIDATION.POSITION_MISMATCH", "validation", "Destination must be warehouse or truck", "destination_position_id");

  // Validate source and destination item match
  if (sourcePos.item_id !== destPos.item_id) return reject(c, "VALIDATION.ITEM_MISMATCH", "validation", "Source and destination items differ", "item_id");

  // Check quantity vs outstanding
  if (qty > issue.outstanding_quantity) return reject(c, "RETURN.EXCEEDS_OUTSTANDING_ISSUE", "conservation", "Return exceeds outstanding", "quantity");

  // PositionQuantityEffect (source/job_custody -qty)
  const srcEff = makePositionQtyEffect(c.state, sourcePosId, itemId, -qty, "remnant_same_item_returned");
  if (!srcEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Source position not found", null);
  if (srcEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Insufficient source quantity", "position_quantity");
  c.effects.push(srcEff);

  // PositionQuantityEffect (destination +qty)
  const destEff = makePositionQtyEffect(c.state, destPosId, itemId, qty, "remnant_same_item_returned");
  if (!destEff) return reject(c, "VALIDATION.MISSING_DESTINATION_POSITION", "validation", "Destination position not found", null);
  c.effects.push(destEff);

  // JobIssueReturnedUpdatedOp
  const newReturned = issue.returned_quantity + qty;
  const newOutstanding = issue.outstanding_quantity - qty;
  const newStatus = newOutstanding > 0 ? "open" : "closed";
  const returnOp: JobIssueReturnedUpdatedOp = {
    op_kind: "job_issue_returned_updated",
    issue_event_id: issue.issue_event_id,
    return_delta: qty,
    return_event_id: eventId,
    after_revision: c.afterRevision,
    before: { consumed_quantity: issue.consumed_quantity, returned_quantity: issue.returned_quantity, outstanding_quantity: issue.outstanding_quantity, status: issue.status, last_updated_revision: issue.last_updated_revision },
    after: { consumed_quantity: issue.consumed_quantity, returned_quantity: newReturned, outstanding_quantity: newOutstanding, status: newStatus, last_updated_revision: c.afterRevision },
  };
  c.operations.push(returnOp);
  c.recordedOps.push(returnOp);

  // Blocker emission at both positions (no same-original exclusion for E37)
  emitBlockers(c, [srcEff, destEff], false, null, new Set());

  return null;
}

// ─── E48: count.variance.resolved ───
function processE48(c: EvalContext, evt: Record<string, unknown>): RejectedDomainResult | null {
  const posId = evt.position_id as string;
  const itemId = evt.item_id as string;
  const countedQty = evt.counted_quantity as number;
  const eventId = evt.event_id as string;

  if (!isFiniteNumber(countedQty)) return reject(c, "UOM.NON_FINITE_QUANTITY", "validation", "Counted quantity must be finite", "counted_quantity");
  if (!isNonNegativeFinite(countedQty)) return reject(c, "VALIDATION.NON_POSITIVE_QUANTITY", "validation", "Counted quantity must be non-negative", "counted_quantity");

  const pos = getPosition(c.state, posId);
  if (!pos) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", "position_id");

  const currentQty = pos.position_quantity;
  const delta = countedQty - currentQty;

  // Zero-delta E48 is ACCEPTED — produces no effects, no blockers, but still records event and advances revision
  if (delta !== 0) {
    // PositionQuantityEffect
    const posEff = makePositionQtyEffect(c.state, posId, itemId, delta, "count_variance_resolution");
    if (!posEff) return reject(c, "VALIDATION.MISSING_SOURCE_POSITION", "validation", "Position not found", null);
    if (posEff.after < 0) return reject(c, "INV.NEGATIVE_RESULT", "conservation", "Negative result", "position_quantity");
    c.effects.push(posEff);

    // CompanyOwnedEffect
    const coEff = makeCompanyOwnedEffect(c.state, itemId, delta, "count_variance_resolution");
    if (coEff) c.effects.push(coEff);

    // Blocker emission (no provenance created by E48)
    emitBlockers(c, [posEff], false, null, new Set());
  }

  // NO CorrectionProvenanceCreatedOp (Rule B)
  // NO CostPreservationResult
  // Always: AcceptedEventRecordInsertedOp and StateRevisionAdvancedOp (handled in processEvent)

  return null;
}

// ─── Helper: reject ───
function reject(
  c: EvalContext,
  errorCode: DomainErrorCode2G1A,
  category: ErrorCategory2G1A,
  message: string,
  affectedField: string | null
): RejectedDomainResult {
  const eventType = (c.event as unknown as Record<string, unknown>).event_type as EventType2G1A | "<unknown>";
  return makeRejected(
    [makeError(errorCode, category, message, eventType, { affected_field: affectedField })],
    sortWarnings(c.warnings),
    eventType,
    (c.event as unknown as Record<string, unknown>).idempotency_key as string
  );
}