/**
 * Customer Event Publisher (Stage 2B)
 *
 * Two publish paths through the Business Event Engine:
 *
 *   1. Inbound (servicetitan → LVC):
 *      The customerHandler publishes customer.created/updated with
 *      source_system="servicetitan". The payload stores the original
 *      webhook payload + a snapshot of the webhook event record so the
 *      inbound subscriber can faithfully reconstruct the SyncContext.
 *
 *   2. Outbound (LVC → servicetitan):
 *      The UI/service layer calls publishCustomerChanged to publish
 *      customer.created/updated with source_system="lvc_os".
 *
 * Loop Prevention:
 *   - Inbound events have source_system="servicetitan".
 *   - Outbound events have source_system="lvc_os".
 *   - The inbound subscriber ignores lvc_os events (returns skipped).
 *   - The outbound subscriber ignores servicetitan events (returns skipped).
 *   - The inbound sync (stCustomerSync) NEVER calls publishCustomerChanged —
 *     it updates the Customer entity directly. Only explicit UI/service
 *     calls publish outbound events.
 */

import { publishEvent } from "../businessEvent/businessEventEngine.ts";

/**
 * Publish an inbound Customer BusinessEvent from the webhook handler.
 * Idempotency: keyed by servicetitan:{webhook_event_id}:{action}.
 */
export async function publishInboundCustomerEvent(
  base44: any,
  action: string,
  webhookPayload: any,
  webhookEvent: any
): Promise<any> {
  const stCustomerId =
    webhookPayload?.customer_id ||
    webhookPayload?.servicetitan_customer_id ||
    webhookPayload?.id ||
    webhookEvent?.object_id ||
    "";

  return await publishEvent(base44, {
    event_type: `customer.${action}`,
    entity_type: "Customer",
    entity_id: String(stCustomerId),
    source_system: "servicetitan",
    source_event_id: webhookEvent?.id || "",
    tenant_id: webhookEvent?.tenant_id || "",
    payload: {
      webhook_payload: webhookPayload,
      webhook_event: {
        id: webhookEvent?.id || "",
        event_type: webhookEvent?.event_type || `customer_${action}`,
        object_id: String(stCustomerId),
        object_type: "customer",
        tenant_id: webhookEvent?.tenant_id || "",
        event_timestamp: webhookEvent?.event_timestamp || "",
        received_at: webhookEvent?.received_at || "",
      },
    },
    metadata: {
      migration: "stage2b",
      direction: "inbound",
      webhook_event_id: webhookEvent?.id || "",
    },
    actor: "servicetitan_webhook",
    idempotency_key: `servicetitan:${webhookEvent?.id || stCustomerId}:${action}`,
  });
}

/**
 * Publish an outbound Customer BusinessEvent from the LVC OS UI/service layer.
 * Called explicitly when a Customer is created/updated locally.
 * Each call produces a distinct event (timestamp in idempotency key).
 */
export async function publishCustomerChanged(
  base44: any,
  action: string,
  customerId: string,
  customerData: any,
  actor: string
): Promise<any> {
  return await publishEvent(base44, {
    event_type: `customer.${action}`,
    entity_type: "Customer",
    entity_id: customerId,
    source_system: "lvc_os",
    payload: {
      customer_id: customerId,
      ...customerData,
    },
    metadata: {
      migration: "stage2b",
      direction: "outbound",
    },
    actor,
    idempotency_key: `lvc_os:${customerId}:${action}:${Date.now()}`,
  });
}