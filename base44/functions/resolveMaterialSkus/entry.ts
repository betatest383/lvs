import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Lightweight SKU resolver used by the CSV/XLSX importer to resolve material_sku
// to material_id at import time. Does not create or modify any records.
// Uses server-side filtered lookups — never loads all InventoryMaster into memory.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { skus = [] } = body;
    if (!Array.isArray(skus)) return Response.json({ error: 'skus array is required' }, { status: 400 });

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // Server-side lookup: exact (case-insensitive), then vendor_sku, then prefix if truncated.
    // Returns { status, material_id, material_name, matched_sku, match_type }
    async function resolveOne(rawSku) {
      if (!rawSku || !rawSku.trim()) return { status: 'blank', material_id: '', material_name: '', matched_sku: '', match_type: null };
      const trimmed = rawSku.trim();
      const escaped = escapeRegex(trimmed);

      // 1. Exact match on sku (case-insensitive via anchored regex)
      let results = await base44.asServiceRole.entities.InventoryMaster.filter({ sku: { $regex: "^" + escaped + "$", $options: 'i' } });
      if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'exact' };
      if (results.length > 1) return { status: 'ambiguous', material_id: '', material_name: '', matched_sku: '', match_type: 'exact', match_count: results.length };

      // 2. Exact match on vendor_sku
      results = await base44.asServiceRole.entities.InventoryMaster.filter({ vendor_sku: { $regex: "^" + escaped + "$", $options: 'i' } });
      if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'vendor_sku_exact' };
      if (results.length > 1) return { status: 'ambiguous', material_id: '', material_name: '', matched_sku: '', match_type: 'vendor_sku_exact', match_count: results.length };

      // 3. If SKU ends with ellipsis (2+ trailing dots), strip and prefix-match
      const truncMatch = trimmed.match(/^(.+?)\.{2,}$/);
      if (truncMatch) {
        const prefix = escapeRegex(truncMatch[1]);
        results = await base44.asServiceRole.entities.InventoryMaster.filter({ sku: { $regex: "^" + prefix } });
        if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'truncated_prefix_sku' };
        if (results.length > 1) return { status: 'ambiguous', material_id: '', material_name: '', matched_sku: '', match_type: 'truncated_prefix_sku', match_count: results.length };

        results = await base44.asServiceRole.entities.InventoryMaster.filter({ vendor_sku: { $regex: "^" + prefix } });
        if (results.length === 1) return { status: 'matched', material_id: results[0].id, material_name: results[0].item_name, matched_sku: results[0].sku, match_type: 'truncated_prefix_vendor_sku' };
        if (results.length > 1) return { status: 'ambiguous', material_id: '', material_name: '', matched_sku: '', match_type: 'truncated_prefix_vendor_sku', match_count: results.length };
      }

      return { status: 'not_found', material_id: '', material_name: '', matched_sku: '', match_type: null };
    }

    // Deduplicate SKUs to avoid redundant server calls
    const uniqueSkus = [...new Set(skus.map(s => (s || '').trim()))];
    const resolutionMap = {};
    for (const sku of uniqueSkus) {
      resolutionMap[sku] = await resolveOne(sku);
    }

    const results = skus.map(sku => {
      const key = (sku || '').trim();
      const res = resolutionMap[key] || { status: 'blank', material_id: '', material_name: '' };
      return { sku: sku || '', ...res };
    });

    return Response.json({
      results,
      entity_queried: 'InventoryMaster',
      lookup_method: 'server-side filtered (regex exact + prefix)',
      unique_skus_resolved: uniqueSkus.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});