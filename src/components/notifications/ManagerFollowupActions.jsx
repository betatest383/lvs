import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  CheckCircle2,
  UserCog,
  Calendar,
  Flag,
  Ban,
  TrendingUp,
  XCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const MANAGER_ACTIONS = [
  { key: 'send_clarification', label: 'Send Clarification', icon: MessageSquare, needsInput: 'message', color: 'text-blue-600' },
  { key: 'confirm_start', label: 'Confirm Can Start', icon: CheckCircle2, needsInput: null, color: 'text-green-600' },
  { key: 'reassign', label: 'Reassign Task', icon: UserCog, needsInput: 'assignee', color: 'text-purple-600' },
  { key: 'change_due_date', label: 'Change Due Date', icon: Calendar, needsInput: 'date', color: 'text-orange-600' },
  { key: 'change_priority', label: 'Change Priority', icon: Flag, needsInput: 'priority', color: 'text-amber-600' },
  { key: 'mark_blocked', label: 'Mark Blocked', icon: Ban, needsInput: 'block_reason', color: 'text-red-600' },
  { key: 'escalate', label: 'Escalate', icon: TrendingUp, needsInput: null, color: 'text-red-700' },
  { key: 'close', label: 'Close Follow-Up', icon: XCircle, needsInput: null, color: 'text-gray-600' },
];

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

/**
 * ManagerFollowupActions — Phase 3B manager resolution workflow.
 *
 * Renders inside NotificationDetail when the notification is a manager
 * follow-up (task_clarification_requested, task_unable_to_start,
 * task_manager_help_requested). Provides eight manager actions:
 *
 *   Send Clarification, Confirm Can Start, Reassign, Change Due Date,
 *   Change Priority, Mark Blocked, Escalate, Close Follow-Up
 *
 * All actions route through manageNotification.manager_respond, which:
 *   - Verifies the manager is the direct recipient of the follow-up
 *   - Updates the task
 *   - Resolves the follow-up notification
 *   - Creates an employee notification (clarification/confirm/reassign)
 *   - Creates an audit log entry
 */
export default function ManagerFollowupActions({ notification, onRefresh }) {
  const [activeAction, setActiveAction] = useState(null);
  const [message, setMessage] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeResults, setAssigneeResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Only render for manager follow-up notifications
  const isManagerFollowup = notification && [
    'task_clarification_requested',
    'task_unable_to_start',
    'task_manager_help_requested',
  ].includes(notification.notification_purpose);

  if (!isManagerFollowup) return null;

  // Don't show actions if already resolved
  if (['Resolved', 'Cancelled', 'Expired'].includes(notification.status)) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground text-center">
        This follow-up has been {notification.status.toLowerCase()}.
      </div>
    );
  }

  const handleAssigneeSearch = async (query) => {
    setAssigneeSearch(query);
    if (query.trim().length < 2) {
      setAssigneeResults([]);
      return;
    }
    try {
      const results = await base44.entities.EmployeeRegistry.filter({
        $or: [
          { first_name: { $regex: query, $options: 'i' } },
          { last_name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { employee_id: { $regex: query, $options: 'i' } },
        ],
        employment_status: 'Active',
      }, null, 10);
      setAssigneeResults(results || []);
    } catch {
      setAssigneeResults([]);
    }
  };

  const handleSubmit = async () => {
    if (!activeAction || submitting) return;

    // Validate inputs
    if (activeAction.needsInput === 'message' && message.trim().length < 5) {
      toast.error('Clarification message must be at least 5 characters');
      return;
    }
    if (activeAction.needsInput === 'assignee' && !newAssigneeId) {
      toast.error('Please select an employee to reassign to');
      return;
    }
    if (activeAction.needsInput === 'date' && !newDueDate) {
      toast.error('Please select a new due date');
      return;
    }
    if (activeAction.needsInput === 'priority' && !newPriority) {
      toast.error('Please select a priority');
      return;
    }
    if (activeAction.needsInput === 'block_reason' && blockReason.trim().length < 5) {
      toast.error('Block reason must be at least 5 characters');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        action: 'manager_respond',
        notificationId: notification.id,
        managerAction: activeAction.key,
      };

      if (activeAction.needsInput === 'message') payload.managerMessage = message.trim();
      if (activeAction.needsInput === 'assignee') payload.newAssigneeId = newAssigneeId;
      if (activeAction.needsInput === 'date') payload.newDueDate = newDueDate;
      if (activeAction.needsInput === 'priority') payload.newPriority = newPriority;
      if (activeAction.needsInput === 'block_reason') payload.blockReason = blockReason.trim();

      const response = await base44.functions.invoke('manageNotification', payload);

      if (!response.data?.success) {
        toast.error(response.data?.error || 'Failed to perform action');
        setSubmitting(false);
        return;
      }

      toast.success(`${activeAction.label} — completed`);
      setActiveAction(null);
      setMessage('');
      setBlockReason('');
      setNewDueDate('');
      setNewPriority('');
      setNewAssigneeId('');
      setAssigneeSearch('');
      setAssigneeResults([]);

      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to perform action');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setActiveAction(null);
    setMessage('');
    setBlockReason('');
    setNewDueDate('');
    setNewPriority('');
    setNewAssigneeId('');
    setAssigneeSearch('');
    setAssigneeResults([]);
  };

  // Safety concern indicator
  const isSafety = notification.notes && (() => {
    try {
      const parsed = JSON.parse(notification.notes);
      return parsed.is_safety === true;
    } catch { return false; }
  })();

  return (
    <div className="space-y-3">
      {isSafety && (
        <div className="p-2 rounded-lg bg-red-100 border border-red-300 text-xs text-red-800 flex items-center gap-1">
          <ShieldAlert className="w-4 h-4" /> Safety-related response — handle with priority.
        </div>
      )}

      {!activeAction ? (
        <div className="grid grid-cols-2 gap-2">
          {MANAGER_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(action)}
                className="justify-start"
              >
                <Icon className={`w-4 h-4 mr-2 ${action.color}`} />
                {action.label}
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
          {(() => {
            const Icon = activeAction.icon;
            return (
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${activeAction.color}`} />
                <span className="font-medium text-sm">{activeAction.label}</span>
              </div>
            );
          })()}

          {/* Message input (send_clarification) */}
          {activeAction.needsInput === 'message' && (
            <div>
              <Label htmlFor="mgr-message">Clarification Message *</Label>
              <Textarea
                id="mgr-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your clarification for the employee..."
                rows={3}
                disabled={submitting}
                className="mt-1"
              />
            </div>
          )}

          {/* Block reason input */}
          {activeAction.needsInput === 'block_reason' && (
            <div>
              <Label htmlFor="block-reason">Block Reason *</Label>
              <Textarea
                id="block-reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Explain why the task is being blocked..."
                rows={2}
                disabled={submitting}
                className="mt-1"
              />
            </div>
          )}

          {/* Due date input */}
          {activeAction.needsInput === 'date' && (
            <div>
              <Label htmlFor="due-date">New Due Date *</Label>
              <Input
                id="due-date"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                disabled={submitting}
                className="mt-1"
              />
            </div>
          )}

          {/* Priority input */}
          {activeAction.needsInput === 'priority' && (
            <div>
              <Label htmlFor="priority-select">New Priority *</Label>
              <Select value={newPriority} onValueChange={setNewPriority} disabled={submitting}>
                <SelectTrigger id="priority-select" className="mt-1">
                  <SelectValue placeholder="Select priority..." />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assignee picker */}
          {activeAction.needsInput === 'assignee' && (
            <div>
              <Label htmlFor="assignee-search">Search Employee *</Label>
              <Input
                id="assignee-search"
                value={assigneeSearch}
                onChange={(e) => handleAssigneeSearch(e.target.value)}
                placeholder="Type name, email, or employee ID..."
                disabled={submitting}
                className="mt-1"
              />
              {assigneeResults.length > 0 && (
                <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                  {assigneeResults.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setNewAssigneeId(emp.id);
                        setAssigneeSearch(`${emp.first_name} ${emp.last_name} (${emp.employee_id})`);
                        setAssigneeResults([]);
                      }}
                      disabled={submitting}
                      className={`w-full text-left p-2 rounded text-xs hover:bg-accent ${newAssigneeId === emp.id ? 'bg-accent' : ''}`}
                    >
                      {emp.first_name} {emp.last_name} — {emp.employee_id} ({emp.department || 'N/A'})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Confirmation for actions without input */}
          {activeAction.needsInput === null && (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to {activeAction.label.toLowerCase()}?
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}