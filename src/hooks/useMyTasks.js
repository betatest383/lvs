import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';
import {
  getSnapshot,
  subscribe,
  setMyTasks,
  setStatus,
} from '@/lib/taskRealtimeStore';

/**
 * Shared hook for tasks assigned to the current user.
 *
 * Primary source of truth is the taskRealtimeStore, populated by the
 * useTaskRealtime engine mounted in EnterpriseTaskLayout (realtime
 * subscription + 15s polling). When that engine is NOT running (e.g. a
 * dashboard widget outside the Task Center), this hook falls back to a
 * one-time fetch and seeds the store itself.
 *
 * @param {object} employee - EmployeeRegistry record (kept for API compat)
 * @param {object} options - { includeCompleted: bool }
 * @returns { filteredTasks, taskCount, inclusionReasons, totalFetched, loading, error, refetch }
 */
export function useMyTasks(employee, options = {}) {
  const { includeCompleted = false } = options;

  // Re-render whenever the store emits (refreshEpoch bumps on every update).
  useSyncExternalStore(subscribe, () => getSnapshot().refreshEpoch);

  const snap = getSnapshot();

  // Fallback: store idle means the realtime engine isn't mounted (e.g. a
  // dashboard widget). Fetch once and seed the store.
  useEffect(() => {
    if (!employee) return;
    if (snap.status !== 'idle') return;
    let mounted = true;
    (async () => {
      setStatus('loading');
      try {
        const response = await base44.functions.invoke('manageTask', {
          action: 'list',
          listScope: 'my_tasks',
          filters: {},
        });
        if (!mounted) return;
        const tasks = response.data?.success ? response.data.tasks || [] : [];
        setMyTasks(tasks, { isInitial: true });
      } catch (err) {
        if (mounted) setStatus('ready', err?.message || 'Failed to load tasks');
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, snap.status]);

  const refetch = useCallback(async () => {
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'list',
        listScope: 'my_tasks',
        filters: {},
      });
      const tasks = response.data?.success ? response.data.tasks || [] : [];
      setMyTasks(tasks, { isInitial: !getSnapshot().initialized });
    } catch (err) {
      setStatus('ready', err?.message || 'Failed to load tasks');
    }
  }, []);

  let tasks = snap.myTasks || [];
  if (!includeCompleted) {
    tasks = tasks.filter(
      (t) =>
        t.status !== 'Completed' &&
        t.status !== 'Cancelled' &&
        t.status !== 'Canceled'
    );
  }
  const reasons = {};
  tasks.forEach((t) => {
    reasons[t.task_id || t.id] = 'manageTask_my_tasks';
  });

  return {
    filteredTasks: tasks,
    taskCount: tasks.length,
    inclusionReasons: reasons,
    totalFetched: tasks.length,
    loading: snap.status === 'loading' && tasks.length === 0,
    error: snap.error,
    refetch,
  };
}