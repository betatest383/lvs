// ═════════════════════════════════════════════════════════════════
// 2G1-B RESULT TYPES
// DomainError2G1B, AcceptedDomainResult2G1B, RejectedDomainResult2G1B,
// DomainResult2G1B, makeError2G1B, makeRejected2G1B, FORMULA_VERSION_2G1B
// ═════════════════════════════════════════════════════════════════

import type {
  EventType2G1A, ErrorCategory2G1A, Severity2G1A,
} from "../2g1a/eventTypes.ts";
import type { DomainState } from "../2g1a/domainState.ts";
import type { DomainEvent2G1A } from "../2g1a/payloads.ts";
import type { CanonicalStateEffect2G1A } from "../2g1a/quantityEffects.ts";
import type { ImmutableEventFact2G1A } from "../2g1a/valuationRules.ts";
import type { ClassificationResult2G1A, DerivedResultSnapshot2G1A } from "../2g1a/classificationResults.ts";
import type { DomainWarning } from "../2g1a/resultTypes.ts";
import type { DomainErrorCode2G1B } from "./eventTypes.ts";
import type { AtomicRecordOperation2G1B } from "./atomicRecordOps.ts";

// ─── Formula version (§12.3) ───
export const FORMULA_VERSION_2G1B = "2g1b-v1.0.0";

// ─── DomainError2G1B (§5.2) ───
export interface DomainError2G1B {
  error_code: DomainErrorCode2G1B;
  category: ErrorCategory2G1A;
  severity: Severity2G1A;
  message: string;
  affected_field: string | null;
  affected_relationship: string | null;
  event_type: EventType2G1A | "<unknown>";
  invariant_references: string[];
  decision_references: string[];
  exception_workflow_required: boolean;
  safe_context: Record<string, string | number | boolean>;
}

// ─── AcceptedDomainResult2G1B (§5.5) ───
export interface AcceptedDomainResult2G1B {
  ok: true;
  event: DomainEvent2G1A;
  proposed_state: DomainState;
  state_effects: CanonicalStateEffect2G1A[];
  atomic_record_operations: AtomicRecordOperation2G1B[];
  immutable_facts: ImmutableEventFact2G1A[];
  classification_results: ClassificationResult2G1A[];
  derived_result_snapshots: DerivedResultSnapshot2G1A[];
  warnings: DomainWarning[];
  idempotency_key: string;
  canonical_state_revision: number;
  formula_version: string;
  evaluation_timestamp: string;
}

// ─── RejectedDomainResult2G1B (§5.5) ───
export interface RejectedDomainResult2G1B {
  ok: false;
  event: DomainEvent2G1A | null;
  proposed_state: null;
  state_effects: [];
  atomic_record_operations: [];
  immutable_facts: [];
  classification_results: [];
  derived_result_snapshots: [];
  errors: DomainError2G1B[];
  warnings: DomainWarning[];
  idempotency_key: string | null;
  evaluation_timestamp: string;
}

// ─── DomainResult2G1B (§5.5) ───
export type DomainResult2G1B = AcceptedDomainResult2G1B | RejectedDomainResult2G1B;

// ─── Helper: build a DomainError2G1B ───
export function makeError2G1B(
  errorCode: DomainErrorCode2G1B,
  category: ErrorCategory2G1A,
  message: string,
  eventType: EventType2G1A | "<unknown>",
  extra?: {
    affected_field?: string | null;
    affected_relationship?: string | null;
    invariant_references?: string[];
    decision_references?: string[];
    safe_context?: Record<string, string | number | boolean>;
  }
): DomainError2G1B {
  return {
    error_code: errorCode,
    category,
    severity: "blocking",
    message,
    affected_field: extra?.affected_field ?? null,
    affected_relationship: extra?.affected_relationship ?? null,
    event_type: eventType,
    invariant_references: extra?.invariant_references ?? [],
    decision_references: extra?.decision_references ?? [],
    exception_workflow_required: false,
    safe_context: extra?.safe_context ?? {},
  };
}

// ─── Helper: build a rejected result ───
export function makeRejected2G1B(
  errors: DomainError2G1B[],
  warnings: DomainWarning[],
  eventType: EventType2G1A | "<unknown>",
  idempotencyKey: string | null
): RejectedDomainResult2G1B {
  return {
    ok: false,
    event: null,
    proposed_state: null,
    state_effects: [],
    atomic_record_operations: [],
    immutable_facts: [],
    classification_results: [],
    derived_result_snapshots: [],
    errors,
    warnings,
    idempotency_key: idempotencyKey,
    evaluation_timestamp: new Date().toISOString(),
  };
}