# STAGE 2E.2 — PURCHASE ORDER ARCHITECTURE RECONCILIATION

**Status:** Architectural design review — ZERO implementation, ZERO schema changes
**Date:** 2026-08-03
**Predecessor:** Stage 2E.1 Purchase Order API Verification — COMPLETE
**Evidence Base:** Live ServiceTitan production API (read-only) + official ServiceTitan documentation

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
| Modify schemas | NOT PERFORMED (recommendations only) |

---

## SECTION A — PROVEN API FACTS

*Only information verified by live API responses or official ServiceTitan documentation. No recommendations, no assumptions, no design opinions.*

### A1. Endpoint Paths (Live API)

| Endpoint | Path | HTTP Method | Verified Status |
|---|---|---|---|
| Purchase Orders (list) | `/inventory/v2/tenant/{tenant}/purchase-orders` | GET | HTTP 200 CONFIRMED |
| Purchase Orders (by ID) | `/inventory/v2/tenant/{tenant}/purchase-orders/{id}` | GET | HTTP 200 CONFIRMED |
| Purchase Order Types (list) | `/inventory/v2/tenant/{tenant}/purchase-order-types` | GET | HTTP 200 CONFIRMED |
| Purchase Order Lines (separate) | `/inventory/v2/tenant/{tenant}/purchase-order-lines` | GET | HTTP 404 — DOES NOT EXIST |
| Procurement service prefix | `/procurement/v2/tenant/{tenant}/purchase-orders` | GET | HTTP 404 — WRONG PATH |
| Inventory locations (list) | `/inventory/v2/tenant/{tenant}/inventory-locations` | GET | HTTP 404 — DOES NOT EXIST |

### A2. Authentication (Live API)

| Property | Value |
|---|---|
| Auth type | OAuth 2.0 client_credentials |
| Token endpoint | `https://auth.servicetitan.io/connect/token` |
| API base URL | `https://api.servicetitan.io` |
| Required headers | `Authorization: Bearer {token}`, `ST-App-Key: {appKey}` |
| All required secrets configured | YES |

### A3. Pagination & Filtering (Live API)

| Parameter | Supported | Evidence |
|---|---|---|
| `page` | YES | HTTP 200, page=1 returned records |
| `pageSize` | YES | HTTP 200, pageSize=50 returned 50 records |
| `hasMore` | YES | Boolean field present and populated |
| `totalCount` | UNRELIABLE | Key present but value is null in live response |
| `modifiedOnOrAfter` | YES | HTTP 200, records returned |
| `createdOnOrAfter` | YES | HTTP 200, records returned |
| `active` | YES | HTTP 200, records returned |
| `sort` | NO | HTTP 400 when `sort=modifiedOn desc` provided |

### A4. Purchase Order Header Fields (Live API — 27 fields)

| # | Field | Type | Nullable | Observed Sample Value |
|---|---|---|---|---|
| 1 | `id` | number (int64) | NO | 47478409 |
| 2 | `number` | string | NO | "47459953-001" |
| 3 | `invoiceId` | number | YES | 47459956 |
| 4 | `jobId` | number | YES | 47459953 |
| 5 | `projectId` | number | YES | 47420192 |
| 6 | `status` | string | NO | "Sent" (TitleCase) |
| 7 | `typeId` | number | YES | 143 |
| 8 | `vendorId` | number | NO | 22548912 |
| 9 | `technicianId` | number | YES | 38824573 |
| 10 | `shipTo` | object | YES | {street, unit, city, state, zip, country} |
| 11 | `businessUnitId` | number | YES | 43406729 |
| 12 | `inventoryLocationId` | number | NO | 141 |
| 13 | `batchId` | number | YES | null |
| 14 | `budgetCodeId` | number | YES | null |
| 15 | `vendorDocumentNumber` | string | YES | null |
| 16 | `date` | string (date) | NO | "2026-07-31T00:00:00Z" |
| 17 | `requiredOn` | string (date) | NO | "2026-08-03T00:00:00Z" |
| 18 | `sentOn` | string (date) | YES | "2026-07-31T00:00:00Z" |
| 19 | `receivedOn` | string (date) | YES | null |
| 20 | `createdOn` | string (date-time) | NO | "2026-08-03T12:41:20.9629594Z" |
| 21 | `modifiedOn` | string (date-time) | NO | "2026-08-03T14:13:54.6408868Z" |
| 22 | `total` | number | NO | 876.07 |
| 23 | `tax` | number | NO | 0 |
| 24 | `shipping` | number | NO | 0 |
| 25 | `createdById` | number | YES | 43208838 |
| 26 | `summary` | string | YES | "Robert Kilker" |
| 27 | `items` | array | YES | 4 line objects |
| 28 | `customFields` | object | YES | null |

### A5. Purchase Order Line Fields (Live API — 17 fields, embedded in `items[]`)

| # | Field | Type | Nullable | Observed Sample Value |
|---|---|---|---|---|
| 1 | `id` | number (int64) | NO | 47478414 |
| 2 | `skuId` | number | NO | 38372634 |
| 3 | `skuName` | string | NO | "6\" X 48\" Ventis Class-A..." |
| 4 | `skuCode` | string | NO | "03601669" |
| 5 | `skuType` | string | NO | "Material" |
| 6 | `vendorPartNumber` | string | YES | "" |
| 7 | `quantity` | number | NO | 1 |
| 8 | `quantityReceived` | number | NO | 0 |
| 9 | `cost` | number | NO | 211.01 |
| 10 | `total` | number | NO | 211.01 |
| 11 | `serialNumbers` | array | YES | null |
| 12 | `status` | string | NO | "Sent" (TitleCase) |
| 13 | `chargeable` | boolean | NO | false |
| 14 | `budgetCodeId` | number | YES | null |
| 15 | `description` | string | NO | "6\" X 48\" Ventis Class-A..." |
| 16 | `createdOn` | string (date-time) | NO | "2026-08-03T12:41:21.2174898Z" |
| 17 | `modifiedOn` | string (date-time) | NO | "2026-08-03T14:13:37.6526396Z" |

### A6. Observed Status Values (50 records examined)

| Domain | Observed Values |
|---|---|
| Purchase Order header | `Pending`, `Sent`, `Received`, `Canceled` |
| Purchase Order line | `Pending`, `Sent`, `Received`, `Canceled` |

### A7. Purchase Order Type Fields (Live API — 15 fields)

| # | Field | Type | Nullable | Observed Sample |
|---|---|---|---|---|
| 1 | `id` | number | NO | 146 |
| 2 | `name` | string | NO | "Warranty" |
| 3 | `active` | boolean | NO | true |
| 4 | `automaticallyReceive` | boolean | NO | false |
| 5 | `displayToTechnician` | boolean | NO | false |
| 6 | `impactToTechnicianPayroll` | boolean | NO | false |
| 7 | `allowTechniciansToSendPo` | boolean | NO | false |
| 8 | `defaultRequiredDateDaysOffset` | number | NO | 0 |
| 9 | `skipWeekends` | boolean | NO | true |
| 10 | `excludeTaxFromJobCosting` | boolean | NO | false |
| 11 | `landedCostMethod` | string | NO | "None" |
| 12 | `includeTaxInFullyLandedCost` | boolean | NO | false |
| 13 | `preventJobDetachment` | boolean | NO | false |
| 14 | `createdOn` | string (date-time) | NO | "2018-04-19T00:07:54.8504004Z" |
| 15 | `modifiedOn` | string (date-time) | NO | "2026-06-08T14:01:37.1843065Z" |

### A8. Embedded Line Model (Live API)

| Question | Evidence |
|---|---|
| Lines embedded in header? | YES — `items` array present on every PO record |
| Separate line endpoint exists? | NO — `/inventory/v2/tenant/{tenant}/purchase-order-lines` → HTTP 404 |
| Single-PO GET includes lines? | YES — GET `/purchase-orders/{id}` returns `items` array |
| Lines have immutable IDs? | YES — each line has `id` (number, int64) |
| Lines can arrive separately from header? | NO — always embedded |
| 213 lines examined across 50 POs; all 213 have `id` field | CONFIRMED |

### A9. Inventory Location (Official Documentation)

| Documentation Source | Statement |
|---|---|
| "Set up inventory locations (trucks and warehouses)" | "Set up inventory locations to track and manage where your inventory items are stored. Adding warehouses helps you manage the inventory in your physical warehouse. Adding trucks helps you manage your fleet and inventory items on each truck." |
| Same doc | "Before you add any trucks, you need to add at least one warehouse. All trucks need to be tied to a warehouse." |
| Warehouse types documented | Standalone Warehouse, Warehouse Site, Sub-warehouse |
| `inventoryLocationId` on PO references | EITHER a warehouse OR a truck (per documentation — inventory locations include both) |

### A10. Purchase Order Status Documentation (Official)

| Documentation Source | Statement |
|---|---|
| Purchasing module permissions | "Edit purchase order in **pending** status" |
| Same doc | "Edit purchase order in **sent** or **partially received** status" |
| Same doc | "**Cancel** purchase order" |
| Same doc | "**Receive** purchase order" |

These confirm that beyond the 4 observed values, at minimum `partially_received` exists as a documented PO status.

---

## SECTION B — ARCHITECTURAL RECOMMENDATIONS

*Every recommendation includes: why it is needed, which workflow requires it, what breaks without it.*

### B1. Endpoint Path Correction

**Recommendation:** Change `stPurchaseOrderSyncConfig.ts` endpoint from `/procurement/v2/tenant/{tenant}/purchase-orders` to `/inventory/v2/tenant/{tenant}/purchase-orders`.

| Aspect | Detail |
|---|---|
| Why needed | The approved path returns HTTP 404 — sync cannot fetch any records |
| Which workflow requires it | ALL procurement sync — every mode (dry_run, controlled_batch, bounded_retry, incremental) |
| What breaks without it | Entire Purchase Order sync domain is non-functional; zero records can be imported |

### B2. Schema Field Review (Every Stage 2E.1 Proposal)

#### B2.1 Purchase Order Header Fields

| # | Proposed Field | API Field | Operational Workflow | Needed? | Reason |
|---|---|---|---|---|---|
| 1 | `servicetitan_job_id` | `jobId` | Job Hub — linking procurement to jobs; job cost tracking; project material visibility | **Required schema field** | LVC's Job Hub needs to show POs associated with a job. Without this, the Job-to-PO traceability is lost and procurement cannot be tied to operational job execution. The existing schema has `servicetitan_project_id` as a snapshot but `jobId` is the primary operational link. |
| 2 | `servicetitan_sent_on` | `sentOn` | Procurement lifecycle — vendor lead time calculation; overdue PO tracking; expected delivery estimation | **Required schema field** | The LVC-owned `sent_at` tracks when LVC initiated a send; the ST-owned `sentOn` tracks when ServiceTitan recorded the send. For the procurement lifecycle (calculating lead time, identifying overdue POs), the authoritative ST timestamp is required. Without it, LVC cannot determine when a PO was actually sent to the vendor. |
| 3 | `servicetitan_type_id` | `typeId` | PO categorization display; potential future workflow routing | **Display-only snapshot** | The PO type name is useful for display in PO lists. The behavioral flags (auto-receive, display-to-tech) are ST-side concerns — LVC's workflow is independent. Store as snapshot: `servicetitan_type_id` + `servicetitan_type_name`. See §B3 for full decision. |
| 4 | `servicetitan_type_name` | (from PO Type endpoint) | PO categorization display | **Display-only snapshot** | Same as above — display without raw JSON parsing |
| 5 | `servicetitan_technician_id` | `technicianId` | Technician accountability — which technician requested/receives the PO | **Display-only snapshot** | LVC tracks technician assignments via its own EmployeeRegistry. The ST technicianId is useful for display and audit but LVC does not resolve ST technician IDs to local technician records as a dependency. Store as snapshot for traceability. |
| 6 | `servicetitan_ship_to` | `shipTo` | Receiving — confirming delivery destination; exception handling when ship-to differs from warehouse | **Display-only snapshot** | The ship-to address tells LVC where the vendor will deliver. The `inventoryLocationId` already resolves the warehouse, but `shipTo` may contain a different address (e.g., job site delivery). Store as JSON snapshot for receiving exception handling. |
| 7 | `servicetitan_vendor_document_number` | `vendorDocumentNumber` | Three-way match — matching vendor invoice to PO | **Display-only snapshot** | AP three-way match may need the vendor's document number to correlate bills. Store as snapshot for matching workflow. |
| 8 | `servicetitan_summary` | `summary` | Audit — ST-side memo text | **Raw data only** | LVC has its own `notes` field (LVC-owned). The ST `summary` is display/audit text. Store in `servicetitan_raw_data` — no operational workflow depends on querying this field. |
| 9 | `servicetitan_created_by_id` | `createdById` | Audit — who created the PO in ST | **Raw data only** | LVC has its own `created_by` (LVC-owned). The ST `createdById` is an audit reference. No LVC workflow queries by ST creator. Store in `servicetitan_raw_data`. |
| 10 | `servicetitan_invoice_id` | `invoiceId` | ST internal link to invoice | **Raw data only** | LVC manages invoices separately. The ST `invoiceId` is an internal ST reference. No LVC workflow depends on this. Store in `servicetitan_raw_data`. |
| 11 | `servicetitan_batch_id` | `batchId` | ST batch processing | **Raw data only** | No LVC operational workflow uses batch IDs. Store in `servicetitan_raw_data`. |
| 12 | `servicetitan_budget_code_id` | `budgetCodeId` | Job costing | **Raw data only** | LVC does not currently model budget codes. If job costing needs this in the future, it can be extracted from raw data. Store in `servicetitan_raw_data`. |
| 13 | `servicetitan_business_unit_id` | `businessUnitId` | Business unit reporting | **Raw data only** | LVC does not model business units as a dependency. Store in `servicetitan_raw_data` for future reporting. |

#### B2.2 Purchase Order Line Fields

| # | Proposed Field | API Field | Operational Workflow | Needed? | Reason |
|---|---|---|---|---|---|
| 14 | `servicetitan_description` | `description` | Receiving verification — line description may differ from material name | **Display-only snapshot** | The receiving workflow may need the line description (which can differ from the material's `item_name`) to verify the correct item was received. Store as snapshot. |
| 15 | `servicetitan_sku_type` | `skuType` | Material type snapshot | **Raw data only** | The material type is already on `InventoryMaster.inventory_type`. Duplicating it on the line is redundant. Store in `servicetitan_raw_data`. |
| 16 | `servicetitan_chargeable` | `chargeable` | Billing — whether this line is chargeable to customer | **Raw data only** | The `chargeable_material` flag already exists on `InventoryMaster`. The line-level flag is a snapshot that may differ, but no LVC workflow queries by it. Store in `servicetitan_raw_data`. |
| 17 | `servicetitan_serial_numbers` | `serialNumbers` | Serialized inventory tracking | **Raw data only** | LVC's `InventoryMaster` has `serialized` flag and `inventory_tracking_method`. The line-level serial numbers are useful for serialized receiving, but the current receiving workflow doesn't process serial numbers at line level. Store in `servicetitan_raw_data` until serialized receiving is in scope. |
| 18 | `servicetitan_budget_code_id` | `budgetCodeId` | Job costing | **Raw data only** | Same as header — no current LVC workflow. Store in `servicetitan_raw_data`. |

### B3. Purchase Order Type Decision

**Recommendation: Option B — Snapshot fields only**

| Proposed Fields | `servicetitan_purchase_order_type_id` (string) + `servicetitan_purchase_order_type_name` (string) |
|---|---|

| Option | Assessment |
|---|---|
| A — Separate synchronized entity | REJECTED. PO Type behavioral flags (`automaticallyReceive`, `displayToTechnician`, `allowTechniciansToSendPo`, `landedCostMethod`, etc.) are ST-side configuration. LVC's workflow is governed by `lvc_workflow_status`, not by PO type flags. A separate entity adds sync infrastructure complexity (watermark, adapter, dependency) with no LVC operational workflow consuming the behavioral data. |
| **B — Snapshot fields only** | **APPROVED.** `servicetitan_purchase_order_type_id` + `servicetitan_purchase_order_type_name` on the PurchaseOrder entity. Display and categorization in PO lists without a join. No separate sync entity. No dependency. The behavioral flags remain in `servicetitan_raw_data` if ever needed. |
| C — Raw JSON only | REJECTED. Parsing raw JSON for every PO display is inefficient. A snapshot field enables indexed queries (e.g., "show all Warranty POs") without JSON parsing. |

**Why:** LVC's procurement workflow is governed by `lvc_workflow_status`, which is independent of ST PO Type flags. The PO type is a categorization label for display and filtering. Snapshot fields provide this without the overhead of a separate entity, watermark, or dependency chain.

**What breaks without it:** Without the snapshot, the PO type would need to be extracted from `servicetitan_raw_data` on every display — inefficient for list views. With the snapshot, POs can be filtered/grouped by type in the UI without JSON parsing.

### B4. Inventory Location Reconciliation

**Recommendation: KEEP `WarehouseLocation` — do not rename to `InventoryLocation`**

| Question | Answer | Evidence |
|---|---|---|
| Does `inventoryLocationId` reference warehouses only? | NO | Documentation: "inventory locations" = trucks + warehouses |
| Does `inventoryLocationId` reference trucks? | YES | Documentation: "Adding trucks helps you manage your fleet and inventory items on each truck" |
| Does it reference staging/transfer locations? | Not documented | No evidence of staging/transfer as separate location types |
| Does WarehouseLocation model both? | YES | `location_type` enum includes: warehouse, overflow_warehouse, truck, vendor, job_site, damaged_inventory, warranty_returns, returned_goods, in_transit |
| Is WarehouseLocation correct? | YES — the model already covers all inventory location types | The name "WarehouseLocation" is a historical misnomer, but the entity models all location types including trucks |

| Aspect | Detail |
|---|---|
| Why no rename | The `WarehouseLocation` entity already has `location_type` covering warehouses, trucks, and 7 other types. The `servicetitan_warehouse_id` field on PurchaseOrder correctly maps to `inventoryLocationId` and resolves against `WarehouseLocation.filter({ servicetitan_warehouse_id })` regardless of location type. Renaming would be cosmetic — no operational evidence supports it. |
| Which workflow requires it | PO dependency resolution — `inventoryLocationId` → `WarehouseLocation` lookup |
| What breaks if renamed | Nothing breaks, but renaming creates churn across the entire codebase (entity, all references, all sync configs) for zero operational gain |

**Risk noted:** The `servicetitan_warehouse_id` field name on PurchaseOrder is technically a misnomer (it references any inventory location, not just warehouses). However, the resolution logic is correct. The name is preserved for stability.

### B5. Status Reconciliation

#### B5.1 Observed vs Documented vs Approved

| Source | Status Values |
|---|---|
| **Observed (live API, 50 records)** | `Pending`, `Sent`, `Received`, `Canceled` |
| **Documented (permissions)** | `pending`, `sent`, `partially received`, `received` (implied), `cancel` (implied) |
| **Approved LVC schema** | `draft`, `approved`, `sent`, `vendor_confirmed`, `partially_received`, `received`, `closed`, `cancelled` |

#### B5.2 Assessment

| Question | Answer |
|---|---|
| Do the 4 observed values represent the complete lifecycle? | **NO** — documentation explicitly mentions "partially received" status, which was not in the 50-record sample |
| Should unobserved schema values be removed? | **NO** — `approved`, `vendor_confirmed`, `partially_received`, `closed` may exist in the API but were not present in the sample. No official documentation or API metadata proves they don't exist. Removing them risks breaking lifecycle handling for rare-but-real statuses. |

#### B5.3 Normalization Table

| API Value (TitleCase) | LVC Schema Value (lowercase) | Mapping Confidence | Evidence |
|---|---|---|---|
| `Pending` | `draft` | HIGH — "pending" = not yet sent/approved; schema's `draft` is the pre-sent state | Observed + documented "pending status" |
| `Sent` | `sent` | HIGH — direct match (case normalization) | Observed + documented "sent status" |
| `Received` | `received` | HIGH — direct match (case normalization) | Observed |
| `Canceled` | `cancelled` | HIGH — spelling normalization (one L → two Ls) | Observed + documented "cancel" |
| `Partially Received` | `partially_received` | HIGH — documented in permissions ("partially received status") | Documented (not observed in sample) |
| `Approved` | `approved` | MEDIUM — likely exists as intermediate state between pending and sent | Not observed, not explicitly documented |
| `Vendor Confirmed` | `vendor_confirmed` | LOW — may not exist as a discrete API status | Not observed, not documented |
| `Closed` | `closed` | MEDIUM — likely exists as post-received terminal state | Not observed, not documented |
| (unknown) | — | ADAPTER MUST: log + classify as `conflict` or defer for review | Unknown values must not silently map |

#### B5.4 Normalization Strategy

| Aspect | Recommendation |
|---|---|
| Case normalization | YES — adapter normalizes API TitleCase → schema lowercase |
| Spelling normalization | YES — adapter normalizes `Canceled` → `cancelled` |
| Unknown value handling | ADAPTER MUST log unknown values and classify the record for manual review; do NOT silently map to a wrong value |
| Schema change | NO — do not remove unobserved values from the schema enum; they may exist in the API |

### B6. Embedded Line Model — `lines_sync_status` Assessment

**Recommendation: KEEP `lines_sync_status` — it retains operational value**

| Use Case | Retains Value? | Reason |
|---|---|---|
| Dependency resolution | **YES** | When a line's `skuId` cannot resolve to a local `InventoryMaster`, that line is deferred. `lines_sync_status` = `partial` tracks this. |
| Deferred material mapping | **YES** | `lines_synced_count` < `lines_expected_count` when lines are deferred. This drives retry logic. |
| Partial persistence | **YES** | A PO header can be created while individual lines are deferred (material missing). `lines_sync_status` distinguishes "all lines synced" from "some lines deferred". |
| Retry recovery | **YES** | On retry, `lines_sync_status` tells the adapter which lines still need resolution. |
| Audit | **YES** | Provides a record of sync completeness per PO. |
| Separate endpoint pagination | NO | Not applicable — lines are embedded, not separately paginated |

**Conclusion:** `lines_sync_status` remains necessary because material dependency resolution can still defer individual lines even though lines arrive embedded with the header. The semantics simplify (it tracks material dependency resolution, not separate-endpoint pagination) but the field retains operational value.

**No simplification recommended** — the existing `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, and `lines_last_sync_at` fields are all needed for deferred-line retry tracking.

---

## 7. REQUIRED SCHEMA UPDATES

### 7.1 Required Before Implementation (Blockers)

| # | Change | Type | File | Reason |
|---|---|---|---|---|
| 1 | Fix endpoint path: `/procurement/v2/` → `/inventory/v2/` | Config fix | `stPurchaseOrderSyncConfig.ts` | BLOCKER — current path returns HTTP 404 |

### 7.2 Recommended Enhancements (Helpful but not blockers)

| # | Change | Entity | Field(s) | Type | Owner | Reason |
|---|---|---|---|---|---|---|
| 2 | Add job ID snapshot | PurchaseOrder | `servicetitan_job_id` | string | ST-owned | Job Hub traceability — links PO to job |
| 3 | Add ST sent timestamp | PurchaseOrder | `servicetitan_sent_on` | string (date-time) | ST-owned | Procurement lifecycle — vendor lead time, overdue tracking |
| 4 | Add PO type snapshot | PurchaseOrder | `servicetitan_purchase_order_type_id` + `servicetitan_purchase_order_type_name` | string + string | ST-owned | Display and categorization without raw JSON parsing |
| 5 | Add technician snapshot | PurchaseOrder | `servicetitan_technician_id` | string | ST-owned | Technician accountability traceability |
| 6 | Add ship-to snapshot | PurchaseOrder | `servicetitan_ship_to` | string (JSON) | ST-owned | Receiving exception handling when ship-to differs from warehouse |
| 7 | Add vendor document number | PurchaseOrder | `servicetitan_vendor_document_number` | string | ST-owned | Three-way match — vendor invoice correlation |
| 8 | Add line description | PurchaseOrderLine | `servicetitan_description` | string | ST-owned | Receiving verification — line description may differ from material name |

### 7.3 Do Not Add (Raw Data Only)

| # | API Field | Stored In | Reason |
|---|---|---|---|
| 9 | `summary` | `servicetitan_raw_data` | LVC has its own `notes`; ST summary is audit text only |
| 10 | `createdById` | `servicetitan_raw_data` | LVC has its own `created_by`; ST creator is audit reference only |
| 11 | `invoiceId` | `servicetitan_raw_data` | LVC manages invoices separately; ST internal reference |
| 12 | `batchId` | `servicetitan_raw_data` | No LVC workflow uses batch IDs |
| 13 | `budgetCodeId` | `servicetitan_raw_data` | LVC does not model budget codes |
| 14 | `businessUnitId` | `servicetitan_raw_data` | LVC does not model business units as dependency |
| 15 | `customFields` | `servicetitan_raw_data` | Already planned for raw storage |
| 16 | `skuType` (line) | `servicetitan_raw_data` | Already on `InventoryMaster.inventory_type` |
| 17 | `chargeable` (line) | `servicetitan_raw_data` | Already on `InventoryMaster.chargeable_material` |
| 18 | `serialNumbers` (line) | `servicetitan_raw_data` | Serialized receiving not in current scope |
| 19 | `budgetCodeId` (line) | `servicetitan_raw_data` | No LVC workflow uses budget codes |

---

## 8. FINALIZED PURCHASE ORDER SCHEMA

### 8.1 Field Classification

| Classification | Fields |
|---|---|
| **Immutable identity** | `servicetitan_purchase_order_id` (header), `servicetitan_po_line_id` (line) |
| **ST-owned (overwritten by sync)** | `status`, `servicetitan_po_number`, `order_date`, `expected_delivery_date`, `actual_delivery_date`, `vendor_name`, `warehouse_name`, `subtotal`, `tax_amount`, `shipping_amount`, `total`, `line_count`, `total_quantity_ordered`, `total_quantity_received`, `received_percentage`, `vendor_confirmed_at`, `closed_at`, `cancelled_at`, `cancellation_reason`, `servicetitan_active`, `servicetitan_vendor_id`, `servicetitan_warehouse_id`, `servicetitan_project_id`, **NEW: `servicetitan_job_id`, `servicetitan_sent_on`, `servicetitan_purchase_order_type_id`, `servicetitan_purchase_order_type_name`, `servicetitan_technician_id`, `servicetitan_ship_to`, `servicetitan_vendor_document_number`** |
| **LVC-owned (protected from sync)** | `po_number`, `lvc_workflow_status`, `replenishment_origin`, `replenishment_ids`, `parent_po_id`, `parent_po_number`, `partial_receipt_origin`, `created_by`, `approved_by`, `approved_at`, `sent_by`, `sent_at`, `approval_status`, `approval_history_json`, `notes` |
| **Derived (computed, not stored from API)** | `subtotal` (derivable: total - tax - shipping), `line_count` (from items.length), `total_quantity_ordered` (sum of items[].quantity), `total_quantity_received` (sum of items[].quantityReceived), `received_percentage` (derived) |
| **Snapshot (display-only, denormalized)** | `vendor_name`, `warehouse_name`, **NEW: `servicetitan_purchase_order_type_name`, `servicetitan_ship_to`** |
| **Raw-data-only** | `summary`, `createdById`, `invoiceId`, `batchId`, `budgetCodeId`, `businessUnitId`, `customFields` (header); `skuType`, `chargeable`, `serialNumbers`, `budgetCodeId` (line) |
| **Workflow fields** | `lvc_workflow_status`, `approval_status`, `approval_history_json` |
| **Sync infrastructure** | `servicetitan_sync_status`, `servicetitan_last_sync`, `servicetitan_last_event_at`, `servicetitan_modified_on`, `servicetitan_created_on`, `servicetitan_sync_version`, `servicetitan_source`, `servicetitan_raw_data`, `import_source`, `imported_at` |
| **Line sync tracking** | `lines_sync_status`, `lines_expected_count`, `lines_synced_count`, `lines_last_sync_at` |

### 8.2 Purchase Order Line Classification

| Classification | Fields |
|---|---|
| **Immutable identity** | `servicetitan_po_line_id` |
| **ST-owned** | `sku`, `item_name`, `vendor_sku`, `quantity_ordered`, `quantity_received`, `unit_cost`, `line_total`, `line_status`, `servicetitan_material_id`, **NEW: `servicetitan_description`** |
| **LVC-owned** | `unit_of_measure` (if LVC overrides), `quantity_outstanding` (derived), `replenishment_id`, `sort_order`, `notes` |
| **Derived** | `quantity_outstanding` (quantity_ordered - quantity_received) |
| **Raw-data-only** | `skuType`, `chargeable`, `serialNumbers`, `budgetCodeId` |

---

## 9. FINAL IMPLEMENTATION READINESS

| Aspect | Finalized? | Status |
|---|---|---|
| Purchase Order schema | **FINALIZED (pending owner approval of 7 new fields)** | 7 recommended fields identified; 11 fields confirmed as raw-data-only; no fields removed |
| Purchase Order Line schema | **FINALIZED (pending owner approval of 1 new field)** | 1 recommended field (`servicetitan_description`); 4 fields confirmed as raw-data-only |
| Dependency model | **FINALIZED** | Vendor (required), InventoryLocation/WarehouseLocation (required), Material (required per line), Job (optional snapshot), PO Type (optional snapshot). No new dependencies. |
| Status normalization | **FINALIZED** | Adapter normalizes case + spelling; unknown values logged + deferred; schema enum unchanged |
| Watermark strategy | **FINALIZED** | `modifiedOnOrAfter` as primary; `hasMore` for pagination (totalCount unreliable); 5-minute overlap; no sort reliance |
| Endpoint path | **FINALIZED (pending owner approval)** | `/inventory/v2/tenant/{tenant}/purchase-orders` — config fix required |
| Header-first model | **FINALIZED** | Valid — lines embedded; `lines_sync_status` retained for material dependency tracking |
| PO Type decision | **FINALIZED** | Option B — snapshot fields (type_id + type_name) |
| Inventory Location decision | **FINALIZED** | Keep WarehouseLocation — already models all location types |

### Unresolved Items

| # | Item | Resolution Required |
|---|---|---|
| 1 | Owner approval of 7 new header fields | Owner must approve before schema update |
| 2 | Owner approval of 1 new line field | Owner must approve before schema update |
| 3 | Owner approval of endpoint path fix | Owner must approve config change |
| 4 | Owner approval of PO Type Option B | Owner must confirm snapshot approach |

---

## FINAL CONCLUSION

STAGE 2E.2 PURCHASE ORDER ARCHITECTURE RECONCILIATION

ADDITIONAL OWNER DECISION REQUIRED