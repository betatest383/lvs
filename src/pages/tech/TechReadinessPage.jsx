import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useTechDashboardData } from '@/hooks/useTechDashboardData';
import TechHeader from '@/components/tech/dashboard/TechHeader';
import Wh105ReadinessCard from '@/components/tech/dashboard/Wh105ReadinessCard';

export default function TechReadinessPage() {
  const {
    employee, user, isImpersonating,
    effectiveEmail, effectiveName, effectiveTruck,
    effectiveRole, effectiveDepartment, effectiveEmployeeId,
  } = useEmployeeContext();

  const { data, loading } = useTechDashboardData({
    email: effectiveEmail,
    fullName: effectiveName,
    assignedTruck: effectiveTruck,
    role: effectiveRole,
    department: effectiveDepartment,
  });

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const canOverride = user && ['admin', 'owner', 'director_of_operations'].includes(user.role);

  return (
    <div className="space-y-5 pb-4">
      <TechHeader
        user={user}
        employeeName={effectiveName}
        isImpersonating={isImpersonating}
        truckNumber={data.truckNumber}
      />
      <Wh105ReadinessCard
        consumableReqs={data.consumableReqs}
        transferSheets={data.transferSheets}
        materialReturns={data.materialReturns}
        equipment={data.equipment}
        truck={data.myTruck}
        truckNumber={data.truckNumber}
        todayJobs={data.todayJobs}
        identity={{
          email: effectiveEmail,
          fullName: effectiveName,
          employeeId: effectiveEmployeeId,
          truckNumber: data.truckNumber,
          isImpersonating,
        }}
        canOverride={canOverride}
        managerName={user?.full_name}
        today={data.today}
      />
    </div>
  );
}