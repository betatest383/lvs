import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  MessageCircle,
  XCircle,
  LifeBuoy,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const UNABLE_TO_START_CATEGORIES = [
  'Currently performing higher-priority work',
  'Current work cannot be interrupted',
  'Missing information',
  'Missing materials or equipment',
  'Missing access or permission',
  'Missing training, certification, or qualification',
  'Safety concern',
  'Scheduling conflict',
  'Physical or operational limitation',
  'Other',
];

const MANAGER_HELP_CATEGORIES = [
  'Need decision',
  'Need approval',
  'Need materials',
  'Need equipment',
  'Need another employee',
  'Need technical guidance',
  'Need customer or job information',
  'Need schedule adjustment',
  'Safety concern',
  'Other',
];

const RESPONSE_OPTIONS = [
  {
    key: 'start_now',
    label: 'Start Now',
    description: 'Acknowledge and begin working on this task immediately',
    icon: Play,
    color: 'text-blue-600',
    bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
  },
  {
    key: 'request_clarification',
    label: 'Request Clarification',
    description: 'Ask the assigner or manager for more information',
    icon: MessageCircle,
    color: 'text-orange-600',
    bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
  },
  {
    key: 'unable_to_start',
    label: 'Unable to Start',
    description: 'Report that you cannot start this task with a reason',
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 hover:bg-red-100 border-red-200',
  },
  {
    key: 'manager_assistance_requested',
    label: 'Request Manager Help',
    description: 'Request assistance from your manager',
    icon: LifeBuoy,
    color: 'text-purple-600',
    bg: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
  },
];

/**
 * TaskResponseDialog — Phase 3B employee response menu.
 *
 * Provides four secondary responses beyond the primary Acknowledge button:
 *   - Start Now (creates a WorkSession, may interrupt current work)
 *   - Request Clarification (requires a message, creates manager follow-up)
 *   - Unable to Start (requires category + explanation, creates manager follow-up)
 *   - Request Manager Help (requires category + explanation, creates manager follow-up)
 *
 * The dialog is non-dismissible from backdrop click or Escape — the employee
 * must explicitly choose a response or cancel. A processing state prevents
 * double-submission. Errors are shown inline with a retry option.
 */
export default function TaskResponseDialog({
  open,
  onClose,
  alert,
  onNavigateToTask,
}) {
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const reset = () => {
    setSelectedResponse(null);
    setCategory('');
    setReason('');
    setError(null);
    setConflict(null);
  };

  const handleClose = () => {
    if (submitting) return; // Prevent closing during submission
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!alert || submitting) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);

    try {
      // ── Start Now uses the canonical start_assigned_task action ──
      if (selectedResponse === 'start_now') {
        const startResponse = await base44.functions.invoke('manageTask', {
          action: 'start_assigned_task',
          taskId: alert.taskId,
          expectedAssignmentVersion: alert.assignmentVersion || alert.assignment_version || 0,
          sourceContext: 'task_alert_banner',
          notificationId: alert.id,
        });

        if (!startResponse.data?.success) {
          if (startResponse.data?.start_conflict) {
            setConflict(startResponse.data.start_conflict);
            setSubmitting(false);
            return;
          }
          const errMsg = startResponse.data?.error || 'Failed to start task';
          setError(errMsg);
          setSubmitting(false);
          return;
        }

        toast.success('Task started — work session created');
        if (onNavigateToTask) {
          const route = startResponse.data.navigation?.execution_route
            || startResponse.data.task?.execution_route
            || startResponse.data.task?.related_route;
          if (route) {
            onNavigateToTask(route);
          } else if (alert.taskId) {
            onNavigateToTask(`/tasks/detail/${alert.taskId}`);
          }
        }
        reset();
        onClose();
        return;
      }

      // ── Other responses use manageNotification acknowledge ──
      const payload = {
        action: 'acknowledge',
        notificationId: alert.id,
        response: selectedResponse,
      };

      if (selectedResponse === 'request_clarification') {
        payload.responseReason = reason.trim();
      } else if (selectedResponse === 'unable_to_start' || selectedResponse === 'manager_assistance_requested') {
        payload.responseCategory = category;
        payload.responseReason = reason.trim();
      }

      const response = await base44.functions.invoke('manageNotification', payload);

      if (!response.data?.success) {
        const errMsg = response.data?.error || 'Failed to submit response';
        setError(errMsg);
        setSubmitting(false);
        return;
      }

      // Success
      const successMessages = {
        request_clarification: 'Clarification request sent to manager',
        unable_to_start: 'Unable to start report sent to manager',
        manager_assistance_requested: 'Manager help request sent',
      };
      toast.success(successMessages[selectedResponse] || 'Response submitted');

      reset();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to submit response';
      setError(msg);
      setSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (!selectedResponse) return false;
    if (selectedResponse === 'start_now') return true;
    if (selectedResponse === 'request_clarification') {
      return reason.trim().replace(/\s+/g, '').length >= 5;
    }
    if (selectedResponse === 'unable_to_start' || selectedResponse === 'manager_assistance_requested') {
      return !!category && reason.trim().replace(/\s+/g, '').length >= 5;
    }
    return false;
  };

  const isSafety = category === 'Safety concern';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedResponse ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { if (!submitting) { setSelectedResponse(null); setCategory(''); setReason(''); setError(null); setConflict(null); } }}
                  disabled={submitting}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                {RESPONSE_OPTIONS.find((r) => r.key === selectedResponse)?.label}
              </>
            ) : (
              'More Responses'
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Conflict state (non-interruptible work) */}
        {conflict && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-900">{conflict.message}</p>
                {conflict.current_session && (
                  <p className="text-red-700 mt-1">
                    Current work: {conflict.current_session.task_title} ({conflict.current_session.task_number})
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You can still Acknowledge, Request Clarification, Unable to Start, or Request Manager Help.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setConflict(null); setSelectedResponse(null); }}
            >
              Choose Another Response
            </Button>
          </div>
        )}

        {/* Response selection */}
        {!conflict && !selectedResponse && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Choose how you'd like to respond to{' '}
              <span className="font-medium text-foreground">{alert?.taskNumber || 'this task'}</span>:
            </p>
            {RESPONSE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setSelectedResponse(opt.key); setError(null); }}
                  disabled={submitting}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${opt.bg} disabled:opacity-50`}
                >
                  <Icon className={`w-5 h-5 ${opt.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Start Now confirmation */}
        {!conflict && selectedResponse === 'start_now' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
              <p className="font-medium text-blue-900">Start Working Now</p>
              <p className="text-blue-700 mt-1">
                This will create a work session and transition the task to In Progress.
                {alert?.priority === 'Critical' && ' As a critical task, this may interrupt lower-priority work.'}
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Request Clarification form */}
        {!conflict && selectedResponse === 'request_clarification' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="clarification-message">Clarification Message *</Label>
              <Textarea
                id="clarification-message"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what you need clarified..."
                rows={4}
                disabled={submitting}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 5 characters. This will be sent to your manager.
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Unable to Start form */}
        {!conflict && selectedResponse === 'unable_to_start' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="uts-category">Reason Category *</Label>
              <Select value={category} onValueChange={setCategory} disabled={submitting}>
                <SelectTrigger id="uts-category" className="mt-1">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {UNABLE_TO_START_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSafety && (
              <div className="p-2 rounded-lg bg-red-100 border border-red-300 text-xs text-red-800 flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" /> Safety concern — this will be escalated as Critical priority.
              </div>
            )}
            <div>
              <Label htmlFor="uts-explanation">Explanation *</Label>
              <Textarea
                id="uts-explanation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why you are unable to start..."
                rows={4}
                disabled={submitting}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum 5 characters.</p>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Request Manager Help form */}
        {!conflict && selectedResponse === 'manager_assistance_requested' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="mh-category">Help Category *</Label>
              <Select value={category} onValueChange={setCategory} disabled={submitting}>
                <SelectTrigger id="mh-category" className="mt-1">
                  <SelectValue placeholder="Select what you need..." />
                </SelectTrigger>
                <SelectContent>
                  {MANAGER_HELP_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSafety && (
              <div className="p-2 rounded-lg bg-red-100 border border-red-300 text-xs text-red-800 flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" /> Safety concern — this will be escalated as Critical priority.
              </div>
            )}
            <div>
              <Label htmlFor="mh-explanation">Explanation *</Label>
              <Textarea
                id="mh-explanation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what you need help with..."
                rows={4}
                disabled={submitting}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum 5 characters.</p>
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!conflict && selectedResponse && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!canSubmit() || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}