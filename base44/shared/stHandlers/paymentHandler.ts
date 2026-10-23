import type { EventHandler } from "./types.ts";

/**
 * Payment Handler
 *
 * Domain: payment
 * Handles all payment lifecycle events via switch(action).
 *
 * Future: sync to Invoice payment status / accounting.
 */
export const paymentHandler: EventHandler = {
  name: "paymentHandler",
  domains: ["payment"],

  async handle(action, { payload, event }) {
    const paymentId = payload.payment_id || payload.id || event.object_id || "";
    const invoiceNumber = payload.invoice_number || "";
    const amount = payload.amount || 0;

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "paymentHandler",
      action,
      paymentId,
      invoiceNumber,
      amount,
    }));

    switch (action) {
      case "collected":
        return {
          success: true,
          summary: `Payment of $${amount} collected for invoice '${invoiceNumber}' — no sync yet`,
          metadata: { paymentId, invoiceNumber, amount },
        };
      case "refunded":
        return {
          success: true,
          summary: `Refund of $${amount} for invoice '${invoiceNumber}' — no sync yet`,
          metadata: { paymentId, invoiceNumber, amount },
        };
      case "failed":
        return {
          success: true,
          summary: `Payment of $${amount} failed for invoice '${invoiceNumber}' — no sync yet`,
          metadata: { paymentId, invoiceNumber, amount },
        };
      default:
        return {
          success: true,
          summary: `Payment event '${action}' received — no sync yet`,
          metadata: { paymentId, invoiceNumber, amount },
        };
    }
  },
};