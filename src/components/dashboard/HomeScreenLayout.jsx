import KpiWidget from './widgets/KpiWidget';
import TaskQueueWidget from './widgets/TaskQueueWidget';
import ScheduleWidget from './widgets/ScheduleWidget';
import QuickActionsWidget from './widgets/QuickActionsWidget';
import RecentActivityWidget from './widgets/RecentActivityWidget';

/**
 * Home Screen Layout — consistent grid layout for every role:
 *   Top Row:         KPIs (role-specific metrics)
 *   Middle Left:     "Needs My Attention" (live work queue)
 *   Middle Right:    Calendar / Schedule / Workload
 *   Bottom Left:     Quick Actions
 *   Bottom Right:    Recent Activity & Notifications
 *
 * Every role's home screen is assembled from the same building blocks.
 */
export default function HomeScreenLayout({
  roleLabel,
  userName,
  kpis = [],
  tasks = [],
  taskTitle,
  taskEmptyMessage,
  schedule = [],
  scheduleTitle,
  scheduleEmptyMessage,
  quickActions = [],
  quickActionsTitle,
  recentActivity = [],
  recentActivityTitle,
  recentActivityEmptyMessage,
}) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{roleLabel} Home Screen</p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent shrink-0">
          {roleLabel}
        </span>
      </div>

      {/* Top Row: KPIs */}
      <KpiWidget kpis={kpis} />

      {/* Middle Row: Task Queue (left) + Schedule (right) */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TaskQueueWidget
          title={taskTitle}
          tasks={tasks}
          emptyMessage={taskEmptyMessage}
        />
        <ScheduleWidget
          title={scheduleTitle}
          items={schedule}
          emptyMessage={scheduleEmptyMessage}
        />
      </div>

      {/* Bottom Row: Quick Actions (left) + Recent Activity (right) */}
      <div className="grid lg:grid-cols-2 gap-4">
        <QuickActionsWidget
          title={quickActionsTitle}
          actions={quickActions}
        />
        <RecentActivityWidget
          title={recentActivityTitle}
          items={recentActivity}
          emptyMessage={recentActivityEmptyMessage}
        />
      </div>
    </div>
  );
}