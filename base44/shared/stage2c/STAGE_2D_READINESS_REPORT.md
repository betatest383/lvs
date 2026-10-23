# Stage 2D Readiness Report — Appointment Migration

**Read-Only Assessment — No Implementation Performed**
**Date:** 2026-07-22T04:12:00Z

---

## 1. Existing Appointment Entity and Fields

**Entity:** `Appointment` (base44/entities/Appointment.jsonc)

The Appointment entity is already fully schema-defined with ServiceTitan synchronization fields. Key field groups:

### Primary Sync Key
- `servicetitan_appointment_id` — PRIMARY synchronization key, never matched by name/date/job number alone
- `crm_appointment_id` — legacy alias, kept in sync for backward compatibility

### Job & Customer Relationship Fields
- `job_id` — Base44 Job entity ID
- `customer_id` — Base44 Customer entity ID
- `customer_name` — denormalized customer name
- `servicetitan_job_id` — ST job linkage
- `servicetitan_job_number` — ST job number
- `servicetitan_customer_id` — ST customer linkage
- `servicetitan_customer_name` — ST customer name
- `servicetitan_customer_phone` — ST customer phone

### Scheduling, Status, and Arrival-Window Fields
- `scheduled_start` / `scheduled_end` — ISO 8601 datetime
- `status` — normalized lifecycle status (enum: scheduled, assigned, confirmed, dispatched, started, en_route, arrived, in_progress, completed, cancelled, canceled, on_hold, unknown)
- `dispatch_status` — dispatch lifecycle (enum: unassigned, assigned, dispatched, started, completed, cancelled)
- `servicetitan_arrival_window_start` / `servicetitan_arrival_window_end`
- `servicetitan_raw_status` — original ST status string preserved for audit
- `servicetitan_appointment_number` — human-readable appointment number

### Technician / Employee Assignment Fields
- `technician_id` — linked EmployeeRegistry ID when mapped, or raw ST technician ID
- `technician_email` / `technician_name` — lead technician
- `apprentice_email` / `apprentice_name` — helper/apprentice
- `servicetitan_technician_id` / `servicetitan_technician_name`
- `technician_mapping_status` — matched / unmatched / unassigned
- `technician_mapping_warning` — mapping fallback warning

### Cancellation Fields
- `is_canceled` — boolean
- `canceled_at` / `canceled_source`
- `servicetitan_cancellation_reason`

### Completion Fields
- `completed_at` / `completed_source`
- `is_final_appointment` — only the final appointment may complete the Job

### Sync Metadata Fields (mirrors Customer/Job pattern)
- `servicetitan_last_synced_at` / `servicetitan_last_event_type` / `servicetitan_last_event_at`
- `servicetitan_source` (webhook / manual / api)
- `servicetitan_sync_status` (synced / pending / conflict / deleted)
- `servicetitan_sync_version`
- `servicetitan_created_on` / `servicetitan_modified_on`
- `servicetitan_last_webhook_event_id`
- `servicetitan_tenant_id`
- `sync_conflict_history_json` — append-only conflict audit
- `import_source` (webhook / api_recovery / on_demand_hydration / manual)
- `imported_at`

### Hold / Confirmation Fields
- `servicetitan_hold_status` / `servicetitan_confirmed` / `servicetitan_active` / `servicetitan_unused`

### LVC-Owned Fields (never overwritten by ST)
- `notes` — LVC internal notes
- `truck_assignment_status` / `auto_assigned_truck` / `assigned_vehicle`
- `crew_assignment` / `expected_equipment` / `expected_materials`
- `planned_hours` / `actual_hours` / `production_variance_reason`
- `conflict_override_used` / `conflict_warning_details`
- `appointment_source` (crm / execution_plan / manual)
- `expected_daily_scope` / `daily_production_goal` / `expected_hours` / `day_number` / `total_job_days`

---

## 2. Existing ServiceTitan Appointment Handlers and API Clients

### Direct Webhook Handler (Current Path — NOT through Business Event Engine)
- **File:** `base44/shared/stHandlers/appointmentHandler.ts`
- **Handler:** `appointmentHandler` (domain: "appointment")
- **Actions handled:** created, updated, rescheduled, canceled/cancelled, completed, assigned
- **Delegates to:** `base44/shared/stAppointmentSync.ts` — full lifecycle sync functions:
  - `syncAppointmentCreated(ctx)` — creates local Appointment, hydrates customer if missing
  - `syncAppointmentUpdated(ctx)` — updates, recovery upsert, stale-event protection
  - `syncAppointmentCanceled(ctx)` — soft-cancel, preserves history
  - `syncAppointmentCompleted(ctx)` — marks completed, recovery upsert
  - `syncTechnicianAssignment(ctx, isUnassign)` — assigns/unassigns technician with mapping

### Sync Adapter (New Architecture — Skeleton, NOT Connected)
- **File:** `base44/shared/stSync/adapters/appointmentAdapter.ts`
- **Implements:** `ServiceTitanSyncAdapter<StAppointmentSource, MappedAppointment, LocalAppointment>`
- **Status:** Skeleton implementation — NOT CONNECTED TO PRODUCTION EXECUTION
- **Pagination:** Page-based (page/pageSize) — verified against live `/jpm/v2/tenant/{tenant}/appointments`
- **Customer dependency:** Fail-closed — missing customer ID is a failure, triggers `ensureCustomerForDependentRecord`
- **Status normalization:** Delegates to `normalizeAppointmentStatus` / `normalizeDispatchStatus` in `stAppointmentStatusMapping.ts`
- **Create/update:** Delegates to `syncAppointmentCreated` (reuses existing sync logic)

### Sync Config
- **File:** `base44/shared/stAppointmentSyncConfig.ts`
- **Watermark key:** `appointment_go_live`
- **Sync strategy:** `new_and_active_appointments_only`
- **Page size:** 50
- **Watermark entity:** `AppointmentSyncWatermark` (already exists with full metric fields)

### Status Mapping
- **File:** `base44/shared/stAppointmentStatusMapping.ts`
- **Provides:** `normalizeAppointmentStatus(rawStatus)` → `{ normalizedStatus, rawStatus, mappingResult, isCancellation, isCompletion, isHold, reason }`
- **Provides:** `normalizeDispatchStatus(rawStatus)` → `{ normalizedDispatchStatus, mappingResult, reason }`
- **Pattern:** Unmapped ST statuses map to `unknown` — raw value preserved in `servicetitan_raw_status`

### Existing Backend Functions
- `activateAppointmentSync` — activates appointment sync with watermark
- `runServiceTitanAppointmentIncrementalSync` — incremental recovery scan
- `upsertAppointmentFromCrm` — direct CRM upsert
- `validateAppointmentSyncEngine` — existing validation function

---

## 3. Customer and Job Relationship Fields Needed by Appointment

The Appointment entity already has:
- `servicetitan_customer_id` → links to Customer entity
- `servicetitan_job_id` → links to Job entity
- `customer_id` / `customer_name` → local Customer linkage
- `job_id` → local Job linkage

**Dependency resolution:** The existing `stAppointmentSync.ts` already calls `ensureCustomerForDependentRecord` for on-demand customer hydration when a customer is missing locally. The `appointmentAdapter.ts` skeleton also implements fail-closed customer dependency verification.

**Stage 2D will need:** An appointment event publisher that reconstructs the SyncContext from the BusinessEvent payload (same pattern as `customerEventPublisher.ts` and `jobEventPublisher.ts`).

---

## 4. Technician / Employee Assignment Dependencies

The Appointment entity already supports:
- `technician_id` → EmployeeRegistry ID (when mapped)
- `servicetitan_technician_id` → raw ST technician ID
- `technician_mapping_status` → matched / unmatched / unassigned
- `technician_mapping_warning` → fallback warning

The existing `mapTechnician()` function in `stAppointmentSync.ts` maps ST technicians to EmployeeRegistry with a 4-tier priority:
1. `servicetitan_technician_id` (primary)
2. `servicetitan_employee_id` (fallback)
3. `email` (fallback with warning)
4. `name` (last resort, stronger warning)

**Stage 2D consideration:** The inbound appointment subscriber will need to pass `test_skip_hydration` context for validation, same as the Job subscriber.

---

## 5. Scheduling, Status, Arrival-Window, and Cancellation Fields

All fields already exist in the Appointment entity:
- **Scheduling:** `scheduled_start`, `scheduled_end`
- **Arrival window:** `servicetitan_arrival_window_start`, `servicetitan_arrival_window_end`
- **Status:** `status` (normalized enum), `dispatch_status` (normalized enum), `servicetitan_raw_status`
- **Cancellation:** `is_canceled`, `canceled_at`, `canceled_source`, `servicetitan_cancellation_reason`
- **Completion:** `completed_at`, `completed_source`, `is_final_appointment`
- **Hold:** `servicetitan_hold_status`

Date validation is already implemented in `stAppointmentSync.ts`:
- `validateSchedulingDates()` — rejects invalid dates, requires `scheduled_start` for created/rescheduled
- `normalizeStTimestamp()` — timezone-aware (America/New_York), handles naive timestamps
- `isStaleEvent()` — event ordering protection via `servicetitan_last_event_at`

---

## 6. Possible Duplicate Identifiers

**Risk:** Low. The Appointment entity uses `servicetitan_appointment_id` as the PRIMARY key, with a legacy fallback to `crm_appointment_id`. The existing `findLocalAppointment()` function searches by both:
1. `servicetitan_appointment_id` (primary, sorted by `-servicetitan_last_synced_at`)
2. `crm_appointment_id` (legacy fallback)

**Stage 2D consideration:** The appointment event publisher should use `servicetitan:{st_event_id}:{action}` as the idempotency key (same pattern as Customer and Job). Duplicate webhook events will be deduplicated by the Business Event Engine's idempotency check.

---

## 7. Existing Appointment-Related Webhooks

The current ServiceTitan webhook router (`stEventRouter.ts`) already routes appointment events to the `appointmentHandler`. The existing event types include:
- `appointment_created`
- `appointment_updated`
- `appointment_rescheduled`
- `appointment_canceled` / `appointment_cancelled`
- `appointment_completed`
- `appointment_assigned` (technician assigned)

**Stage 2D consideration:** The appointment event publisher will need to intercept these webhook events and publish them as BusinessEvents (`appointment.created`, `appointment.updated`, etc.), same as the Customer and Job publishers do.

---

## 8. Existing Appointment-Related Outbound Paths

**Current state:** No appointment outbound subscriber exists. The Appointment entity does not have an outbound sync path through the Business Event Engine.

**Stage 2D consideration:** An outbound subscriber (`appointment.sync.outbound`) will need to be created, following the same pattern as `customerOutboundSubscriber.ts` and `jobOutboundSubscriber.ts`:
- Skip `servicetitan`-originated events (loop prevention)
- Validate SyncPolicy permits `LVC_TO_EXTERNAL` or `TWO_WAY`
- Resolve field authority via `SyncFieldAuthority`
- Push to ServiceTitan API (when policy permits)

**Note:** ServiceTitan's appointment API may not support outbound creation/updates. This needs verification before implementation.

---

## 9. Schema Gaps or Decisions Required Before Implementation

### No Schema Gaps
The Appointment entity is already fully schema-defined with all necessary ST sync fields, conflict tracking, technician mapping, and sync metadata. No schema changes are needed for Stage 2D.

### Decisions Required

1. **Event type naming:** Will appointment events follow the `appointment.created`, `appointment.updated`, `appointment.canceled`, `appointment.completed`, `appointment.assigned` pattern? (Recommended — consistent with Customer/Job.)

2. **Deleted/restored events:** Appointments are typically canceled, not deleted. Should `appointment.deleted` / `appointment.restored` event types be registered, or is `appointment.canceled` sufficient? (Decision needed — Job has deleted/restored; Customer does not.)

3. **Outbound capability:** Does the ServiceTitan JPM v2 API support outbound appointment creation/updates? If not, the outbound subscriber should be a no-op or not registered. (Requires API verification.)

4. **Watermark activation:** The `AppointmentSyncWatermark` entity already exists with full metric fields. Should the watermark be activated as part of Stage 2D, or kept as webhook-only initially? (Recommendation: webhook-only initially, matching the Customer/Job pattern.)

5. **Validation suite scope:** How many test cases for `validateStage2DAppointment`? (Recommendation: 20 tests mirroring the Job suite, plus cross-entity tests with Customer and Job.)

6. **Shadow threshold:** Should `shadow_threshold` be set to 50 (matching Customer/Job)?

7. **SyncPolicy initial mode:** Should Appointment start with `EXTERNAL_TO_LVC` (matching Customer/Job production state)?

---

## 10. Summary

The Appointment infrastructure is **substantially complete** for Stage 2D:
- ✅ Entity schema is fully defined (no schema changes needed)
- ✅ Sync logic is fully implemented (`stAppointmentSync.ts`)
- ✅ Webhook handler exists (`appointmentHandler.ts`)
- ✅ Sync adapter skeleton exists (`appointmentAdapter.ts`)
- ✅ Sync config exists (`stAppointmentSyncConfig.ts`)
- ✅ Status mapping is centralized (`stAppointmentStatusMapping.ts`)
- ✅ Watermark entity exists (`AppointmentSyncWatermark`)
- ✅ Customer hydration is wired (`ensureCustomerForDependentRecord`)
- ✅ Technician mapping is implemented (`mapTechnician`)
- ✅ Date validation and timezone normalization are implemented
- ✅ Event ordering protection is implemented (`isStaleEvent`)
- ✅ Conflict history tracking is implemented

**What does NOT exist yet (to be implemented in Stage 2D):**
- ❌ Appointment event publisher (`appointmentEventPublisher.ts`) — bridges webhook events to BusinessEvents
- ❌ Appointment inbound subscriber (`appointmentInboundSubscriber.ts`) — `appointment.sync.inbound` handler
- ❌ Appointment outbound subscriber (`appointmentOutboundSubscriber.ts`) — `appointment.sync.outbound` handler
- ❌ Appointment subscriber registration (`appointmentSubscriberRegistration.ts`)
- ❌ EventRegistry entries for appointment event types
- ❌ EventSubscriber entries for appointment subscribers
- ❌ SyncMigrationState record for Appointment
- ❌ SyncPolicy record for Appointment
- ❌ `validateStage2DAppointment` validation function
- ❌ `validateStage2DAppointmentCrossEntity` cross-entity validation function (optional)

**Estimated effort:** Moderate — the sync logic already exists and is proven. The Stage 2D work is primarily event-engine wiring (publisher, subscribers, registration) and validation suite creation, following the established Stage 2B/2C patterns exactly.