/**
 * Central role normalization and resolution utilities.
 *
 * EmployeeRegistry.primary_role may be stored as "Lead Technician", "lead technician",
 * "lead_technician", "ROLE-003", etc. This module normalizes all variants to a single
 * canonical key so sidebar routing, mobile nav, and dashboards all agree.
 */

export const TECH_ROLES = ['technician', 'lead_technician', 'service_technician', 'apprentice'];

/**
 * Normalize a role string to canonical snake_case form.
 * "Lead Technician" → "lead_technician"
 * "lead technician" → "lead_technician"
 * "LeadTechnician"  → "leadtechnician" (rare, but won't break — just won't match)
 */
export function normalizeRole(rawRole) {
  if (!rawRole) return '';
  return String(rawRole)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

/**
 * Returns true if the role (raw or normalized) is a technician-class role.
 */
export function isTechRole(rawRole) {
  return TECH_ROLES.includes(normalizeRole(rawRole));
}

/**
 * Determine which sidebar component will be used for a given role.
 * Returns a human-readable label for the Developer Info Panel.
 */
const WAREHOUSE_ROLES = ['warehouse_manager', 'warehouse_associate', 'inventory_specialist'];

export function getSidebarConfigLabel(normalizedRole) {
  if (normalizedRole === 'admin') return 'AdminSidebar';
  if (TECH_ROLES.includes(normalizedRole)) return 'TechSidebar';
  if (normalizedRole === 'customer') return 'CustomerSidebar';
  if (WAREHOUSE_ROLES.includes(normalizedRole)) return 'WarehouseSidebar';
  return 'RoleSidebar';
}

/**
 * Determine which dashboard component will be used for a given role.
 */
export function getDashboardConfigLabel(normalizedRole) {
  if (TECH_ROLES.includes(normalizedRole)) return 'TechDashboard';
  if (normalizedRole === 'admin') return 'AdminDashboard';
  if (normalizedRole === 'customer') return 'CustomerDashboard';
  if (WAREHOUSE_ROLES.includes(normalizedRole)) return 'WarehouseDashboard';
  return 'RoleHomeScreen';
}

/**
 * Returns the permission profile label for a role.
 */
export function getPermissionProfileLabel(normalizedRole) {
  const PROFILES = {
    admin: 'admin',
    owner: 'executive',
    director_of_operations: 'executive',
    operations_manager: 'manager',
    office_manager: 'manager',
    warehouse_manager: 'warehouse_manager',
    lead_technician: 'elevated',
    technician: 'standard',
    service_technician: 'standard',
    apprentice: 'standard',
    csr: 'standard',
    warehouse_associate: 'standard',
    inventory_specialist: 'standard',
    customer: 'view_only',
  };
  return PROFILES[normalizedRole] || 'standard';
}

/**
 * Roles that do not require a truck assignment.
 * Warehouse and inventory roles work in the warehouse, not from a truck.
 */
const ROLES_WITHOUT_TRUCK = ['warehouse_manager', 'warehouse_associate', 'inventory_specialist'];

export function isTruckRequiredForRole(canonicalRole) {
  if (!canonicalRole) return true;
  return !ROLES_WITHOUT_TRUCK.includes(canonicalRole);
}

/**
 * Roles that may override the auto-assigned truck on a job/appointment.
 * Managers, Admins, and Dispatchers can manually select a different truck.
 */
const TRUCK_OVERRIDE_ROLES = [
  'admin',
  'owner',
  'director_of_operations',
  'operations_manager',
  'office_manager',
  'dispatcher',
];

export function canOverrideTruck(canonicalRole) {
  if (!canonicalRole) return false;
  return TRUCK_OVERRIDE_ROLES.includes(canonicalRole);
}

/**
 * Roles that may override assignment conflicts (overlapping time windows).
 * Managers, Admins, and Dispatchers can force-save conflicting assignments.
 */
const CONFLICT_OVERRIDE_ROLES = [
  'admin',
  'owner',
  'director_of_operations',
  'operations_manager',
  'office_manager',
  'dispatcher',
];

export function canOverrideConflict(canonicalRole) {
  if (!canonicalRole) return false;
  return CONFLICT_OVERRIDE_ROLES.includes(canonicalRole);
}

/**
 * Capability map for Product Resource management.
 * Roles with '*' have all resource capabilities.
 * Arrays grant specific capability keys (e.g. 'resource.manage').
 * Roles not listed default to read-only (no capabilities).
 */
const RESOURCE_CAPABILITIES = {
  admin: '*',
  owner: '*',
  warehouse_manager: '*',
  warehouse_associate: ['resource.manage'],
};

/**
 * Returns true if the canonical role key has the requested resource capability.
 * Defaults to false for null/unknown roles — callers see read-only while
 * the role is still resolving via useCurrentRole().
 */
export function hasResourceCapability(canonicalRole, capability) {
  if (!canonicalRole) return false;
  const caps = RESOURCE_CAPABILITIES[canonicalRole];
  if (!caps) return false;
  if (caps === '*') return true;
  return caps.includes(capability);
}

/**
 * Resolve a raw role reference (role_id or role_name) to a canonical role key
 * using RoleRegistry records.
 *
 * "ROLE-004" → looks up RoleRegistry → finds "Warehouse Manager" → "warehouse_manager"
 * "Warehouse Manager" → "warehouse_manager" (direct name match)
 * "lead_technician" → "lead_technician" (already canonical, no registry match needed)
 *
 * Returns { roleId, roleName, canonicalRoleKey, record }
 */
export function resolveRoleFromRegistry(rawRole, registryRecords) {
  if (!rawRole) return { roleId: null, roleName: null, canonicalRoleKey: '', record: null };

  const normalized = normalizeRole(rawRole);

  if (registryRecords && registryRecords.length > 0) {
    // Try exact role_id match (e.g., "ROLE-004")
    let match = registryRecords.find(r => r.role_id === rawRole);
    // Try normalized role_id match (e.g., "role_004" matching "ROLE-004")
    if (!match) match = registryRecords.find(r => normalizeRole(r.role_id) === normalized);
    // Try role_name match (in case rawRole is already a name like "Warehouse Manager")
    if (!match) match = registryRecords.find(r => normalizeRole(r.role_name) === normalized);

    if (match) {
      return {
        roleId: match.role_id,
        roleName: match.role_name,
        canonicalRoleKey: normalizeRole(match.role_name),
        record: match,
      };
    }
  }

  // Fallback: just normalize the raw role
  return {
    roleId: null,
    roleName: null,
    canonicalRoleKey: normalized,
    record: null,
  };
}