/**
 * Singleton store for real-time task delivery in the Task Center.
 *
 * Holds the current "my tasks" list (single source of truth for all
 * useMyTasks consumers) plus the set of unviewed newly-assigned task IDs
 * that drive the nav badge. Producers (useTaskRealtime engine, and the
 * useMyTasks fallback when the engine isn't mounted) push updates;
 * consumers (MyTasks page, nav badge, TaskDetail) subscribe.
 *
 * Dedupe contract: once a task ID enters knownTaskIds it will never produce
 * a duplicate alert — setMyTasks only returns genuinely-new assignments.
 */

let state = {
  myTasks: [],
  newTaskIds: new Set(),
  knownTaskIds: new Set(),
  initialized: false,
  status: 'idle', // 'idle' | 'loading' | 'ready'
  error: null,
  refreshEpoch: 0,
  debug: {
    lastPollTime: null,
    lastPollEmail: null,
    lastResponseOk: null,
    lastReturnedCount: 0,
    lastStoreCount: 0,
    lastError: null,
    lastPollIsInitial: null,
  },
};

const listeners = new Set();

// Cached snapshot — MUST be a stable reference. useSyncExternalStore calls
// getSnapshot() on every render and bails out early if the returned value
// is referentially equal to the previous one. Returning a fresh object every
// time causes an infinite render loop ("Maximum update depth exceeded").
let cachedSnapshot = null;

function buildSnapshot() {
  return {
    myTasks: state.myTasks,
    newTaskIds: state.newTaskIds,
    knownTaskIds: state.knownTaskIds,
    initialized: state.initialized,
    status: state.status,
    error: state.error,
    refreshEpoch: state.refreshEpoch,
    badgeCount: state.newTaskIds.size,
    debug: state.debug,
  };
}

function emit() {
  cachedSnapshot = buildSnapshot();
  listeners.forEach((fn) => fn(cachedSnapshot));
}

export function getSnapshot() {
  if (!cachedSnapshot) {
    cachedSnapshot = buildSnapshot();
  }
  return cachedSnapshot;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setStatus(status, error = null) {
  state = { ...state, status, error };
  emit();
}

export function setDebugInfo(partial) {
  state = { ...state, debug: { ...state.debug, ...partial } };
  emit();
}

/**
 * Push a freshly-fetched my-tasks list into the store.
 * @param {Array} tasks
 * @param {Object} opts - { isInitial }
 * @returns {Array} genuinely-new task objects (assigned to me, not previously
 *   known, not completed/cancelled) — callers use this to fire toasts.
 */
export function setMyTasks(tasks, opts = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const ids = list.map((t) => t.id).filter(Boolean);
  if (!state.initialized || opts.isInitial) {
    // Seed — no toasts, no badge.
    state = {
      ...state,
      myTasks: list,
      knownTaskIds: new Set(ids),
      newTaskIds: new Set(),
      initialized: true,
      status: 'ready',
      error: null,
      refreshEpoch: state.refreshEpoch + 1,
    };
    emit();
    return [];
  }

  const fresh = list.filter(
    (t) =>
      t.id &&
      !state.knownTaskIds.has(t.id) &&
      t.status !== 'Completed' &&
      t.status !== 'Cancelled' &&
      t.status !== 'Canceled'
  );

  state = {
    ...state,
    myTasks: list,
    knownTaskIds: new Set([...state.knownTaskIds, ...ids]),
    status: 'ready',
    error: null,
    refreshEpoch: state.refreshEpoch + 1,
  };

  if (fresh.length) {
    state.newTaskIds = new Set([...state.newTaskIds, ...fresh.map((t) => t.id)]);
  }
  emit();
  return fresh;
}

export function clearBadge() {
  if (state.newTaskIds.size === 0) return;
  state = { ...state, newTaskIds: new Set() };
  emit();
}

export function clearTask(taskId) {
  if (!taskId || !state.newTaskIds.has(taskId)) return;
  const next = new Set(state.newTaskIds);
  next.delete(taskId);
  state = { ...state, newTaskIds: next };
  emit();
}

export function reset() {
  state = {
    myTasks: [],
    newTaskIds: new Set(),
    knownTaskIds: new Set(),
    initialized: false,
    status: 'idle',
    error: null,
    refreshEpoch: 0,
    debug: state.debug,
  };
  emit();
}

// Expose a live debug inspector for the browser console.
if (typeof window !== 'undefined') {
  window.__taskStore = {
    inspect: () => {
      const s = getSnapshot();
      return {
        ...s,
        newTaskIds: [...s.newTaskIds],
        knownTaskIds: [...s.knownTaskIds],
        myTaskNumbers: s.myTasks.map((t) => t.task_number),
      };
    },
    clearBadge,
    reset,
  };
}