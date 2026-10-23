/**
 * Shared types for the ServiceTitan event handler architecture.
 *
 * Domain + Action model: every event type is normalized into a
 * { domain, action } pair. The router routes by domain only;
 * each handler receives the action and uses switch(action) internally.
 *
 * Adding a new ServiceTitan event for an existing domain requires
 * zero router changes — the handler's default case covers it.
 */

export interface WebhookEventContext {
  domain: string;
  action: string;
  payload: any;
  event: any; // The stored ServiceTitanWebhookEvent record
  base44: any; // The Base44 SDK client (service-role) for database access
}

export interface HandlerResult {
  success: boolean;
  summary: string;
  warnings?: string[];
  metadata?: Record<string, any>;
  error?: string;
  retryable?: boolean;
  /** Override the final processing_status. Defaults to 'processed' on success, 'failed' on error. */
  finalStatus?: "processed" | "ignored";
}

export interface EventHandler {
  name: string;
  /** One or more domains this handler processes (e.g. ["appointment"]). */
  domains: string[];
  /**
   * Process an event for this domain.
   * @param action  Normalized action (e.g. "created", "updated", "canceled")
   * @param ctx     Context with domain, action, payload, event, and base44 client
   */
  handle(action: string, ctx: WebhookEventContext): Promise<HandlerResult>;
}