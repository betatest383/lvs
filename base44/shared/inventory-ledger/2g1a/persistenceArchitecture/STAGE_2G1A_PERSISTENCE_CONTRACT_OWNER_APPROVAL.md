# STAGE 2G1-A PERSISTENCE CONTRACT OWNER APPROVAL

## Approval Record

- **Approval title**: Stage 2G1-A Persistence Architecture Contract Owner Approval
- **Approval date**: 2026-07-28
- **Approval timezone**: America/New_York (UTC-04:00)
- **Owner**: Michael (LVC OS Owner)
- **Approval status**: APPROVED AS A PERSISTENCE ARCHITECTURE CONTRACT — NOT AUTHORIZED FOR IMPLEMENTATION

---

## Approved Proposal

- **Path**: `base44/shared/inventory-ledger/2g1a/persistenceArchitecture/STAGE_2G1A_PERSISTENCE_ADAPTER_CONTRACT_PROPOSAL.md`

### Reviewed Baseline (Provenance)

- **Reviewed baseline SHA-256**: `a3758d1e9df98b1546c8536b3db0fa860541a1ceda93adbe431a354723f2cf21`
- **Bytes**: 83,126
- **Physical lines**: 1,236
- **Final newline**: present

This hash identifies the exact proposal state reviewed before approval. It is preserved as provenance for audit traceability.

### Frozen Approved Artifact (Current Physical File State)

- **Frozen artifact SHA-256**: `1bf9ac2a321b2ffc32455c8fc8b7946a8d18e524dd7cc633f367fe89cb83e041`
- **Bytes**: 86,962
- **Physical lines**: 1,275
- **Final newline**: present

This hash identifies the current physical file state of the proposal, including the approval status label ("APPROVED AS A PERSISTENCE ARCHITECTURE CONTRACT — NOT AUTHORIZED FOR IMPLEMENTATION") and Section 14.2 (Owner-Decision Disposition). These additions are administrative record-keeping and do not change any approved architecture principle, domain behavior, or technical decision.

**The frozen approved architecture contract is the post-approval artifact.** The reviewed baseline hash is preserved as provenance. The approval record does not cite one hash as though it describes a different physical file state.

---

## Governing Contract

- **Path**: `base44/shared/inventory-ledger/contracts/STAGE_2G1A_REPLACEMENT_GOVERNING_CONTRACT_v1.0.0.md`
- **SHA-256**: `9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7`
- **Modified**: No

---

## Approved Architecture Principles

The following 15 architecture principles are approved by this authorization:

### 1. Domain Authority

The verified Stage 2G1-A TypeScript public boundary (`evaluateEvent2G1A` in `publicBoundary.ts`) remains the sole authoritative business-rules engine. Stage 2G1-A business decisions must not be duplicated in SQL, triggers, stored procedures, API handlers, or the persistence adapter.

### 2. Durable-State Authority

PostgreSQL is approved as the authoritative durable store for the inventory-ledger aggregate after separate schema and implementation authorization. The database enforces structural integrity, uniqueness, tenant isolation, referential integrity, permitted state constraints, and concurrency controls. It must not independently reinterpret domain business rules.

### 3. Load-Evaluate-Persist Model

The approved architectural direction is:
- Establish trusted tenant and actor context
- Load the complete required aggregate state
- Call the approved Stage 2G1-A public boundary
- Persist no ledger mutation for a rejected domain result
- Atomically persist the complete accepted result
- Store the AcceptedEventRecord
- Advance the durable revision exactly once
- Commit all accepted changes together

### 4. Domain-Exact Idempotency (Option A)

Domain-exact Option A is approved. A duplicate idempotency key must preserve the verified Stage 2G1-A result: `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`. Transport-level successful replay behavior, canonical fingerprints, fingerprint versioning, and new conflicting-replay errors are NOT introduced by this approval. Transport-level replay remains a possible future enhancement requiring separate owner authorization.

### 5. Accepted-Event Identity

The verified domain record identifier is preserved: `AER-{idempotency_key}-{afterRevision}`. The canonical domain record ID must be stored without changing its value and must be uniquely constrained. A separate physical database surrogate key may be proposed if technically beneficial, but it must not replace or alter the canonical domain record ID.

### 6. Trusted Identity and Authorization

Tenant, aggregate, actor, employee, role, and authorization authority must be resolved server-side. Caller-supplied identity fields must not be treated as authorization authority. Authorization must integrate with the established LVC OS EmployeeRegistry and server-side role/capability-resolution pattern. Standalone database-facing business roles such as admin, operations_manager, or warehouse_manager must not be invented unless they map explicitly to the authoritative LVC OS role registry.

### 7. Tenant Isolation

Tenant-scoped durable records and defense-in-depth tenant isolation are approved. The proposed schema must include: tenant-scoped keys and constraints, tenant-aware aggregate identity, row-level tenant isolation where technically appropriate, prevention of cross-tenant references, a narrowly privileged runtime role, and migration privileges separated from runtime privileges.

### 8. Revision and Concurrency

One monotonic durable revision per tenant-scoped inventory-ledger aggregate is approved. Concurrency control must prevent two accepted writes from committing against the same prior revision. Expected-revision checks, locking, compare-and-swap, or transaction isolation may be used as infrastructure mechanisms, but they must not invent a new Stage 2G1-A domain rejection code. Any caller-visible concurrency response remains a transport-contract decision unless separately approved.

### 9. Transactional Atomicity

An accepted event's required state changes, operations, AcceptedEventRecord, durable revision advance, and required transactional audit/outbox records must commit atomically. A failure before commit must leave no partial accepted ledger mutation. A domain rejection must not persist ledger-state changes or an AcceptedEventRecord. Security logs and infrastructure logs may exist outside the ledger transaction, but rejected-command persistence must not be introduced without separate approval.

### 10. Database Privilege Model

Direct transactional DML through a narrowly privileged persistence adapter (Model A) is approved as the current architectural recommendation. The runtime role must not execute retired database business-rules functions. A future infrastructure-only persistence procedure may be proposed only if it stores an already-evaluated result and does not make independent business decisions.

### 11. External Effect Containment

Any future external publication must use a transactionally written outbox or an equivalently safe approved mechanism. No external effect may be published before the accepted database transaction commits. Outbox consumers must tolerate duplicate delivery. External delivery must be disabled in isolated validation environments unless separately authorized.

### 12. Warnings, Errors, and Audit

Accepted-event records must preserve all fields required by the verified Stage 2G1-A contract. Persisted warnings, operations, effects, actor context, formula version, timestamps, and audit fields must follow the approved field-level mapping. Rejected results, rejected warnings, or rejected commands must not be durably stored as ledger records unless separately approved.

### 13. Snapshots and Reconstruction

Current durable state may be stored directly for efficient aggregate loading while accepted-event records remain immutable audit evidence. Snapshots, bounded-history loading, or event-history optimization may be proposed during schema design. No optimization may change verified results, revision behavior, idempotency behavior, deterministic ordering, or AcceptedEventRecord construction.

### 14. Supplied-Cost Handling

There must be one authoritative cost input for any event requiring supplied cost. The schema-design proposal must document the exact adapter transformation into the current public-boundary input. It must reject or prevent conflicting duplicate cost sources. The schema-design proposal may recommend the safest exact shape without modifying domain behavior.

### 15. Transport Behavior

HTTP status codes, response envelopes, retry hints, current-revision disclosure, and expected-revision disclosure are NOT approved as Stage 2G1-A domain behavior by this authorization. They must remain clearly classified as proposed transport-layer behavior.

---

## Owner-Decision Disposition

| Decision ID | Question (abbreviated) | Previous Status | New Status | Controlling Clause |
|---|---|---|---|---|
| OD-001 | Idempotency option | UNRESOLVED | APPROVED BY OWNER | Phase 2.4 — Option A approved |
| OD-002 | Database provider | UNRESOLVED | APPROVED BY OWNER | Phase 2.2 — PostgreSQL approved |
| OD-003 | Multi-aggregate support | UNRESOLVED | APPROVED BY OWNER | Phase 2.7 — tenant-aware aggregate identity |
| OD-004 | Database physical PK type | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 — physical key types |
| OD-005 | Database privilege model | UNRESOLVED | APPROVED BY OWNER | Phase 2.10 — direct DML approved |
| OD-006 | EmployeeRegistry integration | UNRESOLVED | APPROVED BY OWNER | Phase 2.6 — trusted identity |
| OD-007 | Tenant identity mapping | UNRESOLVED | APPROVED BY OWNER | Phase 2.7 — tenant-scoped records |
| OD-008 | PO lifecycle tracking | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 — schema details |
| OD-009 | Position lifecycle flags | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 — schema details |
| OD-010 | Outbox consumer implementation | UNRESOLVED | DEFERRED — ADAPTER IMPLEMENTATION | Phase 2.11 — outbox design approved; consumer deferred |
| OD-011 | Rejected-command audit records | UNRESOLVED | APPROVED BY OWNER | Phase 2.9, 2.12 — NOT durably stored |
| OD-012 | Warnings persistence | UNRESOLVED | APPROVED BY OWNER | Phase 2.12 — persist following approved mapping |
| OD-013 | Derived snapshots durability | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 2.13, Phase 3 — snapshot storage |
| OD-014 | Snapshotting strategy | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 2.13, Phase 3 — snapshot storage |
| OD-015 | Schema migration strategy | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 — migration mechanics |
| OD-016 | Validation namespace | UNRESOLVED | DEFERRED — OPERATIONAL OR PRODUCTION READINESS | Not required for schema design |
| OD-017 | Production-readiness criteria | UNRESOLVED | DEFERRED — OPERATIONAL OR PRODUCTION READINESS | Not required for schema design |
| OD-018 | Adapter supplied-cost shape | UNRESOLVED | APPROVED BY OWNER | Phase 2.14 — one authoritative cost input |
| OD-019 | Per-tenant vs per-aggregate revision | UNRESOLVED | APPROVED BY OWNER | Phase 2.8 — one monotonic revision per aggregate |
| OD-020 | Event-history performance strategy | UNRESOLVED | REQUIRES TECHNICAL EVIDENCE BEFORE OWNER DECISION | Phase 3 — pending technical evidence |

### Summary

- **Approved by owner**: 10 decisions (OD-001, OD-002, OD-003, OD-005, OD-006, OD-007, OD-011, OD-012, OD-018, OD-019)
- **Delegated to isolated schema design**: 6 decisions (OD-004, OD-008, OD-009, OD-013, OD-014, OD-015)
- **Deferred — adapter implementation**: 1 decision (OD-010)
- **Deferred — operational or production readiness**: 2 decisions (OD-016, OD-017)
- **Requires technical evidence before owner decision**: 1 decision (OD-020)
- **Deferred — transport/API contract**: 0 decisions (transport behavior is classified as proposed, not deferred — see Principle 15)

No decision is simultaneously approved and unresolved. No contract-fixed behavior is presented as optional. No technical implementation choice is presented as a domain rule.

---

## Deferred Decisions

### Deferred — Adapter Implementation
- OD-010: Outbox consumer implementation (outbox design is approved; consumer implementation is deferred to Phase C)

### Deferred — Operational or Production Readiness
- OD-016: Validation namespace (not required until Phase E — rollback-only database validation)
- OD-017: Production-readiness criteria (not required until Phase G — production-readiness review)

### Requires Technical Evidence Before Owner Decision
- OD-020: Event-history performance strategy (requires profiling of aggregate load time before owner can make an informed decision; not simultaneously approved and unresolved)

---

## Technical Decisions Delegated to Isolated Schema Design

The following are technical design decisions delegated to the isolated schema-design proposal. They are NOT changes to Stage 2G1-A business behavior:

- OD-004: Database physical primary-key types (TEXT vs UUID) — provide technical recommendation preserving canonical domain identifiers
- OD-008: PO lifecycle tracking schema design
- OD-009: Position lifecycle flags schema design
- OD-013: Derived snapshots durability schema design
- OD-014: Snapshotting strategy schema design
- OD-015: Schema migration strategy and deployment mechanics
- Database physical primary-key types
- Use of surrogate database keys
- Exact PostgreSQL data types
- Index implementation
- Constraint names
- Schema and table names
- Sequence strategy
- Snapshot storage details
- Bounded-history loading strategy
- Aggregate-locking implementation
- Compare-and-swap implementation
- Transaction-isolation level
- Retry limits for infrastructure failures
- Internal persistence batching
- Outbox physical layout
- Migration ownership and deployment mechanics

These may be investigated and recommended during isolated schema design. They are NOT authorized for implementation or execution.

---

## Explicit Implementation Limitations

This approval does NOT authorize:

- Database creation or provisioning
- SQL execution or migration
- Adapter implementation
- Deployment of anything
- Production changes
- Modification of the governing contract
- Modification or activation of Stage 2G1-B
- Execution of BT-042
- Introduction of new Stage 2G1-A domain rejection codes
- Approval of `fn_command_fingerprint` as a domain authority
- Persistence of rejected-command audit records
- Transport-level idempotent replay (Option B)
- Canonical fingerprint specification
- HTTP status codes, response envelopes, retry hints, or revision disclosure as settled behavior

---

## Change-Control Rule

Any future material change to any of the following requires separate owner approval:

- Domain behavior
- Idempotency behavior
- Tenant boundaries
- Revision semantics
- Transaction atomicity
- Trusted identity
- AcceptedEventRecord construction
- Persistence authority
- External-effect containment

---

## Approval Scope

- **Approved**: Persistence architecture contract (15 principles, 10 owner decisions)
- **Authorized**: Preparation of an isolated schema-design proposal
- **NOT authorized**: Database creation, SQL execution, adapter implementation, deployment, production changes

---

## Owner Approval Status

**APPROVED AS A PERSISTENCE ARCHITECTURE CONTRACT — NOT AUTHORIZED FOR IMPLEMENTATION**

This approval does not represent approval to create a database, execute SQL, implement the adapter, or deploy anything. Each implementation phase requires separate owner authorization before proceeding.
