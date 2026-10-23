/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Workflow Dependency Map — Stage Reopen & Staleness Propagation
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Defines the explicit dependency graph for workflow stages. When a
 *  stage is reopened, all downstream stages (transitive closure of
 *  dependencies) are marked stale — they remain viewable but require
 *  re-completion.
 *
 *  Option-specific staleness (e.g. only "Better" pricing becomes stale)
 *  is handled separately by the existing EstimatePackage stale-marking
 *  system. This module governs stage-level staleness.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Dependency Map Version ──────────────────────────────────────────────
// Increment when the dependency graph changes. The frontend copy must
// match. The backend preview_reopen response includes this version so
// the frontend can detect drift and fail safe.
export const DEPENDENCY_MAP_VERSION = 2;

// ── Stage Keys ──────────────────────────────────────────────────────────
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
} as const;

export type StageKey = typeof STAGE_KEYS[keyof typeof STAGE_KEYS];

// ── Dependency Graph ────────────────────────────────────────────────────
// Each stage maps to the array of stages that directly depend on it.
// "A → B" means B depends on A; reopening A makes B stale.
const DIRECT_DEPENDENCIES: Record<string, string[]> = {
  [STAGE_KEYS.INSPECTION_SETUP]: [
    STAGE_KEYS.INTERIOR_INSPECTION,
    STAGE_KEYS.EXTERIOR_INSPECTION,
  ],
  [STAGE_KEYS.INTERIOR_INSPECTION]: [STAGE_KEYS.INSPECTION_SUMMARY],
  [STAGE_KEYS.EXTERIOR_INSPECTION]: [STAGE_KEYS.INSPECTION_SUMMARY],
  [STAGE_KEYS.INSPECTION_SUMMARY]: [
    STAGE_KEYS.AI_REPORT_SUMMARY,
    STAGE_KEYS.RECOMMENDATION_REVIEW,
  ],
  [STAGE_KEYS.AI_REPORT_SUMMARY]: [STAGE_KEYS.RECOMMENDATION_REVIEW],
  [STAGE_KEYS.RECOMMENDATION_REVIEW]: [
    STAGE_KEYS.REPAIR_SYSTEM_REVIEW,
    STAGE_KEYS.ESTIMATE_PACKAGE_BUILDER,
  ],
  [STAGE_KEYS.REPAIR_SYSTEM_REVIEW]: [STAGE_KEYS.SCOPE_OF_WORK],
  [STAGE_KEYS.ESTIMATE_PACKAGE_BUILDER]: [STAGE_KEYS.SCOPE_OF_WORK],
  [STAGE_KEYS.SCOPE_OF_WORK]: [
    STAGE_KEYS.DYNAMIC_PRICING,
    STAGE_KEYS.FINAL_ESTIMATE_REVIEW,
  ],
  [STAGE_KEYS.DYNAMIC_PRICING]: [STAGE_KEYS.FINAL_ESTIMATE_REVIEW],
  [STAGE_KEYS.FINAL_ESTIMATE_REVIEW]: [STAGE_KEYS.PROPOSAL_BUILDER],
  [STAGE_KEYS.PROPOSAL_BUILDER]: [STAGE_KEYS.CUSTOMER_PRESENTATION],
  [STAGE_KEYS.CUSTOMER_PRESENTATION]: [STAGE_KEYS.CUSTOMER_DECISION],
  [STAGE_KEYS.CUSTOMER_DECISION]: [STAGE_KEYS.EXECUTION_PLAN],
  [STAGE_KEYS.EXECUTION_PLAN]: [STAGE_KEYS.COMPLETE_APPOINTMENT],
  [STAGE_KEYS.COMPLETE_APPOINTMENT]: [],
};

/**
 * Computes the full transitive closure of downstream stages for a
 * given stage key. These are all stages that become stale when the
 * given stage is reopened.
 */
export function computeDownstreamStages(stageKey: string): string[] {
  const visited = new Set<string>();
  const queue = [stageKey];

  while (queue.length > 0) {
    const current = queue.shift()!;
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
 * Returns the direct downstream stages (one level) for a stage.
 */
export function getDirectDownstream(stageKey: string): string[] {
  return DIRECT_DEPENDENCIES[stageKey] || [];
}

// ── Permission Matrix ──────────────────────────────────────────────────
// Defines who can reopen each stage based on the workflow phase.
// The backend function enforces these rules server-side.

export type WorkflowPhase =
  | 'pre_presentation'
  | 'post_presentation_pre_acceptance'
  | 'post_acceptance'
  | 'post_scheduling'
  | 'post_commencement';

export interface ReopenPermission {
  canReopen: boolean;
  requiresManagerApproval: boolean;
  reason: string;
}

/**
 * Determines whether a user role can reopen a specific stage,
 * given the current workflow phase.
 */
export function canReopenStage(
  stageKey: string,
  userRole: string,
  isLead: boolean,
  phase: WorkflowPhase,
  isAssignedTechnician: boolean
): ReopenPermission {
  // Admins and owners can always reopen (with appropriate phase awareness)
  if (userRole === 'admin' || userRole === 'owner') {
    return {
      canReopen: true,
      requiresManagerApproval: phase === 'post_acceptance' || phase === 'post_scheduling' || phase === 'post_commencement',
      reason: phase === 'post_acceptance'
        ? 'Accepted proposal revision requires manager approval'
        : phase === 'post_scheduling'
          ? 'Scheduled job revision requires manager approval'
          : phase === 'post_commencement'
            ? 'Work-in-progress revision requires manager approval (change order)'
            : '',
    };
  }

  // Managers can reopen operational stages
  if (userRole === 'manager' || userRole === 'operations_manager') {
    if (phase === 'pre_presentation') {
      return { canReopen: true, requiresManagerApproval: false, reason: '' };
    }
    if (phase === 'post_presentation_pre_acceptance') {
      return { canReopen: true, requiresManagerApproval: false, reason: '' };
    }
    if (phase === 'post_acceptance' || phase === 'post_scheduling' || phase === 'post_commencement') {
      return { canReopen: true, requiresManagerApproval: true, reason: 'Post-acceptance revision requires manager approval' };
    }
  }

  // Lead technicians can reopen pre-presentation operational stages
  if (isLead) {
    if (phase === 'pre_presentation') {
      // Inspection reopening requires lead/manager
      const isInspectionStage = [
        STAGE_KEYS.INSPECTION_SETUP,
        STAGE_KEYS.INTERIOR_INSPECTION,
        STAGE_KEYS.EXTERIOR_INSPECTION,
        STAGE_KEYS.INSPECTION_SUMMARY,
        STAGE_KEYS.AI_REPORT_SUMMARY,
      ].includes(stageKey as any);

      if (isInspectionStage) {
        return { canReopen: true, requiresManagerApproval: false, reason: '' };
      }
      return { canReopen: false, requiresManagerApproval: false, reason: 'Lead technicians can only reopen inspection stages before presentation' };
    }
    return { canReopen: false, requiresManagerApproval: true, reason: 'Post-presentation reopen requires manager approval' };
  }

  // Assigned technicians can reopen their own pre-presentation work
  if (isAssignedTechnician && phase === 'pre_presentation') {
    const operationalStages = [
      STAGE_KEYS.INTERIOR_INSPECTION,
      STAGE_KEYS.EXTERIOR_INSPECTION,
      STAGE_KEYS.INSPECTION_SETUP,
    ];
    if (operationalStages.includes(stageKey as any)) {
      return { canReopen: true, requiresManagerApproval: false, reason: '' };
    }
    return { canReopen: false, requiresManagerApproval: false, reason: 'Only operational inspection stages can be reopened by the assigned technician' };
  }

  // Office/CSR can view but not reopen
  if (userRole === 'office' || userRole === 'csr') {
    return { canReopen: false, requiresManagerApproval: true, reason: 'Office/CSR users cannot reopen workflow stages — request a manager' };
  }

  return { canReopen: false, requiresManagerApproval: false, reason: 'Insufficient permissions to reopen this stage' };
}

/**
 * Determines the workflow phase from the current workflow state.
 */
export function determineWorkflowPhase(
  stageStates: Record<string, any>,
  customerDecision: string,
  estimateStatus: string
): WorkflowPhase {
  const isCompleted = (key: string) =>
    stageStates[key]?.status === 'completed';

  // Post-commencement: execution plan is completed or job is in progress
  if (isCompleted(STAGE_KEYS.EXECUTION_PLAN) || isCompleted(STAGE_KEYS.COMPLETE_APPOINTMENT)) {
    return 'post_commencement';
  }

  // Post-scheduling: estimate is ready_for_scheduling or scheduled
  if (['ready_for_scheduling', 'scheduled'].includes(estimateStatus)) {
    return 'post_scheduling';
  }

  // Post-acceptance: customer accepted
  if (['accepted', 'perform_work_today', 'schedule_for_later'].includes(customerDecision)) {
    return 'post_acceptance';
  }

  // Post-presentation: presentation was completed
  if (isCompleted(STAGE_KEYS.CUSTOMER_PRESENTATION)) {
    return 'post_presentation_pre_acceptance';
  }

  // Pre-presentation: everything else
  return 'pre_presentation';
}

// ── Staleness Reason Builder ────────────────────────────────────────────
/**
 * Builds a human-readable stale reason for a stage.
 */
export function buildStaleReason(
  stageKey: string,
  reopenedStageKey: string,
  reopenedStageLabel: string,
  reopenedByName: string
): string {
  if (stageKey === reopenedStageKey) {
    return `Reopened by ${reopenedByName}`;
  }

  const downstream = computeDownstreamStages(reopenedStageKey);
  if (downstream.includes(stageKey)) {
    return `Stale because ${reopenedStageLabel} was reopened by ${reopenedByName}`;
  }

  return 'Stale — upstream stage was reopened';
}

/**
 * Returns the stages that should be marked stale when a stage is reopened.
 * This is the transitive closure of downstream dependencies, EXCLUDING
 * the reopened stage itself (which becomes "reopened", not "stale").
 */
export function getStagesToMarkStale(stageKey: string): string[] {
  return computeDownstreamStages(stageKey).filter(s => s !== stageKey);
}

// ── Immutability Helpers ────────────────────────────────────────────────
// A record is "immutable" once it has been presented to or accepted by
// the customer. Immutable records must NEVER be mutated by a reopen.
// The reopen stores staleness in the WorkflowRevision overlay (stage_states)
// and creates new draft versions only when the user re-edits and saves.

/**
 * Returns true when an EstimatePackage has been presented or accepted and
 * must not be mutated. Only draft (unpresented) packages may be updated
 * directly.
 */
export function isEstimatePackageImmutable(pkg: any): boolean {
  if (!pkg) return false;
  if (pkg.superseded_by_id) return true;       // already superseded — preserve
  if (pkg.is_selected === true) return true;    // customer accepted
  if (['presented', 'accepted'].includes(pkg.status)) return true;
  return false;
}

/**
 * Returns true when a PricingCalculationSnapshot has been approved/locked
 * and must not be mutated. Draft snapshots may be updated directly.
 */
export function isPricingSnapshotImmutable(snap: any): boolean {
  if (!snap) return false;
  if (snap.supersedes_snapshot_id) return false;  // it's already a new draft
  if (['approved', 'locked', 'superseded'].includes(snap.calculation_status)) return true;
  return false;
}

/**
 * Returns true when a CustomerPresentation has been completed or the
 * customer has made a decision. Completed presentations must be preserved;
 * a new presentation record is created for the next version.
 */
export function isCustomerPresentationImmutable(pres: any): boolean {
  if (!pres) return false;
  if (pres.presentation_status === 'complete') return true;
  if (['perform_work_today', 'schedule_for_later'].includes(pres.customer_decision)) return true;
  return false;
}

/**
 * Returns true when a ScopeOfWork has been approved. Approved scopes are
 * preserved; a new draft scope is created when the user re-generates.
 */
export function isScopeImmutable(scope: any): boolean {
  if (!scope) return false;
  if (scope.superseded_by_id) return true;
  if (scope.status === 'approved') return true;
  return false;
}

// ── Precise Scope Invalidation ──────────────────────────────────────────
// When reopening an estimate/scope stage, only the packages that contain
// the changed finding/recommendation should be affected. Changing "Good"
// must NOT stale "Better" or "Best" unless they share the exact changed
// finding/recommendation.
//
// When trace data is incomplete (a package has no traceable_recommendation_ids,
// or the caller provided no affected_recommendation_ids), the engine returns
// a `traceability_incomplete` flag. The caller must surface a visible warning
// and use the safest defensible fallback (affect all active packages) rather
// than silently declaring every option unaffected.

export interface AffectedPackagesResult {
  affected_package_ids: string[];
  traceability_complete: boolean;
  traceability_incomplete_reason?: string;
  packages_missing_trace: string[];
}

/**
 * Returns the package IDs that contain at least one of the affected
 * recommendation IDs, plus a traceability assessment.
 *
 * - If affectedRecommendationIds is empty/null: traceability is INCOMPLETE.
 *   The safest defensible fallback is to affect ALL active packages.
 *   Returns traceability_complete=false with the reason.
 * - If some packages have no traceable_recommendation_ids: those packages
 *   are flagged in packages_missing_trace. traceability is INCOMPLETE.
 * - Only when every active package has non-empty trace data AND at least
 *   one affected recommendation was provided is traceability_complete=true.
 */
export function getAffectedPackageIdsWithTraceability(
  packages: any[],
  affectedRecommendationIds: string[] | null | undefined
): AffectedPackagesResult {
  const active = packages.filter(p => !p.superseded_by_id);
  const packagesMissingTrace: string[] = [];

  for (const p of active) {
    let traceableIds: any[] = [];
    try {
      traceableIds = JSON.parse(p.traceable_recommendation_ids || '[]');
    } catch { traceableIds = []; }
    if (!Array.isArray(traceableIds) || traceableIds.length === 0) {
      packagesMissingTrace.push(p.id);
    }
  }

  // No specific recommendations provided — traceability is incomplete
  if (!affectedRecommendationIds || affectedRecommendationIds.length === 0) {
    return {
      affected_package_ids: active.map(p => p.id),
      traceability_complete: false,
      traceability_incomplete_reason: 'No affected recommendation IDs were provided. Cannot determine precise scope — falling back to affecting all active packages.',
      packages_missing_trace: packagesMissingTrace,
    };
  }

  // Some packages have no trace data — traceability is incomplete
  if (packagesMissingTrace.length > 0) {
    return {
      affected_package_ids: active.map(p => p.id),
      traceability_complete: false,
      traceability_incomplete_reason: `${packagesMissingTrace.length} package(s) are missing traceable_recommendation_ids. Cannot prove isolation — falling back to affecting all active packages.`,
      packages_missing_trace: packagesMissingTrace,
    };
  }

  // Traceability is complete — affect only packages tracing to changed recommendations
  const affectedSet = new Set(affectedRecommendationIds);
  const affectedIds = active
    .filter(p => {
      let traceableIds: string[] = [];
      try {
        traceableIds = JSON.parse(p.traceable_recommendation_ids || '[]');
      } catch { traceableIds = []; }
      return traceableIds.some(id => affectedSet.has(id));
    })
    .map(p => p.id);

  return {
    affected_package_ids: affectedIds,
    traceability_complete: true,
    packages_missing_trace: [],
  };
}

/**
 * Backward-compatible wrapper. Returns only the affected package IDs.
 * Prefer getAffectedPackageIdsWithTraceability for new code.
 */
export function getAffectedPackageIds(
  packages: any[],
  affectedRecommendationIds: string[] | null | undefined
): string[] {
  return getAffectedPackageIdsWithTraceability(packages, affectedRecommendationIds)
    .affected_package_ids;
}

/**
 * Classifies each package as immutable (preserve + new draft) or draft
 * (can mark stale directly). Returns { immutable: string[], draft: string[] }.
 */
export function classifyPackagesByImmutability(packages: any[]): { immutable: any[]; draft: any[] } {
  return packages.reduce(
    (acc, pkg) => {
      if (isEstimatePackageImmutable(pkg)) acc.immutable.push(pkg);
      else acc.draft.push(pkg);
      return acc;
    },
    { immutable: [] as any[], draft: [] as any[] }
  );
}

// ── Downstream Validation for clear_staleness ───────────────────────────
// Before clearing a stale flag, the server must revalidate that the actual
// downstream records are current. Clearing staleness merely because the user
// clicked "Refresh" or "Complete" is not sufficient — the underlying data
// must be verified.

export interface DownstreamValidationResult {
  valid: boolean;
  unresolved_requirements: string[];
}

/**
 * Validates that downstream records are current before clearing a stale flag.
 *
 * For pricing stages: the latest PricingCalculationSnapshot must not be stale.
 * For scope stages: the ScopeOfWork must be generated/approved and not stale.
 * For presentation stages: the CustomerPresentation must be regenerated.
 * For scheduling stages: the estimate must be ready_for_scheduling or scheduled.
 */
export function validateDownstreamRecords(
  stageKey: string,
  stageStates: Record<string, any>,
  related: {
    estimate?: any;
    packages?: any[];
    scopes?: any[];
    snapshots?: any[];
    presentations?: any[];
  }
): DownstreamValidationResult {
  const unresolved: string[] = [];

  // ── Check that no upstream stage is still reopened ──
  const allStages = Object.entries(stageStates);
  const reopenedUpstream = allStages.filter(([key, val]: [string, any]) =>
    val?.status === 'reopened' && getStagesToMarkStale(key).includes(stageKey)
  );
  if (reopenedUpstream.length > 0) {
    for (const [key] of reopenedUpstream) {
      unresolved.push(`Upstream stage '${getStageLabelForValidation(key)}' is still reopened`);
    }
  }

  // ── Stage-specific validations ──
  if (stageKey === STAGE_KEYS.DYNAMIC_PRICING || stageKey === STAGE_KEYS.FINAL_ESTIMATE_REVIEW) {
    // Pricing snapshot must not be stale
    const latestSnapshot = related.snapshots?.[0];
    if (latestSnapshot?.calculation_status === 'stale') {
      unresolved.push('Pricing snapshot is still stale — recalculate pricing before clearing staleness');
    }
  }

  if (stageKey === STAGE_KEYS.SCOPE_OF_WORK || stageKey === STAGE_KEYS.DYNAMIC_PRICING) {
    // Scope must be generated/approved
    const latestScope = related.scopes?.[0];
    if (latestScope && !['generated', 'approved'].includes(latestScope.status)) {
      unresolved.push(`Scope of Work is in '${latestScope.status}' status — regenerate before clearing staleness`);
    }
  }

  if (stageKey === STAGE_KEYS.CUSTOMER_PRESENTATION || stageKey === STAGE_KEYS.CUSTOMER_DECISION) {
    // Presentation must be regenerated (not stale)
    const latestPres = related.presentations?.[0];
    if (latestPres && (latestPres as any).presentation_status === 'complete' && (latestPres as any).presentation_version === undefined) {
      // Old presentation without version — may need regeneration
      // This is a soft check; the actual staleness is in proposal_stale on packages
    }
    // Check if any active package has proposal_stale=true
    const activePkgs = (related.packages || []).filter((p: any) => !p.superseded_by_id);
    const staleProposalPkgs = activePkgs.filter((p: any) => p.proposal_stale === true);
    if (staleProposalPkgs.length > 0) {
      unresolved.push(`${staleProposalPkgs.length} package(s) have stale proposals — regenerate proposals before clearing presentation staleness`);
    }
  }

  if (stageKey === STAGE_KEYS.EXECUTION_PLAN) {
    // Estimate must be in a scheduling-ready state if execution plan is stale
    const est = related.estimate;
    if (est && !['ready_for_scheduling', 'scheduled', 'approved'].includes(est.status)) {
      unresolved.push(`Estimate is in '${est.status}' status — must be ready for scheduling before clearing execution plan staleness`);
    }
  }

  return {
    valid: unresolved.length === 0,
    unresolved_requirements: unresolved,
  };
}

function getStageLabelForValidation(stageKey: string): string {
  const labels: Record<string, string> = {
    [STAGE_KEYS.INSPECTION_SETUP]: 'Inspection Setup',
    [STAGE_KEYS.INTERIOR_INSPECTION]: 'Interior Inspection',
    [STAGE_KEYS.EXTERIOR_INSPECTION]: 'Exterior Inspection',
    [STAGE_KEYS.INSPECTION_SUMMARY]: 'Inspection Summary',
    [STAGE_KEYS.AI_REPORT_SUMMARY]: 'AI Report Summary',
    [STAGE_KEYS.RECOMMENDATION_REVIEW]: 'Recommendation Review',
    [STAGE_KEYS.REPAIR_SYSTEM_REVIEW]: 'Repair System Review',
    [STAGE_KEYS.ESTIMATE_PACKAGE_BUILDER]: 'Estimate Package Builder',
    [STAGE_KEYS.SCOPE_OF_WORK]: 'Scope of Work',
    [STAGE_KEYS.DYNAMIC_PRICING]: 'Dynamic Pricing',
    [STAGE_KEYS.FINAL_ESTIMATE_REVIEW]: 'Final Estimate Review',
    [STAGE_KEYS.PROPOSAL_BUILDER]: 'Proposal Builder',
    [STAGE_KEYS.CUSTOMER_PRESENTATION]: 'Customer Presentation',
    [STAGE_KEYS.CUSTOMER_DECISION]: 'Customer Decision',
    [STAGE_KEYS.EXECUTION_PLAN]: 'Execution Plan',
    [STAGE_KEYS.COMPLETE_APPOINTMENT]: 'Complete Appointment',
  };
  return labels[stageKey] || stageKey;
}