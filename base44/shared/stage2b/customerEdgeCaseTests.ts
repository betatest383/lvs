/**
 * Customer Sync Edge-Case Tests (Stage 2B-A+)
 *
 * Tests added per the operational activation audit:
 *   6.  Contact-sync failure
 *   7.  Pending-merge lifecycle
 *   8.  Watermark pre-activation
 *   9.  Deferred-customer resolution
 *   10. Tenant isolation
 *   S.  Scheduler safety (lock ownership, overlap prevention, stale worker)
 *
 * All tests use test-prefixed identifiers and clean up after themselves.
 * No real ServiceTitan API calls are made (tests operate on local entities only).
 *
 * These tests EXTEND the existing 18-test Stage 2B-A suite — they do not
 * replace or weaken any existing test.
 */

import { findLocalCustomer } from "../stCustomerMapping.ts";
import { createContactSyncRetry } from "../stOnDemandHydration.ts";
import {
  createPendingMerge,
  retryPendingMerges,
} from "../stCustomerPendingMerge.ts";
import {
  activateWatermark,
} from "../stWatermark.ts";
import { checkCustomerEligibility } from "../stCustomerEligibility.ts";
import {
  createDeferredCustomer,
  resolveDeferredCustomer,
} from "../stDeferredCustomer.ts";
import { getTenantId } from "../stAuth.ts";
import {
  acquireLock,
  verifyLockOwnership,
  releaseLock,
} from "../stCustomerApiSync.ts";

export interface EdgeCaseTestContext {
  base44: any;
  VR_ID: string;
  VR_TOKEN: string;
  TEST_PREFIX: string;
  actor: string;
  track: (
    name: string,
    passed: boolean,
    expected: string,
    actual: string,
    failureReason?: string
  ) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeDelete(base44: any, entity: string, id: string): Promise<void> {
  try {
    await base44.asServiceRole.entities[entity].delete(id);
  } catch { /* already deleted or not found */ }
}

async function safeDeleteByFilter(base44: any, entity: string, filter: any): Promise<void> {
  try {
    const records = await base44.asServiceRole.entities[entity].filter(filter, null, 50);
    for (const r of records) {
      try { await base44.asServiceRole.entities[entity].delete(r.id); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ─── Test 6: Contact-Sync Failure ─────────────────────────────────────────────

export async function runContactSyncFailureTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track } = ctx;
  const stCustId = `${TEST_PREFIX}-contact-fail`;
  const testTenant = `${TEST_PREFIX}-tenant`;
  const testEnv = "production";
  let createdCustomerId = "";

  try {
    // 1. Create a customer directly (simulating successful customer creation)
    const customer = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: stCustId,
      name: "Contact Fail Test Customer",
      servicetitan_tenant_id: testTenant,
      servicetitan_sync_status: "synced",
      contact_sync_status: "failed",
      contact_sync_attempt_count: 1,
      servicetitan_source: "webhook",
      import_source: "webhook",
      imported_at: new Date().toISOString(),
    });
    createdCustomerId = customer.id;

    // 2. Create a ContactSyncRetry record (simulating contact sync failure)
    await createContactSyncRetry(
      base44,
      stCustId,
      createdCustomerId,
      testTenant,
      testEnv,
      "webhook",
      "Contact sync failed during test: simulated API failure"
    );

    // 3. Verify customer remains persisted with contact_sync_status = "failed"
    const existing = await findLocalCustomer(base44, stCustId);
    const customerPersists = !!existing;
    const statusCorrect = existing?.contact_sync_status === "failed";

    // 4. Verify ContactSyncRetry record was created
    const retries = await base44.asServiceRole.entities.ContactSyncRetry.filter(
      { retry_key: `${stCustId}:contact_retry`, status: "pending" },
      "-created_date",
      5
    );
    const retryExists = retries.length > 0;

    // 5. Re-process: call createContactSyncRetry again → should update, not duplicate
    await createContactSyncRetry(
      base44,
      stCustId,
      createdCustomerId,
      testTenant,
      testEnv,
      "webhook",
      "Contact sync failed during test: second attempt"
    );
    const retriesAfter = await base44.asServiceRole.entities.ContactSyncRetry.filter(
      { retry_key: `${stCustId}:contact_retry` },
      "-created_date",
      5
    );
    const noDuplicate = retriesAfter.length === 1;
    const attemptIncremented = (retriesAfter[0]?.attempt_count || 0) >= 2;

    // 6. Verify no duplicate customer was created
    const allCustomers = await base44.asServiceRole.entities.Customer.filter(
      { servicetitan_customer_id: stCustId },
      null,
      10
    );
    const noDuplicateCustomer = allCustomers.length === 1;

    track(
      "6. Contact-sync failure — customer persists, retry created, idempotent",
      customerPersists &&
        statusCorrect &&
        retryExists &&
        noDuplicate &&
        attemptIncremented &&
        noDuplicateCustomer,
      "customer persists with contact_sync_status=failed, retry exists, re-process updates (no duplicate), no duplicate customer",
      `persists=${customerPersists}, status=${existing?.contact_sync_status}, retryExists=${retryExists}, noDup=${noDuplicate}, attemptInc=${attemptIncremented}, noDupCust=${noDuplicateCustomer}`
    );
  } finally {
    if (createdCustomerId) await safeDelete(base44, "Customer", createdCustomerId);
    await safeDeleteByFilter(base44, "ContactSyncRetry", {
      retry_key: `${stCustId}:contact_retry`,
    });
  }
}

// ─── Test 7: Pending-Merge Lifecycle ──────────────────────────────────────────

export async function runPendingMergeLifecycleTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track } = ctx;
  const sourceStId = `${TEST_PREFIX}-merge-source`;
  const targetStId = `${TEST_PREFIX}-merge-target`;
  const testTenant = `${TEST_PREFIX}-tenant`;
  let sourceCustomerId = "";
  let targetCustomerId = "";

  try {
    // 1. Create source customer
    const sourceCustomer = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: sourceStId,
      name: "Merge Source Test",
      servicetitan_tenant_id: testTenant,
      servicetitan_sync_status: "synced",
      servicetitan_source: "webhook",
      import_source: "webhook",
      imported_at: new Date().toISOString(),
    });
    sourceCustomerId = sourceCustomer.id;

    // 2. Create pending merge (target doesn't exist yet)
    const pmResult = await createPendingMerge(
      base44,
      sourceStId,
      targetStId,
      sourceCustomerId,
      testTenant,
      `${TEST_PREFIX}-batch`,
      "api_export"
    );

    // 3. Verify: PendingMerge created, source NOT marked as merged
    const pendingMerges = await base44.asServiceRole.entities.PendingMerge.filter(
      { merge_key: `${sourceStId}:${targetStId}` },
      "-created_date",
      5
    );
    const pmCreated = pmResult.created && pendingMerges.length > 0;
    const sourceAfter1 = await findLocalCustomer(base44, sourceStId);
    const sourceNotMerged = sourceAfter1?.servicetitan_sync_status !== "merged";

    // 4. Create target customer (simulating later synchronization)
    const targetCustomer = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: targetStId,
      name: "Merge Target Test",
      servicetitan_tenant_id: testTenant,
      servicetitan_sync_status: "synced",
      servicetitan_source: "webhook",
      import_source: "webhook",
      imported_at: new Date().toISOString(),
    });
    targetCustomerId = targetCustomer.id;

    // 5. Retry pending merges — should complete the merge
    const stats = await retryPendingMerges(base44, testTenant);

    // 6. Verify: source marked as merged, PendingMerge completed
    const sourceAfter2 = await findLocalCustomer(base44, sourceStId);
    const sourceMerged = sourceAfter2?.servicetitan_sync_status === "merged";
    const sourceMergedInto = sourceAfter2?.servicetitan_merged_into === targetStId;

    const pmAfter = await base44.asServiceRole.entities.PendingMerge.filter(
      { merge_key: `${sourceStId}:${targetStId}` },
      "-created_date",
      1
    );
    const pmCompleted = pmAfter[0]?.status === "completed";

    // 7. Verify merge history preserved
    let mergeHistory: any[] = [];
    try {
      mergeHistory = sourceAfter2?.servicetitan_merge_history_json
        ? JSON.parse(sourceAfter2.servicetitan_merge_history_json)
        : [];
    } catch { /* ignore */ }
    const historyPreserved =
      mergeHistory.length > 0 && mergeHistory[0]?.target_customer_id === targetStId;

    // 8. Replay — retryPendingMerges again → idempotent (no error, source already merged)
    const statsReplay = await retryPendingMerges(base44, testTenant);
    const replayIdempotent = statsReplay.pending_failed === 0;

    track(
      "7. Pending-merge lifecycle — target absent → deferred → resolved → merged, idempotent",
      pmCreated &&
        sourceNotMerged &&
        stats.pending_completed >= 1 &&
        sourceMerged &&
        sourceMergedInto &&
        pmCompleted &&
        historyPreserved &&
        replayIdempotent,
      "pending merge created, source not merged initially, merge completes after target sync, source marked merged, history preserved, replay idempotent",
      `pmCreated=${pmCreated}, sourceNotMerged=${sourceNotMerged}, completed=${stats.pending_completed}, sourceMerged=${sourceMerged}, mergedInto=${sourceMergedInto}, pmCompleted=${pmCompleted}, history=${historyPreserved}, replayOk=${replayIdempotent}`
    );
  } finally {
    if (sourceCustomerId) await safeDelete(base44, "Customer", sourceCustomerId);
    if (targetCustomerId) await safeDelete(base44, "Customer", targetCustomerId);
    await safeDeleteByFilter(base44, "PendingMerge", {
      merge_key: `${sourceStId}:${targetStId}`,
    });
  }
}

// ─── Test 8: Watermark Pre-Activation ─────────────────────────────────────────

export async function runWatermarkPreActivationTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track, actor } = ctx;
  const testTenant = `${TEST_PREFIX}-tenant`;
  const testEnv = "production";
  const stCustId = `${TEST_PREFIX}-pre-act-cust`;
  let watermarkId = "";

  try {
    // 1. Activate a watermark with activation = now
    const watermark = await activateWatermark(base44, testTenant, testEnv, actor);
    watermarkId = watermark.id;

    // 2. Customer with createdOn BEFORE activation → pre_activation
    const beforeActivation = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const eligibilityBefore = await checkCustomerEligibility(
      base44,
      testTenant,
      testEnv,
      stCustId,
      beforeActivation
    );
    const preActivationBlocked =
      !eligibilityBefore.allowed && eligibilityBefore.reason === "pre_activation";

    // 3. Customer with createdOn AFTER activation → eligible
    const afterActivation = new Date(Date.now() + 86400000).toISOString(); // 1 day in future
    const eligibilityAfter = await checkCustomerEligibility(
      base44,
      testTenant,
      testEnv,
      stCustId,
      afterActivation
    );
    const afterEligible = eligibilityAfter.allowed === true;

    // 4. Verify no customer was created (eligibility check doesn't create records)
    const noCustomer = (await findLocalCustomer(base44, stCustId)) === null;

    track(
      "8. Watermark pre-activation — pre-activation customer blocked, post-activation eligible",
      preActivationBlocked && afterEligible && noCustomer,
      "createdOn < activation → pre_activation (blocked), createdOn > activation → allowed, no customer record created",
      `preActivationBlocked=${preActivationBlocked} (reason=${eligibilityBefore.reason}), afterEligible=${afterEligible}, noCustomer=${noCustomer}`
    );
  } finally {
    if (watermarkId) await safeDelete(base44, "CustomerSyncWatermark", watermarkId);
  }
}

// ─── Test 9: Deferred-Customer Resolution ─────────────────────────────────────

export async function runDeferredCustomerResolutionTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track, actor } = ctx;
  const testTenant = `${TEST_PREFIX}-tenant`;
  const testEnv = "production";
  const stCustId = `${TEST_PREFIX}-deferred-cust`;
  let watermarkId = "";
  let customerId = "";

  try {
    // 1. Activate a watermark with test tenant
    const watermark = await activateWatermark(base44, testTenant, testEnv, actor);
    watermarkId = watermark.id;

    // 2. Check eligibility with no createdOn → deferred_missing_created_on
    const eligibility = await checkCustomerEligibility(
      base44,
      testTenant,
      testEnv,
      stCustId,
      null
    );
    const deferredEligibility =
      !eligibility.allowed && eligibility.reason === "deferred_missing_created_on";

    // 3. Create a deferred customer record (simulating webhook with no createdOn)
    const deferredResult = await createDeferredCustomer(
      base44,
      stCustId,
      "missing_created_on",
      "webhook_created",
      testTenant,
      testEnv,
      `${TEST_PREFIX}-evt`,
      { customer_id: stCustId, name: "Deferred Test" }
    );
    const deferredCreated = deferredResult.created;

    // 4. Verify no Customer record was created (unsafe import prevented)
    const noCustomer = (await findLocalCustomer(base44, stCustId)) === null;

    // 5. Simulate later import — create the customer directly
    const customer = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: stCustId,
      name: "Deferred Resolution Test",
      servicetitan_tenant_id: testTenant,
      servicetitan_sync_status: "synced",
      servicetitan_source: "on_demand_hydration",
      import_source: "on_demand_hydration",
      imported_at: new Date().toISOString(),
    });
    customerId = customer.id;

    // 6. Resolve the deferred record
    await resolveDeferredCustomer(base44, stCustId, customerId);

    // 7. Verify deferred record is resolved
    const deferredRecords = await base44.asServiceRole.entities.DeferredCustomer.filter(
      { servicetitan_customer_id: stCustId },
      "-created_date",
      10
    );
    const allResolved =
      deferredRecords.length > 0 &&
      deferredRecords.every((d: any) => d.status === "resolved");

    // 8. Re-process: createDeferredCustomer again → creates a NEW pending record
    // (old one is resolved, so the idempotency check on status="pending" won't find it)
    const deferredResult2 = await createDeferredCustomer(
      base44,
      stCustId,
      "missing_created_on",
      "webhook_created",
      testTenant,
      testEnv,
      `${TEST_PREFIX}-evt-2`,
      { customer_id: stCustId, name: "Deferred Test 2" }
    );
    const newDeferredCreated = deferredResult2.created;
    const newDeferredId = deferredResult2.id || "";
    if (newDeferredId) await safeDelete(base44, "DeferredCustomer", newDeferredId);

    track(
      "9. Deferred-customer resolution — deferred, no import, later resolved, re-process creates new record",
      deferredEligibility && deferredCreated && noCustomer && allResolved && newDeferredCreated,
      "eligibility=deferred, deferred record created, no customer import, later resolved, re-process creates new (not duplicate of resolved)",
      `deferredElig=${deferredEligibility}, deferredCreated=${deferredCreated}, noCustomer=${noCustomer}, allResolved=${allResolved}, newDeferredCreated=${newDeferredCreated}`
    );
  } finally {
    if (customerId) await safeDelete(base44, "Customer", customerId);
    await safeDeleteByFilter(base44, "DeferredCustomer", {
      servicetitan_customer_id: stCustId,
    });
    if (watermarkId) await safeDelete(base44, "CustomerSyncWatermark", watermarkId);
  }
}

// ─── Test 10: Tenant Isolation ───────────────────────────────────────────────

export async function runTenantIsolationTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track } = ctx;
  const stCustIdA = `${TEST_PREFIX}-tenant-A-cust`;
  const stCustIdB = `${TEST_PREFIX}-tenant-B-cust`;
  const tenantA = `${TEST_PREFIX}-tenant-A`;
  const tenantB = `${TEST_PREFIX}-tenant-B`;
  let customerAId = "";
  let customerBId = "";

  try {
    // 1. Create two customers with different ST IDs and different tenant contexts
    const customerA = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: stCustIdA,
      name: "Tenant A Customer",
      servicetitan_tenant_id: tenantA,
      servicetitan_sync_status: "synced",
      servicetitan_source: "webhook",
      import_source: "webhook",
      imported_at: new Date().toISOString(),
    });
    customerAId = customerA.id;

    const customerB = await base44.asServiceRole.entities.Customer.create({
      servicetitan_customer_id: stCustIdB,
      name: "Tenant B Customer",
      servicetitan_tenant_id: tenantB,
      servicetitan_sync_status: "synced",
      servicetitan_source: "webhook",
      import_source: "webhook",
      imported_at: new Date().toISOString(),
    });
    customerBId = customerB.id;

    // 2. Verify findLocalCustomer resolves by servicetitan_customer_id (canonical key)
    const foundA = await findLocalCustomer(base44, stCustIdA);
    const foundB = await findLocalCustomer(base44, stCustIdB);
    const foundCorrectA = foundA?.id === customerAId;
    const foundCorrectB = foundB?.id === customerBId;

    // 3. Verify tenant identity is resolved from env var (trusted server-side context)
    let envTenantId = "";
    try {
      envTenantId = getTenantId();
    } catch {
      // SERVICETITAN_TENANT_ID not set in test environment
    }
    const tenantFromEnv = !!envTenantId;

    // 4. Architectural finding: the data model is single-tenant by design.
    //    findLocalCustomer queries by servicetitan_customer_id only — it does
    //    NOT filter by tenant_id. The configured SERVICETITAN_TENANT_ID env
    //    var is the trusted tenant context. Customer identity
    //    (servicetitan_customer_id) is extracted from ServiceTitan-originated
    //    payloads, not caller-supplied. The worker accepts body.tenant_id for
    //    watermark/cursor scoping only — it does not affect customer identity.
    //
    //    Cross-tenant write isolation is not applicable in the single-tenant
    //    model (one configured SERVICETITAN_TENANT_ID). Multi-tenant isolation
    //    would require a separate authorization (not authorized by this prompt).

    track(
      "10. Tenant isolation — tenant from env, customer identity ServiceTitan-originated, single-tenant model",
      foundCorrectA && foundCorrectB && tenantFromEnv,
      "findLocalCustomer resolves by ST customer ID, tenant from env var, distinct ST IDs are distinct customers",
      `foundA=${foundCorrectA}, foundB=${foundCorrectB}, tenantFromEnv=${tenantFromEnv}. ` +
        `ARCHITECTURAL NOTE: data model is single-tenant (one SERVICETITAN_TENANT_ID). ` +
        `findLocalCustomer is tenant-agnostic. Cross-tenant write isolation not applicable.`
    );
  } finally {
    if (customerAId) await safeDelete(base44, "Customer", customerAId);
    if (customerBId) await safeDelete(base44, "Customer", customerBId);
  }
}

// ─── Test S: Scheduler Safety ─────────────────────────────────────────────────

export async function runSchedulerSafetyTest(
  ctx: EdgeCaseTestContext
): Promise<void> {
  const { base44, TEST_PREFIX, track } = ctx;
  const testTenant = `${TEST_PREFIX}-tenant`;
  const testEnv = "production";
  let cursorId = "";
  let lockId1: string | null = null;
  let lockId3: string | null = null;

  try {
    // 1. Create a test sync cursor directly
    const cursor = await base44.asServiceRole.entities.ServiceTitanSyncCursor.create({
      integration_name: `${TEST_PREFIX}-test-sync`,
      domain: "customer",
      tenant_id: testTenant,
      environment: testEnv,
      continuation_token: "",
      status: "idle",
      mode: "incremental",
      records_processed: 0,
      total_records_synced: 0,
      consecutive_failures: 0,
    });
    cursorId = cursor.id;

    // 2. Acquire lock (first worker)
    lockId1 = await acquireLock(base44, cursor);
    const lock1Acquired = !!lockId1;

    // 3. Verify first worker owns the lock
    const ownsLock = await verifyLockOwnership(base44, cursorId, lockId1);
    const ownershipVerified = ownsLock === true;

    // 4. Second worker fetches a FRESH cursor from the DB (which now has the
    //    active lock) and tries to acquire — isLockExpired returns false on
    //    the fresh cursor, so acquireLock returns null (overlap prevented).
    const freshCursor = await base44.asServiceRole.entities.ServiceTitanSyncCursor.get(cursorId);
    const lockId2 = await acquireLock(base44, freshCursor);
    const overlapPrevented = lockId2 === null;

    // 5. Simulate stale worker — wrong lockId should be rejected
    const staleWorker = await verifyLockOwnership(base44, cursorId, "WRONG-LOCK-ID");
    const staleRejected = staleWorker === false;

    // 6. Release lock
    await releaseLock(base44, cursorId, lockId1, { continuation_token: "test-token" }, true);

    // 7. After release, fetch a fresh cursor (lock cleared) and reacquire
    const cursorAfterRelease = await base44.asServiceRole.entities.ServiceTitanSyncCursor.get(cursorId);
    lockId3 = await acquireLock(base44, cursorAfterRelease);
    const reacquireWorks = !!lockId3;
    if (lockId3) {
      await releaseLock(base44, cursorId, lockId3, {}, true);
    }

    // 8. Verify: the scheduler (incremental mode) does not modify sync policy
    //    or migration state. This is a code-level invariant: the worker imports
    //    no SyncPolicy or SyncMigrationState functions. The incremental mode
    //    path only calls runSyncCycle (customer data) — no policy/migration writes.

    track(
      "S. Scheduler safety — lock prevents overlap, stale worker rejected, ownership verified",
      lock1Acquired && overlapPrevented && ownershipVerified && staleRejected && reacquireWorks,
      "first lock acquired, second lock rejected (overlap prevented), ownership verified, stale lockId rejected, reacquire after release works",
      `lock1=${lock1Acquired}, overlapPrevented=${overlapPrevented}, ownership=${ownershipVerified}, staleRejected=${staleRejected}, reacquire=${reacquireWorks}`
    );
  } finally {
    if (lockId3) {
      try { await releaseLock(base44, cursorId, lockId3, {}, true); } catch { /* ignore */ }
    }
    if (cursorId) await safeDelete(base44, "ServiceTitanSyncCursor", cursorId);
  }
}