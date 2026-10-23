/**
 * Shadow Metrics Service (Stage 2B-A)
 *
 * Tracks detailed shadow execution statistics for migration health monitoring.
 * All metrics are cumulative and stored on the SyncMigrationState record.
 *
 * Outcomes tracked:
 *   - customer_located    — existing Customer found by ST ID
 *   - customer_created    — new Customer record created
 *   - customer_updated    — existing Customer updated with changed fields
 *   - duplicate_ignored   — duplicate webhook event detected and skipped
 *   - replay_ignored     — replayed event that was already applied (stale protection)
 *   - mapping_failure    — ST payload couldn't be mapped (missing required fields)
 *   - validation_failure — payload validation error (invalid JSON, schema mismatch)
 *   - idempotent_noop    — processed but no data changed
 *   - processing_duration — time spent in the subscriber handler
 */

import {
  getMigrationState,
  buildMigrationKey,
} from "./migrationStateService.ts";

const MIGRATION_ENTITY = "SyncMigrationState";

export type ShadowOutcome =
  | "customer_located"
  | "customer_created"
  | "customer_updated"
  | "job_located"
  | "job_created"
  | "job_updated"
  | "job_deleted"
  | "job_restored"
  | "appointment_located"
  | "appointment_created"
  | "appointment_updated"
  | "appointment_canceled"
  | "appointment_completed"
  | "appointment_assigned"
  | "appointment_rescheduled"
  | "appointment_unmatched_technician"
  | "duplicate_ignored"
  | "replay_ignored"
  | "mapping_failure"
  | "validation_failure"
  | "idempotent_noop"
  | "skipped_loop_prevention"
  | "test_skipped"
  | "error";

const OUTCOME_FIELD_MAP: Record<ShadowOutcome, string> = {
  customer_located: "shadow_customer_located",
  customer_created: "shadow_customer_created",
  customer_updated: "shadow_customer_updated",
  job_located: "shadow_job_located",
  job_created: "shadow_job_created",
  job_updated: "shadow_job_updated",
  job_deleted: "shadow_job_deleted",
  job_restored: "shadow_job_restored",
  appointment_located: "shadow_appointment_located",
  appointment_created: "shadow_appointment_created",
  appointment_updated: "shadow_appointment_updated",
  appointment_canceled: "shadow_appointment_canceled",
  appointment_completed: "shadow_appointment_completed",
  appointment_assigned: "shadow_appointment_assigned",
  appointment_rescheduled: "shadow_appointment_rescheduled",
  appointment_unmatched_technician: "shadow_appointment_unmatched_technician",
  duplicate_ignored: "shadow_duplicate_ignored",
  replay_ignored: "shadow_replay_ignored",
  mapping_failure: "shadow_mapping_failure",
  validation_failure: "shadow_validation_failure",
  idempotent_noop: "shadow_idempotent_noop",
  skipped_loop_prevention: "", // not tracked as a shadow stat
  test_skipped: "", // not tracked as a shadow stat
  error: "", // tracked via failed_events
};

const MAX_RECENT_ACTIVITY = 20;

/**
 * Record a shadow subscriber execution with detailed outcome and timing.
 *
 * Updates:
 *   - total_events (always)
 *   - successful_events / failed_events
 *   - outcome-specific counter (e.g. shadow_customer_created)
 *   - shadow_total_duration_ms + shadow_processing_count (for avg calculation)
 *   - last_success / last_failure / last_processed_at
 *   - shadow_clean_count / shadow_error_count (consecutive counters)
 *   - ready_for_cutover (computed health indicator)
 *   - recent_activity_json (last 20 results)
 *
 * NEVER triggers automatic cut-over. ready_for_cutover is informational only.
 */
export async function recordShadowExecution(
  base44: any,
  entityType: string,
  externalSystem: string,
  params: {
    outcome: ShadowOutcome;
    eventId: string;
    action: string;
    durationMs: number;
    success: boolean;
    summary?: string;
    error?: string;
  }
): Promise<void> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) return;

  const now = new Date().toISOString();
  const { outcome, eventId, action, durationMs, success, summary, error } = params;

  const update: any = {
    last_processed_at: now,
    total_events: (state.total_events || 0) + 1,
    shadow_total_duration_ms: (state.shadow_total_duration_ms || 0) + durationMs,
    shadow_processing_count: (state.shadow_processing_count || 0) + 1,
    last_shadow_event_id: eventId,
    last_shadow_result: JSON.stringify({ outcome, action, success, summary, error, duration_ms: durationMs }),
  };

  if (success) {
    update.successful_events = (state.successful_events || 0) + 1;
    update.last_success = now;
    update.shadow_clean_count = (state.shadow_clean_count || 0) + 1;
    update.shadow_error_count = state.shadow_error_count || 0; // unchanged
    update.last_error = "";
  } else {
    update.failed_events = (state.failed_events || 0) + 1;
    update.last_failure = now;
    update.shadow_clean_count = 0; // reset consecutive counter
    update.shadow_error_count = (state.shadow_error_count || 0) + 1;
    update.last_error = error || summary || "Unknown error";
  }

  // Outcome-specific counter
  const outcomeField = OUTCOME_FIELD_MAP[outcome];
  if (outcomeField) {
    update[outcomeField] = (state[outcomeField] || 0) + 1;
  }

  // Validation failure tracking
  if (outcome === "validation_failure") {
    update.validation_failures = (state.validation_failures || 0) + 1;
  }

  // Compute ready_for_cutover (informational — never triggers auto-cut)
  const cleanCount = success ? update.shadow_clean_count : 0;
  const threshold = state.shadow_threshold || 50;
  const failedEvents = update.failed_events || state.failed_events || 0;
  const validationFailures = update.validation_failures || state.validation_failures || 0;
  const recentFailure = success ? false : true;
  // Ready when: enough clean runs, no recent failures, no validation failures
  update.ready_for_cutover = cleanCount >= threshold && !recentFailure && validationFailures === 0;

  // Update recent activity (append, trim to MAX_RECENT_ACTIVITY)
  let recent: any[] = [];
  try {
    recent = state.recent_activity_json ? JSON.parse(state.recent_activity_json) : [];
  } catch { /* ignore */ }
  recent.push({
    event_id: eventId,
    action,
    outcome,
    duration_ms: durationMs,
    timestamp: now,
    success,
  });
  if (recent.length > MAX_RECENT_ACTIVITY) {
    recent = recent.slice(-MAX_RECENT_ACTIVITY);
  }
  update.recent_activity_json = JSON.stringify(recent);

  try {
    await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, update);
  } catch (err) {
    console.error("[STAGE 2B-A] recordShadowExecution failed:", err);
  }
}

/**
 * Record a duplicate event (deduplicated by the Business Event Engine,
 * never reached the subscriber).
 */
export async function recordDuplicateEvent(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<void> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) return;

  try {
    await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, {
      duplicate_events: (state.duplicate_events || 0) + 1,
      total_events: (state.total_events || 0) + 1,
      last_processed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[STAGE 2B-A] recordDuplicateEvent failed:", err);
  }
}

/**
 * Record a replay event (dead-letter delivery reset for reprocessing).
 */
export async function recordReplayEvent(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<void> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) return;

  try {
    await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, {
      replay_events: (state.replay_events || 0) + 1,
    });
  } catch (err) {
    console.error("[STAGE 2B-A] recordReplayEvent failed:", err);
  }
}

/**
 * Get shadow metrics summary for reporting.
 */
export function getShadowMetricsSummary(state: any): any {
  if (!state) return null;

  const totalCount = state.shadow_processing_count || 0;
  const totalDuration = state.shadow_total_duration_ms || 0;
  const avgDuration = totalCount > 0 ? Math.round(totalDuration / totalCount) : 0;

  let recentActivity: any[] = [];
  try {
    recentActivity = state.recent_activity_json ? JSON.parse(state.recent_activity_json) : [];
  } catch { /* ignore */ }

  return {
    cumulative: {
      total_events: state.total_events || 0,
      successful_events: state.successful_events || 0,
      failed_events: state.failed_events || 0,
      duplicate_events: state.duplicate_events || 0,
      replay_events: state.replay_events || 0,
      idempotent_events: state.idempotent_events || 0,
      validation_failures: state.validation_failures || 0,
      shadow_clean_count: state.shadow_clean_count || 0,
      shadow_error_count: state.shadow_error_count || 0,
      shadow_threshold: state.shadow_threshold || 50,
      ready_for_cutover: state.ready_for_cutover || false,
    },
    detail: {
      customer_located: state.shadow_customer_located || 0,
      customer_created: state.shadow_customer_created || 0,
      customer_updated: state.shadow_customer_updated || 0,
      job_located: state.shadow_job_located || 0,
      job_created: state.shadow_job_created || 0,
      job_updated: state.shadow_job_updated || 0,
      job_deleted: state.shadow_job_deleted || 0,
      job_restored: state.shadow_job_restored || 0,
      duplicate_ignored: state.shadow_duplicate_ignored || 0,
      replay_ignored: state.shadow_replay_ignored || 0,
      mapping_failure: state.shadow_mapping_failure || 0,
      validation_failure: state.shadow_validation_failure || 0,
      idempotent_noop: state.shadow_idempotent_noop || 0,
    },
    timing: {
      total_duration_ms: totalDuration,
      processing_count: totalCount,
      average_duration_ms: avgDuration,
    },
    timestamps: {
      last_success: state.last_success || null,
      last_failure: state.last_failure || null,
      last_processed_at: state.last_processed_at || null,
    },
    recent_activity: recentActivity,
  };
}