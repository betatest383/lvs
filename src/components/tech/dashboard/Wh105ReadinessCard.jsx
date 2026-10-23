import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Play, Sunrise, AlertTriangle, CheckCircle2, Loader2, ShieldCheck,
  HelpCircle, Flag, Clock, UserCog,
} from 'lucide-react';
import Wh105CheckItem from '@/components/wh105/Wh105CheckItem';
import ManagerOverrideDialog from '@/components/wh105/ManagerOverrideDialog';
import {
  CHECK_DEFINITIONS, STATUS_CONFIG, OVERRIDE_ROLES,
  computeAutoChecks, mergeChecks, computeReadiness, computeOverallStatus,
  getBlockingIssues, canStartMyDay,
} from '@/lib/wh105Constants';
import { toast } from 'sonner';

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
};

export default function Wh105ReadinessCard({
  consumableReqs = [], transferSheets = [], materialReturns = [], equipment = [],
  truck, truckNumber, todayJobs = [], identity, canOverride, managerName, today,
}) {
  const [record, setRecord] = useState(null);
  const [merged, setMerged] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionText, setActionText] = useState('');

  const techEmail = identity?.email || '';
  const techName = identity?.fullName || '';
  const techEmployeeId = identity?.employeeId || '';
  const techTruckNumber = identity?.truckNumber || truckNumber || '';
  const isImpersonating = identity?.isImpersonating || false;

  const loadOrCreate = useCallback(async () => {
    if (!techEmail || !today) return;
    try {
      const existing = await base44.entities.Wh105DepartureCheck.filter({
        technician_email: techEmail,
        date: today,
      });

      const autoChecks = computeAutoChecks({ consumableReqs, transferSheets, materialReturns, equipment, truck, todayJobs, today });

      if (existing.length > 0) {
        const rec = existing[0];
        const m = mergeChecks(rec, autoChecks);
        const readiness = computeReadiness(m);
        const overall = computeOverallStatus(m, rec.departed);
        const blockingDetail = getBlockingIssues(m, autoChecks._detail);
        const updates = {};
        let changed = false;
        for (const def of CHECK_DEFINITIONS) {
          const field = `${def.id}_status`;
          if (rec[field] !== m[def.id]) {
            updates[field] = m[def.id];
            changed = true;
          }
        }
        updates.overall_status = overall;
        updates.readiness_percentage = readiness;
        updates.blocking_issues_detail = JSON.stringify(blockingDetail);
        if (truck?.truck_id && rec.truck_id !== truck.truck_id) { updates.truck_id = truck.truck_id; changed = true; }
        if (techTruckNumber && rec.truck_number !== techTruckNumber) { updates.truck_number = techTruckNumber; changed = true; }

        if (changed || rec.overall_status !== overall || rec.readiness_percentage !== readiness) {
          await base44.entities.Wh105DepartureCheck.update(rec.id, updates).catch(() => {});
        }
        setRecord({ ...rec, ...updates });
        setMerged(m);
        setDetail(autoChecks._detail);
      } else {
        const m = mergeChecks({}, autoChecks);
        const readiness = computeReadiness(m);
        const overall = computeOverallStatus(m, false);
        const blockingDetail = getBlockingIssues(m, autoChecks._detail);
        const depId = `DEP-${today.replace(/-/g, '')}-${techTruckNumber || 'NA'}`;
        const created = await base44.entities.Wh105DepartureCheck.create({
          departure_id: depId,
          date: today,
          technician_email: techEmail,
          technician_name: techName,
          truck_id: truck?.truck_id || '',
          truck_number: techTruckNumber || '',
          job_number: todayJobs[0]?.job_number || todayJobs[0]?.id || '',
          ...Object.fromEntries(CHECK_DEFINITIONS.map(c => [`${c.id}_status`, m[c.id]])),
          blocking_issues_detail: JSON.stringify(blockingDetail),
          overall_status: overall,
          readiness_percentage: readiness,
          departed: false,
        });
        setRecord(created);
        setMerged(m);
        setDetail(autoChecks._detail);
      }
    } catch (e) {
      console.error('WH-105 load error:', e);
    } finally {
      setLoading(false);
    }
  }, [techEmail, techName, techTruckNumber, today, consumableReqs, transferSheets, materialReturns, equipment, truck, todayJobs]);

  useEffect(() => { loadOrCreate(); }, [loadOrCreate]);

  const updateRecord = async (updates, newMerged) => {
    const m = newMerged || merged;
    const readiness = computeReadiness(m);
    const overall = computeOverallStatus(m, record.departed);
    const fullUpdates = { ...updates, overall_status: overall, readiness_percentage: readiness };
    setRecord(prev => ({ ...prev, ...fullUpdates }));
    setMerged(m);
    await base44.entities.Wh105DepartureCheck.update(record.id, fullUpdates).catch(() => {});
  };

  const toggleManual = (checkId) => {
    const field = `${checkId}_status`;
    const current = merged[checkId];
    const newStatus = current === 'complete' ? 'waiting' : 'complete';
    const newMerged = { ...merged, [checkId]: newStatus };
    updateRecord({ [field]: newStatus }, newMerged);
  };

  const markNotRequired = (checkId) => {
    const field = `${checkId}_status`;
    const newMerged = { ...merged, [checkId]: 'not_required' };
    updateRecord({ [field]: 'not_required' }, newMerged);
  };

  const handleOverride = async (signatureDataUrl, reason) => {
    const overrides = JSON.parse(record.manager_overrides || '[]');
    overrides.push({
      check_id: overrideTarget.id,
      check_label: overrideTarget.label,
      reason,
      signature_data_url: signatureDataUrl,
      override_by: managerName || techName,
      override_at: new Date().toISOString(),
    });
    const field = `${overrideTarget.id}_status`;
    const newMerged = { ...merged, [overrideTarget.id]: 'manager_override' };
    await updateRecord({ [field]: 'manager_override', manager_overrides: JSON.stringify(overrides) }, newMerged);
    setOverrideTarget(null);
    toast.success(`Override applied: ${overrideTarget.label}`);
  };

  const startMyDay = async () => {
    setStarting(true);
    try {
      const response = await base44.functions.invoke('startMyDay', { departure_id: record.id });
      setRecord(prev => ({
        ...prev,
        departed: true,
        departure_timestamp: response.data.departure_timestamp,
        overall_status: 'departed',
        readiness_percentage: 100,
      }));
      toast.success(`Day started! Truck ${techTruckNumber} is in service.`);
    } catch (e) {
      console.error('Start My Day failed:', e);
      toast.error('Failed to start day. Check readiness requirements.');
    } finally {
      setStarting(false);
    }
  };

  const submitAction = async () => {
    if (!actionText.trim()) return;
    const now = new Date().toISOString();
    if (actionDialog.type === 'help') {
      await updateRecord({ help_requested: true, help_requested_at: now, help_request_reason: actionText.trim() });
      toast.success('Help request sent to warehouse team.');
    } else {
      await updateRecord({ issue_reported: true, issue_reported_at: now, issue_reported_detail: actionText.trim() });
      toast.success('Issue reported. Management has been notified.');
    }
    setActionDialog(null);
    setActionText('');
  };

  if (loading) {
    return (
      <Card className="border-2 border-amber-200">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  if (!record || !merged) {
    return (
      <Card className="border-2 border-amber-200">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Unable to load departure checklist.
        </CardContent>
      </Card>
    );
  }

  const readinessPct = record.readiness_percentage || 0;
  const blockingIssues = getBlockingIssues(merged, detail);
  const readyToStart = canStartMyDay(merged) && !record.departed;
  const overallStatus = record.overall_status || 'waiting';

  const headerColor = record.departed ? 'border-blue-300'
    : overallStatus === 'ready' ? 'border-green-300'
    : overallStatus === 'blocked' ? 'border-red-300'
    : 'border-amber-200';

  return (
    <Card className={`border-2 ${headerColor} shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sunrise className="w-5 h-5 text-amber-500" />
            Morning Readiness
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white font-medium">WH-105</span>
          </CardTitle>
          <span className={`text-2xl font-bold ${record.departed ? 'text-blue-600' : overallStatus === 'ready' ? 'text-green-600' : overallStatus === 'blocked' ? 'text-red-600' : 'text-amber-600'}`}>
            {readinessPct}%
          </span>
        </div>
        <Progress value={readinessPct} className="h-2 mt-2" />

        {/* Identity Check */}
        <div className="mt-3 p-3 rounded-lg bg-muted/60 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
            <UserCog className="w-3.5 h-3.5 text-accent" />
            Identity Check
            {isImpersonating && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-semibold ml-auto">Acting As</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <span className="text-muted-foreground">Acting As:</span>{' '}
              <span className="font-medium">{techName || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Employee ID:</span>{' '}
              <span className="font-mono font-medium">{techEmployeeId || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Assigned Truck:</span>{' '}
              <span className="font-medium">{techTruckNumber || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">WH-105 ID:</span>{' '}
              <span className="font-mono font-medium">{record.departure_id || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{' '}
              <span className="font-medium capitalize">{overallStatus}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Last Updated:</span>{' '}
              <span className="font-medium">{formatDateTime(record.updated_date)}</span>
            </div>
          </div>
        </div>

        {record.departed && (
          <div className="flex items-center gap-2 mt-2 text-sm text-blue-600 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Departed at {formatTime(record.departure_timestamp)}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          {CHECK_DEFINITIONS.map(def => (
            <Wh105CheckItem
              key={def.id}
              def={def}
              status={merged[def.id]}
              detail={detail?.[def.id]}
              onToggle={() => toggleManual(def.id)}
              onMarkNotRequired={() => markNotRequired(def.id)}
              onOverride={() => setOverrideTarget({ id: def.id, label: def.label })}
              canOverride={canOverride}
            />
          ))}
        </div>

        {blockingIssues.length > 0 && !record.departed && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Blocking Issues ({blockingIssues.length})</p>
              <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                {blockingIssues.map((issue, i) => (
                  <li key={i}>• {issue.label}{issue.detail ? ` — ${issue.detail}` : ''}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {readyToStart && !record.departed && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm font-medium text-green-700">All checks passed — ready to start your day!</p>
          </div>
        )}

        {!record.departed && (
          <Button
            onClick={startMyDay}
            disabled={!readyToStart || starting}
            className={`w-full h-14 text-lg font-bold select-none ${readyToStart ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-muted text-muted-foreground'}`}
          >
            {starting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}
            {starting ? 'Starting...' : 'Start My Day'}
          </Button>
        )}

        {!record.departed && !readyToStart && (
          <p className="text-xs text-center text-muted-foreground">
            Resolve all blocking issues to enable Start My Day
          </p>
        )}

        {!record.departed && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => { setActionDialog({ type: 'help' }); setActionText(''); }} className="select-none">
              <HelpCircle className="w-3.5 h-3.5 mr-1" /> Request Help
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setActionDialog({ type: 'issue' }); setActionText(''); }} className="select-none">
              <Flag className="w-3.5 h-3.5 mr-1" /> Report Issue
            </Button>
          </div>
        )}

        {record.help_requested && (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <Clock className="w-3 h-3" /> Help requested at {formatTime(record.help_requested_at)}
          </div>
        )}
        {record.issue_reported && (
          <div className="flex items-center gap-2 text-xs text-orange-600">
            <Flag className="w-3 h-3" /> Issue reported at {formatTime(record.issue_reported_at)}
          </div>
        )}
        {record.manager_overrides && JSON.parse(record.manager_overrides || '[]').length > 0 && (
          <div className="flex items-center gap-2 text-xs text-purple-600">
            <ShieldCheck className="w-3 h-3" /> {JSON.parse(record.manager_overrides).length} manager override(s) applied
          </div>
        )}
      </CardContent>

      <ManagerOverrideDialog
        open={!!overrideTarget}
        onClose={() => setOverrideTarget(null)}
        onOverride={handleOverride}
        checkLabel={overrideTarget?.label}
        managerName={managerName || techName}
      />

      <Dialog open={!!actionDialog} onOpenChange={o => { if (!o) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionDialog?.type === 'help' ? <HelpCircle className="w-4 h-4 text-amber-500" /> : <Flag className="w-4 h-4 text-orange-500" />}
              {actionDialog?.type === 'help' ? 'Request Help' : 'Report Issue'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>{actionDialog?.type === 'help' ? 'What do you need help with?' : 'Describe the issue:'}</Label>
            <Textarea
              value={actionText}
              onChange={e => setActionText(e.target.value)}
              placeholder={actionDialog?.type === 'help' ? 'e.g. Need forklift assistance loading materials...' : 'e.g. Truck has a flat tire...'}
              className="mt-1"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button onClick={submitAction} disabled={!actionText.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}