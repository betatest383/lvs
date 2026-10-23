import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ═════════════════════════════════════════════════════════════════
// CANONICAL WAREHOUSE OPENING-BALANCE APPROVAL ACTION
// All approval entry points (notification, task center, approval
// queue, Step 5 Review, direct deep link) must call this function.
// No entity-update logic in frontend components.
// ═════════════════════════════════════════════════════════════════

const OPENING_BALANCE_APPROVAL_ROLE_KEYS = new Set(['owner', 'director_of_operations']);

function canApproveOpeningBalance(roleKey) {
  return OPENING_BALANCE_APPROVAL_ROLE_KEYS.has(roleKey);
}

function normalizeRole(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

// ─── Always resolves through EmployeeRegistry → RoleRegistry ───
// Platform admin role alone does NOT grant opening-balance approval.
async function resolveUserRole(base44, user) {
  const employees = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: user.email }, { login_email: user.email }],
  });
  const employee = employees[0];
  if (!employee) return normalizeRole(user.role) || 'user';
  const rawRole = normalizeRole(employee.primary_role || '');
  // Direct match (e.g. 'owner')
  if (OPENING_BALANCE_APPROVAL_ROLE_KEYS.has(rawRole)) return rawRole;
  // Resolve through RoleRegistry
  if (employee.primary_role) {
    try {
      const roles = await base44.asServiceRole.entities.RoleRegistry.filter({
        $or: [
          { role_key: rawRole },
          { role_name: employee.primary_role },
          { role_id: employee.primary_role },
        ],
      });
      if (roles[0]?.role_key) return normalizeRole(roles[0].role_key);
    } catch {}
  }
  return rawRole;
}

// ─── SHA-256 hash for count integrity ───
async function hashCountData(countData) {
  const json = JSON.stringify(countData);
  const data = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Server-side total recalculation from count data ───
async function recalculateTotals(base44, countData) {
  const itemIds = Object.keys(countData).filter(id =>
    countData[id]?.count !== undefined && countData[id]?.count !== '' && countData[id]?.count !== null
  );
  if (itemIds.length === 0) {
    return { snapshot: {}, totalItems: 0, totalQty: 0, totalValue: 0 };
  }
  const items = await base44.asServiceRole.entities.InventoryMaster.filter({ id: { $in: itemIds } });
  const snapshot = {};
  let totalQty = 0, totalValue = 0, itemCount = 0;
  for (const itemId of itemIds) {
    const item = items.find(i => i.id === itemId);
    if (!item) throw new Error(`Inventory item not found: ${itemId}`);
    const qty = Number(countData[itemId].count);
    if (isNaN(qty) || qty < 0) throw new Error(`Invalid count for item: ${item.item_name}`);
    const unitCost = item.unit_cost || 0;
    snapshot[itemId] = { count: qty, unit_cost: unitCost, item_name: item.item_name, bin_location: item.bin_location, sku: item.sku || null, inventory_type: item.inventory_type };
    totalQty += qty;
    totalValue += qty * unitCost;
    itemCount++;
  }
  return { snapshot, totalItems: itemCount, totalQty, totalValue: Math.round(totalValue * 100) / 100 };
}

// ─── Find approval tasks by stable dedup key (not browser-supplied ID) ───
async function findApprovalTasks(base44, sessionId) {
  return await base44.asServiceRole.entities.EnterpriseTask.filter({
    related_module: 'inventory_count_session',
    related_record_id: sessionId,
    task_type: 'Approval',
  }, null, 10);
}

// ─── Complete the approval task(s) ───
async function completeApprovalTask(base44, sessionId, approverEmail, now) {
  const tasks = await findApprovalTasks(base44, sessionId);
  let completed = null;
  for (const task of tasks) {
    if (['Completed', 'Canceled', 'Cancelled'].includes(task.status)) {
      completed = task;
      continue;
    }
    const approvalHistory = (() => { try { return JSON.parse(task.approval_history || '[]'); } catch { return []; } })();
    approvalHistory.push({ action: 'Approved', approver: approverEmail, notes: 'Opening balance approved', timestamp: now });
    const statusHistory = (() => { try { return JSON.parse(task.status_history || '[]'); } catch { return []; } })();
    statusHistory.push({ status: 'Completed', changed_by: approverEmail, timestamp: now, notes: 'Opening balance approved' });

    const updated = await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
      status: 'Completed',
      approval_status: 'Approved',
      approved_by: approverEmail,
      approved_at: now,
      approved_date: now.split('T')[0],
      completed_at: now,
      completed_date: now.split('T')[0],
      completion_summary: `Inventory count approved by ${approverEmail}`,
      updated_by: approverEmail,
      approval_history: JSON.stringify(approvalHistory),
      status_history: JSON.stringify(statusHistory),
    });
    completed = updated;
    console.log(`[CANONICAL APPROVAL] Completed task ${task.task_number} for session ${sessionId}`);
  }
  return { task: completed, taskCount: tasks.length };
}

// ─── Resolve approver identity from EmployeeRegistry ───
async function resolveApproverIdentity(base44, user, approverEmail) {
  const approverEmps = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: approverEmail }, { login_email: approverEmail }],
  }, null, 1);
  const emp = approverEmps[0] || null;
  return {
    resolved_by_user_id: user.id || null,
    resolved_by_employee_id: emp?.id || null,
    resolved_by_name: emp ? `${emp.first_name} ${emp.last_name}` : user.full_name || approverEmail,
    resolved_by_email: approverEmail,
  };
}

// ─── Resolve approval notifications with proper lifecycle ───
// Preserves existing read_date and acknowledged_date.
// Does NOT fabricate acknowledgment — acknowledged_by/date are only
// preserved if they were set by the actual recipient, not by a
// prior resolution action that incorrectly used acknowledged_by.
async function resolveApprovalNotifications(base44, sessionId, approverEmail, approverIdentity, resolutionType, resolutionDecision, sourceType, sourceId, now) {
  const notifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    source_module: 'inventory_count_session',
    source_record_id: sessionId,
    notification_type: 'Approval Required',
    status: { $nin: ['Resolved', 'Expired', 'Cancelled'] },
  }, null, 30);
  for (const n of notifs) {
    // Preserve existing read_date. Only preserve acknowledged_by/date if
    // the actual recipient acknowledged it (acknowledged_by matches recipient_email).
    const preserveAck = n.acknowledged_by && n.acknowledged_by.toLowerCase() === (n.recipient_email || '').toLowerCase();
    const update = {
      status: 'Resolved',
      resolved_at: now,
      resolved_by_user_id: approverIdentity.resolved_by_user_id,
      resolved_by_employee_id: approverIdentity.resolved_by_employee_id,
      resolved_by_name: approverIdentity.resolved_by_name,
      resolution_type: resolutionType,
      resolution_decision: resolutionDecision,
      resolution_source_type: sourceType,
      resolution_source_id: sourceId,
      is_archived: true,
      archived_at: now,
      archived_by: approverEmail,
    };
    if (!preserveAck) {
      update.acknowledged_by = null;
      update.acknowledged_date = null;
    }
    await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, update);
  }
  // Also resolve post-submission evidence notifications
  const evidenceNotifs = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    source_module: 'inventory_count_session',
    source_record_id: sessionId,
    title: 'Post-Submission Evidence Added',
    status: { $nin: ['Resolved', 'Expired', 'Cancelled'] },
  }, null, 10);
  for (const n of evidenceNotifs) {
    const preserveAck = n.acknowledged_by && n.acknowledged_by.toLowerCase() === (n.recipient_email || '').toLowerCase();
    const update = {
      status: 'Resolved',
      resolved_at: now,
      resolved_by_user_id: approverIdentity.resolved_by_user_id,
      resolved_by_employee_id: approverIdentity.resolved_by_employee_id,
      resolved_by_name: approverIdentity.resolved_by_name,
      resolution_type: resolutionType,
      resolution_decision: resolutionDecision,
      resolution_source_type: sourceType,
      resolution_source_id: sourceId,
      is_archived: true,
      archived_at: now,
      archived_by: approverEmail,
    };
    if (!preserveAck) {
      update.acknowledged_by = null;
      update.acknowledged_date = null;
    }
    await base44.asServiceRole.entities.EnterpriseNotification.update(n.id, update);
  }
  return { resolved: notifs.length + evidenceNotifs.length };
}

// ─── Create ONE approval-completed notification (deduped) ───
async function createApprovalCompletedNotification(base44, session, approverEmail, now) {
  const submitterEmail = session.submitted_by || session.started_by;
  if (!submitterEmail) return null;

  // Dedup: check if already exists
  const existing = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    source_module: 'inventory_count_session',
    source_record_id: session.id,
    notification_type: 'Success',
    title: 'Warehouse opening count approved',
    recipient_employee_registry_id: { $exists: true },
  }, null, 1);
  // Also check by recipient_email for submitter
  const existingByEmail = await base44.asServiceRole.entities.EnterpriseNotification.filter({
    source_module: 'inventory_count_session',
    source_record_id: session.id,
    title: 'Warehouse opening count approved',
    recipient_email: submitterEmail,
  }, null, 1);
  if (existingByEmail.length > 0) return existingByEmail[0];

  // Find submitter's EmployeeRegistry
  const submitterEmps = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: submitterEmail }, { login_email: submitterEmail }],
  }, null, 1);
  const submitter = submitterEmps[0];

  const notif = await base44.asServiceRole.entities.EnterpriseNotification.create({
    notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    title: 'Warehouse opening count approved',
    message: `${approverEmail} approved your opening count for ${session.warehouse_location_name || 'warehouse'}. The session is now ready for activation/posting.`,
    notification_type: 'Success',
    priority: 'Medium',
    status: 'Sent',
    sent_date: now,
    source_module: 'inventory_count_session',
    source_record_id: session.id,
    recipient_employee_registry_id: submitter?.id || null,
    recipient_email: submitterEmail,
    recipient_name: submitter ? `${submitter.first_name} ${submitter.last_name}` : submitterEmail,
    recipient_user_id: submitter?.linked_user_id || null,
    recipient_role: submitter?.primary_role || null,
    delivery_methods: ['In-App'],
    requires_acknowledgment: false,
    is_archived: false,
    escalation_level: 0,
  });
  return notif;
}

// ─── Generate task number ───
async function generateTaskNumber(base44) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await base44.asServiceRole.entities.EnterpriseTask.filter(
      { task_number: { $regex: '^TSK-' } }, '-task_number', 1
    );
    let next = 1;
    if (existing.length > 0 && existing[0].task_number) {
      const match = String(existing[0].task_number).match(/TSK-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    const candidate = 'TSK-' + String(next).padStart(6, '0');
    const collision = await base44.asServiceRole.entities.EnterpriseTask.filter({ task_number: candidate }, null, 1);
    if (collision.length === 0) return candidate;
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return 'TSK-' + String(Date.now()).slice(-6);
}

// ─── Create correction task + notification for submitter (return_for_correction) ───
async function createCorrectionHandoff(base44, session, approverEmail, reason) {
  const submitterEmail = session.started_by;
  const submitterEmps = await base44.asServiceRole.entities.EmployeeRegistry.filter({
    $or: [{ email: submitterEmail }, { login_email: submitterEmail }],
  }, null, 1);
  const submitter = submitterEmps[0];

  // Dedup: check for existing correction task
  const existing = await base44.asServiceRole.entities.EnterpriseTask.filter({
    related_module: 'inventory_count_session',
    related_record_id: session.id,
    task_type: 'Corrective Action',
    status: { $nin: ['Completed', 'Canceled', 'Cancelled'] },
  }, null, 1);
  let correctionTask = existing[0];
  if (!correctionTask) {
    const taskNumber = await generateTaskNumber(base44);
    correctionTask = await base44.asServiceRole.entities.EnterpriseTask.create({
      task_number: taskNumber,
      task_id: taskNumber,
      title: `Correct Warehouse Count — ${session.warehouse_location_name || 'Unknown'}`,
      description: `Session ${session.session_id} was returned for correction by ${approverEmail}.\n\nReason: ${reason}\n\nDirect link: /warehouse/setup/${session.id}`,
      task_type: 'Corrective Action',
      priority: 'High',
      status: 'Assigned',
      assigned_employee_registry_id: submitter?.id || null,
      assigned_to: submitter ? `${submitter.first_name} ${submitter.last_name}` : null,
      assigned_to_email: submitter?.email || submitterEmail,
      assigned_to_linked_user_id: submitter?.linked_user_id || null,
      assigned_role: submitter?.primary_role || null,
      related_module: 'inventory_count_session',
      related_record_id: session.id,
      related_route: `/warehouse/setup/${session.id}`,
      source_module: 'inventory_count_session',
      source_record_id: session.id,
      created_by: approverEmail,
    });
  }

  // Dedup notification
  if (submitter) {
    const existingNotif = await base44.asServiceRole.entities.EnterpriseNotification.filter({
      source_module: 'inventory_count_session',
      source_record_id: session.id,
      notification_type: 'Warning',
      recipient_employee_registry_id: submitter.id,
    }, null, 1);
    if (existingNotif.length === 0) {
      await base44.asServiceRole.entities.EnterpriseNotification.create({
        notification_id: 'NTF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        title: 'Warehouse count returned for correction',
        message: `${approverEmail} returned your count for ${session.warehouse_location_name || 'warehouse'} for correction. Reason: ${reason}`,
        notification_type: 'Warning',
        priority: 'High',
        status: 'Sent',
        sent_date: new Date().toISOString(),
        source_module: 'inventory_count_session',
        source_record_id: session.id,
        recipient_employee_registry_id: submitter.id,
        recipient_email: submitter.email,
        recipient_name: `${submitter.first_name} ${submitter.last_name}`,
        recipient_user_id: submitter.linked_user_id || null,
        recipient_role: submitter.primary_role,
        related_task: correctionTask.id,
        delivery_methods: ['In-App'],
        requires_acknowledgment: false,
        is_archived: false,
      });
    }
  }
  return { correctionTask };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { session_id, decision, reason, idempotency_key } = body;

    // ─── Input validation ───
    if (!session_id) return Response.json({ error: 'session_id is required' }, { status: 400 });
    if (!['approve', 'return_for_correction'].includes(decision)) {
      return Response.json({ error: 'decision must be "approve" or "return_for_correction"' }, { status: 400 });
    }
    if (decision === 'return_for_correction' && (!reason || !reason.trim())) {
      return Response.json({ error: 'A reason is required for return for correction' }, { status: 400 });
    }

    // ─── Reject caller-supplied identity fields ───
    const spoofedFields = ['approver_email', 'approver_role', 'approver_id', 'email', 'role', 'user_email', 'user_role'];
    const attemptedSpoof = spoofedFields.filter(f => body[f] !== undefined);
    if (attemptedSpoof.length > 0) {
      console.log(`[CANONICAL APPROVAL] IGNORED caller-supplied identity fields: ${attemptedSpoof.join(', ')}`);
    }

    // ─── Resolve role through EmployeeRegistry → RoleRegistry ───
    const roleKey = await resolveUserRole(base44, user);

    if (!canApproveOpeningBalance(roleKey)) {
      console.log(`[CANONICAL APPROVAL] DENIED user=${user.email} role=${roleKey} decision=${decision} session=${session_id}`);
      return Response.json({ error: 'Only the Owner or an authorized Director of Operations can approve opening-balance counts.' }, { status: 403 });
    }

    // ─── Load and validate session ───
    const session = await base44.asServiceRole.entities.InventoryCountSession.get(session_id);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    // ─── Prevent self-approval ───
    if (session.started_by === user.email || session.assigned_to === user.email) {
      console.log(`[CANONICAL APPROVAL] DENIED self-approval user=${user.email} session=${session_id} started_by=${session.started_by}`);
      return Response.json({ error: 'Cannot approve your own session. Separation of duties required.' }, { status: 403 });
    }

    const approverEmail = user.email;
    const now = new Date().toISOString();

    // ═══════════════════════════════════════════════════════════════
    // APPROVE
    // ═══════════════════════════════════════════════════════════════
    if (decision === 'approve') {
      // ─── Idempotency: already approved → reconcile task + notifications ───
      if (session.status === 'approved') {
        console.log(`[CANONICAL APPROVAL] IDEMPOTENT session=${session_id} already approved — reconciling task + notifications`);
        const effectiveApprover = session.approved_by || approverEmail;
        const effectiveTime = session.approved_at || now;
        const approverIdentity = await resolveApproverIdentity(base44, user, effectiveApprover);
        const taskResult = await completeApprovalTask(base44, session_id, effectiveApprover, effectiveTime);
        const notifResult = await resolveApprovalNotifications(base44, session_id, effectiveApprover, approverIdentity, 'approved', 'Warehouse opening count approved', 'inventory_count_session', session_id, effectiveTime);
        const completedNotif = await createApprovalCompletedNotification(base44, session, session.approved_by || approverEmail, session.approved_at || now);

        // Verify: no opening-balance transactions posted by approval
        const txns = await base44.asServiceRole.entities.InventoryTransaction.filter({
          source_document_id: session_id,
          transaction_type: 'opening_balance',
        }, null, 1);

        return Response.json({
          success: true,
          already_approved: true,
          reconciled: true,
          session,
          task: taskResult.task,
          notifications: { resolved: notifResult.resolved, created: completedNotif },
          opening_balance_transactions: txns.length,
        });
      }

      // ─── Validate session is awaiting_review ───
      if (session.status !== 'awaiting_review') {
        return Response.json({ error: `Session must be awaiting review before approval (current: ${session.status})` }, { status: 400 });
      }

      // ─── Recalculate totals server-side ───
      const counts = session.count_data_json ? JSON.parse(session.count_data_json) : {};
      let calcResult;
      try {
        calcResult = await recalculateTotals(base44, counts);
      } catch (calcErr) {
        return Response.json({ error: 'Approval failed: ' + calcErr.message }, { status: 400 });
      }
      if (calcResult.totalItems === 0) {
        return Response.json({ error: 'No counted items to approve' }, { status: 400 });
      }

      const countHash = await hashCountData(counts);

      // ─── Change session to approved ───
      const updatedSession = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'approved',
        approved_by: approverEmail,
        approved_at: now,
        approval_snapshot_json: JSON.stringify(calcResult.snapshot),
        approval_count_hash: countHash,
        review_acknowledged: true,
        server_total_items: calcResult.totalItems,
        server_total_quantity: calcResult.totalQty,
        server_total_value: calcResult.totalValue,
      });

      console.log(`[CANONICAL APPROVAL] APPROVED user=${approverEmail} role=${roleKey} session=${session_id} items=${calcResult.totalItems} qty=${calcResult.totalQty} value=${calcResult.totalValue}`);

      // ─── Complete approval task (find by dedup key) ───
      const approverIdentity = await resolveApproverIdentity(base44, user, approverEmail);
      const taskResult = await completeApprovalTask(base44, session_id, approverEmail, now);

      // ─── Resolve all approval notifications ───
      const notifResult = await resolveApprovalNotifications(base44, session_id, approverEmail, approverIdentity, 'approved', 'Warehouse opening count approved', 'inventory_count_session', session_id, now);

      // ─── Create ONE approval-completed notification ───
      const completedNotif = await createApprovalCompletedNotification(base44, updatedSession, approverEmail, now);

      return Response.json({
        success: true,
        already_approved: false,
        reconciled: false,
        session: updatedSession,
        task: taskResult.task,
        notifications: { resolved: notifResult.resolved, created: completedNotif },
        server_calculated: {
          item_count: calcResult.totalItems,
          total_quantity: calcResult.totalQty,
          total_value: calcResult.totalValue,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RETURN FOR CORRECTION
    // ═══════════════════════════════════════════════════════════════
    if (decision === 'return_for_correction') {
      if (!['awaiting_review', 'approved'].includes(session.status)) {
        return Response.json({ error: `Session must be awaiting review or approved to return for correction (current: ${session.status})` }, { status: 400 });
      }

      const returnCount = (session.return_count || 0) + 1;

      // ─── Return session to in_progress (preserve items, bins, counts, evidence) ───
      const updatedSession = await base44.asServiceRole.entities.InventoryCountSession.update(session_id, {
        status: 'in_progress',
        approved_by: null,
        approved_at: null,
        approval_snapshot_json: null,
        approval_count_hash: null,
        submitted_by: null,
        submitted_at: null,
        review_acknowledged: false,
        server_total_items: 0,
        server_total_quantity: 0,
        server_total_value: 0,
        return_reason: reason,
        return_count: returnCount,
        returned_by: approverEmail,
        returned_at: now,
        notes: (session.notes || '') + `\n[Returned for correction #${returnCount} by ${approverEmail}: ${reason}]`,
      });

      console.log(`[CANONICAL APPROVAL] RETURNED user=${approverEmail} role=${roleKey} session=${session_id} return_count=${returnCount}`);

      // ─── Complete/supersede the approval task ───
      const tasks = await findApprovalTasks(base44, session_id);
      for (const task of tasks) {
        if (['Completed', 'Canceled', 'Cancelled'].includes(task.status)) continue;
        const approvalHistory = (() => { try { return JSON.parse(task.approval_history || '[]'); } catch { return []; } })();
        approvalHistory.push({ action: 'Changes Requested', approver: approverEmail, notes: reason, timestamp: now });
        await base44.asServiceRole.entities.EnterpriseTask.update(task.id, {
          status: 'Changes Requested',
          approval_status: 'Changes Requested',
          approval_notes: reason,
          updated_by: approverEmail,
          approval_history: JSON.stringify(approvalHistory),
        });
      }

      // ─── Resolve approval notifications ───
      const approverIdentity = await resolveApproverIdentity(base44, user, approverEmail);
      const notifResult = await resolveApprovalNotifications(base44, session_id, approverEmail, approverIdentity, 'returned_for_correction', 'Warehouse opening count returned for correction', 'inventory_count_session', session_id, now);

      // ─── Create correction task + notification for submitter ───
      const correctionResult = await createCorrectionHandoff(base44, updatedSession, approverEmail, reason);

      return Response.json({
        success: true,
        session: updatedSession,
        notifications: { resolved: notifResult.resolved, correction_created: !!correctionResult.correctionTask },
        correction_task: correctionResult.correctionTask,
      });
    }
  } catch (error) {
    console.error(`[CANONICAL APPROVAL] ERROR: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});