import {
  ClipboardList, MapPin, Clock, Shield,
  Wrench, BellRing, FileText, Users,
} from 'lucide-react';

export default function MorningBriefingPanel({ data }) {
  if (!data) return null;
  const {
    todayJobs = [], firstJob, openTasks = [], criticalNotifications = [],
    customerNotes = [],
  } = data;

  return (
    <div className="rounded-lg bg-muted/40 border border-border p-2 space-y-1.5 text-xs">
      {/* Today's Schedule */}
      <div className="p-1.5 rounded bg-background">
        <p className="font-medium flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Today's Schedule
        </p>
        <p className="text-muted-foreground">{todayJobs.length} job(s) scheduled</p>
        {todayJobs.slice(0, 3).map((job, idx) => (
          <div key={idx} className="ml-4 text-muted-foreground">
            {idx + 1}. {job.customer_name} — {job.job_type || 'Service'}
            {job.address && <span className="block ml-3 text-[10px]">{job.address}, {job.city}</span>}
          </div>
        ))}
      </div>

      {/* First Appointment + Travel */}
      <div className="grid sm:grid-cols-2 gap-1.5">
        <div className="p-1.5 rounded bg-background">
          <p className="font-medium flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> First Appointment
          </p>
          <p className="text-muted-foreground truncate">
            {firstJob ? firstJob.customer_name : 'None scheduled'}
          </p>
          {firstJob?.address && (
            <p className="text-muted-foreground text-[10px] truncate">{firstJob.address}</p>
          )}
        </div>
        <div className="p-1.5 rounded bg-background">
          <p className="font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Service Date
          </p>
          <p className="text-muted-foreground">
            {firstJob?.service_date || '—'}
          </p>
        </div>
      </div>

      {/* Customer Notes */}
      {customerNotes.length > 0 && (
        <div className="p-1.5 rounded bg-blue-50 border border-blue-200">
          <p className="font-medium text-blue-700 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Customer Notes
          </p>
          <ul className="text-blue-600 space-y-0.5">
            {customerNotes.map((note, idx) => (
              <li key={idx} className="ml-3">• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Membership / Warranty */}
      {firstJob && (
        <div className="p-1.5 rounded bg-background">
          <p className="font-medium flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> Membership & Warranty
          </p>
          <p className="text-muted-foreground text-[10px]">
            Check customer membership status and warranty coverage in Job Hub.
          </p>
        </div>
      )}

      {/* Special Equipment Highlight */}
      {todayJobs.some(j => j.job_type === 'installation' || j.job_type === 'repair') && (
        <div className="p-1.5 rounded bg-amber-50 border border-amber-200">
          <p className="font-medium text-amber-700 flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5" /> Special Equipment
          </p>
          <p className="text-amber-600 text-[10px]">
            Verify special equipment in Step 5 — review estimate requirements.
          </p>
        </div>
      )}

      {/* Critical Notifications */}
      {criticalNotifications.length > 0 && (
        <div className="p-1.5 rounded bg-red-50 border border-red-200">
          <p className="font-medium text-red-700 flex items-center gap-1">
            <BellRing className="w-3.5 h-3.5" /> Critical Notifications ({criticalNotifications.length})
          </p>
          <p className="text-red-600 truncate">
            {criticalNotifications.map(n => n.title).join(', ')}
          </p>
        </div>
      )}

      {/* Open Tasks */}
      {openTasks.length > 0 && (
        <div className="p-1.5 rounded bg-background">
          <p className="font-medium flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Open Tasks ({openTasks.length})
          </p>
          <p className="text-muted-foreground text-[10px]">
            {openTasks.slice(0, 3).map(t => t.title).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}