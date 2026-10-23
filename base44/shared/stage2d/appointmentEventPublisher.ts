/**
 * Appointment Event Publisher (Stage 2D)
 *
 * Two publish paths through the Business Event Engine:
 *
 *   1. Inbound (servicetitan → LVC):
 *      The appointmentHandler publishes appointment.created/updated/canceled/
 *      completed/assigned/rescheduled with source_system="servicetitan".
 *      The payload stores the original webhook payload + a snapshot of the
 *      webhook event record so the inbound subscriber can faithfully
 *      reconstruct the SyncContext.
 *
 *   2. Outbound (LVC → servicetitan):
 *      The UI/service layer calls publishAppointmentChanged to publish
 *      appointment.created/updated/canceled with source_system="lvc_os".
 *
 * Loop Prevention:
 *   - Inbound events have source_system="servicetitan".
 *   - Outbound events have source_system="lvc_os".
 *   - The inbound subscriber ignores lvc_os events (returns skipped).
 *   - The outbound subscriber ignores servicetitan events (returns skipped).
 *   - The inbound sync (stAppointmentSync) NEVER calls publishAppointmentChanged —
 *     it updates the Appointment entity directly. Only explicit UI/service
 *     calls publish outbound events.
 */

import { publishEvent } from "../businessEvent/businessEventEngine.ts";

/**
 * Publish an inbound Appointment BusinessEvent from the webhook handler.
 * Idempotency: keyed by servicetitan:{webhook_event_id}:{action}.
 */
export async function publishInboundAppointmentEvent(
  base44: any,
  action: string,
  webhookPayload: any,
  webhookEvent: any
): Promise<any> {
  const stApptId =
    webhookPayload?.appointment_id ||
    webhookPayload?.servicetitan_appointment_id ||
    webhookPayload?.id ||
    webhookEvent?.object_id ||
    "";

  return await publishEvent(base44, {
    event_type: `appointment.${action}`,
    entity_type: "Appointment",
    entity_id: String(stApptId),
    source_system: "servicetitan",
    source_event_id: webhookEvent?.id || "",
    tenant_id: webhookEvent?.tenant_id || "",
    payload: {
      webhook_payload: webhookPayload,
      webhook_event: {
        id: webhookEvent?.id || "",
        event_type: webhookEvent?.event_type || `appointment_${action}`,
        object_id: String(stApptId),
        object_type: "appointment",
        tenant_id: webhookEvent?.tenant_id || "",
        event_timestamp: webhookEvent?.event_timestamp || "",
        received_at: webhookEvent?.received_at || "",
      },
    },
    metadata: {
      migration: "stage2d",
      direction: "inbound",
      webhook_event_id: webhookEvent?.id || "",
    },
    actor: "servicetitan_webhook",
    idempotency_key: `servicetitan:${webhookEvent?.id || stApptId}:${action}`,
  });
}

/**
 * Publish an outbound Appointment BusinessEvent from the LVC OS UI/service layer.
 * Called explicitly when an Appointment is created/updated/deleted locally.
 * Each call produces a distinct event (timestamp in idempotency key).
 */
export async function publishAppointmentChanged(
  base44: any,
  action: string,
  appointmentId: string,
  appointmentData: any,
  actor: string
): Promise<any> {
  return await publishEvent(base44, {
    event_type: `appointment.${action}`,
    entity_type: "Appointment",
    entity_id: appointmentId,
    source_system: "lvc_os",
    payload: {
      appointment_id: appointmentId,
      ...appointmentData,
    },
    metadata: {
      migration: "stage2d",
      direction: "outbound",
    },
    actor,
    idempotency_key: `lvc_os:${appointmentId}:${action}:${Date.now()}`,
  });
}