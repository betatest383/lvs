/**
 * ServiceTitan Sync Adapter Contract — v2
 *
 * The strict interface every sync domain implements. The engine manages:
 *   locking, watermark validation, eligibility, API pagination, deterministic
 *   ordering, duplicate protection, optimistic concurrency, stale-record
 *   rejection, retry handling, deferred records, recovery windows, cursor
 *   advancement, counters, logging, and error handling.
 *
 * The adapter only manages:
 *   - endpoint configuration
 *   - initial pagination state
 *   - record mapping
 *   - dependency requirements
 *   - local lookup
 *   - local create/update behavior
 *   - domain-specific success or failure actions
 *
 * Supports BOTH pagination models proven by live API verification:
 *   - Continuation-token (Customer export): { from, includeRecentChanges }
 *   - Page-based (Customer transactional + Appointment JPM v2): { page, pageSize }
 */

// ─── Pagination ──────────────────────────────────────────────────────────────

export type SyncPaginationState =
  | {
      mode: "page";
      page: number;
      pageSize: number;
    }
  | {
      mode: "continuation";
      continuationToken: string | null;
      pageSize?: number;
    };

export interface SyncPageRequest {
  /** Recovery window start (ISO 8601), including overlap. */
  windowStart?: string;
  /** Recovery window end (ISO 8601). */
  windowEnd?: string;
  /** Which date filter to apply when fetching from the API. */
  filterField?: "createdOn" | "modifiedOn";
  /** Pagination state — page-based or continuation-token. */
  pagination: SyncPaginationState;
}

export interface SyncPageResult<TSource> {
  records: TSource[];
  hasMore: boolean;
  /** Next page number (page-based pagination). */
  nextPage?: number | null;
  /** Next continuation token (continuation-token pagination). */
  nextContinuationToken?: string | null;
  /** Total record count if the API returns it. */
  totalCount?: number | null;
  /** Raw pagination metadata from the API response (for debugging). */
  rawPagination?: Record<string, unknown>;
}

// ─── Sync Context ────────────────────────────────────────────────────────────

export interface SyncContext {
  /** Base44 SDK client (service role). */
  base44: any;
  /** ServiceTitan tenant ID. */
  tenantId: string;
  /** ServiceTitan environment ("production" or "integration"). */
  environment: string;
  /** Active watermark record, or null if not yet activated. */
  watermark: any | null;
  /** Unique batch ID for this sync cycle (for logging). */
  batchId: string;
  /** Where this sync originated. */
  source: "webhook" | "api_recovery" | "on_demand_hydration" | "manual";
  /** Webhook event type, if source is "webhook". */
  eventType?: string;
  /** Webhook event entity ID (ServiceTitanWebhookEvent), for timeline logging. */
  eventId?: string;
  /** Lock ownership token, if a cursor lock was acquired. */
  lockId?: string;
  /** Original webhook payload, if source is "webhook". */
  payload?: any;
}

// ─── Dependency & Eligibility Results ───────────────────────────────────────

export interface DependencyResult {
  status: "satisfied" | "deferred" | "failed";
  warning?: string;
  /** DeferredDependentRecord ID if status is "deferred". */
  deferredRecordId?: string;
}

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
  message?: string;
}

// ─── Record Sync Result ──────────────────────────────────────────────────────

export type SyncRecordAction =
  | "created"
  | "updated"
  | "unchanged"
  | "deferred"
  | "skipped_pre_activation"
  | "skipped_stale"
  | "skipped_duplicate"
  | "failed";

export interface SyncRecordResult<TLocal = any> {
  action: SyncRecordAction;
  /** Local entity record, if created or updated. */
  local?: TLocal;
  /** ServiceTitan entity ID. */
  sourceId: string;
  /** Fields that changed (for audit/timeline). */
  changedFields?: string[];
  /** Error message if action is "failed" or "deferred". */
  error?: string;
  /** Warning messages (non-fatal). */
  warnings?: string[];
  /** Additional domain-specific metadata. */
  metadata?: Record<string, any>;
}

// ─── Batch Result ────────────────────────────────────────────────────────────

export interface SyncBatchResult<TSource = any> {
  /** All source records fetched in this batch. */
  sourceRecords: TSource[];
  /** Per-record results in the same order as sourceRecords. */
  results: SyncRecordResult[];
  /** Pagination state for the next batch. */
  pagination: SyncPaginationState;
  hasMore: boolean;
  totalCount?: number | null;
}

// ─── Version Comparison ─────────────────────────────────────────────────────

export type SourceVersionComparison =
  | "newer"
  | "equal"
  | "older"
  | "invalid_incoming"
  | "invalid_local"
  | "unavailable";

// ─── Adapter Interface ───────────────────────────────────────────────────────

export interface ServiceTitanSyncAdapter<
  TSource = unknown,
  TMapped = unknown,
  TLocal = unknown,
  TPostBatchSummary = void
> {
  // ── Identity ──────────────────────────────────────────────────────────────

  /** Domain label for logging (e.g. "customer", "appointment", "job"). */
  readonly domain: string;

  /** Integration name for the sync cursor (e.g. "servicetitan_customer_export"). */
  readonly integrationName: string;

  // ── Endpoint ───────────────────────────────────────────────────────────────

  /** Return the API endpoint path for this domain. */
  getEndpoint(context: SyncContext): string;

  // ── Pagination Initialization ──────────────────────────────────────────────

  /** Return the initial pagination state for a fresh sync cycle. */
  getInitialPaginationState(context: SyncContext): SyncPaginationState;

  // ── Pagination ─────────────────────────────────────────────────────────────

  /**
   * Fetch a single page of records from the ServiceTitan API.
   * Must support both page-based and continuation-token pagination.
   */
  fetchPage(
    context: SyncContext,
    request: SyncPageRequest
  ): Promise<SyncPageResult<TSource>>;

  // ── Source Record Identification ───────────────────────────────────────────

  /** Extract the ServiceTitan entity ID from a source record. Returns null if missing. */
  getSourceId(record: TSource): string | null;

  /** Extract the createdOn timestamp from a source record. */
  getSourceCreatedOn(record: TSource): string | null;

  /** Extract the modifiedOn timestamp from a source record. */
  getSourceModifiedOn(record: TSource): string | null;

  // ── Record Mapping ─────────────────────────────────────────────────────────

  /**
   * Map a source API record into the domain-specific mapped type.
   * This is where field extraction, normalization, and timezone handling happen.
   */
  mapRecord(
    record: TSource,
    context: SyncContext
  ): Promise<TMapped>;

  // ── Local Lookup ───────────────────────────────────────────────────────────

  /**
   * Find an existing local record by the ServiceTitan entity ID.
   * Returns null if not found.
   */
  findExisting(
    base44: any,
    mapped: TMapped,
    context: SyncContext
  ): Promise<TLocal | null>;

  /** Extract the source-side modifiedOn from an existing local record (for stale comparison). */
  getLocalSourceModifiedOn(existing: TLocal): string | null;

  // ── Eligibility (optional) ─────────────────────────────────────────────────

  /**
   * Check if a record is eligible for sync.
   * If omitted, the engine uses isPostActivation() against the watermark.
   */
  checkEligibility?(
    base44: any,
    record: TSource,
    mapped: TMapped | null,
    context: SyncContext
  ): Promise<EligibilityResult>;

  // ── Dependency Verification (optional) ─────────────────────────────────────

  /**
   * Verify that all dependencies are satisfied before creating/updating.
   * E.g. appointments require a local Customer to exist first.
   */
  verifyDependencies?(
    base44: any,
    mapped: TMapped,
    context: SyncContext
  ): Promise<DependencyResult>;

  // ── Record Lifecycle ───────────────────────────────────────────────────────

  /**
   * Compare an existing local record with the mapped data.
   * Returns true if they are equal (no update needed → idempotent no-op).
   */
  recordsEqual(
    existing: TLocal,
    mapped: TMapped
  ): boolean;

  /** Create a new local record from the mapped data. */
  createRecord(
    base44: any,
    mapped: TMapped,
    context: SyncContext
  ): Promise<TLocal>;

  /** Update an existing local record with the mapped data. */
  updateRecord(
    base44: any,
    existing: TLocal,
    mapped: TMapped,
    context: SyncContext
  ): Promise<TLocal>;

  // ── Post-Batch Processing (optional) ───────────────────────────────────────

  /**
   * Called after a batch of records has been processed.
   * E.g. customer contact sync fetches contacts for newly created customers.
   */
  postBatchProcess?(
    base44: any,
    batch: SyncBatchResult<TSource>,
    context: SyncContext
  ): Promise<TPostBatchSummary | void>;

  // ── Lifecycle Hooks ────────────────────────────────────────────────────────

  /** Called after a record is successfully created, updated, or skipped. */
  onSuccess?(
    base44: any,
    result: SyncRecordResult<TLocal>,
    context: SyncContext
  ): Promise<void>;

  /** Called when a record fails to sync (error or deferral). */
  onFailure?(
    base44: any,
    error: unknown,
    mapped: TMapped | null,
    context: SyncContext
  ): Promise<void>;
}