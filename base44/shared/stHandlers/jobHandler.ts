import type { EventHandler } from "./types.ts";
import {
  syncJobCreated,
  syncJobUpdated,
  syncJobScheduled,
  syncJobStarted,
  syncJobOnHold,
  syncJobCompleted,
  syncJobCanceled,
  syncJobReopened,
  syncJobDeleted,
  syncJobRestored,
} from "../stJobSync.ts";
import {
  getMigrationState,
  isCutOver,
} from "../stage2b/migrationStateService.ts";
import { publishInboundJobEvent } from "../stage2c/jobEventPublisher.ts";

/**
 * Job Handler
 *
 * Domain: job
 * Handles all job lifecycle events via switch(action).
 * Thin routing layer — all sync logic lives in stJobSync.ts.
 *
 * Stage 2C Migration (created/updated/deleted/restored only):
 *   When a SyncMigrationState exists for Job:servicetitan:
 *     - Shadow mode:  runs direct sync (real path) AND publishes a
 *       BusinessEvent. The subscriber runs the same sync (idempotent) and
 *       records detailed shadow metrics. Shadow mode collects metrics
 *       INDEFINITELY — automatic cut-over has been REMOVED.
 *     - Cut-over mode: publishes ONLY. The subscriber does the real sync.
 *       ONLY reachable via manageJobSync mode="cut_over" (manual approval).
 *   When NO migration state exists: original direct-sync behavior (no publish,
 *   no overhead). This is the default until shadow is explicitly activated.
 *
 * Other actions (scheduled, started, completed, etc.) are NOT migrated in
 * Stage 2C — direct sync as before.
 *
 * Supported actions:
 *   created    → syncJobCreated (+ Stage 2C publish)
 *   updated    → syncJobUpdated (+ Stage 2C publish)
 *   scheduled  → syncJobScheduled
 *   rescheduled → syncJobScheduled (same handler)
 *   started    → syncJobStarted
 *   on_hold / onhold / hold → syncJobOnHold
 *   completed  → syncJobCompleted
 *   canceled / cancelled → syncJobCanceled
 *   reopened   → syncJobReopened
 *   deleted    → syncJobDeleted (+ Stage 2C publish)
 *   restored   → syncJobRestored (+ Stage 2C publish)
 *
 * All other actions are ignored (idempotent success).
 */
export const jobHandler: EventHandler = {
  name: "jobHandler",
  domains: ["job"],

  async handle(action, ctx) {
    const { payload, event, base44 } = ctx;
    const jobId = payload.job_id || payload.id || event?.object_id || "";
    const jobNumber = payload.job_number || "";

    // ── Stage 2C: created/updated/deleted/restored are subject to migration ──
    if (action === "created" || action === "updated" || action === "deleted" || action === "restored") {
      const migrationState = await getMigrationState(base44, "Job", "servicetitan");

      if (migrationState && isCutOver(migrationState)) {
        // ── Cut-over: publish only — subscriber does the sync ──
        try {
          const pubResult = await publishInboundJobEvent(base44, action, payload, event);
          return {
            success: pubResult.success,
            summary: pubResult.duplicate
              ? `Duplicate job.${action} event — already processed`
              : `Job ${action} published for subscriber processing (cut-over mode)`,
            metadata: {
              migration: "cut_over",
              business_event_id: pubResult.business_event_id,
              duplicate: pubResult.duplicate,
            },
          };
        } catch (err) {
          return {
            success: false,
            summary: `Cut-over publish failed for job.${action}`,
            error: err instanceof Error ? err.message : String(err),
            retryable: true,
          };
        }
      }

      if (migrationState) {
        // ── Shadow mode: direct sync + publish ──
        let result;
        try {
          result = await runDirectSync(action, ctx);
        } catch (err) {
          result = {
            success: false,
            summary: "Shadow direct sync threw",
            error: err instanceof Error ? err.message : String(err),
            retryable: true,
          };
        }

        // Publish shadow event (subscriber runs idempotent sync + records result)
        try {
          await publishInboundJobEvent(base44, action, payload, event);
        } catch (err) {
          console.error("[STAGE 2C] Shadow publish failed:", err);
        }

        return result;
      }

      // No migration state — fall through to original direct-sync behavior
    }

    // ── Original direct-sync behavior (no migration or non-migrated actions) ──
    console.log("[ST HANDLER]", JSON.stringify({
      handler: "jobHandler",
      action,
      jobId,
      jobNumber,
    }));

    return runDirectSync(action, ctx);
  },
};

/**
 * Run the direct sync function for the given action.
 * Extracted to avoid duplication between the shadow path and the fallback path.
 */
async function runDirectSync(action: string, ctx: any): Promise<any> {
  switch (action) {
    case "created":
      return syncJobCreated(ctx);
    case "updated":
      return syncJobUpdated(ctx);
    case "scheduled":
    case "rescheduled":
      return syncJobScheduled(ctx);
    case "started":
      return syncJobStarted(ctx);
    case "on_hold":
    case "onhold":
    case "hold":
      return syncJobOnHold(ctx);
    case "completed":
      return syncJobCompleted(ctx);
    case "canceled":
    case "cancelled":
      return syncJobCanceled(ctx);
    case "reopened":
      return syncJobReopened(ctx);
    case "deleted":
      return syncJobDeleted(ctx);
    case "restored":
      return syncJobRestored(ctx);
    default:
      return {
        success: true,
        summary: `Job event '${action}' received — no handler for this action`,
        finalStatus: "ignored" as const,
        metadata: { jobId: ctx.payload?.job_id || ctx.event?.object_id, action },
      };
  }
}