export const INVENTORY_TYPES = [
  { value: 'Consumable', label: 'Consumable', color: 'bg-blue-100 text-blue-700', icon: 'Package' },
  { value: 'Material', label: 'Material', color: 'bg-purple-100 text-purple-700', icon: 'Layers' },
  { value: 'Equipment', label: 'Equipment', color: 'bg-orange-100 text-orange-700', icon: 'Wrench' },
  { value: 'Tool', label: 'Tool', color: 'bg-cyan-100 text-cyan-700', icon: 'Hammer' },
  { value: 'Fleet Part', label: 'Fleet Part', color: 'bg-red-100 text-red-700', icon: 'Truck' },
  { value: 'Safety Supply', label: 'Safety Supply', color: 'bg-green-100 text-green-700', icon: 'ShieldCheck' },
  { value: 'Office Supply', label: 'Office Supply', color: 'bg-gray-100 text-gray-700', icon: 'Clipboard' },
];

export const INVENTORY_STATUS = [
  { value: 'Active', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'Inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-700' },
  { value: 'Discontinued', label: 'Discontinued', color: 'bg-red-100 text-red-700' },
];

export const INVENTORY_TRANSACTION_TYPES = [
  { value: 'opening_balance', label: 'Opening Balance', delta: 'positive', color: 'bg-emerald-100 text-emerald-700', description: 'Set initial stock from opening balance or import' },
  { value: 'receive', label: 'Receive', delta: 'positive', color: 'bg-green-100 text-green-700', description: 'Receive new stock from vendor or PO' },
  { value: 'adjust', label: 'Adjust', delta: 'any', color: 'bg-yellow-100 text-yellow-700', description: 'Manually adjust quantity (count, correction)' },
  { value: 'assign', label: 'Assign', delta: 'shift', color: 'bg-blue-100 text-blue-700', description: 'Assign item to employee (available -> assigned)' },
  { value: 'return', label: 'Return', delta: 'shift', color: 'bg-cyan-100 text-cyan-700', description: 'Return from employee (assigned -> available)' },
  { value: 'fulfill', label: 'Fulfill', delta: 'negative', color: 'bg-indigo-100 text-indigo-700', description: 'Consume/issue item for a request or job' },
  { value: 'reserve', label: 'Reserve', delta: 'shift', color: 'bg-amber-100 text-amber-700', description: 'Reserve stock (available -> reserved)' },
  { value: 'release_reservation', label: 'Release Reservation', delta: 'shift', color: 'bg-amber-100 text-amber-700', description: 'Release a reservation (reserved -> available)' },
  { value: 'damage', label: 'Damage', delta: 'shift', color: 'bg-red-100 text-red-700', description: 'Mark item as damaged (available -> damaged)' },
  { value: 'retire', label: 'Retire', delta: 'negative', color: 'bg-gray-100 text-gray-700', description: 'Retire item from active inventory' },
  { value: 'transfer', label: 'Transfer', delta: 'none', color: 'bg-purple-100 text-purple-700', description: 'Transfer between locations (no quantity change)' },
];

export const UNITS = ['ea', 'Tube', 'Box', 'Bag', 'Pair', 'Piece', 'Roll', 'Container', 'Wheel', 'Gallon', 'Case', 'Set', 'Kit', 'Pail', 'Drum'];

// Centralized SKU prefix mapping — every module uses these values
export const SKU_PREFIXES = {
  'Consumable': 'CON',
  'Material': 'MAT',
  'Equipment': 'EQP',
  'Tool': 'TOL',
  'Fleet Part': 'FLT',
  'Safety Supply': 'SAF',
  'Office Supply': 'OFF',
};

export function getSkuPrefix(inventoryType) {
  return SKU_PREFIXES[inventoryType] || 'GEN';
}

export function parseSku(sku) {
  if (!sku) return { prefix: '', number: '' };
  const match = String(sku).match(/^([A-Za-z]+)-(\d+)$/);
  if (match) return { prefix: match[1].toUpperCase(), number: match[2] };
  return { prefix: '', number: '' };
}

export function buildSku(inventoryType, number) {
  const prefix = getSkuPrefix(inventoryType);
  const numStr = String(number).padStart(6, '0');
  return `${prefix}-${numStr}`;
}

export function swapSkuPrefix(sku, newInventoryType) {
  const { number } = parseSku(sku);
  if (!number) return null;
  return buildSku(newInventoryType, number);
}

export function getInventoryTypeMeta(value) {
  return INVENTORY_TYPES.find(t => t.value === value) || { label: value, color: 'bg-gray-100 text-gray-700' };
}

export function getInventoryStatusColor(value) {
  return INVENTORY_STATUS.find(s => s.value === value)?.color || 'bg-gray-100 text-gray-700';
}

export function getTxnTypeMeta(value) {
  return INVENTORY_TRANSACTION_TYPES.find(t => t.value === value) || { label: value, color: 'bg-gray-100 text-gray-700' };
}

export function isLowStock(item) {
  if (!item || !item.minimum_stock) return false;
  return (item.quantity_available || 0) <= item.minimum_stock;
}

export function isOutOfStock(item) {
  return (item.quantity_available || 0) === 0;
}

export function isOverstock(item) {
  if (!item || !item.maximum_stock) return false;
  return (item.quantity_owned || 0) > item.maximum_stock;
}

export function computeInventoryValue(item) {
  if (!item) return 0;
  return Math.round(((item.quantity_owned || 0) * (item.unit_cost || 0)) * 100) / 100;
}

export function checkBalance(item) {
  if (!item) return true;
  const sum = (item.quantity_available || 0)
    + (item.quantity_assigned || 0)
    + (item.quantity_reserved || 0)
    + (item.quantity_on_order || 0)
    + (item.quantity_damaged || 0)
    + (item.quantity_retired || 0);
  return (item.quantity_owned || 0) === sum;
}

export function getBalanceSummary(item) {
  if (!item) return '';
  const parts = [
    `${item.quantity_available || 0} avail`,
    `${item.quantity_assigned || 0} assigned`,
    `${item.quantity_reserved || 0} reserved`,
    `${item.quantity_on_order || 0} on order`,
    `${item.quantity_damaged || 0} damaged`,
    `${item.quantity_retired || 0} retired`,
  ];
  return parts.join(' · ');
}

// Quantity bucket definitions with color coding for UI display
// Green = Available, Yellow = Reserved, Blue = Assigned, Purple = On Order, Orange = Damaged, Gray = Retired
export const QUANTITY_BUCKETS = [
  { key: 'quantity_owned',      label: 'Owned',     short: 'Owned',     color: 'text-slate-700',    dot: 'bg-slate-500',    badge: 'bg-slate-100 text-slate-700' },
  { key: 'quantity_available',  label: 'Available', short: 'Avail',     color: 'text-green-700',    dot: 'bg-green-500',    badge: 'bg-green-100 text-green-700' },
  { key: 'quantity_reserved',   label: 'Reserved',  short: 'Reserved', color: 'text-yellow-700',    dot: 'bg-yellow-500',   badge: 'bg-yellow-100 text-yellow-700' },
  { key: 'quantity_assigned',   label: 'Assigned',  short: 'Assigned', color: 'text-blue-700',      dot: 'bg-blue-500',     badge: 'bg-blue-100 text-blue-700' },
  { key: 'quantity_on_order',   label: 'On Order',  short: 'On Order', color: 'text-purple-700',    dot: 'bg-purple-500',   badge: 'bg-purple-100 text-purple-700' },
  { key: 'quantity_damaged',    label: 'Damaged',   short: 'Damaged',  color: 'text-orange-700',    dot: 'bg-orange-500',   badge: 'bg-orange-100 text-orange-700' },
  { key: 'quantity_retired',    label: 'Retired',   short: 'Retired',  color: 'text-gray-500',      dot: 'bg-gray-400',     badge: 'bg-gray-100 text-gray-600' },
];

export function getBucketValue(item, key) {
  return (item && item[key]) || 0;
}

// Transaction types for filtering — the full set the ledger supports
export const INVENTORY_TXN_FILTER_TYPES = [
  { value: 'opening_balance',      label: 'Opening Balance' },
  { value: 'receive',             label: 'Receive' },
  { value: 'adjust',              label: 'Adjust' },
  { value: 'reserve',             label: 'Reserve' },
  { value: 'release_reservation', label: 'Release Reservation' },
  { value: 'assign',              label: 'Assign' },
  { value: 'return',              label: 'Return' },
  { value: 'fulfill',             label: 'Fulfill' },
  { value: 'transfer',            label: 'Transfer' },
  { value: 'damage',              label: 'Damage' },
  { value: 'retire',              label: 'Retire' },
];