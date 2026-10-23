import {
  Plus, Package, Lock, User, RotateCcw, AlertTriangle, Trash2,
  Truck, Wrench, ShieldCheck, PackageX, ClipboardCheck, DollarSign,
  Store, MapPin, Settings, PackageCheck, RefreshCw,
} from 'lucide-react';

// Timeline filter categories
export const TIMELINE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'movement', label: 'Inventory Movement' },
  { value: 'reservations', label: 'Reservations' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'damage', label: 'Damage' },
  { value: 'adjustments', label: 'Adjustments' },
  { value: 'physical_counts', label: 'Physical Counts' },
  { value: 'location_changes', label: 'Location Changes' },
  { value: 'cost_changes', label: 'Cost Changes' },
];

// Visual metadata for each timeline event type — icon, label, color, dot
export const TIMELINE_EVENT_META = {
  created:               { label: 'Created',                icon: Plus,           color: 'bg-slate-100 text-slate-700',   dot: 'bg-slate-500' },
  receive:               { label: 'Received',               icon: Package,        color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  receive_purchase:      { label: 'Received (PO)',          icon: Package,        color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  consumable_receive:    { label: 'Received',               icon: Package,        color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  adjust:                { label: 'Adjusted',                icon: Settings,       color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  consumable_adjust:     { label: 'Adjusted',                icon: Settings,       color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  adjust_inventory:      { label: 'Adjusted',                icon: Settings,       color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  assign:                { label: 'Assigned',                icon: User,           color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  issue_to_employee:     { label: 'Issued to Employee',      icon: User,           color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  return:                { label: 'Returned',                icon: RotateCcw,      color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-500' },
  return_from_employee:   { label: 'Returned from Employee', icon: RotateCcw,      color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-500' },
  consumable_return:     { label: 'Returned',                icon: RotateCcw,      color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-500' },
  fulfill:               { label: 'Fulfilled',                icon: Package,        color: 'bg-indigo-100 text-indigo-700',dot: 'bg-indigo-500' },
  consumable_fulfill:    { label: 'Fulfilled',                icon: Package,        color: 'bg-indigo-100 text-indigo-700',dot: 'bg-indigo-500' },
  reserve:               { label: 'Reserved',                 icon: Lock,           color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  release_reservation:   { label: 'Reservation Released',     icon: Lock,           color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400' },
  damage:                { label: 'Damaged',                  icon: AlertTriangle,  color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  damaged:               { label: 'Damaged',                  icon: AlertTriangle,  color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  lost:                  { label: 'Lost',                     icon: AlertTriangle,  color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  retire:                { label: 'Retired',                  icon: Trash2,          color: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-500' },
  retire_item:           { label: 'Retired',                  icon: Trash2,          color: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-500' },
  consumable_retire:     { label: 'Retired',                  icon: Trash2,          color: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-500' },
  transfer:              { label: 'Transfer',                 icon: Truck,           color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  transfer_between_employees: { label: 'Transfer',             icon: Truck,           color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  transfer_between_trucks:    { label: 'Transfer',             icon: Truck,           color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  transfer_between_warehouses:{ label: 'Transfer',             icon: Truck,           color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  truck_restock:         { label: 'Truck Restock',            icon: PackageCheck,    color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  truck_return:          { label: 'Truck Return',             icon: RotateCcw,       color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-400' },
  repair:                { label: 'Sent for Repair',          icon: Wrench,          color: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500' },
  returned_from_repair:  { label: 'Returned from Repair',    icon: Wrench,          color: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-400' },
  warranty_replacement:  { label: 'Warranty Replacement',      icon: ShieldCheck,     color: 'bg-indigo-100 text-indigo-700',dot: 'bg-indigo-500' },
  vendor_return:         { label: 'Vendor Return',             icon: PackageX,        color: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500' },
  physical_count:       { label: 'Physical Count',            icon: ClipboardCheck,   color: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500' },
  cost_updated:         { label: 'Cost Updated',              icon: DollarSign,       color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  vendor_changed:       { label: 'Vendor Changed',            icon: Store,            color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400' },
  warehouse_changed:    { label: 'Warehouse Changed',         icon: MapPin,           color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-500' },
  bin_changed:          { label: 'Bin Changed',               icon: MapPin,           color: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-400' },
};

export function getTimelineEventMeta(type) {
  if (!type) return { label: 'Unknown', icon: Package, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
  return TIMELINE_EVENT_META[type] || {
    label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: Package,
    color: 'bg-gray-100 text-gray-700',
    dot: 'bg-gray-400',
  };
}

// Categorize a transaction into a timeline filter bucket
export function getTimelineCategory(txn) {
  const type = txn.transaction_type;
  const reason = (txn.reason || '').toLowerCase();

  if (type === 'physical_count') return 'physical_counts';
  if (type === 'adjust' || type === 'adjust_inventory' || type === 'consumable_adjust') {
    if (reason.includes('count') || reason.includes('physical')) return 'physical_counts';
    if (reason.includes('cost')) return 'cost_changes';
    return 'adjustments';
  }
  if ((type === 'receive' || type === 'receive_purchase' || type === 'consumable_receive') && txn.purchase_order) return 'purchasing';
  if (type === 'receive' || type === 'receive_purchase' || type === 'consumable_receive') return 'movement';
  if (type === 'fulfill' || type === 'consumable_fulfill') return 'movement';
  if (type === 'transfer' || type === 'transfer_between_employees' || type === 'transfer_between_trucks' || type === 'transfer_between_warehouses') {
    if (reason.includes('location') || reason.includes('bin') || reason.includes('warehouse')) return 'location_changes';
    return 'movement';
  }
  if (type === 'truck_restock' || type === 'truck_return') return 'movement';
  if (type === 'reserve' || type === 'release_reservation') return 'reservations';
  if (type === 'assign' || type === 'issue_to_employee' || type === 'return' || type === 'return_from_employee' || type === 'consumable_return') return 'assignments';
  if (type === 'damage' || type === 'damaged' || type === 'lost') return 'damage';
  if (type === 'retire' || type === 'retire_item' || type === 'consumable_retire') return 'movement';
  if (type === 'repair' || type === 'returned_from_repair') return 'movement';
  if (type === 'warranty_replacement' || type === 'vendor_return') return 'movement';
  if (type === 'cost_updated') return 'cost_changes';
  if (type === 'vendor_changed') return 'movement';
  if (type === 'warehouse_changed' || type === 'bin_changed') return 'location_changes';
  if (type === 'created') return 'movement';
  return 'movement';
}

// Parse a JSON quantity snapshot stored as a string
export function parseQtySnapshot(str) {
  if (!str) return null;
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}