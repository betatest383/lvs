export const CONDITION_LABELS = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  damaged: 'Damaged',
  missing: 'Missing',
  out_for_repair: 'Out for Repair'
};

export const CONDITION_COLORS = {
  new: 'bg-green-100 text-green-700',
  good: 'bg-blue-100 text-blue-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-red-100 text-red-700',
  damaged: 'bg-red-100 text-red-700',
  missing: 'bg-gray-200 text-gray-700',
  out_for_repair: 'bg-orange-100 text-orange-700'
};

export const STATUS_LABELS = {
  active: 'Active',
  missing: 'Missing',
  damaged: 'Damaged',
  out_for_repair: 'Out for Repair',
  retired: 'Retired',
  warehouse_stock: 'Warehouse Stock'
};

export const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  missing: 'bg-red-100 text-red-700',
  damaged: 'bg-orange-100 text-orange-700',
  out_for_repair: 'bg-purple-100 text-purple-700',
  retired: 'bg-gray-200 text-gray-600',
  warehouse_stock: 'bg-blue-100 text-blue-700'
};

export const ASSIGNMENT_TYPE_LABELS = {
  permanent: 'Permanent',
  temporary: 'Temporary',
  warehouse_stock: 'Warehouse Stock',
  repair: 'Repair',
  retired: 'Retired'
};

export const ASSIGNMENT_TYPE_COLORS = {
  permanent: 'bg-purple-100 text-purple-700',
  temporary: 'bg-cyan-100 text-cyan-700',
  warehouse_stock: 'bg-blue-100 text-blue-700',
  repair: 'bg-orange-100 text-orange-700',
  retired: 'bg-gray-200 text-gray-600'
};

export const RETURN_REASON_LABELS = {
  returned_to_warehouse: 'Returned to Warehouse',
  offboarding: 'Employee Offboarding',
  truck_reassignment: 'Truck Reassignment',
  repair_needed: 'Needs Repair',
  damaged: 'Damaged / Unusable',
  lost_missing: 'Lost / Missing',
  retired: 'Retired / Disposed',
  replacement: 'Replaced with New',
  end_of_temporary: 'Temporary Assignment Ended',
  other: 'Other'
};

export const RETURN_REASON_COLORS = {
  returned_to_warehouse: 'bg-blue-100 text-blue-700',
  offboarding: 'bg-purple-100 text-purple-700',
  truck_reassignment: 'bg-indigo-100 text-indigo-700',
  repair_needed: 'bg-orange-100 text-orange-700',
  damaged: 'bg-red-100 text-red-700',
  lost_missing: 'bg-gray-200 text-gray-700',
  retired: 'bg-gray-200 text-gray-600',
  replacement: 'bg-cyan-100 text-cyan-700',
  end_of_temporary: 'bg-teal-100 text-teal-700',
  other: 'bg-muted text-muted-foreground'
};

export const ASSIGNMENT_TARGETS = [
  { value: 'technician', label: 'Technician' },
  { value: 'truck', label: 'Truck' },
  { value: 'crew', label: 'Crew' },
  { value: 'job', label: 'Job' },
  { value: 'warehouse', label: 'Warehouse' }
];