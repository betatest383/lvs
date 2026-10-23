# STAGE 2G1-B — IMPLEMENTATION AUTHORIZATION CONTRACT

---

## 1. Scope and Non-Authorization Statement

Stage 2G1-B extends the isolated 2G1-A inventory ledger module to support **partial (incremental) transfer receipts**. No production code has been written. No 2G1-A file has been modified. No database or UI implementation is authorized.

Base44 has created this contract artifact. The owner must explicitly approve its exact path, contents, and SHA-256 hash before any implementation may begin.

Implementation is **not authorized** until the owner explicitly approves this contract.

---

## 2. Actual Inspected 2G1-A Source Findings

### 2.1 `processEvent` Order (Source: `publicBoundary.ts` lines 370–482)

```
evaluateEvent2G1A:
  1. Null/non-object input check
  2. event_type present and is string
  3. Discriminator recognition
  4. Structural validation (validateStructure)
  5. Cost parsing (E5/E33 only)
  6. buildDomainEvent
  7. processEvent:
     7a. IDEMPOTENCY CHECK (lines 381–390) — BEFORE event-specific logic
     7b. processEventSpecific → processE9:
         i.   Finiteness check
         ii.  Positivity check
         iii. Transfer lookup
         iv.  Status check
         v.   qty > dispatched
         vi.  qty < dispatched (partial → AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B)
         vii. Destination mismatch
         viii.In-transit position lookup
         ix.  Negative result check
         x.   Destination position lookup
     7c. Clone state
     7d. Apply effects
     7e. Apply operations
     7f. Validate invariants
     7g. Build AcceptedEventRecord (record_id = `AER-${idemKey}-${afterRevision}`) — line 417
     7h. Nonrecursion assertion
     7i. Insert AcceptedEventRecord — line 452
     7j. Advance revision
     7k. Return accepted result (formula_version = FORMULA_VERSION = "2g1a-v1.0.0")
```

**Key finding:** Idempotency check (step 7a) runs BEFORE finiteness/positivity (7b.i–ii) and BEFORE transfer lookup (7b.iii).

### 2.2 AcceptedEventRecord Identity (Source: `publicBoundary.ts` line 417)

```typescript
const recordId = `AER-${idemKey}-${c.afterRevision}`;
```

- Format: `"AER-" + idempotency_key + "-" + after_revision`
- Stored at: `cloned.transactions[recordId]` (line 452)
- Idempotency lookup: linear scan of `state.transactions`, comparing `txn.idempotency_key === idemKey` (lines 382–389) — does NOT use `record_id`

### 2.3 Formula Version (Source: `resultTypes.ts` line 145)

```typescript
export const FORMULA_VERSION = "2g1a-v1.0.0";
```

Used in `AcceptedEventRecord.formula_version` (line 430) and `AcceptedDomainResult.formula_version` (line 478).

### 2.4 `sortOperations` Signature (Source: `comparator.ts` line 34)

```typescript
export function sortOperations(ops: AtomicRecordOperation2G1A[]): AtomicRecordOperation2G1A[]
```

Key map (lines 42–54) does not include `transfer_outstanding_partial_receipt_updated`. Unknown kinds fall through to `keys[ak] || "op_kind"` (line 55).

### 2.5 `compareStrings` Signature (Source: `comparator.ts` line 9)

```typescript
export function compareStrings(a: string, b: string): number
```

This is a primitive string comparator. Its parameter and return types are `string`. It contains no 2G1-A-specific types. It is genuinely compatible for reuse.

---

## 3. Exact 2G1-B Evaluation Pipeline (30 Steps)

```
evaluateEvent2G1B(rawInput, state):
  1.  Null/non-object input validation
  2.  event_type presence and type validation
  3.  2G1-B discriminator/scope validation (event_type === "transfer.received")
  4.  Structural validation (required fields, allowed keys, source_document_type === "transfer")
  5.  Duplicate-idempotency check (scan state.transactions for matching idempotency_key)
  6.  Quantity finiteness (isFiniteNumber)
  7.  Quantity positivity (isPositiveFinite)
  8.  Transfer existence (state.transfers_outstanding[transfer_id])
  9.  Transfer status (status === "outstanding")
  10. Calculate remaining_before = dispatched_quantity − received_quantity
  11. Delegate a full first-time receipt to evaluateEvent2G1A
      (received_quantity === 0 AND qty === dispatched_quantity)
  12. Validate receipt does not exceed remaining quantity (qty ≤ remaining_before)
  13. Validate destination (destination_position_id === transfer.destination_position_id)
  14. Validate item (item_id === transfer.item_id)
  15. Validate in-transit/source position (in_transit_position_id exists)
  16. Validate nonnegative in-transit result (inTransit.position_quantity − qty ≥ 0)
  17. Validate destination position (destination_position_id exists)
  18. Calculate cumulative_received_after, remaining_after, new_status
  19. Create quantity effects (in-transit −qty, destination +qty)
  20. Create the partial-receipt update operation
  21. Emit applicable blockers
  22. Clone state
  23. Apply effects
  24. Apply record operations
  25. Validate all 2G1-A invariants plus the new 2G1-B transfer-outstanding consistency invariant
  26. Build the AcceptedEventRecord (record_id = `AER-${idempotency_key}-${afterRevision}`)
  27. Perform the nonrecursion assertion
  28. Insert the AcceptedEventRecord
  29. Advance the state revision
  30. Return the accepted result (formula_version = FORMULA_VERSION_2G1B)
```

**Implementation must preserve the exact validation and rejection precedence specified in this contract. Tests cannot weaken or reorder it.**

---

## 4. Rejection-Precedence Table

| Scenario | Conditions Simultaneously True | Winning Code | Reason |
|---|---|---|---|
| Unknown event type + duplicate idempotency | Step 3 + Step 5 | `AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE` | Event-type check (step 3) precedes idempotency (step 5) |
| Missing transfer_id + duplicate idempotency | Step 4 + Step 5 | `VALIDATION.MISSING_REQUIRED_FIELD` | Structural validation (step 4) precedes idempotency (step 5) |
| Duplicate idempotency + NaN quantity | Step 5 + Step 6 | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | Idempotency (step 5) precedes finiteness (step 6) |
| Duplicate idempotency + transfer status=received | Step 5 + Step 9 | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | Idempotency (step 5) precedes status check (step 9) |
| Duplicate idempotency + transfer not found | Step 5 + Step 8 | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` | Idempotency (step 5) precedes transfer lookup (step 8) |
| NaN + transfer not found | Step 6 + Step 8 | `UOM.NON_FINITE_QUANTITY` | Finiteness (step 6) precedes transfer lookup (step 8) |
| Zero qty + transfer not found | Step 7 + Step 8 | `VALIDATION.NON_POSITIVE_QUANTITY` | Positivity (step 7) precedes transfer lookup (step 8) |
| Transfer not found + status=received | Step 8 + Step 9 | `TRANSFER.RECEIVE_WITHOUT_DISPATCH` | Transfer lookup (step 8) fails first |
| Over-receipt + destination mismatch | Step 12 + Step 13 | `TRANSFER.RECEIVE_EXCEEDS_REMAINING` | Exceeds-remaining (step 12) precedes destination (step 13) |
| Over-receipt + item mismatch | Step 12 + Step 14 | `TRANSFER.RECEIVE_EXCEEDS_REMAINING` | Exceeds-remaining (step 12) precedes item (step 14) |
| Destination mismatch + item mismatch | Step 13 + Step 14 | `TRANSFER.DESTINATION_MISMATCH` | Destination (step 13) precedes item (step 14) |
| Negative position + destination not found | Step 16 + Step 17 | `INV.NEGATIVE_RESULT` | Negative result (step 16) precedes destination lookup (step 17) |

**Explicit precedence requirements:**
- Structural errors precede duplicate-idempotency evaluation.
- Duplicate idempotency precedes quantity and transfer-state checks.
- Therefore, BT-019 must return: `INV.IDEMPOTENCY_DUPLICATE_CONTRACT`.
- A post-completion receipt with a new idempotency key must return: `TRANSFER.RECEIVE_WITHOUT_DISPATCH`.
- Non-finite quantity precedes transfer lookup.
- Non-positive quantity precedes transfer lookup.
- Exceeds-remaining precedes destination and item mismatches.
- Destination mismatch precedes item mismatch.

---

## 5. Type Model

### 5.1 New Error Codes

```typescript
type DomainErrorCode2G1B =
  | DomainErrorCode2G1A
  | "TRANSFER.RECEIVE_EXCEEDS_REMAINING"
  | "AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE";
```

### 5.2 New Error Type

```typescript
interface DomainError2G1B {
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
```

### 5.3 New Operation Type

```typescript
interface TransferOutstandingPartialReceiptUpdatedOp {
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
```

### 5.4 Extended Operation Union

```typescript
type AtomicRecordOperation2G1B =
  | AtomicRecordOperation2G1A
  | TransferOutstandingPartialReceiptUpdatedOp;
```

**Correct array-assignability directions:**
- `AtomicRecordOperation2G1A[]` → `AtomicRecordOperation2G1B[]`: **assignable** (each 2G1-A element is a member of the 2G1-B union)
- `AtomicRecordOperation2G1B[]` → `AtomicRecordOperation2G1A[]`: **NOT assignable** (a `TransferOutstandingPartialReceiptUpdatedOp` is not an `AtomicRecordOperation2G1A`)

This was **confirmed by actual `tsc` compilation** (see §7). The compiler explicitly rejected `AtomicRecordOperation2G1B[]` as an argument to `sortOperations(ops: AtomicRecordOperation2G1A[])`:

```
error TS2345: Argument of type 'AtomicRecordOperation2G1B[]' is not assignable to parameter of type 'AtomicRecordOperation2G1A[]'.
  Type 'AtomicRecordOperation2G1B' is not assignable to type 'AtomicRecordOperation2G1A'.
    Type 'TransferOutstandingPartialReceiptUpdatedOp' is not assignable to type 'AtomicRecordOperation2G1A'.
```

### 5.5 Result Types

```typescript
interface AcceptedDomainResult2G1B {
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

interface RejectedDomainResult2G1B {
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

type DomainResult2G1B = AcceptedDomainResult2G1B | RejectedDomainResult2G1B;
```

---

## 6. Compilation-Proven Delegation Analysis

### 6.1 Structural Reasoning

`DomainResult2G1A` appears structurally assignable to `DomainResult2G1B` because:
- `DomainErrorCode2G1A` is a subset of `DomainErrorCode2G1B` (narrower → wider: assignable)
- `AtomicRecordOperation2G1A` is a subset of `AtomicRecordOperation2G1B` (narrower → wider: assignable)
- Array covariance: `AtomicRecordOperation2G1A[]` → `AtomicRecordOperation2G1B[]` is assignable
- All remaining shared result fields use identical types (`DomainState`, `CanonicalStateEffect2G1A[]`, `DomainWarning[]`, `string`, `number`, etc.)

### 6.2 Compilation Verification

A temporary `.ts` file was created that:
1. Imported the **actual** 2G1-A types from the real source files
2. Defined the proposed 2G1-B types (§5)
3. Attempted direct assignment: `const result2g1b: DomainResult2G1B = result2g1a;`

**Result:** `tsc --noEmit` exited with code 0 (clean compile, no errors). The temporary file was deleted immediately after verification.

### 6.3 Conclusion

Direct assignment from `DomainResult2G1A` to `DomainResult2G1B` is **compilation-proven** to type-check without any assertion, adapter, or normalization function. No `as`, no `as unknown as`, no conversion function is required.

---

## 7. Compilation-Verification Evidence

### 7.1 2G1-A Baseline Compilation

| Item | Value |
|---|---|
| Command | `npx tsc --noEmit -p .tsconfig-2g1a-verify.json` |
| Working directory | `/app` |
| Exit code | 0 |
| Output | (no output — clean compile) |
| Files included | All 21 `.ts` files in `base44/shared/inventory-ledger/2g1a/` |
| Pre-existing errors? | No — 2G1-A compiles clean under strict mode |

### 7.2 Delegation Assignability Compilation

| Item | Value |
|---|---|
| Command | `npx tsc --noEmit -p .tsconfig-2g1b-verify2.json` |
| Working directory | `/app` |
| Exit code | 0 |
| Output | (no output — clean compile) |
| Test content | Imported real 2G1-A types; defined proposed 2G1-B types; attempted `const result2g1b: DomainResult2G1B = result2g1a;` |
| Result | **COMPILATION-PROVEN**: direct assignment compiles without error |
| Unsafe assertion required? | No |
| Adapter function required? | No |

### 7.3 Sort Incompatibility Compilation (Confirming §5.4)

| Item | Value |
|---|---|
| Command | `npx tsc --noEmit -p .tsconfig-2g1b-verify.json` |
| Working directory | `/app` |
| Exit code | 2 |
| Error | `error TS2345: Argument of type 'AtomicRecordOperation2G1B[]' is not assignable to parameter of type 'AtomicRecordOperation2G1A[]'. Type 'TransferOutstandingPartialReceiptUpdatedOp' is not assignable to type 'AtomicRecordOperation2G1A'.` |
| Result | **CONFIRMED**: `AtomicRecordOperation2G1B[]` cannot be passed to `sortOperations(ops: AtomicRecordOperation2G1A[])`. A 2G1-B-owned sorter is required. |

### 7.4 TypeScript Version

`tsc --version` → `Version 5.9.3`

### 7.5 Temporary Files

All temporary files created during verification were deleted. No permanent files were created or modified during the verification pass.

---

## 8. 2G1-B-Owned Sorting Design

### 8.1 Required Function Signature

```typescript
function sortOperations2G1B(
  operations: AtomicRecordOperation2G1B[]
): AtomicRecordOperation2G1B[]
```

### 8.2 Implementation Design — Discriminated-Union with Exhaustive `never` Check

The sorter **must** be implemented as a discriminated-union switch with exhaustive checking. The implementation approach is **locked** — no generic string-key assertion fallback is authorized.

**Design note:** TypeScript does not automatically narrow `b` to the corresponding discriminated-union member when switching on `a.op_kind` after checking `a.op_kind === b.op_kind`. The corrected pattern therefore uses **two typed helper functions** (`primarySortKey` and `secondarySortKey`), each of which independently narrows its own single parameter. This avoids the narrowing gap entirely while retaining exhaustive `never` checking.

**Compilation-proven implementation (tsc 5.9.3, strict, 0 errors):**

```typescript
import { compareStrings } from "../2g1a/comparator.ts";
import type { AtomicRecordOperation2G1B } from "./atomicRecordOps.ts";

function primarySortKey(op: AtomicRecordOperation2G1B): string {
  switch (op.op_kind) {
    case "transfer_outstanding_created":
      return op.transfer_id;
    case "transfer_outstanding_received":
      return op.transfer_id;
    case "transfer_outstanding_partial_receipt_updated":
      return op.transfer_id;
    case "correction_provenance_created":
      return op.record_id;
    case "correction_provenance_reversal_updated":
      return op.provenance_record_id;
    case "correction_provenance_downstream_block_updated":
      return op.provenance_record_id;
    case "job_issue_progress_created":
      return op.issue_event_id;
    case "job_issue_consumed_updated":
      return op.issue_event_id;
    case "job_issue_consumed_reversed":
      return op.issue_event_id;
    case "job_issue_returned_updated":
      return op.issue_event_id;
    case "accepted_event_record_inserted":
      return op.record.record_id;
    case "state_revision_advanced":
      return String(op.after_revision);
    default: {
      // Exhaustive never check — if a new op_kind is added without
      // handling it here, this line will fail to compile.
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

function secondarySortKey(op: AtomicRecordOperation2G1B): string {
  switch (op.op_kind) {
    case "correction_provenance_reversal_updated":
      return op.reversing_event_id;
    case "correction_provenance_downstream_block_updated":
      return op.blocking_event_id;
    case "job_issue_consumed_updated":
      return op.consumption_event_id;
    case "job_issue_consumed_reversed":
      return op.reversal_event_id;
    case "job_issue_returned_updated":
      return op.return_event_id;
    // Ops with no secondary key
    case "transfer_outstanding_created":
    case "transfer_outstanding_received":
    case "transfer_outstanding_partial_receipt_updated":
    case "correction_provenance_created":
    case "job_issue_progress_created":
    case "accepted_event_record_inserted":
    case "state_revision_advanced":
      return "";
    default: {
      // Exhaustive never check
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

export function sortOperations2G1B(
  operations: AtomicRecordOperation2G1B[]
): AtomicRecordOperation2G1B[] {
  return [...operations].sort((a, b) => {
    const ak = a.op_kind;
    const bk = b.op_kind;
    if (ak !== bk) return compareStrings(ak, bk);

    const c = compareStrings(primarySortKey(a), primarySortKey(b));
    if (c !== 0) return c;

    return compareStrings(secondarySortKey(a), secondarySortKey(b));
  });
}
```

### 8.3 Requirements Met

- ✅ Accepts and returns `AtomicRecordOperation2G1B[]`
- ✅ Handles every operation discriminator explicitly (all 12 op kinds)
- ✅ Includes `transfer_outstanding_partial_receipt_updated` using `transfer_id` as primary key
- ✅ Uses an exhaustive `never` check (the `default` branch assigns `ak` to `_exhaustive: never`)
- ✅ Contains no `as unknown as`
- ✅ Does not pass `AtomicRecordOperation2G1B[]` to the 2G1-A sorter
- ✅ Reuses `compareStrings` from `2g1a/comparator.ts` (genuinely compatible primitive)

### 8.4 Sorting Key Map

| `op_kind` | Primary Key | Secondary Key |
|---|---|---|
| `transfer_outstanding_partial_receipt_updated` | `transfer_id` | (none) |
| `transfer_outstanding_created` | `transfer_id` | (none) |
| `transfer_outstanding_received` | `transfer_id` | (none) |
| `correction_provenance_created` | `record_id` | (none) |
| `correction_provenance_reversal_updated` | `provenance_record_id` | `reversing_event_id` |
| `correction_provenance_downstream_block_updated` | `provenance_record_id` | `blocking_event_id` |
| `job_issue_progress_created` | `issue_event_id` | (none) |
| `job_issue_consumed_updated` | `issue_event_id` | `consumption_event_id` |
| `job_issue_consumed_reversed` | `issue_event_id` | `reversal_event_id` |
| `job_issue_returned_updated` | `issue_event_id` | `return_event_id` |
| `accepted_event_record_inserted` | `record.record_id` | (none) |
| `state_revision_advanced` | `after_revision` | (none) |

### 8.5 `sortErrors2G1B`

Also required because 2G1-B errors are `DomainError2G1B[]`, not `DomainError[]`.

`DomainError2G1B` is **not** a discriminated union — it is a plain interface with scalar fields (`category`, `error_code`, `affected_field`, etc.). No exhaustive `op_kind` switch is needed or applicable. The "discriminated-union/exhaustive approach" label does **not** apply to this function.

The required behavior is **deterministic sorting by**:
1. `category`
2. `error_code`
3. `affected_field`, using an explicit null representation (`"~"`) consistent with 2G1-A's `sortErrors` (source: `comparator.ts` lines 85–95)

**Compilation-proven implementation (tsc 5.9.3, strict, 0 errors):**

```typescript
import { compareStrings } from "../2g1a/comparator.ts";
import type { DomainError2G1B } from "./resultTypes.ts";

export function sortErrors2G1B(
  errors: DomainError2G1B[]
): DomainError2G1B[] {
  return [...errors].sort((a, b) => {
    const c = compareStrings(a.category, b.category);
    if (c !== 0) return c;

    const c2 = compareStrings(a.error_code, b.error_code);
    if (c2 !== 0) return c2;

    const af = a.affected_field ?? "~";
    const bf = b.affected_field ?? "~";
    return compareStrings(af, bf);
  });
}
```

The implementation accepts and returns `DomainError2G1B[]` and contains no `as unknown as`, `any`, `@ts-ignore`, or `@ts-expect-error`.

---

## 9. AcceptedEventRecord Identity Rules

### 9.1 Production Evaluator Behavior

| Property | Value |
|---|---|
| `record_id` format | `` `AER-${idempotency_key}-${afterRevision}` `` |
| Example (idempotency_key = "IDEM-032", afterRevision = 2) | `"AER-IDEM-032-2"` |
| Key in `state.transactions` | The `record_id` string itself |
| Idempotency lookup method | Linear scan of `state.transactions` values, comparing `txn.idempotency_key === idemKey` |
| Does lookup use `record_id`? | No — uses the `idempotency_key` field stored on each record |

### 9.2 Fixture-Only Setup Behavior

| Property | Value |
|---|---|
| `record_id` format | `` `AER-${idempotency_key}` `` (no revision suffix) |
| Example | `"AER-IDEM-032"` |
| Source | `testFixtures.ts` line 117: `const recordId = \`AER-${idem}\`;` |

### 9.3 Rules

1. The simplified fixture ID (`AER-${idempotency_key}`) is **only test-setup behavior** — it is not the production evaluator's identity formula.
2. Duplicate-idempotency detection scans transaction records by `txn.idempotency_key`. Duplicate detection **does not depend on record_id formatting**.
3. New 2G1-B accepted records **must use the production evaluator format** (`AER-${idempotency_key}-${afterRevision}`) unless a later approved contract explicitly changes it.

---

## 10. Atomic-Operation Contract

### 10.1 New Operation: `TransferOutstandingPartialReceiptUpdatedOp`

| Field | Type | Description |
|---|---|---|
| `op_kind` | `"transfer_outstanding_partial_receipt_updated"` | Literal discriminator |
| `transfer_id` | `string` | Transfer being incrementally received |
| `cumulative_received_after` | `number` | Total received after this receipt |
| `remaining_after` | `number` | Remaining unreceived after this receipt |
| `new_status` | `TransferOutstandingStatus2G1A` | `"outstanding"` if remaining > 0, `"received"` if remaining = 0 |
| `receive_event_id` | `string` | Event ID of this partial receipt |
| `before.received_quantity` | `number` | Cumulative received before this receipt |
| `before.remaining_quantity` | `number` | Remaining before this receipt |
| `before.status` | `TransferOutstandingStatus2G1A` | Status before (always `"outstanding"`) |
| `after.received_quantity` | `number` | Cumulative received after this receipt |
| `after.remaining_quantity` | `number` | Remaining after this receipt |
| `after.status` | `TransferOutstandingStatus2G1A` | Status after |

### 10.2 Classification

This operation is a **recorded domain operation** (included in `AcceptedEventRecord.recorded_operations`), not an applier-only operation. It is analogous to `TransferOutstandingReceivedOp` in 2G1-A.

### 10.3 Effects Produced

| Effect | Position | Delta | Reason |
|---|---|---|---|
| `PositionQuantityEffect` | in-transit | `−qty` | `"transfer_receipt"` |
| `PositionQuantityEffect` | destination | `+qty` | `"transfer_receipt"` |

No `CompanyOwnedEffect` is produced (partial receipt moves quantity between company-owned positions without changing the total).

---

## 11. Invariant Rules

### 11.1 Inherited 2G1-A Invariants (Run on Post-State)

| Invariant | Function | Failure Code |
|---|---|---|
| Company-owned reconciliation | `validateCompanyOwnedReconciliation` | `RECONCILIATION.COMPANY_OWNED_MISMATCH` |
| Terminal zero-balance | `validateTerminalZeroBalance` | `STATE.WRONG_TRANSITION` |
| Job issue progress reconciliation | `validateJobIssueProgress` | `RECONCILIATION.COMPANY_OWNED_MISMATCH` / `CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE` / `STATE.WRONG_TRANSITION` |
| Correction provenance equation | `validateCorrectionProvenance` | `CORRECTION.REVERSAL_EXCEEDS_AVAILABLE` |

### 11.2 New 2G1-B Invariant

```
For each transfer in state.transfers_outstanding:
  received_quantity >= 0
  received_quantity <= dispatched_quantity
  (status === "received")    iff (received_quantity === dispatched_quantity)
  (status === "outstanding") iff (received_quantity <  dispatched_quantity)
```

| Property | Value |
|---|---|
| Function name | `validateTransferOutstandingConsistency` |
| Failure code | `STATE.WRONG_TRANSITION` (existing 2G1-A code — no new code needed) |
| Runs against | Post-state (after effects and operations applied) |
| Pre-state assumption | Pre-state is valid per the evaluator's input contract |

---

## 12. State-Transition Formulas

### 12.1 Arithmetic

```
dispatched_quantity          = transfer.dispatched_quantity  (immutable)
cumulative_received_before   = transfer.received_quantity
incoming_receipt_quantity   = evt.quantity
cumulative_received_after    = cumulative_received_before + incoming_receipt_quantity
remaining_before            = dispatched_quantity - cumulative_received_before
remaining_after             = dispatched_quantity - cumulative_received_after
```

### 12.2 Status Transition

| `remaining_after` | `new_status` |
|---|---|
| `> 0` | `"outstanding"` |
| `= 0` | `"received"` |
| `< 0` | Never accepted (rejected at step 12 with `TRANSFER.RECEIVE_EXCEEDS_REMAINING`) |

### 12.3 Formula Version

| Result Source | `formula_version` |
|---|---|
| Native 2G1-B partial receipt | `FORMULA_VERSION_2G1B` = `"2g1b-v1.0.0"` |
| Delegated full first-time receipt (via `evaluateEvent2G1A`) | `FORMULA_VERSION` = `"2g1a-v1.0.0"` (preserved from 2G1-A's result) |

---

## 13. Recommended Seven-File Organization

### 13.1 Classification

| Classification | Description |
|---|---|
| Recommended maintainable organization | Seven files |
| Potential consolidated organization | Fewer files may be possible (types and validators could be merged) |
| Compilation-proven minimum | **Not established** — no 2G1-B files have been created or compiled as a module |

**If the owner approves this contract, the seven-file organization below is approved as the required implementation organization.** It is not a compilation-proven minimum, but it is the mandated structure for implementation under this contract.

### 13.2 Seven-File Structure

| # | File | Responsibility |
|---|---|---|
| 1 | `base44/shared/inventory-ledger/2g1b/eventTypes.ts` | `DomainErrorCode2G1B` (extends `DomainErrorCode2G1A` with 2 new codes) |
| 2 | `base44/shared/inventory-ledger/2g1b/atomicRecordOps.ts` | `TransferOutstandingPartialReceiptUpdatedOp`, `AtomicRecordOperation2G1B` |
| 3 | `base44/shared/inventory-ledger/2g1b/resultTypes.ts` | `DomainError2G1B`, `AcceptedDomainResult2G1B`, `RejectedDomainResult2G1B`, `DomainResult2G1B`, `makeError2G1B`, `makeRejected2G1B`, `FORMULA_VERSION_2G1B` |
| 4 | `base44/shared/inventory-ledger/2g1b/invariantValidators.ts` | `validateTransferOutstandingConsistency`, `validateAllInvariants2G1B` (wraps 2G1-A's `validateAllInvariants`) |
| 5 | `base44/shared/inventory-ledger/2g1b/publicBoundary.ts` | `evaluateEvent2G1B`, `sortOperations2G1B`, `sortErrors2G1B`, reimplemented helpers |
| 6 | `base44/shared/inventory-ledger/2g1b/testSuite.ts` | 42-entry test registry (imports fixtures from `../2g1a/testFixtures.ts`) |
| 7 | `base44/shared/inventory-ledger/2g1b/index.ts` | Public exports barrel |

### 13.3 Import Graph (Dependency Direction: 2G1-B → 2G1-A only)

```
testSuite.ts → publicBoundary.ts, ../2g1a/testFixtures.ts
publicBoundary.ts → resultTypes.ts, atomicRecordOps.ts, invariantValidators.ts, eventTypes.ts,
                    ../2g1a/domainState.ts, ../2g1a/unitOfMeasureRules.ts,
                    ../2g1a/invariantValidators.ts, ../2g1a/comparator.ts (compareStrings only),
                    ../2g1a/publicBoundary.ts (evaluateEvent2G1A),
                    ../2g1a/quantityEffects.ts, ../2g1a/atomicRecordOps.ts,
                    ../2g1a/eventTypes.ts, ../2g1a/resultTypes.ts, ../2g1a/payloads.ts
invariantValidators.ts → ../2g1a/invariantValidators.ts, ../2g1a/domainState.ts,
                          ../2g1a/resultTypes.ts, eventTypes.ts
resultTypes.ts → eventTypes.ts, atomicRecordOps.ts,
                  ../2g1a/eventTypes.ts, ../2g1a/domainState.ts,
                  ../2g1a/quantityEffects.ts, ../2g1a/classificationResults.ts,
                  ../2g1a/valuationRules.ts, ../2g1a/payloads.ts
atomicRecordOps.ts → ../2g1a/eventTypes.ts, ../2g1a/atomicRecordOps.ts, ../2g1a/domainState.ts
eventTypes.ts → ../2g1a/eventTypes.ts
index.ts → publicBoundary.ts, resultTypes.ts, atomicRecordOps.ts, eventTypes.ts, invariantValidators.ts
```

**No circular dependencies. No 2G1-A file imports from 2g1b/.**

### 13.4 Stage Isolation Constraints

The following isolation constraints are mandatory and self-contained in this contract:

1. **Dependency direction is 2G1-B → 2G1-A only.** No 2G1-A file may import from 2G1-B.
2. **No 2G1-A source file may be modified for 2G1-B.**
3. **No database or UI implementation is authorized.**
4. **No unrelated event types may be added to 2G1-B.**
5. **Full first-time transfer receipts remain delegated to 2G1-A** (`evaluateEvent2G1A`).
6. **Native 2G1-B processing is authorized for three receipt cases**, and **only** a full first-time receipt is delegated to 2G1-A:

   **Case A — First partial receipt:**
   - transfer status is `"outstanding"`
   - `received_quantity === 0`
   - incoming quantity is positive and **strictly less than** `dispatched_quantity`

   **Case B — Later incremental receipt:**
   - transfer status is `"outstanding"`
   - `received_quantity > 0`
   - incoming quantity is positive and **does not exceed** remaining quantity

   **Case C — Completing receipt after one or more partial receipts:**
   - incoming quantity **equals** remaining quantity
   - resulting status becomes `"received"`

   **Delegation to `evaluateEvent2G1A`** is preserved **only** for a full first-time receipt where:
   - `received_quantity === 0`
   - **AND** incoming quantity `===` `dispatched_quantity`

   This scope is consistent with BT-001 (first partial receipt), BT-004 (first of two equal halves), BT-005 (single-unit partial receipt), BT-006 (full first-time receipt delegation), BT-007 (completing receipt after partial), and the exact 30-step pipeline (§3, step 11).
7. **Rejected evaluation must leave the original state unchanged** (zero mutation on rejection).

---

## 14. Complete 42-Entry Registry with Corrected Classification

### A. Accepted Behavioral Tests (8)

| ID | Requirement | Formula Version |
|---|---|---|
| BT-001 | First partial receipt | `"2g1b-v1.0.0"` |
| BT-002 | Second sequential partial receipt | `"2g1b-v1.0.0"` |
| BT-003 | Final completing receipt | `"2g1b-v1.0.0"` |
| BT-004 | Two equal halves | `"2g1b-v1.0.0"` (each) |
| BT-005 | Single-unit partial receipt | `"2g1b-v1.0.0"` |
| BT-006 | Full first-time receipt delegation | `"2g1a-v1.0.0"` |
| BT-007 | Completing receipt after partial | `"2g1b-v1.0.0"` |
| BT-037 | Blocker emission with existing provenance | `"2g1b-v1.0.0"` |

### B. Rejected Behavioral Tests (24)

| ID | Requirement | Rejection Code |
|---|---|---|
| BT-008 | One unit above remaining | `TRANSFER.RECEIVE_EXCEEDS_REMAINING` |
| BT-009 | Zero quantity | `VALIDATION.NON_POSITIVE_QUANTITY` |
| BT-010 | Negative quantity | `VALIDATION.NON_POSITIVE_QUANTITY` |
| BT-011 | NaN | `UOM.NON_FINITE_QUANTITY` |
| BT-012 | Positive infinity | `UOM.NON_FINITE_QUANTITY` |
| BT-013 | Negative infinity | `UOM.NON_FINITE_QUANTITY` |
| BT-014 | Missing transfer | `TRANSFER.RECEIVE_WITHOUT_DISPATCH` |
| BT-015 | Destination mismatch | `TRANSFER.DESTINATION_MISMATCH` |
| BT-016 | Item mismatch | `VALIDATION.ITEM_MISMATCH` |
| BT-017 | Duplicate idempotency key | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` |
| BT-018 | Replay after partial acceptance | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` |
| BT-019 | Replay after completion | `INV.IDEMPOTENCY_DUPLICATE_CONTRACT` |
| BT-020 | Receipt after completion (new key) | `TRANSFER.RECEIVE_WITHOUT_DISPATCH` |
| BT-021 | Full dispatched after partial | `TRANSFER.RECEIVE_EXCEEDS_REMAINING` |
| BT-022 | Exceeding dispatched, first receipt | `TRANSFER.RECEIVE_EXCEEDS_REMAINING` |
| BT-023 | Missing transfer_id | `VALIDATION.MISSING_REQUIRED_FIELD` |
| BT-024 | Missing quantity | `VALIDATION.MISSING_REQUIRED_FIELD` |
| BT-025 | Unknown payload key | `VALIDATION.UNKNOWN_PAYLOAD_KEY` |
| BT-026 | Missing unit_of_measure | `VALIDATION.MISSING_REQUIRED_FIELD` |
| BT-027 | unit_of_measure null | `VALIDATION.MISSING_REQUIRED_FIELD` |
| BT-030 | Negative-position prevention | `INV.NEGATIVE_RESULT` |
| BT-034 | Rejected-event revision preservation | `VALIDATION.NON_POSITIVE_QUANTITY` |
| BT-035 | Non-transfer event out of scope | `AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE` |
| BT-036 | Unknown event discriminator | `AUTHORIZATION.EVENT_OUT_OF_2G1B_SCOPE` |

### C. Direct Invariant Unit Tests (1)

| ID | Requirement | Validator |
|---|---|---|
| BT-031 | Transfer outstanding consistency (received > dispatched) | `validateTransferOutstandingConsistency` |

### D. Property Tests (4)

| ID | Requirement | Property Verified |
|---|---|---|
| BT-029 | Company-owned quantity unchanged | `company_owned_quantity` before === after |
| BT-032 | Accepted-event record insertion and bookkeeping | `record_id` = `"AER-${idemKey}-${afterRevision}"`; recorded_operations excludes applier-only ops; `formula_version` = `"2g1b-v1.0.0"` |
| BT-033 | State revision advancement | `state_revision` after = before + 1 |
| BT-038 | Zero mutation on rejection (aggregate) | `deepEqual(state_before, state_after)` for all 9 DomainState members |

### E. Static Isolation/Closure Checks (3)

| ID | Requirement | Method |
|---|---|---|
| BT-039 | Prohibited imports | `grep` for `@base44/sdk`, `base44Client`, `.entities.`, `.auth.` in `2g1b/` → 0 matches |
| BT-040 | Production-import isolation | `grep` for `inventory-ledger/2g1b` in `src/`, `base44/functions/`, `base44/agents/` → 0 matches |
| BT-041 | 2G1-A hash preservation | SHA-256 of both baseline files unchanged after 2G1-B creation |

### F. Documented Limitations (1 — NOT executable)

| ID | Requirement | Why Not Executable |
|---|---|---|
| BT-028 | Transfer-to-event UOM consistency | `TransferOutstanding` interface does not include `unit_of_measure`. No authoritative state source permits UOM comparison. Structural UOM validation (BT-026, BT-027) is the only supported check. |

### G. External Database Verification Procedures (1 — NOT executable in pure module)

| ID | Requirement | Why Not Executable |
|---|---|---|
| BT-042 | Zero production or persistent-data mutation | Requires database access to compare entity counts before and after. A pure shared-library test suite cannot query or prove all production entity counts. Requires an authorized external harness. |

---

## 15. Isolation and Closure Checks

| Check | Classification | Description |
|---|---|---|
| BT-039 | Executable static check | Prohibited imports: 0 matches |
| BT-040 | Executable static check | Production-import isolation: 0 matches |
| BT-041 | Future post-implementation gate | Hash baselines already observed during discovery; BT-041 re-computes after 2G1-B creation |
| BT-042 | External/database verification procedure | NOT executable in pure module; no-production-mutation enforced by isolation (BT-039, BT-040) |

### 15.1 Hash Baselines (Observed During Discovery)

| File | SHA-256 |
|---|---|
| `base44/shared/inventory-ledger/2g1a/publicBoundary.ts` | `a5794e049b721f6a1d0b4ad815606b455e8e069ba8bef25af0407b07be4bbd31` |
| `base44/shared/inventory-ledger/2g1a/independentAudit/supplementalFiniteTests.ts` | `b7ed27e87f3b603ac1d367d0546cb535bc7331bdad0585d51f0ce4d67abb6474` |

---

## 16. BT-028 Documented Limitation

**BT-028:** Transfer-to-event UOM consistency is not representable because `TransferOutstanding` (source: `domainState.ts` lines 46–57) does not include a `unit_of_measure` field. No existing authoritative state source permits UOM comparison between a transfer record and an incoming receipt event. Structural UOM validation (field existence and value presence — BT-026, BT-027) is the only supported UOM check. This is a **documented non-representable requirement**, not an executable test.

---

## 17. BT-042 External Database Verification Procedure

**BT-042:** Zero production or persistent-data mutation. This is an **external/database verification procedure**, not an executable module test. A pure shared-library test suite (no SDK, no network, no database access) cannot query or prove all production entity counts. The no-production-mutation requirement is enforced by:
- Isolation: no production file imports `2g1b/` (BT-040)
- Prohibited imports: no SDK/entity/auth references in `2g1b/` (BT-039)
- Design constraint: `evaluateEvent2G1B` operates on an in-memory `DomainState` and returns a `DomainResult2G1B` — it does not call any persistence API

If formal database verification is required, an authorized external harness must be created separately.

---

## 18. Final Unresolved Issues

| # | Issue | Status |
|---|---|---|
| 1 | Owner must explicitly approve this contract's exact path, contents, and SHA-256 hash | **Pending owner approval** |

No other unresolved issues remain. The contract artifact has been created. The sorter design is locked to a discriminated-union implementation with exhaustive `never` checking (§8). The seven-file organization is approved as the required implementation organization if the owner approves this contract (§13).

---

## 19. Explicit Owner-Approval Gate

| Decision | Status |
|---|---|
| Approve exact 30-step evaluation pipeline (§3) | **Pending owner approval** |
| Approve rejection-precedence table (§4) | **Pending owner approval** |
| Approve type model (§5) | **Pending owner approval** |
| Approve delegation compatibility as compilation-proven (§6, §7) | **Pending owner approval** |
| Approve `sortOperations2G1B` discriminated-union design (§8) | **Pending owner approval** |
| Approve `record_id` format `"AER-${idempotency_key}-${afterRevision}"` (§9) | **Pending owner approval** |
| Approve `FORMULA_VERSION_2G1B = "2g1b-v1.0.0"` (§12) | **Pending owner approval** |
| Approve 42-entry registry with corrected classification (§14) | **Pending owner approval** |
| Approve seven-file organization as required implementation structure (§13) | **Pending owner approval** |
| Approve stage isolation constraints (§13.4) | **Pending owner approval** |
| Approve this contract's exact path and SHA-256 hash | **Pending owner approval** |

**Stage 2G1-B remains unauthorized for implementation until the owner explicitly approves this contract's exact path and SHA-256 hash.**

Implementation must preserve the exact validation and rejection precedence specified in this contract. Tests cannot weaken or reorder it.