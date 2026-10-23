import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Package, CheckCircle2, ClipboardCheck, Clock } from 'lucide-react';
import moment from 'moment';

export default function RecentActivityTimeline({ transferSheets, consumableReqs, materialReturns, jobs }) {
  const events = [
    ...transferSheets.filter(t => t.technician_received).map(t => ({
      icon: Download, title: 'Transfer received', subtitle: t.transfer_sheet_number || '',
      time: t.technician_received_at || t.created_date,
    })),
    ...consumableReqs.filter(r => r.status !== 'Draft').map(r => ({
      icon: Package, title: 'Consumables submitted', subtitle: r.truck_number || '',
      time: r.submitted_time || r.created_date,
    })),
    ...materialReturns.map(r => ({
      icon: ClipboardCheck, title: 'Truck return submitted', subtitle: r.return_id || '',
      time: r.submitted_at || r.created_date,
    })),
    ...jobs.filter(j => j.status === 'completed').map(j => ({
      icon: CheckCircle2, title: 'Job completed', subtitle: j.customer_name,
      time: j.updated_date || j.created_date,
    })),
  ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 10);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <e.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{e.title}</p>
                  {e.subtitle && <p className="text-xs text-muted-foreground truncate">{e.subtitle}</p>}
                </div>
                {e.time && (
                  <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{moment(e.time).fromNow()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}