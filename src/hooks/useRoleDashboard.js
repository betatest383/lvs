import { useState, useEffect } from 'react';
import { loadAdminDashboard } from '@/components/dashboard/loaders/adminLoader';
import { loadTechnicianDashboard } from '@/components/dashboard/loaders/technicianLoader';
import { loadCustomerDashboard } from '@/components/dashboard/loaders/customerLoader';
import { loadWarehouseAssociateDashboard } from '@/components/dashboard/loaders/warehouseAssociateLoader';
import { loadInventorySpecialistDashboard } from '@/components/dashboard/loaders/inventorySpecialistLoader';
import { loadLeadTechnicianDashboard } from '@/components/dashboard/loaders/leadTechnicianLoader';
import { loadApprenticeDashboard } from '@/components/dashboard/loaders/apprenticeLoader';
import { loadOfficeManagerDashboard } from '@/components/dashboard/loaders/officeManagerLoader';
import { loadCsrDashboard } from '@/components/dashboard/loaders/csrLoader';
import { loadOperationsManagerDashboard } from '@/components/dashboard/loaders/operationsManagerLoader';
import { loadDirectorOfOperationsDashboard } from '@/components/dashboard/loaders/directorOfOperationsLoader';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';

/**
 * Role Dashboard Hook — the heart of the Home Screen Framework.
 *
 * Detects the logged-in user's role, loads the appropriate dashboard data,
 * and returns widget-formatted props for HomeScreenLayout.
 *
 * To add a new role:
 *   1. Add an entry to ROLE_CONFIG in roleConfig.js
 *   2. Create a loader in src/components/dashboard/loaders/<role>Loader.js
 *   3. Add an entry to LOADERS below
 */
const LOADERS = {
  admin: loadAdminDashboard,
  technician: loadTechnicianDashboard,
  customer: loadCustomerDashboard,
  warehouse_associate: loadWarehouseAssociateDashboard,
  inventory_specialist: loadInventorySpecialistDashboard,
  lead_technician: loadLeadTechnicianDashboard,
  apprentice: loadApprenticeDashboard,
  office_manager: loadOfficeManagerDashboard,
  csr: loadCsrDashboard,
  operations_manager: loadOperationsManagerDashboard,
  director_of_operations: loadDirectorOfOperationsDashboard,
};

export function useRoleDashboard(user) {
  const [data, setData] = useState({
    kpis: [],
    tasks: [],
    schedule: [],
    quickActions: [],
    recentActivity: [],
  });
  const [loading, setLoading] = useState(true);

  // Use shared identity resolver — EmployeeRegistry.primary_role is the
  // single source of truth, NOT auth user.role.
  const { canonicalRole: role, employee, loading: identityLoading } = useIdentityResolver();

  useEffect(() => {
    if (!user || identityLoading) return;

    const loader = LOADERS[role] || loadCustomerDashboard;
    const loaderUser = { ...user, _employee: employee, _canonicalRole: role };

    loader(loaderUser)
      .then(result => {
        setData(result);
      })
      .catch(() => {
        setData({ kpis: [], tasks: [], schedule: [], quickActions: [], recentActivity: [] });
      })
      .finally(() => setLoading(false));
  }, [user, role, employee, identityLoading]);

  return { ...data, loading };
}