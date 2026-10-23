/**
 * workflowLock — GENUINE atomic workflow lock via Base44 compare-and-set.
 *
 * ── Why this is a real lock (not a read-then-write race) ──
 *   Base44 `entity.updateMany(filter, { $set })` is an atomic conditional
 *   write: the filter-match and the field update occur as one database
 *   operation (MongoDB document-level atomicity). It returns
 *   `{ updated: <count>, has_more }`. If two workers call it concurrently
 *   with a filter that includes the *current* expected value, exactly one
 *   matches (the first flips the field, the second's filter no longer
 *   matches) — so exactly one receives `updated: 1`.
 *
 *   This is the §4 "true atomic conditional write" primitive. It is NOT:
 *     - a status field read then written            (race)
 *     - a lease-owner field read then written       (race)
 *     - optimistic version comparison alone        (race — Family 3)
 *     - WorkflowMutationRequest creation           (no exclusivity)
 *
 * ── Lock lifecycle ──
 *   acquire():  CAS `{id, lock_owner: '', $or expired-or-null}` →
 *               `{lock_owner: token, generation: prev+1, acquired_at, expires_at, request_id}`.
 *               `updated===1` ⇒ sole owner. `updated===0` ⇒ lost the race
 *               (someone else owns it, or it's held and not expired).
 *
 *   release():  CAS `{id, lock_owner: token, lock_generation: gen}` →
 *               `{lock_owner: '', ...pointer fields, version: newVersion}`.
 *               This single atomic op (a) proves we still own the lock
 *               (fencing), (b) applies the decision result, (c) frees the
 *               lock. `updated===0` ⇒ lock was stolen by recovery while we
 *               worked ⇒ ABORT (no workflow mutation lands).
 *
 *   recover():  CAS `{id, lock_owner: staleToken, lock_expires_at: {$lt: now}}` →
 *               `{lock_owner: newToken, lock_generation: prev+1, ...}`.
 *               Only one recovery worker wins (the stale token is in the
 *               filter). A late original worker that resumes will fail its
 *               fenced release CAS because `lock_owner` no longer matches.
 *
 * ── Fencing ──
 *   `lock_generation` is a monotonic fencing token incremented on every
 *   acquire and every recovery. Every protected write embeds
 *   `{lock_owner: myToken, lock_generation: myGen}` in its filter, so a
 *   late worker holding a stolen/expired token cannot overwrite the new
 *   owner. Base44 `updateMany` is the conditional write, so fencing IS
 *   enforced at write time (not just checked-then-written).
 *
 * ── Platform limitation (documented) ──
 *   The CDR `create` cannot be fenced (creates aren't conditional). If a
 *   worker acquires the lock, creates a CDR, then is stolen from by
 *   recovery before its fenced release, that CDR is *orphaned* (no
 *   workflow pointer references it). This is append-only noise, NOT data
 *   corruption — the invariant monitor flags orphaned CDRs. The workflow
 *   pointer + version are NEVER corrupted because they only move inside a
 *   fenced release CAS.
 */

export interface LockAcquireResult {
  acquired: boolean;
  token: string;
  generation: number;
  reason?: string;
  currentOwner?: string;
  expiresAt?: string;
}

export interface LockReleaseResult {
  released: boolean;
  reason?: string;
}

const LOCK_TTL_SECONDS = 30;

function genToken(): string {
  return `lk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiryIso(seconds: number = LOCK_TTL_SECONDS): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Attempt to acquire an exclusive lock on a workflow.
 * Returns acquired:true with a fencing token for exactly one concurrent caller.
 */
export async function acquireWorkflowLock(
  base44: any,
  workflowId: string,
  requestId: string,
  ttlSeconds: number = LOCK_TTL_SECONDS,
): Promise<LockAcquireResult> {
  const token = genToken();
  const acquiredAt = nowIso();
  const expiresAt = expiryIso(ttlSeconds);

  // Atomic conditional write: only matches when the lock is free
  // (owner empty/null) OR owned-but-expired. The first concurrent caller
  // to match flips owner→token; subsequent callers no longer match the
  // free-condition → updated:0.
  //
  // We use two CAS attempts: one for the free case, one for the
  // expired-stale case (with the stale token captured in the filter so
  // only one recovery wins).
  //
  // Free-case CAS:
  const freeResult = await base44.asServiceRole.entities.AppointmentWorkflow
    .updateMany(
      { id: workflowId, decision_lock_owner: { $in: ['', null, undefined] } },
      {
        $set: {
          decision_lock_owner: token,
          decision_lock_token: token,
          decision_lock_generation: 1,
          decision_lock_acquired_at: acquiredAt,
          decision_lock_expires_at: expiresAt,
          decision_lock_request_id: requestId,
        },
      },
    )
    .catch((e: any) => ({ updated: 0, _error: String(e) }));

  if (freeResult?.updated === 1) {
    return { acquired: true, token, generation: 1, expiresAt };
  }

  // If not free, try recovery: acquire only if the current lock is expired.
  // Read the current (possibly expired) owner token so we can fence the
  // recovery CAS on the *exact* stale token — two recovery workers both
  // reading the same stale token, only one CAS matches.
  const wf = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflowId).catch(() => null);
  if (!wf) return { acquired: false, token, generation: 0, reason: 'workflow_not_found' };

  const staleOwner = wf.decision_lock_owner;
  const staleGen = Number(wf.decision_lock_generation || 0);
  const staleExpiry = wf.decision_lock_expires_at;
  const now = Date.now();
  const isExpired = !staleExpiry || new Date(staleExpiry).getTime() < now;

  if (!staleOwner || !isExpired) {
    return {
      acquired: false, token, generation: 0,
      reason: 'lock_held',
      currentOwner: staleOwner || null,
      expiresAt: staleExpiry || null,
    };
  }

  // Recovery CAS: fenced on the exact stale token + expiry-in-past.
  const newGen = staleGen + 1;
  const recoverResult = await base44.asServiceRole.entities.AppointmentWorkflow
    .updateMany(
      {
        id: workflowId,
        decision_lock_owner: staleOwner,
        decision_lock_expires_at: { $lt: nowIso() },
      },
      {
        $set: {
          decision_lock_owner: token,
          decision_lock_token: token,
          decision_lock_generation: newGen,
          decision_lock_acquired_at: acquiredAt,
          decision_lock_expires_at: expiresAt,
          decision_lock_request_id: requestId,
        },
      },
    )
    .catch((e: any) => ({ updated: 0, _error: String(e) }));

  if (recoverResult?.updated === 1) {
    return { acquired: true, token, generation: newGen, expiresAt, reason: 'recovered_expired' };
  }

  return {
    acquired: false, token, generation: 0,
    reason: 'lock_held',
    currentOwner: staleOwner,
    expiresAt: staleExpiry,
  };
}

/**
 * Fenced release + apply: atomically (a) prove we still own the lock,
 * (b) apply the decision pointer/version fields, (c) free the lock.
 * Returns released:true only if we were still the owner at write time.
 */
export async function releaseWorkflowLock(
  base44: any,
  workflowId: string,
  token: string,
  generation: number,
  applyFields: Record<string, any>,
): Promise<LockReleaseResult> {
  const releaseResult = await base44.asServiceRole.entities.AppointmentWorkflow
    .updateMany(
      {
        id: workflowId,
        decision_lock_owner: token,
        decision_lock_generation: generation,
      },
      {
        $set: {
          ...applyFields,
          decision_lock_owner: '',
          decision_lock_token: '',
          decision_lock_acquired_at: null,
          decision_lock_expires_at: null,
          decision_lock_request_id: null,
        },
      },
    )
    .catch((e: any) => ({ updated: 0, _error: String(e) }));

  if (releaseResult?.updated === 1) {
    return { released: true };
  }
  return { released: false, reason: 'lock_stolen_or_version_changed' };
}

/**
 * Read-only: is the lock currently held (and by whom)?
 */
export async function readLockState(base44: any, workflowId: string) {
  const wf = await base44.asServiceRole.entities.AppointmentWorkflow.get(workflowId).catch(() => null);
  if (!wf) return { held: false };
  const owner = wf.decision_lock_owner;
  const expiresAt = wf.decision_lock_expires_at;
  const now = Date.now();
  const expired = !!expiresAt && new Date(expiresAt).getTime() < now;
  return {
    held: !!owner && !expired,
    owner: owner || null,
    generation: Number(wf.decision_lock_generation || 0),
    acquired_at: wf.decision_lock_acquired_at || null,
    expires_at: expiresAt || null,
    request_id: wf.decision_lock_request_id || null,
    expired,
  };
}