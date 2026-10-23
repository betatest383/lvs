import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import { calcEmployeeStats } from '@/lib/improvementConstants';

export default function Gamification({ items, compact = false }) {
  const leaderboard = calcEmployeeStats(items);
  const top = compact ? leaderboard.slice(0, 5) : leaderboard;

  if (top.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" /> Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No data yet. Submit your first idea!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-accent" /> Top Contributors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {top.map((emp, i) => (
            <div key={emp.name + i} className="flex items-center gap-3 rounded-lg hover:bg-muted/30 px-2 py-1.5">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                i === 1 ? 'bg-gray-200 text-gray-700' :
                i === 2 ? 'bg-orange-100 text-orange-700' :
                'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{emp.name}</p>
                <p className="text-xs text-muted-foreground">
                  {emp.submitted} submitted · {emp.implemented} implemented
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">${emp.dollarsSaved.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{emp.hoursSaved.toFixed(0)}h saved</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}