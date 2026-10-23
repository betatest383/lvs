import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Library, Upload, ClipboardCheck } from 'lucide-react';

const navItems = [
  { to: '/resources', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/resources/library', label: 'Resource Library', icon: Library },
  { to: '/resources/upload', label: 'Upload Resources', icon: Upload },
  { to: '/resources/approvals', label: 'Approval Queue', icon: ClipboardCheck },
];

export default function ResourceNav() {
  return (
    <nav className="flex gap-1 border-b bg-card px-6">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}