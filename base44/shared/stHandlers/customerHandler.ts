import type { EventHandler } from "./types.ts";
import {
  syncCustomerCreated,
  syncCustomerUpdated,
  syncCustomerMerged,
  syncCustomerDeleted,
  syncCustomerRestored,
} from "../stCustomerSync.ts";
import { reconcilePendingCustomers } from "../stJobSync.ts";
import {
  getMigrationState,
  isCutOver,
} from "../stage2b/migrationStateService.ts";
import { publishInboundCustomerEvent } from "../stage2b/customerEventPublisher.ts";

/**
 * Customer Handler
 *
 * Domain: customer
 * Handles all customer lifecycle events via switch(action).
 * Thin routing layer — all sync logic lives in stCustomerSync.ts.
 *
 * Stage 2B-A Migration (created/updated only):
 *   When a SyncMigrationState exists for Customer:servicetitan:
 *     - Shadow mode:  runs direct sync (real path) AND publishes a
 *       BusinessEvent. The subscriber runs the same sync (idempotent) and
 *       records detailed shadow metrics. Shadow mode collects metrics
 *       INDEFINITELY — automatic cut-over has been REMOVED in Stage 2B-A.
 *     - Cut-over mode: publishes ONLY. The subscriber does the real sync.
 *       ONLY reachable via manageCustomerSync mode="cut_over" (manual approval).
 *   When NO migration state exists: original direct-sync behavior (no publish,
 *   no overhead). This is the default until shadow is explicitly activated.
 *
 * merged/deleted/restored are NOT migrated in Stage 2B — direct sync as before.
 *
 * Supported actions:
 *   created  → syncCustomerCreated (+ Stage 2B publish)
 *   updated  → syncCustomerUpdated (+ Stage 2B publish)
 *   merged   → syncCustomerMerged
 *   deleted  → syncCustomerDeleted
 *   restored → syncCustomerRestored
 */
export const customerHandler: EventHandler = {
  name: "customerHandler",
  domains: ["customer"],

  async handle(action, ctx) {
    const { payload, event, base44 } = ctx;
    const customerId = payload.customer_id || payload.id || event?.object_id || "";

    // ── Stage 2B: created/updated are subject to migration ──
    if (action === "created" || action === "updated") {
      const migrationState = await getMigrationState(base44, "Customer", "servicetitan");

      if (migrationState && isCutOver(migrationState)) {
        // ── Cut-over: publish only — subscriber does the sync ──
        try {
          const pubResult = await publishInboundCustomerEvent(base44, action, payload, event);
          return {
            success: pubResult.success,
            summary: pubResult.duplicate
              ? `Duplicate customer.${action} event — already processed`
              : `Customer ${action} published for subscriber processing (cut-over mode)`,
            metadata: {
              migration: "cut_over",
              business_event_id: pubResult.business_event_id,
              duplicate: pubResult.duplicate,
            },
          };
        } catch (err) {
          return {
            success: false,
            summary: `Cut-over publish failed for customer.${action}`,
            error: err instanceof Error ? err.message : String(err),
            retryable: true,
          };
        }
      }

      if (migrationState) {
        // ── Shadow mode: direct sync + publish ──
        const result =
          action === "created" ? await syncCustomerCreated(ctx) : await syncCustomerUpdated(ctx);

        // Publish shadow event (subscriber runs idempotent sync + records result)
        try {
          await publishInboundCustomerEvent(base44, action, payload, event);
        } catch (err) {
          console.error("[STAGE 2B] Shadow publish failed:", err);
        }

        await reconcileAfterCustomerSync(ctx, result);
        return result;
      }

      // No migration state — fall through to original direct-sync behavior
    }

    // ── Original direct-sync behavior (no migration or non-migrated actions) ──
    console.log("[ST HANDLER]", JSON.stringify({ handler: "customerHandler", action, customerId }));

    switch (action) {
      case "created": {
        const result = await syncCustomerCreated(ctx);
        await reconcileAfterCustomerSync(ctx, result);
        return result;
      }
      case "updated": {
        const result = await syncCustomerUpdated(ctx);
        await reconcileAfterCustomerSync(ctx, result);
        return result;
      }
      case "merged":
        return syncCustomerMerged(ctx);
      case "deleted":
        return syncCustomerDeleted(ctx);
      case "restored":
        return syncCustomerRestored(ctx);
      default:
        return {
          success: true,
          summary: `Customer event '${action}' received — no handler for this action`,
          finalStatus: "ignored" as const,
          metadata: { customerId, action },
        };
    }
  },
};

/**
 * Reconcile pending jobs after a successful customer create/update.
 * Mirrors the existing handler behavior — extracted to avoid duplication
 * between the shadow path and the fallback path.
 */
async function reconcileAfterCustomerSync(ctx: any, result: any): Promise<void> {
  if (!result.success || !result.metadata?.local_customer_id) return;
  try {
    const stCustId =
      ctx.payload.customer_id ||
      ctx.payload.servicetitan_customer_id ||
      ctx.event?.object_id ||
      "";
    await reconcilePendingCustomers(
      ctx.base44,
      stCustId,
      result.metadata.local_customer_id,
      result.metadata.customer_name || ctx.payload.customer_name || "",
      result.metadata.customer_number || ctx.payload.customer_number || "",
      ctx.event?.id
    );
  } catch (err) {
    console.error("[ST HANDLER] reconcilePendingCustomers failed:", err);
  }
}