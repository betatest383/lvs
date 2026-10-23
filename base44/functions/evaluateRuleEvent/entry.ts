import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Enterprise Rules Engine — Event Evaluation Pipeline
 *
 * Receives an event (from entity automation or manual trigger),
 * logs it, finds matching active rules, evaluates conditions,
 * executes actions, and logs every outcome to AutomationRunLog.
 */

const OPERATORS = {
  equals: (a, b) => String(a) === String(b),
  not_equals: (a, b) => String(a) !== String(b),
  contains: (a, b) => String(a).includes(String(b)),
  not_contains: (a, b) => !String(a).includes(String(b)),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  exists: (a) => a !== undefined && a !== null && a !== '',
  not_exists: (a) => a === undefined || a === null || a === '',
  is_empty: (a) => a === '' || a === undefined || a === null,
  is_not_empty: (a) => a !== '' && a !== undefined && a !== null,
};

const ACTION_MAP = {
  'task.create': { entity: 'EnterpriseTask', operation: 'create' },
  'task.update': { entity: 'EnterpriseTask', operation: 'update', lookupField: 'task_id' },
  'task.complete': { entity: 'EnterpriseTask', operation: 'update', lookupField: 'task_id' },
  'task.assign': { entity: 'EnterpriseTask', operation: 'update', lookupField: 'task_id' },
  'task.change_priority': { entity: 'EnterpriseTask', operation: 'update', lookupField: 'task_id' },
  'notification.create': { entity: 'EnterpriseNotification', operation: 'create' },
  'notification.update': { entity: 'EnterpriseNotification', operation: 'update', lookupField: 'notification_id' },
  'notification.require_ack': { entity: 'EnterpriseNotification', operation: 'update', lookupField: 'notification_id' },
  'notification.escalate': { entity: 'EnterpriseNotification', operation: 'update', lookupField: 'notification_id' },
  'management.corrective_action': { entity: 'CorrectiveAction', operation: 'create' },
  'management.improvement': { entity: 'ImprovementRequest', operation: 'create' },
  'management.schedule_audit': { entity: 'ManagementAudit', operation: 'create' },
  'management.schedule_training': { entity: 'EmployeeCertification', operation: 'create' },
  'management.schedule_cert_renewal': { entity: 'EmployeeCertification', operation: 'create' },
  'workflow.start': { entity: 'WorkflowRegistry', operation: 'create' },
  'workflow.complete': { entity: 'WorkflowRegistry', operation: 'update', lookupField: 'workflow_id' },
  'workflow.cancel': { entity: 'WorkflowRegistry', operation: 'update', lookupField: 'workflow_id' },
  'ops.executive_alert': { entity: 'EnterpriseNotification', operation: 'create' },
  'ops.company_health': { entity: 'EnterpriseNotification', operation: 'create' },
  'ops.exec_attention': { entity: 'EnterpriseTask', operation: 'create' },
  'ops.morning_brief': { entity: 'EnterpriseTask', operation: 'create' },
  'integration.publish_event': { entity: 'EnterpriseNotification', operation: 'create' },
  'inspection.create_finding': { entity: 'InspectionFinding', operation: 'create_inspection_finding' },
};

function resolveFieldValue(mapping, event) {
  if (!mapping) return undefined;
  if (mapping.source === 'static' || (!mapping.source && mapping.value !== undefined)) {
    return mapping.value;
  }
  if (mapping.source === 'event' || mapping.source === 'event_field') {
    return event[mapping.value] ?? event.payload?.[mapping.value] ?? '';
  }
  if (mapping.source === 'template' && mapping.template) {
    return mapping.template.replace(/\{(\w+)\}/g, (_, key) =>
      event[key] ?? event.payload?.[key] ?? ''
    );
  }
  return mapping.value;
}

const NOTIFY_TARGETS = [
  'Event Employee', 'Event Supervisor', 'Event Manager', 'Event Department',
  'Operations Manager', 'Warehouse', 'Department Manager', 'Owner',
  'Specific Employee', 'Specific Role', 'created_by',
];

async function resolveNotificationRecipient(base44, data, event, user) {
  const target = data.recipient_role;

  // If recipient_email is already set (e.g. from advanced fields), skip resolution
  if (data.recipient_email) return;

  // Only resolve known notify target keywords
  if (!NOTIFY_TARGETS.includes(target)) return;

  switch (target) {
    case 'Owner': {
      // Resolve to the authenticated user
      if (user?.email) {
        data.recipient_email = user.email;
        data.recipient_name = user.full_name || '';
      }
      // Enrich with EmployeeRegistry record
      if (user?.email) {
        try {
          const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { email: user.email }, '-created_date', 1
          );
          if (emps && emps.length > 0) {
            const emp = emps[0];
            data.recipient_name = `${emp.first_name} ${emp.last_name}`.trim() || data.recipient_name;
            data.related_employee = emp.employee_id || '';
            data.recipient_role = emp.primary_role || '';
            data.recipient_department = emp.department || '';
            data.recipient_user_id = emp.linked_user_id || '';
            }
            } catch {}
            }
            break;
            }
            case 'Event Employee': {
            const empEmail = event.employee_email || event.payload?.employee_email || '';
            const empName = event.employee || event.payload?.employee || '';
            if (empEmail) {
            data.recipient_email = empEmail;
            data.recipient_name = empName;
            // Enrich with EmployeeRegistry
            try {
            const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { email: empEmail }, '-created_date', 1
            );
            if (emps && emps.length > 0) {
            const emp = emps[0];
            data.recipient_name = `${emp.first_name} ${emp.last_name}`.trim() || empName;
            data.recipient_role = emp.primary_role || '';
            data.recipient_department = emp.department || '';
            data.related_employee = emp.employee_id || '';
            data.recipient_user_id = emp.linked_user_id || '';
            }
            } catch {}
            }
            break;
            }
    case 'Event Supervisor':
    case 'Event Manager': {
      const empEmail = event.employee_email || event.payload?.employee_email || '';
      if (empEmail) {
        try {
          const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { email: empEmail }, '-created_date', 1
          );
          if (emps && emps.length > 0 && emps[0].supervisor) {
            const sups = await base44.asServiceRole.entities.EmployeeRegistry.filter(
              { employee_id: emps[0].supervisor }, '-created_date', 1
            );
            if (sups && sups.length > 0) {
              data.recipient_email = sups[0].email || '';
              data.recipient_name = `${sups[0].first_name} ${sups[0].last_name}`.trim();
              data.related_employee = sups[0].employee_id || '';
              data.recipient_role = sups[0].primary_role || '';
              data.recipient_department = sups[0].department || '';
              data.recipient_user_id = sups[0].linked_user_id || '';
              }
          }
        } catch {}
      }
      break;
    }
    case 'Event Department': {
      const dept = event.department || event.payload?.department || '';
      if (dept) {
        data.recipient_department = dept;
        data.recipient_role = '';
      }
      break;
    }
    case 'Operations Manager': {
      try {
        const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
          { primary_role: 'Operations Manager' }, '-created_date', 1
        );
        if (emps && emps.length > 0) {
          data.recipient_email = emps[0].email || '';
          data.recipient_name = `${emps[0].first_name} ${emps[0].last_name}`.trim();
          data.related_employee = emps[0].employee_id || '';
          data.recipient_role = emps[0].primary_role || '';
          data.recipient_department = emps[0].department || '';
          data.recipient_user_id = emps[0].linked_user_id || '';
          }
          } catch {}
          break;
          }
          case 'Warehouse': {
      data.recipient_department = 'Warehouse';
      data.recipient_role = '';
      break;
    }
    case 'Department Manager': {
      const dept = event.department || event.payload?.department || data.recipient_department || '';
      if (dept) data.recipient_department = dept;
      data.recipient_role = 'Department Manager';
      // Look up the department manager in EmployeeRegistry
      if (dept) {
        try {
          const mgrs = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { department: dept, primary_role: 'Department Manager' }, '-created_date', 1
          );
          if (mgrs && mgrs.length > 0) {
            data.recipient_email = mgrs[0].email || '';
            data.recipient_name = `${mgrs[0].first_name} ${mgrs[0].last_name}`.trim();
            data.related_employee = mgrs[0].employee_id || '';
            data.recipient_user_id = mgrs[0].linked_user_id || '';
          }
        } catch {}
      }
      break;
    }
    case 'Specific Employee': {
      // recipient_email should be set from advanced fields — enrich via EmployeeRegistry
      if (data.recipient_email) {
        try {
          const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { email: data.recipient_email }, '-created_date', 1
          );
          if (emps && emps.length > 0) {
            data.recipient_name = `${emps[0].first_name} ${emps[0].last_name}`.trim();
            data.recipient_role = emps[0].primary_role || '';
            data.recipient_department = emps[0].department || '';
            data.related_employee = emps[0].employee_id || '';
            data.recipient_user_id = emps[0].linked_user_id || '';
          }
        } catch {}
      }
      break;
    }
    case 'Specific Role': {
      // recipient_role comes from advanced field — look up first employee with that role
      const targetRole = data.recipient_role || '';
      if (targetRole) {
        try {
          const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { primary_role: targetRole, account_status: 'Active' }, '-created_date', 1
          );
          if (emps && emps.length > 0) {
            data.recipient_email = emps[0].email || '';
            data.recipient_name = `${emps[0].first_name} ${emps[0].last_name}`.trim();
            data.related_employee = emps[0].employee_id || '';
            data.recipient_department = emps[0].department || '';
            data.recipient_user_id = emps[0].linked_user_id || '';
          }
        } catch {}
      }
      break;
    }
    case 'created_by': {
      // Legacy/accidental mapping: resolve to the event creator or authenticated user
      const creatorEmail = event.created_by_email || event.payload?.created_by_email
        || event.created_by || event.payload?.created_by || '';
      if (creatorEmail && creatorEmail.includes('@')) {
        data.recipient_email = creatorEmail;
        data.recipient_name = event.created_by || event.payload?.created_by || '';
      } else if (user?.email) {
        // Fall back to the authenticated user (the person who triggered the event)
        data.recipient_email = user.email;
        data.recipient_name = user.full_name || '';
      }
      // Enrich with EmployeeRegistry if possible
      const resolveEmail = data.recipient_email;
      if (resolveEmail) {
        try {
          const emps = await base44.asServiceRole.entities.EmployeeRegistry.filter(
            { email: resolveEmail }, '-created_date', 1
          );
          if (emps && emps.length > 0) {
            const emp = emps[0];
            data.recipient_name = `${emp.first_name} ${emp.last_name}`.trim() || data.recipient_name;
            data.related_employee = emp.employee_id || '';
            data.recipient_role = emp.primary_role || '';
            data.recipient_department = emp.department || '';
            data.recipient_user_id = emp.linked_user_id || '';
            }
            } catch {}
            }
            break;
            }
            }
            }

async function executeAction(base44, action, event, user) {
  const config = ACTION_MAP[action.action_key];
  if (!config) throw new Error(`Unknown action key: ${action.action_key}`);

  const mappings = action.field_mappings || [];
  const data = {};

  for (const m of mappings) {
    const val = resolveFieldValue(m, event);
    if (val !== undefined && val !== null && val !== '') {
      if (m.field === 'delivery_methods' && typeof val === 'string') {
        data[m.field] = val.split(',').map(v => v.trim()).filter(Boolean);
      } else {
        data[m.field] = val;
      }
    }
  }

  // Auto-generate IDs for create operations
  if (config.operation === 'create') {
    if (config.entity === 'EnterpriseNotification' && !data.notification_id) {
      data.notification_id = `NOT-AUTO-${Date.now()}`;
    }
    if (config.entity === 'EnterpriseTask' && !data.task_id) {
      data.task_id = `TASK-AUTO-${Date.now()}`;
    }
    if (config.entity === 'EnterpriseNotification' && !data.status) {
      data.status = 'Pending';
    }
    // Resolve notification recipient (Notify = Owner, Event Employee, etc.)
    if (config.entity === 'EnterpriseNotification') {
      await resolveNotificationRecipient(base44, data, event, user);
    }
  }

  // Dynamic record operations (record.update_status, record.update_field, etc.)
  if (config.entity === '_dynamic' || action.action_key.startsWith('record.')) {
    const entityName = data.entity_name;
    const recordId = data.record_id;
    if (!entityName || !recordId) throw new Error('Dynamic record action requires entity_name and record_id');

    const updateData = {};
    if (action.action_key === 'record.update_status') {
      updateData.status = data.status;
    } else if (action.action_key === 'record.update_field') {
      updateData[data.field_name] = data.field_value;
    } else if (action.action_key === 'record.add_note') {
      updateData.notes = data.note;
    } else if (action.action_key === 'record.add_comment') {
      updateData.comments = data.comment;
    } else if (action.action_key === 'record.timeline_entry') {
      updateData.notes = data.entry;
    }

    await base44.asServiceRole.entities[entityName].update(recordId, updateData);
    return { entity: entityName, id: recordId, updated: true };
  }

  // Webhook action
  if (config.entity === '_webhook') {
    const url = data.webhook_url;
    if (!url) throw new Error('Webhook URL required');
    const method = (data.http_method || 'POST').toUpperCase();
    const headers = data.headers_json ? JSON.parse(data.headers_json) : { 'Content-Type': 'application/json' };
    const body = data.body_json || JSON.stringify(event);
    const resp = await fetch(url, { method, headers, body });
    return { webhook: true, status: resp.status };
  }

  // Inspection Finding creation — loads Repair Template and inherits all values
  if (config.operation === 'create_inspection_finding') {
    const repairTemplateId = data.repair_template_id;
    if (!repairTemplateId) throw new Error('Repair Template is required for Create Deficiency Finding');

    // Load the Repair Recommendation Template to inherit all configuration
    const template = await base44.asServiceRole.entities.RepairRecommendationTemplate.get(repairTemplateId)
      .catch(() => null);

    if (!template) throw new Error(`Repair Template not found: ${repairTemplateId}`);

    // Build the finding with inherited values from the template
    const findingData = {
      inspection_id: data.inspection_id || event.inspection_id || event.payload?.inspection_id || '',
      job_id: data.job_id || event.job_id || event.payload?.job_id || '',
      customer_id: data.customer_id || event.customer_id || event.payload?.customer_id || '',
      customer_name: data.customer_name || event.customer_name || event.payload?.customer_name || '',
      finding_location: data.finding_location || event.finding_location || event.payload?.finding_location || event.question_text || '',
      repair_template_id: repairTemplateId,
      deficiency_type: template.deficiency_type || data.deficiency_type || '',
      severity: template.severity || data.severity || 'moderate',
      customer_facing_explanation: template.customer_facing_recommendation || template.customer_summary || template.customer_facing_explanation || '',
      recommended_repair: template.recommended_solution || template.recommended_repair || '',
      internal_notes: template.internal_notes || '',
      is_deficiency: true,
      include_in_estimate: true,
      internal_only: false,
      created_by: user?.email || 'system',
    };

    // Auto-populate safety/NFPA flags from template
    if (template.safety_notes) {
      findingData.safety_concern = true;
    }

    const result = await base44.asServiceRole.entities.InspectionFinding.create(findingData);
    return { entity: 'InspectionFinding', id: result.id, created: true, repair_template: template.template_name };
  }

  // Function trigger action
  if (config.entity === '_function') {
    const fnName = data.function_name;
    if (!fnName) throw new Error('Function name required');
    const fnPayload = data.payload_json ? JSON.parse(data.payload_json) : {};
    const result = await base44.asServiceRole.functions.invoke(fnName, fnPayload);
    return { function: fnName, invoked: true };
  }

  // Standard entity operations
  if (config.operation === 'create') {
    const result = await base44.asServiceRole.entities[config.entity].create(data);
    return { entity: config.entity, id: result.id, created: true };
  }

  if (config.operation === 'update') {
    const lookupField = config.lookupField || 'id';
    const lookupValue = data[lookupField];
    if (!lookupValue) throw new Error(`${lookupField} required for update`);

    const records = await base44.asServiceRole.entities[config.entity].filter(
      { [lookupField]: lookupValue }, '-updated_date', 1
    );
    if (!records || records.length === 0) throw new Error(`Record not found: ${lookupField}=${lookupValue}`);

    const updateData = { ...data };
    delete updateData[lookupField];
    await base44.asServiceRole.entities[config.entity].update(records[0].id, updateData);
    return { entity: config.entity, id: records[0].id, updated: true };
  }

  throw new Error(`Unsupported operation: ${config.operation}`);
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    let eventPayload;

    // ── Detect entity automation payload (from Wh105DepartureCheck update) ──
    if (body.event && body.event.entity_name === 'Wh105DepartureCheck') {
      const data = body.data;
      const oldData = body.old_data;

      // Only fire on transition TO blocked
      if (!data || data.overall_status !== 'blocked') {
        return Response.json({ skipped: true, reason: 'overall_status is not blocked' });
      }
      if (oldData && oldData.overall_status === 'blocked') {
        return Response.json({ skipped: true, reason: 'Already blocked (no transition)' });
      }

      // Build the event payload from entity data
      let blockingReason = '';
      let blockingChecks = [];
      try {
        const detail = data.blocking_issues_detail ? JSON.parse(data.blocking_issues_detail) : [];
        if (Array.isArray(detail)) {
          blockingChecks = detail.map(c => c.label || c.check_id || c);
          blockingReason = blockingChecks.join('; ');
        } else {
          blockingReason = String(detail);
        }
      } catch { blockingReason = data.blocking_issues_detail || ''; }

      eventPayload = {
        source_module: 'wh105',
        source_module_name: 'WH-105 Morning Readiness',
        trigger_event: 'wh105.blocked',
        trigger_event_name: 'Morning Readiness Blocked',
        timestamp: new Date().toISOString(),
        employee: data.technician_name || '',
        employee_email: data.technician_email || '',
        truck: data.truck_number || '',
        truck_id: data.truck_id || '',
        status: data.overall_status,
        related_record_id: data.id || body.event.entity_id || '',
        blocking_reason: blockingReason,
        blocking_checks: blockingChecks,
        completion_percentage: data.readiness_percentage || 0,
        readiness_percentage: data.readiness_percentage || 0,
        job_number: data.job_number || '',
        department: 'Field Operations',
        payload: data,
      };

    // ── Detect entity automation payload (from EnterpriseTask create/update) ──
    } else if (body.event && body.event.entity_name === 'EnterpriseTask') {
      const eventType = body.event.type; // 'create' | 'update'
      const data = body.data || {};
      const oldData = body.old_data || {};
      const changedFields = body.changed_fields || [];
      const entityId = data.id || body.event.entity_id || '';

      const baseTaskPayload = {
        timestamp: new Date().toISOString(),
        employee: data.assigned_to || '',
        employee_email: data.assigned_to_email || '',
        truck: data.related_truck || '',
        status: data.status || '',
        related_record_id: entityId,
        task_id: data.task_id || '',
        title: data.title || '',
        department: data.department || '',
        priority: data.priority || '',
        assigned_to: data.assigned_to || '',
        assigned_role: data.assigned_role || '',
        created_by: data.created_by || '',
        due_date: data.due_date || '',
        source_module: 'enterprise_tasks',
        source_module_name: 'Enterprise Task Center',
        payload: data,
      };

      let triggerEvent = '';
      let triggerEventName = '';

      if (eventType === 'create') {
        triggerEvent = 'task.created';
        triggerEventName = 'Task Created';
        eventPayload = { ...baseTaskPayload,
          source_module: 'enterprise_tasks',
          source_module_name: 'Enterprise Task Center',
          trigger_event: triggerEvent,
          trigger_event_name: triggerEventName,
        };
      } else if (eventType === 'update') {
        // Determine the specific update event type
        if (changedFields.includes('status')) {
          const newStatus = data.status;
          const oldStatus = oldData.status;
          eventPayload = { ...baseTaskPayload,
            source_module: 'enterprise_tasks',
            source_module_name: 'Enterprise Task Center',
            trigger_event: 'task.status_changed',
            trigger_event_name: 'Task Status Changed',
            old_status: oldStatus || '',
            new_status: newStatus || '',
            changed_fields: changedFields,
          };

          // Specific status transition events
          if (newStatus === 'Blocked' && oldStatus !== 'Blocked') {
            triggerEvent = 'task.blocked';
            triggerEventName = 'Task Blocked';
            eventPayload.trigger_event = triggerEvent;
            eventPayload.trigger_event_name = triggerEventName;
          } else if (newStatus === 'Completed' && oldStatus !== 'Completed') {
            triggerEvent = 'task.completed';
            triggerEventName = 'Task Completed';
            eventPayload.trigger_event = triggerEvent;
            eventPayload.trigger_event_name = triggerEventName;
            eventPayload.completed_date = data.completed_date || new Date().toISOString().split('T')[0];
          } else if (newStatus === 'Needs Approval' && oldStatus !== 'Needs Approval') {
            triggerEvent = 'task.approval_required';
            triggerEventName = 'Task Approval Required';
            eventPayload.trigger_event = triggerEvent;
            eventPayload.trigger_event_name = triggerEventName;
            eventPayload.approval_role = data.approval_role || '';
            eventPayload.approval_status = data.approval_status || 'Pending';
          } else if (newStatus === 'Overdue' && oldStatus !== 'Overdue') {
            triggerEvent = 'task.overdue';
            triggerEventName = 'Task Overdue';
            eventPayload.trigger_event = triggerEvent;
            eventPayload.trigger_event_name = triggerEventName;
            eventPayload.escalation_level = data.escalation_level || 0;
          }
        } else if (changedFields.includes('approval_status')) {
          const newApproval = data.approval_status;
          if (newApproval === 'Approved') {
            triggerEvent = 'task.approved';
            triggerEventName = 'Task Approved';
          } else if (newApproval === 'Rejected') {
            triggerEvent = 'task.rejected';
            triggerEventName = 'Task Rejected';
          } else {
            triggerEvent = 'task.updated';
            triggerEventName = 'Task Updated';
          }
          eventPayload = { ...baseTaskPayload,
            source_module: 'enterprise_tasks',
            source_module_name: 'Enterprise Task Center',
            trigger_event: triggerEvent,
            trigger_event_name: triggerEventName,
            changed_fields: changedFields,
            approved_by: data.approved_by || '',
            approval_status: newApproval || '',
          };
        } else if (changedFields.includes('assigned_to') || changedFields.includes('assigned_role') || changedFields.includes('assigned_to_email')) {
          triggerEvent = 'task.assigned';
          triggerEventName = 'Task Assigned';
          eventPayload = { ...baseTaskPayload,
            source_module: 'enterprise_tasks',
            source_module_name: 'Enterprise Task Center',
            trigger_event: triggerEvent,
            trigger_event_name: triggerEventName,
            changed_fields: changedFields,
          };
        } else if (changedFields.includes('escalation_level') && data.escalation_level > (oldData.escalation_level || 0)) {
          triggerEvent = 'task.escalated';
          triggerEventName = 'Task Escalated';
          eventPayload = { ...baseTaskPayload,
            source_module: 'enterprise_tasks',
            source_module_name: 'Enterprise Task Center',
            trigger_event: triggerEvent,
            trigger_event_name: triggerEventName,
            escalation_level: data.escalation_level,
            escalation_due_date: data.escalation_due_date || '',
            changed_fields: changedFields,
          };
        } else {
          // Generic update
          triggerEvent = 'task.updated';
          triggerEventName = 'Task Updated';
          eventPayload = { ...baseTaskPayload,
            source_module: 'enterprise_tasks',
            source_module_name: 'Enterprise Task Center',
            trigger_event: triggerEvent,
            trigger_event_name: triggerEventName,
            changed_fields: changedFields,
          };
        }
      }
    } else {
      // Direct event payload (manual test or other caller)
      eventPayload = body;
    }

    // ── 1. LOG EVENT RECEIVED ──
    const eventLog = await base44.asServiceRole.entities.AutomationRunLog.create({
      log_id: `LOG-${Date.now()}-EVT`,
      log_type: 'event',
      source_module: eventPayload.source_module || '',
      source_module_name: eventPayload.source_module_name || '',
      trigger_event: eventPayload.trigger_event || '',
      trigger_event_name: eventPayload.trigger_event_name || '',
      event_payload_json: JSON.stringify(eventPayload).substring(0, 50000),
      related_record_id: eventPayload.related_record_id || '',
      employee: eventPayload.employee || '',
      truck: eventPayload.truck || '',
      status: 'received',
      triggered_by: user.full_name || user.email || 'system',
    });

    // ── 2. FIND MATCHING ACTIVE RULES ──
    const rules = await base44.asServiceRole.entities.LogicRule.filter({
      rule_type: 'automation',
      is_active: true,
      source_module: eventPayload.source_module,
      trigger_event: eventPayload.trigger_event,
    }, '-priority', 100);

    // ── 3a. NO MATCH → log and return ──
    if (!rules || rules.length === 0) {
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: `LOG-${Date.now()}-NOMATCH`,
        log_type: 'rule_run',
        source_module: eventPayload.source_module || '',
        trigger_event: eventPayload.trigger_event || '',
        event_payload_json: JSON.stringify(eventPayload).substring(0, 50000),
        related_record_id: eventPayload.related_record_id || '',
        employee: eventPayload.employee || '',
        truck: eventPayload.truck || '',
        status: 'no_match',
        conditions_met: false,
        duration_ms: Date.now() - startTime,
        triggered_by: user.full_name || user.email || 'system',
      });

      await base44.asServiceRole.entities.AutomationRunLog.update(eventLog.id, {
        status: 'evaluated',
        duration_ms: Date.now() - startTime,
      });

      return Response.json({
        success: true,
        event_log_id: eventLog.id,
        rules_matched: 0,
        message: 'Event received and logged. No active rules matched this event.',
      });
    }

    // ── 3b. EVALUATE EACH MATCHING RULE ──
    const runResults = [];

    for (const rule of rules) {
      const ruleStart = Date.now();
      let conditionsMet = true;
      const conditionResults = [];
      const actionsExecuted = [];
      let errorMessage = '';
      let status = 'success';

      try {
        // Parse conditions
        let conditions = [];
        try { conditions = JSON.parse(rule.conditions_json || '[]'); } catch {}

        for (const cond of conditions) {
          if (cond.condition_type === 'event_age' || !cond.field) continue;

          const actual = eventPayload[cond.field] ?? eventPayload.payload?.[cond.field];
          const op = OPERATORS[cond.operator];
          let passed = true;

          if (op) {
            if (cond.operator.startsWith('exists') || cond.operator.startsWith('is_')) {
              passed = op(actual);
            } else {
              passed = op(actual, cond.value);
            }
          }

          conditionResults.push({
            field: cond.field,
            operator: cond.operator,
            expected: cond.value,
            actual: actual,
            passed,
          });

          if (!passed) conditionsMet = false;
        }

        // Execute actions if conditions met
        if (conditionsMet) {
          let actions = [];
          try { actions = JSON.parse(rule.actions_json || '[]'); } catch {}

          for (const action of actions) {
            try {
              const result = await executeAction(base44, action, eventPayload, user);
              actionsExecuted.push({
                action_key: action.action_key,
                status: 'success',
                result,
              });
            } catch (err) {
              actionsExecuted.push({
                action_key: action.action_key,
                status: 'failed',
                error: err.message,
              });
              status = 'failed';
              if (!errorMessage) errorMessage = err.message;
            }
          }

          if (status !== 'failed') status = 'success';
        } else {
          status = 'evaluated';
        }
      } catch (err) {
        status = 'error';
        errorMessage = err.message;
      }

      // Create the rule run log
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: `LOG-${Date.now()}-RUN-${rule.id ? rule.id.substring(0, 8) : 'UNKNOWN'}`,
        log_type: 'rule_run',
        source_module: eventPayload.source_module || '',
        trigger_event: eventPayload.trigger_event || '',
        event_payload_json: JSON.stringify(eventPayload).substring(0, 50000),
        related_record_id: eventPayload.related_record_id || '',
        employee: eventPayload.employee || '',
        truck: eventPayload.truck || '',
        rule_id: rule.id || '',
        rule_name: rule.rule_name || '',
        status,
        conditions_met: conditionsMet,
        conditions_evaluated_json: JSON.stringify(conditionResults),
        actions_executed_json: JSON.stringify(actionsExecuted),
        error_message: errorMessage,
        duration_ms: Date.now() - ruleStart,
        triggered_by: user.full_name || user.email || 'system',
      });

      runResults.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        status,
        conditions_met: conditionsMet,
        actions_count: actionsExecuted.length,
      });
    }

    // Update the event log
    await base44.asServiceRole.entities.AutomationRunLog.update(eventLog.id, {
      status: 'evaluated',
      duration_ms: Date.now() - startTime,
    });

    return Response.json({
      success: true,
      event_log_id: eventLog.id,
      rules_matched: rules.length,
      rules_evaluated: runResults,
      total_duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});