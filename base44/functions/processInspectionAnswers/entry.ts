import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireInternalAutomationSecret } from '../../shared/securityAuth.ts';

/**
 * Inspection Answer → Deficiency Finding Processor (v2 — Multi-Form Merge)
 *
 * CHANGES FROM v1:
 *   - Loads ALL submitted InspectionSubmissions for the job and merges their answers
 *     into one normalized collection (interior + exterior + attic + roof, etc.)
 *   - Processes LogicRules against the MERGED answer set (not just one submission)
 *   - Adds a question-based fallback: for any failed answer ("No", "Fail", "Deficient",
 *     "Failed", "False", "Unsafe") to an active question that is NOT already covered
 *     by a LogicRule AND is explicitly marked as deficiency-producing
 *     (creates_finding, finding_type_config, critical_failure, safety_trigger, or
 *     nfpa_trigger), generates a finding directly from the question config.
 *     This ensures exterior deficiencies are never silently dropped while
 *     avoiding false positives from questions where "No" is the compliant answer.
 *   - Deduplication: rule-based findings use source_rule_id = rule.id;
 *     question-based findings use source_rule_id = "question:<question_id>".
 *
 * Root cause this fixes:
 *   - Exterior submission existed but had no matching LogicRule → no finding generated
 *   - Only one submission was processed per automation trigger → exterior answers ignored
 *   - No fallback for questions without LogicRule configuration
 */

const FAILED_ANSWER_VALUES = ['no', 'fail', 'deficient', 'failed', 'false', 'unsafe'];

/**
 * Determines if a question is explicitly marked as deficiency-producing.
 * Only questions with explicit deficiency configuration should generate
 * findings from the generic fallback. This prevents treating every "No"
 * answer as a deficiency — some questions have "No" as the compliant answer.
 */
function isDeficiencyProducingQuestion(question) {
  if (!question) return false;
  return question.creates_finding === true
    || !!question.finding_type_config
    || question.critical_failure === true
    || question.safety_trigger === true
    || question.nfpa_trigger === true
    || (question.question_purpose && Array.isArray(question.question_purpose) 
        && question.question_purpose.some(p => p === 'estimate_generation' || p === 'repair_recommendation'));
}

function normalizeAnswer(raw) {
  if (raw === undefined || raw === null) return '';
  let val = Array.isArray(raw) ? (raw[0] || '') : raw;
  return String(val).toLowerCase().trim();
}

function isFailedAnswer(raw) {
  const normalized = normalizeAnswer(raw);
  return FAILED_ANSWER_VALUES.includes(normalized);
}

function evaluateCondition(cond, answers, ruleQuestionId) {
  if (cond.condition_type === 'event_age' || !cond.field) return { passed: true, skipped: true };

  let actual;
  if (cond.field === 'answer_value' || cond.field === 'answer') {
    actual = normalizeAnswer(answers[ruleQuestionId]);
  } else {
    actual = normalizeAnswer(answers[cond.field]);
  }

  const expected = String(cond.value || '').toLowerCase().trim();

  let passed = false;
  switch (cond.operator) {
    case 'equals': passed = actual === expected; break;
    case 'not_equals': passed = actual !== expected; break;
    case 'contains': passed = actual.includes(expected); break;
    case 'not_contains': passed = !actual.includes(expected); break;
    case 'greater_than': passed = parseFloat(actual) > parseFloat(expected); break;
    case 'less_than': passed = parseFloat(actual) < parseFloat(expected); break;
    case 'exists': passed = actual !== '' && actual !== 'undefined'; break;
    case 'not_exists': passed = actual === '' || actual === 'undefined'; break;
    default: passed = false;
  }

  return { passed, actual, expected };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    // ── Authentication ──
    // Two legitimate paths:
    //   1. Authenticated technician (frontend submission) — any role allowed
    //   2. Entity automation — requires X-LVC-Internal-Automation-Secret header
    // PLATFORM LIMITATION: Base44 entity automations pass function_args as the
    // request body and do NOT support custom HTTP headers. The automation will
    // be rejected until the platform supports custom headers or an alternative
    // secure channel is established.
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      // May be entity automation — check internal automation secret
    }

    if (user) {
      // Authenticated technician (frontend submission) — allow any role
    } else {
      const authResult = requireInternalAutomationSecret(req);
      if (authResult.error) {
        console.log("[PROCESS_INSPECTION_ANSWERS] Rejected: authentication failed");
        return authResult.error;
      }
    }

    // Entity automation payload: { event: { type, entity_name, entity_id }, data: submission }
    let submission = body.data;
    const entityId = body.event?.entity_id;

    // If payload_too_large or data missing, load from DB
    if ((!submission || !submission.answers) && entityId) {
      submission = await base44.asServiceRole.entities.InspectionSubmission.get(entityId);
    }

    const jobId = submission?.job_id || body.job_id;
    const triggerSubmissionId = submission?.id || entityId;

    if (!jobId) {
      return Response.json({ error: 'job_id required' }, { status: 400 });
    }

    // ============================================================
    // 1. Load ALL submitted InspectionSubmissions for this job
    //    and merge their answers into one normalized collection
    // ============================================================
    const allSubmissions = await base44.asServiceRole.entities.InspectionSubmission
      .filter({ job_id: jobId, status: 'submitted' }).catch(() => []);

    // Build merged answers, tracking which submission each answer came from
    const mergedAnswers = {};
    const answerSourceSubmission = {}; // question_id -> submission_id
    const submissionInspectionType = {}; // submission_id -> inspection_type

    for (const sub of allSubmissions) {
      submissionInspectionType[sub.id] = sub.inspection_type || sub.form_type || 'interior';
      let subAnswers = {};
      try { subAnswers = JSON.parse(sub.answers || '{}'); } catch {}

      for (const [key, val] of Object.entries(subAnswers)) {
        // Skip internal/meta keys
        if (key.startsWith('__')) continue;
        // Skip sub-field keys (e.g. question_id_Front, question_id_Left)
        if (key.includes('_') && !key.match(/^[0-9a-f]{24}$/) && !key.endsWith('_photos')) continue;

        const existingEmpty = mergedAnswers[key] === undefined || mergedAnswers[key] === null || mergedAnswers[key] === '';
        const incomingEmpty = val === undefined || val === null || val === '';

        if (existingEmpty && !incomingEmpty) {
          mergedAnswers[key] = val;
          answerSourceSubmission[key] = sub.id;
        } else if (!existingEmpty && !incomingEmpty) {
          // Merge photo arrays
          if (key.endsWith('_photos') && Array.isArray(mergedAnswers[key]) && Array.isArray(val)) {
            const merged = [...mergedAnswers[key]];
            for (const url of val) { if (!merged.includes(url)) merged.push(url); }
            mergedAnswers[key] = merged;
          }
        }
      }
    }

    // ============================================================
    // 2. Load all active LogicRules for inspection questions
    // ============================================================
    const rules = await base44.asServiceRole.entities.LogicRule.filter({
      is_active: true,
      trigger_event: 'inspection.question_answered',
    }, '-priority', 500);

    // ============================================================
    // 2a. Duplicate Rule Detection — warn when two active rules
    //     use the same question, conditions, and action
    // ============================================================
    const duplicateWarnings = [];
    const rulesByQuestion = {};
    for (const r of rules) {
      const qId = r.inspection_question_id || '_none';
      if (!rulesByQuestion[qId]) rulesByQuestion[qId] = [];
      rulesByQuestion[qId].push(r);
    }
    for (const [qId, group] of Object.entries(rulesByQuestion)) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const r1 = group[i], r2 = group[j];
          let c1 = [], c2 = [];
          try { c1 = JSON.parse(r1.conditions_json || '[]'); } catch {}
          try { c2 = JSON.parse(r2.conditions_json || '[]'); } catch {}
          const condMatch = c1.length === c2.length && c1.every(c =>
            c2.some(c2c => c.field === c2c.field && c.operator === c2c.operator && String(c.value) === String(c2c.value))
          );
          let a1 = [], a2 = [];
          try { a1 = JSON.parse(r1.actions_json || '[]'); } catch {}
          try { a2 = JSON.parse(r2.actions_json || '[]'); } catch {}
          const a1Tmpl = a1.flatMap(a => (a.field_mappings || []).map(m => m.value)).find(v => v && v.length === 24);
          const a2Tmpl = a2.flatMap(a => (a.field_mappings || []).map(m => m.value)).find(v => v && v.length === 24);
          const actionMatch = a1Tmpl && a2Tmpl && a1Tmpl === a2Tmpl;
          if (condMatch && actionMatch) {
            duplicateWarnings.push({
              rule1: { id: r1.id, name: r1.rule_name },
              rule2: { id: r2.id, name: r2.rule_name },
              question_id: qId,
              repair_template_id: a1Tmpl,
              severity: 'duplicate',
              message: 'Rules "' + r1.rule_name + '" and "' + r2.rule_name + '" have identical conditions and target the same repair template. Deactivate one to prevent duplicate findings.',
            });
          } else if (actionMatch) {
            duplicateWarnings.push({
              rule1: { id: r1.id, name: r1.rule_name },
              rule2: { id: r2.id, name: r2.rule_name },
              question_id: qId,
              repair_template_id: a1Tmpl,
              severity: 'warning',
              message: 'Rules "' + r1.rule_name + '" and "' + r2.rule_name + '" target the same repair template on the same question but have different conditions. Verify this is intentional.',
            });
          }
        }
      }
    }

    // Load job for customer info
    const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);

    // ============================================================
    // 3. Load existing findings for deduplication
    // ============================================================
    const existingFindings = await base44.asServiceRole.entities.InspectionFinding
      .filter({ job_id: jobId });

    const processedRuleIds = new Set(
      existingFindings.map(f => f.source_rule_id).filter(id => id && !id.startsWith('question:'))
    );
    const processedQuestionIds = new Set(
      existingFindings
        .filter(f => f.source_rule_id?.startsWith('question:'))
        .map(f => f.source_rule_id.replace('question:', ''))
    );

    const results = [];
    const findingsCreated = [];

    // ============================================================
    // 4. Process LogicRules against MERGED answers
    // ============================================================
    for (const rule of rules) {
      if (!rule.inspection_question_id) continue;

      const rawAnswer = mergedAnswers[rule.inspection_question_id];
      if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') continue;

      // Parse conditions
      let conditions = [];
      try { conditions = JSON.parse(rule.conditions_json || '[]'); } catch {}
      if (conditions.length === 0) continue;

      // Evaluate conditions
      let conditionsMet = true;
      for (const cond of conditions) {
        const result = evaluateCondition(cond, mergedAnswers, rule.inspection_question_id);
        if (!result.skipped && !result.passed) { conditionsMet = false; break; }
      }

      if (!conditionsMet) continue;

      // Deduplication check
      if (processedRuleIds.has(rule.id)) {
        results.push({ rule_id: rule.id, rule_name: rule.rule_name, status: 'duplicate_skipped' });
        continue;
      }

      // Parse actions
      let actions = [];
      try { actions = JSON.parse(rule.actions_json || '[]'); } catch {}

      const findingAction = actions.find(a => a.action_key === 'inspection.create_finding');
      if (!findingAction) {
        results.push({ rule_id: rule.id, rule_name: rule.rule_name, status: 'no_finding_action' });
        continue;
      }

      // Build finding data from rule output + action field_mappings
      const sourceSubId = answerSourceSubmission[rule.inspection_question_id] || triggerSubmissionId;
      const findingData = {
        inspection_id: sourceSubId,
        job_id: jobId,
        customer_id: job?.customer_id || '',
        customer_name: job?.customer_name || '',
        deficiency_type: rule.output_finding_type || '',
        severity: rule.output_severity || 'moderate',
        is_deficiency: true,
        include_in_estimate: true,
        internal_only: false,
        requires_calculation: false,
        calculation_type: '',
        created_by: 'inspection-rule-engine',
        source_rule_id: rule.id,
      };

      // Apply static field mappings from action
      for (const m of (findingAction.field_mappings || [])) {
        if ((m.source_type === 'static' || !m.source_type) && m.value !== undefined && m.value !== '') {
          if (m.field === 'deficiency_type') findingData.deficiency_type = m.value;
          else if (m.field === 'severity') findingData.severity = m.value;
          else if (m.field === 'description') findingData.customer_facing_explanation = m.value;
          else if (m.field === 'repair_system') findingData.appliance_system_type = m.value;
          else if (m.field === 'repair_template_id') findingData.repair_template_id = m.value;
          else if (m.field === 'finding_location') findingData.finding_location = m.value;
          else if (m.field === 'recommended_repair') findingData.recommended_repair = m.value;
          else if (m.field === 'customer_facing_explanation') findingData.customer_facing_explanation = m.value;
          else if (m.field === 'internal_notes') findingData.internal_notes = m.value;
          else if (m.field === 'appliance_system_type') findingData.appliance_system_type = m.value;
        else if (m.field === 'requires_calculation') findingData.requires_calculation = m.value === true || m.value === 'true';
        else if (m.field === 'calculation_type') findingData.calculation_type = m.value;
        }
      }

      // Fallback: inherit repair_template_id from the rule level when the
      // action mapping didn't provide one
      if (!findingData.repair_template_id && rule.repair_template_id) {
        findingData.repair_template_id = rule.repair_template_id;
      }

      // Set finding_location and interior_exterior from question
      const question = await base44.asServiceRole.entities.InspectionQuestion
        .get(rule.inspection_question_id).catch(() => null);
      findingData.finding_location = question?.question_text || rule.inspection_question_text || rule.rule_name;
      findingData.interior_exterior = question?.inspection_type || submissionInspectionType[sourceSubId] || 'interior';

      // Create the finding
      try {
        const result = await base44.asServiceRole.entities.InspectionFinding.create(findingData);
        processedRuleIds.add(rule.id);
        findingsCreated.push({
          finding_id: result.id,
          source: 'logic_rule',
          rule_id: rule.id,
          rule_name: rule.rule_name,
          question_id: rule.inspection_question_id,
          deficiency_type: findingData.deficiency_type,
          interior_exterior: findingData.interior_exterior,
          finding_location: findingData.finding_location,
          severity: findingData.severity,
          requires_calculation: findingData.requires_calculation,
          calculation_type: findingData.calculation_type,
          repair_template_id: findingData.repair_template_id,
          inspection_id: findingData.inspection_id,
        });
        results.push({
          rule_id: rule.id,
          rule_name: rule.rule_name,
          status: 'created',
          finding_id: result.id,
          deficiency_type: findingData.deficiency_type,
          interior_exterior: findingData.interior_exterior,
        });
      } catch (err) {
        results.push({ rule_id: rule.id, rule_name: rule.rule_name, status: 'failed', error: err.message });
      }
    }

    // ============================================================
    // 5. Question-based fallback: generate findings for FAILED
    //    answers not covered by any LogicRule. This ensures
    //    exterior deficiencies are never silently dropped.
    // ============================================================
    const ruleQuestionIds = new Set(
      rules.filter(r => r.inspection_question_id).map(r => r.inspection_question_id)
    );

    // Batch-load all relevant questions in one pass
    const failedQuestionIds = Object.entries(mergedAnswers)
      .filter(([qid, val]) => {
        if (qid.startsWith('__')) return false;
        if (qid.endsWith('_photos')) return false;
        if (ruleQuestionIds.has(qid)) return false; // already covered by a rule
        if (processedQuestionIds.has(qid)) return false; // already has a finding
        return isFailedAnswer(val);
      })
      .map(([qid]) => qid);

    for (const questionId of failedQuestionIds) {
      const question = await base44.asServiceRole.entities.InspectionQuestion
        .get(questionId).catch(() => null);

      if (!question || !question.is_active) {
        results.push({
          question_id: questionId,
          status: 'skipped_question_fallback',
          reason: !question ? 'Question not found' : 'Question inactive',
        });
        continue;
      }

      // Skip non-applicable question types
      if (['photo', 'text', 'number', 'rating'].includes(question.question_type)) {
        results.push({
          question_id: questionId,
          status: 'skipped_question_fallback',
          reason: `Question type "${question.question_type}" does not produce findings`,
        });
        continue;
      }

      // Only create fallback findings for questions explicitly marked as
      // deficiency-producing. This prevents treating every "No" answer as a
      // deficiency — some questions have "No" as the compliant answer.
      // Questions with LogicRules are already handled above and excluded.
      if (!isDeficiencyProducingQuestion(question)) {
        results.push({
          question_id: questionId,
          status: 'skipped_question_fallback',
          reason: 'Question not marked as deficiency-producing (no creates_finding, finding_type_config, critical_failure, safety_trigger, or nfpa_trigger)',
        });
        continue;
      }

      // Dedup check
      if (processedQuestionIds.has(questionId)) {
        results.push({ question_id: questionId, status: 'duplicate_skipped' });
        continue;
      }

      const sourceSubId = answerSourceSubmission[questionId] || triggerSubmissionId;
      const inspectionType = question.inspection_type || submissionInspectionType[sourceSubId] || 'both';

      // Derive deficiency type from question config
      const deficiencyType = question.finding_type_config
        || question.question_category
        || question.category
        || 'Deficiency';

      // Derive severity from question config
      const severity = question.severity_config
        || (question.critical_failure ? 'critical' : 'moderate');

      const findingData = {
        inspection_id: sourceSubId,
        job_id: jobId,
        customer_id: job?.customer_id || '',
        customer_name: job?.customer_name || '',
        deficiency_type: deficiencyType,
        finding_location: question.question_text || `Question ${questionId}`,
        interior_exterior: inspectionType,
        severity: severity,
        is_deficiency: true,
        include_in_estimate: true,
        internal_only: false,
        safety_concern: question.safety_trigger || false,
        nfpa_code_failure: question.nfpa_trigger || false,
        created_by: 'inspection-question-fallback',
        source_rule_id: `question:${questionId}`,
      };

      try {
        const result = await base44.asServiceRole.entities.InspectionFinding.create(findingData);
        processedQuestionIds.add(questionId);
        findingsCreated.push({
          finding_id: result.id,
          source: 'question_fallback',
          question_id: questionId,
          question_text: question.question_text,
          deficiency_type: findingData.deficiency_type,
          interior_exterior: findingData.interior_exterior,
          finding_location: findingData.finding_location,
          severity: findingData.severity,
        });
        results.push({
          question_id: questionId,
          question_text: question.question_text,
          status: 'created_question_fallback',
          finding_id: result.id,
          deficiency_type: findingData.deficiency_type,
          interior_exterior: findingData.interior_exterior,
        });
      } catch (err) {
        results.push({ question_id: questionId, status: 'failed', error: err.message });
      }
    }

    // ============================================================
    // 6. Crown Calculation Integration
    //    If any finding requires a crown calculation (calculation_type
    //    = "crown"), extract measurements from the merged inspection
    //    answers and run the crown calculation engine.
    //    This runs AFTER all findings are processed, so all answers
    //    from the full inspection submission are available.
    // ============================================================
    const crownCalcResults = [];
    try {
      // Check for crown-calculation findings (newly created or existing)
      let crownFindings = findingsCreated.filter(f => f.calculation_type === 'crown');
      if (crownFindings.length === 0) {
        const allJobFindings = await base44.asServiceRole.entities.InspectionFinding
          .filter({ job_id: jobId }).catch(() => []);
        crownFindings = allJobFindings
          .filter(f => f.calculation_type === 'crown' || f.requires_calculation === true)
          .map(f => ({ finding_id: f.id, repair_template_id: f.repair_template_id, inspection_id: f.inspection_id }));
      }

      if (crownFindings.length > 0) {
        // Stable question IDs for measurement extraction
        const CROWN_Q = {
          flue_measurements: '69c365ed38b67af793acbe73',
          crown_measurements: '69c365ed38b67af793acbe7d',
          brick_courses: '6a55b11af4425ddf7efd8d65',
          crown_step_in: '6a55b11ac02d312f0d86eb2a',
        };

        // Parse "length x width" from text answer
        function parseDims(txt) {
          if (!txt) return null;
          const m = String(txt).trim().match(/(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*(\d+(?:\.\d+)?)/);
          return m ? { length: parseFloat(m[1]), width: parseFloat(m[2]) } : null;
        }
        function parseMultiDims(txt) {
          if (!txt) return [];
          return String(txt).split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(parseDims).filter(Boolean);
        }

        // Extract measurements from merged answers
        const crownDims = parseDims(mergedAnswers[CROWN_Q.crown_measurements]);
        const flues = parseMultiDims(mergedAnswers[CROWN_Q.flue_measurements]);
        const brickRaw = String(mergedAnswers[CROWN_Q.brick_courses] || '').toLowerCase().trim();
        const stepRaw = String(mergedAnswers[CROWN_Q.crown_step_in] || '').toLowerCase().trim();
        const removingBrick = brickRaw === 'yes' || brickRaw === 'true';
        const crownStepIn = stepRaw === 'yes' || stepRaw === 'true';

        // Track missing measurements
        const missing = [];
        if (!crownDims) missing.push({ question_id: CROWN_Q.crown_measurements, label: 'Crown measurements (length \u00d7 width)' });
        if (flues.length === 0) missing.push({ question_id: CROWN_Q.flue_measurements, label: 'Exterior flue tile measurements' });

        // Load settings
        const settingsList = await base44.asServiceRole.entities.CrownCalculationSettings.list().catch(() => []);
        const s = (settingsList?.[0]) || {
          default_crown_thickness_inches: 4, default_bag_weight_lbs: 80,
          default_yield_per_bag_cubic_feet: 0.60, small_form_max_inches: 28.01,
          medium_form_max_inches: 56, large_form_max_inches: 92, foam_package_length_inches: 192,
        };
        const thickness = s.default_crown_thickness_inches || 4;
        const crownL = crownDims ? crownDims.length : 0;
        const crownW = crownDims ? crownDims.width : 0;

        // Run calculation (only if we have crown dimensions)
        let calc = null;
        if (crownDims) {
          const grossArea = crownL * crownW;
          const totalFlueArea = flues.reduce((sum, f) => sum + (f.length * f.width), 0);
          const netArea = grossArea - totalFlueArea;
          const cubicFeet = (netArea * thickness) / 1728;
          const rawBags = cubicFeet / s.default_yield_per_bag_cubic_feet;
          const bagsRequired = Math.ceil(rawBags);
          const wireGridL = crownL - 2;
          const wireGridW = crownW - 2;
          const totalFoam = flues.reduce((sum, f) => sum + (2 * f.length + 2 * f.width + 6), 0);
          const foamLF = totalFoam / 12;
          const foamQty = s.foam_package_length_inches > 0 ? Math.ceil(totalFoam / s.foam_package_length_inches) : 0;
          function classifyForm(dim) {
            if (dim <= s.small_form_max_inches) return 'Small Forms';
            if (dim <= s.medium_form_max_inches) return 'Medium Forms';
            if (dim <= s.large_form_max_inches) return 'Large Forms';
            return 'Custom Wood Forms';
          }
          const hash = crownL + '|' + crownW + '|' + thickness + '|' + flues.map(f => f.length + 'x' + f.width).join(',') + '|' + removingBrick + '|' + crownStepIn;
          calc = {
            gross_crown_area: grossArea, total_flue_area: totalFlueArea, net_crown_area: netArea,
            concrete_cubic_feet: cubicFeet, raw_concrete_bags: rawBags, concrete_bags_required: bagsRequired,
            wire_grid_length: wireGridL, wire_grid_width: wireGridW, total_foam_inches: totalFoam,
            total_foam_linear_feet: foamLF, foam_purchase_quantity: foamQty,
            crown_form_size_length: classifyForm(crownL), crown_form_size_width: classifyForm(crownW),
            measurement_hash: hash,
          };
        }

        // Build CrownCalculation record data
        const crownFinding = crownFindings[0];
        const calcData = {
          job_id: jobId,
          customer_id: job?.customer_id || '',
          customer_name: job?.customer_name || '',
          customer_address: [job?.address, job?.city, job?.state, job?.zip].filter(Boolean).join(', '),
          technician: job?.lead_technician_name || job?.technician_name || job?.lead_technician_email || '',
          calculation_date: new Date().toISOString(),
          repair_template_id: crownFinding.repair_template_id || '',
          inspection_finding_id: crownFinding.finding_id || '',
          inspection_id: crownFinding.inspection_id || triggerSubmissionId,
          crown_form_length: crownL, crown_form_width: crownW, crown_thickness: thickness,
          flues_json: JSON.stringify(flues), flue_count: flues.length,
          removing_brick_courses: removingBrick, crown_step_in: crownStepIn,
          status: missing.length > 0 ? 'missing_measurements' : 'confirmed',
          measurement_source: 'inspection',
          missing_measurements_json: missing.length > 0 ? JSON.stringify(missing) : '',
          source_question_ids_json: JSON.stringify(CROWN_Q),
          updated_by: 'inspection-rule-engine',
        };
        if (calc) {
          Object.assign(calcData, {
            gross_crown_area: calc.gross_crown_area, total_flue_area: calc.total_flue_area,
            net_crown_area: calc.net_crown_area, concrete_cubic_feet: calc.concrete_cubic_feet,
            raw_concrete_bags: calc.raw_concrete_bags, concrete_bags_required: calc.concrete_bags_required,
            wire_grid_length: calc.wire_grid_length, wire_grid_width: calc.wire_grid_width,
            total_foam_inches: calc.total_foam_inches, total_foam_linear_feet: calc.total_foam_linear_feet,
            foam_purchase_quantity: calc.foam_purchase_quantity,
            crown_form_size_length: calc.crown_form_size_length, crown_form_size_width: calc.crown_form_size_width,
            calculation_snapshot_json: JSON.stringify(calc), settings_snapshot_json: JSON.stringify(s),
            measurement_hash: calc.measurement_hash,
          });
        }

        // Find existing calculation
        const existingCrownCalcs = await base44.asServiceRole.entities.CrownCalculation
          .filter({ job_id: jobId }).catch(() => []);
        const existing = existingCrownCalcs?.[0];
        let savedCalc = null;
        let proposalLocked = false;
        let alreadyConfirmed = false;

        // Skip if already confirmed with same hash and materials pushed
        if (existing && existing.status === 'confirmed' && calc &&
            existing.measurement_hash === calc.measurement_hash && existing.materials_pushed) {
          alreadyConfirmed = true;
          crownCalcResults.push({ status: 'already_confirmed', calc_id: existing.id });
        } else if (existing && existing.proposal_option_id) {
          try {
            const prop = await base44.asServiceRole.entities.ProposalOptionTemplate.get(existing.proposal_option_id);
            if (prop && ['presented', 'accepted'].includes(prop.option_status)) {
              proposalLocked = true;
              crownCalcResults.push({ status: 'proposal_locked', existing_calc_id: existing.id });
            }
          } catch {}
        }

        if (!proposalLocked && !alreadyConfirmed) {
          if (existing) {
            calcData.created_by = existing.created_by || 'inspection-rule-engine';
            savedCalc = await base44.asServiceRole.entities.CrownCalculation.update(existing.id, calcData);
          } else {
            calcData.created_by = 'inspection-rule-engine';
            savedCalc = await base44.asServiceRole.entities.CrownCalculation.create(calcData);
          }

          // Push materials if calculation is complete
          if (calc && missing.length === 0 && savedCalc) {
            try {
              const materials = [
                { material_id: s.concrete_material_id || '', material_name: 'Concrete (' + s.default_bag_weight_lbs + 'lb bags)',
                  quantity: calc.concrete_bags_required, unit: 'bag', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
                  calculation_detail: calc.concrete_cubic_feet.toFixed(4) + ' cu ft / ' + s.default_yield_per_bag_cubic_feet + ' yield = ' + calc.raw_concrete_bags.toFixed(4) + ' raw -> ' + calc.concrete_bags_required + ' bags' },
                { material_id: s.wire_grid_material_id || '', material_name: 'Wire Grid',
                  quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
                  calculation_detail: calc.wire_grid_length + ' x ' + calc.wire_grid_width + ' inches (crown - 2in each side)' },
                { material_id: s.expansion_foam_material_id || '', material_name: 'Expansion Foam',
                  quantity: calc.foam_purchase_quantity, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true,
                  calculation_detail: calc.total_foam_inches + ' in (' + calc.total_foam_linear_feet.toFixed(2) + ' linear ft) -> ' + calc.foam_purchase_quantity + ' packages' },
                { material_id: '', material_name: 'Crown Form - Length (' + calc.crown_form_size_length + ')',
                  quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true },
                { material_id: '', material_name: 'Crown Form - Width (' + calc.crown_form_size_width + ')',
                  quantity: 1, unit: 'ea', unit_price: 0, chargeable_to_customer: true, customer_visible: true },
              ];

              let items = [];
              if (crownFinding.repair_template_id) {
                items = await base44.asServiceRole.entities.DraftEstimateItem
                  .filter({ job_id: jobId, repair_recommendation_template_id: crownFinding.repair_template_id });
              }
              if (items.length === 0) {
                items = await base44.asServiceRole.entities.DraftEstimateItem.filter({ job_id: jobId });
              }

              if (items.length > 0) {
                await base44.asServiceRole.entities.DraftEstimateItem.update(items[0].id, { materials: JSON.stringify(materials) });
                const scopes = await base44.asServiceRole.entities.ScopeOfWork.filter({ job_id: jobId }).catch(() => []);
                if (scopes.length > 0) {
                  await base44.asServiceRole.entities.ScopeOfWork.update(scopes[0].id, { required_materials: JSON.stringify(materials) });
                }
                crownCalcResults.push({ status: 'materials_pushed', estimate_item_id: items[0].id, materials_count: materials.length });
              } else {
                let estimates = await base44.asServiceRole.entities.Estimate.filter({ job_id: jobId }).catch(() => []);
                let estId = '';
                if (estimates.length > 0) {
                  estId = estimates[0].id;
                } else {
                  const newEst = await base44.asServiceRole.entities.Estimate.create({
                    job_id: jobId, customer_id: job?.customer_id || '', customer_name: job?.customer_name || '',
                    status: 'draft', line_items: '[]', subtotal: 0, total: 0,
                  });
                  estId = newEst.id;
                }
                const newItem = await base44.asServiceRole.entities.DraftEstimateItem.create({
                  estimate_id: estId, job_id: jobId, customer_id: job?.customer_id || '',
                  repair_recommendation_template_id: crownFinding.repair_template_id || '',
                  service_name: 'Install New Concrete Crown', source_title: 'Crown Calculation',
                  materials: JSON.stringify(materials), status: 'manual_review', quantity: 1,
                });
                crownCalcResults.push({ status: 'materials_pushed', estimate_item_id: newItem.id, estimate_id: estId, materials_count: materials.length });
              }

              await base44.asServiceRole.entities.CrownCalculation.update(savedCalc.id, {
                materials_pushed: true, materials_pushed_at: new Date().toISOString(),
              });
            } catch (err) {
              crownCalcResults.push({ status: 'material_push_failed', error: err.message });
            }
          } else if (missing.length > 0) {
            crownCalcResults.push({ status: 'missing_measurements', missing });
          }
        }
      }
    } catch (crownErr) {
      crownCalcResults.push({ status: 'error', error: crownErr.message });
    }

    return Response.json({
      success: true,
      job_id: jobId,
      trigger_submission_id: triggerSubmissionId,
      crown_calculation: crownCalcResults,
      duplicate_warnings: duplicateWarnings,
      submissions_processed: allSubmissions.length,
      submission_types: allSubmissions.map(s => ({
        id: s.id,
        inspection_type: s.inspection_type || s.form_type || 'interior',
        status: s.status,
      })),
      merged_answer_count: Object.keys(mergedAnswers).filter(k => !k.startsWith('__') && !k.endsWith('_photos')).length,
      rules_evaluated: rules.length,
      findings_created: findingsCreated.length,
      findings_created_detail: findingsCreated,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});