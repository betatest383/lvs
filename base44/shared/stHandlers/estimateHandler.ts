import type { EventHandler } from "./types.ts";
import { ensureCustomerForDependentRecord } from "../stCustomerHydration.ts";
import { getTenantId, getEnvironment } from "../stAuth.ts";

/**
 * Estimate Handler
 *
 * Domain: estimate
 * Handles all estimate lifecycle events via switch(action).
 *
 * Customer Hydration: Before creating or updating an estimate, the handler
 * checks whether the referenced ServiceTitan customer exists locally. If missing,
 * it hydrates the customer on demand. If hydration fails, the estimate is
 * deferred via a DeferredDependentRecord and NOT created.
 *
 * Future: sync to Estimate entity / trigger proposal workflow.
 */
export const estimateHandler: EventHandler = {
  name: "estimateHandler",
  domains: ["estimate"],

  async handle(action, { payload, event, base44 }) {
    const estimateId = payload.estimate_id || payload.id || event.object_id || "";
    const jobNumber = payload.job_number || "";
    const estimateTotal = payload.estimate_total || payload.total || 0;
    const stCustomerId = payload.customer_id || payload.servicetitan_customer_id || "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "estimateHandler",
      action,
      estimateId,
      jobNumber,
      estimateTotal,
      stCustomerId,
    }));

    // ── Customer hydration check ──
    // Before processing any estimate event, ensure the referenced customer exists locally.
    if (stCustomerId && (action === "created" || action === "updated" || action === "approved")) {
      const tenantId = getTenantId();
      const environment = getEnvironment();
      const hydrationResult = await ensureCustomerForDependentRecord(
        base44,
        stCustomerId,
        tenantId,
        environment,
        "estimate",
        estimateId,
        event?.id,
        payload
      );

      if (hydrationResult.status === "deferred") {
        return {
          success: false,
          summary: `Estimate '${estimateId}' deferred — customer '${stCustomerId}' hydration failed: ${hydrationResult.warning}`,
          error: hydrationResult.warning,
          retryable: true,
        };
      }

      if (hydrationResult.status === "not_found" || hydrationResult.status === "error") {
        return {
          success: false,
          summary: `Estimate '${estimateId}' blocked — customer '${stCustomerId}' not found: ${hydrationResult.warning}`,
          error: hydrationResult.warning,
          retryable: true,
        };
      }
    }

    switch (action) {
      case "approved":
        return {
          success: true,
          summary: `Estimate '${estimateId}' approved ($${estimateTotal}) — customer verified, no sync yet`,
          metadata: { estimateId, jobNumber, estimateTotal, stCustomerId },
        };
      case "created":
        return {
          success: true,
          summary: `Estimate '${estimateId}' created — customer verified, no sync yet`,
          metadata: { estimateId, jobNumber, estimateTotal, stCustomerId },
        };
      case "updated":
        return {
          success: true,
          summary: `Estimate '${estimateId}' updated — customer verified, no sync yet`,
          metadata: { estimateId, jobNumber, estimateTotal, stCustomerId },
        };
      default:
        return {
          success: true,
          summary: `Estimate event '${action}' received — no sync yet`,
          metadata: { estimateId, jobNumber, estimateTotal, stCustomerId },
        };
    }
  },
};