import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot } from '@/lib/taskAlertStore';

/**
 * Returns the number of active task notifications requiring action by the
 * authenticated employee. Server-backed: the alert store is reconciled with
 * authoritative EnterpriseNotification state on every poll.
 */
export function useTaskBadge() {
  return useSyncExternalStore(subscribe, () => getSnapshot().badgeCount);
}