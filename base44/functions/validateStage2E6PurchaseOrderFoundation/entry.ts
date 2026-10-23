/**
 * validateStage2E6PurchaseOrderFoundation — Stage 2E.6
 *
 * Deterministic, fixture-based verification of the Purchase-Order sync
 * foundation. Performs ZERO live ServiceTitan API calls and ZERO production
 * writes. All entity access is routed through the shared mock harness
 * (poSyncTestHarness) and the real adapter/engine/orchestrator code paths.
 *
 * Covers (fixture-based): eligibility (Pending/Sent only), missing id,
 * malformed timestamps, null vs missing, idempotency (exact duplicate +
 * later legitimate update), duplicate line, warehouse dependency
 * (missing/ambiguous/inactive), material dependency (missing/ambiguous/
 * inactive), conflicting identifiers, mixed-line results, retryable
 * failure + retry-limit exhaustion, permanent rejection, deferred-record
 * replay, watermark tie, failed-record-prevents-advance, replay from prior
 * committed watermark, concurrent/lock conflict (single-queue serialization),
 * shadow run zero-writes, shadow run zero-watermark-advancement,
 * deterministic repeat-run parity, and scope-exclusion (no receipts/bills/
 * invoices/estimates/projects).
 *
 * No regression to Stage 2E.5 validators is asserted here indirectly: this
 * suite reuses the SAME shared modules the 2E.5 validators use, and the
 * 2E.5 validators are run independently to confirm parity.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import { executeIncrementalSync } from "../../shared/stSync/poIncrementalOrchestrator.ts";
import {
  purchaseOrderAdapter,
  resetPoTypeCache,
  setPoTypeCacheForTesting,
} from "../../shared/stSync/adapters/purchaseOrderAdapter.ts";
import {
  purchaseOrderWatermarkConfig,
  purchaseOrderLockConfig,
  PURCHASE_ORDER_OVERLAP_MINUTES,
  PURCHASE_ORDERS_API_PATH,
} from "../../shared/stSync/stPurchaseOrderSyncConfig.ts";
import { normalizePoStatus } from "../../shared/stPurchaseOrderSync.ts";
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

const CTX = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;

function baseDeps() {
  return {
    vendors: [makeVendor("22549317")],
    warehouses: [makeWarehouse("141")],
    materials: [makeMaterial("38372634")],
  };
}

/** Run the engine in shadow (dry_run) mode with a mock fetchPage. */
async function runShadow(sources: any[], watermark?: any) {
  const mock = createMockBase44({ ...baseDeps(), watermark: watermark || makeWatermark() });
  const adapter = makePoTestAdapter(async () => ({ records: sources, hasMore: false, nextPage: null, totalCount: sources.length }));
  const result = await runSyncEngine(adapter, {
    executionMode: "dry_run",
    maxPages: 1,
    maxRecords: 50,
    maxRuntimeMs: 30000,
    watermarkConfig: purchaseOrderWatermarkConfig,
  }, mock.client, CTX);
  return { result, mock };
}

/** Run the engine in write mode (mock entities only — no ST writes). */
async function runWrite(sources: any[], mockOpts: any = {}) {
  const mock = createMockBase44({ ...baseDeps(), ...mockOpts });
  const adapter = makePoTestAdapter(async () => ({ records: sources, hasMore: false, nextPage: null, totalCount: sources.length }));
  const result = await runSyncEngine(adapter, {
    executionMode: "write",
    maxPages: 1,
    maxRecords: 50,
    maxRuntimeMs: 30000,
    lockConfig: purchaseOrderLockConfig,
    watermarkConfig: purchaseOrderWatermarkConfig,
  }, mock.client, CTX);
  return { result, mock };
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  setPoTypeCacheForTesting(new Map<string, string>([["146", "Warranty"]]));

  // ── 1. Valid Pending PO is eligible (shadow classifies created) ──
  {
    const { result } = await runShadow([makePoSource(6001, { status: "Pending" })]);
    results.push({
      name: "1. Valid Pending PO — eligible, shadow classifies created, no writes",
      passed: result.created === 1 && result.skipped === 0 && result.failed === 0,
      details: `created=${result.created}, skipped=${result.skipped}, failed=${result.failed}`,
    });
  }

  // ── 2. Valid Sent PO is eligible ──
  {
    const { result } = await runShadow([makePoSource(6002, { status: "Sent" })]);
    results.push({
      name: "2. Valid Sent PO — eligible, shadow classifies created",
      passed: result.created === 1 && result.skipped === 0,
      details: `created=${result.created}, skipped=${result.skipped}`,
    });
  }

  // ── 3. Unsupported status (Received) is skipped, never processed ──
  {
    const { result, mock } = await runShadow([makePoSource(6003, { status: "Received" })]);
    const poWrites = mock.writes.filter((w: any) => w.entity === "PurchaseOrder").length;
    results.push({
      name: "3. Received PO — skipped (status_not_pending_or_sent), no writes",
      passed: result.created === 0 && result.skipped === 1 && poWrites === 0,
      details: `created=${result.created}, skipped=${result.skipped}, poWrites=${poWrites}`,
    });
  }

  // ── 4. Direct eligibility reason codes ──
  {
    const ctx = { watermark: makeWatermark() } as any;
    const r1 = await purchaseOrderAdapter.checkEligibility!(null as any, makePoSource(6004, { status: "Canceled" }), null, ctx);
    const r2 = await purchaseOrderAdapter.checkEligibility!(null as any, makePoSource(6005, { status: null }), null, ctx);
    const r3 = await purchaseOrderAdapter.checkEligibility!(null as any, makePoSource(6006, { status: "Disputed" }), null, ctx);
    results.push({
      name: "4. Eligibility reason codes — status_not_pending_or_sent / status_missing / status_unknown",
      passed: !r1.allowed && r1.reason === "status_not_pending_or_sent"
        && !r2.allowed && r2.reason === "status_missing"
        && !r3.allowed && r3.reason === "status_unknown",
      details: `cancelled=${r1.reason}, null=${r2.reason}, disputed=${r3.reason}`,
    });
  }

  // ── 5. Missing PO identifier → failed ──
  {
    const { result } = await runShadow([{ ...makePoSource(6007), id: undefined } as any]);
    results.push({
      name: "5. Missing PO identifier — record FAILED",
      passed: result.failed === 1 && result.created === 0,
      details: `failed=${result.failed}, created=${result.created}`,
    });
  }

  // ── 6. Malformed incoming timestamp → stale-skip (when existing present) ──
  {
    const existing = {
      id: "po-6008", servicetitan_purchase_order_id: "6008", servicetitan_po_number: "PO-6008",
      status: "sent", servicetitan_vendor_id: "22549317", servicetitan_warehouse_id: "141",
      servicetitan_modified_on: NOW, servicetitan_last_event_at: NOW, servicetitan_active: true,
      total: 876.07, line_count: 1, total_quantity_ordered: 1, total_quantity_received: 0,
      tax_amount: 0, shipping_amount: 0, servicetitan_sync_version: 1, lines_expected_count: 1,
    };
    const { result } = await runShadow(
      [makePoSource(6008, { status: "Sent", modifiedOn: "not-a-date" })],
      makeWatermark(),
    );
    // Existing seeded via mock state? runShadow builds fresh mock; seed manually.
    const mock = createMockBase44({ ...baseDeps(), existingPOs: [existing], watermark: makeWatermark() });
    const adapter = makePoTestAdapter(async () => ({ records: [makePoSource(6008, { status: "Sent", modifiedOn: "not-a-date" })], hasMore: false, nextPage: null, totalCount: 1 }));
    const r2 = await runSyncEngine(adapter, { executionMode: "dry_run", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    results.push({
      name: "6. Malformed incoming timestamp — stale-skip, not created",
      passed: r2.stale >= 1 && r2.created === 0,
      details: `stale=${r2.stale}, created=${r2.created}, (shadow1 stale=${result.stale})`,
    });
  }

  // ── 7. Null vs missing optional fields — explicit null preserved in raw_data ──
  {
    const ctx = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;
    const withNull = await purchaseOrderAdapter.mapRecord(makePoSource(6009, { summary: null }), ctx);
    const without = await purchaseOrderAdapter.mapRecord(makePoSource(6010), ctx);
    const rawWith = JSON.parse(withNull.servicetitan_raw_data || "{}");
    const rawWithout = JSON.parse(without.servicetitan_raw_data || "{}");
    results.push({
      name: "7. Null vs missing — explicit null preserved in raw_data, absent omitted",
      passed: rawWith.summary === null && rawWithout.summary === undefined,
      details: `withNull.summary=${rawWith.summary}, without.summary=${rawWithout.summary}`,
    });
  }

  // ── 8. Duplicate exact source event — no duplicate create (idempotent) ──
  {
    const src = makePoSource(6011, { status: "Sent", modifiedOn: NOW });
    const { result: r1, mock } = await runWrite([src]);
    const linesAfter1 = mock.state.PurchaseOrderLine.length;
    const adapter = makePoTestAdapter(async () => ({ records: [src], hasMore: false, nextPage: null, totalCount: 1 }));
    const r2 = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "6011");
    results.push({
      name: "8. Duplicate exact event — second run unchanged, no duplicate PO/line",
      passed: r1.created === 1 && r2.created === 0 && r2.unchanged === 1 && pos.length === 1 && mock.state.PurchaseOrderLine.length === linesAfter1,
      details: `run1.created=${r1.created}, run2.created=${r2.created}, run2.unchanged=${r2.unchanged}, poCount=${pos.length}, lines=${mock.state.PurchaseOrderLine.length}`,
    });
  }

  // ── 9. Later legitimate update to same PO — updated, not duplicated ──
  {
    const { mock } = await runWrite([makePoSource(6012, { status: "Sent", modifiedOn: "2026-08-03T11:00:00Z", total: 500 })]);
    const adapter = makePoTestAdapter(async () => ({ records: [makePoSource(6012, { status: "Sent", modifiedOn: "2026-08-03T12:00:00Z", total: 600 })], hasMore: false, nextPage: null, totalCount: 1 }));
    const r2 = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "6012");
    results.push({
      name: "9. Later legitimate update — updated (not created), single PO, total changed",
      passed: r2.updated === 1 && r2.created === 0 && pos.length === 1 && Number(pos[0].total) === 600,
      details: `updated=${r2.updated}, created=${r2.created}, poCount=${pos.length}, total=${pos[0].total}`,
    });
  }

  // ── 10. Duplicate line input — no duplicate line on identical re-run ──
  {
    const { mock } = await runWrite([makePoSource(6013, { status: "Sent" })]);
    const before = mock.state.PurchaseOrderLine.length;
    const adapter = makePoTestAdapter(async () => ({ records: [makePoSource(6013, { status: "Sent" })], hasMore: false, nextPage: null, totalCount: 1 }));
    await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    const after = mock.state.PurchaseOrderLine.length;
    results.push({
      name: "10. Duplicate line input — line count stable on identical re-run",
      passed: before === 1 && after === 1,
      details: `lines before=${before}, after=${after}`,
    });
  }

  // ── 11. Missing warehouse → deferred with WAREHOUSE_MISSING ──
  {
    const ctx = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;
    const mock = createMockBase44({ vendors: [makeVendor("22549317")], warehouses: [], materials: [makeMaterial("38372634")] });
    const mapped = await purchaseOrderAdapter.mapRecord(makePoSource(6014, { status: "Sent" }), ctx);
    const dep = await purchaseOrderAdapter.verifyDependencies!(mock.client, mapped, ctx);
    results.push({
      name: "11. Missing warehouse — deferred with WAREHOUSE_MISSING reason",
      passed: dep.status === "deferred" && (dep.warning || "").includes("WAREHOUSE_MISSING"),
      details: `status=${dep.status}, warning=${dep.warning}`,
    });
  }

  // ── 12. Ambiguous warehouse → deferred with WAREHOUSE_AMBIGUOUS (never guesses) ──
  {
    const ctx = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;
    const mock = createMockBase44({ vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141", "WH-A"), makeWarehouse("141", "WH-B")], materials: [makeMaterial("38372634")] });
    const mapped = await purchaseOrderAdapter.mapRecord(makePoSource(6015, { status: "Sent" }), ctx);
    const dep = await purchaseOrderAdapter.verifyDependencies!(mock.client, mapped, ctx);
    results.push({
      name: "12. Ambiguous warehouse — deferred with WAREHOUSE_AMBIGUOUS, no guess",
      passed: dep.status === "deferred" && (dep.warning || "").includes("WAREHOUSE_AMBIGUOUS"),
      details: `status=${dep.status}, warning=${dep.warning}`,
    });
  }

  // ── 13. Inactive warehouse → deferred with WAREHOUSE_INACTIVE ──
  {
    const ctx = { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" } as any;
    const mock = createMockBase44({ vendors: [makeVendor("22549317")], warehouses: [makeWarehouse("141", "WH-OLD"), { ...makeWarehouse("141", "WH-OLD"), is_active: false }], materials: [makeMaterial("38372634")] });
    // Use a single inactive warehouse (ambiguous above used 2 active). For inactive test, one record with is_active=false:
    const mockInactive = createMockBase44({ vendors: [makeVendor("22549317")], warehouses: [{ ...makeWarehouse("141", "WH-OLD"), is_active: false }], materials: [makeMaterial("38372634")] });
    const mapped = await purchaseOrderAdapter.mapRecord(makePoSource(6016, { status: "Sent" }), ctx);
    const dep = await purchaseOrderAdapter.verifyDependencies!(mockInactive.client, mapped, ctx);
    results.push({
      name: "13. Inactive warehouse — deferred with WAREHOUSE_INACTIVE",
      passed: dep.status === "deferred" && (dep.warning || "").includes("WAREHOUSE_INACTIVE"),
      details: `status=${dep.status}, warning=${dep.warning}`,
    });
  }

  // ── 14. Missing material → line deferred with MATERIAL_MISSING ──
  {
    const { result, mock } = await runWrite([makePoSource(6017, { status: "Sent" })], { materials: [] });
    const summary = result.postBatchSummaries[0];
    const reasons: string[] = (summary && summary.line_deferral_reasons) || [];
    results.push({
      name: "14. Missing material — line deferred with MATERIAL_MISSING, header survives",
      passed: result.created === 1 && summary && summary.po_lines_deferred_this_run === 1 && reasons.includes("MATERIAL_MISSING"),
      details: `created=${result.created}, lines_deferred=${summary?.po_lines_deferred_this_run}, reasons=${JSON.stringify(reasons)}`,
    });
  }

  // ── 15. Ambiguous material → line deferred with MATERIAL_AMBIGUOUS ──
  {
    const { result } = await runWrite([makePoSource(6018, { status: "Sent" })], { materials: [makeMaterial("38372634"), { ...makeMaterial("38372634"), id: "mat-dup" }] });
    const summary = result.postBatchSummaries[0];
    const reasons: string[] = (summary && summary.line_deferral_reasons) || [];
    results.push({
      name: "15. Ambiguous material — line deferred with MATERIAL_AMBIGUOUS (conflicting identifiers)",
      passed: summary && summary.po_lines_deferred_this_run === 1 && reasons.includes("MATERIAL_AMBIGUOUS"),
      details: `lines_deferred=${summary?.po_lines_deferred_this_run}, reasons=${JSON.stringify(reasons)}`,
    });
  }

  // ── 16. Inactive material → line deferred with MATERIAL_INACTIVE ──
  {
    const { result } = await runWrite([makePoSource(6019, { status: "Sent" })], { materials: [{ ...makeMaterial("38372634"), is_active: false }] });
    const summary = result.postBatchSummaries[0];
    const reasons: string[] = (summary && summary.line_deferral_reasons) || [];
    results.push({
      name: "16. Inactive material — line deferred with MATERIAL_INACTIVE",
      passed: summary && summary.po_lines_deferred_this_run === 1 && reasons.includes("MATERIAL_INACTIVE"),
      details: `lines_deferred=${summary?.po_lines_deferred_this_run}, reasons=${JSON.stringify(reasons)}`,
    });
  }

  // ── 17. Multiple lines with mixed dependency results ──
  {
    const src = makePoSource(6020, {
      status: "Sent",
      items: [
        { id: 602001, skuId: 38372634, skuCode: "03601669", skuName: "Resolved", quantity: 1, quantityReceived: 0, cost: 10, total: 10, status: "Pending", modifiedOn: NOW },
        { id: 602002, skuId: 99999999, skuCode: "x", skuName: "Missing", quantity: 1, quantityReceived: 0, cost: 10, total: 10, status: "Pending", modifiedOn: NOW },
      ],
    });
    const { result } = await runWrite([src]);
    const summary = result.postBatchSummaries[0];
    results.push({
      name: "17. Mixed-line batch — one line created, one deferred, header survives",
      passed: summary && summary.po_lines_created_this_run === 1 && summary.po_lines_deferred_this_run === 1,
      details: `created=${summary?.po_lines_created_this_run}, deferred=${summary?.po_lines_deferred_this_run}`,
    });
  }

  // ── 18. Retryable technical failure + retry-limit exhaustion → failed, no create ──
  {
    const mock = createMockBase44({ ...baseDeps(), watermark: makeWatermark() });
    // Force createRecord to always throw; findExisting returns null → safeCreate exhausts 5 retries → failed.
    (mock.client.asServiceRole.entities.PurchaseOrder as any).create = async () => { throw new Error("persisted failure"); };
    const adapter = makePoTestAdapter(async () => ({ records: [makePoSource(6021, { status: "Sent" })], hasMore: false, nextPage: null, totalCount: 1 }));
    const result = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "6021");
    results.push({
      name: "18. Retryable failure + retry-limit exhaustion — failed, no PO created",
      passed: result.failed >= 1 && pos.length === 0,
      details: `failed=${result.failed}, retries=${result.retries}, poCount=${pos.length}`,
    });
  }

  // ── 19. Permanent structural rejection (missing id) → failed ──
  {
    const { result } = await runWrite([{ ...makePoSource(6022, { status: "Sent" }), id: undefined } as any]);
    results.push({
      name: "19. Permanent structural rejection (missing id) — failed",
      passed: result.failed === 1 && result.created === 0,
      details: `failed=${result.failed}, created=${result.created}`,
    });
  }

  // ── 20. Deferred record replay after dependency correction ──
  {
    const src = makePoSource(6023, { status: "Sent" });
    // Run 1: no warehouse → deferred (no PO created)
    const mock = createMockBase44({ vendors: [makeVendor("22549317")], warehouses: [], materials: [makeMaterial("38372634")], watermark: makeWatermark() });
    let adapter = makePoTestAdapter(async () => ({ records: [src], hasMore: false, nextPage: null, totalCount: 1 }));
    const r1 = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    // Correct dependency: add warehouse to mock state, re-run same source
    mock.state.WarehouseLocation.push(makeWarehouse("141"));
    const r2 = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    const pos = mock.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "6023");
    results.push({
      name: "20. Deferred record replay — first deferred, second creates after correction",
      passed: r1.deferred === 1 && r1.created === 0 && r2.created === 1 && pos.length === 1,
      details: `run1.deferred=${r1.deferred}, run1.created=${r1.created}, run2.created=${r2.created}, poCount=${pos.length}`,
    });
  }

  // ── 21. Watermark tie at identical timestamps — not stale, processed ──
  {
    const existing = {
      id: "po-6024", servicetitan_purchase_order_id: "6024", servicetitan_po_number: "PO-6024",
      status: "sent", servicetitan_vendor_id: "22549317", servicetitan_warehouse_id: "141",
      servicetitan_project_id: null, servicetitan_job_id: null, servicetitan_sent_on: null,
      servicetitan_purchase_order_type_id: "146", servicetitan_purchase_order_type_name: "Warranty",
      order_date: "2026-07-31T00:00:00Z", expected_delivery_date: "2026-08-03T00:00:00Z", actual_delivery_date: null,
      servicetitan_modified_on: NOW, servicetitan_last_event_at: NOW, servicetitan_active: true,
      total: 876.07, line_count: 1, total_quantity_ordered: 1, total_quantity_received: 0,
      tax_amount: 0, shipping_amount: 0, servicetitan_sync_version: 1, lines_expected_count: 1,
    };
    const mock = createMockBase44({ ...baseDeps(), existingPOs: [existing], existingLines: [{ id: "l-6024", servicetitan_po_line_id: "602401", purchase_order_id: "po-6024", servicetitan_material_id: "38372634", inventory_master_id: "mat-38372634", quantity_ordered: 1, quantity_received: 0, unit_cost: 211.01, line_total: 211.01, line_status: "open", servicetitan_sync_version: 1 }], watermark: makeWatermark() });
    const adapter = makePoTestAdapter(async () => ({ records: [makePoSource(6024, { status: "Sent", modifiedOn: NOW })], hasMore: false, nextPage: null, totalCount: 1 }));
    const r = await runSyncEngine(adapter, { executionMode: "write", maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig }, mock.client, CTX);
    results.push({
      name: "21. Watermark tie (identical modifiedOn) — not stale, processed as unchanged",
      passed: r.stale === 0 && r.unchanged === 1,
      details: `stale=${r.stale}, unchanged=${r.unchanged}`,
    });
  }

  // ── 22. Failed record prevents unsafe watermark advancement ──
  {
    const result = await executeIncrementalSync(
      createMockBase44({ ...baseDeps(), watermark: makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" }) }).client,
      { adapter: makePoTestAdapter(async () => ({ records: [{ ...makePoSource(6025, { status: "Sent" }), id: undefined } as any], hasMore: false, nextPage: null, totalCount: 1 })), lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig, maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, overlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES, resetCache: resetPoTypeCache },
      { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" },
    );
    results.push({
      name: "22. Failed record — watermark NOT advanced (partial_failure)",
      passed: result.status === "partial_failure" && !result.watermark_advanced && result.headers_failed >= 1,
      details: `status=${result.status}, advanced=${result.watermark_advanced}, failed=${result.headers_failed}`,
    });
  }

  // ── 23. Replay from prior committed watermark — window computed from last_modified_scan_at ──
  {
    let captured: string | null = null;
    const mock = createMockBase44({ ...baseDeps(), watermark: makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" }) });
    const adapter = makePoTestAdapter(async (_c: any, req: any) => { captured = req.windowStart; return { records: [], hasMore: false, nextPage: null, totalCount: 0 }; });
    await executeIncrementalSync(mock.client, { adapter, lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig, maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, overlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES, resetCache: resetPoTypeCache }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    const expected = new Date(new Date("2026-08-03T11:00:00Z").getTime() - 5 * 60 * 1000).toISOString();
    results.push({
      name: "23. Replay from prior committed watermark — windowStart = last_scan - 5min",
      passed: captured !== null && Math.abs(new Date(captured).getTime() - new Date(expected).getTime()) < 1000,
      details: `expected=${expected}, captured=${captured}`,
    });
  }

  // ── 24. Concurrent duplicate / single-queue serialization — lock conflict ──
  {
    const lockedCursor = { id: "cursor-po", integration_name: "servicetitan_purchase_order_sync", domain: "purchase_order", tenant_id: TENANT_ID, environment: ENVIRONMENT, lock_id: "LOCK-existing", lock_expires_at: new Date(Date.now() + 60000).toISOString(), status: "running" };
    const mock = createMockBase44({ ...baseDeps(), watermark: makeWatermark(), cursor: lockedCursor });
    const result = await executeIncrementalSync(mock.client, { adapter: makePoTestAdapter(async () => ({ records: [], hasMore: false, nextPage: null, totalCount: 0 })), lockConfig: purchaseOrderLockConfig, watermarkConfig: purchaseOrderWatermarkConfig, maxPages: 1, maxRecords: 50, maxRuntimeMs: 30000, overlapMinutes: PURCHASE_ORDER_OVERLAP_MINUTES, resetCache: resetPoTypeCache }, { tenantId: TENANT_ID, environment: ENVIRONMENT, source: "api_recovery" });
    results.push({
      name: "24. Concurrent duplicate — lock conflict → already_running, no writes, no advance",
      passed: result.status === "already_running" && result.outbound_writes === 0 && !result.watermark_advanced,
      details: `status=${result.status}, outbound_writes=${result.outbound_writes}, advanced=${result.watermark_advanced}`,
    });
  }

  // ── 25. Shadow run — zero ServiceTitan writes ──
  {
    const { mock } = await runShadow([makePoSource(6026, { status: "Sent" })]);
    const poWrites = mock.writes.filter((w: any) => w.entity === "PurchaseOrder" || w.entity === "PurchaseOrderLine");
    results.push({
      name: "25. Shadow run — zero PurchaseOrder/PurchaseOrderLine writes (dry_run)",
      passed: poWrites.length === 0,
      details: `poWrites=${poWrites.length}`,
    });
  }

  // ── 26. Shadow run — zero production watermark advancement ──
  {
    const wm = makeWatermark({ last_modified_scan_at: "2026-08-03T11:00:00Z" });
    const { result } = await runShadow([makePoSource(6027, { status: "Sent" })], wm);
    const advanced = result.watermarkAfter && result.watermarkBefore && result.watermarkAfter.last_modified_scan_at !== result.watermarkBefore.last_modified_scan_at;
    results.push({
      name: "26. Shadow run — watermark NOT advanced (watermarkAfter === watermarkBefore)",
      passed: !advanced && result.mode === "dry_run",
      details: `mode=${result.mode}, advanced=${advanced}`,
    });
  }

  // ── 27. Deterministic repeat-run parity ──
  {
    const a = await runShadow([makePoSource(6028, { status: "Sent" })]);
    const b = await runShadow([makePoSource(6028, { status: "Sent" })]);
    const same = a.result.created === b.result.created && a.result.skipped === b.result.skipped && a.result.failed === b.result.failed && a.result.processed === b.result.processed;
    results.push({
      name: "27. Deterministic repeat-run — identical metrics across two shadow runs",
      passed: same,
      details: `runA(created=${a.result.created},skipped=${a.result.skipped},failed=${a.result.failed}), runB(created=${b.result.created},skipped=${b.result.skipped},failed=${b.result.failed})`,
    });
  }

  // ── 28. Scope exclusion — endpoint is inventory/v2 (not procurement); no receipts/bills ──
  {
    const endpoint = purchaseOrderAdapter.getEndpoint({ tenantId: TENANT_ID } as any);
    const normPending = normalizePoStatus("Pending");
    const normSent = normalizePoStatus("Sent");
    results.push({
      name: "28. Scope — PO endpoint under /inventory/v2/, Pending/Sent normalizations, no receipts/bills",
      passed: endpoint === PURCHASE_ORDERS_API_PATH(TENANT_ID) && endpoint.includes("/inventory/v2/") && !endpoint.includes("receipt") && !endpoint.includes("bill") && normPending.normalized === "draft" && normSent.normalized === "sent",
      details: `endpoint=${endpoint}, pending→${normPending.normalized}, sent→${normSent.normalized}`,
    });
  }

  resetPoTypeCache();
  return results;
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export default async function (req: Request): Promise<Response> {
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
      mode: "validate_stage_2e6_purchase_order_foundation",
      stage: "2E.6",
      writes_performed: 0,
      live_api_calls: 0,
      shadow_mode: true,
      total_tests: results.length,
      passed,
      failed,
      acceptance: allPassed ? "PASS" : "FAIL",
      failed_tests: failedResults,
      summary: `Stage 2E.6 PO Foundation: ${passed}/${results.length} tests passed. ${allPassed ? "All tests PASS — shadow mode, zero external writes, zero production watermark advancement." : `${failed} tests FAILED.`}`,
    });
  } catch (error) {
    return Response.json({ error: (error as any).message, stack: (error as any).stack, summary: "Stage 2E.6 validation failed" }, { status: 500 });
  }
}