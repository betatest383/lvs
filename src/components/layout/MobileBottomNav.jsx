import { Link, useLocation } from 'react-router-dom';
import { normalizeRole } from '@/lib/roleUtils';
import { useTaskBadge } from '@/hooks/useTaskBadge';
import {
  LayoutDashboard, Briefcase, FileText, User,
  ClipboardList, ArrowLeftRight, MapPin, Undo2,
  BookOpen, Receipt, Warehouse, PackageCheck,
  Sunrise, CheckSquare, Bell, Truck, Wrench,
} from 'lucide-react';

const TAB_CONFIG = {
  admin: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/admin/reports', icon: FileText, label: 'Reports' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  technician: [
    { to: '/', icon: LayoutDashboard, label: 'Job Hub' },
    { to: '/tech/dashboard', icon: Briefcase, label: 'Jobs' },
    { to: '/tasks/my-tasks', icon: CheckSquare, label: 'Tasks' },
    { to: '/tech/messages', icon: Bell, label: 'Messages' },
  ],
  customer: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/customer/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/customer/reports', icon: FileText, label: 'Reports' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  warehouse_associate: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/warehouse/hardware-checklists', icon: ClipboardList, label: 'Hardware' },
    { to: '/warehouse/transfer-sheets', icon: ArrowLeftRight, label: 'Transfers' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  inventory_specialist: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/warehouse/bin-requests', icon: MapPin, label: 'Bins' },
    { to: '/warehouse/returned-materials', icon: Undo2, label: 'Returns' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  lead_technician: [
    { to: '/', icon: LayoutDashboard, label: 'Job Hub' },
    { to: '/tech/dashboard', icon: Briefcase, label: 'Jobs' },
    { to: '/tasks/my-tasks', icon: CheckSquare, label: 'Tasks' },
    { to: '/tech/messages', icon: Bell, label: 'Messages' },
  ],
  apprentice: [
    { to: '/', icon: LayoutDashboard, label: 'Job Hub' },
    { to: '/tech/dashboard', icon: Briefcase, label: 'Jobs' },
    { to: '/tasks/my-tasks', icon: CheckSquare, label: 'Tasks' },
    { to: '/tech/equipment', icon: Wrench, label: 'Gear' },
  ],
  office_manager: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/admin/invoices', icon: Receipt, label: 'Invoices' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  csr: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/admin/estimates', icon: FileText, label: 'Estimates' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  operations_manager: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/warehouse', icon: Warehouse, label: 'Warehouse' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
  director_of_operations: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/reports', icon: FileText, label: 'Reports' },
    { to: '/lvcos/process-packs', icon: PackageCheck, label: 'Packs' },
    { to: '/profile', icon: User, label: 'Profile' },
  ],
};

export default function MobileBottomNav({ role: rawRole }) {
  const location = useLocation();
  const role = normalizeRole(rawRole);
  const tabs = TAB_CONFIG[role] || TAB_CONFIG.customer;
  const badgeCount = useTaskBadge();

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border select-none mobile-bottom-nav">
      <div className="flex items-center justify-around h-14 pb-safe">
        {tabs.map(tab => {
          const active = isActive(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors ${
                active ? 'text-accent' : 'text-muted-foreground'
              }`}
            >
              <tab.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.to === '/tasks/my-tasks' && badgeCount > 0 && (
                <span className="absolute top-0 right-1/4 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold leading-none">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}