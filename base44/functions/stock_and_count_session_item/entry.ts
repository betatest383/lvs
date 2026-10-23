import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Capability-based permissions (mirrors manageInventoryCountSession) ───
const WAREHOUSE_CAPABILITIES = {
  admin: '*',
  owner: '*',
  director_of_operations: '*',
  operations_manager: '*',
  warehouse_manager: '*',
  inventory_specialist: '*',
  warehouse_associate: ['warehouse.setup.view', 'warehouse.material.assign', 'warehouse.inventory.count'],
};

function hasCapability(roleKey, capability) {
  const caps = WAREHOUSE_CAPABILITIES[roleKey];
  if (!caps) return false;
  if (caps === '*') return true;
  return caps.includes(capability);
}

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

async function resolveUserRole(base44, user) {
  if (user.role === 'admin') return 'admin';
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  const rawRole = normalizeRole(employee.primary_role || '');
  if (!WAREHOUSE_CAPABILITIES[rawRole] && employee.primary_role) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({
        $or: [{ role_key: rawRole }, { role_name: employee.primary_role }, { role_id: employee.primary_role }],
      });
      if (roles[0]?.role_key) return normalizeRole(roles[0].role_key);
    } catch {}
  }
  return rawRole;
}

// ─── Compute item status from bin validity and count presence ───
function computeItemStatus(item, binsMap, sessionWarehouseId, countData) {
  const binId = item.bin_location_id;
  const hasCount = countData[item.id]?.count !== undefined && countData[item.id]?.count !== '';
  let hasValidBin = false;
  if (binId) {
    const bin = binsMap.get(binId);
    if (bin && bin.warehouse_location_id === sessionWarehouseId) hasValidBin = true;
  }
  if (hasValidBin && hasCount) return 'ready_for_review';
  if (hasCount && !hasValidBin) return 'missing_bin';
  if (hasValidBin && !hasCount) return 'missing_count';
  return 'unprocessed';
}

// ─── Compute session-wide progress ───
async function computeProgress(base44, session, countData) {
  const assignedIds = session.assigned_item_ids || [];
  if (assignedIds.length === 0) {
    return { total_items: 0, ready_for_review: 0, missing_bin: 0, missing_count: 0, unprocessed: 0, items: [] };
  }

  const items = [];
  for (const id of assignedIds) {
    try {
      const it = await base44.asServiceRole.entities.InventoryMaster.get(id);
      if (it) items.push(it);
    } catch {}
  }

  const allBins = await base44.asServiceRole.entities.BinLocation.list('-created_date', 500);
  const binsMap = new Map(allBins.map(b => [b.id, b]));

  let ready = 0, missingBin = 0, missingCount = 0, unprocessed = 0;
  for (const it of items) {
    const status = computeItemStatus(it, binsMap, session.warehouse_location_id, countData);
    if (status === 'ready_for_review') ready++;
    else if (status === 'missing_bin') missingBin++;
    else if (status === 'missing_count') missingCount++;
    else unprocessed++;
  }

  return { total_items: items.length, ready_for_review: ready, missing_bin: missingBin, missing_count: missingCount, unprocessed, items };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roleKey = await resolveUserRole(base44, user);
    if (!hasCapability(roleKey, 'warehouse.material.assign') || !hasCapability(roleKey, 'warehouse.inventory.count')) {
      return Response.json({ error: 'Insufficient permissions for stock & count' }, { status: 403 });
    }

    const body = await req.json();
    const { session_id, inventory_master_id, destination_bin_id, opening_quantity, photo_ids, notes } = body;

    if (!session_id || !inventory_master_id || !destination_bin_id) {
      return Response.json({ error: 'Missing required fields: session_id, inventory_master_id, destination_bin_id' }, { status: 400 });
    }

    // ── Fetch session ──
    const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    // ── Verify session is editable ──
    if (!['in_progress'].includes(session.status)) {
      return Response.json({ error: `Session is not editable (status: ${session.status})` }, { status: 403 });
    }

    // ── Fetch destination bin ──
    const bin = await base44.asServiceRole.entities.BinLocation.get(destination_bin_id);
    if (!bin) return Response.json({ error: 'Destination bin not found' }, { status: 404 });

    // ── Verify bin belongs to session warehouse ──
    if (bin.warehouse_location_id !== session.warehouse_location_id) {
      return Response.json({ error: 'Destination bin does not belong to the session warehouse' }, { status: 400 });
    }

    // ── Fetch inventory item ──
    const item = await base44.asServiceRole.entities.InventoryMaster.get(inventory_master_id);
    if (!item) return Response.json({ error: 'Inventory item not found' }, { status: 404 });

    // ── Add item to assigned_item_ids if not already present ──
    let updatedAssignedIds = session.assigned_item_ids || [];
    if (!updatedAssignedIds.includes(inventory_master_id)) {
      updatedAssignedIds = [...updatedAssignedIds, inventory_master_id];
    }

    // ── Record cross-warehouse move history ──
    const isCrossWarehouse = item.warehouse_location_id && item.warehouse_location_id !== session.warehouse_location_id;
    let existingHistory = [];
    try { existingHistory = JSON.parse(item.assignment_history_json || '[]'); } catch { existingHistory = []; }
    const historyEntry = isCrossWarehouse ? {
      action: 'warehouse_move',
      previous_warehouse: item.warehouse_location || null,
      previous_bin: item.bin_location || null,
      new_warehouse: session.warehouse_location_name || '',
      new_bin: bin.bin_code || '',
      session_id: session.session_id || session.id,
      user: user.email || '',
      timestamp: new Date().toISOString(),
    } : null;

    // ── Prepare InventoryMaster update (bin assignment) ──
    const inventoryUpdate = {
      is_stocked_inventory_item: true,
      warehouse_location_id: session.warehouse_location_id,
      warehouse_location: session.warehouse_location_name || '',
      bin_location_id: destination_bin_id,
      bin_location: bin.bin_code || '',
      inventory_status: 'stocked_assigned',
      default_inventory_location_id: session.warehouse_location_id,
      default_bin_location_id: destination_bin_id,
      assignment_history_json: historyEntry
        ? JSON.stringify([...existingHistory, historyEntry])
        : item.assignment_history_json,
    };

    // ── Prepare session count_data_json update (prevents duplicates by keying on item_id) ──
    let countData = {};
    try { countData = JSON.parse(session.count_data_json || '{}'); } catch { countData = {}; }
    countData[inventory_master_id] = {
      count: Number(opening_quantity) || 0,
      notes: notes || '',
      counted_at: new Date().toISOString(),
      photo_ids: photo_ids || [],
    };

    // ── Store previous item state for rollback ──
    const previousItemState = {
      is_stocked_inventory_item: item.is_stocked_inventory_item,
      warehouse_location_id: item.warehouse_location_id,
      warehouse_location: item.warehouse_location,
      bin_location_id: item.bin_location_id,
      bin_location: item.bin_location,
      inventory_status: item.inventory_status,
      default_inventory_location_id: item.default_inventory_location_id,
      default_bin_location_id: item.default_bin_location_id,
      assignment_history_json: item.assignment_history_json,
    };

    // ── Atomic save: update InventoryMaster first, then session. Rollback on failure. ──
    try {
      await base44.asServiceRole.entities.InventoryMaster.update(inventory_master_id, inventoryUpdate);
      await base44.asServiceRole.entities.InventoryCountSession.update(session.id, {
        assigned_item_ids: updatedAssignedIds,
        count_data_json: JSON.stringify(countData),
      });
    } catch (saveError) {
      // Rollback InventoryMaster to preserve atomicity
      try {
        await base44.asServiceRole.entities.InventoryMaster.update(inventory_master_id, previousItemState);
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr);
      }
      return Response.json({
        error: 'Atomic save failed — both assignment and count were rolled back',
        details: saveError.message,
        recoverable: true,
        preserved_values: { destination_bin_id, opening_quantity, photo_ids, notes },
      }, { status: 500 });
    }

    // ── Compute updated item status and session progress ──
    const updatedSession = await base44.asServiceRole.entities.InventoryCountSession.get(session.id);
    const progress = await computeProgress(base44, updatedSession, countData);

    // Item-specific status
    const allBins = await base44.asServiceRole.entities.BinLocation.list('-created_date', 500);
    const binsMap = new Map(allBins.map(b => [b.id, b]));
    const updatedItem = progress.items.find(it => it.id === inventory_master_id);
    const itemStatus = updatedItem
      ? computeItemStatus(updatedItem, binsMap, session.warehouse_location_id, countData)
      : 'unprocessed';

    return Response.json({
      success: true,
      item: {
        id: inventory_master_id,
        status: itemStatus,
        warehouse_location: updatedItem?.warehouse_location || session.warehouse_location_name,
        bin_location: updatedItem?.bin_location || bin.bin_code,
        bin_location_id: updatedItem?.bin_location_id || destination_bin_id,
        warehouse_location_id: updatedItem?.warehouse_location_id || session.warehouse_location_id,
      },
      session_progress: {
        total_items: progress.total_items,
        ready_for_review: progress.ready_for_review,
        missing_bin: progress.missing_bin,
        missing_count: progress.missing_count,
        unprocessed: progress.unprocessed,
      },
      session: updatedSession,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});