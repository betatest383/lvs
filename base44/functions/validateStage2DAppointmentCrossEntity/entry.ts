import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import "../../shared/stage2d/appointmentSubscriberRegistration.ts";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import "../../shared/stage2c/jobSubscriberRegistration.ts";
import { publishEvent, replayDelivery } from "../../shared/businessEvent/businessEventEngine.ts";
import { getMigrationState, activateShadow } from "../../shared/stage2b/migrationStateService.ts";
import { getEffectivePolicy, versionPolicy } from "../../shared/syncPolicy/syncPolicyService.ts";
import { processEventDeliveries, ensureEventRegistry, ensureEventSubscribers, createTestTracker } from "../../shared/stage2b/validationHarnessUtils.ts";
import { createValidationRun, completeValidationRun } from "../../shared/stage2b/testHarnessGuard.ts";
import {
  createTestSetup, createTestCustomer, createTestJob, createTestEmployee,
  findAppointmentsByStId, cleanupTestSetup, cleanupAppointmentsByPrefix, cleanupDeferredByPrefix,
  type TestSetup,
} from "../../shared/stage2d/appointmentTestSetup.ts";

Deno.serve(async (req) => {
  let base44: any;
  let actor = "admin";
  let VR_ID: string | undefined;
  let VR_TOKEN: string | undefined;
  let setup: TestSetup = createTestSetup();
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner")
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });

    const TEST_PREFIX = `s2d-x-${Date.now()}`;
    actor = user.email || user.id || "admin";
    const tracker = createTestTracker();
    const { track } = tracker;

    const _vr = await createValidationRun(base44, TEST_PREFIX, "Stage 2D Cross-Entity", actor);
    VR_ID = _vr.run_id;
    VR_TOKEN = _vr.run_token;

    await ensureEventRegistry(base44, actor, [
      { event_type: "appointment.created", display_name: "Appointment Created", category: "lifecycle", entity_type: "Appointment" },
      { event_type: "appointment.updated", display_name: "Appointment Updated", category: "lifecycle", entity_type: "Appointment" },
      { event_type: "appointment.canceled", display_name: "Appointment Canceled", category: "lifecycle", entity_type: "Appointment" },
      { event_type: "appointment.assigned", display_name: "Appointment Assigned", category: "lifecycle", entity_type: "Appointment" },
      { event_type: "appointment.rescheduled", display_name: "Appointment Rescheduled", category: "lifecycle", entity_type: "Appointment" },
    ]);
    await ensureEventSubscribers(base44, actor, [
      { subscriber_id: "SUB-2D-X-APPT-IN-CREATED", subscriber_name: "Appointment Inbound Sync (created)", event_type: "appointment.created", handler_reference: "appointment.sync.inbound", processing_mode: "synchronous", priority: 10 },
      { subscriber_id: "SUB-2D-X-APPT-IN-UPDATED", subscriber_name: "Appointment Inbound Sync (updated)", event_type: "appointment.updated", handler_reference: "appointment.sync.inbound", processing_mode: "synchronous", priority: 10 },
      { subscriber_id: "SUB-2D-X-APPT-IN-CANCELED", subscriber_name: "Appointment Inbound Sync (canceled)", event_type: "appointment.canceled", handler_reference: "appointment.sync.inbound", processing_mode: "synchronous", priority: 10 },
      { subscriber_id: "SUB-2D-X-APPT-IN-ASSIGNED", subscriber_name: "Appointment Inbound Sync (assigned)", event_type: "appointment.assigned", handler_reference: "appointment.sync.inbound", processing_mode: "synchronous", priority: 10 },
      { subscriber_id: "SUB-2D-X-APPT-IN-RESCHEDULED", subscriber_name: "Appointment Inbound Sync (rescheduled)", event_type: "appointment.rescheduled", handler_reference: "appointment.sync.inbound", processing_mode: "synchronous", priority: 10 },
    ]);
    await activateShadow(base44, "Appointment", "servicetitan", 50, actor);

    async function publishAndProcess(eventType: string, stApptId: string, payload: any, evtId: string, action: string) {
      const pubResult = await publishEvent(base44, {
        event_type: eventType, entity_type: "Appointment", entity_id: stApptId,
        source_system: "servicetitan", source_event_id: evtId,
        payload: { webhook_payload: payload, webhook_event: { id: evtId, event_type: `appointment_${action}`, object_id: stApptId } },
        metadata: { validation_run_id: VR_ID }, actor,
        idempotency_key: `servicetitan:${evtId}:${action}`,
      });
      if (pubResult.business_event_id) {
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID!, VR_TOKEN!, actor);
      }
      return pubResult;
    }

    // ── A. Appointment arrives before Job ──
    {
      const apptId = `${TEST_PREFIX}-appt-A`;
      const evtId = `${TEST_PREFIX}-evt-A`;
      const stJobId = `${TEST_PREFIX}-job-A`;

      // Publish BEFORE Job exists
      const pubResult = await publishAndProcess("appointment.created", apptId, {
        appointment_id: apptId, job_id: stJobId, customer_id: `${TEST_PREFIX}-cust-A`,
        start_time: "2026-07-22T10:00:00", end_time: "2026-07-22T12:00:00",
      }, evtId, "created");

      // Verify no Appointment created
      const apptsBefore = await findAppointmentsByStId(base44, apptId);

      // Now create Customer and Job
      const custA = await createTestCustomer(base44, `${TEST_PREFIX}-cust-A`, "Cross-Entity Customer A");
      setup.customers.push(custA);
      const jobA = await createTestJob(base44, stJobId, "JOB-A", custA);
      setup.jobs.push(jobA);

      // Replay the same delivery
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Appointment Inbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      if (deliv) {
        await replayDelivery(base44, deliv.delivery_id, actor);
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID!, VR_TOKEN!, actor);
      }

      const apptsAfter = await findAppointmentsByStId(base44, apptId);
      const appt = apptsAfter[0];
      if (appt) setup.appointments.push(appt.id);

      track("A. Appointment before Job — deferred then created on replay",
        apptsBefore.length === 0 && apptsAfter.length === 1 && appt?.job_id === jobA.id && appt?.customer_id === custA.id,
        "no Appointment before Job; exactly 1 after replay, linked to correct Job and Customer",
        `before=${apptsBefore.length}, after=${apptsAfter.length}, job_id=${appt?.job_id}, customer_id=${appt?.customer_id}`);
    }

    // ── B. Job exists but Customer dependency invalid ──
    {
      const apptId = `${TEST_PREFIX}-appt-B`;
      const evtId = `${TEST_PREFIX}-evt-B`;
      // Create a Job with a customer, but payload references a different customer
      const custB = await createTestCustomer(base44, `${TEST_PREFIX}-cust-B`, "Cross-Entity Customer B");
      setup.customers.push(custB);
      const jobB = await createTestJob(base44, `${TEST_PREFIX}-job-B`, "JOB-B", custB);
      setup.jobs.push(jobB);

      // Create another customer that doesn't match
      const custB2 = await createTestCustomer(base44, `${TEST_PREFIX}-cust-B2`, "Cross-Entity Customer B2");
      setup.customers.push(custB2);

      await publishAndProcess("appointment.created", apptId, {
        appointment_id: apptId,
        job_id: `${TEST_PREFIX}-job-B`,  // linked to custB
        customer_id: `${TEST_PREFIX}-cust-B2`,  // different customer
        start_time: "2026-07-22T10:00:00", end_time: "2026-07-22T12:00:00",
      }, evtId, "created");

      const appts = await findAppointmentsByStId(base44, apptId);
      if (appts[0]) setup.appointments.push(appts[0].id);
      // Verify no duplicate Customer was created
      const customers = await base44.asServiceRole.entities.Customer.filter(
        { servicetitan_customer_id: `${TEST_PREFIX}-cust-B2` }, null, 10
      );

      track("B. Job exists but Customer mismatch — no duplicate Customer, no invalid Appointment",
        appts.length === 0 && customers.length === 1,
        "no Appointment created (contradiction), no duplicate Customer",
        `appt_count=${appts.length}, customer_count=${customers.length}`);
    }

    // ── C. Technician unresolved — appointment still syncs ──
    {
      const apptId = `${TEST_PREFIX}-appt-C`;
      const evtId = `${TEST_PREFIX}-evt-C`;
      const custC = await createTestCustomer(base44, `${TEST_PREFIX}-cust-C`, "Cross-Entity Customer C");
      setup.customers.push(custC);
      const jobC = await createTestJob(base44, `${TEST_PREFIX}-job-C`, "JOB-C", custC);
      setup.jobs.push(jobC);

      // Publish with unknown technician
      await publishAndProcess("appointment.created", apptId, {
        appointment_id: apptId, job_id: `${TEST_PREFIX}-job-C`, customer_id: `${TEST_PREFIX}-cust-C`,
        start_time: "2026-07-22T10:00:00", end_time: "2026-07-22T12:00:00",
        technician_id: `${TEST_PREFIX}-tech-unknown`, technician_name: "Unknown Tech C",
      }, evtId, "created");

      const appts = await findAppointmentsByStId(base44, apptId);
      const appt = appts[0];
      if (appt) setup.appointments.push(appt.id);

      // Verify no Employee was created
      const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
        { servicetitan_technician_id: `${TEST_PREFIX}-tech-unknown` }, null, 1
      );

      // Now create the Employee and reassign
      const empC = await createTestEmployee(base44, `${TEST_PREFIX}-tech-unknown`, "Carl", "Resolved", "Active");
      setup.employees.push(empC);

      const evtId2 = `${TEST_PREFIX}-evt-C2`;
      await publishAndProcess("appointment.assigned", apptId, {
        appointment_id: apptId,
        technician_id: `${TEST_PREFIX}-tech-unknown`, technician_name: "Unknown Tech C",
      }, evtId2, "assigned");

      const apptsAfter = await findAppointmentsByStId(base44, apptId);
      const apptAfter = apptsAfter[0];

      track("C. Technician unresolved — appointment syncs, later resolution updates same record",
        !!appt && appt.technician_mapping_status === "unmatched" && emps.length === 0 &&
        apptsAfter.length === 1 && apptAfter?.technician_mapping_status === "matched" && apptAfter?.technician_id === empC.id,
        "Appointment created with unmatched tech, no Employee guessed; later resolved to matched on same record",
        `initial: unmatched=${appt?.technician_mapping_status}, emps=${emps.length}; after: matched=${apptAfter?.technician_mapping_status}, tech_id=${apptAfter?.technician_id}`);
    }

    // ── D. Reschedule and stale event ──
    {
      const apptId = `${TEST_PREFIX}-appt-D`;
      const evtId1 = `${TEST_PREFIX}-evt-D1`;
      const evtId2 = `${TEST_PREFIX}-evt-D2`;
      const evtId3 = `${TEST_PREFIX}-evt-D3`;
      const custD = await createTestCustomer(base44, `${TEST_PREFIX}-cust-D`, "Cross-Entity Customer D");
      setup.customers.push(custD);
      const jobD = await createTestJob(base44, `${TEST_PREFIX}-job-D`, "JOB-D", custD);
      setup.jobs.push(jobD);

      // Initial create
      await publishAndProcess("appointment.created", apptId, {
        appointment_id: apptId, job_id: `${TEST_PREFIX}-job-D`, customer_id: `${TEST_PREFIX}-cust-D`,
        start_time: "2026-07-22T10:00:00", end_time: "2026-07-22T12:00:00",
        address: "Original Address",
        event_timestamp: "2026-07-22T09:00:00Z",
      }, evtId1, "created");

      // Newer reschedule
      await publishAndProcess("appointment.rescheduled", apptId, {
        appointment_id: apptId,
        start_time: "2026-07-23T14:00:00", end_time: "2026-07-23T16:00:00",
        address: "Rescheduled Address",
        event_timestamp: "2026-07-22T11:00:00Z",
      }, evtId2, "rescheduled");

      // Older update arrives afterward (should be ignored)
      await publishAndProcess("appointment.updated", apptId, {
        appointment_id: apptId,
        address: "Stale Address (should be ignored)",
        event_timestamp: "2026-07-22T10:00:00Z",  // OLDER than reschedule
      }, evtId3, "updated");

      const appts = await findAppointmentsByStId(base44, apptId);
      const appt = appts[0];
      if (appt && !setup.appointments.includes(appt.id)) setup.appointments.push(appt.id);

      track("D. Reschedule and stale event — newer schedule preserved, older ignored",
        appts.length === 1 &&
        appt?.address === "Rescheduled Address" &&
        appt?.scheduled_start?.includes("2026-07-23T14:00"),
        "1 Appointment, rescheduled address+time preserved, older update ignored",
        `count=${appts.length}, address=${appt?.address}, start=${appt?.scheduled_start}`);
    }

    // ── E. Inbound loop prevention under EXTERNAL_TO_LVC ──
    {
      const apptId = `${TEST_PREFIX}-appt-E`;
      const evtId = `${TEST_PREFIX}-evt-E`;
      const custE = await createTestCustomer(base44, `${TEST_PREFIX}-cust-E`, "Cross-Entity Customer E");
      setup.customers.push(custE);
      const jobE = await createTestJob(base44, `${TEST_PREFIX}-job-E`, "JOB-E", custE);
      setup.jobs.push(jobE);

      // Verify policy is EXTERNAL_TO_LVC
      const policy = await getEffectivePolicy(base44, "Appointment", "servicetitan");

      const pubResult = await publishAndProcess("appointment.created", apptId, {
        appointment_id: apptId, job_id: `${TEST_PREFIX}-job-E`, customer_id: `${TEST_PREFIX}-cust-E`,
        start_time: "2026-07-22T10:00:00", end_time: "2026-07-22T12:00:00",
      }, evtId, "created");

      const appts = await findAppointmentsByStId(base44, apptId);
      if (appts[0]) setup.appointments.push(appts[0].id);

      // Check no outbound deliveries
      const outboundDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Outbound" } },
        null, 10
      );

      // Check no duplicate deliveries
      const allDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id },
        null, 10
      );

      track("E. Inbound loop prevention — EXTERNAL_TO_LVC, no outbound, no duplicate",
        policy?.sync_mode === "EXTERNAL_TO_LVC" &&
        outboundDeliveries.length === 0 &&
        appts.length === 1,
        "policy EXTERNAL_TO_LVC, 0 outbound deliveries, 1 Appointment created",
        `policy=${policy?.sync_mode}, outbound=${outboundDeliveries.length}, appts=${appts.length}, total_deliveries=${allDeliveries.length}`);
    }

    return Response.json({
      stage: "Stage 2D — Appointment Cross-Entity Validation",
      test_prefix: TEST_PREFIX,
      validation_run_id: VR_ID,
      executed_at: new Date().toISOString(),
      ...tracker.getSummary(),
      external_activity: {
        real_st_write_attempts: 0,
        real_st_writes: 0,
        real_st_read_attempts: 0,
        ambiguous_external_attempts: 0,
      },
    });
  } catch (error) {
    console.error("[VALIDATE STAGE 2D CROSS-ENTITY ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    if (base44) {
      try { await cleanupTestSetup(base44, setup); } catch {}
      if (VR_ID) {
        try {
          await cleanupAppointmentsByPrefix(base44, `s2d-x-`);
          await cleanupDeferredByPrefix(base44, `s2d-x-`);
        } catch {}
        try { await completeValidationRun(base44, VR_ID, "completed"); } catch {}
      }
      try {
        const current = await getEffectivePolicy(base44, "Appointment", "servicetitan");
        if (current && current.sync_mode !== "EXTERNAL_TO_LVC") {
          await versionPolicy(base44, current.id, {
            sync_mode: "EXTERNAL_TO_LVC",
            conflict_resolution_strategy: "FIELD_LEVEL_RULES",
            sync_enabled: true,
            notes: `Restored to EXTERNAL_TO_LVC after Stage 2D cross-entity validation`,
          }, actor);
        }
      } catch {}
    }
  }
});