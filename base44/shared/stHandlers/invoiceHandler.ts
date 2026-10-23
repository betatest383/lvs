import type { EventHandler } from "./types.ts";
import { ensureCustomerForDependentRecord } from "../stCustomerHydration.ts";
import { getTenantId, getEnvironment } from "../stAuth.ts";

/**
 * Invoice Handler
 *
 * Domain: invoice
 * Handles all invoice lifecycle events via switch(action).
 *
 * Customer Hydration: Before creating or updating an invoice, the handler
 * checks whether the referenced ServiceTitan customer exists locally. If missing,
 * it hydrates the customer on demand. If hydration fails, the invoice is
 * deferred via a DeferredDependentRecord and NOT created.
 *
 * Future: sync to Invoice entity.
 */
export const invoiceHandler: EventHandler = {
  name: "invoiceHandler",
  domains: ["invoice"],

  async handle(action, { payload, event, base44 }) {
    const invoiceId = payload.invoice_id || payload.id || event.object_id || "";
    const invoiceNumber = payload.invoice_number || "";
    const amount = payload.amount || payload.total || 0;
    const stCustomerId = payload.customer_id || payload.servicetitan_customer_id || "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "invoiceHandler",
      action,
      invoiceId,
      invoiceNumber,
      amount,
      stCustomerId,
    }));

    // ── Customer hydration check ──
    // Before processing any invoice event, ensure the referenced customer exists locally.
    if (stCustomerId && (action === "created" || action === "updated" || action === "completed")) {
      const tenantId = getTenantId();
      const environment = getEnvironment();
      const hydrationResult = await ensureCustomerForDependentRecord(
        base44,
        stCustomerId,
        tenantId,
        environment,
        "invoice",
        invoiceId,
        event?.id,
        payload
      );

      if (hydrationResult.status === "deferred") {
        return {
          success: false,
          summary: `Invoice '${invoiceNumber}' deferred — customer '${stCustomerId}' hydration failed: ${hydrationResult.warning}`,
          error: hydrationResult.warning,
          retryable: true,
        };
      }

      if (hydrationResult.status === "not_found" || hydrationResult.status === "error") {
        return {
          success: false,
          summary: `Invoice '${invoiceNumber}' blocked — customer '${stCustomerId}' not found: ${hydrationResult.warning}`,
          error: hydrationResult.warning,
          retryable: true,
        };
      }
    }

    switch (action) {
      case "created":
        return {
          success: true,
          summary: `Invoice '${invoiceNumber}' created ($${amount}) — customer verified, no sync yet`,
          metadata: { invoiceId, invoiceNumber, amount, stCustomerId },
        };
      case "updated":
        return {
          success: true,
          summary: `Invoice '${invoiceNumber}' updated ($${amount}) — customer verified, no sync yet`,
          metadata: { invoiceId, invoiceNumber, amount, stCustomerId },
        };
      case "completed":
        return {
          success: true,
          summary: `Invoice '${invoiceNumber}' completed — customer verified, no sync yet`,
          metadata: { invoiceId, invoiceNumber, amount, stCustomerId },
        };
      case "voided":
        return {
          success: true,
          summary: `Invoice '${invoiceNumber}' voided — no sync yet`,
          metadata: { invoiceId, invoiceNumber, amount, stCustomerId },
        };
      default:
        return {
          success: true,
          summary: `Invoice event '${action}' received — no sync yet`,
          metadata: { invoiceId, invoiceNumber, amount, stCustomerId },
        };
    }
  },
};