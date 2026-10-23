/**
 * Integration Adapter Registry Service
 *
 * Describes which adapter implementation serves an external system. This
 * registry holds NO credentials — authentication secrets remain in the
 * approved secret-management mechanism (Deno.env). The registry only records
 * the adapter's identity, auth strategy, health, and activation state.
 */

export const ADAPTER_TYPES = ["inbound", "outbound", "bidirectional"] as const;
export const AUTH_STRATEGIES = ["oauth_client_credentials", "api_key", "webhook_secret", "none"] as const;
export const HEALTH_STATUSES = ["healthy", "degraded", "down", "unknown"] as const;

export interface AdapterInput {
  external_system: string;
  adapter_name: string;
  adapter_version?: string;
  adapter_type: (typeof ADAPTER_TYPES)[number];
  handler_reference: string;
  auth_strategy: (typeof AUTH_STRATEGIES)[number];
  supported_api_version?: string;
  created_by?: string;
  notes?: string;
}

/** Register or update an adapter. */
export async function registerAdapter(
  base44: any,
  input: AdapterInput
): Promise<{ success: boolean; adapter?: any; error?: string }> {
  if (!ADAPTER_TYPES.includes(input.adapter_type)) {
    return { success: false, error: `Unsupported adapter_type: ${input.adapter_type}` };
  }
  if (!AUTH_STRATEGIES.includes(input.auth_strategy)) {
    return { success: false, error: `Unsupported auth_strategy: ${input.auth_strategy}` };
  }

  const now = new Date().toISOString();

  // Upsert by external_system + adapter_name.
  try {
    const existing = await base44.asServiceRole.entities.IntegrationAdapterRegistry.filter(
      { external_system: input.external_system, adapter_name: input.adapter_name },
      null,
      1
    );
    if (existing.length > 0) {
      const updated = await base44.asServiceRole.entities.IntegrationAdapterRegistry.update(
        existing[0].id,
        {
          adapter_version: input.adapter_version || existing[0].adapter_version || "1.0.0",
          adapter_type: input.adapter_type,
          handler_reference: input.handler_reference,
          auth_strategy: input.auth_strategy,
          supported_api_version: input.supported_api_version || existing[0].supported_api_version || "",
          notes: input.notes || existing[0].notes || "",
          activation_date: existing[0].activation_date || now,
        }
      );
      return { success: true, adapter: updated };
    }
    const adapter = await base44.asServiceRole.entities.IntegrationAdapterRegistry.create({
      adapter_id: `IAR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      external_system: input.external_system,
      adapter_name: input.adapter_name,
      adapter_version: input.adapter_version || "1.0.0",
      adapter_type: input.adapter_type,
      handler_reference: input.handler_reference,
      auth_strategy: input.auth_strategy,
      is_active: true,
      supported_api_version: input.supported_api_version || "",
      health_status: "unknown",
      activation_date: now,
      created_by: input.created_by || "system",
      notes: input.notes || "",
    });
    return { success: true, adapter };
  } catch (err) {
    return { success: false, error: `Adapter register failed: ${err}` };
  }
}

/** Get the active adapter for an external system. */
export async function getAdapter(
  base44: any,
  externalSystem: string
): Promise<any | null> {
  try {
    const results = await base44.asServiceRole.entities.IntegrationAdapterRegistry.filter(
      { external_system: externalSystem, is_active: true },
      "-created_date",
      1
    );
    return results.length > 0 ? results[0] : null;
  } catch {
    return null;
  }
}

/** Update adapter health status. */
export async function updateAdapterHealth(
  base44: any,
  adapterId: string,
  health: string
): Promise<{ success: boolean }> {
  if (!HEALTH_STATUSES.includes(health as any)) {
    return { success: false };
  }
  try {
    await base44.asServiceRole.entities.IntegrationAdapterRegistry.update(adapterId, {
      health_status: health,
      health_checked_at: new Date().toISOString(),
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}