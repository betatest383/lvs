// ═════════════════════════════════════════════════════════════════
// 2G1-A ATOMIC RECORD OPERATIONS (11)
// 9 recorded (inside AcceptedEventRecord) + 2 applier-only.
// AcceptedEventRecord.recorded_operations uses RecordedDomainOperation2G1A
// which EXCLUDES AcceptedEventRecordInsertedOp and StateRevisionAdvancedOp.
// ═════════════════════════════════════════════════════════════════

import type {
  EventType2G1A, ProvenanceOriginalEventType2G1A,
  JobIssueStatus2G1A, TransferOutstandingStatus2G1A,
} from "./eventTypes.ts";
import type { AcceptedEventRecord } from "./domainState.ts";

// ─── 1. TransferOutstandingCreatedOp ───
export interface TransferOutstandingCreatedOp {
  op_kind: "transfer_outstanding_created";
  transfer_id: string;
  item_id: string;
  source_position_id: string;
  destination_position_id: string;
  in_transit_position_id: string;
  dispatched_quantity: number;
  dispatch_event_id: string;
  before: null;
  after: {
    received_quantity: 0;
    status: "outstanding";
    receive_event_id: null;
  };
}

// ─── 2. TransferOutstandingReceivedOp ───
export interface TransferOutstandingReceivedOp {
  op_kind: "transfer_outstanding_received";
  transfer_id: string;
  received_quantity: number;
  receive_event_id: string;
  before: {
    received_quantity: 0;
    status: "outstanding";
    receive_event_id: null;
  };
  after: {
    received_quantity: number;
    status: "received";
    receive_event_id: string;
  };
}

// ─── 3. CorrectionProvenanceCreatedOp ───
export interface CorrectionProvenanceCreatedOp {
  op_kind: "correction_provenance_created";
  record_id: string;
  original_event_type: ProvenanceOriginalEventType2G1A;
  original_event_id: string;
  original_item_id: string;
  original_position_id: string;
  original_signed_delta: number;
  original_absolute_quantity: number;
  reversed_absolute_quantity: number;
  remaining_reversible_quantity: number;
  related_issue_event_id: string | null;
  blocking_downstream_event_ids: string[];
  before: null;
  after: {
    reversed_absolute_quantity: 0;
    remaining_reversible_quantity: number;
    related_issue_event_id: string | null;
    blocking_downstream_event_ids: never[];
  };
}

// ─── 4. CorrectionProvenanceReversalUpdatedOp ───
export interface CorrectionProvenanceReversalUpdatedOp {
  op_kind: "correction_provenance_reversal_updated";
  provenance_record_id: string;
  original_event_id: string;
  reversal_delta_absolute: number;
  applied_signed_delta: number;
  reversing_event_id: string;
  before: {
    reversed_absolute_quantity: number;
    remaining_reversible_quantity: number;
  };
  after: {
    reversed_absolute_quantity: number;
    remaining_reversible_quantity: number;
  };
}

// ─── 5. CorrectionProvenanceDownstreamBlockUpdatedOp ───
export interface CorrectionProvenanceDownstreamBlockUpdatedOp {
  op_kind: "correction_provenance_downstream_block_updated";
  provenance_record_id: string;
  blocking_event_id: string;
  blocking_event_type: EventType2G1A;
  blocking_item_id: string;
  blocking_position_id: string;
  before: {
    blocking_downstream_event_ids: string[];
  };
  after: {
    blocking_downstream_event_ids: string[];
  };
}

// ─── 6. JobIssueProgressCreatedOp ───
export interface JobIssueProgressCreatedOp {
  op_kind: "job_issue_progress_created";
  issue_event_id: string;
  item_id: string;
  job_custody_position_id: string;
  issued_quantity: number;
  after_revision: number;
  before: null;
  after: {
    consumed_quantity: 0;
    returned_quantity: 0;
    outstanding_quantity: number;
    status: "open";
    created_revision: number;
    last_updated_revision: number;
  };
}

// ─── 7. JobIssueConsumedUpdatedOp ───
export interface JobIssueConsumedUpdatedOp {
  op_kind: "job_issue_consumed_updated";
  issue_event_id: string;
  consumption_delta: number;
  consumption_event_id: string;
  after_revision: number;
  before: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
  after: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
}

// ─── 8. JobIssueConsumedReversedOp ───
export interface JobIssueConsumedReversedOp {
  op_kind: "job_issue_consumed_reversed";
  issue_event_id: string;
  reversal_delta: number;
  reversal_event_id: string;
  after_revision: number;
  before: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
  after: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
}

// ─── 9. JobIssueReturnedUpdatedOp ───
export interface JobIssueReturnedUpdatedOp {
  op_kind: "job_issue_returned_updated";
  issue_event_id: string;
  return_delta: number;
  return_event_id: string;
  after_revision: number;
  before: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
  after: {
    consumed_quantity: number;
    returned_quantity: number;
    outstanding_quantity: number;
    status: JobIssueStatus2G1A;
    last_updated_revision: number;
  };
}

// ─── RecordedDomainOperation2G1A (9 — NONRECURSIVE) ───
// Does NOT include AcceptedEventRecordInsertedOp or StateRevisionAdvancedOp.
export type RecordedDomainOperation2G1A =
  | TransferOutstandingCreatedOp
  | TransferOutstandingReceivedOp
  | CorrectionProvenanceCreatedOp
  | CorrectionProvenanceReversalUpdatedOp
  | CorrectionProvenanceDownstreamBlockUpdatedOp
  | JobIssueProgressCreatedOp
  | JobIssueConsumedUpdatedOp
  | JobIssueConsumedReversedOp
  | JobIssueReturnedUpdatedOp;

// ─── 10. AcceptedEventRecordInsertedOp (applier-only, NOT in recorded_operations) ───
export interface AcceptedEventRecordInsertedOp {
  op_kind: "accepted_event_record_inserted";
  record: AcceptedEventRecord;
  before: null;
  after: {
    record_id: string;
  };
}

// ─── 11. StateRevisionAdvancedOp (applier-only, NOT in recorded_operations) ───
export interface StateRevisionAdvancedOp {
  op_kind: "state_revision_advanced";
  before_revision: number;
  after_revision: number;
  before: {
    state_revision: number;
  };
  after: {
    state_revision: number;
  };
}

// ─── AtomicRecordOperation2G1A (11 — outer applier set) ───
export type AtomicRecordOperation2G1A =
  | RecordedDomainOperation2G1A
  | AcceptedEventRecordInsertedOp
  | StateRevisionAdvancedOp;

// ─── Count verification arrays ───
export const RECORDED_OP_KINDS = [
  "transfer_outstanding_created",
  "transfer_outstanding_received",
  "correction_provenance_created",
  "correction_provenance_reversal_updated",
  "correction_provenance_downstream_block_updated",
  "job_issue_progress_created",
  "job_issue_consumed_updated",
  "job_issue_consumed_reversed",
  "job_issue_returned_updated",
] as const;

export const APPLIER_ONLY_OP_KINDS = [
  "accepted_event_record_inserted",
  "state_revision_advanced",
] as const;