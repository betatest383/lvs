import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock as ClockIcon, User, Briefcase, Home, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTimeET } from '@/lib/timezone';

export default function FirstJobCard({ job, nextTaskLabel }) {
  if (!job) return null;

  const fmtDate = (d) => d ? formatDateTimeET(d) : '';

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-sm">Today's First Job</h3>
          </div>
          <Badge variant="outline" className="text-[10px] capitalize">{job.status?.replace(/_/g, ' ') || 'Scheduled'}</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">{job.customer_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground truncate">{job.address || 'Address not set'}</span>
          </div>
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {fmtDate(job.service_date) || 'Arrival window not set'}
            </span>
          </div>
          {job.job_type && (
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground capitalize">{job.job_type.replace(/_/g, ' ')}</span>
            </div>
          )}
        </div>

        {nextTaskLabel && (
          <div className="rounded-lg bg-accent/5 border border-accent/20 p-2 text-xs text-accent font-medium">
            Next: {nextTaskLabel}
          </div>
        )}

        <Link to={`/tech/job-hub/${job.id}`}>
          <Button size="sm" className="w-full gap-1">
            <Home className="w-3.5 h-3.5" /> Open Job Hub
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}