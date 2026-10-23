/**
 * Sync Policy Service
 *
 * SyncPolicy is governed Master Data. Synchronization is configured per
 * (entity_type, external_system) pair — never globally. Each pair has at
 * most one active policy version at a time.
 *
 * This service provides: create, version, activate, deactivate, effective
 * lookup, validation, and capability validation. It does NOT connect to
 * existing ServiceTitan sync flows (that is Stage 2B).
 */

import { buildPolicyKey } from "../businessEvent/eventRetryUtils.ts";
import { validatePolicyAgainstCapabilities } from "../integration/integrationCapabilityService.ts";

export const SYNC_MODES = ["TWO_WAY", "EXTERNAL_TO_LVC", "LVC_TO_EXTERNAL", "LVC_ONLY"] as const;
export const CONFLICT_STRATEGIES = [
  "LVC_WINS",
  "EXTERNAL_WINS",
  "MOST_RECENT_CHANGE_WINS",
  "MANUAL_REVIEW",
  "FIELD_LEVEL_RULES",
] as const;
export const POLICY_STATUSES = ["draft", "pending_approval", "active", "inactive", "archived"] as const;

export interface SyncPolicyInput {
  entity_type: string;
  external_system: string;
  sync_enabled?: boolean;
  sync_mode: (typeof SYNC_MODES)[number];
  conflict_resolution_strategy: (typeof CONFLICT_STRATEGIES)[number];
  effective_from?: string;
  effective_to?: string;
  notes?: string;
  created_by?: string;
}

/** Validate that a policy's mode and strategy are supported. */
export function validatePolicyInput(input: SyncPolicyInput): { valid: boolean; error?: string } {
  if (!input.entity_type || !input.external_system) {
    return { valid: false, error: "entity_type and external_system are required" };
  }
  if (!SYNC_MODES.includes(input.sync_mode)) {
    return { valid: false, error: `Unsupported sync_mode: ${input.sync_mode}` };
  }
  if (!CONFLICT_STRATEGIES.includes(input.conflict_resolution_strategy)) {
    return { valid: false, error: `Unsupported conflict_resolution_strategy: ${input.conflict_resolution_strategy}` };
  }
  return { valid: true };
}

/** Create a new policy. Rejects if an active policy already exists for the pair. */
export async function createPolicy(
  base44: any,
  input: SyncPolicyInput
): Promise<{ success: boolean; policy?: any; error?: string }> {
  const validation = validatePolicyInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const policyKey = buildPolicyKey(input.entity_type, input.external_system);

  // Reject duplicate active policies.
  const existing = await getActivePolicy(base44, input.entity_type, input.external_system);
  if (existing) {
    return {
      success: false,
      error: `An active policy already exists for ${policyKey}. Version it instead.`,
    };
  }

  // Validate the policy against integration capabilities (prevents enabling
  // a direction the integration cannot support).
  const capCheck = await validatePolicyAgainstCapabilities(
    base44,
    input.external_system,
    input.entity_type,
    input.sync_mode
  );
  if (!capCheck.valid) {
    return { success: false, error: capCheck.error };
  }

  const now = new Date().toISOString();
  try {
    const policy = await base44.asServiceRole.entities.SyncPolicy.create({
      policy_id: `SP-${Date.now().toString(36)}`,
      policy_key: policyKey,
      entity_type: input.entity_type,
      external_system: input.external_system,
      sync_enabled: input.sync_enabled ?? true,
      sync_mode: input.sync_mode,
      conflict_resolution_strategy: input.conflict_resolution_strategy,
      activation_date: now,
      effective_from: input.effective_from || now,
      effective_to: input.effective_to || null,
      version: 1,
      status: "active",
      approval_status: "approved",
      created_by: input.created_by || "system",
      approved_by: input.created_by || "system",
      notes: input.notes || "",
    });
    return { success: true, policy };
  } catch (err) {
    return { success: false, error: `Policy create failed: ${err}` };
  }
}

/**
 * Version an existing policy: archive the current version and create a new
 * version with the updated fields. History is preserved via versioned records.
 */
export async function versionPolicy(
  base44: any,
  policyId: string,
  updates: Partial<SyncPolicyInput>,
  versionedBy: string
): Promise<{ success: boolean; policy?: any; error?: string }> {
  let current: any = null;
  try {
    current = await base44.asServiceRole.entities.SyncPolicy.get(policyId);
  } catch (err) {
    return { success: false, error: `Policy not found: ${err}` };
  }
  if (!current) {
    return { success: false, error: "Policy not found" };
  }

  const newMode = updates.sync_mode || current.sync_mode;
  const newStrategy = updates.conflict_resolution_strategy || current.conflict_resolution_strategy;
  const newEnabled = updates.sync_enabled ?? current.sync_enabled;

  // Validate capabilities if mode changed.
  if (updates.sync_mode && updates.sync_mode !== current.sync_mode) {
    const capCheck = await validatePolicyAgainstCapabilities(
      base44,
      current.external_system,
      current.entity_type,
      updates.sync_mode
    );
    if (!capCheck.valid) {
      return { success: false, error: capCheck.error };
    }
  }

  const now = new Date().toISOString();

  // Archive the current version.
  try {
    await base44.asServiceRole.entities.SyncPolicy.update(current.id, {
      status: "archived",
      effective_to: now,
      deactivation_date: now,
    });
  } catch (err) {
    return { success: false, error: `Failed to archive current version: ${err}` };
  }

  // Create the new version.
  try {
    const policy = await base44.asServiceRole.entities.SyncPolicy.create({
      policy_id: `SP-${Date.now().toString(36)}`,
      policy_key: current.policy_key,
      entity_type: current.entity_type,
      external_system: current.external_system,
      sync_enabled: newEnabled,
      sync_mode: newMode,
      conflict_resolution_strategy: newStrategy,
      activation_date: now,
      effective_from: updates.effective_from || now,
      effective_to: updates.effective_to || null,
      version: (current.version || 1) + 1,
      status: "active",
      approval_status: "approved",
      created_by: versionedBy,
      approved_by: versionedBy,
      notes: updates.notes || current.notes || "",
    });
    return { success: true, policy };
  } catch (err) {
    return { success: false, error: `New version create failed: ${err}` };
  }
}

/** Deactivate (but do not archive) the active policy for a pair. */
export async function deactivatePolicy(
  base44: any,
  entityType: string,
  externalSystem: string,
  deactivatedBy: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  try {
    const result = await base44.asServiceRole.entities.SyncPolicy.updateMany(
      { entity_type: entityType, external_system: externalSystem, status: "active" },
      { $set: { status: "inactive", deactivation_date: now, effective_to: now } }
    );
    const updated = result && (result.modified_count > 0 || result.updated > 0);
    return { success: updated };
  } catch (err) {
    return { success: false, error: `Deactivate failed: ${err}` };
  }
}

/**
 * Resolve the currently effective policy for an entity + external system.
 * Only returns active policies within their effective date window. Returns
 * null when no effective policy exists (Stage 2A default: callers should
 * treat null as "no sync" — existing ST behavior is NOT yet dependent on this).
 */
export async function getEffectivePolicy(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<any | null> {
  try {
    const results = await base44.asServiceRole.entities.SyncPolicy.filter(
      { entity_type: entityType, external_system: externalSystem, status: "active" },
      "-version",
      1
    );
    if (results.length === 0) return null;
    const policy = results[0];
    const now = Date.now();
    if (policy.effective_from && new Date(policy.effective_from).getTime() > now) {
      return null;
    }
    if (policy.effective_to && new Date(policy.effective_to).getTime() < now) {
      return null;
    }
    return policy;
  } catch {
    return null;
  }
}

/** Convenience: get the active policy for a pair (alias of getEffectivePolicy). */
export async function getActivePolicy(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<any | null> {
  return getEffectivePolicy(base44, entityType, externalSystem);
}

/** List the full version history for a policy pair (audit). */
export async function getPolicyHistory(
  base44: any,
  entityType: string,
  externalSystem: string
): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.SyncPolicy.filter(
      { entity_type: entityType, external_system: externalSystem },
      "-version",
      100
    );
  } catch {
    return [];
  }
}