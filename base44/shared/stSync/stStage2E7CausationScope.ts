/**
 * Stage 2E.7 Shadow Audit — Causation scope.
 *
 * Enumerates the run-sensitive scope, captures before/after canonical
 * snapshots + SHA-256, and classifies causation per the binding contract §9.
 *
 * Runtime and test-only. Read-only facade access only.
 */

import type { ReadOnlyFacade } from "./stStage2E7ReadOnlyFacade.ts";
import type { ScopeSnapshot, Disposition } from "./stStage2E7Types.ts";
import { canonicalJson, sha256Hex, deepCopy } from "./stStage2E7ReadCapture.ts";
import { RUN_SENSITIVE_ENTITIES } from "./stStage2E7ShadowAuditConfig.ts";

export async function snapshotScope(facade: ReadOnlyFacade): Promise<ScopeSnapshot[]> {
  const out: ScopeSnapshot[] = [];
  for (const entity of RUN_SENSITIVE_ENTITIES) {
    const handler = facade.asServiceRole.entities[entity];
    const records = handler ? deepCopy(await handler.filter()) : [];
    const serialized = canonicalJson(records);
    const sha256 = await sha256Hex(serialized);
    out.push({ entity, count: records.length, sha256, serialized });
  }
  return out;
}

export interface ScopeComparison {
  entity: string;
  unchanged: boolean;
  beforeCount: number;
  afterCount: number;
}

export function compareSnapshots(before: ScopeSnapshot[], after: ScopeSnapshot[]): ScopeComparison[] {
  const map = new Map(before.map((s) => [s.entity, s]));
  return after.map((a) => {
    const b = map.get(a.entity);
    return {
      entity: a.entity,
      unchanged: !!b && b.sha256 === a.sha256,
      beforeCount: b?.count ?? 0,
      afterCount: a.count,
    };
  });
}

export interface CausationInput {
  change: ScopeComparison;
  capturedIds: string[];
  recordsBefore: any[];
  recordsAfter: any[];
  correlationId: string;
}

export function classifyCausation(input: CausationInput): Disposition {
  const { change, capturedIds, recordsBefore, recordsAfter } = input;
  if (change.unchanged) return "PASS";
  const beforeIds = new Set(recordsBefore.map((r) => r.servicetitan_purchase_order_id ?? r.id));
  const afterIds = new Set(recordsAfter.map((r) => r.servicetitan_purchase_order_id ?? r.id));
  const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
  // run-attributable if a new/changed record's id is in the captured set
  if (newIds.some((id) => capturedIds.includes(String(id)))) return "FAIL";
  // unrelated concurrent with conclusive evidence (different ids) -> recorded, not FAIL
  return "INCOMPLETE";
}