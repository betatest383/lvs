// ═════════════════════════════════════════════════════════════════
// 2G1-A RESULT TYPES
// ═════════════════════════════════════════════════════════════════

import type {
  DomainErrorCode2G1A, DomainWarningCode2G1A,
  ErrorCategory2G1A, Severity2G1A, EventType2G1A,
} from "./eventTypes.ts";
import type { DomainEvent2G1A } from "./payloads.ts";
import type { DomainState } from "./domainState.ts";
import type { CanonicalStateEffect2G1A } from "./quantityEffects.ts";
import type { AtomicRecordOperation2G1A } from "./atomicRecordOps.ts";
import type { ImmutableEventFact2G1A } from "./valuationRules.ts";
import type { ClassificationResult2G1A, DerivedResultSnapshot2G1A } from "./classificationResults.ts";

// ─── DomainError ───
export interface DomainError {
  error_code: DomainErrorCode2G1A;
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

// ─── DomainWarning ───
export interface DomainWarning {
  warning_code: DomainWarningCode2G1A;
  category: "valuation";
  message: string;
  affected_field: string | null;
  event_type: EventType2G1A | "<unknown>";
}

// ─── AcceptedDomainResult ───
export interface AcceptedDomainResult {
  ok: true;
  event: DomainEvent2G1A;
  proposed_state: DomainState;
  state_effects: CanonicalStateEffect2G1A[];
  atomic_record_operations: AtomicRecordOperation2G1A[];
  immutable_facts: ImmutableEventFact2G1A[];
  classification_results: ClassificationResult2G1A[];
  derived_result_snapshots: DerivedResultSnapshot2G1A[];
  warnings: DomainWarning[];
  idempotency_key: string;
  canonical_state_revision: number;
  formula_version: string;
  evaluation_timestamp: string;
}

// ─── RejectedDomainResult ───
export interface RejectedDomainResult {
  ok: false;
  event: DomainEvent2G1A | null;
  proposed_state: null;
  state_effects: [];
  atomic_record_operations: [];
  immutable_facts: [];
  classification_results: [];
  derived_result_snapshots: [];
  errors: DomainError[];
  warnings: DomainWarning[];
  idempotency_key: string | null;
  evaluation_timestamp: string;
}

// ─── DomainResult union ───
export type DomainResult2G1A = AcceptedDomainResult | RejectedDomainResult;

// ─── Helper: build a DomainError ───
export function makeError(
  errorCode: DomainErrorCode2G1A,
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
): DomainError {
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

// ─── Helper: build a DomainWarning ───
export function makeWarning(
  warningCode: DomainWarningCode2G1A,
  message: string,
  eventType: EventType2G1A | "<unknown>",
  affectedField?: string | null
): DomainWarning {
  return {
    warning_code: warningCode,
    category: "valuation",
    message,
    affected_field: affectedField ?? null,
    event_type: eventType,
  };
}

// ─── Helper: build a rejected result ───
export function makeRejected(
  errors: DomainError[],
  warnings: DomainWarning[],
  eventType: EventType2G1A | "<unknown>",
  idempotencyKey: string | null
): RejectedDomainResult {
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

// ─── Formula version ───
export const FORMULA_VERSION = "2g1a-v1.0.0";