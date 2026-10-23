# STAGE 2E — SCHEMA AND ARCHITECTURE RECONCILIATION REPORT

**Status:** Reconciliation complete — awaiting owner review
**Date:** 2026-08-03

---

## 1. SCHEMA VERIFICATION

### Entities Modified (10)

| Entity | Changes | Fields Added | Enums Changed |
|---|---|---|---|
| PurchaseOrder | Removed `pending_approval` from status; added `lvc_workflow_status`; added project snapshot; added line-sync fields; expanded sync status | `lvc_workflow_status`, `servicetitan_project_id`, `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at` | `status` (removed `pending_approval`), `servicetitan_sync_status` (added `deferred`, `failed`), `lvc_workflow_status` (new enum) |
| PurchaseOrderLine | Expanded sync status | — | `servicetitan_sync_status` (added `deferred`, `failed`) |
| Receipt | Added `lvc_workflow_status`; added line-sync fields; expanded sync status | `lvc_workflow_status`, `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at` | `servicetitan_sync_status` (added `deferred`, `failed`), `lvc_workflow_status` (new enum) |
| ReceiptLine | Expanded sync status | — | `servicetitan_sync_status` (added `deferred`, `failed`) |
| Bill | Added `lvc_workflow_status`; added line-sync fields; expanded sync status; kept `pending_approval` provisional | `lvc_workflow_status`, `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at` | `servicetitan_sync_status` (added `deferred`, `failed`), `lvc_workflow_status` (new enum) |
| BillLine | Expanded sync status | — | `servicetitan_sync_status` (added `deferred`, `failed`) |
| WarehouseTransfer | Removed `approved`, `picked`, `staged`, `loaded` from status; added `lvc_workflow_status`; added line-sync fields; expanded sync status | `lvc_workflow_status`, `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at` | `status` (removed 4 LVC values), `servicetitan_sync_status` (added `deferred`, `failed`), `lvc_workflow_status` (new enum) |
| WarehouseTransferLine | Expanded sync status | — | `servicetitan_sync_status` (added `deferred`, `failed`) |
| InventoryAdjustment | Expanded sync status | — | `servicetitan_sync_status` (added `deferred`, `failed`) |
| InventoryTransaction | Added receipt/transfer-line traceability fields; added `receipt` to source_document_type | `receipt_id`, `receipt_line_id`, `warehouse_transfer_line_id` | `source_document_type` (added `receipt`) |

### Watermark Entities Modified (4)

| Watermark Entity | Counters Added |
|---|---|
| PurchaseOrderSyncWatermark | `po_deferred_missing_warehouse`, `po_headers_lines_pending`, `po_line_sync_failures` |
| ReceiptSyncWatermark | `receipts_deferred_missing_warehouse`, `receipt_headers_lines_pending`, `receipt_line_sync_failures` |
| BillSyncWatermark | `bill_headers_lines_pending`, `bill_line_sync_failures`, `bill_receipt_link_deferred` |
| TransferSyncWatermark | `transfer_headers_lines_pending`, `transfer_line_sync_failures` |

### New Entity Created (1)

| Entity | Purpose |
|---|---|
| BillReceiptLink | Junction entity for multi-receipt bill model. Composite identity: `servicetitan_bill_id` + `servicetitan_receipt_id`. Prevents duplicate link rows via `relationship_key`. Supports one Bill → many Receipts and one Receipt → many Bills. |

### Fields Added Summary

| Field | Entity | Type | Purpose |
|---|---|---|---|
| `lvc_workflow_status` | PurchaseOrder | enum (11 values) | LVC procurement workflow (draft, awaiting_manager_approval, approved_for_send, ...) |
| `lvc_workflow_status` | Receipt | enum (9 values) | LVC physical verification workflow (awaiting_physical_verification, verification_in_progress, ...) |
| `lvc_workflow_status` | Bill | enum (10 values) | LVC AP workflow (awaiting_receipt_verification, ready_for_three_way_match, ...) |
| `lvc_workflow_status` | WarehouseTransfer | enum (16 values) | LVC transfer workflow (requested, picking, picked, staged, loaded, ...) |
| `servicetitan_project_id` | PurchaseOrder | string | ST Project ID snapshot — display/audit only, no dependency |
| `lines_sync_status` | PurchaseOrder, Receipt, Bill, WarehouseTransfer | enum (5 values) | Line sync completeness: not_started, pending, partial, complete, failed |
| `lines_expected_count` | PurchaseOrder, Receipt, Bill, WarehouseTransfer | number | Lines expected from source |
| `lines_synced_count` | PurchaseOrder, Receipt, Bill, WarehouseTransfer | number | Lines successfully synced |
| `lines_last_sync_at` | PurchaseOrder, Receipt, Bill, WarehouseTransfer | date-time | Last line sync attempt timestamp |
| `receipt_id` | InventoryTransaction | string | Ledger → Receipt traceability |
| `receipt_line_id` | InventoryTransaction | string | Ledger → ReceiptLine traceability |
| `warehouse_transfer_line_id` | InventoryTransaction | string | Ledger → WarehouseTransferLine traceability |

### Enums Changed Summary

| Entity | Field | Change |
|---|---|---|
| PurchaseOrder | `status` | Removed `pending_approval` — moved to LVC workflow |
| WarehouseTransfer | `status` | Removed `approved`, `picked`, `staged`, `loaded` — moved to `lvc_workflow_status` |
| All 10 Procurement Entities (9 modified + BillReceiptLink new) | `servicetitan_sync_status` | Added `deferred` and `failed` |
| InventoryTransaction | `source_document_type` | Added `receipt` |
| Bill | `status` | `pending_approval` kept as PROVISIONAL pending API verification |

### Required Fields Changed

| Entity | Required Fields | Change |
|---|---|---|
| PurchaseOrder | `vendor_id`, `warehouse_location_id`, `status` | Unchanged (no new required fields added) |
| BillReceiptLink | `relationship_key`, `bill_id`, `servicetitan_bill_id`, `receipt_id`, `servicetitan_receipt_id` | New — all five required for composite identity |

### Data Integrity Verification

| Check | Result |
|---|---|
| No existing data deleted | PASS — all changes are additive (new fields, new enum values, new entity) |
| No live records imported | PASS — no sync activated |
| No existing required fields removed | PASS — all existing required fields preserved |
| New fields are optional (no new required on existing entities) | PASS — all new fields on existing entities have defaults |
| Enum values only added, not removed (except intentional separations) | PASS — `pending_approval` removed from PO status (moved to LVC); `approved/picked/staged/loaded` removed from Transfer status (moved to LVC) |

---

## 1B. ARCHITECTURAL GOVERNANCE VERIFICATION

| Governance Principle | Documented? | Location |
|---|---|---|
| ServiceTitan is external procurement/accounting source | YES | ARCHITECTURE.md §0.1 |
| LVC OS is operational system of workflow record | YES | ARCHITECTURE.md §0.1 |
| Sync may update only ST-owned fields | YES | ARCHITECTURE.md §0.1 |
| LVC-owned fields never overwritten by sync | YES | ARCHITECTURE.md §0.1 |
| Warehouse operational execution is LVC-owned | YES | ARCHITECTURE.md §0.2 |
| Inventory ledger movements remain LVC-authoritative | YES | ARCHITECTURE.md §0.2 |
| Full list of LVC-owned data categories documented | YES | ARCHITECTURE.md §0.1 (29 categories) |
| Full list of warehouse processes documented | YES | ARCHITECTURE.md §0.2 (31 processes) |

---

## 2. CONSISTENCY VERIFICATION

### Source lifecycle status is separate from LVC workflow status

| Entity | ST-Owned Status Field | LVC Workflow Status Field | Separate? |
|---|---|---|---|
| PurchaseOrder | `status` (8 values: draft, approved, sent, vendor_confirmed, partially_received, received, closed, cancelled) | `lvc_workflow_status` (11 values) | YES |
| Receipt | `status` (4 values: pending, partially_received, received, voided) | `lvc_workflow_status` (9 values) | YES |
| Bill | `status` (7 values: draft, pending_approval*, approved, partially_paid, paid, voided, disputed) | `lvc_workflow_status` (10 values) | YES |
| WarehouseTransfer | `status` (7 values: pending, dispatched, in_transit, partially_received, received, completed, cancelled) | `lvc_workflow_status` (16 values) | YES |
| InventoryAdjustment | `status` (4 values: pending, approved, rejected, posted) | `investigation_status` (4 values) — pre-existing | YES |

\* `pending_approval` in Bill.status is PROVISIONAL — to be confirmed or removed during API verification.

### LVC workflow fields are never ST-owned

| Entity | `lvc_workflow_status` Description | ST Overwrites It? |
|---|---|---|
| PurchaseOrder | "LVC-owned internal procurement workflow status. NEVER overwritten by ServiceTitan synchronization." | NO |
| Receipt | "LVC-owned physical verification workflow status. NEVER overwritten by ServiceTitan synchronization." | NO |
| Bill | "LVC-owned AP workflow status. NEVER overwritten by ServiceTitan synchronization." | NO |
| WarehouseTransfer | "LVC-owned internal transfer workflow status. NEVER overwritten by ServiceTitan synchronization." | NO |

### servicetitan_sync_status supports deferred and failed

| Entity | Sync Status Enum | `deferred` Present? | `failed` Present? |
|---|---|---|---|
| PurchaseOrder | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| PurchaseOrderLine | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| Receipt | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| ReceiptLine | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| Bill | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| BillLine | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| WarehouseTransfer | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| WarehouseTransferLine | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| InventoryAdjustment | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |
| BillReceiptLink | synced, pending, conflict, **deferred**, **failed**, deleted | YES | YES |

### Receipt ledger traceability is complete

| InventoryTransaction Field | Purpose | Present? |
|---|---|---|
| `receipt_id` | Links ledger entry to Receipt header | YES |
| `receipt_line_id` | Links ledger entry to specific ReceiptLine | YES |
| `source_document_type = 'receipt'` | Enum value for receipt-posted ledger entries | YES |

**Linkage rules:**
- Receipt posting: `source_document_type = 'receipt'`, `source_document_id = Receipt.id`, `receipt_id = Receipt.id`, `receipt_line_id = ReceiptLine.id` (when line-specific)
- Sync does NOT create ledger entries — these fields are populated only by LVC workflow

### Transfer-line ledger traceability is complete

| InventoryTransaction Field | Purpose | Present? |
|---|---|---|
| `warehouse_transfer_id` | Links ledger entry to Transfer header (pre-existing) | YES |
| `warehouse_transfer_line_id` | Links ledger entry to specific TransferLine | YES |

**Linkage rules:**
- Transfer posting: `warehouse_transfer_id = WarehouseTransfer.id`, `warehouse_transfer_line_id = WarehouseTransferLine.id` (when line-specific)
- Sync does NOT create ledger entries — these fields are populated only by LVC workflow

### Multi-receipt bills are supported

| Feature | Implementation | Present? |
|---|---|---|
| BillReceiptLink junction entity | `BillReceiptLink.jsonc` with composite identity | YES |
| One Bill → many Receipts | `BillReceiptLink` records per pair | YES |
| One Receipt → many Bills | `BillReceiptLink` records per pair | YES |
| Duplicate prevention | `relationship_key = servicetitan_bill_id + servicetitan_receipt_id` | YES |
| Primary receipt snapshot on Bill | `Bill.receipt_id` / `Bill.servicetitan_receipt_id` retained for display | YES |

### Headers can exist while lines remain pending

| Entity | `lines_sync_status` Field | `lines_expected_count` | `lines_synced_count` | `lines_last_sync_at` |
|---|---|---|---|---|
| PurchaseOrder | YES | YES | YES | YES |
| Receipt | YES | YES | YES | YES |
| Bill | YES | YES | YES | YES |
| WarehouseTransfer | YES | YES | YES | YES |

**Header-first rule:** Header identity and valid header data are sufficient to create the header. A line-fetch or line-dependency failure does NOT delete or invalidate the header. The header remains eligible for line retry. `lines_sync_status` tracks completeness: `not_started` → `pending` → `partial` → `complete` (or `failed`).

### Transfer receipt remains provisional pending API verification

| Decision | Status |
|---|---|
| Transfer receiving treated as WarehouseTransfer lifecycle state (not separate entity) | PROVISIONAL |
| If ST exposes a separate transfer-receipt entity, stop and return API evidence | DOCUMENTED |
| No separate TransferReceipt entity created | CONFIRMED |

### Projects remain out of synchronization scope

| Feature | Status |
|---|---|
| `servicetitan_project_id` on PurchaseOrder | Display/audit snapshot only |
| Project dependency created? | NO |
| Project entity created? | NO |
| Project sync enabled? | NO |
| PO blocked if project unresolved? | NO |

### Warehouse operational execution remains LVC-owned

| Feature | Status |
|---|---|
| Architectural governance documented | YES — ARCHITECTURE.md §0.2 |
| Sync imports procurement documents only | YES |
| Operational execution controlled by LVC OS | YES |
| Picking, staging, loading, receiving = LVC-owned | YES |
| Inventory counts, cycle counts, variance investigations = LVC-owned | YES |
| Exception resolution, manager review = LVC-owned | YES |
| Sync never overwrites operational workflow decisions | YES |
| Inventory ledger movements remain LVC-authoritative | YES — unless owner-approved reconciliation |

---

## 3. NO IMPLEMENTATION VERIFICATION

| Check | Status |
|---|---|
| No adapters created | CONFIRMED |
| No domain services created | CONFIRMED |
| No procurement entry functions created | CONFIRMED |
| No API endpoints verified | CONFIRMED |
| No watermarks activated | CONFIRMED |
| No records imported | CONFIRMED |
| No schedulers enabled | CONFIRMED |
| No dry runs executed | CONFIRMED |
| No controlled imports executed | CONFIRMED |
| No ledger records posted | CONFIRMED |
| No live API calls made | CONFIRMED |

---

## 4. PREVIOUSLY DOCUMENTED INCONSISTENCIES — RESOLUTION STATUS

| # | Previous Inconsistency | Resolution | Status |
|---|---|---|---|
| 1 | `pending_approval` in PurchaseOrder.status is an LVC state in an ST-owned field | Removed from `status` enum; LVC workflow tracked in new `lvc_workflow_status` field | RESOLVED |
| 2 | `pending_approval` in Bill.status — may be ST or LVC | Kept as PROVISIONAL with documentation note; API verification will confirm | PROVISIONAL |
| 3 | WarehouseTransfer.status mixes ST and LVC states | Removed `approved`, `picked`, `staged`, `loaded` from `status`; added `lvc_workflow_status` for LVC states | RESOLVED |
| 4 | `servicetitan_sync_status` missing `deferred` and `failed` | Added both values to all 9 procurement entities + BillReceiptLink | RESOLVED |
| 5 | Receipt has no dedicated `lvc_workflow_status` field | Added `lvc_workflow_status` with 9-value enum | RESOLVED |

---

## 5. PREVIOUSLY DOCUMENTED SCHEMA GAPS — RESOLUTION STATUS

| # | Previous Gap | Resolution | Status |
|---|---|---|---|
| G1 | InventoryTransaction missing `receipt_id` | Added field | RESOLVED |
| G2 | InventoryTransaction missing `receipt_line_id` | Added field | RESOLVED |
| G3 | InventoryTransaction missing `warehouse_transfer_line_id` | Added field | RESOLVED |
| G4 | InventoryTransaction `source_document_type` missing `receipt` | Added enum value | RESOLVED |
| G5 | PurchaseOrder missing `servicetitan_project_id` | Added as optional display-only snapshot | RESOLVED |
| G6 | WarehouseLocation `servicetitan_warehouse_id` verification | Deferred to API verification phase | DEFERRED |
| G7 | Missing watermark counters | Added all requested counters to all 4 watermark entities | RESOLVED |

---

## 6. PREVIOUSLY DOCUMENTED OWNER DECISIONS — RESOLUTION STATUS

| # | Previous Decision | Resolution | Status |
|---|---|---|---|
| D1 | Should `pending_approval` remain in PO.status? | Removed; moved to `lvc_workflow_status` | RESOLVED |
| D2 | Does ST use `pending_approval` as a Bill status? | Kept provisional; API verification will confirm | PROVISIONAL |
| D3 | Should WarehouseTransfer have separate `lvc_workflow_status`? | Added field; removed LVC states from `status` | RESOLVED |
| D4 | Should `deferred`/`failed` be added to all sync status enums? | Added to all 9 procurement entities + BillReceiptLink | RESOLVED |
| D5 | Should Receipt have `lvc_workflow_status`? | Added with 9-value enum | RESOLVED |
| D6 | Should InventoryTransaction get `receipt_id`/`receipt_line_id`? | Added both + `warehouse_transfer_line_id` | RESOLVED |
| D7 | Should `receipt` be added to `source_document_type`? | Added to enum | RESOLVED |
| D8 | Should `servicetitan_project_id` be added to PO? | Added as optional display-only snapshot | RESOLVED |
| D9 | Is Transfer Receipt a separate ST entity? | Provisional: treated as WarehouseTransfer lifecycle state; API verification will confirm | PROVISIONAL |
| D10 | How should multi-receipt bills be modeled? | Created BillReceiptLink junction entity with composite identity | RESOLVED |

---

## 7. FILES CREATED OR MODIFIED

### Entity Schemas Modified (10)

| File | Changes |
|---|---|
| `base44/entities/PurchaseOrder.jsonc` | Removed `pending_approval` from status; added `lvc_workflow_status`; added `servicetitan_project_id`; added `lines_sync_status` + 3 line-count fields; expanded `servicetitan_sync_status` |
| `base44/entities/PurchaseOrderLine.jsonc` | Expanded `servicetitan_sync_status` |
| `base44/entities/Receipt.jsonc` | Added `lvc_workflow_status`; added `lines_sync_status` + 3 line-count fields; expanded `servicetitan_sync_status` |
| `base44/entities/ReceiptLine.jsonc` | Expanded `servicetitan_sync_status` |
| `base44/entities/Bill.jsonc` | Added `lvc_workflow_status`; added `lines_sync_status` + 3 line-count fields; expanded `servicetitan_sync_status`; kept `pending_approval` provisional |
| `base44/entities/BillLine.jsonc` | Expanded `servicetitan_sync_status` |
| `base44/entities/WarehouseTransfer.jsonc` | Removed 4 LVC states from `status`; added `lvc_workflow_status`; added `lines_sync_status` + 3 line-count fields; expanded `servicetitan_sync_status` |
| `base44/entities/WarehouseTransferLine.jsonc` | Expanded `servicetitan_sync_status` |
| `base44/entities/InventoryAdjustment.jsonc` | Expanded `servicetitan_sync_status` |
| `base44/entities/InventoryTransaction.jsonc` | Added `receipt_id`, `receipt_line_id`, `warehouse_transfer_line_id`; added `receipt` to `source_document_type` enum |

### Entity Schemas Created (1)

| File | Purpose |
|---|---|
| `base44/entities/BillReceiptLink.jsonc` | Multi-receipt bill junction entity with composite identity |

### Watermark Schemas Modified (4)

| File | Counters Added |
|---|---|
| `base44/entities/PurchaseOrderSyncWatermark.jsonc` | `po_deferred_missing_warehouse`, `po_headers_lines_pending`, `po_line_sync_failures` |
| `base44/entities/ReceiptSyncWatermark.jsonc` | `receipts_deferred_missing_warehouse`, `receipt_headers_lines_pending`, `receipt_line_sync_failures` |
| `base44/entities/BillSyncWatermark.jsonc` | `bill_headers_lines_pending`, `bill_line_sync_failures`, `bill_receipt_link_deferred` |
| `base44/entities/TransferSyncWatermark.jsonc` | `transfer_headers_lines_pending`, `transfer_line_sync_failures` |

### Architecture Documents Updated (5)

| File | Updates |
|---|---|
| `base44/shared/stSync/STAGE_2E_PROCUREMENT_ARCHITECTURE.md` | Added architectural governance (§0); added header-first synchronization rule; added BillReceiptLink; updated entity list; added project snapshot; updated watermark counters |
| `base44/shared/stSync/STAGE_2E_PROCUREMENT_ERD.md` | Added BillReceiptLink to ER diagram and tables; resolved [GAP] markers; updated ambiguous relationships as resolved |
| `base44/shared/stSync/STAGE_2E_PROCUREMENT_LIFECYCLE.md` | Removed resolved inconsistency notes; referenced actual `lvc_workflow_status` field names |
| `base44/shared/stSync/STAGE_2E_PROCUREMENT_SYNC_SEQUENCES.md` | Added header-first line synchronization; added BillReceiptLink to bill sequence; added `lines_sync_status` tracking |
| `base44/shared/stSync/STAGE_2E_CROSS_DOC_REVIEW.md` | Replaced with this reconciliation report |

---

## 8. REMAINING PROVISIONAL DECISIONS (2)

| Decision | Status | Action Required |
|---|---|---|
| Bill `pending_approval` status | PROVISIONAL — may or may not be a real ST value | API verification must confirm actual ST Bill status values. If not used by ST, remove from enum. |
| Transfer Receipt modeling | PROVISIONAL — treated as WarehouseTransfer lifecycle state | API verification must confirm whether ST exposes a separate transfer-receipt entity with its own ID. If so, create a new entity and stop forcing it into WarehouseTransfer. |

---

STAGE 2E SCHEMA AND ARCHITECTURE RECONCILIATION

READY FOR OWNER REVIEW