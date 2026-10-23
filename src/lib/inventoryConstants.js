export const TRANSACTION_TYPES = [
  { value: 'receive_purchase', label: 'Receive Purchase', color: 'bg-green-100 text-green-700', description: 'Receive new inventory from a vendor purchase' },
  { value: 'issue_to_employee', label: 'Issue to Employee', color: 'bg-blue-100 text-blue-700', description: 'Issue equipment to an employee' },
  { value: 'return_from_employee', label: 'Return from Employee', color: 'bg-cyan-100 text-cyan-700', description: 'Process return from an employee' },
  { value: 'transfer_between_employees', label: 'Transfer Between Employees', color: 'bg-indigo-100 text-indigo-700', description: 'Move equipment from one employee to another' },
  { value: 'transfer_between_trucks', label: 'Transfer Between Trucks', color: 'bg-purple-100 text-purple-700', description: 'Move equipment between trucks' },
  { value: 'transfer_between_warehouses', label: 'Transfer Between Warehouses', color: 'bg-violet-100 text-violet-700', description: 'Move equipment between warehouse locations' },
  { value: 'truck_restock', label: 'Truck Restock', color: 'bg-orange-100 text-orange-700', description: 'Restock a truck from warehouse inventory' },
  { value: 'truck_return', label: 'Truck Return', color: 'bg-amber-100 text-amber-700', description: 'Return equipment from a truck to warehouse' },
  { value: 'adjust_inventory', label: 'Adjust Inventory', color: 'bg-yellow-100 text-yellow-700', description: 'Manually adjust inventory quantities' },
  { value: 'physical_count', label: 'Physical Inventory Count', color: 'bg-teal-100 text-teal-700', description: 'Record actual physical count results' },
  { value: 'repair', label: 'Send to Repair', color: 'bg-red-100 text-red-700', description: 'Send equipment out for repair' },
  { value: 'returned_from_repair', label: 'Returned From Repair', color: 'bg-emerald-100 text-emerald-700', description: 'Receive equipment back from repair' },
  { value: 'retire_item', label: 'Retire Item', color: 'bg-gray-100 text-gray-700', description: 'Retire equipment from service' },
  { value: 'lost', label: 'Lost', color: 'bg-rose-100 text-rose-700', description: 'Mark equipment as lost' },
  { value: 'damaged', label: 'Damaged', color: 'bg-pink-100 text-pink-700', description: 'Mark equipment as damaged' },
  { value: 'warranty_replacement', label: 'Warranty Replacement', color: 'bg-lime-100 text-lime-700', description: 'Process a warranty replacement' },
  { value: 'vendor_return', label: 'Vendor Return', color: 'bg-fuchsia-100 text-fuchsia-700', description: 'Return equipment to vendor' },
  { value: 'consumable_receive', label: 'Consumable Receive', color: 'bg-green-100 text-green-700', description: 'Receive consumable stock from vendor' },
  { value: 'consumable_adjust', label: 'Consumable Adjust', color: 'bg-yellow-100 text-yellow-700', description: 'Adjust consumable inventory quantity' },
  { value: 'consumable_retire', label: 'Consumable Retire', color: 'bg-gray-100 text-gray-700', description: 'Retire consumable from inventory' },
  { value: 'consumable_fulfill', label: 'Consumable Fulfill', color: 'bg-blue-100 text-blue-700', description: 'Consumable pulled for replenishment request' },
  { value: 'consumable_return', label: 'Consumable Return', color: 'bg-cyan-100 text-cyan-700', description: 'Reverse a consumable fulfillment' }
];

export const CONDITIONS = [
  { value: 'excellent', label: 'Excellent', color: 'bg-green-100 text-green-700' },
  { value: 'good', label: 'Good', color: 'bg-blue-100 text-blue-700' },
  { value: 'fair', label: 'Fair', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'damaged', label: 'Damaged', color: 'bg-red-100 text-red-700' },
  { value: 'lost', label: 'Lost', color: 'bg-rose-100 text-rose-700' },
  { value: 'repair', label: 'Needs Repair', color: 'bg-orange-100 text-orange-700' }
];

export const TRANSACTION_STATUS = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'approved', label: 'Approved', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-700' }
];

export const TRANSFER_TYPES = [
  { value: 'transfer_between_employees', label: 'Employee → Employee' },
  { value: 'transfer_between_trucks', label: 'Truck → Truck' },
  { value: 'transfer_between_warehouses', label: 'Warehouse → Warehouse' },
  { value: 'truck_restock', label: 'Warehouse → Truck (Restock)' },
  { value: 'truck_return', label: 'Truck → Warehouse (Return)' }
];

export function getTransactionTypeLabel(value) {
  return TRANSACTION_TYPES.find(t => t.value === value)?.label || value;
}

export function getTransactionTypeColor(value) {
  return TRANSACTION_TYPES.find(t => t.value === value)?.color || 'bg-gray-100 text-gray-700';
}

export function getConditionLabel(value) {
  return CONDITIONS.find(c => c.value === value)?.label || value;
}

export function getStatusLabel(value) {
  return TRANSACTION_STATUS.find(s => s.value === value)?.label || value;
}

export function getStatusColor(value) {
  return TRANSACTION_STATUS.find(s => s.value === value)?.color || 'bg-gray-100 text-gray-700';
}

export const LOW_STOCK_THRESHOLD = 2;