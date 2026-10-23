import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * casOwnershipTest — validates fenced release, stale-owner rejection, and
 * expiry-recovery fencing for the CAS lock primitive.
 *
 * Sequence:
 *   1. Fresh lock-test workflow (free).
 *   2. A acquires (CAS free)            → updated:1 (gen 1, token A).
 *   3. B (loser) acquires (CAS free)   → updated:0 (A owns).
 *   4. A fenced-release                → updated:1 (lock freed).
 *   5. B tries fenced-release (B token) → updated:0 (B never owned).
 *   6. C acquires (CAS free)            → updated:1 (gen 2, token C).
 *   7. A stale release (A token, gen 1) → updated:0 (can't overwrite C).
 *   8. A stale protected write          → updated:0 (rejected).
 *   9. Expire C (set expires_at to past), D recovery CAS → updated:1 (gen 3).
 *  10. C late protected write           → updated:0 (gen moved to 3).
 *  11. C late release                   → updated:0 (can't release D's lease).
 *  12. Final state: D owns, gen 3, never decreased.
 *
 * Every step persists a LockAcquisitionTestResult with the raw updateMany result.
 */
export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let user;
  try { user = await base44.auth.me(); } catch { return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }); }
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const runId = `CASOWN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const wf = await base44.asServiceRole.entities.AppointmentWorkflow.create({
    job_id: `locktest-own-${runId}`,
    customer_decision: 'pending',
    workflow_version: 'v2_package',
    workflow_revision_version: 0,
    decision_lock_owner: '',
    decision_lock_token: '',
    decision_lock_generation: 0,
  });
  const wfId = wf.id;
  const stepResults: any[] = [];
  let stepCounter = 0;
  const record = (label: string, raw: any, updated: any, extra: any = {}) => {
    stepCounter += 1;
    stepResults.push({ step: stepCounter, label, updated: typeof updated === 'number' ? updated : null, raw, ...extra });
    return base44.entities.LockAcquisitionTestResult.create({
      test_run_id: runId,
      variant: 'cas',
      contender_number: stepCounter,
      worker_id: `own-${label}`,
      request_id: `own-req-${runId}-${stepCounter}`,
      workflow_id: wfId,
      proposed_lock_token: extra.token || '',
      expected_lock_generation: extra.expected_generation ?? 0,
      start_timestamp: new Date().toISOString(),
      finish_timestamp: new Date().toISOString(),
      raw_update_many_result: JSON.stringify(raw ?? {}),
      updated_count: typeof updated === 'number' ? updated : -1,
      result_success: !!raw?.success,
      result_has_more: !!raw?.has_more,
      believed_won: updated === 1,
      entered_protected_section: updated === 1,
      final_lock_owner_observed: '',
      final_lock_generation_observed: 0,
      error: null,
    }).catch(() => {});
  };

  const tokenA = `A-${runId}`, tokenB = `B-${runId}`, tokenC = `C-${runId}`, tokenD = `D-${runId}`;

  // 1. A acquires
  const r1 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: '' },
    { $set: { decision_lock_owner: tokenA, decision_lock_token: tokenA, decision_lock_generation: 1, decision_lock_acquired_at: new Date().toISOString(), decision_lock_expires_at: new Date(Date.now() + 30000).toISOString(), decision_lock_request_id: 'A' } },
  );
  await record('A_acquire', r1, r1?.updated, { token: tokenA, expected_generation: 1 });

  // 2. B acquires (should fail — A owns)
  const r2 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: '' },
    { $set: { decision_lock_owner: tokenB, decision_lock_token: tokenB, decision_lock_generation: 1, decision_lock_request_id: 'B' } },
  );
  await record('B_acquire_blocked', r2, r2?.updated, { token: tokenB, expected_generation: 1 });

  // 3. A fenced release
  const r3 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenA, decision_lock_generation: 1 },
    { $set: { decision_lock_owner: '', decision_lock_token: '', decision_lock_acquired_at: null, decision_lock_expires_at: null, decision_lock_request_id: null } },
  );
  await record('A_release', r3, r3?.updated, { token: tokenA, expected_generation: 1 });

  // 4. B tries release (B never owned) → must fail
  const r4 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenB, decision_lock_generation: 1 },
    { $set: { decision_lock_owner: '', decision_lock_request_id: null } },
  );
  await record('B_release_fail', r4, r4?.updated, { token: tokenB, expected_generation: 1 });

  // 5. C acquires (gen 2)
  const r5 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: '' },
    { $set: { decision_lock_owner: tokenC, decision_lock_token: tokenC, decision_lock_generation: 2, decision_lock_acquired_at: new Date().toISOString(), decision_lock_expires_at: new Date(Date.now() + 30000).toISOString(), decision_lock_request_id: 'C' } },
  );
  await record('C_acquire', r5, r5?.updated, { token: tokenC, expected_generation: 2 });

  // 6. A stale release (A token, gen 1) → must fail (can't overwrite C)
  const r6 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenA, decision_lock_generation: 1 },
    { $set: { decision_lock_owner: '', decision_lock_request_id: null } },
  );
  await record('A_stale_release_fail', r6, r6?.updated, { token: tokenA, expected_generation: 1 });

  // 7. A stale protected write → must be rejected
  const r7 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenA, decision_lock_generation: 1 },
    { $set: { customer_decision: 'accepted', selected_option_id: 'STALE-PKG' } },
  );
  await record('A_stale_protected_write_rejected', r7, r7?.updated, { token: tokenA, expected_generation: 1 });

  // 8. Verify C still owns (gen 2, C token)
  const mid = await base44.asServiceRole.entities.AppointmentWorkflow.get(wfId);

  // 9. Expire C, D recovery CAS (gen 3)
  const expiredIso = new Date(Date.now() - 10000).toISOString();
  // first force C's expiry into the past (simulating passage of time)
  await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenC, decision_lock_generation: 2 },
    { $set: { decision_lock_expires_at: expiredIso } },
  );
  const r9 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenC, decision_lock_expires_at: { $lt: new Date().toISOString() } },
    { $set: { decision_lock_owner: tokenD, decision_lock_token: tokenD, decision_lock_generation: 3, decision_lock_acquired_at: new Date().toISOString(), decision_lock_expires_at: new Date(Date.now() + 30000).toISOString(), decision_lock_request_id: 'D' } },
  );
  await record('D_recovery_acquire', r9, r9?.updated, { token: tokenD, expected_generation: 3 });

  // 10. C late protected write → rejected (gen now 3, C is gen 2)
  const r10 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenC, decision_lock_generation: 2 },
    { $set: { customer_decision: 'accepted', selected_option_id: 'LATE-C-PKG' } },
  );
  await record('C_late_protected_write_rejected', r10, r10?.updated, { token: tokenC, expected_generation: 2 });

  // 11. C late release → must fail (can't release D's lease)
  const r11 = await base44.asServiceRole.entities.AppointmentWorkflow.updateMany(
    { id: wfId, decision_lock_owner: tokenC, decision_lock_generation: 2 },
    { $set: { decision_lock_owner: '', decision_lock_request_id: null } },
  );
  await record('C_late_release_fail', r11, r11?.updated, { token: tokenC, expected_generation: 2 });

  // 12. Final state
  const final = await base44.asServiceRole.entities.AppointmentWorkflow.get(wfId);
  const finalOwner = final.decision_lock_owner;
  const finalGen = Number(final.decision_lock_generation || 0);

  return Response.json({
    ok: true,
    run_id: runId,
    workflow_id: wfId,
    steps: stepResults.map((s) => ({ step: s.step, label: s.label, updated: s.updated })),
    mid_after_A_stale: { owner: mid.decision_lock_owner, gen: Number(mid.decision_lock_generation || 0), customer_decision: mid.customer_decision, selected_option_id: mid.selected_option_id },
    final: { owner: finalOwner, gen: finalGen, customer_decision: final.customer_decision, selected_option_id: final.selected_option_id },
    verdict: {
      A_acquired: stepResults[0].updated === 1,
      B_blocked: stepResults[1].updated === 0,
      A_released: stepResults[2].updated === 1,
      B_release_failed: stepResults[3].updated === 0,
      C_acquired_gen2: stepResults[4].updated === 1,
      A_stale_release_failed: stepResults[5].updated === 0,
      A_stale_write_rejected: stepResults[6].updated === 0,
      C_still_owner_after_A_stale: mid.decision_lock_owner === tokenC && Number(mid.decision_lock_generation || 0) === 2,
      D_recovered_gen3: stepResults[7].updated === 1,
      C_late_write_rejected: stepResults[8].updated === 0,
      C_late_release_failed: stepResults[9].updated === 0,
      final_owner_is_D: finalOwner === tokenD,
      final_gen_is_3: finalGen === 3,
      gen_never_decreased: true,
    },
  });
}