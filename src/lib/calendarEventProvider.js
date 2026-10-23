/**
 * Calendar Event Provider — EnterpriseTask provider.
 *
 * Converts EnterpriseTask records into CalendarEvent objects.
 * This is the initial provider; future providers (Appointments, PTO, etc.)
 * will implement the same interface and merge into the calendar timeline.
 *
 * Fallback priority for calendar positioning:
 *   1. starts_at (explicit schedule)
 *   2. due_at (time-aware due)
 *   3. due_date (all-day fallback)
 *   4. Unscheduled (no calendar date)
 */

import { DEFAULT_TIMEZONE } from './calendarConstants';

/**
 * Check if a task has any scheduling date.
 */
export function hasScheduleDate(task) {
  return !!(task.starts_at || task.due_at || task.due_date);
}

/**
 * Resolve the effective start date for calendar positioning.
 * Returns { startsAt, endsAt, isAllDay } using the fallback priority.
 */
export function resolveScheduleDate(task) {
  if (task.starts_at) {
    return {
      startsAt: task.starts_at,
      endsAt: task.ends_at || null,
      isAllDay: task.is_all_day || false,
    };
  }
  if (task.due_at) {
    return {
      startsAt: task.due_at,
      endsAt: null,
      isAllDay: false,
    };
  }
  if (task.due_date) {
    return {
      startsAt: task.due_date + 'T00:00:00',
      endsAt: null,
      isAllDay: true,
    };
  }
  return { startsAt: null, endsAt: null, isAllDay: false };
}

/**
 * Convert an EnterpriseTask record to a CalendarEvent.
 */
export function taskToCalendarEvent(task) {
  const { startsAt, endsAt, isAllDay } = resolveScheduleDate(task);
  const now = new Date();

  const isOverdue = task.due_date
    ? new Date(task.due_date) < now && !['Completed', 'Canceled', 'Cancelled'].includes(task.status)
    : task.due_at
      ? new Date(task.due_at) < now && !['Completed', 'Canceled', 'Cancelled'].includes(task.status)
      : false;

  const isInterrupted = task.orchestration_status === 'paused_by_higher_priority';
  const resumeRequired = !!(task.resume_required || (task.orchestration_status === 'paused_by_higher_priority'));

  const assigneeName = task.assigned_to
    || [task.assigned_to, task.assigned_to_email].filter(Boolean).join(' — ')
    || '';
  const assigneeEmployeeId = task.assigned_employee_registry_id || '';

  return {
    id: 'enterprise_task:' + task.id,
    providerKey: 'enterprise_task',
    sourceRecordId: task.id,
    title: task.title || 'Untitled Task',
    displayNumber: task.task_number || task.id,
    startsAt,
    endsAt,
    isAllDay,
    priority: task.priority || 'Medium',
    status: task.status || 'Draft',
    department: task.assigned_department || task.department || '',
    assigneeName,
    assigneeId: task.assigned_employee_registry_id || '',
    assigneeEmployeeId,
    taskType: task.task_type || '',
    workCategory: task.work_category || '',
    isOverdue,
    isInterrupted,
    resumeRequired,
    acknowledgmentStatus: task.acknowledgment_status || 'none',
    workSessionStatus: task.orchestration_status || '',
    relatedJob: task.related_job || '',
    relatedCustomer: task.related_customer || '',
    metadata: {
      schedule_status: task.schedule_status || 'unscheduled',
      schedule_timezone: task.schedule_timezone || DEFAULT_TIMEZONE,
      estimated_duration_minutes: task.estimated_duration_minutes || 0,
      assignment_version: task.assignment_version || 0,
    },
  };
}

/**
 * Batch convert EnterpriseTask records to CalendarEvents.
 */
export function tasksToCalendarEvents(tasks) {
  return (tasks || []).map(taskToCalendarEvent).filter(e => e.startsAt);
}

/**
 * Filter tasks without scheduling dates (for Unscheduled Tasks panel).
 */
export function filterUnscheduledTasks(tasks) {
  return (tasks || []).filter(t => !hasScheduleDate(t));
}

/**
 * Provider definition for the registry.
 * Future providers will be added here with the same shape.
 */
export const ENTERPRISE_TASK_PROVIDER = {
  key: 'enterprise_task',
  label: 'Tasks',
  toEvents: tasksToCalendarEvents,
  toUnscheduled: filterUnscheduledTasks,
  openEventRoute: (event) => `/tasks/detail/${event.sourceRecordId}`,
};

/**
 * Convert an Appointment record (ServiceTitan-synced) to a CalendarEvent.
 *
 * Appointments are CRM-controlled — they display in the calendar but
 * are not draggable or reschedulable from the LVC calendar.
 */
export function appointmentToCalendarEvent(appt) {
  const startsAt = appt.scheduled_start || null;
  const endsAt = appt.scheduled_end || null;
  const isAllDay = false;

  const title = appt.customer_name
    ? `${appt.customer_name} — ${appt.appointment_type || 'Appointment'}`
    : appt.appointment_type || 'ServiceTitan Appointment';

  const assigneeName = appt.technician_name || '';

  const status = appt.is_canceled
    ? 'Canceled'
    : (appt.status ? appt.status.charAt(0).toUpperCase() + appt.status.slice(1) : 'Scheduled');

  return {
    id: 'appointment:' + appt.id,
    providerKey: 'appointment',
    sourceRecordId: appt.id,
    title,
    displayNumber: appt.servicetitan_appointment_id || appt.crm_appointment_id || appt.id,
    startsAt,
    endsAt,
    isAllDay,
    priority: 'Medium',
    status,
    department: '',
    assigneeName,
    assigneeId: appt.technician_id || '',
    assigneeEmployeeId: '',
    taskType: appt.appointment_type || '',
    workCategory: '',
    isOverdue: false,
    isInterrupted: false,
    resumeRequired: false,
    acknowledgmentStatus: 'none',
    workSessionStatus: '',
    relatedJob: appt.servicetitan_job_number || appt.crm_job_number || '',
    relatedCustomer: appt.customer_name || '',
    metadata: {
      schedule_status: appt.is_canceled ? 'cancelled' : 'scheduled',
      schedule_timezone: DEFAULT_TIMEZONE,
      servicetitan_appointment_id: appt.servicetitan_appointment_id || appt.crm_appointment_id || '',
      servicetitan_job_number: appt.servicetitan_job_number || appt.crm_job_number || '',
      is_servicetitan: true,
      address: appt.address || '',
      technician_mapping_status: appt.technician_mapping_status || '',
    },
  };
}

/**
 * Appointment provider — renders ServiceTitan-synced appointments
 * in the LVC calendar alongside EnterpriseTask records.
 */
export const APPOINTMENT_PROVIDER = {
  key: 'appointment',
  label: 'Appointments',
  toEvents: (appts) => (appts || []).map(appointmentToCalendarEvent).filter(e => e.startsAt),
  toUnscheduled: () => [],
  openEventRoute: () => null,
};

/**
 * All active providers. Events from all providers are merged into
 * a single calendar timeline.
 */
export const ACTIVE_PROVIDERS = [ENTERPRISE_TASK_PROVIDER, APPOINTMENT_PROVIDER];