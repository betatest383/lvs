import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { taskToCalendarEvent, appointmentToCalendarEvent, hasScheduleDate } from '@/lib/calendarEventProvider';
import { CALENDAR_SCOPES } from '@/lib/calendarConstants';

/**
 * Fetches EnterpriseTask records and converts them to CalendarEvents.
 * The calendar is a visual layer — EnterpriseTask remains the source record.
 *
 * Scope determines which tasks are fetched:
 * - my: tasks assigned to the current employee
 * - employee: tasks for a specific employee (admin/manager)
 * - department: tasks for a department
 * - company: all tasks (admin/owner only)
 */
export function useCalendarEvents(filters, currentDate, view, employee, role) {
  const [events, setEvents] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ref to always access the latest fetchEvents (avoids stale closures)
  const fetchEventsRef = useRef(null);

  const fetchEvents = useCallback(async () => {
    if (!employee?.id && filters.scope !== CALENDAR_SCOPES.COMPANY) {
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const query = {};

      // Exclude completed/canceled by default unless filter says otherwise
      if (filters.status && filters.status !== 'all') {
        query.status = filters.status;
      } else if (!filters.showCompleted) {
        query.status = { $nin: ['Completed', 'Canceled', 'Cancelled'] };
      }

      // Priority filter
      if (filters.priority) {
        query.priority = filters.priority;
      }

      // Task type filter
      if (filters.taskType) {
        query.task_type = filters.taskType;
      }

      // Department filter (when scope is not department)
      if (filters.scope !== CALENDAR_SCOPES.DEPARTMENT && filters.department) {
        query.assigned_department = filters.department;
      }

      let tasks;

      if (filters.scope === CALENDAR_SCOPES.MY) {
        // MY scope: fetch assigned-to-me and created-by-me separately.
        // The client SDK may not support $or reliably, so we use two
        // sequential queries and merge/deduplicate by task ID.
        // Tasks created by me but assigned to another employee are excluded.
        const empId = employee.employee_id || employee.id;

        const assignedQuery = { ...query, assigned_employee_registry_id: employee.id };
        const createdByMeQuery = { ...query, requested_by_employee_id: empId };

        const assignedTasks = await base44.entities.EnterpriseTask.filter(assignedQuery, '-starts_at', 300);
        const createdByMeTasks = await base44.entities.EnterpriseTask.filter(createdByMeQuery, '-starts_at', 300);

        // Merge and deduplicate by entity ID
        const seen = new Set();
        tasks = [];
        for (const t of [...assignedTasks, ...createdByMeTasks]) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          // Exclude tasks created by me but assigned to another employee
          if (t.assigned_employee_registry_id && t.assigned_employee_registry_id !== employee.id) {
            continue;
          }
          tasks.push(t);
        }

        // Re-sort the merged list by starts_at descending
        tasks.sort((a, b) => {
          const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
          const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
          return bTime - aTime;
        });
      } else {
        // Non-MY scopes: single query with direct field filters
        if (filters.scope === CALENDAR_SCOPES.EMPLOYEE && filters.employeeId) {
          query.assigned_employee_registry_id = filters.employeeId;
        } else if (filters.scope === CALENDAR_SCOPES.DEPARTMENT && filters.department) {
          query.assigned_department = filters.department;
        }

        tasks = await base44.entities.EnterpriseTask.filter(query, '-starts_at', 300);
      }

      // ── Fetch ServiceTitan-synced Appointments in parallel ──
      const apptQuery = {};
      if (!filters.showCompleted) {
        apptQuery.is_canceled = { $ne: true };
        apptQuery.status = { $nin: ['cancelled', 'completed'] };
      }
      if (filters.scope === CALENDAR_SCOPES.MY && employee?.id) {
        apptQuery.technician_id = employee.id;
      } else if (filters.scope === CALENDAR_SCOPES.EMPLOYEE && filters.employeeId) {
        apptQuery.technician_id = filters.employeeId;
      }

      let appointments = [];
      try {
        appointments = await base44.entities.Appointment.filter(apptQuery, '-scheduled_start', 200);
      } catch (apptErr) {
        // Appointments are a secondary feed — never block the calendar on failure
        console.error('[CALENDAR] Appointment fetch failed:', apptErr);
      }

      const apptEvents = appointments.map(appointmentToCalendarEvent).filter(e => e.startsAt);

      // Convert tasks to calendar events
      const allEvents = tasks.map(taskToCalendarEvent);

      // Merge tasks + appointments
      const scheduled = [...allEvents.filter(e => e.startsAt), ...apptEvents];

      // Separate unscheduled tasks (appointments are always scheduled)
      const unsched = tasks.filter(t => !hasScheduleDate(t)).map(taskToCalendarEvent);

      // Apply client-side filters for acknowledgment, work category, etc.
      let filtered = scheduled;

      if (filters.acknowledgmentStatus && filters.acknowledgmentStatus !== 'all') {
        filtered = filtered.filter(e => e.acknowledgmentStatus === filters.acknowledgmentStatus);
      }
      if (filters.workCategory && filters.workCategory !== 'all') {
        filtered = filtered.filter(e => e.workCategory === filters.workCategory);
      }
      if (filters.showOverdueOnly) {
        filtered = filtered.filter(e => e.isOverdue);
      }
      if (filters.showInterruptedOnly) {
        filtered = filtered.filter(e => e.isInterrupted || e.resumeRequired);
      }
      if (filters.relatedModule && filters.relatedModule !== 'all') {
        filtered = filtered.filter(e => e.metadata.related_module === filters.relatedModule);
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.displayNumber.toLowerCase().includes(q) ||
          (e.assigneeName || '').toLowerCase().includes(q)
        );
      }

      setEvents(filtered);
      setUnscheduled(unsched);

      return filtered;
    } catch (err) {
      setError(err.message || 'Failed to load calendar');
      return [];
    } finally {
      setLoading(false);
    }
  }, [filters, employee, role]);

  // Keep the ref updated so the stable refetch always calls the latest fetchEvents
  useEffect(() => {
    fetchEventsRef.current = fetchEvents;
  }, [fetchEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Stable refetch that always calls the latest fetchEvents via ref.
  // This prevents stale-closure issues when handleCreateSave captures refetch.
  const refetch = useCallback(async () => {
    if (fetchEventsRef.current) {
      return await fetchEventsRef.current();
    }
    return [];
  }, []);

  return { events, unscheduled, loading, error, refetch };
}