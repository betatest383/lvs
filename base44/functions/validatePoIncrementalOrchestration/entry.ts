/**
 * validatePoIncrementalOrchestration — Stage 2E.2A
 *
 * Deterministic test of the REAL incremental orchestration path
 * (executeIncrementalSync) with mocked ServiceTitan reads and isolated mock
 * entities. Exercises the exact function used by the production HTTP handler.
 *
 * Performs ZERO live ServiceTitan API calls and ZERO production writes.
 *
 * Tests:
 *   1.  Five-minute window calculation
 *   2.  Approved endpoint and modifiedOnOrAfter parameter
 *   3.  Lock conflict → already_running, no writes, no watermark advance, no in_progress
 *   4.  Successful watermark advancement
 *   5.  Failed-run watermark preservation
 *   6.  Exact per-run header and line counters
 *   7.  Recovery-window final status (idle on success, failed on partial failure)
 *   8.  No outbound ServiceTitan writes
 *   9.  Repeated-run line counters (first creates, second no-add, third updates)
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { executeIncrementalSync } from "../../shared/stSync/poIncrementalOrchestrator.ts";
import { purchaseOrderAdapter, resetPoTypeCache, setPoTypeCacheForTesting, isPoLineBatchSummary, type PoLineBatchSummary } from "../../shared/stSync/adapters/purchaseOrderAdapter.ts";
import {
  purchaseOrderWatermarkConfig,
  purchaseOrderLockConfig,
  PURCHASE_ORDER_OVERLAP_MINUTES,
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

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  setPoTypeCacheForTesting(new Map<string, string>([["146", "Warranty"]]));

  const baseConfig = {
    lockConfig: purchaseOrderLockConfig,
    watermarkConfig: purchaseOrderWatermarkConfig,
    maxPages: 1,
    maxRecords: 50,
    maxRuntimeMs: 30000,
    overlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES,
    resetCache: resetPoTypeCache,
  };

  // ── 1. Five-minute window calculation ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    let capturedWindowStart: string | null = null;
    const fetchPageMock = async (_c: any, req: any) => {
      capturedWindowStart = req.windowStart;
      return { records: [], hasMore: false, nextPage: null, totalCount: 0 };
    };
    await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(fetchPageMock),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const expectedStart = new Date(new Date("2026-08-03T11:00:00Z").getTime() - 5 * 60 * 1000).toISOString();
    const actualStart = capturedWindowStart ? new Date(capturedWindowStart).toISOString() : null;
    results.push({
      name: "1. Five-minute window calculation — windowStart is 5 min before last_modified_scan_at",
      passed: actualStart !== null && Math.abs(new Date(actualStart).getTime() - new Date(expectedStart).getTime()) < 1000,
      details: `expected=${expectedStart}, actual=${actualStart}`,
    });
  }

  // ── 2. Approved endpoint and modifiedOnOrAfter parameter ──
  {
    const watermark = makeWatermark();
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    let capturedFilterField: string | null = null;
    const fetchPageMock = async (_c: any, req: any) => {
      capturedFilterField = req.filterField;
      return { records: [], hasMore: false, nextPage: null, totalCount: 0 };
    };
    await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(fetchPageMock),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const expectedEndpoint = `/inventory/v2/tenant/${TENANT_ID}/purchase-orders`;
    const actualEndpoint = purchaseOrderAdapter.getEndpoint({ tenantId: TENANT_ID } as any);
    results.push({
      name: "2. Approved endpoint and modifiedOnOrAfter parameter",
      passed: actualEndpoint === expectedEndpoint && capturedFilterField === "modifiedOn",
      details: `endpoint=${actualEndpoint}, filterField=${capturedFilterField}`,
    });
  }

  // ── 3. Lock conflict → full recovery-window restoration (all 4 fields) ──
  // Begin with non-null recovery-window timestamps and existing recovery metadata.
  // After a lock conflict, prove all four fields are exactly restored.
  {
    const priorStart = "2026-08-03T10:00:00Z";
    const priorEnd = "2026-08-03T11:00:00Z";
    const priorErrors = 3;
    const watermark = makeWatermark({
      recovery_window_status: "completed",
      recovery_window_start: priorStart,
      recovery_window_end: priorEnd,
      recovery_window_errors: priorErrors,
    });
    const lockedCursor = {
      id: "cursor-po",
      integration_name: "servicetitan_purchase_order_sync",
      domain: "purchase_order",
      tenant_id: TENANT_ID,
      environment: ENVIRONMENT,
      lock_id: "LOCK-existing",
      lock_expires_at: new Date(Date.now() + 60000).toISOString(),
      status: "running",
    };
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark, cursor: lockedCursor,
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [], hasMore: false, nextPage: null, totalCount: 0 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const finalWatermark = mock.state.PurchaseOrderSyncWatermark[0];
    results.push({
      name: "3. Lock conflict — all 4 recovery-window fields exactly restored, no writes, no advance",
      passed: result.status === "already_running"
        && mock.state.PurchaseOrder.length === 0
        && mock.state.PurchaseOrderLine.length === 0
        && !result.watermark_advanced
        && finalWatermark.recovery_window_status === "completed"
        && finalWatermark.recovery_window_start === priorStart
        && finalWatermark.recovery_window_end === priorEnd
        && finalWatermark.recovery_window_errors === priorErrors,
      details: `status=${result.status}, poWrites=${mock.state.PurchaseOrder.length}, lineWrites=${mock.state.PurchaseOrderLine.length}, advanced=${result.watermark_advanced}, rws=${finalWatermark.recovery_window_status}, rws_start=${finalWatermark.recovery_window_start}, rws_end=${finalWatermark.recovery_window_end}, rws_errs=${finalWatermark.recovery_window_errors}`,
    });
  }

  // ── 4. Successful watermark advancement ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [makePoSource(2001)], hasMore: false, nextPage: null, totalCount: 1 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "4. Successful watermark advancement on full success",
      passed: result.status === "completed" && result.watermark_advanced && result.headers_created === 1,
      details: `status=${result.status}, advanced=${result.watermark_advanced}, created=${result.headers_created}`,
    });
  }

  // ── 5. Failed-run watermark preservation ──
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [{ ...makePoSource(2002), id: undefined } as any], hasMore: false, nextPage: null, totalCount: 1 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "5. Failed-run watermark preservation — NOT advanced on failure",
      passed: result.status === "partial_failure" && !result.watermark_advanced && result.headers_failed >= 1,
      details: `status=${result.status}, advanced=${result.watermark_advanced}, failed=${result.headers_failed}`,
    });
  }

  // ── 6. Exact per-run header and line counters ──
  {
    const watermark = makeWatermark();
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    const source = makePoSource(2003, {
      items: [
        { id: 200301, skuId: 38372634, skuCode: "03601669", skuName: "Mat A", quantity: 2, quantityReceived: 0, cost: 100, total: 200, status: "Pending", modifiedOn: NOW },
        { id: 200302, skuId: 38372634, skuCode: "03601669", skuName: "Mat A", quantity: 1, quantityReceived: 0, cost: 100, total: 100, status: "Pending", modifiedOn: NOW },
      ],
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [source], hasMore: false, nextPage: null, totalCount: 1 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    const lc = result.per_run_line_counters;
    results.push({
      name: "6. Exact per-run counters — 1 header created, 2 lines created this run",
      passed: result.headers_created === 1 && lc.po_lines_created_this_run === 2 && lc.po_lines_updated_this_run === 0,
      details: `headers_created=${result.headers_created}, lines_created=${lc.po_lines_created_this_run}, lines_updated=${lc.po_lines_updated_this_run}`,
    });
  }

  // ── 7. Recovery-window final status ──
  {
    // 7a. Success → idle
    {
      const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
      const mock = createMockBase44({
        vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
        watermark,
      });
      await executeIncrementalSync(mock.client, {
        ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [makePoSource(2004)], hasMore: false, nextPage: null, totalCount: 1 })),
      }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

      const finalWm = mock.state.PurchaseOrderSyncWatermark[0];
      results.push({
        name: "7a. Recovery-window status = idle after successful sync",
        passed: finalWm.recovery_window_status === "idle",
        details: `recovery_window_status=${finalWm.recovery_window_status}`,
      });
    }

    // 7b. Failure → failed
    {
      const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
      const mock = createMockBase44({
        vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
        watermark,
      });
      await executeIncrementalSync(mock.client, {
        ...baseConfig, adapter: makePoTestAdapter(async () => { throw new Error("API failure"); }),
      }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

      const finalWm = mock.state.PurchaseOrderSyncWatermark[0];
      results.push({
        name: "7b. Recovery-window status = failed after partial failure",
        passed: finalWm.recovery_window_status === "failed",
        details: `recovery_window_status=${finalWm.recovery_window_status}`,
      });
    }
  }

  // ── 8. No outbound ServiceTitan writes ──
  {
    const watermark = makeWatermark();
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [makePoSource(2005)], hasMore: false, nextPage: null, totalCount: 1 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    results.push({
      name: "8. No outbound ServiceTitan writes — outbound_writes=0",
      passed: result.outbound_writes === 0,
      details: `outbound_writes=${result.outbound_writes}`,
    });
  }

  // ── 9. Repeated-run line counters ──
  // First run: 1 line created. Second identical run: 0 created (no duplicate).
  // Third run: changed line → 0 created, 1 updated (not created).
  {
    const watermark = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });

    let currentSource = makePoSource(2006, { modifiedOn: "2026-08-03T11:30:00Z" });
    const cfg = {
      ...baseConfig,
      adapter: makePoTestAdapter(async () => ({ records: [currentSource], hasMore: false, nextPage: null, totalCount: 1 })),
    };

    // First run
    const result1 = await executeIncrementalSync(mock.client, cfg, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    const firstRunCreated = result1.per_run_line_counters.po_lines_created_this_run;
    const linesAfterRun1 = mock.state.PurchaseOrderLine.length;

    // Second identical run
    const result2 = await executeIncrementalSync(mock.client, cfg, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    const secondRunCreated = result2.per_run_line_counters.po_lines_created_this_run;
    const linesAfterRun2 = mock.state.PurchaseOrderLine.length;

    // Third run: line changed (quantityReceived updated, newer modifiedOn)
    currentSource = makePoSource(2006, {
      modifiedOn: "2026-08-03T12:00:00Z",
      items: [{ id: 200601, skuId: 38372634, skuCode: "03601669", skuName: "Test Material", quantity: 1, quantityReceived: 1, cost: 211.01, total: 211.01, status: "Received", modifiedOn: "2026-08-03T12:00:00Z" }],
    });
    const result3 = await executeIncrementalSync(mock.client, cfg, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    const thirdRunCreated = result3.per_run_line_counters.po_lines_created_this_run;
    const thirdRunUpdated = result3.per_run_line_counters.po_lines_updated_this_run;
    const linesAfterRun3 = mock.state.PurchaseOrderLine.length;

    results.push({
      name: "9. Repeated-run line counters — first creates, second no-add, third updates",
      passed: firstRunCreated === 1 && secondRunCreated === 0 && thirdRunCreated === 0 && thirdRunUpdated === 1
        && linesAfterRun1 === 1 && linesAfterRun2 === 1 && linesAfterRun3 === 1,
      details: `run1: created=${firstRunCreated}, lines=${linesAfterRun1}; run2: created=${secondRunCreated}, lines=${linesAfterRun2}; run3: created=${thirdRunCreated}, updated=${thirdRunUpdated}, lines=${linesAfterRun3}`,
    });
  }

  // ── 10. Type-safe summary — malformed PoLineBatchSummary cannot satisfy adapter contract ──
  {
    const valid: PoLineBatchSummary = {
      po_lines_created_this_run: 1, po_lines_updated_this_run: 0,
      po_lines_unchanged_this_run: 0, po_lines_stale_this_run: 0,
      po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    };
    const malformed = {
      po_lines_updated_this_run: 0, po_lines_unchanged_this_run: 0,
      po_lines_stale_this_run: 0, po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    } as any;
    const wrongType = {
      po_lines_created_this_run: "zero", po_lines_updated_this_run: 0,
      po_lines_unchanged_this_run: 0, po_lines_stale_this_run: 0,
      po_lines_deferred_this_run: 0, po_lines_failed_this_run: 0,
    } as any;

    results.push({
      name: "10. Type-safe summary — valid passes, malformed rejected, wrong-type rejected",
      passed: isPoLineBatchSummary(valid) === true
        && isPoLineBatchSummary(malformed) === false
        && isPoLineBatchSummary(wrongType) === false,
      details: `valid=${isPoLineBatchSummary(valid)}, malformed=${isPoLineBatchSummary(malformed)}, wrongType=${isPoLineBatchSummary(wrongType)}`,
    });
  }

  // ── 11. Orchestration receives typed PoLineBatchSummary[] — no any cast ──
  {
    const watermark = makeWatermark();
    const mock = createMockBase44({
      vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141")], materials: [makeMaterial("38372634")],
      watermark,
    });
    const result = await executeIncrementalSync(mock.client, {
      ...baseConfig, adapter: makePoTestAdapter(async () => ({ records: [makePoSource(2007)], hasMore: false, nextPage: null, totalCount: 1 })),
    }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });

    // The per_run_line_counters field is typed PoLineBatchSummary — verify all
    // six required counters are present and typed as numbers.
    const lc = result.per_run_line_counters;
    const allCountersPresent = typeof lc.po_lines_created_this_run === "number"
      && typeof lc.po_lines_updated_this_run === "number"
      && typeof lc.po_lines_unchanged_this_run === "number"
      && typeof lc.po_lines_stale_this_run === "number"
      && typeof lc.po_lines_deferred_this_run === "number"
      && typeof lc.po_lines_failed_this_run === "number";

    results.push({
      name: "11. Orchestration receives typed PoLineBatchSummary — all 6 counters present",
      passed: allCountersPresent && isPoLineBatchSummary(lc),
      details: `allCountersPresent=${allCountersPresent}, isPoLineBatchSummary=${isPoLineBatchSummary(lc)}`,
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
      mode: "validate_po_incremental_orchestration",
      stage: "2E.2A",
      writes_performed: 0,
      live_api_calls: 0,
      total_tests: results.length,
      passed,
      failed,
      acceptance: allPassed ? "PASS" : "FAIL",
      failed_tests: failedResults,
      summary: `PO Incremental Orchestration: ${passed}/${results.length} tests passed. ${allPassed ? "All tests PASS." : `${failed} tests FAILED.`}`,
    });
  } catch (error) {
    return Response.json({ error: error.message, summary: "PO Incremental Orchestration validation failed" }, { status: 500 });
  }
}