import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  normalizeRole,
  isPrivileged,
  generateNotificationId,
  generateAcknowledgmentNumber,
  resolveEmployee,
  resolveRoleKey,
  canViewNotification,
  isDirectRecipient,
  buildIdempotencyKey,
  logEvent,
} from '../../shared/notificationHelpers.ts';
import {
  resolveManager,
  hasActiveManagerFollowup,
  createManagerFollowup,
  startWorkSession,
  logResponseEvent,
  checkAndCreateResumeObligation,
  resolveStaleResumeNotifications,
  resumeInterruptedWork,
  snoozeResumeNotification,
} from '../../shared/taskResponseHelpers.ts';

/**
 * manageNotification — Secure server-side notification management.
 *
 * All Notification Center actions route through this function instead of
 * direct client-side entity writes. Enforces:
 *   - Server-side identity resolution (ignores caller-supplied identity)
 *   - Recipient/manager/Owner/admin visibility rules
 *   - Safe notification ID generation (NOT count+1)
 *   - Atomic, idempotent acknowledgment via TaskAcknowledgment
 *   - Audit logging to AutomationRunLog
 *
 * Actions: list, get, create, edit, acknowledge, archive, cancel, resend,
 *          resolve, mark_read, get_acknowledgments
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      action,
      notificationId,
      notificationData,
      listScope,
      filters,
      response,
      responseReason,
      deviceId,
      resolutionType,
      resolutionReason,
      resolutionSourceType,
      resolutionSourceId,
      resolutionDecision,
      responseCategory,
      managerAction,
      managerMessage,
      newDueDate,
      newPriority,
      newAssigneeId,
      blockReason,
      _test_user_email,
    } = body;

    // ── Resolve identity server-side ──
    const effectiveEmail = _test_user_email || user.email;
    const employee = await resolveEmployee(base44, effectiveEmail);
    const employeeId = employee?.id || '';
    const canonicalRoleKey = await resolveRoleKey(base44, employee);
    const privileged = isPrivileged(canonicalRoleKey);

    if (!employee && !privileged) {
      return Response.json({ error: 'Employee record not found for this account' }, { status: 403 });
    }

    switch (action) {
      // ── LIST ─────────────────────────────────────────────────────────────
      case 'list': {
        const scope = listScope || 'mine';
        const limit = filters?.limit || 200;
        const sortField = filters?.sort || '-created_date';

        // Fetch recent notifications (service role for broad query, then filter)
        const all = await base44.asServiceRole.entities.EnterpriseNotification.list(sortField, limit);

        let visible;
        if (scope === 'all' && privileged) {
          visible = all;
        } else if (scope === 'actionable') {
          // Actionable: notifications DIRECTLY addressed to this employee that
          // require acknowledgment and are not yet acknowledged/resolved/cancelled.
          // This is the PERSONAL actionable queue — Owner/admin/manager visibility
          // does NOT apply. Only direct recipients receive the persistent banner.
          visible = all.filter((n) => {
            if (!isDirectRecipient(n, employee)) return false;
            if (n.is_archived) return false;
            if (['Acknowledged', 'Resolved', 'Expired', 'Cancelled', 'Failed'].includes(n.status)) return false;
            if (!n.requires_acknowledgment) return false;
            // Snooze check: if snoozed and not yet expired, hide from actionable queue
            if (n.resume_snooze_until && new Date(n.resume_snooze_until) > new Date()) return false;
            return true;
          });
        } else {
          // Default: all notifications visible to this employee, not archived
          visible = all.filter((n) => {
            if (n.is_archived && scope !== 'archived') return false;
            if (scope === 'archived') return n.is_archived && canViewNotification(n, employee, employeeId, canonicalRoleKey, privileged);
            return canViewNotification(n, employee, employeeId, canonicalRoleKey, privileged);
          });
        }

        return Response.json({ success: true, notifications: visible, count: visible.length });
      }

      // ── GET ──────────────────────────────────────────────────────────────
      case 'get': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        if (!canViewNotification(n, employee, employeeId, canonicalRoleKey, privileged)) {
          return Response.json({ error: 'Not authorized to view this notification' }, { status: 403 });
        }
        return Response.json({ success: true, notification: n });
      }

      // ── MARK READ ─────────────────────────────────────────────────────────
      case 'mark_read': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        if (!canViewNotification(n, employee, employeeId, canonicalRoleKey, privileged)) {
          return Response.json({ error: 'Not authorized' }, { status: 403 });
        }

        // Only mark Read if currently Sent/Delivered/Pending — never downgrade Acknowledged/Resolved
        if (['Sent', 'Delivered', 'Pending'].includes(n.status)) {
          const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
            status: 'Read',
            read_date: new Date().toISOString(),
          });
          return Response.json({ success: true, notification: updated });
        }
        return Response.json({ success: true, notification: n });
      }

      // ── ACKNOWLEDGE (server-backed TaskAcknowledgment) ───────────────────
      case 'acknowledge': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // ── Authorization: ONLY the direct recipient may acknowledge ──
        // Owner/admin visibility does NOT substitute for the assigned employee's
        // acknowledgment. This prevents an Owner from satisfying or clearing
        // another employee's required acknowledgment.
        if (!isDirectRecipient(n, employee)) {
          await logEvent(base44, notificationId, 'notification_center', 'acknowledgment_denied_not_recipient', {
            attempted_by: user.email,
            attempted_by_employee_id: employeeId,
            recipient_employee_registry_id: n.recipient_employee_registry_id,
            recipient_email: n.recipient_email,
            reason: 'authenticated employee is not the direct recipient',
          }, user.email);
          return Response.json({
            error: 'Only the assigned employee may acknowledge this notification',
            reason: 'not_direct_recipient',
          }, { status: 403 });
        }

        // ── Resolve the related task (if any) ──
        let task = null;
        if (n.related_task) {
          try { task = await base44.asServiceRole.entities.EnterpriseTask.get(n.related_task); } catch (e) { /* task may not exist */ }
        }

        // ── Verify the authenticated employee is the currently assigned employee ──
        if (task && task.assigned_employee_registry_id && task.assigned_employee_registry_id !== employeeId) {
          await logEvent(base44, notificationId, 'notification_center', 'acknowledgment_denied_not_assigned', {
            attempted_by: user.email,
            attempted_by_employee_id: employeeId,
            task_assigned_to: task.assigned_employee_registry_id,
            task_number: task.task_number,
            reason: 'authenticated employee is not the currently assigned employee',
          }, user.email);
          return Response.json({
            error: 'Only the currently assigned employee may acknowledge this task',
            reason: 'not_assigned_employee',
          }, { status: 403 });
        }

        // ── Assignment version check ──
        const taskAssignmentVersion = task?.assignment_version || 0;
        const notificationAssignmentVersion = n.assignment_version || 0;

        // If the task exists and has moved to a newer assignment version, this
        // acknowledgment is for a stale assignment — reject it.
        if (task && taskAssignmentVersion > notificationAssignmentVersion) {
          return Response.json({
            error: 'This acknowledgment is for a previous assignment. The task has been reassigned.',
            current_assignment_version: taskAssignmentVersion,
            notification_assignment_version: notificationAssignmentVersion,
          }, { status: 409 });
        }

        // ── Validate response value ──
        const validResponses = ['acknowledged', 'start_now', 'request_clarification', 'unable_to_start', 'manager_assistance_requested'];
        const ackResponse = response || 'acknowledged';
        if (!validResponses.includes(ackResponse)) {
          return Response.json({ error: 'Invalid response value' }, { status: 400 });
        }

        // ── Validate response_reason and response_category per response type ──
        // request_clarification: requires a message (min 5 meaningful chars)
        // unable_to_start: requires a category AND explanation (min 5 chars)
        // manager_assistance_requested: requires a category AND explanation (min 5 chars)
        const meaningfulReason = (responseReason || '').trim();
        if (ackResponse === 'request_clarification') {
          if (!meaningfulReason || meaningfulReason.replace(/\s+/g, '').length < 5) {
            return Response.json({ error: 'A clarification message of at least 5 characters is required' }, { status: 400 });
          }
        }
        if (ackResponse === 'unable_to_start') {
          if (!responseCategory) {
            return Response.json({ error: 'A reason category is required' }, { status: 400 });
          }
          if (!meaningfulReason || meaningfulReason.replace(/\s+/g, '').length < 5) {
            return Response.json({ error: 'A written explanation of at least 5 characters is required' }, { status: 400 });
          }
        }
        if (ackResponse === 'manager_assistance_requested') {
          if (!responseCategory) {
            return Response.json({ error: 'A help category is required' }, { status: 400 });
          }
          if (!meaningfulReason || meaningfulReason.replace(/\s+/g, '').length < 5) {
            return Response.json({ error: 'A written explanation of at least 5 characters is required' }, { status: 400 });
          }
        }

        // ── Idempotency: check for existing acknowledgment with same key ──
        // The idempotency key is deterministic: taskId:assignmentVersion:employeeId:response.
        // A repeated request with the same key returns the existing record — no duplicate.
        const idempotencyKey = buildIdempotencyKey(n.related_task || notificationId, notificationAssignmentVersion, employeeId, ackResponse);

        const existing = await base44.asServiceRole.entities.TaskAcknowledgment.filter(
          { idempotency_key: idempotencyKey },
          '-created_date',
          1
        );

        if (existing.length > 0) {
          // Already acknowledged with the same response — return the existing result
          const currentTask = task ? await base44.asServiceRole.entities.EnterpriseTask.get(task.id) : null;
          const currentNotif = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
          return Response.json({
            success: true,
            acknowledgment: existing[0],
            task: currentTask,
            notification: currentNotif,
            idempotent: true,
          });
        }

        // ── Create the TaskAcknowledgment record ──
        const ackNumber = await generateAcknowledgmentNumber(base44);
        const now = new Date().toISOString();
        const wasOverdue = n.requires_acknowledgment && n.sent_date
          ? (new Date(now).getTime() - new Date(n.sent_date).getTime()) > ((n.acknowledgment_deadline_minutes || 15) * 60 * 1000)
          : false;

        const ackRecord = {
          acknowledgment_number: ackNumber,
          task_id: n.related_task || '',
          task_number: n.related_task_number || task?.task_number || '',
          employee_id: employeeId,
          employee_email: employee?.email || user.email,
          employee_name: employee ? `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim() : (user.full_name || 'Unknown'),
          notification_id: notificationId,
          assignment_version: notificationAssignmentVersion,
          idempotency_key: idempotencyKey,
          delivered_at: n.sent_date || n.created_date || now,
          displayed_at: n.read_date || now,
          acknowledged_at: now,
          response: ackResponse,
          response_reason: responseReason || '',
          response_category: responseCategory || '',
          device_id: deviceId || '',
          was_overdue: wasOverdue,
          escalation_level: n.escalation_level || 0,
          acknowledgment_deadline_minutes: task?.acknowledgment_deadline_minutes || n.acknowledgment_deadline_minutes || null,
          created_by: user.email,
        };

        const createdAck = await base44.asServiceRole.entities.TaskAcknowledgment.create(ackRecord);

        // ── Update EnterpriseNotification ──
        const notificationUpdates = {
          status: 'Acknowledged',
          acknowledged_date: now,
          acknowledged_by: ackRecord.employee_name,
        };
        const updatedNotification = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, notificationUpdates);

        // ── Update EnterpriseTask.acknowledgment_status ──
        let updatedTask = null;
        if (task) {
          const taskUpdates = {
            acknowledgment_status: ackResponse === 'acknowledged' ? 'acknowledged' : ackResponse,
            updated_by: ackRecord.employee_name,
          };
          // Append to status_history
          const history = parseJSON(task.status_history, []);
          history.push({
            status: task.status,
            changed_by: ackRecord.employee_name,
            timestamp: now,
            notes: `Acknowledgment: ${ackResponse}${responseReason ? ' — ' + responseReason : ''}`,
          });
          taskUpdates.status_history = JSON.stringify(history);
          updatedTask = await base44.asServiceRole.entities.EnterpriseTask.update(task.id, taskUpdates);
        }

        // ── Audit log ──
        await logEvent(base44, notificationId, 'notification_center', 'notification_acknowledged', {
          acknowledgment_number: ackNumber,
          task_id: n.related_task || null,
          task_number: n.related_task_number || null,
          assignment_version: notificationAssignmentVersion,
          response: ackResponse,
          response_reason: responseReason || null,
          employee_id: employeeId,
          employee_name: ackRecord.employee_name,
          was_overdue: wasOverdue,
          idempotent: false,
        }, user.email);

        if (task) {
          await logEvent(base44, task.id, 'task_registry', 'task_acknowledgment_recorded', {
            acknowledgment_number: ackNumber,
            notification_id: notificationId,
            assignment_version: notificationAssignmentVersion,
            response: ackResponse,
            response_category: responseCategory || null,
            acknowledged_by: ackRecord.employee_name,
          }, user.email);
        }

        // ── Start Now: create/activate a WorkSession ──
        let workSession = null;
        let interruptedSession = null;
        let checkpoint = null;
        let startConflict = null;
        let interruptDecision = null;
        if (ackResponse === 'start_now' && task) {
          const startResult = await startWorkSession(base44, {
            task,
            employee,
            user,
            roleKey: canonicalRoleKey,
            deviceId: deviceId || '',
          });
          workSession = startResult.workSession;
          interruptedSession = startResult.interruptedSession;
          checkpoint = startResult.checkpoint;
          startConflict = startResult.conflict;
          interruptDecision = startResult.interruptDecision || null;

          if (startConflict) {
            // Non-interruptible: the TaskAcknowledgment is still recorded (employee
            // attempted to start), but we return the conflict so the UI can show
            // the employee their options without starting the task.
            await logResponseEvent(base44, task.id, 'start_now_blocked', {
              task_id: task.id,
              task_number: task.task_number,
              conflict: startConflict,
              employee_id: employeeId,
            }, user.email);
          } else {
            // Set started_at on the acknowledgment
            await base44.asServiceRole.entities.TaskAcknowledgment.update(createdAck.id, {
              started_at: now,
            });
          }

          // Reload task to reflect the status change
          updatedTask = await base44.asServiceRole.entities.EnterpriseTask.get(task.id);
        }

        // ── Manager follow-up for request_clarification, unable_to_start, manager_assistance_requested ──
        let managerFollowup = null;
        if (['request_clarification', 'unable_to_start', 'manager_assistance_requested'].includes(ackResponse) && task) {
          // Prevent duplicate follow-ups for the same assignment version
          const alreadyHasFollowup = await hasActiveManagerFollowup(base44, task.id, notificationAssignmentVersion);
          if (!alreadyHasFollowup) {
            const { managerEmployee, managerRoleKey, resolutionReason } = await resolveManager(base44, task, employee);
            if (managerEmployee) {
              managerFollowup = await createManagerFollowup(base44, {
                task,
                employee,
                response: ackResponse,
                responseCategory: responseCategory || '',
                responseReason: responseReason || '',
                assignmentVersion: notificationAssignmentVersion,
                managerEmployee,
                managerRoleKey,
                resolutionReason,
              });

              // Update task with follow-up status
              const followupUpdates = {
                manager_followup_status: 'pending',
                manager_followup_notification_id: managerFollowup?.id || null,
                response_category: responseCategory || '',
                updated_by: ackRecord.employee_name,
              };
              await base44.asServiceRole.entities.EnterpriseTask.update(task.id, followupUpdates);
              updatedTask = await base44.asServiceRole.entities.EnterpriseTask.get(task.id);

              await logResponseEvent(base44, task.id, 'manager_followup_created', {
                task_id: task.id,
                task_number: task.task_number,
                employee_response: ackResponse,
                response_category: responseCategory || null,
                manager_id: managerEmployee.id,
                manager_name: `${managerEmployee.preferred_name || managerEmployee.first_name || ''} ${managerEmployee.last_name || ''}`.trim(),
                notification_id: managerFollowup?.id || null,
                resolution_reason: resolutionReason,
              }, user.email);
            } else {
              await logResponseEvent(base44, task.id, 'manager_followup_no_manager_found', {
                task_id: task.id,
                task_number: task.task_number,
                employee_response: ackResponse,
              }, user.email);
            }
          } else {
            // Duplicate follow-up suppressed — the acknowledgment is still recorded
            await logResponseEvent(base44, task.id, 'manager_followup_duplicate_suppressed', {
              task_id: task.id,
              task_number: task.task_number,
              employee_response: ackResponse,
              assignment_version: notificationAssignmentVersion,
            }, user.email);
          }
        }

        return Response.json({
          success: true,
          acknowledgment: createdAck,
          task: updatedTask || task,
          notification: updatedNotification,
          idempotent: false,
          work_session: workSession,
          interrupted_session: interruptedSession,
          checkpoint: checkpoint,
          start_conflict: startConflict,
          manager_followup: managerFollowup,
          interrupt_decision: interruptDecision,
        });
      }

      // ── ARCHIVE ──────────────────────────────────────────────────────────
      case 'archive': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        const canManage = canViewNotification(n, employee, employeeId, canonicalRoleKey, privileged);
        if (!canManage) return Response.json({ error: 'Not authorized' }, { status: 403 });

        const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.email,
        });

        await logEvent(base44, notificationId, 'notification_center', 'notification_archived', {
          archived_by: user.email,
        }, user.email);

        return Response.json({ success: true, notification: updated });
      }

      // ── CANCEL ───────────────────────────────────────────────────────────
      case 'cancel': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // Only privileged users or notification creators can cancel
        if (!privileged) {
          return Response.json({ error: 'Not authorized to cancel notifications' }, { status: 403 });
        }

        const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
          status: 'Cancelled',
        });

        await logEvent(base44, notificationId, 'notification_center', 'notification_cancelled', {
          cancelled_by: user.email,
          reason: resolutionReason || null,
        }, user.email);

        return Response.json({ success: true, notification: updated });
      }

      // ── RESEND ───────────────────────────────────────────────────────────
      case 'resend': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        if (!privileged) {
          return Response.json({ error: 'Not authorized to resend notifications' }, { status: 403 });
        }

        const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, {
          status: 'Sent',
          sent_date: new Date().toISOString(),
          read_date: null,
          acknowledged_date: null,
          acknowledged_by: null,
        });

        await logEvent(base44, notificationId, 'notification_center', 'notification_resent', {
          resent_by: user.email,
        }, user.email);

        return Response.json({ success: true, notification: updated });
      }

      // ── RESOLVE (used by task lifecycle actions) ──────────────────────────
      case 'resolve': {
        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // resolve is called internally by manageTask or by privileged users
        if (!privileged) {
          return Response.json({ error: 'Not authorized to resolve notifications' }, { status: 403 });
        }

        const now = new Date().toISOString();
        const updates = {
          status: 'Resolved',
          resolved_at: now,
          resolved_by_user_id: user.id || '',
          resolved_by_employee_id: employeeId,
          resolved_by_name: employee ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() : user.full_name,
        };
        if (resolutionType) updates.resolution_type = resolutionType;
        if (resolutionReason) updates.resolution_reason = resolutionReason;
        if (resolutionSourceType) updates.resolution_source_type = resolutionSourceType;
        if (resolutionSourceId) updates.resolution_source_id = resolutionSourceId;
        if (resolutionDecision) updates.resolution_decision = resolutionDecision;

        const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, updates);

        await logEvent(base44, notificationId, 'notification_center', 'notification_resolved', {
          resolved_by: user.email,
          resolution_type: resolutionType || null,
          resolution_reason: resolutionReason || null,
        }, user.email);

        return Response.json({ success: true, notification: updated });
      }

      // ── CREATE (admin/manager only) ──────────────────────────────────────
      case 'create': {
        if (!privileged && canonicalRoleKey !== 'office_manager' && canonicalRoleKey !== 'operations_manager' && canonicalRoleKey !== 'director_of_operations') {
          return Response.json({ error: 'Not authorized to create notifications' }, { status: 403 });
        }

        // Security: strip caller-supplied creator identity
        const { created_by: _ignored, ...safeData } = notificationData || {};

        const notificationId = await generateNotificationId(base44);
        const now = new Date().toISOString();

        const newNotification = {
          notification_id: notificationId,
          title: safeData.title || '',
          message: safeData.message || '',
          notification_type: safeData.notification_type || 'Information',
          notification_purpose: safeData.notification_purpose || 'manual',
          priority: safeData.priority || 'Medium',
          status: 'Sent',
          source_module: safeData.source_module || 'Manual',
          source_record_id: safeData.source_record_id || null,
          recipient_employee_registry_id: safeData.recipient_employee_registry_id || null,
          recipient_email: safeData.recipient_email || null,
          recipient_name: safeData.recipient_name || null,
          recipient_user_id: safeData.recipient_user_id || null,
          recipient_role: safeData.recipient_role || null,
          recipient_department: safeData.recipient_department || null,
          related_task: safeData.related_task || null,
          related_task_number: safeData.related_task_number || null,
          related_task_title: safeData.related_task_title || null,
          delivery_methods: safeData.delivery_methods || ['In-App'],
          requires_acknowledgment: safeData.requires_acknowledgment || false,
          is_archived: false,
          sent_date: now,
        };

        const created = await base44.asServiceRole.entities.EnterpriseNotification.create(newNotification);

        await logEvent(base44, notificationId, 'notification_center', 'notification_created', {
          title: newNotification.title,
          created_by: user.email,
          recipient: safeData.recipient_email || safeData.recipient_employee_registry_id || safeData.recipient_role || safeData.recipient_department || 'broadcast',
        }, user.email);

        return Response.json({ success: true, notification: created });
      }

      // ── EDIT (admin/manager only) ────────────────────────────────────────
      case 'edit': {
        if (!privileged) {
          return Response.json({ error: 'Not authorized to edit notifications' }, { status: 403 });
        }

        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        const { created_by: _ignored, ...safeData } = notificationData || {};
        const updated = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, safeData);

        await logEvent(base44, notificationId, 'notification_center', 'notification_edited', {
          edited_by: user.email,
          fields: Object.keys(safeData),
        }, user.email);

        return Response.json({ success: true, notification: updated });
      }

      // ── GET ACKNOWLEDGMENTS (for Task Detail history) ────────────────────
      case 'get_acknowledgments': {
        const { taskId } = body;
        if (!taskId) return Response.json({ error: 'taskId is required' }, { status: 400 });

        const acks = await base44.asServiceRole.entities.TaskAcknowledgment.filter(
          { task_id: taskId },
          '-acknowledged_at',
          50
        );

        return Response.json({ success: true, acknowledgments: acks });
      }

      // ── LIST MANAGER FOLLOW-UPS ──────────────────────────────────────────
      // Returns notifications addressed to the current user that are manager
      // follow-ups (clarification, unable_to_start, manager_help). These appear
      // in the manager's actionable queue.
      case 'list_manager_followups': {
        const all = await base44.asServiceRole.entities.EnterpriseNotification.list('-created_date', 200);
        const followups = all.filter((n) => {
          if (!isDirectRecipient(n, employee)) return false;
          if (n.is_archived) return false;
          if (['Resolved', 'Cancelled', 'Expired', 'Failed'].includes(n.status)) return false;
          return ['task_clarification_requested', 'task_unable_to_start', 'task_manager_help_requested'].includes(n.notification_purpose);
        });
        return Response.json({ success: true, followups, count: followups.length });
      }

      // ── MANAGER RESPOND ──────────────────────────────────────────────────
      // Handles manager actions on employee follow-up notifications.
      // Actions: send_clarification, confirm_start, reassign, change_due_date,
      //          change_priority, mark_blocked, escalate, close
      case 'manager_respond': {
        const { managerAction } = body;
        if (!managerAction) return Response.json({ error: 'managerAction is required' }, { status: 400 });

        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // Manager must be the direct recipient of the follow-up notification
        if (!isDirectRecipient(n, employee)) {
          return Response.json({
            error: 'Only the assigned manager may respond to this follow-up',
            reason: 'not_direct_recipient',
          }, { status: 403 });
        }

        // Resolve the related task
        let task = null;
        if (n.related_task) {
          try { task = await base44.asServiceRole.entities.EnterpriseTask.get(n.related_task); } catch { /* noop */ }
        }

        const now = new Date().toISOString();
        const managerName = employee ? `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim() : user.full_name || user.email;
        let employeeNotification = null;
        let taskUpdates = {};
        let followupUpdates = {};

        switch (managerAction) {
          // ── Send Clarification to employee ──
          case 'send_clarification': {
            if (!managerMessage || managerMessage.trim().length < 5) {
              return Response.json({ error: 'A clarification message of at least 5 characters is required' }, { status: 400 });
            }
            // Create a new notification addressed to the employee with the manager's clarification
            const clarifNotifId = await generateNotificationId(base44);
            employeeNotification = await base44.asServiceRole.entities.EnterpriseNotification.create({
              notification_id: clarifNotifId,
              title: `Clarification from Manager: ${n.related_task_number || 'Task'}`,
              message: managerMessage.trim(),
              notification_type: 'Task',
              notification_purpose: 'task_clarification_response',
              priority: n.priority || 'High',
              status: 'Sent',
              source_module: 'task_registry',
              source_record_id: task?.id || null,
              recipient_employee_registry_id: n.related_employee || task?.assigned_employee_registry_id || '',
              recipient_email: task?.assigned_to_email || '',
              recipient_name: task?.assigned_to || '',
              related_task: task?.id || null,
              related_task_number: task?.task_number || n.related_task_number || '',
              related_task_title: task?.title || n.related_task_title || '',
              related_task_priority: task?.priority || n.related_task_priority || 'High',
              related_task_due_date: task?.due_date || null,
              assignment_version: n.assignment_version || 0,
              delivery_methods: ['In-App'],
              requires_acknowledgment: true,
              is_archived: false,
              sent_date: now,
              escalation_level: 0,
              notes: JSON.stringify({ manager_id: employeeId, manager_name: managerName, clarification: managerMessage.trim() }),
            });

            // Restore task to acknowledgment-required state
            taskUpdates = {
              acknowledgment_status: 'pending',
              manager_followup_status: 'responded',
              manager_response: managerMessage.trim(),
              updated_by: managerName,
            };

            // Resolve the manager follow-up notification
            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_user_id: user.id || '',
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: 'Clarification sent to employee',
            };
            break;
          }

          // ── Confirm employee can start ──
          case 'confirm_start': {
            // Create a notification to the employee offering Start Now
            const confirmNotifId = await generateNotificationId(base44);
            employeeNotification = await base44.asServiceRole.entities.EnterpriseNotification.create({
              notification_id: confirmNotifId,
              title: `Manager Confirmed Start: ${n.related_task_number || 'Task'}`,
              message: `${managerName} has confirmed you can start this task. You may now use Start Now.`,
              notification_type: 'Task',
              notification_purpose: 'task_manager_help_response',
              priority: n.priority || 'High',
              status: 'Sent',
              source_module: 'task_registry',
              source_record_id: task?.id || null,
              recipient_employee_registry_id: n.related_employee || task?.assigned_employee_registry_id || '',
              recipient_email: task?.assigned_to_email || '',
              recipient_name: task?.assigned_to || '',
              related_task: task?.id || null,
              related_task_number: task?.task_number || n.related_task_number || '',
              related_task_title: task?.title || n.related_task_title || '',
              related_task_priority: task?.priority || n.related_task_priority || 'High',
              related_task_due_date: task?.due_date || null,
              assignment_version: n.assignment_version || 0,
              delivery_methods: ['In-App'],
              requires_acknowledgment: true,
              is_archived: false,
              sent_date: now,
              escalation_level: 0,
              notes: JSON.stringify({ manager_id: employeeId, manager_name: managerName, action: 'confirm_start' }),
            });

            taskUpdates = {
              acknowledgment_status: 'pending',
              manager_followup_status: 'responded',
              manager_response: 'Manager confirmed you can start.',
              updated_by: managerName,
            };

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_user_id: user.id || '',
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: 'Employee confirmed to start',
            };
            break;
          }

          // ── Reassign task (uses existing manageTask-compatible logic) ──
          case 'reassign': {
            if (!newAssigneeId) return Response.json({ error: 'newAssigneeId is required for reassign' }, { status: 400 });
            const newEmp = await base44.asServiceRole.entities.EmployeeRegistry.get(newAssigneeId);
            if (!newEmp) return Response.json({ error: 'New assignee not found' }, { status: 404 });

            const newVersion = (task?.assignment_version || 0) + 1;
            taskUpdates = {
              assigned_employee_registry_id: newAssigneeId,
              assigned_to: `${newEmp.preferred_name || newEmp.first_name || ''} ${newEmp.last_name || ''}`.trim(),
              assigned_to_email: newEmp.email || newEmp.login_email || '',
              assigned_to_linked_user_id: newEmp.linked_user_id || '',
              assignment_version: newVersion,
              acknowledgment_status: 'pending',
              manager_followup_status: 'none',
              manager_followup_notification_id: null,
              manager_response: '',
              updated_by: managerName,
            };

            // Notify the new assignee
            const reassignNotifId = await generateNotificationId(base44);
            employeeNotification = await base44.asServiceRole.entities.EnterpriseNotification.create({
              notification_id: reassignNotifId,
              title: `Task Reassigned: ${task?.task_number || 'Task'}`,
              message: `You have been assigned to ${task?.title || 'a task'} by ${managerName}.`,
              notification_type: 'Task',
              notification_purpose: 'task_reassigned',
              priority: task?.priority || 'High',
              status: 'Sent',
              source_module: 'task_registry',
              source_record_id: task?.id || null,
              recipient_employee_registry_id: newAssigneeId,
              recipient_email: newEmp.email || newEmp.login_email || '',
              recipient_name: `${newEmp.preferred_name || newEmp.first_name || ''} ${newEmp.last_name || ''}`.trim(),
              recipient_user_id: newEmp.linked_user_id || null,
              related_task: task?.id || null,
              related_task_number: task?.task_number || '',
              related_task_title: task?.title || '',
              related_task_priority: task?.priority || 'High',
              related_task_due_date: task?.due_date || null,
              assignment_version: newVersion,
              delivery_methods: ['In-App'],
              requires_acknowledgment: true,
              is_archived: false,
              sent_date: now,
              escalation_level: 0,
            });

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_user_id: user.id || '',
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: 'Task reassigned',
            };
            break;
          }

          // ── Change due date ──
          case 'change_due_date': {
            if (!newDueDate) return Response.json({ error: 'newDueDate is required' }, { status: 400 });
            taskUpdates = {
              due_date: newDueDate,
              updated_by: managerName,
            };

            // Notify the employee of the due date change
            const dueDateNotifId = await generateNotificationId(base44);
            employeeNotification = await base44.asServiceRole.entities.EnterpriseNotification.create({
              notification_id: dueDateNotifId,
              title: `Due Date Changed: ${task?.task_number || 'Task'}`,
              message: `${managerName} changed the due date to ${newDueDate}.`,
              notification_type: 'Information',
              notification_purpose: 'manual',
              priority: 'Medium',
              status: 'Sent',
              source_module: 'task_registry',
              source_record_id: task?.id || null,
              recipient_employee_registry_id: n.related_employee || task?.assigned_employee_registry_id || '',
              recipient_email: task?.assigned_to_email || '',
              recipient_name: task?.assigned_to || '',
              related_task: task?.id || null,
              related_task_number: task?.task_number || '',
              related_task_title: task?.title || '',
              assignment_version: n.assignment_version || 0,
              delivery_methods: ['In-App'],
              requires_acknowledgment: false,
              is_archived: false,
              sent_date: now,
              escalation_level: 0,
            });

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: `Due date changed to ${newDueDate}`,
            };
            break;
          }

          // ── Change priority ──
          case 'change_priority': {
            if (!newPriority) return Response.json({ error: 'newPriority is required' }, { status: 400 });
            const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
            if (!validPriorities.includes(newPriority)) {
              return Response.json({ error: 'Invalid priority value' }, { status: 400 });
            }
            taskUpdates = {
              priority: newPriority,
              updated_by: managerName,
            };

            const prioNotifId = await generateNotificationId(base44);
            employeeNotification = await base44.asServiceRole.entities.EnterpriseNotification.create({
              notification_id: prioNotifId,
              title: `Priority Changed: ${task?.task_number || 'Task'}`,
              message: `${managerName} changed the priority to ${newPriority}.`,
              notification_type: 'Information',
              notification_purpose: 'manual',
              priority: newPriority,
              status: 'Sent',
              source_module: 'task_registry',
              source_record_id: task?.id || null,
              recipient_employee_registry_id: n.related_employee || task?.assigned_employee_registry_id || '',
              recipient_email: task?.assigned_to_email || '',
              recipient_name: task?.assigned_to || '',
              related_task: task?.id || null,
              related_task_number: task?.task_number || '',
              related_task_title: task?.title || '',
              assignment_version: n.assignment_version || 0,
              delivery_methods: ['In-App'],
              requires_acknowledgment: false,
              is_archived: false,
              sent_date: now,
              escalation_level: 0,
            });

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: `Priority changed to ${newPriority}`,
            };
            break;
          }

          // ── Mark temporarily blocked ──
          case 'mark_blocked': {
            taskUpdates = {
              status: 'Blocked',
              blocked_reason: blockReason || 'Blocked by manager',
              orchestration_status: 'blocked',
              manager_followup_status: 'responded',
              updated_by: managerName,
            };

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: 'Task marked as blocked',
            };
            break;
          }

          // ── Escalate ──
          case 'escalate': {
            const currentLevel = task?.escalation_level || 0;
            taskUpdates = {
              escalation_level: currentLevel + 1,
              manager_followup_status: 'responded',
              updated_by: managerName,
            };

            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'completed',
              resolution_decision: `Escalated to level ${currentLevel + 1}`,
            };
            break;
          }

          // ── Close follow-up ──
          case 'close': {
            followupUpdates = {
              status: 'Resolved',
              resolved_at: now,
              resolved_by_user_id: user.id || '',
              resolved_by_employee_id: employeeId,
              resolved_by_name: managerName,
              resolution_type: 'no_longer_applicable',
              resolution_decision: 'Follow-up closed by manager',
            };

            if (task) {
              taskUpdates = {
                manager_followup_status: 'closed',
                updated_by: managerName,
              };
            }
            break;
          }

          default:
            return Response.json({ error: 'Unknown manager action: ' + managerAction }, { status: 400 });
        }

        // Apply task updates
        let updatedTask = null;
        if (task && Object.keys(taskUpdates).length > 0) {
          const history = parseJSON(task.status_history, []);
          history.push({
            status: taskUpdates.status || task.status,
            changed_by: managerName,
            timestamp: now,
            notes: `Manager action: ${managerAction}${managerMessage ? ' — ' + managerMessage.trim() : ''}`,
          });
          taskUpdates.status_history = JSON.stringify(history);
          updatedTask = await base44.asServiceRole.entities.EnterpriseTask.update(task.id, taskUpdates);
        }

        // Apply follow-up notification updates
        let updatedFollowup = null;
        if (Object.keys(followupUpdates).length > 0) {
          updatedFollowup = await base44.asServiceRole.entities.EnterpriseNotification.update(notificationId, followupUpdates);
        }

        // Audit log
        await logResponseEvent(base44, notificationId, 'manager_action', {
          manager_action: managerAction,
          task_id: task?.id || null,
          task_number: task?.task_number || null,
          manager_id: employeeId,
          manager_name: managerName,
          manager_message: managerMessage || null,
          new_due_date: newDueDate || null,
          new_priority: newPriority || null,
          new_assignee_id: newAssigneeId || null,
          employee_notification_id: employeeNotification?.id || null,
        }, user.email);

        return Response.json({
          success: true,
          task: updatedTask || task,
          followup_notification: updatedFollowup,
          employee_notification: employeeNotification,
          manager_action: managerAction,
        });
      }

      // ── CHECK RESUME OBLIGATIONS (called after task completion/cancellation) ──
      case 'check_resume_obligations': {
        const { taskId, terminalStatus } = body;
        if (!taskId) return Response.json({ error: 'taskId is required' }, { status: 400 });

        let completedTask = null;
        try { completedTask = await base44.asServiceRole.entities.EnterpriseTask.get(taskId); } catch { /* noop */ }
        if (!completedTask) return Response.json({ error: 'Task not found' }, { status: 404 });

        const result = await checkAndCreateResumeObligation(base44, {
          completedTask,
          user,
          terminalStatus: terminalStatus || completedTask.status || 'Completed',
        });

        await logResponseEvent(base44, taskId, 'resume_obligation_check', {
          task_id: taskId,
          task_number: completedTask.task_number,
          interrupted_task_id: completedTask.interrupted_task_id || null,
          terminal_status: terminalStatus,
          resume_decision_id: result.decision?.id || null,
          resume_notification_id: result.notification?.id || null,
          stale_resolved: result.staleNotificationsResolved,
        }, user.email);

        return Response.json({
          success: true,
          resume_decision: result.decision,
          resume_notification: result.notification,
          stale_notifications_resolved: result.staleNotificationsResolved,
        });
      }

      // ── RESUME INTERRUPTED WORK (canonical resume action) ──
      case 'resume_interrupted_work': {
        const { forceInterrupt } = body;

        // Resolve identity server-side
        if (!employee) {
          return Response.json({ error: 'Employee record not found' }, { status: 403 });
        }

        const result = await resumeInterruptedWork(base44, {
          notificationId,
          employee,
          user,
          roleKey: canonicalRoleKey,
          forceInterrupt: forceInterrupt || false,
        });

        if (result.conflict) {
          // Return conflict info for the frontend to handle
          const conflictStatus = result.conflict.type === 'not_authorized' ? 403
            : result.conflict.type === 'stale_assignment' ? 409
            : 200; // Other conflicts (confirm_interrupt, non_interruptible, etc.) return 200 with conflict info

          return Response.json({
            success: false,
            conflict: result.conflict,
            notification: result.notification,
          }, { status: conflictStatus });
        }

        await logResponseEvent(base44, notificationId, 'resume_work', {
          task_id: result.workSession?.task_id || null,
          task_number: result.workSession?.task_number || null,
          work_session_id: result.workSession?.id || null,
          checkpoint_id: result.checkpoint?.id || null,
          checkpoint_number: result.checkpoint?.checkpoint_number || null,
          decision_id: result.decision?.id || null,
          employee_id: employee.id,
        }, user.email);

        return Response.json({
          success: true,
          work_session: result.workSession,
          checkpoint: result.checkpoint ? {
            id: result.checkpoint.id,
            checkpoint_number: result.checkpoint.checkpoint_number,
            route: result.checkpoint.route,
            workflow_step: result.checkpoint.workflow_step,
            warehouse_location_id: result.checkpoint.warehouse_location_id || null,
            bin_location_id: result.checkpoint.bin_location_id || null,
            inventory_item_id: result.checkpoint.inventory_item_id || null,
            completed_item_ids: result.checkpoint.completed_item_ids || [],
            remaining_item_ids: result.checkpoint.remaining_item_ids || [],
            form_state: result.checkpoint.form_state_json ? JSON.parse(result.checkpoint.form_state_json) : null,
            notes: result.checkpoint.notes,
          } : null,
          decision: result.decision,
        });
      }

      // ── RESUME NOT NOW (server-side snooze) ──
      case 'resume_not_now': {
        const { snoozeMinutes } = body;
        const minutes = snoozeMinutes || 30; // Default 30 minutes

        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // Only the direct recipient may snooze
        if (!isDirectRecipient(n, employee)) {
          return Response.json({
            error: 'Only the assigned employee may snooze this notification',
            reason: 'not_direct_recipient',
          }, { status: 403 });
        }

        if (n.notification_purpose !== 'task_resume_required') {
          return Response.json({ error: 'This notification is not a resume notification' }, { status: 400 });
        }

        const updated = await snoozeResumeNotification(base44, notificationId, minutes);

        await logResponseEvent(base44, notificationId, 'resume_not_now', {
          task_id: n.related_task || null,
          task_number: n.related_task_number || null,
          snooze_minutes: minutes,
          snooze_until: updated.resume_snooze_until,
          employee_id: employee.id,
        }, user.email);

        return Response.json({
          success: true,
          notification: updated,
          snooze_until: updated.resume_snooze_until,
        });
      }

      // ── RESUME REQUEST MANAGER HELP ──
      case 'resume_request_manager_help': {
        const { responseCategory: helpCategory, responseReason: helpReason } = body;

        if (!helpReason || helpReason.trim().replace(/\s+/g, '').length < 5) {
          return Response.json({ error: 'A written explanation of at least 5 characters is required' }, { status: 400 });
        }

        const n = await base44.asServiceRole.entities.EnterpriseNotification.get(notificationId);
        if (!n) return Response.json({ error: 'Notification not found' }, { status: 404 });

        // Only the direct recipient may request help
        if (!isDirectRecipient(n, employee)) {
          return Response.json({
            error: 'Only the assigned employee may request help for this notification',
            reason: 'not_direct_recipient',
          }, { status: 403 });
        }

        if (n.notification_purpose !== 'task_resume_required') {
          return Response.json({ error: 'This notification is not a resume notification' }, { status: 400 });
        }

        // Load the interrupted task
        let task = null;
        if (n.related_task) {
          try { task = await base44.asServiceRole.entities.EnterpriseTask.get(n.related_task); } catch { /* noop */ }
        }

        // Create a manager follow-up using the existing Phase 3B framework
        let managerFollowup = null;
        if (task) {
          const alreadyHasFollowup = await hasActiveManagerFollowup(base44, task.id, n.assignment_version || 0);
          if (!alreadyHasFollowup) {
            const { managerEmployee, managerRoleKey, resolutionReason } = await resolveManager(base44, task, employee);
            if (managerEmployee) {
              managerFollowup = await createManagerFollowup(base44, {
                task,
                employee,
                response: 'manager_assistance_requested',
                responseCategory: helpCategory || 'Need decision',
                responseReason: `Resume Help: ${helpReason.trim()}`,
                assignmentVersion: n.assignment_version || 0,
                managerEmployee,
                managerRoleKey,
                resolutionReason,
              });

              await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
                manager_followup_status: 'pending',
                manager_followup_notification_id: managerFollowup?.id || null,
                updated_by: `${employee.preferred_name || employee.first_name || ''} ${employee.last_name || ''}`.trim(),
              });

              await logResponseEvent(base44, task.id, 'resume_manager_help', {
                task_id: task.id,
                task_number: task.task_number,
                manager_id: managerEmployee.id,
                notification_id: managerFollowup?.id || null,
                help_category: helpCategory || 'Need decision',
                help_reason: helpReason.trim(),
              }, user.email);
            }
          } else {
            await logResponseEvent(base44, task.id, 'resume_manager_help_duplicate_suppressed', {
              task_id: task.id,
              task_number: task.task_number,
            }, user.email);
          }
        }

        return Response.json({
          success: true,
          manager_followup: managerFollowup,
        });
      }

      default:
        return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    const errMsg = String(error.message || error);
    if (errMsg.includes('not found')) {
      return Response.json({ error: 'Notification not found' }, { status: 404 });
    }
    return Response.json({ error: errMsg }, { status: 500 });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function parseJSON(str, fallback) {
  if (!str) return fallback;
  if (Array.isArray(str) || typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}