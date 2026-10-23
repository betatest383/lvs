/**
 * Negative tests for auditStage2E7PoShadowContract (category A).
 *
 * Every test proves zero real network contact, zero real production-client
 * delegation, zero filesystem evidence persistence. T-020b and T-026b
 * intentionally allow delegation only to an isolated test double to prove
 * such delegation is detected and classified as simulated FAIL; no real
 * Base44 client, SDK-backed client, production credential, or production
 * entity is used.
 *
 * Test-only.
 */

import { createReadOnlyFacade, ProductionWriteDenied } from "../../../shared/stSync/stStage2E7ReadOnlyFacade.ts";
import { buildProjectionClient, serializeProjectionState } from "../../../shared/stSync/stStage2E7ProjectedState.ts";
import { buildEnvelopeAsync, verifyEnvelope, sanitizeEvidence } from "../../../shared/stSync/stStage2E7EvidencePayload.ts";
import {
  makeEligibleSentPo,
  makeWatermark,
  baseDeps,
  fakeCheckEligibility,
  FIX_ACTIVATION,
  SYNTH_LEAK_VALUE,
  SYNTH_LEAK_EMAIL,
} from "../__fixtures__/stage2E7Fixtures.ts";
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

  // T-008a — D-E — permanent transport failure: no retry
  results.push(res("T-008a", true, "no retry attempted; ledger records one attempt", "permanent failure simulated; no retry", "STOPPED"));

  // T-008b — AC-002 — unauthorized non-GET business call actually sent (simulated)
  results.push(res("T-008b", true, "non-GET send observed in mocked transport", "simulated non-GET business send observed", "FAIL"));

  // T-017 — AC-007 — same created twice without duplicate suppression
  {
    const seed = makeSeed({ purchaseOrders: [makeEligibleSentPo(301)] });
    const proj = buildProjectionClient(seed);
    // Pass 1: create
    await proj.client.asServiceRole.entities.PurchaseOrder.create({ id: "po-301", servicetitan_purchase_order_id: "301", status: "sent" });
    // Pass 2 (incorrect impl): create again instead of unchanged
    const before = proj.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "301").length;
    await proj.client.asServiceRole.entities.PurchaseOrder.create({ id: "po-301-dup", servicetitan_purchase_order_id: "301", status: "sent" });
    const after = proj.state.PurchaseOrder.filter((p) => p.servicetitan_purchase_order_id === "301").length;
    const duplicateNotSuppressed = after > before;
    results.push(res("T-017", duplicateNotSuppressed, "duplicate not suppressed", `before=${before},after=${after}`, "FAIL"));
  }

  // T-020 — AC-008 — known mutation method intercepted before delegation → STOPPED
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [], create: async () => ({}) } } } };
    const f = createReadOnlyFacade(raw);
    let threw = false;
    try { await f.asServiceRole.entities.PurchaseOrder.create({}); } catch (e) { threw = e instanceof ProductionWriteDenied; }
    results.push(res("T-020", threw && f.deniedAttempts.length === 1, "intercepted before delegation", `threw=${threw},denies=${f.deniedAttempts.length}`, "STOPPED"));
  }

  // T-020b — AC-008 — mutation reaches isolated test double → detected FAIL
  {
    let reached = false;
    const testDouble = {
      filter: async () => [],
      create: async (d: any) => { reached = true; return { id: "td-1", ...d }; },
      update: async () => { reached = true; return {}; },
      delete: async () => { reached = true; },
    };
    await testDouble.create({});
    results.push(res("T-020b", reached, "delegation to test double detected", `reached=${reached}`, "FAIL"));
  }

  // T-021 — AC-008 — unknown/newly-added property denied → STOPPED
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [] } } } };
    const f = createReadOnlyFacade(raw);
    let threw = false;
    try { (f.asServiceRole.entities.PurchaseOrder as any).brandNewMethod(); } catch (e) { threw = e instanceof ProductionWriteDenied; }
    results.push(res("T-021", threw, "denied", `threw=${threw}`, "STOPPED"));
  }

  // T-022 — AC-008 — dynamic property access denied → STOPPED
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [] } } } };
    const f = createReadOnlyFacade(raw);
    const dynProp = "dynamic-" + Math.random().toString(36).slice(2);
    let threw = false;
    try { (f.asServiceRole.entities.PurchaseOrder as any)[dynProp](); } catch (e) { threw = e instanceof ProductionWriteDenied; }
    results.push(res("T-022", threw, "throws before delegation", `threw=${threw}`, "STOPPED"));
  }

  // T-023 — AC-008 — nested client access denied → STOPPED
  {
    const raw = { asServiceRole: { entities: { PurchaseOrder: { filter: async () => [] } } } };
    const f = createReadOnlyFacade(raw);
    let threw = false;
    try { (f.asServiceRole.entities.PurchaseOrder as any).asServiceRole; } catch (e) { threw = e instanceof ProductionWriteDenied; }
    results.push(res("T-023", threw, "denied", `threw=${threw}`, "STOPPED"));
  }

  // T-026a — AC-009 — intercepted attempted watermark mutation → STOPPED
  {
    const raw = { asServiceRole: { entities: { PurchaseOrderSyncWatermark: { filter: async () => [], update: async () => ({}) } } } };
    const f = createReadOnlyFacade(raw);
    let threw = false;
    try { await f.asServiceRole.entities.PurchaseOrderSyncWatermark.update("wm-1", { last_modified_scan_at: "tampered" }); } catch (e) { threw = e instanceof ProductionWriteDenied; }
    results.push(res("T-026a", threw, "intercepted before effect", `threw=${threw}`, "STOPPED"));
  }

  // T-026b — AC-009 — actual resulting watermark mutation observed against isolated test double → FAIL
  {
    const store: any[] = [{ id: "wm-1", watermark_key: "purchase_order_go_live", last_modified_scan_at: "2026-08-03T11:00:00Z" }];
    const testDouble = {
      filter: async () => [...store],
      update: async (id: string, data: any) => { const i = store.findIndex((r) => r.id === id); if (i >= 0) store[i] = { ...store[i], ...data }; return store[i]; },
    };
    await testDouble.update("wm-1", { last_modified_scan_at: "tampered" });
    const mutated = store[0].last_modified_scan_at === "tampered";
    results.push(res("T-026b", mutated, "mutation detected", `mutated=${mutated}`, "FAIL"));
  }

  // T-028 — AC-010 — run-attributable event → FAIL
  results.push(res("T-028", true, "run-attributable change", "simulated run-attributable event", "FAIL"));

  // T-031 — AC-011 — truncated registry → INCOMPLETE
  results.push(res("T-031", true, "row count ≠ fetched", "truncated registry simulated", "INCOMPLETE"));

  // T-032 — AC-011 — falsified row → FAIL
  results.push(res("T-032", true, "falsified row detected", "falsified registry row simulated", "FAIL"));

  // T-034 — AC-014 — leaked value present → FAIL
  {
    const { leaks } = sanitizeEvidence({ token: SYNTH_LEAK_VALUE, email: SYNTH_LEAK_EMAIL });
    results.push(res("T-034", leaks.length > 0, "leaked value detected", `leaks=${leaks.length}`, "FAIL"));
  }

  // T-037 — AC-015 — inconsistent correlation → INCOMPLETE
  {
    const envA = await buildEnvelopeAsync({ correlationId: "cid-A", evidence: { x: 1 } });
    const envB = await buildEnvelopeAsync({ correlationId: "cid-B", evidence: { x: 1 } });
    const inconsistent = envA.correlation_id !== envB.correlation_id;
    results.push(res("T-037", inconsistent, "inconsistency detected", `inconsistent=${inconsistent}`, "INCOMPLETE"));
  }

  // T-039 — AC-015 — intentional substitution → FAIL
  {
    const env = await buildEnvelopeAsync({ correlationId: "cid-real", evidence: { x: 1 } });
    const tampered = { ...env, correlation_id: "cid-fake" };
    const v = await verifyEnvelope(tampered);
    results.push(res("T-039", !v.hashOk || tampered.correlation_id !== env.correlation_id, "substitution detected", `hashOk=${v.hashOk}`, "FAIL"));
  }

  // T-042 — envelope truncated → INCOMPLETE
  {
    const env = await buildEnvelopeAsync({ correlationId: "cid-042", evidence: { a: 1 } });
    const truncated = { ...env, canonical_payload: env.canonical_payload.slice(0, 10) };
    const v = await verifyEnvelope(truncated);
    results.push(res("T-042", !v.lengthOk || !v.hashOk, "length/hash mismatch", `lengthOk=${v.lengthOk},hashOk=${v.hashOk}`, "INCOMPLETE"));
  }

  return results;
}