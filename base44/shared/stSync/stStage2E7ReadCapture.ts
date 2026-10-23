/**
 * Stage 2E.7 Shadow Audit — Production-read capture.
 *
 * Accepts the read-only facade (D-A) as its sole production-data access
 * surface. Performs ONLY approved reads. Returns deeply-copied plain-data
 * seed records. Records a read ledger. Performs NO projection, NO
 * ServiceTitan contact, NO writes.
 *
 * Runtime and test-only.
 */

import type { ReadOnlyFacade } from "./stStage2E7ReadOnlyFacade.ts";
import type { SeedPackage, ReadOnlyEntityAccess } from "./stStage2E7Types.ts";
import { STAGE_2E7_WATERMARK_KEY, STAGE_2E7_CURSOR_DOMAIN } from "./stStage2E7ShadowAuditConfig.ts";

export function deepCopy<T>(v: T): T {
  return v === undefined ? (undefined as any) : JSON.parse(JSON.stringify(v));
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

export interface ReadCaptureResult {
  seed: SeedPackage;
  readLog: { entity: string; query: any; count: number; timestamp: string }[];
}

export async function captureSeed(
  facade: ReadOnlyFacade,
  capturedPoIds: string[],
): Promise<ReadCaptureResult> {
  const readLog: { entity: string; query: any; count: number; timestamp: string }[] = [];
  const E = facade.asServiceRole.entities;

  async function readAll(name: string, query?: any): Promise<any[]> {
    const handler = E[name] as ReadOnlyEntityAccess | undefined;
    if (!handler) return [];
    const records = await handler.filter(query);
    readLog.push({ entity: name, query, count: records.length, timestamp: new Date().toISOString() });
    return deepCopy(records);
  }

  const poQuery = capturedPoIds.length ? { servicetitan_purchase_order_id: { $in: capturedPoIds } } : undefined;
  const purchaseOrders = await readAll("PurchaseOrder", poQuery);
  const purchaseOrderLines = await readAll("PurchaseOrderLine", poQuery);
  const vendors = await readAll("Vendor");
  const warehouses = await readAll("WarehouseLocation");
  const materials = await readAll("InventoryMaster");
  const watermarkRecs = await readAll("PurchaseOrderSyncWatermark", { watermark_key: STAGE_2E7_WATERMARK_KEY });
  const cursorRecs = await readAll("ServiceTitanSyncCursor", { domain: STAGE_2E7_CURSOR_DOMAIN });
  const deferred = await readAll("DeferredDependentRecord", { domain: STAGE_2E7_CURSOR_DOMAIN });
  const inventoryTransactions = await readAll("InventoryTransaction");
  const receipts = await readAll("Receipt");
  const bills = await readAll("Bill");
  const transfers = await readAll("WarehouseTransfer");
  const adjustments = await readAll("InventoryAdjustment");
  const businessEvents = await readAll("BusinessEvent");
  const webhookEvents = await readAll("ServiceTitanWebhookEvent");

  const seed: SeedPackage = {
    purchaseOrders,
    purchaseOrderLines,
    vendors,
    warehouses,
    materials,
    watermark: watermarkRecs[0] ?? null,
    cursor: cursorRecs[0] ?? null,
    deferred,
    inventoryTransactions,
    receipts,
    bills,
    transfers,
    adjustments,
    businessEvents,
    webhookEvents,
    readLog,
  };
  return { seed, readLog };
}

export async function captureCanonicalSnapshot(
  facade: ReadOnlyFacade,
  entityName: string,
  query?: any,
): Promise<{ records: any[]; count: number; sha256: string; serialized: string }> {
  const handler = facade.asServiceRole.entities[entityName];
  const records = handler ? deepCopy(await handler.filter(query)) : [];
  const serialized = canonicalJson(records);
  const sha256 = await sha256Hex(serialized);
  return { records, count: records.length, sha256, serialized };
}