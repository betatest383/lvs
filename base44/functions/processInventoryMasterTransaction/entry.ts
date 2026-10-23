import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Type mapping: function-level type → entity-level type + direction + source ───
const TYPE_MAPPING = {
  opening_balance:    { entityType: 'opening_balance',      direction: 'inbound',  sourceDoc: 'manual' },
  receive:            { entityType: 'receive_purchase',     direction: 'inbound',  sourceDoc: 'purchase_order' },
  assign:             { entityType: 'issue_to_job',          direction: 'outbound', sourceDoc: 'manual' },
  return:             { entityType: 'return_to_warehouse',   direction: 'inbound',  sourceDoc: 'material_return' },
  fulfill:            { entityType: 'pick',                  direction: 'outbound', sourceDoc: 'sales_order' },
  reserve:            { entityType: 'reserve',               direction: 'neutral',  sourceDoc: 'manual' },
  release_reservation:{ entityType: 'release_reservation',   direction: 'neutral',  sourceDoc: 'manual' },
  damage:             { entityType: 'damage',                direction: 'outbound', sourceDoc: 'inventory_adjustment' },
  retire:             { entityType: 'disposal',               direction: 'outbound', sourceDoc: 'inventory_adjustment' },
  transfer:           { entityType: 'transfer_out',          direction: 'internal', sourceDoc: 'warehouse_transfer' },
};

const AUTHORIZED_ROLES = [
  'admin', 'owner', 'warehouse_manager', 'inventory_specialist',
  'operations_manager', 'director_of_operations',
];

const TECHNICIAN_ROLES = ['lead_technician', 'senior_technician', 'technician', 'apprentice'];

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
  return normalizeRole(employee.primary_role || '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      inventory_master_id,
      transaction_type,
      quantity,
      reason,
      notes,
      related_employee,
      related_truck,
      related_job,
      related_request_id,
      purchase_order,
      unit_cost,
      vendor,
      destination_location,
      idempotency_key,
      count_session_id,
    } = body;

    // ─── Authorization (transaction-type-aware) ───
    const roleKey = await resolveUserRole(base44, user);
    const isAuthorized = AUTHORIZED_ROLES.includes(roleKey) ||
      (transaction_type === 'return' && TECHNICIAN_ROLES.includes(roleKey));
    if (!isAuthorized) {
      console.log(`[BYPASS AUDIT] DENIED user=${user.email} role=${roleKey} action=inventory_txn type=${transaction_type} item=${inventory_master_id}`);
      return Response.json({ error: 'Access denied: insufficient permissions for inventory transactions' }, { status: 403 });
    }

    console.log(`[BYPASS AUDIT] user=${user.email} role=${roleKey} action=inventory_txn type=${transaction_type} item=${inventory_master_id} qty=${quantity}`);

    // ─── Validate required fields BEFORE any mutation ───
    if (!inventory_master_id) return Response.json({ error: 'inventory_master_id is required' }, { status: 400 });
    if (!transaction_type) return Response.json({ error: 'transaction_type is required' }, { status: 400 });
    if (quantity === undefined || quantity === null) return Response.json({ error: 'quantity is required' }, { status: 400 });

    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) return Response.json({ error: 'quantity must be a non-negative number' }, { status: 400 });

    // ─── Idempotency check: count_session_id takes priority, then idempotency_key ───
    if (count_session_id) {
      const existing = await base44.asServiceRole.entities.InventoryTransaction.filter(
        { source_document_id: count_session_id, inventory_master_id: inventory_master_id },
        null,
        1
      );
      if (existing.length > 0) {
        const existingTxn = existing[0];
        let idemItem = null;
        try { idemItem = await base44.asServiceRole.entities.InventoryMaster.get(inventory_master_id); } catch {}
        return Response.json({
          success: true,
          idempotent: true,
          transaction_id: existingTxn.transaction_id,
          item: idemItem,
          message: 'Transaction already processed for this count session — no duplicate applied',
        });
      }
    } else if (idempotency_key) {
      const existing = await base44.asServiceRole.entities.InventoryTransaction.filter(
        { source_document_id: 'idem:' + idempotency_key },
        null,
        1
      );
      if (existing.length > 0) {
        const existingTxn = existing[0];
        let idemItem = null;
        try { idemItem = await base44.asServiceRole.entities.InventoryMaster.get(inventory_master_id); } catch {}
        return Response.json({
          success: true,
          idempotent: true,
          transaction_id: existingTxn.transaction_id,
          item: idemItem,
          message: 'Transaction already processed — no duplicate applied',
        });
      }
    }

    // ─── Load the item (snapshot before) — wrap in try/catch for not-found ───
    let item;
    try {
      item = await base44.asServiceRole.entities.InventoryMaster.get(inventory_master_id);
    } catch (lookupErr) {
      return Response.json({ error: 'Inventory item not found', inventory_master_id }, { status: 404 });
    }
    if (!item) return Response.json({ error: 'Inventory item not found', inventory_master_id }, { status: 404 });

    const before = {
      quantity_owned: item.quantity_owned || 0,
      quantity_available: item.quantity_available || 0,
      quantity_assigned: item.quantity_assigned || 0,
      quantity_reserved: item.quantity_reserved || 0,
      quantity_on_order: item.quantity_on_order || 0,
      quantity_damaged: item.quantity_damaged || 0,
      quantity_retired: item.quantity_retired || 0,
    };

    const updates = { ...before };
    let delta = 0;

    // ─── Compute updates (NO mutation yet) ───
    switch (transaction_type) {
      case 'opening_balance':
        updates.quantity_owned += qty;
        updates.quantity_available += qty;
        delta = qty;
        break;
      case 'receive':
        updates.quantity_owned += qty;
        updates.quantity_available += qty;
        if (updates.quantity_on_order > 0) {
          const reduce = Math.min(updates.quantity_on_order, qty);
          updates.quantity_on_order -= reduce;
        }
        delta = qty;
        break;
      case 'adjust': {
        const newOwned = qty;
        delta = newOwned - updates.quantity_owned;
        updates.quantity_owned = newOwned;
        updates.quantity_available += delta;
        break;
      }
      case 'assign':
        if (updates.quantity_available < qty) return Response.json({ error: 'Insufficient available quantity to assign' }, { status: 400 });
        updates.quantity_available -= qty;
        updates.quantity_assigned += qty;
        delta = -qty;
        break;
      case 'return':
        if (updates.quantity_assigned < qty) return Response.json({ error: 'Insufficient assigned quantity to return' }, { status: 400 });
        updates.quantity_assigned -= qty;
        updates.quantity_available += qty;
        delta = qty;
        break;
      case 'fulfill':
        if (updates.quantity_available < qty) return Response.json({ error: 'Insufficient available quantity to fulfill' }, { status: 400 });
        updates.quantity_owned -= qty;
        updates.quantity_available -= qty;
        delta = -qty;
        break;
      case 'reserve':
        if (updates.quantity_available < qty) return Response.json({ error: 'Insufficient available quantity to reserve' }, { status: 400 });
        updates.quantity_available -= qty;
        updates.quantity_reserved += qty;
        delta = -qty;
        break;
      case 'release_reservation':
        if (updates.quantity_reserved < qty) return Response.json({ error: 'Insufficient reserved quantity to release' }, { status: 400 });
        updates.quantity_reserved -= qty;
        updates.quantity_available += qty;
        delta = qty;
        break;
      case 'damage':
        if (updates.quantity_available < qty) return Response.json({ error: 'Insufficient available quantity to mark as damaged' }, { status: 400 });
        updates.quantity_available -= qty;
        updates.quantity_damaged += qty;
        delta = -qty;
        break;
      case 'retire':
        if (updates.quantity_owned < qty) return Response.json({ error: 'Insufficient owned quantity to retire' }, { status: 400 });
        updates.quantity_owned -= qty;
        updates.quantity_available -= qty;
        updates.quantity_retired += qty;
        delta = -qty;
        break;
      case 'transfer':
        // No quantity changes; just update location
        delta = 0;
        break;
      default:
        return Response.json({ error: 'Unknown transaction type: ' + transaction_type }, { status: 400 });
    }

    // ─── Balance check ───
    const sumAfter = updates.quantity_available + updates.quantity_assigned + updates.quantity_reserved
      + updates.quantity_on_order + updates.quantity_damaged + updates.quantity_retired;
    const isBalanced = updates.quantity_owned === sumAfter;

    // ─── Compute inventory value ───
    const hasExplicitCost = unit_cost !== undefined && unit_cost !== '' && !isNaN(Number(unit_cost));
    const effectiveUnitCost = hasExplicitCost ? Number(unit_cost) : (item.unit_cost || 0);
    const inventoryValue = Math.round((updates.quantity_owned * effectiveUnitCost) * 100) / 100;

    // ─── Auto-deactivate when no stock ───
    const isActive = updates.quantity_owned > 0 || updates.quantity_assigned > 0 || updates.quantity_reserved > 0;
    const status = isActive ? 'Active' : 'Inactive';

    // ─── Determine entity-level type, direction, and source document type ───
    let mappedType, direction, sourceDocType;

    if (transaction_type === 'adjust') {
      if (delta > 0) {
        mappedType = 'adjustment_increase';
        direction = 'inbound';
        sourceDocType = 'inventory_adjustment';
      } else if (delta < 0) {
        mappedType = 'adjustment_decrease';
        direction = 'outbound';
        sourceDocType = 'inventory_adjustment';
      } else {
        mappedType = 'physical_count';
        direction = 'neutral';
        sourceDocType = 'cycle_count';
      }
    } else {
      const mapping = TYPE_MAPPING[transaction_type];
      if (!mapping) return Response.json({ error: 'Unmapped transaction type: ' + transaction_type }, { status: 400 });
      mappedType = mapping.entityType;
      direction = mapping.direction;
      sourceDocType = mapping.sourceDoc;
    }

    // Allow caller to override source_document_type
    if (body.source_document_type) sourceDocType = body.source_document_type;

    // ─── Generate unique transaction ID (timestamp + random suffix + collision retry) ───
    let transactionId = null;
    const MAX_ID_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
      const ts = new Date();
      const dateStr = String(ts.getFullYear()) +
        String(ts.getMonth() + 1).padStart(2, '0') +
        String(ts.getDate()).padStart(2, '0') +
        String(ts.getHours()).padStart(2, '0') +
        String(ts.getMinutes()).padStart(2, '0') +
        String(ts.getSeconds()).padStart(2, '0');
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const candidate = 'ITX-' + dateStr + '-' + rand;
      // Server-side duplicate check
      const collision = await base44.asServiceRole.entities.InventoryTransaction.filter(
        { transaction_id: candidate }, null, 1
      );
      if (collision.length === 0) {
        transactionId = candidate;
        break;
      }
    }
    if (!transactionId) {
      return Response.json({ error: 'Unable to generate unique transaction ID after maximum retries' }, { status: 500 });
    }

    // ─── Build transaction record with full audit trail ───
    const nowIso = new Date().toISOString();
    const txnData = {
      transaction_id: transactionId,
      transaction_type: mappedType,
      movement_direction: direction,
      inventory_master_id: inventory_master_id,
      inventory_item_name: item.item_name,
      inventory_type: item.inventory_type,
      sku: item.sku || item.inv_id || null,
      quantity: qty,
      unit_of_measure: item.unit_of_measure || 'ea',
      unit_cost: effectiveUnitCost,
      total_cost: Math.round((qty * effectiveUnitCost) * 100) / 100,
      source_document_type: count_session_id ? 'inventory_count_session' : sourceDocType,
      source_document_id: count_session_id || purchase_order || related_request_id || (idempotency_key ? 'idem:' + idempotency_key : null),
      count_session_id: count_session_id || null,
      source_document_number: purchase_order || null,
      employee_email: related_employee || user.email || null,
      employee_name: related_employee || null,
      truck_number: related_truck || null,
      job_id: related_job || null,
      reason: reason || null,
      notes: notes || null,
      created_by: user.email || user.id,
      transaction_date: nowIso,
      posted_date: nowIso,
      status: 'completed',
      audit_reference: JSON.stringify({
        function_transaction_type: transaction_type,
        quantity_before: before,
        submitted_absolute_quantity: qty,
        calculated_delta: delta,
        quantity_after: updates,
        available_before: before.quantity_available,
        available_after: updates.quantity_available,
        performed_by: user.email || user.id,
        performed_at: nowIso,
        source: 'processInventoryMasterTransaction',
      }),
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION INTEGRITY: Create audit record FIRST, then update inventory.
    // If audit creation fails → inventory is NEVER touched (no partial state).
    // If inventory update fails → delete the audit record (compensating rollback).
    // Base44 does not support cross-entity atomic transactions, so this
    // compensating-rollback design ensures partial completion cannot remain.
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── Step 1: Create the transaction audit record ───
    let createdTxn;
    try {
      createdTxn = await base44.asServiceRole.entities.InventoryTransaction.create(txnData);
    } catch (txnError) {
      return Response.json({
        error: 'Audit record creation failed — inventory unchanged',
        details: txnError.message,
      }, { status: 500 });
    }

    // ─── Step 2: Update the InventoryMaster item ───
    const updateData = {
      ...updates,
      inventory_value: inventoryValue,
      is_balanced: isBalanced,
      is_active: isActive,
      status: status,
      vendor: vendor || item.vendor,
      warehouse_location: destination_location || item.warehouse_location,
    };
    if (hasExplicitCost) {
      updateData.unit_cost = effectiveUnitCost;
    }

    let updatedItem;
    try {
      updatedItem = await base44.asServiceRole.entities.InventoryMaster.update(inventory_master_id, updateData);
    } catch (invError) {
      // ─── Compensating rollback: delete the audit record ───
      try {
        await base44.asServiceRole.entities.InventoryTransaction.delete(createdTxn.id);
      } catch (rollbackErr) {
        // Best-effort rollback — log the orphaned transaction ID for manual cleanup
        console.error('ROLLBACK FAILED: orphaned transaction ' + transactionId + ' — ' + rollbackErr.message);
      }
      return Response.json({
        error: 'Inventory update failed — audit record rolled back',
        details: invError.message,
        transaction_id: transactionId,
        rolled_back: true,
      }, { status: 500 });
    }

    // ─── Both succeeded → return success ───
    console.log(`[BYPASS AUDIT] SUCCESS user=${user.email} role=${roleKey} action=inventory_txn type=${transaction_type} item=${inventory_master_id} txn_id=${transactionId} qty_before=${before.quantity_owned} qty_after=${updates.quantity_owned} delta=${delta}`);
    return Response.json({
      success: true,
      transaction_id: transactionId,
      item: updatedItem,
      quantity_before: before,
      submitted_quantity: qty,
      calculated_delta: delta,
      quantity_after: updates,
      available_before: before.quantity_available,
      available_after: updates.quantity_available,
      movement_direction: direction,
      source_document_type: sourceDocType,
      is_balanced: isBalanced,
      inventory_value: inventoryValue,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});