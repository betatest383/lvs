/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AR-001 — Single Authoritative Workflow Resolver
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  This module is the ONLY component permitted to determine:
 *    - workflow version (useV2Workflow)
 *    - feature flag behavior
 *    - current stage, next stage, stage status, stage availability
 *    - stage completion, locking, skipping
 *    - workflow metadata (noRecommendations, hasDeficiencies, etc.)
 *    - workflow routing, prerequisites
 *
 *  Approved decision makers:
 *    computeEffectiveStages()  → produces the canonical stages + __meta
 *    computeNextAction()       → produces the canonical next action
 *    getWorkflowMeta()         → returns stages.__meta (canonical metadata)
 *    computeProgressStep()     → returns canonical progress index
 *    computeCurrentStageKey()  → returns canonical current stage
 *
 *  All UI components (JobHub, WorkflowEngine, SmartNextAction, etc.) MUST
 *  consume the canonical object via wfMeta = getWorkflowMeta(stages).
 *  No component may independently calculate workflow state or call
 *  isEstimatePackageWorkflowEnabled(job).
 *
 *  Guiding principle:
 *    Job Hub displays workflow. It does not determine workflow.
 *    Workflow Engine determines workflow. It does not render workflow.
 * ═══════════════════════════════════════════════════════════════════════
 */
import {
  Lock, Circle, UserCheck, Play, Eye, CheckCircle2, SkipForward, CheckCircle,
  Settings, Home, TreePine, FileText, Wrench, DollarSign, Presentation,
  Users, ClipboardList, Flag, ArrowRight, GitBranch, GitMerge, Sparkles,
  ClipboardCheck, FileCheck, Layers, Package, Calculator,
  AlertTriangle, RotateCcw, History,
} from 'lucide-react';

export const STAGE_STATES = {
  locked: {
    label: 'Locked',
    icon: Lock,
    badgeClass: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
    borderClass: 'border-muted',
  },
  available: {
    label: 'Available',
    icon: Circle,
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
    borderClass: 'border-blue-300',
  },
  assigned: {
    label: 'Assigned',
    icon: UserCheck,
    badgeClass: 'bg-indigo-100 text-indigo-700',
    dotClass: 'bg-indigo-500',
    borderClass: 'border-indigo-300',
  },
  in_progress: {
    label: 'In Progress',
    icon: Play,
    badgeClass: 'bg-amber-100 text-amber-700',
    dotClass: 'bg-amber-500',
    borderClass: 'border-amber-300',
  },
  needs_lead_review: {
    label: 'Needs Lead Review',
    icon: Eye,
    badgeClass: 'bg-purple-100 text-purple-700',
    dotClass: 'bg-purple-500',
    borderClass: 'border-purple-300',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    badgeClass: 'bg-green-100 text-green-700',
    dotClass: 'bg-green-500',
    borderClass: 'border-green-300',
  },
  skipped: {
    label: 'Skipped',
    icon: SkipForward,
    badgeClass: 'bg-gray-100 text-gray-500',
    dotClass: 'bg-gray-400',
    borderClass: 'border-gray-200',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    badgeClass: 'bg-green-100 text-green-800',
    dotClass: 'bg-green-600',
    borderClass: 'border-green-400',
  },
  // ── Revision-aware states (added for controlled reopening) ──
  stale: {
    label: 'Stale',
    icon: AlertTriangle,
    badgeClass: 'bg-orange-100 text-orange-700',
    dotClass: 'bg-orange-500',
    borderClass: 'border-orange-300',
  },
  reopened: {
    label: 'Reopened',
    icon: RotateCcw,
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
    borderClass: 'border-blue-300',
  },
  superseded: {
    label: 'Superseded',
    icon: History,
    badgeClass: 'bg-gray-200 text-gray-600',
    dotClass: 'bg-gray-400',
    borderClass: 'border-gray-300',
  },
  blocked: {
    label: 'Blocked',
    icon: Lock,
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-300',
  },
};

export const WORKFLOW_STAGES = [
  {
    key: 'inspection_setup',
    label: 'Inspection Setup',
    shortLabel: 'Setup',
    icon: Settings,
    path: '/tech/inspection-setup?job_id=',
    isModule: false,
    description: 'Property profile, inspection level, and module selection',
  },
  {
    key: 'interior_inspection',
    label: 'Interior Inspection',
    shortLabel: 'Interior',
    icon: Home,
    path: '/tech/inspection?job_id=',
    isModule: true,
    moduleKey: 'interior',
    branchGroup: 'inspection',
    description: 'Interior chimney and fireplace inspection',
  },
  {
    key: 'exterior_inspection',
    label: 'Exterior Inspection',
    shortLabel: 'Exterior',
    icon: TreePine,
    path: '/tech/exterior-inspection?job_id=',
    isModule: true,
    moduleKey: 'exterior',
    branchGroup: 'inspection',
    description: 'Exterior chimney and roof inspection',
  },
  {
    key: 'inspection_summary',
    label: 'Inspection Summary',
    shortLabel: 'Summary',
    icon: FileText,
    isModule: false,
    mergePoint: true,
    description: 'Review all findings before generating recommendations',
  },
  {
    key: 'ai_report_summary',
    label: 'AI Report Summary',
    shortLabel: 'AI Summary',
    icon: Sparkles,
    isModule: false,
    description: 'AI-assisted inspection report summary — review, edit, and approve before customer report',
  },
  {
    key: 'recommendation_review',
    label: 'Recommendation Review',
    shortLabel: 'Rec Review',
    icon: ClipboardCheck,
    isModule: false,
    description: 'Review each deficiency and assign a disposition before proceeding',
  },
  {
    key: 'repair_system_review',
    label: 'Repair System Review',
    shortLabel: 'Repairs',
    icon: Wrench,
    isModule: false,
    v2Hidden: true,
    description: 'Review repair system recommendations (legacy only — v2 routes directly to Estimate Package Builder)',
  },
  {
    key: 'estimate_package_builder',
    label: 'Estimate Package Builder',
    shortLabel: 'Packages',
    icon: Package,
    isModule: false,
    description: 'Assemble estimate items into customer-facing packages (Good/Better/Best) before scope of work',
    startLabel: 'Start Package Builder',
    continueLabel: 'Continue Package Builder',
  },
  {
    key: 'scope_of_work',
    label: 'Scope of Work',
    shortLabel: 'Scope',
    icon: FileCheck,
    isModule: false,
    description: 'Collect operational details per package — labor, equipment, job conditions, materials',
    startLabel: 'Start Scope of Work',
    continueLabel: 'Continue Scope of Work',
  },
  {
    key: 'dynamic_pricing',
    label: 'Dynamic Pricing',
    shortLabel: 'Pricing',
    icon: Calculator,
    isModule: false,
    description: 'Calculate final pricing from scope of work, crew, equipment, margins, and shared mobilization efficiencies',
    startLabel: 'Calculate Pricing',
    continueLabel: 'Continue Pricing',
  },
  {
    key: 'final_estimate_review',
    label: 'Final Estimate Review',
    shortLabel: 'Estimate',
    icon: DollarSign,
    isModule: false,
    description: 'Review finalized packages after dynamic pricing — selling price, gross profit, margin, commission impact',
    startLabel: 'Review Final Estimate',
    continueLabel: 'Continue Estimate Review',
  },
  {
    key: 'proposal_builder',
    label: 'Proposal Builder',
    shortLabel: 'Proposal',
    icon: Layers,
    isModule: false,
    description: 'Group configured estimate items into Good / Better / Best proposal packages for customer presentation',
  },
  {
    key: 'customer_presentation',
    label: 'Customer Presentation',
    shortLabel: 'Present',
    icon: Presentation,
    isModule: false,
    description: 'Present findings, recommendations, and proposal options to customer',
    startLabel: 'Start Presentation',
    continueLabel: 'Continue Presentation',
  },
  {
    key: 'customer_decision',
    label: 'Customer Decision',
    shortLabel: 'Decision',
    icon: Users,
    isModule: false,
    description: 'Capture customer acceptance or declination',
    startLabel: 'Record Customer Decision',
    continueLabel: 'Record Customer Decision',
  },
  {
    key: 'execution_plan',
    label: 'Execution Plan',
    shortLabel: 'Exec Plan',
    icon: ClipboardList,
    isModule: false,
    description: 'Field execution plan — consumes the generated Scope of Work. Only active when customer accepts work.',
  },
  {
    key: 'complete_appointment',
    label: 'Complete Appointment',
    shortLabel: 'Complete',
    icon: Flag,
    isModule: false,
    description: 'Finalize and close the appointment',
  },
];

export const MODULE_KEYS = ['interior', 'exterior'];

export function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Computes the effective state of each workflow stage by combining
 * stored workflow state with derived data from existing entities.
 */
export function computeEffectiveStages(workflow, derived) {
  const { inspectionSetup, submissions, findings, repairRecs, estimate } = derived;
  const stageStates = safeParse(workflow?.stage_states, {});
  const moduleAssignments = safeParse(workflow?.module_assignments, {});
  const reviewDecisions = safeParse(workflow?.review_decisions, {});
  const selectedModules = safeParse(workflow?.selected_modules, ['interior', 'exterior']);
  const customerDecision = workflow?.customer_decision || 'pending';

  const result = {};
  const now = () => new Date().toISOString();

  // 1. Inspection Setup
  const setupComplete = inspectionSetup?.status === 'complete';
  result.inspection_setup = {
    status: setupComplete ? 'completed' : (stageStates.inspection_setup?.status === 'in_progress' ? 'in_progress' : 'available'),
    started_at: stageStates.inspection_setup?.started_at,
    completed_at: setupComplete ? (stageStates.inspection_setup?.completed_at || inspectionSetup?.completed_at) : null,
    completed_by: stageStates.inspection_setup?.completed_by,
    completed_by_name: stageStates.inspection_setup?.completed_by_name,
  };

  const setupDone = result.inspection_setup.status === 'completed';

  // 2 & 3. Inspection modules (interior, exterior)
  for (const moduleKey of MODULE_KEYS) {
    const stageKey = `${moduleKey}_inspection`;
    const isSelected = selectedModules.includes(moduleKey);
    // CRITICAL: Prefer submitted/reviewed submissions over drafts.
    // Using .find() alone returns the FIRST record, which may be an old draft
    // if duplicate InspectionSubmission records exist for the same job.
    const submission = submissions.find(s => s.inspection_type === moduleKey && ['submitted', 'reviewed'].includes(s.status))
      || submissions.find(s => s.inspection_type === moduleKey);
    const assignment = moduleAssignments[moduleKey] || {};
    const review = reviewDecisions[moduleKey];

    if (!isSelected) {
      result[stageKey] = { status: 'skipped', skipReason: 'Not selected in setup' };
      continue;
    }

    // PRIMARY: Review rejection takes precedence (technician must redo)
    if (review?.decision === 'rejected') {
      result[stageKey] = {
        status: 'in_progress',
        assigned_to: assignment.assigned_to_email,
        assigned_to_name: assignment.assigned_to_name,
        started_at: assignment.started_at,
        photos: assignment.photos || 0,
        findings: assignment.findings || 0,
        completion_pct: assignment.completion_pct || 0,
        last_updated: assignment.last_updated,
        reviewRejected: true,
        reviewNotes: review.notes,
      };
    }
    // PRIMARY: Submission status is the primary source of truth for completion.
    // If the authoritative submission is submitted, the inspection stage is complete.
    else if (submission && ['submitted', 'reviewed', 'approved', 'complete'].includes(submission.status)) {
      result[stageKey] = {
        status: 'completed',
        assigned_to: assignment.assigned_to_email,
        assigned_to_name: assignment.assigned_to_name,
        started_at: assignment.started_at || submission?.date_started,
        completed_at: submission?.date_submitted || review?.reviewed_at || stageStates[stageKey]?.completed_at,
        photos: assignment.photos || submission?.photos?.length || 0,
        findings: assignment.findings || 0,
        completion_pct: 100,
        last_updated: assignment.last_updated || submission?.date_submitted,
        submission_id: submission?.id,
      };
    }
    // Fallback: Review approval or persisted completed state
    else if (review?.decision === 'approved' || stageStates[stageKey]?.status === 'completed') {
      result[stageKey] = {
        status: 'completed',
        assigned_to: assignment.assigned_to_email,
        assigned_to_name: assignment.assigned_to_name,
        started_at: assignment.started_at || stageStates[stageKey]?.started_at,
        completed_at: review?.reviewed_at || stageStates[stageKey]?.completed_at,
        photos: assignment.photos || 0,
        findings: assignment.findings || 0,
        completion_pct: 100,
        last_updated: assignment.last_updated,
      };
    } else if (assignment.assigned_to_email || submission) {
      result[stageKey] = {
        status: 'in_progress',
        assigned_to: assignment.assigned_to_email,
        assigned_to_name: assignment.assigned_to_name,
        started_at: assignment.started_at || submission?.date_started,
        photos: assignment.photos || submission?.photos?.length || 0,
        findings: assignment.findings || 0,
        completion_pct: assignment.completion_pct || (submission ? 50 : 0),
        last_updated: assignment.last_updated || submission?.date_started,
      };
    } else {
      result[stageKey] = { status: setupDone ? 'available' : 'locked' };
    }
  }

  // Check if all selected modules are approved/completed/skipped
  const allModulesDone = MODULE_KEYS.every(mk => {
    const sk = `${mk}_inspection`;
    return ['completed', 'skipped'].includes(result[sk]?.status);
  });

  // Compute all deficiencies once — used by both inspection_summary and recommendation_review
  const allDeficiencies = [...(findings || []).filter(f => f.is_deficiency !== false), ...(derived.legacyFindings || [])];
  const hasDeficiencies = allDeficiencies.length > 0;

  // 4. Inspection Summary — checks all deficiencies (InspectionFinding + legacy Finding)
  if (stageStates.inspection_summary?.status === 'completed' || (allDeficiencies.length > 0 && allModulesDone)) {
    result.inspection_summary = { status: 'completed', ...stageStates.inspection_summary };
  } else {
    result.inspection_summary = { status: allModulesDone ? 'available' : 'locked' };
  }

  const summaryDone = result.inspection_summary.status === 'completed';

  // 4.5. AI Report Summary
  const report = derived.inspectionReport;
  const aiSummaryApproved = report?.ai_summary_status === 'approved';
  if (stageStates.ai_report_summary?.status === 'completed' || (aiSummaryApproved && summaryDone)) {
    result.ai_report_summary = { status: 'completed', ...stageStates.ai_report_summary };
  } else {
    result.ai_report_summary = { status: summaryDone ? 'available' : 'locked' };
  }

  const aiSummaryDone = result.ai_report_summary.status === 'completed';

  // 4.8. Recommendation Review
  const recReview = derived.recommendationReview;
  const recReviewItems = derived.recommendationReviewItems || [];
  const recReviewEstimateRequired = recReviewItems.filter(i => i.estimate_required).length;

  // Only skip when the inspection is actually complete (aiSummaryDone) and no deficiencies
  // were found. A new job with no findings yet must NOT skip — the absence of findings
  // means the inspection hasn't been done, not that it's clean.
  if (aiSummaryDone && !hasDeficiencies) {
    result.recommendation_review = { status: 'skipped', skipReason: 'No deficiencies found — clean inspection' };
  } else if (recReview?.status === 'complete') {
    result.recommendation_review = {
      status: 'completed',
      ...stageStates.recommendation_review,
      result: recReviewEstimateRequired > 0 ? 'estimate_required' : 'no_estimate_required',
      totalDeficiencies: recReview.total_deficiencies || allDeficiencies.length,
      reviewedDeficiencies: recReview.reviewed_deficiencies || 0,
      estimateRequiredCount: recReviewEstimateRequired,
    };
  } else if (recReview?.status === 'in_progress') {
    result.recommendation_review = {
      status: 'in_progress',
      ...stageStates.recommendation_review,
      totalDeficiencies: recReview.total_deficiencies || allDeficiencies.length,
      reviewedDeficiencies: recReview.reviewed_deficiencies || 0,
      estimateRequiredCount: recReviewEstimateRequired,
    };
  } else {
    result.recommendation_review = { status: aiSummaryDone ? 'available' : 'locked' };
  }

  const recReviewDone = ['completed', 'skipped'].includes(result.recommendation_review.status);

  // ── v2 Estimate Package Workflow ──
  const useV2Workflow = derived.useV2Workflow || false;

  // 5. Repair System Review
  // v2: Hidden — recommendations feed directly into Estimate Package Builder
  // Legacy: auto-completed when recommendation review is done
  const repairResult = recReviewDone
    ? (result.recommendation_review.result === 'no_estimate_required' || result.recommendation_review.status === 'skipped'
        ? 'no_recommendations'
        : 'recommendations_generated')
    : stageStates.repair_system_review?.result;
  if (useV2Workflow) {
    // v2 hides this stage, but it should only be skipped once recReview is done.
    // Before that, it's locked so it doesn't inflate progress.
    if (recReviewDone) {
      result.repair_system_review = { status: 'skipped', v2Hidden: true, skipReason: 'v2 package workflow — recommendations feed directly into Estimate Package Builder' };
    } else {
      result.repair_system_review = { status: 'locked', v2Hidden: true };
    }
  } else if (recReviewDone) {
    result.repair_system_review = { status: 'completed', ...stageStates.repair_system_review, result: repairResult };
  } else if (stageStates.repair_system_review?.status === 'completed' || (repairRecs.length > 0 && aiSummaryDone)) {
    result.repair_system_review = { status: 'completed', ...stageStates.repair_system_review };
  } else {
    result.repair_system_review = { status: aiSummaryDone ? 'available' : 'locked' };
  }

  const repairDone = ['completed', 'skipped'].includes(result.repair_system_review.status);
  const noRecommendations = useV2Workflow
    ? (recReviewDone && repairRecs.length === 0)
    : (repairDone && repairResult === 'no_recommendations');

  // ── Export engine-computed metadata on the stages object ──
  // All consumers MUST read these values from stages.__meta instead of
  // re-computing them independently. This is the single authoritative source.
  result.__meta = {
    noRecommendations,
    hasDeficiencies,
    allDeficienciesCount: allDeficiencies.length,
    recReviewDone,
    aiSummaryDone,
    summaryDone,
    useV2Workflow,
    repairDone,
    repairResult,
  };

  const estimatePackages = derived.estimatePackages || [];
  const customerFacingPackages = estimatePackages.filter(p =>
    p.is_customer_facing !== false && p.status !== 'archived' && !p.superseded_by_id
  );

  // 5.5. Estimate Package Builder (v2 only — skipped in legacy)
  if (!useV2Workflow) {
    result.estimate_package_builder = { status: 'skipped', skipReason: 'Legacy workflow — package builder not enabled' };
  } else if (noRecommendations) {
    result.estimate_package_builder = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (!recReviewDone) {
    result.estimate_package_builder = { status: 'locked' };
  } else if (stageStates.estimate_package_builder?.status === 'completed' || customerFacingPackages.length > 0) {
    result.estimate_package_builder = {
      status: 'completed',
      ...stageStates.estimate_package_builder,
      packageCount: customerFacingPackages.length,
    };
  } else if (stageStates.estimate_package_builder?.status === 'in_progress') {
    result.estimate_package_builder = { status: 'in_progress', ...stageStates.estimate_package_builder };
  } else {
    result.estimate_package_builder = { status: recReviewDone ? 'available' : 'locked' };
  }

  const packageBuilderDone = ['completed', 'skipped'].includes(result.estimate_package_builder.status);

  // 6. Scope of Work — depends on package builder (v2) or repair review (legacy)
  // v2: one independent ScopeOfWork per active proposal option (customer-facing
  // package). The stage is NOT complete until EVERY active option has a valid,
  // non-superseded saved scope. Editing one option never affects another.
  const scopeOfWork = derived.scopeOfWork;
  const scopeOfWorks = derived.scopeOfWorks || [];
  if (noRecommendations) {
    result.scope_of_work = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (useV2Workflow && !packageBuilderDone) {
    result.scope_of_work = { status: 'locked' };
  } else if (!repairDone) {
    result.scope_of_work = { status: 'locked' };
  } else if (useV2Workflow && customerFacingPackages.length > 0) {
    const optionScopes = customerFacingPackages.map(pkg => {
      const scope = scopeOfWorks.find(s => s.estimate_package_id === pkg.id && !s.superseded_by_id && s.status === 'approved')
        || scopeOfWorks.find(s => s.estimate_package_id === pkg.id && !s.superseded_by_id);
      return { packageId: pkg.id, optionType: pkg.option_type, scope };
    });
    const validCount = optionScopes.filter(o => o.scope).length;
    const totalCount = customerFacingPackages.length;
    const allValid = validCount === totalCount;
    if (allValid) {
      result.scope_of_work = { status: 'completed', ...stageStates.scope_of_work, optionScopes, optionScopesValid: validCount, optionScopesTotal: totalCount, scope_record: optionScopes[0]?.scope };
    } else if (validCount > 0 || stageStates.scope_of_work?.status === 'in_progress') {
      result.scope_of_work = { status: 'in_progress', ...stageStates.scope_of_work, optionScopes, optionScopesValid: validCount, optionScopesTotal: totalCount };
    } else {
      result.scope_of_work = { status: 'available', ...stageStates.scope_of_work, optionScopes, optionScopesValid: validCount, optionScopesTotal: totalCount };
    }
  } else if (stageStates.scope_of_work?.status === 'completed' || (scopeOfWork && scopeOfWork.status === 'approved')) {
    result.scope_of_work = { status: 'completed', ...stageStates.scope_of_work, scope_record: scopeOfWork };
  } else if (stageStates.scope_of_work?.status === 'in_progress' || (scopeOfWork && scopeOfWork.status === 'generated')) {
    result.scope_of_work = { status: 'in_progress', ...stageStates.scope_of_work, scope_record: scopeOfWork };
  } else {
    result.scope_of_work = { status: (useV2Workflow ? packageBuilderDone : repairDone) ? 'available' : 'locked' };
  }

  const scopeOfWorkDone = ['completed', 'skipped'].includes(result.scope_of_work.status);

  // 6.5. Dynamic Pricing (v2 only — skipped in legacy)
  if (!useV2Workflow) {
    result.dynamic_pricing = { status: 'skipped', skipReason: 'Legacy workflow — dynamic pricing not enabled' };
  } else if (noRecommendations) {
    result.dynamic_pricing = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (!scopeOfWorkDone) {
    result.dynamic_pricing = { status: 'locked' };
  } else if (stageStates.dynamic_pricing?.status === 'completed') {
    result.dynamic_pricing = { status: 'completed', ...stageStates.dynamic_pricing };
  } else if (stageStates.dynamic_pricing?.status === 'in_progress') {
    result.dynamic_pricing = { status: 'in_progress', ...stageStates.dynamic_pricing };
  } else {
    result.dynamic_pricing = { status: scopeOfWorkDone ? 'available' : 'locked' };
  }

  const dynamicPricingDone = ['completed', 'skipped'].includes(result.dynamic_pricing.status);

  // 6.8. Final Estimate Review — depends on dynamic pricing (v2) or scope of work (legacy)
  const draftEstimateItems = derived.draftEstimateItems || [];
  const unresolvedEstimateItems = draftEstimateItems.filter(i =>
    !['ready', 'approved', 'deferred', 'rejected'].includes(i.status)
  );
  const allEstimateItemsResolved = draftEstimateItems.length > 0 && unresolvedEstimateItems.length === 0;
  const estimateReviewedStatuses = ['execution_plan', 'ready_for_presentation', 'sent', 'accepted', 'declined', 'ready_for_scheduling'];
  const estimateReviewed = estimateReviewedStatuses.includes(estimate?.status);
  if (noRecommendations) {
    result.final_estimate_review = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (useV2Workflow && !dynamicPricingDone) {
    result.final_estimate_review = { status: 'locked' };
  } else if (!scopeOfWorkDone) {
    result.final_estimate_review = { status: 'locked' };
  } else if (stageStates.final_estimate_review?.status === 'completed' || estimateReviewed || allEstimateItemsResolved) {
    result.final_estimate_review = { status: 'completed', ...stageStates.final_estimate_review };
  } else if (draftEstimateItems.length > 0) {
    result.final_estimate_review = {
      status: 'in_progress',
      ...stageStates.final_estimate_review,
      totalItems: draftEstimateItems.length,
      unresolvedItems: unresolvedEstimateItems.length,
      allItemsResolved: allEstimateItemsResolved,
    };
  } else {
    result.final_estimate_review = { status: (useV2Workflow ? dynamicPricingDone : scopeOfWorkDone) ? 'available' : 'locked' };
  }

  const estimateDone = result.final_estimate_review.status === 'completed' || result.final_estimate_review.status === 'skipped';

  // 6.9. Proposal Builder — depends on estimate review (not scope of work directly)
  if (noRecommendations) {
    result.proposal_builder = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (stageStates.proposal_builder?.status === 'completed') {
    result.proposal_builder = { status: 'completed', ...stageStates.proposal_builder };
  } else {
    result.proposal_builder = { status: estimateDone ? 'available' : 'locked' };
  }

  const proposalBuilderDone = ['completed', 'skipped'].includes(result.proposal_builder.status);

  // 7. Customer Presentation — skipped when no recommendations
  const customerPresentation = derived.customerPresentation;
  if (noRecommendations) {
    result.customer_presentation = { status: 'skipped', skipReason: 'No repair recommendations generated' };
  } else if (stageStates.customer_presentation?.status === 'completed' || customerPresentation?.presentation_status === 'complete') {
    result.customer_presentation = {
      status: 'completed',
      ...stageStates.customer_presentation,
      presentationRecord: customerPresentation,
    };
  } else if (stageStates.customer_presentation?.status === 'in_progress' || customerPresentation?.presentation_status === 'in_progress') {
    result.customer_presentation = {
      status: 'in_progress',
      ...stageStates.customer_presentation,
      presentationRecord: customerPresentation,
    };
  } else {
    result.customer_presentation = { status: proposalBuilderDone ? 'available' : 'locked' };
  }

  const presentationDone = result.customer_presentation.status === 'completed' || result.customer_presentation.status === 'skipped';

  // 8. Customer Decision — skipped when no recommendations (clean inspection)
  if (noRecommendations) {
    result.customer_decision = { status: 'skipped', skipReason: 'No repair recommendations — clean inspection' };
  } else if (customerDecision !== 'pending' && presentationDone) {
    result.customer_decision = {
      status: 'completed',
      decision: customerDecision,
      ...stageStates.customer_decision,
    };
  } else {
    result.customer_decision = { status: presentationDone ? 'available' : 'locked' };
  }

  const decisionDone = result.customer_decision.status === 'completed' || result.customer_decision.status === 'skipped';
  const customerAccepted = customerDecision === 'accepted';

  // 9. Execution Plan — only when customer accepts work; skipped otherwise
  if (noRecommendations || !customerAccepted) {
    result.execution_plan = { status: 'skipped', skipReason: noRecommendations ? 'No repair recommendations generated' : 'Customer did not accept work — execution plan not required' };
  } else {
    const scopeComplete = estimate?.total_job_days > 0;
    const scaffoldBlocked = estimate?.scaffold_plan_required && estimate?.scaffold_plan_status !== 'attached';
    if (stageStates.execution_plan?.status === 'completed' || (scopeComplete && !scaffoldBlocked && decisionDone)) {
      result.execution_plan = { status: 'completed', ...stageStates.execution_plan };
    } else if (decisionDone && (stageStates.execution_plan?.status === 'in_progress' || (scopeComplete && scaffoldBlocked))) {
      result.execution_plan = { status: 'in_progress', ...stageStates.execution_plan };
    } else {
      result.execution_plan = { status: decisionDone ? 'available' : 'locked' };
    }
  }

  const executionPlanDone = result.execution_plan.status === 'completed' || result.execution_plan.status === 'skipped';

  // 10. Complete Appointment
  if (stageStates.complete_appointment?.status === 'completed') {
    result.complete_appointment = { status: 'completed', ...stageStates.complete_appointment };
  } else {
    result.complete_appointment = { status: decisionDone ? 'available' : 'locked' };
  }

  return result;
}

/**
 * Determines the next required action based on effective stage states.
 */
export function computeNextAction(stages, workflow) {
  const selectedModules = safeParse(workflow?.selected_modules, ['interior', 'exterior']);

  // First pass: look for reopened stages — they take priority as the
  // primary next action since the user explicitly reopened them for editing.
  for (const stage of WORKFLOW_STAGES) {
    const state = stages[stage.key];
    if (!state || state.status === 'skipped') continue;
    if (state.status === 'reopened') {
      return {
        stage,
        state,
        action: 'continue',
        label: `Continue ${stage.label}`,
        description: `${stage.label} was reopened and needs to be re-completed.`,
        isReopened: true,
      };
    }
  }

  for (const stage of WORKFLOW_STAGES) {
    const state = stages[stage.key];
    if (!state) continue;

    if (stage.conditional && state.status === 'skipped') continue;
    if (state.status === 'skipped') continue;
    if (['completed', 'approved'].includes(state.status)) continue;

    // Stale stages that are still "completed" show a refresh hint
    // but don't block forward progress — the user can choose to refresh
    // or proceed. We surface the first stale stage as an informational note.
    if (state.status === 'completed' && state.stale === true) {
      // Skip stale-completed in the main loop — they don't block
      continue;
    }

    if (state.status === 'needs_lead_review') {
      return {
        stage,
        state,
        action: 'review',
        label: `Review ${stage.label}`,
        description: `${state.assigned_to_name || 'Crew member'} has submitted this module for your review.`,
      };
    }

    if (state.status === 'in_progress') {
      return {
        stage,
        state,
        action: 'continue',
        label: stage.continueLabel || `Continue ${stage.label}`,
        description: stage.description,
      };
    }

    if (state.status === 'available') {
      return {
        stage,
        state,
        action: 'start',
        label: stage.startLabel || (stage.isModule ? `Start ${stage.label}` : `Complete ${stage.label}`),
        description: stage.description,
      };
    }

    // For locked stages, keep checking — but if we hit the end, return the locked stage
    if (state.status === 'locked') {
      return {
        stage,
        state,
        action: 'locked',
        label: `${stage.label} Locked`,
        description: 'Complete the previous stages first.',
      };
    }
  }

  return {
    stage: WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1],
    state: { status: 'completed' },
    action: 'done',
    label: 'Appointment Complete',
    description: 'All workflow stages are complete.',
  };
}

/**
 * Computes overall progress percentage across all stages.
 */
export function computeOverallProgress(stages, workflow) {
  const selectedModules = safeParse(workflow?.selected_modules, ['interior', 'exterior']);
  const useV2 = stages?.__meta?.useV2Workflow || false;
  const activeStages = WORKFLOW_STAGES.filter(s => {
    if (s.isModule) return selectedModules.includes(s.moduleKey);
    // Exclude v2-hidden stages from progress calculation in v2 workflows
    if (useV2 && s.v2Hidden) return false;
    return true;
  });

  const total = activeStages.length;
  const completed = activeStages.filter(s => {
    const state = stages[s.key];
    return state && ['completed', 'skipped', 'approved'].includes(state.status);
  }).length;

  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function getStageDefinition(key) {
  return WORKFLOW_STAGES.find(s => s.key === key);
}

/**
 * Returns the workflow metadata computed by computeEffectiveStages.
 * This is the single authoritative source for noRecommendations,
 * hasDeficiencies, recReviewDone, etc.
 */
export function getWorkflowMeta(stages) {
  return stages?.__meta || {
    noRecommendations: false,
    hasDeficiencies: false,
    allDeficienciesCount: 0,
    recReviewDone: false,
    aiSummaryDone: false,
    summaryDone: false,
    useV2Workflow: false,
    repairDone: false,
    repairResult: null,
  };
}

/**
 * Computes the progress step index — the index of the LAST completed/skipped
 * stage in WORKFLOW_STAGES order. Returns -1 if nothing is done yet.
 * Uses the canonical WORKFLOW_STAGES, not a hardcoded array.
 */
export function computeProgressStep(stages) {
  if (!stages) return -1;
  for (let i = WORKFLOW_STAGES.length - 1; i >= 0; i--) {
    const s = stages[WORKFLOW_STAGES[i].key];
    if (s && ['completed', 'skipped'].includes(s.status)) return i;
  }
  return -1;
}

/**
 * Returns the key of the current stage — the first stage with status
 * 'in_progress'. If none is in_progress, falls back to the next action
 * stage from computeNextAction. This ensures "current" and "next" are
 * always derived from the same stages object.
 */
export function computeCurrentStageKey(stages, nextAction) {
  if (!stages) return 'none';
  for (const stage of WORKFLOW_STAGES) {
    const state = stages[stage.key];
    if (state && state.status === 'in_progress') return stage.key;
  }
  // No stage is in_progress — the "current" stage is whatever computeNextAction returns
  return nextAction?.stage?.key || 'none';
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Revision State Overlay — Controlled Reopening & Staleness
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  After computeEffectiveStages derives the "natural" stage statuses from
 *  entity data, this function overlays the revision-aware states (stale,
 *  reopened) that were set by the server-authoritative manageWorkflowRevision
 *  backend function.
 *
 *  Key rules:
 *    - A stage marked 'reopened' in stage_states overrides its natural
 *      status — it becomes editable again.
 *    - A stage marked 'stale' in stage_states retains its completed_at and
 *      metadata, but its status changes to 'stale' so the UI shows the
 *      staleness indicator.
 *    - The __meta flags (noRecommendations, etc.) are preserved.
 *    - Skipped stages are never overlaid (they remain skipped).
 * ═══════════════════════════════════════════════════════════════════════
 */
export function applyRevisionStates(stages, workflow) {
  if (!stages || !workflow) return stages;

  const stageStates = safeParse(workflow?.stage_states, {});
  const result = { ...stages };

  for (const stage of WORKFLOW_STAGES) {
    const stored = stageStates[stage.key];
    const computed = result[stage.key];
    if (!computed || !stored) continue;
    if (computed.status === 'skipped') continue;

    // Overlay 'reopened' status — takes precedence over natural computation
    if (stored.status === 'reopened') {
      result[stage.key] = {
        ...computed,
        status: 'reopened',
        reopened_at: stored.reopened_at,
        reopened_by: stored.reopened_by,
        reopened_by_name: stored.reopened_by_name,
        reopened_reason: stored.reopened_reason,
        previous_status: stored.previous_status,
        completed_at: computed.completed_at, // Preserve original completion info
        completed_by: computed.completed_by,
        completed_by_name: computed.completed_by_name,
      };
      continue;
    }

    // Overlay 'stale' flag — the stage is still completed but needs refresh
    if (stored.stale === true && ['completed', 'approved'].includes(computed.status)) {
      result[stage.key] = {
        ...computed,
        stale: true,
        stale_reason: stored.stale_reason,
        stale_at: stored.stale_at,
        stale_by: stored.stale_by,
        stale_by_name: stored.stale_by_name,
        stale_source_stage: stored.stale_source_stage,
        // Keep status as 'completed' but add stale flag — the UI will show both
      };
      continue;
    }
  }

  // Preserve __meta
  if (stages.__meta) result.__meta = stages.__meta;

  return result;
}