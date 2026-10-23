/**
 * ServiceTitan Customer API Export Handlers
 *
 * Upserts individual customer records from the CRM v2 export API.
 * Reuses the SAME shared helpers as the webhook sync functions — no
 * duplicate business logic.
 *
 * Sets servicetitan_source = "api" and writes timeline entries with
 * source = "servicetitan_api_export" to distinguish from webhook deliveries.
 *
 * Idempotency:
 *   - Searches by servicetitan_customer_id (same as webhook)
 *   - Stale modifiedOn is ignored (same ordering protection)
 *   - No-op when no fields changed
 *   - Repeated batches with identical records produce no duplicates
 *
 * Failure Reporting:
 *   The `failed` flag on ApiSyncResult distinguishes unexpected errors
 *   (database exceptions, API failures) from intentional classifications
 *   (unchanged, ignored_stale, merged, etc.). The sync cycle uses this
 *   flag to prevent advancing the continuation token on failure.
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import {
  type ExtractedCustomerData,
  extractCustomerData,
  buildSyncUpdateData,
  findLocalCustomer,
  isStaleEvent,
  mapExportRecord,
} from "./stCustomerMapping.ts";
import {
  ST_CONTROLLED_FIELDS,
  detectChangedFields,
  appendConflictHistory,
} from "./stCustomerConflict.ts";
import { relinkCustomerRecords } from "./stCustomerMerge.ts";
import { createPendingMerge } from "./stCustomerPendingMerge.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApiSyncOptions {
  tenantId: string;
  batchId: string;
  cursorId: string;
  continuationToken: string;
  dryRun?: boolean;
}

export interface ApiSyncResult {
  action: "created" | "updated" | "merged" | "deactivated" | "restored" | "ignored_stale" | "unchanged";
  servicetitan_customer_id: string;
  local_customer_id?: string;
  modifiedOn?: string;
  changed_fields?: string[];
  conflict_detected?: boolean;
  relinked?: { appointments: number; jobs: number; invoices: number };
  summary: string;
  /**
   * True when an unexpected error occurred (database exception, API failure).
   * Distinguishes real failures from intentional "unchanged" classifications.
   * The sync cycle checks this to prevent advancing the continuation token.
   */
  failed?: boolean;
  error?: string;
  /**
   * True when a merge was deferred to a pending merge record because the
   * target customer hasn't been synced locally yet. NOT a failure — the
   * page should continue and the continuation token should advance.
   */
  deferred_merge?: boolean;
}

// ─── Public Upsert Function ──────────────────────────────────────────────────

/**
 * Upsert a single ServiceTitan customer from the CRM v2 export API.
 *
 * Reuses the SAME shared helpers as the webhook sync functions:
 *   extractCustomerData, findLocalCustomer, isStaleEvent,
 *   detectChangedFields, appendConflictHistory, buildSyncUpdateData,
 *   relinkCustomerRecords
 */
export async function upsertCustomerFromApiExport(
  base44: any,
  record: any,
  options: ApiSyncOptions
): Promise<ApiSyncResult> {
  const stCustomerId = String(record.id || record.customer_id || "");
  if (!stCustomerId) {
    return { action: "unchanged", servicetitan_customer_id: "", summary: "No customer ID in export record" };
  }

  const timelineId = `api-export-${options.batchId}`;
  const modifiedOn = record.modifiedOn || record.modified_on || record.updated_at || "";
  const active = record.active !== false;
  const mergedToId = record.mergedToId ? String(record.mergedToId) : "";

  const payload = mapExportRecord(record, options.tenantId);
  const extracted = extractCustomerData(payload, { object_id: stCustomerId, tenant_id: options.tenantId });

  if (!extracted.servicetitan_customer_id) {
    return { action: "unchanged", servicetitan_customer_id: "", summary: "No customer ID extracted" };
  }

  const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

  // ── Merge: mergedToId is set ──
  if (mergedToId && mergedToId !== stCustomerId) {
    // P2: Dry run must not write — report what would happen
    if (options.dryRun) {
      return { action: "merged", servicetitan_customer_id: stCustomerId, local_customer_id: existing?.id, modifiedOn, summary: `[DRY RUN] Would merge customer '${stCustomerId}' into '${mergedToId}'` };
    }
    return handleApiMerge(base44, stCustomerId, mergedToId, existing, options, timelineId, modifiedOn);
  }

  // ── Deactivation: active=false and customer exists ──
  if (!active && existing) {
    if (existing.servicetitan_deleted === true) {
      return { action: "unchanged", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: "Already deactivated" };
    }
    if (existing.servicetitan_sync_status === "merged") {
      return { action: "unchanged", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: "Customer was merged — deactivation ignored" };
    }
    if (options.dryRun) {
      return { action: "deactivated", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: "[DRY RUN] Would deactivate customer" };
    }
    return handleApiDeactivation(base44, existing, extracted, options, timelineId, modifiedOn);
  }

  // ── Restore: active=true but customer was soft-deleted ──
  if (active && existing && existing.servicetitan_deleted === true) {
    if (options.dryRun) {
      return { action: "restored", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: "[DRY RUN] Would restore customer" };
    }
    return handleApiRestore(base44, existing, extracted, options, timelineId, modifiedOn);
  }

  // ── Create: customer not found and is active ──
  if (!existing) {
    if (!active) {
      return { action: "unchanged", servicetitan_customer_id: stCustomerId, modifiedOn, summary: "Inactive customer not in local system — skipped" };
    }
    if (!extracted.name) {
      return { action: "unchanged", servicetitan_customer_id: stCustomerId, modifiedOn, summary: "Missing name — skipped" };
    }
    if (options.dryRun) {
      return { action: "created", servicetitan_customer_id: stCustomerId, modifiedOn, summary: "[DRY RUN] Would create customer" };
    }
    return handleApiCreate(base44, extracted, options, timelineId, modifiedOn);
  }

  // ── Update: customer exists and is active ──

  // Skip merged customers
  if (existing.servicetitan_sync_status === "merged") {
    return { action: "unchanged", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: "Customer was merged — update ignored" };
  }

  // Stale check: ignore records older than last event
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    // P2: Dry run must not write timeline entries
    if (!options.dryRun) {
      await addTimelineEntry(
        base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
        `Stale API export record ignored: modifiedOn '${modifiedOn}' older than last event_at '${existing.servicetitan_last_event_at}'`,
        "warning", undefined,
        {
          sync_action: "ignored_stale", source: "servicetitan_api_export",
          servicetitan_customer_id: stCustomerId, local_customer_id: existing.id,
          incoming_modified_on: modifiedOn, existing_event_at: existing.servicetitan_last_event_at,
          cursor_id: options.cursorId, batch_id: options.batchId,
        }
      );
    }
    return { action: "ignored_stale", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, summary: options.dryRun ? "[DRY RUN] Stale record — would ignore" : "Stale record ignored" };
  }

  // Build update data with source="api"
  const updateData = buildSyncUpdateData(extracted, "customer_updated", "api");

  // Filter out empty incoming values
  const nonEmptyUpdateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (
      key === "servicetitan_last_sync" || key === "servicetitan_last_event_type" ||
      key === "servicetitan_last_event_at" || key === "servicetitan_source" ||
      key === "servicetitan_sync_status"
    ) {
      nonEmptyUpdateData[key] = value;
      continue;
    }
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      nonEmptyUpdateData[key] = value;
    }
  }

  nonEmptyUpdateData.servicetitan_sync_version = (existing.servicetitan_sync_version || 0) + 1;

  const changedFields = detectChangedFields(existing, nonEmptyUpdateData, ST_CONTROLLED_FIELDS);

  if (changedFields.length === 0) {
    // Idempotency: no changes
    // P2: Dry run must not update customers, timestamps, or write timeline entries
    if (!options.dryRun) {
      try {
        await base44.asServiceRole.entities.Customer.update(existing.id, {
          servicetitan_last_sync: new Date().toISOString(),
          servicetitan_last_event_type: "api_export_unchanged",
        });
      } catch { /* best-effort — non-fatal for unchanged tracking */ }

      await addTimelineEntry(
        base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
        `No changes required for customer '${stCustomerId}' (API export)`,
        "info", undefined,
        {
          sync_action: "unchanged", source: "servicetitan_api_export",
          servicetitan_customer_id: stCustomerId, local_customer_id: existing.id,
          cursor_id: options.cursorId, batch_id: options.batchId,
        }
      );
    }

    return { action: "unchanged", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, changed_fields: [], summary: options.dryRun ? "[DRY RUN] No changes required" : "No changes required" };
  }

  if (options.dryRun) {
    return { action: "updated", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id, modifiedOn, changed_fields: changedFields, summary: "[DRY RUN] Would update customer" };
  }

  // Record conflict history
  const conflictHistory = appendConflictHistory(existing, nonEmptyUpdateData, changedFields, { id: timelineId, event_type: "api_export_updated" });
  if (conflictHistory) {
    nonEmptyUpdateData.sync_conflict_history_json = conflictHistory;
    nonEmptyUpdateData.servicetitan_sync_status = "conflict";
  }

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, nonEmptyUpdateData);

    await addTimelineEntry(
      base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
      `Customer updated (${existing.id}) from API export for ST customer '${stCustomerId}'`,
      "success", undefined,
      {
        sync_action: "updated", source: "servicetitan_api_export",
        servicetitan_customer_id: stCustomerId, local_customer_id: existing.id,
        changed_fields: changedFields, conflict_detected: !!conflictHistory,
        modified_on: modifiedOn, cursor_id: options.cursorId, batch_id: options.batchId,
      }
    );

    return {
      action: "updated", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id,
      modifiedOn, changed_fields: changedFields, conflict_detected: !!conflictHistory,
      summary: `Customer '${stCustomerId}' updated from API export`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Mark as failed so the sync cycle does NOT advance the continuation token
    return {
      action: "unchanged", servicetitan_customer_id: stCustomerId, local_customer_id: existing.id,
      modifiedOn, failed: true, error: errorMsg,
      summary: `Update failed: ${errorMsg}`,
    };
  }
}

// ─── API Export Internal Handlers ─────────────────────────────────────────────

async function handleApiCreate(
  base44: any,
  extracted: ExtractedCustomerData,
  options: ApiSyncOptions,
  timelineId: string,
  modifiedOn: string
): Promise<ApiSyncResult> {
  const updateData = buildSyncUpdateData(extracted, "api_export_created", "api");
  updateData.servicetitan_sync_version = 1;

  try {
    const created = await base44.asServiceRole.entities.Customer.create(updateData);

    await addTimelineEntry(
      base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
      `Local customer created (${created.id}) from API export for ST customer '${extracted.servicetitan_customer_id}'`,
      "success", undefined,
      {
        sync_action: "created", source: "servicetitan_api_export",
        local_customer_id: created.id, servicetitan_customer_id: extracted.servicetitan_customer_id,
        customer_name: extracted.name, modified_on: modifiedOn,
        cursor_id: options.cursorId, batch_id: options.batchId,
      }
    );

    return {
      action: "created", servicetitan_customer_id: extracted.servicetitan_customer_id,
      local_customer_id: created.id, modifiedOn,
      summary: `Customer '${extracted.name}' (${extracted.servicetitan_customer_id}) created from API export`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      action: "unchanged", servicetitan_customer_id: extracted.servicetitan_customer_id, modifiedOn,
      failed: true, error: errorMsg,
      summary: `Create failed: ${errorMsg}`,
    };
  }
}

async function handleApiDeactivation(
  base44: any,
  existing: any,
  extracted: ExtractedCustomerData,
  options: ApiSyncOptions,
  timelineId: string,
  modifiedOn: string
): Promise<ApiSyncResult> {
  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: true,
    servicetitan_deleted_at: now,
    servicetitan_sync_status: "deleted",
    status: "inactive",
    servicetitan_last_sync: now,
    servicetitan_last_event_type: "api_export_deactivated",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || modifiedOn || now,
    servicetitan_source: "api",
  };

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, updateData);

    await addTimelineEntry(
      base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
      `Customer deactivated (${existing.id}) from API export for ST customer '${extracted.servicetitan_customer_id}'`,
      "warning", undefined,
      {
        sync_action: "deactivated", source: "servicetitan_api_export",
        local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id,
        modified_on: modifiedOn, cursor_id: options.cursorId, batch_id: options.batchId,
      }
    );

    return {
      action: "deactivated", servicetitan_customer_id: extracted.servicetitan_customer_id,
      local_customer_id: existing.id, modifiedOn,
      summary: `Customer '${extracted.servicetitan_customer_id}' deactivated from API export`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      action: "unchanged", servicetitan_customer_id: extracted.servicetitan_customer_id,
      local_customer_id: existing.id, modifiedOn,
      failed: true, error: errorMsg,
      summary: `Deactivation failed: ${errorMsg}`,
    };
  }
}

async function handleApiRestore(
  base44: any,
  existing: any,
  extracted: ExtractedCustomerData,
  options: ApiSyncOptions,
  timelineId: string,
  modifiedOn: string
): Promise<ApiSyncResult> {
  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: false,
    servicetitan_deleted_at: null,
    servicetitan_sync_status: "synced",
    status: "active",
    servicetitan_last_sync: now,
    servicetitan_last_event_type: "api_export_restored",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || modifiedOn || now,
    servicetitan_source: "api",
  };

  if (extracted.name) updateData.name = extracted.name;
  if (extracted.email) updateData.email = extracted.email;
  if (extracted.phone) updateData.phone = extracted.phone;
  if (extracted.address) updateData.address = extracted.address;

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, updateData);

    await addTimelineEntry(
      base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
      `Customer restored (${existing.id}) from API export for ST customer '${extracted.servicetitan_customer_id}'`,
      "success", undefined,
      {
        sync_action: "restored", source: "servicetitan_api_export",
        local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id,
        modified_on: modifiedOn, cursor_id: options.cursorId, batch_id: options.batchId,
      }
    );

    return {
      action: "restored", servicetitan_customer_id: extracted.servicetitan_customer_id,
      local_customer_id: existing.id, modifiedOn,
      summary: `Customer '${extracted.servicetitan_customer_id}' restored from API export`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      action: "unchanged", servicetitan_customer_id: extracted.servicetitan_customer_id,
      local_customer_id: existing.id, modifiedOn,
      failed: true, error: errorMsg,
      summary: `Restore failed: ${errorMsg}`,
    };
  }
}

async function handleApiMerge(
  base44: any,
  sourceStId: string,
  targetStId: string,
  sourceCustomer: any | null,
  options: ApiSyncOptions,
  timelineId: string,
  modifiedOn: string
): Promise<ApiSyncResult> {
  // Find or create target customer
  let targetCustomer = await findLocalCustomer(base44, targetStId);

  if (!targetCustomer) {
    // Target customer hasn't been synced yet. Instead of blocking the page,
    // create a durable pending merge record that will be retried after
    // subsequent pages and at the end of the sync cycle.
    console.log(
      `[ST API SYNC] Merge: target customer '${targetStId}' not found locally. ` +
      `Deferring to pending merge. Page will continue.`
    );
    const { created } = await createPendingMerge(
      base44,
      sourceStId,
      targetStId,
      sourceCustomer?.id || null,
      options.tenantId,
      options.batchId,
      "api_export"
    );
    return {
      action: "unchanged",
      servicetitan_customer_id: sourceStId,
      local_customer_id: sourceCustomer?.id,
      modifiedOn,
      deferred_merge: true,
      summary: created
        ? `Merge deferred — target '${targetStId}' not yet synced. Pending merge created.`
        : `Merge deferred — target '${targetStId}' not yet synced. Pending merge already exists.`,
    };
  }

  // If source doesn't exist locally, nothing to relink
  if (!sourceCustomer) {
    return {
      action: "unchanged", servicetitan_customer_id: sourceStId, modifiedOn,
      summary: `Merge: source '${sourceStId}' not found locally — nothing to relink`,
    };
  }

  // Skip if already merged
  if (sourceCustomer.servicetitan_sync_status === "merged") {
    return {
      action: "unchanged", servicetitan_customer_id: sourceStId, local_customer_id: sourceCustomer.id,
      modifiedOn, summary: "Source customer already merged",
    };
  }

  // Relink all records from source to target
  const relinkResult = await relinkCustomerRecords(base44, sourceCustomer.id, targetCustomer);

  // Mark source as merged
  const now = new Date().toISOString();
  let mergeHistory: any[] = [];
  try {
    mergeHistory = sourceCustomer.servicetitan_merge_history_json
      ? JSON.parse(sourceCustomer.servicetitan_merge_history_json)
      : [];
  } catch { mergeHistory = []; }

  mergeHistory.push({
    webhook_event_id: timelineId,
    event_type: "api_export_merged",
    source_customer_id: sourceStId,
    target_customer_id: targetStId,
    merged_at: now,
    relinked_counts: relinkResult,
  });

  try {
    await base44.asServiceRole.entities.Customer.update(sourceCustomer.id, {
      servicetitan_sync_status: "merged",
      servicetitan_merged_into: targetStId,
      servicetitan_merged_at: now,
      servicetitan_last_sync: now,
      servicetitan_last_event_type: "api_export_merged",
      servicetitan_last_event_at: modifiedOn || now,
      servicetitan_source: "api",
      servicetitan_merge_history_json: JSON.stringify(mergeHistory),
    });

    await addTimelineEntry(
      base44, timelineId, TIMELINE_STAGES.HANDLER_FINISHED,
      `Customer merged from API export: '${sourceStId}' → '${targetStId}'. Relinked ${relinkResult.appointments} appts, ${relinkResult.jobs} jobs, ${relinkResult.invoices} invoices.`,
      "success", undefined,
      {
        sync_action: "merged", source: "servicetitan_api_export",
        source_customer_id: sourceStId, target_customer_id: targetStId,
        local_source_id: sourceCustomer.id, local_target_id: targetCustomer.id,
        relinked: relinkResult, modified_on: modifiedOn,
        cursor_id: options.cursorId, batch_id: options.batchId,
      }
    );

    return {
      action: "merged", servicetitan_customer_id: sourceStId,
      local_customer_id: sourceCustomer.id, modifiedOn, relinked: relinkResult,
      summary: `Customer '${sourceStId}' merged into '${targetStId}' from API export`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      action: "unchanged", servicetitan_customer_id: sourceStId,
      local_customer_id: sourceCustomer.id, modifiedOn,
      failed: true, error: errorMsg,
      summary: `Merge failed: ${errorMsg}`,
    };
  }
}