import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CRITICAL_RESPONSES = [
  'unsafe', 'failed', 'deficient', 'needs repair', 'water damage',
  'cracked', 'improper installation', 'immediate attention required',
];

function isCritical(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return CRITICAL_RESPONSES.some(c => v === c || v.includes(c));
}

function safeParse(str, fallback) {
  try { return JSON.parse(str || 'null') ?? fallback; } catch { return fallback; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return Response.json({ error: 'job_id is required' }, { status: 400 });
    }

    // 1. Load ALL inspection data in parallel — unified with Inspection Review + PDF
    const [setups, inspectionFindings, legacyFindings, submissions, repairRecs, jobs, existingReports, allQuestions] = await Promise.all([
      base44.asServiceRole.entities.InspectionSetup.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.InspectionFinding.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.Finding.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.InspectionSubmission.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.RepairSystemRecommendation.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.Job.filter({ id: job_id }).catch(() => []),
      base44.asServiceRole.entities.InspectionReport.filter({ job_id }).catch(() => []),
      base44.asServiceRole.entities.InspectionQuestion.filter({ is_active: true }).catch(() => []),
    ]);

    const setup = setups[0] || null;
    const job = jobs[0] || null;

    if (!setup && !job) {
      return Response.json({ error: 'No inspection setup or job found for this job_id' }, { status: 404 });
    }

    // 2. Merge answers from all submissions (same logic as PDF report)
    let mergedAnswers = {};
    for (const sub of submissions) {
      const subAnswers = safeParse(sub.answers, {});
      for (const [key, val] of Object.entries(subAnswers)) {
        const existingEmpty = mergedAnswers[key] === undefined || mergedAnswers[key] === null || mergedAnswers[key] === '';
        const incomingEmpty = val === undefined || val === null || val === '';
        if (existingEmpty && !incomingEmpty) {
          mergedAnswers[key] = val;
        } else if (!existingEmpty && !incomingEmpty) {
          if (key.endsWith('_photos') && Array.isArray(mergedAnswers[key]) && Array.isArray(val)) {
            const merged = [...mergedAnswers[key]];
            for (const url of val) { if (!merged.includes(url)) merged.push(url); }
            mergedAnswers[key] = merged;
          }
        }
      }
    }

    // 3. Build question lookup map
    const questionMap = {};
    for (const q of allQuestions) questionMap[q.id] = q;

    // 4. Derive critical conditions from raw answers (same logic as PDF + Inspection Review)
    const derivedCriticalConditions = [];
    for (const [key, val] of Object.entries(mergedAnswers)) {
      if (key.endsWith('_photos')) continue;
      const vals = Array.isArray(val) ? val : [val];
      if (vals.some(v => isCritical(v))) {
        const q = questionMap[key];
        const photos = mergedAnswers[`${key}_photos`] || [];
        derivedCriticalConditions.push({
          question_id: key,
          question_text: q?.question_text || `Question ${key}`,
          answer: vals.join(', '),
          photos,
        });
      }
    }

    // 5. Unify all findings from both sources
    const allFindings = [...inspectionFindings, ...legacyFindings];

    // 6. Categorize findings — prioritize by severity
    const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3, info: 4 };
    const sortBySeverity = (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5);

    const deficiencies = allFindings
      .filter(f => f.include_in_estimate !== false && f.internal_only !== true && f.is_deficiency !== false)
      .sort(sortBySeverity);
    const observations = allFindings.filter(f => f.is_deficiency === false).sort(sortBySeverity);

    // 5b. Deficiency Reconciliation — compare expected triggers vs actual findings
    const inspectionRules = await base44.asServiceRole.entities.LogicRule.filter({
      is_active: true,
      trigger_event: 'inspection.question_answered',
    }, '-priority', 500).catch(() => []);

    const expectedTriggers = [];
    for (const rule of inspectionRules) {
      if (!rule.inspection_question_id) continue;
      const rawAnswer = mergedAnswers[rule.inspection_question_id];
      if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') continue;

      let normalizedAnswer = Array.isArray(rawAnswer) ? (rawAnswer[0] || '') : rawAnswer;
      normalizedAnswer = String(normalizedAnswer).toLowerCase().trim();

      let conditions = [];
      try { conditions = JSON.parse(rule.conditions_json || '[]'); } catch {}
      if (conditions.length === 0) continue;

      let conditionsMet = true;
      for (const cond of conditions) {
        if (cond.condition_type === 'event_age' || !cond.field) continue;
        let actual;
        if (cond.field === 'answer_value' || cond.field === 'answer') {
          actual = normalizedAnswer;
        } else {
          let otherAnswer = mergedAnswers[cond.field];
          if (Array.isArray(otherAnswer)) otherAnswer = otherAnswer[0] || '';
          actual = String(otherAnswer ?? '').toLowerCase().trim();
        }
        const expected = String(cond.value || '').toLowerCase().trim();
        let passed = false;
        switch (cond.operator) {
          case 'equals': passed = actual === expected; break;
          case 'not_equals': passed = actual !== expected; break;
          case 'contains': passed = actual.includes(expected); break;
          case 'not_contains': passed = !actual.includes(expected); break;
          default: passed = false;
        }
        if (!passed) { conditionsMet = false; break; }
      }
      if (!conditionsMet) continue;

      const matchingFinding = allFindings.find(f => f.source_rule_id === rule.id);
      expectedTriggers.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        question_text: rule.inspection_question_text || questionMap[rule.inspection_question_id]?.question_text || '',
        answer: Array.isArray(rawAnswer) ? rawAnswer.join(', ') : String(rawAnswer),
        expected_finding_type: rule.output_finding_type || '',
        finding_created: !!matchingFinding,
      });
    }

    const reconciliationMissing = expectedTriggers.filter(t => !t.finding_created);
    const reconciliationPassed = reconciliationMissing.length === 0;

    const nfpaFailures = allFindings.filter(f => f.nfpa_code_failure).sort(sortBySeverity);
    const safetyConcerns = allFindings.filter(f => f.safety_concern).sort(sortBySeverity);
    const criticalFindings = allFindings.filter(f => f.severity === 'critical' || f.severity === 'major').sort(sortBySeverity);

    // 7. Aggregate measurements
    const allMeasurements = {};
    for (const f of allFindings) {
      try { Object.assign(allMeasurements, JSON.parse(f.measurements || '{}')); } catch { /* ignore */ }
    }

    // 8. Count photos
    const totalPhotos = allFindings.reduce((sum, f) => {
      const internal = f.photos_internal_only || [];
      const customer = (f.photo_urls || []).filter(u => !internal.includes(u));
      return sum + customer.length;
    }, 0);

    // 9. Build the prompt with prioritized data
    const inspectionLevelLabel = {
      level_1: 'Level 1 (Visual Inspection)',
      level_2: 'Level 2 (Real Estate / Extended)',
      level_3: 'Level 3 (Internal / Destructive)',
    };

    const selectedModules = (() => {
      try { return JSON.parse(setup?.selected_modules || '[]'); } catch { return []; }
    })();

    const hasDeficiencies = deficiencies.length > 0;
    const hasCriticalData = hasDeficiencies || criticalFindings.length > 0 || derivedCriticalConditions.length > 0 || nfpaFailures.length > 0 || safetyConcerns.length > 0;

    const cleanGuard = hasDeficiencies
      ? 'IMPORTANT: Deficiencies were found during this inspection. Do NOT write a clean inspection summary. You must describe the deficiencies found.'
      : (hasCriticalData
        ? 'IMPORTANT: Critical conditions were detected. Do NOT write a clean inspection summary. You must reference the critical findings below.'
        : '');

    const formatFinding = (f) => {
      const parts = [`• ${f.deficiency_type || f.finding_type || 'Unknown'}`];
      parts.push(`Severity: ${f.severity || 'moderate'}`);
      if (f.finding_location || f.category) parts.push(`Location: ${f.finding_location || f.category}`);
      if (f.customer_facing_explanation || f.narrative_output) parts.push(`Explanation: ${f.customer_facing_explanation || f.narrative_output}`);
      if (f.recommended_repair) parts.push(`Recommended: ${f.recommended_repair}`);
      if (f.triggered_by_rule) parts.push(`Rule: ${f.triggered_by_rule}`);
      if (f.photo_urls?.length) parts.push(`Photos: ${f.photo_urls.length} attached`);
      if (f.suggested_pricebook_items) parts.push(`Pricebook: ${f.suggested_pricebook_items}`);
      return parts.join(' | ');
    };

    const formatCriticalCondition = (c) => {
      const parts = [`• ${c.question_text}`, `Answer: ${c.answer}`];
      if (c.photos?.length) parts.push(`Photos: ${c.photos.length} attached`);
      return parts.join(' | ');
    };

    const prompt = `You are a certified chimney sweep writing a customer-facing inspection report summary for a professional chimney service company.

Write a clear, professional summary based on the inspection data below. Follow these rules:
- If no deficiencies were found, use clean-inspection language. Example: "Based on today's inspection, no major deficiencies were observed. The inspected areas appeared to be in serviceable condition at the time of inspection. Routine maintenance and continued annual inspections are recommended."
- If deficiencies exist, describe them factually. Do NOT overpromise, guarantee results, or make claims not supported by the data.
- Reference specific deficiencies by their type and location.
- Mention NFPA/code failures if present, using accessible language.
- Mention safety concerns if present.
- Keep the summary between 150-400 words.
- Use a professional, reassuring tone.
- Do not include pricing or specific repair recommendations — just the inspection summary.
- Write in third person as the inspecting company.
- PRIORITIZE findings in this order: critical findings, safety concerns, NFPA/code failures, major deficiencies, customer concerns, non-deficiency observations, then clean/normal findings.
${cleanGuard}

=== INSPECTION DATA ===

Job: ${job?.job_number || job?.crm_job_number || job_id}
Customer: ${job?.customer_name || setup?.customer_name || 'N/A'}
Property Address: ${setup?.address || job?.address || 'N/A'}
Inspection Date: ${setup?.date_started ? new Date(setup.date_started).toLocaleDateString() : new Date().toLocaleDateString()}
Inspection Level: ${inspectionLevelLabel[setup?.inspection_level] || 'Level 1'}
Modules Inspected: ${selectedModules.join(', ') || 'Interior, Exterior'}
Weather: ${setup?.weather || 'N/A'}
Occupancy: ${setup?.occupancy || 'N/A'}
Customer Present: ${setup?.customer_present ? 'Yes' : 'No'}

Customer Concerns: ${setup?.customer_concerns || 'None reported'}

Building Overview: ${setup?.building_overview_notes || 'N/A'}

--- CRITICAL FINDINGS (${criticalFindings.length}) — HIGHEST PRIORITY ---
${criticalFindings.map(formatFinding).join('\n') || 'None'}

--- SAFETY CONCERNS (${safetyConcerns.length}) ---
${safetyConcerns.map(formatFinding).join('\n') || 'None'}

--- NFPA / CODE FAILURES (${nfpaFailures.length}) ---
${nfpaFailures.map(formatFinding).join('\n') || 'None'}

--- DERIVED CRITICAL CONDITIONS FROM ANSWERS (${derivedCriticalConditions.length}) ---
${derivedCriticalConditions.map(formatCriticalCondition).join('\n') || 'None'}

--- DEFICIENCIES (${deficiencies.length} found) ---
${deficiencies.map(formatFinding).join('\n') || 'None'}

--- NON-DEFICIENCY OBSERVATIONS (${observations.length} found) ---
${observations.map(formatFinding).join('\n') || 'None'}

--- INTERIOR INSPECTION RESULTS ---
${submissions.filter(s => s.inspection_type === 'interior').map(s => `Status: ${s.status}, Notes: ${s.technician_notes || 'N/A'}`).join('\n') || 'Not performed or not submitted'}

--- EXTERIOR INSPECTION RESULTS ---
${submissions.filter(s => s.inspection_type === 'exterior').map(s => `Status: ${s.status}, Notes: ${s.technician_notes || 'N/A'}`).join('\n') || 'Not performed or not submitted'}

--- MEASUREMENTS ---
${Object.entries(allMeasurements).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None recorded'}

--- PHOTOS ---
${totalPhotos} customer-visible photos attached.

--- REPAIR SYSTEM RECOMMENDATIONS (if any) ---
${repairRecs.map(r => `• ${r.recommendation_title} (${r.repair_system_type}) — Severity: ${r.severity}${r.customer_facing_explanation ? ' — ' + r.customer_facing_explanation : ''}`).join('\n') || 'None generated'}

--- TECHNICIAN NOTES ---
${submissions.map(s => s.technician_notes).filter(Boolean).join('\n') || 'None'}

=== END INSPECTION DATA ===

Write the customer-facing inspection report summary now:`;

    // 10. Call InvokeLLM
    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
    });

    const summaryText = typeof llmResponse === 'string' ? llmResponse : (llmResponse?.response || llmResponse?.summary || JSON.stringify(llmResponse));

    // 11. Find or create InspectionReport
    let report = existingReports[0] || null;
    const reportData = {
      job_id,
      inspection_id: setup?.id || job_id,
      customer_id: job?.customer_id || setup?.customer_id || '',
      customer_name: job?.customer_name || setup?.customer_name || '',
      address: setup?.address || job?.address || '',
      inspection_date: setup?.date_started ? new Date(setup.date_started).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA'),
      technician_name: user.full_name || user.email,
      ai_summary_status: 'draft',
      ai_summary_draft: summaryText,
      ai_summary_generated_at: new Date().toISOString(),
    };

    if (report) {
      report = await base44.asServiceRole.entities.InspectionReport.update(report.id, {
        ai_summary_status: 'draft',
        ai_summary_draft: summaryText,
        ai_summary_generated_at: new Date().toISOString(),
      });
    } else {
      report = await base44.asServiceRole.entities.InspectionReport.create(reportData);
    }

    // 12. Return diagnostic data for the developer panel
    return Response.json({
      status: 'success',
      summary: summaryText,
      report_id: report.id,
      ai_summary_status: report.ai_summary_status,
      reconciliation: {
        passed: reconciliationPassed,
        expected_count: expectedTriggers.length,
        actual_count: expectedTriggers.length - reconciliationMissing.length,
        missing: reconciliationMissing.map(t => ({
          rule_name: t.rule_name,
          question_text: t.question_text,
          answer: t.answer,
          expected_finding_type: t.expected_finding_type,
        })),
      },
      diagnostic: {
        total_findings: allFindings.length,
        inspection_findings_count: inspectionFindings.length,
        legacy_findings_count: legacyFindings.length,
        deficiencies_count: deficiencies.length,
        critical_findings_count: criticalFindings.length,
        safety_concerns_count: safetyConcerns.length,
        nfpa_failures_count: nfpaFailures.length,
        derived_critical_conditions_count: derivedCriticalConditions.length,
        observations_count: observations.length,
        repair_recs_count: repairRecs.length,
        total_photos: totalPhotos,
        has_deficiencies: hasDeficiencies,
        has_critical_data: hasCriticalData,
        critical_findings: criticalFindings.map(f => ({
          type: f.deficiency_type || f.finding_type,
          severity: f.severity,
          location: f.finding_location || f.category,
        })),
        safety_concerns: safetyConcerns.map(f => ({
          type: f.deficiency_type || f.finding_type,
          severity: f.severity,
          location: f.finding_location || f.category,
        })),
        nfpa_failures: nfpaFailures.map(f => ({
          type: f.deficiency_type || f.finding_type,
          severity: f.severity,
          location: f.finding_location || f.category,
        })),
        derived_critical_conditions: derivedCriticalConditions.map(c => ({
          question_text: c.question_text,
          answer: c.answer,
        })),
        prompt_length: prompt.length,
        prompt_preview: prompt.substring(0, 500) + '...',
        reconciliation: {
          passed: reconciliationPassed,
          expected_count: expectedTriggers.length,
          actual_count: expectedTriggers.length - reconciliationMissing.length,
          missing: reconciliationMissing,
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});