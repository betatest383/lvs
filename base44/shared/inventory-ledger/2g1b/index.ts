// ═════════════════════════════════════════════════════════════════
// 2G1-B MODULE INDEX — Public Exports
// Isolated module: no SDK, no entity/auth, no network, no production deps.
// ═════════════════════════════════════════════════════════════════

// Public API
export { evaluateEvent2G1B, sortOperations2G1B, sortErrors2G1B } from "./publicBoundary.ts";
export { validateTransferOutstandingConsistency, validateAllInvariants2G1B } from "./invariantValidators.ts";
export { FORMULA_VERSION_2G1B, makeError2G1B, makeRejected2G1B } from "./resultTypes.ts";
export { runAllTests2G1B } from "./testSuite.ts";

// Types
export type { DomainErrorCode2G1B } from "./eventTypes.ts";
export type { TransferOutstandingPartialReceiptUpdatedOp, AtomicRecordOperation2G1B, RecordedDomainOperation2G1B } from "./atomicRecordOps.ts";
export type { DomainError2G1B, AcceptedDomainResult2G1B, RejectedDomainResult2G1B, DomainResult2G1B } from "./resultTypes.ts";
export type { TestResult2G1B, TestRunResult2G1B } from "./testSuite.ts";