import { useAuth } from '@/lib/AuthContext';
import { useImpersonation } from '@/lib/ImpersonationContext';

/**
 * Resolves the "active employee" — either the impersonated EmployeeRegistry record
 * (when an admin is acting as a user) or the logged-in employee from AuthContext.
 * All tech dashboard widgets should use this instead of useAuth directly.
 */
export function useEmployeeContext() {
  const { employee: authEmployee, user } = useAuth();
  const { isImpersonating, impersonatedEmployee } = useImpersonation();

  const employee = isImpersonating ? impersonatedEmployee : authEmployee;

  const effectiveEmail = employee?.login_email || employee?.email || user?.email || '';
  const effectiveName = employee
    ? `${employee.preferred_name || employee.first_name} ${employee.last_name}`.trim()
    : user?.full_name || '';
  const effectiveTruck = employee?.assigned_truck || '';
  const effectiveRole = employee?.primary_role || '';
  const effectiveDepartment = employee?.department || '';
  const effectiveEmployeeId = employee?.employee_id || '';

  return {
    employee,
    user,
    isImpersonating,
    effectiveEmail,
    effectiveName,
    effectiveTruck,
    effectiveRole,
    effectiveDepartment,
    effectiveEmployeeId,
  };
}