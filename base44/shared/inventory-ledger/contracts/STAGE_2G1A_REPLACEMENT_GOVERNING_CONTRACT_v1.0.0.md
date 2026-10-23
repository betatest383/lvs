# STAGE 2G1-A REPLACEMENT GOVERNING CONTRACT v1.0.0

---

## 0. Contract Identity and Authorization Status

This contract prospectively replaces the unrecovered original Stage 2G1-A authorization contract. It is not represented as the original contract and does not retroactively authorize prior work.

| Property | Value |
|---|---|
| Contract title | STAGE 2G1-A Replacement Governing Contract |
| Contract version | v1.0.0 |
| Formula version | 2g1a-v1.0.0 |
| Canon version (SQL) | pg-jsonb-v1 |
| Contract artifact path | base44/shared/inventory-ledger/contracts/STAGE_2G1A_REPLACEMENT_GOVERNING_CONTRACT_v1.0.0.md |
| SHA-256 | See external delivery manifest (reported in final response, not embedded in this file) |
| Authorization status | PENDING OWNER APPROVAL |

This contract is a replacement governing contract. It supersedes the unrecovered original Stage 2G1-A Implementation Authorization Contract (SHA-256 df9e621e1d201609aa24c808496763bd22b87a60b016fcda516ba06c0dedb544), which was never preserved in the project.

This replacement contract is derived from the verified current implementation source files, the 137-test acceptance registry (AT-001 through AT-137), and the AT-071 owner resolution addendum. It does not claim to reproduce the original contract text.

Implementation correction and local validation are NOT authorized until the owner explicitly approves this contract's exact path, contents, and SHA-256 hash.

## 1. Scope and Authority

### 1.1 What This Contract Governs

This contract governs the Stage 2G1-A inventory ledger domain module -- the pure, in-memory domain evaluator that processes inventory events against a DomainState and returns DomainResult2G1A outcomes.

### 1.2 What This Contract Does NOT Govern

This contract does NOT authorize or govern: external database execution (PostgreSQL/Supabase), production data changes, Stage 2G1-B activation, BT-042, ServiceTitan synchronization, UI or frontend implementation, or any system outside the 2G1-A domain module boundary.

### 1.3 Non-Authorization Statement

No production code has been modified to create this contract. No 2G1-A source file has been changed. No database or UI implementation is authorized by this contract alone.

## 2. Verified Source Evidence Base (23 Files)

This contract is derived from the following 23 verified source files. All metadata was recomputed directly from the literal file bytes on 2026-07-24.

| # | File | Bytes | Physical Lines | Final Newline | SHA-256 |
|---|---|---|---|---|---|
| 1 | domainState.ts | 8758 | 234 | No | 002a5da1cfb1e53928df14bdba76c68a21d52daf543d4c0130a44fc5b58db7af |
| 2 | publicBoundary.ts | 76248 | 1581 | No | a5794e049b721f6a1d0b4ad815606b455e8e069ba8bef25af0407b07be4bbd31 |
| 3 | eventTypes.ts | 10154 | 309 | No | 0d5ac870d6c566f176b3a21017ee9c187e607cad8f424cb95cebc24d27eb977f |
| 4 | resultTypes.ts | 4722 | 145 | No | 7eaa772ae924aa8b54af79a13dc63a6d95630556949eb6f874e5535fb6aa749f |
| 5 | compileCheck.ts | 3049 | 72 | No | 4f361cf05108c8c7561b41a3c5db20409cfa072c7801ab390d945483b6b4ccaf |
| 6 | payloads.ts | 6261 | 210 | No | 2abeb20e55bf55f38888213cf3faffc5296a1b11b11532c1feb04b8561846f8b |
| 7 | atomicRecordOps.ts | 7681 | 253 | No | 3d3d85b6fb01027f6304d346da74043692df0d8ac46291be33d23b652f8e24d5 |
| 8 | unitOfMeasureRules.ts | 1141 | 26 | No | 289205941a3ee7597f24c5a0bb4297a777e7be01efee8f00dca72a1a1bd761d4 |
| 9 | invariantValidators.ts | 4996 | 119 | No | cd06fe428440fc0075d99456bc81a108ff8b4f823c3c55f8172c758b71966a37 |
| 10 | valuationRules.ts | 3289 | 97 | No | b5af1747ad6dad20d1158db178dfd75b55a36cbd0f06e69685752552e3cd2d96 |
| 11 | comparator.ts | 4680 | 107 | No | d383e36ca1e4846237cedad8c68f3abdff76225f007fb8ec0df131b92c585321 |
| 12 | rawEventInput.ts | 2569 | 66 | No | 5f1bfb2c4f339c3d2c720d3f76d762101c7c1515d33e46427d13032bbf28439e |
| 13 | index.ts | 1933 | 26 | No | 48c5bd95b877e5e057b27fe5ba56948f3f86763dd3b09c276dc7ced12f2c6e39 |
| 14 | testFixtures.ts | 11971 | 248 | No | bdaf3d625d84523be6008f5cbabea85a60ec1ba762c15729090873cd2bbb4da9 |
| 15 | testSuite.ts | 104809 | 580 | No | 8a576b5c435eb33fa835a64fc2c9e550f58036f81051e426727a0b81b3dc23a2 |
| 16 | quantityEffects.ts | 2027 | 67 | No | 94936a16fef55d864f8ad860c0e61303d647621faad0bae894a7cd6476a172e2 |
| 17 | classificationResults.ts | 1644 | 53 | No | caf2390b6c6b42b65a52d5fa4652be100d6eb59d592fc02a79da9ceb0c3a1995 |
| 18 | auditSuite.ts | 116695 | 593 | No | b9b333b404473aaa1266ef918e8c294b0b6fb3132565b9e936cfe682125cef03 |
| 19 | auditFixtures.ts | 14455 | 418 | No | 17d5d09df8e55a8364bae8c6e40da1a310bc50913ee8adb65292e043c32bb16f |
| 20 | traceabilityRegistry.ts | 49345 | 237 | No | 2fdf229b7ce26330112079ec36b9a3673aa9cdb4642606674ca948b294e5da1b |
| 21 | supplementalFiniteTests.ts | 18388 | 158 | No | b7ed27e87f3b603ac1d367d0546cb535bc7331bdad0585d51f0ce4d67abb6474 |
| 22 | stage_2g1a_receipt_validation.sql | 91844 | 924 | No | 935a18cebf057575247787d22fc5f5f0bec3b4d04540bf65949de527cecbec4c |
| 23 | AUDIT_ADDENDUM_AT-071.md | 1824 | 33 | No | 07bccac6be744b7d7160ee142530e6da28b1b54c82d68be2a485389249b610ca |

## 3. Adopted Domain State (9 Members)

The DomainState interface is adopted exactly as defined in domainState.ts (SHA-256 002a5da1...):

| # | Member | Type | Description |
|---|---|---|---|
| 1 | state_revision | number | Monotonically increasing revision counter |
| 2 | items | Record<string, DomainItem> | Item master data |
| 3 | positions | Record<string, DomainPosition> | Inventory positions |
| 4 | company_ownership | Record<string, DomainCompanyOwnership> | Company-owned quantity per item |
| 5 | transfers_outstanding | Record<string, TransferOutstanding> | Outstanding transfers |
| 6 | correction_provenance | Record<string, CorrectionProvenanceRecord> | Correction reversal provenance |
| 7 | job_issue_progress | Record<string, JobIssueProgress> | Job material issue tracking |
| 8 | transactions | Record<string, AcceptedEventRecord> | Accepted event records |
| 9 | cutoff | DomainTransactionCutoff | Transaction freeze state |

## 4. Authorized Event Types

There are 18 authorized event types identified within the E1-E55 registry range. The E1_E55_REGISTER contains additional deferred discriminators that are recognized but produce AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE. Only the 18 listed below are authorized for state mutation.

The complete literal 18-event registry is in Appendix A.

## 5. Adopted Event Evaluation Pipeline

The event evaluation pipeline is adopted exactly as implemented in publicBoundary.ts (SHA-256 a5794e04...). The idempotency check runs BEFORE finiteness/positivity checks and BEFORE entity lookups. This ordering is mandatory.

## 6. AcceptedEventRecord Identifier Rule

The AcceptedEventRecord.record_id is: AER-{idempotency_key}-{afterRevision}

Source: publicBoundary.ts line 417: const recordId = `AER-${idemKey}-${c.afterRevision}`;

Example: If idempotency_key = "IDEM-032" and afterRevision = 2, then record_id = "AER-IDEM-032-2".

The simplified fixture ID (without revision suffix) is test-setup behavior only in testFixtures.ts. It is NOT the production evaluator's identity formula. This contract adopts the production format as the governing rule.

## 7. Adopted Formula Version

Formula version: 2g1a-v1.0.0 (source: resultTypes.ts line 145, SHA-256 7eaa772a...)

All accepted results from evaluateEvent2G1A MUST carry formula_version = "2g1a-v1.0.0".

## 8. Adopted Canonical State Effects (4)

| # | Effect Kind | Description |
|---|---|---|
| 1 | position_quantity | Changes a position's quantity |
| 2 | company_owned | Changes company-owned quantity |
| 3 | condition_reclassification | Reclassifies a position's condition |
| 4 | restriction_reclassification | Reclassifies a position's restriction |

## 9. Adopted Atomic Record Operations (11)

### 9.1 Recorded Domain Operations (9)

| # | Operation Kind | Description |
|---|---|---|
| 1 | transfer_outstanding_created | Transfer dispatch record |
| 2 | transfer_outstanding_received | Transfer receipt completion |
| 3 | correction_provenance_created | Correction provenance record creation |
| 4 | correction_provenance_reversal_updated | Correction reversal update |
| 5 | correction_provenance_downstream_block_updated | Downstream block update |
| 6 | job_issue_progress_created | Job material issue record creation |
| 7 | job_issue_consumed_updated | Job material consumption update |
| 8 | job_issue_consumed_reversed | Job material consumption reversal |
| 9 | job_issue_returned_updated | Job material return update |

### 9.2 Applier-Only Operations (2)

| # | Operation Kind | Description |
|---|---|---|
| 1 | accepted_event_record_inserted | AcceptedEventRecord insertion |
| 2 | state_revision_advanced | State revision advancement |

recorded_operations in AcceptedEventRecord excludes accepted_event_record_inserted and state_revision_advanced.

## 10. Adopted Classification Results and Derived Snapshots

### 10.1 Classification Results (3)

| # | Kind | Description |
|---|---|---|
| 1 | no_effect_workflow | Workflow action with no state effect |
| 2 | no_effect_command | Command with no state effect |
| 3 | no_effect_observation | Observation with no state effect |

### 10.2 Derived Result Snapshots (1)

| # | Kind | Description |
|---|---|---|
| 1 | availability_derived | Available quantity before/after |

## 11. Complete Rejection Code Registry (38 Codes)

There are exactly 38 distinct rejection codes in DomainErrorCode2G1A, as defined in eventTypes.ts (SHA-256 0d5ac870...). The complete literal registry is in Appendix B.

AT-132 verifies zero-mutation across all 38 rejection codes: for each rejection code, the original state must remain unchanged after evaluation.

## 12. Adopted Invariant Validators (4)

| # | Validator | Failure Code(s) | Description |
|---|---|---|---|
| 1 | validateCompanyOwnedReconciliation | RECONCILIATION.COMPANY_OWNED_MISMATCH | Company-owned quantity must equal sum of non-terminal position quantities |
| 2 | validateTerminalZeroBalance | STATE.WRONG_TRANSITION | Terminal positions must have zero quantity |
| 3 | validateJobIssueProgress | RECONCILIATION.COMPANY_OWNED_MISMATCH, CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE, STATE.WRONG_TRANSITION | Issue outstanding reconciliation, consumption limit, status check |
| 4 | validateCorrectionProvenance | CORRECTION.REVERSAL_EXCEEDS_AVAILABLE | Reversal quantity must not exceed remaining reversible quantity |

## 13. Adopted Unit of Measure Rules

Accepted UOMs (17): ea, box, case, pallet, ft, in, yd, lb, oz, gal, qt, pt, sheet, roll, set, pair, unit.

Numerical validators: isFiniteNumber, isPositiveFinite, isNonNegativeFinite.

## 14. Adopted Valuation Rules

- Supported cost source: supported_explicit (requires unit_cost > 0, finite)
- Rejected cost sources: selling_price -> VAL.SELLING_PRICE_REJECTED, msrp -> VAL.MSRP_REJECTED, markup -> VAL.MARKUP_REJECTED, other_invalid -> VAL.COST_SOURCE_INVALID, any unknown string -> VAL.COST_SOURCE_INVALID
- Missing cost (null): accepted with VAL.UNRESOLVED_COST_WARNING warning
- CostPreservationResult: created for supported_explicit costs only

## 15. Adopted Comparator and Operation Sorting

- compareStrings(a, b): primitive string comparator
- sortOperations(ops): sorts AtomicRecordOperation2G1A[] by op_kind, primary key, secondary key
- sortErrors(errors): sorts DomainError[] by category, error_code, affected_field (null represented as "~")

## 16. Acceptance Test Registry Summary

The 137-test acceptance registry is adopted from traceabilityRegistry.ts (SHA-256 2fdf229b...) and auditSuite.ts (SHA-256 b9b333b4...). The complete 137-row registry is in Appendix C.

Summary by sequential group (mechanically derived from Appendix C):

| Group | Test Range | Count |
|---|---|---|
| E5 receipt.posted | AT-001 - AT-020 | 20 |
| E1-E4 WFA (po.created, po.approved, po.sent, po.line.opened) | AT-021 - AT-024 | 4 |
| E8/E9 transfer (dispatched, received) | AT-025 - AT-035 | 11 |
| E6 receipt.reversed | AT-036 - AT-045 | 10 |
| E25 adjustment.requested | AT-046 - AT-046 | 1 |
| E26 adjustment.posted | AT-047 - AT-050 | 4 |
| E28 adjustment.reclassification | AT-051 - AT-053 | 3 |
| E27 adjustment.reversed | AT-054 - AT-064 | 11 |
| E32 job_material.issued | AT-065 - AT-066 | 2 |
| E33 job_material.consumed | AT-067 - AT-074 | 8 |
| Closure (E32+E33, E32+E37, E32+E33+E37) | AT-075 - AT-077 | 3 |
| E34 consumption.reversed | AT-078 - AT-089 | 12 |
| E37 remnant.same_item_returned | AT-090 - AT-099 | 10 |
| E47 count.observation | AT-100 - AT-100 | 1 |
| E48 count.variance.resolved | AT-101 - AT-103 | 3 |
| Boundary (deferred, unknown, null, non-object) | AT-104 - AT-111 | 8 |
| Idempotency | AT-112 - AT-112 | 1 |
| Invariant/structural | AT-113 - AT-121 | 9 |
| Compile/structural | AT-122 - AT-127 | 6 |
| Blocker emission | AT-128 - AT-137 | 10 |
| **Total** | AT-001 - AT-137 | **137** |

Supplemental: 45 finite/non-positive quantity validation tests (SUP-001 through SUP-045) from supplementalFiniteTests.ts (SHA-256 b7ed27e8...). These are SEPARATE from AT-001 through AT-137.

## 17. AT-071 Owner Resolution (Preserved)

The AT-071 owner resolution, documented in AUDIT_ADDENDUM_AT-071.md (SHA-256 07bccac6...), is preserved in full.

**Subject:** Validation precedence ambiguity for E33 job_material.consumed when job_custody_position_id references a nonexistent position.

**Ambiguity:** The approved contract Section 22 specifies AT-071's expected result as VALIDATION.MISSING_SOURCE_POSITION. However, the behavioral specification describes the JobIssueProgress selection as the first step, which would produce VALIDATION.MISSING_ISSUE_PROVENANCE when no open issue is found.

**Owner Resolution (preserved verbatim):**

1. First: Validate that job_custody_position_id identifies an existing position in DomainState.positions.
2. If the referenced position does not exist: Reject with VALIDATION.MISSING_SOURCE_POSITION.
3. If the position exists but no eligible open issue provenance exists for the required (item_id, job_custody_position_id) pair: Reject with VALIDATION.MISSING_ISSUE_PROVENANCE.

**Authorized Expected Result:** AT-071 retains its expected result: VALIDATION.MISSING_SOURCE_POSITION.

**Verified from traceabilityRegistry.ts:139:** AT-071, event=E33, expected=Reject, rejection_code=VALIDATION.MISSING_SOURCE_POSITION.

**Scope:** Narrow clarification of deterministic validation precedence for E33 only.

## 18. Adopted SQL Validation Artifact

The SQL validation artifact stage_2g1a_receipt_validation.sql (SHA-256 935a18ce..., 91,844 bytes, 924 lines) is adopted as the PostgreSQL receipt-validation reference. Formula version: 2g1a-v1.0.0. Canon version: pg-jsonb-v1.

This SQL artifact is NOT authorized for execution by this contract. External database execution is separately gated (Section 22).

## 19. Adopted Module Organization (21 Source Files + 1 Addendum = 23 Evidence Files)

The 21-file module organization plus the AT-071 addendum (23 total evidence files) is adopted as the required structure. See Section 2 for the complete file listing with verified metadata.

## 20. Adopted Decisions Summary

| # | Decision | Status |
|---|---|---|
| 1 | Adopt AER-{idempotencyKey}-{afterRevision} as the AcceptedEventRecord identifier rule | Adopted |
| 2 | Adopt the verified current 2G1-A implementation as the behavioral baseline | Adopted |
| 3 | Adopt the AT-001 through AT-137 acceptance test registry (137 tests) | Adopted |
| 4 | Preserve the AT-071 owner resolution (position existence before issue lookup) | Preserved |
| 5 | Adopt formula version 2g1a-v1.0.0 | Adopted |
| 6 | Adopt canon version pg-jsonb-v1 for SQL artifact | Adopted |
| 7 | Adopt 18 authorized event types (not 55) | Adopted |
| 8 | Adopt 38 rejection codes (complete literal registry in Appendix B) | Adopted |
| 9 | Keep external database execution separately gated | Separately gated |
| 10 | Keep production changes separately gated | Separately gated |
| 11 | Keep Stage 2G1-B activation separately gated | Separately gated |
| 12 | Keep BT-042 separately gated | Separately gated |

## 21. Authorization Gates

After exact owner approval of this contract and its SHA-256:
- Implementation correction is authorized
- Local compilation and validation are authorized

Still separately gated (Sections 22-24):
- External database execution
- PostgreSQL or Supabase execution
- Production changes
- Stage 2G1-B implementation or activation
- BT-042

## 22. External Database and Production Changes Gate

External database execution and production changes are NOT authorized by this contract. These require separate owner approval. The SQL artifact may be reviewed and analyzed but NOT executed until this gate is lifted.

## 23. Stage 2G1-B Activation Gate

Stage 2G1-B (partial transfer receipts) is NOT activated by this contract. It requires the owner-approved STAGE_2G1B_IMPLEMENTATION_AUTHORIZATION_CONTRACT.md and separate owner approval.

## 24. BT-042 Gate

BT-042 (zero production or persistent-data mutation verification) is NOT authorized by this contract. It requires separate owner-approved external harness or database verification procedure.

## Appendix A: Complete 18-Event Registry

| # | E-ID | Event Type String | Description |
|---|---|---|---|
| 1 | E1 | po.created | Purchase order created |
| 2 | E2 | po.approved | Purchase order approved |
| 3 | E3 | po.sent | Purchase order sent |
| 4 | E4 | po.line.opened | Purchase order line opened |
| 5 | E5 | receipt.posted | Receipt posted to warehouse position |
| 6 | E6 | receipt.reversed | Receipt reversal (partial or full) |
| 7 | E8 | transfer.dispatched | Transfer dispatched from source to in-transit |
| 8 | E9 | transfer.received | Transfer received at destination (full or deferred partial) |
| 9 | E25 | adjustment.requested | Adjustment requested (no effect, command) |
| 10 | E26 | adjustment.posted | Adjustment posted (quantity delta applied) |
| 11 | E27 | adjustment.reversed | Adjustment reversal (partial or full) |
| 12 | E28 | adjustment.reclassification | Condition or restriction reclassification |
| 13 | E32 | job_material.issued | Job material issued from warehouse to job custody |
| 14 | E33 | job_material.consumed | Job material consumed at job custody position |
| 15 | E34 | consumption.reversed | Consumption reversal (partial or full) |
| 16 | E37 | remnant.same_item_returned | Remnant returned from job to same item position |
| 17 | E47 | count.observation | Physical count observation (no effect) |
| 18 | E48 | count.variance.resolved | Count variance resolved (quantity adjustment) |

## Appendix B: Complete 38-Code Rejection Registry

| # | Rejection Code | Source |
|---|---|---|
| 1 | AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE | eventTypes.ts ALL_ERROR_CODES[1] |
| 2 | AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B | eventTypes.ts ALL_ERROR_CODES[2] |
| 3 | VALIDATION.NULL_EVENT_INPUT | eventTypes.ts ALL_ERROR_CODES[3] |
| 4 | VALIDATION.NON_OBJECT_INPUT | eventTypes.ts ALL_ERROR_CODES[4] |
| 5 | VALIDATION.MISSING_REQUIRED_FIELD | eventTypes.ts ALL_ERROR_CODES[5] |
| 6 | VALIDATION.UNKNOWN_PAYLOAD_KEY | eventTypes.ts ALL_ERROR_CODES[6] |
| 7 | VALIDATION.INVALID_ENUM_VALUE | eventTypes.ts ALL_ERROR_CODES[7] |
| 8 | VALIDATION.NON_POSITIVE_QUANTITY | eventTypes.ts ALL_ERROR_CODES[8] |
| 9 | VALIDATION.ZERO_DELTA_NOT_PERMITTED | eventTypes.ts ALL_ERROR_CODES[9] |
| 10 | VALIDATION.NO_OP_RECLASSIFICATION | eventTypes.ts ALL_ERROR_CODES[10] |
| 11 | VALIDATION.MISSING_SOURCE_POSITION | eventTypes.ts ALL_ERROR_CODES[11] |
| 12 | VALIDATION.MISSING_DESTINATION_POSITION | eventTypes.ts ALL_ERROR_CODES[12] |
| 13 | VALIDATION.MISSING_ISSUE_PROVENANCE | eventTypes.ts ALL_ERROR_CODES[13] |
| 14 | VALIDATION.ITEM_MISMATCH | eventTypes.ts ALL_ERROR_CODES[14] |
| 15 | VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION | eventTypes.ts ALL_ERROR_CODES[15] |
| 16 | VALIDATION.UNKNOWN_EVENT_TYPE | eventTypes.ts ALL_ERROR_CODES[16] |
| 17 | VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE | eventTypes.ts ALL_ERROR_CODES[17] |
| 18 | VALIDATION.RECEIPT_ID_MISMATCH | eventTypes.ts ALL_ERROR_CODES[18] |
| 19 | VALIDATION.ISSUE_PROVENANCE_MISMATCH | eventTypes.ts ALL_ERROR_CODES[19] |
| 20 | VALIDATION.POSITION_MISMATCH | eventTypes.ts ALL_ERROR_CODES[20] |
| 21 | UOM.NON_FINITE_QUANTITY | eventTypes.ts ALL_ERROR_CODES[21] |
| 22 | INV.NEGATIVE_RESULT | eventTypes.ts ALL_ERROR_CODES[22] |
| 23 | STATE.WRONG_TRANSITION | eventTypes.ts ALL_ERROR_CODES[23] |
| 24 | RECONCILIATION.COMPANY_OWNED_MISMATCH | eventTypes.ts ALL_ERROR_CODES[24] |
| 25 | INV.IDEMPOTENCY_DUPLICATE_CONTRACT | eventTypes.ts ALL_ERROR_CODES[25] |
| 26 | TRANSFER.RECEIVE_WITHOUT_DISPATCH | eventTypes.ts ALL_ERROR_CODES[26] |
| 27 | TRANSFER.RECEIVE_EXCEEDS_DISPATCH | eventTypes.ts ALL_ERROR_CODES[27] |
| 28 | TRANSFER.DESTINATION_MISMATCH | eventTypes.ts ALL_ERROR_CODES[28] |
| 29 | CORRECTION.ORIGINAL_NOT_FOUND | eventTypes.ts ALL_ERROR_CODES[29] |
| 30 | CORRECTION.ALREADY_REVERSED | eventTypes.ts ALL_ERROR_CODES[30] |
| 31 | CORRECTION.REVERSAL_EXCEEDS_AVAILABLE | eventTypes.ts ALL_ERROR_CODES[31] |
| 32 | CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE | eventTypes.ts ALL_ERROR_CODES[32] |
| 33 | CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE | eventTypes.ts ALL_ERROR_CODES[33] |
| 34 | RETURN.EXCEEDS_OUTSTANDING_ISSUE | eventTypes.ts ALL_ERROR_CODES[34] |
| 35 | VAL.SELLING_PRICE_REJECTED | eventTypes.ts ALL_ERROR_CODES[35] |
| 36 | VAL.MSRP_REJECTED | eventTypes.ts ALL_ERROR_CODES[36] |
| 37 | VAL.MARKUP_REJECTED | eventTypes.ts ALL_ERROR_CODES[37] |
| 38 | VAL.COST_SOURCE_INVALID | eventTypes.ts ALL_ERROR_CODES[38] |

## Appendix C: Complete 137-Row Acceptance Registry

| Test ID | Event | Expected Result | Rejection Code | Governing Section | Source Reference |
|---|---|---|---|---|---|
| AT-001 | E5 | Accept | --- | S.5.7, S.14.4 | traceabilityRegistry.ts:51 |
| AT-002 | E5 | Accept + CostPreservationResult | --- | S.4.5, S.14.4 | traceabilityRegistry.ts:52 |
| AT-003 | E5 | Accept + warning VAL.UNRESOLVED_COST_WARNING | --- | S.4.5, S.6.2 | traceabilityRegistry.ts:53 |
| AT-004 | E5 | Reject | VAL.SELLING_PRICE_REJECTED | S.4.2, S.6.4 | traceabilityRegistry.ts:54 |
| AT-005 | E5 | Reject | VAL.MSRP_REJECTED | S.4.2, S.6.4 | traceabilityRegistry.ts:55 |
| AT-006 | E5 | Reject | VAL.MARKUP_REJECTED | S.4.2, S.6.4 | traceabilityRegistry.ts:56 |
| AT-007 | E5 | Reject | VAL.COST_SOURCE_INVALID | S.4.2, S.6.4 | traceabilityRegistry.ts:57 |
| AT-008 | E5 | Reject | VAL.COST_SOURCE_INVALID | S.4.2, S.6.4 | traceabilityRegistry.ts:58 |
| AT-009 | E5 | Reject | VALIDATION.UNKNOWN_PAYLOAD_KEY | S.6.4 | traceabilityRegistry.ts:59 |
| AT-010 | E5 | Reject | VALIDATION.MISSING_REQUIRED_FIELD | S.6.4 | traceabilityRegistry.ts:60 |
| AT-011 | E5 | Reject | VALIDATION.INVALID_ENUM_VALUE | S.6.4 | traceabilityRegistry.ts:61 |
| AT-012 | E5 | Reject | VALIDATION.MISSING_DESTINATION_POSITION | S.14.4 | traceabilityRegistry.ts:62 |
| AT-013 | E5 | Reject | STATE.WRONG_TRANSITION | S.14.4 | traceabilityRegistry.ts:63 |
| AT-014 | E5 | Reject | VALIDATION.NON_POSITIVE_QUANTITY | S.5.7 | traceabilityRegistry.ts:64 |
| AT-015 | E5 | Reject | VALIDATION.NON_POSITIVE_QUANTITY | S.5.7 | traceabilityRegistry.ts:65 |
| AT-016 | E5 | Reject | UOM.NON_FINITE_QUANTITY | S.5.7 | traceabilityRegistry.ts:66 |
| AT-017 | E5 | Reject | VALIDATION.UNKNOWN_PAYLOAD_KEY | S.5.22, S.6.2 | traceabilityRegistry.ts:67 |
| AT-018 | E5 | Reject | VALIDATION.MISSING_REQUIRED_FIELD | S.5.7, S.6.2 | traceabilityRegistry.ts:68 |
| AT-019 | E5 | Reject | VALIDATION.INVALID_ENUM_VALUE | S.14.4 | traceabilityRegistry.ts:69 |
| AT-020 | E5 | Reject | VALIDATION.INVALID_ENUM_VALUE | S.14.4 | traceabilityRegistry.ts:70 |
| AT-021 | E1 | Accept | --- | S.14.1 | traceabilityRegistry.ts:73 |
| AT-022 | E2 | Accept | --- | S.14.1 | traceabilityRegistry.ts:74 |
| AT-023 | E3 | Accept | --- | S.14.1 | traceabilityRegistry.ts:75 |
| AT-024 | E4 | Accept | --- | S.14.1 | traceabilityRegistry.ts:76 |
| AT-025 | E8 | Accept | --- | S.14.6 | traceabilityRegistry.ts:79 |
| AT-026 | E9 | Accept | --- | S.14.7 | traceabilityRegistry.ts:80 |
| AT-027 | E8+E9 | Accept, company_owned unchanged | --- | See source | traceabilityRegistry.ts:81 |
| AT-028 | E8 | Reject | VALIDATION.MISSING_SOURCE_POSITION | S.14.6 | traceabilityRegistry.ts:82 |
| AT-029 | E8 | Reject | INV.NEGATIVE_RESULT | S.14.6 | traceabilityRegistry.ts:83 |
| AT-030 | E8 | Reject | INV.IDEMPOTENCY_DUPLICATE_CONTRACT | S.10.1 | traceabilityRegistry.ts:84 |
| AT-031 | E9 | Reject | TRANSFER.RECEIVE_EXCEEDS_DISPATCH | S.10.2 | traceabilityRegistry.ts:85 |
| AT-032 | E9 | Reject | TRANSFER.RECEIVE_WITHOUT_DISPATCH | S.10.2 | traceabilityRegistry.ts:86 |
| AT-033 | E9 | Reject | TRANSFER.DESTINATION_MISMATCH | S.10.2 | traceabilityRegistry.ts:87 |
| AT-034 | E9 | Reject | AUTHORIZATION.PARTIAL_TRANSFER_RECEIPT_DEFERRED_TO_2G1B | S.10.2 | traceabilityRegistry.ts:88 |
| AT-035 | E8 only | Accept | --- | S.14.6 | traceabilityRegistry.ts:89 |
| AT-036 | E6 | Accept | --- | S.14.5 | traceabilityRegistry.ts:92 |
| AT-037 | E6 | Accept | --- | S.14.5 | traceabilityRegistry.ts:93 |
| AT-038 | E6 | Accept, self not in blocking list | --- | S.10.5 | traceabilityRegistry.ts:94 |
| AT-039 | E6 | Reject | CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE | S.14.5, S.10.5 | traceabilityRegistry.ts:95 |
| AT-040 | E6 | Reject | CORRECTION.ORIGINAL_NOT_FOUND | S.5.8 | traceabilityRegistry.ts:96 |
| AT-041 | E6 | Reject | CORRECTION.ALREADY_REVERSED | See source | traceabilityRegistry.ts:97 |
| AT-042 | E6 | Reject | CORRECTION.REVERSAL_EXCEEDS_AVAILABLE | See source | traceabilityRegistry.ts:98 |
| AT-043 | E6 | Reject | INV.NEGATIVE_RESULT | See source | traceabilityRegistry.ts:99 |
| AT-044 | E6 | Reject | VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE | S.5.8 | traceabilityRegistry.ts:100 |
| AT-045 | E6 | Reject | VALIDATION.RECEIPT_ID_MISMATCH | S.5.8 | traceabilityRegistry.ts:101 |
| AT-046 | E25 | Accept | --- | S.14.2 | traceabilityRegistry.ts:104 |
| AT-047 | E26 | Accept | --- | S.14.8 | traceabilityRegistry.ts:107 |
| AT-048 | E26 | Accept | --- | S.14.8 | traceabilityRegistry.ts:108 |
| AT-049 | E26 | Reject | INV.NEGATIVE_RESULT | S.14.8 | traceabilityRegistry.ts:109 |
| AT-050 | E26 | Reject | VALIDATION.ZERO_DELTA_NOT_PERMITTED | S.5.12 | traceabilityRegistry.ts:110 |
| AT-051 | E28 | Accept | --- | S.14.10 | traceabilityRegistry.ts:113 |
| AT-052 | E28 | Accept | --- | S.14.10 | traceabilityRegistry.ts:114 |
| AT-053 | E28 | Reject | VALIDATION.NO_OP_RECLASSIFICATION | S.5.14 | traceabilityRegistry.ts:115 |
| AT-054 | E27 | Accept, delta sign opposite original | --- | S.14.9 | traceabilityRegistry.ts:118 |
| AT-055 | E27 | Accept, delta sign opposite original | --- | S.14.9 | traceabilityRegistry.ts:119 |
| AT-056 | E27 | Accept, E27 delta = -4 | --- | S.5.13 | traceabilityRegistry.ts:120 |
| AT-057 | E27 | Accept, E27 delta = +4 | --- | S.5.13 | traceabilityRegistry.ts:121 |
| AT-058 | E27 | Accept | --- | S.14.9 | traceabilityRegistry.ts:122 |
| AT-059 | E27 | Reject | CORRECTION.ORIGINAL_NOT_FOUND | S.5.13 | traceabilityRegistry.ts:123 |
| AT-060 | E27 | Reject | CORRECTION.ALREADY_REVERSED | See source | traceabilityRegistry.ts:124 |
| AT-061 | E27 | Reject | CORRECTION.REVERSAL_EXCEEDS_AVAILABLE | See source | traceabilityRegistry.ts:125 |
| AT-062 | E27 | Reject | INV.NEGATIVE_RESULT | See source | traceabilityRegistry.ts:126 |
| AT-063 | E27 | Reject | CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE | S.14.9, S.10.5 | traceabilityRegistry.ts:127 |
| AT-064 | E27 | Reject | VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE | S.5.13 | traceabilityRegistry.ts:128 |
| AT-065 | E32 | Accept | --- | S.14.11 | traceabilityRegistry.ts:131 |
| AT-066 | E32 | Reject | VALIDATION.OPEN_ISSUE_EXISTS_FOR_POSITION | S.5.15 | traceabilityRegistry.ts:132 |
| AT-067 | E33 | Accept | --- | S.14.12 | traceabilityRegistry.ts:135 |
| AT-068 | E33 | Accept | --- | S.14.12 | traceabilityRegistry.ts:136 |
| AT-069 | E33 | Reject | CONSUMPTION.EXCEEDS_OUTSTANDING_ISSUE | S.5.16 | traceabilityRegistry.ts:137 |
| AT-070 | E33 | Reject | VALIDATION.MISSING_ISSUE_PROVENANCE | S.5.16, S.14.12 | traceabilityRegistry.ts:138 |
| AT-071 | E33 | Reject | VALIDATION.MISSING_SOURCE_POSITION | S.14.12 | traceabilityRegistry.ts:139 |
| AT-072 | E33 | Reject | VAL.SELLING_PRICE_REJECTED | S.4.2, S.6.4 | traceabilityRegistry.ts:140 |
| AT-073 | E33 | Accept + warning | --- | S.4.5, S.6.2 | traceabilityRegistry.ts:141 |
| AT-074 | E33 | Accept, provenance.related_issue_event_id = issue.issue_even | --- | S.3.5, S.10.3, S.14.12 | traceabilityRegistry.ts:142 |
| AT-075 | E32+E33 | Accept, status closed | --- | S.3.6, S.14.12 | traceabilityRegistry.ts:145 |
| AT-076 | E32+E37 | Accept, status closed | --- | S.3.6, S.14.14 | traceabilityRegistry.ts:146 |
| AT-077 | E32+E33+E37 | Accept, status closed | --- | S.3.6 | traceabilityRegistry.ts:147 |
| AT-078 | E34 | Accept | --- | S.14.13 | traceabilityRegistry.ts:150 |
| AT-079 | E34 | Accept | --- | S.14.13 | traceabilityRegistry.ts:151 |
| AT-080 | E34 | Accept, self not in blocking list | --- | S.10.5 | traceabilityRegistry.ts:152 |
| AT-081 | E34 | Accept, status open | --- | S.14.13 | traceabilityRegistry.ts:153 |
| AT-082 | E34 | Accept, correct issue updated | --- | S.5.17, S.14.13 | traceabilityRegistry.ts:154 |
| AT-083 | E34 | Reject | CORRECTION.ORIGINAL_NOT_FOUND | S.5.17 | traceabilityRegistry.ts:155 |
| AT-084 | E34 | Reject | CORRECTION.ALREADY_REVERSED | See source | traceabilityRegistry.ts:156 |
| AT-085 | E34 | Reject | CORRECTION.REVERSAL_EXCEEDS_AVAILABLE | See source | traceabilityRegistry.ts:157 |
| AT-086 | E34 | Reject | VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE | S.5.17 | traceabilityRegistry.ts:158 |
| AT-087 | E34 | Reject | VALIDATION.ISSUE_PROVENANCE_MISMATCH | S.5.17, S.14.13 | traceabilityRegistry.ts:159 |
| AT-088 | E34 | Reject | VALIDATION.ISSUE_PROVENANCE_MISMATCH | S.5.17, S.14.13 | traceabilityRegistry.ts:160 |
| AT-089 | E34 | Reject | CORRECTION.REVERSAL_PROVENANCE_UNAVAILABLE | S.14.13 | traceabilityRegistry.ts:161 |
| AT-090 | E37 | Accept | --- | S.5.18, S.14.14 | traceabilityRegistry.ts:164 |
| AT-091 | E37 | Reject | VALIDATION.POSITION_MISMATCH | S.5.18, S.14.14 | traceabilityRegistry.ts:165 |
| AT-092 | E37 | Reject | VALIDATION.ITEM_MISMATCH | S.5.18, S.14.14 | traceabilityRegistry.ts:166 |
| AT-093 | E37 | Reject | INV.NEGATIVE_RESULT | S.5.18, S.14.14 | traceabilityRegistry.ts:167 |
| AT-094 | E37 | Reject | VALIDATION.ITEM_MISMATCH | S.5.18, S.14.14 | traceabilityRegistry.ts:168 |
| AT-095 | E37 | Reject | VALIDATION.POSITION_MISMATCH | S.5.18, S.14.14 | traceabilityRegistry.ts:169 |
| AT-096 | E37 | Accept | --- | S.14.14 | traceabilityRegistry.ts:170 |
| AT-097 | E37 | Reject | RETURN.EXCEEDS_OUTSTANDING_ISSUE | S.5.18 | traceabilityRegistry.ts:171 |
| AT-098 | E37 | Reject | CORRECTION.ORIGINAL_NOT_FOUND | S.5.18 | traceabilityRegistry.ts:172 |
| AT-099 | E37 | Reject | VALIDATION.AMBIGUOUS_ORIGINAL_REFERENCE | S.5.18 | traceabilityRegistry.ts:173 |
| AT-100 | E47 | Accept | --- | S.14.3 | traceabilityRegistry.ts:176 |
| AT-101 | E48 | Accept, no CostPreservationResult, no provenance | --- | S.14.15 | traceabilityRegistry.ts:179 |
| AT-102 | E48 | Accept, no CostPreservationResult, no provenance | --- | S.14.15 | traceabilityRegistry.ts:180 |
| AT-103 | E48 | Accept, recorded_operations empty of provenance | --- | S.14.15 | traceabilityRegistry.ts:181 |
| AT-104 | E10 | Reject | AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE | S.6.2 | traceabilityRegistry.ts:184 |
| AT-105 | E40 | Reject | AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE | S.6.2 | traceabilityRegistry.ts:185 |
| AT-106 | E7 | Reject | AUTHORIZATION.EVENT_OUT_OF_2G1A_SCOPE | S.6.2 | traceabilityRegistry.ts:186 |
| AT-107 | foo.bar | Reject | VALIDATION.UNKNOWN_EVENT_TYPE | S.6.2 | traceabilityRegistry.ts:187 |
| AT-108 | null | Reject | VALIDATION.NULL_EVENT_INPUT | S.6.2, S.6.5 | traceabilityRegistry.ts:188 |
| AT-109 | string | Reject | VALIDATION.NON_OBJECT_INPUT | S.6.2, S.6.5 | traceabilityRegistry.ts:189 |
| AT-110 | number | Reject | VALIDATION.NON_OBJECT_INPUT | S.6.2, S.6.5 | traceabilityRegistry.ts:190 |
| AT-111 | {} | Reject | VALIDATION.MISSING_REQUIRED_FIELD | S.6.2 | traceabilityRegistry.ts:191 |
| AT-112 | E5 repeat | Reject | INV.IDEMPOTENCY_DUPLICATE_CONTRACT | See source | traceabilityRegistry.ts:194 |
| AT-113 | validation | Accept | --- | See source | traceabilityRegistry.ts:197 |
| AT-114 | E26 crafted | Reject | RECONCILIATION.COMPANY_OWNED_MISMATCH | See source | traceabilityRegistry.ts:198 |
| AT-115 | validation | Accept | --- | See source | traceabilityRegistry.ts:199 |
| AT-116 | validation | Accept | --- | S.3.6 | traceabilityRegistry.ts:200 |
| AT-117 | any accept | Accept | --- | S.3.9 | traceabilityRegistry.ts:201 |
| AT-118 | any reject | Accept, revision same | --- | S.3.9 | traceabilityRegistry.ts:202 |
| AT-119 | multi-effect | Accept | --- | See source | traceabilityRegistry.ts:203 |
| AT-120 | multi-error | Accept | --- | See source | traceabilityRegistry.ts:204 |
| AT-121 | any accept | Accept, JSON-serializable, no self-insertion op | --- | S.3.7 | traceabilityRegistry.ts:205 |
| AT-122 | compile/runtime | Reject/Assert | --- | S.3.7, S.10.10 | traceabilityRegistry.ts:208 |
| AT-123 | compile | Accept | --- | See source | traceabilityRegistry.ts:209 |
| AT-124 | compile | Accept | --- | See source | traceabilityRegistry.ts:210 |
| AT-125 | compile | Accept | --- | See source | traceabilityRegistry.ts:211 |
| AT-126 | E5 | Accept (Stage C before Stage D) | --- | S.6.3 | traceabilityRegistry.ts:212 |
| AT-127 | E5 selling_price | Reject before DomainEvent construction | VAL.SELLING_PRICE_REJECTED | S.6.3 | traceabilityRegistry.ts:213 |
| AT-128 | E8 | Accept, blocks emitted at both positions | --- | S.10.5, S.14.6 | traceabilityRegistry.ts:216 |
| AT-129 | E9 | Accept, blocks emitted at both positions | --- | S.10.5, S.14.7 | traceabilityRegistry.ts:217 |
| AT-130 | E32 | Accept, blocks emitted at both positions, excluding newly-cr | --- | S.10.5, S.14.11 | traceabilityRegistry.ts:218 |
| AT-131 | E33 | Accept, blocks emitted, excluding newly-created provenance | --- | S.10.5, S.14.12 | traceabilityRegistry.ts:219 |
| AT-132 | all 38 codes | Accept, state unchanged for all 38 codes | --- | See source | traceabilityRegistry.ts:220 |
| AT-133 | E34 | Accept, blocks emitted at other eligible provenance records | --- | S.10.5, S.14.13 | traceabilityRegistry.ts:221 |
| AT-134 | E37 | Accept, blocks emitted at both positions | --- | S.10.5, S.14.14 | traceabilityRegistry.ts:222 |
| AT-135 | E48 (delta ≠ 0) | Accept, blocks emitted at affected position | --- | S.10.5, S.14.15 | traceabilityRegistry.ts:223 |
| AT-136 | E48 (delta = 0) | Accept, zero block ops | --- | S.10.5, S.14.15 | traceabilityRegistry.ts:224 |
| AT-137 | E48 (rejected) | Reject, zero block ops, state unchanged | VALIDATION.NON_POSITIVE_QUANTITY | S.10.5 | traceabilityRegistry.ts:225 |

## 25. Source Evidence Delivery Copies (23 URLs)

| # | File | Delivery URL |
|---|---|---|
| 1 | domainState.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/f18bb0ffd_domainState.ts |
| 2 | publicBoundary.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/46336a758_publicBoundary.ts |
| 3 | eventTypes.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/06e0ff190_eventTypes.ts |
| 4 | resultTypes.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/7ad617ad2_resultTypes.ts |
| 5 | compileCheck.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/3e472f3d9_compileCheck.ts |
| 6 | payloads.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/3b135fc45_payloads.ts |
| 7 | atomicRecordOps.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/b9b0317c2_atomicRecordOps.ts |
| 8 | unitOfMeasureRules.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/493281c8b_unitOfMeasureRules.ts |
| 9 | invariantValidators.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/e3a2b075e_invariantValidators.ts |
| 10 | valuationRules.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/a4f7b5762_valuationRules.ts |
| 11 | comparator.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/253539d38_comparator.ts |
| 12 | rawEventInput.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/525e3cfd0_rawEventInput.ts |
| 13 | index.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/8bd09c657_index.ts |
| 14 | testFixtures.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/a1eabcf5c_testFixtures.ts |
| 15 | testSuite.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/8a6b0967f_testSuite.ts |
| 16 | quantityEffects.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/d1620b6f9_quantityEffects.ts |
| 17 | classificationResults.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/248d9ccb3_classificationResults.ts |
| 18 | auditSuite.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/39ea47535_auditSuite.ts |
| 19 | auditFixtures.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/52694e8e6_auditFixtures.ts |
| 20 | traceabilityRegistry.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/722a5a5a6_traceabilityRegistry.ts |
| 21 | supplementalFiniteTests.ts | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/9dc3d1c13_supplementalFiniteTests.ts |
| 22 | stage_2g1a_receipt_validation.sql | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/214b00a8a_stage_2g1a_receipt_validation.sql |
| 23 | AUDIT_ADDENDUM_AT-071.md | https://base44.app/api/apps/69c3395b7c5b25bd9cda1d6e/files/mp/public/69c3395b7c5b25bd9cda1d6e/43a9cd681_AUDIT_ADDENDUM_AT-071.md |

## 26. Authorization Boundaries

| Decision | Status |
|---|---|
| Owner must explicitly approve this contract's exact path, contents, and SHA-256 hash | Pending owner approval |
| After approval, implementation correction is authorized | Pending -- contingent on contract approval |
| After approval, local compilation and validation are authorized | Pending -- contingent on contract approval |
| External database execution remains separately gated | Separately gated (Section 22) |
| PostgreSQL or Supabase execution remains separately gated | Separately gated (Section 22) |
| Production changes remain separately gated | Separately gated (Section 22) |
| Stage 2G1-B implementation or activation remains separately gated | Separately gated (Section 23) |
| BT-042 remains separately gated | Separately gated (Section 24) |

## 27. Final Provisions

This contract prospectively replaces the unrecovered original Stage 2G1-A authorization contract. It is not represented as the original contract and does not retroactively authorize prior work.

Stage 2G1-A remains pending owner approval until the owner explicitly approves this contract's exact path, contents, and SHA-256 hash. Upon approval, implementation correction and local validation are authorized. External database execution, production changes, Stage 2G1-B activation, and BT-042 remain separately gated.

