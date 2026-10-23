import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import WorkActivityCombobox from '@/components/jobhub/scope/WorkActivityCombobox';
import CrewStepper from '@/components/jobhub/scope/CrewStepper';
import StagingSequenceField from '@/components/jobhub/scope/StagingSequenceField';
import {
  computeDailySchedule, DEFAULT_DAY_HOURS, MAX_NORMAL_DAY_HOURS,
} from '@/lib/dailyLabor';

export const DURATION_OPTIONS = [
  { value: 'less_than_one_day', label: 'Less than One Day' },
  { value: '1_day', label: '1 Day' },
  { value: '2_days', label: '2 Days' },
  { value: '3_days', label: '3 Days' },
  { value: '4_days', label: '4 Days' },
  { value: '5_days', label: '5 Days' },
  { value: '6_days', label: '6 Days' },
  { value: '7_days', label: '7 Days' },
  { value: 'custom', label: 'Custom' },
];

export function durationToDays(duration, customDays) {
  if (duration === 'less_than_one_day') return 1; // Day 1 always shows, even for partial-day work
  if (duration === '1_day') return 1;
  if (duration === 'custom') return Math.max(0, parseInt(customDays) || 0);
  const match = (duration || '').match(/^(\d+)_days$/);
  return match ? parseInt(match[1]) : 0;
}

export function durationLabel(duration, customDays) {
  const opt = DURATION_OPTIONS.find(d => d.value === duration);
  if (!opt) return '—';
  if (duration === 'custom') return `${customDays || 0} Day(s)`;
  return opt.label;
}

export function ensureDailyPlans(data, numDays) {
  const existing = data.daily_plans || [];
  const plans = [];
  for (let i = 0; i < numDays; i++) {
    const prev = existing[i] || {};
    plans.push({
      day_number: prev.day_number || (i + 1),
      work_activities: prev.work_activities || [],
      work_notes: prev.work_notes || '',
      lead_technicians: prev.lead_technicians ?? 1,
      apprentices: prev.apprentices ?? 0,
      masons: prev.masons ?? 0,
      staging_sequence: prev.staging_sequence || '',
      // Per-day crew hours — preserved when already entered. New/legacy days default
      // to 8, EXCEPT a legacy "less than one day" partial-day value maps into Day 1
      // so existing partial-day data is never discarded on load.
      crew_hours: (prev.crew_hours === undefined || prev.crew_hours === null || prev.crew_hours === '')
        ? (i === 0 && data.project_duration === 'less_than_one_day' && data.estimated_hours > 0
            ? data.estimated_hours
            : DEFAULT_DAY_HOURS)
        : prev.crew_hours,
    });
  }
  return plans;
}

/**
 * Computes backward-compatible labor fields from project schedule data.
 * Used by save logic and backend pricing.
 */
export function computeLaborFromSchedule(data) {
  const numDays = durationToDays(data.project_duration, data.custom_days);
  const sched = computeDailySchedule(data.daily_plans, {
    projectDuration: data.project_duration,
    estimatedHours: data.estimated_hours,
  });
  return {
    // Backward-compatible alias — equals total_crew_hours (NOT numDays × 8).
    estimatedLaborHours: sched.totalCrewHours,
    totalCrewHours: sched.totalCrewHours,
    productionDays: sched.productionDays,
    numDays,
    crewSizeRequired: sched.maxCrew,
    totalLeads: sched.totalLeads,
    totalApprentices: sched.totalApprentices,
    totalMasons: sched.totalMasons,
    apprenticeManHours: sched.apprenticeManHours,
    leadManHours: sched.leadManHours,
    masonManHours: sched.masonManHours,
    days: sched.days,
  };
}

export default function ProjectScheduleSection({ data, onUpdate, equipmentItems = [] }) {
  const numDays = durationToDays(data.project_duration, data.custom_days);
  const dailyPlans = ensureDailyPlans(data, numDays);
  const showCustomDays = data.project_duration === 'custom';
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [pendingHours, setPendingHours] = useState(null); // { dayIndex, value }

  const confirmPendingUpdate = () => {
    if (pendingUpdate) onUpdate(pendingUpdate.updates);
    setPendingUpdate(null);
  };

  const confirmOver12Hours = () => {
    if (pendingHours) updateDay(pendingHours.dayIndex, 'crew_hours', pendingHours.value);
    setPendingHours(null);
  };
  const cancelOver12Hours = () => {
    if (pendingHours) updateDay(pendingHours.dayIndex, 'crew_hours', DEFAULT_DAY_HOURS);
    setPendingHours(null);
  };
  const handleHoursChange = (i, raw) => {
    if (raw === '') { updateDay(i, 'crew_hours', ''); return; }
    const v = parseFloat(raw);
    if (isNaN(v)) { updateDay(i, 'crew_hours', ''); return; }
    if (v < 0) { updateDay(i, 'crew_hours', 0); return; }
    if (v > MAX_NORMAL_DAY_HOURS) { setPendingHours({ dayIndex: i, value: v }); return; }
    updateDay(i, 'crew_hours', v);
  };

  const handleDurationChange = (newDuration) => {
    const newNumDays = durationToDays(newDuration, data.custom_days);
    const oldNumDays = durationToDays(data.project_duration, data.custom_days);
    const updates = { project_duration: newDuration };

    if (newNumDays !== oldNumDays) {
      const plans = ensureDailyPlans(data, newNumDays);
      // Reducing duration means the same work is condensed into the remaining
      // workday(s), not silently left in an invisible removed day. This makes a
      // 2-day → 1-day change persist as one production day while preserving scope.
      if (newNumDays < oldNumDays && newNumDays > 0) {
        const removed = (data.daily_plans || []).slice(newNumDays);
        const targetIndex = newNumDays - 1;
        const target = { ...plans[targetIndex] };
        for (const day of removed) {
          target.work_activities = [...new Set([...(target.work_activities || []), ...(day.work_activities || [])])];
          target.work_notes = [target.work_notes, day.work_notes].filter(Boolean).join('\n');
          target.staging_sequence = [target.staging_sequence, day.staging_sequence].filter(Boolean).join('\n');
          target.crew_hours = Number(target.crew_hours || 0) + Number(day.crew_hours || 0);
          target.lead_technicians = Math.max(Number(target.lead_technicians) || 0, Number(day.lead_technicians) || 0);
          target.apprentices = Math.max(Number(target.apprentices) || 0, Number(day.apprentices) || 0);
          target.masons = Math.max(Number(target.masons) || 0, Number(day.masons) || 0);
        }
        plans[targetIndex] = target;
      }
      updates.daily_plans = plans;
    }

    onUpdate(updates);
  };

  const handleCustomDaysChange = (val) => {
    const days = Math.max(0, parseInt(val) || 0);
    const oldNumDays = durationToDays(data.project_duration, data.custom_days);
    const updates = { custom_days: days };
    if (days !== oldNumDays) {
      if (days < oldNumDays) {
        const existing = data.daily_plans || [];
        const removed = existing.slice(days);
      const hasData = removed.some(p =>
        (p.work_activities && p.work_activities.length > 0) ||
        (p.work_notes || '').trim() || (p.staging_sequence || '').trim() ||
        (p.lead_technicians || 0) > 0 || (p.apprentices || 0) > 0 || (p.masons || 0) > 0 ||
        (p.crew_hours !== undefined && p.crew_hours !== null && p.crew_hours !== '' && Number(p.crew_hours) !== DEFAULT_DAY_HOURS)
      );
        if (hasData) {
          setPendingUpdate({
            updates: { ...updates, daily_plans: ensureDailyPlans(data, days) },
            message: `Reducing to ${days} day(s) will remove data for Day ${days + 1} through Day ${oldNumDays}. Continue?`,
          });
          return;
        }
      }
      updates.daily_plans = ensureDailyPlans(data, days);
    }
    onUpdate(updates);
  };

  const updateDay = (dayIndex, field, value) => {
    const plans = [...dailyPlans];
    plans[dayIndex] = { ...plans[dayIndex], [field]: value };
    onUpdate({ daily_plans: plans });
  };

  return (
    <>
    <AlertDialog open={!!pendingUpdate} onOpenChange={(open) => { if (!open) setPendingUpdate(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Schedule Change</AlertDialogTitle>
          <AlertDialogDescription>{pendingUpdate?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingUpdate(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmPendingUpdate}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!pendingHours} onOpenChange={(open) => { if (!open) setPendingHours(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Authorize Extended Work Day</AlertDialogTitle>
          <AlertDialogDescription>
            Day {pendingHours ? (dailyPlans[pendingHours.dayIndex]?.day_number || pendingHours.dayIndex + 1) : ''} is set to {pendingHours?.value || ''} hours, which exceeds the {MAX_NORMAL_DAY_HOURS}-hour standard. A work day over {MAX_NORMAL_DAY_HOURS} hours requires management authorization. Authorize this extended day?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelOver12Hours}>Revert to {DEFAULT_DAY_HOURS}h</AlertDialogCancel>
          <AlertDialogAction onClick={confirmOver12Hours}>Authorize {pendingHours?.value || ''}h</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
        <CalendarDays className="w-3.5 h-3.5" /> Project Schedule
      </div>

      {/* Estimated Project Duration + conditional fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Estimated Project Duration</Label>
          <Select value={data.project_duration || '1_day'} onValueChange={handleDurationChange}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {showCustomDays && (
          <div>
            <Label className="text-xs">Custom Days</Label>
            <Input type="number" min="1" value={data.custom_days || ''}
              onChange={e => handleCustomDaysChange(e.target.value)} className="h-8 text-sm" />
          </div>
        )}

      </div>

      {/* Daily Work Plans */}
      {numDays > 0 && (
        <div className="space-y-2">
          {dailyPlans.map((plan, i) => (
            <Card key={i} className="border-l-4 border-l-blue-300">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Day {plan.day_number}</p>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Hours</Label>
                    <Input
                      type="number" step="0.25" min="0" inputMode="decimal"
                      value={plan.crew_hours ?? ''}
                      onChange={e => handleHoursChange(i, e.target.value)}
                      className="h-8 w-20 text-sm"
                      aria-label={`Day ${plan.day_number} crew hours`}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">What will be completed this day?</Label>
                  <WorkActivityCombobox
                    selected={plan.work_activities || []}
                    onChange={(activities) => updateDay(i, 'work_activities', activities)}
                  />
                  <Textarea
                    value={plan.work_notes || ''}
                    placeholder="Additional work details (optional)..."
                    onChange={e => updateDay(i, 'work_notes', e.target.value)}
                    rows={1}
                    className="text-sm mt-1.5"
                  />
                </div>

                <div>
                  <Label className="text-xs">Crew Requirements</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <CrewStepper label="Lead Technicians" value={plan.lead_technicians ?? 1} onChange={v => updateDay(i, 'lead_technicians', v)} />
                    <CrewStepper label="Apprentices" value={plan.apprentices ?? 0} onChange={v => updateDay(i, 'apprentices', v)} />
                    <CrewStepper label="Masons" value={plan.masons ?? 0} onChange={v => updateDay(i, 'masons', v)} />
                  </div>
                </div>

                <StagingSequenceField
                  value={plan.staging_sequence || ''}
                  onChange={v => updateDay(i, 'staging_sequence', v)}
                  equipmentItems={equipmentItems}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </>
  );
}