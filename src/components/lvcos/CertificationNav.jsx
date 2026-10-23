import { Link, useLocation } from 'react-router-dom';
import { Award, LayoutDashboard, Network, Grid3x3, BarChart3, List, CalendarClock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/lvcos/certifications', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/lvcos/certifications/registry', label: 'Certification Registry', icon: List },
  { to: '/lvcos/certifications/employees', label: 'Employee Certs', icon: Users },
  { to: '/lvcos/certifications/expiration', label: 'Expiration Tracker', icon: CalendarClock },
  { to: '/lvcos/certifications/matrix', label: 'Cert Matrix', icon: Grid3x3 },
  { to: '/lvcos/certifications/relationships', label: 'Relationships', icon: Network },
  { to: '/lvcos/certifications/reports', label: 'Reports', icon: BarChart3 },
];

export default function CertificationNav() {
  const location = useLocation();
  return (
    <div className="border-b bg-card sticky top-0 z-30 pt-safe">
      <div className="flex items-center gap-1 px-3 md:px-6 overflow-x-auto pb-safe">
        <Link to="/lvcos/certifications" className="flex items-center gap-2 py-3 pr-4 border-r mr-2 shrink-0">
          <Award className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm hidden sm:inline">Certification Registry</span>
        </Link>
        {NAV_ITEMS.map(item => {
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}