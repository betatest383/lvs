/**
 * Generic Sync Lock Management
 *
 * Extracted from stCustomerApiSync.ts to serve all sync domains.
 * Provides acquire / verify / release with ownership protection.
 *
 * Any cursor entity with lock_id + lock_expires_at fields can use this.
 */

import type { LockableCursor, LockConfig } from "./stSyncTypes.ts";

/**
 * Check if a cursor's lock is expired or absent.
 */
export function isLockExpired(cursor: LockableCursor): boolean {
  if (!cursor.lock_expires_at) return true;
  const expiresAt = new Date(cursor.lock_expires_at).getTime();
  if (isNaN(expiresAt)) return true;
  return Date.now() > expiresAt;
}

/**
 * Attempt to acquire a lock on a cursor.
 * Returns the lock ID if successful, null if another worker holds the lock.
 */
export async function acquireLock(
  base44: any,
  config: LockConfig,
  cursor: LockableCursor
): Promise<string | null> {
  if (!isLockExpired(cursor)) {
    return null;
  }

  const lockId = `LOCK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  const lockExpiresAt = new Date(Date.now() + config.lockDurationMinutes * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  try {
    await base44.asServiceRole.entities[config.entityName].update(cursor.id, {
      lock_id: lockId,
      lock_expires_at: lockExpiresAt,
      status: "running",
      last_attempt_at: now,
    });
    return lockId;
  } catch (err) {
    console.error(`[ST SYNC LOCK] Acquisition failed (${config.entityName}):`, err);
    return null;
  }
}

/**
 * Verify that the current worker still owns the lock.
 * Only the lock owner may update the cursor or release the lock.
 */
export async function verifyLockOwnership(
  base44: any,
  config: LockConfig,
  cursorId: string,
  lockId: string
): Promise<boolean> {
  try {
    const fresh = await base44.asServiceRole.entities[config.entityName].get(cursorId);
    if (!fresh) return false;
    if (fresh.lock_id !== lockId) {
      console.warn(`[ST SYNC LOCK] Ownership lost. Expected '${lockId}', found '${fresh.lock_id}'.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[ST SYNC LOCK] Ownership check failed (${config.entityName}):`, err);
    return false;
  }
}

/**
 * Release the lock and update cursor state.
 * Verifies lock ownership before updating. Stale workers are rejected.
 */
export async function releaseLock(
  base44: any,
  config: LockConfig,
  cursorId: string,
  lockId: string,
  updates: Record<string, any>,
  success: boolean
): Promise<void> {
  const ownsLock = await verifyLockOwnership(base44, config, cursorId, lockId);
  if (!ownsLock) {
    console.warn(`[ST SYNC LOCK] Stale worker attempted to release lock '${lockId}' — rejected.`);
    return;
  }

  const now = new Date().toISOString();
  const finalUpdates: Record<string, any> = {
    ...updates,
    lock_id: "",
    lock_expires_at: null,
    status: success ? "idle" : "failed",
    last_attempt_at: now,
  };

  if (success) {
    finalUpdates.last_successful_sync_at = now;
    finalUpdates.consecutive_failures = 0;
    finalUpdates.last_error = "";
  } else {
    finalUpdates.consecutive_failures = (updates.consecutive_failures || 0) + 1;
  }

  try {
    await base44.asServiceRole.entities[config.entityName].update(cursorId, finalUpdates);
  } catch (err) {
    console.error(`[ST SYNC LOCK] Release failed (${config.entityName}):`, err);
  }
}

/**
 * Get or create a sync cursor for a given (integration, domain, tenant, environment).
 */
export async function getOrCreateCursor(
  base44: any,
  config: LockConfig,
  integrationName: string,
  domain: string,
  tenantId: string,
  environment: string
): Promise<any> {
  const existing = await base44.asServiceRole.entities[config.entityName].filter(
    {
      integration_name: integrationName,
      domain,
      tenant_id: tenantId,
      environment,
    },
    "-created_date",
    1
  );

  if (existing && existing.length > 0) {
    return existing[0];
  }

  return await base44.asServiceRole.entities[config.entityName].create({
    integration_name: integrationName,
    domain,
    tenant_id: tenantId,
    environment,
    continuation_token: "",
    status: "idle",
    mode: "incremental",
    records_processed: 0,
    total_records_synced: 0,
    consecutive_failures: 0,
  });
}