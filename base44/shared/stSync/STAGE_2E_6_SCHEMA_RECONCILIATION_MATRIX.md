# Stage 2E.6 — Purchase-Order Sync Foundation Schema Reconciliation Matrix

Stage: 2E.6 (Procurement PO sync foundation) — ServiceTitan → LVC OS only.
Scope: `PurchaseOrder` header + `PurchaseOrderLine`. Receipts, bills, transfers, adjustments, invoices, estimates, and projects are OUT OF SCOPE for this stage.

Source-of-truth contracts:
- ServiceTitan observed shape: verified Stage 2E.5 GET-only responses from `/inventory/v2/tenant/{tenant}/purchase-orders` (lines embedded in `items[]`).
- LVC OS canonical schemas: `base44/entities/PurchaseOrder.jsonc`, `base44/entities/PurchaseOrderLine.jsonc`.
- Adapter/domain service: `base44/shared/stSync/adapters/purchaseOrderAdapter.ts`, `base44/shared/stPurchaseOrderSync.ts`.

Field-ownership rule: ServiceTitan-owned fields are overwritten on update; LVC-owned fields are NEVER touched by sync; non-promoted ST fields are preserved verbatim in `servicetitan_raw_data`.

## Header — Promoted Fields

| ServiceTitan path | Observed type | Canonical field | Canonical type | Nullable | Normalization rule | Default | Validation / rejection | Persisted | Ignored? |
|---|---|---|---|---|---|---|---|---|---|
| `id` | number (int64) | `servicetitan_purchase_order_id` | string | no | `normalizePoId` → string (int64-safe) | — | missing → record FAILED (`Missing source ID`) | yes | no |
| `number` | string | `servicetitan_po_number` | string | yes | `normalizeString` | "" | — | yes | no |
| `status` | string (TitleCase) | `status` | enum(`draft`..`cancelled`) | yes | `normalizePoStatus` lowercases; `pending→draft`, `sent→sent`, `received→received`, `canceled→cancelled`, `partially received→partially_received` | `draft` | unknown → `status_unknown`, not silently mapped; **eligibility: only `draft`/`sent` processed, else skipped** | yes | no |
| `vendorId` | number (int64) | `servicetitan_vendor_id` | string | no | `normalizePoId` → string | — | missing → deferred `VENDOR_MISSING_ID`; unresolved → deferred | yes | no |
| `inventoryLocationId` | number (int64) | `servicetitan_warehouse_id` | string | no | `normalizePoId` → string | — | missing → deferred `WAREHOUSE_MISSING_ID` | yes | no |
| (resolved) | — | `vendor_id` / `vendor_name` | string | yes | resolved from local Vendor by `servicetitan_vendor_id` | null | unresolved → deferred | yes | no |
| (resolved) | — | `warehouse_location_id` / `warehouse_name` | string | yes | resolved from local WarehouseLocation by `servicetitan_warehouse_id` | null | missing/ambiguous/inactive → deferred with stable code | yes | no |
| `projectId` | number (int64) | `servicetitan_project_id` | string | yes | `normalizePoId` → string | null | non-blocking | yes (display) | no |
| `jobId` | number (int64) | `servicetitan_job_id` | string | yes | `normalizePoId` → string | null | non-blocking | yes (display) | no |
| `typeId` | number (int64) | `servicetitan_purchase_order_type_id` | string | yes | `normalizePoId`; name resolved from PO Types endpoint cache | null | name unresolved → warning, non-deferring | yes | no |
| `date` | string(date) | `order_date` | date | yes | passthrough | null | — | yes | no |
| `requiredOn` | string(date) | `expected_delivery_date` | date | yes | passthrough | null | — | yes | no |
| `receivedOn` | string(date) | `actual_delivery_date` | date | yes | passthrough | null | — | yes | no |
| `sentOn` | string(date-time) | `servicetitan_sent_on` | date-time | yes | passthrough | null | — | yes | no |
| `total` | number | `total` | number | no | `normalizeNumber` | 0 | — | yes | no |
| `tax` | number | `tax_amount` | number | no | `normalizeNumber` | 0 | — | yes | no |
| `shipping` | number | `shipping_amount` | number | no | `normalizeNumber` | 0 | — | yes | no |
| (derived) | — | `subtotal` | number | no | `total - tax - shipping` | 0 | — | yes | no |
| `items[].length` | — | `line_count` | number | no | derived | 0 | — | yes | no |
| (derived) | — | `total_quantity_ordered` | number | no | sum `items[].quantity` | 0 | — | yes | no |
| (derived) | — | `total_quantity_received` | number | no | sum `items[].quantityReceived` | 0 | — | yes | no |
| (derived) | — | `received_percentage` | number | no | `received/ordered*100` | 0 | — | yes | no |
| `createdOn` | string(date-time) | `servicetitan_created_on` | date-time | yes | passthrough | null | used for activation eligibility | yes | no |
| `modifiedOn` | string(date-time) | `servicetitan_modified_on` | date-time | yes | passthrough | null | malformed → `invalid_incoming` → stale-skip | yes | no |
| `modifiedOn` | — | `servicetitan_last_event_at` | date-time | yes | `modifiedOn || now` | now | event ordering | yes | no |
| — | — | `servicetitan_sync_status` | enum | no | set `synced` on success | synced | — | yes | no |
| — | — | `servicetitan_sync_version` | number | no | incremented on update | 1 | — | yes | no |
| — | — | `servicetitan_active` | boolean | no | `true` (ST active flag mirrored separately) | true | — | yes | no |
| — | — | `servicetitan_source` | enum | no | from context (`webhook`/`api`/`manual`) | — | — | yes | no |
| — | — | `import_source` / `imported_at` | enum/date-time | yes | from context | now | — | yes | no |

## Header — Non-Promoted Fields (preserved in `servicetitan_raw_data`)

| ServiceTitan path | Preserved in raw_data | Reason ignored at field level |
|---|---|---|
| `summary`, `createdById`, `invoiceId`, `batchId`, `budgetCodeId`, `businessUnitId`, `technicianId`, `shipTo`, `vendorDocumentNumber`, `customFields` | yes | No LVC operational workflow queries them (Stage 2E.2A Schema Promotion Rule). Auditable via raw_data. |
| any other unknown key | yes | Forward-compatible preservation; no lossy discard. |

Explicit `null` vs missing: `buildPoRawData` preserves a field only when `record[key] !== undefined`. An explicit `null` is preserved in raw_data; an absent key is omitted. Promoted fields use `x || null`, so both absent and explicit-null normalize to canonical `null` (no distinction loss for promoted fields).

## Line — Promoted Fields

| ServiceTitan path | Observed type | Canonical field | Canonical type | Nullable | Normalization | Default | Validation / rejection | Persisted |
|---|---|---|---|---|---|---|---|---|
| `items[].id` | number (int64) | `servicetitan_po_line_id` | string | no | `normalizePoId` → string | — | missing → line FAILED (`LINE_MISSING_ID`) | yes |
| `items[].skuId` | number (int64) | `servicetitan_material_id` | string | no | `normalizePoId` → string | — | missing → deferred `MATERIAL_MISSING_ID` | yes |
| (resolved) | — | `inventory_master_id` | string | yes | resolved from InventoryMaster by `servicetitan_material_id` | null | missing/ambiguous/inactive → deferred with stable code | yes |
| `items[].skuCode` | string | `sku` | string | yes | `normalizeString` | "" | — | yes |
| `items[].skuName` | string | `item_name` | string | yes | `normalizeString` | "" | — | yes |
| `items[].vendorPartNumber` | string | `vendor_sku` | string | yes | `normalizeString` | "" | — | yes |
| `items[].quantity` | number | `quantity_ordered` | number | no | `normalizeNumber` | 0 | — | yes |
| `items[].quantityReceived` | number | `quantity_received` | number | no | `normalizeNumber` | 0 | — | yes |
| (derived) | — | `quantity_outstanding` | number | no | `ordered - received` | 0 | — | yes |
| `items[].cost` | number | `unit_cost` | number | no | `normalizeNumber` | 0 | — | yes |
| `items[].total` | number | `line_total` | number | no | `normalizeNumber` | 0 | — | yes |
| `items[].status` | string (TitleCase) | `line_status` | enum | yes | `normalizePoLineStatus` (`open`/`partially_received`/`received`/`cancelled`; `pending`/`sent`→`open`) | `open` | unknown → kept raw, flagged | yes |
| `items[].createdOn` / `modifiedOn` | string(date-time) | `servicetitan_created_on` / `servicetitan_modified_on` | date-time | yes | passthrough | null | stale protection on line modifiedOn | yes |

## Line — Non-Promoted Fields (preserved in line `servicetitan_raw_data`)

`skuType`, `chargeable`, `description`, `serialNumbers`, `budgetCodeId`, and any unknown key are preserved in line `servicetitan_raw_data`.

## Out-of-Scope Confirmation

- Receipts, bills, warehouse transfers, inventory adjustments: NOT imported by Stage 2E.6 (Stage 2E.5 verified receipts/bills unavailable under the tested procurement API).
- Invoices, estimates, projects: NOT imported. Customer/Job/Appointment sync contracts unchanged.
- Pricing engine: untouched.

## Reason-Code Vocabulary (Stage 2E.6)

Eligibility: `pre_activation`, `no_activation_ts`, `missing_created_on`, `invalid_timestamp`, `status_missing`, `status_unknown`, `status_not_pending_or_sent`.
Warehouse dependency: `WAREHOUSE_MISSING_ID`, `WAREHOUSE_MISSING`, `WAREHOUSE_AMBIGUOUS`, `WAREHOUSE_INACTIVE`, `WAREHOUSE_LOOKUP_ERROR`.
Material dependency (line): `MATERIAL_MISSING_ID`, `MATERIAL_MISSING`, `MATERIAL_AMBIGUOUS`, `MATERIAL_INACTIVE`, `MATERIAL_LOOKUP_ERROR`.
Line structural: `LINE_MISSING_ID`.