import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      consumable_catalog_id,
      quantity_delta,
      transaction_type,
      reason,
      notes,
      related_request_id,
      related_truck,
      vendor,
      purchase_order,
      unit_cost_override,
    } = body;

    if (!consumable_catalog_id || quantity_delta == null) {
      return Response.json({ error: 'consumable_catalog_id and quantity_delta are required' }, { status: 400 });
    }

    const VALID_TYPES = ['consumable_receive', 'consumable_adjust', 'consumable_retire', 'consumable_fulfill', 'consumable_return'];
    if (!VALID_TYPES.includes(transaction_type)) {
      return Response.json({ error: `Invalid transaction_type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const catalog = await base44.asServiceRole.entities.ConsumableCatalog.get(consumable_catalog_id);
    if (!catalog) {
      return Response.json({ error: 'Consumable catalog item not found' }, { status: 404 });
    }

    const qtyBefore = catalog.quantity_on_hand || 0;
    const qtyAfter = qtyBefore + quantity_delta;

    if (qtyAfter < 0) {
      return Response.json({
        error: `Insufficient stock. On hand: ${qtyBefore}, requested change: ${quantity_delta}`,
        current_quantity: qtyBefore,
      }, { status: 400 });
    }

    const unitCost = unit_cost_override != null ? unit_cost_override : (catalog.unit_cost || 0);
    const inventoryValue = Math.round(qtyAfter * unitCost * 100) / 100;

    // Generate transaction ID
    const recentTxns = await base44.asServiceRole.entities.InventoryTransaction.list('-created_date', 1);
    let nextNum = 1;
    if (recentTxns.length > 0 && recentTxns[0].transaction_id) {
      const m = recentTxns[0].transaction_id.match(/ITX-(\d+)/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const transactionId = `ITX-${String(nextNum).padStart(6, '0')}`;

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Update catalog item
    const catalogUpdates = {
      quantity_on_hand: qtyAfter,
      inventory_value: inventoryValue,
    };

    if (transaction_type === 'consumable_receive') {
      catalogUpdates.last_received_date = now;
      if (vendor) catalogUpdates.vendor = vendor;
      if (unit_cost_override != null) catalogUpdates.unit_cost = unit_cost_override;
    }

    if (transaction_type === 'consumable_retire') {
      catalogUpdates.status = 'Inactive';
      catalogUpdates.is_active = false;
    }

    // Auto-set status to Inactive if stock hits 0 (unless already retired)
    if (qtyAfter === 0 && transaction_type !== 'consumable_retire') {
      catalogUpdates.status = 'Inactive';
      catalogUpdates.is_active = false;
    }

    // Auto-reactivate if stock returns above 0 (unless explicitly retired)
    if (qtyAfter > 0 && transaction_type !== 'consumable_retire' && catalog.status === 'Inactive') {
      catalogUpdates.status = 'Active';
      catalogUpdates.is_active = true;
    }

    const updatedCatalog = await base44.asServiceRole.entities.ConsumableCatalog.update(consumable_catalog_id, catalogUpdates);

    // Create audit transaction record
    const txnRecord = {
      transaction_id: transactionId,
      transaction_type,
      consumable_catalog_id: consumable_catalog_id,
      consumable_sku: catalog.sku || '',
      equipment_name: catalog.item_name,
      quantity: Math.abs(quantity_delta),
      quantity_before: JSON.stringify({ quantity_on_hand: qtyBefore }),
      quantity_after: JSON.stringify({ quantity_on_hand: qtyAfter }),
      unit_cost: unitCost,
      total_cost: Math.round(Math.abs(quantity_delta) * unitCost * 100) / 100,
      vendor: vendor || catalog.vendor || '',
      purchase_order: purchase_order || '',
      truck: related_truck || '',
      warehouse_location: catalog.warehouse_location || '',
      reason: reason || '',
      notes: notes || '',
      related_request_id: related_request_id || '',
      related_truck: related_truck || '',
      created_by: user.full_name || user.email,
      transaction_date: now,
      status: 'completed',
    };

    await base44.asServiceRole.entities.InventoryTransaction.create(txnRecord);

    return Response.json({
      success: true,
      transaction_id: transactionId,
      catalog_item: updatedCatalog,
      quantity_before: qtyBefore,
      quantity_after: qtyAfter,
      inventory_value: inventoryValue,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});