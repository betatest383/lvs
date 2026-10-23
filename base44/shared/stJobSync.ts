/**
 * ServiceTitan Job Synchronization Service
 *
 * Shared backend module that creates, updates, cancels, completes, reopens,
 * soft-deletes, and restores local Job records from ServiceTitan webhook events.
 *
 * Called by the thin job handler — never contains routing logic itself.
 *
 * Synchronization Key:
 *   servicetitan_job_id is the PRIMARY key. Never matches by job number,
 *   customer name, or address alone.
 *
 * Idempotency:
 *   Every function searches first by servicetitan_job_id.
 *   Replaying the same webhook produces no duplicate and returns "unchanged"
 *   when no fields differ.
 *
 * Event Ordering Protection:
 *   servicetitan_last_event_at stores the timestamp of the last ServiceTitan
 *   event that updated this job. An older event never overwrites newer
 *   ServiceTitan-controlled state; it returns sync_action="stale_ignored".
 *
 * Conflict Ownership:
 *   ServiceTitan-controlled fields (job number, customer relationship, service
 *   location, job type, business unit, campaign, project, ST status, scheduled
 *   dates, arrival window, completion/cancellation state, technician
 *   assignments, summary) are overwritten on update. When a locally modified
 *   value is overwritten, the previous value is recorded in
 *   sync_conflict_history_json.
 *   LVC-controlled fields (notes, priority, workflow_version, truck assignment,
 *   apprentice, Job Hub workflow progress, inspection records, repair
 *   recommendations, proposal-building state, AI summaries, sales coaching,
 *   task history, photos, documents, signatures, internal classifications,
 *   quality-control state, commission state, inventory workflow state,
 *   warehouse workflow state, custom LVC fields) are never touched.
 *
 * Customer Relationship:
 *   Resolved by servicetitan_customer_id. If the customer has not yet been
 *   synced, the job is created with customer_mapping_status="pending" and the
 *   raw ST customer ID is preserved. When the customer later syncs, the
 *   reconcilePendingCustomers() function resolves all pending jobs.
 *
 * Technician Mapping:
 *   Uses the same hierarchical mapping as appointment sync:
 *   1. servicetitan_technician_id (primary key, no warning)
 *   2. servicetitan_employee_id (fallback, identified with a note)
 *   3. email (fallback, warning)
 *   4. name (last resort, stronger warning)
 *   Supports multiple technicians. The first mapped technician becomes the
 *   lead_technician.
 *
 * Status Mapping:
 *   ServiceTitan raw statuses are always preserved in servicetitan_raw_status.
 *   The LVC status field is only updated for forward-progressing lifecycle
 *   events (scheduled, started, completed, canceled). on_hold and updated
 *   events do NOT change the LVC status — they preserve the more detailed
 *   LVC workflow state.
 *
 * Completion Behavior:
 *   ✔ Stores the ServiceTitan completion state (servicetitan_raw_status)
 *   ✔ Populates completed_at and completed_source
 *   ✔ Preserves Job Hub history, inspections, proposals, photos, documents, notes, tasks
 *   ✘ Does NOT post inventory transactions
 *   ✘ Does NOT calculate commissions
 *   ✘ Does NOT mark incomplete LVC workflow steps as complete
 *   ✘ Does NOT complete unrelated EnterpriseTask records
 *
 * Cancellation, Deletion, Restoration:
 *   Cancellation sets is_canceled=true and canceled_source="servicetitan".
 *   Deletion sets servicetitan_deleted=true (soft delete — never physical delete).
 *   Restoration reverses only ServiceTitan deletion fields. It does not erase
 *   historical cancellation or completion data.
 *
 * Reopened Jobs:
 *   A reopened job preserves prior completion history (reopened_history_json),
 *   records the reopening event, updates the current ST status, and does NOT
 *   automatically reopen completed EnterpriseTask records.
 */

import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";
import {
  SyncContext, SyncResult,
  extractJobData, isStaleEvent, findLocalJob,
  resolveCustomer, mapAllTechnicians, resolveAppointments,
  mapStatus, shouldApplyLvcStatus, mapJobType,
  detectChangedFields, appendConflictHistory,
  buildSyncUpdateData, applyLvcStatus, filterEmptyValues,
  ST_CONTROLLED_FIELDS,
} from "./stJobSyncHelpers.ts";

// ─── Public Sync Functions ────────────────────────────────────────────────────

export async function syncJobCreated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  if (extracted.warnings.some((w) => w.includes("Invalid date"))) {
    return { success: false, summary: "Job payload contains an invalid date", error: extracted.warnings.find((w) => w.includes("Invalid date")) || "Invalid date", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (existing) return syncJobUpdated(ctx);

  const customerRes = await resolveCustomer(base44, extracted.servicetitan_customer_id, extracted.servicetitan_customer_name, event?.id, extracted.servicetitan_job_id, payload, ctx.testSkipHydration);

  // If customer hydration failed, defer the job — do NOT create an orphaned record
  if (customerRes.status === "deferred") {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job '${extracted.servicetitan_job_id}' deferred — customer '${extracted.servicetitan_customer_id}' hydration failed`,
      "warning", undefined,
      { sync_action: "deferred_customer_hydration_failed", servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_customer_id: extracted.servicetitan_customer_id, deferred_record_id: customerRes.deferredRecordId }
    );
    return {
      success: false,
      summary: `Job deferred — customer '${extracted.servicetitan_customer_id}' hydration failed`,
      error: `Customer mapping deferred: ${customerRes.warning || "customer hydration failed"}`,
      retryable: true,
    };
  }

  const techResult = await mapAllTechnicians(base44, extracted);
  const apptResult = await resolveAppointments(base44, extracted.servicetitan_job_id);

  const updateData = buildSyncUpdateData(extracted, customerRes, techResult, apptResult, event?.event_type || "job_created", true);
  updateData.servicetitan_sync_version = 1;
  applyLvcStatus(updateData, "scheduled", extracted.servicetitan_raw_status || "scheduled");

  if (!updateData.service_date) {
    updateData.service_date = new Date().toISOString().split("T")[0];
  }

  // Resolve the Base44 Location by servicetitan_location_id -> Location.crm_location_id
  // so a matched-location Job is never left with location_id=null or a pending
  // "Service address pending" placeholder at creation. Never creates a Location.
  if (extracted.servicetitan_location_id) {
    try {
      const locs = await base44.asServiceRole.entities.Location.filter(
        { crm_location_id: String(extracted.servicetitan_location_id) }, null, 1
      );
      if (locs.length > 0) {
        const loc = locs[0];
        updateData.location_id = loc.id;
        if (loc.address) updateData.address = loc.address;
        if (loc.city) updateData.city = loc.city;
        if (loc.state) updateData.state = loc.state;
        if (loc.zip) updateData.zip = loc.zip;
        if ((!updateData.servicetitan_location_name || !String(updateData.servicetitan_location_name).trim()) && loc.location_label) {
          updateData.servicetitan_location_name = loc.location_label;
        }
      }
    } catch (locErr) {
      console.error("[ST JOB SYNC] Location resolution at create failed:", locErr instanceof Error ? locErr.message : String(locErr));
    }
  }

  if (!updateData.address) {
    updateData.address = extracted.servicetitan_location_name || "Service address pending";
  }

  try {
    const created = await base44.asServiceRole.entities.Job.create(updateData);

    if (customerRes.status === "pending") {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Customer relationship pending: Customer '${extracted.servicetitan_customer_id}' not yet synchronized`,
        "warning", undefined, { sync_action: "pending_customer", servicetitan_customer_id: extracted.servicetitan_customer_id, local_job_id: created.id });
    }

    if (techResult.aggregateStatus === "unmatched" && techResult.mappings.length > 0) {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Technician mapping failed: ${techResult.warnings.join("; ")}`,
        "warning", undefined, { sync_action: "technician_mapping_failed", servicetitan_technician_ids: extracted.servicetitan_technician_ids });
    }

    if (apptResult.count > 0) {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Appointment linked: ${apptResult.count} appointment(s) found for job '${extracted.servicetitan_job_id}'`,
        "info", undefined, { sync_action: "appointment_linked", appointment_count: apptResult.count, appointment_ids: apptResult.appointmentIds });
    }

    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job created (${created.id}) for ST job '${extracted.servicetitan_job_id}' — ${extracted.servicetitan_job_number || "no job number"}`,
      "success", undefined, { sync_action: "created", local_job_id: created.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number, customer_mapping: customerRes.status, technician_mapping: techResult.aggregateStatus, appointment_count: apptResult.count });

    const allWarnings = [...extracted.warnings, ...techResult.warnings];
    if (customerRes.warning) allWarnings.push(customerRes.warning);

    return {
      success: true,
      summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' created`,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      metadata: { sync_action: "created", local_job_id: created.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number, customer_mapping: customerRes.status, technician_mapping: techResult.aggregateStatus, appointment_count: apptResult.count, changed_fields: Object.keys(updateData).filter((k) => !k.startsWith("servicetitan_last") && k !== "servicetitan_source" && k !== "servicetitan_sync_status") },
    };
  } catch (err) {
    return { success: false, summary: "Job creation failed", error: `Database create failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobUpdated(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  if (extracted.warnings.some((w) => w.includes("Invalid date"))) {
    return { success: false, summary: "Job payload contains an invalid date", error: extracted.warnings.find((w) => w.includes("Invalid date")) || "Invalid date", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) return syncJobCreated(ctx);

  if (existing.servicetitan_deleted || existing.is_deleted) {
    const lvcDeleted = existing.is_deleted === true;
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} is ${lvcDeleted ? "LVC-deleted" : "soft-deleted"} — update ignored`, metadata: { sync_action: "unchanged", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, reason: lvcDeleted ? "lvc_deleted" : "job_deleted", changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Stale event ignored: incoming event_at '${extracted.servicetitan_last_event_at}' is older than last event_at '${existing.servicetitan_last_event_at}'`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, incoming_event_at: extracted.servicetitan_last_event_at, existing_event_at: existing.servicetitan_last_event_at });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const customerRes = await resolveCustomer(base44, extracted.servicetitan_customer_id, extracted.servicetitan_customer_name, event?.id, extracted.servicetitan_job_id, payload, ctx.testSkipHydration);

  // If customer hydration failed, defer the job update
  if (customerRes.status === "deferred") {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job update deferred — customer '${extracted.servicetitan_customer_id}' hydration failed`,
      "warning", undefined,
      { sync_action: "deferred_customer_hydration_failed", servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_customer_id: extracted.servicetitan_customer_id, deferred_record_id: customerRes.deferredRecordId }
    );
    return {
      success: false,
      summary: `Job update deferred — customer '${extracted.servicetitan_customer_id}' hydration failed`,
      error: customerRes.warning || "Customer hydration failed",
      retryable: true,
    };
  }

  const hasTechData = extracted.servicetitan_technician_ids.length > 0 || extracted.servicetitan_technician_names.length > 0 || extracted.servicetitan_technician_emails.length > 0;
  const techResult = hasTechData
    ? await mapAllTechnicians(base44, extracted)
    : { mappings: [], aggregateStatus: (existing.technician_mapping_status as "matched" | "unmatched" | "unassigned") || "unassigned", warnings: [] as string[] };

  const apptResult = await resolveAppointments(base44, extracted.servicetitan_job_id);
  const updateData = buildSyncUpdateData(extracted, customerRes, techResult, apptResult, event?.event_type || "job_updated", false);
  applyLvcStatus(updateData, existing.status, extracted.servicetitan_raw_status);

  // When no technician data was supplied in the payload, preserve existing
  // technician arrays — do not overwrite them with empty values.
  if (!hasTechData) {
    delete updateData.servicetitan_technician_ids;
    delete updateData.servicetitan_technician_names;
    delete updateData.technician_emails;
    delete updateData.technician_email;
    delete updateData.lead_technician_email;
    delete updateData.lead_technician_name;
    delete updateData.technician_name;
    delete updateData.dispatch_status;
    delete updateData.technician_mapping_status;
    delete updateData.technician_mapping_warning;
  }

  const nonEmptyUpdateData = filterEmptyValues(updateData);
  nonEmptyUpdateData.servicetitan_sync_version = (existing.servicetitan_sync_version || 0) + 1;

  const changedFields = detectChangedFields(existing, nonEmptyUpdateData, ST_CONTROLLED_FIELDS);

  if (changedFields.length === 0) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `No changes required for job '${extracted.servicetitan_job_id}'`,
      "info", undefined, { sync_action: "unchanged", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — no changes required`, metadata: { sync_action: "unchanged", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const conflictHistory = appendConflictHistory(existing, nonEmptyUpdateData, changedFields, event);
  if (conflictHistory) {
    nonEmptyUpdateData.sync_conflict_history_json = conflictHistory;
    nonEmptyUpdateData.servicetitan_sync_status = "conflict";
  }

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, nonEmptyUpdateData);

    if (customerRes.status === "pending" && existing.customer_mapping_status !== "pending") {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Customer relationship pending: Customer '${extracted.servicetitan_customer_id}' not yet synchronized`,
        "warning", undefined, { sync_action: "pending_customer", servicetitan_customer_id: extracted.servicetitan_customer_id, local_job_id: existing.id });
    } else if (customerRes.status === "matched" && existing.customer_mapping_status === "pending") {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Customer relationship resolved: Customer '${extracted.servicetitan_customer_id}' matched to local customer '${customerRes.customerId}'`,
        "success", undefined, { sync_action: "customer_resolved", local_customer_id: customerRes.customerId, local_job_id: existing.id });
    }

    if (apptResult.count > 0) {
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Appointment linked: ${apptResult.count} appointment(s) found for job '${extracted.servicetitan_job_id}'`,
        "info", undefined, { sync_action: "appointment_linked", appointment_count: apptResult.count });
    }

    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job updated (${existing.id}) for ST job '${extracted.servicetitan_job_id}'`,
      "success", undefined, { sync_action: "updated", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number, customer_mapping: customerRes.status, technician_mapping: techResult.aggregateStatus, appointment_count: apptResult.count, changed_fields: changedFields, conflict_detected: !!conflictHistory });

    const allWarnings = [...extracted.warnings, ...techResult.warnings];
    if (customerRes.warning) allWarnings.push(customerRes.warning);

    return {
      success: true,
      summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' updated`,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      metadata: { sync_action: "updated", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number, customer_mapping: customerRes.status, technician_mapping: techResult.aggregateStatus, appointment_count: apptResult.count, changed_fields: changedFields, conflict_detected: !!conflictHistory },
    };
  } catch (err) {
    return { success: false, summary: "Job update failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobScheduled(ctx: SyncContext): Promise<SyncResult> {
  const { base44, event } = ctx;
  const result = await syncJobUpdated(ctx);
  if (!result.success) return result;

  const isReschedule = event?.event_type?.includes("reschedul");
  const syncAction = isReschedule ? "rescheduled" : "scheduled";

  await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
    isReschedule ? `Job rescheduled by ServiceTitan` : `Job scheduled by ServiceTitan`,
    "info", undefined, { sync_action: syncAction, ...(result.metadata || {}) });

  return { ...result, summary: isReschedule ? `Job rescheduled by ServiceTitan` : `Job scheduled by ServiceTitan`, metadata: { ...result.metadata, sync_action: syncAction } };
}

export async function syncJobStarted(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);

  if (!existing) {
    const createResult = await syncJobCreated(ctx);
    if (!createResult.success) return createResult;
    const newExisting = await findLocalJob(base44, extracted.servicetitan_job_id);
    if (!newExisting) return createResult;

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      status: "in_progress", dispatch_status: "started",
      servicetitan_raw_status: extracted.servicetitan_raw_status || "in_progress",
      servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_started",
      servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
      servicetitan_sync_version: (newExisting.servicetitan_sync_version || 0) + 1,
    };

    try {
      await base44.asServiceRole.entities.Job.update(newExisting.id, updateData);
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Job started (${newExisting.id}) for ST job '${extracted.servicetitan_job_id}'`,
        "success", undefined, { sync_action: "started", local_job_id: newExisting.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: ["status", "dispatch_status"] });
      return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' started`, metadata: { sync_action: "started", local_job_id: newExisting.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: ["status", "dispatch_status"] } };
    } catch (err) {
      return { success: false, summary: "Job start failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
    }
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Start event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale start event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_raw_status: extracted.servicetitan_raw_status || "in_progress", dispatch_status: "started",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_started",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };
  applyLvcStatus(updateData, existing.status, "in_progress");

  const changedFields = detectChangedFields(existing, updateData, ["status", "dispatch_status", "servicetitan_raw_status"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job started (${existing.id}) for ST job '${extracted.servicetitan_job_id}'`,
      "success", undefined, { sync_action: "started", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number || existing.servicetitan_job_number, changed_fields: changedFields });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' started`, metadata: { sync_action: "started", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job start failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobOnHold(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) return syncJobCreated(ctx);

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `On-hold event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale on-hold event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_raw_status: extracted.servicetitan_raw_status || "on_hold",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_on_hold",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  const changedFields = detectChangedFields(existing, updateData, ["servicetitan_raw_status"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job placed on hold (${existing.id}) by ServiceTitan — LVC workflow status preserved`,
      "warning", undefined, { sync_action: "on_hold", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: changedFields, lvc_status_preserved: existing.status });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' placed on hold (LVC workflow status preserved)`, metadata: { sync_action: "on_hold", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job on-hold failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobCompleted(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);

  if (!existing) {
    const createResult = await syncJobCreated(ctx);
    if (!createResult.success) return createResult;
    const newExisting = await findLocalJob(base44, extracted.servicetitan_job_id);
    if (!newExisting) return createResult;

    const now = new Date().toISOString();
    const completionTs = extracted.completed_at_from_payload || now;
    const updateData: Record<string, any> = {
      status: "completed", servicetitan_raw_status: extracted.servicetitan_raw_status || "completed",
      completed_at: completionTs, completed_source: "servicetitan",
      servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_completed",
      servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
      servicetitan_sync_version: (newExisting.servicetitan_sync_version || 0) + 1,
    };

    try {
      await base44.asServiceRole.entities.Job.update(newExisting.id, updateData);
      await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
        `Job completed (${newExisting.id}) for ST job '${extracted.servicetitan_job_id}'`,
        "success", undefined, { sync_action: "completed", local_job_id: newExisting.id, servicetitan_job_id: extracted.servicetitan_job_id, completed_at: completionTs, changed_fields: ["status", "completed_at", "completed_source"] });
      return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' completed`, metadata: { sync_action: "completed", local_job_id: newExisting.id, servicetitan_job_id: extracted.servicetitan_job_id, completed_at: completionTs, changed_fields: ["status", "completed_at", "completed_source"] } };
    } catch (err) {
      return { success: false, summary: "Job completion failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
    }
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Complete event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale complete event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const completionTs = extracted.completed_at_from_payload || now;
  const updateData: Record<string, any> = {
    status: "completed", servicetitan_raw_status: extracted.servicetitan_raw_status || "completed",
    completed_at: completionTs, completed_source: "servicetitan",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_completed",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  const changedFields = detectChangedFields(existing, updateData, ["status", "servicetitan_raw_status", "completed_at", "completed_source"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job completed (${existing.id}) for ST job '${extracted.servicetitan_job_id}' — inspections, proposals, notes, and tasks preserved`,
      "success", undefined, { sync_action: "completed", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number || existing.servicetitan_job_number, completed_at: completionTs, changed_fields: changedFields, note: "No EnterpriseTask records, inventory transactions, or commissions were modified" });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' completed`, metadata: { sync_action: "completed", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, completed_at: completionTs, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job completion failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobCanceled(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) {
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} not found locally — nothing to cancel`, metadata: { sync_action: "unchanged", servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Cancel event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale cancel event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const cancelTs = extracted.canceled_at_from_payload || now;
  const updateData: Record<string, any> = {
    is_canceled: true, canceled_at: cancelTs, canceled_source: "servicetitan",
    status: "cancelled", servicetitan_raw_status: extracted.servicetitan_raw_status || "canceled",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_canceled",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  const changedFields = detectChangedFields(existing, updateData, ["is_canceled", "canceled_at", "canceled_source", "status", "servicetitan_raw_status"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job canceled (${existing.id}) for ST job '${extracted.servicetitan_job_id}' — record preserved for history`,
      "warning", undefined, { sync_action: "canceled", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number || existing.servicetitan_job_number, canceled_at: cancelTs, changed_fields: changedFields });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' canceled`, metadata: { sync_action: "canceled", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, canceled_at: cancelTs, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job cancellation failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobReopened(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) return syncJobCreated(ctx);

  // LVC-owned deletion protection: an inbound ServiceTitan "reopened" event must
  // not reactivate a job that was manually deleted in LVC OS.
  if (existing.is_deleted) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job ${extracted.servicetitan_job_id} is LVC-deleted — reopen event ignored to prevent reactivation`,
      "warning", undefined, { sync_action: "lvc_deleted_reopen_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} is LVC-deleted — reopen ignored`, metadata: { sync_action: "unchanged", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, reason: "lvc_deleted", changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Reopen event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale reopen event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  let reopenedHistory: any[] = [];
  try { reopenedHistory = existing.reopened_history_json ? JSON.parse(existing.reopened_history_json) : []; } catch { reopenedHistory = []; }
  reopenedHistory.push({ webhook_event_id: event?.id || "", event_type: event?.event_type || "job_reopened", reopened_at: now, prior_completed_at: existing.completed_at || null, prior_status: existing.status || null, prior_servicetitan_raw_status: existing.servicetitan_raw_status || null });

  const newLvcStatus = existing.status === "completed" ? "in_progress" : existing.status;
  const updateData: Record<string, any> = {
    status: newLvcStatus, servicetitan_raw_status: extracted.servicetitan_raw_status || "reopened",
    reopened_at: now, reopened_history_json: JSON.stringify(reopenedHistory),
    is_canceled: false, canceled_at: null, canceled_source: null,
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_reopened",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  const changedFields = detectChangedFields(existing, updateData, ["status", "servicetitan_raw_status", "reopened_at", "is_canceled", "canceled_at"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job reopened (${existing.id}) for ST job '${extracted.servicetitan_job_id}' — prior completion history preserved`,
      "success", undefined, { sync_action: "reopened", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, servicetitan_job_number: extracted.servicetitan_job_number || existing.servicetitan_job_number, reopened_at: now, prior_completed_at: existing.completed_at || null, prior_status: existing.status || null, changed_fields: changedFields, note: "No EnterpriseTask records were reopened" });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' reopened`, metadata: { sync_action: "reopened", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, reopened_at: now, prior_completed_at: existing.completed_at || null, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job reopen failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobDeleted(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) {
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} not found locally — nothing to soft-delete`, metadata: { sync_action: "unchanged", servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Delete event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale delete event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: true, servicetitan_deleted_at: now, servicetitan_sync_status: "deleted",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_deleted",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job soft-deleted (${existing.id}) for ST job '${extracted.servicetitan_job_id}' — record preserved for history`,
      "warning", undefined, { sync_action: "deleted", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status"] });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' soft-deleted`, metadata: { sync_action: "deleted", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status"] } };
  } catch (err) {
    return { success: false, summary: "Job soft-delete failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

export async function syncJobRestored(ctx: SyncContext): Promise<SyncResult> {
  const { base44, payload, event } = ctx;
  const extracted = extractJobData(payload, event);

  if (!extracted.servicetitan_job_id) {
    return { success: false, summary: "Job payload is missing job ID", error: "servicetitan_job_id is required", retryable: false };
  }

  const existing = await findLocalJob(base44, extracted.servicetitan_job_id);
  if (!existing) return syncJobCreated(ctx);

  // LVC-owned deletion protection: an inbound ServiceTitan "restored" event must
  // not reactivate a job that was manually deleted in LVC OS. Only an Owner/Admin
  // may restore it via manageJobDeletion.
  if (existing.is_deleted) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job ${extracted.servicetitan_job_id} is LVC-deleted — restore event ignored to prevent reactivation`,
      "warning", undefined, { sync_action: "lvc_deleted_restore_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} is LVC-deleted — restore ignored`, metadata: { sync_action: "unchanged", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, reason: "lvc_deleted", changed_fields: [] } };
  }

  if (isStaleEvent(existing, extracted.servicetitan_last_event_at)) {
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Restore event ignored as stale: incoming event_at older than last event_at`,
      "warning", undefined, { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id });
    return { success: true, summary: `Job ${extracted.servicetitan_job_id} — stale restore event ignored`, metadata: { sync_action: "stale_ignored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: [] } };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    servicetitan_deleted: false, servicetitan_deleted_at: null, servicetitan_sync_status: "synced",
    servicetitan_last_sync_at: now, servicetitan_last_event_type: event?.event_type || "job_restored",
    servicetitan_last_event_at: extracted.servicetitan_last_event_at || now, servicetitan_source: "webhook",
    servicetitan_sync_version: (existing.servicetitan_sync_version || 0) + 1,
  };

  const changedFields = detectChangedFields(existing, updateData, ["servicetitan_deleted", "servicetitan_deleted_at", "servicetitan_sync_status"]);

  try {
    await base44.asServiceRole.entities.Job.update(existing.id, updateData);
    await addTimelineEntry(base44, event?.id, TIMELINE_STAGES.HANDLER_FINISHED,
      `Job restored (${existing.id}) for ST job '${extracted.servicetitan_job_id}' — cancellation and completion data preserved`,
      "success", undefined, { sync_action: "restored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: changedFields, preserved_cancellation: existing.is_canceled || false, preserved_completion: !!existing.completed_at });
    return { success: true, summary: `Job '${extracted.servicetitan_job_number || extracted.servicetitan_job_id}' restored`, metadata: { sync_action: "restored", local_job_id: existing.id, servicetitan_job_id: extracted.servicetitan_job_id, changed_fields: changedFields } };
  } catch (err) {
    return { success: false, summary: "Job restore failed", error: `Database update failed: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

// ─── Pending Customer Reconciliation ──────────────────────────────────────────

export async function reconcilePendingCustomers(
  base44: any,
  stCustomerId: string,
  localCustomerId: string,
  customerName: string,
  customerNumber: string,
  webhookEventId?: string
): Promise<{ reconciled: number; errors: number }> {
  if (!stCustomerId || !localCustomerId) return { reconciled: 0, errors: 0 };

  let reconciled = 0;
  let errors = 0;

  try {
    const pendingJobs = await base44.asServiceRole.entities.Job.filter(
      { customer_mapping_status: "pending", servicetitan_customer_id: stCustomerId },
      null, 100
    );

    for (const job of pendingJobs) {
      try {
        const now = new Date().toISOString();
        await base44.asServiceRole.entities.Job.update(job.id, {
          customer_id: localCustomerId,
          customer_name: customerName || job.customer_name,
          customer_number: customerNumber || job.customer_number || "",
          customer_mapping_status: "matched",
          customer_mapping_warning: "",
          servicetitan_sync_status: job.servicetitan_sync_status === "pending" ? "synced" : job.servicetitan_sync_status,
          servicetitan_last_sync_at: now,
        });

        await addTimelineEntry(base44, webhookEventId, TIMELINE_STAGES.HANDLER_FINISHED,
          `Customer relationship resolved: Job '${job.servicetitan_job_id}' linked to customer '${customerName}' (${localCustomerId})`,
          "success", undefined, { sync_action: "customer_resolved", local_job_id: job.id, servicetitan_job_id: job.servicetitan_job_id, servicetitan_customer_id: stCustomerId, local_customer_id: localCustomerId });
        reconciled++;
      } catch (err) {
        console.error("[ST JOB SYNC] reconcilePendingCustomers job update failed:", err);
        errors++;
      }
    }
  } catch (err) {
    console.error("[ST JOB SYNC] reconcilePendingCustomers query failed:", err);
  }

  return { reconciled, errors };
}