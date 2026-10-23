import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { safeParse, getWorkflowMeta, computeCurrentStageKey } from '@/lib/workflowEngine';

/**
 * Diagnostic hook that logs the exact data the workflow engine receives
 * from the frontend's user-scoped queries, so we can compare it against
 * the backend's service-role data.
 *
 * All stage-related values (currentStage, nextStage, noRecommendations, etc.)
 * are read from the SINGLE authoritative stages object produced by
 * computeEffectiveStages. No duplicate calculations here.
 *
 * @param {string} jobId
 * @param {object|null} workflow - AppointmentWorkflow record
 * @param {object} derived - derived data from useWorkflowState
 * @param {object} stages - computed stage states from computeEffectiveStages
 * @param {object} nextAction - computed next action from computeNextAction
 */
export function useWorkflowDataDiagnostics(jobId, workflow, derived, stages, nextAction) {
  const lastLoggedRef = useRef('');

  useEffect(() => {
    if (!jobId || !workflow || !stages) return;

    // Build a signature so we only log when meaningful data changes
    const sig = [
      jobId,
      workflow.updated_date,
      derived.findings?.length,
      derived.legacyFindings?.length,
      derived.repairRecs?.length,
      derived.estimatePackages?.length,
      stages.inspection_summary?.status,
      stages.recommendation_review?.status,
    ].join('|');
    if (sig === lastLoggedRef.current) return;
    lastLoggedRef.current = sig;

    const findings = derived.findings || [];
    const legacyFindings = derived.legacyFindings || [];
    const meta = getWorkflowMeta(stages);

    // ── All stage values derived from the SINGLE authoritative stages object ──
    const currentStage = computeCurrentStageKey(stages, nextAction);
    const nextStage = nextAction?.stage?.key || 'none';
    const nextStageStatus = nextAction?.state?.status || 'N/A';

    const stageStates = safeParse(workflow.stage_states, {});

    // ── AR-001 Diagnostic Assertion ──
    // Verify that the canonical workflow metadata (from computeEffectiveStages)
    // has not been diverged from by any component. If derived.useV2Workflow
    // differs from meta.useV2Workflow, a component is independently evaluating
    // the feature flag — which violates the Single Authoritative Workflow Resolver rule.
    if (derived.useV2Workflow !== meta.useV2Workflow) {
      console.error('╔════════════════════════════════════════════════════════════╗');
      console.error('║  ⛔ AR-001 VIOLATION: Workflow state divergence detected!  ║');
      console.error('║  Component: JobHub (useWorkflowDataDiagnostics)            ║');
      console.error(`║  derived.useV2Workflow: ${derived.useV2Workflow}                                 ║`);
      console.error(`║  meta.useV2Workflow:   ${meta.useV2Workflow}                                 ║`);
      console.error('║  The workflow engine is the SOLE authority for workflow   ║');
      console.error('║  state. No component may independently evaluate feature   ║');
      console.error('║  flags or recompute workflow metadata.                    ║');
      console.error('╚════════════════════════════════════════════════════════════╝');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📊 WORKFLOW DATA DIAGNOSTICS (frontend user-scoped query)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Job ID:                       ${jobId}`);
    console.log(`  workflow_version:            ${meta.useV2Workflow ? 'v2_package' : 'legacy'}`);
    console.log(`  useV2Workflow:                ${meta.useV2Workflow}`);
    console.log(`  derived.findings.length:      ${findings.length} (InspectionFinding)`);
    console.log(`  derived.legacyFindings.length: ${legacyFindings.length} (Finding)`);
    console.log(`  InspectionFinding IDs:        [${findings.map(f => f.id).join(', ')}]`);
    console.log(`  Finding IDs:                  [${legacyFindings.map(f => f.id).join(', ')}]`);
    console.log(`  allDeficiencies.length:        ${meta.allDeficienciesCount}`);
    console.log(`  hasDeficiencies:              ${meta.hasDeficiencies}`);
    console.log(`  summaryDone:                  ${meta.summaryDone} (stages.inspection_summary.status="${stages.inspection_summary?.status}")`);
    console.log(`  aiSummaryDone:                ${meta.aiSummaryDone} (stages.ai_report_summary.status="${stages.ai_report_summary?.status}")`);
    console.log(`  recommendationReviewDone:      ${meta.recReviewDone} (stages.recommendation_review.status="${stages.recommendation_review?.status}")`);
    console.log(`  repairRecommendationCount:    ${derived.repairRecs?.length || 0}`);
    console.log(`  EstimatePackage count:        ${derived.estimatePackages?.length || 0}`);
    console.log(`  noRecommendations (engine):    ${meta.noRecommendations}`);
    console.log(`  currentStage:                 ${currentStage}`);
    console.log(`  nextStage:                    ${nextStage} (${nextStageStatus})`);
    console.log('─── persisted stage_states ───');
    Object.keys(stageStates).forEach(k => {
      console.log(`  ${k}: ${JSON.stringify(stageStates[k])}`);
    });
    console.log('═══════════════════════════════════════════════════════════════');

    // ── Independent re-fetch to detect silent query failures ──
    // useWorkflowState wraps each query in .catch(() => []), so a permission
    // error or RLS block would silently produce an empty array. We re-query
    // here WITHOUT catch-swallowing to surface any errors.
    (async () => {
      try {
        const [refetchedInspFindings, refetchedLegacyFindings] = await Promise.all([
          base44.entities.InspectionFinding.filter({ job_id: jobId }).catch(e => ({ __error: e.message })),
          base44.entities.Finding.filter({ job_id: jobId }).catch(e => ({ __error: e.message })),
        ]);

        const inspErr = refetchedInspFindings?.__error;
        const legacyErr = refetchedLegacyFindings?.__error;

        const inspCount = inspErr ? `ERROR: ${inspErr}` : refetchedInspFindings.length;
        const legacyCount = legacyErr ? `ERROR: ${legacyErr}` : refetchedLegacyFindings.length;

        const mismatch =
          (!inspErr && inspCount !== findings.length) ||
          (!legacyErr && legacyCount !== legacyFindings.length);

        console.log('─── independent re-fetch (no catch-swallow) ───');
        console.log(`  InspectionFinding re-fetch: ${inspCount}`);
        console.log(`  Finding re-fetch:          ${legacyCount}`);
        if (mismatch) {
          console.warn('  ⚠️  DATA MISMATCH — useWorkflowState received different data than independent re-fetch!');
          console.warn(`      derived.findings:      ${findings.length} | re-fetch: ${inspCount}`);
          console.warn(`      derived.legacyFindings: ${legacyFindings.length} | re-fetch: ${legacyCount}`);
          console.warn('  ⚠️  The workflow engine is making decisions on STALE or EMPTY data.');
          console.warn('  ⚠️  Stop debugging stage routing — fix the data-loading discrepancy first.');
        } else {
          console.log('  ✓ independent re-fetch matches derived data — no loading discrepancy');
        }
        console.log('═══════════════════════════════════════════════════════════════');
      } catch (e) {
        console.error('[WorkflowDiagnostics] independent re-fetch failed:', e);
      }
    })();
  }, [jobId, workflow, derived, stages, nextAction]);
}