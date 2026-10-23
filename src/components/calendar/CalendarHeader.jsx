import React from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Filter, Plus, List, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VIEW_LABELS, CALENDAR_VIEWS } from '@/lib/calendarConstants';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, startOfMonth } from 'date-fns';

export default function CalendarHeader({ view, onViewChange, currentDate, onDateChange, onOpenFilters, onOpenUnscheduled, unscheduledCount, onToday, filterCount, onNewTask, onRefresh, canCreate }) {
  const goPrev = () => {
    if (view === 'day') onDateChange(subDays(currentDate, 1));
    else if (view === 'week') onDateChange(subWeeks(currentDate, 1));
    else if (view === 'month') onDateChange(subMonths(currentDate, 1));
    else onDateChange(subDays(currentDate, 1));
  };
  const goNext = () => {
    if (view === 'day') onDateChange(addDays(currentDate, 1));
    else if (view === 'week') onDateChange(addWeeks(currentDate, 1));
    else if (view === 'month') onDateChange(addMonths(currentDate, 1));
    else onDateChange(addDays(currentDate, 1));
  };

  const dateLabel = (() => {
    if (view === 'day') return format(currentDate, 'EEEE, MMM d, yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = addDays(ws, 6);
      return format(ws, 'MMM d') + ' – ' + format(we, 'MMM d, yyyy');
    }
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    return format(currentDate, 'MMM d, yyyy');
  })();

  return (
    <div className="flex items-center gap-2 flex-wrap p-3 border-b bg-card sticky top-0 z-20">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={goPrev} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onToday} className="h-8">Today</Button>
        <Button variant="ghost" size="icon" onClick={goNext} className="h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="font-semibold text-sm md:text-base min-w-[140px]">{dateLabel}</div>

      <div className="flex items-center gap-1 ml-auto">
        {/* View switcher */}
        <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
          {CALENDAR_VIEWS.map(v => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onOpenFilters} className="h-8 relative">
          <Filter className="w-3.5 h-3.5 mr-1" /> Filters
          {filterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-accent-foreground text-[9px] rounded-full flex items-center justify-center font-bold">
              {filterCount}
            </span>
          )}
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenUnscheduled} className="h-8 relative">
          <List className="w-3.5 h-3.5 mr-1" /> Unscheduled
          {unscheduledCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
              {unscheduledCount > 9 ? '9+' : unscheduledCount}
            </span>
          )}
        </Button>

        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}

        {canCreate && onNewTask && (
          <Button size="sm" onClick={onNewTask} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1" /> New Task
          </Button>
        )}
      </div>
    </div>
  );
}