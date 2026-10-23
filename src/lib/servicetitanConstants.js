export const EVENT_TYPES = [
  'transfer_sheet_created',
  'transfer_sheet_updated',
  'job_created',
  'job_updated',
  'job_completed',
  'appointment_assigned',
  'estimate_approved',
  'invoice_completed',
  'payment_collected',
  'customer_updated',
  'purchase_order_created',
  'purchase_order_received',
  'purchase_order_updated',
  'inventory_transfer_created',
  'technician_assigned',
  'truck_assigned',
];

export const EVENT_TYPE_LABELS = {
  transfer_sheet_created: 'Transfer Sheet Created',
  transfer_sheet_updated: 'Transfer Sheet Updated',
  job_created: 'Job Created',
  job_updated: 'Job Updated',
  job_completed: 'Job Completed',
  appointment_assigned: 'Appointment Assigned',
  estimate_approved: 'Estimate Approved',
  invoice_completed: 'Invoice Completed',
  payment_collected: 'Payment Collected',
  customer_updated: 'Customer Updated',
  purchase_order_created: 'Purchase Order Created',
  purchase_order_received: 'Purchase Order Received',
  purchase_order_updated: 'Purchase Order Updated',
  inventory_transfer_created: 'Inventory Transfer Created',
  technician_assigned: 'Technician Assigned',
  truck_assigned: 'Truck Assigned',
};

export const EVENT_STATUS_COLORS = {
  Received: 'bg-blue-100 text-blue-700',
  Processing: 'bg-amber-100 text-amber-700',
  Processed: 'bg-green-100 text-green-700',
  Failed: 'bg-red-100 text-red-700',
  Ignored: 'bg-slate-100 text-slate-500',
};

export const TRANSFER_SHEET_STATUS_COLORS = {
  'Not Started': 'bg-slate-100 text-slate-600',
  'In Progress': 'bg-amber-100 text-amber-700',
  Picked: 'bg-green-100 text-green-700',
  'N/A': 'bg-slate-100 text-slate-400',
};

export const MAPPING_TYPES = [
  { value: 'truck', label: 'Truck / Location', entity: 'TruckProfile' },
  { value: 'technician', label: 'Technician', entity: 'Technician' },
  { value: 'business_unit', label: 'Business Unit → Department', entity: 'Department' },
  { value: 'job_type', label: 'Job Type → Workflow', entity: 'BusinessProcess' },
];

export const INTEGRATION_ROLES = ['admin', 'owner', 'Director of Operations', 'Operations Manager'];

export function formatEventType(type) {
  return EVENT_TYPE_LABELS[type] || type || 'Unknown';
}

export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}