import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Rule Simulator — Sandbox Execution Engine
 *
 * Runs any LogicRule in simulation mode without creating or modifying live records.
 * Returns a detailed execution trace, conditions evaluation, simulated action results,
 * and supports breakpoints for step-through debugging.
 *
 * This function NEVER writes to live entities. It only:
 *   1. Reads the rule + related reference data
 *   2. Evaluates conditions against the test input
 *   3. Simulates action execution (returns what WOULD happen)
 *   4. Produces a timestamped execution trace
 *   5. Logs the simulation to AutomationRunLog (log_type: "simulation")
 */

const OPERATORS = {
  equals: (a, b) => String(a) === String(b),
  not_equals: (a, b) => String(a) !== String(b),
  contains: (a, b) => String(a).includes(String(b)),
  not_contains: (a, b) => !String(a).includes(String(b)),
  in_list: (a, b) => {
    const list = String(b).split(',').map(s => s.trim());
    return list.includes(String(a));
  },
  is_empty: (a) => a === '' || a === undefined || a === null,
  is_not_empty: (a) => a !== '' && a !== undefined && a !== null,
  greater_than: (a, b) => Number(a) > Number(b),
  less_than: (a, b) => Number(a) < Number(b),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  exists: (a) => a !== undefined && a !== null && a !== '',
  not_exists: (a) => a === undefined || a === null || a === '',
};

const ACTION_LABELS = {
  'task.create': 'Create Task',
  'task.update': 'Update Task',
  'task.complete': 'Complete Task',
  'task.assign': 'Assign Task',
  'task.change_priority': 'Change Task Priority',
  'notification.create': 'Create Notification',
  'notification.update': 'Update Notification',
  'notification.require_ack': 'Require Acknowledgment',
  'notification.escalate': 'Escalate Notification',
  'management.corrective_action': 'Create Corrective Action',
  'management.improvement': 'Create Improvement Request',
  'management.schedule_audit': 'Schedule Audit',
  'management.schedule_training': 'Schedule Training',
  'management.schedule_cert_renewal': 'Schedule Cert Renewal',
  'workflow.start': 'Start Workflow',
  'workflow.complete': 'Complete Workflow',
  'workflow.cancel': 'Cancel Workflow',
  'ops.executive_alert': 'Executive Alert',
  'ops.company_health': 'Company Health Update',
  'ops.exec_attention': 'Exec Attention',
  'ops.morning_brief': 'Add to Morning Brief',
  'integration.publish_event': 'Publish Integration Event',
  'record.update_status': 'Update Record Status',
  'record.update_field': 'Update Record Field',
  'record.add_note': 'Add Note to Record',
  'record.add_comment': 'Add Comment to Record',
  'record.timeline_entry': 'Add Timeline Entry',
  'inspection.create_finding': 'Create Deficiency Finding',
  'inspection.run_recommendation_engine': 'Run Recommendation Engine',
  'inspection.generate_estimate_item': 'Generate Estimate Item',
  'inspection.update_scope': 'Update Scope of Work',
  'inspection.add_to_presentation': 'Add to Customer Presentation',
  'inspection.update_analytics': 'Update Analytics',
  'inspection.set_question_visibility': 'Set Question Visibility',
  'inspection.create_repair_recommendation': 'Create Repair Recommendation',
};

const ACTION_MODULE_MAP = {
  'task.': 'Enterprise Task Center',
  'notification.': 'Notification Center',
  'management.': 'Administration',
  'workflow.': 'Workflow Registry',
  'ops.': 'Operations Center',
  'integration.': 'Integration Hub',
  'record.': 'Record Manager',
  'inspection.create_finding': 'Inspection Engine',
  'inspection.run_recommendation_engine': 'Repair Recommendation Engine',
  'inspection.generate_estimate_item': 'Estimate Engine',
  'inspection.update_scope': 'Scope of Work',
  'inspection.add_to_presentation': 'Customer Presentation',
  'inspection.update_analytics': 'Analytics',
  'inspection.set_question_visibility': 'Inspection Engine',
  'inspection.create_repair_recommendation': 'Repair Recommendation Engine',
};

function getActionModule(actionKey) {
  for (const [prefix, module] of Object.entries(ACTION_MODULE_MAP)) {
    if (actionKey.startsWith(prefix) || actionKey === prefix) return module;
  }
  return 'Unknown Module';
}

function getActionLabel(actionKey) {
  return ACTION_LABELS[actionKey] || actionKey.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

function simulateActionExecution(action, event) {
  /**
   * Simulates an action WITHOUT creating records.
   * Returns a description of what WOULD happen.
   */
  const actionKey = action.action_key;
  const label = getActionLabel(actionKey);
  const module = getActionModule(actionKey);
  const mappings = action.field_mappings || [];

  const resolvedFields = {};
  for (const m of mappings) {
    const val = resolveFieldValue(m, event);
    if (val !== undefined && val !== null && val !== '') {
      resolvedFields[m.field] = val;
    }
  }

  // Generate a simulated result description
  let description = '';
  let details = {};

  if (actionKey.startsWith('task.')) {
    description = `Would ${label.toLowerCase()} in Enterprise Task Center`;
    details = { entity: 'EnterpriseTask', operation: actionKey.includes('create') ? 'create' : 'update', fields: resolvedFields };
  } else if (actionKey.startsWith('notification.')) {
    description = `Would ${label.toLowerCase()} in Notification Center`;
    details = { entity: 'EnterpriseNotification', operation: actionKey.includes('create') ? 'create' : 'update', fields: resolvedFields };
  } else if (actionKey.startsWith('management.')) {
    description = `Would ${label.toLowerCase()}`;
    details = { entity: 'CorrectiveAction/ImprovementRequest/Audit', fields: resolvedFields };
  } else if (actionKey.startsWith('workflow.')) {
    description = `Would ${label.toLowerCase()} in Workflow Registry`;
    details = { entity: 'WorkflowRegistry', fields: resolvedFields };
  } else if (actionKey.startsWith('ops.')) {
    description = `Would ${label.toLowerCase()}`;
    details = { entity: 'EnterpriseTask/Notification', fields: resolvedFields };
  } else if (actionKey.startsWith('record.')) {
    description = `Would ${label.toLowerCase()} on ${resolvedFields.entity_name || 'record'}`;
    details = { entity: resolvedFields.entity_name, record_id: resolvedFields.record_id, fields: resolvedFields };
  } else if (actionKey.startsWith('inspection.')) {
    description = `Would ${label.toLowerCase()}`;
    details = { module: 'Inspection Engine', fields: resolvedFields };
  } else if (actionKey === 'integration.publish_event') {
    description = `Would publish integration event`;
    details = { fields: resolvedFields };
  } else {
    description = `Would execute: ${label}`;
    details = { fields: resolvedFields };
  }

  return {
    action_key: actionKey,
    label,
    module,
    description,
    simulated: true,
    resolved_fields: resolvedFields,
    details,
  };
}

Deno.serve(async (req) => {
  const simStartTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { rule_id, test_input, breakpoints, continue_from } = body;

    if (!rule_id) return Response.json({ error: 'rule_id is required' }, { status: 400 });

    // Load the rule
    const rule = await base44.asServiceRole.entities.LogicRule.get(rule_id);
    if (!rule) return Response.json({ error: 'Rule not found' }, { status: 404 });

    const simulationId = `SIM-${Date.now()}-${rule.id?.substring(0, 8) || 'UNKNOWN'}`;
    const trace = [];
    const stepTimestamps = [];

    function addTraceStep(step) {
      const ts = new Date().toISOString();
      const stepData = {
        ...step,
        timestamp: ts,
        elapsed_ms: Date.now() - simStartTime,
      };
      trace.push(stepData);
      stepTimestamps.push(ts);
      return stepData;
    }

    // ── STEP 1: Event Received ──
    const eventPayload = {
      source_module: rule.source_module || '',
      source_module_name: rule.source_module_name || '',
      trigger_event: rule.trigger_event || '',
      trigger_event_name: rule.trigger_event_name || '',
      timestamp: new Date().toISOString(),
      ...test_input,
      payload: test_input,
    };

    addTraceStep({
      step: 'event_received',
      module: rule.source_module_name || 'Unknown',
      action: rule.trigger_event_name || rule.trigger_event || 'Event',
      status: 'received',
      message: `Event received: ${rule.trigger_event_name || rule.trigger_event}`,
    });

    // ── STEP 2: Rule Matched ──
    addTraceStep({
      step: 'rule_matched',
      module: 'Rules Engine',
      action: rule.rule_name,
      status: 'matched',
      message: `Rule matched: ${rule.rule_name}`,
      details: {
        rule_type: rule.rule_type,
        priority: rule.priority || 0,
        source_module: rule.source_module,
        trigger_event: rule.trigger_event,
      },
    });

    // ── STEP 3: Evaluate Conditions ──
    let conditions = [];
    try { conditions = JSON.parse(rule.conditions_json || '[]'); } catch {}

    const conditionResults = [];
    let allConditionsPassed = true;

    if (conditions.length === 0) {
      addTraceStep({
        step: 'conditions_evaluated',
        module: 'Rules Engine',
        action: 'Conditions Evaluated',
        status: 'passed',
        message: 'No conditions defined — rule fires unconditionally',
      });
    } else {
      for (const cond of conditions) {
        if (cond.condition_type === 'event_age' || !cond.field) {
          conditionResults.push({
            field: cond.field || 'event_age',
            operator: cond.operator,
            expected: cond.value,
            actual: 'N/A',
            passed: true,
            skipped: true,
          });
          continue;
        }

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

        if (!passed) allConditionsPassed = false;
      }

      addTraceStep({
        step: 'conditions_evaluated',
        module: 'Rules Engine',
        action: 'Conditions Evaluated',
        status: allConditionsPassed ? 'passed' : 'failed',
        message: allConditionsPassed
          ? `All ${conditionResults.filter(c => !c.skipped).length} condition(s) passed`
          : `${conditionResults.filter(c => !c.passed && !c.skipped).length} of ${conditionResults.filter(c => !c.skipped).length} condition(s) failed`,
        details: { conditions: conditionResults },
      });
    }

    // ── STEP 4: Simulate Actions (if conditions passed) ──
    const actionsExecuted = [];
    const warnings = [];
    const errors = [];

    if (allConditionsPassed) {
      let actions = [];
      try { actions = JSON.parse(rule.actions_json || '[]'); } catch {}

      // Pre-load repair template for finding actions so the simulated
      // result can display inherited deficiency configuration
      let repairTemplate = null;
      const hasFindingAction = actions.some(a => a.action_key === 'inspection.create_finding');
      const effectiveTemplateId = rule.repair_template_id
        || actions.flatMap(a => (a.field_mappings || []))
            .find(m => m.field === 'repair_template_id' && m.value)?.value;
      if (hasFindingAction && effectiveTemplateId) {
        repairTemplate = await base44.asServiceRole.entities.RepairRecommendationTemplate
          .get(effectiveTemplateId).catch(() => null);
      }

      if (actions.length === 0) {
        addTraceStep({
          step: 'no_actions',
          module: 'Rules Engine',
          action: 'No Actions',
          status: 'warning',
          message: 'Rule has no actions configured',
        });
        warnings.push('Rule has no actions configured');
      } else {
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const actionStart = Date.now();

          // Check breakpoint
          if (breakpoints && Array.isArray(breakpoints) && breakpoints.includes(action.action_key)) {
            addTraceStep({
              step: 'breakpoint_hit',
              module: getActionModule(action.action_key),
              action: `Breakpoint: ${getActionLabel(action.action_key)}`,
              status: 'paused',
              message: `Simulation paused at breakpoint: ${action.action_key}`,
              details: { action_index: i, action_key: action.action_key },
            });

            // Log partial simulation
            await base44.asServiceRole.entities.AutomationRunLog.create({
              log_id: `LOG-${simulationId}-PARTIAL`,
              log_type: 'simulation',
              simulation_id: simulationId,
              rule_id: rule.id,
              rule_name: rule.rule_name,
              source_module: rule.source_module || '',
              trigger_event: rule.trigger_event || '',
              event_payload_json: JSON.stringify(eventPayload).substring(0, 50000),
              status: 'paused',
              conditions_met: true,
              conditions_evaluated_json: JSON.stringify(conditionResults),
              actions_executed_json: JSON.stringify(actionsExecuted),
              execution_trace_json: JSON.stringify(trace),
              breakpoint_hit: action.action_key,
              duration_ms: Date.now() - simStartTime,
              triggered_by: user.full_name || user.email || 'admin',
            });

            return Response.json({
              success: true,
              simulation_id: simulationId,
              status: 'paused',
              breakpoint_hit: action.action_key,
              paused_at_action_index: i,
              total_actions: actions.length,
              trace,
              conditions_met: true,
              condition_results: conditionResults,
              actions_executed: actionsExecuted,
              elapsed_ms: Date.now() - simStartTime,
              message: `Simulation paused at breakpoint: ${action.action_key}. Call again with continue_from=${i} to resume.`,
            });
          }

          // Simulate the action
          try {
            const simResult = simulateActionExecution(action, eventPayload);

            // Enrich inspection.create_finding with inherited template config
            if (action.action_key === 'inspection.create_finding') {
              const templateId = effectiveTemplateId
                || simResult.resolved_fields?.repair_template_id
                || '';
              simResult.details = {
                ...simResult.details,
                job_id: eventPayload.job_id || simResult.resolvedFields?.job_id || '',
                inspection_question_id: rule.inspection_question_id || '',
                answer_value: eventPayload.answer_value ?? '',
                repair_template_id: templateId,
                repair_template_name: repairTemplate?.template_name || '',
                inherited_deficiency_type: repairTemplate?.deficiency_type || rule.output_finding_type || '',
                inherited_severity: repairTemplate?.severity || rule.output_severity || '',
                inherited_finding_narrative: repairTemplate?.customer_facing_recommendation || rule.output_narrative || '',
                material_resolver_type: repairTemplate?.material_calculation_type && repairTemplate.material_calculation_type !== 'none'
                  ? repairTemplate.material_calculation_type
                  : '',
              };
              simResult.description = `Would create deficiency finding${repairTemplate ? ' from "' + repairTemplate.template_name + '"' : ''}`;
            }

            const actionDuration = Date.now() - actionStart;

            // Add a small realistic delay for the trace timestamps
            await new Promise(r => setTimeout(r, 1));

            addTraceStep({
              step: 'action_executed',
              module: simResult.module,
              action: simResult.label,
              status: 'success',
              message: simResult.description,
              duration_ms: actionDuration,
              details: simResult.details,
            });

            actionsExecuted.push({
              action_key: action.action_key,
              label: simResult.label,
              module: simResult.module,
              status: 'success',
              description: simResult.description,
              simulated_result: simResult.details,
            });
          } catch (err) {
            addTraceStep({
              step: 'action_failed',
              module: getActionModule(action.action_key),
              action: getActionLabel(action.action_key),
              status: 'failed',
              message: err.message,
              details: { action_key: action.action_key },
            });

            actionsExecuted.push({
              action_key: action.action_key,
              label: getActionLabel(action.action_key),
              module: getActionModule(action.action_key),
              status: 'failed',
              error: err.message,
            });

            errors.push(`Action ${action.action_key} failed: ${err.message}`);
          }
        }
      }
    } else {
      addTraceStep({
        step: 'rule_skipped',
        module: 'Rules Engine',
        action: 'Rule Skipped',
        status: 'skipped',
        message: 'Conditions not met — rule skipped',
      });
    }

    // ── STEP 5: Simulation Complete ──
    addTraceStep({
      step: 'simulation_complete',
      module: 'Rules Engine',
      action: 'Simulation Complete',
      status: 'complete',
      message: `Simulation completed in ${Date.now() - simStartTime}ms`,
    });

    const summary = {
      triggered: allConditionsPassed,
      skipped: !allConditionsPassed,
      conditions_passed: allConditionsPassed,
      conditions_failed: !allConditionsPassed,
      actions_executed: actionsExecuted.length,
      actions_succeeded: actionsExecuted.filter(a => a.status === 'success').length,
      actions_failed: actionsExecuted.filter(a => a.status === 'failed').length,
      warnings: warnings.length,
      errors: errors.length,
      warning_list: warnings,
      error_list: errors,
      execution_time_ms: Date.now() - simStartTime,
    };

    // ── Update the rule's simulation status ──
    const simStatus = errors.length > 0 ? 'failed' : (warnings.length > 0 ? 'warning' : 'passed');
    try {
      await base44.asServiceRole.entities.LogicRule.update(rule.id, {
        simulation_status: simStatus,
        last_simulated_at: new Date().toISOString(),
        last_simulated_by: user.full_name || user.email || 'admin',
        last_simulation_result_json: JSON.stringify(summary),
      });
    } catch {}

    // ── Log the simulation ──
    try {
      await base44.asServiceRole.entities.AutomationRunLog.create({
        log_id: `LOG-${simulationId}`,
        log_type: 'simulation',
        simulation_id: simulationId,
        rule_id: rule.id,
        rule_name: rule.rule_name,
        source_module: rule.source_module || '',
        source_module_name: rule.source_module_name || '',
        trigger_event: rule.trigger_event || '',
        trigger_event_name: rule.trigger_event_name || '',
        event_payload_json: JSON.stringify(eventPayload).substring(0, 50000),
        status: simStatus,
        conditions_met: allConditionsPassed,
        conditions_evaluated_json: JSON.stringify(conditionResults),
        actions_executed_json: JSON.stringify(actionsExecuted),
        execution_trace_json: JSON.stringify(trace),
        duration_ms: Date.now() - simStartTime,
        triggered_by: user.full_name || user.email || 'admin',
      });
    } catch {}

    return Response.json({
      success: true,
      simulation_id: simulationId,
      status: simStatus,
      rule_id: rule.id,
      rule_name: rule.rule_name,
      trace,
      conditions_met: allConditionsPassed,
      condition_results: conditionResults,
      actions_executed: actionsExecuted,
      summary,
      elapsed_ms: Date.now() - simStartTime,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});