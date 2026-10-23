import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { isUnread, isCritical, requiresAction } from '@/lib/notificationConstants';

/**
 * Shared hook for fetching notifications visible to an employee.
 *
 * Phase 3A: Routes through manageNotification backend function instead of
 * direct client-side entity writes. Server-side visibility filtering,
 * identity resolution, and authorization.
 *
 * @param {object} employee - EmployeeRegistry record (kept for API compat)
 */
export function useMyNotifications(employee) {
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [acknowledgmentRequiredCount, setAcknowledgmentRequiredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await base44.functions.invoke('manageNotification', {
          action: 'list',
          listScope: 'mine',
          filters: {},
        });
        if (!mounted) return;
        if (response.data?.success) {
          const notifications = response.data.notifications || [];
          setFilteredNotifications(notifications);
          setNotificationCount(notifications.length);
          setUnreadCount(notifications.filter(isUnread).length);
          setCriticalCount(notifications.filter(isCritical).length);
          setAcknowledgmentRequiredCount(notifications.filter(requiresAction).length);
        } else {
          setError(response.data?.error || 'Failed to load notifications');
          setFilteredNotifications([]);
          setNotificationCount(0);
          setUnreadCount(0);
          setCriticalCount(0);
          setAcknowledgmentRequiredCount(0);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load notifications');
        setFilteredNotifications([]);
        setNotificationCount(0);
        setUnreadCount(0);
        setCriticalCount(0);
        setAcknowledgmentRequiredCount(0);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return { filteredNotifications, notificationCount, unreadCount, criticalCount, acknowledgmentRequiredCount, loading, error, refetch };
}