import { useAuth } from '@/lib/AuthContext';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useRoleRegistry } from '@/hooks/useRoleRegistry';
import { resolveRoleFromRegistry, isTechRole } from '@/lib/roleUtils';

/**
 * Resolves the current user's canonical role key.
 * Accounts for impersonation mode — when impersonating, the impersonated
 * employee's primary_role is the source of truth.
 */
export function useCurrentRole() {
  const { user, employee, identityResolved } = useAuth();
  const { isImpersonating, impersonatedEmployee } = useImpersonation();
  const { registry, loading } = useRoleRegistry();

  if (!identityResolved || loading) {
    return { role: null, loading: true, isTech: false, isLeadTech: false, employee: null };
  }

  const sourceEmployee = (isImpersonating && impersonatedEmployee) ? impersonatedEmployee : employee;
  const rawRole = sourceEmployee?.primary_role || user?.role || '';
  const { canonicalRoleKey } = resolveRoleFromRegistry(rawRole, registry);

  return {
    role: canonicalRoleKey,
    loading: false,
    isTech: isTechRole(canonicalRoleKey),
    isLeadTech: canonicalRoleKey === 'lead_technician',
    employee: sourceEmployee,
  };
}