import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { publishEvent, processNextDelivery, replayDelivery, getEventStatus } from "../../shared/businessEvent/businessEventEngine.ts";
import { registerSubscriberHandler } from "../../shared/businessEvent/subscriberHandlerRegistry.ts";
import { listActiveEventTypes } from "../../shared/businessEvent/eventRegistryService.ts";
import {
  createPolicy,
  deactivatePolicy,
  getEffectivePolicy,
  getPolicyHistory,
  versionPolicy,
} from "../../shared/syncPolicy/syncPolicyService.ts";
import {
  createFieldAuthority,
  resolveFieldAuthority,
  deactivateFieldAuthority,
} from "../../shared/syncPolicy/fieldAuthorityService.ts";
import { registerCapability, getCapabilitiesForSystem } from "../../shared/integration/integrationCapabilityService.ts";
import { registerAdapter, getAdapter, updateAdapterHealth } from "../../shared/integration/integrationAdapterService.ts";
import "../../shared/stage2b/customerSubscriberRegistration.ts";
import "../../shared/stage2c/jobSubscriberRegistration.ts";

/**
 * manageBusinessEvent
 *
 * Admin-only operational function for the Business Event Engine and the
 * governed integration Master Data (SyncPolicy, Field Authority, Capability
 * Registry, Adapter Registry).
 *
 * Modes:
 *   publish             — publish a test BusinessEvent
 *   process_next_delivery — claim + process one pending async delivery
 *   replay_delivery     — replay a dead-lettered delivery
 *   get_status          — read-only event + delivery summary
 *   list_registry       — list active event types
 *   seed_baseline       — seed verified baseline registry/policy/capability/adapter records
 *   create_policy       — create a SyncPolicy
 *   version_policy      — version an existing SyncPolicy
 *   deactivate_policy   — deactivate a SyncPolicy
 *   get_effective_policy — resolve the effective policy for a pair
 *   get_policy_history  — list policy version history
 *   create_field_authority — create a field-level write authority rule
 *   resolve_field_authority — resolve effective write authority for a field
 *   register_capability — register/update an integration capability
 *   list_capabilities   — list capabilities for a system
 *   register_adapter    — register/update an integration adapter
 *   get_adapter         — get the active adapter for a system
 *   update_adapter_health — update adapter health status
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
    const mode = body.mode || "list_registry";
    const actor = user.email || user.id || "admin";

    // ── Publish ──
    if (mode === "publish") {
      const result = await publishEvent(base44, {
        event_type: body.event_type,
        event_version: body.event_version,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        source_system: body.source_system || "lvc_os",
        source_event_id: body.source_event_id,
        correlation_id: body.correlation_id,
        causation_id: body.causation_id,
        tenant_id: body.tenant_id,
        occurred_at: body.occurred_at,
        payload: body.payload || {},
        metadata: body.metadata,
        actor,
        idempotency_key: body.idempotency_key,
        event_id: body.event_id,
      });
      return Response.json({ mode: "publish", ...result });
    }

    // ── Process next delivery ──
    if (mode === "process_next_delivery") {
      const result = await processNextDelivery(base44, { actor });
      return Response.json({ mode: "process_next_delivery", ...result });
    }

    // ── Replay delivery ──
    if (mode === "replay_delivery") {
      const result = await replayDelivery(base44, body.delivery_id, actor);
      return Response.json({ mode: "replay_delivery", ...result });
    }

    // ── Get status ──
    if (mode === "get_status") {
      const result = await getEventStatus(base44, body.business_event_id);
      return Response.json({ mode: "get_status", ...result });
    }

    // ── List registry ──
    if (mode === "list_registry") {
      const eventTypes = await listActiveEventTypes(base44);
      return Response.json({ mode: "list_registry", event_types: eventTypes });
    }

    // ── Seed baseline ──
    if (mode === "seed_baseline") {
      const result = await seedBaseline(base44, actor);
      return Response.json({ mode: "seed_baseline", ...result });
    }

    // ── SyncPolicy ──
    if (mode === "create_policy") {
      const result = await createPolicy(base44, {
        entity_type: body.entity_type,
        external_system: body.external_system,
        sync_enabled: body.sync_enabled,
        sync_mode: body.sync_mode,
        conflict_resolution_strategy: body.conflict_resolution_strategy,
        effective_from: body.effective_from,
        effective_to: body.effective_to,
        notes: body.notes,
        created_by: actor,
      });
      return Response.json({ mode: "create_policy", ...result });
    }

    if (mode === "version_policy") {
      const result = await versionPolicy(base44, body.policy_id, {
        sync_mode: body.sync_mode,
        conflict_resolution_strategy: body.conflict_resolution_strategy,
        sync_enabled: body.sync_enabled,
        notes: body.notes,
        effective_from: body.effective_from,
        effective_to: body.effective_to,
      }, actor);
      return Response.json({ mode: "version_policy", ...result });
    }

    if (mode === "deactivate_policy") {
      const result = await deactivatePolicy(base44, body.entity_type, body.external_system, actor);
      return Response.json({ mode: "deactivate_policy", ...result });
    }

    if (mode === "get_effective_policy") {
      const policy = await getEffectivePolicy(base44, body.entity_type, body.external_system);
      return Response.json({ mode: "get_effective_policy", policy });
    }

    if (mode === "get_policy_history") {
      const history = await getPolicyHistory(base44, body.entity_type, body.external_system);
      return Response.json({ mode: "get_policy_history", history });
    }

    // ── Field Authority ──
    if (mode === "create_field_authority") {
      const result = await createFieldAuthority(base44, {
        policy_id: body.policy_id,
        entity_type: body.entity_type,
        field_name: body.field_name,
        write_authority: body.write_authority,
        external_system: body.external_system,
        conflict_strategy_override: body.conflict_strategy_override,
        notes: body.notes,
        created_by: actor,
      });
      return Response.json({ mode: "create_field_authority", ...result });
    }

    if (mode === "resolve_field_authority") {
      const authority = await resolveFieldAuthority(
        base44,
        body.entity_type,
        body.field_name,
        body.external_system,
        body.policy_id
      );
      return Response.json({ mode: "resolve_field_authority", write_authority: authority });
    }

    if (mode === "deactivate_field_authority") {
      const result = await deactivateFieldAuthority(base44, body.authority_id);
      return Response.json({ mode: "deactivate_field_authority", ...result });
    }

    // ── Capability Registry ──
    if (mode === "register_capability") {
      const result = await registerCapability(base44, {
        external_system: body.external_system,
        entity_type: body.entity_type,
        direction: body.direction,
        capability: body.capability,
        is_supported: body.is_supported,
        implementation_status: body.implementation_status,
        api_version: body.api_version,
        limitations: body.limitations,
        created_by: actor,
      });
      return Response.json({ mode: "register_capability", ...result });
    }

    if (mode === "list_capabilities") {
      const capabilities = await getCapabilitiesForSystem(base44, body.external_system);
      return Response.json({ mode: "list_capabilities", capabilities });
    }

    // ── Adapter Registry ──
    if (mode === "register_adapter") {
      const result = await registerAdapter(base44, {
        external_system: body.external_system,
        adapter_name: body.adapter_name,
        adapter_version: body.adapter_version,
        adapter_type: body.adapter_type,
        handler_reference: body.handler_reference,
        auth_strategy: body.auth_strategy,
        supported_api_version: body.supported_api_version,
        notes: body.notes,
        created_by: actor,
      });
      return Response.json({ mode: "register_adapter", ...result });
    }

    if (mode === "get_adapter") {
      const adapter = await getAdapter(base44, body.external_system);
      return Response.json({ mode: "get_adapter", adapter });
    }

    if (mode === "update_adapter_health") {
      const result = await updateAdapterHealth(base44, body.adapter_id, body.health_status);
      return Response.json({ mode: "update_adapter_health", ...result });
    }

    return Response.json({ error: `Invalid mode '${mode}'` }, { status: 400 });
  } catch (error) {
    console.error("[MANAGE BUSINESS EVENT ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Seed verified baseline records:
 *   - EventRegistry: customer/job/appointment created+updated (NOT connected to sync)
 *   - IntegrationAdapterRegistry: ServiceTitan adapter
 *   - IntegrationCapabilityRegistry: verified ServiceTitan capabilities
 *   - SyncPolicy: default Two-Way for Customer/Job/Appointment vs ServiceTitan
 *
 * Only seeds records that do not already exist (idempotent). No existing
 * ServiceTitan behavior is changed.
 */
async function seedBaseline(base44: any, actor: string): Promise<any> {
  const now = new Date().toISOString();
  const results: any = { event_registry: [], adapter: null, capabilities: [], policies: [] };

  // ── Event Registry ──
  const eventTypes = [
    { event_type: "customer.created", display_name: "Customer Created", category: "lifecycle", entity_type: "Customer" },
    { event_type: "customer.updated", display_name: "Customer Updated", category: "lifecycle", entity_type: "Customer" },
    { event_type: "job.created", display_name: "Job Created", category: "lifecycle", entity_type: "Job" },
    { event_type: "job.updated", display_name: "Job Updated", category: "lifecycle", entity_type: "Job" },
    { event_type: "appointment.created", display_name: "Appointment Created", category: "lifecycle", entity_type: "Appointment" },
    { event_type: "appointment.updated", display_name: "Appointment Updated", category: "lifecycle", entity_type: "Appointment" },
  ];

  for (const et of eventTypes) {
    try {
      const existing = await base44.asServiceRole.entities.EventRegistry.filter(
        { event_type: et.event_type }, null, 1
      );
      if (existing.length === 0) {
        const created = await base44.asServiceRole.entities.EventRegistry.create({
          ...et,
          description: `Published when a ${et.entity_type} is ${et.event_type.split(".")[1]}. Not connected to existing sync (Stage 2A).`,
          current_version: 1,
          schema_definition: "",
          is_active: true,
          allows_replay: true,
          default_processing_mode: "asynchronous",
          default_retry_policy: "bounded",
          activation_date: now,
          created_by: actor,
        });
        results.event_registry.push(created.event_type);
      }
    } catch (err) {
      console.error("[SEED] event registry failed:", et.event_type, err);
    }
  }

  // ── Integration Adapter Registry ──
  try {
    const existingAdapter = await base44.asServiceRole.entities.IntegrationAdapterRegistry.filter(
      { external_system: "servicetitan", adapter_name: "ServiceTitan Integration Adapter" }, null, 1
    );
    if (existingAdapter.length === 0) {
      results.adapter = await base44.asServiceRole.entities.IntegrationAdapterRegistry.create({
        adapter_id: `IAR-${Date.now().toString(36)}`,
        external_system: "servicetitan",
        adapter_name: "ServiceTitan Integration Adapter",
        adapter_version: "1.0.0",
        adapter_type: "bidirectional",
        handler_reference: "base44/shared/stEventRouter",
        auth_strategy: "oauth_client_credentials",
        is_active: true,
        supported_api_version: "crm/v2, jpm/v2",
        health_status: "unknown",
        activation_date: now,
        created_by: actor,
        notes: "Adapter registration for the existing ServiceTitan integration. Not yet wired through the Business Event Engine (Stage 2B).",
      });
    } else {
      results.adapter = existingAdapter[0];
    }
  } catch (err) {
    console.error("[SEED] adapter failed:", err);
  }

  // ── Capability Registry (verified ServiceTitan capabilities only) ──
  const capabilities = [
    // Customer: webhook inbound + API pull — implemented
    { entity_type: "Customer", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "crm/v2", limitations: "" },
    { entity_type: "Customer", direction: "EXTERNAL_TO_LVC", capability: "API_PULL", is_supported: true, status: "implemented", api_version: "crm/v2", limitations: "Export endpoint uses continuation-token pagination" },
    { entity_type: "Customer", direction: "LVC_TO_EXTERNAL", capability: "API_PUSH", is_supported: false, status: "api_supported_not_implemented", api_version: "crm/v2", limitations: "CRM v2 create/update exists but not wired for outbound" },
    // Job: webhook inbound + API pull — implemented (write-mode verified Phase 5)
    { entity_type: "Job", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "jpm/v2", limitations: "" },
    { entity_type: "Job", direction: "EXTERNAL_TO_LVC", capability: "API_PULL", is_supported: true, status: "implemented", api_version: "jpm/v2", limitations: "Write-mode verified; production activation pending" },
    { entity_type: "Job", direction: "LVC_TO_EXTERNAL", capability: "API_PUSH", is_supported: false, status: "api_supported_not_implemented", api_version: "jpm/v2", limitations: "Outbound push not implemented" },
    // Appointment: webhook inbound + API pull — implemented
    { entity_type: "Appointment", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "jpm/v2", limitations: "" },
    { entity_type: "Appointment", direction: "EXTERNAL_TO_LVC", capability: "API_PULL", is_supported: true, status: "implemented", api_version: "jpm/v2", limitations: "" },
    { entity_type: "Appointment", direction: "LVC_TO_EXTERNAL", capability: "API_PUSH", is_supported: false, status: "api_supported_not_implemented", api_version: "jpm/v2", limitations: "Outbound push not implemented" },
    // Entities with webhook handlers only (no API pull verified)
    { entity_type: "Estimate", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "jpm/v2", limitations: "" },
    { entity_type: "Invoice", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "billing/v2", limitations: "" },
    { entity_type: "Payment", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "payments/v2", limitations: "" },
    { entity_type: "InventoryTransfer", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: true, status: "implemented", api_version: "procurement/v2", limitations: "" },
    // PurchaseOrder: API pull discovery only — not implemented
    { entity_type: "PurchaseOrder", direction: "EXTERNAL_TO_LVC", capability: "API_PULL", is_supported: false, status: "api_supported_not_implemented", api_version: "procurement/v2", limitations: "Read-only discovery verified; no writes" },
    // Unsupported
    { entity_type: "Warehouse", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: false, status: "unsupported", api_version: "", limitations: "ServiceTitan does not support warehouse management" },
    { entity_type: "Vendor", direction: "EXTERNAL_TO_LVC", capability: "WEBHOOK_INBOUND", is_supported: false, status: "unsupported", api_version: "", limitations: "No vendor webhook" },
  ];

  for (const cap of capabilities) {
    try {
      const result = await registerCapability(base44, {
        external_system: "servicetitan",
        entity_type: cap.entity_type,
        direction: cap.direction,
        capability: cap.capability,
        is_supported: cap.is_supported,
        implementation_status: cap.status,
        api_version: cap.api_version,
        limitations: cap.limitations,
        created_by: actor,
      });
      if (result.success) results.capabilities.push(`${cap.entity_type}:${cap.direction}:${cap.capability}`);
    } catch (err) {
      console.error("[SEED] capability failed:", cap, err);
    }
  }

  // ── SyncPolicy defaults (Two-Way) — NOT depended on by existing sync (Stage 2B) ──
  const policyPairs = [
    { entity_type: "Customer", external_system: "servicetitan" },
    { entity_type: "Job", external_system: "servicetitan" },
    { entity_type: "Appointment", external_system: "servicetitan" },
  ];
  for (const pair of policyPairs) {
    try {
      const existing = await getEffectivePolicy(base44, pair.entity_type, pair.external_system);
      if (!existing) {
        // Default to EXTERNAL_TO_LVC — the currently-supported direction.
        // The capability guard correctly blocks TWO_WAY until outbound sync
        // (LVC_TO_EXTERNAL) is implemented in Stage 2B. At that point this
        // policy can be versioned to TWO_WAY.
        const result = await createPolicy(base44, {
          entity_type: pair.entity_type,
          external_system: pair.external_system,
          sync_mode: "EXTERNAL_TO_LVC",
          conflict_resolution_strategy: "FIELD_LEVEL_RULES",
          notes: "Default baseline policy (EXTERNAL_TO_LVC — currently supported direction). Not yet connected to existing sync flows (Stage 2B). Will be upgraded to TWO_WAY when outbound sync is implemented.",
          created_by: actor,
        });
        if (result.success) results.policies.push(pair.entity_type);
      }
    } catch (err) {
      console.error("[SEED] policy failed:", pair, err);
    }
  }

  return {
    seeded_event_types: results.event_registry,
    adapter_seeded: !!results.adapter,
    capabilities_seeded: results.capabilities.length,
    policies_seeded: results.policies,
  };
}