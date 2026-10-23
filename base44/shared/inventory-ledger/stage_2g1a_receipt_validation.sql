-- ═══════════════════════════════════════════════════════════════════
-- STAGE 2G1-A RECEIPT VALIDATION SCRIPT
-- PostgreSQL 15.x — Local validation only
-- Formula version: 2g1a-v1.0.0
-- Canon version: pg-jsonb-v1
-- ═══════════════════════════════════════════════════════════════════

-- ═══ Section 1: Extension schema + pgcrypto ═══
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- ═══ Section 2: Application schema ═══
CREATE SCHEMA IF NOT EXISTS ledger;

-- ═══ Section 3: Roles (NOLOGIN, non-superuser) ═══
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_migration_owner') THEN
        CREATE ROLE ledger_migration_owner NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_function_owner') THEN
        CREATE ROLE ledger_function_owner NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_app_user') THEN
        CREATE ROLE ledger_app_user NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_readonly') THEN
        CREATE ROLE ledger_readonly NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_unprivileged') THEN
        CREATE ROLE test_unprivileged NOLOGIN;
    END IF;
END;
$$;

-- ═══ Section 4: Schema ownership + CREATE revocations ═══
ALTER SCHEMA ledger OWNER TO ledger_migration_owner;
ALTER SCHEMA extensions OWNER TO ledger_migration_owner;
REVOKE CREATE ON SCHEMA ledger FROM PUBLIC;
REVOKE CREATE ON SCHEMA extensions FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA extensions TO ledger_function_owner;

-- ═══ Section 5: Tables (creation order) ═══

-- 5.1 tenants
CREATE TABLE IF NOT EXISTS ledger.tenants (
    tenant_id   UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    tenant_code TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_code ON ledger.tenants(tenant_code);

-- 5.2 units_of_measure (global reference, no tenant)
CREATE TABLE IF NOT EXISTS ledger.units_of_measure (
    uom_code    TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

-- 5.3 warehouses
CREATE TABLE IF NOT EXISTS ledger.warehouses (
    warehouse_id   UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id      UUID NOT NULL,
    warehouse_code TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_warehouses PRIMARY KEY (warehouse_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wh_tenant_id_wh_id ON ledger.warehouses(tenant_id, warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wh_tenant_code ON ledger.warehouses(tenant_id, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_wh_tenant ON ledger.warehouses(tenant_id);
DO $$ BEGIN
ALTER TABLE ledger.warehouses ADD CONSTRAINT fk_wh_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.4 items
CREATE TABLE IF NOT EXISTS ledger.items (
    item_id        UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id      UUID NOT NULL,
    sku            TEXT NOT NULL,
    name           TEXT NOT NULL,
    governed_unit TEXT NOT NULL,
    tracking_mode  TEXT NOT NULL DEFAULT 'ordinary',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_items PRIMARY KEY (item_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_tenant_id_item_id ON ledger.items(tenant_id, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_tenant_sku ON ledger.items(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_items_tenant ON ledger.items(tenant_id);
DO $$ BEGIN
ALTER TABLE ledger.items ADD CONSTRAINT fk_items_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE ledger.items ADD CONSTRAINT fk_items_uom FOREIGN KEY (governed_unit) REFERENCES ledger.units_of_measure(uom_code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE ledger.items ADD CONSTRAINT chk_items_tracking CHECK (tracking_mode = 'ordinary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.5 positions
CREATE TABLE IF NOT EXISTS ledger.positions (
    position_id      UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    item_id          UUID NOT NULL,
    warehouse_id     UUID NOT NULL,
    position_type    TEXT NOT NULL,
    governed_unit    TEXT NOT NULL,
    ownership_class  TEXT NOT NULL DEFAULT 'company_owned',
    position_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_archived      BOOLEAN NOT NULL DEFAULT false,
    is_locked        BOOLEAN NOT NULL DEFAULT false,
    can_receive      BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_positions PRIMARY KEY (position_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tenant_id_pos_id ON ledger.positions(tenant_id, position_id);
CREATE INDEX IF NOT EXISTS idx_pos_tenant_item_wh_type ON ledger.positions(tenant_id, item_id, warehouse_id, position_type);
CREATE INDEX IF NOT EXISTS idx_pos_tenant ON ledger.positions(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT fk_pos_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT fk_pos_item FOREIGN KEY (tenant_id, item_id) REFERENCES ledger.items(tenant_id, item_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT fk_pos_wh FOREIGN KEY (tenant_id, warehouse_id) REFERENCES ledger.warehouses(tenant_id, warehouse_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT fk_pos_uom FOREIGN KEY (governed_unit) REFERENCES ledger.units_of_measure(uom_code); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT chk_pos_type CHECK (position_type IN ('physical_warehouse','physical_truck','custody_job','logical_in_transit','terminal_job_cost')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT chk_pos_ownership CHECK (ownership_class = 'company_owned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.positions ADD CONSTRAINT chk_pos_qty CHECK (position_quantity >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.6 vendors
CREATE TABLE IF NOT EXISTS ledger.vendors (
    vendor_id    UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    vendor_code  TEXT NOT NULL,
    vendor_name  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_vendors PRIMARY KEY (vendor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_tenant_id_vid ON ledger.vendors(tenant_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_tenant_code ON ledger.vendors(tenant_id, vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON ledger.vendors(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.vendors ADD CONSTRAINT fk_vendors_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.7 purchase_orders
CREATE TABLE IF NOT EXISTS ledger.purchase_orders (
    po_id        UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    po_number    TEXT NOT NULL,
    vendor_id    UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    po_status    TEXT NOT NULL DEFAULT 'issued',
    order_date   DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_purchase_orders PRIMARY KEY (po_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_id_po_id ON ledger.purchase_orders(tenant_id, po_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_tenant_number ON ledger.purchase_orders(tenant_id, po_number);
CREATE INDEX IF NOT EXISTS idx_po_tenant ON ledger.purchase_orders(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.purchase_orders ADD CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_orders ADD CONSTRAINT fk_po_vendor FOREIGN KEY (tenant_id, vendor_id) REFERENCES ledger.vendors(tenant_id, vendor_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_orders ADD CONSTRAINT fk_po_wh FOREIGN KEY (tenant_id, warehouse_id) REFERENCES ledger.warehouses(tenant_id, warehouse_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_orders ADD CONSTRAINT chk_po_status CHECK (po_status IN ('draft','issued','partially_received','partially_canceled','partially_received_and_canceled','fully_received','fully_canceled','received_and_canceled','canceled','closed')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.8 purchase_order_lines
CREATE TABLE IF NOT EXISTS ledger.purchase_order_lines (
    po_line_id        UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    po_id             UUID NOT NULL,
    item_id           UUID NOT NULL,
    ordered_quantity  NUMERIC(18,4) NOT NULL,
    received_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    canceled_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    unit_of_measure   TEXT NOT NULL,
    line_status       TEXT NOT NULL DEFAULT 'open',
    remaining_quantity NUMERIC(18,4) GENERATED ALWAYS AS (ordered_quantity - received_quantity - canceled_quantity) STORED,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_purchase_order_lines PRIMARY KEY (po_line_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pol_tenant_id_pol_id ON ledger.purchase_order_lines(tenant_id, po_line_id);
CREATE INDEX IF NOT EXISTS idx_pol_tenant_po ON ledger.purchase_order_lines(tenant_id, po_id);
CREATE INDEX IF NOT EXISTS idx_pol_tenant ON ledger.purchase_order_lines(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT fk_pol_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT fk_pol_po FOREIGN KEY (tenant_id, po_id) REFERENCES ledger.purchase_orders(tenant_id, po_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT fk_pol_item FOREIGN KEY (tenant_id, item_id) REFERENCES ledger.items(tenant_id, item_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT fk_pol_uom FOREIGN KEY (unit_of_measure) REFERENCES ledger.units_of_measure(uom_code); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT chk_pol_status CHECK (line_status IN ('open','partially_received','partially_canceled','partially_received_and_canceled','fully_received','fully_canceled','received_and_canceled')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.purchase_order_lines ADD CONSTRAINT chk_pol_qty CHECK (ordered_quantity > 0 AND received_quantity >= 0 AND canceled_quantity >= 0 AND received_quantity + canceled_quantity <= ordered_quantity); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.9 po_receipts
CREATE TABLE IF NOT EXISTS ledger.po_receipts (
    receipt_id    UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    po_id         UUID NOT NULL,
    receipt_number TEXT NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_po_receipts PRIMARY KEY (receipt_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcpts_tenant_id_rid ON ledger.po_receipts(tenant_id, receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcpts_tenant_number ON ledger.po_receipts(tenant_id, receipt_number);
CREATE INDEX IF NOT EXISTS idx_rcpts_tenant_po ON ledger.po_receipts(tenant_id, po_id);
CREATE INDEX IF NOT EXISTS idx_rcpts_tenant ON ledger.po_receipts(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.po_receipts ADD CONSTRAINT fk_rcpts_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipts ADD CONSTRAINT fk_rcpts_po FOREIGN KEY (tenant_id, po_id) REFERENCES ledger.purchase_orders(tenant_id, po_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.10 po_receipt_lines
CREATE TABLE IF NOT EXISTS ledger.po_receipt_lines (
    receipt_line_id   UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    receipt_id        UUID NOT NULL,
    po_line_id        UUID NOT NULL,
    item_id           UUID NOT NULL,
    received_quantity NUMERIC(18,4) NOT NULL,
    unit_of_measure   TEXT NOT NULL,
    destination_position_id UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_po_receipt_lines PRIMARY KEY (receipt_line_id)
);
CREATE INDEX IF NOT EXISTS idx_rctl_tenant_receipt ON ledger.po_receipt_lines(tenant_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_rctl_tenant_pol ON ledger.po_receipt_lines(tenant_id, po_line_id);
CREATE INDEX IF NOT EXISTS idx_rctl_tenant ON ledger.po_receipt_lines(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_receipt FOREIGN KEY (tenant_id, receipt_id) REFERENCES ledger.po_receipts(tenant_id, receipt_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_pol FOREIGN KEY (tenant_id, po_line_id) REFERENCES ledger.purchase_order_lines(tenant_id, po_line_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_item FOREIGN KEY (tenant_id, item_id) REFERENCES ledger.items(tenant_id, item_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_pos FOREIGN KEY (tenant_id, destination_position_id) REFERENCES ledger.positions(tenant_id, position_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT fk_rctl_uom FOREIGN KEY (unit_of_measure) REFERENCES ledger.units_of_measure(uom_code); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.po_receipt_lines ADD CONSTRAINT chk_rctl_qty CHECK (received_quantity > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.11 accepted_events
CREATE TABLE IF NOT EXISTS ledger.accepted_events (
    event_id            UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    idempotency_key     TEXT NOT NULL,
    event_type          TEXT NOT NULL,
    event_version       INT NOT NULL DEFAULT 1,
    entity_type         TEXT NOT NULL,
    entity_id           TEXT,
    source_system       TEXT NOT NULL DEFAULT 'lvc_os',
    payload_hash        TEXT NOT NULL,
    payload_canon_version TEXT NOT NULL,
    payload_json        JSONB NOT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at        TIMESTAMPTZ,
    canonical_revision  BIGINT NOT NULL,
    formula_version     TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_accepted_events PRIMARY KEY (event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_tenant_id_eid ON ledger.accepted_events(tenant_id, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_tenant_key ON ledger.accepted_events(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ae_tenant_rev ON ledger.accepted_events(tenant_id, canonical_revision);
CREATE INDEX IF NOT EXISTS idx_ae_tenant ON ledger.accepted_events(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.accepted_events ADD CONSTRAINT fk_ae_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.12 idempotency_commands
CREATE TABLE IF NOT EXISTS ledger.idempotency_commands (
    command_id          UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    idempotency_key     TEXT NOT NULL,
    command_type        TEXT NOT NULL,
    payload_hash        TEXT NOT NULL,
    payload_canon_version TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'processing',
    result_kind         TEXT,
    accepted_event_id   UUID,
    result_json         JSONB,
    error_code          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at        TIMESTAMPTZ,
    CONSTRAINT pk_idempotency_commands PRIMARY KEY (command_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ic_tenant_key ON ledger.idempotency_commands(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ic_status ON ledger.idempotency_commands(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ic_tenant ON ledger.idempotency_commands(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.idempotency_commands ADD CONSTRAINT fk_ic_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.idempotency_commands ADD CONSTRAINT fk_ic_event FOREIGN KEY (tenant_id, accepted_event_id) REFERENCES ledger.accepted_events(tenant_id, event_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.idempotency_commands ADD CONSTRAINT chk_ic_status CHECK (status IN ('processing','committed','rejected')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.idempotency_commands ADD CONSTRAINT chk_ic_result_kind CHECK (result_kind IS NULL OR result_kind IN ('accepted','rejected')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.idempotency_commands ADD CONSTRAINT chk_ic_lifecycle CHECK ((status = 'processing' AND result_kind IS NULL AND accepted_event_id IS NULL AND result_json IS NULL AND finalized_at IS NULL) OR (status = 'committed' AND result_kind = 'accepted' AND accepted_event_id IS NOT NULL AND result_json IS NOT NULL AND finalized_at IS NOT NULL) OR (status = 'rejected' AND result_kind = 'rejected' AND accepted_event_id IS NULL AND result_json IS NOT NULL AND finalized_at IS NOT NULL)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.13 state_revision
CREATE TABLE IF NOT EXISTS ledger.state_revision (
    tenant_id        UUID NOT NULL,
    current_revision BIGINT NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_state_revision PRIMARY KEY (tenant_id)
);
DO $$ BEGIN ALTER TABLE ledger.state_revision ADD CONSTRAINT fk_sr_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.14 audit_records
CREATE TABLE IF NOT EXISTS ledger.audit_records (
    audit_id        UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    event_id        UUID,
    actor_identity  TEXT NOT NULL,
    actor_role      TEXT NOT NULL,
    command_type    TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    outcome         TEXT NOT NULL,
    detail_json     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_records PRIMARY KEY (audit_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON ledger.audit_records(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON ledger.audit_records(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.audit_records ADD CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.audit_records ADD CONSTRAINT fk_audit_event FOREIGN KEY (tenant_id, event_id) REFERENCES ledger.accepted_events(tenant_id, event_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.audit_records ADD CONSTRAINT chk_audit_outcome CHECK (outcome IN ('accepted','rejected')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.15 outbox_messages
CREATE TABLE IF NOT EXISTS ledger.outbox_messages (
    outbox_id       UUID NOT NULL DEFAULT extensions.gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    event_id        UUID NOT NULL,
    projection      TEXT NOT NULL,
    payload_json    JSONB NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    attempts        INT NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_outbox_messages PRIMARY KEY (outbox_id)
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON ledger.outbox_messages(delivery_status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON ledger.outbox_messages(tenant_id);
DO $$ BEGIN ALTER TABLE ledger.outbox_messages ADD CONSTRAINT fk_outbox_tenant FOREIGN KEY (tenant_id) REFERENCES ledger.tenants(tenant_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.outbox_messages ADD CONSTRAINT fk_outbox_event FOREIGN KEY (tenant_id, event_id) REFERENCES ledger.accepted_events(tenant_id, event_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.outbox_messages ADD CONSTRAINT chk_outbox_status CHECK (delivery_status IN ('pending','delivered','failed','dead_letter')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ Section 6: Helper functions ═══

CREATE OR REPLACE FUNCTION ledger.fn_canonicalize_command(p_command_doc jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, ledger
AS $$
    SELECT jsonb_build_object(
        'command_type', p_command_doc -> 'command_type',
        'idempotency_key', p_command_doc -> 'idempotency_key',
        'expected_revision', p_command_doc -> 'expected_revision',
        'po_id', lower(p_command_doc ->> 'po_id'),
        'po_line_id', lower(p_command_doc ->> 'po_line_id'),
        'received_quantity', p_command_doc -> 'received_quantity',
        'unit_of_measure', p_command_doc -> 'unit_of_measure',
        'destination_position_id', lower(p_command_doc ->> 'destination_position_id'),
        'formula_version', p_command_doc -> 'formula_version',
        'canon_version', p_command_doc -> 'canon_version'
    );
$$;

CREATE OR REPLACE FUNCTION ledger.fn_command_fingerprint(p_command_doc jsonb, p_canon_version text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, ledger, extensions
AS $$
    SELECT encode(extensions.digest(ledger.fn_canonicalize_command(p_command_doc)::text || '|' || COALESCE(p_canon_version, 'pg-jsonb-v1'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION ledger.fn_derive_line_status(p_ordered numeric, p_received numeric, p_canceled numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN p_received = p_ordered THEN 'fully_received'
        WHEN p_received = 0 AND p_canceled = p_ordered THEN 'fully_canceled'
        WHEN p_received > 0 AND p_canceled > 0 AND p_received + p_canceled = p_ordered AND p_received < p_ordered THEN 'received_and_canceled'
        WHEN p_received > 0 AND p_canceled > 0 AND p_received + p_canceled < p_ordered THEN 'partially_received_and_canceled'
        WHEN p_received > 0 AND p_canceled = 0 AND p_received < p_ordered THEN 'partially_received'
        WHEN p_received = 0 AND p_canceled > 0 AND p_canceled < p_ordered THEN 'partially_canceled'
        ELSE 'open'
    END;
$$;

CREATE OR REPLACE FUNCTION ledger.fn_derive_po_status(p_tenant_id uuid, p_po_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, ledger
AS $$
    SELECT CASE
        WHEN bool_and(line_status = 'fully_received') THEN 'fully_received'
        WHEN bool_and(line_status = 'fully_canceled') THEN 'fully_canceled'
        WHEN bool_and(line_status IN ('fully_received','fully_canceled','received_and_canceled')) THEN 'received_and_canceled'
        WHEN bool_or(line_status IN ('partially_received','partially_received_and_canceled','fully_received','received_and_canceled'))
         AND bool_or(line_status IN ('partially_canceled','fully_canceled')) THEN 'partially_received_and_canceled'
        WHEN bool_or(line_status IN ('partially_received','partially_received_and_canceled','fully_received','received_and_canceled')) THEN 'partially_received'
        WHEN bool_or(line_status IN ('partially_canceled','fully_canceled')) THEN 'partially_canceled'
        ELSE 'issued'
    END
    FROM ledger.purchase_order_lines
    WHERE tenant_id = p_tenant_id AND po_id = p_po_id;
$$;

CREATE OR REPLACE FUNCTION ledger.fn_finalize_rejection(
    p_command_id uuid, p_tenant_id uuid, p_actor_identity text, p_actor_role text,
    p_command_type text, p_idempotency_key text, p_error_code text, p_error_message text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, ledger
AS $$
DECLARE v_result jsonb;
BEGIN
    v_result := jsonb_build_object('success', false, 'error_code', p_error_code, 'message', p_error_message, 'retryable', false);
    UPDATE ledger.idempotency_commands SET status = 'rejected', result_kind = 'rejected', result_json = v_result, error_code = p_error_code, finalized_at = now() WHERE command_id = p_command_id;
    INSERT INTO ledger.audit_records (tenant_id, actor_identity, actor_role, command_type, idempotency_key, outcome, detail_json) VALUES (p_tenant_id, p_actor_identity, p_actor_role, p_command_type, p_idempotency_key, 'rejected', v_result);
    RETURN v_result;
END;
$$;

-- ═══ Section 7: Receipt command function ═══
CREATE OR REPLACE FUNCTION ledger.fn_receive_purchase_order(p_command_doc jsonb, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ledger, extensions
AS $$
DECLARE
    v_tenant_id uuid; v_actor_identity text; v_actor_role text;
    v_command_id uuid; v_existing_hash text; v_existing_result jsonb;
    v_computed_hash text; v_canon_version text; v_formula_version text;
    v_command_type text; v_current_revision bigint; v_new_revision bigint;
    v_event_id uuid; v_result jsonb;
    v_expected_revision bigint; v_po_id uuid; v_po_line_id uuid;
    v_received_quantity numeric; v_uom text; v_destination_position_id uuid;
    v_line RECORD; v_po RECORD; v_position RECORD; v_item RECORD;
    v_new_received numeric; v_ordered numeric; v_canceled numeric;
    v_new_remaining numeric; v_new_line_status text; v_new_po_status text;
    v_receipt_id uuid; v_po_id_text text; v_po_line_id_text text;
    v_dest_pos_id_text text; v_qty_text text; v_rev_text text; v_idem_key_text text;
    v_uuid_re text;
BEGIN
    v_uuid_re := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_tenant_id := NULLIF(current_setting('ledger.tenant_id', true), '')::uuid;
    IF v_tenant_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED', 'persisted', false); END IF;
    v_actor_identity := COALESCE(current_setting('ledger.actor_identity', true), '');
    v_actor_role := COALESCE(current_setting('ledger.actor_role', true), '');
    IF v_actor_identity = '' OR v_actor_role = '' THEN RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED', 'persisted', false); END IF;
    IF v_actor_role NOT IN ('admin','operations_manager','warehouse_manager') THEN RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'persisted', false); END IF;

    v_command_type := p_command_doc ->> 'command_type';
    IF v_command_type IS NULL OR v_command_type <> 'receive_purchase_order' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.INVALID_COMMAND_TYPE', 'persisted', false); END IF;
    v_idem_key_text := p_command_doc ->> 'idempotency_key';
    IF v_idem_key_text IS NULL OR v_idem_key_text = '' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MISSING_IDEMPOTENCY_KEY', 'persisted', false); END IF;
    v_formula_version := p_command_doc ->> 'formula_version';
    IF v_formula_version IS NULL OR v_formula_version <> '2g1a-v1.0.0' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.UNSUPPORTED_FORMULA_VERSION', 'persisted', false); END IF;
    v_canon_version := p_command_doc ->> 'canon_version';
    IF v_canon_version IS NULL OR v_canon_version <> 'pg-jsonb-v1' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.UNSUPPORTED_CANON_VERSION', 'persisted', false); END IF;

    v_po_id_text := p_command_doc ->> 'po_id';
    IF v_po_id_text IS NULL OR v_po_id_text !~ v_uuid_re THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MALFORMED_PO_ID', 'persisted', false); END IF;
    v_po_id := v_po_id_text::uuid;
    v_po_line_id_text := p_command_doc ->> 'po_line_id';
    IF v_po_line_id_text IS NULL OR v_po_line_id_text !~ v_uuid_re THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MALFORMED_PO_LINE_ID', 'persisted', false); END IF;
    v_po_line_id := v_po_line_id_text::uuid;
    v_dest_pos_id_text := p_command_doc ->> 'destination_position_id';
    IF v_dest_pos_id_text IS NULL OR v_dest_pos_id_text !~ v_uuid_re THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MALFORMED_DESTINATION_POSITION_ID', 'persisted', false); END IF;
    v_destination_position_id := v_dest_pos_id_text::uuid;
    v_qty_text := p_command_doc ->> 'received_quantity';
    IF v_qty_text IS NULL OR v_qty_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MALFORMED_QUANTITY', 'persisted', false); END IF;
    v_received_quantity := v_qty_text::numeric;
    v_rev_text := p_command_doc ->> 'expected_revision';
    IF v_rev_text IS NULL OR v_rev_text !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MALFORMED_REVISION', 'persisted', false); END IF;
    v_expected_revision := v_rev_text::bigint;
    v_uom := p_command_doc ->> 'unit_of_measure';
    IF v_uom IS NULL OR v_uom = '' THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.MISSING_UOM', 'persisted', false); END IF;

    v_computed_hash := ledger.fn_command_fingerprint(p_command_doc, v_canon_version);
    IF v_computed_hash IS NULL THEN RETURN jsonb_build_object('success', false, 'error_code', 'VALIDATION.PAYLOAD_FINGERPRINT_FAILED', 'persisted', false); END IF;

    INSERT INTO ledger.idempotency_commands (tenant_id, idempotency_key, command_type, payload_hash, payload_canon_version, status)
    VALUES (v_tenant_id, p_idempotency_key, 'receive_purchase_order', v_computed_hash, v_canon_version, 'processing')
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING command_id INTO v_command_id;

    IF v_command_id IS NULL THEN
        SELECT payload_hash, result_json INTO v_existing_hash, v_existing_result
        FROM ledger.idempotency_commands WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;
        IF v_existing_hash = v_computed_hash THEN RETURN v_existing_result;
        ELSE RETURN jsonb_build_object('success', false, 'error_code', 'IDEMPOTENCY_CONFLICT', 'retryable', false, 'persisted', true);
        END IF;
    END IF;

    SELECT current_revision INTO v_current_revision FROM ledger.state_revision WHERE tenant_id = v_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'STATE.REVISION_ROW_MISSING', 'Tenant revision row not found');
        RETURN v_result;
    END IF;
    IF v_current_revision <> v_expected_revision THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'STALE_REVISION', 'Expected ' || v_expected_revision || ' != actual ' || v_current_revision);
        RETURN v_result;
    END IF;

    SELECT * INTO v_po FROM ledger.purchase_orders WHERE po_id = v_po_id AND tenant_id = v_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.PO_NOT_FOUND', 'Purchase order not found');
        RETURN v_result;
    END IF;
    IF v_po.po_status IN ('draft','fully_received','fully_canceled','received_and_canceled','canceled','closed') THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'STATE.PO_NOT_ELIGIBLE_FOR_RECEIPT', 'PO status ' || v_po.po_status || ' does not permit receipt');
        RETURN v_result;
    END IF;

    SELECT * INTO v_line FROM ledger.purchase_order_lines WHERE po_line_id = v_po_line_id AND tenant_id = v_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.PO_LINE_NOT_FOUND', 'PO line not found');
        RETURN v_result;
    END IF;
    IF v_line.po_id <> v_po_id THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.PO_LINE_MISMATCH', 'PO line does not belong to the specified PO');
        RETURN v_result;
    END IF;

    IF v_received_quantity <= 0 THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.NON_POSITIVE_QUANTITY', 'Received quantity must be positive');
        RETURN v_result;
    END IF;
    v_ordered := v_line.ordered_quantity; v_canceled := v_line.canceled_quantity;
    v_new_received := v_line.received_quantity + v_received_quantity;
    v_new_remaining := v_ordered - v_new_received - v_canceled;
    IF v_new_remaining < 0 THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'CONSUMPTION.EXCEEDS_OUTSTANDING', 'Receipt exceeds outstanding quantity');
        RETURN v_result;
    END IF;

    IF v_line.unit_of_measure <> v_uom THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.UOM_MISMATCH', 'Command UOM does not match PO line UOM');
        RETURN v_result;
    END IF;

    SELECT * INTO v_item FROM ledger.items WHERE item_id = v_line.item_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.ITEM_NOT_FOUND', 'Item not found');
        RETURN v_result;
    END IF;
    IF v_item.governed_unit <> v_line.unit_of_measure THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.LINE_ITEM_UOM_MISMATCH', 'PO line UOM does not match item governed UOM');
        RETURN v_result;
    END IF;

    SELECT * INTO v_position FROM ledger.positions WHERE position_id = v_destination_position_id AND tenant_id = v_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.MISSING_DESTINATION_POSITION', 'Destination position not found');
        RETURN v_result;
    END IF;
    IF v_position.is_active = false THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_INACTIVE', 'Destination position is inactive');
        RETURN v_result;
    END IF;
    IF v_position.is_archived = true THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_ARCHIVED', 'Destination position is archived');
        RETURN v_result;
    END IF;
    IF v_position.is_locked = true THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_LOCKED', 'Destination position is locked');
        RETURN v_result;
    END IF;
    IF v_position.can_receive = false THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_CANNOT_RECEIVE', 'Destination position cannot receive');
        RETURN v_result;
    END IF;
    IF v_position.position_type NOT IN ('physical_warehouse','physical_truck') THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_TYPE_INELIGIBLE', 'Destination position type not eligible for receipt');
        RETURN v_result;
    END IF;
    IF v_position.item_id <> v_line.item_id THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_ITEM_MISMATCH', 'Destination position item does not match PO line item');
        RETURN v_result;
    END IF;
    IF v_position.governed_unit <> v_uom THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.POSITION_UOM_MISMATCH', 'Destination position UOM does not match command UOM');
        RETURN v_result;
    END IF;
    IF v_position.warehouse_id <> v_po.warehouse_id THEN
        v_result := ledger.fn_finalize_rejection(v_command_id, v_tenant_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'VALIDATION.WAREHOUSE_MISMATCH', 'Destination position warehouse does not match PO warehouse');
        RETURN v_result;
    END IF;

    UPDATE ledger.positions SET position_quantity = position_quantity + v_received_quantity, updated_at = now() WHERE position_id = v_destination_position_id AND tenant_id = v_tenant_id;

    v_receipt_id := extensions.gen_random_uuid();
    INSERT INTO ledger.po_receipts (receipt_id, tenant_id, po_id, receipt_number) VALUES (v_receipt_id, v_tenant_id, v_po_id, 'RC-' || v_receipt_id::text);
    INSERT INTO ledger.po_receipt_lines (receipt_line_id, tenant_id, receipt_id, po_line_id, item_id, received_quantity, unit_of_measure, destination_position_id) VALUES (extensions.gen_random_uuid(), v_tenant_id, v_receipt_id, v_po_line_id, v_line.item_id, v_received_quantity, v_uom, v_destination_position_id);

    v_new_line_status := ledger.fn_derive_line_status(v_ordered, v_new_received, v_canceled);
    UPDATE ledger.purchase_order_lines SET received_quantity = v_new_received, line_status = v_new_line_status, updated_at = now() WHERE po_line_id = v_po_line_id AND tenant_id = v_tenant_id;

    v_new_po_status := ledger.fn_derive_po_status(v_tenant_id, v_po_id);
    UPDATE ledger.purchase_orders SET po_status = v_new_po_status, updated_at = now() WHERE po_id = v_po_id AND tenant_id = v_tenant_id;

    v_new_revision := v_current_revision + 1;
    UPDATE ledger.state_revision SET current_revision = v_new_revision, updated_at = now() WHERE tenant_id = v_tenant_id;

    v_event_id := extensions.gen_random_uuid();
    INSERT INTO ledger.accepted_events (event_id, tenant_id, idempotency_key, event_type, event_version, entity_type, entity_id, source_system, payload_hash, payload_canon_version, payload_json, occurred_at, canonical_revision, formula_version) VALUES (v_event_id, v_tenant_id, p_idempotency_key, 'receipt.posted', 1, 'PurchaseOrder', v_po_id::text, 'lvc_os', v_computed_hash, v_canon_version, p_command_doc, now(), v_new_revision, v_formula_version);

    v_result := jsonb_build_object('success', true, 'event_id', v_event_id, 'canonical_revision', v_new_revision, 'received_quantity', v_received_quantity, 'new_remaining_quantity', v_new_remaining, 'line_status', v_new_line_status, 'po_status', v_new_po_status);

    INSERT INTO ledger.audit_records (tenant_id, event_id, actor_identity, actor_role, command_type, idempotency_key, outcome) VALUES (v_tenant_id, v_event_id, v_actor_identity, v_actor_role, 'receive_purchase_order', p_idempotency_key, 'accepted');
    INSERT INTO ledger.outbox_messages (tenant_id, event_id, projection, payload_json, delivery_status) VALUES (v_tenant_id, v_event_id, 'InventoryMaster', p_command_doc, 'pending');

    UPDATE ledger.idempotency_commands SET status = 'committed', result_kind = 'accepted', accepted_event_id = v_event_id, result_json = v_result, finalized_at = now() WHERE command_id = v_command_id;

    RETURN v_result;
END;
$$;

-- ═══ Section 8: Immutability trigger ═══
CREATE OR REPLACE FUNCTION ledger.fn_prevent_accepted_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'accepted_events is immutable: % not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_ae_no_update ON ledger.accepted_events;
CREATE TRIGGER trg_ae_no_update BEFORE UPDATE ON ledger.accepted_events FOR EACH ROW EXECUTE FUNCTION ledger.fn_prevent_accepted_event_mutation();
DROP TRIGGER IF EXISTS trg_ae_no_delete ON ledger.accepted_events;
CREATE TRIGGER trg_ae_no_delete BEFORE DELETE ON ledger.accepted_events FOR EACH ROW EXECUTE FUNCTION ledger.fn_prevent_accepted_event_mutation();

-- ═══ Section 9: RLS enablement + FORCE ═══
ALTER TABLE ledger.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.units_of_measure FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.items FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.positions FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.purchase_order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.po_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.po_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.po_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.po_receipt_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.accepted_events FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.idempotency_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.idempotency_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.state_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.state_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.audit_records FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.outbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.outbox_messages FORCE ROW LEVEL SECURITY;

-- ═══ Section 10: RLS Policies ═══
DROP POLICY IF EXISTS pol_tenants ON ledger.tenants;
CREATE POLICY pol_tenants ON ledger.tenants FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_uom ON ledger.units_of_measure;
CREATE POLICY pol_uom ON ledger.units_of_measure FOR ALL TO ledger_function_owner, ledger_readonly USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pol_wh ON ledger.warehouses;
CREATE POLICY pol_wh ON ledger.warehouses FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_items ON ledger.items;
CREATE POLICY pol_items ON ledger.items FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_pos ON ledger.positions;
CREATE POLICY pol_pos ON ledger.positions FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_vendors ON ledger.vendors;
CREATE POLICY pol_vendors ON ledger.vendors FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_po ON ledger.purchase_orders;
CREATE POLICY pol_po ON ledger.purchase_orders FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_pol ON ledger.purchase_order_lines;
CREATE POLICY pol_pol ON ledger.purchase_order_lines FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_rcpts ON ledger.po_receipts;
CREATE POLICY pol_rcpts ON ledger.po_receipts FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_rctl ON ledger.po_receipt_lines;
CREATE POLICY pol_rctl ON ledger.po_receipt_lines FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_ae ON ledger.accepted_events;
CREATE POLICY pol_ae ON ledger.accepted_events FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_ic ON ledger.idempotency_commands;
CREATE POLICY pol_ic ON ledger.idempotency_commands FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_sr ON ledger.state_revision;
CREATE POLICY pol_sr ON ledger.state_revision FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_audit ON ledger.audit_records;
CREATE POLICY pol_audit ON ledger.audit_records FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS pol_outbox ON ledger.outbox_messages;
CREATE POLICY pol_outbox ON ledger.outbox_messages FOR ALL TO ledger_function_owner, ledger_readonly USING (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('ledger.tenant_id', true), '')::uuid);

-- ═══ Section 11: Table ownership ═══
ALTER TABLE ledger.tenants OWNER TO ledger_migration_owner;
ALTER TABLE ledger.units_of_measure OWNER TO ledger_migration_owner;
ALTER TABLE ledger.warehouses OWNER TO ledger_migration_owner;
ALTER TABLE ledger.items OWNER TO ledger_migration_owner;
ALTER TABLE ledger.positions OWNER TO ledger_migration_owner;
ALTER TABLE ledger.vendors OWNER TO ledger_migration_owner;
ALTER TABLE ledger.purchase_orders OWNER TO ledger_migration_owner;
ALTER TABLE ledger.purchase_order_lines OWNER TO ledger_migration_owner;
ALTER TABLE ledger.po_receipts OWNER TO ledger_migration_owner;
ALTER TABLE ledger.po_receipt_lines OWNER TO ledger_migration_owner;
ALTER TABLE ledger.accepted_events OWNER TO ledger_migration_owner;
ALTER TABLE ledger.idempotency_commands OWNER TO ledger_migration_owner;
ALTER TABLE ledger.state_revision OWNER TO ledger_migration_owner;
ALTER TABLE ledger.audit_records OWNER TO ledger_migration_owner;
ALTER TABLE ledger.outbox_messages OWNER TO ledger_migration_owner;

-- ═══ Section 12: Function ownership ═══
ALTER FUNCTION ledger.fn_canonicalize_command(jsonb) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_command_fingerprint(jsonb, text) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_derive_line_status(numeric, numeric, numeric) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_derive_po_status(uuid, uuid) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_finalize_rejection(uuid, uuid, text, text, text, text, text, text) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_receive_purchase_order(jsonb, text) OWNER TO ledger_function_owner;
ALTER FUNCTION ledger.fn_prevent_accepted_event_mutation() OWNER TO ledger_function_owner;

-- ═══ Section 13: Grants and revocations ═══
GRANT USAGE ON SCHEMA ledger TO ledger_function_owner, ledger_app_user, ledger_readonly;
GRANT USAGE ON SCHEMA extensions TO ledger_function_owner, ledger_app_user, ledger_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    ledger.tenants, ledger.units_of_measure, ledger.warehouses, ledger.items,
    ledger.positions, ledger.vendors, ledger.purchase_orders, ledger.purchase_order_lines,
    ledger.po_receipts, ledger.po_receipt_lines, ledger.accepted_events,
    ledger.idempotency_commands, ledger.state_revision,
    ledger.audit_records, ledger.outbox_messages
    TO ledger_function_owner;

GRANT SELECT ON
    ledger.tenants, ledger.units_of_measure, ledger.warehouses, ledger.items,
    ledger.positions, ledger.vendors, ledger.purchase_orders, ledger.purchase_order_lines,
    ledger.po_receipts, ledger.po_receipt_lines, ledger.accepted_events,
    ledger.idempotency_commands, ledger.state_revision,
    ledger.audit_records, ledger.outbox_messages
    TO ledger_readonly;

REVOKE INSERT, UPDATE, DELETE ON
    ledger.tenants, ledger.units_of_measure, ledger.warehouses, ledger.items,
    ledger.positions, ledger.vendors, ledger.purchase_orders, ledger.purchase_order_lines,
    ledger.po_receipts, ledger.po_receipt_lines, ledger.accepted_events,
    ledger.idempotency_commands, ledger.state_revision,
    ledger.audit_records, ledger.outbox_messages
    FROM ledger_app_user, ledger_readonly;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ledger FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.fn_receive_purchase_order(jsonb, text) TO ledger_app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE ledger_migration_owner IN SCHEMA ledger GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledger_function_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE ledger_migration_owner IN SCHEMA ledger GRANT SELECT ON TABLES TO ledger_readonly;

-- ═══════════════════════════════════════════════════════════════════
-- Section 14: TEST FIXTURES + VALIDATION TESTS
-- ═══════════════════════════════════════════════════════════════════

TRUNCATE ledger.outbox_messages, ledger.audit_records, ledger.idempotency_commands, ledger.accepted_events, ledger.po_receipt_lines, ledger.po_receipts, ledger.purchase_order_lines, ledger.purchase_orders, ledger.positions, ledger.items, ledger.warehouses, ledger.vendors, ledger.tenants, ledger.state_revision RESTART IDENTITY CASCADE;

INSERT INTO ledger.units_of_measure (uom_code, description) VALUES ('ea', 'Each'), ('box', 'Box'), ('ft', 'Feet'), ('gal', 'Gallon');
INSERT INTO ledger.tenants (tenant_id, tenant_code) VALUES ('a0000000-0000-0000-0000-000000000001', 'TENANT_A');
INSERT INTO ledger.state_revision (tenant_id, current_revision) VALUES ('a0000000-0000-0000-0000-000000000001', 0);
INSERT INTO ledger.warehouses (warehouse_id, tenant_id, warehouse_code) VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'WH_MAIN');
INSERT INTO ledger.items (item_id, tenant_id, sku, name, governed_unit) VALUES ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU001', 'Test Item', 'ea');
INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, is_archived, is_locked, can_receive) VALUES ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, true, false, false, true);
INSERT INTO ledger.vendors (vendor_id, tenant_id, vendor_code, vendor_name) VALUES ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'V001', 'Test Vendor');
INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PO001', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'issued', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, received_quantity, canceled_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 100, 0, 0, 'ea', 'open');

SET ledger.tenant_id = 'a0000000-0000-0000-0000-000000000001';
SET ledger.actor_identity = 'admin@lvc.com';
SET ledger.actor_role = 'admin';

-- ═══ TEST 1: Successful partial receipt ═══
SELECT 'TEST 1: Successful partial receipt' AS test_section;
SELECT ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','RCP-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',30,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'RCP-001') AS result;
SELECT 'T1.1' AS chk, count(*) AS actual, 1 AS expected FROM ledger.po_receipts;
SELECT 'T1.2' AS chk, count(*) AS actual, 1 AS expected FROM ledger.po_receipt_lines;
SELECT 'T1.3' AS chk, position_quantity AS actual, 30 AS expected FROM ledger.positions WHERE position_id = 'd0000000-0000-0000-0000-000000000001';
SELECT 'T1.4' AS chk, received_quantity AS actual, 30 AS expected FROM ledger.purchase_order_lines WHERE po_line_id = '10000000-0000-0000-0000-000000000001';
SELECT 'T1.5' AS chk, line_status AS actual, 'partially_received' AS expected FROM ledger.purchase_order_lines WHERE po_line_id = '10000000-0000-0000-0000-000000000001';
SELECT 'T1.6' AS chk, po_status AS actual, 'partially_received' AS expected FROM ledger.purchase_orders WHERE po_id = 'f0000000-0000-0000-0000-000000000001';
SELECT 'T1.7' AS chk, current_revision AS actual, 1 AS expected FROM ledger.state_revision;
SELECT 'T1.8' AS chk, count(*) AS actual, 1 AS expected FROM ledger.accepted_events;
SELECT 'T1.9' AS chk, count(*) AS actual, 1 AS expected FROM ledger.audit_records WHERE outcome = 'accepted';
SELECT 'T1.10' AS chk, count(*) AS actual, 1 AS expected FROM ledger.outbox_messages WHERE delivery_status = 'pending';
SELECT 'T1.11' AS chk, count(*) AS actual, 0 AS expected FROM ledger.accepted_events WHERE published_at IS NOT NULL;
SELECT 'T1.12' AS chk, (result_json ->> 'success')::boolean AS actual, true AS expected FROM ledger.idempotency_commands WHERE idempotency_key = 'RCP-001';

-- ═══ TEST 2: Replay ═══
SELECT 'TEST 2: Replay' AS test_section;
SELECT ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','RCP-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',30,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'RCP-001') AS replay_result;
SELECT 'T2.1' AS chk, count(*) AS actual, 1 AS expected FROM ledger.po_receipts;
SELECT 'T2.2' AS chk, count(*) AS actual, 1 AS expected FROM ledger.po_receipt_lines;
SELECT 'T2.3' AS chk, position_quantity AS actual, 30 AS expected FROM ledger.positions WHERE position_id = 'd0000000-0000-0000-0000-000000000001';
SELECT 'T2.4' AS chk, current_revision AS actual, 1 AS expected FROM ledger.state_revision;
SELECT 'T2.5' AS chk, count(*) AS actual, 1 AS expected FROM ledger.accepted_events;
SELECT 'T2.6' AS chk, count(*) AS actual, 1 AS expected FROM ledger.outbox_messages;
SELECT 'T2.7' AS chk, count(*) AS actual, 1 AS expected FROM ledger.audit_records WHERE outcome = 'accepted';

-- ═══ TEST 3: Conflict — changed quantity ═══
SELECT 'TEST 3: Conflict qty' AS test_section;
SELECT ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','RCP-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',50,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'RCP-001') AS conflict_qty;
SELECT 'T3.1' AS chk, (result_json ->> 'error_code') AS actual, 'IDEMPOTENCY_CONFLICT' AS expected FROM ledger.idempotency_commands WHERE idempotency_key = 'RCP-001';
SELECT 'T3.2' AS chk, position_quantity AS actual, 30 AS expected FROM ledger.positions WHERE position_id = 'd0000000-0000-0000-0000-000000000001';

-- ═══ TEST 4: Conflict — changed destination ═══
SELECT 'TEST 4: Conflict dest' AS test_section;
SELECT ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','RCP-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',30,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000099','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'RCP-001') AS conflict_dest;
SELECT 'T4.1' AS chk, (result_json ->> 'error_code') AS actual, 'IDEMPOTENCY_CONFLICT' AS expected FROM ledger.idempotency_commands WHERE idempotency_key = 'RCP-001';

-- ═══ TEST 5: Conflict — changed PO line ═══
SELECT 'TEST 5: Conflict line' AS test_section;
SELECT ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','RCP-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000099','received_quantity',30,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'RCP-001') AS conflict_line;
SELECT 'T5.1' AS chk, (result_json ->> 'error_code') AS actual, 'IDEMPOTENCY_CONFLICT' AS expected FROM ledger.idempotency_commands WHERE idempotency_key = 'RCP-001';

-- ═══ TEST 6: Pre-admission rejections ═══
SELECT 'TEST 6: Pre-admission' AS test_section;
SELECT 'T6.1' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','wrong','idempotency_key','PRE-001','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'PRE-001') ->> 'error_code') AS actual, 'VALIDATION.INVALID_COMMAND_TYPE' AS expected;
SELECT 'T6.2' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','PRE-002','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','wrong','canon_version','pg-jsonb-v1'), 'PRE-002') ->> 'error_code') AS actual, 'VALIDATION.UNSUPPORTED_FORMULA_VERSION' AS expected;
SELECT 'T6.3' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','PRE-003','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','wrong'), 'PRE-003') ->> 'error_code') AS actual, 'VALIDATION.UNSUPPORTED_CANON_VERSION' AS expected;
SELECT 'T6.4' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','PRE-004','expected_revision',0,'po_id','NOT-A-UUID','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'PRE-004') ->> 'error_code') AS actual, 'VALIDATION.MALFORMED_PO_ID' AS expected;
SELECT 'T6.5' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','PRE-005','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity','abc','unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'PRE-005') ->> 'error_code') AS actual, 'VALIDATION.MALFORMED_QUANTITY' AS expected;
SELECT 'T6.6' AS chk, count(*) AS actual, 0 AS expected FROM ledger.idempotency_commands WHERE idempotency_key LIKE 'PRE-%';

-- ═══ TEST 7: Admitted deterministic rejections ═══
SELECT 'TEST 7: Admitted rejections' AS test_section;
SELECT 'T7.1' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-001','expected_revision',99,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-001') ->> 'error_code') AS actual, 'STALE_REVISION' AS expected;
SELECT 'T7.1p' AS chk, status AS actual, 'rejected' AS expected FROM ledger.idempotency_commands WHERE idempotency_key = 'REJ-001';
SELECT 'T7.2' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-002','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000099','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-002') ->> 'error_code') AS actual, 'VALIDATION.PO_NOT_FOUND' AS expected;
SELECT 'T7.3' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-003','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000099','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-003') ->> 'error_code') AS actual, 'VALIDATION.PO_LINE_NOT_FOUND' AS expected;
SELECT 'T7.4' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-004','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',0,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-004') ->> 'error_code') AS actual, 'VALIDATION.NON_POSITIVE_QUANTITY' AS expected;
SELECT 'T7.5' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-005','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',200,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-005') ->> 'error_code') AS actual, 'CONSUMPTION.EXCEEDS_OUTSTANDING' AS expected;
SELECT 'T7.6' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-006','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','box','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-006') ->> 'error_code') AS actual, 'VALIDATION.UOM_MISMATCH' AS expected;

INSERT INTO ledger.warehouses (warehouse_id, tenant_id, warehouse_code) VALUES ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'WH_OTHER');
INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'physical_warehouse', 'ea', 0, true, true);
SELECT 'T7.7' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-007','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000002','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-007') ->> 'error_code') AS actual, 'VALIDATION.WAREHOUSE_MISMATCH' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, false, true);
SELECT 'T7.8' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-008','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000003','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-008') ->> 'error_code') AS actual, 'VALIDATION.POSITION_INACTIVE' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, is_archived, can_receive) VALUES ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, true, true, false);
SELECT 'T7.9' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-009','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000004','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-009') ->> 'error_code') AS actual, 'VALIDATION.POSITION_ARCHIVED' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, is_archived, is_locked, can_receive) VALUES ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, true, false, true, false);
SELECT 'T7.10' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-010','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000005','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-010') ->> 'error_code') AS actual, 'VALIDATION.POSITION_LOCKED' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, true, false);
SELECT 'T7.11' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-011','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000006','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-011') ->> 'error_code') AS actual, 'VALIDATION.POSITION_CANNOT_RECEIVE' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'custody_job', 'ea', 0, true, true);
SELECT 'T7.12' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-012','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000007','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-012') ->> 'error_code') AS actual, 'VALIDATION.POSITION_TYPE_INELIGIBLE' AS expected;

INSERT INTO ledger.items (item_id, tenant_id, sku, name, governed_unit) VALUES ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'SKU002', 'Other Item', 'ea');
INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'ea', 0, true, true);
SELECT 'T7.13' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-013','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000008','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-013') ->> 'error_code') AS actual, 'VALIDATION.POSITION_ITEM_MISMATCH' AS expected;

INSERT INTO ledger.positions (position_id, tenant_id, item_id, warehouse_id, position_type, governed_unit, position_quantity, is_active, can_receive) VALUES ('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'physical_warehouse', 'box', 0, true, true);
SELECT 'T7.14' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-014','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000009','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-014') ->> 'error_code') AS actual, 'VALIDATION.POSITION_UOM_MISMATCH' AS expected;

INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'PO002', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'draft', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
SELECT 'T7.15' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-015','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000002','po_line_id','10000000-0000-0000-0000-000000000002','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-015') ->> 'error_code') AS actual, 'STATE.PO_NOT_ELIGIBLE_FOR_RECEIPT' AS expected;

INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'PO003', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'canceled', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
SELECT 'T7.16' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-016','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000003','po_line_id','10000000-0000-0000-0000-000000000003','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-016') ->> 'error_code') AS actual, 'STATE.PO_NOT_ELIGIBLE_FOR_RECEIPT' AS expected;

INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'PO004', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'closed', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
SELECT 'T7.17' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-017','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000004','po_line_id','10000000-0000-0000-0000-000000000004','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-017') ->> 'error_code') AS actual, 'STATE.PO_NOT_ELIGIBLE_FOR_RECEIPT' AS expected;

INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'PO005', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fully_received', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, received_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 100, 100, 'ea', 'fully_received');
SELECT 'T7.18' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-018','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000005','po_line_id','10000000-0000-0000-0000-000000000005','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-018') ->> 'error_code') AS actual, 'STATE.PO_NOT_ELIGIBLE_FOR_RECEIPT' AS expected;

INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'PO006', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'issued', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
SELECT 'T7.19' AS chk, (ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','REJ-019','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000006','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'REJ-019') ->> 'error_code') AS actual, 'VALIDATION.PO_LINE_MISMATCH' AS expected;

SELECT 'T7.20' AS chk, count(*) AS actual, 1 AS expected FROM ledger.accepted_events;
SELECT 'T7.21' AS chk, current_revision AS actual, 1 AS expected FROM ledger.state_revision;

-- ═══ TEST 8: Line status truth table ═══
SELECT 'TEST 8: Line status' AS test_section;
SELECT 'T8.1' AS chk, ledger.fn_derive_line_status(100, 0, 0) AS actual, 'open' AS expected;
SELECT 'T8.2' AS chk, ledger.fn_derive_line_status(100, 30, 0) AS actual, 'partially_received' AS expected;
SELECT 'T8.3' AS chk, ledger.fn_derive_line_status(100, 0, 20) AS actual, 'partially_canceled' AS expected;
SELECT 'T8.4' AS chk, ledger.fn_derive_line_status(100, 30, 20) AS actual, 'partially_received_and_canceled' AS expected;
SELECT 'T8.5' AS chk, ledger.fn_derive_line_status(100, 100, 0) AS actual, 'fully_received' AS expected;
SELECT 'T8.6' AS chk, ledger.fn_derive_line_status(100, 0, 100) AS actual, 'fully_canceled' AS expected;
SELECT 'T8.7' AS chk, ledger.fn_derive_line_status(100, 60, 40) AS actual, 'received_and_canceled' AS expected;

-- ═══ TEST 9: Parent-PO status truth table ═══
SELECT 'TEST 9: Parent status' AS test_section;
INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'PO010', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'issued', '2026-01-01');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 100, 'ea', 'open');
SELECT 'T9.1' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'issued' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 100, line_status = 'fully_received' WHERE po_line_id = '10000000-0000-0000-0000-000000000010';
SELECT 'T9.2' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'partially_received' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 100, line_status = 'fully_received' WHERE po_line_id = '10000000-0000-0000-0000-000000000011';
SELECT 'T9.3' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'fully_received' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 0, canceled_quantity = 100, line_status = 'fully_canceled' WHERE po_line_id = '10000000-0000-0000-0000-000000000011';
SELECT 'T9.4' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'received_and_canceled' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 0, canceled_quantity = 100, line_status = 'fully_canceled' WHERE po_line_id = '10000000-0000-0000-0000-000000000010';
SELECT 'T9.5' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'fully_canceled' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 0, canceled_quantity = 0, line_status = 'open' WHERE po_line_id = '10000000-0000-0000-0000-000000000010';
UPDATE ledger.purchase_order_lines SET received_quantity = 0, canceled_quantity = 0, line_status = 'open' WHERE po_line_id = '10000000-0000-0000-0000-000000000011';
UPDATE ledger.purchase_order_lines SET canceled_quantity = 20, line_status = 'partially_canceled' WHERE po_line_id = '10000000-0000-0000-0000-000000000010';
SELECT 'T9.6' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'partially_canceled' AS expected;
UPDATE ledger.purchase_order_lines SET received_quantity = 30, line_status = 'partially_received' WHERE po_line_id = '10000000-0000-0000-0000-000000000011';
SELECT 'T9.7' AS chk, ledger.fn_derive_po_status('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010') AS actual, 'partially_received_and_canceled' AS expected;

-- ═══ TEST 10: Zero-quantity line prohibited ═══
SELECT 'TEST 10: Zero qty' AS test_section;
DO $$ BEGIN BEGIN INSERT INTO ledger.purchase_order_lines (po_line_id, tenant_id, po_id, item_id, ordered_quantity, unit_of_measure, line_status) VALUES ('10000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 0, 'ea', 'open'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T10.1 PASS: zero-qty rejected'; END; END $$;

-- ═══ TEST 11: Security tests ═══
SELECT 'TEST 11: Security' AS test_section;
DO $$ BEGIN SET ROLE test_unprivileged; BEGIN PERFORM ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','SEC-001','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',5,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'SEC-001'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T11.1 PASS: unprivileged denied'; END; RESET ROLE; END $$;
DO $$ BEGIN SET ROLE ledger_readonly; BEGIN PERFORM ledger.fn_receive_purchase_order(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','SEC-002','expected_revision',1,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',5,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'SEC-002'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T11.2 PASS: readonly denied'; END; RESET ROLE; END $$;
DO $$ BEGIN SET ROLE ledger_app_user; BEGIN INSERT INTO ledger.purchase_orders (po_id, tenant_id, po_number, vendor_id, warehouse_id, po_status, order_date) VALUES ('f0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000001', 'PO_DIRECT', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'issued', '2026-01-01'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T11.3 PASS: app_user denied INSERT'; END; RESET ROLE; END $$;
DO $$ BEGIN SET ROLE ledger_app_user; BEGIN UPDATE ledger.purchase_order_lines SET received_quantity = 999 WHERE po_line_id = '10000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T11.4 PASS: app_user denied UPDATE'; END; RESET ROLE; END $$;
DO $$ BEGIN SET ROLE ledger_app_user; BEGIN DELETE FROM ledger.purchase_orders WHERE po_id = 'f0000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T11.5 PASS: app_user denied DELETE'; END; RESET ROLE; END $$;

-- ═══ TEST 12: Fingerprint includes idempotency key ═══
SELECT 'TEST 12: Fingerprint' AS test_section;
SELECT 'T12.1' AS chk, ledger.fn_command_fingerprint(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','KEY-A','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'pg-jsonb-v1') <> ledger.fn_command_fingerprint(jsonb_build_object('command_type','receive_purchase_order','idempotency_key','KEY-B','expected_revision',0,'po_id','f0000000-0000-0000-0000-000000000001','po_line_id','10000000-0000-0000-0000-000000000001','received_quantity',10,'unit_of_measure','ea','destination_position_id','d0000000-0000-0000-0000-000000000001','formula_version','2g1a-v1.0.0','canon_version','pg-jsonb-v1'), 'pg-jsonb-v1') AS actual, true AS expected;

-- ═══ TEST 13: Catalog verification ═══
SELECT 'TEST 13: Catalog' AS test_section;
SELECT 'T13.1' AS chk, count(*) AS actual FROM (SELECT conname FROM pg_constraint WHERE contype = 'f' AND array_length(conkey, 1) > 1 AND connamespace = 'ledger'::regnamespace) fks;
SELECT 'T13.2' AS chk, fk.conname AS fk_name, CASE WHEN EXISTS (SELECT 1 FROM pg_constraint uc WHERE uc.conrelid = fk.confrelid AND uc.contype IN ('p','u') AND uc.conkey = fk.confkey) THEN 'YES' ELSE 'NO' END AS has_unique FROM (SELECT conname, conrelid, confrelid, conkey, confkey FROM pg_constraint WHERE contype = 'f' AND array_length(conkey, 1) > 1 AND connamespace = 'ledger'::regnamespace) fk ORDER BY fk.conname;
SELECT 'T13.3' AS chk, relname, relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class WHERE relnamespace = 'ledger'::regnamespace AND relkind = 'r' ORDER BY relname;
SELECT 'T13.4' AS chk, p.proname, CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS mode FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'ledger' ORDER BY p.proname;
SELECT 'T13.5' AS chk, p.proname, r.rolname AS owner FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid JOIN pg_roles r ON p.proowner = r.oid WHERE n.nspname = 'ledger' ORDER BY p.proname;
SELECT 'T13.6' AS chk, c.relname, r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid JOIN pg_roles r ON c.relowner = r.oid WHERE n.nspname = 'ledger' AND c.relkind = 'r' ORDER BY c.relname;
SELECT 'T13.9' AS chk, n.nspname, has_schema_privilege('ledger_app_user', n.oid, 'CREATE') AS app_create, has_schema_privilege('ledger_readonly', n.oid, 'CREATE') AS ro_create FROM pg_namespace n WHERE n.nspname IN ('ledger','extensions','public');
SELECT 'T13.10' AS chk, extname, extnamespace::regnamespace AS schema FROM pg_extension WHERE extname = 'pgcrypto';
SELECT 'T13.11' AS chk, c.relname, pol.polname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid JOIN pg_policy pol ON pol.polrelid = c.oid WHERE n.nspname = 'ledger' ORDER BY c.relname, pol.polname;
SELECT 'ALL TESTS COMPLETE' AS final_status;