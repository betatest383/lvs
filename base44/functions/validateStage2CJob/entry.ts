import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import "../../shared/stage2c/jobSubscriberRegistration.ts";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import {
  publishEvent,
  replayDelivery,
  getEventStatus,
} from "../../shared/businessEvent/businessEventEngine.ts";
import {
  registerSubscriberHandler,
  type SubscriberHandler,
  type SubscriberHandlerResult,
} from "../../shared/businessEvent/subscriberHandlerRegistry.ts";
import {
  getMigrationState,
  activateShadow,
  forceCutOver,
  rollbackMigration,
} from "../../shared/stage2b/migrationStateService.ts";
import {
  getEffectivePolicy,
  versionPolicy,
} from "../../shared/syncPolicy/syncPolicyService.ts";
import { registerCapability } from "../../shared/integration/integrationCapabilityService.ts";
import {
  createFieldAuthority,
  deactivateFieldAuthority,
} from "../../shared/syncPolicy/fieldAuthorityService.ts";
import { getShadowMetricsSummary } from "../../shared/stage2b/shadowMetricsService.ts";
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

// ─── Test Handler for Deterministic Dead-Letter Replay (Test 18) ────────────
// Succeeds only when isReplay=true; fails with retryable error on first attempt.
// This allows Test 18 to create its own dead-lettered delivery through the real
// delivery lifecycle and then replay it deterministically.
const testReplayCallLog: string[] = [];
const succeedOnReplayHandler: SubscriberHandler = async (event, _delivery, ctx) => {
  testReplayCallLog.push(`${event.event_id}:${ctx.isReplay ? "replay" : "initial"}`);
  if (ctx.isReplay) {
    return { success: true, summary: "Succeeded on replay", output: { replayed: true } };
  }
  return { success: false, summary: "Fails until replayed", error: "Fails until replayed", retryable: true };
};
registerSubscriberHandler("test.echo.succeed.on.replay.s2c", succeedOnReplayHandler);

/**
 * validateStage2CJob — Stage 2C Job Migration Validation Harness
 *
 * Mirrors the Stage 2B-A Customer validation pattern.
 *
 * Test coverage:
 *   1.  Job Created — inbound routing
 *   2.  Job Updated — inbound routing
 *   3.  Job Deleted — inbound routing
 *   4.  Job Restored — inbound routing
 *   5.  Inbound idempotency — replay returns duplicate
 *   6.  Loop prevention — inbound ignores lvc_os events
 *   7.  Loop prevention — outbound ignores servicetitan events
 *   8.  Outbound mock push with TWO_WAY policy → processes permitted fields
 *   9.  Field authority filtering — EXTERNAL_SYSTEM field is skipped
 *   10. Policy mode guard — EXTERNAL_TO_LVC blocks outbound (skipped)
 *   11. Shadow state — activate, verify mode + metrics reset
 *   12. Manual cut-over (NOT auto-cut) — shadow collects metrics, cut_over is manual only
 *   13. Rollback — cut_over → shadow
 *   14. Duplicate webhook processing — no duplicate Jobs created
 *   15. Replay processing — replayed event doesn't create duplicates
 *   16. Concurrent processing — no race conditions
 *   17. Retry recovery — all deliveries reach terminal state
 *   18. Dead-letter replay — dead-lettered delivery replayed
 *   19. Shadow metrics validation — metrics recorded correctly
 *   20. Migration state — ready_for_cutover computed, never auto-triggers
 *
 * All test events use test_harness=true metadata marker, secured by testHarnessGuard.
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

    const TEST_PREFIX = `s2c-${Date.now()}`;
    actor = user.email || user.id || "admin";
    const tracker = createTestTracker();
    const { results, track } = tracker;

    // ── Create a protected validation run with server-generated token ──
    const _vr = await createValidationRun(
      base44, TEST_PREFIX, "Stage 2C", actor
    );
    VR_ID = _vr.run_id;
    VR_TOKEN = _vr.run_token;

    // ── Prerequisites ──
    await ensurePrerequisites(base44, actor);
    await upgradeJobPolicyToTwoWay(base44, actor);

    // ── 1. Job Created — inbound routing ──
    {
      const evtId = `${TEST_PREFIX}-job-created-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-1`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-1`, job_number: "JOB-001" }, webhook_event: { id: evtId, event_type: "job_created", object_id: `${TEST_PREFIX}-job-1` } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:created`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const inboundDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const inboundDeliv = inboundDeliveries[0];
      let inboundParsed: any = {};
      try { inboundParsed = inboundDeliv?.output_metadata ? JSON.parse(inboundDeliv.output_metadata) : {}; } catch {}
      track(
        "1. Job Created — inbound routing",
        pubResult.success && !pubResult.duplicate && inboundDeliv?.delivery_status === "completed",
        "success, inbound delivery completed",
        `success=${pubResult.success}, duplicate=${pubResult.duplicate}, inbound=${inboundDeliv?.delivery_status}, test_skipped=${inboundParsed.test_skipped}`
      );
    }

    // ── 2. Job Updated — inbound routing ──
    {
      const evtId = `${TEST_PREFIX}-job-updated-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-2`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-2`, job_number: "JOB-002" }, webhook_event: { id: evtId, event_type: "job_updated", object_id: `${TEST_PREFIX}-job-2` } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:updated`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const inboundDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const inboundDeliv = inboundDeliveries[0];
      track(
        "2. Job Updated — inbound routing",
        pubResult.success && !pubResult.duplicate && inboundDeliv?.delivery_status === "completed",
        "success, inbound delivery completed",
        `success=${pubResult.success}, duplicate=${pubResult.duplicate}, inbound=${inboundDeliv?.delivery_status}`
      );
    }

    // ── 3. Job Deleted — inbound routing ──
    {
      const evtId = `${TEST_PREFIX}-job-deleted-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.deleted",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-3`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-3` }, webhook_event: { id: evtId, event_type: "job_deleted", object_id: `${TEST_PREFIX}-job-3` } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:deleted`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const inboundDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const inboundDeliv = inboundDeliveries[0];
      track(
        "3. Job Deleted — inbound routing",
        pubResult.success && !pubResult.duplicate && inboundDeliv?.delivery_status === "completed",
        "success, inbound delivery completed",
        `success=${pubResult.success}, duplicate=${pubResult.duplicate}, inbound=${inboundDeliv?.delivery_status}`
      );
    }

    // ── 4. Job Restored — inbound routing ──
    {
      const evtId = `${TEST_PREFIX}-job-restored-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.restored",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-4`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-4` }, webhook_event: { id: evtId, event_type: "job_restored", object_id: `${TEST_PREFIX}-job-4` } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:restored`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const inboundDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const inboundDeliv = inboundDeliveries[0];
      track(
        "4. Job Restored — inbound routing",
        pubResult.success && !pubResult.duplicate && inboundDeliv?.delivery_status === "completed",
        "success, inbound delivery completed",
        `success=${pubResult.success}, duplicate=${pubResult.duplicate}, inbound=${inboundDeliv?.delivery_status}`
      );
    }

    // ── 5. Inbound idempotency ──
    {
      const evtId = `${TEST_PREFIX}-job-idem-1`;
      const idemKey = `servicetitan:${evtId}:created`;
      const pub1 = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-idem`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-idem`, job_number: "JOB-IDEM" }, webhook_event: { id: evtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: idemKey,
      });
      const pub2 = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-idem`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-idem`, job_number: "JOB-IDEM" }, webhook_event: { id: evtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: idemKey,
      });
      track(
        "5. Inbound idempotency — replay returns duplicate",
        pub1.success && pub2.success && pub2.duplicate === true,
        "first success, second duplicate=true",
        `pub1.success=${pub1.success}, pub2.success=${pub2.success}, duplicate=${pub2.duplicate}`
      );
    }

    // ── 6. Loop prevention — inbound ignores lvc_os ──
    {
      const pubResult = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-lp1`,
        source_system: "lvc_os",
        payload: { job_id: `${TEST_PREFIX}-job-lp1`, job_type: "inspection" },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${TEST_PREFIX}-job-lp1:created:1`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let parsed: any = {};
      try { parsed = deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch {}
      track(
        "6. Loop prevention — inbound subscriber skips lvc_os events",
        deliv?.delivery_status === "completed" && parsed.skipped === true,
        "inbound delivery completed + skipped=true",
        `status=${deliv?.delivery_status}, skipped=${parsed.skipped}, reason=${parsed.reason}`
      );
    }

    // ── 7. Loop prevention — outbound ignores servicetitan ──
    {
      const pubResult = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-lp2`,
        source_system: "servicetitan",
        source_event_id: `${TEST_PREFIX}-lp2`,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-lp2` }, webhook_event: { id: `${TEST_PREFIX}-lp2` } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true, mock_st_api: true },
        actor,
        idempotency_key: `servicetitan:${TEST_PREFIX}-lp2:created`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let parsed: any = {};
      try { parsed = deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch {}
      track(
        "7. Loop prevention — outbound subscriber skips servicetitan events",
        deliv?.delivery_status === "completed" && parsed.skipped === true,
        "outbound delivery completed + skipped=true",
        `status=${deliv?.delivery_status}, skipped=${parsed.skipped}, reason=${parsed.reason}`
      );
    }

    // ── 8. Outbound mock push with TWO_WAY policy ──
    {
      await upgradeJobPolicyToTwoWay(base44, actor);
      const pubResult = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-out1`,
        source_system: "lvc_os",
        payload: {
          job_id: `${TEST_PREFIX}-job-out1`,
          job_type: "inspection",
          priority: "high",
          address: "123 Test St",
          city: "Testville",
          notes: "Outbound test job",
        },
        metadata: { validation_run_id: VR_ID,mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${TEST_PREFIX}-job-out1:updated:1`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let parsed: any = {};
      try { parsed = deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch {}
      track(
        "8. Outbound mock push — processes with TWO_WAY policy",
        deliv?.delivery_status === "completed" && parsed.success !== false && parsed.action !== undefined && parsed.mock === true,
        "outbound completed, action set, mock=true",
        `status=${deliv?.delivery_status}, action=${parsed.action}, mock=${parsed.mock}, permitted=${JSON.stringify(parsed.permitted_fields)}`
      );
    }

    // ── 9. Field authority filtering ──
    {
      const faResult = await createFieldAuthority(base44, {
        entity_type: "Job",
        field_name: "priority",
        write_authority: "EXTERNAL_SYSTEM",
        external_system: "servicetitan",
        notes: `Stage 2C test — ${TEST_PREFIX}`,
        created_by: actor,
      });
      let faId: string | null = null;
      if (faResult.success && faResult.authority) faId = faResult.authority.id;

      const pubResult = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-out2`,
        source_system: "lvc_os",
        payload: {
          job_id: `${TEST_PREFIX}-job-out2`,
          job_type: "repair",
          priority: "high",
        },
        metadata: { validation_run_id: VR_ID,mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${TEST_PREFIX}-job-out2:updated:1`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let parsed: any = {};
      try { parsed = deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch {}
      track(
        "9. Field authority — EXTERNAL_SYSTEM field 'priority' skipped in outbound push",
        parsed.skipped_fields?.includes("priority") && !parsed.permitted_fields?.includes("priority"),
        "priority in skipped_fields, not in permitted_fields",
        `permitted=${JSON.stringify(parsed.permitted_fields)}, skipped=${JSON.stringify(parsed.skipped_fields)}`
      );

      if (faId) await deactivateFieldAuthority(base44, faId);
    }

    // ── 10. Policy mode guard — EXTERNAL_TO_LVC blocks outbound ──
    {
      const current = await getEffectivePolicy(base44, "Job", "servicetitan");
      if (current && current.sync_mode !== "EXTERNAL_TO_LVC") {
        await versionPolicy(base44, current.id, {
          sync_mode: "EXTERNAL_TO_LVC",
          conflict_resolution_strategy: "FIELD_LEVEL_RULES",
          sync_enabled: true,
          notes: `Stage 2C test — temporary EXTERNAL_TO_LVC (${TEST_PREFIX})`,
        }, actor);
      }

      const pubResult = await publishEvent(base44, {
        event_type: "job.updated",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-guard`,
        source_system: "lvc_os",
        payload: { job_id: `${TEST_PREFIX}-job-guard`, job_type: "inspection" },
        metadata: { validation_run_id: VR_ID,mock_st_api: true },
        actor,
        idempotency_key: `lvc_os:${TEST_PREFIX}-job-guard:updated:1`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Outbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let parsed: any = {};
      try { parsed = deliv?.output_metadata ? JSON.parse(deliv.output_metadata) : {}; } catch {}
      track(
        "10. Policy guard — EXTERNAL_TO_LVC blocks outbound push",
        parsed.skipped === true && parsed.reason === "mode_not_permitted",
        "skipped=true, reason=mode_not_permitted",
        `skipped=${parsed.skipped}, reason=${parsed.reason}, policy_mode=${parsed.policy_mode}`
      );

      // Restore to TWO_WAY
      await upgradeJobPolicyToTwoWay(base44, actor);
    }

    // ── 11. Shadow state — activate, verify mode + metrics reset ──
    {
      await activateShadow(base44, "Job", "servicetitan", 50, actor);
      const state = await getMigrationState(base44, "Job", "servicetitan");
      track(
        "11. Shadow state — activate, mode=shadow, metrics reset",
        state?.mode === "shadow" && state.shadow_clean_count === 0 && state.total_events === 0 && state.auto_cut_enabled === false,
        "mode=shadow, clean_count=0, total_events=0, auto_cut_enabled=false",
        `mode=${state?.mode}, clean_count=${state?.shadow_clean_count}, total_events=${state?.total_events}, auto_cut=${state?.auto_cut_enabled}`
      );
    }

    // ── 12. Manual cut-over (NOT auto-cut) ──
    {
      await activateShadow(base44, "Job", "servicetitan", 2, actor);

      for (let i = 1; i <= 3; i++) {
        const evtId = `${TEST_PREFIX}-job-mc-${i}`;
        const mcPub = await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: `${TEST_PREFIX}-job-mc${i}`,
          source_system: "servicetitan",
          source_event_id: evtId,
          payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-mc${i}`, job_number: `MC-${i}` }, webhook_event: { id: evtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: `servicetitan:${evtId}:created`,
        });
        await processEventDeliveries(base44, mcPub.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      const stateBeforeCut = await getMigrationState(base44, "Job", "servicetitan");
      const noAutoCut = stateBeforeCut?.mode === "shadow";
      const metricsRecorded = (stateBeforeCut?.total_events || 0) >= 3;

      await forceCutOver(base44, "Job", "servicetitan", actor);
      const stateAfterCut = await getMigrationState(base44, "Job", "servicetitan");

      track(
        "12. Manual cut-over — shadow collects metrics, NO auto-cut, manual cut_over works",
        noAutoCut && metricsRecorded && stateAfterCut?.mode === "cut_over",
        "no auto-cut after threshold, manual cut_over succeeds",
        `before_cut: mode=${stateBeforeCut?.mode}, total_events=${stateBeforeCut?.total_events}; after_cut: mode=${stateAfterCut?.mode}, cut_over_at=${stateAfterCut?.cut_over_at}`
      );
    }

    // ── 13. Rollback — cut_over → shadow ──
    {
      await rollbackMigration(base44, "Job", "servicetitan", actor);
      const state = await getMigrationState(base44, "Job", "servicetitan");
      track(
        "13. Rollback — cut_over → shadow",
        state?.mode === "shadow" && state.shadow_clean_count === 0,
        "mode=shadow, clean_count reset to 0",
        `mode=${state?.mode}, clean_count=${state?.shadow_clean_count}, rolled_back_at=${state?.rolled_back_at}`
      );
    }

    // ── 14. Duplicate webhook processing — no duplicate Jobs ──
    {
      const evtId = `${TEST_PREFIX}-job-dup-1`;
      const idemKey = `servicetitan:${evtId}:created`;
      const pubResults: any[] = [];
      for (let i = 0; i < 3; i++) {
        pubResults.push(await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: `${TEST_PREFIX}-job-dup`,
          source_system: "servicetitan",
          source_event_id: evtId,
          payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-dup`, job_number: "DUP" }, webhook_event: { id: evtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: idemKey,
        }));
      }
      await processEventDeliveries(base44, pubResults[0].business_event_id, VR_ID, VR_TOKEN, actor);
      const events = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: idemKey },
        null, 10
      );
      track(
        "14. Duplicate webhook processing — no duplicate events",
        pubResults.filter((r: any) => r.duplicate).length === 2 && events.length === 1,
        "2 duplicates returned, 1 event",
        `duplicates=${pubResults.filter((r: any) => r.duplicate).length}, events=${events.length}`
      );
    }

    // ── 15. Replay processing ──
    {
      const evtId = `${TEST_PREFIX}-job-replay-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-replay`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-replay`, job_number: "REPLAY" }, webhook_event: { id: evtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:created`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);

      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id, subscriber_name: { $regex: "Job Inbound" } },
        null, 1
      );
      const deliv = deliveries[0];
      let replayResult: any = null;
      if (deliv) {
        replayResult = await replayDelivery(base44, deliv.delivery_id, actor);
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      const events = await base44.asServiceRole.entities.BusinessEvent.filter(
        { idempotency_key: `servicetitan:${evtId}:created` },
        null, 10
      );

      track(
        "15. Replay processing — replayed event doesn't create duplicate events",
        events.length === 1 && (deliv?.replay_count >= 1 || replayResult?.success === true),
        "1 event, delivery replay_count >= 1",
        `events=${events.length}, replay_count=${deliv?.replay_count}, replay_success=${replayResult?.success}`
      );
    }

    // ── 16. Concurrent processing — no race conditions ──
    {
      const promises: Promise<any>[] = [];
      for (let i = 1; i <= 5; i++) {
        const evtId = `${TEST_PREFIX}-job-conc-${i}`;
        promises.push(publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: `${TEST_PREFIX}-job-conc${i}`,
          source_system: "servicetitan",
          source_event_id: evtId,
          payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-conc${i}`, job_number: `CONC-${i}` }, webhook_event: { id: evtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: `servicetitan:${evtId}:created`,
        }));
      }
      const pubResults = await Promise.all(promises);
      for (const pr of pubResults) {
        await processEventDeliveries(base44, pr.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      const allSucceeded = pubResults.every((r: any) => r.success);
      const allUnique = pubResults.filter((r: any) => !r.duplicate).length === 5;
      const distinctEventIds = new Set(pubResults.map((r: any) => r.business_event_id)).size;

      track(
        "16. Concurrent processing — no race conditions",
        allSucceeded && allUnique && distinctEventIds === 5,
        "all 5 events published, all unique, 5 distinct event IDs",
        `succeeded=${allSucceeded}, unique=${allUnique}, distinct_ids=${distinctEventIds}`
      );
    }

    // ── 17. Retry recovery — all deliveries reach terminal state ──
    {
      const evtId = `${TEST_PREFIX}-job-retry-1`;
      const pubResult = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-retry`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-retry`, job_number: "RETRY" }, webhook_event: { id: evtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:created`,
      });
      await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);

      const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
        { business_event_id: pubResult.business_event_id },
        null, 10
      );
      const allCompleted = deliveries.every((d: any) => d.delivery_status === "completed" || d.delivery_status === "dead_letter");

      track(
        "17. Retry recovery — all deliveries reach terminal state",
        allCompleted,
        "all deliveries completed or dead-lettered",
        `deliveries=${deliveries.map((d: any) => d.delivery_status).join(",")}`
      );
    }

    // ── 18. Dead-letter replay (deterministic — creates its own dead-letter) ──
    //
    // Creates a test event type + subscriber using the
    // test.echo.succeed.on.replay.s2c handler. The handler fails retryable on
    // the initial attempt (max_attempts=1 → dead_letter), then succeeds when
    // replayed (isReplay=true).
    //
    // Verifies:
    //   - Delivery reaches dead_letter through the real delivery lifecycle
    //   - replayDelivery succeeds
    //   - replay_count increments exactly once
    //   - Delivery reaches completed
    //   - completed_at is populated
    //   - Claim/lease fields are released (processing_claim_id, processing_started_at)
    //   - last_error is cleared
    //   - Handler runs exactly once for initial + exactly once for replay
    //   - A second replay does not create duplicate business effects
    {
      const testEvtType = `${TEST_PREFIX}.dlq.replay`;
      const NOW_DL = new Date().toISOString();
      const createdTestIds: string[] = [];

      try {
        // Create test event registry (allows_replay=true)
        await base44.asServiceRole.entities.EventRegistry.create({
          event_type: testEvtType,
          display_name: testEvtType,
          description: "Stage 2C Test 18 — dead-letter replay",
          category: "lifecycle",
          entity_type: "TestEntity",
          current_version: 1,
          schema_definition: "",
          is_active: true,
          allows_replay: true,
          default_processing_mode: "asynchronous",
          default_retry_policy: "bounded",
          activation_date: NOW_DL,
          created_by: actor,
        });

        // Create test subscriber: max_attempts=1, asynchronous, succeed-on-replay handler
        const testSub = await base44.asServiceRole.entities.EventSubscriber.create({
          subscriber_id: `SUB-${TEST_PREFIX}-DLREPLAY`,
          subscriber_name: `Test Dead-Letter Replay (${TEST_PREFIX})`,
          event_type: testEvtType,
          handler_reference: "test.echo.succeed.on.replay.s2c",
          processing_mode: "asynchronous",
          priority: 1,
          is_active: true,
          retry_policy: "bounded",
          maximum_attempts: 1,
          timeout_seconds: 30,
          activation_date: NOW_DL,
          created_by: actor,
        });
        createdTestIds.push(testSub.id);

        // Publish test event
        testReplayCallLog.length = 0;
        const pubResult = await publishEvent(base44, {
          event_type: testEvtType,
          entity_type: "TestEntity",
          entity_id: `${TEST_PREFIX}-dlq-1`,
          source_system: "lvc_os",
          payload: { test: "dead-letter replay" },
          metadata: { validation_run_id: VR_ID },
          actor,
        });
        if (pubResult.business_event_id) createdTestIds.push(pubResult.business_event_id);

        // Get delivery — should be pending
        const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
          { business_event_id: pubResult.business_event_id, subscriber_id: testSub.id },
          null, 1
        );
        const deliveryBeforeProcess = deliveries[0];

        // Process the delivery → handler fails retryable → dead_letter (max_attempts=1)
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);

        // Fetch delivery after processing
        const dlDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
          { business_event_id: pubResult.business_event_id, subscriber_id: testSub.id },
          null, 1
        );
        const dlDelivery = dlDeliveries[0];

        const beforeReplayStatus = dlDelivery?.delivery_status;
        const beforeReplayAttempts = dlDelivery?.processing_attempts;
        const beforeReplayReplayCount = dlDelivery?.replay_count;
        const beforeReplayError = dlDelivery?.last_error;
        const beforeReplayDeadLetteredAt = dlDelivery?.dead_lettered_at;
        const initialCallCount = testReplayCallLog.filter((c) => c.includes(":initial")).length;
        const replayCallCountBefore = testReplayCallLog.filter((c) => c.includes(":replay")).length;

        const deadLettered = beforeReplayStatus === "dead_letter";

        // Now replay the dead-lettered delivery
        const replayResult = await replayDelivery(base44, dlDelivery.delivery_id, actor);
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);

        // Fetch delivery after replay
        const afterDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
          { business_event_id: pubResult.business_event_id, subscriber_id: testSub.id },
          null, 1
        );
        const afterDelivery = afterDeliveries[0];

        const afterReplayStatus = afterDelivery?.delivery_status;
        const afterReplayAttempts = afterDelivery?.processing_attempts;
        const afterReplayReplayCount = afterDelivery?.replay_count;
        const afterReplayCompletedAt = afterDelivery?.completed_at;
        const afterReplayError = afterDelivery?.last_error;
        const afterReplayClaimId = afterDelivery?.processing_claim_id;
        const afterReplayStartedAt = afterDelivery?.processing_started_at;
        const replayCallCountAfter = testReplayCallLog.filter((c) => c.includes(":replay")).length;

        // Second replay — should succeed again but not create duplicate business effects
        const replay2Result = await replayDelivery(base44, dlDelivery.delivery_id, actor);
        await processEventDeliveries(base44, pubResult.business_event_id, VR_ID, VR_TOKEN, actor);

        const afterReplay2Deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
          { business_event_id: pubResult.business_event_id, subscriber_id: testSub.id },
          null, 1
        );
        const afterReplay2Delivery = afterReplay2Deliveries[0];
        const afterReplay2ReplayCount = afterReplay2Delivery?.replay_count;
        const totalHandlerCalls = testReplayCallLog.length;

        // Second replay invariants: a completed delivery must NOT be replayed again.
        const replay2Skipped = replay2Result?.skipped === true;
        const replay2NoReplayCountChange = afterReplay2ReplayCount === afterReplayReplayCount;
        const replay2NoHandlerCall = testReplayCallLog.length === totalHandlerCalls; // total calls unchanged
        const replay2NoAttemptsChange = afterReplay2Delivery?.processing_attempts === afterReplayAttempts;
        const replay2CompletedAtUnchanged = afterReplay2Delivery?.completed_at === afterReplayCompletedAt;

        track(
          "18. Dead-letter replay — deterministic: dead_letter→replay→completed, 2nd replay rejected",
          deadLettered &&
          beforeReplayAttempts === 1 &&
          beforeReplayReplayCount === 0 &&
          replayResult?.success === true &&
          afterReplayStatus === "completed" &&
          afterReplayReplayCount === 1 &&
          !!afterReplayCompletedAt &&
          !afterReplayClaimId &&
          !afterReplayStartedAt &&
          !afterReplayError &&
          initialCallCount === 1 &&
          replayCallCountAfter === 1 &&
          // Second replay invariants
          replay2Skipped &&
          replay2NoReplayCountChange &&
          replay2NoHandlerCall &&
          replay2NoAttemptsChange &&
          replay2CompletedAtUnchanged,
          "dead_letter(1 attempt, 0 replays)→replay→completed(1 replay, completed_at set, claim released, error cleared, handler 1+1 calls); 2nd replay: skipped=true, no count/attempts/handler/completed_at change",
          `before: status=${beforeReplayStatus}, attempts=${beforeReplayAttempts}, replays=${beforeReplayReplayCount}, error=${!!beforeReplayError}, dl_at=${!!beforeReplayDeadLetteredAt}; after: status=${afterReplayStatus}, attempts=${afterReplayAttempts}, replays=${afterReplayReplayCount}, completed_at=${!!afterReplayCompletedAt}, claim=${!!afterReplayClaimId}, error=${!!afterReplayError}; calls: initial=${initialCallCount}, replay=${replayCallCountAfter}; 2nd_replay: skipped=${replay2Skipped}, replays=${afterReplay2ReplayCount}, attempts=${afterReplay2Delivery?.processing_attempts}, completed_at_unchanged=${replay2CompletedAtUnchanged}, total_calls=${totalHandlerCalls}`
        );
      } finally {
        // Clean up test-owned records only
        for (const id of createdTestIds) {
          // Delete deliveries for this event
          try {
            const delivs = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
              { business_event_id: id }, null, 50
            );
            for (const d of delivs) {
              try { await base44.asServiceRole.entities.BusinessEventDelivery.delete(d.id); } catch {}
            }
          } catch {}
          // Try as event
          try { await base44.asServiceRole.entities.BusinessEvent.delete(id); } catch {}
          // Try as subscriber
          try { await base44.asServiceRole.entities.EventSubscriber.delete(id); } catch {}
        }
        // Clean up test registry
        try {
          const testRegs = await base44.asServiceRole.entities.EventRegistry.filter(
            { event_type: testEvtType }, null, 5
          );
          for (const r of testRegs) {
            try { await base44.asServiceRole.entities.EventRegistry.delete(r.id); } catch {}
          }
        } catch {}
      }
    }

    // ── 19. Shadow metrics validation ──
    {
      await activateShadow(base44, "Job", "servicetitan", 50, actor);

      const evtId = `${TEST_PREFIX}-job-metrics-1`;
      const metricsPub = await publishEvent(base44, {
        event_type: "job.created",
        entity_type: "Job",
        entity_id: `${TEST_PREFIX}-job-metrics`,
        source_system: "servicetitan",
        source_event_id: evtId,
        payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-metrics`, job_number: "METRICS" }, webhook_event: { id: evtId } },
        metadata: { validation_run_id: VR_ID,test_skip_sync: true },
        actor,
        idempotency_key: `servicetitan:${evtId}:created`,
      });
      await processEventDeliveries(base44, metricsPub.business_event_id, VR_ID, VR_TOKEN, actor);

      const state = await getMigrationState(base44, "Job", "servicetitan");
      const metrics = getShadowMetricsSummary(state);

      track(
        "19. Shadow metrics validation — metrics recorded correctly",
        (state?.total_events || 0) >= 1 && (state?.successful_events || 0) >= 1 &&
        (state?.shadow_processing_count || 0) >= 1 && (state?.shadow_total_duration_ms || 0) >= 0 &&
        metrics?.recent_activity?.length >= 1,
        "total_events>=1, successful>=1, processing_count>=1, recent_activity present",
        `total=${state?.total_events}, successful=${state?.successful_events}, count=${state?.shadow_processing_count}, duration=${state?.shadow_total_duration_ms}, recent=${metrics?.recent_activity?.length}`
      );
    }

    // ── 20. Migration state — ready_for_cutover computed, never auto-triggers ──
    {
      await activateShadow(base44, "Job", "servicetitan", 1, actor);

      for (let i = 1; i <= 2; i++) {
        const evtId = `${TEST_PREFIX}-job-ready-${i}`;
        const readyPub = await publishEvent(base44, {
          event_type: "job.created",
          entity_type: "Job",
          entity_id: `${TEST_PREFIX}-job-ready${i}`,
          source_system: "servicetitan",
          source_event_id: evtId,
          payload: { webhook_payload: { job_id: `${TEST_PREFIX}-job-ready${i}`, job_number: `READY-${i}` }, webhook_event: { id: evtId } },
          metadata: { validation_run_id: VR_ID,test_skip_sync: true },
          actor,
          idempotency_key: `servicetitan:${evtId}:created`,
        });
        await processEventDeliveries(base44, readyPub.business_event_id, VR_ID, VR_TOKEN, actor);
      }

      const state = await getMigrationState(base44, "Job", "servicetitan");
      const stillShadow = state?.mode === "shadow";
      const readyComputed = state?.ready_for_cutover === true;

      track(
        "20. Migration state — ready_for_cutover computed but NO auto-cut",
        stillShadow && readyComputed,
        "mode=shadow (no auto-cut), ready_for_cutover=true",
        `mode=${state?.mode}, ready_for_cutover=${state?.ready_for_cutover}, clean_count=${state?.shadow_clean_count}, threshold=${state?.shadow_threshold}`
      );

      // Restore shadow with default threshold
      await activateShadow(base44, "Job", "servicetitan", 50, actor);
    }

    // ── Cleanup ──
    // No global drain — each test processes its own exact deliveries.
    // Restore Job policy to EXTERNAL_TO_LVC (also in finally for exception safety)
    await restoreJobPolicy(base44, actor);

    return Response.json({
      stage: "Stage 2C — Job Migration Validation",
      test_prefix: TEST_PREFIX,
      executed_at: new Date().toISOString(),
      ...tracker.getSummary(),
    });
  } catch (error) {
    // Best-effort policy restoration on failure
    if (base44) {
      try { await restoreJobPolicy(base44, actor); } catch (e) { console.error("[STAGE 2C] Policy restore on failure:", e); }
    }
    console.error("[VALIDATE STAGE 2C ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    // Invalidate validation run
    if (base44 && VR_ID) {
      try { await completeValidationRun(base44, VR_ID, "completed"); } catch { /* non-critical */ }
    }
    // Ensure production policy is EXTERNAL_TO_LVC even on success or failure
    if (base44) {
      try { await restoreJobPolicy(base44, actor); } catch (e) { console.error("[STAGE 2C] Policy restore in finally:", e); }
    }
  }
});

/**
 * Ensure EventRegistry + EventSubscriber records exist for Job events.
 * Uses shared validation harness utilities.
 */
async function ensurePrerequisites(base44: any, actor: string): Promise<void> {
  const eventTypes = [
    { event_type: "job.created", display_name: "Job Created", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.updated", display_name: "Job Updated", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.deleted", display_name: "Job Deleted", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.restored", display_name: "Job Restored", category: "lifecycle", entity_type: "Job" },
  ];
  await ensureEventRegistry(base44, actor, eventTypes);

  const subscribers = [
    { subscriber_id: "SUB-2C-JOB-IN-CREATED", subscriber_name: "Job Inbound Sync (created)", event_type: "job.created", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-UPDATED", subscriber_name: "Job Inbound Sync (updated)", event_type: "job.updated", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-DELETED", subscriber_name: "Job Inbound Sync (deleted)", event_type: "job.deleted", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-IN-RESTORED", subscriber_name: "Job Inbound Sync (restored)", event_type: "job.restored", handler_reference: "job.sync.inbound", processing_mode: "synchronous", priority: 10 },
    { subscriber_id: "SUB-2C-JOB-OUT-CREATED", subscriber_name: "Job Outbound Push (created)", event_type: "job.created", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
    { subscriber_id: "SUB-2C-JOB-OUT-UPDATED", subscriber_name: "Job Outbound Push (updated)", event_type: "job.updated", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
    { subscriber_id: "SUB-2C-JOB-OUT-DELETED", subscriber_name: "Job Outbound Push (deleted)", event_type: "job.deleted", handler_reference: "job.sync.outbound", processing_mode: "asynchronous", priority: 20 },
  ];
  await ensureEventSubscribers(base44, actor, subscribers);
}

/**
 * Upgrade the Job:servicetitan integration to TWO_WAY for outbound tests.
 */
async function upgradeJobPolicyToTwoWay(base44: any, actor: string): Promise<void> {
  try {
    await registerCapability(base44, {
      external_system: "servicetitan",
      entity_type: "Job",
      direction: "LVC_TO_EXTERNAL",
      capability: "API_PUSH",
      is_supported: true,
      implementation_status: "implemented",
      api_version: "jpm/v2",
      limitations: "Outbound push implemented in Stage 2C. Requires OAuth write scope.",
      created_by: actor,
    });
  } catch { /* may already exist */ }

  try {
    const current = await getEffectivePolicy(base44, "Job", "servicetitan");
    if (current && current.sync_mode !== "TWO_WAY") {
      await versionPolicy(base44, current.id, {
        sync_mode: "TWO_WAY",
        conflict_resolution_strategy: "FIELD_LEVEL_RULES",
        sync_enabled: true,
        notes: `Upgraded to TWO_WAY for Stage 2C validation by ${actor}`,
      }, actor);
    }
  } catch { /* ignore */ }
}

/**
 * Restore Job policy to EXTERNAL_TO_LVC for production.
 */
async function restoreJobPolicy(base44: any, actor: string): Promise<void> {
  try {
    const current = await getEffectivePolicy(base44, "Job", "servicetitan");
    if (current && current.sync_mode !== "EXTERNAL_TO_LVC") {
      await versionPolicy(base44, current.id, {
        sync_mode: "EXTERNAL_TO_LVC",
        conflict_resolution_strategy: "FIELD_LEVEL_RULES",
        sync_enabled: true,
        notes: `Restored to EXTERNAL_TO_LVC for production by ${actor} (Stage 2C validation complete)`,
      }, actor);
    }
  } catch { /* ignore */ }
}