export const CONSUMABLE_STATUS = [
  { value: 'Active', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'Inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-700' },
];

export const CONSUMABLE_TRANSACTION_TYPES = [
  { value: 'consumable_receive', label: 'Receive', delta: 'positive', color: 'bg-green-100 text-green-700', description: 'Receive new stock from vendor' },
  { value: 'consumable_adjust', label: 'Adjust', delta: 'any', color: 'bg-yellow-100 text-yellow-700', description: 'Manually adjust quantity (count, correction)' },
  { value: 'consumable_retire', label: 'Retire', delta: 'zero', color: 'bg-gray-100 text-gray-700', description: 'Retire item from active inventory' },
  { value: 'consumable_fulfill', label: 'Fulfill Request', delta: 'negative', color: 'bg-blue-100 text-blue-700', description: 'Pulled for a replenishment request' },
  { value: 'consumable_return', label: 'Return (Un-pull)', delta: 'positive', color: 'bg-cyan-100 text-cyan-700', description: 'Reverse a fulfillment (item un-pulled)' },
];

export const CONSUMABLE_ADJUSTMENT_REASONS = [
  'physical_count',
  'cycle_count',
  'correction',
  'damaged',
  'lost',
  'expired',
  'theft',
  'transfer_correction',
  'other',
];

export function getConsumableStatusColor(value) {
  return CONSUMABLE_STATUS.find(s => s.value === value)?.color || 'bg-gray-100 text-gray-700';
}

export function getConsumableStatusBadge(value) {
  return CONSUMABLE_STATUS.find(s => s.value === value)?.label || value;
}

export function getConsumableTxnColor(value) {
  return CONSUMABLE_TRANSACTION_TYPES.find(t => t.value === value)?.color || 'bg-gray-100 text-gray-700';
}

export function getConsumableTxnLabel(value) {
  return CONSUMABLE_TRANSACTION_TYPES.find(t => t.value === value)?.label || value;
}

export function isLowStock(item) {
  if (!item || !item.minimum_stock) return false;
  return (item.quantity_on_hand || 0) <= item.minimum_stock;
}

export function isReorderNeeded(item) {
  if (!item || !item.minimum_stock) return false;
  return (item.quantity_on_hand || 0) <= item.minimum_stock;
}

export function isOverstock(item) {
  if (!item || !item.maximum_stock) return false;
  return (item.quantity_on_hand || 0) > item.maximum_stock;
}

export function computeInventoryValue(item) {
  if (!item) return 0;
  return Math.round(((item.quantity_on_hand || 0) * (item.unit_cost || 0)) * 100) / 100;
}