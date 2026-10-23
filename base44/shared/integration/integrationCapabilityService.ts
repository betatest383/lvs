/**
 * Integration Capability Registry Service
 *
 * Declares what each external integration is technically capable of
 * supporting. The registry prevents a SyncPolicy from enabling a direction
 * or operation the integration cannot support.
 *
 * Implementation status differentiation:
 *   - implemented                  → working in production
 *   - api_supported_not_implemented → API verified but not wired
 *   - unsupported                  → confirmed unsupported
 *   - unknown_requires_verification → not yet verified
 */

import { buildCapabilityKey } from "../businessEvent/eventRetryUtils.ts";

export const CAPABILITIES = [
  "READ", "CREATE", "UPDATE", "DELETE",
  "WEBHOOK_INBOUND", "API_PULL", "API_PUSH",
  "ATTACHMENTS", "PHOTOS", "NOTES", "STATUS_UPDATES",
] as const;

export const DIRECTIONS = ["EXTERNAL_TO_LVC", "LVC_TO_EXTERNAL", "TWO_WAY"] as const;

export const IMPLEMENTATION_STATUSES = [
  "implemented",
  "api_supported_not_implemented",
  "unsupported",
  "unknown_requires_verification",
] as const;

export interface CapabilityInput {
  external_system: string;
  entity_type: string;
  direction: (typeof DIRECTIONS)[number];
  capability: (typeof CAPABILITIES)[number];
  is_supported: boolean;
  implementation_status: (typeof IMPLEMENTATION_STATUSES)[number];
  api_version?: string;
  limitations?: string;
  created_by?: string;
}

/** Register or update a capability record. */
export async function registerCapability(
  base44: any,
  input: CapabilityInput
): Promise<{ success: boolean; capability?: any; error?: string }> {
  if (!DIRECTIONS.includes(input.direction)) {
    return { success: false, error: `Unsupported direction: ${input.direction}` };
  }
  if (!CAPABILITIES.includes(input.capability)) {
    return { success: false, error: `Unsupported capability: ${input.capability}` };
  }
  if (!IMPLEMENTATION_STATUSES.includes(input.implementation_status)) {
    return { success: false, error: `Unsupported implementation_status: ${input.implementation_status}` };
  }

  const capabilityKey = buildCapabilityKey(
    input.external_system,
    input.entity_type,
    input.direction,
    input.capability
  );
  const now = new Date().toISOString();

  // Upsert: if a record with this key exists, update it; otherwise create.
  try {
    const existing = await base44.asServiceRole.entities.IntegrationCapabilityRegistry.filter(
      { capability_key: capabilityKey },
      null,
      1
    );
    if (existing.length > 0) {
      const updated = await base44.asServiceRole.entities.IntegrationCapabilityRegistry.update(
        existing[0].id,
        {
          is_supported: input.is_supported,
          implementation_status: input.implementation_status,
          api_version: input.api_version || existing[0].api_version || "",
          limitations: input.limitations || existing[0].limitations || "",
          activation_date: existing[0].activation_date || now,
        }
      );
      return { success: true, capability: updated };
    }
    const capability = await base44.asServiceRole.entities.IntegrationCapabilityRegistry.create({
      capability_id: `ICR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      capability_key: capabilityKey,
      external_system: input.external_system,
      entity_type: input.entity_type,
      direction: input.direction,
      capability: input.capability,
      is_supported: input.is_supported,
      implementation_status: input.implementation_status,
      api_version: input.api_version || "",
      limitations: input.limitations || "",
      activation_date: now,
      created_by: input.created_by || "system",
    });
    return { success: true, capability };
  } catch (err) {
    return { success: false, error: `Capability register failed: ${err}` };
  }
}

/**
 * Validate that a SyncPolicy's sync_mode is supported by the integration's
 * declared capabilities. Prevents enabling a direction the integration
 * cannot support.
 *
 *   TWO_WAY             → requires EXTERNAL_TO_LVC + LVC_TO_EXTERNAL support
 *   EXTERNAL_TO_LVC     → requires EXTERNAL_TO_LVC support
 *   LVC_TO_EXTERNAL     → requires LVC_TO_EXTERNAL support
 *   LVC_ONLY            → always valid (no external dependency)
 */
export async function validatePolicyAgainstCapabilities(
  base44: any,
  externalSystem: string,
  entityType: string,
  syncMode: string
): Promise<{ valid: boolean; error?: string }> {
  if (syncMode === "LVC_ONLY") {
    return { valid: true };
  }

  const requiredDirections: string[] = [];
  if (syncMode === "TWO_WAY") {
    requiredDirections.push("EXTERNAL_TO_LVC", "LVC_TO_EXTERNAL");
  } else if (syncMode === "EXTERNAL_TO_LVC") {
    requiredDirections.push("EXTERNAL_TO_LVC");
  } else if (syncMode === "LVC_TO_EXTERNAL") {
    requiredDirections.push("LVC_TO_EXTERNAL");
  }

  for (const direction of requiredDirections) {
    // EXTERNAL_TO_LVC is satisfied by either API_PULL or WEBHOOK_INBOUND.
    // LVC_TO_EXTERNAL requires API_PUSH.
    let supported = false;
    if (direction === "EXTERNAL_TO_LVC") {
      supported =
        (await isCapabilitySupported(base44, externalSystem, entityType, direction, "API_PULL")) ||
        (await isCapabilitySupported(base44, externalSystem, entityType, direction, "WEBHOOK_INBOUND"));
    } else if (direction === "LVC_TO_EXTERNAL") {
      supported = await isCapabilitySupported(base44, externalSystem, entityType, direction, "API_PUSH");
    }
    if (!supported) {
      return {
        valid: false,
        error: `Integration '${externalSystem}' does not support direction '${direction}' for entity '${entityType}'`,
      };
    }
  }
  return { valid: true };
}

/** Check whether a specific capability is supported and implemented. */
export async function isCapabilitySupported(
  base44: any,
  externalSystem: string,
  entityType: string,
  direction: string,
  capability: string
): Promise<boolean> {
  try {
    const results = await base44.asServiceRole.entities.IntegrationCapabilityRegistry.filter(
      {
        external_system: externalSystem,
        entity_type: entityType,
        direction,
        capability,
        is_supported: true,
      },
      null,
      1
    );
    return results.length > 0;
  } catch {
    return false;
  }
}

/** List all declared capabilities for an external system. */
export async function getCapabilitiesForSystem(
  base44: any,
  externalSystem: string
): Promise<any[]> {
  try {
    return await base44.asServiceRole.entities.IntegrationCapabilityRegistry.filter(
      { external_system: externalSystem },
      "entity_type",
      200
    );
  } catch {
    return [];
  }
}