/**
 * Shared Sync Engine Validation Utilities
 *
 * Common helpers used by domain-specific validation functions
 * (validateAppointmentSyncEngine, validateJobSyncEngine, etc.).
 *
 * These utilities provide mock Base44 clients, real-adapter-with-mock-fetch
 * wrappers, and standard test/safeguard verification functions so that each
 * domain's validation function only needs to define its test scenarios.
 */

import { runSyncEngine } from "./stSyncEngine.ts";
import type {
  ServiceTitanSyncAdapter,
  SyncContext,
  SyncPageRequest,
  SyncPageResult,
} from "./stSyncAdapter.ts";
import type { EngineResult } from "./stSyncEngine.ts";
import type { WatermarkConfig, LockConfig } from "./stSyncTypes.ts";

// ─── Mock Base44 Client ──────────────────────────────────────────────────────

export interface MockBase44 {
  client: any;
  writes: any[];
}

/**
 * Create a mock Base44 client with in-memory state for testing.
 * Supports any entity names passed in `entityNames`.
 */
export function createMockBase44(opts: {
  watermark?: any;
  cursor?: any;
  entityData?: Record<string, any[]>;
  entityNames?: string[];
}): MockBase44 {
  const writes: any[] = [];
  const state: Record<string, any[]> = {};

  // Initialize standard entities
  const standardEntities = [
    "ServiceTitanSyncCursor",
    "JobSyncWatermark",
    "CustomerSyncWatermark",
    "AppointmentSyncWatermark",
    "Job",
    "Customer",
    "Appointment",
  ];
  const allEntities = [...standardEntities, ...(opts.entityNames || [])];

  // Seed cursor
  if (opts.cursor) state["ServiceTitanSyncCursor"] = [{ ...opts.cursor }];

  // Seed watermarks
  if (opts.watermark) {
    for (const wmEntity of ["JobSyncWatermark", "CustomerSyncWatermark", "AppointmentSyncWatermark"]) {
      state[wmEntity] = [{ ...opts.watermark }];
    }
  }

  // Seed entity data from opts.entityData
  if (opts.entityData) {
    for (const [entityName, records] of Object.entries(opts.entityData)) {
      state[entityName] = records.map((r) => ({ ...r }));
    }
  }

  // Ensure all entities have at least an empty array
  for (const entityName of allEntities) {
    if (!state[entityName]) state[entityName] = [];
  }

  function makeHandler(entityName: string) {
    return {
      filter: async () => state[entityName] || [],
      get: async (id: string) => {
        const records = state[entityName] || [];
        return records.find((r) => r.id === id) || null;
      },
      update: async (id: string, data: any) => {
        const records = state[entityName] || [];
        const idx = records.findIndex((r) => r.id === id);
        if (idx >= 0) records[idx] = { ...records[idx], ...data };
        writes.push({ entity: entityName, type: "update", id, data });
        return records.find((r) => r.id === id) || { id, ...data };
      },
      create: async (data: any) => {
        const record = { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data };
        if (!state[entityName]) state[entityName] = [];
        state[entityName].push(record);
        writes.push({ entity: entityName, type: "create", data });
        return record;
      },
      list: async (limit?: number) => {
        const records = state[entityName] || [];
        return limit ? records.slice(0, limit) : records;
      },
    };
  }

  const entities: Record<string, any> = {};
  for (const entityName of allEntities) {
    entities[entityName] = makeHandler(entityName);
  }

  return {
    writes,
    client: {
      asServiceRole: {
        entities,
      },
    },
  };
}

// ─── Real Adapter with Mock fetchPage ────────────────────────────────────────

/**
 * Wrap a REAL adapter, overriding ONLY fetchPage to return test data pages.
 * All other adapter methods (mapRecord, findExisting, recordsEqual,
 * verifyDependencies, etc.) run for real.
 */
export function createRealAdapterWithMockFetch<TSource = any>(
  realAdapter: ServiceTitanSyncAdapter<TSource>,
  options: {
    pages?: any[][];
    repeatPage?: boolean;
  }
): ServiceTitanSyncAdapter<TSource> {
  let pageIdx = 0;

  return {
    ...realAdapter,
    async fetchPage(
      _context: SyncContext,
      request: SyncPageRequest
    ): Promise<SyncPageResult<TSource>> {
      const pages = options.pages || [];
      const records = pageIdx < pages.length ? pages[pageIdx] : [];
      const isLastPage = pageIdx >= pages.length - 1;

      if (options.repeatPage) {
        pageIdx++;
        return {
          records,
          hasMore: true,
          nextPage: request.pagination.mode === "page" ? request.pagination.page : 1,
        };
      }

      pageIdx++;
      return {
        records,
        hasMore: !isLastPage,
        nextPage: !isLastPage
          ? (request.pagination.mode === "page" ? request.pagination.page + 1 : null)
          : null,
      };
    },
  };
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  engineResult?: EngineResult;
}

export async function runEngineTest(
  name: string,
  adapter: ServiceTitanSyncAdapter,
  mockBase: MockBase44,
  engineConfig: any,
  contextParams: { tenantId: string; environment: string; source: "api_recovery" | "webhook" | "on_demand_hydration" | "manual" },
  assertions?: (result: EngineResult, mockBase: MockBase44) => { passed: boolean; details: string }
): Promise<TestResult> {
  try {
    const result = await runSyncEngine(adapter, engineConfig, mockBase.client, contextParams);

    if (assertions) {
      const check = assertions(result, mockBase);
      return { name, passed: check.passed, details: check.details, engineResult: result };
    }
    return { name, passed: true, details: "Completed without error", engineResult: result };
  } catch (err) {
    return { name, passed: false, details: `Exception: ${err}` };
  }
}

// ─── Standard Safeguard Verifications ────────────────────────────────────────

export async function verifyLockCleanup(
  adapter: ServiceTitanSyncAdapter,
  mockBase: MockBase44,
  engineConfig: any,
  contextParams: { tenantId: string; environment: string; source: "api_recovery" | "webhook" | "on_demand_hydration" | "manual" }
): Promise<{ passed: boolean; details: string }> {
  const result = await runSyncEngine(adapter, engineConfig, mockBase.client, contextParams);

  const lockAcquired = result.lockAcquired;
  const lockReleaseWrite = mockBase.writes.find(
    (w) => w.entity === "ServiceTitanSyncCursor" && w.type === "update" && w.data.lock_id === ""
  );
  const passed = lockAcquired && !!lockReleaseWrite;
  return {
    passed,
    details: `lockAcquired=${lockAcquired}, lockReleased=${!!lockReleaseWrite}, totalWrites=${mockBase.writes.length}`,
  };
}

export async function verifyBoundedErrors(
  domain: string,
  integrationName: string,
  mockBase: MockBase44,
  engineConfig: any,
  contextParams: { tenantId: string; environment: string; source: "api_recovery" | "webhook" | "on_demand_hydration" | "manual" },
  NOW: string
): Promise<{ passed: boolean; details: string }> {
  const records = Array.from({ length: 15 }, (_, i) => ({
    id: `err-${i}`,
    createdOn: NOW,
    modifiedOn: NOW,
  }));

  const adapter: ServiceTitanSyncAdapter = {
    domain,
    integrationName,
    getEndpoint: () => "/mock",
    getInitialPaginationState: () => ({ mode: "page" as const, page: 1, pageSize: 50 }),
    fetchPage: async () => ({ records, hasMore: false, nextPage: null }),
    getSourceId: (r) => (r?.id ? String(r.id) : null),
    getSourceCreatedOn: (r) => r?.createdOn || null,
    getSourceModifiedOn: (r) => r?.modifiedOn || null,
    mapRecord: async () => { throw new Error("Intentional failure"); },
    findExisting: async () => null,
    getLocalSourceModifiedOn: () => null,
    verifyDependencies: async () => ({ status: "satisfied" as const }),
    recordsEqual: () => false,
    createRecord: async (_b, m) => ({ id: "mock", ...m }),
    updateRecord: async (_b, e, m) => ({ ...e, ...m }),
  };

  const result = await runSyncEngine(
    adapter,
    { ...engineConfig, maxErrors: 5, maxRecords: 15 },
    mockBase.client,
    contextParams
  );

  return {
    passed: result.errors.length <= 5 && result.failed === 15,
    details: `errors.length=${result.errors.length} (bounded at 5), failed=${result.failed}`,
  };
}

export async function verifyZeroWrites(
  adapter: ServiceTitanSyncAdapter,
  mockBase: MockBase44,
  engineConfig: any,
  contextParams: { tenantId: string; environment: string; source: "api_recovery" | "webhook" | "on_demand_hydration" | "manual" },
  domainEntityName: string
): Promise<{ passed: boolean; details: string }> {
  const result = await runSyncEngine(adapter, engineConfig, mockBase.client, contextParams);

  const domainWrites = mockBase.writes.filter((w) => w.entity === domainEntityName);
  const watermarkWrites = mockBase.writes.filter((w) => w.entity.includes("Watermark"));

  return {
    passed: mockBase.writes.length === 0 && result.created === 1,
    details: `totalWrites=${mockBase.writes.length}, ${domainEntityName.toLowerCase()}Writes=${domainWrites.length}, watermarkWrites=${watermarkWrites.length}, created=${result.created}`,
  };
}

// ─── Mock Adapter Builder (for safeguard tests) ──────────────────────────────

/**
 * Build a minimal mock adapter for engine safeguard tests.
 */
export function buildMockAdapter(
  domain: string,
  integrationName: string,
  records: any[],
  NOW: string,
  options?: {
    throwOnSecondMap?: boolean;
    hasMore?: boolean;
    maxPages?: number;
  }
): ServiceTitanSyncAdapter {
  let pageCounter = 0;
  let mapCallCount = 0;
  const shouldHaveMore = options?.hasMore ?? false;
  const maxPages = options?.maxPages ?? 1;

  return {
    domain,
    integrationName,
    getEndpoint: () => "/mock",
    getInitialPaginationState: () => ({ mode: "page" as const, page: 1, pageSize: 5 }),
    fetchPage: async (_ctx, req) => {
      pageCounter++;
      const isLastPage = pageCounter >= maxPages;
      return {
        records,
        hasMore: shouldHaveMore && !isLastPage,
        nextPage: shouldHaveMore && !isLastPage
          ? (req.pagination.mode === "page" ? req.pagination.page + 1 : null)
          : null,
      };
    },
    getSourceId: (r) => (r?.id ? String(r.id) : null),
    getSourceCreatedOn: (r) => r?.createdOn || null,
    getSourceModifiedOn: (r) => r?.modifiedOn || null,
    mapRecord: async (r) => {
      if (options?.throwOnSecondMap && mapCallCount === 1) {
        mapCallCount++;
        throw new Error("Mock mapping failure (intentional)");
      }
      mapCallCount++;
      return {
        servicetitan_job_id: String(r.id),
        servicetitan_appointment_id: String(r.id),
        status: "scheduled",
        status_mapping_result: "mapped",
        servicetitan_customer_id: "cust-123",
        servicetitan_modified_on: r?.modifiedOn || null,
      };
    },
    findExisting: async () => null,
    getLocalSourceModifiedOn: () => null,
    verifyDependencies: async () => ({ status: "satisfied" as const }),
    recordsEqual: () => false,
    createRecord: async (_b, m) => ({ id: "mock", ...m }),
    updateRecord: async (_b, e, m) => ({ ...e, ...m }),
  };
}

// ─── Standard Config Helpers ─────────────────────────────────────────────────

export function createMockWatermark(key: string, strategy: string): any {
  return {
    id: `mock-wm-${key}`,
    watermark_key: key,
    activation_timestamp: "2026-06-01T00:00:00Z",
    status: "active",
    sync_strategy: strategy,
    environment: "integration",
    tenant_id: "mock-tenant",
  };
}

export const STANDARD_CONTEXT = {
  tenantId: "mock-tenant",
  environment: "integration",
  source: "api_recovery" as const,
};

export const STANDARD_LOCK_CONFIG: LockConfig = {
  entityName: "ServiceTitanSyncCursor",
  lockDurationMinutes: 5,
};

export function createStandardEngineConfig(watermarkConfig: WatermarkConfig, overrides?: any): any {
  return {
    executionMode: "dry_run" as const,
    maxPages: 3,
    maxRecords: 10,
    maxRuntimeMs: 10000,
    maxErrors: 20,
    watermarkConfig,
    ...overrides,
  };
}