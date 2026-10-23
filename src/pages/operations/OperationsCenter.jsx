import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useOperationsData } from '@/hooks/useOperationsData';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useAuth } from '@/lib/AuthContext';
import EmployeeIdentityHeader from '@/components/shared/EmployeeIdentityHeader';
import { Sun, Gauge } from 'lucide-react';
import TopRowStats from '@/components/operations/TopRowStats';
import CompanyHealthCard from '@/components/operations/CompanyHealthCard';
import DepartmentStatus from '@/components/operations/DepartmentStatus';
import BusinessProcessLibrary from '@/components/operations/BusinessProcessLibrary';
import NeedsAttention from '@/components/operations/NeedsAttention';
import OperationalTimeline from '@/components/operations/OperationalTimeline';
import KpiGrid from '@/components/operations/KpiGrid';
import QuickLaunch from '@/components/operations/QuickLaunch';
import RecentActivity from '@/components/operations/RecentActivity';
import AiInsights from '@/components/operations/AiInsights';
import CompanyNotificationsWidget from '@/components/notifications/CompanyNotificationsWidget';
import ActiveImpersonationsWidget from '@/components/admin/ActiveImpersonationsWidget';

export default function OperationsCenter() {
  const { data, loading } = useOperationsData();
  const { user: authUser } = useAuth();
  const {
    employee, user, isImpersonating,
    effectiveName, effectiveRole, effectiveEmployeeId,
    effectiveDepartment, effectiveTruck,
  } = useEmployeeContext();

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmployeeIdentityHeader
        employee={employee}
        user={authUser || user}
        isImpersonating={isImpersonating}
        effectiveName={effectiveName}
        effectiveRole={effectiveRole}
        effectiveEmployeeId={effectiveEmployeeId}
        effectiveDepartment={effectiveDepartment}
        effectiveTruck={effectiveTruck}
        equipmentPackage={employee?.assigned_equipment_package}
        lastLogin={employee?.last_login}
        accountStatus={employee?.account_status}
        employeeDetailLink={employee?.id ? `/lvcos/employees/detail/${employee.id}` : undefined}
        showDeveloperMode={isImpersonating}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gauge className="w-6 h-6 text-accent" /> Operations Center
          </h1>
          <p className="text-muted-foreground text-sm">Executive command center for LVC Operating System</p>
        </div>
        <Link to="/operations/morning-brief">
          <Button variant="outline" size="sm">
            <Sun className="w-4 h-4 mr-2 text-accent" /> Morning Brief
          </Button>
        </Link>
      </div>

      {/* Active Impersonations */}
      <ActiveImpersonationsWidget />

      {/* Top Row Stats */}
      <TopRowStats data={data} />

      {/* Company Notifications */}
      <CompanyNotificationsWidget />

      {/* Health + Department Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompanyHealthCard data={data} />
        <DepartmentStatus />
      </div>

      {/* Business Process Library */}
      <BusinessProcessLibrary data={data} />

      {/* Needs Attention + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeedsAttention data={data} />
        <OperationalTimeline />
      </div>

      {/* KPIs + Quick Launch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KpiGrid />
        <QuickLaunch />
      </div>

      {/* Recent Activity + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity />
        <AiInsights />
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Every metric is clickable — drill down from Business Process → SOP → Workflow → Dashboard → Record.
      </p>
    </div>
  );
}