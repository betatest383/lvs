/**
 * Generic Synchronization Engine — Shared Types
 *
 * Domain-agnostic types used by all ServiceTitan sync domains
 * (Customer, Appointment, Job, Estimate, Invoice, Membership, Project).
 *
 * Each domain provides its own config + record processor; the shared
 * engine handles watermark lifecycle, locking, recovery scanning,
 * API verification, and preflight validation.
 */

// ─── Watermark ───────────────────────────────────────────────────────────────

export interface WatermarkConfig {
  /** Base44 entity name, e.g. "CustomerSyncWatermark" or "AppointmentSyncWatermark" */
  entityName: string;
  /** Unique watermark key, e.g. "customer_go_live" or "appointment_go_live" */
  watermarkKey: string;
  /** Sync strategy label, e.g. "new_customers_only" */
  syncStrategy: string;
  /** Default recovery overlap in minutes */
  defaultOverlapMinutes?: number;
}

// ─── Lock Management ─────────────────────────────────────────────────────────

export interface LockableCursor {
  id: string;
  lock_id?: string;
  lock_expires_at?: string | null;
  status?: string;
}

export interface LockConfig {
  /** Base44 entity name for the cursor, e.g. "ServiceTitanSyncCursor" */
  entityName: string;
  /** Lock duration in minutes before automatic expiry */
  lockDurationMinutes: number;
}

// ─── Recovery Scan ───────────────────────────────────────────────────────────

export interface RecoveryScanConfig {
  /** Domain label for logging, e.g. "appointment" */
  domain: string;
  /** Watermark entity name */
  watermarkEntityName: string;
  /** Cursor entity name (for lock management) */
  cursorEntityName: string;
  /** Fetch a single page of records from the ServiceTitan API */
  fetchPage: (
    environment: string,
    tenantId: string,
    since: string,
    page: number,
    pageSize: number
  ) => Promise<{ records: any[]; hasMore: boolean }>;
  /** Process a single API record (upsert, defer, or skip) */
  processRecord: (
    base44: any,
    record: any,
    context: RecoveryScanContext
  ) => Promise<RecoveryRecordResult>;
  /** Max pages per scan cycle */
  maxPages?: number;
  /** Page size for API requests */
  pageSize?: number;
  /** Default overlap minutes if watermark has none */
  defaultOverlapMinutes?: number;
}

export interface RecoveryScanContext {
  tenantId: string;
  environment: string;
  watermark: any;
  batchId: string;
}

export interface RecoveryRecordResult {
  action: "created" | "updated" | "unchanged" | "deferred" | "skipped" | "error";
  error?: string;
}

export interface RecoveryScanResult {
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  records_deferred: number;
  records_skipped: number;
  errors: number;
  pages_processed: number;
  total_records_scanned: number;
  has_more: boolean;
  window_start: string;
  window_end: string;
  cursor_advanced: boolean;
  summary: string;
}

// ─── API Verification ───────────────────────────────────────────────────────

export interface ApiVerificationResult {
  http_status: number;
  endpoint: string;
  request_params: Record<string, string>;
  response_top_level_keys: string[];
  records_returned: number;
  pagination: {
    hasMore: any;
    page: any;
    pageSize: any;
    totalCount: any;
  };
  first_record_fields: string[] | string;
  first_record_id: any;
  first_record_createdOn: any;
  first_record_modifiedOn: any;
  writes_performed: false;
  watermark_advanced: false;
}

// ─── Preflight ──────────────────────────────────────────────────────────────

export interface PreflightCheck {
  id: number;
  name: string;
  status: "PASS" | "FAIL";
  details: string;
}

export interface PreflightConfig {
  domain: string;
  watermarkEntityName: string;
  watermarkKey: string;
  /** API endpoint path for connectivity check, e.g. "/jpm/v2/tenant/{tenant}/appointments" */
  apiEndpoint: string;
  /** Expected sync strategy */
  expectedSyncStrategy: string;
  /** Deferred entity name for queue health check, e.g. "DeferredDependentRecord" */
  deferredEntityName?: string;
  /** Additional domain-specific checks */
  customChecks?: (
    base44: any,
    user: any,
    tenantId: string,
    environment: string,
    watermark: any | null
  ) => Promise<PreflightCheck[]>;
}

export interface PreflightResult {
  all_passed: boolean;
  checks: PreflightCheck[];
  failed_checks: PreflightCheck[];
  watermark: any | null;
  api_latency_ms: number;
}