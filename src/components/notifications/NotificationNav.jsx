import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Bell, Settings2, ListChecks,
  BarChart3, History, BookOpen,
} from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';

const ALL_NAV_ITEMS = [
  { to: '/notifications', label: 'Dashboard', icon: LayoutDashboard, end: true, restricted: true },
  { to: '/notifications/my', label: 'My Notifications', icon: Bell, restricted: false },
  { to: '/notifications/center', label: 'Notification Center', icon: ListChecks, restricted: true },
  { to: '/notifications/rules', label: 'Rules', icon: BookOpen, restricted: true },
  { to: '/notifications/history', label: 'History', icon: History, restricted: true },
  { to: '/notifications/reports', label: 'Reports', icon: BarChart3, restricted: true },
  { to: '/notifications/settings', label: 'Settings', icon: Settings2, restricted: true },
];

export default function NotificationNav() {
  const { isTech, loading } = useCurrentRole();

  // Technician roles only see My Notifications
  const navItems = (!loading && isTech)
    ? ALL_NAV_ITEMS.filter(item => !item.restricted)
    : ALL_NAV_ITEMS;

  return (
    <div className="flex gap-1 overflow-x-auto border-b pb-px">
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors select-none ${
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`
          }
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}