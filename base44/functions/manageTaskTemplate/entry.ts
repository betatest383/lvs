import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  normalizeRole, resolveEmployee, generateTemplateNumber,
  canManageTemplates, canPublishTemplates,
} from '../../shared/taskTemplateShared.ts';

// ═══════════════════════════════════════════════════════════════════════════
// MANAGE TASK TEMPLATE — CRUD + Lifecycle + Preview
//
// Handles the TaskTemplate registry: create, read, update, lifecycle
// transitions (submit → review → approve → publish → archive), and
// template preview (returns what task fields would be generated).
//
// SECURITY:
// - Creator identity resolved server-side via base44.auth.me()
// - Only admin/owner/director can manage templates
// - Only Published/Approved templates can be used for task creation
// - AI may never publish templates or assign binding priority
// ═══════════════════════════════════════════════════════════════════════════

// Shared helpers (normalizeRole, resolveEmployee, generateTemplateNumber,
// canManageTemplates, canPublishTemplates) are imported from
// ../../shared/taskTemplateShared.ts — shared with importTaskTemplates.

async function logTemplateEvent(base44, templateId, eventType, details, userEmail) {
  try {
    await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: 'TPL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      log_type: 'event',
      source_module: 'task_template_registry',
      trigger_event: eventType,
      related_record_id: templateId,
      status: 'success',
      conditions_met: true,
      execution_trace_json: JSON.stringify({ ...details, timestamp: new Date().toISOString(), user: userEmail }),
      triggered_by: userEmail,
    });
  } catch {}
}

// ─── Template → Task field projection (for preview and creation) ────────────
function projectTaskFields(template) {
  const now = new Date();
  const fields = {
    title: template.template_name,
    description: template.description || '',
    department: template.department_name_snapshot || '',
    task_type: 'Operational',
    priority: template.default_priority || 'Medium',
    work_category: template.work_category || 'routine',
    business_impact: template.business_impact || 'none',
    urgency: template.urgency || 'none',
    interruptibility: template.interruptibility || 'freely_interruptible',
    focus_lock_eligible: template.focus_lock_eligible || false,
    resume_required: template.resume_required || false,
    requires_immediate_acknowledgment: template.requires_immediate_acknowledgment || false,
    acknowledgment_deadline_minutes: template.acknowledgment_deadline_minutes || null,
    may_be_paused: true,
    claim_mode: template.claim_mode || 'assigned',
    required_employee_count: template.required_employee_count || 1,
    required_capabilities: template.required_capabilities || [],
    required_training_ids: template.required_training_ids || [],
    required_certification_ids: template.required_certification_ids || [],
    required_equipment_ids: template.required_equipment_ids || [],
    execution_mode: template.execution_mode || 'simple_action',
    related_route: template.execution_route || '',
    related_sop: template.linked_sop_ids?.[0] || '',
    workflow_type: template.linked_workflow_id || '',
    requires_approval: template.requires_approval || false,
    self_approval_prohibited: template.self_approval_prohibited !== false,
    linked_training_id: template.linked_training_ids?.[0] || '',
  };

  if (template.default_due_offset_minutes) {
    const due = new Date(now.getTime() + template.default_due_offset_minutes * 60000);
    fields.due_at = due.toISOString();
    fields.due_date = due.toISOString().split('T')[0];
  }
  if (template.must_start_offset_minutes) {
    fields.must_start_by = new Date(now.getTime() + template.must_start_offset_minutes * 60000).toISOString();
  }
  if (template.estimated_duration_minutes) {
    fields.estimated_duration_minutes = template.estimated_duration_minutes;
  }
  if (template.overdue_escalation_minutes) {
    fields.escalation_due_date = new Date(now.getTime() + template.overdue_escalation_minutes * 60000).toISOString().split('T')[0];
  }

  return fields;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const { employee, roleKey, employeeName } = await resolveEmployee(base44, user);

    // ─── LIST ──────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { filters, page, limit } = body;
      const query = { data_classification: { $ne: 'archived' } };
      if (filters?.department) query.department_name_snapshot = filters.department;
      if (filters?.work_category) query.work_category = filters.work_category;
      if (filters?.execution_mode) query.execution_mode = filters.execution_mode;
      if (filters?.assignment_mode) query.assignment_mode = filters.assignment_mode;
      if (filters?.status) query.status = filters.status;
      if (filters?.trigger_type) query.trigger_type = filters.trigger_type;
      if (filters?.requires_approval !== undefined) query.requires_approval = filters.requires_approval;
      if (filters?.interruptibility) query.interruptibility = filters.interruptibility;
      if (filters?.search) {
        query.$or = [
          { template_name: { $regex: filters.search, $options: 'i' } },
          { template_key: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
        ];
      }

      const sort = filters?.sort || '-created_date';
      const maxLimit = Math.min(limit || 100, 500);
      const skip = (page || 0) * maxLimit;

      const templates = await base44.asServiceRole.entities.TaskTemplate.filter(query, sort, maxLimit, skip);
      return Response.json({ success: true, templates, count: templates.length });
    }

    // ─── GET ───────────────────────────────────────────────────────────────
    if (action === 'get') {
      const { templateId } = body;
      const template = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
      return Response.json({ success: true, template });
    }

    // ─── SEARCH (for combobox) ──────────────────────────────────────────────
    if (action === 'search') {
      const { query: searchQuery, page: pageNum, filters } = body;
      const pageSize = 20;
      const skip = (pageNum || 0) * pageSize;
      const dbQuery = {
        data_classification: { $ne: 'archived' },
        status: { $in: ['Draft', 'In Review', 'Approved', 'Published'] },
      };
      if (searchQuery) {
        dbQuery.$or = [
          { template_name: { $regex: searchQuery, $options: 'i' } },
          { template_key: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
        ];
      }
      if (filters?.department) dbQuery.department_name_snapshot = filters.department;
      if (filters?.excludeArchived !== false) dbQuery.data_classification = { $ne: 'archived' };

      const templates = await base44.asServiceRole.entities.TaskTemplate.filter(dbQuery, '-updated_date', pageSize, skip);
      const items = templates.map(t => ({
        id: t.id,
        label: t.template_name + ' (' + t.template_number + ')',
        secondary: (t.department_name_snapshot || '') + ' — ' + (t.status || 'Draft'),
      }));
      return Response.json({ success: true, items, hasMore: templates.length === pageSize });
    }

    // ─── RESOLVE (IDs to labels for editing) ────────────────────────────────
    if (action === 'resolve') {
      const { ids } = body;
      if (!ids || ids.length === 0) return Response.json({ success: true, resolved: {} });
      const templates = await base44.asServiceRole.entities.TaskTemplate.filter(
        { id: { $in: ids } }, null, ids.length
      );
      const resolved = {};
      for (const t of templates) {
        resolved[t.id] = {
          label: t.template_name + ' (' + t.template_number + ')',
          secondary: (t.department_name_snapshot || '') + ' — ' + (t.status || 'Draft'),
        };
      }
      return Response.json({ success: true, resolved });
    }

    // ─── CREATE ────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (!canManageTemplates(roleKey)) {
        return Response.json({ error: 'Not authorized to manage task templates' }, { status: 403 });
      }
      const { templateData } = body;
      if (!templateData?.template_name) {
        return Response.json({ error: 'template_name is required' }, { status: 400 });
      }

      const templateNumber = await generateTemplateNumber(base44);
      const templateKey = templateData.template_key || String(templateData.template_name)
        .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      const created = await base44.asServiceRole.entities.TaskTemplate.create({
        ...templateData,
        template_number: templateNumber,
        template_key: templateKey,
        status: templateData.status || 'Draft',
        version: 1,
        data_classification: templateData.data_classification || 'production',
        created_by: employeeName,
        created_at: new Date().toISOString(),
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
      });

      await logTemplateEvent(base44, created.id, 'template_created', {
        template_number: templateNumber, name: templateData.template_name,
      }, user.email);

      return Response.json({ success: true, template: created });
    }

    // ─── UPDATE ───────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!canManageTemplates(roleKey)) {
        return Response.json({ error: 'Not authorized to manage task templates' }, { status: 403 });
      }
      const { templateId, templateData, changeSummary } = body;
      const existing = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });

      // Published templates require a new version for changes
      if (existing.status === 'Published' && !canPublishTemplates(roleKey)) {
        return Response.json({ error: 'Cannot edit published template without creating a new version' }, { status: 403 });
      }

      const updated = await base44.asServiceRole.entities.TaskTemplate.update(templateId, {
        ...templateData,
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
        change_summary: changeSummary || '',
        previous_version_id: existing.previous_version_id || null,
      });

      await logTemplateEvent(base44, templateId, 'template_updated', {
        changes: Object.keys(templateData || {}), change_summary: changeSummary,
      }, user.email);

      return Response.json({ success: true, template: updated });
    }

    // ─── SUBMIT FOR REVIEW ─────────────────────────────────────────────────
    if (action === 'submit_for_review') {
      if (!canManageTemplates(roleKey)) {
        return Response.json({ error: 'Not authorized' }, { status: 403 });
      }
      const { templateId } = body;
      const existing = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });
      if (existing.status !== 'Draft') {
        return Response.json({ error: 'Only Draft templates can be submitted for review' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.TaskTemplate.update(templateId, {
        status: 'In Review',
        submitted_for_review_at: new Date().toISOString(),
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
      });
      await logTemplateEvent(base44, templateId, 'template_submitted_for_review', {}, user.email);
      return Response.json({ success: true, template: updated });
    }

    // ─── APPROVE ──────────────────────────────────────────────────────────
    if (action === 'approve') {
      if (!canPublishTemplates(roleKey)) {
        return Response.json({ error: 'Only Owner/Admin can approve templates' }, { status: 403 });
      }
      const { templateId, reviewNotes } = body;
      const existing = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });
      if (existing.status !== 'In Review') {
        return Response.json({ error: 'Only templates In Review can be approved' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.TaskTemplate.update(templateId, {
        status: 'Approved',
        reviewed_by: employeeName,
        reviewed_at: new Date().toISOString(),
        approved_by: employeeName,
        approved_at: new Date().toISOString(),
        notes: reviewNotes || existing.notes,
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
      });
      await logTemplateEvent(base44, templateId, 'template_approved', { reviewer: employeeName }, user.email);
      return Response.json({ success: true, template: updated });
    }

    // ─── PUBLISH ──────────────────────────────────────────────────────────
    if (action === 'publish') {
      if (!canPublishTemplates(roleKey)) {
        return Response.json({ error: 'Only Owner/Admin can publish templates' }, { status: 403 });
      }
      const { templateId } = body;
      const existing = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });
      if (existing.status !== 'Approved') {
        return Response.json({ error: 'Only Approved templates can be published' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.TaskTemplate.update(templateId, {
        status: 'Published',
        published_by: employeeName,
        published_at: new Date().toISOString(),
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
      });
      await logTemplateEvent(base44, templateId, 'template_published', { publisher: employeeName }, user.email);
      return Response.json({ success: true, template: updated });
    }

    // ─── ARCHIVE ──────────────────────────────────────────────────────────
    if (action === 'archive') {
      if (!canManageTemplates(roleKey)) {
        return Response.json({ error: 'Not authorized' }, { status: 403 });
      }
      const { templateId, archiveReason } = body;
      const existing = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });

      const updated = await base44.asServiceRole.entities.TaskTemplate.update(templateId, {
        status: 'Archived',
        data_classification: 'archived',
        notes: (existing.notes || '') + '\n\nArchived: ' + (archiveReason || ''),
        updated_by: employeeName,
        updated_at: new Date().toISOString(),
      });
      await logTemplateEvent(base44, templateId, 'template_archived', { reason: archiveReason }, user.email);
      return Response.json({ success: true, template: updated });
    }

    // ─── PREVIEW (returns projected task fields without creating a task) ───
    if (action === 'preview') {
      const { templateId } = body;
      const template = await base44.asServiceRole.entities.TaskTemplate.get(templateId);
      if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });

      const projectedFields = projectTaskFields(template);
      return Response.json({
        success: true,
        template,
        projected_fields: projectedFields,
        warnings: [],
      });
    }

    // ─── GET USABLE (for task creation combobox — only Approved/Published) ──
    if (action === 'get_usable') {
      const { query: searchQuery, page: pageNum } = body;
      const pageSize = 20;
      const skip = (pageNum || 0) * pageSize;
      const dbQuery = {
        status: { $in: ['Approved', 'Published'] },
        data_classification: { $ne: 'archived' },
      };
      if (searchQuery) {
        dbQuery.$or = [
          { template_name: { $regex: searchQuery, $options: 'i' } },
          { template_key: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
        ];
      }
      const templates = await base44.asServiceRole.entities.TaskTemplate.filter(dbQuery, '-updated_date', pageSize, skip);
      const items = templates.map(t => ({
        id: t.id,
        label: t.template_name + ' (' + t.template_number + ')',
        secondary: (t.department_name_snapshot || '') + ' — ' + (t.work_category || 'routine'),
        template: t,
      }));
      return Response.json({ success: true, items, hasMore: templates.length === pageSize });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[MANAGE TEMPLATE ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});