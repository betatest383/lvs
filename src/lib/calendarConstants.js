/**
 * LVC Work Calendar — constants and utilities.
 *
 * The calendar is a visual layer over EnterpriseTask (and future providers).
 * A calendar item is a representation of an underlying record, NOT a duplicate.
 */

// ─── Default LVC timezone ────────────────────────────────────────────────────
export const DEFAULT_TIMEZONE = 'America/New_York';

// ─── Calendar views ──────────────────────────────────────────────────────────
export const CALENDAR_VIEWS = ['day', 'week', 'month', 'agenda'];

export const VIEW_LABELS = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
};

// ─── Event provider registry (extensible for future modules) ──────────────────
export const CALENDAR_PROVIDERS = {
  ENTERPRISE_TASK: 'enterprise_task',
  APPOINTMENT: 'appointment',
  // WAREHOUSE_SESSION: 'warehouse_session',
  // EQUIPMENT_MAINTENANCE: 'equipment_maintenance',
  // PTO: 'pto',
  // TRAINING: 'training',
  // MEMBERSHIP_SCHEDULING: 'membership_scheduling',
  // MEETINGS: 'meetings',
  // FLEET_MAINTENANCE: 'fleet_maintenance',
  // AI_REMINDERS: 'ai_reminders',
};

// ─── Priority colors ─────────────────────────────────────────────────────────
// Each has bg (solid), light (subtle bg), text, border, and dot.
export const PRIORITY_STYLES = {
  Critical: { bg: 'bg-red-500', light: 'bg-red-50', text: 'text-red-700', border: 'border-red-400', dot: 'bg-red-500' },
  High: { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400', dot: 'bg-orange-500' },
  Medium: { bg: 'bg-amber-400', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-400' },
  Low: { bg: 'bg-blue-400', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-400' },
};

// ─── Status colors ───────────────────────────────────────────────────────────
export const STATUS_STYLES = {
  'Draft': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'Assigned': { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  'New': { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  'In Progress': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Blocked': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'On Hold': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Submitted for Review': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Changes Requested': { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Awaiting Approval': { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  'Approved': { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  'Completed': { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Canceled': { bg: 'bg-gray-100', text: 'text-gray-400', dot: 'bg-gray-300' },
  'Cancelled': { bg: 'bg-gray-100', text: 'text-gray-400', dot: 'bg-gray-300' },
  'Waiting': { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  'Overdue': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

// ─── Special calendar states ─────────────────────────────────────────────────
export const SPECIAL_STATES = {
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  AWAITING_REVIEW: 'Submitted for Review',
  INTERRUPTED: 'Interrupted',
  RESUME_REQUIRED: 'Resume Required',
};

// ─── Calendar filter scopes ──────────────────────────────────────────────────
export const CALENDAR_SCOPES = {
  MY: 'my',
  EMPLOYEE: 'employee',
  DEPARTMENT: 'department',
  COMPANY: 'company',
};

// ─── Notification purposes for scheduling ────────────────────────────────────
export const SCHEDULE_NOTIFICATION_PURPOSES = {
  SCHEDULED: 'task_scheduled',
  RESCHEDULED: 'task_rescheduled',
  CHANGED: 'task_schedule_changed',
};

// ─── Work hours (LVC standard) ───────────────────────────────────────────────
export const WORK_HOURS = { start: 7, end: 18 }; // 7am–6pm ET

// ─── Calendar event shape documentation ──────────────────────────────────────
/**
 * @typedef {Object} CalendarEvent
 * @property {string} id — Unique event ID (provider_key + ':' + source_record_id)
 * @property {string} providerKey — 'enterprise_task' (future: 'appointment', etc.)
 * @property {string} sourceRecordId — Entity ID in the source module
 * @property {string} title
 * @property {string} displayNumber — task_number (canonical display identifier)
 * @property {string|null} startsAt — ISO timestamp
 * @property {string|null} endsAt — ISO timestamp
 * @property {boolean} isAllDay
 * @property {string} priority — Critical/High/Medium/Low
 * @property {string} status — EnterpriseTask status
 * @property {string} department
 * @property {string} assigneeName
 * @property {string} assigneeId
 * @property {string} assigneeEmployeeId — EMP-xxx for display
 * @property {string} taskType
 * @property {string} workCategory
 * @property {boolean} isOverdue
 * @property {boolean} isInterrupted
 * @property {boolean} resumeRequired
 * @property {string} acknowledgmentStatus
 * @property {string} workSessionStatus — active/interrupted/paused/null
 * @property {string} relatedJob
 * @property {string} relatedCustomer
 * @property {object} metadata — Provider-specific data
 */