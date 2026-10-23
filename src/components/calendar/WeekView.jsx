import React from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import TaskCalendarCard from './TaskCalendarCard';
import { WORK_HOURS } from '@/lib/calendarConstants';

const HOUR_HEIGHT = 48;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: WORK_HOURS.end - WORK_HOURS.start + 1 }, (_, i) => WORK_HOURS.start + i);

export default function WeekView({ events, currentDate, onEventClick, onReschedule, onCreateSlot, canReschedule, canCreate, onDropEvent, conflictMap }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const allDayForDay = (day) => events.filter(e => {
    if (!e.startsAt || !e.isAllDay) return false;
    return isSameDay(new Date(e.startsAt), day);
  });

  const timedForDay = (day) => events.filter(e => {
    if (!e.startsAt || e.isAllDay) return false;
    return isSameDay(new Date(e.startsAt), day);
  });

  const getEventPos = (event) => {
    const start = new Date(event.startsAt);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = event.endsAt
      ? new Date(event.endsAt).getHours() + new Date(event.endsAt).getMinutes() / 60
      : startHour + 1;
    return {
      top: Math.max(0, (startHour - WORK_HOURS.start) * HOUR_HEIGHT),
      height: Math.max(24, (endHour - startHour) * HOUR_HEIGHT - 2),
    };
  };

  const handleSlotClick = (day, hour) => {
    if (!canCreate) return;
    const dateStr = format(day, 'yyyy-MM-dd');
    const startISO = new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00').toISOString();
    const endISO = new Date(dateStr + 'T' + String(hour + 1).padStart(2, '0') + ':00:00').toISOString();
    onCreateSlot?.({ startsAt: startISO, endsAt: endISO, isAllDay: false, date: day });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b sticky top-0 bg-card z-10">
        <div className="w-14 shrink-0" />
        {days.map((day, i) => (
          <div key={i} className="flex-1 text-center py-1.5 border-l">
            <div className="text-[10px] text-muted-foreground">{DAYS[i]}</div>
            <div className={cn('text-sm font-semibold', isSameDay(day, today) && 'text-accent')}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      <div className="flex border-b bg-muted/20">
        <div className="w-14 shrink-0 text-[10px] text-muted-foreground pr-1 pt-1 text-right">all day</div>
        {days.map((day, i) => (
          <div key={i} className="flex-1 border-l p-1 min-h-[32px] space-y-1">
            {allDayForDay(day).map(e => (
              <TaskCalendarCard key={e.id} event={e} onClick={onEventClick} compact conflicts={conflictMap?.[e.id]} />
            ))}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex">
          {/* Hours column */}
          <div className="w-14 shrink-0">
            {HOURS.map((hour, i) => (
              <div key={hour} className="text-[10px] text-muted-foreground pr-1 text-right pt-1 border-t" style={{ height: HOUR_HEIGHT }}>
                {hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => (
            <div key={dayIdx} className="flex-1 border-l relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
              {HOURS.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border/30 hover:bg-accent/5 cursor-pointer transition-colors"
                  style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  onClick={() => handleSlotClick(day, hour)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData('text/calendar-event');
                    if (!raw) return;
                    try {
                      const data = JSON.parse(raw);
                      if (data.id) onDropEvent?.(data.id, day, hour);
                    } catch {}
                  }}
                />
              ))}

              {/* Current time indicator */}
              {isSameDay(day, today) && (() => {
                const now = new Date();
                const ch = now.getHours() + now.getMinutes() / 60;
                if (ch < WORK_HOURS.start || ch > WORK_HOURS.end) return null;
                return (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: (ch - WORK_HOURS.start) * HOUR_HEIGHT }}>
                    <div className="h-px bg-red-500" />
                  </div>
                );
              })()}

              {/* Timed events */}
              {timedForDay(day).map(event => {
                const { top, height } = getEventPos(event);
                return (
                  <div key={event.id} className="absolute left-1 right-1 z-5" style={{ top: top + 1, height: Math.max(height, 22) }}>
                    <TaskCalendarCard
                      event={event}
                      onClick={onEventClick}
                      onReschedule={canReschedule && event.providerKey !== 'appointment' ? onReschedule : undefined}
                      compact={height < 40}
                      draggable={canReschedule && event.providerKey !== 'appointment'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/calendar-event', JSON.stringify({ id: event.id, sourceRecordId: event.sourceRecordId }));
                      }}
                      conflicts={conflictMap?.[event.id]}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}