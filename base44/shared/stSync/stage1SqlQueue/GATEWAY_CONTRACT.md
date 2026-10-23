# Authenticated Submission Gateway Contract

UNPROVISIONED. This is the contract the gateway must implement. The gateway
itself (PostgREST behind an authenticated reverse proxy, or an equivalent
lightweight HTTPS service) is provisioned separately by the owner and is
**not** part of this artifact package.

## Endpoint

```
POST /sync-requests
Content-Type: application/json
Authorization: Bearer <JWT>
```

## Authentication

- Caller authenticates with a short-TTL JWT signed with a shared secret
  (`PG_GATEWAY_JWT_SECRET`). The gateway validates signature + expiry.
- Replay protection: `idempotency_key` (server-enforced unique) + JWT `iat`.
- The gateway never exposes raw PostgreSQL credentials.

## Request body

| Field | Required | Notes |
|---|:---:|---|
| `idempotency_key` | yes | Deterministic per trigger type (see below). |
| `tenant_id` | yes | Validated against a provisioned-tenant allow-list. |
| `environment` | yes | `integration` / `production`. |
| `domain` | yes | `customer`/`job`/`appointment`/`purchase_order`/`transfer`/`inventory`. |
| `sync_mode` | yes | `incremental`/`backfill`/`on_demand_hydration`/`recovery`. |
| `trigger_type` | yes | `webhook`/`scheduled`/`manual`/`retry`/`recovery`/`on_demand_hydration`. |
| `source_event_id` | no | Webhook event id. |
| `requested_by` | no | User id (manual) or `system`. |
| `window_start` | no | ISO-8601. |
| `window_end` | no | ISO-8601. |
| `correlation_id` | no | |
| `payload_json` | no | Webhook payload snapshot. |
| `max_attempts` | no | Default 5. |

Unknown fields are rejected where practical (strict mode).

## Idempotency-key construction

- Webhook: `servicetitan:{env}:{tenant}:{domain}:webhook:{source_event_id}`
- Scheduled: `servicetitan:{env}:{tenant}:{domain}:scheduled:{window_start}:{window_end}`
- Manual: `servicetitan:{env}:{tenant}:{domain}:manual:{request_token}`
- Recovery: `servicetitan:{env}:{tenant}:{domain}:recovery:{source_event_id}:{recovery_version}`
- On-demand hydration: `servicetitan:{env}:{tenant}:{domain}:on_demand:{source_event_id}`

Retries must **not** mint a fresh timestamp-only key.

## Responses

| HTTP | outcome | body |
|---|---|---|
| 201 | accepted | `{ "outcome":"accepted", "request_id":"<uuid>" }` |
| 200 | duplicate | `{ "outcome":"duplicate", "request_id":"<uuid>" }` |
| 400 | rejected | `{ "outcome":"rejected", "error":"..." }` |
| 401/403 | auth failure | `{ "outcome":"rejected", "error":"auth" }` |
| 409 | (reserved) | `{ "outcome":"rejected", "error":"conflict" }` |
| 500/503 | infra failure | `{ "outcome":"error", "error":"..." }` |

On 5xx the caller (trigger) must retry with backoff and never silently drop.

## Tenant / domain validation

- Tenant must be in the provisioned allow-list; otherwise 400.
- Domain must be one of the enumerated values; otherwise 400.
- `window_start > window_end` → 400.

## Logging

Every request logs: `request_id`, `idempotency_key`, `correlation_id`,
`tenant_id`, `domain`, `serialization_key`, outcome. No secrets or full
payloads are logged.