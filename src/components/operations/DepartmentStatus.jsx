import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Warehouse, Wrench, Briefcase, Users, GraduationCap, Shield, Package } from 'lucide-react';
import { getStatusColor } from '@/hooks/useOperationsData';

// Config-driven — new departments can be added here without code changes
const DEPARTMENTS = [
  { name: 'Sales', path: '/admin/estimates', icon: TrendingUp, status: 'green', kpi: '$24.5K', issues: 0 },
  { name: 'Warehouse', path: '/warehouse', icon: Warehouse, status: 'yellow', kpi: '88% Ready', issues: 2 },
  { name: 'Field Operations', path: '/tech/dashboard', icon: Wrench, status: 'green', kpi: '14 Active', issues: 0 },
  { name: 'Office', path: '/admin/jobs', icon: Briefcase, status: 'green', kpi: '42 Jobs', issues: 0 },
  { name: 'Customer Experience', path: '/admin/customers', icon: Users, status: 'yellow', kpi: '96% CSAT', issues: 2 },
  { name: 'Training', path: '/tech/hr', icon: GraduationCap, status: 'yellow', kpi: '82% Complete', issues: 1 },
  { name: 'Safety', path: '/lvcos/sop-registry', icon: Shield, status: 'green', kpi: '0 Incidents', issues: 0 },
  { name: 'Inventory', path: '/warehouse', icon: Package, status: 'yellow', kpi: '95% Accuracy', issues: 1 },
];

export default function DepartmentStatus() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Department Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DEPARTMENTS.map((d) => {
            const c = getStatusColor(d.status);
            return (
              <Link key={d.name} to={d.path}>
                <div className={`rounded-lg border border-border p-3 hover:shadow-sm transition-all ${c.bg}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <d.icon className="w-4 h-4 text-muted-foreground" />
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  </div>
                  <p className="text-xs font-medium truncate">{d.name}</p>
                  <p className="text-sm font-bold">{d.kpi}</p>
                  {d.issues > 0 && <p className="text-xs text-red-600 mt-0.5">{d.issues} issue{d.issues !== 1 ? 's' : ''}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}