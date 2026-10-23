import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allowedRoles = ['admin', 'owner', 'Director of Operations', 'Operations Manager'];
    if (!allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Forbidden — only admins and operations managers can simulate events' }, { status: 403 });
    }

    const body = await req.json();
    const { event_type, payload, is_replay } = body;

    if (!event_type || !payload) {
      return Response.json({ error: 'event_type and payload are required' }, { status: 400 });
    }

    let parsedPayload;
    try {
      parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const externalId = String(
      parsedPayload.id || parsedPayload.external_id || parsedPayload.transfer_sheet_number ||
      parsedPayload.job_number || parsedPayload.po_number || parsedPayload.inventory_event_id ||
      `SIM-${Date.now()}`
    );

    const eventCount = await base44.asServiceRole.entities.IntegrationEvent.list('-created_date', 1);
    const seqNum = String(eventCount.length + 1).padStart(6, '0');
    const eventId = `EVT-${seqNum}`;

    const event = await base44.asServiceRole.entities.IntegrationEvent.create({
      event_id: eventId,
      source_system: 'ServiceTitan (Simulated)',
      event_type: event_type,
      external_id: externalId,
      received_at: new Date().toISOString(),
      status: 'Processing',
      raw_payload: JSON.stringify(parsedPayload),
      parsed_summary: '',
      retry_count: 0,
    });

    try {
      const result = await routeEvent(base44, event_type, parsedPayload);

      await base44.asServiceRole.entities.IntegrationEvent.update(event.id, {
        status: 'Processed',
        processed_at: new Date().toISOString(),
        parsed_summary: result.summary,
        related_truck_id: result.matching_records?.truck_id || '',
        related_job_id: result.matching_records?.job_id || '',
        related_transfer_sheet_id: result.matching_records?.transfer_sheet_id || '',
        related_po_id: result.matching_records?.po_id || '',
        related_technician_id: result.matching_records?.technician_id || '',
      });

      return Response.json({
        event_id: eventId,
        status: 'Processed',
        parsed_data: result.parsed_data,
        matching_records: result.matching_records,
        created_or_updated: result.created_or_updated,
        triggered_workflows: result.workflows,
        updated_dashboards: result.dashboards,
        notifications: result.notifications,
        summary: result.summary,
        is_replay: is_replay || false,
      });
    } catch (processError) {
      await base44.asServiceRole.entities.IntegrationEvent.update(event.id, {
        status: 'Failed',
        error_message: processError.message,
        processed_at: new Date().toISOString(),
      });
      return Response.json({
        event_id: eventId,
        status: 'Failed',
        error: processError.message,
        triggered_workflows: [],
        updated_dashboards: [],
        notifications: [],
      }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

const EVENT_IMPACTS = {
  transfer_sheet_created: {
    workflows: ['WF-WH-103 — Transfer Sheet Receipt Workflow'],
    dashboards: ['Warehouse Morning Queue', 'Operations Center', 'Fleet Truck Readiness', 'Morning Brief'],
    notifications: ['Transfer sheet added to warehouse morning queue — technician receipt required'],
  },
  transfer_sheet_updated: {
    workflows: ['WF-WH-103 — Transfer Sheet Receipt Workflow'],
    dashboards: ['Warehouse Morning Queue', 'Operations Center'],
    notifications: ['Transfer sheet updated — sync propagated to linked truck profile'],
  },
  job_scheduled: {
    workflows: [],
    dashboards: ['Operations Center', 'Morning Brief', 'Technician Dashboard'],
    notifications: ['New job scheduled — assigned to technician and truck'],
  },
  appointment_assigned: {
    workflows: ['WF-WH-001 — Morning Material Request'],
    dashboards: ['Operations Center', 'Morning Brief', 'Warehouse Morning Dashboard'],
    notifications: ['Appointment assigned — material request may be needed for this job'],
  },
  estimate_approved: {
    workflows: [],
    dashboards: ['Operations Center', 'Admin Estimates'],
    notifications: ['Estimate approved — job ready to be scheduled'],
  },
  purchase_order_created: {
    workflows: [],
    dashboards: ['Operations Center', 'Inventory Sync'],
    notifications: ['Purchase order created — awaiting vendor fulfillment'],
  },
  purchase_order_received: {
    workflows: [],
    dashboards: ['Operations Center', 'Inventory Sync', 'Warehouse Morning Dashboard'],
    notifications: ['Purchase order received — inventory levels updated'],
  },
  invoice_completed: {
    workflows: [],
    dashboards: ['Operations Center', 'Admin Invoices'],
    notifications: ['Invoice completed — payment processing initiated'],
  },
  inventory_transfer: {
    workflows: ['WF-WH-102 — Consumable Truck Replenishment'],
    dashboards: ['Inventory Sync', 'Fleet Truck Readiness', 'Warehouse Morning Dashboard'],
    notifications: ['Inventory transfer recorded — truck stock levels updated'],
  },
};

function getImpacts(eventType) {
  return EVENT_IMPACTS[eventType] || {
    workflows: [],
    dashboards: ['Operations Center'],
    notifications: [`Event received: ${eventType}`],
  };
}

async function routeEvent(base44, eventType, payload) {
  const impacts = getImpacts(eventType);
  let parsedData = {};
  let matchingRecords = {};
  let createdOrUpdated = null;

  switch (eventType) {
    case 'transfer_sheet_created':
    case 'transfer_sheet_updated': {
      const r = await handleTransferSheet(base44, payload);
      parsedData = r.parsed_data; matchingRecords = r.matching_records; createdOrUpdated = r.created_or_updated;
      break;
    }
    case 'job_scheduled': {
      const r = await handleJob(base44, payload);
      parsedData = r.parsed_data; matchingRecords = r.matching_records; createdOrUpdated = r.created_or_updated;
      break;
    }
    case 'purchase_order_created':
    case 'purchase_order_received': {
      const r = await handlePurchaseOrder(base44, payload);
      parsedData = r.parsed_data; matchingRecords = r.matching_records; createdOrUpdated = r.created_or_updated;
      break;
    }
    case 'inventory_transfer': {
      const r = await handleInventoryEvent(base44, payload);
      parsedData = r.parsed_data; matchingRecords = r.matching_records; createdOrUpdated = r.created_or_updated;
      break;
    }
    default:
      parsedData = { message: 'No entity sync configured for this event type yet', raw_payload_keys: Object.keys(payload) };
      break;
  }

  const summary = createdOrUpdated
    ? `${createdOrUpdated.action === 'created' ? 'Created' : 'Updated'} ${createdOrUpdated.entity}: ${createdOrUpdated.identifier}`
    : `Event received: ${eventType}`;

  return {
    parsed_data: parsedData,
    matching_records: matchingRecords,
    created_or_updated: createdOrUpdated,
    workflows: impacts.workflows,
    dashboards: impacts.dashboards,
    notifications: impacts.notifications,
    summary,
  };
}

async function handleTransferSheet(base44, payload) {
  const stId = String(payload.id || payload.transfer_sheet_id || payload.st_transfer_sheet_id);
  const sheetNumber = payload.transfer_sheet_number || stId;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const materialsCount = items.length;
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalCost = items.reduce((s, i) => s + (Number(i.cost) || Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  const existing = await base44.asServiceRole.entities.ServiceTitanTransferSheet.filter({ st_transfer_sheet_id: stId });

  const data = {
    st_transfer_sheet_id: stId,
    transfer_sheet_number: sheetNumber,
    job_number: payload.job_number || '',
    customer_name: payload.customer_name || '',
    location: payload.location || '',
    truck: payload.truck || '',
    technician: payload.technician || '',
    status: payload.status || 'Open',
    materials_count: materialsCount,
    total_quantity: totalQty,
    total_cost: totalCost,
    items: JSON.stringify(items),
    waiting_for_truck_receipt: payload.status === 'Waiting for Truck Receipt' || false,
    st_url: payload.st_url || '',
    last_synced_at: new Date().toISOString(),
  };

  let record; let action;
  if (existing.length > 0) {
    record = await base44.asServiceRole.entities.ServiceTitanTransferSheet.update(existing[0].id, data);
    action = 'updated';
  } else {
    record = await base44.asServiceRole.entities.ServiceTitanTransferSheet.create(data);
    action = 'created';
  }

  let truckMatch = null;
  if (payload.truck) {
    const trucks = await base44.asServiceRole.entities.TruckProfile.filter({ truck_number: String(payload.truck) });
    if (trucks.length > 0) truckMatch = { truck_id: trucks[0].truck_id, truck_number: trucks[0].truck_number, matched: true };
  }

  return {
    parsed_data: {
      transfer_sheet_number: sheetNumber,
      job_number: payload.job_number,
      customer_name: payload.customer_name,
      truck: payload.truck,
      technician: payload.technician,
      status: payload.status,
      materials_count: materialsCount,
      total_quantity: totalQty,
      total_cost: totalCost,
      items: items.map(i => ({ name: i.name, quantity: i.quantity, cost: i.cost || i.price })),
    },
    matching_records: {
      truck_id: truckMatch?.truck_id || '',
      truck_matched: truckMatch?.matched || false,
      truck_number: truckMatch?.truck_number || '',
      job_id: payload.job_number || '',
      transfer_sheet_id: record.id,
    },
    created_or_updated: { entity: 'ServiceTitanTransferSheet', id: record.id, identifier: `TS ${sheetNumber}`, action },
  };
}

async function handleJob(base44, payload) {
  const stId = String(payload.id || payload.job_id || payload.st_job_id);
  const jobNumber = payload.job_number || stId;
  const existing = await base44.asServiceRole.entities.ServiceTitanJob.filter({ st_job_id: stId });

  const data = {
    st_job_id: stId,
    job_number: jobNumber,
    customer_name: payload.customer_name || '',
    location: payload.location || '',
    business_unit: payload.business_unit || '',
    job_type: payload.job_type || '',
    appointment_date: payload.appointment_date || '',
    appointment_time: payload.appointment_time || '',
    assigned_technician: payload.assigned_technician || '',
    assigned_truck: payload.assigned_truck || '',
    job_status: payload.job_status || payload.status || '',
    estimate_status: payload.estimate_status || '',
    invoice_status: payload.invoice_status || '',
    st_url: payload.st_url || '',
    last_synced_at: new Date().toISOString(),
  };

  let record; let action;
  if (existing.length > 0) {
    record = await base44.asServiceRole.entities.ServiceTitanJob.update(existing[0].id, data);
    action = 'updated';
  } else {
    record = await base44.asServiceRole.entities.ServiceTitanJob.create(data);
    action = 'created';
  }

  let truckMatch = null;
  if (payload.assigned_truck) {
    const trucks = await base44.asServiceRole.entities.TruckProfile.filter({ truck_number: String(payload.assigned_truck) });
    if (trucks.length > 0) truckMatch = { truck_id: trucks[0].truck_id, truck_number: trucks[0].truck_number, matched: true };
  }

  return {
    parsed_data: {
      job_number: jobNumber,
      customer_name: payload.customer_name,
      location: payload.location,
      business_unit: payload.business_unit,
      job_type: payload.job_type,
      appointment_date: payload.appointment_date,
      appointment_time: payload.appointment_time,
      assigned_technician: payload.assigned_technician,
      assigned_truck: payload.assigned_truck,
      job_status: payload.job_status || payload.status,
    },
    matching_records: {
      truck_id: truckMatch?.truck_id || '',
      truck_matched: truckMatch?.matched || false,
      truck_number: truckMatch?.truck_number || '',
      job_id: record.id,
    },
    created_or_updated: { entity: 'ServiceTitanJob', id: record.id, identifier: `Job ${jobNumber}`, action },
  };
}

async function handlePurchaseOrder(base44, payload) {
  const stId = String(payload.id || payload.po_id || payload.st_po_id);
  const poNumber = payload.po_number || stId;
  const existing = await base44.asServiceRole.entities.ServiceTitanPurchaseOrder.filter({ st_po_id: stId });
  const items = Array.isArray(payload.items) ? payload.items : [];

  const data = {
    st_po_id: stId,
    po_number: poNumber,
    vendor: payload.vendor || '',
    job_number: payload.job_number || '',
    status: payload.status || 'Open',
    expected_delivery_date: payload.expected_delivery_date || '',
    received_date: payload.received_date || '',
    items: JSON.stringify(items),
    related_truck: payload.related_truck || '',
    related_job: payload.related_job || payload.job_number || '',
    last_synced_at: new Date().toISOString(),
  };

  let record; let action;
  if (existing.length > 0) {
    record = await base44.asServiceRole.entities.ServiceTitanPurchaseOrder.update(existing[0].id, data);
    action = 'updated';
  } else {
    record = await base44.asServiceRole.entities.ServiceTitanPurchaseOrder.create(data);
    action = 'created';
  }

  let truckMatch = null;
  if (payload.related_truck) {
    const trucks = await base44.asServiceRole.entities.TruckProfile.filter({ truck_number: String(payload.related_truck) });
    if (trucks.length > 0) truckMatch = { truck_id: trucks[0].truck_id, truck_number: trucks[0].truck_number, matched: true };
  }

  return {
    parsed_data: {
      po_number: poNumber,
      vendor: payload.vendor,
      job_number: payload.job_number,
      status: payload.status,
      expected_delivery_date: payload.expected_delivery_date,
      received_date: payload.received_date,
      item_count: items.length,
    },
    matching_records: {
      truck_id: truckMatch?.truck_id || '',
      truck_matched: truckMatch?.matched || false,
      truck_number: truckMatch?.truck_number || '',
      po_id: record.id,
    },
    created_or_updated: { entity: 'ServiceTitanPurchaseOrder', id: record.id, identifier: `PO ${poNumber}`, action },
  };
}

async function handleInventoryEvent(base44, payload) {
  const stId = String(payload.id || payload.inventory_event_id || payload.st_inventory_event_id);
  const existing = await base44.asServiceRole.entities.ServiceTitanInventoryEvent.filter({ st_inventory_event_id: stId });

  const data = {
    st_inventory_event_id: stId,
    item_name: payload.item_name || '',
    sku: payload.sku || '',
    quantity: Number(payload.quantity) || 0,
    source_location: payload.source_location || '',
    destination_location: payload.destination_location || '',
    truck: payload.truck || '',
    job_number: payload.job_number || '',
    event_type: payload.event_type_detail || payload.event_type || 'transfer',
    event_date: new Date().toISOString(),
    raw_payload: JSON.stringify(payload),
    last_synced_at: new Date().toISOString(),
  };

  let record; let action;
  if (existing.length > 0) {
    record = await base44.asServiceRole.entities.ServiceTitanInventoryEvent.update(existing[0].id, data);
    action = 'updated';
  } else {
    record = await base44.asServiceRole.entities.ServiceTitanInventoryEvent.create(data);
    action = 'created';
  }

  let truckMatch = null;
  if (payload.truck) {
    const trucks = await base44.asServiceRole.entities.TruckProfile.filter({ truck_number: String(payload.truck) });
    if (trucks.length > 0) truckMatch = { truck_id: trucks[0].truck_id, truck_number: trucks[0].truck_number, matched: true };
  }

  return {
    parsed_data: {
      item_name: payload.item_name,
      sku: payload.sku,
      quantity: payload.quantity,
      source_location: payload.source_location,
      destination_location: payload.destination_location,
      truck: payload.truck,
      job_number: payload.job_number,
    },
    matching_records: {
      truck_id: truckMatch?.truck_id || '',
      truck_matched: truckMatch?.matched || false,
      truck_number: truckMatch?.truck_number || '',
    },
    created_or_updated: { entity: 'ServiceTitanInventoryEvent', id: record.id, identifier: payload.item_name || stId, action },
  };
}