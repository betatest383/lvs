/**
 * Appointment Subscriber Registration (Stage 2D)
 *
 * Registers ONLY the inbound Appointment subscriber handler.
 *
 * Stage 2D is INBOUND-ONLY (ServiceTitan → LVC OS).
 * The outbound subscriber has been removed. Appointment API_PUSH is
 * unsupported and unavailable. No ServiceTitan-bound deliveries can
 * be created for Appointment events.
 *
 * This module is imported (side-effect) by:
 *   - processServiceTitanWebhookEvent (publishes inbound appointment events)
 *   - manageBusinessEvent (publishes + processes deliveries)
 *   - validateStage2DAppointment (validation harness)
 *   - validateStage2DAppointmentCrossEntity (cross-entity validation)
 *
 * Auto-registration on import ensures the inbound handler is available
 * before any publishEvent call for appointment event types.
 */

import { registerInboundSubscriber } from "./appointmentInboundSubscriber.ts";

export { INBOUND_HANDLER_REF } from "./appointmentInboundSubscriber.ts";

export function registerAppointmentSubscribers(): void {
  registerInboundSubscriber();
}

// Auto-register on import
registerAppointmentSubscribers();