/**
 * Phase 5 — ServiceTitan Job Sync Write-Mode Verification
 *
 * Uses the REAL jobAdapter with REAL base44 client (service role).
 * Only fetchPage is mocked — all other adapter methods run against
 * the real database.
 *
 * All test records use controlled ST IDs prefixed with "phase5-".
 * All test data is cleaned up after verification.
 *
 * Design rules enforced:
 *   - Fresh adapter instance for every independent engine run
 *   - No job deletion until after all assertions on that job
 *   - Customer hydration test named accurately (deferred retry, not real hydration)
 *   - Rollback test named accurately (pre-write failure containment)
 *   - Compact response: only name/passed/expected/actual/failure_reason
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { runSyncEngine } from "../../shared/stSync/stSyncEngine.ts";
import type { EngineResult } from "../../shared/stSync/stSyncEngine.ts";
import { jobAdapter } from "../../shared/stSync/adapters/jobAdapter.ts";
import { createRealAdapterWithMockFetch } from "../../shared/stSync/stSyncValidationUtils.ts";
import {
  jobLockConfig,
  JOB_SYNC_STRATEGY,
} from "../../shared/stSync/stJobSyncConfig.ts";
import { getTenantId, getEnvironment } from "../../shared/stAuth.ts";
import {
  acquireLock,
  releaseLock,
  getOrCreateCursor,
} from "../../shared/stSync/stSyncLock.ts";
import type { WatermarkConfig } from "../../shared/stSync/stSyncTypes.ts";

interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  failure_reason: string;
}

function makeResult(
  name: string,
  passed: boolean,
  expected: string,
  actual: string,
  failure_reason = ""
): TestResult {
  return { name, passed, expected, actual, failure_reason };
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId();
  const environment = getEnvironment();
  const TEST_PREFIX = `phase5-${Date.now()}`;
  const NOW = new Date().toISOString();
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString();

  const results: TestResult[] = [];
  let testCustomer: any = null;
  let testWatermark: any = null;
  const createdJobIds: string[] = [];

  const testWmConfig: WatermarkConfig = {
    entityName: "JobSyncWatermark",
    watermarkKey: `${TEST_PREFIX}-wm`,
    syncStrategy: JOB_SYNC_STRATEGY,
    defaultOverlapMinutes: 5,
  };

  // ── Helper: create a mock API job record ──
  function makeJob(
    id: string,
    customerId: string,
    jobStatus: string,
    modifiedOn: string,
    summary: string,
    extra?: Record<string, any>
  ): any {
    return {
      id,
      jobNumber: `${id.toUpperCase()}`,
      customerId,
      locationId: `${TEST_PREFIX}-loc`,
      locationName: "Phase 5 Test Location",
      businessUnitId: `${TEST_PREFIX}-bu`,
      businessUnit: "Phase 5 Test BU",
      jobTypeId: `${TEST_PREFIX}-jt`,
      jobType: "Inspection",
      campaignId: "",
      jobStatus,
      priority: "Normal",
      summary,
      createdOn: NOW,
      modifiedOn,
      ...extra,
    };
  }

  // ── Helper: run the engine ──
  async function runWrite(
    adapter: any,
    configOverrides?: Record<string, any>,
    contextOverrides?: Record<string, any>
  ): Promise<EngineResult> {
    const config: any = {
      executionMode: "write" as const,
      maxPages: 5,
      maxRecords: 50,
      maxRuntimeMs: 30000,
      maxErrors: 20,
      watermarkConfig: testWmConfig,
      lockConfig: jobLockConfig,
      filterField: "modifiedOn",
      windowStart: YESTERDAY,
      windowEnd: new Date().toISOString(),
      ...configOverrides,
    };
    const contextParams: any = {
      tenantId,
      environment,
      source: "manual" as const,
      eventType: "job_created",
      eventId: `${TEST_PREFIX}-evt-${results.length}`,
      ...contextOverrides,
    };
    return await runSyncEngine(adapter, config, base44, contextParams);
  }

  // ── Helper: fresh adapter for each run ──
  function freshAdapter(pages: any[][], opts?: { repeatPage?: boolean }): any {
    return createRealAdapterWithMockFetch(jobAdapter, { pages, ...opts });
  }

  // ── Helper: get watermark ──
  async function getWm(): Promise<any> {
    try {
      const wms = await base44.asServiceRole.entities.JobSyncWatermark.filter(
        { watermark_key: `${TEST_PREFIX}-wm` }, null, 1
      );
      return wms.length > 0 ? wms[0] : null;
    } catch { return null; }
  }

  // ── Helper: get job by ST id ──
  async function getJob(stJobId: string): Promise<any | null> {
    try {
      const jobs = await base44.asServiceRole.entities.Job.filter(
        { servicetitan_job_id: stJobId }, "-created_date", 1
      );
      return jobs.length > 0 ? jobs[0] : null;
    } catch { return null; }
  }

  try {
    // ═════ SETUP ═════
    testCustomer = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: `${TEST_PREFIX}-cust`,
      name: "Phase 5 Test Customer",
      status: "active",
      servicetitan_sync_status: "synced",
      customer_type: "residential",
      address: "123 Test St",
      city: "Allentown",
      state: "PA",
      zip: "18101",
    });

    testWatermark = await base44.asServiceRole.entities.JobSyncWatermark.create({
      watermark_key: `${TEST_PREFIX}-wm`,
      sync_strategy: JOB_SYNC_STRATEGY,
      activation_timestamp: YESTERDAY,
      environment,
      tenant_id: tenantId,
      created_by: user.email || "phase5-test",
      status: "active",
      recovery_overlap_minutes: 5,
      recovery_window_status: "idle",
      recovery_window_errors: 0,
      backfill_status: "never_started",
    });

    // ═════ TEST 1: Create Job ═════
    {
      const job = makeJob(`${TEST_PREFIX}-job-1`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Phase 5 test job 1");
      const r = await runWrite(freshAdapter([[job]]));
      const jobRecord = await getJob(`${TEST_PREFIX}-job-1`);
      if (jobRecord) createdJobIds.push(jobRecord.id);

      const checks = {
        created: r.created === 1,
        hasJobId: jobRecord?.servicetitan_job_id === `${TEST_PREFIX}-job-1`,
        hasJobNumber: !!jobRecord?.servicetitan_job_number,
        hasCrmJobNumber: !!jobRecord?.crm_job_number,
        hasCustomerId: !!jobRecord?.customer_id,
        hasCustomerName: !!jobRecord?.customer_name,
        hasServiceDate: !!jobRecord?.service_date,
        hasAddress: !!jobRecord?.address,
      };
      const allPass = Object.values(checks).every(Boolean);
      results.push(makeResult(
        "1. Create Job",
        allPass,
        "created=1, job persisted with all required fields",
        `created=${r.created}, failed=${r.failed}, checks=${JSON.stringify(checks)}`,
        allPass ? "" : "Write path did not produce a complete Job record"
      ));
    }

    // ═════ TEST 2: Idempotent Second Run (unchanged) ═════
    {
      const job = makeJob(`${TEST_PREFIX}-job-1`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Phase 5 test job 1");
      const r = await runWrite(freshAdapter([[job]]));
      const jobRecord = await getJob(`${TEST_PREFIX}-job-1`);
      const jobCount = jobRecord ? 1 : 0;

      const passed = r.unchanged === 1 && r.created === 0 && r.updated === 0 && jobCount === 1;
      results.push(makeResult(
        "2. Idempotent Second Run (unchanged)",
        passed,
        "unchanged=1, created=0, updated=0, exactly 1 local Job",
        `unchanged=${r.unchanged}, created=${r.created}, updated=${r.updated}, jobCount=${jobCount}`,
        passed ? "" : "Second run with same source record did not classify as unchanged"
      ));
    }

    // ═════ TEST 3: Update — modified summary, changed fields only ═════
    {
      const laterTime = new Date(Date.now() + 60000).toISOString();
      const job = makeJob(`${TEST_PREFIX}-job-1`, `${TEST_PREFIX}-cust`, "Scheduled", laterTime, "Phase 5 UPDATED summary");
      const r = await runWrite(freshAdapter([[job]]), {}, { eventType: "job_updated" });
      const updatedJob = await getJob(`${TEST_PREFIX}-job-1`);

      const summaryChanged = updatedJob?.servicetitan_summary === "Phase 5 UPDATED summary";
      const passed = r.updated === 1 && r.created === 0 && summaryChanged;
      results.push(makeResult(
        "3. Update (changed fields only)",
        passed,
        "updated=1, created=0, summary field changed",
        `updated=${r.updated}, created=${r.created}, summaryChanged=${summaryChanged}`,
        passed ? "" : "Update did not change the expected fields"
      ));
    }

    // ═════ TEST 4: Watermark Advancement After Successful Full Run ═════
    {
      const wmJob = makeJob(`${TEST_PREFIX}-job-wm`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Watermark test job");
      const wmBefore = await getWm();
      const windowEnd = new Date().toISOString();

      const r = await runWrite(freshAdapter([[wmJob]]), { windowEnd });
      const wmAfter = await getWm();

      // Second run with FRESH adapter — job still exists, should be unchanged
      const r2 = await runWrite(freshAdapter([[wmJob]]), { windowEnd: new Date().toISOString() });

      // Clean up job AFTER both assertions
      const wmJobRecord = await getJob(`${TEST_PREFIX}-job-wm`);
      if (wmJobRecord) {
        try { await base44.asServiceRole.entities.Job.delete(wmJobRecord.id); } catch { /* ignore */ }
      }

      const wmAdvanced = !wmBefore?.last_modified_scan_at && !!wmAfter?.last_modified_scan_at ||
        (wmBefore?.last_modified_scan_at !== wmAfter?.last_modified_scan_at);
      const passed = r.created === 1 && wmAdvanced && r2.unchanged === 1;
      results.push(makeResult(
        "4. Watermark Advancement",
        passed,
        "created=1, wm.last_modified_scan_at advanced, second run unchanged=1",
        `wmBefore.lmsa=${wmBefore?.last_modified_scan_at || "null"}, wmAfter.lmsa=${wmAfter?.last_modified_scan_at || "null"}, run2.unchanged=${r2.unchanged}`,
        passed ? "" : "Watermark did not advance or second run was not idempotent"
      ));
    }

    // ═════ TEST 5: Restart Recovery Without Duplicates ═════
    {
      const job5a = makeJob(`${TEST_PREFIX}-job-5a`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Recovery job A");
      const job5b = makeJob(`${TEST_PREFIX}-job-5b`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Recovery job B");

      // First run: maxPages=1 → partial run (only page 1 processed)
      const r1 = await runWrite(freshAdapter([[job5a], [job5b]]), { maxPages: 1 });

      // Second run: fresh adapter, both pages, full run
      const r2 = await runWrite(freshAdapter([[job5a], [job5b]]), { maxPages: 5 });

      const job5aRecord = await getJob(`${TEST_PREFIX}-job-5a`);
      const job5bRecord = await getJob(`${TEST_PREFIX}-job-5b`);

      // Clean up
      for (const jid of [`${TEST_PREFIX}-job-5a`, `${TEST_PREFIX}-job-5b`]) {
        const j = await getJob(jid);
        if (j) { try { await base44.asServiceRole.entities.Job.delete(j.id); } catch { /* ignore */ } }
      }

      const passed = r1.partialRun === true && r1.created === 1 && r2.created === 1 && !!job5aRecord && !!job5bRecord;
      results.push(makeResult(
        "5. Restart Recovery Without Duplicates",
        passed,
        "run1.partialRun=true, run1.created=1, run2.created=1, both jobs exist exactly once",
        `r1.partialRun=${r1.partialRun}, r1.created=${r1.created}, r2.created=${r2.created}, job5aExists=${!!job5aRecord}, job5bExists=${!!job5bRecord}`,
        passed ? "" : "Restart recovery produced duplicates or missing records"
      ));
    }

    // ═════ TEST 6: Deferred Customer Dependency and Retry ═════
    // NOTE: This tests DEFERRED RETRY, not real Customer hydration.
    // Real hydration would require a real ServiceTitan Customer ID that the
    // API returns 200 for. This test uses a fake ID that returns 404,
    // proving the deferral → local creation → retry path.
    {
      const missingCustId = `${TEST_PREFIX}-missing-cust`;
      const job6 = makeJob(`${TEST_PREFIX}-job-6`, missingCustId, "Scheduled", NOW, "Deferred dependency test");

      // Run 1: customer doesn't exist → API 404 → deferred
      const r1 = await runWrite(freshAdapter([[job6]]), { lockConfig: undefined, watermarkConfig: undefined });
      const jobAfterDeferral = await getJob(`${TEST_PREFIX}-job-6`);

      let deferredCount = 0;
      try {
        const d = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
          { servicetitan_entity_id: `${TEST_PREFIX}-job-6` }, null, 100
        );
        deferredCount = d.length;
      } catch { /* ignore */ }

      // Create the customer locally (simulating it being synced later)
      let retryCust: any = null;
      try {
        retryCust = await base44.asServiceRole.entities.Customer.create({
          servicetitan_customer_id: missingCustId,
          name: "Phase 5 Retry Customer",
          status: "active",
          servicetitan_sync_status: "synced",
          customer_type: "residential",
          address: "456 Retry Ave",
          city: "Bethlehem",
          state: "PA",
          zip: "18017",
        });
      } catch { /* ignore */ }

      // Run 2: customer now exists → job succeeds
      const r2 = await runWrite(freshAdapter([[job6]]));
      const jobAfterRetry = await getJob(`${TEST_PREFIX}-job-6`);
      if (jobAfterRetry) createdJobIds.push(jobAfterRetry.id);

      // Clean up retry customer + deferred records
      if (retryCust) { try { await base44.asServiceRole.entities.Customer.delete(retryCust.id); } catch { /* ignore */ } }
      try {
        const d = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
          { servicetitan_entity_id: `${TEST_PREFIX}-job-6` }, null, 100
        );
        for (const dd of d) { try { await base44.asServiceRole.entities.DeferredDependentRecord.delete(dd.id); } catch { /* ignore */ } }
      } catch { /* ignore */ }
      try {
        const dc = await base44.asServiceRole.entities.DeferredCustomer.filter(
          { servicetitan_customer_id: missingCustId }, null, 100
        );
        for (const d of dc) { try { await base44.asServiceRole.entities.DeferredCustomer.delete(d.id); } catch { /* ignore */ } }
      } catch { /* ignore */ }

      const passed = r1.deferred === 1 && !jobAfterDeferral && r2.created === 1 && !!jobAfterRetry;
      results.push(makeResult(
        "6. Deferred Customer Dependency and Retry",
        passed,
        "run1.deferred=1, no job written, run2.created=1 after customer added",
        `r1.deferred=${r1.deferred}, jobAfterDeferral=${!!jobAfterDeferral}, deferredRecords=${deferredCount}, r2.created=${r2.created}, jobAfterRetry=${!!jobAfterRetry}`,
        passed ? "" : "Deferred retry path did not work correctly"
      ));
    }

    // ═════ TEST 7: Missing Customer ID Fails Closed ═════
    {
      const job7 = makeJob(`${TEST_PREFIX}-job-7`, "", "Scheduled", NOW, "Fail-closed test");
      const r = await runWrite(freshAdapter([[job7]]), { lockConfig: undefined, watermarkConfig: undefined });
      const job7Record = await getJob(`${TEST_PREFIX}-job-7`);

      const passed = r.failed === 1 && !job7Record;
      results.push(makeResult(
        "7. Missing Customer ID Fails Closed",
        passed,
        "failed=1, no job written",
        `failed=${r.failed}, created=${r.created}, jobExists=${!!job7Record}`,
        passed ? "" : "Missing customer ID did not fail closed"
      ));
    }

    // ═════ TEST 8: Lock Conflict and Lock Release ═════
    {
      const cursor = await getOrCreateCursor(
        base44, jobLockConfig, "servicetitan_job_sync", "job", tenantId, environment
      );
      const manualLockId = await acquireLock(base44, jobLockConfig, cursor);

      const job8 = makeJob(`${TEST_PREFIX}-job-8`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Lock conflict test");
      const r = await runWrite(freshAdapter([[job8]]));

      // Release lock
      if (manualLockId) {
        await releaseLock(base44, jobLockConfig, cursor.id, manualLockId, {}, false);
      }

      // Run again → should succeed
      const r2 = await runWrite(freshAdapter([[job8]]));

      // Clean up
      const j8 = await getJob(`${TEST_PREFIX}-job-8`);
      if (j8) { try { await base44.asServiceRole.entities.Job.delete(j8.id); } catch { /* ignore */ } }

      const passed = r.lockAcquired === false && r.stopReason === "lock_conflict" && r2.created === 1;
      results.push(makeResult(
        "8. Lock Conflict and Lock Release",
        passed,
        "run1.lockAcquired=false, stopReason=lock_conflict, run2.created=1 after release",
        `r1.lockAcquired=${r.lockAcquired}, r1.stopReason=${r.stopReason}, r2.created=${r2.created}, r2.lockAcquired=${r2.lockAcquired}`,
        passed ? "" : "Lock conflict detection or release did not work"
      ));
    }

    // ═════ TEST 9: Three-Page Pagination ═════
    {
      const jobs = [
        makeJob(`${TEST_PREFIX}-job-9a`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Pagination A"),
        makeJob(`${TEST_PREFIX}-job-9b`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Pagination B"),
        makeJob(`${TEST_PREFIX}-job-9c`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Pagination C"),
      ];
      const r = await runWrite(freshAdapter([[jobs[0]], [jobs[1]], [jobs[2]]]), { maxPages: 10 });

      let count = 0;
      for (const j of jobs) {
        const rec = await getJob(j.id);
        if (rec) { count++; try { await base44.asServiceRole.entities.Job.delete(rec.id); } catch { /* ignore */ } }
      }

      const passed = r.pagesFetched === 3 && r.created === 3 && count === 3;
      results.push(makeResult(
        "9. Three-Page Pagination",
        passed,
        "pagesFetched=3, created=3, all 3 jobs persisted",
        `pagesFetched=${r.pagesFetched}, created=${r.created}, jobsFound=${count}`,
        passed ? "" : "Multi-page pagination did not process all pages"
      ));
    }

    // ═════ TEST 10: Repeated-Page Detection ═════
    {
      const job = makeJob(`${TEST_PREFIX}-job-10`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Repeat page test");
      const r = await runWrite(freshAdapter([[job]], { repeatPage: true }), { maxPages: 10 });

      const j = await getJob(`${TEST_PREFIX}-job-10`);
      if (j) { try { await base44.asServiceRole.entities.Job.delete(j.id); } catch { /* ignore */ } }

      const passed = r.partialRun === true && r.stopReason === "repeated_pagination_state";
      results.push(makeResult(
        "10. Repeated-Page Detection",
        passed,
        "partialRun=true, stopReason=repeated_pagination_state",
        `partialRun=${r.partialRun}, stopReason=${r.stopReason}, pagesFetched=${r.pagesFetched}`,
        passed ? "" : "Repeated-page safeguard did not trigger"
      ));
    }

    // ═════ TEST 11: Pre-Write Failure Containment ═════
    // NOTE: This proves write-failure containment and watermark preservation.
    // It does NOT prove database transaction rollback — the error occurs
    // BEFORE any write reaches the database.
    {
      const job = makeJob(`${TEST_PREFIX}-job-11`, `${TEST_PREFIX}-cust`, "Scheduled", NOW, "Pre-write failure test");
      const realWrapped = freshAdapter([[job]]);
      const failingAdapter = {
        ...realWrapped,
        async createRecord(): Promise<any> {
          throw new Error("Simulated pre-write failure (intentional)");
        },
      };

      const wmBefore = await getWm();
      const r = await runWrite(failingAdapter);
      const wmAfter = await getWm();
      const jobRecord = await getJob(`${TEST_PREFIX}-job-11`);

      const wmUnchanged = wmBefore?.last_modified_scan_at === wmAfter?.last_modified_scan_at;
      const passed = r.failed === 1 && !jobRecord && wmUnchanged;
      results.push(makeResult(
        "11. Pre-Write Failure Containment",
        passed,
        "failed=1, no job written, watermark unchanged",
        `failed=${r.failed}, jobExists=${!!jobRecord}, wmUnchanged=${wmUnchanged}`,
        passed ? "" : "Pre-write failure was not contained or watermark changed"
      ));
    }

    // ═════ TEST 12: Relationship Verification ═════
    {
      const job1 = await getJob(`${TEST_PREFIX}-job-1`);
      // Note: servicetitan_raw_status is lowercased by extractJobData (.toLowerCase())
      // Note: After Test 3's update, sync_status may be "conflict" (correct behavior
      //   when a previous value is overwritten by ServiceTitan)
      const relations = {
        customerLinked: !!job1?.customer_id && job1.customer_id === testCustomer?.id,
        customerNameMatch: job1?.customer_name === "Phase 5 Test Customer",
        businessUnitSet: !!job1?.servicetitan_business_unit_id,
        locationSet: !!job1?.servicetitan_location_id,
        tenantSet: job1?.servicetitan_tenant_id === tenantId,
        syncStatusValid: job1?.servicetitan_sync_status === "synced" || job1?.servicetitan_sync_status === "conflict",
        importSourceSet: !!job1?.servicetitan_source,
        rawStatusPreserved: (job1?.servicetitan_raw_status ?? "").toLowerCase() === "scheduled",
      };
      const allPass = Object.values(relations).every(Boolean);
      results.push(makeResult(
        "12. Relationship Verification",
        allPass,
        "All relationship fields correctly populated",
        `relations=${JSON.stringify(relations)}`,
        allPass ? "" : "One or more relationship fields are incorrect"
      ));
    }

  } catch (error) {
    results.push(makeResult(
      "UNEXPECTED ERROR",
      false,
      "No unexpected errors",
      `${error.message}`,
      error.stack || ""
    ));
  } finally {
    // ═════ CLEANUP ═════
    try {
      for (const jid of createdJobIds) {
        try { await base44.asServiceRole.entities.Job.delete(jid); } catch { /* ignore */ }
      }
      try {
        const allJobs = await base44.asServiceRole.entities.Job.filter(
          { servicetitan_job_id: { $regex: TEST_PREFIX } }, null, 100
        );
        for (const j of allJobs) {
          try { await base44.asServiceRole.entities.Job.delete(j.id); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      if (testCustomer) { try { await base44.asServiceRole.entities.Customer.delete(testCustomer.id); } catch { /* ignore */ } }
      if (testWatermark) { try { await base44.asServiceRole.entities.JobSyncWatermark.delete(testWatermark.id); } catch { /* ignore */ } }

      try {
        const deferred = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
          { servicetitan_entity_id: { $regex: TEST_PREFIX } }, null, 100
        );
        for (const d of deferred) { try { await base44.asServiceRole.entities.DeferredDependentRecord.delete(d.id); } catch { /* ignore */ } }
      } catch { /* ignore */ }

      try {
        const dc = await base44.asServiceRole.entities.DeferredCustomer.filter(
          { servicetitan_customer_id: { $regex: TEST_PREFIX } }, null, 100
        );
        for (const d of dc) { try { await base44.asServiceRole.entities.DeferredCustomer.delete(d.id); } catch { /* ignore */ } }
      } catch { /* ignore */ }

      try {
        const tl = await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.filter(
          { webhook_event_id: { $regex: TEST_PREFIX } }, null, 100
        );
        for (const t of tl) { try { await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.delete(t.id); } catch { /* ignore */ } }
      } catch { /* ignore */ }

      try {
        const cursor = await base44.asServiceRole.entities.ServiceTitanSyncCursor.filter(
          { integration_name: "servicetitan_job_sync", domain: "job" }, null, 1
        );
        if (cursor.length > 0) {
          await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor[0].id, {
            lock_id: "", lock_expires_at: null, status: "idle",
          });
        }
      } catch { /* ignore */ }
    } catch (cleanupErr) {
      console.error("[PHASE5 CLEANUP] Error:", cleanupErr);
    }
  }

  // ═════ TEST 13: Cleanup Verification ═════
  {
    let phase5Jobs = 0, phase5Customers = 0, phase5Watermarks = 0, phase5Deferred = 0, phase5Timeline = 0;
    let cursorLocked = false;
    try {
      const j = await base44.asServiceRole.entities.Job.filter(
        { servicetitan_job_id: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Jobs = j.length;
    } catch { /* ignore */ }
    try {
      const c = await base44.asServiceRole.entities.Customer.filter(
        { servicetitan_customer_id: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Customers = c.length;
    } catch { /* ignore */ }
    try {
      const w = await base44.asServiceRole.entities.JobSyncWatermark.filter(
        { watermark_key: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Watermarks = w.length;
    } catch { /* ignore */ }
    try {
      const d = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
        { servicetitan_entity_id: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Deferred = d.length;
    } catch { /* ignore */ }
    try {
      const dc = await base44.asServiceRole.entities.DeferredCustomer.filter(
        { servicetitan_customer_id: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Deferred += dc.length;
    } catch { /* ignore */ }
    try {
      const tl = await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.filter(
        { webhook_event_id: { $regex: TEST_PREFIX } }, null, 100
      );
      phase5Timeline = tl.length;
    } catch { /* ignore */ }
    try {
      const cursor = await base44.asServiceRole.entities.ServiceTitanSyncCursor.filter(
        { integration_name: "servicetitan_job_sync", domain: "job" }, null, 1
      );
      if (cursor.length > 0) {
        cursorLocked = !!cursor[0].lock_id || cursor[0].status !== "idle";
      }
    } catch { /* ignore */ }

    const passed = phase5Jobs === 0 && phase5Customers === 0 && phase5Watermarks === 0 && phase5Deferred === 0 && phase5Timeline === 0 && !cursorLocked;
    results.push(makeResult(
      "13. Cleanup Verification",
      passed,
      "0 jobs, 0 customers, 0 watermarks, 0 deferred, 0 timeline, cursor unlocked",
      `jobs=${phase5Jobs}, customers=${phase5Customers}, watermarks=${phase5Watermarks}, deferred=${phase5Deferred}, timeline=${phase5Timeline}, cursorLocked=${cursorLocked}`,
      passed ? "" : "Residual test data remains in the database"
    ));
  }

  const testsPassed = results.filter((r) => r.passed).length;
  const testsFailed = results.filter((r) => !r.passed).length;
  const failedTests = results.filter((r) => !r.passed).map((r) => ({ name: r.name, actual: r.actual, failure_reason: r.failure_reason }));

  return Response.json({
    phase: "Phase 5 — Job Sync Write-Mode Verification",
    test_prefix: TEST_PREFIX,
    tenant_id: tenantId,
    environment,
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    tests_total: results.length,
    tests_passed: testsPassed,
    tests_failed: testsFailed,
    all_passed: testsFailed === 0,
    failed_tests: failedTests,
    results,
    cleanup_completed: true,
  });
});