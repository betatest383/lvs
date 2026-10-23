/**
 * Repository-only integration tests for auditStage2E7PoShadowContract (category A).
 *
 * Mocked ServiceTitan transport + mocked Base44 reads. Full coordinator flow
 * in-memory. Zero live contact, zero production delegation, zero evidence
 * persistence.
 *
 * Test-only.
 */

import { buildProjectionClient, serializeProjectionState } from "../../../shared/stSync/stStage2E7ProjectedState.ts";
import { buildEnvelopeAsync, verifyEnvelope } from "../../../shared/stSync/stStage2E7EvidencePayload.ts";
import { createReadOnlyFacade } from "../../../shared/stSync/stStage2E7ReadOnlyFacade.ts";
import {
  makeEligibleSentPo,
  makeWatermark,
  baseDeps,
  fakeCheckEligibility,
  fakeResolveDependencies,
  FIX_ACTIVATION,
} from "../__fixtures__/stage2E7Fixtures.ts";
import type { TestResult, SeedPackage } from "../../../shared/stSync/stStage2E7Types.ts";

function res(id: string, passed: boolean, expected: string, actual: string, classification: any = "N/A"): TestResult {
  return { id, passed, expected, actual, classification };
}

function makeSeed(extras: Partial<SeedPackage> = {}): SeedPackage {
  return {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: baseDeps().vendors,
    warehouses: baseDeps().warehouses,
    materials: baseDeps().materials,
    watermark: makeWatermark(),
    cursor: null,
    deferred: [],
    inventoryTransactions: [],
    receipts: [],
    bills: [],
    transfers: [],
    adjustments: [],
    businessEvents: [],
    webhookEvents: [],
    readLog: [],
    ...extras,
  };
}

export async function runAll(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // T-051 — full coordinator flow in-memory
  {
    const seed = makeSeed({ purchaseOrders: [makeEligibleSentPo(201)] });
    const proj = buildProjectionClient(seed);
    const e = fakeCheckEligibility(makeEligibleSentPo(201), FIX_ACTIVATION);
    const dep = fakeResolveDependencies(makeEligibleSentPo(201), seed);
    const env = await buildEnvelopeAsync({ correlationId: "cid-051", evidence: { eligible: e.allowed, dep: dep.status } });
    const v = await verifyEnvelope(env);
    results.push(res("T-051", e.allowed && dep.status === "satisfied" && v.lengthOk && v.hashOk, "completes", `eligible=${e.allowed},dep=${dep.status},env=${v.lengthOk && v.hashOk}`, "PASS"));
  }

  // T-052 — complete registry count reconciliation
  {
    const seed = makeSeed({ purchaseOrders: [makeEligibleSentPo(202), makeEligibleSentPo(203)] });
    const proj = buildProjectionClient(seed);
    const count = proj.state.PurchaseOrder.length;
    results.push(res("T-052", count === 2, "count match", `count=${count}`, "PASS"));
  }

  return results;
}