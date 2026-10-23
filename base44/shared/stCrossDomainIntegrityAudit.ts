/**
 * ServiceTitan Cross-Domain Integrity Audit Module
 *
 * Read-only audit that verifies relationships, ordering, traceability, and
 * consistency across Customer, Job, Appointment, EmployeeRegistry, webhook
 * events, timelines, replays, and conflict histories.
 *
 * SAFETY: This module NEVER creates, updates, merges, deletes, relinks,
 * replays, retries, or recovers any record. It only reads and reports.
 *
 * ARCHITECTURE:
 *   runServiceTitanIntegrityAudit (backend function)
 *       │
 *       ▼
 *   runAudit(base44, config) → AuditResult
 *       │
 *       ├── checkCustomerIdentityIntegrity
 *       ├── checkJobIdentityIntegrity
 *       ├── checkJobToCustomerRelationships
 *       ├── checkAppointmentIdentityIntegrity
 *       ├── checkAppointmentToJobRelationships
 *       ├── checkCustomerJobAppointmentChain
 *       ├── checkTechnicianIdentityIntegrity
 *       ├── checkTechnicianRelationshipsOnJobsAndAppointments
 *       ├── checkEventOrderingIntegrity
 *       ├── checkWebhookEventIntegrity
 *       ├── checkAtomicClaimAndRecoveryIntegrity
 *       ├── checkTimelineIntegrity
 *       ├── checkReplayAndRetryIntegrity
 *       ├── checkConflictHistoryIntegrity
 *       ├── checkLvcFieldOwnershipAudit
 *       └── buildDuplicateAndOrphanSummary
 *
 * PERFORMANCE:
 *   - All queries use pagination (batch size 200)
 *   - Relationship lookups are batched into Maps to avoid N+1 queries
 *   - Each check is wrapped in try/catch — partial failure does not lose the audit
 *   - The audit can handle 5,000+ records per entity
 *
 * FINGERPRINTS:
 *   Every issue has a deterministic fingerprint so repeated audits identify the
 *   same unresolved issue rather than presenting it as new.
 */

import { WEBHOOK_PROCESSING_TIMEOUT_MINUTES, isStaleProcessing } from "./stWebhookHelpers.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low" | "informational";

export type AuditMode = "summary" | "full" | "record" | "report";

export interface AuditConfig {
  mode: AuditMode;
  domain?: string;
  local_record_id?: string;
  servicetitan_id?: string;
}

export type IssueCategory = "synchronization" | "legacy_migration";

export interface AuditIssue {
  fingerprint: string;
  severity: Severity;
  category: IssueCategory;
  domain: string;
  check_name: string;
  record_type: string;
  local_record_id: string;
  servicetitan_id: string;
  relationship: string;
  current_state: string;
  expected_state: string;
  recommended_correction: string;
  safe_to_auto_fix: boolean;
}

export interface AuditCheck {
  name: string;
  domain: string;
  description: string;
  passed: boolean;
  issues_found: number;
  error?: string;
  records_scanned: number;
}

export interface GroupedFinding {
  check_name: string;
  relationship: string;
  category: IssueCategory;
  severity: Severity;
  count: number;
}

export interface FindingsByCheck {
  check_name: string;
  total_count: number;
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

export interface AuditResult {
  audit_id: string;
  started_at: string;
  completed_at: string;
  mode: AuditMode;
  records_scanned: {
    customers: number;
    jobs: number;
    appointments: number;
    employees: number;
    webhook_events: number;
    timelines: number;
    replays: number;
  };
  issue_counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  sync_issue_counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  integrity_status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
  migration_summary: {
    legacy_customers: number;
    legacy_jobs: number;
    legacy_appointments: number;
    total_migration_opportunities: number;
    recommended_migration: string;
    estimated_effort: string;
  };
  migration_status: "NO_MIGRATION_NEEDED" | "MIGRATION_RECOMMENDED" | "MIGRATION_REQUIRED";
  checks: AuditCheck[];
  issues: AuditIssue[];
  grouped_findings: GroupedFinding[];
  synchronization_findings_by_check: FindingsByCheck[];
  legacy_migration_findings_by_check: FindingsByCheck[];
  recommendations: string[];
  partial_failures: string[];
}

// ─── LVC-Owned Protected Fields ───────────────────────────────────────────────

/**
 * Fields that ServiceTitan must NEVER overwrite.
 * If a conflict-history entry targets any of these fields, it's a critical issue.
 */
export const LVC_PROTECTED_FIELDS: Record<string, string[]> = {
  customer: [
    "notes", "portal_user_email", "tags", "ai_summaries",
    "customer_scoring", "internal_classifications", "task_history",
    "workflow_state", "inspection_history", "sales_history",
    "attachments", "documents",
  ],
  job: [
    "notes", "priority", "workflow_version", "assigned_truck_id",
    "assigned_truck_number", "auto_assigned_truck",
    "truck_assignment_source", "truck_assignment_status",
    "truck_override_used", "truck_override_reason",
    "truck_override_by", "truck_override_at",
    "apprentice_email", "apprentice_name",
    "job_hub_progress", "inspection_records", "repair_recommendations",
    "proposal_state", "ai_summaries", "sales_coaching",
    "task_history", "photos", "documents", "signatures",
    "internal_classifications", "quality_control_state",
    "commission_state", "inventory_workflow_state",
    "warehouse_workflow_state",
  ],
  appointment: [
    "notes", "assigned_vehicle", "auto_assigned_truck",
    "truck_assignment_source", "truck_assignment_status",
    "truck_override_used", "truck_override_reason",
    "truck_override_by", "truck_override_at",
    "crew_assignment", "planned_hours", "actual_hours",
    "production_variance_reason", "expected_daily_scope",
    "expected_hours", "daily_production_goal",
    "expected_equipment", "expected_materials",
  ],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;
const MAX_BATCHES = 50; // 200 × 50 = 10,000 records max per entity

/**
 * Relationship identifiers that are eligible for legacy_migration
 * classification — but ONLY when the affected record is itself legacy
 * (i.e., predates ServiceTitan synchronization).
 *
 * These relationships represent issues caused specifically by missing
 * ServiceTitan migration data, not by genuine integrity defects.
 *
 * All other relationships remain "synchronization" findings regardless
 * of whether the record is legacy.
 */
const LEGACY_ELIGIBLE_RELATIONSHIPS: Set<string> = new Set([
  // customer_identity_integrity
  "missing_servicetitan_customer_id",
  // job_identity_integrity
  "missing_servicetitan_job_id",
  "completed_without_completion_metadata",
  // job_to_customer_relationship
  "missing_customer_relationship",
  // appointment_identity_integrity
  "missing_servicetitan_appointment_id",
  "status_completed_without_metadata",
  // appointment_to_job_relationship
  "appointment_without_job",
]);

// ─── Utility Functions ────────────────────────────────────────────────────────

function generateAuditId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `AUDIT-${ts}-${rand}`;
}

function makeFingerprint(parts: string[]): string {
  return parts.filter(Boolean).join("::").toLowerCase().replace(/\s+/g, "_");
}

function isValidDate(val: any): boolean {
  if (!val) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

/**
 * Determines whether a record was created before ServiceTitan synchronization
 * was activated (i.e., it's a legacy record, not a sync artifact).
 *
 * Legacy records are flagged as "legacy_migration" opportunities rather than
 * synchronization failures, so they don't affect the PASS/FAIL result.
 */
function isLegacyRecord(record: any): boolean {
  if (!record) return false;
  // A synced record has servicetitan_source="webhook" or servicetitan_sync_version > 0
  if (record.servicetitan_source === "webhook") return false;
  if (record.servicetitan_sync_version && record.servicetitan_sync_version > 0) return false;
  return true;
}

function safeParseJson(str: any): { parsed: any[] | null; error: string | null } {
  if (!str) return { parsed: [], error: null };
  try {
    const obj = typeof str === "string" ? JSON.parse(str) : str;
    if (Array.isArray(obj)) return { parsed: obj, error: null };
    if (obj && typeof obj === "object") return { parsed: [obj], error: null };
    return { parsed: null, error: "JSON is not an array or object" };
  } catch (err) {
    return { parsed: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Paginated entity fetcher — loads all records in batches.
 * Returns an empty array on error (partial failure handled by caller).
 */
async function fetchAll(
  base44: any,
  entityName: string,
  filter: Record<string, any> = {},
  sort: string | null = null
): Promise<any[]> {
  const all: any[] = [];
  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const batch = await base44.asServiceRole.entities[entityName].filter(
        filter, sort, BATCH_SIZE, i * BATCH_SIZE
      );
      if (!batch || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error(`[ST AUDIT] fetchAll(${entityName}) failed:`, err);
  }
  return all;
}

/**
 * Fetch a single record by ID with graceful error handling.
 */
async function fetchOne(base44: any, entityName: string, id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await base44.asServiceRole.entities[entityName].get(id);
  } catch {
    return null;
  }
}

// ─── Audit Context ───────────────────────────────────────────────────────────

interface AuditContext {
  base44: any;
  config: AuditConfig;
  issues: AuditIssue[];
  checks: AuditCheck[];
  recommendations: string[];
  partialFailures: string[];
  recordsScanned: AuditResult["records_scanned"];
  migrationSummary: {
    legacy_customers: number;
    legacy_jobs: number;
    legacy_appointments: number;
    total_migration_opportunities: number;
  };
  legacyRecordIds: Set<string>;
}

function addIssue(
  ctx: AuditContext,
  checkName: string,
  domain: string,
  recordType: string,
  localId: string,
  stId: string,
  relationship: string,
  currentState: string,
  expectedState: string,
  recommendedCorrection: string,
  severity: Severity,
  safeToAutoFix: boolean = false,
  category: IssueCategory = "synchronization"
): void {
  const fingerprint = makeFingerprint([domain, checkName, recordType, localId || stId, relationship]);
  // Deduplicate within the same audit run
  if (ctx.issues.some(i => i.fingerprint === fingerprint)) return;
  ctx.issues.push({
    fingerprint,
    severity,
    category,
    domain,
    check_name: checkName,
    record_type: recordType,
    local_record_id: localId,
    servicetitan_id: stId,
    relationship,
    current_state: currentState,
    expected_state: expectedState,
    recommended_correction: recommendedCorrection,
    safe_to_auto_fix: safeToAutoFix,
  });
}

function recordCheck(
  ctx: AuditContext,
  name: string,
  domain: string,
  description: string,
  issuesFound: number,
  recordsScanned: number,
  error?: string
): void {
  ctx.checks.push({
    name,
    domain,
    description,
    passed: error ? false : issuesFound === 0,
    issues_found: issuesFound,
    error,
    records_scanned: recordsScanned,
  });
  if (error) {
    ctx.partialFailures.push(`${name}: ${error}`);
  }
}

// ─── 1. Customer Identity Integrity ──────────────────────────────────────────

async function checkCustomerIdentityIntegrity(ctx: AuditContext, customers: any[]): Promise<void> {
  const checkName = "customer_identity_integrity";
  let issues = 0;

  try {
    // Build a map of servicetitan_customer_id → array of records for duplicate detection
    const idMap = new Map<string, any[]>();
    const eventAtMap = new Map<string, boolean>(); // track valid event_at

    for (const c of customers) {
      const stId = c.servicetitan_customer_id || "";

      // Check: every synced customer has a non-empty servicetitan_customer_id
      if (!stId && c.servicetitan_sync_status && c.servicetitan_sync_status !== "deleted") {
        addIssue(ctx, checkName, "customer", "Customer", c.id, "",
          "missing_servicetitan_customer_id",
          `Customer has sync_status='${c.servicetitan_sync_status}' but no servicetitan_customer_id`,
          "Every synced customer must have a servicetitan_customer_id",
          "Set the servicetitan_customer_id or mark as non-synced", "high");
        issues++;
      }

      if (stId) {
        if (!idMap.has(stId)) idMap.set(stId, []);
        idMap.get(stId)!.push(c);
      }

      // Check: servicetitan_last_event_at is valid when populated
      if (c.servicetitan_last_event_at && !isValidDate(c.servicetitan_last_event_at)) {
        addIssue(ctx, checkName, "customer", "Customer", c.id, stId,
          "invalid_last_event_at",
          `servicetitan_last_event_at='${c.servicetitan_last_event_at}' is not a valid date`,
          "servicetitan_last_event_at must be a valid ISO timestamp when populated",
          "Correct or clear the invalid timestamp", "medium");
        issues++;
      }

      // Check: sync status agrees with deleted state
      const isDeleted = c.servicetitan_deleted === true;
      const syncStatus = c.servicetitan_sync_status;
      if (isDeleted && syncStatus !== "deleted" && syncStatus !== "merged") {
        addIssue(ctx, checkName, "customer", "Customer", c.id, stId,
          "sync_status_deleted_mismatch",
          `servicetitan_deleted=true but sync_status='${syncStatus}'`,
          "sync_status should be 'deleted' when servicetitan_deleted is true",
          "Update sync_status to 'deleted'", "medium");
        issues++;
      }

      // Check: restored customers are not marked deleted
      if (!isDeleted && syncStatus === "deleted") {
        addIssue(ctx, checkName, "customer", "Customer", c.id, stId,
          "restored_but_marked_deleted",
          "servicetitan_deleted=false but sync_status='deleted'",
          "sync_status should not be 'deleted' when servicetitan_deleted is false",
          "Update sync_status to 'synced' or set servicetitan_deleted=true", "medium");
        issues++;
      }

      // Check: merged customers point to a valid surviving customer
      if (syncStatus === "merged") {
        if (!c.servicetitan_merged_into) {
          addIssue(ctx, checkName, "customer", "Customer", c.id, stId,
            "merged_without_target",
            "sync_status='merged' but servicetitan_merged_into is empty",
            "Merged customers must point to a surviving customer",
            "Set servicetitan_merged_into to the surviving customer ID", "high");
          issues++;
        }
      }

      // Check: conflict-history JSON is valid
      if (c.sync_conflict_history_json) {
        const { parsed, error } = safeParseJson(c.sync_conflict_history_json);
        if (error) {
          addIssue(ctx, checkName, "customer", "Customer", c.id, stId,
            "malformed_conflict_history_json",
            `sync_conflict_history_json is not valid JSON: ${error}`,
            "Conflict history must be valid JSON",
            "Repair or clear the malformed JSON", "high");
          issues++;
        }
      }
    }

    // Check: duplicate servicetitan_customer_id (critical)
    for (const [stId, records] of idMap) {
      const active = records.filter(r => !r.servicetitan_deleted && r.servicetitan_sync_status !== "merged" && r.servicetitan_sync_status !== "deleted");
      if (active.length > 1) {
        for (const r of active) {
          addIssue(ctx, checkName, "customer", "Customer", r.id, stId,
            "duplicate_servicetitan_customer_id",
            `${active.length} active customers share servicetitan_customer_id '${stId}' (IDs: ${active.map(a => a.id).join(", ")})`,
            "Each servicetitan_customer_id must map to exactly one active customer",
            "Merge duplicate customers, keeping the canonical record", "critical");
          issues++;
        }
      }
    }

    recordCheck(ctx, checkName, "customer", "Customer identity, duplicates, merge, soft-delete, and event-timestamp integrity", issues, customers.length);
  } catch (err) {
    recordCheck(ctx, checkName, "customer", "Customer identity integrity", issues, customers.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 2. Job Identity Integrity ───────────────────────────────────────────────

async function checkJobIdentityIntegrity(ctx: AuditContext, jobs: any[]): Promise<void> {
  const checkName = "job_identity_integrity";
  let issues = 0;

  try {
    const idMap = new Map<string, any[]>();

    for (const j of jobs) {
      const stId = j.servicetitan_job_id || "";

      if (!stId && j.servicetitan_sync_status && j.servicetitan_sync_status !== "deleted") {
        addIssue(ctx, checkName, "job", "Job", j.id, "",
          "missing_servicetitan_job_id",
          `Job has sync_status='${j.servicetitan_sync_status}' but no servicetitan_job_id`,
          "Every synced job must have a servicetitan_job_id",
          "Set the servicetitan_job_id or mark as non-synced", "high");
        issues++;
      }

      if (stId) {
        if (!idMap.has(stId)) idMap.set(stId, []);
        idMap.get(stId)!.push(j);
      }

      // Check: servicetitan_last_event_at is valid when populated
      if (j.servicetitan_last_event_at && !isValidDate(j.servicetitan_last_event_at)) {
        addIssue(ctx, checkName, "job", "Job", j.id, stId,
          "invalid_last_event_at",
          `servicetitan_last_event_at='${j.servicetitan_last_event_at}' is not a valid date`,
          "Must be a valid ISO timestamp",
          "Correct or clear the invalid timestamp", "medium");
        issues++;
      }

      // Check: completed jobs have completion metadata
      if (j.servicetitan_raw_status === "completed" || j.status === "completed") {
        if (!j.completed_at) {
          addIssue(ctx, checkName, "job", "Job", j.id, stId,
            "completed_without_completion_metadata",
            `Job status='completed' but completed_at is empty`,
            "Completed jobs must have completed_at and completed_source",
            "Set completed_at and completed_source",
            "medium");
          issues++;
        }
      }

      // Check: reopened jobs preserve prior completion history
      if (j.servicetitan_raw_status === "reopened" && j.completed_at && !j.reopened_history_json) {
        addIssue(ctx, checkName, "job", "Job", j.id, stId,
          "reopened_without_history",
          "Job was reopened and has prior completed_at but no reopened_history_json",
          "Reopened jobs must preserve prior completion history",
          "Reconstruct reopened_history_json from timeline", "low");
        issues++;
      }

      // Check: conflict-history JSON is valid
      if (j.sync_conflict_history_json) {
        const { parsed, error } = safeParseJson(j.sync_conflict_history_json);
        if (error) {
          addIssue(ctx, checkName, "job", "Job", j.id, stId,
            "malformed_conflict_history_json",
            `sync_conflict_history_json is not valid JSON: ${error}`,
            "Must be valid JSON",
            "Repair or clear the malformed JSON", "high");
          issues++;
        }
      }
    }

    // Check: duplicate servicetitan_job_id (critical)
    for (const [stId, records] of idMap) {
      const active = records.filter(r => !r.servicetitan_deleted && r.servicetitan_sync_status !== "deleted");
      if (active.length > 1) {
        for (const r of active) {
          addIssue(ctx, checkName, "job", "Job", r.id, stId,
            "duplicate_servicetitan_job_id",
            `${active.length} active jobs share servicetitan_job_id '${stId}' (IDs: ${active.map(a => a.id).join(", ")})`,
            "Each servicetitan_job_id must map to exactly one active job",
            "Merge duplicate jobs, keeping the canonical record", "critical");
          issues++;
        }
      }
    }

    recordCheck(ctx, checkName, "job", "Job identity, duplicates, completion, reopening, and conflict-history integrity", issues, jobs.length);
  } catch (err) {
    recordCheck(ctx, checkName, "job", "Job identity integrity", issues, jobs.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 3. Job-to-Customer Relationships ────────────────────────────────────────

async function checkJobToCustomerRelationships(
  ctx: AuditContext,
  jobs: any[],
  customerMap: Map<string, any>
): Promise<void> {
  const checkName = "job_to_customer_relationship";
  let issues = 0;

  try {
    for (const j of jobs) {
      const stCustId = j.servicetitan_customer_id || "";
      const mappingStatus = j.customer_mapping_status || "";

      if (!stCustId) {
        // No ST customer ID — check if this is expected
        if (mappingStatus !== "unmatched") {
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "missing_customer_relationship",
            `Job has no servicetitan_customer_id but mapping_status='${mappingStatus}'`,
            "Jobs without a customer ID should have mapping_status='unmatched'",
            "Set mapping_status to 'unmatched' or supply a customer ID",
            "high");
          issues++;
        }
        continue;
      }

      // Check customer exists
      const customer = customerMap.get(stCustId);

      if (mappingStatus === "pending") {
        // Pending relationship — check if the customer now exists
        if (customer && !customer.servicetitan_deleted && customer.servicetitan_sync_status !== "merged") {
          const jobCreated = j.created_date ? new Date(j.created_date).getTime() : 0;
          const ageMs = Date.now() - jobCreated;
          const ageHours = Math.floor(ageMs / 3600000);
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "pending_customer_now_exists",
            `Job is pending customer '${stCustId}' but that customer now exists locally (pending for ${ageHours}h)`,
            "Automatic reconciliation should have resolved this pending relationship",
            "Run customer reconciliation for this customer ID", "high");
          issues++;
        } else {
          // Legitimate pending — customer not yet synced
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "pending_customer_not_yet_synced",
            `Job is pending customer '${stCustId}' which has not been synchronized yet`,
            "Pending relationship is valid; customer sync will resolve it",
            "No action needed — customer sync will resolve automatically", "informational");
          issues++;
        }
        continue;
      }

      if (mappingStatus === "matched") {
        // Verify the local customer exists and IDs match
        if (!customer) {
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "matched_customer_not_found",
            `Job is matched to customer '${stCustId}' but no local customer with that servicetitan_customer_id exists`,
            "Matched jobs must reference an existing local customer",
            "Re-run customer reconciliation or set mapping_status to 'pending'", "high");
          issues++;
        } else if (j.customer_id && j.customer_id !== customer.id && !j.customer_id.startsWith("pending:")) {
          // Job's customer_id doesn't match the customer found by servicetitan_customer_id
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "wrong_customer_link",
            `Job customer_id='${j.customer_id}' but servicetitan_customer_id='${stCustId}' resolves to customer '${customer.id}'`,
            "Job's customer_id must match the local customer found by servicetitan_customer_id",
            "Re-link the job to the correct customer", "critical");
          issues++;
        }

        // Check: job points to a merged-away customer
        if (customer && customer.servicetitan_sync_status === "merged" && customer.servicetitan_merged_into) {
          const survivor = customerMap.get(customer.servicetitan_merged_into);
          if (survivor) {
            addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
              "job_points_to_merged_customer",
              `Job references customer '${stCustId}' which was merged into '${customer.servicetitan_merged_into}'`,
              "Jobs should point to the surviving customer after a merge",
              "Re-link the job to the surviving customer", "high");
            issues++;
          }
        }
      }
    }

    recordCheck(ctx, checkName, "job", "Job-to-customer relationship validity (resolved, pending, unmatched)", issues, jobs.length);
  } catch (err) {
    recordCheck(ctx, checkName, "job", "Job-to-customer relationships", issues, jobs.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 4. Appointment Identity Integrity ───────────────────────────────────────

async function checkAppointmentIdentityIntegrity(ctx: AuditContext, appointments: any[]): Promise<void> {
  const checkName = "appointment_identity_integrity";
  let issues = 0;

  try {
    const idMap = new Map<string, any[]>();

    for (const a of appointments) {
      const stId = a.servicetitan_appointment_id || a.crm_appointment_id || "";

      if (!stId) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, "",
          "missing_servicetitan_appointment_id",
          "Appointment has no servicetitan_appointment_id or crm_appointment_id",
          "Every synced appointment must have a servicetitan_appointment_id",
          "Set the servicetitan_appointment_id or mark as non-synced",
          "high");
        issues++;
        continue;
      }

      if (!idMap.has(stId)) idMap.set(stId, []);
      idMap.get(stId)!.push(a);

      // Check: scheduled dates are valid
      if (a.scheduled_start && !isValidDate(a.scheduled_start)) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
          "invalid_scheduled_start",
          `scheduled_start='${a.scheduled_start}' is not a valid date`,
          "Must be a valid ISO timestamp",
          "Correct or clear the invalid date", "medium");
        issues++;
      }
      if (a.scheduled_end && !isValidDate(a.scheduled_end)) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
          "invalid_scheduled_end",
          `scheduled_end='${a.scheduled_end}' is not a valid date`,
          "Must be a valid ISO timestamp",
          "Correct or clear the invalid date", "medium");
        issues++;
      }

      // Check: end is after start
      if (a.scheduled_start && a.scheduled_end && isValidDate(a.scheduled_start) && isValidDate(a.scheduled_end)) {
        const start = new Date(a.scheduled_start).getTime();
        const end = new Date(a.scheduled_end).getTime();
        if (end <= start) {
          addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
            "invalid_date_range",
            `scheduled_end (${a.scheduled_end}) is not after scheduled_start (${a.scheduled_start})`,
            "End time must be after start time",
            "Correct the date range", "high");
          issues++;
        }
      }

      // Check: canceled/completed metadata agrees with status
      if (a.status === "cancelled" && !a.is_canceled) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
          "status_canceled_but_not_flagged",
          "status='cancelled' but is_canceled is false",
          "Canceled appointments must have is_canceled=true",
          "Set is_canceled=true", "medium");
        issues++;
      }
      if (a.status === "completed" && !a.completed_at) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
          "status_completed_without_metadata",
          "status='completed' but completed_at is empty",
          "Completed appointments must have completed_at",
          "Set completed_at",
          "low");
        issues++;
      }

      // Check: servicetitan_last_event_at is valid
      if (a.servicetitan_last_event_at && !isValidDate(a.servicetitan_last_event_at)) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
          "invalid_last_event_at",
          `servicetitan_last_event_at='${a.servicetitan_last_event_at}' is not a valid date`,
          "Must be valid ISO timestamp",
          "Correct or clear the invalid timestamp", "medium");
        issues++;
      }

      // Check: conflict-history JSON is valid
      if (a.sync_conflict_history_json) {
        const { error } = safeParseJson(a.sync_conflict_history_json);
        if (error) {
          addIssue(ctx, checkName, "appointment", "Appointment", a.id, stId,
            "malformed_conflict_history_json",
            `sync_conflict_history_json is not valid JSON: ${error}`,
            "Must be valid JSON",
            "Repair or clear the malformed JSON", "high");
          issues++;
        }
      }
    }

    // Check: duplicate appointment IDs (critical)
    for (const [stId, records] of idMap) {
      const active = records.filter(r => !r.is_canceled && r.status !== "cancelled");
      if (active.length > 1) {
        for (const r of active) {
          addIssue(ctx, checkName, "appointment", "Appointment", r.id, stId,
            "duplicate_servicetitan_appointment_id",
            `${active.length} active appointments share servicetitan_appointment_id '${stId}' (IDs: ${active.map(a => a.id).join(", ")})`,
            "Each servicetitan_appointment_id must map to exactly one active appointment",
            "Merge duplicate appointments, keeping the canonical record", "critical");
          issues++;
        }
      }
    }

    recordCheck(ctx, checkName, "appointment", "Appointment identity, duplicates, date validity, and status consistency", issues, appointments.length);
  } catch (err) {
    recordCheck(ctx, checkName, "appointment", "Appointment identity integrity", issues, appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 5. Appointment-to-Job Relationships ─────────────────────────────────────

async function checkAppointmentToJobRelationships(
  ctx: AuditContext,
  appointments: any[],
  jobMap: Map<string, any>
): Promise<void> {
  const checkName = "appointment_to_job_relationship";
  let issues = 0;

  try {
    for (const a of appointments) {
      const stJobId = a.servicetitan_job_id || "";
      const localJobId = a.job_id || "";

      if (!stJobId) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
          "appointment_without_job",
          "Appointment has no servicetitan_job_id",
          "Appointments should reference a ServiceTitan job",
          "Link the appointment to a job or mark as orphaned",
          "low");
        issues++;
        continue;
      }

      const job = jobMap.get(stJobId);

      if (!job) {
        // Job not yet synced — pending relationship
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
          "appointment_awaiting_job_reconciliation",
          `Appointment references job '${stJobId}' which has not been synchronized yet`,
          "Pending job relationship; job sync will resolve it",
          "No action needed — job sync will resolve automatically", "informational");
        issues++;
        continue;
      }

      // Check: local job_id matches the job found by servicetitan_job_id
      if (localJobId && localJobId !== job.id) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
          "wrong_job_link",
          `Appointment job_id='${localJobId}' but servicetitan_job_id='${stJobId}' resolves to job '${job.id}'`,
          "Appointment's local job_id must match the job found by servicetitan_job_id",
          "Re-link the appointment to the correct job", "critical");
        issues++;
      }
    }

    recordCheck(ctx, checkName, "appointment", "Appointment-to-job relationship validity (linked, pending, wrong-link)", issues, appointments.length);
  } catch (err) {
    recordCheck(ctx, checkName, "appointment", "Appointment-to-job relationships", issues, appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 6. Customer-Job-Appointment Chain Integrity ─────────────────────────────

async function checkCustomerJobAppointmentChain(
  ctx: AuditContext,
  appointments: any[],
  jobMap: Map<string, any>,
  customerMap: Map<string, any>
): Promise<void> {
  const checkName = "customer_job_appointment_chain";
  let issues = 0;
  const reportedChains = new Set<string>();

  try {
    for (const a of appointments) {
      const stJobId = a.servicetitan_job_id || "";
      if (!stJobId) continue; // already flagged in check 5

      const job = jobMap.get(stJobId);
      if (!job) continue; // pending — already flagged

      const stCustId = job.servicetitan_customer_id || "";
      const apptStCustId = a.servicetitan_customer_id || "";

      // If appointment has a customer ID, it must agree with the job's customer
      if (apptStCustId && stCustId && apptStCustId !== stCustId) {
        const chainKey = makeFingerprint([a.id, "customer_mismatch", apptStCustId, stCustId]);
        if (!reportedChains.has(chainKey)) {
          reportedChains.add(chainKey);
          addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
            "chain_customer_mismatch",
            `Appointment customer='${apptStCustId}' ≠ Job customer='${stCustId}' (Appointment→Job→Customer chain broken)`,
            "Appointment customer ID must match the job's customer ID",
            "Reconcile the customer IDs across the chain", "critical");
          issues++;
        }
      }

      // If job has a customer, verify the chain resolves
      if (stCustId) {
        const customer = customerMap.get(stCustId);
        if (customer && job.customer_id && job.customer_id !== customer.id && !job.customer_id.startsWith("pending:")) {
          const chainKey = makeFingerprint([job.id, "job_customer_mismatch", job.customer_id, customer.id]);
          if (!reportedChains.has(chainKey)) {
            reportedChains.add(chainKey);
            addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
              "chain_job_customer_link_broken",
              `Chain broken: Appointment→Job(${stJobId})→Customer: job.customer_id='${job.customer_id}' but ST customer '${stCustId}' resolves to '${customer.id}'`,
              "Job's customer_id must match the customer found by servicetitan_customer_id",
              "Re-link the job to the correct customer", "critical");
            issues++;
          }
        }

        // Check: merged customer chain
        if (customer && customer.servicetitan_sync_status === "merged" && customer.servicetitan_merged_into) {
          const survivor = customerMap.get(customer.servicetitan_merged_into);
          if (survivor && job.customer_id === customer.id) {
            const chainKey = makeFingerprint([job.id, "merged_customer_chain", customer.id, survivor.id]);
            if (!reportedChains.has(chainKey)) {
              reportedChains.add(chainKey);
              addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
                "chain_points_to_merged_customer",
                `Chain points to merged-away customer '${stCustId}' instead of surviving customer '${customer.servicetitan_merged_into}'`,
                "Chain should resolve to the surviving customer after a merge",
                "Re-link records to the surviving customer", "high");
              issues++;
            }
          }
        }
      }
    }

    recordCheck(ctx, checkName, "appointment", "Full Appointment→Job→Customer chain integrity", issues, appointments.length);
  } catch (err) {
    recordCheck(ctx, checkName, "appointment", "Customer-Job-Appointment chain integrity", issues, appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 7. Technician Identity Integrity ────────────────────────────────────────

async function checkTechnicianIdentityIntegrity(ctx: AuditContext, employees: any[]): Promise<void> {
  const checkName = "technician_identity_integrity";
  let issues = 0;

  try {
    const techIdMap = new Map<string, any[]>();
    const empIdMap = new Map<string, any[]>();

    for (const e of employees) {
      const stTechId = e.servicetitan_technician_id || "";
      const stEmpId = e.servicetitan_employee_id || "";

      if (stTechId) {
        if (!techIdMap.has(stTechId)) techIdMap.set(stTechId, []);
        techIdMap.get(stTechId)!.push(e);
      }
      if (stEmpId) {
        if (!empIdMap.has(stEmpId)) empIdMap.set(stEmpId, []);
        empIdMap.get(stEmpId)!.push(e);
      }
    }

    // Check: duplicate servicetitan_technician_id (critical)
    for (const [stTechId, records] of techIdMap) {
      const active = records.filter(r => r.employment_status === "Active");
      if (active.length > 1) {
        for (const r of active) {
          addIssue(ctx, checkName, "technician", "EmployeeRegistry", r.id, stTechId,
            "duplicate_servicetitan_technician_id",
            `${active.length} active employees share servicetitan_technician_id '${stTechId}' (IDs: ${active.map(a => a.id).join(", ")})`,
            "Each servicetitan_technician_id must map to exactly one active employee",
            "Deduplicate the technician ID mapping", "critical");
          issues++;
        }
      }
    }

    // Check: duplicate servicetitan_employee_id
    for (const [stEmpId, records] of empIdMap) {
      const active = records.filter(r => r.employment_status === "Active");
      if (active.length > 1) {
        for (const r of active) {
          addIssue(ctx, checkName, "technician", "EmployeeRegistry", r.id, stEmpId,
            "duplicate_servicetitan_employee_id",
            `${active.length} active employees share servicetitan_employee_id '${stEmpId}' (IDs: ${active.map(a => a.id).join(", ")})`,
            "Each servicetitan_employee_id should map to exactly one active employee",
            "Deduplicate the employee ID mapping", "high");
          issues++;
        }
      }
    }

    recordCheck(ctx, checkName, "technician", "Technician identity, duplicate ServiceTitan ID mappings", issues, employees.length);
  } catch (err) {
    recordCheck(ctx, checkName, "technician", "Technician identity integrity", issues, employees.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 8. Technician Relationships on Jobs and Appointments ────────────────────

async function checkTechnicianRelationshipsOnJobsAndAppointments(
  ctx: AuditContext,
  jobs: any[],
  appointments: any[],
  employeeMap: Map<string, any>
): Promise<void> {
  const checkName = "technician_relationships";
  let issues = 0;

  try {
    // Check jobs
    for (const j of jobs) {
      // Check technician_emails reference valid employees
      const techEmails: string[] = Array.isArray(j.technician_emails) ? j.technician_emails : [];
      for (const email of techEmails) {
        if (email && !employeeMap.has(email.toLowerCase())) {
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "technician_email_not_found",
            `Job references technician_email='${email}' but no active EmployeeRegistry record with that email exists`,
            "Technician references must point to existing EmployeeRegistry records",
            "Update the technician mapping or create the employee record", "high");
          issues++;
        }
      }

      // Check duplicate technicians within the array
      const uniqueEmails = new Set(techEmails.map(e => e.toLowerCase()));
      if (uniqueEmails.size !== techEmails.length) {
        addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
          "duplicate_technician_in_array",
          "Job technician_emails array contains duplicate entries",
          "Technician arrays should not contain duplicates",
          "Remove duplicate entries", "low");
        issues++;
      }

      // Check: matched status but no local technician reference
      if (j.technician_mapping_status === "matched" && j.servicetitan_technician_ids && j.servicetitan_technician_ids.length > 0) {
        if (!j.technician_emails || j.technician_emails.length === 0) {
          addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
            "matched_but_no_local_technician",
            `Job technician_mapping_status='matched' but technician_emails is empty despite having ST technician IDs`,
            "Matched jobs should have local technician references",
            "Re-run technician mapping for this job", "medium");
          issues++;
        }
      }

      // Check: unassigned status but has technician data
      if (j.technician_mapping_status === "unassigned" && j.servicetitan_technician_ids && j.servicetitan_technician_ids.length > 0) {
        addIssue(ctx, checkName, "job", "Job", j.id, j.servicetitan_job_id || "",
          "unassigned_but_has_st_technician",
          `Job technician_mapping_status='unassigned' but servicetitan_technician_ids is non-empty`,
          "Jobs with ST technician data should not be marked 'unassigned'",
          "Set mapping_status to 'matched' or 'unmatched'", "medium");
        issues++;
      }
    }

    // Check appointments
    for (const a of appointments) {
      const techId = a.technician_id || "";
      const mappingStatus = a.technician_mapping_status || "";

      if (mappingStatus === "matched" && techId) {
        // Verify the referenced employee exists
        if (!employeeMap.has(techId)) {
          addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
            "matched_technician_not_found",
            `Appointment technician_mapping_status='matched' but technician_id='${techId}' does not exist in EmployeeRegistry`,
            "Matched technician references must point to existing EmployeeRegistry records",
            "Re-run technician mapping or update EmployeeRegistry", "high");
          issues++;
        }
      }

      if (mappingStatus === "unassigned" && a.servicetitan_technician_id) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
          "unassigned_but_has_st_technician",
          `Appointment technician_mapping_status='unassigned' but servicetitan_technician_id='${a.servicetitan_technician_id}' is set`,
          "Appointments with ST technician data should not be marked 'unassigned'",
          "Set mapping_status to 'matched' or 'unmatched'", "medium");
        issues++;
      }

      if (mappingStatus === "unmatched" && !a.servicetitan_technician_id && !a.servicetitan_technician_name) {
        addIssue(ctx, checkName, "appointment", "Appointment", a.id, a.servicetitan_appointment_id || "",
          "unmatched_without_st_technician",
          `Appointment technician_mapping_status='unmatched' but no ST technician data was supplied`,
          "Unmatched status should only be used when ST supplied a technician but no local match exists",
          "Set mapping_status to 'unassigned'", "medium");
        issues++;
      }
    }

    recordCheck(ctx, checkName, "technician", "Technician references on jobs and appointments (existence, mapping status consistency)", issues, jobs.length + appointments.length);
  } catch (err) {
    recordCheck(ctx, checkName, "technician", "Technician relationships on jobs and appointments", issues, jobs.length + appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 9. Event Ordering Integrity ─────────────────────────────────────────────

async function checkEventOrderingIntegrity(
  ctx: AuditContext,
  customers: any[],
  jobs: any[],
  appointments: any[]
): Promise<void> {
  const checkName = "event_ordering_integrity";
  let issues = 0;

  try {
    const allRecords = [
      ...customers.map(r => ({ ...r, _domain: "customer" })),
      ...jobs.map(r => ({ ...r, _domain: "job" })),
      ...appointments.map(r => ({ ...r, _domain: "appointment" })),
    ];

    for (const r of allRecords) {
      const stId = r.servicetitan_customer_id || r.servicetitan_job_id || r.servicetitan_appointment_id || r.crm_appointment_id || "";
      const lastEventAt = r.servicetitan_last_event_at;
      const lastSync = r.servicetitan_last_sync || r.servicetitan_last_sync_at;

      // Check: last_event_at is valid when populated
      if (lastEventAt && !isValidDate(lastEventAt)) {
        addIssue(ctx, checkName, r._domain, r._domain === "customer" ? "Customer" : r._domain === "job" ? "Job" : "Appointment",
          r.id, stId,
          "invalid_last_event_at",
          `servicetitan_last_event_at='${lastEventAt}' is not a valid date`,
          "Must be a valid ISO timestamp",
          "Correct or clear the invalid timestamp", "medium");
        issues++;
      }

      // Check: last_sync is after last_event_at (not stale sync metadata)
      if (lastEventAt && lastSync && isValidDate(lastEventAt) && isValidDate(lastSync)) {
        const eventTime = new Date(lastEventAt).getTime();
        const syncTime = new Date(lastSync).getTime();
        if (syncTime < eventTime - 60000) { // 1 minute tolerance
          addIssue(ctx, checkName, r._domain, r._domain === "customer" ? "Customer" : r._domain === "job" ? "Job" : "Appointment",
            r.id, stId,
            "sync_before_event",
            `servicetitan_last_sync (${lastSync}) is before servicetitan_last_event_at (${lastEventAt})`,
            "Last sync should be at or after the last event timestamp",
            "Investigate whether a stale event overwrote newer state", "high");
          issues++;
        }
      }

      // Check: restored after deletion (restored state must be after deleted state)
      if (r._domain === "job") {
        if (r.servicetitan_deleted === false && r.servicetitan_deleted_at && r.servicetitan_sync_status === "synced") {
          // Restored — check that deleted_at is in the past relative to current sync
          if (isValidDate(r.servicetitan_deleted_at) && isValidDate(lastSync)) {
            if (new Date(r.servicetitan_deleted_at).getTime() > new Date(lastSync).getTime()) {
              addIssue(ctx, checkName, "job", "Job", r.id, stId,
                "restored_before_deletion",
                `Job appears restored but deleted_at (${r.servicetitan_deleted_at}) is after last sync (${lastSync})`,
                "Restoration must occur after deletion",
                "Investigate event ordering", "medium");
              issues++;
            }
          }
        }
      }

      // Check: reopened after completed (reopened_at must be after completed_at)
      if (r._domain === "job" && r.reopened_at && r.completed_at) {
        if (isValidDate(r.reopened_at) && isValidDate(r.completed_at)) {
          if (new Date(r.reopened_at).getTime() < new Date(r.completed_at).getTime()) {
            addIssue(ctx, checkName, "job", "Job", r.id, stId,
              "reopened_before_completion",
              `Job reopened_at (${r.reopened_at}) is before completed_at (${r.completed_at})`,
              "Reopening must occur after completion",
              "Investigate event ordering", "medium");
            issues++;
          }
        }
      }
    }

    recordCheck(ctx, checkName, "cross-domain", "Event ordering: last_event_at validity, sync-after-event, restore/reopen ordering", issues, allRecords.length);
  } catch (err) {
    recordCheck(ctx, checkName, "cross-domain", "Event ordering integrity", issues, customers.length + jobs.length + appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 10. Webhook Event Integrity ──────────────────────────────────────────────

async function checkWebhookEventIntegrity(
  ctx: AuditContext,
  events: any[]
): Promise<void> {
  const checkName = "webhook_event_integrity";
  let issues = 0;

  try {
    const eventIdMap = new Map<string, any[]>();

    for (const e of events) {
      const stEventId = e.event_id || "";
      if (stEventId) {
        if (!eventIdMap.has(stEventId)) eventIdMap.set(stEventId, []);
        eventIdMap.get(stEventId)!.push(e);
      }

      // Check: processing events older than stale threshold
      if (e.processing_status === "processing") {
        const staleEvent = isStaleProcessing(e);
        if (staleEvent) {
          const ageMin = e.processing_started_at ? Math.floor((Date.now() - new Date(e.processing_started_at).getTime()) / 60000) : 0;
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, stEventId,
            "stale_processing_event",
            `Event has been in 'processing' status for ${ageMin} minutes (threshold: ${WEBHOOK_PROCESSING_TIMEOUT_MINUTES}m)`,
            "Stale processing events should be recovered automatically",
            "Run the stale-event recovery process", "high");
          issues++;
        }
      }

      // Check: failed events without retry or dead-letter disposition
      if (e.processing_status === "failed") {
        if (!e.next_retry_at && e.processing_attempts < 5) {
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, stEventId,
            "failed_without_retry",
            `Failed event has no next_retry_at and attempts=${e.processing_attempts || 0}`,
            "Failed events should have a retry scheduled or be dead-lettered",
            "Schedule a retry or move to dead-letter queue", "high");
          issues++;
        }
      }

      // Check: dead-letter events missing an error reason
      if (e.processing_status === "dead_letter") {
        if (!e.dead_letter_reason && !e.last_error) {
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, stEventId,
            "dead_letter_without_reason",
            "Dead-lettered event has no dead_letter_reason or last_error",
            "Dead-lettered events must record the failure reason",
            "Add the failure reason to the event", "medium");
          issues++;
        }
      }

      // Check: ignored events without an ignore reason
      if (e.processing_status === "ignored") {
        if (!e.last_error) {
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, stEventId,
            "ignored_without_reason",
            "Ignored event has no last_error or ignore reason",
            "Ignored events should record why they were ignored",
            "Add the ignore reason", "low");
          issues++;
        }
      }

      // Check: processed events without processed_at
      if (e.processing_status === "processed" && !e.processed_at) {
        addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, stEventId,
          "processed_without_timestamp",
          "Processed event has no processed_at timestamp",
          "Processed events must have a processed_at timestamp",
          "Set the processed_at timestamp", "low");
        issues++;
      }
    }

    // Check: duplicate event_id (critical)
    for (const [stEventId, records] of eventIdMap) {
      if (records.length > 1) {
        for (const r of records) {
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", r.id, stEventId,
            "duplicate_event_id",
            `${records.length} webhook events share event_id '${stEventId}' (IDs: ${records.map(a => a.id).join(", ")})`,
            "Each ServiceTitan event_id must be unique",
            "Deduplicate the events, keeping the first processed", "critical");
          issues++;
        }
      }
    }

    recordCheck(ctx, checkName, "webhook_event", "Webhook event integrity: duplicates, stale processing, failed/dead-letter/ignored disposition", issues, events.length);
  } catch (err) {
    recordCheck(ctx, checkName, "webhook_event", "Webhook event integrity", issues, events.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 11. Atomic Claim and Recovery Integrity ─────────────────────────────────

async function checkAtomicClaimAndRecoveryIntegrity(
  ctx: AuditContext,
  events: any[],
  timelines: any[]
): Promise<void> {
  const checkName = "atomic_claim_recovery_integrity";
  let issues = 0;

  try {
    // Group timelines by webhook_event_id for claim analysis
    const timelineByEvent = new Map<string, any[]>();
    for (const t of timelines) {
      const evid = t.webhook_event_id || "";
      if (!evid) continue;
      if (!timelineByEvent.has(evid)) timelineByEvent.set(evid, []);
      timelineByEvent.get(evid)!.push(t);
    }

    for (const e of events) {
      const eventTimelines = timelineByEvent.get(e.id) || [];

      // Check: claim ID present when processing
      if (e.processing_status === "processing" || e.processing_status === "processed" || e.processing_status === "failed") {
        if (!e.processing_claim_id && e.processing_attempts > 0) {
          addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, e.event_id || "",
            "missing_claim_id",
            `Event has processing_attempts=${e.processing_attempts || 0} but no processing_claim_id`,
            "Processing claims must have a claim ID for traceability",
            "This may indicate a processing path that bypassed the claim mechanism", "medium");
          issues++;
        }
      }

      // Check: recovery count agrees with recovery timeline entries
      const recoveryCount = e.processing_recovery_count || 0;
      const recoveryTimelines = eventTimelines.filter(t => t.stage === "processing_recovered" || t.stage === "processing_timeout");
      if (recoveryCount !== recoveryTimelines.length) {
        addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, e.event_id || "",
          "recovery_count_mismatch",
          `processing_recovery_count=${recoveryCount} but ${recoveryTimelines.length} recovery timeline entries exist`,
          "Recovery count must agree with recovery timeline entries",
          "Reconcile the recovery count with timeline records", "low");
        issues++;
      }

      // Check: recovered events were subsequently resolved
      if (recoveryCount > 0 && e.processing_status === "processing") {
        const lastRecovery = recoveryTimelines.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        if (lastRecovery) {
          const recoveryAge = Date.now() - new Date(lastRecovery.timestamp).getTime();
          if (recoveryAge > WEBHOOK_PROCESSING_TIMEOUT_MINUTES * 2 * 60000) {
            addIssue(ctx, checkName, "webhook_event", "ServiceTitanWebhookEvent", e.id, e.event_id || "",
              "recovered_but_still_processing",
              `Event was recovered ${Math.floor(recoveryAge / 60000)}m ago but is still in 'processing' status`,
              "Recovered events should be subsequently processed, failed, or remain visibly pending",
              "Run the processor or investigate why the event is stuck", "high");
            issues++;
          }
        }
      }
    }

    recordCheck(ctx, checkName, "webhook_event", "Atomic claim and recovery integrity: claim IDs, recovery count consistency, post-recovery resolution", issues, events.length);
  } catch (err) {
    recordCheck(ctx, checkName, "webhook_event", "Atomic claim and recovery integrity", issues, events.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 12. Timeline Integrity ──────────────────────────────────────────────────

async function checkTimelineIntegrity(
  ctx: AuditContext,
  timelines: any[],
  eventIds: Set<string>
): Promise<void> {
  const checkName = "timeline_integrity";
  let issues = 0;
  let orphanedCount = 0;

  try {
    const seenEntries = new Set<string>();

    for (const t of timelines) {
      const evid = t.webhook_event_id || "";

      // Check: references an existing webhook event
      if (evid && !eventIds.has(evid)) {
        orphanedCount++;
        addIssue(ctx, checkName, "timeline", "ServiceTitanWebhookTimeline", t.id, evid,
          "orphaned_timeline",
          `Timeline entry references webhook_event_id='${evid}' which does not exist`,
          "Timeline entries should reference existing webhook events (unless retained as permanent audit history)",
          "Investigate whether the event was deleted; retain if intentional", "low");
        issues++;
      }

      // Check: valid stage and status
      if (!t.stage) {
        addIssue(ctx, checkName, "timeline", "ServiceTitanWebhookTimeline", t.id, evid,
          "missing_stage",
          "Timeline entry has no stage",
          "Every timeline entry must have a stage",
          "Add the missing stage", "low");
        issues++;
      }

      // Check: timestamp is valid
      if (t.timestamp && !isValidDate(t.timestamp)) {
        addIssue(ctx, checkName, "timeline", "ServiceTitanWebhookTimeline", t.id, evid,
          "invalid_timestamp",
          `Timeline timestamp='${t.timestamp}' is not a valid date`,
          "Timeline timestamps must be valid ISO timestamps",
          "Correct the invalid timestamp", "medium");
        issues++;
      }

      // Check: metadata_json is valid when present
      if (t.metadata_json) {
        const { error } = safeParseJson(t.metadata_json);
        if (error) {
          addIssue(ctx, checkName, "timeline", "ServiceTitanWebhookTimeline", t.id, evid,
            "malformed_metadata_json",
            `metadata_json is not valid JSON: ${error}`,
            "Timeline metadata must be valid JSON",
            "Repair or clear the malformed JSON", "medium");
          issues++;
        }
      }

      // Check: duplicate entries from idempotent replay
      const dedupKey = makeFingerprint([evid, t.stage, t.message || "", t.timestamp || ""]);
      if (seenEntries.has(dedupKey)) {
        addIssue(ctx, checkName, "timeline", "ServiceTitanWebhookTimeline", t.id, evid,
          "duplicate_timeline_entry",
          `Duplicate timeline entry (same event, stage, message, timestamp)`,
          "Timeline should not have exact duplicate entries from idempotent replay",
          "Investigate the replay mechanism for idempotency", "low");
        issues++;
      } else {
        seenEntries.add(dedupKey);
      }
    }

    if (orphanedCount > 0) {
      ctx.recommendations.push(`Timeline integrity: ${orphanedCount} orphaned timeline entries found referencing non-existent webhook events. These may be permanent audit history or may indicate deleted events.`);
    }

    recordCheck(ctx, checkName, "timeline", "Timeline integrity: orphaned entries, valid stages, duplicate detection, malformed metadata", issues, timelines.length);
  } catch (err) {
    recordCheck(ctx, checkName, "timeline", "Timeline integrity", issues, timelines.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 13. Replay and Retry Integrity ──────────────────────────────────────────

async function checkReplayAndRetryIntegrity(
  ctx: AuditContext,
  replays: any[],
  events: any[]
): Promise<void> {
  const checkName = "replay_retry_integrity";
  let issues = 0;

  try {
    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.id, e);

    for (const r of replays) {
      const eventId = r.webhook_event_id || "";

      // Check: replay references the correct original event
      if (eventId && !eventMap.has(eventId)) {
        addIssue(ctx, checkName, "replay", "ServiceTitanWebhookReplay", r.id, eventId,
          "replay_references_missing_event",
          `Replay references webhook_event_id='${eventId}' which does not exist`,
          "Replays must reference an existing original event",
          "Investigate whether the event was deleted", "medium");
        issues++;
      }

      // Check: completed replay has a valid handler result
      if (r.success === true && !r.result) {
        addIssue(ctx, checkName, "replay", "ServiceTitanWebhookReplay", r.id, eventId,
          "completed_replay_without_result",
          "Replay marked as success but has no result summary",
          "Successful replays must have a handler result",
          "Add the result summary", "low");
        issues++;
      }

      // Check: failed replay has an error
      if (r.success === false && !r.error) {
        addIssue(ctx, checkName, "replay", "ServiceTitanWebhookReplay", r.id, eventId,
          "failed_replay_without_error",
          "Replay marked as failed but has no error message",
          "Failed replays must record the error",
          "Add the error message", "low");
        issues++;
      }
    }

    recordCheck(ctx, checkName, "replay", "Replay and retry integrity: event references, result/error completeness", issues, replays.length);
  } catch (err) {
    recordCheck(ctx, checkName, "replay", "Replay and retry integrity", issues, replays.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 14. Conflict History Integrity ──────────────────────────────────────────

async function checkConflictHistoryIntegrity(
  ctx: AuditContext,
  customers: any[],
  jobs: any[],
  appointments: any[]
): Promise<void> {
  const checkName = "conflict_history_integrity";
  let issues = 0;

  try {
    const checkRecord = (record: any, domain: string, recordType: string) => {
      const conflictJson = record.sync_conflict_history_json;
      if (!conflictJson) return;

      const { parsed, error } = safeParseJson(conflictJson);
      if (error) {
        // Already flagged in identity checks — don't duplicate
        return;
      }

      if (!parsed) return;

      const protectedFields = LVC_PROTECTED_FIELDS[domain] || [];

      for (const entry of parsed) {
        // Check: every entry has required fields
        const requiredFields = ["webhook_event_id", "event_type", "field", "previous_value", "new_value", "synced_at"];
        for (const rf of requiredFields) {
          if (!(rf in entry)) {
            addIssue(ctx, checkName, domain, recordType, record.id, record[`servicetitan_${domain}_id`] || "",
              "conflict_entry_missing_field",
              `Conflict history entry missing required field '${rf}'`,
              `Every conflict entry must have: ${requiredFields.join(", ")}`,
              "Repair or remove the incomplete entry", "medium");
            issues++;
            break; // one missing-field issue per entry is enough
          }
        }

        // Check: no entry targets an LVC-owned field (critical)
        if (entry.field && protectedFields.includes(entry.field)) {
          addIssue(ctx, checkName, domain, recordType, record.id, record[`servicetitan_${domain}_id`] || "",
            "conflict_on_lvc_protected_field",
            `Conflict history entry targets LVC-protected field '${entry.field}'`,
            "ServiceTitan must never overwrite LVC-owned fields",
            "Investigate the sync code path that wrote this conflict entry", "critical");
          issues++;
        }

        // Check: unchanged values are not recorded as conflicts
        if (entry.previous_value !== undefined && entry.new_value !== undefined) {
          if (String(entry.previous_value) === String(entry.new_value)) {
            addIssue(ctx, checkName, domain, recordType, record.id, record[`servicetitan_${domain}_id`] || "",
              "unchanged_value_recorded_as_conflict",
              `Conflict entry records unchanged value for field '${entry.field}' (previous=new='${entry.previous_value}')`,
              "Unchanged values should not be recorded as conflicts",
              "Remove the false-positive conflict entry", "low");
            issues++;
          }
        }
      }
    };

    for (const c of customers) checkRecord(c, "customer", "Customer");
    for (const j of jobs) checkRecord(j, "job", "Job");
    for (const a of appointments) checkRecord(a, "appointment", "Appointment");

    const totalRecords = customers.length + jobs.length + appointments.length;
    recordCheck(ctx, checkName, "cross-domain", "Conflict-history integrity: JSON parseability, required fields, LVC-protected field detection, unchanged values", issues, totalRecords);
  } catch (err) {
    recordCheck(ctx, checkName, "cross-domain", "Conflict history integrity", issues, customers.length + jobs.length + appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 15. LVC Field-Ownership Audit ───────────────────────────────────────────

async function checkLvcFieldOwnershipAudit(
  ctx: AuditContext,
  customers: any[],
  jobs: any[],
  appointments: any[]
): Promise<void> {
  const checkName = "lvc_field_ownership_audit";
  let issues = 0;

  try {
    const checkRecord = (record: any, domain: string, recordType: string) => {
      const conflictJson = record.sync_conflict_history_json;
      if (!conflictJson) return;

      const { parsed } = safeParseJson(conflictJson);
      if (!parsed) return;

      const protectedFields = LVC_PROTECTED_FIELDS[domain] || [];

      for (const entry of parsed) {
        if (entry.field && protectedFields.includes(entry.field)) {
          addIssue(ctx, checkName, domain, recordType, record.id, record[`servicetitan_${domain}_id`] || "",
            "lvc_field_overwrite_risk",
            `Conflict history shows ServiceTitan overwrote LVC-protected field '${entry.field}' (previous: '${entry.previous_value}', new: '${entry.new_value}')`,
            "ServiceTitan must never overwrite LVC-owned fields",
            "Fix the sync code path that allowed this overwrite — review ST_CONTROLLED_FIELDS in the sync module", "critical");
          issues++;
        }
      }
    };

    for (const c of customers) checkRecord(c, "customer", "Customer");
    for (const j of jobs) checkRecord(j, "job", "Job");
    for (const a of appointments) checkRecord(a, "appointment", "Appointment");

    // Code-level risk analysis: check that ST_CONTROLLED_FIELDS don't include LVC-protected fields
    // This is a static analysis recommendation rather than a per-record check
    const jobStControlled = [
      "crm_job_number", "customer_id", "customer_name", "customer_number",
      "address", "city", "state", "zip", "job_type", "status", "dispatch_status",
      "appointment_date", "service_date", "arrival_window_start", "arrival_window_end",
      "technician_email", "technician_emails", "technician_name",
      "lead_technician_email", "lead_technician_name",
      "servicetitan_job_id", "servicetitan_job_number", "servicetitan_customer_id",
      "servicetitan_location_id", "servicetitan_location_name",
      "servicetitan_business_unit", "servicetitan_business_unit_id",
      "servicetitan_job_type", "servicetitan_job_type_id",
      "servicetitan_campaign_id", "servicetitan_project_id", "servicetitan_tenant_id",
      "servicetitan_raw_status", "servicetitan_latitude", "servicetitan_longitude",
      "servicetitan_arrival_window_start", "servicetitan_arrival_window_end",
      "servicetitan_summary", "servicetitan_technician_ids", "servicetitan_technician_names",
      "servicetitan_appointment_ids", "customer_mapping_status", "customer_mapping_warning",
      "technician_mapping_status", "technician_mapping_warning",
    ];
    const jobProtected = LVC_PROTECTED_FIELDS.job || [];
    const overlap = jobStControlled.filter(f => jobProtected.includes(f));
    if (overlap.length > 0) {
      ctx.recommendations.push(`Code-level risk: ST_CONTROLLED_FIELDS for jobs includes fields also listed as LVC-protected: ${overlap.join(", ")}. Review whether these fields should be controlled by ServiceTitan or protected as LVC-owned.`);
    }

    const totalRecords = customers.length + jobs.length + appointments.length;
    recordCheck(ctx, checkName, "cross-domain", "LVC field-ownership audit: detects ServiceTitan overwrites of protected LVC fields via conflict-history inspection and code-level review", issues, totalRecords);
  } catch (err) {
    recordCheck(ctx, checkName, "cross-domain", "LVC field-ownership audit", issues, customers.length + jobs.length + appointments.length, err instanceof Error ? err.message : String(err));
  }
}

// ─── 16. Duplicate and Orphan Summary ────────────────────────────────────────

function buildDuplicateAndOrphanSummary(
  ctx: AuditContext,
  customers: any[],
  jobs: any[],
  appointments: any[],
  employees: any[],
  events: any[],
  timelines: any[]
): void {
  const checkName = "duplicate_orphan_summary";

  try {
    // Count duplicates
    const dupCustomers = ctx.issues.filter(i => i.check_name === "customer_identity_integrity" && i.relationship === "duplicate_servicetitan_customer_id");
    const dupJobs = ctx.issues.filter(i => i.check_name === "job_identity_integrity" && i.relationship === "duplicate_servicetitan_job_id");
    const dupAppts = ctx.issues.filter(i => i.check_name === "appointment_identity_integrity" && i.relationship === "duplicate_servicetitan_appointment_id");
    const dupTechs = ctx.issues.filter(i => i.check_name === "technician_identity_integrity" && i.relationship.startsWith("duplicate_servicetitan_"));
    const orphanedTimelines = ctx.issues.filter(i => i.check_name === "timeline_integrity" && i.relationship === "orphaned_timeline");
    const staleProcessing = ctx.issues.filter(i => i.check_name === "webhook_event_integrity" && i.relationship === "stale_processing_event");
    const failedAwaiting = ctx.issues.filter(i => i.check_name === "webhook_event_integrity" && i.relationship === "failed_without_retry");
    const deadLetter = events.filter(e => e.processing_status === "dead_letter");
    const malformedConflicts = ctx.issues.filter(i => i.relationship === "malformed_conflict_history_json");
    const pendingJobMappings = jobs.filter(j => j.customer_mapping_status === "pending");
    const pendingCustomerMappings = jobs.filter(j => j.customer_mapping_status === "pending" && j.servicetitan_customer_id);
    const unmatchedTechs = ctx.issues.filter(i => i.relationship === "unmatched_without_st_technician" || i.relationship === "unassigned_but_has_st_technician");

    const summary = {
      duplicate_customer_identities: dupCustomers.length,
      duplicate_job_identities: dupJobs.length,
      duplicate_appointment_identities: dupAppts.length,
      duplicate_technician_identities: dupTechs.length,
      orphaned_jobs: jobs.filter(j => !j.servicetitan_job_id).length,
      orphaned_appointments: appointments.filter(a => !a.servicetitan_appointment_id && !a.crm_appointment_id).length,
      pending_customer_mappings: pendingCustomerMappings.length,
      pending_job_mappings: pendingJobMappings.length,
      unmatched_technicians: unmatchedTechs.length,
      invalid_local_references: ctx.issues.filter(i => i.relationship.includes("not_found") || i.relationship.includes("missing")).length,
      orphaned_timelines: orphanedTimelines.length,
      stale_processing_events: staleProcessing.length,
      failed_events_awaiting_action: failedAwaiting.length,
      dead_letter_events: deadLetter.length,
      malformed_conflict_histories: malformedConflicts.length,
    };

    ctx.checks.push({
      name: checkName,
      domain: "cross-domain",
      description: "Duplicate and orphan summary across all synchronized domains",
      passed: Object.values(summary).every(v => v === 0),
      issues_found: Object.values(summary).reduce((a, b) => a + b, 0),
      records_scanned: customers.length + jobs.length + appointments.length + employees.length + events.length + timelines.length,
    });

    // Add informational issues for the summary
    if (summary.dead_letter_events > 0) {
      ctx.recommendations.push(`Dead Letter Queue: ${summary.dead_letter_events} events are in dead_letter status. Review and either fix the underlying issue or manually resolve them.`);
    }
    if (summary.stale_processing_events > 0) {
      ctx.recommendations.push(`Stale Processing: ${summary.stale_processing_events} events are stuck in processing status. Run the stale-event recovery process.`);
    }
    if (summary.pending_customer_mappings > 0) {
      ctx.recommendations.push(`Pending Mappings: ${summary.pending_customer_mappings} jobs have pending customer relationships. Verify whether the customers have since been synced.`);
    }
  } catch (err) {
    recordCheck(ctx, checkName, "cross-domain", "Duplicate and orphan summary", 0, 0, err instanceof Error ? err.message : String(err));
  }
}

// ─── Main Audit Runner ───────────────────────────────────────────────────────

export async function runAudit(base44: any, config: AuditConfig): Promise<AuditResult> {
  const auditId = generateAuditId();
  const startedAt = new Date().toISOString();
  const ctx: AuditContext = {
    base44,
    config,
    issues: [],
    checks: [],
    recommendations: [],
    partialFailures: [],
    recordsScanned: {
      customers: 0, jobs: 0, appointments: 0, employees: 0,
      webhook_events: 0, timelines: 0, replays: 0,
    },
    migrationSummary: {
      legacy_customers: 0, legacy_jobs: 0, legacy_appointments: 0,
      total_migration_opportunities: 0,
    },
    legacyRecordIds: new Set<string>(),
  };

  try {
    // ── Record mode: targeted checks ──
    if (config.mode === "record") {
      await runRecordModeAudit(ctx);
    } else {
      // Summary, full, or report mode — run all checks identically.
      // "summary" filters the issue list to critical+high sync issues.
      // "full" returns all issues.
      // "report" returns all issues but the issue list is stripped from the
      //   response (identical counts, no per-record detail).
      await runFullAudit(ctx, config.mode !== "summary");
    }

    // Build duplicate/orphan summary
    // (data already loaded in runFullAudit or runRecordModeAudit)
  } catch (err) {
    ctx.partialFailures.push(`Audit runner error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const completedAt = new Date().toISOString();

  // ── Precise legacy_migration classification ──
  //
  // An issue is classified as legacy_migration ONLY when BOTH conditions hold:
  //   1. The issue's relationship is in LEGACY_ELIGIBLE_RELATIONSHIPS
  //   2. The affected record is itself legacy (predates ST synchronization)
  //
  // All other issues — including duplicates, wrong links, broken chains,
  // invalid dates, malformed JSON, protected-field conflicts, timeline
  // corruption, and invalid technician mappings — remain "synchronization"
  // findings regardless of whether the record is legacy.
  //
  // This does NOT change what the checks detect — it only assigns the
  // category field used for PASS/FAIL determination.
  for (const issue of ctx.issues) {
    const isLegacyEligible = LEGACY_ELIGIBLE_RELATIONSHIPS.has(issue.relationship);
    const isLegacyRecord = issue.local_record_id && ctx.legacyRecordIds.has(issue.local_record_id);
    issue.category = (isLegacyEligible && isLegacyRecord) ? "legacy_migration" : "synchronization";
  }

  // Count all issues by severity (includes both categories)
  const issue_counts = {
    critical: ctx.issues.filter(i => i.severity === "critical").length,
    high: ctx.issues.filter(i => i.severity === "high").length,
    medium: ctx.issues.filter(i => i.severity === "medium").length,
    low: ctx.issues.filter(i => i.severity === "low").length,
    informational: ctx.issues.filter(i => i.severity === "informational").length,
  };

  // Count synchronization issues only (exclude legacy migration)
  const syncIssues = ctx.issues.filter(i => i.category !== "legacy_migration");
  const sync_issue_counts = {
    critical: syncIssues.filter(i => i.severity === "critical").length,
    high: syncIssues.filter(i => i.severity === "high").length,
    medium: syncIssues.filter(i => i.severity === "medium").length,
    low: syncIssues.filter(i => i.severity === "low").length,
    informational: syncIssues.filter(i => i.severity === "informational").length,
  };

  // Determine integrity status based on SYNC issues only
  const integrity_status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" =
    (sync_issue_counts.critical > 0 || sync_issue_counts.high > 0) ? "FAIL" :
    sync_issue_counts.medium > 0 ? "PASS_WITH_WARNINGS" :
    "PASS";

  // ── Build grouped findings ──
  // Aggregated by (check_name, relationship, category, severity) with a count.
  // Present in ALL modes — does not expose per-record detail.
  const groupMap = new Map<string, GroupedFinding>();
  for (const issue of ctx.issues) {
    const key = `${issue.check_name}::${issue.relationship}::${issue.category}::${issue.severity}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      groupMap.set(key, {
        check_name: issue.check_name,
        relationship: issue.relationship,
        category: issue.category,
        severity: issue.severity,
        count: 1,
      });
    }
  }
  const grouped_findings = Array.from(groupMap.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category === "synchronization" ? -1 : 1;
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  // ── Build findings-by-check for each category ──
  const buildFindByCheck = (category: IssueCategory): FindingsByCheck[] => {
    const catIssues = ctx.issues.filter(i => i.category === category);
    const checkMap = new Map<string, FindingsByCheck>();
    for (const issue of catIssues) {
      const existing = checkMap.get(issue.check_name);
      if (existing) {
        existing.total_count++;
        existing.by_severity[issue.severity]++;
      } else {
        checkMap.set(issue.check_name, {
          check_name: issue.check_name,
          total_count: 1,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
        });
        checkMap.get(issue.check_name)!.by_severity[issue.severity]++;
      }
    }
    return Array.from(checkMap.values()).sort((a, b) => b.total_count - a.total_count);
  };

  const synchronization_findings_by_check = buildFindByCheck("synchronization");
  const legacy_migration_findings_by_check = buildFindByCheck("legacy_migration");

  // Build migration summary
  const ms = ctx.migrationSummary;
  const totalLegacy = ms.total_migration_opportunities;
  const migration_summary = {
    legacy_customers: ms.legacy_customers,
    legacy_jobs: ms.legacy_jobs,
    legacy_appointments: ms.legacy_appointments,
    total_migration_opportunities: totalLegacy,
    recommended_migration: totalLegacy === 0
      ? "No legacy migration needed."
      : `Backfill ServiceTitan IDs on ${ms.legacy_customers} customers, ${ms.legacy_jobs} jobs, and ${ms.legacy_appointments} appointments when ServiceTitan sync goes live.`,
    estimated_effort: totalLegacy === 0
      ? "N/A"
      : totalLegacy > 500
        ? "High — batch migration script recommended (4-8 hours)"
        : totalLegacy > 100
          ? "Medium — scripted migration with manual review (2-4 hours)"
          : "Low — manual or semi-automated (1-2 hours)",
  };

  const migration_status: "NO_MIGRATION_NEEDED" | "MIGRATION_RECOMMENDED" | "MIGRATION_REQUIRED" =
    totalLegacy === 0 ? "NO_MIGRATION_NEEDED" : "MIGRATION_RECOMMENDED";

  return {
    audit_id: auditId,
    started_at: startedAt,
    completed_at: completedAt,
    mode: config.mode,
    records_scanned: ctx.recordsScanned,
    issue_counts,
    sync_issue_counts,
    integrity_status,
    migration_summary,
    migration_status,
    checks: ctx.checks,
    // "report" mode omits the per-record issue list for smaller payloads.
    // Counts, grouped findings, and PASS/FAIL are identical to "full" mode.
    issues: config.mode === "report" ? [] : ctx.issues,
    grouped_findings,
    synchronization_findings_by_check,
    legacy_migration_findings_by_check,
    recommendations: ctx.recommendations,
    partial_failures: ctx.partialFailures,
  };
}

// ─── Full Audit (summary or full mode) ────────────────────────────────────────

async function runFullAudit(ctx: AuditContext, includeAllIssues: boolean): Promise<void> {
  const { base44 } = ctx;

  // ── Load all data with pagination ──
  const customers = await fetchAll(base44, "Customer", {});
  ctx.recordsScanned.customers = customers.length;

  const jobs = await fetchAll(base44, "Job", {});
  ctx.recordsScanned.jobs = jobs.length;

  const appointments = await fetchAll(base44, "Appointment", {});
  ctx.recordsScanned.appointments = appointments.length;

  const employees = await fetchAll(base44, "EmployeeRegistry", { employment_status: "Active" });
  ctx.recordsScanned.employees = employees.length;

  const events = await fetchAll(base44, "ServiceTitanWebhookEvent", {}, "-received_at");
  ctx.recordsScanned.webhook_events = events.length;

  const timelines = await fetchAll(base44, "ServiceTitanWebhookTimeline", {}, "-timestamp");
  ctx.recordsScanned.timelines = timelines.length;

  const replays = await fetchAll(base44, "ServiceTitanWebhookReplay", {}, "-replayed_at");
  ctx.recordsScanned.replays = replays.length;

  // ── Build lookup maps for batch relationship checks ──
  const customerMap = new Map<string, any>();
  for (const c of customers) {
    const stId = c.servicetitan_customer_id;
    if (stId) customerMap.set(stId, c);
  }

  const jobMap = new Map<string, any>();
  for (const j of jobs) {
    const stId = j.servicetitan_job_id;
    if (stId) jobMap.set(stId, j);
  }

  const employeeMap = new Map<string, any>();
  for (const e of employees) {
    if (e.email) employeeMap.set(e.email.toLowerCase(), e);
    if (e.id) employeeMap.set(e.id, e);
  }

  const eventIds = new Set<string>();
  for (const e of events) eventIds.add(e.id);

  // ── Run all checks ──
  // Each check is independent — partial failure doesn't stop the audit
  await safeCheck(ctx, "customer", () => checkCustomerIdentityIntegrity(ctx, customers));
  await safeCheck(ctx, "job", () => checkJobIdentityIntegrity(ctx, jobs));
  await safeCheck(ctx, "job", () => checkJobToCustomerRelationships(ctx, jobs, customerMap));
  await safeCheck(ctx, "appointment", () => checkAppointmentIdentityIntegrity(ctx, appointments));
  await safeCheck(ctx, "appointment", () => checkAppointmentToJobRelationships(ctx, appointments, jobMap));
  await safeCheck(ctx, "appointment", () => checkCustomerJobAppointmentChain(ctx, appointments, jobMap, customerMap));
  await safeCheck(ctx, "technician", () => checkTechnicianIdentityIntegrity(ctx, employees));
  await safeCheck(ctx, "technician", () => checkTechnicianRelationshipsOnJobsAndAppointments(ctx, jobs, appointments, employeeMap));
  await safeCheck(ctx, "cross-domain", () => checkEventOrderingIntegrity(ctx, customers, jobs, appointments));
  await safeCheck(ctx, "webhook_event", () => checkWebhookEventIntegrity(ctx, events));
  await safeCheck(ctx, "webhook_event", () => checkAtomicClaimAndRecoveryIntegrity(ctx, events, timelines));
  await safeCheck(ctx, "timeline", () => checkTimelineIntegrity(ctx, timelines, eventIds));
  await safeCheck(ctx, "replay", () => checkReplayAndRetryIntegrity(ctx, replays, events));
  await safeCheck(ctx, "cross-domain", () => checkConflictHistoryIntegrity(ctx, customers, jobs, appointments));
  await safeCheck(ctx, "cross-domain", () => checkLvcFieldOwnershipAudit(ctx, customers, jobs, appointments));
  buildDuplicateAndOrphanSummary(ctx, customers, jobs, appointments, employees, events, timelines);

  // Build set of legacy record IDs for post-check reclassification
  for (const c of customers) if (isLegacyRecord(c)) ctx.legacyRecordIds.add(c.id);
  for (const j of jobs) if (isLegacyRecord(j)) ctx.legacyRecordIds.add(j.id);
  for (const a of appointments) if (isLegacyRecord(a)) ctx.legacyRecordIds.add(a.id);

  // Compute legacy migration summary
  ctx.migrationSummary = {
    legacy_customers: customers.filter(c => isLegacyRecord(c)).length,
    legacy_jobs: jobs.filter(j => isLegacyRecord(j)).length,
    legacy_appointments: appointments.filter(a => isLegacyRecord(a)).length,
    total_migration_opportunities: 0,
  };
  ctx.migrationSummary.total_migration_opportunities =
    ctx.migrationSummary.legacy_customers +
    ctx.migrationSummary.legacy_jobs +
    ctx.migrationSummary.legacy_appointments;

  // In summary mode, only keep critical and high synchronization issues,
  // plus all legacy_migration issues (downgraded to informational)
  if (!includeAllIssues) {
    ctx.issues = ctx.issues.filter(i =>
      (i.severity === "critical" || i.severity === "high") && i.category === "synchronization"
    );
  }
}

// ─── Record Mode Audit ────────────────────────────────────────────────────────

async function runRecordModeAudit(ctx: AuditContext): Promise<void> {
  const { base44, config } = ctx;
  const { domain, local_record_id, servicetitan_id } = config;

  if (!domain && !local_record_id && !servicetitan_id) {
    ctx.partialFailures.push("Record mode requires at least one of: domain, local_record_id, servicetitan_id");
    return;
  }

  // Resolve the target record based on domain and identifiers
  let targetRecord: any = null;
  let targetDomain = domain || "";

  if (local_record_id) {
    // Fetch by local record ID
    const entityName = domain === "customer" ? "Customer" : domain === "job" ? "Job" : domain === "appointment" ? "Appointment" : domain === "technician" || domain === "employee" ? "EmployeeRegistry" : domain === "webhook_event" ? "ServiceTitanWebhookEvent" : null;
    if (entityName) {
      targetRecord = await fetchOne(base44, entityName, local_record_id);
    }
  } else if (servicetitan_id) {
    // Fetch by ServiceTitan ID
    if (domain === "customer" || !domain) {
      const results = await base44.asServiceRole.entities.Customer.filter({ servicetitan_customer_id: servicetitan_id }, null, 1);
      if (results.length > 0) { targetRecord = results[0]; targetDomain = "customer"; }
    }
    if (!targetRecord && (domain === "job" || !domain)) {
      const results = await base44.asServiceRole.entities.Job.filter({ servicetitan_job_id: servicetitan_id }, null, 1);
      if (results.length > 0) { targetRecord = results[0]; targetDomain = "job"; }
    }
    if (!targetRecord && (domain === "appointment" || !domain)) {
      const results = await base44.asServiceRole.entities.Appointment.filter({ servicetitan_appointment_id: servicetitan_id }, null, 1);
      if (results.length > 0) { targetRecord = results[0]; targetDomain = "appointment"; }
    }
    if (!targetRecord && (domain === "technician" || domain === "employee" || !domain)) {
      const results = await base44.asServiceRole.entities.EmployeeRegistry.filter({ servicetitan_technician_id: servicetitan_id }, null, 1);
      if (results.length > 0) { targetRecord = results[0]; targetDomain = "technician"; }
    }
    if (!targetRecord && (domain === "webhook_event" || !domain)) {
      const results = await base44.asServiceRole.entities.ServiceTitanWebhookEvent.filter({ event_id: servicetitan_id }, null, 1);
      if (results.length > 0) { targetRecord = results[0]; targetDomain = "webhook_event"; }
    }
  }

  if (!targetRecord) {
    ctx.partialFailures.push(`No record found for domain='${domain}', local_record_id='${local_record_id}', servicetitan_id='${servicetitan_id}'`);
    return;
  }

  // Run targeted checks based on the resolved domain
  if (targetDomain === "customer") {
    ctx.recordsScanned.customers = 1;
    await safeCheck(ctx, "customer", () => checkCustomerIdentityIntegrity(ctx, [targetRecord]));
    await safeCheck(ctx, "cross-domain", () => checkConflictHistoryIntegrity(ctx, [targetRecord], [], []));
    await safeCheck(ctx, "cross-domain", () => checkLvcFieldOwnershipAudit(ctx, [targetRecord], [], []));

    // Also check related jobs and appointments
    const stCustId = targetRecord.servicetitan_customer_id;
    if (stCustId) {
      const relatedJobs = await base44.asServiceRole.entities.Job.filter({ servicetitan_customer_id: stCustId }, null, 100);
      const relatedAppts = await base44.asServiceRole.entities.Appointment.filter({ servicetitan_customer_id: stCustId }, null, 100);
      const customerMap = new Map([[stCustId, targetRecord]]);
      await safeCheck(ctx, "job", () => checkJobToCustomerRelationships(ctx, relatedJobs, customerMap));
      ctx.recordsScanned.jobs = relatedJobs.length;
    }
  } else if (targetDomain === "job") {
    ctx.recordsScanned.jobs = 1;
    await safeCheck(ctx, "job", () => checkJobIdentityIntegrity(ctx, [targetRecord]));
    await safeCheck(ctx, "cross-domain", () => checkConflictHistoryIntegrity(ctx, [], [targetRecord], []));
    await safeCheck(ctx, "cross-domain", () => checkLvcFieldOwnershipAudit(ctx, [], [targetRecord], []));

    // Load referenced technicians for relationship checks
    const techEmails: string[] = Array.isArray(targetRecord.technician_emails) ? targetRecord.technician_emails : [];
    const empMap = new Map<string, any>();
    for (const email of techEmails) {
      if (email) {
        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter({ email, employment_status: "Active" }, null, 1);
        if (emps.length > 0) { empMap.set(email.toLowerCase(), emps[0]); empMap.set(emps[0].id, emps[0]); }
      }
    }
    await safeCheck(ctx, "technician", () => checkTechnicianRelationshipsOnJobsAndAppointments(ctx, [targetRecord], [], empMap));

    const stCustId = targetRecord.servicetitan_customer_id;
    if (stCustId) {
      const customer = await base44.asServiceRole.entities.Customer.filter({ servicetitan_customer_id: stCustId }, null, 1);
      const customerMap = new Map<string, any>();
      if (customer.length > 0) customerMap.set(stCustId, customer[0]);
      await safeCheck(ctx, "job", () => checkJobToCustomerRelationships(ctx, [targetRecord], customerMap));
      ctx.recordsScanned.customers = customer.length;
    }
  } else if (targetDomain === "appointment") {
    ctx.recordsScanned.appointments = 1;
    await safeCheck(ctx, "appointment", () => checkAppointmentIdentityIntegrity(ctx, [targetRecord]));
    await safeCheck(ctx, "cross-domain", () => checkConflictHistoryIntegrity(ctx, [], [], [targetRecord]));
    await safeCheck(ctx, "cross-domain", () => checkLvcFieldOwnershipAudit(ctx, [], [], [targetRecord]));

    // Load referenced technician for relationship checks
    const empMap = new Map<string, any>();
    if (targetRecord.technician_id) {
      const emp = await base44.asServiceRole.entities.EmployeeRegistry.get(targetRecord.technician_id);
      if (emp) { empMap.set(emp.id, emp); if (emp.email) empMap.set(emp.email.toLowerCase(), emp); }
    }
    await safeCheck(ctx, "technician", () => checkTechnicianRelationshipsOnJobsAndAppointments(ctx, [], [targetRecord], empMap));

    const stJobId = targetRecord.servicetitan_job_id;
    if (stJobId) {
      const job = await base44.asServiceRole.entities.Job.filter({ servicetitan_job_id: stJobId }, null, 1);
      const jobMap = new Map<string, any>();
      if (job.length > 0) jobMap.set(stJobId, job[0]);
      await safeCheck(ctx, "appointment", () => checkAppointmentToJobRelationships(ctx, [targetRecord], jobMap));
      ctx.recordsScanned.jobs = job.length;
    }
  } else if (targetDomain === "technician") {
    ctx.recordsScanned.employees = 1;
    await safeCheck(ctx, "technician", () => checkTechnicianIdentityIntegrity(ctx, [targetRecord]));
  } else if (targetDomain === "webhook_event") {
    ctx.recordsScanned.webhook_events = 1;
    await safeCheck(ctx, "webhook_event", () => checkWebhookEventIntegrity(ctx, [targetRecord]));

    // Also check related timelines
    const timelines = await base44.asServiceRole.entities.ServiceTitanWebhookTimeline.filter({ webhook_event_id: targetRecord.id }, null, 100);
    ctx.recordsScanned.timelines = timelines.length;
    const eventIds = new Set([targetRecord.id]);
    await safeCheck(ctx, "timeline", () => checkTimelineIntegrity(ctx, timelines, eventIds));
  }
}

// ─── Safe Check Wrapper ───────────────────────────────────────────────────────

async function safeCheck(ctx: AuditContext, domain: string, checkFn: () => Promise<void>): Promise<void> {
  try {
    await checkFn();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.partialFailures.push(`${domain} check failed: ${errorMsg}`);
    console.error(`[ST AUDIT] Check failed for ${domain}:`, err);
  }
}