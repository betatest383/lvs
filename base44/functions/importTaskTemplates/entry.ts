import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  normalizeRole, resolveEmployee, generateTemplateNumber,
  canManageTemplates,
} from '../../shared/taskTemplateShared.ts';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT TASK TEMPLATES — safe CSV bulk import into the existing TaskTemplate
// registry. Admin-only. Every imported row becomes a Draft (never auto-
// published). Duplicates detected by template_key are skipped + reported.
//
// DEPARTMENT HANDLING (per owner directive):
// There is NO Department entity in LVC OS — departments are a fixed string
// enum used for routing. CSV department_name values are normalized to that
// canonical enum and stored in department_name_snapshot (the routing field).
// default_department_id and department_id are left BLANK (no record IDs).
// Rows whose department_name cannot be mapped are skipped + reported.
//
// SAFETY:
// - Creates ONLY TaskTemplate records (status: 'Draft', version 1).
// - Does NOT create live EnterpriseTask records, assign employees, send
//   notifications, or touch Jobs / Customers / Locations / Appointments /
//   Zapier workflows. No Department records are created or resolved.
// ═══════════════════════════════════════════════════════════════════════════

// Canonical LVC OS Department enum (routing values).
const VALID_DEPARTMENTS = new Set([
  'Warehouse', 'Operations', 'Field Service', 'Customer Service', 'Sales',
  'Finance', 'Administration', 'Management', 'Fleet', 'Safety & Compliance',
  'IT', 'Human Resources',
]);

// CSV department_name → canonical LVC OS Department enum.
// Includes primary department_name values AND category-style values that may
// appear in the department_name column. No new enum values are invented.
const DEPARTMENT_MAP: Record<string, string> = {
  // Primary department_name values
  'Office / CSR': 'Customer Service',
  'Operations / Dispatch': 'Operations',
  'Job Readiness & Pre-Arrival': 'Operations',
  'On-Site Customer Requests': 'Field Service',
  'Technical / Sales': 'Field Service',
  'Sales': 'Sales',
  'Operations / Sales': 'Operations',
  'Warehouse / Inventory': 'Warehouse',
  'Warehouse / Equipment': 'Warehouse',
  'Fleet / Operations': 'Fleet',
  'Management / Safety': 'Safety & Compliance',
  'Operations / Quality': 'Operations',
  'Purchasing / Warehouse': 'Warehouse',
  'Accounting': 'Finance',
  'Operations / HR': 'Operations',
  'Management / Training': 'Management',
  'LVC OS / Technology': 'IT',
  'Human Resources': 'Human Resources',
  'Management': 'Management',
  'Warehouse / Facilities': 'Warehouse',
  'Marketing': 'Administration',
  'Membership / CSR': 'Customer Service',
  'Improvement & Feedback': 'Management',
  // Category-style values that may also appear in department_name
  'Customer & Contact': 'Customer Service',
  'Appointment & Scheduling': 'Operations',
  'Inspection & Findings': 'Field Service',
  'Estimate, Sales & Pricing': 'Sales',
  'Materials & Inventory': 'Warehouse',
  'Tools & Equipment': 'Warehouse',
  'Vehicle & Fleet': 'Fleet',
  'Safety & Incidents': 'Safety & Compliance',
  'Payments, Invoicing & Bookkeeping': 'Finance',
  'Sales Lead & Business Development': 'Sales',
};

function resolveDepartment(raw: string): string | null {
  const key = String(raw ?? '').trim();
  if (!key) return null;
  const mapped = DEPARTMENT_MAP[key];
  if (mapped && VALID_DEPARTMENTS.has(mapped)) return mapped;
  // Case-insensitive fallback on the map keys
  const lower = key.toLowerCase();
  for (const k of Object.keys(DEPARTMENT_MAP)) {
    if (k.toLowerCase() === lower) {
      const m = DEPARTMENT_MAP[k];
      if (VALID_DEPARTMENTS.has(m)) return m;
    }
  }
  return null;
}

const ALLOWED_ENUMS = {
  urgency: ['none', 'low', 'medium', 'high', 'immediate'],
  business_impact: ['none', 'low', 'medium', 'high', 'severe'],
  interruptibility: [
    'freely_interruptible', 'interruptible_with_checkpoint',
    'manager_approval_required', 'non_interruptible', 'critical_only',
  ],
  assignment_mode: [
    'specific_employee', 'multiple_employees', 'role_queue',
    'department_queue', 'eligibility_engine', 'manager_selects',
  ],
  work_category: [
    'critical', 'operational_interruption', 'high_priority',
    'scheduled_primary', 'routine', 'busy_work',
  ],
  execution_mode: [
    'simple_action', 'checklist', 'guided_task', 'form',
    'workflow', 'wizard', 'automated', 'linked_module',
  ],
};

// CSV priority taxonomy (P1–P4) → TaskTemplate default_priority enum.
const PRIORITY_MAP: Record<string, string> = {
  'P1': 'Critical', 'P2': 'High', 'P3': 'Medium', 'P4': 'Low',
  'Critical': 'Critical', 'High': 'High', 'Medium': 'Medium', 'Low': 'Low',
};

function parseArray(v) {
  if (!v) return [];
  return String(v).split(/[|;]/).map(s => s.trim()).filter(Boolean);
}

function parseBool(v) {
  if (v === true || v === '1') return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function parseCount(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function enumOrDefault(field, value, fallback) {
  return ALLOWED_ENUMS[field].includes(value) ? value : fallback;
}

function resolvePriority(raw) {
  const v = String(raw ?? '').trim();
  return PRIORITY_MAP[v] || 'Medium';
}

function buildTemplateData(row, employeeName, department) {
  const templateName = String(row.template_name ?? '').trim();
  const templateKey = String(row.template_key ?? '').trim();
  return {
    template_name: templateName,
    template_key: templateKey,
    category: String(row.category ?? '').trim() || '',
    // Department routing: canonical enum value in the snapshot field.
    // No Department entity exists → ID fields intentionally blank.
    department_name_snapshot: department,
    department_id: '',
    default_department_id: '',
    description: String(row.description ?? '').trim() || '',
    instructions: String(row.instructions ?? '').trim() || '',
    default_priority: resolvePriority(row.default_priority),
    urgency: enumOrDefault('urgency', String(row.urgency ?? '').trim(), 'none'),
    business_impact: enumOrDefault('business_impact', String(row.business_impact ?? '').trim(), 'none'),
    interruptibility: enumOrDefault('interruptibility', String(row.interruptibility ?? '').trim(), 'freely_interruptible'),
    assignment_mode: enumOrDefault('assignment_mode', String(row.assignment_mode ?? '').trim(), 'specific_employee'),
    default_role_ids: parseArray(row.default_role_ids),
    requires_approval: parseBool(row.requires_approval),
    approval_role_ids: parseArray(row.approval_role_ids),
    required_employee_count: parseCount(row.required_employee_count),
    work_category: enumOrDefault('work_category', String(row.work_category ?? '').trim(), 'routine'),
    execution_mode: enumOrDefault('execution_mode', String(row.execution_mode ?? '').trim(), 'simple_action'),
    // Lifecycle defaults — ALWAYS Draft, never auto-publish
    status: 'Draft',
    version: 1,
    data_classification: 'production',
    trigger_type: 'manual',
    claim_mode: 'assigned',
    created_by: employeeName,
    created_at: new Date().toISOString(),
    updated_by: employeeName,
    updated_at: new Date().toISOString(),
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { roleKey, employeeName } = await resolveEmployee(base44, user);
    if (!canManageTemplates(roleKey)) {
      return Response.json(
        { error: 'Only admin/owner/director_of_operations may import templates' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return Response.json({ error: 'No rows provided' }, { status: 400 });
    if (rows.length > 500) return Response.json({ error: 'Maximum 500 rows per import' }, { status: 400 });

    const report = [];
    let created = 0;
    let skippedDuplicate = 0;
    let skippedUnresolvedDept = 0;
    let errors = 0;
    const seenKeys = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const rowNum = i + 1;
      const templateName = String(row.template_name ?? '').trim();
      const templateKey = String(row.template_key ?? '').trim();
      const rawDept = String(row.department_name ?? '').trim();

      try {
        if (!templateName) {
          errors++;
          report.push({ row: rowNum, template_key: templateKey, template_name: templateName, status: 'error', message: 'Missing required field: template_name', resolved_department: null });
          continue;
        }
        if (!templateKey) {
          errors++;
          report.push({ row: rowNum, template_key: '', template_name: templateName, status: 'error', message: 'Missing required field: template_key', resolved_department: null });
          continue;
        }

        // Duplicate detection (in-file + existing registry) by template_key
        if (seenKeys.has(templateKey)) {
          skippedDuplicate++;
          report.push({ row: rowNum, template_key: templateKey, template_name: templateName, status: 'skipped_duplicate', message: 'Duplicate template_key within this import file', resolved_department: resolveDepartment(rawDept) });
          continue;
        }
        const existing = await base44.asServiceRole.entities.TaskTemplate.filter({ template_key: templateKey }, null, 1);
        if (existing.length > 0) {
          seenKeys.add(templateKey);
          skippedDuplicate++;
          report.push({ row: rowNum, template_key: templateKey, template_name: templateName, status: 'skipped_duplicate', message: 'template_key already exists in registry', resolved_department: resolveDepartment(rawDept), template_id: existing[0].id, existing_status: existing[0].status });
          continue;
        }
        seenKeys.add(templateKey);

        // Department normalization — skip if unmapped (no new enum values)
        const department = resolveDepartment(rawDept);
        if (!department) {
          skippedUnresolvedDept++;
          report.push({ row: rowNum, template_key: templateKey, template_name: templateName, status: 'skipped_unresolved_department', message: `No department mapping for: "${rawDept}"`, resolved_department: null, raw_department_name: rawDept });
          continue;
        }

        const templateNumber = await generateTemplateNumber(base44);
        const data = buildTemplateData(row, employeeName, department);
        data.template_number = templateNumber;
        const createdRec = await base44.asServiceRole.entities.TaskTemplate.create(data);
        created++;
        report.push({
          row: rowNum, template_key: templateKey, template_name: templateName,
          status: 'created', message: 'Imported as Draft',
          resolved_department: department, resolved_department_id: null,
          template_id: createdRec.id, template_number: templateNumber,
        });
      } catch (e) {
        errors++;
        report.push({
          row: rowNum, template_key: templateKey, template_name: templateName,
          status: 'error', message: 'Create failed: ' + (e?.message || String(e)),
          resolved_department: resolveDepartment(rawDept),
        });
      }
    }

    return Response.json({
      success: true,
      created,
      skipped_duplicate: skippedDuplicate,
      skipped_unresolved_department: skippedUnresolvedDept,
      skipped: skippedDuplicate + skippedUnresolvedDept, // total, for UI backward-compat
      errors,
      total: rows.length,
      report,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}