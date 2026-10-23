/**
 * ServiceTitan Customer API Export Synchronization
 *
 * Handles incremental API-based customer synchronization using the CRM v2
 * export endpoint. Works alongside the webhook handler — both reuse the
 * same shared customer upsert logic in stCustomerSync.ts.
 *
 * Primary endpoint:
 *   GET /crm/v2/tenant/{tenant}/export/customers
 *   Parameters: from (continuation token), includeRecentChanges (boolean)
 *
 * Contact endpoints:
 *   GET /crm/v2/tenant/{tenant}/customers/contacts?ids=<ST_CUSTOMER_IDS>
 *
 * P1 — Contact Sync: Uses ServiceTitan customer IDs for API calls.
 *   Never sends Base44 entity IDs to ServiceTitan. Maps contacts back
 *   to local Customer records using servicetitan_customer_id.
 *
 * P2 — Dry Run: Performs ZERO writes. No cursor updates, no timeline
 *   entries, no contact sync, no conflict history.
 *
 * P6 — Lock Ownership: Every lock has an ownership token (lockId). Only
 *   the worker that acquired the lock may update the cursor, release the
 *   lock, or advance the continuation token. Stale workers are rejected.
 */

import { apiRequest, retryWithBackoff, getAccessToken, clearCachedToken, ApiError } from "./stAuth.ts";
import { upsertCustomerFromApiExport, type ApiSyncResult, type ApiSyncOptions } from "./stCustomerSync.ts";
import { findLocalCustomer } from "./stCustomerMapping.ts";
import { retryPendingMerges, getPendingMergeStats, type PendingMergeStats } from "./stCustomerPendingMerge.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCK_DURATION_MINUTES = 10;
const MAX_PAGES_PER_CYCLE = 50;
const PAGE_SIZE = 500;
const CONTACT_BATCH_SIZE = 50;

const INTEGRATION_NAME = "servicetitan_customer_export";
const DOMAIN = "customer";

// ─── Cursor Management ──────────────────────────────────────────────────────

/**
 * Get or create the sync cursor for a given tenant and environment.
 * One cursor per (tenant, environment) pair.
 */
export async function getOrCreateCursor(
  base44: any,
  tenantId: string,
  environment: string
): Promise<any> {
  const existing = await base44.asServiceRole.entities.ServiceTitanSyncCursor.filter(
    {
      integration_name: INTEGRATION_NAME,
      domain: DOMAIN,
      tenant_id: tenantId,
      environment: environment,
    },
    "-created_date",
    1
  );

  if (existing && existing.length > 0) {
    return existing[0];
  }

  return await base44.asServiceRole.entities.ServiceTitanSyncCursor.create({
    integration_name: INTEGRATION_NAME,
    domain: DOMAIN,
    tenant_id: tenantId,
    environment: environment,
    continuation_token: "",
    status: "idle",
    mode: "incremental",
    records_processed: 0,
    total_records_synced: 0,
    consecutive_failures: 0,
  });
}

/**
 * Check if a cursor's lock is expired or absent.
 */
export function isLockExpired(cursor: any): boolean {
  if (!cursor.lock_expires_at) return true;
  const expiresAt = new Date(cursor.lock_expires_at).getTime();
  if (isNaN(expiresAt)) return true;
  return Date.now() > expiresAt;
}

/**
 * Attempt to acquire a lock on the cursor.
 * Returns the lock ID if successful, null if another worker holds the lock.
 */
export async function acquireLock(
  base44: any,
  cursor: any
): Promise<string | null> {
  if (!isLockExpired(cursor)) {
    return null;
  }

  const lockId = `LOCK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  const lockExpiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  try {
    await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
      lock_id: lockId,
      lock_expires_at: lockExpiresAt,
      status: "running",
      last_attempt_at: now,
    });
    return lockId;
  } catch (err) {
    console.error("[ST API SYNC] Lock acquisition failed:", err);
    return null;
  }
}

/**
 * P6 — Verify that the current worker still owns the lock.
 * Re-reads the cursor and checks lock_id matches.
 * Only the lock owner may update the cursor or release the lock.
 */
export async function verifyLockOwnership(
  base44: any,
  cursorId: string,
  lockId: string
): Promise<boolean> {
  try {
    const fresh = await base44.asServiceRole.entities.ServiceTitanSyncCursor.get(cursorId);
    if (!fresh) return false;
    if (fresh.lock_id !== lockId) {
      console.warn(`[ST API SYNC] Lock ownership lost. Expected '${lockId}', found '${fresh.lock_id}'.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ST API SYNC] Lock ownership check failed:", err);
    return false;
  }
}

/**
 * Release the lock and update cursor state.
 * P6: Verifies lock ownership before updating. Stale workers are rejected.
 */
export async function releaseLock(
  base44: any,
  cursorId: string,
  lockId: string,
  updates: Record<string, any>,
  success: boolean
): Promise<void> {
  // P6: Verify ownership before releasing
  const ownsLock = await verifyLockOwnership(base44, cursorId, lockId);
  if (!ownsLock) {
    console.warn(`[ST API SYNC] Stale worker attempted to release lock '${lockId}' — rejected.`);
    return;
  }

  const now = new Date().toISOString();
  const finalUpdates: Record<string, any> = {
    ...updates,
    lock_id: "",
    lock_expires_at: null,
    status: success ? "idle" : "failed",
    last_attempt_at: now,
  };

  if (success) {
    finalUpdates.last_successful_sync_at = now;
    finalUpdates.consecutive_failures = 0;
    finalUpdates.last_error = "";
  } else {
    finalUpdates.consecutive_failures = (updates.consecutive_failures || 0) + 1;
  }

  try {
    await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursorId, finalUpdates);
  } catch (err) {
    console.error("[ST API SYNC] Lock release failed:", err);
  }
}

// ─── API Page Fetch ──────────────────────────────────────────────────────────

export interface CustomerPageResult {
  records: any[];
  hasMore: boolean;
  continuationToken: string;
  /** HTTP status code from the API response (for dry-run reporting). */
  httpStatus?: number;
  /** Wall-clock time (ms) for the API call that fetched this page. */
  fetchDurationMs?: number;
}

/**
 * Fetch a single page of customers from the CRM v2 export endpoint.
 */
export async function fetchCustomerPage(
  environment: string,
  tenantId: string,
  continuationToken: string,
  includeRecentChanges: boolean = true
): Promise<CustomerPageResult> {
  const path = `/crm/v2/tenant/${tenantId}/export/customers`;
  const params: Record<string, string> = {
    includeRecentChanges: String(includeRecentChanges),
  };
  if (continuationToken) {
    params.from = continuationToken;
  }

  const fetchStart = Date.now();
  const result = await retryWithBackoff(async () => {
    return await apiRequest(path, environment, { params });
  });
  const fetchDurationMs = Date.now() - fetchStart;

  const records = result.data || result.results || result.customers || [];
  const nextToken = result.continueFrom || result.continue_from || result.nextPageToken || result.next_page_token || "";
  // Derive hasMore from explicit flag OR presence of a continuation token.
  // The ServiceTitan export API signals more data via the continuation token.
  const explicitHasMore = result.hasMore ?? result.has_more ?? result.hasMoreData ?? null;
  const hasMore = explicitHasMore !== null ? explicitHasMore : (!!nextToken);

  console.log(
    `[ST API SYNC] Export endpoint call succeeded: ` +
    `records=${records.length}, hasMore=${hasMore}, ` +
    `continuationToken=${nextToken ? "yes" : "no"}, ` +
    `duration=${fetchDurationMs}ms`
  );

  return { records, hasMore, continuationToken: nextToken, httpStatus: 200, fetchDurationMs };
}

// ─── Batch Processing ────────────────────────────────────────────────────────

export interface BatchProcessResult {
  created: number;
  updated: number;
  unchanged: number;
  ignored_stale: number;
  merged: number;
  deactivated: number;
  restored: number;
  errors: number;
  /**
   * P1: ServiceTitan customer IDs of newly created local customers.
   * Used for contact synchronization — NEVER Base44 entity IDs.
   */
  newCustomerStIds: string[];
  details: ApiSyncResult[];
}

/**
 * Process a batch of customer export records through the shared upsert logic.
 * Idempotent — repeated records produce no duplicates.
 */
export async function processBatch(
  base44: any,
  records: any[],
  cursor: any,
  tenantId: string,
  batchId: string,
  dryRun: boolean = false
): Promise<BatchProcessResult> {
  const result: BatchProcessResult = {
    created: 0, updated: 0, unchanged: 0, ignored_stale: 0,
    merged: 0, deactivated: 0, restored: 0, errors: 0,
    newCustomerStIds: [], details: [],
  };

  const options: ApiSyncOptions = {
    tenantId,
    batchId,
    cursorId: cursor.id,
    continuationToken: cursor.continuation_token || "",
    dryRun,
  };

  for (const record of records) {
    try {
      const syncResult = await upsertCustomerFromApiExport(base44, record, options);
      result.details.push(syncResult);

      if (syncResult.failed) {
        result.errors++;
        continue;
      }

      switch (syncResult.action) {
        case "created":
          result.created++;
          // P1: Collect ServiceTitan customer IDs (NOT Base44 entity IDs)
          if (syncResult.servicetitan_customer_id) {
            result.newCustomerStIds.push(syncResult.servicetitan_customer_id);
          }
          break;
        case "updated": result.updated++; break;
        case "unchanged": result.unchanged++; break;
        case "ignored_stale": result.ignored_stale++; break;
        case "merged": result.merged++; break;
        case "deactivated": result.deactivated++; break;
        case "restored": result.restored++; break;
        default: result.errors++; break;
      }
    } catch (err) {
      console.error("[ST API SYNC] Record processing error:", err);
      result.errors++;
      result.details.push({
        action: "unchanged",
        servicetitan_customer_id: String(record.id || ""),
        summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}

// ─── Contact Synchronization (P1) ───────────────────────────────────────────

/**
 * Fetch and apply contact data for newly created customers.
 *
 * P1 Fix: Uses ServiceTitan customer IDs for API calls — NEVER Base44 entity IDs.
 * After receiving contacts, maps back to local Customer using servicetitan_customer_id.
 *
 * Logging: Logs ST IDs sent, contacts returned, and local customer updates.
 */
export async function syncContacts(
  base44: any,
  stCustomerIds: string[],
  environment: string,
  tenantId: string
): Promise<{ synced: number; failed: number; unchanged: number; customers_created: number; contacts_created: number; contacts_updated: number; contacts_unchanged: number; contacts_failed: number; summary: string }> {
  if (stCustomerIds.length === 0) {
    return { synced: 0, failed: 0, unchanged: 0, customers_created: 0, contacts_created: 0, contacts_updated: 0, contacts_unchanged: 0, contacts_failed: 0, summary: "No new customers to sync contacts for" };
  }

  let synced = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < stCustomerIds.length; i += CONTACT_BATCH_SIZE) {
    const batch = stCustomerIds.slice(i, i + CONTACT_BATCH_SIZE);
    const batchIds = batch.join(",");

    // P1 LOG: ServiceTitan customer IDs sent to API
    console.log(`[ST CONTACT SYNC] Sending ST customer IDs to contacts API: [${batchIds}]`);

    try {
      const contactsData = await retryWithBackoff(async () => {
        return await apiRequest(
          `/crm/v2/tenant/${tenantId}/customers/contacts`,
          environment,
          { params: { customerIDs: batchIds } }
        );
      });

      const contacts = Array.isArray(contactsData) ? contactsData :
                       contactsData.data || contactsData.results || [];

      // P1 LOG: Contacts returned by ServiceTitan
      console.log(`[ST CONTACT SYNC] ServiceTitan returned ${contacts.length} contacts for ${batch.length} customers`);

      // Group contacts by ServiceTitan customer ID
      const contactsByStId = new Map<string, any[]>();
      for (const contact of contacts) {
        const custStId = String(contact.customerId || contact.customer_id || "");
        if (!custStId) continue;
        if (!contactsByStId.has(custStId)) {
          contactsByStId.set(custStId, []);
        }
        contactsByStId.get(custStId)!.push(contact);
      }

      // P1: Map each ST customer back to local Customer and update
      for (const stCustomerId of batch) {
        const customerContacts = contactsByStId.get(stCustomerId) || [];

        if (customerContacts.length === 0) {
          console.log(`[ST CONTACT SYNC] No contacts returned for ST customer '${stCustomerId}'`);
          continue;
        }

        // P1: Find local customer by ServiceTitan customer ID — NOT by Base44 ID
        const localCustomer = await findLocalCustomer(base44, stCustomerId);
        if (!localCustomer) {
          console.warn(`[ST CONTACT SYNC] No local customer found for ST customer '${stCustomerId}' — skipping contact update`);
          failed++;
          // Create contact sync retry record for later retry
          try {
            const { createContactSyncRetry } = await import("./stOnDemandHydration.ts");
            await createContactSyncRetry(
              base44, stCustomerId, "", tenantId, environment, "recovery",
              `No local customer found for ST customer '${stCustomerId}' during contact sync`
            );
          } catch { /* non-fatal */ }
          continue;
        }

        // Extract primary phone and email from contacts
        let primaryPhone = "";
        let altPhone = "";
        let primaryEmail = "";
        let altEmail = "";

        for (const contact of customerContacts) {
          const type = String(contact.type || contact.contactType || "").toLowerCase();
          const value = String(contact.value || contact.contactValue || "").trim();
          if (!value) continue;

          if (type.includes("email")) {
            if (!primaryEmail) primaryEmail = value;
            else if (!altEmail) altEmail = value;
          } else if (type.includes("phone") || type.includes("mobile") || type.includes("home")) {
            if (!primaryPhone) primaryPhone = value;
            else if (!altPhone) altPhone = value;
          }
        }

        const updateData: Record<string, any> = {};
        if (primaryPhone && !localCustomer.phone) updateData.phone = primaryPhone;
        if (altPhone && !localCustomer.alt_phone) updateData.alt_phone = altPhone;
        if (primaryEmail && !localCustomer.email) updateData.email = primaryEmail;
        if (altEmail && !localCustomer.alt_email) updateData.alt_email = altEmail;

        if (Object.keys(updateData).length > 0) {
          updateData.contact_sync_status = "complete";
          updateData.contact_last_synced_at = new Date().toISOString();
          updateData.contact_sync_attempt_count = (localCustomer.contact_sync_attempt_count || 0) + 1;
          await base44.asServiceRole.entities.Customer.update(localCustomer.id, updateData);
          synced++;
          created++;
          console.log(`[ST CONTACT SYNC] Local customer '${localCustomer.id}' (ST: '${stCustomerId}') updated with contacts: ${JSON.stringify(updateData)}`);
        } else {
          unchanged++;
          await base44.asServiceRole.entities.Customer.update(localCustomer.id, {
            contact_sync_status: "complete",
            contact_last_synced_at: new Date().toISOString(),
            contact_sync_attempt_count: (localCustomer.contact_sync_attempt_count || 0) + 1,
          });
          console.log(`[ST CONTACT SYNC] No new contact data for local customer '${localCustomer.id}' (ST: '${stCustomerId}') — marked complete`);
        }
      }
    } catch (err) {
      console.error(`[ST CONTACT SYNC] Batch contact fetch failed for ST IDs [${batchIds}]:`, err);
      failed += batch.length;
      // Create contact sync retry records for each failed customer
      for (const failStId of batch) {
        try {
          const { createContactSyncRetry } = await import("./stOnDemandHydration.ts");
          await createContactSyncRetry(
            base44, failStId, "", tenantId, environment, "recovery",
            `Batch contact fetch failed: ${err instanceof Error ? err.message : String(err)}`
          );
        } catch { /* non-fatal */ }
      }
    }
  }

  return {
    synced,
    failed,
    unchanged,
    customers_created: created,
    contacts_created: created,
    contacts_updated: updated,
    contacts_unchanged: unchanged,
    contacts_failed: failed,
    summary: `Contacts synced for ${synced} customers (${created} created, ${updated} updated, ${unchanged} unchanged), ${failed} failed`,
  };
}

// ─── Full Sync Cycle ─────────────────────────────────────────────────────────

export interface SyncCycleResult {
  cursor_id: string;
  mode: string;
  pages_processed: number;
  total_records: number;
  created: number;
  updated: number;
  unchanged: number;
  ignored_stale: number;
  merged: number;
  deactivated: number;
  restored: number;
  errors: number;
  contacts_synced: number;
  contacts_failed: number;
  initial_continuation_token: string;
  final_continuation_token: string;
  has_more: boolean;
  dry_run: boolean;
  summary: string;
  /** Dry-run instrumentation: OAuth succeeded. */
  oauth_success?: boolean;
  /** Dry-run instrumentation: Export endpoint call succeeded. */
  export_endpoint_success?: boolean;
  /** Dry-run instrumentation: HTTP status from the first export call. */
  export_http_status?: number;
  /** Dry-run instrumentation: Customers returned on page 1. */
  page_1_customers?: number;
  /** Dry-run instrumentation: Whether a continuation token was received. */
  continuation_token_received?: boolean;
  /** Dry-run instrumentation: Wall-clock time (ms) for OAuth token acquisition. */
  oauth_duration_ms?: number;
  /** Dry-run instrumentation: Wall-clock time (ms) for the first export call. */
  page_1_fetch_ms?: number;
  /** Dry-run instrumentation: Estimated total runtime (seconds) for a complete sync. */
  estimated_total_runtime_seconds?: number | null;
  // ── Pending merge stats ──
  pending_merges_created?: number;
  pending_merges_retried?: number;
  pending_merges_completed?: number;
  pending_merges_failed?: number;
  oldest_pending_merge_age_seconds?: number | null;
}

/**
 * Run a full sync cycle: fetch pages, process records, sync contacts, update cursor.
 *
 * P2: Dry run performs ZERO writes — no cursor updates, no timeline entries,
 *     no contact sync, no conflict history.
 *
 * P6: Lock ownership is verified before each cursor update. Stale workers
 *     cannot advance the continuation token.
 *
 * Continuation token safety: only advances after all records in a batch
 * are processed successfully or intentionally classified.
 */
export async function runSyncCycle(
  base44: any,
  cursor: any,
  environment: string,
  tenantId: string,
  mode: string,
  lockId: string,
  dryRun: boolean = false
): Promise<SyncCycleResult> {
  const batchId = `BATCH-${Date.now().toString(36)}`;
  const initialToken = cursor.continuation_token || "";

  // ── Dry-run instrumentation fields ──
  let oauthSuccess = false;
  let exportEndpointSuccess = false;
  let exportHttpStatus: number | undefined;
  let page1Customers: number | undefined;
  let continuationTokenReceived: boolean | undefined;
  let oauthDurationMs: number | undefined;
  let page1FetchMs: number | undefined;
  let estimatedTotalRuntimeSeconds: number | null = null;
  const cycleStart = Date.now();

  // ── Dry run: log OAuth success immediately ──
  if (dryRun) {
    console.log("[ST API SYNC] [DRY RUN] Acquiring OAuth token...");
    const oauthStart = Date.now();
    try {
      await getAccessToken(environment);
      oauthDurationMs = Date.now() - oauthStart;
      oauthSuccess = true;
      console.log(`[ST API SYNC] [DRY RUN] OAuth succeeded in ${oauthDurationMs}ms`);
    } catch (err) {
      oauthDurationMs = Date.now() - oauthStart;
      console.error(`[ST API SYNC] [DRY RUN] OAuth failed after ${oauthDurationMs}ms:`, err);
      return {
        cursor_id: cursor.id, mode, pages_processed: 0, total_records: 0,
        created: 0, updated: 0, unchanged: 0, ignored_stale: 0, merged: 0,
        deactivated: 0, restored: 0, errors: 0, contacts_synced: 0, contacts_failed: 0,
        initial_continuation_token: initialToken, final_continuation_token: initialToken,
        has_more: false, dry_run: true,
        oauth_success: false, export_endpoint_success: false,
        summary: `OAuth failed: ${err instanceof Error ? err.message : String(err)}`,
        oauth_duration_ms: oauthDurationMs,
        estimated_total_runtime_seconds: null,
      };
    }
  }

  const totals = {
    created: 0, updated: 0, unchanged: 0, ignored_stale: 0,
    merged: 0, deactivated: 0, restored: 0, errors: 0,
  };

  let allNewCustomerStIds: string[] = [];
  let pagesProcessed = 0;
  let totalRecords = 0;
  let currentToken = initialToken;
  let hasMore = false;

  // P2: Dry run — process ONLY the first page, then stop immediately.
  const maxPages = dryRun ? 1 : MAX_PAGES_PER_CYCLE;

  for (let page = 0; page < maxPages; page++) {
    // Fetch page from API
    const pageResult = await fetchCustomerPage(
      environment,
      tenantId,
      currentToken,
      true
    );

    // ── Dry-run: log and capture first-page metrics ──
    if (dryRun && page === 0) {
      exportEndpointSuccess = true;
      exportHttpStatus = pageResult.httpStatus;
      page1Customers = pageResult.records.length;
      continuationTokenReceived = !!pageResult.continuationToken;
      page1FetchMs = pageResult.fetchDurationMs;
      console.log(
        `[ST API SYNC] [DRY RUN] Page 1: customers=${pageResult.records.length}, ` +
        `continuationToken=${pageResult.continuationToken ? "yes" : "no"}, ` +
        `hasMore=${pageResult.hasMore}, fetchMs=${pageResult.fetchDurationMs}`
      );
    }

    console.log(
      `[ST API SYNC] Page ${page + 1}: customers=${pageResult.records.length}, ` +
      `continuationToken=${pageResult.continuationToken ? "yes" : "no"}, ` +
      `elapsed=${Date.now() - cycleStart}ms`
    );

    if (pageResult.records.length === 0) {
      hasMore = false;
      break;
    }

    totalRecords += pageResult.records.length;

    // P2: Dry run — skip record processing entirely.
    // The dry run only verifies OAuth + export endpoint connectivity.
    // No database reads or writes.
    if (dryRun) {
      pagesProcessed++;
      hasMore = pageResult.hasMore;
      console.log(
        `[ST API SYNC] [DRY RUN] Skipping record processing — ` +
        `${pageResult.records.length} records would be processed.`
      );
      break;
    }

    // Process all records in the batch
    const batchResult = await processBatch(
      base44,
      pageResult.records,
      cursor,
      tenantId,
      `${batchId}-P${page}`,
      dryRun
    );

    totals.created += batchResult.created;
    totals.updated += batchResult.updated;
    totals.unchanged += batchResult.unchanged;
    totals.ignored_stale += batchResult.ignored_stale;
    totals.merged += batchResult.merged;
    totals.deactivated += batchResult.deactivated;
    totals.restored += batchResult.restored;
    totals.errors += batchResult.errors;

    allNewCustomerStIds.push(...batchResult.newCustomerStIds);

    pagesProcessed++;

    // ── CONTINUATION TOKEN SAFETY ──
    if (batchResult.errors > 0) {
      console.error(
        `[ST API SYNC] ${batchResult.errors} record(s) failed in batch ${batchId}-P${page}. ` +
        `Continuation token NOT advanced. Token preserved at '${currentToken}'.`
      );
      hasMore = true;
      break;
    }

    // P2: Only advance continuation token and update cursor in non-dry-run mode
    if (!dryRun) {
      // P6: Verify lock ownership before updating cursor
      const ownsLock = await verifyLockOwnership(base44, cursor.id, lockId);
      if (!ownsLock) {
        console.error(`[ST API SYNC] Lock ownership lost during sync — aborting. Token NOT advanced.`);
        hasMore = true;
        break;
      }

      currentToken = pageResult.continuationToken;
      cursor.continuation_token = currentToken;

      await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
        continuation_token: currentToken,
        last_completed_page_at: new Date().toISOString(),
        records_processed: (cursor.records_processed || 0) + pageResult.records.length,
        total_records_synced: (cursor.total_records_synced || 0) + batchResult.created + batchResult.updated,
        last_batch_id: `${batchId}-P${page}`,
      });
    }

    hasMore = pageResult.hasMore;

    // ── Retry pending merges after each successful page ──
    // New customers synced on this page may resolve pending merge targets.
    if (!dryRun && pagesProcessed > 0) {
      try {
        const pageMergeStats = await retryPendingMerges(base44, tenantId);
        console.log(
          `[ST API SYNC] Post-page pending merge retry: ` +
          `retried=${pageMergeStats.pending_retried}, completed=${pageMergeStats.pending_completed}, ` +
          `failed=${pageMergeStats.pending_failed}, oldest=${pageMergeStats.oldest_pending_age_seconds}s`
        );
      } catch (err) {
        console.error("[ST API SYNC] Post-page pending merge retry failed:", err);
      }
    }

    // P2: Dry run — stop after the first page immediately.
    // Do NOT continue through additional pages.
    if (dryRun) {
      break;
    }

    if (!hasMore) break;
  }

  // ── Dry-run: estimate total runtime for a complete sync ──
  if (dryRun && page1FetchMs && page1Customers && page1Customers > 0) {
    // Estimate: if page 1 took X ms, and there are more pages,
    // assume similar fetch + processing time per page.
    // Total pages = ceil(total_customers / PAGE_SIZE) — but we don't know total.
    // Instead, estimate per-record time and extrapolate.
    const perRecordMs = page1FetchMs / page1Customers;
    console.log(
      `[ST API SYNC] [DRY RUN] Estimated per-record fetch time: ${perRecordMs.toFixed(2)}ms`
    );
    // We can't estimate total without knowing total customer count.
    // Provide the per-page time; the caller can extrapolate.
    estimatedTotalRuntimeSeconds = null; // Unknown without total customer count
  }

  // P2: Skip contact sync in dry run mode
  let contactsSynced = 0;
  let contactsFailed = 0;
  if (!dryRun && allNewCustomerStIds.length > 0) {
    try {
      const contactResult = await syncContacts(base44, allNewCustomerStIds, environment, tenantId);
      contactsSynced = contactResult.synced;
      contactsFailed = contactResult.failed;

      // P6: Verify lock ownership before updating cursor
      const ownsLock = await verifyLockOwnership(base44, cursor.id, lockId);
      if (ownsLock) {
        await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
          contacts_last_synced_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[ST API SYNC] Contact sync failed:", err);
    }
  }

  // ── Final pending merge retry pass after the entire export cycle ──
  let finalMergeStats: PendingMergeStats | null = null;
  if (!dryRun) {
    try {
      finalMergeStats = await retryPendingMerges(base44, tenantId);
      console.log(
        `[ST API SYNC] Final pending merge retry: ` +
        `retried=${finalMergeStats.pending_retried}, completed=${finalMergeStats.pending_completed}, ` +
        `failed=${finalMergeStats.pending_failed}, oldest=${finalMergeStats.oldest_pending_age_seconds}s`
      );
    } catch (err) {
      console.error("[ST API SYNC] Final pending merge retry failed:", err);
    }
  }

  // P2: Skip cursor summary update in dry run mode
  if (!dryRun) {
    const ownsLock = await verifyLockOwnership(base44, cursor.id, lockId);
    if (ownsLock) {
      await base44.asServiceRole.entities.ServiceTitanSyncCursor.update(cursor.id, {
        last_sync_summary_json: JSON.stringify({
          ...totals, contacts_synced: contactsSynced, contacts_failed: contactsFailed,
          pages_processed: pagesProcessed, total_records: totalRecords,
          pending_merges: finalMergeStats,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  }

  const summary = dryRun
    ? `[DRY RUN] OAuth: ${oauthSuccess ? "SUCCESS" : "FAILED"} (${oauthDurationMs}ms). ` +
      `Export endpoint: ${exportEndpointSuccess ? "SUCCESS" : "FAILED"} (HTTP ${exportHttpStatus}, ${page1FetchMs}ms). ` +
      `Page 1: ${page1Customers} customers received. ` +
      `Continuation token: ${continuationTokenReceived ? "yes (more data available)" : "no (single page)"}. ` +
      `Has more: ${hasMore}. ` +
      `No data written, no cursor updated, no contacts synced.`
    : `Processed ${pagesProcessed} pages, ${totalRecords} records. ` +
      `Created: ${totals.created}, Updated: ${totals.updated}, Unchanged: ${totals.unchanged}, ` +
      `Stale: ${totals.ignored_stale}, Merged: ${totals.merged}, Deactivated: ${totals.deactivated}, ` +
      `Restored: ${totals.restored}, Errors: ${totals.errors}. ` +
      `Contacts: ${contactsSynced} synced, ${contactsFailed} failed. ` +
      `Has more: ${hasMore}`;

  return {
    cursor_id: cursor.id,
    mode,
    pages_processed: pagesProcessed,
    total_records: totalRecords,
    ...totals,
    contacts_synced: contactsSynced,
    contacts_failed: contactsFailed,
    initial_continuation_token: initialToken,
    final_continuation_token: currentToken,
    has_more: hasMore,
    dry_run: dryRun,
    summary,
    // ── Dry-run instrumentation ──
    oauth_success: dryRun ? oauthSuccess : undefined,
    export_endpoint_success: dryRun ? exportEndpointSuccess : undefined,
    export_http_status: dryRun ? exportHttpStatus : undefined,
    page_1_customers: dryRun ? page1Customers : undefined,
    continuation_token_received: dryRun ? continuationTokenReceived : undefined,
    oauth_duration_ms: dryRun ? oauthDurationMs : undefined,
    page_1_fetch_ms: dryRun ? page1FetchMs : undefined,
    estimated_total_runtime_seconds: dryRun ? estimatedTotalRuntimeSeconds : undefined,
    // ── Pending merge stats ──
    pending_merges_created: dryRun ? undefined : (finalMergeStats?.pending_created ?? 0),
    pending_merges_retried: dryRun ? undefined : (finalMergeStats?.pending_retried ?? 0),
    pending_merges_completed: dryRun ? undefined : (finalMergeStats?.pending_completed ?? 0),
    pending_merges_failed: dryRun ? undefined : (finalMergeStats?.pending_failed ?? 0),
    oldest_pending_merge_age_seconds: dryRun ? undefined : (finalMergeStats?.oldest_pending_age_seconds ?? null),
  };
}

// ─── Controlled Import (Limited Batch) ───────────────────────────────────────

export interface ControlledImportResult {
  pages_processed: number;
  total_records: number;
  total_records_on_page: number;
  records_skipped: number;
  created: number;
  updated: number;
  unchanged: number;
  ignored_stale: number;
  merged: number;
  deactivated: number;
  restored: number;
  errors: number;
  contacts_created: number;
  contacts_updated: number;
  contacts_failed: number;
  continuation_token: string;
  api_continuation_token: string;
  continuation_token_advanced: boolean;
  has_more: boolean;
  validation_failures: any[];
  merge_events: any[];
  new_customer_st_ids: string[];
  deferred_merges: number;
  pending_merges_retried: number;
  pending_merges_completed: number;
  pending_merges_failed: number;
  oldest_pending_merge_age_seconds: number | null;
  summary: string;
  execution_time_ms: number;
}

/**
 * Run a controlled import of a limited number of customer records.
 *
 * Fetches page 1 from the export API, processes ONLY the first `limit` records
 * through the standard batch processor (with full audit logging, merge handling,
 * and stale event detection), and syncs contacts for newly created customers.
 *
 * Does NOT advance the continuation token — only a subset of the page is
 * processed, so advancing would skip the remaining records. A future full sync
 * will re-fetch this page; already-processed records will be idempotent.
 */
export async function runControlledImport(
  base44: any,
  cursor: any,
  environment: string,
  tenantId: string,
  lockId: string,
  limit: number = 25
): Promise<ControlledImportResult> {
  const batchId = `CONTROLLED-${Date.now().toString(36)}`;
  const cycleStart = Date.now();

  console.log(`[ST CONTROLLED IMPORT] Starting (limit: ${limit})`);

  // 1. Fetch page 1 from the API
  const pageResult = await fetchCustomerPage(
    environment,
    tenantId,
    cursor.continuation_token || "",
    true
  );

  console.log(
    `[ST CONTROLLED IMPORT] Page 1: ${pageResult.records.length} records, ` +
    `continuationToken=${pageResult.continuationToken ? "yes" : "no"}, ` +
    `hasMore=${pageResult.hasMore}`
  );

  if (pageResult.records.length === 0) {
    return {
      pages_processed: 0, total_records: 0, total_records_on_page: 0, records_skipped: 0,
      created: 0, updated: 0, unchanged: 0, ignored_stale: 0,
      merged: 0, deactivated: 0, restored: 0, errors: 0,
      contacts_created: 0, contacts_updated: 0, contacts_failed: 0,
      continuation_token: cursor.continuation_token || "",
      api_continuation_token: pageResult.continuationToken,
      continuation_token_advanced: false,
      has_more: false,
      validation_failures: [], merge_events: [], new_customer_st_ids: [],
      deferred_merges: 0, pending_merges_retried: 0, pending_merges_completed: 0,
      pending_merges_failed: 0, oldest_pending_merge_age_seconds: null,
      summary: "No records returned from API",
      execution_time_ms: Date.now() - cycleStart,
    };
  }

  // 2. Take only the first `limit` records
  const limitedRecords = pageResult.records.slice(0, limit);
  const totalRecords = limitedRecords.length;

  console.log(
    `[ST CONTROLLED IMPORT] Processing ${totalRecords} of ${pageResult.records.length} ` +
    `(skipping ${pageResult.records.length - totalRecords})`
  );

  // 3. Process through the standard batch processor — preserves all audit
  //    logging, merge handling, and stale event detection.
  const batchResult = await processBatch(
    base44,
    limitedRecords,
    cursor,
    tenantId,
    batchId,
    false // NOT dry run — write customer records normally
  );

  // 4. Sync contacts for newly created customers
  let contactsCreated = 0;
  let contactsUpdated = 0;
  let contactsFailed = 0;

  if (batchResult.newCustomerStIds.length > 0) {
    console.log(
      `[ST CONTROLLED IMPORT] Syncing contacts for ${batchResult.newCustomerStIds.length} new customers`
    );
    try {
      const contactResult = await syncContacts(
        base44,
        batchResult.newCustomerStIds,
        environment,
        tenantId
      );
      contactsCreated = contactResult.created || 0;
      contactsUpdated = contactResult.updated || 0;
      contactsFailed = contactResult.failed || 0;
    } catch (err) {
      console.error("[ST CONTROLLED IMPORT] Contact sync failed:", err);
      contactsFailed = batchResult.newCustomerStIds.length;
    }
  }

  // 5. Extract validation failures, merge events, and deferred merges from batch details
  const validationFailures = batchResult.details
    .filter((d) => d.failed)
    .map((d) => ({
      servicetitan_customer_id: d.servicetitan_customer_id,
      error: d.error,
      summary: d.summary,
    }));

  const mergeEvents = batchResult.details
    .filter((d) => d.action === "merged")
    .map((d) => ({
      servicetitan_customer_id: d.servicetitan_customer_id,
      local_customer_id: d.local_customer_id,
      relinked: d.relinked,
      summary: d.summary,
    }));

  const deferredMerges = batchResult.details.filter((d: any) => d.deferred_merge).length;

  // 6. Retry pending merges — targets from this batch may now exist locally
  let pendingMergeStats: PendingMergeStats = {
    pending_created: 0, pending_retried: 0, pending_completed: 0, pending_failed: 0,
    oldest_pending_age_seconds: null,
  };
  try {
    pendingMergeStats = await retryPendingMerges(base44, tenantId);
    console.log(
      `[ST CONTROLLED IMPORT] Pending merge retry: ` +
      `retried=${pendingMergeStats.pending_retried}, completed=${pendingMergeStats.pending_completed}, ` +
      `failed=${pendingMergeStats.pending_failed}`
    );
  } catch (err) {
    console.error("[ST CONTROLLED IMPORT] Pending merge retry failed:", err);
  }

  // 7. Do NOT advance the continuation token.
  const executionTimeMs = Date.now() - cycleStart;

  const summary =
    `Controlled import: processed ${totalRecords} of ${pageResult.records.length} records on page 1. ` +
    `Created: ${batchResult.created}, Updated: ${batchResult.updated}, Unchanged: ${batchResult.unchanged}, ` +
    `Stale: ${batchResult.ignored_stale}, Merged: ${batchResult.merged}, Deactivated: ${batchResult.deactivated}, ` +
    `Restored: ${batchResult.restored}, Errors: ${batchResult.errors}. ` +
    `Contacts: ${contactsCreated} created, ${contactsUpdated} updated, ${contactsFailed} failed. ` +
    `Deferred merges: ${deferredMerges}. ` +
    `Pending merge retry: ${pendingMergeStats.pending_retried} retried, ${pendingMergeStats.pending_completed} completed, ${pendingMergeStats.pending_failed} failed. ` +
    `Validation failures: ${validationFailures.length}. Merge events: ${mergeEvents.length}. ` +
    `Continuation token NOT advanced (partial page — ${pageResult.records.length - totalRecords} records remain). ` +
    `Execution time: ${executionTimeMs}ms.`;

  console.log(`[ST CONTROLLED IMPORT] Completed: ${summary}`);

  return {
    pages_processed: 1,
    total_records: totalRecords,
    total_records_on_page: pageResult.records.length,
    records_skipped: pageResult.records.length - totalRecords,
    created: batchResult.created,
    updated: batchResult.updated,
    unchanged: batchResult.unchanged,
    ignored_stale: batchResult.ignored_stale,
    merged: batchResult.merged,
    deactivated: batchResult.deactivated,
    restored: batchResult.restored,
    errors: batchResult.errors,
    contacts_created: contactsCreated,
    contacts_updated: contactsUpdated,
    contacts_failed: contactsFailed,
    continuation_token: cursor.continuation_token || "",
    api_continuation_token: pageResult.continuationToken,
    continuation_token_advanced: false,
    has_more: pageResult.hasMore,
    validation_failures: validationFailures,
    merge_events: mergeEvents,
    new_customer_st_ids: batchResult.newCustomerStIds,
    deferred_merges: deferredMerges,
    pending_merges_retried: pendingMergeStats.pending_retried,
    pending_merges_completed: pendingMergeStats.pending_completed,
    pending_merges_failed: pendingMergeStats.pending_failed,
    oldest_pending_merge_age_seconds: pendingMergeStats.oldest_pending_age_seconds,
    summary,
    execution_time_ms: executionTimeMs,
  };
}