/**
 * Module Event Registry — Master Aggregator
 *
 * Master registry of all events published by LVC OS modules.
 * Each module publishes events; the Rules Engine subscribes to them.
 *
 * Modules are organized into operational categories that mirror the
 * LVC OS workflow: Technician Workflow → Operations → Business Systems → Administration.
 *
 * Future-proofing: To add a new module, append it to the appropriate
 * category file. The Rules Engine UI automatically picks it up.
 */

import { COMMON_FIELDS, JOB_FIELDS } from '@/lib/moduleFields';
import { TECHNICIAN_WORKFLOW_MODULES } from '@/lib/modules/technicianWorkflowModules';
import { OPERATIONS_MODULES } from '@/lib/modules/operationsModules';

// Re-export shared fields for backwards compatibility
export { COMMON_FIELDS, JOB_FIELDS };

// ─────────────────────────────────────────────
// MODULE CATEGORIES — controls display order and grouping
// ─────────────────────────────────────────────
export const MODULE_CATEGORIES = [
  { key: 'technician_workflow', label: 'Technician Workflow', icon: 'HardHat', color: 'bg-blue-100 text-blue-700' },
  { key: 'operations', label: 'Operations', icon: 'Settings', color: 'bg-amber-100 text-amber-700' },
  { key: 'business_systems', label: 'Business Systems', icon: 'Cpu', color: 'bg-purple-100 text-purple-700' },
  { key: 'administration', label: 'Administration', icon: 'Building', color: 'bg-slate-100 text-slate-700' },
  { key: 'enterprise', label: 'Enterprise Systems', icon: 'Layers', color: 'bg-indigo-100 text-indigo-700' },
];

// ─────────────────────────────────────────────
// BUSINESS SYSTEMS MODULES
// ─────────────────────────────────────────────
const BUSINESS_SYSTEMS_MODULES = [
  {
    module: 'Repair Recommendation Engine',
    moduleKey: 'repair_recommendation_engine',
    category: 'business_systems',
    icon: 'Wrench',
    color: 'bg-orange-100 text-orange-700',
    events: [
      {
        event: 'Deficiency Created',
        eventKey: 'repair_engine.deficiency_created',
        description: 'SUBSCRIBED EVENT: Automatically fires when a new deficiency finding is created. The Repair Recommendation Engine detects this and runs the full downstream pipeline — no inspection rule needs to trigger it manually.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'finding_id', label: 'Finding ID', type: 'string' },
          { key: 'deficiency_type', label: 'Deficiency Type', type: 'string' },
          { key: 'severity', label: 'Severity', type: 'string' },
          { key: 'repair_system', label: 'Repair System', type: 'string' },
          { key: 'question_id', label: 'Source Question ID', type: 'string' },
          { key: 'is_critical', label: 'Is Critical', type: 'boolean' },
        ],
      },
      {
        event: 'Recommendation Generated',
        eventKey: 'repair_engine.generated',
        description: 'Fired when the Repair Recommendation Engine generates a recommendation from findings.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'finding_id', label: 'Source Finding ID', type: 'string' },
          { key: 'deficiency_type', label: 'Deficiency Type', type: 'string' },
          { key: 'repair_system', label: 'Repair System', type: 'string' },
          { key: 'template_id', label: 'Template ID', type: 'string' },
        ],
      },
      {
        event: 'Template Matched',
        eventKey: 'repair_engine.template_matched',
        description: 'Fired when a recommendation template is matched to a finding.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'template_id', label: 'Template ID', type: 'string' },
          { key: 'finding_id', label: 'Finding ID', type: 'string' },
          { key: 'match_confidence', label: 'Match Confidence', type: 'number' },
        ],
      },
      {
        event: 'System Recommendations Generated',
        eventKey: 'repair_engine.system_generated',
        description: 'Fired when repair system recommendations are generated for a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'repair_system', label: 'Repair System', type: 'string' },
          { key: 'recommendation_count', label: 'Recommendation Count', type: 'number' },
        ],
      },
    ],
  },
  {
    module: 'Dynamic Price Builder',
    moduleKey: 'dynamic_price_builder',
    category: 'business_systems',
    icon: 'DollarSign',
    color: 'bg-green-100 text-green-700',
    events: [
      {
        event: 'Price Calculated',
        eventKey: 'price.calculated',
        description: 'Fired when a dynamic price is calculated for a service or package.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' }, { key: 'calculated_price', label: 'Calculated Price', type: 'number' }, { key: 'internal_cost', label: 'Internal Cost', type: 'number' }, { key: 'gross_margin', label: 'Gross Margin %', type: 'number' }],
      },
      {
        event: 'Price Updated',
        eventKey: 'price.updated',
        description: 'Fired when a dynamic price is updated.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'old_price', label: 'Old Price', type: 'number' }, { key: 'new_price', label: 'New Price', type: 'number' }],
      },
      {
        event: 'Margin Calculated',
        eventKey: 'price.margin_calculated',
        description: 'Fired when gross margin is calculated for a package.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'package_id', label: 'Package ID', type: 'string' }, { key: 'subtotal', label: 'Subtotal', type: 'number' }, { key: 'selling_price', label: 'Selling Price', type: 'number' }, { key: 'gross_profit', label: 'Gross Profit', type: 'number' }, { key: 'gross_margin', label: 'Gross Margin %', type: 'number' }],
      },
    ],
  },
  {
    module: 'Material Calculator',
    moduleKey: 'material_calculator',
    category: 'business_systems',
    icon: 'Calculator',
    color: 'bg-amber-100 text-amber-700',
    events: [
      {
        event: 'Materials Calculated',
        eventKey: 'material_calc.calculated',
        description: 'Fired when required materials are calculated for a service or repair.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' }, { key: 'material_count', label: 'Material Count', type: 'number' }, { key: 'total_cost', label: 'Total Material Cost', type: 'number' }],
      },
      {
        event: 'Material List Generated',
        eventKey: 'material_calc.list_generated',
        description: 'Fired when a material list is generated for a job.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'material_list_id', label: 'Material List ID', type: 'string' }, { key: 'item_count', label: 'Item Count', type: 'number' }],
      },
    ],
  },
  {
    module: 'Service Configuration Engine',
    moduleKey: 'service_configuration_engine',
    category: 'business_systems',
    icon: 'Settings2',
    color: 'bg-cyan-100 text-cyan-700',
    events: [
      {
        event: 'Service Configured',
        eventKey: 'service_config.configured',
        description: 'Fired when a service is configured for an estimate item.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' }, { key: 'estimate_item_id', label: 'Estimate Item ID', type: 'string' }, { key: 'pricing_type', label: 'Pricing Type', type: 'string' }, { key: 'selling_price', label: 'Selling Price', type: 'number' }],
      },
      {
        event: 'Configuration Updated',
        eventKey: 'service_config.updated',
        description: 'Fired when a service configuration is updated.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' }, { key: 'changed_fields', label: 'Changed Fields', type: 'array' }],
      },
    ],
  },
  {
    module: 'Good / Better / Best Engine',
    moduleKey: 'gbb_engine',
    category: 'business_systems',
    icon: 'Layers3',
    color: 'bg-violet-100 text-violet-700',
    events: [
      {
        event: 'Options Generated',
        eventKey: 'gbb.options_generated',
        description: 'Fired when Good/Better/Best options are generated for a job.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'good_price', label: 'Good Price', type: 'number' }, { key: 'better_price', label: 'Better Price', type: 'number' }, { key: 'best_price', label: 'Best Price', type: 'number' }, { key: 'option_count', label: 'Option Count', type: 'number' }],
      },
      {
        event: 'Options Updated',
        eventKey: 'gbb.options_updated',
        description: 'Fired when Good/Better/Best options are modified.',
        fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'changed_option', label: 'Changed Option', type: 'string' }],
      },
      {
        event: 'Tier Assigned',
        eventKey: 'gbb.tier_assigned',
        description: 'Fired when a proposal tier is assigned to a service.',
        fields: [...COMMON_FIELDS, { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' }, { key: 'tier', label: 'Tier', type: 'string' }],
      },
    ],
  },
  {
    module: 'Resource Readiness Engine',
    moduleKey: 'resource_readiness_engine',
    category: 'business_systems',
    icon: 'Gauge',
    color: 'bg-slate-100 text-slate-700',
    reserved: true,
    events: [],
  },
  {
    module: 'AI Recommendation Engine',
    moduleKey: 'ai_recommendation_engine',
    category: 'business_systems',
    icon: 'Cpu',
    color: 'bg-purple-100 text-purple-700',
    reserved: true,
    events: [],
  },
];

// ─────────────────────────────────────────────
// ADMINISTRATION MODULES
// ─────────────────────────────────────────────
const ADMINISTRATION_MODULES = [
  {
    module: 'HR',
    moduleKey: 'hr',
    category: 'administration',
    icon: 'Users',
    color: 'bg-cyan-100 text-cyan-700',
    events: [
      { event: 'Employee Created', eventKey: 'hr.employee_created', description: 'Fired when a new employee record is created.', fields: [...COMMON_FIELDS, { key: 'employee_id', label: 'Employee ID', type: 'string' }, { key: 'primary_role', label: 'Primary Role', type: 'string' }, { key: 'employment_type', label: 'Employment Type', type: 'string' }] },
      { event: 'Employee Updated', eventKey: 'hr.employee_updated', description: 'Fired when an employee record is updated.', fields: [...COMMON_FIELDS, { key: 'employee_id', label: 'Employee ID', type: 'string' }, { key: 'changed_fields', label: 'Changed Fields', type: 'array' }] },
      { event: 'Role Changed', eventKey: 'hr.role_changed', description: 'Fired when an employee\'s primary role is changed.', fields: [...COMMON_FIELDS, { key: 'employee_id', label: 'Employee ID', type: 'string' }, { key: 'old_role', label: 'Old Role', type: 'string' }, { key: 'new_role', label: 'New Role', type: 'string' }] },
      { event: 'Employment Status Changed', eventKey: 'hr.status_changed', description: 'Fired when an employee\'s employment status changes.', fields: [...COMMON_FIELDS, { key: 'employee_id', label: 'Employee ID', type: 'string' }, { key: 'old_status', label: 'Old Status', type: 'string' }, { key: 'new_status', label: 'New Status', type: 'string' }] },
    ],
  },
  {
    module: 'Safety',
    moduleKey: 'safety',
    category: 'administration',
    icon: 'ShieldAlert',
    color: 'bg-red-100 text-red-700',
    events: [
      { event: 'Safety Incident Reported', eventKey: 'safety.incident_reported', description: 'Fired when a safety incident is reported.', fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'incident_type', label: 'Incident Type', type: 'string' }, { key: 'severity', label: 'Severity', type: 'string' }] },
      { event: 'Safety Checklist Completed', eventKey: 'safety.checklist_completed', description: 'Fired when a safety checklist is completed.', fields: [...COMMON_FIELDS, ...JOB_FIELDS, { key: 'checklist_id', label: 'Checklist ID', type: 'string' }, { key: 'passed', label: 'Passed', type: 'boolean' }] },
      { event: 'Policy Acknowledgment Due', eventKey: 'safety.policy_ack_due', description: 'Fired when a safety policy acknowledgment is due.', fields: [...COMMON_FIELDS, { key: 'policy_id', label: 'Policy ID', type: 'string' }] },
    ],
  },
  {
    module: 'Operations',
    moduleKey: 'operations_center',
    category: 'administration',
    icon: 'Settings',
    color: 'bg-amber-100 text-amber-700',
    events: [
      { event: 'Morning Brief Generated', eventKey: 'operations.morning_brief', description: 'Fired when the daily morning brief is generated.', fields: [...COMMON_FIELDS, { key: 'brief_date', label: 'Brief Date', type: 'date' }, { key: 'job_count', label: 'Job Count', type: 'number' }] },
      { event: 'Operational Alert Created', eventKey: 'operations.alert', description: 'Fired when an operational alert is created.', fields: [...COMMON_FIELDS, { key: 'alert_type', label: 'Alert Type', type: 'string' }, { key: 'severity', label: 'Severity', type: 'string' }] },
    ],
  },
  {
    module: 'Analytics',
    moduleKey: 'analytics',
    category: 'administration',
    icon: 'BarChart3',
    color: 'bg-purple-100 text-purple-700',
    events: [
      { event: 'Metric Updated', eventKey: 'analytics.metric_updated', description: 'Fired when an analytics metric is recalculated.', fields: [...COMMON_FIELDS, { key: 'metric_name', label: 'Metric Name', type: 'string' }, { key: 'metric_value', label: 'Metric Value', type: 'number' }, { key: 'previous_value', label: 'Previous Value', type: 'number' }] },
      { event: 'KPI Threshold Met', eventKey: 'analytics.kpi_threshold', description: 'Fired when a KPI reaches a defined threshold.', fields: [...COMMON_FIELDS, { key: 'kpi_name', label: 'KPI Name', type: 'string' }, { key: 'kpi_value', label: 'KPI Value', type: 'number' }, { key: 'threshold', label: 'Threshold', type: 'number' }, { key: 'direction', label: 'Direction', type: 'string' }] },
      { event: 'Report Generated', eventKey: 'analytics.report_generated', description: 'Fired when an analytics report is generated.', fields: [...COMMON_FIELDS, { key: 'report_type', label: 'Report Type', type: 'string' }, { key: 'date_range', label: 'Date Range', type: 'string' }] },
    ],
  },
  {
    module: 'Continuous Improvement',
    moduleKey: 'ci',
    category: 'administration',
    icon: 'Lightbulb',
    color: 'bg-yellow-100 text-yellow-700',
    events: [
      { event: 'Improvement Submitted', eventKey: 'ci.submitted', description: 'Fired when an employee submits an improvement idea.', fields: [...COMMON_FIELDS, { key: 'improvement_id', label: 'Improvement ID', type: 'string' }, { key: 'category', label: 'Category', type: 'string' }] },
      { event: 'Improvement Approved', eventKey: 'ci.approved', description: 'Fired when an improvement request is approved by the review board.', fields: [...COMMON_FIELDS, { key: 'improvement_id', label: 'Improvement ID', type: 'string' }] },
      { event: 'Improvement Implemented', eventKey: 'ci.implemented', description: 'Fired when an approved improvement is fully implemented.', fields: [...COMMON_FIELDS, { key: 'improvement_id', label: 'Improvement ID', type: 'string' }] },
    ],
  },
  {
    module: 'Executive Dashboard',
    moduleKey: 'executive_dashboard',
    category: 'administration',
    icon: 'LayoutDashboard',
    color: 'bg-slate-100 text-slate-700',
    events: [
      { event: 'Executive Alert Created', eventKey: 'executive.alert_created', description: 'Fired when an executive-level alert is created.', fields: [...COMMON_FIELDS, { key: 'alert_title', label: 'Alert Title', type: 'string' }, { key: 'priority', label: 'Priority', type: 'string' }] },
      { event: 'Company Health Updated', eventKey: 'executive.health_updated', description: 'Fired when the company health score is recalculated.', fields: [...COMMON_FIELDS, { key: 'health_score', label: 'Health Score', type: 'number' }, { key: 'previous_score', label: 'Previous Score', type: 'number' }] },
    ],
  },
];

// ─────────────────────────────────────────────
// ENTERPRISE SYSTEMS MODULES (existing)
// ─────────────────────────────────────────────
const ENTERPRISE_MODULES = [
  {
    module: 'WH-105 Morning Readiness',
    moduleKey: 'wh105',
    category: 'enterprise',
    icon: 'Sun',
    color: 'bg-amber-100 text-amber-700',
    events: [
      { event: 'Morning Readiness Started', eventKey: 'wh105.started', description: 'Fired when a technician begins the morning readiness check.', fields: [...COMMON_FIELDS, { key: 'completion_percentage', label: 'Completion Percentage', type: 'number' }, { key: 'job_number', label: 'Job Number', type: 'string' }] },
      { event: 'Morning Readiness Completed', eventKey: 'wh105.completed', description: 'Fired when all readiness checks pass and the truck is ready to depart.', fields: [...COMMON_FIELDS, { key: 'completion_percentage', label: 'Completion Percentage', type: 'number' }, { key: 'departure_timestamp', label: 'Departure Timestamp', type: 'datetime' }] },
      { event: 'Morning Readiness Blocked', eventKey: 'wh105.blocked', description: 'Fired when one or more readiness checks are blocked.', fields: [...COMMON_FIELDS, { key: 'blocking_reason', label: 'Blocking Reason', type: 'string' }, { key: 'completion_percentage', label: 'Completion Percentage', type: 'number' }] },
      { event: 'Truck Ready', eventKey: 'wh105.truck_ready', description: 'Fired when a truck reaches 100% readiness.', fields: [...COMMON_FIELDS, { key: 'readiness_percentage', label: 'Readiness Percentage', type: 'number' }] },
      { event: 'Truck Not Ready', eventKey: 'wh105.truck_not_ready', description: 'Fired when a truck fails to reach readiness.', fields: [...COMMON_FIELDS, { key: 'readiness_percentage', label: 'Readiness Percentage', type: 'number' }, { key: 'blocking_reason', label: 'Blocking Reason', type: 'string' }] },
    ],
  },
  {
    module: 'Enterprise Task Center',
    moduleKey: 'enterprise_tasks',
    category: 'enterprise',
    icon: 'ListChecks',
    color: 'bg-blue-100 text-blue-700',
    events: [
      { event: 'Task Created', eventKey: 'task.created', description: 'Fired when a new enterprise task is created.', fields: [...COMMON_FIELDS, { key: 'task_id', label: 'Task ID', type: 'string' }, { key: 'title', label: 'Title', type: 'string' }, { key: 'priority', label: 'Priority', type: 'string' }] },
      { event: 'Task Completed', eventKey: 'task.completed', description: 'Fired when a task is marked as completed.', fields: [...COMMON_FIELDS, { key: 'task_id', label: 'Task ID', type: 'string' }] },
      { event: 'Task Overdue', eventKey: 'task.overdue', description: 'Fired when a task passes its due date.', fields: [...COMMON_FIELDS, { key: 'task_id', label: 'Task ID', type: 'string' }, { key: 'priority', label: 'Priority', type: 'string' }] },
      { event: 'Task Escalated', eventKey: 'task.escalated', description: 'Fired when a task escalation level is increased.', fields: [...COMMON_FIELDS, { key: 'task_id', label: 'Task ID', type: 'string' }, { key: 'escalation_level', label: 'Escalation Level', type: 'number' }] },
    ],
  },
  {
    module: 'Enterprise Notification Center',
    moduleKey: 'notifications',
    category: 'enterprise',
    icon: 'Bell',
    color: 'bg-purple-100 text-purple-700',
    events: [
      { event: 'Notification Created', eventKey: 'notification.created', description: 'Fired when a new notification is created.', fields: [...COMMON_FIELDS, { key: 'notification_type', label: 'Notification Type', type: 'string' }, { key: 'priority', label: 'Priority', type: 'string' }] },
      { event: 'Notification Sent', eventKey: 'notification.sent', description: 'Fired when a notification is sent to recipients.', fields: [...COMMON_FIELDS, { key: 'delivery_methods', label: 'Delivery Methods', type: 'array' }] },
      { event: 'Escalation Triggered', eventKey: 'notification.escalation', description: 'Fired when a notification escalation level is increased.', fields: [...COMMON_FIELDS, { key: 'escalation_level', label: 'Escalation Level', type: 'number' }] },
    ],
  },
  {
    module: 'Equipment Management',
    moduleKey: 'equipment',
    category: 'enterprise',
    icon: 'Package',
    color: 'bg-orange-100 text-orange-700',
    events: [
      { event: 'Equipment Assigned', eventKey: 'equipment.assigned', description: 'Fired when equipment is assigned to a technician.', fields: [...COMMON_FIELDS, { key: 'equipment_id', label: 'Equipment ID', type: 'string' }, { key: 'item_name', label: 'Item Name', type: 'string' }] },
      { event: 'Equipment Damaged', eventKey: 'equipment.damaged', description: 'Fired when equipment is reported as damaged.', fields: [...COMMON_FIELDS, { key: 'equipment_id', label: 'Equipment ID', type: 'string' }, { key: 'condition', label: 'Condition', type: 'string' }] },
      { event: 'Equipment Returned', eventKey: 'equipment.returned', description: 'Fired when temporary equipment is returned.', fields: [...COMMON_FIELDS, { key: 'equipment_id', label: 'Equipment ID', type: 'string' }, { key: 'return_condition', label: 'Return Condition', type: 'string' }] },
    ],
  },
  {
    module: 'ServiceTitan Integration Hub',
    moduleKey: 'servicetitan',
    category: 'enterprise',
    icon: 'Plug',
    color: 'bg-violet-100 text-violet-700',
    events: [
      { event: 'Webhook Received', eventKey: 'st.webhook_received', description: 'Fired when a ServiceTitan webhook is received.', fields: [...COMMON_FIELDS, { key: 'event_type', label: 'Event Type', type: 'string' }, { key: 'st_record_id', label: 'ST Record ID', type: 'string' }] },
      { event: 'Sync Succeeded', eventKey: 'st.sync_succeeded', description: 'Fired when a ServiceTitan sync completes successfully.', fields: [...COMMON_FIELDS, { key: 'sync_type', label: 'Sync Type', type: 'string' }] },
      { event: 'Sync Failed', eventKey: 'st.sync_failed', description: 'Fired when a ServiceTitan sync fails.', fields: [...COMMON_FIELDS, { key: 'sync_type', label: 'Sync Type', type: 'string' }, { key: 'error_message', label: 'Error Message', type: 'string' }] },
    ],
  },
  {
    module: 'Management Audits',
    moduleKey: 'audits',
    category: 'enterprise',
    icon: 'ClipboardCheck',
    color: 'bg-slate-100 text-slate-700',
    events: [
      { event: 'Audit Created', eventKey: 'audit.created', description: 'Fired when a new management audit is created.', fields: [...COMMON_FIELDS, { key: 'audit_id', label: 'Audit ID', type: 'string' }, { key: 'audit_type', label: 'Audit Type', type: 'string' }] },
      { event: 'Audit Completed', eventKey: 'audit.completed', description: 'Fired when an audit is completed.', fields: [...COMMON_FIELDS, { key: 'audit_id', label: 'Audit ID', type: 'string' }, { key: 'result', label: 'Result', type: 'string' }, { key: 'score', label: 'Score', type: 'number' }] },
      { event: 'Audit Failure', eventKey: 'audit.failure', description: 'Fired when an audit result is a failure.', fields: [...COMMON_FIELDS, { key: 'audit_id', label: 'Audit ID', type: 'string' }, { key: 'score', label: 'Score', type: 'number' }] },
    ],
  },
];

// ─────────────────────────────────────────────
// MASTER MODULE LIST — merge all categories
// ─────────────────────────────────────────────
export const MODULE_EVENTS = [
  ...TECHNICIAN_WORKFLOW_MODULES,
  ...OPERATIONS_MODULES,
  ...BUSINESS_SYSTEMS_MODULES,
  ...ADMINISTRATION_MODULES,
  ...ENTERPRISE_MODULES,
];

// Flatten all events for quick lookup
export const ALL_EVENTS = MODULE_EVENTS.flatMap(mod =>
  mod.events.map(evt => ({
    ...evt,
    module: mod.module,
    moduleKey: mod.moduleKey,
    moduleColor: mod.color,
    moduleIcon: mod.icon,
    moduleCategory: mod.category,
  }))
);

// Group modules by category for UI display
export const MODULES_BY_CATEGORY = MODULE_CATEGORIES.map(cat => ({
  ...cat,
  modules: MODULE_EVENTS.filter(mod => mod.category === cat.key),
}));

export const getTotalEventCount = () => ALL_EVENTS.length;
export const getModuleCount = () => MODULE_EVENTS.length;
export const getActiveModuleCount = () => MODULE_EVENTS.filter(m => !m.reserved).length;