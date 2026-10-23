import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Warehouse, Briefcase, Truck, ClipboardCheck, Wrench, CheckCircle2, DollarSign, Calculator } from 'lucide-react';

const TIMELINE = [
  { time: '5:30 AM', label: 'Morning Warehouse', icon: Warehouse },
  { time: '6:30 AM', label: 'Dispatch', icon: Briefcase },
  { time: '7:00 AM', label: 'Technicians En Route', icon: Truck },
  { time: '8:00 AM', label: 'Inspections', icon: ClipboardCheck },
  { time: '10:00 AM', label: 'Installations', icon: Wrench },
  { time: '3:00 PM', label: 'Completed Jobs', icon: CheckCircle2 },
  { time: '4:00 PM', label: 'Deposits', icon: DollarSign },
  { time: '5:00 PM', label: 'Payroll Tasks', icon: Calculator },
];

export default function OperationalTimeline() {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Today's Operational Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-3">
            {TIMELINE.map((event) => {
              const [h, m] = event.time.match(/(\d+):(\d+)/).slice(1).map(Number);
              const eventHour = h + m / 60;
              const isPast = eventHour < currentHour;
              const isNow = Math.abs(eventHour - currentHour) < 0.5;

              return (
                <div key={event.label} className="relative flex items-center gap-3 pl-8">
                  <div className={`absolute left-2 w-3 h-3 rounded-full border-2 ${isNow ? 'bg-accent border-accent' : isPast ? 'bg-green-500 border-green-500' : 'bg-background border-muted-foreground/30'}`} />
                  <event.icon className={`w-4 h-4 ${isPast ? 'text-green-500' : isNow ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${isNow ? 'font-semibold' : ''}`}>{event.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{event.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}