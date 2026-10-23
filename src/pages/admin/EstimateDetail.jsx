import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, ArrowLeft, CalendarCheck, AlertTriangle, CheckCircle2,
  FileText, ClipboardList, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import ScopeOfWorkSummary from '@/components/estimates/ScopeOfWorkSummary';
import SchedulingContextEditor from '@/components/estimates/SchedulingContextEditor';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  execution_plan: 'bg-indigo-100 text-indigo-700',
  ready_for_presentation: 'bg-cyan-100 text-cyan-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  ready_for_scheduling: 'bg-purple-100 text-purple-700',
};

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function EstimateDetailsView({ estimate }) {
  const lineItems = safeParse(estimate.line_items, []);
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Estimate Name</p>
            <p className="font-medium">{estimate.estimate_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="font-medium">{estimate.customer_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Subtotal</p>
            <p className="font-medium">{estimate.subtotal ? `$${estimate.subtotal.toFixed(2)}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-medium">{estimate.total ? `$${estimate.total.toFixed(2)}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valid Until</p>
            <p className="font-medium">{estimate.valid_until || '—'}</p>
          </div>
        </CardContent>
      </Card>

      {lineItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Line Items</CardTitle></CardHeader>
          <CardContent>
            {lineItems.map((item, i) => (
              <div key={i} className="flex justify-between py-1.5 text-sm border-b last:border-0">
                <span>{item.description || item.name || `Item ${i + 1}`}</span>
                <span className="font-medium">
                  {(item.amount || item.total) ? `$${(item.amount || item.total).toFixed(2)}` : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {estimate.notes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{estimate.notes}</p></CardContent>
        </Card>
      )}

      <ScopeOfWorkSummary estimate={estimate} />
    </div>
  );
}

export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [markingReady, setMarkingReady] = useState(false);
  const [activeView, setActiveView] = useState('scope');
  const [estimateName, setEstimateName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [schedulingReadiness, setSchedulingReadiness] = useState(null);
  const [schedulingLoading, setSchedulingLoading] = useState(false);

  // ── Server-authoritative scheduling readiness ──
  // Evaluates the customer-selected, accepted option ONLY. Replaces the old
  // local `total_job_days > 0 && accepted` check with an exact blocker list.
  const refreshSchedulingReadiness = useCallback(async (jobId) => {
    const jid = jobId || estimate?.job_id;
    if (!jid) { setSchedulingReadiness(null); return; }
    setSchedulingLoading(true);
    try {
      const res = await base44.functions.invoke('validateSchedulingReadiness', { job_id: jid });
      setSchedulingReadiness(res.data);
    } catch (e) {
      console.error('Scheduling readiness failed:', e);
      setSchedulingReadiness(null);
    } finally { setSchedulingLoading(false); }
  }, [estimate?.job_id]);

  useEffect(() => { refreshSchedulingReadiness(); }, [estimate?.id, refreshSchedulingReadiness]);

  useEffect(() => {
    if (estimate) setEstimateName((estimate.estimate_name || '').toString().trim().slice(0, 120));
  }, [estimate]);

  const handleSaveName = async () => {
    const trimmed = estimateName.trim().slice(0, 120);
    if (!trimmed) {
      toast.error('Enter an Estimate Name before saving or sending this estimate.');
      return;
    }
    setSavingName(true);
    try {
      const updated = await base44.entities.Estimate.update(estimate.id, { estimate_name: trimmed });
      setEstimate(updated);
      toast.success('Estimate Name saved');
    } catch (e) {
      toast.error('Failed to save Estimate Name');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    base44.entities.Estimate.get(id)
      .then(setEstimate)
      .catch(() => toast.error('Failed to load estimate'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaved = (updated) => { setEstimate(updated); refreshSchedulingReadiness(updated?.job_id); };

  const schedulingReady = !!schedulingReadiness?.ready;
  const schedulingBlockers = (schedulingReadiness?.blocking_requirements || []).map(b => b.message);

  // ── Server-authoritative "Ready for Scheduling" ──
  // Calls the backend gatekeeper which validates ALL readiness criteria
  // (selected option, acceptance, signature, scope, pricing, scaffold, fleet)
  // BEFORE changing the Estimate status. Idempotent — repeated clicks or
  // rapid-click attempts are safe; the server rejects if not ready.
  const handleReadyForScheduling = async () => {
    if (markingReady) return; // rapid-click guard
    setMarkingReady(true);
    try {
      const res = await base44.functions.invoke('markEstimateReadyForScheduling', {
        job_id: estimate.job_id,
        estimate_id: estimate.id,
      });
      const result = res.data;
      if (result?.ready) {
        // Refresh the estimate from the server (status was updated server-side)
        const updated = await base44.entities.Estimate.get(estimate.id);
        setEstimate(updated);
        refreshSchedulingReadiness(updated?.job_id);
        toast.success('Estimate marked Ready for Scheduling — Fleet and Warehouse notified');
      } else {
        // Server rejected — show exact blockers
        const blockers = (result?.blocking_requirements || []).map(b => b.message);
        if (blockers.length > 0) {
          toast.error(`Cannot mark Ready for Scheduling: ${blockers[0]}`);
        } else {
          toast.error('Cannot mark Ready for Scheduling — unknown reason');
        }
        refreshSchedulingReadiness(estimate?.job_id);
      }
    } catch (e) {
      toast.error('Failed to mark Ready for Scheduling');
    } finally {
      setMarkingReady(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (!estimate) {
    return (
      <Card className="m-4"><CardContent className="p-6 text-center">
        <p className="text-muted-foreground">Estimate not found.</p>
        <Button variant="outline" className="mt-3 gap-1" onClick={() => navigate('/admin/estimates')}>
          <ArrowLeft className="w-4 h-4" /> Back to Estimates
        </Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {estimate.customer_name || 'Estimate'}
              <Badge className={`text-xs ${STATUS_COLORS[estimate.status] || ''}`}>
                {(estimate.status || '').replace(/_/g, ' ')}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {estimate.total != null ? `$${estimate.total.toFixed(2)}` : '—'}
              {estimate.valid_until ? ` · Valid until ${estimate.valid_until}` : ''}
            </p>
          </div>
        </div>

        {/* Completion badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${schedulingReady ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {schedulingReady ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {schedulingReady ? 'Execution Plan Complete' : 'Execution Plan Incomplete'}
        </div>
      </div>

      {/* Estimate Name (editable) */}
      <Card>
        <CardContent className="p-4 space-y-1.5">
          <Label htmlFor="estimate-name" className="text-sm font-semibold">Estimate Name</Label>
          <div className="flex gap-2">
            <Input
              id="estimate-name"
              type="text"
              maxLength={120}
              placeholder="Example: Crown Repair Option"
              value={estimateName}
              onChange={(e) => setEstimateName(e.target.value.slice(0, 120))}
            />
            <Button
              onClick={handleSaveName}
              disabled={savingName}
              className="gap-1.5 flex-shrink-0"
            >
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Name
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">This name will identify the estimate in ServiceTitan.</p>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-b pb-2 flex-wrap">
        <Button
          variant={activeView === 'details' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveView('details')}
          className="gap-1.5"
        >
          <FileText className="w-4 h-4" /> Estimate Details
        </Button>
        <Button
          variant={activeView === 'scope' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveView('scope')}
          className="gap-1.5"
        >
          <ClipboardList className="w-4 h-4" /> Execution Plan
        </Button>
        <div className="flex-1" />
        {estimate.status !== 'ready_for_scheduling' && (
          <Button
            onClick={handleReadyForScheduling}
            disabled={markingReady || !schedulingReady}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            title={!schedulingReady ? schedulingBlockers.join(' · ') : 'Mark Ready for Scheduling'}
          >
            {markingReady ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
            Ready for Scheduling
          </Button>
        )}
      </div>

      {/* Server-authoritative scheduling readiness — exact blocker checklist */}
      {estimate.status !== 'ready_for_scheduling' && !schedulingReady && (
        <div className="space-y-2">
          {schedulingLoading && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking scheduling readiness…</span>
            </div>
          )}
          {!schedulingLoading && schedulingBlockers.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Validating scheduling readiness for the selected option…</span>
            </div>
          )}
          {schedulingBlockers.map((msg, i) => (
            <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}
      {estimate.status !== 'ready_for_scheduling' && schedulingReady && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Selected option is ready for scheduling. Click "Ready for Scheduling" to notify Fleet and Warehouse.</span>
        </div>
      )}

      {/* Content */}
      {activeView === 'details' && <EstimateDetailsView estimate={estimate} />}
      {activeView === 'scope' && (
        <div className="space-y-3">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Daily Work Plan and equipment are now managed per-option in Job Hub. The summary below is read-only historical data; scheduling context remains editable.</span>
            </CardContent>
          </Card>
          <ScopeOfWorkSummary estimate={estimate} />
          <SchedulingContextEditor estimate={estimate} onSaved={handleSaved} />
        </div>
      )}
    </div>
  );
}