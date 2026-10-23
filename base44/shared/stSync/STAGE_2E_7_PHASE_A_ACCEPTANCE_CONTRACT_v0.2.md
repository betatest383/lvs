# Stage 2E.7 Phase A — Binding Acceptance Contract

**Contract version:** `2E7-AC-v0.2-PHASE-A-BINDING-FINAL`
**Phase:** A (acceptance-contract design only)
**Stage:** 2E.7 (new verification approach — not the original historical run)
**Owner approval:** Approved (substantive contents) — recorded this authorization.
**Authorization scope of this artifact:** Create and verify the binding Phase A contract artifact only.
**Byte-serialization rule governing this artifact's SHA-256:** UTF-8 encoding, LF line endings, no leading/trailing whitespace beyond the document's own final newline, no BOM. SHA-256 over raw bytes. Binding hash recorded in a detached manifest that excludes its own checksum (per Stage 2E.6 §F/§V 13a).

---

## §1. Phase A scope and restrictions

- **Authorized (Phase A):** Convert approved owner decisions (Q1–Q5, D-1–D-4) into a precise, testable acceptance contract for a future Stage 2E.7 verification approach; create and verify the binding artifact for that contract.
- **Not authorized:** Technical design, implementation, deployment, function creation, ServiceTitan contact, Base44 production access, production reads/writes, live execution, evidence generation, watermark changes, event/queue/webhook/schedule/automation changes, Stage 2E.8, Phase B or any later phase.
- **Independence:** This contract is independent of the original historical run. It cannot repair, complete, reclassify, or unfreeze the original evidence. The original Stage 2E.7 evidence remains frozen and partially verified; G1, G2, and G3 remain unresolved for the historical run.
- **Orphaned verifier:** `validateStage2E7LivePoShadowVerification` remains untouched, uninvoked, unscheduled, unused; not the mechanism or foundation for the new approach.

---

## §2. Authoritative sources inspected (read-only, during Phase A drafting)

| Source | Use |
|---|---|
| Approved Q1–Q5 owner decisions; D-1–D-4 owner decisions | Binding basis for acceptance-contract rows and operational caps |
| `STAGE_2E_6_CONTRACT_AND_EVIDENCE_FREEZE.md` §A.2/§A.4–A.5/§A.11/§A.13/§A.16, §B, §C C1–C5 | Inherited controls: GET-only, eligibility gate order, dependency resolution, idempotency, dry-run guarantees, watermark/lock/schedule invariants |
| `STAGE_2E_6_SCHEMA_RECONCILIATION_MATRIX.md` | Field/reason-code vocabulary |
| `stPurchaseOrderSyncConfig.ts` | Endpoint, page size (50), watermark key `purchase_order_go_live`, lock entity `ServiceTitanSyncCursor` |
| `STAGE_2E_7_LIVE_SHADOW_EVIDENCE.md` (frozen, prior retained identifier) | Confirms prior two-pass dry-run over a captured set is feasible without persistence (§6, §12) — no Q3 contradiction |
| Entity schemas: `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderSyncWatermark`, `ServiceTitanSyncCursor`, `DeferredDependentRecord`, `InventoryTransaction`, `BusinessEvent`, `ServiceTitanWebhookEvent` | Mutation-sensitive scope definition |

---

## §3. Owner decisions recorded

- **Q1 (mutation-sensitive comparisons):** Complete canonical before/after comparison over the full mutation-sensitive field set with cryptographically strong SHA-256. FNV-1a removed. Counts and narrow fingerprints insufficient. Every exclusion named and justified.
- **Q2 (eligible record + downstream):** ≥1 post-activation Pending/Sent PO; activation guard then status gate; full downstream dry-run evaluation for ≥1 eligible record; `STOPPED — ELIGIBLE RECORD NOT FOUND` when none found within bounded search.
- **Q3 (two-pass):** Idempotent duplicate-effect suppression (projected-state, Pass 2 classifies as unchanged/duplicate-suppressed, zero additional effects) separated from deterministic repeatability (identical input + identical initial state → identical results). No persistence authorized.
- **Q4 (prohibited writes):** Zero Base44 production writes, zero watermark mutation, zero event/queue/webhook/schedule/automation effects. GET-only ServiceTitan.
- **Q5 (source/build identity):** Conclusive identification via all applicable mandatory elements; missing deployment ID is disclosed non-blocking only if remaining identity evidence is conclusive.

- **D-1 (contract approval):** Owner approves substantive contract `2E7-AC-v0.2-PHASE-A-BINDING-FINAL`.
- **D-2 (bounded query caps):** Adopted (see §4).
- **D-3:** Zero eligible records within bounded search = `STOPPED — ELIGIBLE RECORD NOT FOUND` (not UNAVAILABLE).
- **D-4:** AC-018 remains optional; all fields in the mandatory mutation-sensitive scope receive complete canonical comparison.

---

## §4. Adopted D-2 bounded-query limits

| Parameter | Value |
|---|---|
| Page size | 50 records |
| Maximum pages | 10 |
| Maximum fetched records | 500 |
| Maximum retries | 2 retries per failed request |
| Runtime ceiling | 300 seconds |
| Search-window start | Exact authoritative Stage 2E.7 purchase-order activation timestamp (`PurchaseOrderSyncWatermark.activation_timestamp`, key `purchase_order_go_live`) |
| Search-window end | Authoritative run start timestamp |
| Permitted business requests | Bounded ServiceTitan GET only |
| Authentication | Minimum OAuth authentication request necessary for the approved run |

**Pagination stop conditions (any one triggers immediate stop):**
- An eligible record has been conclusively identified AND the contractually required registry scope has been captured.
- The API indicates no additional records (`hasMore === false`).
- 10 pages have been requested.
- 500 records have been fetched.
- The 300-second runtime ceiling has been reached.
- A mandatory safety stop occurs.

Limits are ceilings, not targets. No additional pages are fetched after the required bounded observation is complete.

**Retry rules:** apply only to transient failures; use the identical authorized request scope; do not expand the time window, page range, record limit, or permitted methods; included in the request inventory; stop after two failed retry attempts.

**No automatic expansion:** if no eligible post-activation Pending/Sent purchase order is found within these limits → `STOPPED — ELIGIBLE RECORD NOT FOUND`. Any broader search requires separate owner authorization.

---

## §5. Contract-wide result precedence

First match wins; no occurrence assigned to multiple primary outcomes.

1. **FAIL** — an observed prohibited production write, prohibited external effect (event/queue/webhook/schedule/automation run-attributable change), non-GET ServiceTitan business call, ServiceTitan write, mutation-guard observed write, idempotency divergence, same `created`/`updated` returned twice without duplicate suppression, sanitization actual disclosure, checksum conclusively differing for a finalized artifact.
2. **STOPPED** — a guard intercepts an attempted prohibited action before any effect occurs (attempted action recorded; no effect); OR a required precondition/eligible record/guard/evidence mechanism is unavailable before a valid conclusion (including `STOPPED — ELIGIBLE RECORD NOT FOUND`); OR the authorized mechanism reaches a projected-state evaluation and determines completing it would require persistence, so execution stops before any write attempt or effect.
3. **UNAVAILABLE** — an authoritative observation cannot be obtained because the approved platform/access method fundamentally cannot provide a mandatory capability or observation, as established before or independently of executing the test.
4. **INCOMPLETE** — required evidence is missing, truncated, capped, uncorrelated, or internally inconsistent.
5. **PASS** — every mandatory criterion is conclusively supported by complete, correlated, contemporaneous evidence and no FAIL/STOPPED/UNAVAILABLE/INCOMPLETE condition applies.

None of FAIL/STOPPED/UNAVAILABLE/INCOMPLETE may be represented as PASS.

---

## §6. Eligible-record and downstream execution rules (Q2)

- **Post-activation boundary:** `createdOn` (source) ≥ `PurchaseOrderSyncWatermark.activation_timestamp` (key `purchase_order_go_live`). The activation_timestamp is read at run start and recorded.
- **Qualifying statuses:** source `Pending` (normalized `draft`) and source `Sent` (normalized `sent`). Any other status → `status_not_pending_or_sent` / `status_missing` / `status_unknown`.
- **Eligibility requirements:** activation guard passes AND status gate passes (in that order). Both must pass.
- **Required dependency-resolution behavior:** `verifyDependencies` resolves vendor (required, by `servicetitan_vendor_id`) then warehouse (required, discriminated, by `servicetitan_warehouse_id`); line material resolution (discriminated, by `servicetitan_material_id`) in post-batch. Stable reason codes per 2E.6 §A.18.
- **Required downstream evaluation steps (dry-run, no persistence):** (1) mapRecord (header + lines); (2) findExisting by `servicetitan_purchase_order_id`; (3) version comparison; (4) verifyDependencies (vendor + warehouse); (5) line material resolution; (6) outcome classification (created/updated/unchanged/deferred/skipped/failed). All steps completed for ≥1 eligible record.
- **No eligible record found within bounded search:** `STOPPED — ELIGIBLE RECORD NOT FOUND` (not PASS; not UNAVAILABLE unless the eligibility observation cannot be obtained through the approved scope).
- **Maximum authorized search scope:** D-2 ceilings (§4).
- **Prohibited ServiceTitan operations:** any operation other than OAuth token POST and GET to the purchase-orders / purchase-order-types endpoints.

---

## §7. Idempotent duplicate-effect suppression and deterministic repeatability (Q3)

### AC-007 — Idempotent duplicate-effect suppression

- Pass 1 evaluates the captured record set against the authoritative read-only initial state and applies its projected effects only to an isolated, non-production, in-memory projected state (no Base44 production write).
- Pass 2 evaluates the identical captured input against that projected state.
- The idempotency identity/key used for duplicate recognition is captured.
- Pass 2 classifies previously evaluated records as `unchanged`, `already processed`, `duplicate-suppressed`, or the exact equivalent defined by the approved synchronization contract (2E.6: `recordsEqual` true → `unchanged`; `safeCreateWithRecheck` finds existing → no new create).
- Pass 2 produces zero additional projected creates, updates, ledger effects, events, queue messages, watermark changes, or other duplicate effects.
- Stable reason codes and operation identities are captured.
- Merely returning the same `created`/`updated` classification twice must not PASS.

### AC-007b — Deterministic repeatability

- Two evaluations of the identical captured input against the identical unchanged read-only initial state produce identical outcome counters, reason-code totals, and classifications.

Both AC-007 and AC-007b are mandatory; they are not the same test and neither substitutes for the other.

If the existing architecture cannot perform projected-state evaluation without persistence, classify it as a contract/design conflict requiring another owner decision. Do not authorize persistence.

---

## §8. Reconciled run-sensitive and concurrent-activity comparison scopes (Q1)

### A. Run-sensitive record scope (mandatory complete canonical before/after comparison)

Includes:
- Every record read, mapped, resolved, projected, or otherwise evaluated by the authoritative run.
- Every record identified by a ServiceTitan purchase-order ID in the captured registry.
- Every dependency or destination record whose state could affect or be affected by evaluation (Vendor, WarehouseLocation, InventoryMaster resolved for eligible records).
- Every watermark (`PurchaseOrderSyncWatermark` key `purchase_order_go_live`), cursor (`ServiceTitanSyncCursor` domain `purchase_order`), lock, ledger (`InventoryTransaction` purchase_order domain), retry (`DeferredDependentRecord` purchase_order domain), event (`BusinessEvent`/`EventSubscriber`/`BusinessEventDelivery` run-attributable), queue, webhook (`ServiceTitanWebhookEvent`/`ServiceTitanWebhookTimeline` run-attributable), schedule, and automation record attributable to or potentially touched by the run.
- Any additional record selected by the approved technical design as mutation-sensitive.

Every field in the run-sensitive scope receives the mandatory complete canonical before/after comparison, subject only to explicitly named and justified sanitization treatment. Any run-attributable change is FAIL.

### B. Concurrent-activity observation scope (records outside run-sensitive scope)

- Record unrelated changes occurring during the bounded observation window.
- Use correlation identifiers, source identifiers, timestamps, record relationships, and other available causation evidence.
- Do not treat unrelated changes as run-caused.
- Do not exclude a change merely because its correlation identifier is absent — require sufficient evidence to support the conclusion that it is unrelated.
- Classify as INCOMPLETE when causation cannot be established conclusively.

### C. Completeness requirements (both scopes)

For each included entity, define: query method; pagination method; record-selection criteria; stable ordering; exact field set; exclusions and justification; record counts; identifiers; canonical serialization; SHA-256 calculation; capped/truncated status; proof that the required scope was completely captured.

Do not require every unrelated record in the entire production entity to remain unchanged. Do not represent a capped, partial, or causally ambiguous observation as complete no-mutation proof.

### Corrected mutation-sensitive scope (complete field sets; FNV-1a removed)

| Scope item | Entity / control | Complete field set | Exclusions (named + justified) |
|---|---|---|---|
| PurchaseOrder | `PurchaseOrder` | All schema fields incl. built-ins and all sync-owned/LVC-owned/raw-data fields | None |
| PurchaseOrderLine | `PurchaseOrderLine` | All schema fields incl. built-ins | None |
| PurchaseOrder watermark | `PurchaseOrderSyncWatermark` (key `purchase_order_go_live`) | All fields | `tenant_id` excluded from hash input only (sanitization: redacted token); before/after equality still asserted |
| Sync cursor / lock | `ServiceTitanSyncCursor` (domain `purchase_order`) | Lock state fields; confirm released; no new cursor | None |
| Deferred retry records | `DeferredDependentRecord` (domain `purchase_order`) | All fields; count; no new records | None |
| Inventory transaction ledger | `InventoryTransaction` | All fields; count; no new ledger entries for purchase_order domain | None |
| Receipt / Bill / Transfer / Adjustment | `Receipt`, `Bill`, `WarehouseTransfer`, `InventoryAdjustment` | All fields; count; no new records | None |
| Vendor / Warehouse / InventoryMaster (read-only lookups) | `Vendor`, `WarehouseLocation`, `InventoryMaster` | All fields (lookups read-only) | None |
| Business events | `BusinessEvent`, `EventSubscriber`, `BusinessEventDelivery` | All fields; causation-filtered | None |
| Webhook records | `ServiceTitanWebhookEvent`, `ServiceTitanWebhookTimeline` | All fields; causation-filtered | None |
| Automations | automations registry (`list_automations`) | id, name, type, function_name, is_active, status; count | None |
| ServiceTitan request method | HTTP-method audit | All business calls GET; 1 auth POST; 0 non-GET | None |
| Persistence-layer activity | Base44 write-method interception | 0 attempts across create/update/delete/bulkCreate/bulkUpdate/updateMany/deleteMany | None |

Comparison method (applies to every included entity):
1. Define the complete field set whose mutation could be caused by the future approach.
2. Capture canonical before-and-after representations of those fields.
3. Normalize field ordering and other nondeterministic representation.
4. Calculate cryptographically strong SHA-256 over the canonical representation.
5. Retain sufficient sanitized evidence to investigate any mismatch.
6. Include record counts, record identifiers, capped/truncated status, and completeness proof.
7. Prohibit capped or partial queries from being represented as complete comparison evidence.
8. If every production field of an included entity is potentially mutation-sensitive, require all fields except explicitly documented volatile or sensitive fields. Every exclusion must be named and justified.

---

## §9. Concurrent-production-activity and causation rules

Global production counts are not required to remain identical where unrelated users, integrations, webhooks, or automations legitimately operate during the observation window. Causation, not global count stability, governs these controls.

For `BusinessEvent`, `EventSubscriber`, `BusinessEventDelivery`, webhook records (`ServiceTitanWebhookEvent`, `ServiceTitanWebhookTimeline`), schedules, automations, locks (`ServiceTitanSyncCursor`), and comparable controls:

- **Run-attributable evidence:** effects attributable to the authoritative run identified through correlation identifiers, execution timestamps, source identifiers, or equivalent causation evidence.
- **Unrelated concurrent changes:** legitimate unrelated activity excluded from the run-attributable comparison; its presence does not cause FAIL; recorded as concurrent activity.
- **Quiet observation window:** not required; a bounded observation window (start/end tied to the run correlation ID) is used so causation can be established.
- **INCOMPLETE or STOPPED from unrelated activity:** when unrelated concurrent changes make causation impossible to establish for a control that requires it → INCOMPLETE if partial evidence exists; STOPPED if a guard/evidence mechanism is unavailable; never PASS.
- **FAIL from run-attributable change:** a change attributable to the authoritative run in an event/queue/webhook/schedule/automation control is FAIL.
- **No global-count shortcut:** a global count difference alone must not automatically prove the verification caused the change. An unchanged global count must not be treated as conclusive proof that no attributable mutation occurred. The causation-filtered comparison is authoritative.

For entity record sets (`PurchaseOrder`, `PurchaseOrderLine`, watermark, ledger, receipt/bill/transfer/adjustment, vendor/warehouse/inventory, deferred records), causation is direct; the complete canonical SHA-256 comparison applies and an unexpected run-correlated change is FAIL. Unrelated concurrent changes are detectable by correlation (the run only touches records with `servicetitan_purchase_order_id` in the captured set); unrelated records' changes are excluded from the run-attributable comparison and recorded as concurrent activity.

---

## §10. Orphaned-verifier control (AC-016, revised)

Prohibits (measurable; "0 references" not required — the contract necessarily names the verifier):
- invocation of `validateStage2E7LivePoShadowVerification`;
- import or execution dependency on it by the future approach;
- reconstruction of it;
- modification of it;
- deployment of it;
- scheduling of it;
- routing to it;
- use as the foundation for the future approach.

Merely naming it in restrictions or audit evidence is not a violation.

---

## §11. Contract identity

- **Binding version:** `2E7-AC-v0.2-PHASE-A-BINDING-FINAL` (this artifact).
- **Exact byte-serialization rule (governs SHA-256):** UTF-8 with LF line endings, no leading/trailing whitespace beyond the document's own final newline, no BOM; SHA-256 over raw bytes; binding hash recorded in a detached manifest that excludes its own checksum.
- **Binding hash:** Now assignable upon this artifact-creation step (the artifact exists as stable bytes on disk with deterministic serialization). Computed and reported in the artifact-creation evidence accompanying this artifact.
- **Detached manifest:** Created during this authorized artifact-creation step, recording this artifact's SHA-256 and byte size. The manifest excludes its own checksum (per 2E.6 §F/§V 13a); the manifest's checksum is reported externally.

---

## §12. Complete acceptance-contract matrix

Contract-wide prohibitions (all rows): ServiceTitan writes = `NONE`, Base44 production writes = `NONE`, Watermark mutation = `NONE`, Event/queue emission = `NONE`, Webhook effects = `NONE`, Schedule/automation changes = `NONE`.

| ID | Title | Owner decision / basis | Mandatory | Acceptance criterion | Required evidence | Evidence timing | ST requests | Prod endpoint contact | B44 prod reads | Evidence-artifact writes | PASS | FAIL | STOPPED | UNAVAILABLE | INCOMPLETE | Limitation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2E7-AC-001 | Independent new observation | Owner; §28 | MANDATORY | New execution timestamp; explicit non-repair of original run | Timestamp; non-repair statement | Contemp. | NONE | NONE | NONE | REQUIRED | Present | Claims to repair original | — | — | — | n/a |
| 2E7-AC-002 | Bounded GET-only ingestion | Q4; 2E.6 §A.2/§C C1 | MANDATORY | All business GET; 1 OAuth POST; 0 non-GET business | Request inventory | Contemp. | AUTH POST + GET ONLY | REQUIRED | NONE | REQUIRED | All GET, 1 auth POST, 0 non-GET | Any non-GET business request actually sent | Guard intercepts before send | — | — | n/a |
| 2E7-AC-003 | Bounded query behavior | Q4; D-2 | MANDATORY | Actual pages/records/page-size/retries/runtime ≤ D-2 ceilings; ceilings not targets | Config snapshot + actual counts | Contemp. | AUTH POST + GET ONLY | REQUIRED | NONE | REQUIRED | All required evidence completed within limits | Unauthorized/non-GET business request actually sent, or actual prohibited external effect | Guard intercepts a request exceeding a D-2 limit before send | — | Cap/runtime reached before required evidence complete | n/a |
| 2E7-AC-004 | Eligibility gate order | Q2; 2E.6 §A.4–A.5 | MANDATORY | Activation guard first, then Pending/Sent gate; stable reason codes | Per-record eligibility + reason code | Contemp. | AUTH POST + GET ONLY | REQUIRED | REQUIRED | REQUIRED | In order; codes stable | Gate bypassed or silent mapping | — | Eligibility observation unobtainable through approved scope | Per-record evidence missing/truncated | n/a |
| 2E7-AC-005 | Eligible post-activation Pending/Sent PO observed | Q2 | MANDATORY | ≥1 record createdOn ≥ activation_timestamp AND status ∈ {Pending, Sent} passes both gates | Eligibility result count ≥1 + per-record proof | Contemp. | AUTH POST + GET ONLY | REQUIRED | REQUIRED | REQUIRED | ≥1 eligible | — | 0 eligible within bounded search → STOPPED — ELIGIBLE RECORD NOT FOUND | Eligibility observation unobtainable through approved scope | — | n/a |
| 2E7-AC-006 | Downstream evaluation completed for ≥1 eligible record | Q2; 2E.6 §B 8–12 | MANDATORY | map→findExisting→verifyDependencies→line material→outcome, dry-run, completed for ≥1 eligible record | Per-step completion evidence | Contemp. | NONE | NONE | REQUIRED | REQUIRED | All steps completed | Step skipped/incomplete (observed) | No eligible record (prerequisite) | — | Per-step evidence missing/truncated | n/a |
| 2E7-AC-007 | Idempotent duplicate-effect suppression | Q3 (revised) | MANDATORY | Pass 1 → isolated in-memory projected state; Pass 2 same input against projected state; Pass 2 classifies as unchanged/already-processed/duplicate-suppressed; zero additional projected effects; idempotency key captured; no production write | Pass1/pass2 projected results; idempotency keys; reason codes; op identities; zero-additional-effects proof | Contemp. | NONE | NONE | REQUIRED | REQUIRED | Pass 2 zero additional projected effects + correct classification | Prohibited production write or duplicate effect actually observed | Mechanism reaches projected-state eval and determines persistence required → stops before any write/effect | Platform fundamentally cannot supply projected-state capability (established independently of execution) | Projected-state evidence missing/truncated/uncorrelated/inconsistent | Blocking |
| 2E7-AC-007b | Deterministic repeatability | Q3 (supporting) | MANDATORY | Two evaluations, identical input, identical unchanged initial state → identical counters/reason codes/classifications | Two-pass comparison table | Contemp. | NONE | NONE | REQUIRED | REQUIRED | Identical | Prohibited production write actually observed | Mechanism determines persistence required → stops before write/effect | Platform fundamentally cannot supply capability (established independently) | Two-pass evidence missing/truncated/uncorrelated/inconsistent | Blocking |
| 2E7-AC-008 | No Base44 production writes | Q4; 2E.6 §C C2/C5 | MANDATORY | 0 create/update/delete/bulk*/updateMany/deleteMany attempts; dry-run mode | Mutation-guard log; dry-run flag; guard-binding confirmation | Contemp. | NONE | NONE | REQUIRED | REQUIRED | 0 attempts + dry-run + guard bound to production write surface | Observed write | Attempted write intercepted before effect → STOPPED | — | — | n/a |
| 2E7-AC-009 | No watermark mutation | Q4; 2E.6 §C C2 | MANDATORY | PurchaseOrderSyncWatermark full field set before === after (canonical SHA-256); run-attributable | Before/after canonical snapshots | Contemp. | NONE | NONE | REQUIRED | REQUIRED | Complete canonical comparison proves no run-attributable mutation | Run-attributable change observed | Guard intercepts attempted mutation before change | Watermark cannot be read through approved access method | Before/after evidence missing/partial/inconclusively comparable | n/a |
| 2E7-AC-010 | No run-attributable event/queue/webhook/schedule/automation effects | Q4; causation (§9) | MANDATORY | Causation-filtered before/after: zero run-attributable changes; unrelated activity excluded/recorded | Causation-filtered observations + correlation evidence | Contemp. | NONE | NONE | REQUIRED | REQUIRED | Zero run-attributable changes | Run-attributable change observed | Guard intercepts attempted effect before it occurs | Control observation unobtainable through approved access | Causation impossible to establish due to unrelated activity | n/a |
| 2E7-AC-011 | Full record-level registry with read-back | Q2; G2 avoidance | MANDATORY | Complete sanitized per-record registry; row count = fetched count; completeness proven; read-back checksum + count verified | Registry artifact + read-back | Contemp. capture; post-run hash/read-back | NONE | NONE | NONE | REQUIRED | Complete registry captured; row count = fetched; completeness proven; read-back + checksum succeed | Sensitive data actually disclosed through registry; finalized registry conclusively falsified/substituted/unauthorized | Guard determines complete capture cannot proceed and stops before capture begins / before incomplete output accepted | Platform fundamentally cannot expose record-level info (established independently of an incomplete attempt) | Capture began but registry missing rows/truncated/capped/uncorrelated/inconsistent-with-fetched/unreadable/unverifiable | n/a |
| 2E7-AC-012 | Mutation-sensitive before/after canonical comparison | Q1 (revised); §8 scopes | MANDATORY | Every run-sensitive scope item observed before+after; complete canonical field set; SHA-256 over canonical rep; counts/IDs/capped-status/completeness; no capped-as-complete; concurrent scope causation-filtered | Canonical snapshots + SHA-256 + counts + completeness proof + concurrent-activity record | Contemp. | NONE | NONE | REQUIRED | REQUIRED | All run-sensitive scope items unchanged (canonical SHA-256 identical; completeness proven) | Any run-attributable mutation in run-sensitive scope | Guard intercepts attempted mutation before effect | Mandatory scope item unobtainable through approved access | Capped/partial query represented as complete; causation impossible for concurrent scope | Blocking |
| 2E7-AC-013 | Source/build identity (if executable) | Q5 | MANDATORY (if executable) | Repo path + complete SHA-256 + revision + build ID (where applicable) + execution-env identity + correlation to exact mechanism used; conclusive identification through all applicable mandatory identity elements | Identity record | Contemp. | NONE | NONE | NONE | REQUIRED | Exact mechanism conclusively identified via all applicable mandatory identity elements; deployment-ID absence recorded as disclosed limitation only if remaining identity conclusive | Available evidence conclusively identifies a different/unapproved/altered mechanism as executed | Before live execution, required applicable source hash/revision/environment identity/execution-correlation absent/cannot be established | (Not applicable merely due to no deployment ID) | Post-run identity evidence missing/truncated/internally inconsistent/fails to correlate with executed mechanism | DISCLOSED NON-BLOCKING — ONLY IF REMAINING IDENTITY EVIDENCE IS CONCLUSIVE |
| 2E7-AC-014 | Sanitization | 2E.7 §31 inherited | MANDATORY | No full tenant ID, credentials, tokens, PII, raw payloads | Sanitization verification | Post-run | NONE | NONE | NONE | REQUIRED | All evidence satisfies sanitization rules | Sensitive info actually written into/disclosed through evidence | Sanitization validation blocks evidence creation before disclosure | — | Mandatory evidence cannot be retained in sufficiently informative sanitized form | n/a |
| 2E7-AC-015 | Correlation identifier | Q1/Q3 | MANDATORY | Single valid correlation ID established before live contact; consistently present in every required contemporaneous evidence item and retained run output | Correlation ID in every evidence item | Contemp. | NONE | NONE | NONE | REQUIRED | Single valid correlation ID established before live contact; consistently present in all required evidence and retained output | Evidence conclusively shows intentional substitution, reuse contrary to contract, or cross-linking from a different execution | No correlation ID can be established before any live request/observation begins; guard stops execution | Platform fundamentally cannot propagate/retain the mandatory correlation ID (established before live execution) | Correlation ID established and run proceeded, but ≥1 required evidence item omits it, contains inconsistent IDs, or cannot be conclusively correlated afterward | n/a |
| 2E7-AC-016 | Orphaned-verifier control (revised) | Owner restriction | MANDATORY | No invocation/import-execution-dependency/reconstruction/modification/deployment/scheduling/routing/use-as-foundation of `validateStage2E7LivePoShadowVerification`; naming in restrictions/audit is not a violation | Access audit (prohibited actions) | Contemp. | NONE | NONE | REQUIRED | REQUIRED | None of the prohibited actions occur | Any prohibited action occurs | Attempted prohibited action intercepted before effect | — | Access audit missing/truncated | n/a |
| 2E7-AC-017 | Detached SHA-256 manifest + independent verification | 2E.6 §F/§V 13a | MANDATORY | Detached manifest; every entry independently re-hashes; manifest excludes own checksum | Manifest + re-hash match | Post-run | NONE | NONE | NONE | REQUIRED | Every entry re-hashes successfully | SHA-256 conclusively differs from recorded checksum for a finalized/unchanged artifact | Artifact/manifest guard prevents finalization before authoritative manifest | — | Artifact/entry missing; re-hash cannot complete; package internally inconsistent | n/a |
| 2E7-AC-018 | Optional strengthening: field-level diff beyond mandatory scope | Q1 (optional) | OPTIONAL | Additional Base44 field-level diff beyond mandatory scope shows no change | Extended diff | Contemp. | NONE | NONE | REQUIRED | REQUIRED | Strengthens AC-012 | n/a | n/a | n/a | n/a | n/a |

### Cross-row audit (no overlapping primary outcomes)

Contract-wide precedence: FAIL (observed prohibited action/effect) > STOPPED (intercepted before effect / prerequisite unavailable / persistence-required-before-effect) > UNAVAILABLE (platform fundamentally incapable, established independently of execution) > INCOMPLETE (evidence missing/truncated/capped/uncorrelated/inconsistent) > PASS.

- AC-002: actually-sent non-GET = FAIL; intercepted-before-send = STOPPED. No overlap.
- AC-003: actually-sent unauthorized/non-GET or actual prohibited effect = FAIL; intercepted-before-send = STOPPED; cap reached before evidence complete = INCOMPLETE. No overlap.
- AC-005: 0 eligible in bounded search = STOPPED; eligibility observation unobtainable = UNAVAILABLE. Distinguished by cause (0-found vs observation-unobtainable). No overlap.
- AC-007/AC-007b: observed write/duplicate = FAIL; persistence-required stops before effect = STOPPED; fundamentally incapable (established independently) = UNAVAILABLE. No overlap.
- AC-008: observed write = FAIL; attempted-write intercepted = STOPPED. No overlap.
- AC-009: observed run-attributable change = FAIL; attempted mutation intercepted = STOPPED; watermark unobtainable = UNAVAILABLE; before/after evidence missing/partial = INCOMPLETE. No overlap.
- AC-011: sensitive-data-disclosed or falsified = FAIL; guard stops before incomplete capture accepted = STOPPED; platform fundamentally cannot expose = UNAVAILABLE; capture began but partial/unverifiable = INCOMPLETE. No overlap.
- AC-013: different/altered mechanism = FAIL; before-execution required identity absent = STOPPED; post-run evidence missing/inconsistent = INCOMPLETE; missing deployment ID = disclosed limitation (PASS path), never UNAVAILABLE. No overlap.
- AC-014: actual disclosure = FAIL; validation blocks before disclosure = STOPPED; cannot retain sufficient sanitized evidence = INCOMPLETE. No overlap.
- AC-015: intentional substitution/reuse/cross-linking = FAIL; no ID before live request + guard stops = STOPPED; platform fundamentally cannot propagate (established before execution) = UNAVAILABLE; ID established but missing/inconsistent in evidence = INCOMPLETE. Timing disambiguates. No overlap.
- AC-017: checksum conclusively differs for finalized artifact = FAIL; guard prevents finalization = STOPPED; artifact/entry missing/re-hash incomplete/inconsistent = INCOMPLETE. No overlap.

No row assigns the same occurrence to multiple primary outcomes.

---

## §13. Prohibited-write rules (Q4)

Prohibited (contract-wide):
- Base44 production data creation or modification (any entity).
- Registry persistence in production storage.
- Watermark changes (any field).
- Domain-event or queue emission.
- Webhook-triggering changes.
- Schedule or automation changes.
- Production idempotency writes.
- Any ServiceTitan operation other than OAuth token POST and GET-only reads.

Permitted (specifically approved):
- ServiceTitan authentication (1 OAuth POST) + bounded GET-only requests.
- Base44 production reads (lookups, before/after snapshots).
- Non-persistent (dry-run) evaluation.
- Contemporaneous evidence capture.
- Repository / evidence-artifact writes specifically authorized for the evidence package (classified separately from production-data writes).

Phase G (controlled production-write) is excluded from the approved plan.

---

## §14. Source and execution-identity rules (Q5)

Applicable only if the approved approach uses executable code:
- Repository path for the exact approved implementation artifact.
- Complete SHA-256 hash of that artifact.
- Repository revision or commit identity.
- Build identity where applicable.
- Execution-environment identity.
- Correlation between the identified artifact and the exact mechanism used for the authoritative run.

If the platform does not expose a deployment identifier, that absence is recorded as a disclosed, non-blocking limitation and is not automatically a failure, provided the remaining source, revision, hash, environment, and execution-correlation evidence conclusively identifies the mechanism used. The approach is not assumed to be a function, backend verifier, script, or deployment.

---

## §15. Safety gates and stop conditions

**Pre-execution gates (all must pass before live contact):**
- Acceptance contract approved by owner (this Phase A artifact approved).
- Mutation-sensitive scope fully defined (§8).
- Eligible-record and downstream requirements fully defined (§6).
- Two-pass zero-persistence requirement contains no unresolved contradiction (§7).
- Contact and mutation classifications reconciled.
- If executable code: source hash/revision/build/environment identity capturable.
- Bounded query config set (D-2, §4).
- HTTP-method guard, Base44 mutation guard, dry-run mode, watermark/queue/event/webhook/schedule/persistence guards installed.
- Sanitization plan approved.
- Orphaned verifier confirmed untouched and unreferenced.

**Mandatory stop conditions (abort on any):**
- Missing or ambiguous acceptance criteria.
- Unapproved implementation identity.
- Missing source hash or revision where executable code is used.
- Unbounded ServiceTitan query behavior (caps exceeded/absent).
- Any ServiceTitan request other than authentication or GET.
- Any unexpected Base44 production write or write attempt.
- Any watermark mutation or attempted mutation.
- Any event or queue emission.
- Any webhook effect.
- Any schedule or automation change.
- Any unexpected persistence behavior.
- Missing eligible record within bounded search → `STOPPED — ELIGIBLE RECORD NOT FOUND`.
- Incomplete or truncated registry capture.
- Missing correlation identifier before live contact.
- Inability to capture contemporaneous evidence.
- Inability to sanitize sensitive information.
- Any access to the orphaned verifier.
- Any deviation from the approved request limit or execution environment.

---

## §16. Future evidence-package requirements

| # | Item | Timing |
|---|---|---|
| 1 | Phase authorization reference | Pre-run |
| 2 | Binding acceptance-contract version and SHA-256 | Pre-run |
| 3 | Execution date, time, timezone, environment | Contemporaneous |
| 4 | Exact source/build identity (if executable) | Contemporaneous |
| 5 | Run correlation identifier | Contemporaneous |
| 6 | Complete ServiceTitan request inventory | Contemporaneous |
| 7 | Confirmation ST ops limited to auth + GET | Contemporaneous |
| 8 | Total fetched-record count | Contemporaneous |
| 9 | Complete sanitized record registry | Contemporaneous (capture); post-run (hash/read-back) |
| 10 | Eligible-record identification and eligibility proof | Contemporaneous |
| 11 | Downstream dependency-resolution results | Contemporaneous |
| 12 | First-pass idempotency result | Contemporaneous |
| 13 | Second-pass idempotency result | Contemporaneous |
| 14 | Deterministic comparison between passes | Contemporaneous |
| 15 | Complete mutation-sensitive before/after comparison | Contemporaneous (before+after) |
| 16 | Watermark comparison | Contemporaneous (before+after) |
| 17 | Event/queue/webhook/schedule/automation observations | Contemporaneous (before+after) |
| 18 | Production-write and persistence-attempt audit | Contemporaneous |
| 19 | Stop-condition evaluation | Contemporaneous |
| 20 | Limitations and unavailable platform identifiers | Post-run |
| 21 | Final result and classification | Post-run |
| 22 | Artifact byte sizes | Post-run |
| 23 | Detached SHA-256 manifest | Post-run |
| 24 | Independent manifest verification | Post-run |

---

## §17. Contradictions or unsatisfiable requirements

- No contradiction identified. The two-pass dry-run over a captured set is feasible without persistence (2E.6 §A.16; original 2E.7 run design). Q2 downstream evaluation completes via dry-run without persistence, satisfying both Q2 and Q4. Q1 mutation-sensitive scope is fully defined and observable via reads only.
- One conditional limitation: AC-013's deployment-identifier component is a disclosed non-blocking limitation per Q5, not a contract failure, provided source/revision/hash/environment/correlation conclusively identify the mechanism.

---

## §18. Historical-evidence confirmation (corrected)

- The historical evidence and orphaned-verifier disposition remain unchanged by this Phase A artifact creation.
- Previously recorded filenames, byte sizes, and hashes may be repeated only as prior retained identifiers:
  - `STAGE_2E_7_LIVE_SHADOW_EVIDENCE.md` — 26188 bytes, `b4c66b123dfaf09d1f64aa1289c0cdfc6f51cb8348cc3a1c56a219ffcdac01cf` (prior retained identifier)
  - Stage 2E.7 frozen manifest — 122 bytes, external `e00892fe789160d2dbacb216d8f4e9905bbcb39cc58c3c598fec6b34e3fd0175` (prior retained identifier)
  - Stage 2E.7 disposition evidence — 20662 bytes, `efb33930…` (prior retained identifier)
  - Stage 2E.7 disposition manifest — 131 bytes, `4f299a92…` (prior retained identifier)
  - Stage 2E.6 frozen artifacts — 21/21 (prior retained identifier)
- No new integrity verification occurred during this artifact-creation step unless explicitly performed and reported in the artifact-creation evidence.
- The original Stage 2E.7 evidence remains frozen and partially verified.
- G1, G2, and G3 remain unresolved for the historical run.
- The orphaned verifier remains prohibited and was not accessed during this artifact-creation step.

---

## §19. Phase B remains unauthorized

Phase B (Repository-Only Technical Design) remains unauthorized until the owner separately authorizes it. This Phase A artifact approval does not authorize Phase B, implementation, or live execution.

---

## §20. Final classification

`STAGE 2E.7 PHASE A ACCEPTANCE CONTRACT — BINDING ARTIFACT CREATED — PHASE B, IMPLEMENTATION, AND LIVE EXECUTION NOT AUTHORIZED — ORIGINAL EVIDENCE AND ORPHANED VERIFIER UNCHANGED — ZERO PRODUCTION CONTACT — ZERO PRODUCTION CHANGES