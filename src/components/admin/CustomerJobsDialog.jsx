import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ClipboardList, CalendarClock, MapPin, User, Building2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateET } from '@/lib/timezone';

const FILTERS = [
  { key: 'all', label: 'All Jobs' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'canceled', label: 'Canceled' },
];

function lifecycleBadge(job) {
  if (job.is_deleted) return { label: 'Deleted', cls: 'bg-slate-200 text-slate-700' };
  if (job.status === 'cancelled' || job.is_canceled) return { label: 'Canceled', cls: 'bg-red-100 text-red-700' };
  if (job.status === 'completed') return { label: 'Completed', cls: 'bg-green-100 text-green-700' };
  return { label: 'Active', cls: 'bg-blue-100 text-blue-700' };
}

function matchesFilter(job, filter) {
  const deleted = !!job.is_deleted;
  const canceled = job.status === 'cancelled' || !!job.is_canceled;
  const completed = job.status === 'completed';
  switch (filter) {
    case 'upcoming': return !deleted && !canceled && !completed;
    case 'completed': return !deleted && completed;
    case 'canceled': return !deleted && canceled;
    default: return true;
  }
}

function sortDate(job) {
  const d = job.appointment_date || job.service_date || '';
  return d ? new Date(d).getTime() : 0;
}

function fmtDate(d) {
  return formatDateET(d);
}

// Effective scheduled date — identical rule to JobsPage: earliest valid linked
// Appointment scheduled_start (America/New_York); otherwise the Job's actual
// service_date / appointment_date. Never uses created_date or import date.
function effectiveJobDate(job, apts) {
  const starts = (apts || [])
    .map(a => (a && a.scheduled_start) ? new Date(a.scheduled_start) : null)
    .filter(d => d && !isNaN(d.getTime()));
  if (starts.length) {
    starts.sort((a, b) => a.getTime() - b.getTime());
    return starts[0].toISOString();
  }
  return job.appointment_date || job.service_date || '';
}

export default function CustomerJobsDialog({ customer, open, onOpenChange }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [appointmentsByJob, setAppointmentsByJob] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!open || !customer?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const linkKeys = [customer.id, customer.customer_number].filter((k, i, arr) => k && arr.indexOf(k) === i);
        const fetches = [];
        for (const key of linkKeys) fetches.push(base44.entities.Job.filter({ customer_id: key }, '-created_date', 500).catch(() => []));
        if (customer.servicetitan_customer_id) {
          fetches.push(base44.entities.Job.filter({ servicetitan_customer_id: customer.servicetitan_customer_id }, '-created_date', 500).catch(() => []));
        }
        const results = await Promise.all(fetches);
        if (cancelled) return;
        const seen = new Map();
        for (const list of results) {
          for (const j of list) {
            if (seen.has(j.id)) continue;
            // Safety: never include a job explicitly linked to a different local customer.
            if (j.customer_id && j.customer_id !== customer.id && j.customer_id !== customer.customer_number) {
              // Unless matched via the immutable ST customer id (authoritative), skip.
              if (!customer.servicetitan_customer_id || j.servicetitan_customer_id !== customer.servicetitan_customer_id) continue;
            }
            seen.set(j.id, j);
          }
        }
        const all = Array.from(seen.values()).sort((a, b) => sortDate(b) - sortDate(a));
        setJobs(all);

        // Fetch appointments per job (for multi-appointment display).
        const aptResults = await Promise.all(
          all.map((j) => base44.entities.Appointment.filter({ job_id: j.id }, 'scheduled_start', 50).catch(() => []))
        );
        if (cancelled) return;
        const map = {};
        all.forEach((j, i) => { map[j.id] = aptResults[i] || []; });
        setAppointmentsByJob(map);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load jobs');
          toast.error('Failed to load jobs for this customer');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, customer?.id, customer?.customer_number, customer?.servicetitan_customer_id]);

  const filtered = useMemo(() => jobs.filter((j) => matchesFilter(j, filter)), [jobs, filter]);
  const filterCounts = useMemo(() => ({
    all: jobs.length,
    upcoming: jobs.filter((j) => matchesFilter(j, 'upcoming')).length,
    completed: jobs.filter((j) => matchesFilter(j, 'completed')).length,
    canceled: jobs.filter((j) => matchesFilter(j, 'canceled')).length,
  }), [jobs]);

  const openJob = (job) => {
    navigate(`/admin/jobs/${job.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Jobs — {customer?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-1 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${filter === f.key ? 'bg-accent text-accent-foreground border-accent' : 'bg-background border-input hover:bg-accent/60'}`}
              >
                {f.label} <span className="ml-1 opacity-70">({filterCounts[f.key] ?? 0})</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} shown of {jobs.length}</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <p className="text-sm">Loading jobs…</p>
          </div>
        ) : error ? (
          <div className="text-center py-10 text-sm text-destructive border border-dashed rounded-xl">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
            <ClipboardList className="w-7 h-7 mx-auto mb-2 opacity-40" />
            <p>No jobs are currently associated with this customer.</p>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            {filtered.map((job) => {
              const badge = lifecycleBadge(job);
              const apts = appointmentsByJob[job.id] || [];
              return (
                <button
                  key={job.id}
                  onClick={() => openJob(job)}
                  className="w-full text-left border rounded-lg p-3 bg-card hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{job.servicetitan_job_number || job.crm_job_number || '—'}</span>
                        <span className="font-medium text-sm">{job.job_type || 'Job'}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        {job.dispatch_status && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600 capitalize">{job.dispatch_status.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5"><CalendarClock className="w-3 h-3 shrink-0" /><span className="font-medium text-foreground">Date:</span> {fmtDate(effectiveJobDate(job, apts))}{job.arrival_window_start ? ` · ${job.arrival_window_start}${job.arrival_window_end ? `–${job.arrival_window_end}` : ''}` : ''}</div>
                        <div className="flex items-center gap-1.5"><User className="w-3 h-3 shrink-0" /><span className="font-medium text-foreground">Tech:</span> {job.lead_technician_name || job.technician_name || 'Unassigned'}</div>
                        <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3 shrink-0" /><span className="font-medium text-foreground">BU:</span> {job.servicetitan_business_unit || '—'}</div>
                        <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 shrink-0" /><span className="font-medium text-foreground">Loc:</span> {job.servicetitan_location_name || '—'}</div>
                        <div className="col-span-2 flex items-start gap-1.5"><MapPin className="w-3 h-3 shrink-0 mt-0.5" /><span className="font-medium text-foreground">Addr:</span> <span className="truncate">{[job.address, job.city, job.state, job.zip].filter(Boolean).join(', ') || '—'}</span></div>
                      </div>
                      {apts.length > 1 && (
                        <div className="mt-2 pl-1 border-l-2 border-accent/40 space-y-0.5">
                          {apts.slice(0, 4).map((a) => (
                            <div key={a.id} className="text-xs text-muted-foreground">
                              {fmtDate((a.scheduled_start || '').split('T')[0])}{a.status ? ` · ${a.status}` : ''}{a.technician_name ? ` · ${a.technician_name}` : ''}
                            </div>
                          ))}
                          {apts.length > 4 && <div className="text-xs text-muted-foreground">+{apts.length - 4} more…</div>}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}