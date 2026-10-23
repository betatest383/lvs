/**
 * Field-Level Write Authority Service
 *
 * Field-Level Write Authority governs which system may automatically write
 * a specific field during synchronization. The LVC OS Master Data module
 * remains the authoritative OWNER of the business record — this service only
 * controls automatic field writes during sync.
 *
 * Rules can be policy-scoped (linked to a SyncPolicy) or global defaults for
 * an entity/field/external-system combination.
 */

import { buildFieldAuthorityKey } from "../businessEvent/eventRetryUtils.ts";

export const WRITE_AUTHORITIES = ["LVC_OS", "EXTERNAL_SYSTEM", "MOST_RECENT", "MANUAL_REVIEW"] as const;

export interface FieldAuthorityInput {
  policy_id?: string;
  entity_type: string;
  field_name: string;
  write_authority: (typeof WRITE_AUTHORITIES)[number];
  external_system: string;
  conflict_strategy_override?: string;
  notes?: string;
  created_by?: string;
}

/** Validate a field authority rule. */
export function validateFieldAuthorityInput(input: FieldAuthorityInput): { valid: boolean; error?: string } {
  if (!input.entity_type || !input.field_name || !input.external_system) {
    return { valid: false, error: "entity_type, field_name, and external_system are required" };
  }
  if (!WRITE_AUTHORITIES.includes(input.write_authority)) {
    return { valid: false, error: `Unsupported write_authority: ${input.write_authority}` };
  }
  return { valid: true };
}

/** Create a field authority rule. Rejects duplicate active rules for the same key. */
export async function createFieldAuthority(
  base44: any,
  input: FieldAuthorityInput
): Promise<{ success: boolean; authority?: any; error?: string }> {
  const validation = validateFieldAuthorityInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const authorityKey = buildFieldAuthorityKey(input.entity_type, input.field_name, input.external_system);

  // Reject duplicate active rules.
  try {
    const existing = await base44.asServiceRole.entities.SyncFieldAuthority.filter(
      { authority_key: authorityKey, is_active: true },
      null,
      1
    );
    if (existing.length > 0) {
      return { success: false, error: `An active authority rule already exists for ${authorityKey}` };
    }
  } catch (err) {
    return { success: false, error: `Duplicate check failed: ${err}` };
  }

  const now = new Date().toISOString();
  try {
    const authority = await base44.asServiceRole.entities.SyncFieldAuthority.create({
      authority_id: `SFA-${Date.now().toString(36)}`,
      authority_key: authorityKey,
      policy_id: input.policy_id || "",
      entity_type: input.entity_type,
      field_name: input.field_name,
      write_authority: input.write_authority,
      external_system: input.external_system,
      conflict_strategy_override: input.conflict_strategy_override || "",
      is_active: true,
      effective_from: now,
      effective_to: null,
      version: 1,
      created_by: input.created_by || "system",
      notes: input.notes || "",
    });
    return { success: true, authority };
  } catch (err) {
    return { success: false, error: `Create failed: ${err}` };
  }
}

/**
 * Resolve the effective write authority for a field. Falls back from
 * policy-scoped rules to global defaults.
 */
export async function resolveFieldAuthority(
  base44: any,
  entityType: string,
  fieldName: string,
  externalSystem: string,
  policyId?: string
): Promise<string | null> {
  const now = new Date().toISOString();

  // 1. Try policy-scoped rule first.
  if (policyId) {
    const scoped = await queryActiveRule(base44, entityType, fieldName, externalSystem, policyId, now);
    if (scoped) return scoped.write_authority;
  }

  // 2. Fall back to global default (no policy binding).
  const global = await queryActiveRule(base44, entityType, fieldName, externalSystem, "", now);
  if (global) return global.write_authority;

  // 3. No rule found — default to LVC_OS (safest).
  return "LVC_OS";
}

async function queryActiveRule(
  base44: any,
  entityType: string,
  fieldName: string,
  externalSystem: string,
  policyId: string,
  now: string
): Promise<any | null> {
  try {
    const filter: any = {
      entity_type: entityType,
      field_name: fieldName,
      external_system: externalSystem,
      is_active: true,
    };
    if (policyId) filter.policy_id = policyId;
    else filter.policy_id = "";
    const results = await base44.asServiceRole.entities.SyncFieldAuthority.filter(filter, "-version", 1);
    if (results.length === 0) return null;
    const rule = results[0];
    if (rule.effective_from && new Date(rule.effective_from).getTime() > new Date(now).getTime()) {
      return null;
    }
    if (rule.effective_to && new Date(rule.effective_to).getTime() < new Date(now).getTime()) {
      return null;
    }
    return rule;
  } catch {
    return null;
  }
}

/** Deactivate a field authority rule (preserves history). */
export async function deactivateFieldAuthority(
  base44: any,
  authorityId: string
): Promise<{ success: boolean }> {
  try {
    await base44.asServiceRole.entities.SyncFieldAuthority.update(authorityId, {
      is_active: false,
      effective_to: new Date().toISOString(),
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}