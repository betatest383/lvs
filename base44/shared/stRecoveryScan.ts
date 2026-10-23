/**
 * ServiceTitan Recovery Scan — Windowed, Safe Advancement
 *
 * SAFE ADVANCEMENT:
 *   - The scan window starts at (last_scan_at - overlap) and ends at now.
 *   - The cursor (last_new_customer_scan_at) only advances to window_end
 *     if the entire window completes with zero errors.
 *   - The 5-minute overlap protects against clock drift, delayed writes,
 *     and same-timestamp records.
 *   - Records are sorted by createdOn, then ServiceTitan customer ID (stable
 *     secondary ordering).
 *   - If any customer, contact, or required operation fails, the window is
 *     marked failed and the cursor does NOT advance. last_successful_sync_at
 *     is NOT set for a failed window.
 *
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 */

import { apiRequest, retryWithBackoff } from "./stAuth.ts";
import { extractCustomerData, buildSyncUpdateData, findLocalCustomer, mapExportRecord } from "./stCustomerMapping.ts";
import { syncContacts } from "./stCustomerApiSync.ts";
import { getWatermark, incrementWatermarkCounters, RECOVERY_OVERLAP_MINUTES } from "./stWatermark.ts";
import { checkCustomerEligibility, resolveCustomerCreatedOn } from "./stCustomerEligibility.ts";
import { createDeferredCustomer } from "./stDeferredCustomer.ts";

const TRANSACTIONAL_PAGE_SIZE = 50;
const MAX_RECOVERY_PAGES = 100;

// ─── Transactional API Fetch ─────────────────────────────────────────────────

export interface TransactionalCustomerPage {
  records: any[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export async function fetchNewCustomersPage(
  environment: string,
  tenantId: string,
  createdOnOrAfter: string,
  page: number = 1,
  pageSize: number = TRANSACTIONAL_PAGE_SIZE
): Promise<TransactionalCustomerPage> {
  const path = `/crm/v2/tenant/${tenantId}/customers`;
  const params: Record<string, string> = {
    createdOnOrAfter,
    page: String(page),
    pageSize: String(pageSize),
  };

  const result = await retryWithBackoff(async () => {
    return await apiRequest(path, environment, { params });
  });

  const records = result.data || result.customers || (Array.isArray(result) ? result : []);
  const hasMore = result.hasMore ?? result.has_more ?? false;

  return { records, hasMore, page, pageSize };
}

export async function fetchUpdatedCustomersPage(
  environment: string,
  tenantId: string,
  modifiedOnOrAfter: string,
  page: number = 1,
  pageSize: number = TRANSACTIONAL_PAGE_SIZE
): Promise<TransactionalCustomerPage> {
  const path = `/crm/v2/tenant/${tenantId}/customers`;
  const params: Record<string, string> = {
    modifiedOnOrAfter,
    page: String(page),
    pageSize: String(pageSize),
  };

  const result = await retryWithBackoff(async () => {
    return await apiRequest(path, environment, { params });
  });

  const records = result.data || result.customers || (Array.isArray(result) ? result : []);
  const hasMore = result.hasMore ?? result.has_more ?? false;

  return { records, hasMore, page, pageSize };
}

// ─── Recovery Scan Result ────────────────────────────────────────────────────

export interface RecoveryScanResult {
  new_customers_imported: number;
  existing_customers_updated: number;
  contacts_synced: number;
  contacts_failed: number;
  customers_deferred: number;
  skipped_pre_activation: number;
  errors: number;
  pages_processed: number;
  total_records_scanned: number;
  has_more: boolean;
  window_start: string;
  window_end: string;
  cursor_advanced: boolean;
  summary: string;
}

/**
 * Run a windowed recovery scan for new customers created since the last scan.
 */
export async function runRecoveryScan(
  base44: any,
  environment: string,
  tenantId: string,
  watermark: any
): Promise<RecoveryScanResult> {
  if (!watermark || watermark.status !== "active") {
    return emptyRecoveryResult("Watermark not active — recovery scan skipped");
  }

  const activationTs = watermark.activation_timestamp;
  if (!activationTs) {
    return emptyRecoveryResult("Watermark has no activation timestamp — recovery scan skipped");
  }

  // ── Windowed scan setup ──
  const now = new Date();
  const overlapMinutes = watermark.recovery_overlap_minutes || RECOVERY_OVERLAP_MINUTES;
  const lastScanAt = watermark.last_new_customer_scan_at || activationTs;
  const lastScanTime = new Date(lastScanAt);

  // Window start = last scan - overlap (protects against clock drift)
  const windowStart = new Date(lastScanTime.getTime() - overlapMinutes * 60 * 1000);
  const windowEnd = now;

  // For the first scan, use activation timestamp as the start
  const scanSince = watermark.last_new_customer_scan_at
    ? windowStart.toISOString()
    : activationTs;

  let newImported = 0;
  let existingUpdated = 0;
  let contactsSynced = 0;
  let contactsFailed = 0;
  let customersDeferred = 0;
  let skippedPreActivation = 0;
  let errors = 0;
  let pagesProcessed = 0;
  let totalScanned = 0;
  let hasMore = false;

  const newCustomerStIds: string[] = [];

  console.log(`[ST RECOVERY] Scanning for new customers created after ${scanSince} (window: ${windowStart.toISOString()} → ${windowEnd.toISOString()})`);

  // ── Mark window as in-progress ──
  await base44.asServiceRole.entities.CustomerSyncWatermark.update(watermark.id, {
    recovery_window_start: windowStart.toISOString(),
    recovery_window_end: windowEnd.toISOString(),
    recovery_window_status: "in_progress",
    recovery_window_errors: 0,
  });

  for (let page = 1; page <= MAX_RECOVERY_PAGES; page++) {
    try {
      const pageResult = await fetchNewCustomersPage(environment, tenantId, scanSince, page);

      if (pageResult.records.length === 0) {
        hasMore = false;
        break;
      }

      // ── Sort by createdOn, then ST customer ID (stable secondary ordering) ──
      const sortedRecords = [...pageResult.records].sort((a, b) => {
        const aCreated = a.createdOn || a.created_on || "";
        const bCreated = b.createdOn || b.created_on || "";
        if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
        const aId = String(a.id || a.customer_id || "");
        const bId = String(b.id || b.customer_id || "");
        return aId.localeCompare(bId);
      });

      totalScanned += sortedRecords.length;

      for (const record of sortedRecords) {
        try {
          const payload = mapExportRecord(record, tenantId);
          const extracted = extractCustomerData(payload, { object_id: String(record.id || ""), tenant_id: tenantId });

          if (!extracted.servicetitan_customer_id) continue;

          const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

          if (existing) {
            // Customer already exists locally — apply update
            const updateData = buildSyncUpdateData(extracted, "api_recovery_update", "api");
            updateData.servicetitan_sync_version = (existing.servicetitan_sync_version || 0) + 1;
            updateData.contact_sync_status = "complete"; // Recovery update doesn't change contacts

            const nonEmpty: Record<string, any> = {};
            for (const [k, v] of Object.entries(updateData)) {
              if (k.startsWith("servicetitan_") || k === "contact_sync_status" || (v !== null && v !== undefined && String(v).trim())) {
                nonEmpty[k] = v;
              }
            }

            await base44.asServiceRole.entities.Customer.update(existing.id, nonEmpty);
            existingUpdated++;
          } else {
            // New customer — check eligibility against watermark
            const createdOn = record.createdOn || record.created_on || record.created_at || "";
            const eligibility = await checkCustomerEligibility(
              base44, tenantId, environment,
              extracted.servicetitan_customer_id, createdOn
            );

            if (!eligibility.allowed) {
              if (eligibility.reason === "pre_activation") {
                skippedPreActivation++;
              } else if (eligibility.reason === "deferred_missing_created_on") {
                const resolvedCreatedOn = await resolveCustomerCreatedOn(environment, tenantId, extracted.servicetitan_customer_id);
                if (!resolvedCreatedOn) {
                  await createDeferredCustomer(
                    base44, extracted.servicetitan_customer_id,
                    "missing_created_on", "recovery_scan",
                    tenantId, environment, undefined, record
                  );
                  customersDeferred++;
                } else {
                  const reEligibility = await checkCustomerEligibility(
                    base44, tenantId, environment,
                    extracted.servicetitan_customer_id, resolvedCreatedOn
                  );
                  if (reEligibility.allowed) {
                    if (!extracted.name) {
                      await createDeferredCustomer(
                        base44, extracted.servicetitan_customer_id,
                        "missing_name", "recovery_scan",
                        tenantId, environment, undefined, record
                      );
                      customersDeferred++;
                    } else {
                      const createData = buildSyncUpdateData(extracted, "api_recovery_created", "api");
                      createData.servicetitan_sync_version = 1;
                      createData.import_source = "api_recovery";
                      createData.imported_at = new Date().toISOString();
                      createData.contact_sync_status = "pending";
                      await base44.asServiceRole.entities.Customer.create(createData);
                      newImported++;
                      newCustomerStIds.push(extracted.servicetitan_customer_id);
                    }
                  } else if (reEligibility.reason === "pre_activation") {
                    skippedPreActivation++;
                  } else {
                    customersDeferred++;
                  }
                }
              } else {
                await createDeferredCustomer(
                  base44, extracted.servicetitan_customer_id,
                  "watermark_error", "recovery_scan",
                  tenantId, environment, undefined, record,
                  eligibility.message
                );
                customersDeferred++;
              }
              continue;
            }

            if (!extracted.name) {
              await createDeferredCustomer(
                base44, extracted.servicetitan_customer_id,
                "missing_name", "recovery_scan",
                tenantId, environment, undefined, record
              );
              customersDeferred++;
              continue;
            }

            const createData = buildSyncUpdateData(extracted, "api_recovery_created", "api");
            createData.servicetitan_sync_version = 1;
            createData.import_source = "api_recovery";
            createData.imported_at = new Date().toISOString();
            createData.contact_sync_status = "pending";
            await base44.asServiceRole.entities.Customer.create(createData);
            newImported++;
            newCustomerStIds.push(extracted.servicetitan_customer_id);
          }
        } catch (err: any) {
          console.error("[ST RECOVERY] Record error:", err.message);
          errors++;
        }
      }

      pagesProcessed++;
      hasMore = pageResult.hasMore;
      if (!hasMore) break;
    } catch (err: any) {
      console.error(`[ST RECOVERY] Page ${page} failed:`, err.message);
      errors++;
      hasMore = true;
      break;
    }
  }

  // ── Contact sync for newly imported customers ──
  if (newCustomerStIds.length > 0) {
    try {
      const contactResult = await syncContacts(base44, newCustomerStIds, environment, tenantId);
      contactsSynced = contactResult.synced || 0;
      contactsFailed = contactResult.failed || 0;

      // If contact sync failed, mark as window error
      if (contactsFailed > 0) {
        errors += 1; // Contact failures count as window errors
      }
    } catch (err: any) {
      console.error("[ST RECOVERY] Contact sync failed:", err.message);
      contactsFailed = newCustomerStIds.length;
      errors += 1;
    }
  }

  // ── SAFE CURSOR ADVANCEMENT ──
  // Only advance the cursor if the entire window completed with zero errors.
  // Do NOT set last_successful_sync_at for a failed window.
  const cursorAdvanced = errors === 0;
  const nowIso = now.toISOString();

  if (cursorAdvanced) {
    await base44.asServiceRole.entities.CustomerSyncWatermark.update(watermark.id, {
      last_new_customer_scan_at: windowEnd.toISOString(),
      last_successful_sync_at: nowIso,
      recovery_window_status: "completed",
      recovery_window_errors: 0,
      recovery_events_processed: (watermark.recovery_events_processed || 0) + newImported + existingUpdated,
      customers_imported_since_activation: (watermark.customers_imported_since_activation || 0) + newImported,
    });
  } else {
    // DO NOT advance the cursor — retry from the same window next time
    // DO NOT set last_successful_sync_at for a failed window
    await base44.asServiceRole.entities.CustomerSyncWatermark.update(watermark.id, {
      recovery_window_status: "failed",
      recovery_window_errors: errors,
    });
  }

  const summary =
    `Recovery scan: ${pagesProcessed} pages, ${totalScanned} records scanned. ` +
    `New customers imported: ${newImported}. ` +
    `Existing customers updated: ${existingUpdated}. ` +
    `Contacts: ${contactsSynced} synced, ${contactsFailed} failed. ` +
    `Customers deferred: ${customersDeferred}. ` +
    `Skipped (pre-activation): ${skippedPreActivation}. ` +
    `Errors: ${errors}. Cursor advanced: ${cursorAdvanced}.`;

  console.log(`[ST RECOVERY] ${summary}`);

  return {
    new_customers_imported: newImported,
    existing_customers_updated: existingUpdated,
    contacts_synced: contactsSynced,
    contacts_failed: contactsFailed,
    customers_deferred: customersDeferred,
    skipped_pre_activation: skippedPreActivation,
    errors,
    pages_processed: pagesProcessed,
    total_records_scanned: totalScanned,
    has_more: hasMore,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    cursor_advanced: cursorAdvanced,
    summary,
  };
}

function emptyRecoveryResult(message: string): RecoveryScanResult {
  return {
    new_customers_imported: 0, existing_customers_updated: 0,
    contacts_synced: 0, contacts_failed: 0, customers_deferred: 0,
    skipped_pre_activation: 0, errors: 0, pages_processed: 0,
    total_records_scanned: 0, has_more: false,
    window_start: "", window_end: "", cursor_advanced: false,
    summary: message,
  };
}