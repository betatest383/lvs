/**
 * Generic Sync Watermark Lifecycle
 *
 * Provides activate / get / increment / stats for any watermark entity.
 * Each domain (Customer, Appointment, Job, etc.) passes its WatermarkConfig.
 *
 * The watermark entity must have these fields:
 *   watermark_key, sync_strategy, activation_timestamp, status, environment,
 *   tenant_id, created_by, recovery_overlap_minutes, recovery_window_status,
 *   recovery_window_errors, backfill_status
 *
 * Domain-specific counters are managed via incrementWatermarkCounters
 * (read-modify-write) so each domain can increment its own typed fields.
 */

import type { WatermarkConfig } from "./stSyncTypes.ts";

export const DEFAULT_RECOVERY_OVERLAP_MINUTES = 5;

/**
 * Get the active watermark for a given tenant and environment.
 * Returns null if no watermark has been established.
 * THROWS on database errors — callers must handle (fail-closed).
 */
export async function getWatermark(
  base44: any,
  config: WatermarkConfig,
  tenantId: string,
  environment: string
): Promise<any | null> {
  const results = await base44.asServiceRole.entities[config.entityName].filter(
    { watermark_key: config.watermarkKey, tenant_id: tenantId, environment },
    "-created_date",
    1
  );
  return results && results.length > 0 ? results[0] : null;
}

/**
 * Activate a watermark. Idempotent: if already active with the correct
 * strategy, returns as-is without modifying.
 */
export async function activateWatermark(
  base44: any,
  config: WatermarkConfig,
  tenantId: string,
  environment: string,
  userEmail: string
): Promise<any> {
  const existing = await getWatermark(base44, config, tenantId, environment);

  if (existing && existing.status === "active" && existing.sync_strategy === config.syncStrategy) {
    return existing;
  }

  const now = new Date().toISOString();
  const overlap = config.defaultOverlapMinutes ?? DEFAULT_RECOVERY_OVERLAP_MINUTES;

  if (existing) {
    return await base44.asServiceRole.entities[config.entityName].update(existing.id, {
      sync_strategy: config.syncStrategy,
      activation_timestamp: now,
      status: "active",
      created_by: userEmail,
      backfill_status: "never_started",
      backfill_started_at: null,
      backfill_confirmed_by: null,
      recovery_window_status: "idle",
      recovery_window_start: null,
      recovery_window_end: null,
      recovery_window_errors: 0,
    });
  }

  return await base44.asServiceRole.entities[config.entityName].create({
    watermark_key: config.watermarkKey,
    sync_strategy: config.syncStrategy,
    activation_timestamp: now,
    environment,
    tenant_id: tenantId,
    created_by: userEmail,
    status: "active",
    recovery_overlap_minutes: overlap,
    recovery_window_status: "idle",
    recovery_window_errors: 0,
    backfill_status: "never_started",
  });
}

/**
 * Increment watermark counters atomically (read-modify-write).
 * Only call after an operation has succeeded.
 * Domain-specific: pass whatever counter fields your entity supports.
 */
export async function incrementWatermarkCounters(
  base44: any,
  entityName: string,
  watermarkId: string,
  updates: Record<string, number>
): Promise<void> {
  try {
    const current = await base44.asServiceRole.entities[entityName].get(watermarkId);
    if (!current) return;

    const updateData: Record<string, any> = {};
    for (const [key, increment] of Object.entries(updates)) {
      updateData[key] = (current[key] || 0) + increment;
    }
    await base44.asServiceRole.entities[entityName].update(watermarkId, updateData);
  } catch (err) {
    console.error(`[ST SYNC WATERMARK] Failed to increment counters (${entityName}):`, err);
  }
}

/**
 * Check if a record's createdOn is after the activation timestamp.
 * Used for fail-closed eligibility checks in new-records-only mode.
 *
 * Returns:
 *   - allowed: true if the record was created at or after activation
 *   - reason: "pre_activation" if before, "no_activation_ts" if watermark lacks timestamp
 */
export function isPostActivation(
  recordCreatedOn: string | null | undefined,
  activationTimestamp: string | null | undefined
): { allowed: boolean; reason?: string } {
  if (!activationTimestamp) {
    return { allowed: false, reason: "no_activation_ts" };
  }
  if (!recordCreatedOn) {
    return { allowed: false, reason: "missing_created_on" };
  }
  const createdTime = new Date(recordCreatedOn).getTime();
  const activationTime = new Date(activationTimestamp).getTime();
  if (isNaN(createdTime) || isNaN(activationTime)) {
    return { allowed: false, reason: "invalid_timestamp" };
  }
  if (createdTime < activationTime) {
    return { allowed: false, reason: "pre_activation" };
  }
  return { allowed: true };
}