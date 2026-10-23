// ═════════════════════════════════════════════════════════════════
// 2G1-B ATOMIC RECORD OPERATIONS
// Adds TransferOutstandingPartialReceiptUpdatedOp to the 2G1-A union.
// ═════════════════════════════════════════════════════════════════

import type { AtomicRecordOperation2G1A, RecordedDomainOperation2G1A } from "../2g1a/atomicRecordOps.ts";
import type { TransferOutstandingStatus2G1A } from "../2g1a/eventTypes.ts";

// ─── New operation: TransferOutstandingPartialReceiptUpdatedOp (§5.3) ───
export interface TransferOutstandingPartialReceiptUpdatedOp {
  op_kind: "transfer_outstanding_partial_receipt_updated";
  transfer_id: string;
  cumulative_received_after: number;
  remaining_after: number;
  new_status: TransferOutstandingStatus2G1A;
  receive_event_id: string;
  before: {
    received_quantity: number;
    remaining_quantity: number;
    status: TransferOutstandingStatus2G1A;
  };
  after: {
    received_quantity: number;
    remaining_quantity: number;
    status: TransferOutstandingStatus2G1A;
  };
}

// ─── Extended operation union (§5.4) ───
export type AtomicRecordOperation2G1B =
  | AtomicRecordOperation2G1A
  | TransferOutstandingPartialReceiptUpdatedOp;

// ─── Recorded operations (excludes applier-only ops) ───
export type RecordedDomainOperation2G1B =
  | RecordedDomainOperation2G1A
  | TransferOutstandingPartialReceiptUpdatedOp;