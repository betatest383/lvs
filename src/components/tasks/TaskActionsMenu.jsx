import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoreVertical, Eye, Pencil, UserCog, Calendar, Flag, Copy, Ban, Archive, Loader2 } from 'lucide-react';
import { useCurrentRole } from '@/hooks/useCurrentRole';
import { hasTaskPermission, canEditTask, canArchiveTask, canManageTask, VALID_TRANSITIONS } from '@/lib/taskPermissions';
import { toast } from 'sonner';
import TaskReassignDialog from './TaskReassignDialog';
import TaskChangeDueDateDialog from './TaskChangeDueDateDialog';
import TaskChangePriorityDialog from './TaskChangePriorityDialog';
import TaskDuplicateDialog from './TaskDuplicateDialog';
import TaskArchiveDialog from './TaskArchiveDialog';

export default function TaskActionsMenu({ task, onRefresh, onEdit }) {
  const [dialog, setDialog] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const { role } = useCurrentRole();
  const navigate = useNavigate();

  if (!task) return null;

  const can = (action) => hasTaskPermission(role, action);
  const editable = canEditTask(task);
  const archivable = canArchiveTask(task);
  const manageable = canManageTask(task);
  const validNext = VALID_TRANSITIONS[task.status] || [];
  const canCancel = validNext.includes('Canceled') || validNext.includes('Cancelled');

  const handleSuccess = () => {
    setDialog(null);
    if (onRefresh) onRefresh();
  };

  const confirmCancel = async () => {
    if (!cancelReason.trim()) return;
    setCanceling(true);
    try {
      const response = await base44.functions.invoke('manageTask', {
        action: 'transition',
        taskId: task.id,
        newStatus: 'Canceled',
        reason: cancelReason,
      });
      if (response.data?.success) {
        toast.success('Task cancelled');
        setDialog(null);
        setCancelReason('');
        if (onRefresh) onRefresh();
      } else {
        toast.error(response.data?.error || 'Failed to cancel task');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel task');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-muted/50 shrink-0">
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => navigate(`/tasks/detail/${task.id}`)}>
            <Eye className="w-3.5 h-3.5 mr-2" /> Open Task
          </DropdownMenuItem>
          {editable && onEdit && can('edit') && (
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Task
            </DropdownMenuItem>
          )}
          {manageable && can('reassign') && (
            <DropdownMenuItem onClick={() => setDialog('reassign')}>
              <UserCog className="w-3.5 h-3.5 mr-2" /> Reassign
            </DropdownMenuItem>
          )}
          {manageable && can('change_due_date') && (
            <DropdownMenuItem onClick={() => setDialog('due_date')}>
              <Calendar className="w-3.5 h-3.5 mr-2" /> Change Due Date
            </DropdownMenuItem>
          )}
          {manageable && can('change_priority') && (
            <DropdownMenuItem onClick={() => setDialog('priority')}>
              <Flag className="w-3.5 h-3.5 mr-2" /> Change Priority
            </DropdownMenuItem>
          )}
          {can('duplicate') && (
            <DropdownMenuItem onClick={() => setDialog('duplicate')}>
              <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
            </DropdownMenuItem>
          )}
          {canCancel && can('cancel') && (
            <DropdownMenuItem onClick={() => { setDialog('cancel'); setCancelReason(''); }} className="text-red-600">
              <Ban className="w-3.5 h-3.5 mr-2" /> Cancel
            </DropdownMenuItem>
          )}
          {archivable && can('archive') && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog('archive')} className="text-red-600">
                <Archive className="w-3.5 h-3.5 mr-2" /> Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'cancel'} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancel Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} placeholder="Reason for cancellation..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={canceling || !cancelReason.trim()}>
              {canceling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskReassignDialog open={dialog === 'reassign'} onOpenChange={() => setDialog(null)} task={task} onSuccess={handleSuccess} />
      <TaskChangeDueDateDialog open={dialog === 'due_date'} onOpenChange={() => setDialog(null)} task={task} onSuccess={handleSuccess} />
      <TaskChangePriorityDialog open={dialog === 'priority'} onOpenChange={() => setDialog(null)} task={task} onSuccess={handleSuccess} />
      <TaskDuplicateDialog open={dialog === 'duplicate'} onOpenChange={() => setDialog(null)} task={task} onSuccess={handleSuccess} />
      <TaskArchiveDialog open={dialog === 'archive'} onOpenChange={() => setDialog(null)} task={task} onSuccess={handleSuccess} />
    </>
  );
}