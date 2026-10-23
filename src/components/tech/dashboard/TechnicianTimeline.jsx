import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sunrise, ClipboardCheck, Package, CalendarCheck, PenTool,
  RotateCcw, Camera, CheckCircle2, Clock, Inbox,
} from 'lucide-react';
import moment from 'moment';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

export default function TechnicianTimeline({
  transferSheets = [], consumableReqs = [], materialReturns = [],
  jobs = [], equipment = [], wh105Status,
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const events = [];

  // Morning Readiness Started
  if (wh105Status) {
    events.push({
      icon: Sunrise, title: 'Morning Readiness Started',
      subtitle: `Status: ${wh105Status}`,
      time: new Date().toISOString(),
      color: 'text-amber-600', bg: 'bg-amber-50',
    });
  }

  // Inspection Completed
  jobs.filter(j => j.status === 'inspection_complete').forEach(j => {
    events.push({
      icon: ClipboardCheck, title: 'Inspection Completed',
      subtitle: j.customer_name,
      time: j.updated_date || j.created_date,
      color: 'text-blue-600', bg: 'bg-blue-50',
    });
  });

  // Material Pickup (transfers received)
  transferSheets.filter(t => t.technician_received).forEach(t => {
    events.push({
      icon: Package, title: 'Material Pickup',
      subtitle: t.transfer_sheet_number || 'Transfer received',
      time: t.technician_received_at || t.updated_date || t.created_date,
      color: 'text-indigo-600', bg: 'bg-indigo-50',
    });
  });

  // Consumables Submitted
  consumableReqs.filter(r => r.status !== 'Draft').forEach(r => {
    events.push({
      icon: Package, title: 'Consumables Submitted',
      subtitle: r.truck_number || `${r.total_items || 0} items`,
      time: r.submitted_time || r.created_date,
      color: 'text-teal-600', bg: 'bg-teal-50',
    });
  });

  // Job Accepted (today's jobs)
  jobs.filter(j => dateOnly(j.service_date) === today).forEach(j => {
    events.push({
      icon: CalendarCheck, title: 'Job Accepted',
      subtitle: j.customer_name,
      time: j.created_date,
      color: 'text-green-600', bg: 'bg-green-50',
    });
  });

  // Customer Signature (material returns with signature)
  materialReturns.filter(r => r.technician_signature || r.warehouse_signature).forEach(r => {
    events.push({
      icon: PenTool, title: 'Customer Signature',
      subtitle: r.return_id || 'Signature captured',
      time: r.submitted_at || r.updated_date || r.created_date,
      color: 'text-purple-600', bg: 'bg-purple-50',
    });
  });

  // Equipment Returned
  equipment.filter(e => e.actual_return_datetime).forEach(e => {
    events.push({
      icon: RotateCcw, title: 'Equipment Returned',
      subtitle: e.item_name,
      time: e.actual_return_datetime,
      color: 'text-orange-600', bg: 'bg-orange-50',
    });
  });

  // Photos Uploaded
  equipment.filter(e => e.photo_url && dateOnly(e.updated_date) === today).forEach(e => {
    events.push({
      icon: Camera, title: 'Photos Uploaded',
      subtitle: e.item_name,
      time: e.updated_date || e.created_date,
      color: 'text-pink-600', bg: 'bg-pink-50',
    });
  });

  // Job Completed
  jobs.filter(j => j.status === 'completed').forEach(j => {
    events.push({
      icon: CheckCircle2, title: 'Job Completed',
      subtitle: j.customer_name,
      time: j.updated_date || j.created_date,
      color: 'text-green-600', bg: 'bg-green-50',
    });
  });

  // Sort by time descending, take most recent 12
  events.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  const recentEvents = events.slice(0, 12);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Technician Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {recentEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No activity yet today</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-muted" />

            <div className="space-y-3">
              {recentEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className={`w-8 h-8 rounded-full ${e.bg} flex items-center justify-center flex-shrink-0 z-10 border-2 border-background`}>
                    <e.icon className={`w-4 h-4 ${e.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{e.title}</p>
                      {e.time && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {moment(e.time).fromNow()}
                        </span>
                      )}
                    </div>
                    {e.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{e.subtitle}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}