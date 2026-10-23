// ═════════════════════════════════════════════════════════════════
// 2G1-A PAYLOAD CONTRACTS (18 EVENTS)
// ═════════════════════════════════════════════════════════════════

import type {
  EventType2G1A, SourceDocumentType2G1A, UnitOfMeasure2G1A,
  Currency2G1A, ConditionClass2G1A, RestrictionClass2G1A,
  NoEffectWorkflowReason2G1A, NoEffectCommandReason2G1A,
  NoEffectObservationReason2G1A,
} from "./eventTypes.ts";
import type { SuppliedCost2G1A } from "./valuationRules.ts";

// ─── DomainEventBase ───
export interface DomainEventBase {
  event_id: string;
  event_type: EventType2G1A;
  transaction_time: string;
  posting_time: string;
  source_document_type: SourceDocumentType2G1A;
  source_document_id: string;
  source_document_number: string | null;
  idempotency_key: string;
  requester: string;
  causation_id: string | null;
  correlation_id: string | null;
  notes: string;
}

// ─── E1 — po.created ───
export interface E1Payload extends DomainEventBase {
  event_type: "po.created";
  purchase_order_id: string;
  vendor_id: string;
  lines: E1Line[];
}
export interface E1Line {
  line_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E2 — po.approved ───
export interface E2Payload extends DomainEventBase {
  event_type: "po.approved";
  purchase_order_id: string;
}

// ─── E3 — po.sent ───
export interface E3Payload extends DomainEventBase {
  event_type: "po.sent";
  purchase_order_id: string;
}

// ─── E4 — po.line.opened ───
export interface E4Payload extends DomainEventBase {
  event_type: "po.line.opened";
  purchase_order_id: string;
  line_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E5 — receipt.posted ───
export interface E5Payload extends DomainEventBase {
  event_type: "receipt.posted";
  purchase_order_id: string | null;
  receipt_id: string;
  destination_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
  cost: SuppliedCost2G1A | null;
}

// ─── E6 — receipt.reversed ───
export interface E6Payload extends DomainEventBase {
  event_type: "receipt.reversed";
  original_receipt_id: string;
  reversal_quantity: number;
}

// ─── E8 — transfer.dispatched ───
export interface E8Payload extends DomainEventBase {
  event_type: "transfer.dispatched";
  transfer_id: string;
  source_position_id: string;
  in_transit_position_id: string;
  destination_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E9 — transfer.received ───
export interface E9Payload extends DomainEventBase {
  event_type: "transfer.received";
  transfer_id: string;
  destination_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E25 — adjustment.requested ───
export interface E25Payload extends DomainEventBase {
  event_type: "adjustment.requested";
  adjustment_request_id: string;
  position_id: string;
  item_id: string;
  proposed_delta: number;
  reason_text: string;
}

// ─── E26 — adjustment.posted ───
export interface E26Payload extends DomainEventBase {
  event_type: "adjustment.posted";
  adjustment_id: string;
  position_id: string;
  item_id: string;
  delta: number;
  authority_marker: string;
}

// ─── E27 — adjustment.reversed ───
export interface E27Payload extends DomainEventBase {
  event_type: "adjustment.reversed";
  original_adjustment_id: string;
  reversal_quantity: number;
}

// ─── E28 — adjustment.reclassification ───
export interface E28Payload extends DomainEventBase {
  event_type: "adjustment.reclassification";
  position_id: string;
  item_id: string;
  new_condition: ConditionClass2G1A;
  new_restriction: RestrictionClass2G1A;
}

// ─── E32 — job_material.issued ───
export interface E32Payload extends DomainEventBase {
  event_type: "job_material.issued";
  issue_id: string;
  source_position_id: string;
  job_custody_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E33 — job_material.consumed ───
export interface E33Payload extends DomainEventBase {
  event_type: "job_material.consumed";
  consumption_id: string;
  job_custody_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
  cost: SuppliedCost2G1A | null;
  authority_marker: string;
}

// ─── E34 — consumption.reversed ───
export interface E34Payload extends DomainEventBase {
  event_type: "consumption.reversed";
  original_consumption_id: string;
  reversal_quantity: number;
}

// ─── E37 — remnant.same_item_returned ───
export interface E37Payload extends DomainEventBase {
  event_type: "remnant.same_item_returned";
  return_id: string;
  original_issue_id: string;
  source_position_id: string;
  destination_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
}

// ─── E47 — count.observation ───
export interface E47Payload extends DomainEventBase {
  event_type: "count.observation";
  count_session_id: string;
  position_id: string;
  item_id: string;
  observed_quantity: number;
}

// ─── E48 — count.variance.resolved ───
export interface E48Payload extends DomainEventBase {
  event_type: "count.variance.resolved";
  count_session_id: string;
  position_id: string;
  item_id: string;
  counted_quantity: number;
  authority_marker: string;
}

// ─── DomainEvent union ───
export type DomainEvent2G1A =
  | E1Payload | E2Payload | E3Payload | E4Payload
  | E5Payload | E6Payload
  | E8Payload | E9Payload
  | E25Payload | E26Payload | E27Payload | E28Payload
  | E32Payload | E33Payload | E34Payload | E37Payload
  | E47Payload | E48Payload;