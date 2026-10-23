/**
 * ServiceTitan Customer Merge Helpers
 *
 * Relinks all records that reference a source customer to the surviving
 * (target) customer during a merge operation. Preserves all historical
 * records — nothing is deleted.
 *
 * P4 — Transactional: If ANY relink fails, the error propagates to the
 * caller. The caller MUST NOT mark the customer as merged or advance
 * the continuation token when this throws. Already-relinked records
 * stay relinked; on retry, only remaining records are processed.
 *
 * P5 — Pagination: Processes ALL matching records using cursor-based
 * pagination. After each batch is updated, those records no longer
 * match the source customer filter, so the next query fetches the next
 * batch. No 500-record limit.
 *
 * Entities relinked:
 *   - Appointment (customer_id, customer_name)
 *   - Job (customer_id, customer_number, customer_name)
 *   - Invoice (customer_id, customer_name)
 *   - Estimate (customer_id, customer_name)
 *   - Membership (customer_id, customer_name)
 *   - SalesOrder (customer_id, customer_name)
 *   - ScopeOfWork (customer_id, customer_name)
 *   - PropertyProfile (customer_id, customer_name)
 *   - Location (customer_id, customer_name)
 *   - EnterpriseTask (related_customer)
 *   - EnterpriseNotification (related_customer)
 */

export interface RelinkResult {
  appointments: number;
  jobs: number;
  invoices: number;
  estimates: number;
  memberships: number;
  sales_orders: number;
  scopes_of_work: number;
  property_profiles: number;
  locations: number;
  tasks: number;
  notifications: number;
}

/**
 * Relink all records that reference the source customer to the surviving
 * (target) customer. Preserves all historical records — nothing is deleted.
 *
 * Transactional: throws on any failure so the caller can rollback.
 * Paginated: processes all records, not just the first 500.
 */
export async function relinkCustomerRecords(
  base44: any,
  sourceCustomerId: string,
  targetCustomer: any
): Promise<RelinkResult> {
  const targetName = targetCustomer.name || "";
  const targetNumber = targetCustomer.customer_number || "";
  const targetId = targetCustomer.id;

  let apptCount = 0;
  let jobCount = 0;
  let invCount = 0;
  let estCount = 0;
  let memCount = 0;
  let soCount = 0;
  let sowCount = 0;
  let ppCount = 0;
  let locCount = 0;
  let taskCount = 0;
  let notifCount = 0;

  // ── Helper: paginate + relink for a simple customer_id + customer_name entity ──
  async function relinkEntity(
    entityName: string,
    filterField: string,
    updateFields: Record<string, any>,
    label: string
  ): Promise<number> {
    let count = 0;
    while (true) {
      const records = await base44.asServiceRole.entities[entityName].filter(
        { [filterField]: sourceCustomerId },
        "-created_date",
        500
      );
      if (!records || records.length === 0) break;
      for (const record of records) {
        await base44.asServiceRole.entities[entityName].update(record.id, updateFields);
        count++;
      }
      if (records.length < 500) break;
    }
    if (count > 0) {
      console.log(`[ST MERGE] Relinked ${count} ${label} from source '${sourceCustomerId}' to target '${targetId}'`);
    }
    return count;
  }

  // ── Relink entities with customer_id + customer_name ──
  apptCount = await relinkEntity("Appointment", "customer_id", { customer_id: targetId, customer_name: targetName }, "appointments");
  jobCount = await relinkEntity("Job", "customer_id", { customer_id: targetId, customer_number: targetNumber, customer_name: targetName }, "jobs");
  invCount = await relinkEntity("Invoice", "customer_id", { customer_id: targetId, customer_name: targetName }, "invoices");
  estCount = await relinkEntity("Estimate", "customer_id", { customer_id: targetId, customer_name: targetName }, "estimates");
  memCount = await relinkEntity("Membership", "customer_id", { customer_id: targetId, customer_name: targetName }, "memberships");
  soCount = await relinkEntity("SalesOrder", "customer_id", { customer_id: targetId, customer_name: targetName }, "sales orders");
  sowCount = await relinkEntity("ScopeOfWork", "customer_id", { customer_id: targetId, customer_name: targetName }, "scopes of work");
  ppCount = await relinkEntity("PropertyProfile", "customer_id", { customer_id: targetId, customer_name: targetName }, "property profiles");
  locCount = await relinkEntity("Location", "customer_id", { customer_id: targetId, customer_name: targetName }, "locations");

  // ── Relink entities with related_customer (stores customer entity ID) ──
  taskCount = await relinkEntity("EnterpriseTask", "related_customer", { related_customer: targetId }, "tasks");
  notifCount = await relinkEntity("EnterpriseNotification", "related_customer", { related_customer: targetId }, "notifications");

  return {
    appointments: apptCount,
    jobs: jobCount,
    invoices: invCount,
    estimates: estCount,
    memberships: memCount,
    sales_orders: soCount,
    scopes_of_work: sowCount,
    property_profiles: ppCount,
    locations: locCount,
    tasks: taskCount,
    notifications: notifCount,
  };
}