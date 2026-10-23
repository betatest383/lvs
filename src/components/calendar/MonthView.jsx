import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import TaskCalendarCard from './TaskCalendarCard';
import { PRIORITY_STYLES } from '@/lib/calendarConstants';

const MAX_EVENTS_PER_DAY = 3;

export default function MonthView({ events, currentDate, onEventClick, onDayClick, onReschedule, canReschedule }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = [];
  let day = gridStart;
  while (day <= gridEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const today = new Date();

  const eventsForDay = (d) => events.filter(e => {
    if (!e.startsAt) return false;
    return isSameDay(new Date(e.startsAt), d);
  });

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b sticky top-0 bg-card z-10">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1.5 border-l first:border-l-0">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b" style={{ minHeight: 100 }}>
            {week.map((day, di) => {
              const dayEvents = eventsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, today);
              const overflow = dayEvents.length - MAX_EVENTS_PER_DAY;

              return (
                <div
                  key={di}
                  onClick={() => onDayClick?.(day)}
                  className={cn(
                    'border-l first:border-l-0 p-1 cursor-pointer hover:bg-accent/5 transition-colors',
                    !inMonth && 'bg-muted/20 opacity-50',
                    isToday && 'bg-accent/5'
                  )}
                >
                  <div className={cn(
                    'text-[11px] font-medium text-right mb-0.5',
                    isToday ? 'text-accent font-bold' : 'text-muted-foreground'
                  )}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, MAX_EVENTS_PER_DAY).map(e => (
                      <div
                        key={e.id}
                        onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                        className={cn(
                          'text-[10px] px-1 py-0.5 rounded truncate cursor-pointer border-l-2',
                          PRIORITY_STYLES[e.priority]?.light || 'bg-muted',
                          PRIORITY_STYLES[e.priority]?.border || 'border-muted'
                        )}
                      >
                        {e.isAllDay ? '' : format(new Date(e.startsAt), 'h:mm') + ' '}
                        {e.title}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div
                        onClick={(ev) => { ev.stopPropagation(); onDayClick?.(day); }}
                        className="text-[10px] text-muted-foreground px-1 cursor-pointer hover:text-foreground"
                      >
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}