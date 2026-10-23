import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, Clock, Users, Wrench, Truck, Target, ClipboardCheck, Sparkles } from 'lucide-react';
import EndOfDayReportDialog from './EndOfDayReportDialog';

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function DailyWorkPlanPanel({ job, todaysAppointment }) {
  const [estimate, setEstimate] = useState(null);
  const [acceptedScope, setAcceptedScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(1);
  const [eodOpen, setEodOpen] = useState(false);
  const [eodReports, setEodReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!job?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [estimates, appts, workflows] = await Promise.all([
          base44.entities.Estimate.filter({ job_id: job.id }).catch(() => []),
          base44.entities.Appointment.filter({ job_id: job.id }).catch(() => []),
          base44.entities.AppointmentWorkflow.filter({ job_id: job.id }).catch(() => []),
        ]);
        const workflow = workflows.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))[0];
        const acceptedPackage = workflow?.customer_decision === 'accepted' && workflow?.selected_option_id
          ? await base44.entities.EstimatePackage.get(workflow.selected_option_id).catch(() => null)
          : null;
        const packageScope = acceptedPackage?.scope_of_work_id
          ? await base44.entities.ScopeOfWork.get(acceptedPackage.scope_of_work_id).catch(() => null)
          : null;
        if (cancelled) return;
        setEstimate(estimates[0] || null);
        setAcceptedScope(packageScope);
        appts.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        setAppointments(appts);

        // Load EOD reviews from DailyAppointmentReview entity
        const reviews = await base44.entities.DailyAppointmentReview.filter({ job_id: job.id }).catch(() => []);
        if (cancelled) return;
        const reports = reviews
          .map(r => ({
            day: r.day_number || 1,
            data: r,
            review_id: r.id,
            appointment_id: r.appointment_id,
            timestamp: r.submitted_at || r.created_date,
          }))
          .sort((a, b) => a.day - b.day);
        setEodReports(reports);

        // Auto-select today's day if available
        if (todaysAppointment?.day_number) {
          setSelectedDay(todaysAppointment.day_number);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [job?.id, todaysAppointment?.id]);

  const handleGenerateAppointments = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateAppointmentsFromPlan', { job_id: job.id });
      if (res.data?.error) {
        console.error('Generate failed:', res.data.error);
        return;
      }
      // Reload appointments
      const appts = await base44.entities.Appointment.filter({ job_id: job.id });
      appts.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
      setAppointments(appts);
    } catch (e) {
      console.error('Generate appointments failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  // Once a customer accepts an option, the package-linked scope replaces the
  // legacy job-wide estimate plan as the execution source of truth.
  const acceptedSchedule = safeParse(acceptedScope?.daily_schedule, []);
  const days = acceptedSchedule.length > 0
    ? acceptedSchedule.map(day => ({
        day_number: day.day_number,
        estimated_hours: day.crew_hours || 0,
        full_day: Number(day.crew_hours || 0) >= 8,
        lead_technicians: day.lead_technicians || 0,
        apprentices: day.apprentice_count || 0,
        masons: day.masons || 0,
        daily_scope: 'Customer-approved package scope',
      }))
    : safeParse(estimate?.scope_of_work_plan, []);
  const equipment = safeParse(acceptedScope?.required_equipment || estimate?.required_special_equipment, []);
  const fleet = safeParse(estimate?.fleet_resource_requests, []);

  // If execution plan exists but no appointments generated yet
  if (days.length > 0 && appointments.length === 0) {
    return (
      <Card className="border-0 shadow-sm border-accent/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <p className="text-sm font-medium">Execution Plan Ready — {days.length} day{days.length !== 1 ? 's' : ''}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Generate daily appointment workspaces from the approved execution plan. Each day gets its own appointment, crew assignment, and daily review.
          </p>
          <Button onClick={handleGenerateAppointments} disabled={generating} className="gap-1.5 w-full">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            Generate {days.length} Daily Appointments
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (days.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <CalendarDays className="w-5 h-5 mx-auto mb-1" />
          No Scope of Work Plan for this job.
        </CardContent>
      </Card>
    );
  }

  const day = days.find(d => d.day_number === selectedDay) || days[0];
  const dayAppointment = appointments.find(a => a.day_number === day.day_number) || null;
  const dayEquipment = equipment.filter(e => !e.required_days?.length || e.required_days.includes(day.day_number));
  const dayFleet = fleet.filter(r => !r.required_days?.length || r.required_days.includes(day.day_number));
  const eodReport = eodReports.find(r => r.day === day.day_number);
  const hasEodReport = !!eodReport;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Daily Work Plan
          </CardTitle>
          <Button size="sm" variant={hasEodReport ? 'outline' : 'default'}
            className="h-7 text-xs gap-1"
            onClick={() => setEodOpen(true)}>
            {hasEodReport ? <><ClipboardCheck className="w-3 h-3" /> Day {day.day_number} Reviewed</> : <><Target className="w-3 h-3" /> End of Day Review</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Day selector */}
        <div className="flex flex-wrap gap-1.5">
          {days.map(d => {
            const reported = eodReports.some(r => r.day === d.day_number);
            const appt = appointments.find(a => a.day_number === d.day_number);
            const apptStatus = appt?.status;
            const isToday = todaysAppointment?.day_number === d.day_number;
            return (
              <button key={d.day_number} onClick={() => setSelectedDay(d.day_number)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  d.day_number === day.day_number
                    ? 'bg-accent text-accent-foreground scale-105'
                    : reported ? 'bg-green-100 text-green-700' : isToday ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
                Day {d.day_number}{reported && ' ✓'}{apptStatus === 'completed' && ' ✓'}
              </button>
            );
          })}
        </div>

        {/* Day plan */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 p-2.5 bg-muted/50 rounded-lg">
            <span className="flex items-center gap-1 text-xs"><Clock className="w-3 h-3 text-muted-foreground" /> {day.estimated_hours || 0}h {day.full_day ? '(Full Day)' : '(Partial)'}</span>
            <span className="flex items-center gap-1 text-xs"><Users className="w-3 h-3 text-muted-foreground" /> {day.lead_technicians || 0} Lead / {day.apprentices || 0} App / {day.masons || 0} Mason</span>
            {dayAppointment && (
              <span className="flex items-center gap-1 text-xs">
                <Badge variant="outline" className={`text-[10px] ${
                  dayAppointment.status === 'completed' ? 'bg-green-50 text-green-700' :
                  dayAppointment.status === 'started' ? 'bg-blue-50 text-blue-700' : ''
                }`}>
                  {dayAppointment.status || 'scheduled'}
                </Badge>
              </span>
            )}
          </div>

          {day.required_skills?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {day.required_skills.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Scope</p>
            <p className="text-sm mt-0.5">{day.daily_scope || '—'}</p>
          </div>

          <div className="p-2.5 rounded-lg bg-accent/5 border border-accent/20">
            <p className="text-xs font-medium text-accent uppercase tracking-wide flex items-center gap-1"><Target className="w-3 h-3" /> Production Goal</p>
            <p className="text-sm font-medium mt-0.5">{day.production_goal || '—'}</p>
          </div>

          {/* Equipment for this day */}
          {dayEquipment.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Wrench className="w-3 h-3" /> Expected Equipment</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {dayEquipment.map((e, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] gap-1">
                    {e.critical && <span className="text-red-500">●</span>}{e.item_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Fleet for this day */}
          {dayFleet.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Truck className="w-3 h-3" /> Fleet Resources</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {dayFleet.map((r, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{r.vehicle_class} ×{r.quantity_needed}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Scaffold */}
          {estimate?.scaffold_plan_required && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scaffold Plan</p>
              <Badge className={`text-[10px] mt-0.5 ${estimate.scaffold_plan_status === 'attached' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {estimate.scaffold_plan_status === 'attached' ? 'Attached' : 'Pending'}
              </Badge>
            </div>
          )}
        </div>

        {/* EOD report summary */}
        {eodReport && (
          <div className="p-2.5 rounded-lg bg-green-50 border border-green-200 text-xs space-y-1">
            <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Day {eodReport.day} Review</p>
            {eodReport.data.actual_work_completed && <p className="text-green-700">Completed: {eodReport.data.actual_work_completed}</p>}
            {eodReport.data.percent_complete > 0 && <p className="text-green-700">Job {eodReport.data.percent_complete}% complete</p>}
            {eodReport.data.variance_reason && eodReport.data.variance_reason !== 'none' && (
              <p className="text-amber-700">Variance: {eodReport.data.variance_reason.replace(/_/g, ' ')}</p>
            )}
          </div>
        )}
      </CardContent>

      <EndOfDayReportDialog
        open={eodOpen} onClose={() => setEodOpen(false)}
        dayPlan={day} appointment={dayAppointment}
        jobId={job.id} jobNumber={job.crm_job_number || ''}
        customerName={job.customer_name || ''}
        onSaved={() => {
          setEodOpen(false);
          // Reload EOD reviews
          base44.entities.DailyAppointmentReview.filter({ job_id: job.id }).then(reviews => {
            const reports = reviews
              .map(r => ({
                day: r.day_number || 1,
                data: r,
                review_id: r.id,
                appointment_id: r.appointment_id,
                timestamp: r.submitted_at || r.created_date,
              }))
              .sort((a, b) => a.day - b.day);
            setEodReports(reports);
          });
        }}
      />
    </Card>
  );
}