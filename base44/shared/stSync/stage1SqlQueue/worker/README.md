# Stage 1 Worker — deployment notes (UNPROVISIONED)

The worker is **not** deployed by this artifact package. The owner deploys it
as a containerized process (e.g. AWS ECS Fargate, a small EC2, or equivalent)
with network access to the Stage 1 PostgreSQL instance only.

## Required environment

| Var | Value |
|---|---|
| `DATABASE_URL` | Stage 1 Postgres connection string |
| `WORKER_ID` | Unique per replica |
| `SHADOW_ONLY` | **must be `true`** for Stage 1 |
| `LEASE_DURATION_S` | 120 |
| `HEARTBEAT_INTERVAL_MS` | 30000 |
| `POLL_INTERVAL_MS` | 2000 |

## Concurrency model

Run N replicas. Each replica claims at most one in-flight row per
serialization key; the partial unique index `sync_requests_one_inflight_per_key`
guarantees at most one `processing` row per key in committed state, so even
if two replicas race, only one wins.

## Graceful shutdown

On SIGTERM/SIGINT the worker stops claiming, finishes the in-flight claim
(complete or retry), and exits. A stale lease is reclaimed by
`recover_stale_sync_requests` (scheduled separately).

## Observability

The worker emits one JSON log line per status transition with `request_id`,
`idempotency_key` (when available), `worker_id`, and `event`. Ship to the
platform log aggregator. Queue-side metrics come from the `vq_*` views.