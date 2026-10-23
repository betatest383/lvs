import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, FileText, Package, CalendarDays, ExternalLink, UserPlus, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateET } from '@/lib/timezone';
import JobWarehouseTab from '@/components/jobs/JobWarehouseTab';
import JobAssignmentPanel from '@/components/jobs/JobAssignmentPanel';
import ScopeOfWorkSummary from '@/components/estimates/ScopeOfWorkSummary';
import { useAuth } from '@/lib/AuthContext';
import DeleteJobDialog from '@/components/admin/DeleteJobDialog';

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  inspection_complete: 'bg-purple-100 text-purple-700',
  estimate_sent: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-green-100 text-green-700',
  invoiced: 'bg-teal-100 text-teal-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('assignment');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    base44.entities.Job.get(id)
      .then(setJob)
      .catch(() => toast.error('Failed to load job'))
      .finally(() => setLoading(false));
  }, [id]);

  const fmtDate = (d) => formatDateET(d);

  const canManage = user?.role === 'admin' || user?.role === 'owner';
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleRestore = async () => {
    try {
      await base44.functions.invoke('manageJobDeletion', { action: 'restore', job_id: id });
      toast.success('Job restored');
      base44.entities.Job.get(id).then(setJob);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Failed to restore job');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!job) {
    return <div className="text-center py-12 text-muted-foreground">Job not found.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {job.customer_name || 'Unknown Customer'}
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status] || 'bg-muted text-muted-foreground'}`}>
                {job.status?.replace(/_/g, ' ') || '\u2014'}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {job.crm_job_number || job.id}
              {job.customer_number ? ` · Cust #${job.customer_number}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.is_deleted ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRestore}>
              <RotateCcw className="w-4 h-4" /> Restore Job
            </Button>
          ) : canManage ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4" /> Delete Job
            </Button>
          ) : null}
        </div>
      </div>

      {job.is_deleted && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">This job has been deleted and is hidden from active LVC OS views.</p>
            <p className="text-xs">Deleted {fmtDate(job.deleted_at)}{job.deleted_by_name ? ` by ${job.deleted_by_name}` : ''}{job.deletion_reason ? ` — ${job.deletion_reason}` : ''}. All related history is preserved.</p>
          </div>
        </div>
      )}

      {/* Job Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Service Date</p>
              <p className="font-medium">{fmtDate(job.service_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lead Technician</p>
              <p className="font-medium">{job.lead_technician_name || job.technician_name || '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Apprentice</p>
              <p className="font-medium">{job.apprentice_name || '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned Truck</p>
              <p className="font-medium">{job.assigned_truck_number || '\u2014'}</p>
            </div>
            <div className="col-span-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Job Type</p>
              <p className="font-medium capitalize">{job.job_type?.replace(/_/g, ' ') || '\u2014'}</p>
            </div>
            <div className="col-span-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Dispatch Status</p>
              <p className="font-medium capitalize">{job.dispatch_status?.replace(/_/g, ' ') || 'unassigned'}</p>
            </div>
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-muted-foreground">Service Address</p>
              <p className="font-medium">{job.address}{job.city ? `, ${job.city}` : ''}{job.state ? `, ${job.state}` : ''} {job.zip || ''}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="assignment" className="gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Assignment</TabsTrigger>
          <TabsTrigger value="warehouse" className="gap-1.5"><Package className="w-3.5 h-3.5" /> Warehouse</TabsTrigger>
          <TabsTrigger value="scope" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Scope of Work</TabsTrigger>
          <TabsTrigger value="details" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Details</TabsTrigger>
        </TabsList>
        <TabsContent value="assignment">
          <JobAssignmentPanel job={job} onUpdated={() => {
            base44.entities.Job.get(id).then(setJob);
          }} />
        </TabsContent>
        <TabsContent value="warehouse">
          <JobWarehouseTab job={job} />
        </TabsContent>
        <TabsContent value="scope">
          <JobDetailScopeTab jobId={job.id} />
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle className="text-base">Job Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Customer ID:</span> <span className="font-mono">{job.customer_id || '\u2014'}</span></div>
                <div><span className="text-muted-foreground">Location ID:</span> <span className="font-mono">{job.location_id || '\u2014'}</span></div>
                <div><span className="text-muted-foreground">CRM Job #:</span> <span className="font-mono">{job.crm_job_number || '\u2014'}</span></div>
                <div><span className="text-muted-foreground">Tech Email:</span> {job.technician_email || '\u2014'}</div>
              </div>
              {job.notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{job.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DeleteJobDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        job={job}
        onDeleted={() => navigate('/admin/jobs')}
      />
    </div>
  );
}

function JobDetailScopeTab({ jobId }) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    base44.entities.Estimate.filter({ job_id: jobId })
      .then(estimates => setEstimate(estimates[0] || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!estimate) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No estimate is linked to this job.
        </CardContent>
      </Card>
    );
  }

  const hasScope = estimate.total_job_days > 0 || estimate.scope_of_work_plan;

  if (!hasScope) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3 text-center">
          <p className="text-sm text-muted-foreground">This estimate has no completed Scope of Work Plan.</p>
          <Link to={`/admin/estimates/${estimate.id}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open Estimate
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link to={`/admin/estimates/${estimate.id}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Open Estimate
          </Button>
        </Link>
      </div>
      <ScopeOfWorkSummary estimate={estimate} />
    </div>
  );
}