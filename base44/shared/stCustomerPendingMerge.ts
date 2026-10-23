/**
 * ServiceTitan Customer Pending Merge Manager
 *
 * Handles deferred customer merges where the merge target customer hasn't
 * been synced locally yet. Instead of blocking the entire sync page,
 * the merge is recorded as a durable PendingMerge and retried after
 * subsequent pages and at the end of the sync cycle.
 *
 * Safeguards:
 *   - Source and target cannot be the same
 *   - Merge chains detected (A→B, B→C)
 *   - Merge cycles detected (A→B, B→A)
 *   - Idempotent retries (merge_key prevents duplicates)
 *
 * Transactional relinking:
 *   If ANY relink fails, the error propagates. The pending merge stays
 *   in 'failed' status with the error recorded. Already-relinked records
 *   stay relinked; on retry, only remaining records are processed.
 *   The source customer is NOT marked as merged until ALL relinks succeed.
 */

import { relinkCustomerRecords, type RelinkResult } from "./stCustomerMerge.ts";
import { findLocalCustomer } from "./stCustomerMapping.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingMergeStats {
  pending_created: number;
  pending_retried: number;
  pending_completed: number;
  pending_failed: number;
  oldest_pending_age_seconds: number | null;
}

// ─── Pending Merge Record Management ─────────────────────────────────────────

/**
 * Create or update a pending merge record when the target customer doesn't
 * exist locally yet. Idempotent — uses merge_key to prevent duplicates.
 *
 * Returns true if a new pending merge was created, false if it already existed.
 */
export async function createPendingMerge(
  base44: any,
  sourceStId: string,
  targetStId: string,
  sourceLocalCustomerId: string | null,
  tenantId: string,
  batchId: string,
  source: string = "api_export"
): Promise<{ created: boolean; pending_merge_id: string | null }> {
  // ── Safeguard: source and target cannot be the same ──
  if (sourceStId === targetStId) {
    console.warn(`[ST PENDING MERGE] Source and target are the same ('${sourceStId}') — skipping.`);
    return { created: false, pending_merge_id: null };
  }

  const mergeKey = `${sourceStId}:${targetStId}`;
  const now = new Date().toISOString();

  // Check for existing pending merge with the same key
  const existing = await base44.asServiceRole.entities.PendingMerge.filter(
    { merge_key: mergeKey },
    "-created_date",
    1
  );

  if (existing && existing.length > 0) {
    const record = existing[0];

    // If already completed, no-op
    if (record.status === "completed") {
      return { created: false, pending_merge_id: record.id };
    }

    // Update source_local_customer_id if we now have it
    if (sourceLocalCustomerId && !record.source_local_customer_id) {
      await base44.asServiceRole.entities.PendingMerge.update(record.id, {
        source_local_customer_id: sourceLocalCustomerId,
        last_attempted_at: now,
      });
    }

    return { created: false, pending_merge_id: record.id };
  }

  // ── Safeguard: detect merge cycles (A→B and B→A both pending) ──
  const reverseKey = `${targetStId}:${sourceStId}`;
  const reverseExisting = await base44.asServiceRole.entities.PendingMerge.filter(
    { merge_key: reverseKey },
    "-created_date",
    1
  );
  if (reverseExisting && reverseExisting.length > 0 && reverseExisting[0].status !== "completed") {
    console.error(
      `[ST PENDING MERGE] Cycle detected: '${sourceStId}'→'${targetStId}' and reverse '${targetStId}'→'${sourceStId}' both exist. ` +
      `Flagging both for admin review.`
    );
    // Flag both for admin review
    await base44.asServiceRole.entities.PendingMerge.update(reverseExisting[0].id, {
      requires_admin_review: true,
      admin_review_status: "pending",
      notes: `Merge cycle detected with ${mergeKey}`,
    });
  }

  // Create new pending merge
  const created = await base44.asServiceRole.entities.PendingMerge.create({
    merge_key: mergeKey,
    source_st_customer_id: sourceStId,
    target_st_customer_id: targetStId,
    source_local_customer_id: sourceLocalCustomerId || "",
    target_local_customer_id: "",
    status: "pending",
    first_detected_at: now,
    last_attempted_at: now,
    attempt_count: 0,
    max_attempts: 10,
    last_error: "",
    source,
    tenant_id: tenantId || "",
    batch_id: batchId,
    requires_admin_review: false,
    admin_review_status: "none",
    notes: "",
  });

  console.log(
    `[ST PENDING MERGE] Created pending merge: '${sourceStId}' → '${targetStId}' (id: ${created.id})`
  );

  return { created: true, pending_merge_id: created.id };
}

// ─── Merge Chain Resolution ───────────────────────────────────────────────────

/**
 * Resolve merge chains by walking the chain to find the final target.
 * E.g., A→B, B→C: the final target is C. We should merge A directly into C.
 *
 * Returns the final target ST customer ID after following the chain.
 */
export async function resolveMergeChain(
  base44: any,
  sourceStId: string,
  targetStId: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (visited.has(targetStId)) {
    console.error(
      `[ST PENDING MERGE] Merge chain cycle detected at '${targetStId}' while resolving chain for '${sourceStId}'. ` +
      `Returning original target to avoid infinite loop.`
    );
    return targetStId;
  }
  visited.add(targetStId);

  // Check if the target is itself a source in another pending merge
  const chainLink = await base44.asServiceRole.entities.PendingMerge.filter(
    { source_st_customer_id: targetStId, status: { $in: ["pending", "in_progress", "failed"] } },
    "-created_date",
    1
  );

  if (chainLink && chainLink.length > 0) {
    const nextTarget = chainLink[0].target_st_customer_id;
    if (nextTarget === targetStId) {
      return targetStId; // Self-reference guard
    }
    console.log(
      `[ST PENDING MERGE] Chain detected: '${sourceStId}' → '${targetStId}' → '${nextTarget}'. ` +
      `Resolving to final target '${nextTarget}'.`
    );
    return resolveMergeChain(base44, sourceStId, nextTarget, visited);
  }

  return targetStId;
}

// ─── Pending Merge Retry ──────────────────────────────────────────────────────

/**
 * Retry all pending merges whose target customers now exist locally.
 * Called after each successful page and at the end of the sync cycle.
 *
 * Transactional: if relinking fails, the pending merge stays in 'failed'
 * with the error recorded. The source customer is NOT marked as merged.
 *
 * Idempotent: re-running processes remaining records only.
 */
export async function retryPendingMerges(
  base44: any,
  tenantId: string
): Promise<PendingMergeStats> {
  const stats: PendingMergeStats = {
    pending_created: 0,
    pending_retried: 0,
    pending_completed: 0,
    pending_failed: 0,
    oldest_pending_age_seconds: null,
  };

  // Fetch all pending or failed merges (not completed)
  const pendingMerges = await base44.asServiceRole.entities.PendingMerge.filter(
    { status: { $in: ["pending", "failed"] }, tenant_id: tenantId },
    "first_detected_at",
    100
  );

  if (!pendingMerges || pendingMerges.length === 0) {
    return stats;
  }

  // Track oldest pending for age reporting
  const now = Date.now();
  for (const pm of pendingMerges) {
    const age = (now - new Date(pm.first_detected_at).getTime()) / 1000;
    if (stats.oldest_pending_age_seconds === null || age > stats.oldest_pending_age_seconds) {
      stats.oldest_pending_age_seconds = Math.round(age);
    }
  }

  for (const pm of pendingMerges) {
    stats.pending_retried++;

    try {
      // Resolve merge chain to find the final target
      const finalTargetStId = await resolveMergeChain(base44, pm.source_st_customer_id, pm.target_st_customer_id);

      // Find the target customer locally
      const targetCustomer = await findLocalCustomer(base44, finalTargetStId);
      if (!targetCustomer) {
        // Target still not synced — leave as pending
        continue;
      }

      // Find the source customer locally
      const sourceCustomer = await findLocalCustomer(base44, pm.source_st_customer_id);
      if (!sourceCustomer) {
        // Source doesn't exist locally — nothing to relink. Mark as completed.
        await base44.asServiceRole.entities.PendingMerge.update(pm.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
          target_local_customer_id: targetCustomer.id,
          notes: "Source customer not found locally — nothing to relink. Marked complete.",
        });
        stats.pending_completed++;
        continue;
      }

      // Skip if source is already merged
      if (sourceCustomer.servicetitan_sync_status === "merged") {
        await base44.asServiceRole.entities.PendingMerge.update(pm.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
          target_local_customer_id: targetCustomer.id,
          notes: "Source customer already marked as merged.",
        });
        stats.pending_completed++;
        continue;
      }

      // Mark as in_progress
      await base44.asServiceRole.entities.PendingMerge.update(pm.id, {
        status: "in_progress",
        last_attempted_at: new Date().toISOString(),
        target_local_customer_id: targetCustomer.id,
        attempt_count: (pm.attempt_count || 0) + 1,
      });

      // ── Transactional relinking ──
      // relinkCustomerRecords throws on failure, so already-relinked records
      // stay relinked and the source customer is NOT marked as merged.
      const relinkResult = await relinkCustomerRecords(base44, sourceCustomer.id, targetCustomer);

      // ── Mark source customer as merged ──
      const now = new Date().toISOString();
      let mergeHistory: any[] = [];
      try {
        mergeHistory = sourceCustomer.servicetitan_merge_history_json
          ? JSON.parse(sourceCustomer.servicetitan_merge_history_json)
          : [];
      } catch { mergeHistory = []; }

      mergeHistory.push({
        pending_merge_id: pm.id,
        event_type: "pending_merge_completed",
        source_customer_id: pm.source_st_customer_id,
        target_customer_id: finalTargetStId,
        merged_at: now,
        relinked_counts: relinkResult,
      });

      await base44.asServiceRole.entities.Customer.update(sourceCustomer.id, {
        servicetitan_sync_status: "merged",
        servicetitan_merged_into: finalTargetStId,
        servicetitan_merged_at: now,
        servicetitan_last_sync: now,
        servicetitan_last_event_type: "pending_merge_completed",
        servicetitan_source: "api",
        servicetitan_merge_history_json: JSON.stringify(mergeHistory),
      });

      // ── Mark pending merge as completed ──
      await base44.asServiceRole.entities.PendingMerge.update(pm.id, {
        status: "completed",
        completed_at: now,
        relink_result_json: JSON.stringify(relinkResult),
        last_error: "",
      });

      console.log(
        `[ST PENDING MERGE] Completed: '${pm.source_st_customer_id}' → '${finalTargetStId}'. ` +
        `Relinked: ${JSON.stringify(relinkResult)}`
      );
      stats.pending_completed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ST PENDING MERGE] Failed: '${pm.source_st_customer_id}' → '${pm.target_st_customer_id}': ${errorMsg}`
      );

      const attemptCount = (pm.attempt_count || 0) + 1;
      const maxAttempts = pm.max_attempts || 10;
      const requiresReview = attemptCount >= maxAttempts;

      await base44.asServiceRole.entities.PendingMerge.update(pm.id, {
        status: "failed",
        last_error: errorMsg,
        last_attempted_at: new Date().toISOString(),
        attempt_count: attemptCount,
        requires_admin_review: requiresReview,
        admin_review_status: requiresReview ? "pending" : (pm.admin_review_status || "none"),
        notes: requiresReview ? `Exhausted ${maxAttempts} retry attempts.` : (pm.notes || ""),
      });

      stats.pending_failed++;
    }
  }

  return stats;
}

// ─── Stats Aggregation ────────────────────────────────────────────────────────

/**
 * Get current pending merge statistics for reporting.
 */
export async function getPendingMergeStats(base44: any, tenantId: string): Promise<PendingMergeStats> {
  const pending = await base44.asServiceRole.entities.PendingMerge.filter(
    { status: "pending", tenant_id: tenantId },
    "first_detected_at",
    1
  );

  let oldestAge: number | null = null;
  if (pending && pending.length > 0) {
    const age = (Date.now() - new Date(pending[0].first_detected_at).getTime()) / 1000;
    oldestAge = Math.round(age);
  }

  return {
    pending_created: 0,
    pending_retried: 0,
    pending_completed: 0,
    pending_failed: 0,
    oldest_pending_age_seconds: oldestAge,
  };
}