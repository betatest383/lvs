import SidebarLink from './SidebarLink';
import { getRoleNav } from '@/components/dashboard/roleConfig';
import { useNavigationOverrides } from '@/hooks/useNavigationOverrides';
import { useTaskBadge } from '@/hooks/useTaskBadge';

export default function RoleSidebar({ role }) {
  const navGroups = getRoleNav(role);
  const { getVisibility } = useNavigationOverrides();
  const badgeCount = useTaskBadge();

  const visibleGroups = navGroups.map(group => {
    const items = group.items.map(item => ({
      ...item,
      visibility: getVisibility(item.path),
    })).filter(item => item.visibility !== 'hidden_from_sidebar' && item.visibility !== 'access_disabled');
    return { ...group, items };
  }).filter(group => group.items.length > 0);

  return (
    <div className="space-y-1">
      {visibleGroups.map((group, i) => (
        <div key={group.label}>
          <p className={`px-6 py-2 ${i > 0 ? 'mt-4' : ''} text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider`}>
            {group.label}
          </p>
          {group.items.map(item => (
            <SidebarLink
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
              disabled={item.visibility === 'coming_soon'}
              explanation={item.visibility === 'coming_soon' ? 'Coming Soon' : undefined}
              badge={item.path === '/tasks/my-tasks' ? badgeCount : 0}
            />
          ))}
        </div>
      ))}
    </div>
  );
}