import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const results = {
      consumable_catalog_total: 0,
      consumable_migrated: 0,
      consumable_skipped: 0,
      equipment_master_total: 0,
      equipment_migrated: 0,
      equipment_skipped: 0,
      errors: [],
    };

    // --- Migrate ConsumableCatalog ---
    const consumables = await base44.asServiceRole.entities.ConsumableCatalog.list('-created_date', 500);
    results.consumable_catalog_total = consumables.length;

    // Get existing legacy IDs to avoid duplicates
    const existingConsumable = await base44.asServiceRole.entities.InventoryMaster.filter(
      { legacy_entity: 'ConsumableCatalog' },
      '-created_date',
      500
    );
    const existingLegacyIds = new Set(existingConsumable.map(e => e.legacy_id).filter(Boolean));

    // Generate next inventory_id
    const lastInv = await base44.asServiceRole.entities.InventoryMaster.filter(
      { inventory_id: { $regex: '^INV-' } },
      '-inventory_id',
      1
    );
    let nextNum = 1;
    if (lastInv && lastInv.length > 0) {
      const match = (lastInv[0].inventory_id || '').match(/INV-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    const consumableRecords = [];
    for (const c of consumables) {
      if (existingLegacyIds.has(c.id)) {
        results.consumable_skipped++;
        continue;
      }
      const qtyOwned = c.quantity_on_hand || 0;
      const unitCost = c.unit_cost || 0;
      const invId = `INV-${String(nextNum).padStart(6, '0')}`;
      nextNum++;
      consumableRecords.push({
        inventory_id: invId,
        sku: c.sku || null,
        item_name: c.item_name,
        description: c.description || null,
        inventory_type: 'Consumable',
        category: c.category || null,
        unit: c.unit || 'ea',
        quantity_owned: qtyOwned,
        quantity_available: qtyOwned,
        quantity_assigned: 0,
        quantity_reserved: 0,
        quantity_on_order: 0,
        quantity_damaged: 0,
        quantity_retired: 0,
        minimum_stock: c.minimum_stock || 0,
        maximum_stock: c.maximum_stock || 0,
        reorder_quantity: c.reorder_quantity || 0,
        warehouse_location: c.warehouse_location || null,
        bin_location: c.bin_location || null,
        vendor: c.vendor || null,
        manufacturer: c.manufacturer || null,
        unit_cost: unitCost,
        inventory_value: Math.round(qtyOwned * unitCost * 100) / 100,
        status: c.status || 'Active',
        is_balanced: true,
        legacy_id: c.id,
        legacy_entity: 'ConsumableCatalog',
        notes: c.notes || null,
        is_active: c.is_active !== false,
      });
      results.consumable_migrated++;
    }

    if (consumableRecords.length > 0) {
      await base44.asServiceRole.entities.InventoryMaster.bulkCreate(consumableRecords);
    }

    // --- Migrate EquipmentMaster ---
    const equipment = await base44.asServiceRole.entities.EquipmentMaster.list('-created_date', 500);
    results.equipment_master_total = equipment.length;

    const existingEquipment = await base44.asServiceRole.entities.InventoryMaster.filter(
      { legacy_entity: 'EquipmentMaster' },
      '-created_date',
      500
    );
    const existingEqLegacyIds = new Set(existingEquipment.map(e => e.legacy_id).filter(Boolean));

    const equipmentRecords = [];
    for (const e of equipment) {
      if (existingEqLegacyIds.has(e.id)) {
        results.equipment_skipped++;
        continue;
      }
      const qtyOwned = e.quantity_owned || 0;
      const qtyAvail = e.quantity_available !== undefined ? e.quantity_available : qtyOwned;
      const qtyAssigned = e.quantity_assigned || 0;
      const qtyDamaged = e.quantity_out_for_repair || 0;
      const qtyRetired = e.quantity_retired || 0;
      const unitCost = e.replacement_cost_per_unit || 0;

      // Determine type: default Equipment, could be Tool if category indicates
      const invType = (e.category || '').toLowerCase().includes('tool') ? 'Tool' : 'Equipment';

      const invId = `INV-${String(nextNum).padStart(6, '0')}`;
      nextNum++;

      const balanced = qtyOwned === (qtyAvail + qtyAssigned + qtyDamaged + qtyRetired);

      equipmentRecords.push({
        inventory_id: invId,
        sku: e.equipment_id || null,
        item_name: e.item_name,
        description: e.description || null,
        inventory_type: invType,
        category: e.category || null,
        unit: e.unit || 'ea',
        quantity_owned: qtyOwned,
        quantity_available: qtyAvail,
        quantity_assigned: qtyAssigned,
        quantity_reserved: 0,
        quantity_on_order: 0,
        quantity_damaged: qtyDamaged,
        quantity_retired: qtyRetired,
        minimum_stock: 0,
        maximum_stock: 0,
        reorder_quantity: 0,
        warehouse_location: 'Main Warehouse',
        bin_location: null,
        vendor: null,
        manufacturer: null,
        unit_cost: unitCost,
        inventory_value: Math.round(qtyOwned * unitCost * 100) / 100,
        status: e.is_active !== false ? 'Active' : 'Inactive',
        is_balanced: balanced,
        legacy_id: e.id,
        legacy_entity: 'EquipmentMaster',
        notes: e.notes || null,
        is_active: e.is_active !== false,
      });
      results.equipment_migrated++;
    }

    if (equipmentRecords.length > 0) {
      await base44.asServiceRole.entities.InventoryMaster.bulkCreate(equipmentRecords);
    }

    return Response.json({
      success: true,
      results,
      total_migrated: results.consumable_migrated + results.equipment_migrated,
      total_skipped: results.consumable_skipped + results.equipment_skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});