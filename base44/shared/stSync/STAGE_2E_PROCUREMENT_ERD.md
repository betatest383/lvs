# STAGE 2E — PROCUREMENT ENTITY RELATIONSHIP DIAGRAM

**Status:** Architecture deliverable — awaiting owner review
**Date:** 2026-08-03
**Predecessor:** Stage 2E Procurement Architecture Foundation

---

## 1. MERMAID ER DIAGRAM

```mermaid
erDiagram
    Vendor ||--o{ PurchaseOrder : "supplies (servicetitan_vendor_id)"
    Vendor ||--o{ Receipt : "fulfills for (servicetitan_vendor_id)"
    Vendor ||--o{ Bill : "owes (servicetitan_vendor_id)"
    Vendor ||--o{ MaterialVendor : "supplies (servicetitan_vendor_id)"

    InventoryMaster ||--o{ PurchaseOrderLine : "ordered (servicetitan_material_id)"
    InventoryMaster ||--o{ ReceiptLine : "received (servicetitan_material_id)"
    InventoryMaster ||--o{ BillLine : "billed (servicetitan_material_id)"
    InventoryMaster ||--o{ WarehouseTransferLine : "transferred (servicetitan_material_id)"
    InventoryMaster ||--o{ InventoryAdjustment : "adjusted (servicetitan_material_id)"
    InventoryMaster ||--o{ MaterialVendor : "sourced by (servicetitan_material_id)"

    WarehouseLocation ||--o{ PurchaseOrder : "ship-to (servicetitan_warehouse_id)"
    WarehouseLocation ||--o{ Receipt : "received at (servicetitan_warehouse_id)"
    WarehouseLocation ||--o{ WarehouseTransfer : "source (servicetitan_source_warehouse_id)"
    WarehouseLocation ||--o{ WarehouseTransfer : "destination (servicetitan_destination_warehouse_id)"
    WarehouseLocation ||--o{ InventoryAdjustment : "at (servicetitan_warehouse_id)"

    PurchaseOrder ||--|{ PurchaseOrderLine : "contains"
    PurchaseOrder ||--o{ Receipt : "fulfilled by (servicetitan_purchase_order_id)"
    PurchaseOrder ||--o{ Bill : "billed by (servicetitan_purchase_order_id)"

    PurchaseOrderLine ||--o{ ReceiptLine : "received against (servicetitan_po_line_id)"
    PurchaseOrderLine ||--o{ BillLine : "billed against (servicetitan_po_line_id)"

    Receipt ||--|{ ReceiptLine : "contains"
    Receipt ||--o{ Bill : "bills (servicetitan_receipt_id)"

    Bill ||--o{ BillReceiptLink : "links (servicetitan_bill_id)"
    Receipt ||--o{ BillReceiptLink : "links (servicetitan_receipt_id)"

    ReceiptLine ||--o{ BillLine : "bills (servicetitan_receipt_line_id)"

    Bill ||--|{ BillLine : "contains"

    WarehouseTransfer ||--|{ WarehouseTransferLine : "contains"

    InventoryTransaction }o--o| Receipt : "ledger from (receipt_id)"
    InventoryTransaction }o--o| ReceiptLine : "ledger from (receipt_line_id)"
    InventoryTransaction }o--o| WarehouseTransfer : "ledger from (warehouse_transfer_id)"
    InventoryTransaction }o--o| WarehouseTransferLine : "ledger from (warehouse_transfer_line_id)"
    InventoryTransaction }o--o| InventoryAdjustment : "ledger from (source_document_id)"

    Job ||--o{ WarehouseTransfer : "fulfills (job_id)"

    PurchaseOrder {
        string id PK
        string po_number LVC_owned
        string servicetitan_purchase_order_id IMMUTABLE
        string servicetitan_vendor_id FK
        string servicetitan_warehouse_id FK
        string status ST_owned
    }

    PurchaseOrderLine {
        string id PK
        string purchase_order_id FK
        string servicetitan_po_line_id IMMUTABLE
        string servicetitan_material_id FK
        string servicetitan_purchase_order_id FK
        number quantity_ordered ST_owned
    }

    Receipt {
        string id PK
        string receipt_number LVC_owned
        string servicetitan_receipt_id IMMUTABLE
        string servicetitan_purchase_order_id FK
        string servicetitan_vendor_id FK
        string servicetitan_warehouse_id FK
        string status ST_owned
        string ledger_transaction_id LVC_owned
    }

    ReceiptLine {
        string id PK
        string receipt_id FK
        string servicetitan_receipt_line_id IMMUTABLE
        string servicetitan_receipt_id FK
        string servicetitan_po_line_id FK
        string servicetitan_material_id FK
        number quantity_received ST_owned
    }

    Bill {
        string id PK
        string bill_number LVC_owned
        string servicetitan_bill_id IMMUTABLE
        string servicetitan_purchase_order_id FK
        string servicetitan_receipt_id FK
        string servicetitan_vendor_id FK
        string status ST_owned
        string lvc_workflow_status LVC_owned
    }

    BillReceiptLink {
        string id PK
        string relationship_key UNIQUE
        string bill_id FK
        string servicetitan_bill_id IMMUTABLE
        string receipt_id FK
        string servicetitan_receipt_id IMMUTABLE
        number allocated_amount ST_owned
        number allocated_quantity ST_owned
    }

    BillLine {
        string id PK
        string bill_id FK
        string servicetitan_bill_line_id IMMUTABLE
        string servicetitan_po_line_id FK
        string servicetitan_receipt_line_id FK
        string servicetitan_material_id FK
        number quantity_billed ST_owned
    }

    WarehouseTransfer {
        string id PK
        string transfer_number LVC_owned
        string servicetitan_transfer_id IMMUTABLE
        string servicetitan_source_warehouse_id FK
        string servicetitan_destination_warehouse_id FK
        string status ST_owned
        string ledger_transaction_id LVC_owned
    }

    WarehouseTransferLine {
        string id PK
        string warehouse_transfer_id FK
        string servicetitan_transfer_line_id IMMUTABLE
        string servicetitan_material_id FK
        number quantity_dispatched ST_owned
        number quantity_received ST_owned
    }

    InventoryAdjustment {
        string id PK
        string adjustment_number LVC_owned
        string servicetitan_adjustment_id IMMUTABLE
        string servicetitan_material_id FK
        string servicetitan_warehouse_id FK
        number quantity_adjustment ST_owned
        string ledger_transaction_id LVC_owned
    }

    InventoryTransaction {
        string id PK
        string transaction_id LVC_owned
        string transaction_type LVC_owned
        string source_document_type LVC_owned
        string source_document_id LVC_owned
        string purchase_order_id LVC_owned
        string warehouse_transfer_id LVC_owned
        string inventory_master_id FK
    }

    Vendor {
        string id PK
        string servicetitan_vendor_id IMMUTABLE
        string name ST_owned
    }

    InventoryMaster {
        string id PK
        string servicetitan_material_id IMMUTABLE
        string sku ST_owned
        string item_name ST_owned
    }

    MaterialVendor {
        string id PK
        string relationship_key UNIQUE
        string inventory_master_id FK
        string servicetitan_material_id FK
        string servicetitan_vendor_id FK
    }

    WarehouseLocation {
        string id PK
        string servicetitan_warehouse_id IMMUTABLE
        string name LVC_owned
    }

    Job {
        string id PK
        string servicetitan_job_id IMMUTABLE
        string job_number LVC_owned
    }
```

---

## 2. PLAIN-TEXT RELATIONSHIP TABLE

| # | Parent Entity | Child Entity | Cardinality | FK Direction | Resolution Field | Required |
|---|---|---|---|---|---|---|
| 1 | Vendor | PurchaseOrder | 1:N | PO.servicetitan_vendor_id → Vendor | `servicetitan_vendor_id` | YES |
| 2 | Vendor | Receipt | 1:N | Receipt.servicetitan_vendor_id → Vendor | `servicetitan_vendor_id` | YES |
| 3 | Vendor | Bill | 1:N | Bill.servicetitan_vendor_id → Vendor | `servicetitan_vendor_id` | YES |
| 4 | Vendor | MaterialVendor | 1:N | MV.servicetitan_vendor_id → Vendor | `servicetitan_vendor_id` | YES |
| 5 | InventoryMaster | PurchaseOrderLine | 1:N | POL.servicetitan_material_id → IM | `servicetitan_material_id` | YES |
| 6 | InventoryMaster | ReceiptLine | 1:N | RL.servicetitan_material_id → IM | `servicetitan_material_id` | YES |
| 7 | InventoryMaster | BillLine | 1:N | BL.servicetitan_material_id → IM | `servicetitan_material_id` | YES |
| 8 | InventoryMaster | WarehouseTransferLine | 1:N | WTL.servicetitan_material_id → IM | `servicetitan_material_id` | YES |
| 9 | InventoryMaster | InventoryAdjustment | 1:N | IA.servicetitan_material_id → IM | `servicetitan_material_id` | YES |
| 10 | WarehouseLocation | PurchaseOrder | 1:N | PO.servicetitan_warehouse_id → WL | `servicetitan_warehouse_id` | YES |
| 11 | WarehouseLocation | Receipt | 1:N | R.servicetitan_warehouse_id → WL | `servicetitan_warehouse_id` | YES |
| 12 | WarehouseLocation | WarehouseTransfer (source) | 1:N | WT.servicetitan_source_warehouse_id → WL | `servicetitan_source_warehouse_id` | YES |
| 13 | WarehouseLocation | WarehouseTransfer (dest) | 1:N | WT.servicetitan_destination_warehouse_id → WL | `servicetitan_destination_warehouse_id` | YES |
| 14 | WarehouseLocation | InventoryAdjustment | 1:N | IA.servicetitan_warehouse_id → WL | `servicetitan_warehouse_id` | YES |
| 15 | PurchaseOrder | PurchaseOrderLine | 1:N | POL.servicetitan_purchase_order_id → PO | `servicetitan_purchase_order_id` | YES |
| 16 | PurchaseOrder | Receipt | 1:N | R.servicetitan_purchase_order_id → PO | `servicetitan_purchase_order_id` | NO* |
| 17 | PurchaseOrder | Bill | 1:N | B.servicetitan_purchase_order_id → PO | `servicetitan_purchase_order_id` | NO* |
| 18 | PurchaseOrderLine | ReceiptLine | 1:N | RL.servicetitan_po_line_id → POL | `servicetitan_po_line_id` | NO* |
| 19 | PurchaseOrderLine | BillLine | 1:N | BL.servicetitan_po_line_id → POL | `servicetitan_po_line_id` | NO* |
| 20 | Receipt | ReceiptLine | 1:N | RL.servicetitan_receipt_id → R | `servicetitan_receipt_id` | YES |
| 21 | Receipt | Bill | N:1 | B.servicetitan_receipt_id → R | `servicetitan_receipt_id` | NO* |
| 22 | ReceiptLine | BillLine | 1:N | BL.servicetitan_receipt_line_id → RL | `servicetitan_receipt_line_id` | NO* |
| 23 | Bill | BillLine | 1:N | BL.servicetitan_bill_id → B | `servicetitan_bill_id` | YES |
| 24 | WarehouseTransfer | WarehouseTransferLine | 1:N | WTL.servicetitan_transfer_id → WT | `servicetitan_transfer_id` | YES |
| 25 | Job | WarehouseTransfer | 1:N | WT.job_id → Job | `job_id` (LVC-owned) | NO |
| 26 | InventoryTransaction | Receipt | N:1 | IT.source_document_id → R | `source_document_type='receipt'` | NO [GAP] |
| 27 | InventoryTransaction | WarehouseTransfer | N:1 | IT.warehouse_transfer_id → WT | `warehouse_transfer_id` | NO |
| 28 | InventoryTransaction | InventoryAdjustment | N:1 | IT.source_document_id → IA | `source_document_type='inventory_adjustment'` | NO |
| 29 | Bill | BillReceiptLink | 1:N | BRL.servicetitan_bill_id → B | `servicetitan_bill_id` | YES |
| 30 | Receipt | BillReceiptLink | 1:N | BRL.servicetitan_receipt_id → R | `servicetitan_receipt_id` | YES |

**\*** = Optional relationship (may be null for non-PO receipts, non-PO bills, non-receipt bills, etc.)
**[GAP]** = Previously missing — now RESOLVED (see Section 8)

---

## 3. PARENT/CHILD CARDINALITY TABLE

| Parent | Child | Min Children | Max Children | FK Nullable | Orphan Allowed? |
|---|---|---|---|---|---|
| Vendor | PurchaseOrder | 0 | ∞ | NO (required) | NO — defer until resolved |
| Vendor | Receipt | 0 | ∞ | NO (required) | NO — defer until resolved |
| Vendor | Bill | 0 | ∞ | NO (required) | NO — defer until resolved |
| InventoryMaster | PurchaseOrderLine | 0 | ∞ | NO (required) | NO — defer until resolved |
| InventoryMaster | ReceiptLine | 0 | ∞ | NO (required) | NO — defer until resolved |
| InventoryMaster | BillLine | 0 | ∞ | NO (required) | NO — defer until resolved |
| InventoryMaster | WarehouseTransferLine | 0 | ∞ | NO (required) | NO — defer until resolved |
| InventoryMaster | InventoryAdjustment | 0 | ∞ | NO (required) | NO — defer until resolved |
| WarehouseLocation | PurchaseOrder | 0 | ∞ | NO (required) | NO — defer until resolved |
| WarehouseLocation | Receipt | 0 | ∞ | NO (required) | NO — defer until resolved |
| WarehouseLocation | WarehouseTransfer (source) | 0 | ∞ | NO (required) | NO — defer until resolved |
| WarehouseLocation | WarehouseTransfer (dest) | 0 | ∞ | NO (required) | NO — defer until resolved |
| WarehouseLocation | InventoryAdjustment | 0 | ∞ | NO (required) | NO — defer until resolved |
| PurchaseOrder | PurchaseOrderLine | 1 | ∞ | NO (required) | NO — PO cannot exist without lines |
| PurchaseOrder | Receipt | 0 | ∞ | YES (optional) | YES — non-PO receipts possible |
| PurchaseOrder | Bill | 0 | ∞ | YES (optional) | YES — non-PO bills possible |
| PurchaseOrderLine | ReceiptLine | 0 | ∞ | YES (optional) | YES — line may not be received |
| PurchaseOrderLine | BillLine | 0 | ∞ | YES (optional) | YES — line may not be billed |
| Receipt | ReceiptLine | 1 | ∞ | NO (required) | NO — receipt cannot exist without lines |
| Receipt | Bill | 0 | ∞ | YES (optional) | YES — bill may not reference a receipt |
| ReceiptLine | BillLine | 0 | ∞ | YES (optional) | YES — line may not be billed |
| Bill | BillLine | 1 | ∞ | NO (required) | NO — bill cannot exist without lines |
| WarehouseTransfer | WarehouseTransferLine | 1 | ∞ | NO (required) | NO — transfer cannot exist without lines |
| Job | WarehouseTransfer | 0 | ∞ | YES (optional) | YES — non-job transfers |

---

## 4. REQUIRED VERSUS OPTIONAL RELATIONSHIP TABLE

| Relationship | Type | Reason | If Missing |
|---|---|---|---|
| Vendor → PurchaseOrder | REQUIRED | Every PO must have a vendor | DEFER |
| Vendor → Receipt | REQUIRED | Every receipt must have a vendor | DEFER |
| Vendor → Bill | REQUIRED | Every bill must have a vendor | DEFER |
| InventoryMaster → PO Line | REQUIRED | Every line must reference a material | DEFER |
| InventoryMaster → Receipt Line | REQUIRED | Every receipt line must reference a material | DEFER |
| InventoryMaster → Bill Line | REQUIRED | Every bill line must reference a material | DEFER |
| InventoryMaster → Transfer Line | REQUIRED | Every transfer line must reference a material | DEFER |
| InventoryMaster → Adjustment | REQUIRED | Every adjustment must reference a material | DEFER |
| WarehouseLocation → PurchaseOrder | REQUIRED | Every PO ships to a warehouse | DEFER |
| WarehouseLocation → Receipt | REQUIRED | Every receipt is at a warehouse | DEFER |
| WarehouseLocation → Transfer (source) | REQUIRED | Every transfer has a source | DEFER |
| WarehouseLocation → Transfer (dest) | REQUIRED | Every transfer has a destination | DEFER |
| WarehouseLocation → Adjustment | REQUIRED | Every adjustment is at a warehouse | DEFER |
| PurchaseOrder → PO Line | REQUIRED | PO has at least one line | SKIP record (invalid) |
| Receipt → Receipt Line | REQUIRED | Receipt has at least one line | SKIP record (invalid) |
| Bill → Bill Line | REQUIRED | Bill has at least one line | SKIP record (invalid) |
| Transfer → Transfer Line | REQUIRED | Transfer has at least one line | SKIP record (invalid) |
| PurchaseOrder → Receipt | OPTIONAL | Receipts may exist without PO (blind receipt) | OK — nullable |
| PurchaseOrder → Bill | OPTIONAL | Bills may exist without PO (non-PO bills) | OK — nullable |
| PO Line → Receipt Line | OPTIONAL | Lines may not be received | OK — nullable |
| PO Line → Bill Line | OPTIONAL | Lines may not be billed | OK — nullable |
| Receipt → Bill | OPTIONAL | Bills may exist without receipt | OK — nullable |
| Receipt Line → Bill Line | OPTIONAL | Lines may not be billed | OK — nullable |
| Job → Transfer | OPTIONAL | Transfers may not be job-related | OK — nullable |

---

## 5. DEPENDENCY-RESOLUTION FIELD FOR EVERY RELATIONSHIP

| Relationship | Resolution Field | Query Method | Recheck on Retry |
|---|---|---|---|
| Vendor → PO | `servicetitan_vendor_id` | `Vendor.filter({ servicetitan_vendor_id })` | YES |
| Vendor → Receipt | `servicetitan_vendor_id` | `Vendor.filter({ servicetitan_vendor_id })` | YES |
| Vendor → Bill | `servicetitan_vendor_id` | `Vendor.filter({ servicetitan_vendor_id })` | YES |
| Material → PO Line | `servicetitan_material_id` | `InventoryMaster.filter({ servicetitan_material_id })` | YES |
| Material → Receipt Line | `servicetitan_material_id` | `InventoryMaster.filter({ servicetitan_material_id })` | YES |
| Material → Bill Line | `servicetitan_material_id` | `InventoryMaster.filter({ servicetitan_material_id })` | YES |
| Material → Transfer Line | `servicetitan_material_id` | `InventoryMaster.filter({ servicetitan_material_id })` | YES |
| Material → Adjustment | `servicetitan_material_id` | `InventoryMaster.filter({ servicetitan_material_id })` | YES |
| Warehouse → PO | `servicetitan_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id })` | YES |
| Warehouse → Receipt | `servicetitan_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id })` | YES |
| Warehouse → Transfer (src) | `servicetitan_source_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id })` | YES |
| Warehouse → Transfer (dst) | `servicetitan_destination_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id })` | YES |
| Warehouse → Adjustment | `servicetitan_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id })` | YES |
| PO → PO Line | `servicetitan_purchase_order_id` | `PurchaseOrder.filter({ servicetitan_purchase_order_id })` | YES |
| PO → Receipt | `servicetitan_purchase_order_id` | `PurchaseOrder.filter({ servicetitan_purchase_order_id })` | YES |
| PO → Bill | `servicetitan_purchase_order_id` | `PurchaseOrder.filter({ servicetitan_purchase_order_id })` | YES |
| PO Line → Receipt Line | `servicetitan_po_line_id` | `PurchaseOrderLine.filter({ servicetitan_po_line_id })` | YES |
| PO Line → Bill Line | `servicetitan_po_line_id` | `PurchaseOrderLine.filter({ servicetitan_po_line_id })` | YES |
| Receipt → Receipt Line | `servicetitan_receipt_id` | `Receipt.filter({ servicetitan_receipt_id })` | YES |
| Receipt → Bill | `servicetitan_receipt_id` | `Receipt.filter({ servicetitan_receipt_id })` | YES |
| Receipt Line → Bill Line | `servicetitan_receipt_line_id` | `ReceiptLine.filter({ servicetitan_receipt_line_id })` | YES |
| Bill → Bill Line | `servicetitan_bill_id` | `Bill.filter({ servicetitan_bill_id })` | YES |
| Transfer → Transfer Line | `servicetitan_transfer_id` | `WarehouseTransfer.filter({ servicetitan_transfer_id })` | YES |

---

## 6. ORPHAN-HANDLING RULES

| Required Relationship | Orphan Detection | Orphan Handling | Watermark Counter |
|---|---|---|---|
| Vendor → PO | `Vendor.filter` returns 0 | DEFER record → `DeferredDependentRecord` | `po_deferred_missing_vendor` |
| Vendor → Receipt | `Vendor.filter` returns 0 | DEFER | `receipts_deferred_missing_vendor` |
| Vendor → Bill | `Vendor.filter` returns 0 | DEFER | `bills_deferred_missing_vendor` |
| Material → PO Line | `InventoryMaster.filter` returns 0 | DEFER | `po_deferred_missing_material` |
| Material → Receipt Line | `InventoryMaster.filter` returns 0 | DEFER | `receipts_deferred_missing_material` |
| Material → Bill Line | `InventoryMaster.filter` returns 0 | DEFER | `bills_deferred_missing_material` |
| Material → Transfer Line | `InventoryMaster.filter` returns 0 | DEFER | `transfers_deferred_missing_material` |
| Material → Adjustment | `InventoryMaster.filter` returns 0 | DEFER | `adjustments_deferred_missing_material` |
| Warehouse → PO | `WarehouseLocation.filter` returns 0 | DEFER | (counter to be added) |
| Warehouse → Receipt | `WarehouseLocation.filter` returns 0 | DEFER | (counter to be added) |
| Warehouse → Transfer (src) | `WarehouseLocation.filter` returns 0 | DEFER | `transfers_deferred_missing_warehouse` |
| Warehouse → Transfer (dst) | `WarehouseLocation.filter` returns 0 | DEFER | `transfers_deferred_missing_warehouse` |
| Warehouse → Adjustment | `WarehouseLocation.filter` returns 0 | DEFER | `adjustments_deferred_missing_warehouse` |

**Orphan rule:** Orphans are NEVER permanently failed. They are placed into `DeferredDependentRecord` and retried in the next sync cycle. If the dependency is never resolved, the record remains deferred indefinitely.

---

## 7. IMMUTABLE EXTERNAL IDENTITIES

Every synchronized entity carries exactly one canonical ServiceTitan identity field:

| Entity | Identity Field | Type | Int64-Safe | Matched By Name/Number? |
|---|---|---|---|---|
| PurchaseOrder | `servicetitan_purchase_order_id` | string | YES | NEVER |
| PurchaseOrderLine | `servicetitan_po_line_id` | string | YES | NEVER |
| Receipt | `servicetitan_receipt_id` | string | YES | NEVER |
| ReceiptLine | `servicetitan_receipt_line_id` | string | YES | NEVER |
| Bill | `servicetitan_bill_id` | string | YES | NEVER |
| BillLine | `servicetitan_bill_line_id` | string | YES | NEVER |
| WarehouseTransfer | `servicetitan_transfer_id` | string | YES | NEVER |
| WarehouseTransferLine | `servicetitan_transfer_line_id` | string | YES | NEVER |
| InventoryAdjustment | `servicetitan_adjustment_id` | string | YES | NEVER |
| Vendor | `servicetitan_vendor_id` | string | YES | NEVER |
| InventoryMaster | `servicetitan_material_id` | string | YES | NEVER |
| MaterialVendor | `servicetitan_vendor_id` + `servicetitan_material_id` | string | YES | NEVER |
| BillReceiptLink | `servicetitan_bill_id` + `servicetitan_receipt_id` | string | YES | NEVER |
| WarehouseLocation | `servicetitan_warehouse_id` | string | YES | NEVER |
| Job | `servicetitan_job_id` | string | YES | NEVER |

**Identity rules:**
- Stored as string for int64 safety
- Immutable once assigned
- Never matched by PO number, receipt number, bill number, vendor name, material name, or SKU
- The canonical sync key — `findExisting()` queries exclusively by this field

---

## 8. INVENTORY-LEDGER CONNECTIONS

| Procurement Entity | Ledger Entity | Link Field | Status |
|---|---|---|---|
| Receipt | InventoryTransaction | `source_document_type='receipt', source_document_id=Receipt.id, receipt_id=Receipt.id` | RESOLVED |
| ReceiptLine | InventoryTransaction | (per-line ledger entries via `receipt_line_id`) | RESOLVED |
| WarehouseTransfer | InventoryTransaction | `warehouse_transfer_id=WT.id` | OK |
| WarehouseTransferLine | InventoryTransaction | (per-line ledger entries via `warehouse_transfer_line_id`) | RESOLVED |
| InventoryAdjustment | InventoryTransaction | `source_document_type='inventory_adjustment', source_document_id=IA.id` | OK |

### RESOLVED: Receipt-to-Ledger Linkage

The `InventoryTransaction` entity now includes:
- `receipt_id` — direct link from ledger to Receipt
- `receipt_line_id` — direct link from ledger to specific ReceiptLine
- `warehouse_transfer_line_id` — direct link from ledger to specific WarehouseTransferLine
- `source_document_type = 'receipt'` — enum value for receipt-posted ledger entries

These fields are populated ONLY by LVC workflow (not by sync). Sync does not create ledger entries.

---

## 9. AMBIGUOUS RELATIONSHIPS REQUIRING OWNER DECISION

### 9.1 Bill-Receipt Cardinality — RESOLVED

ServiceTitan allows:
- One bill from multiple receipts (many receipts → one bill)
- Multiple bills from one PO (one PO → many bills)

**Resolution:** A `BillReceiptLink` junction entity has been created with composite identity (`relationship_key = servicetitan_bill_id + servicetitan_receipt_id`). One Bill may link to many Receipts and one Receipt may link to many Bills. The primary receipt snapshot remains on `Bill.receipt_id` / `Bill.servicetitan_receipt_id` for display, but the complete relationship model lives in `BillReceiptLink` records.

### 9.2 Project Linkage

The requirement mentions "Project, where present in ServiceTitan source records." ServiceTitan POs may reference a Project ID.

**Question:** Should Procurement entities carry a `servicetitan_project_id` snapshot field for display, even though LVC does not sync Projects?

**Recommendation:** Add `servicetitan_project_id` as an optional snapshot field on PurchaseOrder (display-only, not a dependency). Do not create a Project entity or dependency until Projects are explicitly in scope.

### 9.3 Transfer Receipt vs. Transfer — PROVISIONAL

The requirement distinguishes "Transfer" from "Transfer Receipt." ServiceTitan may model these as separate records or as a status on the same transfer.

**Provisional Decision:** Transfer receiving is treated as a lifecycle state of the same `WarehouseTransfer` record (status transitions `dispatched` → `in_transit` → `received`). No separate `TransferReceipt` entity is created at this time. During API verification: if ServiceTitan exposes a separate transfer-receipt entity with its own immutable ID, stop and return the API evidence. Do not silently force that external entity into `WarehouseTransfer`.

### 9.4 Inventory Adjustment Source Type — RESOLVED

`InventoryTransaction.source_document_type` now includes `receipt` as a value. Receipt ledger entries use `source_document_type='receipt'` with `receipt_id` and `receipt_line_id` for direct traceability.