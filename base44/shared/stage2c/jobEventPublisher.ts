/**
 * Job Event Publisher (Stage 2C)
 *
 * Two publish paths through the Business Event Engine:
 *
 *   1. Inbound (servicetitan → LVC):
 *      The jobHandler publishes job.created/updated/deleted/restored with
 *      source_system="servicetitan". The payload stores the original
 *      webhook payload + a snapshot of the webhook event record so the
 *      inbound subscriber can faithfully reconstruct the SyncContext.
 *
 *   2. Outbound (LVC → servicetitan):
 *      The UI/service layer calls publishJobChanged to publish
 *      job.created/updated/deleted with source_system="lvc_os".
 *
 * Loop Prevention:
 *   - Inbound events have source_system="servicetitan".
 *   - Outbound events have source_system="lvc_os".
 *   - The inbound subscriber ignores lvc_os events (returns skipped).
 *   - The outbound subscriber ignores servicetitan events (returns skipped).
 *   - The inbound sync (stJobSync) NEVER calls publishJobChanged —
 *     it updates the Job entity directly. Only explicit UI/service
 *     calls publish outbound events.
 */

import { publishEvent } from "../businessEvent/businessEventEngine.ts";

/**
 * Publish an inbound Job BusinessEvent from the webhook handler.
 * Idempotency: keyed by servicetitan:{webhook_event_id}:{action}.
 */
export async function publishInboundJobEvent(
  base44: any,
  action: string,
  webhookPayload: any,
  webhookEvent: any
): Promise<any> {
  const stJobId =
    webhookPayload?.job_id ||
    webhookPayload?.servicetitan_job_id ||
    webhookPayload?.id ||
    webhookEvent?.object_id ||
    "";

  return await publishEvent(base44, {
    event_type: `job.${action}`,
    entity_type: "Job",
    entity_id: String(stJobId),
    source_system: "servicetitan",
    source_event_id: webhookEvent?.id || "",
    tenant_id: webhookEvent?.tenant_id || "",
    payload: {
      webhook_payload: webhookPayload,
      webhook_event: {
        id: webhookEvent?.id || "",
        event_type: webhookEvent?.event_type || `job_${action}`,
        object_id: String(stJobId),
        object_type: "job",
        tenant_id: webhookEvent?.tenant_id || "",
        event_timestamp: webhookEvent?.event_timestamp || "",
        received_at: webhookEvent?.received_at || "",
      },
    },
    metadata: {
      migration: "stage2c",
      direction: "inbound",
      webhook_event_id: webhookEvent?.id || "",
    },
    actor: "servicetitan_webhook",
    idempotency_key: `servicetitan:${webhookEvent?.id || stJobId}:${action}`,
  });
}

/**
 * Publish an outbound Job BusinessEvent from the LVC OS UI/service layer.
 * Called explicitly when a Job is created/updated/deleted locally.
 * Each call produces a distinct event (timestamp in idempotency key).
 */
export async function publishJobChanged(
  base44: any,
  action: string,
  jobId: string,
  jobData: any,
  actor: string
): Promise<any> {
  return await publishEvent(base44, {
    event_type: `job.${action}`,
    entity_type: "Job",
    entity_id: jobId,
    source_system: "lvc_os",
    payload: {
      job_id: jobId,
      ...jobData,
    },
    metadata: {
      migration: "stage2c",
      direction: "outbound",
    },
    actor,
    idempotency_key: `lvc_os:${jobId}:${action}:${Date.now()}`,
  });
}