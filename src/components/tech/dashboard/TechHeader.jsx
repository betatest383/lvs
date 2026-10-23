import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sun, Truck, UserCog } from 'lucide-react';
import moment from 'moment';

export default function TechHeader({ user, employeeName, isImpersonating, truckNumber }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const firstName = employeeName?.split(' ')[0] || user?.full_name?.split(' ')[0] || '';

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-900 to-slate-800 text-white">
      <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/60">{greeting}</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {firstName || 'Technician'}
            {isImpersonating && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-slate-900 font-semibold flex items-center gap-1">
                <UserCog className="w-3 h-3" /> Acting As
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/70">
            {truckNumber && (
              <span className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> Truck {truckNumber}
              </span>
            )}
            <span>{moment(now).format('dddd, MMM D, YYYY')}</span>
            <span className="font-mono">{moment(now).format('h:mm A')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
          <Sun className="w-5 h-5 text-amber-300" />
          <div>
            <p className="text-xs text-white/60">Today's Weather</p>
            <p className="text-sm font-medium">Coming soon</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}