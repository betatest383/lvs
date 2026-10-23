import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, DollarSign, Clock } from 'lucide-react';

export default function ScheduleSummary({ todayJobs, estimates }) {
  const todayJobIds = new Set(todayJobs.map(j => j.id));
  const estRevenue = estimates
    .filter(e => todayJobIds.has(e.job_id))
    .reduce((sum, e) => sum + (e.total || 0), 0);

  const stats = [
    { label: "Today's Jobs", value: todayJobs.length, icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
    { label: 'Est. Revenue', value: estRevenue > 0 ? `$${estRevenue.toLocaleString()}` : '—', icon: DollarSign, color: 'text-green-600 bg-green-50' },
    { label: 'Drive Time', value: '—', icon: Clock, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <Card key={i} className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}