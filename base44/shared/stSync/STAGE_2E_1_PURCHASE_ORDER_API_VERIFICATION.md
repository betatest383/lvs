# STAGE 2E.1 — PURCHASE ORDER API VERIFICATION

**Status:** Read-only verification — ZERO writes, ZERO imports, ZERO watermark activation
**Date:** 2026-08-03
**Predecessor:** Stage 2E Schema and Architecture Reconciliation — APPROVED
**Verification Method:** Live ServiceTitan production API calls (read-only) + production API documentation

---

## PROHIBITED WORK CONFIRMATION

| Prohibited Action | Status |
|---|---|
| Create adapters | NOT PERFORMED |
| Create domain services | NOT PERFORMED |
| Create entities | NOT PERFORMED |
| Activate watermarks | NOT PERFORMED |
| Import records | NOT PERFORMED |
| Enable schedulers | NOT PERFORMED |
| Write synchronization code | NOT PERFORMED |
| Modify schemas | NOT PERFORMED (differences reported only) |

---

## 1. ENDPOINT SUMMARY

### 1.1 Purchase Orders

| Property | Approved Config | Live API Evidence | Match? |
|---|---|---|---|
| Endpoint path | `/procurement/v2/tenant/{tenant}/purchase-orders` | `/inventory/v2/tenant/{tenant}/purchase-orders` | **NO — WRONG SERVICE** |
| HTTP method | GET | GET | YES |
| Records array key | (unspecified) | `data` | — |
| Pagination model | page-based | page-based (`page`, `pageSize`, `hasMore`) | YES |
| Page size limit | 50 (config) | API accepted pageSize=50 | YES |
| `modifiedOnOrAfter` filter | Assumed supported | **CONFIRMED — HTTP 200** | YES |
| `createdOnOrAfter` filter | (unspecified) | **CONFIRMED — HTTP 200** | YES |
| `active` filter | (unspecified) | **CONFIRMED — HTTP 200** | YES |
| `sort` parameter | (unspecified) | **NOT SUPPORTED — HTTP 400 on `sort=modifiedOn desc`** | — |
| Single-record GET by ID | (unspecified) | **CONFIRMED — `/purchase-orders/{id}` HTTP 200, includes `items` array** | — |
| `totalCount` field | Assumed present | Key present in response but value **null** — unreliable for count estimation | **NO** |
| `hasMore` field | Assumed present | **CONFIRMED — boolean, reliable** | YES |

**CRITICAL FINDING:** The approved endpoint path `/procurement/v2/tenant/{tenant}/purchase-orders` returns **HTTP 404**. The correct path is `/inventory/v2/tenant/{tenant}/purchase-orders`. The `stPurchaseOrderSyncConfig.ts` file uses the wrong service prefix.

### 1.2 Purchase Order Types

| Property | Live API Evidence |
|---|---|
| Endpoint path | `/inventory/v2/tenant/{tenant}/purchase-order-types` |
| HTTP method | GET |
| Records array key | `data` |
| Pagination | page-based (`page`, `pageSize`, `hasMore`) |
| `modifiedOnOrAfter` filter | Supported (per documentation) |
| `createdOnOrAfter` filter | Supported (per documentation) |
| `active` filter | Supported (per documentation) |

**Note:** The `/procurement/v2/tenant/{tenant}/purchase-order-types` path also returns **HTTP 404**. Both PO and PO Type endpoints live under `/inventory/v2/`, not `/procurement/v2/`.

### 1.3 Authentication

| Property | Evidence |
|---|---|
| Auth type | OAuth 2.0 client_credentials |
| Token endpoint | `https://auth.servicetitan.io/connect/token` |
| API base URL | `https://api.servicetitan.io` |
| Required headers | `Authorization: Bearer {token}`, `ST-App-Key: {appKey}` |
| Required secrets | `SERVICETITAN_CLIENT_ID`, `SERVICETITAN_CLIENT_SECRET`, `SERVICETITAN_APP_KEY`, `SERVICETITAN_TENANT_ID` |
| All secrets configured? | YES |

---

## 2. IMMUTABLE IDENTITY TABLE

### 2.1 Purchase Order Header

| Entity | API Field | API Type | Nullable | Stability | Safe as Immutable Identity? | Schema Field |
|---|---|---|---|---|---|---|
| Purchase Order | `id` | number (int64) | NO | Permanent, never reused | **YES** | `servicetitan_purchase_order_id` (string) ✓ |

### 2.2 Purchase Order Line

| Entity | API Field | API Type | Nullable | Stability | Safe as Immutable Identity? | Schema Field |
|---|---|---|---|---|---|---|
| PO Line | `id` (within `items[]`) | number (int64) | NO | Permanent, never reused | **YES** | `servicetitan_po_line_id` (string) ✓ |

### 2.3 Referenced Entities (Dependency Identities)

| Entity | API Field on PO | API Type | Nullable | Safe as Immutable Identity? | Schema Resolution Field |
|---|---|---|---|---|---|
| Vendor | `vendorId` | number (int64) | NO | YES | `servicetitan_vendor_id` ✓ |
| Inventory Location | `inventoryLocationId` | number (int64) | NO | YES | `servicetitan_warehouse_id` ✓ |
| Material | `skuId` (on line) | number (int64) | NO | YES | `servicetitan_material_id` ✓ |
| Job | `jobId` | number (int64) | YES | YES | (not in schema — see §4) |
| Project | `projectId` | number (int64) | YES | YES | `servicetitan_project_id` ✓ |
| Business Unit | `businessUnitId` | number (int64) | YES | YES | (not in schema — see §4) |
| Technician | `technicianId` | number (int64) | YES | YES | (not in schema — see §4) |
| PO Type | `typeId` | number (int64) | YES | YES | (not in schema — see §4) |

**Int64 Safety:** All API IDs are `number` (int64). The schema stores them as `string` — this is correct and prevents JavaScript int64 precision loss.

---

## 3. PURCHASE ORDER HEADER — FIELD COMPATIBILITY MATRIX

### Live API Fields (27 fields observed)

| # | API Field | API Type | Approved Schema Field | Schema Type | Compatibility |
|---|---|---|---|---|---|
| 1 | `id` | number | `servicetitan_purchase_order_id` | string | COMPATIBLE (int64-safe string) |
| 2 | `number` | string | `servicetitan_po_number` | string | COMPATIBLE |
| 3 | `status` | string | `status` | string (enum) | **DIFFERENT VALUES — see §5** |
| 4 | `vendorId` | number | `servicetitan_vendor_id` | string | COMPATIBLE (dependency) |
| 5 | `inventoryLocationId` | number | `servicetitan_warehouse_id` | string | COMPATIBLE — **but see §8 (inventory location vs warehouse)** |
| 6 | `projectId` | number | `servicetitan_project_id` | string | COMPATIBLE |
| 7 | `jobId` | number | — | — | **MISSING — requires schema update** |
| 8 | `typeId` | number | — | — | **MISSING — requires schema update** |
| 9 | `technicianId` | number | — | — | **MISSING — requires schema update** |
| 10 | `businessUnitId` | number | — | — | **MISSING — requires schema update** |
| 11 | `date` | string (date) | `order_date` | string (date) | COMPATIBLE |
| 12 | `requiredOn` | string (date) | `expected_delivery_date` | string (date) | COMPATIBLE |
| 13 | `receivedOn` | string (date, nullable) | `actual_delivery_date` | string (date) | COMPATIBLE (nullable mapping) |
| 14 | `sentOn` | string (date) | — | — | **MISSING — requires schema update** (schema has LVC-owned `sent_at` but no ST-owned `sent_on`) |
| 15 | `total` | number | `total` | number | COMPATIBLE |
| 16 | `tax` | number | `tax_amount` | number | COMPATIBLE |
| 17 | `shipping` | number | `shipping_amount` | number | COMPATIBLE |
| 18 | `createdOn` | string (date-time) | `servicetitan_created_on` | string (date-time) | COMPATIBLE |
| 19 | `modifiedOn` | string (date-time) | `servicetitan_modified_on` | string (date-time) | COMPATIBLE |
| 20 | `createdById` | number | — | — | **MISSING — requires schema update** (schema has LVC-owned `created_by` but no ST-owned `created_by_id`) |
| 21 | `summary` | string | — | — | **MISSING — requires schema update** (schema has LVC-owned `notes` but no ST-owned `summary`) |
| 22 | `shipTo` | object | — | — | **MISSING — requires schema update** |
| 23 | `invoiceId` | number (nullable) | — | — | **MISSING — requires schema update** |
| 24 | `vendorDocumentNumber` | string (nullable) | — | — | **MISSING — requires schema update** |
| 25 | `batchId` | number (nullable) | — | — | **MISSING — requires schema update** |
| 26 | `budgetCodeId` | number (nullable) | — | — | **MISSING — requires schema update** |
| 27 | `customFields` | object (nullable) | `servicetitan_raw_data` | string | COMPATIBLE (store in raw_data) |
| 28 | `items` | array | (line records) | — | COMPATIBLE — lines embedded, see §6 |
| — | — | — | `servicetitan_active` | boolean | **NO API FIELD** — PO header has no `active` boolean; default=true is acceptable |
| — | — | — | `subtotal` | number | **NO API FIELD** — API does not expose subtotal; derivable as total - tax - shipping |
| — | — | — | `line_count` | number | **NO API FIELD** — derivable from `items.length` |
| — | — | — | `total_quantity_ordered` | number | **NO API FIELD** — derivable from sum of items[].quantity |
| — | — | — | `total_quantity_received` | number | **NO API FIELD** — derivable from sum of items[].quantityReceived |
| — | — | — | `received_percentage` | number | **NO API FIELD** — derivable |
| — | — | — | `vendor_name` | string | **NO API FIELD** — resolvable from Vendor entity |
| — | — | — | `warehouse_name` | string | **NO API FIELD** — resolvable from WarehouseLocation entity |

### Header Summary

| Category | Count |
|---|---|
| COMPATIBLE (direct or derivable) | 18 |
| MISSING from schema (requires update) | 11 |
| Different name but compatible | 0 |
| Different type | 0 |
| In schema but not in API | 7 (all derivable or LVC-owned) |

---

## 4. PURCHASE ORDER LINES — FIELD COMPATIBILITY MATRIX

### 4.1 Lines Are EMBEDDED in Header

| Question | Answer | Evidence |
|---|---|---|
| Are PO lines embedded in the header? | **YES** | `items` array present on every PO record |
| Is there a separate line endpoint? | **NO** | `/inventory/v2/tenant/{tenant}/purchase-order-lines` → HTTP 404 |
| Does single-PO GET include lines? | **YES** | GET `/purchase-orders/{id}` returns `items` array |
| Do lines have immutable IDs? | **YES** | Each line has `id` (number, int64) |
| Can lines arrive separately from header? | **NO** | Lines always travel with the header |

### 4.2 Line Field Matrix (17 fields observed)

| # | API Field | API Type | Approved Schema Field | Schema Type | Compatibility |
|---|---|---|---|---|---|
| 1 | `id` | number | `servicetitan_po_line_id` | string | COMPATIBLE (int64-safe) |
| 2 | `skuId` | number | `servicetitan_material_id` | string | COMPATIBLE (dependency) |
| 3 | `skuCode` | string | `sku` | string | COMPATIBLE |
| 4 | `skuName` | string | `item_name` | string | COMPATIBLE |
| 5 | `skuType` | string | — | — | **MISSING — requires schema update** |
| 6 | `vendorPartNumber` | string | `vendor_sku` | string | COMPATIBLE |
| 7 | `quantity` | number | `quantity_ordered` | number | COMPATIBLE |
| 8 | `quantityReceived` | number | `quantity_received` | number | COMPATIBLE |
| 9 | `cost` | number | `unit_cost` | number | COMPATIBLE |
| 10 | `total` | number | `line_total` | number | COMPATIBLE |
| 11 | `status` | string | `line_status` | string (enum) | **DIFFERENT VALUES — see §5** |
| 12 | `chargeable` | boolean | — | — | **MISSING — requires schema update** |
| 13 | `description` | string | — | — | **MISSING — requires schema update** |
| 14 | `serialNumbers` | array (nullable) | — | — | **MISSING — requires schema update** (serialized tracking) |
| 15 | `budgetCodeId` | number (nullable) | — | — | **MISSING — requires schema update** |
| 16 | `createdOn` | string (date-time) | `servicetitan_created_on` | string (date-time) | COMPATIBLE |
| 17 | `modifiedOn` | string (date-time) | `servicetitan_modified_on` | string (date-time) | COMPATIBLE |
| — | — | — | `unit_of_measure` | string | **NO API FIELD** — not exposed on line (exists on material) |
| — | — | — | `quantity_outstanding` | number | **NO API FIELD** — derivable (quantity - quantityReceived) |
| — | — | — | `sort_order` | number | **NO API FIELD** — LVC-owned, preserved from array order |
| — | — | — | `servicetitan_active` | boolean | **NO API FIELD** — default=true acceptable |

### Line Summary

| Category | Count |
|---|---|
| COMPATIBLE | 11 |
| MISSING from schema | 5 |
| Different values | 1 (status enum) |
| In schema but not in API | 3 (derivable or LVC-owned) |

---

## 5. STATUS VALUE VERIFICATION

### 5.1 Purchase Order Header Status

| Approved Schema Value | Live API Value Observed | Match? |
|---|---|---|
| `draft` | `Pending` | **NO — case + name differ** |
| `approved` | (not observed) | UNKNOWN |
| `sent` | `Sent` | **NO — case differs** (API TitleCase) |
| `vendor_confirmed` | (not observed) | UNKNOWN |
| `partially_received` | (not observed) | UNKNOWN |
| `received` | `Received` | **NO — case differs** |
| `closed` | (not observed) | UNKNOWN |
| `cancelled` | `Canceled` | **NO — case + spelling differ** (API uses one L) |
| — | `Pending` | **IN API, NOT IN SCHEMA** |

**Observed API status values (50 records examined):** `Sent`, `Received`, `Pending`, `Canceled`

**API status naming convention:** TitleCase (first letter capitalized)
**Schema status naming convention:** lowercase

### 5.2 Purchase Order Line Status

| Approved Schema Value | Live API Value Observed | Match? |
|---|---|---|
| `open` | `Pending` | **NO** |
| `partially_received` | (not observed) | UNKNOWN |
| `received` | `Received` | **NO — case differs** |
| `cancelled` | `Canceled` | **NO — case + spelling differ** |
| — | `Sent` | **IN API, NOT IN SCHEMA** |

**Observed API line status values:** `Sent`, `Received`, `Pending`, `Canceled`

### 5.3 Status Findings

| Finding | Detail |
|---|---|
| Case mismatch | API uses TitleCase; schema uses lowercase |
| Spelling mismatch | API `Canceled` (one L); schema `cancelled` (two Ls) |
| `Pending` in API | Not in schema enum — needs mapping (likely → `draft`) |
| `Sent` on lines | Not in schema line_status enum — needs mapping (likely → `open`) |
| Unobserved schema values | `approved`, `vendor_confirmed`, `partially_received`, `closed` — may exist in API but not in 50-record sample; OR may not exist in API at all |
| Adapter requirement | Status normalization layer required (case + spelling + value mapping) |

**Recommendation:** Do NOT change the schema enum. The adapter must normalize API values to schema values. Document the mapping table in the adapter.

---

## 6. PURCHASE ORDER TYPE VERIFICATION

### 6.1 PO Type Fields (Live API — 15 fields)

| # | API Field | API Type | Approved Schema? | Finding |
|---|---|---|---|---|
| 1 | `id` | number | NO ENTITY | **PurchaseOrderType entity does not exist in approved architecture** |
| 2 | `name` | string | NO ENTITY | — |
| 3 | `active` | boolean | NO ENTITY | — |
| 4 | `automaticallyReceive` | boolean | NO ENTITY | — |
| 5 | `displayToTechnician` | boolean | NO ENTITY | — |
| 6 | `impactToTechnicianPayroll` | boolean | NO ENTITY | Maps to user's "Payroll Impact" |
| 7 | `allowTechniciansToSendPo` | boolean | NO ENTITY | Maps to user's "Allow Technician Send" |
| 8 | `defaultRequiredDateDaysOffset` | number | NO ENTITY | Maps to user's "Default Required Date Offset" |
| 9 | `skipWeekends` | boolean | NO ENTITY | — |
| 10 | `excludeTaxFromJobCosting` | boolean | NO ENTITY | — |
| 11 | `landedCostMethod` | string | NO ENTITY | — |
| 12 | `includeTaxInFullyLandedCost` | boolean | NO ENTITY | — |
| 13 | `preventJobDetachment` | boolean | NO ENTITY | — |
| 14 | `createdOn` | string | NO ENTITY | — |
| 15 | `modifiedOn` | string | NO ENTITY | — |

### 6.2 PO Type Architecture Finding

The approved Stage 2E architecture does **not** include a `PurchaseOrderType` entity. The Purchase Order header references a PO Type via `typeId`, but:
- No `PurchaseOrderType` entity exists in the schema
- No `type_id` field exists on the `PurchaseOrder` entity
- The PO Type is not listed as a dependency in the domain registry

**Decision required:** Should PO Types be:
1. Modeled as a new sync entity (requires schema addition), OR
2. Stored as a denormalized snapshot field on PurchaseOrder (requires `type_id` + `type_name` fields), OR
3. Ignored entirely (PO Type is display-only metadata, not a sync dependency)?

---

## 7. HEADER/LINE RELATIONSHIP ANALYSIS

| Question | Answer | Impact on Architecture |
|---|---|---|
| Are lines embedded in the header? | **YES** | Lines arrive with every PO fetch — no separate line endpoint needed |
| Is there a separate line endpoint? | **NO** (HTTP 404) | Adapter must extract lines from `items[]` array |
| Do lines have immutable IDs? | **YES** (`id` field on each line) | `servicetitan_po_line_id` mapping is valid |
| Can header arrive without lines? | **NO** — lines always present | Header-first "lines may be delayed" concern is **moot** for this domain |
| Can lines be partial? | **NO** — full `items[]` array on every response | `lines_sync_status` tracking is less critical |
| Can pagination cause incomplete lines? | **NO** — pageSize controls PO count, not line count | All lines for a PO arrive together |

### Header-First Synchronization Model — Assessment

The approved header-first model assumed lines could arrive separately. **Live API evidence disproves this assumption for Purchase Orders:**

| Approved Assumption | Live API Reality |
|---|---|
| "Headers may arrive before lines" | **FALSE** — lines always embedded |
| "Line-fetch or line-dependency failures do NOT invalidate headers" | **MOOT** — no line fetch exists |
| "Lines may be on separate endpoints" | **FALSE** — no separate line endpoint |
| "lines_sync_status tracks line-level completeness" | **LESS CRITICAL** — lines always complete; only material dependency resolution could delay individual line records |

**Conclusion:** The header-first model remains **valid** (headers can be created before line-level material dependencies resolve), but the rationale simplifies. The adapter processes the embedded `items[]` array and defers individual lines only when their material dependency is unresolved — not because lines are on a separate endpoint.

---

## 8. DEPENDENCY ANALYSIS

### 8.1 Confirmed Dependencies

| Dependency | API Field | Resolution Entity | Resolution Field | Required? | Architecture Change? |
|---|---|---|---|---|---|
| Vendor | `vendorId` | `Vendor` | `servicetitan_vendor_id` | YES | NO — already modeled |
| Inventory Location | `inventoryLocationId` | `WarehouseLocation` | `servicetitan_warehouse_id` | YES | **POSSIBLE — see §8.2** |
| Material | `skuId` (on line) | `InventoryMaster` | `servicetitan_material_id` | YES (per line) | NO — already modeled |
| Job | `jobId` | `Job` | `servicetitan_job_id` | NO (nullable) | **YES — `jobId` not in PurchaseOrder schema** |
| Project | `projectId` | (no entity) | `servicetitan_project_id` (snapshot) | NO (nullable, display-only) | NO — already modeled as snapshot |
| Business Unit | `businessUnitId` | (no entity) | — | NO (nullable) | **YES — not in schema** |
| Technician | `technicianId` | (no entity) | — | NO (nullable) | **YES — not in schema** |
| PO Type | `typeId` | (no entity) | — | NO (nullable) | **YES — not in schema** |

### 8.2 Inventory Location vs Warehouse

The API field is `inventoryLocationId`. In ServiceTitan, an "inventory location" can be a **warehouse** OR a **truck** OR other location types.

The approved architecture resolves this via `WarehouseLocation.filter({ servicetitan_warehouse_id })`.

**Risk:** If a PO ships to a truck inventory location (not a warehouse), the `WarehouseLocation` lookup will fail, and the PO will be **deferred** indefinitely.

**Decision required:** Does the `WarehouseLocation` entity include all ServiceTitan inventory locations (warehouses + trucks), or only warehouses? If only warehouses, POs shipping to trucks will be deferred. This needs verification against the existing WarehouseLocation data.

### 8.3 Material Identity Mapping

The PO line references material via `skuId`. The `InventoryMaster` entity uses `servicetitan_material_id` (mapped from ServiceTitan `Item.Id`).

**Verification needed:** Confirm that `skuId` on PO lines equals `Item.Id` on the Materials API. Based on field naming conventions and the fact that `skuCode` maps to `Item.Code` and `skuName` maps to `Item.Name`, `skuId` is almost certainly `Item.Id`. This was not independently verified in this phase but is high-confidence.

---

## 9. WATERMARK RECOMMENDATION

| Filter Parameter | Supported? | Evidence | Recommendation |
|---|---|---|---|
| `modifiedOnOrAfter` | **YES** | HTTP 200, records returned | **PRIMARY WATERMARK FIELD** |
| `createdOnOrAfter` | **YES** | HTTP 200, records returned | Available for backfill estimates |
| `active` | **YES** | HTTP 200 | Available for filtering active POs |

### Watermark Strategy

| Aspect | Recommendation |
|---|---|
| Primary watermark field | `modifiedOnOrAfter` — advances `last_modified_scan_at` |
| Recovery window | 5-minute overlap (already configured) |
| `totalCount` reliability | **UNRELIABLE** — API returns null for `totalCount`; use `hasMore` for pagination control instead |
| Sort reliance | **NONE** — API does not support `sort` parameter (HTTP 400); process in API-provided order |
| Page size | 50 (already configured) — acceptable |
| Advancement rule | Advance ONLY after full recovery window completes successfully (already specified) |

---

## 10. REQUIRED SCHEMA CHANGES

### 10.1 CRITICAL — Must Fix Before Implementation

| # | Change | Reason | Priority |
|---|---|---|---|
| 1 | Update `stPurchaseOrderSyncConfig.ts` endpoint path from `/procurement/v2/` to `/inventory/v2/` | **Endpoint returns 404 — sync will fail entirely** | **BLOCKER** |

### 10.2 RECOMMENDED — Missing ST-Owned Fields on PurchaseOrder

| # | New Schema Field | API Source | Type | Owner | Reason |
|---|---|---|---|---|---|
| 2 | `servicetitan_type_id` | `typeId` | string | ST-owned | PO Type reference |
| 3 | `servicetitan_job_id` | `jobId` | string | ST-owned | Job reference (nullable, display-only) |
| 4 | `servicetitan_technician_id` | `technicianId` | string | ST-owned | Technician reference (nullable) |
| 5 | `servicetitan_business_unit_id` | `businessUnitId` | string | ST-owned | Business Unit reference (nullable) |
| 6 | `servicetitan_sent_on` | `sentOn` | string (date-time) | ST-owned | When PO was sent to vendor |
| 7 | `servicetitan_created_by_id` | `createdById` | string | ST-owned | Who created the PO in ST |
| 8 | `servicetitan_summary` | `summary` | string | ST-owned | ST memo/summary text |
| 9 | `servicetitan_vendor_document_number` | `vendorDocumentNumber` | string | ST-owned | Vendor's document number |
| 10 | `servicetitan_invoice_id` | `invoiceId` | string | ST-owned | Linked invoice (nullable) |
| 11 | `servicetitan_batch_id` | `batchId` | string | ST-owned | Batch reference (nullable) |
| 12 | `servicetitan_budget_code_id` | `budgetCodeId` | string | ST-owned | Budget code (nullable) |
| 13 | `servicetitan_ship_to` | `shipTo` | string (JSON) | ST-owned | Ship-to address (JSON snapshot) |

### 10.3 RECOMMENDED — Missing ST-Owned Fields on PurchaseOrderLine

| # | New Schema Field | API Source | Type | Owner | Reason |
|---|---|---|---|---|---|
| 14 | `servicetitan_sku_type` | `skuType` | string | ST-owned | Material type snapshot |
| 15 | `servicetitan_chargeable` | `chargeable` | boolean | ST-owned | Whether line is chargeable |
| 16 | `servicetitan_description` | `description` | string | ST-owned | Line description |
| 17 | `servicetitan_serial_numbers` | `serialNumbers` | string (JSON) | ST-owned | Serialized tracking (nullable) |
| 18 | `servicetitan_budget_code_id` | `budgetCodeId` | string | ST-owned | Budget code (nullable) |

### 10.4 OPTIONAL — Architecture Decision

| # | Change | Reason |
|---|---|---|
| 19 | Create `PurchaseOrderType` entity | If PO Types need to be modeled as a sync entity (decision required) |

---

## 11. RISKS

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Wrong endpoint path in config | **CRITICAL** | Fix `stPurchaseOrderSyncConfig.ts` — change `/procurement/v2/` to `/inventory/v2/` |
| 2 | Status value mismatch (case, spelling) | HIGH | Adapter must normalize: TitleCase → lowercase, `Canceled` → `cancelled`, `Pending` → `draft` |
| 3 | Unobserved status values | MEDIUM | 50-record sample may not include all statuses; adapter must handle unknown values gracefully (log + defer for review) |
| 4 | `totalCount` unreliable (null) | MEDIUM | Use `hasMore` for pagination; do not rely on `totalCount` for backfill estimates |
| 5 | Sort not supported | LOW | Process in API-provided order; sort client-side if needed |
| 6 | Inventory location may reference trucks | MEDIUM | Verify WarehouseLocation includes all inventory location types; otherwise POs to trucks will defer |
| 7 | 11 missing ST-owned fields on header | MEDIUM | Add fields before implementation; otherwise data is lost |
| 8 | 5 missing ST-owned fields on lines | MEDIUM | Add fields before implementation; otherwise line data is lost |
| 9 | `skuId` → `servicetitan_material_id` mapping unverified | LOW | High confidence based on naming; verify during adapter development |
| 10 | PO Type not modeled | LOW | Decision required; does not block sync (typeId can be stored as snapshot) |

---

## 12. OWNER DECISIONS REQUIRED

| # | Decision | Options | Impact |
|---|---|---|---|
| D1 | Endpoint path correction | Approve changing `/procurement/v2/` → `/inventory/v2/` in config | BLOCKER — sync cannot run without this |
| D2 | Missing header fields (11) | Approve adding 11 ST-owned fields to PurchaseOrder schema | Without these, ST data is lost on sync |
| D3 | Missing line fields (5) | Approve adding 5 ST-owned fields to PurchaseOrderLine schema | Without these, line data is lost on sync |
| D4 | PO Type modeling | (a) Create PurchaseOrderType entity, (b) Store as snapshot on PO, (c) Ignore | Determines whether typeId is a dependency or display-only |
| D5 | Inventory location scope | Confirm WarehouseLocation covers all inventory location types (warehouses + trucks) | If not, POs to trucks will defer |
| D6 | Status normalization strategy | Approve adapter-side normalization (no schema change) | Adapter maps API values to schema values |

---

## 13. PROHIBITED WORK

The following were NOT performed during this verification:

- No adapters created
- No domain services created
- No entities created or modified
- No watermarks activated
- No records imported
- No schedulers enabled
- No synchronization code written
- No schema files modified

---

## FINAL CONCLUSION

The live ServiceTitan Purchase Order API **does not match** the approved Stage 2E architecture. One critical blocker (wrong endpoint path) and 16 missing schema fields must be resolved before implementation can begin. The header-first synchronization model remains valid but simplifies because lines are embedded in the header response.

**Endpoint path correction is a BLOCKER.** The approved config path `/procurement/v2/tenant/{tenant}/purchase-orders` returns HTTP 404. The correct path is `/inventory/v2/tenant/{tenant}/purchase-orders`.

---

STAGE 2E.1 PURCHASE ORDER API VERIFICATION

ARCHITECTURE UPDATE REQUIRED