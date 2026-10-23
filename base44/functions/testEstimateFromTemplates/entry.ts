import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { inspection_id, job_id, appointment_id } = body;

    if (!inspection_id && !job_id) {
      return Response.json({ error: 'inspection_id or job_id is required' }, { status: 400 });
    }

    // 1. Load findings from both sources
    const findingQuery = inspection_id ? { inspection_id } : { job_id };
    const [inspectionFindings, legacyFindingsRaw, templates, serviceCatalog] = await Promise.all([
      base44.asServiceRole.entities.InspectionFinding.filter(findingQuery).catch(() => []),
      base44.asServiceRole.entities.Finding.filter(findingQuery).catch(() => []),
      base44.asServiceRole.entities.RepairRecommendationTemplate.filter({ is_active: true }).catch(() => []),
      base44.asServiceRole.entities.ServiceCatalog.filter({ is_active: true }).catch(() => []),
    ]);

    // Normalize legacy findings
    const legacyFindings = legacyFindingsRaw.map(f => ({
      id: f.id,
      inspection_id: f.inspection_id,
      job_id: f.job_id,
      customer_id: f.customer_id || '',
      deficiency_type: f.finding_type || '',
      finding_location: f.category || '',
      severity: f.severity || 'moderate',
      customer_facing_explanation: f.narrative_output || '',
      recommended_repair: '',
      is_deficiency: true,
      internal_only: false,
      include_in_estimate: true,
      _source: 'legacy',
    }));

    for (const f of inspectionFindings) {
      if (!f._source) f._source = 'inspection_finding';
    }

    const allFindings = [...inspectionFindings, ...legacyFindings];

    // 2. Filter eligible findings
    const eligibleFindings = allFindings.filter(f =>
      f.include_in_estimate !== false &&
      f.internal_only !== true &&
      f.is_deficiency !== false &&
      f.deficiency_type
    );

    // 3. Run template matching for each finding (dry-run, no persistence)
    const results = [];
    let totalEstimatedValue = 0;

    for (const finding of eligibleFindings) {
      const item = {
        deficiency_type: finding.deficiency_type,
        severity: finding.severity,
        title: finding.finding_location || finding.deficiency_type,
        description: finding.customer_facing_explanation || '',
        category: finding.interior_exterior || '',
      };

      const templateMatches = findMatchingTemplate(item, templates);
      let matchedTemplate = null;
      let service = null;
      let status = 'manual_review';
      let matchSource = 'none';
      const warnings = [];

      if (templateMatches.length > 0 && templateMatches[0].score >= 8) {
        matchedTemplate = templateMatches[0].template;
        matchSource = 'template';

        if (matchedTemplate.service_catalog_id) {
          service = serviceCatalog.find(s => s.id === matchedTemplate.service_catalog_id) || null;
        }

        if (templateMatches.length === 1 || templateMatches[0].score >= (templateMatches[1]?.score || 0) + 5) {
          status = 'ready';
        } else {
          status = 'suggested_service';
          warnings.push(`${templateMatches.length} templates matched — technician must select the best option`);
        }
      } else {
        // Fallback: try ServiceCatalog keyword matching
        const fallback = matchService(item, null, serviceCatalog);
        if (fallback.service) {
          service = fallback.service;
          matchSource = 'service_catalog';
          status = fallback.matchType === 'user_selected' ? 'ready' : 'suggested_service';
        } else {
          status = 'manual_review';
          warnings.push('No template or service match found — manual review required');
        }
      }

      // Build materials preview
      const materials = buildMaterialsPreview(matchedTemplate, service);
      const servicePrice = matchedTemplate?.default_selling_price || service?.default_selling_price || 0;
      const chargeableMaterialsTotal = materials
        .filter(m => m.chargeable_to_customer !== false)
        .reduce((sum, m) => sum + (m.unit_price || 0) * (m.quantity || 1), 0);
      const estimatedPrice = servicePrice + chargeableMaterialsTotal;

      if (status !== 'manual_review' && servicePrice === 0) {
        status = 'missing_price';
        warnings.push('Matched service has no selling price');
      }

      totalEstimatedValue += status === 'manual_review' ? 0 : estimatedPrice;

      results.push({
        finding_id: finding.id,
        source: finding._source,
        deficiency_type: finding.deficiency_type,
        severity: finding.severity,
        title: finding.finding_location || finding.deficiency_type,
        description: finding.customer_facing_explanation || '',
        template_match: matchedTemplate ? {
          template_id: matchedTemplate.id,
          template_name: matchedTemplate.template_name,
          score: templateMatches[0].score,
          match_reasons: templateMatches[0].reasons,
          all_matches: templateMatches.slice(0, 3).map(m => ({
            template_name: m.template.template_name,
            score: m.score,
          })),
        } : null,
        match_source: matchSource,
        recommended_service: service ? {
          service_catalog_id: service.id,
          service_name: service.service_name,
          service_code: service.service_code,
          default_selling_price: service.default_selling_price,
          estimated_time_hours: service.estimated_time_hours,
          estimated_time_minutes: service.estimated_time_minutes,
        } : matchedTemplate ? {
          service_name: matchedTemplate.service_name,
          default_selling_price: matchedTemplate.default_selling_price,
          estimated_time_hours: matchedTemplate.estimated_time_hours,
          estimated_time_minutes: matchedTemplate.estimated_time_minutes,
        } : null,
        materials_added: materials,
        estimated_price: round2(estimatedPrice),
        status,
        warnings,
      });
    }

    // 4. Build summary
    const summary = {
      ready: results.filter(r => r.status === 'ready').length,
      suggested_service: results.filter(r => r.status === 'suggested_service').length,
      manual_review: results.filter(r => r.status === 'manual_review').length,
      missing_price: results.filter(r => r.status === 'missing_price').length,
      total_findings_scanned: allFindings.length,
      total_eligible: eligibleFindings.length,
      total_estimated_value: round2(totalEstimatedValue),
      templates_available: templates.length,
    };

    return Response.json({
      status: 'success',
      results,
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Template Matching (same logic as autoBuildDraftEstimate) ---

function findMatchingTemplate(item, templates) {
  const itemDefType = (item.deficiency_type || '').toLowerCase().trim();
  const itemSeverity = (item.severity || '').toLowerCase().trim();
  const itemTitle = (item.title || '').toLowerCase();
  const itemDescription = (item.description || item.customer_summary || '').toLowerCase();
  const itemCategory = (item.category || item.interior_exterior || '').toLowerCase();

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
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    let keywordHits = 0;
    for (const kw of keywords) {
      if (itemTitle.includes(kw) || itemDescription.includes(kw) || itemDefType.includes(kw)) {
        keywordHits++;
      }
    }
    if (keywords.length > 0 && keywordHits > 0) {
      score += keywordHits * 3;
      reasons.push(`${keywordHits} keyword(s) matched`);
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

    if (score > 0) {
      matches.push({ template: tpl, score, reasons });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function matchService(item, linkedRec, serviceCatalog) {
  if (item.pricebook_item_name) {
    const pbName = item.pricebook_item_name.toLowerCase().trim();
    const direct = serviceCatalog.find(s =>
      s.service_name?.toLowerCase().trim() === pbName ||
      s.service_code?.toLowerCase().trim() === pbName
    );
    if (direct) return { service: direct, matchType: 'user_selected' };
  }

  const keywords = [
    item.deficiency_type,
    item.title,
  ].filter(k => k && k.trim()).map(k => k.toLowerCase());

  let bestMatch = null;
  let bestScore = 0;

  for (const svc of serviceCatalog) {
    const svcText = [
      svc.service_name,
      svc.service_code,
      svc.category,
      svc.description,
      svc.customer_description,
    ].filter(t => t).join(' ').toLowerCase();

    let score = 0;
    for (const keyword of keywords) {
      if (!keyword) continue;
      const words = keyword.split(/[\s\/\-_]+/).filter(w => w.length > 2);
      for (const word of words) {
        if (svcText.includes(word)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = svc;
    }
  }

  if (bestMatch && bestScore >= 2) {
    return { service: bestMatch, matchType: 'suggested' };
  }

  return { service: null, matchType: 'none' };
}

function buildMaterialsPreview(template, service) {
  const materials = [];

  if (template?.default_materials) {
    try {
      const raw = JSON.parse(template.default_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          materials.push({
            material_name: m.material_name || '',
            quantity: m.quantity || 1,
            unit_price: m.unit_price || 0,
            chargeable: m.chargeable_to_customer !== false,
          });
        }
      }
    } catch { /* ignore */ }
  }

  if (template?.internal_materials) {
    try {
      const raw = JSON.parse(template.internal_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          materials.push({
            material_name: m.material_name || '',
            quantity: m.quantity || 1,
            unit_price: m.unit_price || 0,
            chargeable: false,
          });
        }
      }
    } catch { /* ignore */ }
  }

  if (materials.length === 0 && service?.default_materials) {
    try {
      const raw = JSON.parse(service.default_materials);
      if (Array.isArray(raw)) {
        for (const m of raw) {
          materials.push({
            material_name: m.material_name || '',
            quantity: m.quantity || 1,
            unit_price: m.unit_price || 0,
            chargeable: m.chargeable_to_customer !== false,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return materials;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}