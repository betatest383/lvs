import {
  LayoutDashboard, Users, Wrench, Briefcase, ClipboardCheck, FileText,
  Calculator, Receipt, Package, ShoppingBag, Crown, BookOpen, Cog,
  Warehouse, ClipboardList, ArrowLeftRight, Undo2, Sparkles, MapPin,
  CheckSquare, Database, FileStack, Shield, Workflow, LayoutPanelLeft,
  Zap, Plug, GitCommit, Lightbulb, TrendingUp, KanbanSquare, PackageCheck,
  UserCircle, CalendarPlus, Gauge, Sun, Plus, List, User, CheckCircle2, BarChart3,
  AlertTriangle, Truck, Radio, Play, PackageX, Bell, MessageSquare, Boxes, Calendar,
} from 'lucide-react';

/**
 * Module Catalog — master map of every navigable module in the app.
 * Each entry: { label, path, icon, group }
 * Roles select from these keys via their `modules` array.
 */
export const MODULE_CATALOG = {
  // Command Center
  ops_center: { label: 'Operations Center', path: '/operations', icon: Gauge, group: 'Command Center' },
  ops_morning_brief: { label: 'Morning Brief', path: '/operations/morning-brief', icon: Sun, group: 'Command Center' },

  // Overview
  dashboard: { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Overview' },

  // Operations
  customers: { label: 'Customers', path: '/admin/customers', icon: Users, group: 'Operations' },
  technicians: { label: 'Technicians', path: '/admin/technicians', icon: Wrench, group: 'Operations' },
  jobs: { label: 'Jobs', path: '/admin/jobs', icon: Briefcase, group: 'Operations' },

  // Documents
  inspections: { label: 'Inspections', path: '/admin/inspections', icon: ClipboardCheck, group: 'Documents' },
  reports: { label: 'Reports', path: '/admin/reports', icon: FileText, group: 'Documents' },
  estimates: { label: 'Estimates', path: '/admin/estimates', icon: Calculator, group: 'Documents' },
  invoices: { label: 'Invoices', path: '/admin/invoices', icon: Receipt, group: 'Documents' },
  material_lists: { label: 'Material Lists', path: '/admin/material-lists', icon: Package, group: 'Documents' },

  // Warehouse
  wh_dashboard: { label: 'Dashboard', path: '/warehouse', icon: Warehouse, group: 'Warehouse' },
  wh_morning_departure: { label: 'Morning Departure', path: '/warehouse/morning-departure', icon: Sun, group: 'Warehouse' },
  wh_night_before_prep: { label: 'Night Before Prep', path: '/warehouse/night-before-prep', icon: Boxes, group: 'Warehouse' },
  wh_technicians: { label: 'Technician Requests', path: '/warehouse/technicians', icon: Users, group: 'Warehouse' },
  wh_hardware: { label: 'Hardware Checklists', path: '/warehouse/hardware-checklists', icon: ClipboardList, group: 'Warehouse' },
  wh_transfers: { label: 'Material Transfers', path: '/warehouse/transfer-sheets', icon: ArrowLeftRight, group: 'Warehouse' },
  wh_returns: { label: 'Returns', path: '/warehouse/returned-materials', icon: Undo2, group: 'Warehouse' },
  wh_cleanup: { label: 'Warehouse Cleanup', path: '/warehouse/cleanup', icon: Sparkles, group: 'Warehouse' },
  wh_bins: { label: 'Bin Requests', path: '/warehouse/bin-requests', icon: MapPin, group: 'Warehouse' },
  wh_review: { label: 'Manager Review', path: '/warehouse/manager-review', icon: CheckSquare, group: 'Warehouse' },
  consumable_dashboard: { label: 'Consumable Dashboard', path: '/consumables', icon: Package, group: 'Warehouse' },
  consumable_new: { label: 'New Consumable Request', path: '/consumables/new', icon: Plus, group: 'Warehouse' },
  consumable_picklist: { label: 'Consumable Pick List', path: '/consumables/picklist', icon: ClipboardCheck, group: 'Warehouse' },
  consumable_history: { label: 'Consumable History', path: '/consumables/history', icon: List, group: 'Warehouse' },

  // LVC OS Registry
  lvcos_dashboard: { label: 'Registry Dashboard', path: '/lvcos', icon: Database, group: 'LVC OS Registry' },
  lvcos_id: { label: 'ID Standard', path: '/lvcos/id-standard', icon: Database, group: 'LVC OS Registry' },
  lvcos_project: { label: 'Project Dashboard', path: '/lvcos/project', icon: TrendingUp, group: 'LVC OS Registry' },
  lvcos_status: { label: 'Status Board', path: '/lvcos/status-board', icon: KanbanSquare, group: 'LVC OS Registry' },
  lvcos_packs: { label: 'Process Packs', path: '/lvcos/process-packs', icon: PackageCheck, group: 'LVC OS Registry' },
  lvcos_sop: { label: 'SOP Registry', path: '/lvcos/sop-registry', icon: FileStack, group: 'LVC OS Registry' },
  lvcos_policy: { label: 'Policy Registry', path: '/lvcos/policy-registry', icon: Shield, group: 'LVC OS Registry' },
  lvcos_form: { label: 'Form Registry', path: '/lvcos/form-registry', icon: ClipboardList, group: 'LVC OS Registry' },
  lvcos_workflow: { label: 'Workflow Registry', path: '/lvcos/workflow-registry', icon: Workflow, group: 'LVC OS Registry' },
  lvcos_dashboard_reg: { label: 'Dashboard Registry', path: '/lvcos/dashboard-registry', icon: LayoutPanelLeft, group: 'LVC OS Registry' },
  lvcos_kpi: { label: 'KPI Registry', path: '/lvcos/kpi-registry', icon: CheckSquare, group: 'LVC OS Registry' },
  lvcos_automation: { label: 'Automation Registry', path: '/lvcos/automation-registry', icon: Zap, group: 'LVC OS Registry' },
  lvcos_integration: { label: 'Integration Registry', path: '/lvcos/integration-registry', icon: Plug, group: 'LVC OS Registry' },
  lvcos_release: { label: 'Release Notes', path: '/lvcos/release-notes', icon: GitCommit, group: 'LVC OS Registry' },
  lvcos_improvement: { label: 'Improvement Requests', path: '/lvcos/improvement-requests', icon: Lightbulb, group: 'LVC OS Registry' },

  // Settings
  store: { label: 'Store', path: '/admin/store', icon: ShoppingBag, group: 'Settings' },
  memberships: { label: 'Memberships', path: '/admin/memberships', icon: Crown, group: 'Settings' },
  resources: { label: 'Resources', path: '/admin/resources', icon: BookOpen, group: 'Settings' },
  rules_engine: { label: 'Rules Engine', path: '/admin/rules-engine', icon: Cog, group: 'Settings' },

  // Field
  tech_job_hub: { label: 'Job Hub', path: '/', icon: LayoutDashboard, group: 'Field' },
  tech_dashboard: { label: 'My Jobs', path: '/tech/dashboard', icon: Calendar, group: 'Field' },
  tech_inspection: { label: 'Inspection Form', path: '/tech/inspection-select', icon: ClipboardCheck, group: 'Field' },
  tech_reports: { label: 'Reports', path: '/tech/reports', icon: FileText, group: 'Field' },
  tech_equipment: { label: 'My Equipment', path: '/tech/equipment', icon: Wrench, group: 'Field' },
  tech_resources: { label: 'Product Resources', path: '/tech/resources', icon: BookOpen, group: 'Field' },
  tech_hr: { label: 'HR', path: '/tech/hr', icon: UserCircle, group: 'Field' },
  tech_weekly_inspection: { label: 'Weekly Inspection', path: '/tech/weekly-inspection', icon: ClipboardCheck, group: 'Field' },

  // Customer Portal
  customer_book: { label: 'Book a Service', path: '/customer/book', icon: CalendarPlus, group: 'Customer Portal' },
  customer_jobs: { label: 'My Jobs', path: '/customer/jobs', icon: Briefcase, group: 'Customer Portal' },
  customer_reports: { label: 'Reports', path: '/customer/reports', icon: FileText, group: 'Customer Portal' },
  customer_estimates: { label: 'Estimates', path: '/customer/estimates', icon: Calculator, group: 'Customer Portal' },
  customer_invoices: { label: 'Invoices', path: '/customer/invoices', icon: Receipt, group: 'Customer Portal' },
  customer_store: { label: 'Store', path: '/customer/store', icon: ShoppingBag, group: 'Customer Portal' },
  customer_membership: { label: 'Membership', path: '/customer/membership', icon: Crown, group: 'Customer Portal' },

  // Forms Center
  forms_center: { label: 'Forms Center', path: '/forms', icon: FileText, group: 'Overview' },

  // Workflows
  wf_morning_request: { label: 'Morning Material Request', path: '/warehouse/morning-material-request', icon: Workflow, group: 'Warehouse' },
  wh_201: { label: 'Material Returns', path: '/warehouse/material-returns', icon: PackageX, group: 'Warehouse' },
  wh_201_new: { label: 'New Material Return', path: '/warehouse/material-returns/new', icon: Plus, group: 'Warehouse' },
  wh_201_verify: { label: 'Verify Returns', path: '/warehouse/material-returns/verify', icon: ClipboardCheck, group: 'Warehouse' },
  wh_201_history: { label: 'Return History', path: '/warehouse/material-returns/history', icon: List, group: 'Warehouse' },
  wh_fleet_readiness: { label: 'Fleet Readiness', path: '/fleet/readiness', icon: CheckCircle2, group: 'Warehouse' },

  // Fleet
  fleet_dashboard: { label: 'Fleet Dashboard', path: '/fleet', icon: Truck, group: 'Fleet' },
  fleet_trucks: { label: 'Truck Profiles', path: '/fleet/trucks', icon: Truck, group: 'Fleet' },
  fleet_assignments: { label: 'Vehicle Assignments', path: '/fleet/assignments', icon: ClipboardList, group: 'Fleet' },
  fleet_checkout: { label: 'Shared Vehicle Checkout', path: '/fleet/shared-checkout', icon: Plus, group: 'Fleet' },
  fleet_readiness: { label: 'Fleet Readiness', path: '/fleet/readiness', icon: CheckCircle2, group: 'Fleet' },
  fleet_history: { label: 'Truck History', path: '/fleet/history', icon: List, group: 'Fleet' },

  // Equipment & Inventory
  equipment: { label: 'Equipment', path: '/equipment', icon: Wrench, group: 'Equipment & Inventory' },
  inventory: { label: 'Inventory', path: '/inventory', icon: PackageCheck, group: 'Equipment & Inventory' },
  wh_setup_wizard: { label: 'Warehouse Setup Wizard', path: '/warehouse/setup', icon: Boxes, group: 'Equipment & Inventory' },
  wh_setup_dashboard: { label: 'Setup Dashboard', path: '/warehouse/setup-dashboard', icon: KanbanSquare, group: 'Equipment & Inventory' },

  // Tasks & Notifications
  enterprise_tasks: { label: 'Enterprise Tasks', path: '/tasks', icon: CheckSquare, group: 'Tasks & Notifications' },
  notifications: { label: 'Notifications', path: '/notifications', icon: Bell, group: 'Tasks & Notifications' },
  messages: { label: 'Messages', path: '/tech/messages', icon: MessageSquare, group: 'Tasks & Notifications' },

  // Settings
  settings_profile: { label: 'Settings', path: '/profile', icon: Cog, group: 'Settings' },

  // ServiceTitan Integration
  st_dashboard: { label: 'Integration Dashboard', path: '/servicetitan', icon: Plug, group: 'ServiceTitan' },
  st_webhooks: { label: 'Webhook Inbox', path: '/servicetitan/webhook-inbox', icon: Radio, group: 'ServiceTitan' },
  st_event_log: { label: 'Event Log', path: '/servicetitan/event-log', icon: List, group: 'ServiceTitan' },
  st_transfer_sheets: { label: 'Transfer Sheet Sync', path: '/servicetitan/transfer-sheets', icon: ArrowLeftRight, group: 'ServiceTitan' },
  st_jobs: { label: 'Job Sync', path: '/servicetitan/jobs', icon: Briefcase, group: 'ServiceTitan' },
  st_purchase_orders: { label: 'Purchase Order Sync', path: '/servicetitan/purchase-orders', icon: Package, group: 'ServiceTitan' },
  st_inventory: { label: 'Inventory Sync', path: '/servicetitan/inventory', icon: Database, group: 'ServiceTitan' },
  st_mapping: { label: 'Mapping Rules', path: '/servicetitan/mapping-rules', icon: MapPin, group: 'ServiceTitan' },
  st_failed: { label: 'Failed Syncs', path: '/servicetitan/failed-syncs', icon: AlertTriangle, group: 'ServiceTitan' },
  st_settings: { label: 'Integration Settings', path: '/servicetitan/settings', icon: Cog, group: 'ServiceTitan' },
  st_simulator: { label: 'Webhook Simulator', path: '/servicetitan/simulator', icon: Play, group: 'ServiceTitan' },

  // Continuous Improvement
  ci_dashboard: { label: 'Dashboard', path: '/ci', icon: Lightbulb, group: 'Continuous Improvement' },
  ci_submit: { label: 'Submit Idea', path: '/ci/submit', icon: Plus, group: 'Continuous Improvement' },
  ci_queue: { label: 'Queue', path: '/ci/queue', icon: List, group: 'Continuous Improvement' },
  ci_my_ideas: { label: 'My Ideas', path: '/ci/my-ideas', icon: User, group: 'Continuous Improvement' },
  ci_review_board: { label: 'Review Board', path: '/ci/review-board', icon: KanbanSquare, group: 'Continuous Improvement' },
  ci_implemented: { label: 'Implemented', path: '/ci/implemented', icon: CheckCircle2, group: 'Continuous Improvement' },
  ci_executive: { label: 'Executive Dashboard', path: '/ci/executive', icon: BarChart3, group: 'Continuous Improvement' },

  // Management Audits
  audit_dashboard: { label: 'Audit Dashboard', path: '/audits', icon: ClipboardCheck, group: 'Management Audits' },
  audit_templates: { label: 'Templates', path: '/audits/templates', icon: FileStack, group: 'Management Audits' },
  audit_new: { label: 'New Audit', path: '/audits/new', icon: Plus, group: 'Management Audits' },
  audit_queue: { label: 'Queue', path: '/audits/queue', icon: List, group: 'Management Audits' },
  audit_completed: { label: 'Completed', path: '/audits/completed', icon: CheckCircle2, group: 'Management Audits' },
  audit_employee_history: { label: 'Employee History', path: '/audits/employee-history', icon: User, group: 'Management Audits' },
  audit_compliance: { label: 'Process Compliance', path: '/audits/compliance', icon: BarChart3, group: 'Management Audits' },
  audit_corrective: { label: 'Corrective Actions', path: '/audits/corrective-actions', icon: AlertTriangle, group: 'Management Audits' },
};

const ALL_MODULE_KEYS = Object.keys(MODULE_CATALOG);

const GROUP_ORDER = [
  'Command Center', 'Overview', 'Operations', 'Documents', 'Warehouse', 'Equipment & Inventory', 'Fleet', 'ServiceTitan',
  'Tasks & Notifications', 'Continuous Improvement', 'Management Audits', 'LVC OS Registry', 'Settings', 'Field', 'Customer Portal',
];

export const ROLE_CONFIG = {
  warehouse_manager: {
    label: 'Warehouse Manager',
    dashboard: 'WarehouseDashboard',
    landingPage: '/warehouse',
    modules: [
      'wh_dashboard', 'wh_night_before_prep', 'wh_morning_departure', 'wh_transfers', 'consumable_dashboard',
      'wh_returns', 'wh_201', 'wh_201_verify', 'wh_201_history',
      'equipment', 'inventory', 'wh_setup_wizard', 'wh_setup_dashboard', 'fleet_readiness',
      'enterprise_tasks', 'notifications', 'messages', 'settings_profile',
    ],
  },
  warehouse_associate: {
    label: 'Warehouse Associate',
    dashboard: 'WarehouseDashboard',
    landingPage: '/warehouse',
    modules: ['dashboard', 'forms_center', 'wh_dashboard', 'wh_night_before_prep', 'wh_morning_departure', 'wf_morning_request', 'wh_hardware', 'wh_transfers', 'wh_returns', 'wh_cleanup', 'wh_bins',
      'wh_201', 'wh_201_verify', 'wh_201_history',
      'consumable_dashboard', 'consumable_picklist', 'consumable_history',
      'fleet_dashboard', 'fleet_trucks', 'fleet_readiness',
      'equipment', 'inventory',
      'enterprise_tasks', 'notifications', 'messages', 'settings_profile',
      'st_dashboard', 'st_transfer_sheets', 'st_inventory',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  inventory_specialist: {
    label: 'Inventory Specialist',
    dashboard: 'WarehouseDashboard',
    landingPage: '/warehouse',
    modules: ['dashboard', 'forms_center', 'wh_dashboard', 'wh_night_before_prep', 'wh_morning_departure', 'wf_morning_request', 'wh_hardware', 'wh_transfers', 'wh_returns', 'wh_bins', 'wh_review',
      'wh_201', 'wh_201_verify', 'wh_201_history',
      'consumable_dashboard', 'consumable_picklist', 'consumable_history',
      'fleet_dashboard', 'fleet_trucks', 'fleet_readiness',
      'equipment', 'inventory',
      'enterprise_tasks', 'notifications', 'messages', 'settings_profile',
      'st_dashboard', 'st_transfer_sheets', 'st_inventory',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  lead_technician: {
    label: 'Lead Technician',
    modules: ['dashboard', 'forms_center', 'tech_inspection', 'tech_reports', 'tech_equipment', 'tech_resources', 'tech_weekly_inspection',
      'wh_201', 'wh_201_new', 'wh_201_history',
      'consumable_dashboard', 'consumable_new', 'consumable_history',
      'fleet_dashboard', 'fleet_trucks', 'fleet_checkout',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  apprentice: {
    label: 'Apprentice',
    modules: ['dashboard', 'forms_center', 'tech_inspection', 'tech_reports', 'tech_resources', 'tech_weekly_inspection',
      'wh_201', 'wh_201_new',
      'consumable_dashboard', 'consumable_new', 'consumable_history',
      'fleet_dashboard', 'fleet_trucks',
      'st_dashboard', 'st_transfer_sheets',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  office_manager: {
    label: 'Office Manager',
    modules: ['dashboard', 'forms_center', 'ops_center', 'ops_morning_brief', 'customers', 'jobs', 'inspections', 'reports', 'estimates', 'invoices', 'material_lists', 'store', 'memberships', 'resources',
      'wh_201', 'wh_201_history',
      'st_dashboard', 'st_event_log', 'st_transfer_sheets',
      'consumable_dashboard', 'consumable_picklist', 'consumable_history',
      'ci_dashboard', 'ci_submit', 'ci_queue', 'ci_my_ideas', 'ci_review_board', 'ci_implemented', 'ci_executive',
      'audit_dashboard', 'audit_templates', 'audit_new', 'audit_queue', 'audit_completed', 'audit_employee_history', 'audit_compliance', 'audit_corrective'],
  },
  csr: {
    label: 'CSR',
    modules: ['dashboard', 'forms_center', 'customers', 'jobs', 'estimates', 'invoices', 'memberships',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  operations_manager: {
    label: 'Operations Manager',
    modules: ['dashboard', 'forms_center', 'ops_center', 'ops_morning_brief', 'customers', 'jobs', 'inspections', 'reports', 'estimates', 'invoices', 'material_lists',
      'wh_dashboard', 'wh_night_before_prep', 'wf_morning_request', 'wh_technicians', 'wh_hardware', 'wh_transfers', 'wh_returns', 'wh_cleanup', 'wh_bins', 'wh_review',
      'wh_201', 'wh_201_verify', 'wh_201_history',
      'fleet_dashboard', 'fleet_trucks', 'fleet_assignments', 'fleet_checkout', 'fleet_readiness', 'fleet_history',
      'st_dashboard', 'st_webhooks', 'st_event_log', 'st_transfer_sheets', 'st_jobs', 'st_purchase_orders', 'st_inventory', 'st_mapping', 'st_failed', 'st_settings', 'st_simulator',
      'consumable_dashboard', 'consumable_new', 'consumable_picklist', 'consumable_history',
      'ci_dashboard', 'ci_submit', 'ci_queue', 'ci_my_ideas', 'ci_review_board', 'ci_implemented', 'ci_executive',
      'audit_dashboard', 'audit_templates', 'audit_new', 'audit_queue', 'audit_completed', 'audit_employee_history', 'audit_compliance', 'audit_corrective'],
  },
  director_of_operations: {
    label: 'Director of Operations',
    modules: ['dashboard', 'forms_center', 'ops_center', 'ops_morning_brief', 'customers', 'jobs', 'inspections', 'reports', 'estimates', 'invoices', 'material_lists',
      'wh_dashboard', 'wh_night_before_prep', 'wh_technicians', 'wh_hardware', 'wh_transfers', 'wh_returns', 'wh_cleanup', 'wh_bins', 'wh_review',
      'wh_201', 'wh_201_verify', 'wh_201_history',
      'fleet_dashboard', 'fleet_trucks', 'fleet_assignments', 'fleet_checkout', 'fleet_readiness', 'fleet_history',
      'st_dashboard', 'st_webhooks', 'st_event_log', 'st_transfer_sheets', 'st_jobs', 'st_purchase_orders', 'st_inventory', 'st_mapping', 'st_failed', 'st_settings', 'st_simulator',
      'consumable_dashboard', 'consumable_new', 'consumable_picklist', 'consumable_history',
      'lvcos_dashboard', 'lvcos_sop', 'lvcos_status', 'lvcos_packs', 'lvcos_project', 'lvcos_kpi',
      'ci_dashboard', 'ci_submit', 'ci_queue', 'ci_my_ideas', 'ci_review_board', 'ci_implemented', 'ci_executive',
      'audit_dashboard', 'audit_templates', 'audit_new', 'audit_queue', 'audit_completed', 'audit_employee_history', 'audit_compliance', 'audit_corrective'],
  },
  admin: {
    label: 'Administrator',
    modules: ALL_MODULE_KEYS,
  },
  owner: {
    label: 'Owner',
    modules: ALL_MODULE_KEYS,
  },
  technician: {
    label: 'Field Technician',
    modules: ['dashboard', 'forms_center', 'tech_inspection', 'tech_reports', 'tech_equipment', 'tech_resources', 'tech_weekly_inspection',
      'wh_201', 'wh_201_new', 'wh_201_history',
      'consumable_dashboard', 'consumable_new', 'consumable_history',
      'st_dashboard', 'st_transfer_sheets',
      'ci_dashboard', 'ci_submit', 'ci_my_ideas'],
  },
  customer: {
    label: 'Customer',
    modules: ['dashboard', 'customer_book', 'customer_jobs', 'customer_reports', 'customer_estimates', 'customer_invoices', 'customer_store', 'customer_membership'],
  },
};

export function getRoleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.customer;
}

/**
 * Returns nav groups for a role, filtered by that role's module permissions.
 * Each group: { label, items: [{ label, path, icon }] }
 */
export function getRoleNav(role) {
  const config = getRoleConfig(role);
  const modules = config.modules || [];
  const groups = {};
  modules.forEach(key => {
    const mod = MODULE_CATALOG[key];
    if (!mod) return;
    if (!groups[mod.group]) groups[mod.group] = [];
    groups[mod.group].push(mod);
  });
  return GROUP_ORDER
    .filter(g => groups[g])
    .map(g => ({ label: g, items: groups[g] }));
}