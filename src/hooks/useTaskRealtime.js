import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { reconcileAlerts } from '@/lib/taskAlertStore';
import {
  setMyTasks,
  setStatus,
  setDebugInfo,
  getSnapshot,
  reset,
} from '@/lib/taskRealtimeStore';
import { playTaskChime } from '@/lib/taskSound';

const POLL_INTERVAL_MS = 15000;
const DEBOUNCE_MS = 500;

/**
 * Real-time task delivery engine — Phase 3A.
 *
 * Mounted globally in AppLayout so it runs on every authenticated page.
 *
 *  1. Seeds the task store with the current user's assigned tasks (for MyTasks).
 *  2. Fetches actionable notifications (requires_acknowledgment, not yet
 *     acknowledged/resolved/cancelled) via manageNotification and reconciles
 *     the alert store — this is the authoritative source for the banner,
 *     badge, and chime.
 *  3. Polls every 15s as a reliable baseline.
 *  4. Plays the chime only when genuinely-new actionable notifications appear.
 *  5. Re-fetches when the tab becomes visible again.
 *
 * Returns null — it is a side-effect-only hook.
 */
export function useTaskRealtime() {
  const { user, identityResolved } = useAuth();
  const inFlight = useRef(false);
  const debounceTimer = useRef(null);
  const pollTimer = useRef(null);
  const prevActionableIds = useRef(new Set());

  useEffect(() => {
    if (!identityResolved || !user) return;
    let cancelled = false;

    const fetchMyTasks = async (isInitial = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (isInitial) setStatus('loading');
      try {
        // ── Fetch my tasks (for MyTasks page) ──
        const taskResponse = await base44.functions.invoke('manageTask', {
          action: 'list',
          listScope: 'my_tasks',
          filters: {},
        });
        if (cancelled) return;
        const ok = !!taskResponse.data?.success;
        const tasks = ok ? taskResponse.data.tasks || [] : [];
        const fresh = setMyTasks(tasks, { isInitial });

        // ── Fetch actionable notifications (authoritative alert source) ──
        const notifResponse = await base44.functions.invoke('manageNotification', {
          action: 'list',
          listScope: 'actionable',
          filters: {},
        });
        if (cancelled) return;
        const actionable = notifResponse.data?.success ? notifResponse.data.notifications || [] : [];

        // Reconcile the alert store with server state
        const newIds = reconcileAlerts(actionable);

        setDebugInfo({
          lastPollTime: new Date().toISOString(),
          lastPollEmail: user.email,
          lastResponseOk: ok,
          lastReturnedCount: tasks.length,
          lastStoreCount: getSnapshot().myTasks.length,
          lastError: ok ? null : (taskResponse.data?.error || 'Response not success'),
          lastPollIsInitial: isInitial,
          lastActionableCount: actionable.length,
          lastNewAlertCount: newIds.length,
        });

        // Play chime only for genuinely-new actionable notifications
        if (newIds.length > 0 && !isInitial) {
          playTaskChime();
        }
        prevActionableIds.current = new Set(actionable.map((n) => n.id));
      } catch (err) {
        if (!cancelled) {
          setStatus('ready', err?.message || 'Fetch failed');
          setDebugInfo({
            lastPollTime: new Date().toISOString(),
            lastPollEmail: user.email,
            lastResponseOk: false,
            lastReturnedCount: 0,
            lastStoreCount: getSnapshot().myTasks.length,
            lastError: err?.message || `HTTP ${err?.response?.status || '?'}`,
            lastPollIsInitial: isInitial,
          });
        }
      } finally {
        inFlight.current = false;
      }
    };

    const debouncedFetch = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchMyTasks(false), DEBOUNCE_MS);
    };

    // 1. Initial seed (no toasts).
    fetchMyTasks(true);

    // 2. Realtime subscription — enhancement; polling is the reliable fallback.
    let unsubscribe = null;
    try {
      unsubscribe = base44.entities.EnterpriseTask.subscribe((event) => {
        if (!event) return;
        if (event.type === 'create' || event.type === 'update') {
          debouncedFetch();
        }
      });
    } catch {
      unsubscribe = null;
    }

    // 3. Reliable polling fallback (every 15s).
    pollTimer.current = setInterval(() => fetchMyTasks(false), POLL_INTERVAL_MS);

    // 5. Re-fetch on tab focus to catch changes while away.
    const onVisibility = () => {
      if (!document.hidden) fetchMyTasks(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (unsubscribe) {
        try { unsubscribe(); } catch { /* noop */ }
      }
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      document.removeEventListener('visibilitychange', onVisibility);
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityResolved, user]);

  return null;
}