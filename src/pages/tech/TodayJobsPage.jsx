import { useState } from 'react';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyJobs } from '@/hooks/useMyJobs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar, Home, CalendarClock, Bug } from 'lucide-react';
import { Link } from 'react-router-dom';
import JobAppointments from '../../components/shared/JobAppointments';
import { formatDateET } from '@/lib/timezone';

const fmtDate = (d) => d ? formatDateET(d) : '';

function JobCard({ job, statusColor, overdue }) {
  const [showApts, setShowApts] = useState(false);
  return (
    <Card className={`border-0 shadow-sm ${overdue ? 'border-l-4 border-l-amber-400' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-12 rounded-full ${statusColor[job.status] || 'bg-muted'}`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{job.customer_name}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{job.address}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Calendar className="w-3 h-3" />
              <span>{fmtDate(job.service_date)}</span>
            </div>
          </div>
        </div>
        <Link to={`/tech/job-hub/${job.id}`}>
          <Button size="sm" className="w-full gap-1">
            <Home className="w-3 h-3" /> Open Job Hub
          </Button>
        </Link>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setShowApts(s => !s)}
        >
          <CalendarClock className="w-3.5 h-3.5" />
          <span>{showApts ? 'Hide' : 'Show'} Appointments</span>
        </button>
        {showApts && <JobAppointments jobId={job.id} crmJobNumber={job.crm_job_number} />}
      </CardContent>
    </Card>
  );
}

export default function TodayJobsPage() {
  const { employee, effectiveEmployeeId } = useEmployeeContext();
  const { todayJobs, upcomingJobs, overdueJobs, historyJobs, matchingJobs, loading, error } = useMyJobs(employee);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const statusColor = {
    scheduled: 'bg-blue-500',
    in_progress: 'bg-amber-500',
    inspection_complete: 'bg-purple-500',
    completed: 'bg-green-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today's Jobs</h1>
        <p className="text-muted-foreground mt-1">Your assigned jobs</p>
      </div>

      {/* Debug text */}
      <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
        <Bug className="w-3 h-3 inline mr-1" />
        Debug: showing {matchingJobs.length} matching jobs for {effectiveEmployeeId || '(no employee)'}
      </p>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">
            Error loading jobs: {error}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Today ({todayJobs.length})</h2>
        {todayJobs.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-8 text-center text-muted-foreground">
              No jobs scheduled for today
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {todayJobs.map(job => (
              <JobCard key={job.id} job={job} statusColor={statusColor} />
            ))}
          </div>
        )}
      </div>

      {overdueJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-amber-600">Overdue ({overdueJobs.length})</h2>
          <div className="space-y-3">
            {overdueJobs.map(job => (
              <JobCard key={job.id} job={job} statusColor={statusColor} overdue />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming ({upcomingJobs.length})</h2>
        {upcomingJobs.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-8 text-center text-muted-foreground">
              No upcoming jobs
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingJobs.slice(0, 10).map(job => (
              <JobCard key={job.id} job={job} statusColor={statusColor} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">History ({historyJobs.length})</h2>
        {historyJobs.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-8 text-center text-muted-foreground">
              No past jobs to show
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {historyJobs.slice(0, 20).map(job => (
              <JobCard key={job.id} job={job} statusColor={statusColor} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}