/**
 * Shared audit utilities for Inventory Timeline and Replay State.
 * Handles service-account masking, performed-by resolution, reason enrichment,
 * relative time, date bucketing, and quantity change diffs.
 */
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';

const QTY_KEYS = [
  'quantity_owned', 'quantity_available', 'quantity_reserved', 'quantity_assigned',
  'quantity_on_order', 'quantity_damaged', 'quantity_retired',
];

/** Detect Base44 service accounts / no-reply emails that should never be shown to warehouse users. */
export function isSystemAccount(identifier) {
  if (!identifier) return false;
  const lower = String(identifier).toLowerCase();
  return lower.includes('no-reply') || lower.includes('noreply') ||
    lower.startsWith('service+') || lower.includes('servicerole') ||
    lower.includes('@base44.com') || lower === 'system' || lower === 'automation';
}

/** Derive a human-readable trigger source label for automated transactions. */
function deriveTriggerSource(txn) {
  const refId = txn.related_request_id || txn.audit_reference;
  if (refId) {
    if (/^MTS/i.test(refId)) return 'Material Transfer Created';
    if (/^CR-/i.test(refId)) return 'Consumable Request Fulfilled';
    if (/^ONB/i.test(refId)) return 'Onboarding Workflow';
    if (/^WF-/i.test(refId)) return 'Workflow Automation';
    if (/^EQ-/i.test(refId)) return 'Equipment Assignment';
  }
  const TYPE_TRIGGERS = {
    receive: txn.purchase_order ? 'Purchase Order Received' : 'Inventory Received',
    receive_purchase: 'Purchase Order Received',
    consumable_receive: 'Consumable Received',
    reserve: 'Material Transfer Created',
    release_reservation: 'Reservation Released',
    assign: 'Equipment Assignment',
    issue_to_employee: 'Equipment Issued',
    return: 'Equipment Returned',
    return_from_employee: 'Equipment Returned',
    consumable_return: 'Consumable Returned',
    fulfill: 'Consumable Request Fulfilled',
    consumable_fulfill: 'Consumable Request Fulfilled',
    transfer: 'Material Transfer',
    transfer_between_employees: 'Employee Transfer',
    transfer_between_trucks: 'Truck Transfer',
    transfer_between_warehouses: 'Warehouse Transfer',
    truck_restock: 'Truck Restock',
    truck_return: 'Truck Return',
    adjust: 'Inventory Adjustment',
    adjust_inventory: 'Inventory Adjustment',
    consumable_adjust: 'Consumable Adjustment',
    damage: 'Damage Reported',
    damaged: 'Damage Reported',
    lost: 'Item Lost',
    retire: 'Item Retired',
    retire_item: 'Item Retired',
    consumable_retire: 'Consumable Retired',
    repair: 'Sent for Repair',
    returned_from_repair: 'Returned from Repair',
    warranty_replacement: 'Warranty Replacement',
    vendor_return: 'Vendor Return',
    physical_count: 'Physical Count',
    cost_updated: 'Cost Updated',
    vendor_changed: 'Vendor Changed',
    warehouse_changed: 'Warehouse Changed',
    bin_changed: 'Bin Changed',
  };
  return TYPE_TRIGGERS[txn.transaction_type] || 'System Automation';
}

/**
 * Resolve the "Performed By" display for a transaction.
 * Hides service accounts; shows employee name + role + department, or "System Automation" + trigger.
 */
export function resolvePerformedBy(txn, employeeMap = {}) {
  const raw = txn.created_by || txn.approved_by;

  if (!raw || isSystemAccount(raw)) {
    return {
      display: 'System Automation',
      subtitle: deriveTriggerSource(txn),
      isAutomated: true,
      rawValue: raw || '',
      role: null,
      department: null,
      employeeId: null,
    };
  }

  // Try exact match in employee map
  let emp = employeeMap[raw.toLowerCase()];

  // Try matching as email
  if (!emp && raw.includes('@')) {
    emp = Object.values(employeeMap).find(e =>
      (e.email && e.email.toLowerCase() === raw.toLowerCase()) ||
      (e.login_email && e.login_email.toLowerCase() === raw.toLowerCase())
    );
  }

  if (emp) {
    const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim() || emp.preferred_name || raw;
    return {
      display: fullName,
      subtitle: [emp.primary_role, emp.department].filter(Boolean).join(' · ') || 'Employee',
      role: emp.primary_role,
      department: emp.department,
      isAutomated: false,
      rawValue: raw,
      employeeId: emp.employee_id,
    };
  }

  // If it looks like an email but not a service account, extract name
  if (raw.includes('@')) {
    const namePart = raw.split('@')[0]
      .split(/[._+-]/)
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      display: namePart || raw,
      subtitle: 'Employee',
      isAutomated: false,
      rawValue: raw,
    };
  }

  return { display: raw, subtitle: null, isAutomated: false, rawValue: raw };
}

/** Format a relative time string like "5 minutes ago". */
export function formatRelativeTime(date) {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
}

/** Get the date bucket key for an event date. */
export function getDateBucket(date) {
  if (!date) return 'older';
  const d = new Date(date);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  if (isThisWeek(d, { weekStartsOn: 1 })) return 'earlier_this_week';
  if (isThisMonth(d)) return 'earlier_this_month';
  return 'older';
}

export const DATE_BUCKETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier_this_week', label: 'Earlier This Week' },
  { key: 'earlier_this_month', label: 'Earlier This Month' },
  { key: 'older', label: 'Older' },
];

/** Group timeline events by date bucket, returning ordered groups with events. */
export function groupEventsByDateBucket(events) {
  const groups = {};
  for (const event of events) {
    const bucket = getDateBucket(event.date);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(event);
  }
  return DATE_BUCKETS
    .filter(b => groups[b.key])
    .map(b => ({ ...b, events: groups[b.key] }));
}

/** Return only the quantity fields that changed between before and after snapshots. */
export function getQtyChangeDiff(before, after) {
  if (!before || !after) return [];
  const changes = [];
  for (const key of QTY_KEYS) {
    const b = before[key] ?? 0;
    const a = after[key] ?? 0;
    if (b !== a) {
      changes.push({ key, before: b, after: a, delta: a - b });
    }
  }
  return changes;
}

/** Human-readable label for a quantity bucket key. */
export function formatQtyKey(key) {
  const labels = {
    quantity_owned: 'Owned',
    quantity_available: 'Available',
    quantity_reserved: 'Reserved',
    quantity_assigned: 'Assigned',
    quantity_on_order: 'On Order',
    quantity_damaged: 'Damaged',
    quantity_retired: 'Retired',
  };
  return labels[key] || key.replace('quantity_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Build a rich, structured reason context from the transaction's related records.
 * Returns an array of lines — first line is the base reason, subsequent lines add context.
 */
export function buildReasonContext(txn) {
  const lines = [];

  if (txn.reason) {
    lines.push(txn.reason);
  }

  if (txn.related_request_id && !lines.some(l => l.includes(txn.related_request_id))) {
    lines.push(`Material Transfer ${txn.related_request_id}`);
  }
  if (txn.related_job && !lines.some(l => l.includes(txn.related_job))) {
    lines.push(`Job ${txn.related_job}`);
  }
  if (txn.related_task && txn.related_task !== txn.related_job && !lines.some(l => l.includes(txn.related_task))) {
    lines.push(`Work Order ${txn.related_task}`);
  }

  const empName = txn.related_employee || txn.employee;
  if (empName && !lines.some(l => l.includes(empName))) {
    lines.push(`Technician ${empName}`);
  }

  const truckName = txn.related_truck || txn.truck;
  if (truckName && !lines.some(l => l.includes(truckName))) {
    lines.push(`Truck ${truckName}`);
  }

  if (txn.quantity != null && txn.quantity !== 0) {
    const qtyLabels = {
      reserve: `Reserved Qty ${txn.quantity}`,
      release_reservation: `Released Qty ${txn.quantity}`,
      receive: `Received Qty ${txn.quantity}`,
      receive_purchase: `Received Qty ${txn.quantity}`,
      assign: `Assigned Qty ${txn.quantity}`,
      issue_to_employee: `Issued Qty ${txn.quantity}`,
      return: `Returned Qty ${txn.quantity}`,
      return_from_employee: `Returned Qty ${txn.quantity}`,
      fulfill: `Consumed Qty ${txn.quantity}`,
      transfer: `Transferred Qty ${txn.quantity}`,
      damage: `Damaged Qty ${txn.quantity}`,
      retire: `Retired Qty ${txn.quantity}`,
    };
    const qtyLine = qtyLabels[txn.transaction_type];
    if (qtyLine) lines.push(qtyLine);
  }

  if (txn.purchase_order && !lines.some(l => l.includes(txn.purchase_order))) {
    lines.push(`PO ${txn.purchase_order}`);
  }
  if (txn.vendor && !lines.some(l => l.includes(txn.vendor))) {
    lines.push(`Vendor ${txn.vendor}`);
  }

  return lines;
}

/** Derive the source module label for a transaction (for table display and exports). */
export function deriveSourceModule(txn) {
  const refId = txn.related_request_id || txn.audit_reference;
  if (refId) {
    if (/^MTS/i.test(refId)) return 'Material Transfer';
    if (/^CR-/i.test(refId)) return 'Consumable Replenishment';
    if (/^ONB/i.test(refId)) return 'Onboarding';
    if (/^WF-/i.test(refId)) return 'Workflow Engine';
    if (/^EQ-/i.test(refId)) return 'Equipment Management';
  }
  const type = txn.transaction_type;
  if (type === 'receive' || type === 'receive_purchase' || type === 'consumable_receive') {
    return txn.purchase_order ? 'Purchasing' : 'Receiving';
  }
  if (type === 'physical_count') return 'Physical Count';
  if (type === 'adjust' || type === 'adjust_inventory' || type === 'consumable_adjust') return 'Inventory Adjustment';
  if (type === 'cost_updated') return 'Cost Management';
  if (type === 'repair' || type === 'returned_from_repair') return 'Equipment Repair';
  if (type && type.includes('transfer')) return 'Material Transfer';
  return 'Inventory';
}