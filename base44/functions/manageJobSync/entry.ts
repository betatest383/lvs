import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import "../../shared/stage2c/jobSubscriberRegistration.ts";
import { publishJobChanged } from "../../shared/stage2c/jobEventPublisher.ts";
import {
  getMigrationState,
  activateShadow,
  forceCutOver,
  rollbackMigration,
} from "../../shared/stage2b/migrationStateService.ts";
import { verifyJobOutboundReadiness } from "../../shared/stage2c/jobOutboundApi.ts";
import {
  getEffectivePolicy,
  versionPolicy,
} from "../../shared/syncPolicy/syncPolicyService.ts";
import { registerCapability } from "../../shared/integration/integrationCapabilityService.ts";
import {
  getFullSyncStatus,
  getSyncDiagnostics,
} from "../../shared/stage2b/syncManagementUtils.ts";

/**
 * manageJobSync
 *
 * Admin-only operational function for Stage 2C Job Migration.
 *
 * Modes:
 *   seed_subscribers    — create EventSubscriber records (inbound + outbound)
 *   activate_shadow     — activate shadow mode for Job:servicetitan
 *   cut_over            — manually cut over to publish-only mode (Stage 2C: manual only)
 *   rollback            — revert from cut_over back to shadow
 *   get_status          — migration state + shadow metrics + subscriber health
 *   diagnostics         — operational diagnostics for production support
 *   readiness_report    — outbound readiness (OAuth scope, JPM endpoint, policy)
 *   upgrade_policy      — register LVC_TO_EXTERNAL capability + version policy to TWO_WAY
 *   publish_outbound    — publish a test outbound job event (source=lvc_os)
 *   reset_metrics       — reset all shadow metrics (keeps mode)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const mode = body.mode || "get_status";
    const actor = user.email || user.id || "admin";

    // ── Seed subscribers ──
    if (mode === "seed_subscribers") {
      const result = await seedSubscribers(base44, actor);
      return Response.json({ mode: "seed_subscribers", ...result });
    }

    // ── Activate shadow ──
    if (mode === "activate_shadow") {
      const threshold = body.shadow_threshold || 50;
      const state = await activateShadow(base44, "Job", "servicetitan", threshold, actor);
      return Response.json({
        mode: "activate_shadow",
        migration_key: state.migration_key,
        mode_state: state.mode,
        shadow_threshold: state.shadow_threshold,
        auto_cut_enabled: false,
        activated_at: state.activated_at,
        note: "Shadow mode activated. Manual approval required for cut-over (no automatic transition).",
      });
    }

    // ── Manual cut-over (Stage 2C: the ONLY way to enter cut_over) ──
    if (mode === "cut_over" || mode === "force_cut_over") {
      const state = await forceCutOver(base44, "Job", "servicetitan", actor);
      return Response.json({
        mode: "cut_over",
        migration_key: state.migration_key,
        mode_state: state.mode,
        cut_over_at: state.cut_over_at,
        note: "Manual cut-over activated. Job webhooks now publish-only; subscriber does the real sync.",
      });
    }

    // ── Rollback ──
    if (mode === "rollback") {
      const state = await rollbackMigration(base44, "Job", "servicetitan", actor);
      return Response.json({
        mode: "rollback",
        migration_key: state.migration_key,
        mode_state: state.mode,
        rolled_back_at: state.rolled_back_at,
        note: "Rolled back to shadow mode. Direct sync + event publish active.",
      });
    }

    // ── Get status ──
    if (mode === "get_status") {
      const status = await getFullStatus(base44);
      return Response.json({ mode: "get_status", ...status });
    }

    // ── Diagnostics ──
    if (mode === "diagnostics") {
      const diagnostics = await getDiagnostics(base44);
      return Response.json({ mode: "diagnostics", ...diagnostics });
    }

    // ── Readiness report ──
    if (mode === "readiness_report") {
      const report = await getReadinessReport(base44);
      return Response.json({ mode: "readiness_report", ...report });
    }

    // ── Upgrade policy ──
    if (mode === "upgrade_policy") {
      const result = await upgradePolicy(base44, actor);
      return Response.json({ mode: "upgrade_policy", ...result });
    }

    // ── Publish outbound test event ──
    if (mode === "publish_outbound") {
      const result = await publishJobChanged(
        base44,
        body.action || "updated",
        body.job_id || `test-${Date.now()}`,
        body.job_data || {},
        actor
      );
      return Response.json({ mode: "publish_outbound", ...result });
    }

    // ── Reset metrics ──
    if (mode === "reset_metrics") {
      const state = await getMigrationState(base44, "Job", "servicetitan");
      if (!state) {
        return Response.json({ error: "Migration state not found — activate shadow first" }, { status: 400 });
      }
      await base44.asServiceRole.entities.SyncMigrationState.update(state.id, {
        shadow_clean_count: 0,
        shadow_error_count: 0,
        total_events: 0,
        successful_events: 0,
        failed_events: 0,
        duplicate_events: 0,
        replay_events: 0,
        idempotent_events: 0,
        validation_failures: 0,
        last_success: null,
        last_failure: null,
        last_processed_at: null,
        ready_for_cutover: false,
        shadow_customer_located: 0,
        shadow_customer_created: 0,
        shadow_customer_updated: 0,
        shadow_job_located: 0,
        shadow_job_created: 0,
        shadow_job_updated: 0,
        shadow_job_deleted: 0,
        shadow_job_restored: 0,
        shadow_duplicate_ignored: 0,
        shadow_replay_ignored: 0,
        shadow_mapping_failure: 0,
        shadow_validation_failure: 0,
        shadow_idempotent_noop: 0,
        shadow_total_duration_ms: 0,
        shadow_processing_count: 0,
        recent_activity_json: "",
        notes: `Metrics reset by ${actor}`,
      });
      return Response.json({ mode: "reset_metrics", migration_key: state.migration_key, note: "All metrics reset. Mode unchanged." });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[MANAGE JOB SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Status, Diagnostics, Readiness
// ═══════════════════════════════════════════════════════════════════════════

async function getFullStatus(base44: any): Promise<any> {
  return await getFullSyncStatus(
    base44,
    "Job",
    "servicetitan",
    "job.sync.inbound",
    "job.sync.outbound",
    ["job.created", "job.updated", "job.deleted", "job.restored"]
  );
}

async function getDiagnostics(base44: any): Promise<any> {
  return await getSyncDiagnostics(
    base44,
    "Job",
    "servicetitan",
    "job.sync.inbound",
    "job.sync.outbound",
    ["job.created", "job.updated", "job.deleted", "job.restored"]
  );
}

async function getReadinessReport(base44: any): Promise<any> {
  const policy = await getEffectivePolicy(base44, "Job", "servicetitan");

  let oauthTokenValid = false;
  let jpmEndpointReachable = false;
  let readinessError: string | null = null;

  try {
    const readiness = await verifyJobOutboundReadiness();
    oauthTokenValid = readiness.token_valid;
    jpmEndpointReachable = readiness.endpoint_reachable;
    readinessError = readiness.error || null;
  } catch (err) {
    readinessError = err instanceof Error ? err.message : String(err);
  }

  // Check for previous 403 failures (scope insufficient)
  let scopeInsufficient = false;
  try {
    const failedDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { subscriber_name: { $regex: "Job Outbound" }, delivery_status: "dead_letter", last_error: { $regex: "403" } },
      "-created_date",
      1
    );
    scopeInsufficient = failedDeliveries.length > 0;
  } catch { /* ignore */ }

  const oauthWriteScopeVerified = oauthTokenValid && !scopeInsufficient;
  const readyForOutbound = oauthWriteScopeVerified && jpmEndpointReachable;

  return {
    oauth_token_valid: oauthTokenValid,
    oauth_write_scope_verified: oauthWriteScopeVerified,
    jpm_write_endpoint_verified: jpmEndpointReachable,
    scope_insufficient_errors: scopeInsufficient,
    ready_for_outbound: readyForOutbound,
    current_policy_mode: policy?.sync_mode || "none",
    production_policy_remains: policy?.sync_mode === "EXTERNAL_TO_LVC",
    error: readinessError,
    note: "Outbound sync remains disabled by policy (EXTERNAL_TO_LVC) until readiness is verified. Do NOT change production policy to TWO_WAY until ready_for_outbound=true.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Seed Subscribers
// ═══════════════════════════════════════════════════════════════════════════

async function seedSubscribers(base44: any, actor: string): Promise<any> {
  const now = new Date().toISOString();
  const subscribers = [
    {
      subscriber_id: "SUB-2C-JOB-IN-CREATED",
      subscriber_name: "Job Inbound Sync (created)",
      event_type: "job.created",
      handler_reference: "job.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2C-JOB-IN-UPDATED",
      subscriber_name: "Job Inbound Sync (updated)",
      event_type: "job.updated",
      handler_reference: "job.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2C-JOB-IN-DELETED",
      subscriber_name: "Job Inbound Sync (deleted)",
      event_type: "job.deleted",
      handler_reference: "job.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2C-JOB-IN-RESTORED",
      subscriber_name: "Job Inbound Sync (restored)",
      event_type: "job.restored",
      handler_reference: "job.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2C-JOB-OUT-CREATED",
      subscriber_name: "Job Outbound Push (created)",
      event_type: "job.created",
      handler_reference: "job.sync.outbound",
      processing_mode: "asynchronous",
      priority: 20,
    },
    {
      subscriber_id: "SUB-2C-JOB-OUT-UPDATED",
      subscriber_name: "Job Outbound Push (updated)",
      event_type: "job.updated",
      handler_reference: "job.sync.outbound",
      processing_mode: "asynchronous",
      priority: 20,
    },
    {
      subscriber_id: "SUB-2C-JOB-OUT-DELETED",
      subscriber_name: "Job Outbound Push (deleted)",
      event_type: "job.deleted",
      handler_reference: "job.sync.outbound",
      processing_mode: "asynchronous",
      priority: 20,
    },
  ];

  const created: string[] = [];
  const existing: string[] = [];
  for (const sub of subscribers) {
    try {
      const found = await base44.asServiceRole.entities.EventSubscriber.filter(
        { subscriber_id: sub.subscriber_id },
        null,
        1
      );
      if (found.length > 0) {
        existing.push(sub.subscriber_id);
        continue;
      }
      await base44.asServiceRole.entities.EventSubscriber.create({
        ...sub,
        is_active: true,
        retry_policy: "bounded",
        maximum_attempts: 5,
        timeout_seconds: 30,
        activation_date: now,
        created_by: actor,
      });
      created.push(sub.subscriber_id);
    } catch (err) {
      console.error("[SEED SUBSCRIBERS] failed:", sub.subscriber_id, err);
    }
  }

  // Also ensure EventRegistry entries exist
  await ensureEventRegistry(base44, actor);

  return { created, existing, total: subscribers.length };
}

async function ensureEventRegistry(base44: any, actor: string): Promise<void> {
  const now = new Date().toISOString();
  const eventTypes = [
    { event_type: "job.created", display_name: "Job Created", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.updated", display_name: "Job Updated", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.deleted", display_name: "Job Deleted", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.restored", display_name: "Job Restored", category: "lifecycle", entity_type: "Job" },
  ];

  for (const et of eventTypes) {
    try {
      const existing = await base44.asServiceRole.entities.EventRegistry.filter({ event_type: et.event_type }, null, 1);
      if (existing.length === 0) {
        await base44.asServiceRole.entities.EventRegistry.create({
          ...et,
          description: `Published when a Job is ${et.event_type.split(".")[1]}.`,
          current_version: 1,
          schema_definition: "",
          is_active: true,
          allows_replay: true,
          default_processing_mode: "asynchronous",
          default_retry_policy: "bounded",
          activation_date: now,
          created_by: actor,
        });
      }
    } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Upgrade Policy
// ═══════════════════════════════════════════════════════════════════════════

async function upgradePolicy(base44: any, actor: string): Promise<any> {
  const results: any = { capability: null, policy: null };

  // 1. Register LVC_TO_EXTERNAL API_PUSH as implemented
  try {
    results.capability = await registerCapability(base44, {
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
  } catch (err) {
    results.capability = { error: String(err) };
  }

  // 2. Version the policy to TWO_WAY
  try {
    const current = await getEffectivePolicy(base44, "Job", "servicetitan");
    if (!current) {
      results.policy = { error: "No active policy found — run manageBusinessEvent seed_baseline first" };
    } else if (current.sync_mode === "TWO_WAY") {
      results.policy = { skipped: true, reason: "Policy already TWO_WAY", version: current.version };
    } else {
      results.policy = await versionPolicy(base44, current.id, {
        sync_mode: "TWO_WAY",
        conflict_resolution_strategy: "FIELD_LEVEL_RULES",
        sync_enabled: true,
        notes: `Upgraded to TWO_WAY for Stage 2C outbound sync by ${actor}`,
      }, actor);
    }
  } catch (err) {
    results.policy = { error: String(err) };
  }

  return results;
}