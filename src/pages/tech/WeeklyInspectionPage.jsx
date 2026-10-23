import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import TechHeader from '@/components/tech/dashboard/TechHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ClipboardCheck, CheckCircle2, Circle, AlertTriangle, Loader2,
  ChevronRight, CalendarClock, Truck,
} from 'lucide-react';
import {
  WEEKLY_INSPECTION_CHECKS, PASSING_STATUSES,
  computeWeeklyReadiness, computeWeeklyOverallStatus,
  getMondayOfWeek, isWeeklyInspectionOverdue,
} from '@/lib/weeklyInspectionConfig';
import SignatureModal from '@/components/shared/SignatureModal';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS_STYLE = {
  complete: { dot: 'bg-green-500', text: 'text-green-600', label: 'Pass' },
  waiting: { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Pending' },
  in_progress: { dot: 'bg-blue-500', text: 'text-blue-600', label: 'In Progress' },
  blocked: { dot: 'bg-red-500', text: 'text-red-600', label: 'Fail' },
  not_required: { dot: 'bg-muted-foreground/30', text: 'text-muted-foreground', label: 'N/A' },
  manager_override: { dot: 'bg-purple-500', text: 'text-purple-600', label: 'Override' },
};

export default function WeeklyInspectionPage() {
  const {
    employee, user, isImpersonating,
    effectiveEmail, effectiveName, effectiveTruck,
    effectiveRole,
  } = useEmployeeContext();

  const [record, setRecord] = useState(null);
  const [lastInspection, setLastInspection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  const truckNumber = effectiveTruck || '';
  const today = new Date().toLocaleDateString('en-CA');
  const weekOf = getMondayOfWeek(today);

  const loadOrCreate = useCallback(async () => {
    if (!effectiveEmail || !truckNumber) return;
    try {
      const existing = await base44.entities.WeeklyInspection.filter({
        technician_email: effectiveEmail,
        week_of: weekOf,
      });
      const allInspections = await base44.entities.WeeklyInspection.filter({
        truck_number: truckNumber,
      }, '-date', 50);

      const latest = allInspections[0] || null;
      setLastInspection(latest);

      if (existing.length > 0) {
        setRecord(existing[0]);
      } else {
        const inspectionId = `WI-${today.replace(/-/g, '')}-${truckNumber}`;
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 7);
        const created = await base44.entities.WeeklyInspection.create({
          inspection_id: inspectionId,
          date: today,
          week_of: weekOf,
          technician_email: effectiveEmail,
          technician_name: effectiveName,
          truck_number: truckNumber,
          overall_status: 'waiting',
          readiness_percentage: 0,
          completed: false,
          next_inspection_due_date: nextDue.toLocaleDateString('en-CA'),
        });
        setRecord(created);
      }
    } catch (e) {
      console.error('Weekly inspection load error:', e);
    } finally {
      setLoading(false);
    }
  }, [effectiveEmail, effectiveName, truckNumber, today, weekOf]);

  useEffect(() => { loadOrCreate(); }, [loadOrCreate]);

  const toggleCheck = async (check) => {
    if (!record || record.completed) return;
    const current = record[check.field];
    const newStatus = current === 'complete' ? 'waiting' : 'complete';
    const updates = { [check.field]: newStatus };
    const updated = { ...record, ...updates };
    updates.readiness_percentage = computeWeeklyReadiness(updated);
    updates.overall_status = computeWeeklyOverallStatus(updated);
    setRecord(updated);
    await base44.entities.WeeklyInspection.update(record.id, updates).catch(() => {});
  };

  const markBlocked = async (check) => {
    if (!record || record.completed) return;
    const newStatus = record[check.field] === 'blocked' ? 'waiting' : 'blocked';
    const updates = { [check.field]: newStatus };
    const updated = { ...record, ...updates };
    updates.readiness_percentage = computeWeeklyReadiness(updated);
    updates.overall_status = computeWeeklyOverallStatus(updated);
    updates.defects_found = WEEKLY_INSPECTION_CHECKS.some(c => (c.field === check.field ? newStatus : updated[c.field]) === 'blocked');
    setRecord(updated);
    await base44.entities.WeeklyInspection.update(record.id, updates).catch(() => {});
  };

  const handleSignOff = async (signatureDataUrl) => {
    setSigning(true);
    try {
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + 7);
      const updates = {
        completed: true,
        completed_at: new Date().toISOString(),
        completed_by: effectiveName,
        signature_data_url: signatureDataUrl,
        overall_status: 'complete',
        readiness_percentage: 100,
        next_inspection_due_date: nextDue.toLocaleDateString('en-CA'),
      };
      const updated = { ...record, ...updates };
      setRecord(updated);
      await base44.entities.WeeklyInspection.update(record.id, updates);
      setShowSignature(false);
      toast.success('Weekly inspection completed and signed.');
    } catch (e) {
      toast.error('Failed to sign off inspection.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!effectiveEmail || !truckNumber) {
    return (
      <div className="space-y-4">
        <TechHeader user={user} employeeName={effectiveName} isImpersonating={isImpersonating} truckNumber={truckNumber} />
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No truck assigned. Weekly inspection requires an assigned vehicle.
          </CardContent>
        </Card>
      </div>
    );
  }

  const readinessPct = record?.readiness_percentage || 0;
  const overallStatus = record?.overall_status || 'waiting';
  const allPass = record && WEEKLY_INSPECTION_CHECKS.every(c => PASSING_STATUSES.includes(record[c.field]));
  const overdue = !record?.completed && isWeeklyInspectionOverdue(lastInspection?.date);

  return (
    <div className="space-y-5 pb-4">
      <TechHeader user={user} employeeName={effectiveName} isImpersonating={isImpersonating} truckNumber={truckNumber} />

      <Card className={`border-2 ${record?.completed ? 'border-green-300' : overdue ? 'border-red-300' : 'border-amber-200'} shadow-md`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-500" />
              Weekly Truck Inspection
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white font-medium">WEEKLY</span>
            </CardTitle>
            <div className="text-right">
              <span className={`text-2xl font-bold ${record?.completed ? 'text-green-600' : overdue ? 'text-red-600' : 'text-amber-600'}`}>
                {readinessPct}%
              </span>
            </div>
          </div>
          <Progress value={readinessPct} className="h-2 mt-2" />

          <div className="mt-3 p-3 rounded-lg bg-muted/60 text-xs space-y-1.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div>
                <span className="text-muted-foreground">Truck:</span>{' '}
                <span className="font-medium">{truckNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Week Of:</span>{' '}
                <span className="font-medium">{moment(weekOf).format('MMM D, YYYY')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Inspection ID:</span>{' '}
                <span className="font-mono font-medium">{record?.inspection_id || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className="font-medium capitalize">{overallStatus}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Last Inspection:</span>{' '}
                <span className="font-medium">{lastInspection ? moment(lastInspection.date).format('MMM D, YYYY') : 'None'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Next Due:</span>{' '}
                <span className="font-medium">{record?.next_inspection_due_date ? moment(record.next_inspection_due_date).format('MMM D, YYYY') : '—'}</span>
              </div>
            </div>
          </div>

          {overdue && (
            <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <CalendarClock className="w-4 h-4 text-red-600" />
              <p className="text-sm font-medium text-red-700">
                Weekly inspection is overdue — last completed {lastInspection ? moment(lastInspection.date).fromNow() : 'never'}.
              </p>
            </div>
          )}
          {record?.completed && (
            <div className="flex items-center gap-2 mt-2 text-sm text-green-600 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Completed {moment(record.completed_at).format('MMM D, h:mm A')} by {record.completed_by}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-1">
          {!record?.completed && (
            <>
              <div className="space-y-0">
                {WEEKLY_INSPECTION_CHECKS.map(check => {
                  const status = record?.[check.field] || 'waiting';
                  const style = STATUS_STYLE[status] || STATUS_STYLE.waiting;
                  const isComplete = status === 'complete';
                  const isBlocked = status === 'blocked';
                  return (
                    <div key={check.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {check.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{check.description}</p>
                        </div>
                      </div>
                      {!record?.completed && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant={isComplete ? 'ghost' : 'default'}
                            className="h-7 text-xs"
                            onClick={() => toggleCheck(check)}
                          >
                            {isComplete ? 'Undo' : 'Pass'}
                          </Button>
                          <Button
                            size="sm"
                            variant={isBlocked ? 'destructive' : 'outline'}
                            className="h-7 text-xs"
                            onClick={() => markBlocked(check)}
                          >
                            {isBlocked ? 'Undo' : 'Fail'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 space-y-2">
                <Button
                  onClick={() => setShowSignature(true)}
                  disabled={!allPass || signing}
                  className={`w-full h-12 text-base font-bold ${allPass ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-muted text-muted-foreground'}`}
                >
                  {signing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ClipboardCheck className="w-5 h-5 mr-2" />}
                  Sign & Complete Weekly Inspection
                </Button>
                {!allPass && (
                  <p className="text-xs text-center text-muted-foreground">
                    Complete all inspection checks to enable sign-off
                  </p>
                )}
                {record?.defects_found && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-red-700">Defects found — report to fleet management for repair.</p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-2 border-t mt-3">
            <Link to="/tech/truck">
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                <Truck className="w-3 h-3 mr-1" /> View Truck Profile <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <SignatureModal
        open={showSignature}
        onClose={() => setShowSignature(false)}
        onSign={handleSignOff}
        title="Sign Weekly Inspection"
        statement="By signing, you certify this weekly truck inspection was completed accurately and all items were checked."
      />
    </div>
  );
}