import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const typeFilter = body.type && body.type !== 'all' ? body.type : null;

    const PAGE_SIZE = 5000;
    let skip = 0;
    let hasMore = true;

    const byType = {};
    const totals = {
      total: 0, lowStock: 0, outOfStock: 0, unbalanced: 0,
      totalValue: 0, totalAvailable: 0, totalReserved: 0,
      totalAssigned: 0, totalOnOrder: 0, totalDamaged: 0,
    };
    const categorySet = new Set();

    const ensureType = (t) => {
      if (!byType[t]) {
        byType[t] = {
          total: 0, lowStock: 0, outOfStock: 0, unbalanced: 0,
          totalValue: 0, totalAvailable: 0, totalReserved: 0,
          totalAssigned: 0, totalOnOrder: 0, totalDamaged: 0,
        };
      }
    };

    while (hasMore) {
      const query = typeFilter ? { inventory_type: typeFilter } : {};
      const batch = await base44.asServiceRole.entities.InventoryMaster.filter(query, '-created_date', PAGE_SIZE, skip);
      if (!batch || batch.length === 0) { hasMore = false; break; }

      for (const item of batch) {
        const t = item.inventory_type || 'Unknown';
        ensureType(t);

        const avail = item.quantity_available || 0;
        const owned = item.quantity_owned || 0;
        const minStock = item.minimum_stock || 0;
        const low = minStock > 0 && avail <= minStock;
        const out = avail === 0;
        const sum = avail + (item.quantity_assigned || 0) + (item.quantity_reserved || 0)
          + (item.quantity_on_order || 0) + (item.quantity_damaged || 0) + (item.quantity_retired || 0);
        const balanced = owned === sum;
        const value = Math.round((owned * (item.unit_cost || 0)) * 100) / 100;

        if (item.category) categorySet.add(item.category);

        const bucket = byType[t];
        bucket.total++;
        bucket.totalValue += value;
        bucket.totalAvailable += avail;
        bucket.totalReserved += (item.quantity_reserved || 0);
        bucket.totalAssigned += (item.quantity_assigned || 0);
        bucket.totalOnOrder += (item.quantity_on_order || 0);
        bucket.totalDamaged += (item.quantity_damaged || 0);
        if (low) bucket.lowStock++;
        if (out) bucket.outOfStock++;
        if (!balanced) bucket.unbalanced++;

        totals.total++;
        totals.totalValue += value;
        totals.totalAvailable += avail;
        totals.totalReserved += (item.quantity_reserved || 0);
        totals.totalAssigned += (item.quantity_assigned || 0);
        totals.totalOnOrder += (item.quantity_on_order || 0);
        totals.totalDamaged += (item.quantity_damaged || 0);
        if (low) totals.lowStock++;
        if (out) totals.outOfStock++;
        if (!balanced) totals.unbalanced++;
      }

      if (batch.length < PAGE_SIZE) { hasMore = false; break; }
      skip += PAGE_SIZE;
    }

    totals.totalValue = Math.round(totals.totalValue * 100) / 100;
    for (const t of Object.keys(byType)) {
      byType[t].totalValue = Math.round(byType[t].totalValue * 100) / 100;
    }

    return Response.json({
      totals,
      byType,
      categories: Array.from(categorySet).sort(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});