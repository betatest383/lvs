import { base44 } from '@/api/base44Client';

/**
 * Equipment Package Synchronization Utility
 *
 * TruckProfile is the single source of truth for equipment package assignment.
 * Both Equipment Management and Fleet are interfaces to edit the same relationship.
 * These functions ensure bidirectional sync between:
 *   TruckProfile.assigned_equipment_package_id  ←→  EquipmentPackage.assigned_truck_id
 */

/**
 * Check if a package is already assigned to a truck (other than excludeTruckId).
 * Returns the conflicting TruckProfile record or null.
 */
export async function checkPackageConflict(equipmentPackageId, excludeTruckId = null) {
  if (!equipmentPackageId) return null;
  try {
    const trucks = await base44.entities.TruckProfile.filter({
      assigned_equipment_package_id: equipmentPackageId,
    });
    return trucks.find(t => t.id !== excludeTruckId) || null;
  } catch {
    return null;
  }
}

/**
 * Synchronize package assignment bidirectionally.
 *
 * - Clears any previous truck that held this package (if moving to a new truck)
 * - Clears any previous package on the target truck (if replacing)
 * - Updates TruckProfile.assigned_equipment_package_id
 * - Updates EquipmentPackage.assigned_truck_id
 * - Creates an EquipmentAssignmentHistory audit record
 *
 * @param {object} params
 * @param {object} params.equipmentPackage - EquipmentPackage record (must have .id)
 * @param {object} params.truck - TruckProfile record (must have .id, .truck_number)
 * @param {string} params.assignedBy - User name performing the assignment
 * @param {boolean} params.isSharedPackage - Whether this is a shared vehicle package
 */
export async function syncPackageToTruck({ equipmentPackage, truck, assignedBy, isSharedPackage = false }) {
  const now = new Date().toISOString();
  const pkgId = equipmentPackage.id;
  const pkgName = equipmentPackage.package_name || '';
  const pkgBusinessId = equipmentPackage.package_id || pkgId;
  const truckId = truck.id;
  const truckNumber = truck.truck_number || '';
  const truckName = truck.vehicle_name || '';

  // If package was previously assigned to a DIFFERENT truck, clear the old truck
  if (equipmentPackage.assigned_truck_id && equipmentPackage.assigned_truck_id !== truckId) {
    try {
      await base44.entities.TruckProfile.update(equipmentPackage.assigned_truck_id, {
        assigned_equipment_package_id: '',
        assigned_equipment_package_name: '',
        equipment_package_assigned_date: null,
        equipment_package_assigned_by: '',
      });
    } catch { /* old truck may have been deleted */ }
  }

  // If the target truck already has a DIFFERENT package, clear that package's truck link
  let currentTruck = null;
  try {
    currentTruck = await base44.entities.TruckProfile.get(truckId);
  } catch { /* ignore */ }
  if (currentTruck?.assigned_equipment_package_id && currentTruck.assigned_equipment_package_id !== pkgId) {
    try {
      await base44.entities.EquipmentPackage.update(currentTruck.assigned_equipment_package_id, {
        assigned_truck_id: '',
        assigned_truck_number: '',
        assigned_truck_name: '',
        assignment_timestamp: null,
        assigned_by: '',
      });
    } catch { /* old package may have been deleted */ }
  }

  // Update TruckProfile (single source of truth)
  await base44.entities.TruckProfile.update(truckId, {
    assigned_equipment_package_id: pkgId,
    assigned_equipment_package_name: pkgName,
    equipment_package_assigned_date: now,
    equipment_package_assigned_by: assignedBy,
  });

  // Update EquipmentPackage (bidirectional mirror)
  await base44.entities.EquipmentPackage.update(pkgId, {
    assigned_truck_id: truckId,
    assigned_truck_number: truckNumber,
    assigned_truck_name: truckName,
    assignment_timestamp: now,
    assigned_by: assignedBy,
    is_shared_package: isSharedPackage,
  });

  // Create audit record
  try {
    await base44.entities.EquipmentAssignmentHistory.create({
      history_id: `EAH-${String(Date.now()).slice(-8)}`,
      item_name: `Package: ${pkgName}`,
      quantity: 1,
      employee: assignedBy,
      assignment_date: now,
      return_date: now,
      assignment_type: 'permanent',
      truck_number: truckNumber,
      notes: `Equipment Package "${pkgName}" (${pkgBusinessId}) assigned to Truck ${truckNumber} by ${assignedBy}`,
    });
  } catch { /* audit is best-effort */ }
}

/**
 * Remove package assignment from both sides.
 *
 * - Clears TruckProfile.assigned_equipment_package_id
 * - Clears EquipmentPackage.assigned_truck_id
 * - Creates an EquipmentAssignmentHistory audit record
 *
 * @param {object} equipmentPackage - EquipmentPackage record
 * @param {string} truckId - TruckProfile internal id
 * @param {string} removedBy - User name performing the removal
 */
export async function removePackageFromTruck(equipmentPackage, truckId, removedBy) {
  const now = new Date().toISOString();
  const pkgId = equipmentPackage.id;
  const pkgName = equipmentPackage.package_name || '';
  const pkgBusinessId = equipmentPackage.package_id || pkgId;
  const truckNumber = equipmentPackage.assigned_truck_number || '';

  // Clear TruckProfile
  await base44.entities.TruckProfile.update(truckId, {
    assigned_equipment_package_id: '',
    assigned_equipment_package_name: '',
    equipment_package_assigned_date: null,
    equipment_package_assigned_by: '',
  });

  // Clear EquipmentPackage
  await base44.entities.EquipmentPackage.update(pkgId, {
    assigned_truck_id: '',
    assigned_truck_number: '',
    assigned_truck_name: '',
    assignment_timestamp: null,
    assigned_by: '',
  });

  // Audit record
  try {
    await base44.entities.EquipmentAssignmentHistory.create({
      history_id: `EAH-${String(Date.now()).slice(-8)}`,
      item_name: `Package: ${pkgName}`,
      quantity: 1,
      employee: removedBy,
      assignment_date: now,
      return_date: now,
      assignment_type: 'permanent',
      truck_number: truckNumber,
      return_reason: 'package_unassigned',
      notes: `Equipment Package "${pkgName}" (${pkgBusinessId}) removed from Truck ${truckNumber} by ${removedBy}`,
    });
  } catch { /* audit is best-effort */ }
}