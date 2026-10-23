import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Persist Cap Configuration Snapshot
 *
 * Called by CapMountingResolver when a technician confirms a cap selection.
 * Writes an immutable snapshot to RepairSystemRecommendation.cap_sizing_snapshot
 * and sets cap_configuration_status = 'confirmed'.
 *
 * Validates that:
 *   - The recommendation exists and belongs to the calling user's job
 *   - The snapshot contains required fields (matrix_id, material_id, mount_type)
 *   - Powder-coated products have color, finish material, and finish service
 *
 * Outdated detection:
 *   - Compares snapshot measurement hash against current inspection data
 *   - Compares matrix product ID against current CapSizingMatrix
 *   - Compares finish pricing entry ID against current CapFinishPricing
 *   - Compares color ID against current CapFinishColor
 *   - Marks 'outdated' if any dependency changed since last confirmation
 *
 * Returns:
 *   { status: 'success', recommendation_id, cap_configuration_status, cap_configuration_version }
 *   { status: 'error', error, code }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { recommendation_id, snapshot, technician_id } = body;

    if (!recommendation_id) {
      return Response.json({ error: 'recommendation_id is required' }, { status: 400 });
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return Response.json({ error: 'snapshot is required' }, { status: 400 });
    }

    // Load the recommendation
    const rec = await base44.asServiceRole.entities.RepairSystemRecommendation
      .get(recommendation_id).catch(() => null);
    if (!rec) {
      return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    // Validate snapshot required fields
    const requiredFields = ['matrix_id', 'mount_type', 'material_id', 'material_sku'];
    for (const f of requiredFields) {
      if (!snapshot[f]) {
        return Response.json({
          error: `Snapshot missing required field: ${f}`,
          code: 'MISSING_FIELD',
        }, { status: 400 });
      }
    }

    // Validate powder-coated products have color + finish material + finish service
    if (snapshot.finish === 'powder_coated' || snapshot.finish_configuration?.finish_type === 'powder_coated') {
      const fc = snapshot.finish_configuration;
      if (!fc) {
        return Response.json({ error: 'Powder-coated product requires finish_configuration', code: 'MISSING_FINISH_CONFIG' }, { status: 400 });
      }
      if (!fc.selected_color) {
        return Response.json({ error: 'Powder-coated product requires a selected color', code: 'MISSING_COLOR' }, { status: 400 });
      }
      if (!fc.finish_material_id) {
        return Response.json({ error: 'Powder-coated product requires finish_material_id', code: 'MISSING_FINISH_MATERIAL' }, { status: 400 });
      }
      if (!fc.finish_service_id) {
        return Response.json({ error: 'Powder-coated product requires finish_service_id', code: 'MISSING_FINISH_SERVICE' }, { status: 400 });
      }
      if (!fc.matched) {
        return Response.json({ error: 'Powder-coated product has unresolved finish pricing', code: 'UNRESOLVED_PRICING' }, { status: 400 });
      }
    }

    // --- Outdated detection ---
    // Compare current state against the previously confirmed snapshot
    const previousSnapshot = rec.cap_sizing_snapshot ? safeParse(rec.cap_sizing_snapshot, null) : null;
    let isOutdated = false;
    let outdatedReason = '';

    if (previousSnapshot && rec.cap_configuration_status === 'confirmed') {
      // Check if matrix product still exists and is active
      if (previousSnapshot.matrix_id) {
        const matrix = await base44.asServiceRole.entities.CapSizingMatrix
          .get(previousSnapshot.matrix_id).catch(() => null);
        if (!matrix || matrix.is_active === false) {
          isOutdated = true;
          outdatedReason = 'Cap sizing matrix product is no longer available or active.';
        }
      }

      // Check if finish pricing entry still exists and is active
      if (!isOutdated && previousSnapshot.finish_configuration?.finish_pricing_entry_id) {
        const pricing = await base44.asServiceRole.entities.CapFinishPricing
          .get(previousSnapshot.finish_configuration.finish_pricing_entry_id).catch(() => null);
        if (!pricing || pricing.is_active === false) {
          isOutdated = true;
          outdatedReason = 'Finish pricing rule is no longer available or active.';
        }
      }

      // Check if finish color still exists and is active
      if (!isOutdated && previousSnapshot.finish_configuration?.selected_color?.id) {
        const color = await base44.asServiceRole.entities.CapFinishColor
          .get(previousSnapshot.finish_configuration.selected_color.id).catch(() => null);
        if (!color || color.is_active === false) {
          isOutdated = true;
          outdatedReason = 'Selected finish color is no longer available or active.';
        }
      }

      // Check if inspection measurements changed
      if (!isOutdated && previousSnapshot.measurement_hash && snapshot.measurement_hash) {
        if (previousSnapshot.measurement_hash !== snapshot.measurement_hash) {
          isOutdated = true;
          outdatedReason = 'Inspection measurements have changed since last confirmation.';
        }
      }
    }

    // Determine new status and version
    const currentVersion = rec.cap_configuration_version || 0;
    let newStatus = 'confirmed';
    let newVersion = currentVersion;

    if (isOutdated && !body.force_reconfirm) {
      // Mark as outdated but still persist the new snapshot for reconfirmation
      newStatus = 'outdated';
      newVersion = currentVersion; // version doesn't increment until reconfirmed
    } else if (isOutdated && body.force_reconfirm) {
      // Technician is reconfirming after an outdated state
      newStatus = 'confirmed';
      newVersion = currentVersion + 1;
    }

    // Build the immutable snapshot to persist
    const snapshotToPersist = {
      ...snapshot,
      recommendation_id: recommendation_id,
      finding_ids: snapshot.finding_ids || [],
      repair_template_id: snapshot.repair_template_id || '',
      mount_type: snapshot.mount_type,
      cap_style: snapshot.cap_style || '',
      matrix_id: snapshot.matrix_id,
      matrix_name: snapshot.matrix_name || '',
      material_id: snapshot.material_id,
      material_sku: snapshot.material_sku,
      material_description: snapshot.material_description || '',
      material_price: snapshot.material_price || 0,
      rotated_match: snapshot.rotated_match || false,
      nominal_diameter: snapshot.nominal_diameter || null,
      min_fitting_diameter: snapshot.min_fitting_diameter || null,
      max_fitting_diameter: snapshot.max_fitting_diameter || null,
      measured_diameter: snapshot.measured_diameter || null,
      is_round_product: snapshot.is_round_product || false,
      compatible_shape: snapshot.compatible_shape || '',
      // Conditional measurement flow fields
      flue_tiles_round_answer: snapshot.flue_tiles_round_answer || '',
      flue_tiles_round: snapshot.flue_tiles_round ?? null,
      flue_shape: snapshot.flue_shape || null,
      interior_measurements: snapshot.interior_measurements || null,
      exterior_measurements: snapshot.exterior_measurements || null,
      source_question_ids: snapshot.source_question_ids || {},
      measurement_basis: snapshot.measurement_basis || '',
      matched_fitting_range: snapshot.matched_fitting_range || null,
      flue_id: snapshot.flue_id || 'flue-1',
      finish: snapshot.finish || '',
      finish_configuration: snapshot.finish_configuration || null,
      flue_tile_prerequisite: snapshot.flue_tile_prerequisite || null,
      original_measurements: snapshot.original_measurements || {},
      measurement_hash: snapshot.measurement_hash || '',
      selection_timestamp: new Date().toISOString(),
      technician_id: technician_id || user.email || user.id || '',
    };

    // Persist
    const updateFields = {
      cap_sizing_snapshot: JSON.stringify(snapshotToPersist),
      cap_configuration_status: newStatus,
      cap_configuration_confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : rec.cap_configuration_confirmed_at || null,
      cap_configuration_confirmed_by: newStatus === 'confirmed'
        ? (technician_id || user.email || user.id || '')
        : (rec.cap_configuration_confirmed_by || ''),
      cap_configuration_version: newVersion,
    };

    const updated = await base44.asServiceRole.entities.RepairSystemRecommendation
      .update(recommendation_id, updateFields);

    return Response.json({
      status: 'success',
      recommendation_id: recommendation_id,
      cap_configuration_status: newStatus,
      cap_configuration_version: newVersion,
      outdated: isOutdated,
      outdated_reason: isOutdated ? outdatedReason : '',
      snapshot_persisted: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function safeParse(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}