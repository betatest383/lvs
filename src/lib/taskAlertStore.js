/**
 * Persistent task alert queue — Phase 3A server-backed.
 *
 * The queue is now reconciled with authoritative EnterpriseNotification
 * state from the server. localStorage remains a performance cache for
 * acknowledged notification IDs, but it is NOT authoritative — the
 * server's notification status (Acknowledged/Resolved/Cancelled) is.
 *
 * Priority ordering: Critical > High > Medium > Low.
 * Within the same priority, oldest sent_date first.
 */
import { clearTask } from './taskRealtimeStore';

const ACK_STORAGE_KEY = 'lvc_acknowledged_task_alerts_v2';
const listeners = new Set();

let acknowledgedIds = loadAcknowledged();
let queue = [];
// Cached snapshot — MUST be a stable reference. useSyncExternalStore calls
// getSnapshot() on every render and bails out early if the returned value
// is referentially equal to the previous one.
let cachedSnapshot = { currentAlert: null, queueLength: 0, badgeCount: 0 };

function loadAcknowledged() {
  try {
    const raw = localStorage.getItem(ACK_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistAcknowledged() {
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...acknowledgedIds]));
  } catch {
    /* storage unavailable */
  }
}

function rebuildSnapshot() {
  cachedSnapshot = {
    currentAlert: queue[0] || null,
    queueLength: queue.length,
    badgeCount: queue.length,
  };
}

function emit() {
  rebuildSnapshot();
  listeners.forEach((fn) => fn(cachedSnapshot));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  return cachedSnapshot;
}

/**
 * Priority rank: lower number = higher priority.
 */
function priorityRank(priority) {
  switch (priority) {
    case 'Critical': return 0;
    case 'High': return 1;
    case 'Medium': return 2;
    case 'Low': return 3;
    default: return 2;
  }
}

/**
 * Sort the queue by priority (Critical first), then by sent_date (oldest first).
 */
function sortQueue() {
  queue.sort((a, b) => {
    const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (rankDiff !== 0) return rankDiff;
    const aDate = a.sent_date || a.created_date || '';
    const bDate = b.sent_date || b.created_date || '';
    return aDate.localeCompare(bDate);
  });
}

/**
 * Reconcile the queue with authoritative server notification records.
 * Called by useTaskRealtime after fetching actionable notifications.
 *
 * - Adds new actionable notifications not already in the queue
 * - Removes notifications no longer actionable (acknowledged/resolved/cancelled
 *   server-side, or no longer in the server response)
 * - Preserves queue order via re-sort
 * - localStorage cache is reconciled: any acknowledged ID still in the
 *   server's actionable set is removed from localStorage (server is authoritative)
 *
 * @param {Array} actionableNotifications — EnterpriseNotification records from server
 * @returns {Array} genuinely-new notification IDs (for chime triggering)
 */
export function reconcileAlerts(actionableNotifications) {
  const serverIds = new Set((actionableNotifications || []).map((n) => n.id));
  const serverMap = {};
  (actionableNotifications || []).forEach((n) => { serverMap[n.id] = n; });

  // Remove queued alerts that are no longer actionable on the server
  queue = queue.filter((alert) => {
    if (!serverIds.has(alert.id)) {
      // No longer in actionable set — remove from queue
      return false;
    }
    return true;
  });

  // Add new actionable notifications not already in the queue
  const newIds = [];
  for (const n of actionableNotifications || []) {
    if (!queue.some((q) => q.id === n.id)) {
      queue.push(mapNotificationToAlert(n));
      newIds.push(n.id);
    }
  }

  sortQueue();
  emit();
  return newIds;
}

/**
 * Map an EnterpriseNotification record to the alert shape used by the banner.
 */
function mapNotificationToAlert(n) {
  return {
    id: n.id,
    notificationId: n.notification_id,
    taskId: n.related_task || null,
    taskNumber: n.related_task_number || n.notification_id,
    title: n.related_task_title || n.title,
    description: n.message,
    priority: n.related_task_priority || n.priority || 'Medium',
    assignmentVersion: n.assignment_version || 0,
    requiresAcknowledgment: n.requires_acknowledgment || false,
    sentDate: n.sent_date || n.created_date || null,
    isResumeNotification: n.notification_purpose === 'task_resume_required',
    resumeCheckpointId: n.resume_checkpoint_id || null,
    resumeWorkSessionId: n.resume_work_session_id || null,
    resumeInterruptingTaskNumber: n.resume_interrupting_task_number || null,
  };
}

/**
 * Remove a specific alert from the queue after server-confirmed acknowledgment.
 * Does NOT touch localStorage — the server status is authoritative.
 * Also clears the badge entry for that task.
 */
export function removeAlert(notificationId) {
  const alert = queue.find((q) => q.id === notificationId);
  queue = queue.filter((q) => q.id !== notificationId);
  if (alert?.taskId) {
    clearTask(alert.taskId);
  }
  // Cache the acknowledgment in localStorage as a performance hint
  acknowledgedIds.add(notificationId);
  persistAcknowledged();
  emit();
}

/**
 * Legacy compat: dismissCurrentAlert is called by the banner after
 * server-confirmed acknowledgment success. Now delegates to removeAlert.
 * @param {'view' | 'acknowledge'} action
 */
export function dismissCurrentAlert(action) {
  const current = queue[0];
  if (!current) return;
  if (action === 'acknowledge') {
    removeAlert(current.id);
  } else if (action === 'view') {
    // View Task does NOT dismiss the alert — it stays in the queue.
    // The banner remains visible after navigation.
    // No-op intentionally.
  }
}

export function isAcknowledged(notificationId) {
  return acknowledgedIds.has(notificationId);
}

export function clearAcknowledgedCache() {
  acknowledgedIds = new Set();
  persistAcknowledged();
}

if (typeof window !== 'undefined') {
  window.__taskAlertStore = {
    inspect: () => ({
      queue: queue.map((a) => ({ id: a.id, taskId: a.taskId, taskNumber: a.taskNumber, priority: a.priority })),
      acknowledgedIds: [...acknowledgedIds],
      snapshot: cachedSnapshot,
    }),
  };
}