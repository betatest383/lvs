import { useState } from 'react';
import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, ArrowRight, CheckCircle2, Loader2, AlertCircle, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { subscribe, getSnapshot, removeAlert } from '@/lib/taskAlertStore';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import TaskResponseDialog from '@/components/tasks/TaskResponseDialog';
import ResumeAlertBanner from '@/components/tasks/ResumeAlertBanner';

/**
 * Persistent, non-auto-dismissing new-task alert banner.
 * Rendered globally in AppLayout so it survives navigation.
 * Shows one alert at a time from the queue, ordered by priority then age.
 *
 * Phase 3A: Acknowledgment is server-backed via manageNotification.
 * - "View Task" opens Task Detail but does NOT dismiss the alert.
 * - "Acknowledge" calls the server, waits for success, then removes the alert.
 * - Backdrop click, Escape, and navigation do NOT dismiss the alert.
 * - A backend failure leaves the alert visible with a retryable error.
 */
export default function TaskAlertBanner() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const navigate = useNavigate();
  const alert = snap.currentAlert;
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);

  // Delegate to ResumeAlertBanner for resume notifications
  if (alert?.isResumeNotification) {
    return <ResumeAlertBanner alert={alert} />;
  }

  const handleView = () => {
    if (!alert) return;
    // View Task does NOT dismiss the alert or create a TaskAcknowledgment.
    // It simply navigates to Task Detail.
    if (alert.taskId) {
      navigate(`/tasks/detail/${alert.taskId}`);
    }
  };

  const handleAcknowledge = async () => {
    if (!alert || acknowledging) return;
    setAcknowledging(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'acknowledge',
        notificationId: alert.id,
        response: 'acknowledged',
      });
      if (response.data?.success) {
        // Only remove the alert after confirmed backend success
        removeAlert(alert.id);
        toast.success('Task acknowledged');
        // If the response was start_now, navigate to the task route
        if (response.data.work_session && response.data.task) {
          const route = response.data.task.execution_route || response.data.task.related_route;
          if (route) {
            navigate(route);
          } else {
            navigate(`/tasks/detail/${alert.taskId}`);
          }
        }
      } else {
        setError(response.data?.error || 'Failed to acknowledge');
        toast.error(response.data?.error || 'Failed to acknowledge task');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to acknowledge';
      setError(msg);
      toast.error(msg);
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          key={alert.id}
          initial={{ opacity: 0, y: 60, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.92 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-xl px-0"
        >
          <div className="bg-card border-2 border-accent rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                <Bell className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">
                  New Task Assigned
                </p>
                <h3 className="text-lg font-bold leading-snug mb-1 truncate">
                  {alert.taskNumber || 'New Task'}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {alert.title || alert.description || 'You have been assigned a new task.'}
                </p>
                {alert.priority && (
                  <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                    {alert.priority} Priority
                  </span>
                )}
                {error && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button
                onClick={handleView}
                variant="outline"
                className="flex-1"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                View
              </Button>
              <Button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="flex-[1.5] bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {acknowledging ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                )}
                Acknowledge
              </Button>
              <Button
                onClick={() => setResponseDialogOpen(true)}
                variant="outline"
                disabled={acknowledging}
                className="flex-shrink-0"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">More</span>
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {alert && (
        <TaskResponseDialog
          open={responseDialogOpen}
          onClose={() => setResponseDialogOpen(false)}
          alert={alert}
          onNavigateToTask={(route) => {
            setResponseDialogOpen(false);
            removeAlert(alert.id);
            navigate(route);
          }}
        />
      )}
    </AnimatePresence>
  );
}