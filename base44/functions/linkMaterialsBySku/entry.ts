import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Links CapSizingMatrix records to InventoryMaster by matching material_sku.
// Uses server-side filtered lookups per matrix SKU — never loads all InventoryMaster
// into memory (InventoryMaster has 5000+ records; in-memory matching misses beyond 500).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { dry_run = true, relink_existing = false, matrix_ids = null } = body;

    const matrixRecords = await base44.asServiceRole.entities.CapSizingMatrix.filter({}, '-created_date', 500);

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // Server-side lookup: exact (case-insensitive) on sku, then vendor_sku, then
    // prefix match if SKU ends with ellipsis. Never loads all inventory into memory.
    async function resolveSku(rawSku) {
      if (!rawSku || !rawSku.trim()) return { status: 'blank_sku', material_id: null, material_name: null, matched_sku: null, match_type: null };
      const trimmed = rawSku.trim();
      const escaped = escapeRegex(trimmed);

      // 1. Exact match on sku (case-insensitive via anchored regex)
      let results = await base44.asServiceRole.entities.InventoryMaster.filter({ sku: { $regex: "^" + escaped + "$", $options: 'i' } });
      if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'exact' };
      if (results.length > 1) return { status: 'ambiguous', material_id: null, material_name: null, matched_sku: null, match_type: 'exact', match_count: results.length };

      // 2. Exact match on vendor_sku
      results = await base44.asServiceRole.entities.InventoryMaster.filter({ vendor_sku: { $regex: "^" + escaped + "$", $options: 'i' } });
      if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'vendor_sku_exact' };
      if (results.length > 1) return { status: 'ambiguous', material_id: null, material_name: null, matched_sku: null, match_type: 'vendor_sku_exact', match_count: results.length };

      // 3. If SKU ends with ellipsis (2+ trailing dots), strip and prefix-match
      const truncMatch = trimmed.match(/^(.+?)\.{2,}$/);
      if (truncMatch) {
        const prefix = escapeRegex(truncMatch[1]);
        results = await base44.asServiceRole.entities.InventoryMaster.filter({ sku: { $regex: "^" + prefix } });
        if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'truncated_prefix_sku' };
        if (results.length > 1) return { status: 'ambiguous', material_id: null, material_name: null, matched_sku: null, match_type: 'truncated_prefix_sku', match_count: results.length };

        results = await base44.asServiceRole.entities.InventoryMaster.filter({ vendor_sku: { $regex: "^" + prefix } });
        if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'truncated_prefix_vendor_sku' };
        if (results.length > 1) return { status: 'ambiguous', material_id: null, material_name: null, matched_sku: null, match_type: 'truncated_prefix_vendor_sku', match_count: results.length };
      }

      return { status: 'not_found', material_id: null, material_name: null, matched_sku: null, match_type: null };
    }

    const details = [];
    const toUpdate = [];

    for (const rec of matrixRecords) {
      if (matrix_ids && !matrix_ids.includes(rec.id)) continue;
      const sku = rec.material_sku || '';
      const hasExistingLink = !!rec.material_id;

      if (!sku) {
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: '',
          status: 'blank_sku', reason: 'No SKU on matrix record',
          existing_material_id: rec.material_id || '', matched_material_id: '', matched_material_name: '', match_type: null,
        });
        continue;
      }

      const res = await resolveSku(sku);

      if (res.status === 'matched') {
        if (hasExistingLink && rec.material_id === res.material_id) {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: sku,
            status: 'already_linked', reason: 'Already linked to the matching material',
            existing_material_id: rec.material_id, matched_material_id: res.material_id, matched_material_name: res.material_name, match_type: res.match_type,
          });
          continue;
        }
        if (hasExistingLink && !relink_existing) {
          details.push({
            matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: sku,
            status: 'link_conflict', reason: 'Existing material link differs from resolved SKU. Enable "Relink Existing Records" to overwrite.',
            existing_material_id: rec.material_id, matched_material_id: res.material_id, matched_material_name: res.material_name, match_type: res.match_type,
          });
          continue;
        }
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: sku,
          status: 'ready_to_link', reason: hasExistingLink ? 'Will relink to resolved material' : 'Will link to resolved material',
          existing_material_id: rec.material_id || '', matched_material_id: res.material_id, matched_material_name: res.material_name, match_type: res.match_type,
        });
        toUpdate.push({ id: rec.id, material_id: res.material_id, material_sku: res.matched_sku || sku, updated_by: user.email || '' });
      } else if (res.status === 'ambiguous') {
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: sku,
          status: 'ambiguous', reason: `${res.match_count} materials share this SKU — manual resolution required`,
          existing_material_id: rec.material_id || '', matched_material_id: '', matched_material_name: '', match_type: res.match_type,
        });
      } else {
        details.push({
          matrix_id: rec.id, matrix_name: rec.matrix_name, imported_sku: sku,
          status: 'not_found', reason: 'No material with matching SKU/vendor_sku',
          existing_material_id: rec.material_id || '', matched_material_id: '', matched_material_name: '', match_type: null,
        });
      }
    }

    const summary = {
      total_checked: details.length,
      ready_to_link: details.filter(d => d.status === 'ready_to_link').length,
      already_linked: details.filter(d => d.status === 'already_linked').length,
      not_found: details.filter(d => d.status === 'not_found').length,
      ambiguous: details.filter(d => d.status === 'ambiguous').length,
      blank_sku: details.filter(d => d.status === 'blank_sku').length,
      link_conflict: details.filter(d => d.status === 'link_conflict').length,
    };

    if (dry_run) {
      return Response.json({
        dry_run: true, relink_existing, summary, details,
        entity_queried: 'InventoryMaster',
        lookup_method: 'server-side filtered (regex exact + prefix) — no in-memory scan',
      });
    }

    // Execute in safe batches. Re-resolved fresh each call → idempotent + resumable.
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

    const skipped = summary.already_linked + summary.blank_sku + summary.ambiguous + summary.not_found + summary.link_conflict;

    return Response.json({
      dry_run: false,
      relink_existing,
      summary: { ...summary, linked, failed, skipped },
      linked_count: linked,
      failed_count: failed,
      failed_ids: failedIds,
      updated_ids: toUpdate.map(u => u.id),
      entity_queried: 'InventoryMaster',
      lookup_method: 'server-side filtered (regex exact + prefix) — no in-memory scan',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});