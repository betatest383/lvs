/**
 * Protected Test Harness Guard
 *
 * Replaces the unsafe boolean-only guard with a server-side validation
 * mechanism backed by ValidationRun records.
 *
 * Security model:
 *   1. An authorized validation function creates a ValidationRun with an
 *      unguessable cryptographic token (createValidationRun).
 *   2. The run_id and run_token are passed in event metadata.
 *   3. Before honoring ANY test-only flag, the guard verifies the run
 *      exists, is active, token matches, and has not expired
 *      (verifyValidationRun).
 *   4. After the run completes, the run is invalidated (completeValidationRun).
 *
 * This ensures:
 *   - Ordinary webhook payloads cannot authorize test flags (they don't
 *     carry validation_run_id + validation_token).
 *   - Copying test_harness=true into metadata is insufficient.
 *   - Copying test_skip_hydration=true is insufficient.
 *   - Internal non-validation publishers cannot enable the flag accidentally.
 *   - Only an active authorized validation run can use test-only controls.
 *   - Authorization expires or is invalidated after the run.
 *   - Production behavior remains unchanged.
 */

const TOKEN_BYTES = 32;
const RUN_EXPIRY_MINUTES = 30;

/**
 * Generate an unguessable token using the Web Crypto API.
 */
export function generateRunToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a new validation run with a server-generated unguessable token.
 * Only callable from admin-authenticated backend functions.
 */
export async function createValidationRun(
  base44: any,
  testPrefix: string,
  stage: string,
  actor: string
): Promise<{ run_id: string; run_token: string }> {
  const runId = `VR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  const runToken = generateRunToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RUN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await base44.asServiceRole.entities.ValidationRun.create({
    run_id: runId,
    run_token: runToken,
    test_prefix: testPrefix,
    stage,
    status: "active",
    actor,
    created_at: now,
    expires_at: expiresAt,
    unrelated_deliveries_selected: 0,
    unrelated_deliveries_mutated: 0,
    persistence_verification_failures: 0,
  });

  return { run_id: runId, run_token: runToken };
}

/**
 * Verify a validation run server-side.
 *
 * Checks:
 *   - Run exists
 *   - Token matches (constant-time comparison)
 *   - Status is "active"
 *   - Not expired
 *
 * Returns { valid: true, run } if all checks pass, otherwise { valid: false, error }.
 */
export async function verifyValidationRun(
  base44: any,
  runId: string,
  runToken: string
): Promise<{ valid: boolean; run?: any; error?: string }> {
  if (!runId || !runToken) {
    return { valid: false, error: "Missing validation run ID or token" };
  }

  let runs: any[] = [];
  try {
    runs = await base44.asServiceRole.entities.ValidationRun.filter(
      { run_id: runId },
      null,
      1
    );
  } catch (err) {
    return { valid: false, error: `Validation run query failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (runs.length === 0) {
    return { valid: false, error: "Validation run not found" };
  }

  const run = runs[0];

  // Constant-time token comparison to prevent timing attacks.
  if (!constantTimeEqual(run.run_token, runToken)) {
    return { valid: false, error: "Invalid validation run token" };
  }

  if (run.status !== "active") {
    return { valid: false, error: `Validation run status is '${run.status}', not 'active'` };
  }

  if (run.expires_at && new Date(run.expires_at).getTime() < Date.now()) {
    // Auto-expire the run.
    try {
      await base44.asServiceRole.entities.ValidationRun.update(run.id, {
        status: "expired",
      });
    } catch { /* non-critical */ }
    return { valid: false, error: "Validation run has expired" };
  }

  return { valid: true, run };
}

/**
 * Invalidate a validation run after the test completes.
 */
export async function completeValidationRun(
  base44: any,
  runId: string,
  status: "completed" | "failed" = "completed"
): Promise<void> {
  try {
    const runs = await base44.asServiceRole.entities.ValidationRun.filter(
      { run_id: runId },
      null,
      1
    );
    if (runs.length > 0) {
      await base44.asServiceRole.entities.ValidationRun.update(runs[0].id, {
        status,
        completed_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[VALIDATION RUN] completion failed:", err);
  }
}

/**
 * Increment the unrelated-deliveries-selected counter on a validation run.
 */
export async function recordUnrelatedDeliverySelected(
  base44: any,
  runId: string
): Promise<void> {
  try {
    const runs = await base44.asServiceRole.entities.ValidationRun.filter(
      { run_id: runId },
      null,
      1
    );
    if (runs.length > 0) {
      await base44.asServiceRole.entities.ValidationRun.update(runs[0].id, {
        unrelated_deliveries_selected: (runs[0].unrelated_deliveries_selected || 0) + 1,
      });
    }
  } catch { /* non-critical */ }
}

/**
 * Increment the unrelated-deliveries-mutated counter on a validation run.
 */
export async function recordUnrelatedDeliveryMutated(
  base44: any,
  runId: string
): Promise<void> {
  try {
    const runs = await base44.asServiceRole.entities.ValidationRun.filter(
      { run_id: runId },
      null,
      1
    );
    if (runs.length > 0) {
      await base44.asServiceRole.entities.ValidationRun.update(runs[0].id, {
        unrelated_deliveries_mutated: (runs[0].unrelated_deliveries_mutated || 0) + 1,
      });
    }
  } catch { /* non-critical */ }
}

/**
 * Increment the persistence-verification-failures counter on a validation run.
 */
export async function recordPersistenceVerificationFailure(
  base44: any,
  runId: string
): Promise<void> {
  try {
    const runs = await base44.asServiceRole.entities.ValidationRun.filter(
      { run_id: runId },
      null,
      1
    );
    if (runs.length > 0) {
      await base44.asServiceRole.entities.ValidationRun.update(runs[0].id, {
        persistence_verification_failures: (runs[0].persistence_verification_failures || 0) + 1,
      });
    }
  } catch { /* non-critical */ }
}

/**
 * Parse event metadata JSON safely.
 */
export function parseMetadata(raw: string | null | undefined): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Internal Utilities ──────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks on tokens.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}