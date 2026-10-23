import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

/**
 * KPI Widget — renders a row of role-specific metric cards.
 * @param {Array} kpis - [{ label, value, icon, color, to }]
 */
export default function KpiWidget({ kpis = [] }) {
  if (!kpis.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon;
        const content = (
          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{kpi.label}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                </div>
                {Icon && (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color || 'bg-muted'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
        return kpi.to
          ? <Link key={i} to={kpi.to}>{content}</Link>
          : <div key={i}>{content}</div>;
      })}
    </div>
  );
}