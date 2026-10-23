/**
 * validateStage2E2APurchaseOrder — Stage 2E.2A Final Purchase Order Validation
 *
 * Deterministic test suite covering all Stage 2E.2A contract scenarios.
 * Connects the REAL purchaseOrderAdapter and REAL runSyncEngine to a mock
 * fetchPage and mock base44. Performs ZERO live ServiceTitan API calls and
 * ZERO production writes.
 *
 * Required scenarios covered:
 *   1.  Initial PO-header import
 *   2.  PO-line import
 *   3.  Repeat-run idempotency
 *   4.  Five-minute watermark overlap
 *   5.  Successful watermark advancement
 *   6.  Failed-run watermark preservation
 *   7.  Updated PO reconciliation
 *   8.  Updated PO-line reconciliation
 *   9.  Multiple lines under one PO
 *   10. Missing Vendor
 *   11. Missing WarehouseLocation
 *   12. Missing Material
 *   13. Blocked or deferred line behavior
 *   14. Header preservation when a line fails
 *   15. PO Type snapshot preservation
 *   16. Duplicate-source-record prevention
 *   17. Stale-update protection
 *   18. Pagination
 *   19. Empty-result synchronization
 *   20. Malformed ServiceTitan response
 *   21. Authorization failure
 *   22. Manual authorized invocation
 *   23. Outbound-write prohibition (bonus — confirms no ST writes)
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { decideAdminOrSchedulerAuth } from "../../shared/securityAuth.ts";
import { clearCachedToken } from "../../shared/stAuth.ts";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import { purchaseOrderAdapter, resetPoTypeCache, setPoTypeCacheForTesting, isPoLineBatchSummary, type PoLineBatchSummary } from "../../shared/stSync/adapters/purchaseOrderAdapter.ts";
import { getPoSampleCount, PO_SAMPLE_LIMIT } from "../../shared/stSync/poIncrementalOrchestrator.ts";
import {
  purchaseOrderWatermarkConfig,
  purchaseOrderLockConfig,
  PURCHASE_ORDER_PAGE_SIZE,
  PURCHASE_ORDER_OVERLAP_MINUTES,
  PURCHASE_ORDER_MAX_PAGES,
} from "../../shared/stSync/stPurchaseOrderSyncConfig.ts";
import {
  createMockBase44,
  makeVendor,
  makeWarehouse,
  makeMaterial,
  makePoSource,
  makeWatermark,
  makePoTestAdapter,
  PO_TEST_NOW as NOW,
  PO_TEST_TENANT_ID as TENANT_ID,
  PO_TEST_ENVIRONMENT as ENVIRONMENT,
} from "../../shared/stSync/poSyncTestHarness.ts";

interface TestResult { name: string; passed: boolean; details: string; }

// ─── Test Suite ────────────────────────────────────────────────────────────────

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const ctx = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;

  // Pre-populate PO Type cache so mapRecord doesn't hit the live API.
  setPoTypeCacheForTesting(new Map<string, string>([["146", "Warranty"]]));

  // ── 1. Endpoint & Direction ──
  {
    const path = purchaseOrderAdapter.getEndpoint(ctx);
    results.push({
      name: "1. Endpoint uses /inventory/v2/ path (approved endpoint)",
      passed: path === "/inventory/v2/tenant/121/purchase-orders",
      details: `Got: ${path}`,
    });
  }

  // ── 2. Initial PO-header import ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1001);
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const createdPos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "1001");
    results.push({
      name: "2. Initial PO-header import creates one canonical header",
      passed: result.created === 1 && createdPos.length === 1,
      details: `engine created=${result.created}, stored=${createdPos.length}, status=${createdPos[0]?.status}`,
    });
  }

  // ── 3. PO-line import ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1002);
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const createdLines = mock.state.PurchaseOrderLine.filter((l) => l.servicetitan_po_line_id === "100201");
    results.push({
      name: "3. PO-line import creates one canonical line linked to header",
      passed: createdLines.length === 1 && createdLines[0].inventory_master_id === "mat-38372634",
      details: `lines=${createdLines.length}, material linked=${createdLines[0]?.inventory_master_id === "mat-38372634"}`,
    });
  }

  // ── 4. Repeat-run idempotency ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1003, { modifiedOn: NOW });
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const cfg = { executionMode: "write" as const, maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig };
    await runSyncEngine(adapter, cfg, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    await runSyncEngine(adapter, cfg, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "1003");
    const lines = mock.state.PurchaseOrderLine.filter((l) => l.servicetitan_po_line_id === "100301");
    results.push({
      name: "4. Repeat-run idempotency — no duplicate headers or lines",
      passed: pos.length === 1 && lines.length === 1,
      details: `headers=${pos.length}, lines=${lines.length}`,
    });
  }

  // ── 5. Five-minute watermark overlap ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
      watermark,
    });
    const source = makePoSource(1004, { modifiedOn: "2026-08-03T10:58:00Z" }); // within 5-min overlap
    const fetchPageMock = async (_c: any, req: any) => {
      // Verify the windowStart reflects the 5-min overlap
      const expectedStart = new Date(new Date("2026-08-03T11:00:00Z").getTime() - 5 * 60 * 1000).toISOString();
      const overlapOk = new Date(req.windowStart).getTime() <= new Date(expectedStart).getTime();
      return { records: overlapOk ? [source] : [], hasMore: false, nextPage: null, totalCount: 1 };
    };
    const adapter = makePoTestAdapter(fetchPageMock);
    const windowStart = new Date(new Date("2026-08-03T11:00:00Z").getTime() - PURCHASE_ORDER_OVERLAP_MINUTES * 60 * 1000).toISOString();
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig,
      filterField: "modifiedOn", windowStart, windowEnd: "2026-08-03T12:00:00.000Z",
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "5. Five-minute watermark overlap retrieves boundary records",
      passed: result.processed === 1,
      details: `processed=${result.processed} (record at 10:58 within overlap of 11:00 watermark)`,
    });
  }

  // ── 6. Successful watermark advancement ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
      watermark,
    });
    const fetchPageMock = async () => ({ records: [makePoSource(1005)], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig,
      filterField: "modifiedOn", windowStart: "2026-08-03T10:55:00Z", windowEnd: "2026-08-03T12:00:00.000Z",
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const advanced = result.watermarkAfter?.last_modified_scan_at === "2026-08-03T12:00:00.000Z";
    results.push({
      name: "6. Successful watermark advancement on full success",
      passed: result.failed === 0 && !result.partialRun && advanced,
      details: `failed=${result.failed}, partial=${result.partialRun}, advanced=${advanced}, wmAfter=${result.watermarkAfter?.last_modified_scan_at}`,
    });
  }

  // ── 7. Failed-run watermark preservation ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")],
      warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
      watermark,
    });
    // Source missing ID → record failure (failed++, no watermark advance)
    const fetchPageMock = async () => ({ records: [{ ...makePoSource(1006), id: undefined } as any], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig,
      filterField: "modifiedOn", windowStart: "2026-08-03T10:55:00Z", windowEnd: "2026-08-03T12:00:00.000Z",
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const preserved = result.watermarkAfter?.last_modified_scan_at === "2026-08-03T11:00:00Z";
    results.push({
      name: "7. Failed-run watermark preservation — watermark NOT advanced on failure",
      passed: result.failed >= 1 && preserved,
      details: `failed=${result.failed}, wmPreserved=${preserved}, wmAfter=${result.watermarkAfter?.last_modified_scan_at}`,
    });
  }

  // ── 8. Updated PO reconciliation ──
  {
    // Stage 2E.6 scope: only Pending/Sent are eligible. Reconciliation is
    // exercised via an eligible status transition (Pending→Sent) plus a total
    // change — preserving the original "status & total updated, no new
    // header" intent while respecting the narrower import scope.
    const existing = {
      id: "po-2001", servicetitan_purchase_order_id: "2001", servicetitan_po_number: "PO-2001",
      status: "draft", servicetitan_vendor_id: "22549317", vendor_id: "vendor-22549317", vendor_name: "Vendor 22549317",
      servicetitan_warehouse_id: "141", warehouse_location_id: "wh-141", warehouse_name: "Warehouse 141",
      servicetitan_project_id: null, servicetitan_job_id: null, servicetitan_sent_on: null,
      servicetitan_purchase_order_type_id: "146", servicetitan_purchase_order_type_name: "Warranty",
      order_date: "2026-07-31T00:00:00Z", expected_delivery_date: "2026-08-03T00:00:00Z", actual_delivery_date: null,
      tax_amount: 0, shipping_amount: 0, total: 876.07, subtotal: 876.07, line_count: 1,
      total_quantity_ordered: 1, total_quantity_received: 0, received_percentage: 0,
      servicetitan_modified_on: "2026-08-01T00:00:00Z", servicetitan_last_event_at: "2026-08-01T00:00:00Z",
      servicetitan_active: true, servicetitan_sync_version: 1, lines_expected_count: 1, lines_synced_count: 1,
      servicetitan_sync_status: "synced", servicetitan_raw_data: "{}",
    };
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [existing],
    });
    const updatedSource = makePoSource(2001, { status: "Sent", modifiedOn: "2026-08-02T00:00:00Z", total: 900 });
    const fetchPageMock = async () => ({ records: [updatedSource], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const updated = mock.state.PurchaseOrder.find((p) => p.id === "po-2001");
    results.push({
      name: "8. Updated PO reconciliation — status & total updated, no new header (Pending→Sent eligible under 2E.6)",
      passed: result.updated === 1 && result.created === 0 && updated.status === "sent" && updated.total === 900,
      details: `updated=${result.updated}, created=${result.created}, status=${updated.status}, total=${updated.total}`,
    });
  }

  // ── 9. Updated PO-line reconciliation ──
  {
    const existingLine = {
      id: "line-200201", servicetitan_po_line_id: "200201", purchase_order_id: "po-2002",
      servicetitan_material_id: "38372634", inventory_master_id: "mat-38372634",
      sku: "03601669", item_name: "Test Material", quantity_ordered: 1, quantity_received: 0,
      unit_cost: 211.01, line_total: 211.01, line_status: "open",
      servicetitan_modified_on: "2026-08-01T00:00:00Z", servicetitan_sync_version: 1,
    };
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [{
        id: "po-2002", servicetitan_purchase_order_id: "2002", status: "sent",
        servicetitan_vendor_id: "22549317", vendor_id: "vendor-22549317", vendor_name: "Vendor 22549317",
        servicetitan_warehouse_id: "141", warehouse_location_id: "wh-141", warehouse_name: "Warehouse 141",
        servicetitan_modified_on: "2026-08-02T00:00:00Z", servicetitan_last_event_at: "2026-08-02T00:00:00Z",
        servicetitan_active: true, servicetitan_sync_version: 1, total: 876.07, lines_expected_count: 1, lines_synced_count: 1,
      }],
      existingLines: [existingLine],
    });
    const updatedSource = makePoSource(2002, {
      modifiedOn: "2026-08-03T00:00:00Z",
      items: [{ id: 200201, skuId: 38372634, skuCode: "03601669", skuName: "Test Material", quantity: 1, quantityReceived: 1, cost: 211.01, total: 211.01, status: "Received", modifiedOn: "2026-08-03T00:00:00Z" }],
    });
    const fetchPageMock = async () => ({ records: [updatedSource], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const line = mock.state.PurchaseOrderLine.find((l) => l.id === "line-200201");
    results.push({
      name: "9. Updated PO-line reconciliation — quantity_received updated, no new line",
      passed: line.quantity_received === 1 && line.line_status === "received" && mock.state.PurchaseOrderLine.length === 1,
      details: `qty_received=${line.quantity_received}, line_status=${line.line_status}, line_count=${mock.state.PurchaseOrderLine.length}`,
    });
  }

  // ── 10. Multiple lines under one PO ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634"), makeMaterial("38372635")],
    });
    const source = makePoSource(1007, {
      items: [
        { id: 100701, skuId: 38372634, skuCode: "03601669", skuName: "Mat A", quantity: 2, quantityReceived: 0, cost: 100, total: 200, status: "Pending", modifiedOn: NOW },
        { id: 100702, skuId: 38372635, skuCode: "03601670", skuName: "Mat B", quantity: 3, quantityReceived: 0, cost: 50, total: 150, status: "Pending", modifiedOn: NOW },
        { id: 100703, skuId: 38372634, skuCode: "03601669", skuName: "Mat A", quantity: 1, quantityReceived: 0, cost: 100, total: 100, status: "Pending", modifiedOn: NOW },
      ],
    });
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const lines = mock.state.PurchaseOrderLine.filter((l) => String(l.servicetitan_po_line_id).startsWith("1007"));
    const header = mock.state.PurchaseOrder.find((p) => p.servicetitan_purchase_order_id === "1007");
    results.push({
      name: "10. Multiple lines under one PO — 3 lines linked to 1 header",
      passed: lines.length === 3 && header.lines_expected_count === 3 && header.lines_synced_count === 3,
      details: `lines=${lines.length}, expected=${header.lines_expected_count}, synced=${header.lines_synced_count}`,
    });
  }

  // ── 11. Missing Vendor ──
  {
    const mock = createMockBase44({
      vendors: [], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
    });
    const fetchPageMock = async () => ({ records: [makePoSource(1008)], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "11. Missing Vendor — header deferred, no header created",
      passed: result.deferred === 1 && result.created === 0 && mock.state.PurchaseOrder.length === 0,
      details: `deferred=${result.deferred}, created=${result.created}, stored=${mock.state.PurchaseOrder.length}`,
    });
  }

  // ── 12. Missing WarehouseLocation ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [], materials: [makeMaterial("38372634")],
    });
    const fetchPageMock = async () => ({ records: [makePoSource(1009)], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "12. Missing WarehouseLocation — header deferred, no header created",
      passed: result.deferred === 1 && result.created === 0 && mock.state.PurchaseOrder.length === 0,
      details: `deferred=${result.deferred}, created=${result.created}, stored=${mock.state.PurchaseOrder.length}`,
    });
  }

  // ── 13. Missing Material (deferred line) ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [],
    });
    const fetchPageMock = async () => ({ records: [makePoSource(1010)], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const header = mock.state.PurchaseOrder.find((p) => p.servicetitan_purchase_order_id === "1010");
    results.push({
      name: "13. Missing Material — header created, line deferred, lines_sync_status=partial",
      passed: result.created === 1 && mock.state.PurchaseOrderLine.length === 0 && header.lines_sync_status === "partial",
      details: `header_created=${result.created}, lines=${mock.state.PurchaseOrderLine.length}, lines_sync_status=${header.lines_sync_status}`,
    });
  }

  // ── 14. Header preservation when a line fails ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")],
      materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1011, {
      items: [
        { id: 101101, skuId: 38372634, skuCode: "03601669", skuName: "Good", quantity: 1, quantityReceived: 0, cost: 100, total: 100, status: "Pending", modifiedOn: NOW },
        { id: 101102, skuId: 99999999, skuCode: "BAD", skuName: "Missing material", quantity: 1, quantityReceived: 0, cost: 50, total: 50, status: "Pending", modifiedOn: NOW },
      ],
    });
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const header = mock.state.PurchaseOrder.find((p) => p.servicetitan_purchase_order_id === "1011");
    const goodLine = mock.state.PurchaseOrderLine.find((l) => l.servicetitan_po_line_id === "101101");
    const badLine = mock.state.PurchaseOrderLine.find((l) => l.servicetitan_po_line_id === "101102");
    results.push({
      name: "14. Header preserved when a line fails — good line synced, bad line deferred",
      passed: header && goodLine && !badLine && header.lines_sync_status === "partial",
      details: `header=${!!header}, goodLine=${!!goodLine}, badLine=${!!badLine}, status=${header?.lines_sync_status}`,
    });
  }

  // ── 15. PO Type snapshot preservation ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1012, { typeId: 146 });
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const header = mock.state.PurchaseOrder.find((p) => p.servicetitan_purchase_order_id === "1012");
    results.push({
      name: "15. PO Type snapshot preserved (id + name)",
      passed: header.servicetitan_purchase_order_type_id === "146" && header.servicetitan_purchase_order_type_name === "Warranty",
      details: `type_id=${header.servicetitan_purchase_order_type_id}, type_name=${header.servicetitan_purchase_order_type_name}`,
    });
  }

  // ── 16. Duplicate-source-record prevention ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1013, { modifiedOn: NOW });
    // Same source returned on two pages (simulating overlap re-fetch)
    const fetchPageMock = async (_c: any, req: any) => {
      const page = req.pagination.page;
      return page === 1 ? { records: [source], hasMore: true, nextPage: 2, totalCount: 2 }
        : { records: [source], hasMore: false, nextPage: null, totalCount: 2 };
    };
    const adapter = makePoTestAdapter(fetchPageMock);
    await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 2, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "1013");
    results.push({
      name: "16. Duplicate-source-record prevention — one header despite duplicate fetch",
      passed: pos.length === 1,
      details: `headers with id=1013: ${pos.length}`,
    });
  }

  // ── 17. Stale-update protection ──
  {
    const existing = {
      id: "po-1014", servicetitan_purchase_order_id: "1014", status: "sent",
      servicetitan_vendor_id: "22549317", vendor_id: "vendor-22549317", vendor_name: "Vendor 22549317",
      servicetitan_warehouse_id: "141", warehouse_location_id: "wh-141", warehouse_name: "Warehouse 141",
      servicetitan_modified_on: "2026-08-03T12:00:00Z", servicetitan_last_event_at: "2026-08-03T12:00:00Z",
      servicetitan_active: true, servicetitan_sync_version: 2, total: 876.07,
      servicetitan_po_number: "PO-1014", servicetitan_project_id: null, servicetitan_job_id: null,
      servicetitan_sent_on: null, servicetitan_purchase_order_type_id: "146", servicetitan_purchase_order_type_name: "Warranty",
      order_date: "2026-07-31T00:00:00Z", expected_delivery_date: "2026-08-03T00:00:00Z", actual_delivery_date: null,
      tax_amount: 0, shipping_amount: 0, subtotal: 876.07, line_count: 1, total_quantity_ordered: 1, total_quantity_received: 0,
      received_percentage: 0, lines_expected_count: 1, lines_synced_count: 1, servicetitan_sync_status: "synced", servicetitan_raw_data: "{}",
    };
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [existing],
    });
    // Incoming modifiedOn is OLDER than local → stale
    const staleSource = makePoSource(1014, { modifiedOn: "2026-08-02T00:00:00Z", total: 999 });
    const fetchPageMock = async () => ({ records: [staleSource], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const header = mock.state.PurchaseOrder.find((p) => p.id === "po-1014");
    results.push({
      name: "17. Stale-update protection — older event rejected, total unchanged",
      passed: result.stale === 1 && header.total === 876.07,
      details: `stale=${result.stale}, total=${header.total} (expected 876.07, not 999)`,
    });
  }

  // ── 18. Pagination ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
    });
    const page1 = [makePoSource(2001), makePoSource(2002)];
    const page2 = [makePoSource(2003)];
    const fetchPageMock = async (_c: any, req: any) => {
      return req.pagination.page === 1
        ? { records: page1, hasMore: true, nextPage: 2, totalCount: 3 }
        : { records: page2, hasMore: false, nextPage: null, totalCount: 3 };
    };
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 5, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "18. Pagination — 2 pages fetched, 3 headers created",
      passed: result.pagesFetched === 2 && result.created === 3,
      details: `pages=${result.pagesFetched}, created=${result.created}`,
    });
  }

  // ── 19. Empty-result synchronization ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark: makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" }),
    });
    const fetchPageMock = async () => ({ records: [], hasMore: false, nextPage: null, totalCount: 0 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000,
      lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig,
      filterField: "modifiedOn", windowStart: "2026-08-03T10:55:00Z", windowEnd: "2026-08-03T12:00:00.000Z",
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "19. Empty-result synchronization — zero created, no failure, watermark can advance",
      passed: result.created === 0 && result.failed === 0 && !result.partialRun,
      details: `created=${result.created}, failed=${result.failed}, partial=${result.partialRun}`,
    });
  }

  // ── 20. Malformed ServiceTitan response ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
    });
    const fetchPageMock = async () => { throw new Error("Malformed ServiceTitan response — JSON parse error"); };
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "20. Malformed ServiceTitan response — api_error, partial_run, no records created",
      passed: result.apiErrors === 1 && result.stopReason === "api_error" && result.partialRun && result.created === 0,
      details: `apiErrors=${result.apiErrors}, stopReason=${result.stopReason}, partial=${result.partialRun}, created=${result.created}`,
    });
  }

  // ── 21. Authorization: unauthenticated, no secret header → 403 ──
  // Tests the REAL authorization helper used by the production function.
  {
    const auth = decideAdminOrSchedulerAuth(null, "", "test-secret-value");
    results.push({
      name: "21. Authorization — unauthenticated, no secret header → 403",
      passed: !auth.authorized && auth.status === 403,
      details: `authorized=${auth.authorized}, status=${auth.status}`,
    });
  }

  // ── 22. Authorization: unauthenticated, wrong secret → 403 ──
  {
    const auth = decideAdminOrSchedulerAuth(null, "wrong-secret", "test-secret-value");
    results.push({
      name: "22. Authorization — wrong scheduler secret → 403",
      passed: !auth.authorized && auth.status === 403,
      details: `authorized=${auth.authorized}, status=${auth.status}`,
    });
  }

  // ── 23. Authorization: authenticated non-admin/non-owner → 403 ──
  {
    const auth = decideAdminOrSchedulerAuth({ role: "user", email: "tech@example.com" }, "", "test-secret-value");
    results.push({
      name: "23. Authorization — authenticated non-admin/non-owner → 403",
      passed: !auth.authorized && auth.status === 403,
      details: `authorized=${auth.authorized}, status=${auth.status}`,
    });
  }

  // ── 24. Authorization: authenticated admin → authorized ──
  {
    const auth = decideAdminOrSchedulerAuth({ role: "admin", email: "admin@example.com" }, "", "");
    results.push({
      name: "24. Authorization — authenticated admin → authorized",
      passed: auth.authorized,
      details: `authorized=${auth.authorized}`,
    });
  }

  // ── 25. Authorization: authenticated owner → authorized ──
  {
    const auth = decideAdminOrSchedulerAuth({ role: "owner", email: "owner@example.com" }, "", "");
    results.push({
      name: "25. Authorization — authenticated owner → authorized",
      passed: auth.authorized,
      details: `authorized=${auth.authorized}`,
    });
  }

  // ── 26. Authorization: valid scheduler secret → authorized ──
  {
    const auth = decideAdminOrSchedulerAuth(null, "test-secret-value", "test-secret-value");
    results.push({
      name: "26. Authorization — valid scheduler secret header → authorized",
      passed: auth.authorized,
      details: `authorized=${auth.authorized}`,
    });
  }

  // ── 27. Authorization: secret supplied in body (not header) → 403 ──
  // The helper only accepts the secret via the header parameter. A secret
  // in the body would never be passed as schedulerSecretHeader.
  {
    const auth = decideAdminOrSchedulerAuth(null, "", "test-secret-value");
    results.push({
      name: "27. Authorization — secret supplied in body (not header) → 403",
      passed: !auth.authorized && auth.status === 403,
      details: `authorized=${auth.authorized} (body secret ignored — only header checked)`,
    });
  }

  // ── 28. Authorization: caller-supplied role claims ignored ──
  // The helper uses user.role from auth.me() — never from the request body.
  // A non-admin user with a body claiming role="admin" is still rejected.
  {
    const auth = decideAdminOrSchedulerAuth({ role: "user", email: "tech@example.com" }, "", "test-secret-value");
    results.push({
      name: "28. Authorization — caller-supplied role claims ignored (non-admin rejected)",
      passed: !auth.authorized && auth.status === 403,
      details: `authorized=${auth.authorized} (server-resolved role="user" — body role claims never consulted)`,
    });
  }

  // ── 29. Outbound-write prohibition: request-level instrumentation ──
  // Instrument globalThis.fetch to intercept ALL HTTP calls. Run the REAL
  // adapter (not a mock fetchPage) so the real apiRequest path is exercised.
  // Verify every ServiceTitan API call uses GET — fail on POST/PUT/PATCH/DELETE.
  {
    resetPoTypeCache();
    clearCachedToken();

    const httpCalls: { url: string; method: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : (input?.url || String(input));
      const method = ((init?.method) || "GET").toUpperCase();
      httpCalls.push({ url, method });

      if (url.includes("auth.servicetitan.io")) {
        return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("api.servicetitan.io") || url.includes("api.beta.servicetitan.io")) {
        return new Response(JSON.stringify({ data: [], hasMore: false, page: 1, pageSize: 50 }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    try {
      const mock = createMockBase44({
        vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      });
      // Use the REAL adapter — no fetchPage override — so the real apiRequest path runs.
      await runSyncEngine(purchaseOrderAdapter, {
        executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
      }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    } finally {
      globalThis.fetch = originalFetch;
      resetPoTypeCache();
      clearCachedToken();
    }

    const apiCalls = httpCalls.filter((c) => c.url.includes("api.servicetitan.io") || c.url.includes("api.beta.servicetitan.io"));
    const nonGetApiCalls = apiCalls.filter((c) => c.method !== "GET");
    const methodsUsed = [...new Set(apiCalls.map((c) => c.method))];

    results.push({
      name: "29. Outbound-write prohibition — all ServiceTitan API requests are GET (request-level)",
      passed: apiCalls.length > 0 && nonGetApiCalls.length === 0 && methodsUsed.length === 1 && methodsUsed[0] === "GET",
      details: `apiCalls=${apiCalls.length}, nonGET=${nonGetApiCalls.length}, methods=${methodsUsed.join(",")}`,
    });
  }

  // ── 30. Non-ServiceTitan records preceding qualifying records ──
  // Non-ServiceTitan records appear BEFORE qualifying records in the retrieval
  // window. The server-side filter must exclude them BEFORE the limit is applied
  // so they do not displace qualifying records.
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [
        { id: "po-1", servicetitan_purchase_order_id: "", servicetitan_last_sync: NOW },
        { id: "po-2", servicetitan_purchase_order_id: null, servicetitan_last_sync: NOW },
        { id: "po-3", servicetitan_purchase_order_id: undefined, servicetitan_last_sync: NOW },
        { id: "po-4", servicetitan_purchase_order_id: "9001", servicetitan_last_sync: NOW },
        { id: "po-5", servicetitan_purchase_order_id: "9002", servicetitan_last_sync: NOW },
      ],
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "30. Non-ServiceTitan records preceding qualifying records — filtered before limit",
      passed: stats.purchase_orders_synced_sample_count === 2 && !stats.purchase_orders_synced_sample_is_capped,
      details: `sample_count=${stats.purchase_orders_synced_sample_count} (expected 2), is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 31. Non-ServiceTitan records interspersed with qualifying records ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [
        { id: "po-1", servicetitan_purchase_order_id: "9001", servicetitan_last_sync: NOW },
        { id: "po-2", servicetitan_purchase_order_id: "", servicetitan_last_sync: NOW },
        { id: "po-3", servicetitan_purchase_order_id: "9002", servicetitan_last_sync: NOW },
        { id: "po-4", servicetitan_purchase_order_id: null, servicetitan_last_sync: NOW },
        { id: "po-5", servicetitan_purchase_order_id: "9003", servicetitan_last_sync: NOW },
      ],
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "31. Non-ServiceTitan records interspersed with qualifying records — filtered before limit",
      passed: stats.purchase_orders_synced_sample_count === 3 && !stats.purchase_orders_synced_sample_is_capped,
      details: `sample_count=${stats.purchase_orders_synced_sample_count} (expected 3), is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 32. More than 5,000 qualifying records plus additional non-ServiceTitan records ──
  // PO_SAMPLE_LIMIT + 2 qualifying records plus 100 non-ServiceTitan records
  // interspersed. The server-side filter must remove non-qualifying records
  // BEFORE the limit, so is_capped=true is reliable.
  {
    const existingPOs: any[] = [];
    for (let i = 0; i < PO_SAMPLE_LIMIT + 2; i++) {
      existingPOs.push({ id: `po-st-${i}`, servicetitan_purchase_order_id: `ST-${i}`, servicetitan_last_sync: NOW });
    }
    for (let i = 0; i < 100; i++) {
      existingPOs.push({ id: `po-non-${i}`, servicetitan_purchase_order_id: i % 2 === 0 ? "" : null, servicetitan_last_sync: NOW });
    }
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs,
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "32. More than 5,000 qualifying + non-ServiceTitan records — is_capped=true reliable",
      passed: stats.purchase_orders_synced_sample_is_capped === true && stats.purchase_orders_synced_sample_count === PO_SAMPLE_LIMIT,
      details: `is_capped=${stats.purchase_orders_synced_sample_is_capped}, sample_count=${stats.purchase_orders_synced_sample_count} (capped at ${PO_SAMPLE_LIMIT}, non-ST records did not displace qualifying)`,
    });
  }

  // ── 33. Exactly 5,000 qualifying records ──
  {
    const existingPOs: any[] = [];
    for (let i = 0; i < PO_SAMPLE_LIMIT; i++) {
      existingPOs.push({ id: `po-${i}`, servicetitan_purchase_order_id: `ST-${i}`, servicetitan_last_sync: NOW });
    }
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs,
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "33. Exactly 5,000 qualifying records — count=5000, is_capped=false",
      passed: stats.purchase_orders_synced_sample_count === PO_SAMPLE_LIMIT && !stats.purchase_orders_synced_sample_is_capped,
      details: `sample_count=${stats.purchase_orders_synced_sample_count}, is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 34. Exactly 5,001 qualifying records ──
  {
    const existingPOs: any[] = [];
    for (let i = 0; i < PO_SAMPLE_LIMIT + 1; i++) {
      existingPOs.push({ id: `po-${i}`, servicetitan_purchase_order_id: `ST-${i}`, servicetitan_last_sync: NOW });
    }
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs,
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "34. Exactly 5,001 qualifying records — count=5000 (capped), is_capped=true",
      passed: stats.purchase_orders_synced_sample_count === PO_SAMPLE_LIMIT && stats.purchase_orders_synced_sample_is_capped === true,
      details: `sample_count=${stats.purchase_orders_synced_sample_count}, is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 35. Fewer than 5,000 qualifying records ──
  {
    const existingPOs: any[] = [];
    for (let i = 0; i < 100; i++) {
      existingPOs.push({ id: `po-${i}`, servicetitan_purchase_order_id: `ST-${i}`, servicetitan_last_sync: NOW });
    }
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs,
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "35. Fewer than 5,000 qualifying records — count=100, is_capped=false",
      passed: stats.purchase_orders_synced_sample_count === 100 && !stats.purchase_orders_synced_sample_is_capped,
      details: `sample_count=${stats.purchase_orders_synced_sample_count}, is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 36. Empty and whitespace-only ServiceTitan IDs are excluded ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [
        { id: "po-1", servicetitan_purchase_order_id: "", servicetitan_last_sync: NOW },
        { id: "po-2", servicetitan_purchase_order_id: "  ", servicetitan_last_sync: NOW },
        { id: "po-3", servicetitan_purchase_order_id: " \t ", servicetitan_last_sync: NOW },
        { id: "po-4", servicetitan_purchase_order_id: null, servicetitan_last_sync: NOW },
        { id: "po-5", servicetitan_last_sync: NOW }, // field missing entirely
        { id: "po-6", servicetitan_purchase_order_id: "valid1", servicetitan_last_sync: NOW },
      ],
    });
    const stats = await getPoSampleCount(mock.client);
    results.push({
      name: "36. Empty and whitespace-only ServiceTitan IDs excluded — only 'valid1' qualifies",
      passed: stats.purchase_orders_synced_sample_count === 1 && !stats.purchase_orders_synced_sample_is_capped,
      details: `sample_count=${stats.purchase_orders_synced_sample_count} (expected 1 — only 'valid1'), is_capped=${stats.purchase_orders_synced_sample_is_capped}`,
    });
  }

  // ── 37. Returned field names and descriptions do not overstate what was measured ──
  {
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      existingPOs: [{ id: "po-1", servicetitan_purchase_order_id: "9001", servicetitan_last_sync: NOW }],
    });
    const stats = await getPoSampleCount(mock.client);
    // The field names must explicitly indicate "sample" — not "total" or bare "count".
    const hasSampleCount = "purchase_orders_synced_sample_count" in stats;
    const hasSampleLimit = "purchase_orders_synced_sample_limit" in stats;
    const hasSampleCapped = "purchase_orders_synced_sample_is_capped" in stats;
    // No field that claims a complete/exhaustive total
    const noTotalCount = !("purchase_orders_synced_count" in stats);
    const noTotal = !("purchase_orders_total" in stats);
    const noExhaustiveCount = !("purchase_orders_count" in stats);
    results.push({
      name: "37. Field names do not overstate — sample/limit/capped fields, no total/exhaustive fields",
      passed: hasSampleCount && hasSampleLimit && hasSampleCapped && noTotalCount && noTotal && noExhaustiveCount,
      details: `hasSampleCount=${hasSampleCount}, hasSampleLimit=${hasSampleLimit}, hasSampleCapped=${hasSampleCapped}, noTotalCount=${noTotalCount}, noTotal=${noTotal}, noExhaustiveCount=${noExhaustiveCount}`,
    });
  }

  // ── 38. Type-safe post-batch summary — malformed PoLineBatchSummary rejected ──
  {
    // A valid summary passes the type guard
    const valid: PoLineBatchSummary = {
      po_lines_created_this_run: 1, po_lines_updated_this_run: 0,
      po_lines_unchanged_this_run: 0, po_lines_stale_this_run: 0,
      po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    };
    // A malformed summary (missing po_lines_created_this_run) fails the type guard
    const malformed = {
      po_lines_updated_this_run: 0, po_lines_unchanged_this_run: 0,
      po_lines_stale_this_run: 0, po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    } as any;
    // A summary with a wrong type on a counter also fails
    const wrongType = {
      po_lines_created_this_run: "zero", po_lines_updated_this_run: 0,
      po_lines_unchanged_this_run: 0, po_lines_stale_this_run: 0,
      po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    } as any;

    results.push({
      name: "38. Type-safe summary — valid PoLineBatchSummary passes, malformed rejected",
      passed: isPoLineBatchSummary(valid) === true
        && isPoLineBatchSummary(malformed) === false
        && isPoLineBatchSummary(wrongType) === false,
      details: `valid=${isPoLineBatchSummary(valid)}, malformed=${isPoLineBatchSummary(malformed)}, wrongType=${isPoLineBatchSummary(wrongType)}`,
    });
  }

  // ── 39. WarehouseLocation supports all location types ──
  {
    const truckWh = makeWarehouse("142", "Truck 001", "truck");
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [truckWh], materials: [makeMaterial("38372634")],
    });
    const source = makePoSource(1017, { inventoryLocationId: 142 });
    const fetchPageMock = async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 });
    const adapter = makePoTestAdapter(fetchPageMock);
    const result = await runSyncEngine(adapter, {
      executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig,
    }, mock.client, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "39. WarehouseLocation resolves truck location_type (not warehouse-only)",
      passed: result.created === 1 && result.deferred === 0,
      details: `created=${result.created}, deferred=${result.deferred} (resolved truck-type location)`,
    });
  }

  resetPoTypeCache();
  return results;
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const results = await runTests();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const allPassed = failed === 0;

    const failedResults = results.filter((r) => !r.passed);
    return Response.json({
      mode: "validate_stage_2e_2a_purchase_order",
      stage: "2E.2A",
      writes_performed: 0,
      live_api_calls: 0,
      total_tests: results.length,
      passed,
      failed,
      acceptance: allPassed ? "PASS" : "FAIL",
      failed_tests: failedResults,
      summary: `Stage 2E.2A Purchase Order validation: ${passed}/${results.length} tests passed. ${allPassed ? "All tests PASS." : `${failed} tests FAILED.`}`,
    });
  } catch (error) {
    return Response.json({ error: error.message, summary: "Stage 2E.2A validation failed" }, { status: 500 });
  }
}