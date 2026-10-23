import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Clock, LifeBuoy, Loader2, AlertCircle, ArrowRight, ShieldAlert, X } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { removeAlert } from '@/lib/taskAlertStore';

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

/**
 * ResumeAlertBanner — Persistent banner for task_resume_required notifications.
 *
 * Shows when an interrupted task is ready to resume after the interrupting
 * task completed. Provides three actions:
 *   - Resume Work: calls resume_interrupted_work, navigates to restored route
 *   - Not Now: server-side snooze (30 min default)
 *   - Request Manager Help: creates a manager follow-up
 *
 * Handles conflict cases:
 *   - confirm_interrupt: lower-priority active work requires confirmation
 *   - non_interruptible_active / higher_priority_active: blocked
 */
export default function ResumeAlertBanner({ alert }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [showManagerHelp, setShowManagerHelp] = useState(false);
  const [helpCategory, setHelpCategory] = useState('');
  const [helpReason, setHelpReason] = useState('');

  const handleResumeWork = async (forceInterrupt = false) => {
    if (!alert || submitting) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'resume_interrupted_work',
        notificationId: alert.id,
        forceInterrupt,
      });
      if (response.data?.success) {
        removeAlert(alert.id);
        toast.success('Work resumed — progress restored');
        const route = response.data.checkpoint?.route;
        if (route) {
          navigate(route);
        } else if (alert.taskId) {
          navigate(`/tasks/detail/${alert.taskId}`);
        }
      } else if (response.data?.conflict) {
        setConflict(response.data.conflict);
        setSubmitting(false);
      } else {
        setError(response.data?.error || 'Failed to resume work');
        setSubmitting(false);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to resume';
      setError(msg);
      setSubmitting(false);
    }
  };

  const handleNotNow = async () => {
    if (!alert || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'resume_not_now',
        notificationId: alert.id,
      });
      if (response.data?.success) {
        removeAlert(alert.id);
        toast.success(`Snoozed for 30 minutes`, { description: 'The resume reminder will reappear after the snooze expires.' });
      } else {
        setError(response.data?.error || 'Failed to snooze');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err?.message || 'Failed to snooze');
      setSubmitting(false);
    }
  };

  const handleManagerHelp = async () => {
    if (!helpReason.trim() || helpReason.trim().replace(/\s+/g, '').length < 5) {
      toast.error('Please provide an explanation of at least 5 characters');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('manageNotification', {
        action: 'resume_request_manager_help',
        notificationId: alert.id,
        responseCategory: helpCategory || 'Need decision',
        responseReason: helpReason.trim(),
      });
      if (response.data?.success) {
        removeAlert(alert.id);
        toast.success('Manager help request sent');
        setShowManagerHelp(false);
        setHelpCategory('');
        setHelpReason('');
      } else {
        setError(response.data?.error || 'Failed to send help request');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err?.message || 'Failed to send help request');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {alert && (
        <>
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 60, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.92 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-xl px-0"
          >
            <div className="bg-card border-2 border-blue-500 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-start gap-4 p-5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                    Previous Work Ready to Resume
                  </p>
                  <h3 className="text-lg font-bold leading-snug mb-1 truncate">
                    {alert.taskNumber || 'Interrupted Task'}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {alert.description || alert.title}
                  </p>
                  {alert.resumeInterruptingTaskNumber && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Interrupted by: {alert.resumeInterruptingTaskNumber}
                    </p>
                  )}
                  {error && (
                    <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {error}
                    </p>
                  )}
                </div>
              </div>

              {/* Conflict state */}
              {conflict && (
                <div className="px-5 pb-3">
                  <div className={`p-3 rounded-lg border flex items-start gap-2 ${
                    conflict.type === 'confirm_interrupt'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <ShieldAlert className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      conflict.type === 'confirm_interrupt' ? 'text-amber-600' : 'text-red-600'
                    }`} />
                    <div className="text-sm">
                      <p className={`font-medium ${
                        conflict.type === 'confirm_interrupt' ? 'text-amber-900' : 'text-red-900'
                      }`}>{conflict.message}</p>
                      {conflict.current_session && (
                        <p className="text-muted-foreground mt-1">
                          Current work: {conflict.current_session.task_title} ({conflict.current_session.task_number})
                        </p>
                      )}
                    </div>
                  </div>
                  {conflict.type === 'confirm_interrupt' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setConflict(null)}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => handleResumeWork(true)}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        Pause & Resume
                      </Button>
                    </div>
                  )}
                  {conflict.type !== 'confirm_interrupt' && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => setConflict(null)}
                      disabled={submitting}
                    >
                      Close
                    </Button>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {!conflict && (
                <div className="flex gap-2 px-5 pb-5">
                  <Button
                    onClick={() => handleResumeWork(false)}
                    disabled={submitting}
                    className="flex-[1.5] bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4 mr-1" />
                    )}
                    Resume Work
                  </Button>
                  <Button
                    onClick={handleNotNow}
                    variant="outline"
                    disabled={submitting}
                    className="flex-1"
                  >
                    <Clock className="w-4 h-4 mr-1" />
                    Not Now
                  </Button>
                  <Button
                    onClick={() => setShowManagerHelp(true)}
                    variant="outline"
                    disabled={submitting}
                    className="flex-shrink-0"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Help</span>
                  </Button>
                </div>
              )}
            </div>
          </motion.div>

          {/* Manager Help Dialog */}
          <Dialog open={showManagerHelp} onOpenChange={(v) => !v && !submitting && setShowManagerHelp(false)}>
            <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Request Manager Help</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="resume-help-category">Help Category *</Label>
                  <Select value={helpCategory} onValueChange={setHelpCategory} disabled={submitting}>
                    <SelectTrigger id="resume-help-category" className="mt-1">
                      <SelectValue placeholder="Select what you need..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MANAGER_HELP_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="resume-help-reason">Explanation *</Label>
                  <Textarea
                    id="resume-help-reason"
                    value={helpReason}
                    onChange={(e) => setHelpReason(e.target.value)}
                    placeholder="Describe what you need help with regarding resuming this work..."
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
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowManagerHelp(false); setHelpCategory(''); setHelpReason(''); setError(null); }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleManagerHelp}
                    disabled={submitting || !helpReason.trim() || helpReason.trim().replace(/\s+/g, '').length < 5}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Send Request
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AnimatePresence>
  );
}