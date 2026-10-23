/**
 * Stage 2D Appointment Test Setup (Shared)
 *
 * Creates and cleans up real test data for Stage 2D validation suites.
 * All test records use a unique prefix to ensure cleanup isolation.
 *
 * NO ServiceTitan API calls are made — all data is local only.
 */

export interface TestSetup {
  customers: any[];
  jobs: any[];
  employees: any[];
  appointments: string[];
  timelineEntries: string[];
}

export function createTestSetup(): TestSetup {
  return { customers: [], jobs: [], employees: [], appointments: [], timelineEntries: [] };
}

export async function createTestCustomer(
  base44: any,
  stCustomerId: string,
  name: string
): Promise<any> {
  return await base44.asServiceRole.entities.Customer.create({
    name,
    servicetitan_customer_id: stCustomerId,
    servicetitan_sync_status: "synced",
    servicetitan_source: "manual",
    status: "active",
    import_source: "manual",
    address: "123 Test St",
    city: "Testville",
    state: "PA",
    zip: "18001",
  });
}

export async function createTestJob(
  base44: any,
  stJobId: string,
  stJobNumber: string,
  customer: any
): Promise<any> {
  return await base44.asServiceRole.entities.Job.create({
    customer_id: customer.id,
    customer_name: customer.name,
    customer_number: customer.customer_number || "",
    servicetitan_job_id: stJobId,
    servicetitan_job_number: stJobNumber,
    servicetitan_customer_id: customer.servicetitan_customer_id,
    servicetitan_sync_status: "synced",
    servicetitan_source: "manual",
    service_date: "2026-07-22",
    address: "123 Test St",
    city: "Testville",
    state: "PA",
    zip: "18001",
    status: "scheduled",
    dispatch_status: "unassigned",
    priority: "normal",
    workflow_version: "v2_package",
    import_source: "manual",
    job_type: "inspection",
  });
}

export async function createTestEmployee(
  base44: any,
  stTechId: string,
  firstName: string,
  lastName: string,
  employmentStatus: string
): Promise<any> {
  return await base44.asServiceRole.entities.EmployeeRegistry.create({
    employee_id: `EMP-${stTechId}`,
    first_name: firstName,
    last_name: lastName,
    servicetitan_technician_id: stTechId,
    employment_status: employmentStatus,
    employment_type: "Full Time",
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@lvctest.com`,
    department: "Field Operations",
    account_status: "Active",
    invitation_status: "Linked",
    user_linked: true,
  });
}

export async function findAppointmentsByStId(
  base44: any,
  stAppointmentId: string
): Promise<any[]> {
  return await base44.asServiceRole.entities.Appointment.filter(
    { servicetitan_appointment_id: stAppointmentId },
    "-servicetitan_last_synced_at",
    10
  );
}

export async function cleanupTestSetup(base44: any, setup: TestSetup): Promise<void> {
  // Delete appointments
  for (const id of setup.appointments) {
    try { await base44.asServiceRole.entities.Appointment.delete(id); } catch {}
  }
  // Delete timeline entries
  for (const id of setup.timelineEntries) {
    try { await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.delete(id); } catch {}
  }
  // Delete employees
  for (const emp of setup.employees) {
    try { await base44.asServiceRole.entities.EmployeeRegistry.delete(emp.id); } catch {}
  }
  // Delete jobs
  for (const job of setup.jobs) {
    try { await base44.asServiceRole.entities.Job.delete(job.id); } catch {}
  }
  // Delete customers
  for (const cust of setup.customers) {
    try { await base44.asServiceRole.entities.Customer.delete(cust.id); } catch {}
  }
}

/**
 * Find and delete all appointments matching a test prefix.
 * Used for thorough cleanup after validation runs.
 */
export async function cleanupAppointmentsByPrefix(
  base44: any,
  prefix: string
): Promise<void> {
  try {
    const appts = await base44.asServiceRole.entities.Appointment.filter(
      { servicetitan_appointment_id: { $regex: prefix } },
      null,
      100
    );
    for (const a of appts) {
      try { await base44.asServiceRole.entities.Appointment.delete(a.id); } catch {}
    }
  } catch {}
}

/**
 * Find and delete all DeferredDependentRecord entries matching a prefix.
 */
export async function cleanupDeferredByPrefix(
  base44: any,
  prefix: string
): Promise<void> {
  try {
    const deferred = await base44.asServiceRole.entities.DeferredDependentRecord.filter(
      { servicetitan_entity_id: { $regex: prefix } },
      null,
      50
    );
    for (const d of deferred) {
      try { await base44.asServiceRole.entities.DeferredDependentRecord.delete(d.id); } catch {}
    }
  } catch {}
}