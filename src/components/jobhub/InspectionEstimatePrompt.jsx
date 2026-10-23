import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileText, ClipboardList, AlertTriangle } from 'lucide-react';

export default function InspectionEstimatePrompt({ job }) {
  const [findings, setFindings] = useState([]);
  const [repairSystems, setRepairSystems] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [acceptedPackage, setAcceptedPackage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  if (!job?.id) return;
  let cancelled = false;
  const load = async () => {
    setLoading(true);
    try {
      const [finds, rsrs, ests, workflows] = await Promise.all([
        base44.entities.InspectionFinding.filter({ job_id: job.id }).catch(() => []),
        base44.entities.RepairSystemRecommendation.filter({ job_id: job.id }).catch(() => []),
        base44.entities.Estimate.filter({ job_id: job.id }).catch(() => []),
        base44.entities.AppointmentWorkflow.filter({ job_id: job.id }).catch(() => []),
      ]);
      const workflow = workflows.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))[0];
      const pkg = workflow?.customer_decision === 'accepted' && workflow?.selected_option_id
        ? await base44.entities.EstimatePackage.get(workflow.selected_option_id).catch(() => null)
        : null;
      if (cancelled) return;
      setFindings(finds);
      setRepairSystems(rsrs);
      setEstimate(ests[0] || null);
      setAcceptedPackage(pkg);
    } catch { /* ignore */ }
    finally { if (!cancelled) setLoading(false); }
  };
  load();
  return () => { cancelled = true; };
  }, [job?.id]);

  if (loading) return null;

  // No findings = inspection not done yet — don't show
  if (findings.length === 0) return null;

  const pendingRecs = repairSystems.filter(r => r.estimate_status === 'pending');
  const hasAcceptedEstimate = !!acceptedPackage;
  const hasEstimate = !!estimate;
  const executionPlanComplete = hasAcceptedEstimate || estimate?.total_job_days > 0;

  return (
    <Card className={`border-0 shadow-sm ${hasEstimate ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-accent'}`}>
      <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {hasEstimate ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <ClipboardList className="w-5 h-5 text-accent" />
          )}
          <div>
            <p className="font-medium text-sm">
              {hasAcceptedEstimate ? 'Customer-Approved Estimate' : hasEstimate ? 'Estimate Draft Created' : 'Suggested Estimates Available'}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasAcceptedEstimate
                ? `${acceptedPackage.name} · $${Number(acceptedPackage.selling_price || 0).toFixed(2)}`
                : <>{findings.length} finding{findings.length !== 1 ? 's' : ''} from inspection
                    {pendingRecs.length > 0 && ` · ${pendingRecs.length} recommendation${pendingRecs.length !== 1 ? 's' : ''} pending review`}
                    {hasEstimate && !executionPlanComplete && ` · Execution Plan needed`}
                    {hasEstimate && executionPlanComplete && ` · Execution Plan ready`}</>}
            </p>
          </div>
        </div>
        <Link to={hasAcceptedEstimate ? `/admin/estimates/accepted/${job.id}` : `/admin/estimates/recommendations/${job.id}`}>
          <Button size="sm" className="gap-1.5">
            {hasAcceptedEstimate ? <><FileText className="w-3.5 h-3.5" /> View Approved Estimate</>
              : hasEstimate ? <><FileText className="w-3.5 h-3.5" /> Open Estimate</>
              : <><ClipboardList className="w-3.5 h-3.5" /> Review Estimate Recommendations</>}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}