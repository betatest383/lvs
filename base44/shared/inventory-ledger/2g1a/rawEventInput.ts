// ═════════════════════════════════════════════════════════════════
// 2G1-A RAW EVENT INPUT (Stage C — structurally validated raw input)
// ═════════════════════════════════════════════════════════════════

import type {
  SourceDocumentType2G1A, UnitOfMeasure2G1A, EventType2G1A,
  ConditionClass2G1A, RestrictionClass2G1A,
} from "./eventTypes.ts";
import type { RawCostInput2G1A } from "./valuationRules.ts";
import type {
  E1Payload, E2Payload, E3Payload, E4Payload,
  E6Payload, E8Payload, E9Payload,
  E25Payload, E26Payload, E27Payload, E28Payload,
  E32Payload, E34Payload, E37Payload,
  E47Payload, E48Payload,
} from "./payloads.ts";

// ─── RawEventInputBase (event_type is string, not the closed enum) ───
export interface RawEventInputBase {
  event_id: string;
  event_type: string;
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

// ─── RawE5Input (cost is RawCostInput2G1A | null, not SuppliedCost) ───
export interface RawE5Input extends RawEventInputBase {
  event_type: "receipt.posted";
  purchase_order_id: string | null;
  receipt_id: string;
  destination_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
  cost: RawCostInput2G1A | null;
}

// ─── RawE33Input (cost is RawCostInput2G1A | null) ───
export interface RawE33Input extends RawEventInputBase {
  event_type: "job_material.consumed";
  consumption_id: string;
  job_custody_position_id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure2G1A;
  cost: RawCostInput2G1A | null;
  authority_marker: string;
}

// ─── RawEventInput2G1A union (closed successfully-parsed raw events) ───
// Only E5 and E33 use raw cost input; all others are identical to accepted payloads.
export type RawEventInput2G1A =
  | E1Payload | E2Payload | E3Payload | E4Payload
  | RawE5Input | E6Payload
  | E8Payload | E9Payload
  | E25Payload | E26Payload | E27Payload | E28Payload
  | E32Payload | RawE33Input | E34Payload | E37Payload
  | E47Payload | E48Payload;