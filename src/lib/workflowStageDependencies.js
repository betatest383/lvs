/**
 * Frontend-compatible workflow dependency map.
 * Mirrors base44/shared/workflowDependencies.ts for client-side use.
 *
 * IMPORTANT: The backend (base44/shared/workflowDependencies.ts) is the
 * AUTHORITATIVE dependency map. This file is for DISPLAY ONLY — it must
 * never be used for logic decisions (which stages to mark stale, permission
 * checks, etc.). The backend preview_reopen action returns the authoritative
 * impact assessment; the frontend dialog renders that response.
 *
 * DEPENDENCY_MAP_VERSION must match the backend. If the backend's
 * preview_reopen response returns a different version, the frontend must
 * fail safe — show a warning and refuse to proceed with local computation.
 */
export const DEPENDENCY_MAP_VERSION = 2;

export const STAGE_KEYS = {
  INSPECTION_SETUP: 'inspection_setup',
  INTERIOR_INSPECTION: 'interior_inspection',
  EXTERIOR_INSPECTION: 'exterior_inspection',
  INSPECTION_SUMMARY: 'inspection_summary',
  AI_REPORT_SUMMARY: 'ai_report_summary',
  RECOMMENDATION_REVIEW: 'recommendation_review',
  REPAIR_SYSTEM_REVIEW: 'repair_system_review',
  ESTIMATE_PACKAGE_BUILDER: 'estimate_package_builder',
  SCOPE_OF_WORK: 'scope_of_work',
  DYNAMIC_PRICING: 'dynamic_pricing',
  FINAL_ESTIMATE_REVIEW: 'final_estimate_review',
  PROPOSAL_BUILDER: 'proposal_builder',
  CUSTOMER_PRESENTATION: 'customer_presentation',
  CUSTOMER_DECISION: 'customer_decision',
  EXECUTION_PLAN: 'execution_plan',
  COMPLETE_APPOINTMENT: 'complete_appointment',
};

const DIRECT_DEPENDENCIES = {
  inspection_setup: ['interior_inspection', 'exterior_inspection'],
  interior_inspection: ['inspection_summary'],
  exterior_inspection: ['inspection_summary'],
  inspection_summary: ['ai_report_summary', 'recommendation_review'],
  ai_report_summary: ['recommendation_review'],
  recommendation_review: ['repair_system_review', 'estimate_package_builder'],
  repair_system_review: ['scope_of_work'],
  estimate_package_builder: ['scope_of_work'],
  scope_of_work: ['dynamic_pricing', 'final_estimate_review'],
  dynamic_pricing: ['final_estimate_review'],
  final_estimate_review: ['proposal_builder'],
  proposal_builder: ['customer_presentation'],
  customer_presentation: ['customer_decision'],
  customer_decision: ['execution_plan'],
  execution_plan: ['complete_appointment'],
  complete_appointment: [],
};

export const STAGE_LABELS = {
  inspection_setup: 'Inspection Setup',
  interior_inspection: 'Interior Inspection',
  exterior_inspection: 'Exterior Inspection',
  inspection_summary: 'Inspection Summary',
  ai_report_summary: 'AI Report Summary',
  recommendation_review: 'Recommendation Review',
  repair_system_review: 'Repair System Review',
  estimate_package_builder: 'Estimate Package Builder',
  scope_of_work: 'Scope of Work',
  dynamic_pricing: 'Dynamic Pricing',
  final_estimate_review: 'Final Estimate Review',
  proposal_builder: 'Proposal Builder',
  customer_presentation: 'Customer Presentation',
  customer_decision: 'Customer Decision',
  execution_plan: 'Execution Plan',
  complete_appointment: 'Complete Appointment',
};

/**
 * Computes the full transitive closure of downstream stages.
 */
export function computeDownstreamStages(stageKey) {
  const visited = new Set();
  const queue = [stageKey];

  while (queue.length > 0) {
    const current = queue.shift();
    const deps = DIRECT_DEPENDENCIES[current] || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Returns stages to mark stale (downstream minus the reopened stage itself).
 */
export function getStagesToMarkStale(stageKey) {
  return computeDownstreamStages(stageKey).filter((s) => s !== stageKey);
}

/**
 * Determines the workflow phase from stage states and customer decision.
 */
export function determineWorkflowPhase(stageStates, customerDecision, estimateStatus) {
  const isCompleted = (key) => stageStates[key]?.status === 'completed';

  if (isCompleted('execution_plan') || isCompleted('complete_appointment')) {
    return 'post_commencement';
  }
  if (['ready_for_scheduling', 'scheduled'].includes(estimateStatus)) {
    return 'post_scheduling';
  }
  if (['accepted', 'perform_work_today', 'schedule_for_later'].includes(customerDecision)) {
    return 'post_acceptance';
  }
  if (isCompleted('customer_presentation')) {
    return 'post_presentation_pre_acceptance';
  }
  return 'pre_presentation';
}

/**
 * Fail-safe check: if the backend's dependency_map_version differs from
 * the frontend's DEPENDENCY_MAP_VERSION, returns false. The caller must
 * refuse to use local dependency computation and rely solely on the
 * backend preview_reopen response.
 *
 * @param {number} backendVersion - The dependency_map_version from the preview_reopen response
 * @returns {boolean} true if versions match (safe to use local map for display), false otherwise
 */
export function isDependencyMapCompatible(backendVersion) {
  return Number(backendVersion) === DEPENDENCY_MAP_VERSION;
}