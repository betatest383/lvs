import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { source_matrix_ids, multiplier = 3.0, dry_run = true, update_existing = false } = body;

    if (!Array.isArray(source_matrix_ids) || source_matrix_ids.length === 0) {
      return Response.json({ error: 'source_matrix_ids array is required' }, { status: 400 });
    }

    const mult = Number(multiplier) || 3.0;

    // Fetch all source stainless records
    const sources = [];
    for (const id of source_matrix_ids) {
      const rec = await base44.asServiceRole.entities.CapSizingMatrix.get(id);
      if (!rec) continue;
      // Verify it's stainless
      const mat = (rec.base_material || '').toLowerCase();
      if (!mat.includes('stainless')) {
        sources.push({
          source_id: id,
          source_name: rec.matrix_name,
          skipped: true,
          skip_reason: 'Source is not stainless steel',
        });
        continue;
      }
      sources.push({ source_id: id, rec });
    }

    // Fetch InventoryMaster records for pricing (batch)
    const materialIds = sources
      .filter(s => s.rec && s.rec.material_id)
      .map(s => s.rec.material_id);
    const inventoryMap = {};
    if (materialIds.length > 0) {
      // Fetch in batches of 50
      for (let i = 0; i < materialIds.length; i += 50) {
        const batch = materialIds.slice(i, i + 50);
        for (const mid of batch) {
          try {
            const inv = await base44.asServiceRole.entities.InventoryMaster.get(mid);
            if (inv) inventoryMap[mid] = inv;
          } catch { /* ignore individual failures */ }
        }
      }
    }

    // Check for existing copper variants
    const existingVariants = await base44.asServiceRole.entities.CapSizingMatrix.filter({
      variant_source: 'copied_from_stainless',
      source_matrix_record_id: { $in: source_matrix_ids },
    }, '-created_date', 500);
    const existingBySource = {};
    for (const v of existingVariants) {
      if (v.source_matrix_record_id) existingBySource[v.source_matrix_record_id] = v;
    }

    const previews = [];
    const toCreate = [];
    const toUpdate = [];

    for (const src of sources) {
      if (src.skipped) {
        previews.push({
          source_id: src.source_id,
          source_name: src.source_name,
          status: 'skipped',
          skip_reason: src.skip_reason,
        });
        continue;
      }

      const rec = src.rec;
      const inv = rec.material_id ? inventoryMap[rec.material_id] : null;
      const sourcePrice = inv ? (inv.selling_price || inv.unit_cost || 0) : 0;
      const suggestedPrice = Math.round(sourcePrice * mult * 100) / 100;

      const existing = existingBySource[rec.id];
      const hasExisting = !!existing;

      // Build warnings
      const warnings = [];
      if (!rec.material_id) warnings.push('Source has no linked Inventory Material — price cannot be determined');
      if (sourcePrice === 0) warnings.push('Source material price is $0 — suggested price will be $0');
      if (!rec.service_id) warnings.push('Source has no linked installation service');

      // Build copper product name
      const copperName = rec.matrix_name
        ? rec.matrix_name.replace(/stainless/gi, 'Copper').replace(/ss\b/gi, 'Copper')
        : `${rec.manufacturer || ''} ${rec.model || ''} Copper`.trim();
      const finalCopperName = copperName !== rec.matrix_name ? copperName : `${rec.matrix_name || 'Cap'} — Copper Variant`;

      const preview = {
        source_id: rec.id,
        source_name: rec.matrix_name,
        source_manufacturer: rec.manufacturer,
        source_model: rec.model,
        source_material_id: rec.material_id,
        source_material_sku: rec.material_sku,
        source_price: sourcePrice,
        multiplier: mult,
        suggested_copper_price: suggestedPrice,
        copper_product_name: finalCopperName,
        nominal_length: rec.nominal_length,
        nominal_width: rec.nominal_width,
        nominal_height: rec.nominal_height,
        mount_type: rec.mount_type,
        cap_style: rec.cap_style,
        coverage_type: rec.coverage_type,
        has_existing_variant: hasExisting,
        existing_variant_id: hasExisting ? existing.id : null,
        existing_variant_name: hasExisting ? existing.matrix_name : null,
        existing_variant_status: hasExisting ? existing.variant_status : null,
        warnings,
        will_create: !hasExisting,
        will_update: hasExisting && update_existing,
        action: hasExisting ? (update_existing ? 'update' : 'skip') : 'create',
      };

      previews.push(preview);

      // Build the record for creation/update
      const variantData = {
        matrix_name: finalCopperName,
        mount_type: rec.mount_type,
        cap_style: rec.cap_style,
        base_material: 'copper',
        finish: 'natural',
        finish_color: '',
        coverage_type: rec.coverage_type,
        manufacturer: rec.manufacturer,
        model: rec.model,
        // DO NOT copy material_id, material_sku — left blank for admin to fill
        material_id: hasExisting ? existing.material_id : '',
        material_sku: hasExisting ? existing.material_sku : '',
        service_id: rec.service_id,
        // DO NOT copy finish_material_id, finish_service_id — copper natural finish doesn't need them
        finish_material_id: '',
        finish_service_id: '',
        nominal_length: rec.nominal_length,
        nominal_width: rec.nominal_width,
        nominal_height: rec.nominal_height,
        min_fitting_length: rec.min_fitting_length,
        min_fitting_width: rec.min_fitting_width,
        max_fitting_length: rec.max_fitting_length,
        max_fitting_width: rec.max_fitting_width,
        compatible_shape: rec.compatible_shape,
        allows_rotated_match: rec.allows_rotated_match,
        min_tile_projection: rec.min_tile_projection,
        max_tile_projection: rec.max_tile_projection,
        flues_supported: rec.flues_supported,
        manufacturer_clearance: rec.manufacturer_clearance,
        priority: rec.priority,
        is_preferred: false, // Variants are not preferred by default
        is_active: false, // Draft variants are inactive
        notes: rec.notes,
        variant_source: 'copied_from_stainless',
        source_matrix_record_id: rec.id,
        variant_status: 'draft',
        stainless_source_price: sourcePrice,
        copper_price_multiplier: mult,
        suggested_copper_price: suggestedPrice,
        // Preserve existing approved price on update; blank on create
        final_approved_copper_price: hasExisting ? existing.final_approved_copper_price : 0,
        copper_price_approved_by: hasExisting ? existing.copper_price_approved_by : '',
        copper_price_approved_at: hasExisting ? existing.copper_price_approved_at : '',
        created_by: hasExisting ? existing.created_by : (user.email || ''),
        updated_by: user.email || '',
      };

      if (!hasExisting) {
        toCreate.push(variantData);
      } else if (update_existing) {
        // Only update sizing/compatibility fields + price suggestions
        // NEVER overwrite: material_id, material_sku, final_approved_copper_price, copper_price_approved_by/at
        toUpdate.push({
          id: existing.id,
          matrix_name: variantData.matrix_name,
          mount_type: variantData.mount_type,
          cap_style: variantData.cap_style,
          coverage_type: variantData.coverage_type,
          nominal_length: variantData.nominal_length,
          nominal_width: variantData.nominal_width,
          nominal_height: variantData.nominal_height,
          min_fitting_length: variantData.min_fitting_length,
          min_fitting_width: variantData.min_fitting_width,
          max_fitting_length: variantData.max_fitting_length,
          max_fitting_width: variantData.max_fitting_width,
          compatible_shape: variantData.compatible_shape,
          allows_rotated_match: variantData.allows_rotated_match,
          min_tile_projection: variantData.min_tile_projection,
          max_tile_projection: variantData.max_tile_projection,
          flues_supported: variantData.flues_supported,
          manufacturer_clearance: variantData.manufacturer_clearance,
          manufacturer: variantData.manufacturer,
          model: variantData.model,
          service_id: variantData.service_id,
          priority: variantData.priority,
          notes: variantData.notes,
          stainless_source_price: variantData.stainless_source_price,
          copper_price_multiplier: variantData.copper_price_multiplier,
          suggested_copper_price: variantData.suggested_copper_price,
          updated_by: variantData.updated_by,
        });
      }
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        multiplier: mult,
        previews,
        summary: {
          total_sources: sources.length,
          will_create: toCreate.length,
          will_update: toUpdate.length,
          will_skip: previews.filter(p => p.action === 'skip').length,
          skipped: previews.filter(p => p.status === 'skipped').length,
        },
      });
    }

    // Execute
    let created = [];
    let updated = [];

    if (toCreate.length > 0) {
      created = await base44.asServiceRole.entities.CapSizingMatrix.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      updated = await base44.asServiceRole.entities.CapSizingMatrix.bulkUpdate(toUpdate);
    }

    return Response.json({
      dry_run: false,
      multiplier: mult,
      created_count: created.length,
      updated_count: updated.length,
      created_ids: created.map(r => r.id),
      updated_ids: updated.map(r => r.id),
      previews,
      summary: {
        total_sources: sources.length,
        created: created.length,
        updated: updated.length,
        skipped: previews.filter(p => p.action === 'skip' || p.status === 'skipped').length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});