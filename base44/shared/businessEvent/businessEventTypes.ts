/**
 * Shared type definitions for the Business Event Engine.
 *
 * These lightweight interfaces describe the shape of records exchanged
 * between the engine, delivery service, and subscriber handlers. They are
 * intentionally permissive (extra fields allowed) to avoid coupling to the
 * full entity schema.
 */

export interface BusinessEventRecord {
  id: string;
  event_id: string;
  idempotency_key: string;
  event_type: string;
  event_version: number;
  event_category: string;
  entity_type: string;
  entity_id: string;
  source_system: string;
  source_event_id?: string;
  correlation_id?: string;
  causation_id?: string;
  tenant_id?: string;
  occurred_at?: string;
  received_at?: string;
  published_at?: string;
  payload: string;
  payload_hash?: string;
  metadata?: string;
  processing_status: string;
  processing_attempts?: number;
  next_retry_at?: string | null;
  last_error?: string;
  dead_lettered_at?: string | null;
  replay_count?: number;
  last_replayed_at?: string;
  last_replayed_by?: string;
  created_by?: string;
  [key: string]: unknown;
}

export interface BusinessEventDeliveryRecord {
  id: string;
  delivery_id: string;
  business_event_id: string;
  subscriber_id: string;
  subscriber_name?: string;
  event_type?: string;
  delivery_status: string;
  processing_mode: string;
  processing_attempts: number;
  first_attempt_at?: string;
  last_attempt_at?: string;
  completed_at?: string;
  next_retry_at?: string | null;
  last_error?: string;
  dead_lettered_at?: string | null;
  output_metadata?: string;
  processing_claim_id?: string;
  processing_started_at?: string;
  processing_claimed_by?: string;
  processing_recovered_at?: string;
  replay_count?: number;
  last_replayed_at?: string;
  last_replayed_by?: string;
  last_replay_result?: string;
  [key: string]: unknown;
}

export interface EventSubscriberRecord {
  id: string;
  subscriber_id: string;
  subscriber_name: string;
  event_type: string;
  handler_reference: string;
  processing_mode: string;
  priority: number;
  is_active: boolean;
  retry_policy: string;
  maximum_attempts: number;
  timeout_seconds: number;
  activation_date?: string;
  deactivation_date?: string;
  [key: string]: unknown;
}

export interface EventRegistryRecord {
  id: string;
  event_type: string;
  display_name: string;
  description?: string;
  category: string;
  entity_type: string;
  current_version: number;
  schema_definition?: string;
  is_active: boolean;
  allows_replay: boolean;
  default_processing_mode: string;
  default_retry_policy: string;
  activation_date?: string;
  deactivation_date?: string;
  [key: string]: unknown;
}

export interface PublishEventInput {
  event_type: string;
  event_version?: number;
  entity_type: string;
  entity_id: string;
  source_system: string;
  source_event_id?: string;
  correlation_id?: string;
  causation_id?: string;
  tenant_id?: string;
  occurred_at?: string;
  payload: any;
  metadata?: Record<string, any>;
  actor?: string;
  /** Optional override of the idempotency key (otherwise derived). */
  idempotency_key?: string;
  /** Optional override of the event_id (otherwise generated). */
  event_id?: string;
}