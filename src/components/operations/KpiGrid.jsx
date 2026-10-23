import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Percent, Ticket, Target, PhoneCall, PackageCheck, Truck, GraduationCap, Zap, Crown, ArrowUp, ArrowDown } from 'lucide-react';

// Config-driven KPI grid — new KPIs can be added here
const KPIS = [
  { name: 'Revenue', value: '$24.5K', target: '$30K', trend: 'up', to: '/admin/invoices', icon: DollarSign },
  { name: 'Gross Margin', value: '42%', target: '45%', trend: 'down', to: '/admin/invoices', icon: Percent },
  { name: 'Avg Ticket', value: '$585', target: '$600', trend: 'down', to: '/admin/estimates', icon: Ticket },
  { name: 'Close Rate', value: '68%', target: '70%', trend: 'up', to: '/admin/estimates', icon: Target },
  { name: 'Callbacks', value: '3', target: '< 5', trend: 'up', to: '/admin/jobs', icon: PhoneCall },
  { name: 'Inv Accuracy', value: '95%', target: '99%', trend: 'down', to: '/warehouse', icon: PackageCheck },
  { name: 'Departure Time', value: '7:42', target: '7:30', trend: 'down', to: '/warehouse', icon: Truck },
  { name: 'Training', value: '82%', target: '90%', trend: 'up', to: '/tech/hr', icon: GraduationCap },
  { name: 'Productivity', value: '$2.4K', target: '$2.5K', trend: 'down', to: '/admin/technicians', icon: Zap },
  { name: 'Membership', value: '12', target: '10', trend: 'up', to: '/admin/memberships', icon: Crown },
];

export default function KpiGrid() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">KPIs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {KPIS.map((kpi) => {
            const isPositive = kpi.trend === 'up';
            return (
              <Link key={kpi.name} to={kpi.to}>
                <div className="rounded-lg border border-border p-3 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-1">
                    <kpi.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {isPositive ? <ArrowUp className="w-3 h-3 text-green-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />}
                  </div>
                  <p className="text-lg font-bold leading-none">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{kpi.name}</p>
                  <p className="text-xs text-muted-foreground/70">Target: {kpi.target}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}