import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useWorkflowState } from '@/hooks/useWorkflowState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import RecommendationReviewDialog from '@/components/jobhub/RecommendationReviewDialog';

export default function RecommendationReviewPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { employee, effectiveEmail, effectiveName, effectiveRole } = useEmployeeContext();
  const {
    derived, loading: wfLoading, refresh, completeStage,
  } = useWorkflowState(jobId, employee, effectiveEmail, effectiveName);

  const [job, setJob] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [jobData, appts] = await Promise.all([
          base44.entities.Job.get(jobId),
          base44.entities.Appointment.filter({ job_id: jobId }).catch(() => []),
        ]);
        if (cancelled) return;
        setJob(jobData);
        setAppointments(appts);
      } catch (e) {
        console.error('Failed to load job:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [jobId]);

  const isManager = (() => {
    const role = (effectiveRole || employee?.primary_role || '').toLowerCase();
    return role.includes('manager') || role.includes('admin') || role.includes('lead') || role.includes('director');
  })();

  if (loading || wfLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!job) {
    return (
      <Card className="border-red-200 bg-red-50 m-4">
        <CardContent className="p-6 text-center">
          <p className="font-medium text-red-800">Job not found</p>
          <Link to="/tech/dashboard">
            <Button variant="outline" className="mt-4 gap-1"><ArrowLeft className="w-4 h-4" /> Back</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <Link to={`/tech/job-hub/${jobId}`}>
          <Button variant="outline" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Job Hub
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Recommendation Review</h1>
          <p className="text-sm text-muted-foreground">{job.customer_name} — Job #{job.crm_job_number || job.id.slice(-6)}</p>
        </div>
      </div>

      <RecommendationReviewDialog
        open={true}
        jobId={job.id}
        findings={derived.findings}
        legacyFindings={derived.legacyFindings}
        inspectionSetup={derived.inspectionSetup}
        appointments={appointments}
        effectiveEmail={effectiveEmail}
        effectiveName={effectiveName}
        isManager={isManager}
        onRefresh={refresh}
        onClose={() => navigate(`/tech/job-hub/${jobId}`)}
        onComplete={async (hasEstimateItems) => {
          await completeStage('recommendation_review', {
            review_completed_at: new Date().toISOString(),
            result: hasEstimateItems ? 'estimate_required' : 'no_estimate_required',
          });
          await refresh();
          navigate(`/tech/job-hub/${jobId}`);
        }}
      />
    </div>
  );
}