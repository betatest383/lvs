import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHealthColor } from '@/hooks/useOperationsData';

export default function CompanyHealthCard({ data }) {
  const color = getHealthColor(data.healthScore);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
          Company Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{data.healthScore}%</span>
          <span className={`text-sm font-medium ${color.text}`}>{color.label}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${color.bar} transition-all`} style={{ width: `${data.healthScore}%` }} />
        </div>
        <div className="space-y-1.5">
          {Object.entries(data.healthMetrics).map(([key, m]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-muted-foreground">{m.label}</span>
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${m.score >= 80 ? 'bg-green-500' : m.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${m.score}%` }} />
              </div>
              <span className="w-8 text-right font-medium">{m.score}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}