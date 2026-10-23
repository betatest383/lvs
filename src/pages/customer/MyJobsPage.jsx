import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, MapPin, Wrench, Clock } from 'lucide-react';

const statusColor = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  inspection_complete: 'bg-purple-100 text-purple-700',
  estimate_sent: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-green-100 text-green-700',
  invoiced: 'bg-teal-100 text-teal-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function MyJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      // Match jobs by portal email linked to customer
      const customers = await base44.entities.Customer.filter({ portal_user_email: user.email });
      if (customers.length === 0) { setLoading(false); return; }
      const customerId = customers[0].id;
      const result = await base44.entities.Job.filter({ customer_id: customerId }, '-service_date', 50);
      setJobs(result);
      setLoading(false);
    });
  }, []);

  const upcoming = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const past = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  const JobCard = ({ job }) => (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold capitalize">{job.job_type?.replace(/_/g, ' ') || 'Service'}</p>
            {job.customer_number && <p className="text-xs text-muted-foreground font-mono">{job.customer_number}</p>}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColor[job.status] || 'bg-muted text-muted-foreground'}`}>
            {job.status?.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          {job.service_date && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{new Date(job.service_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
          {job.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{job.address}{job.city ? `, ${job.city}` : ''}</span>
            </div>
          )}
          {job.technician_name && (
            <div className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 shrink-0" />
              <span>{job.technician_name}</span>
            </div>
          )}
        </div>
        {job.notes && <p className="text-xs text-muted-foreground border-t pt-2">{job.notes}</p>}
      </CardContent>
    </Card>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
        <p className="text-muted-foreground text-sm mt-0.5">View your scheduled and past service appointments</p>
      </div>

      {jobs.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Clock className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-medium">No jobs found</p>
            <p className="text-sm text-muted-foreground">Your service appointments will appear here once scheduled.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Upcoming & Active</h2>
              {upcoming.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Past Jobs</h2>
              {past.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}