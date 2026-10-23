import type { EventHandler } from "./types.ts";

/**
 * Purchase Order Handler
 *
 * Domain: purchase_order
 * Handles all purchase order lifecycle events via switch(action).
 *
 * Future: sync to PurchaseOrder entity.
 */
export const purchaseOrderHandler: EventHandler = {
  name: "purchaseOrderHandler",
  domains: ["purchase_order"],

  async handle(action, { payload, event }) {
    const poId = payload.po_id || payload.id || event.object_id || "";
    const poNumber = payload.po_number || "";
    const vendor = payload.vendor || "";
    const status = payload.status || "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "purchaseOrderHandler",
      action,
      poId,
      poNumber,
      vendor,
      status,
    }));

    switch (action) {
      case "created":
        return {
          success: true,
          summary: `PO '${poNumber}' created for ${vendor} — no sync yet`,
          metadata: { poId, poNumber, vendor, status },
        };
      case "received":
        return {
          success: true,
          summary: `PO '${poNumber}' received — no sync yet`,
          metadata: { poId, poNumber, vendor, status },
        };
      case "updated":
        return {
          success: true,
          summary: `PO '${poNumber}' updated — no sync yet`,
          metadata: { poId, poNumber, vendor, status },
        };
      default:
        return {
          success: true,
          summary: `Purchase order event '${action}' received — no sync yet`,
          metadata: { poId, poNumber, vendor, status },
        };
    }
  },
};