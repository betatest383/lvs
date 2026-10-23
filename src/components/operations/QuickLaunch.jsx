import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Warehouse, Briefcase, Wrench, Users, Database, PackageCheck, KanbanSquare, FileText, ExternalLink } from 'lucide-react';

// Config-driven — future modules can be added here without redesign
const QUICK_LINKS = [
  { label: 'Warehouse', path: '/warehouse', icon: Warehouse },
  { label: 'Dispatch', path: '/admin/jobs', icon: Briefcase },
  { label: 'Technicians', path: '/admin/technicians', icon: Wrench },
  { label: 'Customer Portal', path: '/admin/customers', icon: Users },
  { label: 'LVC OS Registry', path: '/lvcos', icon: Database },
  { label: 'Process Packs', path: '/lvcos/process-packs', icon: PackageCheck },
  { label: 'Status Board', path: '/lvcos/status-board', icon: KanbanSquare },
  { label: 'Reports', path: '/admin/reports', icon: FileText },
  { label: 'ServiceTitan', path: 'https://app.servicetitan.com', icon: ExternalLink, external: true },
];

export default function QuickLaunch() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Quick Launch</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.path}
              {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 hover:border-accent transition-all">
                <link.icon className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm font-medium truncate">{link.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}