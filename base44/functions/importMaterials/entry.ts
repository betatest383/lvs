import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function normalizeSku(sku) {
  return (sku || '').trim().toUpperCase();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Server-side navigation access enforcement — passes user_email (identity), NOT role
    // checkNavigationAccess resolves the canonical role internally from Employee/RoleRegistry
    const navAccess = await base44.functions.invoke('checkNavigationAccess', {
      user_email: user.email,
      route: '/inventory',
      action: 'import'
    });
    if (navAccess.data?.allowed === false) {
      return Response.json({ error: navAccess.data.reason || 'Access Denied' }, { status: 403 });
    }

    const body = await req.json();
    const { mode } = body;

    // --- CHECK MODE: report which SKUs already exist (for pre-import + resume) ---
    if (mode === 'check') {
      const skus = body.skus;
      if (!Array.isArray(skus)) {
        return Response.json({ error: 'skus array required for check mode' }, { status: 400 });
      }

      // Fetch all existing SKUs (paginated to avoid truncation)
      const existingSkus = new Set();
      const PAGE_SIZE = 5000;
      let skip = 0;
      let hasMore = true;
      while (hasMore) {
        const batch = await base44.asServiceRole.entities.InventoryMaster.filter(
          { sku: { $ne: '' } },
          '-created_date',
          PAGE_SIZE,
          skip
        );
        if (!batch || batch.length === 0) { hasMore = false; break; }
        for (const item of batch) {
          if (item.sku) existingSkus.add(normalizeSku(item.sku));
        }
        if (batch.length < PAGE_SIZE) { hasMore = false; break; }
        skip += PAGE_SIZE;
      }

      let existingCount = 0;
      let notFoundCount = 0;
      const existing = [];
      const seen = new Set();
      for (const sku of skus) {
        const norm = normalizeSku(sku);
        if (!norm) continue;
        if (seen.has(norm)) continue;
        seen.add(norm);
        if (existingSkus.has(norm)) {
          existingCount++;
          existing.push(sku);
        } else {
          notFoundCount++;
        }
      }

      return Response.json({
        existingCount,
        notFoundCount,
        existing,
        totalInput: seen.size,
      });
    }

    // --- IMPORT MODE (default) ---
    const { materials, duplicate_mode } = body;

    if (!Array.isArray(materials)) {
      return Response.json({ error: 'materials array required' }, { status: 400 });
    }
    if (!['skip', 'update'].includes(duplicate_mode)) {
      return Response.json({ error: 'duplicate_mode must be "skip" or "update"' }, { status: 400 });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      opening_txns: 0,
      errors: [],
      batch_number: body.batch_number || 1,
      total_batches: body.total_batches || 1,
      batch_size: materials.length,
    };
    const userEmail = user.email || user.id;

    // Seed the transaction ID counter
    const lastTxns = await base44.asServiceRole.entities.InventoryTransaction.filter(
      { transaction_id: { $regex: '^ITX-' } },
      '-transaction_id',
      1
    );
    let txnCounter = 1;
    if (lastTxns && lastTxns.length > 0) {
      const match = (lastTxns[0].transaction_id || '').match(/ITX-(\d+)/);
      if (match) txnCounter = parseInt(match[1], 10) + 1;
    }

    for (const mat of materials) {
      try {
        if (!mat.item_name) {
          results.errors.push({ sku: mat.sku || '', item_name: '', error: 'Item Name is required' });
          continue;
        }

        const normSku = normalizeSku(mat.sku);

        // Look up existing by normalized SKU (case-insensitive regex for legacy records)
        let existing = null;
        if (normSku) {
          const matches = await base44.asServiceRole.entities.InventoryMaster.filter(
            { sku: { $regex: '^' + escapeRegex(normSku) + '$', $options: 'i' } },
            '-created_date',
            1
          );
          existing = matches && matches.length > 0 ? matches[0] : null;
        }

        let masterId = null;
        const unitCost = Number(mat.unit_cost) || 0;
        const openingQty = Number(mat.opening_quantity) || 0;

        const masterFields = {
          item_name: mat.item_name,
          description: mat.description || '',
          category: mat.category || '',
          manufacturer: mat.manufacturer || '',
          vendor: mat.vendor || '',
          vendor_sku: mat.vendor_part_number || '',
          unit: mat.unit || 'ea',
          unit_cost: unitCost,
          msrp: Number(mat.msrp) || 0,
          selling_price: Number(mat.selling_price) || 0,
          warehouse_location: mat.primary_location || '',
          minimum_stock: Number(mat.minimum_stock) || 0,
          reorder_quantity: Number(mat.reorder_quantity) || 0,
          image_url: mat.image_url || '',
          is_active: mat.is_active !== false,
          status: mat.is_active !== false ? 'Active' : 'Inactive',
        };

        if (existing) {
          if (duplicate_mode === 'skip') {
            results.skipped++;
            masterId = existing.id;
          } else {
            await base44.asServiceRole.entities.InventoryMaster.update(existing.id, {
              ...masterFields,
              inventory_id: mat.inv_id || existing.inventory_id || '',
              sku: normSku || existing.sku || '',
            });
            masterId = existing.id;
            results.updated++;
          }
        } else {
          const created = await base44.asServiceRole.entities.InventoryMaster.create({
            ...masterFields,
            inventory_id: mat.inv_id || '',
            sku: normSku || '',
            inventory_type: 'Material',
            quantity_owned: 0,
            quantity_available: 0,
            quantity_assigned: 0,
            quantity_reserved: 0,
            quantity_on_order: 0,
            quantity_damaged: 0,
            quantity_retired: 0,
            is_balanced: true,
            inventory_value: 0,
          });
          masterId = created.id;
          results.created++;
        }

        // Opening balance — through the Inventory Transaction Engine only
        if (openingQty > 0 && masterId) {
          const existingOpening = await base44.asServiceRole.entities.InventoryTransaction.filter(
            { inventory_master_id: masterId, transaction_type: 'opening_balance' },
            '-created_date',
            1
          );

          if (!existingOpening || existingOpening.length === 0) {
            const item = await base44.asServiceRole.entities.InventoryMaster.get(masterId);

            const newOwned = (item.quantity_owned || 0) + openingQty;
            const newAvailable = (item.quantity_available || 0) + openingQty;
            const inventoryValue = Math.round((newOwned * unitCost) * 100) / 100;

            const sumAfter = newAvailable
              + (item.quantity_assigned || 0)
              + (item.quantity_reserved || 0)
              + (item.quantity_on_order || 0)
              + (item.quantity_damaged || 0)
              + (item.quantity_retired || 0);
            const isBalanced = newOwned === sumAfter;

            await base44.asServiceRole.entities.InventoryMaster.update(masterId, {
              quantity_owned: newOwned,
              quantity_available: newAvailable,
              inventory_value: inventoryValue,
              is_balanced: isBalanced,
              is_active: true,
              status: 'Active',
              last_movement_date: new Date().toISOString(),
            });

            const txnId = `ITX-${String(txnCounter).padStart(6, '0')}`;
            txnCounter++;

            await base44.asServiceRole.entities.InventoryTransaction.create({
              transaction_id: txnId,
              transaction_type: 'opening_balance',
              movement_direction: 'inbound',
              inventory_master_id: masterId,
              inventory_item_name: mat.item_name,
              inventory_type: 'Material',
              sku: normSku || '',
              quantity: openingQty,
              unit_of_measure: mat.unit || 'ea',
              unit_cost: unitCost,
              total_cost: Math.round((openingQty * unitCost) * 100) / 100,
              source_document_type: 'manual',
              reason: 'Opening balance from CSV import',
              notes: 'Bulk import opening balance',
              created_by: userEmail,
              transaction_date: new Date().toISOString(),
              posted_date: new Date().toISOString(),
            });

            results.opening_txns++;
          }
        }
      } catch (err) {
        results.errors.push({
          sku: mat.sku || '',
          item_name: mat.item_name || '',
          error: err.message,
        });
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});