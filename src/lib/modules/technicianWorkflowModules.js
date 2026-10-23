/**
 * Technician Workflow Modules
 *
 * Modules that follow the technician's operational journey:
 * Inspection → Recommendation Review → Scope → Estimate → Proposal →
 * Presentation → Customer Decision → Execution → Job Completion
 */
import { COMMON_FIELDS, JOB_FIELDS } from '@/lib/moduleFields';

export const TECHNICIAN_WORKFLOW_MODULES = [
  // ─────────────────────────────────────────────
  // INSPECTION ENGINE
  // ─────────────────────────────────────────────
  {
    module: 'Inspection Engine',
    moduleKey: 'inspection_engine',
    category: 'technician_workflow',
    icon: 'ClipboardList',
    color: 'bg-blue-100 text-blue-700',
    events: [
      {
        event: 'Question Answered',
        eventKey: 'inspection.question_answered',
        description: 'Fired when a technician answers an inspection question.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'question_id', label: 'Question ID', type: 'string' },
          { key: 'question_text', label: 'Question Text', type: 'string' },
          { key: 'question_category', label: 'Question Category', type: 'string' },
          { key: 'answer_value', label: 'Answer Value', type: 'string' },
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'module_key', label: 'Inspection Module', type: 'string' },
          { key: 'is_fail_answer', label: 'Is Fail Answer', type: 'boolean' },
          { key: 'is_nfpa_trigger', label: 'NFPA Trigger', type: 'boolean' },
          { key: 'is_safety_trigger', label: 'Safety Trigger', type: 'boolean' },
        ],
      },
      {
        event: 'Question Changed',
        eventKey: 'inspection.question_changed',
        description: 'Fired when a technician changes a previously answered question.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'question_id', label: 'Question ID', type: 'string' },
          { key: 'question_text', label: 'Question Text', type: 'string' },
          { key: 'question_category', label: 'Question Category', type: 'string' },
          { key: 'old_value', label: 'Old Value', type: 'string' },
          { key: 'new_value', label: 'New Value', type: 'string' },
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'module_key', label: 'Inspection Module', type: 'string' },
        ],
      },
      {
        event: 'Question Failed',
        eventKey: 'inspection.question_failed',
        description: 'Fired when a technician answers a question with a failing/deficient value.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'question_id', label: 'Question ID', type: 'string' },
          { key: 'question_text', label: 'Question Text', type: 'string' },
          { key: 'question_category', label: 'Question Category', type: 'string' },
          { key: 'answer_value', label: 'Answer Value', type: 'string' },
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'module_key', label: 'Inspection Module', type: 'string' },
          { key: 'is_nfpa_trigger', label: 'NFPA Trigger', type: 'boolean' },
          { key: 'is_safety_trigger', label: 'Safety Trigger', type: 'boolean' },
          { key: 'is_critical_failure', label: 'Critical Failure', type: 'boolean' },
        ],
      },
      {
        event: 'Question Passed',
        eventKey: 'inspection.question_passed',
        description: 'Fired when a technician answers a question with a passing value.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'question_id', label: 'Question ID', type: 'string' },
          { key: 'question_text', label: 'Question Text', type: 'string' },
          { key: 'question_category', label: 'Question Category', type: 'string' },
          { key: 'answer_value', label: 'Answer Value', type: 'string' },
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'module_key', label: 'Inspection Module', type: 'string' },
        ],
      },
      {
        event: 'Inspection Started',
        eventKey: 'inspection.started',
        description: 'Fired when a technician begins an inspection.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'chimney_label', label: 'Chimney Label', type: 'string' },
        ],
      },
      {
        event: 'Inspection Completed',
        eventKey: 'inspection.completed',
        description: 'Fired when all inspection modules are submitted.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'inspection_type', label: 'Inspection Type', type: 'string' },
          { key: 'finding_count', label: 'Finding Count', type: 'number' },
          { key: 'photo_count', label: 'Photo Count', type: 'number' },
          { key: 'deficiency_count', label: 'Deficiency Count', type: 'number' },
          { key: 'critical_findings', label: 'Critical Findings', type: 'number' },
        ],
      },
      {
        event: 'Finding Created',
        eventKey: 'inspection.finding_created',
        description: 'Fired when a deficiency finding is created from an inspection answer.',
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
        event: 'Finding Severity Escalated',
        eventKey: 'inspection.finding_escalated',
        description: 'Fired when a finding severity is increased.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'finding_id', label: 'Finding ID', type: 'string' },
          { key: 'old_severity', label: 'Old Severity', type: 'string' },
          { key: 'new_severity', label: 'New Severity', type: 'string' },
        ],
      },
      {
        event: 'Module Review Completed',
        eventKey: 'inspection.module_reviewed',
        description: 'Fired when a lead technician reviews and approves an inspection module.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'module_key', label: 'Module', type: 'string' },
          { key: 'review_decision', label: 'Review Decision', type: 'string' },
          { key: 'reviewed_by', label: 'Reviewed By', type: 'string' },
        ],
      },
      {
        event: 'Photo Requirement Not Met',
        eventKey: 'inspection.photo_required',
        description: 'Fired when a required photo is missing during inspection submission.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'question_id', label: 'Question ID', type: 'string' },
          { key: 'required_count', label: 'Required Count', type: 'number' },
          { key: 'actual_count', label: 'Actual Count', type: 'number' },
          { key: 'override_used', label: 'Override Used', type: 'boolean' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // RECOMMENDATION REVIEW
  // ─────────────────────────────────────────────
  {
    module: 'Recommendation Review',
    moduleKey: 'recommendation_review',
    category: 'technician_workflow',
    icon: 'Lightbulb',
    color: 'bg-yellow-100 text-yellow-700',
    events: [
      {
        event: 'Recommendation Generated',
        eventKey: 'recommendation.generated',
        description: 'Fired when a repair recommendation is generated from inspection findings.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'finding_id', label: 'Source Finding ID', type: 'string' },
          { key: 'template_id', label: 'Template ID', type: 'string' },
          { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' },
          { key: 'priority', label: 'Priority', type: 'string' },
        ],
      },
      {
        event: 'Recommendation Accepted',
        eventKey: 'recommendation.accepted',
        description: 'Fired when a repair recommendation is accepted for estimate building.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'accepted_by', label: 'Accepted By', type: 'string' },
          { key: 'disposition', label: 'Disposition', type: 'string' },
        ],
      },
      {
        event: 'Recommendation Deferred',
        eventKey: 'recommendation.deferred',
        description: 'Fired when a repair recommendation is deferred (Save for Later).',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'deferred_by', label: 'Deferred By', type: 'string' },
          { key: 'deferral_reason', label: 'Deferral Reason', type: 'string' },
        ],
      },
      {
        event: 'Recommendation Declined',
        eventKey: 'recommendation.declined',
        description: 'Fired when a repair recommendation is marked Not Applicable.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'declined_by', label: 'Declined By', type: 'string' },
          { key: 'decline_reason', label: 'Decline Reason', type: 'string' },
        ],
      },
      {
        event: 'Recommendation Modified',
        eventKey: 'recommendation.modified',
        description: 'Fired when a recommendation is edited during review.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Review Completed',
        eventKey: 'recommendation.review_completed',
        description: 'Fired when all recommendations have been reviewed for a job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'total_recommendations', label: 'Total Recommendations', type: 'number' },
          { key: 'accepted_count', label: 'Accepted Count', type: 'number' },
          { key: 'deferred_count', label: 'Deferred Count', type: 'number' },
          { key: 'declined_count', label: 'Declined Count', type: 'number' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // SCOPE OF WORK BUILDER
  // ─────────────────────────────────────────────
  {
    module: 'Scope of Work Builder',
    moduleKey: 'scope_of_work',
    category: 'technician_workflow',
    icon: 'FileText',
    color: 'bg-indigo-100 text-indigo-700',
    events: [
      {
        event: 'Scope Generated',
        eventKey: 'scope.generated',
        description: 'Fired when a scope of work is generated from an estimate package.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'scope_id', label: 'Scope ID', type: 'string' },
          { key: 'estimate_package_id', label: 'Estimate Package ID', type: 'string' },
          { key: 'estimated_hours', label: 'Estimated Hours', type: 'number' },
          { key: 'estimated_days', label: 'Estimated Days', type: 'number' },
          { key: 'crew_size', label: 'Crew Size', type: 'number' },
        ],
      },
      {
        event: 'Scope Updated',
        eventKey: 'scope.updated',
        description: 'Fired when a scope of work is modified.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'scope_id', label: 'Scope ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Scope Approved',
        eventKey: 'scope.approved',
        description: 'Fired when a scope of work is approved.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'scope_id', label: 'Scope ID', type: 'string' },
          { key: 'approved_by', label: 'Approved By', type: 'string' },
        ],
      },
      {
        event: 'Scope Replaced',
        eventKey: 'scope.replaced',
        description: 'Fired when a scope is superseded by a new version.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'old_scope_id', label: 'Old Scope ID', type: 'string' },
          { key: 'new_scope_id', label: 'New Scope ID', type: 'string' },
          { key: 'reason', label: 'Reason', type: 'string' },
        ],
      },
      {
        event: 'Work Phase Added',
        eventKey: 'scope.phase_added',
        description: 'Fired when a new work phase is added to a scope.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'scope_id', label: 'Scope ID', type: 'string' },
          { key: 'phase_name', label: 'Phase Name', type: 'string' },
          { key: 'estimated_hours', label: 'Estimated Hours', type: 'number' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // ESTIMATE REVIEW
  // ─────────────────────────────────────────────
  {
    module: 'Estimate Review',
    moduleKey: 'estimate_review',
    category: 'technician_workflow',
    icon: 'FileSpreadsheet',
    color: 'bg-green-100 text-green-700',
    events: [
      {
        event: 'Estimate Item Created',
        eventKey: 'estimate.item_created',
        description: 'Fired when a draft estimate item is created from a recommendation.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'estimate_item_id', label: 'Estimate Item ID', type: 'string' },
          { key: 'recommendation_id', label: 'Recommendation ID', type: 'string' },
          { key: 'service_catalog_id', label: 'Service Catalog ID', type: 'string' },
          { key: 'selling_price', label: 'Selling Price', type: 'number' },
        ],
      },
      {
        event: 'Estimate Item Modified',
        eventKey: 'estimate.item_modified',
        description: 'Fired when a draft estimate item is edited.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'estimate_item_id', label: 'Estimate Item ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Estimate Item Removed',
        eventKey: 'estimate.item_removed',
        description: 'Fired when a draft estimate item is removed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'estimate_item_id', label: 'Estimate Item ID', type: 'string' },
          { key: 'removed_by', label: 'Removed By', type: 'string' },
        ],
      },
      {
        event: 'Estimate Package Created',
        eventKey: 'estimate.package_created',
        description: 'Fired when an estimate package (Good/Better/Best) is created.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'option_type', label: 'Option Type', type: 'string' },
          { key: 'subtotal', label: 'Subtotal', type: 'number' },
          { key: 'selling_price', label: 'Selling Price', type: 'number' },
        ],
      },
      {
        event: 'Estimate Package Priced',
        eventKey: 'estimate.package_priced',
        description: 'Fired when an estimate package pricing is calculated.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'subtotal', label: 'Subtotal', type: 'number' },
          { key: 'selling_price', label: 'Selling Price', type: 'number' },
          { key: 'gross_profit', label: 'Gross Profit', type: 'number' },
          { key: 'gross_margin', label: 'Gross Margin %', type: 'number' },
        ],
      },
      {
        event: 'Estimate Package Stale',
        eventKey: 'estimate.package_stale',
        description: 'Fired when an estimate package becomes stale due to item changes.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'stale_reason', label: 'Stale Reason', type: 'string' },
          { key: 'stale_item_id', label: 'Stale Item ID', type: 'string' },
        ],
      },
      {
        event: 'Estimate Approved',
        eventKey: 'estimate.approved',
        description: 'Fired when an estimate package is accepted internally.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'approved_by', label: 'Approved By', type: 'string' },
        ],
      },
      {
        event: 'Estimate Declined',
        eventKey: 'estimate.declined',
        description: 'Fired when an estimate package is declined.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'decline_reason', label: 'Decline Reason', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PROPOSAL BUILDER
  // ─────────────────────────────────────────────
  {
    module: 'Proposal Builder',
    moduleKey: 'proposal_builder',
    category: 'technician_workflow',
    icon: 'Presentation',
    color: 'bg-violet-100 text-violet-700',
    events: [
      {
        event: 'Proposal Created',
        eventKey: 'proposal.created',
        description: 'Fired when a customer proposal is created from estimate packages.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'proposal_id', label: 'Proposal ID', type: 'string' },
          { key: 'package_count', label: 'Package Count', type: 'number' },
        ],
      },
      {
        event: 'Proposal Updated',
        eventKey: 'proposal.updated',
        description: 'Fired when a proposal is modified.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'proposal_id', label: 'Proposal ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Proposal Presented',
        eventKey: 'proposal.presented',
        description: 'Fired when a proposal is marked as presented to the customer.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'proposal_id', label: 'Proposal ID', type: 'string' },
          { key: 'presented_by', label: 'Presented By', type: 'string' },
        ],
      },
      {
        event: 'Proposal Option Added',
        eventKey: 'proposal.option_added',
        description: 'Fired when an option is added to a proposal.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'proposal_id', label: 'Proposal ID', type: 'string' },
          { key: 'option_type', label: 'Option Type', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // CUSTOMER PRESENTATION
  // ─────────────────────────────────────────────
  {
    module: 'Customer Presentation',
    moduleKey: 'customer_presentation',
    category: 'technician_workflow',
    icon: 'MonitorPlay',
    color: 'bg-cyan-100 text-cyan-700',
    events: [
      {
        event: 'Presentation Started',
        eventKey: 'presentation.started',
        description: 'Fired when a customer presentation begins.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'presentation_id', label: 'Presentation ID', type: 'string' },
        ],
      },
      {
        event: 'Presentation Completed',
        eventKey: 'presentation.completed',
        description: 'Fired when a customer presentation is completed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'presentation_id', label: 'Presentation ID', type: 'string' },
          { key: 'duration_minutes', label: 'Duration (min)', type: 'number' },
        ],
      },
      {
        event: 'Customer Presentation Shared',
        eventKey: 'presentation.shared',
        description: 'Fired when a presentation link is shared with the customer.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'presentation_id', label: 'Presentation ID', type: 'string' },
          { key: 'shared_with', label: 'Shared With', type: 'string' },
        ],
      },
      {
        event: 'Presentation Updated',
        eventKey: 'presentation.updated',
        description: 'Fired when a customer presentation is modified after sharing.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'presentation_id', label: 'Presentation ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // CUSTOMER DECISION
  // ─────────────────────────────────────────────
  {
    module: 'Customer Decision',
    moduleKey: 'customer_decision',
    category: 'technician_workflow',
    icon: 'CheckCircle',
    color: 'bg-emerald-100 text-emerald-700',
    events: [
      {
        event: 'Customer Decision Recorded',
        eventKey: 'customer.decision_recorded',
        description: 'Fired when a customer decision is captured (accept/decline/defer).',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'decision', label: 'Decision', type: 'string' },
          { key: 'package_id', label: 'Selected Package ID', type: 'string' },
          { key: 'selected_option_type', label: 'Selected Option Type', type: 'string' },
        ],
      },
      {
        event: 'Package Accepted',
        eventKey: 'customer.package_accepted',
        description: 'Fired when the customer accepts an estimate package.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'accepted_option', label: 'Accepted Option', type: 'string' },
          { key: 'selling_price', label: 'Selling Price', type: 'number' },
        ],
      },
      {
        event: 'Package Declined',
        eventKey: 'customer.package_declined',
        description: 'Fired when the customer declines all estimate packages.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'decline_reason', label: 'Decline Reason', type: 'string' },
        ],
      },
      {
        event: 'Customer Deferred',
        eventKey: 'customer.deferred',
        description: 'Fired when the customer defers their decision.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'follow_up_date', label: 'Follow-up Date', type: 'date' },
        ],
      },
      {
        event: 'Customer Signature Captured',
        eventKey: 'customer.signature_captured',
        description: 'Fired when a customer signs the acceptance signature block.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'signature_type', label: 'Signature Type', type: 'string' },
          { key: 'signed_by', label: 'Signed By', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // EXECUTION PLAN
  // ─────────────────────────────────────────────
  {
    module: 'Execution Plan',
    moduleKey: 'execution_plan',
    category: 'technician_workflow',
    icon: 'CalendarClock',
    color: 'bg-orange-100 text-orange-700',
    events: [
      {
        event: 'Execution Plan Created',
        eventKey: 'execution.plan_created',
        description: 'Fired when an execution plan is generated from an accepted package.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'plan_id', label: 'Plan ID', type: 'string' },
          { key: 'package_id', label: 'Package ID', type: 'string' },
          { key: 'estimated_days', label: 'Estimated Days', type: 'number' },
          { key: 'crew_size', label: 'Crew Size', type: 'number' },
        ],
      },
      {
        event: 'Execution Plan Updated',
        eventKey: 'execution.plan_updated',
        description: 'Fired when an execution plan is modified.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'plan_id', label: 'Plan ID', type: 'string' },
          { key: 'changed_fields', label: 'Changed Fields', type: 'array' },
        ],
      },
      {
        event: 'Execution Plan Approved',
        eventKey: 'execution.plan_approved',
        description: 'Fired when an execution plan is approved for production.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'plan_id', label: 'Plan ID', type: 'string' },
          { key: 'approved_by', label: 'Approved By', type: 'string' },
        ],
      },
      {
        event: 'Daily Plan Generated',
        eventKey: 'execution.daily_plan',
        description: 'Fired when a daily work plan is generated from the execution plan.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'day_number', label: 'Day Number', type: 'number' },
          { key: 'scope_summary', label: 'Scope Summary', type: 'string' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // JOB COMPLETION
  // ─────────────────────────────────────────────
  {
    module: 'Job Completion',
    moduleKey: 'job_completion',
    category: 'technician_workflow',
    icon: 'Flag',
    color: 'bg-green-100 text-green-700',
    events: [
      {
        event: 'Job Completed',
        eventKey: 'job.completed',
        description: 'Fired when a job is marked as completed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'completion_date', label: 'Completion Date', type: 'date' },
          { key: 'actual_hours', label: 'Actual Hours', type: 'number' },
        ],
      },
      {
        event: 'Material Reconciliation Started',
        eventKey: 'job.reconciliation_started',
        description: 'Fired when material reconciliation begins for a completed job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
        ],
      },
      {
        event: 'Material Reconciliation Completed',
        eventKey: 'job.reconciliation_completed',
        description: 'Fired when material reconciliation is completed.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'reconciliation_id', label: 'Reconciliation ID', type: 'string' },
          { key: 'materials_used', label: 'Materials Used', type: 'number' },
          { key: 'materials_returned', label: 'Materials Returned', type: 'number' },
          { key: 'materials_wasted', label: 'Materials Wasted', type: 'number' },
        ],
      },
      {
        event: 'Job Invoice Created',
        eventKey: 'job.invoice_created',
        description: 'Fired when an invoice is generated for a completed job.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'invoice_id', label: 'Invoice ID', type: 'string' },
          { key: 'invoice_amount', label: 'Invoice Amount', type: 'number' },
        ],
      },
      {
        event: 'Job Closed',
        eventKey: 'job.closed',
        description: 'Fired when a job is fully closed after all post-completion steps.',
        fields: [
          ...COMMON_FIELDS, ...JOB_FIELDS,
          { key: 'closed_date', label: 'Closed Date', type: 'date' },
        ],
      },
    ],
  },
];