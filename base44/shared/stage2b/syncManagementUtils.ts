/**
 * Sync Management Utils (Stage 2B-A / 2C)
 *
 * Shared utility functions used by both manageCustomerSync and manageJobSync.
 * Extracted to avoid code duplication between entity-specific management functions.
 *
 * All functions are generic — they work for any entity type.
 */

import { getShadowMetricsSummary } from "./shadowMetricsService.ts";
import {
  getMigrationState,
} from "./migrationStateService.ts";

/**
 * Get delivery stats for a single subscriber.
 * Generic — works for any entity type.
 */
export async function getDeliveryStatsForSubscriber(base44: any, sub: any): Promise<any> {
  try {
    const deliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { subscriber_id: sub.id },
      "-created_date",
      200
    );

    const total = deliveries.length;
    const completed = deliveries.filter((d: any) => d.delivery_status === "completed").length;
    const failed = deliveries.filter((d: any) => d.delivery_status === "failed").length;
    const deadLettered = deliveries.filter((d: any) => d.delivery_status === "dead_letter").length;
    const pending = deliveries.filter((d: any) => d.delivery_status === "pending").length;
    const processing = deliveries.filter((d: any) => d.delivery_status === "processing").length;
    const replayCount = deliveries.reduce((sum: number, d: any) => sum + (d.replay_count || 0), 0);
    const successful = completed;
    const retrying = failed + pending;

    let totalDuration = 0;
    let timedCount = 0;
    for (const d of deliveries) {
      try {
        const meta = d.output_metadata ? JSON.parse(d.output_metadata) : {};
        if (meta.duration_ms) {
          totalDuration += meta.duration_ms;
          timedCount++;
        }
      } catch { /* ignore */ }
    }
    const avgProcessingTime = timedCount > 0 ? Math.round(totalDuration / timedCount) : 0;
    const lastProcessed = deliveries[0]?.last_attempt_at || deliveries[0]?.completed_at || null;

    return {
      subscriber_id: sub.subscriber_id,
      subscriber_name: sub.subscriber_name,
      registered: true,
      enabled: sub.is_active,
      event_type: sub.event_type,
      processing_mode: sub.processing_mode,
      total_deliveries: total,
      completed,
      successful,
      failed,
      dead_lettered: deadLettered,
      pending,
      processing,
      retrying,
      replay_count: replayCount,
      average_processing_time_ms: avgProcessingTime,
      last_processed: lastProcessed,
    };
  } catch {
    return {
      subscriber_id: sub.subscriber_id,
      subscriber_name: sub.subscriber_name,
      registered: true,
      enabled: sub.is_active,
      event_type: sub.event_type,
      total_deliveries: 0,
      error: "Failed to fetch delivery stats",
    };
  }
}

/**
 * Get subscriber health for inbound and outbound subscribers.
 * Generic — filters by handler_reference prefix.
 */
export async function getSubscriberHealth(
  base44: any,
  subscribers: any[],
  inboundHandlerRef: string,
  outboundHandlerRef: string
): Promise<any> {
  const inboundSubs = subscribers.filter((s: any) => s.handler_reference === inboundHandlerRef);
  const outboundSubs = subscribers.filter((s: any) => s.handler_reference === outboundHandlerRef);

  const inboundHealth = await Promise.all(inboundSubs.map((s: any) => getDeliveryStatsForSubscriber(base44, s)));
  const outboundHealth = await Promise.all(outboundSubs.map((s: any) => getDeliveryStatsForSubscriber(base44, s)));

  return {
    inbound: inboundHealth,
    outbound: outboundHealth,
  };
}

/**
 * Get delivery diagnostics for a set of event types.
 * Generic — takes event_types array as parameter.
 */
export async function getDeliveryDiagnostics(
  base44: any,
  eventTypes: string[]
): Promise<any> {
  try {
    const allDeliveries = await base44.asServiceRole.entities.BusinessEventDelivery.filter(
      { event_type: { $in: eventTypes } },
      "-created_date",
      500
    );

    const pending = allDeliveries.filter((d: any) => d.delivery_status === "pending").length;
    const processing = allDeliveries.filter((d: any) => d.delivery_status === "processing").length;
    const failed = allDeliveries.filter((d: any) => d.delivery_status === "failed").length;
    const deadLettered = allDeliveries.filter((d: any) => d.delivery_status === "dead_letter").length;
    const completed = allDeliveries.filter((d: any) => d.delivery_status === "completed").length;
    const replayCount = allDeliveries.reduce((sum: number, d: any) => sum + (d.replay_count || 0), 0);

    const now = new Date().toISOString();
    const retryQueueDepth = allDeliveries.filter(
      (d: any) => d.delivery_status === "failed" && d.next_retry_at && d.next_retry_at > now
    ).length;

    return {
      total_deliveries: allDeliveries.length,
      pending,
      processing,
      completed,
      failed,
      dead_lettered: deadLettered,
      retry_queue_depth: retryQueueDepth,
      replay_count: replayCount,
    };
  } catch {
    return {
      total_deliveries: 0,
      error: "Failed to fetch delivery diagnostics",
    };
  }
}

/**
 * Compute migration health from state, subscriber health, and delivery stats.
 * Generic — works for any entity type.
 */
export function computeMigrationHealth(
  state: any,
  subscriberHealth: any,
  deliveryStats: any
): string {
  if (!state) return "not_started";
  if (state.mode === "cut_over") return "cut_over";

  const shadowErrorCount = state.shadow_error_count || 0;
  const deadLettered = deliveryStats?.dead_lettered || 0;
  const retryQueueDepth = deliveryStats?.retry_queue_depth || 0;
  const validationFailures = state.validation_failures || 0;

  if (validationFailures > 0 || deadLettered > 5) return "degraded";
  if (shadowErrorCount > 0 || retryQueueDepth > 10) return "warning";
  if (state.ready_for_cutover) return "ready_for_cutover";
  return "healthy";
}

/**
 * Build a full status report for an entity migration.
 * Generic — takes entity type, external system, handler refs, and event types.
 */
export async function getFullSyncStatus(
  base44: any,
  entityType: string,
  externalSystem: string,
  inboundHandlerRef: string,
  outboundHandlerRef: string,
  eventTypes: string[]
): Promise<any> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  const { getEffectivePolicy } = await import("../syncPolicy/syncPolicyService.ts");
  const policy = await getEffectivePolicy(base44, entityType, externalSystem);

  const subscribers = await getSubscribersByHandler(base44, inboundHandlerRef, outboundHandlerRef);
  const subscriberHealth = await getSubscriberHealth(base44, subscribers, inboundHandlerRef, outboundHandlerRef);
  const shadowMetrics = getShadowMetricsSummary(state);
  const deliveryStats = await getDeliveryDiagnostics(base44, eventTypes);
  const health = computeMigrationHealth(state, subscriberHealth, deliveryStats);

  return {
    migration_state: state ? {
      migration_key: state.migration_key,
      mode: state.mode,
      auto_cut_enabled: state.auto_cut_enabled,
      activated_at: state.activated_at,
      cut_over_at: state.cut_over_at,
      rolled_back_at: state.rolled_back_at,
      ready_for_cutover: state.ready_for_cutover,
      shadow_threshold: state.shadow_threshold,
    } : null,
    policy: policy ? {
      sync_mode: policy.sync_mode,
      sync_enabled: policy.sync_enabled,
      version: policy.version,
    } : null,
    shadow_metrics: shadowMetrics,
    subscriber_health: subscriberHealth,
    delivery_diagnostics: deliveryStats,
    migration_health: health,
    subscribers: subscribers.map((s: any) => ({
      subscriber_id: s.subscriber_id,
      subscriber_name: s.subscriber_name,
      event_type: s.event_type,
      handler_reference: s.handler_reference,
      processing_mode: s.processing_mode,
      is_active: s.is_active,
      priority: s.priority,
    })),
  };
}

/**
 * Build a diagnostics report for an entity migration.
 * Generic — takes entity type, external system, handler refs, and event types.
 */
export async function getSyncDiagnostics(
  base44: any,
  entityType: string,
  externalSystem: string,
  inboundHandlerRef: string,
  outboundHandlerRef: string,
  eventTypes: string[]
): Promise<any> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  const { getEffectivePolicy } = await import("../syncPolicy/syncPolicyService.ts");
  const policy = await getEffectivePolicy(base44, entityType, externalSystem);

  const subscribers = await getSubscribersByHandler(base44, inboundHandlerRef, outboundHandlerRef);
  const subscriberHealth = await getSubscriberHealth(base44, subscribers, inboundHandlerRef, outboundHandlerRef);
  const deliveryStats = await getDeliveryDiagnostics(base44, eventTypes);
  const shadowMetrics = getShadowMetricsSummary(state);
  const health = computeMigrationHealth(state, subscriberHealth, deliveryStats);

  return {
    migration_mode: state?.mode || "none",
    migration_health: health,
    ready_for_cutover: state?.ready_for_cutover || false,
    subscriber_registration: {
      inbound_registered: subscribers.some((s: any) => s.handler_reference === inboundHandlerRef),
      outbound_registered: subscribers.some((s: any) => s.handler_reference === outboundHandlerRef),
      total_subscribers: subscribers.length,
      all_enabled: subscribers.every((s: any) => s.is_active),
    },
    subscriber_health: subscriberHealth,
    delivery_diagnostics: deliveryStats,
    shadow_metrics: shadowMetrics,
    policy: policy ? {
      sync_mode: policy.sync_mode,
      sync_enabled: policy.sync_enabled,
      version: policy.version,
    } : null,
    timestamps: {
      activated_at: state?.activated_at || null,
      cut_over_at: state?.cut_over_at || null,
      rolled_back_at: state?.rolled_back_at || null,
      last_success: state?.last_success || null,
      last_failure: state?.last_failure || null,
      last_processed_at: state?.last_processed_at || null,
    },
  };
}

/**
 * Fetch subscribers by handler reference.
 */
async function getSubscribersByHandler(
  base44: any,
  inboundHandlerRef: string,
  outboundHandlerRef: string
): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.EventSubscriber.filter(
      { handler_reference: { $in: [inboundHandlerRef, outboundHandlerRef] } },
      "priority",
      50
    );
  } catch {
    return [];
  }
}