/**
 * Appointment Relationship Resolver (Stage 2D)
 *
 * Resolves the canonical LVC OS Job and Customer for an incoming
 * ServiceTitan Appointment event, enforcing the approved dependency
 * resolution order:
 *
 *   1. Read the Appointment's ServiceTitan Job ID.
 *   2. Resolve the canonical LVC OS Job by servicetitan_job_id.
 *   3. Confirm the Job's canonical Customer.
 *   4. Compare the payload Customer ID, when present, with the Job's Customer.
 *   5. Link the Appointment to the canonical Job and Customer.
 *   6. Reject or defer contradictions without guessing.
 *
 * Appointment-before-Job behavior:
 *   - If the Job is not found locally, returns "deferred" (retryable).
 *   - No Appointment is created.
 *   - The same delivery can be replayed after the Job is synchronized.
 *
 * Contradictory identifiers:
 *   - If the payload's servicetitan_customer_id resolves to a different
 *     local Customer than the Job's customer_id, returns "contradiction"
 *     (non-retryable unless data is corrected).
 *
 * No ServiceTitan API calls are made by this resolver — it reads only
 * from the local database.
 */

export interface RelationshipResolution {
  status: "resolved" | "deferred" | "contradiction" | "no_job_id";
  job_id?: string;
  customer_id?: string;
  customer_name?: string;
  warning?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Resolve the local Job and Customer for an incoming Appointment event.
 *
 * @param base44 - Base44 SDK client
 * @param servicetitan_job_id - ST Job ID from the appointment payload
 * @param servicetitan_customer_id - ST Customer ID from the appointment payload (may be empty)
 * @returns RelationshipResolution with resolved local IDs or deferral/contradiction
 */
export async function resolveAppointmentRelationships(
  base44: any,
  servicetitan_job_id: string,
  servicetitan_customer_id: string
): Promise<RelationshipResolution> {
  // ── No Job ID in payload — cannot resolve ──
  if (!servicetitan_job_id) {
    return {
      status: "no_job_id",
      warning: "No servicetitan_job_id in appointment payload — cannot resolve Job relationship",
    };
  }

  // ── Find the local Job by servicetitan_job_id ──
  let jobs: any[] = [];
  try {
    jobs = await base44.asServiceRole.entities.Job.filter(
      { servicetitan_job_id },
      null,
      1
    );
  } catch (err) {
    console.error("[STAGE 2D] Job lookup failed:", err);
    return {
      status: "deferred",
      warning: `Job lookup error for servicetitan_job_id '${servicetitan_job_id}'`,
      error: `Job lookup error: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }

  // ── Job not found locally → deferred (retryable) ──
  if (jobs.length === 0) {
    return {
      status: "deferred",
      warning: `Job not found locally for servicetitan_job_id '${servicetitan_job_id}' — appointment deferred`,
      error: "Job not yet synchronized — appointment deferred",
      retryable: true,
    };
  }

  const job = jobs[0];
  const localCustomerId = job.customer_id || "";
  const localCustomerName = job.customer_name || "";

  // ── If the Job has no canonical Customer, the dependency chain is broken ──
  // The Appointment cannot be linked without a Customer. Defer (retryable)
  // so the same delivery can be replayed after the Job's Customer is assigned.
  if (!localCustomerId) {
    return {
      status: "deferred",
      job_id: job.id,
      warning: `Job '${servicetitan_job_id}' has no canonical Customer — appointment deferred until Customer is assigned`,
      error: "Job has no Customer — appointment deferred (Customer→Job→Appointment dependency not met)",
      retryable: true,
    };
  }

  // ── If payload has a customer_id, verify it matches the Job's customer ──
  if (servicetitan_customer_id && localCustomerId) {
    let payloadCustomers: any[] = [];
    try {
      payloadCustomers = await base44.asServiceRole.entities.Customer.filter(
        { servicetitan_customer_id },
        null,
        1
      );
    } catch (err) {
      console.error("[STAGE 2D] Customer lookup failed:", err);
      // If we can't verify, don't block — proceed with Job's customer
    }

    if (payloadCustomers.length > 0) {
      const payloadCustomer = payloadCustomers[0];
      if (payloadCustomer.id !== localCustomerId) {
        return {
          status: "contradiction",
          error: `Customer contradiction: Job's customer (${localCustomerId}) does not match payload customer (${payloadCustomer.id}) for servicetitan_customer_id '${servicetitan_customer_id}'`,
          retryable: false,
        };
      }
    }
  }

  // ── Resolved successfully ──
  return {
    status: "resolved",
    job_id: job.id,
    customer_id: localCustomerId,
    customer_name: localCustomerName,
  };
}