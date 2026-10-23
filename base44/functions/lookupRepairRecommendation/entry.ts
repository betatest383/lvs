import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      inspection_section,
      deficiency_type,
      failed_question_text,
      finding_title,
      finding_description,
      severity,
      appliance_type,
      chimney_system_type,
    } = body;

    if (!deficiency_type && !finding_title && !finding_description) {
      return Response.json({ error: 'At least one of deficiency_type, finding_title, or finding_description is required' }, { status: 400 });
    }

    const templates = await base44.asServiceRole.entities.RepairRecommendationTemplate
      .filter({ is_active: true })
      .catch(() => []);

    const item = {
      deficiency_type: deficiency_type || '',
      severity: severity || '',
      title: finding_title || '',
      description: finding_description || '',
      category: inspection_section || '',
      appliance_type: appliance_type || '',
      chimney_system_type: chimney_system_type || '',
      failed_question_text: failed_question_text || '',
    };

    const matches = findMatchingTemplate(item, templates);

    if (matches.length === 0) {
      return Response.json({
        status: 'success',
        matched: false,
        confidence_score: 0,
        message: 'No matching template found',
      });
    }

    const best = matches[0];
    const confidencePct = Math.min(100, Math.round((best.score / 30) * 100));

    // Resolve linked service catalog
    let serviceMapping = null;
    if (best.template.service_catalog_id) {
      const svc = await base44.asServiceRole.entities.ServiceCatalog
        .get(best.template.service_catalog_id)
        .catch(() => null);
      if (svc) {
        serviceMapping = {
          service_catalog_id: svc.id,
          service_name: svc.service_name,
          service_code: svc.service_code,
          default_selling_price: svc.default_selling_price,
          estimated_time_hours: svc.estimated_time_hours,
          estimated_time_minutes: svc.estimated_time_minutes,
        };
      }
    }

    const materialMapping = buildMaterialSummary(best.template);

    const estimateConfig = {
      estimate_required: best.template.default_estimate_required ?? true,
      pricing_mode: best.template.pricing_mode || 'service_catalog_price',
      default_price_override: best.template.default_selling_price || 0,
      estimated_time_hours: best.template.estimated_time_hours || 0,
      estimated_time_minutes: best.template.estimated_time_minutes || 0,
    };

    // Determine expected estimate status
    let expectedStatus = 'manual_review';
    const hasService = !!(best.template.service_catalog_id || best.template.service_name);
    const hasPrice = (best.template.default_selling_price > 0) || (serviceMapping?.default_selling_price > 0);

    if (matches.length === 1 || best.score >= (matches[1]?.score || 0) + 5) {
      if (hasService && hasPrice) {
        expectedStatus = 'ready';
      } else if (hasService) {
        expectedStatus = 'suggested_service';
      } else {
        expectedStatus = 'manual_review';
      }
    } else {
      expectedStatus = 'suggested_service';
    }

    // Update last_tested_at
    await base44.asServiceRole.entities.RepairRecommendationTemplate
      .update(best.template.id, { last_tested_at: new Date().toISOString() })
      .catch(() => {});

    return Response.json({
      status: 'success',
      matched: true,
      template_id: best.template.id,
      template_name: best.template.template_name,
      confidence_score: confidencePct,
      matched_keywords: best.reasons,
      recommendation_content: {
        disposition_default: best.template.disposition_default || '',
        customer_summary: best.template.customer_summary || best.template.customer_facing_recommendation || '',
        recommended_solution: best.template.recommended_solution || '',
        internal_notes: best.template.internal_notes || '',
        safety_notes: best.template.safety_notes || '',
        code_reference_notes: best.template.code_reference_notes || '',
      },
      service_mapping: serviceMapping,
      material_mapping: materialMapping,
      estimate_config: estimateConfig,
      expected_estimate_status: expectedStatus,
      all_matches: matches.slice(0, 5).map(m => ({
        template_id: m.template.id,
        template_name: m.template.template_name,
        score: m.score,
        confidence: Math.min(100, Math.round((m.score / 30) * 100)),
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function findMatchingTemplate(item, templates) {
  const itemDefType = (item.deficiency_type || '').toLowerCase().trim();
  const itemSeverity = (item.severity || '').toLowerCase().trim();
  const itemTitle = (item.title || '').toLowerCase();
  const itemDescription = (item.description || '').toLowerCase();
  const itemCategory = (item.category || '').toLowerCase();
  const itemAppliance = (item.appliance_type || '').toLowerCase();
  const itemFailedQ = (item.failed_question_text || '').toLowerCase();

  const matches = [];

  for (const tpl of templates) {
    let score = 0;
    const reasons = [];

    const tplDefType = (tpl.deficiency_type || '').toLowerCase().trim();
    if (tplDefType && tplDefType === itemDefType) {
      score += 10;
      reasons.push('deficiency_type exact match');
    } else if (tplDefType && itemDefType && (itemDefType.includes(tplDefType) || tplDefType.includes(itemDefType))) {
      score += 7;
      reasons.push('deficiency_type partial match');
    }

    const tplSeverity = (tpl.severity || '').toLowerCase().trim();
    if (tplSeverity) {
      if (tplSeverity === itemSeverity) {
        score += 5;
        reasons.push('severity match');
      } else {
        continue;
      }
    }

    const keywords = (tpl.finding_keywords || '')
      .split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    let keywordHits = 0;
    for (const kw of keywords) {
      if (itemTitle.includes(kw) || itemDescription.includes(kw) || itemDefType.includes(kw)) {
        keywordHits++;
      }
    }
    if (keywords.length > 0 && keywordHits > 0) {
      score += keywordHits * 3;
      reasons.push(`${keywordHits} finding keyword(s) matched`);
    }

    // Failed question keywords
    const fqKeywords = (tpl.failed_question_keywords || '')
      .split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    let fqHits = 0;
    for (const kw of fqKeywords) {
      if (itemFailedQ.includes(kw)) fqHits++;
    }
    if (fqKeywords.length > 0 && fqHits > 0) {
      score += fqHits * 3;
      reasons.push(`${fqHits} failed-question keyword(s) matched`);
    }

    const tplCategory = (tpl.inspection_category || '').toLowerCase().trim();
    if (tplCategory && itemCategory) {
      if (tplCategory === itemCategory) {
        score += 4;
        reasons.push('category match');
      } else if (itemCategory.includes(tplCategory) || tplCategory.includes(itemCategory)) {
        score += 2;
        reasons.push('category partial match');
      }
    }

    const tplSection = (tpl.inspection_section || '').toLowerCase().trim();
    if (tplSection && itemCategory) {
      if (tplSection === itemCategory) {
        score += 3;
        reasons.push('section match');
      }
    }

    const tplAppliance = (tpl.appliance_type || '').toLowerCase().trim();
    if (tplAppliance && itemAppliance) {
      if (tplAppliance === itemAppliance) {
        score += 4;
        reasons.push('appliance type match');
      }
    }

    if (score > 0) {
      matches.push({ template: tpl, score, reasons });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function buildMaterialSummary(template) {
  const result = { default: [], optional: [], internal: [] };
  for (const field of ['default_materials', 'optional_materials', 'internal_materials']) {
    const key = field.replace('_materials', '');
    if (template[field]) {
      try {
        const raw = JSON.parse(template[field]);
        if (Array.isArray(raw)) {
          result[key] = raw.map(m => ({
            material_name: m.material_name || '',
            quantity: m.quantity || 1,
            unit_price: m.unit_price || 0,
            chargeable_to_customer: m.chargeable_to_customer !== false,
            customer_visible: m.customer_visible !== false,
          }));
        }
      } catch { /* ignore */ }
    }
  }
  return result;
}