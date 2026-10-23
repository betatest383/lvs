import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, Circle, ChevronDown, Loader2, ShieldCheck,
  AlertTriangle, Clock, ClipboardList, PackageCheck, Truck, Boxes,
} from 'lucide-react';
import {
  NIGHT_BEFORE_STEPS, parseWorkflowChecks, computeStepStatus,
  computeOverallReadiness, computeOverallStatus, computeNightBeforeAutoDisplay,
} from '@/lib/nightBeforePrepConfig';
import SignatureModal from '@/components/shared/SignatureModal';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS_STYLE = {
  complete: { bg: 'bg-green-500', text: 'text-green-600', label: 'Complete', ring: 'ring-green-200' },
  waiting: { bg: 'bg-amber-400', text: 'text-amber-600', label: 'Waiting', ring: 'ring-amber-200' },
  blocked: { bg: 'bg-red-500', text: 'text-red-600', label: 'Blocked', ring: 'ring-red-200' },
};

export default function NightBeforePrepCard({
  prepDate, serviceDate, truck, truckNumber, techEmail, techName,
  jobNumber, customerName, data, warehouseManagerName, canSignOff,
}) {
  const [record, setRecord] = useState(null);
  const [workflowChecks, setWorkflowChecks] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeStepId, setActiveStepId] = useState(null);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [signOffComments, setSignOffComments] = useState('');

  const loadOrCreate = useCallback(async () => {
    if (!prepDate || !truckNumber) return;
    try {
      const existing = await base44.entities.NightBeforePrep.filter({
        prep_date: prepDate,
        truck_number: truckNumber,
      });
      if (existing.length > 0) {
        const rec = existing[0];
        setRecord(rec);
        setWorkflowChecks(parseWorkflowChecks(rec));
      } else {
        const prepId = `NBP-${prepDate.replace(/-/g, '')}-${truckNumber}`;
        const created = await base44.entities.NightBeforePrep.create({
          prep_id: prepId,
          prep_date: prepDate,
          service_date: serviceDate,
          truck_id: truck?.truck_id || '',
          truck_number: truckNumber,
          technician_email: techEmail || '',
          technician_name: techName || '',
          job_number: jobNumber || '',
          customer_name: customerName || '',
          overall_status: 'waiting',
          readiness_percentage: 0,
          signed_off: false,
          staged: false,
        });
        setRecord(created);
        setWorkflowChecks({});
      }
    } catch (e) {
      console.error('Night Before Prep load error:', e);
    } finally {
      setLoading(false);
    }
  }, [prepDate, serviceDate, truckNumber, truck, techEmail, techName, jobNumber, customerName]);

  useEffect(() => { loadOrCreate(); }, [loadOrCreate]);

  const persistChecks = async (newChecks) => {
    setWorkflowChecks(newChecks);
    if (record?.id) {
      const readiness = computeOverallReadiness(newChecks, record);
      const overall = computeOverallStatus(newChecks, record);
      const updates = {
        workflow_checks: JSON.stringify(newChecks),
        overall_status: overall,
        readiness_percentage: readiness,
      };
      setRecord(prev => ({ ...prev, ...updates }));
      await base44.entities.NightBeforePrep.update(record.id, updates).catch(() => {});
    }
  };

  const updateStepStatus = async (step, newChecks) => {
    if (step.checks.length === 0) return;
    const allComplete = step.checks.every(c => (newChecks[c.id]?.status || 'waiting') === 'complete');
    if (!allComplete) return;
    const updates = {};
    if (step.statusField) updates[step.statusField] = 'complete';
    if (step.id === 'staging') {
      updates.staged = true;
      updates.staged_at = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0 && record?.id) {
      setRecord(prev => ({ ...prev, ...updates }));
      await base44.entities.NightBeforePrep.update(record.id, updates).catch(() => {});
    }
  };

  const toggleSubCheck = async (checkId, step) => {
    if (record?.signed_off) return;
    const entry = workflowChecks[checkId];
    const isComplete = entry?.status === 'complete';
    const now = new Date().toISOString();
    const newChecks = {
      ...workflowChecks,
      [checkId]: isComplete
        ? { status: 'waiting' }
        : { status: 'complete', completed_at: now, completed_by: warehouseManagerName || 'Warehouse Staff' },
    };
    await persistChecks(newChecks);
    await updateStepStatus(step, newChecks);
  };

  const handleSignOff = async (signatureDataUrl) => {
    const now = new Date().toISOString();
    const updates = {
      signed_off: true,
      signed_off_by: warehouseManagerName || 'Warehouse Manager',
      signed_off_at: now,
      signature_data_url: signatureDataUrl,
      signoff_comments: signOffComments,
      warehouse_signoff_status: 'complete',
      overall_status: 'complete',
      readiness_percentage: 100,
    };
    setRecord(prev => ({ ...prev, ...updates }));
    await base44.entities.NightBeforePrep.update(record.id, updates);
    setSignOffOpen(false);
    toast.success('Night Before Preparation signed off and complete.');
  };

  if (loading) {
    return (
      <Card className="border-2 border-indigo-200">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </CardContent>
      </Card>
    );
  }

  if (!record) {
    return (
      <Card className="border-2 border-indigo-200">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Unable to load night before preparation.
        </CardContent>
      </Card>
    );
  }

  const readinessPct = record.readiness_percentage || 0;
  const overallStatus = record.overall_status || 'waiting';
  const signedOff = record.signed_off;

  const stepStatuses = NIGHT_BEFORE_STEPS.map(step => ({
    ...step,
    status: computeStepStatus(step, workflowChecks, record),
  }));
  const firstIncompleteIdx = stepStatuses.findIndex(s => s.status !== 'complete' && !s.isSignOffStep);
  const activeIdx = activeStepId
    ? stepStatuses.findIndex(s => s.id === activeStepId)
    : (firstIncompleteIdx >= 0 ? firstIncompleteIdx : NIGHT_BEFORE_STEPS.length - 1);

  const headerColor = signedOff ? 'border-green-300'
    : overallStatus === 'ready' ? 'border-green-300'
    : overallStatus === 'blocked' ? 'border-red-300'
    : 'border-indigo-200';

  const allStepsComplete = stepStatuses.filter(s => !s.isSignOffStep).every(s => s.status === 'complete');

  return (
    <Card className={`border-2 ${headerColor} shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            Night Before Preparation
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-800 text-white font-medium">Truck {truckNumber}</span>
          </CardTitle>
          <div className="text-right">
            <span className={`text-2xl font-bold ${signedOff ? 'text-green-600' : readinessPct === 100 ? 'text-green-600' : 'text-indigo-600'}`}>
              {readinessPct}%
            </span>
            {signedOff && (
              <p className="text-xs text-green-600 font-medium flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> Signed Off {moment(record.signed_off_at).format('h:mm A')}
              </p>
            )}
          </div>
        </div>
        <Progress value={readinessPct} className="h-2 mt-2" />
        <p className="text-xs text-muted-foreground mt-1">
          Prep for {moment(serviceDate).format('ddd, MMM D')} — {techName || 'Unassigned'}
        </p>
      </CardHeader>

      <CardContent className="space-y-1">
        <div className="space-y-0">
          {stepStatuses.map((step, idx) => (
            <NightBeforeStep
              key={step.id}
              step={step}
              isExpanded={idx === activeIdx && !signedOff}
              onToggle={() => setActiveStepId(activeIdx === idx ? null : step.id)}
              workflowChecks={workflowChecks}
              onToggleCheck={toggleSubCheck}
              record={record}
              autoDisplayData={step.autoDisplay ? computeNightBeforeAutoDisplay(step.id, data) : null}
              truckNumber={truckNumber}
            />
          ))}
        </div>

        {!signedOff && (
          <div className="mt-4 space-y-2">
            {allStepsComplete ? (
              <>
                <Textarea
                  placeholder="Sign-off comments (optional)..."
                  value={signOffComments}
                  onChange={e => setSignOffComments(e.target.value)}
                  className="text-sm"
                  rows={2}
                />
                <Button
                  onClick={() => setSignOffOpen(true)}
                  disabled={!canSignOff}
                  className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <ShieldCheck className="w-5 h-5 mr-2" /> Complete Warehouse Sign-Off
                </Button>
                {!canSignOff && (
                  <p className="text-xs text-center text-muted-foreground">
                    Only warehouse managers or admins can sign off.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-center text-muted-foreground py-2">
                Complete all 6 preparation steps to enable sign-off.
              </p>
            )}
          </div>
        )}

        {signedOff && (
          <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-bold text-green-700">Night Before Preparation Complete</p>
              <p className="text-xs text-green-600">
                Signed by {record.signed_off_by} at {moment(record.signed_off_at).format('MMM D, h:mm A')}
                {record.staged && ' — Staged for morning pickup'}
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <SignatureModal
        open={signOffOpen}
        onClose={() => setSignOffOpen(false)}
        onSign={handleSignOff}
        title="Warehouse Sign-Off"
        statement={`I confirm that all night before preparation steps are complete for Truck ${truckNumber} (${techName || 'Unassigned'}). All materials, consumables, equipment, and staging are ready for morning pickup.`}
      />
    </Card>
  );
}

function NightBeforeStep({ step, isExpanded, onToggle, workflowChecks, onToggleCheck, record, autoDisplayData, truckNumber }) {
  const status = step.status;
  const style = STATUS_STYLE[status] || STATUS_STYLE.waiting;
  const isComplete = status === 'complete';
  const Icon = step.icon;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isComplete ? 'bg-green-500 text-white' :
          isExpanded ? `${style.bg} text-white ring-4 ${style.ring}` :
          'bg-muted text-muted-foreground'
        }`}>
          {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
        </div>
        <div className={`w-0.5 flex-1 min-h-[1.5rem] my-1 ${isComplete ? 'bg-green-300' : 'bg-muted'}`} />
      </div>

      <div className="flex-1 pb-3 min-w-0">
        <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 text-left mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-muted-foreground">{step.number}.</span>
            <p className="text-sm font-semibold truncate">{step.title}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isExpanded && (
          <div className="space-y-2 mt-1.5">
            <p className="text-xs text-muted-foreground">{step.purpose}</p>

            {step.isSignOffStep && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg ${record?.signed_off ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                {record?.signed_off ? (
                  <><CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-700">Signed off by {record.signed_off_by} at {moment(record.signed_off_at).format('h:mm A')}</p></>
                ) : (
                  <><Circle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium text-amber-700">Complete all steps above, then use the sign-off button below.</p></>
                )}
              </div>
            )}

            {step.checks.length > 0 && (
              <div className="space-y-0.5">
                {step.checks.map(check => (
                  <ChecklistItem
                    key={check.id}
                    check={check}
                    workflowChecks={workflowChecks}
                    onToggle={cid => onToggleCheck(cid, step)}
                    disabled={record?.signed_off}
                  />
                ))}
              </div>
            )}

            {step.autoDisplay && autoDisplayData && (
              <AutoDisplayPanel stepId={step.id} data={autoDisplayData} truckNumber={truckNumber} />
            )}

            {step.actions && step.actions.length > 0 && !record?.signed_off && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {step.actions.map(action => (
                  <Link key={action.id} to={action.link}>
                    <Button size="sm" variant={action.variant} className="h-7 text-xs">{action.label}</Button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ check, workflowChecks, onToggle, disabled }) {
  const entry = workflowChecks[check.id];
  const isComplete = entry?.status === 'complete';
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {isComplete
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <Circle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
        <span className={isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}>
          {check.label}
        </span>
      </div>
      {!isComplete && (
        <Button size="sm" variant="default" className="h-6 text-[11px] px-2" onClick={() => onToggle(check.id)} disabled={disabled}>
          Mark Done
        </Button>
      )}
      {isComplete && !disabled && (
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => onToggle(check.id)}>
          Undo
        </Button>
      )}
    </div>
  );
}

function AutoDisplayPanel({ stepId, data, truckNumber }) {
  if (stepId === 'schedule_review') {
    const { jobs = [], technicians = [], hasUrgent } = data;
    if (jobs.length === 0) {
      return (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
          <ClipboardList className="w-3.5 h-3.5" /> No jobs scheduled for tomorrow.
        </div>
      );
    }
    return (
      <div className="rounded-lg bg-muted/40 border border-border p-2 space-y-1.5 text-xs">
        <p className="font-medium text-foreground flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Tomorrow's Schedule ({jobs.length} job{jobs.length !== 1 ? 's' : ''})
        </p>
        {hasUrgent && (
          <div className="flex items-center gap-1 p-1.5 rounded bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle className="w-3.5 h-3.5" /> Urgent priority job(s) scheduled
          </div>
        )}
        <div className="space-y-0.5">
          {jobs.slice(0, 5).map(job => (
            <div key={job.id} className="flex items-center justify-between gap-2 p-1 rounded bg-background">
              <span className="truncate font-medium">{job.customer_name}</span>
              <span className="text-muted-foreground flex-shrink-0">
                {job.job_type} · {job.priority}
              </span>
            </div>
          ))}
          {jobs.length > 5 && <p className="text-muted-foreground">+{jobs.length - 5} more...</p>}
        </div>
        <p className="text-muted-foreground">Technicians: {technicians.join(', ') || 'Unassigned'}</p>
      </div>
    );
  }

  if (stepId === 'build_transfers') {
    const { transfers = [] } = data;
    if (transfers.length === 0) {
      return (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" /> No transfer sheets generated yet for tomorrow.
        </div>
      );
    }
    return (
      <div className="rounded-lg bg-muted/40 border border-border p-2 space-y-1 text-xs">
        <p className="font-medium text-foreground flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Transfer Sheets ({transfers.length})
        </p>
        {transfers.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 p-1 rounded bg-background">
            <span className="truncate font-mono">{t.transfer_id || t.id}</span>
            <span className="text-muted-foreground">{t.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (stepId === 'consumable_replenishment') {
    const { requests = [] } = data;
    return (
      <div className="rounded-lg bg-muted/40 border border-border p-2 space-y-1 text-xs">
        <p className="font-medium text-foreground flex items-center gap-1">
          <PackageCheck className="w-3.5 h-3.5" /> Replenishment Requests ({requests.length})
        </p>
        {requests.length === 0 && <p className="text-muted-foreground">No replenishment requests yet.</p>}
        {requests.slice(0, 4).map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 p-1 rounded bg-background">
            <span className="truncate">{r.request_id || r.id}</span>
            <span className="text-muted-foreground">{r.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (stepId === 'fleet_review') {
    const { trucks = [] } = data;
    const truckMatch = trucks.find(t =>
      t.truck_number === truckNumber || t.truck_id === truckNumber
    );
    if (!truckMatch) {
      return (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <Truck className="w-3.5 h-3.5" /> No truck profile found for {truckNumber}.
        </div>
      );
    }
    const issues = [];
    if (truckMatch.status === 'Out of Service' || truckMatch.status === 'Maintenance') issues.push(`Truck status: ${truckMatch.status}`);
    if (truckMatch.next_inspection_date && new Date(truckMatch.next_inspection_date) < new Date()) issues.push('Inspection overdue');
    return (
      <div className={`rounded-lg border p-2 space-y-1 text-xs ${issues.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
        <p className={`font-medium flex items-center gap-1 ${issues.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
          <Truck className="w-3.5 h-3.5" /> Truck {truckMatch.truck_number || truckMatch.vehicle_name} — {truckMatch.status}
        </p>
        {issues.length > 0 ? (
          issues.map((issue, i) => <p key={i} className="text-red-600">⚠ {issue}</p>)
        ) : (
          <p className="text-green-600">No issues detected</p>
        )}
      </div>
    );
  }

  return null;
}