import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { copper_variant_id } = body;

    if (!copper_variant_id) {
      return Response.json({ error: 'copper_variant_id is required' }, { status: 400 });
    }

    const copper = await base44.asServiceRole.entities.CapSizingMatrix.get(copper_variant_id);
    if (!copper) return Response.json({ error: 'Copper variant not found' }, { status: 404 });

    if (copper.variant_source !== 'copied_from_stainless') {
      return Response.json({ error: 'This product is not a variant — sync is only available for copper variants generated from stainless sources' }, { status: 400 });
    }

    if (!copper.source_matrix_record_id) {
      return Response.json({ error: 'No source matrix record ID found on this variant' }, { status: 400 });
    }

    const source = await base44.asServiceRole.entities.CapSizingMatrix.get(copper.source_matrix_record_id);
    if (!source) return Response.json({ error: 'Source stainless record not found' }, { status: 404 });

    // Fetch source InventoryMaster for updated price
    let sourcePrice = copper.stainless_source_price || 0;
    if (source.material_id) {
      try {
        const inv = await base44.asServiceRole.entities.InventoryMaster.get(source.material_id);
        if (inv) sourcePrice = inv.selling_price || inv.unit_cost || 0;
      } catch { /* keep existing price */ }
    }

    const mult = copper.copper_price_multiplier || 3.0;
    const suggestedPrice = Math.round(sourcePrice * mult * 100) / 100;

    // Sync ONLY sizing/compatibility fields and price suggestions
    // NEVER overwrite: material_id, material_sku, final_approved_copper_price, copper_price_approved_by, copper_price_approved_at
    const updated = await base44.asServiceRole.entities.CapSizingMatrix.update(copper_variant_id, {
      mount_type: source.mount_type,
      cap_style: source.cap_style,
      coverage_type: source.coverage_type,
      nominal_length: source.nominal_length,
      nominal_width: source.nominal_width,
      nominal_height: source.nominal_height,
      min_fitting_length: source.min_fitting_length,
      min_fitting_width: source.min_fitting_width,
      max_fitting_length: source.max_fitting_length,
      max_fitting_width: source.max_fitting_width,
      compatible_shape: source.compatible_shape,
      allows_rotated_match: source.allows_rotated_match,
      min_tile_projection: source.min_tile_projection,
      max_tile_projection: source.max_tile_projection,
      flues_supported: source.flues_supported,
      manufacturer_clearance: source.manufacturer_clearance,
      manufacturer: source.manufacturer,
      model: source.model,
      service_id: source.service_id,
      priority: source.priority,
      notes: source.notes,
      stainless_source_price: sourcePrice,
      copper_price_multiplier: mult,
      suggested_copper_price: suggestedPrice,
      updated_by: user.email || '',
    });

    const protectedFields = {
      material_id: updated.material_id,
      material_sku: updated.material_sku,
      final_approved_copper_price: updated.final_approved_copper_price,
      copper_price_approved_by: updated.copper_price_approved_by,
      copper_price_approved_at: updated.copper_price_approved_at,
    };

    return Response.json({
      success: true,
      copper_variant_id: copper_variant_id,
      source_matrix_record_id: copper.source_matrix_record_id,
      synced_fields: [
        'mount_type', 'cap_style', 'coverage_type', 'nominal_length', 'nominal_width', 'nominal_height',
        'min_fitting_length', 'min_fitting_width', 'max_fitting_length', 'max_fitting_width',
        'compatible_shape', 'allows_rotated_match', 'min_tile_projection', 'max_tile_projection',
        'flues_supported', 'manufacturer_clearance', 'manufacturer', 'model', 'service_id',
        'priority', 'notes', 'stainless_source_price', 'copper_price_multiplier', 'suggested_copper_price'
      ],
      protected_fields_preserved: protectedFields,
      updated_suggested_price: suggestedPrice,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});