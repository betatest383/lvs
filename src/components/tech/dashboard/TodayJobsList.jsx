import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, ExternalLink, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusColors = {
  scheduled: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  inspection_complete: 'bg-purple-500',
  completed: 'bg-green-500',
};

const jobTypeLabels = {
  inspection: 'Inspection',
  repair: 'Repair',
  cleaning: 'Cleaning',
  installation: 'Installation',
  follow_up: 'Follow-up',
};

export default function TodayJobsList({ jobs, customerMap }) {
  if (!jobs || jobs.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Today's Jobs</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-4">No jobs scheduled for today</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today's Jobs ({jobs.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobs.map(job => {
          const customer = customerMap?.[job.customer_id];
          const fullAddress = [job.address, job.city, job.state].filter(Boolean).join(', ');
          return (
            <div key={job.id} className="p-3 rounded-lg border space-y-2">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-12 rounded-full ${statusColors[job.status] || 'bg-muted'} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{job.customer_name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3" /><span className="truncate">{fullAddress}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{jobTypeLabels[job.job_type] || job.job_type || '—'}</span>
                    <span className="text-xs capitalize text-muted-foreground">{job.status?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm"><Navigation className="w-3 h-3 mr-1" /> Navigate</Button>
                </a>
                {customer?.phone && (
                  <a href={`tel:${customer.phone}`}>
                    <Button variant="outline" size="sm"><Phone className="w-3 h-3 mr-1" /> Call</Button>
                  </a>
                )}
                <Link to={`/tech/inspection?job_id=${job.id}`}>
                  <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1" /> Open Job</Button>
                </Link>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}