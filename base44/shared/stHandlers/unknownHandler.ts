import type { EventHandler } from "./types.ts";

/**
 * Unknown Event Handler (catch-all)
 *
 * Handles any event whose domain is not registered with the router.
 * Never throws — returns a success result with finalStatus 'ignored'
 * so the processor marks the event as ignored without failing.
 */
export const unknownHandler: EventHandler = {
  name: "unknownHandler",
  domains: [], // catch-all — not registered for specific domains

  async handle(action, { payload, event }) {
    console.log("[ST HANDLER]", JSON.stringify({
      handler: "unknownHandler",
      action,
      objectId: event?.object_id || "",
      summary: "Unknown domain — ignored",
    }));

    return {
      success: true,
      summary: `Unknown event (action '${action}') — ignored`,
      warnings: ["Event domain not registered with any handler"],
      metadata: {},
      finalStatus: "ignored",
    };
  },
};