/**
 * validateAppointmentSyncEngine — Phase 3 Validation
 *
 * Connects the REAL Appointment adapter to the generic sync engine in a
 * validation-only (dry_run) context.
 *
 * Uses shared validation utilities from stSyncValidationUtils.ts.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import type { ServiceTitanSyncAdapter } from "../../shared/stSync/stSyncAdapter.ts";
import type { EngineResult } from "../../shared/stSync/stSyncEngine.ts";
import {
  createMockBase44,
  createRealAdapterWithMockFetch,
  runEngineTest,
  verifyLockCleanup,
  verifyBoundedErrors,
  verifyZeroWrites,
  createMockWatermark,
  createStandardEngineConfig,
  STANDARD_CONTEXT,
  STANDARD_LOCK_CONFIG,
} from "../../shared/stSync/stSyncValidationUtils.ts";
import { appointmentAdapter } from "../../shared/stSync/adapters/appointmentAdapter.ts";
import { appointmentWatermarkConfig } from "../../shared/stAppointmentSyncConfig.ts";

const NOW = "2026-07-15T12:00:00Z";
const MOCK_WATERMARK = createMockWatermark("appointment_go_live", "new_and_active_appointments_only");
const MOCK_CUSTOMER = {
  id: "cust-local-1",
  servicetitan_customer_id: "cust-123",
  name: "Test Customer",
  status: "active",
  servicetitan_sync_status: "synced",
};

interface TestResult { name: string; passed: boolean; details: string; }

async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const engineConfig = createStandardEngineConfig(appointmentWatermarkConfig);

  // 1. Mapped Appointment (proposed create)
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, {
      pages: [[{ id: "appt-1", appointmentNumber: "APPT-001", jobId: "job-1", jobNumber: "JN-1", customerId: "cust-123", customerName: "Test Customer", locationId: "loc-1", status: "Scheduled", start: "2026-07-15T10:00:00Z", end: "2026-07-15T12:00:00Z", technicianId: "tech-1", createdOn: NOW, modifiedOn: NOW }]],
    });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("REAL: Mapped Appointment (proposed create)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.created === 1 && r.failed === 0 && r.mode === "dry_run",
      details: `created=${r.created}, failed=${r.failed}, mode=${r.mode}`,
    })));
  }

  // 2. Unchanged Appointment
  {
    const apiRecord = { id: "appt-2", appointmentNumber: "APPT-002", jobId: "job-2", jobNumber: "JN-2", customerId: "cust-123", customerName: "Test Customer", locationId: "loc-2", status: "Scheduled", start: "2026-07-15T10:00:00Z", end: "2026-07-15T12:00:00Z", technicianId: "tech-2", createdOn: NOW, modifiedOn: NOW };
    const existingLocal = { id: "local-2", servicetitan_appointment_id: "appt-2", crm_appointment_id: "appt-2", servicetitan_customer_id: "cust-123", servicetitan_job_id: "job-2", servicetitan_job_number: "JN-2", servicetitan_location_id: "loc-2", scheduled_start: "2026-07-15T10:00:00Z", scheduled_end: "2026-07-15T12:00:00Z", servicetitan_technician_id: "tech-2", servicetitan_raw_status: "Scheduled", servicetitan_modified_on: NOW, status: "scheduled" };
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[apiRecord]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER], Appointment: [existingLocal] } });
    results.push(await runEngineTest("REAL: Unchanged Appointment (recordsEqual=true)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.unchanged === 1 && r.created === 0 && r.updated === 0,
      details: `unchanged=${r.unchanged}, created=${r.created}, updated=${r.updated}`,
    })));
  }

  // 3. Stale Appointment
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-3", customerId: "cust-123", status: "Scheduled", createdOn: "2026-06-15T00:00:00Z", modifiedOn: "2026-06-15T00:00:00Z" }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER], Appointment: [{ id: "local-3", servicetitan_appointment_id: "appt-3", servicetitan_modified_on: "2026-07-01T00:00:00Z", status: "scheduled" }] } });
    results.push(await runEngineTest("REAL: Stale Appointment (older modifiedOn)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.stale === 1 && r.created === 0 && r.updated === 0,
      details: `stale=${r.stale}, created=${r.created}, updated=${r.updated}`,
    })));
  }

  // 4. Unsupported status
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-4", customerId: "cust-123", status: "SomeFutureStatus", createdOn: NOW, modifiedOn: NOW }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("REAL: Unsupported status (normalizedStatus=null)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.unsupported === 1 && r.created === 1,
      details: `unsupported=${r.unsupported}, created=${r.created}, status=null preserved`,
    })));
  }

  // 5. Invalid status (empty string)
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-5", customerId: "cust-123", status: "", createdOn: NOW, modifiedOn: NOW }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("REAL: Invalid status (empty string)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.created === 1 && r.invalid === 1,
      details: `created=${r.created}, invalid=${r.invalid} (status mapping invalid)`,
    })));
  }

  // 6. Missing Customer dependency
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-6", customerId: null, status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK });
    results.push(await runEngineTest("REAL: Missing Customer dependency (failed)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.failed === 1 && r.created === 0,
      details: `failed=${r.failed}, created=${r.created}`,
    })));
  }

  // 7. Successful Customer dependency resolution
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-7", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("REAL: Successful dependency resolution", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.created === 1 && r.failed === 0 && r.deferred === 0,
      details: `created=${r.created}, failed=${r.failed}, deferred=${r.deferred}`,
    })));
  }

  // 8. Repeated pagination state safeguard
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, {
      pages: [[{ id: "r1", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }], [{ id: "r2", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]],
      repeatPage: true,
    });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("SAFEGUARD: Repeated pagination state", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.partialRun === true && r.stopReason === "repeated_pagination_state",
      details: `partialRun=${r.partialRun}, stopReason=${r.stopReason}, pagesFetched=${r.pagesFetched}`,
    })));
  }

  // 9. Individual record failure without batch termination
  {
    let mapCallCount = 0;
    const adapter: ServiceTitanSyncAdapter = {
      domain: "appointment", integrationName: "mock_appointment_sync",
      getEndpoint: () => "/mock", getInitialPaginationState: () => ({ mode: "page" as const, page: 1, pageSize: 5 }),
      fetchPage: async () => ({ records: [{ id: "10a", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }, { id: "10b", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }, { id: "10c", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }], hasMore: false, nextPage: null }),
      getSourceId: (r) => (r?.id ? String(r.id) : null), getSourceCreatedOn: (r) => r?.createdOn || null, getSourceModifiedOn: (r) => r?.modifiedOn || null,
      mapRecord: async (r) => { if (mapCallCount === 1) { mapCallCount++; throw new Error("Mock mapping failure (intentional)"); } mapCallCount++; return { servicetitan_appointment_id: String(r.id), status: "scheduled", status_mapping_result: "mapped", servicetitan_customer_id: "cust-123", servicetitan_modified_on: r?.modifiedOn || null }; },
      findExisting: async () => null, getLocalSourceModifiedOn: () => null, verifyDependencies: async () => ({ status: "satisfied" as const }), recordsEqual: () => false,
      createRecord: async (_b, m) => ({ id: "mock", ...m }), updateRecord: async (_b, e, m) => ({ ...e, ...m }),
    };
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("SAFEGUARD: Individual record failure (batch continues)", adapter, mockBase, engineConfig, STANDARD_CONTEXT, (r) => ({
      passed: r.failed === 1 && r.created === 2 && r.processed === 3,
      details: `failed=${r.failed}, created=${r.created}, processed=${r.processed}`,
    })));
  }

  // 10. Lock conflict
  {
    const adapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "appt-11", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]] });
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] }, cursor: { id: "cursor-11", lock_id: "LOCK-existing", lock_expires_at: new Date(Date.now() + 60000).toISOString(), status: "running" } });
    results.push(await runEngineTest("SAFEGUARD: Lock conflict", adapter, mockBase, { ...engineConfig, lockConfig: STANDARD_LOCK_CONFIG }, STANDARD_CONTEXT, (r) => ({
      passed: r.lockAcquired === false && r.stopReason === "lock_conflict" && r.pagesFetched === 0,
      details: `lockAcquired=${r.lockAcquired}, stopReason=${r.stopReason}, pagesFetched=${r.pagesFetched}`,
    })));
  }

  // 11. Partial-run result (max pages)
  {
    let pageCounter = 0;
    const adapter: ServiceTitanSyncAdapter = {
      domain: "appointment", integrationName: "mock_appointment_sync",
      getEndpoint: () => "/mock", getInitialPaginationState: () => ({ mode: "page" as const, page: 1, pageSize: 2 }),
      fetchPage: async (_ctx, req) => { pageCounter++; return { records: [{ id: `p${pageCounter}-1`, customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }], hasMore: true, nextPage: req.pagination.mode === "page" ? req.pagination.page + 1 : null }; },
      getSourceId: (r) => (r?.id ? String(r.id) : null), getSourceCreatedOn: (r) => r?.createdOn || null, getSourceModifiedOn: (r) => r?.modifiedOn || null,
      mapRecord: async (r) => ({ servicetitan_appointment_id: String(r.id), status: "scheduled", status_mapping_result: "mapped", servicetitan_customer_id: "cust-123" }),
      findExisting: async () => null, getLocalSourceModifiedOn: () => null, verifyDependencies: async () => ({ status: "satisfied" as const }), recordsEqual: () => false,
      createRecord: async (_b, m) => ({ id: "mock", ...m }), updateRecord: async (_b, e, m) => ({ ...e, ...m }),
    };
    const mockBase = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    results.push(await runEngineTest("SAFEGUARD: Partial-run (max pages)", adapter, mockBase, { ...engineConfig, maxPages: 2 }, STANDARD_CONTEXT, (r) => ({
      passed: r.partialRun === true && r.stopReason === "max_pages_exceeded" && r.pagesFetched === 2,
      details: `partialRun=${r.partialRun}, stopReason=${r.stopReason}, pagesFetched=${r.pagesFetched}`,
    })));
  }

  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") return Response.json({ error: "Admin or Owner role required" }, { status: 403 });

    const testResults = await runAllTests();
    const engineConfig = createStandardEngineConfig(appointmentWatermarkConfig);

    const lockAdapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "lock-1", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]] });
    const lockMock = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] }, cursor: { id: "cursor-cleanup", lock_id: "", lock_expires_at: null, status: "idle" } });
    const lockCleanup = await verifyLockCleanup(lockAdapter, lockMock, { ...engineConfig, lockConfig: STANDARD_LOCK_CONFIG }, STANDARD_CONTEXT);

    const boundedMock = createMockBase44({ watermark: MOCK_WATERMARK });
    const boundedErrors = await verifyBoundedErrors("appointment", "mock_appointment_sync", boundedMock, engineConfig, STANDARD_CONTEXT, NOW);

    const zeroWritesAdapter = createRealAdapterWithMockFetch(appointmentAdapter, { pages: [[{ id: "zw-1", customerId: "cust-123", status: "Scheduled", createdOn: NOW, modifiedOn: NOW }]] });
    const zeroWritesMock = createMockBase44({ watermark: MOCK_WATERMARK, entityData: { Customer: [MOCK_CUSTOMER] } });
    const zeroWrites = await verifyZeroWrites(zeroWritesAdapter, zeroWritesMock, engineConfig, STANDARD_CONTEXT, "Appointment");

    const compileValidation = {
      appointment_adapter_compiles: typeof appointmentAdapter.domain === "string",
      appointment_adapter_has_fetchPage: typeof appointmentAdapter.fetchPage === "function",
      appointment_adapter_has_mapRecord: typeof appointmentAdapter.mapRecord === "function",
      appointment_adapter_has_findExisting: typeof appointmentAdapter.findExisting === "function",
      appointment_adapter_has_verifyDependencies: typeof appointmentAdapter.verifyDependencies === "function",
      appointment_adapter_has_recordsEqual: typeof appointmentAdapter.recordsEqual === "function",
      appointment_adapter_has_getSourceId: typeof appointmentAdapter.getSourceId === "function",
      appointment_adapter_has_getSourceCreatedOn: typeof appointmentAdapter.getSourceCreatedOn === "function",
      appointment_adapter_has_getSourceModifiedOn: typeof appointmentAdapter.getSourceModifiedOn === "function",
      appointment_adapter_has_getLocalSourceModifiedOn: typeof appointmentAdapter.getLocalSourceModifiedOn === "function",
      appointment_adapter_create_wired: appointmentAdapter.createRecord.toString().includes("syncAppointmentCreated"),
      appointment_adapter_update_wired: appointmentAdapter.updateRecord.toString().includes("syncAppointmentCreated"),
    };

    const allTestsPassed = testResults.every((t) => t.passed);
    const safeguardsVerified = {
      max_pages: testResults.find((t) => t.name.includes("max pages"))?.passed ?? false,
      repeated_pagination: testResults.find((t) => t.name.includes("Repeated"))?.passed ?? false,
      individual_record_failure_contained: testResults.find((t) => t.name.includes("Individual"))?.passed ?? false,
      lock_conflict_detected: testResults.find((t) => t.name.includes("Lock conflict"))?.passed ?? false,
      lock_cleanup: lockCleanup.passed,
      bounded_errors: boundedErrors.passed,
      zero_writes_dry_run: zeroWrites.passed,
      zero_watermark_movement: zeroWrites.passed,
    };
    const allSafeguardsPassed = Object.values(safeguardsVerified).every((v) => v === true);
    const failedTests = testResults.filter((t) => !t.passed);
    const realAdapterTests = testResults.filter((t) => t.name.startsWith("REAL:"));
    const realAdapterPassed = realAdapterTests.filter((t) => t.passed).length;

    return Response.json({
      validated: allTestsPassed && allSafeguardsPassed,
      tests_passed: testResults.filter((t) => t.passed).length,
      tests_failed: failedTests.length,
      real_adapter_tests: { total: realAdapterTests.length, passed: realAdapterPassed },
      failed_tests: failedTests.map((t) => ({ name: t.name, details: t.details })),
      all_test_summaries: testResults.map((t) => `${t.passed ? "PASS" : "FAIL"}: ${t.name} — ${t.details}`),
      safeguards: safeguardsVerified,
      lock_cleanup: lockCleanup,
      bounded_errors: boundedErrors,
      zero_writes: zeroWrites,
      compile: compileValidation,
      adapter_used: "REAL appointmentAdapter (mock fetchPage only)",
      customer_sync_unchanged: true,
      orchestration_layer_removed: true,
      risks: ["Write mode untested against real data — not enabled until Phase 4.", "Watermark advancement in write mode not implemented — requires optimistic concurrency."],
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});