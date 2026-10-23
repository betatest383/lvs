import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const gaps = body.gaps || [];

    // Load existing gap review records
    const existing = await base44.asServiceRole.entities.InspectionGapReview.filter({});
    const existingMap = {};
    for (const r of existing) { existingMap[r.gap_id] = r; }

    const currentGapIds = new Set(gaps.map(g => g.gap_id));
    const now = new Date().toISOString();

    const toCreate = [];
    const toUpdate = [];

    for (const gap of gaps) {
      const existingRec = existingMap[gap.gap_id];
      const baseFields = {
        gap_id: gap.gap_id,
        question_id: gap.question_id,
        question_text: gap.question_text,
        gap_type: gap.gap_type,
        gap_category: gap.gap_category,
        priority: gap.gap_priority,
        confidence_score: gap.confidence_score,
        confidence_level: gap.confidence_level,
        confidence_reason: gap.confidence_reason,
        systems_affected: JSON.stringify(gap.impact_systems || []),
        question_role: gap.question_role,
        question_purpose: gap.question_purpose,
        question_category: gap.question_category,
        section: gap.section,
        subsection: gap.subsection,
        inspection_type: gap.inspection_type,
        repair_system: gap.repair_system,
        nfpa_211_question: gap.nfpa_211_question,
        safety_concern: gap.safety_concern,
        estimate_recommendation: gap.estimate_recommendation,
        customer_pdf: gap.customer_pdf,
        logic_source: gap.logic_source,
        gap_why: gap.gap_why,
        gap_action: gap.gap_action,
        matrix_build_date: gap.matrix_build_date,
        last_synced_at: now,
      };

      if (existingRec) {
        // Update metadata, preserve status/assignment unless previously fixed
        const updateData = {
          id: existingRec.id,
          ...baseFields,
          status: existingRec.status === 'fixed' ? 'new' : existingRec.status,
          assigned_to: existingRec.assigned_to,
          department: existingRec.department,
          target_date: existingRec.target_date,
          priority_override: existingRec.priority_override,
          reviewed_by: existingRec.reviewed_by,
          review_date: existingRec.review_date,
          resolution_notes: existingRec.resolution_notes,
        };
        toUpdate.push(updateData);
      } else {
        toCreate.push({ ...baseFields, status: 'new' });
      }
    }

    // Mark missing records as fixed (auto-resolved after matrix rebuild)
    const toMarkFixed = [];
    for (const rec of existing) {
      if (!currentGapIds.has(rec.gap_id) && rec.status !== 'fixed' && rec.status !== 'not_applicable') {
        toMarkFixed.push({
          id: rec.id,
          status: 'fixed',
          review_date: now,
          resolution_notes: (rec.resolution_notes || '') + '\n[Auto-resolved: Gap no longer detected after matrix rebuild.]',
        });
      }
    }

    let created = [];
    if (toCreate.length > 0) {
      created = await base44.asServiceRole.entities.InspectionGapReview.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      await base44.asServiceRole.entities.InspectionGapReview.bulkUpdate(toUpdate);
    }
    if (toMarkFixed.length > 0) {
      await base44.asServiceRole.entities.InspectionGapReview.bulkUpdate(toMarkFixed);
    }

    return Response.json({
      status: 'success',
      created: created.length,
      updated: toUpdate.length,
      marked_fixed: toMarkFixed.length,
      total_gaps: gaps.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});