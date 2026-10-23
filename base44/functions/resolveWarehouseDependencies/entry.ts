/**
 * resolveWarehouseDependencies — Stage 2E.5 Phase 1
 *
 * Resolves missing WarehouseLocation dependencies for Purchase Order sync.
 * Deployment trigger.
 *
 * Queries the ServiceTitan Inventory API for all warehouses (and trucks if
 * needed), filters for the target ServiceTitan warehouse IDs, and creates
 * local WarehouseLocation records with `servicetitan_warehouse_id` populated.
 *
 * Does NOT modify existing WarehouseLocation records — only creates missing ones.
 * Does NOT modify any Purchase Order sync logic.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { apiRequest, retryWithBackoff, getEnvironment } from "../../shared/stAuth.ts";

interface WarehouseSource {
  id?: number | string;
  name?: string;
  active?: boolean;
  type?: string;
  createdOn?: string;
  modifiedOn?: string;
  address?: any;
  [key: string]: unknown;
}

interface MappingEntry {
  servicetitan_warehouse_id: string;
  servicetitan_name: string | null;
  servicetitan_active: boolean;
  servicetitan_type: string | null;
  local_id: string | null;
  local_name: string | null;
  status: "already_mapped" | "created" | "missing_in_st" | "create_failed";
  error?: string;
}

const TARGET_WAREHOUSE_IDS = [
  "141",
  "39747999",
  "44846207",
  "43211077",
  "4811051",
  "21517786",
  "1044475",
];

function getTenantId(): string {
  const tenant = Deno.env.get("SERVICETITAN_TENANT_ID");
  if (!tenant) throw new Error("SERVICETITAN_TENANT_ID not set");
  return tenant;
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function mapLocationType(stType: string | null): string {
  if (!stType) return "warehouse";
  const lower = stType.toLowerCase();
  if (lower.includes("truck")) return "truck";
  if (lower.includes("warehouse")) return "warehouse";
  return "warehouse";
}

async function fetchAllFromEndpoint(
  path: string,
  environment: string
): Promise<WarehouseSource[]> {
  const all: WarehouseSource[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 100) {
    const result = await retryWithBackoff(async () => {
      return await apiRequest(path, environment, {
        params: { page: String(page), pageSize: "50" },
      });
    });
    const records: WarehouseSource[] = result.data || result.items || [];
    all.push(...records);
    hasMore = result.hasMore ?? false;
    page++;
  }
  return all;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const environment = getEnvironment();
    const tenantId = getTenantId();
    const nowIso = new Date().toISOString();

    // Fetch all warehouses from ST API
    const warehousesPath = `/inventory/v2/tenant/${tenantId}/warehouses`;
    let stWarehouses: WarehouseSource[] = [];
    let warehousesEndpointOk = true;
    try {
      stWarehouses = await fetchAllFromEndpoint(warehousesPath, environment);
    } catch (err) {
      warehousesEndpointOk = false;
    }

    // Always fetch trucks too — the missing IDs may be truck locations
    let stTrucks: WarehouseSource[] = [];
    let trucksEndpointOk = true;
    try {
      const trucksPath = `/inventory/v2/tenant/${tenantId}/trucks`;
      stTrucks = await fetchAllFromEndpoint(trucksPath, environment);
    } catch (err) {
      trucksEndpointOk = false;
    }

    // Build a map of all ST locations by ID, tagging the source endpoint
    const stLocationMap = new Map<string, WarehouseSource & { _source_endpoint: string }>();
    for (const w of stWarehouses) {
      const id = normalizeId(w.id);
      if (id) stLocationMap.set(id, { ...w, _source_endpoint: "warehouses" });
    }
    for (const t of stTrucks) {
      const id = normalizeId(t.id);
      if (id) stLocationMap.set(id, { ...t, _source_endpoint: "trucks" });
    }

    // Query existing local WarehouseLocation records with servicetitan_warehouse_id
    const existingLocal = await base44.asServiceRole.entities.WarehouseLocation.list(200);
    const localByStId = new Map<string, { id: string; name: string }>();
    for (const loc of existingLocal) {
      if (loc.servicetitan_warehouse_id) {
        localByStId.set(loc.servicetitan_warehouse_id, { id: loc.id, name: loc.name });
      }
    }

    const mapping: MappingEntry[] = [];
    let createdCount = 0;
    let alreadyMappedCount = 0;
    let missingInStCount = 0;
    let createFailedCount = 0;

    for (const targetId of TARGET_WAREHOUSE_IDS) {
      const stLoc = stLocationMap.get(targetId);

      // Check if already mapped locally
      const existing = localByStId.get(targetId);
      if (existing) {
        mapping.push({
          servicetitan_warehouse_id: targetId,
          servicetitan_name: stLoc?.name || null,
          servicetitan_active: stLoc?.active ?? true,
          servicetitan_type: stLoc?.type || null,
          local_id: existing.id,
          local_name: existing.name,
          status: "already_mapped",
        });
        alreadyMappedCount++;
        continue;
      }

      // Not in ST API
      if (!stLoc) {
        mapping.push({
          servicetitan_warehouse_id: targetId,
          servicetitan_name: null,
          servicetitan_active: true,
          servicetitan_type: null,
          local_id: null,
          local_name: null,
          status: "missing_in_st",
        });
        missingInStCount++;
        continue;
      }

      // Create local WarehouseLocation record
      try {
        const sourceEndpoint = (stLoc as any)._source_endpoint || "warehouses";
        const locationType = sourceEndpoint === "trucks" ? "truck" : mapLocationType(stLoc.type || null);
        const name = stLoc.name || `ServiceTitan Warehouse ${targetId}`;
        const rawData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(stLoc)) {
          if (!["id", "name", "active", "type", "createdOn", "modifiedOn"].includes(key)) {
            rawData[key] = value;
          }
        }

        const created = await base44.asServiceRole.entities.WarehouseLocation.create({
          name,
          location_type: locationType,
          location_code: `ST-${targetId}`,
          is_active: stLoc.active !== false,
          is_physical_location: locationType !== "in_transit",
          servicetitan_warehouse_id: targetId,
          servicetitan_active: stLoc.active !== false,
          servicetitan_sync_status: "synced",
          servicetitan_last_sync: nowIso,
          servicetitan_modified_on: stLoc.modifiedOn || null,
          servicetitan_created_on: stLoc.createdOn || null,
          servicetitan_sync_version: 1,
          servicetitan_source: "api",
          servicetitan_raw_data: JSON.stringify(rawData),
          import_source: "api_recovery",
          imported_at: nowIso,
          notes: "Created by Stage 2E.5 WarehouseLocation resolver for Purchase Order sync dependency.",
        });

        mapping.push({
          servicetitan_warehouse_id: targetId,
          servicetitan_name: stLoc.name || null,
          servicetitan_active: stLoc.active !== false,
          servicetitan_type: stLoc.type || null,
          local_id: created.id,
          local_name: created.name,
          status: "created",
        });
        createdCount++;
      } catch (err) {
        mapping.push({
          servicetitan_warehouse_id: targetId,
          servicetitan_name: stLoc.name || null,
          servicetitan_active: stLoc.active !== false,
          servicetitan_type: stLoc.type || null,
          local_id: null,
          local_name: null,
          status: "create_failed",
          error: String(err).substring(0, 200),
        });
        createFailedCount++;
      }
    }

    // Verify no duplicates after creation
    const postCheck = await base44.asServiceRole.entities.WarehouseLocation.list(200);
    const postByStId = new Map<string, number>();
    for (const loc of postCheck) {
      if (loc.servicetitan_warehouse_id) {
        postByStId.set(loc.servicetitan_warehouse_id, (postByStId.get(loc.servicetitan_warehouse_id) || 0) + 1);
      }
    }
    const duplicates: string[] = [];
    for (const [stId, count] of postByStId.entries()) {
      if (count > 1) duplicates.push(stId);
    }

    return Response.json({
      mode: "resolve_warehouse_dependencies",
      target_warehouse_ids: TARGET_WAREHOUSE_IDS,
      st_warehouses_fetched: stWarehouses.length,
      st_trucks_fetched: stTrucks.length,
      warehouses_endpoint_ok: warehousesEndpointOk,
      trucks_endpoint_ok: trucksEndpointOk,
      created: createdCount,
      already_mapped: alreadyMappedCount,
      missing_in_st: missingInStCount,
      create_failed: createFailedCount,
      duplicate_servicetitan_warehouse_ids: Array.from(postByStId.entries()).filter(([, c]) => c > 1).map(([id]) => id),
      mapping,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}