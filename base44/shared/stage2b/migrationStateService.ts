/**
 * Sync Migration State Service (Stage 2B-A)
 *
 * Manages the shadow→cut-over lifecycle for entity migrations through the
 * Business Event Engine.
 *
 * Lifecycle (Stage 2B-A — Manual Approval):
 *   shadow    → handler runs direct sync AND publishes a BusinessEvent.
 *               The subscriber runs the same sync (idempotent) and records
 *               detailed shadow metrics. Shadow mode collects metrics
 *               INDEFINITELY — automatic cut-over has been REMOVED.
 *   cut_over  → handler publishes ONLY; the subscriber does the real sync.
 *               ONLY reachable via manageCustomerSync mode="cut_over".
 *   rolled_back → reverted from cut_over back to shadow (counter reset).
 *
 * Default: when no migration state exists, the handler runs the ORIGINAL
 * direct-sync behavior with zero changes (no publish, no overhead).
 *
 * ready_for_cutover is computed from migration health but NEVER triggers
 * an automatic transition.
 */

const MIGRATION_ENTITY = "SyncMigrationState";

export function buildMigrationKey(entityType: string, externalSystem: string): string {
  return `${entityType}:${externalSystem}`;
}

export async function getMigrationState(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<any | null> {
  try {
    const results = await base44.asServiceRole.entities[MIGRATION_ENTITY].filter(
      { migration_key: buildMigrationKey(entityType, externalSystem) },
      "-created_date",
      1
    );
    return results[0] || null;
  } catch {
    return null;
  }
}

export async function activateShadow(
  base44: any,
  entityType: string,
  externalSystem: string,
  threshold: number,
  actor: string
): Promise<any> {
  const now = new Date().toISOString();
  const existing = await getMigrationState(base44, entityType, externalSystem);
  if (existing) {
    return await base44.asServiceRole.entities[MIGRATION_ENTITY].update(existing.id, {
      mode: "shadow",
      shadow_clean_count: 0,
      shadow_error_count: 0,
      shadow_threshold: threshold,
      auto_cut_enabled: false, // Always false in Stage 2B-A
      activated_at: now,
      rolled_back_at: null,
      cut_over_at: null,
      last_error: "",
      // Reset cumulative metrics on activation
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
      notes: `Shadow reactivated by ${actor} (manual approval required for cut-over)`,
    });
  }
  return await base44.asServiceRole.entities[MIGRATION_ENTITY].create({
    migration_key: buildMigrationKey(entityType, externalSystem),
    entity_type: entityType,
    external_system: externalSystem,
    mode: "shadow",
    shadow_clean_count: 0,
    shadow_error_count: 0,
    shadow_threshold: threshold,
    auto_cut_enabled: false,
    activated_at: now,
    created_by: actor,
    notes: `Shadow activated by ${actor} (manual approval required for cut-over)`,
  });
}

/**
 * Record a shadow subscriber result. Increments clean/error counts.
 *
 * STAGE 2B-A: Automatic cut-over has been REMOVED. This function
 * records metrics ONLY and NEVER transitions mode to cut_over.
 * Only manageCustomerSync mode="cut_over" may do that.
 *
 * @deprecated Use recordShadowExecution from shadowMetricsService.ts
 *             for detailed metrics. This function is retained for
 *             backward compatibility but delegates to the metrics service.
 */
export async function recordShadowResult(
  base44: any,
  entityType: string,
  externalSystem: string,
  success: boolean,
  eventId: string,
  result: any
): Promise<{ cut_over: boolean; state: any | null }> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) return { cut_over: false, state: null };
  if (state.mode !== "shadow") return { cut_over: false, state };

  const now = new Date().toISOString();
  const cleanCount = success ? (state.shadow_clean_count || 0) + 1 : 0;
  const errorCount = success
    ? state.shadow_error_count || 0
    : (state.shadow_error_count || 0) + 1;

  const threshold = state.shadow_threshold || 50;
  const failedEvents = success ? (state.failed_events || 0) : (state.failed_events || 0) + 1;
  const validationFailures = state.validation_failures || 0;

  const update: any = {
    shadow_clean_count: cleanCount,
    shadow_error_count: errorCount,
    last_shadow_event_id: eventId,
    last_shadow_result: JSON.stringify({
      success,
      summary: result?.summary,
      sync_action: result?.metadata?.sync_action || result?.output?.sync_action,
      error: result?.error,
    }),
    last_error: success ? "" : result?.error || result?.summary || "Unknown error",
    last_processed_at: now,
    total_events: (state.total_events || 0) + 1,
    ready_for_cutover: cleanCount >= threshold && success && validationFailures === 0,
  };

  if (success) {
    update.successful_events = (state.successful_events || 0) + 1;
    update.last_success = now;
  } else {
    update.failed_events = (state.failed_events || 0) + 1;
    update.last_failure = now;
  }

  await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, update);
  // NEVER auto-cut. Return cut_over: false always.
  return { cut_over: false, state };
}

export async function forceCutOver(
  base44: any,
  entityType: string,
  externalSystem: string,
  actor: string
): Promise<any> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) throw new Error("Migration state not found — activate shadow first");
  return await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, {
    mode: "cut_over",
    cut_over_at: new Date().toISOString(),
    notes: `Manual cut-over by ${actor} (Stage 2B-A — manual approval)`,
  });
}

export async function rollbackMigration(
  base44: any,
  entityType: string,
  externalSystem: string,
  actor: string
): Promise<any> {
  const state = await getMigrationState(base44, entityType, externalSystem);
  if (!state) throw new Error("Migration state not found");
  return await base44.asServiceRole.entities[MIGRATION_ENTITY].update(state.id, {
    mode: "shadow",
    shadow_clean_count: 0,
    shadow_error_count: 0,
    rolled_back_at: new Date().toISOString(),
    cut_over_at: null,
    ready_for_cutover: false,
    notes: `Rolled back to shadow by ${actor}`,
  });
}

/** True when shadow mode (or no state — defaults to shadow/safest). */
export function isShadowMode(state: any | null): boolean {
  if (!state) return true;
  return state.mode === "shadow" || state.mode === "rolled_back";
}

/** True only when explicitly cut over. */
export function isCutOver(state: any | null): boolean {
  return !!state && state.mode === "cut_over";
}