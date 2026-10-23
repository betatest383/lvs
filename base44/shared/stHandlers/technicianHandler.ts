import type { EventHandler } from "./types.ts";
import { syncTechnicianAssignment } from "../stAppointmentSync.ts";

/**
 * Technician Handler
 *
 * Domain: technician
 * Handles technician assignment events via switch(action).
 *
 * This handler is thin — all database logic lives in the shared
 * stAppointmentSync module. Technician assignment/unassignment
 * events are routed to the appointment sync service which updates
 * the local Appointment record's technician fields.
 */
export const technicianHandler: EventHandler = {
  name: "technicianHandler",
  domains: ["technician"],

  async handle(action, ctx) {
    const { payload, event, base44 } = ctx;

    const technicianId = payload.technician_id || payload.servicetitan_technician_id || "";
    const technicianName = payload.technician_name || payload.servicetitan_technician_name || "";
    const jobNumber = payload.job_number || payload.servicetitan_job_number || "";
    const appointmentId =
      payload.appointment_id ||
      payload.servicetitan_appointment_id ||
      payload.crm_appointment_id ||
      event?.object_id ||
      "";

    console.log("[ST HANDLER]", JSON.stringify({
      handler: "technicianHandler",
      action,
      technicianId,
      technicianName,
      jobNumber,
      appointmentId,
    }));

    switch (action) {
      case "assigned":
        return syncTechnicianAssignment(
          { base44, payload, event, action },
          false
        );

      case "unassigned":
        return syncTechnicianAssignment(
          { base44, payload, event, action },
          true
        );

      default:
        // Unknown technician action — log and ignore
        return {
          success: true,
          summary: `Technician event '${action}' received — no handler for this action`,
          metadata: { technicianId, technicianName, jobNumber, appointmentId, action },
          finalStatus: "ignored",
        };
    }
  },
};