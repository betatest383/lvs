import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { search, includeInactive, limit } = body;
    const q = (search || '').toLowerCase().trim();
    const maxResults = Math.min(100, Math.max(1, parseInt(limit) || 50));

    // Fetch all services (paginated to avoid truncation)
    const PAGE_SIZE = 5000;
    let skip = 0;
    let hasMore = true;
    const all = [];
    const query = {};
    if (!includeInactive) query.is_active = true;

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.ServiceCatalog.filter(
        query,
        'service_name',
        PAGE_SIZE,
        skip
      );
      if (!batch || batch.length === 0) { hasMore = false; break; }
      all.push(...batch);
      if (batch.length < PAGE_SIZE) { hasMore = false; break; }
      skip += PAGE_SIZE;
    }

    let filtered;
    if (!q) {
      filtered = all;
    } else {
      filtered = all.filter(s => {
        const name = (s.service_name || '').toLowerCase();
        const code = (s.service_code || '').toLowerCase();
        const cat = (s.category || '').toLowerCase();
        const desc = (s.description || '').toLowerCase();
        const pricebookId = (s.pricebook_item_id || '').toLowerCase();
        return name.includes(q) || code.includes(q) || cat.includes(q) || desc.includes(q) || pricebookId.includes(q);
      });
    }

    return Response.json({
      items: filtered.slice(0, maxResults),
      total: filtered.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});