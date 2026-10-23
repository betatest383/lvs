# Stage 2D — Appointment Synchronization Evidence Report

## Checkpoint: CKP-000004 (Approved)
**Date:** 2026-07-22  
**Stage:** Stage 2D — Appointment Synchronization  
**Direction:** INBOUND-ONLY (ServiceTitan → LVC OS)  
**Mode:** Shadow (parallel sync, no cut-over)

---

## Executive Summary

Stage 2D Appointment Synchronization has been validated and approved in inbound-only shadow mode. The implementation uses real business logic with a strict relationship resolver, no test bypasses, and zero external ServiceTitan API writes. All 30 functional/cross-entity tests and 66 regression tests passed.

| Metric | Result |
|--------|--------|
| Functional tests | **30/30 passed** |
| Regression tests | **66/66 passed** |
| Security tests | **7/7 passed** |
| External ST writes | **0** |
| External ST reads | **0** |
| Ambiguous external attempts | **0** |

---

## Test Results

### Stage 2D Functional Suite (25 tests)
**Validation Run:** VR-mrwao1dv-ipwwicif

| # | Test | Result |
|---|------|--------|
| 1 | Create Appointment — linked to Job and Customer | ✅ |
| 2 | Duplicate create is idempotent | ✅ |
| 3 | Update modifies existing Appointment | ✅ |
| 4 | Reschedule modifies without duplication | ✅ |
| 5 | Cancel modifies existing Appointment | ✅ |
| 6 | Complete modifies existing Appointment | ✅ |
| 7 | Known technician assignment resolves correctly | ✅ |
| 8 | Multiple technicians — schema supports single lead | ✅ |
| 9 | Unknown technician — unmatched, no Employee created | ✅ |
| 10 | Inactive technician — unmatched (not matched to Inactive) | ✅ |
| 11 | Technician reassignment updates same Appointment | ✅ |
| 12 | Technician removal updates same Appointment | ✅ |
| 13 | Missing Job creates retryable deferral | ✅ |
| 14 | Same delivery succeeds after Job exists | ✅ |
| 15 | Missing Customer — Appointment still syncs with Job link | ✅ |
| 16 | Contradictory Customer/Job — fails safely | ✅ |
| 17 | Older event cannot overwrite newer state | ✅ |
| 18 | Cross-midnight Appointment preserves both dates | ✅ |
| 19 | Time-zone normalization — naive timestamp gets offset | ✅ |
| 20 | Invalid time range fails safely | ✅ |
| 21 | Repeated delivery (same idempotency key) creates one Appointment | ✅ |
| 22 | Inbound creates no outbound delivery | ✅ |
| 23 | Dead-letter replay succeeds + second replay rejected | ✅ |
| 25 | Persistence verification infrastructure — ValidationRun tracks failures | ✅ |
| 26 | Policy and migration state — EXTERNAL_TO_LVC + shadow preserved | ✅ |

### Stage 2D Cross-Entity Suite (5 tests)
**Validation Run:** VR-mrwaqfcu-1p7n24iu

| Scenario | Test | Result |
|----------|------|--------|
| A | Appointment before Job — deferred then created on replay | ✅ |
| B | Job exists but Customer mismatch — no duplicate Customer | ✅ |
| C | Technician unresolved — appointment syncs, later resolution updates same record | ✅ |
| D | Reschedule and stale event — newer schedule preserved, older ignored | ✅ |
| E | Inbound loop prevention — EXTERNAL_TO_LVC, no outbound, no duplicate | ✅ |

### Regression Gate

| Suite | Tests | Passed | Failed |
|-------|-------|--------|--------|
| Stage 2A Infrastructure | 28 + 7 security | 35 | 0 |
| Stage 2B-A Customer | 18 | 18 | 0 |
| Stage 2C Job | 20 | 20 | 0 |
| **Total** | **73** | **73** | **0** |

---

## Architecture

### Inbound-Only Policy
Stage 2D is strictly **inbound-only** (ServiceTitan → LVC OS). The following measures enforce this:

1. **Outbound files removed:** `appointmentOutboundApi.ts` and `appointmentOutboundSubscriber.ts` were deleted.
2. **Outbound subscriber unregistered:** `appointmentSubscriberRegistration.ts` explicitly disables/unregisters outbound handlers.
3. **API_PUSH unsupported:** The `IntegrationCapabilityRegistry` declares `API_PUSH` as `unsupported` for Appointment.
4. **Policy enforced:** SyncPolicy for Appointment:servicetitan is `EXTERNAL_TO_LVC`.
5. **Loop prevention:** The inbound subscriber ignores `lvc_os`-originated events; no outbound subscriber exists to create deliveries.

### Relationship Resolver
The `appointmentRelationshipResolver` enforces strict Job/Customer dependency chains before Appointment creation:

- **Resolved:** Both Job and Customer found locally → inject `_resolved_job_id` and `_resolved_customer_id` into payload → sync proceeds.
- **Deferred:** Job not found locally → retryable deferral (no Appointment created, delivery returns `failed` with `retryable: true`).
- **Contradiction:** Job found but its Customer doesn't match the payload's Customer → non-retryable error (no Appointment created).
- **Local DB only:** The resolver reads the local database exclusively — no ServiceTitan API calls.

### Key Collision Fix
A critical bug was identified and fixed during validation: the inbound subscriber injected local `customer_id` (Base44 entity ID) into the webhook payload using the key `customer_id`, which collided with `extractAppointmentData`'s ST customer ID extraction (`getString(payload, "customer_id", "servicetitan_customer_id")`). This caused the local ID to be treated as the ST customer ID, triggering unnecessary hydration attempts.

**Fix:** Non-colliding keys `_resolved_job_id` and `_resolved_customer_id` are now used for injected local IDs.

### Real Business Logic (No Test Bypass)
The `test_skip_sync` flag is **NOT used** for any primary functional test. The real `stAppointmentSync` functions (`syncAppointmentCreated`, `syncAppointmentUpdated`, `syncAppointmentCanceled`, `syncAppointmentCompleted`, `syncTechnicianAssignment`) always execute. `test_skip_sync` is retained only for narrowly defined infrastructure fault injection (e.g., persistence-mismatch detection), secured by `testHarnessGuard`.

---

## Key Fixes Applied

1. Removed unauthorized outbound files: `appointmentOutboundApi.ts` and `appointmentOutboundSubscriber.ts`.
2. Implemented `appointmentRelationshipResolver` for strict Job/Customer dependency enforcement.
3. Refactored `stAppointmentSync` to accept injected local relationship IDs via non-colliding `_resolved_job_id` and `_resolved_customer_id` keys.
4. Rewrote `appointmentInboundSubscriber` to use real business logic without `test_skip_sync` bypass.
5. Added `appointment.unassigned` event handling to the inbound subscriber.
6. Updated `appointmentSubscriberRegistration` to explicitly disable/unregister outbound handlers.
7. Updated `shadowMetricsService` to include Stage 2D outcome types.

---

## Files Included

| File | Purpose |
|------|---------|
| `base44/shared/stage2d/appointmentInboundSubscriber.ts` | Inbound subscriber handler (appointment.sync.inbound) |
| `base44/shared/stage2d/appointmentRelationshipResolver.ts` | Strict Job/Customer dependency resolution |
| `base44/shared/stage2d/appointmentEventPublisher.ts` | Event publishing with loop prevention |
| `base44/shared/stage2d/appointmentSubscriberRegistration.ts` | Subscriber registration (inbound only) |
| `base44/shared/stage2d/appointmentTestSetup.ts` | Test record creation and cleanup utilities |
| `base44/shared/stAppointmentSync.ts` | Core sync functions (modified: resolved ID keys) |
| `base44/shared/stage2b/shadowMetricsService.ts` | Shadow metrics (modified: Stage 2D outcomes) |
| `base44/functions/validateStage2DAppointment/entry.ts` | 25-test functional validation suite |
| `base44/functions/validateStage2DAppointmentCrossEntity/entry.ts` | 5-scenario cross-entity validation suite |

---

## Rollback Instructions

1. Restore `EXTERNAL_TO_LVC` sync mode for Appointment:servicetitan (already active).
2. Ensure `auto_cut_enabled = false` on SyncMigrationState (already active).
3. Delete or deactivate the `appointment.sync.inbound` subscriber.
4. Re-run `validateStage2DAppointment` and `validateStage2DAppointmentCrossEntity`.
5. Re-run regression gate: `validateStage2AInfrastructure`, `validateStage2BCustomer`, `validateStage2CJob`.

---

## Conclusion

Stage 2D Appointment Synchronization is **approved** in inbound-only shadow mode. The implementation enforces strict dependency chains, uses real business logic without test bypasses, and produces zero external ServiceTitan API writes. The full regression gate confirms no impact on Stage 2A–2C functionality.