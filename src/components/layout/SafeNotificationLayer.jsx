import React from 'react';
import { useTaskRealtime } from '@/hooks/useTaskRealtime';
import TaskAlertBanner from '@/components/tasks/TaskAlertBanner';

/**
 * SafeNotificationLayer — wraps the globally-mounted notification system
 * (useTaskRealtime hook + TaskAlertBanner) in an ErrorBoundary so that a
 * crash in the notification system can NEVER blank the entire application.
 *
 * If the notification system fails:
 * - The main application continues rendering normally.
 * - Navigation remains usable.
 * - The error is logged to the console for administrators.
 * - The banner simply doesn't render until the error clears.
 *
 * This component is rendered in AppLayout in place of the bare
 * `useTaskRealtime()` call and `<TaskAlertBanner />`.
 */
class NotificationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error('[SafeNotificationLayer] Notification system error (app continues):', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fail silently — the app continues without the notification banner.
      // The error is logged above for administrators.
      return null;
    }
    return this.props.children;
  }
}

/**
 * Inner component that calls the useTaskRealtime hook and renders the banner.
 * This must be a separate component so the ErrorBoundary can catch errors
 * thrown by the hook during render.
 */
function NotificationInner() {
  useTaskRealtime();
  return <TaskAlertBanner />;
}

export default function SafeNotificationLayer() {
  return (
    <NotificationErrorBoundary>
      <NotificationInner />
    </NotificationErrorBoundary>
  );
}