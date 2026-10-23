import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useTechDashboardData } from '@/hooks/useTechDashboardData';
import { normalizeRole, getSidebarConfigLabel, getDashboardConfigLabel, getPermissionProfileLabel } from '@/lib/roleUtils';
import EmployeeIdentityHeader from '@/components/shared/EmployeeIdentityHeader';
import DeveloperInfoPanel from '@/components/tech/dashboard/DeveloperInfoPanel';
import MorningWorkflowCard from '@/components/tech/dashboard/MorningWorkflowCard';
import MaterialTransfersCard from '@/components/tech/dashboard/MaterialTransfersCard';
import DailyEquipmentCard from '@/components/tech/dashboard/DailyEquipmentCard';
import TodaysJobEquipmentCard from '@/components/tech/dashboard/TodaysJobEquipmentCard';
import TodayJobsList from '@/components/tech/dashboard/TodayJobsList';
import NeedsAttention from '@/components/tech/dashboard/NeedsAttention';
import TruckStatusCard from '@/components/tech/dashboard/TruckStatusCard';
import PerformanceCard from '@/components/tech/dashboard/PerformanceCard';
import TechnicianTimeline from '@/components/tech/dashboard/TechnicianTimeline';
import TechNotificationsCard from '@/components/notifications/TechNotificationsCard';
import MyTasksCard from '@/components/tech/dashboard/MyTasksCard';
import { isUnread } from '@/lib/notificationConstants';

export default function TechDashboard({ user: propUser }) {
  const navigate = useNavigate();
  const {
    employee, user: authUser, isImpersonating,
    effectiveEmail, effectiveName, effectiveTruck,
    effectiveRole, effectiveDepartment, effectiveEmployeeId,
  } = useEmployeeContext();
  const { impersonation, endImpersonation } = useImpersonation();
  const [testMode, setTestMode] = useState(false);

  const user = propUser || authUser;

  const { data, loading } = useTechDashboardData({
    employee,
    email: effectiveEmail,
    fullName: effectiveName,
    assignedTruck: employee?.assigned_truck || effectiveTruck,
    role: effectiveRole,
    department: effectiveDepartment,
    employeePackageId: employee?.assigned_equipment_package,
    employeeId: employee?.employee_id,
    servicetitanEmployeeId: employee?.servicetitan_employee_id,
  });

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const isApprentice = (effectiveRole || user.role || '').toLowerCase().includes('apprentice');
  const canOverride = user && ['admin', 'owner', 'director_of_operations'].includes(user.role);
  const canSeeDevPanel = user && ['admin', 'owner', 'director_of_operations'].includes(user.role);

  const identity = {
    email: effectiveEmail,
    fullName: effectiveName,
    employeeId: effectiveEmployeeId,
    truckNumber: data.truckNumber,
    isImpersonating,
  };

  // Data source validation
  const dataSources = {
    employeeRegistry: !!employee,
    roleRegistry: !!effectiveRole,
    equipment: data.equipment.length > 0,
    equipmentPackage: !!data.myEquipmentPackage,
    fleet: !!data.myTruck,
    tasks: data.myTasks.length > 0,
    notifications: data.myNotifications.length > 0,
    wh105: true,
    training: !!employee,
    certifications: !!employee,
    policies: !!employee,
  };

  // Unread notifications count
  const unreadCount = data.myNotifications.filter(n =>
    n.status !== 'Cancelled' && n.status !== 'Expired' && !n.is_archived && isUnread(n)
  ).length;

  return (
    <div className="space-y-5 pb-4">
      {/* 1. Identity */}
      <EmployeeIdentityHeader
        employee={employee}
        user={user}
        isImpersonating={isImpersonating}
        effectiveName={effectiveName}
        effectiveRole={effectiveRole}
        effectiveEmployeeId={effectiveEmployeeId}
        effectiveDepartment={effectiveDepartment}
        effectiveTruck={effectiveTruck}
        equipmentPackage={employee?.assigned_equipment_package}
        todayJobsCount={data.todayJobs.length}
        readinessStatus={data.wh105Status || '—'}
        lastLogin={employee?.last_login}
        accountStatus={employee?.account_status}
        resolvedTruck={data.myTruck}
        resolvedEquipmentPackage={data.myEquipmentPackage}
        truckLink="/tech/truck"
        equipmentLink="/tech/equipment"
        jobsLink="/tech/dashboard"
        readinessLink="/tech/readiness"
        onOpenProfile={() => navigate('/profile')}
      />

      {/* Developer Info Panel (admin + impersonation only) */}
      {canSeeDevPanel && isImpersonating && (
        <DeveloperInfoPanel
          actualUser={user}
          employee={employee}
          isImpersonating={isImpersonating}
          effectiveEmail={effectiveEmail}
          effectiveName={effectiveName}
          effectiveRole={effectiveRole}
          effectiveDepartment={effectiveDepartment}
          effectiveEmployeeId={effectiveEmployeeId}
          effectiveTruck={effectiveTruck}
          equipmentPackage={employee?.assigned_equipment_package}
          resolvedTruck={data.myTruck}
          resolvedEquipmentPackage={data.myEquipmentPackage}
          lastLogin={employee?.last_login}
          todayJobsCount={data.todayJobs.length}
          todayJobsQuery={data.jobsQueryCriteria}
          truckResolutionInfo={data.truckResolutionInfo}
          jobsResolutionInfo={data.jobsResolutionInfo}
          tasksResolutionInfo={data.tasksResolutionInfo}
          equipmentPackageResolutionInfo={data.equipmentPackageResolutionInfo}
          wh105RecordId={data.wh105RecordId}
          wh105Status={data.wh105Status}
          taskCount={data.myTasks.length}
          unreadNotificationCount={unreadCount}
          dataSources={dataSources}
          onRefresh={() => window.location.reload()}
          onEndImpersonation={endImpersonation}
          testMode={testMode}
          onToggleTestMode={() => setTestMode(!testMode)}
          impersonationStartedAt={impersonation?.startTime}
          resolvedRole={normalizeRole(effectiveRole)}
          sidebarConfigUsed={getSidebarConfigLabel(normalizeRole(effectiveRole))}
          dashboardConfigUsed={getDashboardConfigLabel(normalizeRole(effectiveRole))}
          permissionProfileUsed={getPermissionProfileLabel(normalizeRole(effectiveRole))}
        />
      )}

      {/* 2. Today's Jobs */}
      <TodayJobsList jobs={data.todayJobs} customerMap={data.customerMap} />

      {/* 3. Morning Workflow */}
      <MorningWorkflowCard
        consumableReqs={data.consumableReqs}
        transferSheets={data.transferSheets}
        materialReturns={data.materialReturns}
        equipment={data.equipment}
        truck={data.myTruck}
        truckNumber={data.truckNumber}
        todayJobs={data.todayJobs}
        identity={identity}
        canOverride={canOverride}
        managerName={user?.full_name}
        today={data.today}
        myTasks={data.myTasks}
        myNotifications={data.myNotifications}
      />

      {/* 4. Material Transfers */}
      <MaterialTransfersCard
        transferSheets={data.transferSheets}
        materialReturns={data.materialReturns}
        truckNumber={data.truckNumber}
      />

      {/* 5. Equipment */}
      <div className="grid sm:grid-cols-2 gap-4">
        <DailyEquipmentCard equipment={data.equipment} />
        <TodaysJobEquipmentCard equipment={data.equipment} user={user} truckNumber={data.truckNumber} todayJobs={data.todayJobs} />
      </div>

      {/* 6. Truck */}
      <TruckStatusCard truck={data.myTruck} equipment={data.equipment} materialReturns={data.materialReturns} />

      {/* 7. Tasks + 8. Notifications */}
      <div className="grid lg:grid-cols-2 gap-4">
        <MyTasksCard employee={employee} />
        <TechNotificationsCard
          employee={employee}
          isImpersonating={isImpersonating}
        />
      </div>

      {/* 9. Needs Attention */}
      <NeedsAttention
        wh105Status={data.wh105Status}
        transferSheets={data.transferSheets}
        consumableReqs={data.consumableReqs}
        correctiveActions={data.correctiveActions}
        equipment={data.equipment}
        materialReturns={data.materialReturns}
        tasks={data.myTasks}
        notifications={data.myNotifications}
      />

      {/* 10. Performance + 11. Timeline */}
      <div className="grid lg:grid-cols-2 gap-4">
        <PerformanceCard
          todayJobs={data.todayJobs}
          allJobs={data.allMyJobs}
          equipment={data.equipment}
        />
        <TechnicianTimeline
          transferSheets={data.transferSheets}
          consumableReqs={data.consumableReqs}
          materialReturns={data.materialReturns}
          jobs={data.allMyJobs}
          equipment={data.equipment}
          wh105Status={data.wh105Status}
        />
      </div>
    </div>
  );
}