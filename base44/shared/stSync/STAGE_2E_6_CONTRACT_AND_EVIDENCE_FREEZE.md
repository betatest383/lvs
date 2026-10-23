# Stage 2E.6 — Contract and Evidence Freeze

**Stage:** 2E.6 (Purchase-Order Sync Foundation)
**Direction:** ServiceTitan → LVC OS only (inbound). No outbound ServiceTitan writes.
**Mode at acceptance:** Shadow / dry-run only.
**Freeze status:** CONTRACT AND EVIDENCE FROZEN — IMPLEMENTATION UNCHANGED — STAGE 2E.7 NOT AUTHORIZED.
**Freeze date:** 2026-08-04 (America/New_York).
**Authorizing classification (verbatim):**
> STAGE 2E.6 IMPLEMENTED AND VERIFIED IN SHADOW MODE — NO EXTERNAL WRITES — NO PRODUCTION WATERMARK ADVANCEMENT.

This document is the single, authoritative freeze artifact for Stage 2E.6. It supersedes no implementation
contract; it records and fingerprints the accepted implementation. All SHA-256 values herein were
recalculated from current file contents at freeze time (see §F and verification log §V).

---

## §A. Stage 2E.6 Contract

### A.1 Scope
- **Entities in scope:** `PurchaseOrder` (header) and `PurchaseOrderLine` (line).
- **Source endpoint:** `/inventory/v2/tenant/{tenant}/purchase-orders` (page-based pagination; lines embedded in `items[]`).
- **Direction:** ServiceTitan → LVC OS only. The adapter performs **no** outbound writes to ServiceTitan, no ledger posting, and no Receipt/Bill/Transfer creation.
- **Identity keys:**
  - Header: `id` → `servicetitan_purchase_order_id` (string, int64-safe). Matched ONLY by this field.
  - Line: `items[].id` → `servicetitan_po_line_id` (string, int64-safe). Matched ONLY by this field.

### A.2 Explicitly excluded scope
- Receipts, bills, warehouse transfers, inventory adjustments: NOT imported by Stage 2E.6.
- Invoices, estimates, projects: NOT imported.
- Pricing engine: untouched.
- Customer, Job, Appointment synchronization: unchanged (no contract change intended or made).
- Outbound ServiceTitan writes: prohibited (GET-only data ingestion).

### A.3 Source and destination system responsibilities
- **ServiceTitan owns:** source lifecycle `status`, vendor/warehouse/material IDs, monetary totals, dates, raw payload fields. These are overwritten on update by inbound sync.
- **LVC OS owns:** `po_number`, `lvc_workflow_status`, `approval_status`, `approval_history_json`, `replenishment_*`, `parent_po_*`, `created_by`, `approved_by`, `sent_by`, internal notes, and line `replenishment_id`. These are NEVER written by sync (enforced by `assertNoLvcFieldWritten`).
- **Non-promoted ST fields** (e.g. `summary`, `technicianId`, `shipTo`, `customFields`): preserved verbatim in `servicetitan_raw_data` (no lossy discard).

### A.4 Eligible ServiceTitan PO statuses
- **Eligible (enter active processing):** `Pending` (normalized → `draft`) and `Sent` (normalized → `sent`).
- The activation-time eligibility guard (new-records-only) is applied FIRST; the status gate is applied SECOND. Both must pass.

### A.5 Unsupported-status behavior
- Any status other than Pending/Sent (Received, Partially Received, Cancelled, unknown, or missing) is rejected BEFORE entering the active processing path — it never reaches dependency resolution or persistence.
- Stable reason codes:
  - `status_missing` (raw status null)
  - `status_unknown` (present but not in normalization map)
  - `status_not_pending_or_sent` (recognized but outside Pending/Sent)
- Unknown statuses are logged and classified as conflict; they are never silently mapped.

### A.6 Adapter input and output contracts
- **Input (source):** `StPoSource` (header) + `StPoLineSource[]` (`items[]`). Defined in `purchaseOrderAdapter.ts`.
- **Header mapped output:** `MappedPurchaseOrder` (defined in `stPurchaseOrderSync.ts`).
- **Line mapped output:** `MappedPoLine`.
- **Local record types:** `LocalPurchaseOrder`, `LocalPurchaseOrderLine`.
- **Post-batch summary:** `PoLineBatchSummary` (typed; guarded by `isPoLineBatchSummary`).

### A.7 Required identifiers
- Header: `servicetitan_purchase_order_id` (required; missing → record FAILED).
- Line: `servicetitan_po_line_id` (required; missing → line FAILED with `LINE_MISSING_ID`).
- Vendor: `servicetitan_vendor_id` (required; missing → deferred `VENDOR_MISSING_ID`).
- Warehouse: `servicetitan_warehouse_id` (required; missing → deferred `WAREHOUSE_MISSING_ID`).
- Material: `servicetitan_material_id` per line (required; missing → deferred `MATERIAL_MISSING_ID`).

### A.8 Null-versus-missing rules
- `buildPoRawData` preserves a field only when `record[key] !== undefined`. An explicit `null` is preserved in `servicetitan_raw_data`; an absent key is omitted.
- Promoted fields use `x || null`, so both absent and explicit-null normalize to canonical `null` (no distinction loss for promoted fields).
- Verified by Stage 2E.6 test 7 (explicit `summary: null` preserved in raw_data; absent `summary` omitted).

### A.9 Normalization rules
- **IDs:** `normalizePoId` → string (int64-safe).
- **Numbers:** `normalizeNumber` (null → 0 for required numerics).
- **Statuses (header):** `normalizePoStatus` lowercases TitleCase; `Pending→draft`, `Sent→sent`, `Received→received`, `Canceled→cancelled`, `Partially Received→partially_received`. Unknown → `status_unknown`, not silently mapped.
- **Statuses (line):** `normalizePoLineStatus` (`open`/`partially_received`/`received`/`cancelled`; `pending`/`sent`→`open`).
- **Dates:** passthrough; malformed incoming `modifiedOn` → `invalid_incoming` → stale-skip (test 6).
- **Quantities:** `quantity_outstanding = ordered - received`.
- **Monetary:** `subtotal = total - tax - shipping`.
- **Vendor/Warehouse:** resolved from local records by immutable ST IDs (never by name).

### A.10 Domain-service behavior
- `mapRecord`: maps source → mapped (header + lines via `mapLine`), resolves PO Type name from bounded in-memory cache (non-blocking).
- `findExisting`: looks up local record by `servicetitan_purchase_order_id`.
- `getLocalSourceModifiedOn`: returns `servicetitan_modified_on || servicetitan_last_event_at`.
- `recordsEqual`: compares promoted string/number fields + active flag + `lines_expected_count`; returns true → idempotent no-op.
- `createRecord` / `updateRecord`: build payloads via `buildPurchaseOrderCreateData` / `buildPurchaseOrderUpdateData`; enforce `assertNoLvcFieldWritten` against `PURCHASE_ORDER_LVC_OWNED_FIELDS`.
- `postBatchProcess`: processes embedded lines per created/updated header; updates header `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at`; returns `PoLineBatchSummary` with stable deferral reason codes.

### A.11 Dependency-resolution rules
- **Vendor (required, header):** missing ID → deferred; unresolved locally → deferred; resolved → `vendor_id`/`vendor_name` set.
- **Warehouse (required, header) — discriminated resolution:** distinguishes `WAREHOUSE_MISSING_ID`, `WAREHOUSE_MISSING`, `WAREHOUSE_AMBIGUOUS` (multiple candidates — never guesses), `WAREHOUSE_INACTIVE`. Never guesses between multiple candidates.
- **Material (required, per line) — discriminated resolution:** distinguishes `MATERIAL_MISSING_ID`, `MATERIAL_MISSING`, `MATERIAL_AMBIGUOUS`, `MATERIAL_INACTIVE`. A missing material defers only the line, not the header.
- **PO Type (non-blocking):** name resolved from bounded PO Types endpoint cache; unresolved → warning, non-deferring.

### A.12 Outcome classifications
- `created`, `updated`, `unchanged`, `deferred`, `skipped_pre_activation`, `skipped_stale`, `skipped_duplicate`, `failed`.
- Line-level outcomes (in `PoLineBatchSummary`): `po_lines_created_this_run`, `po_lines_updated_this_run`, `po_lines_unchanged_this_run`, `po_lines_stale_this_run`, `po_lines_deferred_this_run`, `po_lines_failed_this_run`, plus `line_deferral_reasons[]`.

### A.13 Idempotency contract
- Records matched ONLY by immutable ST IDs (never by PO number or vendor name).
- Exact duplicate source event → `recordsEqual` true → `unchanged`; no duplicate PO or line created (test 8, test 10).
- Safe-create with post-create recheck (`safeCreateWithRecheck`) routes through `findExisting` again after any create failure, preventing duplicate records on partial commits. Classified as `updated` on recheck recovery (keeps watermark metrics accurate).
- Later legitimate update (newer `modifiedOn`, changed fields) → `updated`, single record (test 9).
- Stale-event protection: incoming `modifiedOn` older than local → `skipped_stale` (fail-closed). Watermark tie (identical `modifiedOn`) → not stale → `unchanged` (test 21).

### A.14 Concurrency and serialization strategy
- Lock acquisition via `getOrCreateCursor` + `acquireLock` (domain `purchase_order`, integration `servicetitan_purchase_order_sync`). Lock conflict → engine returns `stopReason: "lock_conflict"`; orchestrator returns `already_running` with zero writes and no watermark advance (test 24).
- Lock released in `finally` (always).
- Single-queue serialization: no two concurrent sync cycles process the same domain.

### A.15 Watermark policy
- Watermark entity: `PurchaseOrderSyncWatermark` (key `purchase_order_go_live`).
- `getWatermark` reads committed watermark (read-only, both modes).
- Watermark advancement (write mode only) occurs ONLY when the full cycle completes with zero failures and no partial-run stop. A single failed record → `partial_failure`, watermark NOT advanced (test 22).
- Shadow/dry-run: `watermarkAfter === watermarkBefore` (no advancement) (tests 25–26).
- Incremental window: `windowStart = last_modified_scan_at - recovery_overlap_minutes` (default 5 min) (test 23).

### A.16 Shadow-mode guarantees
- `executionMode: "dry_run"`: no create/update/delete side effects; no `onSuccess`/`onFailure`/`postBatchProcess` side effects; no watermark advancement; no lock acquisition side effects beyond read.
- Stage 2E.6 validator runs in dry-run against a mock harness (`poSyncTestHarness`) with a mock `fetchPage` — no live ServiceTitan API calls, no production entity writes.

### A.17 Processing order
See §B (verified processing-order contract).

### A.18 Stable reason codes
- Eligibility: `pre_activation`, `no_activation_ts`, `missing_created_on`, `invalid_timestamp`, `status_missing`, `status_unknown`, `status_not_pending_or_sent`.
- Warehouse dependency: `WAREHOUSE_MISSING_ID`, `WAREHOUSE_MISSING`, `WAREHOUSE_AMBIGUOUS`, `WAREHOUSE_INACTIVE`, `WAREHOUSE_LOOKUP_ERROR`.
- Material dependency: `MATERIAL_MISSING_ID`, `MATERIAL_MISSING`, `MATERIAL_AMBIGUOUS`, `MATERIAL_INACTIVE`, `MATERIAL_LOOKUP_ERROR`.
- Line structural: `LINE_MISSING_ID`.

### A.19 Audit requirements
- `servicetitan_raw_data` preserves all unknown/non-promoted fields (forward-compatible, no lossy discard).
- `servicetitan_sync_status`, `servicetitan_sync_version`, `servicetitan_last_sync`, `servicetitan_source`, `import_source`, `imported_at` track sync provenance.
- Ownership assertions (`assertNoLvcFieldWritten`) fail closed on any LVC-owned field in a create/update payload.

### A.20 Safety invariants
See §C (safety-invariant registry).

### A.21 Known limitations
- Stage 2E.6 scope (Pending/Sent only) means a PO transitioning to Received/Partially Received/Cancelled in ServiceTitan is no longer reconciled via this sync; received-quantity state is the responsibility of the Receipt domain (separate stage).
- `validateStage2E5ReplacementRun` local source preserved as audit artifact; not an active remote deployment (see §C, §F).
- Standalone linting unavailable; type-soundness proven transitively via validator bundling/execution (see §E, §V).
- 2E.2A test 8 realigned to an eligible Pending→Sent update (received-status reconciliation no longer in scope; preserved via receipt domain).
- Speculative bill API discovery remains unresolved (no functional bill endpoint found); classified outside Stage 2E.6 scope.

---

## §B. Processing-Order Contract (verified)

The engine (`stSyncEngine.runSyncEngine`) and orchestrator (`poIncrementalOrchestrator.executeIncrementalSync`)
execute the following order. Per-record failure is contained (single-record failures do not terminate the batch).

1. **Tenant and authorization context** — caller identity and tenant/environment resolved; admin/owner or scheduler-secret gate enforced at HTTP handler boundary (validators are admin-gated).
2. **Mode validation** — `executionMode` is `dry_run` (shadow) or `write`. Stage 2E.6 acceptance is dry-run only.
3. **Committed-watermark read** — `getWatermark` (read-only, both modes). On failure, error logged, run continues.
4. **Lock acquisition (when `lockConfig` provided)** — `getOrCreateCursor` + `acquireLock`. Conflict → immediate return (`lock_conflict` / `already_running`), no writes, no advance.
5. **Controlled fetch or fixture intake** — `adapter.fetchPage` (live: page-based `/inventory/v2/...`; shadow/validator: mock `fetchPage`). Repeated-page / repeated-token detection guards against infinite loops.
6. **Source validation and adaptation** — `adapter.getSourceId`; missing ID → `failed` (`record_invalid`).
7. **Status eligibility** — `adapter.checkEligibility(base44, record, mapped|null, context)` (4-parameter contract). Activation guard first, then Pending/Sent status gate. Ineligible → `skipped_pre_activation` (never reaches mapping/persistence). **This runs BEFORE `mapRecord`.**
8. **Map the source record** — `adapter.mapRecord` produces header + lines; PO Type name resolved from cache (non-blocking).
9. **Idempotency evaluation** — `adapter.findExisting` (by `servicetitan_purchase_order_id`); version comparison via `compareSourceVersions`. Stale/invalid-incoming → `skipped_stale` (fail-closed). Equal → `unchanged`.
10. **Warehouse resolution** — `verifyDependencies` resolves vendor (required) then warehouse (required, discriminated). Unresolved required dep → `deferred`.
11. **PO-line material resolution** — in `postBatchProcess` per created/updated header; each line resolves material (discriminated). Unresolved → line `deferred` (header survives).
12. **Domain processing** — `createRecord` (via `safeCreateWithRecheck`) or `updateRecord`; ownership assertions enforce no LVC-owned field writes.
13. **Outcome classification** — `created` / `updated` / `unchanged` / `deferred` / `skipped_*` / `failed`; metrics accumulated; per-record errors bounded (`maxErrors`, default 50).
14. **Audit and idempotency evidence** — `servicetitan_raw_data`, sync provenance fields, line-sync tracking on header; `PoLineBatchSummary` collected into `EngineResult.postBatchSummaries`.
15. **Candidate-watermark calculation** — watermark advance candidate = `windowEnd || now` (write mode only), applied ONLY when full cycle completes with zero failures and no partial-run stop.
16. **Production-watermark commitment prohibition during shadow verification** — dry-run: `watermarkAfter === watermarkBefore`. Write-mode with any failure/partial stop: no advance. Lock released in `finally`.
17. **Deterministic result generation** — `EngineResult` (and orchestrator result) returned with full metrics, errors, retry metrics, and post-batch summaries.

---

## §C. Safety-Invariant Registry

Each invariant is frozen. Violation requires a contract amendment (§G).

| # | Invariant | Evidence |
|---|---|---|
| C1 | No ServiceTitan POST/PUT/PATCH/DELETE occurs in Stage 2E.6 shadow validation. | Validators report `live_api_calls: 0`, `writes_performed: 0`; 2E.2A test 29 asserts all business calls are GET; adapter performs inbound-only writes to local mock entities. |
| C2 | No production watermark advances. | Tests 22, 24, 25–26 assert `watermark_advanced === false` / `watermarkAfter === watermarkBefore`. |
| C3 | No recurring synchronization is activated. | No `create_automation`/`manage_automation` invoked this session. |
| C4 | No 15-minute schedule is activated. | `list_automations` at freeze time: no PO sync automation exists in the registry. |
| C5 | No production write mode is enabled. | Stage 2E.6 acceptance is `executionMode: "dry_run"`. |
| C6 | Only Pending and Sent POs are eligible. | `checkEligibility` status gate; tests 1–4. |
| C7 | Unsupported statuses do not enter active processing. | `checkEligibility` runs before `mapRecord`; test 3 (Received → skipped, zero writes). |
| C8 | Duplicate input cannot create duplicate domain effects. | Tests 8, 10; `recordsEqual` + `safeCreateWithRecheck`. |
| C9 | Unresolved required dependencies remain visible and recoverable. | Deferred records are retried; test 20 (deferred → later creates after correction). |
| C10 | Retry exhaustion does not become false success. | `safeCreateWithRecheck` exhausts 5 retries → `failed`; test 18 (no PO created). |
| C11 | Customer, Job, and Appointment contracts remain unchanged. | No adapter/resolver/engine change affects those domains (none implement `checkEligibility`; interface change is parameter-compatible). |
| C12 | Invoices, estimates, projects, receipts, and bills remain excluded. | Scope-exclusion test 28; out-of-scope confirmation in schema matrix. |
| C13 | Pricing remains excluded. | No pricing-engine file touched. |
| C14 | `validateStage2E5ReplacementRun` must not be redeployed. | No deploy/publish invoked this session. |
| C15 | Its preserved guarded local source must not be treated as an active remote deployment. | Local source present (37,090 bytes, sha256 `6ad778…`); remote registry status not asserted from local context (see §V). |

---

## §D. Schema-Reconciliation Freeze

The full field-level reconciliation matrix is frozen in `STAGE_2E_6_SCHEMA_RECONCILIATION_MATRIX.md` (already in the repository). This freeze references it and does not duplicate it. Status of every ServiceTitan field used by Stage 2E.6:

- **Reconciled for Stage 2E.6:** all promoted header fields (`id`, `number`, `status`, `vendorId`, `inventoryLocationId`, `projectId`, `jobId`, `typeId`, `date`, `requiredOn`, `receivedOn`, `sentOn`, `total`, `tax`, `shipping`) and all promoted line fields (`id`, `skuId`, `skuCode`, `skuName`, `vendorPartNumber`, `quantity`, `quantityReceived`, `cost`, `total`, `status`, `createdOn`, `modifiedOn`) plus derived fields (`subtotal`, `line_count`, `total_quantity_ordered/received`, `received_percentage`, `quantity_outstanding`). Full table in the matrix (90 lines).
- **Intentionally outside Stage 2E.6:** receipts, bills, warehouse transfers, inventory adjustments, invoices, estimates, projects, pricing.
- **Non-promoted but preserved:** `summary`, `createdById`, `invoiceId`, `batchId`, `budgetCodeId`, `businessUnitId`, `technicianId`, `shipTo`, `vendorDocumentNumber`, `customFields` (header); `skuType`, `chargeable`, `description`, `serialNumbers`, `budgetCodeId` (line) — preserved verbatim in `servicetitan_raw_data`.
- **Unresolved:** speculative bill API endpoint discovery (no functional bill endpoint found) — outside Stage 2E.6 scope; not claimed resolved.
- **Unknown:** the 121-finding Stage 2E.5 reconciliation set is NOT claimed resolved by Stage 2E.6. Stage 2E.6 addresses the PO/PO-line field subset only. Remaining findings are outside this stage's contract and are not represented as resolved here.

---

## §E. Test and Validator Registry

All validators are fixture-based / deterministic (no live ServiceTitan API calls, no production writes). Each is admin-gated at its HTTP handler. Evidence source: `test_backend_function` execution this session.

| Validator | Tests | Expected | Actual | Status | Evidence source |
|---|---|---|---|---|---|
| `validateStage2E6PurchaseOrderFoundation` | 28 | 28 pass | 28 pass | PASS | `test_backend_function` (this session) |
| `validateStage2E2APurchaseOrder` | 39 | 39 pass | 39 pass | PASS | `test_backend_function` (this session) |
| `validatePoIncrementalOrchestration` | 12 | 12 pass | 12 pass | PASS | `test_backend_function` (this session) |
| `validatePurchaseOrderSyncEngine` | 31 | 31 pass | 31 pass | PASS | `test_backend_function` (prior session, unchanged files) |
| `validateStage2E5DeterministicTests` | 43 | 43 pass | 43 pass | PASS | `test_backend_function` (this session) |

### E.1 Stage 2E.6 test inventory (28 tests)
1. Valid Pending PO — eligible, shadow classifies created, no writes
2. Valid Sent PO — eligible, shadow classifies created
3. Received PO — skipped (`status_not_pending_or_sent`), no writes
4. Eligibility reason codes — `status_not_pending_or_sent` / `status_missing` / `status_unknown`
5. Missing PO identifier — record FAILED
6. Malformed incoming timestamp — stale-skip, not created
7. Null vs missing — explicit null preserved in raw_data, absent omitted
8. Duplicate exact event — second run unchanged, no duplicate PO/line
9. Later legitimate update — updated (not created), single PO, total changed
10. Duplicate line input — line count stable on identical re-run
11. Missing warehouse — deferred with `WAREHOUSE_MISSING`
12. Ambiguous warehouse — deferred with `WAREHOUSE_AMBIGUOUS`, no guess
13. Inactive warehouse — deferred with `WAREHOUSE_INACTIVE`
14. Missing material — line deferred with `MATERIAL_MISSING`, header survives
15. Ambiguous material — line deferred with `MATERIAL_AMBIGUOUS`
16. Inactive material — line deferred with `MATERIAL_INACTIVE`
17. Mixed-line batch — one created, one deferred, header survives
18. Retryable failure + retry-limit exhaustion — failed, no PO created
19. Permanent structural rejection (missing id) — failed
20. Deferred record replay — first deferred, second creates after correction
21. Watermark tie (identical modifiedOn) — not stale, processed as unchanged
22. Failed record — watermark NOT advanced (`partial_failure`)
23. Replay from prior committed watermark — `windowStart = last_scan - 5min`
24. Concurrent duplicate — lock conflict → `already_running`, no writes, no advance
25. Shadow run — zero PurchaseOrder/PurchaseOrderLine writes
26. Shadow run — watermark NOT advanced
27. Deterministic repeat-run — identical metrics across two shadow runs
28. Scope — PO endpoint under `/inventory/v2/`, Pending/Sent normalizations, no receipts/bills

### E.2 Reconciliation of accepted counts
- **28 of 28 Stage 2E.6 tests:** `validateStage2E6PurchaseOrderFoundation` returned `total_tests: 28, passed: 28, failed: 0, acceptance: PASS`.
- **125 of 125 combined regression tests:** 39 (2E.2A) + 12 (PO incremental) + 31 (PO engine) + 43 (2E.5 deterministic) = **125**. All four validators returned `acceptance: PASS` with zero failures. Row-level evidence for `validatePurchaseOrderSyncEngine` (31 tests) is from a prior session on unchanged files; the file SHA-256 (§F) confirms no modification since.
- No test names were invented. Where row-level execution timestamps are not exposed by the handler, the aggregate `passed/failed/acceptance` fields are the authoritative evidence.

---

## §F. File Manifest and SHA-256 Registry

All hashes recalculated from current file contents at freeze time via Node `crypto.createHash('sha256')` over raw bytes. Sizes are byte counts.

| # | Repository path | Classification | Size (bytes) | SHA-256 | Created/Modified/Referenced | Contract-frozen | Future modification requires amendment |
|---|---|---|---|---|---|---|---|
| F1 | `base44/shared/stSync/stSyncAdapter.ts` | source (interface) | 11606 | `8dacc2e4555180f1eb130ff78a98ccf269e5c6242f6da695b6865e237e65ccef` | Modified (2E.6) | yes | yes |
| F2 | `base44/shared/stSync/stSyncEngine.ts` | source (engine) | 26070 | `a225611f38b8ef0617fa9c0dc8a046fbe7163405f11c7b9e1c00c00468941510` | Referenced | yes | yes |
| F3 | `base44/shared/stSync/adapters/purchaseOrderAdapter.ts` | source (adapter) | 29267 | `dabd977a558b84493dec1a36fb6cd36bbcaa66f195b779863920f4ecb28a3384` | Modified (2E.6) | yes | yes |
| F4 | `base44/shared/stPurchaseOrderSync.ts` | source (domain service + DTOs) | 25602 | `a87dbd454e1f86a7d2e324e821b0d318e6a1850cfaab70cb1be637aad7253f8a` | Referenced | yes | yes |
| F5 | `base44/shared/stSync/stPurchaseOrderSyncConfig.ts` | configuration | 4298 | `053c8345aa811b617b442fbdf8e7115b43799cf9a0181441c85a7eeb3e02af1f` | Referenced | yes | yes |
| F6 | `base44/shared/stSync/poIncrementalOrchestrator.ts` | source (orchestrator) | 13506 | `912e74d5269f8172ca15d2586c5f679d9da783c58384f156ccdaa924517fe501` | Referenced | yes | yes |
| F7 | `base44/shared/stSync/poSyncTestHarness.ts` | fixture (test harness) | 9043 | `86f15068ee04667bf56a76bea5a90ad31b498068f16ddb6f1921fec85cc59cc5` | Referenced | yes | yes |
| F8 | `base44/shared/stSync/stSyncWatermark.ts` | source (watermark) | 4741 | `adf236c6b6538d91f3c0d29eccdcb54a8ae806628ee743463f430fae8bda4fe7` | Referenced | yes | yes |
| F9 | `base44/shared/stSync/stSyncTypes.ts` | source (types) | 5055 | `4a7be9b73e441c0eeec73b67f53b556e11ff48b71d086ac4e0f5a1d396b1c99f` | Referenced | yes | yes |
| F10 | `base44/shared/stSync/stRateLimitProtection.ts` | source (safe-create) | 14142 | `3e770f57d1a68e248525e630ec67f5fcfcfd1fa70051bdb00f1c1ea2c64f9880` | Referenced | yes | yes |
| F11 | `base44/shared/stSync/stSyncUtils.ts` | source (utils) | 8755 | `9c04567de5d3fc02aa606f164e8d144b357da34de89beee62f8e0e19c43b9901` | Referenced | yes | yes |
| F12 | `base44/shared/stSync/stSyncLock.ts` | source (lock) | 4326 | `356f87c2e38b9349ab5f13360d397134afc725b956a18f5d46e06c0e2604217c` | Referenced | yes | yes |
| F13 | `base44/functions/validateStage2E6PurchaseOrderFoundation/entry.ts` | test (validator) | 30909 | `993418e7df918d8262adb6e7400869b03ea102614bcd45bb5ebbd39581518484` | Modified (2E.6) | yes | yes |
| F14 | `base44/functions/validateStage2E2APurchaseOrder/entry.ts` | test (regression) | 50401 | `91b206b066aae2ed4e6506f81a6b64be7ac8c23c0b9d582e41b8f01da940e58c` | Modified (2E.6) | yes | yes |
| F15 | `base44/functions/validatePoIncrementalOrchestration/entry.ts` | test (regression) | 19860 | `0109541c9fec6c29176a831f84e8a4220122507f82cfc0ac1180f3ad1ae829b2` | Referenced | yes | yes |
| F16 | `base44/functions/validatePurchaseOrderSyncEngine/entry.ts` | test (regression) | 20403 | `e7a891140d35a37e4ed4e3d1e764e469feb63d235127f74f89b2410803393640` | Referenced | yes | yes |
| F17 | `base44/functions/validateStage2E5ReplacementRun/entry.ts` | preserved audit artifact (guarded) | 37090 | `6ad778e05b047e2b2b10536f5da0afa16e054a063c5b163d6262410e4047593d` | Referenced (NOT modified) | yes (audit-only) | yes (must not be redeployed) |
| F18 | `base44/shared/stSync/stStage2E5Shared.ts` | source (shared helpers) | 25287 | `b77a29c21607e1ebd17deb06c33a2e4fcaa7f1a80006690d95bd2a70581fe482` | Referenced | yes | yes |
| F19 | `base44/functions/validateStage2E5DeterministicTests/entry.ts` | test (regression) | 31299 | `70687f0264dbd99d43eb00a116d04a9d8e76eef7827718fc76c6a66832746d0e` | Referenced | yes | yes |
| F20 | `base44/shared/stSync/STAGE_2E_6_SCHEMA_RECONCILIATION_MATRIX.md` | contract (schema matrix) | 9137 | `c0e59ff8494357601c3d953cc926594413a7e1043c4bf5458a08d90531323f94` | Referenced | yes | yes |
| F21 | `base44/shared/stSync/STAGE_2E_6_CONTRACT_AND_EVIDENCE_FREEZE.md` | contract + evidence (this file) | 34420 | See STAGE_2E_6_FROZEN_ARTIFACT_MANIFEST.sha256 | Created (freeze) | yes | yes |
| F22 | `base44/shared/stSync/STAGE_2E_6_FROZEN_ARTIFACT_MANIFEST.sha256` | detached checksum manifest / integrity root | (see final response) | excludes its own checksum (impossible self-reference) | Created (freeze) | yes | yes |

**Modification note:** Files marked "Modified (2E.6)" (F1, F3, F13, F14) are the four files changed during Stage 2E.6 implementation, all prior to this freeze. No implementation or validator file was changed during this freeze (see §V).

---

## §G. Change-Control Rule

Future changes to any frozen Stage 2E.6 contract artifact (§F, F1–F21) require ALL of the following before the change may be considered authorized:

1. An explicit authorization from the owner (this freeze does not authorize further changes).
2. Identification of the affected contract section (§A), invariant (§C), schema row (§D), or test (§E).
3. A before-and-after diff of the affected file(s).
4. Updated SHA-256 values for every changed file (§F), recalculated from the new content.
5. Relevant deterministic tests re-run and passing.
6. Regression validation: the five validators in §E re-run and passing.
7. Safety evidence: zero ServiceTitan writes, zero production watermark advancement, no schedule/automation change (§V).
8. A contract amendment or a superseding freeze version recorded in this directory.
9. Confirmation that production synchronization remains unauthorized unless separately approved in writing.

Production synchronization (write mode against live ServiceTitan + production watermark) is NOT authorized by this freeze or by Stage 2E.6 acceptance. It requires a separate, explicit authorization.

---

## §V. Verification Log (post-freeze checks)

1. **Re-read every created/modified documentation artifact** — this file (F21) created and re-read; all referenced paths verified present via the hash computation batch (F1–F20 all returned a valid SHA-256, no `error` field).
2. **All referenced paths exist** — confirmed: 20/20 files hashed successfully.
3. **SHA-256 recalculated and matches manifest** — the manifest values (§F) ARE the freshly recalculated values; no earlier checksum was reused. (F21's own hash is recorded in the verification recompute below.)
4. **No implementation or validator file was changed during this freeze** — only F21 (this document) was created. F1–F20 were read-only during this freeze; their hashes match the pre-freeze state.
5. **No temporary diagnostic code was added** — no `console.*`/debug/bisect code introduced; the freeze is documentation-only.
6. **No ServiceTitan endpoint was invoked** — no `fetch` to `api.servicetitan.io` was issued during this freeze; only `read_file`, `exec_tool` (local `fs`/`crypto`), and `list_automations` were called.
7. **No external write occurred** — no `create_entity_records`, `update_entities`, `delete_entities`, `write_file` to a non-documentation path, or connector write was performed.
8. **No production watermark advanced** — no watermark entity read or written; no `executeIncrementalSync` run against a production client.
9. **No schedule or automation was created, modified, enabled, or invoked** — `list_automations` was read-only; no `create_automation`/`manage_automation` called. Registry at freeze time contains no PO sync automation.
10. **Nothing was deployed or published** — no deploy/publish tool exists in the toolset and none was invoked.
11. **Stage 2E.7 was not begun** — no 2E.7 file created or referenced.
12. **The deleted remote verifier was not recreated or redeployed** — `validateStage2E5ReplacementRun` (F17) local source remains present and was NOT modified, deployed, or invoked. Remote registry status is NOT asserted from local context (see limitation L3).
13a. **Detached checksum root rule:** F21 (this freeze document) cannot durably contain its own final SHA-256 — inlining a self-referential checksum changes the content it hashes, producing unbounded drift. The authoritative final SHA-256 and byte size for F21, and the SHA-256 for every frozen artifact F1–F21, are recorded in the detached integrity-root manifest F22 (`STAGE_2E_6_FROZEN_ARTIFACT_MANIFEST.sha256`). F22 intentionally excludes its own checksum (a file cannot durably contain its own final checksum); F22's checksum is reported in the final deliverable as the external integrity-root checksum. Any edit to any frozen artifact invalidates the corresponding manifest entry and requires a contract amendment (§G).

13. **Evidence that cannot be independently reproduced:**
    - L1: Standalone lint execution result (no lint tool exposed; type-soundness proven transitively via validator bundling/execution).
    - L2: `validatePurchaseOrderSyncEngine` (31 tests) row-level execution this session — accepted from a prior session on an unchanged file (F16 hash confirms no modification).
    - L3: Remote registry presence/absence of `validateStage2E5ReplacementRun` — local source existence is proven; remote deployment status is not asserted. Per instructions, local source listing is not represented as proof of remote deployment or remote absence.

---

## Final Deliverable Summary

1. **Inspection findings:** 20 files inspected and hashed; 4 files modified during Stage 2E.6 (F1, F3, F13, F14), 0 modified during this freeze. `checkEligibility` uses a 4-parameter contract `(base44, record, mapped|null, context)` matching the engine's invocation. Pending→draft and Sent→sent are the only eligible statuses. Activation guard precedes status gate. Warehouse/material resolution is discriminated. Idempotency by immutable ST IDs + `safeCreateWithRecheck`. Watermark advances only on full clean cycle. Shadow mode performs no writes/advancement. `validateStage2E5ReplacementRun` local source preserved (guarded), not redeployed. No temporary diagnostic code remains. No PO sync automation in the registry.
2. **Contract/evidence directory used:** `base44/shared/stSync/` (existing documentation structure; matrix F20 already present).
3. **Exact files created:** `base44/shared/stSync/STAGE_2E_6_CONTRACT_AND_EVIDENCE_FREEZE.md` (F21, this file).
4. **Exact files modified:** none (documentation-only freeze).
5. **Confirmation that no implementation files changed:** confirmed — F1–F20 hashes match pre-freeze state; only F21 created.
6. **Frozen Stage 2E.6 contract summary:** see §A.
7. **Processing-order contract:** see §B.
8. **Safety-invariant registry:** see §C.
9. **Schema-reconciliation status:** see §D.
10. **Test and validator registry:** see §E.
11. **Reconciliation of 28-of-28 and 125-of-125:** see §E.2 (28 + 39 + 12 + 31 + 43; 125 = 39+12+31+43).
12. **Complete file and SHA-256 manifest:** see §F.
13. **Change-control rule:** see §G.
14. **Evidence of zero external writes:** §V items 6–7.
15. **Evidence of zero production-watermark advancement:** §V item 8; §C C2.
16. **Evidence no schedule or automation changed:** §V item 9; §C C3–C4.
17. **Evidence nothing was deployed or published:** §V item 10.
18. **Confirmation Stage 2E.7 was not begun:** §V item 11.
19. **Known limitations and unavailable evidence:** §V item 13 (L1–L3); §A.21.
20. **Exact final classification:**

> **A. STAGE 2E.6 CONTRACT AND EVIDENCE FROZEN — IMPLEMENTATION UNCHANGED — STAGE 2E.7 NOT AUTHORIZED**