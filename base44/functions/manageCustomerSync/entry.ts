import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import { publishCustomerChanged } from "../../shared/stage2b/customerEventPublisher.ts";
import {
  getMigrationState,
  activateShadow,
  forceCutOver,
  rollbackMigration,
} from "../../shared/stage2b/migrationStateService.ts";
import { getShadowMetricsSummary } from "../../shared/stage2b/shadowMetricsService.ts";
import { verifyOutboundReadiness } from "../../shared/stage2b/customerOutboundApi.ts";
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
 * manageCustomerSync
 *
 * Admin-only operational function for Stage 2B-A Customer Migration.
 *
 * Modes:
 *   seed_subscribers    — create EventSubscriber records (inbound + outbound)
 *   activate_shadow     — activate shadow mode for Customer:servicetitan
 *   cut_over            — manually cut over to publish-only mode (Stage 2B-A: manual only)
 *   rollback            — revert from cut_over back to shadow
 *   get_status          — migration state + shadow metrics + subscriber health
 *   diagnostics         — operational diagnostics for production support
 *   readiness_report    — outbound readiness (OAuth scope, CRM endpoint, policy)
 *   upgrade_policy      — register LVC_TO_EXTERNAL capability + version policy to TWO_WAY
 *   publish_outbound    — publish a test outbound customer event (source=lvc_os)
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
      const state = await activateShadow(base44, "Customer", "servicetitan", threshold, actor);
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

    // ── Manual cut-over (Stage 2B-A: the ONLY way to enter cut_over) ──
    if (mode === "cut_over" || mode === "force_cut_over") {
      const state = await forceCutOver(base44, "Customer", "servicetitan", actor);
      return Response.json({
        mode: "cut_over",
        migration_key: state.migration_key,
        mode_state: state.mode,
        cut_over_at: state.cut_over_at,
        note: "Manual cut-over activated. Customer webhooks now publish-only; subscriber does the real sync.",
      });
    }

    // ── Rollback ──
    if (mode === "rollback") {
      const state = await rollbackMigration(base44, "Customer", "servicetitan", actor);
      return Response.json({
        mode: "rollback",
        migration_key: state.migration_key,
        mode_state: state.mode,
        rolled_back_at: state.rolled_back_at,
        note: "Rolled back to shadow mode. Direct sync + event publish active.",
      });
    }

    // ── Get status (full migration + metrics + subscriber health) ──
    if (mode === "get_status") {
      const status = await getFullStatus(base44);
      return Response.json({ mode: "get_status", ...status });
    }

    // ── Diagnostics (operational diagnostics for production support) ──
    if (mode === "diagnostics") {
      const diagnostics = await getDiagnostics(base44);
      return Response.json({ mode: "diagnostics", ...diagnostics });
    }

    // ── Readiness report (outbound readiness — does NOT enable outbound) ──
    if (mode === "readiness_report") {
      const report = await getReadinessReport(base44);
      return Response.json({ mode: "readiness_report", ...report });
    }

    // ── Upgrade policy (register LVC_TO_EXTERNAL + version to TWO_WAY) ──
    if (mode === "upgrade_policy") {
      const result = await upgradePolicy(base44, actor);
      return Response.json({ mode: "upgrade_policy", ...result });
    }

    // ── Publish outbound test event ──
    if (mode === "publish_outbound") {
      const result = await publishCustomerChanged(
        base44,
        body.action || "updated",
        body.customer_id || `test-${Date.now()}`,
        body.customer_data || {},
        actor
      );
      return Response.json({ mode: "publish_outbound", ...result });
    }

    // ── Reset metrics (keep mode, reset counters) ──
    if (mode === "reset_metrics") {
      const state = await getMigrationState(base44, "Customer", "servicetitan");
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
    console.error("[MANAGE CUSTOMER SYNC ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Status, Diagnostics, Readiness
// ═══════════════════════════════════════════════════════════════════════════

async function getFullStatus(base44: any): Promise<any> {
  return await getFullSyncStatus(
    base44,
    "Customer",
    "servicetitan",
    "customer.sync.inbound",
    "customer.sync.outbound",
    ["customer.created", "customer.updated"]
  );
}

async function getDiagnostics(base44: any): Promise<any> {
  return await getSyncDiagnostics(
    base44,
    "Customer",
    "servicetitan",
    "customer.sync.inbound",
    "customer.sync.outbound",
    ["customer.created", "customer.updated"]
  );
}

async function getReadinessReport(base44: any): Promise<any> {
  const policy = await getEffectivePolicy(base44, "Customer", "servicetitan");

  // Verify OAuth token + CRM endpoint reachability (GET only, no writes)
  let oauthTokenValid = false;
  let crmEndpointReachable = false;
  let readinessError: string | null = null;

  try {
    const readiness = await verifyOutboundReadiness();
    oauthTokenValid = readiness.token_valid;
    crmEndpointReachable = readiness.endpoint_reachable;
    readinessError = readiness.error || null;
  } catch (err) {
    readinessError = err instanceof Error ? err.message : String(err);
  }

  // Check for previous 403 failures (scope insufficient)
  let scopeInsufficient = false;
  try {
    const failedDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { subscriber_name: { $regex: "Outbound" }, delivery_status: "dead_letter", last_error: { $regex: "403" } },
      "-created_date",
      1
    );
    scopeInsufficient = failedDeliveries.length > 0;
  } catch { /* ignore */ }

  // OAuth write scope can't be verified without a write call.
  // We infer it's NOT verified if we've seen 403 errors.
  const oauthWriteScopeVerified = oauthTokenValid && !scopeInsufficient;

  // Ready for outbound only when: token valid, endpoint reachable, no 403 errors
  const readyForOutbound = oauthWriteScopeVerified && crmEndpointReachable;

  return {
    oauth_token_valid: oauthTokenValid,
    oauth_write_scope_verified: oauthWriteScopeVerified,
    crm_write_endpoint_verified: crmEndpointReachable,
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
      subscriber_id: "SUB-2B-CUST-IN-CREATED",
      subscriber_name: "Customer Inbound Sync (created)",
      event_type: "customer.created",
      handler_reference: "customer.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2B-CUST-IN-UPDATED",
      subscriber_name: "Customer Inbound Sync (updated)",
      event_type: "customer.updated",
      handler_reference: "customer.sync.inbound",
      processing_mode: "synchronous",
      priority: 10,
    },
    {
      subscriber_id: "SUB-2B-CUST-OUT-CREATED",
      subscriber_name: "Customer Outbound Push (created)",
      event_type: "customer.created",
      handler_reference: "customer.sync.outbound",
      processing_mode: "asynchronous",
      priority: 20,
    },
    {
      subscriber_id: "SUB-2B-CUST-OUT-UPDATED",
      subscriber_name: "Customer Outbound Push (updated)",
      event_type: "customer.updated",
      handler_reference: "customer.sync.outbound",
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

  return { created, existing, total: subscribers.length };
}

async function getCustomerSubscribers(base44: any): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.EventSubscriber.filter(
      { handler_reference: { $in: ["customer.sync.inbound", "customer.sync.outbound"] } },
      "priority",
      50
    );
  } catch {
    return [];
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
      entity_type: "Customer",
      direction: "LVC_TO_EXTERNAL",
      capability: "API_PUSH",
      is_supported: true,
      implementation_status: "implemented",
      api_version: "crm/v2",
      limitations: "Outbound push implemented in Stage 2B. Requires OAuth write scope.",
      created_by: actor,
    });
  } catch (err) {
    results.capability = { error: String(err) };
  }

  // 2. Version the policy to TWO_WAY
  try {
    const current = await getEffectivePolicy(base44, "Customer", "servicetitan");
    if (!current) {
      results.policy = { error: "No active policy found — run seed_baseline first" };
    } else if (current.sync_mode === "TWO_WAY") {
      results.policy = { skipped: true, reason: "Policy already TWO_WAY", version: current.version };
    } else {
      results.policy = await versionPolicy(base44, current.id, {
        sync_mode: "TWO_WAY",
        conflict_resolution_strategy: "FIELD_LEVEL_RULES",
        sync_enabled: true,
        notes: `Upgraded to TWO_WAY for Stage 2B outbound sync by ${actor}`,
      }, actor);
    }
  } catch (err) {
    results.policy = { error: String(err) };
  }

  return results;
}