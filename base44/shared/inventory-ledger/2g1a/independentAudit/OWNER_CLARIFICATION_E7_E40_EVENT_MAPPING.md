# OWNER CLARIFICATION — Stage 2G1-A E-Number-to-Event-Type Mapping

## Record Identity

- **Record ID**: OCLR-2G1A-E7-E40-001
- **Type**: Immutable Owner Clarification Record
- **Date**: 2026-07-27
- **Scope**: Stage 2G1-A governing contract canonical acceptance tests (AT-105, AT-106)
- **Status**: ACTIVE — authoritatively resolves ambiguity

## Clarification

The Stage 2G1-A governing contract (SHA-256: 9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7) references E-numbers E7 and E40 in its canonical acceptance test definitions (Appendix C, lines 473–474) and in the traceability registry (traceabilityRegistry.ts, lines 185–186). The original independent source artifact that established these numbered mappings (SHA-256: df9e621e...) is unavailable and was not recoverable despite exhaustive search across the filesystem, git history, and blob objects.

Because no independent approved source establishing the numbered mappings remains available, the prior evidence was classified as:

**C. AMBIGUOUS — OWNER DIRECTION REQUIRED**

## Owner Direction

For purposes of the Stage 2G1-A governing contract and its canonical acceptance tests, the owner confirms the intended canonical mappings are:

| E-Number | Event Type | Test ID | Test Action |
|----------|-----------|---------|-------------|
| E7 | po.received | AT-106 | Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero state mutation |
| E40 | disposal.requested | AT-105 | Reject with AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero state mutation |

## Scope Limitations

This clarification:

1. Resolves the E7/E40 mapping ambiguity for AT-105 and AT-106 only.
2. Does **not** authorize changing the behavior, scope, or requirements of Stage 2G1-A.
3. Does **not** modify the governing contract (SHA-256 unchanged).
4. Does **not** modify the production implementation (publicBoundary.ts, eventTypes.ts, or any other source file).
5. Does **not** modify the test bodies (AT-105 and AT-106 already use the correct event types: `disposal.requested` and `po.received` respectively).
6. Applies only within the Stage 2G1-A governing contract scope.

## Independent Evidence Supporting This Clarification

The following independent code-level evidence confirms both event types are recognized deferred discriminators (present in E1_E55_REGISTER, absent from AUTHORIZED_2G1A_EVENTS), and that both AT-105 and AT-106 produce the expected rejection:

| Evidence | Source | Line | Content |
|----------|-------|------|---------|
| E1_E55_REGISTER contains po.received | eventTypes.ts | 30 | `"po.received"` in E1_E55_REGISTER set |
| E1_E55_REGISTER contains disposal.requested | eventTypes.ts | 51 | `"disposal.requested"` in E1_E55_REGISTER set |
| AT-105 uses disposal.requested | testSuite.ts | 430 | `mkEvent("disposal.requested", ...)` |
| AT-106 uses po.received | testSuite.ts | 433 | `mkEvent("po.received", ...)` |
| AT-105 uses disposal.requested | auditSuite.ts | 373 | `mkEvent("disposal.requested", ...)` |
| AT-106 uses po.received | auditSuite.ts | 376 | `mkEvent("po.received", ...)` |
| AT-105 expects AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero mutation | testSuite.ts | 430 | `rejZm("AT-105", ..., "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...)` |
| AT-106 expects AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero mutation | testSuite.ts | 433 | `rejZm("AT-106", ..., "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...)` |
| AT-105 expects AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero mutation | auditSuite.ts | 373 | `rejZm("AT-105", ..., "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...)` |
| AT-106 expects AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE + zero mutation | auditSuite.ts | 376 | `rejZm("AT-106", ..., "AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE", ...)` |

## Resolved Classification

AT-105 and AT-106 are reclassified as:

**AUTHORITATIVELY RESOLVED BY OWNER CLARIFICATION**

- Final semantic match: **Yes**
- Clarification record path: `base44/shared/inventory-ledger/2g1a/independentAudit/OWNER_CLARIFICATION_E7_E40_EVENT_MAPPING.md`
- Clarification record SHA-256: (computed at file creation)

## Immutability

This record is immutable. It must not be modified, deleted, or superseded without a new, separately identified owner-clarification record referencing this one by its SHA-256 hash.