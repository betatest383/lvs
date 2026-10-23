import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, List, UserCog, GraduationCap, Award,
  Package, FileText, TrendingUp, ArrowUpRight, BarChart3, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMPLOYEE_NAV_ITEMS } from '@/lib/employeeRegistryConstants';

const ICONS = { LayoutDashboard, List, UserCog, GraduationCap, Award, Package, FileText, TrendingUp, ArrowUpRight, BarChart3 };

export default function EmployeeNav() {
  const location = useLocation();
  return (
    <div className="border-b bg-card sticky top-0 z-30 pt-safe">
      <div className="flex items-center gap-1 px-3 md:px-6 overflow-x-auto pb-safe">
        <Link to="/lvcos/employees" className="flex items-center gap-2 py-3 pr-4 border-r mr-2 shrink-0">
          <Users className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm hidden sm:inline">Employee Registry</span>
        </Link>
        {EMPLOYEE_NAV_ITEMS.map(item => {
          const Icon = ICONS[item.icon];
          const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap select-none',
                isActive ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}