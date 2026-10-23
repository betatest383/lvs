import type { EventHandler } from "./types.ts";
import {
  syncAppointmentCreated,
  syncAppointmentUpdated,
  syncAppointmentCanceled,
  syncAppointmentCompleted,
  syncTechnicianAssignment,
} from "../stAppointmentSync.ts";

/**
 * Appointment Handler
 *
 * Domain: appointment
 * Handles all appointment lifecycle events via switch(action).
 *
 * This handler is thin — all database logic lives in the shared
 * stAppointmentSync module. The handler only routes actions to
 * the appropriate sync function.
 */
export const appointmentHandler: EventHandler = {
  name: "appointmentHandler",
  domains: ["appointment"],

  async handle(action, ctx) {
    const { payload, event, base44 } = ctx;

    const appointmentId =
      payload.appointment_id ||
      payload.servicetitan_appointment_id ||
      payload.crm_appointment_id ||
      event?.object_id ||
      "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "appointmentHandler",
      action,
      appointmentId,
      eventType: event?.event_type,
    }));

    switch (action) {
      case "created":
        return syncAppointmentCreated({ base44, payload, event, action });

      case "updated":
      case "rescheduled":
        return syncAppointmentUpdated({ base44, payload, event, action });

      case "canceled":
      case "cancelled":
        return syncAppointmentCanceled({ base44, payload, event, action });

      case "completed":
        return syncAppointmentCompleted({ base44, payload, event, action });

      case "assigned":
        // appointment_assigned = technician assigned to this appointment
        return syncTechnicianAssignment({ base44, payload, event, action }, false);

      default:
        // Unknown appointment action — log and ignore (idempotent no-op)
        return {
          success: true,
          summary: `Appointment event '${action}' received — no handler for this action`,
          metadata: { appointmentId, action },
          finalStatus: "ignored",
        };
    }
  },
};