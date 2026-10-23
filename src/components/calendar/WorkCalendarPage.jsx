import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { hasTaskPermission } from '@/lib/taskPermissions';
import { CALENDAR_SCOPES, CALENDAR_VIEWS, DEFAULT_TIMEZONE } from '@/lib/calendarConstants';
import { detectConflicts } from '@/components/calendar/ConflictIndicator';

import CalendarHeader from './CalendarHeader';
import DayView from './DayView';
import WeekView from './WeekView';
import MonthView from './MonthView';
import AgendaView from './AgendaView';
import CalendarFilters from './CalendarFilters';
import UnscheduledTasksPanel from './UnscheduledTasksPanel';
import RescheduleDialog from './RescheduleDialog';
import TaskCalendarCard from './TaskCalendarCard';
import { ENTERPRISE_TASK_PROVIDER } from '@/lib/calendarEventProvider';

import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

const DEFAULT_FILTERS = {
  scope: CALENDAR_SCOPES.MY,
  showCompleted: false,
  showOverdueOnly: false,
  showInterruptedOnly: false,
};

export default function WorkCalendarPage() {
  const navigate = useNavigate();
  const { role, employee, loading: roleLoading } = useCurrentRole();

  // Persist last selected view; default to Agenda on mobile for touch-friendliness
  const [view, setView] = useState(() => localStorage.getItem('lvc_calendar_view') || (typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'week'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleInitial, setRescheduleInitial] = useState(null);
  const [createForm, setCreateForm] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  const { events, unscheduled, loading, error, refetch } = useCalendarEvents(filters, currentDate, view, employee, role);

  // Save view preference
  useEffect(() => {
    localStorage.setItem('lvc_calendar_view', view);
  }, [view]);

  // Fetch employees and departments for filter dropdowns
  useEffect(() => {
    if (role === 'admin' || role === 'owner' || role === 'director_of_operations' || role === 'operations_manager') {
      base44.entities.EmployeeRegistry.filter({ employment_status: 'Active' }, 'first_name', 200)
        .then(setEmployees)
        .catch(() => {});
    }
    base44.entities.EmployeeRegistry.filter({ employment_status: 'Active' }, null, 200)
      .then(emps => {
        const depts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();
        setDepartments(depts);
      })
      .catch(() => {});
  }, [role]);

  // Permissions
  const canCreate = useMemo(() => hasTaskPermission(role, 'create'), [role]);
  const canReschedule = useMemo(() => hasTaskPermission(role, 'change_due_date'), [role]);

  // Conflict detection
  const conflicts = useMemo(() => detectConflicts(events), [events]);
  const conflictMap = useMemo(() => {
    const map = {};
    for (const c of conflicts) {
      if (!map[c.eventId]) map[c.eventId] = [];
      map[c.eventId].push(c);
    }
    return map;
  }, [conflicts]);

  // Handle event click — opens Task Detail for tasks, shows info for appointments
  const handleEventClick = useCallback((event) => {
    if (event.providerKey === 'appointment') {
      toast.info(`ServiceTitan Appointment: ${event.title}${event.assigneeName ? ` — ${event.assigneeName}` : ''}`);
      return;
    }
    navigate(`/tasks/detail/${event.sourceRecordId}`);
  }, [navigate]);

  // Handle create from calendar slot — opens TaskFormDialog with prefilled dates
  const handleCreateSlot = useCallback((slot) => {
    if (!canCreate) {
      toast.error("You don't have permission to create tasks");
      return;
    }
    setCreateForm({
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      is_all_day: slot.isAllDay,
      schedule_timezone: DEFAULT_TIMEZONE,
      status: 'New',
      priority: 'Medium',
      task_type: 'Operational',
    });
  }, [canCreate]);

  // Handle reschedule — opens RescheduleDialog
  const handleReschedule = useCallback((event, proposedStart = null, proposedEnd = null) => {
    if (!canReschedule) {
      toast.error("You don't have permission to reschedule tasks");
      return;
    }
    if (event.providerKey === 'appointment') {
      toast.info("ServiceTitan appointments are read-only and cannot be rescheduled from the LVC calendar.");
      return;
    }
    setRescheduleTarget(event);
    setRescheduleInitial({ start: proposedStart, end: proposedEnd });
  }, [canReschedule]);

  // Handle drag-and-drop onto a specific calendar slot (day + hour)
  const handleDropEvent = useCallback((eventId, day, hour) => {
    if (!canReschedule) {
      toast.error("You don't have permission to reschedule tasks");
      return;
    }
    const event = events.find(ev => ev.id === eventId) || unscheduled.find(ev => ev.id === eventId);
    if (!event) return;
    if (event.providerKey === 'appointment') {
      toast.info("ServiceTitan appointments are read-only and cannot be rescheduled from the LVC calendar.");
      return;
    }
    const dateStr = format(day, 'yyyy-MM-dd');
    const newStart = new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00').toISOString();
    const durationMs = event.endsAt
      ? new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()
      : 60 * 60 * 1000; // default 1 hour
    const newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString();
    handleReschedule(event, newStart, newEnd);
  }, [canReschedule, handleReschedule, events, unscheduled]);

  // Handle "New Task" button — opens TaskFormDialog without a prefilled slot
  const handleNewTask = useCallback(() => {
    if (!canCreate) {
      toast.error("You don't have permission to create tasks");
      return;
    }
    setCreateForm({
      starts_at: null,
      ends_at: null,
      is_all_day: false,
      schedule_timezone: DEFAULT_TIMEZONE,
      status: 'New',
      priority: 'Medium',
      task_type: 'Operational',
    });
  }, [canCreate]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Handle task creation save
  const handleCreateSave = useCallback(async (taskData) => {
    const enrichedData = {
      ...taskData,
      ...(taskData.starts_at ? { schedule_status: 'scheduled' } : {}),
    };
    const response = await base44.functions.invoke('manageTask', {
      action: 'create',
      taskData: enrichedData,
    });
    if (response.data?.error) throw new Error(response.data.error);

    const createdTask = response.data?.task;
    toast.success('Task created');

    // Refetch and verify the created task appears in the events.
    // If it doesn't appear (possible read-after-write latency or stale
    // closure), retry after a short delay. Up to 3 attempts.
    if (createdTask?.id) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const fetchedEvents = await refetch();
        const found = fetchedEvents?.some(e => e.sourceRecordId === createdTask.id);
        if (found) break;
        // Wait 400ms before retrying (allows DB propagation)
        await new Promise(r => setTimeout(r, 400));
      }
    } else {
      await refetch();
    }
  }, [refetch]);

  // Handle reschedule success
  const handleRescheduleSuccess = useCallback(() => {
    setRescheduleTarget(null);
    setRescheduleInitial(null);
    refetch();
  }, [refetch]);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS, scope: filters.scope });
  }, [filters.scope]);

  // Filter count for badge
  const filterCount = useMemo(() => {
    let count = 0;
    if (filters.priority) count++;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.taskType && filters.taskType !== 'all') count++;
    if (filters.workCategory && filters.workCategory !== 'all') count++;
    if (filters.acknowledgmentStatus && filters.acknowledgmentStatus !== 'all') count++;
    if (filters.showCompleted) count++;
    if (filters.showOverdueOnly) count++;
    if (filters.showInterruptedOnly) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  if (roleLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
        <p className="text-sm text-destructive mb-2">{error}</p>
        <button onClick={refetch} className="text-sm text-accent underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <CalendarHeader
        view={view}
        onViewChange={setView}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onOpenFilters={() => setShowFilters(true)}
        onOpenUnscheduled={() => setShowUnscheduled(true)}
        unscheduledCount={unscheduled.length}
        onToday={() => setCurrentDate(new Date())}
        filterCount={filterCount}
        onNewTask={handleNewTask}
        onRefresh={handleRefresh}
        canCreate={canCreate}
      />

      {/* Conflict summary banner */}
      {conflicts.length > 0 && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-medium">{conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected</span>
          <span className="text-amber-600">— click tasks for details</span>
        </div>
      )}

      {/* Calendar view */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-30">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {view === 'day' && (
          <DayView
            events={events}
            currentDate={currentDate}
            onEventClick={handleEventClick}
            onReschedule={(e) => handleReschedule(e)}
            onCreateSlot={handleCreateSlot}
            canReschedule={canReschedule}
            canCreate={canCreate}
            onDropEvent={handleDropEvent}
            conflictMap={conflictMap}
          />
        )}
        {view === 'week' && (
          <WeekView
            events={events}
            currentDate={currentDate}
            onEventClick={handleEventClick}
            onReschedule={(e) => handleReschedule(e)}
            onCreateSlot={handleCreateSlot}
            canReschedule={canReschedule}
            canCreate={canCreate}
            onDropEvent={handleDropEvent}
            conflictMap={conflictMap}
          />
        )}
        {view === 'month' && (
          <MonthView
            events={events}
            currentDate={currentDate}
            onEventClick={handleEventClick}
            onDayClick={(day) => { setCurrentDate(day); setView('day'); }}
            onReschedule={(e) => handleReschedule(e)}
            canReschedule={canReschedule}
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            events={events}
            unscheduled={unscheduled}
            currentDate={currentDate}
            onEventClick={handleEventClick}
            onReschedule={(e) => handleReschedule(e)}
            canReschedule={canReschedule}
            conflictMap={conflictMap}
          />
        )}
      </div>

      {/* Filters drawer */}
      <CalendarFilters
        open={showFilters}
        onOpenChange={setShowFilters}
        filters={filters}
        onChange={setFilters}
        onClear={handleClearFilters}
        role={role}
        employees={employees}
        departments={departments}
      />

      {/* Unscheduled tasks panel */}
      <UnscheduledTasksPanel
        open={showUnscheduled}
        onOpenChange={setShowUnscheduled}
        unscheduled={unscheduled}
        onEventClick={handleEventClick}
        onSchedule={(event) => {
          setShowUnscheduled(false);
          handleReschedule(event);
        }}
        canSchedule={canReschedule}
      />

      {/* Reschedule dialog */}
      {rescheduleTarget && (
        <RescheduleDialog
          open={!!rescheduleTarget}
          onOpenChange={(v) => { if (!v) { setRescheduleTarget(null); setRescheduleInitial(null); } }}
          event={rescheduleTarget}
          initialStart={rescheduleInitial?.start}
          initialEnd={rescheduleInitial?.end}
          onSuccess={handleRescheduleSuccess}
          sourceContext="calendar"
        />
      )}

      {/* Create task dialog */}
      {createForm && (
        <TaskFormDialog
          open={!!createForm}
          onOpenChange={(v) => { if (!v) setCreateForm(null); }}
          initialData={createForm}
          onSave={handleCreateSave}
        />
      )}
    </div>
  );
}