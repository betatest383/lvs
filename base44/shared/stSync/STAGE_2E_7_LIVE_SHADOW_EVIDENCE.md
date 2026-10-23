# Stage 2E.7 — Live Read-Only Shadow Verification Evidence

**Stage:** 2E.7 (Live PO Shadow Verification)
**Direction:** ServiceTitan → LVC OS. Read-only live fetch; shadow/dry-run processing only.
**Mode at acceptance:** Live GET ingestion into an in-memory capture set, followed by frozen dry-run engine processing over the captured set. Zero write mode.
**Verification date:** 2026-08-04 (America/New_York)
**Execution timestamp (UTC):** `2026-08-04T14:28:19.864Z`
**Corrected classification (verbatim):**
> STAGE 2E.7 PARTIALLY VERIFIED — LIVE READ OR EVIDENCE GAPS REMAIN — ZERO PRODUCTION ACTIVATION AUTHORIZED

This document is the corrected Stage 2E.7 evidence artifact. An earlier draft classified the stage
as "PASSED"; that classification is **withdrawn** because the durable evidence package was incomplete:
the exact deployed verifier source could not be recovered or correlated to the deployment, and the
complete 56-entry record-level registry was not durably preserved. See §26 (limitations) and §30
(repository status). This document does NOT authorize production synchronization, write mode,
ServiceTitan writes, watermark advancement, scheduling, modification of the Stage 2E.6 frozen
contract, or any subsequent stage.

---

## 1. Preflight findings

- The Stage 2E.7 verifier (`validateStage2E7LivePoShadowVerification`) was confirmed present and
  deployed in the function registry prior to the live run.
- The frozen Stage 2E.6 contract and implementation were verified intact before the run
  (see §2). No Stage 2E.6 frozen artifact was modified.
- Required runtime secrets (ServiceTitan tenant, environment, client credentials, app key)
  were present; the verifier read them indirectly via the shared `stAuth` module. No secret value
  was logged, returned, or persisted.
- The live fetch was bounded: 2 pages maximum, 100 records maximum, 50 records per page,
  2 retry attempts maximum, 30-day look-back window, 45-second engine runtime ceiling.
- HTTP-method guard and Base44 mutation guard were installed before any outbound call.

## 2. Before-run Stage 2E.6 integrity results

All 21 Stage 2E.6 frozen artifacts (F1–F21) were re-read and their SHA-256 values recalculated
from current file contents immediately before the live run. All 21 matched the accepted
Stage 2E.6 detached manifest (`STAGE_2E_6_FROZEN_ARTIFACT_MANIFEST.sha256`) exactly. Drift: none.
The Stage 2E.6 freeze document and its manifest themselves matched their accepted baselines.

## 3. Exact production app and sanitized tenant identification

- **Production app:** Lehigh Valley Chimney (LVC OS).
- **Sanitized tenant identification:** `REDACTED` (full tenant identifier withheld per
  evidence-redaction rules; no partial identifier is disclosed).
- **Environment:** `production`.

## 4. Exact ServiceTitan GET endpoint and sanitized request scope

- **Endpoint:** `/inventory/v2/tenant/{tenant}/purchase-orders` (tenant redacted as above).
- **HTTP method:** GET only.
- **Request scope (sanitized):** page-based pagination, `page=1..2`, `pageSize=50`,
  `modifiedOnOrAfter={windowStart}` where `windowStart` = 30 days before the run timestamp.
  No body. No query parameters beyond page, page size, and the modified-on-or-after filter.

## 5. Execution timestamp and timezone

- **UTC:** `2026-08-04T14:28:19.864Z`
- **Local (America/New_York):** 2026-08-04 10:28 EDT.

## 6. Page and record limits and actual counts

| Limit / count | Configured | Actual |
|---|---|---|
| Max pages | 2 | 2 fetched |
| Max records | 100 | 56 captured |
| Page size | 50 | 50 (page 2 returned 6) |
| Max retry attempts | 2 | 0 retries needed |
| Engine runtime ceiling | 45 s | completed ~1.67 s |

## 7. HTTP-method audit

| Metric | Value |
|---|---|
| ServiceTitan GET calls | 3 |
| All GET calls (incl. reads) | 11 |
| OAuth token POST calls | 1 |
| ServiceTitan GET hosts | `api.servicetitan.io` |
| Rejected outbound (non-GET) | 0 |

All ServiceTitan business-API calls used GET. The single POST was the OAuth token endpoint
(authentication traffic, tracked separately from business-API requests, per project policy).
No POST/PUT/PATCH/DELETE was issued to any ServiceTitan business endpoint.

## 8. Source-status distribution

| Source status | Count |
|---|---|
| Received | 41 |
| Sent | 4 |
| Pending | 9 |
| Canceled | 2 |
| **Total** | **56** |

## 9. Eligibility results

All 56 captured records were classified by the frozen Stage 2E.6 eligibility guard
(`checkEligibility`, 4-parameter contract: activation guard first, then Pending/Sent status gate).

| Eligibility outcome | Count |
|---|---|
| Rejected — `pre_activation` | 56 |
| Accepted (Pending/Sent, post-activation) | 0 |

Reason: the Stage 2E.7 production watermark became active on 2026-08-03. Every one of the 56
fetched purchase orders predates activation, so the activation guard rejected each record before
the status gate was consulted. This is the correct frozen-contract behavior.

## 10. Both-pass outcome totals

| Outcome | Pass 1 | Pass 2 |
|---|---|---|
| created | 0 | 0 |
| updated | 0 | 0 |
| unchanged | 0 | 0 |
| stale | 0 | 0 |
| deferred | 0 | 0 |
| skipped | 56 | 56 |
| failed | 0 | 0 |
| **processed** | **56** | **56** |
| recordsFetched | 56 | 56 |
| pagesFetched | 2 | 2 |
| stopReason | null | null |

## 11. Stable reason-code totals

| Reason code | Count |
|---|---|
| `pre_activation` | 56 |

(Activation-guard reason: record `createdOn` precedes the watermark activation timestamp.
No record reached the status gate, dependency resolution, or persistence.)

## 12. Determinism comparison

- Pass 1 and Pass 2 were executed over the identical captured set using the same frozen adapter,
  engine, and PO-type cache (seeded once, reused across both passes).
- All seven outcome counters (created, updated, unchanged, stale, deferred, skipped, failed)
  and the processed count matched exactly across both passes.
- **Deterministic passes match: true.**

## 13. Schema-compatibility observations

- Header fields observed on the live payload were classified against the known Stage 2E.6
  header field set. All observed header fields were either `compatible_covered` (known and
  promoted/preserved by the frozen adapter) or `compatible_undocumented` (preserved verbatim
  in `servicetitan_raw_data`).
- Line fields observed on the live payload were classified against the known Stage 2E.6 line
  field set with the same two categories.
- **No live schema incompatibility was detected.** No field required blocking; no field was
  silently repaired or dropped.

## 14. Candidate-watermark result

- Candidate advance-to timestamp: `2026-08-04T14:28:19.957Z` (run "now").
- Committed: **false**. The candidate was computed for reporting only and was never written.

## 15. Before-and-after committed-watermark proof

| Field | Before | After |
|---|---|---|
| exists | true | true |
| id | `REDACTED` | `REDACTED` |
| status | active | active |
| last_modified_scan_at | null | null |
| recovery_window_status | idle | idle |
| updated_date | `2026-08-03T17:36:08.050000` | `2026-08-03T17:36:08.050000` |

**Watermark unchanged: true. Committed: false.** The committed production watermark was not
advanced. `last_modified_scan_at` remained `null` (never advanced).

## 16. Before-and-after production PO and PO-line counts

| Entity | Before count | After count |
|---|---|---|
| PurchaseOrder | 50 | 50 |
| PurchaseOrderLine | 0 | 0 |

Neither snapshot was capped (capped = false), so the counts are exact, not lower bounds.

## 17. Before-and-after production-state checksums

| Entity | Before SHA | After SHA | Identical |
|---|---|---|---|
| PurchaseOrder | `e37c7a2` | `e37c7a2` | true |
| PurchaseOrderLine | `741638a5` | `741638a5` | true |

### 17a. Production-state proof scope and limitation (corrected)

The fingerprints above are **FNV-1a 32-bit** values computed over `(id, servicetitan_id,
updated_date)` triples, sorted by `updated_date` descending. They establish only **limited
change detection**, not a conclusive proof that every persisted field remained unchanged.

- **Fields fingerprinted (exactly):** `id`, `servicetitan_id` (the canonical ST identity field),
  and `updated_date`. No other field was included in the fingerprint input.
- **Mutation classes the fingerprints WOULD detect:**
  - insertion or deletion of a record (set-size or membership change);
  - change to any record's `servicetitan_id` value;
  - change to any record's `updated_date` value (the Base44 platform updates `updated_date`
    on most persisted mutations, so a field-level write would normally surface here).
- **Mutation classes the fingerprints MIGHT MISS:**
  - a field-level mutation to a non-fingerprinted persisted field that does **not** update
    `updated_date` (e.g. a direct database-level change, or a platform write path that does
    not bump `updated_date`);
  - a same-value rewrite (no-op update that leaves all three fingerprinted fields unchanged);
  - a mutation that changes a field while leaving `updated_date` and the two IDs identical
    (theoretically possible on a platform write path that does not refresh `updated_date`).
- **Independent structural mutation-guard evidence (stronger):** the verifier installed a
  Base44 mutation guard that intercepted all blocked write methods (`create`, `update`,
  `delete`, `bulkCreate`, `bulkUpdate`, `updateMany`, `deleteMany`) and recorded **0 mutation
  attempts** (§19). The engine ran in `dry_run` mode, which performs no create/update/delete
  side effects. The combination of the structural guard (0 attempts) and dry-run mode is the
  primary no-mutation evidence; the fingerprints are **corroborating, not conclusive**.
- **Stronger read-before / read-after verification available without writes:** a full
  field-level read-before and read-after comparison of every persisted field on every record
  would conclusively prove no mutation, but was **not performed** during the Stage 2E.7 run
  (only the three-field fingerprint was captured). Such a comparison is feasible without any
  writes — it requires only two full-record list reads — and is recommended for any future
  verification that needs conclusive field-level no-mutation proof. Until then, the
  no-mutation claim is supported by the structural guard + dry-run mode, and **narrowed** by
  the fingerprint scope to "no detected change to id / servicetitan_id / updated_date."

## 18. Proof of zero ServiceTitan writes

- HTTP-method guard rejected 0 outbound requests (no non-GET business call was attempted).
- Mutation guard intercepted 0 attempts to call any blocked Base44 entity write method.
- All 3 ServiceTitan business calls were GET to `api.servicetitan.io`.
- No ServiceTitan POST/PUT/PATCH/DELETE was issued.

## 19. Proof of zero production mutation attempts

- Blocked Base44 methods under guard: `create`, `update`, `delete`, `bulkCreate`, `bulkUpdate`,
  `updateMany`, `deleteMany`.
- Mutation attempts recorded: 0.
- Engine execution mode: `dry_run` (no create/update/delete side effects; no `onSuccess` /
  `onFailure` / `postBatchProcess` side effects).
- Production-state fingerprints unchanged for the three fingerprinted fields (§17, §17a),
  corroborating — but not conclusively proving — no mutation. The primary no-mutation evidence
  is the structural mutation guard (0 attempts) and dry-run mode.

## 20. Proof of zero domain events, queue commands, tasks, or notifications

- The Stage 2E.7 verifier does not emit business events, queue commands, EnterpriseTasks, or
  notifications. No such side effect was produced during the run.
- No `create_automation`, `manage_automation`, `manageTask`, `manageNotification`,
  `manageBusinessEvent`, or queue-submit call was issued.

## 21. Proof no schedule or automation changed

- No `create_automation` or `manage_automation` (update/delete/toggle/archive) was invoked.
- No scheduled automation for purchase-order synchronization exists in the registry.
- The 15-minute schedule remains disabled. No recurring synchronization was activated.

## 22. Validator results

| Validator | Tests | Passed | Failed | Acceptance |
|---|---|---|---|---|
| `validateStage2E6PurchaseOrderFoundation` | 28 | 28 | 0 | PASS |
| `validatePurchaseOrderSyncEngine` | 31 | 31 | 0 | PASS |
| `validatePoIncrementalOrchestration` | 12 | 12 | 0 | PASS |
| **Total deterministic tests** | **71** | **71** | **0** | **PASS** |

All validators are fixture-based / deterministic (no live ServiceTitan API calls, no production
writes). Each is admin-gated at its HTTP handler. Evidence source: `test_backend_function`
execution 2026-08-04.

## 23. Post-run Stage 2E.6 integrity results

Immediately after the live run, all 21 Stage 2E.6 frozen artifacts (F1–F21) were re-read and
their SHA-256 values recalculated. All 21 matched the accepted Stage 2E.6 detached manifest
exactly. Drift: none. The Stage 2E.6 freeze document (`af816d24…`) and its manifest
(`29143ab1…`) matched their accepted baselines. No Stage 2E.6 frozen artifact was modified.

## 24. Exact functions deployed and invoked

- **Deployed:** `validateStage2E7LivePoShadowVerification` (the Stage 2E.7 verifier). No other
  function was deployed or modified.
- **Invoked (live):** `validateStage2E7LivePoShadowVerification` (one bounded live GET run).
- **Invoked (deterministic):** `validateStage2E6PurchaseOrderFoundation`, `validatePurchaseOrderSyncEngine`,
  `validatePoIncrementalOrchestration` (fixture-based; zero live API calls, zero production writes).

## 25. Exact files created and modified — verifier source recovery NOT proven

- **Created:** `base44/shared/stSync/STAGE_2E_7_LIVE_SHADOW_EVIDENCE.md` (this file).
- **Created:** `base44/shared/stSync/STAGE_2E_7_FROZEN_ARTIFACT_MANIFEST.sha256` (detached checksum manifest).
- **Verifier source — recovery status: NOT PROVEN.** The deployed function
  `validateStage2E7LivePoShadowVerification` was confirmed runnable via `test_backend_function`
  (HTTP 200 with evidence) during the live run. However, the exact source corresponding to that
  deployed function **could not be recovered from any authoritative source**:
  - **Local filesystem:** the path
    `base44/functions/validateStage2E7LivePoShadowVerification/entry.ts` does not exist; the
    function directory is absent (verified by directory listing and a direct read attempt).
  - **Git history:** `git log --all --oneline -- <verifier path>` and `git ls-files` for the
    verifier path returned **no records** — the verifier source was never tracked in any commit.
  - **Deployment export / source view / version history / preserved build artifact:** no such
    authoritative platform-managed source record is exposed by the available tooling.
  - A pre-deletion SHA-256 (`b9d655359ceb7ea7b41bdc9d543e7ede2ed19a977bd9ac108bc6b81b5ea9fbb7`,
    23556 bytes) was recorded in the prior draft from a hash computed before the source left the
    builder filesystem, but **a historical checksum alone cannot prove source/deployment
    identity** and cannot be re-verified against the deployed build. It is retained here for
    audit only and is **not** used in the detached manifest.
- Per the correction instructions, the verifier source was **not** reconstructed from memory,
  partial excerpts, reasoning text, or inferred behavior. Because exact recovery could not be
  proven, Stage 2E.7 is classified as **partially verified** (§29).
- **Modified:** none. No implementation, validator, fixture, schema, configuration, schedule,
  automation, or production-data file was modified during finalization (see §30).

## 26. Known limitations and evidence gaps

The live run itself was a **valid zero-eligible live shadow run** (safety behavior correct), but
the durable evidence package has unrecoverable gaps that prevent a "passed" classification:

- The Stage 2E.7 watermark became active on **2026-08-03**.
- All 56 live ServiceTitan purchase orders returned by the bounded read **predated activation**.
- The frozen eligibility guard therefore correctly classified **every** record as `pre_activation`.
- The authenticated ServiceTitan read path, pagination, source adaptation, status observation,
  eligibility guard, schema compatibility, deterministic replay, write protections,
  production-state protections, committed-watermark protection, and frozen-integrity protection
  were exercised.
- **No eligible record reached the downstream dependency-resolution or proposed-domain-effect
  path during the live run.** Those downstream paths remain covered by the 71 passing
  deterministic tests, but were **not exercised with an eligible live production record.**
  Deterministic test coverage is **not** represented as live downstream-processing evidence.

### Evidence gaps (unrecoverable without separate authorization)

- **G1 — verifier source not recoverable.** The exact deployed verifier source could not be
  recovered from the local filesystem, git history, or any authoritative platform-managed source
  record (§25). A historical pre-deletion checksum exists but cannot prove source/deployment
  identity. The source was **not** reconstructed from memory or inference. Per the correction
  instructions, this gap alone requires partial verification.
- **G2 — complete record-level registry not durably preserved.** The verifier generated 56
  per-record registry entries during the live run, but the tool-display capture was **truncated**
  and only aggregate totals plus the first displayed record were captured durably. The complete
  56-entry registry (with per-record reason codes, schema observations, outbound-HTTP audit,
  mutation-attempt audit, and event/queue/task/notification audit) was **not** persisted to a
  durable artifact. Recovering the complete registry would require re-invoking the verifier
  (another live ServiceTitan fetch), which is **not authorized** at this time. The aggregate
  totals (§§8–12) and the captured safety fields (§§15–21) are preserved, but the per-record
  detail is incomplete. This gap alone also requires partial verification.
- **G3 — production-state proof is limited.** The before/after fingerprints cover only
  `(id, servicetitan_id, updated_date)` and do not conclusively prove no field-level mutation
  (§17a). They corroborate the structural guard + dry-run evidence, which is the primary
  no-mutation proof.

### Type-check and lint claim (corrected)

- **Standalone TypeScript type-checking (`tsc`) and linting are NOT available** via the
  available tooling and were **not executed** during Stage 2E.7.
- Successful function deployment and execution, and the passing deterministic validator suite,
  do **not** constitute static type-checking and are **not** represented as equivalent to it.
  The earlier draft's statement that type-soundness is "proven transitively" is **withdrawn**.
  Type-soundness of the Stage 2E.7 verifier is **unverified** by static analysis.

## 27. Remaining risks

- Because no post-activation Pending/Sent PO existed in the live data window, the live run did
  not exercise dependency resolution or idempotent persistence against a real eligible record.
  A future run, once post-activation Pending/Sent POs exist in ServiceTitan, is recommended to
  exercise the downstream path against live data.
- The Stage 2E.7 watermark is active but `last_modified_scan_at` is `null` (never advanced),
  consistent with shadow-only operation. Any advancement requires separate production-write
  authorization.
- Speculative ServiceTitan bill-API endpoint discovery remains unresolved and is outside
  Stage 2E.7 scope.

## 28. Recommended next action

Re-run the Stage 2E.7 live shadow verifier once at least one post-activation Pending or Sent
purchase order exists in ServiceTitan, to exercise the downstream dependency-resolution and
idempotent-persistence path against an eligible live record. Until then, production
synchronization, write mode, ServiceTitan writes, watermark advancement, the 15-minute
schedule, and modification of the Stage 2E.6 frozen contract remain unauthorized. Recommend
the next authorization separately.

## 29. Source/deployment correlation

Durable evidence connecting a recovered source to the deployed verifier could **not** be
established, because the source was not recoverable (§25). The following items were checked:

- **Deployed function name:** `validateStage2E7LivePoShadowVerification` (present in the function
  registry; confirmed runnable via `test_backend_function`, HTTP 200).
- **Deployment identifier / version:** not exposed by available tooling — no deployment ID,
  build hash, or platform version identifier is available for the deployed function.
- **Deployment timestamp:** not exposed by available tooling.
- **Remote-registry status:** the function appears in the function registry list (runnable), but
  no remote source view or export is exposed; the registry does not expose a source checksum.
- **Source checksum:** no on-disk source exists to checksum; no historical checksum can be
  re-verified against the deployed build.
- **Deployed-build checksum / platform version identifier:** not exposed by available tooling.
- **Owner/admin gating evidence:** the live-run evidence response was produced under an
  authenticated admin/owner session; the verifier's HTTP handler enforces admin/owner gating
  (consistent with the deterministic validators, which are admin-gated). Anonymous invocation
  was not tested directly and is not claimed to be tested; the gating is asserted from the
  handler contract, not from an anonymous-invocation probe.
- **Anonymous invocation prohibited:** asserted from the handler contract; not independently
  verified by an anonymous probe this stage.

Because the platform does not expose a deployment export, source view, version history, or
build checksum, **source/deployment identity cannot be proven**. This is an evidence gap (G1).

## 30. Repository status

Actual repository-status evidence (collected 2026-08-04 14:5x UTC via `exec_tool`):

- **Git repository present:** yes (`.git/HEAD` exists).
- **Working tree status (`git status --porcelain`):** clean (empty output) — all changes are
  committed; no uncommitted modifications remain.
- **HEAD commit:** `dbe638b97eaa1c3c8d71f19fc7c930d2adada721` (2026-08-04 14:58:59 UTC,
  "File changes").
- **Reflog:** platform-managed auto-commits ("File changes", "Apply exec_tool script file
  changes") — no manual deployment registry.
- **Stage 2E.7 files tracked in git:** only
  `base44/shared/stSync/STAGE_2E_7_LIVE_SHADOW_EVIDENCE.md` and
  `base44/shared/stSync/STAGE_2E_7_FROZEN_ARTIFACT_MANIFEST.sha256`.
- **Stage 2E.7 verifier source tracked in git:** **no** — `git log --all` and `git ls-files` for
  the verifier path returned no records. The verifier source was never committed.
- **Stage 2E.7 files on disk (finalization):**
  - `STAGE_2E_7_LIVE_SHADOW_EVIDENCE.md` — present, 16102 bytes (after correction).
  - `STAGE_2E_7_FROZEN_ARTIFACT_MANIFEST.sha256` — present, to be rebuilt after this correction.
  - `validateStage2E7LivePoShadowVerification/entry.ts` — **absent**.
- **Stage 2E.7 files deleted or missing:** the verifier source is **missing** (never on disk at
  finalization; never tracked in git). No Stage 2E.7 file was deleted during finalization.
- **Stage 2E.6 frozen artifacts (21):** all 21 re-hashed and matched the accepted detached
  manifest exactly — **drift: none**. No Stage 2E.6 frozen artifact changed.
- **Unrelated files changed during finalization:** none — the only files touched during
  finalization were the two Stage 2E.7 artifacts above (this evidence document and the rebuilt
  manifest). All other recent modifications (visible in the file mtime list) predate finalization
  and are committed pre-existing changes from Stage 2E.5/2E.6 work.

## 31. Sanitization verification

Method: the corrected evidence document and the rebuilt manifest were inspected for full tenant
identifiers, credentials, authorization headers, tokens, personal information, and raw production
payloads.

- **Full tenant identifier:** not present. §3 discloses only `REDACTED` — no partial identifier
  is repeated. (An earlier draft disclosed a 2+2 character hint; that hint has been removed.)
- **Credentials / authorization headers / tokens:** not present. No client ID, client secret,
  app key, webhook secret, scheduler secret, OAuth token, or `Authorization` header value
  appears in this document or the manifest.
- **Personal information:** none disclosed.
- **Raw production payloads:** not present. No ServiceTitan response body, field value, PO
  number, vendor name, or customer data appears in this document. Counts and status
  distributions (§§8–12) are aggregate and carry no record-level PII.
- **Manifest commentary:** the manifest contains only a checksum and a path per line; no
  commentary, identifiers, or payloads.
- **Result:** sanitization verified — no full tenant identifier, credential, token, PII, or raw
  production payload is present in the corrected artifacts.

## 32. Final classification

> **STAGE 2E.7 PARTIALLY VERIFIED — LIVE READ OR EVIDENCE GAPS REMAIN — ZERO PRODUCTION ACTIVATION AUTHORIZED**

This classification reflects the unrecoverable evidence gaps:
- G1: exact deployed verifier source not recovered or correlated to the deployment (§25, §29);
- G2: complete 56-entry record-level registry not durably preserved (§26);
- G3: production-state proof limited to three-field fingerprints (§17a).

The live run's safety behavior was correct (zero writes, zero mutation attempts, zero watermark
advancement, scheduling disabled, Stage 2E.6 frozen integrity intact), but the durable evidence
package is incomplete and the "passed" classification is withdrawn.

This classification does NOT authorize:
- production PO synchronization;
- production write mode;
- ServiceTitan writes;
- production-watermark advancement;
- the 15-minute schedule;
- modification of the Stage 2E.6 frozen contract;
- any subsequent stage;
- another live ServiceTitan fetch (requires separate authorization).