# Supply Chain & Inventory Engine — Phase 1 Architecture

## Status: AWAITING APPROVAL
Do not proceed with UI development until this document is reviewed and approved.

---

## 1. Entity Relationship Diagram (ERD)

### Core Entities

```
InventoryMaster (1) ──< InventoryTransaction (ledger) >── (1) WarehouseLocation
       │                        │                                  
       │                        ├──> PurchaseOrderLine >── PurchaseOrder >── Vendor
       │                        ├──> WarehouseTransferLine >── WarehouseTransfer
       │                        ├──> SalesOrder >── Job / Estimate / Invoice
       │                        ├──> MaterialReconciliation >── SalesOrder / Invoice
       │                        └──> InventoryAdjustment
       │
       ├──> BarcodeLabel
       ├──> InventoryCategory
       └──> Vendor (primary + alternates)

WarehouseLocation (1) ──< WarehouseLocation (parent_location_id — self-referential)
       ├── TruckProfile (when location_type = truck)
       ├── Vendor (when location_type = vendor)
       └── Job (when location_type = job_site)
```

### Entity Count

| Entity | Status | Purpose |
|--------|--------|---------|
| **InventoryMaster** | ✅ Updated | One master record per item — SKU, barcode, purchasing, financial, inventory params |
| **InventoryTransaction** | ✅ Updated | Immutable ledger — every movement, never deleted/overwritten |
| **WarehouseLocation** | ✅ Updated | Every physical/logical location — warehouses, trucks, vendors, job sites |
| **Vendor** | ✅ Updated | Vendor master + performance metrics |
| **PurchaseOrder** | ✅ New | PO header — draft → closed lifecycle |
| **PurchaseOrderLine** | ✅ New | PO line items — ordered/received/outstanding tracking |
| **SalesOrder** | ✅ New | Operational parent linking estimate → reservation → transfer → invoice → reconciliation |
| **WarehouseTransfer** | ✅ New | Transfer header — pending → completed lifecycle |
| **WarehouseTransferLine** | ✅ New | Transfer line items — requested/picked/loaded/received tracking |
| **MaterialReconciliation** | ✅ New | Job material audit — estimated vs actual, disposition, variance |
| **InventoryAdjustment** | ✅ New | Manager-approved adjustments — creates reversing ledger entries |
| **BarcodeLabel** | ✅ New | Barcode/QR config and print tracking |
| **InventoryCategory** | ✅ Existing | Category classification |
| **Invoice** | ✅ Existing | Updated during reconciliation |

---

## 2. Inventory Transaction Ledger Architecture

### Core Principle
**Inventory quantities are NEVER directly edited.** Every movement creates an immutable transaction. Current balances are always calculated from transaction history.

### Ledger Entry Anatomy
Every `InventoryTransaction` answers:
- **What happened?** → `transaction_type` + `movement_direction`
- **Why?** → `reason` + `source_document_type` + `source_document_id`
- **When?** → `transaction_date` + `posted_date`
- **Who?** → `created_by` + `approved_by`
- **Which document?** → `source_document_number`
- **Which job?** → `job_id` + `sales_order_id`
- **Which locations?** → `from_location_id` + `to_location_id`

### Transaction Types & Directions

| Transaction Type | Direction | From → To | Source Document |
|-----------------|-----------|-----------|-----------------|
| `receive_purchase` | inbound | Vendor → Warehouse | PurchaseOrder |
| `receive_transfer` | inbound | Warehouse/Truck → Warehouse/Truck | WarehouseTransfer |
| `transfer_out` | outbound | Warehouse → Truck/Job | WarehouseTransfer |
| `transfer_in` | inbound | Truck/Job → Warehouse | WarehouseTransfer |
| `reserve` | neutral | — | SalesOrder |
| `release_reservation` | neutral | — | SalesOrder |
| `pick` | internal | Warehouse → Staging | WarehouseTransfer |
| `stage` | internal | Staging → Loading | WarehouseTransfer |
| `load` | internal | Loading → Truck | WarehouseTransfer |
| `issue_to_job` | outbound | Truck → Job Site | SalesOrder |
| `install` | outbound | Job Site → Consumed | MaterialReconciliation |
| `return_to_warehouse` | inbound | Truck/Job → Warehouse | MaterialReconciliation |
| `return_to_truck` | internal | Job → Truck | MaterialReconciliation |
| `waste` | outbound | — → Waste | MaterialReconciliation |
| `damage` | outbound | — → Damaged | MaterialReconciliation |
| `loss` | outbound | — → Lost | MaterialReconciliation |
| `adjustment_increase` | inbound | — → Warehouse | InventoryAdjustment |
| `adjustment_decrease` | outbound | Warehouse → — | InventoryAdjustment |
| `physical_count` | neutral | — | Cycle Count |
| `vendor_return` | outbound | Warehouse → Vendor | InventoryAdjustment |
| `warranty_replacement` | inbound | Vendor → Warehouse | InventoryAdjustment |
| `disposal` | outbound | — → Disposed | InventoryAdjustment |

### Immutability Rules
1. **Never delete** a transaction record
2. **Never overwrite** quantity, location, or cost fields
3. **Corrections** create reversing transactions (`is_reversing=true`, `reversed_transaction_id`)
4. **Balance calculation** always sums the ledger — no cached totals are authoritative
5. **Posted transactions** are locked — `posted_date` set once committed

### Reversal Pattern
```
Original:   ITX-001  receive_purchase  qty=10  (Warehouse A)
Reversal:   ITX-002  adjustment_decrease qty=10  is_reversing=true  reversed_transaction_id=ITX-001
            → ITX-001.reversed_by_transaction_id = ITX-002
```

---

## 3. Inventory State Model

### Per-Location Balance (calculated from ledger)

```
On Hand     = Σ(inbound transactions) - Σ(outbound transactions)
Reserved    = Σ(reserve) - Σ(release_reservation) - Σ(pick/install/issue)
Available   = On Hand - Reserved
In Transit  = Σ(transfer_out, not yet received)
On Order    = Σ(PO lines ordered, not yet received)
```

### InventoryMaster Aggregate Fields (denormalized, recalculated from ledger)

| Field | Calculation |
|-------|------------|
| `quantity_owned` | Σ across all locations (On Hand) |
| `quantity_available` | Σ (On Hand - Reserved) across all locations |
| `quantity_reserved` | Σ Reserved across all locations |
| `quantity_on_order` | Σ (PO lines ordered - received) |
| `quantity_in_transit` | Σ (Transfer lines shipped - received) |
| `quantity_damaged` | Σ in damaged_inventory locations |
| `average_cost` | Weighted average from receive_purchase transactions |
| `inventory_value` | `quantity_owned × average_cost` |
| `last_movement_date` | MAX(transaction_date) for this item |

### Balance Verification
`is_balanced = (quantity_owned == quantity_available + quantity_reserved + quantity_on_order + quantity_in_transit + quantity_damaged + quantity_retired)`

---

## 4. Purchase Order Workflow

```
Draft → Pending Approval → Approved → Sent → Vendor Confirmed
  → Partially Received → Received → Closed
  → Cancelled (at any stage before Sent)
```

### Partial Receipt Logic
When only part of a PO arrives:
1. Receive available items → create `receive_purchase` ledger entries
2. Original PO becomes `partially_received` then `received`
3. **Auto-create new PO** containing only outstanding quantities
   - `parent_po_id` = original PO
   - `partial_receipt_origin = true`
   - Status = `sent` (vendor already confirmed the original order)
4. This maintains clean purchasing history — original PO is never modified

### Replenishment Origin
When the Replenishment Engine detects items at reorder point:
1. Creates suggested replenishment entries (no auto-ordering)
2. Warehouse Manager reviews: Approve All / Approve Selected / Modify / Reject
3. Approved replenishments auto-generate Purchase Orders grouped by vendor
   - `replenishment_origin = true`
   - `replenishment_ids` = JSON array of source replenishment IDs

---

## 5. Sales Order Workflow

```
Estimate Approved
  → Create SalesOrder (status: open)
  → Reserve Inventory (reserve ledger entries)
  → Create Warehouse Transfers (to truck or job site)
  → Perform Work (issue_to_job, install ledger entries)
  → Material Reconciliation (return/waste/variance)
  → Create/Update Invoice
  → Close SalesOrder (status: completed)
```

### SalesOrder as Parent Document
The SalesOrder links:
- `estimate_id` — source estimate
- `scope_of_work_id` — approved scope
- `job_id` — operational job
- `invoice_id` — generated invoice
- `material_reconciliation_id` — material audit

### Inventory Reservation
Upon SalesOrder creation:
1. Create `reserve` ledger entries for each line item
2. Warehouse inventory tracks: On Hand / Reserved / Available
3. Reserved inventory remains physically in warehouse until picked
4. When picked: `release_reservation` + `pick` (moves to staging)

### Execution Type
- `perform_today` — immediate transfer + execution
- `schedule_for_later` — reserve inventory, schedule transfer for service date

---

## 6. Warehouse Transfer Workflow

```
Pending → Approved → Picked → Staged → Loaded → Received → Completed
  → Cancelled (before Approved)
```

### Stage Tracking
Each stage records: `user`, `date/time`, `notes`, `photos (optional)`

| Stage | User Field | Timestamp Field | Ledger Impact |
|-------|-----------|-----------------|---------------|
| Pending | `created_by` | — | None |
| Approved | `approved_by` | — | None |
| Picked | `picked_by` | `picked_at` | `pick` (warehouse → staging) |
| Staged | `staged_by` | `staged_at` | `stage` (staging → loading) |
| Loaded | `loaded_by` | `loaded_at` | `load` (loading → truck) |
| Received | `received_by` | `received_at` | `receive_transfer` (source → destination) |
| Completed | — | `completed_at` | Transfer finalized |

### Transfer Types
- `warehouse_to_warehouse` — inter-warehouse moves
- `warehouse_to_truck` — truck restocking (replenishment engine)
- `truck_to_warehouse` — returns
- `truck_to_truck` — inter-truck transfers
- `warehouse_to_job_site` — direct to job
- `job_site_to_warehouse` — post-job returns

### Truck Replenishment
Trucks have min/max/reorder per item. When a truck hits reorder:
1. Replenishment Engine suggests a Warehouse Transfer (not a PO)
2. Warehouse Manager approves
3. Transfer follows the standard workflow

---

## 7. Material Reconciliation Workflow

```
Pending → In Progress → Submitted → Manager Review → Approved → Closed
```

### Per-Item Disposition
Every transferred material must end in one of:
- **Installed** — consumed on the job
- **Returned to Warehouse** — back to warehouse stock
- **Returned to Truck** — back to truck stock
- **Waste** — disposed (no recovery)
- **Damaged** — unusable
- **Lost** — unaccounted for
- **Variance** — discrepancy between estimated and actual

### Variance Tracking
| Field | Description |
|-------|------------|
| `quantity_estimated` | From estimate/SO |
| `quantity_reserved` | From reservation |
| `quantity_transferred` | From transfers |
| `quantity_installed` | Final installed count |
| `quantity_returned_warehouse` | Returned to warehouse |
| `quantity_returned_truck` | Returned to truck |
| `quantity_waste` | Wasted |
| `quantity_damaged` | Damaged |
| `quantity_lost` | Lost |
| `quantity_variance` | Transferred - (Installed + Returned + Waste + Damaged + Lost) |
| `cost_variance` | (Actual qty × cost) - (Estimated qty × cost) |

### Manager Approval
- `variance_threshold_exceeded` = true when cost variance > threshold
- `manager_approval_required` = true
- Manager reviews, approves or investigates
- Invoice quantities updated when applicable (`invoice_updated = true`)

### Invoice Integration
- Internal materials remain hidden on invoice but still affect job costing
- Chargeable materials appear on invoice with actual quantities
- Variance > threshold requires manager approval before invoice update

---

## 8. Barcode Scanning Architecture

### Scan Entry Points

| Workflow | Scan Action | Result |
|----------|------------|--------|
| Purchase Order Receiving | Scan item barcode | Match to PO line, auto-fill quantity |
| Partial Receipt | Scan received items | Create receipt ledger entries |
| Vendor Returns | Scan items | Create vendor_return transaction |
| Warehouse Picking | Scan bin + item | Verify correct pick |
| Staging | Scan items | Confirm staging complete |
| Truck Loading | Scan items | Confirm load quantity |
| Transfer Verification | Scan at receipt | Verify received vs shipped |
| Cycle Counts | Scan bin + items | Auto-populate count |
| Inventory Lookup | Scan any barcode | Display full item status |
| Technician Receive Transfer | Scan items | Confirm receipt on truck |
| Material Reconciliation | Scan items | Auto-disposition (installed/returned) |
| Truck Inventory | Scan items | Quick stock check |

### BarcodeLabel Entity
- `barcode_value` — the encoded string
- `barcode_format` — code_128 (default), code_39, ean_13, upc_a, qr_code, data_matrix
- `qr_code_value` — optional QR for mobile deep-link lookup
- Print tracking: `print_count`, `last_printed_at`, `last_printed_by`

### Scanner Support
- **Mobile Camera** — browser-based camera scanning (Web API)
- **Bluetooth Scanner** — acts as keyboard input, same UX as manual entry
- **USB Scanner** — acts as keyboard input, same UX as manual entry

All three scanner types produce the same result: a string value matched against `InventoryMaster.barcode` or `BarcodeLabel.barcode_value`.

---

## 9. Inventory Location Architecture

### Location Types

| Type | Description | Physical? | Example |
|------|------------|-----------|---------|
| `warehouse` | Primary storage | Yes | Main Warehouse |
| `overflow_warehouse` | Secondary storage | Yes | Overflow Warehouse |
| `truck` | Vehicle inventory | Yes | Truck 001 |
| `vendor` | At supplier (on order) | No | Vendor warehouse |
| `job_site` | At customer location | Yes | 123 Main St |
| `damaged_inventory` | Quarantined damaged | Yes | Damaged bin |
| `warranty_returns` | Warranty claim items | Yes | Warranty bin |
| `returned_goods` | Awaiting restocking | Yes | Returns area |
| `in_transit` | Between locations | No | Logical only |

### Hierarchy
- WarehouseLocations can have a `parent_location_id` (e.g. overflow → main warehouse)
- Trucks link to `TruckProfile` via `linked_truck_id`
- Vendor locations link to `Vendor` via `linked_vendor_id`
- Job site locations link to `Job` via `linked_job_id`

### Per-Location Stock Levels
Each location maintains (calculated from ledger):
- On Hand
- Reserved
- Available
- Minimum
- Maximum
- Reorder Point
- Reorder Quantity

---

## 10. Dashboard Architecture

### Warehouse Dashboard
- Suggested Replenishments (items at/below reorder point)
- Pending Transfers (awaiting pick/stage/load/receive)
- Pending Receipts (POs awaiting delivery)
- Returns (awaiting warehouse verification)
- Low Stock (below minimum)
- Inventory Variance (from recent reconciliations)

### Purchasing Dashboard
- Purchase Orders (by status)
- Vendor Performance (fill rate, on-time delivery)
- Lead Times (actual vs expected)
- Fill Rates (by vendor)
- Backorders (outstanding quantities)

### Executive Dashboard
- Inventory Value (total, by category, by location)
- Inventory Turns (annualized)
- Waste (total cost, by category)
- Shrinkage (adjustments)
- Transfer Accuracy (received vs shipped)
- Material Variance (reconciliation cost variance)
- Vendor Performance (composite score)
- Job Cost Variance (estimated vs actual)

---

## Future Compatibility (Version 2 — Operational Readiness Engine)

The architecture exposes the following data for future integration:
- **Available inventory by location** — for material readiness checks
- **Reserved/On Order/In Transit quantities** — for projected availability
- **Lead times** — for scheduling constraints
- **Vendor performance** — for alternate sourcing decisions
- **Transfer status** — for material arrival timing
- **Truck stock levels** — for field readiness verification

The Operational Readiness Engine will query these to verify materials are satisfied before work begins. No structural redesign required — the ledger and location model already provide the needed data.

---

## Design Principles Enforced

1. **Single source of truth** — InventoryTransaction ledger is authoritative
2. **No direct edits** — Balances derived from transactions, never manually updated
3. **Complete traceability** — Every movement links to user, timestamp, source document, locations, and job
4. **Operational first** — One integrated workflow for warehouse, technicians, purchasing, and management
5. **Future-ready** — Supports multiple warehouses, multiple branches, AI forecasting, and the Operational Readiness Engine without structural redesign