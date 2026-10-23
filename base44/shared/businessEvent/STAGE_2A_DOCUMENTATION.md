# Stage 2A — Business Event Engine & Integration Infrastructure

This document defines the permanent integration infrastructure delivered in
Stage 2A of the LVC OS Enterprise Architecture v1.0 implementation. It is a
purely additive layer — no existing ServiceTitan production behavior has
been modified, and no Customer/Job/Appointment synchronization has been
migrated.

---

## 1. Boundary: ServiceTitanWebhookEvent vs BusinessEvent

These are **separate lifecycle layers** and must not be confused:

| Layer | Record | Purpose | Retry Scope |
|-------|--------|---------|-------------|
| External event translation | `ServiceTitanWebhookEvent` | Receive + translate an **external** ServiceTitan webhook into LVC OS | Receiving/translating the external event |
| Internal event delivery | `BusinessEvent` | Deliver an **internal normalized** business occurrence to subscribers | Delivering the internal event to registered subscribers |

The Business Event Engine never calls ServiceTitan. Adapters (Stage 2B)
translate between the two layers: an inbound ST webhook becomes a
BusinessEvent; an outbound BusinessEvent becomes an ST API call.

---

## 2. Business Event Lifecycle

```
pending → dispatching → processed
                   ↘ failed → (retry) → processed
                   ↘ dead_letter (all deliveries exhausted)
```

- **pending** — persisted but not yet dispatched.
- **dispatching** — at least one delivery is in flight (pending/processing/delivered).
- **processed** — all required subscribers reached a terminal state (completed, dead_letter, or skipped).
- **failed** — at least one delivery is retryable-failed; the event will retry.
- **dead_letter** — rollup state when deliveries are exhausted (carries `dead_lettered_at`).
- **ignored** — non-retryable skip.

The event's `processing_status` is a **rollup** computed from its delivery
records. The authoritative per-subscriber state lives on
`BusinessEventDelivery`.

---

## 3. Subscriber Lifecycle

```
pending → processing → completed
                  ↘ failed → (retry) → completed
                  ↘ dead_letter (max attempts)
                  ↘ skipped (non-retryable, handler missing)
```

- **pending** — delivery created, awaiting dispatch.
- **processing** — claimed by a worker (atomic claim via `processing_claim_id`).
- **delivered** — handler returned success; async finalization pending.
- **completed** — terminal success.
- **failed** — retryable failure; `next_retry_at` scheduled.
- **dead_letter** — `maximum_attempts` exhausted.
- **skipped** — non-retryable failure (e.g. handler not registered).

Each BusinessEvent→Subscriber pair has its own delivery record, so one
subscriber's failure never incorrectly marks the whole event as failed.

---

## 4. Retry Behavior

- Exponential backoff: 1m, 5m, 15m, 60m (mirrors the proven ST webhook pattern).
- `MAX_DELIVERY_RETRIES = 5` (configurable per subscriber via `maximum_attempts`).
- Stale-processing recovery: a delivery stuck in `processing` longer than
  `DELIVERY_PROCESSING_TIMEOUT_MINUTES` (10) is eligible for re-claim.
- Retry is **delivery-scoped**, not event-scoped. The event's `next_retry_at`
  is a rollup (earliest pending delivery retry).

---

## 5. Dead-Letter Behavior

A delivery enters `dead_letter` when:
- `retryable === false` (permanent failure), OR
- `processing_attempts >= maximum_attempts`.

Dead-lettered deliveries are eligible for replay (if the event type allows it).

---

## 6. Replay Behavior

- `replayDelivery(deliveryId, user)` resets a dead-lettered/failed delivery
  to `pending`, increments `replay_count`, records `last_replayed_at/by`,
  and immediately re-dispatches.
- Replay is allowed only when `EventRegistry.allows_replay === true`.
- Replay metadata is preserved on the delivery record for audit.

---

## 7. Event Versioning

- Each event type has a `current_version` in `EventRegistry`.
- Publishing an event with `event_version > current_version` is rejected.
- Publishing with `event_version <= current_version` is allowed (historical
  events retain their original version), enabling backward compatibility
  when schemas evolve.

---

## 8. Correlation & Causation

- **correlation_id** — groups a chain of related events sharing a business
  context (e.g. all events for a single customer onboarding flow).
- **causation_id** — the BusinessEvent ID that *caused* this event. Enables
  causal-chain reconstruction without coupling modules: a subscriber may
  emit a new event with `causation_id` set to the event it just processed.

---

## 9. SyncPolicy Lifecycle

```
draft → pending_approval → active → inactive → archived
```

- Synchronization is configured per `(entity_type, external_system)` pair —
  never globally. One active policy per pair.
- **Versioning**: `versionPolicy` archives the current version and creates a
  new one with incremented `version`. History is preserved.
- **Effective resolution**: `getEffectivePolicy` returns the active policy
  within its `effective_from`/`effective_to` window.
- **Sync modes**: `TWO_WAY`, `EXTERNAL_TO_LVC`, `LVC_TO_EXTERNAL`, `LVC_ONLY`.
- **Conflict strategies**: `LVC_WINS`, `EXTERNAL_WINS`,
  `MOST_RECENT_CHANGE_WINS`, `MANUAL_REVIEW`, `FIELD_LEVEL_RULES`.
- **Capability validation**: a policy cannot be activated for a direction
  the integration's Capability Registry does not support.

Stage 2A creates SyncPolicy storage only. Existing ServiceTitan sync flows
do **not** yet depend on SyncPolicy (that connection is Stage 2B).

---

## 10. Field-Level Write Authority Semantics

Field-Level Write Authority controls **which system may automatically write
a specific field during synchronization**. It does NOT transfer record
ownership — the LVC OS Master Data module remains the authoritative owner
of the business record.

- **LVC_OS** — only LVC OS may auto-write this field.
- **EXTERNAL_SYSTEM** — the external system may auto-write this field.
- **MOST_RECENT** — most recent change wins.
- **MANUAL_REVIEW** — conflicts require manual resolution.

Rules can be policy-scoped or global defaults. Resolution falls back from
policy-scoped → global → default `LVC_OS`.

---

## 11. Capability Registry Semantics

The `IntegrationCapabilityRegistry` declares what each external integration
is technically capable of supporting. Implementation status is
differentiated:

- **implemented** — working in production.
- **api_supported_not_implemented** — API verified but not wired.
- **unsupported** — confirmed unsupported.
- **unknown_requires_verification** — not yet verified.

The registry **prevents** a SyncPolicy from enabling a direction or
operation the integration cannot support. Only verified ServiceTitan
capabilities are seeded (Stage 2A baseline).

---

## 12. Adapter Registry Semantics

The `IntegrationAdapterRegistry` describes which adapter implementation
serves an external system. It records identity, auth strategy, health, and
activation state. **No credentials are stored** — authentication secrets
remain in the approved secret-management mechanism (Deno.env).

---

## 13. Files Added (Stage 2A)

### Entities (8)
- `base44/entities/BusinessEvent.jsonc`
- `base44/entities/EventRegistry.jsonc`
- `base44/entities/EventSubscriber.jsonc`
- `base44/entities/BusinessEventDelivery.jsonc`
- `base44/entities/SyncPolicy.jsonc`
- `base44/entities/SyncFieldAuthority.jsonc`
- `base44/entities/IntegrationCapabilityRegistry.jsonc`
- `base44/entities/IntegrationAdapterRegistry.jsonc`

### Shared Services (10)
- `base44/shared/businessEvent/businessEventTypes.ts`
- `base44/shared/businessEvent/eventRetryUtils.ts`
- `base44/shared/businessEvent/subscriberHandlerRegistry.ts`
- `base44/shared/businessEvent/eventRegistryService.ts`
- `base44/shared/businessEvent/eventSubscriberService.ts`
- `base44/shared/businessEvent/eventDeliveryService.ts`
- `base44/shared/businessEvent/businessEventEngine.ts`
- `base44/shared/syncPolicy/syncPolicyService.ts`
- `base44/shared/syncPolicy/fieldAuthorityService.ts`
- `base44/shared/integration/integrationCapabilityService.ts`
- `base44/shared/integration/integrationAdapterService.ts`

### Backend Functions (2)
- `base44/functions/manageBusinessEvent/entry.ts`
- `base44/functions/validateStage2AInfrastructure/entry.ts`

### Documentation (1)
- `base44/shared/businessEvent/STAGE_2A_DOCUMENTATION.md`

---

## 14. Existing Components Intentionally Left Unchanged

All existing ServiceTitan synchronization components are preserved as-is:

- Generic Sync Engine (`stSyncEngine.ts`)
- ServiceTitan Sync Adapter contract (`stSyncAdapter.ts`)
- Job / Appointment / Customer Compatibility adapters
- Webhook Receiver (`servicetitanWebhook`)
- Webhook Event Processor (`processServiceTitanWebhookEvent`)
- Event Router (`stEventRouter`)
- Retry and dead-letter handling (ST webhook layer)
- Replay capability (`replayServiceTitanWebhook`)
- Timeline audit (`stTimeline.ts`)
- Watermark tracking (`stSyncWatermark.ts`)
- Sync cursor locking (`stSyncLock.ts`)
- Recovery scanning (`stSyncRecovery.ts`)
- Idempotency protection
- Validation harnesses (`verifyJobSyncWriteMode`, `validateSyncAdapters`)

No existing Customer, Job, or Appointment sync flow has been migrated.

---

## 15. Stage 2B Readiness

Stage 2A delivers the framework. Stage 2B will:

1. Wire BusinessEvent emission into ST domain handlers (inbound).
2. Migrate sync services to subscribe to BusinessEvents.
3. Connect SyncPolicy to the existing sync engine (mode/field-authority lookups).
4. Implement outbound sync as a BusinessEvent subscriber.

The infrastructure is independently testable and ready for Stage 2B.