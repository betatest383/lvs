import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * casRaceRun — primitive-only CAS race test for the Base44 updateMany
 * compare-and-set claim.
 *
 * Each invocation:
 *   1. Creates a FRESH isolated lock-test AppointmentWorkflow with
 *      decision_lock_owner = '' (known available state).
 *   2. Fires N contender updateMany calls CONCURRENTLY via Promise.all
 *      (genuine concurrency — 20 fetches in flight at once, not a loop).
 *   3. Each contender executes the EXACT proposed primitive:
 *        base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
 *          { id: wfId, decision_lock_owner: '' },            // expected value IN filter
 *          { $set: { decision_lock_owner: token, ... } }
 *        )
 *      variant 'no_expected_value' (control) drops decision_lock_owner
 *      from the filter.
 *   4. Persists ONE append-only LockAcquisitionTestResult per contender
 *      with the raw result, updated count, belief, and the final lock row.
 *   5. Returns per-contender + winner count.
 *
 * The primitive is GENUINE CAS only if, across a run, exactly one
 * contender receives updated === 1.
 */
export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let user;
  try { user = await base44.auth.me(); } catch { return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }); }
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* allow defaults */ }
  const contenders = Math.min(Math.max(Number(body.contenders) || 20, 2), 50);
  const variant = body.variant === 'no_expected_value' ? 'no_expected_value' : 'cas';

  const runId = `CASRUN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const userEmail = user.email || user.id || '';

  // 1. Fresh isolated lock-test workflow (known available state)
  const wf = await base44.asServiceRole.entities.AppointmentWorkflow.create({
    job_id: `locktest-${runId}`,
    customer_decision: 'pending',
    workflow_version: 'v2_package',
    workflow_revision_version: 0,
    decision_lock_owner: '',
    decision_lock_token: '',
    decision_lock_generation: 0,
  }).catch((e: any) => { throw new Error(`create workflow failed: ${e?.message || e}`); });
  const wfId = wf.id;
  const startAll = new Date().toISOString();

  // 2. Build contender descriptors (different worker/token/request)
  const contenderDefs = Array.from({ length: contenders }, (_, i) => ({
    contender_number: i + 1,
    worker_id: `worker-${runId}-${i}`,
    request_id: `req-${runId}-${i}`,
    token: `lk-${runId}-${i}-${Math.random().toString(36).slice(2, 10)}`,
    expected_generation: 1,
    start: new Date().toISOString(),
  }));

  // 3. Fire ALL concurrently (Promise.all — not a serialized loop)
  const outcomes = await Promise.all(contenderDefs.map(async (c) => {
    const t0 = Date.now();
    let raw: any = null;
    let updated: number | null = null;
    let success: boolean | null = null;
    let hasMore: boolean | null = null;
    let error: string | null = null;
    let believed = false;
    try {
      const filter: any = variant === 'cas'
        ? { id: wfId, decision_lock_owner: '' }
        : { id: wfId };
      raw = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(filter, {
        $set: {
          decision_lock_owner: c.token,
          decision_lock_token: c.token,
          decision_lock_generation: c.expected_generation,
          decision_lock_acquired_at: new Date().toISOString(),
          decision_lock_expires_at: new Date(Date.now() + 30000).toISOString(),
          decision_lock_request_id: c.request_id,
        },
      });
      updated = typeof raw?.updated === 'number' ? raw.updated : null;
      success = !!raw?.success;
      hasMore = !!raw?.has_more;
      believed = updated === 1;
    } catch (e: any) {
      error = String(e?.message || e);
    }
    return {
      ...c,
      raw,
      updated,
      success,
      hasMore,
      believed,
      error,
      finish: new Date().toISOString(),
      elapsed: Date.now() - t0,
    };
  }));

  // 4. Re-read the final lock row (what actually persisted)
  const finalWf = await base44.asServiceRole.entities.AppointmentWorkflow.get(wfId).catch((e: any) => ({ _err: String(e) }));
  const finalOwner = (finalWf as any)?.decision_lock_owner ?? null;
  const finalGen = Number((finalWf as any)?.decision_lock_generation ?? 0);
  const finalToken = (finalWf as any)?.decision_lock_token ?? null;

  // 5. Persist one append-only evidence record per contender
  await Promise.all(outcomes.map((r) =>
    base44.entities.LockAcquisitionTestResult.create({
      test_run_id: runId,
      variant,
      contender_number: r.contender_number,
      worker_id: r.worker_id,
      request_id: r.request_id,
      workflow_id: wfId,
      proposed_lock_token: r.token,
      expected_lock_generation: r.expected_generation,
      start_timestamp: r.start,
      finish_timestamp: r.finish,
      raw_update_many_result: JSON.stringify(r.raw ?? { error: r.error }),
      updated_count: r.updated === null ? -1 : r.updated,
      result_success: r.success,
      result_has_more: r.hasMore,
      believed_won: r.believed,
      entered_protected_section: r.believed,
      final_lock_owner_observed: finalOwner,
      final_lock_generation_observed: finalGen,
      final_lock_token_observed: finalToken,
      error: r.error,
    }).catch((e: any) => ({ _persistError: String(e), contender: r.contender_number })),
  ));

  const winners = outcomes.filter((r) => r.believed);
  const winnersCount = winners.length;
  const updatedValues = outcomes.map((r) => r.updated);

  return Response.json({
    ok: true,
    run_id: runId,
    variant,
    workflow_id: wfId,
    contenders,
    start_all: startAll,
    winners_count: winnersCount,
    winner_contenders: winners.map((r) => r.contender_number),
    final_lock_owner: finalOwner,
    final_lock_generation: finalGen,
    final_lock_token: finalToken,
    updated_values: updatedValues,
    per_contender: outcomes.map((r) => ({
      n: r.contender_number,
      updated: r.updated,
      believed: r.believed,
      token: r.token,
      elapsed_ms: r.elapsed,
      error: r.error,
    })),
  });
}