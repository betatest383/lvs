/**
 * Workflow Action Tracer
 * Provides structured trace logging for workflow stage transitions.
 * Each trace gets a unique trace_id that follows the action from click to navigation.
 */

let traceCounter = 0;

export function startWorkflowTrace(jobId, stageKey, actionLabel) {
  const traceId = `wf-${Date.now()}-${traceCounter++}`;
  const trace = {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    job_id: jobId,
    stage_before: stageKey,
    action_clicked: actionLabel,
    steps: [],
  };
  console.log(`[WorkflowTrace] ═══════════════════════════════════════════════`);
  console.log(`[WorkflowTrace] TRACE START — id: ${traceId}`);
  console.log(`[WorkflowTrace]   job_id:        ${jobId}`);
  console.log(`[WorkflowTrace]   stage_before:  ${stageKey}`);
  console.log(`[WorkflowTrace]   action:        ${actionLabel}`);
  console.log(`[WorkflowTrace]   timestamp:    ${trace.timestamp}`);
  return trace;
}

export function traceStep(trace, label, data = {}) {
  if (!trace) return;
  const step = {
    step: trace.steps.length + 1,
    label,
    timestamp: new Date().toISOString(),
    ...data,
  };
  trace.steps.push(step);
  console.log(`[WorkflowTrace] [${trace.trace_id}] step ${step.step}: ${label}`, data);
}

export function endWorkflowTrace(trace, summary) {
  if (!trace) return;
  trace.summary = summary;
  trace.completed_at = new Date().toISOString();
  console.log(`[WorkflowTrace] [${trace.trace_id}] RESULT: ${summary}`);
  console.log(`[WorkflowTrace] ═══════════════════════════════════════════════`);
}

/**
 * Logs all records found for a given entity+filter, identifying duplicates.
 */
export function logDuplicateCheck(entityName, filterLabel, records) {
  if (!records || records.length === 0) {
    console.log(`[DuplicateCheck] ${entityName} (${filterLabel}): 0 records found`);
    return null;
  }
  console.log(`[DuplicateCheck] ${entityName} (${filterLabel}): ${records.length} record(s) found`);
  records.forEach((r, i) => {
    console.log(`[DuplicateCheck]   [${i}] id=${r.id} status=${r.status || 'N/A'} created=${r.created_date || 'N/A'} updated=${r.updated_date || 'N/A'}`);
  });
  if (records.length > 1) {
    console.warn(`[DuplicateCheck] ⚠️ DUPLICATE DETECTED — ${records.length} ${entityName} records for ${filterLabel}`);
  }
  return records.length;
}

/**
 * Verifies a persisted record after save by re-reading from DB.
 */
export async function verifyPersistedCompletion(entityName, recordId, expectedFields, getter) {
  console.log(`[PersistVerify] Re-reading ${entityName} id=${recordId} from database...`);
  try {
    const fresh = await getter(recordId);
    if (!fresh) {
      console.error(`[PersistVerify] ❌ Record NOT FOUND after save!`);
      return { verified: false, reason: 'record_not_found' };
    }
    let allVerified = true;
    const results = {};
    for (const [field, expectedValue] of Object.entries(expectedFields)) {
      const persistedValue = fresh[field];
      const matches = String(persistedValue) === String(expectedValue);
      results[field] = {
        expected: expectedValue,
        persisted: persistedValue,
        verified: matches,
      };
      if (!matches) {
        allVerified = false;
        console.error(`[PersistVerify] ❌ Field "${field}": expected="${expectedValue}" persisted="${persistedValue}"`);
      }
    }
    if (allVerified) {
      console.log(`[PersistVerify] ✅ All completion fields verified in database`);
    }
    return { verified: allVerified, freshRecord: fresh, results };
  } catch (e) {
    console.error(`[PersistVerify] ❌ Re-read failed:`, e.message);
    return { verified: false, reason: e.message };
  }
}