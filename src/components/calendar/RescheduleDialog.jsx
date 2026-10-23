import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { DEFAULT_TIMEZONE } from '@/lib/calendarConstants';

/**
 * Reschedule dialog — the touch-friendly fallback for drag-and-drop.
 * Also used as the confirmation step after a drag-and-drop on desktop.
 *
 * Enforces reschedule reason for:
 * - Critical tasks
 * - Overdue tasks
 * - Tasks already acknowledged
 * - Tasks already In Progress
 * - Moving work to another day
 */
export default function RescheduleDialog({ open, onOpenChange, event, initialStart, initialEnd, onSuccess, sourceContext = 'calendar_dialog' }) {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (open && event) {
      const s = initialStart || event.startsAt || '';
      setStartsAt(s ? toLocalInput(s) : '');
      // endsAt MUST be converted to local-input format — a raw ISO string
      // (e.g. 2026-07-22T02:00:00.000Z) cannot be rendered by a datetime-local
      // input, and fromLocalInput would later produce an invalid datetime
      // ("...Z-04:00") that the backend rejects with 400 "Invalid ends_at value".
      const e = initialEnd || event.endsAt || '';
      setEndsAt(e ? toLocalInput(e) : '');
      setIsAllDay(event.isAllDay || false);
      setReason('');
      setWarning(null);

      // Check if reason is required
      const isCritical = event.priority === 'Critical';
      const isOverdue = event.isOverdue;
      const isAcknowledged = event.acknowledgmentStatus === 'acknowledged';
      const isInProgress = event.status === 'In Progress';
      const movedDay = s && event.startsAt
        ? new Date(s).toDateString() !== new Date(event.startsAt).toDateString()
        : false;

      if (isCritical || isOverdue || isAcknowledged || isInProgress || movedDay) {
        setWarning({ requiresReason: true, conditions: [isCritical && 'Critical priority', isOverdue && 'Overdue', isAcknowledged && 'Already acknowledged', isInProgress && 'In Progress', movedDay && 'Different day'].filter(Boolean) });
      }
    }
  }, [open, event, initialStart, initialEnd]);

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const tz = DEFAULT_TIMEZONE;
    // Format for datetime-local input in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const h = parts.find(p => p.type === 'hour').value;
    const min = parts.find(p => p.type === 'minute').value;
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  function fromLocalInput(localStr, allDay) {
    if (!localStr) return null;
    if (allDay) {
      // For all-day, use the date part and set to midnight in target timezone
      const datePart = localStr.split('T')[0];
      // Create a date at midnight ET
      return datePart + 'T00:00:00-04:00'; // EDT offset (simplified — production should use proper tz lib)
    }
    // For timed events, convert the local input to ISO
    // The datetime-local input gives us a local time string
    // We need to interpret it as America/New_York time
    const datePart = localStr.split('T')[0];
    const timePart = localStr.split('T')[1] || '00:00';
    // Use the -04:00 offset for EDT (summer). For EST it would be -05:00.
    // A proper implementation would use Intl to determine the offset.
    return datePart + 'T' + timePart + getTzOffset(datePart);
  }

  function getTzOffset(dateStr) {
    // Determine if the date is in EDT (-04:00) or EST (-05:00)
    // DST starts second Sunday in March, ends first Sunday in November
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const jan = new Date(y, 0, 1);
    const jul = new Date(y, 6, 1);
    const isDST = date.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    // Note: getTimezoneOffset() runs in the browser's local TZ, not America/New_York
    // For simplicity, use the US DST rule: DST is in effect from March to November
    const month = m;
    const isSummer = month >= 3 && month <= 10;
    return isSummer ? '-04:00' : '-05:00';
  }

  const handleSave = async () => {
    if (!startsAt) {
      toast.error('Start date/time is required');
      return;
    }

    const startIso = fromLocalInput(startsAt, isAllDay);
    const endIso = !isAllDay && endsAt ? fromLocalInput(endsAt, false) : null;

    // ── Pre-submit datetime validation ──
    // Verifies both fields parse to valid dates and that end > start before
    // hitting the backend. Catches the malformed "...Z-04:00" case early.
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) {
      toast.error('Invalid start datetime');
      return;
    }
    if (!isAllDay && endIso) {
      const end = new Date(endIso);
      if (Number.isNaN(end.getTime())) {
        toast.error('Invalid end datetime');
        return;
      }
      if (end <= start) {
        toast.error('End time must be after start time');
        return;
      }
    }

    if (warning?.requiresReason && !reason.trim()) {
      toast.error('A reschedule reason is required: ' + warning.conditions.join(', '));
      return;
    }

    const payload = {
      action: 'schedule_task',
      taskId: event.sourceRecordId,
      startsAt: startIso,
      endsAt: endIso,
      isAllDay,
      scheduleTimezone: DEFAULT_TIMEZONE,
      rescheduleReason: reason.trim() || null,
      sourceContext,
    };

    console.log('[RESCHEDULE PAYLOAD]', payload);

    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageTask', payload);

      if (response.data?.success) {
        toast.success('Task rescheduled successfully');
        onSuccess?.(response.data.task);
        onOpenChange(false);
      } else if (response.data?.requires_reason) {
        toast.error(response.data?.error);
        setWarning({ requiresReason: true, conditions: ['Server requires a reason'] });
      } else {
        toast.error(response.data?.error || 'Failed to reschedule task');
      }
    } catch (err) {
      console.error('[RESCHEDULE ERROR]', {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
      });
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Unable to reschedule task';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule Task</DialogTitle>
          <DialogDescription>
            {event?.displayNumber} — {event?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="all-day"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="all-day" className="text-sm cursor-pointer">All Day</Label>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Start</Label>
            <Input
              type={isAllDay ? 'date' : 'datetime-local'}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={saving}
            />
          </div>

          {!isAllDay && (
            <div>
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={saving}
              />
            </div>
          )}

          {warning?.requiresReason && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-medium">Reschedule reason required</p>
                <p>Conditions: {warning.conditions.join(', ')}</p>
              </div>
            </div>
          )}

          {(warning?.requiresReason || reason) && (
            <div>
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this task is being rescheduled..."
                rows={2}
                disabled={saving}
              />
            </div>
          )}

          {event?.workSessionStatus === 'in_progress' && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800">This task has an active WorkSession. Rescheduling will not interrupt the session.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}