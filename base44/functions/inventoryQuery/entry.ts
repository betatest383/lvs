import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { type, search, category, status, lowStockOnly, unbalancedOnly, exportAll } = body;
    const page = Math.max(1, parseInt(body.page) || 1);
    const limit = exportAll
      ? 100000
      : Math.min(5000, Math.max(1, parseInt(body.limit) || 100));

    const query = {};
    if (type && type !== 'all') query.inventory_type = type;
    if (category && category !== 'all') query.category = category;
    if (status && status !== 'all') query.status = status;

    const q = (search || '').toLowerCase().trim();
    const hasComputedFilters = q || lowStockOnly || unbalancedOnly;

    // --- No computed filters: native skip pagination (efficient) ---
    if (!hasComputedFilters) {
      const PAGE_SIZE = 5000;
      let skipAcc = 0;
      let hasMoreData = true;
      let total = 0;

      // Count all matching by paginating (needed for "of N" display)
      while (hasMoreData) {
        const batch = await base44.asServiceRole.entities.InventoryMaster.filter(query, '-created_date', PAGE_SIZE, skipAcc);
        if (!batch || batch.length === 0) { hasMoreData = false; break; }
        total += batch.length;
        if (batch.length < PAGE_SIZE) { hasMoreData = false; break; }
        skipAcc += PAGE_SIZE;
      }

      if (exportAll) {
        // Re-fetch all in batches
        skipAcc = 0;
        let more = true;
        const all = [];
        while (more) {
          const batch = await base44.asServiceRole.entities.InventoryMaster.filter(query, '-created_date', PAGE_SIZE, skipAcc);
          if (!batch || batch.length === 0) { more = false; break; }
          all.push(...batch);
          if (batch.length < PAGE_SIZE) { more = false; break; }
          skipAcc += PAGE_SIZE;
        }
        return Response.json({ items: all, total, page: 1, limit: total, totalPages: 1 });
      }

      const skip = (page - 1) * limit;
      const items = await base44.asServiceRole.entities.InventoryMaster.filter(query, '-created_date', limit, skip);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return Response.json({ items, total, page, limit, totalPages });
    }

    // --- Computed filters (search / lowStock / unbalanced): full scan ---
    const PAGE_SIZE = 5000;
    let skip = 0;
    let hasMore = true;
    const filtered = [];

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.InventoryMaster.filter(query, '-created_date', PAGE_SIZE, skip);
      if (!batch || batch.length === 0) { hasMore = false; break; }

      for (const item of batch) {
        if (q) {
          const name = (item.item_name || '').toLowerCase();
          const sku = (item.sku || '').toLowerCase();
          const vendor = (item.vendor || '').toLowerCase();
          const invId = (item.inventory_id || '').toLowerCase();
          const desc = (item.description || '').toLowerCase();
          const category = (item.category || '').toLowerCase();
          const subcategory = (item.subcategory || '').toLowerCase();
          const manufacturer = (item.manufacturer || '').toLowerCase();
          const vendorSku = (item.vendor_sku || '').toLowerCase();
          const barcode = (item.barcode || '').toLowerCase();
          if (!name.includes(q) && !sku.includes(q) && !vendor.includes(q) && !invId.includes(q)
              && !desc.includes(q) && !category.includes(q) && !subcategory.includes(q)
              && !manufacturer.includes(q) && !vendorSku.includes(q) && !barcode.includes(q)) continue;
        }
        if (lowStockOnly) {
          const minStock = item.minimum_stock || 0;
          if (!(minStock > 0 && (item.quantity_available || 0) <= minStock)) continue;
        }
        if (unbalancedOnly) {
          const sum = (item.quantity_available || 0) + (item.quantity_assigned || 0) + (item.quantity_reserved || 0)
            + (item.quantity_on_order || 0) + (item.quantity_damaged || 0) + (item.quantity_retired || 0);
          if ((item.quantity_owned || 0) === sum) continue;
        }
        filtered.push(item);
      }

      if (batch.length < PAGE_SIZE) { hasMore = false; break; }
      skip += PAGE_SIZE;
    }

    const total = filtered.length;

    if (exportAll) {
      return Response.json({ items: filtered, total, page: 1, limit: total, totalPages: 1 });
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIdx = (page - 1) * limit;
    const pageItems = filtered.slice(startIdx, startIdx + limit);

    return Response.json({ items: pageItems, total, page, limit, totalPages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});