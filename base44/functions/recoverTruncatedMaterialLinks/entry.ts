import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Recovers material links for CapSizingMatrix records whose material_sku was
// truncated with a trailing ellipsis (e.g. "03602844..."). Uses server-side
// filtered lookups per matrix SKU — never loads all InventoryMaster into memory.
// Searches sku, vendor_sku, and barcode. On confirm, saves material_id and
// replaces the truncated material_sku with the canonical SKU from InventoryMaster.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { dry_run = true, relink_existing = false } = body;

    const matrixRecords = await base44.asServiceRole.entities.CapSizingMatrix.filter({}, '-created_date', 500);

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function norm(s) { return String(s || '').trim().toLowerCase(); }

    // Supporting-info agreement between a matrix record and a material candidate.
    function supportReasons(matrix, material) {
      const reasons = [];
      const mMfr = norm(matrix.manufacturer);
      const invMfr = norm(material.manufacturer);
      if (mMfr && invMfr && (invMfr.includes(mMfr) || mMfr.includes(invMfr))) {
        reasons.push(`Manufacturer "${material.manufacturer}" matches`);
      }
      const mModel = norm(matrix.model);
      const nameDesc = norm(material.item_name) + ' ' + norm(material.description);
      if (mModel && nameDesc.includes(mModel)) {
        reasons.push(`Model "${matrix.model}" found in material name/description`);
      }
      const dims = [matrix.nominal_length, matrix.nominal_width, matrix.nominal_height]
        .filter(d => d !== undefined && d !== null && d !== 0).map(d => String(d));
      if (dims.length > 0) {
        const matched = dims.filter(d => nameDesc.includes(d));
        if (matched.length > 0) reasons.push(`Dimensions ${matched.join(', ')} found in material name`);
      }
      return reasons;
    }

    function hasSupportingInfo(matrix) {
      return !!(matrix.manufacturer || matrix.model || matrix.nominal_length || matrix.nominal_width || matrix.nominal_height);
    }

    // Server-side lookup for a truncated SKU. Strips trailing ellipsis, then
    // searches sku, vendor_sku, and barcode with a prefix regex.
    async function findTruncatedCandidates(rawSku) {
      const truncMatch = rawSku.match(/^(.+?)\.{2,}$/);
      if (!truncMatch) return { prefix: null, candidates: [] };
      const prefix = truncMatch[1];
      const escPrefix = escapeRegex(prefix);
      const candidates = [];

      // Search sku
      let results = await base44.asServiceRole.entities.InventoryMaster.filter({ sku: { $regex: "^" + escPrefix } });
      for (const m of results) {
        if (!candidates.find(c => c.material.id === m.id)) {
          candidates.push({ material: m, matchedField: 'sku' });
        }
      }
      // Search vendor_sku
      results = await base44.asServiceRole.entities.InventoryMaster.filter({ vendor_sku: { $regex: "^" + escPrefix } });
      for (const m of results) {
        if (!candidates.find(c => c.material.id === m.id)) {
          candidates.push({ material: m, matchedField: 'vendor_sku' });
        }
      }
      // Search barcode
      results = await base44.asServiceRole.entities.InventoryMaster.filter({ barcode: { $regex: "^" + escPrefix } });
      for (const m of results) {
        if (!candidates.find(c => c.material.id === m.id)) {
          candidates.push({ material: m, matchedField: 'barcode' });
        }
      }

      return { prefix, candidates };
    }

    const details = [];
    const toUpdate = [];

    for (const rec of matrixRecords) {
      const rawSku = rec.material_sku || '';
      const hasExistingLink = !!rec.material_id;

      // Only process truncated SKUs ending in 2+ trailing dots
      if (!/\.{2,}$/.test(rawSku)) continue;

      const { prefix, candidates } = await findTruncatedCandidates(rawSku);

      if (candidates.length === 0) {
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
          status: 'not_found', reason: 'No inventory material SKU/vendor_sku/barcode starts with this prefix',
          existing_material_id: rec.material_id || '',
          candidates: [],
        });
        continue;
      }

      // Build candidate detail with supporting-info reasons
      const candidateDetails = candidates.map(c => ({
        material_id: c.material.id,
        material_name: c.material.item_name,
        material_sku: c.material.sku || '',
        vendor_sku: c.material.vendor_sku || '',
        barcode: c.material.barcode || '',
        manufacturer: c.material.manufacturer || '',
        matched_field: c.matchedField,
        confidence_reasons: supportReasons(rec, c.material),
      }));

      if (candidates.length === 1) {
        const c = candidates[0];
        const reasons = candidateDetails[0].confidence_reasons;
        const canVerify = hasSupportingInfo(rec);
        const agrees = reasons.length > 0 || !canVerify;

        if (hasExistingLink && rec.material_id === c.material.id && !relink_existing) {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
            status: 'already_linked', reason: 'Already linked to the matched material',
            existing_material_id: rec.material_id, candidates: candidateDetails,
          });
          continue;
        }
        if (hasExistingLink && !relink_existing) {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
            status: 'link_conflict', reason: 'Existing material link differs — enable Relink Existing Records to overwrite',
            existing_material_id: rec.material_id, candidates: candidateDetails,
          });
          continue;
        }

        if (agrees) {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
            status: 'ready_to_link', reason: reasons.length > 0 ? reasons.join('; ') : 'Single prefix match (no supporting info to verify — accepted)',
            existing_material_id: rec.material_id || '', candidates: candidateDetails,
          });
          toUpdate.push({ id: rec.id, material_id: c.material.id, material_sku: c.material.sku || rawSku, updated_by: user.email || '' });
        } else {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
            status: 'ambiguous', reason: 'Single prefix match but supporting product info does not agree — manual verification required',
            existing_material_id: rec.material_id || '', candidates: candidateDetails,
          });
        }
      } else {
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: rawSku, prefix,
          status: 'ambiguous', reason: `${candidates.length} inventory materials match this prefix — manual selection required`,
          existing_material_id: rec.material_id || '', candidates: candidateDetails,
        });
      }
    }

    const summary = {
      total_truncated: details.length,
      ready_to_link: details.filter(d => d.status === 'ready_to_link').length,
      already_linked: details.filter(d => d.status === 'already_linked').length,
      not_found: details.filter(d => d.status === 'not_found').length,
      ambiguous: details.filter(d => d.status === 'ambiguous').length,
      link_conflict: details.filter(d => d.status === 'link_conflict').length,
    };

    if (dry_run) {
      return Response.json({
        dry_run: true, relink_existing, summary, details,
        entity_queried: 'InventoryMaster',
        lookup_method: 'server-side filtered (regex prefix on sku/vendor_sku/barcode) — no in-memory scan',
      });
    }

    // Execute: set material_id AND replace truncated material_sku with the canonical SKU
    const BATCH = 50;
    let linked = 0, failed = 0;
    const failedIds = [];
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH);
      try {
        await base44.asServiceRole.entities.CapSizingMatrix.bulkUpdate(batch);
        linked += batch.length;
      } catch (_err) {
        for (const item of batch) {
          try {
            await base44.asServiceRole.entities.CapSizingMatrix.update(item.id, {
              material_id: item.material_id, material_sku: item.material_sku, updated_by: item.updated_by,
            });
            linked++;
          } catch (_e2) {
            failed++;
            failedIds.push(item.id);
          }
        }
      }
    }

    return Response.json({
      dry_run: false,
      relink_existing,
      summary: { ...summary, linked, failed, skipped: summary.already_linked + summary.ambiguous + summary.not_found + summary.link_conflict },
      linked_count: linked,
      failed_count: failed,
      failed_ids: failedIds,
      updated_ids: toUpdate.map(u => u.id),
      entity_queried: 'InventoryMaster',
      lookup_method: 'server-side filtered (regex prefix on sku/vendor_sku/barcode) — no in-memory scan',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});