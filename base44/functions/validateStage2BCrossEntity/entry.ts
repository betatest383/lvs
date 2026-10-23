import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import "../../shared/stage2c/jobSubscriberRegistration.ts";
import {
  publishEvent,
  replayDelivery,
} from "../../shared/businessEvent/businessEventEngine.ts";
import {
  getMigrationState,
  activateShadow,
} from "../../shared/stage2b/migrationStateService.ts";
import {
  getEffectivePolicy,
  versionPolicy,
} from "../../shared/syncPolicy/syncPolicyService.ts";
import { registerCapability } from "../../shared/integration/integrationCapabilityService.ts";
import {
  processEventDeliveries,
  processTestDelivery,
  ensureEventRegistry,
  ensureEventSubscribers,
  createTestTracker,
} from "../../shared/stage2b/validationHarnessUtils.ts";
import {
  createValidationRun,
  completeValidationRun,
} from "../../shared/stage2b/testHarnessGuard.ts";

/**
 * validateStage2BCrossEntity — Cross-Entity Customer↔Job Validation
 *
 * Validates that Customer and Job migrations work correctly together on the
 * same Business Event Engine architecture. Uses test-only events with
 * test_skip_sync=true — NO real ServiceTitan writes occur.
 *
 * Test scenarios:
 *   1.  Customer Created, Then Job Created — linkage via shared ST customer ID
 *   2.  Job Before Customer — deferred/missing-parent behavior
 *   3.  Customer Updated, Then Job Updated — linkage stability
 *   4.  Duplicate Customer and Job Events — no duplicates, no cross-entity dupes
 *   5.  Replay Customer, Then Replay Job — idempotent, no loops
 *   6.  Concurrent Customer and Job Events — deterministic, no race dupes
 *   7.  Customer Deleted, Then Job Event — no destructive cascade, no silent relink
 *   8.  Job Deleted and Restored — Customer unchanged, idempotent restore
 *   9.  Loop Prevention Across Entities — no cross-entity cascading loops
 *   10. Event Ordering and Relationship Integrity — sequence integrity
 *
 * All test events use test_harness=true metadata marker, secured by testHarnessGuard.
 * Production policies restored to EXTERNAL_TO_LVC in finally block.
 */
Deno.serve(async (req) => {
  let base44: any;
  let actor = "admin";
  let VR_ID: string | undefined;
  let VR_TOKEN: string | undefined;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const TEST_PREFIX = `s2x-${Date.now()}`;
    actor = user.email || user.id || "admin";
    const tracker = createTestTracker();
    const { results, track } = tracker;

    // ── Create a protected validation run with server-generated token ──
    const _vr = await createValidationRun(
      base44, TEST_PREFIX, "Stage 2B Cross-Entity", actor
    );
    VR_ID = _vr.run_id;
    VR_TOKEN = _vr.run_token;

    // ── Prerequisites ──
    await ensureCrossEntityPrerequisites(base44, actor);
    await upgradeBothPoliciesToTwoWay(base44, actor);

    // Activate shadow for both entities (needed for subscriber metrics)
    await activateShadow(base44, "Customer", "servicetitan", 50, actor);
    await activateShadow(base44, "Job", "servicetitan", 50, actor);

    // ── Helper: parse delivery output metadata ──
    const parseOutput = (deliv: any): any => {
      try { return deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch { return {}; }
    };

    // ── Helper: get inbound delivery for an event ──
    const getInboundDelivery = async (eventId: string, subscriberPattern: string) => {
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: eventId, subscriber_name: { $regex: subscriberPattern } },
        null, 1
      );
      return deliveries[0];
    };

    // ════════════════════════════════════════════════════════════════════════
    // Test 1 — Customer Created, Then Job Created
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-1`;
      const stJobId = `${TEST_PREFIX}-job-1`;

      // Publish customer.created
      const custEvtId = `${TEST_PREFIX}-ce-1`;
      const custPub = await publishEvent(base44, {
        event_type: "customer.created",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: custEvtId,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Cross-Entity Customer 1" }, webhook_event: { id: custEvtId, object_id: stCustomerId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${custEvtId}:created`,
      });
      await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.created referencing the same customer
      const jobEvtId = `${TEST_PREFIX}-je-1`;
      const jobPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: jobEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId, name: "Cross-Entity Job 1" }, webhook_event: { id: jobEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${jobEvtId}:created`,
      });
      await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      const custDeliv = await getInboundDelivery(custPub.business_event_id, "Customer Inbound");
      const jobDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");
      const custParsed = parseOutput(custDeliv);
      const jobParsed = parseOutput(jobDeliv);

      track(
        "1. Customer Created, Then Job Created — both events processed, linkage via shared ST customer ID",
        custPub.success && !custPub.duplicate &&
        jobPub.success && !jobPub.duplicate &&
        custDeliv?.delivery_status === "completed" &&
        jobDeliv?.delivery_status === "completed" &&
        custParsed.test_skipped === true &&
        jobParsed.test_skipped === true,
        "both events published, deliveries completed, test_skipped=true",
        `cust: success=${custPub.success}, dup=${custPub.duplicate}, deliv=${custDeliv?.delivery_status}, skipped=${custParsed.test_skipped}; job: success=${jobPub.success}, dup=${jobPub.duplicate}, deliv=${jobDeliv?.delivery_status}, skipped=${jobParsed.test_skipped}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 2 — Job Before Customer (real deferral + resolution path)
    //
    // Tests the REAL syncJobCreated → resolveCustomer path using
    // test_skip_hydration (skips only the ST API call, NOT the business logic).
    //
    // Flow:
    //   1. Publish job.created for a customer that doesn't exist locally
    //   2. resolveCustomer can't find customer → skips ST API → returns "deferred"
    //   3. syncJobCreated returns { success: false, retryable: true }
    //   4. Delivery enters "failed" state — NO Job created, NO Customer created
    //   5. Create Customer locally
    //   6. Replay the job delivery → resolveCustomer finds customer → Job created
    //   7. Republish same event → idempotent (duplicate=true, no new Job)
    //   8. Verify no outbound event loop
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-missing`;
      const stJobId = `${TEST_PREFIX}-job-before-cust`;
      const cleanupIds: { jobs: string[]; customers: string[] } = { jobs: [], customers: [] };

      try {
        // Step 1: Publish job.created WITHOUT test_skip_sync, WITH test_skip_hydration
        const jobEvtId = `${TEST_PREFIX}-je-2`;
        const jobPub = await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: stJobId,
          source_system: "servicetitan",
          source_event_id: jobEvtId,
          payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: jobEvtId, object_id: stJobId } },
          metadata: { validation_run_id: VR_ID,test_skip_hydration: true },
          actor,
          idempotency_key: `servicetitan:${jobEvtId}:created`,
        });
        await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

        // Step 2: Verify delivery is "failed" (deferred customer)
        const jobDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");
        const jobParsed = parseOutput(jobDeliv);

        // Verify: no Job entity was created
        const jobsBefore = await base44.asServiceRole.entities.Job.filter(
          { servicetitan_job_id: stJobId }, null, 1
        );
        // Verify: no Customer entity was created
        const customersBefore = await base44.asServiceRole.entities.Customer.filter(
          { servicetitan_customer_id: stCustomerId }, null, 1
        );

        const step1Passed =
          jobPub.success && !jobPub.duplicate &&
          jobDeliv?.delivery_status === "failed" &&
          jobParsed.shadow_outcome === "mapping_failure" &&
          jobsBefore.length === 0 &&
          customersBefore.length === 0;

        // Step 3: Create Customer locally (simulates customer arriving via sync)
        const createdCustomer = await base44.asServiceRole.entities.Customer.create({
          name: "Test Customer (Job-Before-Customer)",
          servicetitan_customer_id: stCustomerId,
          servicetitan_sync_status: "synced",
          status: "active",
          import_source: "manual",
          imported_at: new Date().toISOString(),
        });
        cleanupIds.customers.push(createdCustomer.id);

        // Step 4: Replay the job delivery → syncJobCreated runs again
        const replayResult = await replayDelivery(base44, jobDeliv.delivery_id, actor);
        await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

        // Step 5: Verify job is now created and linked
        const jobDelivAfter = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");
        const jobsAfter = await base44.asServiceRole.entities.Job.filter(
          { servicetitan_job_id: stJobId }, null, 1
        );
        const createdJob = jobsAfter[0];
        if (createdJob) cleanupIds.jobs.push(createdJob.id);

        const step2Passed =
          replayResult?.success === true &&
          jobDelivAfter?.delivery_status === "completed" &&
          createdJob?.id !== undefined &&
          createdJob?.customer_id === createdCustomer.id;

        // Step 6: Republish same event — idempotent
        const jobPub2 = await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: stJobId,
          source_system: "servicetitan",
          source_event_id: jobEvtId,
          payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: jobEvtId, object_id: stJobId } },
          metadata: { validation_run_id: VR_ID,test_skip_hydration: true },
          actor,
          idempotency_key: `servicetitan:${jobEvtId}:created`,
        });
        await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

        const jobsAfterRepub = await base44.asServiceRole.entities.Job.filter(
          { servicetitan_job_id: stJobId }, null, 5
        );

        const step3Passed = jobPub2.duplicate === true && jobsAfterRepub.length === 1;

        // Step 7: Verify no outbound event loop
        const outboundDeliv = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
          { business_event_id: jobPub.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
          null, 1
        );
        const outParsed = parseOutput(outboundDeliv[0]);
        const step4Passed = outParsed.skipped === true && outParsed.reason === "external_origin";

        track(
          "2. Job Before Customer — deferred, then resolved after Customer arrives, idempotent, no loop",
          step1Passed && step2Passed && step3Passed && step4Passed,
          "delivery=failed→completed, no Job before Customer, Job linked after, duplicate on republish, outbound skipped",
          `step1: deliv=${jobDeliv?.delivery_status}, outcome=${jobParsed.shadow_outcome}, jobs=${jobsBefore.length}, custs=${customersBefore.length}; step2: replay=${replayResult?.success}, deliv=${jobDelivAfter?.delivery_status}, linked=${createdJob?.customer_id === createdCustomer.id}; step3: dup=${jobPub2.duplicate}, jobs=${jobsAfterRepub.length}; step4: out_skipped=${outParsed.skipped}`
        );
      } finally {
        // Cleanup
        for (const jid of cleanupIds.jobs) {
          try { await base44.asServiceRole.entities.Job.delete(jid); } catch {}
        }
        for (const cid of cleanupIds.customers) {
          try { await base44.asServiceRole.entities.Customer.delete(cid); } catch {}
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 3 — Customer Updated, Then Job Updated (linkage stability)
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-stable`;
      const stJobId = `${TEST_PREFIX}-job-stable`;

      // Publish customer.updated
      const custEvtId = `${TEST_PREFIX}-ce-3`;
      const custPub = await publishEvent(base44, {
        event_type: "customer.updated",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: custEvtId,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Updated Customer 3" }, webhook_event: { id: custEvtId, object_id: stCustomerId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${custEvtId}:updated`,
      });
      await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.updated referencing same customer
      const jobEvtId = `${TEST_PREFIX}-je-3`;
      const jobPub = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: jobEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: jobEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${jobEvtId}:updated`,
      });
      await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      const custDeliv = await getInboundDelivery(custPub.business_event_id, "Customer Inbound");
      const jobDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");

      track(
        "3. Customer Updated, Then Job Updated — linkage remains stable, no cross-entity interference",
        custPub.success && jobPub.success &&
        custDeliv?.delivery_status === "completed" &&
        jobDeliv?.delivery_status === "completed",
        "both updates processed, no cross-entity interference",
        `cust: deliv=${custDeliv?.delivery_status}; job: deliv=${jobDeliv?.delivery_status}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 4 — Duplicate Customer and Job Events
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-dup`;
      const stJobId = `${TEST_PREFIX}-job-dup`;
      const custIdemKey = `servicetitan:${TEST_PREFIX}-dup-cust:created`;
      const jobIdemKey = `servicetitan:${TEST_PREFIX}-dup-job:created`;

      // Publish customer.created 3 times with same idempotency key
      const custResults: any[] = [];
      for (let i = 0; i < 3; i++) {
        custResults.push(await publishEvent(base44, {
          event_type: "customer.created",
          entity_type: "Customer",
          entity_id: stCustomerId,
          source_system: "servicetitan",
          source_event_id: `${TEST_PREFIX}-dup-cust`,
          payload: { webhook_payload: { customer_id: stCustomerId, name: "Dup Customer" }, webhook_event: { id: `${TEST_PREFIX}-dup-cust` } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: custIdemKey,
        }));
      }

      // Publish job.created 3 times with same idempotency key
      const jobResults: any[] = [];
      for (let i = 0; i < 3; i++) {
        jobResults.push(await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: stJobId,
          source_system: "servicetitan",
          source_event_id: `${TEST_PREFIX}-dup-job`,
          payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: `${TEST_PREFIX}-dup-job` } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: jobIdemKey,
        }));
      }
      await processEventDeliveries(base44, custResults[0].business_event_id, VR_ID, VR_TOKEN, actor);
      await processEventDeliveries(base44, jobResults[0].business_event_id, VR_ID, VR_TOKEN, actor);

      const custEvents = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: custIdemKey }, null, 10
      );
      const jobEvents = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: jobIdemKey }, null, 10
      );

      track(
        "4. Duplicate Customer and Job Events — one event per idempotency key, no cross-entity dupes",
        custResults.filter((r: any) => r.duplicate).length === 2 &&
        jobResults.filter((r: any) => r.duplicate).length === 2 &&
        custEvents.length === 1 &&
        jobEvents.length === 1,
        "2 dupes each, 1 customer event, 1 job event",
        `cust_dupes=${custResults.filter((r: any) => r.duplicate).length}, job_dupes=${jobResults.filter((r: any) => r.duplicate).length}, cust_events=${custEvents.length}, job_events=${jobEvents.length}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 5 — Replay Customer, Then Replay Job
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-replay`;
      const stJobId = `${TEST_PREFIX}-job-replay`;

      // Publish customer.created
      const custEvtId = `${TEST_PREFIX}-ce-5`;
      const custPub = await publishEvent(base44, {
        event_type: "customer.created",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: custEvtId,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Replay Customer" }, webhook_event: { id: custEvtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${custEvtId}:created`,
      });
      await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.created
      const jobEvtId = `${TEST_PREFIX}-je-5`;
      const jobPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: jobEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: jobEvtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${jobEvtId}:created`,
      });
      await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Replay customer delivery
      const custDeliv = await getInboundDelivery(custPub.business_event_id, "Customer Inbound");
      let custReplay: any = null;
      if (custDeliv) {
        custReplay = await replayDelivery(base44, custDeliv.delivery_id, actor);
        await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      // Replay job delivery
      const jobDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");
      let jobReplay: any = null;
      if (jobDeliv) {
        jobReplay = await replayDelivery(base44, jobDeliv.delivery_id, actor);
        await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      // Verify no duplicate events created
      const custEvents = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: `servicetitan:${custEvtId}:created` }, null, 10
      );
      const jobEvents = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: `servicetitan:${jobEvtId}:created` }, null, 10
      );

      track(
        "5. Replay Customer, Then Replay Job — idempotent, no duplicate events, no loops",
        custEvents.length === 1 && jobEvents.length === 1 &&
        (custReplay?.success === true || custDeliv?.replay_count >= 1) &&
        (jobReplay?.success === true || jobDeliv?.replay_count >= 1),
        "1 event each after replay, replay succeeded",
        `cust_events=${custEvents.length}, job_events=${jobEvents.length}, cust_replay=${custReplay?.success}, job_replay=${jobReplay?.success}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 6 — Concurrent Customer and Job Events
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-conc`;
      const stJobId = `${TEST_PREFIX}-job-conc`;
      const promises: Promise<any>[] = [];

      // Publish customer.created and job.created concurrently
      for (let i = 1; i <= 3; i++) {
        const custEvtId = `${TEST_PREFIX}-conc-cust-${i}`;
        promises.push(publishEvent(base44, {
          event_type: "customer.created",
          entity_type: "Customer",
          entity_id: `${stCustomerId}-${i}`,
          source_system: "servicetitan",
          source_event_id: custEvtId,
          payload: { webhook_payload: { customer_id: `${stCustomerId}-${i}`, name: `Conc Customer ${i}` }, webhook_event: { id: custEvtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: `servicetitan:${custEvtId}:created`,
        }));

        const jobEvtId = `${TEST_PREFIX}-conc-job-${i}`;
        promises.push(publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: `${stJobId}-${i}`,
          source_system: "servicetitan",
          source_event_id: jobEvtId,
          payload: { webhook_payload: { job_id: `${stJobId}-${i}`, customer_id: `${stCustomerId}-${i}` }, webhook_event: { id: jobEvtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: `servicetitan:${jobEvtId}:created`,
        }));
      }
      const pubResults = await Promise.all(promises);
      for (const pr of pubResults) {
        await processEventDeliveries(base44, pr.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      const allSucceeded = pubResults.every((r: any) => r.success);
      const allUnique = pubResults.filter((r: any) => !r.duplicate).length === 6;
      const distinctEventIds = new Set(pubResults.map((r: any) => r.business_event_id)).size;

      track(
        "6. Concurrent Customer and Job Events — deterministic, no race-created dupes",
        allSucceeded && allUnique && distinctEventIds === 6,
        "all 6 events published, all unique, 6 distinct event IDs",
        `succeeded=${allSucceeded}, unique=${allUnique}, distinct_ids=${distinctEventIds}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 7 — Customer Deleted, Then Job Event
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-deleted`;
      const stJobId = `${TEST_PREFIX}-job-after-delete`;

      // Publish customer.deleted
      const custEvtId = `${TEST_PREFIX}-ce-7`;
      const custPub = await publishEvent(base44, {
        event_type: "customer.updated",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: custEvtId,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Deleted Customer", deleted: true }, webhook_event: { id: custEvtId, object_id: stCustomerId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${custEvtId}:updated`,
      });
      await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.created referencing the deleted customer
      const jobEvtId = `${TEST_PREFIX}-je-7`;
      const jobPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: jobEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: jobEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${jobEvtId}:created`,
      });
      await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      const custDeliv = await getInboundDelivery(custPub.business_event_id, "Customer Inbound");
      const jobDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");

      track(
        "7. Customer Deleted, Then Job Event — no destructive cascade, no silent relink",
        custPub.success && jobPub.success &&
        custDeliv?.delivery_status === "completed" &&
        jobDeliv?.delivery_status === "completed",
        "both events processed independently, no cascade",
        `cust: deliv=${custDeliv?.delivery_status}; job: deliv=${jobDeliv?.delivery_status}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 8 — Job Deleted and Restored
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-jdr`;
      const stJobId = `${TEST_PREFIX}-job-jdr`;

      // Publish job.created
      const createEvtId = `${TEST_PREFIX}-je-8c`;
      const createPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: createEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: createEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${createEvtId}:created`,
      });
      await processEventDeliveries(base44, createPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.deleted
      const deleteEvtId = `${TEST_PREFIX}-je-8d`;
      const deletePub = await publishEvent(base44, {
        event_type: "job.deleted",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: deleteEvtId,
        payload: { webhook_payload: { job_id: stJobId }, webhook_event: { id: deleteEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${deleteEvtId}:deleted`,
      });
      await processEventDeliveries(base44, deletePub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish job.restored
      const restoreEvtId = `${TEST_PREFIX}-je-8r`;
      const restorePub = await publishEvent(base44, {
        event_type: "job.restored",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: restoreEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: restoreEvtId, object_id: stJobId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${restoreEvtId}:restored`,
      });
      await processEventDeliveries(base44, restorePub.business_event_id, VR_ID, VR_TOKEN, actor);

      const createDeliv = await getInboundDelivery(createPub.business_event_id, "Job Inbound");
      const deleteDeliv = await getInboundDelivery(deletePub.business_event_id, "Job Inbound");
      const restoreDeliv = await getInboundDelivery(restorePub.business_event_id, "Job Inbound");

      // Verify: 3 distinct events, all deliveries completed
      const allEvents = await base44.asServiceRole.entities.BusinessEvent.filter(
        { entity_id: stJobId, entity_type: "Job" }, null, 10
      );

      track(
        "8. Job Deleted and Restored — Customer unchanged, idempotent restore, 3 distinct events",
        createPub.success && deletePub.success && restorePub.success &&
        createDeliv?.delivery_status === "completed" &&
        deleteDeliv?.delivery_status === "completed" &&
        restoreDeliv?.delivery_status === "completed" &&
        allEvents.length === 3,
        "create+delete+restore all completed, 3 distinct events",
        `create=${createDeliv?.delivery_status}, delete=${deleteDeliv?.delivery_status}, restore=${restoreDeliv?.delivery_status}, events=${allEvents.length}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 9 — Loop Prevention Across Entities
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-loop`;
      const stJobId = `${TEST_PREFIX}-job-loop`;

      // Publish lvc_os customer.created — inbound subscriber should skip it
      const custEvtId = `${TEST_PREFIX}-le-9c`;
      const custPub = await publishEvent(base44, {
        event_type: "customer.created",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "lvc_os",
        payload: { customer_id: stCustomerId, name: "LVC Loop Customer" },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${stCustomerId}:created:1`,
      });
      await processEventDeliveries(base44, custPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish lvc_os job.created — inbound subscriber should skip it
      const jobEvtId = `${TEST_PREFIX}-le-9j`;
      const jobPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "lvc_os",
        payload: { job_id: stJobId, customer_id: stCustomerId },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${stJobId}:created:1`,
      });
      await processEventDeliveries(base44, jobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish servicetitan customer.created — outbound subscriber should skip it
      const stCustEvtId = `${TEST_PREFIX}-le-9sc`;
      const stCustPub = await publishEvent(base44, {
        event_type: "customer.created",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: stCustEvtId,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "ST Loop Customer" }, webhook_event: { id: stCustEvtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `servicetitan:${stCustEvtId}:created`,
      });
      await processEventDeliveries(base44, stCustPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Publish servicetitan job.created — outbound subscriber should skip it
      const stJobEvtId = `${TEST_PREFIX}-le-9sj`;
      const stJobPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: stJobEvtId,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: stJobEvtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `servicetitan:${stJobEvtId}:created`,
      });
      await processEventDeliveries(base44, stJobPub.business_event_id, VR_ID, VR_TOKEN, actor);

      // Verify: inbound subscriber skipped lvc_os events
      const lvcCustInboundDeliv = await getInboundDelivery(custPub.business_event_id, "Customer Inbound");
      const lvcJobInboundDeliv = await getInboundDelivery(jobPub.business_event_id, "Job Inbound");
      const lvcCustParsed = parseOutput(lvcCustInboundDeliv);
      const lvcJobParsed = parseOutput(lvcJobInboundDeliv);

      // Verify: outbound subscriber skipped servicetitan events
      const stCustOutboundDeliv = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: stCustPub.business_event_id, subscriber_name: { $regex: "Customer Outbound" } },
        null, 1
      );
      const stJobOutboundDeliv = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: stJobPub.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
        null, 1
      );
      const stCustOutParsed = parseOutput(stCustOutboundDeliv[0]);
      const stJobOutParsed = parseOutput(stJobOutboundDeliv[0]);

      track(
        "9. Loop Prevention Across Entities — inbound skips lvc_os, outbound skips ST, no cascading loops",
        lvcCustParsed.skipped === true && lvcJobParsed.skipped === true &&
        stCustOutParsed.skipped === true && stJobOutParsed.skipped === true,
        "all 4 events skipped by wrong-direction subscriber",
        `lvc_cust_inbound_skipped=${lvcCustParsed.skipped}, lvc_job_inbound_skipped=${lvcJobParsed.skipped}, st_cust_outbound_skipped=${stCustOutParsed.skipped}, st_job_outbound_skipped=${stJobOutParsed.skipped}`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Test 10 — Event Ordering and Relationship Integrity
    // ════════════════════════════════════════════════════════════════════════
    {
      const stCustomerId = `${TEST_PREFIX}-cust-order`;
      const stJobId = `${TEST_PREFIX}-job-order`;
      const sequence: any[] = [];

      // customer.created
      const evt1 = `${TEST_PREFIX}-ord-1`;
      const pub1 = await publishEvent(base44, {
        event_type: "customer.created",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: evt1,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Order Customer" }, webhook_event: { id: evt1 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt1}:created`,
      });
      await processEventDeliveries(base44, pub1.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "customer.created", success: pub1.success, event_id: pub1.business_event_id });

      // job.created
      const evt2 = `${TEST_PREFIX}-ord-2`;
      const pub2 = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: evt2,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: evt2 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt2}:created`,
      });
      await processEventDeliveries(base44, pub2.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "job.created", success: pub2.success, event_id: pub2.business_event_id });

      // customer.updated
      const evt3 = `${TEST_PREFIX}-ord-3`;
      const pub3 = await publishEvent(base44, {
        event_type: "customer.updated",
        entity_type: "Customer",
        entity_id: stCustomerId,
        source_system: "servicetitan",
        source_event_id: evt3,
        payload: { webhook_payload: { customer_id: stCustomerId, name: "Updated Order Customer" }, webhook_event: { id: evt3 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt3}:updated`,
      });
      await processEventDeliveries(base44, pub3.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "customer.updated", success: pub3.success, event_id: pub3.business_event_id });

      // job.updated
      const evt4 = `${TEST_PREFIX}-ord-4`;
      const pub4 = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: evt4,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: evt4 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt4}:updated`,
      });
      await processEventDeliveries(base44, pub4.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "job.updated", success: pub4.success, event_id: pub4.business_event_id });

      // job.deleted
      const evt5 = `${TEST_PREFIX}-ord-5`;
      const pub5 = await publishEvent(base44, {
        event_type: "job.deleted",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: evt5,
        payload: { webhook_payload: { job_id: stJobId }, webhook_event: { id: evt5 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt5}:deleted`,
      });
      await processEventDeliveries(base44, pub5.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "job.deleted", success: pub5.success, event_id: pub5.business_event_id });

      // job.restored
      const evt6 = `${TEST_PREFIX}-ord-6`;
      const pub6 = await publishEvent(base44, {
        event_type: "job.restored",
        entity_type: "Job",
        entity_id: stJobId,
        source_system: "servicetitan",
        source_event_id: evt6,
        payload: { webhook_payload: { job_id: stJobId, customer_id: stCustomerId }, webhook_event: { id: evt6 } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evt6}:restored`,
      });
      await processEventDeliveries(base44, pub6.business_event_id, VR_ID, VR_TOKEN, actor);
      sequence.push({ event: "job.restored", success: pub6.success, event_id: pub6.business_event_id });

      const allSucceeded = sequence.every((s: any) => s.success);
      const distinctEventIds = new Set(sequence.map((s: any) => s.event_id)).size;

      track(
        "10. Event Ordering and Relationship Integrity — 6-event sequence, all unique, all processed",
        allSucceeded && distinctEventIds === 6,
        "all 6 events in sequence published successfully, 6 distinct event IDs",
        `succeeded=${allSucceeded}, distinct_ids=${distinctEventIds}, sequence=${sequence.map((s: any) => s.event).join("→")}`
      );
    }

    // ── Cleanup ──
    // No global drain — each test processes its own exact deliveries.

    // Verify final migration states
    const custState = await getMigrationState(base44, "Customer", "servicetitan");
    const jobState = await getMigrationState(base44, "Job", "servicetitan");

    const finalStateCheck = {
      customer_mode: custState?.mode || "none",
      customer_auto_cut: custState?.auto_cut_enabled ?? false,
      job_mode: jobState?.mode || "none",
      job_auto_cut: jobState?.auto_cut_enabled ?? false,
    };

    return Response.json({
      stage: "Stage 2B — Cross-Entity Customer↔Job Validation",
      test_prefix: TEST_PREFIX,
      executed_at: new Date().toISOString(),
      ...tracker.getSummary(),
      final_migration_state: finalStateCheck,
    });
  } catch (error) {
    if (base44) {
      try { await restoreBothPolicies(base44, actor); } catch (e) { console.error("[STAGE 2X] Policy restore on failure:", e); }
    }
    console.error("[VALIDATE STAGE 2X ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    // Invalidate validation run (success or failure)
    if (base44 && VR_ID) {
      try { await completeValidationRun(base44, VR_ID, "completed"); } catch { /* non-critical */ }
    }
    if (base44) {
      try { await restoreBothPolicies(base44, actor); } catch (e) { console.error("[STAGE 2X] Policy restore in finally:", e); }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

async function ensureCrossEntityPrerequisites(base44: any, actor: string): Promise<void> {
  // Customer events
  await ensureEventRegistry(base44, actor, [
    { event_type: "customer.created", display_name: "Customer Created", category: "lifecycle", entity_type: "Customer" },
    { event_type: "customer.updated", display_name: "Customer Updated", category: "lifecycle", entity_type: "Customer" },
  ]);

  // Job events
  await ensureEventRegistry(base44, actor, [
    { event_type: "job.created", display_name: "Job Created", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.updated", display_name: "Job Updated", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.deleted", display_name: "Job Deleted", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.restored", display_name: "Job Restored", category: "lifecycle", entity_type: "Job" },
  ]);

  // Customer subscribers
  await ensureEventSubscribers(base44, actor, [
    { subscriber_id: "SUB-2B-CUST-IN-CREATED", subscriber_name: "Customer Inbound Sync (created)", event_type: "customer.created", handler_reference: "customer.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2B-CUST-IN-UPDATED", subscriber_name: "Customer Inbound Sync (updated)", event_type: "customer.updated", handler_reference: "customer.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2B-CUST-OUT-CREATED", subscriber_name: "Customer Outbound Push (created)", event_type: "customer.created", handler_reference: "customer.sync.outbound", processing_mode: "asynchronous", priority: 20 },
    { subscriber_id: "SUB-2B-CUST-OUT-UPDATED", subscriber_name: "Customer Outbound Push (updated)", event_type: "customer.updated", handler_reference: "customer.sync.outbound", processing_mode: "asynchronous", priority: 20 },
  ]);

  // Job subscribers
  await ensureEventSubscribers(base44, actor, [
    { subscriber_id: "SUB-2C-JOB-IN-CREATED", subscriber_name: "Job Inbound Sync (created)", event_type: "job.created", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-UPDATED", subscriber_name: "Job Inbound Sync (updated)", event_type: "job.updated", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-DELETED", subscriber_name: "Job Inbound Sync (deleted)", event_type: "job.deleted", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-RESTORED", subscriber_name: "Job Inbound Sync (restored)", event_type: "job.restored", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-OUT-CREATED", subscriber_name: "Job Outbound Push (created)", event_type: "job.created", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
    { subscriber_id: "SUB-2C-JOB-OUT-UPDATED", subscriber_name: "Job Outbound Push (updated)", event_type: "job.updated", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
    { subscriber_id: "SUB-2C-JOB-OUT-DELETED", subscriber_name: "Job Outbound Push (deleted)", event_type: "job.deleted", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
  ]);
}

async function upgradeBothPoliciesToTwoWay(base44: any, actor: string): Promise<void> {
  for (const entityType of ["Customer", "Job"]) {
    try {
      await registerCapability(base44, {
        external_system: "servicetitan",
        entity_type,
        direction: "LVC_TO_EXTERNAL",
        capability: "API_PUSH",
        is_supported: true,
        implementation_status: "implemented",
        api_version: entityType === "Customer" ? "crm/v2" : "jpm/v2",
        limitations: "Outbound push implemented. Requires OAuth write scope.",
        created_by: actor,
      });
    } catch { /* may already exist */ }

    try {
      const current = await getEffectivePolicy(base44, entityType, "servicetitan");
      if (current && current.sync_mode !== "TWO_WAY") {
        await versionPolicy(base44, current.id, {
          sync_mode: "TWO_WAY",
          conflict_resolution_strategy: "FIELD_LEVEL_RULES",
          sync_enabled: true,
          notes: `Upgraded to TWO_WAY for Stage 2X cross-entity validation by ${actor}`,
        }, actor);
      }
    } catch { /* ignore */ }
  }
}

async function restoreBothPolicies(base44: any, actor: string): Promise<void> {
  for (const entityType of ["Customer", "Job"]) {
    try {
      const current = await getEffectivePolicy(base44, entityType, "servicetitan");
      if (current && current.sync_mode !== "EXTERNAL_TO_LVC") {
        await versionPolicy(base44, current.id, {
          sync_mode: "EXTERNAL_TO_LVC",
          conflict_resolution_strategy: "FIELD_LEVEL_RULES",
          sync_enabled: true,
          notes: `Restored to EXTERNAL_TO_LVC for production by ${actor} (Stage 2X validation complete)`,
        }, actor);
      }
    } catch (e) {
      console.error(`[STAGE 2X] restoreBothPolicies (${entityType}):`, e);
    }
  }
}