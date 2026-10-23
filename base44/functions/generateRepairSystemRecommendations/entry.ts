import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const REPAIR_SYSTEMS = {
  crown: {
    type: 'crown',
    label: 'Crown System',
    title: 'Cast-in-Place Concrete Crown Replacement',
    deficiencyTypes: ['cracked_crown','spalling_crown','crown_wash_failure','missing_drip_edge','water_entry_crown','deteriorated_crown'],
    requiredMeasurements: ['crown_area','crown_diameter'],
    codeReferences: 'NFPA 211 §14.2 — Crown weather protection',
    summary: 'The chimney crown is cracked, deteriorated, or missing key weather-shedding features, allowing water infiltration into the chimney structure.',
    explanation: 'The chimney crown is the concrete or mortar cap that seals the top of the chimney and sheds water away from the flue. Cracks, spalling, or a deteriorated crown wash allow water to penetrate the chimney, which can cause interior damage, spalling brick, and freeze-thaw damage. Multiple deficiencies have been identified across the crown system that should be addressed as a unified repair.',
    defaultOptions: [
      { tier: 'good', label: 'Crown Sealant Application', pricebook_item_name: 'Crown Sealant Application', unit_price: 350, unit: 'ea', customer_description: 'Apply high-temperature crown sealant to fill cracks in the existing chimney crown, preventing water infiltration.' },
      { tier: 'better', label: 'Crown Wash Repair & Waterproof Seal', pricebook_item_name: 'Crown Wash Repair & Seal', unit_price: 850, unit: 'ea', customer_description: 'Repair deteriorated crown wash mortar and apply waterproof sealant with drip edge installation.' },
      { tier: 'best', label: 'Cast-in-Place Concrete Crown Replacement', pricebook_item_name: 'Cast-in-Place Concrete Crown Replacement', unit_price: 1850, unit: 'ea', customer_description: 'Remove the existing deteriorated crown and pour a new reinforced cast-in-place concrete crown with proper drip edge and weatherproofing.' },
    ],
  },
  masonry: {
    type: 'masonry',
    label: 'Masonry System',
    title: 'Chimney Masonry Restoration',
    deficiencyTypes: ['missing_mortar_joints','spalling_brick','loose_brick','leaning_chimney','water_intrusion','cracked_bricks','deteriorated_mortar'],
    requiredMeasurements: ['linear_feet','brick_count','chimney_height'],
    codeReferences: 'NFPA 211 §14.4 — Masonry requirements',
    summary: 'The chimney masonry is deteriorated with missing mortar, spalling or loose brick, or structural concerns requiring restoration.',
    explanation: 'The brick and mortar of your chimney are exposed to harsh weather conditions year-round. Over time, mortar joints erode, bricks spall or loosen, and water intrusion can compromise the structural integrity. The identified deficiencies indicate that masonry restoration is needed to prevent further deterioration and potential safety hazards.',
    defaultOptions: [
      { tier: 'good', label: 'Tuckpointing — Mortar Joint Repair', pricebook_item_name: 'Tuckpointing (per linear foot)', unit_price: 25, unit: 'lf', customer_description: 'Grind out deteriorated mortar joints and repoint with new Type N mortar to restore structural integrity.' },
      { tier: 'better', label: 'Partial Chimney Rebuild', pricebook_item_name: 'Partial Chimney Rebuild', unit_price: 2800, unit: 'ea', customer_description: 'Remove and replace deteriorated brick sections above the roofline, including tuckpointing of remaining joints.' },
      { tier: 'best', label: 'Full Chimney Rebuild (Above Roofline)', pricebook_item_name: 'Full Chimney Rebuild', unit_price: 5500, unit: 'ea', customer_description: 'Tear down and rebuild the entire chimney above the roofline with new brick, mortar, and crown.' },
    ],
  },
  liner: {
    type: 'liner',
    label: 'Liner System',
    title: 'Stainless Steel Liner System',
    deficiencyTypes: ['cracked_clay_liner','missing_flue_mortar','improper_sizing','unsafe_venting','damaged_liner','gaps_flue_tiles','deteriorated_flue'],
    requiredMeasurements: ['flue_height','flue_diameter','appliance_btu'],
    codeReferences: 'NFPA 211 §14.9 — Flue lining requirements',
    summary: 'The flue liner is cracked, deteriorated, or improperly sized, creating unsafe venting conditions for combustion appliances.',
    explanation: 'The flue liner protects the chimney structure from heat and combustion byproducts. Cracked tiles, missing mortar, or improper sizing can allow toxic gases including carbon monoxide to leak into the home. The identified deficiencies indicate that flue relining is necessary to ensure safe venting of your appliances per NFPA 211 standards.',
    defaultOptions: [
      { tier: 'good', label: 'Cast-in-Place Liner', pricebook_item_name: 'Cast-in-Place Flue Liner', unit_price: 2200, unit: 'ea', customer_description: 'Install a cast-in-place refractory liner to restore the flue passage and improve insulation.' },
      { tier: 'better', label: 'Stainless Steel Liner System', pricebook_item_name: 'Stainless Steel Liner System', unit_price: 2950, unit: 'ea', customer_description: 'Install a UL-listed 316Ti stainless steel flexible liner with insulation blanket to properly vent the appliance.' },
      { tier: 'best', label: 'Heavy-Duty Stainless Liner with Insulation & Warranty', pricebook_item_name: 'Heavy-Duty Stainless Liner (Lifetime Warranty)', unit_price: 3800, unit: 'ea', customer_description: 'Install a lifetime-warranty heavy-wall stainless steel liner with full insulation and top/bottom termination kits.' },
    ],
  },
  smoke_chamber: {
    type: 'smoke_chamber',
    label: 'Smoke Chamber System',
    title: 'Smoke Chamber Resurfacing',
    deficiencyTypes: ['smoke_chamber_gaps','smoke_chamber_cracking','corbeling_issues','creosote_buildup','rough_smoke_chamber','smoke_chamber_deterioration'],
    requiredMeasurements: ['smoke_chamber_height','smoke_chamber_depth'],
    codeReferences: 'NFPA 211 §14.11 — Smoke chamber requirements',
    summary: 'The smoke chamber has gaps, cracking, corbeling irregularities, or creosote buildup that affects draft and safety.',
    explanation: 'The smoke chamber transitions smoke from the fireplace opening to the flue. Gaps, cracks, and rough corbeled surfaces create turbulence and creosote accumulation. Resurfacing the smoke chamber smooths the interior, improves draft, and reduces fire risk per code requirements.',
    defaultOptions: [
      { tier: 'good', label: 'Smoke Chamber Parging', pricebook_item_name: 'Smoke Chamber Parging', unit_price: 650, unit: 'ea', customer_description: 'Apply high-temperature refractory parging compound to smooth rough smoke chamber walls.' },
      { tier: 'better', label: 'Smoke Chamber Resurfacing & Joint Repair', pricebook_item_name: 'Smoke Chamber Resurfacing', unit_price: 1100, unit: 'ea', customer_description: 'Repair cracked joints, fill gaps, and resurface the smoke chamber with insulating refractory material.' },
      { tier: 'best', label: 'Smoke Chamber Rebuild & Insulation', pricebook_item_name: 'Smoke Chamber Rebuild', unit_price: 2400, unit: 'ea', customer_description: 'Rebuild corbeled walls to code-compliant geometry and insulate with refractory panels.' },
    ],
  },
  clearance_combustible: {
    type: 'clearance_combustible',
    label: 'Clearance / Combustible Protection',
    title: 'Clearance to Combustibles Correction',
    deficiencyTypes: ['inadequate_clearance','inadequate_clearance_to_combustibles','clearance_violation','clearance_failure','insufficient_clearance'],
    requiredMeasurements: ['required_clearance','actual_clearance','clearance_deficiency'],
    codeReferences: 'NFPA 211 §13.1.1 — Clearance to Combustibles; Manufacturer Installation Requirements',
    summary: 'The appliance or venting installation does not maintain required clearance to combustible materials, creating a fire safety hazard that must be corrected.',
    explanation: 'Clearance to combustibles refers to the required minimum distance between heat-producing surfaces (appliance, vent pipe, chimney) and nearby combustible materials (walls, floors, framing). Inadequate clearance is a serious fire safety hazard. The deficiency must be corrected by relocating the appliance, installing listed heat shields where permitted, or reconfiguring the installation to meet manufacturer requirements and NFPA 211 standards.',
    defaultOptions: [
      { tier: 'good', label: 'Document & Clearance Correction Recommendation', pricebook_item_name: 'Clearance Correction Recommendation (Document)', unit_price: 0, unit: 'ea', customer_description: 'Document the clearance deficiency and provide a written recommendation to correct the clearance issue per manufacturer requirements and NFPA 211 standards.' },
      { tier: 'better', label: 'Install Listed Heat Protection System', pricebook_item_name: 'Listed Wall/Floor Heat Shield Installation', unit_price: 450, unit: 'ea', customer_description: 'Install a listed wall and/or floor heat protection system where permitted by manufacturer instructions and applicable codes to reduce required clearance.' },
      { tier: 'best', label: 'Reconfigure / Relocate Appliance & Venting', pricebook_item_name: 'Appliance Relocation & Clearance Reconfiguration', unit_price: 1200, unit: 'ea', customer_description: 'Reconfigure or relocate the appliance and venting system to meet all required clearances to combustibles per manufacturer installation requirements and NFPA 211 authority standards.' },
    ],
  },
  floor_protection: {
    type: 'floor_protection',
    label: 'Floor Protection / Hearth Extension',
    title: 'Floor Protection / Hearth Extension Correction',
    deficiencyTypes: ['inadequate_floor_protection','inadequate_hearth_extension','missing_hearth_extension','non_compliant_hearth_pad','insufficient_floor_protection','hearth_extension_deficiency'],
    requiredMeasurements: ['required_hearth_depth','actual_hearth_depth','required_hearth_width','actual_hearth_width'],
    codeReferences: 'NFPA 211 §13.2 — Hearth Extensions; Manufacturer Installation Requirements',
    summary: 'The floor protection or hearth extension does not meet required dimensions or material specifications, creating a fire safety hazard.',
    explanation: 'Floor protection (hearth extension) is the non-combustible material in front of and beneath the appliance that protects combustible flooring from radiant heat, sparks, and embers. Inadequate floor protection or an undersized hearth extension is a fire safety hazard. The deficiency must be corrected by extending or replacing the hearth pad to meet required dimensions from manufacturer instructions and applicable standards.',
    defaultOptions: [
      { tier: 'good', label: 'Add Listed Floor Protection Extension', pricebook_item_name: 'Listed Floor Protection Extension', unit_price: 285, unit: 'ea', customer_description: 'Add a listed floor protection extension to the existing hearth pad to meet required clearance dimensions.' },
      { tier: 'better', label: 'Replace/Upgrade Hearth Pad', pricebook_item_name: 'Hearth Pad Replacement (Compliant)', unit_price: 650, unit: 'ea', customer_description: 'Replace the non-compliant hearth pad with a listed floor protection system meeting all required clearance dimensions per manufacturer instructions.' },
      { tier: 'best', label: 'Full Hearth / Floor Protection Redesign', pricebook_item_name: 'Hearth & Floor Protection Redesign', unit_price: 1800, unit: 'ea', customer_description: 'Complete hearth and floor protection redesign for a fully compliant installation, including substrate preparation and listed materials meeting all code requirements.' },
    ],
  },
  cap_chase: {
    type: 'cap_chase',
    label: 'Cap / Chase Cover System',
    title: 'Chimney Cap / Chase Cover Replacement',
    deficiencyTypes: ['missing_cap','rusted_chase_cover','water_stains_cap','animal_entry','damaged_cap','deteriorated_chase_cover'],
    requiredMeasurements: ['flue_diameter','chase_width','chase_depth'],
    codeReferences: 'NFPA 211 §14.2.1 — Spark arrestor / rain cap',
    summary: 'The chimney cap or chase cover is missing, rusted, or damaged, allowing water and animal entry into the chimney.',
    explanation: 'The chimney cap or chase cover prevents rain, snow, debris, and animals from entering the flue. A missing or rusted cover allows water to damage the flue liner and interior components, and animals can nest in the chimney creating blockages. The identified deficiencies indicate cap or chase cover replacement is needed.',
    defaultOptions: [
      { tier: 'good', label: 'Stainless Steel Chimney Cap', pricebook_item_name: 'Stainless Steel Chimney Cap', unit_price: 285, unit: 'ea', customer_description: 'Install a stainless steel rain cap with spark arrestor on the flue termination.' },
      { tier: 'better', label: 'Chase Cover Replacement (Stainless)', pricebook_item_name: 'Stainless Chase Cover Replacement', unit_price: 650, unit: 'ea', customer_description: 'Fabricate and install a custom stainless steel chase cover with drip edges and proper cross-ventilation.' },
      { tier: 'best', label: 'Full Chase Top Rebuild with Cap', pricebook_item_name: 'Chase Top Rebuild with Cap', unit_price: 1200, unit: 'ea', customer_description: 'Rebuild the chase top framing, install a stainless chase cover, and add a top-mount chimney cap.' },
    ],
  },
};

function getRepairSystemForDeficiency(deficiencyType) {
  for (const key of Object.keys(REPAIR_SYSTEMS)) {
    const sys = REPAIR_SYSTEMS[key];
    if (sys.deficiencyTypes.includes(deficiencyType)) return sys;
  }
  return null;
}

function severityWeight(sev) {
  const map = { critical: 15, major: 12, moderate: 8, minor: 4, info: 0 };
  return map[sev] || 0;
}

function getHighestSeverity(findings) {
  const order = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };
  let highest = 'info';
  let highestVal = -1;
  for (const f of findings) {
    const v = order[f.severity] ?? 0;
    if (v > highestVal) { highestVal = v; highest = f.severity; }
  }
  return highest;
}

function getCustomerPhotos(finding) {
  const internal = finding.photos_internal_only || [];
  return (finding.photo_urls || []).filter(url => !internal.includes(url));
}

function calculateConfidence(findings, sysConfig, mappingCoverage) {
  let score = 20;
  const reasons = [];

  const findingCount = findings.length;
  const findingPoints = Math.min(findingCount * 12, 36);
  score += findingPoints;
  if (findingCount >= 3) reasons.push(`${findingCount} supporting findings`);

  const sev = getHighestSeverity(findings);
  const sevPoints = severityWeight(sev);
  score += sevPoints;
  const criticalCount = findings.filter(f => f.severity === 'critical' || f.severity === 'major').length;
  if (criticalCount > 0) reasons.push(`${criticalCount} major/critical severity finding${criticalCount !== 1 ? 's' : ''}`);

  const hasNfpa = findings.some(f => f.nfpa_code_failure);
  if (hasNfpa) { score += 12; reasons.push('NFPA code failure detected'); }

  const hasSafety = findings.some(f => f.safety_concern);
  if (hasSafety) { score += 8; reasons.push('safety concern flagged'); }

  const totalPhotos = findings.reduce((sum, f) => sum + getCustomerPhotos(f).length, 0);
  if (totalPhotos > 0) { score += 8; reasons.push(`${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''} attached`); }
  if (totalPhotos >= 3) score += 4;

  let hasRelevantMeasurements = false;
  for (const f of findings) {
    let meas = {};
    try { meas = JSON.parse(f.measurements || '{}'); } catch { /* ignore */ }
    if (sysConfig?.requiredMeasurements && sysConfig.requiredMeasurements.some(key => meas[key] != null)) {
      hasRelevantMeasurements = true; break;
    }
  }
  if (hasRelevantMeasurements) { score += 8; reasons.push('relevant measurements present'); }

  if (mappingCoverage === 'all') { score += 8; reasons.push('all findings have pricebook mappings'); }
  else if (mappingCoverage === 'partial') { score += 4; reasons.push('partial pricebook mappings'); }
  else if (mappingCoverage === 'none') { reasons.push('no pricebook mappings — manual assignment needed'); }

  score = Math.min(score, 100);
  return { score, reasons: reasons.join(', ') };
}

function buildOptions(sysConfig, mappings, findings) {
  const optionsByTier = { good: [], better: [], best: [], standalone: [] };

  for (const m of mappings) {
    const tier = m.option_tier || 'standalone';
    if (!optionsByTier[tier]) optionsByTier[tier] = [];
    optionsByTier[tier].push(m);
  }

  const options = [];

  for (const tier of ['good', 'better', 'best']) {
    const tierMappings = optionsByTier[tier] || [];
    if (tierMappings.length > 0) {
      const m = tierMappings[0];
      let quantity = m.default_quantity || 1;
      let measurements = {};
      for (const f of findings) {
        try { measurements = { ...measurements, ...JSON.parse(f.measurements || '{}') }; } catch { /* ignore */ }
      }
      if (m.quantity_from_measurement && measurements[m.quantity_from_measurement] != null) {
        const measVal = parseFloat(measurements[m.quantity_from_measurement]) || 0;
        quantity = Math.ceil(measVal * (m.quantity_multiplier || 1));
      }
      options.push({
        tier,
        label: m.option_label || m.pricebook_item_name,
        pricebook_item_name: m.pricebook_item_name,
        pricebook_item_id: m.pricebook_item_id || '',
        unit_price: m.unit_price || 0,
        quantity,
        unit: m.unit || 'ea',
        line_total: quantity * (m.unit_price || 0),
        customer_description: m.customer_description_template || m.report_language || '',
        material_calculation: m.material_calculation || '',
        selected: false,
      });
    } else {
      const def = sysConfig.defaultOptions.find(o => o.tier === tier);
      if (def) {
        options.push({
          tier: def.tier,
          label: def.label,
          pricebook_item_name: def.pricebook_item_name,
          pricebook_item_id: '',
          unit_price: def.unit_price || 0,
          quantity: 1,
          unit: def.unit || 'ea',
          line_total: def.unit_price || 0,
          customer_description: def.customer_description || '',
          material_calculation: '',
          selected: false,
        });
      }
    }
  }

  for (const m of (optionsByTier.standalone || [])) {
    let quantity = m.default_quantity || 1;
    let measurements = {};
    for (const f of findings) {
      try { measurements = { ...measurements, ...JSON.parse(f.measurements || '{}') }; } catch { /* ignore */ }
    }
    if (m.quantity_from_measurement && measurements[m.quantity_from_measurement] != null) {
      const measVal = parseFloat(measurements[m.quantity_from_measurement]) || 0;
      quantity = Math.ceil(measVal * (m.quantity_multiplier || 1));
    }
    options.push({
      tier: 'standalone',
      label: m.option_label || m.pricebook_item_name,
      pricebook_item_name: m.pricebook_item_name,
      pricebook_item_id: m.pricebook_item_id || '',
      unit_price: m.unit_price || 0,
      quantity,
      unit: m.unit || 'ea',
      line_total: quantity * (m.unit_price || 0),
      customer_description: m.customer_description_template || m.report_language || '',
      material_calculation: m.material_calculation || '',
      selected: false,
    });
  }

  return options;
}

// Normalize legacy Finding records to the InspectionFinding shape
function normalizeLegacyFinding(f) {
  return {
    id: f.id,
    inspection_id: f.inspection_id,
    job_id: f.job_id,
    customer_id: f.customer_id || '',
    customer_name: '',
    deficiency_type: f.finding_type || '',
    appliance_system_type: '',
    finding_location: f.category || '',
    severity: f.severity || 'moderate',
    safety_concern: false,
    nfpa_code_failure: false,
    photo_urls: f.photo_urls || [],
    photos_internal_only: [],
    measurements: '{}',
    recommended_repair: '',
    customer_facing_explanation: f.narrative_output || '',
    internal_notes: '',
    is_deficiency: true,
    internal_only: false,
    include_in_estimate: true,
    recommendations_generated: false,
    _source: 'legacy',
    _rule_origin: f.triggered_by_rule || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role invocation */ }

    const body = await req.json();
    const { inspection_id, job_id } = body;

    if (!inspection_id && !job_id) {
      return Response.json({ error: 'inspection_id or job_id is required' }, { status: 400 });
    }

    // 1. Load BOTH finding sources — unified with Inspection Review, AI Summary, and PDF Report
    const findingQuery = inspection_id ? { inspection_id } : { job_id };
    const [inspectionFindings, legacyFindingsRaw] = await Promise.all([
      base44.asServiceRole.entities.InspectionFinding.filter(findingQuery).catch(() => []),
      base44.asServiceRole.entities.Finding.filter(findingQuery).catch(() => []),
    ]);

    // Normalize legacy findings to the same shape as InspectionFinding
    const legacyFindings = legacyFindingsRaw.map(normalizeLegacyFinding);

    // Tag the source on InspectionFindings for diagnostics
    for (const f of inspectionFindings) {
      if (!f._source) f._source = 'inspection_finding';
      if (!f._rule_origin) f._rule_origin = null;
    }

    // Unified finding pool — same source of truth as Inspection Review / AI Summary / PDF
    const allFindings = [...inspectionFindings, ...legacyFindings];

    // 2. Track exclusion diagnostics for every finding
    const excludedFindings = [];
    const eligibleFindings = [];

    for (const f of allFindings) {
      const reasons = [];

      if (f.include_in_estimate === false) reasons.push('Finding excluded from estimate');
      if (f.internal_only === true) reasons.push('Finding marked internal-only');
      if (f.is_deficiency === false) reasons.push('Finding is an observation (not a deficiency)');
      if (!f.deficiency_type) reasons.push('Missing deficiency type');

      if (reasons.length > 0) {
        excludedFindings.push({
          id: f.id,
          source: f._source,
          deficiency_type: f.deficiency_type || '(missing)',
          severity: f.severity || 'moderate',
          finding_location: f.finding_location || '',
          rule_origin: f._rule_origin,
          exclusion_reasons: reasons,
        });
      } else {
        eligibleFindings.push(f);
      }
    }

    // 3. Load pricebook mappings — track searched vs matched
    const allMappings = await base44.asServiceRole.entities.FindingPricebookMapping.filter({}).catch(() => []);
    const activeMappings = allMappings.filter(m => m.is_active !== false);
    const inactiveMappings = allMappings.filter(m => m.is_active === false);

    // Build mapping search diagnostics
    const mappingSearched = {};
    const mappingMatched = {};

    for (const f of eligibleFindings) {
      const dt = f.deficiency_type;
      if (!mappingSearched[dt]) {
        const active = activeMappings.filter(m => m.deficiency_type === dt);
        const inactive = inactiveMappings.filter(m => m.deficiency_type === dt);
        mappingSearched[dt] = {
          active_count: active.length,
          inactive_count: inactive.length,
          inactive_mapping_inactive: inactive.length > 0 && active.length === 0,
        };
        mappingMatched[dt] = active.length > 0;
      }
    }

    // 4. If no eligible findings, return diagnostic explaining why
    if (eligibleFindings.length === 0) {
      const hasFindingsButAllExcluded = allFindings.length > 0;

      return Response.json({
        status: 'success',
        message: hasFindingsButAllExcluded
          ? 'Findings exist but none are eligible for repair recommendation generation.'
          : 'No eligible findings to generate repair system recommendations from.',
        repair_systems_created: 0,
        diagnostic: {
          total_findings_loaded: allFindings.length,
          inspection_findings_count: inspectionFindings.length,
          legacy_findings_count: legacyFindings.length,
          eligible_findings_count: 0,
          excluded_findings_count: excludedFindings.length,
          excluded_findings: excludedFindings,
          mappings_searched: Object.keys(mappingSearched).length,
          mappings_matched: 0,
          recommendations_created: 0,
          ungrouped_reasons: [],
        },
      });
    }

    // 5. Group findings by repair system type — track ungrouped with diagnostic reasons
    const groupedFindings = {};
    const ungroupedFindings = [];

    for (const finding of eligibleFindings) {
      const sys = getRepairSystemForDeficiency(finding.deficiency_type);
      if (sys) {
        if (!groupedFindings[sys.type]) groupedFindings[sys.type] = { sys, findings: [] };
        groupedFindings[sys.type].findings.push(finding);
      } else {
        // Check if there's at least a pricebook mapping for this deficiency type
        const hasMapping = activeMappings.some(m => m.deficiency_type === finding.deficiency_type);
        ungroupedFindings.push({
          finding,
          reason: hasMapping ? 'No matching repair system (mapping exists but no repair system config)' : 'No matching repair system and no pricebook mapping',
        });
      }
    }

    // 6. Build repair system recommendations
    const repairSystems = [];
    let rsrCounter = 0;

    for (const [sysType, { sys, findings: sysFindings }] of Object.entries(groupedFindings)) {
      rsrCounter++;

      const sysDefTypes = sys.deficiencyTypes;
      const sysMappings = activeMappings.filter(m => sysDefTypes.includes(m.deficiency_type));

      const findingsWithMappings = sysFindings.filter(f =>
        sysMappings.some(m => m.deficiency_type === f.deficiency_type)
      );
      let mappingCoverage = 'none';
      if (findingsWithMappings.length === sysFindings.length) mappingCoverage = 'all';
      else if (findingsWithMappings.length > 0) mappingCoverage = 'partial';

      const { score: confidenceScore, reasons: confidenceReason } = calculateConfidence(sysFindings, sys, mappingCoverage);

      const options = buildOptions(sys, sysMappings, sysFindings);

      const allPhotos = [];
      for (const f of sysFindings) {
        allPhotos.push(...getCustomerPhotos(f));
      }
      const uniquePhotos = [...new Set(allPhotos)];

      const allMeasurements = {};
      for (const f of sysFindings) {
        try { Object.assign(allMeasurements, JSON.parse(f.measurements || '{}')); } catch { /* ignore */ }
      }

      const findingsDetail = sysFindings.map(f => ({
        id: f.id,
        source: f._source,
        deficiency_type: f.deficiency_type,
        severity: f.severity,
        finding_location: f.finding_location,
        safety_concern: f.safety_concern || false,
        nfpa_code_failure: f.nfpa_code_failure || false,
        customer_facing_explanation: f.customer_facing_explanation || '',
        recommended_repair: f.recommended_repair || '',
        photo_count: getCustomerPhotos(f).length,
        rule_origin: f._rule_origin,
      }));

      const suggestedItems = sysMappings.map(m => ({
        pricebook_item_name: m.pricebook_item_name,
        pricebook_item_id: m.pricebook_item_id || '',
        unit_price: m.unit_price || 0,
        unit: m.unit || 'ea',
        option_tier: m.option_tier || 'standalone',
        option_group: m.option_group || '',
      }));

      const codeRefs = [];
      if (sys.codeReferences) codeRefs.push(sys.codeReferences);
      const nfpaFindings = sysFindings.filter(f => f.nfpa_code_failure);
      if (nfpaFindings.length > 0) {
        codeRefs.push(`${nfpaFindings.length} finding${nfpaFindings.length !== 1 ? 's' : ''} triggered NFPA code failure`);
      }

      const highestSeverity = getHighestSeverity(sysFindings);
      const hasSafety = sysFindings.some(f => f.safety_concern);

      repairSystems.push({
        recommendation_id: `RSR-${Date.now()}-${rsrCounter}`,
        job_id: sysFindings[0].job_id || job_id || '',
        inspection_id: sysFindings[0].inspection_id || inspection_id || '',
        customer_id: sysFindings[0].customer_id || '',
        customer_name: sysFindings[0].customer_name || '',
        repair_system_type: sysType,
        recommendation_title: sys.title,
        recommendation_summary: sys.summary,
        related_findings: JSON.stringify(sysFindings.map(f => f.id)),
        related_findings_detail: JSON.stringify(findingsDetail),
        related_photos: uniquePhotos,
        related_measurements: JSON.stringify(allMeasurements),
        code_nfpa_references: codeRefs.join('; '),
        severity: highestSeverity,
        safety_concern: hasSafety,
        confidence_score: confidenceScore,
        confidence_reason: confidenceReason,
        customer_facing_explanation: sys.explanation,
        internal_technician_notes: '',
        suggested_pricebook_items: JSON.stringify(suggestedItems),
        good_better_best_options: JSON.stringify(options),
        selected_option_tier: 'none',
        material_calculation_inputs: JSON.stringify(allMeasurements),
        estimate_status: 'pending',
        requires_review: confidenceScore < 50,
        created_by: user?.email || 'system',
      });
    }

    // 7. Handle ungrouped findings — create individual repair system records
    const ungroupedReasons = [];

    for (const { finding, reason } of ungroupedFindings) {
      rsrCounter++;
      ungroupedReasons.push({
        deficiency_type: finding.deficiency_type,
        severity: finding.severity,
        reason,
        has_mapping: activeMappings.some(m => m.deficiency_type === finding.deficiency_type),
      });

      const customerPhotos = getCustomerPhotos(finding);
      let measurements = {};
      try { measurements = JSON.parse(finding.measurements || '{}'); } catch { /* ignore */ }

      const findingMappings = activeMappings.filter(m => m.deficiency_type === finding.deficiency_type);
      const mappingCoverage = findingMappings.length > 0 ? 'all' : 'none';

      const { score: confidenceScore, reasons: confidenceReason } = calculateConfidence([finding], { requiredMeasurements: [] }, mappingCoverage);

      const options = [];
      if (findingMappings.length > 0) {
        for (const m of findingMappings) {
          let quantity = m.default_quantity || 1;
          if (m.quantity_from_measurement && measurements[m.quantity_from_measurement] != null) {
            const measVal = parseFloat(measurements[m.quantity_from_measurement]) || 0;
            quantity = Math.ceil(measVal * (m.quantity_multiplier || 1));
          }
          options.push({
            tier: m.option_tier || 'standalone',
            label: m.option_label || m.pricebook_item_name,
            pricebook_item_name: m.pricebook_item_name,
            pricebook_item_id: m.pricebook_item_id || '',
            unit_price: m.unit_price || 0,
            quantity,
            unit: m.unit || 'ea',
            line_total: quantity * (m.unit_price || 0),
            customer_description: m.customer_description_template || m.report_language || finding.customer_facing_explanation || '',
            material_calculation: m.material_calculation || '',
            selected: false,
          });
        }
      } else {
        options.push({
          tier: 'standalone',
          label: finding.recommended_repair || 'Manual Review Required',
          pricebook_item_name: finding.recommended_repair || 'Manual Review Required',
          pricebook_item_id: '',
          unit_price: 0,
          quantity: 1,
          unit: 'ea',
          line_total: 0,
          customer_description: finding.customer_facing_explanation || '',
          material_calculation: '',
          selected: false,
        });
      }

      repairSystems.push({
        recommendation_id: `RSR-${Date.now()}-${rsrCounter}`,
        job_id: finding.job_id || job_id || '',
        inspection_id: finding.inspection_id || inspection_id || '',
        customer_id: finding.customer_id || '',
        customer_name: finding.customer_name || '',
        repair_system_type: 'other',
        recommendation_title: finding.recommended_repair || finding.deficiency_type,
        recommendation_summary: finding.customer_facing_explanation || '',
        related_findings: JSON.stringify([finding.id]),
        related_findings_detail: JSON.stringify([{
          id: finding.id,
          source: finding._source,
          deficiency_type: finding.deficiency_type,
          severity: finding.severity,
          finding_location: finding.finding_location,
          safety_concern: finding.safety_concern || false,
          nfpa_code_failure: finding.nfpa_code_failure || false,
          customer_facing_explanation: finding.customer_facing_explanation || '',
          recommended_repair: finding.recommended_repair || '',
          photo_count: customerPhotos.length,
          rule_origin: finding._rule_origin,
        }]),
        related_photos: customerPhotos,
        related_measurements: JSON.stringify(measurements),
        code_nfpa_references: finding.nfpa_code_failure ? 'NFPA code failure detected' : '',
        severity: finding.severity || 'moderate',
        safety_concern: finding.safety_concern || false,
        confidence_score: confidenceScore,
        confidence_reason: confidenceReason,
        customer_facing_explanation: finding.customer_facing_explanation || '',
        internal_technician_notes: findingMappings.length === 0 ? 'No pricebook mapping found. Technician must assign item manually.' : '',
        suggested_pricebook_items: JSON.stringify(findingMappings.map(m => ({
          pricebook_item_name: m.pricebook_item_name,
          pricebook_item_id: m.pricebook_item_id || '',
          unit_price: m.unit_price || 0,
          unit: m.unit || 'ea',
          option_tier: m.option_tier || 'standalone',
          option_group: m.option_group || '',
        }))),
        good_better_best_options: JSON.stringify(options),
        selected_option_tier: 'none',
        material_calculation_inputs: JSON.stringify(measurements),
        estimate_status: 'pending',
        requires_review: confidenceScore < 50 || findingMappings.length === 0,
        created_by: user?.email || 'system',
      });
    }

    // 8. Delete old pending repair system recommendations for this inspection/job (regeneration)
    const oldRecs = await base44.asServiceRole.entities.RepairSystemRecommendation.filter({
      ...(inspection_id ? { inspection_id } : { job_id }),
      estimate_status: 'pending',
    });
    for (const old of oldRecs) {
      await base44.asServiceRole.entities.RepairSystemRecommendation.delete(old.id);
    }

    // 9. Create new repair system recommendations
    let created = [];
    if (repairSystems.length > 0) {
      created = await base44.asServiceRole.entities.RepairSystemRecommendation.bulkCreate(repairSystems);
    }

    // 10. Mark findings as recommendations_generated
    for (const finding of eligibleFindings) {
      // Only update InspectionFinding records (legacy Finding entity may not have this field)
      if (finding._source === 'inspection_finding') {
        await base44.asServiceRole.entities.InspectionFinding.update(finding.id, {
          recommendations_generated: true,
        });
      }
    }

    // 11. Build warnings for critical findings with no repair mapping
    const criticalMappingWarnings = [];
    for (const f of allFindings) {
      const isCritical = f.severity === 'critical' || f.severity === 'major';
      const hasMapping = activeMappings.some(m => m.deficiency_type === f.deficiency_type);
      const hasRepairSystem = getRepairSystemForDeficiency(f.deficiency_type) !== null;
      if (isCritical && !hasMapping && !hasRepairSystem) {
        criticalMappingWarnings.push({
          deficiency_type: f.deficiency_type,
          severity: f.severity,
          finding_location: f.finding_location || '',
          source: f._source,
        });
      }
    }

    return Response.json({
      status: 'success',
      findings_processed: eligibleFindings.length,
      repair_systems_created: created.length,
      repair_systems: created,
      diagnostic: {
        total_findings_loaded: allFindings.length,
        inspection_findings_count: inspectionFindings.length,
        legacy_findings_count: legacyFindings.length,
        eligible_findings_count: eligibleFindings.length,
        excluded_findings_count: excludedFindings.length,
        excluded_findings: excludedFindings,
        mappings_searched: Object.keys(mappingSearched).length,
        mapping_search_detail: mappingSearched,
        mappings_matched: Object.values(mappingMatched).filter(Boolean).length,
        recommendations_created: created.length,
        ungrouped_findings_count: ungroupedFindings.length,
        ungrouped_reasons: ungroupedReasons,
        critical_mapping_warnings: criticalMappingWarnings,
      },
      warnings: {
        critical_findings_without_mapping: criticalMappingWarnings,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});