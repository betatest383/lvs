import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, PlusCircle, UserCheck, PackageCheck, Clock, Wrench, History, ClipboardCheck, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/equipment', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/equipment/master', label: 'Equipment Master', icon: Package },
  { to: '/equipment/add', label: 'Add Equipment', icon: PlusCircle },
  { to: '/equipment/assign', label: 'Assign Equipment', icon: UserCheck },
  { to: '/equipment/packages', label: 'Packages', icon: PackageCheck },
  { to: '/equipment/checkouts', label: 'Temporary Checkouts', icon: Clock },
  { to: '/equipment/repairs', label: 'Repairs', icon: Wrench },
  { to: '/equipment/history', label: 'Asset History', icon: History },
  { to: '/equipment/audits', label: 'Audits', icon: ClipboardCheck },
  { to: '/equipment/reports', label: 'Reports', icon: BarChart3 },
];

export default function EquipmentNav() {
  return (
    <div className="border-b bg-card sticky top-0 z-10 mobile-header">
      <div className="flex gap-1 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'thin' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}