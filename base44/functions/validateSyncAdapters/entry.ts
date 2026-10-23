import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Import all adapter files to force TypeScript compilation evaluation
import { appointmentAdapter } from "../../shared/stSync/adapters/appointmentAdapter.ts";
import { customerCompatibilityAdapter } from "../../shared/stSync/adapters/customerCompatibilityAdapter.ts";
import { jobAdapter } from "../../shared/stSync/adapters/jobAdapter.ts";
import type { ServiceTitanSyncAdapter } from "../../shared/stSync/stSyncAdapter.ts";
import {
  getString,
  parseTimestamp,
  isValidTimestamp,
  compareSourceVersions,
  isStaleEvent,
  detectChangedFields,
  appendConflictHistory,
  sortRecordsDeterministic,
  nextPageState,
  nextContinuationState,
} from "../../shared/stSync/stSyncUtils.ts";
import {
  normalizeAppointmentStatus,
  normalizeDispatchStatus,
} from "../../shared/stAppointmentStatusMapping.ts";
import {
  normalizeJobStatus,
} from "../../shared/stJobStatusMapping.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Reference all adapters to force TypeScript evaluation ──
    const apptAdapter: ServiceTitanSyncAdapter = appointmentAdapter;
    const custAdapter: ServiceTitanSyncAdapter = customerCompatibilityAdapter;
    const jbAdapter: ServiceTitanSyncAdapter = jobAdapter;

    // ── Reference shared utilities (prove they compile) ──
    const _testString = getString({ name: 'test' }, 'name');
    const _testTs = parseTimestamp('2026-01-01T00:00:00Z');
    const _testValid = isValidTimestamp('2026-01-01T00:00:00Z');
    const _testCompare = compareSourceVersions({
      incomingModifiedOn: '2026-01-01T00:00:00Z',
      localModifiedOn: '2025-01-01T00:00:00Z',
    });
    const _testStale = isStaleEvent(
      { servicetitan_last_event_at: '2026-01-01T00:00:00Z' },
      '2025-01-01T00:00:00Z'
    );
    const _testChanges = detectChangedFields(
      { name: 'old' },
      { name: 'new' },
      ['name']
    );
    const _testConflict = appendConflictHistory(
      { sync_conflict_history_json: '[]', name: 'old' },
      { name: 'new' },
      ['name'],
      { id: 'test', event_type: 'test' }
    );
    const _testSort = sortRecordsDeterministic(
      [{ id: '2', createdOn: '2026-01-02' }, { id: '1', createdOn: '2026-01-01' }],
      (r) => r.createdOn,
      (r) => r.id
    );
    const _testNextPage = nextPageState({ mode: 'page', page: 1, pageSize: 50 });
    const _testNextCont = nextContinuationState('token123');

    // ── Centralized status normalization service tests ──
    const _normScheduled = normalizeAppointmentStatus('Scheduled');
    const _normCancelled = normalizeAppointmentStatus('Cancelled');
    const _normCanceled = normalizeAppointmentStatus('Canceled');
    const _normWorking = normalizeAppointmentStatus('Working');
    const _normOnHold = normalizeAppointmentStatus('On Hold');
    const _normEmpty = normalizeAppointmentStatus('');
    const _normNull = normalizeAppointmentStatus(null);
    const _normUnsupported = normalizeAppointmentStatus('SomeFutureStatus');
    const _normDispatchStarted = normalizeDispatchStatus('In Progress');
    const _normDispatchUnsupported = normalizeDispatchStatus('SomeFutureStatus');
    const _normDispatchInvalid = normalizeDispatchStatus('   ');
    // ── Input-type safety (must not throw) ──
    const _normInProgress = normalizeAppointmentStatus('In Progress');
    const _normObjectInvalid = normalizeAppointmentStatus({ foo: 'bar' });
    const _normArrayInvalid = normalizeAppointmentStatus([1, 2, 3]);
    const _normNumberInvalid = normalizeAppointmentStatus(42);
    const _normBooleanInvalid = normalizeAppointmentStatus(true);
    // ── Adapter source inspection (no raw-status string matching) ──
    const _adapterMapRecordSrc = appointmentAdapter.mapRecord.toString();
    const _forbiddenStatusPatterns = [
      /\.includes\(["']cancel/,
      /\.includes\(["']complete/,
      /\.includes\(["']hold/,
      /\.includes\(["']working/,
      /\.includes\(["']in progress/,
      /\.includes\(["']dispatch/,
      /\.includes\(["']schedule/,
      /\.includes\(["']confirm/,
    ];
    const _adapterNoRawStatusMatching = !_forbiddenStatusPatterns.some((p) => p.test(_adapterMapRecordSrc));

    // ── Job status normalization tests ──
    const _normJobScheduled = normalizeJobStatus('Scheduled');
    const _normJobDispatched = normalizeJobStatus('Dispatched');
    const _normJobInProgress = normalizeJobStatus('InProgress');
    const _normJobHold = normalizeJobStatus('Hold');
    const _normJobCompleted = normalizeJobStatus('Completed');
    const _normJobCanceled = normalizeJobStatus('Canceled');
    const _normJobEmpty = normalizeJobStatus('');
    const _normJobNull = normalizeJobStatus(null);
    const _normJobUnsupported = normalizeJobStatus('SomeFutureStatus');

    // ── Mock context for pagination mode checks (no API calls) ──
    const exportContext = {
      base44: null,
      tenantId: 'validation',
      environment: 'integration',
      watermark: null,
      batchId: 'validation',
      source: 'manual' as const,
    };
    const recoveryContext = {
      base44: null,
      tenantId: 'validation',
      environment: 'integration',
      watermark: null,
      batchId: 'validation',
      source: 'api_recovery' as const,
    };

    return Response.json({
      validated: true,
      appointment_adapter: {
        domain: apptAdapter.domain,
        integration_name: apptAdapter.integrationName,
        pagination_mode: apptAdapter.getInitialPaginationState(exportContext).mode,
        endpoint: apptAdapter.getEndpoint(exportContext),
        has_verify_dependencies: typeof apptAdapter.verifyDependencies === 'function',
        has_check_eligibility: typeof apptAdapter.checkEligibility === 'function',
        has_post_batch_process: typeof apptAdapter.postBatchProcess === 'function',
        create_wired: apptAdapter.createRecord.toString().includes("syncAppointmentCreated"),
        update_wired: apptAdapter.updateRecord.toString().includes("syncAppointmentCreated"),
      },
      job_adapter: {
        domain: jbAdapter.domain,
        integration_name: jbAdapter.integrationName,
        pagination_mode: jbAdapter.getInitialPaginationState(exportContext).mode,
        endpoint: jbAdapter.getEndpoint(exportContext),
        has_verify_dependencies: typeof jbAdapter.verifyDependencies === 'function',
        has_check_eligibility: typeof jbAdapter.checkEligibility === 'function',
        has_post_batch_process: typeof jbAdapter.postBatchProcess === 'function',
        create_wired: jbAdapter.createRecord.toString().includes("syncJobCreated"),
        update_wired: jbAdapter.updateRecord.toString().includes("syncJobUpdated"),
      },
      customer_adapter: {
        domain: custAdapter.domain,
        integration_name: custAdapter.integrationName,
        export_pagination_mode: custAdapter.getInitialPaginationState(exportContext).mode,
        recovery_pagination_mode: custAdapter.getInitialPaginationState(recoveryContext).mode,
        export_endpoint: custAdapter.getEndpoint(exportContext),
        recovery_endpoint: custAdapter.getEndpoint(recoveryContext),
        has_check_eligibility: typeof custAdapter.checkEligibility === 'function',
        has_post_batch_process: typeof custAdapter.postBatchProcess === 'function',
        has_verify_dependencies: typeof custAdapter.verifyDependencies === 'function',
      },
      shared_utilities_compiled: {
        getString: typeof getString,
        parseTimestamp: typeof parseTimestamp,
        isValidTimestamp: typeof isValidTimestamp,
        compareSourceVersions: typeof compareSourceVersions,
        isStaleEvent: typeof isStaleEvent,
        detectChangedFields: typeof detectChangedFields,
        appendConflictHistory: typeof appendConflictHistory,
        sortRecordsDeterministic: typeof sortRecordsDeterministic,
        nextPageState: typeof nextPageState,
        nextContinuationState: typeof nextContinuationState,
      },
      utility_test_results: {
        getString: _testString,
        compareSourceVersions: _testCompare,
        staleEvent: _testStale,
        changedFields: _testChanges,
        sortedIds: _testSort.map((r) => r.id),
      },
      status_normalization_tests: {
        // ── mapped ──
        scheduled_mapped: _normScheduled.mappingResult === 'mapped' && _normScheduled.normalizedStatus === 'scheduled',
        cancelled_mapped: _normCancelled.mappingResult === 'mapped' && _normCancelled.normalizedStatus === 'cancelled',
        canceled_maps_to_cancelled: _normCanceled.normalizedStatus === 'cancelled',
        working_maps_to_started: _normWorking.normalizedStatus === 'started',
        on_hold_mapped: _normOnHold.mappingResult === 'mapped' && _normOnHold.normalizedStatus === 'on_hold',
        dispatch_started_mapped: _normDispatchStarted.mappingResult === 'mapped' && _normDispatchStarted.normalizedDispatchStatus === 'started',
        // ── unsupported (well-formed, no mapping) ──
        unsupported_returns_null: _normUnsupported.mappingResult === 'unsupported' && _normUnsupported.normalizedStatus === null,
        unsupported_preserves_raw: _normUnsupported.rawStatus === 'SomeFutureStatus',
        unsupported_has_reason: !!_normUnsupported.reason,
        dispatch_unsupported_null: _normDispatchUnsupported.mappingResult === 'unsupported' && _normDispatchUnsupported.normalizedDispatchStatus === null,
        // ── invalid (empty / missing / unusable) ──
        empty_is_invalid: _normEmpty.mappingResult === 'invalid' && _normEmpty.normalizedStatus === null,
        null_is_invalid: _normNull.mappingResult === 'invalid' && _normNull.normalizedStatus === null,
        whitespace_is_invalid: _normDispatchInvalid.mappingResult === 'invalid',
        // ── classification booleans (single authority) ──
        cancelled_is_cancellation: _normCancelled.isCancellation === true,
        completed_is_completion: normalizeAppointmentStatus('Completed').isCompletion === true,
        on_hold_is_hold: _normOnHold.isHold === true,
        scheduled_not_cancellation: _normScheduled.isCancellation === false,
        unsupported_no_false_classification: _normUnsupported.isCancellation === false && _normUnsupported.isCompletion === false && _normUnsupported.isHold === false,
        // ── In Progress maps to started ──
        in_progress_maps_to_started: _normInProgress.mappingResult === 'mapped' && _normInProgress.normalizedStatus === 'started',
        working_maps_to_started: _normWorking.mappingResult === 'mapped' && _normWorking.normalizedStatus === 'started',
        // ── input-type safety (invalid without throwing) ──
        object_is_invalid_no_throw: _normObjectInvalid.mappingResult === 'invalid' && _normObjectInvalid.normalizedStatus === null,
        array_is_invalid_no_throw: _normArrayInvalid.mappingResult === 'invalid' && _normArrayInvalid.normalizedStatus === null,
        number_is_invalid: _normNumberInvalid.mappingResult === 'invalid' && _normNumberInvalid.normalizedStatus === null,
        boolean_is_invalid: _normBooleanInvalid.mappingResult === 'invalid' && _normBooleanInvalid.normalizedStatus === null,
        object_classification_false: _normObjectInvalid.isCancellation === false && _normObjectInvalid.isCompletion === false && _normObjectInvalid.isHold === false,
        object_preserves_audit_raw: _normObjectInvalid.rawStatus.length > 0,
        // ── unsupported and invalid return null normalized statuses ──
        unsupported_null_both: _normUnsupported.normalizedStatus === null,
        invalid_null_both: _normEmpty.normalizedStatus === null && _normNull.normalizedStatus === null,
        // ── adapter contains no raw-status string matching ──
        adapter_no_raw_status_matching: _adapterNoRawStatusMatching,
        // ── no unknown lifecycle ──
        no_unknown_status_produced: _normUnsupported.normalizedStatus !== 'unknown' && _normObjectInvalid.normalizedStatus !== 'unknown',
      },
      job_status_normalization_tests: {
        scheduled_mapped: _normJobScheduled.mappingResult === 'mapped' && _normJobScheduled.normalizedStatus === 'scheduled',
        dispatched_mapped: _normJobDispatched.mappingResult === 'mapped' && _normJobDispatched.normalizedStatus === 'assigned',
        in_progress_mapped: _normJobInProgress.mappingResult === 'mapped' && _normJobInProgress.normalizedStatus === 'in_progress',
        hold_mapped_null_status: _normJobHold.mappingResult === 'mapped' && _normJobHold.normalizedStatus === null && _normJobHold.isOnHold === true,
        completed_mapped: _normJobCompleted.mappingResult === 'mapped' && _normJobCompleted.normalizedStatus === 'completed' && _normJobCompleted.isCompleted === true,
        canceled_mapped: _normJobCanceled.mappingResult === 'mapped' && _normJobCanceled.normalizedStatus === 'cancelled' && _normJobCanceled.isCancelled === true,
        unsupported_returns_null: _normJobUnsupported.mappingResult === 'unsupported' && _normJobUnsupported.normalizedStatus === null,
        empty_is_invalid: _normJobEmpty.mappingResult === 'invalid' && _normJobEmpty.normalizedStatus === null,
        null_is_invalid: _normJobNull.mappingResult === 'invalid' && _normJobNull.normalizedStatus === null,
        no_unknown_status: _normJobUnsupported.normalizedStatus !== 'unknown' && _normJobEmpty.normalizedStatus !== 'unknown',
        raw_preserved: _normJobScheduled.rawStatus === 'Scheduled' && _normJobUnsupported.rawStatus === 'SomeFutureStatus',
      },
      zero_writes: true,
      zero_api_calls: true,
      zero_watermark_changes: true,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});