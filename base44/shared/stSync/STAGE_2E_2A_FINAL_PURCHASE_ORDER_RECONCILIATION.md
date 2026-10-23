# STAGE 2E.2A — FINAL PURCHASE ORDER RECONCILIATION

**Status:** Final owner reconciliation — ZERO implementation, ZERO schema changes
**Date:** 2026-08-03
**Predecessor:** Stage 2E.2 Purchase Order Architecture Reconciliation — REVIEWED
**Authority:** Owner-approved decisions

---

## PROHIBITED WORK CONFIRMATION

| Prohibited Action | Status |
|---|---|
| Begin implementation | NOT PERFORMED |
| Create adapters | NOT PERFORMED |
| Create domain services | NOT PERFORMED |
| Activate watermarks | NOT PERFORMED |
| Import records | NOT PERFORMED |
| Enable schedulers | NOT PERFORMED |
| Modify schemas | NOT PERFORMED (this report authorizes future changes) |

---

## 1. PERMANENT SCHEMA GOVERNANCE RULE

### Schema Promotion Rule

> No ServiceTitan field may be promoted from `servicetitan_raw_data` into a first-class schema field unless it satisfies at least one of the following:
>
> 1. **Immutable identity** — the field is a permanent external identity key used for record matching
> 2. **Synchronization integrity** — the field is required for conflict detection, stale-event protection, or dependency resolution
> 3. **Operational workflow** — an LVC OS workflow actively reads, filters, or branches on this field
> 4. **Reporting requirement** — a defined LVC report aggregates or filters by this field
> 5. **Audit requirement** — a defined LVC audit process queries or displays this field for compliance traceability
> 6. **Owner-approved display requirement** — the owner has explicitly approved this field for user-facing display
>
> If none of these criteria are met, the field shall remain inside `servicetitan_raw_data`.

**Scope:** This rule applies to every future synchronization domain — Purchase Orders, Receipts, Bills, Transfers, Inventory Adjustments, and any domain added after Stage 2E.

**Enforcement:** Every schema field proposed for promotion must cite the specific criterion satisfied and the workflow/report/audit that depends on it. Proposals that cannot cite a dependent workflow are rejected.

**Governance Document:** Added to `STAGE_2E_PROCUREMENT_ARCHITECTURE.md` §0.3 (Architectural Governance).

---

## 2. APPROVED REQUIRED PURCHASE ORDER FIELDS

### 2.1 `servicetitan_job_id`

| Aspect | Detail |
|---|---|
| **Decision** | **APPROVED — Required schema field** |
| **API Field** | `jobId` (number, nullable) |
| **Schema Field** | `servicetitan_job_id` (string) |
| **Owner** | ServiceTitan-owned snapshot |
| **Classification** | ST-owned snapshot (overwritten by sync) |
| **Criteria Satisfied** | Operational workflow |

| Operational Workflow | How It Uses This Field |
|---|---|
| Job Hub | Display POs associated with a job on the job detail screen |
| Procurement visibility | Buyers and managers see which job a PO supports |
| Job costing | Associate procurement cost with a specific job |
| Technician workflow | Technicians see materials ordered for their job |
| Procurement history | Job-level procurement history reporting |

**What breaks without it:** LVC's Job Hub cannot show procurement activity per job. Job costing loses the PO-to-job link. The procurement history per job is lost — LVC would have to parse `servicetitan_raw_data` for every job-PO lookup, which is not queryable.

**Nullable handling:** POs without a job (stock orders, replenishment) have `jobId = null`. The field is optional on the schema — `servicetitan_job_id` is set when the API provides it, null otherwise.

### 2.2 `servicetitan_sent_on`

| Aspect | Detail |
|---|---|
| **Decision** | **APPROVED — Required schema field** |
| **API Field** | `sentOn` (string date, nullable) |
| **Schema Field** | `servicetitan_sent_on` (string, date-time) |
| **Owner** | ServiceTitan-owned lifecycle snapshot |
| **Classification** | ST-owned lifecycle snapshot (overwritten by sync) |
| **Criteria Satisfied** | Operational workflow + Reporting requirement |

| Operational Workflow | How It Uses This Field |
|---|---|
| Vendor lead-time calculation | `received_on - sent_on` = actual vendor lead time |
| Procurement aging | Days since `sent_on` for open POs |
| Overdue purchasing | POs past expected delivery based on `sent_on` + lead time |
| Vendor KPI reporting | Vendor performance metrics (on-time delivery, lead time variance) |

**Distinct from LVC timestamps:** This field records when ServiceTitan sent the PO to the vendor. It is distinct from the LVC-owned `sent_at` field, which tracks when an LVC user initiated a send action. Both fields coexist — `servicetitan_sent_on` is the authoritative ST lifecycle timestamp; `sent_at` is the LVC workflow timestamp.

**What breaks without it:** LVC cannot calculate vendor lead time or identify overdue POs. Vendor KPI reporting loses its time-basis. Procurement aging becomes impossible without the authoritative sent timestamp.

---

## 3. RE-EVALUATION OF REMAINING SNAPSHOT FIELDS

Every remaining proposed snapshot field is evaluated against the Schema Promotion Rule. No field is automatically approved.

### 3.1 `servicetitan_technician_id`

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key |
| Synchronization integrity | NO | Not used for matching or conflict detection |
| Operational workflow | NO | LVC tracks technicians via EmployeeRegistry, not ST technician IDs. Truck replenishment uses `inventoryLocationId` → WarehouseLocation (location_type=truck) → TruckProfile → technician assignment. The technician is derivable; no LVC workflow queries by ST technician ID. |
| Reporting requirement | NO | No defined LVC report aggregates by ST technician ID |
| Audit requirement | NO | No defined LVC audit process queries by ST technician ID |
| Owner-approved display | NO | Not explicitly approved |

| **Final Decision** | **Raw data only** |
|---|---|
| **Reason** | The technician is derivable from `inventoryLocationId` → WarehouseLocation → TruckProfile → technician. No independent LVC operational workflow reads, filters, or branches on the ST `technicianId`. Promoting it creates a field that no workflow queries. |

### 3.2 `servicetitan_ship_to`

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key |
| Synchronization integrity | NO | Not used for matching |
| Operational workflow | NO | LVC's receiving workflow uses `inventoryLocationId` to determine the receiving warehouse. The ship-to address is informational; LVC does not have a job-site-receiving workflow for POs. |
| Reporting requirement | NO | No defined report uses ship-to address |
| Audit requirement | NO | No defined audit process uses ship-to |
| Owner-approved display | NO | Not explicitly approved |

| **Final Decision** | **Raw data only** |
|---|---|
| **Reason** | LVC's receiving workflow is warehouse-based and keyed on `inventoryLocationId`. The `shipTo` address may differ from the warehouse address (job-site delivery), but LVC does not currently have a job-site-PO-receiving workflow. If such a workflow is added in the future, this field can be promoted then. |

### 3.3 `servicetitan_vendor_document_number`

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key |
| Synchronization integrity | NO | Not used for matching |
| Operational workflow | NO | The three-way match (PO + Receipt + Bill) compares quantities and prices, not vendor document numbers. The vendor_document_number is the vendor's reference (quote/confirmation number), not a matching key. |
| Reporting requirement | NO | No defined report aggregates by vendor document number |
| Audit requirement | NO | No defined audit process queries by vendor document number |
| Owner-approved display | NO | Not explicitly approved |

| **Final Decision** | **Raw data only** |
|---|---|
| **Reason** | The three-way match does not use the vendor document number as a matching key. The field is a vendor reference number with no LVC workflow dependency. It remains available in `servicetitan_raw_data` for future needs. |

### 3.4 `servicetitan_purchase_order_type_id`

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key for the PO itself |
| Synchronization integrity | NO | Not used for matching |
| Operational workflow | NO | LVC workflow is governed by `lvc_workflow_status`, not PO type |
| Reporting requirement | POSSIBLE | POs could be grouped by type in reports |
| Audit requirement | NO | No defined audit process |
| Owner-approved display | **YES** | Owner confirmed Option B (snapshot fields) |

| **Final Decision** | **Snapshot field** (owner-approved display requirement) |
|---|---|

### 3.5 `servicetitan_purchase_order_type_name`

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key |
| Synchronization integrity | NO | Not used for matching |
| Operational workflow | NO | LVC workflow is independent of PO type name |
| Reporting requirement | POSSIBLE | POs grouped by type name in reports |
| Audit requirement | NO | No defined audit process |
| Owner-approved display | **YES** | Owner confirmed Option B (snapshot fields) |

| **Final Decision** | **Snapshot field** (owner-approved display requirement) |
|---|---|

### 3.6 `servicetitan_description` (Purchase Order Line)

| Criterion | Satisfied? | Reason |
|---|---|---|
| Immutable identity | NO | Not a sync key |
| Synchronization integrity | NO | Not used for matching |
| Operational workflow | NO | LVC's receiving workflow verifies against `InventoryMaster` (material name, SKU, barcode), not the line description. The line description may duplicate the material name; it is not an independent verification source. |
| Reporting requirement | NO | No defined report uses line description |
| Audit requirement | NO | No defined audit process uses line description |
| Owner-approved display | NO | Not explicitly approved |

| **Final Decision** | **Raw data only** |
|---|---|
| **Reason** | LVC's receiving verification uses `InventoryMaster` as the source of truth for item identity (SKU, barcode, name). The line description is a denormalized text field that may duplicate the material name. No LVC workflow reads or filters by line description. It remains in `servicetitan_raw_data`. |

### 3.7 Re-evaluation Summary

| Field | Operational Workflow | Display | Audit | Reporting | Final Decision |
|---|---|---|---|---|---|
| `servicetitan_job_id` | YES (Job Hub, job costing) | — | — | — | **Required schema field** |
| `servicetitan_sent_on` | YES (lead time, aging) | — | — | YES (vendor KPI) | **Required schema field** |
| `servicetitan_purchase_order_type_id` | NO | YES (owner-approved) | NO | POSSIBLE | **Snapshot field** |
| `servicetitan_purchase_order_type_name` | NO | YES (owner-approved) | NO | POSSIBLE | **Snapshot field** |
| `servicetitan_technician_id` | NO | NO | NO | NO | **Raw data only** |
| `servicetitan_ship_to` | NO | NO | NO | NO | **Raw data only** |
| `servicetitan_vendor_document_number` | NO | NO | NO | NO | **Raw data only** |
| `servicetitan_description` (line) | NO | NO | NO | NO | **Raw data only** |

---

## 4. PURCHASE ORDER TYPE — CONFIRMED

| Aspect | Decision |
|---|---|
| **Option** | **Option B — Snapshot fields only** |
| **Fields stored** | `servicetitan_purchase_order_type_id` (string) + `servicetitan_purchase_order_type_name` (string) |
| **Separate entity** | NO — do not create `PurchaseOrderType` entity |
| **Dependency** | NO — PO Type is not a sync dependency; POs are not deferred if the type is unresolved |
| **Behavioral configuration** | Remains inside `servicetitan_raw_data` (automaticallyReceive, displayToTechnician, allowTechniciansToSendPo, landedCostMethod, etc.) |
| **Future promotion** | Behavioral flags may be promoted ONLY if a future LVC operational workflow requires them |

**Reason:** LVC's procurement workflow is governed by `lvc_workflow_status`, which is independent of ST PO Type behavioral flags. The PO type is a categorization label for display and filtering. Snapshot fields provide display capability without the overhead of a separate entity, watermark, adapter, or dependency chain.

---

## 5. ENDPOINT CORRECTION — APPROVED

| Aspect | Detail |
|---|---|
| **Decision** | **APPROVED — Configuration correction only** |
| **Change** | `stPurchaseOrderSyncConfig.ts`: `/procurement/v2/tenant/{tenant}/purchase-orders` → `/inventory/v2/tenant/{tenant}/purchase-orders` |
| **Schema changes** | NONE |
| **Workflow changes** | NONE |
| **Ownership changes** | NONE |
| **Scope** | Single config file path correction |

**Confirmation:** This is a configuration correction only. No entity schemas are modified. No workflow logic is changed. No field ownership is altered. The correction aligns the config with the verified live API path.

---

## 6. INVENTORY LOCATION DECISION — CONFIRMED

| Aspect | Decision |
|---|---|
| **Entity** | `WarehouseLocation` — KEPT, no rename |
| **Rationale** | The entity already models all inventory location types via `location_type` enum |

### WarehouseLocation `location_type` Coverage

| `location_type` value | Represents | Modeled? |
|---|---|---|
| `warehouse` | Physical warehouse | YES |
| `overflow_warehouse` | Secondary/overflow storage | YES |
| `truck` | Technician truck | YES |
| `vendor` | Vendor location | YES |
| `job_site` | Job site | YES |
| `damaged_inventory` | Damaged goods holding | YES |
| `warranty_returns` | Warranty returns area | YES |
| `returned_goods` | Returned goods area | YES |
| `in_transit` | In-transit logical location | YES |

### Mapping Confirmation

| API Field | Schema Field | Resolution |
|---|---|---|
| `inventoryLocationId` | `servicetitan_warehouse_id` | `WarehouseLocation.filter({ servicetitan_warehouse_id: inventoryLocationId })` — resolves regardless of `location_type` |

**No architectural changes.** The existing model is correct. No rename is warranted unless a future API exposes inventory location behavior that cannot be represented by the existing `location_type` enum.

---

## 7. FINAL IMPLEMENTATION READINESS

### 7.1 Final Approved Purchase Order Schema (Additions)

| # | New Field | Type | Owner | Classification | Criteria |
|---|---|---|---|---|---|
| 1 | `servicetitan_job_id` | string | ST-owned | Snapshot | Operational workflow |
| 2 | `servicetitan_sent_on` | string (date-time) | ST-owned | Lifecycle snapshot | Operational workflow + Reporting |
| 3 | `servicetitan_purchase_order_type_id` | string | ST-owned | Snapshot | Owner-approved display |
| 4 | `servicetitan_purchase_order_type_name` | string | ST-owned | Snapshot | Owner-approved display |

### 7.2 Final Approved Purchase Order Line Schema (Additions)

| # | New Field | Type | Owner | Classification | Criteria |
|---|---|---|---|---|---|
| — | (none) | — | — | — | No line fields promoted |

### 7.3 Fields Remaining in `servicetitan_raw_data`

| # | API Field | Entity | Reason |
|---|---|---|---|
| 1 | `summary` | PurchaseOrder | LVC has own `notes`; no workflow queries ST summary |
| 2 | `createdById` | PurchaseOrder | LVC has own `created_by`; ST creator is audit reference only |
| 3 | `invoiceId` | PurchaseOrder | LVC manages invoices separately; ST internal reference |
| 4 | `batchId` | PurchaseOrder | No LVC workflow uses batch IDs |
| 5 | `budgetCodeId` | PurchaseOrder | LVC does not model budget codes |
| 6 | `businessUnitId` | PurchaseOrder | LVC does not model business units as dependency |
| 7 | `customFields` | PurchaseOrder | Preserved for future expansion |
| 8 | `technicianId` | PurchaseOrder | Derivable from inventoryLocationId → TruckProfile |
| 9 | `shipTo` | PurchaseOrder | No job-site-receiving workflow; warehouse receiving uses inventoryLocationId |
| 10 | `vendorDocumentNumber` | PurchaseOrder | Three-way match uses quantities/prices, not document numbers |
| 11 | `skuType` | PurchaseOrderLine | Already on InventoryMaster.inventory_type |
| 12 | `chargeable` | PurchaseOrderLine | Already on InventoryMaster.chargeable_material |
| 13 | `serialNumbers` | PurchaseOrderLine | Serialized receiving not in current scope |
| 14 | `budgetCodeId` | PurchaseOrderLine | No LVC workflow uses budget codes |
| 15 | `description` | PurchaseOrderLine | Receiving verifies against InventoryMaster, not line description |

### 7.4 Snapshot Fields (First-Class)

| Field | Entity | Display Purpose |
|---|---|---|
| `servicetitan_job_id` | PurchaseOrder | Job Hub display, job-PO linkage |
| `servicetitan_sent_on` | PurchaseOrder | Lead-time calculation, aging display |
| `servicetitan_purchase_order_type_id` | PurchaseOrder | PO type filtering/grouping |
| `servicetitan_purchase_order_type_name` | PurchaseOrder | PO type display without join |

### 7.5 Immutable Identity Fields

| Field | Entity |
|---|---|
| `servicetitan_purchase_order_id` | PurchaseOrder |
| `servicetitan_po_line_id` | PurchaseOrderLine |
| `servicetitan_vendor_id` | PurchaseOrder (dependency) |
| `servicetitan_warehouse_id` | PurchaseOrder (dependency) |
| `servicetitan_material_id` | PurchaseOrderLine (dependency) |

### 7.6 ST-Owned Fields (Overwritten by Sync)

| Field | Entity | Notes |
|---|---|---|
| `status` | PurchaseOrder | Normalized from API TitleCase |
| `servicetitan_po_number` | PurchaseOrder | Human-readable PO number |
| `order_date` | PurchaseOrder | From `date` |
| `expected_delivery_date` | PurchaseOrder | From `requiredOn` |
| `actual_delivery_date` | PurchaseOrder | From `receivedOn` |
| `vendor_name` | PurchaseOrder | Resolved from Vendor |
| `warehouse_name` | PurchaseOrder | Resolved from WarehouseLocation |
| `subtotal` | PurchaseOrder | Derived (total - tax - shipping) |
| `tax_amount` | PurchaseOrder | From `tax` |
| `shipping_amount` | PurchaseOrder | From `shipping` |
| `total` | PurchaseOrder | From `total` |
| `line_count` | PurchaseOrder | Derived from items.length |
| `total_quantity_ordered` | PurchaseOrder | Derived from sum of items[].quantity |
| `total_quantity_received` | PurchaseOrder | Derived from sum of items[].quantityReceived |
| `received_percentage` | PurchaseOrder | Derived |
| `vendor_confirmed_at` | PurchaseOrder | (if exposed by API) |
| `closed_at` | PurchaseOrder | (if exposed by API) |
| `cancelled_at` | PurchaseOrder | (if exposed by API) |
| `cancellation_reason` | PurchaseOrder | (if exposed by API) |
| `servicetitan_active` | PurchaseOrder | Default true |
| `servicetitan_project_id` | PurchaseOrder | From `projectId` |
| `servicetitan_job_id` | PurchaseOrder | **NEW — from `jobId`** |
| `servicetitan_sent_on` | PurchaseOrder | **NEW — from `sentOn`** |
| `servicetitan_purchase_order_type_id` | PurchaseOrder | **NEW — from `typeId`** |
| `servicetitan_purchase_order_type_name` | PurchaseOrder | **NEW — resolved from PO Type endpoint** |
| `servicetitan_modified_on` | PurchaseOrder | Stale-event protection |
| `servicetitan_created_on` | PurchaseOrder | Audit |
| `servicetitan_sync_status` | PurchaseOrder | Sync infrastructure |
| `servicetitan_last_sync` | PurchaseOrder | Sync infrastructure |
| `servicetitan_last_event_at` | PurchaseOrder | Event ordering |
| `servicetitan_sync_version` | PurchaseOrder | Sync infrastructure |
| `servicetitan_source` | PurchaseOrder | Sync infrastructure |
| `servicetitan_raw_data` | PurchaseOrder | Preserved unknown fields |
| `import_source` | PurchaseOrder | Import tracking |
| `imported_at` | PurchaseOrder | Import tracking |
| `sku` | PurchaseOrderLine | From `skuCode` |
| `item_name` | PurchaseOrderLine | From `skuName` |
| `vendor_sku` | PurchaseOrderLine | From `vendorPartNumber` |
| `quantity_ordered` | PurchaseOrderLine | From `quantity` |
| `quantity_received` | PurchaseOrderLine | From `quantityReceived` |
| `unit_cost` | PurchaseOrderLine | From `cost` |
| `line_total` | PurchaseOrderLine | From `total` |
| `line_status` | PurchaseOrderLine | Normalized from API TitleCase |
| `servicetitan_material_id` | PurchaseOrderLine | From `skuId` |
| `servicetitan_modified_on` | PurchaseOrderLine | Stale-event protection |
| `servicetitan_created_on` | PurchaseOrderLine | Audit |
| `servicetitan_sync_status` | PurchaseOrderLine | Sync infrastructure |
| (line sync infra fields) | PurchaseOrderLine | Same pattern as header |

### 7.7 LVC-Owned Fields (Protected from Sync)

| Field | Entity | Purpose |
|---|---|---|
| `po_number` | PurchaseOrder | LVC internal PO number |
| `lvc_workflow_status` | PurchaseOrder | LVC procurement workflow |
| `replenishment_origin` | PurchaseOrder | Auto-generated flag |
| `replenishment_ids` | PurchaseOrder | Replenishment linkage |
| `parent_po_id` | PurchaseOrder | Partial receipt parent |
| `parent_po_number` | PurchaseOrder | Partial receipt parent display |
| `partial_receipt_origin` | PurchaseOrder | Partial receipt flag |
| `created_by` | PurchaseOrder | LVC creator |
| `approved_by` | PurchaseOrder | LVC approver |
| `approved_at` | PurchaseOrder | LVC approval timestamp |
| `sent_by` | PurchaseOrder | LVC sender |
| `sent_at` | PurchaseOrder | LVC send timestamp (distinct from `servicetitan_sent_on`) |
| `approval_status` | PurchaseOrder | LVC approval decision |
| `approval_history_json` | PurchaseOrder | LVC approval history |
| `notes` | PurchaseOrder | LVC internal notes |
| `lines_sync_status` | PurchaseOrder | Line sync completeness |
| `lines_expected_count` | PurchaseOrder | Line count expected |
| `lines_synced_count` | PurchaseOrder | Line count synced |
| `lines_last_sync_at` | PurchaseOrder | Last line sync attempt |
| `replenishment_id` | PurchaseOrderLine | LVC replenishment linkage |
| `sort_order` | PurchaseOrderLine | LVC display ordering |
| `notes` | PurchaseOrderLine | LVC internal notes |

### 7.8 Readiness Confirmation

| Aspect | Finalized? | Status |
|---|---|---|
| Purchase Order schema | **FINALIZED** | 4 new fields approved; all other proposals evaluated and disposed |
| Purchase Order Line schema | **FINALIZED** | No new fields; all proposals evaluated and disposed |
| Dependency model | **FINALIZED** | Vendor (required), WarehouseLocation (required), Material (required per line), Job (optional snapshot), PO Type (optional snapshot, no dependency) |
| Status normalization | **FINALIZED** | Adapter normalizes case + spelling; unknown values logged; schema enum unchanged |
| Watermark strategy | **FINALIZED** | `modifiedOnOrAfter` primary; `hasMore` for pagination; no sort; 5-min overlap |
| Endpoint path | **FINALIZED** | `/inventory/v2/tenant/{tenant}/purchase-orders` — config correction approved |
| Header-first model | **FINALIZED** | Valid; `lines_sync_status` retained for material dependency tracking |
| PO Type decision | **FINALIZED** | Option B — snapshot fields, no entity, no dependency |
| Inventory Location decision | **FINALIZED** | WarehouseLocation kept; models all location types |
| Schema Promotion Rule | **FINALIZED** | Added to architectural governance; applies to all future domains |

### 7.9 Unresolved Items

| # | Item | Status |
|---|---|---|
| — | NONE | All owner decisions resolved |

---

## FINAL CONCLUSION

STAGE 2E.2A FINAL PURCHASE ORDER RECONCILIATION

READY FOR IMPLEMENTATION