// ═════════════════════════════════════════════════════════════════
// 2G1-A DOMAIN STATE CONTRACTS
// 9 DomainState members, including 7 Record collections.
// ═════════════════════════════════════════════════════════════════

import type {
  TrackingMode2G1A, UnitOfMeasure2G1A, PositionKind2G1A,
  OwnershipClass2G1A, OriginClass2G1A, ConditionClass2G1A,
  RestrictionClass2G1A, FreezeStatus2G1A, JobIssueStatus2G1A,
  TransferOutstandingStatus2G1A, ProvenanceOriginalEventType2G1A,
  EventType2G1A,
} from "./eventTypes.ts";

// ─── 1. DomainItem ───
export interface DomainItem {
  item_id: string;
  governed_tracking_mode: TrackingMode2G1A;
  governed_unit: UnitOfMeasure2G1A;
  valuation_method: null;
}

// ─── 2. DomainPosition ───
export interface DomainPosition {
  position_id: string;
  item_id: string;
  position_kind: PositionKind2G1A;
  ownership_class: OwnershipClass2G1A;
  origin_class: OriginClass2G1A;
  condition_class: ConditionClass2G1A;
  restriction_class: RestrictionClass2G1A;
  position_quantity: number;
  warehouse_location_id: string | null;
  bin_location_id: string | null;
  job_id: string | null;
  transfer_id: string | null;
  terminal_reference: string | null;
}

// ─── 3. DomainCompanyOwnership ───
export interface DomainCompanyOwnership {
  item_id: string;
  company_owned_quantity: number;
}

// ─── 4. TransferOutstanding ───
export interface TransferOutstanding {
  transfer_id: string;
  item_id: string;
  source_position_id: string;
  destination_position_id: string;
  in_transit_position_id: string;
  dispatched_quantity: number;
  received_quantity: number;
  status: TransferOutstandingStatus2G1A;
  dispatch_event_id: string;
  receive_event_id: string | null;
}

// ─── 5. CorrectionProvenanceRecord ───
export interface CorrectionProvenanceRecord {
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
}

// ─── 6. JobIssueProgress ───
export interface JobIssueProgress {
  issue_event_id: string;
  item_id: string;
  job_custody_position_id: string;
  issued_quantity: number;
  consumed_quantity: number;
  returned_quantity: number;
  outstanding_quantity: number;
  status: JobIssueStatus2G1A;
  created_revision: number;
  last_updated_revision: number;
}

// ─── 7. AcceptedEventRecord (NONRECURSIVE — defined with forward ref) ───
// recorded_operations excludes AcceptedEventRecordInsertedOp and StateRevisionAdvancedOp.
// Full interface defined in resultTypes.ts after all operation types are available.
// Here we define a structural placeholder that the real interface satisfies.
export interface AcceptedEventRecord {
  record_id: string;
  event: unknown; // DomainEvent2G1A — typed in payloads.ts
  state_effects: unknown[]; // CanonicalStateEffect2G1A[]
  recorded_operations: unknown[]; // RecordedDomainOperation2G1A[]
  immutable_facts: unknown[]; // ImmutableEventFact2G1A[]
  classification_results: unknown[]; // ClassificationResult2G1A[]
  derived_result_snapshots: unknown[]; // DerivedResultSnapshot2G1A[]
  notes: string;
  evaluation_timestamp: string;
  idempotency_key: string;
  canonical_state_revision: number;
  formula_version: string;
}

// ─── 8. DomainTransactionCutoff ───
export interface DomainTransactionCutoff {
  cutoff_time: string;
  freeze_status: FreezeStatus2G1A;
}

// ─── 9. DomainState ───
export interface DomainState {
  state_revision: number;
  items: Record<string, DomainItem>;
  positions: Record<string, DomainPosition>;
  company_ownership: Record<string, DomainCompanyOwnership>;
  transfers_outstanding: Record<string, TransferOutstanding>;
  correction_provenance: Record<string, CorrectionProvenanceRecord>;
  job_issue_progress: Record<string, JobIssueProgress>;
  transactions: Record<string, AcceptedEventRecord>;
  cutoff: DomainTransactionCutoff;
}

// ─── Deep clone utility (pure, no structural clone API for safety) ───
export function cloneDomainState(state: DomainState): DomainState {
  const clone: DomainState = {
    state_revision: state.state_revision,
    items: {},
    positions: {},
    company_ownership: {},
    transfers_outstanding: {},
    correction_provenance: {},
    job_issue_progress: {},
    transactions: {},
    cutoff: {
      cutoff_time: state.cutoff.cutoff_time,
      freeze_status: state.cutoff.freeze_status,
    },
  };
  for (const k of Object.keys(state.items)) {
    clone.items[k] = { ...state.items[k] } as DomainItem;
  }
  for (const k of Object.keys(state.positions)) {
    clone.positions[k] = { ...state.positions[k] } as DomainPosition;
  }
  for (const k of Object.keys(state.company_ownership)) {
    clone.company_ownership[k] = { ...state.company_ownership[k] } as DomainCompanyOwnership;
  }
  for (const k of Object.keys(state.transfers_outstanding)) {
    const t = state.transfers_outstanding[k];
    clone.transfers_outstanding[k] = { ...t };
  }
  for (const k of Object.keys(state.correction_provenance)) {
    const p = state.correction_provenance[k];
    clone.correction_provenance[k] = {
      ...p,
      blocking_downstream_event_ids: [...p.blocking_downstream_event_ids],
    };
  }
  for (const k of Object.keys(state.job_issue_progress)) {
    clone.job_issue_progress[k] = { ...state.job_issue_progress[k] } as JobIssueProgress;
  }
  for (const k of Object.keys(state.transactions)) {
    const t = state.transactions[k];
    clone.transactions[k] = {
      ...t,
      state_effects: t.state_effects ? [...(t.state_effects as unknown[])] : [],
      recorded_operations: t.recorded_operations ? [...(t.recorded_operations as unknown[])] : [],
      immutable_facts: t.immutable_facts ? [...(t.immutable_facts as unknown[])] : [],
      classification_results: t.classification_results ? [...(t.classification_results as unknown[])] : [],
      derived_result_snapshots: t.derived_result_snapshots ? [...(t.derived_result_snapshots as unknown[])] : [],
    };
  }
  return clone;
}

// ─── Helper: find position by id ───
export function getPosition(state: DomainState, positionId: string): DomainPosition | null {
  return state.positions[positionId] ?? null;
}

// ─── Helper: find item by id ───
export function getItem(state: DomainState, itemId: string): DomainItem | null {
  return state.items[itemId] ?? null;
}

// ─── Helper: find open issue for (item_id, job_custody_position_id) ───
export function findOpenIssue(state: DomainState, itemId: string, jobCustodyPositionId: string): JobIssueProgress | null {
  for (const k of Object.keys(state.job_issue_progress)) {
    const issue = state.job_issue_progress[k];
    if (issue.item_id === itemId && issue.job_custody_position_id === jobCustodyPositionId && issue.status === "open") {
      return issue;
    }
  }
  return null;
}

// ─── Helper: find issue by issue_event_id ───
export function findIssueByEventId(state: DomainState, issueEventId: string): JobIssueProgress | null {
  return state.job_issue_progress[issueEventId] ?? null;
}

// ─── Helper: find correction provenance by original_event_id ───
export function findProvenanceByOriginalEventId(state: DomainState, originalEventId: string): CorrectionProvenanceRecord | null {
  for (const k of Object.keys(state.correction_provenance)) {
    if (state.correction_provenance[k].original_event_id === originalEventId) {
      return state.correction_provenance[k];
    }
  }
  return null;
}

// ─── Helper: find accepted transaction by event_type + field match ───
export function findAcceptedTransactions(
  state: DomainState,
  eventType: EventType2G1A,
  fieldName: string,
  fieldValue: string
): AcceptedEventRecord[] {
  const results: AcceptedEventRecord[] = [];
  for (const k of Object.keys(state.transactions)) {
    const txn = state.transactions[k];
    const evt = txn.event as Record<string, unknown> | null;
    if (evt && evt.event_type === eventType) {
      const val = evt[fieldName];
      if (typeof val === "string" && val === fieldValue) {
        results.push(txn);
      }
    }
  }
  return results;
}