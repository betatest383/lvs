-- STAGE 2G1-A — ISOLATED SQL PACKAGE
-- AUTHORED BUT NOT APPROVED FOR EXECUTION
-- DO NOT APPLY TO STAGING OR PRODUCTION
--
-- File: 01_schema_forward.sql
-- Purpose: Schema, extension, 11 minimum required tables, constraints, indexes
--
-- Governing Contract SHA-256: 9272267a17cf19bd96026489abd515ea88c08de40e0a0c3a92b275b5bba30ad7
-- Schema Proposal SHA-256:  559c3c292e2d8970c4c170d3744447654e59bbbcd44d88be661df6e8b474ee8e
--
-- This file creates the physical schema for the Stage 2G1-A inventory-ledger
-- aggregate. It defines 11 tables, 18 foreign keys, 7 check constraints,
-- 2 non-PK unique constraints, and 6 non-PK indexes.
--
-- Relationship classification:
--   Immediate composite FK: 13 (#1-13)
--   Item-consistent composite FK: 5 (#14-18)
--   Deferred composite FK: 0
--   Database-unprotected: 7 (#19-25)
--   Total: 25

-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA AND EXTENSION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS ledger;

-- pgcrypto provides gen_random_uuid if surrogate UUIDs are later introduced.
-- Currently not required by the minimum schema (all identifiers are TEXT).
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1: ledger.tenants
-- Adapter concept: tenant registry. Not tenant-scoped (no RLS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.tenants (
    tenant_id     UUID        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2: ledger.aggregates
-- Adapter concept: aggregate registry.
-- FK #1: tenant_id → tenants(tenant_id) — immediate, composite-equivalent
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.aggregates (
    tenant_id      UUID        NOT NULL,
    aggregate_id   TEXT        NOT NULL,
    aggregate_name TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, aggregate_id),
    FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 3: ledger.state_revision
-- DomainState.state_revision
-- FK #2: (tenant_id, aggregate_id) → aggregates — immediate composite
-- Concurrency lock target: SELECT ... FOR UPDATE on this row.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.state_revision (
    tenant_id        UUID        NOT NULL,
    aggregate_id     TEXT        NOT NULL,
    current_revision BIGINT      NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, aggregate_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    CHECK (current_revision >= 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 4: ledger.items
-- DomainState.items — tenant-wide reference data (NOT aggregate-scoped).
-- No FK to aggregates (tenant-wide, not aggregate-scoped).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.items (
    tenant_id              UUID NOT NULL,
    item_id                TEXT NOT NULL,
    governed_tracking_mode TEXT NOT NULL,
    governed_unit          TEXT NOT NULL,
    valuation_method      TEXT,
    PRIMARY KEY (tenant_id, item_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 5: ledger.positions
-- DomainState.positions — aggregate-scoped.
-- FK #3: (tenant_id, aggregate_id) → aggregates — immediate composite
-- FK #10: (tenant_id, item_id) → items — immediate composite
-- UNIQUE: (tenant_id, aggregate_id, position_id, item_id) — enables
--          item-consistent composite FKs from transfers_outstanding (#14-16),
--          job_issue_progress (#17), correction_provenance (#18).
-- positions.transfer_id is a nullable DomainState column preserved exactly.
-- NO FK on positions.transfer_id (relationship #19 — database-unprotected).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.positions (
    tenant_id              UUID    NOT NULL,
    aggregate_id           TEXT    NOT NULL,
    position_id            TEXT    NOT NULL,
    item_id                TEXT    NOT NULL,
    position_kind          TEXT    NOT NULL,
    ownership_class        TEXT    NOT NULL,
    origin_class           TEXT    NOT NULL,
    condition_class        TEXT    NOT NULL,
    restriction_class      TEXT    NOT NULL,
    position_quantity      NUMERIC NOT NULL,
    warehouse_location_id  TEXT,
    bin_location_id        TEXT,
    job_id                 TEXT,
    transfer_id            TEXT,
    terminal_reference     TEXT,
    PRIMARY KEY (tenant_id, aggregate_id, position_id),
    UNIQUE (tenant_id, aggregate_id, position_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, item_id)
        REFERENCES ledger.items(tenant_id, item_id),
    CHECK (position_quantity >= 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 6: ledger.company_ownership
-- DomainState.company_ownership — aggregate-scoped.
-- FK #4: (tenant_id, aggregate_id) → aggregates — immediate composite
-- FK #11: (tenant_id, item_id) → items — immediate composite
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.company_ownership (
    tenant_id             UUID    NOT NULL,
    aggregate_id          TEXT    NOT NULL,
    item_id               TEXT    NOT NULL,
    company_owned_quantity NUMERIC NOT NULL,
    PRIMARY KEY (tenant_id, aggregate_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, item_id)
        REFERENCES ledger.items(tenant_id, item_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 7: ledger.transfers_outstanding
-- DomainState.transfers_outstanding — aggregate-scoped.
-- PK: (tenant_id, aggregate_id, transfer_id) — non-partial, serves as
--      referenced key and enforces transfer_id uniqueness per aggregate.
-- FK #5: (tenant_id, aggregate_id) → aggregates — immediate composite
-- FK #12: (tenant_id, item_id) → items — immediate composite
-- FK #14: (tenant_id, aggregate_id, source_position_id, item_id) → positions — item-consistent
-- FK #15: (tenant_id, aggregate_id, destination_position_id, item_id) → positions — item-consistent
-- FK #16: (tenant_id, aggregate_id, in_transit_position_id, item_id) → positions — item-consistent
-- dispatch_event_id (#21) and receive_event_id (#22) are database-unprotected.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.transfers_outstanding (
    tenant_id              UUID    NOT NULL,
    aggregate_id           TEXT    NOT NULL,
    transfer_id            TEXT    NOT NULL,
    item_id                TEXT    NOT NULL,
    source_position_id     TEXT    NOT NULL,
    destination_position_id TEXT   NOT NULL,
    in_transit_position_id TEXT    NOT NULL,
    dispatched_quantity    NUMERIC NOT NULL,
    received_quantity      NUMERIC NOT NULL DEFAULT 0,
    status                 TEXT    NOT NULL DEFAULT 'outstanding',
    dispatch_event_id      TEXT    NOT NULL,
    receive_event_id       TEXT,
    PRIMARY KEY (tenant_id, aggregate_id, transfer_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, item_id)
        REFERENCES ledger.items(tenant_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id, source_position_id, item_id)
        REFERENCES ledger.positions(tenant_id, aggregate_id, position_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id, destination_position_id, item_id)
        REFERENCES ledger.positions(tenant_id, aggregate_id, position_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id, in_transit_position_id, item_id)
        REFERENCES ledger.positions(tenant_id, aggregate_id, position_id, item_id),
    CHECK (dispatched_quantity > 0),
    CHECK (received_quantity >= 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 8: ledger.correction_provenance
-- DomainState.correction_provenance — MUTABLE current aggregate state.
-- UPSERT-capable: adapter uses INSERT ... ON CONFLICT (tenant_id, aggregate_id, record_id)
--   DO UPDATE SET ... to replicate domain direct-assignment overwrite (Section 4.7.3).
-- FK #6: (tenant_id, aggregate_id) → aggregates — immediate composite
-- FK #18: (tenant_id, aggregate_id, original_position_id, original_item_id) → positions — item-consistent
-- original_event_id (#20) is database-unprotected (parent event_id not unique).
-- related_issue_event_id (#25) is database-unprotected (informational, nullable).
-- blocking_downstream_event_ids (#24) is database-unprotected (JSONB array).
-- Correction accepted event (#23) has no physical column — stored in recorded_operations_json.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.correction_provenance (
    tenant_id                       UUID    NOT NULL,
    aggregate_id                    TEXT    NOT NULL,
    record_id                       TEXT    NOT NULL,
    original_event_type             TEXT    NOT NULL,
    original_event_id               TEXT    NOT NULL,
    original_item_id                TEXT    NOT NULL,
    original_position_id            TEXT    NOT NULL,
    original_signed_delta           NUMERIC NOT NULL,
    original_absolute_quantity      NUMERIC NOT NULL,
    reversed_absolute_quantity       NUMERIC NOT NULL DEFAULT 0,
    remaining_reversible_quantity    NUMERIC NOT NULL,
    related_issue_event_id          TEXT,
    blocking_downstream_event_ids   JSONB   NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (tenant_id, aggregate_id, record_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, aggregate_id, original_position_id, original_item_id)
        REFERENCES ledger.positions(tenant_id, aggregate_id, position_id, item_id),
    CHECK (remaining_reversible_quantity >= 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 9: ledger.job_issue_progress
-- DomainState.job_issue_progress — aggregate-scoped.
-- FK #7: (tenant_id, aggregate_id) → aggregates — immediate composite
-- FK #13: (tenant_id, item_id) → items — immediate composite
-- FK #17: (tenant_id, aggregate_id, job_custody_position_id, item_id) → positions — item-consistent
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.job_issue_progress (
    tenant_id              UUID    NOT NULL,
    aggregate_id           TEXT    NOT NULL,
    issue_event_id         TEXT    NOT NULL,
    item_id                TEXT    NOT NULL,
    job_custody_position_id TEXT   NOT NULL,
    issued_quantity        NUMERIC NOT NULL,
    consumed_quantity      NUMERIC NOT NULL DEFAULT 0,
    returned_quantity      NUMERIC NOT NULL DEFAULT 0,
    outstanding_quantity   NUMERIC NOT NULL,
    status                 TEXT    NOT NULL DEFAULT 'open',
    created_revision       BIGINT  NOT NULL,
    last_updated_revision  BIGINT  NOT NULL,
    PRIMARY KEY (tenant_id, aggregate_id, issue_event_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, item_id)
        REFERENCES ledger.items(tenant_id, item_id),
    FOREIGN KEY (tenant_id, aggregate_id, job_custody_position_id, item_id)
        REFERENCES ledger.positions(tenant_id, aggregate_id, position_id, item_id),
    CHECK (outstanding_quantity >= 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 10: ledger.accepted_events
-- DomainState.transactions — immutable AcceptedEventRecords (append-only).
-- FK #8: (tenant_id, aggregate_id) → aggregates — immediate composite
-- PK: (tenant_id, aggregate_id, record_id) where record_id = AER-{idempotency_key}-{revision}
-- UNIQUE: (tenant_id, aggregate_id, idempotency_key) — defense-in-depth idempotency
-- NO UNIQUE on (tenant_id, aggregate_id, event_id) — event_id is NOT unique.
-- event_json is REQUIRED for full DomainState.transactions reconstruction.
-- Immutability triggers prevent UPDATE and DELETE (see 02_accepted_event_immutability.sql).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.accepted_events (
    tenant_id                   UUID        NOT NULL,
    aggregate_id                TEXT        NOT NULL,
    record_id                   TEXT        NOT NULL,
    event_id                    TEXT        NOT NULL,
    event_type                  TEXT        NOT NULL,
    idempotency_key             TEXT        NOT NULL,
    canonical_state_revision    BIGINT      NOT NULL,
    formula_version             TEXT        NOT NULL,
    event_json                  JSONB       NOT NULL,
    state_effects_json          JSONB       NOT NULL,
    recorded_operations_json    JSONB       NOT NULL,
    immutable_facts_json        JSONB       NOT NULL,
    classification_results_json JSONB       NOT NULL,
    derived_snapshots_json     JSONB       NOT NULL,
    warnings_json               JSONB       NOT NULL,
    notes                       TEXT        NOT NULL DEFAULT '',
    evaluation_timestamp        TIMESTAMPTZ NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  TEXT,
    PRIMARY KEY (tenant_id, aggregate_id, record_id),
    UNIQUE (tenant_id, aggregate_id, idempotency_key),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT,
    CHECK (canonical_state_revision > 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 11: ledger.transaction_cutoff
-- DomainState.cutoff — aggregate-scoped (single object per aggregate).
-- FK #9: (tenant_id, aggregate_id) → aggregates — immediate composite
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ledger.transaction_cutoff (
    tenant_id      UUID NOT NULL,
    aggregate_id   TEXT NOT NULL,
    cutoff_time    TEXT NOT NULL,
    freeze_status  TEXT NOT NULL DEFAULT 'none',
    PRIMARY KEY (tenant_id, aggregate_id),
    FOREIGN KEY (tenant_id, aggregate_id)
        REFERENCES ledger.aggregates(tenant_id, aggregate_id) ON DELETE RESTRICT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES (non-PK/UNIQUE)
-- ═══════════════════════════════════════════════════════════════════════════

-- accepted_events: idempotency check
CREATE INDEX idx_ae_idem
    ON ledger.accepted_events (tenant_id, aggregate_id, idempotency_key);

-- accepted_events: revision-ordered history
CREATE INDEX idx_ae_revision
    ON ledger.accepted_events (tenant_id, aggregate_id, canonical_state_revision);

-- accepted_events: findAcceptedTransactions() lookup by event_type
CREATE INDEX idx_ae_event_type
    ON ledger.accepted_events (tenant_id, aggregate_id, event_type);

-- positions: item-based position lookup
CREATE INDEX idx_positions_item
    ON ledger.positions (tenant_id, aggregate_id, item_id);

-- transfers_outstanding: outstanding transfer lookup (partial index for query optimization)
-- The PK (tenant_id, aggregate_id, transfer_id) is non-partial and enforces uniqueness.
-- This partial index optimizes the domain's state.transfers_outstanding[transferId] lookup
-- for outstanding transfers only.
CREATE INDEX idx_to_outstanding
    ON ledger.transfers_outstanding (tenant_id, aggregate_id, transfer_id)
    WHERE status = 'outstanding';

-- correction_provenance: provenance lookup by original event
CREATE INDEX idx_cp_original
    ON ledger.correction_provenance (tenant_id, aggregate_id, original_event_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF 01_schema_forward.sql
-- ═══════════════════════════════════════════════════════════════════════════
