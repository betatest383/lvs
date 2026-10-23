import React, { useState, useMemo } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, CalendarPlus, GripVertical } from 'lucide-react';
import TaskCalendarCard from './TaskCalendarCard';
import { cn } from '@/lib/utils';

/**
 * Unscheduled Tasks panel — shows tasks without starts_at, due_at, or due_date.
 * Authorized managers can drag tasks onto the calendar or schedule via dialog.
 * Employees may view their own unscheduled tasks but cannot schedule without permission.
 */
export default function UnscheduledTasksPanel({ open, onOpenChange, unscheduled, onEventClick, onSchedule, canSchedule }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return unscheduled;
    const q = search.toLowerCase();
    return unscheduled.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.displayNumber.toLowerCase().includes(q) ||
      (e.assigneeName || '').toLowerCase().includes(q)
    );
  }, [unscheduled, search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Unscheduled Tasks ({unscheduled.length})</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unscheduled tasks..."
              className="pl-8"
            />
          </div>

          {!canSchedule && (
            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              You can view your unscheduled tasks. Only authorized managers can schedule tasks onto the calendar.
            </p>
          )}

          <div className="space-y-2">
            {filtered.map(e => (
              <div
                key={e.id}
                draggable={canSchedule}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData('text/calendar-event', JSON.stringify({ id: e.id, sourceRecordId: e.sourceRecordId, isUnscheduled: true }));
                }}
                className={cn('transition-opacity', canSchedule && 'cursor-grab active:cursor-grabbing')}
              >
                <TaskCalendarCard
                  event={e}
                  onClick={onEventClick}
                  onReschedule={canSchedule ? (event) => onSchedule?.(event) : undefined}
                />
                {canSchedule && (
                  <div className="flex items-center gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs w-full"
                      onClick={() => onSchedule?.(e)}
                    >
                      <CalendarPlus className="w-3 h-3 mr-1" /> Schedule
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search ? 'No matching tasks' : 'No unscheduled tasks'}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}