import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, Pencil, Eye, CheckCircle2, Upload, Archive, Loader2,
  Clock, Shield, AlertCircle, FileText, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  WORK_CATEGORIES, EXECUTION_MODES, ASSIGNMENT_MODES, CLAIM_MODES,
  INTERRUPTIBILITY_OPTIONS, TRIGGER_TYPES, RETURN_BEHAVIORS, labelFor,
  TEMPLATE_STATUS_COLORS,
} from '@/lib/taskTemplateConstants';

export default function TemplateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageTaskTemplate', { action: 'get', templateId: id });
      if (res.data?.success) {
        setTemplate(res.data.template);
        // Also load preview
        const previewRes = await base44.functions.invoke('manageTaskTemplate', { action: 'preview', templateId: id });
        if (previewRes.data?.success) setPreview(previewRes.data);
      }
    } catch (e) {
      console.error('Failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleLifecycle = async (action, label) => {
    setActing(true);
    try {
      const res = await base44.functions.invoke('manageTaskTemplate', { action, templateId: id });
      if (res.data?.success) {
        toast.success(label + ' successful');
        load();
      } else {
        toast.error(res.data?.error || 'Failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!template) return <div className="text-center py-12 text-muted-foreground">Template not found.</div>;

  const t = template;
  const usable = t.status === 'Approved' || t.status === 'Published';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/templates/registry')}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/templates/edit/${t.id}`}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Link>
          </Button>
          {t.status === 'Draft' && (
            <Button size="sm" variant="outline" onClick={() => handleLifecycle('submit_for_review', 'Submitted for review')} disabled={acting}>
              <Eye className="w-3.5 h-3.5 mr-1" /> Submit for Review
            </Button>
          )}
          {t.status === 'In Review' && (
            <Button size="sm" variant="outline" onClick={() => handleLifecycle('approve', 'Approved')} disabled={acting}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
          )}
          {t.status === 'Approved' && (
            <Button size="sm" onClick={() => handleLifecycle('publish', 'Published')} disabled={acting}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Publish
            </Button>
          )}
          {t.status !== 'Archived' && (
            <Button size="sm" variant="outline" onClick={() => handleLifecycle('archive', 'Archived')} disabled={acting}>
              <Archive className="w-3.5 h-3.5 mr-1" /> Archive
            </Button>
          )}
        </div>
      </div>

      {/* Identity */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-mono text-xs text-muted-foreground">{t.template_number}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TEMPLATE_STATUS_COLORS[t.status] || ''}`}>{t.status}</span>
            {t.work_category && <Badge variant="outline">{labelFor(WORK_CATEGORIES, t.work_category)}</Badge>}
            {usable && <Badge className="bg-emerald-100 text-emerald-700">Usable for Task Creation</Badge>}
            {t.requires_approval && <Badge className="bg-purple-100 text-purple-700">Approval Required</Badge>}
          </div>
          <h1 className="text-xl font-bold">{t.template_name}</h1>
          {t.description && <p className="text-sm text-muted-foreground mt-2">{t.description}</p>}
          <div className="grid sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div><span className="text-muted-foreground">Department: </span><span className="font-medium">{t.department_name_snapshot || '—'}</span></div>
            <div><span className="text-muted-foreground">Version: </span><span className="font-medium">{t.version}</span></div>
            <div><span className="text-muted-foreground">Created by: </span><span className="font-medium">{t.created_by || '—'}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Orchestration Classification */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Zap className="w-4 h-4 text-accent" /> Orchestration Classification</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Work Category</span><span className="font-medium">{labelFor(WORK_CATEGORIES, t.work_category)}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Default Priority</span><span className="font-medium">{t.default_priority || '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Business Impact</span><span className="font-medium">{t.business_impact || '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Urgency</span><span className="font-medium">{t.urgency || '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Interruptibility</span><span className="font-medium">{labelFor(INTERRUPTIBILITY_OPTIONS, t.interruptibility)}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Focus Lock Eligible</span><span className="font-medium">{t.focus_lock_eligible ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Resume Required</span><span className="font-medium">{t.resume_required ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Immediate Acknowledgment</span><span className="font-medium">{t.requires_immediate_acknowledgment ? 'Yes' : 'No'}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Assignment & Execution */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold mb-1">Assignment</h3>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Assignment Mode</span><span className="font-medium">{labelFor(ASSIGNMENT_MODES, t.assignment_mode)}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Claim Mode</span><span className="font-medium">{labelFor(CLAIM_MODES, t.claim_mode)}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Required Employees</span><span className="font-medium">{t.required_employee_count || 1}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold mb-1">Execution</h3>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Execution Mode</span><span className="font-medium">{labelFor(EXECUTION_MODES, t.execution_mode)}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Route</span><span className="font-medium font-mono text-xs">{t.execution_route || '—'}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Linked Module</span><span className="font-medium">{t.linked_module || '—'}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Timing */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-accent" /> Timing Rules</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Due Offset</span><span className="font-medium">{t.default_due_offset_minutes ? t.default_due_offset_minutes + ' min' : '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Must Start By</span><span className="font-medium">{t.must_start_offset_minutes ? t.must_start_offset_minutes + ' min' : '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Estimated Duration</span><span className="font-medium">{t.estimated_duration_minutes ? t.estimated_duration_minutes + ' min' : '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Overdue Escalation</span><span className="font-medium">{t.overdue_escalation_minutes ? t.overdue_escalation_minutes + ' min' : '—'}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Approval & Trigger */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Shield className="w-4 h-4 text-accent" /> Approval & Escalation</h3>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Requires Approval</span><span className="font-medium">{t.requires_approval ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Self Approval Prohibited</span><span className="font-medium">{t.self_approval_prohibited ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Return Behavior</span><span className="font-medium">{labelFor(RETURN_BEHAVIORS, t.return_for_correction_behavior)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><AlertCircle className="w-4 h-4 text-accent" /> Trigger</h3>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Trigger Type</span><span className="font-medium">{labelFor(TRIGGER_TYPES, t.trigger_type)}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Event Key</span><span className="font-medium font-mono text-xs">{t.trigger_event_key || '—'}</span></div>
            <div className="flex justify-between py-1 border-b text-sm"><span className="text-muted-foreground">Cooldown</span><span className="font-medium">{t.cooldown_minutes ? t.cooldown_minutes + ' min' : '—'}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* AI Assistance */}
      {(t.ai_classification_enabled || t.ai_guidance_enabled || t.ai_may_suggest_assignment || t.ai_may_suggest_priority || t.ai_may_suggest_template) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-blue-800">
              <FileText className="w-4 h-4" /> AI Assistance (Advisory Only)
            </h3>
            <p className="text-xs text-blue-700">
              AI may suggest but never publishes templates, assigns binding priority, interrupts employees, or approves tasks.
              All AI recommendations require manager confirmation.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 mt-2 text-sm">
              {t.ai_classification_enabled && <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Classification Enabled</div>}
              {t.ai_guidance_enabled && <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Guidance Enabled</div>}
              {t.ai_may_suggest_assignment && <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> May Suggest Assignment</div>}
              {t.ai_may_suggest_priority && <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> May Suggest Priority</div>}
              {t.ai_may_suggest_template && <div className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> May Suggest Template</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview — Projected Task Fields */}
      {preview?.projected_fields && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Eye className="w-4 h-4 text-accent" /> Template Preview — Projected Task Fields</h3>
            <p className="text-xs text-muted-foreground mb-3">This is what a task created from this template would look like. No production task is created during preview.</p>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {Object.entries(preview.projected_fields).map(([key, val]) => (
                <div key={key} className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground text-xs">{key}</span>
                  <span className="font-medium text-xs text-right max-w-48 truncate">{String(val ?? '—')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle History */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold mb-1">Lifecycle</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Created by</span><span className="font-medium">{t.created_by || '—'}</span></div>
            <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Created at</span><span className="font-medium">{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</span></div>
            {t.submitted_for_review_at && <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Submitted</span><span className="font-medium">{new Date(t.submitted_for_review_at).toLocaleString()}</span></div>}
            {t.reviewed_by && <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Reviewed by</span><span className="font-medium">{t.reviewed_by}</span></div>}
            {t.approved_by && <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Approved by</span><span className="font-medium">{t.approved_by}</span></div>}
            {t.published_by && <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">Published by</span><span className="font-medium">{t.published_by}</span></div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}