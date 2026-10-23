/**
 * Customer Outbound Subscriber (Stage 2B-A)
 *
 * Handler reference: "customer.sync.outbound"
 *
 * Listens for customer.created / customer.updated BusinessEvents.
 *   - Processes events where source_system="lvc_os" (LVC-originated).
 *   - Ignores servicetitan-originated events (loop prevention — inbound
 *     subscriber handles those).
 *   - Checks the Customer SyncPolicy for LVC_TO_EXTERNAL permission.
 *   - Filters fields by SyncFieldAuthority (only LVC-owned or MOST_RECENT
 *     fields are pushed; EXTERNAL_SYSTEM-owned fields are skipped).
 *   - Pushes permitted fields to ServiceTitan via the CRM v2 API.
 *   - Stores the returned ST customer ID on the local record after create.
 *   - Classifies failures for diagnostic reporting.
 *
 * Stage 2B-A Hardening:
 *   - Mock mode (mock_st_api) secured via testHarnessGuard — ignored in production.
 *   - Failure classification via outboundFailureClassification.ts.
 *   - Production policy remains EXTERNAL_TO_LVC until readiness is verified.
 */

import {
  registerSubscriberHandler,
  type SubscriberHandler,
} from "../businessEvent/subscriberHandlerRegistry.ts";
import { getEffectivePolicy } from "../syncPolicy/syncPolicyService.ts";
import { resolveFieldAuthority } from "../syncPolicy/fieldAuthorityService.ts";
import { pushCustomerToServiceTitan, type OutboundCustomerPayload } from "./customerOutboundApi.ts";
import { parseMetadata } from "./testHarnessGuard.ts";

export const OUTBOUND_HANDLER_REF = "customer.sync.outbound";

// Fields eligible for outbound push (must pass field-authority check)
const OUTBOUND_CANDIDATE_FIELDS = [
  "name",
  "customer_type",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
];

export const customerOutboundSubscriber: SubscriberHandler = async (
  event,
  delivery,
  context
) => {
  const { base44 } = context;

  // ── Loop prevention: only process LVC-originated events ──
  if (event.source_system !== "lvc_os") {
    return {
      success: true,
      summary: "Skipped — external-originated event (inbound subscriber handles this)",
      output: { skipped: true, reason: "external_origin" },
    };
  }

  // ── Parse payload ──
  let data: any;
  try {
    data = JSON.parse(event.payload);
  } catch {
    return {
      success: false,
      summary: "Invalid event payload — not valid JSON",
      error: "Payload is not valid JSON",
      retryable: false,
    };
  }

  const action = event.event_type.split(".")[1] || "updated";
  const customerId = data.customer_id || event.entity_id;
  const meta = parseMetadata(event.metadata);

  // ── Secure test-only behavior ──
  // mock_st_api is honored ONLY when is_validation_authorized is true
  // (set by processDeliveryById after server-side VR verification).
  // The token never enters persisted metadata. Production events are
  // never dispatched through processDeliveryById, so mock mode is
  // always false in production.
  const isValidationAuthorized = context.is_validation_authorized === true;
  const mockMode = isValidationAuthorized && meta?.mock_st_api === true;

  // ── 1. Check SyncPolicy ──
  const policy = await getEffectivePolicy(base44, "Customer", "servicetitan");
  if (!policy) {
    return {
      success: false,
      summary: "No active SyncPolicy for Customer:servicetitan",
      error: "No active SyncPolicy — cannot determine outbound permission",
      retryable: false,
    };
  }
  if (!policy.sync_enabled) {
    return {
      success: true,
      summary: "Sync disabled by policy",
      output: { skipped: true, reason: "sync_disabled" },
    };
  }
  const mode = policy.sync_mode;
  if (mode !== "TWO_WAY" && mode !== "LVC_TO_EXTERNAL") {
    return {
      success: true,
      summary: `Policy mode '${mode}' does not permit outbound push`,
      output: { skipped: true, reason: "mode_not_permitted", policy_mode: mode },
    };
  }

  // ── 2. Filter fields by SyncFieldAuthority ──
  const permittedFields: Record<string, any> = {};
  const skippedFields: string[] = [];
  for (const field of OUTBOUND_CANDIDATE_FIELDS) {
    const authority = await resolveFieldAuthority(
      base44,
      "Customer",
      field,
      "servicetitan",
      policy.id
    );
    if (authority === "LVC_OS" || authority === "MOST_RECENT") {
      if (data[field] != null && String(data[field]).trim()) {
        permittedFields[field] = data[field];
      }
    } else {
      skippedFields.push(field);
    }
  }

  // Always include servicetitan_customer_id for update routing
  if (data.servicetitan_customer_id) {
    permittedFields.servicetitan_customer_id = data.servicetitan_customer_id;
  }

  if (!permittedFields.name) {
    return {
      success: false,
      summary: "Cannot push — 'name' is required by ST CRM v2 but is not LVC-owned or not populated",
      error: "Missing required field: name",
      retryable: false,
      output: { failure_type: "mapping_failure" },
    };
  }

  // ── 3. Push to ServiceTitan (or mock) ──
  let result;
  if (mockMode) {
    result = {
      success: true,
      action: permittedFields.servicetitan_customer_id ? "updated" : "created",
      servicetitan_customer_id: permittedFields.servicetitan_customer_id || "MOCK-ST-ID",
    };
  } else {
    result = await pushCustomerToServiceTitan(permittedFields as OutboundCustomerPayload);
  }

  // ── 4. Store the ST customer ID back on the local record (after create) ──
  if (result.success && result.action === "created" && result.servicetitan_customer_id && !mockMode) {
    try {
      await base44.asServiceRole.entities.Customer.update(customerId, {
        servicetitan_customer_id: result.servicetitan_customer_id,
        servicetitan_sync_status: "synced",
        servicetitan_source: "api",
        servicetitan_last_sync: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[STAGE 2B-A] Failed to store ST customer ID on local record:", err);
    }
  }

  return {
    success: result.success,
    summary: result.success
      ? `Customer ${result.action} in ServiceTitan (${result.servicetitan_customer_id})`
      : `Outbound push failed: ${result.error}`,
    error: result.error,
    retryable: result.retryable,
    output: {
      action: result.action,
      servicetitan_customer_id: result.servicetitan_customer_id,
      permitted_fields: Object.keys(permittedFields).filter(
        (f) => f !== "servicetitan_customer_id"
      ),
      skipped_fields: skippedFields,
      policy_mode: mode,
      mock: mockMode,
      failure_type: result.failure_type,
    },
  };
};

export function registerOutboundSubscriber(): void {
  registerSubscriberHandler(OUTBOUND_HANDLER_REF, customerOutboundSubscriber);
}