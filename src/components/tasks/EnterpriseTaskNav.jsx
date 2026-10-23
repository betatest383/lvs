import { Link, useLocation } from 'react-router-dom';
import {
  ListChecks, LayoutDashboard, User, Building2, List, Calendar, CalendarDays,
  AlertTriangle, Ban, Eye, Clock, RotateCcw, CheckCircle2, Repeat,
  BarChart3, Settings, Users, FileEdit, ShieldAlert, Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { useTaskBadge } from '@/hooks/useTaskBadge';

const ALL_NAV_ITEMS = [
  { to: '/tasks', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/my-tasks', label: 'My Tasks', icon: User, roles: null },
  { to: '/tasks/calendar', label: 'Work Calendar', icon: CalendarDays, roles: null },
  { to: '/tasks/created-by-me', label: 'Created by Me', icon: FileEdit, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/team-queue', label: 'Team Queue', icon: Users, roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'] },
  { to: '/tasks/registry', label: 'Registry', icon: List, roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'] },
  { to: '/tasks/due-today', label: 'Due Today', icon: Calendar, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/overdue', label: 'Overdue', icon: AlertTriangle, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/blocked', label: 'Blocked', icon: Ban, roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'] },
  { to: '/tasks/awaiting-review', label: 'Awaiting Review', icon: Eye, roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'] },
  { to: '/tasks/awaiting-approval', label: 'Awaiting Approval', icon: Clock, roles: ['admin', 'owner', 'director_of_operations', 'operations_manager'] },
  { to: '/tasks/changes-requested', label: 'Changes Requested', icon: RotateCcw, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/completed', label: 'Completed', icon: CheckCircle2, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/recurring', label: 'Recurring', icon: Repeat, roles: ['admin', 'owner', 'director_of_operations', 'warehouse_manager', 'operations_manager'] },
  { to: '/tasks/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'owner', 'director_of_operations'] },
  { to: '/tasks/data-review', label: 'Data Review', icon: ShieldAlert, roles: ['admin', 'owner'] },
  { to: '/tasks/orchestration', label: 'Orchestration', icon: Brain, roles: ['admin', 'owner', 'director_of_operations'] },
  { to: '/tasks/settings', label: 'Settings', icon: Settings, roles: ['admin', 'owner'] },
];

export default function EnterpriseTaskNav() {
  const location = useLocation();
  const { role, isTech, loading } = useCurrentRole();
  const badgeCount = useTaskBadge();

  // Technician roles only see My Tasks
  const navItems = (!loading && isTech)
    ? ALL_NAV_ITEMS.filter(item => item.roles === null)
    : ALL_NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));

  const brandLink = (!loading && isTech) ? '/tasks/my-tasks' : '/tasks';

  return (
    <div className="border-b bg-card sticky top-0 z-30 pt-safe">
      <div className="flex items-center gap-1 px-3 md:px-6 overflow-x-auto pb-safe">
        <Link to={brandLink} className="flex items-center gap-2 py-3 pr-4 border-r mr-2 shrink-0">
          <ListChecks className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm hidden sm:inline">Task Center</span>
        </Link>
        {navItems.map(item => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap select-none',
                isActive ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              {item.to === '/tasks/my-tasks' && badgeCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold leading-none">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}