/**
 * Job Subscriber Registration (Stage 2C)
 *
 * Registers the inbound and outbound Job subscriber handlers in the
 * in-code handler registry. Must be imported (side-effect) by any function
 * that calls publishEvent or processNextDelivery for job events:
 *   - processServiceTitanWebhookEvent (runs jobHandler which publishes)
 *   - manageBusinessEvent (publishes + processes deliveries)
 *   - manageJobSync (publishes test events)
 *   - validateStage2CJob (validation harness)
 *
 * The auto-register on import ensures handlers are available before any
 * publishEvent call.
 */

import { registerInboundSubscriber } from "./jobInboundSubscriber.ts";
import { registerOutboundSubscriber } from "./jobOutboundSubscriber.ts";

export { INBOUND_HANDLER_REF } from "./jobInboundSubscriber.ts";
export { OUTBOUND_HANDLER_REF } from "./jobOutboundSubscriber.ts";

export function registerJobSubscribers(): void {
  registerInboundSubscriber();
  registerOutboundSubscriber();
}

// Auto-register on import
registerJobSubscribers();