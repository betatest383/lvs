/**
 * Stage 2E.7 Shadow Audit — Pure in-memory projected state (D-B).
 *
 * PURE MODULE: imports NO Base44 SDK, NO fetch, NO auth, NO stAuth, NO facade.
 * Accepts ONLY a plain-data SeedPackage and sanitized inputs. Performs Pass 1
 * and Pass 2 entirely in memory.
 *
 * Runtime and test-only. No side effects beyond in-memory state mutation.
 */

import type { ProjectionClient, ProjectionEntityHandler, SeedPackage } from "./stStage2E7Types.ts";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}-proj-${idCounter}`;
}

function matchesField(record: any, field: string, condition: any): boolean {
  const val = record[field];
  if (condition === null || condition === undefined) {
    return val === null || val === undefined;
  }
  if (Array.isArray(condition)) return condition.includes(val);
  if (typeof condition === "object") {
    for (const [op, opVal] of Object.entries(condition)) {
      switch (op) {
        case "$in": if (!(opVal as any[]).includes(val)) return false; break;
        case "$nin": if ((opVal as any[]).includes(val)) return false; break;
        case "$ne": if (val === opVal) return false; break;
        case "$exists":
          if (opVal === true && val === undefined) return false;
          if (opVal === false && val !== undefined) return false;
          break;
        case "$gte": if (!(Number(val) >= Number(opVal))) return false; break;
        case "$gt": if (!(Number(val) > Number(opVal))) return false; break;
        case "$lte": if (!(Number(val) <= Number(opVal))) return false; break;
        case "$lt": if (!(Number(val) < Number(opVal))) return false; break;
        case "$regex": {
          try { if (!new RegExp(opVal as string).test(String(val ?? ""))) return false; } catch { return false; }
          break;
        }
        case "$options": break;
      }
    }
    return true;
  }
  return val === condition;
}

function filterRecords(records: any[], query: any): any[] {
  if (!query) return records;
  return records.filter((r) => {
    for (const [key, val] of Object.entries(query)) {
      if (key === "$or") {
        if (!(val as any[]).some((c) => Object.entries(c).every(([k, v]) => matchesField(r, k, v)))) return false;
        continue;
      }
      if (key === "$and") {
        if (!(val as any[]).every((c) => Object.entries(c).every(([k, v]) => matchesField(r, k, v)))) return false;
        continue;
      }
      if (!matchesField(r, key, val)) return false;
    }
    return true;
  });
}

function makeHandler(state: any[], entityName: string): ProjectionEntityHandler {
  return {
    filter: async (query?: any, _sort?: string, limit?: number) => {
      let recs = filterRecords(state, query);
      if (limit) recs = recs.slice(0, limit);
      return recs;
    },
    list: async (_sort?: string, limit?: number) => (limit ? state.slice(0, limit) : [...state]),
    get: async (id: string) => state.find((r) => r.id === id) ?? null,
    create: async (data: any) => {
      const rec = { id: data.id ?? nextId(entityName), ...data };
      state.push(rec);
      return rec;
    },
    update: async (id: string, data: any) => {
      const idx = state.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error(`not found: ${id}`);
      state[idx] = { ...state[idx], ...data };
      return state[idx];
    },
    delete: async (id: string) => {
      const idx = state.findIndex((r) => r.id === id);
      if (idx >= 0) state.splice(idx, 1);
    },
    bulkCreate: async (items: any[]) => {
      const recs = items.map((d) => ({ id: d.id ?? nextId(entityName), ...d }));
      state.push(...recs);
      return recs;
    },
    bulkUpdate: async (items: any[]) =>
      items.map((d) => {
        const idx = state.findIndex((r) => r.id === d.id);
        if (idx >= 0) state[idx] = { ...state[idx], ...d };
        return state[idx];
      }),
    updateMany: async (query: any, update: any) => {
      const matched = filterRecords(state, query);
      for (const r of matched) Object.assign(r, update.$set ?? update);
      return { modifiedCount: matched.length };
    },
    deleteMany: async (query: any) => {
      const before = state.length;
      const matchedIds = new Set(filterRecords(state, query).map((r) => r.id));
      for (let i = state.length - 1; i >= 0; i--) {
        if (matchedIds.has(state[i].id)) state.splice(i, 1);
      }
      return { deletedCount: before - state.length };
    },
  };
}

export function buildProjectionClient(seed: SeedPackage): {
  client: ProjectionClient;
  state: Record<string, any[]>;
  writes: { entity: string; op: string }[];
} {
  const state: Record<string, any[]> = {
    PurchaseOrder: seed.purchaseOrders.map((p) => ({ ...p })),
    PurchaseOrderLine: seed.purchaseOrderLines.map((l) => ({ ...l })),
    Vendor: seed.vendors.map((v) => ({ ...v })),
    WarehouseLocation: seed.warehouses.map((w) => ({ ...w })),
    InventoryMaster: seed.materials.map((m) => ({ ...m })),
    PurchaseOrderSyncWatermark: seed.watermark ? [{ ...seed.watermark }] : [],
    ServiceTitanSyncCursor: seed.cursor ? [{ ...seed.cursor }] : [],
    DeferredDependentRecord: seed.deferred.map((d) => ({ ...d })),
    InventoryTransaction: seed.inventoryTransactions.map((t) => ({ ...t })),
  };
  const writes: { entity: string; op: string }[] = [];
  const entities: Record<string, any> = {};
  for (const name of Object.keys(state)) {
    const raw = makeHandler(state[name], name) as any;
    const wrapped: any = {};
    for (const op of ["filter", "list", "get"]) wrapped[op] = raw[op];
    for (const op of ["create", "update", "delete", "bulkCreate", "bulkUpdate", "updateMany", "deleteMany"]) {
      const fn = raw[op];
      wrapped[op] = async function (...args: any[]) {
        const res = await fn(...args);
        writes.push({ entity: name, op });
        return res;
      };
    }
    entities[name] = wrapped;
  }
  return { client: { asServiceRole: { entities } }, state, writes };
}

export function canonicalJson(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

export async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function serializeProjectionState(state: Record<string, any[]>): string {
  const keys = Object.keys(state).sort();
  const parts = keys.map((k) => {
    const arr = [...state[k]].sort((a, b) => {
      const ai = a.servicetitan_purchase_order_id ?? a.id ?? "";
      const bi = b.servicetitan_purchase_order_id ?? b.id ?? "";
      return String(ai) < String(bi) ? -1 : String(ai) > String(bi) ? 1 : 0;
    });
    return JSON.stringify(k) + ":" + canonicalJson(arr);
  });
  return "{" + parts.join(",") + "}";
}