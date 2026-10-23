import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Inspection Pipeline Diagnostic Tracer
 *
 * Traces a job through the entire inspection → findings → recommendations
 * → groups → packages pipeline and returns a comprehensive diagnostic
 * showing where data may be dropped, especially for exterior inspections.
 */

const FAILED_VALUES = ['no', 'fail', 'deficient', 'failed', 'false', 'unsafe'];

function normalizeAnswer(raw) {
  if (raw === undefined || raw === null) return '';
  let val = Array.isArray(raw) ? (raw[0] || '') : raw;
  return String(val).toLowerCase().trim();
}

function isFailedAnswer(raw) {
  return FAILED_VALUES.includes(normalizeAnswer(raw));
}

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const b44 = base44.asServiceRole;

    // Load ALL pipeline entities in parallel
    const [submissions, findings, recommendations, recReviews, reviewItems,
           estimateGroups, groupItems, packages, packageItems, draftItems,
           inspectionReports, setup, job, allQuestions, rules] = await Promise.all([
      b44.entities.InspectionSubmission.filter({ job_id: jobId }).catch(() => []),
      b44.entities.InspectionFinding.filter({ job_id: jobId }).catch(() => []),
      b44.entities.RepairSystemRecommendation.filter({ job_id: jobId }).catch(() => []),
      b44.entities.RecommendationReview.filter({ job_id: jobId }).catch(() => []),
      b44.entities.RecommendationReviewItem.filter({ job_id: jobId }).catch(() => []),
      b44.entities.EstimateGroup.filter({ job_id: jobId }).catch(() => []),
      b44.entities.EstimateGroupItem.filter({ job_id: jobId }).catch(() => []),
      b44.entities.EstimatePackage.filter({ job_id: jobId }).catch(() => []),
      b44.entities.EstimatePackageItem.filter({ job_id: jobId }).catch(() => []),
      b44.entities.DraftEstimateItem.filter({ job_id: jobId }).catch(() => []),
      b44.entities.InspectionReport.filter({ job_id: jobId }).catch(() => []),
      b44.entities.InspectionSetup.filter({ job_id: jobId }).catch(() => []),
      b44.entities.Job.get(jobId).catch(() => null),
      b44.entities.InspectionQuestion.filter({ is_active: true }).catch(() => []),
      b44.entities.LogicRule.filter({ is_active: true, trigger_event: 'inspection.question_answered' }, '-priority', 500).catch(() => []),
    ]);

    // Build question lookup
    const questionMap = {};
    for (const q of allQuestions) questionMap[q.id] = q;

    // Build rule lookup by question_id
    const ruleByQuestionId = {};
    for (const r of rules) {
      if (r.inspection_question_id) ruleByQuestionId[r.inspection_question_id] = r;
    }

    // ============================================================
    // TRACE: Submissions → Failed Answers → Findings
    // ============================================================
    const submissionTraces = [];
    let totalInteriorFailed = 0;
    let totalExteriorFailed = 0;

    for (const sub of submissions) {
      const answers = safeParse(sub.answers, {});
      const subType = sub.inspection_type || sub.form_type || 'interior';

      const failedAnswers = [];
      for (const [qid, val] of Object.entries(answers)) {
        if (qid.startsWith('__')) continue;
        if (qid.endsWith('_photos')) continue;
        if (!isFailedAnswer(val)) continue;

        const question = questionMap[qid];
        const rule = ruleByQuestionId[qid];
        const finding = findings.find(f =>
          f.source_rule_id === rule?.id || f.source_rule_id === `question:${qid}`
        );

        failedAnswers.push({
          question_id: qid,
          question_text: question?.question_text || '(question not found)',
          answer_value: JSON.stringify(val),
          inspection_type: question?.inspection_type || subType,
          category: question?.category || '',
          creates_finding_flag: question?.creates_finding || false,
          has_matching_rule: !!rule,
          rule_name: rule?.rule_name || null,
          finding_generated: !!finding,
          finding_id: finding?.id || null,
          finding_deficiency_type: finding?.deficiency_type || null,
          finding_interior_exterior: finding?.interior_exterior || null,
          exclusion_reason: !finding
            ? (!rule
              ? 'No LogicRule configured for this question — no finding generated (question fallback needed)'
              : 'Rule exists but conditions not met or finding action missing')
            : null,
        });
      }

      if (subType === 'exterior') totalExteriorFailed += failedAnswers.length;
      else totalInteriorFailed += failedAnswers.length;

      submissionTraces.push({
        submission_id: sub.id,
        inspection_type: subType,
        status: sub.status,
        submitted_at: sub.submitted_at,
        total_answers: Object.keys(answers).filter(k => !k.startsWith('__') && !k.endsWith('_photos')).length,
        failed_answer_count: failedAnswers.length,
        failed_answers: failedAnswers,
      });
    }

    // ============================================================
    // TRACE: Findings → Recommendations
    // ============================================================
    const findingTraces = findings.map(f => {
      const rec = recommendations.find(r => {
        const relatedIds = safeParse(r.related_findings, []);
        return relatedIds.includes(f.id);
      });
      const groupItem = groupItems.find(gi => gi.inspection_finding_id === f.id);
      return {
        finding_id: f.id,
        deficiency_type: f.deficiency_type,
        interior_exterior: f.interior_exterior,
        finding_location: f.finding_location,
        severity: f.severity,
        source_rule_id: f.source_rule_id,
        is_deficiency: f.is_deficiency,
        include_in_estimate: f.include_in_estimate,
        internal_only: f.internal_only,
        recommendations_generated: f.recommendations_generated,
        recommendation_id: rec?.id || null,
        recommendation_title: rec?.recommendation_title || null,
        estimate_status: rec?.estimate_status || null,
        group_item_id: groupItem?.id || null,
        group_id: groupItem?.estimate_group_id || null,
        exclusion_reason: !rec
          ? (f.include_in_estimate === false ? 'Finding excluded from estimate'
            : f.internal_only === true ? 'Finding marked internal-only'
            : f.is_deficiency === false ? 'Finding is an observation, not a deficiency'
            : !f.deficiency_type ? 'Missing deficiency type'
            : 'No repair system recommendation generated (run generateRepairSystemRecommendations)')
          : null,
      };
    });

    // ============================================================
    // TRACE: Recommendations → Groups → Packages
    // ============================================================
    const recommendationTraces = recommendations.map(r => {
      const groupItem = groupItems.find(gi => gi.repair_recommendation_id === r.id);
      const draftItem = draftItems.find(di => di.repair_system_recommendation_id === r.id);
      const pkgItem = packageItems.find(pi => pi.repair_recommendation_id === r.id);
      const relatedFindingIds = safeParse(r.related_findings, []);
      const relatedFindings = findings.filter(f => relatedFindingIds.includes(f.id));
      const isExterior = relatedFindings.some(f => f.interior_exterior === 'exterior');

      return {
        recommendation_id: r.id,
        recommendation_title: r.recommendation_title,
        repair_system_type: r.repair_system_type,
        severity: r.severity,
        estimate_status: r.estimate_status,
        is_exterior_related: isExterior,
        related_finding_ids: relatedFindingIds,
        related_finding_interior_exterior: relatedFindings.map(f => f.interior_exterior),
        group_item_id: groupItem?.id || null,
        group_id: groupItem?.estimate_group_id || null,
        draft_item_id: draftItem?.id || null,
        draft_item_status: draftItem?.status || null,
        package_item_id: pkgItem?.id || null,
        package_id: pkgItem?.estimate_package_id || null,
        exclusion_reason: !groupItem ? 'No estimate group item — run autoGroupEstimates' : null,
      };
    });

    // ============================================================
    // TRACE: Groups → Items
    // ============================================================
    const groupTraces = estimateGroups.map(g => {
      const items = groupItems.filter(gi => gi.estimate_group_id === g.id);
      return {
        group_id: g.id,
        group_name: g.group_name,
        group_type: g.group_type,
        status: g.status,
        confirmed: g.confirmed,
        item_count: items.length,
        items: items.map(gi => ({
          group_item_id: gi.id,
          recommendation_id: gi.repair_recommendation_id,
          finding_id: gi.inspection_finding_id,
          inclusion_status: gi.inclusion_status,
        })),
      };
    });

    // ============================================================
    // TRACE: Packages → Contents
    // ============================================================
    const packageTraces = packages.map(p => {
      const pItems = packageItems.filter(pi => pi.estimate_package_id === p.id);
      const estItemIds = safeParse(p.estimate_item_ids, []);
      const estItems = draftItems.filter(di => estItemIds.includes(di.id));
      return {
        package_id: p.id,
        package_name: p.name,
        option_type: p.option_type,
        status: p.status,
        package_item_count: pItems.length,
        estimate_item_count: estItems.length,
        estimate_items: estItems.map(ei => ({
          draft_item_id: ei.id,
          service_name: ei.service_name,
          finding_id: ei.finding_id,
          recommendation_id: ei.repair_system_recommendation_id,
          status: ei.status,
          is_exterior: ei.finding_id ? findings.find(f => f.id === ei.finding_id)?.interior_exterior === 'exterior' : false,
        })),
      };
    });

    // ============================================================
    // SUMMARY: Exclusion audit
    // ============================================================
    const exteriorExcluded = [];
    for (const sub of submissionTraces) {
      if (sub.inspection_type !== 'exterior') continue;
      for (const fa of sub.failed_answers) {
        if (!fa.finding_generated) {
          exteriorExcluded.push({
            question_id: fa.question_id,
            question_text: fa.question_text,
            answer_value: fa.answer_value,
            exclusion_reason: fa.exclusion_reason,
          });
        }
      }
    }

    return Response.json({
      job_id: jobId,
      job_number: job?.crm_job_number,
      customer_name: job?.customer_name,
      diagnostic_summary: {
        total_submissions: submissions.length,
        interior_failed_responses: totalInteriorFailed,
        exterior_failed_responses: totalExteriorFailed,
        total_findings: findings.length,
        interior_findings: findings.filter(f => f.interior_exterior === 'interior').length,
        exterior_findings: findings.filter(f => f.interior_exterior === 'exterior').length,
        total_recommendations: recommendations.length,
        interior_recommendations: recommendationTraces.filter(r => !r.is_exterior_related).length,
        exterior_recommendations: recommendationTraces.filter(r => r.is_exterior_related).length,
        total_groups: estimateGroups.length,
        total_group_items: groupItems.length,
        total_packages: packages.length,
        total_package_items: packageItems.length,
        total_draft_items: draftItems.length,
        exterior_records_excluded: exteriorExcluded.length,
      },
      submission_traces: submissionTraces,
      finding_traces: findingTraces,
      recommendation_traces: recommendationTraces,
      group_traces: groupTraces,
      package_traces: packageTraces,
      exterior_excluded_records: exteriorExcluded,
      inspection_reports: inspectionReports.map(r => ({
        id: r.id,
        status: r.status,
        summary_preview: (r.summary || r.ai_summary || '').substring(0, 200),
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});