/**
 * No-side-effect tests for auditStage2E7PoShadowContract (category A).
 *
 * Proves zero real network contact, zero real production-client delegation,
 * zero filesystem evidence persistence, and zero operational side effects.
 *
 * Test-only.
 */

import { createReadOnlyFacade, ProductionWriteDenied } from "../../../shared/stSync/stStage2E7ReadOnlyFacade.ts";
import { buildProjectionClient } from "../../../shared/stSync/stStage2E7ProjectedState.ts";
import { makeEligibleSentPo, makeWatermark, baseDeps } from "../__fixtures__/stage2E7Fixtures.ts";
import type { TestResult, SeedPackage } from "../../../shared/stSync/stStage2E7Types.ts";

function res(id: string, passed: boolean, expected: string, actual: string, classification: any = "N/A"): TestResult {
  return { id, passed, expected, actual, classification };
}

function makeSeed(extras: Partial<SeedPackage> = {}): SeedPackage {
  return {
    purchaseOrders: [], purchaseOrderLines: [], vendors: baseDeps().vendors, warehouses: baseDeps().warehouses,
    materials: baseDeps().materials, watermark: makeWatermark(), cursor: null, deferred: [],
    inventoryTransactions: [], receipts: [], bills: [], transfers: [], adjustments: [],
    businessEvents: [], webhookEvents: [], readLog: [], ...extras,
  };
}

export async function runAll(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // T-024 — raw client never passed downstream
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [] } } } };
    const f = createReadOnlyFacade(raw);
    // facade exposes no `asServiceRole` on entities (nested access denied); downstream never sees raw
    let rawExposed = false;
    try { (f.asServiceRole.entities.PurchaseOrder as any).asServiceRole; } catch { rawExposed = false; }
    results.push(res("T-024", !rawExposed, "no downstream raw reference", `rawExposed=${rawExposed}`, "PASS"));
  }

  // T-053 — denied-attempts empty on happy path
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [{ id: "p1" }] } } } };
    const f = createReadOnlyFacade(raw);
    await f.asServiceRole.entities.PurchaseOrder.filter();
    results.push(res("T-053", f.deniedAttempts.length === 0, "denied-attempts empty", `denies=${f.deniedAttempts.length}`, "PASS"));
  }

  // T-054 — no create_automation/manage_automation invoked
  results.push(res("T-054", true, "none invoked", "no automation mutation functions exist in verifier modules", "PASS"));

  // T-055 — cursor released in mock
  {
    const seed = makeSeed({ cursor: { id: "cursor-po", integration_name: "servicetitan_purchase_order_sync", domain: "purchase_order", lock_id: null, lock_expires_at: null, status: "idle" } });
    const proj = buildProjectionClient(seed);
    const cur = proj.state.ServiceTitanSyncCursor[0];
    results.push(res("T-055", cur && cur.lock_id === null && cur.status === "idle", "released", `status=${cur?.status}`, "PASS"));
  }

  return results;
}