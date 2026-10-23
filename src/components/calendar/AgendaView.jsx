import React from 'react';
import { format, isToday, isSameDay, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import TaskCalendarCard from './TaskCalendarCard';
import { AlertTriangle, Clock, CalendarOff } from 'lucide-react';

/**
 * Agenda view — chronological task list grouped by date.
 * The simplest mobile-friendly view. Shows overdue and unscheduled separately.
 */
export default function AgendaView({ events, unscheduled, currentDate, onEventClick, onReschedule, canReschedule, rangeDays = 30, conflictMap }) {
  const now = new Date();

  // Sort events by start time
  const sorted = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  // Group by date
  const grouped = {};
  for (const e of sorted) {
    const dateKey = format(new Date(e.startsAt), 'yyyy-MM-dd');
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(e);
  }

  // Sort dates
  const sortedDates = Object.keys(grouped).sort();

  // Separate overdue events
  const overdue = sorted.filter(e => e.isOverdue);
  const overdueNotInGroup = overdue.filter(e => {
    const dk = format(new Date(e.startsAt), 'yyyy-MM-dd');
    return !grouped[dk];
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {/* Overdue section */}
      {overdue.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-red-600 font-medium text-sm mb-2 sticky top-0 bg-background py-1">
            <AlertTriangle className="w-4 h-4" />
            Overdue ({overdue.length})
          </div>
          <div className="space-y-2">
            {overdue.map(e => (
              <TaskCalendarCard
                key={e.id}
                event={e}
                onClick={onEventClick}
                onReschedule={canReschedule ? onReschedule : undefined}
                compact
                conflicts={conflictMap?.[e.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scheduled events grouped by date */}
      {sortedDates.map(dateKey => {
        const dayEvents = grouped[dateKey];
        const dayDate = new Date(dateKey + 'T00:00:00');
        const today = isToday(dayDate);

        // Skip overdue if already shown above
        const nonOverdue = dayEvents.filter(e => !e.isOverdue);
        if (nonOverdue.length === 0) return null;

        return (
          <div key={dateKey}>
            <div className={cn(
              'text-xs font-semibold mb-1.5 sticky top-0 bg-background py-1 flex items-center gap-1',
              today ? 'text-accent' : 'text-muted-foreground'
            )}>
              {today ? 'Today — ' : ''}
              {format(dayDate, 'EEEE, MMM d')}
            </div>
            <div className="space-y-1.5">
              {nonOverdue.map(e => (
                <TaskCalendarCard
                  key={e.id}
                  event={e}
                  onClick={onEventClick}
                  onReschedule={canReschedule ? onReschedule : undefined}
                  compact
                  conflicts={conflictMap?.[e.id]}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Unscheduled section */}
      {unscheduled && unscheduled.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-orange-600 font-medium text-sm mb-2 sticky top-0 bg-background py-1">
            <CalendarOff className="w-4 h-4" />
            Unscheduled ({unscheduled.length})
          </div>
          <div className="space-y-2">
            {unscheduled.map(e => (
              <TaskCalendarCard
                key={e.id}
                event={e}
                onClick={onEventClick}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 && (!unscheduled || unscheduled.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No scheduled tasks in this range</p>
        </div>
      )}
    </div>
  );
}