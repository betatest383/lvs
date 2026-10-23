/**
 * Rate-Limit Protection Utilities for ServiceTitan Sync
 *
 * Provides bounded write concurrency, exponential backoff with jitter,
 * retry-after handling, explicit rate-limit error classification, and
 * resumable per-record processing.
 *
 * Rate-limit responses are classified as retriable infrastructure failures.
 * They must NOT:
 *   - mark the record as a permanent failure,
 *   - advance the record beyond retry eligibility,
 *   - advance the historical watermark past that record,
 *   - create duplicate records on retry.
 */

// ─── Rate-Limit Error Classification ──────────────────────────────────────────

/**
 * Detects whether an error is a rate-limit response from the Base44 SDK
 * or an upstream API. Returns true for any of:
 *   - Base44Error with "Rate limit exceeded" in the message
 *   - HTTP 429 status
 *   - Error message containing "rate limit" or "429" or "too many requests"
 */
export function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err?.name || err).toLowerCase();
  if (msg.includes("rate limit") || msg.includes("rate_limit")) return true;
  if (msg.includes("429") || msg.includes("too many requests")) return true;
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status === 429) return true;
  // Base44 SDK wraps errors; check nested
  if (err?.error?.message && isRateLimitError(err.error)) return true;
  return false;
}

/**
 * Detects whether an error is a transient infrastructure failure that
 * should be retried (rate limit, network timeout, 5xx, connection reset).
 */
export function isRetriableError(err: any): boolean {
  if (!err) return false;
  if (isRateLimitError(err)) return true;
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return true;
  if (msg.includes("econnreset") || msg.includes("socket hang up")) return true;
  if (msg.includes("network") || msg.includes("fetch failed")) return true;
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status >= 500 && status < 600) return true;
  return false;
}

// ─── Retry-After Extraction ────────────────────────────────────────────────────

/**
 * Extracts the retry-after delay (in milliseconds) from an error response
 * if the server provided one. Returns null if not available.
 */
export function extractRetryAfterMs(err: any): number | null {
  if (!err) return null;
  const headers = err?.response?.headers || err?.headers || {};
  const retryAfter = headers["retry-after"] || headers["Retry-After"];
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    // Could be an HTTP date
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  return null;
}

// ─── Exponential Backoff with Jitter ──────────────────────────────────────────

export interface BackoffOptions {
  /** Base delay in ms (default 1000). */
  baseDelayMs?: number;
  /** Maximum delay in ms (default 30000). */
  maxDelayMs?: number;
  /** Backoff multiplier (default 2). */
  multiplier?: number;
  /** Jitter factor 0-1 (default 0.25 = ±25%). */
  jitter?: number;
}

/**
 * Computes the delay for a given retry attempt (0-indexed) using
 * exponential backoff with full jitter.
 */
export function computeBackoffDelay(
  attempt: number,
  opts: BackoffOptions = {}
): number {
  const base = opts.baseDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 30000;
  const mult = opts.multiplier ?? 2;
  const jitter = opts.jitter ?? 0.25;

  const exponential = Math.min(max, base * Math.pow(mult, attempt));
  // Full jitter: random between base and exponential
  const jittered = exponential * (1 - jitter + Math.random() * jitter * 2);
  return Math.round(Math.max(base, Math.min(max, jittered)));
}

// ─── Retry with Backoff ───────────────────────────────────────────────────────

export interface RetryOptions extends BackoffOptions {
  /** Maximum retry attempts (default 5). */
  maxRetries?: number;
  /** Optional callback invoked before each retry sleep. */
  onRetry?: (attempt: number, err: any, delayMs: number) => void;
}

/**
 * Executes a function with automatic retry on retriable errors.
 * Rate-limit errors receive exponential backoff + jitter.
 * Non-retriable errors throw immediately (no retry).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isRetriableError(err) || attempt === maxRetries) {
        throw err;
      }
      // Compute delay: respect retry-after if available, else backoff
      const retryAfter = extractRetryAfterMs(err);
      const delay = retryAfter !== null ? retryAfter : computeBackoffDelay(attempt, opts);
      if (opts.onRetry) {
        opts.onRetry(attempt, err, delay);
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Bounded Concurrency Runner ───────────────────────────────────────────────

export interface BoundedConcurrencyOptions {
  /** Maximum concurrent operations (default 3). */
  concurrency?: number;
}

/**
 * Processes an array of items with bounded concurrency.
 * Each item is processed by the provided function.
 * Returns results in the same order as the input items.
 *
 * Failures in one item do not prevent others from processing.
 */
export async function runBoundedConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: BoundedConcurrencyOptions = {}
): Promise<Array<{ ok: boolean; result?: R; error?: any }>> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const results: Array<{ ok: boolean; result?: R; error?: any }> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try {
        const result = await fn(items[idx], idx);
        results[idx] = { ok: true, result };
      } catch (err: any) {
        results[idx] = { ok: false, error: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Sync Retry Metrics (Permanent Monitoring) ────────────────────────────────

/**
 * Permanent monitoring counters for synchronization retry behavior.
 * These metrics remain available in sync diagnostics for all future
 * ServiceTitan domains (Vendors, Purchase Orders, Receipts, Transfers, etc.).
 */
export interface SyncRetryMetrics {
  duplicate_create_attempts: number;
  duplicate_constraint_blocks: number;
  post_create_rechecks: number;
  lookup_retries: number;
  lookup_retry_successes: number;
  lookup_retry_exhausted: number;
  create_retry_prevented: number;
  create_retry_executed: number;
  update_retries: number;
  maximum_retry_depth: number;
}

export function createSyncRetryMetrics(): SyncRetryMetrics {
  return {
    duplicate_create_attempts: 0,
    duplicate_constraint_blocks: 0,
    post_create_rechecks: 0,
    lookup_retries: 0,
    lookup_retry_successes: 0,
    lookup_retry_exhausted: 0,
    create_retry_prevented: 0,
    create_retry_executed: 0,
    update_retries: 0,
    maximum_retry_depth: 0,
  };
}

// ─── Safe Create with Post-Create Recheck ────────────────────────────────────

/**
 * Safe create semantics: the synchronization flow must NEVER assume a failed
 * create means the record was not persisted. After any createRecord failure,
 * perform findExisting() again before attempting another create.
 *
 * Flow:
 *   1. findExisting() → if exists, update (no create needed)
 *   2. createRecord() → if success, return
 *   3. If createRecord throws → findExisting() again (post-create recheck)
 *   4. If record now exists → treat as successful (create partially committed)
 *      → update instead of creating again
 *   5. Only retry create if the record truly does not exist
 *
 * @param findExisting - Function to look up an existing record
 * @param createRecord - Function to create a new record (may partially commit)
 * @param updateRecord - Function to update an existing record
 * @param metrics - Mutable metrics object for counting retry events
 * @param maxCreateRetries - Max create attempts before giving up (default 3)
 */
export async function safeCreateWithRecheck<T>(
  findExisting: () => Promise<T | null>,
  createRecord: () => Promise<T>,
  updateRecord: (existing: T) => Promise<T>,
  metrics: SyncRetryMetrics,
  maxCreateRetries: number = 3
): Promise<{ record: T; action: "created" | "updated" | "create_recheck_recovery"; attempts: number }> {
  let attempts = 0;

  // Step 1: findExisting
  let existing = await findExisting();
  if (existing) {
    // Record already exists — update, no create needed
    return { record: existing, action: "updated", attempts: 0 };
  }

  // Step 2-5: Create with post-create recheck
  while (attempts < maxCreateRetries) {
    attempts++;
    metrics.maximum_retry_depth = Math.max(metrics.maximum_retry_depth, attempts);

    try {
      // Step 2: Attempt create
      metrics.create_retry_executed++;
      const record = await createRecord();
      return { record, action: "created", attempts };
    } catch (err: any) {
      // Step 3: createRecord threw — do NOT immediately retry create.
      // Perform findExisting() again (post-create recheck).
      metrics.post_create_rechecks++;

      if (isRetriableError(err) && attempts < maxCreateRetries) {
        // Wait with backoff before rechecking
        const delay = isRateLimitError(err)
          ? (extractRetryAfterMs(err) ?? computeBackoffDelay(attempts - 1))
          : computeBackoffDelay(attempts - 1);
        await sleep(delay);
      }

      try {
        existing = await findExisting();
      } catch (lookupErr: any) {
        // The post-create recheck lookup itself failed.
        // This is dangerous: we cannot determine if the record was persisted.
        // Do NOT create again — treat as rate_limited_unresolved.
        metrics.lookup_retry_exhausted++;
        throw new Error(
          `Post-create recheck failed after create error: create_err=${String(err?.message || err).substring(0, 100)}, ` +
          `lookup_err=${String(lookupErr?.message || lookupErr).substring(0, 100)}. ` +
          `Cannot safely determine if record was persisted — refusing to retry create.`
        );
      }

      if (existing) {
        // Step 4: Record now exists — the previous create partially committed.
        // Treat as successful: update the existing record instead of creating again.
        metrics.duplicate_create_attempts++;
        metrics.duplicate_constraint_blocks++;
        const updated = await updateRecord(existing);
        return { record: updated, action: "create_recheck_recovery", attempts };
      }

      // Step 5: Record truly does not exist — safe to retry create
      if (attempts >= maxCreateRetries) {
        metrics.create_retry_prevented++;
        throw new Error(
          `Create failed after ${attempts} attempts and post-create rechecks confirmed record does not exist. ` +
          `Last error: ${String(err?.message || err).substring(0, 200)}`
        );
      }
      // Loop continues — retry create
    }
  }

  throw new Error(`safeCreateWithRecheck exhausted after ${attempts} attempts`);
}

// ─── Per-Record Disposition Tracking ──────────────────────────────────────────

export type RecordDisposition =
  | "created"
  | "updated"
  | "unchanged"
  | "deferred"
  | "permanently_failed"
  | "rate_limited_unresolved";

export interface RecordOutcome {
  source_id: string;
  disposition: RecordDisposition;
  attempts: number;
  error?: string;
  diagnostics?: any[];
}

/**
 * Builds a reconciliation summary from per-record outcomes.
 * created + updated + unchanged + deferred + permanently_failed
 * + rate_limited_unresolved = total
 */
export function reconcileOutcomes(
  outcomes: RecordOutcome[],
  expectedTotal: number
): {
  created: number;
  updated: number;
  unchanged: number;
  deferred: number;
  permanently_failed: number;
  rate_limited_unresolved: number;
  total: number;
  reconciled: boolean;
} {
  const created = outcomes.filter((o) => o.disposition === "created").length;
  const updated = outcomes.filter((o) => o.disposition === "updated").length;
  const unchanged = outcomes.filter((o) => o.disposition === "unchanged").length;
  const deferred = outcomes.filter((o) => o.disposition === "deferred").length;
  const permanently_failed = outcomes.filter((o) => o.disposition === "permanently_failed").length;
  const rate_limited = outcomes.filter((o) => o.disposition === "rate_limited_unresolved").length;
  const total = outcomes.length;
  return {
    created,
    updated,
    unchanged,
    deferred,
    permanently_failed,
    rate_limited_unresolved: rate_limited,
    total,
    reconciled: total === expectedTotal,
  };
}