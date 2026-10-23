/**
 * Enterprise Action Registry
 *
 * Master catalog of all actions the Rules Engine can execute.
 * Designed for automation builders — not database editors.
 *
 * Each action exposes only user-facing fields in `fields`.
 * System fields are listed in `autoPopulated` (handled by the Rules Engine).
 * Override-capable fields are in `advancedFields` (collapsible in the UI).
 */

export const VALUE_SOURCE_TYPES = [
  { value: 'static', label: 'Static Value' },
  { value: 'event', label: 'Event Field' },
  { value: 'template', label: 'Template (Event + Static)' },
];

const ASSIGN_TO_OPTIONS = [
  'Event Employee', 'Event Supervisor', 'Event Manager',
  'Event Department', 'Specific Employee', 'Specific Role',
];

const NOTIFY_OPTIONS = [
  'Event Employee', 'Event Supervisor', 'Operations Manager',
  'Warehouse', 'Department Manager', 'Owner',
  'Specific Employee', 'Specific Role',
];

const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const DUE_OPTIONS = ['Immediately', 'Today', 'Tomorrow', 'X Hours', 'X Days'];

export const ACTION_CATEGORIES = [
  {
    category: 'Tasks',
    categoryKey: 'tasks',
    icon: 'ListChecks',
    color: 'bg-blue-100 text-blue-700',
    actions: [
      {
        action: 'Create Enterprise Task',
        actionKey: 'task.create',
        description: 'Creates a new task in the Enterprise Task Center.',
        entity: 'EnterpriseTask',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Task Title', type: 'string', required: true, default: 'New Task from Rule' },
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS, default: 'Medium' },
          { key: 'assigned_to', label: 'Assign To', type: 'enum', options: ASSIGN_TO_OPTIONS },
          { key: 'due', label: 'Due', type: 'enum', options: DUE_OPTIONS },
          { key: 'source_record_id', label: 'Related Record (optional)', type: 'string' },
        ],
        autoPopulated: [
          { key: 'task_id', label: 'Task ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_by', label: 'Created By' },
          { key: 'comments', label: 'Timeline' },
          { key: 'status_history', label: 'Activity History' },
        ],
        advancedFields: [
          { key: 'task_type', label: 'Task Type', type: 'enum', options: ['Operational','Warehouse','Technician','CSR','Management','HR','Training','Certification','Equipment','Fleet','Safety','Audit','Corrective Action','Onboarding','Approval','Follow-Up'] },
          { key: 'department', label: 'Department', type: 'string' },
          { key: 'assigned_to_specific', label: 'Specific Assignee Name', type: 'string' },
          { key: 'due_custom_amount', label: 'Custom Due Amount (for X Hours/Days)', type: 'number' },
        ],
      },
      {
        action: 'Update Enterprise Task',
        actionKey: 'task.update',
        description: 'Updates fields on an existing enterprise task.',
        entity: 'EnterpriseTask',
        operation: 'update',
        fields: [
          { key: 'task_id', label: 'Task', type: 'string', required: true, lookup: true },
          { key: 'status', label: 'Status', type: 'enum', options: ['New','Assigned','In Progress','Waiting','Blocked','Needs Approval','Completed','Cancelled','Overdue'] },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS },
          { key: 'assigned_to', label: 'Assign To', type: 'enum', options: ASSIGN_TO_OPTIONS },
          { key: 'due_date', label: 'Due Date', type: 'date' },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Complete Enterprise Task',
        actionKey: 'task.complete',
        description: 'Marks an enterprise task as completed.',
        entity: 'EnterpriseTask',
        operation: 'update',
        fields: [
          { key: 'task_id', label: 'Task', type: 'string', required: true, lookup: true },
        ],
        autoPopulated: [
          { key: 'status', label: 'Status' },
          { key: 'completed_date', label: 'Completed Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Assign Enterprise Task',
        actionKey: 'task.assign',
        description: 'Assigns an enterprise task to a specific employee or role.',
        entity: 'EnterpriseTask',
        operation: 'update',
        fields: [
          { key: 'task_id', label: 'Task', type: 'string', required: true, lookup: true },
          { key: 'assigned_to', label: 'Assign To', type: 'enum', options: ASSIGN_TO_OPTIONS },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
        advancedFields: [
          { key: 'assigned_to_specific', label: 'Specific Assignee Name', type: 'string' },
        ],
      },
      {
        action: 'Change Task Priority',
        actionKey: 'task.change_priority',
        description: 'Changes the priority of an enterprise task.',
        entity: 'EnterpriseTask',
        operation: 'update',
        fields: [
          { key: 'task_id', label: 'Task', type: 'string', required: true, lookup: true },
          { key: 'priority', label: 'New Priority', type: 'enum', options: PRIORITY_OPTIONS, required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
    ],
  },

  {
    category: 'Notifications',
    categoryKey: 'notifications',
    icon: 'Bell',
    color: 'bg-purple-100 text-purple-700',
    actions: [
      {
        action: 'Create Notification',
        actionKey: 'notification.create',
        description: 'Creates a new notification in the Enterprise Notification Center.',
        entity: 'EnterpriseNotification',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Title', type: 'string', required: true },
          { key: 'message', label: 'Message', type: 'text', required: true },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS, default: 'Medium' },
          { key: 'recipient_role', label: 'Notify', type: 'enum', options: NOTIFY_OPTIONS },
          { key: 'delivery_methods', label: 'Delivery Method', type: 'multienum', options: ['In-App','Email','SMS','Push Notification','Microsoft Teams','Slack'], default: 'In-App' },
          { key: 'requires_acknowledgment', label: 'Requires Acknowledgment', type: 'boolean', default: false },
          { key: 'source_record_id', label: 'Related Record (optional)', type: 'string' },
        ],
        autoPopulated: [
          { key: 'notification_id', label: 'Notification ID' },
          { key: 'notification_type', label: 'Type' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'status', label: 'Status' },
          { key: 'sent_date', label: 'Sent Date' },
          { key: 'read_date', label: 'Read Date' },
          { key: 'acknowledged_date', label: 'Acknowledged Date' },
          { key: 'is_archived', label: 'Archived' },
        ],
        advancedFields: [
          { key: 'recipient_email', label: 'Specific Recipient Email', type: 'string' },
          { key: 'recipient_name', label: 'Specific Recipient Name', type: 'string' },
          { key: 'expiration_date', label: 'Expiration Date', type: 'datetime' },
        ],
      },
      {
        action: 'Update Notification',
        actionKey: 'notification.update',
        description: 'Updates fields on an existing notification.',
        entity: 'EnterpriseNotification',
        operation: 'update',
        fields: [
          { key: 'notification_id', label: 'Notification', type: 'string', required: true, lookup: true },
          { key: 'status', label: 'Status', type: 'enum', options: ['Pending','Sent','Delivered','Read','Acknowledged','Expired','Cancelled'] },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
        ],
      },
      {
        action: 'Require Acknowledgment',
        actionKey: 'notification.require_ack',
        description: 'Flags a notification as requiring acknowledgment.',
        entity: 'EnterpriseNotification',
        operation: 'update',
        fields: [
          { key: 'notification_id', label: 'Notification', type: 'string', required: true, lookup: true },
        ],
        autoPopulated: [
          { key: 'requires_acknowledgment', label: 'Requires Acknowledgment' },
          { key: 'updated_date', label: 'Updated Date' },
        ],
      },
      {
        action: 'Escalate Notification',
        actionKey: 'notification.escalate',
        description: 'Escalates a notification to the next level.',
        entity: 'EnterpriseNotification',
        operation: 'update',
        fields: [
          { key: 'notification_id', label: 'Notification', type: 'string', required: true, lookup: true },
          { key: 'escalation_level', label: 'Escalation Level', type: 'number', required: true },
        ],
        autoPopulated: [
          { key: 'escalation_date', label: 'Escalation Date' },
          { key: 'updated_date', label: 'Updated Date' },
        ],
      },
    ],
  },

  {
    category: 'Records',
    categoryKey: 'records',
    icon: 'Database',
    color: 'bg-slate-100 text-slate-700',
    actions: [
      {
        action: 'Update Record',
        actionKey: 'record.update_field',
        description: 'Updates a field on any LVC OS record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'field_name', label: 'Field', type: 'string', required: true },
          { key: 'field_value', label: 'New Value', type: 'string', required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Update Record Status',
        actionKey: 'record.update_status',
        description: 'Updates the status field on any LVC OS record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'status', label: 'New Status', type: 'string', required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Add Comment',
        actionKey: 'record.add_comment',
        description: 'Adds a comment to a record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'comment', label: 'Comment', type: 'text', required: true },
        ],
        autoPopulated: [
          { key: 'author', label: 'Author' },
          { key: 'updated_date', label: 'Updated Date' },
        ],
      },
      {
        action: 'Add Note',
        actionKey: 'record.add_note',
        description: 'Adds a note to a record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'note', label: 'Note', type: 'text', required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Add Timeline Entry',
        actionKey: 'record.timeline_entry',
        description: 'Adds a timeline entry to a record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'entry', label: 'Timeline Entry', type: 'text', required: true },
        ],
        autoPopulated: [
          { key: 'author', label: 'Author' },
          { key: 'timestamp', label: 'Timestamp' },
        ],
      },
      {
        action: 'Add Attachment',
        actionKey: 'record.add_attachment',
        description: 'Adds an attachment URL to a record.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'entity_name', label: 'Record', type: 'string', required: true },
          { key: 'record_id', label: 'Record ID', type: 'string', required: true, lookup: true },
          { key: 'attachment_url', label: 'Attachment URL', type: 'string', required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
    ],
  },

  {
    category: 'Workflows',
    categoryKey: 'workflows',
    icon: 'Workflow',
    color: 'bg-indigo-100 text-indigo-700',
    actions: [
      {
        action: 'Start Workflow',
        actionKey: 'workflow.start',
        description: 'Starts a workflow by creating a new workflow registry entry.',
        entity: 'WorkflowRegistry',
        operation: 'create',
        fields: [
          { key: 'workflow_name', label: 'Workflow', type: 'string', required: true },
          { key: 'source_record_id', label: 'Related Record (optional)', type: 'string' },
        ],
        autoPopulated: [
          { key: 'workflow_id', label: 'Workflow ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'related_sop', label: 'Related SOP', type: 'string' },
          { key: 'related_business_process', label: 'Related Business Process', type: 'string' },
        ],
      },
      {
        action: 'Complete Workflow',
        actionKey: 'workflow.complete',
        description: 'Marks a workflow as completed.',
        entity: 'WorkflowRegistry',
        operation: 'update',
        fields: [
          { key: 'workflow_id', label: 'Workflow', type: 'string', required: true, lookup: true },
          { key: 'notes', label: 'Completion Notes', type: 'text' },
        ],
        autoPopulated: [
          { key: 'status', label: 'Status' },
          { key: 'completed_date', label: 'Completed Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Cancel Workflow',
        actionKey: 'workflow.cancel',
        description: 'Cancels a workflow.',
        entity: 'WorkflowRegistry',
        operation: 'update',
        fields: [
          { key: 'workflow_id', label: 'Workflow', type: 'string', required: true, lookup: true },
          { key: 'notes', label: 'Cancellation Reason', type: 'text' },
        ],
        autoPopulated: [
          { key: 'status', label: 'Status' },
          { key: 'cancelled_date', label: 'Cancelled Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
    ],
  },

  {
    category: 'Management',
    categoryKey: 'management',
    icon: 'UserCog',
    color: 'bg-cyan-100 text-cyan-700',
    actions: [
      {
        action: 'Create Corrective Action',
        actionKey: 'management.corrective_action',
        description: 'Creates a corrective action record from an audit or event.',
        entity: 'CorrectiveAction',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Title', type: 'string', required: true },
          { key: 'assigned_to', label: 'Assigned To', type: 'enum', options: ASSIGN_TO_OPTIONS },
          { key: 'priority', label: 'Severity', type: 'enum', options: PRIORITY_OPTIONS, default: 'High' },
          { key: 'due_date', label: 'Due Date', type: 'date' },
        ],
        autoPopulated: [
          { key: 'corrective_action_id', label: 'Corrective Action ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'source_record_id', label: 'Source Record ID' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'related_audit', label: 'Related Audit', type: 'string' },
          { key: 'related_employee', label: 'Related Employee', type: 'string' },
        ],
      },
      {
        action: 'Create Improvement Request',
        actionKey: 'management.improvement',
        description: 'Creates a continuous improvement request.',
        entity: 'ImprovementRequest',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Title', type: 'string', required: true },
          { key: 'description', label: 'Description', type: 'text', required: true },
          { key: 'department', label: 'Department', type: 'string' },
          { key: 'assigned_reviewer', label: 'Assign Reviewer', type: 'string' },
        ],
        autoPopulated: [
          { key: 'request_id', label: 'Request ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'submitted_by', label: 'Submitted By' },
        ],
        advancedFields: [
          { key: 'category', label: 'Category', type: 'string' },
          { key: 'related_employee', label: 'Related Employee', type: 'string' },
        ],
      },
      {
        action: 'Schedule Audit',
        actionKey: 'management.schedule_audit',
        description: 'Creates a management audit record.',
        entity: 'ManagementAudit',
        operation: 'create',
        fields: [
          { key: 'audit_name', label: 'Audit Name', type: 'string', required: true },
          { key: 'audit_type', label: 'Audit Type', type: 'string' },
          { key: 'scheduled_date', label: 'Scheduled Date', type: 'date' },
          { key: 'assigned_to', label: 'Assigned To', type: 'enum', options: ASSIGN_TO_OPTIONS },
        ],
        autoPopulated: [
          { key: 'audit_id', label: 'Audit ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'audit_target', label: 'Audit Target', type: 'string' },
          { key: 'related_employee', label: 'Related Employee', type: 'string' },
        ],
      },
      {
        action: 'Schedule Training',
        actionKey: 'management.schedule_training',
        description: 'Creates an employee training assignment.',
        entity: 'EmployeeCertification',
        operation: 'create',
        fields: [
          { key: 'employee_name', label: 'Employee', type: 'string', required: true },
          { key: 'training_name', label: 'Training', type: 'string', required: true },
          { key: 'due_date', label: 'Due Date', type: 'date' },
        ],
        autoPopulated: [
          { key: 'training_id', label: 'Training ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'related_role', label: 'Related Role', type: 'string' },
        ],
      },
      {
        action: 'Schedule Certification Renewal',
        actionKey: 'management.schedule_cert_renewal',
        description: 'Creates a certification renewal task.',
        entity: 'EmployeeCertification',
        operation: 'create',
        fields: [
          { key: 'employee_name', label: 'Employee', type: 'string', required: true },
          { key: 'certification_name', label: 'Certification', type: 'string', required: true },
          { key: 'renewal_due_date', label: 'Renewal Due Date', type: 'date' },
        ],
        autoPopulated: [
          { key: 'certification_id', label: 'Certification ID' },
          { key: 'status', label: 'Status' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'expiration_date', label: 'Expiration Date', type: 'date' },
        ],
      },
    ],
  },

  {
    category: 'Operations Center',
    categoryKey: 'operations',
    icon: 'LayoutPanelLeft',
    color: 'bg-amber-100 text-amber-700',
    actions: [
      {
        action: 'Add Executive Alert',
        actionKey: 'ops.executive_alert',
        description: 'Creates an executive alert notification.',
        entity: 'EnterpriseNotification',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Alert Title', type: 'string', required: true },
          { key: 'message', label: 'Alert Message', type: 'text', required: true },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS, default: 'Critical' },
        ],
        autoPopulated: [
          { key: 'notification_id', label: 'Notification ID' },
          { key: 'notification_type', label: 'Type' },
          { key: 'recipient_role', label: 'Recipient Role' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'source_record_id', label: 'Source Record ID' },
          { key: 'status', label: 'Status' },
          { key: 'sent_date', label: 'Sent Date' },
          { key: 'delivery_methods', label: 'Delivery Methods' },
        ],
      },
      {
        action: 'Add Company Health Alert',
        actionKey: 'ops.company_health',
        description: 'Creates a company health alert notification.',
        entity: 'EnterpriseNotification',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Alert Title', type: 'string', required: true },
          { key: 'message', label: 'Alert Message', type: 'text', required: true },
          { key: 'notification_type', label: 'Alert Type', type: 'enum', options: ['Warning','Critical','Operational','Safety'], default: 'Warning' },
        ],
        autoPopulated: [
          { key: 'notification_id', label: 'Notification ID' },
          { key: 'recipient_role', label: 'Recipient Role' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'status', label: 'Status' },
          { key: 'sent_date', label: 'Sent Date' },
          { key: 'priority', label: 'Priority' },
        ],
      },
      {
        action: 'Add Executive Attention Item',
        actionKey: 'ops.exec_attention',
        description: 'Creates a task flagged for executive attention.',
        entity: 'EnterpriseTask',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Title', type: 'string', required: true },
          { key: 'description', label: 'Description', type: 'text', required: true },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS, default: 'High' },
        ],
        autoPopulated: [
          { key: 'task_id', label: 'Task ID' },
          { key: 'task_type', label: 'Task Type' },
          { key: 'assigned_role', label: 'Assigned Role' },
          { key: 'status', label: 'Status' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'source_record_id', label: 'Source Record ID' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'created_by', label: 'Created By' },
        ],
        advancedFields: [
          { key: 'related_employee', label: 'Related Employee', type: 'string' },
        ],
      },
      {
        action: 'Add Morning Brief Item',
        actionKey: 'ops.morning_brief',
        description: 'Creates a task for inclusion in the next morning brief.',
        entity: 'EnterpriseTask',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Brief Item Title', type: 'string', required: true },
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'priority', label: 'Priority', type: 'enum', options: PRIORITY_OPTIONS, default: 'Medium' },
        ],
        autoPopulated: [
          { key: 'task_id', label: 'Task ID' },
          { key: 'task_type', label: 'Task Type' },
          { key: 'department', label: 'Department' },
          { key: 'status', label: 'Status' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'created_by', label: 'Created By' },
        ],
      },
    ],
  },

  {
    category: 'Inspection & Estimate',
    categoryKey: 'inspection_estimate',
    icon: 'ClipboardList',
    color: 'bg-blue-100 text-blue-700',
    actions: [
      {
        action: 'Create Deficiency Finding',
        actionKey: 'inspection.create_finding',
        description: 'Creates a deficiency finding linked to a Repair Template. All downstream configuration (deficiency type, severity, narrative, pricing, materials, scope, etc.) is inherited automatically from the selected template by the Repair Recommendation Engine.',
        entity: 'InspectionFinding',
        operation: 'create',
        fields: [
          { key: 'job_id', label: 'Job ID', type: 'string', required: true },
          { key: 'repair_template_id', label: 'Repair Template', type: 'string', required: true, lookup: true, description: 'Select the Repair Recommendation Template. All deficiency details are inherited automatically.' },
        ],
        autoPopulated: [
          { key: 'finding_id', label: 'Finding ID' },
          { key: 'deficiency_type', label: 'Deficiency Type (inherited from template)' },
          { key: 'severity', label: 'Severity (inherited from template)' },
          { key: 'customer_facing_explanation', label: 'Narrative (inherited from template)' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_by', label: 'Created By' },
        ],
      },
      {
        action: 'Run Repair Recommendation Engine',
        actionKey: 'inspection.run_repair_engine',
        isRepairWorkflowAction: true,
        description: 'Triggers the Repair Recommendation Engine to generate recommendations from findings.',
        entity: '_function',
        operation: 'function',
        fields: [
          { key: 'job_id', label: 'Job ID', type: 'string', required: true },
          { key: 'finding_id', label: 'Finding ID (optional)', type: 'string' },
        ],
        autoPopulated: [
          { key: 'triggered_date', label: 'Triggered Date' },
          { key: 'triggered_by', label: 'Triggered By' },
        ],
      },
      {
        action: 'Generate Estimate Item',
        actionKey: 'inspection.generate_estimate_item',
        isRepairWorkflowAction: true,
        description: 'Creates a draft estimate item from a repair recommendation.',
        entity: 'DraftEstimateItem',
        operation: 'create',
        fields: [
          { key: 'job_id', label: 'Job ID', type: 'string', required: true },
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string', required: true },
          { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' },
          { key: 'selling_price', label: 'Selling Price', type: 'number' },
        ],
        autoPopulated: [
          { key: 'estimate_item_id', label: 'Estimate Item ID' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_by', label: 'Created By' },
        ],
      },
      {
        action: 'Update Scope of Work',
        actionKey: 'inspection.update_scope',
        isRepairWorkflowAction: true,
        description: 'Updates the scope of work for a job based on new estimate items.',
        entity: '_function',
        operation: 'function',
        fields: [
          { key: 'job_id', label: 'Job ID', type: 'string', required: true },
          { key: 'estimate_package_id', label: 'Estimate Package ID', type: 'string' },
        ],
        autoPopulated: [
          { key: 'triggered_date', label: 'Triggered Date' },
          { key: 'triggered_by', label: 'Triggered By' },
        ],
      },
      {
        action: 'Add to Customer Presentation',
        actionKey: 'inspection.add_to_presentation',
        isRepairWorkflowAction: true,
        description: 'Adds a finding or recommendation to the customer presentation.',
        entity: 'CustomerPresentation',
        operation: 'update',
        fields: [
          { key: 'presentation_id', label: 'Presentation ID', type: 'string', required: true },
          { key: 'item_type', label: 'Item Type', type: 'enum', options: ['finding', 'recommendation', 'photo', 'note'], default: 'finding' },
          { key: 'item_id', label: 'Item ID', type: 'string', required: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Update Analytics',
        actionKey: 'inspection.update_analytics',
        isRepairWorkflowAction: true,
        description: 'Updates analytics metrics based on inspection or job data.',
        entity: '_function',
        operation: 'function',
        fields: [
          { key: 'metric_name', label: 'Metric Name', type: 'string', required: true },
          { key: 'metric_value', label: 'Metric Value', type: 'number', required: true },
          { key: 'job_id', label: 'Job ID (optional)', type: 'string' },
        ],
        autoPopulated: [
          { key: 'triggered_date', label: 'Triggered Date' },
          { key: 'triggered_by', label: 'Triggered By' },
        ],
      },
      {
        action: 'Set Question Visibility',
        actionKey: 'inspection.set_visibility',
        description: 'Controls visibility of downstream inspection questions based on an answer.',
        entity: '_dynamic',
        operation: 'update',
        fields: [
          { key: 'target_question_id', label: 'Target Question ID', type: 'string', required: true },
          { key: 'visible', label: 'Visible', type: 'boolean', default: true },
        ],
        autoPopulated: [
          { key: 'updated_date', label: 'Updated Date' },
          { key: 'updated_by', label: 'Updated By' },
        ],
      },
      {
        action: 'Create Repair Recommendation',
        actionKey: 'inspection.create_recommendation',
        isRepairWorkflowAction: true,
        description: 'Creates a repair recommendation from a finding.',
        entity: 'RepairSystemRecommendation',
        operation: 'create',
        fields: [
          { key: 'job_id', label: 'Job ID', type: 'string', required: true },
          { key: 'finding_id', label: 'Finding ID', type: 'string', required: true },
          { key: 'priority', label: 'Priority', type: 'enum', options: ['low', 'medium', 'high', 'critical'], default: 'medium' },
          { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' },
        ],
        autoPopulated: [
          { key: 'recommendation_id', label: 'Recommendation ID' },
          { key: 'created_date', label: 'Created Date' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'created_by', label: 'Created By' },
        ],
      },
    ],
  },

  {
    category: 'Integrations',
    categoryKey: 'integrations',
    icon: 'Plug',
    color: 'bg-violet-100 text-violet-700',
    actions: [
      {
        action: 'Trigger Webhook',
        actionKey: 'integration.webhook',
        description: 'Triggers an outbound webhook to an external URL.',
        entity: '_webhook',
        operation: 'webhook',
        fields: [
          { key: 'webhook_url', label: 'Webhook URL', type: 'string', required: true },
          { key: 'http_method', label: 'HTTP Method', type: 'enum', options: ['POST','PUT','PATCH'], default: 'POST' },
          { key: 'body_json', label: 'Body (JSON)', type: 'text' },
        ],
        autoPopulated: [
          { key: 'triggered_date', label: 'Triggered Date' },
          { key: 'triggered_by', label: 'Triggered By' },
        ],
        advancedFields: [
          { key: 'headers_json', label: 'Headers (JSON)', type: 'text' },
        ],
      },
      {
        action: 'Trigger Integration',
        actionKey: 'integration.trigger',
        description: 'Triggers a backend function in the app.',
        entity: '_function',
        operation: 'function',
        fields: [
          { key: 'function_name', label: 'Function', type: 'string', required: true },
          { key: 'payload_json', label: 'Payload (JSON)', type: 'text' },
        ],
        autoPopulated: [
          { key: 'triggered_date', label: 'Triggered Date' },
          { key: 'triggered_by', label: 'Triggered By' },
        ],
      },
      {
        action: 'Publish Event',
        actionKey: 'integration.publish_event',
        description: 'Publishes an event to the Enterprise Notification Center.',
        entity: 'EnterpriseNotification',
        operation: 'create',
        fields: [
          { key: 'title', label: 'Event Title', type: 'string', required: true },
          { key: 'message', label: 'Event Message', type: 'text', required: true },
          { key: 'notification_type', label: 'Event Type', type: 'enum', options: ['System','Operational','Information','Warning','Critical'], default: 'System' },
        ],
        autoPopulated: [
          { key: 'notification_id', label: 'Notification ID' },
          { key: 'source_module', label: 'Source Module' },
          { key: 'source_record_id', label: 'Source Record ID' },
          { key: 'status', label: 'Status' },
          { key: 'sent_date', label: 'Sent Date' },
          { key: 'delivery_methods', label: 'Delivery Methods' },
        ],
        advancedFields: [
          { key: 'recipient_role', label: 'Recipient Role', type: 'string' },
        ],
      },
    ],
  },
];

// Flatten all actions for quick lookup
export const ALL_ACTIONS = ACTION_CATEGORIES.flatMap(cat =>
  cat.actions.map(act => ({
    ...act,
    category: cat.category,
    categoryKey: cat.categoryKey,
    categoryColor: cat.color,
    categoryIcon: cat.icon,
  }))
);

export const getTotalActionCount = () => ALL_ACTIONS.length;
export const getActionCategoryCount = () => ACTION_CATEGORIES.length;