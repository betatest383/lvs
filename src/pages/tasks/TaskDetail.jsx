import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Clock, User, Link2, MessageSquare, History,
  CheckCircle2, AlertTriangle, Paperclip, Play, Pause, Ban,
  Send, FileEdit, ThumbsUp, RotateCcw, GraduationCap,
  UserCog, Calendar, Flag, Copy, Archive as ArchiveIcon,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { approveWarehouseOpeningBalance } from '@/lib/warehouseSetupSession';
import {
  TASK_STATUS_COLORS, PRIORITY_COLORS, parseJSON, isOverdue,
} from '@/lib/enterpriseTaskConstants';
import { hasTaskPermission, VALID_TRANSITIONS, canEditTask, canArchiveTask, canManageTask, canTransitionTask } from '@/lib/taskPermissions';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import TaskActionsMenu from '@/components/tasks/TaskActionsMenu';
import OrchestrationPanel from '@/components/tasks/OrchestrationPanel';
import MatchToTemplateDialog from '@/components/tasks/MatchToTemplateDialog';
import TaskRelatedRecords from '@/components/tasks/TaskRelatedRecords';
import TaskAcknowledgmentSection from '@/components/tasks/TaskAcknowledgmentSection';
import TaskResumeHistorySection from '@/components/tasks/TaskResumeHistorySection';
import { useTaskRelatedNames } from '@/hooks/useTaskRelatedNames';
import { FileText, Settings, CheckSquare, Shield, Link2 as Link2Icon } from 'lucide-react';
import { WORK_CATEGORY_LABELS, INTERRUPTIBILITY_LABELS } from '@/lib/orchestrationConstants';

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useCurrentRole();
  const { effectiveEmail, employee: currentEmployee } = useEmployeeContext();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReason, setShowReason] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [relatedRouteAccess, setRelatedRouteAccess] = useState(null);
  const [linkedGuide, setLinkedGuide] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mgmtDialog, setMgmtDialog] = useState(null);
  const [matchTemplateOpen, setMatchTemplateOpen] = useState(false);
  const relatedNames = useTaskRelatedNames(task);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const timeoutMs = 12000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );

    try {
      const response = await Promise.race([
        base44.functions.invoke('manageTask', {
          action: 'get',
          taskId: id,
        }),
        timeoutPromise,
      ]);

      if (response.data?.success && response.data.task) {
        setTask(response.data.task);
        if (response.data.task?.id) {
          base44.functions.invoke('manageTraining', { action: 'find_by_task', taskId: response.data.task.id })
            .then(res => setLinkedGuide(res.data?.guide || null))
            .catch(() => setLinkedGuide(null));
        }
      } else if (response.data?.error) {
        setError(response.data.error);
        setTask(null);
      } else {
        setError('Unexpected response from server');
        setTask(null);
      }
    } catch (err) {
      if (err?.message === 'TIMEOUT') {
        setError('The task took too long to load.');
      } else {
        const msg = err.response?.data?.error || err.response?.data?.reason || 'Failed to load task';
        setError(msg);
        toast.error(msg);
      }
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    if (id) {
      (async () => {
        setLoading(true);
        setError(null);

        const timeoutMs = 12000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        );

        try {
          const response = await Promise.race([
            base44.functions.invoke('manageTask', { action: 'get', taskId: id }),
            timeoutPromise,
          ]);

          if (cancelled) return;

          if (response.data?.success && response.data.task) {
            setTask(response.data.task);
            if (response.data.task?.id) {
              base44.functions.invoke('manageTraining', { action: 'find_by_task', taskId: response.data.task.id })
                .then(res => { if (!cancelled) setLinkedGuide(res.data?.guide || null); })
                .catch(() => { if (!cancelled) setLinkedGuide(null); });
            }
          } else if (response.data?.error) {
            setError(response.data.error);
            setTask(null);
          } else {
            setError('Unexpected response from server');
            setTask(null);
          }
        } catch (err) {
          if (cancelled) return;
          if (err?.message === 'TIMEOUT') {
            setError('The task took too long to load.');
          } else {
            const msg = err.response?.data?.error || err.response?.data?.reason || 'Failed to load task';
            setError(msg);
          }
          setTask(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    } else {
      setTask(null);
      setError('No task ID provided.');
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (task?.related_route) {
      base44.functions.invoke('checkNavigationAccess', { route: task.related_route, action: 'view' })
        .then(res => setRelatedRouteAccess(res.data?.allowed === true))
        .catch(() => setRelatedRouteAccess(false));
    } else {
      setRelatedRouteAccess(null);
    }
  }, [task?.related_route]);

  const can = (action) => hasTaskPermission(role, action);
  const isPrivileged = role === 'admin' || role === 'owner';

  const callManageTask = async (payload, successMsg) => {
    try {
      const response = await base44.functions.invoke('manageTask', payload);
      if (response.data?.success) {
        if (successMsg) toast.success(successMsg);
        if (payload.action === 'comment') {
          setTask(prev => ({ ...prev, comments: JSON.stringify(response.data.comments) }));
        } else {
          load();
        }
        setReasonText('');
        setReviewNotes('');
        setShowReason(false);
        setPendingAction(null);
      } else {
        toast.error(response.data?.error || 'Operation failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleTransition = (newStatus, requiresReason = false) => {
    if (requiresReason && !reasonText.trim()) {
      setPendingAction({ newStatus, requiresReason: true });
      setShowReason(true);
      return;
    }
    callManageTask({
      action: 'transition',
      taskId: id,
      newStatus,
      reason: reasonText || undefined,
    }, 'Status updated to ' + newStatus);
  };

  const handleReview = (reviewAction) => {
    callManageTask({
      action: 'review',
      taskId: id,
      reviewAction,
      reason: reviewNotes || undefined,
    }, reviewAction === 'request_changes' ? 'Changes requested' : 'Review submitted');
  };

  const [canonicalApproving, setCanonicalApproving] = useState(false);
  const [starting, setStarting] = useState(false);

  // ── Canonical Start action — calls manageTask start_assigned_task ──
  // Every Start entry point must route through this function. It creates
  // a WorkSession, TaskAcknowledgment (start_now), and handles interruption.
  const handleStartTask = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'start_assigned_task',
        taskId: id,
        expectedAssignmentVersion: task.assignment_version,
        sourceContext: 'task_detail',
      });
      if (response.data?.success) {
        toast.success(response.data.idempotent ? 'Work session active' : 'Task started — work session created');
        load();
        const route = response.data.navigation?.execution_route;
        if (route) navigate(route);
      } else if (response.data?.start_conflict) {
        toast.error(response.data.start_conflict.message || 'Cannot start — current work is non-interruptible');
      } else {
        toast.error(response.data?.error || 'Failed to start task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start task');
    } finally {
      setStarting(false);
    }
  };

  const isWarehouseApprovalTask = task?.related_module === 'inventory_count_session' && task?.task_type === 'Approval';

  const handleApprove = async () => {
    // ─── Warehouse opening-balance approval: call canonical action ───
    if (isWarehouseApprovalTask) {
      setCanonicalApproving(true);
      try {
        const result = await approveWarehouseOpeningBalance(task.related_record_id, 'approve');
        if (result.success) {
          toast.success(result.already_approved ? 'Already approved — task reconciled' : 'Opening balance approved');
          load();
        } else {
          toast.error(result.error || 'Approval failed');
        }
      } catch (err) {
        toast.error(err.response?.data?.error || err.message || 'Approval failed');
      } finally {
        setCanonicalApproving(false);
      }
      return;
    }
    // ─── Standard task approval ───
    callManageTask({
      action: 'approve',
      taskId: id,
      reason: reviewNotes || undefined,
    }, 'Task approved');
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    await callManageTask({
      action: 'comment',
      taskId: id,
      commentText: newComment,
    }, 'Comment added');
    setNewComment('');
  };

  const handleEditSave = async (data) => {
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'edit',
        taskId: id,
        taskData: data,
      });
      if (response.data?.success) {
        toast.success('Task updated');
        setEditOpen(false);
        load();
      } else {
        toast.error(response.data?.error || 'Failed to update task');
      }
    } catch {
      toast.error('Failed to update task');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading task…</p>
      </div>
    );
  }
  if (error) {
    const isNotFound = String(error).toLowerCase().includes('not found') || String(error).toLowerCase().includes('no task id');
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">{isNotFound ? 'Task not found' : 'We couldn\'t load this task'}</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
        {!isNotFound && (
          <Button variant="default" size="sm" onClick={() => load()}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Try Again</Button>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate('/tasks/registry')}>Back to Enterprise Tasks</Button>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">Task not found</p>
        <p className="text-xs text-muted-foreground">This task may have been deleted or you may not have access.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/tasks/registry')}>Back to Enterprise Tasks</Button>
      </div>
    );
  }

  const editable = canEditTask(task);
  const manageable = canManageTask(task);
  const archivable = canArchiveTask(task);
  const editMode = (task.status === 'New' || task.status === 'Draft') ? 'full' : 'limited';
  const comments = parseJSON(task.comments, []);
  const statusHistory = parseJSON(task.status_history, []);
  const approvalHistory = parseJSON(task.approval_history, []);
  const overdue = isOverdue(task);
  const validNext = VALID_TRANSITIONS[task.status] || [];

  // ── Assignee-based execution authorization ──
  // Execution transitions (Start, Submit for Review, Complete) are authorized via
  // assignee ownership — the direct assignee can perform these without Edit Task
  // permission. Administrative transitions still require role permissions.
  const canStartResult = canTransitionTask(
    task, effectiveEmail, currentEmployee?.id, currentEmployee?.employee_id, role, 'In Progress'
  );
  const canSubmitResult = canTransitionTask(
    task, effectiveEmail, currentEmployee?.id, currentEmployee?.employee_id, role, 'Submitted for Review'
  );
  const canCompleteResult = canTransitionTask(
    task, effectiveEmail, currentEmployee?.id, currentEmployee?.employee_id, role, 'Completed'
  );
  // Created By: prefer requested-by employee, then created_by email → employee lookup,
  // else a neutral label. Never surface the raw service/system email.
  const createdByDisplay = relatedNames.requestedByEmployee || relatedNames.createdBy || { name: 'System' };

  const statusBadge = (s) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TASK_STATUS_COLORS[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks/registry')}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        {editable && can('edit') && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <FileEdit className="w-3.5 h-3.5 mr-1" /> Edit Task
          </Button>
        )}
      </div>

      {/* Header Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {task.task_number && <span className="font-mono text-xs text-muted-foreground">{task.task_number}</span>}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[task.priority] || ''}`}>{task.priority}</span>
            {statusBadge(task.status)}
            {task.task_type && <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{task.task_type}</span>}
            {overdue && <span className="px-2 py-0.5 rounded-full text-xs bg-red-200 text-red-800 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overdue</span>}
          </div>
          <h1 className="text-xl font-bold">{task.title}</h1>
          {task.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{task.description}</p>}
          {task.blocked_reason && <p className="text-sm text-red-600 mt-2">⚠ Blocked: {task.blocked_reason}</p>}
          {task.on_hold_reason && <p className="text-sm text-purple-600 mt-2">⏸ On Hold: {task.on_hold_reason}</p>}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Actions</h3>
          <div className="flex flex-wrap gap-2">
            {validNext.includes('In Progress') && canStartResult.allowed && (
              <Button size="sm" onClick={handleStartTask} disabled={starting}>
                {starting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />} Start
              </Button>
            )}
            {task.status === 'In Progress' && canStartResult.allowed && (
              <Button size="sm" onClick={handleStartTask} disabled={starting}>
                {starting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />} Continue
              </Button>
            )}
            {validNext.includes('Submitted for Review') && canSubmitResult.allowed && (
              <Button size="sm" onClick={() => handleTransition('Submitted for Review')}><Send className="w-3.5 h-3.5 mr-1" /> Submit for Review</Button>
            )}
            {validNext.includes('Blocked') && (
              <Button size="sm" variant="destructive" onClick={() => { setPendingAction({ newStatus: 'Blocked', requiresReason: true }); setShowReason(true); }}><Ban className="w-3.5 h-3.5 mr-1" /> Block</Button>
            )}
            {validNext.includes('On Hold') && (
              <Button size="sm" variant="outline" onClick={() => { setPendingAction({ newStatus: 'On Hold', requiresReason: true }); setShowReason(true); }}><Pause className="w-3.5 h-3.5 mr-1" /> Hold</Button>
            )}
            {validNext.includes('Canceled') && can('cancel') && (
              <Button size="sm" variant="outline" onClick={() => { setPendingAction({ newStatus: 'Canceled', requiresReason: true }); setShowReason(true); }}>Cancel</Button>
            )}
            {validNext.includes('Completed') && canCompleteResult.allowed && (
              <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => handleTransition('Completed')}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete</Button>
            )}
            {validNext.includes('Approved') && can('approve') && (
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleApprove} disabled={canonicalApproving}>
                {canonicalApproving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5 mr-1" />}
                {canonicalApproving ? 'Approving…' : 'Approve'}
              </Button>
            )}
            {isWarehouseApprovalTask && task.status === 'Awaiting Approval' && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/warehouse/setup/${task.related_record_id}?mode=approval`)}>
                <Link2 className="w-3.5 h-3.5 mr-1" /> Review & Approve
              </Button>
            )}
            {task.status === 'Submitted for Review' && can('review') && (
              <>
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleReview('approve_review')}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve Review</Button>
                <Button size="sm" variant="outline" onClick={() => handleReview('request_changes')}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Request Changes</Button>
              </>
            )}
            {isPrivileged && task.status === 'Completed' && (
              <Button size="sm" variant="outline" onClick={() => callManageTask({ action: 'reopen', taskId: id, reason: 'Reopened by Owner' }, 'Task reopened')}>Reopen</Button>
            )}
            {linkedGuide && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/lvcos/training/guide/${linkedGuide.id}?taskId=${task.id}`)}
              >
                <GraduationCap className="w-3.5 h-3.5 mr-1" />
                {linkedGuide.status === 'Published' ? 'Start Guided Training' : 'View Training Guide'}
              </Button>
            )}
          </div>

          {showReason && pendingAction && (
            <div className="space-y-2 mt-2 p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Reason for {pendingAction.newStatus}:</p>
              <Textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Enter reason..." rows={2} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleTransition(pendingAction.newStatus)} disabled={!reasonText.trim()}>Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowReason(false); setPendingAction(null); setReasonText(''); }}>Cancel</Button>
              </div>
            </div>
          )}

          {(can('review') || can('approve')) && task.status === 'Submitted for Review' && (
            <div className="space-y-2 mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm font-medium">Review Notes:</p>
              <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Add review notes..." rows={2} className="text-sm" />
            </div>
          )}

          {/* Management Actions */}
          {manageable && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {can('reassign') && (
                <Button size="sm" variant="outline" onClick={() => setMgmtDialog('reassign')}><UserCog className="w-3.5 h-3.5 mr-1" /> Reassign</Button>
              )}
              {can('change_due_date') && (
                <Button size="sm" variant="outline" onClick={() => setMgmtDialog('due_date')}><Calendar className="w-3.5 h-3.5 mr-1" /> Due Date</Button>
              )}
              {can('change_priority') && (
                <Button size="sm" variant="outline" onClick={() => setMgmtDialog('priority')}><Flag className="w-3.5 h-3.5 mr-1" /> Priority</Button>
              )}
              {can('duplicate') && (
                <Button size="sm" variant="outline" onClick={() => setMgmtDialog('duplicate')}><Copy className="w-3.5 h-3.5 mr-1" /> Duplicate</Button>
              )}
              {archivable && can('archive') && (
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => setMgmtDialog('archive')}><ArchiveIcon className="w-3.5 h-3.5 mr-1" /> Archive</Button>
              )}
              {can('edit') && !task.task_template_id && (
                <Button size="sm" variant="outline" onClick={() => setMatchTemplateOpen(true)}><FileText className="w-3.5 h-3.5 mr-1" /> Match to Template</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} initialData={task} onSave={handleEditSave} editMode={editMode} />

      {/* Management Dialogs */}
      <TaskActionsMenu task={task} onRefresh={load} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Comments */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-accent" /> Comments</h3>
              {comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : (
                <div className="space-y-2">
                  {comments.map((c, i) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/50">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{c.author}</span>
                        <span className="text-muted-foreground">{new Date(c.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." rows={2} className="text-sm" />
                <Button size="sm" onClick={handleComment} disabled={!newComment.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90 self-start">Post</Button>
              </div>
            </CardContent>
          </Card>

          {/* Audit Timeline */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><History className="w-4 h-4 text-accent" /> Audit Timeline</h3>
              <div className="space-y-2">
                {statusHistory.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {statusBadge(h.status)}
                    <span className="text-muted-foreground">by {h.changed_by}</span>
                    {h.notes && <span className="text-xs text-muted-foreground">— {h.notes}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                ))}
                {approvalHistory.map((a, i) => (
                  <div key={'a'+i} className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">{a.action}</span>
                    <span className="text-muted-foreground">by {a.approver}</span>
                    {a.notes && <span className="text-xs text-muted-foreground">— {a.notes}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                ))}
                {statusHistory.length === 0 && approvalHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground">No history recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><User className="w-4 h-4 text-accent" /> Assignment</h3>
              <div className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="text-muted-foreground">Assigned To</span>
                {relatedNames.assignedEmployee ? (
                  <Link to={relatedNames.assignedEmployee.route} className="font-medium text-accent hover:underline text-right truncate max-w-[60%]">{relatedNames.assignedEmployee.name}</Link>
                ) : (
                  <span className="font-medium text-right">{task.assigned_to || '—'}</span>
                )}
              </div>
              <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Role</span><span className="font-medium text-right">{task.assigned_role || '—'}</span></div>
              <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Department</span><span className="font-medium text-right">{task.department || task.assigned_department || '—'}</span></div>
              <div className="flex justify-between text-sm py-1 border-b last:border-0">
                <span className="text-muted-foreground">Created By</span>
                {createdByDisplay.route ? (
                  <Link to={createdByDisplay.route} className="font-medium text-accent hover:underline text-right truncate max-w-[60%]">{createdByDisplay.name}</Link>
                ) : (
                  <span className="font-medium text-right truncate max-w-[60%]">{createdByDisplay.name}</span>
                )}
              </div>
              <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Due Date</span><span className={`font-medium text-right ${overdue ? 'text-red-600' : ''}`}>{task.due_date || '—'}</span></div>
              {task.start_date && <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Started</span><span className="font-medium text-right">{task.start_date}</span></div>}
              {task.completed_at && <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Completed</span><span className="font-medium text-green-600 text-right">{new Date(task.completed_at).toLocaleDateString()}</span></div>}
            </CardContent>
          </Card>

          {task.starts_at && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-accent" /> Scheduling</h3>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Start</span><span className="font-medium text-right">{new Date(task.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                {task.ends_at && <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">End</span><span className="font-medium text-right">{new Date(task.ends_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>}
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">All Day</span><span className="font-medium text-right">{task.is_all_day ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Timezone</span><span className="font-medium text-right">{task.schedule_timezone || 'America/New_York'}</span></div>
                {task.schedule_status && <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Schedule Status</span><span className="font-medium text-right capitalize">{task.schedule_status}</span></div>}
              </CardContent>
            </Card>
          )}

          <TaskRelatedRecords task={task} />

          <TaskAcknowledgmentSection task={task} onRefresh={load} />

          <TaskResumeHistorySection taskId={task.id} />

          {task.task_template_id && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-accent" /> Template</h3>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Template</span><span className="font-medium text-right">{task.task_template_number || '—'}</span></div>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Version</span><span className="font-medium text-right">v{task.task_template_version || 1}</span></div>
                {task.template_override_history && (
                  <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Overrides</span><span className="font-medium text-right">{JSON.parse(task.template_override_history || '[]').length} field(s)</span></div>
                )}
                {task.template_override_reason && (
                  <p className="text-xs text-amber-600 mt-1">⚠ {task.template_override_reason}</p>
                )}
              </CardContent>
            </Card>
          )}

          {task.work_category && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Settings className="w-4 h-4 text-accent" /> Orchestration Config</h3>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Work Category</span><span className="font-medium text-right">{WORK_CATEGORY_LABELS[task.work_category] || task.work_category}</span></div>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Interruptibility</span><span className="font-medium text-right">{INTERRUPTIBILITY_LABELS[task.interruptibility] || task.interruptibility || '—'}</span></div>
                {task.priority_reason && <div className="text-xs text-muted-foreground py-1">Reason: {task.priority_reason}</div>}
                {task.requires_immediate_acknowledgment && <div className="text-xs text-amber-600 py-1">⚠ Immediate acknowledgment required ({task.acknowledgment_deadline_minutes || 15} min)</div>}
              </CardContent>
            </Card>
          )}

          {task.execution_mode && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Link2Icon className="w-4 h-4 text-accent" /> Execution Method</h3>
                <div className="flex justify-between text-sm py-1 border-b last:border-0"><span className="text-muted-foreground">Mode</span><span className="font-medium text-right capitalize">{task.execution_mode.replace(/_/g, ' ')}</span></div>
                {task.related_route && <div className="text-xs text-accent py-1">Route: {task.related_route}</div>}
                {task.workflow_type && <div className="text-xs text-muted-foreground py-1">Workflow: {task.workflow_type}</div>}
              </CardContent>
            </Card>
          )}

          {(task.require_completion_evidence || task.requires_notes || task.requires_signature || task.requires_manager_verification) && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><CheckSquare className="w-4 h-4 text-accent" /> Completion Requirements</h3>
                {task.require_completion_evidence && <div className="text-sm flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-600" /> Photo evidence required{task.minimum_photo_count ? ` (${task.minimum_photo_count} min)` : ''}</div>}
                {task.requires_notes && <div className="text-sm flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-600" /> Notes required</div>}
                {task.requires_signature && <div className="text-sm flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-600" /> Signature required</div>}
                {task.requires_manager_verification && <div className="text-sm flex items-center gap-2"><Shield className="w-3 h-3 text-green-600" /> Manager verification required</div>}
              </CardContent>
            </Card>
          )}

          <OrchestrationPanel taskId={task.id} />

          {task.related_module && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Link2 className="w-4 h-4 text-accent" /> Related Record</h3>
                <div className="text-sm font-medium">{task.related_module}</div>
                {relatedRouteAccess === true && task.related_route ? (
                  <Link to={task.related_route} className="text-sm text-accent hover:underline flex items-center gap-1">Open Related Record <ChevronRight className="w-3 h-3" /></Link>
                ) : relatedRouteAccess === false ? (
                  <p className="text-sm text-muted-foreground italic">You do not currently have access to open this record.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Checking access…</p>
                )}
              </CardContent>
            </Card>
          )}

          {task.attachments && task.attachments.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Paperclip className="w-4 h-4 text-accent" /> Attachments</h3>
                <div className="space-y-1">
                  {task.attachments.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline block truncate">{url.split('/').pop()}</a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {task.completion_evidence && task.completion_evidence.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-accent" /> Completion Evidence</h3>
                <div className="space-y-1">
                  {task.completion_evidence.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline block truncate">{url.split('/').pop()}</a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Match to Template Dialog */}
      <MatchToTemplateDialog
        open={matchTemplateOpen}
        onOpenChange={setMatchTemplateOpen}
        task={task}
        onMatched={load}
      />
    </div>
  );
}