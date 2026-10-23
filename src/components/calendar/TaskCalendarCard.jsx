import React from 'react';
import { Clock, AlertTriangle, Pause, RotateCcw, User } from 'lucide-react';
import { PRIORITY_STYLES, STATUS_STYLES } from '@/lib/calendarConstants';
import { cn } from '@/lib/utils';

/**
 * Renders an EnterpriseTask as a calendar card.
 * Display-only: clicking opens Task Detail. Does NOT acknowledge or start.
 *
 * Modes:
 *  - default: full metadata (ID, status, title, times, assignee, dept, flags)
 *  - compact: condensed (title + dot), used for short / all-day cards
 *  - extraCompact: minimal (ID, truncated title, start time) for narrow
 *    overlap columns; lower-priority metadata hidden, text clipped with
 *    ellipsis so it never bleeds into adjacent columns.
 */
export default function TaskCalendarCard({ event, onClick, onReschedule, compact = false, extraCompact = false, draggable = false, onDragStart, conflicts }) {
  if (!event) return null;

  const priorityStyle = PRIORITY_STYLES[event.priority] || PRIORITY_STYLES.Medium;
  const statusStyle = STATUS_STYLES[event.status] || STATUS_STYLES.Draft;

  const timeLabel = event.isAllDay
    ? 'All Day'
    : event.startsAt
      ? new Date(event.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: event.metadata?.schedule_timezone || 'America/New_York' })
      : '';

  const endTimeLabel = !event.isAllDay && event.endsAt
    ? new Date(event.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: event.metadata?.schedule_timezone || 'America/New_York' })
    : '';

  const showFull = !compact && !extraCompact;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(event); }}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        'group relative h-full w-full cursor-pointer overflow-hidden rounded-lg border-l-4 shadow-sm transition-all hover:shadow-md',
        priorityStyle.light,
        priorityStyle.border,
        extraCompact ? 'p-1' : compact ? 'p-1.5' : 'p-2.5',
        event.isOverdue && 'ring-1 ring-red-400'
      )}
    >
      <div className="flex h-full items-start gap-1.5">
        <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0', priorityStyle.dot)} />
        <div className="flex-1 min-w-0">
          {/* Task ID — always shown (required even in extraCompact) */}
          {(showFull || extraCompact) && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold text-muted-foreground truncate">{event.displayNumber}</span>
              {showFull && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', statusStyle.bg, statusStyle.text)}>
                  {event.status}
                </span>
              )}
              {event.providerKey === 'appointment' && (
                <span className="text-[9px] px-1 py-0.5 rounded-full font-bold shrink-0 bg-indigo-100 text-indigo-700 border border-indigo-300">ST</span>
              )}
            </div>
          )}
          <p className={cn('font-medium text-foreground truncate', extraCompact ? 'text-[11px]' : compact ? 'text-xs' : 'text-sm')}>
            {event.title}
          </p>
          {/* Times + indicators (full only) */}
          {showFull && (
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
              {timeLabel && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {timeLabel}{endTimeLabel ? '–' + endTimeLabel : ''}
                </span>
              )}
              {event.isOverdue && (
                <span className="flex items-center gap-0.5 text-red-600 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Overdue
                </span>
              )}
              {event.isInterrupted && (
                <span className="flex items-center gap-0.5 text-purple-600 font-medium">
                  <Pause className="w-3 h-3" /> Interrupted
                </span>
              )}
              {event.resumeRequired && !event.isInterrupted && (
                <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                  <RotateCcw className="w-3 h-3" /> Resume
                </span>
              )}
              {conflicts && conflicts.length > 0 && (
                <span className="flex items-center gap-0.5 text-red-600 font-medium" title={conflicts.map(c => c.message).join('\n')}>
                  <AlertTriangle className="w-3 h-3" /> Conflict{conflicts.length > 1 ? ` (${conflicts.length})` : ''}
                </span>
              )}
            </div>
          )}
          {/* Start time only (extraCompact) */}
          {extraCompact && timeLabel && (
            <div className="flex items-center gap-0.5 mt-0.5 text-[10px] text-muted-foreground min-w-0">
              <Clock className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{timeLabel}</span>
            </div>
          )}
          {showFull && event.assigneeName && (
            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
              <User className="w-3 h-3" />
              <span className="truncate">{event.assigneeName}</span>
              {event.assigneeEmployeeId && (
                <span className="text-muted-foreground/60">({event.assigneeEmployeeId})</span>
              )}
            </div>
          )}
          {showFull && event.department && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">{event.department}</div>
          )}
        </div>
        {onReschedule && showFull && (
          <button
            onClick={(e) => { e.stopPropagation(); onReschedule(event); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/5"
            title="Reschedule"
          >
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}