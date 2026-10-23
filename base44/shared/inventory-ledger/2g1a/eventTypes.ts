// ═════════════════════════════════════════════════════════════════
// 2G1-A EVENT TYPES AND CLOSED ENUMS
// Isolated module: no SDK, no entity/auth, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

// ─── Core event type (18 authorized events) ───
export type EventType2G1A =
  | "po.created"
  | "po.approved"
  | "po.sent"
  | "po.line.opened"
  | "receipt.posted"
  | "receipt.reversed"
  | "transfer.dispatched"
  | "transfer.received"
  | "adjustment.requested"
  | "adjustment.posted"
  | "adjustment.reversed"
  | "adjustment.reclassification"
  | "job_material.issued"
  | "job_material.consumed"
  | "consumption.reversed"
  | "remnant.same_item_returned"
  | "count.observation"
  | "count.variance.resolved";

// Full E1–E55 register (for deferred-discriminator recognition)
export const E1_E55_REGISTER: ReadonlySet<string> = new Set([
  "po.created", "po.approved", "po.sent", "po.line.opened",
  "po.received", "po.closed",
  "receipt.posted", "receipt.reversed",
  "receipt.line.posted", "receipt.line.reversed",
  "transfer.dispatched", "transfer.received",
  "transfer.line.dispatched", "transfer.line.received",
  "transfer.reversed", "transfer.cancelled",
  "adjustment.requested", "adjustment.posted", "adjustment.reversed",
  "adjustment.reclassification", "adjustment.cancelled",
  "adjustment.line.posted", "adjustment.line.reversed",
  "adjustment.line.reclassification",
  "job_material.issued", "job_material.consumed", "consumption.reversed",
  "job_material.partially_consumed", "consumption.partially_reversed",
  "remnant.same_item_returned", "remnant.different_item_returned",
  "remnant.discarded", "remnant.reclassified",
  "count.observation", "count.variance.resolved",
  "count.session.opened", "count.session.closed",
  "count.line.observed", "count.line.variance.resolved",
  "vendor_return.initiated", "vendor_return.shipped", "vendor_return.received",
  "vendor_return.cancelled", "vendor_return.line.initiated",
  "physical_count.started", "physical_count.completed",
  "physical_count.adjusted",
  "disposal.requested", "disposal.posted", "disposal.reversed",
  "damage.reported", "damage.repaired",
  "quarantine.initiated", "quarantine.released",
  "recall.initiated", "recall.released",
]);

export const AUTHORIZED_2G1A_EVENTS: ReadonlySet<EventType2G1A> = new Set<EventType2G1A>([
  "po.created", "po.approved", "po.sent", "po.line.opened",
  "receipt.posted", "receipt.reversed",
  "transfer.dispatched", "transfer.received",
  "adjustment.requested", "adjustment.posted", "adjustment.reversed",
  "adjustment.reclassification",
  "job_material.issued", "job_material.consumed", "consumption.reversed",
  "remnant.same_item_returned",
  "count.observation", "count.variance.resolved",
]);

// ─── Source document types ───
export type SourceDocumentType2G1A =
  | "purchase_order"
  | "receipt"
  | "transfer"
  | "adjustment"
  | "job_material_issue"
  | "consumption"
  | "remnant"
  | "count";

// ─── Units of measure ───
export type UnitOfMeasure2G1A =
  | "ea" | "box" | "case" | "pallet" | "ft" | "in" | "yd" | "lb" | "oz"
  | "gal" | "qt" | "pt" | "sheet" | "roll" | "set" | "pair" | "unit";

export type Currency2G1A = "USD";

// ─── Position kinds (5) ───
export type PositionKind2G1A =
  | "physical_warehouse"
  | "physical_truck"
  | "custody_job"
  | "logical_in_transit"
  | "terminal_job_cost";

export type OwnershipClass2G1A = "company_owned";

export type OriginClass2G1A =
  | "none"
  | "vendor_receipt"
  | "transfer_in"
  | "unresolved";

export type ConditionClass2G1A =
  | "available"
  | "damaged"
  | "quarantined"
  | "return_pending"
  | "vendor_return_pending"
  | "expired"
  | "recalled"
  | "staged"
  | "lost";

export type RestrictionClass2G1A =
  | "none"
  | "quarantined"
  | "return_pending"
  | "vendor_return_pending"
  | "customer_held"
  | "recalled"
  | "expired"
  | "staged_unresolved";

export type TrackingMode2G1A = "ordinary";

export type FreezeStatus2G1A =
  | "none"
  | "complete_freeze"
  | "limited_freeze"
  | "controlled_movement";

export type JobIssueStatus2G1A = "open" | "closed";

export type TransferOutstandingStatus2G1A = "outstanding" | "received";

export type ProvenanceOriginalEventType2G1A =
  | "receipt.posted"
  | "adjustment.posted"
  | "job_material.issued"
  | "job_material.consumed";

// ─── Cost enums ───
export type RawCostSource2G1A =
  | "supported_explicit"
  | "selling_price"
  | "msrp"
  | "markup"
  | "other_invalid";

export const RECOGNIZED_COST_SOURCES: ReadonlySet<string> = new Set([
  "supported_explicit", "selling_price", "msrp", "markup", "other_invalid",
]);

// ─── Classification reason enums ───
export type NoEffectWorkflowReason2G1A =
  | "po_created"
  | "po_approved"
  | "po_sent"
  | "po_line_opened";

export type NoEffectCommandReason2G1A = "adjustment_requested";

export type NoEffectObservationReason2G1A = "count_observation";

// ─── Canonical-effect reason enums ───
export type PositionQuantityReason2G1A =
  | "vendor_receipt"
  | "receipt_reversal"
  | "transfer_dispatch"
  | "transfer_receipt"
  | "adjustment_posted"
  | "adjustment_reversal"
  | "job_material_issued"
  | "job_material_consumed"
  | "consumption_reversal"
  | "remnant_same_item_returned"
  | "count_variance_resolution";

export type CompanyOwnedReason2G1A =
  | "vendor_receipt"
  | "receipt_reversal"
  | "adjustment_posted"
  | "adjustment_reversal"
  | "job_material_consumed"
  | "consumption_reversal"
  | "count_variance_resolution";

export type ReclassificationReason2G1A = "adjustment_reclassification";

export type CostPreservationReason2G1A =
  | "vendor_receipt"
  | "job_material_consumed";

// ─── Error and warning codes ───
export type DomainErrorCode2G1A =
  | "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE"
  | "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B"
  | "VALIDATION.NULL_EVENT_INPUT"
  | "VALIDATION.NON_OBJECT_INPUT"
  | "VALIDATION.MISSING_REQUIRED_FIELD"
  | "VALIDATION.UNKNOWN_PAYLOAD_KEY"
  | "VALIDATION.INVALID_ENUM_VALUE"
  | "VALIDATION.NON_POSITIVE_QUANTITY"
  | "VALIDATION.ZERO_DELTA_NOT_PERMITTED"
  | "VALIDATION.NO_OP_RECLASSIFICATION"
  | "VALIDATION.MISSING_SOURCE_POSITION"
  | "VALIDATION.MISSING_DESTINATION_POSITION"
  | "VALIDATION.MISSING_ISSUE_PROVENANCE"
  | "VALIDATION.ITEM_MISMATCH"
  | "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION"
  | "VALIDATION.UNKNOWN_EVENT_TYPE"
  | "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE"
  | "VALIDATION.RECEIPT_ID_MISMATCH"
  | "VALIDATION.ISSUE_PROVENANCE_MISMATCH"
  | "VALIDATION.POSITION_MISMATCH"
  | "UOM.NON_FINITE_QUANTITY"
  | "INV.NEGATIVE_RESULT"
  | "STATE.WRONG_TRANSITION"
  | "RECONCILIATION.COMPANY_OWNED_MISMATCH"
  | "INV.IDEMPOTENCY_DUPLICATE_CONTRACT"
  | "TRANSFER.RECEIVE_WITHOUT_DISPATCH"
  | "TRANSFER.RECEIVE_EXCEEDS_DISPATCH"
  | "TRANSFER.DESTINATION_MISMATCH"
  | "CORRECTION.ORIGINAL_NOT_FOUND"
  | "CORRECTION.ALREADY_REVERSED"
  | "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE"
  | "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE"
  | "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE"
  | "RETURN.EXCEEDS_OUTSTANDING_ISSUE"
  | "VAL.SELLING_PRICE_REJECTED"
  | "VAL.MSRP_REJECTED"
  | "VAL.MARKUP_REJECTED"
  | "VAL.COST_SOURCE_INVALID";

export type DomainWarningCode2G1A = "VAL.UNRESOLVED_COST_WARNING";

export type ErrorCategory2G1A =
  | "authorization"
  | "validation"
  | "state"
  | "conservation"
  | "transfer"
  | "correction"
  | "valuation"
  | "unknown_event"
  | "commitment";

export type Severity2G1A = "blocking" | "nonblocking";

// ─── Runtime arrays for count verification ───
export const ALL_EVENT_TYPES: EventType2G1A[] = [
  "po.created", "po.approved", "po.sent", "po.line.opened",
  "receipt.posted", "receipt.reversed",
  "transfer.dispatched", "transfer.received",
  "adjustment.requested", "adjustment.posted", "adjustment.reversed",
  "adjustment.reclassification",
  "job_material.issued", "job_material.consumed", "consumption.reversed",
  "remnant.same_item_returned",
  "count.observation", "count.variance.resolved",
];

export const ALL_ERROR_CODES: DomainErrorCode2G1A[] = [
  "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE",
  "AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B",
  "VALIDATION.NULL_EVENT_INPUT",
  "VALIDATION.NON_OBJECT_INPUT",
  "VALIDATION.MISSING_REQUIRED_FIELD",
  "VALIDATION.UNKNOWN_PAYLOAD_KEY",
  "VALIDATION.INVALID_ENUM_VALUE",
  "VALIDATION.NON_POSITIVE_QUANTITY",
  "VALIDATION.ZERO_DELTA_NOT_PERMITTED",
  "VALIDATION.NO_OP_RECLASSIFICATION",
  "VALIDATION.MISSING_SOURCE_POSITION",
  "VALIDATION.MISSING_DESTINATION_POSITION",
  "VALIDATION.MISSING_ISSUE_PROVENANCE",
  "VALIDATION.ITEM_MISMATCH",
  "VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION",
  "VALIDATION.UNKNOWN_EVENT_TYPE",
  "VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE",
  "VALIDATION.RECEIPT_ID_MISMATCH",
  "VALIDATION.ISSUE_PROVENANCE_MISMATCH",
  "VALIDATION.POSITION_MISMATCH",
  "UOM.NON_FINITE_QUANTITY",
  "INV.NEGATIVE_RESULT",
  "STATE.WRONG_TRANSITION",
  "RECONCILIATION.COMPANY_OWNED_MISMATCH",
  "INV.IDEMPOTENCY_DUPLICATE_CONTRACT",
  "TRANSFER.RECEIVE_WITHOUT_DISPATCH",
  "TRANSFER.RECEIVE_EXCEEDS_DISPATCH",
  "TRANSFER.DESTINATION_MISMATCH",
  "CORRECTION.ORIGINAL_NOT_FOUND",
  "CORRECTION.ALREADY_REVERSED",
  "CORRECTION.REVERSAL_EXCEEDS_AVAILABLE",
  "CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE",
  "CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE",
  "RETURN.EXCEEDS_OUTSTANDING_ISSUE",
  "VAL.SELLING_PRICE_REJECTED",
  "VAL.MSRP_REJECTED",
  "VAL.MARKUP_REJECTED",
  "VAL.COST_SOURCE_INVALID",
];

export const ALL_WARNING_CODES: DomainWarningCode2G1A[] = [
  "VAL.UNRESOLVED_COST_WARNING",
];

export const POSITION_KINDS: PositionKind2G1A[] = [
  "physical_warehouse", "physical_truck", "custody_job",
  "logical_in_transit", "terminal_job_cost",
];