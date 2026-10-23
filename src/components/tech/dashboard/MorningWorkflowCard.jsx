import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Play, CheckCircle2, Loader2, Clock, ChevronRight, Navigation,
} from 'lucide-react';
import {
  CHECK_DEFINITIONS, computeAutoChecks, mergeChecks,
  computeReadiness, computeOverallStatus, canStartMyDay, PASSING_STATUSES,
} from '@/lib/wh105Constants';
import {
  WORKFLOW_STEPS, computeStepStatus, parseWorkflowChecks, computeAutoDisplayData,
} from '@/lib/morningWorkflowConfig';
import WorkflowStepAccordion from '@/components/tech/dashboard/WorkflowStepAccordion';
import PreviousDayReturnDialog from '@/components/tech/dashboard/PreviousDayReturnDialog';
import ManagerOverrideDialog from '@/components/wh105/ManagerOverrideDialog';
import { toast } from 'sonner';
import moment from 'moment';

export default function MorningWorkflowCard({
  consumableReqs = [], transferSheets = [], materialReturns = [], equipment = [],
  truck, truckNumber, todayJobs = [], identity, canOverride, managerName, today,
  myTasks = [], myNotifications = [],
}) {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [merged, setMerged] = useState(null);
  const [detail, setDetail] = useState(null);
  const [workflowChecks, setWorkflowChecks] = useState({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeStepId, setActiveStepId] = useState(null);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);

  const techEmail = identity?.email || '';
  const techName = identity?.fullName || '';
  const techTruckNumber = identity?.truckNumber || truckNumber || '';

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
        const updates = { overall_status: overall, readiness_percentage: readiness };
        let changed = false;
        for (const def of CHECK_DEFINITIONS) {
          const field = `${def.id}_status`;
          if (rec[field] !== m[def.id]) { updates[field] = m[def.id]; changed = true; }
        }
        if (truck?.truck_id && rec.truck_id !== truck.truck_id) { updates.truck_id = truck.truck_id; changed = true; }
        if (techTruckNumber && rec.truck_number !== techTruckNumber) { updates.truck_number = techTruckNumber; changed = true; }
        if (changed || rec.overall_status !== overall || rec.readiness_percentage !== readiness) {
          await base44.entities.Wh105DepartureCheck.update(rec.id, updates).catch(() => {});
        }
        setRecord({ ...rec, ...updates });
        setMerged(m);
        setDetail(autoChecks._detail);
        setWorkflowChecks(parseWorkflowChecks(rec));
      } else {
        const m = mergeChecks({}, autoChecks);
        const readiness = computeReadiness(m);
        const overall = computeOverallStatus(m, false);
        const depId = `DEP-${today.replace(/-/g, '')}-${techTruckNumber || 'NA'}`;
        const created = await base44.entities.Wh105DepartureCheck.create({
          departure_id: depId, date: today, technician_email: techEmail, technician_name: techName,
          truck_id: truck?.truck_id || '', truck_number: techTruckNumber || '',
          job_number: todayJobs[0]?.job_number || todayJobs[0]?.id || '',
          ...Object.fromEntries(CHECK_DEFINITIONS.map(c => [`${c.id}_status`, m[c.id]])),
          overall_status: overall, readiness_percentage: readiness, departed: false,
        });
        setRecord(created);
        setMerged(m);
        setDetail(autoChecks._detail);
        setWorkflowChecks({});
      }
    } catch (e) {
      console.error('Morning Workflow load error:', e);
    } finally {
      setLoading(false);
    }
  }, [techEmail, techName, techTruckNumber, today, consumableReqs, transferSheets, materialReturns, equipment, truck, todayJobs]);

  useEffect(() => { loadOrCreate(); }, [loadOrCreate]);

  const persistWorkflowChecks = async (newChecks) => {
    setWorkflowChecks(newChecks);
    if (record?.id) {
      await base44.entities.Wh105DepartureCheck.update(record.id, {
        workflow_checks: JSON.stringify(newChecks),
      }).catch(() => {});
    }
  };

  const updateStepTopLevel = async (step, newChecks) => {
    const allComplete = step.checks.every(c => (newChecks[c.id]?.status || 'waiting') === 'complete');
    if (!allComplete || step.checkIds.length === 0) return;
    const updates = {};
    const now = new Date().toISOString();
    step.checkIds.forEach(checkId => {
      const field = `${checkId}_status`;
      const current = merged[checkId];
      if (current === 'blocked') return;
      if (!PASSING_STATUSES.includes(current)) {
        updates[field] = 'complete';
      }
    });
    if (Object.keys(updates).length > 0 && record?.id) {
      const newMerged = { ...merged };
      step.checkIds.forEach(id => {
        if (updates[`${id}_status`]) newMerged[id] = updates[`${id}_status`];
      });
      const readiness = computeReadiness(newMerged);
      const overall = computeOverallStatus(newMerged, record.departed);
      const fullUpdates = { ...updates, overall_status: overall, readiness_percentage: readiness };
      setRecord(prev => ({ ...prev, ...fullUpdates }));
      setMerged(newMerged);
      await base44.entities.Wh105DepartureCheck.update(record.id, fullUpdates).catch(() => {});
    }
  };

  const toggleSubCheck = async (checkId, step) => {
    if (record?.departed) return;
    const entry = workflowChecks[checkId];
    const isComplete = entry?.status === 'complete';
    const now = new Date().toISOString();
    const newChecks = {
      ...workflowChecks,
      [checkId]: isComplete
        ? { status: 'waiting' }
        : { status: 'complete', completed_at: now, completed_by: techName },
    };
    await persistWorkflowChecks(newChecks);
    await updateStepTopLevel(step, newChecks);
  };

  const uploadPhoto = async (step, file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newChecks = {
        ...workflowChecks,
        [`${step.id}_photo`]: { status: 'uploaded', url: file_url, uploaded_at: new Date().toISOString() },
      };
      await persistWorkflowChecks(newChecks);
      toast.success('Photo uploaded.');
    } catch (e) {
      toast.error('Photo upload failed.');
    }
  };

  const handleVerifyItem = async (checkKey) => {
    if (record?.departed) return;
    const newChecks = {
      ...workflowChecks,
      [checkKey]: { status: 'complete', completed_at: new Date().toISOString(), completed_by: techName },
    };
    await persistWorkflowChecks(newChecks);
    // Check if all consumable items are verified
    const consumableStep = WORKFLOW_STEPS.find(s => s.id === 'consumable_verification');
    if (consumableStep) {
      const displayData = computeAutoDisplayData('consumable_verification', {
        transferSheets, materialReturns, consumableReqs, equipment, todayJobs, myTasks, myNotifications,
      });
      const allVerified = (displayData?.replenishedItems || []).every(item =>
        newChecks[`consumable_verified_${item.item_name}`]?.status === 'complete'
      );
      if (allVerified && (displayData?.replenishedItems || []).length > 0) {
        const checksWithStep = {
          ...newChecks,
          verify_replenished_items: { status: 'complete', completed_at: new Date().toISOString(), completed_by: techName },
        };
        await persistWorkflowChecks(checksWithStep);
        await updateStepTopLevel(consumableStep, checksWithStep);
      }
    }
  };

  const handleVerifyAllMaterials = async () => {
    if (record?.departed) return;
    const now = new Date().toISOString();
    const newChecks = {
      ...workflowChecks,
      verify_correct_items: { status: 'complete', completed_at: now, completed_by: techName },
      verify_correct_quantities: { status: 'complete', completed_at: now, completed_by: techName },
      confirm_load_complete: { status: 'complete', completed_at: now, completed_by: techName },
    };
    await persistWorkflowChecks(newChecks);
    const step = WORKFLOW_STEPS.find(s => s.id === 'material_pickup');
    if (step) await updateStepTopLevel(step, newChecks);

    // Update transfer sheet status to "Loaded"
    const displayData = computeAutoDisplayData('material_pickup', {
      transferSheets, materialReturns, consumableReqs, equipment, todayJobs, myTasks, myNotifications,
    });
    if (displayData?.stagedTransfers) {
      for (const transfer of displayData.stagedTransfers) {
        if (!['Loaded', 'Completed', 'Cancelled', 'Returned'].includes(transfer.status) && transfer.id) {
          try {
            const lineItems = JSON.parse(transfer.line_items || '[]').map(li => ({ ...li, verified: true, quantity_loaded: li.quantity_requested }));
            await base44.entities.MaterialTransferSheet.update(transfer.id, {
              status: 'Loaded',
              loaded_date: now,
              line_items: JSON.stringify(lineItems),
            });
          } catch { /* */ }
        }
      }
    }
    toast.success('All materials verified — transfer status updated to Loaded.');
  };

  const handleReportShortage = async () => {
    try {
      const displayData = computeAutoDisplayData('material_pickup', {
        transferSheets, materialReturns, consumableReqs, equipment, todayJobs, myTasks, myNotifications,
      });
      const transferIds = (displayData?.stagedTransfers || []).map(t => t.transfer_id || t.id).join(', ');
      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: 'Material Shortage Reported',
          message: `Technician ${techName} reported a material shortage on transfer(s): ${transferIds}. Truck: ${techTruckNumber}.`,
          notification_type: 'Warning',
          priority: 'High',
          recipient_department: 'Warehouse',
          source_module: 'WH-105 Morning Workflow',
          related_truck: techTruckNumber,
        },
      });
      toast.success('Shortage reported to warehouse.');
    } catch {
      toast.error('Failed to report shortage.');
    }
  };

  const handleReportWrongItem = async () => {
    try {
      const displayData = computeAutoDisplayData('material_pickup', {
        transferSheets, materialReturns, consumableReqs, equipment, todayJobs, myTasks, myNotifications,
      });
      const transferIds = (displayData?.stagedTransfers || []).map(t => t.transfer_id || t.id).join(', ');
      await base44.functions.invoke('manageNotification', {
        action: 'create',
        notificationData: {
          title: 'Wrong Material Reported',
          message: `Technician ${techName} reported wrong items on transfer(s): ${transferIds}. Truck: ${techTruckNumber}.`,
          notification_type: 'Warning',
          priority: 'High',
          recipient_department: 'Warehouse',
          source_module: 'WH-105 Morning Workflow',
          related_truck: techTruckNumber,
        },
      });
      toast.success('Wrong item reported to warehouse.');
    } catch {
      toast.error('Failed to report wrong item.');
    }
  };

  const handleReturnCompleted = async (noReturnsConfirmed) => {
    // Reload data after returns
    await loadOrCreate();
    if (noReturnsConfirmed) {
      // Mark the previous_returns check as complete
      const newChecks = {
        ...workflowChecks,
        return_materials: { status: 'complete', completed_at: new Date().toISOString(), completed_by: techName },
        return_specialty_equipment: { status: 'complete', completed_at: new Date().toISOString(), completed_by: techName },
      };
      await persistWorkflowChecks(newChecks);
      const step = WORKFLOW_STEPS.find(s => s.id === 'previous_day_closeout');
      if (step) await updateStepTopLevel(step, newChecks);
    }
    setReturnDialogOpen(false);
  };

  const handleOverride = async (signatureDataUrl, reason) => {
    const overrides = JSON.parse(record.manager_overrides || '[]');
    overrides.push({
      check_id: overrideTarget.id,
      check_label: overrideTarget.title,
      reason,
      signature_data_url: signatureDataUrl,
      override_by: managerName || techName,
      override_at: new Date().toISOString(),
    });
    const updates = {};
    overrideTarget.checkIds.forEach(id => {
      updates[`${id}_status`] = 'manager_override';
    });
    const newMerged = { ...merged };
    overrideTarget.checkIds.forEach(id => {
      newMerged[id] = 'manager_override';
    });
    const readiness = computeReadiness(newMerged);
    const overall = computeOverallStatus(newMerged, record.departed);
    const fullUpdates = { ...updates, manager_overrides: JSON.stringify(overrides), overall_status: overall, readiness_percentage: readiness };
    setRecord(prev => ({ ...prev, ...fullUpdates }));
    setMerged(newMerged);
    await base44.entities.Wh105DepartureCheck.update(record.id, fullUpdates).catch(() => {});
    setOverrideTarget(null);
    toast.success(`Override applied: ${overrideTarget.title}`);
  };

  const startMyDay = async () => {
    setStarting(true);
    try {
      const response = await base44.functions.invoke('startMyDay', { departure_id: record.id });
      setRecord(prev => ({
        ...prev, departed: true,
        departure_timestamp: response.data?.departure_timestamp,
        overall_status: 'departed', readiness_percentage: 100,
      }));
      toast.success(`Day started! Truck ${techTruckNumber} is in service.`);
    } catch (e) {
      console.error('Start My Day failed:', e);
      toast.error('Failed to start day. Check readiness requirements.');
    } finally {
      setStarting(false);
    }
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
          Unable to load morning workflow.
        </CardContent>
      </Card>
    );
  }

  const readinessPct = record.readiness_percentage || 0;
  const readyToStart = canStartMyDay(merged) && !record.departed;
  const overallStatus = record.overall_status || 'waiting';

  const stepStatuses = WORKFLOW_STEPS.map(step => ({
    ...step,
    status: computeStepStatus(step, workflowChecks, merged),
  }));
  const firstIncompleteIdx = stepStatuses.findIndex(s => s.status !== 'complete' && !s.isStartStep);
  const activeIdx = activeStepId
    ? stepStatuses.findIndex(s => s.id === activeStepId)
    : (firstIncompleteIdx >= 0 ? firstIncompleteIdx : WORKFLOW_STEPS.length - 1);

  const headerColor = record.departed ? 'border-blue-300'
    : overallStatus === 'ready' ? 'border-green-300'
    : overallStatus === 'blocked' ? 'border-red-300'
    : 'border-amber-200';

  const displayData = {
    transferSheets, materialReturns, consumableReqs, equipment, todayJobs, myTasks, myNotifications,
  };

  return (
    <Card className={`border-2 ${headerColor} shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Play className="w-5 h-5 text-amber-500" />
            Morning Workflow
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white font-medium">WH-105</span>
          </CardTitle>
          <div className="text-right">
            <span className={`text-2xl font-bold ${record.departed ? 'text-blue-600' : overallStatus === 'ready' ? 'text-green-600' : overallStatus === 'blocked' ? 'text-red-600' : 'text-amber-600'}`}>
              {readinessPct}%
            </span>
            {record.departed && (
              <p className="text-xs text-blue-600 font-medium flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> Departed {moment(record.departure_timestamp).format('h:mm A')}
              </p>
            )}
          </div>
        </div>
        <Progress value={readinessPct} className="h-2 mt-2" />
      </CardHeader>

      <CardContent className="space-y-1">
        {record.departed ? (
          <DepartureSummary
            record={record}
            todayJobs={todayJobs}
            truckNumber={techTruckNumber}
            onGoToJobs={() => navigate('/tech/dashboard')}
          />
        ) : (
          <>
            <div className="space-y-0">
              {stepStatuses.map((step, idx) => (
                <WorkflowStepAccordion
                  key={step.id}
                  step={step}
                  isExpanded={idx === activeIdx}
                  onToggle={() => setActiveStepId(activeIdx === idx ? null : step.id)}
                  workflowChecks={workflowChecks}
                  onToggleCheck={toggleSubCheck}
                  onUploadPhoto={uploadPhoto}
                  onOverride={setOverrideTarget}
                  canOverride={canOverride}
                  record={record}
                  autoDisplayData={step.autoDisplay ? computeAutoDisplayData(step.id, displayData) : null}
                  onReturnItems={() => setReturnDialogOpen(true)}
                  onVerifyItem={handleVerifyItem}
                  onVerifyAll={handleVerifyAllMaterials}
                  onReportShortage={handleReportShortage}
                  onReportWrongItem={handleReportWrongItem}
                />
              ))}
            </div>

            <Button
              onClick={startMyDay}
              disabled={!readyToStart || starting}
              className={`w-full h-14 text-lg font-bold select-none mt-3 ${readyToStart ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {starting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}
              {starting ? 'Starting...' : 'Start My Day'}
            </Button>
            {!readyToStart && (
              <p className="text-xs text-center text-muted-foreground">
                Complete all required steps above to enable dispatch
              </p>
            )}
          </>
        )}

        <div className="pt-2 border-t mt-3">
          <Link to="/tech/readiness">
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              View Detailed WH-105 Checklist <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>

      <ManagerOverrideDialog
        open={!!overrideTarget}
        onClose={() => setOverrideTarget(null)}
        onOverride={handleOverride}
        checkLabel={overrideTarget?.title}
        managerName={managerName || techName}
      />

      <PreviousDayReturnDialog
        open={returnDialogOpen}
        onClose={() => setReturnDialogOpen(false)}
        identity={{ email: techEmail, fullName: techName, truckNumber: techTruckNumber }}
        truckNumber={techTruckNumber}
        onReturnCompleted={handleReturnCompleted}
      />
    </Card>
  );
}

function DepartureSummary({ record, todayJobs, truckNumber, onGoToJobs }) {
  const firstJob = todayJobs[0] || null;
  const confirmations = [
    { label: 'Morning Complete', value: moment(record.departure_timestamp).format('h:mm A') },
    { label: 'Truck Ready', value: truckNumber || '✓' },
    { label: 'Consumables Verified', value: '✓' },
    { label: 'Materials Loaded', value: '✓' },
    { label: 'Equipment Verified', value: '✓' },
    { label: 'Vehicle Safe', value: '✓' },
    { label: "Today's Jobs Ready", value: `${todayJobs.length} scheduled` },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        <p className="text-sm font-bold text-green-700">Morning Complete — You're Dispatch Ready!</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {confirmations.map(item => (
          <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              {item.label}
            </span>
            <span className="font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
      {firstJob && (
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-sm">
          <p className="font-medium text-blue-700">First Appointment</p>
          <p className="text-blue-600">{firstJob.customer_name} — {firstJob.address || ''}</p>
        </div>
      )}
      <Button
        onClick={onGoToJobs}
        className="w-full h-12 text-base font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
      >
        <Navigation className="w-5 h-5 mr-2" /> Go To Today's Jobs
      </Button>
    </div>
  );
}