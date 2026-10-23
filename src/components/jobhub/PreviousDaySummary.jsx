import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, AlertCircle, ClipboardList, CloudRain, Wrench, Package, MessageSquare } from 'lucide-react';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function PreviousDaySummary({ job, currentAppointment }) {
  const [prevReview, setPrevReview] = useState(null);
  const [prevAppt, setPrevAppt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!job?.id || !currentAppointment) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const appts = await base44.entities.Appointment.filter({ job_id: job.id });
        const sorted = appts.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        const currentIdx = sorted.findIndex(a => a.id === currentAppointment.id);
        if (currentIdx <= 0) {
          setPrevAppt(null);
          setPrevReview(null);
          return;
        }
        const prev = sorted[currentIdx - 1];
        setPrevAppt(prev);

        const reviews = await base44.entities.DailyAppointmentReview.filter({ appointment_id: prev.id });
        if (!cancelled) setPrevReview(reviews[0] || null);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [job?.id, currentAppointment?.id]);

  if (loading || !prevAppt) return null;

  return (
    <Card className="border-0 shadow-sm bg-blue-50/30">
      <CardHeader className="pb-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full text-left">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" /> Previous Day Summary — Day {prevAppt.day_number}
          </CardTitle>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {!prevReview ? (
            <p className="text-xs text-muted-foreground italic">No end-of-day review was submitted for Day {prevAppt.day_number}.</p>
          ) : (
            <>
              {/* Completed Yesterday */}
              {prevReview.actual_work_completed && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed Yesterday</p>
                  <p className="text-sm mt-0.5">{prevReview.actual_work_completed}</p>
                </div>
              )}

              {/* Remaining Scope */}
              {prevReview.remaining_work && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Remaining Scope</p>
                  <p className="text-sm mt-0.5">{prevReview.remaining_work}</p>
                </div>
              )}

              {/* Additional Work / Change Orders */}
              {prevReview.additional_work_discovered && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">Additional Work Discovered</p>
                    <p className="text-xs text-amber-700">{prevReview.additional_work_discovered}</p>
                  </div>
                </div>
              )}

              {/* Open Issues row */}
              <div className="grid grid-cols-2 gap-2">
                {prevReview.weather_delay && (
                  <div className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-muted/50">
                    <CloudRain className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Weather:</span>
                    <span className="font-medium truncate">{prevReview.weather_delay}</span>
                  </div>
                )}
                {prevReview.equipment_issues && (
                  <div className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-muted/50">
                    <Wrench className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Equipment:</span>
                    <span className="font-medium truncate">{prevReview.equipment_issues}</span>
                  </div>
                )}
                {prevReview.warehouse_restock_needed && (
                  <div className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-muted/50">
                    <Package className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Restock:</span>
                    <span className="font-medium truncate">{prevReview.warehouse_restock_needed}</span>
                  </div>
                )}
                {prevReview.customer_requests && (
                  <div className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-muted/50">
                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium truncate">{prevReview.customer_requests}</span>
                  </div>
                )}
              </div>

              {/* Production variance */}
              {prevReview.variance_reason && prevReview.variance_reason !== 'none' && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                    Behind Schedule: {prevReview.variance_reason.replace(/_/g, ' ')}
                  </Badge>
                  {prevReview.actual_hours > 0 && prevReview.planned_hours > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {prevReview.planned_hours}h planned → {prevReview.actual_hours}h actual
                    </span>
                  )}
                </div>
              )}

              {/* Photos */}
              {prevReview.photos?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {prevReview.photos.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt={`Day ${prevAppt.day_number} photo ${i + 1}`}
                      className="w-14 h-14 rounded object-cover border" />
                  ))}
                  {prevReview.photos.length > 4 && (
                    <div className="w-14 h-14 rounded border flex items-center justify-center text-xs text-muted-foreground bg-muted">
                      +{prevReview.photos.length - 4}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}