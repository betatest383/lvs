import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle, Shield, MoreHorizontal, Play, MessageSquare, LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { removeAlert } from '@/lib/taskAlertStore';
import TaskResponseDialog from '@/components/tasks/TaskResponseDialog';

const STATUS_LABELS = {
  none: 'Not Required',
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  start_now: 'Started',
  request_clarification: 'Clarification Requested',
  unable_to_start: 'Unable to Start',
  manager_assistance_requested: 'Manager Help Requested',
  overdue: 'Overdue',
  escalated: 'Escalated',
};

const FOLLOWUP_LABELS = {
  none: 'No Follow-Up',
  pending: 'Awaiting Manager Response',
  responded: 'Manager Responded',
  closed: 'Follow-Up Closed',
};

const FOLLOWUP_COLORS = {
  none: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  responded: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

const STATUS_COLORS = {
  none: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  acknowledged: 'bg-green-100 text-green-700',
  start_now: 'bg-blue-100 text-blue-700',
  request_clarification: 'bg-orange-100 text-orange-700',
  unable_to_start: 'bg-red-100 text-red-700',
  manager_assistance_requested: 'bg-purple-100 text-purple-700',
  overdue: 'bg-red-200 text-red-800',
  escalated: 'bg-red-300 text-red-900',
};

/**
 * TaskAcknowledgmentSection — Phase 3A server-backed acknowledgment UI.
 *
 * Renders inside TaskDetail's right column. Displays:
 * - Whether acknowledgment is required
 * - Current acknowledgment status
 * - Current assignment version
 * - Assigned employee
 * - Response + timestamp + overdue flag
 * - Related notification link
 * - Historical acknowledgments from earlier assignment versions
 *
 * The Acknowledge Task button uses manageNotification which:
 * - Resolves identity server-side (never trusts caller)
 * - Prevents duplicate records via idempotency key
 * - Rejects stale assignment versions
 * - Updates EnterpriseTask.acknowledgment_status
 * - Updates EnterpriseNotification status
 * - Reconciles the alert banner + badge via removeAlert
 */
export default function TaskAcknowledgmentSection({ task, onRefresh }) {
  const [acknowledgments, setAcknowledgments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState(null);
  const [activeNotification, setActiveNotification] = useState(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);

  const loadAcknowledgments = useCallback(async () => {
    if (!task?.id) return;
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'get_acknowledgments',
        taskId: task.id,
      });
      if (response.data?.success) {
        setAcknowledgments(response.data.acknowledgments || []);
      }
    } catch {
      /* informational */
    } finally {
      setLoading(false);
    }
  }, [task?.id]);

  const loadActiveNotification = useCallback(async () => {
    if (!task?.id) return;
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'list',
        listScope: 'actionable',
        filters: {},
      });
      if (response.data?.success) {
        const notif = (response.data.notifications || []).find((n) => n.related_task === task.id);
        setActiveNotification(notif || null);
      }
    } catch {
      /* informational */
    }
  }, [task?.id]);

  useEffect(() => {
    setLoading(true);
    loadAcknowledgments();
    loadActiveNotification();
  }, [task?.id, task?.assignment_version, task?.acknowledgment_status, loadAcknowledgments, loadActiveNotification]);

  const requiresAck = (task?.requires_immediate_acknowledgment || task?.acknowledgment_status === 'pending') && task?.acknowledgment_status !== 'acknowledged';
  const currentStatus = task?.acknowledgment_status || 'none';
  const currentVersion = task?.assignment_version || 0;

  // Most recent acknowledgment for the current assignment version
  const currentAck = acknowledgments.find((a) => a.assignment_version === currentVersion) || null;
  // Historical acknowledgments from earlier versions
  const historicalAcks = acknowledgments.filter((a) => a.assignment_version !== currentVersion);

  const handleAcknowledge = async () => {
    if (acknowledging || !activeNotification) return;
    setAcknowledging(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'acknowledge',
        notificationId: activeNotification.id,
        response: 'acknowledged',
      });
      if (response.data?.success) {
        // Only update UI after confirmed backend success
        if (response.data.task) {
          // Parent will refresh task via onRefresh
        }
        // Reconcile alert banner + badge
        removeAlert(activeNotification.id);
        // Reload acknowledgment history
        await loadAcknowledgments();
        await loadActiveNotification();
        toast.success('Task acknowledged');
        if (onRefresh) onRefresh();
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" /> Acknowledgment
          </h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[currentStatus] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[currentStatus] || currentStatus}
          </span>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between py-1 border-b last:border-0">
            <span className="text-muted-foreground">Required</span>
            <span className="font-medium">{task?.requires_immediate_acknowledgment ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between py-1 border-b last:border-0">
            <span className="text-muted-foreground">Assignment Version</span>
            <span className="font-medium">{currentVersion}</span>
          </div>
          <div className="flex justify-between py-1 border-b last:border-0">
            <span className="text-muted-foreground">Assigned Employee</span>
            <span className="font-medium text-right truncate max-w-[60%]">{task?.assigned_to || '—'}</span>
          </div>
          {task?.acknowledgment_deadline_minutes && (
            <div className="flex justify-between py-1 border-b last:border-0">
              <span className="text-muted-foreground">Deadline</span>
              <span className="font-medium">{task.acknowledgment_deadline_minutes} min</span>
            </div>
          )}
        </div>

        {/* Current acknowledgment details */}
        {currentAck && (
          <div className="p-2 rounded bg-muted/30 text-xs space-y-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">{currentAck.response}</span>
              {currentAck.response_category && (
                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                  {currentAck.response_category}
                </span>
              )}
              {currentAck.was_overdue && (
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {new Date(currentAck.acknowledged_at).toLocaleString()}
              </span>
            </div>
            <div className="text-muted-foreground">
              By {currentAck.employee_name}
              {currentAck.response_reason ? ` — ${currentAck.response_reason}` : ''}
            </div>
            {currentAck.started_at && (
              <div className="text-muted-foreground flex items-center gap-1">
                <Play className="w-2.5 h-2.5" /> Started at {new Date(currentAck.started_at).toLocaleString()}
              </div>
            )}
            {currentAck.notification_id && (
              <div className="text-muted-foreground truncate">Notification: {currentAck.notification_id}</div>
            )}
          </div>
        )}

        {/* Manager follow-up status */}
        {task?.manager_followup_status && task.manager_followup_status !== 'none' && (
          <div className="p-2 rounded bg-muted/20 text-xs space-y-1 border-l-2 border-amber-400 pl-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Manager Follow-Up</span>
              <span className={`px-1.5 py-0.5 rounded font-medium ${FOLLOWUP_COLORS[task.manager_followup_status] || FOLLOWUP_COLORS.none}`}>
                {FOLLOWUP_LABELS[task.manager_followup_status] || task.manager_followup_status}
              </span>
            </div>
            {task.response_category && (
              <div className="text-muted-foreground">Category: {task.response_category}</div>
            )}
            {task.manager_response && (
              <div className="text-muted-foreground italic">"{task.manager_response}"</div>
            )}
          </div>
        )}

        {/* Acknowledge + More Responses buttons */}
        {requiresAck && activeNotification && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {acknowledging ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Acknowledge
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResponseDialogOpen(true)}
              disabled={acknowledging}
            >
              <MoreHorizontal className="w-3.5 h-3.5 mr-1" />
              More
            </Button>
          </div>
        )}
        {requiresAck && !activeNotification && (
          <p className="text-xs text-muted-foreground italic">No active notification found for this task.</p>
        )}

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </p>
        )}

        {/* Historical acknowledgments */}
        {loading ? (
          <div className="flex justify-center py-2"><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /></div>
        ) : historicalAcks.length > 0 ? (
          <div className="space-y-1 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prior Versions</p>
            {historicalAcks.map((ack) => (
              <div key={ack.id} className="p-2 rounded bg-muted/20 text-xs space-y-1">
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600">{ack.response}</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">v{ack.assignment_version}</span>
                  {ack.was_overdue && (
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground">{new Date(ack.acknowledged_at).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">
                  By {ack.employee_name}
                  {ack.response_reason ? ` — ${ack.response_reason}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !currentAck && <p className="text-xs text-muted-foreground italic pt-2 border-t">No acknowledgment history.</p>
        )}
      </CardContent>

      {activeNotification && (
        <TaskResponseDialog
          open={responseDialogOpen}
          onClose={() => setResponseDialogOpen(false)}
          alert={{
            id: activeNotification.id,
            taskId: task?.id,
            taskNumber: task?.task_number,
            title: task?.title,
            priority: task?.priority,
          }}
          onNavigateToTask={(route) => {
            setResponseDialogOpen(false);
            if (onRefresh) onRefresh();
            window.location.href = route;
          }}
        />
      )}
    </Card>
  );
}