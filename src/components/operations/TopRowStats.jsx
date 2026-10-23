import { Link } from 'react-router-dom';
import { Gauge, DollarSign, CalendarCheck, CheckCircle2, Star, GraduationCap, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getHealthColor } from '@/hooks/useOperationsData';

export default function TopRowStats({ data }) {
  const healthColor = getHealthColor(data.healthScore);
  const stats = [
    { label: 'Health Score', value: `${data.healthScore}%`, icon: Gauge, to: '/operations', color: healthColor.text, bg: healthColor.bg },
    { label: "Today's Revenue", value: `$${(data.todayRevenue / 1000).toFixed(1)}K`, icon: DollarSign, to: '/admin/invoices', color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Jobs Today', value: data.jobsScheduledToday, icon: CalendarCheck, to: '/admin/jobs', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Completed', value: data.jobsCompleted, icon: CheckCircle2, to: '/admin/jobs', color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'CSAT', value: `${data.customerSatisfaction}%`, icon: Star, to: '/admin/customers', color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Training', value: `${data.trainingCompletion}%`, icon: GraduationCap, to: '/tech/hr', color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Critical Issues', value: data.openCriticalIssues, icon: AlertTriangle, to: '/operations', color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {stats.map((s) => (
        <Link key={s.label} to={s.to}>
          <Card className="hover:shadow-md transition-shadow h-full">
            <CardContent className="p-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.bg}`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-xl font-bold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}