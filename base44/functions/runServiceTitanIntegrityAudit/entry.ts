import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";
import { runAudit, type AuditConfig } from "../../shared/stCrossDomainIntegrityAudit.ts";

/**
 * ServiceTitan Cross-Domain Integrity Audit
 *
 * Admin-only backend function that runs a read-only integrity audit across
 * Customer, Job, Appointment, EmployeeRegistry, webhook events, timelines,
 * replays, and conflict histories.
 *
 * Modes:
 *   - "summary": runs all checks but only returns critical and high issues
 *   - "full":    runs all checks and returns all issues (including medium, low, informational)
 *   - "record":  targeted checks on a single record (requires domain + local_record_id or servicetitan_id)
 *
 * SAFETY: This function NEVER creates, updates, merges, deletes, relinks,
 * replays, retries, or recovers any record. It only reads and reports.
 *
 * Performance:
 *   - Uses pagination (batch size 200, up to 50 batches = 10,000 records)
 *   - Batch relationship lookups via Maps
 *   - Each check is independent — partial failure does not lose the audit
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    // Parse request body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body — default to summary mode
    }

    const mode = body.mode || "summary";
    if (!["summary", "full", "record", "report"].includes(mode)) {
      return Response.json({ error: `Invalid mode '${mode}'. Must be: summary, full, record, or report` }, { status: 400 });
    }

    const config: AuditConfig = {
      mode,
      domain: body.domain,
      local_record_id: body.local_record_id,
      servicetitan_id: body.servicetitan_id,
    };

    // Validate record mode requirements
    if (mode === "record" && !config.domain && !config.local_record_id && !config.servicetitan_id) {
      return Response.json({
        error: "Record mode requires at least one of: domain, local_record_id, servicetitan_id"
      }, { status: 400 });
    }

    console.log(`[ST AUDIT] Starting ${mode} audit by ${user.email || user.id}`);

    const result = await runAudit(base44, config);

    console.log(`[ST AUDIT] Completed ${mode} audit: ${result.issue_counts.critical} critical, ${result.issue_counts.high} high, ${result.issue_counts.medium} medium, ${result.issue_counts.low} low, ${result.issue_counts.informational} informational`);

    // "verify" parameter strips the checks array for a compact response
    if (body.verify) {
      const { checks, ...compact } = result;
      return Response.json(compact);
    }

    // "math" parameter returns only the mathematical verification
    if (body.math) {
      const ic = result.issue_counts;
      const sc = result.sync_issue_counts;
      const gf = result.grouped_findings || [];
      const sumIssues = ic.critical + ic.high + ic.medium + ic.low + ic.informational;
      const sumSync = sc.critical + sc.high + sc.medium + sc.low + sc.informational;
      const sumGrouped = gf.reduce((a, g) => a + g.count, 0);
      const sumSyncGrouped = gf.filter(g => g.category === "synchronization").reduce((a, g) => a + g.count, 0);
      const sumLegacyGrouped = gf.filter(g => g.category === "legacy_migration").reduce((a, g) => a + g.count, 0);
      return Response.json({
        integrity_status: result.integrity_status,
        issue_counts: ic,
        sync_issue_counts: sc,
        sum_issue_counts: sumIssues,
        sum_grouped_findings: sumGrouped,
        math_1_grouped_equals_issues: sumGrouped === sumIssues,
        sum_sync_grouped: sumSyncGrouped,
        sum_sync_issue_counts: sumSync,
        math_2_sync_grouped_equals_sync_counts: sumSyncGrouped === sumSync,
        sum_legacy_grouped: sumLegacyGrouped,
        grouped_findings: gf,
        sync_by_check: result.synchronization_findings_by_check,
        legacy_by_check: result.legacy_migration_findings_by_check,
      });
    }

    return Response.json(result);
  } catch (error) {
    console.error("[ST AUDIT ERROR]", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});