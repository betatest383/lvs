import { Navigate } from 'react-router-dom';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';
import { isTechRole } from '@/lib/roleUtils';
import RoleHomeScreen from './RoleHomeScreen';
import TechDashboard from './tech/TechDashboard';
import JobHubDaily from './tech/JobHubDaily';
import AccountPending from '@/components/AccountPending';

export default function RoleRouter() {
  const { user, employee, canonicalRole: role, loading, isImpersonating } = useIdentityResolver();

  if (!user) return null;

  // Wait for identity resolution and RoleRegistry to complete
  if (loading) return null;

  // ── Impersonation mode ──
  // When impersonating, the impersonated EmployeeRegistry.primary_role is the
  // single source of truth for dashboard routing — resolved through RoleRegistry.
  if (isImpersonating && employee) {
    if (isTechRole(role)) {
      return <JobHubDaily />;
    }
    if (employee.default_landing_page && employee.default_landing_page !== '/' && employee.default_landing_page !== '') {
      return <Navigate to={employee.default_landing_page} replace />;
    }
    return <RoleHomeScreen user={user} />;
  }

  // No employee linked — show pending screen
  if (!employee) {
    return <AccountPending user={user} isAdmin={user.role === 'admin'} />;
  }

  // Account disabled
  if (employee.account_status === 'Disabled') {
    return <AccountPending user={user} isAdmin={user.role === 'admin'} />;
  }

  // All technician roles land on the Job Hub (daily workflow screen)
  if (isTechRole(role)) {
    return <JobHubDaily />;
  }

  // If employee has a custom default landing page, redirect there
  if (employee.default_landing_page && employee.default_landing_page !== '/' && employee.default_landing_page !== '') {
    return <Navigate to={employee.default_landing_page} replace />;
  }

  // Default: render the role-based home screen
  return <RoleHomeScreen user={user} />;
}