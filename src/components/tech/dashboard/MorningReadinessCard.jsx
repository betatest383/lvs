import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, AlertTriangle, Play, Sunrise, MinusCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const dateOnly = (d) => d ? String(d).split('T')[0] : '';

export default function MorningReadinessCard({ consumableReqs = [], transferSheets = [], materialReturns = [], equipment = [], truck, truckNumber, today }) {
  // --- Equipment checks ---
  const dailyEquipment = equipment.filter(e => e.required_daily_operations && e.is_active !== false);
  const dailyMissing = dailyEquipment.filter(e => ['missing', 'damaged', 'out_for_repair'].includes(e.status) || ['missing', 'damaged'].includes(e.condition));
  const dailyAllReady = dailyEquipment.length > 0 && dailyMissing.length === 0;

  const todaysEquipment = equipment.filter(e => e.required_todays_job && e.is_active !== false);
  const todaysMissing = todaysEquipment.filter(e => !e.assigned_employee_email && !e.assigned_employee);
  const storageKey = `tech_morning_${truckNumber || 'none'}_${today}`;
  const [manualChecks, setManualChecks] = useState({});
  const [departedAt, setDepartedAt] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setManualChecks(saved);
      setDepartedAt(saved._departedAt || null);
    } catch { setManualChecks({}); }
  }, [storageKey]);

  const save = (updated) => {
    setManualChecks(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const toggleCheck = (key) => {
    save({ ...manualChecks, [key]: !manualChecks[key] });
  };

  // --- Condition detection ---
  const consumableSubmitted = consumableReqs.some(r => dateOnly(r.submitted_time || r.created_date) === today && r.status !== 'Draft');
  const needsConsumables = !!manualChecks.consumable_needed;
  const hasTodayTransfer = transferSheets.some(t => dateOnly(t.created_date) === today);
  const transferReceived = transferSheets.some(t => t.technician_received);
  const hasPendingReturns = materialReturns.length > 0 || equipment.length > 0;
  const materialsReturned = materialReturns.some(r => ['Verified', 'Adjusted', 'Closed'].includes(r.status));
  const needsLoading = hasTodayTransfer || consumableReqs.some(r => dateOnly(r.submitted_time || r.created_date) === today);
  const forkliftRequired = truck?.forklift_required === true || truck?.forklift_required === 'Yes';

  // --- Step definitions ---
  const steps = [
    {
      key: 'consumable', label: 'Submit Consumables', to: '/consumables/new',
      autoComplete: consumableSubmitted,
      required: consumableSubmitted || needsConsumables,
      optional: true, manual: true,
    },
    {
      key: 'transfer', label: 'Receive Material Transfer', to: '/warehouse/material-returns/new',
      autoComplete: transferReceived,
      required: hasTodayTransfer,
      optional: true,
    },
    {
      key: 'unload', label: 'Unload Previous Job Items', to: '/warehouse/material-returns/new',
      autoComplete: materialsReturned,
      required: hasPendingReturns,
      optional: true,
    },
    {
      key: 'clean', label: 'Clean Truck',
      required: true, manual: true,
    },
    {
      key: 'organize', label: 'Organize Truck',
      required: true, manual: true,
    },
    {
      key: 'load', label: 'Load Truck',
      required: needsLoading, manual: true, optional: true,
    },
    {
      key: 'forklift', label: 'Forklift Loading',
      required: forkliftRequired, manual: true, optional: true,
    },
  ];

  const getStepStatus = (step) => {
    if (step.autoComplete) return 'complete';
    if (!step.required) return 'not_required';
    if (step.manual && manualChecks[step.key]) return 'complete';
    return 'pending';
  };

  const stepStatuses = steps.map(getStepStatus);
  const completedCount = stepStatuses.filter(s => s === 'complete' || s === 'not_required').length;
  const readinessPct = Math.round((completedCount / steps.length) * 100);
  const allReady = stepStatuses.every(s => s === 'complete' || s === 'not_required');

  const blockingIssues = steps
    .filter((s, i) => stepStatuses[i] === 'pending' && s.required)
    .map(s => s.label);

  // Add equipment blocking issues
  if (dailyEquipment.length > 0 && dailyMissing.length > 0) {
    blockingIssues.push(`Daily equipment issue: ${dailyMissing.map(e => e.item_name).join(', ')}`);
  }
  if (todaysEquipment.length > 0 && todaysMissing.length > 0) {
    blockingIssues.push(`Today's job equipment missing: ${todaysMissing.map(e => e.item_name).join(', ')}`);
  }

  const equipmentBlocking = (dailyEquipment.length > 0 && dailyMissing.length > 0) || (todaysEquipment.length > 0 && todaysMissing.length > 0);

  const startDay = async () => {
    setStarting(true);
    try {
      const now = new Date().toISOString();
      save({ ...manualChecks, _dayStarted: true, _departedAt: now });
      setDepartedAt(now);

      // Set truck status to In Service
      if (truck?.id) {
        await base44.entities.TruckProfile.update(truck.id, {
          current_assignment_status: 'In Use',
          current_driver: truck.assigned_lead_technician || truck.assigned_apprentice || '',
        });
      }
    } catch (e) {
      console.error('Failed to start day:', e);
    } finally {
      setStarting(false);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderStatusIcon = (status) => {
    if (status === 'complete') return <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />;
    if (status === 'not_required') return <MinusCircle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />;
    return <Circle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  };

  return (
    <Card className="border-2 border-amber-200 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sunrise className="w-5 h-5 text-amber-500" />
            Morning Readiness
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-amber-600">{readinessPct}%</span>
            {departedAt ? (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> Departed {formatTime(departedAt)}
              </span>
            ) : (allReady && !equipmentBlocking) ? (
              <Button size="sm" onClick={startDay} disabled={starting} className="bg-amber-500 hover:bg-amber-600">
                <Play className="w-3.5 h-3.5 mr-1" /> {starting ? 'Starting...' : 'Start My Day'}
              </Button>
            ) : (
              <Button size="sm" disabled className="bg-muted text-muted-foreground">
                <Play className="w-3.5 h-3.5 mr-1" /> Start My Day
              </Button>
            )}
          </div>
        </div>
        <Progress value={readinessPct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          {steps.map((step, i) => {
            const status = stepStatuses[i];
            const done = status === 'complete';
            const notReq = status === 'not_required';
            const content = (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${done ? 'bg-green-50 border-green-200' : notReq ? 'bg-muted/30 border-muted' : 'bg-white border-amber-200'}`}>
                {renderStatusIcon(status)}
                <span className={`text-sm flex-1 ${done ? 'text-green-700 line-through' : notReq ? 'text-muted-foreground' : ''}`}>{step.label}</span>
                {notReq && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">NOT REQUIRED</span>}
                {step.key === 'consumable' && !done && !notReq && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">NEEDED</span>
                )}
              </div>
            );

            // Consumable step: allow toggling "I need consumables" vs "Not Required"
            if (step.key === 'consumable' && !done) {
              return (
                <div key={step.key} className="space-y-1">
                  {step.to && !notReq ? <Link to={step.to}>{content}</Link> : <div>{content}</div>}
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 text-xs w-full"
                    onClick={() => save({ ...manualChecks, consumable_needed: !needsConsumables })}
                  >
                    {needsConsumables ? 'Mark as Not Required' : 'I Need Consumables'}
                  </Button>
                </div>
              );
            }

            // Link steps that have a destination and aren't done/not_required
            if (step.to && !done && !notReq) {
              return (
                <div key={step.key} className="space-y-1">
                  <Link to={step.to}>{content}</Link>
                  {step.manual && (
                    <Button size="sm" variant="ghost" className="h-6 text-xs w-full" onClick={() => toggleCheck(step.key)}>
                      Mark Complete
                    </Button>
                  )}
                </div>
              );
            }

            // Manual toggle steps
            if (step.manual && !notReq) {
              return (
                <div key={step.key} onClick={() => toggleCheck(step.key)} className="cursor-pointer">
                  {content}
                </div>
              );
            }

            return <div key={step.key}>{content}</div>;
          })}
        </div>

        {blockingIssues.length > 0 && !allReady && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Blocking Issues</p>
              <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                {blockingIssues.map((issue, i) => <li key={i}>• {issue}</li>)}
              </ul>
            </div>
          </div>
        )}

        {allReady && !departedAt && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm font-medium text-green-700">All required steps complete — ready to start your day!</p>
          </div>
        )}

        {departedAt && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-medium text-blue-700">Day started at {formatTime(departedAt)} — truck is in service.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}