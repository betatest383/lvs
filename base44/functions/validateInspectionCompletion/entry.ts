import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ═══════════════════════════════════════════════════════════════════════
//  validateInspectionCompletion — the SINGLE server-authoritative result
//  for inspection completion. Every consumer (JobHub checklist,
//  CompletionEngine, PhotoValidationDialog override) MUST use this result
//  rather than independently recalculating missing requirements.
//
//  Returns: { can_complete, missing_requirements, blocking_requirements,
//             overridden_requirements, override_id, override_reason,
//             override_by, override_at, other_blockers }
//
//  Actions:
//    validate          — compute the result (read-only)
//    apply_override    — waive explicitly selected missing-photo requirements
//    revoke_override   — remove specific waivers (preserves history)
//    reopen            — reopen a completed inspection to add documentation
//    resubmit          — re-validate after documentation added; clears stale
//
//  A valid override waives ONLY the explicitly selected requirements.
//  Unrelated inspection problems remain blocking. Overrides are idempotent
//  by requirement_id — repeated clicks create no duplicate waivers.
// ═══════════════════════════════════════════════════════════════════════

// ── Photo-requirement computation (inlined — backend can't import src/lib) ──
const PASS_VALUES = new Set(['yes','pass','passed','ok','okay','good','acceptable','safe','true','1','complete','completed','satisfactory','meets_code']);
const FAIL_VALUES = new Set(['no','fail','failed','deficient','bad','unacceptable','unsafe','defective','damaged','missing','broken','cracked','false','0']);

function normalizeAnswer(answer) {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(a => String(a).toLowerCase().trim()).join(',');
  return String(answer).toLowerCase().trim();
}
function isPassAnswer(answer) {
  const n = normalizeAnswer(answer);
  if (!n) return false;
  return n.split(',').some(v => PASS_VALUES.has(v));
}
function isFailAnswer(answer) {
  const n = normalizeAnswer(answer);
  if (!n) return false;
  return n.split(',').some(v => FAIL_VALUES.has(v));
}
function resolvePhotoRequirementMode(q) {
  if (!q) return 'not_required';
  if (q.photo_requirement && q.photo_requirement !== 'not_required') return q.photo_requirement;
  if (q.photo_required === true || q.question_type === 'photo') return 'always_required';
  return q.photo_requirement || 'not_required';
}
function answerMatchesConfiguredValues(answer, configuredValues) {
  if (!configuredValues || !Array.isArray(configuredValues) || configuredValues.length === 0) return false;
  const set = new Set(configuredValues.map(v => String(v).toLowerCase().trim()).filter(Boolean));
  if (set.size === 0) return false;
  const n = normalizeAnswer(answer);
  if (!n) return false;
  return n.split(',').map(v => v.trim()).filter(Boolean).some(v => set.has(v));
}
function isPhotoRequiredForAnswer(q, answer) {
  const mode = resolvePhotoRequirementMode(q);
  switch (mode) {
    case 'not_required': case 'optional': return false;
    case 'always_required': return true;
    case 'required_on_pass': return isPassAnswer(answer);
    case 'required_on_fail': return isFailAnswer(answer);
    case 'specific_answers': return answerMatchesConfiguredValues(answer, q.photo_required_answer_values);
    default: return false;
  }
}

// Compute missing required-photo requirements for one submission.
// Each requirement gets a STABLE id: `${submission_id}::${question_id}::photo`
function computeMissingPhotoRequirements(submission, questions) {
  const answers = parseAnswers(submission);
  const visibleIds = answers.__visible_question_ids || null;
  const subQuestions = questions.filter(q => {
    if (q.inspection_module === 'inspection_setup') return false;
    if (submission.inspection_type === 'interior') {
      return !q.inspection_type || q.inspection_type === 'interior' || q.inspection_type === 'both';
    } else if (submission.inspection_type === 'exterior') {
      return q.inspection_type === 'exterior' || q.inspection_type === 'both';
    }
    return true;
  });
  const missing = [];
  for (const q of subQuestions) {
    if (visibleIds && !visibleIds.includes(q.id)) continue;
    const answer = answers[q.id];
    if (!isPhotoRequiredForAnswer(q, answer)) continue;
    const photos = answers[`${q.id}_photos`] || (q.question_type === 'photo' ? answers[q.id] : []) || [];
    const current = Array.isArray(photos) ? photos.length : 0;
    const required = q.minimum_photos || (q.question_type === 'photo' ? 1 : 1);
    const missingCount = Math.max(0, required - current);
    if (missingCount === 0) continue;
    missing.push({
      requirement_id: `${submission.id}::${q.id}::photo`,
      submission_id: submission.id,
      inspection_type: submission.inspection_type || 'interior',
      question_id: q.id,
      question_text: q.question_text,
      requirement_type: 'photo',
      required_count: required,
      actual_count: current,
      missing_count: missingCount,
      allow_override: q.allow_photo_override !== false,
      override_reason_required: q.photo_override_reason_required === true,
    });
  }
  return missing;
}

function parseAnswers(submission) {
  if (!submission?.answers) return {};
  if (typeof submission.answers === 'object') return submission.answers;
  try { return JSON.parse(submission.answers); } catch { return {}; }
}
function parseWaivers(submission) {
  if (!submission?.manager_override_json) return [];
  try { return JSON.parse(submission.manager_override_json); } catch { return []; }
}
function parseRevoked(submission) {
  if (!submission?.override_revoked_json) return [];
  try { return JSON.parse(submission.override_revoked_json); } catch { return []; }
}

function isAuthorizedManager(user) {
  const role = (user?.role || '').toLowerCase();
  return role === 'admin' || role === 'owner';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const { job_id, appointment_id, action = 'validate', requirement_ids, override_reason, reopened_reason, revoke_requirement_ids, revoke_reason } = body;
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    // A technician may reopen only the inspection they submitted, solely to add
    // required documentation. Waiving photos and resubmitting remain Owner/Admin actions.
    const managerWriteActions = ['apply_override', 'revoke_override', 'resubmit'];
    if (managerWriteActions.includes(action) && !isAuthorizedManager(user)) {
      return Response.json({ error: 'Forbidden — only Owner/Admin may perform this action.' }, { status: 403 });
    }

    // 1. Load authoritative submissions + active questions
    const allSubmissions = await base44.asServiceRole.entities.InspectionSubmission
      .filter({ job_id }, '-created_date', 100).catch(() => []);
    // Authoritative = is_authoritative !== false AND not superseded AND status not 'draft'
    const authoritative = allSubmissions.filter(s =>
      s.is_authoritative !== false && !s.superseded_by_id &&
      ['draft', 'submitted', 'reviewed', 'approved', 'reopened'].includes(s.status)
    );
    const questions = await base44.asServiceRole.entities.InspectionQuestion
      .filter({ is_active: true }, 'sort_order', 500).catch(() => []);

    // 2. Compute missing requirements across authoritative submissions
    let missingRequirements = [];
    for (const sub of authoritative) {
      missingRequirements = missingRequirements.concat(computeMissingPhotoRequirements(sub, questions));
    }

    // 3. Gather existing waivers (overridden requirements)
    const overriddenRequirements = [];
    for (const sub of authoritative) {
      for (const w of parseWaivers(sub)) {
        overriddenRequirements.push({
          ...w,
          submission_status: sub.status,
        });
      }
    }
    const waivedIds = new Set(overriddenRequirements.map(w => w.requirement_id));

    // 4. Blocking = missing requirements NOT covered by an override
    const blockingRequirements = missingRequirements.filter(r => !waivedIds.has(r.requirement_id));
    const canComplete = blockingRequirements.length === 0;

    if (action === 'reopen' && !isAuthorizedManager(user)) {
      const submittedByCurrentUser = authoritative.some(s =>
        String(s.technician_email || '').toLowerCase() === String(user.email || '').toLowerCase()
      );
      if (!submittedByCurrentUser) {
        return Response.json({ error: 'Forbidden — only the submitting technician or an Owner/Admin may reopen this inspection.' }, { status: 403 });
      }
    }

    // ── apply_override ──
    if (action === 'apply_override') {
      if (!override_reason || !String(override_reason).trim()) {
        return Response.json({ error: 'override_reason is required' }, { status: 400 });
      }
      if (!Array.isArray(requirement_ids) || requirement_ids.length === 0) {
        return Response.json({ error: 'requirement_ids must list the requirements to waive' }, { status: 400 });
      }
      // Validate each requested requirement is currently missing AND override-allowed
      const missingMap = new Map(missingRequirements.map(r => [r.requirement_id, r]));
      const toWaive = [];
      for (const rid of requirement_ids) {
        const r = missingMap.get(rid);
        if (!r) {
          return Response.json({ error: `Requirement ${rid} is not currently missing — cannot waive.` }, { status: 400 });
        }
        if (r.allow_override === false) {
          return Response.json({ error: `Requirement ${rid} (question: "${r.question_text}") has manager override disabled — photos are mandatory.` }, { status: 400 });
        }
        toWaive.push(r);
      }
      // Group waivers by submission_id and persist (idempotent by requirement_id)
      const bySub = new Map();
      for (const r of toWaive) {
        if (!bySub.has(r.submission_id)) bySub.set(r.submission_id, []);
        bySub.get(r.submission_id).push(r);
      }
      const now = new Date().toISOString();
      for (const [subId, reqs] of bySub) {
        const sub = authoritative.find(s => s.id === subId);
        if (!sub) continue;
        const existing = parseWaivers(sub);
        const existingIds = new Set(existing.map(w => w.requirement_id));
        const merged = [...existing];
        for (const r of reqs) {
          if (existingIds.has(r.requirement_id)) continue; // idempotent — no duplicate
          merged.push({
            requirement_id: r.requirement_id,
            submission_id: r.submission_id,
            question_id: r.question_id,
            requirement_type: r.requirement_type,
            required_count: r.required_count,
            actual_count: r.actual_count,
            waived_by: user.email,
            waived_at: now,
            reason: String(override_reason).trim(),
          });
        }
        await base44.asServiceRole.entities.InspectionSubmission.update(subId, {
          manager_override_json: JSON.stringify(merged),
          override_reason: String(override_reason).trim(),
          override_by: user.email,
          override_at: now,
        });
      }
      // Re-run validator
      const fresh = await recompute(base44, job_id, questions);
      return Response.json({ status: 'success', action: 'apply_override', ...fresh });
    }

    // ── revoke_override ──
    if (action === 'revoke_override') {
      if (!Array.isArray(revoke_requirement_ids) || revoke_requirement_ids.length === 0) {
        return Response.json({ error: 'revoke_requirement_ids is required' }, { status: 400 });
      }
      const now = new Date().toISOString();
      for (const sub of authoritative) {
        const waivers = parseWaivers(sub);
        const revoked = parseRevoked(sub);
        const remaining = [];
        let changed = false;
        for (const w of waivers) {
          if (revoke_requirement_ids.includes(w.requirement_id)) {
            revoked.push({ requirement_id: w.requirement_id, revoked_by: user.email, revoked_at: now, reason: revoke_reason || override_reason || 'manager_revoked' });
            changed = true;
          } else {
            remaining.push(w);
          }
        }
        if (changed) {
          await base44.asServiceRole.entities.InspectionSubmission.update(sub.id, {
            manager_override_json: JSON.stringify(remaining),
            override_revoked_json: JSON.stringify(revoked),
          });
        }
      }
      const fresh = await recompute(base44, job_id, questions);
      return Response.json({ status: 'success', action: 'revoke_override', ...fresh });
    }

    // ── reopen ──
    if (action === 'reopen') {
      if (!reopened_reason || !String(reopened_reason).trim()) {
        return Response.json({ error: 'reopened_reason is required' }, { status: 400 });
      }
      const now = new Date().toISOString();
      // When missing requirements are supplied, reopen only their source
      // inspection(s). This prevents documentation work in Interior Inspection
      // from reopening an unrelated completed Exterior Inspection.
      const requestedSubmissionIds = new Set(
        Array.isArray(requirement_ids)
          ? requirement_ids.map(id => String(id).split('::')[0]).filter(Boolean)
          : []
      );
      const targets = authoritative.filter(s =>
        ['submitted', 'reviewed', 'approved'].includes(s.status) &&
        (requestedSubmissionIds.size === 0 || requestedSubmissionIds.has(s.id))
      );
      if (targets.length === 0) {
        return Response.json({ error: 'No completed inspection to reopen.' }, { status: 400 });
      }
      for (const sub of targets) {
        await base44.asServiceRole.entities.InspectionSubmission.update(sub.id, {
          status: 'reopened',
          reopened_at: now,
          reopened_by: user.email,
          reopened_reason: String(reopened_reason).trim(),
          report_stale: true,
          report_stale_reason: 'reopened_for_missing_photos',
        });
      }
      const fresh = await recompute(base44, job_id, questions);
      return Response.json({ status: 'success', action: 'reopen', reopened_count: targets.length, ...fresh });
    }

    // ── resubmit ──
    if (action === 'resubmit') {
      const now = new Date().toISOString();
      const targets = authoritative.filter(s => s.status === 'reopened');
      for (const sub of targets) {
        await base44.asServiceRole.entities.InspectionSubmission.update(sub.id, {
          status: 'submitted',
          date_submitted: now,
          report_stale: false,
          report_stale_reason: '',
        });
      }
      const fresh = await recompute(base44, job_id, questions);
      return Response.json({ status: 'success', action: 'resubmit', resubmitted_count: targets.length, ...fresh });
    }

    // ── validate (default) ──
    return Response.json({
      status: 'success',
      action: 'validate',
      job_id,
      appointment_id: appointment_id || null,
      can_complete: canComplete,
      missing_requirements: missingRequirements,
      blocking_requirements: blockingRequirements,
      overridden_requirements: overriddenRequirements,
      override_id: overriddenRequirements[0]?.waived_at ? `${overriddenRequirements[0].submission_id}:${overriddenRequirements[0].waived_at}` : null,
      override_reason: overriddenRequirements[0]?.reason || null,
      override_by: overriddenRequirements[0]?.waived_by || null,
      override_at: overriddenRequirements[0]?.waived_at || null,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}

// Recompute the full result from persisted state (after a write action)
async function recompute(base44, jobId, questions) {
  const allSubmissions = await base44.asServiceRole.entities.InspectionSubmission
    .filter({ job_id: jobId }, '-created_date', 100).catch(() => []);
  const authoritative = allSubmissions.filter(s =>
    s.is_authoritative !== false && !s.superseded_by_id &&
    ['draft', 'submitted', 'reviewed', 'approved', 'reopened'].includes(s.status)
  );
  let missingRequirements = [];
  for (const sub of authoritative) {
    missingRequirements = missingRequirements.concat(computeMissingPhotoRequirements(sub, questions));
  }
  const overriddenRequirements = [];
  for (const sub of authoritative) {
    for (const w of parseWaivers(sub)) {
      overriddenRequirements.push({ ...w, submission_status: sub.status });
    }
  }
  const waivedIds = new Set(overriddenRequirements.map(w => w.requirement_id));
  const blockingRequirements = missingRequirements.filter(r => !waivedIds.has(r.requirement_id));
  return {
    can_complete: blockingRequirements.length === 0,
    missing_requirements: missingRequirements,
    blocking_requirements: blockingRequirements,
    overridden_requirements: overriddenRequirements,
    override_id: overriddenRequirements[0]?.waived_at ? `${overriddenRequirements[0].submission_id}:${overriddenRequirements[0].waived_at}` : null,
    override_reason: overriddenRequirements[0]?.reason || null,
    override_by: overriddenRequirements[0]?.waived_by || null,
    override_at: overriddenRequirements[0]?.waived_at || null,
  };
}