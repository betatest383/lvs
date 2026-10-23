import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function calculateDelta(type: string, qty: number, condition: string, currentAvailable: number) {
  switch (type) {
    case 'receive_purchase':
      return { owned: qty, available: qty, assigned: 0, repair: 0, retired: 0 };
    case 'issue_to_employee':
      return { owned: 0, available: -qty, assigned: qty, repair: 0, retired: 0 };
    case 'return_from_employee':
      if (condition === 'repair') return { owned: 0, available: 0, assigned: -qty, repair: qty, retired: 0 };
      if (condition === 'damaged' || condition === 'lost') return { owned: 0, available: 0, assigned: -qty, repair: 0, retired: qty };
      return { owned: 0, available: qty, assigned: -qty, repair: 0, retired: 0 };
    case 'transfer_between_employees':
      return { owned: 0, available: 0, assigned: 0, repair: 0, retired: 0 };
    case 'transfer_between_trucks':
      return { owned: 0, available: 0, assigned: 0, repair: 0, retired: 0 };
    case 'transfer_between_warehouses':
      return { owned: 0, available: 0, assigned: 0, repair: 0, retired: 0 };
    case 'truck_restock':
      return { owned: 0, available: -qty, assigned: qty, repair: 0, retired: 0 };
    case 'truck_return':
      return { owned: 0, available: qty, assigned: -qty, repair: 0, retired: 0 };
    case 'adjust_inventory':
      return { owned: 0, available: qty, assigned: 0, repair: 0, retired: 0 };
    case 'physical_count': {
      const delta = qty - currentAvailable;
      return { owned: 0, available: delta, assigned: 0, repair: 0, retired: 0 };
    }
    case 'repair':
      return { owned: 0, available: -qty, assigned: 0, repair: qty, retired: 0 };
    case 'returned_from_repair':
      return { owned: 0, available: qty, assigned: 0, repair: -qty, retired: 0 };
    case 'retire_item':
      return { owned: 0, available: -qty, assigned: 0, repair: 0, retired: qty };
    case 'lost':
      return { owned: 0, available: 0, assigned: -qty, repair: 0, retired: qty };
    case 'damaged':
      return { owned: 0, available: -qty, assigned: 0, repair: 0, retired: qty };
    case 'warranty_replacement':
      return { owned: -qty, available: -qty, assigned: 0, repair: 0, retired: qty };
    case 'vendor_return':
      return { owned: -qty, available: -qty, assigned: 0, repair: 0, retired: 0 };
    default:
      throw new Error('Unknown transaction type: ' + type);
  }
}

function validateTransaction(type: string, qty: number, before: any, after: any) {
  if (after.owned < 0) return { valid: false, error: 'Quantity owned would go negative' };
  if (after.available < 0) return { valid: false, error: 'Quantity available would go negative — cannot issue unavailable inventory' };
  if (after.assigned < 0) return { valid: false, error: 'Quantity assigned would go negative — cannot return more than assigned' };
  if (after.repair < 0) return { valid: false, error: 'Quantity in repair would go negative' };
  if (after.retired < 0) return { valid: false, error: 'Quantity retired would go negative' };

  if (type === 'issue_to_employee' && qty > before.available)
    return { valid: false, error: 'Cannot issue ' + qty + ' units — only ' + before.available + ' available' };
  if (type === 'return_from_employee' && qty > before.assigned)
    return { valid: false, error: 'Cannot return ' + qty + ' units — only ' + before.assigned + ' assigned' };
  if (type === 'lost' && qty > before.assigned)
    return { valid: false, error: 'Cannot mark ' + qty + ' units as lost — only ' + before.assigned + ' assigned' };
  if (type === 'truck_restock' && qty > before.available)
    return { valid: false, error: 'Cannot restock ' + qty + ' units — only ' + before.available + ' available' };
  if (type === 'truck_return' && qty > before.assigned)
    return { valid: false, error: 'Cannot return ' + qty + ' units — only ' + before.assigned + ' assigned to trucks' };
  if (type === 'repair' && qty > before.available)
    return { valid: false, error: 'Cannot send ' + qty + ' units to repair — only ' + before.available + ' available' };
  if (type === 'retire_item' && qty > before.available)
    return { valid: false, error: 'Cannot retire ' + qty + ' units — only ' + before.available + ' available' };
  if (type === 'damaged' && qty > before.available)
    return { valid: false, error: 'Cannot damage ' + qty + ' units — only ' + before.available + ' available' };
  if (type === 'vendor_return' && qty > before.available)
    return { valid: false, error: 'Cannot return ' + qty + ' units to vendor — only ' + before.available + ' available' };

  return { valid: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { transaction_type, equipment_master_id, quantity, condition } = body;
    const rest = body;
    const qty = Number(quantity) || 0;
    if (qty <= 0) return Response.json({ error: 'Quantity must be greater than zero' }, { status: 400 });
    if (!transaction_type) return Response.json({ error: 'Transaction type is required' }, { status: 400 });
    if (!equipment_master_id) return Response.json({ error: 'Equipment item is required' }, { status: 400 });

    // Fetch equipment master
    const master = await base44.asServiceRole.entities.EquipmentMaster.get(equipment_master_id);
    if (!master) return Response.json({ error: 'Equipment not found' }, { status: 404 });

    // Snapshot before
    const before = {
      owned: master.quantity_owned || 0,
      available: master.quantity_available || 0,
      assigned: master.quantity_assigned || 0,
      repair: master.quantity_out_for_repair || 0,
      retired: master.quantity_retired || 0
    };

    // Calculate delta and after state
    const delta = calculateDelta(transaction_type, qty, condition, before.available);
    const after = {
      owned: before.owned + delta.owned,
      available: before.available + delta.available,
      assigned: before.assigned + delta.assigned,
      repair: before.repair + delta.repair,
      retired: before.retired + delta.retired
    };

    // Validate
    const validation = validateTransaction(transaction_type, qty, before, after);
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

    // Duplicate check: same type + equipment + quantity within last 60 seconds
    const recentTxns = await base44.asServiceRole.entities.InventoryTransaction.list('-created_date', 5);
    const now = Date.now();
    const isDuplicate = recentTxns.some(t => {
      if (t.transaction_type !== transaction_type) return false;
      if (t.equipment_master_id !== equipment_master_id) return false;
      if (t.quantity !== qty) return false;
      const txnTime = new Date(t.transaction_date || t.created_date).getTime();
      return (now - txnTime) < 60000;
    });
    if (isDuplicate) return Response.json({ error: 'Duplicate transaction detected — same type, equipment, and quantity within the last minute' }, { status: 409 });

    // Generate transaction ID
    let nextNum = 1;
    if (recentTxns.length > 0 && recentTxns[0].transaction_id) {
      const m = recentTxns[0].transaction_id.match(/ITX-(\d+)/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const transaction_id = 'ITX-' + String(nextNum).padStart(6, '0');
    const userName = user.full_name || user.email;
    const nowISO = new Date().toISOString();
    const total_cost = (Number(rest.unit_cost) || 0) * qty;

    // Update EquipmentMaster (calculated quantities — never edited directly elsewhere)
    await base44.asServiceRole.entities.EquipmentMaster.update(equipment_master_id, {
      quantity_owned: after.owned,
      quantity_available: after.available,
      quantity_assigned: after.assigned,
      quantity_out_for_repair: after.repair,
      quantity_retired: after.retired
    });

    // Issue to employee: create TechEquipment assignment
    if (transaction_type === 'issue_to_employee') {
      await base44.asServiceRole.entities.TechEquipment.create({
        equipment_master_id,
        equipment_id: master.equipment_id || '',
        item_name: master.item_name,
        category: master.category || '',
        assignment_type: 'permanent',
        assigned_employee: rest.employee || '',
        assigned_by: userName,
        assignment_date: nowISO,
        quantity: qty,
        condition: 'good',
        status: 'active',
        is_active: true,
        storage_location: rest.truck || rest.destination_location || ''
      });
    }

    // Truck restock: create TechEquipment assignment to truck
    if (transaction_type === 'truck_restock') {
      await base44.asServiceRole.entities.TechEquipment.create({
        equipment_master_id,
        equipment_id: master.equipment_id || '',
        item_name: master.item_name,
        category: master.category || '',
        assignment_type: 'permanent',
        assigned_truck: rest.truck || '',
        assigned_truck_number: rest.truck || '',
        assigned_by: userName,
        assignment_date: nowISO,
        quantity: qty,
        condition: 'good',
        status: 'active',
        is_active: true,
        storage_location: rest.truck || ''
      });
    }

    // Return from employee: deactivate TechEquipment assignment
    if (transaction_type === 'return_from_employee') {
      const assignments = await base44.asServiceRole.entities.TechEquipment.filter({ equipment_master_id, is_active: true });
      const matching = assignments.filter(a => a.assigned_employee === rest.employee);
      if (matching.length > 0) {
        await base44.asServiceRole.entities.TechEquipment.update(matching[0].id, {
          is_active: false,
          actual_return_datetime: nowISO,
          return_condition: condition || '',
          return_reason: rest.reason || '',
          quantity_returned: qty,
          returned_by: userName
        });
      }
    }

    // Truck return: deactivate truck assignment
    if (transaction_type === 'truck_return') {
      const assignments = await base44.asServiceRole.entities.TechEquipment.filter({ equipment_master_id, is_active: true });
      const matching = assignments.filter(a => a.assigned_truck === rest.truck || a.assigned_truck_number === rest.truck);
      if (matching.length > 0) {
        await base44.asServiceRole.entities.TechEquipment.update(matching[0].id, {
          is_active: false,
          actual_return_datetime: nowISO,
          return_condition: condition || '',
          return_reason: rest.reason || '',
          quantity_returned: qty,
          returned_by: userName
        });
      }
    }

    // Transfer between employees: reassign TechEquipment
    if (transaction_type === 'transfer_between_employees') {
      const assignments = await base44.asServiceRole.entities.TechEquipment.filter({ equipment_master_id, is_active: true });
      const matching = assignments.filter(a => a.assigned_employee === rest.source_location);
      if (matching.length > 0) {
        await base44.asServiceRole.entities.TechEquipment.update(matching[0].id, {
          assigned_employee: rest.destination_location,
          notes: 'Transferred from ' + rest.source_location + ' to ' + rest.destination_location + ' on ' + nowISO
        });
      }
    }

    // Transfer between trucks: update truck assignment
    if (transaction_type === 'transfer_between_trucks') {
      const assignments = await base44.asServiceRole.entities.TechEquipment.filter({ equipment_master_id, is_active: true });
      const matching = assignments.filter(a => a.assigned_truck === rest.source_location || a.assigned_truck_number === rest.source_location);
      if (matching.length > 0) {
        await base44.asServiceRole.entities.TechEquipment.update(matching[0].id, {
          assigned_truck: rest.destination_location,
          assigned_truck_number: rest.destination_location,
          storage_location: rest.destination_location,
          notes: 'Transferred from truck ' + rest.source_location + ' to truck ' + rest.destination_location + ' on ' + nowISO
        });
      }
    }

    // Create InventoryTransaction ledger record
    const txn = await base44.asServiceRole.entities.InventoryTransaction.create({
      transaction_id,
      transaction_type,
      equipment_master_id,
      equipment_id: master.equipment_id || '',
      equipment_name: master.item_name,
      quantity: qty,
      quantity_before: JSON.stringify(before),
      quantity_after: JSON.stringify(after),
      unit_cost: Number(rest.unit_cost) || 0,
      total_cost,
      vendor: rest.vendor || '',
      purchase_order: rest.purchase_order || '',
      employee: rest.employee || '',
      truck: rest.truck || '',
      warehouse_location: rest.warehouse_location || '',
      source_location: rest.source_location || '',
      destination_location: rest.destination_location || '',
      condition: condition || '',
      reason: rest.reason || '',
      notes: rest.notes || '',
      related_task: rest.related_task || '',
      related_work_order: rest.related_work_order || '',
      related_employee: rest.related_employee || '',
      related_truck: rest.related_truck || '',
      created_by: userName,
      approved_by: userName,
      transaction_date: nowISO,
      status: 'completed',
      audit_reference: 'AUDIT-' + transaction_id
    });

    // Low stock / out of stock notifications
    if (after.available === 0 && before.available > 0) {
      await base44.asServiceRole.entities.EnterpriseNotification.create({
        notification_id: 'NOT-STOCK-' + Date.now(),
        title: 'Out of Stock: ' + master.item_name,
        message: (master.equipment_id || '') + ' - ' + master.item_name + ' is now out of stock.',
        notification_type: 'Critical',
        priority: 'High',
        status: 'Pending',
        source_module: 'inventory',
        related_equipment: master.equipment_id || '',
        delivery_methods: ['In-App']
      });
    } else if (after.available <= 2 && after.available > 0 && before.available > 2) {
      await base44.asServiceRole.entities.EnterpriseNotification.create({
        notification_id: 'NOT-LOW-' + Date.now(),
        title: 'Low Stock: ' + master.item_name,
        message: (master.equipment_id || '') + ' - ' + master.item_name + ' has only ' + after.available + ' units available.',
        notification_type: 'Warning',
        priority: 'Medium',
        status: 'Pending',
        source_module: 'inventory',
        related_equipment: master.equipment_id || '',
        delivery_methods: ['In-App']
      });
    }

    return Response.json({
      success: true,
      transaction_id,
      transaction: txn,
      master_before: before,
      master_after: after
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});