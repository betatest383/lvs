import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Play, Timer } from 'lucide-react';

const STATUS_STYLES = {
  not_started: { badge: 'bg-gray-100 text-gray-600', label: 'Not Started' },
  clocked_in: { badge: 'bg-blue-100 text-blue-700', label: 'Clocked In' },
  morning_workflow_active: { badge: 'bg-amber-100 text-amber-700', label: 'Morning Workflow Active' },
  ready_for_dispatch: { badge: 'bg-green-100 text-green-700', label: 'Ready for Dispatch' },
  dispatched: { badge: 'bg-purple-100 text-purple-700', label: 'Dispatched' },
  no_job_warehouse_tasks: { badge: 'bg-blue-100 text-blue-700', label: 'No Job — Warehouse Tasks' },
  completed: { badge: 'bg-green-100 text-green-700', label: 'Completed' },
};

function formatClockTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ClockInCard({ session, timer, onClockIn }) {
  const clockedIn = !!session?.clock_in_time;
  const dispatched = !!session?.first_dispatch_time;
  const statusStyle = STATUS_STYLES[session?.status] || STATUS_STYLES.not_started;

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${clockedIn ? 'bg-green-100' : 'bg-muted'}`}>
              <Clock className={`w-7 h-7 ${clockedIn ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Day Start Status</h2>
              <Badge className={`${statusStyle.badge} mt-1`}>{statusStyle.label}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {clockedIn && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Clocked In</p>
                <p className="text-lg font-bold">{formatClockTime(session.clock_in_time)}</p>
              </div>
            )}
            {clockedIn && !dispatched && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1 justify-center">
                  <Timer className="w-3 h-3" /> Morning Workflow Time
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-accent">{timer}</p>
              </div>
            )}
            {dispatched && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Dispatched</p>
                <p className="text-lg font-bold">{formatClockTime(session.first_dispatch_time)}</p>
              </div>
            )}
            {!clockedIn && (
              <Button size="lg" className="gap-2 text-base" onClick={onClockIn}>
                <Play className="w-5 h-5" /> Clock In
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}