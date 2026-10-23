/**
 * ServiceTitan Customer Webhook Sync Handlers (v2 — SAFETY-CORRECTED)
 *
 * SAFETY PROPERTIES:
 *   1. FAIL CLOSED on watermark errors — never falls back to historical behavior.
 *      If the watermark cannot be loaded, the customer is NOT created, the event
 *      remains retryable, and an admin alert is logged.
 *   2. Unknown createdOn is resolved by fetching the customer by ID from the API.
 *      If createdOn still cannot be determined, a DeferredCustomer record is created.
 *   3. Granular webhook counters: creates, updates, skipped, deferred, failed, duplicates.
 *   4. No event is counted as "completed" before its operation succeeds.
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import {
  type ExtractedCustomerData,
  extractCustomerData,
  buildSyncUpdateData,
  findLocalCustomer,
  isStaleEvent,
  getString,
  extractedEventAt,
} from "./stCustomerMapping.ts";
import {
  ST_CONTROLLED_FIELDS,
  detectChangedFields,
  appendConflictHistory,
} from "./stCustomerConflict.ts";
import { relinkCustomerRecords } from "./stCustomerMerge.ts";
import {
  getWatermark,
  checkCustomerEligibility,
  incrementWatermarkCounters,
  resolveCustomerCreatedOn,
  createDeferredCustomer,
  resolveDeferredCustomer,
  createContactSyncRetry,
  type WatermarkCheckResult,
} from "./stCustomerSyncStrategy.ts";
import { syncContacts } from "./stCustomerApiSync.ts";
import { getTenantId, getEnvironment } from "./stAuth.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncContext {
  base44: any;
  payload: any;
  event: any;
  action: string;
}

export interface SyncResult {
  success: boolean;
  summary: string;
  warnings?: string[];
  metadata?: Record<string, any>;
  error?: string;
  retryable?: boolean;
  finalStatus?: "processed" | "ignored";
}

// ─── Public Sync Functions ────────────────────────────────────────────────────

/**
 * syncCustomerCreated — Handle customer_created event.
 *
 * FAIL CLOSED: If the watermark cannot be loaded or validated, the customer is
 * NOT created. The event remains retryable (success=false, retryable=true) and
 * an admin alert is logged with tenant, environment, event ID, and ST customer ID.
 */
export async function syncCustomerCreated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractCustomerData(payload, event);

  if (!extracted.servicetitan_customer_id) {
    return {
      success: false,
      summary: "Customer payload is missing customer ID",
      error: "servicetitan_customer_id is required",
      retryable: false,
    };
  }

  if (!extracted.name) {
    return {
      success: false,
      summary: "Customer payload is missing name",
      error: "name is required for customer creation",
      retryable: false,
    };
  }

  const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

  if (existing) {
    // Idempotency: already exists, treat as update
    return syncCustomerUpdated(ctx);
  }

  // ── Watermark eligibility check (FAIL CLOSED) ──
  const tenantId = extracted.servicetitan_tenant_id || getTenantId();
  const environment = getEnvironment();

  const customerCreatedOn = getString(payload, "createdOn", "created_on", "created_at");

  const eligibility = await checkCustomerEligibility(
    base44, tenantId, environment,
    extracted.servicetitan_customer_id, customerCreatedOn || null
  );

  let watermark: any | null = null;
  try {
    watermark = await getWatermark(base44, tenantId, environment);
  } catch (err: any) {
    // FAIL CLOSED: watermark database error — do not create
    console.error("[ST CUST SYNC] FAIL CLOSED — watermark load error:", err.message);
    await logWatermarkAlert(base44, event, extracted.servicetitan_customer_id, tenantId, environment, err.message);
    return {
      success: false,
      summary: `Customer creation blocked — watermark load failed: ${err.message}`,
      error: `Watermark error (FAIL CLOSED): ${err.message}`,
      retryable: true,
    };
  }

  if (!eligibility.allowed) {
    if (eligibility.reason === "pre_activation") {
      // Skip — customer predates activation watermark
      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_events_skipped_pre_activation: 1,
          webhook_events_processed: 1,
        });
      }

      await addTimelineEntry(
        base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Customer creation skipped — customer '${extracted.servicetitan_customer_id}' predates activation watermark (${eligibility.activation_timestamp})`,
        "info", undefined,
        {
          sync_action: "ignored_pre_activation",
          servicetitan_customer_id: extracted.servicetitan_customer_id,
          activation_timestamp: eligibility.activation_timestamp,
          customer_created_on: eligibility.customer_created_on,
        }
      );

      return {
        success: true,
        summary: `Customer '${extracted.servicetitan_customer_id}' skipped — predates activation watermark`,
        metadata: {
          sync_action: "ignored_pre_activation",
          servicetitan_customer_id: extracted.servicetitan_customer_id,
          reason: "pre_activation",
        },
        finalStatus: "ignored",
      };
    }

    if (eligibility.reason === "deferred_missing_created_on") {
      // ── Resolve createdOn by fetching the customer from the API ──
      const resolvedCreatedOn = await resolveCustomerCreatedOn(environment, tenantId, extracted.servicetitan_customer_id);

      if (!resolvedCreatedOn) {
        // Cannot determine createdOn — create a durable deferred record
        await createDeferredCustomer(
          base44,
          extracted.servicetitan_customer_id,
          "missing_created_on",
          "webhook_created",
          tenantId,
          environment,
          event?.id,
          payload
        );

        if (watermark) {
          await incrementWatermarkCounters(base44, watermark.id, {
            webhook_events_deferred: 1,
            webhook_events_processed: 1,
          });
        }

        await addTimelineEntry(
          base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
          `Customer '${extracted.servicetitan_customer_id}' deferred — createdOn could not be determined from payload or API`,
          "warning", undefined,
          {
            sync_action: "deferred_missing_created_on",
            servicetitan_customer_id: extracted.servicetitan_customer_id,
          }
        );

        return {
          success: true,
          summary: `Customer '${extracted.servicetitan_customer_id}' deferred — createdOn unknown`,
          metadata: {
            sync_action: "deferred_missing_created_on",
            servicetitan_customer_id: extracted.servicetitan_customer_id,
          },
          finalStatus: "ignored",
        };
      }

      // Re-check eligibility with resolved createdOn
      const reEligibility = await checkCustomerEligibility(
        base44, tenantId, environment,
        extracted.servicetitan_customer_id, resolvedCreatedOn
      );

      if (!reEligibility.allowed) {
        if (reEligibility.reason === "pre_activation") {
          if (watermark) {
            await incrementWatermarkCounters(base44, watermark.id, {
              webhook_events_skipped_pre_activation: 1,
              webhook_events_processed: 1,
            });
          }

          return {
            success: true,
            summary: `Customer '${extracted.servicetitan_customer_id}' skipped — predates activation (resolved createdOn)`,
            metadata: {
              sync_action: "ignored_pre_activation",
              servicetitan_customer_id: extracted.servicetitan_customer_id,
              resolved_created_on: resolvedCreatedOn,
            },
            finalStatus: "ignored",
          };
        }

        // watermark_error or other — fail closed
        if (watermark) {
          await incrementWatermarkCounters(base44, watermark.id, {
            webhook_events_failed: 1,
            webhook_events_processed: 1,
          });
        }

        return {
          success: false,
          summary: `Customer creation blocked — eligibility check failed: ${reEligibility.message}`,
          error: reEligibility.message,
          retryable: true,
        };
      }

      // Eligibility passed with resolved createdOn — proceed to creation
    }

    if (eligibility.reason === "watermark_error") {
      // FAIL CLOSED: watermark validation error
      await logWatermarkAlert(base44, event, extracted.servicetitan_customer_id, tenantId, environment, eligibility.message);

      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_events_failed: 1,
          webhook_events_processed: 1,
        });
      }

      return {
        success: false,
        summary: `Customer creation blocked — watermark error: ${eligibility.message}`,
        error: eligibility.message,
        retryable: true,
      };
    }
  }

  // ── Create the customer ──
  const updateData = buildSyncUpdateData(extracted, event?.event_type || "customer_created");
  updateData.servicetitan_sync_version = 1;
  updateData.import_source = "webhook";
  updateData.imported_at = new Date().toISOString();
  updateData.contact_sync_status = "pending";

  try {
    const created = await base44.asServiceRole.entities.Customer.create(updateData);

    // Resolve any pending deferred records for this customer
    await resolveDeferredCustomer(base44, extracted.servicetitan_customer_id, created.id);

    // Increment webhook_creates_completed (only after success)
    if (watermark) {
      await incrementWatermarkCounters(base44, watermark.id, {
        webhook_creates_completed: 1,
        webhook_events_processed: 1,
        customers_imported_since_activation: 1,
      });
    }

    // ── Supplementary contact sync ──
    // Contacts are supplementary — failure does NOT delete the customer, but
    // marks contact_sync_status and creates a retry record.
    let contactsSynced = 0;
    let contactsFailed = 0;
    let contactSyncStatus = "complete";
    try {
      const contactResult = await syncContacts(base44, [extracted.servicetitan_customer_id], environment, tenantId);
      contactsSynced = contactResult.synced || 0;
      contactsFailed = contactResult.failed || 0;
      if (contactsFailed > 0 && contactsSynced > 0) {
        contactSyncStatus = "partial";
      } else if (contactsFailed > 0) {
        contactSyncStatus = "failed";
      }
    } catch (contactErr: any) {
      console.error(`[ST CUST SYNC] Contact sync failed for '${extracted.servicetitan_customer_id}':`, contactErr.message);
      contactsFailed = 1;
      contactSyncStatus = "failed";
    }

    // Update customer with contact_sync_status
    if (contactSyncStatus !== "complete" || contactsSynced > 0) {
      try {
        await base44.asServiceRole.entities.Customer.update(created.id, {
          contact_sync_status: contactSyncStatus,
          contact_last_synced_at: contactsFailed > 0 ? undefined : new Date().toISOString(),
          contact_sync_attempt_count: 1,
        });
      } catch { /* non-fatal */ }
    }

    // Create contact retry record if needed
    if (contactsFailed > 0) {
      await createContactSyncRetry(
        base44, extracted.servicetitan_customer_id, created.id,
        tenantId, environment, "webhook",
        `Contact sync failed during webhook creation: ${contactsFailed} contact(s) failed`
      );
    }

    await addTimelineEntry(
      base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Local customer created (${created.id}) for ST customer '${extracted.servicetitan_customer_id}'. Contacts: ${contactsSynced} synced, ${contactsFailed} failed. Status: ${contactSyncStatus}.`,
      contactsFailed > 0 ? "warning" : "success", undefined,
      {
        sync_action: "created",
        local_customer_id: created.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        customer_name: extracted.name,
        contacts_synced: contactsSynced,
        contacts_failed: contactsFailed,
        contact_sync_status: contactSyncStatus,
      }
    );

    return {
      success: true,
      summary: `Customer '${extracted.name}' (${extracted.servicetitan_customer_id}) created. Contacts: ${contactsSynced} synced, ${contactsFailed} failed.`,
      metadata: {
        sync_action: "created",
        local_customer_id: created.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        contacts_synced: contactsSynced,
        contacts_failed: contactsFailed,
        contact_sync_status: contactSyncStatus,
        changed_fields: Object.keys(updateData).filter(
          (k) =>
            !k.startsWith("servicetitan_last") &&
            k !== "servicetitan_source" &&
            k !== "servicetitan_sync_status" &&
            k !== "contact_sync_status"
        ),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (watermark) {
      await incrementWatermarkCounters(base44, watermark.id, {
        webhook_events_failed: 1,
        webhook_events_processed: 1,
      });
    }

    return {
      success: false,
      summary: "Customer creation failed",
      error: `Database create failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

/**
 * syncCustomerUpdated — Handle customer_updated event.
 *
 * FAIL CLOSED: In new-customers-only mode, if the customer is not found locally,
 * the update is skipped (NOT created from an update webhook). The customer will
 * be hydrated on demand when a job/appointment references it.
 */
export async function syncCustomerUpdated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractCustomerData(payload, event);

  if (!extracted.servicetitan_customer_id) {
    return {
      success: false,
      summary: "Customer payload is missing customer ID",
      error: "servicetitan_customer_id is required",
      retryable: false,
    };
  }

  const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

  // ── Watermark-aware recovery: if not found locally ──
  if (!existing) {
    const tenantId = extracted.servicetitan_tenant_id || getTenantId();
    const environment = getEnvironment();

    let watermark: any | null = null;
    try {
      watermark = await getWatermark(base44, tenantId, environment);
    } catch (err: any) {
      // FAIL CLOSED: watermark database error — do not create
      console.error("[ST CUST SYNC] FAIL CLOSED — watermark load error during update:", err.message);
      await logWatermarkAlert(base44, event, extracted.servicetitan_customer_id, tenantId, environment, err.message);
      return {
        success: false,
        summary: `Customer update blocked — watermark load failed: ${err.message}`,
        error: `Watermark error (FAIL CLOSED): ${err.message}`,
        retryable: true,
      };
    }

    if (watermark && watermark.status === "active" && watermark.sync_strategy === "new_customers_only") {
      // In new-customers-only mode, do NOT create from update webhooks.
      // The customer will be hydrated on demand when a job/appointment references it.
      await incrementWatermarkCounters(base44, watermark.id, {
        webhook_events_skipped_pre_activation: 1,
        webhook_events_processed: 1,
      });

      return {
        success: true,
        summary: `Customer '${extracted.servicetitan_customer_id}' not found locally — update skipped (new-customers-only mode)`,
        metadata: {
          sync_action: "not_found_skipped",
          servicetitan_customer_id: extracted.servicetitan_customer_id,
          reason: "new_customers_only_no_create_from_update",
        },
        finalStatus: "ignored",
      };
    }

    // No watermark or full_historical_backfill — keep original recovery upsert behavior
    return syncCustomerCreated(ctx);
  }

  // Skip merged or deleted customers (unless this is a restore event)
  if (existing.servicetitan_sync_status === "merged") {
    return {
      success: true,
      summary: `Customer ${extracted.servicetitan_customer_id} was merged into another customer — update ignored`,
      metadata: {
        sync_action: "unchanged",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        reason: "customer_merged",
        changed_fields: [],
      },
    };
  }

  // ── Event ordering protection: reject stale events ──
  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    // Duplicate/stale event — increment duplicate counter
    const tenantId = extracted.servicetitan_tenant_id || getTenantId();
    const environment = getEnvironment();
    try {
      const watermark = await getWatermark(base44, tenantId, environment);
      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_duplicate_events_ignored: 1,
          webhook_events_processed: 1,
        });
      }
    } catch { /* non-fatal */ }

    await addTimelineEntry(
      base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Stale event ignored: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning", undefined,
      {
        sync_action: "stale_ignored",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        incoming_event_at: extracted.servicetitan_last_event_at,
        existing_event_at: existing.servicetitan_last_event_at,
      }
    );

    return {
      success: true,
      summary: `Customer ${extracted.servicetitan_customer_id} — stale event ignored`,
      metadata: {
        sync_action: "stale_ignored",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        changed_fields: [],
      },
    };
  }

  const updateData = buildSyncUpdateData(extracted, event?.event_type || "customer_updated");

  const nonEmptyUpdateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (
      key === "servicetitan_last_sync" ||
      key === "servicetitan_last_event_type" ||
      key === "servicetitan_last_event_at" ||
      key === "servicetitan_source" ||
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
    // Idempotency: no changes — count as duplicate
    const tenantId = extracted.servicetitan_tenant_id || getTenantId();
    const environment = getEnvironment();
    try {
      const watermark = await getWatermark(base44, tenantId, environment);
      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_duplicate_events_ignored: 1,
          webhook_events_processed: 1,
        });
      }
    } catch { /* non-fatal */ }

    await addTimelineEntry(
      base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `No changes required for customer '${extracted.servicetitan_customer_id}'`,
      "info", undefined,
      {
        sync_action: "unchanged",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
      }
    );

    return {
      success: true,
      summary: `Customer ${extracted.servicetitan_customer_id} — no changes required`,
      metadata: {
        sync_action: "unchanged",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        changed_fields: [],
      },
    };
  }

  const conflictHistory = appendConflictHistory(existing, nonEmptyUpdateData, changedFields, event);
  if (conflictHistory) {
    nonEmptyUpdateData.sync_conflict_history_json = conflictHistory;
    nonEmptyUpdateData.servicetitan_sync_status = "conflict";
  }

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, nonEmptyUpdateData);

    // Increment webhook_updates_completed (only after success)
    const tenantId = extracted.servicetitan_tenant_id || getTenantId();
    const environment = getEnvironment();
    try {
      const watermark = await getWatermark(base44, tenantId, environment);
      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_updates_completed: 1,
          webhook_events_processed: 1,
        });
      }
    } catch { /* non-fatal */ }

    await addTimelineEntry(
      base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Customer updated (${existing.id}) for ST customer '${extracted.servicetitan_customer_id}'`,
      "success", undefined,
      {
        sync_action: "updated",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        changed_fields: changedFields,
        conflict_detected: !!conflictHistory,
      }
    );

    return {
      success: true,
      summary: `Customer '${extracted.name || existing.name}' (${extracted.servicetitan_customer_id}) updated`,
      metadata: {
        sync_action: "updated",
        local_customer_id: existing.id,
        servicetitan_customer_id: extracted.servicetitan_customer_id,
        changed_fields: changedFields,
        conflict_detected: !!conflictHistory,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Increment failed counter
    const tenantId = extracted.servicetitan_tenant_id || getTenantId();
    const environment = getEnvironment();
    try {
      const watermark = await getWatermark(base44, tenantId, environment);
      if (watermark) {
        await incrementWatermarkCounters(base44, watermark.id, {
          webhook_events_failed: 1,
          webhook_events_processed: 1,
        });
      }
    } catch { /* non-fatal */ }

    return {
      success: false,
      summary: "Customer update failed",
      error: `Database update failed: ${errorMsg}`,
      retryable: true,
    };
  }
}

// ─── Helper: Log Watermark Alert ──────────────────────────────────────────────

async function logWatermarkAlert(
  base44: any,
  event: any,
  stCustomerId: string,
  tenantId: string,
  environment: string,
  error: string
): Promise<void> {
  console.error(
    `[ST CUST SYNC] WATERMARK ALERT — tenant=${tenantId}, env=${environment}, ` +
    `event_id=${event?.id || "N/A"}, st_customer_id=${stCustomerId}, error=${error}`
  );

  try {
    await addTimelineEntry(
      base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `WATERMARK ALERT: Customer '${stCustomerId}' could not be processed due to watermark error: ${error}. ` +
      `Event retained for retry. tenant=${tenantId}, env=${environment}.`,
      "error", undefined,
      {
        sync_action: "watermark_error",
        servicetitan_customer_id: stCustomerId,
        tenant_id: tenantId,
        environment,
        error,
        event_id: event?.id || "",
        admin_alert: true,
      }
    );
  } catch { /* non-fatal */ }
}

// ─── Merge / Delete / Restore handlers (unchanged from v1) ───────────────────

export async function syncCustomerMerged(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;

  const sourceStId = getString(payload, "source_customer_id", "merged_customer_id", "from_customer_id");
  const targetStId = getString(payload, "target_customer_id", "surviving_customer_id", "into_customer_id", "to_customer_id");

  if (!sourceStId || !targetStId) {
    return { success: false, summary: "Customer merge payload is missing source or target customer ID", error: "source_customer_id and target_customer_id are required", retryable: false };
  }

  if (sourceStId === targetStId) {
    return { success: false, summary: "Customer merge source and target are the same customer", error: "source_customer_id and target_customer_id must differ", retryable: false };
  }

  const sourceCustomer = await findLocalCustomer(base44, sourceStId);
  const targetCustomer = await findLocalCustomer(base44, targetStId);

  if (!targetCustomer) {
    const targetData = payload.target_customer || payload.surviving_customer || {};
    if (Object.keys(targetData).length > 0) {
      const targetExtracted = extractCustomerData({ ...targetData, customer_id: targetStId }, event);
      if (targetExtracted.name) {
        const createData = buildSyncUpdateData(targetExtracted, event?.event_type || "customer_merged");
        createData.servicetitan_sync_version = 1;
        try {
          await base44.asServiceRole.entities.Customer.create(createData);
        } catch (err) {
          return { success: false, summary: "Failed to create target customer during merge", error: `Target customer creation failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
        }
      }
    }

    const newTarget = await findLocalCustomer(base44, targetStId);
    if (!newTarget) {
      return { success: false, summary: `Merge target customer '${targetStId}' not found locally and could not be created`, error: "Target customer not found — will retry when target is synced", retryable: true };
    }
  }

  const finalTarget = await findLocalCustomer(base44, targetStId);
  if (!finalTarget) {
    return { success: false, summary: `Merge target customer '${targetStId}' not found`, error: "Target customer not found after creation attempt", retryable: true };
  }

  if (!sourceCustomer) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Merge: source customer '${sourceStId}' not found locally — nothing to relink`, "info", undefined, { sync_action: "unchanged", servicetitan_customer_id: sourceStId, target_customer_id: targetStId });
    return { success: true, summary: `Merge: source customer '${sourceStId}' not found — nothing to relink`, metadata: { sync_action: "unchanged", source_customer_id: sourceStId, target_customer_id: targetStId, changed_fields: [] } };
  }

  const relinkResult = await relinkCustomerRecords(base44, sourceCustomer.id, finalTarget);

  const now = new Date().toISOString();
  let mergeHistory: any[] = [];
  try { mergeHistory = sourceCustomer.servicetitan_merge_history_json ? JSON.parse(sourceCustomer.servicetitan_merge_history_json) : []; } catch { mergeHistory = []; }
  mergeHistory.push({ webhook_event_id: event?.id || "", event_type: event?.event_type || "customer_merged", source_customer_id: sourceStId, target_customer_id: targetStId, merged_at: now, relinked_counts: relinkResult });

  try {
    await base44.asServiceRole.entities.Customer.update(sourceCustomer.id, {
      servicetitan_sync_status: "merged", servicetitan_merged_into: targetStId, servicetitan_merged_at: now,
      servicetitan_last_sync: now, servicetitan_last_event_type: event?.event_type || "customer_merged",
      servicetitan_last_event_at: extractedEventAt(payload) || now, servicetitan_source: "webhook",
      servicetitan_merge_history_json: JSON.stringify(mergeHistory),
    });

    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Customer merged: '${sourceStId}' → '${targetStId}'. Relinked ${relinkResult.appointments} appointments, ${relinkResult.jobs} jobs, ${relinkResult.invoices} invoices.`, "success", undefined, { sync_action: "merged", source_customer_id: sourceStId, target_customer_id: targetStId, local_source_id: sourceCustomer.id, local_target_id: finalTarget.id, relinked: relinkResult });

    return { success: true, summary: `Customer '${sourceStId}' merged into '${targetStId}' — ${relinkResult.appointments + relinkResult.jobs + relinkResult.invoices} records relinked`, metadata: { sync_action: "merged", source_customer_id: sourceStId, target_customer_id: targetStId, local_source_id: sourceCustomer.id, local_target_id: finalTarget.id, relinked: relinkResult, changed_fields: ["servicetitan_sync_status", "servicetitan_merged_into", "servicetitan_merged_at"] } };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, summary: "Customer merge failed", error: `Database update failed: ${errorMsg}`, retryable: true };
  }
}

export async function syncCustomerDeleted(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractCustomerData(payload, event);

  if (!extracted.servicetitan_customer_id) {
    return { success: false, summary: "Customer payload is missing customer ID", error: "servicetitan_customer_id is required", retryable: false };
  }

  const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

  if (!existing) {
    return { success: true, summary: `Customer ${extracted.servicetitan_customer_id} not found locally — nothing to soft-delete`, metadata: { sync_action: "unchanged", servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: [] } };
  }

  if (existing.servicetitan_sync_status === "merged") {
    return { success: true, summary: `Customer ${extracted.servicetitan_customer_id} was merged — delete ignored`, metadata: { sync_action: "unchanged", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, reason: "customer_merged", changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Stale delete event ignored: incoming event_at older than last event_at`, "warning", undefined, { sync_action: "stale_ignored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id });
    return { success: true, summary: `Customer ${extracted.servicetitan_customer_id} — stale delete event ignored`, metadata: { sync_action: "stale_ignored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: true, servicetitan_deleted_at: now, servicetitan_sync_status: "deleted",
    status: "inactive", servicetitan_last_sync: now, servicetitan_last_event_type: event?.event_type || "customer_deleted",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
  };

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Customer soft-deleted (${existing.id}) for ST customer '${extracted.servicetitan_customer_id}'`, "warning", undefined, { sync_action: "deleted", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status", "status"] });
    return { success: true, summary: `Customer '${extracted.servicetitan_customer_id}' soft-deleted`, metadata: { sync_action: "deleted", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status", "status"] } };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, summary: "Customer soft-delete failed", error: `Database update failed: ${errorMsg}`, retryable: true };
  }
}

export async function syncCustomerRestored(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractCustomerData(payload, event);

  if (!extracted.servicetitan_customer_id) {
    return { success: false, summary: "Customer payload is missing customer ID", error: "servicetitan_customer_id is required", retryable: false };
  }

  const existing = await findLocalCustomer(base44, extracted.servicetitan_customer_id);

  if (!existing) {
    return syncCustomerCreated(ctx);
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Stale restore event ignored: incoming event_at older than last event_at`, "warning", undefined, { sync_action: "stale_ignored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id });
    return { success: true, summary: `Customer ${extracted.servicetitan_customer_id} — stale restore event ignored`, metadata: { sync_action: "stale_ignored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: false, servicetitan_deleted_at: null, servicetitan_sync_status: "synced",
    status: extracted.status || "active", servicetitan_last_sync: now, servicetitan_last_event_type: event?.event_type || "customer_restored",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
  };

  if (extracted.name) updateData.name = extracted.name;
  if (extracted.email) updateData.email = extracted.email;
  if (extracted.phone) updateData.phone = extracted.phone;
  if (extracted.address) updateData.address = extracted.address;

  try {
    await base44.asServiceRole.entities.Customer.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED, `Customer restored (${existing.id}) for ST customer '${extracted.servicetitan_customer_id}'`, "success", undefined, { sync_action: "restored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status", "status"] });
    return { success: true, summary: `Customer '${extracted.servicetitan_customer_id}' restored`, metadata: { sync_action: "restored", local_customer_id: existing.id, servicetitan_customer_id: extracted.servicetitan_customer_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status", "status"] } };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, summary: "Customer restore failed", error: `Database update failed: ${errorMsg}`, retryable: true };
  }
}