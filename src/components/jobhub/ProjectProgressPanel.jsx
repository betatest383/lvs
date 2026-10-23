import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, Circle, Clock, Play, Flag } from 'lucide-react';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const STATUS_CONFIG = {
  completed: { icon: CheckCircle2, label: 'Complete', cls: 'bg-green-500 text-white', badge: 'bg-green-100 text-green-700' },
  started: { icon: Play, label: 'In Progress', cls: 'bg-blue-500 text-white', badge: 'bg-blue-100 text-blue-700' },
  scheduled: { icon: Clock, label: 'Scheduled', cls: 'bg-muted text-muted-foreground', badge: 'bg-gray-100 text-gray-600' },
  dispatched: { icon: Clock, label: 'Dispatched', cls: 'bg-amber-500 text-white', badge: 'bg-amber-100 text-amber-700' },
  cancelled: { icon: Circle, label: 'Cancelled', cls: 'bg-red-500 text-white', badge: 'bg-red-100 text-red-700' },
};

export default function ProjectProgressPanel({ job }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!job?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const appts = await base44.entities.Appointment.filter({ job_id: job.id });
        if (cancelled) return;
        appts.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        setAppointments(appts);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [job?.id]);

  if (loading) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading project progress...</CardContent></Card>;
  }

  if (appointments.length === 0) return null;

  const todayStr = new Date().toLocaleDateString('en-CA');
  const completedCount = appointments.filter(a => a.status === 'completed').length;
  const totalCount = appointments.length;
  const overallPct = Math.round((completedCount / totalCount) * 100);

  const currentAppt = appointments.find(a => a.status === 'started' || a.status === 'dispatched')
    || appointments.find(a => (a.scheduled_start || '').slice(0, 10) === todayStr)
    || appointments.find(a => a.status !== 'completed' && a.status !== 'cancelled')
    || null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Project Progress
          </CardTitle>
          <Badge className="text-xs">{overallPct}% Complete</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overall progress bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-accent to-accent/80 transition-all duration-500"
            style={{ width: `${overallPct}%` }} />
        </div>

        {/* Day-by-day timeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {appointments.map((appt, idx) => {
            const config = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
            const Icon = config.icon;
            const isCurrent = currentAppt?.id === appt.id;
            const isFinal = appt.is_final_appointment;

            return (
              <div key={appt.id} className="flex items-center flex-shrink-0">
                <div className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${isCurrent ? 'ring-2 ring-accent ring-offset-1' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.cls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium whitespace-nowrap">Day {appt.day_number || idx + 1}</span>
                  {isFinal && <Flag className="w-2.5 h-2.5 text-accent" />}
                  {isCurrent && <Badge className="text-[8px] px-1 py-0 h-4">NOW</Badge>}
                </div>
                {idx < appointments.length - 1 && (
                  <div className={`h-0.5 w-4 ${appt.status === 'completed' ? 'bg-green-500' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{completedCount} of {totalCount} days complete</span>
          {currentAppt && (
            <span className="text-blue-600">
              Current: Day {currentAppt.day_number} — {STATUS_CONFIG[currentAppt.status]?.label}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}