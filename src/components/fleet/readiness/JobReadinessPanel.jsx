import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Briefcase, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export default function JobReadinessPanel({ jobs }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Job Readiness
          </CardTitle>
          <div className="flex gap-2">
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{jobs.ready} Ready</Badge>
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{jobs.blocked} Blocked</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.todaysJobs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No jobs scheduled for today.</p>
        )}
        {jobs.blockedJobs.map((bj, i) => (
          <Link key={i} to={`/admin/jobs/${bj.job.id}`}>
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors">
              <div className="flex items-center gap-3">
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{bj.job.crm_job_number || bj.job.id} — {bj.job.customer_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {bj.reasons.map((r, ri) => (
                      <Badge key={ri} variant="outline" className="text-xs text-red-600 border-red-300">{r}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              {bj.linkedTruck && (
                <Badge variant="secondary" className="text-xs">Truck {bj.linkedTruck.truck.truck_number}</Badge>
              )}
            </div>
          </Link>
        ))}
        {jobs.readyJobs.map((job, i) => (
          <Link key={i} to={`/admin/jobs/${job.id}`}>
            <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50 hover:bg-green-50 transition-colors">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm font-medium">{job.crm_job_number || job.id} — {job.customer_name}</p>
              </div>
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ready</Badge>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}