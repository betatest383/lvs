/**
 * ServiceTitan Event Router — Domain + Action Architecture
 *
 * The router normalizes every event type into a { domain, action } pair
 * and routes by domain only. Adding a new ServiceTitan event for an
 * existing domain requires zero router changes.
 *
 * Architecture:
 *   processServiceTitanWebhookEvent / replayServiceTitanWebhook
 *       │
 *       ▼
 *   routeEvent(base44, eventType, payload, event)
 *       │
 *       ├── normalizeEvent(eventType) → { domain, action }
 *       ├── domainMap.get(domain) → handler
 *       └── handler.handle(action, ctx) → HandlerResult
 *
 * To add a new ServiceTitan DOMAIN:
 *   1. Create a handler in stHandlers/<name>Handler.ts
 *   2. Register it in the handlers array below
 *
 * To add a new EVENT for an EXISTING domain:
 *   No router changes needed — the handler's switch(action) default case covers it.
 */

import type { EventHandler, HandlerResult, WebhookEventContext } from "./stHandlers/types.ts";
import { appointmentHandler } from "./stHandlers/appointmentHandler.ts";
import { jobHandler } from "./stHandlers/jobHandler.ts";
import { customerHandler } from "./stHandlers/customerHandler.ts";
import { invoiceHandler } from "./stHandlers/invoiceHandler.ts";
import { paymentHandler } from "./stHandlers/paymentHandler.ts";
import { purchaseOrderHandler } from "./stHandlers/purchaseOrderHandler.ts";
import { inventoryTransferHandler } from "./stHandlers/inventoryTransferHandler.ts";
import { estimateHandler } from "./stHandlers/estimateHandler.ts";
import { technicianHandler } from "./stHandlers/technicianHandler.ts";
import { unknownHandler } from "./stHandlers/unknownHandler.ts";
import { addTimelineEntry } from "./stTimeline.ts";
import { normalizeEvent } from "./stWebhookHelpers.ts";

/**
 * Handler registry — ordered by priority.
 * To add a new domain, create a handler and add it here.
 */
const handlers: EventHandler[] = [
  appointmentHandler,
  jobHandler,
  customerHandler,
  invoiceHandler,
  paymentHandler,
  purchaseOrderHandler,
  inventoryTransferHandler,
  estimateHandler,
  technicianHandler,
];

// Build domain→handler lookup map
const domainMap = new Map<string, EventHandler>();
for (const handler of handlers) {
  for (const domain of handler.domains) {
    domainMap.set(domain, handler);
  }
}

// normalizeEvent is imported from stWebhookHelpers.ts — the single source of truth.

/**
 * Returns the handler for a given event type by normalizing to its domain.
 * Falls back to unknownHandler if the domain is not registered.
 */
export function getHandler(eventType: string): EventHandler {
  const { domain } = normalizeEvent(eventType);
  return domainMap.get(domain) || unknownHandler;
}

/**
 * Returns the handler for a specific domain directly.
 */
export function getDomainHandler(domain: string): EventHandler {
  return domainMap.get(domain) || unknownHandler;
}

/**
 * Route a webhook event to its handler and return a structured result.
 *
 * Steps:
 *   1. Normalize the event type → { domain, action }
 *   2. Look up the handler by domain
 *   3. Call handler.handle(action, ctx)
 *   4. Log Domain, Action, Handler, Duration, Result
 *   5. Create timeline entries (routing, handler_started, handler_finished)
 *
 * Never throws — handler errors are caught and returned as a failed
 * HandlerResult with retryable=true. The _forceFail test hook is
 * preserved for retry mechanism testing.
 *
 * @param base44     The Base44 SDK client (for timeline entries)
 * @param eventType  Raw event type string from the webhook payload
 * @param payload    Parsed webhook payload
 * @param event      The stored ServiceTitanWebhookEvent record
 * @returns          HandlerResult with success/failure details
 */
export async function routeEvent(
  base44: any,
  eventType: string,
  payload: any,
  event: any
): Promise<HandlerResult> {
  const startTime = Date.now();
  const { domain, action } = normalizeEvent(eventType);
  const handler = domainMap.get(domain) || unknownHandler;

  // Test hook: forced failure for retry / DLQ mechanism testing
  if (payload?._forceFail) {
    const duration = Date.now() - startTime;
    console.log("[ST ROUTER]", JSON.stringify({
      domain,
      action,
      handler: handler.name,
      duration,
      result: "forced_failure",
    }));
    if (event?.id) {
      await addTimelineEntry(base44, event.id, "handler_started",
        `Handler ${handler.name} started (forced failure test)`, "warning", 0, { domain, action });
      await addTimelineEntry(base44, event.id, "handler_finished",
        "Forced failure for testing", "error", 0, { domain, action });
    }
    return {
      success: false,
      summary: "Forced failure for testing",
      error: "Forced failure for testing (payload._forceFail = true)",
      retryable: true,
    };
  }

  try {
    const ctx: WebhookEventContext = { domain, action, payload, event, base44 };

    if (event?.id) {
      await addTimelineEntry(base44, event.id, "routing",
        `Domain: ${domain} → Handler: ${handler.name}`, "info", undefined, { domain, action });
      await addTimelineEntry(base44, event.id, "handler_started",
        `${handler.name}.handle('${action}')`, "info", undefined, { domain, action });
    }

    const result = await handler.handle(action, ctx);
    const duration = Date.now() - startTime;

    console.log("[ST ROUTER]", JSON.stringify({
      domain,
      action,
      handler: handler.name,
      duration,
      result: result.success ? "success" : "failed",
    }));

    console.log("[ST HANDLER]", JSON.stringify({
      handler: handler.name,
      summary: result.summary,
    }));

    if (event?.id) {
      await addTimelineEntry(base44, event.id, "handler_finished",
        result.success ? result.summary : `Handler failed: ${result.error || result.summary}`,
        result.success ? "success" : "error",
        duration,
        { domain, action, ...result.metadata, warnings: result.warnings || [] },
      );
    }

    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.log("[ST ROUTER]", JSON.stringify({
      domain,
      action,
      handler: handler.name,
      duration,
      result: "error",
      error: errorMsg,
    }));

    if (event?.id) {
      await addTimelineEntry(base44, event.id, "handler_finished",
        `Handler threw error: ${errorMsg}`, "error", duration, { domain, action });
    }

    return {
      success: false,
      summary: `Handler '${handler.name}' threw an error`,
      error: errorMsg,
      retryable: true,
    };
  }
}