import {
  ArrowLeftRight, Package, MapPin, Undo2, ClipboardList, PackageCheck,
  Truck, ShieldAlert, Lightbulb, FileStack, Crown, PhoneCall,
  CalendarClock, GraduationCap, DollarSign,
  ClipboardCheck, ClipboardList as ClipList, Settings, Users, Ruler,
} from 'lucide-react';

/**
 * Central form catalog for LVC OS.
 * Each form: { key, name, description, category, icon, to, roles }
 * Roles use the role keys from roleConfig.js
 */
export const FORM_CATALOG = [
  // Warehouse
  { key: 'material_transfer', name: 'Material Transfer Sheet', description: 'Record materials transferred from warehouse to truck', category: 'Warehouse', icon: ArrowLeftRight, to: '/warehouse/transfer-sheets', roles: ['warehouse_associate', 'inventory_specialist', 'lead_technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'consumable_replenishment', name: 'Consumable Truck Replenishment', description: 'Request non-inventoried consumable items for truck stocking', category: 'Warehouse', icon: Package, to: '/consumables/new', roles: ['warehouse_associate', 'inventory_specialist', 'lead_technician', 'apprentice', 'technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'bin_designation', name: 'Bin Designation', description: 'Request a new bin designation or change in the warehouse', category: 'Warehouse', icon: MapPin, to: '/warehouse/bin-requests', roles: ['warehouse_associate', 'inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'equipment_return', name: 'Equipment Return', description: 'Return equipment or materials back to warehouse inventory', category: 'Warehouse', icon: Undo2, to: '/warehouse/returned-materials', roles: ['warehouse_associate', 'inventory_specialist', 'lead_technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'inventory_adjustment', name: 'Inventory Adjustment', description: 'Adjust inventory quantities for shrinkage, damage, or correction', category: 'Warehouse', icon: ClipboardList, to: '/warehouse/manager-review', roles: ['inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'receiving', name: 'Receiving', description: 'Log received materials and shipments into inventory', category: 'Warehouse', icon: PackageCheck, to: '/warehouse/manager-review', roles: ['inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'cycle_count', name: 'Cycle Count', description: 'Perform scheduled cycle count of warehouse bins', category: 'Warehouse', icon: ClipList, to: '/warehouse/manager-review', roles: ['inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'bin_assignment', name: 'Bin Assignment', description: 'Assign or reassign items to specific warehouse bins', category: 'Warehouse', icon: MapPin, to: '/warehouse/bin-requests', roles: ['inventory_specialist', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Field Operations
  { key: 'truck_inspection', name: 'Truck Inspection', description: 'Complete the daily truck inspection checklist', category: 'Field Operations', icon: Truck, to: '/tech/equipment', roles: ['lead_technician', 'apprentice', 'technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'stucco_measurement', name: 'Chimney Stucco Measurement Tool', description: 'Measure chimney sections, calculate square footage, and generate measurement reports (FRM-STUCCO-001)', category: 'Field Operations', icon: Ruler, to: '/forms/stucco-measurement', roles: ['lead_technician', 'apprentice', 'technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Safety
  { key: 'safety_report', name: 'Safety Report', description: 'Report a safety concern, incident, or near-miss', category: 'Safety', icon: ShieldAlert, to: '/ci/submit', roles: ['lead_technician', 'apprentice', 'technician', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Human Resources
  { key: 'pto_request', name: 'PTO Request', description: 'Submit a paid time off request for approval', category: 'Human Resources', icon: CalendarClock, to: '/tech/hr', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'employee_coaching', name: 'Employee Coaching', description: 'Document an employee coaching or performance discussion', category: 'Human Resources', icon: GraduationCap, to: '/tech/hr', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Customer Service
  { key: 'customer_complaint', name: 'Customer Complaint', description: 'Log a customer complaint and track resolution', category: 'Customer Service', icon: PhoneCall, to: '/admin/customers', roles: ['csr', 'office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'membership_followup', name: 'Membership Follow-up', description: 'Track membership follow-up calls and outreach', category: 'Customer Service', icon: Crown, to: '/admin/memberships', roles: ['csr', 'office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'call_log', name: 'Call Log', description: 'Log inbound and outbound customer calls', category: 'Customer Service', icon: PhoneCall, to: '/admin/customers', roles: ['csr', 'office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Management
  { key: 'improvement_request', name: 'Improvement Request', description: 'Submit a continuous improvement idea or suggestion', category: 'Management', icon: Lightbulb, to: '/ci/submit', roles: ['warehouse_associate', 'inventory_specialist', 'lead_technician', 'apprentice', 'technician', 'csr', 'office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'deposit_verification', name: 'Deposit Verification', description: 'Verify and log daily deposit totals', category: 'Management', icon: DollarSign, to: '/admin/invoices', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'management_audit', name: 'Management Audit', description: 'Conduct a management compliance audit', category: 'Management', icon: ClipboardCheck, to: '/audits/new', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },

  // Administration
  { key: 'audit_template', name: 'Audit Template Editor', description: 'Create or edit audit templates and checklists', category: 'Administration', icon: FileStack, to: '/audits/templates', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
  { key: 'rules_engine', name: 'Rules Engine', description: 'Configure inspection rules and conditional logic', category: 'Administration', icon: Settings, to: '/admin/rules-engine', roles: ['admin', 'owner'] },
  { key: 'technician_management', name: 'Technician Management', description: 'Manage technician profiles and assignments', category: 'Administration', icon: Users, to: '/admin/technicians', roles: ['office_manager', 'operations_manager', 'director_of_operations', 'admin', 'owner'] },
];

export const FORM_CATEGORIES = [
  'Warehouse',
  'Field Operations',
  'Safety',
  'Human Resources',
  'Customer Service',
  'Management',
  'Administration',
];

/**
 * Returns forms available to a given role.
 */
export function getFormsForRole(role) {
  return FORM_CATALOG.filter(f => f.roles.includes(role));
}

/**
 * Returns forms for a role grouped by category, in FORM_CATEGORIES order.
 */
export function getFormsByCategory(role) {
  const forms = getFormsForRole(role);
  return FORM_CATEGORIES
    .map(cat => ({ category: cat, forms: forms.filter(f => f.category === cat) }))
    .filter(g => g.forms.length > 0);
}