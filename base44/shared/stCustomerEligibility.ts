/**
 * ServiceTitan Customer Eligibility & CreatedOn Resolution
 *
 * FAIL CLOSED: If the watermark cannot be loaded, returns "watermark_error" —
 * the caller must NOT create the customer and must retain the webhook for retry.
 *
 * Extracted from stCustomerSyncStrategy.ts for maintainability.
 */

import { getWatermark } from "./stWatermark.ts";
import { fetchCustomerById } from "./stOnDemandHydration.ts";
import { getString } from "./stCustomerMapping.ts";

export type WatermarkCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "pre_activation"; activation_timestamp: string; customer_created_on: string }
  | { allowed: false; reason: "deferred_missing_created_on"; message: string }
  | { allowed: false; reason: "watermark_error"; message: string; error?: string };

/**
 * Check whether a customer should be imported under the new-customers-only strategy.
 *
 * FAIL CLOSED: If the watermark cannot be loaded, returns "watermark_error" —
 * the caller must NOT create the customer and must retain the webhook for retry.
 */
export async function checkCustomerEligibility(
  base44: any,
  tenantId: string,
  environment: string,
  stCustomerId: string,
  customerCreatedOn: string | null
): Promise<WatermarkCheckResult> {
  let watermark: any;
  try {
    watermark = await getWatermark(base44, tenantId, environment);
  } catch (err: any) {
    return {
      allowed: false,
      reason: "watermark_error",
      message: `Watermark load failed: ${err.message || String(err)}`,
      error: err.message,
    };
  }

  // No watermark — pre-activation, allow (backward compat for initial setup)
  if (!watermark) return { allowed: true };

  // Watermark disabled or full historical backfill — allow
  if (watermark.status !== "active") return { allowed: true };
  if (watermark.sync_strategy === "full_historical_backfill") return { allowed: true };
  if (watermark.sync_strategy !== "new_customers_only") return { allowed: true };

  // New-customers-only: require a valid createdOn
  if (!customerCreatedOn) {
    return {
      allowed: false,
      reason: "deferred_missing_created_on",
      message: `Customer '${stCustomerId}' has no createdOn — must resolve via API before import`,
    };
  }

  const createdTime = new Date(customerCreatedOn).getTime();
  const activationTime = watermark.activation_timestamp ? new Date(watermark.activation_timestamp).getTime() : NaN;

  if (isNaN(createdTime)) {
    return {
      allowed: false,
      reason: "deferred_missing_created_on",
      message: `Customer '${stCustomerId}' has invalid createdOn '${customerCreatedOn}' — must resolve via API`,
    };
  }

  if (isNaN(activationTime)) {
    return {
      allowed: false,
      reason: "watermark_error",
      message: `Watermark has invalid activation_timestamp '${watermark.activation_timestamp}'`,
    };
  }

  if (createdTime < activationTime) {
    return {
      allowed: false,
      reason: "pre_activation",
      activation_timestamp: watermark.activation_timestamp,
      customer_created_on: customerCreatedOn,
    };
  }

  return { allowed: true };
}

/**
 * @deprecated Use checkCustomerEligibility instead. Kept for backward compat.
 */
export function shouldImportNewCustomer(
  watermark: any | null,
  customerCreatedOn: string | null
): boolean {
  if (!watermark || watermark.status !== "active") return true;
  if (watermark.sync_strategy === "full_historical_backfill") return true;
  if (watermark.sync_strategy !== "new_customers_only") return true;
  if (!customerCreatedOn) return false; // FAIL CLOSED — defer
  if (!watermark.activation_timestamp) return true;

  const createdTime = new Date(customerCreatedOn).getTime();
  const activationTime = new Date(watermark.activation_timestamp).getTime();
  if (isNaN(createdTime) || isNaN(activationTime)) return false; // FAIL CLOSED

  return createdTime >= activationTime;
}

/**
 * Resolve the authoritative createdOn for a customer by fetching it from the API.
 * Used when the webhook payload doesn't include createdOn or it's invalid.
 * Returns the createdOn string, or null if it cannot be determined.
 */
export async function resolveCustomerCreatedOn(
  environment: string,
  tenantId: string,
  stCustomerId: string
): Promise<string | null> {
  const customer = await fetchCustomerById(environment, tenantId, stCustomerId);
  if (!customer) return null;
  return getString(customer, "createdOn", "created_on", "created_at") || null;
}