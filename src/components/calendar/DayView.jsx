import React, { useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import TaskCalendarCard from './TaskCalendarCard';
import { WORK_HOURS, DEFAULT_TIMEZONE } from '@/lib/calendarConstants';

const HOUR_HEIGHT = 56; // px per hour
const HOURS = Array.from({ length: WORK_HOURS.end - WORK_HOURS.start + 1 }, (_, i) => WORK_HOURS.start + i);

// ─── Horizontal overlap layout ────────────────────────────────────────────────
// When timed events overlap, they are split into horizontal columns instead
// of stacking vertically. Columns are assigned chronologically (earliest
// start → left); a two-column refinement moves a significantly longer event
// to the left so its identifying text stays visible.
const GUTTER_LEFT = 64; // px — time-label gutter (matches left-16)
const RIGHT_PAD = 8;    // px — right margin (matches right-2)
const COL_GAP = 4;      // px between columns

/**
 * Compute left/right/zIndex for an event placed in a horizontal overlap
 * column. Anchored to the grid edges (left + right) so the percentage
 * math resolves against the full grid width, not the remaining space.
 */
function getOverlapStyle(columnIndex, columnCount) {
  const n = Math.max(1, columnCount);
  if (n === 1) {
    return { left: GUTTER_LEFT, right: RIGHT_PAD, zIndex: 5 };
  }
  // columnWidth = (100% - gutter - rightPad - (n-1)*gap) / n
  const avail = `100% - ${GUTTER_LEFT}px - ${RIGHT_PAD}px - ${(n - 1) * COL_GAP}px`;
  const colWidth = `((${avail}) / ${n})`;
  const left = `calc(${GUTTER_LEFT}px + ${columnIndex} * (${colWidth} + ${COL_GAP}px))`;
  const right = `calc(${RIGHT_PAD}px + ${n - 1 - columnIndex} * (${colWidth} + ${COL_GAP}px))`;
  return { left, right, zIndex: 5 + columnIndex };
}

/**
 * Group overlapping timed events (transitive clustering) and assign each a
 * column index within its group.
 *
 * Assignment is chronological: events are sorted by start time ascending
 * (tie-break: longer first) and each is placed in the first column whose
 * existing intervals do not overlap it. A two-column refinement then moves
 * a significantly longer event to the left column.
 *
 * Returns: { [eventId]: { columnIndex, columnCount } }
 */
function computeOverlapColumns(timedEvents) {
  if (!timedEvents.length) return {};

  const withIntervals = timedEvents.map(e => {
    const start = new Date(e.startsAt).getTime();
    const end = e.endsAt ? new Date(e.endsAt).getTime() : start + 60 * 60 * 1000;
    return { id: e.id, start, end, duration: end - start };
  });

  const overlaps = (a, b) => a.start < b.end && a.end > b.start;

  // Sort by start ascending to walk the timeline for cluster detection.
  // Tie-break longer first so same-start events order predictably.
  const sorted = [...withIntervals].sort((a, b) => a.start - b.start || b.duration - a.duration);

  // Transitive overlap clustering: a cluster grows until the next event
  // starts after the cluster's furthest end. (A overlaps B, B overlaps C
  // ⇒ all three in one group even if A and C don't directly overlap.)
  const groups = [];
  let cur = [];
  let groupEnd = -Infinity;
  for (const item of sorted) {
    if (cur.length && item.start >= groupEnd) {
      groups.push(cur);
      cur = [];
      groupEnd = -Infinity;
    }
    cur.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (cur.length) groups.push(cur);

  const result = {};
  for (const group of groups) {
    // Standard chronological assignment: earliest start → first available
    // column. Standard interval overlap logic.
    const chronological = [...group].sort((a, b) => a.start - b.start || b.duration - a.duration);
    const columns = []; // each column: array of { start, end } intervals
    const assign = {};
    for (const item of chronological) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const conflicts = columns[c].some(iv => overlaps(item, iv));
        if (!conflicts) {
          columns[c].push({ start: item.start, end: item.end });
          assign[item.id] = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([{ start: item.start, end: item.end }]);
        assign[item.id] = columns.length - 1;
      }
    }

    let columnCount = columns.length;

    // ── Two-column refinement: longer event stays left ──
    // Only when exactly two columns are in use AND one event is
    // significantly longer (>= 1.5×) than a shorter event in the other
    // column. Swap the column labels so the longer event lands left.
    // Relabeling whole columns never creates intra-column conflicts
    // (columns are independent interval sets), but we verify anyway.
    if (columnCount === 2) {
      const longest = [...group].sort((a, b) => b.duration - a.duration)[0];
      if (assign[longest.id] === 1) {
        const col0Items = group.filter(i => assign[i.id] === 0);
        const shortestCol0 = [...col0Items].sort((a, b) => a.duration - b.duration)[0];
        if (shortestCol0 && longest.duration >= shortestCol0.duration * 1.5) {
          const newCol0 = group.filter(i => assign[i.id] === 1);
          const newCol1 = group.filter(i => assign[i.id] === 0);
          const safe = newCol0.every((iv, _, arr) => arr.every(o => o === iv || !overlaps(iv, o)))
            && newCol1.every((iv, _, arr) => arr.every(o => o === iv || !overlaps(iv, o)));
          if (safe) {
            for (const item of group) {
              assign[item.id] = assign[item.id] === 0 ? 1 : 0;
            }
          }
        }
      }
    }

    for (const item of group) {
      result[item.id] = { columnIndex: assign[item.id], columnCount };
    }
  }
  return result;
}

export default function DayView({ events, currentDate, onEventClick, onReschedule, onCreateSlot, canReschedule, canCreate, onDropEvent, conflictMap }) {
  const gridRef = useRef(null);
  const today = new Date();
  const isToday = format(currentDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

  // Day boundaries (00:00 – 24:00) for clipping cross-day events
  const dayStart = new Date(format(currentDate, 'yyyy-MM-dd') + 'T00:00:00');
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Include events that overlap the displayed day
  const dayEvents = events.filter(e => {
    if (!e.startsAt) return false;
    const eventStart = new Date(e.startsAt);
    const eventEnd = e.endsAt
      ? new Date(e.endsAt)
      : new Date(eventStart.getTime() + 60 * 60 * 1000);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  const allDayEvents = dayEvents.filter(e => e.isAllDay);
  const timedEvents = dayEvents.filter(e => !e.isAllDay);

  // Horizontal overlap columns for timed events (longest → left column)
  const overlapMap = useMemo(() => computeOverlapColumns(timedEvents), [timedEvents]);

  // Current time indicator position
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE }));
  const currentHour = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const showNowIndicator = isToday && currentHour >= WORK_HOURS.start && currentHour <= WORK_HOURS.end;
  const nowTop = (currentHour - WORK_HOURS.start) * HOUR_HEIGHT;

  const getEventPosition = (event) => {
    const eventStart = new Date(event.startsAt);
    const eventEnd = event.endsAt
      ? new Date(event.endsAt)
      : new Date(eventStart.getTime() + 60 * 60 * 1000);

    // Clip to the displayed day and visible work-hour window
    const workWindowStart = new Date(dayStart.getTime() + WORK_HOURS.start * 60 * 60 * 1000);
    const workWindowEnd = new Date(dayStart.getTime() + WORK_HOURS.end * 60 * 60 * 1000);
    const visibleStart = new Date(Math.max(eventStart.getTime(), dayStart.getTime(), workWindowStart.getTime()));
    const visibleEnd = new Date(Math.min(eventEnd.getTime(), dayEnd.getTime(), workWindowEnd.getTime()));

    // No overlap with the displayed day — skip rendering
    if (visibleEnd.getTime() <= visibleStart.getTime()) {
      return null;
    }

    const startHour = (visibleStart.getTime() - dayStart.getTime()) / (60 * 60 * 1000);
    const endHour = (visibleEnd.getTime() - dayStart.getTime()) / (60 * 60 * 1000);

    const top = Math.max(0, (startHour - WORK_HOURS.start) * HOUR_HEIGHT);
    const rawHeight = (endHour - startHour) * HOUR_HEIGHT - 2;
    const height = Math.max(28, rawHeight);

    return { top, height };
  };

  const handleSlotClick = (hour) => {
    if (!canCreate) return;
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const startISO = new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00').toISOString();
    const endISO = new Date(dateStr + 'T' + String(hour + 1).padStart(2, '0') + ':00:00').toISOString();
    onCreateSlot?.({ startsAt: startISO, endsAt: endISO, isAllDay: false, date: currentDate });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* All-day section */}
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 bg-muted/30">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">ALL DAY</div>
          <div className="flex flex-col gap-1">
            {allDayEvents.map(e => (
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

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto" ref={gridRef}>
        <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          {/* Hour rows */}
          {HOURS.map((hour, i) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/40 flex"
              style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <div className="w-14 shrink-0 text-[10px] text-muted-foreground pr-1 pt-1 text-right">
                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </div>
              <div
                className="flex-1 hover:bg-accent/5 cursor-pointer transition-colors"
                onClick={() => handleSlotClick(hour)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData('text/calendar-event');
                  if (!raw) return;
                  try {
                    const data = JSON.parse(raw);
                    if (data.id) onDropEvent?.(data.id, currentDate, hour);
                  } catch {}
                }}
              />
            </div>
          ))}

          {/* Current time indicator */}
          {showNowIndicator && (
            <div className="absolute left-14 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                <div className="h-px bg-red-500 flex-1" />
              </div>
            </div>
          )}

          {/* Timed events */}
          {timedEvents.map((event) => {
            const pos = getEventPosition(event);
            if (!pos) return null;
            const { top, height } = pos;
            const { columnIndex = 0, columnCount = 1 } = overlapMap[event.id] || {};
            const overlapStyle = getOverlapStyle(columnIndex, columnCount);
            // 4+ simultaneous overlaps → extra-compact cards to stay readable
            const extraCompact = columnCount >= 4;
            const style = { top: top + 2, height: Math.max(height, 30), ...overlapStyle };

            return (
              <div
                key={event.id}
                className="absolute overflow-hidden"
                style={style}
              >
                <TaskCalendarCard
                  event={event}
                  onClick={onEventClick}
                  onReschedule={canReschedule && !extraCompact && event.providerKey !== 'appointment' ? onReschedule : undefined}
                  compact={height < 50 || extraCompact}
                  extraCompact={extraCompact}
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
      </div>
    </div>
  );
}