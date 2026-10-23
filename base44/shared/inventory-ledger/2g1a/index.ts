// ═════════════════════════════════════════════════════════════════
// 2G1-A MODULE INDEX — Public Exports
// Isolated module: no SDK, no entity/auth, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

// Public API
export { evaluateEvent2G1A } from "./publicBoundary.ts";

// Types
export type { EventType2G1A, DomainErrorCode2G1A, DomainWarningCode2G1A } from "./eventTypes.ts";
export type { DomainState, DomainPosition, DomainItem, DomainCompanyOwnership, TransferOutstanding, CorrectionProvenanceRecord, JobIssueProgress, AcceptedEventRecord, DomainTransactionCutoff } from "./domainState.ts";
export type { DomainEvent2G1A, E5Payload, E33Payload, E32Payload, E34Payload, E37Payload, E48Payload } from "./payloads.ts";
export type { DomainResult2G1A, AcceptedDomainResult, RejectedDomainResult, DomainError, DomainWarning } from "./resultTypes.ts";
export type { CanonicalStateEffect2G1A, PositionQuantityEffect, CompanyOwnedEffect } from "./quantityEffects.ts";
export type { AtomicRecordOperation2G1A, RecordedDomainOperation2G1A } from "./atomicRecordOps.ts";
export type { ClassificationResult2G1A, DerivedResultSnapshot2G1A } from "./classificationResults.ts";
export type { CostPreservationResult, SuppliedCost2G1A } from "./valuationRules.ts";
export type { RawEventInput2G1A } from "./rawEventInput.ts";

// Compile checks
export { runCompileChecks } from "./compileCheck.ts";
export type { CompileCheckResult } from "./compileCheck.ts";

// Constants
export { ALL_EVENT_TYPES, ALL_ERROR_CODES, ALL_WARNING_CODES, POSITION_KINDS } from "./eventTypes.ts";
export { FORMULA_VERSION } from "./resultTypes.ts";