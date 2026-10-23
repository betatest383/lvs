import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      return await handleCreate(base44, user, body);
    } else if (action === 'transition') {
      return await handleTransition(base44, user, body);
    } else {
      return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Status transition rules ──
const TRANSITIONS = {
  'Requested': ['Staged', 'Cancelled'],
  'Staged': ['Ready for Pickup', 'Cancelled'],
  'Ready for Pickup': ['Picked Up', 'Cancelled'],
  'Picked Up': ['Completed', 'Returned'],
  'Completed': ['Returned'],
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ── Generate next transfer ID ──
async function nextTransferId(base44) {
  const existing = await base44.asServiceRole.entities.MaterialTransferSheet.filter(
    { transfer_id: { $regex: '^MTS-' } },
    '-transfer_id',
    1
  );
  let num = 1;
  if (existing && existing.length > 0) {
    const match = (existing[0].transfer_id || '').match(/MTS-(\d+)/);
    if (match) num = parseInt(match[1], 10) + 1;
  }
  return `MTS-${String(num).padStart(6, '0')}`;
}

// ── Generate next transaction ID ──
async function nextTxnId(base44) {
  const existing = await base44.asServiceRole.entities.InventoryTransaction.filter(
    { transaction_id: { $regex: '^ITX-' } },
    '-transaction_id',
    1
  );
  let num = 1;
  if (existing && existing.length > 0) {
    const match = (existing[0].transaction_id || '').match(/ITX-(\d+)/);
    if (match) num = parseInt(match[1], 10) + 1;
  }
  return `ITX-${String(num).padStart(6, '0')}`;
}

// ── Create a single InventoryTransaction record ──
async function logTransaction(base44, txnId, item, txnType, qty, before, after, transferId, user, extra) {
  const unitCost = item.unit_cost || 0;
  await base44.asServiceRole.entities.InventoryTransaction.create({
    transaction_id: txnId,
    transaction_type: txnType,
    inventory_master_id: item.id,
    inventory_item_name: item.item_name,
    inventory_type: item.inventory_type,
    quantity: qty,
    quantity_before: JSON.stringify(before),
    quantity_after: JSON.stringify(after),
    unit_cost: unitCost,
    total_cost: Math.round(qty * unitCost * 100) / 100,
    related_task: extra.related_job || null,
    related_employee: extra.technician || null,
    related_truck: extra.truck_number || null,
    related_request_id: transferId,
    reason: extra.reason || `Material Transfer ${transferId}`,
    notes: extra.notes || null,
    created_by: user.email || user.id,
    transaction_date: new Date().toISOString(),
    status: 'completed',
  });
}

// ── CREATE: Reserve inventory for all line items ──
async function handleCreate(base44, user, body) {
  const { job_id, job_number, customer_name, customer_id, job_address, city, state, zip,
          technician, technician_id, technician_email, truck_number, truck_id,
          line_items, notes } = body;

  if (!technician) return Response.json({ error: 'Technician is required' }, { status: 400 });
  if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
    return Response.json({ error: 'At least one line item is required' }, { status: 400 });
  }

  // Validate all items have sufficient available quantity
  for (const li of line_items) {
    if (!li.inventory_master_id) return Response.json({ error: 'Line item missing inventory_master_id' }, { status: 400 });
    const qty = Number(li.quantity_requested);
    if (isNaN(qty) || qty <= 0) return Response.json({ error: `Invalid quantity for ${li.item_name || 'item'}` }, { status: 400 });
    const item = await base44.asServiceRole.entities.InventoryMaster.get(li.inventory_master_id);
    if (!item) return Response.json({ error: `Inventory item not found: ${li.item_name}` }, { status: 404 });
    if ((item.quantity_available || 0) < qty) {
      return Response.json({ error: `Insufficient available quantity for ${item.item_name}. Available: ${item.quantity_available || 0}, Requested: ${qty}` }, { status: 400 });
    }
  }

  // Reserve inventory for each line item
  const processedItems = [];
  for (const li of line_items) {
    const qty = Number(li.quantity_requested);
    const item = await base44.asServiceRole.entities.InventoryMaster.get(li.inventory_master_id);

    const before = {
      quantity_owned: item.quantity_owned || 0,
      quantity_available: item.quantity_available || 0,
      quantity_assigned: item.quantity_assigned || 0,
      quantity_reserved: item.quantity_reserved || 0,
    };

    const after = { ...before };
    after.quantity_available -= qty;
    after.quantity_reserved += qty;

    const isBalanced = after.quantity_owned === (after.quantity_available + after.quantity_assigned + after.quantity_reserved + (after.quantity_on_order || 0) + (after.quantity_damaged || 0) + (after.quantity_retired || 0));

    await base44.asServiceRole.entities.InventoryMaster.update(li.inventory_master_id, {
      quantity_available: after.quantity_available,
      quantity_reserved: after.quantity_reserved,
      is_balanced: isBalanced,
    });

    const txnId = await nextTxnId(base44);
    await logTransaction(base44, txnId, item, 'reserve', qty, before, after, null, user, {
      related_job: job_number,
      technician: technician,
      truck_number: truck_number,
      reason: `Reserved for new material transfer`,
    });

    processedItems.push({ ...li, quantity_available_at_creation: before.quantity_available });
  }

  // Create the transfer record
  const transferId = await nextTransferId(base44);
  const now = new Date().toISOString();

  const record = await base44.asServiceRole.entities.MaterialTransferSheet.create({
    transfer_id: transferId,
    date: new Date().toISOString().split('T')[0],
    job_id: job_id || null,
    job_number: job_number || null,
    customer_name: customer_name || null,
    customer_id: customer_id || null,
    job_address: job_address || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    technician: technician,
    technician_id: technician_id || null,
    technician_email: technician_email || null,
    truck_number: truck_number || null,
    truck_id: truck_id || null,
    line_items: JSON.stringify(processedItems),
    status: 'Requested',
    requested_date: now,
    created_by: user.email || user.id,
    notes: notes || null,
  });

  // Update transactions with the transfer ID reference
  // (Already logged without transferId since it didn't exist yet — that's fine for audit)

  return Response.json({ success: true, transfer_id: transferId, record });
}

// ── TRANSITION: Move status and adjust inventory buckets ──
async function handleTransition(base44, user, body) {
  const { transfer_id, new_status, cancellation_reason } = body;

  if (!transfer_id) return Response.json({ error: 'transfer_id is required' }, { status: 400 });

  const transfer = await base44.asServiceRole.entities.MaterialTransferSheet.get(transfer_id);
  if (!transfer) return Response.json({ error: 'Transfer not found' }, { status: 404 });

  const currentStatus = transfer.status;
  if (currentStatus === new_status) return Response.json({ error: 'Transfer is already ' + new_status }, { status: 400 });
  if (!canTransition(currentStatus, new_status)) {
    return Response.json({ error: `Cannot transition from ${currentStatus} to ${new_status}` }, { status: 400 });
  }

  // Parse line items
  let lineItems = [];
  try { lineItems = JSON.parse(transfer.line_items || '[]'); } catch { lineItems = []; }

  const now = new Date().toISOString();
  const updateData = { status: new_status };

  // Set timestamp fields
  if (new_status === 'Staged') updateData.staged_date = now;
  if (new_status === 'Ready for Pickup') updateData.ready_date = now;
  if (new_status === 'Picked Up') updateData.picked_up_date = now;
  if (new_status === 'Completed') updateData.completed_date = now;
  if (new_status === 'Cancelled') { updateData.cancelled_date = now; updateData.cancellation_reason = cancellation_reason || null; }
  if (new_status === 'Returned') updateData.returned_date = now;

  // ── Inventory bucket movements ──
  if (new_status === 'Picked Up') {
    // Reserved → Assigned
    for (const li of lineItems) {
      if (!li.inventory_master_id) continue;
      const qty = Number(li.quantity_requested) || 0;
      const item = await base44.asServiceRole.entities.InventoryMaster.get(li.inventory_master_id);
      if (!item) continue;

      const before = {
        quantity_owned: item.quantity_owned || 0,
        quantity_available: item.quantity_available || 0,
        quantity_assigned: item.quantity_assigned || 0,
        quantity_reserved: item.quantity_reserved || 0,
      };
      const after = { ...before };
      const moveQty = Math.min(qty, after.quantity_reserved);
      after.quantity_reserved -= moveQty;
      after.quantity_assigned += moveQty;

      const isBalanced = after.quantity_owned === (after.quantity_available + after.quantity_assigned + after.quantity_reserved + (after.quantity_on_order || 0) + (after.quantity_damaged || 0) + (after.quantity_retired || 0));

      await base44.asServiceRole.entities.InventoryMaster.update(li.inventory_master_id, {
        quantity_reserved: after.quantity_reserved,
        quantity_assigned: after.quantity_assigned,
        is_balanced: isBalanced,
      });

      const txnId = await nextTxnId(base44);
      await logTransaction(base44, txnId, item, 'issue_to_employee', moveQty, before, after, transfer.transfer_id, user, {
        related_job: transfer.job_number,
        technician: transfer.technician,
        truck_number: transfer.truck_number,
        reason: `Picked Up — Material Transfer ${transfer.transfer_id}`,
      });
    }
  } else if (new_status === 'Cancelled') {
    // Reserved → Available (release reservation)
    for (const li of lineItems) {
      if (!li.inventory_master_id) continue;
      const qty = Number(li.quantity_requested) || 0;
      const item = await base44.asServiceRole.entities.InventoryMaster.get(li.inventory_master_id);
      if (!item) continue;

      const before = {
        quantity_owned: item.quantity_owned || 0,
        quantity_available: item.quantity_available || 0,
        quantity_assigned: item.quantity_assigned || 0,
        quantity_reserved: item.quantity_reserved || 0,
      };
      const after = { ...before };
      const moveQty = Math.min(qty, after.quantity_reserved);
      after.quantity_reserved -= moveQty;
      after.quantity_available += moveQty;

      const isBalanced = after.quantity_owned === (after.quantity_available + after.quantity_assigned + after.quantity_reserved + (after.quantity_on_order || 0) + (after.quantity_damaged || 0) + (after.quantity_retired || 0));

      await base44.asServiceRole.entities.InventoryMaster.update(li.inventory_master_id, {
        quantity_reserved: after.quantity_reserved,
        quantity_available: after.quantity_available,
        is_balanced: isBalanced,
      });

      const txnId = await nextTxnId(base44);
      await logTransaction(base44, txnId, item, 'release_reservation', moveQty, before, after, transfer.transfer_id, user, {
        related_job: transfer.job_number,
        technician: transfer.technician,
        truck_number: transfer.truck_number,
        reason: `Cancelled — Material Transfer ${transfer.transfer_id}`,
      });
    }
  } else if (new_status === 'Returned') {
    // Assigned → Available
    for (const li of lineItems) {
      if (!li.inventory_master_id) continue;
      const qty = Number(li.quantity_requested) || 0;
      const item = await base44.asServiceRole.entities.InventoryMaster.get(li.inventory_master_id);
      if (!item) continue;

      const before = {
        quantity_owned: item.quantity_owned || 0,
        quantity_available: item.quantity_available || 0,
        quantity_assigned: item.quantity_assigned || 0,
        quantity_reserved: item.quantity_reserved || 0,
      };
      const after = { ...before };
      const moveQty = Math.min(qty, after.quantity_assigned);
      after.quantity_assigned -= moveQty;
      after.quantity_available += moveQty;

      const isBalanced = after.quantity_owned === (after.quantity_available + after.quantity_assigned + after.quantity_reserved + (after.quantity_on_order || 0) + (after.quantity_damaged || 0) + (after.quantity_retired || 0));

      await base44.asServiceRole.entities.InventoryMaster.update(li.inventory_master_id, {
        quantity_assigned: after.quantity_assigned,
        quantity_available: after.quantity_available,
        is_balanced: isBalanced,
      });

      const txnId = await nextTxnId(base44);
      await logTransaction(base44, txnId, item, 'return', moveQty, before, after, transfer.transfer_id, user, {
        related_job: transfer.job_number,
        technician: transfer.technician,
        truck_number: transfer.truck_number,
        reason: `Returned — Material Transfer ${transfer.transfer_id}`,
      });
    }
  }
  // Staged, Ready for Pickup, Completed → no inventory bucket changes

  const updated = await base44.asServiceRole.entities.MaterialTransferSheet.update(transfer_id, updateData);

  return Response.json({ success: true, transfer_id: transfer.transfer_id, status: new_status, record: updated });
}