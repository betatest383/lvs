import { useAuth } from '@/lib/AuthContext';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useRoleRegistry } from '@/hooks/useRoleRegistry';
import { resolveRoleFromRegistry, isTechRole } from '@/lib/roleUtils';
import { getRoleConfig } from '@/components/dashboard/roleConfig';
import { getSidebarConfigLabel, getDashboardConfigLabel, getPermissionProfileLabel } from '@/lib/roleUtils';

/**
 * SHARED IDENTITY RESOLVER — single source of truth for both
 * direct login and impersonation.
 *
 * Direct login:  auth user → EmployeeRegistry (via resolveUserIdentity) → primary_role → RoleRegistry
 * Impersonation: impersonatedEmployee → primary_role → RoleRegistry
 *
 * Both paths resolve to the same EmployeeRegistry record and same canonical role.
 */
export function useIdentityResolver() {
  const { user, employee, identityResolved } = useAuth();
  const { isImpersonating, impersonatedEmployee } = useImpersonation();
  const { registry: roleRegistry, loading: registryLoading } = useRoleRegistry();

  const loading = !identityResolved || registryLoading;

  // The source employee — impersonated if impersonating, otherwise the linked employee
  const sourceEmployee = (isImpersonating && impersonatedEmployee) ? impersonatedEmployee : employee;

  // Raw role from EmployeeRegistry.primary_role (NOT auth user.role)
  const rawRole = sourceEmployee?.primary_role || user?.role || '';

  // Resolve through RoleRegistry to canonical key
  const roleResolution = resolveRoleFromRegistry(rawRole, roleRegistry);
  const canonicalRoleKey = roleResolution.canonicalRoleKey;

  const roleConfig = getRoleConfig(canonicalRoleKey);

  // Determine dashboard route
  let dashboardRoute;
  if (isTechRole(canonicalRoleKey)) {
    dashboardRoute = 'TechDashboard';
  } else if (canonicalRoleKey === 'admin') {
    dashboardRoute = 'AdminDashboard';
  } else if (roleConfig.dashboard) {
    dashboardRoute = roleConfig.dashboard;
  } else {
    dashboardRoute = getDashboardConfigLabel(canonicalRoleKey);
  }

  // Determine landing page
  let landingPage = sourceEmployee?.default_landing_page && sourceEmployee.default_landing_page !== '/' && sourceEmployee.default_landing_page !== ''
    ? sourceEmployee.default_landing_page
    : (roleConfig.landingPage && roleConfig.landingPage !== '/' ? roleConfig.landingPage : '/');

  // Determine sidebar config
  const sidebarConfig = getSidebarConfigLabel(canonicalRoleKey);

  // Permission profile
  const permissionProfile = getPermissionProfileLabel(canonicalRoleKey);

  // Full resolution chain for debugging
  const resolutionChain = {
    mode: isImpersonating ? 'impersonation' : 'direct_login',
    auth_user_id: user?.id,
    auth_email: user?.email,
    auth_full_name: user?.full_name,
    auth_role: user?.role,
    employee_match_method: isImpersonating
      ? 'impersonated_employee (admin-selected)'
      : (sourceEmployee?.linked_user_id === user?.id ? 'linked_user_id' : sourceEmployee?.login_email === user?.email ? 'login_email' : sourceEmployee?.email === user?.email ? 'email' : 'none'),
    employee_record_id: sourceEmployee?.id,
    employee_id: sourceEmployee?.employee_id,
    employee_email: sourceEmployee?.email,
    employee_login_email: sourceEmployee?.login_email,
    linked_user_id: sourceEmployee?.linked_user_id,
    account_status: sourceEmployee?.account_status,
    invitation_status: sourceEmployee?.invitation_status,
    primary_role_raw: sourceEmployee?.primary_role,
    role_registry_match: roleResolution.record ? `${roleResolution.roleId} → ${roleResolution.roleName}` : null,
    role_registry_matched: !!roleResolution.record,
    canonical_role_key: canonicalRoleKey,
    department: sourceEmployee?.department,
    permission_profile: permissionProfile,
    dashboard_route: dashboardRoute,
    sidebar_config: sidebarConfig,
    landing_page: landingPage,
    fallback_used: !sourceEmployee?.primary_role ? 'auth_user_role' : null,
    cached_data_used: null,
  };

  return {
    user,
    employee: sourceEmployee,
    canonicalRole: canonicalRoleKey,
    isTech: isTechRole(canonicalRoleKey),
    rawRole,
    roleResolution,
    roleConfig,
    dashboardRoute,
    sidebarConfig,
    landingPage,
    permissionProfile,
    resolutionChain,
    loading,
    isImpersonating,
  };
}