# STAGE 2G1-A PERSISTENCE ADAPTER CONTRACT PROPOSAL

**APPROVED AS A PERSISTENCE ARCHITECTURE CONTRACT — NOT AUTHORIZED FOR IMPLEMENTATION**

Owner approval record: `STAGE_2G1A_PERSISTENCE_CONTRACT_OWNER_APPROVAL.md` (adjacent to this file).

---

## 0. Executive Architecture Decision

Stage 2G1-A canonical inventory ledger domain is a pure in-memory evaluation function (`evaluateEvent2G1A` in `publicBoundary.ts`). The governing contract (SHA-256: `9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7`) authorizes this function as the sole business-rules engine. No persistence adapter exists.

This proposal specifies a **load-evaluate-persist adapter** architecture:

1. The adapter loads a complete `DomainState` aggregate from durable storage.
2. The adapter calls `evaluateEvent2G1A(rawInput, state)`.
3. On rejection, the adapter persists nothing and returns the rejection.
4. On acceptance, the adapter atomically persists all state effects, atomic operations, the `AcceptedEventRecord`, and advances the revision within a single database transaction.

**The TypeScript domain engine is authoritative.** PostgreSQL is durable state. No business rules are duplicated in SQL. The SQL function `fn_receive_purchase_order` in the existing SQL script implements receipt logic independently and must not be used as the adapter business-rules path — it is an architectural dead end that creates dual-implementation drift risk.

**Idempotency note**: The verified domain function rejects all duplicate idempotency keys with `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`. This proposal recommends preserving that behavior exactly (Option A, OD-001). An optional transport-level replay contract (Option B) that returns a previously committed response without re-evaluating the domain is a new transport contract requiring separate owner approval. See Section 3.3.

---

## 1. Current-State Findings

### 1.1 Public Evaluation Boundary

- **File**: `base44/shared/inventory-ledger/2g1a/publicBoundary.ts`
- **Signature**: `evaluateEvent2G1A(rawInput: unknown, state: DomainState): DomainResult2G1A`
- **Source**: publicBoundary.ts line 89
- **Purity**: Pure function. No imports of `pg`, `postgres`, `supabase`, `@base44/sdk`, `fetch`, `fs`, or any I/O module. No network calls. No mutation of input `state`.
- **Line count**: 1,581
- **Entry point**: Single function. No side effects beyond returning a result.

### 1.2 Domain Inputs and Outputs

**Input**: `rawInput: unknown` (untyped raw event) + `state: DomainState` (current aggregate state).

**Output**: `DomainResult2G1A` union:
- `AcceptedDomainResult` (resultTypes.ts): contains `ok: true`, `event`, `proposed_state: DomainState` (deep clone with mutations applied), `state_effects`, `atomic_record_operations`, `immutable_facts`, `classification_results`, `derived_result_snapshots`, `warnings`, `idempotency_key`, `canonical_state_revision`, `formula_version`, `evaluation_timestamp`.
- `RejectedDomainResult` (resultTypes.ts): contains `ok: false`, `event: null`, `proposed_state: null`, `state_effects: []`, `atomic_record_operations: []`, `immutable_facts: []`, `classification_results: []`, `derived_result_snapshots: []`, `errors`, `warnings`, `idempotency_key` (nullable), `evaluation_timestamp`. No state mutation. No proposed state. No operations.

### 1.3 Supplied Cost as a Separate Input

Supplied cost is NOT a separate function parameter. It is a field on the raw event object, parsed internally by `evaluateEvent2G1A`.

- **Stage D** (publicBoundary.ts lines 152-209): Only `receipt.posted` (E5) and `job_material.consumed` (E33) parse the `cost` field from `rawInput`.
- The `cost` field is typed as `RawCostInput2G1A | null` (rawEventInput.ts lines 43, 54).
- It is parsed via `parseCost()` into `SuppliedCost2G1A | null` (valuationRules.ts).
- If `cost` is `null` or `undefined`: accepted with `VAL.UNRESOLVED_COST_WARNING` warning, no `CostPreservationResult`.
- If `cost_source` is unrecognized: rejected with `VAL.COST_SOURCE_INVALID`.
- Only `supported_explicit` cost source produces a `CostPreservationResult` (immutable fact).
- All other 16 event types do not have a `cost` field.

### 1.4 Idempotency Behavior (Domain-Exact)

**Source**: publicBoundary.ts lines 380-390.

The idempotency check runs INSIDE `evaluateEvent2G1A`, as part of `processEvent()`:

```
const idemKey = evt.idempotency_key as string;
for (const txnId of Object.keys(state.transactions)) {
  const txn = state.transactions[txnId];
  if (txn.idempotency_key === idemKey) {
    return makeRejected(
      [makeError("INV.IDEMPOTENCY_DUPLICATE_CONTRACT", "commitment",
        `Duplicate idempotency key: ${idemKey}`, eventType,
        { affected_field: "idempotency_key", safe_context: { idempotency_key: idemKey } })],
      sortWarnings(c.warnings), eventType, idemKey
    );
  }
}
```

Key facts:
1. The domain function does NOT compute a payload fingerprint or hash.
2. The domain function does NOT distinguish "same key + same payload" from "same key + different payload". Both produce `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`.
3. The idempotency check runs BEFORE finiteness/positivity checks and BEFORE entity lookups (governing contract Section 5).
4. The domain function is invoked for every request, including duplicates. The duplicate check is INSIDE the function, not a pre-check.
5. There is no `IDEMPOTENCY_CONFLICT` rejection code in the domain function. The 38-code registry (Appendix B of the governing contract) does not include it.

### 1.5 Event Fingerprint

**The Stage 2G1-A domain does NOT define a canonical event fingerprint.**

- `evaluateEvent2G1A` computes no hash of the raw input.
- The `payload_hash` field on `AcceptedEventRecord` in the SQL script is populated by `fn_command_fingerprint`, which is a SQL-side function NOT present in the domain function.
- The domain `AcceptedEventRecord` (domainState.ts) has no `payload_hash` field.
- The SQL script's `fn_command_fingerprint` (SHA-256 of a canonicalized command document + canon version) is a database-side concern, not a domain function concern.
- **`fn_command_fingerprint` is NOT approved** by the governing contract as a domain authority. It exists only in the unexecuted SQL artifact. Retaining it as a utility would introduce a TypeScript/SQL canonicalization drift risk. See Section 7.

### 1.6 AcceptedEventRecord Identifier Format

**Source**: publicBoundary.ts line 417.

```
const recordId = `AER-${idemKey}-${c.afterRevision}`;
```

Format: `AER-{idempotency_key}-{afterRevision}`

Example: If `idempotency_key = "IDEM-032"` and `afterRevision = 2`, then `record_id = "AER-IDEM-032-2"`.

The `afterRevision` is `state.state_revision + 1` (publicBoundary.ts line 84).

### 1.7 State Revision Behavior

**Source**: publicBoundary.ts lines 83-84, 463.

- `beforeRevision = state.state_revision` (line 83)
- `afterRevision = state.state_revision + 1` (line 84)
- On acceptance: `cloned.state_revision = c.afterRevision` (line 463). Revision advances by exactly 1.
- On rejection: revision is NOT advanced. No state mutation occurs.
- The revision is a single counter on `DomainState.state_revision` (domainState.ts line 115). It is per-aggregate, not per-tenant.
- The SQL script uses a `state_revision` table per tenant (discrepancy #12 in Section 1.10).

### 1.8 AcceptedEventRecord Fields

**Source**: publicBoundary.ts lines 418-431, domainState.ts lines 92-105.

| Field | Type | Description |
|-------|------|-------------|
| `record_id` | string | `AER-{idempotency_key}-{afterRevision}` |
| `event` | DomainEvent2G1A | The typed event |
| `state_effects` | CanonicalStateEffect2G1A[] | Sorted effects (4 kinds) |
| `recorded_operations` | RecordedDomainOperation2G1A[] | Sorted operations (9 op kinds, excludes applier-only) |
| `immutable_facts` | ImmutableEventFact2G1A[] | Cost preservation facts |
| `classification_results` | ClassificationResult2G1A[] | No-effect classifications (3 kinds) |
| `derived_result_snapshots` | DerivedResultSnapshot2G1A[] | Availability snapshots (1 kind) |
| `notes` | string | Empty string |
| `evaluation_timestamp` | string | ISO timestamp |
| `idempotency_key` | string | The idempotency key |
| `canonical_state_revision` | number | afterRevision |
| `formula_version` | string | `"2g1a-v1.0.0"` |

### 1.9 DomainState (9 Members)

**Source**: domainState.ts lines 114-124.

| Member | Type | Purpose |
|--------|------|---------|
| `state_revision` | `number` | Monotonic revision counter. Incremented by 1 on each accepted event. |
| `items` | `Record<string, DomainItem>` | Master item definitions. |
| `positions` | `Record<string, DomainPosition>` | Inventory positions. |
| `company_ownership` | `Record<string, DomainCompanyOwnership>` | Per-item company-owned aggregate quantity. |
| `transfers_outstanding` | `Record<string, TransferOutstanding>` | In-flight transfers awaiting receipt. |
| `correction_provenance` | `Record<string, CorrectionProvenanceRecord>` | Reversible-event provenance and downstream blockers. |
| `job_issue_progress` | `Record<string, JobIssueProgress>` | Job-material issue lifecycle tracking. |
| `transactions` | `Record<string, AcceptedEventRecord>` | Accepted event ledger (append-only). Used for idempotency duplicate detection. |
| `cutoff` | `DomainTransactionCutoff` | Freeze/cutoff configuration. |

The function clones the input state before mutation (`cloneDomainState`, domainState.ts line 127). The original `state` is never mutated.

### 1.10 Current SQL Schema Proposal

- **File**: `base44/shared/inventory-ledger/stage_2g1a_receipt_validation.sql`
- **Line count**: 924
- **Engine**: PostgreSQL 15.x with `pgcrypto`
- **Schema**: `ledger`
- **Tables**: 15
- **Functions**: 7 (`fn_canonicalize_command`, `fn_command_fingerprint`, `fn_derive_line_status`, `fn_derive_po_status`, `fn_finalize_rejection`, `fn_receive_purchase_order`, `fn_prevent_accepted_event_mutation`)
- **Triggers**: 2 (prevent UPDATE/DELETE on `accepted_events`)
- **RLS**: 15 policies, all tenant-scoped
- **Roles**: 5 NOLOGIN roles
- **Test fixtures**: Section 14 contains embedded test data using `TRUNCATE` for cleanup

### 1.11 Discrepancies Between Domain Model and SQL Model

| # | Domain Model | SQL Model | Discrepancy |
|---|-------------|-----------|-------------|
| 1 | `DomainItem.valuation_method: null` | Not present in `items` table | SQL omits field |
| 2 | `DomainPosition.origin_class` | Not present in `positions` table | SQL omits tracking |
| 3 | `DomainPosition.condition_class` | Not present in `positions` table | SQL omits condition tracking |
| 4 | `DomainPosition.restriction_class` | Not present in `positions` table | SQL omits restriction tracking |
| 5 | `DomainPosition.warehouse_location_id`, `bin_location_id`, `job_id`, `transfer_id`, `terminal_reference` | Not present in `positions` table | SQL uses `warehouse_id` only |
| 6 | `DomainCompanyOwnership` (per-item aggregate) | Not present as a table | SQL has no company-owned aggregate table |
| 7 | `TransferOutstanding` | Not present as a table | SQL has no transfer outstanding tracking |
| 8 | `CorrectionProvenanceRecord` | Not present as a table | SQL has no provenance or blocker tracking |
| 9 | `JobIssueProgress` | Not present as a table | SQL has no job issue tracking |
| 10 | `AcceptedEventRecord` with full effects, operations, facts, classifications, snapshots | `accepted_events` table stores only `payload_json`, `payload_hash`, `canonical_revision` | SQL stores a minimal event record |
| 11 | Domain handles 18 event types | SQL `fn_receive_purchase_order` handles only receipt | SQL implements one event type business logic |
| 12 | Domain uses `state_revision` per aggregate | SQL uses `state_revision` per tenant | SQL assumes single-aggregate-per-tenant |
| 13 | `DomainTransactionCutoff` | Not present | SQL has no cutoff/freeze mechanism |
| 14 | Domain does not track PO line receipt/cancellation status | SQL `purchase_order_lines` has lifecycle fields | SQL adds PO lifecycle tracking not present in domain |
| 15 | Domain `positions` have `position_quantity` | SQL `positions` also have lifecycle flags | SQL adds lifecycle flags not present in domain |
| 16 | Domain idempotency: all duplicates return `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | SQL idempotency: distinguishes same-hash (return existing) from different-hash (`IDEMPOTENCY_CONFLICT`) | SQL has richer idempotency semantics; domain has simpler duplicate rejection |
| 17 | Domain has no cost preservation stored separately | SQL `accepted_events` has `payload_hash` but no separate cost fact storage | SQL does not store `ImmutableEventFact2G1A` |
| 18 | Domain `formula_version` is `"2g1a-v1.0.0"` | SQL checks `formula_version` but adds `canon_version` | SQL adds `canon_version` not present in domain |

### 1.12 Abandoned Persistence Experiments

1. **Base44 single-aggregate persistence** — Failed CAS atomicity tests and uniqueness enforcement. Abandoned.
2. **`updateMany()` for compare-and-set** — Failed to provide deterministic atomic revision advancement. Abandoned.
3. **SERIALIZABLE isolation with PostgREST** — PostgREST does not support mid-transaction isolation switching. Abandoned.
4. **Local apt-based PostgreSQL installation** — Violated boundary authorization. Abandoned.
5. **SQL `fn_receive_purchase_order` as business logic** — Dual-implementation drift risk. Dead end.
6. **Manual revalidation without local PostgreSQL** — Failed due to lack of environment access.

### 1.13 Existing Application Backend-Function Patterns

The application has 90+ backend functions in `base44/functions/*/entry.ts`. Relevant patterns:

- **Entity CRUD patterns**: `manageTask`, `manageBinLocation`, `manageWarehouseLocation` — use `base44.entities.*` SDK for Base44 platform MongoDB-backed entities, not external PostgreSQL.
- **Inventory transaction patterns**: `processInventoryTransaction`, `processInventoryMasterTransaction`, `processConsumableTransaction` — these operate on Base44 entities, not the 2G1-A ledger domain.
- **No function** currently references `evaluateEvent2G1A`, `publicBoundary.ts`, or any `ledger.*` database object.

### 1.14 EmployeeRegistry and Role-Resolution Pattern

The LVC OS application has a server-side EmployeeRegistry entity (`base44/entities/EmployeeRegistry.jsonc`) and role-resolution infrastructure (`src/hooks/useRoleRegistry.js`, `src/lib/roleRegistryConstants.js`, `base44/functions/resolveUserIdentity/entry.ts`, `base44/functions/resolveCanonicalIdentity/entry.ts`).

The adapter would need to resolve the authenticated user to an EmployeeRegistry record and role for authorization. This integration is **UNRESOLVED** — the existing `resolveUserIdentity` and `resolveCanonicalIdentity` functions operate on Base44 platform users, not on database-level tenant/role scoping. The mapping from an authenticated Base44 user to a ledger tenant ID, aggregate ID, and authorization capability set is not yet designed.

---

## 2. Persistence Authority Model

### 2.1 Recommended Authority Model: Domain-First Load-Evaluate-Persist

**TypeScript domain engine is authoritative for business rules.** PostgreSQL is authoritative for durable state. The adapter is a thin persistence boundary.

| Concern | Authority |
|---------|-----------|
| Business rules (validation, effect computation, invariant checking) | TypeScript `evaluateEvent2G1A()` |
| Durable state (positions, quantities, revision, accepted records) | PostgreSQL |
| Idempotency key uniqueness | PostgreSQL unique constraint (concurrency guard only) |
| Revision advancement (atomic compare-and-swap) | PostgreSQL row-level lock on `state_revision` |
| Tenant isolation | PostgreSQL RLS |
| AcceptedEventRecord immutability | PostgreSQL trigger (prevent UPDATE/DELETE) |
| Outbox publication (projection sync) | PostgreSQL outbox table (same transaction) |

### 2.2 Alternatives Considered

| Alternative | Verdict |
|-------------|---------|
| SQL functions as business rules | **Rejected** — dual-implementation drift; SQL cannot express all 18 event types |
| Event sourcing with projection rebuild | **Deferred** — adds complexity before basic persistence is validated |
| Base44 entity storage as ledger | **Rejected** — failed CAS atomicity tests |
| Separate microservice | **Over-engineered** — adds network boundary and operational complexity |

### 2.3 Single Business-Rules Implementation

The adapter contract mandates:

1. The adapter calls `evaluateEvent2G1A()` for all event evaluation.
2. The SQL `fn_receive_purchase_order` function is **retired** (not called by the adapter).
3. No SQL function may make business decisions (accept/reject, compute effects, validate invariants).

---

## 3. Adapter Interface

### 3.1 Request and Context Separation

The adapter request MUST distinguish caller-controlled data from trusted server-resolved execution context.

#### A. Caller-Controlled Request Data

```
interface CallerRequest {
  // Raw event (untyped, validated by domain engine)
  raw_event: unknown;

  // Expected state revision for optimistic concurrency
  // (if contractually permitted — see OD-019)
  expected_revision: number | null;

  // Request/correlation metadata
  correlation_id: string | null;
  request_id: string;  // unique per HTTP request
}
```

Note: Supplied cost is NOT a separate adapter input in this interface. It is a field on `raw_event` (`cost`), parsed internally by `evaluateEvent2G1A` for E5 (`receipt.posted`) and E33 (`job_material.consumed`) only. See Section 1.3. The adapter supplied-cost shape is an owner decision — see Section 3.1.C (OD-018).

#### B. Trusted Server-Resolved Execution Context

```
interface ServerContext {
  // Tenant identity (server-resolved, never caller-supplied)
  tenant_id: string;

  // Aggregate identity (server-resolved)
  aggregate_id: string;

  // Authenticated actor identity (server-resolved from session token)
  actor_identity: string;  // email or user ID

  // Authoritative employee ID (resolved from EmployeeRegistry)
  employee_id: string | null;

  // Authoritative role ID and role key (resolved from role-resolution service)
  role_id: string | null;
  role_key: string | null;

  // Authorization decision or capability set
  authorization: {
    is_authorized: boolean;
    capabilities: string[];  // e.g., ["ledger:write", "ledger:adjust"]
  };
}
```

**Tenant, aggregate, actor, employee, role, and authorization authority MUST NOT be accepted from the caller-controlled request body.** The adapter resolves these from the authenticated session.

**Role resolution integration**: The existing LVC OS EmployeeRegistry pattern (`EmployeeRegistry` entity, `resolveUserIdentity`, `resolveCanonicalIdentity`) operates on Base44 platform users. The mapping from an authenticated Base44 user to a ledger tenant ID, aggregate ID, employee ID, and authorization capability set is **UNRESOLVED**. No role names are invented. The adapter must either:
1. Extend the existing `resolveUserIdentity` function to return ledger-specific tenant/aggregate/role data, OR
2. Create a new resolution function specifically for ledger authorization.

This integration is marked as **UNRESOLVED — OWNER DECISION REQUIRED** (OD-006).

#### C. Supplied-Cost Adapter Shape

**OWNER DECISION REQUIRED — OD-018**

The prior authorization explicitly required the adapter input model to include `supplied cost input, where applicable`.

Current public-boundary fact:
- The public signature is `evaluateEvent2G1A(rawInput: unknown, state: DomainState): DomainResult2G1A`.
- `rawInput` is a single untyped object.
- The `cost` field appears on `rawInput` for E5 (`receipt.posted`) and E33 (`job_material.consumed`) only.
- The domain function parses `cost` internally (Stage D, publicBoundary.ts lines 152-209) via `parseCost()` into `SuppliedCost2G1A | null`.
- No separate `supplied_cost` parameter exists on the public boundary.

Adapter options:
1. **Pass raw input unchanged**: The adapter passes the complete `raw_event` to `evaluateEvent2G1A`. The `cost` field is inside `raw_event`. No separate `supplied_cost` parameter. This preserves the exact public boundary.
2. **Accept `raw_event` and `supplied_cost` separately**: The adapter accepts a separate `supplied_cost` parameter, then constructs the final `raw_event` by injecting or overriding the `cost` field before calling `evaluateEvent2G1A`.

If Option 2 is selected:
- If `raw_event` already contains a `cost` field AND a separate `supplied_cost` is provided, one authoritative source must be defined.
- Deterministic conflict behavior: either reject the request (two conflicting cost inputs), or `supplied_cost` overrides `raw_event.cost`, or `raw_event.cost` takes precedence.
- Two conflicting cost inputs MUST NOT be permitted.

The governing contract does not decide the adapter shape. This is classified as:

**OWNER DECISION REQUIRED — ADAPTER SUPPLIED-COST SHAPE (OD-018)**

#### D. Trusted-Context-to-Domain-Input Transformation

Every field in a Stage 2G1-A raw event (`DomainEventBase`, payloads.ts lines 14-27) is caller-supplied business data. The following identity-related fields appear in raw events:

| Field | Events | Caller-Supplied? | Accepted by Domain Boundary? | Used for Authorization? | Classification |
|-------|--------|-----------------|------------------------------|------------------------|----------------|
| `requester` | All 18 events | Yes | Yes (stored as-is) | No — domain engine does NOT validate against any identity system | Audit metadata (business data) |
| `authority_marker` | E26, E33, E48 | Yes | Yes (stored as-is) | No — domain engine does NOT validate against any authorization system | Audit metadata (business data) |
| `tenant_id` | None | N/A | N/A | N/A — domain has no tenant concept | Not applicable |
| `employee_id` | None | N/A | N/A | N/A — domain has no employee concept | Not applicable |
| `role_id` | None | N/A | N/A | N/A — domain has no role concept | Not applicable |

Key findings:
1. No `tenant_id`, `employee_id`, `role_id`, or authorization field exists in any Stage 2G1-A raw event.
2. The domain engine has no concept of tenant, employee, or role.
3. `requester` is caller-supplied but is NOT used for authorization. It is stored as audit metadata.
4. `authority_marker` is caller-supplied but is NOT validated against any authorization system. It is stored as-is in the `AcceptedEventRecord`.

The adapter MUST:
- Resolve `tenant_id`, `aggregate_id`, `actor_identity`, `employee_id`, `role_id`, and `authorization` from trusted server context (authenticated session).
- NOT pass caller-supplied identity as authorization authority.
- NOT rely on `requester` or `authority_marker` for authorization decisions.

The exact transformation from (caller request + trusted server context) to the final raw input passed to `evaluateEvent2G1A()` is NOT established by the governing contract. This is:

**OWNER DECISION REQUIRED — TRUSTED-CONTEXT-TO-DOMAIN-INPUT TRANSFORMATION (OD-006)**

### 3.2 Transaction Behavior

#### Normal First-Time Request (Option A — Domain-Exact)

```
BEGIN;

-- 1. Establish tenant context
SET LOCAL ledger.tenant_id = server_context.tenant_id;
SET LOCAL ledger.actor_identity = server_context.actor_identity;

-- 2. Acquire aggregate lock (row-level lock on state_revision)
SELECT current_revision FROM ledger.state_revision
  WHERE tenant_id = :tenant_id AND aggregate_id = :aggregate_id
  FOR UPDATE;

-- 3. Verify expected revision (if provided)
IF expected_revision IS NOT NULL AND current_revision != expected_revision THEN
  ROLLBACK;
  RETURN ConcurrencyConflict;
END IF;

-- 4. Load complete DomainState
--    (items, positions, company_ownership, transfers_outstanding,
--     correction_provenance, job_issue_progress, cutoff,
--     transactions for idempotency check)

-- 5. Call domain engine
const result = evaluateEvent2G1A(raw_event, domainState);

-- 6. Branch on result
IF result is RejectedDomainResult THEN
  ROLLBACK;  -- or no transaction opened if safe read-only path
  RETURN RejectedResult(result);
END IF;

-- 7. Persist accepted changes (all within this transaction)
--    a. Apply state_effects
--    b. Apply recorded_operations
--    c. Insert AcceptedEventRecord
--    d. Advance revision
--    e. Insert outbox message (if outbox enabled)

-- 8. Commit
COMMIT;

-- 9. Return accepted result
RETURN AcceptedResult(result);
```

#### Domain Rejection Transaction Behavior

A domain rejection does NOT require a database transaction with writes. The adapter may:

1. Open a read-only transaction (or no transaction at all) to load the DomainState.
2. Call `evaluateEvent2G1A`.
3. If the result is a rejection, return it immediately without persisting anything.

The domain function guarantees zero mutation on rejection (publicBoundary.ts: no effects, no operations, no facts are computed; `state_revision` is not advanced). The adapter does not need to ROLLBACK because nothing was written.

**Rejected-request audit records**: If audit records are required for rejected requests, this would intentionally persist data and therefore conflicts with the domain "rejection persists nothing" guarantee (governing contract Section 11, AT-132). Rejected-request audit records are **NOT authorized** by this proposal. Rejected-request audit records require separate owner approval. See Section 8.

#### Concurrency Timing Analysis

The following analysis distinguishes failures that occur before domain evaluation from those that occur after. The domain boundary invocation status varies by case.

| Case | Description | Domain Boundary Invoked? | Invoked More Than Once? | Durable State Committed? | Caller Received Response? | Infrastructure Retry Safe? | State Must Be Reloaded? | Re-evaluation Required? | Classification |
|------|-------------|--------------------------|--------------------------|--------------------------|---------------------------|---------------------------|--------------------------|--------------------------|----------------|
| 1 | Revision mismatch detected before domain evaluation (expected_revision != current_revision) | No | No | No | Yes (409) | No — caller must reload and retry | Yes | No | Adapter behavior |
| 2 | Concurrent modification detected after state load but before evaluation | No | No | No | Yes (409 or retry) | Depends on lock strategy | Yes | No | Adapter behavior |
| 3 | Compare-and-swap failure after domain evaluation (revision advanced by another transaction during persistence) | Yes | Yes (on retry) | No (this transaction rolled back) | Yes (409 or adapter retry) | Yes — adapter may retry by reloading and re-evaluating | Yes | Yes | Infrastructure/adapter behavior |
| 4 | Serialization failure during persistence after domain evaluation (SQLSTATE 40001) | Yes | Yes (on retry) | No (rolled back) | Yes (503 or adapter retry) | Yes — adapter retries internally with backoff | Yes | Yes | Infrastructure behavior |
| 5 | Deadlock during state loading before domain evaluation (SQLSTATE 40P01) | No | No | No | Yes (503 or adapter retry) | Yes — adapter retries internally | Yes | No | Infrastructure behavior |
| 6 | Deadlock during persistence after domain evaluation (SQLSTATE 40P01) | Yes | Yes (on retry) | No (rolled back) | Yes (503 or adapter retry) | Yes — adapter retries internally | Yes | Yes | Infrastructure behavior |
| 7 | Commit uncertainty after domain returned accepted result (network failure or process crash during COMMIT) | Yes | Yes (on caller retry) | Unknown — may or may not have committed | No (caller did not receive response) | Caller must retry; under Option A, if committed, retry gets `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | Yes | Yes | Yes | Infrastructure behavior |
| 8 | Process failure after commit but before response | Yes | Yes (on caller retry) | Yes (committed) | No (caller did not receive response) | Caller must retry; under Option A, retry gets `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | Yes | Yes | Yes (but domain returns duplicate rejection) | Infrastructure behavior |

Key corrections to prior analysis:
- The domain boundary IS invoked in cases 3, 4, 6, 7, and 8. The prior version categorically stated "No" for all concurrency failures. This was incorrect.
- The domain boundary may be invoked more than once across retries in cases 3, 4, 6, 7, and 8.
- No new public error code is invented. Cases 3-8 that involve domain invocation are infrastructure/adapter behavior, NOT domain rejections.
- `expected_revision` and the 409 response are adapter/transport behavior requiring owner approval (OD-019).

#### Retry Contract

Retry behavior is classified without inventing domain semantics:

| Retry Type | When It Occurs | Domain Boundary Invoked? | Who Controls Retry | State Reload? |
|------------|----------------|--------------------------|-------------------|----------------|
| Transaction retry before domain evaluation | Deadlock during state load (Case 5) | No on failed attempt; Yes on retry | Adapter (internal) | Yes |
| Transaction retry after domain evaluation | Serialization failure or deadlock during persistence (Cases 3, 4, 6) | Yes on failed attempt; Yes on retry | Adapter (internal) | Yes |
| Database-driver retry | Connection-level failure | No | Database driver (transparent to adapter) | N/A |
| Adapter-controlled retry | SQLSTATE 40001/40P01 with backoff | Depends on timing | Adapter (internal) | Yes |
| Caller retry | 409 or 503 received | Depends on original case | Caller | Yes |
| Retry after uncertain commit | No response received (Cases 7, 8) | Yes on original; Yes on retry | Caller | Yes |
| Duplicate request after committed result | Caller retries after a committed response was lost (Case 8) | Yes (domain finds duplicate key) | Caller | Yes |

**"Call evaluateEvent2G1A exactly once" clarification**: This phrase can mean either:

- **A. Exactly once per transaction attempt**: Each transaction attempt calls the domain once. If the transaction fails and is retried (Cases 3, 4, 5, 6), the domain is called again for the new attempt. This is the behavior the current architecture supports.
- **B. Exactly once across the complete logical request**: The domain is called at most once for the entire request, including across retries. This requires stored replay (Option B) or a guarantee that the domain result is cached and reused across retries.

These are NOT equivalent. The proposal does NOT promise B. Under Option A, the domain may be invoked more than once across retries (Cases 3, 4, 6, 7, 8). Promising B requires Option B authorization or a result-caching mechanism that has not been designed.

**Domain evaluation determinism**: `evaluateEvent2G1A` is a pure function. Given the same `(rawInput, state)`, it will always return the same result. However, if state changes between retries (because another transaction committed), the re-evaluation may produce a different result. A previously committed event is distinguished from an uncommitted failed attempt by the `idempotency_key` in `state.transactions` — if the key exists, the domain returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`. This means the domain can be safely re-evaluated against a newly loaded state, and a previously committed event is correctly detected as a duplicate.

These behaviors require separate owner approval as part of the adapter contract (OD-019, OD-020).

### 3.3 Idempotency Decision

**OWNER DECISION REQUIRED — OD-001**

The verified Stage 2G1-A domain currently rejects ALL duplicate idempotency keys with `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` (publicBoundary.ts lines 380-390). It does NOT distinguish same-payload from different-payload duplicates. It does NOT compute a fingerprint.

#### OPTION A — DOMAIN-EXACT PERSISTENCE (Recommended)

Every duplicate idempotency key reaches `evaluateEvent2G1A` and is resolved consistently with the verified domain behavior: the domain returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`.

- The adapter loads the full DomainState (including `transactions` map) and calls `evaluateEvent2G1A`.
- The domain function checks `state.transactions` for a matching `idempotency_key`.
- If a duplicate is found, the domain returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`.
- The adapter persists nothing and returns the rejection.
- Database uniqueness constraint on `(tenant_id, aggregate_id, idempotency_key)` protects against concurrent duplicate submissions but does NOT change the public result. Under concurrent race, one transaction commits and the other receives a unique constraint violation. The adapter treats the constraint violation as: reload state, call `evaluateEvent2G1A` again (which now finds the duplicate and returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`).
- No new error codes are invented. No fingerprint is computed. No stored replay result is returned.

**This is the only option that preserves the verified domain behavior exactly.**

Under Option A, invoking the boundary for duplicates is the recommended way to preserve verified behavior. The current implementation evidence proves that duplicate detection occurs inside `evaluateEvent2G1A()`. Under Option A, the adapter calls `evaluateEvent2G1A` for every request, including duplicates, preserving this behavior.

#### OPTION B — TRANSPORT-LEVEL IDEMPOTENT REPLAY (Not Approved)

The transport adapter MAY return the previously committed response for an identical retry WITHOUT re-evaluating the domain.

This is a NEW transport contract. It requires separate owner approval, including:

1. **Canonical fingerprint specification**: The domain does NOT define a fingerprint. A canonical serialization algorithm and hash function would need to be designed, approved, and implemented in BOTH TypeScript and SQL to prevent drift. This does not exist today.
2. **Fingerprint versioning**: The fingerprint algorithm would need a version identifier to allow migration.
3. **Canonical serialization**: The exact JSON canonicalization (key ordering, number formatting, null handling) must be specified and identical across TypeScript and SQL implementations.
4. **Same-key/different-payload behavior**: The domain function returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` for all duplicates regardless of payload. Option B requires an approved decision for same-key/different-payload behavior, but possible choices include: (a) existing `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`, (b) a separately authorized transport error, or (c) another explicitly approved result. No choice is selected or invented. Any new rejection code (e.g., `IDEMPOTENCY_CONFLICT`) does NOT exist in the domain function and is NOT in the 38-code registry; introducing one requires separate authorization.
5. **Response-storage requirements**: The adapter would need to store the full `AcceptedDomainResult` (including `proposed_state`) to return it on replay. This is significant storage.
6. **Concurrency behavior**: Concurrent duplicate submissions under Option B require the `INSERT ... ON CONFLICT` pattern and fingerprint comparison.
7. **Whether the domain boundary is bypassed on replay**: Under Option B, the domain function is NOT called on replay. This is an adapter-contract decision, not a governing-contract mandate. The governing contract does not explicitly require that every transport retry invoke the boundary. Under Option A (recommended), invoking the boundary for duplicates is the recommended way to preserve verified behavior. Under Option B, a stored transport replay may bypass evaluation, but Option B remains unauthorized.

**Option B is NOT approved.** It is documented as a future transport contract requiring separate owner authorization.

#### Recommendation

**Recommend OPTION A.** It preserves the verified domain behavior exactly. No new error codes, no fingerprint, no stored replay. Option B may be proposed as a separate transport contract in the future.

### 3.4 Result Behavior and Transport Status Authority

All HTTP behavior, response bodies, and retry hints in this section are **PROPOSED** — they are not existing approved behavior unless explicitly noted. No Stage 2G1-A rejection code is invented.

| Result Type | HTTP Status | Response Body | Persistence | Classification | Transport Authority |
|-------------|-------------|---------------|-------------|----------------|---------------------|
| Accepted | 200 | Full `AcceptedDomainResult` | All changes committed | Domain behavior | Proposed (existing domain behavior; adapter HTTP exposure is proposed, not approved) |
| Rejected (domain rejection) | 422 | `RejectedDomainResult` with errors | Nothing persisted | Domain behavior | Proposed (existing domain behavior; adapter HTTP exposure is proposed, not approved) |
| Concurrency conflict (stale revision) | 409 | Error with `current_revision` and `expected_revision` | Nothing persisted | Transport/adapter behavior (NOT a domain rejection) | Proposed (NOT existing; requires owner approval — OD-019) |
| Infrastructure failure (connection, timeout) | 503 | Generic error | Rolled back if transaction was open | Infrastructure behavior | Proposed (internal-only; not caller-facing unless explicitly approved) |
| Transaction failure (deadlock, serialization) | 503 | Generic error with retry hint | Rolled back; retryable | Infrastructure behavior | Proposed (internal-only; not caller-facing unless explicitly approved) |

**Transport status authority classification**:

| Item | Authority Status |
|------|-----------------|
| HTTP 200 | Proposed — domain behavior exists; HTTP exposure is proposed, not approved |
| HTTP 409 | Proposed — NOT existing approved behavior; requires owner approval (OD-019) |
| HTTP 422 | Proposed — domain behavior exists; HTTP exposure is proposed, not approved |
| HTTP 503 | Proposed — internal-only; not caller-facing unless explicitly approved |
| `current_revision` disclosure in 409 body | Proposed — requires owner approval; may expose internal state |
| `expected_revision` disclosure in 409 body | Proposed — requires owner approval; may expose internal state |
| Retry hints in 503 body | Proposed — requires owner approval; may expose internal state |
| Response body schema for `AcceptedDomainResult` | Proposed — requires owner approval of the public response contract |
| Response body schema for `RejectedDomainResult` | Proposed — requires owner approval of the public response contract |

None of these transport behaviors are settled merely by appearing in this proposal. Each requires owner approval as part of the transport contract authorization.

**Note**: "Idempotent replay" and "Idempotency conflict" result types are NOT included. Under Option A, all duplicate idempotency keys return `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` (a 422 rejection). Under optional Option B, those result types would be added as part of the separate transport contract authorization.

### 3.5 Security Behavior

- **Server-resolved tenant and actor identity**: The adapter resolves `tenant_id` and `actor` from the authenticated session token. The caller cannot supply these.
- **No caller-supplied authorization authority**: The adapter does not accept `actor.role` from the request body. It derives the role from the authenticated user profile via the EmployeeRegistry/role-resolution pattern.
- **Least-privilege database role**: See Section 6 for the corrected privilege model.
- **Row-level tenant isolation**: All tables have `FORCE ROW LEVEL SECURITY` with policies scoped to `current_setting('ledger.tenant_id')`.
- **Protected immutable accepted-event records**: `accepted_events` has triggers preventing UPDATE and DELETE.
- **Secrets never exposed**: Database connection strings and credentials remain in the secret store, never serialized in responses or logs.

---

## 4. Concurrency and Failure Analysis

| Scenario | Expected Behavior | Retryable | Mechanism |
|----------|-------------------|-----------|-----------|
| Two valid events against same revision | First commits; second gets 409 ConcurrencyConflict | No | `FOR UPDATE` lock on `state_revision`; revision check |
| Duplicate idempotency key (Option A) | Domain returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` (422) | No | Domain function checks `state.transactions` |
| Concurrent duplicate submissions (Option A) | One commits; other gets unique constraint violation; adapter reloads and calls domain again (returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`) | No | Unique constraint + retry |
| Transaction retry (serialization failure) | Adapter retries with same parameters | Yes | SQLSTATE 40001; retry loop with backoff |
| Process crash before commit | Transaction rolled back by database; no residue | Yes | Database transaction atomicity |
| Process crash after commit but before response | Event is persisted; caller retries; domain returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` (Option A) | Yes | Idempotency key in `state.transactions` |
| Database timeout | Transaction rolled back; caller retries | Yes | Connection timeout; transaction abort |
| Deadlock | Transaction rolled back; adapter retries | Yes | SQLSTATE 40P01; retry loop |
| Serialization failure | Transaction rolled back; adapter retries | Yes | SQLSTATE 40001; retry loop |
| Partial adapter failure | Entire transaction rolled back; no residue | Yes | Single transaction boundary |
| Outbox publication failure (post-commit) | Outbox row is committed; external consumer retries delivery | Yes | Outbox `delivery_status` + retry policy |
| Audit persistence failure (accepted events) | Entire transaction rolled back | Yes | Single transaction boundary |
| Stale state (revision mismatch) | Rejected with 409; caller reloads and retries | No | Compare-and-swap on revision |
| Malformed stored state | Rejected with infrastructure error; manual intervention | No | Domain function validates loaded state |
| Unsupported formula version | Rejected with infrastructure error | No | Formula version check |
| Cross-tenant access attempt | Rejected with 403; RLS prevents data access | No | RLS policy + `FORCE ROW LEVEL SECURITY` |

---

## 5. Field-Level Data-Model Reconciliation

### 5.1 Tenant and Aggregate Identity

| Domain | Database Table | Column | Type | Notes |
|--------|---------------|--------|------|-------|
| N/A (server-resolved) | `tenants` | `tenant_id` | UUID | Domain has no tenant concept; adapter adds it |
| N/A (adapter concept) | `state_revision` | `aggregate_id` | TEXT | SQL has no `aggregate_id`; must add for multi-aggregate |

### 5.2 State Revision

| Domain | Database Table | Column | Type | Behavior |
|--------|---------------|--------|------|----------|
| `DomainState.state_revision` | `state_revision` | `current_revision` | BIGINT | UPDATE on accept; compare-and-swap via `FOR UPDATE` |

### 5.3 Inventory Positions

| Domain Path | Table | Column | Type | Notes |
|-------------|-------|--------|------|-------|
| `position.position_id` | `positions` | `position_id` | UUID | PK |
| `position.item_id` | `positions` | `item_id` | UUID | FK to `items` |
| `position.position_kind` | `positions` | `position_type` | TEXT | CHECK constraint |
| `position.ownership_class` | `positions` | `ownership_class` | TEXT | CHECK |
| `position.position_quantity` | `positions` | `position_quantity` | NUMERIC(18,4) | CHECK >= 0 |
| `position.origin_class` | — | — | — | **GAP**: must add column |
| `position.condition_class` | — | — | — | **GAP**: must add column |
| `position.restriction_class` | — | — | — | **GAP**: must add column |
| `position.warehouse_location_id` | `positions` | `warehouse_id` | UUID | Renamed |
| `position.bin_location_id` | — | — | — | **GAP**: must add column |
| `position.job_id` | — | — | — | **GAP**: must add column |
| `position.transfer_id` | — | — | — | **GAP**: must add column |
| `position.terminal_reference` | — | — | — | **GAP**: must add column |

### 5.4 Company Ownership

**GAP**: SQL has no `company_ownership` table. Must create.

### 5.5 Transfers Outstanding

**GAP**: SQL has no `transfers_outstanding` table. Must create.

### 5.6 Correction Provenance

**GAP**: SQL has no `correction_provenance` table. Must create.

### 5.7 Job Issue Progress

**GAP**: SQL has no `job_issue_progress` table. Must create.

### 5.8 AcceptedEventRecord

| Domain Path | Table | Column | Type | Notes |
|-------------|-------|--------|------|-------|
| `record.record_id` | `accepted_events` | `event_id` | TEXT or UUID | **UNRESOLVED** (OD-004): domain `record_id` format is RESOLVED as `AER-{key}-{rev}` (TEXT). Physical database primary-key type (TEXT vs UUID) is UNRESOLVED. Whether a separate database surrogate key exists is UNRESOLVED. |
| `record.event` | `accepted_events` | `payload_json` | JSONB | NOT NULL |
| `record.idempotency_key` | `accepted_events` | `idempotency_key` | TEXT | NOT NULL; UNIQUE |
| `record.canonical_state_revision` | `accepted_events` | `canonical_revision` | BIGINT | NOT NULL |
| `record.formula_version` | `accepted_events` | `formula_version` | TEXT | NOT NULL |
| `record.state_effects` | `accepted_events` | `state_effects_json` | JSONB | **GAP**: must add |
| `record.recorded_operations` | `accepted_events` | `recorded_operations_json` | JSONB | **GAP**: must add |
| `record.immutable_facts` | `accepted_events` | `immutable_facts_json` | JSONB | **GAP**: must add |
| `record.classification_results` | `accepted_events` | `classification_results_json` | JSONB | **GAP**: must add |
| `record.derived_result_snapshots` | `accepted_events` | `derived_snapshots_json` | JSONB | **GAP**: must add |
| `record.warnings` | `accepted_events` | `warnings_json` | JSONB | **GAP**: must add |

### 5.9 DomainTransactionCutoff

**GAP**: SQL has no `transaction_cutoff` table. Must create.

---

## 6. Database Authority and Privilege Model

### 6.1 Recommended Model: Direct Transactional DML by a Narrowly Privileged Adapter Role

**OWNER DECISION REQUIRED — OD-005**

Two models were considered:

**Model A — Direct Transactional DML**: The adapter role directly executes INSERT/UPDATE/SELECT within a transaction. No business-rules SQL functions. The adapter is the sole writer.

**Model B — Infrastructure-Only Persistence Procedure**: A single `SECURITY DEFINER` stored procedure stores an already-evaluated accepted result. The adapter role has EXECUTE on this procedure only. No direct table writes by the adapter role.

**Recommendation: Model A.** It is simpler, avoids a stored procedure that could be perceived as containing business logic, and the adapter is a backend function in the application — not a SQL function. Model B adds a stored procedure that stores an already-evaluated result; this is valid but adds an indirection layer.

### 6.2 Privilege Matrix (Model A — Direct Transactional DML)

The runtime role is `ledger_app_user`. It has direct DML on all ledger tables. It does NOT have EXECUTE on `fn_receive_purchase_order` (retired business-rules function).

| Object | SELECT | INSERT | UPDATE | DELETE | EXECUTE | Notes |
|--------|--------|--------|--------|--------|---------|-------|
| `ledger.positions` | Yes | Yes | Yes | No | — | Lifecycle flags managed by adapter |
| `ledger.company_ownership` | Yes | Yes | Yes | No | — | UPSERT pattern |
| `ledger.transfers_outstanding` | Yes | Yes | Yes | No | — | |
| `ledger.correction_provenance` | Yes | Yes | Yes | No | — | Append to blocking_downstream_event_ids |
| `ledger.job_issue_progress` | Yes | Yes | Yes | No | — | |
| `ledger.accepted_events` | Yes | Yes | No | No | — | Trigger prevents UPDATE/DELETE |
| `ledger.state_revision` | Yes | Yes | Yes | No | — | FOR UPDATE lock |
| `ledger.items` | Yes | No | No | No | — | Master data, read-only |
| `ledger.transaction_cutoff` | Yes | Yes | Yes | No | — | |
| `ledger.outbox_messages` | Yes | Yes | Yes | No | — | Consumer updates delivery_status |
| `ledger.audit_records` | Yes | Yes | No | No | — | Append-only (accepted events only) |
| `ledger.tenants` | Yes | No | No | No | — | Provisioned by admin |
| `ledger.warehouses` | Yes | No | No | No | — | Provisioned by admin |
| `ledger.units_of_measure` | Yes | No | No | No | — | Static reference data |
| `ledger.vendors` | Yes | No | No | No | — | Provisioned by admin |
| `ledger.purchase_orders` | Yes | No | No | No | — | Provisioned by admin (if retained) |
| `ledger.purchase_order_lines` | Yes | No | No | No | — | Provisioned by admin (if retained) |
| `ledger.po_receipts` | Yes | No | No | No | — | Provisioned by admin (if retained) |
| `ledger.po_receipt_lines` | Yes | No | No | No | — | Provisioned by admin (if retained) |
| `fn_command_fingerprint` | — | — | — | — | No | NOT approved as domain authority; not retained |
| `fn_receive_purchase_order` | — | — | — | — | No | Retired business-rules function |
| `fn_prevent_accepted_event_mutation` | — | — | — | — | No (trigger-owned) | Trigger fires automatically; no EXECUTE needed |
| `fn_derive_line_status` | — | — | — | — | No | SQL-only PO lifecycle; not used by adapter |
| `fn_derive_po_status` | — | — | — | — | No | SQL-only PO lifecycle; not used by adapter |
| `fn_finalize_rejection` | — | — | — | — | No | SQL-only rejection logic; not used by adapter |
| `fn_canonicalize_command` | — | — | — | — | No | SQL-only canonicalization; not used by adapter |

**Schema usage**: `USAGE` on `ledger` schema.
**Sequence usage**: `USAGE, SELECT` on any sequences created for audit or outbox IDs.
**RLS behavior**: `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables. Policies use `current_setting('ledger.tenant_id')`.
**Trigger ownership**: `ledger_function_owner` (table owner) owns the immutability triggers. `ledger_app_user` does not own triggers.
**Migration ownership**: `ledger_migration_owner` (admin role) owns DDL. `ledger_app_user` has no DDL privileges.

**The runtime role (`ledger_app_user`) MUST NOT retain permission to execute `fn_receive_purchase_order`** (retired business-rules function) or `fn_command_fingerprint` (not approved as domain authority).

---

## 7. Fingerprint Authority

### 7.1 Domain Does Not Define a Fingerprint

The Stage 2G1-A domain function (`evaluateEvent2G1A`) does NOT compute a payload fingerprint or hash. The `AcceptedEventRecord` (domainState.ts) has no `payload_hash` field.

### 7.2 `fn_command_fingerprint` Is NOT Approved

- `fn_command_fingerprint` exists only in the unexecuted SQL artifact (`stage_2g1a_receipt_validation.sql`).
- The governing contract (Section 18) adopts the SQL script as a "PostgreSQL receipt validation reference" but does NOT approve it for execution.
- The governing contract does NOT mention `fn_command_fingerprint` as a domain authority.
- **`fn_command_fingerprint` is NOT retained as a utility.** It is marked as **NOT APPROVED**.

### 7.3 TypeScript/SQL Canonicalization Drift Risk

If a fingerprint were used for transport-level replay (Option B), the TypeScript implementation and SQL implementation would need to produce identical hashes. Any difference in JSON key ordering, number formatting, null handling, or encoding would cause false conflicts. This drift risk is significant and makes Option B more dangerous than Option A.

### 7.4 Fingerprinting Required Only for Option B

Fingerprinting is required ONLY if the optional transport-level replay contract (Option B) is pursued. Under Option A (domain-exact), no fingerprint is needed — the domain function handles duplicate detection by comparing `idempotency_key` strings directly.

### 7.5 Any Fingerprint Algorithm Requires Separate Approval

If a fingerprint is ever needed, the following require separate owner approval:
1. Canonical serialization algorithm (key ordering, number format, null handling).
2. Hash function (e.g., SHA-256).
3. Canon version identifier.
4. Implementation in both TypeScript and SQL.
5. Versioning and migration strategy.

---

## 8. Transaction Semantics and Persistence Categories

### 8.1 Five Persistence Categories

This proposal distinguishes the following categories:

| Category | Persisted? | When? | Transaction? |
|----------|-----------|-------|-------------|
| 1. Domain-state persistence (positions, quantities, revision, accepted records) | Yes, on acceptance | Within the adapter transaction | Yes |
| 2. Security/access logs | Maybe | Outside the adapter transaction | Separate mechanism |
| 3. Infrastructure logs (connection, timeout, deadlock) | Maybe | Outside the adapter transaction | Separate mechanism (application logs) |
| 4. Rejected-command audit records | **NOT authorized** | N/A | N/A — see below |
| 5. Accepted-event records | Yes, on acceptance | Within the adapter transaction (same as category 1) | Yes |

### 8.2 Rejected-Command Audit Records

**NOT AUTHORIZED by this proposal.**

The domain function guarantees zero mutation on rejection (governing contract Section 11, AT-132). If rejected-command audit records were persisted, this would intentionally persist data on a rejection, which conflicts with the "rejection persists nothing" rule.

Categories 2 (security/access logs) and 3 (infrastructure logs) are outside the adapter transaction and do not conflict with the domain guarantee. They may be implemented as application-level logging (e.g., Base44 `AutomationRunLog` entity) and do not require database writes within the adapter transaction.

**Rejected-command audit records require separate owner authorization** if the owner wishes to persist rejection outcomes for compliance. This would be a new persistence category explicitly authorized as an exception to the "rejection persists nothing" domain guarantee.

---

## 9. Data-Model and Identifier Decisions

The following decisions distinguish domain-resolved facts from database physical-key design. Domain `record_id` formats are contractually fixed; physical database key types are unresolved.

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | Database physical primary-key type (TEXT vs UUID) | **UNRESOLVED** (OD-004) | Domain uses TEXT IDs (`AER-{key}-{rev}`, `CPR-{eventId}`, transfer_id, etc.). SQL uses UUID. The physical database key type is an owner decision. The domain `record_id` format is NOT affected by this decision — it is contractually fixed (Decision #2). |
| 2 | Domain `record_id` format (`AER-{idempotency_key}-{revision}`) | **RESOLVED** | Domain uses this format (publicBoundary.ts line 417). This is contractually fixed and NOT an owner decision. The database must store this as TEXT or store it in a separate column. See OD-004 for the physical key type. |
| 3 | Tenant identity | **UNRESOLVED** (OD-007) | Domain has no tenant concept. Adapter adds it. The mapping from Base44 user to tenant ID is unresolved. |
| 4 | Aggregate identity | **UNRESOLVED** (OD-003) | Domain has a single `DomainState` per call. SQL assumes single-aggregate-per-tenant. Multi-aggregate support is an open decision. |
| 5 | Per-tenant vs per-aggregate state_revision | **UNRESOLVED** (OD-019) | Domain uses per-aggregate `state_revision`. SQL uses per-tenant. Must reconcile. |
| 6 | Complete DomainState reconstruction | **RESOLVED** | The adapter must load all 9 members of DomainState, including the full `transactions` map for idempotency duplicate detection. |
| 7 | Whether warnings are persisted on accepted events | **UNRESOLVED** (OD-012) | Accepted results include warnings. Whether to persist warnings is open. |
| 8 | Whether rejected results are persisted | **RESOLVED — No** | Domain guarantees zero mutation on rejection. Rejected results are NOT persisted. See Section 8. |
| 9 | Whether derived snapshots are durable or reconstructable | **UNRESOLVED** (OD-013) | `AvailabilityDerived` snapshots could be recomputed from positions. Whether to persist them is open. |
| 10 | Whether transactions must be fully loaded for duplicate detection | **RESOLVED — Yes** | Under Option A, the full `transactions` map must be loaded so the domain function can check for duplicate idempotency keys. |
| 11 | Event-history size and aggregate-load performance | **UNRESOLVED** (OD-020) | Loading the full `transactions` map may be slow as history grows. Snapshotting or bounded-history strategy is open. |
| 12 | Snapshotting or bounded-history strategy | **UNRESOLVED** (OD-014) | If event history grows large, a snapshot table (periodic DomainState snapshot) or bounded history (retain last N transactions) would be needed. Not designed yet. |

**Do NOT authorize schema creation while any schema-shaping decision remains unresolved.** Decisions 1, 3, 4, 5, 7, 9, 11, and 12 are unresolved.

---

## 10. SQL-Script Disposition

**Recommendation: REVISE (requires separate authorization)**

1. **Retain**: Schema definition structure, RLS policy pattern, role hierarchy, immutability trigger pattern.
2. **Revise**: Add missing tables and columns (Section 5 gaps). Add `aggregate_id` throughout.
3. **Retire**: `fn_receive_purchase_order` (business logic in SQL — dead end).
4. **Retire**: `fn_derive_line_status` and `fn_derive_po_status` (PO lifecycle logic not in domain model).
5. **NOT APPROVED**: `fn_command_fingerprint` — NOT retained as a utility. Not approved as domain authority. See Section 7.
6. **Retain**: `fn_prevent_accepted_event_mutation` (immutability trigger — infrastructure).
7. **Revise**: Test fixtures must use validation namespace instead of fixed UUIDs.
8. **Revise**: Replace `TRUNCATE` cleanup with transaction-wrapped `BEGIN`/`ROLLBACK`.

---

## 11. External-Effect Containment (Outbox)

### 11.1 Outbox Design

The `outbox_messages` table participates in the same database transaction as the ledger mutation. An external consumer (projection sync to Base44 entities) processes outbox rows only after commit.

### 11.2 Containment Properties

- **Outbox rows participate in the same transaction**: If the transaction rolls back, outbox rows are also rolled back. No external publication occurs.
- **External consumer may process only after commit**: The consumer queries `WHERE delivery_status = 'pending'` and only processes committed rows.
- **Rollback prevents publication**: If the transaction rolls back, no outbox row is visible to the consumer.
- **Duplicate delivery handling**: The consumer uses `delivery_status` transitions: `pending` -> `delivered`. The projection must be idempotent (upsert by `event_id`).
- **Validation environments disable external delivery**: A configuration flag prevents the consumer from running in validation environments.
- **Audit records are transactional**: `audit_records` participate in the same transaction. No autonomous transactions are used.
- **Rejected requests do NOT produce outbox messages**: Rejection produces no persisted data of any kind.

---

## 12. Implementation Phases

### Phase A: Owner Review and Approval of Persistence Contract Decisions
- **Required authorization**: Owner review and approval of all unresolved decisions in Section 14
- **Permitted changes**: None (specification only)
- **Prohibited changes**: All implementation, schema, and database changes
- **Entry criteria**: This proposal is complete
- **Exit criteria**: Owner signs off on all persistence contract decisions
- **Evidence required**: Signed approval record
- **Rollback strategy**: N/A

### Phase B: Authorize Schema Creation
- **Required authorization**: Owner approval of revised SQL schema
- **Permitted changes**: CREATE SCHEMA, CREATE TABLE, CREATE FUNCTION, CREATE TRIGGER, CREATE POLICY in an isolated non-production database
- **Prohibited changes**: Production database, production code, Stage 2G1-B
- **Entry criteria**: Phase A complete; all schema-shaping decisions resolved; isolated non-production database provisioned with credentials
- **Exit criteria**: Schema instantiated and verified in isolated database
- **Evidence required**: Schema creation log, DDL verification queries
- **Rollback strategy**: DROP SCHEMA ledger CASCADE

### Phase C: Implement Adapter
- **Required authorization**: Owner approval of adapter implementation plan
- **Permitted changes**: New backend function `processLedgerEvent/entry.ts`, new shared module for state loading/persisting
- **Prohibited changes**: Production code modification, governing contract, Stage 2G1-B
- **Entry criteria**: Phase B complete; adapter contract approved
- **Exit criteria**: Adapter compiles, passes unit tests with mock database
- **Evidence required**: Unit test results, code review
- **Rollback strategy**: Delete adapter function and module

### Phase D: Adapter Unit and Integration Tests
- **Required authorization**: Owner approval of test plan
- **Permitted changes**: Test files, test fixtures in isolated database
- **Prohibited changes**: Production database, production code
- **Entry criteria**: Phase C complete; isolated database available
- **Exit criteria**: All integration tests pass
- **Evidence required**: Test results, coverage report
- **Rollback strategy**: Roll back test data

### Phase E: Rollback-Only Database Validation
- **Required authorization**: Owner approval of database validation plan
- **Permitted changes**: Rollback-only transactional writes in isolated database
- **Prohibited changes**: Production database, schema changes, commits
- **Entry criteria**: Phase D complete; preflight passes
- **Exit criteria**: All Phase 4 checks pass; post-rollback residue is zero
- **Evidence required**: Validation report with before-state, in-transaction results, post-rollback verification
- **Rollback strategy**: ROLLBACK all transactions

### Phase F: Staging Shadow Validation
- **Required authorization**: Owner approval of staging shadow plan
- **Permitted changes**: Read-only processing of production-like events in staging database
- **Prohibited changes**: Production database, production projections, production code
- **Entry criteria**: Phase E complete; staging database provisioned
- **Exit criteria**: Shadow processing matches domain engine results; no projection mutations
- **Evidence required**: Shadow validation report, comparison metrics
- **Rollback strategy**: Stop shadow consumer

### Phase G: Production-Readiness Review
- **Required authorization**: Owner approval for production deployment
- **Permitted changes**: Production database schema migration, production code deployment
- **Prohibited changes**: (None — this is the production authorization gate)
- **Entry criteria**: Phase F complete; all previous phases signed off
- **Exit criteria**: Production deployment validated
- **Evidence required**: Production deployment runbook, rollback plan
- **Rollback strategy**: Production rollback procedure

**Recommended next step**: OWNER REVIEW AND APPROVAL OF PERSISTENCE CONTRACT DECISIONS (Phase A). Only after all schema-shaping and behavioral decisions are approved may Phase B schema work be proposed.

---

## 13. Approval-Readiness Checklist

Before Phase A can be approved, the following must be resolved:

- [ ] OD-001: Idempotency option selected (Option A recommended, Option B requires separate transport contract)
- [ ] OD-005: Database privilege model selected (Model A recommended, Model B requires separate design)
- [ ] OD-006: EmployeeRegistry/role-resolution integration designed for ledger authorization; trusted-context-to-domain-input transformation defined
- [ ] OD-007: Tenant identity mapping (Base44 user to tenant_id) designed
- [ ] OD-003: Aggregate identity designed (single vs multi-aggregate per tenant)
- [ ] OD-019: Per-tenant vs per-aggregate state_revision reconciled; expected_revision behavior approved
- [ ] OD-004: Database physical primary-key type (TEXT vs UUID) decided
- [ ] OD-018: Adapter supplied-cost shape decided
- [ ] OD-012: Whether warnings are persisted on accepted events
- [ ] OD-013: Whether derived snapshots are durable or reconstructable
- [ ] OD-020: Event-history size and aggregate-load performance strategy
- [ ] OD-014: Snapshotting or bounded-history strategy
- [ ] OD-011: Rejected-command audit record requirement (currently NOT authorized)

---

## 14. Owner-Decision Registry

This is the single authoritative registry of all open owner decisions. Each decision has a stable ID, question, options, recommendation, impact, status, dependencies, and approval requirements.

### OD-001: Idempotency Option

- **Question**: Should the adapter preserve domain-exact duplicate behavior (Option A) or implement transport-level idempotent replay (Option B)?
- **Options**: (A) Domain-exact — every duplicate reaches `evaluateEvent2G1A`, returns `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`; (B) Transport-level replay — return previously committed response without re-evaluating domain.
- **Recommendation**: Option A
- **Behavioral/Schema impact**: Option A requires no new error codes or fingerprint. Option B requires fingerprint specification, response storage, and same-key/different-payload behavior decision.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-002: Database Provider

- **Question**: Which database provider should be used?
- **Options**: (A) PostgreSQL via Supabase; (B) Self-hosted PostgreSQL; (C) Cloud-managed PostgreSQL.
- **Recommendation**: None
- **Behavioral/Schema impact**: Provider affects RLS syntax, extension availability, connection pooling.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-003: Multi-Aggregate Support

- **Question**: Should the ledger support a single aggregate per tenant or multiple aggregates?
- **Options**: (A) Single aggregate per tenant; (B) Multiple aggregates per tenant.
- **Recommendation**: None
- **Behavioral/Schema impact**: Multi-aggregate requires `aggregate_id` column on all tables and state_revision. Domain already uses per-aggregate revision.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-004: Database Physical Primary-Key Type

- **Question**: Should database primary keys use TEXT (storing domain `record_id` format) or UUID (with domain `record_id` stored as a separate TEXT column)?
- **Options**: (A) TEXT — store domain `record_id` as primary key; (B) UUID — surrogate primary key with domain `record_id` as a uniquely constrained TEXT column.
- **Recommendation**: None
- **Behavioral/Schema impact**: Affects indexing, storage size, join performance. Domain `record_id` format (`AER-{key}-{rev}`) is contractually fixed regardless of this decision.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-005: Database Privilege Model

- **Question**: Should the adapter use direct DML (Model A) or an infrastructure-only persistence procedure (Model B)?
- **Options**: (A) Direct transactional DML by `ledger_app_user`; (B) `SECURITY DEFINER` stored procedure with EXECUTE-only privilege.
- **Recommendation**: Model A
- **Behavioral/Schema impact**: Model B adds a stored procedure indirection layer.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-006: EmployeeRegistry/Role-Resolution Integration and Trusted-Context Transformation

- **Question**: How to resolve an authenticated Base44 user to a ledger tenant ID, aggregate ID, employee ID, role ID, and authorization capability set? What is the exact transformation from (caller request + trusted server context) to the final raw input passed to `evaluateEvent2G1A()`?
- **Options**: (A) Extend existing `resolveUserIdentity` function; (B) Create a new resolution function; (C) Other approach.
- **Recommendation**: None
- **Behavioral/Schema impact**: Determines how tenant_id, actor_identity, and authorization are injected. `requester` and `authority_marker` in raw events are caller-supplied audit metadata, NOT authorization authority.
- **Status**: UNRESOLVED
- **Dependencies**: OD-007 (tenant identity mapping)
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-007: Tenant Identity Mapping

- **Question**: How do Base44 users map to ledger tenant IDs?
- **Options**: (A) One tenant per Base44 workspace; (B) Multiple tenants per workspace with explicit mapping; (C) Other approach.
- **Recommendation**: None
- **Behavioral/Schema impact**: Affects RLS policy behavior and `current_setting('ledger.tenant_id')` population.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-008: PO Lifecycle Tracking

- **Question**: Should PO line receipt/cancellation status be tracked in the ledger (as SQL has it) or as a projection (as domain does not)?
- **Options**: (A) Track in ledger; (B) Track as projection.
- **Recommendation**: None
- **Behavioral/Schema impact**: Domain does not track PO lifecycle. Adding it creates schema beyond domain model.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-009: Position Lifecycle Flags

- **Question**: Should position lifecycle flags be part of the ledger domain or managed externally?
- **Options**: (A) Part of ledger domain; (B) Managed externally by adapter.
- **Recommendation**: None
- **Behavioral/Schema impact**: SQL adds lifecycle flags not present in domain.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-010: Outbox Consumer Implementation

- **Question**: How should the outbox consumer be implemented?
- **Options**: (A) Base44 scheduled automation; (B) Backend function triggered by LISTEN/NOTIFY; (C) External service.
- **Recommendation**: None
- **Behavioral/Schema impact**: Determines how projection sync from ledger to Base44 entities is delivered.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: No
- **Approval required before adapter implementation**: Yes

### OD-011: Rejected-Command Audit Records

- **Question**: Should rejected-command audit records be persisted?
- **Options**: (A) NOT authorized — domain guarantees zero mutation on rejection; (B) Authorized as an exception with separate approval.
- **Recommendation**: NOT authorized (A)
- **Behavioral/Schema impact**: Conflicts with "rejection persists nothing" domain guarantee (AT-132) if authorized.
- **Status**: UNRESOLVED (defaulting to NOT authorized)
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-012: Warnings Persistence

- **Question**: Should warnings on accepted events be persisted?
- **Options**: (A) Persist warnings as JSONB column; (B) Do not persist (recompute or discard).
- **Recommendation**: None
- **Behavioral/Schema impact**: Adds `warnings_json` column to `accepted_events` if persisted.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-013: Derived Snapshots Durability

- **Question**: Should `AvailabilityDerived` snapshots be persisted or reconstructable from positions?
- **Options**: (A) Persist as JSONB; (B) Reconstruct on read.
- **Recommendation**: None
- **Behavioral/Schema impact**: Adds `derived_snapshots_json` column if persisted.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-014: Snapshotting Strategy (Dependent Implementation Detail of OD-020)

- **Question**: If OD-020 selects "snapshotting" as the event-history performance strategy, what specific snapshotting approach should be used?
- **Options**: (A) Periodic DomainState snapshot table; (B) Bounded history (retain last N transactions); (C) No snapshotting (load full history).
- **Recommendation**: None
- **Behavioral/Schema impact**: Affects aggregate load performance. Only relevant if OD-020 selects snapshotting.
- **Status**: UNRESOLVED (dependent — only applies if OD-020 selects "snapshotting")
- **Dependencies**: OD-020 (parent decision — must be resolved first; this decision is a dependent implementation detail, not a peer decision)
- **Approval required before schema design**: Yes (only if OD-020 selects snapshotting)
- **Approval required before adapter implementation**: No

### OD-015: Schema Migration Strategy

- **Question**: How should schema migrations be managed?
- **Options**: (A) `CREATE IF NOT EXISTS` approach; (B) Formal migration tool (e.g., Flyway, Liquibase).
- **Recommendation**: None
- **Behavioral/Schema impact**: Determines DDL management approach.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-016: Validation Namespace

- **Question**: What identifier scheme should be used for rollback-only validation records?
- **Options**: (A) Prefix-based namespace; (B) Separate validation schema; (C) Other approach.
- **Recommendation**: None
- **Behavioral/Schema impact**: Affects how validation records are isolated from production data.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: No

### OD-017: Production-Readiness Criteria

- **Question**: What metrics and thresholds must be met before Phase G (production deployment)?
- **Options**: To be defined.
- **Recommendation**: None
- **Behavioral/Schema impact**: Determines production deployment gates.
- **Status**: UNRESOLVED
- **Dependencies**: All other decisions resolved
- **Approval required before schema design**: No
- **Approval required before adapter implementation**: No

### OD-018: Adapter Supplied-Cost Shape

- **Question**: Should the adapter pass the complete raw input unchanged (with `cost` inside `raw_event`), or accept `raw_event` and `supplied_cost` separately and construct the final input?
- **Options**: (A) Pass raw input unchanged — `cost` is inside `raw_event`; (B) Accept `supplied_cost` separately and merge into `raw_event` before calling domain.
- **Recommendation**: None
- **Behavioral/Schema impact**: If Option B, conflict behavior must be defined when both `raw_event.cost` and `supplied_cost` are present. Two conflicting cost inputs MUST NOT be permitted.
- **Status**: UNRESOLVED
- **Dependencies**: None
- **Approval required before schema design**: No
- **Approval required before adapter implementation**: Yes

### OD-019: Per-Tenant vs Per-Aggregate State Revision

- **Question**: Should `state_revision` be per-tenant or per-aggregate? Should `expected_revision` (optimistic concurrency check) be approved as adapter behavior?
- **Options**: (A) Per-aggregate (matches domain); (B) Per-tenant (matches SQL script).
- **Recommendation**: Per-aggregate (A) — matches domain behavior
- **Behavioral/Schema impact**: Per-aggregate requires `aggregate_id` on `state_revision` table. `expected_revision` is adapter/infrastructure behavior, NOT domain behavior.
- **Status**: UNRESOLVED
- **Dependencies**: OD-003 (multi-aggregate support)
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

### OD-020: Event-History Performance Strategy (Parent Decision for OD-014)

- **Question**: How to handle the performance impact of loading the full `transactions` map as history grows?
- **Options**: (A) Snapshotting — if selected, OD-014 defines the specific snapshotting approach; (B) Bounded history (retain last N transactions); (C) No optimization (load full history).
- **Recommendation**: None
- **Behavioral/Schema impact**: Affects aggregate load time and memory. If snapshotting is selected, OD-014 must also be resolved.
- **Status**: UNRESOLVED
- **Dependencies**: None (OD-020 is the parent decision; OD-014 depends on OD-020, not in reverse)
- **Approval required before schema design**: Yes
- **Approval required before adapter implementation**: Yes

---

**Total owner decisions: 20 (OD-001 through OD-020)**

---

### 14.1 Decision-Gate Reduction

Twenty unresolved decisions should not be presented to the owner as an undifferentiated approval package. The following table categorizes each decision and identifies the smallest set that must be approved before schema-design authorization can be drafted.

#### Categorization

| Decision ID | Category | Question | Recommendation | Next Phase Blocked | Latest Phase to Resolve | Owner Approval Required Now | Technical Investigation First |
|---|---|---|---|---|---|---|---|
| OD-001 | A. Domain-behavior | Idempotency option (A vs B) | Option A | Phase A (behavioral contract) | Phase A | Yes | No |
| OD-002 | E. Operational | Database provider | None | Phase B (schema) | Phase B | Yes | No |
| OD-003 | B. Schema-blocking | Multi-aggregate support | None | Phase B (schema) | Phase B | Yes | No |
| OD-004 | B. Schema-blocking | Database physical PK type (TEXT vs UUID) | None | Phase B (schema) | Phase B | No — technical decision | Yes (technical spike) |
| OD-005 | B. Schema-blocking | Database privilege model | Model A | Phase B (schema) | Phase B | Yes | No |
| OD-006 | C. Adapter-blocking | EmployeeRegistry/role-resolution integration | None | Phase C (adapter) | Phase C | Yes | Yes (inspect existing functions) |
| OD-007 | B. Schema-blocking | Tenant identity mapping | None | Phase B (schema) | Phase B | Yes | No |
| OD-008 | B. Schema-blocking | PO lifecycle tracking | None | Phase B (schema) | Phase B | Yes | No |
| OD-009 | B. Schema-blocking | Position lifecycle flags | None | Phase B (schema) | Phase B | Yes | No |
| OD-010 | C. Adapter-blocking | Outbox consumer implementation | None | Phase C (adapter) | Phase C | Yes | No |
| OD-011 | A. Domain-behavior | Rejected-command audit records | NOT authorized | Phase A (behavioral contract) | Phase A | Yes | No |
| OD-012 | B. Schema-blocking | Warnings persistence | None | Phase B (schema) | Phase B | Yes | No |
| OD-013 | B. Schema-blocking | Derived snapshots durability | None | Phase B (schema) | Phase B | Yes | No |
| OD-014 | B. Schema-blocking | Snapshotting strategy (dependent on OD-020) | None | Phase B (schema) | Phase B (only if OD-020 selects snapshotting) | Yes (conditional) | No |
| OD-015 | E. Operational | Schema migration strategy | None | Phase B (schema) | Phase B | No — technical decision | Yes (technical spike) |
| OD-016 | E. Operational | Validation namespace | None | Phase E (validation) | Phase E | No — technical decision | Yes (technical spike) |
| OD-017 | F. Deferred nonblocking | Production-readiness criteria | None | Phase G (production) | Phase G | No | No |
| OD-018 | C. Adapter-blocking | Adapter supplied-cost shape | None | Phase C (adapter) | Phase C | Yes | No |
| OD-019 | D. Transport/API | Per-tenant vs per-aggregate revision; expected_revision | Per-aggregate | Phase B (schema) + Phase D (transport) | Phase B | Yes | No |
| OD-020 | B. Schema-blocking | Event-history performance strategy | None | Phase B (schema) | Phase B | Yes | Yes (performance profiling) |

#### Smallest Immediate Owner-Decision Set (Schema-Blocking, Owner Choice)

The following decisions must be approved by the owner before any schema-design authorization can be drafted. Technical-investigation decisions (OD-004, OD-015, OD-016) are excluded from this set because they should be established through inspection or a constrained technical spike before being presented to the owner.

1. OD-001 (idempotency option — affects schema if Option B is selected)
2. OD-002 (database provider)
3. OD-003 (multi-aggregate support)
4. OD-005 (database privilege model)
5. OD-007 (tenant identity mapping)
6. OD-008 (PO lifecycle tracking)
7. OD-009 (position lifecycle flags)
8. OD-011 (rejected-command audit records)
9. OD-012 (warnings persistence)
10. OD-013 (derived snapshots durability)
11. OD-019 (revision scope)
12. OD-020 (event-history performance strategy)

#### Deferred Decisions (Not Required for Phase A or Phase B)

- OD-006 (EmployeeRegistry integration — Phase C)
- OD-010 (outbox consumer — Phase C)
- OD-016 (validation namespace — Phase E)
- OD-017 (production-readiness criteria — Phase G)
- OD-018 (adapter supplied-cost shape — Phase C)

#### Technical-Investigation Decisions (Establish Before Presenting to Owner)

- OD-004 (physical PK type — requires TEXT vs UUID performance analysis)
- OD-006 (EmployeeRegistry integration — requires inspection of existing resolveUserIdentity/resolveCanonicalIdentity)
- OD-015 (migration strategy — requires evaluation of available tooling)
- OD-016 (validation namespace — requires evaluation of isolation approaches)
- OD-020 (event-history performance — requires profiling of aggregate load time)

---

### 14.2 Owner-Decision Disposition

The following disposition was recorded by the owner approval on 2026-07-28. Each decision is classified into one of: APPROVED BY OWNER, DELEGATED TO ISOLATED SCHEMA DESIGN, DEFERRED — ADAPTER IMPLEMENTATION, DEFERRED — TRANSPORT/API CONTRACT, DEFERRED — OPERATIONAL OR PRODUCTION READINESS, or REQUIRES TECHNICAL EVIDENCE BEFORE OWNER DECISION.

| Decision ID | Previous Status | New Status | Controlling Clause |
|---|---|---|---|
| OD-001 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.4 (Domain-Exact Idempotency: Option A approved) |
| OD-002 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.2 (Durable-State Authority: PostgreSQL approved) |
| OD-003 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.7 (Tenant Isolation: tenant-aware aggregate identity approved) |
| OD-004 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 (database physical primary-key types) |
| OD-005 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.10 (Database Privilege Model: direct DML approved) |
| OD-006 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.6 (Trusted Identity and Authorization) |
| OD-007 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.7 (Tenant Isolation: tenant-scoped records approved) |
| OD-008 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 (schema details — not a domain behavior change) |
| OD-009 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 (schema details — not a domain behavior change) |
| OD-010 | UNRESOLVED | DEFERRED — ADAPTER IMPLEMENTATION | Phase 2.11 (outbox design approved; consumer implementation deferred) |
| OD-011 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.9, 2.12 (rejected results NOT durably stored unless separately approved) |
| OD-012 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.12 (persist warnings following approved field-level mapping) |
| OD-013 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 2.13, Phase 3 (snapshot storage details) |
| OD-014 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 2.13, Phase 3 (snapshot storage details) |
| OD-015 | UNRESOLVED | DELEGATED TO ISOLATED SCHEMA DESIGN | Phase 3 (migration ownership and deployment mechanics) |
| OD-016 | UNRESOLVED | DEFERRED — OPERATIONAL OR PRODUCTION READINESS | Not required for schema design or adapter implementation |
| OD-017 | UNRESOLVED | DEFERRED — OPERATIONAL OR PRODUCTION READINESS | Not required for schema design or adapter implementation |
| OD-018 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.14 (Supplied-Cost Handling: one authoritative cost input) |
| OD-019 | UNRESOLVED | APPROVED BY OWNER — this authorization | Phase 2.8 (Revision and Concurrency: one monotonic durable revision per aggregate) |
| OD-020 | UNRESOLVED | REQUIRES TECHNICAL EVIDENCE BEFORE OWNER DECISION | Phase 3 (pending technical evidence — not simultaneously approved and unresolved) |

**Approved by owner**: OD-001, OD-002, OD-003, OD-005, OD-006, OD-007, OD-011, OD-012, OD-018, OD-019 (10 decisions)
**Delegated to isolated schema design**: OD-004, OD-008, OD-009, OD-013, OD-014, OD-015 (6 decisions)
**Deferred — adapter implementation**: OD-010 (1 decision)
**Deferred — operational or production readiness**: OD-016, OD-017 (2 decisions)
**Requires technical evidence before owner decision**: OD-020 (1 decision)

No decision is simultaneously approved and unresolved. No contract-fixed behavior is presented as optional. No technical implementation choice is presented as a domain rule.

---

## 15. Explicit Non-Authorization Statement

This proposal is a **specification and architecture analysis only**. It does NOT authorize:

- Implementation of the adapter
- Provisioning of Supabase or any other database
- Execution of SQL
- Running migrations
- Creation or alteration of database objects
- Addition of database credentials or secrets
- Modification of production code
- Modification of the Stage 2G1-A governing contract
- Modification or activation of Stage 2G1-B
- Execution of BT-042
- Deployment of anything
- Introduction of new public error codes (e.g., `IDEMPOTENCY_CONFLICT`, which does NOT exist in the domain registry and is NOT authorized)
- Approval of `fn_command_fingerprint` as a domain authority
- Persistence of rejected-command audit records

Each implementation phase requires separate owner authorization before proceeding.

---

## 16. File Integrity

Final SHA-256 hashes, byte sizes, physical line counts, and final-newline status for this file and related artifacts are CALCULATED EXTERNALLY AFTER FINALIZATION. They are reported in the Base44 final response, not embedded in this file, because a file cannot reliably contain its own final SHA-256.

### Unmodified Files (Confirmed)

| File | SHA-256 | Modified |
|------|---------|----------|
| `base44/shared/inventory-ledger/contracts/STAGE_2G1A_REPLACEMENT_GOVERNING_CONTRACT_v1.0.0.md` | `9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7` | No |
| `base44/shared/inventory-ledger/2g1a/publicBoundary.ts` | `a5794e049b721f6a1d0b4ad815606b455e8e069ba8bef25af0407b07be4bbd31` | No |
| `base44/shared/inventory-ledger/stage_2g1a_receipt_validation.sql` | `935a18cebf057575247787d22fc5f5f0bec3b4d04540bf65949de527cecbec4c` | No |
