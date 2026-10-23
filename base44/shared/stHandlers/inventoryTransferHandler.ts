import type { EventHandler } from "./types.ts";

/**
 * Inventory Transfer Handler
 *
 * Domains: inventory_transfer, truck, transfer_sheet
 * Handles all inventory and material transfer events via switch(action).
 *
 * Future: sync to WarehouseTransfer / MaterialTransferSheet entities.
 */
export const inventoryTransferHandler: EventHandler = {
  name: "inventoryTransferHandler",
  domains: ["inventory_transfer", "truck", "transfer_sheet"],

  async handle(action, { payload, event }) {
    const transferSheetId = payload.transfer_sheet_id || payload.id || event.object_id || "";
    const truckNumber = payload.truck_number || payload.truck || "";
    const fromLocation = payload.from_location || "";
    const toLocation = payload.to_location || "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "inventoryTransferHandler",
      action,
      transferSheetId,
      truckNumber,
      fromLocation,
      toLocation,
    }));

    switch (action) {
      case "created":
        return {
          success: true,
          summary: `Transfer '${transferSheetId}' created — no sync yet`,
          metadata: { transferSheetId, truckNumber, fromLocation, toLocation },
        };
      case "updated":
        return {
          success: true,
          summary: `Transfer '${transferSheetId}' updated — no sync yet`,
          metadata: { transferSheetId, truckNumber, fromLocation, toLocation },
        };
      case "assigned":
        return {
          success: true,
          summary: `Truck '${truckNumber}' assigned — no sync yet`,
          metadata: { transferSheetId, truckNumber, fromLocation, toLocation },
        };
      default:
        return {
          success: true,
          summary: `Inventory/transfer event '${action}' received — no sync yet`,
          metadata: { transferSheetId, truckNumber, fromLocation, toLocation },
        };
    }
  },
};