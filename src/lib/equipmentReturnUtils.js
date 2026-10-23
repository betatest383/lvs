import { base44 } from '@/api/base44Client';

/**
 * Maps a return condition to an EquipmentMaster stock destination.
 * - good/fair/new → available (back in warehouse stock)
 * - poor/damaged/out_for_repair → repair (out for repair)
 * - missing → retired (effectively gone)
 */
export const RETURN_CONDITION_DESTINATION = {
  new: 'available',
  good: 'available',
  fair: 'available',
  poor: 'repair',
  damaged: 'repair',
  out_for_repair: 'repair',
  missing: 'retired',
};

export const DISPOSITION_LABELS = {
  available: 'Returned to Warehouse (Available)',
  repair: 'Sent to Repair',
  retired: 'Retired / Written Off',
};

/**
 * Processes a single equipment return.
 * Updates TechEquipment, EquipmentMaster, and creates an EquipmentAssignmentHistory record.
 *
 * @param {object} assignment - The TechEquipment assignment record being returned.
 * @param {object} formData - { return_condition, quantity_returned, return_reason, notes }
 * @returns {Promise<object>} - { success, history_id, disposition }
 */
export async function processEquipmentReturn(assignment, formData) {
  const me = await base44.auth.me();
  const now = new Date().toISOString();
  const returnQty = formData.quantity_returned || assignment.quantity || 1;
  const assignedQty = assignment.quantity || 1;
  const fullReturn = returnQty >= assignedQty;

  const disposition = RETURN_CONDITION_DESTINATION[formData.return_condition] || 'available';

  // 1. Update TechEquipment — end assignment, never delete
  const techUpdate = {
    return_condition: formData.return_condition,
    return_reason: formData.return_reason,
    quantity_returned: returnQty,
    returned_by: me.full_name,
    actual_return_datetime: now,
  };

  if (fullReturn) {
    techUpdate.is_active = false;
    techUpdate.status = disposition === 'available' ? 'warehouse_stock'
      : disposition === 'repair' ? 'out_for_repair'
      : 'retired';
    techUpdate.assignment_type = disposition === 'available' ? 'warehouse_stock'
      : disposition === 'repair' ? 'repair'
      : 'retired';
    techUpdate.assigned_employee = '';
    techUpdate.assigned_employee_email = '';
    techUpdate.storage_location = disposition === 'available' ? 'Warehouse'
      : disposition === 'repair' ? 'Repair Shop'
      : 'Retired';
    techUpdate.notes = (assignment.notes ? assignment.notes + ' | ' : '') + `Returned by ${me.full_name}: ${formData.notes || 'No additional notes'}`;
  } else {
    // Partial return: reduce quantity, keep active
    const remaining = assignedQty - returnQty;
    techUpdate.quantity = remaining;
    techUpdate.current_value = (assignment.replacement_cost || 0) * remaining;
    techUpdate.notes = (assignment.notes ? assignment.notes + ' | ' : '') + `Partial return (${returnQty} of ${assignedQty}) by ${me.full_name}: ${formData.notes || 'No additional notes'}`;
  }

  await base44.entities.TechEquipment.update(assignment.id, techUpdate);

  // 2. Update EquipmentMaster stock quantities
  if (assignment.equipment_master_id) {
    const master = await base44.entities.EquipmentMaster.get(assignment.equipment_master_id);
    const masterUpdate = {
      quantity_assigned: Math.max(0, (master.quantity_assigned || 0) - returnQty),
    };
    if (disposition === 'available') {
      masterUpdate.quantity_available = (master.quantity_available || 0) + returnQty;
    } else if (disposition === 'repair') {
      masterUpdate.quantity_out_for_repair = (master.quantity_out_for_repair || 0) + returnQty;
    } else if (disposition === 'retired') {
      masterUpdate.quantity_retired = (master.quantity_retired || 0) + returnQty;
    }
    await base44.entities.EquipmentMaster.update(assignment.equipment_master_id, masterUpdate);
  }

  // 3. Create EquipmentAssignmentHistory record
  const historyId = `EAH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const historyRecord = {
    history_id: historyId,
    equipment_master_id: assignment.equipment_master_id || '',
    tech_equipment_id: assignment.id || '',
    equipment_id: assignment.equipment_id || '',
    item_name: assignment.item_name || '',
    category: assignment.category || '',
    unit: assignment.unit || 'ea',
    quantity: assignedQty,
    quantity_returned: returnQty,
    employee: assignment.assigned_employee || '',
    employee_email: assignment.assigned_employee_email || '',
    assigned_by: assignment.assigned_by || '',
    assignment_date: assignment.assignment_date || '',
    assignment_type: assignment.assignment_type || '',
    truck_number: assignment.assigned_truck_number || '',
    storage_location: assignment.storage_location || '',
    returned_by: me.full_name,
    return_date: now,
    return_condition: formData.return_condition,
    return_reason: formData.return_reason,
    disposition,
    replacement_cost_per_unit: assignment.replacement_cost || 0,
    total_value: (assignment.replacement_cost || 0) * returnQty,
    notes: formData.notes || '',
    is_deleted: false,
  };
  await base44.entities.EquipmentAssignmentHistory.create(historyRecord);

  return { success: true, history_id: historyId, disposition, full_return: fullReturn };
}

/**
 * Processes bulk equipment returns.
 * Iterates through all assignments and processes each one with the same form data.
 *
 * @param {array} assignments - Array of TechEquipment assignment records.
 * @param {object} formData - { return_condition, return_reason, notes } (applied to all)
 * @returns {Promise<object>} - { total, succeeded, failed, errors }
 */
export async function processBulkReturns(assignments, formData) {
  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (const assignment of assignments) {
    try {
      const returnData = {
        return_condition: formData.return_condition,
        quantity_returned: assignment.quantity || 1,
        return_reason: formData.return_reason,
        notes: formData.notes || '',
      };
      await processEquipmentReturn(assignment, returnData);
      succeeded++;
    } catch (err) {
      failed++;
      errors.push({ item: assignment.item_name, error: err.message || 'Unknown error' });
    }
  }

  return { total: assignments.length, succeeded, failed, errors };
}