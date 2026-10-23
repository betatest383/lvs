import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    // Load all active repair categories from Master Classification Registry
    const categories = await base44.asServiceRole.entities.MasterClassification.filter(
      { classification_type: 'repair_category', is_active: true },
      'sort_order',
      200
    );

    // Build case-insensitive lookup by value AND label
    const categoryMap = new Map();
    for (const cat of categories) {
      const valueLower = (cat.value || '').toLowerCase().trim();
      const labelLower = (cat.label || '').toLowerCase().trim();
      const match = { id: cat.id, name: cat.label || cat.value };
      if (valueLower) categoryMap.set(valueLower, match);
      if (labelLower && labelLower !== valueLower) categoryMap.set(labelLower, match);
    }

    // Load all repairs (paginate if needed)
    let allRepairs = [];
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Repair.filter({}, null, 500);
      allRepairs = allRepairs.concat(batch);
      hasMore = batch.length === 500;
      if (hasMore) {
        // Avoid infinite loop — break if no progress
        if (batch.length === 0) break;
      }
    }

    let matched = 0;
    let unmatched = 0;
    let skipped = 0;
    const unmatchedCategories = [];
    const updates = [];

    for (const repair of allRepairs) {
      // Skip if already has a category ID
      if (repair.repair_category_id) {
        skipped++;
        continue;
      }

      const categoryText = (repair.category || '').trim();
      if (!categoryText) {
        skipped++;
        continue;
      }

      const match = categoryMap.get(categoryText.toLowerCase());
      if (match) {
        // Matched — populate ID and name snapshot
        updates.push({
          id: repair.id,
          repair_category_id: match.id,
          repair_category_name: match.name,
        });
        matched++;
      } else {
        // Unmatched — preserve text as name snapshot, leave ID empty (flagged for review)
        updates.push({
          id: repair.id,
          repair_category_name: categoryText,
        });
        unmatched++;
        if (!unmatchedCategories.includes(categoryText)) {
          unmatchedCategories.push(categoryText);
        }
      }
    }

    // Bulk update (does not touch the legacy 'category' field)
    if (updates.length > 0) {
      await base44.asServiceRole.entities.Repair.bulkUpdate(updates);
    }

    return Response.json({
      status: 'success',
      total_repairs: allRepairs.length,
      matched,
      unmatched,
      skipped,
      unmatched_categories: unmatchedCategories,
      message: unmatched > 0
        ? `${unmatched} repairs had categories that could not be matched. Review the unmatched_categories list and add them to the Master Classification Registry.`
        : 'All repair categories matched successfully.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});