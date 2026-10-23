import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';
import { getRoleConfig } from '@/components/dashboard/roleConfig';
import HomeScreenLayout from '@/components/dashboard/HomeScreenLayout';
import RoleNotificationWidget from '@/components/notifications/RoleNotificationWidget';

/**
 * Role Home Screen — the smart component that ties the framework together.
 *
 * 1. Resolves the user's canonical role via EmployeeRegistry → RoleRegistry
 * 2. Loads the appropriate dashboard data via useRoleDashboard
 * 3. Renders HomeScreenLayout with role-specific widget data
 *
 * Every role sees the same consistent layout:
 *   Top Row → KPIs
 *   Middle Left → Needs My Attention
 *   Middle Right → Schedule
 *   Bottom Left → Quick Actions
 *   Bottom Right → Recent Activity
 */
export default function RoleHomeScreen({ user }) {
  const { canonicalRole: role, loading: identityLoading } = useIdentityResolver();
  const { kpis, tasks, schedule, quickActions, recentActivity, loading } = useRoleDashboard(user);
  const config = getRoleConfig(role);

  if (identityLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = user?.full_name?.split(' ')[0] || '';

  return (
    <>
    <RoleNotificationWidget user={user} />
    <HomeScreenLayout
      roleLabel={config.label}
      userName={firstName}
      kpis={kpis}
      tasks={tasks}
      taskTitle="Needs My Attention"
      taskEmptyMessage="You're all caught up!"
      schedule={schedule}
      scheduleTitle="My Schedule"
      scheduleEmptyMessage="Nothing scheduled"
      quickActions={quickActions}
      quickActionsTitle="Quick Actions"
      recentActivity={recentActivity}
      recentActivityTitle="Recent Activity"
      recentActivityEmptyMessage="No recent activity"
    />
    </>
  );
}