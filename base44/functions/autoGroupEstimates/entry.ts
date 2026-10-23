import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const b44 = base44.asServiceRole;

    // Load job context
    const job = await b44.entities.Job.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // Check if groups already exist for this job
    const existingGroups = await b44.entities.EstimateGroup
      .filter({ job_id: jobId }).catch(() => []);

    // Load recommendations and findings for grouping
    const [recommendations, findings, draftItems, assets] = await Promise.all([
      b44.entities.RepairSystemRecommendation
        .filter({ job_id: jobId, estimate_status: { $ne: 'removed' } }).catch(() => []),
      b44.entities.InspectionFinding
        .filter({ job_id: jobId, is_deficiency: true }).catch(() => []),
      b44.entities.DraftEstimateItem
        .filter({ job_id: jobId, status: { $ne: 'rejected' } }).catch(() => []),
      b44.entities.PropertyAsset
        .filter({ job_id: jobId, status: 'active' }).catch(() => []),
    ]);

    // If no groups exist and no recommendations, create a single default group (migration)
    if (existingGroups.length === 0 && recommendations.length === 0 && draftItems.length > 0) {
      const defaultGroup = await b44.entities.EstimateGroup.create({
        job_id: jobId,
        appointment_id: job.appointment_id || '',
        customer_id: job.customer_id,
        property_id: job.location_id || '',
        group_name: 'Primary Repair Estimate',
        group_code: 'PRIMARY',
        group_type: 'custom',
        status: 'grouped',
        grouping_source: 'migration',
        customer_visible: true,
        allow_independent_decision: true,
        confirmed: true,
        confirmed_by: user.email || 'migration',
        confirmed_at: new Date().toISOString(),
        created_by: user.email || 'system',
      });

      // Link existing draft items to the default group
      const groupItems = draftItems.map((item, idx) => ({
        estimate_group_id: defaultGroup.id,
        job_id: jobId,
        property_asset_id: '',
        inspection_finding_id: item.finding_id || '',
        repair_recommendation_id: item.repair_system_recommendation_id || '',
        service_catalog_id: item.service_catalog_id || '',
        source_estimate_item_id: item.id,
        item_role: 'primary',
        inclusion_status: 'included',
        committed_work_key: computeCommittedWorkKey(jobId, '', item.finding_id || '', item.repair_system_recommendation_id || '', item.service_catalog_id || ''),
        display_order: idx,
        created_by: user.email || 'system',
      }));

      if (groupItems.length > 0) {
        await b44.entities.EstimateGroupItem.bulkCreate(groupItems);
      }

      return Response.json({
        status: 'success',
        message: 'Created default migration group with existing items',
        groups_created: 1,
        groups: [defaultGroup],
        items_linked: groupItems.length,
      });
    }

    // If groups already exist and are confirmed, don't re-group
    const confirmedGroups = existingGroups.filter(g => g.confirmed);
    if (confirmedGroups.length > 0) {
      return Response.json({
        status: 'success',
        message: 'Groups already exist and are confirmed. Use the Estimate Group Review UI to modify.',
        groups: existingGroups,
        groups_created: 0,
      });
    }

    // Delete any unconfirmed auto-generated groups before re-grouping
    const unconfirmedGroups = existingGroups.filter(g => !g.confirmed && g.grouping_source === 'auto');
    if (unconfirmedGroups.length > 0) {
      const groupIds = unconfirmedGroups.map(g => g.id);
      // Delete group items for these groups
      for (const gid of groupIds) {
        const items = await b44.entities.EstimateGroupItem
          .filter({ estimate_group_id: gid }).catch(() => []);
        if (items.length > 0) {
          await b44.entities.EstimateGroupItem.deleteMany({ estimate_group_id: gid }).catch(() => {});
        }
      }
      await b44.entities.EstimateGroup.deleteMany({
        job_id: jobId,
        confirmed: false,
        grouping_source: 'auto'
      }).catch(() => {});
    }

    // Auto-create Property Assets from findings if none exist
    let propertyAssets = assets;
    if (propertyAssets.length === 0 && findings.length > 0) {
      propertyAssets = await autoCreateAssets(b44, jobId, job, findings, user);
    }

    // Build asset lookup by matching findings to assets
    const assetMap = buildAssetMap(propertyAssets, findings);

    // Group recommendations by (asset, interior/exterior)
    const groupBuckets = new Map();

    for (const rec of recommendations) {
      const relatedFindings = parseJSON(rec.related_findings, []);
      const findingId = relatedFindings[0] || '';
      const finding = findings.find(f => f.id === findingId);
      const assetId = assetMap.get(findingId) || '';
      const interiorExterior = finding?.interior_exterior || 'both';

      const bucketKey = `${assetId}::${interiorExterior}`;
      if (!groupBuckets.has(bucketKey)) {
        groupBuckets.set(bucketKey, {
          asset_id: assetId,
          interior_exterior: interiorExterior,
          recommendations: [],
          findings: [],
        });
      }
      const bucket = groupBuckets.get(bucketKey);
      bucket.recommendations.push(rec);
      if (finding) bucket.findings.push(finding);
    }

    // Build group records
    const newGroups = [];
    const newGroupItems = [];
    let displayOrder = 0;

    // Sort buckets: asset first, then interior before exterior
    const sortedBuckets = [...groupBuckets.entries()].sort((a, b) => {
      const aAsset = a[1].asset_id || 'zzz';
      const bAsset = b[1].asset_id || 'zzz';
      if (aAsset !== bAsset) return aAsset.localeCompare(bAsset);
      return (a[1].interior_exterior === 'interior' ? 0 : 1) - (b[1].interior_exterior === 'interior' ? 0 : 1);
    });

    for (const [bucketKey, bucket] of sortedBuckets) {
      const asset = propertyAssets.find(a => a.id === bucket.asset_id);
      const assetName = asset?.asset_name || 'Property';
      const isExterior = bucket.interior_exterior === 'exterior';
      const isInterior = bucket.interior_exterior === 'interior';

      const groupName = isExterior
        ? `${assetName} — Exterior Repairs`
        : isInterior
        ? `${assetName} — Interior Repairs`
        : `${assetName} — Repairs`;

      const groupCode = (asset?.asset_code || 'PROP') +
        (isExterior ? '-EXT' : isInterior ? '-INT' : '-REP');

      const groupType = isExterior ? 'exterior' : isInterior ? 'interior' : 'combined';

      const group = {
        job_id: jobId,
        appointment_id: job.appointment_id || '',
        customer_id: job.customer_id,
        property_id: job.location_id || '',
        group_name: groupName,
        group_code: groupCode,
        group_type: groupType,
        description: `${bucket.recommendations.length} recommendation(s) for ${assetName}`,
        asset_ids: bucket.asset_id ? [bucket.asset_id] : [],
        primary_asset_id: bucket.asset_id || '',
        repair_recommendation_ids: bucket.recommendations.map(r => r.id),
        inspection_finding_ids: bucket.findings.map(f => f.id),
        status: 'grouped',
        grouping_source: 'auto',
        customer_visible: true,
        allow_independent_decision: true,
        display_order: displayOrder++,
        created_by: user.email || 'system',
      };

      newGroups.push(group);

      // Build group items
      for (const rec of bucket.recommendations) {
        const relatedFindings = parseJSON(rec.related_findings, []);
        const findingId = relatedFindings[0] || '';
        // Find the matching draft item
        const draftItem = draftItems.find(
          di => di.repair_system_recommendation_id === rec.id
        );
        newGroupItems.push({
          estimate_group_id: '', // Will be set after bulk create
          job_id: jobId,
          property_asset_id: bucket.asset_id || '',
          inspection_finding_id: findingId,
          repair_recommendation_id: rec.id,
          service_catalog_id: draftItem?.service_catalog_id || '',
          source_estimate_item_id: draftItem?.id || '',
          item_role: 'primary',
          inclusion_status: 'included',
          committed_work_key: computeCommittedWorkKey(
            jobId, bucket.asset_id || '', findingId, rec.id, draftItem?.service_catalog_id || ''
          ),
          display_order: 0,
          created_by: user.email || 'system',
        });
      }
    }

    // Check for combined group opportunity (same asset has both interior and exterior)
    const assetsWithBoth = new Map();
    for (const [bucketKey, bucket] of sortedBuckets) {
      if (!bucket.asset_id) continue;
      if (!assetsWithBoth.has(bucket.asset_id)) {
        assetsWithBoth.set(bucket.asset_id, { interior: false, exterior: false, asset: null });
      }
      const entry = assetsWithBoth.get(bucket.asset_id);
      if (bucket.interior_exterior === 'interior') entry.interior = true;
      if (bucket.interior_exterior === 'exterior') entry.exterior = true;
      entry.asset = propertyAssets.find(a => a.id === bucket.asset_id);
    }

    for (const [assetId, info] of assetsWithBoth) {
      if (info.interior && info.exterior && info.asset) {
        // Suggest a combined group
        const allRecs = recommendations.filter(rec => {
          const relatedFindings = parseJSON(rec.related_findings, []);
          const findingId = relatedFindings[0] || '';
          return assetMap.get(findingId) === assetId;
        });

        newGroups.push({
          job_id: jobId,
          appointment_id: job.appointment_id || '',
          customer_id: job.customer_id,
          property_id: job.location_id || '',
          group_name: `${info.asset.asset_name} — Complete Interior + Exterior`,
          group_code: `${info.asset.asset_code || 'PROP'}-COMP`,
          group_type: 'combined',
          description: `Combined value package referencing all ${allRecs.length} recommendation(s) for ${info.asset.asset_name}`,
          asset_ids: [assetId],
          primary_asset_id: assetId,
          repair_recommendation_ids: allRecs.map(r => r.id),
          inspection_finding_ids: findings.filter(f => assetMap.get(f.id) === assetId).map(f => f.id),
          status: 'draft',
          grouping_source: 'auto',
          customer_visible: true,
          allow_independent_decision: true,
          allow_combined_selection: true,
          is_combined_group: true,
          display_order: displayOrder++,
          created_by: user.email || 'system',
        });
      }
    }

    // Check for safety group
    const safetyRecs = recommendations.filter(r => r.safety_concern);
    if (safetyRecs.length > 0) {
      newGroups.push({
        job_id: jobId,
        appointment_id: job.appointment_id || '',
        customer_id: job.customer_id,
        property_id: job.location_id || '',
        group_name: 'Immediate Safety Repairs',
        group_code: 'SAFETY',
        group_type: 'safety',
        description: `${safetyRecs.length} safety-related recommendation(s) across all assets`,
        asset_ids: [...new Set(safetyRecs.map(r => {
          const rf = parseJSON(r.related_findings, []);
          return assetMap.get(rf[0] || '') || '';
        }).filter(Boolean))],
        repair_recommendation_ids: safetyRecs.map(r => r.id),
        inspection_finding_ids: findings.filter(f => f.safety_concern).map(f => f.id),
        status: 'draft',
        grouping_source: 'auto',
        customer_visible: true,
        allow_independent_decision: true,
        display_order: displayOrder++,
        created_by: user.email || 'system',
      });
    }

    // Bulk create groups
    let createdGroups = [];
    if (newGroups.length > 0) {
      createdGroups = await b44.entities.EstimateGroup.bulkCreate(newGroups);
    }

    // Now create group items with proper group IDs
    // Match items to groups by recommendation ID
    const itemsToCreate = [];
    for (const item of newGroupItems) {
      // Find the group that contains this recommendation
      const matchingGroup = createdGroups.find(g =>
        g.repair_recommendation_ids && g.repair_recommendation_ids.includes(item.repair_recommendation_id) &&
        !g.is_combined_group
      );
      if (matchingGroup) {
        item.estimate_group_id = matchingGroup.id;
        itemsToCreate.push(item);
      }
    }

    if (itemsToCreate.length > 0) {
      await b44.entities.EstimateGroupItem.bulkCreate(itemsToCreate);
    }

    return Response.json({
      status: 'success',
      message: `Created ${createdGroups.length} estimate group(s) with ${itemsToCreate.length} item link(s)`,
      groups_created: createdGroups.length,
      groups: createdGroups,
      items_linked: itemsToCreate.length,
      assets: propertyAssets,
      ungrouped_recommendations: recommendations.filter(r =>
        !createdGroups.some(g => g.repair_recommendation_ids?.includes(r.id))
      ).map(r => r.id),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function parseJSON(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function computeCommittedWorkKey(jobId, assetId, findingId, recId, serviceId) {
  return [jobId || '', assetId || '', findingId || '', recId || '', serviceId || ''].join('::');
}

async function autoCreateAssets(b44, jobId, job, findings, user) {
  // Infer assets from findings by grouping by location/appliance
  const assetBuckets = new Map();
  let assetNumber = 0;

  for (const finding of findings) {
    const location = finding.finding_location || 'Unknown';
    const applianceType = finding.appliance_system_type || '';
    const key = `${location}::${applianceType}`;

    if (!assetBuckets.has(key)) {
      assetNumber++;
      const isExterior = finding.interior_exterior === 'exterior';
      assetBuckets.set(key, {
        job_id: jobId,
        property_id: job.location_id || '',
        customer_id: job.customer_id,
        asset_name: `${location || `Asset ${assetNumber}`}`,
        asset_code: `AST-${String(assetNumber).padStart(3, '0')}`,
        asset_type: inferAssetType(finding),
        asset_number: assetNumber,
        location_description: location,
        interior_or_exterior: finding.interior_exterior || 'both',
        fuel_type: '',
        appliance_type: applianceType,
        chimney_system_type: finding.appliance_system_type || '',
        status: 'active',
        display_order: assetNumber - 1,
        created_by: user.email || 'system',
      });
    }
  }

  const assets = [...assetBuckets.values()];
  if (assets.length === 0) return [];

  return await b44.entities.PropertyAsset.bulkCreate(assets);
}

function inferAssetType(finding) {
  const text = `${finding.finding_location || ''} ${finding.appliance_system_type || ''} ${finding.deficiency_type || ''}`.toLowerCase();
  if (text.includes('fireplace')) return 'fireplace';
  if (text.includes('wood stove') || text.includes('woodstove')) return 'wood_stove';
  if (text.includes('pellet')) return 'pellet_stove';
  if (text.includes('gas')) return 'gas_fireplace';
  if (text.includes('insert')) return 'insert';
  if (text.includes('furnace')) return 'furnace_vent';
  if (text.includes('boiler')) return 'boiler_vent';
  if (text.includes('dryer')) return 'dryer_vent';
  return 'chimney';
}

function buildAssetMap(propertyAssets, findings) {
  // Map finding_id -> asset_id
  const map = new Map();
  for (const asset of propertyAssets) {
    // Match findings to assets by location description
    for (const finding of findings) {
      if (finding.finding_location && asset.asset_name &&
          asset.asset_name.toLowerCase().includes(finding.finding_location.toLowerCase())) {
        map.set(finding.id, asset.id);
      }
    }
  }
  return map;
}