/**
 * Customer Subscriber Registration (Stage 2B)
 *
 * Registers the inbound and outbound Customer subscriber handlers in the
 * in-code handler registry. Must be imported (side-effect) by any function
 * that calls publishEvent or processNextDelivery for customer events:
 *   - processServiceTitanWebhookEvent (runs customerHandler which publishes)
 *   - manageBusinessEvent (publishes + processes deliveries)
 *   - manageCustomerSync (publishes test events)
 *   - validateStage2BCustomer (validation harness)
 *
 * The auto-register on import ensures handlers are available before any
 * publishEvent call.
 */

import { registerInboundSubscriber } from "./customerInboundSubscriber.ts";
import { registerOutboundSubscriber } from "./customerOutboundSubscriber.ts";

export { INBOUND_HANDLER_REF } from "./customerInboundSubscriber.ts";
export { OUTBOUND_HANDLER_REF } from "./customerOutboundSubscriber.ts";

export function registerCustomerSubscribers(): void {
  registerInboundSubscriber();
  registerOutboundSubscriber();
}

// Auto-register on import
registerCustomerSubscribers();