/**
 * ServiceTitan Customer Hydration for Dependent Syncs
 *
 * Shared helper that dependent sync modules (Jobs, Appointments, Estimates,
 * Invoices, Memberships, Projects) call to ensure a referenced ServiceTitan
 * customer exists locally before creating the dependent record.
 *
 * Behavior:
 *   1. If customer exists locally → return immediately (matched)
 *   2. If customer missing → hydrate from ServiceTitan API (on_demand_hydration)
 *   3. If hydration fails → create a DeferredDependentRecord for retry
 *   4. Never create an orphaned dependent record
 *
 * Idempotency:
 *   - Deterministic deferred_key prevents duplicate deferred records
 *   - Repeated hydration calls for the same customer return "already_exists"
 */

import { getWatermark } from "./stCustomerSyncStrategy.ts";
import { hydrateCustomerOnDemand, createDeferredCustomer } from "./stCustomerSyncStrategy.ts";
import { getTenantId, getEnvironment } from "./stAuth.ts";
import { addTimelineEntry, TIMELINE_STAGES } from "./stTimeline.ts";

export interface EnsureCustomerResult {
  status: "matched" | "hydrated" | "deferred" | "not_found" | "error";
  localCustomerId?: string;
  customerName?: string;
  warning?: string;
  deferredRecordId?: string;
}

/**
 * Ensure a ServiceTitan customer exists locally before creating a dependent record.
 *
 * Called by job, appointment, estimate, invoice, membership, and project sync
 * handlers when the referenced customer is not found locally.
 *
 * If hydration fails, a DeferredDependentRecord is created so the dependent
 * record can be retried after the customer is available.
 */
export async function ensureCustomerForDependentRecord(
  base44: any,
  stCustomerId: string,
  tenantId: string,
  environment: string,
  entityType: string,
  stEntityId: string,
  webhookEventId: string | undefined,
  payloadSnapshot: any
): Promise<EnsureCustomerResult> {
  if (!stCustomerId) {
    return {
      status: "not_found",
      warning: "No servicetitan_customer_id supplied in payload",
    };
  }

  // Get watermark for hydration (may be null in pre-activation or full-backfill mode)
  let watermark: any | null = null;
  try {
    watermark = await getWatermark(base44, tenantId, environment);
  } catch (err: any) {
    console.warn("[ST HYDRATION] Watermark load failed — proceeding with hydration:", err.message);
  }

  // Attempt hydration
  const hydrationResult = await hydrateCustomerOnDemand(
    base44,
    environment,
    tenantId,
    stCustomerId,
    watermark
  );

  switch (hydrationResult.action) {
    case "created":
      return {
        status: "hydrated",
        localCustomerId: hydrationResult.local_customer_id,
        warning: hydrationResult.contacts_failed && hydrationResult.contacts_failed > 0
          ? `Customer hydrated but ${hydrationResult.contacts_failed} contact(s) failed to sync`
          : undefined,
      };

    case "already_exists":
      return {
        status: "matched",
        localCustomerId: hydrationResult.local_customer_id,
      };

    case "not_found":
    case "error": {
      // Hydration failed — create a deferred dependent record
      const deferredKey = `${entityType}:${stEntityId}:${stCustomerId}`;
      const now = new Date().toISOString();

      try {
        const existing = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
          { deferred_key: deferredKey, status: "pending" },
          "-created_date",
          1
        );

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.DeferredDependentRecord.update(existing[0].id, {
            attempt_count: (existing[0].attempt_count || 0) + 1,
            last_attempted_at: now,
            last_error: hydrationResult.summary,
          });
          return {
            status: "deferred",
            deferredRecordId: existing[0].id,
            warning: hydrationResult.summary,
          };
        }

        const created = await base44.asServiceRole.entities.DeferredDependentRecord.create({
          deferred_key: deferredKey,
          entity_type: entityType as any,
          servicetitan_entity_id: stEntityId,
          servicetitan_customer_id: stCustomerId,
          tenant_id: tenantId,
          environment,
          webhook_event_id: webhookEventId || "",
          payload_snapshot_json: JSON.stringify(payloadSnapshot || {}),
          status: "pending",
          attempt_count: 1,
          max_attempts: 10,
          last_attempted_at: now,
          last_error: hydrationResult.summary,
          first_detected_at: now,
          requires_admin_review: false,
        });

        await addTimelineEntry(
          base44,
          webhookEventId,
          TIMELINE_STAGES.HANDLER_FINISHED,
          `Dependent ${entityType} '${stEntityId}' deferred — customer '${stCustomerId}' hydration failed: ${hydrationResult.summary}`,
          "warning",
          undefined,
          {
            sync_action: "dependent_deferred",
            entity_type: entityType,
            servicetitan_entity_id: stEntityId,
            servicetitan_customer_id: stCustomerId,
            deferred_record_id: created.id,
            hydration_action: hydrationResult.action,
          }
        );

        return {
          status: "deferred",
          deferredRecordId: created.id,
          warning: hydrationResult.summary,
        };
      } catch (err: any) {
        console.error("[ST HYDRATION] Failed to create deferred dependent record:", err.message);
        return {
          status: "error",
          warning: `Hydration failed AND deferral failed: ${hydrationResult.summary}; ${err.message}`,
        };
      }
    }

    default:
      return {
        status: "error",
        warning: `Unknown hydration result: ${hydrationResult.action}`,
      };
  }
}